// PH-81: o fio de conversa do correio.
//
// Herdeiro de `dmConversa.test.ts` (PH-74), que cobria a mesma paginacao sobre
// `friend_messages`. A tabela saiu, o invariante nao: a consulta pede as mais
// RECENTES (order desc) mas a tela le de cima pra baixo, entao a inversao tem
// que acontecer — e o `temMais` sai de pedir uma linha a mais que a pagina, nao
// de um count separado.
//
// O que este arquivo ganhou alem do que herdou: o filtro por `tipo='texto'` (o
// fio nao pode engolir aviso de sistema, que mora na mesma tabela) e a exclusao
// por LADO, que depende de qual lado eu sou em cada linha e por isso nao cabe
// num filtro do PostgREST.
import { describe, it, expect, beforeEach, vi } from 'vitest'

const rpc = vi.fn()
const lt = vi.fn()
const limite = vi.fn()
const ordem = vi.fn()
const ou = vi.fn()
const eq = vi.fn()
const selecionar = vi.fn()
const de = vi.fn()

// Encadeamento do PostgREST: cada passo devolve o proprio builder, e o `await`
// no fim resolve. `then` no objeto e o que faz o `await q` funcionar sem
// precisar de um client de verdade.
let resposta: { data: unknown; error: { message: string } | null } = { data: [], error: null }
const construtor: Record<string, unknown> = {}
Object.assign(construtor, {
  select: selecionar.mockReturnValue(construtor),
  or: ou.mockReturnValue(construtor),
  eq: eq.mockReturnValue(construtor),
  order: ordem.mockReturnValue(construtor),
  limit: limite.mockReturnValue(construtor),
  lt: lt.mockReturnValue(construtor),
  then: (aceitar: (v: unknown) => unknown) => Promise.resolve(resposta).then(aceitar),
})

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => { de(...args); return construtor },
    rpc: (...args: unknown[]) => rpc(...args),
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: 'eu' } } } }) },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: vi.fn(),
  },
}))

const {
  lerConversa, enviarMensagem, marcarConversaLida, excluirConversa, PAGINA_CONVERSA,
} = await import('./correioRealtime')

function linha(id: string, criadaEm: string, extra: Record<string, unknown> = {}) {
  return {
    id, de_id: 'contato', para_id: 'eu', de_nome: 'Contato', tipo: 'texto',
    assunto: null, corpo: `msg ${id}`, estado: 'pendente', created_at: criadaEm,
    excluido_destinatario_em: null, excluido_remetente_em: null, ...extra,
  }
}

describe('lerConversa', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resposta = { data: [], error: null }
  })

  it('devolve o fio do mais ANTIGO pro mais novo, invertendo o que veio do banco', async () => {
    // O banco entrega desc (pro `limit` pegar as recentes, nao as primeiras da
    // historia inteira). A tela precisa asc.
    resposta = {
      data: [linha('c', '2026-08-22T10:02:00Z'), linha('b', '2026-08-22T10:01:00Z'), linha('a', '2026-08-22T10:00:00Z')],
      error: null,
    }
    const r = await lerConversa('contato')
    expect(r.mensagens.map((m) => m.id)).toEqual(['a', 'b', 'c'])
  })

  it('pede uma linha a mais que a pagina e usa a sobra so como sinal de "tem mais"', async () => {
    resposta = {
      data: Array.from({ length: PAGINA_CONVERSA + 1 }, (_, i) => linha(String(i), `2026-08-22T10:00:${String(i).padStart(2, '0')}Z`)),
      error: null,
    }
    const r = await lerConversa('contato')
    expect(limite).toHaveBeenCalledWith(PAGINA_CONVERSA + 1)
    expect(r.temMais).toBe(true)
    // A linha extra NAO pode vazar pra tela: ela existe so pra responder a
    // pergunta "ainda ha historico?".
    expect(r.mensagens).toHaveLength(PAGINA_CONVERSA)
  })

  it('nao sinaliza mais historico quando a pagina veio incompleta', async () => {
    resposta = { data: [linha('a', '2026-08-22T10:00:00Z')], error: null }
    const r = await lerConversa('contato')
    expect(r.temMais).toBe(false)
    expect(r.mensagens).toHaveLength(1)
  })

  it('consulta as DUAS direcoes do fio, nao so o que chegou pra mim', async () => {
    await lerConversa('contato')
    const filtro = ou.mock.calls[0][0] as string
    expect(filtro).toContain('and(de_id.eq.eu,para_id.eq.contato)')
    expect(filtro).toContain('and(de_id.eq.contato,para_id.eq.eu)')
  })

  it('pede so `texto` — aviso de sistema mora na MESMA tabela', async () => {
    // Sem este filtro a concessao inicial e a venda no mercado apareceriam como
    // balao de conversa de um interlocutor que nao existe.
    await lerConversa('contato')
    expect(eq).toHaveBeenCalledWith('tipo', 'texto')
  })

  it('pagina pra tras por cursor de data, nao por offset', async () => {
    // Offset desalinha: mensagem nova chegando no meio da rolagem empurra a
    // janela e o jogador ve linha repetida ou pulada.
    await lerConversa('contato', '2026-08-22T10:00:00Z')
    expect(lt).toHaveBeenCalledWith('created_at', '2026-08-22T10:00:00Z')
  })

  it('nao aplica cursor na primeira pagina', async () => {
    await lerConversa('contato')
    expect(lt).not.toHaveBeenCalled()
  })

  it('esconde o que EU apaguei, de cada lado pelo seu proprio carimbo', async () => {
    // A coluna que vale depende de qual lado eu sou naquela linha, entao o
    // filtro nao cabe num `.is()` do PostgREST — e feito sobre a pagina. As
    // duas que ficam sao as que o OUTRO apagou (do lado dele) e a intacta.
    resposta = {
      data: [
        linha('recebida-apagada-por-mim', '2026-08-22T10:03:00Z', { excluido_destinatario_em: '2026-08-22T11:00:00Z' }),
        linha('enviada-apagada-por-mim', '2026-08-22T10:02:00Z', { de_id: 'eu', para_id: 'contato', excluido_remetente_em: '2026-08-22T11:00:00Z' }),
        linha('enviada-apagada-pelo-outro', '2026-08-22T10:01:00Z', { de_id: 'eu', para_id: 'contato', excluido_destinatario_em: '2026-08-22T11:00:00Z' }),
        linha('intacta', '2026-08-22T10:00:00Z'),
      ],
      error: null,
    }
    const r = await lerConversa('contato')
    expect(r.mensagens.map((m) => m.id)).toEqual(['intacta', 'enviada-apagada-pelo-outro'])
  })

  it('propaga erro do banco em vez de devolver fio vazio', async () => {
    resposta = { data: null, error: { message: 'permission denied' } }
    await expect(lerConversa('contato')).rejects.toThrow('permission denied')
  })
})

describe('escrita de conversa', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('envia por RPC, nunca por insert direto na tabela', async () => {
    // A tabela nao tem policy de INSERT de proposito: bloqueio, rate limit e
    // debito de anexo so existem dentro da RPC.
    rpc.mockResolvedValue({ data: { ok: true, id: 'nova', paraId: 'contato', paraNome: 'Contato' }, error: null })
    await enviarMensagem({ paraId: 'contato' }, 'oi')
    expect(rpc).toHaveBeenCalledWith('enviar_mensagem', {
      p_corpo: 'oi', p_para_id: 'contato', p_para_nick: null, p_anexos: [],
      // PH-435: sempre presente e NULO por omissao. Mandar a chave sempre e o
      // que evita a ambiguidade de sobrecarga no PostgREST.
      p_anuncio_id: null,
    })
    expect(de).not.toHaveBeenCalled()
  })

  it('leva o anuncio da negociacao quando a conversa nasce de um anuncio (PH-435)', () => {
    rpc.mockResolvedValue({
      data: {
        ok: true, id: 'nova', paraId: 'contato', paraNome: 'Contato',
        contextoAnuncio: { anuncioId: 'anuncio-1', speciesId: 'charmander' },
      },
      error: null,
    })
    return enviarMensagem({ paraId: 'contato' }, 'aceita 1.8M?', [], 'anuncio-1').then((r) => {
      expect(rpc).toHaveBeenCalledWith('enviar_mensagem', {
        p_corpo: 'aceita 1.8M?', p_para_id: 'contato', p_para_nick: null, p_anexos: [],
        p_anuncio_id: 'anuncio-1',
      })
      // O snapshot volta do SERVIDOR, e nao do que a vitrine tinha em memoria:
      // o eco local do fio precisa nascer igual ao que ficou gravado.
      expect(r.contextoAnuncio).toEqual({ anuncioId: 'anuncio-1', speciesId: 'charmander' })
    })
  })

  it('normaliza contexto ausente pra null — servidor sem PH-435 ainda manda mensagem', () => {
    rpc.mockResolvedValue({ data: { ok: true, id: 'nova', paraId: 'contato', paraNome: 'Contato' }, error: null })
    return enviarMensagem({ paraId: 'contato' }, 'oi').then((r) => {
      expect(r.contextoAnuncio).toBeNull()
    })
  })

  it('aceita apontar o destinatario por NICK quando o fio ainda nao existe', async () => {
    rpc.mockResolvedValue({ data: { ok: true, id: 'nova', paraId: 'u2', paraNome: 'Misty' }, error: null })
    const r = await enviarMensagem({ paraNick: 'Misty' }, 'oi')
    expect(rpc).toHaveBeenCalledWith('enviar_mensagem', {
      p_corpo: 'oi', p_para_id: null, p_para_nick: 'Misty', p_anexos: [], p_anuncio_id: null,
    })
    // O id volta pra tela poder ABRIR o fio recem-criado em vez de largar o
    // jogador numa lista procurando o contato que ele acabou de criar.
    expect(r.paraId).toBe('u2')
  })

  it('transforma erro da RPC em ErroServidor com a mensagem do banco', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Aguarde um instante antes de mandar outra mensagem.' } })
    await expect(enviarMensagem({ paraId: 'contato' }, 'oi'))
      .rejects.toThrow('Aguarde um instante antes de mandar outra mensagem.')
  })

  it('marca lidas por contato e devolve quantas mudaram', async () => {
    rpc.mockResolvedValue({ data: { ok: true, marcadas: 3 }, error: null })
    const r = await marcarConversaLida('contato')
    expect(rpc).toHaveBeenCalledWith('marcar_conversa_lida', { p_contato_id: 'contato' })
    expect(r.marcadas).toBe(3)
  })

  it('apagar o fio e por lado e em lote, numa RPC so', async () => {
    rpc.mockResolvedValue({ data: { ok: true, apagadas: 7 }, error: null })
    const r = await excluirConversa('contato')
    expect(rpc).toHaveBeenCalledWith('excluir_conversa', { p_contato_id: 'contato' })
    expect(r.apagadas).toBe(7)
  })
})
