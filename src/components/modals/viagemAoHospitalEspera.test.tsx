// @vitest-environment jsdom
// PH-263 — sair da hunt pelo botao Hospital custa 3 segundos.
//
// O que este arquivo tranca nao e o numero: e a diferenca entre "marcar a
// viagem" e "viajar". Enquanto as duas coisas eram o mesmo clique, o slot
// Hospital era um botao de fuga — POKE quase morto, bando reunido em cima, e a
// saida instantanea zerava a situacao sem custo. A regressao possivel aqui e
// silenciosa: alguem devolve `controller.returnToHospital` pro `onClick` e nada
// quebra na tela, so o exploit volta.
//
// Os quatro casos sao os quatro jeitos de a espera deixar de existir:
// sair antes da hora, sair duas vezes, o segundo clique reiniciar/duplicar a
// contagem, e a contagem sobreviver a uma saida por outro caminho.
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'

import { useUiStore, SEGUNDOS_ATE_O_HOSPITAL } from '@/stores/uiStore'
import { useWorldStore } from '@/stores/worldStore'
import { ViagemAoHospitalOverlay } from './ViagemAoHospitalOverlay'

const voltarAoHospital = vi.fn()
vi.mock('@/engine/controller', () => ({
  controller: { returnToHospital: (...args: unknown[]) => voltarAoHospital(...args) },
}))

/** Em hunt (o overlay so conta com `mapDef` preenchido) ou no Hospital. */
function definirCena(emHunt: boolean) {
  useWorldStore.setState({ mapDef: emHunt ? ({ id: 'forest' } as never) : null } as never, false)
}

function avancarSegundos(n: number) {
  // UM SEGUNDO POR VEZ, e nao `advanceTimersByTime(n * 1000)` de uma vez.
  //
  // O overlay agenda o proximo `setTimeout` no efeito que roda DEPOIS de o
  // React renderizar o segundo novo. Com um salto unico de 3s, o timer seguinte
  // nasce ja no instante 3000 e so venceria em 4000 — o teste media um relogio
  // que nao andou e falhava contra um componente correto.
  //
  // `act` em volta de cada passo: o timeout chama `set` do zustand, e sem ele o
  // passo seguinte rodaria sobre um estado que a arvore ainda nao viu.
  for (let i = 0; i < n; i++) {
    act(() => { vi.advanceTimersByTime(1000) })
  }
}

describe('espera de 3s pra voltar ao Hospital (PH-263)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    voltarAoHospital.mockClear()
    useUiStore.getState().cancelarViagemAoHospital()
    definirCena(true)
  })

  afterEach(() => {
    // `cleanup` a mao: o projeto roda o Vitest sem `globals`, entao o
    // auto-cleanup do testing-library nao esta ligado. Sem ele o overlay de um
    // caso continua montado no seguinte, com o relogio dele correndo — media-se
    // 2 e 3 viagens onde o componente fez uma.
    cleanup()
    vi.useRealTimers()
  })

  it('nao sai da hunt antes dos 3 segundos', () => {
    render(<ViagemAoHospitalOverlay />)
    act(() => { useUiStore.getState().iniciarViagemAoHospital() })

    avancarSegundos(SEGUNDOS_ATE_O_HOSPITAL - 1)
    expect(voltarAoHospital).not.toHaveBeenCalled()
  })

  it('sai exatamente uma vez ao completar os 3 segundos', () => {
    render(<ViagemAoHospitalOverlay />)
    act(() => { useUiStore.getState().iniciarViagemAoHospital() })

    avancarSegundos(SEGUNDOS_ATE_O_HOSPITAL)
    expect(voltarAoHospital).toHaveBeenCalledTimes(1)

    // O relogio continuar correndo depois da saida nao pode disparar uma
    // segunda viagem: `returnToHospital` remonta o mundo inteiro.
    avancarSegundos(5)
    expect(voltarAoHospital).toHaveBeenCalledTimes(1)
    expect(useUiStore.getState().viagemAoHospital).toBeNull()
  })

  it('pedir de novo no meio da contagem nao reinicia nem adianta a viagem', () => {
    render(<ViagemAoHospitalOverlay />)
    act(() => { useUiStore.getState().iniciarViagemAoHospital() })
    avancarSegundos(1)
    // Duplo clique: o guard vive no store, entao a segunda chamada e no-op.
    act(() => { useUiStore.getState().iniciarViagemAoHospital() })

    expect(useUiStore.getState().viagemAoHospital).toBe(SEGUNDOS_ATE_O_HOSPITAL - 1)
    avancarSegundos(SEGUNDOS_ATE_O_HOSPITAL - 1)
    expect(voltarAoHospital).toHaveBeenCalledTimes(1)
  })

  it('sair da hunt por outro caminho no meio da contagem cancela a viagem', () => {
    // Derrota, ou a sessao encerrada pelo servidor: a cena ja e o Hospital, e
    // deixar o relogio terminar chamaria `returnToHospital` de dentro dele.
    render(<ViagemAoHospitalOverlay />)
    act(() => { useUiStore.getState().iniciarViagemAoHospital() })
    avancarSegundos(1)
    act(() => { definirCena(false) })

    expect(useUiStore.getState().viagemAoHospital).toBeNull()
    avancarSegundos(5)
    expect(voltarAoHospital).not.toHaveBeenCalled()
  })
})
