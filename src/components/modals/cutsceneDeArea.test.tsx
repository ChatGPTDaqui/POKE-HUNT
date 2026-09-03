// @vitest-environment jsdom
//
// PH-471 — a cutscene de area, nos dois momentos em que ela roda.
//
// O QUE CADA CASO AQUI IMPEDE, e todos falham em silencio:
//
//   - a cutscene DEPENDER DA ARTE pra sair. Arte que nunca chega (404, rede
//     ruim, `assets/` nao servido) prenderia o jogador numa tela de
//     carregamento que nao carrega nada — e ela engole o clique de proposito,
//     entao nao haveria saida.
//   - a cutscene FICAR PRESA quando a entrada e recusada. `enterMap` recusa por
//     quatro caminhos (slot vazio, POKE caido, servidor negando, rede caindo), e
//     um `return` novo sem fechamento seria invisivel no code review.
//   - a troca de sala VOLTAR A NAO DIZER QUAL AREA. Era o defeito da versao
//     anterior, registrado por escrito em `stores/splashDeSalaVanilla.ts` e
//     mantido por meses.
//   - `prefers-reduced-motion` SUMIR. Todo bloco de keyframes do projeto tem o
//     `@media` de reduce; um bloco novo sem ele nao quebra nada e ninguem nota.
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

import fonteDoController from '@/engine/controller.ts?raw'
import { SUB_BIOMA_POR_CHAVE } from '@/data/biomas'
import { MAPS, backgroundParaSala } from '@/data/maps'
import { useWorldStore } from '@/stores/worldStore'
import { useCutsceneStore } from '@/stores/cutsceneStore'
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

  it('o letreiro NAO espera a arte', () => {
    // Se o texto dependesse do `carregou`, arte que nao chega deixaria a cena
    // muda — e o nome do lugar e a unica coisa que a cutscene tem a dizer.
    render(<CutsceneDeArea arte="assets/nunca-chega.jpg" corDeFundo="#000" titulo="Leito Oceânico" subtitulo={null} />)
    expect(screen.getByText('Leito Oceânico')).toBeTruthy()
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
    expect(screen.getByText('Marinho 3')).toBeTruthy()
    expect(screen.getByText('Carregando')).toBeTruthy()
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
    expect(screen.getByText('Estágio concluído')).toBeTruthy()
  })
})
