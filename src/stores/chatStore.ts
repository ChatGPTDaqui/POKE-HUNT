// Chat Mundo — as mensagens que outros JOGADORES escreveram.
//
// Store separada do `toastStore` de proposito. O toastStore e o log LOCAL do
// jogo (combate, compra, aviso de sistema): nasce e morre na aba, nunca sai do
// aparelho. Isto aqui e rede: tem autor, tem servidor, tem falha de conexao e
// chega ao vivo por Realtime. Misturar as duas coisas na mesma store faria
// toda mensagem de combate parecer candidata a ser enviada pra outra pessoa.
//
// Pedido explicito do usuario: "isole o Chat Mundo para que ele receba apenas
// mensagens ao vivo enviadas por outros jogadores". Os avisos do jogo que antes
// caiam na aba "Mundo" foram pra aba "Sistema" (ver toastStore#CHANNEL_TO_TAB).
import { create } from 'zustand'
import { ErroServidor, type AnexoChat, type MensagemChat } from '@/data/remote/servidor'
import { lerChat, enviarChat, assinarChatAoVivo } from '@/data/remote/chatRealtime'

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
  enviar: () => Promise<void>
  /** Carrega o historico e assina o canal ao vivo. Devolve a funcao de parar —
   *  quem liga e o componente do chat, que ja sabe quando some da tela. */
  iniciarAoVivo: () => () => void
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
      if (s.anexos.length >= 3) return s // o banco tambem corta em 3
      const separador = s.rascunho && !s.rascunho.endsWith(' ') ? ' ' : ''
      return { anexos: [...s.anexos, anexo], rascunho: `${s.rascunho}${separador}${rotulo} ` }
    })
  },

  enviar: async () => {
    const { rascunho, anexos } = get()
    const corpo = rascunho.trim()
    if (!corpo) return
    set({ carregando: true })
    try {
      // So vao os anexos cujo rotulo AINDA esta no texto. Sem isto, apagar o
      // "[Charmander Lv12]" do input e mandar outra frase enviaria o POKE
      // colado numa mensagem que nao fala dele.
      const vivos = anexos.filter((a) => corpo.includes(a.nome))
      await enviarChat(corpo, vivos)
      // Sem `set({mensagens: [...]})` aqui: o proprio remetente tambem esta
      // assinado no canal ao vivo, a mensagem volta por ele — mesmo caminho
      // pra "eu mandei" e "outro jogador mandou", sem duplicar logica.
      set({ rascunho: '', anexos: [], erro: null })
    } catch (erro) {
      set({ erro: erro instanceof ErroServidor ? erro.message : 'nao foi possivel enviar' })
    } finally {
      set({ carregando: false })
    }
  },

  iniciarAoVivo: () => {
    let vivo = true
    void lerChat().then(({ mensagens }) => { if (vivo) set({ mensagens, erro: null }) })
      .catch((erro) => { if (vivo) set({ erro: erro instanceof ErroServidor ? erro.message : 'chat indisponivel' }) })

    const pararCanal = assinarChatAoVivo((mensagem) => {
      set((s) => (s.mensagens.some((m) => m.id === mensagem.id) ? s : { mensagens: [...s.mensagens, mensagem] }))
    })
    return () => { vivo = false; pararCanal() }
  },
}))

/** Rotulo curto que vai no texto da mensagem (o "link" que o jogador ve). */
export function rotuloDeAnexo(anexo: AnexoChat): string {
  if (anexo.kind === 'poke') return `[${anexo.nome} Lv${anexo.level ?? 1}]`
  return `[${anexo.nome}${anexo.quantidade ? ` x${anexo.quantidade}` : ''}]`
}
