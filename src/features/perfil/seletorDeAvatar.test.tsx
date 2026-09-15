// @vitest-environment jsdom
// PH-548: escolher a foto grava pela RPC e reflete no cache — e o cache e o
// que a HUD, o ranking e o resto leem. Sem isso a foto "trocava" so ate o F5.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const rpc = vi.hoisted(() => ({ definirAvatar: vi.fn(), avataresDe: vi.fn() }))
vi.mock('@/data/remote/avatarRpc', () => rpc)

import { useAvatarStore } from '@/stores/avatarStore'
import { SeletorDeAvatar } from './SeletorDeAvatar'
import { AvatarDoTreinador } from '@/components/shared/AvatarDoTreinador'

const EU = 'u-eu'

describe('seletor de foto de perfil (PH-548)', () => {
  beforeEach(() => {
    useAvatarStore.getState().reiniciar()
    rpc.definirAvatar.mockReset()
    rpc.avataresDe.mockReset()
    rpc.avataresDe.mockResolvedValue(new Map())
  })
  afterEach(cleanup)

  it('clicar num retrato chama a RPC e o cache passa a devolver o id', async () => {
    rpc.definirAvatar.mockImplementation(async (id: string | null) => id)
    const aoFechar = vi.fn()
    render(<SeletorDeAvatar userId={EU} atual={null} aoFechar={aoFechar} />)
    await userEvent.click(screen.getByRole('button', { name: 'Lance' }))
    expect(rpc.definirAvatar).toHaveBeenCalledWith('lance')
    expect(useAvatarStore.getState().porUsuario[EU]).toBe('lance')
    expect(aoFechar).toHaveBeenCalled()
  })

  it('"Sem foto" grava null', async () => {
    rpc.definirAvatar.mockImplementation(async (id: string | null) => id)
    render(<SeletorDeAvatar userId={EU} atual="lance" aoFechar={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Sem foto' }))
    expect(rpc.definirAvatar).toHaveBeenCalledWith(null)
    expect(useAvatarStore.getState().porUsuario[EU]).toBeNull()
  })

  it('RPC recusada nao mexe no cache', async () => {
    rpc.definirAvatar.mockRejectedValue(new Error('Avatar invalido.'))
    useAvatarStore.getState().lembrar([[EU, 'red']])
    render(<SeletorDeAvatar userId={EU} atual="red" aoFechar={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Ash' }))
    expect(useAvatarStore.getState().porUsuario[EU]).toBe('red')
  })

  it('o componente de foto desenha o retrato do cache e pede em lote o que falta', async () => {
    rpc.avataresDe.mockResolvedValue(new Map([['u-a', 'blue'], ['u-b', null]]))
    const { container } = render(
      <>
        <AvatarDoTreinador userId="u-a" nome="A" />
        <AvatarDoTreinador userId="u-b" nome="B" />
        <AvatarDoTreinador userId="u-a" nome="A de novo" />
      </>,
    )
    // Tres componentes, dois ids distintos, UMA consulta.
    await vi.waitFor(() => expect(rpc.avataresDe).toHaveBeenCalledTimes(1))
    expect(rpc.avataresDe.mock.calls[0][0].sort()).toEqual(['u-a', 'u-b'])
    await vi.waitFor(() => expect(container.querySelectorAll('img[src="assets/treinadores/blue.png"]').length).toBe(2))
    // Sem foto: icone generico, e NAO um novo pedido.
    expect(container.querySelectorAll('img').length).toBe(2)
    expect(rpc.avataresDe).toHaveBeenCalledTimes(1)
  })
})
