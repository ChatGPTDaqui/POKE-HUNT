// Para onde o Mercado deve abrir (28/10/2026, "Ver no mercado").
//
// A ficha do POKE na Mochila e OUTRA janela. Em vez de passar prop entre
// janelas (que nao tem pai em comum), quem quer mandar o jogador pro Mercado
// grava aqui o grupo e pede a tela; o MercadoMenu le, abre a pagina do grupo e
// consome o pedido. `pedido` e um contador: pedir o MESMO grupo duas vezes (o
// jogador voltou pra vitrine e clicou de novo) precisa reabrir a pagina.
import { create } from 'zustand'
import type { GrupoDaVitrine } from '@/data/remote/mercadoRpc'

export type GrupoAberto = Pick<GrupoDaVitrine, 'speciesId' | 'isShiny' | 'ivFaixa' | 'currency'>

interface MercadoState {
  /** Pagina de grupo aberta na aba Comprar > Pokémon; `null` = vitrine. */
  grupoAberto: GrupoAberto | null
  /** Incrementa a cada pedido de fora ("Ver no mercado"). */
  pedido: number
  abrirGrupo: (g: GrupoAberto) => void
  fecharGrupo: () => void
  /** De fora do Mercado: abre o grupo E pede que o menu va pra Comprar > Pokémon. */
  verNoMercado: (g: GrupoAberto) => void
  /** 'Anunciar o meu' da pagina do grupo: vai pra Vender > Pokémon com um desse grupo escolhido. */
  vendaPedida: GrupoAberto | null
  pedidoDeVenda: number
  pedirVenda: (g: GrupoAberto) => void
}

export const useMercadoStore = create<MercadoState>((set) => ({
  grupoAberto: null,
  pedido: 0,
  abrirGrupo: (g) => set({ grupoAberto: g }),
  fecharGrupo: () => set({ grupoAberto: null }),
  verNoMercado: (g) => set((s) => ({ grupoAberto: g, pedido: s.pedido + 1 })),
  vendaPedida: null,
  pedidoDeVenda: 0,
  pedirVenda: (g) => set((s) => ({ vendaPedida: g, pedidoDeVenda: s.pedidoDeVenda + 1 })),
}))
