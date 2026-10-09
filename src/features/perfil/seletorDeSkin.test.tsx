// @vitest-environment jsdom
// Skin do treinador em campo (08/10): a escolha vale na hora, fica gravada por
// conta no aparelho e toda skin do catalogo tem as duas folhas no repositorio.
import { existsSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SKINS_DO_TREINADOR, SKIN_PADRAO, folhaDaSkin, skinValida } from '@/data/skinsDoTreinador'
import { skinDe, useSkinDoTreinadorStore } from '@/stores/skinDoTreinadorStore'
import { SeletorDeSkin } from './SeletorDeSkin'

const EU = 'u-eu'
const OUTRO = 'u-outro'

describe('skins do treinador em campo', () => {
  beforeEach(() => {
    localStorage.clear()
    useSkinDoTreinadorStore.setState({ porUsuario: {} })
  })
  afterEach(cleanup)

  it('toda skin do catalogo tem Walk e Idle em assets/', () => {
    for (const s of SKINS_DO_TREINADOR) {
      expect(existsSync(folhaDaSkin(s.id, 'Walk')), s.id).toBe(true)
      expect(existsSync(folhaDaSkin(s.id, 'Idle')), s.id).toBe(true)
    }
  })

  it('id desconhecido cai na skin padrao', () => {
    expect(skinValida('nao-existe')).toBe(SKIN_PADRAO)
    expect(skinValida(null)).toBe(SKIN_PADRAO)
    expect(folhaDaSkin('../../segredo', 'Walk')).toBe(folhaDaSkin(SKIN_PADRAO, 'Walk'))
  })

  it('clicar troca a skin da conta, grava no aparelho e nao mexe na de outra conta', async () => {
    render(<SeletorDeSkin userId={EU} />)
    expect(screen.getByRole('button', { name: 'Mochileiro' }).getAttribute('aria-pressed')).toBe('true')
    await userEvent.click(screen.getByRole('button', { name: 'Cynthia' }))
    const { porUsuario } = useSkinDoTreinadorStore.getState()
    expect(skinDe(porUsuario, EU)).toBe('cynthia')
    expect(skinDe(porUsuario, OUTRO)).toBe(SKIN_PADRAO)
    expect(JSON.parse(localStorage.getItem('novo-poke-idle:skin-do-treinador')!)).toEqual({ [EU]: 'cynthia' })
    expect(screen.getByRole('button', { name: 'Cynthia' }).getAttribute('aria-pressed')).toBe('true')
  })
})
