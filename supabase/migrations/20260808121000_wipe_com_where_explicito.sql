-- Corrige `wipe_todos_os_saves()`: a primeira versao usava `delete from <tabela>`
-- e `update players set ...` sem WHERE, e falhava em runtime com
--
--   21000 / "DELETE requires a WHERE clause"
--
-- O motivo nao e o Postgres: e a extensao `safeupdate` (pg_safeupdate), que o
-- Supabase carrega no papel usado pela API REST. Ela exige WHERE em todo
-- DELETE/UPDATE — e vale TAMBEM dentro de uma funcao chamada por RPC, porque
-- quem executa continua sendo aquele papel. `security definer` troca o dono dos
-- privilegios, nao o `session_preload_libraries`.
--
-- Nao da pra descobrir isso por leitura: em `psql` como superusuario a mesma
-- funcao roda. So aparece pelo caminho que o script de wipe realmente usa
-- (POST /rest/v1/rpc/...), que foi como apareceu.
--
-- `where true` satisfaz a extensao sem mudar o alcance (a intencao E apagar tudo).

create or replace function public.wipe_todos_os_saves()
returns table (jogadores_resetados bigint, pokes_apagados bigint, sessoes_fechadas bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  n_pokes bigint;
  n_sessoes bigint;
  n_jogadores bigint;
begin
  with apagados as (
    delete from public.pokemon_instances where true returning 1
  )
  select count(*) into n_pokes from apagados;

  delete from public.player_items where true;
  delete from public.player_pokedex where true;
  delete from public.player_auto_catch_rules where true;

  with fechadas as (
    update public.game_sessions
    set closed_at = now()
    where closed_at is null
    returning 1
  )
  select count(*) into n_sessoes from fechadas;

  -- DEFAULT por coluna em vez de valores repetidos aqui: mudar o ouro inicial
  -- numa migration futura passa a valer no wipe sozinho.
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
    where true
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

-- `create or replace` NAO preserva os grants revogados da versao anterior de
-- forma obvia — repetir e o que garante que uma funcao capaz de apagar o banco
-- inteiro nunca fique chamavel com a anon key que vai no bundle do jogo.
revoke all on function public.wipe_todos_os_saves() from public;
revoke all on function public.wipe_todos_os_saves() from anon;
revoke all on function public.wipe_todos_os_saves() from authenticated;
grant execute on function public.wipe_todos_os_saves() to service_role;
