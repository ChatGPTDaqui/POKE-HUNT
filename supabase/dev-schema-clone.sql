-- GERADO por scripts/clone-schema-to-dev.js -- nao editar a mao
begin;
create schema if not exists dev;
set local search_path to dev, extensions, public;

-- ==== 20260806201818_initial_schema.sql ====
-- NOVO POKE IDLE — schema Postgres (Supabase)
-- Consolida SPEC-supabase-migration.md (secoes 3, 6, 7) num migration unico e executavel.
-- Rodar no SQL Editor do Supabase (ou como migration file), uma vez, em ordem.
--
-- Revisado contra as referencias de Postgres/Supabase do vault
-- (05-Skills/supabase-references/: security-rls-performance, security-rls-basics,
-- security-privileges, schema-foreign-key-indexes) + docs oficiais. Correcoes
-- aplicadas em relacao ao primeiro rascunho estao marcadas com "FIX:".
--
-- Convencoes:
--   - snake_case, PK uuid (gen_random_uuid()) exceto onde ha PK natural.
--   - RLS habilitado em TODA tabela. Catalogo: SELECT publico, zero policy de escrita.
--     Progresso: dono do proprio user_id le/escreve; admin le tudo; escrita de suporte
--     (grant/ban) vive numa Edge Function com service_role (SPEC 7.1) — por isso nao
--     existe policy "admin escreve" em tabela nenhuma.
--   - Nenhum serial/bigserial (so gen_random_uuid()): evita o gotcha de esquecer
--     `grant usage on sequence ... to authenticated`.

create extension if not exists pgcrypto;

-- ============================================================================
-- 0. NOTAS DE PRIVILEGIO (ler antes de rodar)
-- ============================================================================
-- FIX (critico): desde 30/05/2026 projetos Supabase NOVOS nao concedem mais
-- grants automaticos em tabelas novas do schema `public` pra anon/authenticated/
-- service_role — exposicao virou opt-in explicito. GRANT e RLS sao camadas
-- SEPARADAS: grant decide se o role alcanca a tabela; RLS decide quais linhas.
-- Sem os GRANTs da secao 8, toda query (inclusive as do build script rodando com
-- service_role) morre com 42501 permission denied, com as policies 100% corretas.
-- O primeiro rascunho deste arquivo nao tinha grant nenhum pra service_role — o
-- generate-catalog.js nao conseguiria escrever o catalogo.
--
-- NAO usar `alter table ... force row level security`: FORCE sujeita o OWNER da
-- tabela (postgres) a RLS, e e exatamente o bypass de owner que faz o trigger
-- SECURITY DEFINER da secao 7.1 conseguir inserir em `players` no registro.

grant usage on schema public to anon, authenticated, service_role;

-- ============================================================================
-- 1. ENUMS
-- ============================================================================

-- Os 17 tipos elementais reais deste dataset (Gen1/2, National Dex #1-251) —
-- confirmados na aba "TabelaDeTipos" da planilha (CLAUDE.md, "Oitava leva").
-- Sem FAIRY (Gen6, nao existe aqui).
create type element_type as enum (
  'NORMAL','FIRE','WATER','ELECTRIC','GRASS','ICE','FIGHTING','POISON',
  'GROUND','FLYING','PSYCHIC','BUG','ROCK','GHOST','DRAGON','DARK','STEEL'
);

-- Espelha js/data/rarity.js#RARITIES (pesos/multiplicadores ficam no bundle JS).
create type rarity_tier as enum ('comum','incomum','raro','ultra','legendary','mythic');

create type move_category as enum ('physical','special');
create type move_target as enum ('single','aoe');
create type item_kind as enum ('ball','potion','revive','rod','stone');
create type map_continent as enum ('johto','kanto');
create type pokemon_location as enum ('team','bag');
create type admin_role as enum ('support','owner');

-- ============================================================================
-- 2. CATALOGO (fonte de verdade pos-planilha — SPEC secao 6)
-- ============================================================================

-- Nota de importacao: as chaves da planilha sao MAIUSCULAS ('CYNDAQUIL') e os ids
-- do jogo sao minusculos ('cyndaquil'). O check abaixo (repetido em moves/items/
-- maps/locations) trava a divergencia no banco em vez de deixar as duas grafias
-- coexistirem — um id maiusculo importado por engano nao daria erro, so faria
-- toda FK do save do jogador apontar pra lugar nenhum.
create table species (
  id text primary key check (id = lower(id)),
  dex_number int not null unique check (dex_number between 1 and 251),
  name text not null,
  type1 element_type not null,
  type2 element_type,
  base_hp int not null check (base_hp > 0),
  base_atk_fis int not null check (base_atk_fis > 0),
  base_atk_esp int not null check (base_atk_esp > 0),
  base_def int not null check (base_def > 0),
  base_def_esp int not null check (base_def_esp > 0),
  base_speed int not null check (base_speed > 0),
  catch_rate int not null check (catch_rate between 1 and 255),  -- a planilha rotula a coluna "(0-255)"
  base_exp int not null check (base_exp > 0),
  -- As 4 curvas realmente usadas pelas 251 especies + as 2 que existem so como
  -- formula (GROWTH_SLIGHTLY_FAST/SLOW na aba "Formulas", nenhuma especie usa
  -- hoje). Check em vez de enum: adicionar valor a um enum e ALTER TYPE, e esta
  -- lista tende a mudar junto com a aba de formulas.
  growth_curve text not null check (growth_curve in (
    'MEDIUM_FAST','MEDIUM_SLOW','FAST','SLOW','SLIGHTLY_FAST','SLIGHTLY_SLOW'
  )),
  height_m numeric(4,2) check (height_m is null or height_m > 0),
  is_legendary boolean not null default false,
  evolves_to text references species(id) on delete restrict,
  evolves_at_level int check (evolves_at_level is null or evolves_at_level > 0),
  is_special_evolution boolean not null default false,
  constraint species_no_self_evolution check (evolves_to is null or evolves_to <> id),
  constraint species_evolution_needs_level check (
    (evolves_to is null and evolves_at_level is null) or
    (evolves_to is not null and evolves_at_level is not null)
  )
);

create table moves (
  id text primary key check (id = lower(id)),
  name text not null,
  type element_type not null,
  category move_category not null,        -- planilha usa 'fisico'/'especial'; a migracao mapeia
  power int not null check (power >= 0),  -- confirmado: nenhuma das 251 linhas tem Poder nulo
  accuracy int not null check (accuracy between 1 and 100),
  pp int not null check (pp > 0),
  target move_target not null default 'single',
  aoe_radius numeric check (aoe_radius is null or aoe_radius > 0),
  -- FIX (perda de dado): as 6 colunas abaixo existem na aba "Golpes" com dado
  -- real preenchido (Precisao em 11 valores distintos 30-100; Sempre Acerta 3
  -- linhas, Multi-hit 12, Dano Fixo 6, Recoil 4, Prioridade 3) e HOJE nao sao
  -- sincronizadas — sao as mecanicas marcadas "fora de escopo" no CLAUDE.md.
  -- Fora de escopo pro COMBATE nao e motivo pra apagar do BANCO: quando o .xlsx
  -- for aposentado (SPEC 6.5), o que nao estiver aqui deixa de existir. Ficam
  -- persistidas e ignoradas pelo gerador — implementar a mecanica depois nao
  -- exige recuperar planilha morta.
  always_hits boolean not null default false,
  multi_hit_min smallint check (multi_hit_min is null or multi_hit_min >= 1),
  multi_hit_max smallint check (multi_hit_max is null or multi_hit_max >= multi_hit_min),
  fixed_damage int check (fixed_damage is null or fixed_damage > 0),
  recoil_fraction numeric check (recoil_fraction is null or (recoil_fraction > 0 and recoil_fraction <= 1)),
  priority smallint not null default 0,
  constraint aoe_radius_matches_target check (
    (target = 'aoe' and aoe_radius is not null) or
    (target = 'single' and aoe_radius is null)
  ),
  constraint multi_hit_pair check ((multi_hit_min is null) = (multi_hit_max is null))
);

create table species_moves (
  species_id text not null references species(id) on delete cascade,
  move_id text not null references moves(id) on delete cascade,
  level_req int not null check (level_req >= 1),
  primary key (species_id, move_id)
);

create table items (
  id text primary key check (id = lower(id)),
  name text not null,
  kind item_kind not null,
  description text,
  buy_price int check (buy_price is null or buy_price >= 0),
  capture_rate numeric check (capture_rate is null or capture_rate > 0),
  -- FIX (bug quebrando): a celula "Cura de HP" da MAX_POTION nao e numero, e a
  -- STRING 'infinito' — `heal_amount int` rejeitaria a linha na importacao.
  -- js/data/items.generated.js guarda `healAmount: Infinity`, e
  -- AutoSystem.js#updateAutoHeal ORDENA as pocoes por healAmount pra escolher a
  -- melhor: se Max Potion virasse null/0 aqui, ela deixaria de ser a melhor
  -- pocao e o auto-pot passaria a gastar a errada. Modelado como flag separada
  -- (nao um sentinel tipo -1 ou 999999, que todo consumidor teria que conhecer).
  heal_amount int check (heal_amount is null or heal_amount > 0),
  heals_full boolean not null default false,
  -- FIX (bug quebrando): esta coluna nao existia no rascunho. AutoSystem.js:51
  -- faz `poke.hp = maxHp * revive.reviveHpPercent` — sem ela, todo auto-revive
  -- calcularia NaN. Dado real da planilha: REVIVE=0.5, MAX_REVIVE=1.
  revive_hp_percent numeric check (revive_hp_percent is null or (revive_hp_percent > 0 and revive_hp_percent <= 1)),
  stone_type element_type,
  constraint stone_type_matches_kind check (
    (kind = 'stone' and stone_type is not null) or
    (kind <> 'stone' and stone_type is null)
  ),
  constraint heal_fields_match_kind check (
    (kind = 'potion' and (heal_amount is not null or heals_full)) or
    (kind = 'revive' and revive_hp_percent is not null) or
    (kind not in ('potion','revive') and heal_amount is null and not heals_full and revive_hp_percent is null)
  )
);

create table type_chart (
  attacking_type element_type not null,
  defending_type element_type not null,
  multiplier numeric not null check (multiplier in (0, 0.5, 1, 2)),  -- os 4 valores reais da matriz 17x17
  primary key (attacking_type, defending_type)
);

-- So as hunts normais (Johto+Kanto). Modo Pesadelo/BOSS continuam gerados por
-- transformacao no build (mirror +nivel, SPEC 6.2) — nunca materializados aqui.
-- Por isso players.current_map_id/unlocked_maps NAO tem FK pra esta tabela: um
-- id valido em runtime pode ser 'nightmare_lv_1_10' ou 'boss_mewtwo', que nunca
-- existe como linha (FK aqui rejeitaria o save de todo jogador dentro de hunt BOSS).
create table maps (
  id text primary key check (id = lower(id)),
  name text not null,
  continent map_continent not null,
  min_level int not null check (min_level >= 1),
  max_level int not null check (max_level >= min_level),
  bg_theme text not null,
  bounds_width int not null default 2800 check (bounds_width > 0),
  bounds_height int not null default 1800 check (bounds_height > 0),
  unlock_cost int check (unlock_cost is null or unlock_cost >= 0)
);

create table map_encounters (
  map_id text not null references maps(id) on delete cascade,
  species_id text not null references species(id) on delete cascade,
  min_level int not null check (min_level >= 1),
  max_level int not null check (max_level >= min_level),
  -- Peso de spawn = chance REAL de encontro do Gen2, somada pelas vagas que a
  -- especie ocupa naquele local/periodo (ver encounter_slot_rates em 2b).
  --
  -- Substitui o `weight = species.catch_rate` que o jogo usa hoje (CLAUDE.md,
  -- "Spawn ponderado por raridade"): taxa de CAPTURA nao tem relacao nenhuma com
  -- frequencia de APARICAO — foi escolhida na epoca por ser "um dado que a
  -- planilha ja tinha" em vez de um numero inventado, mas distorce de verdade.
  -- Exemplos reais medidos na planilha (numeros conferidos, nao estimados):
  --   DARK_CAVE_VIOLET_ENTRANCE|day
  --     real:       GEODUDE 60%  ZUBAT 39%  DUNSPARCE  1%
  --     catch_rate: GEODUDE 36%  ZUBAT 36%  DUNSPARCE 27%
  --     -> Dunsparce, que e a vaga de 1% (a mais rara do mapa), aparecia 27% —
  --        27x mais do que devia — e virava o 3o mais comum em vez de raridade.
  --   ROUTE_31|day
  --     real:       PIDGEY 40%  CATERPIE 30%  BELLSPROUT 20%  WEEDLE 5%  HOPPIP 5%
  --     catch_rate: 20% pra CADA uma das 5 (todas com catch_rate identico) —
  --        a curva de raridade do mapa desaparecia por completo, virava uniforme.
  -- Validado: as 297 combinacoes (local, periodo) da planilha somam exatamente
  -- 100% com esta formula — zero grupo fora.
  --
  -- SQL que o generate-catalog.js usa pra derivar (nao ha coluna a preencher a mao):
  --   with counts as (
  --     select location_id, period, count(*) as slot_count
  --     from location_encounters group by location_id, period
  --   )
  --   select le.location_id, le.period, le.species_id,
  --          sum(r.percent) as weight
  --   from location_encounters le
  --   join counts c using (location_id, period)
  --   join encounter_slot_rates r
  --     on r.slot_count = c.slot_count and r.slot = le.slot
  --   group by le.location_id, le.period, le.species_id;
  --
  -- `numeric` (nao int) porque a soma pode dar fracionario depois de fundir
  -- varios locais numa hunt de banda (o pipeline de bandas junta enemyPool de
  -- multiplos locais, ver CLAUDE.md#groupHuntsIntoBands).
  weight numeric not null check (weight > 0),
  primary key (map_id, species_id)
);

create table formulas (
  key text primary key,
  expression text not null,
  variables text[] not null default '{}',
  description text            -- FIX: a aba "Formulas" tem coluna "Descricao" (o que cada
                              -- formula faz, em portugues). Sem esta coluna, aposentar o
                              -- .xlsx apaga a unica documentacao das 24 formulas.
);

-- ============================================================================
-- 2b. DADO BRUTO DA PLANILHA QUE HOJE E DESCARTADO
-- ============================================================================
-- Estas 3 tabelas nao alimentam o jogo — sao a camada-fonte que sobrevive a
-- aposentadoria do .xlsx (SPEC 6.5). Sem elas, o `npm run catalog:gerar` passa a
-- ser a unica leitura possivel do dado e tudo que ele ignora hoje morre com o
-- arquivo. Volume total e trivial (99 + 1623 + 99 linhas), entao o custo de
-- guardar e proximo de zero e o custo de NAO guardar e irreversivel.
--
-- O que exatamente esta sendo salvo do esquecimento:
--   * 99 locais reais de Johto, dos quais so 19 hunts curadas sobrevivem em `maps`.
--   * Encontros de morn/nite (541 linhas cada) — o gerador filtra `Periodo='day'`
--     e joga 2/3 fora. Efeito colateral real: especie exclusiva de noite (ex.
--     GASTLY em SPROUT_TOWER_2F, 4 slots so em 'nite') nunca pode aparecer no jogo.
--   * `Slot` (0-6) — o mecanismo REAL de raridade do Gen2. RATTATA ocupa 7 de 7
--     slots em SPROUT_TOWER_2F|morn (= 100% de chance); 379 de 941 trincas
--     (local, periodo, especie) ocupam mais de 1 slot. Ver a nota de `weight` abaixo.
--   * Toda a aba Pesca (9 grupos, 3 varas, limiar acumulado por slot).

create table locations (
  id text primary key check (id = lower(id)),
  name text not null,
  encounter_chance_morn int check (encounter_chance_morn between 0 and 100),
  encounter_chance_day  int check (encounter_chance_day  between 0 and 100),
  encounter_chance_nite int check (encounter_chance_nite between 0 and 100),
  fishing_group text                       -- null em 61 dos 99 locais (sem pesca)
);

create type day_period as enum ('morn','day','nite');

-- Grao = 1 linha por SLOT (nao por especie): e assim que a planilha guarda e e
-- assim que a raridade real emerge (contar slots da especie). Colapsar por
-- especie na importacao destruiria a informacao de forma irrecuperavel.
create table location_encounters (
  location_id text not null references locations(id) on delete cascade,
  period day_period not null,
  slot smallint not null check (slot between 0 and 6),
  level int not null check (level >= 1),
  species_id text not null references species(id) on delete restrict,
  primary key (location_id, period, slot)
);

create index location_encounters_species_idx on location_encounters(species_id);

create table fishing_encounters (
  fishing_group text not null,
  rod_item_id text not null references items(id) on delete restrict,
  slot smallint not null check (slot >= 0),
  cumulative_threshold_percent numeric not null check (cumulative_threshold_percent > 0 and cumulative_threshold_percent <= 100),
  level int not null check (level >= 1),
  species_id text not null references species(id) on delete restrict,
  primary key (fishing_group, rod_item_id, slot)
);

create index fishing_encounters_species_idx on fishing_encounters(species_id);
create index fishing_encounters_rod_idx on fishing_encounters(rod_item_id);

-- Probabilidade real de cada vaga de encontro do Gen2. NAO vem da planilha (ela
-- guarda so a ORDEM do slot, nao a chance) — e dado real extraido do disassembly
-- oficial do jogo, pret/pokecrystal, data/wild/probabilities.asm:
--   GrassMonProbTable (7 vagas): 30, 30, 20, 10, 5, 4, 1
--   WaterMonProbTable (3 vagas): 60, 30, 10
-- (o .asm lista em forma CUMULATIVA — 30/60/80/90/95/99/100 e 60/90/100; aqui
-- guardamos a chance individual de cada vaga, que e a diferenca entre acumulados.)
-- Mesma categoria de dado que js/data/pokeHeights.js: real, publico, verdadeiro,
-- so nao presente na planilha. Fica como TABELA e nao constante no gerador pra o
-- calculo de peso ser um join auditavel em vez de numero enterrado em codigo.
--
-- Os 2 tamanhos casam exatamente com a planilha: 183 grupos (local, periodo) tem
-- 7 vagas (grama/caverna) e 114 tem 3 (todos os locais *_SURF).
create table encounter_slot_rates (
  slot_count smallint not null check (slot_count in (3, 7)),
  slot smallint not null check (slot >= 0),
  percent numeric not null check (percent > 0 and percent <= 100),
  primary key (slot_count, slot),
  constraint slot_within_count check (slot < slot_count)
);

insert into encounter_slot_rates (slot_count, slot, percent) values
  (7, 0, 30), (7, 1, 30), (7, 2, 20), (7, 3, 10), (7, 4, 5), (7, 5, 4), (7, 6, 1),
  (3, 0, 60), (3, 1, 30), (3, 2, 10);

-- Postgres nao tem CHECK entre linhas; valide a soma a mao depois de rodar
-- (as duas linhas tem que dar 100):
--   select slot_count, sum(percent) from encounter_slot_rates group by slot_count;

-- FIX: Postgres NAO indexa coluna de FK automaticamente. Sem estes indices, todo
-- JOIN e todo ON DELETE CASCADE faz seq scan. Cobre so as FKs que nao ja sao
-- prefixo de alguma PK/unique existente (species_moves.species_id e
-- map_encounters.map_id ja sao a coluna-lider da PK composta).
create index species_evolves_to_idx on species(evolves_to) where evolves_to is not null;
create index species_moves_move_idx on species_moves(move_id);
create index map_encounters_species_idx on map_encounters(species_id);

-- ============================================================================
-- 3. ADMIN (SPEC 7.1) — identidade separada de `players`, nunca self-service.
-- ============================================================================

create table admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role admin_role not null default 'support',
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id) on delete set null
);

create index admins_granted_by_idx on admins(granted_by) where granted_by is not null;

-- `action` e texto livre (nao enum) de proposito: acao de suporte nova nao deve
-- exigir ALTER TYPE a cada funcao que a ferramenta de admin ganhar.
create table admin_actions (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references admins(user_id) on delete restrict,
  target_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index admin_actions_admin_idx on admin_actions(admin_user_id);
create index admin_actions_target_idx on admin_actions(target_user_id, created_at desc);

-- ============================================================================
-- 4. PLAYERS (SPEC 3.1 + 7.2) — 1 linha por usuario, criada automaticamente
--    no registro pelo trigger da secao 7.
-- ============================================================================

create table players (
  user_id uuid primary key references auth.users(id) on delete cascade,
  trainer_name text not null default 'Treinador',
  trainer_level int not null default 1 check (trainer_level >= 1),
  trainer_exp bigint not null default 0 check (trainer_exp >= 0),
  gold bigint not null default 500000 check (gold >= 0),
  diamonds int not null default 5 check (diamonds >= 0),
  active_team_index smallint not null default 0 check (active_team_index between 0 and 5),
  current_map_id text,                    -- sem FK de proposito, ver nota na tabela maps
  unlocked_maps text[] not null default '{}',
  unlocked_continents text[] not null default array['johto','nightmare'],
  auto_toggles jsonb not null default '{"autoPot":true,"autoCatch":true,"autoRevive":true}',
  auto_pot_rules jsonb not null default '[{"hpPercent":40,"itemId":"potion"}]',
  auto_catch_config jsonb not null default '{"ballId":"poke_ball","catchShinyEnabled":true,"shinyBallId":"great_ball"}',
  perf_stats jsonb not null default '{"gold":0,"xp":0,"mobs":0,"shinys":0,"since":0}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- 5. PROGRESSO NORMALIZADO (SPEC 3.2-3.5)
-- ============================================================================
-- FIX: toda FK pro catalogo usa ON DELETE RESTRICT explicito. Este projeto JA
-- renomeou/removeu especie entre syncs (gotcha documentado no CLAUDE.md: "save
-- antigo referenciando especie removida"). Com CASCADE, um sync de catalogo
-- apagaria silenciosamente o POKE de todo jogador que tivesse a especie; com
-- RESTRICT, o sync FALHA barulhento e obriga a tratar (migrar/renomear) — o
-- comportamento certo quando o dado do jogador esta em jogo.

create table pokemon_instances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references players(user_id) on delete cascade,
  species_id text not null references species(id) on delete restrict,
  location pokemon_location not null,
  team_slot smallint check (team_slot is null or team_slot between 0 and 5),
  level int not null default 1 check (level >= 1),
  exp bigint not null default 0 check (exp >= 0),
  hp int not null check (hp >= 0),
  is_shiny boolean not null default false,
  rarity rarity_tier not null default 'comum',
  locked boolean not null default false,
  iv_hp smallint not null check (iv_hp between 0 and 31),
  iv_atk_fis smallint not null check (iv_atk_fis between 0 and 31),
  iv_atk_esp smallint not null check (iv_atk_esp between 0 and 31),
  iv_def smallint not null check (iv_def between 0 and 31),
  iv_def_esp smallint not null check (iv_def_esp between 0 and 31),
  iv_speed smallint not null check (iv_speed between 0 and 31),
  stat_hp int not null check (stat_hp >= 1),
  stat_atk_fis int not null check (stat_atk_fis >= 1),
  stat_atk_esp int not null check (stat_atk_esp >= 1),
  stat_def int not null check (stat_def >= 1),
  stat_def_esp int not null check (stat_def_esp >= 1),
  stat_speed int not null check (stat_speed >= 1),
  unlocked_abilities text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint team_slot_required check (
    (location = 'team' and team_slot is not null) or
    (location = 'bag' and team_slot is null)
  ),
  -- FIX: o rascunho anterior usava `create unique index ... where location='team'`
  -- e dizia que dava pra marcar DEFERRABLE. Nao da: indice parcial (WHERE) e
  -- constraint DEFERRABLE sao features que o Postgres nao combina — a sintaxe
  -- ALTER TABLE ... ADD CONSTRAINT UNIQUE ... DEFERRABLE nao aceita WHERE, e
  -- CREATE UNIQUE INDEX nao aceita DEFERRABLE.
  -- Constraint sem WHERE resolve igual: NULL nunca colide com NULL numa unique
  -- constraint padrao, entao linha de bag (team_slot null) nao conta pra
  -- unicidade — so team (0-5) conta.
  -- Reordenar o time (unshift do POKE ativo, ver CLAUDE.md) precisa rodar dentro
  -- de 1 transacao COM `set constraints one_pokemon_per_team_slot deferred;`,
  -- senao a troca de 2 slots colide no meio do caminho.
  constraint one_pokemon_per_team_slot unique (user_id, team_slot) deferrable initially immediate
);

-- FIX: nao existe mais um indice solto em (user_id) — a unique constraint acima
-- ja cria um indice com user_id como coluna-lider, que serve `where user_id = x`
-- igual. Indice redundante so custa escrita a cada captura/level-up.
create index pokemon_instances_species_idx on pokemon_instances(species_id);
create index pokemon_instances_user_species_idx on pokemon_instances(user_id, species_id);

create table player_items (
  user_id uuid not null references players(user_id) on delete cascade,
  item_id text not null references items(id) on delete restrict,
  quantity int not null default 0 check (quantity >= 0),
  locked boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create index player_items_item_idx on player_items(item_id);

create table player_pokedex (
  user_id uuid not null references players(user_id) on delete cascade,
  species_id text not null references species(id) on delete restrict,
  normal_kills bigint not null default 0 check (normal_kills >= 0),
  shiny_kills bigint not null default 0 check (shiny_kills >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, species_id)
);

create index player_pokedex_species_idx on player_pokedex(species_id);

create table player_auto_catch_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references players(user_id) on delete cascade,
  species_id text not null references species(id) on delete restrict,
  ball_item_id text not null references items(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (user_id, species_id)
);

create index player_auto_catch_rules_species_idx on player_auto_catch_rules(species_id);
create index player_auto_catch_rules_ball_idx on player_auto_catch_rules(ball_item_id);

-- ============================================================================
-- 6. HELPER DE AUTORIZACAO
-- ============================================================================
-- FIX: o rascunho anterior repetia `exists (select 1 from admins where
-- user_id = auth.uid())` inline em cada policy. Isso reavalia o subquery
-- POR LINHA. Encapsulado numa funcao STABLE + SECURITY DEFINER, chamada como
-- `(select dev.is_admin())` nas policies: o planner resolve como InitPlan
-- (1 vez por query, nao por linha) — a recomendacao oficial de RLS performance.
-- SECURITY DEFINER tambem evita qualquer risco de recursao de policy: le
-- `admins` ignorando a RLS de `admins`.
-- `set search_path = ''` + nome totalmente qualificado: previne search_path
-- injection (obrigatorio em toda funcao SECURITY DEFINER).
create function dev.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from dev.admins a where a.user_id = (select auth.uid())
  );
$$;

-- FIX: Postgres concede EXECUTE a PUBLIC por padrao em funcao nova, e o Supabase
-- propaga isso pra anon via PostgREST. `is_admin()` sem argumento nao vaza nada
-- (anon recebe false), mas expor funcao administrativa por descuido e o padrao
-- que queremos evitar em geral — revoke explicito, grant so pra quem precisa
-- avaliar as policies.
revoke execute on function dev.is_admin() from public;
grant execute on function dev.is_admin() to authenticated, service_role;

-- ============================================================================
-- 7. TRIGGERS
-- ============================================================================

-- 7.1 — cria a linha em `players` no registro (SPEC 7.2).
-- SECURITY DEFINER e obrigatorio aqui por 2 motivos: (a) o INSERT em auth.users
-- e feito pelo role `supabase_auth_admin`, que nao tem privilegio nenhum fora do
-- schema auth — sem definer, todo signup falha com "Database error saving new
-- user" (a falha mais reportada deste padrao exato); (b) o owner da funcao
-- (postgres, tambem owner de `players`) nao esta sujeito a RLS, entao o insert
-- passa sem precisar de policy de insert em `players`.
create function dev.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into dev.players (user_id) values (new.id);
  return new;
end;
$$;

revoke execute on function dev.handle_new_user() from public;
grant execute on function dev.handle_new_user() to supabase_auth_admin;

-- [clone-schema-to-dev] trigger on_auth_user_created omitido (auth.users e compartilhado)


-- 7.2 — FIX: `updated_at` com DEFAULT now() so preenche no INSERT. Sem trigger, a
-- coluna congelaria na data de criacao pra sempre (nome mentiroso). Aplicado so
-- nas tabelas com UPDATE in-place real — player_auto_catch_rules/admin_actions
-- sao insert+delete na pratica.
create function dev.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger players_set_updated_at before update on players
  for each row execute function dev.set_updated_at();
create trigger pokemon_instances_set_updated_at before update on pokemon_instances
  for each row execute function dev.set_updated_at();
create trigger player_items_set_updated_at before update on player_items
  for each row execute function dev.set_updated_at();
create trigger player_pokedex_set_updated_at before update on player_pokedex
  for each row execute function dev.set_updated_at();

-- ============================================================================
-- 8. RLS + GRANTS
--    As duas camadas sao necessarias (ver secao 0): GRANT libera a tabela pro
--    role, RLS filtra as linhas. Faltar qualquer uma das duas quebra o acesso.
-- ============================================================================

alter table species enable row level security;
alter table moves enable row level security;
alter table species_moves enable row level security;
alter table items enable row level security;
alter table type_chart enable row level security;
alter table maps enable row level security;
alter table map_encounters enable row level security;
alter table formulas enable row level security;
alter table locations enable row level security;
alter table location_encounters enable row level security;
alter table fishing_encounters enable row level security;
alter table encounter_slot_rates enable row level security;
alter table admins enable row level security;
alter table admin_actions enable row level security;
alter table players enable row level security;
alter table pokemon_instances enable row level security;
alter table player_items enable row level security;
alter table player_pokedex enable row level security;
alter table player_auto_catch_rules enable row level security;

-- 8.1 Catalogo: leitura publica, zero policy de escrita (service_role tem
-- BYPASSRLS e escreve via generate-catalog.js — SPEC 6.5).
-- FIX: todo policy agora declara `to <role>` explicitamente. Sem isso a
-- expressao e avaliada tambem pra roles que nunca deveriam nem chegar la.
create policy "catalog public read" on species        for select to anon, authenticated using (true);
create policy "catalog public read" on moves          for select to anon, authenticated using (true);
create policy "catalog public read" on species_moves  for select to anon, authenticated using (true);
create policy "catalog public read" on items          for select to anon, authenticated using (true);
create policy "catalog public read" on type_chart     for select to anon, authenticated using (true);
create policy "catalog public read" on maps           for select to anon, authenticated using (true);
create policy "catalog public read" on map_encounters for select to anon, authenticated using (true);
create policy "catalog public read" on formulas       for select to anon, authenticated using (true);

grant select on species, moves, species_moves, items, type_chart, maps, map_encounters, formulas
  to anon, authenticated;
-- FIX: service_role tambem precisa de GRANT (BYPASSRLS nao substitui privilegio
-- de tabela). Sem esta linha o generate-catalog.js morre com 42501.
grant select, insert, update, delete
  on species, moves, species_moves, items, type_chart, maps, map_encounters, formulas
  to service_role;

-- 8.1b Camada-fonte (2b): NENHUMA policy de select — o client nunca le isso, so o
-- build script (service_role). RLS ligada + zero policy = tabela inalcancavel por
-- anon/authenticated mesmo que um grant vaze por engano numa migration futura.
grant select, insert, update, delete
  on locations, location_encounters, fishing_encounters, encounter_slot_rates
  to service_role;

-- 8.2 admins / admin_actions: cada admin le a propria linha e toda a auditoria.
-- Ninguem escreve por aqui — so service_role, dentro da Edge Function de suporte.
-- FIX: `(select auth.uid())` em vez de `auth.uid()` solto (avaliado 1x, nao por linha).
create policy "admin reads own row" on admins
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "admin reads audit" on admin_actions
  for select to authenticated using ((select dev.is_admin()));

grant select on admins, admin_actions to authenticated;
grant select, insert, update, delete on admins, admin_actions to service_role;

-- 8.3 players: dono le/atualiza a propria linha. Client nunca insere/deleta — o
-- ciclo de vida da linha e 100% trigger (7.1) + cascade de auth.users. Por isso
-- so ha policy/grant de select+update.
create policy "own row read" on players
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own row update" on players
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "admin reads all players" on players
  for select to authenticated using ((select dev.is_admin()));

grant select, update on players to authenticated;
grant select, insert, update, delete on players to service_role;

-- 8.4 Progresso mutavel pelo proprio jogador (captura, compra, kill, regra de
-- auto-catch): insert/update/delete direto do client, sempre restrito ao
-- proprio user_id. Policies permissivas do mesmo comando sao combinadas com OR,
-- entao a policy de admin abaixo SOMA leitura sem afrouxar a escrita.
create policy "own rows all" on pokemon_instances for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "admin reads all" on pokemon_instances for select to authenticated
  using ((select dev.is_admin()));

create policy "own rows all" on player_items for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "admin reads all" on player_items for select to authenticated
  using ((select dev.is_admin()));

create policy "own rows all" on player_pokedex for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "admin reads all" on player_pokedex for select to authenticated
  using ((select dev.is_admin()));

create policy "own rows all" on player_auto_catch_rules for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "admin reads all" on player_auto_catch_rules for select to authenticated
  using ((select dev.is_admin()));

grant select, insert, update, delete
  on pokemon_instances, player_items, player_pokedex, player_auto_catch_rules
  to authenticated;
grant select, insert, update, delete
  on pokemon_instances, player_items, player_pokedex, player_auto_catch_rules
  to service_role;

-- anon (sem sessao) so ganha grant de SELECT no catalogo (8.1) — nada de
-- progresso/admin. Confere as rotas publicas Home/Login/Registro (SPEC 7.3).
--
-- Validacao manual recomendada depois de rodar:
--   1. Sem Authorization header, bater no REST em /players e /admin_actions
--      -> tem que dar 401/permission denied (nao lista vazia).
--   2. Logado como jogador comum, ler pokemon_instances de outro user_id
--      -> lista vazia (RLS filtrou), nunca a linha do outro.
--   3. Signup real -> conferir que a linha em `players` nasceu junto (trigger 7.1).
--   4. Rodar `select * from pg_policies where schemaname = 'public'` e conferir
--      que nenhuma tabela de progresso tem policy de escrita fora de "own rows all".


-- ==== 20260806211909_seed_itens_iniciais.sql ====
-- Jogador novo nascia com ZERO itens.
--
-- No jogo antigo os 10.000 de cada item inicial vinham de uma constante no
-- CLIENTE (STARTING_ITEMS, em GameState.js). Com o Postgres virando fonte de
-- verdade, a linha de `players` passou a ser criada pela trigger — mas nada
-- semeava `player_items`. Resultado observado no teste ponta a ponta: conta
-- recem-criada com 500.000 de ouro e nenhuma pocao/bola/revive, e por tabela
-- auto-pot e auto-revive nunca disparando (nao ha item pra usar).
--
-- Mesma classe do bug ja corrigido no `merge` do zustand/persist: default de
-- jogo novo que existia so no cliente e se perdeu ao trocar a camada de
-- persistencia. A concessao inicial passa a ser do servidor — que e onde ela
-- precisa estar de qualquer forma quando a autoridade migrar (Fase D), pra o
-- cliente nao poder se auto-conceder item.
--
-- Varas (kind='rod') ficam de fora: pesca nao esta implementada e elas nao sao
-- vendaveis, exatamente como no STARTING_ITEMS original.

create or replace function dev.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into dev.players (user_id) values (new.id);

  insert into dev.player_items (user_id, item_id, quantity)
  select new.id, i.id, 10000
  from dev.items i
  where i.kind in ('ball', 'potion', 'revive');

  return new;
end;
$$;


-- ==== 20260806214234_moves_multihit_e_dano_fixo.sql ====
-- A planilha guarda MODO, o schema pedia NUMERO — por isso 18 golpes ficaram
-- com o campo nulo na primeira carga do catalogo.
--
--   Multi-hit  = "sim" (12 golpes). O schema pedia multi_hit_min/max smallint,
--                mas o range real (2-5, 2 pro Double Kick, 3 pro Triple Kick)
--                NAO esta na planilha — preencher viria do meu conhecimento de
--                Gen2, ou seja, dado inventado passando por dado importado.
--   Dano Fixo  = "ohko" | "level" | "half" (6 golpes). O schema pedia
--                fixed_damage int, e nenhum desses tres cabe num inteiro: a
--                semantica ja existe em codigo
--                (combatSystem.ts#FIXED_DAMAGE_ABILITIES), so nao como numero.
--
-- Isto precisa entrar ANTES de a planilha ser aposentada: depois disso o
-- `.xlsx` deixa de ser a fonte e o dado nao teria de onde voltar.
--
-- As colunas antigas estao 100% nulas (nenhuma linha usa), entao remove-las
-- nao perde nada — e carregar coluna morta ao lado da nova so criaria duvida
-- sobre qual e a verdadeira.

alter table dev.moves drop column if exists multi_hit_min;
alter table dev.moves drop column if exists multi_hit_max;
alter table dev.moves drop column if exists fixed_damage;

alter table dev.moves add column if not exists multi_hit boolean not null default false;
alter table dev.moves add column if not exists fixed_damage_mode text;

alter table dev.moves drop constraint if exists moves_fixed_damage_mode_valid;
alter table dev.moves add constraint moves_fixed_damage_mode_valid
  check (fixed_damage_mode is null or fixed_damage_mode in ('ohko', 'level', 'half'));

comment on column dev.moves.multi_hit is
  'Golpe acerta multiplas vezes. O range de acertos nao existe na planilha; o jogo usa a regra em codigo.';
comment on column dev.moves.fixed_damage_mode is
  'Dano fixo por regra propria: ohko (derruba), level (dano = nivel), half (metade do HP atual do alvo).';


-- ==== 20260806214835_ordem_de_origem_do_catalogo.sql ====
-- A ORDEM DAS LINHAS da planilha e dado real, e o schema nao a capturava.
--
-- Descoberto ao escrever `generate-catalog.js`: o gerador precisa produzir os
-- *.generated.ts byte-a-byte identicos aos que a planilha produz, e a ordem
-- das chaves nesses arquivos vem da ordem das linhas na aba de origem. Sem
-- guarda-la, regenerar a partir do Postgres embaralha:
--
--   formulas       as 24 chaves saem agrupadas por assunto (dano, captura,
--                  economia, curvas de crescimento), nao alfabeticamente.
--   items          agrupados por tipo e por tier dentro do tipo
--                  (poke/great/ultra/premier, depois as pocoes...).
--   species_moves  202 pares (especie, nivel) tem mais de um golpe no mesmo
--                  nivel. O desempate e a ordem da planilha: `sort()` do JS e
--                  estavel, entao empate mantem a ordem de origem. Testado:
--                  desempatar por move_id alfabetico reproduz so 107 das 251
--                  especies (ex.: CYNDAQUIL e tackle@1 antes de leer@1).
--
-- Isto precisa entrar ANTES de a planilha ser aposentada — depois dela deixar
-- de ser a fonte, a ordem nao teria de onde voltar. Mesma classe da lacuna de
-- multi_hit/fixed_damage_mode corrigida na migration anterior.
--
-- NAO precisa de coluna: a ordem dos 17 tipos (linhas E colunas do
-- type_chart) ja existe em web/src/data/typeColors.ts, arquivo hand-authored
-- do jogo que sobrevive a aposentadoria — conferido, bate exatamente. Guardar
-- de novo no banco criaria uma segunda fonte de verdade pra mesma coisa.
--
-- A ordem das ESPECIES em pokes.generated.ts tambem nao precisa de coluna: e
-- derivada (iniciais, lendarios, especies das hunts na ordem das hunts, e
-- entao a expansao da cadeia evolutiva), e a curadoria que a produz continua
-- viva em sync-planilha.js.

alter table dev.formulas add column if not exists sort_order int not null default 0;
alter table dev.items add column if not exists sort_order int not null default 0;
alter table dev.species_moves add column if not exists sort_order int not null default 0;

comment on column dev.formulas.sort_order is
  'Ordem de origem na aba Formulas. Define a ordem das chaves no arquivo gerado.';
comment on column dev.items.sort_order is
  'Ordem de origem na aba Itens. Stones (hand-authored) vem depois dos itens da planilha.';
comment on column dev.species_moves.sort_order is
  'Ordem de origem na aba Movesets. Desempata golpes aprendidos no mesmo nivel.';


-- ==== 20260806222150_ordem_de_origem_de_mapas_e_encontros.sql ====
-- Complemento de `ordem_de_origem_do_catalogo`: a ordem tambem e dado real em
-- `maps` e `map_encounters`, e faltou nas duas.
--
-- map_encounters  A hunt inicial (route_46) tem 3 especies cuja ordem vem da
--                 aba Encontros: geodude, spearow, rattata. Nao e alfabetica,
--                 nem por Pokedex (74, 21, 19), nem por taxa de captura (as 3
--                 sao 255) — nao ha chave que a reproduza, e ela decide a
--                 ordem do `enemyPool` no maps.generated.ts. As outras 18
--                 hunts nao dependem disto (a ordem delas e recalculada pela
--                 curadoria por tipo, que continua viva em sync-planilha.js),
--                 mas guardar so pra uma seria uma pegadinha esperando quem
--                 mexer nisso depois.
--
-- maps            A ordem das 19 hunts no arquivo gerado e a ordem em que o
--                 pipeline as cria (inicial, depois os 9 brackets por nivel,
--                 2 biomas cada). Derivar isso de volta exigia adivinhar o
--                 prefixo do bracket a partir do id — guardar o indice torna
--                 a releitura um `order by sort_order`.

alter table dev.maps add column if not exists sort_order int not null default 0;
alter table dev.map_encounters add column if not exists sort_order int not null default 0;

comment on column dev.maps.sort_order is
  'Ordem em que o pipeline cria as hunts. Define a ordem das chaves no arquivo gerado.';
comment on column dev.map_encounters.sort_order is
  'Ordem de origem do encontro dentro do mapa. Define a ordem do enemyPool.';


-- ==== 20260806224410_species_moves_aceita_o_mesmo_golpe_em_dois_niveis.sql ====
-- FIX (perda de dado, achado pelo diff byte-a-byte de `generate-catalog.js`):
-- a chave primaria (species_id, move_id) descartava 162 das 2215 linhas da aba
-- Movesets, em silencio.
--
-- O caso real: uma forma evoluida aprende o mesmo golpe DUAS vezes — no nivel 1
-- (herdado da pre-evolucao, pra nao nascer sem golpe ao evoluir) e de novo no
-- nivel em que a especie o aprenderia sozinha. Ex.: QUILAVA|SMOKESCREEN nos
-- niveis 1 e 6; TYPHLOSION|EMBER nos niveis 1 e 12; ALAKAZAM|CONFUSION nos
-- niveis 1 e 16.
--
-- Isso nao e ruido: `species.abilities` no arquivo gerado contem as duas
-- entradas, e ProgressionSystem re-percorre esse array a cada level-up. Com a
-- PK antiga, `pokes.generated.ts` regenerado do Postgres saia 10KB menor que o
-- da planilha — 640 linhas de golpe a menos.
--
-- O par (especie, golpe) continua unico POR NIVEL; o que passa a ser permitido
-- e a mesma dupla em niveis diferentes.

alter table dev.species_moves drop constraint species_moves_pkey;
alter table dev.species_moves add primary key (species_id, move_id, level_req);

comment on table dev.species_moves is
  'Moveset por especie. Uma especie pode aprender o MESMO golpe em mais de um nivel (forma evoluida que herda o golpe no nivel 1 e o reaprende depois) — por isso o nivel faz parte da chave.';


-- ==== 20260806225530_species_moves_chaveado_por_posicao.sql ====
-- Segundo (e ultimo) ajuste de chave em species_moves, tambem achado pelo diff
-- byte-a-byte: a planilha tem UMA linha literalmente repetida —
-- SEAKING | TAIL_WHIP | nivel 1 aparece duas vezes.
--
-- O pipeline nao deduplica, entao `species.abilities` do Seaking traz Tail Whip
-- duas vezes no arquivo gerado. Efeito real no jogo: nenhum no combate
-- (progressionSystem ja ignora golpe repetido via `unlockedAbilities.includes`),
-- so a aba "Golpes" do perfil lista a linha duas vezes. Parece erro de digitacao
-- na planilha — mas corrigi-lo aqui embutiria uma mudanca de jogo dentro da
-- migracao de fonte, que e exatamente o que a verificacao byte-a-byte existe pra
-- impedir. Fica preservado; quem quiser limpar faz depois, como commit proprio
-- e visivel.
--
-- A chave passa a ser (especie, posicao): o moveset e uma LISTA ORDENADA, e a
-- posicao dentro dela e a identidade real de cada linha. Isso acomoda tanto o
-- mesmo golpe em dois niveis (migration anterior) quanto a linha repetida, sem
-- precisar de coluna sintetica.

alter table dev.species_moves drop constraint species_moves_pkey;
alter table dev.species_moves add primary key (species_id, sort_order);

comment on column dev.species_moves.sort_order is
  'Posicao no moveset da especie (0-based) — junto com species_id, e a chave primaria. Reproduz o array `abilities` exato ao ordenar por ela.';


-- ==== 20260806233000_spawn_tier_por_especie.sql ====
-- Peso de spawn deixa de ser `species.catch_rate` e passa a ser um TIER derivado
-- do dado real de encontro selvagem do Gen1/Gen2.
--
-- Por que o peso antigo estava errado: taxa de CAPTURA nao tem relacao com
-- frequencia de APARICAO. Dunsparce e facil de capturar (catch_rate 190) e
-- ocupava 27% da hunt, quando no jogo real ele e a vaga de 1% — a mais rara do
-- mapa. Foi escolhido na epoca por ser "um dado que a planilha ja tinha".
--
-- O comentario de `map_encounters.weight` (migration initial_schema) previa
-- derivar o peso de `location_encounters` + `encounter_slot_rates`. Esse caminho
-- nao se sustentou, por dois motivos medidos e nao supostos:
--
--  1. `locations`/`location_encounters` estao vazias, e 18 das 19 hunts do jogo
--     NAO sao locais reais — sao agrupamentos por tipo/bioma curados
--     (`lv_1_10_floresta` junta 17 especies GRASS daquela faixa de nivel). So
--     `route_46` corresponde a um local real de Johto. Nao ha (local, periodo)
--     pra agrupar.
--  2. A coluna `Slot` da planilha nao e fiel. Conferida especie a especie contra
--     o disassembly pret/pokecrystal, 48 das 78 divergiam: TENTACOOL saia 30%
--     quando o valor real e 74% (ele ocupa a vaga de 60% da agua em quase todo
--     lugar) e MAGIKARP 51% contra 69% reais. A planilha e uma reconstrucao; o
--     disassembly e o dado do jogo.
--
-- O tier vem de `scripts/derive-spawn-tiers.js`, que le os disassemblies
-- pret/pokecrystal, pret/pokegold e pret/pokered e cobre as quatro formas de
-- encontro selvagem do Gen2 (grama, surf, pesca, headbutt). Das 251 especies do
-- dex, 150 saem do dado do Gen2, 7 do Gen1 (nao aparecem no Gen2) e 94 de regra
-- declarada — sao as que nao tem encontro selvagem em nenhuma das duas geracoes
-- (evolucao por troca/pedra, presente, fossil, lendario), onde nao existe taxa
-- pra medir. `scripts/spawn-tiers.json` registra a procedencia de cada uma
-- (`gsc`/`rb`/`regra`), pra continuar auditavel o que foi medido e o que foi
-- decidido.

-- Os pesos SAO as vagas reais da GrassMonProbTable do Gen2 (30/20/10/5/1), nao
-- numeros escolhidos a esmo. Tabela propria, em vez de enum com o peso no
-- codigo, porque peso e dado de balanceamento: rebalancear vira um update, nao
-- um deploy.
create table spawn_tiers (
  key text primary key,
  weight numeric not null check (weight > 0),
  sort_order int not null unique
);

insert into spawn_tiers (key, weight, sort_order) values
  ('muito_comum', 30, 1),
  ('comum', 20, 2),
  ('incomum', 10, 3),
  ('raro', 5, 4),
  ('muito_raro', 1, 5);

alter table spawn_tiers enable row level security;
create policy "spawn_tiers e catalogo publico" on spawn_tiers
  for select to anon, authenticated using (true);

-- Sem default de proposito: uma especie nova tem que declarar o tier. Com
-- default, ela entraria muda como 'incomum' e ninguem notaria. O backfill logo
-- abaixo cobre as 251 existentes, e o `set not null` no fim trava a regra.
alter table species add column spawn_tier text references spawn_tiers(key) on delete restrict;

update species set spawn_tier = 'muito_comum' where id in (
  'chinchou', 'cubone', 'diglett', 'geodude', 'goldeen', 'graveler', 'grimer', 'horsea',
  'koffing', 'krabby', 'magikarp', 'natu', 'nidorina', 'nidorino', 'poliwag', 'psyduck',
  'qwilfish', 'rattata', 'remoraid', 'slowpoke', 'spearow', 'swinub', 'tangela', 'tentacool',
  'unown', 'voltorb', 'wooper'
);

update species set spawn_tier = 'comum' where id in (
  'aipom', 'bellsprout', 'dratini', 'drowzee', 'exeggcute', 'gastly', 'girafarig', 'gyarados',
  'hoothoot', 'kingler', 'lickitung', 'machop', 'magnemite', 'nidoran_f', 'nidoran_m', 'onix',
  'pidgey', 'poliwhirl', 'ponyta', 'quagsire', 'seaking', 'seel', 'sentret', 'shellder',
  'zubat'
);

update species set spawn_tier = 'incomum' where id in (
  'abra', 'bulbasaur', 'caterpie', 'charmander', 'chikorita', 'cleffa', 'corsola', 'cyndaquil',
  'delibird', 'doduo', 'dragonair', 'dugtrio', 'eevee', 'ekans', 'electrode', 'elekid',
  'fearow', 'flaaffy', 'gligar', 'golbat', 'golduck', 'hoppip', 'igglybuff', 'kabuto',
  'lanturn', 'machoke', 'magby', 'magneton', 'mankey', 'mareep', 'meowth', 'oddish',
  'omanyte', 'paras', 'pichu', 'pidgeotto', 'pineco', 'porygon', 'rapidash', 'raticate',
  'rhyhorn', 'sandshrew', 'seadra', 'slowbro', 'smeargle', 'smoochum', 'squirtle', 'stantler',
  'staryu', 'sunkern', 'tentacruel', 'togepi', 'totodile', 'tyrogue', 'ursaring', 'weedle',
  'weepinbell', 'wobbuffet'
);

update species set spawn_tier = 'raro' where id in (
  'aerodactyl', 'arbok', 'arcanine', 'azumarill', 'bayleef', 'blissey', 'charmeleon', 'cloyster',
  'croconaw', 'ditto', 'donphan', 'electabuzz', 'espeon', 'exeggutor', 'farfetch_d', 'flareon',
  'forretress', 'furret', 'growlithe', 'haunter', 'heracross', 'hitmonchan', 'hitmonlee', 'hitmontop',
  'houndoom', 'houndour', 'hypno', 'ivysaur', 'jolteon', 'jynx', 'kabutops', 'kadabra',
  'kakuna', 'kangaskhan', 'lapras', 'larvitar', 'ledyba', 'magcargo', 'magmar', 'mantine',
  'marill', 'metapod', 'miltank', 'misdreavus', 'mr__mime', 'muk', 'murkrow', 'ninetales',
  'noctowl', 'octillery', 'omastar', 'parasect', 'pikachu', 'piloswine', 'porygon2', 'quilava',
  'raichu', 'sandslash', 'scizor', 'shuckle', 'skiploom', 'slowking', 'slugma', 'snorlax',
  'snubbull', 'spinarak', 'starmie', 'steelix', 'sudowoodo', 'sunflora', 'tauros', 'togetic',
  'umbreon', 'vaporeon', 'venonat', 'vulpix', 'wartortle', 'wigglytuff', 'xatu'
);

update species set spawn_tier = 'muito_raro' where id in (
  'alakazam', 'ampharos', 'ariados', 'articuno', 'beedrill', 'bellossom', 'blastoise', 'butterfree',
  'celebi', 'chansey', 'charizard', 'clefable', 'clefairy', 'crobat', 'dewgong', 'dodrio',
  'dragonite', 'dunsparce', 'entei', 'feraligatr', 'gengar', 'gloom', 'golem', 'granbull',
  'ho_oh', 'jigglypuff', 'jumpluff', 'kingdra', 'ledian', 'lugia', 'machamp', 'marowak',
  'meganium', 'mew', 'mewtwo', 'moltres', 'nidoking', 'nidoqueen', 'persian', 'phanpy',
  'pidgeot', 'pinsir', 'politoed', 'poliwrath', 'primeape', 'pupitar', 'raikou', 'rhydon',
  'scyther', 'skarmory', 'sneasel', 'suicune', 'teddiursa', 'typhlosion', 'tyranitar', 'venomoth',
  'venusaur', 'victreebel', 'vileplume', 'weezing', 'yanma', 'zapdos'
);

alter table species alter column spawn_tier set not null;


-- ==== 20260807003000_sessoes_de_jogo.sql ====
-- Sessao de jogo: a unidade que o SERVIDOR usa pra saber quanto tempo simular.
--
-- Sem isto, quem diria "passei 40 minutos cacando" seria o cliente, e a mentira
-- mais barata do jogo seria simplesmente inflar esse numero. A regra e: o
-- cliente declara INTENCAO (em qual hunt esta, com qual POKE); quanto tempo
-- passou e sempre `now()` menos `last_flush_at`, medido aqui, no relogio do
-- servidor.
--
-- `seed` tambem nasce aqui, e nao no cliente: e ela que determina shiny, IV,
-- raridade e crit (ver core/rng.ts). Deixar o cliente escolher a semente seria
-- deixar ele procurar a que da shiny.
create table game_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  map_id text not null references maps(id) on delete restrict,
  -- Qual POKE o jogador declarou levar. Validado contra `pokemon_instances` na
  -- abertura: nao adianta declarar um POKE que nao e seu ou que esta na mochila.
  poke_uid uuid not null references pokemon_instances(id) on delete cascade,

  -- int8 e nao int4: a semente e um inteiro de 32 bits COM SINAL no motor
  -- (`seed | 0`), e o Postgres nao tem uint32. Guardar o valor com sinal em int8
  -- evita conversao implicita nas pontas.
  seed bigint not null,

  started_at timestamptz not null default now(),
  -- O relogio de referencia do proximo flush. Avanca a cada simulacao aplicada.
  last_flush_at timestamptz not null default now(),
  -- Quanto tempo de jogo esta sessao ja rendeu. So auditoria/diagnostico — a
  -- decisao de quanto simular nunca sai daqui, sai do relogio.
  simulated_seconds numeric not null default 0,
  closed_at timestamptz
);

create index game_sessions_abertas on game_sessions (user_id) where closed_at is null;

alter table game_sessions enable row level security;

-- O jogador PODE ler a propria sessao (a UI mostra em qual hunt esta), mas nao
-- pode criar, alterar nem fechar: isso e exatamente o que o servidor faz com a
-- `service_role`, que ignora RLS. Sem policy de insert/update/delete, qualquer
-- tentativa do cliente casa zero linhas.
--
-- Cuidado ao testar: um DELETE do cliente volta **200, nao 403** — a RLS
-- simplesmente nao encontra linha pra apagar. Teste adversarial tem que
-- afirmar o efeito no banco, nunca o status code.
create policy "jogador le a propria sessao" on game_sessions
  for select to authenticated using (auth.uid() = user_id);


-- ==== 20260807010000_semear_hunts_desbloqueadas.sql ====
-- Jogador novo nascia com `unlocked_maps` VAZIO.
--
-- `handle_new_user` fazia `insert into players (user_id)` e a coluna caia no
-- default `'{}'`. A regra do jogo e outra: toda hunt SEM custo de desbloqueio
-- nasce liberada (era `DEFAULT_UNLOCKED_MAPS` no jogo vanilla).
--
-- No cliente isso passava despercebido porque hoje nenhum mapa tem
-- `unlock_cost`: o cartao da hunt so mostrava "Desbloquear" em vez de "Entrar",
-- e desbloquear de graca funcionava. Com o servidor virando a autoridade
-- (Fase D) o mesmo dado vira bloqueio duro — ele recusa `sessao/abrir` com
-- "hunt nao desbloqueada", e corretamente: o banco dizia que o jogador nao tem
-- hunt nenhuma. Foi assim que o bug apareceu.
--
-- A lista sai de `maps`, e nao e uma constante escrita a mao aqui: adicionar uma
-- hunt nova (ou dar custo a uma existente) continua funcionando sozinho, sem
-- ninguem lembrar de vir editar uma migration.

create or replace function dev.hunts_iniciais()
returns text[]
language sql
stable
-- search_path travado: esta funcao e chamada de dentro de um SECURITY DEFINER,
-- onde um search_path herdado do chamador e vetor de escalonamento.
set search_path = ''
as $$
  select coalesce(array_agg(id order by sort_order), '{}')
  from dev.maps
  where unlock_cost is null
$$;

-- Jogadores que ja existem: preenche so quem esta vazio. Quem ja desbloqueou
-- coisa (ou perdeu acesso a algo de proposito) nao e tocado.
update dev.players
set unlocked_maps = dev.hunts_iniciais()
where unlocked_maps = '{}';

-- E daqui pra frente, na criacao da linha.
create or replace function dev.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into dev.players (user_id, unlocked_maps)
  values (new.id, dev.hunts_iniciais());

  -- Estoque inicial (o jogo comeca com 10.000 de cada consumivel vendavel).
  insert into dev.player_items (user_id, item_id, quantity)
  select new.id, id, 10000
  from dev.items
  where kind in ('ball', 'potion', 'revive');

  return new;
end;
$$;


-- ==== 20260807030000_cliente_perde_a_escrita.sql ====
-- O cliente deixa de poder ESCREVER progresso. Este e o commit que realmente
-- fecha o buraco da Fase D.
--
-- Ate aqui, todo o trabalho do servidor de autoridade era voluntario: o cliente
-- *parava* de escrever (o early-return em gameStatePersistence), mas nada o
-- *impedia*. Qualquer jogador com o DevTools aberto continuava conseguindo
--
--     update players set gold = 999999999 where user_id = auth.uid()
--
-- porque a policy `own rows all` dava insert/update/delete pra quem estivesse
-- logado. Politica de RLS e a unica barreira real aqui — codigo de cliente nao e
-- barreira nenhuma, e o `anon`/`authenticated` key vai dentro do bundle.
--
-- A partir daqui, quem escreve nestas 5 tabelas e SO a `service_role` (o
-- servico Node), que ignora RLS por definicao. O jogador continua LENDO o
-- proprio progresso — a UI precisa disso, e leitura nao e vetor de fraude aqui.
--
-- CONSEQUENCIA QUE NAO E EFEITO COLATERAL, E O PONTO: o jogo para de funcionar
-- sem o servidor. O caminho de fallback (sem `VITE_SERVIDOR_URL`) escreve direto
-- no Postgres e passa a falhar. Isso e deliberado — um modo que grava sem
-- passar pelo servidor e exatamente a brecha que esta sendo fechada.

-- players ---------------------------------------------------------------------
-- A policy de update sai; a de leitura fica. Nao existia policy de insert (a
-- linha nasce pelo trigger `handle_new_user`, que e SECURITY DEFINER) nem de
-- delete, entao nao ha o que revogar ali.
drop policy if exists "own row update" on players;

-- As demais usavam `for all`, que cobre select+insert+update+delete de uma vez.
-- Cada uma vira uma policy de SELECT apenas.
drop policy if exists "own rows all" on pokemon_instances;
create policy "jogador le os proprios pokemon" on pokemon_instances
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "own rows all" on player_items;
create policy "jogador le os proprios itens" on player_items
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "own rows all" on player_pokedex;
create policy "jogador le a propria pokedex" on player_pokedex
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "own rows all" on player_auto_catch_rules;
create policy "jogador le as proprias regras" on player_auto_catch_rules
  for select to authenticated using (auth.uid() = user_id);

-- Nota pra quem for testar isto: um INSERT/UPDATE/DELETE bloqueado por RLS
-- devolve **200/204, nao 403** — o PostgREST simplesmente nao encontra linha que
-- case com a policy. Afirmar o status code num teste adversarial daria falso
-- negativo. Tem que afirmar o EFEITO no banco, lido com a service_role.


-- ==== 20260807120000_sessao_guarda_o_estado_do_sorteio.sql ====
-- A sessao passa a guardar o ESTADO ATUAL do sorteio, nao so a semente de origem.
--
-- O bug que isto corrige: `aplicarFlush` fazia `createRng(sessao.seed)` a cada
-- flush. Como a semente e imutavel e o cliente liquida de 30 em 30 segundos, TODO
-- flush recomecava a mesma sequencia do zero — mesmos inimigos, mesmos niveis,
-- mesmos IVs, mesma raridade, mesmo shiny. O jogador recebia a mesma especie
-- repetida indefinidamente (foi assim que apareceu: "varias copias iguais de uma
-- vez"), e na pratica o jogo inteiro era um loop de 30 segundos.
--
-- `seed` continua existindo e continua IMUTAVEL de proposito: ela e a origem
-- auditavel da sessao ("esta partida nasceu desta semente"). `rng_state` e onde
-- a sequencia esta agora. Misturar as duas na mesma coluna economizaria um
-- campo e perderia a capacidade de reproduzir a sessao desde o comeco.
alter table game_sessions
  -- Mesmo motivo de `seed` ser int8: o estado e um inteiro de 32 bits COM SINAL
  -- no motor (mulberry32, `state | 0`) e o Postgres nao tem uint32.
  add column rng_state bigint not null default 0,
  -- Contador de sorteios. So diagnostico — permite ver quantos numeros uma
  -- sessao ja consumiu sem ter que re-simular.
  add column rng_draws bigint not null default 0;

-- Sessoes que ja existem nunca avancaram o estado (era esse o bug). Comecar do
-- proprio seed as deixa exatamente onde a versao antiga as deixava, e dali em
-- diante a sequencia passa a avancar de verdade.
update game_sessions set rng_state = seed;

alter table game_sessions alter column rng_state drop default;


-- ==== 20260807130000_sessao_map_id_sem_fk.sql ====
-- `game_sessions.map_id` tinha um FK pra `maps(id)`. As hunts do Modo Pesadelo
-- e as 11 hunts BOSS sao geradas em RUNTIME (data/nightmareMaps.ts) e NUNCA
-- entram na tabela `maps` — abrir sessao numa delas violava o FK, o INSERT
-- estourava e o `/sessao/abrir` respondia 502. Resultado: todo o endgame (19
-- espelhos do Pesadelo + 11 BOSS) era injogavel sob autoridade do servidor, que
-- e o unico modo desde que a RLS foi revogada.
--
-- O FK era redundante: o servidor JA valida em codigo que o mapa existe
-- (`app.ts#abrirSessao`: `if (!MAPS[mapId]) 400`), que a hunt esta desbloqueada
-- e que o continente esta liberado — a mesma regra real do jogo que o fix de
-- desbloqueio do D3 adotou no lugar de confiar na coluna `unlocked_maps`. A
-- coluna continua `text not null`; so o vinculo com o catalogo sai.
--
-- Dropar pelo nome real (achado em `pg_constraint`), e nao por um
-- `drop constraint if exists game_sessions_map_id_fkey`: se o nome divergisse do
-- palpite, o IF EXISTS no-op deixaria o FK vivo e o bug de pe — em silencio,
-- justamente o modo de falha que este projeto recusa.
do $$
declare
  nome text;
begin
  select conname into nome
  from pg_constraint
  where conrelid = 'dev.game_sessions'::regclass
    and contype = 'f'
    and confrelid = 'dev.maps'::regclass;
  if nome is not null then
    execute format('alter table dev.game_sessions drop constraint %I', nome);
  end if;
end $$;


-- ==== 20260808120000_rotina_de_wipe.sql ====
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

create or replace function dev.wipe_todos_os_saves()
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
    delete from dev.pokemon_instances returning 1
  )
  select count(*) into n_pokes from apagados;

  delete from dev.player_items;
  delete from dev.player_pokedex;
  delete from dev.player_auto_catch_rules;

  with fechadas as (
    update dev.game_sessions
    set closed_at = now()
    where closed_at is null
    returning 1
  )
  select count(*) into n_sessoes from fechadas;

  -- Volta cada coluna de progresso ao DEFAULT declarado no schema, em vez de
  -- repetir os valores aqui: mudar o ouro inicial numa migration futura passa a
  -- valer no wipe sem ninguem lembrar de vir editar esta funcao.
  with resetados as (
    update dev.players
    set trainer_name = default,
        trainer_level = default,
        trainer_exp = default,
        gold = default,
        diamonds = default,
        active_team_index = default,
        current_map_id = null,
        unlocked_maps = dev.hunts_iniciais(),
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
  insert into dev.player_items (user_id, item_id, quantity)
  select p.user_id, i.id, 10000
  from dev.players p
  cross join dev.items i
  where i.kind in ('ball', 'potion', 'revive');

  return query select n_jogadores, n_pokes, n_sessoes;
end;
$$;

-- CRITICO: `create function` sai com EXECUTE pra `public`, e toda funcao no
-- schema `public` e chamavel por RPC (`POST /rest/v1/rpc/<nome>`) com a anon key
-- que vai no bundle do jogo. Sem este revoke, QUALQUER visitante apagaria o
-- progresso de todos os jogadores com um fetch. So a service_role (que nunca sai
-- do servidor) pode chamar.
revoke all on function dev.wipe_todos_os_saves() from public;
revoke all on function dev.wipe_todos_os_saves() from anon;
revoke all on function dev.wipe_todos_os_saves() from authenticated;
grant execute on function dev.wipe_todos_os_saves() to service_role;


-- ==== 20260808121000_wipe_com_where_explicito.sql ====
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

create or replace function dev.wipe_todos_os_saves()
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
    delete from dev.pokemon_instances where true returning 1
  )
  select count(*) into n_pokes from apagados;

  delete from dev.player_items where true;
  delete from dev.player_pokedex where true;
  delete from dev.player_auto_catch_rules where true;

  with fechadas as (
    update dev.game_sessions
    set closed_at = now()
    where closed_at is null
    returning 1
  )
  select count(*) into n_sessoes from fechadas;

  -- DEFAULT por coluna em vez de valores repetidos aqui: mudar o ouro inicial
  -- numa migration futura passa a valer no wipe sozinho.
  with resetados as (
    update dev.players
    set trainer_name = default,
        trainer_level = default,
        trainer_exp = default,
        gold = default,
        diamonds = default,
        active_team_index = default,
        current_map_id = null,
        unlocked_maps = dev.hunts_iniciais(),
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
  insert into dev.player_items (user_id, item_id, quantity)
  select p.user_id, i.id, 10000
  from dev.players p
  cross join dev.items i
  where i.kind in ('ball', 'potion', 'revive');

  return query select n_jogadores, n_pokes, n_sessoes;
end;
$$;

-- `create or replace` NAO preserva os grants revogados da versao anterior de
-- forma obvia — repetir e o que garante que uma funcao capaz de apagar o banco
-- inteiro nunca fique chamavel com a anon key que vai no bundle do jogo.
revoke all on function dev.wipe_todos_os_saves() from public;
revoke all on function dev.wipe_todos_os_saves() from anon;
revoke all on function dev.wipe_todos_os_saves() from authenticated;
grant execute on function dev.wipe_todos_os_saves() to service_role;


-- ==== 20260808150000_novos_valores_iniciais.sql ====
-- Novos valores iniciais de conta, e a fonte unica que os define.
--
-- Pedido explicito do usuario: todo jogador novo comeca com exatamente
-- 100 Poke Ball, 10 Revive, 100 Potion, 1000 de ouro e 0 diamantes.
-- Era 10.000 de CADA consumivel vendavel (4 bolas, 4 pocoes, 2 revives),
-- 500.000 de ouro e 5 diamantes.
--
-- Tres lugares precisavam concordar sobre "o que e uma conta nova":
-- `handle_new_user` (conta criada), `wipe_todos_os_saves` (reset total) e
-- agora o wipe parcial de inventario. Ate aqui a lista estava COPIADA em
-- dois deles (`select id from items where kind in (...)` com 10000 fixo) —
-- mudar o valor exigia lembrar dos dois. Vira uma funcao so.

-- ---------------------------------------------------------------------------
-- 1. A concessao inicial, num lugar so
-- ---------------------------------------------------------------------------
-- Retorna as linhas de `player_items` de uma conta nova. Item que nao esta
-- aqui simplesmente nao e concedido (nao vira linha com quantidade 0): o
-- resto do jogo trata "ausente" e "0" igual, e a Mochila nao lista o que o
-- jogador nao tem.
--
-- Os ids sao literais de proposito, ao contrario da versao anterior, que
-- derivava de `kind`. "Toda bola/pocao/revive do catalogo" deixou de valer:
-- agora so a bola COMUM, a pocao COMUM e o Revive entram — Great/Ultra/
-- Premier Ball, Super/Hyper/Max Potion e Max Revive passam a ser conquista,
-- nao concessao. Derivar de `kind` daria 10 itens, nao 3.
create or replace function dev.concessao_inicial_de_itens()
returns table (item_id text, quantity int)
language sql
immutable
set search_path = ''
as $$
  select * from (values
    ('poke_ball', 100),
    ('potion',    100),
    ('revive',     10)
  ) as concessao(item_id, quantity)
$$;

revoke all on function dev.concessao_inicial_de_itens() from public;
revoke all on function dev.concessao_inicial_de_itens() from anon;
revoke all on function dev.concessao_inicial_de_itens() from authenticated;
grant execute on function dev.concessao_inicial_de_itens() to service_role;

-- ---------------------------------------------------------------------------
-- 2. Defaults da linha de `players`
-- ---------------------------------------------------------------------------
-- O wipe (total e parcial) reseta por `= default`, entao mudar aqui e o que
-- faz o valor novo valer nos dois sem editar as rotinas.
alter table dev.players alter column gold set default 1000;
alter table dev.players alter column diamonds set default 0;

-- Configuracao inicial do Bot (pedido explicito): pocao a 50% de vida,
-- auto-catch e auto-revive DESLIGADOS. Antes: pocao a 40%, os tres ligados.
-- O tutorial do Bot (cliente) parte exatamente deste estado.
alter table dev.players alter column auto_toggles
  set default '{"autoPot":true,"autoCatch":false,"autoRevive":false}';
alter table dev.players alter column auto_pot_rules
  set default '[{"hpPercent":50,"itemId":"potion"}]';

-- ---------------------------------------------------------------------------
-- 3. Conta nova passa a usar a concessao acima
-- ---------------------------------------------------------------------------
create or replace function dev.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into dev.players (user_id, unlocked_maps)
  values (new.id, dev.hunts_iniciais());

  insert into dev.player_items (user_id, item_id, quantity)
  select new.id, c.item_id, c.quantity
  from dev.concessao_inicial_de_itens() c;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Wipe TOTAL passa a usar a mesma concessao
-- ---------------------------------------------------------------------------
-- Mesma funcao de antes (ver 20260808121000), so trocando o bloco de itens.
-- `where true` continua obrigatorio: a extensao pg_safeupdate roda no papel
-- que a API REST usa e recusa DELETE/UPDATE sem WHERE mesmo dentro de um
-- SECURITY DEFINER.
create or replace function dev.wipe_todos_os_saves()
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
    delete from dev.pokemon_instances where true returning 1
  )
  select count(*) into n_pokes from apagados;

  delete from dev.player_items where true;
  delete from dev.player_pokedex where true;
  delete from dev.player_auto_catch_rules where true;

  with fechadas as (
    update dev.game_sessions
    set closed_at = now()
    where closed_at is null
    returning 1
  )
  select count(*) into n_sessoes from fechadas;

  with resetados as (
    update dev.players
    set trainer_name = default,
        trainer_level = default,
        trainer_exp = default,
        gold = default,
        diamonds = default,
        active_team_index = default,
        current_map_id = null,
        unlocked_maps = dev.hunts_iniciais(),
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

  insert into dev.player_items (user_id, item_id, quantity)
  select p.user_id, c.item_id, c.quantity
  from dev.players p
  cross join dev.concessao_inicial_de_itens() c;

  return query select n_jogadores, n_pokes, n_sessoes;
end;
$$;

revoke all on function dev.wipe_todos_os_saves() from public;
revoke all on function dev.wipe_todos_os_saves() from anon;
revoke all on function dev.wipe_todos_os_saves() from authenticated;
grant execute on function dev.wipe_todos_os_saves() to service_role;

-- ---------------------------------------------------------------------------
-- 5. Wipe PARCIAL: so inventario e economia
-- ---------------------------------------------------------------------------
-- Pedido explicito: "resetar o inventario e economia de TODOS os jogadores
-- do servidor para os novos valores iniciais". POKEs, Pokedex, nivel de
-- treinador, hunts desbloqueadas e configuracao do Bot NAO sao tocados — o
-- jogador perde o estoque, nao o progresso.
--
-- As travas de item (`player_items.locked`) se perdem junto, porque a linha
-- inteira e reescrita. Preservar trava de um item que o jogador nao tem mais
-- nao significa nada, e manter linha so pela trava faria a Mochila listar
-- item zerado.
--
-- Sessao de hunt aberta NAO e fechada: ela nao guarda inventario, e fechar
-- por conta propria descartaria o tempo ja farmado desde o ultimo flush.
create or replace function dev.wipe_inventario_e_economia()
returns table (jogadores_afetados bigint, linhas_de_item_apagadas bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  n_itens bigint;
  n_jogadores bigint;
begin
  with apagados as (
    delete from dev.player_items where true returning 1
  )
  select count(*) into n_itens from apagados;

  with resetados as (
    update dev.players
    set gold = default,
        diamonds = default,
        updated_at = now()
    where true
    returning 1
  )
  select count(*) into n_jogadores from resetados;

  insert into dev.player_items (user_id, item_id, quantity)
  select p.user_id, c.item_id, c.quantity
  from dev.players p
  cross join dev.concessao_inicial_de_itens() c;

  return query select n_jogadores, n_itens;
end;
$$;

-- Mesma razao do wipe total: toda funcao em `public` e chamavel por RPC com
-- a anon key que vai no bundle do jogo. Sem o revoke, qualquer visitante
-- zeraria o inventario de todo mundo com um fetch.
revoke all on function dev.wipe_inventario_e_economia() from public;
revoke all on function dev.wipe_inventario_e_economia() from anon;
revoke all on function dev.wipe_inventario_e_economia() from authenticated;
grant execute on function dev.wipe_inventario_e_economia() to service_role;

-- ---------------------------------------------------------------------------
-- 6. Aplica o wipe parcial agora, uma vez
-- ---------------------------------------------------------------------------
-- E o que o pedido descreve ("crie um script de migracao ... para resetar").
-- Rodar aqui dentro garante atomicidade com os defaults novos: nao existe
-- janela em que a conta ja foi zerada mas o default antigo ainda vale.
select dev.wipe_inventario_e_economia();

-- Configuracao do Bot dos jogadores que JA existem: alinhada com o default
-- novo. Sem isto, so conta criada a partir de agora teria auto-catch/revive
-- desligados, e o tutorial do Bot explicaria uma tela que nao bate com o que
-- o jogador ve.
update dev.players
set auto_toggles = '{"autoPot":true,"autoCatch":false,"autoRevive":false}',
    auto_pot_rules = '[{"hpPercent":50,"itemId":"potion"}]',
    updated_at = now()
where true;


-- ==== 20260808160000_ranking_e_perfil.sql ====
-- Ranking, Hall da Fama e as duas metricas do Perfil do Treinador que ainda
-- nao existiam em lugar nenhum.
--
-- Nada aqui e lido pelo cliente: as tres tabelas/colunas so sao consultadas
-- pelo servico de autoridade, com a `service_role`. As policies refletem
-- isso (RLS ligada, nenhuma policy pro papel `authenticated`) — um ranking
-- lido direto do navegador exporia a linha inteira de `players` de todo
-- mundo, nao so nome e nivel.

-- ---------------------------------------------------------------------------
-- 1. Tempo de jogo — sem coluna nova
-- ---------------------------------------------------------------------------
-- "Tempo de jogo" tem que ser o tempo REALMENTE simulado, nao a idade da
-- conta: quem criou conta ha um ano e jogou uma tarde nao tem um ano de jogo.
-- Esse numero JA e acumulado por sessao em `game_sessions.simulated_seconds`
-- (cada flush soma o intervalo creditado), e as sessoes fechadas continuam na
-- tabela — entao o total do jogador e a soma das linhas dele.
--
-- Uma coluna `players.play_seconds` seria O(1) na leitura, mas custaria uma
-- escrita a mais em TODO flush (30 em 30 segundos por jogador ativo) pra um
-- dado consultado so quando alguem abre o Perfil. O indice abaixo torna a
-- soma barata.
create index if not exists game_sessions_por_jogador_idx
  on dev.game_sessions (user_id);

-- ---------------------------------------------------------------------------
-- 2. Hall da Fama
-- ---------------------------------------------------------------------------
-- Quem derrota o Campeao Lance ganha `kanto` em `unlocked_continents` — mas
-- essa coluna nao guarda QUANDO, e "os primeiros a completar" e uma ordem
-- por tempo. Uma tabela propria tambem deixa o recurso aberto pra outras
-- conquistas sem mais nenhuma migration.
create table if not exists dev.hall_da_fama (
  user_id uuid not null references dev.players(user_id) on delete cascade,
  conquista text not null,
  conquistado_em timestamptz not null default now(),
  primary key (user_id, conquista)
);

-- A consulta do Hall e sempre "os N primeiros de uma conquista".
create index if not exists hall_da_fama_ordem_idx
  on dev.hall_da_fama (conquista, conquistado_em);

alter table dev.hall_da_fama enable row level security;
-- Sem policy pra anon/authenticated: so a service_role (que ignora RLS)
-- enxerga. O ranking chega ao jogador pela rota do servidor, ja recortado
-- em nome + data.
grant select, insert on dev.hall_da_fama to service_role;

-- ---------------------------------------------------------------------------
-- 3. Indices de ranking
-- ---------------------------------------------------------------------------
-- Ranking de treinadores ordena por nivel e desempata por EXP; o "Rank #" do
-- Perfil conta quantos tem EXP maior. Os dois usam o mesmo indice.
create index if not exists players_ranking_idx
  on dev.players (trainer_exp desc, trainer_level desc);

-- Ranking de POKE por nivel. Os outros seis criterios (os atributos) NAO
-- ganham indice de proposito: seriam mais seis indices mantidos a cada
-- escrita de POKE, e a tabela hoje tem ordem de milhares de linhas — o scan
-- e mais barato que o custo permanente. Revisar se a base crescer de escala.
create index if not exists pokemon_instances_level_idx
  on dev.pokemon_instances (level desc);


-- ==== 20260808180000_treinador_original.sql ====
-- Treinador original: quem capturou o POKE, gravado no momento da captura.
--
-- Por que uma coluna nova em vez de derivar de `players.trainer_name` pelo
-- `user_id`: o nome do dono responde "de quem e agora", e o nome pode ser
-- trocado depois. O registro de captura precisa ser imutavel — e o unico dado
-- que sobrevive a uma renomeacao, e o unico que continuaria correto se algum
-- dia existir troca entre jogadores (nao existe hoje).
--
-- Nullable de proposito: POKE criado antes desta migration nao tem como saber
-- quem o capturou de verdade. O backfill abaixo usa o nome do dono ATUAL, que
-- e a melhor aproximacao possivel enquanto nao ha troca — mas linha nova
-- continua podendo nascer sem valor (ex.: um caminho de criacao futuro que
-- esqueca de preencher), e a UI trata ausencia em vez de mostrar "null".
alter table dev.pokemon_instances
  add column if not exists original_trainer text;

-- Backfill: sem troca no jogo, o dono atual E quem capturou. Uma vez so; a
-- partir daqui quem grava e a captura.
update dev.pokemon_instances pi
set original_trainer = p.trainer_name
from dev.players p
where pi.user_id = p.user_id
  and pi.original_trainer is null;


-- ==== 20260808200000_pokemon_pode_estar_no_mercado.sql ====
-- Um POKE anunciado no Mercado precisa sair do inventario do vendedor sem sair
-- do banco: ele ainda existe, ainda tem dono registrado, e volta pra mochila
-- (dele ou do comprador) quando o anuncio termina.
--
-- Por que um valor NOVO de enum e nao uma coluna `anunciado boolean`:
-- `snapshotToGameState` monta o estado do jogador filtrando `location` em
-- 'team'/'bag'. Com um valor que nao e nenhum dos dois, o POKE some do estado
-- do vendedor sozinho — inclusive da Loja, onde ele poderia ser vendido pro
-- sistema enquanto estivesse anunciado. Com uma coluna booleana, cada leitura
-- teria que lembrar de filtrar, e a que esquecesse virava venda dupla.
--
-- ISTO PRECISA SER UMA MIGRATION SEPARADA: Postgres proibe USAR um valor de
-- enum na mesma transacao em que ele foi adicionado ("unsafe use of new value").
-- As tabelas do Mercado, que referenciam esse estado em codigo, vao no arquivo
-- seguinte.
alter type pokemon_location add value if not exists 'market';


-- ==== 20260808201000_mercado_chat_correio_amizades.sql ====
-- Os tres sistemas sociais do jogo, que ate aqui nao existiam em lugar nenhum:
-- Mercado entre jogadores, Chat Mundo e Correio/Amizades.
--
-- REGRA DE ACESSO: nenhuma destas tabelas ganha policy pra `authenticated`.
-- Todo acesso passa pelo servico de autoridade (service_role). Nao e excesso de
-- zelo — uma ordem de venda guarda ESCROW (item que saiu do inventario) e uma
-- entrega guarda ouro a creditar; qualquer escrita direta do cliente aqui seria
-- impressao de dinheiro, e leitura direta exporia o inventario de terceiros.
--
-- Toda tabela abaixo e enable RLS + grant so pra service_role. Sem grant, ate a
-- service_role morre com 42501 (grants deixaram de ser automaticos no schema
-- public em projetos Supabase novos — ver a nota no schema inicial).

-- ===========================================================================
-- 1. Nome de treinador: escolhido no cadastro e unico
-- ===========================================================================
-- "Adicionar amigo pelo nick" e "ver de quem e o POKE do ranking" so funcionam
-- se o nick identificar uma pessoa. Hoje ele nao identifica: `trainer_name`
-- nasce com o default 'Treinador' pra todo mundo.
--
-- De-duplica o que ja existe ANTES de criar o indice unico, senao a migration
-- falha nos 57 jogadores atuais. O sufixo usa os 4 primeiros caracteres do
-- user_id: curto, estavel e nao colide.
update dev.players p
set trainer_name = p.trainer_name || '#' || left(p.user_id::text, 4)
where exists (
  select 1 from dev.players q
  where lower(q.trainer_name) = lower(p.trainer_name)
    and q.user_id <> p.user_id
);

create unique index if not exists players_trainer_name_unico
  on dev.players (lower(trainer_name));

-- Disponibilidade do nick ANTES de o cadastro ser enviado. E consulta de
-- existencia, nao leitura de linha: devolve boolean e nada mais, entao pode
-- ser chamada por quem ainda nem tem conta (a tela de cadastro roda como
-- `anon`). Sem ela, o unico jeito de descobrir que o nome esta em uso seria
-- criar a conta e receber um erro de constraint.
create or replace function dev.nome_de_treinador_disponivel(nome text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from dev.players where lower(trainer_name) = lower(trim(nome))
  )
$$;

revoke all on function dev.nome_de_treinador_disponivel(text) from public;
grant execute on function dev.nome_de_treinador_disponivel(text) to anon, authenticated, service_role;

-- O nome escolhido viaja em `raw_user_meta_data` (options.data do signUp) e e
-- gravado na MESMA transacao que cria a conta. Alternativa seria o cliente
-- fazer um UPDATE logo apos o cadastro — que a RLS (corretamente) proibe desde
-- a Fase D, e que deixaria uma janela com o nome errado.
--
-- Colisao aqui e ultimo recurso (a tela ja checou): em vez de derrubar o
-- cadastro com "Database error saving new user", desambigua com sufixo. Perder
-- a conta por causa de um nick e desproporcional.
create or replace function dev.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pedido text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'trainer_name', '')), '');
  escolhido text;
begin
  escolhido := coalesce(pedido, 'Treinador');
  if exists (select 1 from dev.players where lower(trainer_name) = lower(escolhido)) then
    escolhido := escolhido || '#' || left(new.id::text, 4);
  end if;

  insert into dev.players (user_id, trainer_name, unlocked_maps)
  values (new.id, escolhido, dev.hunts_iniciais());

  insert into dev.player_items (user_id, item_id, quantity)
  select new.id, c.item_id, c.quantity
  from dev.concessao_inicial_de_itens() c;

  return new;
end;
$$;

-- ===========================================================================
-- 2. Mercado — livro de ofertas de ITENS
-- ===========================================================================
-- Modelo pedido: "leilao/livro de ofertas, semelhante ao Mercado Comunitario da
-- Steam". Ou seja duas filas por item (compra e venda) que se cruzam por preco.
--
-- `item_id` NAO tem FK pra `items`: as 17 Pedras de evolucao sao conteudo
-- hand-authored do cliente (data/stones.ts) e nunca entraram no catalogo do
-- banco. Uma FK aqui proibiria negociar exatamente o item mais escasso do jogo.
--
-- ESCROW e o que impede vender o que nao se tem: criar uma ordem de VENDA tira
-- os itens do inventario na hora, e criar uma de COMPRA tira o ouro. O que
-- sobra volta no cancelamento. Sem escrow, duas ordens de venda do mesmo
-- estoque venderiam o dobro do que existe.
create table dev.market_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null,
  side text not null check (side in ('compra', 'venda')),
  unit_price int not null check (unit_price > 0 and unit_price <= 100000000),
  quantity int not null check (quantity > 0),
  remaining int not null check (remaining >= 0),
  -- Ouro ainda retido por esta ordem de compra (0 em ordens de venda). Guardado
  -- explicitamente, e nao recalculado de `remaining * unit_price`, porque a
  -- ordem agressora pode executar mais barato que o proprio limite — o troco ja
  -- foi devolvido e o retido nao bate mais com a multiplicacao.
  gold_retido int not null default 0 check (gold_retido >= 0),
  status text not null default 'ativa' check (status in ('ativa', 'concluida', 'cancelada')),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint market_orders_remaining_cabe check (remaining <= quantity)
);

-- O casamento varre "melhor preco primeiro, mais antiga primeiro" dentro de um
-- item. Este e o unico caminho de leitura quente do Mercado.
create index market_orders_livro_idx
  on dev.market_orders (item_id, side, unit_price, created_at)
  where status = 'ativa';
create index market_orders_do_jogador_idx on dev.market_orders (user_id, created_at desc);

-- ===========================================================================
-- 3. Mercado — anuncios de POKE (preco fixo)
-- ===========================================================================
-- Pedido explicito: POKE nao entra no livro de ofertas; o vendedor define um
-- preco fixo em Gold ou Diamante. Faz sentido no dado: um item e fungivel (100
-- Poke Ball sao 100 Poke Ball), um POKE nao — IV, raridade e shiny fazem cada
-- linha ser unica, e nao existe "melhor preco" entre coisas diferentes.
create table dev.market_listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references auth.users(id) on delete cascade,
  -- `restrict` de proposito: apagar um POKE que esta anunciado deixaria o
  -- anuncio orfao. Quem cancela/vende o anuncio devolve o POKE antes.
  poke_uid uuid not null references dev.pokemon_instances(id) on delete restrict,
  price int not null check (price > 0 and price <= 100000000),
  currency text not null check (currency in ('gold', 'diamond')),
  status text not null default 'ativo' check (status in ('ativo', 'vendido', 'cancelado')),
  -- Copias desnormalizadas pra vitrine: a busca do comprador filtra por
  -- especie/nivel/raridade/shiny sem precisar juntar com `pokemon_instances`
  -- (que a service_role le, mas que traria a linha inteira de outro jogador).
  species_id text not null,
  level int not null,
  rarity rarity_tier not null,
  is_shiny boolean not null default false,
  iv_percent int not null default 0,
  created_at timestamptz not null default now(),
  sold_at timestamptz,
  buyer_id uuid references auth.users(id) on delete set null
);

create unique index market_listings_um_anuncio_ativo_por_poke
  on dev.market_listings (poke_uid) where status = 'ativo';
create index market_listings_vitrine_idx
  on dev.market_listings (species_id, price) where status = 'ativo';
create index market_listings_do_vendedor_idx on dev.market_listings (seller_id, created_at desc);

-- ===========================================================================
-- 4. Mercado — historico
-- ===========================================================================
-- Tabela propria, e nao "ordens com status concluida": uma unica ordem de venda
-- de 100 unidades pode casar com 7 compradores diferentes a precos diferentes.
-- O historico e por NEGOCIO, nao por ordem.
create table dev.market_trades (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('item', 'poke')),
  item_id text,
  species_id text,
  quantity int not null default 1 check (quantity > 0),
  unit_price int not null check (unit_price > 0),
  currency text not null default 'gold' check (currency in ('gold', 'diamond')),
  buyer_id uuid references auth.users(id) on delete set null,
  seller_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index market_trades_recentes_idx on dev.market_trades (created_at desc);
create index market_trades_por_item_idx on dev.market_trades (item_id, created_at desc) where item_id is not null;

-- ===========================================================================
-- 5. Entregas pendentes
-- ===========================================================================
-- O PROBLEMA QUE ESTA TABELA RESOLVE: quando A compra de B, B pode estar
-- offline — ou pior, no meio de um flush. O servidor grava o estado do jogador
-- reescrevendo o snapshot inteiro (`gravarEstado`), entao creditar ouro na
-- linha de B com um UPDATE solto seria sobrescrito pelo flush de B segundos
-- depois, sem erro nenhum aparecer.
--
-- Em vez disso o credito vira uma LINHA. Ela e reivindicada (claim atomico:
-- update ... where claimed_at is null returning) dentro do proprio request de B,
-- e aplicada ao estado que aquele request ja vai gravar. Nao ha janela.
create table dev.market_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  gold int not null default 0 check (gold >= 0),
  diamonds int not null default 0 check (diamonds >= 0),
  item_id text,
  quantity int not null default 0 check (quantity >= 0),
  motivo text not null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);

create index market_deliveries_pendentes_idx
  on dev.market_deliveries (user_id) where claimed_at is null;

-- ===========================================================================
-- 6. Chat Mundo
-- ===========================================================================
-- So mensagem DE JOGADOR. Aviso de sistema, log de combate e resultado de
-- compra continuam vivendo no cliente (toastStore) — pedido explicito: "isole o
-- Chat Mundo para que ele receba apenas mensagens ao vivo enviadas por outros
-- jogadores".
--
-- `anexos` guarda os links de item/POKE que o jogador injetou com Shift+clique.
-- Guardar o SNAPSHOT (nome, nivel, IV, raridade) e nao so um id e deliberado: o
-- POKE pode ser vendido ou evoluir depois, e o link tem que continuar mostrando
-- o que foi mostrado na hora — alem de nao dar a ninguem um jeito de consultar
-- POKE alheio por id.
create table dev.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trainer_name text not null,
  body text not null check (char_length(body) between 1 and 240),
  anexos jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index chat_messages_recentes_idx on dev.chat_messages (created_at desc);

-- ===========================================================================
-- 7. Correio e amizades
-- ===========================================================================
create table dev.mail_messages (
  id uuid primary key default gen_random_uuid(),
  para_id uuid not null references auth.users(id) on delete cascade,
  de_id uuid references auth.users(id) on delete set null,
  de_nome text not null,
  tipo text not null check (tipo in ('texto', 'pedido_amizade', 'sistema')),
  assunto text not null,
  corpo text not null default '',
  -- 'pendente' so tem significado em pedido de amizade; mensagem de texto nasce
  -- 'pendente' e vira 'lido'. Um enum separado por tipo seria mais puro e
  -- obrigaria dois caminhos de leitura pra mesma caixa de entrada.
  estado text not null default 'pendente' check (estado in ('pendente', 'aceito', 'recusado', 'lido')),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index mail_messages_caixa_idx on dev.mail_messages (para_id, created_at desc);
-- Um pedido de amizade pendente por par. Sem isto, spam de "Adicionar amigo"
-- enche a caixa do destinatario com linhas identicas.
create unique index mail_messages_um_pedido_pendente
  on dev.mail_messages (para_id, de_id)
  where tipo = 'pedido_amizade' and estado = 'pendente';

-- Amizade e simetrica, e guardada nos DOIS sentidos (duas linhas por par). A
-- alternativa — uma linha com `least/greatest` — economiza metade das linhas e
-- custa um `or` em toda consulta de "meus amigos", que e a unica consulta que
-- existe aqui.
create table dev.friendships (
  user_id uuid not null references auth.users(id) on delete cascade,
  amigo_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, amigo_id),
  constraint amizade_nao_reflexiva check (user_id <> amigo_id)
);

-- ===========================================================================
-- 8. RLS e grants
-- ===========================================================================
alter table dev.market_orders     enable row level security;
alter table dev.market_listings   enable row level security;
alter table dev.market_trades     enable row level security;
alter table dev.market_deliveries enable row level security;
alter table dev.chat_messages     enable row level security;
alter table dev.mail_messages     enable row level security;
alter table dev.friendships       enable row level security;

-- Zero policy pra anon/authenticated: RLS ligada sem policy = ninguem fora da
-- service_role enxerga nada. Intencional — ver o cabecalho.
grant select, insert, update, delete on dev.market_orders     to service_role;
grant select, insert, update, delete on dev.market_listings   to service_role;
grant select, insert, update, delete on dev.market_trades     to service_role;
grant select, insert, update, delete on dev.market_deliveries to service_role;
grant select, insert, update, delete on dev.chat_messages     to service_role;
grant select, insert, update, delete on dev.mail_messages     to service_role;
grant select, insert, update, delete on dev.friendships       to service_role;


-- ==== 20260808202000_team_slot_aceita_pokemon_no_mercado.sql ====
-- A check `team_slot_required` foi escrita quando `pokemon_location` so tinha
-- dois valores, e enumerou os dois:
--
--   CHECK ( (location = 'team' AND team_slot IS NOT NULL)
--        OR (location = 'bag'  AND team_slot IS NULL) )
--
-- Ou seja: ela nao diz "team precisa de slot", ela diz "location so pode ser
-- team ou bag". Adicionar 'market' ao enum passou; gravar 'market' na coluna
-- estourava a check e o servidor respondia 502 "falha ao falar com o banco" —
-- exatamente o que o smoke do Mercado pegou ao anunciar um POKE.
--
-- Reescrita pra expressar a regra que realmente importa (POKE em campo TEM
-- slot; POKE fora de campo NAO tem), sem repetir a lista de valores do enum.
-- Um valor novo de `pokemon_location` no futuro passa a valer sozinho.
alter table dev.pokemon_instances drop constraint if exists team_slot_required;

alter table dev.pokemon_instances
  add constraint team_slot_required check (
    case when location = 'team' then team_slot is not null else team_slot is null end
  );


-- ==== 20260808203000_wipe_preserva_o_nick.sql ====
-- O wipe total resetava `trainer_name` junto com o resto (`= default`), o que
-- devolvia TODA conta pro nome 'Treinador'.
--
-- Isso agora quebra de duas formas ao mesmo tempo:
--
-- 1. Estoura. `players_trainer_name_unico` (indice unico sobre
--    `lower(trainer_name)`) foi criado nesta leva; 57 linhas voltando pro mesmo
--    nome viola a unicidade e o wipe inteiro aborta na transacao.
-- 2. E errado mesmo sem o indice. O nick deixou de ser um rotulo cosmetico: e
--    escolhido no cadastro, e a identidade publica do jogador (chat, ranking,
--    Mercado) e a chave que o Correio usa pra achar alguem. Wipe apaga
--    PROGRESSO — apagar a identidade junto quebraria toda amizade e todo
--    registro de `original_trainer` que aponta pra ele.
--
-- Unica mudanca: a linha `trainer_name = default` sai. O resto da rotina e
-- identica a versao anterior (20260808150000).
create or replace function dev.wipe_todos_os_saves()
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
    delete from dev.pokemon_instances where true returning 1
  )
  select count(*) into n_pokes from apagados;

  delete from dev.player_items where true;
  delete from dev.player_pokedex where true;
  delete from dev.player_auto_catch_rules where true;

  with fechadas as (
    update dev.game_sessions
    set closed_at = now()
    where closed_at is null
    returning 1
  )
  select count(*) into n_sessoes from fechadas;

  with resetados as (
    update dev.players
    set trainer_level = default,
        trainer_exp = default,
        gold = default,
        diamonds = default,
        active_team_index = default,
        current_map_id = null,
        unlocked_maps = dev.hunts_iniciais(),
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

  insert into dev.player_items (user_id, item_id, quantity)
  select p.user_id, c.item_id, c.quantity
  from dev.players p
  cross join dev.concessao_inicial_de_itens() c;

  return query select n_jogadores, n_pokes, n_sessoes;
end;
$$;

revoke all on function dev.wipe_todos_os_saves() from public;
revoke all on function dev.wipe_todos_os_saves() from anon;
revoke all on function dev.wipe_todos_os_saves() from authenticated;
grant execute on function dev.wipe_todos_os_saves() to service_role;

-- O wipe tambem precisa limpar o que os sistemas NOVOS acumularam. Sem isto,
-- "todo mundo comeca do zero" deixaria de pe ordens de mercado com escrow de um
-- inventario que nao existe mais, anuncios apontando pra POKE apagado, entregas
-- pendentes de ouro e amizades/mensagens de um mundo anterior.
--
-- `market_listings.poke_uid` tem FK `on delete restrict` de proposito (anuncio
-- orfao seria pior), entao os anuncios TEM que sair antes dos POKEs — por isso
-- e uma rotina separada, chamada antes do wipe de progresso, e nao um bloco
-- dentro dele.
create or replace function dev.wipe_mundo_social()
returns table (ordens bigint, anuncios bigint, negocios bigint, entregas bigint, mensagens bigint, amizades bigint, chat bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  n_ordens bigint; n_anuncios bigint; n_negocios bigint;
  n_entregas bigint; n_mensagens bigint; n_amizades bigint; n_chat bigint;
begin
  with x as (delete from dev.market_orders where true returning 1) select count(*) into n_ordens from x;
  with x as (delete from dev.market_listings where true returning 1) select count(*) into n_anuncios from x;
  with x as (delete from dev.market_trades where true returning 1) select count(*) into n_negocios from x;
  with x as (delete from dev.market_deliveries where true returning 1) select count(*) into n_entregas from x;
  with x as (delete from dev.mail_messages where true returning 1) select count(*) into n_mensagens from x;
  with x as (delete from dev.friendships where true returning 1) select count(*) into n_amizades from x;
  with x as (delete from dev.chat_messages where true returning 1) select count(*) into n_chat from x;
  return query select n_ordens, n_anuncios, n_negocios, n_entregas, n_mensagens, n_amizades, n_chat;
end;
$$;

revoke all on function dev.wipe_mundo_social() from public;
revoke all on function dev.wipe_mundo_social() from anon;
revoke all on function dev.wipe_mundo_social() from authenticated;
grant execute on function dev.wipe_mundo_social() to service_role;


-- ==== 20260808210000_concessao_inicial_200.sql ====
-- Concessao inicial: 200 Poke Ball e 200 Potion (era 100 de cada).
--
-- Pedido explicito do usuario. O Revive nao foi citado e fica nos 10.
--
-- So a funcao muda: `handle_new_user` (conta nova), `wipe_todos_os_saves`
-- (reset total) e `wipe_inventario_e_economia` (reset parcial) ja leem daqui,
-- entao os tres passam a valer o valor novo sem serem tocados. Era exatamente
-- pra isso que a lista virou funcao na migration 20260808150000.
--
-- Conta que JA existe nao e afetada: o pedido fala de jogador novo e de conta
-- resetada, e regravar inventario de quem esta jogando apagaria o que a pessoa
-- juntou.
create or replace function dev.concessao_inicial_de_itens()
returns table (item_id text, quantity int)
language sql
immutable
set search_path = ''
as $$
  select * from (values
    ('poke_ball', 200),
    ('potion',    200),
    ('revive',     10)
  ) as concessao(item_id, quantity)
$$;

-- Toda funcao no schema `public` e chamavel por RPC com a anon key que vai no
-- bundle do jogo. Esta so devolve constantes (nao ha estrago possivel), mas o
-- `revoke` acompanha as outras da familia: a regra e "funcao de servidor nao
-- fica exposta", nao "funcao perigosa nao fica exposta".
revoke all on function dev.concessao_inicial_de_itens() from public;
revoke all on function dev.concessao_inicial_de_itens() from anon;
revoke all on function dev.concessao_inicial_de_itens() from authenticated;
grant execute on function dev.concessao_inicial_de_itens() to service_role;


-- ==== 20260809120000_auto_pot_em_70.sql ====
-- Auto-pot passa a vir pre-configurado em 70% de vida (era 50%).
--
-- Pedido explicito do usuario: "o bot agora deve vir pre-configurado para
-- curar em 70%".
--
-- Duas coisas acontecem aqui, e a segunda e a delicada:
--
-- 1. O DEFAULT da coluna muda. E ele que vale pra conta nova (handle_new_user
--    nao escreve `auto_pot_rules`, deixa cair no default) e pros dois wipes,
--    que resetam com `auto_pot_rules = default`.
--
-- 2. Jogadores JA existentes so sao atualizados se a regra deles for
--    EXATAMENTE o default antigo. Quem mexeu na configuracao escolheu aquele
--    numero, e sobrescrever escolha de jogador com "novo balanceamento" e o
--    tipo de mudanca que aparece como bug pra quem a sofre. A comparacao e
--    feita sobre o jsonb inteiro (nao sobre `hpPercent`), entao trocar so a
--    pocao tambem conta como personalizado e e preservado.
--
-- O valor equivalente no cliente vive em src/stores/gameStateStore.ts
-- (DEFAULT_AUTO_POT_RULES). Os dois precisam concordar.

alter table dev.players alter column auto_pot_rules
  set default '[{"hpPercent":70,"itemId":"potion"}]'::jsonb;

update dev.players
   set auto_pot_rules = '[{"hpPercent":70,"itemId":"potion"}]'::jsonb
 where auto_pot_rules = '[{"hpPercent":50,"itemId":"potion"}]'::jsonb;


-- ==== 20260809140000_concessao_500_e_correio_com_itens.sql ====
-- 1) Concessao inicial passa a ser 500 Poke Ball, 500 Potion e 50 Revive.
-- 2) O Correio ganha ANEXO DE ITENS, com coleta explicita pelo jogador.
-- 3) Todo jogador que ja existe recebe a mesma concessao por Correio.
--
-- Os tres andam juntos de proposito: o item 3 e a compensacao do item 1 para
-- quem criou a conta antes, e ele so e possivel por causa do item 2.

-- ---------------------------------------------------------------------------
-- 1. Concessao inicial
-- ---------------------------------------------------------------------------
-- So a funcao muda: `handle_new_user` (conta nova), `wipe_todos_os_saves`
-- (reset total) e `wipe_inventario_e_economia` (reset parcial) ja leem daqui.
--
-- Conta que JA existe continua intocada por esta funcao — quem joga ha semanas
-- nao pode ter o inventario regravado. A compensacao dela vem pelo Correio, no
-- passo 3.
create or replace function dev.concessao_inicial_de_itens()
returns table (item_id text, quantity int)
language sql
immutable
set search_path = ''
as $$
  select * from (values
    ('poke_ball', 500),
    ('potion',    500),
    ('revive',     50)
  ) as concessao(item_id, quantity)
$$;

revoke all on function dev.concessao_inicial_de_itens() from public;
revoke all on function dev.concessao_inicial_de_itens() from anon;
revoke all on function dev.concessao_inicial_de_itens() from authenticated;
grant execute on function dev.concessao_inicial_de_itens() to service_role;

-- ---------------------------------------------------------------------------
-- 2. Anexo de itens no Correio
-- ---------------------------------------------------------------------------
-- `anexo_itens` guarda `[{"itemId":"potion","quantity":500}, ...]`.
--
-- POR QUE A COLETA E EXPLICITA (e nao um credito automatico como
-- `market_deliveries`): o Mercado credita o vendedor que estava offline, e ali
-- nao existe nada pra ele decidir. Aqui o jogador PRECISA ver o que chegou —
-- uma compensacao que caisse no inventario em silencio seria indistinguivel de
-- bug ("meu save mudou sozinho"). O botao e a mensagem.
--
-- `anexo_coletado_em` (e nao um booleano) porque a coluna e o que torna o claim
-- ATOMICO: `update ... where anexo_coletado_em is null returning` nao encontra
-- linha na segunda vez, entao dois requests simultaneos do mesmo jogador nao
-- coletam o mesmo anexo duas vezes. Mesma tecnica de `market_deliveries`.
alter table dev.mail_messages
  add column if not exists anexo_itens jsonb not null default '[]'::jsonb,
  add column if not exists anexo_coletado_em timestamptz;

create index if not exists mail_messages_anexo_pendente_idx
  on dev.mail_messages (para_id)
  where anexo_coletado_em is null and anexo_itens <> '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- 3. Concessao retroativa por Correio
-- ---------------------------------------------------------------------------
-- Um jogador = uma mensagem. O `not exists` pelo assunto e a trava de
-- reenvio: se esta migration for aplicada de novo (ou alguem rodar o bloco a
-- mao), ninguem recebe em dobro. Uma coluna `motivo` seria mais limpa, mas
-- exigiria indice novo pra uma rotina que roda uma vez.
--
-- `de_id` fica NULL e `de_nome` e o remetente do sistema: nao ha jogador por
-- tras disso, e apontar pra um usuario real faria a mensagem aparecer como se
-- alguem tivesse mandado.
insert into dev.mail_messages (para_id, de_id, de_nome, tipo, assunto, corpo, anexo_itens)
select
  p.user_id,
  null,
  'Centro Pokemon',
  'sistema',
  'Reposicao de suprimentos',
  'Todo treinador novo passou a comecar com 500 Poke Ball, 500 Potion e 50 Revive. '
    || 'Como voce comecou antes dessa mudanca, a mesma quantidade esta anexada aqui. Colete abaixo.',
  '[{"itemId":"poke_ball","quantity":500},{"itemId":"potion","quantity":500},{"itemId":"revive","quantity":50}]'::jsonb
from dev.players p
where not exists (
  select 1 from dev.mail_messages m
  where m.para_id = p.user_id
    and m.tipo = 'sistema'
    and m.assunto = 'Reposicao de suprimentos'
);


-- ==== 20260809150000_golpe_desligado_persiste.sql ====
-- O golpe desligado a mao (duplo clique no slot) passa a ser PERSISTIDO.
--
-- BUG REAL, e a metade mais funda dele: `pokemon_instances` nunca teve coluna
-- pra `disabledAbilities`. O campo existe no POKE em memoria e o combate o
-- respeita (`combatSystem#pickAbility` filtra por ele), mas `pokeToRow` nao o
-- gravava e `rowToPoke` nao o lia — entao a escolha do jogador morria no
-- primeiro carregamento, mesmo quando a acao chegava ao servidor.
--
-- Sem esta coluna, ligar a acao `alternarHabilidade` na tela consertaria so o
-- sintoma de curto prazo (o estado voltando sozinho em 30s) e a configuracao
-- continuaria sumindo a cada login.
--
-- `jsonb` e nao `text[]` porque a forma em memoria e um MAPA
-- (`{ [abilityId]: true }`), nao uma lista: gravar como array exigiria
-- converter nos dois sentidos e abriria espaco pra duplicata.
alter table dev.pokemon_instances
  add column if not exists disabled_abilities jsonb not null default '{}'::jsonb;


-- ==== 20260809160000_mercado_somente_lance.sql ====
-- Mercado: modo "Somente Lance" para anúncios de POKE.
--
-- Um anúncio normal tem preço de compra direta. Um anúncio "somente lance" não
-- tem preço nenhum: outros jogadores enviam ofertas e o vendedor aceita ou
-- recusa. Por isso `price` passa a aceitar NULL, com uma check que amarra as
-- duas colunas — anúncio sem preço PRECISA estar marcado como somente-lance, e
-- anúncio com preço não pode estar. Sem a check, uma linha meio-preenchida
-- ficaria invisível na vitrine (sem preço para mostrar) e não compraria nem por
-- oferta.
alter table dev.market_listings
  add column if not exists apenas_oferta boolean not null default false;

alter table dev.market_listings
  alter column price drop not null;

alter table dev.market_listings
  drop constraint if exists market_listings_preco_coerente;

alter table dev.market_listings
  add constraint market_listings_preco_coerente
  check (case when apenas_oferta then price is null else price is not null end);

-- Ofertas sobre um anúncio.
--
-- O ouro/diamante é retido no momento em que a oferta é criada (ESCROW), como
-- já acontece com a ordem de compra de item. Sem isso, dez ofertas do mesmo
-- jogador com o mesmo ouro seriam todas aceitáveis, e a nona aceita não teria
-- como ser paga — o vendedor entregaria o POKE de graça.
create table if not exists dev.market_offers (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references dev.market_listings(id) on delete cascade,
  buyer_id uuid not null references auth.users(id) on delete cascade,
  valor bigint not null check (valor > 0),
  currency text not null check (currency in ('gold', 'diamond')),
  status text not null default 'pendente'
    check (status in ('pendente', 'aceita', 'recusada', 'cancelada')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- Uma oferta pendente por (anúncio, comprador): reenviar substitui, não
-- empilha. Parcial porque as resolvidas ficam como histórico e podem repetir o
-- par à vontade.
create unique index if not exists market_offers_uma_pendente
  on dev.market_offers (listing_id, buyer_id)
  where status = 'pendente';

create index if not exists market_offers_por_anuncio
  on dev.market_offers (listing_id)
  where status = 'pendente';

create index if not exists market_offers_por_comprador
  on dev.market_offers (buyer_id, status);

-- Mesma postura das outras tabelas de mercado: RLS ligada e NENHUMA policy para
-- `authenticated`. Quem lê e escreve é o serviço de autoridade com
-- `service_role` — uma policy de leitura aqui exporia quanto cada jogador está
-- disposto a pagar por um POKE antes de a oferta ser respondida.
alter table dev.market_offers enable row level security;


-- ==== 20260809180000_uma_sessao_aberta_por_jogador.sql ====
-- Uma sessao de hunt aberta por jogador — garantido pelo BANCO, nao por codigo.
--
-- O indice `game_sessions_abertas` existia desde a Fase D, mas NAO era unique:
-- ele so acelerava a busca. `abrirSessao` fechava a sessao anterior antes de
-- inserir a nova, o que resolve o caso sequencial e nao resolve nada em corrida.
--
-- O EXPLOIT que isso deixava aberto (reproduzido e medido antes deste arquivo):
-- dois cliques em "Entrar" quase simultaneos criam DUAS sessoes. `sessaoAberta`
-- le `order=started_at.desc&limit=1`, entao so a mais recente e flushada — a
-- outra fica parada com `last_flush_at` congelado na abertura. Quando a recente
-- e fechada (sair da hunt, ou o encerramento por desmaio), a proxima chamada
-- encontra a ORFA e credita, de uma vez, todo o tempo desde a abertura dela —
-- o MESMO periodo que a outra sessao ja tinha pago. Medido: 30 minutos
-- creditados duas vezes = +8.105 de ouro e +60 POKEs capturados do nada.
--
-- Nao e "so cosmetico": a auditoria pos-HUD tinha concluido que sessoes orfas
-- eram inofensivas porque o ouro e gravado como valor absoluto e converge. Isso
-- vale para dois flushes da MESMA sessao. Duas sessoes diferentes tem cada uma
-- seu proprio `last_flush_at`, entao os intervalos somam em vez de convergir.

-- 1. Fecha as orfas que ja existem, mantendo a mais recente de cada jogador.
--    `where true` por causa do pg_safeupdate (ver CLAUDE.md) — este UPDATE roda
--    pela API REST, onde a extensao exige clausula.
with ranqueadas as (
  select id, row_number() over (partition by user_id order by started_at desc) as posicao
  from dev.game_sessions
  where closed_at is null
)
update dev.game_sessions s
set closed_at = now()
from ranqueadas r
where s.id = r.id and r.posicao > 1;

-- 2. Passa a proibir estruturalmente. Substitui o indice nao-unique de mesmo
--    proposito: manter os dois so gastaria escrita.
drop index if exists dev.game_sessions_abertas;
create unique index game_sessions_abertas
  on dev.game_sessions (user_id)
  where closed_at is null;


-- ==== 20260809181000_busca_de_nick_sem_curinga.sql ====
-- Achar um jogador pelo nick SEM passar por LIKE.
--
-- `pedirAmizade` usava `players?trainer_name=ilike.<nick>` com o comentario
-- "sem % e comparacao exata". Nao e: `_` tambem e curinga em LIKE/ILIKE — vale
-- por UMA letra qualquer — e `_` e caractere valido de nick. Pior, o `nick` que
-- chega do cliente nao passa pela regex do cadastro, so por um limite de
-- tamanho, entao `%` atravessava inteiro.
--
-- Medido contra a funcao publicada, antes deste arquivo:
--   POST /correio/amizade {"nick":"%"}   -> 200 "Pedido enviado para Treinador#4ce5"
--   POST /correio/amizade {"nick":"___"} -> 200 "Pedido enviado para Treinador"
-- Ou seja: dava pra mandar pedido a um jogador arbitrario sem saber o nome
-- dele, e pra enumerar nicks por tentativa (busca por tamanho e por letra).
--
-- Mesma solucao ja adotada em `nome_de_treinador_disponivel` na leva 5.1:
-- comparacao por `lower()` dentro do banco, sem sintaxe de padrao no caminho.
create or replace function dev.id_por_nome_de_treinador(nome text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select user_id from dev.players where lower(trainer_name) = lower(trim(nome)) limit 1;
$$;

-- Toda funcao em `public` e chamavel por RPC com a anon key que VAI NO BUNDLE do
-- jogo. Esta devolve o user_id de um jogador a partir do nick — util pro
-- servidor, e um mapa de "nick -> id" pra qualquer visitante. So a service_role
-- executa.
revoke all on function dev.id_por_nome_de_treinador(text) from public, anon, authenticated;
grant execute on function dev.id_por_nome_de_treinador(text) to service_role;


-- ==== 20260809190000_marca_de_flush_em_andamento.sql ====
-- Reconstituida a partir do estado real do cloud (cffbihbmhiuudahsgjsn) --
-- essa migration foi aplicada direto no projeto e nunca commitada no repo.
-- Definicao das colunas confirmada via information_schema no cloud em 2026-08-10.
alter table game_sessions
  add column if not exists flushing_since timestamptz,
  add column if not exists last_flush_at timestamptz not null default now();


-- ==== 20260810000000_grant_game_sessions.sql ====
-- FIX: game_sessions (20260807003000) nunca recebeu GRANT. RLS + policy de
-- select pro dono cobrem authenticated, mas sem GRANT de tabela a policy nunca
-- roda. E service_role (BYPASSRLS) tambem precisa de GRANT proprio -- BYPASSRLS
-- nao substitui privilegio de tabela (mesmo erro ja corrigido nas demais
-- tabelas em initial_schema.sql secao 8). Sem isto toda leitura/escrita do
-- servidor de autoridade em game_sessions morre com 42501.
grant select on game_sessions to authenticated;
grant select, insert, update, delete on game_sessions to service_role;


-- ==== 20260810000100_grant_spawn_tiers_e_market_offers.sql ====
-- FIX: mais duas tabelas criadas sem GRANT (mesmo defeito de
-- 20260810000000_grant_game_sessions.sql).
--
-- spawn_tiers (20260806233000): catalogo publico como species/moves/etc, mas
-- ficou de fora do bloco de GRANT da secao 8 do initial_schema.sql -- essa
-- tabela nasceu depois. generate-catalog.js le com service_role e client le
-- com anon/authenticated; sem GRANT os dois morrem com 42501.
grant select on spawn_tiers to anon, authenticated;
grant select, insert, update, delete on spawn_tiers to service_role;

-- market_offers (20260809160000): mesma postura das outras tabelas de mercado
-- (20260808201000) -- RLS ligada, zero policy, so service_role toca. Migration
-- que criou a tabela esqueceu o GRANT que as demais do mercado tem.
grant select, insert, update, delete on dev.market_offers to service_role;


commit;
