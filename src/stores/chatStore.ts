// Chat Mundo — as mensagens que outros JOGADORES escreveram.
//
// Store separada do `toastStore` de proposito. O toastStore e o log LOCAL do
// jogo (combate, compra, aviso de sistema): nasce e morre na aba, nunca sai do
// aparelho. Isto aqui e rede: tem autor, tem servidor, tem falha de conexao e
// tem polling. Misturar as duas coisas na mesma store faria toda mensagem de
// combate parecer candidata a ser enviada pra outra pessoa.
//
// Pedido explicito do usuario: "isole o Chat Mundo para que ele receba apenas
// mensagens ao vivo enviadas por outros jogadores". Os avisos do jogo que antes
// caiam na aba "Mundo" foram pra aba "Sistema" (ver toastStore#CHANNEL_TO_TAB).
import { create } from 'zustand'
import { servidor, servidorAtivo, ErroServidor, type AnexoChat, type MensagemChat } from '@/data/remote/servidor'

// De quanto em quanto tempo busca mensagem nova. Chat de jogo idle nao precisa
// de tempo real ao milissegundo, e cada leitura e um request autenticado — 6s
// da a sensacao de "ao vivo" sem transformar o chat no caminho mais caro do
// jogo.
const INTERVALO_POLL_MS = 6000

interface ChatState {
  mensagens: MensagemChat[]
  carregando: boolean
  erro: string | null
  /** Texto que o jogador esta digitando. Vive na store, e nao num useState do
   *  componente, porque o Shift+clique na Mochila/Equipe escreve nele de FORA
   *  do chat — de outro ponto da arvore, com o chat possivelmente fechado. */
  rascunho: string
  /** Links de item/POKE ja anexados ao rascunho. */
  anexos: AnexoChat[]
  setRascunho: (texto: string) => void
  anexar: (anexo: AnexoChat, rotulo: string) => void
  carregar: () => Promise<void>
  enviar: () => Promise<void>
  iniciarPolling: () => () => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  mensagens: [],
  carregando: false,
  erro: null,
  rascunho: '',
  anexos: [],

  setRascunho: (rascunho) => set({ rascunho }),

  anexar: (anexo, rotulo) => {
    set((s) => {
      // Mesmo alvo duas vezes nao vira dois anexos: o jogador que clica de novo
      // quer confirmar, nao duplicar.
      if (s.anexos.some((a) => a.kind === anexo.kind && a.id === anexo.id)) return s
      if (s.anexos.length >= 3) return s // o servidor tambem corta em 3
      const separador = s.rascunho && !s.rascunho.endsWith(' ') ? ' ' : ''
      return { anexos: [...s.anexos, anexo], rascunho: `${s.rascunho}${separador}${rotulo} ` }
    })
  },

  carregar: async () => {
    if (!servidorAtivo()) return
    try {
      const { mensagens } = await servidor.lerChat()
      set({ mensagens, erro: null })
    } catch (erro) {
      set({ erro: erro instanceof ErroServidor ? erro.message : 'chat indisponivel' })
    }
  },

  enviar: async () => {
    const { rascunho, anexos } = get()
    const corpo = rascunho.trim()
    if (!corpo || !servidorAtivo()) return
    set({ carregando: true })
    try {
      // So vao os anexos cujo rotulo AINDA esta no texto. Sem isto, apagar o
      // "[Charmander Lv12]" do input e mandar outra frase enviaria o POKE
      // colado numa mensagem que nao fala dele.
      const vivos = anexos.filter((a) => corpo.includes(a.nome))
      const { mensagens } = await servidor.enviarChat(corpo, vivos)
      set({ mensagens, rascunho: '', anexos: [], erro: null })
    } catch (erro) {
      set({ erro: erro instanceof ErroServidor ? erro.message : 'nao foi possivel enviar' })
    } finally {
      set({ carregando: false })
    }
  },

  // Devolve a funcao de parada — quem liga e o componente do chat, que ja sabe
  // quando some da tela.
  iniciarPolling: () => {
    if (!servidorAtivo()) return () => {}
    void get().carregar()
    const id = setInterval(() => { void get().carregar() }, INTERVALO_POLL_MS)
    return () => clearInterval(id)
  },
}))

/** Rotulo curto que vai no texto da mensagem (o "link" que o jogador ve). */
export function rotuloDeAnexo(anexo: AnexoChat): string {
  if (anexo.kind === 'poke') return `[${anexo.nome} Lv${anexo.level ?? 1}]`
  return `[${anexo.nome}${anexo.quantidade ? ` x${anexo.quantidade}` : ''}]`
}
