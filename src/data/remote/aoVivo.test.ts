// Canais ao vivo por Broadcast privado: um canal por topico, varios ouvintes.
//
// O topico e fixo (e o que a policy de `realtime.messages` autoriza), e
// `supabase.channel(nome)` devolve o canal ja inscrito pra um nome repetido —
// registrar callback nele estoura. Por isso os ouvintes dividem um canal so.
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Handler = (m: { event: string; payload: unknown }) => void

const criados: { nome: string; opcoes: unknown; handler: Handler | null }[] = []
const removidos: string[] = []

vi.mock('@/lib/supabase', () => ({
  schema: 'dev',
  supabase: {
    channel: (nome: string, opcoes: unknown) => {
      const registro = { nome, opcoes, handler: null as Handler | null }
      criados.push(registro)
      const canal = {
        on: (_tipo: string, _filtro: unknown, handler: Handler) => { registro.handler = handler; return canal },
        subscribe: () => canal,
        nome,
      }
      return canal
    },
    removeChannel: (canal: { nome: string }) => { removidos.push(canal.nome); return Promise.resolve() },
  },
}))

const { assinarTopico, topico } = await import('./aoVivo')

beforeEach(() => { criados.length = 0; removidos.length = 0 })

describe('aoVivo', () => {
  it('o topico leva o schema do ambiente na frente', () => {
    // dev e public dividem o mesmo Realtime: sem o prefixo o staging receberia
    // o chat de producao.
    expect(topico('pvp', 'abc')).toBe('dev:pvp:abc')
  })

  it('o canal e privado', () => {
    const parar = assinarTopico('dev:chat', () => {})
    expect(criados[0].opcoes).toEqual({ config: { private: true } })
    parar()
  })

  it('dois ouvintes no mesmo topico dividem UM canal e os dois recebem', () => {
    const a = vi.fn()
    const b = vi.fn()
    const pararA = assinarTopico('dev:social:u1', a)
    const pararB = assinarTopico('dev:social:u1', b)
    expect(criados).toHaveLength(1)

    criados[0].handler!({ event: 'INSERT', payload: { id: 1 } })
    expect(a).toHaveBeenCalledWith({ evento: 'INSERT', payload: { id: 1 } })
    expect(b).toHaveBeenCalledWith({ evento: 'INSERT', payload: { id: 1 } })

    pararA()
    expect(removidos, 'fechou com ouvinte ainda ativo').toEqual([])
    pararB()
    expect(removidos).toEqual(['dev:social:u1'])
  })

  it('cancelar duas vezes nao derruba o ouvinte de outro', () => {
    const pararA = assinarTopico('dev:pvp:u1', () => {})
    const pararB = assinarTopico('dev:pvp:u1', () => {})
    pararA()
    pararA()
    expect(removidos).toEqual([])
    pararB()
    expect(removidos).toEqual(['dev:pvp:u1'])
  })

  it('depois de fechar, assinar de novo abre canal novo', () => {
    assinarTopico('dev:troca:u1', () => {})()
    assinarTopico('dev:troca:u1', () => {})
    expect(criados).toHaveLength(2)
  })
})
