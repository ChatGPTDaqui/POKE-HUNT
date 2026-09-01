-- PH-399, schema `dev`. Espelho de
-- `20260901170000_troca_de_poke_atualiza_a_sessao_public.sql` — a nota longa com
-- a medicao, a causa e o porque de a correcao ser na RPC (e nao no servidor
-- lendo `active_team_index`) esta la.
--
-- Carimbo N+1, nunca o mesmo do par: prefixo igual e a MESMA versao pro CLI e
-- trava todo deploy.
--
-- Resumo: `definir_ativo` nao tocava em `game_sessions`, entao trocar o POKE em
-- campo dentro da hunt deixava o servidor simulando o POKE antigo ate o fim da
-- sessao — medido no proprio `dev`, um Scizor Lv 1 MORTO simulado por 703
-- segundos com zero abates, enquanto o cliente jogava com um Entei Lv 106 e a
-- sala nunca avancava.

CREATE OR REPLACE FUNCTION dev.definir_ativo(p_poke_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'dev', 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_old_slot smallint;
begin
  -- PH-67: serializa contra outras escritas concorrentes em players do MESMO
  -- usuario (inclusive gravar_progresso/flush). Lock de transacao, libera
  -- sozinho no commit/rollback, sem tabela nova.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));
  if v_user_id is null then raise exception 'nao autenticado' using errcode = '28000'; end if;

  select team_slot into v_old_slot from dev.pokemon_instances
    where id = p_poke_id and user_id = v_user_id and location = 'team';
  if v_old_slot is null then
    raise exception 'indice fora da equipe' using errcode = 'P0001';
  end if;

  set constraints dev.one_pokemon_per_team_slot deferred;

  update dev.pokemon_instances set team_slot = team_slot + 1
    where user_id = v_user_id and location = 'team' and team_slot < v_old_slot;
  update dev.pokemon_instances set team_slot = 0, updated_at = now() where id = p_poke_id;
  update dev.players set active_team_index = 0 where user_id = v_user_id;

  -- PH-399: a SESSAO ABERTA passa a apontar pro POKE que acabou de entrar em
  -- campo.
  update dev.game_sessions set poke_uid = p_poke_id
    where user_id = v_user_id and closed_at is null;

  return jsonb_build_object('ok', true);
end;
$function$;
