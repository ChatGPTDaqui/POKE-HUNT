// Uma linha da caixa de correio (PH-74).
//
// Componente de topo, NAO uma funcao declarada dentro de CorreioMenu: componente
// definido no corpo de outro e recriado a cada render, o que remonta a subarvore
// inteira e joga fora foco e estado interno. Mesmo motivo de PH-31.
import { ArrowBendUpLeft, Check, Gift, Trash, X } from '@phosphor-icons/react'
import { GameButton, GameCard } from '@/components/game/controls'
import { getItem } from '@/data/items'
import { itemIconUrl } from '@/data/sprites'
import type { MensagemCorreio } from '@/data/remote/servidor'
import { cn } from '@/lib/utils'

const ROTULO_TIPO: Record<MensagemCorreio['tipo'], string> = {
  texto: 'Mensagem',
  pedido_amizade: 'Pedido de amizade',
  sistema: 'Aviso',
}

interface Props {
  m: MensagemCorreio
  /** `true` na caixa de enviados: muda o rotulo do remetente e tira as acoes de destinatario. */
  enviada: boolean
  respondendo: boolean
  coletando: boolean
  excluindo: boolean
  onMarcarLida: (id: string) => void
  onResponderPedido: (id: string, aceitar: boolean) => void
  onColetar: (id: string) => void
  onResponder: (m: MensagemCorreio) => void
  onExcluir: (id: string) => void
}

export function LinhaDeMensagem({
  m, enviada, respondendo, coletando, excluindo,
  onMarcarLida, onResponderPedido, onColetar, onResponder, onExcluir,
}: Props) {
  const pendente = m.estado === 'pendente'
  const ehPedido = m.tipo === 'pedido_amizade'
  const anexos = m.anexo_itens ?? []
  const temAnexo = anexos.length > 0
  const coletado = Boolean(m.anexo_coletado_em)
  // O item ja saiu do inventario de quem mandou. Excluir com anexo pendente
  // destruiria o item sem ninguem ficar com ele — a RPC recusa, e o botao
  // desabilitado explica antes do erro.
  const anexoPreso = temAnexo && !coletado && !enviada
  const pedidoEmAberto = ehPedido && pendente

  return (
    <GameCard
      className={cn('flex flex-wrap items-center gap-[.5em] p-[.4em]', pendente && !enviada && 'border-primary/40')}
      onClick={() => { if (pendente && !ehPedido && !temAnexo && !enviada) onMarcarLida(m.id) }}
    >
      <div className="min-w-[10em] flex-1">
        <div className="flex flex-wrap items-center gap-[.4em]">
          <b className="font-medium text-foreground">{m.assunto}</b>
          <span className="text-[.75em] text-n400">{ROTULO_TIPO[m.tipo]}</span>
          {pendente && !ehPedido && !enviada && <span className="text-[.75em] text-primary">nova</span>}
        </div>
        <div className="whitespace-pre-wrap break-words text-[.85em] text-n300">{m.corpo}</div>

        {temAnexo && (
          <div className="mt-[.25em] flex flex-wrap items-center gap-[.3em]">
            {anexos.map((a) => (
              <span
                key={a.itemId}
                className="flex items-center gap-[.25em] rounded-[.35em] border border-n700 bg-n800 px-[.35em] py-[.1em] text-[.78em] text-foreground"
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
          </div>
        )}

        <div className="text-[.75em] text-n500">
          {enviada ? `para ${m.para_nome ?? 'Treinador'}` : `de ${m.de_nome}`}
          {' · '}
          {new Date(m.created_at).toLocaleString('pt-BR')}
        </div>
      </div>

      {temAnexo && !enviada && (
        coletado ? (
          <span className="text-[.8em] text-ok">Recebido</span>
        ) : (
          <GameButton
            variant="primary"
            carregando={coletando}
            onClick={(e) => { e.stopPropagation(); onColetar(m.id) }}
          >
            <Gift /> Coletar
          </GameButton>
        )
      )}
      {/* Na caixa de enviados o anexo e so informacao: quem coleta e o outro. */}
      {temAnexo && enviada && (
        <span className="text-[.8em] text-n400">{coletado ? 'Coletado' : 'Nao coletado'}</span>
      )}

      {pedidoEmAberto && (
        <div className="flex gap-[.35em]">
          <GameButton
            variant="primary"
            carregando={respondendo}
            onClick={(e) => { e.stopPropagation(); onResponderPedido(m.id, true) }}
          >
            <Check /> Aceitar
          </GameButton>
          <GameButton
            variant="ghost"
            carregando={respondendo}
            onClick={(e) => { e.stopPropagation(); onResponderPedido(m.id, false) }}
          >
            <X /> Recusar
          </GameButton>
        </div>
      )}
      {ehPedido && !pendente && (
        <span className="text-[.8em] text-n400">
          {m.estado === 'aceito' ? 'Aceito' : 'Recusado'}
        </span>
      )}

      <div className="flex gap-[.25em]">
        {!enviada && m.de_id && !ehPedido && (
          <GameButton
            variant="ghost"
            title="Responder"
            aria-label={`Responder a ${m.de_nome}`}
            onClick={(e) => { e.stopPropagation(); onResponder(m) }}
          >
            <ArrowBendUpLeft />
          </GameButton>
        )}
        <GameButton
          variant="ghost"
          title={
            anexoPreso ? 'Colete o anexo antes de excluir'
              : pedidoEmAberto ? 'Responda ao pedido antes de excluir'
                : 'Excluir'
          }
          aria-label={`Excluir ${m.assunto}`}
          disabled={anexoPreso || pedidoEmAberto || excluindo}
          onClick={(e) => { e.stopPropagation(); onExcluir(m.id) }}
        >
          <Trash />
        </GameButton>
      </div>
    </GameCard>
  )
}
