# 19 — Explicação flutuante: inventário de cobertura

Levantamento de tudo que o jogador vê e pode não entender, e de como (ou se) o jogo explica.
Feito para a PH-165. Os números foram **contados** na árvore em 2026-08-25, não estimados; quem
reabrir isto depois deve recontar antes de confiar.

## O que é a bolha, e o que ela não é

A bolha responde **"o que essa palavra quer dizer"** em uma a três frases. A
[Wiki](../src/features/wiki/WikiMenu.tsx) responde **"como funciona o sistema"** em páginas de
JSX. As duas não se substituem e não devem se repetir.

O mecanismo é `src/components/shared/Explicacao.tsx`, e ele existe por um motivo que não é óbvio:
o `TooltipTrigger` do `@base-ui/react` tem `mouseOnly: true` fixo no código do pacote. Toda bolha
feita direto com ele **nunca abriu no celular**. `Explicacao` controla `open` por fora, deixa o
hover do base-ui continuar mandando, e entra o toque por `onClick` — não por `onPointerDown`,
porque começar a rolar a lista com o dedo em cima da palavra abria a bolha no meio da rolagem.

O texto vem de `src/data/glossario.ts`: **21 verbetes estáticos** e **8 verbetes-função** (os que
dependem do POKE na tela — a natureza *dele*, o status *dele*).

## Os três padrões que convivem hoje

| Padrão | Onde | Abre no celular? | Veredito |
|---|---|---|---|
| `Explicacao` / `<Palavra>` | 12 arquivos | Sim | É o certo |
| `title=` nativo do HTML | 40 ocorrências | **Não** | Precisa migrar ou virar outra coisa |
| Nada | O resto | — | Avaliar caso a caso |

O `title=` nativo é pior do que parece: só abre com o mouse parado ~1s, **não existe no toque**,
não aceita formatação e ignora a identidade visual do jogo. Ele parece resolvido e não está. O
cabeçalho de `Explicacao.tsx` já diz isso com todas as letras; este documento só enumera o que
sobrou.

**A conversão de referência já existe:** `src/components/shared/StatusBadge.tsx` migrou de
`title=` para `<Palavra verbete={verbeteDoStatus(status)}>`, e o comentário lá registra o ganho —
no celular a sigla de 3 letras era "um enigma sem legenda nenhuma". Copiar aquele formato.

## Cobertura por área

**12 de 118 arquivos `.tsx` usam a bolha — 10%.** E a distribuição importa mais que o total:

| Área | Com bolha / total |
|---|---|
| `components/shared` | 6/12 |
| `components/hud` | 3/7 |
| `features/pokedex` | 1/1 |
| `components/auto` | 1/3 |
| `components/toasts` | 1/3 |
| `components/game` | **0/7** |
| `components/modals` | **0/10** |
| `features/mercado` | **0/11** |
| `features/shop` | **0/6** |
| `features/correio` | **0/5** |
| `features/game` | **0/4** |
| `features/bag` | **0/3** |
| `features/hunt` | **0/2** |
| `features/perfil` | **0/2** |
| `features/bestiario` | **0/1** |
| `features/calc` | **0/1** |
| `features/ranking` | **0/1** |
| `features/settings` | **0/1** |
| `features/team` | **0/1** |

**11 das 19 áreas estão em zero.** O recorte não é aleatório: a cobertura existente é quase toda
**vocabulário de combate e de atributo** (`stab`, `iv`, `natureza`, `pp`, `recarga`, `precisao`,
`danoBase`, `estagioDeAtributo`…), porque nasceu junto da ficha do POKE. **Economia, social,
mundo e progressão nunca foram cobertos.** As duas maiores superfícies do jogo — Mercado, com 11
arquivos, e os modais, com 10 — não têm uma bolha sequer.

## Os `title=` nativos, classificados

São 38 ocorrências reais (40 achadas menos 2 falsos positivos, ver a ressalva de contagem
adiante), e elas são **quatro problemas diferentes**. Tratar tudo como "vira bolha" seria errado.

### (a) Motivo de bloqueio e estado — 8 ocorrências, e é o mais urgente

Este grupo não é enfeite: é **bug de usabilidade**. O `title=` carrega a razão de um botão estar
desabilitado. No PC você passa o mouse e descobre; no celular o botão simplesmente não responde e
**nada explica por quê**.

| Arquivo | Texto invisível no celular |
|---|---|
| `features/correio/LinhaDeMensagem.tsx:131` | "Colete o anexo antes de excluir" / "Responda ao pedido antes de excluir" |
| `components/shared/PokeStatDetail.tsx:274` | "Saia da hunt para trocar de golpe" |
| `components/shared/PokeStatDetail.tsx:337` | "Saia da hunt para reordenar" |
| `features/team/TeamMenu.tsx:150` | "O POKE em campo esta preso e nao pode sair agora." |
| `features/shop/components/PokemonsTab.tsx:343` | "Trancado — destranque na Mochila" |
| `features/shop/components/shared.tsx:92` | "Só dá para {verbo} {max} agora" |
| `components/hud/AbilityHud.tsx:180` | "Desligado — duplo clique religa" |
| `features/correio/PainelAmigos.tsx:68` | Online / Offline |

Estes **precisam** aparecer no toque. Bolha do projeto, ou texto visível junto do botão — mas não
podem continuar só no `title=`.

### (b) Conceito — vira `Explicacao` + verbete de glossário

O jogador precisa entender **o que a coisa é**.

| Arquivo | O que explica |
|---|---|
| `components/hud/ClimaChip.tsx:86` | Nome e efeito do clima, e se veio de golpe |
| `components/hud/StatusRail.tsx:276` | Ouro e diamantes por extenso |
| `components/shared/TypeChip.tsx:15` | O tipo elementar (hoje só repete o nome) |
| `features/hunt/HuntMenu.tsx:185` | Quantas espécies o sub-bioma tem e o loot dele |
| `features/hunt/HuntMenu.tsx:225` | Confronto do POKE ativo contra a espécie |
| `features/mercado/components/Historico.tsx:44` | Taxa de venda do Mercado |
| `features/correio/CorreioMenu.tsx:241` | "Anexo esperando coleta" |

### (c) Dica de interação escondida — 3 ocorrências

`features/bag/BagMenu.tsx:191`, `:333` e `features/shop/components/PokemonsTab.tsx:316` ensinam
"Shift+clique para linkar no chat". No celular não há Shift **nem** hover: a dica é invisível e a
ação é impossível. Decidir se existe equivalente de toque ou se a dica só deve aparecer em
ponteiro fino — mas não deixar como está.

### (d) Rótulo de ação — 16 ocorrências, **não** vira bolha

"Remover amigo", "Bloquear", "Conversar", "Mover para a equipe", "Retirar da equipe", "Escolher os
4 golpes", "Comprar itens na Loja", "Recolher/Expandir", "Maior/Menor primeiro", "Vender TODOS os
itens", "Trancar/Destrancar". Em `features/correio/PainelAmigos.tsx`, `features/bag/BagMenu.tsx`,
`features/shop/`, `features/team/TeamMenu.tsx`, `components/auto/AutoFloatingPanel.tsx` e
`components/toasts/ChatLog.tsx`.

Isso é nome de botão, não conceito. Bolha de glossário aí polui o mecanismo e atrapalha o clique.
O conserto é **`aria-label`** — que o `title=` também não entrega direito — e rótulo visível onde
o ícone sozinho for ambíguo. `LinhaDeMensagem.tsx:131` já faz exatamente isso e serve de modelo:
tem `aria-label` além do `title`.

Fica **fora** do escopo de glossário; vale issue própria de acessibilidade.

### (e) Deixar como está — 4 ocorrências

`features/admin/AdminErrorsPage.tsx:146,149` — texto truncado de erro, tela só de admin. `title=`
serve. `features/tutorial/TutoriaisMenu.tsx:23` ("Já visto") e
`components/game/GradeDeInventario.tsx:158` (rótulo do slot) são marginais.

Dois falsos positivos que apareceram na varredura e **não** são tooltip:
`components/game/controls.tsx:349` é a definição do próprio `GameCard`, e
`features/tasks/TasksMenu.tsx:17` passa `title` como prop de `ComingSoon`. Somando: 8 + 7 + 3 + 16
+ 4 = **38**, mais os 2 falsos positivos, fecha as 40 da varredura.

> **Cuidado ao recontar:** `title=` aparece 93 vezes em `src/`, mas `Sheet`, `Painel`,
> `GameWindow`, `ScreenOverlay`, `TutorialModal` e `WikiCard` recebem `title` como **prop de
> cabeçalho**, não como atributo HTML. Já `GameButton` e `GameIconButton` espalham `...props` no
> `<button>` e `GameCard` põe `title` no `<div>` — nesses, o `title=` **vira** tooltip nativo. Só
> 40 das 93 são tooltip de verdade.

## Backlog de conceito sem explicação nenhuma

Termos que aparecem na tela e não têm bolha nem `title=`. Ordenados por quanto o jogador perde sem
eles.

**Mercado e economia** — `PREÇO NEGOCIADO`, `PROCURAS`, `OFERTAS DE VENDA`, `Anúncios Ativos`,
`Leilão terminando`, lance coberto e o que acontece com o ouro preso, escrow, taxa de venda,
Diamante vs Ouro, e os filtros (`Toda raridade`, `Todas as categorias`, `Todos os tipos`,
`Shiny e normal` / `Só shiny` / `Só normal`).

**Hunt e mundo** — `O QUE NASCE AQUI`, `NESTE RITMO`, `POR ABATE`, sub-bioma, loot, raridade de
encontro, a arena do Lance.

**Progressão** — evolução com ramo (o jogador escolhe, e a tela não diz o que perde), pedra de
evolução e o custo em pedras, shiny como eixo separado, nível e XP.

**Social** — anexo do correio e como coletar, amizade, bloqueio, perfil público, conversa por
contato.

**Automação** — o painel Auto (parcialmente coberto), aviso de suprimento por família de item,
farm offline (ver a ressalva abaixo).

**Time e mochila** — trancar item ("nunca será vendido"), POKE preso em campo, mover para a
equipe, os 4 slots de golpe.

## Regras que todo verbete novo tem de seguir

Estão no cabeçalho de `src/data/glossario.ts` e existem por motivo medido:

1. **Uma a três frases.** Bolha com uma página dentro não é lida — o limite curto é a feature.
2. **Não duplicar a Wiki.** Conceito aqui, sistema lá.
3. **Número nenhum escrito à mão onde existe fonte.** `NATURE_BONUS`, `IV_MAX`,
   `CHANCE_DE_TRAIT_OCULTA`, `RARITIES`, `STATUS_RULES` e `TURNO_SEGUNDOS` entram por `import`.
   Número copiado envelhece no primeiro ajuste de balanceamento e passa a mentir **sem quebrar
   teste nenhum** — é o modo de falha silencioso que a PH-71 já pagou uma vez.
4. **Conceito estático vira entrada em `GLOSSARIO`; o que depende do POKE na tela vira função.**

## Fora de escopo, e por quê

**Nada pintado no canvas.** O motor renderiza fora do ciclo do React (`src/render/`), então
inimigo, número de dano, efeito de clima na tela e área de golpe **não têm elemento DOM** para
receber `Explicacao`. Cobrir isso exige hit-testing por coordenada no canvas — ordem de grandeza
acima de envolver um `<span>`, e com risco de brigar com o clique de jogo. Se valer, é issue
própria.

**Farm offline** está desativado por decisão (PH-48 parada). Não escrever verbete para mecânica
que não roda.

**Rótulo de ação** — ver (d) acima. É acessibilidade, não glossário.

## Ordem sugerida de implementação

Uma PR por bloco, para que cada uma caiba numa revisão:

1. **Os 8 motivos de bloqueio da lista (a).** Vem primeiro porque não é melhoria, é conserto: hoje
   um jogador de celular encontra botão morto sem explicação nenhuma. É também o bloco mais barato
   — o texto já existe, só está no lugar errado.
2. **Os 7 conceitos da lista (b).** O clima é o caso que motivou a issue.
3. **As 3 dicas de Shift+clique da lista (c)**, que no celular anunciam uma ação impossível.
4. **Mercado.** Maior superfície sem cobertura, e a área onde não entender custa ouro ao jogador.
5. **Hunt e mundo.**
6. **Progressão**, junto ou depois da decisão de evolução com ramo.
7. **Social e mochila.**

Os rótulos de ação da lista (d) não entram nesta ordem: são issue de acessibilidade, separada.
