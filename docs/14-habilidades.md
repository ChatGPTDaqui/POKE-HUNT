# Habilidades, Naturezas e Características

Os três **traços individuais** dos jogos — o que separa dois Charmander de mesmo nível e mesma
espécie. Entraram em 2026-08-18, a pedido explícito do usuário ("quero ser fiel e aplicar isso
aos pokemons do jogo").

| Traço | Origem do dado | Sorteado? | Gravado? | Onde vive |
|---|---|---|---|---|
| **Natureza** | 25 combinações fixas, escritas à mão | sim, uniforme | `pokemon_instances.nature` | `src/data/natures.ts` |
| **Habilidade** | PokeAPI, por espécie (slots 1/2 + oculta) | sim, entre os slots da espécie | `pokemon_instances.trait` | `src/data/traits.ts` (dado gerado) |
| **Característica** | derivada dos IVs | **não** | **não** | `src/data/characteristics.ts` |

## Por que "Trait" e não "Ability" no código

`Ability` já é o **GOLPE** em todo este projeto: `type Ability` em `engine/types.ts`,
`abilities.generated.ts`, `pickAbility`, `activeAbilities`. A habilidade passiva de espécie é
sempre **Trait** no código e **Habilidade** na tela. A colisão é só interna.

## Natureza

Regra real (Gen III em diante, inalterada no Ultra Sun): +10% num atributo, −10% em outro.
As 5 combinações em que sobe e desce são o mesmo atributo não mexem em nada — são as
**neutras**. **HP nunca é afetado**, e quem garante isso é `natures.ts#NATURE_STATS`, que só
lista os outros cinco.

Ordem dos multiplicadores em `pokes.ts#computeStatsAtLevel`:

```
fórmula base → NATUREZA → shiny → raridade
```

A natureza vem primeiro porque é a única das três que existe nos jogos reais, e lá ela se aplica
sobre o resultado da fórmula de stat. Shiny e raridade são invenção deste jogo e empilham por
cima. `Math.round` uma vez só, no fim — arredondar a cada etapa acumularia erro a favor do
jogador.

### O backfill foi NEUTRO de propósito

A migration `20260818140000` dá a todo POKE que já existia uma das 5 neutras, escolhida por hash
do uuid. Sortear uma natureza real teria mudado o time de todo jogador da noite pro dia, pra pior
em metade dos casos, sem nada no jogo explicando por quê. Todo POKE criado a partir dali sorteia
entre as 25.

**A armadilha que isso escondia**, medida em produção e corrigida em
`playerMapper.ts#naturezaNeutraEstavel`: o snapshot da sessão de hunt regrava a linha INTEIRA a
cada flush. Um POKE carregado com `nature: undefined` também **grava** `null`, e o backfill era
desfeito na primeira caçada. Por isso o mapper resolve `null` para uma neutra estável na LEITURA,
e não só trata a ausência como 1x no cálculo.

## Habilidade

`npm run usum:baixar` traz `pokemon.abilities` da PokeAPI; `usum:gerar` emite
`generated/traits.generated.ts` com dois mapas: o **catálogo** (133 habilidades, nome + efeito) e a
**atribuição** por espécie (slots normais + oculta).

### O que a tabela hand-authored errava

Até esta leva `traits.ts` era `speciesId -> 1 trait`, escrita a olho, cobrindo ~150 das 226
espécies. Dois defeitos, e só um era visível:

1. 76 espécies sem habilidade nenhuma, em silêncio;
2. atribuição **inventada** — Gengar estava com `levitate`, que ele de fato teve até a Gen VI e
   **perdeu na Gen VII** (no Ultra Sun ele só tem Cursed Body). O catálogo do jogo é Ultra Sun;
   a tabela não era.

### O único desvio: habilidade oculta

No Ultra Sun a oculta **não sai** de encontro selvagem comum — vem de cadeia de SOS, Island Scan,
Ilha Rolo e transferência. Nenhuma delas existe aqui (não há "chamar reforço" num auto-battler de
1 contra N). `traits.ts#CHANCE_DE_TRAIT_OCULTA` usa **5%** no nascimento, que é a taxa base da
própria cadeia de SOS aplicada direto no encontro. A alternativa seria a oculta ser dado morto:
presente no catálogo, inalcançável no jogo.

### Onde cada mecânica encosta no motor

| Ponto | O que resolve |
|---|---|
| `traitEffects.ts` | tabelas e funções **puras**: multiplicadores, listas de tipo, limiares |
| `combatSystem.ts#traitsDoConfronto` | **porta única** de Neutralizing Gas e Mold Breaker |
| `combatSystem.ts#computeDamage` | poder, STAB, dano recebido/causado, crítico, escudos |
| `combatSystem.ts#golpeErrou` | precisão, evasão, No Guard, Wonder Skin |
| `combatSystem.ts#resolveHit` | contato, recuo, dreno, flinch, reações a hit, Moxie |
| `combatSystem.ts#resolveEntryHook` | Intimidate, Download, clima automático, Trace |
| `statusSystem.ts#tickStatus` | clima por turno, Shed Skin, Speed Boost, Moody, Magic Guard |
| `statusSystem.ts#aplicarMudancasDeStat` | proteção de estágio, Contrary, Defiant/Competitive |

**A porta única importa.** Neutralizing Gas e Mold Breaker DESLIGAM outras habilidades, e as duas
precisam ser consultadas antes de qualquer outra leitura de trait. Ler `traitDoPoke` direto num
ponto novo faz a habilidade que deveria cancelar o efeito virar letra morta — sem erro, sem log.

### Trace grava no POKE, e isso exigiu um backup

Trace escreve em `poke.trait` porque **todo** o motor lê a habilidade de lá. Só que o POKE do
jogador é GRAVADO no banco pelo snapshot da sessão. Sem `WorldEntity#traitOriginal`, um Porygon
que copiasse Intimidate de um Gyarados sairia da hunt sendo um Porygon com Intimidate,
permanentemente. `limparEstadoVolatil` (fim de batalha) devolve o valor.

## Característica

Sai de duas coisas: **qual** atributo tem o IV mais alto (escolhe a família de 5 frases) e esse
**IV módulo 5** (escolhe qual das 5). São 6 × 5 = 30.

Único desvio, dito em voz alta em `characteristics.ts`: nos jogos o desempate entre IVs iguais usa
o Personality Value (`PV mod 6` decide por qual atributo a varredura COMEÇA). Este jogo não tem PV
— a identidade de um POKE aqui é o uuid — então o desempate usa a ordem fixa de `STAT_ORDER`. A
consequência é um viés pro HP em caso de empate, e nada mais: a frase continua sendo uma pista
correta do IV mais alto, que é a função dela.

Não há nada pra gravar. Uma coluna no banco só criaria a chance de ela divergir dos IVs.

## O que ficou de fora, e por quê

**102 das 133 habilidades do elenco têm efeito mecânico.** As 31 abaixo não têm — cada uma por um
motivo **estrutural**, algo que o motor não tem, nunca por falta de tempo. Quando um desses
buracos for fechado, a habilidade correspondente vira trabalho imediato.

A lista viva é `src/data/traitInfo.ts#MOTIVO_SEM_EFEITO`, e a ficha do POKE mostra o motivo ao
jogador — mostrar a descrição real de uma habilidade que o motor ignora seria a ficha mentindo.

### Não existe troca de POKE em batalha (3)

| Habilidade | Chave | Efeito real |
|---|---|---|
| Natural Cure | `natural_cure` | Cura o status ao TROCAR de POKE. |
| Regenerator | `regenerator` | Recupera 1/3 do HP ao TROCAR de POKE. |
| Imposter | `imposter` | Se transforma no oponente ao entrar em campo (não há transformação neste motor). |

**O que destravaria:** trocar o POKE ativo durante a hunt sem ele desmaiar.

### Não existe item equipado (7)

`frisk`, `pickpocket`, `sticky_hold`, `unburden`, `gluttony`, `harvest`, `unnerve`.

**O que destravaria:** um slot de item por POKE — e, para as três últimas, Berries.

### Não existe aliado em campo (4)

`friend_guard`, `healer`, `telepathy`, `plus`. O combate é **um** POKE seu contra N inimigos.

**O que destravaria:** dois POKE do jogador em campo ao mesmo tempo. É a mesma limitação que já
deixa Lightning Rod e Storm Drain sem o redirecionamento de golpe delas (ver
`combatSystem.ts#IMUNIDADE_POR_TRAIT`).

### Não existe ordem de turno nem prioridade (2)

`prankster`, `analytic`. Prioridade de golpe já está em `CLAUDE.md` como fora de escopo — a ordem
sai de cooldown e Velocidade, não de um turno com fila.

### Não existe PP gasto (1)

`pressure`. O PP alimenta a fórmula de cooldown e nada mais — um golpe de 5 PP recarrega em 8s
justamente por isso (`abilities.ts#cooldownFromPp`).

**Medido e revertido**, porque a tentação de "só contar os usos aqui" vai voltar: um cap de
`ability.pp` usos por batalha para golpe de cura e proteção chegou a existir em 2026-08-18 e saiu
no mesmo dia. O caso que o justificava (Noctowl Nv60 sobrevivendo 600s a um Nv40, curando 112
vezes) era **artefato do arnês de teste**, que mantinha o jogador imortal. Com jogador mortal não
existe faixa de nível em que a luta não termine — ou o inimigo cai em segundos, ou o jogador cai.
Ver o cabeçalho de `src/engine/batalhaTermina.test.ts`.

### Não existe fuga nem prisão do oponente (5)

`run_away`, `arena_trap`, `shadow_tag`, `magnet_pull`, `suction_cups`. A caçada é automática e
ninguém foge.

### Não existe a mecânica citada (5)

| Habilidade | Falta |
|---|---|
| `cute_charm` | condição "apaixonado" |
| `skill_link` | golpe de 2 a 5 acertos (multi-hit, já fora de escopo em `CLAUDE.md`) |
| `rivalry` | gênero |
| `light_metal` | peso (nenhum golpe daqui usa) |
| `illuminate` | taxa de encontro por POKE em campo — o spawn aqui é por sala e por hunt |

### Só mostram informação, e não há onde mostrar (4)

`forewarn`, `anticipation`, `pickup`, `honey_gather`.

`pickup`/`honey_gather` são as mais próximas de viáveis: bastaria o loot passar a olhar a
habilidade do POKE em campo. Ficaram de fora porque o loot deste jogo é definido por hunt e por
inimigo derrotado (`economySystem.ts`), não pelo POKE do jogador — ligar as duas coisas é uma
mudança de desenho, não uma habilidade a mais.

## Testes que guardam isto

Todos cobrem falha **silenciosa** — nenhuma destas quebras lança exceção:

| Arquivo | O que impede |
|---|---|
| `src/data/tracosIndividuais.test.ts` | natureza fora das 25, natureza mexendo em HP, espécie sem habilidade, sorteio devolvendo habilidade que a espécie não tem, característica apontando o IV errado |
| `src/data/traitInfo.test.ts` | habilidade do catálogo sem texto em português, texto órfão apontando pra habilidade que não existe |
| `src/engine/systems/habilidades.test.ts` | cada mecânica no combate de verdade, com e sem a habilidade |
| `src/engine/invariantes.test.ts` | a regra de IV do Ultra Sun (3 perfeitos em lendário, uniforme no resto) |
| `src/engine/batalhaTermina.test.ts` | golpe de estagnação sem limite de PP deixando a luta eterna |
