// O fio de conversa com um contato (PH-81) — o miolo do Social.
//
// Herdeiro direto do `ConversaDM.tsx` de PH-74, que fazia isto so pra amigo e
// so pra `friend_messages`. O que mudou: a fonte agora e `mail_messages` (a
// mesma do resto da tela), o contato pode ser qualquer jogador, e a
// mensagem pode levar anexo de ouro/item — que e coletado aqui dentro, no fio,
// em vez de numa caixa separada.
//
// Estado local em vez de TanStack Query, pelo mesmo motivo de antes: o fio
// cresce por DUAS fontes (paginar pra tras e chegada por Realtime) e encolhe
// por nenhuma. Uma query com `invalidate` a cada mensagem recebida jogaria fora
// o historico ja paginado e devolveria a rolagem pro fim a cada linha nova.
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp, Gift, PaperPlaneRight } from '@phosphor-icons/react'
import { GameButton, GameInput, SectionLabel } from '@/components/game/controls'
import { getItem } from '@/data/items'
import { itemIconUrl } from '@/data/sprites'
import { ErroServidor, detalheDeErro } from '@/data/remote/servidor'
import type { MensagemSocial } from '@/data/remote/servidor'
import * as social from '@/data/remote/socialRealtime'
import { useToastStore, type ToastErroDetalhe } from '@/stores/toastStore'
import type { AnuncioParaConversa } from '@/stores/uiStore'
import { cn } from '@/lib/utils'
import { AcaoDeReserva } from './AcaoDeReserva'
import { CardDoAnuncio } from './CardDoAnuncio'
import { idsComCardDeAnuncio } from './cardsDoAnuncio'

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
  /**
   * Anuncio que trouxe o jogador ate este fio (PH-435). So existe em quem
   * chegou pelo Mercado — pela lista de conversas e pelo Painel de Amigos vem
   * ausente, e e isso que faz o chip nao aparecer nesses caminhos.
   */
  anuncio?: AnuncioParaConversa
}

interface Props {
  contato: Contato
  meuId: string
  /** Avisa a tela-mae pra recontar os badges depois de marcar lidas. */
  aoMarcarLidas: () => void
  /**
   * Anuncio que trouxe o jogador ate aqui (PH-435). Vira o chip sobre o campo
   * de texto e sai junto da PRIMEIRA mensagem; da segunda em diante o fio ja
   * tem o card no historico e repetir seria ruido.
   */
  anuncio?: AnuncioParaConversa | null
}

export function Conversa({ contato, meuId, aoMarcarLidas, anuncio }: Props) {
  const [mensagens, setMensagens] = useState<MensagemSocial[]>([])
  const [temMais, setTemMais] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [carregandoMais, setCarregandoMais] = useState(false)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [coletando, setColetando] = useState<string | null>(null)
  // Anuncio que ainda NAO foi enviado. Estado local e nao a prop direto porque
  // ele sai da tela sozinho: depois do primeiro envio o card ja esta no
  // historico, e o chip por cima do campo passaria a prometer um segundo card
  // que nao vem.
  //
  // Nasce da prop e nunca a re-le: a tela-mae poe o anuncio na `key` deste
  // componente, entao entrar pelo mesmo contato por OUTRO anuncio (ou pela
  // lista, sem anuncio nenhum) remonta e este estado nasce de novo. Sem isso,
  // fechar o fio sem enviar e reabri-lo pela lista deixaria o chip antigo na
  // tela prometendo um card que ninguem pediu.
  const [anuncioPendente, setAnuncioPendente] = useState<AnuncioParaConversa | null>(anuncio ?? null)
  const fimDoFio = useRef<HTMLDivElement>(null)

  const comCard = useMemo(() => idsComCardDeAnuncio(mensagens), [mensagens])

  // O card mais RECENTE de um anuncio meu — o unico que ganha o formulario de
  // reserva. Ver a nota no JSX.
  const ultimoCardMeu = useMemo(() => {
    let id: string | null = null
    for (const m of mensagens) {
      if (comCard.has(m.id) && m.contexto_anuncio?.sellerId === meuId) id = m.id
    }
    return id
  }, [mensagens, comCard, meuId])

  // Carga inicial + marcar lidas. Refaz ao trocar de contato.
  useEffect(() => {
    let cancelado = false
    setCarregando(true)
    setMensagens([])
    void social.lerConversa(contato.userId)
      .then(async (r) => {
        if (cancelado) return
        setMensagens(r.mensagens)
        setTemMais(r.temMais)
        // So chama a RPC se ha o que marcar — abrir um fio ja lido nao precisa
        // de round-trip nem de invalidar o badge da tela-mae.
        if (r.mensagens.some((m) => m.de_id === contato.userId && !m.excluido_destinatario_em && m.estado === 'pendente')) {
          await social.marcarConversaLida(contato.userId)
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
    // Sufixo proprio: o menu ja tem um canal `social-<id>-menu` vivo, e
    // reusar o nome faria o `.on()` estourar em cima do canal ja inscrito.
    const parar = social.assinarSocialAoVivo(meuId, () => {}, (m) => {
      if (m.de_id !== contato.userId || m.tipo !== 'texto') return
      // O guard de id evita linha duplicada se o socket entregar duas vezes
      // (reconexao reenvia o backlog).
      setMensagens((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))
      void social.marcarConversaLida(contato.userId).then(aoMarcarLidas).catch(() => {})
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
      const r = await social.lerConversa(contato.userId, mensagens[0].created_at)
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
      const { id, contextoAnuncio } = await social.enviarMensagem(
        { paraId: contato.userId }, corpo, [], anuncioPendente?.id ?? null,
      )
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
        // O snapshot vem do RETORNO da RPC, nao do que a vitrine tinha em
        // memoria: se o preco mudou entre abrir a tela e enviar, o eco local
        // mostraria um valor que nao esta gravado em lugar nenhum.
        contexto_anuncio: contextoAnuncio,
      }])
      setTexto('')
      // O anuncio ja virou registro no fio — o chip sai.
      setAnuncioPendente(null)
    } catch (e) {
      toast(e instanceof ErroServidor ? e.message : 'Não foi possível enviar.', 'error', detalheDeErro(e))
    } finally {
      setEnviando(false)
    }
  }

  async function coletar(mensagemId: string) {
    setColetando(mensagemId)
    try {
      const r = await social.coletarAnexo(mensagemId)
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
          const abreAnuncio = comCard.has(m.id)
          const anexos = m.anexo_itens ?? []
          // So o DESTINATARIO coleta, e so uma vez. Do lado de quem mandou o
          // anexo aparece como registro do que saiu, sem botao.
          const podeColetar = !minha && anexos.length > 0 && !m.anexo_coletado_em
          return (
            <Fragment key={m.id}>
              {/* Largura inteira e fora da bolha: o card nao e fala de ninguem,
                  e o ponto dele e os DOIS lados lerem a mesma linha. Dentro da
                  bolha ele herdaria o alinhamento de quem mandou e pareceria
                  argumento de um dos lados. */}
              {abreAnuncio && m.contexto_anuncio && (
                <CardDoAnuncio ctx={m.contexto_anuncio} meuId={meuId} />
              )}
              {/* A acao de reservar so aparece pra quem PODE reservar: o
                  vendedor, no card do proprio anuncio, e so no card mais
                  recente do fio — repetir o formulario em cada card antigo
                  ofereceria reservar por um preco de uma negociacao encerrada
                  (PH-437). Leilao e somente-lance ficam de fora porque o
                  servidor recusa os dois, e botao que so serve pra dar erro e
                  pior que botao ausente. */}
              {abreAnuncio && m.id === ultimoCardMeu && m.contexto_anuncio
                && m.contexto_anuncio.modo !== 'leilao' && !m.contexto_anuncio.apenasOferta && (
                <AcaoDeReserva ctx={m.contexto_anuncio} paraId={contato.userId} nick={contato.nick} />
              )}
            <div className={cn('flex', minha ? 'justify-end' : 'justify-start')}>
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
            </Fragment>
          )
        })}
        <div ref={fimDoFio} />
      </div>

      {/* O chip do que VAI junto. Fica sobre o campo de texto, e nao dentro do
          fio, porque ainda nao e historico: fechar a conversa sem enviar nao
          deixa registro nenhum, e o chip desaparece com ele. */}
      {anuncioPendente && (
        <CardDoAnuncio
          ctx={{
            anuncioId: anuncioPendente.id,
            sellerId: anuncioPendente.sellerId,
            speciesId: anuncioPendente.speciesId,
            level: anuncioPendente.level,
            isShiny: anuncioPendente.isShiny,
            rarity: anuncioPendente.rarity,
            ivPercent: anuncioPendente.ivPercent,
            price: anuncioPendente.price,
            currency: anuncioPendente.currency,
            modo: anuncioPendente.modo,
            apenasOferta: anuncioPendente.apenasOferta,
          }}
          meuId={meuId}
          pendente
          aoDescartar={() => setAnuncioPendente(null)}
        />
      )}

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
