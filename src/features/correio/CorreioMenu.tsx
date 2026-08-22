// Correio: caixa de entrada, enviados, avisos do sistema, amigos e conversa
// privada (PH-74).
//
// O pedido de amizade e uma MENSAGEM, nao uma tabela de "pedidos": ela chega na
// mesma caixa que o resto, com dois botoes em vez de nenhum. Assim so existe um
// lugar pra olhar quando alguem interage com voce — e o contador de nao lidas
// cobre as duas coisas de uma vez.
//
// As abas separam por TIPO, nao por estado de leitura: "avisos" sai da entrada
// porque mensagem de sistema chega em rajada (venda no mercado, concessao
// inicial) e afogaria a mensagem de gente de verdade, que e a que pede resposta.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PencilSimple, UserPlus, X } from '@phosphor-icons/react'
import {
  ErroServidor, detalheDeErro,
  type AmigoDetalhado, type AnexoItemCorreio, type MensagemCorreio,
} from '@/data/remote/servidor'
import * as correioRpc from '@/data/remote/correioRealtime'
import { supabase } from '@/lib/supabase'
import { useToastStore, type ToastErroDetalhe } from '@/stores/toastStore'
import { useDeviceMode } from '@/stores/uiStore'
import {
  GameButton, GameCard, GameInput, SectionLabel, SegmentedTabs,
} from '@/components/game/controls'
import { ComporMensagem } from './ComporMensagem'
import { ConversaDM } from './ConversaDM'
import { LinhaDeMensagem } from './LinhaDeMensagem'
import { PainelAmigos } from './PainelAmigos'

const STALE_MS = 15000

type Aba = 'entrada' | 'enviados' | 'sistema' | 'amigos'

function toast(mensagem: string, tipo: 'success' | 'error' = 'success', erroDetalhe?: ToastErroDetalhe) {
  useToastStore.getState().pushToast(mensagem, tipo, 'world', undefined, erroDetalhe)
}

function aoFalhar(padrao: string) {
  return (e: unknown) => toast(e instanceof ErroServidor ? e.message : padrao, 'error', detalheDeErro(e))
}

export function CorreioMenu() {
  const qc = useQueryClient()
  const { compacto } = useDeviceMode()
  const [nick, setNick] = useState('')
  const [aba, setAba] = useState<Aba>('entrada')
  const [compondo, setCompondo] = useState<{ nickInicial?: string } | null>(null)
  const [respondendoA, setRespondendoA] = useState<MensagemCorreio | null>(null)
  const [amigoAberto, setAmigoAberto] = useState<AmigoDetalhado | null>(null)
  const [meuId, setMeuId] = useState<string | null>(null)

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

  // Realtime substitui o poll de 15s: qualquer INSERT/UPDATE nas MINHAS
  // mensagens (pedido novo, resposta, mensagem de sistema) invalida a query.
  //
  // BUG REAL CORRIGIDO: `assinarCorreioAoVivo` usa `supabase.channel('correio-'+userId)`,
  // nome fixo por usuario — chamar de novo com o mesmo nome ANTES do primeiro canal
  // ser removido devolve o MESMO canal ja inscrito, e `.on()` nele estoura
  // ("cannot add postgres_changes callbacks... after subscribe()"). Como a
  // inscricao so acontece dentro do `.then()` de `getSession()` (gap assincrono),
  // o StrictMode do React (ou so um remount rapido de verdade) roda o efeito de
  // novo ANTES desse `.then()` resolver — a limpeza da 1a rodada ainda achava
  // `parar` nulo (a inscricao nem tinha terminado) e nao desfazia nada; a 2a
  // rodada inscrevia no mesmo canal ja vivo. `cancelado` fecha essa janela: se
  // a limpeza ja rodou quando o `.then()` finalmente resolve, a inscricao nem
  // comeca.
  useEffect(() => {
    let cancelado = false
    let parar: (() => void) | null = null
    void supabase.auth.getSession().then(({ data: sessao }) => {
      if (cancelado) return
      const userId = sessao.session?.user.id
      if (!userId) return
      parar = correioRpc.assinarCorreioAoVivo(userId, () => { void qc.invalidateQueries({ queryKey: ['correio'] }) })
    })
    return () => { cancelado = true; parar?.() }
  }, [qc])

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

  // A RPC ja credita o item na mesma transacao (sem fila de entrega — ver
  // migracao #10) e `correioRpc.coletarAnexo` ja faz o refetch cirurgico do
  // item no client. So falta atualizar a caixa de entrada.
  const coletar = useMutation({
    mutationFn: (id: string) => correioRpc.coletarAnexo(id),
    onSuccess: (r) => { toast(r.mensagem); recarregar() },
    onError: aoFalhar('Nao foi possivel coletar.'),
  })

  const enviar = useMutation({
    mutationFn: (d: { nick: string; assunto: string; corpo: string; anexos: AnexoItemCorreio[] }) =>
      correioRpc.enviarCorreio(d.nick, d.assunto, d.corpo, d.anexos),
    onSuccess: (r) => { toast(r.mensagem); setCompondo(null); recarregar() },
    onError: aoFalhar('Nao foi possivel enviar a mensagem.'),
  })

  const responderMsg = useMutation({
    mutationFn: (d: { id: string; corpo: string }) => correioRpc.responderCorreio(d.id, d.corpo),
    onSuccess: (r) => { toast(r.mensagem); setRespondendoA(null); recarregar() },
    onError: aoFalhar('Nao foi possivel responder.'),
  })

  const excluir = useMutation({
    mutationFn: (id: string) => correioRpc.excluirCorreio(id),
    onSuccess: recarregar,
    onError: aoFalhar('Nao foi possivel excluir.'),
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

  const entrada = useMemo(
    () => (data?.mensagens ?? []).filter((m) => m.tipo !== 'sistema'),
    [data?.mensagens],
  )
  const sistema = useMemo(
    () => (data?.mensagens ?? []).filter((m) => m.tipo === 'sistema'),
    [data?.mensagens],
  )
  const naoLidasEntrada = entrada.filter((m) => m.estado === 'pendente').length
  const naoLidasSistema = sistema.filter((m) => m.estado === 'pendente').length
  const dmNaoLidas = (data?.amigos ?? []).reduce((t, a) => t + a.naoLidas, 0)

  // Bloquear ou remover o amigo cuja conversa esta aberta tem que FECHAR a
  // conversa: a linha some da lista por baixo e o painel continuaria mostrando
  // um fio que o servidor ja nao deixa mais escrever.
  useEffect(() => {
    if (!amigoAberto) return
    if (!(data?.amigos ?? []).some((a) => a.userId === amigoAberto.userId)) setAmigoAberto(null)
  }, [data?.amigos, amigoAberto])

  // O objeto do amigo aberto vem sempre da query, nunca do state: senao o painel
  // congela `naoLidas` e `online` no valor que tinham no clique.
  const amigoAtual = amigoAberto
    ? (data?.amigos ?? []).find((a) => a.userId === amigoAberto.userId) ?? null
    : null

  const ocupado = remover.isPending || bloquear.isPending || desbloquear.isPending

  const abrirComposicao = useCallback((nickInicial?: string) => {
    setRespondendoA(null)
    setCompondo({ nickInicial })
    setAba('entrada')
  }, [])

  const abas: { value: Aba; label: string }[] = [
    { value: 'entrada', label: `Entrada${naoLidasEntrada ? ` (${naoLidasEntrada})` : ''}` },
    { value: 'enviados', label: `Enviados${data?.enviados.length ? ` (${data.enviados.length})` : ''}` },
    { value: 'sistema', label: `Avisos${naoLidasSistema ? ` (${naoLidasSistema})` : ''}` },
    { value: 'amigos', label: `Amigos${dmNaoLidas ? ` (${dmNaoLidas})` : ''}` },
  ]

  const lista = aba === 'enviados' ? (data?.enviados ?? []) : aba === 'sistema' ? sistema : entrada
  const vazio = aba === 'enviados'
    ? 'Voce ainda nao enviou nenhuma mensagem.'
    : aba === 'sistema' ? 'Nenhum aviso.' : 'Sua caixa esta vazia.'
  const titulo = aba === 'enviados'
    ? 'ENVIADOS'
    : aba === 'sistema'
      ? `AVISOS DO JOGO ${naoLidasSistema ? `(${naoLidasSistema} novo(s))` : ''}`
      : `CAIXA DE ENTRADA ${naoLidasEntrada ? `(${naoLidasEntrada} nova(s))` : ''}`

  const painelEsquerdo = (
    <div className="flex flex-col gap-[.55em]">
      {aba !== 'amigos' && (
        <div className="flex justify-end">
          <GameButton variant="primary" onClick={() => abrirComposicao()}>
            <PencilSimple /> Escrever
          </GameButton>
        </div>
      )}

      {compondo && (
        <ComporMensagem
          nickInicial={compondo.nickInicial}
          enviando={enviar.isPending}
          onCancelar={() => setCompondo(null)}
          onEnviar={(d) => enviar.mutate(d)}
        />
      )}
      {respondendoA && (
        <ComporMensagem
          respondendoA={{ id: respondendoA.id, deNome: respondendoA.de_nome, assunto: respondendoA.assunto }}
          enviando={responderMsg.isPending}
          onCancelar={() => setRespondendoA(null)}
          onEnviar={(d) => responderMsg.mutate({ id: respondendoA.id, corpo: d.corpo })}
        />
      )}

      {isLoading && <p className="text-n400">Carregando...</p>}

      {!isLoading && aba === 'amigos' && (
        <PainelAmigos
          amigos={data?.amigos ?? []}
          bloqueados={data?.bloqueados ?? []}
          selecionado={amigoAtual?.userId ?? null}
          ocupado={ocupado}
          onSelecionar={setAmigoAberto}
          onEscrever={abrirComposicao}
          onRemover={(a) => remover.mutate(a.userId)}
          onBloquear={(a) => bloquear.mutate(a.userId)}
          onDesbloquear={(b) => desbloquear.mutate(b.userId)}
        />
      )}

      {!isLoading && aba !== 'amigos' && (
        <div>
          <SectionLabel>{titulo}</SectionLabel>
          {lista.length === 0 && <p className="text-n400">{vazio}</p>}
          <div className="mt-[.4em] flex flex-col gap-[.4em]">
            {lista.map((m) => (
              <LinhaDeMensagem
                key={m.id}
                m={m}
                enviada={aba === 'enviados'}
                respondendo={responderPedido.isPending}
                coletando={coletar.isPending}
                excluindo={excluir.isPending}
                onMarcarLida={marcarLida.mutate}
                onResponderPedido={(id, aceitar) => responderPedido.mutate({ id, aceitar })}
                onColetar={coletar.mutate}
                onResponder={(msg) => { setCompondo(null); setRespondendoA(msg) }}
                onExcluir={excluir.mutate}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )

  const painelDireito = amigoAtual && meuId ? (
    <GameCard className="p-[.6em]">
      <div className="mb-[.35em] flex justify-end">
        <GameButton variant="ghost" aria-label="Fechar conversa" onClick={() => setAmigoAberto(null)}>
          <X />
        </GameButton>
      </div>
      <ConversaDM
        // `key` por amigo: trocar de conversa precisa REMONTAR, nao reusar.
        // Sem isto o fio do amigo anterior fica na tela ate o novo carregar.
        key={amigoAtual.userId}
        amigo={amigoAtual}
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
