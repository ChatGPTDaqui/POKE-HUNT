// Cenas de evolucao e de ovo (08/11/2026, design aprovado pelo dono): tocam no
// campo da cacada, por baixo da HUD e dos menus, uma de cada vez.
//
// A cena recebe a PROMESSA do servidor e nao o resultado: o suspense comeca na
// hora do clique e a revelacao so acontece quando o servidor ja decidiu. Mesmo
// contrato do ovo desde 20/10/2026.
//
// MORA NUM STORE, e nao no componente que disparou: chocar tira o ovo da lista
// e desmonta o cartao que pediu, e evoluir pode fechar o menu da Equipe no
// celular. Com a cena presa no cartao, ela sumia junto.
import { create } from 'zustand'
import type { Ovo } from '@/data/ovos'
import type { Nascimento } from '@/data/remote/muralRpc'

export type ResultadoDaEvolucao = { ok: true } | { ok: false }

export type Cena =
  | {
      id: number
      tipo: 'evolucao'
      deId: string
      deNome: string
      paraId: string
      paraNome: string
      isShiny: boolean
      resultado: Promise<ResultadoDaEvolucao>
    }
  | { id: number; tipo: 'ovo'; ovo: Ovo; resultado: Promise<Nascimento> }

type NovaCena = Cena extends infer C ? (C extends Cena ? Omit<C, 'id'> : never) : never

interface CenaState {
  fila: Cena[]
  iniciar: (cena: NovaCena) => void
  terminar: (id: number) => void
}

let proximoId = 1

export const useCenaStore = create<CenaState>((set) => ({
  fila: [],
  iniciar: (cena) => set((s) => ({ fila: [...s.fila, { ...cena, id: proximoId++ } as Cena] })),
  terminar: (id) => set((s) => ({ fila: s.fila.filter((c) => c.id !== id) })),
}))
