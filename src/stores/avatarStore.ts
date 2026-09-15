// Cache de foto de perfil por jogador (PH-548).
//
// Toda tela que mostra um nome (ranking, mercado, amigos, chat, PvP) pede o
// avatar pelo `user_id`; a resposta e um id de `src/data/avatares.ts` ou
// `null`. Pedidos que chegam no mesmo tick viram UMA consulta a
// `treinadores_publico` (lote), e o que ja veio nao e pedido de novo — uma
// lista de 50 linhas do ranking custa uma ida ao banco, nao cinquenta.
//
// `undefined` no mapa = ainda nao perguntamos; `null` = perguntamos e nao tem
// foto. A distincao e o que impede o componente de repedir para sempre um
// jogador sem avatar.
import { create } from 'zustand'
import { avataresDe, definirAvatar } from '@/data/remote/avatarRpc'

interface AvatarStore {
  porUsuario: Record<string, string | null>
  /** Registra o interesse; a busca sai no proximo microtask, em lote. */
  pedir: (userId: string) => void
  /** Grava no servidor e reflete no cache do proprio jogador. */
  definirMeu: (userId: string, avatar: string | null) => Promise<void>
  /** Injeta valores ja conhecidos (ex.: vieram na mesma consulta do ranking). */
  lembrar: (entradas: Iterable<[string, string | null]>) => void
  /** So pra teste. */
  reiniciar: () => void
}

let pendentes = new Set<string>()
let agendado = false
const emVoo = new Set<string>()

async function despachar(): Promise<void> {
  agendado = false
  const ids = [...pendentes].filter((id) => !emVoo.has(id))
  pendentes = new Set()
  if (ids.length === 0) return
  for (const id of ids) emVoo.add(id)
  try {
    const mapa = await avataresDe(ids)
    useAvatarStore.getState().lembrar(ids.map((id) => [id, mapa.get(id) ?? null]))
  } catch {
    // Falha de rede: fica `undefined`, e o proximo componente que montar
    // repete o pedido. Sem toast — foto e cosmetico, o nome ja esta na tela.
  } finally {
    for (const id of ids) emVoo.delete(id)
  }
}

export const useAvatarStore = create<AvatarStore>((set, get) => ({
  porUsuario: {},
  pedir: (userId) => {
    if (!userId || userId in get().porUsuario || emVoo.has(userId)) return
    pendentes.add(userId)
    if (!agendado) {
      agendado = true
      void Promise.resolve().then(despachar)
    }
  },
  definirMeu: async (userId, avatar) => {
    const gravado = await definirAvatar(avatar)
    set((s) => ({ porUsuario: { ...s.porUsuario, [userId]: gravado } }))
  },
  lembrar: (entradas) => set((s) => {
    const porUsuario = { ...s.porUsuario }
    for (const [id, avatar] of entradas) porUsuario[id] = avatar
    return { porUsuario }
  }),
  reiniciar: () => {
    pendentes = new Set()
    agendado = false
    emVoo.clear()
    set({ porUsuario: {} })
  },
}))
