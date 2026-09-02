// Troca direta entre dois jogadores (PH-120): a MESA (fatia 1), a OFERTA em
// cima dela (fatia 2, PH-310) e a CONFIRMACAO DUPLA que executa (fatia 3,
// PH-312).
//
// O QUE ESTE ARQUIVO FAZ, E O QUE ELE AINDA NAO FAZ
// ---------------------------------------------------------------------------
// Abrir, aceitar e encerrar a mesa; ler a mesa viva do jogador; por e tirar
// POKE e item da mesa, com reserva de verdade do outro lado; e confirmar,
// carregando a versao da oferta que a tela desenhou. Falta a tela (fatia 4).
//
// A CONFIRMACAO NAO TEM PASSO SEPARADO DE "EXECUTAR". Quem confirma por ultimo
// executa, na mesma transacao do servidor — uma terceira chamada seria uma
// terceira janela pra oferta mudar entre a confirmacao e o efeito.
//
// TODA ESCRITA PASSA POR RPC, e a tabela nao tem policy de INSERT/UPDATE. As
// regras que impedem o golpe (bloqueio, sessao dupla, quem pode aceitar, quem
// pode cancelar) vivem dentro das funcoes `security definer` — uma policy de
// escrita abriria rota paralela sem nenhuma delas, o mesmo furo que a PH-23
// achou no chat mundial e que o Social evita do mesmo jeito.
//
// A LEITURA e RLS-direta: a policy da tabela ja limita a linha a quem esta nela.
import { schema, supabase } from '@/lib/supabase'
import { ErroServidor } from './servidor'
import { ESTADOS_VIVOS, type EstadoDeTroca, type TipoDeOferta } from '@/data/troca'
import { useGameStateStore } from '@/stores/gameStateStore'
import { mochilaCarregada, useMochilaStore } from '@/stores/mochilaStore'
import { descartarIdsConhecidos } from './playerRepository'
import { COLUNAS_DE_POKE, rowToPoke } from './playerMapper'

// As RPCs so existem no banco depois do `db push`, e o gerador de tipos so
// conhece o schema atual — mesmo escape hatch de `socialRealtime.ts`,
// `mercadoRpc.ts` e `acoesRpc.ts`.
const db = supabase as unknown as {
  from: (tabela: string) => any
  rpc: (nome: string, params?: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }>
}

/** A mesa como ela chega do banco. */
export interface SessaoDeTroca {
  id: string
  anfitriaoId: string
  convidadoId: string
  estado: EstadoDeTroca
  criadaEm: string
  expiraEm: string
  encerradaPor: string | null
  encerradaEm: string | null
  /**
   * Sobe a cada alteracao da oferta, por trigger no banco (PH-310). A fatia 3
   * carrega este numero na confirmacao e o servidor recusa o que vier velho —
   * e o que impede trocar a oferta no instante em que o outro confirma.
   */
  versao: number
  /**
   * Em qual versao cada lado confirmou (PH-312). `null` = nao confirmou.
   *
   * Compare com `versao` usando `confirmacaoValida` em vez de tratar como
   * booleano: um numero antigo aqui significa "confirmou OUTRA mesa", que na
   * tela tem que aparecer como nao confirmado.
   */
  versaoConfirmadaAnfitriao: number | null
  versaoConfirmadaConvidado: number | null
}

interface LinhaDeTroca {
  id: string
  anfitriao_id: string
  convidado_id: string
  estado: EstadoDeTroca
  criada_em: string
  expira_em: string
  encerrada_por: string | null
  encerrada_em: string | null
  versao: number | null
  versao_confirmada_anfitriao: number | null
  versao_confirmada_convidado: number | null
}

function daLinha(l: LinhaDeTroca): SessaoDeTroca {
  return {
    id: l.id,
    anfitriaoId: l.anfitriao_id,
    convidadoId: l.convidado_id,
    estado: l.estado,
    criadaEm: l.criada_em,
    expiraEm: l.expira_em,
    encerradaPor: l.encerrada_por,
    encerradaEm: l.encerrada_em,
    // A coluna nasceu na fatia 2 com `default 0`. O `?? 0` cobre a janela em
    // que o cliente novo fala com um banco que ainda nao recebeu a migration —
    // ler `undefined` como versao viraria `NaN` na comparacao da fatia 3.
    versao: l.versao ?? 0,
    versaoConfirmadaAnfitriao: l.versao_confirmada_anfitriao ?? null,
    versaoConfirmadaConvidado: l.versao_confirmada_convidado ?? null,
  }
}

/**
 * A mensagem do `raise exception` chega inteira do Postgres e ela E a mensagem
 * do jogador — as do SQL foram escritas assim de proposito ("Este jogador ja
 * esta em outra troca."). Repetir a traducao aqui criaria duas frases pro mesmo
 * caso, e a de fora envelheceria calada.
 */
function aoFalhar(erro: { message: string } | null): void {
  if (!erro) return
  throw new ErroServidor(400, erro.message)
}

/** Convida alguem pra trocar. O outro lado ainda precisa aceitar. */
export async function abrirTroca(convidadoId: string): Promise<SessaoDeTroca> {
  const { data, error } = await db.rpc('abrir_troca', { p_convidado_id: convidadoId })
  aoFalhar(error)
  return daLinha(data as LinhaDeTroca)
}

/** Aceita um convite. So o convidado consegue — o servidor confere. */
export async function aceitarTroca(sessaoId: string): Promise<SessaoDeTroca> {
  const { data, error } = await db.rpc('aceitar_troca', { p_sessao_id: sessaoId })
  aoFalhar(error)
  return daLinha(data as LinhaDeTroca)
}

/**
 * Sai da mesa. QUALQUER UM DOS DOIS pode, a qualquer momento, ate a fatia 3
 * executar — e isso e o oposto do golpe: quem desconfia sai sem depender do
 * outro.
 */
export async function encerrarTroca(sessaoId: string): Promise<SessaoDeTroca> {
  const { data, error } = await db.rpc('encerrar_troca', {
    p_sessao_id: sessaoId,
    p_motivo: 'cancelada',
  })
  aoFalhar(error)
  return daLinha(data as LinhaDeTroca)
}

/**
 * A mesa viva do jogador, ou `null`.
 *
 * Leitura direta com RLS: a policy ja limita as linhas a quem esta nelas, entao
 * nao ha filtro por `user_id` aqui — pedir isso ao cliente seria confiar nele
 * pra uma regra que o banco ja aplica.
 *
 * FILTRA POR `expira_em` ALEM DO ESTADO. A varredura do cron roda de 5 em 5
 * minutos, entao existe uma janela em que a linha ainda diz 'aberta' e o banco
 * ja a recusaria. Sem este corte a tela mostraria uma mesa que nao aceita mais
 * nada — e o jogador ficaria clicando num botao que so devolve erro.
 */
export async function minhaTrocaViva(): Promise<SessaoDeTroca | null> {
  const { data, error } = await db
    .from('troca_sessao')
    .select('*')
    .in('estado', [...ESTADOS_VIVOS])
    .gt('expira_em', new Date().toISOString())
    .order('criada_em', { ascending: false })
    .limit(1)
  aoFalhar(error)
  const linhas = (data ?? []) as LinhaDeTroca[]
  return linhas.length > 0 ? daLinha(linhas[0]) : null
}

// ---------------------------------------------------------------------------
// A oferta (PH-310, fatia 2)
// ---------------------------------------------------------------------------
// Toda funcao abaixo devolve a SESSAO, nao a linha inserida. E de proposito: o
// que o chamador precisa depois de mexer na mesa e a `versao` nova, e devolver
// a linha obrigaria uma segunda ida ao banco so pra descobri-la.

/**
 * Uma linha da mesa: um POKE, ou uma pilha de um item.
 *
 * OS CAMPOS DO POKE SAO COPIA, NAO JUNCAO (PH-314). A RLS de
 * `pokemon_instances` tem uma policy so — "o jogador le os proprios POKEs" —
 * entao ler a linha original do outro lado e impossivel, e ver o que se vai
 * RECEBER e o ponto da troca. `por_poke_na_mesa` copia estes cinco campos no
 * momento em que o POKE entra, como `market_listings` ja faz ha meses.
 */
export interface LinhaDaMesa {
  id: string
  sessaoId: string
  donoId: string
  tipo: TipoDeOferta
  pokeUid: string | null
  itemId: string | null
  quantidade: number
  speciesId: string | null
  nivel: number | null
  shiny: boolean
  raridade: string | null
  ivPercent: number | null
}

interface LinhaDeOfertaNoBanco {
  id: string
  sessao_id: string
  dono_id: string
  tipo: TipoDeOferta
  poke_uid: string | null
  item_id: string | null
  quantidade: number
  species_id: string | null
  level: number | null
  is_shiny: boolean | null
  rarity: string | null
  iv_percent: number | null
}

function daLinhaDaMesa(l: LinhaDeOfertaNoBanco): LinhaDaMesa {
  return {
    id: l.id,
    sessaoId: l.sessao_id,
    donoId: l.dono_id,
    tipo: l.tipo,
    pokeUid: l.poke_uid,
    itemId: l.item_id,
    quantidade: l.quantidade,
    speciesId: l.species_id,
    nivel: l.level,
    shiny: l.is_shiny ?? false,
    raridade: l.rarity,
    ivPercent: l.iv_percent,
  }
}

// ---------------------------------------------------------------------------
// RECONCILIAR O ESTADO LOCAL NAO E COSMETICO AQUI — E CORRECAO
// ---------------------------------------------------------------------------
// `savePlayerState` (o flush) escreve `pokemon_instances` e `player_items` a
// partir do estado LOCAL, e faz duas coisas que desfazem a reserva do servidor
// se o cliente nao acompanhar:
//
//  1. `upsert(gameStateToPokemonRows(...))` grava `location: 'team' | 'bag'` pra
//     todo POKE que ainda estiver em `team`/`bagPokes`. Um POKE deixado na lista
//     local voltaria de 'troca' pra 'bag' no proximo save — reservado na mesa e
//     disponivel na mochila ao mesmo tempo.
//  2. O diff de exclusao (PH-182) apaga do banco todo id CONHECIDO que sumiu do
//     estado. Tirar o POKE da lista local sem tirar do dominio conhecido faria o
//     save seguinte APAGAR a linha — o POKE deixaria de existir no meio da troca.
//
// Por isso as duas metades andam juntas: sai da lista local E sai do dominio.
// `descartarIdsConhecidos` e exatamente a ferramenta pro caso "quem mexeu na
// linha foi o servidor" — a linha continua existindo, so nao e mais do estado
// local que ela deve vir.
//
// Item tem a mesma armadilha por outro caminho: `gameStateToItemRows` grava a
// quantidade local por cima. Debitar no servidor sem debitar aqui faria o
// proximo save devolver o que foi pra mesa — duplicando o item.

function tirarPokeDoEstadoLocal(pokeUid: string): void {
  useGameStateStore.setState((s) => ({
    team: s.team.filter((p) => p.uid !== pokeUid),
    bagPokes: s.bagPokes.filter((p) => p.uid !== pokeUid),
  }))
  descartarIdsConhecidos([pokeUid])
}

function somarItemNoEstadoLocal(itemId: string, delta: number): void {
  useGameStateStore.setState((s) => {
    const atual = s.items[itemId] ?? 0
    // Nunca abaixo de zero: o servidor ja recusou o que nao havia, e um numero
    // negativo aqui viraria `check (quantity >= 0)` estourado no proximo save.
    return { items: { ...s.items, [itemId]: Math.max(0, atual + delta) } }
  })
}

/**
 * Poe um POKE na mesa. Ele SAI da mochila de quem ofereceu enquanto estiver
 * la — nao e uma marca, e mudanca de lugar (`location = 'troca'`), e e o que
 * impede vende-lo, anuncia-lo ou evolui-lo no meio da troca.
 */
export async function porPokeNaMesa(sessaoId: string, pokeUid: string): Promise<SessaoDeTroca> {
  const { data, error } = await db.rpc('por_poke_na_mesa', {
    p_sessao_id: sessaoId,
    p_poke_id: pokeUid,
  })
  aoFalhar(error)
  tirarPokeDoEstadoLocal(pokeUid)
  return daLinha(data as LinhaDeTroca)
}

/** Tira o POKE da mesa e devolve pra mochila. */
export async function tirarPokeDaMesa(sessaoId: string, pokeUid: string): Promise<SessaoDeTroca> {
  const { data, error } = await db.rpc('tirar_poke_da_mesa', {
    p_sessao_id: sessaoId,
    p_poke_id: pokeUid,
  })
  aoFalhar(error)
  await devolverPokeAoEstadoLocal(pokeUid)
  return daLinha(data as LinhaDeTroca)
}

/**
 * O POKE voltou pra 'bag' no servidor; traz a linha de volta pra lista local.
 *
 * So quando a Mochila esta carregada, pelo mesmo motivo de
 * `refetchAposAnuncio` no Mercado: inserir um POKE numa lista que nasceu vazia
 * faria a tela mostrar UM POKE numa conta de milhares.
 *
 * O id NAO volta pro dominio conhecido de proposito. Ele nao precisa: o dominio
 * so serve pro diff de EXCLUSAO, e um id fora dele nunca gera DELETE. Devolve-lo
 * seria assumir que o cliente voltou a ser autoritativo sobre a reserva inteira,
 * que e a suposicao que a PH-182 provou cara.
 */
async function devolverPokeAoEstadoLocal(pokeUid: string): Promise<void> {
  if (!mochilaCarregada()) return
  const { data } = await db.from('pokemon_instances').select(COLUNAS_DE_POKE).eq('id', pokeUid).maybeSingle()
  if (!data || data.location !== 'bag') return
  const poke = rowToPoke(data)
  useGameStateStore.setState((s) => (
    s.bagPokes.some((p) => p.uid === pokeUid)
      ? { bagPokes: s.bagPokes }
      : { bagPokes: [...s.bagPokes, poke] }
  ))
}

/**
 * Poe itens na mesa. A quantidade e DEBITADA do inventario na hora — mesmo
 * espirito do escrow do Mercado, e pelo mesmo motivo: item prometido e nao
 * reservado e item que pode ser vendido antes de a troca executar.
 */
export async function porItemNaMesa(
  sessaoId: string,
  itemId: string,
  quantidade: number,
): Promise<SessaoDeTroca> {
  const { data, error } = await db.rpc('por_item_na_mesa', {
    p_sessao_id: sessaoId,
    p_item_id: itemId,
    p_quantidade: quantidade,
  })
  aoFalhar(error)
  somarItemNoEstadoLocal(itemId, -quantidade)
  return daLinha(data as LinhaDeTroca)
}

/** Tira parte (ou tudo) de uma pilha da mesa e devolve pro inventario. */
export async function tirarItemDaMesa(
  sessaoId: string,
  itemId: string,
  quantidade: number,
): Promise<SessaoDeTroca> {
  const { data, error } = await db.rpc('tirar_item_da_mesa', {
    p_sessao_id: sessaoId,
    p_item_id: itemId,
    p_quantidade: quantidade,
  })
  aoFalhar(error)
  somarItemNoEstadoLocal(itemId, quantidade)
  return daLinha(data as LinhaDeTroca)
}

/**
 * O que esta na mesa, dos DOIS lados.
 *
 * Leitura direta com RLS, como `minhaTrocaViva`: a policy da tabela ja limita
 * as linhas as sessoes de que o jogador participa. Ver o que o outro ofereceu e
 * o ponto da troca, entao nao ha filtro por dono aqui.
 */
/**
 * Uma mesa PELO ID, viva ou nao (PH-321).
 *
 * `minhaTrocaViva` devolve so o que ainda esta de pe, e por isso o lado que NAO
 * deu o ultimo clique so aprendia `null` quando a mesa acabava — a tela sumia
 * sem dizer se a troca saiu, se o outro cancelou ou se o prazo venceu.
 *
 * A informacao existe na linha (`estado`, `encerrada_por`) e a policy continua
 * deixando os dois participantes lerem depois de encerrada. Faltava perguntar.
 */
export async function lerTroca(sessaoId: string): Promise<SessaoDeTroca | null> {
  const { data, error } = await db.from('troca_sessao').select('*').eq('id', sessaoId).maybeSingle()
  aoFalhar(error)
  return data ? daLinha(data as LinhaDeTroca) : null
}

export async function lerMesa(sessaoId: string): Promise<LinhaDaMesa[]> {
  const { data, error } = await db
    .from('troca_oferta')
    .select('*')
    .eq('sessao_id', sessaoId)
    .order('criada_em', { ascending: true })
  aoFalhar(error)
  return ((data ?? []) as LinhaDeOfertaNoBanco[]).map(daLinhaDaMesa)
}

// ---------------------------------------------------------------------------
// A confirmacao dupla e a execucao (PH-312, fatia 3)
// ---------------------------------------------------------------------------

/**
 * Confirma a mesa NA VERSAO que o jogador esta vendo.
 *
 * A versao vai junto de proposito e nao e detalhe de implementacao: e ela que
 * impede o golpe. Se a oferta mudou entre a tela e o clique, o servidor recusa
 * com "A oferta mudou" em vez de fechar uma troca que o jogador nao viu.
 *
 * Passe SEMPRE a `versao` da sessao que a tela desenhou — nunca uma relida
 * agora, que seria justamente concordar com a mudanca sem olhar.
 *
 * QUANDO ESTA CHAMADA E A SEGUNDA CONFIRMACAO VALIDA, ELA JA EXECUTA A TROCA:
 * a sessao volta com `estado === 'concluida'`. Nao ha uma terceira chamada,
 * porque ela seria uma terceira janela pra oferta mudar.
 */
export async function confirmarTroca(sessaoId: string, versao: number): Promise<SessaoDeTroca> {
  const { data, error } = await db.rpc('confirmar_troca', {
    p_sessao_id: sessaoId,
    p_versao: versao,
  })
  aoFalhar(error)
  const sessao = daLinha(data as LinhaDeTroca)
  if (sessao.estado === 'concluida') aposATrocaExecutar()
  return sessao
}

/** Volta atras na propria confirmacao, enquanto a troca nao executou. */
export async function desconfirmarTroca(sessaoId: string): Promise<SessaoDeTroca> {
  const { data, error } = await db.rpc('desconfirmar_troca', { p_sessao_id: sessaoId })
  aoFalhar(error)
  return daLinha(data as LinhaDeTroca)
}

/**
 * O que o cliente precisa esquecer depois que a troca executou.
 *
 * POKE recebido: a Mochila e invalidada. Nao adianta inserir na lista local —
 * o servidor mudou o `user_id` de linhas que este cliente nunca leu, e inventar
 * a lista aqui seria mostrar uma mochila que nao existe. Invalidar tambem chama
 * `esquecerIdsDaReserva`, que e o que impede o proximo save de tentar apagar
 * qualquer coisa com base num dominio que ficou velho.
 *
 * ITEM recebido: NADA a fazer aqui, e isso e de propósito. O credito foi pra
 * `market_deliveries` e e reivindicado no proximo `/estado`, dentro do request
 * que ja vai gravar o estado. Somar no estado local aqui criaria uma segunda
 * fonte pro mesmo credito, e as duas se somariam.
 */
function aposATrocaExecutar(): void {
  useMochilaStore.getState().invalidar()
}

// ---------------------------------------------------------------------------
// Tempo real (PH-314, fatia 4)
// ---------------------------------------------------------------------------

/**
 * Avisa quando QUALQUER coisa da minha mesa muda — inclusive do outro lado.
 *
 * ASSINA SO `troca_sessao`, e isso cobre a oferta inteira. O trigger
 * `troca_oferta_versao` (fatia 2) faz um UPDATE na sessao a cada insert, update
 * ou delete de linha de oferta, porque e assim que a versao sobe. Entao toda
 * alteracao da mesa ja produz um evento aqui, sem excecao.
 *
 * Publicar `troca_oferta` junto nao daria nada de graca e traria um problema:
 * com `replica identity` default, o DELETE so leva a chave, e o Realtime
 * descarta o evento por nao conseguir avaliar a RLS. Ver a migration da PH-314.
 *
 * SEM FILTRO no `postgres_changes`. A policy de `troca_sessao` ja limita as
 * linhas aos dois participantes, e um filtro por `anfitriao_id` deixaria de
 * fora justamente a metade das mesas em que o jogador e o convidado.
 *
 * O callback NAO recebe a linha: quem escuta faz refetch. Aplicar o payload
 * seria confiar num estado que chegou por fora do caminho de leitura, e a
 * confirmacao da fatia 3 depende da `versao` estar certa.
 */
export function assinarMinhaTroca(userId: string, aoMudar: () => void): () => void {
  const canal = supabase
    .channel(`troca-${userId}`)
    .on('postgres_changes', { event: '*', schema, table: 'troca_sessao' }, () => aoMudar())
    .subscribe()
  return () => { void supabase.removeChannel(canal) }
}
