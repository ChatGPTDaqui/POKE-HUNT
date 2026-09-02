// PH-81: o que `social()` monta pra tela inicial — conversas, avisos e a
// contagem que alimenta o badge do HUD.
//
// Era o teste das duas caixas (entrada e enviados) de PH-74. As caixas sairam:
// num aplicativo de mensagem o que voce mandou esta dentro do fio, e o
// agrupamento por contato mudou de lugar — quem faz e a RPC `conversas`, no
// banco, nao mais o client juntando `para_id` com `treinadores_publico`.
//
// O que continua valendo e o ponto sensivel de sempre: o badge do HUD conta em
// cima DESTE retorno, entao qualquer coisa filtrada so no render continuaria
// alimentando o contador com pendencia que o jogador nao consegue abrir.
import { describe, it, expect, beforeEach, vi } from 'vitest'

type Resposta = { data: unknown; error: { message: string } | null }

const chamadas: { tabela: string; filtros: Record<string, unknown> }[] = []
const rpc = vi.fn()
let respostaAvisos: Resposta = { data: [], error: null }

function builder(tabela: string) {
  const filtros: Record<string, unknown> = {}
  chamadas.push({ tabela, filtros })
  const self: Record<string, unknown> = {}
  const encadeia = (chave: string) => (...args: unknown[]) => {
    filtros[chave] = args.length === 1 ? args[0] : args
    return self
  }
  Object.assign(self, {
    select: encadeia('select'),
    eq: (coluna: string, valor: unknown) => { filtros[`eq:${coluna}`] = valor; return self },
    neq: (coluna: string, valor: unknown) => { filtros[`neq:${coluna}`] = valor; return self },
    is: (coluna: string, valor: unknown) => { filtros[`is:${coluna}`] = valor; return self },
    in: (coluna: string, valor: unknown) => { filtros[`in:${coluna}`] = valor; return self },
    order: encadeia('order'),
    limit: encadeia('limit'),
    then: (aceitar: (v: Resposta) => unknown) => Promise.resolve(respostaAvisos).then(aceitar),
  })
  return self
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (tabela: string) => builder(tabela),
    rpc: (...args: unknown[]) => rpc(...args),
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: 'eu' } } } }) },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: vi.fn(),
  },
}))

const { social } = await import('./socialRealtime')

function fio(userId: string, naoLidas: number) {
  return {
    userId, nick: `T-${userId}`, ultimoTrecho: 'oi', ultimaEm: '2026-08-22T10:00:00Z',
    ultimaMinha: false, naoLidas, anexosPendentes: 0, online: false, bloqueado: false,
  }
}

/** Ambas as RPCs passam pelo mesmo mock — despacha por nome. */
function respondeRpcs(conversas: unknown[], detalhes: unknown = { amigos: [], bloqueados: [] }) {
  rpc.mockImplementation((nome: string) => Promise.resolve(
    nome === 'conversas' ? { data: conversas, error: null } : { data: detalhes, error: null },
  ))
}

describe('social()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    chamadas.length = 0
    respostaAvisos = { data: [], error: null }
    respondeRpcs([])
  })

  it('agrupa por contato NO BANCO, nao no client', async () => {
    // O client juntava `para_id` de cada enviada com `treinadores_publico` pra
    // descobrir o nome do destinatario. Isso saiu: a RPC ja devolve nick,
    // ultimo trecho e contagem prontos, num registro por contato.
    respondeRpcs([fio('u1', 0), fio('u2', 0)])
    const r = await social()
    expect(rpc).toHaveBeenCalledWith('conversas')
    expect(chamadas.some((c) => c.tabela === 'treinadores_publico')).toBe(false)
    expect(r.conversas.map((c) => c.userId)).toEqual(['u1', 'u2'])
  })

  it('a lista de avisos exclui `texto` — conversa nao e aviso', async () => {
    // Os dois vivem na MESMA tabela. Sem o `neq` a caixa de avisos mostraria
    // cada mensagem de gente como se fosse notificacao do jogo.
    await social()
    const consulta = chamadas.find((c) => c.tabela === 'mail_messages')
    expect(consulta?.filtros['neq:tipo']).toBe('texto')
  })

  it('a lista de avisos ignora o que EU apaguei', async () => {
    // O filtro tem que estar na CONSULTA: `naoLidas` conta sobre este retorno e
    // alimenta o badge do HUD.
    await social()
    const consulta = chamadas.find((c) => c.tabela === 'mail_messages')
    expect(consulta?.filtros['is:excluido_destinatario_em']).toBeNull()
  })

  it('naoLidas soma as conversas MAIS os avisos pendentes', async () => {
    // Duas fontes, um numero — o sino do HUD nao distingue "alguem te escreveu"
    // de "chegou aviso", e somar aqui e o que impede as duas contas divergirem.
    respondeRpcs([fio('u1', 2), fio('u2', 1)])
    respostaAvisos = {
      data: [
        { id: 'a', estado: 'pendente', tipo: 'sistema', de_nome: 'Jogo', assunto: 'x', corpo: '', created_at: 'z' },
        { id: 'b', estado: 'lido', tipo: 'sistema', de_nome: 'Jogo', assunto: 'y', corpo: '', created_at: 'z' },
      ],
      error: null,
    }
    const r = await social()
    expect(r.naoLidas).toBe(4)
  })

  it('traz amigos e bloqueados da RPC, nao de consulta solta a friendships', async () => {
    respondeRpcs([], {
      amigos: [{ userId: 'u1', nome: 'Misty', nivel: 12, online: true, pokeAtivo: null, naoLidas: 2 }],
      bloqueados: [{ userId: 'u9', nome: 'Gary' }],
    })
    const r = await social()
    expect(rpc).toHaveBeenCalledWith('amigos_detalhados')
    expect(chamadas.some((c) => c.tabela === 'friendships')).toBe(false)
    expect(r.amigos[0].nome).toBe('Misty')
    expect(r.bloqueados[0].nome).toBe('Gary')
  })

  it('tolera RPC devolvendo corpo vazio sem quebrar a tela', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    const r = await social()
    expect(r.conversas).toEqual([])
    expect(r.amigos).toEqual([])
    expect(r.bloqueados).toEqual([])
  })

  it('propaga erro da RPC de conversas em vez de mostrar lista vazia', async () => {
    rpc.mockImplementation((nome: string) => Promise.resolve(
      nome === 'conversas'
        ? { data: null, error: { message: 'permission denied for conversas' } }
        : { data: {}, error: null },
    ))
    await expect(social()).rejects.toThrow('permission denied for conversas')
  })
})
