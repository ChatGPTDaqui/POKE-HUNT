-- Gemeo dev de 20260914120000_pvp_bots_public.sql.

create table if not exists dev.pvp_bots (
  user_id uuid primary key references dev.players(user_id) on delete cascade,
  criado_em timestamptz not null default now()
);

alter table dev.pvp_bots enable row level security;
drop policy if exists "pvp_bots leitura publica" on dev.pvp_bots;
create policy "pvp_bots leitura publica" on dev.pvp_bots
  for select to authenticated
  using (true);
grant select on dev.pvp_bots to authenticated;
grant select, insert, update, delete on dev.pvp_bots to service_role;

alter table dev.pvp_sessao drop constraint if exists pvp_sessao_modo_check;
alter table dev.pvp_sessao
  add constraint pvp_sessao_modo_check check (modo in ('amistoso', 'ranqueado', 'ranqueado_bot'));

alter table dev.pvp_historico drop constraint if exists pvp_historico_modo_check;
alter table dev.pvp_historico
  add constraint pvp_historico_modo_check check (modo in ('amistoso', 'ranqueado', 'ranqueado_bot'));

-- Coluna nova no fim: `create or replace view` exige as existentes na mesma ordem.
create or replace view dev.treinadores_publico as
  select p.user_id, p.trainer_name, p.trainer_level, p.trainer_exp,
         exists (select 1 from dev.pvp_bots b where b.user_id = p.user_id) as eh_bot
  from dev.players p;

create or replace view dev.ranking_pokemon as
with elegivel as (
  select pi.id, pi.level,
         pi.stat_hp, pi.stat_atk_fis, pi.stat_atk_esp,
         pi.stat_def, pi.stat_def_esp, pi.stat_speed
  from dev.pokemon_instances pi
  join dev.treinadores_publico t on t.user_id = pi.user_id and not t.eh_bot
),
top as (
      select id from (select id from elegivel order by level         desc nulls last limit 50) t_level
  union select id from (select id from elegivel order by stat_hp      desc nulls last limit 50) t_hp
  union select id from (select id from elegivel order by stat_atk_fis desc nulls last limit 50) t_atk_fis
  union select id from (select id from elegivel order by stat_atk_esp desc nulls last limit 50) t_atk_esp
  union select id from (select id from elegivel order by stat_def     desc nulls last limit 50) t_def
  union select id from (select id from elegivel order by stat_def_esp desc nulls last limit 50) t_def_esp
  union select id from (select id from elegivel order by stat_speed   desc nulls last limit 50) t_speed
)
select
  pi.id, pi.user_id, pi.species_id, pi.level, pi.exp, pi.hp,
  pi.is_shiny, pi.rarity,
  pi.iv_hp, pi.iv_atk_fis, pi.iv_atk_esp, pi.iv_def, pi.iv_def_esp, pi.iv_speed,
  pi.stat_hp, pi.stat_atk_fis, pi.stat_atk_esp, pi.stat_def, pi.stat_def_esp, pi.stat_speed,
  pi.unlocked_abilities, pi.disabled_abilities,
  pi.locked, pi.location, pi.team_slot,
  pi.original_trainer, pi.created_at, pi.updated_at,
  t.trainer_name as treinador
from dev.pokemon_instances pi
join top on top.id = pi.id
join dev.treinadores_publico t on t.user_id = pi.user_id;

-- Pareamento: primeiro humano na janela de MMR (inalterado); sem humano e com
-- 15s de fila, bot aleatorio. Os 15s existem pra bot nao vencer a corrida
-- contra um humano que entra segundos depois — com fallback instantaneo o
-- ranqueado real nunca aconteceria.
create or replace function dev.tentar_parear_ranqueado()
returns dev.pvp_sessao
language plpgsql
security definer
set search_path to 'dev'
as $function$
declare
  v_eu uuid := auth.uid();
  v_eu_fila dev.pvp_fila;
  v_alvo dev.pvp_fila;
  v_bot uuid;
  v_janela integer;
  v_s dev.pvp_sessao;
begin
  if v_eu is null then raise exception 'sem sessao autenticada'; end if;

  select * into v_eu_fila from dev.pvp_fila where user_id = v_eu;
  if not found then raise exception 'Voce nao esta na fila ranqueada.'; end if;

  v_janela := least(300, 50 + floor(extract(epoch from (now() - v_eu_fila.entrou_em)) / 10) * 25);

  select * into v_alvo
    from dev.pvp_fila
   where user_id <> v_eu
     and abs(mmr - v_eu_fila.mmr) <= v_janela
   order by entrou_em asc
   limit 1
   for update skip locked;

  if found then
    delete from dev.pvp_fila where user_id in (v_eu, v_alvo.user_id);

    insert into dev.pvp_sessao (
      anfitriao_id, convidado_id, estado, modo,
      anfitriao_time, convidado_time,
      anfitriao_pokemon_id, convidado_pokemon_id
    )
    values (
      v_eu, v_alvo.user_id, 'aberta', 'ranqueado',
      dev.pvp_snapshot_time(v_eu), dev.pvp_snapshot_time(v_alvo.user_id),
      null, null
    )
    returning * into v_s;

    update dev.pvp_rank set partidas_hoje = partidas_hoje + 1 where user_id in (v_eu, v_alvo.user_id);

    return v_s;
  end if;

  if extract(epoch from (now() - v_eu_fila.entrou_em)) < 15 then
    return null;
  end if;

  -- Sessao de bot abandonada (jogador fechou antes de resolver) prenderia o
  -- bot ate o fim do prazo por causa do indice unico de convidado vivo.
  update dev.pvp_sessao
     set estado = 'expirada'
   where estado in ('convidada', 'aberta')
     and expira_em <= now()
     and convidado_id in (select user_id from dev.pvp_bots);

  select b.user_id into v_bot
    from dev.pvp_bots b
   where exists (
           select 1 from dev.pvp_time t
            where t.user_id = b.user_id
              and coalesce(array_length(t.pokemon_ids, 1), 0) = 6
         )
     and not exists (
           select 1 from dev.pvp_sessao s
            where s.convidado_id = b.user_id
              and s.estado in ('convidada', 'aberta')
         )
   order by random()
   limit 1;

  if v_bot is null then
    return null;
  end if;

  -- Sub-bloco: se o insert falhar, o delete da fila desfaz junto.
  begin
    delete from dev.pvp_fila where user_id = v_eu;

    insert into dev.pvp_sessao (
      anfitriao_id, convidado_id, estado, modo,
      anfitriao_time, convidado_time,
      anfitriao_pokemon_id, convidado_pokemon_id
    )
    values (
      v_eu, v_bot, 'aberta', 'ranqueado_bot',
      dev.pvp_snapshot_time(v_eu), dev.pvp_snapshot_time(v_bot),
      null, null
    )
    returning * into v_s;
  exception when unique_violation then
    -- Dois jogadores sortearam o mesmo bot no mesmo instante: o jogador
    -- continua na fila e a proxima chamada sorteia de novo.
    return null;
  end;

  return v_s;
end
$function$;

grant execute on function dev.tentar_parear_ranqueado() to authenticated;
