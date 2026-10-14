-- Conquistas, fundacao — schema __S__ (14/10/2026).
--
-- Spec: vault 01-Projetos/novo-poke-idle/specs/2026-10-14-conquistas-design.md
-- (aprovado pelo dono). Este arquivo foi gerado de
-- scripts/conquistas/molde-fundacao.sql por scripts/conquistas/gerar-fundacao.mjs;
-- o par do outro schema sai do mesmo molde. O CATALOGO (as linhas de
-- conquista_catalogo) vem numa migration propria, gerada de src/data/conquistas.ts.
--
-- REGRAS DE PRODUTO que este SQL garante:
--  * merito proprio: POKE so conta com `origem` em captura/inicial/recompensa
--    (migration 20261014120000) — comprado/trocado nunca desbloqueia;
--  * permanente: `player_conquistas` so recebe INSERT, nunca DELETE;
--  * retroativo so o merito garantido: a avaliacao de lancamento le metricas que
--    ja existem (abates, biomas, PvP, nivel...). Posse de POKE antigo (origem
--    desconhecida) e contadores novos comecam do zero, sem regra especial.
--  * platina = todas as bronze/prata/ouro, secretas incluidas; impossiveis fora.
begin;

create table if not exists __S__.conquista_catalogo (
  id text primary key,
  categoria text not null,
  nivel text not null check (nivel in ('bronze', 'prata', 'ouro', 'impossivel', 'platina')),
  pontos integer not null check (pontos >= 0),
  secreta boolean not null default false,
  ordem integer not null,
  regra jsonb not null
);

create table if not exists __S__.player_contador (
  user_id uuid not null references __S__.players(user_id) on delete cascade,
  chave text not null,
  valor bigint not null default 0,
  primary key (user_id, chave)
);

create table if not exists __S__.player_conquistas (
  user_id uuid not null references __S__.players(user_id) on delete cascade,
  -- SEM cascade de proposito: conquista e permanente. Tirar do catalogo uma
  -- conquista que alguem ja tem faz a migration do catalogo FALHAR, e isso e o
  -- aviso: a decisao de apagar desbloqueio tem que ser explicita.
  conquista_id text not null references __S__.conquista_catalogo(id),
  conquistado_em timestamptz not null default now(),
  primary key (user_id, conquista_id)
);

-- Quais habilidades sao a OCULTA de cada especie (a de 5%). Vem do mesmo
-- gerador do catalogo; especie cuja unica opcao e a oculta fica de fora, porque
-- ali ela nao e rara.
create table if not exists __S__.especie_traco_oculto (
  species_id text primary key,
  trait text not null
);

alter table __S__.conquista_catalogo enable row level security;
alter table __S__.player_contador enable row level security;
alter table __S__.player_conquistas enable row level security;
alter table __S__.especie_traco_oculto enable row level security;

drop policy if exists "catalogo de conquistas e publico" on __S__.conquista_catalogo;
create policy "catalogo de conquistas e publico" on __S__.conquista_catalogo
  for select to authenticated using (true);
drop policy if exists "contador leitura propria" on __S__.player_contador;
create policy "contador leitura propria" on __S__.player_contador
  for select to authenticated using (user_id = (select auth.uid()));
-- Conquistas sao publicas de proposito: perfil e ranking mostram as de outros.
drop policy if exists "conquistas leitura publica" on __S__.player_conquistas;
create policy "conquistas leitura publica" on __S__.player_conquistas
  for select to authenticated using (true);
drop policy if exists "traco oculto e publico" on __S__.especie_traco_oculto;
create policy "traco oculto e publico" on __S__.especie_traco_oculto
  for select to authenticated using (true);

-- Escrita so por funcao security definer: sem grant de insert/update/delete.
revoke insert, update, delete on __S__.conquista_catalogo, __S__.player_contador,
  __S__.player_conquistas, __S__.especie_traco_oculto from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Contadores
-- ---------------------------------------------------------------------------

-- Soma um lote de contadores: {"captura:pidgey": 2, "ouro_caca": 340}.
-- Ignora chave vazia e delta nao positivo (contador so cresce).
create or replace function __S__.somar_contadores(p_user uuid, p_deltas jsonb)
returns void
language plpgsql
security definer
set search_path = __SP__
as $$
begin
  if p_deltas is null or jsonb_typeof(p_deltas) <> 'object' then
    return;
  end if;
  insert into __S__.player_contador (user_id, chave, valor)
  select p_user, d.key, floor((d.value #>> '{}')::numeric)::bigint
  from jsonb_each(p_deltas) d
  where d.key <> ''
    and jsonb_typeof(d.value) = 'number'
    and (d.value #>> '{}')::numeric >= 1
  on conflict (user_id, chave) do update
    set valor = __S__.player_contador.valor + excluded.valor;
end;
$$;

revoke all on function __S__.somar_contadores(uuid, jsonb) from public, anon, authenticated;

-- Evolucao conta por trigger, e nao em cada RPC: pega `evoluir_poke` e qualquer
-- outro caminho que troque a especie. So POKE de merito proprio conta.
create or replace function __S__.contar_evolucao()
returns trigger
language plpgsql
security definer
set search_path = __SP__
as $$
begin
  if new.species_id is distinct from old.species_id
     and new.user_id = old.user_id
     and new.origem in ('captura', 'inicial', 'recompensa') then
    perform __S__.somar_contadores(new.user_id, jsonb_build_object(
      'evolucao_total', 1,
      'evolucao:' || new.species_id, 1
    ));
  end if;
  return null;
exception when others then
  -- Contar conquista nunca pode desfazer a evolucao.
  return null;
end;
$$;

revoke all on function __S__.contar_evolucao() from public, anon, authenticated;

drop trigger if exists contar_evolucao on __S__.pokemon_instances;
create trigger contar_evolucao after update of species_id on __S__.pokemon_instances
  for each row execute function __S__.contar_evolucao();

-- ---------------------------------------------------------------------------
-- Avaliacao
-- ---------------------------------------------------------------------------

-- Ordem das raridades e das divisoes: as mesmas listas de src/data/rarity.ts
-- (RARITY_ORDER) e authority/src/pvpElo.ts (ESCADA_DIVISOES).
create or replace function __S__.poke_satisfaz(
  p_species text, p_shiny boolean, p_rarity text, p_level integer,
  p_ivs integer[], p_nature text, p_trait text, p_filtro jsonb
)
returns boolean
language plpgsql
stable
set search_path = __SP__
as $$
declare
  ordem_raridade text[] := array['comum', 'incomum', 'raro', 'ultra', 'legendary', 'mythic'];
  perfeitos integer;
begin
  if p_filtro is null then
    return true;
  end if;
  if p_filtro ? 'especies'
     and not (p_species = any (array(select jsonb_array_elements_text(p_filtro->'especies')))) then
    return false;
  end if;
  if p_filtro ? 'shiny' and p_shiny is distinct from (p_filtro->>'shiny')::boolean then
    return false;
  end if;
  if p_filtro ? 'raridade_min'
     and coalesce(array_position(ordem_raridade, p_rarity), 0)
         < array_position(ordem_raridade, p_filtro->>'raridade_min') then
    return false;
  end if;
  if p_filtro ? 'raridade' and p_rarity is distinct from p_filtro->>'raridade' then
    return false;
  end if;
  if p_filtro ? 'nivel_min' and p_level < (p_filtro->>'nivel_min')::integer then
    return false;
  end if;
  if p_filtro ? 'nivel_max' and p_level > (p_filtro->>'nivel_max')::integer then
    return false;
  end if;
  if p_filtro ? 'ivs31_min' then
    select count(*) into perfeitos from unnest(p_ivs) iv where iv >= 31;
    if perfeitos < (p_filtro->>'ivs31_min')::integer then
      return false;
    end if;
  end if;
  if (p_filtro->>'ivs_zero')::boolean is true
     and exists (select 1 from unnest(p_ivs) iv where iv <> 0) then
    return false;
  end if;
  if p_filtro ? 'iv_vel_min' and coalesce(p_ivs[6], 0) < (p_filtro->>'iv_vel_min')::integer then
    return false;
  end if;
  if p_filtro ? 'natureza' and p_nature is distinct from p_filtro->>'natureza' then
    return false;
  end if;
  if (p_filtro->>'oculto')::boolean is true
     and not exists (select 1 from __S__.especie_traco_oculto o
                     where o.species_id = p_species and o.trait = p_trait) then
    return false;
  end if;
  if p_filtro ? 'tipo'
     and not exists (select 1 from __S__.species s
                     where s.id = p_species
                       and (s.type1::text = p_filtro->>'tipo' or s.type2::text = p_filtro->>'tipo')) then
    return false;
  end if;
  return true;
end;
$$;

-- Valor atual de uma regra (o que a barra de progresso mostra).
create or replace function __S__.conquista_valor(p_user uuid, p_regra jsonb)
returns numeric
language plpgsql
stable
security definer
set search_path = __SP__
as $$
declare
  t text := p_regra->>'t';
  m text := p_regra->>'m';
  especies text[] := case when p_regra ? 'especies'
    then array(select jsonb_array_elements_text(p_regra->'especies')) end;
  filtro jsonb := p_regra->'f';
  so_time boolean := coalesce((p_regra->>'time')::boolean, false);
  escada text[] := array['bronze_1', 'bronze_2', 'bronze_3', 'prata_1', 'prata_2', 'prata_3',
    'ouro_1', 'ouro_2', 'ouro_3', 'platina_1', 'platina_2', 'platina_3',
    'diamante_1', 'diamante_2', 'diamante_3', 'mestre'];
  v numeric := 0;
begin
  if t = 'contador' then
    select coalesce(max(c.valor), 0) into v from __S__.player_contador c
      where c.user_id = p_user and c.chave = p_regra->>'chave';

  elsif t = 'contadores' then
    select coalesce(sum(c.valor), 0) into v from __S__.player_contador c
      where c.user_id = p_user
        and c.chave = any (array(select jsonb_array_elements_text(p_regra->'chaves')));

  elsif t = 'abates' then
    select coalesce(sum(d.normal_kills + d.shiny_kills), 0) into v
      from __S__.player_pokedex d
      left join __S__.species s on s.id = d.species_id
      where d.user_id = p_user
        and (especies is null or d.species_id = any (especies))
        and (not p_regra ? 'tipo' or s.type1::text = p_regra->>'tipo' or s.type2::text = p_regra->>'tipo');

  elsif t = 'abates_tipos' then
    -- Quantos dos tipos pedidos ja passaram de `alvo_cada` abates.
    select count(*) into v from (
      select x.tipo
      from jsonb_array_elements_text(p_regra->'tipos') x(tipo)
      where (
        select coalesce(sum(d.normal_kills + d.shiny_kills), 0)
        from __S__.player_pokedex d join __S__.species s on s.id = d.species_id
        where d.user_id = p_user and (s.type1::text = x.tipo or s.type2::text = x.tipo)
      ) >= (p_regra->>'alvo_cada')::numeric
    ) q;

  elsif t = 'contadores_todos' then
    -- Quantas das chaves pedidas ja passaram de `alvo_cada`.
    select count(*) into v from __S__.player_contador c
      where c.user_id = p_user
        and c.chave = any (array(select jsonb_array_elements_text(p_regra->'chaves')))
        and c.valor >= (p_regra->>'alvo_cada')::numeric;

  elsif t = 'abates_shiny' then
    select coalesce(sum(d.shiny_kills), 0) into v from __S__.player_pokedex d where d.user_id = p_user;

  elsif t = 'posse' or t = 'time' then
    select count(*) into v from __S__.pokemon_instances p
      where p.user_id = p_user
        and p.origem in ('captura', 'inicial', 'recompensa')
        and (t = 'posse' or p.location::text = 'team')
        and __S__.poke_satisfaz(p.species_id, p.is_shiny, p.rarity::text, p.level,
              array[p.iv_hp, p.iv_atk_fis, p.iv_atk_esp, p.iv_def, p.iv_def_esp, p.iv_speed],
              p.nature, p.trait, filtro);

  elsif t = 'conjunto' then
    select count(distinct p.species_id) into v from __S__.pokemon_instances p
      where p.user_id = p_user
        and p.origem in ('captura', 'inicial', 'recompensa')
        and (not so_time or p.location::text = 'team')
        and p.species_id = any (especies);

  elsif t = 'colecao' then
    if p_regra->>'de' = 'registradas' then
      select count(distinct d.species_id) into v from __S__.player_pokedex d
        where d.user_id = p_user and d.normal_kills + d.shiny_kills > 0
          and (especies is null or d.species_id = any (especies));
    elsif p_regra->>'de' = 'possuidas' then
      select count(distinct p.species_id) into v from __S__.pokemon_instances p
        where p.user_id = p_user and p.origem in ('captura', 'inicial', 'recompensa')
          and (especies is null or p.species_id = any (especies))
          and __S__.poke_satisfaz(p.species_id, p.is_shiny, p.rarity::text, p.level,
                array[p.iv_hp, p.iv_atk_fis, p.iv_atk_esp, p.iv_def, p.iv_def_esp, p.iv_speed],
                p.nature, p.trait, filtro);
    elsif p_regra->>'de' = 'naturezas' then
      select count(distinct p.nature) into v from __S__.pokemon_instances p
        where p.user_id = p_user and p.origem in ('captura', 'inicial', 'recompensa')
          and p.nature is not null;
    elsif p_regra->>'de' = 'tipos' then
      select count(distinct x.tipo) into v from (
        select s.type1::text as tipo from __S__.pokemon_instances p
          join __S__.species s on s.id = p.species_id
          where p.user_id = p_user and p.origem in ('captura', 'inicial', 'recompensa')
        union
        select s.type2::text from __S__.pokemon_instances p
          join __S__.species s on s.id = p.species_id
          where p.user_id = p_user and p.origem in ('captura', 'inicial', 'recompensa')
            and s.type2 is not null
      ) x;
    end if;

  elsif t = 'metrica' then
    if m = 'nivel_treinador' then
      select coalesce(max(trainer_level), 0) into v from __S__.players where user_id = p_user;
    elsif m = 'pvp_vitorias' then
      select coalesce(max(vitorias), 0) into v from __S__.pvp_rank where user_id = p_user;
    elsif m = 'pvp_derrotas' then
      select coalesce(max(derrotas), 0) into v from __S__.pvp_rank where user_id = p_user;
    elsif m = 'pvp_divisao' then
      select coalesce(max(array_position(escada, divisao)), 0) into v from __S__.pvp_rank where user_id = p_user;
    elsif m = 'amigos' then
      select count(*) into v from __S__.friendships where user_id = p_user;
    elsif m = 'trocas' then
      select count(*) into v from __S__.troca_log where anfitriao_id = p_user or convidado_id = p_user;
    elsif m = 'vendas_mercado' then
      select count(*) into v from __S__.market_trades where seller_id = p_user;
    elsif m = 'especialidades_max' then
      select count(*) into v from __S__.player_especialidades
        where user_id = p_user and dano_nivel >= 5 and defesa_nivel >= 5;
    elsif m = 'especialidade_niveis' then
      select coalesce(sum(dano_nivel + defesa_nivel), 0) into v from __S__.player_especialidades
        where user_id = p_user;
    elsif m = 'tms' then
      select coalesce(sum(coalesce(cardinality(golpes_de_maquina), 0)), 0) into v
        from __S__.pokemon_instances
        where user_id = p_user and origem in ('captura', 'inicial', 'recompensa');
    elsif m = 'diario_logins' then
      select count(*) into v from __S__.player_diario where user_id = p_user and 'login' = any (coletados);
    elsif m = 'dias_jogados' then
      select count(*) into v from __S__.player_diario where user_id = p_user;
    elsif m = 'lance' then
      select count(*) into v from __S__.hall_da_fama where user_id = p_user and conquista = 'boss_lance';
    elsif m = 'biomas_estagio' then
      select count(*) into v from __S__.players pl, jsonb_each_text(coalesce(pl.bioma_progress, '{}'::jsonb)) b
        where pl.user_id = p_user and b.key not like 'nightmare\_%'
          and b.value ~ '^[0-9]+$' and b.value::integer >= (p_regra->>'arg')::integer;
    elsif m = 'pesadelo_estagio' then
      select count(*) into v from __S__.players pl, jsonb_each_text(coalesce(pl.bioma_progress, '{}'::jsonb)) b
        where pl.user_id = p_user and b.key like 'nightmare\_%'
          and b.value ~ '^[0-9]+$' and b.value::integer >= (p_regra->>'arg')::integer;
    elsif m = 'estagio_do_bioma' then
      select coalesce(max(case when (pl.bioma_progress->>(p_regra->>'arg')) ~ '^[0-9]+$'
        then (pl.bioma_progress->>(p_regra->>'arg'))::integer end), 0) into v
        from __S__.players pl where pl.user_id = p_user;
    elsif m = 'conquistas' then
      select count(*) into v from __S__.player_conquistas where user_id = p_user;
    end if;

  elsif t = 'platina' then
    select count(*) into v from __S__.player_conquistas pc
      join __S__.conquista_catalogo c on c.id = pc.conquista_id
      where pc.user_id = p_user and c.nivel in ('bronze', 'prata', 'ouro');
  end if;

  return coalesce(v, 0);
end;
$$;

-- Alvo de uma regra.
create or replace function __S__.conquista_alvo(p_regra jsonb)
returns numeric
language sql
stable
set search_path = __SP__
as $$
  select case
    when p_regra->>'t' = 'platina' then
      (select count(*) from __S__.conquista_catalogo where nivel in ('bronze', 'prata', 'ouro'))::numeric
    when p_regra->>'t' = 'conjunto' then jsonb_array_length(p_regra->'especies')::numeric
    when p_regra->>'t' = 'abates_tipos' then jsonb_array_length(p_regra->'tipos')::numeric
    when p_regra->>'t' = 'contadores_todos' then jsonb_array_length(p_regra->'chaves')::numeric
    else coalesce((p_regra->>'alvo')::numeric, (p_regra->>'qtd')::numeric, 1)
  end
$$;

-- Avalia tudo que o jogador ainda nao tem e grava o que fechou. Devolve os ids
-- novos (o cliente mostra a celebracao). A platina e avaliada por ultimo, ja
-- contando o que fechou nesta mesma chamada.
create or replace function __S__.avaliar_conquistas(p_user uuid)
returns text[]
language plpgsql
security definer
set search_path = __SP__
as $$
declare
  c record;
  novas text[] := '{}';
  gravada text;
begin
  for c in
    select k.id, k.regra from __S__.conquista_catalogo k
    where k.nivel <> 'platina'
      and not exists (select 1 from __S__.player_conquistas pc
                      where pc.user_id = p_user and pc.conquista_id = k.id)
    order by k.ordem
  loop
    if __S__.conquista_valor(p_user, c.regra) >= __S__.conquista_alvo(c.regra) then
      insert into __S__.player_conquistas (user_id, conquista_id) values (p_user, c.id)
        on conflict do nothing
        returning conquista_id into gravada;
      if gravada is not null then
        novas := novas || gravada;
        gravada := null;
      end if;
    end if;
  end loop;

  for c in
    select k.id, k.regra from __S__.conquista_catalogo k
    where k.nivel = 'platina'
      and not exists (select 1 from __S__.player_conquistas pc
                      where pc.user_id = p_user and pc.conquista_id = k.id)
  loop
    if __S__.conquista_valor(p_user, c.regra) >= __S__.conquista_alvo(c.regra) then
      insert into __S__.player_conquistas (user_id, conquista_id) values (p_user, c.id)
        on conflict do nothing
        returning conquista_id into gravada;
      if gravada is not null then
        novas := novas || gravada;
        gravada := null;
      end if;
    end if;
  end loop;

  return novas;
end;
$$;

revoke all on function __S__.avaliar_conquistas(uuid) from public, anon, authenticated;
revoke all on function __S__.conquista_valor(uuid, jsonb) from public, anon, authenticated;

-- Servidor de sessoes, depois do flush: soma o que a janela produziu e avalia.
-- So service_role (o jogador nao escolhe os proprios contadores).
create or replace function __S__.registrar_conquistas_do_flush(p_user uuid, p_contadores jsonb)
returns text[]
language plpgsql
security definer
set search_path = __SP__
as $$
begin
  perform __S__.somar_contadores(p_user, p_contadores);
  return __S__.avaliar_conquistas(p_user);
end;
$$;

revoke all on function __S__.registrar_conquistas_do_flush(uuid, jsonb) from public, anon, authenticated;
grant execute on function __S__.registrar_conquistas_do_flush(uuid, jsonb) to service_role;

-- Tela de Conquistas: avalia (pega o que mudou fora do flush — PvP, troca,
-- Especialidades, Diario) e devolve o que o jogador tem e o progresso do resto.
create or replace function __S__.minhas_conquistas()
returns jsonb
language plpgsql
security definer
set search_path = __SP__
as $$
declare
  v_user uuid := auth.uid();
  novas text[];
begin
  if v_user is null then
    raise exception 'sem sessao' using errcode = '28000';
  end if;
  novas := __S__.avaliar_conquistas(v_user);
  return jsonb_build_object(
    'novas', to_jsonb(novas),
    'desbloqueadas', coalesce((
      select jsonb_object_agg(pc.conquista_id, pc.conquistado_em)
      from __S__.player_conquistas pc where pc.user_id = v_user
    ), '{}'::jsonb),
    'progresso', coalesce((
      select jsonb_object_agg(k.id, __S__.conquista_valor(v_user, k.regra))
      from __S__.conquista_catalogo k
      where not exists (select 1 from __S__.player_conquistas pc
                        where pc.user_id = v_user and pc.conquista_id = k.id)
    ), '{}'::jsonb)
  );
end;
$$;

revoke all on function __S__.minhas_conquistas() from public, anon;
grant execute on function __S__.minhas_conquistas() to authenticated;

commit;
