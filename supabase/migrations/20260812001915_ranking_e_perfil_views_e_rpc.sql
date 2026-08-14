
-- Ranking de POKEs: todos os pokes de todos os jogadores (a policy "pokemon
-- leitura publica" ja cobre isso), com nome do dono ATUAL embutido. Client
-- escolhe o criterio via .order() na coluna certa -- sem view por criterio.
create view dev.ranking_pokemon with (security_invoker = true) as
select pi.*, t.trainer_name as treinador
from dev.pokemon_instances pi
join dev.treinadores_publico t on t.user_id = pi.user_id;

revoke all on dev.ranking_pokemon from public;
grant select on dev.ranking_pokemon to authenticated;

-- Perfil: rank/total (window function sobre a view publica de treinadores),
-- tempo jogado (soma de game_sessions do proprio usuario) e data do Hall da
-- Fama -- tudo dado que precisa agregar ou contar OUTRAS linhas, RLS de
-- 'players'/'game_sessions' sozinha nao da conta (so a propria linha).
create or replace function dev.meu_perfil()
returns jsonb
language plpgsql security definer set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_rank int;
  v_total int;
  v_segundos numeric;
  v_hall timestamptz;
  v_criado timestamptz;
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode = '28000'; end if;

  select x.rank, x.total into v_rank, v_total from (
    select user_id,
      row_number() over (order by trainer_level desc, trainer_exp desc) as rank,
      count(*) over () as total
    from dev.treinadores_publico
  ) x where x.user_id = v_user_id;

  select coalesce(sum(simulated_seconds), 0) into v_segundos from dev.game_sessions where user_id = v_user_id;
  select conquistado_em into v_hall from dev.hall_da_fama where user_id = v_user_id limit 1;
  select created_at into v_criado from dev.players where user_id = v_user_id;

  return jsonb_build_object(
    'rank', coalesce(v_rank, 0),
    'totalJogadores', coalesce(v_total, 0),
    'segundosJogados', v_segundos,
    'contaCriadaEm', v_criado,
    'noHallDaFama', v_hall
  );
end;
$$;

revoke all on function dev.meu_perfil() from public;
grant execute on function dev.meu_perfil() to authenticated;
