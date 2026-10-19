// Janela Missões (18/10/2026): entrada única, aba inicial, telas antigas viram
// aba, e a Rota do Treinador lendo as constantes do jogo.
import { beforeEach, describe, expect, it } from 'vitest'
import { abaInicial, totalDePendencias, ABAS_DE_MISSOES, GRUPOS_DE_MISSOES, grupoTemSubmenu } from '@/data/abasDeMissoes'
import { useUiStore } from '@/stores/uiStore'
import { faseAtual, rotaDoTreinador, CONQUISTAS_DA_GS_BALL, type EntradaDaRota } from '@/data/rotaDoTreinador'
import { BIOMAS, ESTAGIOS_PARA_O_LANCE } from '@/data/biomas'
import { ESTAGIOS_POR_BIOMA } from '@/data/estagios'
import { ESPECIALIDADE_NIVEL_MAX } from '@/data/especialidades'
import { PRIMEIROS_PASSOS } from '@/data/primeirosPassos'
import { cadeiaDoTipo, chaveDaMissao, MISSAO_TYPES } from '@/data/missoes'
import type { ProgressoPorBioma } from '@/data/progressoDeBioma'
import { tasksProntas } from './pendenciasDeMissoes'

describe('janela Missões', () => {
  beforeEach(() => { useUiStore.setState({ currentScreen: null, abaDeMissoes: 'objetivos' }) })

  it('as telas antigas abrem a janela na aba certa', () => {
    for (const tela of ['tasks', 'especialidades', 'conquistas', 'bestiario'] as const) {
      useUiStore.getState().openScreen(tela)
      expect(useUiStore.getState()).toMatchObject({ currentScreen: 'missoes', abaDeMissoes: tela })
    }
  })

  it('toggle da tela antiga fecha quando a aba dela ja esta aberta', () => {
    useUiStore.getState().toggleScreen('tasks')
    expect(useUiStore.getState().currentScreen).toBe('missoes')
    useUiStore.getState().toggleScreen('tasks')
    expect(useUiStore.getState().currentScreen).toBeNull()
  })

  it('abre na primeira aba com premio destrancada; sem premio, na ultima usada', () => {
    const livre = () => false
    expect(abaInicial({ tasks: 2, diario: 1 }, 'conquistas', livre)).toBe('diario')
    expect(abaInicial({ tasks: 2 }, 'conquistas', livre)).toBe('tasks')
    expect(abaInicial({}, 'conquistas', livre)).toBe('conquistas')
    expect(abaInicial({ tasks: 2 }, 'conquistas', (a) => a === 'tasks')).toBe('conquistas')
  })

  it('o selo soma as fontes sem repetir', () => {
    expect(totalDePendencias({ diario: 2, objetivos: 1, tasks: 3 })).toBe(6)
    expect(totalDePendencias({})).toBe(0)
  })

  it('nivel de cima: Diario, Objetivos e Progresso; so Progresso tem submenu', () => {
    expect(GRUPOS_DE_MISSOES.map((g) => g.label)).toEqual(['Diário', 'Objetivos', 'Progresso'])
    expect(GRUPOS_DE_MISSOES.filter((g) => grupoTemSubmenu(g.value)).map((g) => g.value)).toEqual(['progresso'])
    expect(ABAS_DE_MISSOES.filter((a) => a.grupo === 'progresso').map((a) => a.aba))
      .toEqual(['tasks', 'especialidades', 'conquistas', 'bestiario'])
  })

  it('Task pronta conta so quando a missao atual da cadeia bateu o alvo', () => {
    const tipo = MISSAO_TYPES[0]
    const m = cadeiaDoTipo(tipo)[0]
    expect(tasksProntas({}, {})).toBe(0)
    expect(tasksProntas({ [m.speciesId]: { normal: m.alvo } }, {})).toBeGreaterThanOrEqual(1)
    expect(tasksProntas({ [m.speciesId]: { normal: m.alvo } }, { [chaveDaMissao(tipo, m.speciesId)]: true }))
      .toBeLessThan(tasksProntas({ [m.speciesId]: { normal: m.alvo } }, {}))
  })
})

function entrada(over: Partial<EntradaDaRota> = {}): EntradaDaRota {
  return {
    passosCumpridos: 0, nivelDoTreinador: 1, progresso: {} as ProgressoPorBioma, lanceVencido: false,
    maiorEspecialidade: 0, conquistas: { carregadas: true, total: 0, ouro: 0 }, maiorPesquisa: 0, ...over,
  }
}

const progressoEm = (estagio: number): ProgressoPorBioma =>
  Object.fromEntries(BIOMAS.map((b) => [b.chave, estagio])) as unknown as ProgressoPorBioma

describe('Rota do Treinador', () => {
  it('conta nova esta no Inicio', () => {
    expect(faseAtual(rotaDoTreinador(entrada()))).toBe('inicio')
  })

  it('os alvos acompanham as constantes do jogo', () => {
    const marcos = rotaDoTreinador(entrada()).flatMap((f) => f.marcos)
    const alvo = (id: string) => marcos.find((m) => m.id === id)!.alvo
    expect(alvo('primeiros_passos')).toBe(PRIMEIROS_PASSOS.length)
    expect(alvo('rumo_ao_lance')).toBe(BIOMAS.length)
    expect(marcos.find((m) => m.id === 'rumo_ao_lance')!.titulo).toContain(String(ESTAGIOS_PARA_O_LANCE))
    expect(marcos.find((m) => m.id === 'mundo')!.titulo).toContain(String(ESTAGIOS_POR_BIOMA))
    expect(alvo('especialidade_max')).toBe(ESPECIALIDADE_NIVEL_MAX)
    expect(alvo('gs_ball')).toBe(CONQUISTAS_DA_GS_BALL)
  })

  it('quem fechou o Inicio esta no Meio, e quem venceu o Meio esta no Fim', () => {
    const inicioFeito = entrada({ passosCumpridos: PRIMEIROS_PASSOS.length, nivelDoTreinador: 10, progresso: progressoEm(1) })
    expect(faseAtual(rotaDoTreinador(inicioFeito))).toBe('meio')
    const meioFeito = entrada({
      ...inicioFeito, progresso: progressoEm(ESTAGIOS_PARA_O_LANCE), lanceVencido: true, maiorEspecialidade: 5,
      conquistas: { carregadas: true, total: 1, ouro: 1 },
    })
    expect(faseAtual(rotaDoTreinador(meioFeito))).toBe('fim')
  })

  it('conquistas ainda nao carregadas nao contam como concluidas', () => {
    const r = rotaDoTreinador(entrada({ conquistas: { carregadas: false, total: 999, ouro: 9 } }))
    expect(r.flatMap((f) => f.marcos).find((m) => m.id === 'conquista_ouro')!.medido).toBe(false)
  })
})
