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
-- `(select public.is_admin())` nas policies: o planner resolve como InitPlan
-- (1 vez por query, nao por linha) — a recomendacao oficial de RLS performance.
-- SECURITY DEFINER tambem evita qualquer risco de recursao de policy: le
-- `admins` ignorando a RLS de `admins`.
-- `set search_path = ''` + nome totalmente qualificado: previne search_path
-- injection (obrigatorio em toda funcao SECURITY DEFINER).
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admins a where a.user_id = (select auth.uid())
  );
$$;

-- FIX: Postgres concede EXECUTE a PUBLIC por padrao em funcao nova, e o Supabase
-- propaga isso pra anon via PostgREST. `is_admin()` sem argumento nao vaza nada
-- (anon recebe false), mas expor funcao administrativa por descuido e o padrao
-- que queremos evitar em geral — revoke explicito, grant so pra quem precisa
-- avaliar as policies.
revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, service_role;

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
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.players (user_id) values (new.id);
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public;
grant execute on function public.handle_new_user() to supabase_auth_admin;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 7.2 — FIX: `updated_at` com DEFAULT now() so preenche no INSERT. Sem trigger, a
-- coluna congelaria na data de criacao pra sempre (nome mentiroso). Aplicado so
-- nas tabelas com UPDATE in-place real — player_auto_catch_rules/admin_actions
-- sao insert+delete na pratica.
create function public.set_updated_at()
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
  for each row execute function public.set_updated_at();
create trigger pokemon_instances_set_updated_at before update on pokemon_instances
  for each row execute function public.set_updated_at();
create trigger player_items_set_updated_at before update on player_items
  for each row execute function public.set_updated_at();
create trigger player_pokedex_set_updated_at before update on player_pokedex
  for each row execute function public.set_updated_at();

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
  for select to authenticated using ((select public.is_admin()));

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
  for select to authenticated using ((select public.is_admin()));

grant select, update on players to authenticated;
grant select, insert, update, delete on players to service_role;

-- 8.4 Progresso mutavel pelo proprio jogador (captura, compra, kill, regra de
-- auto-catch): insert/update/delete direto do client, sempre restrito ao
-- proprio user_id. Policies permissivas do mesmo comando sao combinadas com OR,
-- entao a policy de admin abaixo SOMA leitura sem afrouxar a escrita.
create policy "own rows all" on pokemon_instances for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "admin reads all" on pokemon_instances for select to authenticated
  using ((select public.is_admin()));

create policy "own rows all" on player_items for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "admin reads all" on player_items for select to authenticated
  using ((select public.is_admin()));

create policy "own rows all" on player_pokedex for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "admin reads all" on player_pokedex for select to authenticated
  using ((select public.is_admin()));

create policy "own rows all" on player_auto_catch_rules for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "admin reads all" on player_auto_catch_rules for select to authenticated
  using ((select public.is_admin()));

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
