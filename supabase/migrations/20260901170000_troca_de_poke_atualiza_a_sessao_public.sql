-- PH-399: trocar o POKE em campo dentro da hunt fazia o servidor simular o POKE
-- ANTIGO ate o fim da sessao.
--
-- O SINTOMA, medido no `dev` em 2026-09-01. Entrei numa hunt de Faixa III com um
-- Scizor Lv 1, troquei pra um Entei Lv 106 pelo trilho de reservas, matei os 30
-- no cliente — e a sala nao trocou por mais de DEZ MINUTOS, com "Preparando a
-- proxima area..." na tela. O banco explicava:
--
--   game_sessions.poke_uid    -> scizor Lv 1, hp 0   (MORTO)
--   game_sessions.sala_abates -> 0    depois de 703s de simulacao
--   players.active_team_index -> 0
--   pokemon_instances slot 0  -> scizor Lv 1  (o cliente mostrava Entei Lv 106)
--
-- O servidor simulou um POKE morto de nivel 1 por doze minutos: zero abate, zero
-- ouro, zero XP, sala travada.
--
-- A CAUSA. `game_sessions.poke_uid` e quem decide quem o servidor simula, e ele
-- SOBRESCREVE o indice ativo (authority/src/progresso.ts):
--
--   const ativo = estado.team.find((p) => p.uid === sessao.poke_uid)
--   store.setActiveIndex(estado.team.indexOf(ativo))
--
-- E ele era escrito em dois lugares, nenhum deles a troca do jogador:
--
--   1. `/sessao/abrir`, na abertura da sessao;
--   2. cada flush, com quem estava em campo na simulacao DO SERVIDOR no fim da
--      janela — isso existe pro Campeao Lance retomar a sequencia (ver a nota de
--      `p_poke_uid` em progresso.ts).
--
-- `definir_ativo` mexia em `pokemon_instances.team_slot` e
-- `players.active_team_index` e nao tocava em `game_sessions`. Resultado: a troca
-- valia no cliente e no acervo, mas nao na sessao — e nao se autocorrigia, porque
-- o flush seguinte regravava o mesmo uid antigo (a simulacao dele continuava
-- sendo aquele POKE).
--
-- POR QUE A CORRECAO E AQUI, E NAO NO SERVIDOR LENDO `active_team_index`
--
-- Trocar a fonte de verdade pro indice ativo quebraria a retomada do Lance, que
-- e o motivo de `poke_uid` existir: la o POKE em campo muda DENTRO da janela
-- (`autoSwitchTeamOnFaint`) e o indice ativo nao acompanha. As duas fontes sao
-- legitimas e nao competem — o flush grava quem a simulacao deixou em campo, e a
-- troca manual grava a intencao explicita do jogador. O que faltava era a
-- segunda.
--
-- Roda na MESMA transacao da troca, com o advisory lock por usuario ja tomado na
-- primeira linha da funcao — entao nao ha janela entre rotacionar a equipe e
-- apontar a sessao. Sessao fechada (ou inexistente) nao e afetada: o `where`
-- filtra por `closed_at is null`.

CREATE OR REPLACE FUNCTION public.definir_ativo(p_poke_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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

  select team_slot into v_old_slot from public.pokemon_instances
    where id = p_poke_id and user_id = v_user_id and location = 'team';
  if v_old_slot is null then
    raise exception 'indice fora da equipe' using errcode = 'P0001';
  end if;

  set constraints public.one_pokemon_per_team_slot deferred;

  update public.pokemon_instances set team_slot = team_slot + 1
    where user_id = v_user_id and location = 'team' and team_slot < v_old_slot;
  update public.pokemon_instances set team_slot = 0, updated_at = now() where id = p_poke_id;
  update public.players set active_team_index = 0 where user_id = v_user_id;

  -- PH-399: a SESSAO ABERTA passa a apontar pro POKE que acabou de entrar em
  -- campo. Sem esta linha o servidor continua simulando o POKE anterior — ver a
  -- nota do topo deste arquivo.
  update public.game_sessions set poke_uid = p_poke_id
    where user_id = v_user_id and closed_at is null;

  return jsonb_build_object('ok', true);
end;
$function$;
