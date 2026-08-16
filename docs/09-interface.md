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

## Breakpoints em JS, não em media query

`useBreakpoints()` lê `viewportWidth`, alimentado por **um** listener de resize compartilhado
por 8 superfícies.

São decisões de **estado**, não só de estilo — em `<640` o card de taxas não encolhe, ele
**some**, e o dado reaparece como chip no bloco central, em outro ponto da árvore.

| Largura | O que muda |
|---|---|
| `<1180` | Chat estreita de 20em para 13em (não encostar no menu central) |
| `<1140` | Bloco central desce para baixo dos cards laterais |
| `<780` | Chat e botão Auto sobem para cima do menu; colunas duplas dos painéis empilham |
| `<640` | Card de taxas vira chip, treinador só avatar, botões laterais só ícone, rótulos do menu somem |

O mesmo listener **limpa as posições de janela arrastadas** (`winPos`): uma janela largada no
canto direito de uma tela larga fica inalcançável quando ela encolhe, e sem barra de título
visível não há como trazê-la de volta.

## A única media query de layout do projeto

```css
@media (max-width: 640px) {
  /* multiplicador manual limitado a min(var(--hud-scale), 1) */
  /* teto do clamp reduzido */
}
```

`--hud-scale` até 1.4 numa tela estreita estourava a HUD (card do POKE cobrindo o treinador,
chat cobrindo o bloco central). O multiplicador manual multiplica um `font-size` que em
`<=640px` já está no piso do `clamp`.

É legítima porque `font-size` é estilo puro, não posicionamento — "breakpoint de layout em JS,
não CSS" continua valendo para o resto.

**Tradeoff assumido:** sobrepõe parcialmente a preferência do jogador. A alternativa — honrar
1.4 com a HUD estourada, ou zerar o slider no mobile — é pior. `HUD_SCALE_MIN` desceu para 0.7
para que quem jogava confortável no tamanho antigo tenha como voltar.

## O rodapé é MEDIDO, não estimado

Chat e botão Auto ancoravam por offset `em` fixo. Foi ajustado à mão **duas vezes** e ainda
estava errado: a altura do rodapé (barra de golpes + menu) muda com **dois** eixos — a largura
(o menu quebra em mais fileiras) **e** o `hudScale`. Nenhuma constante em `em` fecha os dois.

`HudLayer` põe um `ResizeObserver` no wrapper bottom-center e grava a altura em
`uiStore.footerHeight` (guarda anti-loop: só faz `set` se o valor arredondado mudou). Chat e
Auto ancoram em `calc(${footerHeight}px + folga)` quando empilhado (`<780`), com o `em` antigo
só como fallback até a primeira medida.

Acima de 780px o rodapé é uma fileira central estreita longe dos cantos, então o caminho
medido só vale no regime empilhado.

`CampoOverlay` usa o mesmo `footerHeight`: os avisos de revive, BOSS e contagem do Lance eram
`fixed inset-0` e cobriam a barra de golpes e o menu.

### Como medir colisão de HUD

Regra, para repetir: coletar os `getBoundingClientRect` de toda superfície com `z-index` 18-22
(a faixa da HUD), remover as contidas em outra maior (wrappers compartilhados dão
falso-positivo) e cruzar par a par. **Overlap real é o que sobra.**

Screenshot sozinho engana — o wrapper pode sobrepor sem o conteúdo, centralizado, chegar a
colidir.

**Armadilha de ferramenta:** `resize_page` do Chrome DevTools trava em **500px** (mínimo da
janela do Chrome). Todo teste que parava em ~492-500px não testava celular nenhum. Só
`emulate` com device metrics override (`390x844x3,mobile,touch`) chega num aparelho de
verdade. Em 500px o layout quase fecha; abaixo disso quebrava.

**Não mexido, com motivo:** o overlap wrapper do bloco central × coluna lateral. Reservar
espaço à direita faria a linha da carteira transbordar no celular — ela precisa da largura
cheia. Com o conteúdo em `justify-center`, ele não alcança os ícones laterais; o wrapper
sobrepõe, o conteúdo não. O `z-index` do bloco (19) é menor que o da coluna (20), então nem
clique é roubado.

## Janelas

`components/game/GameWindow.tsx` é a moldura de todo painel e modal (menu, perfil, relatório
offline).

Arrastar (posição no `uiStore`, `hooks/useWindowDrag.ts` com eventos `pointer*`, funciona no
toque), redimensionar (`resize: both` do CSS, sem JS), barra de título e rodapé fora da área
rolável.

**Dois detalhes que não são cosméticos:**

- **A largura padrão é escrita uma vez por `ref`, nunca no `style` reativo.** No style, cada
  quadro de arrasto reescreveria `style.width` — a mesma propriedade que `resize: both`
  grava — desfazendo o redimensionamento do jogador.
- **`max-height: min(86vh, 100vh - 12em)`.** O primeiro termo é o teto do design; o segundo
  impede que o rodapé da janela vire área morta atrás do menu inferior.

Larguras por tela: Loja 52em, Bestiário 56em, Calculadora 46em, Correio 40em, padrão 36em.

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

  **`AVISO_SEM_DANO` está desatualizado desde a leva de combate** (ver
  [03](03-motor-de-simulacao.md#continua-fora-de-escopo-decisão-explícita)). Ele aparece em
  TODO golpe de potência 0, presumindo que nenhum tem efeito real aqui — verdade até essa
  leva, falsa depois dela: status, estágio de atributo, clima, escudos, Leech Seed/Curse/
  Taunt/Protect e boa parte da lista de golpes de potência 0 agora TÊM efeito real. O aviso
  precisa passar a distinguir "sem efeito nenhum" de "sem dano, mas com efeito" — não foi
  corrigido nesta rodada, só documentado como pendência.

## VFX de combate

100% canvas, sem asset obrigatório. Nenhum spritesheet real por tipo existe para os 17.

- **Alvo único**: `drawImpactBurst` — glow radial aditivo (`globalCompositeOperation:
  'lighter'`) com pop-in rápido e fade, mais 7 partículas em ângulos **fixos derivados do
  índice**, sem RNG: a animação é idêntica em toda a vida do efeito e não consome a sequência
  de sorteio.
- **AOE**: `drawAoeRing` — círculo expandindo de 0 até `ability.radius` (ease-out), com
  preenchimento fraco por baixo e anel brilhante por cima. `effect.worldSize =
  ability.radius * 2` — o tamanho da sprite **é** o tamanho da área de efeito.
- **Forma por tipo**: `IMPACT_SHAPE_BY_TYPE` mapeia os 17 tipos para 12 famílias de forma
  (chama, gota, folha, fragmento, raio, cristal, estrela, bolha, pedra, pena, espiral, névoa,
  garra). Vários tipos dividem família de propósito — a cor via `colorForType` já diferencia.

**Arte real onde existe:** `data/elementVfx.ts` com PNGs 32×32 do Dungeon Crawl Stone Soup
(`rltiles/effect`, domínio público; procedência em `assets/move-vfx/CREDITOS.txt`), em 8
elementos. `drawImpactBurst` e `drawAoeRing` tentam a arte e **caem no procedural** quando o
tipo não tem arte ou quando o PNG ainda não está decodificado — sem essa segunda checagem, o
primeiro golpe de uma sessão sairia sem efeito nenhum.

`SOLID_OPACITY = 0.9` vale para os dois caminhos. Antes só o procedural aplicava, e a arte real
saía opaca: dois VFX do mesmo jogo com peso visual diferente.

### Duas armadilhas do repositório de arte de origem

1. **Conjunto de 8 arquivos numerados `0..7` são as 8 DIREÇÕES de um projétil, não quadros de
   animação** (`arrow`, `bolt`, `icicle`, `stone_arrow`…). Tocar um desses em sequência daria
   um projétil girando no lugar. Nenhum foi usado.
2. **Julgar arte fora do fundo real não vale.** Numa folha de contato sobre fundo cinza,
   `bog_flash`/`slime_wave` (verde-escuro) e `shatter_wave_white` (cinza) pareciam aceitáveis;
   no tamanho real sobre `assets/hunt-backgrounds/forest.png`, **sumiam**. Um efeito invisível
   é pior que o desenho procedural que ele substitui — o procedural pelo menos brilha.

`VfxDeElemento.escala` existe porque os quadros não têm enquadramento padronizado (nuvens
preenchem os 32×32; `sting` e `sandblast` desenham um símbolo pequeno com margem
transparente). Sem correção, alguns tipos saíam do tamanho de uma moeda.

`src/data/elementVfx.test.ts` tranca o que falha em silêncio: `drawVfxDeElemento` devolve
`false` quando a imagem não está pronta e quem chama cai no procedural — comportamento certo,
mas significa que **um caminho de arquivo errado não produz erro nenhum**, só o efeito antigo
de volta. O teste confere existência dos quadros e ícones (via `import.meta.glob`, não
`node:fs`: o tsconfig do app não carrega os tipos de Node), que todo tipo com arte tem `single`
**e** `aoe`, e que nenhum quadro é reaproveitado entre dois tipos.

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

Vale no `ActivePokeCard` e no relatório de farm offline. Conferido: as 226 espécies têm os 3
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
