# 07 — Farm offline

> Este documento descreve limiares anti-abuso. Ver a nota sobre publicação no
> [README](README.md#esta-pasta-não-é-publicada).

> **Farm offline está DESLIGADO em produção agora** (`authority/src/progresso.ts#FARM_OFFLINE_PAUSADO
> = true`, a pedido explícito do usuário). O jogador que volta depois de horas fora não recebe
> nada por esse tempo — o intervalo é descartado, não represado (mesma regra do teto de 6h:
> religar não pode despejar dias de recompensa de uma vez). **O jogo AO VIVO não é afetado** —
> os flushes de 30s continuam creditando normalmente, porque ficam abaixo de
> `LIMIAR_OFFLINE_SEGUNDOS`. Retomar exige trocar a constante para `false` **e** republicar a
> Edge Function (`npm run edge:publicar`) — mergear sozinho não basta. Tudo que segue neste
> documento descreve o sistema **como ele se comporta quando ligado**; a chave está desligada
> hoje, não a lógica.

## A regra do jogo

**Offline nunca pode render mais que jogar acordado, mas não pode degenerar para zero.**

Duas alavancas implementam isso: combate pessimista e piso de 50%.

## Não existe fórmula teórica de estimativa

Os dois sistemas — o catch-up de aba oculta e o farm offline de verdade — rodam a **mesma**
pipeline: `simulateWorldSeconds` chamando `stepWorld` em modo silencioso.

Movimento, engajamento, dano, crítico, STAB, efetividade, cooldown, auto-poção, auto-revive,
auto-captura e respawn acontecem de verdade. Só não se desenha nada, e não se toca em aviso,
log nem save por abate (inviável para potencialmente milhares de abates de uma vez).

A especificação pedia captura e shiny com probabilidade normal, e consumo real de poção e
bola, com morte e pausa no instante em que acabam. Isso exige sorteio por abate e inventário
evoluindo no tempo — uma projeção por fórmula seria uma segunda implementação das regras. O
que o modo pessimista muda é **como o combate resolve**, não quem resolve.

## Os dois regimes

`LIMIAR_OFFLINE_SEGUNDOS = 120` (`authority/src/progresso.ts`). O cliente liquida a cada 30s
com o jogo aberto, então 120s deixa folga confortável para um flush atrasado por rede sem ser
confundido com ausência.

| Intervalo | Regime | Combate | Piso | `perfStats` |
|---|---|---|---|---|
| ≤ 120s | ao vivo | normal | não | **alimenta** a taxa |
| > 120s | ausência | pessimista | sim | não alimenta |

**A primeira versão ligava `pessimista = true` em TODO flush**, inclusive nos de 30s com o
jogador na frente do jogo. Isso penalizava quem estava jogando de verdade **e** destruía a
referência do piso: se todo combate é pessimista, não existe "taxa online".

Alimentar a taxa com resultado offline a tornaria auto-referente — ela incluiria os próprios
períodos ausentes.

## Combate pessimista

`world.pessimista` afeta exatamente duas coisas em `computeDamage`:

- Crítico forçado a `false`
- Variação de dano fixada em `DANO_VARIACAO_MINIMA` = 0.85 (o piso da fórmula
  `DAMAGE_VARIATION` da planilha)

**O spawn continua sendo o sorteio normal da hunt.** Essas duas alavancas mexem na
**resolução** do combate: só fazem matar mais devagar. É pessimismo monotônico.

### Fixar o inimigo "mais forte" NÃO era pessimismo

A primeira versão fixava o spawn — o encontro de maior nível do pool, no nível máximo —
supondo "o mais forte sempre" como limite inferior. **Errado nos dois sentidos**, e o usuário
reportou o sintoma: a mochila voltava com centenas de cópias do mesmo POKE.

Medido, 1h na Planície Lv 11-20, mesma semente:

| Spawn | Abates | Ouro | Capturas | Espécies distintas |
|---|---|---|---|---|
| sorteado (normal) | 1213 | 305.005 | 219 | 28 |
| fixado (pessimista antigo) | 1073 | 209.165 | **332** | **1** (pidgey ×332) |

Fixar a espécie fixa junto a `catchRate`: o de maior nível daquela hunt era Pidgey, fácil de
capturar. **O modo criado para limitar o offline capturava 50% mais que o jogo ao vivo.**

"Mais forte" e "menos lucrativo" não são a mesma coisa.

Com o pessimismo real, 40 sementes de 1h cada, pessimista contra normal:

| Métrica | Pessimista | Normal | Delta |
|---|---|---|---|
| Abates | 1200 | 1246 | -3,7% |
| Ouro | 341.524 | 364.946 | **-6,4%** |
| XP | — | — | -3,6% |
| Capturas | 205 | 213 | -3,8% |
| Espécies distintas | 28,5 | 28,5 | 0 |

**Duas honestidades:**

1. A margem é fina (3 a 6%). "Offline < online" é garantia **estatística** sobre milhares de
   abates, não estrutural por sorteio.
2. **Ouro precisa de amostra grande.** Com 8 sementes, o pessimista saiu 0,5% **acima** do
   normal — ruído da cauda do `sellMultiplier` (até 600x). Só com 40 sementes converge.

### Armadilha ao testar isto

Comparar **uma** semente nos dois modos não vale: o pessimista consome menos sorteios (pula
crítico e variação de dano), então a sequência desloca. A primeira versão do teste "provou"
que o pessimista rendia mais (14 contra 9 abates) — artefato do deslocamento.

O honesto é a média sobre várias sementes, **40 no mínimo para ouro**.

## O piso de 50%

`authority/src/farmOffline.ts`. Se o pessimista render abaixo de metade da taxa online medida, o
servidor completa a diferença em ouro e XP.

```
pisoOuro = (perf.gold / amostraSegundos) × FRACAO_DO_PISO × resumo.simulatedSeconds
ouroAdicionado = max(0, pisoOuro - resumo.gold)
```

`FRACAO_DO_PISO = 0.5`.

### A amostra tem mínimo

| Constante | Valor |
|---|---|
| `AMOSTRA_MINIMA_SEGUNDOS` | 300 |
| `AMOSTRA_MINIMA_KILLS` | 10 |

A "taxa online medida" vem de `perfStats`, que **zera a cada entrada em hunt**. Sem mínimo, o
piso vira exploit ao contrário: quem entra numa hunt e fecha o jogo em 3 segundos teria "1
abate / 3s" = 1200 abates/h, e metade disso pagaria mais que jogar.

O mínimo também fecha o truque de farmar uma hunt fácil, trocar para uma brutal e deslogar:
trocar de hunt zera a amostra e o piso simplesmente não se aplica.

### O piso multiplica o tempo REALMENTE FARMADO

`resumo.simulatedSeconds`, não o tempo offline. Se o POKE morreu aos 10 minutos por falta de
poção, o piso vale sobre esses 10 minutos. Usar o tempo cheio anularia a regra de morte —
morrer renderia o mesmo que sobreviver.

### Captura, shiny e drop não entram no piso

São **eventos, não taxa**. Não existe "50% de um shiny".

### `perfStats` não acumulava nada no servidor

`recordKill` vive num `if (!silent)` do motor, e o servidor simula **sempre** em silêncio.
Resultado: amostra zerada (`{gold:0, mobs:0, since:0}` no banco, confirmado), a guarda de
mínimo reprovava o piso para sempre — o recurso era **código morto**.

O flush ao vivo passou a chamar `recordBatch`, o mesmo remédio que o catch-up de aba oculta já
usava. `abrirSessao` zera a amostra, como `controller.enterMap` sempre fez no cliente.

### `perfStats.since` sai 0 numa conta nova

Default da coluna; só vira timestamp na primeira entrada em hunt. O Hunt Analyzer anunciava
"amostra desta sessão: mais de um mês" para quem acabou de criar a conta. A conta estava
certa (epoch até agora); a premissa é que estava errada.

## O bug do POKE caído: a caçada queimava o relógio para sempre

**Não é o mesmo bug do catch-up de aba oculta** (aquele era o cliente perdendo o intervalo;
este é do servidor, sob autoridade). Medido contra a Edge Function publicada, antes de
qualquer mudança:

```
flush #1: creditado 21579s | simulado 70.9s | abates 9 | stoppedEarly true | hp 0
flush #2: creditado 21579s | simulado  0.1s | abates 0 | stoppedEarly true | hp 0
flush #3: creditado 21579s | simulado  0.1s | abates 0 | stoppedEarly true | hp 0
-- cura no Hospital, mesma sessão --
pós-cura: simulado 21579.0s | abates 8285 | ouro 1055 → 113165
```

**A cadeia:** `simulateWorldSeconds` para (`stoppedEarly`) quando o POKE cai e não há como
reanimá-lo — regra correta. O que ninguém tinha ligado: o HP fica gravado em
`pokemon_instances.hp`, a sessão continua **aberta**, e `buildMapWorld` reconstrói o mundo
com o POKE já no chão. Então **todo flush seguinte encontra o cadáver no primeiro passo**:
credita o intervalo inteiro (`last_flush_at` avança), simula 0,1 segundo e devolve nada.

O jogador só sairia disso curando no Hospital — o que ele não tem motivo nenhum para fazer,
porque nada na tela dizia que a caçada morreu.

Piorando: **o relatório "Bem-vindo de volta" só aparecia com `abates > 0`.** No caso do bug o
resumo tem zero abates, então justamente a situação que precisava de explicação era a única
muda. Sintoma: passou a noite fora, voltou, não ganhou nada, nenhuma mensagem.

**Não é caso raro.** `autoRevive` nasce **desligado** e o inicial é Lv1 com 11-12 de HP.
Medido no motor: Charmander Lv1 na route_46 com auto-poção ligado e 500 poções **gasta as 500
em ~30 minutos e morre**; a partir do Lv3 sobrevive a hora inteira. A primeira ausência longa
de uma conta nova cai no bug com frequência alta.

### As correções

- **A caçada ACABA quando o POKE cai sem como levantar.** `aplicarFlush` devolve
  `encerrada: 'desmaio'`, e o chamador fecha a sessão e limpa `current_map_id`. Sem sessão
  aberta não há mais relógio para queimar: o próximo flush responde 409.
- **O tempo perdido NÃO é bancado, de propósito.** Congelar `last_flush_at` no instante da
  morte devolveria as horas não farmadas quando o jogador curasse, transformando "morrer
  custa o resto da ausência" em "morrer não custa nada, desde que você cure em até 6h".
- **`estado.currentMapId = null` sai na própria resposta do flush**, não só na coluna. O
  cliente sobrescreve o estado local com essa resposta; um `currentMapId` sobrevivente o
  deixaria desenhando uma caçada que o servidor já encerrou.
- **O cliente sai da hunt por regra derivada**, não por campo especial: `GameShell` observa
  "`currentMapId` nulo com hunt na tela". Escolhido assim porque `/acao` e `/mercado`
  **também** liquidam a sessão antes de agir — um POKE que cai durante uma dessas encerra a
  caçada por um caminho que não passa pelo flush. A regra derivada cobre as três rotas de
  uma vez. (Trava `saindoDaHunt` necessária: `returnToHospital` grava `currentMapId` já nulo
  **antes** de trocar a cena, e esse `set` acorda o próprio observador — sem a trava,
  recursão infinita.)
- **O relatório aparece com zero abates** quando `stoppedEarly`. O texto que explica a parada
  já existia no modal desde sempre; nunca chegava a ser renderizado.
- **`DefeatModal`** (antes `BossDefeatModal`) vale para **qualquer** hunt em que o POKE não
  pode levantar. Era a versão "com o jogo aberto" do mesmo buraco: o jogador via um POKE
  deitado num mapa que não rendia mais nada, sem explicação.
- **`/sessao/abrir` recusa POKE com `hp <= 0`** (409 em português), e `controller.enterMap`
  recusa antes de ir à rede. Defesa em profundidade — o caminho real é o POKE morrer
  **durante** a sessão.
- **Hunt BOSS entrou na condição de parada.** `autoSystem` proíbe reanimar em hunt
  `noRespawn`, mas o critério de parada olhava só `autoRevive && tem Revive`. Com Revive na
  mochila, o laço considerava o POKE recuperável e rodava as 6 horas inteiras com ele caído —
  **sem `stoppedEarly`**, ou seja, zero abates e nenhuma explicação no relatório.
- **`simulated_seconds` soma `resumo.simulatedSeconds`**, não o intervalo. Os dois só divergem
  quando a simulação parou cedo, e aí creditar o intervalo cheio mente no "tempo de jogo" do
  Perfil: na medição acima, três flushes de 6h somaram **30 horas** de tempo jogado para ~6
  horas de simulação real.

`src/engine/farmOffline.test.ts` tranca os três invariantes: POKE já caído para no primeiro
passo, auto-revive com Revive **não** para, e hunt BOSS para mesmo com Revive na mochila.
Nada disso lança exceção nem loga — um `stoppedEarly` que deixe de ser setado (ou passe a ser
setado onde não devia) só aparece como "o farm offline não funciona às vezes".

### Decisão de balanceamento pendente

O gatilho prático do bug é **auto-revive desligado por padrão**. Com ele ligado e Revive na
mochila, a caçada atravessa a noite. O default **não** foi mudado: foi escolhido
explicitamente, e invertê-lo por conta própria trocaria "farm para quando você morre" por
"farm nunca para" sem ninguém ter pedido.

## Catch-up de aba oculta (o lado do cliente)

Aba minimizada ou oculta, **nunca fechada**. Cinco causas distintas já foram diagnosticadas
aqui:

**1. O catch-up perdia 59 de cada 60 segundos.** O gap era medido contra o timestamp do
último tique ao vivo, o que só serve em navegador que **congela** a página oculta
(Safari, Chrome mobile). Chrome e Edge desktop fazem *intensive throttling*: o
`setInterval` segue rodando, só que uma vez por **minuto**, cada despertar clampado em
`MAX_DELTA` (1s) e ainda reescrevendo o timestamp. O gap medido nunca passava de ~60s: 3
horas minimizado = ~3 minutos de jogo.

A correção foi trocar timestamp por **contabilidade de débito**: `simulatedSinceSync` (a soma
dos `dt` simulados) contra o relógio de parede. A diferença é a dívida, qualquer que seja a
causa da perda — throttle, clamp, suspensão do sistema operacional.

**2. Nenhum save quando a aba era ocultada.** Fora do `setInterval` de 10s só havia
`beforeunload`, que navegador mobile **não dispara** ao matar página em segundo plano. Hoje
salva também em `visibilitychange`(hidden) e `pagehide`.

**3. Simulação sem teto travava ou matava o aparelho.** Gap de 3 dias = 2,6 milhões de passos
síncronos na thread principal. E como `saveGame()` só vinha **depois**, o save nunca era
gravado e a mesma simulação condenada rodava de novo a cada carregamento. Ver os limites em
[03](03-motor-de-simulacao.md#simulação-em-lote-offlinesimsystemts).

**4. Relógio do dispositivo andando para trás.** `Date.now() - savedAt` fica negativo (resync
de NTP, dual boot). O código antigo só não entrava no `if`, e o `savedAt` no futuro continuava
lá — farm offline morto até o tempo real alcançar o timestamp furado. Hoje, gap negativo
força save imediato para reescrever o timestamp com o relógio deste aparelho.

**5. Falha de armazenamento em silêncio.** `SaveManager.save` engolia o erro num
`console.warn`. Sem save não há `savedAt`: "o farm offline não funciona" ficava
indistinguível de "o jogo não salva" — e Safari em navegação privada lança na escrita. Hoje
um toast avisa, uma vez por sessão.

**Três gatilhos, não um:** `visibilitychange`, `pageshow` (bfcache, que retoma sem
necessariamente passar por transição de visibilidade) e o `setInterval` de 10s — este é o
único que cobre os casos **sem nenhum evento de visibilidade**: notebook com a tampa fechada
e a aba em foco, e tela de celular desligada em alguns navegadores Android.

Constantes: `MIN_CATCHUP_GAP_SECONDS` = 5 (abaixo disso é jitter normal),
`MIN_OFFLINE_GAP_SECONDS` = 60 (evita disparar em todo F5 de desenvolvimento),
`CATCHUP_CHECK_INTERVAL_MS` = 10.000, `CATCHUP_WALL_CLOCK_BUDGET_MS` = 1.200 (menor que o do
boot, porque roda com o jogo já na tela).

## O relatório "Bem-vindo de volta"

Sob autoridade, o resumo vem **do servidor**, não de simulação local. Dois erros simultâneos
foram corrigidos aqui:

1. Uma simulação local daria números **diferentes** dos creditados (RNG e mundo
   independentes): o relatório não bateria com o ouro recebido.
2. **O modal nem aparecia**: sob servidor, `savedAt` vem do load remoto, o gap local é ~0 e o
   boot desistia. O tempo offline **era** creditado, em silêncio — no clique seguinte em
   "Entrar", quando a sessão antiga era liquidada. O ouro pulava sem explicação.

`assentarSessaoPendente()` liquida no boot a sessão aberta e devolve o resumo. **Fecha** (não
só flush) porque ao voltar o jogador está no Hospital, não caçando. O tipo é o mesmo
`OfflineSimSummary` local, então o modal lê os dois sem saber a origem — o servidor roda o
mesmo `simulateWorldSeconds`.

Conteúdo: tempo fora, ouro e XP ganhos, level-ups (medidos como **diferença** entre início e
fim, não contando o `leveledUp` por abate — um único abate pode subir mais de um nível),
capturas (até 40 exibidas + contador do resto), shinies vistos contra capturados, itens
obtidos, consumíveis gastos e balanço estimado. **Cada linha some com valor 0.**

`itemsGained` / `itemsConsumed` são o **diff** de `gameState.items` antes e depois da
simulação inteira, não soma manual por abate: captura qualquer fonte de consumo ou ganho
(bolas, poções, revives, drops) sem listar cada caminho à mão.

O ícone de POKE no relatório usa `faceIconUrl` (o retrato PMD 40×40, já quadrado e enquadrado
no rosto) com `object-cover`, não `spriteUrl` (o ícone "grande", recorte de fan sheet com
proporção e padding variáveis por espécie, que virava mancha num box de 1.6em).
