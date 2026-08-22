// PH-74: as duas caixas e a exclusao por lado.
//
// O ponto sensivel e o filtro de excluidas acontecer na CONSULTA, nao na tela:
// `usePendenciasDoCorreio` conta em cima do mesmo retorno, entao mensagem
// apagada filtrada so no render continuaria alimentando o badge do HUD com uma
// pendencia que o jogador nao consegue mais abrir.
import { describe, it, expect, beforeEach, vi } from 'vitest'

type Resposta = { data: unknown; error: { message: string } | null }

const chamadas: { tabela: string; filtros: Record<string, unknown> }[] = []
const rpc = vi.fn()
let respostaEntrada: Resposta = { data: [], error: null }
let respostaEnviados: Resposta = { data: [], error: null }
let respostaNomes: Resposta = { data: [], error: null }

function builder(tabela: string) {
  const filtros: Record<string, unknown> = {}
  const registro = { tabela, filtros }
  chamadas.push(registro)
  const self: Record<string, unknown> = {}
  const encadeia = (chave: string) => (...args: unknown[]) => {
    filtros[chave] = args.length === 1 ? args[0] : args
    return self
  }
  Object.assign(self, {
    select: encadeia('select'),
    eq: (coluna: string, valor: unknown) => { filtros[`eq:${coluna}`] = valor; return self },
    is: (coluna: string, valor: unknown) => { filtros[`is:${coluna}`] = valor; return self },
    in: (coluna: string, valor: unknown) => { filtros[`in:${coluna}`] = valor; return self },
    order: encadeia('order'),
    limit: encadeia('limit'),
    then: (aceitar: (v: Resposta) => unknown) => {
      const alvo = tabela === 'treinadores_publico'
        ? respostaNomes
        : filtros['eq:de_id'] ? respostaEnviados : respostaEntrada
      return Promise.resolve(alvo).then(aceitar)
    },
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
vi.mock('@/stores/gameStateStore', () => ({ useGameStateStore: { setState: vi.fn() } }))

const { correio } = await import('./correioRealtime')

describe('correio()', () => {
  beforeEach(() => {
    chamadas.length = 0
    vi.clearAllMocks()
    respostaEntrada = { data: [], error: null }
    respostaEnviados = { data: [], error: null }
    respostaNomes = { data: [], error: null }
    rpc.mockResolvedValue({ data: { amigos: [], bloqueados: [] }, error: null })
  })

  it('pede a entrada filtrando o que EU apaguei, nao o que o remetente apagou', async () => {
    await correio()
    const entrada = chamadas.find((c) => c.filtros['eq:para_id'] === 'eu')
    expect(entrada?.filtros['is:excluido_destinatario_em']).toBeNull()
    // O lado do remetente nao pode influenciar a minha caixa.
    expect(entrada?.filtros).not.toHaveProperty('is:excluido_remetente_em')
  })

  it('pede os enviados filtrando o lado do remetente e so mensagens de texto', async () => {
    await correio()
    const enviados = chamadas.find((c) => c.filtros['eq:de_id'] === 'eu')
    expect(enviados?.filtros['is:excluido_remetente_em']).toBeNull()
    // Pedido de amizade e aviso tambem gravam `de_id`, mas ninguem pensa neles
    // como "mensagem que eu mandei".
    expect(enviados?.filtros['eq:tipo']).toBe('texto')
  })

  it('resolve o nome do destinatario numa consulta so, nao uma por linha', async () => {
    respostaEnviados = {
      data: [
        { id: 'a', para_id: 'u1', de_nome: 'Eu', tipo: 'texto', assunto: 'x', corpo: '', estado: 'lido', created_at: 'z' },
        { id: 'b', para_id: 'u2', de_nome: 'Eu', tipo: 'texto', assunto: 'y', corpo: '', estado: 'lido', created_at: 'z' },
        { id: 'c', para_id: 'u1', de_nome: 'Eu', tipo: 'texto', assunto: 'w', corpo: '', estado: 'lido', created_at: 'z' },
      ],
      error: null,
    }
    respostaNomes = {
      data: [{ user_id: 'u1', trainer_name: 'Misty' }, { user_id: 'u2', trainer_name: 'Brock' }],
      error: null,
    }
    const r = await correio()

    const consultaDeNomes = chamadas.filter((c) => c.tabela === 'treinadores_publico')
    expect(consultaDeNomes).toHaveLength(1)
    // Dois destinatarios distintos em tres mensagens: o `in` leva 2, nao 3.
    expect(consultaDeNomes[0].filtros['in:user_id']).toEqual(['u1', 'u2'])
    expect(r.enviados.map((m) => m.para_nome)).toEqual(['Misty', 'Brock', 'Misty'])
  })

  it('nao consulta nomes quando nao ha nada enviado', async () => {
    await correio()
    expect(chamadas.some((c) => c.tabela === 'treinadores_publico')).toBe(false)
  })

  it('conta como nao lida so o que sobrou depois do filtro de excluidas', async () => {
    respostaEntrada = {
      data: [
        { id: 'a', estado: 'pendente', tipo: 'texto', de_nome: 'Ash', assunto: 'x', corpo: '', created_at: 'z' },
        { id: 'b', estado: 'lido', tipo: 'texto', de_nome: 'Ash', assunto: 'y', corpo: '', created_at: 'z' },
      ],
      error: null,
    }
    const r = await correio()
    expect(r.naoLidas).toBe(1)
  })

  it('traz amigos e bloqueados da RPC, nao de consulta solta a friendships', async () => {
    rpc.mockResolvedValue({
      data: {
        amigos: [{ userId: 'u1', nome: 'Misty', nivel: 12, online: true, pokeAtivo: null, naoLidas: 2 }],
        bloqueados: [{ userId: 'u9', nome: 'Gary' }],
      },
      error: null,
    })
    const r = await correio()
    expect(rpc).toHaveBeenCalledWith('amigos_detalhados')
    expect(chamadas.some((c) => c.tabela === 'friendships')).toBe(false)
    expect(r.amigos[0].naoLidas).toBe(2)
    expect(r.bloqueados[0].nome).toBe('Gary')
  })

  it('tolera RPC devolvendo corpo vazio sem quebrar a tela', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    const r = await correio()
    expect(r.amigos).toEqual([])
    expect(r.bloqueados).toEqual([])
  })

  it('propaga erro da consulta de enviados em vez de mostrar caixa vazia', async () => {
    respostaEnviados = { data: null, error: { message: 'permission denied for de_id' } }
    await expect(correio()).rejects.toThrow('permission denied for de_id')
  })
})
