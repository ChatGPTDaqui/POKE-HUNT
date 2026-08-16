# 13 — Divergências conhecidas

Levantado em 2026-08-11, conferindo `CLAUDE.md` e `README.md` contra o código.

**Atualizado em 2026-08-16** (leva de combate): `STONE_DROP_CHANCE`, `XP_GLOBAL_MULTIPLIER`,
`BASIC_ATTACK_COOLDOWN` e `AUTO_REVIVE_DELAY` foram corrigidos no `CLAUDE.md` nesta rodada —
ver a tabela abaixo, que marca cada um. `GOLD_GLOBAL_MULTIPLIER` **continua sem decisão**, de
propósito: nenhum dos dois lados tem pista de qual é o intencional, e essa é exatamente a
classe de caso que só quem mantém o projeto pode resolver.

Achado maior da mesma rodada, categoria nova: **um sistema inteiro (combate — clima, traits,
escudos, Protect/Endure/Destiny Bond, Leech Seed/Curse/Nightmare, Taunt/Disable/Encore/
Torment, golpes de potência variável, hazards) existia no código, testado e funcionando, sem
NENHUM registro em `CLAUDE.md` nem em `docs/`.** Não chegou a essa lista como "constante
errada" porque não havia constante nenhuma pra conferir — era o próprio texto do `CLAUDE.md`
afirmando "fora de escopo" sobre algo que já tinha sido implementado numa sessão paralela.
Documentado agora em [03](03-motor-de-simulacao.md); a Wiki in-game (abas "Status"/"Combate")
é a versão pro jogador. Achado ao escrever a documentação do jogador (Wiki), não numa auditoria
de código — reforça o argumento central desta pasta: sem conferir contra o código, a
documentação apodrece **silenciosamente**, na direção de "menos capaz do que é", não só
"números errados".

**Nada aqui foi corrigido no código.** São achados que precisam de decisão: em cada caso, ou o
código está errado (e é bug de balanceamento) ou o documento está errado (e é ruído). Só quem
mantém o projeto sabe qual.

Este arquivo existe também como argumento: é a evidência concreta de por que a
[regra de fonte única do README](README.md#a-regra-que-faz-esta-pasta-valer-alguma-coisa)
manda citar símbolo em vez de repetir número.

---

## Constantes onde `CLAUDE.md` contradiz o código

Todos os valores do código conferidos em `evalOrDefault(...)`, e **nenhuma dessas chaves existe
em `formulas.generated.ts`** — então o fallback é o valor efetivo.

| Chave | `CLAUDE.md` (era) | Código | Onde | Status |
|---|---|---|---|---|
| `GOLD_GLOBAL_MULTIPLIER` | `4` ("+300%") | **1** | `economySystem.ts:22` | **pendente — decisão de balanceamento real, não tocado** |
| `STONE_DROP_CHANCE` | `0.2` ("5% → 20%") | **0.05** | `economySystem.ts:20` | corrigido em `CLAUDE.md` 2026-08-16 |
| `XP_GLOBAL_MULTIPLIER` | `0.4` (tabela) | **0.14** | `progressionSystem.ts:24` | corrigido em `CLAUDE.md` 2026-08-16 |
| `BASIC_ATTACK_COOLDOWN` | `1.5` (tabela) | **2** | `combatSystem.ts:57` | corrigido em `CLAUDE.md` 2026-08-16 |
| `AUTO_REVIVE_DELAY` | `3s` | **5.0** | `autoSystem.ts:12` | corrigido em `CLAUDE.md` 2026-08-16 |

### Qual lado provavelmente está certo, caso a caso

- **`XP_GLOBAL_MULTIPLIER`**: a **tabela antiga** estava velha; o texto narrativo da leva 5.x já
  registrava `0.28 → 0.14`, o código concordava com o texto — só a tabela é que não tinha sido
  atualizada. A tabela de knobs em `CLAUDE.md` foi **substituída por um ponteiro** para
  [02](02-dados-e-catalogo.md#knobs-de-economia-disponíveis), que cita símbolo em vez de
  copiar valor — a classe inteira desse tipo de divergência para de poder acontecer.
- **`STONE_DROP_CHANCE`**: o código tem comentário explícito — *"0.05 = pedido explícito do
  usuário (revertido de 0.2)"*. A reversão tinha acontecido no código sem o `CLAUDE.md`
  registrar. Coberto pelo mesmo ponteiro acima.
- **`GOLD_GLOBAL_MULTIPLIER`**: aqui não há pista no código. O `CLAUDE.md` registrava um pedido
  explícito de "+300%", e o valor efetivo hoje é `1` — ou seja, **o ouro está 4x menor do que o
  último pedido registrado**. Este é o único da lista com potencial de ser bug de balanceamento
  de verdade. **Continua sem decisão — não foi tocado nesta rodada.**
- **`BASIC_ATTACK_COOLDOWN`** e **`AUTO_REVIVE_DELAY`**: mudanças pequenas sem registro do
  motivo. Sem pista de qual lado era o intencional — corrigidos para bater com o código
  (o comportamento que os jogadores de fato experimentam), citando símbolo em vez de valor daqui
  pra frente.

---

## Sistemas no código sem menção nenhuma na documentação

| Sistema | Onde | Impacto |
|---|---|---|
| **Pathfinding** | `src/core/pathfinding.ts` (`MAX_EXPANSIONS = 4000`, `PATH_RECALC_INTERVAL`, `PATH_TARGET_DRIFT`, `PATH_TARGET_BIG_JUMP`) | Movimento inteiro. `CLAUDE.md` ainda descreve movimento como `moveToward` direto |
| **`MIN_ACTION_GAP = 2`** | `combatSystem.ts:58` | Piso global de ação — nenhum atacante age antes disso, por mais rápido que seja. Muda o teto de DPS de todo POKE |
| **`+30% balance pass` na velocidade** | `entity.ts:18-19` (`PLAYER_MOVE_SPEED = 91`, `ENEMY_MOVE_SPEED = 58.5`) | Passe de balanceamento sem registro |
| **`SELF_DESTRUCT_HP_LOSS_PERCENT`** | `combatSystem.ts:52` | Explosion e Selfdestruct custam 50% do HP do usuário |
| **`MAGNITUDE_TABLE`** | `combatSystem.ts:86` | Golpe com potência sorteada |
| **`COUNTER_MEMORY_WINDOW = 3`** | `combatSystem.ts:152` | Janela de memória do Counter |
| **`DEATH_ANIM_GRACE_PERIOD = 4.0`** | `simulation.ts:57` | Inimigo derrotado fica visível tocando Faint |

Os três do meio (`MIN_ACTION_GAP`, velocidade +30%, auto-destruição) são **regras de combate
com efeito direto em balanceamento**. Estão documentados agora em
[03](03-motor-de-simulacao.md) e [05](05-regras-de-negocio.md).

---

## Comentários de código desatualizados

| Arquivo | Diz | Realidade |
|---|---|---|
| `server/src/app.ts:7` | "São 4 rotas; framework não pagaria seu custo" | **20 rotas.** O argumento contra framework continua defensável, o número não |
| `server/src/farmOffline.ts:6` | "combate offline roda em modo pessimista (dano mínimo, zero crítico, **inimigo mais forte do pool**)" | O spawn fixo foi **removido** e medido como contraproducente (ver [12](12-decisoes-descartadas.md)). Hoje `pessimista` só afeta crítico e variação de dano |

O segundo é o pior dos dois: descreve um comportamento que foi **deliberadamente revertido**, e
alguém lendo esse comentário pode "restaurar" o bug.

---

## Descrições de topo que descrevem o jogo que não existe mais

`CLAUDE.md`, primeira linha do corpo, dizia:

> Jogo idle 2D top-down (Canvas), **100% HTML/CSS/JS puro, sem frameworks/bundler**.

Isso descreve o jogo vanilla, que **foi removido do repositório**. Corrigido ao criar esta
pasta.

## `README.md` da raiz — corrigido

Duas coisas, ambas corrigidas ao criar esta pasta:

1. Mandava `cd web` antes de `npm install`. **O app é a raiz do repositório** desde que a
   subpasta foi promovida (commit `70d5561`). Seguir a instrução dava erro de diretório
   inexistente.
2. Não mencionava que **rodar o jogo exige o servidor de autoridade**
   (`cd server && npm run dev` + `VITE_SERVIDOR_URL`). Desde que a RLS foi revogada, seguir as
   instruções levava a um jogo que carrega e não salva — e o sintoma não aponta para a causa.

---

## Já corrigido, mas vale o registro

**`public/_redirects`**: o `CLAUDE.md` afirmava que ele tinha sido criado. Um `find` provou que
não existia — e sem ele, recarregar em `/jogo`, `/login` ou `/registro` no site publicado
devolve 404. O arquivo existe hoje.

Este é o caso mais instrutivo da lista: **um documento que afirma "feito" sobre algo que não
foi feito é a forma mais cara de documentação errada.** Ninguém vai verificar de novo.

---

## Como manter esta lista curta

1. **Ao mudar uma constante, não venha atualizar o número aqui.** Estes documentos citam
   símbolo (`economySystem.ts#STONE_DROP_CHANCE`), não valor. Onde um valor aparece, ele vem com
   a data de quando foi conferido.
2. **Ao reverter uma decisão, remover o registro antigo em vez de só somar o novo.** A entrada
   do `STONE_DROP_CHANCE` existe porque a reversão foi feita no código e não no documento.
3. **Ao afirmar "feito", conferir.** O caso do `_redirects` custou uma rodada de diagnóstico.

Uma verificação automática cobriria a primeira classe (constantes) — um script que leia os
`evalOrDefault` do código e compare com uma tabela declarada. **Não foi construído**: seria mais
uma peça a manter, e o problema real é a duplicação com `CLAUDE.md`, não a ausência de gate.
Resolver a duplicação torna o gate desnecessário; construir o gate sem resolver a duplicação só
formaliza o problema.
