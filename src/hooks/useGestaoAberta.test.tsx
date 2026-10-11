// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { useUiStore } from '@/stores/uiStore'
import { usePokeProfileStore } from '@/stores/pokeProfileStore'
import { useDiarioStore } from '@/stores/diarioStore'
import { useGestaoAberta } from './useGestaoAberta'
import { createPokeInstance, SPECIES } from '@/data/pokes'
import { createRng } from '@/core/rng'

function limpar() {
  useUiStore.setState({ currentScreen: null, moreOpen: false, perfilOpen: false,
    perfilPublicoAlvo: null, analyzerOpen: false, autoOpen: false })
  usePokeProfileStore.setState({ open: null })
  useDiarioStore.setState({ painelAberto: false })
}
beforeEach(limpar)
afterEach(() => { cleanup(); limpar() })

it.each(['perfilOpen', 'analyzerOpen', 'moreOpen'] as const)('libera área de consulta em %s e restaura ao fechar', (key) => {
  const hook = renderHook(useGestaoAberta)
  expect(hook.result.current).toBe(false)
  act(() => useUiStore.setState({ [key]: true }))
  expect(hook.result.current).toBe(true)
  act(() => useUiStore.setState({ [key]: false }))
  expect(hook.result.current).toBe(false)
})

it('não recolhe controles só por abrir Auto; Diário continua sendo gestão', () => {
  const hook = renderHook(useGestaoAberta)
  act(() => useUiStore.setState({ autoOpen: true }))
  expect(hook.result.current).toBe(false)
  act(() => useDiarioStore.setState({ painelAberto: true }))
  expect(hook.result.current).toBe(true)
})

it('acompanha ficha Pokémon, tela principal e perfil público sem alterar Auto', () => {
  const hook = renderHook(useGestaoAberta)
  const poke = createPokeInstance(createRng(17), 'bulbasaur', 5)
  act(() => usePokeProfileStore.getState().showProfile(poke, SPECIES.bulbasaur))
  expect(hook.result.current).toBe(true)
  act(() => usePokeProfileStore.getState().close())
  expect(hook.result.current).toBe(false)
  act(() => useUiStore.setState({ currentScreen: 'mochila' }))
  expect(hook.result.current).toBe(true)
  act(() => useUiStore.setState({ currentScreen: null, perfilPublicoAlvo: { userId: 'fixture', nome: 'Treinador' } }))
  expect(hook.result.current).toBe(true)
  act(() => useUiStore.setState({ perfilPublicoAlvo: null }))
  expect(hook.result.current).toBe(false)
})
