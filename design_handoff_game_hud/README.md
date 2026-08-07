# Handoff: Nova HUD — NOVO POKE IDLE

## Visão geral
Redesign completo da UI do jogo (HUD + todos os painéis/modais), tema dark "black" neutro, com **layout 100% fluido**: toda a interface escala com o viewport e as janelas são arrastáveis/redimensionáveis. O menu inferior circular é o elemento fixo e principal; chat, botão Auto e demais superfícies se ajustam em volta dele.

## Sobre os arquivos de design
Os arquivos deste pacote são **referências de design feitas em HTML** (protótipo navegável), não código de produção. A tarefa é **recriar estas telas no codebase existente** (React + TypeScript + Vite + Tailwind v4 + shadcn/ui + Zustand), usando os padrões já estabelecidos do projeto (ScreenOverlay, uiStore, TYPE_COLORS etc.). Não copiar o HTML diretamente.

- `Game HUD.dc.html` — o protótipo (markup + lógica de referência). No projeto original abre com preview ao vivo; aqui serve para inspecionar estrutura, medidas e comportamento.

## Fidelidade
**Hi-fi.** Cores, tipografia, espaçamentos e estados são finais. Recriar pixel-perfect usando Tailwind/shadcn. Exceção: sprites de POKEs/treinador são placeholders (usar os GIFs reais `assets/gen5ani/` do jogo) e o painel Mercado é um stub.

## Fundamento do layout fluido (o mais importante)
1. O contêiner raiz da HUD define:
   `font-size: calc(clamp(13px, 0.55vw + 9px, 19.5px) * hudScale)` — `hudScale` é uma preferência do jogador (0.8–1.4, default 1).
2. **Tudo na HUD usa `em`** (tamanhos, paddings, offsets). Resultado: a UI inteira escala proporcionalmente com a largura da tela. Em Tailwind v4: usar valores arbitrários em `em` ou propagar via CSS vars.
3. Breakpoints por **largura do viewport** (JS, não media query, pois há estado):
   - `w < 1180`: chat estreita de 20em → 13em (para não encostar no menu central).
   - `w < 1140` (mid): bloco central do topo (moedas/hunt/missão) desce para baixo dos cards laterais (`top: 7.7em`, esticado `left/right: .8em`); zoom desce junto (`top: 13.2em`).
   - `w < 780`: chat e botão Auto sobem para cima do menu inferior (`bottom: 10.6em`); colunas duplas dos painéis (Loja, Bestiário, Calculadora, Correio) empilham em 1 coluna.
   - `w < 640` (mobile): card de taxas some (vira chip no bloco central), card do treinador mostra só o avatar, botões laterais só ícone, rótulos do menu inferior somem, zoom `top: 17em`.
4. **Ao redimensionar a janela, posições customizadas (janelas arrastadas) são resetadas** para os defaults — evita janela fora da tela.

## Camadas (z-index)
```
0   canvas do jogo
18–22  HUD (topo, zoom, chat, menu inferior, Auto)
30/31  backdrop escuro (50%) + painel de menu
40  painel Auto flutuante (NÃO passa pelo backdrop)
45/46  modal de perfil
50/51  relatório offline
60  dialog de confirmação
70  toasts
```
Camada HUD = `absolute inset-0 pointer-events-none`; cada filho reativa `pointer-events:auto` (clique na Enfermeira do canvas continua passando).

## Telas / superfícies

### HUD permanente
- **Card do POKE ativo** (topo-esq, fixo): sprite 5em com borda 2px na cor da raridade, badge de raridade contornado, nome, `Lv · XP %`, barra HP (0.45em, verde `#10b981`, vermelha `#ef4444` <30%), barra EXP (0.3em, `#38bdf8`), `HP atual/max`. Clique → modal de perfil.
- **Card de taxas** (ao lado): Gold/h (âmbar), XP/h, Mobs/h, Shinys (roxo) + botão Resetar (ghost, 1.8em). Some em `w<640`.
- **Bloco central**: pílula de moedas (🪙 ouro âmbar `#fbbf24` + 💎 `#4fc3f7`), nome da hunt, "Pokes capturados 11/20" (accent); chip de missão com barra de progresso; (mobile) chip de taxas.
- **Card do treinador** (topo-dir): nome, `Lv`, barra XP âmbar, avatar 4.2em.
- **Coluna lateral direita**: botões Correio, Bestiário, Tasks, Calculadora (ícone Phosphor + rótulo; só ícone em mobile).
- **Zoom** (pílula −/+, 50–250%, passo 10, default 150%): sob o card do POKE.
- **Barra de golpes** (acima do menu): slots 3.4em, fundo na **cor do tipo**, borda .28em na **cor da categoria** (físico `#9aa0a6` / especial `#60a5fa`), sigla 3 letras branca com sombra, anel branco = pronto, bolinha verde = AOE, overlay preto 65% + segundos = cooldown, overlay 75% "OFF" = desligado, faixa inferior com o power. **Duplo clique liga/desliga o golpe.**
- **Menu inferior (FIXO, sempre centralizado)**: círculos 3.1em — Equipe, Mochila, Pokedex, **Hunt (Mapa) 3.9em no centro**, Loja, Hospital (só em hunt; volta ao Hospital), Mercado. Rótulos **bold 700, .82em, capitalizados**, sombra para legibilidade. Botão ativo = círculo preenchido claro (`--color-text`) com ícone escuro. "Mais" (tracejado) fica fora da fileira, à direita → popover com Wiki, Config, Relatório offline. **Sem contêiner retangular em volta.**
- **Botão Auto** (pílula, canto inf-dir) + badge com as bolas ativas do bot.
- **Chat retrátil** (canto inf-esq): abas Mundo/Comércio/Log, botão −/+ colapsa, corpo rolável com cores por tipo de mensagem (ouro `#fbbf24`, level-up `#7dd3fc`, sucesso `#34d399`, falha `#fb923c`, shiny `#b366ff`). Aberto: 19em de altura.
- **Toasts**: pilha central sob o topo, borda/texto na cor do tipo, somem em 2,5s, `pointer-events:none`.

### Janelas (todas arrastáveis pela barra de título e redimensionáveis pelo canto)
Contêiner: fundo `--color-bg`, borda `--color-neutral-700`, raio 12px, `shadow-lg`, `max-height: 86vh`, `max-width: calc(100vw - 1.5em)`, `resize: both; overflow: hidden`; corpo `flex:1; min-height:0; overflow:auto`. Backdrop preto 50% fecha ao clicar. Botão da tela clicado de novo fecha (toggle). **Sem blur atrás dos menus.**

Larguras default: painel padrão 36em · Loja 52em · Bestiário 56em · Calculadora 46em · Correio 40em · Perfil 30em · Offline 26em · Auto 19em.

- **Equipe (n/6)**: card por POKE (swatch com borda de raridade, badge, nome, Lv, "Em campo", botão Evoluir âmbar com custo no label, HP/EXP, barra HP) + ações "Colocar em campo"/"Retirar da equipe". Card inteiro clicável → perfil.
- **Mochila**: abas Pokemons/Itens; busca, ordenar (Raridade/IV/Nivel), "Somente Shiny ✨"; cadeado 🔓/🔒 por item/POKE; "Mover p/ equipe"; itens com "Usar" contextual; Stones com borda 3px na cor do tipo.
- **Loja**: abas Itens/Pokemons; saldo no topo. Itens = 2 colunas COMPRAR / VENDER ITENS (empilham `w<780`), qty + botão com custo real no label. Pokemons = venda em lote: busca, IV min/max, checkboxes de raridade, Selecionar tudo, "Vender Selecionados (n)", Vender Tudo; **shiny exige confirmação; trancado nunca entra em lote**; toasts informam poupados.
- **Hunts**: abas de continente; busca + filtro de elemento; card com círculo do tipo dominante, `(Lv min-max)`, custo/gate, botão Entrar/Desbloquear/Bloqueado; expandir mostra espécies + % de spawn (lista única — o tooltip `?` duplicado foi removido).
- **Pokedex**: busca + toggle Abates Totais/Shiny; card expande **sem abrir o perfil**; detalhe com status base 3 colunas + botão "Ver perfil completo" (correção do clique duplo).
- **Bestiário** (novo): header com % círculo, "15/251 completos", tokens, Runas, Rastreador; busca + filtros + Shiny; grade de cards (sprite, nome, contagem, ✓ dourado = completo, borda accent = selecionado); painel de detalhe com abates/capturas/bolas, "faltam N para o Estágio X" e estágios com progresso + tokens (ATUAL/BLOQUEADO).
- **Tasks** (novo): lista de missões com ícone, descrição, barra de progresso, recompensa; "Resgatar" quando 100% → vira tag "Resgatado".
- **Correio** (novo): coluna AMIGOS (status online/offline) + coluna RESGATAR ITENS (recompensas com botão Resgatar); conversas = fase futura.
- **Calculadora de Força** (novo): lado A (busca, sprite, Nível/Raridade/Potencial/Bônus de runa, checkbox Shiny ×N) → ATK/DEF/HP efetivos em 3 caixas; lado B vazio para comparação opcional.
- **Wiki**: 4 abas (Primeiros Passos, Efetividade, Raridades, Mecanicas) em cartões.
- **Config**: Geral (Iniciar novo jogo → AlertDialog destrutivo) + Patch-notes.
- **Perfil do POKE** (única experiência de "clicar num POKE", em qualquer lugar): cabeçalho fixo (sprite 7em com borda de raridade — não remontar ao trocar de aba, para o GIF não reiniciar), nome/badges/chips de tipo, barras HP/EXP; abas **Status** (5 atributos, chips de IV — 31 em verde, fraquezas/resistências com chips de tipo) e **Golpes** (tabela Nv/Golpe/Tipo/Cat./Dano/AOE com o learnset completo; não aprendidos a 45% de opacidade).
- **Relatório offline** ("Bem-vindo de volta!"): tempo fora, ganhos (só linhas > 0), grade de capturas, saldo estimado em verde/vermelho, Fechar.
- **Confirmação**: dialog título/mensagem/Cancelar/ação destrutiva vermelha (vender shiny, apagar save).

## Interações & comportamento
- Arrastar: `pointerdown` na barra de título (ignorar cliques em button/input/select/a) → guarda offset; `pointermove` move com clamp na viewport; `pointerup` solta. Funciona com toque (`touch-action:none` na barra).
- Redimensionar: CSS `resize: both` no contêiner (overflow hidden) — nativo, sem JS.
- Hover: elevação/borda accent nos círculos do menu (`translateY(-3px)`); `:focus-visible` com anel de 2px.
- Botões que fazem round-trip ao servidor (Entrar, Comprar, Vender, Evoluir) devem ganhar estado loading/disabled — **pendência do código atual, incorporar**.
- Label sempre mostra o custo/valor real: `Comprar (250 ouro)`, `Vender (1200 ouro)`, `Evoluir (20x Pedra ROCK)` — e os toasts devem reportar o resultado REAL da ação (corrigir os `res` fixos de `ShopMenu.tsx`).

## Gestão de estado (mapear no Zustand)
- `uiStore.currentScreen: null | 'equipe' | 'mochila' | 'loja' | 'hunts' | 'pokedex' | 'wiki' | 'config' | 'correio' | 'bestiario' | 'tasks' | 'calc' | 'mercado'` (toggle).
- `profile: Poke | null` + `profileTab: 'status' | 'moves'` (trocar de POKE volta p/ status).
- `chatTab`, `chatOpen`; `autoOpen`; `moreOpen`; `confirm: {title,msg,ok,fn} | null`; `offlineReport`.
- `winPos: Record<'panel'|'profile'|'offline'|'auto'|'chat', {x,y} | null>` — limpo no resize do viewport.
- `auto: {pot, catch, shiny, revive}` (default todos ligados); `locks` (cadeados); seleção em lote da Loja.
- `hudScale` persistido como preferência do jogador.

## Design tokens
Cores do chrome (tema black):
```
--color-bg        #0a0a0c   (fundo de janelas)
--color-text      #f2f2f3
neutral-900 #141519  (cards)      neutral-800 #232428  (bordas/hover)
neutral-700 #303136  (borda janela)  neutral-600 #4a4b52
neutral-500 #717580  (texto muted)   neutral-400 #9b9ea8
neutral-300 #c9cbd1  neutral-200 #e4e5e9  neutral-100 #f4f4f6
accent (estado ativo) = pílula clara #e6e7ea/#f2f2f3 com conteúdo #0b0b0d
```
Semânticas (dados do jogo — **não inventar novas**):
```
ouro #fbbf24 · diamante #4fc3f7 · HP #10b981 (→ #ef4444 <30%) · EXP #38bdf8
shiny #b366ff · sucesso #34d399 · alerta #fb923c · erro/destrutivo #ef4444
Raridades: COMUM #9aa0a6 · INCOMUM #4ade80 · RARO #60a5fa · ULTRA #a78bfa · LEGENDARY #d4a017 · MYTHIC #e0348c
17 tipos elementais: manter TYPE_COLORS existente (NORMAL #a8a878, FIRE #ff6b35, WATER #4fc3f7, ELECTRIC #ffd23f, GRASS #4caf50, ICE #7dd3fc, FIGHTING #c0392b, POISON #9b59b6, GROUND #c9a66b, FLYING #a8d8ea, PSYCHIC #ff6b9d, BUG #8bc34a, ROCK #8d6e63, GHOST #6c5b7b, DRAGON #5b6ee1, DARK #4a4a4a, STEEL #b0bec5)
Categoria de golpe: físico #9aa0a6 · especial #60a5fa
```
Tipografia: **Geist** (400/500/600/700) — heading e body; peso 500 para títulos, 700 só nos rótulos do menu inferior; monospace segue exclusivo do canvas. Escala: base 1em fluido; muted .75–.85em; títulos de painel 1em/500.
Superfícies translúcidas da HUD: `color-mix(in srgb, var(--color-bg) 80–92%, transparent)` + `backdrop-filter: blur(6px)` (blur só nas superfícies da HUD, **nunca** backdrop de menu).
Raios: janelas 12px · cards .6–.7em · pílulas 999px. Sombras: usar escala sm/md/lg única do tema.

## Assets
- Ícones: **Phosphor** (`@phosphor-icons/web` ou `@phosphor-icons/react`): envelope, book-bookmark, check-square, calculator, users-three, backpack, book-open, map-trifold, storefront, first-aid, scales, dots-three, robot, coin (fill), diamond (fill), target, gift, x, lock/lock-open, question, minus/plus.
- Fonte: Geist (Google Fonts ou pacote `geist`).
- Sprites: placeholders no protótipo → usar os GIFs reais do jogo.

## Correções da auditoria (seção 9 do inventário) já refletidas no design
1. Botão Auto com posição explícita (inf-dir). 2. Loja mais larga (52em). 3. Faixa segura no rodapé (golpes acima do menu, canvas anichado). 6. Diamantes mantidos no HUD (dar uso ou ocultar — decisão de produto). 7. Lista de espécies única por hunt. 8. Pokedex: expandir ≠ abrir perfil. 9. Tema com identidade própria (black + pílulas claras). 10. Hierarquia tipográfica maior e fluida. 11. Adicionar loading/disabled nos botões de servidor. 12. Responsividade real (breakpoints acima).

## Arquivos
- `Game HUD.dc.html` — protótipo navegável completo (HUD, todos os painéis, modais, drag/resize, breakpoints). A lógica de referência (estado, handlers, valores) está na classe no fim do arquivo.
