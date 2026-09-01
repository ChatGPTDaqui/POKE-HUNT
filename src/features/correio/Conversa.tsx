// O fio de conversa com um contato (PH-81) — o miolo do correio novo.
//
// Herdeiro direto do `ConversaDM.tsx` de PH-74, que fazia isto so pra amigo e
// so pra `friend_messages`. O que mudou: a fonte agora e `mail_messages` (a
// mesma do resto do correio), o contato pode ser qualquer jogador, e a
// mensagem pode levar anexo de ouro/item — que e coletado aqui dentro, no fio,
// em vez de numa caixa separada.
//
// Estado local em vez de TanStack Query, pelo mesmo motivo de antes: o fio
// cresce por DUAS fontes (paginar pra tras e chegada por Realtime) e encolhe
// por nenhuma. Uma query com `invalidate` a cada mensagem recebida jogaria fora
// o historico ja paginado e devolveria a rolagem pro fim a cada linha nova.
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUp, Gift, PaperPlaneRight } from '@phosphor-icons/react'
import { GameButton, GameInput, SectionLabel } from '@/components/game/controls'
import { getItem } from '@/data/items'
import { itemIconUrl } from '@/data/sprites'
import { ErroServidor, detalheDeErro } from '@/data/remote/servidor'
import type { MensagemCorreio } from '@/data/remote/servidor'
import * as correio from '@/data/remote/correioRealtime'
import { useToastStore, type ToastErroDetalhe } from '@/stores/toastStore'
import { cn } from '@/lib/utils'

/** Mesmo teto do `enviar_mensagem` no banco. */
export const MAX_MENSAGEM = 1000

function toast(mensagem: string, tipo: 'success' | 'error' = 'success', erroDetalhe?: ToastErroDetalhe) {
  useToastStore.getState().pushToast(mensagem, tipo, 'world', undefined, erroDetalhe)
}

/** O minimo pra abrir um fio — serve tanto pra `ConversaResumo` quanto pra amigo. */
export interface Contato {
  userId: string
  nick: string
  online?: boolean
}

interface Props {
  contato: Contato
  meuId: string
  /** Avisa a tela-mae pra recontar os badges depois de marcar lidas. */
  aoMarcarLidas: () => void
}

export function Conversa({ contato, meuId, aoMarcarLidas }: Props) {
  const [mensagens, setMensagens] = useState<MensagemCorreio[]>([])
  const [temMais, setTemMais] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [carregandoMais, setCarregandoMais] = useState(false)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [coletando, setColetando] = useState<string | null>(null)
  const fimDoFio = useRef<HTMLDivElement>(null)

  // Carga inicial + marcar lidas. Refaz ao trocar de contato.
  useEffect(() => {
    let cancelado = false
    setCarregando(true)
    setMensagens([])
    void correio.lerConversa(contato.userId)
      .then(async (r) => {
        if (cancelado) return
        setMensagens(r.mensagens)
        setTemMais(r.temMais)
        // So chama a RPC se ha o que marcar — abrir um fio ja lido nao precisa
        // de round-trip nem de invalidar o badge da tela-mae.
        if (r.mensagens.some((m) => m.de_id === contato.userId && !m.excluido_destinatario_em && m.estado === 'pendente')) {
          await correio.marcarConversaLida(contato.userId)
          if (!cancelado) aoMarcarLidas()
        }
      })
      .catch((e) => {
        if (!cancelado) toast(e instanceof ErroServidor ? e.message : 'Não foi possível abrir a conversa.', 'error', detalheDeErro(e))
      })
      .finally(() => { if (!cancelado) setCarregando(false) })
    return () => { cancelado = true }
  }, [contato.userId, aoMarcarLidas])

  // Realtime: so o que CHEGA. O eco das minhas sai do retorno de
  // `enviarMensagem`, entao a mensagem aparece mesmo com o socket caido.
  useEffect(() => {
    // Sufixo proprio: o menu ja tem um canal `correio-<id>-menu` vivo, e
    // reusar o nome faria o `.on()` estourar em cima do canal ja inscrito.
    const parar = correio.assinarCorreioAoVivo(meuId, () => {}, (m) => {
      if (m.de_id !== contato.userId || m.tipo !== 'texto') return
      // O guard de id evita linha duplicada se o socket entregar duas vezes
      // (reconexao reenvia o backlog).
      setMensagens((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))
      void correio.marcarConversaLida(contato.userId).then(aoMarcarLidas).catch(() => {})
    }, 'fio')
    return parar
  }, [contato.userId, meuId, aoMarcarLidas])

  // Rola pro fim quando o fio cresce por baixo. Nao roda ao paginar pra tras:
  // ali o jogador esta olhando o topo e jogar a rolagem pro fim desfaria o
  // gesto que ele acabou de fazer.
  useEffect(() => {
    if (!carregandoMais) fimDoFio.current?.scrollIntoView({ block: 'nearest' })
  }, [mensagens, carregandoMais])

  const carregarMais = useCallback(async () => {
    if (!mensagens.length || carregandoMais) return
    setCarregandoMais(true)
    try {
      const r = await correio.lerConversa(contato.userId, mensagens[0].created_at)
      setMensagens((prev) => [...r.mensagens, ...prev])
      setTemMais(r.temMais)
    } catch (e) {
      toast(e instanceof ErroServidor ? e.message : 'Não foi possível carregar o histórico.', 'error', detalheDeErro(e))
    } finally {
      setCarregandoMais(false)
    }
  }, [contato.userId, mensagens, carregandoMais])

  async function enviar() {
    const corpo = texto.trim()
    if (!corpo || enviando) return
    setEnviando(true)
    try {
      const { id } = await correio.enviarMensagem({ paraId: contato.userId }, corpo)
      setMensagens((prev) => [...prev, {
        id,
        de_id: meuId,
        de_nome: '',
        para_id: contato.userId,
        tipo: 'texto',
        assunto: null,
        corpo,
        estado: 'pendente',
        created_at: new Date().toISOString(),
      }])
      setTexto('')
    } catch (e) {
      toast(e instanceof ErroServidor ? e.message : 'Não foi possível enviar.', 'error', detalheDeErro(e))
    } finally {
      setEnviando(false)
    }
  }

  async function coletar(mensagemId: string) {
    setColetando(mensagemId)
    try {
      const r = await correio.coletarAnexo(mensagemId)
      toast(r.mensagem)
      const agora = new Date().toISOString()
      setMensagens((prev) => prev.map((m) => (m.id === mensagemId ? { ...m, anexo_coletado_em: agora } : m)))
      aoMarcarLidas()
    } catch (e) {
      toast(e instanceof ErroServidor ? e.message : 'Não foi possível coletar.', 'error', detalheDeErro(e))
    } finally {
      setColetando(null)
    }
  }

  return (
    <div className="flex min-h-[18em] flex-col gap-[.4em]">
      <div className="flex items-center gap-[.4em]">
        <span
          aria-hidden
          className={cn('h-[.5em] w-[.5em] rounded-full', contato.online ? 'bg-ok' : 'bg-n600')}
        />
        <b className="font-medium">{contato.nick}</b>
        {contato.online !== undefined && (
          <span className="text-[.75em] text-n400">{contato.online ? 'online' : 'offline'}</span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-[.3em] overflow-y-auto rounded-[.5em] border border-n800 bg-n900 p-[.5em]">
        {temMais && (
          <GameButton variant="ghost" carregando={carregandoMais} onClick={() => void carregarMais()}>
            <ArrowUp /> Ver mensagens anteriores
          </GameButton>
        )}
        {carregando && <p className="text-[.8em] text-n400">Carregando conversa...</p>}
        {!carregando && mensagens.length === 0 && (
          <p className="text-[.8em] text-n400">
            Nenhuma mensagem ainda. Diga oi para {contato.nick}.
          </p>
        )}
        {mensagens.map((m) => {
          const minha = m.de_id === meuId
          const anexos = m.anexo_itens ?? []
          // So o DESTINATARIO coleta, e so uma vez. Do lado de quem mandou o
          // anexo aparece como registro do que saiu, sem botao.
          const podeColetar = !minha && anexos.length > 0 && !m.anexo_coletado_em
          return (
            <div key={m.id} className={cn('flex', minha ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[80%] rounded-[.5em] px-[.5em] py-[.3em] text-[.85em]',
                  minha ? 'bg-primary/20 text-foreground' : 'bg-n800 text-foreground',
                )}
              >
                <div className="whitespace-pre-wrap break-words">{m.corpo}</div>

                {anexos.length > 0 && (
                  <div className="mt-[.3em] flex flex-wrap items-center gap-[.3em] border-t border-n700 pt-[.3em]">
                    {anexos.map((a) => (
                      <span
                        key={a.itemId}
                        className="flex items-center gap-[.25em] rounded-[.35em] border border-n700 bg-n900 px-[.35em] py-[.1em] text-[.78em]"
                      >
                        <img
                          src={itemIconUrl(a.itemId) ?? undefined}
                          alt=""
                          aria-hidden
                          className="h-[1.2em] w-[1.2em] object-contain"
                          style={{ imageRendering: 'pixelated' }}
                        />
                        {getItem(a.itemId)?.name ?? a.itemId} x{a.quantity}
                      </span>
                    ))}
                    {podeColetar && (
                      <GameButton
                        variant="primary"
                        carregando={coletando === m.id}
                        onClick={() => void coletar(m.id)}
                      >
                        <Gift /> Coletar
                      </GameButton>
                    )}
                    {!podeColetar && m.anexo_coletado_em && (
                      <span className="text-[.72em] text-n500">coletado</span>
                    )}
                  </div>
                )}

                <div className="mt-[.15em] text-right text-[.68em] text-n500">
                  {new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={fimDoFio} />
      </div>

      <div className="flex items-end gap-[.35em]">
        <GameInput
          className="flex-1"
          aria-label={`Mensagem para ${contato.nick}`}
          placeholder="Escreva uma mensagem"
          maxLength={MAX_MENSAGEM}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void enviar() } }}
        />
        <GameButton variant="primary" carregando={enviando} disabled={!texto.trim()} onClick={() => void enviar()}>
          <PaperPlaneRight />
        </GameButton>
      </div>
      <SectionLabel className="self-end">{texto.length}/{MAX_MENSAGEM}</SectionLabel>
    </div>
  )
}
