// @vitest-environment jsdom
// PH-272 — o chip de sala mora DENTRO do trilho, e so em um lugar por vez.
//
// O que este arquivo tranca nao e a posicao (isso e CSS e se ve na tela): sao as
// duas regras que quebram em SILENCIO se alguem mexer.
//
//  1. UMA COPIA SO. `StatusRail` e `HudLayer` decidem separadamente se mostram o
//     chip, e a unica coisa que os mantem de acordo e `salaNoTrilho`. Se os dois
//     disserem sim, o jogador ve "Sala 3/10" duas vezes na tela; se os dois
//     disserem nao, ele nao ve nenhuma. Nenhum dos dois casos da erro.
//  2. A FAIXA CENTRAL NUNCA FICA VAZIA. Fora de hunt nao ha sala, e um buraco no
//     meio do trilho e exatamente o que o criterio de aceite da issue proibe —
//     por isso o nome do lugar ocupa a faixa quando a sala nao existe.
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

import { StatusRail } from './StatusRail'
import { salaNoTrilho } from './SalaChip'
import { useWorldStore } from '@/stores/worldStore'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useUiStore } from '@/stores/uiStore'

const SALA = { indice: 2, chave: 'grass', abates: 7, ciclos: 0 }

/** `mapDef` de mentira: o trilho so le `name` e `levelRange` dele. */
const MAPA = { id: 'mata_faixa1', name: 'Mata I', levelRange: [1, 30] }

describe('sala no cabecalho (PH-272)', () => {
  beforeEach(() => {
    useGameStateStore.getState().resetToDefaults()
    useUiStore.setState({ viewportWidth: 1440, viewportHeight: 900 } as never, false)
    useWorldStore.setState({ sala: null, mapDef: null, player: null } as never, false)
  })
  afterEach(cleanup)

  it('em hunt, o trilho mostra a sala e o sub-bioma', () => {
    useWorldStore.setState({ sala: SALA, mapDef: MAPA } as never, false)
    render(<StatusRail />)
    // "Sala 3/10" sai partido em varios elementos (o numero e um `<b>`), entao a
    // busca e pelo texto do container inteiro.
    expect(document.body.textContent).toContain('Sala')
    expect(document.body.textContent).toContain('Relvado')
    // A quota tambem: e o que o jogador olha pra saber se vale esperar.
    expect(document.body.textContent).toContain('23 restam')
  })

  it('fora de hunt, a faixa central mostra o LUGAR — nunca fica vazia', () => {
    render(<StatusRail />)
    expect(screen.getByText('Hospital')).toBeTruthy()
  })

  it('em hunt sem sistema de salas, o nome da hunt ocupa a faixa', () => {
    // Hunt inicial, BOSS e Lance nao tem sala. Sem este caso o jogador ficaria
    // sem saber onde esta justamente nas hunts em que nao ha sub-bioma pra ler.
    useWorldStore.setState({ sala: null, mapDef: { ...MAPA, name: 'Route 46' } } as never, false)
    render(<StatusRail />)
    expect(screen.getByText('Route 46')).toBeTruthy()
  })

  it('o trilho NAO mostra a sala no compacto — la ela mora na linha de baixo', () => {
    // O regime sai de `viewportWidth` no uiStore, e nao de `window.innerWidth`
    // direto (ver `useDeviceMode`) — escrever no store e o jeito de forcar 390px
    // aqui. O trilho desse tamanho ja empurrou o avatar do treinador pra fora da
    // tela uma vez, e este chip sozinho pede ~15em.
    useUiStore.setState({ viewportWidth: 390, viewportHeight: 844 } as never, false)
    useWorldStore.setState({ sala: SALA, mapDef: MAPA } as never, false)
    render(<StatusRail />)
    expect(document.body.textContent).not.toContain('Relvado')
    expect(salaNoTrilho('compacto')).toBe(false)
  })

  it('`salaNoTrilho` responde igual pros dois lados que perguntam', () => {
    // A funcao E o contrato entre `StatusRail` e `HudLayer`. Se ela passar a
    // depender de outra coisa (largura, toggle, hunt), os dois continuam de
    // acordo — que e o ponto de ela existir.
    expect(salaNoTrilho('amplo')).toBe(true)
    expect(salaNoTrilho('deitado')).toBe(true)
    expect(salaNoTrilho('compacto')).toBe(false)
  })
})
