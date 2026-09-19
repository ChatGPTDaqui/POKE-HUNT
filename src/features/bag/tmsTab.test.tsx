// @vitest-environment jsdom
//
// PH-556 — aba TMs dentro da mochila: dano/categoria/AoE visiveis sem abrir
// item por item, filtro por tipo de golpe e ordenacao por poder.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useGameStateStore } from '@/stores/gameStateStore'
import { TM_ITEMS } from '@/data/maquinas'
import { getAbility } from '@/data/abilities'
import { TmsTab } from './BagMenu'

vi.mock('./useMochila', () => ({ useMochila: () => ({ carregada: true, erro: null }) }))
vi.mock('@/data/remote/autoridade', () => ({ pedirAcao: async (_acao: unknown, fallback: () => unknown) => fallback() }))

// Duas TMs de TIPOS e PODER DIFERENTES, achadas no catalogo real em vez de
// chutadas: o teste nao pode travar num id que uma reexportacao futura da
// planilha apague. Precisa ser poder estritamente diferente — com empate o
// clique de inverter ordem nao move nada (sort estavel), e o teste de
// ordenacao passaria mesmo se a ordenacao real estivesse quebrada.
const candidatas = Object.values(TM_ITEMS)
  .map((tm) => ({ tm, ability: getAbility(tm.golpe)! }))
  .filter(({ ability }) => ability.power > 0)
  .sort((a, b) => b.ability.power - a.ability.power)
const FORTE = candidatas[0]
const FRACA = [...candidatas].reverse()
  .find((c) => c.ability.power < FORTE.ability.power && c.ability.type !== FORTE.ability.type)!

beforeEach(() => {
  cleanup()
  useGameStateStore.setState({
    items: { [FORTE.tm.id]: 1, [FRACA.tm.id]: 3 },
    lockedItems: {},
    team: [],
    bagPokes: [],
    currentMapId: null,
  })
})

describe('Aba TMs da mochila (PH-556)', () => {
  const nomeRegex = (nome: string) => new RegExp(`^${nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)

  it('lista so as TMs que o jogador tem, com nome e quantidade no slot', () => {
    render(<TmsTab />)
    expect(screen.getByRole('radiogroup', { name: 'TMs da mochila' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: new RegExp(`^${FORTE.tm.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\(x1\\)`) })).toBeTruthy()
  })

  it('escolher uma TM mostra o card de detalhe do golpe (via EnsinarTm)', () => {
    render(<TmsTab />)
    fireEvent.click(screen.getByRole('radio', { name: nomeRegex(FORTE.tm.name) }))
    expect(screen.getByRole('region', { name: `Detalhes de ${FORTE.ability.name}` })).toBeTruthy()
  })

  it('filtro por tipo de golpe restringe a grade a so aquele tipo', () => {
    render(<TmsTab />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Filtrar por tipo de golpe' }), { target: { value: FORTE.ability.type } })
    expect(screen.getByRole('radio', { name: nomeRegex(FORTE.tm.name) })).toBeTruthy()
    expect(screen.queryByRole('radio', { name: nomeRegex(FRACA.tm.name) })).toBeNull()
  })

  it('ordena por poder do golpe, maior primeiro por padrao, e inverte ao clicar', () => {
    render(<TmsTab />)
    const radios = () => screen.getAllByRole('radio')
    // Padrao: sortDesc=true, a mais forte vem primeiro na grade.
    expect(radios()[0].getAttribute('aria-label')).toContain(FORTE.tm.name)

    fireEvent.click(screen.getByRole('button', { name: /poder primeiro/ }))
    expect(radios()[0].getAttribute('aria-label')).toContain(FRACA.tm.name)
  })
})
