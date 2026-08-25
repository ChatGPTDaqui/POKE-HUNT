// Correio como aplicativo de mensagem (PH-81): lista de CONVERSAS, avisos e
// amigos.
//
// Antes eram quatro abas — Entrada, Enviados, Avisos, Amigos — e a mesma pessoa
// aparecia em tres delas: o que ela te mandou na Entrada, o que voce respondeu
// nos Enviados, e o que voces conversaram no fio de Amigos. Nao havia conversa,
// havia tres listas do mesmo dialogo. Agora ha um fio por contato e o resto
// desapareceu junto com a separacao.
//
// "Enviados" nao virou aba nenhuma DE PROPOSITO: num aplicativo de mensagem o
// que voce mandou esta dentro da conversa, do lado direito. Uma caixa separada
// de enviados so existia porque carta e um objeto que sai de casa.
//
// Aviso de sistema e pedido de amizade ficam FORA das conversas: o primeiro nao
// tem interlocutor (`de_id` nulo) e o segundo e uma decisao a tomar, nao uma
// fala num fio. Os dois chegam em rajada (venda no mercado, concessao inicial)
// e afogariam a mensagem de gente de verdade.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChatCircleDots, Gift, PencilSimple, Trash, UserPlus, X } from '@phosphor-icons/react'
import {
  ErroServidor, detalheDeErro,
  type AnexoItemCorreio, type ConversaResumo,
} from '@/data/remote/servidor'
import * as correioRpc from '@/data/remote/correioRealtime'
import { supabase } from '@/lib/supabase'
import { useToastStore, type ToastErroDetalhe } from '@/stores/toastStore'
import { useDeviceMode, useUiStore } from '@/stores/uiStore'
import {
  GameButton, GameCard, GameInput, SectionLabel, SegmentedTabs,
} from '@/components/game/controls'
import { cn } from '@/lib/utils'
import { ComporMensagem } from './ComporMensagem'
import { Conversa, type Contato } from './Conversa'
import { LinhaDeMensagem } from './LinhaDeMensagem'
import { PainelAmigos } from './PainelAmigos'

const STALE_MS = 15000

type Aba = 'conversas' | 'avisos' | 'amigos'

function toast(mensagem: string, tipo: 'success' | 'error' = 'success', erroDetalhe?: ToastErroDetalhe) {
  useToastStore.getState().pushToast(mensagem, tipo, 'world', undefined, erroDetalhe)
}

function aoFalhar(padrao: string) {
  return (e: unknown) => toast(e instanceof ErroServidor ? e.message : padrao, 'error', detalheDeErro(e))
}

/** "14:32" pra hoje, "22/08" pra antes — o mesmo corte que aplicativo de mensagem faz. */
function quando(iso: string): string {
  const d = new Date(iso)
  const hoje = new Date()
  const mesmoDia = d.getDate() === hoje.getDate()
    && d.getMonth() === hoje.getMonth()
    && d.getFullYear() === hoje.getFullYear()
  return mesmoDia
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

export function CorreioMenu() {
  const qc = useQueryClient()
  const { compacto } = useDeviceMode()
  const [nick, setNick] = useState('')
  const [aba, setAba] = useState<Aba>('conversas')
  const [compondo, setCompondo] = useState<{ nickInicial?: string } | null>(null)
  const [contatoAberto, setContatoAberto] = useState<Contato | null>(null)
  const [meuId, setMeuId] = useState<string | null>(null)

  // PH-119: quem abriu o Correio pedindo uma conversa específica (o botão
  // "Conversar" do perfil público). Consumido UMA vez e limpo — sem isso,
  // fechar o fio e voltar ao Correio reabriria o mesmo contato para sempre, e o
  // jogador não conseguiria mais ver a lista.
  const contatoInicial = useUiStore((s) => s.correioContatoInicial)
  const consumirContatoInicial = useUiStore((s) => s.consumirCorreioContatoInicial)
  useEffect(() => {
    if (!contatoInicial) return
    setAba('conversas')
    setContatoAberto({ userId: contatoInicial.userId, nick: contatoInicial.nick })
    consumirContatoInicial()
  }, [contatoInicial, consumirContatoInicial])

  const { data, isLoading } = useQuery({
    queryKey: ['correio'],
    queryFn: () => correioRpc.correio(),
    staleTime: STALE_MS,
  })

  const recarregar = useCallback(() => { void qc.invalidateQueries({ queryKey: ['correio'] }) }, [qc])

  useEffect(() => {
    let cancelado = false
    void supabase.auth.getSession().then(({ data: sessao }) => {
      if (!cancelado) setMeuId(sessao.session?.user.id ?? null)
    })
    return () => { cancelado = true }
  }, [])

  // A ASSINATURA DE REALTIME NAO MORA MAIS AQUI. Ela subiu pra
  // `hooks/usePendencias.ts#useCorreioAoVivo`, que roda enquanto o jogo esta
  // aberto (o `ActionDock` do HUD sempre esta montado) — antes ela existia so
  // com o Correio ABERTO, e era justamente por isso que o contador de pendencia
  // dependia de um poll de 60s.
  //
  // Desde PH-81 cada assinante leva um sufixo de canal proprio, entao duas
  // assinaturas ate SERIAM possiveis (o fio aberto tem a dele). O ponto aqui e
  // outro: nao PRECISA. Este componente compartilha a `queryKey` ['correio']
  // com o contador, entao a invalidacao que o Realtime dispara la ja atualiza a
  // tela aberta aqui — um socket a menos por aba.

  const adicionar = useMutation({
    mutationFn: (n: string) => correioRpc.pedirAmizade(n),
    onSuccess: (r) => { toast(r.mensagem); setNick(''); recarregar() },
    onError: aoFalhar('Nao foi possivel enviar o pedido.'),
  })

  const responderPedido = useMutation({
    mutationFn: ({ id, aceitar }: { id: string; aceitar: boolean }) => correioRpc.responderPedido(id, aceitar),
    onSuccess: (r) => { toast(r.mensagem); recarregar() },
    onError: aoFalhar('Nao foi possivel responder.'),
  })

  const marcarLida = useMutation({
    mutationFn: (id: string) => correioRpc.marcarLida(id),
    onSuccess: recarregar,
  })

  const coletar = useMutation({
    mutationFn: (id: string) => correioRpc.coletarAnexo(id),
    onSuccess: (r) => { toast(r.mensagem); recarregar() },
    onError: aoFalhar('Nao foi possivel coletar.'),
  })

  // Comecar conversa nova: manda a primeira mensagem por NICK e ja abre o fio
  // com o id que a RPC devolveu — sem isso o jogador escreveria e cairia de
  // volta numa lista, tendo que procurar o proprio contato que acabou de criar.
  const comecar = useMutation({
    mutationFn: (d: { nick: string; corpo: string; anexos: AnexoItemCorreio[] }) =>
      correioRpc.enviarMensagem({ paraNick: d.nick }, d.corpo, d.anexos),
    onSuccess: (r) => {
      setCompondo(null)
      setContatoAberto({ userId: r.paraId, nick: r.paraNome })
      recarregar()
    },
    onError: aoFalhar('Nao foi possivel enviar a mensagem.'),
  })

  const excluir = useMutation({
    mutationFn: (id: string) => correioRpc.excluirCorreio(id),
    onSuccess: recarregar,
    onError: aoFalhar('Nao foi possivel excluir.'),
  })

  const apagarFio = useMutation({
    mutationFn: (id: string) => correioRpc.excluirConversa(id),
    onSuccess: () => { setContatoAberto(null); recarregar() },
    onError: aoFalhar('Nao foi possivel apagar a conversa.'),
  })

  const remover = useMutation({
    mutationFn: (id: string) => correioRpc.removerAmizade(id),
    onSuccess: (r) => { toast(r.mensagem); recarregar() },
    onError: aoFalhar('Nao foi possivel remover.'),
  })

  const bloquear = useMutation({
    mutationFn: (id: string) => correioRpc.bloquearJogador(id),
    onSuccess: (r) => { toast(r.mensagem); recarregar() },
    onError: aoFalhar('Nao foi possivel bloquear.'),
  })

  const desbloquear = useMutation({
    mutationFn: (id: string) => correioRpc.desbloquearJogador(id),
    onSuccess: (r) => { toast(r.mensagem); recarregar() },
    onError: aoFalhar('Nao foi possivel desbloquear.'),
  })

  // Memoizado porque `?? []` cria um array novo a cada render, e `contatoAtual`
  // depende dele — sem isto o `useMemo` de baixo recalcula sempre e o objeto do
  // contato troca de identidade, remontando o fio inteiro a cada render.
  const conversas = useMemo(() => data?.conversas ?? [], [data?.conversas])
  const avisos = useMemo(() => data?.avisos ?? [], [data?.avisos])
  const naoLidasConversas = conversas.reduce((t, c) => t + c.naoLidas, 0)
  const naoLidosAvisos = avisos.filter((m) => m.estado === 'pendente').length

  const ocupado = remover.isPending || bloquear.isPending || desbloquear.isPending

  // O contato aberto le da query sempre que existir linha la, pra `online` e
  // `naoLidas` nao congelarem no valor que tinham no clique. Quando o fio ainda
  // nao existe (conversa recem-criada), vale o que o clique guardou.
  const contatoAtual = useMemo<Contato | null>(() => {
    if (!contatoAberto) return null
    const daLista = conversas.find((c) => c.userId === contatoAberto.userId)
    return daLista ? { userId: daLista.userId, nick: daLista.nick, online: daLista.online } : contatoAberto
  }, [contatoAberto, conversas])

  const abrirComposicao = useCallback((nickInicial?: string) => {
    setCompondo({ nickInicial })
    setAba('conversas')
  }, [])

  const abrirFio = useCallback((c: Contato) => {
    setCompondo(null)
    setContatoAberto(c)
    setAba('conversas')
  }, [])

  const abas: { value: Aba; label: string }[] = [
    { value: 'conversas', label: `Conversas${naoLidasConversas ? ` (${naoLidasConversas})` : ''}` },
    { value: 'avisos', label: `Avisos${naoLidosAvisos ? ` (${naoLidosAvisos})` : ''}` },
    { value: 'amigos', label: 'Amigos' },
  ]

  function LinhaDeConversa({ c }: { c: ConversaResumo }) {
    const aberta = contatoAtual?.userId === c.userId
    return (
      <GameCard
        className={cn(
          'flex cursor-pointer items-center gap-[.5em] p-[.45em]',
          aberta && 'border-primary/60',
          c.naoLidas > 0 && !aberta && 'border-primary/40',
        )}
        onClick={() => abrirFio({ userId: c.userId, nick: c.nick, online: c.online })}
      >
        <span
          aria-hidden
          className={cn('h-[.5em] w-[.5em] shrink-0 rounded-full', c.online ? 'bg-ok' : 'bg-n600')}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-[.4em]">
            <b className="truncate font-medium text-foreground">{c.nick}</b>
            <span className="shrink-0 text-[.7em] text-n500">{quando(c.ultimaEm)}</span>
          </div>
          <div className="flex items-center gap-[.35em]">
            <span className="min-w-0 flex-1 truncate text-[.8em] text-n400">
              {c.ultimaMinha && <span className="text-n500">Voce: </span>}
              {c.ultimoTrecho}
            </span>
            {c.anexosPendentes > 0 && (
              <span className="shrink-0 text-primary" title="Anexo esperando coleta"><Gift /></span>
            )}
            {c.naoLidas > 0 && (
              <span className="shrink-0 rounded-full bg-primary px-[.4em] text-[.7em] text-n900">
                {c.naoLidas}
              </span>
            )}
          </div>
        </div>
      </GameCard>
    )
  }

  const painelEsquerdo = (
    <div className="flex flex-col gap-[.55em]">
      {aba === 'conversas' && (
        <div className="flex justify-end">
          <GameButton variant="primary" onClick={() => abrirComposicao()}>
            <PencilSimple /> Nova conversa
          </GameButton>
        </div>
      )}

      {compondo && (
        <ComporMensagem
          nickInicial={compondo.nickInicial}
          enviando={comecar.isPending}
          onCancelar={() => setCompondo(null)}
          onEnviar={(d) => comecar.mutate(d)}
        />
      )}

      {isLoading && <p className="text-n400">Carregando...</p>}

      {!isLoading && aba === 'conversas' && (
        <div>
          <SectionLabel>CONVERSAS {naoLidasConversas ? `(${naoLidasConversas} nova(s))` : ''}</SectionLabel>
          {conversas.length === 0 && (
            <p className="text-n400">
              Nenhuma conversa ainda. Use "Nova conversa" pra falar com alguem pelo nick.
            </p>
          )}
          <div className="mt-[.4em] flex flex-col gap-[.35em]">
            {conversas.map((c) => <LinhaDeConversa key={c.userId} c={c} />)}
          </div>
        </div>
      )}

      {!isLoading && aba === 'avisos' && (
        <div>
          <SectionLabel>AVISOS {naoLidosAvisos ? `(${naoLidosAvisos} novo(s))` : ''}</SectionLabel>
          {avisos.length === 0 && <p className="text-n400">Nenhum aviso.</p>}
          <div className="mt-[.4em] flex flex-col gap-[.4em]">
            {avisos.map((m) => (
              <LinhaDeMensagem
                key={m.id}
                m={m}

                respondendo={responderPedido.isPending}
                coletando={coletar.isPending}
                excluindo={excluir.isPending}
                onMarcarLida={marcarLida.mutate}
                onResponderPedido={(id, aceitar) => responderPedido.mutate({ id, aceitar })}
                onColetar={coletar.mutate}
                onExcluir={excluir.mutate}
              />
            ))}
          </div>
        </div>
      )}

      {!isLoading && aba === 'amigos' && (
        <PainelAmigos
          amigos={data?.amigos ?? []}
          bloqueados={data?.bloqueados ?? []}
          selecionado={contatoAtual?.userId ?? null}
          ocupado={ocupado}
          onSelecionar={(a) => abrirFio({ userId: a.userId, nick: a.nome, online: a.online })}
          onEscrever={abrirComposicao}
          onRemover={(a) => remover.mutate(a.userId)}
          onBloquear={(a) => bloquear.mutate(a.userId)}
          onDesbloquear={(b) => desbloquear.mutate(b.userId)}
        />
      )}
    </div>
  )

  const painelDireito = contatoAtual && meuId ? (
    <GameCard className="p-[.6em]">
      <div className="mb-[.35em] flex justify-end gap-[.3em]">
        <GameButton
          variant="ghost"
          aria-label="Apagar conversa"
          carregando={apagarFio.isPending}
          onClick={() => apagarFio.mutate(contatoAtual.userId)}
        >
          <Trash />
        </GameButton>
        <GameButton variant="ghost" aria-label="Fechar conversa" onClick={() => setContatoAberto(null)}>
          <X />
        </GameButton>
      </div>
      <Conversa
        // `key` por contato: trocar de conversa precisa REMONTAR, nao reusar.
        // Sem isto o fio do contato anterior fica na tela ate o novo carregar.
        key={contatoAtual.userId}
        contato={contatoAtual}
        meuId={meuId}
        aoMarcarLidas={recarregar}
      />
    </GameCard>
  ) : null

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
        <GameButton variant="secondary" disabled={!nick.trim()} onClick={() => abrirComposicao(nick.trim())}>
          <ChatCircleDots /> Conversar
        </GameButton>
      </GameCard>

      <SegmentedTabs value={aba} options={abas} onChange={setAba} />

      {/* Dois paineis so quando ha conversa aberta E espaco. No compacto a
          conversa OCUPA a tela: dividir 374px uteis em dois deixaria as duas
          metades inutilizaveis. */}
      {painelDireito && !compacto ? (
        <div className="grid grid-cols-[1fr_1fr] items-start gap-[.65em]">
          {painelEsquerdo}
          {painelDireito}
        </div>
      ) : painelDireito ?? painelEsquerdo}
    </div>
  )
}
