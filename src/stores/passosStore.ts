// Quais Primeiros Passos o jogador já reivindicou.
//
// A fonte é `recompensa_concedida` (chave `passo:<id>`), gravada pela RPC
// `reivindicar_passo`. Fica num store próprio, e não no `GameStateData`, pelo
// mesmo motivo que as missões tiveram problema (PH-265): o estado do jogador
// viaja inteiro no flush da caçada, e uma lista que o servidor de sessão não lê
// voltaria vazia e apagaria a daqui. Aqui ninguém de fora escreve por cima.
import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

// O mesmo prefixo de `chaveDoPasso` (data/primeirosPassos.ts), escrito aqui
// para este store não puxar o catálogo de espécies para o chunk do login.
export const PREFIXO_DO_PASSO = 'passo:'
const PREFIXO = PREFIXO_DO_PASSO

interface PassosState {
  reivindicados: ReadonlySet<string>
  carregado: boolean
  carregar: () => Promise<void>
  marcar: (id: string) => void
  limpar: () => void
}

export const usePassosStore = create<PassosState>((set, get) => ({
  reivindicados: new Set(),
  carregado: false,

  carregar: async () => {
    const { data: sessao } = await supabase.auth.getSession()
    const uid = sessao.session?.user.id
    if (!uid) return
    const { data, error } = await supabase.from('recompensa_concedida')
      .select('chave').eq('user_id', uid).like('chave', `${PREFIXO}%`)
    // Falha de leitura NÃO marca carregado: a HUD esconde o cartão em vez de
    // oferecer de novo um passo que talvez já tenha sido pago.
    if (error) return console.error('passos: leitura falhou', error)
    set({ reivindicados: new Set((data ?? []).map(r => r.chave.slice(PREFIXO.length))), carregado: true })
  },

  marcar: (id) => set({ reivindicados: new Set(get().reivindicados).add(id) }),
  limpar: () => set({ reivindicados: new Set(), carregado: false }),
}))
