# 13 — Divergências conhecidas

Levantado em 2026-08-11, conferindo `CLAUDE.md` e `README.md` contra o código.

**Auditoria completa em 2026-08-17** — as 13 páginas de `docs/`, uma por uma, contra o código
atual (pedido explícito: "audita docs por completo e veja se tem algo desatualizado"). Achado
maior: **um pente-fino em duas branches paralelas** (a migração de catálogo para dados de
Ultra Sun, e a migração "RPC-everything" do servidor de mercado/social/economia para o
Postgres) tinha acontecido sem nenhuma das duas ser documentada aqui — o mesmo padrão de "leva
inteira sem registro" da entrada de 2026-08-16, agora em dois lugares diferentes:

| Página | Severidade | O que estava errado |
|---|---|---|
| [02](02-dados-e-catalogo.md) | **grave** | Descrevia "a fonte de verdade é o Postgres" — verdade até a troca para PokeAPI/Ultra Sun (Gen VII). Os três geradores antigos (planilha, Postgres, diff byte-a-byte) estão **bloqueados** (`scripts/lib/guarda-catalogo-gen2.js`, `PERMITIR_CATALOGO_GEN2=1`), não deletados — rodar `npm run catalog:gerar` hoje reverteria o catálogo em silêncio |
| [04](04-autoridade-do-servidor.md) | **grave** | `server/src/app.ts`, `acoes.ts`, `mercado.ts`, `social.ts`, `reiniciar.ts`, `node.ts` — a autoridade inteira que o documento descrevia — **foram deletados**. Compra/venda/evolução/mercado/chat/correio/ranking/reset viraram ~20 funções `security definer` do Postgres, chamadas direto do cliente via `supabase.rpc(...)`. Só a sessão de hunt (4 rotas, não ~20) continua HTTP |
| [08](08-social-e-mercado.md) | **grave**, mesma causa | Descrevia a mesma lógica de mercado/social como função TypeScript nomeada — toda referência a `comprarAnuncio`/`responderOferta`/`saneiaAnexos`/`reiniciar.ts` apontava para código que não existe mais |
| [03](03-motor-de-simulacao.md) | menor | "39 das 53 Traits têm mecânica" — aritmética não fechava (39+10≠53); real é 43, os 7 traits de imunidade a status estavam fora da lista |
| [05](05-regras-de-negocio.md) | moderado | `XP_GLOBAL_MULTIPLIER` fallback citado como 0.14 (código: 0.10, mudou quando `EXP_GAIN` virou a fórmula escalada de Gen VII); "13 itens reais" (código: 19, faltava a categoria `status_heal`); `AUTO_ACTION_COOLDOWN` citado não existe (é `COOLDOWN_DO_TREINADOR = 1.5`); "11 hunts BOSS" sem contar a do Campeão Lance (12) |
| [07](07-farm-offline.md) | operacional, não-doc | O sistema descrito está correto, mas está **desligado em produção agora** (`FARM_OFFLINE_PAUSADO = true`, pedido explícito do usuário) — nenhuma versão anterior deste arquivo mencionava um estado assim, porque a flag não existia |
| 01, 09, 10 (parcial), 11, 12 | conferem | Achados pequenos (README "cd web" já corrigido citado como pendente; contagem de `assets/` desatualizada; `hunts.test.ts` com 23 casos, real 25) |

`docs/06` já tinha sido reescrito por completo um pouco antes desta auditoria (mesma sessão),
pelo mesmo motivo — ver a entrada de 2026-08-17 mais abaixo neste arquivo.

Método: cada página lida por inteiro, toda alegação concreta (caminho de arquivo, nome de
função/constante, contagem, comando) conferida contra o repositório real — não contra a
versão anterior deste documento. Onde um valor específico não pôde ser verificado com certeza
alta (ex.: alcance exato de uma policy de RLS aberta pela leva RPC), o texto corrigido foi
escrito com a reserva apropriada em vez de afirmar um número não conferido.

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

**Atualizado em 2026-08-17**: mesma categoria ("sistema inteiro faltando"), achada de novo —
[06](06-mundo-hunts-e-spawn.md) descrevia por inteiro a arquitetura de hunts **substituída**
pela leva "hunts em salas" (12 biomas × 3 faixas × 10 salas sorteadas, `data/biomas.ts`)
como se fosse a atual: 69 hunts por "1 tipo elemental = 1 bioma" × 9 zonas × recorte por
região, quando o próprio `biomas.ts` diz no topo "este arquivo SUBSTITUI o desenho antigo".
Pior que a lacuna do combate porque não era silêncio — era afirmação ativa de algo que não
roda mais (bounds errado, 2800×1800 contra os 1400×900 reais; camada de região que não separa
hunt nenhuma há uma leva inteira). Reescrito por inteiro nesta rodada, incluindo o que mudou
na MESMA sessão (contagem regressiva entre salas, `ABATES_POR_SALA` 12→30, wall-block por
sub-bioma pintado à mão, cone de spawn, `AOE_RADIUS = WILD_AGGRO_RADIUS`) — nenhum desses
tinha registro em `docs/` antes.

**Nada aqui foi corrigido no código.** São achados que precisam de decisão: em cada caso, ou o
código está errado (e é bug de balanceamento) ou o documento está errado (e é ruído). Só quem
mantém o projeto sabe qual.

Este arquivo existe também como argumento: é a evidência concreta de por que a
[regra de fonte única do README](README.md#a-regra-que-faz-esta-pasta-valer-alguma-coisa)
manda citar símbolo em vez de repetir número.

---

## Higienização de 2026-08-17 — o diário saiu do `CLAUDE.md`

Pedido explícito ("higienização do contexto do projeto, retirar informação obsoleta"). Medido
antes de mexer: `CLAUDE.md` eram **4.594 linhas / 320KB ≈ 80k tokens carregados em toda sessão**,
e mais da metade descrevia código que não existe. Resultado: **4.594 → ~330 linhas**, com o
diário movido íntegro para `HISTORICO.md` (versionado, não auto-carregado) — cópia conferida por
`diff`, nada deletado.

O que estava obsoleto, por classe:

| Classe | Volume | Situação |
|---|---|---|
| Levas 2 a 9 + "Estado atual" + "Sistema de raridade" + "Movimento e mecânica" | ~1.080 linhas | descreviam `js/`, `css/`, `main.js` — o jogo vanilla, cortado. 67 referências |
| Levas 5.0–5.8 | ~1.200 linhas | descrevem em detalhe `server/src/app.ts`, `acoes.ts`, `mercado.ts`, `social.ts`, `ranking.ts`, `reiniciar.ts`, `node.ts` — **todos deletados** em `29a4da4`. Pior que obsoleto: um agente grepa e não acha |
| "Fonte de dados: o Postgres é a verdade" + prova byte-a-byte | ~68 linhas | fonte virou PokeAPI/Ultra Sun; os três geradores estão bloqueados |
| Fase D (D1/D2/D3) + "o cliente ainda é autoritativo" + "Plano detalhado" + "Migração React+Vite" | ~566 linhas | fases concluídas, narradas em tempo presente |
| 14 referências a `web/src` / `cd web` | — | `web/` é **diretório vazio**; o app é a raiz desde `70d5561` |

### Dois achados que não eram documentação — eram coisa quebrada

1. **`cd server && npm run dev` não existe** e era citado em `CLAUDE.md` **e em quatro páginas
   desta pasta**, incluindo [11](11-operacao.md) na tabela de comandos e como "**primeiro passo,
   sempre**" para diagnosticar 502. `server/src/node.ts` foi deletado em `29a4da4`;
   `server/package.json` tem só `build` e não sobrou nenhum `listen()` em `server/src/`. A
   receita mais citada de diagnóstico do projeto estava morta e apontada como primeira escolha.
   Corrigido nos cinco lugares, com o substituto real (reproduzir a query por
   `db query --linked`).
2. **`scripts/import-kanto-sprites.js` está quebrado** — `COLLAB_ROOT` (linha 24) aponta para
   `assets/SpriteCollab-master (1)/SpriteCollab-master/`, checkout de 1.6GB **removido do disco**.
   A arte já importada ficou; importar espécie nova falha. Registrado no `CLAUDE.md`, não
   consertado (exige decidir entre reobter o checkout ou reescrever o script para a rede).

Correção de rota registrada: ao escrever o `CLAUDE.md` novo eu afirmei três coisas de memória que
a verificação derrubou — `.gitignore:11` (é 17), o checkout do SpriteCollab como disponível (não
está), e `npx supabase functions serve` como caminho conhecido (não testado nesta máquina).
Todas as três estavam no texto antigo ou eram inferência plausível. **Documento novo não é
imune ao mesmo apodrecimento que ele conserta.**

## Constantes onde o histórico contradiz o código

Todos os valores do código conferidos em `evalOrDefault(...)`, e **nenhuma dessas chaves existe
em `formulas.generated.ts`** — então o fallback é o valor efetivo.

> Levantado quando estas afirmações viviam em `CLAUDE.md`. Desde a higienização de 2026-08-17
> elas estão em `HISTORICO.md`, e o `CLAUDE.md` não cita nenhum valor de balanceamento — a única
> tabela de knobs viva é [02](02-dados-e-catalogo.md#knobs-de-economia-disponíveis), que cita
> símbolo em vez de copiar valor. Os "corrigido em `CLAUDE.md`" abaixo são registro histórico.

| Chave | Doc (era) | Código | Onde | Status |
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
| **Guardian/Lord — protetor da sala** (`protetorDaSala`/`criarEntidadeDoProtetor`, antes `bossDaSala`/`criarEntidadeDoBoss`) | `src/engine/systems/salaSystem.ts`, `src/engine/simulation.ts` | Em produção desde 2026-08-25 (PH-225, 12 biomas), zero linha em `docs/` até 2026-08-28 |

Os três do meio (`MIN_ACTION_GAP`, velocidade +30%, auto-destruição) são **regras de combate
com efeito direto em balanceamento**. Estão documentados agora em
[03](03-motor-de-simulacao.md) e [05](05-regras-de-negocio.md).

**Atualizado em 2026-08-28**: a linha do Guardian/Lord acima — achada revisando se `docs/`
precisava de entrada nova pro rename do PH-236 (elimina a palavra "boss" do sistema de sala,
ver `CLAUDE.md`). O sistema inteiro (mini-boss por sala, boss ultimate no fim do andar, gate
sequencial de bioma) rodava em produção desde 2026-08-25 sem nenhuma menção em `docs/` — mesma
classe de lacuna já registrada nesta seção pra pathfinding e regras de combate. Documentado
agora em [06](06-mundo-hunts-e-spawn.md#guardian-e-lord--protetor-da-sala), já com a
nomenclatura Guardian/Lord (código ainda em rename via PH-237→243 no momento desta entrada).

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
2. Não mencionava que **rodar o jogo exige o servidor de autoridade** (`VITE_SERVIDOR_URL`
   apontando para um serviço vivo). Desde que a RLS foi revogada, seguir as instruções levava a
   um jogo que carrega e não salva — e o sintoma não aponta para a causa. (O `cd server &&
   npm run dev` citado na versão original desta entrada também morreu; ver a entrada de
   2026-08-17 abaixo.)

---

## `moves.category` mente para 210 golpes — e mente desde a primeira carga

O enum `move_category` do banco tem **dois** valores:

```
move_category = physical, special
```

O catálogo de Ultra Sun tem **três** (`physical`, `special`, `status`).
`scripts/migrate-catalog-to-postgres.js#buildMoveRows` nunca escreveu a terceira:

```js
category: r['Categoria (informativo)'] === 'especial' ? 'special' : 'physical',
```

Ou seja: **golpe de status está gravado como `physical`.** Medido em produção em
2026-08-31:

| categoria | linhas | com `power = 0` |
| --- | --- | --- |
| `physical` | 416 | **210** |
| `special` | 121 | 11 |

As 210 com poder zero em `physical` são os golpes de status — `acupressure`,
`attract`, `growl`, `rain_dance`, `substitute`, `toxic`, `swords_dance`, e mais
200.

**Por que não quebra o jogo:** a categoria de verdade é resolvida no motor
(`src/data/abilityCategory.ts#resolveAbilityCategory`), a partir do catálogo
gerado. A tabela `moves` do banco é a forma reduzida que o servidor usa para
validar escolha de golpe, e essa validação não olha categoria.

**Como isso apareceu:** derrubou o deploy da PH-332 (Geração III). O gerador novo
(`scripts/gerar-migration-especies.mjs`) escrevia a categoria do catálogo direto
no enum, e o `db push` reprovou na primeira instrução:

```
ERROR: invalid input value for enum move_category: "status" (SQLSTATE 22P02)
```

Nada foi aplicado — a migration roda em transação. O gerador passou a usar a
mesma regra do migrador antigo (PH-336), e
`src/data/enumsDaMigrationDeEspecies.test.ts` agora trava **todo** literal de enum
de toda migration de espécies contra os valores declarados nos `create type` /
`alter type ... add value` do próprio repositório — sem lista branca, porque uma
lista branca só protege os enums que alguém já pensou.

**Não corrigido, e a decisão é consciente.** Acrescentar `status` ao enum e
corrigir as 210 linhas antigas é o certo a prazo, mas enum novo com linhas velhas
erradas é meia-correção: ficaria pior que a consistência de hoje, porque passaria
a existir um subconjunto confiável e um não, sem nada distinguindo os dois. Vira
issue quando alguém precisar da categoria real vindo do banco — hoje ninguém
precisa.

**A lição de processo** é mais barata que a divergência: eu conferi que a coluna
era `USER-DEFINED move_category` e **assumi** que os três valores do catálogo
caberiam. Na PH-330, um dia antes, validei por `SELECT` cada expressão de um
sorteio em PL/pgSQL antes de escrever a migration. Aqui não fiz o mesmo, e um
`select enumlabel from pg_enum` custaria dez segundos contra 407 literais
gerados. **Enum é contrato, e contrato se lê.**

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

4. **Ao mover um sistema, grepar o nome do arquivo antigo em `docs/` e `CLAUDE.md` no mesmo
   commit.** As duas migrações grandes (catálogo Ultra Sun, RPC-everything) deixaram ~28
   referências a arquivos deletados espalhadas, uma delas apontada como "primeiro passo, sempre"
   para diagnóstico. O grep custa segundos; achar isso depois custou uma auditoria inteira.

Uma verificação automática cobriria a primeira classe (constantes) — um script que leia os
`evalOrDefault` do código e compare com uma tabela declarada. **Não foi construído**: seria mais
uma peça a manter, e a duplicação que motivava esse risco foi resolvida na origem em 2026-08-17
(nenhum documento fora de `docs/02` cita valor de balanceamento).

A quarta regra é a que teria mais retorno automatizada: um script que grepe caminhos de arquivo
citados em `docs/*.md` e `CLAUDE.md` e falhe se o arquivo não existir. **Também não foi
construído** — mas, ao contrário do gate de constantes, aqui há dano medido em duas auditorias.
Resolver a duplicação torna o gate desnecessário; construir o gate sem resolver a duplicação só
formaliza o problema.
