// PH-74: o fio de conversa privada.
//
// O que este teste protege e a PAGINACAO, que e onde o fio quebra silenciosa-
// mente: a consulta pede as mais RECENTES (order desc) mas a tela le de cima
// pra baixo, entao a inversao tem que acontecer — e o `temMais` sai de pedir
// uma linha a mais que a pagina, nao de um count separado.
import { describe, it, expect, beforeEach, vi } from 'vitest'

const rpc = vi.fn()
const lt = vi.fn()
const limite = vi.fn()
const ordem = vi.fn()
const ou = vi.fn()
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

const { lerConversa, enviarDm, marcarDmLidas, PAGINA_DM } = await import('./dmRealtime')

function linha(id: string, criadaEm: string, deId = 'amigo') {
  return { id, de_id: deId, para_id: 'eu', corpo: `msg ${id}`, created_at: criadaEm, read_at: null }
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
    const r = await lerConversa('amigo')
    expect(r.mensagens.map((m) => m.id)).toEqual(['a', 'b', 'c'])
  })

  it('pede uma linha a mais que a pagina e usa a sobra so como sinal de "tem mais"', async () => {
    resposta = {
      data: Array.from({ length: PAGINA_DM + 1 }, (_, i) => linha(String(i), `2026-08-22T10:00:${String(i).padStart(2, '0')}Z`)),
      error: null,
    }
    const r = await lerConversa('amigo')
    expect(limite).toHaveBeenCalledWith(PAGINA_DM + 1)
    expect(r.temMais).toBe(true)
    // A linha extra NAO pode vazar pra tela: ela existe so pra responder a
    // pergunta "ainda ha historico?".
    expect(r.mensagens).toHaveLength(PAGINA_DM)
  })

  it('nao sinaliza mais historico quando a pagina veio incompleta', async () => {
    resposta = { data: [linha('a', '2026-08-22T10:00:00Z')], error: null }
    const r = await lerConversa('amigo')
    expect(r.temMais).toBe(false)
    expect(r.mensagens).toHaveLength(1)
  })

  it('consulta as DUAS direcoes do fio, nao so o que chegou pra mim', async () => {
    await lerConversa('amigo')
    const filtro = ou.mock.calls[0][0] as string
    expect(filtro).toContain('and(de_id.eq.eu,para_id.eq.amigo)')
    expect(filtro).toContain('and(de_id.eq.amigo,para_id.eq.eu)')
  })

  it('pagina pra tras por cursor de data, nao por offset', async () => {
    // Offset desalinha: mensagem nova chegando no meio da rolagem empurra a
    // janela e o jogador ve linha repetida ou pulada.
    await lerConversa('amigo', '2026-08-22T10:00:00Z')
    expect(lt).toHaveBeenCalledWith('created_at', '2026-08-22T10:00:00Z')
  })

  it('nao aplica cursor na primeira pagina', async () => {
    await lerConversa('amigo')
    expect(lt).not.toHaveBeenCalled()
  })

  it('propaga erro do banco em vez de devolver fio vazio', async () => {
    resposta = { data: null, error: { message: 'permission denied' } }
    await expect(lerConversa('amigo')).rejects.toThrow('permission denied')
  })
})

describe('escrita de DM', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('envia por RPC, nunca por insert direto na tabela', async () => {
    // A tabela nao tem policy de INSERT de proposito: amizade, bloqueio e rate
    // limit so existem dentro da RPC.
    rpc.mockResolvedValue({ data: { ok: true, id: 'nova' }, error: null })
    await enviarDm('amigo', 'oi')
    expect(rpc).toHaveBeenCalledWith('enviar_dm', { p_para_id: 'amigo', p_corpo: 'oi' })
    expect(de).not.toHaveBeenCalled()
  })

  it('transforma erro da RPC em ErroServidor com a mensagem do banco', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Voce so pode conversar com amigos.' } })
    await expect(enviarDm('estranho', 'oi')).rejects.toThrow('Voce so pode conversar com amigos.')
  })

  it('marca lidas por amigo e devolve quantas mudaram', async () => {
    rpc.mockResolvedValue({ data: { ok: true, marcadas: 3 }, error: null })
    const r = await marcarDmLidas('amigo')
    expect(rpc).toHaveBeenCalledWith('marcar_dm_lidas', { p_amigo_id: 'amigo' })
    expect(r.marcadas).toBe(3)
  })
})
