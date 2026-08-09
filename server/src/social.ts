// Chat Mundo, Correio e Amizades.
//
// Tudo passa pelo servidor por uma razao de RLS, nao de gosto: o jogador so
// enxerga a PROPRIA linha em `players`, entao ele nao consegue nem resolver o
// nome de quem falou no chat. Afrouxar essa policy pra o cliente ler direto
// exporia ouro, itens e equipe de todo mundo — sao dois campos que o chat
// precisa, nao a linha inteira.
//
// Chat por POLLING e nao por Realtime: Realtime exigiria uma policy de SELECT
// pra `authenticated` em `chat_messages` (e portanto o cliente lendo a tabela
// direto), que e justamente o que a Fase D fechou. Com dezenas de jogadores,
// uma leitura a cada poucos segundos e barata e nao abre porta nenhuma.
import { ErroHttp, selecionar, selecionarTudo, inserir, atualizar, atualizarRetornando, chamarRpc, type Config } from './db.js'
import { enfileirarEntrega } from './entregas.js'

// Mensagens carregadas por vez. O cliente sempre pede as mais recentes e o
// historico nao e navegavel — chat de jogo e efemero por natureza.
const MAX_MENSAGENS = 60
const MAX_CORPO = 240
const MAX_ANEXOS = 3
// Intervalo minimo entre duas mensagens do mesmo jogador. Sem isso, um loop no
// console vira flood no chat de todo mundo.
const INTERVALO_MINIMO_MS = 1200

export interface LinhaChat {
  id: string
  user_id: string
  trainer_name: string
  body: string
  anexos: unknown
  created_at: string
}

export interface LinhaCorreio {
  id: string
  para_id: string
  de_id: string | null
  de_nome: string
  tipo: 'texto' | 'pedido_amizade' | 'sistema'
  assunto: string
  corpo: string
  estado: 'pendente' | 'aceito' | 'recusado' | 'lido'
  created_at: string
  read_at: string | null
  anexo_itens?: unknown
  anexo_coletado_em?: string | null
}

const texto = (v: unknown, campo: string, max: number): string => {
  if (typeof v !== 'string') throw new ErroHttp(400, `${campo} invalido`)
  const t = v.trim()
  if (!t || t.length > max) throw new ErroHttp(400, `${campo} invalido`)
  return t
}

/**
 * Anexo de chat: o SNAPSHOT do item/POKE, nunca so um id.
 *
 * Guardar o snapshot resolve duas coisas de uma vez. (1) O link continua
 * mostrando o que foi mostrado na hora, mesmo que o POKE seja vendido ou
 * evolua depois — um link que muda de conteudo com o tempo e pior que nenhum.
 * (2) Ninguem ganha um jeito de consultar POKE alheio por id: o servidor nunca
 * resolve o id, ele so repassa o que o autor exibiu.
 *
 * Os campos sao recortados aqui: um anexo e dado que outro jogador vai
 * renderizar, entao nada alem do que a lista abaixo permite atravessa.
 */
function saneiaAnexos(bruto: unknown): unknown[] {
  if (!Array.isArray(bruto)) return []
  return bruto.slice(0, MAX_ANEXOS).map((a) => {
    const o = (a ?? {}) as Record<string, unknown>
    const kind = o.kind === 'poke' ? 'poke' : 'item'
    const limpo: Record<string, unknown> = {
      kind,
      id: texto(o.id, 'anexo.id', 120),
      nome: texto(o.nome, 'anexo.nome', 60),
    }
    if (kind === 'poke') {
      limpo.speciesId = texto(o.speciesId, 'anexo.speciesId', 60)
      limpo.level = Math.max(1, Math.min(999, Number(o.level) || 1))
      limpo.rarity = texto(o.rarity ?? 'comum', 'anexo.rarity', 30)
      limpo.isShiny = Boolean(o.isShiny)
      limpo.ivPercent = Math.max(0, Math.min(100, Math.round(Number(o.ivPercent) || 0)))
    } else {
      limpo.quantidade = Math.max(0, Math.min(99_999_999, Math.round(Number(o.quantidade) || 0)))
    }
    return limpo
  })
}

export async function lerChat(cfg: Config): Promise<LinhaChat[]> {
  const linhas = await selecionar<LinhaChat>(
    cfg,
    `chat_messages?select=*&order=created_at.desc&limit=${MAX_MENSAGENS}`,
  )
  // O banco devolve do mais novo pro mais velho (pra o LIMIT pegar os certos);
  // a tela le de cima pra baixo.
  return linhas.reverse()
}

export async function enviarChat(
  cfg: Config,
  userId: string,
  corpo: { body?: unknown; anexos?: unknown },
): Promise<LinhaChat[]> {
  const body = texto(corpo.body, 'mensagem', MAX_CORPO)
  const anexos = saneiaAnexos(corpo.anexos)

  const [jogador] = await selecionar<{ trainer_name: string }>(
    cfg,
    `players?user_id=eq.${userId}&select=trainer_name`,
  )
  if (!jogador) throw new ErroHttp(404, 'jogador sem linha em `players`')

  const [ultima] = await selecionar<{ created_at: string }>(
    cfg,
    `chat_messages?user_id=eq.${userId}&select=created_at&order=created_at.desc&limit=1`,
  )
  if (ultima && Date.now() - new Date(ultima.created_at).getTime() < INTERVALO_MINIMO_MS) {
    throw new ErroHttp(429, 'Devagar — espere um instante antes de mandar outra mensagem.')
  }

  await inserir(cfg, 'chat_messages', {
    user_id: userId,
    trainer_name: jogador.trainer_name,
    body,
    anexos,
  })
  return lerChat(cfg)
}

// ---------------------------------------------------------------------------
// Correio
// ---------------------------------------------------------------------------

export interface Amigo {
  userId: string
  nome: string
  nivel: number
}

export async function caixaDeEntrada(cfg: Config, userId: string) {
  const [mensagens, amizades] = await Promise.all([
    selecionar<LinhaCorreio>(cfg, `mail_messages?para_id=eq.${userId}&select=*&order=created_at.desc&limit=80`),
    selecionarTudo<{ amigo_id: string }>(cfg, `friendships?user_id=eq.${userId}&select=amigo_id`),
  ])

  let amigos: Amigo[] = []
  if (amizades.length) {
    const ids = amizades.map((a) => a.amigo_id)
    const linhas = await selecionarTudo<{ user_id: string; trainer_name: string; trainer_level: number }>(
      cfg,
      `players?user_id=in.(${ids.join(',')})&select=user_id,trainer_name,trainer_level`,
    )
    amigos = linhas
      .map((l) => ({ userId: l.user_id, nome: l.trainer_name, nivel: l.trainer_level }))
      .sort((a, b) => a.nome.localeCompare(b.nome))
  }

  const naoLidas = mensagens.filter((m) => m.estado === 'pendente').length
  return { mensagens, amigos, naoLidas }
}

export async function pedirAmizade(cfg: Config, userId: string, nick: string) {
  const alvo = texto(nick, 'nick', 40)

  const [eu] = await selecionar<{ trainer_name: string }>(cfg, `players?user_id=eq.${userId}&select=trainer_name`)
  if (!eu) throw new ErroHttp(404, 'jogador sem linha em `players`')
  if (eu.trainer_name.toLowerCase() === alvo.toLowerCase()) {
    throw new ErroHttp(409, 'Voce nao pode adicionar a si mesmo.')
  }

  // RPC, e NAO `ilike`: `_` e curinga de uma letra em LIKE e e caractere valido
  // de nick, e `%` atravessava porque o `nick` que chega do cliente so tinha
  // limite de tamanho. Medido: `{"nick":"%"}` mandava pedido pra um jogador
  // arbitrario, e `"___"` pra qualquer um de tres letras — dava pra enumerar a
  // base inteira. Ver a migration `20260809181000`.
  const destinoId = await chamarRpc<string | null>(cfg, 'id_por_nome_de_treinador', { nome: alvo })
  if (!destinoId) throw new ErroHttp(404, `Nao existe treinador chamado "${alvo}".`)
  const [destino] = await selecionar<{ user_id: string; trainer_name: string }>(
    cfg,
    `players?user_id=eq.${destinoId}&select=user_id,trainer_name`,
  )
  if (!destino) throw new ErroHttp(404, `Nao existe treinador chamado "${alvo}".`)

  const [jaAmigos] = await selecionar<{ amigo_id: string }>(
    cfg,
    `friendships?user_id=eq.${userId}&amigo_id=eq.${destino.user_id}&select=amigo_id`,
  )
  if (jaAmigos) throw new ErroHttp(409, `${destino.trainer_name} ja e seu amigo.`)

  try {
    await inserir(cfg, 'mail_messages', {
      para_id: destino.user_id,
      de_id: userId,
      de_nome: eu.trainer_name,
      tipo: 'pedido_amizade',
      assunto: 'Pedido de amizade',
      corpo: `${eu.trainer_name} quer ser seu amigo.`,
    })
  } catch {
    // O indice unico parcial (um pedido pendente por par) rejeita o segundo.
    // Traduzido aqui: o erro cru do PostgREST diria "duplicate key value
    // violates unique constraint", que nao ajuda ninguem.
    throw new ErroHttp(409, `Voce ja tem um pedido pendente com ${destino.trainer_name}.`)
  }

  return { mensagem: `Pedido enviado para ${destino.trainer_name}.` }
}

export async function responderPedido(cfg: Config, userId: string, mensagemId: string, aceitar: boolean) {
  // CAS: so responde pedido que ainda esta pendente E e endereçado a mim.
  // Sem o `estado=eq.pendente` no filtro, clicar "Aceitar" duas vezes criaria a
  // amizade duas vezes (a segunda estouraria na PK, virando erro pro jogador).
  const [pedido] = await atualizarRetornando<LinhaCorreio>(
    cfg,
    `mail_messages?id=eq.${mensagemId}&para_id=eq.${userId}&tipo=eq.pedido_amizade&estado=eq.pendente`,
    { estado: aceitar ? 'aceito' : 'recusado', read_at: new Date().toISOString() },
  )
  if (!pedido) throw new ErroHttp(404, 'pedido nao encontrado ou ja respondido')
  if (!aceitar) return { mensagem: 'Pedido recusado.' }
  if (!pedido.de_id) throw new ErroHttp(409, 'Quem enviou o pedido nao existe mais.')

  // Duas linhas, uma por sentido — ver a nota na migration.
  await inserir(cfg, 'friendships', [
    { user_id: userId, amigo_id: pedido.de_id },
    { user_id: pedido.de_id, amigo_id: userId },
  ], { upsert: 'user_id,amigo_id' })

  const [eu] = await selecionar<{ trainer_name: string }>(cfg, `players?user_id=eq.${userId}&select=trainer_name`)
  await inserir(cfg, 'mail_messages', {
    para_id: pedido.de_id,
    de_id: userId,
    de_nome: eu?.trainer_name ?? 'Treinador',
    tipo: 'sistema',
    assunto: 'Pedido aceito',
    corpo: `${eu?.trainer_name ?? 'Um treinador'} aceitou seu pedido de amizade.`,
  })

  return { mensagem: `Agora voce e amigo de ${pedido.de_nome}.` }
}

export interface AnexoItem {
  itemId: string
  quantity: number
}

/**
 * Coleta o anexo de itens de uma mensagem do Correio.
 *
 * DOIS PONTOS QUE NAO SAO DETALHE:
 *
 * 1. **O claim e atomico e vem PRIMEIRO.** `anexo_coletado_em=is.null` esta no
 *    FILTRO do update: dois cliques (ou dois aparelhos) simultaneos nao podem
 *    coletar o mesmo anexo duas vezes, porque o segundo PATCH nao encontra
 *    linha. Se o enfileiramento abaixo falhar, o jogador perde o anexo — erra
 *    contra ele, mas nao imprime item, que e o lado certo de errar aqui.
 *
 * 2. **O credito vai pra fila de entregas, nao pro `players` direto.** O
 *    servidor grava progresso reescrevendo o SNAPSHOT inteiro do jogador; um
 *    `update player_items` aqui seria sobrescrito pelo proximo flush de quem
 *    estivesse cacando nesse segundo. `market_deliveries` ja existe exatamente
 *    pra isso e e aplicada dentro do proximo request que grava (ver
 *    server/src/entregas.ts). O nome da tabela e historico — ela e a fila
 *    generica de "creditar isto no proximo request", nao so do Mercado.
 */
export async function coletarAnexo(cfg: Config, userId: string, mensagemId: string) {
  const [msg] = await atualizarRetornando<LinhaCorreio & { anexo_itens: AnexoItem[] }>(
    cfg,
    `mail_messages?id=eq.${mensagemId}&para_id=eq.${userId}&anexo_coletado_em=is.null&anexo_itens=neq.${encodeURIComponent('[]')}`,
    { anexo_coletado_em: new Date().toISOString(), estado: 'lido', read_at: new Date().toISOString() },
  )
  if (!msg) throw new ErroHttp(409, 'Nada para coletar nesta mensagem.')

  const itens = Array.isArray(msg.anexo_itens) ? msg.anexo_itens : []
  for (const item of itens) {
    if (!item?.itemId || !(item.quantity > 0)) continue
    await enfileirarEntrega(cfg, {
      userId,
      itemId: item.itemId,
      quantity: Math.floor(item.quantity),
      motivo: `correio:${mensagemId}`,
    })
  }

  return {
    ok: true,
    itens,
    mensagem: itens.length
      ? `Recebido: ${itens.map((i) => `${i.quantity}x ${i.itemId}`).join(', ')}.`
      : 'Nada para coletar.',
  }
}

export async function marcarLida(cfg: Config, userId: string, mensagemId: string) {
  // Pedido de amizade pendente NAO vira "lido" por abrir a caixa: ele precisa
  // continuar acionavel (o botao de aceitar depende do estado 'pendente').
  await atualizar(
    cfg,
    `mail_messages?id=eq.${mensagemId}&para_id=eq.${userId}&estado=eq.pendente&tipo=neq.pedido_amizade`,
    { estado: 'lido', read_at: new Date().toISOString() },
  )
  return { ok: true }
}
