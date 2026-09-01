// PH-314 (PH-120, fatia 4) — a tela da mesa de troca.
//
// AS TRES COISAS QUE ESTA TELA TEM OBRIGACAO DE DEIXAR CLARAS
// ---------------------------------------------------------------------------
//  1. CONFIRMAR NAO E O FIM. Enquanto o outro nao confirmar na mesma versao, da
//     pra voltar atras. O botao diz em qual estado esta, e o de desconfirmar
//     aparece no lugar — nao ao lado.
//  2. ALTERAR A OFERTA DERRUBA AS CONFIRMACOES. Quando a versao sobe, o
//     "confirmado" do outro lado some NA HORA. Um check verde estatico aqui
//     seria a propria tela executando o golpe que o servidor impede: o jogador
//     olharia pro check, clicaria em confirmar, e estaria concordando com uma
//     mesa diferente da que viu.
//  3. O QUE ESTA NA MESA SAIU DA MOCHILA. O POKE ofertado esta em
//     `location = 'troca'` e o item foi debitado — nao sao promessas. A tela
//     nao pode sugerir que continuam disponiveis, e por isso a lista de escolha
//     vem de `bagPokes`, que ja nao os contem.
//
// Nenhuma REGRA mora aqui. Quem pode aceitar, o que pode entrar, se a
// confirmacao vale — tudo isso e do servidor, e o cliente repassa a mensagem
// dele. Ver `useTroca` e as migrations das fatias 1 a 3.
import { useEffect, useMemo, useState } from 'react'
import { ArrowsLeftRight, Check, Clock, Plus, X } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { GameButton, GameInput, GameSelect, Carregando, SectionLabel } from '@/components/game/controls'
import { SPECIES } from '@/data/pokes'
import { ITEMS } from '@/data/items'
import { faceIconUrl, itemIconUrl } from '@/data/sprites'
import type { LinhaDaMesa } from '@/data/remote/trocaRpc'
import * as rankingRpc from '@/data/remote/rankingRpc'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useMochilaStore } from '@/stores/mochilaStore'
import { useTroca, type EstadoDaTroca } from './useTroca'

function nomeDaEspecie(id: string | null): string {
  if (!id) return 'POKE'
  return SPECIES[id]?.name ?? id
}

function nomeDoItem(id: string | null): string {
  if (!id) return 'Item'
  return ITEMS[id]?.name ?? id
}

/** O nick do outro lado. A sessao so guarda ids — o nome vem do perfil publico. */
function useNickDoOutro(outroId: string | null): string {
  const { data } = useQuery({
    queryKey: ['perfil-publico', outroId],
    queryFn: () => rankingRpc.perfilPublico(outroId as string),
    enabled: !!outroId,
    staleTime: 300000,
  })
  return data?.nome ?? 'o outro treinador'
}

/**
 * Quanto falta pra mesa expirar.
 *
 * Conta no cliente e nao no servidor porque e so leitura: quem expira de
 * verdade e o `expirar_trocas` do banco, e a tela nunca decide nada com este
 * numero. Se os dois relogios discordarem, o servidor ganha — e o jogador ve a
 * recusa com a mensagem dele.
 */
function useRestante(expiraEm: string | undefined): string {
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  if (!expiraEm) return ''
  const faltam = Math.max(0, Math.floor((new Date(expiraEm).getTime() - agora) / 1000))
  const m = Math.floor(faltam / 60)
  const s = faltam % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function LinhaDaOferta({ linha, aoTirar }: { linha: LinhaDaMesa; aoTirar?: () => void }) {
  const ehPoke = linha.tipo === 'poke'
  const icone = ehPoke ? faceIconUrl(linha.speciesId ?? '') : itemIconUrl(linha.itemId ?? '')
  return (
    <div className="flex items-center gap-[.4em] rounded-[.45em] border border-n800 bg-n900 px-[.4em] py-[.25em]">
      {icone ? <img src={icone} alt="" className="h-[1.5em] w-[1.5em] shrink-0 object-contain" /> : null}
      <span className="min-w-0 flex-1 truncate">
        {ehPoke ? nomeDaEspecie(linha.speciesId) : `${linha.quantidade}x ${nomeDoItem(linha.itemId)}`}
        {linha.shiny ? <span className="ml-[.3em] text-gold">shiny</span> : null}
      </span>
      {ehPoke && linha.nivel != null ? <span className="shrink-0 text-[.8em] text-n300">Lv {linha.nivel}</span> : null}
      {ehPoke && linha.ivPercent != null ? (
        <span className="shrink-0 font-mono text-[.7em] text-n500">{linha.ivPercent}% IV</span>
      ) : null}
      {aoTirar ? (
        <button
          type="button"
          onClick={aoTirar}
          aria-label="Tirar da mesa"
          title="Tirar da mesa"
          className="shrink-0 rounded-[.35em] p-[.15em] text-n500 transition-colors hover:bg-n800 hover:text-n100"
        >
          <X className="text-[.95em]" />
        </button>
      ) : null}
    </div>
  )
}

/** Escolher um POKE da mochila. A lista JA nao mostra o que esta na mesa —
 *  `porPokeNaMesa` tira do estado local, e e por isso que ela nao precisa
 *  filtrar nada aqui. */
function EscolherPoke({ troca }: { troca: EstadoDaTroca }) {
  const bagPokes = useGameStateStore((s) => s.bagPokes)
  const carregar = useMochilaStore((s) => s.carregar)
  const carregada = useMochilaStore((s) => s.carregada)
  const carregandoMochila = useMochilaStore((s) => s.carregando)
  const [aberto, setAberto] = useState(false)

  useEffect(() => { if (aberto && !carregada) void carregar() }, [aberto, carregada, carregar])

  if (!aberto) {
    return (
      <GameButton block onClick={() => setAberto(true)} disabled={troca.ocupado}>
        <Plus className="text-[1em]" /> POKE
      </GameButton>
    )
  }
  if (carregandoMochila) return <Carregando texto="Abrindo a mochila..." />

  return (
    <div className="flex max-h-[10em] flex-col gap-[.25em] overflow-y-auto rounded-[.45em] border border-n800 p-[.3em]">
      {bagPokes.length === 0 ? (
        <span className="p-[.4em] text-[.85em] text-n500">Nenhum POKE na mochila.</span>
      ) : bagPokes.map((p) => (
        <button
          key={p.uid}
          type="button"
          disabled={troca.ocupado}
          onClick={() => { void troca.porPoke(p.uid) }}
          className="flex items-center gap-[.4em] rounded-[.4em] px-[.35em] py-[.2em] text-left transition-colors hover:bg-n800 disabled:opacity-40"
        >
          <img src={faceIconUrl(p.speciesId) ?? undefined} alt="" className="h-[1.4em] w-[1.4em] shrink-0 object-contain" />
          <span className="min-w-0 flex-1 truncate">{nomeDaEspecie(p.speciesId)}</span>
          <span className="shrink-0 text-[.8em] text-n300">Lv {p.level}</span>
        </button>
      ))}
    </div>
  )
}

/** Escolher item e quantidade. */
function EscolherItem({ troca }: { troca: EstadoDaTroca }) {
  const items = useGameStateStore((s) => s.items)
  const disponiveis = useMemo(
    () => Object.entries(items).filter(([, q]) => q > 0).sort(([a], [b]) => a.localeCompare(b)),
    [items],
  )
  const [itemId, setItemId] = useState('')
  const [quantidade, setQuantidade] = useState('1')

  if (disponiveis.length === 0) return null
  const escolhido = itemId || disponiveis[0][0]
  const maximo = items[escolhido] ?? 0
  const pedido = Math.max(1, Math.min(maximo, Number(quantidade) || 1))

  return (
    <div className="flex items-center gap-[.3em]">
      <GameSelect className="min-w-0 flex-1" value={escolhido} onChange={(e) => setItemId(e.target.value)}>
        {disponiveis.map(([id, q]) => (
          <option key={id} value={id}>{nomeDoItem(id)} ({q})</option>
        ))}
      </GameSelect>
      <GameInput
        className="w-[3.5em] shrink-0 text-center"
        inputMode="numeric"
        value={quantidade}
        onChange={(e) => setQuantidade(e.target.value.replace(/\D/g, ''))}
        aria-label="Quantidade"
      />
      <GameButton
        className="shrink-0"
        disabled={troca.ocupado || maximo === 0}
        onClick={() => { void troca.porItem(escolhido, pedido) }}
      >
        <Plus className="text-[1em]" />
      </GameButton>
    </div>
  )
}

function Coluna({
  titulo, linhas, confirmado, aoTirar,
}: {
  titulo: string
  linhas: LinhaDaMesa[]
  confirmado: boolean
  aoTirar?: (linha: LinhaDaMesa) => void
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-[.35em]">
      <div className="flex items-center gap-[.35em]">
        <SectionLabel className="min-w-0 flex-1 truncate">{titulo}</SectionLabel>
        {/* O selo so aparece com a confirmacao VALIDA na versao atual. Ele some
            sozinho quando alguem mexe na mesa — e a regra 2 do cabecalho. */}
        {confirmado ? (
          <span className="flex shrink-0 items-center gap-[.2em] text-[.75em] text-green-400">
            <Check className="text-[.9em]" /> confirmou
          </span>
        ) : null}
      </div>
      <div className="flex min-h-[3em] flex-col gap-[.25em]">
        {linhas.length === 0
          ? <span className="p-[.3em] text-[.8em] text-n500">nada na mesa</span>
          : linhas.map((l) => (
            <LinhaDaOferta
              key={l.id}
              linha={l}
              aoTirar={aoTirar ? () => aoTirar(l) : undefined}
            />
          ))}
      </div>
    </div>
  )
}

export function TrocaMenu() {
  const troca = useTroca()
  const nick = useNickDoOutro(troca.outroId)
  const restante = useRestante(troca.sessao?.expiraEm)

  if (troca.carregando) return <Carregando texto="Procurando mesa aberta..." />

  if (!troca.sessao) {
    return (
      <div className="flex flex-col items-center gap-[.5em] rounded-[.7em] border border-dashed border-n700 p-[1.2em] text-center">
        <ArrowsLeftRight className="text-[1.8em] text-n500" />
        <span className="text-[.9em] text-n300">Você não está em nenhuma troca.</span>
        <span className="text-[.8em] text-n500">
          Convide alguem pelo Ranking ou pelo Correio — o icone de troca aparece ao lado do nome.
        </span>
      </div>
    )
  }

  if (troca.sessao.estado === 'convidada') {
    const souOConvidado = troca.papel === 'convidado'
    return (
      <div className="flex flex-col gap-[.6em]">
        <span className="text-[.9em]">
          {souOConvidado
            ? <><strong>{nick}</strong> quer trocar com você.</>
            : <>Convite enviado para <strong>{nick}</strong>. Esperando aceitar...</>}
        </span>
        <span className="flex items-center gap-[.3em] text-[.8em] text-n500">
          <Clock className="text-[.95em]" /> o convite expira em {restante}
        </span>
        <div className="flex gap-[.4em]">
          {souOConvidado ? (
            <GameButton variant="primary" block carregando={troca.ocupado} onClick={() => { void troca.aceitar() }}>
              Aceitar
            </GameButton>
          ) : null}
          <GameButton variant="danger" block carregando={troca.ocupado} onClick={() => { void troca.encerrar() }}>
            {souOConvidado ? 'Recusar' : 'Cancelar'}
          </GameButton>
        </div>
      </div>
    )
  }

  const mesaVazia = troca.mesa.length === 0

  return (
    <div className="flex flex-col gap-[.6em]">
      <div className="flex items-center gap-[.4em]">
        <span className="min-w-0 flex-1 truncate text-[.9em]">
          Trocando com <strong>{nick}</strong>
        </span>
        <span className="flex shrink-0 items-center gap-[.25em] text-[.8em] text-n400">
          <Clock className="text-[.95em]" /> {restante}
        </span>
      </div>

      <div className="flex gap-[.6em]">
        <Coluna
          titulo="Você oferece"
          linhas={troca.minhaOferta}
          confirmado={troca.euConfirmei}
          aoTirar={(l) => {
            if (l.tipo === 'poke' && l.pokeUid) void troca.tirarPoke(l.pokeUid)
            else if (l.itemId) void troca.tirarItem(l.itemId, l.quantidade)
          }}
        />
        <Coluna titulo={`${nick} oferece`} linhas={troca.ofertaDoOutro} confirmado={troca.eleConfirmou} />
      </div>

      {/* Adicionar some enquanto EU estou confirmado: mexer na mesa derruba as
          duas confirmacoes, e oferecer os dois botoes juntos convida o jogador
          a desfazer o proprio "sim" sem entender por que. Desconfirmar primeiro
          e explicito. */}
      {troca.euConfirmei ? null : (
        <div className="flex flex-col gap-[.35em]">
          <EscolherPoke troca={troca} />
          <EscolherItem troca={troca} />
        </div>
      )}

      <div className="flex flex-col gap-[.35em] border-t border-n800 pt-[.5em]">
        {troca.euConfirmei ? (
          <>
            <span className="text-[.8em] text-n400">
              Voce confirmou. Mexer na mesa desfaz isto — e desfaz a confirmacao dele tambem.
            </span>
            <GameButton block carregando={troca.ocupado} onClick={() => { void troca.desconfirmar() }}>
              Desfazer minha confirmacao
            </GameButton>
          </>
        ) : (
          <GameButton
            variant="primary"
            block
            disabled={mesaVazia}
            carregando={troca.ocupado}
            onClick={() => { void troca.confirmar() }}
          >
            {mesaVazia ? 'Ponha algo na mesa' : 'Confirmar minha parte'}
          </GameButton>
        )}
        <GameButton variant="danger" block carregando={troca.ocupado} onClick={() => { void troca.encerrar() }}>
          Cancelar a troca
        </GameButton>
      </div>
    </div>
  )
}
