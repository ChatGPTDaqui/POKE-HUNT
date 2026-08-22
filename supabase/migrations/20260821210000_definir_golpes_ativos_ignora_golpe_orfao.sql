-- `definir_golpes_ativos` ignora golpe orfao em vez de recusar a chamada
-- ---------------------------------------------------------------------------
-- BUG QUE ISTO CONSERTA: havia POKE com a escolha de golpes TRAVADA — nenhuma
-- edicao passava, nem adicionar nem remover.
--
-- A cadeia:
--
--  1. `pokemon_instances.unlocked_abilities` e derivada de (especie, nivel) e
--     reescrita com o recalculo fresco em todo flush do servidor
--     (src/data/remote/playerMapper.ts#pokeToRow, chamado por
--     authority/src/progresso.ts). Ela sempre reflete o learnset ATUAL.
--  2. `active_abilities` e escolha do jogador e nao era saneada em lugar
--     nenhum, entao continuava com chave que o learnset atual nao tem mais —
--     efeito da regra do Recordador (v6.8: golpe so com nivel real na propria
--     especie) e do rename de 15 chaves na migracao do Ultra Sun.
--  3. Esta funcao valida id por id e levantava excecao no primeiro id
--     desconhecido, abortando a transacao INTEIRA. Como o cliente manda a
--     lista completa a cada edicao, toda tentativa levava a chave orfa junto e
--     era recusada com "esse POKE nao conhece esse golpe" — para um golpe que
--     o jogador nem escolheu, e que a tela nao mostra.
--
-- O QUE MUDA: chave desconhecida e DESCARTADA em silencio em vez de derrubar a
-- chamada. O resto da validacao fica igual — teto de 4, repetido, POKE de
-- outro jogador e hunt aberta continuam recusando.
--
-- POR QUE DESCARTAR E NAO RECUSAR: a recusa punia o jogador por dado velho que
-- ele nao tem como consertar (a chave e invisivel na tela). E descartar nao
-- afrouxa a regra que importa — "so golpe que o POKE conhece" continua valendo
-- para o que e GRAVADO: a lista final passa a ser a interseccao, nunca um
-- golpe a mais.
--
-- O teto de 4 e a checagem de repetido rodam sobre a lista ORIGINAL, de
-- proposito: um payload a mao com 5 golpes (ou com repetido) continua sendo
-- erro do chamador, e nao algo pra "consertar" calado. Quem estava dentro das
-- regras e so carregava lixo historico e que passa.
--
-- Fecha o lado do banco; o lado do cliente e o saneamento na carga em
-- `playerMapper#rowToPoke` (mesma leva) — as duas camadas fazem coisas
-- diferentes: a do cliente conserta a tela e o payload, esta destrava o POKE
-- que ja tem dado sujo gravado.
create or replace function public.definir_golpes_ativos(
  p_poke_id uuid,
  p_ability_ids text[]
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_conhecidos text[];
  v_limpos text[];
  v_ignorados text[];
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode = '28000'; end if;

  if exists (
    select 1 from public.game_sessions s
    where s.user_id = v_user_id
      and s.closed_at is null
      and s.last_flush_at > now() - interval '2 minutes'
  ) then
    raise exception 'Saia da hunt para trocar os golpes.' using errcode = 'P0001';
  end if;

  select unlocked_abilities into v_conhecidos from public.pokemon_instances
    where id = p_poke_id and user_id = v_user_id;
  if not found then
    raise exception 'POKE nao encontrado' using errcode = 'P0001';
  end if;

  if p_ability_ids is null then
    raise exception 'lista de golpes invalida' using errcode = 'P0001';
  end if;
  if coalesce(array_length(p_ability_ids, 1), 0) > 4 then
    raise exception 'no maximo 4 golpes' using errcode = 'P0001';
  end if;
  if coalesce(array_length(p_ability_ids, 1), 0)
     <> (select count(distinct x) from unnest(p_ability_ids) x) then
    raise exception 'golpe repetido' using errcode = 'P0001';
  end if;

  -- Todo POKE tem o Ataque Basico; ele nunca aparece em `unlocked_abilities`.
  -- `aoe50_*` NAO precisa de isencao: ele E gravado em `unlocked_abilities` no
  -- nivel 50, entao a checagem normal ja faz o certo (quem nao chegou ao 50
  -- continua barrado).
  --
  -- `with ordinality` preserva a ORDEM escolhida pelo jogador: ela e a rotacao
  -- de combate (engine/systems/combatSystem.ts#pickAbilityDaFila), nao um
  -- conjunto. Sem o `order by`, o Postgres nao promete ordem nenhuma aqui.
  select
    coalesce(array_agg(x order by n) filter (
      where x = 'basic_attack' or x = any (coalesce(v_conhecidos, array[]::text[]))
    ), array[]::text[]),
    coalesce(array_agg(x order by n) filter (
      where x <> 'basic_attack' and not (x = any (coalesce(v_conhecidos, array[]::text[])))
    ), array[]::text[])
  into v_limpos, v_ignorados
  from unnest(p_ability_ids) with ordinality as t(x, n);

  update public.pokemon_instances
    set active_abilities = v_limpos, updated_at = now()
    where id = p_poke_id;

  -- `ignorados` e observabilidade, nao erro: o cliente nao precisa fazer nada
  -- com isso (a proxima carga ja vem saneada), mas ter o numero na resposta e
  -- o que permite medir quanto dado sujo ainda ha em campo sem abrir o banco.
  return jsonb_build_object('ok', true, 'ignorados', v_ignorados);
end;
$$;
revoke all on function public.definir_golpes_ativos(uuid, text[]) from public;
grant execute on function public.definir_golpes_ativos(uuid, text[]) to authenticated;
