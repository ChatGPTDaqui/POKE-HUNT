// Correio: caixa de entrada + amigos + adicionar amigo pelo nick.
//
// O pedido de amizade e uma MENSAGEM, nao uma tabela de "pedidos": ela chega na
// mesma caixa que o resto, com dois botoes em vez de nenhum. Assim so existe um
// lugar pra olhar quando alguem interage com voce — e o contador de nao lidas
// cobre as duas coisas de uma vez.
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Envelope, UserPlus, X } from '@phosphor-icons/react'
import { servidor, servidorAtivo, ErroServidor, type MensagemCorreio } from '@/data/remote/servidor'
import { useToastStore } from '@/stores/toastStore'
import {
  ComingSoon, GameButton, GameCard, GameInput, SectionLabel,
} from '@/components/game/controls'
import { cn } from '@/lib/utils'

const STALE_MS = 15000

function toast(mensagem: string, tipo: 'success' | 'error' = 'success') {
  useToastStore.getState().pushToast(mensagem, tipo, 'world')
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
    queryFn: () => servidor.correio(),
    staleTime: STALE_MS,
    enabled: servidorAtivo(),
  })

  const adicionar = useMutation({
    mutationFn: (n: string) => servidor.pedirAmizade(n),
    onSuccess: (r) => {
      toast(r.mensagem)
      setNick('')
      void qc.invalidateQueries({ queryKey: ['correio'] })
    },
    onError: (e) => toast(e instanceof ErroServidor ? e.message : 'Nao foi possivel enviar o pedido.', 'error'),
  })

  const responder = useMutation({
    mutationFn: ({ id, aceitar }: { id: string; aceitar: boolean }) => servidor.responderPedido(id, aceitar),
    onSuccess: (r) => {
      toast(r.mensagem)
      void qc.invalidateQueries({ queryKey: ['correio'] })
    },
    onError: (e) => toast(e instanceof ErroServidor ? e.message : 'Nao foi possivel responder.', 'error'),
  })

  const marcarLida = useMutation({
    mutationFn: (id: string) => servidor.marcarLida(id),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['correio'] }) },
  })

  if (!servidorAtivo()) {
    return (
      <ComingSoon icon={<Envelope />} title="O Correio exige o servidor">
        Amigos e mensagens vivem no servidor de autoridade — o navegador só enxerga o próprio save e não
        consegue nem descobrir que outro treinador existe. Rodando sem <code>VITE_SERVIDOR_URL</code> não
        há caixa de entrada.
      </ComingSoon>
    )
  }

  return (
    <div className="flex flex-col gap-[.8em]">
      <GameCard className="flex flex-wrap items-end gap-[.5em] p-[.6em]">
        <label className="flex min-w-[10em] flex-1 flex-col gap-[.2em] text-[.78em] text-n400">
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
          disabled={adicionar.isPending || !nick.trim()}
          onClick={() => adicionar.mutate(nick.trim())}
        >
          <UserPlus /> Enviar pedido
        </GameButton>
      </GameCard>

      <div>
        <SectionLabel>CAIXA DE ENTRADA {data?.naoLidas ? `(${data.naoLidas} nova(s))` : ''}</SectionLabel>
        {isLoading && <p className="text-n500">Carregando...</p>}
        {!isLoading && (data?.mensagens.length ?? 0) === 0 && (
          <p className="text-n500">Sua caixa esta vazia.</p>
        )}
        <div className="mt-[.4em] flex flex-col gap-[.4em]">
          {data?.mensagens.map((m) => {
            const pendente = m.estado === 'pendente'
            const ehPedido = m.tipo === 'pedido_amizade'
            return (
              <GameCard
                key={m.id}
                className={cn('flex flex-wrap items-center gap-[.5em] p-[.55em]', pendente && 'border-primary/40')}
                onClick={() => { if (pendente && !ehPedido) marcarLida.mutate(m.id) }}
              >
                <div className="min-w-[10em] flex-1">
                  <div className="flex flex-wrap items-center gap-[.4em]">
                    <b className="font-medium">{m.assunto}</b>
                    <span className="text-[.72em] text-n500">{ROTULO_TIPO[m.tipo]}</span>
                    {pendente && !ehPedido && <span className="text-[.72em] text-primary">nova</span>}
                  </div>
                  <div className="text-[.8em] text-n400">{m.corpo}</div>
                  <div className="text-[.72em] text-n600">
                    de {m.de_nome} · {new Date(m.created_at).toLocaleString('pt-BR')}
                  </div>
                </div>

                {ehPedido && pendente && (
                  <div className="flex gap-[.35em]">
                    <GameButton
                      variant="primary"
                      disabled={responder.isPending}
                      onClick={() => responder.mutate({ id: m.id, aceitar: true })}
                    >
                      <Check /> Aceitar
                    </GameButton>
                    <GameButton
                      variant="ghost"
                      disabled={responder.isPending}
                      onClick={() => responder.mutate({ id: m.id, aceitar: false })}
                    >
                      <X /> Recusar
                    </GameButton>
                  </div>
                )}
                {ehPedido && !pendente && (
                  <span className="text-[.78em] text-n500">
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
          <p className="text-n500">Voce ainda nao tem amigos. Mande um pedido pelo nick acima.</p>
        )}
        <div className="mt-[.4em] flex flex-col gap-[.3em]">
          {data?.amigos.map((a) => (
            <div
              key={a.userId}
              className="flex items-center justify-between rounded-[.45em] border border-n800 px-[.6em] py-[.35em] text-[.85em]"
            >
              <b className="font-medium">{a.nome}</b>
              <span className="text-n500">Treinador Nv {a.nivel}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Honestidade sobre o que ainda nao existe: mensagem escrita entre
          jogadores nao tem rota nenhuma no servidor, e um campo de "escrever"
          que nao envia seria pior que a ausencia dele. */}
      <p className="text-[.75em] text-n500">
        Ainda não dá para escrever mensagens livres — a caixa recebe pedidos de amizade e avisos do jogo.
      </p>
    </div>
  )
}
