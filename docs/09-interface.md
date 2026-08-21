# 09 — Interface

## O fundamento: escala fluida em `em`

`.hud-root` (`index.css`, aplicada no `GameShell`):

```css
font-size: calc(clamp(16px, 0.55vw + 12px, 22.5px) * var(--hud-scale));
```

**Todo tamanho, padding e offset da interface é escrito em `em`.** A UI encolhe e cresce em
bloco com a largura da tela, sem media query por elemento.

`--hud-scale` é a preferência do jogador (0.7 a 1.4, ajustável em Config).

### Por que shadcn saiu da HUD

Primitivos shadcn são dimensionados em `rem`, ancorados na raiz do **documento**. Um `Button`
`h-8` dentro de um card em `em` para de acompanhar quando a tela muda de tamanho — no
protótipo isso já tinha estourado o input de porcentagem do auto-poção para fora de um painel
de 19em.

Daí `src/components/game/controls.tsx`: `GameButton`, `GameInput`, `GameSelect`, `GameCheck`,
`GameSwitch`, `SegmentedTabs`, `Meter`, `GameCard`, `StickyHeader`, `Paginacao` — tudo em
`em`.

Primitivos shadcn seguem **fora** do jogo (login, cadastro, home) e nos tooltips, onde não há
escala fluida.

### `hudScale` não vive no `gameStateStore`

Aquele estado é propriedade do servidor (a resposta sobrescreve o objeto inteiro), então
preferência de vídeo gravada lá seria apagada no primeiro flush. Vive em `localStorage`
próprio, por aparelho (`uiStore`).

## Regimes de dispositivo, em JS

`useDeviceMode()` (`uiStore`) le largura, **altura** e `(pointer: coarse)`, alimentados por um
unico listener compartilhado, e devolve um de tres regimes:

| Regime | Quando | Layout |
|---|---|---|
| `compacto` | largura `<820` e nao deitado | Trilho no topo, doca no rodape, paineis em sheet |
| `deitado` | altura `<520`, mais larga que alta, com dedo (ou `<1024`) | Igual, sem rotulo na doca, doca em cluster de 38em |
| `amplo` | o resto | Mesmo trilho e mesma doca, mais largos, com taxas e treinador no trilho, paineis em janela |

**E uma arvore so.** O amplo e o compacto com mais espaco — nao existe layout de desktop
separado. A alternativa (duas arvores) foi recusada porque toda feature nova custaria dobrado, e
porque o celular volta a ser o caso degradado no primeiro descuido.

**A altura entrou na conta em 2026-08-18.** O desenho anterior decidia tudo por largura, e por
isso um celular deitado (844x390) caia no regime desktop com 390px de altura util: cards do topo
e rodape sobrepostos, sem nenhum breakpoint acusando.

`(pointer: coarse)` e separado da largura de proposito. Uma janela de navegador estreita num
desktop **nao** e um celular (hover funciona, alvo de 32px e clicavel) e um tablet largo **nao**
e um desktop. Ele decide alvo de toque e o caminho de informacao que dependia de hover.

O mesmo listener **limpa as posicoes de janela arrastadas** (`winPos`) — mas so numa mudanca
ESTRUTURAL (largura, ou altura > 120px). A medida vem do `visualViewport`, e a barra de URL do
celular muda a altura o tempo todo: com o `winPos: {}` incondicional, uma janela arrastada
voltava sozinha pro centro enquanto o jogador rolava uma lista dentro dela.

`useBreakpoints()` ainda existe e ainda e lido pelo `ChatLog`. E a API anterior, por largura; nao
use em codigo novo.

## A unica media query de layout do projeto

```css
@media (max-width: 640px) {
  /* teto do clamp reduzido; multiplicador manual limitado a min(var(--hud-scale), 1.2) */
}
```

E legitima porque `font-size` e estilo puro, nao posicionamento — "regime de layout em JS, nao
CSS" continua valendo para o resto.

O teto do multiplicador foi 1 ate a HUD mobile e voltou para **1.2**. Ele estava travado porque o
layout antigo (cinco ancoras negociando a mesma faixa) ja colidia no tamanho normal; trilho e
doca ocupam a largura inteira e nao disputam espaco com ninguem.

## O rodape e MEDIDO, nao estimado

`HudLayer` poe um `ResizeObserver` no wrapper do rodape e grava a altura em
`uiStore.footerHeight` (guarda anti-loop: so faz `set` se o valor arredondado mudou). A altura
muda com o regime, com o numero de golpes do POKE e com o `hudScale` — nenhuma constante em `em`
fecha os tres eixos.

Quem ancora nesse numero: o **sheet** (para em cima da doca em vez de cobri-la), o chat flutuante
e o `CampoOverlay` (os avisos de revive, BOSS e contagem do Lance eram `fixed inset-0` e cobriam
a barra de golpes).

O chat flutuante ancora acima do rodape em **qualquer** largura. A regra antiga — "acima de 780px
o rodape e uma fileira central estreita, longe do chat" — descrevia o menu de circulos, que nao
existe mais: com a doca de ate 52em centralizada, em 1440px a janela do chat cobria os slots
Equipe e Mochila.

### Como medir colisao de HUD

Regra, para repetir: coletar os `getBoundingClientRect` de toda superficie com `z-index` 18-22 (a
faixa da HUD), remover as contidas em outra maior (wrappers compartilhados dao falso-positivo) e
cruzar par a par. **Overlap real e o que sobra.**

Para alvo de toque, a mesma ideia com outro criterio: varrer `button, select, input, a` dentro do
corpo do painel e listar quem tem `height < 40`. Foi assim que se soube que 157 dos 341 alvos da
Loja e 75 dos 75 da Mochila estavam abaixo do minimo — numero, nao impressao.

Screenshot sozinho engana — o wrapper pode sobrepor sem o conteudo, centralizado, chegar a
colidir.

**Armadilha de ferramenta:** `resize_page` do Chrome DevTools trava em **500px** (minimo da
janela do Chrome). Todo teste que parava em ~492-500px nao testava celular nenhum. So `emulate`
com device metrics override (`390x844x3,mobile,touch`) chega num aparelho de verdade.

## Duas superficies permanentes: trilho e doca

`StatusRail` (topo) e `ActionDock` (rodape) sao a HUD inteira. Tudo o mais e contextual (chip de
sala, chip de evolucao) ou aberto por toque.

O desenho anterior tinha cinco ancoras independentes nas bordas — `ActivePokeCard` + `RatesCard`
a esquerda, `CenterBlock` no centro (que em `<1140` DESCIA para cima dos outros dois),
`TrainerCard` + `SideMenuColumn` a direita, `MainMenu` + `AbilityHud` no rodape, `AutoButton`
solto e `ChatLog` flutuante. Cada uma se posicionava sozinha e negociava com as vizinhas por
breakpoint. Em 390px elas se cobriam: medido no aparelho, o card do treinador ficava por cima do
HP do POKE, e o chat ocupava 12% da tela em cima do campo de batalha.

**O criterio do que entra no trilho:** o dado muda sozinho e o jogador olha para ele sem ter
pedido. HP, XP, carteira. Local, Pokedex, taxas e o perfil do treinador moram atras de um toque na
gaveta de detalhes — nao porque importem menos, mas porque nao mudam entre um olhar e outro.

Duas coisas SAIRAM do trilho depois de medir o que elas custavam na faixa mais disputada da tela:
o contador da Pokedex (que ganhou slot proprio na barra e continua na gaveta) e, **so no
compacto**, o avatar do treinador — sem largura para o nome e o nivel, ele era um icone generico
gastando ~46px permanentes; na gaveta ele cabe com os dois escritos. Em `amplo` e `deitado` a
largura sobra e o avatar fica onde estava.

**O criterio da doca:** oito slots FIXOS, iguais nos tres regimes — Equipe, Mochila, Pokedex,
Hunt, Loja, Hospital, Mercado, Mais. Nada entra ou sai por largura de tela: a posicao se aprende
uma vez. Hunt tem peso proprio (pilula do acento, glifo maior que os vizinhos) por trocar a CENA
do jogo; Hospital e a outra metade do par, e fora de uma hunt aparece marcado como destino atual
em vez de viajar para lugar nenhum.

**Hunt nao fica no centro exato da barra, e nao da para ficar.** Sao 7 destinos alem dele — numero
impar — entao qualquer divisao deixa 3 de um lado e 4 do outro, e o centro do slot do meio cai meio
slot a esquerda do centro da barra (medido: 18,4px em 390px). As unicas saidas exatas sao 6 ou 8
destinos alem do Hunt. A alternativa de grupos com larguras diferentes para compensar foi calculada
e rejeitada: joga os 4 slots da direita para 38,7px em 390px e 31px em 320px, abaixo do minimo de
toque.

**O slot da doca nao usa `alvo-toque`.** A classe traz `min-width: 44px`, e com 8 slots isso
ESTOURA a barra: medido em 320px, os oito somavam 384px numa barra de 304 e "Mais" saia da tela
inteira — flex nao encolhe abaixo de um minimo em px, e nao ha erro nenhum, so um botao invisivel.
O piso ali e so de ALTURA (44px); a largura e 1/8 da barra: 44px em 390px, 34px em 320px.

Rotulo em todo slot, exceto deitado: sem hover nao existe `title`, e icone sozinho no toque e
adivinhacao. O tamanho e `min(.58em, 2.3vw)` e nao `.58em` seco — com 34px de largura util,
"Hospital" e "Mercado" truncavam para "Hospit…". Conferido: em 320px nenhum dos oito trunca.

## Janela no desktop, sheet no celular

`components/game/Painel.tsx` escolhe a moldura pelo regime: `GameWindow` (arrastavel,
redimensionavel) em `amplo`, `Sheet` (bottom sheet) em `compacto`/`deitado`. Quem abre nao sabe
em qual dos dois esta.

A escolha vive em UM lugar de proposito. Repetida por tela, a proxima janela nasceria so com o
caminho do desktop — foi exatamente assim que perfil do POKE, perfil do treinador, Hunt Analyzer
e painel Auto continuaram janelas arrastaveis no celular depois de os paineis de menu ja terem
virado sheet.

**Sheet — quatro coisas que nao sao cosmeticas:**

- **Para ACIMA da doca** (`bottom: footerHeight`). A doca e o unico caminho de navegacao no
  celular; um painel que a cobre obriga a fechar antes de trocar de tela.
- **Altura em % do pai, nunca `vh`.** `vh` ignora os recortes do aparelho e a barra de URL. A
  primeira versao (`vh` mais rodape medido em px) estourava a tela para cima: cobria o trilho e
  escondia a propria alca.
- **Deitado a conta inverte.** Com 390px de altura, reservar 4.4em pro trilho e parar acima do
  rodape inteiro deixava 109px de conteudo — um card e meio. La o sheet cobre o trilho (sobra so a
  folga da alca), para em cima da BARRA DE NAVEGACAO em vez do rodape todo (`uiStore#navHeight`,
  medida a parte) e o cabecalho perde uma linha. Medido: 109px -> 268px.
- **Desenhado por portal em `#camada-hud`.** Um `absolute` resolve contra o ancestral posicionado
  mais proximo, e um sheet declarado dentro da doca herdava a largura dela. O portal tambem
  reconquista o no quando ele sai do documento (remount da arvore) — com a referencia velha
  guardada em estado, o painel desenhava num no solto: a doca marcava a tela como aberta e nada
  aparecia.

**GameWindow — dois detalhes que continuam valendo no desktop:**

- **A largura padrao e escrita uma vez por `ref`, nunca no `style` reativo.** No style, cada
  quadro de arrasto reescreveria `style.width` — a mesma propriedade que `resize: both` grava —
  desfazendo o redimensionamento do jogador.
- **`max-height: min(86vh, 100vh - 12em)`.** O primeiro termo e o teto do design; o segundo
  impede que o rodape da janela vire area morta atras da doca.

Fechar-ao-tocar-fora deixou de ser amarrado ao escurecimento: o painel Auto nunca escureceu o
jogo e sempre fechou ao clicar fora (`fecharAoTocarFora`).

Larguras de JANELA por tela (ignoradas no sheet, que ocupa a largura da tela): Loja 52em,
Bestiario 56em, Calculadora 46em, Correio 40em, padrao 36em.

### O backdrop comia o clique do menu

Reproduzido: Loja aberta, clicar em "Bestiário" só **fechava** a Loja.

O backdrop `inset-0` com `pointer-events: auto` (assim funcionava o clique-fora-fecha) fica
sobre toda a HUD — o clique acertava ele, não o botão. Trocar de tela exigia dois cliques.

Corrigido invertendo a responsabilidade: **backdrop puramente visual**
(`pointer-events: none`), e o fechar-ao-clicar-fora virou listener de documento no
`GameWindow`. A HUD continua **abaixo** dele na pilha (escurece junto com o jogo) e mesmo
assim clicável.

Botões de menu carregam `data-keep-open` — sem isso, clicar no botão da tela já aberta
fecharia (listener) e reabriria (onClick) no mesmo gesto.

**Analyzer e tela de menu eram mutuamente invisíveis:** usavam o mesmo z-index e o mesmo
backdrop, então com o Analyzer aberto, clicar em "Mercado" abria o Mercado **por baixo** dele.
`openScreen` e `setAnalyzerOpen` viraram mutuamente exclusivos.

## O que so existe no dedo

- **Alvo minimo de 44px** nos primitivos de controle, por CSS, a partir de uma classe estavel
  (`jogo-botao`, `jogo-campo`, `jogo-check`, `jogo-switch`, `jogo-range`) e do atributo
  `data-toque` na `.hud-root`. Por CSS e nao por prop: passar `coarse` por ~200 pontos de chamada
  e uma edicao em massa que o proximo controle novo esqueceria.
  - `em` dentro de um `<input>` resolve contra o font-size do proprio controle (~11.5px, definido
    pelo navegador). Por isso a caixinha do checkbox esta em px, e quem recebe os 44px e o
    `<label>`.
  - O switch e um desenho e nao cabe esticar: o alvo cresce por um pseudo-elemento invisivel
    (`.alvo-estendido`, com a folga por `--alvo-folga`). A mesma tecnica vale pra seta da gaveta do
    trilho (30 -> 52px efetivos), pro ticker do chat (27 -> 43) e pro slot de golpe (33 -> 45):
    esticar de verdade engordaria o trilho, comeria jogo e quebraria a fileira de 8 golpes numa
    linha.
  - A area de toque da ENFERMEIRA e a excecao que nao e CSS: ela e desenhada no canvas, e o
    retangulo util e 9,8% x 13,8% da cena (~31px num aparelho de 320px). `hospitalClickOnNurse`
    aceita uma folga em px, aplicada so no dedo.
- **Detalhe do golpe por toque.** Sem hover, o tooltip da barra de golpes nunca abria — a unica
  fonte de dano, precisao, recarga e descricao era inalcancavel, sem sinal de que existia. No
  toque o slot abre um sheet com o mesmo conteudo, que tambem hospeda o liga/desliga (o
  duplo-clique do desktop e um gesto que o celular usa para zoom).
- **Chat vira ticker de uma linha** mais sheet, abaixo de 1200px de largura. E, no
  compacto, o ticker e o UNICO canal: so `error` continua virando toast. Todo toast
  tambem vira linha de chat (`pushToast` escreve nos dois), entao no celular o toast
  era a MESMA frase, uma segunda vez, por cima do campo de batalha. Erro fica porque
  significa que uma acao falhou — isso precisa interromper.
- **Recortes do aparelho.** `index.html` pede `viewport-fit=cover` desde sempre e nenhum ponto do
  CSS lia `env(safe-area-inset-*)`: no iPhone a doca ficava sob o home indicator e, deitado, o
  notch cobria o card da esquerda. A camada `.hud-safe` recorta so a HUD — o canvas continua
  sangrando ate a borda fisica, porque corta-lo deixaria duas tarjas pretas.
- **Voltar fecha a camada do topo** (`useVoltarFechaPainel`), em vez de sair do jogo. Dono unico:
  com um `pushState` por sheet, trocar de painel pela doca desmonta o A (cujo `history.back()` e
  assincrono) e monta o B, e o `popstate` atrasado do A fecha o B.
- **`pointerdown`, nao `mousedown`,** em todo fechar-ao-tocar-fora: no toque o evento de mouse de
  compatibilidade so sai depois do `touchend`, e nao sai quando o gesto vira rolagem.
- **O teclado virtual empurra a HUD pra cima.** A raiz do jogo e `h-svh overflow-hidden` e tudo
  dentro dela e absoluto; `svh` NAO encolhe quando o teclado abre — ele e a altura com as barras do
  navegador retraidas, um valor fixo. Sem tratar, doca, ticker e o campo de digitacao do chat ficam
  ATRAS do teclado. `useViewportTracking` mede `innerHeight - visualViewport.height`, so chama de
  teclado acima de 120px (a barra de URL come ~60px, e um pinch tambem encolhe o visualViewport) e a
  `.hud-safe` sobe por esse tanto (`--teclado`). A metade CSS foi verificada com o inset forcado — a
  doca sobe exatos 300px; a medicao depende de um teclado de verdade.
- **O slot de golpe e `button` nos dois regimes**, mas quem abre a ficha muda com o meio: no mouse o
  clique NAO abre nada (senao o duplo clique que liga/desliga o golpe abriria a ficha duas vezes no
  caminho) — abre `event.detail === 0`, que e o clique vindo do teclado. Sem isso, quem nao usa mouse
  nao tinha caminho nenhum ate dano, precisao e recarga.

## Vidro preto

Tres niveis de superficie, e nada alem deles: `.vidro` (ancorada na borda: trilho, doca),
`.vidro-flutua` (card solto sobre o jogo), `.vidro-alto` (sheet e janela). A elevacao e expressa
por opacidade, raio do blur e fio de luz na borda de cima — sombra espalhada nao le em fundo
preto.

A tinta nao e cinza puro (`#101218`, levemente fria): vidro sobre um jogo colorido puxa a cor do
que esta atras, e sem isso as superficies ficavam com um bege sujo em cima do mapa de deserto.

### O custo do blur nao foi medido, e a chave existe assim mesmo

Configuracoes tem "Reduzir transparencia" (`data-blur="off"`), que troca o vidro por superficie
quase opaca — vidro transparente **sem** blur nao e um efeito, e ruido em cima do jogo.

**Duas tentativas de medir, dentro de uma hunt, com A/B intercalado:**

| Cenario | Com blur | Sem blur | Conclusao |
|---|---|---|---|
| Sem throttle | 16,76ms | 16,68ms | Os dois batem no teto de 60fps; a diferenca some sob o vsync |
| CPU 4x, 4 rodadas | 101,2ms | 101,5ms | O loop do jogo domina (~10fps) e varia de 65ms a 134ms ENTRE rodadas do mesmo lado |

A primeira leitura, **sequencial** (um lado depois do outro, sem intercalar), deu +17ms para o
blur. Intercalando, o efeito desaparece: aqueles 17ms eram a deriva do proprio jogo ficando mais
pesado com mais inimigos em campo. **Lembrete do metodo: A/B nao intercalado mede a deriva, nao o
tratamento.**

O que se sabe sem medir: `backdrop-filter` obriga o compositor a reamostrar o que esta atras da
camada, e aqui isso e um canvas que muda todo quadro. Numa GPU movel fraca e um custo real. A
chave e uma classe CSS, barata e reversivel, entao fica — mas nenhum numero e afirmado ate alguem
rodar isto num celular de verdade.

## Avisos que pertencem ao campo

`CampoOverlay` e a moldura de tudo que avisa sobre o COMBATE (contagem do revive, troca de sala,
derrota, intro do Lance). Ele nao pode cobrir a doca — durante os 5s do auto-revive o jogador quer
justamente abrir a Mochila pra ver se ainda tem Revive.

Duas medidas, e as duas ja estiveram erradas:

- **Embaixo**, o rodape MEDIDO (`footerHeight`) mais uma folga. Foi assim desde que os avisos
  deixaram de ser `fixed inset-0`.
- **Em cima**, 4.4em — a mesma reserva do sheet. Era 7.5em, a medida da "fileira de cards do topo"
  que foi deletada com a HUD nova: sobravam 3.8em de faixa morta no topo do aviso.

Ele e `fixed`, ou seja, **fora da `.hud-safe`** — os recortes do aparelho sao dele pra resolver, e
por isso `var(--sa-*)` aparece nas duas pontas. Sem isso o aviso encostava na doca por baixo num
iPhone, que e exatamente o que ele existe pra nao fazer.

Conferido ao vivo numa troca de sala em 390x844: overlay em 70..678, doca comecando em 770.

## Densidade: quantos itens cabem numa tela

Medido em 390x844, na Mochila, antes de mexer: **5 POKEs visiveis** de uma lista que passa de
cem. Na Loja, **3,5 itens**. O que comia a tela nao era o tamanho da fonte — era a soma de
quatro coisas, e cada uma tem um numero:

| Onde | Antes | Depois | Como |
|---|---|---|---|
| Altura do sheet 'cheia' | 586px | 705px | Ancorar na barra de navegacao, nao no rodape todo |
| Card da Loja | 148,5px | 95,6px | Tres faixas viraram duas |
| Linha da Mochila | 71px | 61px | `p-[.6em]` -> `p-[.4em]`, `gap-[.45em]` -> `gap-[.3em]` |
| Bloco da auto-venda | 53px | 0 | Virou chip na fileira das abas |

Resultado: Mochila **5 -> 8 linhas**, Loja **3,5 -> 5,5**, Pokedex **9,5 -> 11**.

**Por que o sheet 'cheia' para na BARRA e nao no rodape inteiro.** O rodape do celular tem 179px,
dos quais 111 sao barra de golpes, zoom, botao Auto e o ticker do chat. Nenhum dos quatro e
acionavel enquanto se navega uma lista — o jogador esta escolhendo um POKE, nao trocando de golpe
— e os 111px valem 1,7 linha de card. O que NAO pode ser coberto e a barra de navegacao: ela e o
unico caminho pra outra tela, e cobri-la transforma "trocar de tela" em dois toques. Sheet curto
('conteudo', 'meia') continua ancorado no rodape todo: ali a altura nao e o gargalo, e cobrir a
barra de golpes com a ficha de um item seria perder o que o jogador estava olhando por nada.

**Por que o card da Loja tinha tres faixas.** Identidade / quantidade / confirmar. A faixa do meio
usava 192px dos 343 disponiveis — 150px de vidro vazio ao lado dos atalhos `+10 +100 +1000` —
enquanto o botao de confirmar gastava uma faixa inteira de 44px logo abaixo. Juntar os dois nao
custa nada em 390px; em **320px** custa: o rotulo "Comprar 1 · 60" precisava de 75,8px e sobravam
73,9. O que fechou a conta foi o campo de quantidade, de `4.2em` pra `3.4em` — ainda cabe "1000",
que e o maior atalho. O `truncate` cobre o resto (x1000 do item mais caro).

### As duas colunas da Loja

Comprar e vender aparecem LADO A LADO em todo regime (pedido explicito). No celular eram abas —
"Comprar" ou "Vender", nunca os dois — e a troca custava um toque justamente no momento em que o
jogador compara: acabou de esvaziar a mochila numa hunt e quer saber se da pra repor as balls.

O que paga a conta e a forma da linha, e ela depende da LARGURA DA COLUNA, nao do dedo:

| Regime | Coluna | Forma |
|---|---|---|
| `compacto` (390px) | ~170px | Linha so de identidade; a transacao abre num sheet |
| `deitado` (844x390) | ~470px | Card inteiro, transacao inline |
| `amplo` | ~340px+ | Card inteiro, transacao inline |

Em 170px nao cabe campo de quantidade + tres atalhos + confirmar sem derrubar todo alvo abaixo do
minimo — a conta nao fecha, e nao e questao de apertar mais o padding. O sheet custa um toque a
mais por compra e **devolve** alvo de toque: inline, `+10` tem 27px de largura; no sheet passa dos
44px.

Por isso o teste e `mode === 'compacto'` e nao o booleano `compacto` (que inclui `deitado`): ali a
coluna tem 470px e mandar abrir um sheet seria um toque cobrado por nada.

**A ficha nao mora dentro da linha.** O `ItensTab` e que monta os dois sheets, ao lado do grid e
nao dentro dele. Motivo concreto: a linha nao sobrevive as proprias acoes dela — trancar um item o
manda pro fim da ordenacao (e possivelmente pra outra pagina) e vender o ultimo o tira da lista.
Com o sheet montado pela linha, trancar de dentro do sheet DESMONTAVA o sheet no meio da
interacao. Reproduzido antes de mudar. A regra que fica: **estado de painel aberto nao pode viver
num componente cujo tempo de vida depende de ordenacao ou paginacao.**

**O alvo de toque nao entra nessa conta.** Nenhum controle encolheu abaixo de 44px de altura: a
densidade veio de espaco morto (padding, faixa vazia, bloco de configuracao permanente), nunca do
botao. A unica excecao deliberada e a LARGURA dos slots da doca, medida e documentada acima.

## O eixo que faltava nos paineis: altura util

Nenhum painel transbordava de LADO no celular — a escala fluida em `em` ja
resolvia isso sozinha. O problema era vertical, e so aparece quando se mede a
distancia entre o topo do corpo do painel e a primeira linha de CONTEUDO.

Com trilho e doca, o corpo do sheet tem ~553px em 390x844. Antes desta leva:

| Painel | Cabecalho + filtros | Itens visiveis |
|---|---|---|
| Mochila | ~480px (auto-venda 300 + filtros 180) | 4 POKEs |
| Loja > Pokemons | ~330px | 4 POKEs |
| Mercado > Comprar > Pokemon | ~330px | 2 anuncios |
| Wiki | ~150px so de abas quebradas em 2 fileiras | — |
| Calculadora | 300px so nos seis atributos | — |

Tres regras sairam disso:

1. **Configuracao que se mexe uma vez nao pode empurrar a lista que se olha
   todo dia.** Vira `Recolhivel` (controls.tsx). Auto-venda, filtros da Loja,
   filtros do Mercado.
2. **Um acordeao que esconde o ESTADO e pior que a secao sempre aberta.** Por
   isso `Recolhivel` tem `resumo`: fechado, a barra continua dizendo
   "5/6 raridades · IV 20-100" ou "auto-venda: COMUM, RARO". Sem isso, a
   primeira captura vendida sem querer vira bug reportado.
3. **Dado que ja esta no trilho nao se repete no painel.** A carteira saiu do
   cabecalho da Loja e do Mercado: ela esta dois centimetros acima, e no
   Mercado empurrava as abas pra uma segunda fileira.

E dois erros de layout que so aparecem no estreito:

- **`block` (w-full) em dois botoes da mesma fileira soma 200%** e o segundo sai
  da tela. Na Equipe isso criou uma barra de rolagem horizontal no painel; o
  certo e `flex-1`.
- **Detalhe embaixo de uma grade longa e detalhe invisivel.** No Bestiario, com
  226 especies em quatro colunas, o painel de detalhe ficava a vinte fileiras de
  rolagem do toque que o abriu — tocar numa especie parecia nao fazer nada. Virou
  sheet.

### Como medir isto de novo

O mesmo script da secao anterior, com outro criterio: para cada painel, abrir e
comparar `clientHeight` do corpo com o `offsetTop` do primeiro item da lista. Se
o cabecalho passa de ~1/3 da altura util, ele esta no lugar do conteudo.

## Bug de clique em botão dentro de painel re-renderizado a 60fps

**Causa raiz documentada, porque o sintoma engana completamente.**

Um painel que recria o container inteiro (`innerHTML =`) a cada quadro do loop faz um botão
ser recriado 60 vezes por segundo. Um clique de mouse (mousedown e mouseup separados por
dezenas de ms) cai em **duas instâncias de DOM diferentes**, e o navegador descarta o `click`
em silêncio — heurística que cancela clique em drag.

Sintoma: o botão "não fazia nada", mas `.click()` via JS funcionava. Lógica certa, DOM
destruído demais.

Correção: DOM incremental. A estrutura é montada uma vez, os elementos ficam guardados, e o
quadro seguinte só atualiza texto, largura e display — nunca recria nodes.

**Qualquer painel novo que re-renderize a cada quadro E tenha elemento clicável segue o mesmo
padrão.** No React isso se traduz em: nunca recriar a subárvore de um controle interativo a
cada tique do loop.

`updateAutoPanelCounts` segue essa regra: escreve texto num `<span>` irmão do `<select>`,
**nunca dentro** dele. O contador de item nunca vai dentro do `<option>`.

## Tokens

O `.dark` do `index.css` é a paleta do design: `--background #0a0a0c`, cards `#141519`, borda
`#232428`, `primary` como pílula clara `#e6e7ea` com conteúdo escuro.

A escada neutra (`n900`..`n100`) e as cores semânticas de **dado** (`gold`, `diamond`, `hp`,
`hp-low`, `exp`, `shiny`, `ok`, `warn`, `bad`, `cat-physical`, `cat-special`) são tokens em
`@theme inline`. Antes eram utilitários Tailwind soltos (`amber-400`, `emerald-500`)
espalhados.

**Paletas de tipo elemental e de raridade continuam onde estavam** (`data/typeColors.ts`,
`data/rarity.ts`): é dado do jogo indexado por chave, não cor de chrome.

`--font-mono` (Geist Mono, via `@fontsource-variable`) precisou ser **definido**: `font-mono`
era usado nos três elementos mais chamativos do DOM (splash "LVL UP!", contagens do Lance e do
Auto-Revive) sem o token existir — caía no stack default, que é Menlo no Mac, Consolas no
Windows e Liberation Mono no Linux.

**Texto do canvas continua `monospace` literal, de propósito**: não herda CSS e é pixel-art do
mundo, não chrome.

Ícones: `@phosphor-icons/react` como pacote npm, **não CDN** — custo de request a outra origem
no primeiro paint já era regra do projeto para fonte, e vale igual para ícone.

`html { font-size: 19px }` cobre login, cadastro, home e os primitivos shadcn (que são em
`rem`).

## Listas longas: paginação, não virtualização

`components/game/Paginacao.tsx`, 30 por página, nas 4 listas longas (Mochila: POKEs e Itens;
Loja: vender itens e vender POKEs).

Virtualizar exigiria saber a altura da viewport de scroll e de cada linha — e aqui as duas
variam com o **redimensionamento da janela** (`GameWindow` tem `resize: both`), com o
`hudScale` e com o próprio conteúdo (o card quebra em duas linhas com nome longo). Daria
medição contínua e um scroll aninhado dentro de um container já rolável, ruim no toque.

**A paginação entra DEPOIS de filtrar e ordenar**, e "Selecionar tudo" / "Vender Tudo"
continuam olhando a coleção inteira: um "Selecionar tudo" que marcasse só os 30 visíveis seria
uma armadilha.

Antes disso ser medido, a decisão de **não** virtualizar tinha outro fundamento: FPS medido em
158+, zero long task com 220+ cards. Otimização prematura até uma coleção realmente derrubar o
quadro.

## Cabeçalho fixo e rolagem preservada

`.screen` não rola por inteiro: flex-column com `overflow: hidden`, topbar fixa (botão X + alça
de arrasto) e corpo, a única parte que rola. Cada painel envolve título, abas e filtros num
`StickyHeader`.

**`-top-[.7em]` e não `top-0`:** o `-mt-[.7em]` que cancela o padding do corpo também desloca
onde o sticky gruda (ele ancora pela caixa de **margem**), e com `top-0` sobrava uma faixa de
~12px por onde a lista passava rolando por cima. Medido: delta de 11,8px antes, 0 depois.

`_scrollPositions` (chave = nome da tela) salva o `scrollTop` a cada scroll e restaura no
render seguinte. Todo filtro e ordenação chama `refresh()`, então isso sozinho resolvia o
scroll resetando por clique, e sobrevive a fechar e reabrir.

Seleção de aba e filtro já sobrevivia sozinha: é estado a nível de módulo em cada painel.

## Busca sem perder o foco

Filtra em cima do array já renderizado (mostra/esconde via `card.style.display`), **sem**
`refresh()`.

Necessário para digitar sem perder o foco a cada tecla: um `refresh()` por tecla recria o
input do zero, tirando o foco no meio da digitação.

## Toasts que mentiam

`ShopMenu` fazia `const res = { success: true }; void pedirAcao(...)` e lia `res` depois —
literal fixo. Comprar dizia "Comprou" mesmo sem ouro, "Vender Tudo" nunca aparecia
(`itemCount` era 0), vender POKE dizia "por 0 ouro".

Corrigido em duas pontas: `pedirAcaoComLocal` devolve o resultado do fallback local, e — porque
sob servidor o cliente **não executa a ação nem sabe o preço** — as ações que faltavam ganharam
`mensagem` no servidor.

## Reatividade

### A sprite comparava o NOME da animação

`updateAnimations` trocava `entity.battleAnim` só quando `battleAnim.name !== resolved.name`.
Trocar de POKE em campo ou evoluir mantém a animação desejada igual (`Idle`/`Walk`), então a
comparação dizia "não mudou" e a `url` continuava apontando para o spritesheet da espécie
**antiga**.

A sprite só trocava quando a animação mudava de nome por outro motivo — na prática, no
primeiro golpe (`Shoot`).

Passou a comparar **a URL**, que carrega espécie + animação + shiny e cobre os três casos.

### Ações assíncronas liam o estado velho

`setActiveTeamIndex` / `removeFromTeam` liam `team[0]` / `team[activeIndex]` de forma
**síncrona** logo após `void pedirAcao(...)`. Sob servidor o `fallback` não roda, então a
leitura pegava o time velho e escrevia o POKE errado em `worldStore.player.poke` — HUD e sprite
só se corrigiam na próxima troca de cena.

Corrigido movendo a escrita para o `.then` da resposta.

### `useAcaoPendente`: `pendingKey` é por LINHA

Não global. Uma lista de 30 itens não congela inteira porque um deles está no ar.

### Selector do Zustand devolvendo array novo = loop infinito

`useGameStateStore(itensEmUso)` devolvia array novo a cada chamada, nunca comparava igual, e o
painel entrava em "Maximum update depth exceeded". Correção: selecionar os pedaços de estado e
derivar num `useMemo`.

## Preload de arte

`data/preload.ts`. O "bug de formas geométricas coloridas" tinha **duas** causas somadas:

1. `render/sprites.ts` carregava cada spritesheet de forma lazy, no primeiro quadro que
   precisava dele. `preloadHunt(mapId, jogador)` (chamado em `controller.enterMap`, **depois**
   de a sessão ser aceita) aquece o **mesmo `imageCache` do desenho** — um cache próprio não
   serviria: o desenho baixaria a segunda cópia e o bug continuaria. Carrega todas as
   animações de todas as espécies do `enemyPool` nas duas paletas (shiny é arquivo diferente e
   pode nascer no primeiro spawn) + o fundo. Teto de `PRELOAD_TIMEOUT_MS` = 4000: rede ruim
   atrasa a entrada, nunca a impede.
2. `drawEntity` desenhava o placeholder geométrico sempre que a sprite não estava pronta,
   confundindo "espécie sem arte" com "arte ainda baixando". Hoje o teste é
   `hasBattleSprites(species.id)`, **não** `entity.battleAnim`: `battleAnim` nasce null em toda
   entidade e só é preenchido no primeiro tique de `updateAnimations`, e o rAF de desenho é
   independente do loop de simulação — então o primeiro quadro desenhado pode chegar antes
   disso e piscaria a forma colorida mesmo com a arte em cache.

## Acessibilidade

`name` automático via `useId()` em `GameInput`, `GameSelect` e `GameCheck` quando o call site
não passa um (o fallback vem **depois** do spread, para sempre vencer, e respeita `name`/`id`
explícito).

Três componentes cobriram 208 warnings do Chrome ("A form field element has neither an id nor
a name attribute"), quase todos de busca, quantidade e filtro renderizados em listas — sem
tocar em cada uso.

## Telas construídas e telas que ficaram como aviso honesto

**Construídas com dado real:**

- **Bestiário** — 226 espécies com contagem de abates (`pokedexKills`, normal e shiny), busca,
  filtros, painel de detalhe e estágios de progresso derivados dos abates. Os limiares
  (500/2.500/10.000/50.000) são decisão de design; o progresso contra eles é dado real. Ordem
  da Pokedex via `pokedexNumber`, não uma segunda tabela.
- **Calculadora de Força** — chama `computeStatsAtLevel`, a **mesma** função que cria POKE,
  sobe de nível e evolui. Comparação A/B com delta por atributo. `Lado.manual` é guardado
  **separado** do cálculo: trocar nível ou raridade tem que voltar a recalcular os atributos
  que o jogador não tocou. Chave ausente = "use o calculado", e apagar o campo **remove** a
  chave em vez de gravar 0 (0 é valor manual legítimo). Equipe atual num `<optgroup>` no topo —
  grupo com rótulo em vez de só reordenar, senão a lista começa fora de ordem alfabética sem
  explicação.
- **Hunt Analyzer** — tudo derivado de `perfStats` e do catálogo. Nenhuma métrica nem contador
  novo. Um gráfico de "ouro por minuto nos últimos 10 minutos" exigiria série temporal que
  ninguém grava: seria uma linha bonita feita de nada.
- **Perfil do Treinador** — "batalhas vencidas" sai da **Pokedex** (cumulativa e persistida), e
  não de `perfStats`, que zera a cada entrada em hunt. "Log de capturas" precisou de
  `capturedAt` (o `created_at` da linha) — sem ele não há nenhuma ordem temporal no save.

**Shells com aviso honesto:** Tasks, Correio (a parte de recompensa), Mercado (partes),
"Outfit" e "Especialidades" do Perfil, Tokens e Runas do Bestiário.

Não há tabela de missões, de skin nem de bônus permanente — nem no Postgres nem no save.
**Preencher com o dado de exemplo do protótipo mostraria barra que nunca anda e botão
"Resgatar" que não paga nada — pior que tela vazia, porque parece bug.**

Pela mesma regra, o chip de missão e "Pokes capturados 11/20" do bloco central saíram: o save
não guarda captura por espécie. Entrou "Pokedex X/226" (espécies com pelo menos um abate
registrado), dado real que diz o que é.

## Tooltips

- **Item** (`data/itemInfo.ts`): texto **derivado** dos números reais (`healAmount`,
  `captureRate`, `reviveHpPercent`, preços), não de uma segunda lista escrita à mão. A planilha
  só tem descrição por **categoria** ("Restaura HP." nas quatro poções), que não responde a
  única pergunta do jogador: "esta é melhor que a que eu tenho?". `Infinity` (o valor real da
  Max Potion) vira "restaura TODO o HP" em vez de vazar detalhe interno.
- **Golpe** (`data/moveDescriptions.ts`): 479 descrições (catálogo Ultra Sun/Gen VII, 18 tipos
  incluindo FAIRY), uma por golpe, conferidas por script contra `ABILITIES_DATA` (zero
  faltando, zero sobrando). Escritas em português a partir dos efeitos reais dos jogos.

  **`AVISO_SEM_DANO` corrigido** (ver
  [03](03-motor-de-simulacao.md#continua-fora-de-escopo-decisão-explícita)). Avisava em TODO
  golpe de potência 0 — presumindo que nenhum tem efeito real, verdade antes da leva de
  combate, falsa depois. `golpeTemEfeitoReal` agora só deixa o aviso acender nos golpes
  GENUINAMENTE inertes (Splash, Transform, Sleep Talk, ...), lendo o mesmo dado/id que o motor
  de combate usa (sem duplicar a lógica de "o que cada golpe faz").

## VFX de combate

Duas camadas: arte real por tipo elemental, e desenho procedural como rede embaixo dela.

### Duas camadas: por GOLPE e por TIPO

O desenho consulta nesta ordem: **golpe → tipo → procedural**. `data/moveVfx.ts` cobre 22 golpes
com arte nomeada; `data/vfxTiras.ts` cobre os 18 tipos; o procedural é a rede enquanto a imagem
baixa. Golpe sem entrada na primeira camada não muda de comportamento em nada.

A camada por golpe existe porque Bullet Punch é STEEL: trocar "a arte do Bullet Punch" mexendo na
tira de aço trocaria junto Metal Claw, Iron Head e todo o resto do tipo.

**As duas usam o MESMO formato e o MESMO desenho desde 2026-08-18.** A camada por golpe era PNG
solto por quadro, o que fazia sentido com um golpe (8 quadros = 8 requests) e deixou de fazer com
22 (de 4 a 20 quadros cada, ~300 arquivos — e o catálogo tem 479 golpes). Migrar apagou junto uma
duplicação perigosa: as funções de PNG-solto e de tira tinham a **mesma conta** de recorte, âncora,
giro e espelho escrita duas vezes no mesmo arquivo, e corrigir geometria em só uma delas não quebra
nada — apenas desalinha metade dos golpes.

**A arte por golpe NÃO entra no preload**, de propósito. Um jogador vê os golpes que o time dele
sabe, meia dúzia, e nunca os outros 470; aquecer 844 KB que a sessão não vai usar troca boot rápido
por nada. O custo é o primeiro uso de cada golpe cair no procedural por alguns frames — que é o que
o fallback existe para fazer. As 18 tiras por TIPO continuam no preload (968 KB), porque todo
combate usa todas.

### Arte real — uma TIRA por tipo

`data/vfxTiras.ts` cobre os **18 tipos**, um PNG cada em `assets/move-vfx/tiras/`, com os
quadros lado a lado (14 a 40 por tipo). A largura do quadro **não** está escrita no código: sai
de `naturalWidth / quadros` — um número a menos para errar quando a arte for regerada. É o
mesmo formato que `captureAnim.ts` já usava para as pokébolas.

Tira e não PNG solto por quadro porque `data/preload.ts` aquece tudo antes de a cena montar:
430 arquivos viraram 18 requests.

Os quadros são **recortados** da moldura transparente comum a todos eles. Sem isso, arte com
muito respiro (desenho de 60px num quadro de 192×192) era desenhada na altura do QUADRO e saía
como uma manchinha no meio do nada — foi o motivo de quatro escolhas terem sido rejeitadas na
conferência sobre o fundo real da hunt.

`TiraDeVfx.escala` corrige o que o recorte não resolve: um relâmpago longilíneo e um estouro
redondo com a mesma altura de arquivo não têm o mesmo peso na tela.

### Escala: o que foi medido, e o que estava errado

A altura pedida no desenho é a MESMA para todas as tiras — `IMPACT_BASE_SIZE (44) ×
ESCALA_VFX_SINGLE × escala` — e a largura sai da proporção do quadro. Duas consequências que só
aparecem medindo: uma tira de quadro 2:1 fica com o dobro da largura de uma quadrada de mesma
altura, e o conteúdo real de cada quadro ocupa uma fração diferente do quadro.

`ESCALA_VFX_SINGLE` era **1.6**, e isso punha todo impacto em 59–143px de mundo contra um POKE
de 29px de diâmetro. O efeito **cobria** o alvo: o jogador via o golpe e não via quem levou.
Hoje é **1.05**, o que dá ≈46px — uma vez e meia o POKE, lê como "acertou aqui" e ainda deixa a
silhueta aparecer. Também para de alcançar o atacante, que está a 39px.

O AOE não leva esse tratamento de propósito: ali o tamanho da sprite **é** o diâmetro da área
(`effect.worldSize = ability.radius * 2`), e encolher mentiria sobre o alcance do golpe.

Depois do ajuste, as 18 caem entre 1.3x e 1.9x o POKE — espalhamento de 1.5x, contra 2.4x antes.
Duas precisaram de correção individual, as duas com `escala` que havia sido posta a olho:

- **FIRE** aparecia com 4.9x o POKE, o dobro da segunda maior. O quadro é 220×119, então a altura
  virava 150px de LARGURA. O conserto não é encolher — é um jato, e encolher o jato encolhe o
  estouro que o jogador precisa ver. `recorteX: 0.68` corta a cauda de trás; a conta está no
  próprio cadastro.
- **DARK** tinha `escala: 1.2` sem motivo medido, e era a segunda maior. Sem escala, cai na
  mediana exata do lote.

### O que a revisão de 2026-08-18 trocou de arte

Duas tiras estavam erradas por motivo que escala e rotação não consertam:

- **FLYING** tinha um **sprite de item embutido** — um objeto amarelo com a palavra DROP escrita —
  visível em 2 de 5 quadros amostrados. Texto de outro jogo no meio de um golpe. Trocada por um
  tornado.
- **FAIRY** desenhava **caveiras** rosa: leitura de morte, não de fada. A escolha original tinha
  sido por matiz e tamanho — rosa é o matiz certo para o tipo, e ninguém olhou o que o rosa
  estava desenhando. Trocada por anéis de partículas, que ganham nos dois eixos medidos
  (luminância 112 contra 98; 35% de pixels claros contra 22%).

**DARK foi avaliada e mantida.** O talho é marrom e não lê como escuridão — a crítica é justa. Mas
os três candidatos escuros do banco medem luminância 21, 1 e 0, com zero por cento de pixels
claros, e esta já é a mais escura das 18 (luminância 50) com 10%. Preto puro sobre o fundo de uma
caverna é um golpe que não acontece na tela. Trocar semântica por invisibilidade é piorar.

### Direção da arte: três classes, não duas

O lote nasceu marcado como "simétrico" em bloco, sem ninguém medir.
`node scripts/conferir-direcao-vfx.mjs` mediu as 18 uma a uma — centroide, eixo principal por
segundo momento, alongamento, e estabilidade do eixo entre quadros — e achou três classes:

| classe | quantas | o que o desenho faz |
|---|---|---|
| RADIAL | 12 | anel, estouro, emaranhado. Sem lado alto — desenha como está |
| VERTICAL | 3 | PSYCHIC (cúpula deitada), POISON (nuvem), FLYING (tornado, eixo em pé). Têm "pra cima", não "pra o alvo" |
| DIRECIONAL | 3 | FIRE, BUG, DARK. Apontam para algum lado e giram para acompanhar o golpe |

A distinção importa porque o teste ingênuo — "é assimétrica? então gira" — **piora** as verticais:
girar a cúpula do PSYCHIC ou o tornado do FLYING na direção do inimigo os deita no chão.

O classificador reconhece VERTICAL por dois caminhos, e o segundo foi acrescentado porque o
tornado escapava do primeiro: assimetria vertical alta (cúpula, nuvem), **ou** eixo principal em
pé e estável (−84° ± 2° no FLYING). Os dois recebem o mesmo tratamento — não giram —, mas o
rótulo importa: "RADIAL" num tornado é um convite para alguém achar que dá para girar.

### As 15 que não giram também apontam — pelo POSICIONAMENTO

Um anel desenhado no centro exato do alvo fica idêntico venha o golpe da esquerda, de cima ou de
trás. O impacto passou a recuar 8px do centro do alvo **na direção do atacante**
(`RECUO_DO_IMPACTO`, em `render/sprites.ts`), encostando na face que levou a pancada.

8px sai do raio: o POKE tem raio 14–15, então recuar 8 põe o centro do efeito a pouco mais da
metade do corpo, com o desenho (≈44px) ainda cobrindo o alvo inteiro. Recuar o raio cheio
deixaria o efeito entre os dois, parecendo que errou. Arte `direcional` não recebe o recuo — ali
o `ancoraX` já resolve o posicionamento, e deslocar de novo empurraria a faísca para fora.

Só a classe DIRECIONAL ganha o campo `direcional`. `anguloBaseGraus` é para onde a arte aponta
DENTRO do arquivo (0° = direita, positivo = para baixo, a convenção do `Math.atan2` do mundo); o
desenho gira por `anguloDeAtaque - base`, então arte que já nasce apontando para a direita usa 0
e não vira nada quando o alvo está à direita. `ancoraX` diz em que fração da largura fica o
ponto de impacto — sem ele um jato comprido atravessa o inimigo com o meio do desenho em cima
do alvo.

`orientacaoDaTira` é pura e testada isolada; `drawQuadroDeTira` só a aplica. O ângulo de ataque
chega apenas em `drawImpactBurst` — anel de AOE e faísca de cura não giram.

### Procedural, embaixo

- **Alvo único**: `drawImpactBurst` — glow radial aditivo (`globalCompositeOperation: 'lighter'`)
  com pop-in rápido e fade, mais 7 partículas em ângulos **fixos derivados do índice**, sem RNG:
  a animação é idêntica em toda a vida do efeito e não consome a sequência de sorteio.
- **AOE**: `drawAoeRing` — círculo expandindo de 0 até `ability.radius` (ease-out), com
  preenchimento fraco por baixo e anel brilhante por cima. `effect.worldSize = ability.radius * 2`
  — o tamanho da sprite **é** o tamanho da área de efeito.
- **Forma por tipo**: `IMPACT_SHAPE_BY_TYPE` mapeia os tipos para 12 famílias de forma (chama,
  gota, folha, fragmento, raio, cristal, estrela, bolha, pedra, pena, espiral, névoa, garra).
  Vários tipos dividem família de propósito — a cor via `colorForType` já diferencia.

Os dois desenhos tentam a arte e **caem no procedural** quando o tipo não tem arte ou quando a
imagem ainda não decodificou — sem essa segunda checagem, o primeiro golpe de uma sessão sairia
sem efeito nenhum. `SOLID_OPACITY = 0.9` vale para os dois caminhos: antes só o procedural
aplicava, e a arte real saía opaca, dois VFX do mesmo jogo com peso visual diferente.

### Golpe de status é GIF, não tira

`data/statusVfx.ts`, em `assets/move-vfx/status/{aumenta,diminui}/<tipo>.gif`. GIF porque a arte
já vem animada: `drawImage` de uma `Image()` apontada para um GIF pega o quadro atual sozinho, e
este loop já redesenha a cada frame. Por tipo + direção e não por golpe — são 180 golpes de
status no dataset, e a direção é do EFEITO, não de quem lança (Growl no oponente é "diminui" do
lado de quem recebe).

### Duas armadilhas do repositório de arte de origem

1. **Conjunto de 8 arquivos numerados `0..7` são as 8 DIREÇÕES de um projétil, não quadros de
   animação.** Tocar um desses em sequência daria um projétil girando no lugar.
2. **Julgar arte fora do fundo real não vale.** Numa folha de contato sobre fundo cinza, duas
   escolhas em verde-escuro e cinza pareciam aceitáveis; no tamanho real sobre o background da
   hunt, **sumiam**. Um efeito invisível é pior que o desenho procedural que ele substitui — o
   procedural pelo menos brilha.

### O que o teste tranca

`src/data/moveVfx.test.ts` cobre os três modos de falha da camada por golpe, nenhum dos quais
lança exceção: caminho de arquivo errado (o desenho cai na tira do tipo, que é uma arte válida e
do elemento certo — ninguém nota), id de golpe que não existe no catálogo (a entrada fica lá e
nunca é encontrada), e arte exportada que ficou fora do cadastro (peso no deploy sem aparecer no
jogo). Um quarto modo — `quadros` diferente do que a tira tem, que faz o desenho mostrar pedaço de
dois quadros ao mesmo tempo — precisa ler os bytes do PNG e por isso vive em
`scripts/conferir-direcao-vfx.mjs`, que **falha com código de saída** se a largura não dividir.

`src/data/vfxTiras.test.ts` cobre o que falha em silêncio: o desenho devolve `false` quando a
imagem não está pronta e quem chama cai no procedural — comportamento certo, mas significa que
**um caminho de arquivo errado não produz erro nenhum**, só o efeito antigo de volta. Confere a
existência de cada tira (via `import.meta.glob`, não `node:fs`: o tsconfig do app não carrega os
tipos de Node), que todo tipo tem entrada, e que `orientacaoDaTira` não gira o que não é
direcional.

**Sobra em disco:** `assets/move-vfx/<tipo>/` (PNG solto por quadro) e `assets/move-vfx-gif/`
(um GIF por tipo) são os dois lotes anteriores de impacto. Os módulos que liam deles foram
removidos na migração para tira; a arte ficou sem consumidor.

## Ícones de skill por TIPO

`assets/ability-icons/<tipo>.png` (17 arquivos). O slot da barra de golpes trocou o rótulo de 3
letras pelo ícone do elemento.

Por tipo e não por golpe porque são **223 golpes** e o repositório de origem não tem
equivalente para cada um: mapear "os que dão" deixaria a maioria dos slots sem ícone e a barra
visualmente incoerente — o oposto do objetivo.

**Tradeoff assumido:** dois golpes do mesmo tipo ficam visualmente iguais no slot. O que os
separa é o dano na faixa de baixo e o tooltip. O rótulo de 3 letras continua no código como
fallback para tipo sem ícone — não é código morto defensivo: `ability.type` vem do catálogo
gerado, e um tipo novo cairia nele.

`mix-blend-mode: screen` apaga o **preto de dentro da própria arte** — os ícones do Crawl não
têm transparência, são ladrilhos 32×32 com fundo preto opaco, então nenhum `object-fit` daria
conta. No modo `screen` o pixel preto deixa passar o fundo do slot, que já é a cor do elemento.

Tamanho: 2.6em, encolhendo por breakpoint (2.35em em `<780`, 2.05em em `<640`). O `em` sozinho
já escalava com a largura; o problema real é que o **número de slots cresce com o nível**, e
uma fileira de 8 slots grandes quebra em várias linhas no celular, inflando o rodapé que o chat
e o Auto medem e ancoram em cima.

## Retrato do POKE

`faceIconUrl` (o retrato PMD 40×40, já quadrado e enquadrado no rosto) com `object-cover` +
`h/w-full`, não `spriteUrl` (o ícone "grande", recorte de fan sheet com proporção e padding
variáveis por espécie, que sobrava faixa vazia com `object-contain`).

Vale no trilho de status (`StatusRail#FacePoke`) e no relatório de farm offline. Conferido: as 226 espécies têm os 3
arquivos de arte no disco — o problema era o recorte, não arquivo faltando.

## Tutoriais

`data/tutoriais.ts` + `stores/tutorialStore.ts`. "Já viu" mora no **localStorage**, não no
`gameStateStore` — aquele estado é propriedade do servidor, então a marca seria apagada no
primeiro flush.

Fechar por **qualquer** caminho conta como visto: marcar só no fim faria reaparecer em todo
boot para quem fechasse no meio.

## Deploy: dois bugs que só aparecem publicado

**1. O `dist/` do Vite não continha a arte.** Em dev, `assets/` é servida por um plugin do
Vite, inexistente no site publicado, que só serve estático. O site subia com o código certo e
**zero sprite**, todo `/assets/*` em 404 — invisível em teste local. Corrigido com
`scripts/copiar-assets.mjs` no fim do `npm run build`.

**2. Faltava `public/_redirects`.** Sem ele, recarregar em `/jogo`, `/login` ou `/registro` dá
404 — o arquivo não existe no disco, quem resolve a rota é o roteador. O sintoma engana, parece
"o servidor caiu".

A regra de `/assets/*` vem **primeiro** e é explícita: uma sprite caindo no `/*  /index.html
200` voltaria como HTML com status 200, que não dá erro visível — só não aparece.

**O CLAUDE.md afirmava que `_redirects` tinha sido criado; `find` provou que não.** É um dos
exemplos do porquê da regra de fonte única deste `docs/`.

### Limites do Cloudflare Pages, medidos

| Limite | Nosso | Teto |
|---|---|---|
| Arquivos | 6.311 | 20.000 |
| Maior arquivo | **20,7 MB** (`assets/hunt-backgrounds/cave.png`) | **25 MiB** |

Folga de 4 MB no maior arquivo. Um background maior quebra o deploy, e **a mensagem do Pages
não dirá "seu PNG é grande demais"**. Vale comprimir os backgrounds antes que morda.

Config no painel: diretório raiz **vazio** (a raiz do repositório), build `npm run build`,
saída `dist`, branch de produção `main`. As três variáveis (`VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY`, `VITE_SERVIDOR_URL`) são de **build** — sem elas o bundle sobe e
quebra no load, porque `lib/supabase.ts` estoura de propósito quando falta config.
