# 02 — Dados e catálogo

## A fonte de verdade é o Postgres

Conteúdo de jogo — espécies, movesets, golpes, itens, mapas, hunts, fórmulas, tabela de
tipos — nasceu de `Planilha mestra/dados_do_jogo.xlsx` (Pokémon Crystal / Gen 2 real; nomes
reais por decisão explícita, projeto pessoal e privado). **Da migração para Supabase em
diante, a fonte do build é o Postgres**, não o `.xlsx`.

Ciclo de balanceamento: editar a linha no banco → `npm run catalog:gerar` → regenera os
arquivos `*.generated.ts` → o jogo reflete.

**Nenhum script escreve na planilha.** O risco é concreto: corromper um arquivo grande
feito à mão com um escritor de XML improvisado.

## Por que a planilha e o gerador antigo continuam no repositório

Não é inércia. Dois motivos:

1. A **curadoria de hunts** vive em `scripts/sync-planilha.js` (`TYPE_BIOME_PLAN`,
   `buildTypeRoster`, `buildTypeDrivenHunts`) e o gerador novo a reusa sem alteração —
   duplicar essa curadoria faria as duas divergirem no primeiro ajuste.
2. Ela é o **lado esquerdo do diff byte a byte** que prova que trocar de fonte não mudou o
   jogo.

## A prova de que trocar a fonte não mudou o jogo

`npm run catalog:verificar` roda os dois geradores e compara os arquivos gerados
**byte a byte** — não "equivalente". Ordem das chaves, espaçamento e arredondamento também
são comportamento do jogo. Sai 1 se divergir; serve como gate de CI.

O diff achou **três lacunas reais de schema** — dado que seria apagado no dia em que o
`.xlsx` sumisse. Nenhuma delas era detectável lendo código:

**1. A ordem das linhas é dado.** As chaves saem na ordem da aba: por assunto e tier, não
alfabética. `sort_order` entrou em `formulas`, `items`, `species_moves`, `maps`,
`map_encounters`. Os 17 tipos dispensaram a coluna: a ordem deles já vive em
`src/data/typeColors.ts`, escrito à mão e conferido idêntico.

**2. Uma espécie pode aprender o mesmo golpe em dois níveis.** Forma evoluída herda no
nível 1 e reaprende no nível real dela (`QUILAVA|SMOKESCREEN` em 1 e 6;
`TYPHLOSION|EMBER` em 1 e 12). A chave primária `(species_id, move_id)` descartava
**162 linhas** em silêncio.

**3. A planilha tem uma linha literalmente repetida** (`SEAKING|TAIL_WHIP|1`, duas vezes).
Preservada de propósito: corrigir na migração embutiria uma mudança de jogo numa troca de
fonte. Efeito real: nenhum no combate (`progressionSystem` ignora golpe repetido), só a aba
"Golpes" do perfil lista duas vezes. Limpar deve ser um commit próprio e visível.

Chave final de `species_moves`: `(species_id, sort_order)` — um moveset é uma lista
ordenada, a posição é a identidade da linha, e isso acomoda os casos 2 e 3 sem coluna
sintética.

## Os scripts

| Script | Comando | Papel |
|---|---|---|
| `scripts/generate-catalog.js` | `npm run catalog:gerar` | **Gerador atual.** Lê as 8 tabelas de catálogo do Postgres |
| `scripts/sync-planilha.js` | `npm run planilha:aplicar` | Gerador antigo, do `.xlsx`. Dono da curadoria de hunts |
| `scripts/migrate-catalog-to-postgres.js` | `npm run catalog:migrar` | Planilha → Postgres, idempotente |
| `scripts/verify-catalog-diff.js` | `npm run catalog:verificar` | O gate byte a byte |
| `scripts/xlsx-reader.js` | — | Leitor de `.xlsx` puro Node (unzip + parse de XML à mão) |

`xlsx-reader.js` existe porque **não há Python real neste ambiente** (só o alias da Windows
Store). Tudo em Node puro.

`generate-catalog.js` monta um objeto **na mesma forma de um workbook** (mesmos nomes de aba
e coluna) e entrega para as funções de curadoria sem alteração. Ele **reconstrói, não
recalcula**: a hunt inicial e as faixas dos brackets saem de `maps` / `map_encounters`,
porque as funções de curadoria dependem de `Locais_Info` / `Encontros`, que existem no
schema mas não são populadas.

## Armadilhas do PostgREST (as duas já causaram bug real)

**Corta em 1000 linhas por request, sem erro nenhum.** Ler `species_moves` (2025 linhas)
sem paginar devolve `200 OK` com 1000 linhas e um catálogo silenciosamente mutilado.
`fetchAll` em `generate-catalog.js` pagina por `Range` **e confere o total contra o
`Content-Range`**. Copiar esse padrão em qualquer leitura nova — o mesmo cuidado vale para
`selecionarTudo` no servidor.

**`numeric` volta como string JSON.** O PostgREST preserva o texto (`"0.5"`) porque o tipo
não cabe num double sem risco de perda. Sem converter, `capture_rate` viraria a string
`"1.5"` no arquivo gerado e todo multiplicador da tabela de tipos sairia com aspas. Ver
`num()` em `generate-catalog.js`.

## Regras sobre arquivos gerados

- **Nunca editar `*.generated.ts` à mão.** São sobrescritos a cada sync.
- `src/data/*.ts` sem `.generated` são invólucros finos escritos à mão: só lógica (stats,
  preço de venda, cooldown vindo do PP, IVs, cor e forma de placeholder). Nunca dado
  embutido.
- Quando um valor precisa mudar e a planilha não é editável nesta sessão, o lugar é o
  invólucro à mão (ex.: o desconto de bola e poção em `data/items.ts`), **nunca** o gerado.

## O motor de fórmula

`src/core/formulaEngine.ts` avalia as expressões da aba "Fórmulas" em runtime **sem
`eval`** — parser próprio. Cobre `DAMAGE_BASE`, `CATCH_CHANCE`, `EXP_GAIN`, as curvas de
crescimento e os knobs de economia.

Duas formas de uso, e a diferença importa:

- `eval(chave, contexto, rng)` — **exige** a chave. Se ela sumir da planilha, estoura.
- `evalOrDefault(chave, fallback, contexto, rng)` — usa a fórmula se existir, senão o
  fallback embutido no código.

`evalOrDefault` é o mecanismo de "knob editável pela planilha": o valor efetivo hoje é o
fallback (a chave não existe na aba), e colar a linha na planilha passa a mandar sem tocar
em código. **A consequência é que o valor real está no código, não na planilha** — conferir
o fallback antes de afirmar qualquer número.

`FUNCS.random` **estoura** sem um `Rng`. Hoje só `DAMAGE_VARIATION` usa `random()`, mas a
planilha pode ganhar outras, e um fallback silencioso para `Math.random()` reabriria o
buraco de determinismo que a [seção de RNG](03-motor-de-simulacao.md#determinismo) fechou.

### Knobs de economia disponíveis

Todos por `evalOrDefault`. **O valor da coluna "fallback" é o valor efetivo hoje** — nenhuma
dessas chaves existe em `formulas.generated.ts`.

| Chave | Fallback | Onde |
|---|---|---|
| `KILL_GOLD_MULTIPLIER` | 5 | `economySystem.ts` |
| `GOLD_GLOBAL_MULTIPLIER` | 1 | `economySystem.ts` |
| `STONE_DROP_CHANCE` | 0.05 | `economySystem.ts` |
| `MIN_POKEMON_SELL_VALUE` | 1000 | `economySystem.ts` |
| `XP_GLOBAL_MULTIPLIER` | 0.14 | `progressionSystem.ts` |
| `DEATH_EXP_LOSS_PERCENT` | 0.05 | `progressionSystem.ts` |
| `POKE_EXP_REQUIREMENT_MULTIPLIER` | 1.3 | `data/pokes.ts` |
| `SHINY_RATE_MULTIPLIER` | 100 | `data/pokes.ts` |
| `BALL_POTION_BUY_DISCOUNT` | 0.7 | `data/items.ts` |
| `MOB_RESPAWN_DELAY_MULTIPLIER` | 0.25 | `data/maps.ts` |
| `ATTACK_SPEED_REFERENCE` | 100 | `combatSystem.ts` |
| `BASIC_ATTACK_COOLDOWN` | 2 | `combatSystem.ts` |
| `OFFLINE_FARM_MAX_HOURS` | 6 | `engine/simulation.ts` |
| `OFFLINE_SIM_STEP_SECONDS` | 0.1 | `engine/simulation.ts` |

## Tier de spawn: por que o peso deixou de ser `catchRate`

Antes, `encounter.weight` era `species.catchRate`. **Capturabilidade não tem relação com
aparição**: Dunsparce (catchRate 190) ocupava **27%** de uma hunt, quando na realidade tem
vaga de 1% — o mais raro. Foi escolhido por ser "dado que a planilha já tinha", não por
estar certo.

A planilha também não serve de fonte aqui. A coluna `Slot` sugeria derivar a chance real,
mas é reconstrução infiel: contra o disassembly, **48 das 78** linhas divergiam (TENTACOOL
30% contra 74% real; MAGIKARP 51% contra 69%). E só cobre Johto no período `day` — 130 das
212 espécies spawnáveis ficariam sem dado.

**Fonte real:** `scripts/derive-spawn-tiers.js` lê os disassemblies `pret/pokecrystal`,
`pret/pokegold` e `pret/pokered`, cobrindo as **quatro** formas de encontro selvagem da
Gen 2: grama, surf, pesca e headbutt. Só grama e surf poriam Remoraid, Qwilfish e Heracross
em "nunca selvagem", o que é falso. Resultado em `scripts/spawn-tiers.json` — **nunca editar
à mão**; o build não precisa de rede, os `.asm` ficam em `.cache/pret/` (ignorado pelo git).

A escala espelha a `GrassMonProbTable` da Gen 2 (30/30/20/10/5/4/1). Os cinco tiers **são**
vagas reais:

| Tier | Peso |
|---|---|
| `muito_comum` | 30 |
| `comum` | 20 |
| `incomum` | 10 |
| `raro` | 5 |
| `muito_raro` | 1 |

Métrica: a fatia da espécie no encontro daquele local, com média entre os locais em que ela
aparece.

Procedência por espécie fica no campo `origem` do JSON, auditável depois: das 251 do dex,
**150** vêm da Gen 2 (`gsc`), **7** da Gen 1 (`rb`, ausentes na Gen 2) e **94** de regra
(`regra`) — sem encontro selvagem em nenhuma das duas gerações (troca, pedra, presente,
fóssil, lendário), sem taxa a medir. A regra usa profundidade na cadeia de evolução (mais
fundo, mais raro), e a profundidade 0 é dividida entre "ainda evolui" (Pichu, Togepi, Eevee
→ `incomum`) e "nunca evolui" (Snorlax, Lapras, Aerodactyl → `raro`). Sem essa separação,
Snorlax sairia tão fácil quanto Pichu.

Onde mora: tabela `spawn_tiers` (chave + peso) e coluna `species.spawn_tier`. O peso fica
no banco e não numa constante do build porque **é balanceamento**: rebalancear é um
`update`, não um deploy. `NOT NULL` **sem default** de propósito — espécie nova declara o
tier, senão entra muda como `incomum` sem ninguém notar.

### Armadilhas encontradas montando isso

- **Recortar só o período `day`** (para casar com a planilha) tornava Hoothoot (noturno),
  Ledyba e Spinarak (manhã) "nunca selvagens". Não há ciclo dia/noite no jogo: a chance é a
  média dos três períodos, e o noturno conta 1/3.
- **`common` e `rare` de headbutt com peso igual** inflava quem só aparece na `rare`:
  Heracross saía `muito_comum` sendo encontro difícil. A `rare` só sai em árvore rara —
  ponderada em 10%, ele cai para `raro`.
- **Grafo de evolução via `SPECIES[].evolvesTo` não funciona**: a planilha só preenche esse
  campo em evolução por nível. Pedra (Growlithe → Arcanine) e troca (Kadabra → Alakazam)
  ficam de fora, e a forma final vira profundidade 0 — Alakazam sairia tão comum quanto
  Pichu. O grafo vem de `evos_attacks.asm`.
- **Derivar só as ~226 espécies spawnáveis** deixava 25 linhas de `species` sem tier, e a
  migration falhava no `set not null`. O roster é o National Dex inteiro (#1-251), de
  `pokemon_constants.asm` — que tem um **segundo** `const_def 1` com as 26 formas do Unown;
  sem cortar no `const_skip`, viravam "espécies" (277 em vez de 251).
- **`MR__MIME` tem underscore duplo**, mantido na chave (`mr__mime`). Um script que
  "normalizava" `__` para `_` gerava um id inexistente. A checagem contra o arquivo gerado
  não pegou (Mr. Mime não é spawnável) — quem pegou foi o `NOT NULL` da migration.
