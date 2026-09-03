# Spec: migração de localStorage para Postgres (Supabase)

> **REGISTRO HISTÓRICO — a migração descrita aqui está CONCLUÍDA.**
>
> Este documento é o desenho de antes da execução, guardado porque é onde as decisões e os
> descartes estão explicados. **Não é o estado atual do sistema.** Produção roda em Supabase com
> Postgres, Auth, ~20 RPCs `security definer` e a autoridade em Edge Function.
>
> Para como o sistema roda **hoje**, ver `docs/01-arquitetura.md`, `docs/04-autoridade-do-servidor.md`
> e `docs/11-operacao.md`. Cabeçalho corrigido na PH-468 (2026-09-03), depois de o `CLAUDE.md`
> passar meses apontando para cá como "migração em andamento".

Status original do rascunho, preservado: *rascunho para revisão, nenhum código alterado ainda*.

## 1. Estado atual (baseline)

- `js/core/SaveManager.js`: 1 blob JSON (`{version, data, savedAt}`) em
  `localStorage['novo-poke-idle:save']`. `data` = `GameState` inteiro
  serializado via `JSON.stringify`.
- `saveGame()` (`js/main.js:87`) roda: a cada 10s (`setInterval`), em
  `beforeunload`, e após ~15 eventos de gameplay (captura, venda, level-up,
  troca de hunt, etc.) — ou seja, é chamado com muita frequência, não é um
  "salvar no fim da sessão".
- Zero autenticação hoje. 1 save = 1 browser. Sem conceito de "jogador" além
  do `gameState` local.
- `GameState` (`js/state/GameState.js`) é a fonte única de verdade client-side:
  `team[]`, `bagPokes[]` (arrays de "poke instance"), `items{}` (map itemId→qty),
  `lockedItems{}`, `wallet{gold,diamonds}`, `unlockedMaps[]`,
  `unlockedContinents[]`, `currentMapId`, `autoToggles{}`, `autoPotRules[]`,
  `autoCatchConfig{}`, `autoCatchRules[]`, `perfStats{}`, `trainer{}`,
  `pokedexKills{}`.
- Poke instance (`js/data/pokes.js#createPokeInstance`):
  `{uid, speciesId, level, isShiny, rarity, exp, ivs{6 stats}, stats{6 stats}, hp, unlockedAbilities[]}`.
  `speciesId`/`unlockedAbilities` chaves apontam pra dado estático
  (`js/data/pokes.generated.js`, `js/data/abilities.js`) que **não** migra —
  continua vindo do bundle JS gerado pela planilha, só a *instância* do
  jogador vai pro banco.

## 2. Decisões já tomadas (não reabrir sem motivo novo)

1. **Auth real via Supabase Auth.** Save vira `user_id`-scoped, joga em
   qualquer device. Login inicial: email+senha ou magic-link (decidir na
   implementação — não muda o schema).
2. **Esquema híbrido.** Tabelas normalizadas pro que precisa ser consultado/
   indexado/tem integridade referencial real (times, mochila, pokedex,
   wallet, mapas desbloqueados). JSONB pra config solta sem necessidade de
   query relacional (auto rules, perfStats, autoToggles).
3. **Sync debounce + periódico**, não write-through. Client mantém
   localStorage como cache/fallback offline; escreve no Supabase com debounce
   (~3-5s) nos mesmos pontos que já chamam `saveGame()` hoje, mais o
   `setInterval(10s)` existente. `beforeunload` tenta um flush síncrono best-
   effort (sabendo que pode não completar — navegador não garante).

## 3. Schema proposto

Convenções: `snake_case`, PK `uuid default gen_random_uuid()` onde não há PK
natural, `created_at`/`updated_at timestamptz default now()` em toda tabela
mutável, RLS (Row Level Security) obrigatório em todas — nenhuma tabela fica
sem policy `user_id = auth.uid()`.

### 3.1 `players` (1 linha por usuário — substitui o topo do GameState)

```sql
create table players (
  user_id uuid primary key references auth.users(id) on delete cascade,
  trainer_name text not null default 'Treinador',
  trainer_level int not null default 1,
  trainer_exp bigint not null default 0,
  gold bigint not null default 500000,
  diamonds int not null default 5,
  active_team_index smallint not null default 0,
  current_map_id text,                    -- null = no Hospital
  unlocked_maps text[] not null default '{}',
  unlocked_continents text[] not null default '{"johto","nightmare"}',
  auto_toggles jsonb not null default '{"autoPot":true,"autoCatch":true,"autoRevive":true}',
  auto_pot_rules jsonb not null default '[{"hpPercent":40,"itemId":"potion"}]',
  auto_catch_config jsonb not null default '{"ballId":"poke_ball","catchShinyEnabled":true,"shinyBallId":"great_ball"}',
  perf_stats jsonb not null default '{"gold":0,"xp":0,"mobs":0,"shinys":0,"since":0}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

`unlocked_maps`/`unlocked_continents` como `text[]` (não tabela própria):
são listas curtas (dezenas de itens no máximo, o jogo inteiro tem ~30 hunts),
sem atributo próprio além de "está desbloqueado" — normalizar em
`player_unlocked_maps(user_id, map_id)` só ganharia FK-integridade contra um
catálogo de mapas que **não existe no banco** (mapas são dado estático do
bundle JS, não linha de tabela). Array é a modelagem certa aqui.

`auto_pot_rules`/`auto_catch_config`/`perf_stats`/`auto_toggles` ficam JSONB:
shape muda com features novas (ver histórico do CLAUDE.md, já mudou 3x),
nunca é filtrado/ordenado por query SQL, sempre lido/escrito como blob
completo pelo client. Colocar em coluna própria só forçaria migration a cada
mudança de shape sem ganhar nada.

### 3.2 `pokemon_instances` (substitui `team[]` + `bagPokes[]`)

```sql
create type pokemon_location as enum ('team', 'bag');

create table pokemon_instances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references players(user_id) on delete cascade,
  species_id text not null,               -- FK lógica p/ catálogo estático (pokes.generated.js), sem FK real
  location pokemon_location not null,
  team_slot smallint,                     -- 0-5 quando location='team', null quando 'bag'
  level int not null default 1,
  exp bigint not null default 0,
  hp int not null,
  is_shiny boolean not null default false,
  rarity text not null default 'comum',   -- check constraint abaixo, não FK (tabela de raridade é estática no bundle)
  locked boolean not null default false,
  iv_hp smallint not null, iv_atk_fis smallint not null, iv_atk_esp smallint not null,
  iv_def smallint not null, iv_def_esp smallint not null, iv_speed smallint not null,
  stat_hp int not null, stat_atk_fis int not null, stat_atk_esp int not null,
  stat_def int not null, stat_def_esp int not null, stat_speed int not null,
  unlocked_abilities text[] not null default '{}',
  created_at timestamptz not null default now(),

  constraint rarity_valid check (rarity in ('comum','incomum','raro','ultra','legendary','mythic')),
  constraint team_slot_range check (team_slot is null or (team_slot >= 0 and team_slot < 6)),
  constraint team_slot_required check (
    (location = 'team' and team_slot is not null) or
    (location = 'bag' and team_slot is null)
  )
);

create unique index one_pokemon_per_team_slot
  on pokemon_instances(user_id, team_slot) where location = 'team';

create index pokemon_instances_user_idx on pokemon_instances(user_id);
create index pokemon_instances_species_idx on pokemon_instances(user_id, species_id); -- pra pokedex/filtros
```

Normalizado (não JSONB) porque: mochila/loja/hunt já fazem filtro+sort no
client hoje (por IV%, raridade, nível, tipo — `BagMenu.js`/`ShopMenu.js`) e
essas mesmas operações ficam triviais em SQL (`order by`, `where rarity=`)
uma vez que o dado é multi-device; um blob JSONB de array obrigaria reler/
reescrever o array inteiro a cada captura/venda, que é exatamente o padrão
de escrita mais frequente do jogo (todo kill pode gerar 1 captura).

Stats/IVs achatados em colunas em vez de `jsonb` (`ivs`, `stats`): são
sempre os mesmos 6 campos fixos (não crescem, formato estável desde a v1 do
jogo), e achatar permite `check` constraints reais (`0 <= iv <= 31`) — trade-
off deliberado: mais colunas, porém dado íntegro no banco em vez de confiar
só no client.

`team_slot` + unique index parcial é o jeito certo de expressar "array de 6
posições, sem duas ocupando a mesma": qualquer tentativa de dar `unshift`
(ver `controller.setActiveTeamIndex` em CLAUDE.md, "poke ativo sobe pro
topo") precisa ser uma transação que **renumera os slots**, não um
`UPDATE` isolado — anotar isso explicitamente no plano de implementação
(seção 5) porque é a operação mais fácil de fazer errado (índice único
falha se dois updates da mesma transação colidirem em slot antes do commit
final — usar `deferrable initially deferred` no constraint, ou renumerar em
ordem que nunca colide).

### 3.3 `player_items` (substitui `items{}`/`lockedItems{}`)

```sql
create table player_items (
  user_id uuid not null references players(user_id) on delete cascade,
  item_id text not null,        -- FK lógica p/ catálogo estático (items.js), sem FK real
  quantity int not null default 0,
  locked boolean not null default false,
  primary key (user_id, item_id),
  constraint quantity_non_negative check (quantity >= 0)
);
```

Normalizado por PK composta em vez de JSONB map: permite
`quantity = quantity - $n` atômico (upsert com `on conflict do update`) sem
race condition entre 2 tabs/devices escrevendo ao mesmo tempo — um JSONB
`items` inteiro reescrito do zero teria exatamente o problema de "last
write wins apaga o outro tab" que o requisito de multi-device existe pra
evitar.

### 3.4 `player_pokedex` (substitui `pokedexKills{}`)

```sql
create table player_pokedex (
  user_id uuid not null references players(user_id) on delete cascade,
  species_id text not null,
  normal_kills bigint not null default 0,
  shiny_kills bigint not null default 0,
  primary key (user_id, species_id)
);
```

Mesmo raciocínio de `player_items`: contador incremental, precisa de
`normal_kills = normal_kills + 1` atômico, não substituição de blob.

### 3.5 `player_auto_catch_rules` (substitui `autoCatchRules[]`)

```sql
create table player_auto_catch_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references players(user_id) on delete cascade,
  species_id text not null,
  ball_item_id text not null,
  created_at timestamptz not null default now(),
  unique (user_id, species_id)
);
```

Linha própria (não array em `players`) porque cada regra referencia
`species_id`/`ball_item_id` como unidades — mais fácil de deletar 1 regra
(`delete where user_id=$1 and species_id=$2`) que reescrever um array JSONB
inteiro por causa de 1 remoção. Volume esperado é baixo (1 regra por espécie
que o jogador quiser customizar), não justificaria índice/tabela própria
sozinho, mas o padrão de escrita (add/remove 1 de cada vez) sim.

### 3.6 RLS — obrigatório em todas as 5 tabelas

```sql
alter table players enable row level security;
alter table pokemon_instances enable row level security;
alter table player_items enable row level security;
alter table player_pokedex enable row level security;
alter table player_auto_catch_rules enable row level security;

-- repetir por tabela, trocando o nome:
create policy "own row" on players
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

Sem RLS, qualquer client com a `anon key` (que é pública, embutida no
bundle JS) lê/escreve o save de **qualquer** jogador — não é uma opção,
é requisito mínimo de segurança pra Postgres exposto via Supabase direto do
browser (diferente do localStorage atual, que é isolado por browser
automaticamente).

## 4. O que fica FORA do banco (permanece no bundle JS estático)

Catálogo de jogo inteiro (espécies, golpes, itens, mapas/hunts, fórmulas,
tabela de tipos, raridades) — continua vindo 100% de
`js/data/*.generated.js` + `scripts/sync-planilha.js`, como já documentado
em CLAUDE.md ("Fonte de dados: a planilha é a verdade"). O banco só guarda
**instâncias**/progresso do jogador, nunca o catálogo. `species_id`/
`item_id`/`ball_item_id`/`map_id` no schema acima são todos "FK lógica" —
sem `references` real pro catálogo porque o catálogo não é uma tabela.

## 5. Pontos em aberto / riscos (levar para a implementação, não resolvidos aqui)

1. **Migração do save existente**: usuário já tem 1 save real em
   localStorage (500k gold, itens, pokes). Precisa de um fluxo de "importar
   save antigo" no primeiro login pós-migração (ler `localStorage`, mapear
   pro schema acima, `INSERT` em lote) — não coberto por este spec, é uma
   tarefa de implementação separada.
2. **Debounce + reload rápido**: se o jogador fecha a aba antes do debounce
   disparar, perde até ~5s de progresso — aceitável dado que hoje já existe
   o mesmo risco (10s de intervalo) mas piora um pouco (rede é mais lenta
   que localStorage). `beforeunload` com `navigator.sendBeacon` (não
   `fetch`) é o jeito confiável de tentar o flush final — decidir na
   implementação.
3. **Custo de granularidade**: `pokemon_instances` grava 1 linha por poke
   (captura frequente, farm gera 1 poke a cada captura bem-sucedida) — em
   sessões longas de auto-farm isso pode ser bastante `INSERT`/`UPDATE`.
   Bateria de teste de carga real (não coberta aqui) decide se precisa de
   batching de writes no client antes do debounce, ou se o volume real é
   baixo o suficiente pra não importar.
4. **Farm Offline / catch-up silencioso** (`OfflineSimSystem.js`) roda
   client-side hoje, sem servidor. Continua rodando client-side após a
   migração (não vira Edge Function) — o resumo agregado só é persistido no
   fim da simulação, não por kill, então o volume de writes não muda
   qualitativamente. Mencionado aqui só pra registrar que **não é
   necessário mover essa lógica pro backend** como parte desta migração.
5. **`nextInstanceId` / `uid` client-side** (`js/data/pokes.js`) deixa de
   fazer sentido como gerador de PK — `pokemon_instances.id` passa a ser
   `gen_random_uuid()` do Postgres. O `uid` antigo (`poke-123`) era só uma
   chave de UI local; qualquer código que hoje compara `poke.uid` precisa
   trocar pra `pokemon_instances.id` (uuid) na migração — levantamento de
   todos os call sites não foi feito neste spec, fica pra fase de
   implementação.

## 6. Fase 2 — catálogo sai da planilha, entra no banco

Decisão do usuário: a planilha (`Planilha mestra\dados_do_jogo.xlsx`) era
temporária — o Postgres vira a fonte de verdade **também** pro catálogo
(espécies, golpes, itens, mapas/hunts, encontros, fórmulas, tabela de
tipos), não só pro progresso do jogador (seções 1-5 acima).

**Delivery model escolhido: build-time**, não runtime-fetch. Motivo (já
levantado antes, reafirmado): `CombatSystem.js`/`MovementSystem.js`/
`FormulaEngine.js` fazem lookup de catálogo **por frame**, dentro do loop de
combate — precisa estar em memória JS pura, sem round-trip de rede. Runtime-
fetch exigiria hidratar um cache em memória no boot de qualquer forma (= o
mesmo bundle de hoje, só montado depois de um fetch em vez de no build) e
tira do jogo a capacidade de rodar 100% estático/offline
(`node server.js` servindo arquivo local, sem depender de internet/DB pra
sequer abrir). Build-time preserva exatamente essa propriedade: só troca a
**fonte** do gerador — Postgres em vez de `.xlsx` — o `js/data/*.generated.js`
resultante e todo o resto do pipeline (`js/data/*.js` wrappers hand-authored,
`FormulaEngine`, tudo que consome esses arquivos) fica **inalterado**.

### 6.1 Tabelas de catálogo (schema)

Mesma convenção da seção 3 (snake_case, `updated_at`), com uma diferença
crítica de RLS: **SELECT público (inclusive `anon key`), INSERT/UPDATE/DELETE
só via `service_role`** — nunca a partir do browser. Ver 6.4.

```sql
create table species (
  id text primary key,                    -- ex 'charizard' (a "chave" de hoje)
  dex_number int not null unique,
  name text not null,
  type1 text not null,
  type2 text,
  base_hp int not null, base_atk_fis int not null, base_atk_esp int not null,
  base_def int not null, base_def_esp int not null, base_speed int not null,
  catch_rate int not null,
  base_exp int not null,
  growth_curve text not null,             -- ex 'MEDIUM_SLOW'
  height_m numeric(4,2),                  -- hoje vem de pokeHeights.js (dado publico coletado a mao)
  is_legendary boolean not null default false,
  evolves_to text references species(id),
  evolves_at_level int,
  is_special_evolution boolean not null default false  -- true = trade/hold-item real (Gen1/2), custo em Stones (ver items)
);

create table moves (
  id text primary key,                    -- ex 'flamethrower'
  name text not null,
  type text not null,
  category text not null check (category in ('physical','special')),
  power int not null,
  pp int not null,
  target text not null default 'single' check (target in ('single','aoe')),
  aoe_radius numeric                      -- null quando target='single'
);

create table species_moves (               -- Movesets
  species_id text not null references species(id) on delete cascade,
  move_id text not null references moves(id) on delete cascade,
  level_req int not null,
  primary key (species_id, move_id)
);

create table items (
  id text primary key,                    -- ex 'poke_ball', 'stone_fire'
  name text not null,
  kind text not null check (kind in ('ball','potion','revive','rod','stone')),
  description text,
  buy_price int,                          -- null = nao compravel na loja (stones, rods hoje)
  capture_rate numeric,                   -- balls
  heal_amount int,                        -- potions (null pra outros kinds)
  stone_type text references species(type1) -- simplificacao: FK logica pro texto do tipo, nao pra species.type1 de verdade (ver nota)
);

create table type_chart (
  attacking_type text not null,
  defending_type text not null,
  multiplier numeric not null,
  primary key (attacking_type, defending_type)
);

create table maps (                       -- Hunts (so as normais: Johto+Kanto. Pesadelo/BOSS continuam geradas, ver 6.2)
  id text primary key,
  name text not null,
  continent text not null check (continent in ('johto','kanto')),
  min_level int not null,
  max_level int not null,
  bg_theme text not null,                 -- BG_ROUTE/BG_CAVE/BG_TOWER
  bounds_width int not null default 2800,
  bounds_height int not null default 1800,
  unlock_cost int                         -- null = gratis (quase todas)
);

create table map_encounters (
  map_id text not null references maps(id) on delete cascade,
  species_id text not null references species(id) on delete cascade,
  min_level int not null,
  max_level int not null,
  weight numeric not null,                -- = species.catch_rate hoje, mas guardado explicito pra permitir override futuro
  primary key (map_id, species_id)
);

create table formulas (                    -- 1:1 com a aba "Formulas" de hoje
  key text primary key,                   -- 'DAMAGE_BASE', 'KILL_GOLD_MULTIPLIER', etc.
  expression text not null,
  variables text[] not null default '{}'
);
```

**`stone_type` como texto, não FK pra `species.type1`**: tipo elemental
(FIRE/WATER/...) não é uma linha própria de tabela hoje (é um enum
implícito espalhado em `typeColors.js`/`type_chart`), então virou nota —
na implementação real, criar `create type element_type as enum (...)` com
os 17 valores reais (confirmados na aba `TabelaDeTipos`, sem Fairy — Gen6+)
e usar esse enum em `species.type1/type2`, `moves.type`, `items.stone_type`,
`type_chart.attacking_type/defending_type` — dá integridade referencial de
verdade (não deixa alguém inserir `type1='fariy'` com typo) que o texto solto
acima não dá. Só não finalizei o `create type` aqui porque a lista exata
de 17 precisa ser copiada literal da aba antes do `CREATE TYPE` (não
reproduzo de memória num script SQL que vai rodar de verdade).

### 6.2 O que **não** vira tabela — continua transformação em código

- **Modo Pesadelo + hunts BOSS** (`nightmareMaps.js`): mirror determinístico
  (nível +100, clamp 150) das hunts normais + as 11 hunts de lendário. Não
  precisa de linha própria em `maps`/`map_encounters` — o script de geração
  (`scripts/generate-catalog.js`, sucessor do `sync-planilha.js`) roda essa
  mesma função sobre os `maps`/`map_encounters` lidos do Postgres, igual
  hoje roda sobre o resultado do xlsx. Guardar como linha materializada só
  criaria uma segunda cópia que pode dessincronizar da fonte (`maps` real)
  se alguém editar um lado e esquecer do outro.
- **Fórmula de `sellPrice`** (`items.js`): continua computada
  (`SELL_ITEM_PRICE` sobre `buyPrice`), não vira coluna armazenada —
  mesma razão de sempre, reajustar a fração em `formulas` já rebalanceia
  todo item automaticamente sem precisar tocar em `items`.
- **Ícone de Stone por tipo** (cor da borda, ícone base compartilhado):
  é apresentação (`js/data/sprites.js#itemIconBorderColor`), não dado —
  fica em código.

### 6.3 O que a aposentadoria da planilha resolve de verdade (não é só troca de arquivo)

`map_encounters` é a mudança real, não cosmética: hoje a curadoria de Kanto
(`KANTO_BANDS` em `sync-planilha.js`) é um **array hardcoded no JS**, editável
só por quem mexe em código — porque a aba `Locais_Info`/`Encontros` da
planilha nunca cobriu Kanto (só Johto, ver CLAUDE.md). O mesmo vale pro
`TYPE_BIOME_PLAN` (curadoria dos 9 brackets x 2 biomas) e pro algoritmo de
`groupHuntsIntoBands`. Com a planilha fora, **toda** curadoria de encontro —
Johto e Kanto — vira linha de `map_encounters`, editável do mesmo jeito
(SQL/Table Editor do Supabase), sem precisar mais de nenhum algoritmo de
"biome plan" pra tentar cobrir os 17 tipos por aritmética — é só escrever a
linha `(map_id, species_id, min_level, max_level, weight)` direto. O script
`reportTypeCoverage()` (que hoje audita cobertura no fim do sync) vira uma
query de validação (`select species not exists in map_encounters`) rodada no
mesmo lugar, não mais uma função JS.

### 6.4 Segurança — ponto crítico, não opcional

**Decisão fechada (confirmada pelo usuário): só `service_role` escreve.**
Nenhum usuário logado do jogo — nem uma conta futura de "admin" via
`is_admin` flag — ganha permissão de escrita nas tabelas de catálogo por
RLS. Edição acontece 100% fora do app: Supabase Table Editor (dashboard) ou
o script de build (`generate-catalog.js`, seção 6.5) rodado local/CI com a
`service_role` key em env var. Motivo de descartar a alternativa
(`is_admin` + RLS): superfície de risco maior pra zero ganho — uma policy
RLS mal escrita (ex.: `using (true)` esquecido num `update` durante um
refactor) expõe escrita de catálogo pra qualquer jogador autenticado, e
nada no roadmap pede admin panel dentro do próprio jogo. Se isso mudar no
futuro, é a única peça deste spec que precisaria reabrir.

Hoje a "proteção" do catálogo é implícita: só quem tem o arquivo `.xlsx` no
disco consegue editar (`scripts/sync-planilha.js` só *lê*, nunca escreve —
regra do projeto documentada em CLAUDE.md). Mover pro Postgres **remove**
essa proteção implícita, a menos que RLS reinstale ela explicitamente:

```sql
alter table species enable row level security;
create policy "public read" on species for select using (true);
-- Nenhuma policy de insert/update/delete = ninguem via anon/authenticated
-- consegue escrever. Só service_role (bypassa RLS por padrao) escreve —
-- e service_role key NUNCA entra no bundle do browser, só no script de
-- build (`generate-catalog.js`), rodado local/CI com a key em env var.
```

Repetir esse padrão (`select using (true)`, zero policy de escrita) em
`moves`, `species_moves`, `items`, `type_chart`, `maps`, `map_encounters`,
`formulas`. SELECT público é seguro e correto aqui — é o mesmo dado que já
vai inteiro pro bundle JS de qualquer jogador hoje, não tem segredo. O risco
real é a falta de proteção de **escrita**: sem essas policies, qualquer
jogador com o `anon key` (público, embutido no bundle) consegue abrir o
DevTools e reescrever `base_hp` do Charizard pra 999 **pra todo mundo** — a
planilha nunca teve esse risco porque nunca foi exposta a um client de
browser.

### 6.5 Pipeline / migração

1. `scripts/generate-catalog.js` (sucessor de `sync-planilha.js`): conecta
   no Supabase com `service_role` key (env var, nunca commitada), lê as 8
   tabelas de 6.1, roda as mesmas transformações que hoje rodam sobre o
   resultado do `xlsx-reader.js` (incluindo o mirror de Pesadelo/BOSS de
   6.2), escreve os mesmos `js/data/*.generated.js` de sempre — contrato de
   saída idêntico, então **nenhum** arquivo consumidor (`js/data/*.js`
   wrappers, `FormulaEngine`, sistemas de jogo) precisa mudar.
2. `npm run planilha:aplicar` → `npm run catalog:gerar` (ou nome
   equivalente) chamando o script acima.
3. **Migração one-time**: script separado (roda uma vez, não faz parte do
   pipeline permanente) que lê o `.xlsx` pela última vez via
   `xlsx-reader.js` existente + as curadorias hand-authored atuais
   (`KANTO_BANDS`, `TYPE_BIOME_PLAN`, `LEGENDARY_BAND`, `SPECIAL_EVOLUTIONS`,
   `AOE_ABILITY_KEYS`, `stones.js`) e faz `INSERT` em lote nas 8 tabelas do
   Postgres. Depois de rodar e validar (comparar `js/data/*.generated.js`
   gerado pelo novo pipeline byte-a-byte contra o atual), o `.xlsx` e
   `scripts/xlsx-reader.js` podem ser removidos do projeto.
4. Editor de catálogo pós-migração: **Supabase Table Editor** direto (já
   incluso, zero trabalho extra) — nenhum admin panel in-game foi pedido.
   Se algum dia precisar de validação de schema mais rica que o Table Editor
   dá (ex.: dropdown de `type1` restrito aos 17 valores em vez de texto
   livre), o `enum` da seção 6.1 já cobre isso — Table Editor respeita
   `check`/`enum` do Postgres nativamente.

## 7. Usuários: jogador vs admin — tabelas, RLS e roteamento

Confirmado pelo usuário: vai ter jogador real além de conta própria — a
seção de suporte/admin discutida antes deixa de ser YAGNI e vira parte do
spec. Modelo de telas confirmado: **Home, Login e Registro são rotas
públicas** (sem sessão); **todo o resto exige autenticação**, e a
experiência autenticada se divide em exatamente 2 ramos mutuamente
exclusivos — jogador ou admin, resolvido pela role da conta.

### 7.1 `admins` + `admin_actions` (retomando o desenho da conversa anterior)

```sql
create table admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'support' check (role in ('support','owner')),
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id)
);
alter table admins enable row level security;
create policy "admin reads own row" on admins for select using (auth.uid() = user_id);
-- sem policy de insert/update/delete: so service_role concede admin (nunca self-service, mesma regra da 6.4)

create table admin_actions (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references admins(user_id),
  target_user_id uuid references auth.users(id),
  action text not null,          -- 'grant_item' | 'grant_gold' | 'ban' | 'unban' | 'delete_pokemon' ...
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table admin_actions enable row level security;
create policy "admin reads audit" on admin_actions for select using (
  exists (select 1 from admins where user_id = auth.uid())
);
-- insert so via service_role, dentro da Edge Function que executa a acao — sem policy de insert pro client
```

Leitura de suporte (inspecionar save de qualquer jogador) ganha policy
aditiva nas tabelas de progresso (soma com "own row", não substitui —
Postgres faz OR entre policies permissivas do mesmo comando):

```sql
create policy "admin reads all" on pokemon_instances for select using (
  exists (select 1 from admins where user_id = auth.uid())
);
-- repetir em players, player_items, player_pokedex, player_auto_catch_rules
```

Escrita de suporte (grant item/gold, ban, deletar poke) **não** ganha
policy própria — passa por Edge Function com `service_role`, que valida
(`quantity > 0`, `item_id` existe no catálogo) e grava em `admin_actions`
antes/depois da mutação, atômico numa transação. Motivo de não ser RLS
direta: escrita mutante espalhada em "OR exists(admins)" por 5 tabelas é o
mesmo padrão de risco já rejeitado na 6.4 — 1 policy esquecida numa migration
futura vira jogador comum escrevendo save alheio. Funil único = 1 lugar pra
auditar/testar, não 5.

Ban usa o mecanismo nativo do Supabase Auth
(`auth.admin.updateUserById(user_id, {ban_duration})`, chamado pela mesma
Edge Function), não uma coluna `banned_until` própria — evita 2ª fonte de
verdade que todo RLS/boot check teria que checar também, e a sessão/JWT do
banido já invalida sozinha no próximo refresh (ver 7.4).

### 7.2 `players` precisa existir **antes** do primeiro login em telas de jogo

Toda tabela de progresso (seção 3) tem FK pra `players(user_id)`. Criar a
linha só na hora de escolher o starter (fluxo atual do `StartScreen.js`)
deixaria uma janela onde o usuário está autenticado mas sem linha em
`players` — qualquer tela que tentar ler wallet/trainer nesse meio-tempo
precisa de null-check espalhado. Mais simples e sem essa janela: trigger no
Supabase que cria a linha automaticamente no exato momento do registro,
com os mesmos defaults que `GameState`'s constructor já usa hoje
(500000 gold, 5 diamonds, etc — só migra o default de lugar, não muda valor):

```sql
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.players (user_id) values (new.id);
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

`security definer` é necessário — o trigger roda como o usuário recém-criado
(que ainda não tem permissão de escrever em `players` via RLS normal), então
precisa rodar com os privilégios de quem definiu a função (o dono do schema),
não do caller.

### 7.3 Roteamento (vanilla JS — sem framework, respeita a restrição do CLAUDE.md)

Projeto é "100% HTML/CSS/JS puro, sem frameworks/bundler" — não dá pra
puxar React Router/etc. Proposta mínima: router por `location.hash`, mesmo
espírito do `UIManager`'s troca manual de `.screen` que já existe hoje, só
numa camada acima (escolhe o **shell** inteiro, não um painel dentro do
jogo):

- `#/home` — pública. Landing simples (copy do jogo + botões
  Entrar/Criar conta). Não carrega bundle de catálogo nem toca Supabase
  além de checar se já existe sessão (se existir, pula direto pro shell
  certo em vez de mostrar a landing de novo).
- `#/login`, `#/registro` — públicas. Formulário Supabase Auth
  (email+senha ou magic-link — ainda em aberto, não muda schema, já
  registrado como pendente na seção 2). Se já autenticado, redireciona
  (não reexibe formulário de login pra quem já tem sessão).
- Qualquer outra rota — **autenticada obrigatoriamente**: no boot, checa
  `supabase.auth.getSession()`; sem sessão → redireciona pra `#/login`.
  Com sessão, resolve role (`select 1 from admins where user_id = <uid>` —
  a própria RLS de 7.1 já permite essa leitura) e renderiza **exatamente
  um** dos dois shells:
  - **role=player** → shell atual do jogo (`index.html`/`main.js`
    inalterado — Equipe/Mochila/Hunts/Loja/Hospital/Auto/Config), gated
    atrás do login em vez de ser a primeira coisa que qualquer um vê hoje.
  - **role=admin** → shell novo (fora do escopo deste spec de dados —
    fica pra plano de implementação: no mínimo lista/busca de jogador,
    detalhe de jogador com os botões de grant/ban da 7.1, visualizador de
    `admin_actions`).

### 7.4 Client-side guard não é segurança — RLS é o gate real

O router acima (esconder/mostrar shell por JS) é UX, não controle de
acesso — qualquer um pode abrir o DevTools, pegar o client Supabase já
inicializado na página e chamar as tabelas direto, ignorando o roteamento
inteiro. Quem impede um jogador comum de ler `admin_actions` ou o
`pokemon_instances` de outro `user_id` é a RLS (seções 3.6, 7.1), não o
fato da tela de admin estar escondida. Isso já era verdade pra todo o resto
do spec, mas fica explícito aqui porque agora existe uma tela cujo
propósito inteiro é dado sensível de terceiros — se alguma policy da 7.1
ficar errada, esconder o botão no roteador não compensa.

Consequência prática: `onAuthStateChange` do Supabase precisa de listener
ativo durante a sessão (não só checagem no boot) — cobre tanto expiração
natural de token quanto o caso do 7.1 (admin bane um usuário no meio da
sessão dele: próximo refresh de token falha, listener redireciona pra
`#/login` com aviso de conta suspensa, em vez do client continuar rodando
com um JWT que o servidor já rejeita silenciosamente em toda query).

### 7.5 Trade-off aceito: jogo deixa de abrir 100% offline

Diferença real em relação ao resto do spec: a seção 6 fez questão de manter
o catálogo build-time **pra preservar** a propriedade de hoje de "roda sem
depender de rede" (`node server.js` local, zero backend). Auth-gate em
**toda** tela quebra essa propriedade na entrada — não dá mais pra abrir o
jogo sem alcançar o Supabase Auth pelo menos uma vez (mesmo com o catálogo
inteiro já bundled). Pós-login, a gameplay em si continua tolerante a rede
instável (cache local + sync debounced, seção 2), mas o **cold start**
agora tem uma dependência de rede que não existia. Registrando aqui como
decisão aceita (consequência direta de "jogador real, não só você"), não
como bug — só não pode ser reintroduzida sem perceber depois.

### 7.6 Em aberto

1. Email+senha vs magic-link pro login/registro — não muda schema, decidir
   na implementação (já sinalizado na seção 2).
2. Conteúdo real da Home pública (copy/layout) — fora do escopo deste spec
   de dados.
3. Conteúdo real do shell de admin além dos 3 itens mínimos da 7.3 (lista/
   busca, detalhe+ações, audit log) — vira plano de implementação separado.
4. Uma conta pode ser jogador **e** admin ao mesmo tempo (RLS da 7.1 é
   aditiva, não impede), mas o roteamento da 7.3 manda pra só 1 shell por
   sessão — se um admin também quiser jogar a própria conta, precisa de UI
   pra alternar entre os 2 shells (não desenhado aqui, assumido fora de
   escopo até confirmar que é um caso real).

## 8. Auditoria da planilha real → correções no schema

Feita lendo `Planilha mestra\dados_do_jogo.xlsx` direto via
`scripts/xlsx-reader.js` (11 abas). O schema executável vive em
`supabase/schema.sql`; esta seção registra **o que a auditoria mudou e por quê**.

### 8.1 Bugs que quebrariam o jogo (corrigidos)

1. **`items.heal_amount int` rejeitaria a Max Potion.** A célula "Cura de HP"
   dela não é número — é a string `'infinito'` (o gerador já converte pra
   `Infinity`, ver `items.generated.js`). Pior que falhar na importação:
   `AutoSystem.js#updateAutoHeal` **ordena as poções por `healAmount`** pra
   escolher a melhor, então uma Max Potion virando `null`/`0` faria o auto-pot
   passar a gastar a poção errada silenciosamente. Modelado como
   `heal_amount int` + `heals_full boolean` — não um sentinel (`-1`,`999999`)
   que todo consumidor teria que conhecer.
2. **`revive_hp_percent` não existia no schema.** `AutoSystem.js:51` faz
   `poke.hp = maxHp * revive.reviveHpPercent`; sem a coluna, todo auto-revive
   calcularia `NaN`. Dado real: `REVIVE=0.5`, `MAX_REVIVE=1`.

### 8.2 Peso de spawn: troca do proxy pelo dado real (decisão do usuário)

O jogo hoje usa `weight = species.catch_rate`. **Taxa de captura não tem
relação nenhuma com frequência de aparição** — foi escolhida na época por ser
"um dado que a planilha já tinha" em vez de um número inventado (CLAUDE.md,
"Spawn ponderado por raridade").

A frequência real sempre esteve na planilha, na coluna `Slot` da aba
Encontros: cada `(local, período)` tem uma lista fixa de vagas, e a **mesma
espécie ocupa várias vagas** — é a repetição que codifica raridade. Estrutura
confirmada: 297 grupos `(local, período)`, sendo 183 com 7 vagas
(grama/caverna) e 114 com 3 (todos `*_SURF` — surf no Gen2 real tem 3 vagas).

As vagas **não** são equiprováveis. A tabela por vaga não está na planilha;
veio do disassembly oficial `pret/pokecrystal`,
`data/wild/probabilities.asm` (mesma categoria de dado que
`js/data/pokeHeights.js`: real, público, só ausente da planilha):

- `GrassMonProbTable` (7 vagas): **30, 30, 20, 10, 5, 4, 1**
- `WaterMonProbTable` (3 vagas): **60, 30, 10**

Guardada como tabela (`encounter_slot_rates`), não constante no gerador, pra o
cálculo virar um join auditável. `weight` = soma das chances das vagas que a
espécie ocupa. **Validado contra a planilha inteira: as 297 combinações somam
exatamente 100%, zero grupo fora.**

Impacto medido (números conferidos, não estimados):

| Local | Espécie | Real (slot) | `catch_rate` (hoje) |
|---|---|---|---|
| DARK_CAVE_VIOLET_ENTRANCE\|day | GEODUDE | 60% | 36% |
| | ZUBAT | 39% | 36% |
| | DUNSPARCE | **1%** | **27%** |
| ROUTE_31\|day | PIDGEY | 40% | 20% |
| | CATERPIE | 30% | 20% |
| | BELLSPROUT | 20% | 20% |
| | WEEDLE | 5% | 20% |
| | HOPPIP | 5% | 20% |

Dunsparce é a vaga de 1% (a mais rara do mapa) e aparecia 27% — 27x mais que
devia, virando o 3º mais comum em vez de raridade. Em Route 31 as 5 espécies
têm `catch_rate` idêntico, então a curva de raridade do mapa **desaparecia por
completo**, virava uniforme.

Consequência a assumir: isso **rebalanceia o spawn de todas as hunts**. É o
efeito desejado (o balanceamento atual era acidental), mas não é uma mudança
invisível — espécies de vaga alta ficam bem mais comuns e as de vaga 5/4/1
viram raridade de verdade.

### 8.3 Dado real que morreria com o `.xlsx` (3 tabelas-fonte novas)

Aposentar a planilha (seção 6.5) significa que **o que não estiver no banco
deixa de existir**. O gerador atual ignora:

- **Períodos `morn`/`nite`** — 541 linhas cada; o gerador filtra só `day`,
  descartando 2/3 dos encontros. Efeito real hoje: GASTLY existe em
  SPROUT_TOWER_2F apenas em vagas de `nite` (4 de 7, 57%) e por isso **nunca
  pode aparecer no jogo**.
- **99 locais reais de Johto** (`Locais_Info`) — só 19 hunts curadas
  sobrevivem em `maps`; nomes, chance de encontro por período (2/4/6/10%) e
  grupo de pesca (38 dos 99 locais) sumiriam.
- **Aba Pesca inteira** — 9 grupos, 3 varas, limiar acumulado por slot.
- **6 colunas de `Golpes` nunca sincronizadas, com dado preenchido**:
  Precisão (11 valores distintos, 30-100), Sempre Acerta (3 golpes),
  Multi-hit (12), Dano Fixo (6), Recoil (4), Prioridade (3). "Fora de escopo
  pro combate" não é motivo pra apagar do banco — implementar a mecânica
  depois não pode exigir recuperar planilha morta.
- **`Fórmulas.Descrição`** — única documentação das 24 fórmulas.

Adicionadas `locations`, `location_encounters` (grão de **slot**, não de
espécie — colapsar destruiria a raridade de forma irrecuperável),
`fishing_encounters` e `encounter_slot_rates`. Volume total ~1.8 mil linhas:
custo de guardar ≈ zero, custo de não guardar é irreversível. RLS ligada com
**zero policy de select** — só o build script (`service_role`) alcança; o
client nunca lê essa camada.

### 8.4 Integridade: a planilha passou limpa

Verificado antes de confiar nos constraints: **zero FK órfã** em
Movesets/Encontros/Pesca/`Evolui Para`, 251 números de Dex únicos,
`Evolui Para`/`Evolui no Nível` sempre pareados (0 violação nas duas
direções). Todo `references`/`unique`/`check` do schema importa sem um único
conserto — e qualquer violação futura passa a ser regressão real, não ruído
legado. Aproveitado pra apertar: `catch_rate between 1 and 255`,
`dex_number between 1 and 251`, `multiplier in (0,0.5,1,2)` (os 4 valores
reais da matriz 17x17), `growth_curve` restrito aos 6 valores conhecidos
(4 usados pelas 251 espécies + `SLIGHTLY_FAST`/`SLIGHTLY_SLOW`, que existem só
como fórmula e nenhuma espécie usa).

**Armadilha de grafia**: a planilha usa chave MAIÚSCULA (`CYNDAQUIL`), os ids
do jogo são minúsculos (`cyndaquil`). `check (id = lower(id))` em
`species`/`moves`/`items`/`maps`/`locations` trava a divergência no banco — um
id maiúsculo importado por engano não daria erro nenhum, só faria toda FK de
save do jogador apontar pra lugar nenhum. Também: `Categoria (informativo)`
vem em português (`físico`/`especial`) e o enum é `physical`/`special` — a
migração mapeia.
