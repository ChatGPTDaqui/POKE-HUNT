// Skin do treinador em campo, por jogador (08/10; servidor desde 09/10).
//
// 08/10 a escolha vivia so no localStorage: bastava pro treinador que anda
// atras do proprio POKE. 09/10 os duelos de PvP passaram a mostrar o treinador
// do RIVAL, e ninguem le o navegador do outro — a skin foi pro servidor, no
// molde da foto de perfil (`avatarStore`): cache por `user_id`, pedidos do
// mesmo tick viram uma consulta so a `treinadores_publico`.
//
// O localStorage ficou como copia LOCAL da propria escolha: o campo mostra a
// skin certa antes da resposta do servidor (e sem rede), e quem escolheu na
// 7.88 tem a escolha levada pro servidor uma vez (`sincronizarMinha`).
//
// NAO e o GameState: aquele estado e do servidor de autoridade, e a resposta
// dele sobrescreve o local — uma escolha gravada la seria apagada no flush.
import { create } from 'zustand'
import { skinValida } from '@/data/skinsDoTreinador'
import { definirSkin, skinsDe } from '@/data/remote/skinRpc'

const CHAVE = 'novo-poke-idle:skin-do-treinador'

function lerLocal(): Record<string, string> {
  try {
    const bruto = localStorage.getItem(CHAVE)
    const v = bruto ? JSON.parse(bruto) : null
    return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, string> : {}
  } catch {
    // Safari privado lanca no acesso; JSON corrompido idem. Volta a padrao.
    return {}
  }
}

function gravarLocal(userId: string, skin: string): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify({ ...lerLocal(), [userId]: skin }))
  } catch {
    // Sem armazenamento: vale o cache em memoria e o servidor.
  }
}

interface SkinDoTreinadorStore {
  /** `undefined` = ainda nao sabemos; `null` = o servidor diz "sem skin" (padrao). */
  porUsuario: Record<string, string | null>
  /** Registra o interesse; a busca sai no proximo microtask, em lote. */
  pedir: (userId: string) => void
  /** Troca na hora (cache + copia local) e grava no servidor. Lanca se o servidor recusar. */
  definirMeu: (userId: string, skin: string) => Promise<void>
  /** Uma vez por sessao: le a propria skin do servidor e sobe a escolha local se o servidor nao tiver. */
  sincronizarMinha: (userId: string) => Promise<void>
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
    const mapa = await skinsDe(ids)
    useSkinDoTreinadorStore.getState().lembrar(ids.map((id) => [id, mapa.get(id) ?? null]))
  } catch {
    // Falha de rede: fica `undefined` e o proximo pedido repete. Skin e
    // cosmetico — o boneco aparece com a padrao enquanto isso.
  } finally {
    for (const id of ids) emVoo.delete(id)
  }
}

export const useSkinDoTreinadorStore = create<SkinDoTreinadorStore>((set, get) => ({
  porUsuario: lerLocal(),
  pedir: (userId) => {
    if (!userId || userId in get().porUsuario || emVoo.has(userId)) return
    pendentes.add(userId)
    if (!agendado) {
      agendado = true
      void Promise.resolve().then(despachar)
    }
  },
  definirMeu: async (userId, skin) => {
    const valida = skinValida(skin)
    set((s) => ({ porUsuario: { ...s.porUsuario, [userId]: valida } }))
    gravarLocal(userId, valida)
    await definirSkin(valida)
  },
  sincronizarMinha: async (userId) => {
    const local = lerLocal()[userId]
    try {
      const doServidor = (await skinsDe([userId])).get(userId) ?? null
      if (doServidor) {
        get().lembrar([[userId, doServidor]])
        gravarLocal(userId, skinValida(doServidor))
      } else if (local) {
        // Escolha feita na 7.88 (so local): leva pro servidor, pro rival ver.
        await definirSkin(skinValida(local))
      }
    } catch {
      // Sem servidor agora: o campo segue com a copia local.
    }
  },
  lembrar: (entradas) => set((s) => {
    const porUsuario = { ...s.porUsuario }
    for (const [id, skin] of entradas) porUsuario[id] = skin
    return { porUsuario }
  }),
  reiniciar: () => {
    pendentes = new Set()
    agendado = false
    emVoo.clear()
    set({ porUsuario: {} })
  },
}))

/** Skin a desenhar pra uma conta: padrao sem conta, sem escolha ou com id desconhecido. */
export function skinDe(porUsuario: Record<string, string | null>, userId: string | null | undefined): string {
  return skinValida(userId ? porUsuario[userId] : null)
}
