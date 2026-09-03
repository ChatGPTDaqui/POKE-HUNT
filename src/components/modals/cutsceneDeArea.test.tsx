// @vitest-environment jsdom
//
// PH-471 — a cutscene de area, nos dois momentos em que ela roda. Mais o que a
// PH-482 (faixa do campo), a PH-483 (revelacao unica) e a PH-484 (teto de 15s)
// acrescentaram.
//
// O QUE CADA CASO AQUI IMPEDE, e todos falham em silencio:
//
//   - a cutscene DEPENDER DA ARTE pra sair. Arte que nunca chega (404, rede
//     ruim, `assets/` nao servido) prenderia o jogador numa tela de
//     carregamento que nao carrega nada — e ela engole o clique de proposito,
//     entao nao haveria saida. Desde a PH-483 a arte segura o LETREIRO, e nada
//     mais; a saida continua sendo o carregamento da hunt, com o teto por baixo.
//   - a cutscene VOLTAR A SER TELA CHEIA. O sintoma (nao dar pra abrir a mochila
//     durante o carregamento) nao quebra nada sozinho.
//   - o teto da cutscene DIVERGIR do teto do preload. Ver
//     `data/tetoDeCarregamento.ts`.
//   - a cutscene FICAR PRESA quando a entrada e recusada. `enterMap` recusa por
//     quatro caminhos (slot vazio, POKE caido, servidor negando, rede caindo), e
//     um `return` novo sem fechamento seria invisivel no code review.
//   - a troca de sala VOLTAR A NAO DIZER QUAL AREA. Era o defeito da versao
//     anterior, registrado por escrito em `stores/splashDeSalaVanilla.ts` e
//     mantido por meses.
//   - `prefers-reduced-motion` SUMIR. Todo bloco de keyframes do projeto tem o
//     `@media` de reduce; um bloco novo sem ele nao quebra nada e ninguem nota.
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { act, render, screen, cleanup, fireEvent } from '@testing-library/react'

import fonteDoController from '@/engine/controller.ts?raw'
import { SUB_BIOMA_POR_CHAVE } from '@/data/biomas'
import { MAPS, backgroundParaSala } from '@/data/maps'
import { useWorldStore } from '@/stores/worldStore'
import { useCutsceneStore } from '@/stores/cutsceneStore'
import { TETO_DE_CARREGAMENTO_MS } from '@/data/tetoDeCarregamento'
import { PRELOAD_TIMEOUT_MS } from '@/data/preload'
import { CutsceneDeArea } from './CutsceneDeArea'
import { CutsceneDeEntrada } from './CutsceneDeEntrada'
import { SalaCountdownModal } from './SalaCountdownModal'

const HUNT = 'marinho_e3'

afterEach(() => {
  cleanup()
  useCutsceneStore.setState({ cena: null } as never, false)
  useWorldStore.setState({ mapDef: null, salaPendente: null, salaCountdownRemaining: null } as never, false)
})

describe('a cena em si', () => {
  it('mostra o nome mesmo sem arte nenhuma', () => {
    // O caso que importa: `arte: null` (hunt sem imagem, ou mapa desconhecido).
    // A cor de fundo e o piso e o letreiro e a informacao — nao ha estado em que
    // a cutscene seja uma tela vazia.
    render(<CutsceneDeArea arte={null} corDeFundo="#123456" titulo="Praia" subtitulo="Lv 21-30" />)
    expect(screen.getByText('Praia')).toBeTruthy()
    expect(screen.getByText('Lv 21-30')).toBeTruthy()
    expect(document.querySelector('img')).toBeNull()
  })

  it('a arte entra como <img> com `onLoad`, e nao como background-image', () => {
    // `background-image` nao avisa quando terminou de carregar, e sem esse aviso
    // a unica opcao seria mostrar a arte na hora — que e o "pisca" que a nota de
    // `FundoDoBioma` (PH-441) registra.
    render(<CutsceneDeArea arte="assets/x.jpg" corDeFundo="#000" titulo="Mar Aberto" subtitulo={null} />)
    const img = document.querySelector('img')
    expect(img?.getAttribute('src')).toBe('assets/x.jpg')
    // Começa apagada e acende no `onLoad` — o `<img>` existe desde o primeiro
    // render, o que e o que faz o `onLoad` chegar.
    expect(img?.className).toContain('opacity-0')
  })

  it('o letreiro ESPERA a arte, e entra junto com ela (PH-483)', () => {
    // INVERTIDO NA PH-483, e a inversao e pedido do dono: "a imagem da tela de
    // carregamento esta chegando apos o anuncio". O texto entrando primeiro
    // sobre um retangulo de cor chapada era exatamente o defeito.
    //
    // O que continua protegido e o que a versao anterior protegia: a cena nao
    // fica MUDA. O rodape (a contagem, o "Carregando") entra na hora, e o
    // letreiro chega no mesmo quadro da arte.
    render(
      <CutsceneDeArea
        arte="assets/demora.jpg" corDeFundo="#000" titulo="Leito Oceânico" subtitulo={null}
        rodape={<span>Carregando</span>}
      />,
    )
    expect(screen.queryByText('Leito Oceânico'), 'o letreiro nao pode preceder a arte').toBeNull()
    expect(screen.getByText('Carregando'), 'o rodape entra na hora').toBeTruthy()

    fireEvent.load(document.querySelector('img')!)
    expect(screen.getByText('Leito Oceânico')).toBeTruthy()
  })

  it('arte que NAO chega libera o letreiro pelo `onError` (PH-483)', () => {
    // O modo de falha que a PH-483 poderia ter criado: 404 ou `assets/` nao
    // servido nunca dispara `load`, e sem `onError` a cena ficaria sem nome pelo
    // tempo inteiro em que estivesse na tela.
    render(<CutsceneDeArea arte="assets/404.jpg" corDeFundo="#000" titulo="Praia" subtitulo={null} />)
    expect(screen.queryByText('Praia')).toBeNull()
    fireEvent.error(document.querySelector('img')!)
    expect(screen.getByText('Praia')).toBeTruthy()
  })

  it('arte JA no cache nasce revelada, sem um quadro de cor chapada (PH-483)', () => {
    // O caso NORMAL depois da PH-483: `controller#enterMap` aquece a arte antes
    // de abrir a cena. Imagem ja completa pode nao disparar `load` de novo, e sem
    // o `ref` que olha `complete` a cena piscaria a cor do bioma justamente no
    // caminho que a issue otimizou.
    const original = Object.getOwnPropertyDescriptor(window.HTMLImageElement.prototype, 'complete')
    Object.defineProperty(window.HTMLImageElement.prototype, 'complete', { configurable: true, get: () => true })
    Object.defineProperty(window.HTMLImageElement.prototype, 'naturalWidth', { configurable: true, get: () => 2048 })
    try {
      render(<CutsceneDeArea arte="assets/quente.jpg" corDeFundo="#000" titulo="Recife" subtitulo={null} />)
      expect(screen.getByText('Recife')).toBeTruthy()
    } finally {
      if (original) Object.defineProperty(window.HTMLImageElement.prototype, 'complete', original)
    }
  })

  it('fica dentro da faixa do campo, e nao em tela cheia (PH-482)', () => {
    // Pedido do dono: "ela ficara apenas no campo proprio do campo de batalha,
    // sem sobressair sobre outros menus". `inset-0` de volta cobriria o trilho e
    // a doca outra vez, e o sintoma (nao dar pra abrir a mochila durante o
    // carregamento) nao quebra teste nenhum sozinho.
    render(<CutsceneDeArea arte={null} corDeFundo="#000" titulo="X" subtitulo={null} />)
    const cena = screen.getByRole('status')
    expect(cena.className, 'tela cheia de novo').not.toContain('inset-0')
    // A faixa e a MESMA de `CampoOverlay` — `top`/`bottom` calculados, e nao
    // zerados.
    expect(cena.style.top).toBeTruthy()
    expect(cena.style.bottom).toBeTruthy()
  })

  it('respeita `prefers-reduced-motion`', () => {
    render(<CutsceneDeArea arte={null} corDeFundo="#000" titulo="X" subtitulo={null} />)
    const css = document.querySelector('style')?.textContent ?? ''
    // Guarda anti-vacuo: o bloco de keyframes existe de verdade.
    expect(css).toContain('@keyframes cutscene-zoom')
    expect(css).toContain('prefers-reduced-motion')
  })

  it('engole o clique enquanto esta na tela', () => {
    // Deixar passar significaria o jogador acertando um botao da doca que ele
    // nao pode ver.
    render(<CutsceneDeArea arte={null} corDeFundo="#000" titulo="X" subtitulo={null} />)
    const cena = screen.getByRole('status')
    expect(cena.className).toContain('pointer-events-auto')
  })
})

describe('a cutscene de ENTRADA', () => {
  beforeEach(() => { useCutsceneStore.setState({ cena: null } as never, false) })

  it('nao renderiza nada com a cena fechada', () => {
    render(<CutsceneDeEntrada />)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('renderiza o que o controller abriu, com o aviso de carregando', () => {
    useCutsceneStore.getState().abrir({
      arte: 'assets/biome-selector/marinho.jpg',
      corDeFundo: '#1f3d52',
      titulo: 'Marinho 3',
      subtitulo: 'Lv 21-30',
    })
    render(<CutsceneDeEntrada />)
    expect(screen.getByText('Carregando')).toBeTruthy()
    // PH-483: o letreiro entra junto com a arte. O jsdom nao baixa recurso
    // nenhum, entao o `load` e disparado a mao — no navegador ele chega sozinho,
    // e quase sempre no primeiro quadro, porque `enterMap` ja aqueceu o arquivo.
    fireEvent.load(document.querySelector('img')!)
    expect(screen.getByText('Marinho 3')).toBeTruthy()
  })

  it('aos 15s a cena FICA e oferece saída, em vez de sumir (PH-489)', () => {
    // INVERTIDO NA PH-489, e a inversão corrige a PH-484. Aquela issue leu "o
    // efeito do zoom in deverá ter uma duração máxima de 15 segundos" na
    // acepção estrita — a TELA some aos 15s — e em Slow 3G o QA mostrou o
    // preço: a tela de carregamento sumindo com a entrada ainda em voo, e o
    // jogador de volta no painel com o jogo montando por baixo.
    //
    // O que tornou seguro deixar a cena ficar foi a PH-482: ela não é mais tela
    // cheia, então uma cena presa não tranca o jogo — os menus respondem por
    // fora dela.
    // `fireEvent` e nao `userEvent`: o segundo precisa de relogio real ou de
    // `advanceTimers` casado, e com `useFakeTimers` ligado ele pendura o caso.
    vi.useFakeTimers()
    try {
      const idDaCena = useCutsceneStore.getState().abrir({
        arte: null, corDeFundo: '#000', titulo: 'Presa', subtitulo: null,
      })
      render(<CutsceneDeEntrada />)
      expect(screen.getByText('Carregando')).toBeTruthy()

      // ANTES do teto não há botão — senão o caso passaria com qualquer teto,
      // inclusive zero.
      act(() => { vi.advanceTimersByTime(TETO_DE_CARREGAMENTO_MS - 1000) })
      expect(screen.queryByRole('button', { name: /sair/i }), 'botão cedo demais').toBeNull()

      act(() => { vi.advanceTimersByTime(1001) })
      expect(useCutsceneStore.getState().cena?.id, 'a cena NÃO pode sumir sozinha').toBe(idDaCena)
      expect(screen.queryByText('Carregando'), 'o rodapé tinha que ter trocado').toBeNull()

      // E o botão fecha de verdade. `pointer-events-auto` próprio: a cena
      // engole o clique, e sem ele o botão existiria sem responder.
      fireEvent.click(screen.getByRole('button', { name: /sair/i }))
      expect(useCutsceneStore.getState().cena, 'o botão não fechou a cena').toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('a cena SEGUINTE não nasce com o botão de sair (PH-489)', () => {
    // O estado de "demorou" é por CENA. Sem zerá-lo na troca de `id`, uma
    // entrada demorada deixaria a flag ligada e a hunt seguinte abriria
    // oferecendo saída antes de esperar coisa nenhuma.
    vi.useFakeTimers()
    try {
      useCutsceneStore.getState().abrir({
        arte: null, corDeFundo: '#000', titulo: 'Demorada', subtitulo: null,
      })
      const { rerender } = render(<CutsceneDeEntrada />)
      act(() => { vi.advanceTimersByTime(TETO_DE_CARREGAMENTO_MS + 1000) })
      expect(screen.getByRole('button', { name: /sair/i })).toBeTruthy()

      act(() => {
        useCutsceneStore.getState().abrir({
          arte: null, corDeFundo: '#000', titulo: 'Nova', subtitulo: null,
        })
      })
      rerender(<CutsceneDeEntrada />)
      expect(screen.queryByRole('button', { name: /sair/i }), 'herdou o botão da cena anterior').toBeNull()
      expect(screen.getByText('Carregando')).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('o teto da cutscene e o MESMO do preload', () => {
    // Se divergirem, um dos dois defeitos aparece e nenhum lanca erro: cutscene
    // menor entra com a arte ainda baixando; cutscene maior deixa o jogador
    // olhando um carregamento que ja desistiu. Ver `data/tetoDeCarregamento.ts`.
    expect(PRELOAD_TIMEOUT_MS).toBe(TETO_DE_CARREGAMENTO_MS)
  })

  it('`fechar` com id VELHO nao apaga a cena atual', () => {
    // Uma entrada recusada pelo servidor pode terminar DEPOIS de o jogador ja
    // ter clicado em outra hunt. Um fechamento cego apagaria a cutscene que
    // acabou de abrir, e o jogador entraria sem tela de carregamento nenhuma.
    const velho = useCutsceneStore.getState().abrir({
      arte: null, corDeFundo: '#000', titulo: 'Antiga', subtitulo: null,
    })
    const novo = useCutsceneStore.getState().abrir({
      arte: null, corDeFundo: '#000', titulo: 'Nova', subtitulo: null,
    })
    expect(novo).not.toBe(velho)

    useCutsceneStore.getState().fechar(velho)
    expect(useCutsceneStore.getState().cena?.titulo).toBe('Nova')

    useCutsceneStore.getState().fechar(novo)
    expect(useCutsceneStore.getState().cena).toBeNull()
  })

  // O CONTRATO DO CONTROLLER, LIDO NO FONTE.
  //
  // Testar `enterMap` de verdade aqui exigiria mockar a Edge e o carregamento de
  // imagem (o jsdom nao baixa recurso, entao `primeImage` nunca resolve e o
  // `await` pendura o teste). O que importa e ESTRUTURAL e da pra ler: o
  // fechamento tem que estar num `finally`, senao cada `return` novo no meio da
  // entrada vira um vazamento de overlay. Mesmo padrao de
  // `features/game/flagDeHuntSemCena.test.tsx`, que le este mesmo arquivo pra
  // travar a ORDEM de dois passos.
  it('o controller fecha a cutscene num `finally`, e nao no caminho felizes', () => {
    // Guarda anti-vacuo: e este arquivo mesmo.
    expect(fonteDoController).toContain('async enterMap(')

    const abre = fonteDoController.indexOf('useCutsceneStore.getState().abrir(')
    const fecha = fonteDoController.indexOf('useCutsceneStore.getState().fechar(')
    expect(abre, 'o controller nao abre a cutscene').toBeGreaterThan(-1)
    expect(fecha, 'o controller nao fecha a cutscene').toBeGreaterThan(abre)

    // O `finally` tem que estar ENTRE o `abrir` e o `fechar`.
    const doFinally = fonteDoController.indexOf('} finally {', abre)
    expect(doFinally, 'o fechamento nao esta num finally').toBeGreaterThan(-1)
    expect(doFinally).toBeLessThan(fecha)
  })

  it('a cutscene abre ANTES de qualquer espera de arte (PH-486)', () => {
    // O DEFEITO QUE ISTO TRAVA foi medido em QA ao vivo com Slow 3G: a PH-483
    // esperava a arte da cena com `await` ANTES de abrir a cena, e o jogador
    // ficava ate 15 segundos olhando um botao "Entrando..." sem tela de
    // carregamento nenhuma.
    //
    // A ordem e o que importa, e ela e legivel no fonte. Um `await` novo entre o
    // inicio de `enterMap` e o `abrir()` traz o defeito de volta sem quebrar
    // nada mais.
    // LINHAS DE CODIGO, e nao o texto cru: a nota que explica a issue cita
    // `await preloadArteDeCena(...)` como o que NAO fazer, e um `indexOf` no
    // arquivo inteiro acha o comentario primeiro. Foi o que aconteceu na
    // primeira versao deste caso.
    const linhas = fonteDoController.split('\n').filter((l) => !l.trim().startsWith('//'))
    const chamadas = linhas.filter((l) => l.includes('preloadArteDeCena('))
    expect(chamadas, 'o aquecimento da arte da cena sumiu').toHaveLength(1)
    expect(chamadas[0], 'esperar a arte antes de abrir a cena e o defeito da PH-486')
      .not.toContain('await')
    expect(chamadas[0], 'sem `void` o lint acusa promessa solta').toContain('void ')

    // E a ORDEM: aquecer depois de abrir seria correto tambem, mas aquecer
    // ANTES faz a imagem chegar mais cedo de graca. O que nao pode e esperar.
    const iAquece = linhas.findIndex((l) => l.includes('preloadArteDeCena('))
    const iAbre = linhas.findIndex((l) => l.includes('useCutsceneStore.getState().abrir('))
    expect(iAbre).toBeGreaterThan(-1)
    expect(iAquece).toBeLessThan(iAbre)
  })

  it('a cutscene abre DEPOIS das guardas locais', () => {
    // Slot vazio e POKE caido recusam sem tocar na rede e ja avisam por toast.
    // Abrir antes delas seria um flash de tela cheia pra fechar no mesmo tick.
    const guardaDoDesmaio = fonteDoController.indexOf('activePoke.hp <= 0')
    const abre = fonteDoController.indexOf('useCutsceneStore.getState().abrir(')
    expect(guardaDoDesmaio).toBeGreaterThan(-1)
    expect(abre).toBeGreaterThan(guardaDoDesmaio)
  })
})

describe('a cutscene de TROCA DE SALA', () => {
  function comTransicao(indice: number, restante: number | null) {
    const chave = 'beach'
    useWorldStore.setState({
      mapDef: { ...MAPS[HUNT], collisionGrid: null },
      salaPendente: { chave, indice, abates: 0, ciclos: indice === 0 ? 1 : 0 },
      salaCountdownRemaining: restante,
    } as never, false)
    return chave
  }

  it('nao renderiza nada sem contagem armada', () => {
    comTransicao(1, null)
    render(<SalaCountdownModal />)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('DIZ QUAL AREA — era o defeito da versao anterior', () => {
    const chave = comTransicao(1, 3)
    render(<SalaCountdownModal />)
    fireEvent.load(document.querySelector('img')!)
    const nome = SUB_BIOMA_POR_CHAVE[chave].sub.nome
    // Guarda anti-vacuo: o sub-bioma existe e tem nome proprio.
    expect(nome).toBeTruthy()
    expect(screen.getByText(nome)).toBeTruthy()
    expect(screen.getByText('Nova área')).toBeTruthy()
    // E a contagem continua, arredondada pra cima como antes.
    expect(screen.getByText('3')).toBeTruthy()
  })

  it('usa a arte do sub-bioma que ESTA ENTRANDO, e nao a da hunt', () => {
    // `backgroundParaSala` faz o sub-bioma mandar sobre o `bg` da hunt. Mostrar
    // a arte da hunt na troca de sala anunciaria o lugar errado — que e o mesmo
    // defeito de "nao dizer o nome", so pelo canal da imagem.
    const chave = comTransicao(1, 2)
    render(<SalaCountdownModal />)
    const esperado = backgroundParaSala(
      { ...MAPS[HUNT], collisionGrid: null } as never,
      { chave },
    )
    expect(document.querySelector('img')?.getAttribute('src')).toBe(esperado.image)
  })

  it('sala que entra no indice 0 anuncia estagio concluido', () => {
    // `indice === 0` na sala que ENTRA significa que o ciclo reiniciou — mesmo
    // critério de `fechouEstagio` em `armarTransicaoDeSala`.
    comTransicao(0, 1)
    render(<SalaCountdownModal />)
    fireEvent.load(document.querySelector('img')!)
    expect(screen.getByText('Estágio concluído')).toBeTruthy()
  })
})
