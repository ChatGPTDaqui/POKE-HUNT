-- Rotina de wipe: TODO jogador volta ao estado de conta nova.
--
-- Por que uma funcao no banco e nao uma sequencia de DELETEs no script:
--
-- 1. ATOMICIDADE. Um wipe pela metade (POKEs apagados, ouro intacto, sessao de
--    hunt ainda aberta apontando pro POKE que acabou de sumir) e pior que nao
--    apagar nada. Uma funcao roda numa transacao so: ou tudo, ou nada.
--
-- 2. UMA FONTE DE VERDADE PRO ESTADO INICIAL. A concessao inicial (10.000 de
--    cada consumivel vendavel, hunts sem custo liberadas) ja e definida por
--    `handle_new_user`/`hunts_iniciais()`. O wipe reusa as MESMAS regras — nao
--    reescreve a lista. Item novo no catalogo, ou hunt nova sem custo, passa a
--    valer no wipe sozinho.
--
-- 3. A LINHA DE `players` NAO E APAGADA, e RESETADA. `handle_new_user` so
--    dispara em `auth.users` novo; apagar a linha deixaria toda conta EXISTENTE
--    sem linha em `players`, e `carregarEstado` responde 404 "jogador sem linha
--    em `players`" nesse caso — ou seja, o jogo simplesmente nao abriria mais
--    pra ninguem. Resetar mantem a conta e o login, zerando so o progresso.
--
-- As sessoes de hunt abertas TAMBEM sao fechadas. Elas guardam `poke_uid`, e um
-- POKE apagado deixaria a sessao insimulavel — o servidor se cura disso hoje
-- (ver aplicarFlush), mas deixar lixo consistente e melhor que confiar no
-- remendo.

create or replace function public.wipe_todos_os_saves()
returns table (jogadores_resetados bigint, pokes_apagados bigint, sessoes_fechadas bigint)
language plpgsql
security definer
-- search_path travado: obrigatorio em SECURITY DEFINER, senao um search_path
-- herdado do chamador vira vetor de escalonamento de privilegio.
set search_path = ''
as $$
declare
  n_pokes bigint;
  n_sessoes bigint;
  n_jogadores bigint;
begin
  with apagados as (
    delete from public.pokemon_instances returning 1
  )
  select count(*) into n_pokes from apagados;

  delete from public.player_items;
  delete from public.player_pokedex;
  delete from public.player_auto_catch_rules;

  with fechadas as (
    update public.game_sessions
    set closed_at = now()
    where closed_at is null
    returning 1
  )
  select count(*) into n_sessoes from fechadas;

  -- Volta cada coluna de progresso ao DEFAULT declarado no schema, em vez de
  -- repetir os valores aqui: mudar o ouro inicial numa migration futura passa a
  -- valer no wipe sem ninguem lembrar de vir editar esta funcao.
  with resetados as (
    update public.players
    set trainer_name = default,
        trainer_level = default,
        trainer_exp = default,
        gold = default,
        diamonds = default,
        active_team_index = default,
        current_map_id = null,
        unlocked_maps = public.hunts_iniciais(),
        unlocked_continents = default,
        auto_toggles = default,
        auto_pot_rules = default,
        auto_catch_config = default,
        perf_stats = default,
        updated_at = now()
    returning 1
  )
  select count(*) into n_jogadores from resetados;

  -- Mesma concessao inicial de `handle_new_user`.
  insert into public.player_items (user_id, item_id, quantity)
  select p.user_id, i.id, 10000
  from public.players p
  cross join public.items i
  where i.kind in ('ball', 'potion', 'revive');

  return query select n_jogadores, n_pokes, n_sessoes;
end;
$$;

-- CRITICO: `create function` sai com EXECUTE pra `public`, e toda funcao no
-- schema `public` e chamavel por RPC (`POST /rest/v1/rpc/<nome>`) com a anon key
-- que vai no bundle do jogo. Sem este revoke, QUALQUER visitante apagaria o
-- progresso de todos os jogadores com um fetch. So a service_role (que nunca sai
-- do servidor) pode chamar.
revoke all on function public.wipe_todos_os_saves() from public;
revoke all on function public.wipe_todos_os_saves() from anon;
revoke all on function public.wipe_todos_os_saves() from authenticated;
grant execute on function public.wipe_todos_os_saves() to service_role;
