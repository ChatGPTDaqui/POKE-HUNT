// Titulo de OUTROS treinadores (21/10/2026), pro duelo PvP desenhar o titulo do
// rival no campo. Mesmo desenho do cache de skins: `pedir` busca uma vez por
// usuario; o laco de desenho le `porUsuario` sem esperar.
import { create } from 'zustand'
import { conquistasPublicas } from '@/data/remote/conquistasRpc'

interface TitulosPublicosState {
  porUsuario: Record<string, string | null>
  pedir: (userId: string) => void
}

const pedidos = new Set<string>()

export const useTitulosPublicosStore = create<TitulosPublicosState>((set) => ({
  porUsuario: {},
  pedir: (userId) => {
    if (pedidos.has(userId)) return
    pedidos.add(userId)
    conquistasPublicas(userId)
      .then((c) => set((s) => ({ porUsuario: { ...s.porUsuario, [userId]: c.titulo } })))
      .catch(() => { pedidos.delete(userId) })
  },
}))
