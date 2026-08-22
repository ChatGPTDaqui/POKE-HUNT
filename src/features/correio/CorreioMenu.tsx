// Correio: caixa de entrada + amigos + adicionar amigo pelo nick.
//
// O pedido de amizade e uma MENSAGEM, nao uma tabela de "pedidos": ela chega na
// mesma caixa que o resto, com dois botoes em vez de nenhum. Assim so existe um
// lugar pra olhar quando alguem interage com voce — e o contador de nao lidas
// cobre as duas coisas de uma vez.
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Gift, UserPlus, X } from '@phosphor-icons/react'
import { ErroServidor, detalheDeErro, type MensagemCorreio } from '@/data/remote/servidor'
import * as correioRpc from '@/data/remote/correioRealtime'
import { useToastStore, type ToastErroDetalhe } from '@/stores/toastStore'
import { getItem } from '@/data/items'
import { itemIconUrl } from '@/data/sprites'
import {
  GameButton, GameCard, GameInput, SectionLabel,
} from '@/components/game/controls'
import { cn } from '@/lib/utils'

const STALE_MS = 15000

function toast(mensagem: string, tipo: 'success' | 'error' = 'success', erroDetalhe?: ToastErroDetalhe) {
  useToastStore.getState().pushToast(mensagem, tipo, 'world', undefined, erroDetalhe)
}

const ROTULO_TIPO: Record<MensagemCorreio['tipo'], string> = {
  texto: 'Mensagem',
  pedido_amizade: 'Pedido de amizade',
  sistema: 'Aviso',
}

export function CorreioMenu() {
  const qc = useQueryClient()
  const [nick, setNick] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['correio'],
    queryFn: () => correioRpc.correio(),
    staleTime: STALE_MS,
  })

  // A ASSINATURA DE REALTIME NAO MORA MAIS AQUI. Ela subiu pra
  // `hooks/usePendencias.ts#useCorreioAoVivo`, que roda enquanto o jogo esta
  // aberto (o `ActionDock` do HUD sempre esta montado) — antes ela existia so
  // com o Correio ABERTO, e era justamente por isso que o contador de pendencia
  // dependia de um poll de 60s.
  //
  // Duas assinaturas ao mesmo tempo nao e opcao: `assinarCorreioAoVivo` usa
  // `supabase.channel('correio-<uid>')`, nome fixo por usuario, e pedir o mesmo
  // nome antes de remover o canal anterior devolve o canal JA inscrito — `.on()`
  // nele lanca "cannot add postgres_changes callbacks after subscribe()". Este
  // componente compartilha a `queryKey` ['correio'] com o contador, entao a
  // invalidacao que o Realtime dispara la ja atualiza a tela aberta aqui.

  const adicionar = useMutation({
    mutationFn: (n: string) => correioRpc.pedirAmizade(n),
    onSuccess: (r) => {
      toast(r.mensagem)
      setNick('')
      void qc.invalidateQueries({ queryKey: ['correio'] })
    },
    onError: (e) => toast(e instanceof ErroServidor ? e.message : 'Nao foi possivel enviar o pedido.', 'error', detalheDeErro(e)),
  })

  const responder = useMutation({
    mutationFn: ({ id, aceitar }: { id: string; aceitar: boolean }) => correioRpc.responderPedido(id, aceitar),
    onSuccess: (r) => {
      toast(r.mensagem)
      void qc.invalidateQueries({ queryKey: ['correio'] })
    },
    onError: (e) => toast(e instanceof ErroServidor ? e.message : 'Nao foi possivel responder.', 'error', detalheDeErro(e)),
  })

  const marcarLida = useMutation({
    mutationFn: (id: string) => correioRpc.marcarLida(id),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['correio'] }) },
  })

  // A RPC ja credita o item na mesma transacao (sem fila de entrega — ver
  // migracao #10) e `correioRpc.coletarAnexo` ja faz o refetch cirurgico do
  // item no client. So falta atualizar a caixa de entrada.
  const coletar = useMutation({
    mutationFn: (id: string) => correioRpc.coletarAnexo(id),
    onSuccess: (r) => {
      toast(r.mensagem)
      void qc.invalidateQueries({ queryKey: ['correio'] })
    },
    onError: (e) => toast(e instanceof ErroServidor ? e.message : 'Nao foi possivel coletar.', 'error', detalheDeErro(e)),
  })

  return (
    <div className="flex flex-col gap-[.55em]">
      <GameCard className="flex flex-wrap items-end gap-[.5em] p-[.6em]">
        <label className="flex min-w-[10em] flex-1 flex-col gap-[.2em] text-[.8em] text-n300">
          Adicionar amigo pelo nick
          <GameInput
            placeholder="Nome exato do treinador"
            value={nick}
            onChange={(e) => setNick(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && nick.trim()) adicionar.mutate(nick.trim()) }}
          />
        </label>
        <GameButton
          variant="primary"
          carregando={adicionar.isPending}
          disabled={!nick.trim()}
          onClick={() => adicionar.mutate(nick.trim())}
        >
          <UserPlus /> Enviar pedido
        </GameButton>
      </GameCard>

      <div>
        <SectionLabel>CAIXA DE ENTRADA {data?.naoLidas ? `(${data.naoLidas} nova(s))` : ''}</SectionLabel>
        {isLoading && <p className="text-n400">Carregando...</p>}
        {!isLoading && (data?.mensagens.length ?? 0) === 0 && (
          <p className="text-n400">Sua caixa esta vazia.</p>
        )}
        <div className="mt-[.4em] flex flex-col gap-[.4em]">
          {data?.mensagens.map((m) => {
            const pendente = m.estado === 'pendente'
            const ehPedido = m.tipo === 'pedido_amizade'
            const anexos = m.anexo_itens ?? []
            const temAnexo = anexos.length > 0
            const coletado = Boolean(m.anexo_coletado_em)
            return (
              <GameCard
                key={m.id}
                className={cn('flex flex-wrap items-center gap-[.5em] p-[.4em]', pendente && 'border-primary/40')}
                onClick={() => { if (pendente && !ehPedido && !temAnexo) marcarLida.mutate(m.id) }}
              >
                <div className="min-w-[10em] flex-1">
                  <div className="flex flex-wrap items-center gap-[.4em]">
                    <b className="font-medium text-foreground">{m.assunto}</b>
                    <span className="text-[.75em] text-n400">{ROTULO_TIPO[m.tipo]}</span>
                    {pendente && !ehPedido && <span className="text-[.75em] text-primary">nova</span>}
                  </div>
                  <div className="text-[.85em] text-n300">{m.corpo}</div>
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
                    de {m.de_nome} · {new Date(m.created_at).toLocaleString('pt-BR')}
                  </div>
                </div>

                {temAnexo && (
                  coletado ? (
                    <span className="text-[.8em] text-ok">Recebido</span>
                  ) : (
                    <GameButton
                      variant="primary"
                      carregando={coletar.isPending}
                      onClick={() => coletar.mutate(m.id)}
                    >
                      <Gift /> Coletar
                    </GameButton>
                  )
                )}

                {ehPedido && pendente && (
                  <div className="flex gap-[.35em]">
                    <GameButton
                      variant="primary"
                      carregando={responder.isPending}
                      onClick={() => responder.mutate({ id: m.id, aceitar: true })}
                    >
                      <Check /> Aceitar
                    </GameButton>
                    <GameButton
                      variant="ghost"
                      carregando={responder.isPending}
                      onClick={() => responder.mutate({ id: m.id, aceitar: false })}
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
              </GameCard>
            )
          })}
        </div>
      </div>

      <div>
        <SectionLabel>AMIGOS ({data?.amigos.length ?? 0})</SectionLabel>
        {(data?.amigos.length ?? 0) === 0 && (
          <p className="text-n400">Voce ainda nao tem amigos. Mande um pedido pelo nick acima.</p>
        )}
        <div className="mt-[.4em] flex flex-col gap-[.3em]">
          {data?.amigos.map((a) => (
            <div
              key={a.userId}
              className="flex items-center justify-between rounded-[.45em] border border-n800 px-[.6em] py-[.35em] text-[.85em]"
            >
              <b className="font-medium">{a.nome}</b>
              <span className="text-n400">Treinador Nv {a.nivel}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Honestidade sobre o que ainda nao existe: mensagem escrita entre
          jogadores nao tem rota nenhuma no servidor, e um campo de "escrever"
          que nao envia seria pior que a ausencia dele. */}
      <p className="text-[.78em] text-n400">
        Ainda não dá para escrever mensagens livres — a caixa recebe pedidos de amizade e avisos do jogo.
      </p>
    </div>
  )
}
