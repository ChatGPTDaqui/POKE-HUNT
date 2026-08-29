// Estado da interface: qual janela esta aberta, onde cada janela foi
// arrastada, o que esta expandido, e a preferencia de escala da HUD.
//
// Substitui js/ui/UIManager.js's `currentScreen`. Decisao #5 do plano: sem
// React Router — o jogo nunca teve URL por tela, troca de tela e 100% estado
// local, entao vira so um campo de store em vez de rota.
//
// Hospital nao esta na lista de telas: e uma cena do canvas (mapDef null), nao
// uma janela DOM. O botao dele no menu troca a cena e fecha o que estiver
// aberto.
import { create } from 'zustand'
import type { ChatTab } from '@/stores/toastStore'

// Nomes em portugues porque sao os mesmos rotulos que aparecem no menu — o
// handoff especifica esta uniao literalmente, e ter um `'team'` interno virando
// `'Equipe'` na tela so cria uma traducao a mais pra manter.
export type ScreenName =
  | 'equipe' | 'mochila' | 'loja' | 'hunts' | 'pokedex'
  | 'wiki' | 'config' | 'correio' | 'bestiario' | 'tasks' | 'calc' | 'mercado'
  | 'ranking' | 'tutoriais' | 'especialidades'

// Reexportado do toastStore em vez de redeclarado: as duas listas ja
// divergiram uma vez (a aba "Mundo" mudou de dono e esta copia continuaria
// dizendo 'world'), e o compilador nao acusa duas unioes de string iguais.
export type { ChatTab } from '@/stores/toastStore'

// Cada janela flutuante que pode ser arrastada tem uma chave propria: a posicao
// e por JANELA, nao por tela, senao arrastar a Loja moveria tambem o perfil.
export type WindowKey = 'panel' | 'profile' | 'offline' | 'auto' | 'chat' | 'perfil' | 'tutorial' | 'analyzer'

export type WindowPositions = Partial<Record<WindowKey, { x: number; y: number }>>

// `matchMedia` nao existe no jsdom dos testes nem em SSR. Ausencia = ambiente
// sem dedo, que e o default certo: com `coarse` ligado por engano toda a HUD
// entraria em modo toque numa maquina de mouse.
function pontoGrosso(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(pointer: coarse)').matches
}

const HUD_SCALE_KEY = 'novo-poke-idle:hud-scale'
const VIDRO_KEY = 'novo-poke-idle:vidro-fosco'
const VIDA_CENARIO_KEY = 'novo-poke-idle:vida-no-cenario'
const CHAT_ABA_KEY = 'novo-poke-idle:chat-aba'
const CHAT_ABERTO_KEY = 'novo-poke-idle:chat-aberto'
// 0.7 (era 0.8) porque a fonte base da HUD subiu 3px nesta leva: sem descer o
// minimo, quem jogava confortavel no tamanho antigo perdeu a opcao de voltar.
export const HUD_SCALE_MIN = 0.7
export const HUD_SCALE_MAX = 1.4

// A escala da HUD NAO vive no gameStateStore de proposito. Aquele estado e
// propriedade do servidor de autoridade (ele responde com o objeto inteiro e o
// cliente sobrescreve o local com a resposta) — uma preferencia de video
// gravada la seria apagada no primeiro flush. Aqui e localStorage puro, por
// aparelho, que e o comportamento certo pra uma preferencia de exibicao.
function readHudScale(): number {
  try {
    const raw = localStorage.getItem(HUD_SCALE_KEY)
    const value = raw == null ? NaN : Number(raw)
    if (!Number.isFinite(value)) return 1
    return Math.min(HUD_SCALE_MAX, Math.max(HUD_SCALE_MIN, value))
  } catch {
    // Safari em navegacao privada lanca no acesso ao localStorage. Preferencia
    // de escala nao vale derrubar o jogo.
    return 1
  }
}

// Preferencia de VIDRO. Desligar troca o `backdrop-filter` por superficie
// quase-opaca. O custo do blur NAO foi medido (ver a nota longa no index.css:
// sem throttle o quadro bate no teto de 60fps e a diferenca some; com CPU 4x o
// loop do jogo varia mais entre rodadas do que o efeito). A chave existe porque
// e barata e porque o custo e real em GPU movel fraca — nao porque um numero
// desta maquina provou alguma coisa.
function lerVidroFosco(): boolean {
  try {
    return localStorage.getItem(VIDRO_KEY) === '1'
  } catch {
    // Safari privado lanca no acesso ao localStorage; preferencia de video nao
    // vale derrubar o jogo.
    return false
  }
}

// `!== '0'` e nao `=== '1'`: esta preferencia nasce LIGADA, entao chave ausente
// (jogador novo, ou quem ja jogava antes do PH-96) tem que cair no ligado. O
// unico valor que desliga e o '0' que o proprio ajuste grava.
function lerVidaNoCenario(): boolean {
  try {
    return localStorage.getItem(VIDA_CENARIO_KEY) !== '0'
  } catch {
    return true
  }
}

// Aba do chat e chat recolhido (PH-212). Mesma familia das preferencias acima e
// pelo mesmo motivo: e ajuste de EXIBICAO por aparelho, entao nao pode ir pro
// `gameStateStore` (a autoridade sobrescreve aquele objeto inteiro no flush e
// apagaria a escolha) nem viajar entre celular e desktop do mesmo jogador.
//
// O `winPos.chat` (posicao arrastada da janela) fica de FORA de proposito: ele
// ja e zerado dentro da propria sessao quando a janela muda de tamanho
// estrutural (ver `setViewport` mais abaixo), porque uma posicao guardada de um
// viewport maior joga a janela pra fora da tela. Persistir isso entre sessoes
// reintroduziria exatamente o caso que aquele reset existe pra evitar — o
// jogador abriria o jogo no celular com o chat fora da area visivel, sem nada
// na tela pra clicar e trazer de volta.
//
// O tamanho (o canto arrastavel do `resize` do CSS) tambem fica de fora, e por
// um motivo diferente: ele nao e estado de aplicacao nenhum. E a classe
// `resize` do Tailwind mexendo no elemento direto, e nada em `src/` le a altura
// resultante. Persistir exigiria passar a MEDIR o elemento (ResizeObserver) e
// criar estado que hoje nao existe — mudanca de desenho, nao de persistencia.
const ABAS_DE_CHAT: readonly ChatTab[] = ['mundo', 'sistema', 'trade', 'log']

function lerChatAba(): ChatTab {
  try {
    const bruto = localStorage.getItem(CHAT_ABA_KEY)
    // Valida contra a uniao em vez de confiar na string: a chave e editavel
    // pelo jogador no DevTools, e uma aba inexistente deixaria o painel
    // renderizando vazio, sem nenhuma aba marcada como ativa.
    return ABAS_DE_CHAT.includes(bruto as ChatTab) ? (bruto as ChatTab) : 'mundo'
  } catch {
    // Safari em navegacao privada lanca no acesso ao localStorage; preferencia
    // perdida e aceitavel, crash nao.
    return 'mundo'
  }
}

// `!== '0'` e nao `=== '1'`, mesma razao de `lerVidaNoCenario`: o chat nasce
// ABERTO, entao chave ausente (jogador novo, ou quem ja jogava antes disto)
// tem que cair no aberto. So o '0' que o proprio toggle grava recolhe.
function lerChatAberto(): boolean {
  try {
    return localStorage.getItem(CHAT_ABERTO_KEY) !== '0'
  } catch {
    return true
  }
}

interface UiState {
  currentScreen: ScreenName | null
  openScreen: (screen: ScreenName) => void
  toggleScreen: (screen: ScreenName) => void
  closeScreen: () => void

  moreOpen: boolean
  setMoreOpen: (open: boolean) => void

  autoOpen: boolean
  setAutoOpen: (open: boolean) => void

  // Perfil do Treinador: modal proprio, aberto pela foto no card do topo. Nao
  // e uma `ScreenName` porque nao vive no menu — nao ha botao pra ele, e ele
  // pode ficar aberto por cima de qualquer tela.
  perfilOpen: boolean
  setPerfilOpen: (open: boolean) => void

  // Perfil de OUTRO jogador (PH-119). Estado separado de `perfilOpen`, e nao um
  // `perfilAlvo` que `null` significa "eu": as duas telas mostram coisas
  // diferentes e a do proprio jogador tem acoes (sair da conta, reiniciar) que
  // nao existem na de terceiro. Confundir as duas num booleano so seria a
  // primeira porta pra uma acao dessas aparecer no perfil de outro.
  //
  // Guarda o par (id, nome) e nao so o id: o nome ja veio no anuncio, e mostrar
  // o titulo antes de a RPC responder evita a janela abrir vazia.
  perfilPublicoAlvo: { userId: string; nome: string } | null
  abrirPerfilPublico: (alvo: { userId: string; nome: string }) => void
  fecharPerfilPublico: () => void

  // Conversa que o Correio deve abrir ASSIM QUE montar (PH-119).
  //
  // O Correio guarda o contato aberto em estado local, entao quem esta fora
  // dele nao tem como dizer "abra ja falando com fulano" — que e exatamente o
  // caminho que a issue pede (do anuncio pro perfil, do perfil pra conversa).
  // Consumido UMA vez e limpo pelo proprio Correio: sem isso, fechar o fio e
  // reabrir o Correio reabriria o mesmo contato pra sempre.
  correioContatoInicial: { userId: string; nick: string } | null
  abrirCorreioCom: (contato: { userId: string; nick: string }) => void
  consumirCorreioContatoInicial: () => void

  // Hunt Analyzer: aberto pelo card/chip de taxas do HUD. Mesma razao do perfil
  // pra nao ser uma `ScreenName` — nao vive no menu e abre por cima de qualquer
  // tela.
  analyzerOpen: boolean
  setAnalyzerOpen: (open: boolean) => void

  chatTab: ChatTab
  chatOpen: boolean
  setChatTab: (tab: ChatTab) => void
  setChatOpen: (open: boolean) => void

  // Altura em px do rodape (barra de golpes + menu), medida ao vivo por um
  // ResizeObserver no HudLayer. O chat e o botao Auto ancoram ACIMA dela em vez
  // de um offset `em` chutado: o rodape muda de altura com a largura (o menu
  // quebra em mais fileiras) E com o `hudScale`, entao qualquer constante em
  // `em` erra em algum dos casos — foi ajustada a mao duas vezes e ainda colidia
  // em 390px. Medir e a unica forma que fecha os tres eixos de uma vez.
  footerHeight: number
  setFooterHeight: (height: number) => void

  // Altura so da BARRA DE NAVEGACAO (os cinco slots), medida a parte do rodape
  // inteiro. Deitado, um sheet que para acima do rodape todo perde tambem a
  // faixa dos golpes: sobravam 109px de conteudo numa tela de 390px. Com um
  // painel aberto o jogador nao esta olhando os golpes — o que ele nao pode
  // perder e o caminho de navegacao, e so ele.
  navHeight: number
  setNavHeight: (height: number) => void

  // Largura E ALTURA do viewport em px. Vivem na store (e nao num `useState`
  // por componente) porque varias superficies decidem posicao a partir delas:
  // um listener de resize compartilhado em vez de um por superficie.
  //
  // A altura entrou porque so a largura nao descreve um celular: deitado ele
  // mede 844x390 e caia no regime DESKTOP com 390px de altura util — cards do
  // topo e rodape se sobrepondo, sem nenhum breakpoint acusando.
  viewportWidth: number
  viewportHeight: number

  // `(pointer: coarse)` = dedo, nao mouse. Separado da largura de proposito:
  // uma janela de navegador estreita num desktop NAO e um celular (hover
  // funciona, alvo de 32px e clicavel) e um tablet largo NAO e um desktop.
  coarsePointer: boolean

  // Altura em px que o TECLADO virtual esta ocupando agora (0 quando fechado).
  //
  // Existe porque o layout do jogo nao rola: a raiz e `h-svh overflow-hidden` e
  // tudo dentro dela e absoluto. Quando o teclado abre, o `svh` NAO encolhe —
  // ele e a altura da janela com as barras do navegador retraidas, um valor
  // fixo. Resultado: a doca, o ticker e o campo de digitacao do chat ficam
  // ATRAS do teclado, e o jogador digita sem ver o que escreve.
  //
  // Medido como `innerHeight - visualViewport.height`, com um piso de 120px pra
  // nao confundir com a barra de URL (que mede ~60px) nem com a mudanca de
  // escala de um pinch — os dois tambem encolhem o visualViewport.
  tecladoPx: number

  winPos: WindowPositions
  setWinPos: (key: WindowKey, pos: { x: number; y: number }) => void
  // Chamado no resize do viewport: uma janela arrastada pro canto direito de
  // uma tela larga fica FORA da tela quando ela encolhe, e sem barra de titulo
  // visivel nao ha como trazer de volta.
  handleViewportResize: (width: number, height: number, coarse: boolean, teclado: number) => void

  hudScale: number
  setHudScale: (scale: number) => void

  /** Desliga o `backdrop-filter` de toda superficie de vidro. */
  vidroFosco: boolean
  setVidroFosco: (fosco: boolean) => void

  /**
   * Vida ambiente do cenario (PH-96): folha, brilho, brasa, poeira, neve.
   *
   * Nasce LIGADA, ao contrario de `vidroFosco` — que e um ajuste de socorro pra
   * aparelho fraco e por isso comeca desligado. Esta e a aparencia pretendida
   * do jogo; o interruptor existe pra quem precisa cortar trabalho de desenho,
   * nao pra quem precisa ligar o efeito.
   */
  vidaNoCenario: boolean
  setVidaNoCenario: (ligada: boolean) => void

  // Filtros da tela de Hunts. Ficam aqui (e nao em useState local do
  // HuntMenu) por um motivo unico e concreto: a Pokedex precisa escrever
  // neles ANTES de abrir a tela de Hunts (o "onde encontrar" -> pula pra
  // hunt ja filtrada), exatamente o que o `focusHunt(map)` module-level de
  // js/ui/panels/HuntMenu.js fazia. Estado que dois paineis escrevem nao
  // pode viver dentro de um deles.
  huntContinent: string
  huntSearchTerm: string
  huntType: string
  setHuntContinent: (continent: string) => void
  setHuntSearchTerm: (term: string) => void
  setHuntType: (type: string) => void
}

export const useUiStore = create<UiState>((set, get) => ({
  currentScreen: null,
  // Abrir uma janela zera a posicao arrastada dela: a proxima abertura nasce
  // centralizada, em vez de reaparecer onde uma tela anterior foi largada.
  // Abrir uma tela FECHA o Hunt Analyzer. As duas janelas usam o mesmo z-index
  // (31) e o mesmo backdrop, entao deixar as duas abertas empilha uma sobre a
  // outra e o botao "Fechar" mais proximo do topo do DOM fecha a errada —
  // reproduzido ao vivo: com o Analyzer aberto, clicar em "Mercado" abria o
  // Mercado por baixo dele.
  openScreen: (currentScreen) =>
    set((s) => ({ currentScreen, moreOpen: false, analyzerOpen: false, winPos: { ...s.winPos, panel: undefined } })),
  toggleScreen: (screen) => {
    if (get().currentScreen === screen) set({ currentScreen: null, moreOpen: false })
    else get().openScreen(screen)
  },
  closeScreen: () => set({ currentScreen: null }),

  moreOpen: false,
  setMoreOpen: (moreOpen) => set({ moreOpen }),

  autoOpen: false,
  setAutoOpen: (autoOpen) => set({ autoOpen }),

  perfilOpen: false,
  // Abrir zera a posicao arrastada, mesma regra de `openScreen`.
  setPerfilOpen: (perfilOpen) =>
    set((s) => ({ perfilOpen, winPos: perfilOpen ? { ...s.winPos, perfil: undefined } : s.winPos })),

  perfilPublicoAlvo: null,
  // Fecha o perfil PROPRIO ao abrir o de terceiro: os dois usam a mesma chave de
  // janela (`perfil`) pra posicao arrastada, entao deixar os dois abertos poria
  // um exatamente em cima do outro.
  abrirPerfilPublico: (alvo) =>
    set((s) => ({ perfilPublicoAlvo: alvo, perfilOpen: false, winPos: { ...s.winPos, perfil: undefined } })),
  fecharPerfilPublico: () => set({ perfilPublicoAlvo: null }),

  correioContatoInicial: null,
  abrirCorreioCom: (contato) =>
    set((s) => ({
      correioContatoInicial: contato,
      currentScreen: 'correio',
      // Some com o perfil de terceiro: ele foi o caminho ate aqui, e deixa-lo
      // aberto atras do Correio empilharia duas janelas sobre a mesma conversa.
      perfilPublicoAlvo: null,
      moreOpen: false,
      winPos: { ...s.winPos, panel: undefined },
    })),
  consumirCorreioContatoInicial: () => set({ correioContatoInicial: null }),

  analyzerOpen: false,
  setAnalyzerOpen: (analyzerOpen) =>
    set((s) => ({
      analyzerOpen,
      // Simetrico do `openScreen`: so uma janela de painel por vez.
      currentScreen: analyzerOpen ? null : s.currentScreen,
      winPos: analyzerOpen ? { ...s.winPos, analyzer: undefined } : s.winPos,
    })),

  chatTab: lerChatAba(),
  chatOpen: lerChatAberto(),
  setChatTab: (chatTab) => {
    try {
      localStorage.setItem(CHAT_ABA_KEY, chatTab)
    } catch {
      // idem `readHudScale`: preferencia perdida e aceitavel, crash nao.
    }
    set({ chatTab })
  },
  setChatOpen: (chatOpen) => {
    try {
      localStorage.setItem(CHAT_ABERTO_KEY, chatOpen ? '1' : '0')
    } catch {
      // idem.
    }
    set({ chatOpen })
  },

  footerHeight: 0,
  setFooterHeight: (height) => {
    const r = Math.round(height)
    if (get().footerHeight !== r) set({ footerHeight: r })
  },

  navHeight: 0,
  setNavHeight: (height) => {
    const r = Math.round(height)
    if (get().navHeight !== r) set({ navHeight: r })
  },

  viewportWidth: typeof window === 'undefined' ? 1280 : window.innerWidth,
  viewportHeight: typeof window === 'undefined' ? 800 : window.innerHeight,
  coarsePointer: pontoGrosso(),
  tecladoPx: 0,

  winPos: {},
  setWinPos: (key, pos) => set((s) => ({ winPos: { ...s.winPos, [key]: pos } })),
  // Chamado por resize, orientationchange E visualViewport. Este ultimo dispara
  // a cada pixel que a barra de URL do celular sobe ou desce, entao duas
  // protecoes sao obrigatorias aqui, nao no chamador:
  //
  //  - sair sem `set` quando nada mudou, senao a barra de URL re-renderiza a
  //    HUD inteira a cada frame de rolagem;
  //  - zerar `winPos` so numa mudanca ESTRUTURAL (largura, ou altura > 120px).
  //    A barra de URL muda a altura em ~60px o tempo todo; com o `winPos: {}`
  //    incondicional, uma janela que o jogador arrastou voltava sozinha pro
  //    centro quando ele rolava a lista dentro dela.
  handleViewportResize: (viewportWidth, viewportHeight, coarsePointer, tecladoPx) => {
    const s = get()
    if (
      s.viewportWidth === viewportWidth
      && s.viewportHeight === viewportHeight
      && s.coarsePointer === coarsePointer
      && s.tecladoPx === tecladoPx
    ) return
    const estrutural = s.viewportWidth !== viewportWidth
      || Math.abs(s.viewportHeight - viewportHeight) > 120
    set({
      viewportWidth,
      viewportHeight,
      coarsePointer,
      tecladoPx,
      // Abrir o teclado NAO e mudanca estrutural: ele encolhe a altura em
      // ~300px e, sem esta excecao, jogaria toda janela arrastada de volta pro
      // centro no meio de uma digitacao.
      ...(estrutural && tecladoPx === s.tecladoPx ? { winPos: {} } : null),
    })
  },

  hudScale: readHudScale(),
  setHudScale: (raw) => {
    const hudScale = Math.min(HUD_SCALE_MAX, Math.max(HUD_SCALE_MIN, raw))
    try {
      localStorage.setItem(HUD_SCALE_KEY, String(hudScale))
    } catch {
      // idem readHudScale: preferencia perdida e aceitavel, crash nao.
    }
    set({ hudScale })
  },

  vidroFosco: lerVidroFosco(),
  setVidroFosco: (vidroFosco) => {
    try {
      localStorage.setItem(VIDRO_KEY, vidroFosco ? '1' : '0')
    } catch {
      // idem: preferencia perdida e aceitavel, crash nao.
    }
    set({ vidroFosco })
  },

  vidaNoCenario: lerVidaNoCenario(),
  setVidaNoCenario: (vidaNoCenario) => {
    try {
      localStorage.setItem(VIDA_CENARIO_KEY, vidaNoCenario ? '1' : '0')
    } catch {
      // idem.
    }
    set({ vidaNoCenario })
  },

  huntContinent: 'faixa1',
  huntSearchTerm: '',
  huntType: 'all',
  setHuntContinent: (huntContinent) => set({ huntContinent }),
  setHuntSearchTerm: (huntSearchTerm) => set({ huntSearchTerm }),
  setHuntType: (huntType) => set({ huntType }),
}))

// --- breakpoints -------------------------------------------------------------
// Por LARGURA DO VIEWPORT em JS, nao media query: as decisoes nao sao so de
// estilo (o bloco central muda de ancora, o chat e o botao Auto sobem pra cima
// do menu, colunas duplas empilham) e varias delas alimentam estado — uma media
// query nao consegue, por exemplo, esconder o card de taxas E mostrar o mesmo
// dado como chip em outro lugar da arvore.
export const BP_NARROW = 640   // mobile: taxas viram chip, rotulos do menu somem
export const BP_STACK = 780    // chat/Auto sobem; colunas duplas empilham
export const BP_MID = 1140     // bloco central desce pra baixo dos cards laterais
export const BP_CHAT = 1180    // chat estreita pra nao encostar no menu central

export interface Breakpoints {
  width: number
  narrow: boolean
  colStack: boolean
  mid: boolean
  chatNarrow: boolean
}

export function useBreakpoints(): Breakpoints {
  const width = useUiStore((s) => s.viewportWidth)
  return {
    width,
    narrow: width < BP_NARROW,
    colStack: width < BP_STACK,
    mid: width < BP_MID,
    chatNarrow: width < BP_CHAT,
  }
}

// --- modo de dispositivo (v8, HUD mobile-first) ------------------------------
// Substitui progressivamente os breakpoints acima. A diferenca nao e de valor,
// e de EIXO: `useBreakpoints` decide tudo por largura, e por isso nao enxerga
// celular deitado (844x390 le como desktop) nem tablet com dedo.
//
// Tres regimes, e cada um e um LAYOUT diferente — nao o mesmo layout encolhido:
//
//   'compacto'   celular em pe:     trilho no topo, doca no rodape, sheets
//   'deitado'    celular deitado:   trilho fino no topo, doca em coluna lateral
//   'amplo'      desktop/tablet:    trilho espalhado, doca centrada, janelas
//
// O piso de 820px (e nao 640) e proposital: entre 640 e 820 a HUD antiga ja
// vivia colidindo — 640 era o ponto em que ela QUEBRAVA, nao o ponto em que
// ainda cabia.
export const BP_COMPACTO = 820  // abaixo disso, layout de celular em pe
export const BP_BAIXO = 520     // abaixo disso, altura de celular deitado

export type DeviceMode = 'compacto' | 'deitado' | 'amplo'

export interface DeviceInfo {
  mode: DeviceMode
  width: number
  height: number
  /** Dedo em vez de mouse: sem hover, sem `title`, alvo minimo de 44px. */
  coarse: boolean
  /** Atalho: qualquer regime de celular. */
  compacto: boolean
  /**
   * Painel abre como bottom sheet, e nao como janela arrastavel.
   *
   * Vale pros dois regimes de celular E pra qualquer aparelho de DEDO, por
   * largo que seja: um tablet de 834px cai em 'amplo' pelo layout (ha espaco
   * pro trilho espalhado e pra doca com mais destinos), mas continuar
   * entregando janela arrastavel com canto de redimensionar de 16px la e
   * entregar um controle que o dedo nao alcanca.
   */
  usaSheet: boolean
}

/**
 * Regime de layout do aparelho.
 *
 * A altura entra ANTES da largura na decisao porque tela baixa e o caso que
 * mais quebra: um layout empilhado precisa de altura, nao de largura, e e
 * exatamente isso que o celular deitado nao tem.
 */
export function useDeviceMode(): DeviceInfo {
  const width = useUiStore((s) => s.viewportWidth)
  const height = useUiStore((s) => s.viewportHeight)
  const coarse = useUiStore((s) => s.coarsePointer)
  return deviceModeDe(width, height, coarse)
}

/** Forma pura, pra teste e pra uso fora de componente. */
export function deviceModeDe(width: number, height: number, coarse: boolean): DeviceInfo {
  // Tela baixa E larga = deitado. O `coarse || width < 1024` evita classificar
  // como celular uma janela de desktop que o usuario apenas achatou: ali o
  // hover funciona e a densidade do layout amplo continua utilizavel.
  const deitado = height < BP_BAIXO && width > height && (coarse || width < 1024)
  const mode: DeviceMode = deitado ? 'deitado' : width < BP_COMPACTO ? 'compacto' : 'amplo'
  return {
    mode,
    width,
    height,
    coarse,
    compacto: mode !== 'amplo',
    usaSheet: mode !== 'amplo' || coarse,
  }
}
