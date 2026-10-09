// Skin escolhida pro treinador em campo (08/10).
//
// localStorage, por aparelho, e nao o GameState: o GameState e do servidor de
// autoridade (a resposta dele sobrescreve o local, e uma escolha gravada la
// seria apagada no primeiro flush — mesma razao das preferencias do uiStore).
// E nao uma coluna no banco como a foto de perfil: o treinador em campo so
// aparece pro proprio jogador, entao ninguem mais precisa ler a escolha.
//
// Guardada POR CONTA (`user_id`): duas contas no mesmo navegador nao trocam a
// skin uma da outra.
import { create } from 'zustand'
import { skinValida } from '@/data/skinsDoTreinador'

const CHAVE = 'novo-poke-idle:skin-do-treinador'

function lerTudo(): Record<string, string> {
  try {
    const bruto = localStorage.getItem(CHAVE)
    const v = bruto ? JSON.parse(bruto) : null
    return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, string> : {}
  } catch {
    // Safari privado lanca no acesso; JSON corrompido idem. Volta a padrao.
    return {}
  }
}

interface SkinDoTreinadorStore {
  porUsuario: Record<string, string>
  definir: (userId: string, skin: string) => void
}

export const useSkinDoTreinadorStore = create<SkinDoTreinadorStore>((set, get) => ({
  porUsuario: lerTudo(),
  definir: (userId, skin) => {
    const porUsuario = { ...get().porUsuario, [userId]: skinValida(skin) }
    set({ porUsuario })
    try {
      localStorage.setItem(CHAVE, JSON.stringify(porUsuario))
    } catch {
      // Sem armazenamento: a troca vale ate recarregar a pagina.
    }
  },
}))

/** Skin da conta (padrao sem conta ou sem escolha). */
export function skinDe(porUsuario: Record<string, string>, userId: string | null | undefined): string {
  return skinValida(userId ? porUsuario[userId] : null)
}
