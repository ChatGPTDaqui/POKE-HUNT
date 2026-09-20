// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useMochilaStore } from '@/stores/mochilaStore'
import { PvpBuildTab } from './PvpBuildTab'
import * as rpc from '@/data/remote/pvpRpc'

vi.mock('@/data/remote/pvpRpc', () => ({ meusPresetsPvp: vi.fn(), salvarPresetPvp: vi.fn(), ativarPresetPvp: vi.fn() }))
const charizard = createPokeInstance(createRng(1), 'charizard', 80, { uid: 'charizard-1' })
const lapras = createPokeInstance(createRng(2), 'lapras', 82, { uid: 'lapras-1' })
charizard.golpesDeMaquina = ['earthquake']
charizard.unlockedAbilities = [...new Set([...charizard.unlockedAbilities, 'earthquake'])]

function preset(tipo: rpc.TipoPresetPvp, posicao: number, extra: Partial<rpc.PresetPvp> = {}): rpc.PresetPvp {
  return { tipo, posicao, nome: '', slots: [], ativo: posicao === 1, atualizadoEm: '', ...extra }
}
function presets(extra: Partial<Record<string, Partial<rpc.PresetPvp>>> = {}): rpc.PresetPvp[] {
  return (['ataque', 'defesa'] as const).flatMap((tipo) => [1, 2, 3].map((pos) => preset(tipo, pos, extra[`${tipo}${pos}`])))
}
const ultimoSalvo = () => vi.mocked(rpc.salvarPresetPvp).mock.calls.at(-1)![0]

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  useGameStateStore.setState({ team: [charizard], bagPokes: [lapras] })
  useMochilaStore.setState({ carregada: true, erro: null })
  vi.mocked(rpc.meusPresetsPvp).mockResolvedValue(presets({ ataque1: { slots: [{ pokemonId: charizard.uid, golpes: [] }] } }))
  vi.mocked(rpc.salvarPresetPvp).mockImplementation(async (p) => ({ ...preset(p.tipo, p.posicao), ...p, ativo: p.posicao === 1 }))
  vi.mocked(rpc.ativarPresetPvp).mockImplementation(async (tipo, posicao) => preset(tipo, posicao, { ativo: true }))
})
afterEach(() => { cleanup(); vi.useRealTimers() })

async function esperarDebounce() {
  await act(async () => { await vi.advanceTimersByTimeAsync(450) })
}

describe('Formação PvP com presets', () => {
  it('adiciona um POKE ao preset ativo e salva depois do debounce', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<PvpBuildTab />)
    await user.click(await screen.findByRole('button', { name: 'Adicionar Pokémon ao slot 2' }))
    const busca = screen.getByRole('textbox', { name: 'Buscar Pokémon para PvP' })
    expect(document.activeElement).toBe(busca)
    await user.type(busca, 'lap')
    const lista = screen.getByRole('region', { name: 'Escolher Pokémon para slot 2' })
    await user.click(within(lista).getByRole('button', { name: /Lapras.*Lv 82/ }))
    expect(screen.getByRole('button', { name: 'Remover Lapras do time' })).toBeTruthy()
    expect(rpc.salvarPresetPvp).not.toHaveBeenCalled()
    await esperarDebounce()
    expect(rpc.salvarPresetPvp).toHaveBeenCalledTimes(1)
    expect(ultimoSalvo()).toMatchObject({ tipo: 'ataque', posicao: 1, slots: [{ pokemonId: charizard.uid, golpes: [] }, { pokemonId: lapras.uid, golpes: [] }] })
  })

  it('volta ao estado do servidor quando o salvamento falha', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    vi.mocked(rpc.salvarPresetPvp).mockRejectedValue(new Error('Falha simulada'))
    render(<PvpBuildTab />)
    await user.click(await screen.findByRole('button', { name: 'Adicionar Pokémon ao slot 2' }))
    await user.click(screen.getByRole('button', { name: /Lapras.*Lv 82/ }))
    expect(screen.getByRole('button', { name: 'Remover Lapras do time' })).toBeTruthy()
    await esperarDebounce()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Remover Lapras do time' })).toBeNull())
    expect(screen.getByText('Charizard')).toBeTruthy()
    expect(rpc.meusPresetsPvp).toHaveBeenCalledTimes(2)
  })

  it('escolhe golpes do slot, inclusive de TM, e "usar golpes do POKE" zera', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<PvpBuildTab />)
    await user.click(await screen.findByRole('button', { name: 'Golpes' }))
    const editor = screen.getByRole('region', { name: 'Golpes do slot 1' })
    const earthquake = within(editor).getByRole('button', { name: /Earthquake.*TM/ })
    await user.click(earthquake)
    await user.click(within(editor).getByRole('button', { name: /Flamethrower/ }))
    expect(earthquake.getAttribute('aria-pressed')).toBe('true')
    await esperarDebounce()
    expect(ultimoSalvo().slots[0].golpes).toEqual(['earthquake', 'flamethrower'])
    await user.click(within(editor).getByRole('button', { name: 'Usar golpes do POKE' }))
    await esperarDebounce()
    expect(ultimoSalvo().slots[0].golpes).toEqual([])
  })

  it('não passa de 4 golpes por slot', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<PvpBuildTab />)
    await user.click(await screen.findByRole('button', { name: 'Golpes' }))
    const editor = screen.getByRole('region', { name: 'Golpes do slot 1' })
    const opcoes = within(editor).getAllByRole('button', { pressed: false })
    for (const b of opcoes.slice(0, 5)) await user.click(b)
    expect(within(editor).getAllByRole('button', { pressed: true })).toHaveLength(4)
  })

  it('ativa outro preset do mesmo tipo', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<PvpBuildTab />)
    const tabs = await screen.findByRole('tablist', { name: 'Times de ataque' })
    const botoes = within(tabs).getAllByRole('button', { name: 'Usar este' })
    expect(botoes).toHaveLength(2)
    await user.click(botoes[0])
    expect(rpc.ativarPresetPvp).toHaveBeenCalledWith('ataque', 2)
    await waitFor(() => expect(within(tabs).getAllByRole('button', { name: 'Usar este' })).toHaveLength(2))
    expect(within(tabs).getByText(/Time 2/).parentElement?.textContent).toContain('ATIVO')
  })

  it('avisa quando a defesa ativa está vazia e some ao montar', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<PvpBuildTab />)
    expect(await screen.findByRole('note')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Defesa' }))
    await user.click(screen.getByRole('button', { name: 'Adicionar Pokémon ao slot 1' }))
    await user.click(screen.getByRole('button', { name: /Lapras.*Lv 82/ }))
    await esperarDebounce()
    expect(ultimoSalvo()).toMatchObject({ tipo: 'defesa', posicao: 1 })
    await waitFor(() => expect(screen.queryByRole('note')).toBeNull())
  })

  it('reordena por teclado com o punho de arrastar', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    vi.mocked(rpc.meusPresetsPvp).mockResolvedValue(presets({ ataque1: { slots: [{ pokemonId: charizard.uid, golpes: [] }, { pokemonId: lapras.uid, golpes: [] }] } }))
    render(<PvpBuildTab />)
    const punhos = await screen.findAllByRole('button', { name: 'Arrastar para reordenar' })
    expect(punhos).toHaveLength(2)
    punhos[1].focus()
    await user.keyboard('{Enter}')
    await user.keyboard('{ArrowLeft}')
    await user.keyboard('{Enter}')
    await esperarDebounce()
    expect(ultimoSalvo().slots.map((s) => s.pokemonId)).toEqual([lapras.uid, charizard.uid])
  })

  it('slot cujo POKE não é mais do jogador mostra aviso e pode ser removido', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    vi.mocked(rpc.meusPresetsPvp).mockResolvedValue(presets({ ataque1: { slots: [{ pokemonId: 'sumiu', golpes: [] }, { pokemonId: charizard.uid, golpes: [] }] } }))
    render(<PvpBuildTab />)
    expect(await screen.findByText('POKE não está mais com você')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Remover slot 1' }))
    await esperarDebounce()
    expect(ultimoSalvo().slots.map((s) => s.pokemonId)).toEqual([charizard.uid])
  })

  it('falha de leitura mostra recuperação e não uma formação vazia', async () => {
    vi.mocked(rpc.meusPresetsPvp).mockRejectedValueOnce(new Error('offline'))
    render(<PvpBuildTab />)
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Adicionar Pokémon/ })).toBeNull()
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByText('Charizard')).toBeTruthy()
  })
})
