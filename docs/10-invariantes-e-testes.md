# 10 — Invariantes e testes

`cd . && npm test` (vitest). 11 arquivos.

O critério para um invariante virar teste neste projeto é específico:

> **Vale teste quando a falha é silenciosa.** Nada lança exceção, nada aparece no console — o
> jogo só fica sutilmente errado, e o sintoma chega como "está estranho" semanas depois.

Um bug que estoura já tem quem o denuncie. Os daqui, não.

| Arquivo | Casos | Impede |
|---|---|---|
| `engine/determinismo.test.ts` | — | Um `Math.random()` novo em qualquer sistema |
| `engine/invariantes.test.ts` | 4 | Estado corrompido depois de combate real |
| `engine/farmOffline.test.ts` | 3 | `stoppedEarly` setado onde não devia (ou não setado) |
| `engine/lootFlow.test.ts` | — | Ordem EXP → loot → captura invertida |
| `engine/systems/economySystem.test.ts` | — | Piso de venda vazando para o ouro por abate |
| `engine/systems/progressionSystem.test.ts` | 3 | Barra de EXP medindo curva diferente do level-up |
| `engine/systems/animationSystem.test.ts` | — | POKE atacando virado para o lado errado |
| `data/hunts.test.ts` | 25 | Espécie órfã, sala sem pool, faixa não batendo com o nome, hunt vazia |
| `engine/salas.test.ts` | 9 | Sala não avançando na quota certa, transição não congelando o mundo |
| `data/elementVfx.test.ts` | — | Caminho de arte errado caindo no procedural em silêncio |
| `lib/erroDeRede.test.ts` | — | "Verifique sua internet" acusando o bloqueador do jogador |

## Determinismo

`engine/determinismo.test.ts` é o mais importante em termos de o que ele protege.

"O jogo é determinístico" quebra em silêncio: basta um `Math.random()` novo em qualquer
sistema, e nada pareceria diferente.

O teste roda **600 passos de simulação real duas vezes com a mesma semente** e compara mundo
com mundo, campo por campo: posições, POKEs, IVs, ids, efeitos, `pendingHits`.

**Com controle negativo:** semente diferente **precisa** divergir. Sem isso, o teste passaria
por acidente se a comparação estivesse quebrada.

Ele pegou o único ponto que ainda escapava — o `uid` — que leitura de código não tinha pego.

## Invariantes de estado

`engine/invariantes.test.ts`, 4 casos sobre 10 minutos de caçada real.

Nenhum destes lança exceção quando quebra: HP negativo desenha barra vazia, item negativo faz
`hasItem` mentir, uid repetido faz o upsert do servidor **sobrescrever um POKE com outro**.

1. Ouro, itens, HP, IVs e atributos em faixa válida, e **sem uid repetido**
2. Pokedex só com espécie real
3. O POKE em campo aparecendo **uma vez só** no estado
4. Inimigo morto sempre com HP ≤ 0

Passaram sem alteração no motor — são rede de segurança, não correção.

## Fluxo de loot

`engine/lootFlow.test.ts`.

`handleEnemyDefeated` faz EXP → `awardKillLoot` → `maybeAutoCatch`, e não há um segundo caminho
de abate (`awardKillLoot` tem um call site só). Isso foi **auditado e já estava certo**.

O que faltava era **garantia**: a ordem é o tipo de coisa que uma refatoração inverte sem
parecer errada, e o sintoma ("capturar rende menos que matar") só aparece como diferença
estatística de ouro por hora.

O teste roda a simulação real com auto-captura ligada e exige que **nenhum abate tenha ouro
0** e que **tenha havido captura** — senão passaria sem provar nada.

## Economia

`economySystem.test.ts` tranca a separação entre `pokemonBaseValue` e `pokemonSellValue`:

- A venda do POKE mais fraco possível dá exatamente 1000
- `awardKillLoot` do mesmo POKE fica abaixo de 100
- O nível vale desde o primeiro ponto (o piso é soma, não `max`)

Sem o teste, a próxima refatoração que "simplificar" as duas funções numa só passa
despercebida.

## Hunts

`data/hunts.test.ts`, 25 casos. Ver a lista completa em
[06](06-mundo-hunts-e-spawn.md#invariantes-trancados-por-teste).

O motivo dele existir: uma espécie sem hunt **continua no Bestiário e com sprite** — só nunca
aparece. Foi assim que o Dratini sumiu do jogo por uma leva inteira sem ninguém notar.

`engine/salas.test.ts`, 9 casos — a máquina de salas em si (quota de abates, sorteio da
próxima sala, ciclo reiniciando em vez de "acabar a hunt", e a contagem regressiva de
transição congelando `stepWorld` até zerar). Ver [06](06-mundo-hunts-e-spawn.md#a-hunt-vira-salas).

## Onde os testes não alcançam, e o que se faz no lugar

Verificação ao vivo, com método fixo:

1. Conta descartável contra a Edge Function publicada (ou o servidor local, quando o corpo do
   erro do PostgREST importa)
2. Efeito conferido **no Postgres** com `service_role`, nunca só no status code
3. Conta apagada no fim

**A regra que isso impõe: todo caso afirma o EFEITO, não o status.** O caso que mais engana:
um DELETE bloqueado pela RLS devolve **204**. A RLS não rejeita — ela não acha linha que case
com a policy. Um teste de status code passaria com o banco inteiramente aberto.

### Armadilhas de método já pagas

- **Comparar uma semente entre dois modos de combate não vale.** O modo pessimista consome
  menos sorteios, então a sequência desloca. A primeira versão do teste "provou" que o
  pessimista rendia mais — artefato do deslocamento. Média sobre várias sementes, **40 no
  mínimo para ouro** (a cauda do `sellMultiplier` chega a 600x).
- **Conferir que o processo certo subiu.** Duas rodadas de medição foram feitas contra um
  servidor local **antigo** ainda de pé na porta 8787 — o processo novo morreu com
  `EADDRINUSE` e o resultado do velho foi lido como se fosse do código atual. Os números
  bateram por sorte. `curl /saude` não basta.
- **Um matcher que acusa 100% das URLs está errado, não alarmante.** Na varredura de listas de
  bloqueio, três falsos positivos do próprio matcher "provaram" que as 6.420 URLs estavam
  bloqueadas antes de o número real (zero) aparecer.
- **Ler estado do jogo por `import()` no navegador instancia um SEGUNDO módulo.** O Vite serve
  módulos editados com query de versão (`?t=...`); um `import()` sem query cria cópia nova, com
  store e contadores de módulo próprios. Sintomas reais: `team` vazio num jogo com POKE em
  campo, e ids de entidade colidindo com o do jogador, quebrando o filtro de engajamento e
  parecendo regressão de performance de 7x. **Fontes de verdade ao testar:** o save, o texto
  renderizado e os pixels do canvas. Para disparar ações, clicar na UI real.
- **Recarregar a página faz parte de verificar uma mudança de componente.** Um fix usou uma
  variável antes de declarar; o HMR do Vite aplicou só metade e derrubou a aba com
  `ReferenceError`. `tsc -b` estava limpo, porque o código **final** está correto — o que
  quebrou foi o estado intermediário do hot reload.

## Gate de dados

`npm run catalog:verificar` prova que os dois geradores emitem arquivos **byte a byte**
idênticos. Sai 1 se divergir. Ver [02](02-dados-e-catalogo.md#a-prova-de-que-trocar-a-fonte-não-mudou-o-jogo).

É o único gate do projeto que prova uma propriedade forte automaticamente. Os documentos desta
pasta **não têm equivalente** — por isso a regra de citar símbolo em vez de repetir número
(ver [README](README.md#a-regra-que-faz-esta-pasta-valer-alguma-coisa)).

## Checklist antes de fechar uma mudança

```bash
npx tsc -b                 # cliente
cd server && npx tsc --noEmit   # servidor (após npm run build:engine)
npx oxlint                 # src/ e server/src/
npm test                   # vitest
npm run build              # inclui a cópia de arte
```

E, para mudança que toca autoridade, economia ou spawn: verificação ao vivo pelo método acima.
