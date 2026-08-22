// Fio de conversa privada com um amigo (PH-74).
//
// Estado local em vez de TanStack Query: o fio cresce por DUAS fontes (paginar
// pra tras e chegada por Realtime) e encolhe por nenhuma. Uma query com
// `invalidate` a cada mensagem recebida jogaria fora o historico ja paginado e
// devolveria a rolagem pro fim a cada linha nova.
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUp, PaperPlaneRight } from '@phosphor-icons/react'
import { GameButton, GameInput, SectionLabel } from '@/components/game/controls'
import { ErroServidor, detalheDeErro } from '@/data/remote/servidor'
import type { AmigoDetalhado, MensagemDM } from '@/data/remote/servidor'
import * as dm from '@/data/remote/dmRealtime'
import { useToastStore, type ToastErroDetalhe } from '@/stores/toastStore'
import { cn } from '@/lib/utils'

export const MAX_DM = 500

function toast(mensagem: string, tipo: 'success' | 'error' = 'success', erroDetalhe?: ToastErroDetalhe) {
  useToastStore.getState().pushToast(mensagem, tipo, 'world', undefined, erroDetalhe)
}

interface Props {
  amigo: AmigoDetalhado
  meuId: string
  /** Avisa a tela-mae pra recontar os badges depois de marcar lidas. */
  aoMarcarLidas: () => void
}

export function ConversaDM({ amigo, meuId, aoMarcarLidas }: Props) {
  const [mensagens, setMensagens] = useState<MensagemDM[]>([])
  const [temMais, setTemMais] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [carregandoMais, setCarregandoMais] = useState(false)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const fimDoFio = useRef<HTMLDivElement>(null)

  // Carga inicial + marcar lidas. Refaz ao trocar de amigo.
  useEffect(() => {
    let cancelado = false
    setCarregando(true)
    setMensagens([])
    void dm.lerConversa(amigo.userId)
      .then(async (r) => {
        if (cancelado) return
        setMensagens(r.mensagens)
        setTemMais(r.temMais)
        // So chama a RPC se ha o que marcar — abrir uma conversa ja lida nao
        // precisa de round-trip nem de invalidar o badge da tela-mae.
        if (r.mensagens.some((m) => m.para_id === meuId && m.read_at === null)) {
          await dm.marcarDmLidas(amigo.userId)
          if (!cancelado) aoMarcarLidas()
        }
      })
      .catch((e) => {
        if (!cancelado) toast(e instanceof ErroServidor ? e.message : 'Nao foi possivel abrir a conversa.', 'error', detalheDeErro(e))
      })
      .finally(() => { if (!cancelado) setCarregando(false) })
    return () => { cancelado = true }
  }, [amigo.userId, meuId, aoMarcarLidas])

  // Realtime: so o que CHEGA. O eco das minhas sai do retorno de `enviarDm`,
  // entao nao depende do socket estar de pe pra mensagem aparecer.
  useEffect(() => {
    const parar = dm.assinarDmAoVivo(meuId, (m) => {
      if (m.de_id !== amigo.userId) return
      // O guard de id evita linha duplicada se o socket entregar duas vezes
      // (reconexao reenvia o backlog).
      setMensagens((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))
      void dm.marcarDmLidas(amigo.userId).then(aoMarcarLidas).catch(() => {})
    })
    return parar
  }, [amigo.userId, meuId, aoMarcarLidas])

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
      const r = await dm.lerConversa(amigo.userId, mensagens[0].created_at)
      setMensagens((prev) => [...r.mensagens, ...prev])
      setTemMais(r.temMais)
    } catch (e) {
      toast(e instanceof ErroServidor ? e.message : 'Nao foi possivel carregar o historico.', 'error', detalheDeErro(e))
    } finally {
      setCarregandoMais(false)
    }
  }, [amigo.userId, mensagens, carregandoMais])

  async function enviar() {
    const corpo = texto.trim()
    if (!corpo || enviando) return
    setEnviando(true)
    try {
      const { id } = await dm.enviarDm(amigo.userId, corpo)
      setMensagens((prev) => [...prev, {
        id, de_id: meuId, para_id: amigo.userId, corpo, created_at: new Date().toISOString(), read_at: null,
      }])
      setTexto('')
    } catch (e) {
      toast(e instanceof ErroServidor ? e.message : 'Nao foi possivel enviar.', 'error', detalheDeErro(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex min-h-[18em] flex-col gap-[.4em]">
      <div className="flex items-center gap-[.4em]">
        <span
          aria-hidden
          className={cn('h-[.5em] w-[.5em] rounded-full', amigo.online ? 'bg-ok' : 'bg-n600')}
        />
        <b className="font-medium">{amigo.nome}</b>
        <span className="text-[.75em] text-n400">
          {amigo.online ? 'online' : 'offline'} · Nv {amigo.nivel}
        </span>
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
            Nenhuma mensagem ainda. Diga oi para {amigo.nome}.
          </p>
        )}
        {mensagens.map((m) => {
          const minha = m.de_id === meuId
          return (
            <div key={m.id} className={cn('flex', minha ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[80%] rounded-[.5em] px-[.5em] py-[.3em] text-[.85em]',
                  minha ? 'bg-primary/20 text-foreground' : 'bg-n800 text-foreground',
                )}
              >
                <div className="whitespace-pre-wrap break-words">{m.corpo}</div>
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
          aria-label={`Mensagem para ${amigo.nome}`}
          placeholder="Escreva uma mensagem"
          maxLength={MAX_DM}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void enviar() } }}
        />
        <GameButton variant="primary" carregando={enviando} disabled={!texto.trim()} onClick={() => void enviar()}>
          <PaperPlaneRight />
        </GameButton>
      </div>
      <SectionLabel className="self-end">{texto.length}/{MAX_DM}</SectionLabel>
    </div>
  )
}
