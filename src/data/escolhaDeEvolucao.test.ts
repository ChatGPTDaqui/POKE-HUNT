// PH-139 — espécie com mais de um destino, e o jogador escolhendo qual.
//
// Três coisas aqui falham em silêncio:
//
//   1. o segundo destino sumir — quem lê `evolvesTo` (campo único) enxerga só o
//      primeiro, e o ramo vira decoração no dado;
//   2. o alvo pedido ser IGNORADO em vez de recusado — evoluir para outra coisa
//      que o jogador não escolheu, sem erro nenhum;
//   3. o servidor não validar o alvo — e aí o cliente escolhe qualquer espécie
//      do catálogo. É o "limite de negócio só no cliente" na forma mais direta:
//      aqui nem 502 seria, seria sucesso.
import { describe, expect, it } from 'vitest'

import { createRng } from '@/core/rng'

import { SPECIES, createPokeInstance, opcoesDeEvolucao } from './pokes'
import { evolutionStage } from './evolutionStage'
import { canEvolve, opcoesDisponiveis, evolvePokeInstance } from '@/engine/systems/progressionSystem'
import { useGameStateStore } from '@/stores/gameStateStore'

const MIGRATIONS = import.meta.glob('/supabase/migrations/*.sql', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

const rng = createRng(11)

describe('o ramo do Tyrogue existe no catálogo (PH-139)', () => {
  it('Tyrogue tem DOIS destinos, e os dois estão no elenco', () => {
    // Guarda anti-teste-vácuo: sem o ramo cadastrado, todo caso abaixo passaria
    // medindo uma espécie de destino único.
    const opcoes = opcoesDeEvolucao(SPECIES.tyrogue)
    expect(opcoes.map((o) => o.to).sort()).toEqual(['hitmonchan', 'hitmonlee'])
    expect(SPECIES.hitmonlee).toBeTruthy()
    expect(SPECIES.hitmonchan).toBeTruthy()
  })

  it('espécie de ramo único continua com um destino só', () => {
    // A lista é o caso geral, não um caso especial: quem tem um destino devolve
    // uma opção, e não zero nem duas.
    expect(opcoesDeEvolucao(SPECIES.charmander)).toHaveLength(1)
    expect(opcoesDeEvolucao(SPECIES.charmander)[0].to).toBe('charmeleon')
  })

  it('espécie sem evolução devolve lista vazia', () => {
    expect(opcoesDeEvolucao(SPECIES.tauros)).toHaveLength(0)
  })

  it('`evolvesTo` continua apontando para o primeiro destino', () => {
    // Todo leitor antigo (Pokédex, estágio, servidor não atualizado) lê este
    // campo. Deixá-lo nulo ao cadastrar o ramo quebraria os três de uma vez.
    expect(SPECIES.tyrogue.evolvesTo).toBe('hitmonlee')
  })
})

describe('o segundo destino conta como evolução, e não como forma base (PH-139)', () => {
  it('Hitmonchan é estágio 2, igual Hitmonlee', () => {
    // `evolutionStage` montava o mapa inverso lendo só `evolvesTo`. Com ramo,
    // o segundo destino não teria pré-evolução nenhuma e apareceria como forma
    // BASE — o mesmo erro que o cabeçalho daquele arquivo já registra para as
    // evoluções por troca.
    expect(evolutionStage('hitmonlee')).toBe(2)
    expect(evolutionStage('hitmonchan')).toBe(2)
    expect(evolutionStage('tyrogue')).toBe(1)
  })
})

describe('escolher o destino (PH-139)', () => {
  function tyrogue(nivel: number) {
    return createPokeInstance(rng, 'tyrogue', nivel)
  }

  it('abaixo do nível, nenhuma opção está disponível', () => {
    const novato = tyrogue(5)
    expect(opcoesDisponiveis(novato, SPECIES.tyrogue)).toHaveLength(0)
    expect(canEvolve(novato, SPECIES.tyrogue)).toBe(false)
  })

  it('no nível, as duas aparecem', () => {
    const pronto = tyrogue(20)
    expect(opcoesDisponiveis(pronto, SPECIES.tyrogue)).toHaveLength(2)
    expect(canEvolve(pronto, SPECIES.tyrogue)).toBe(true)
  })

  it('evolui para o alvo PEDIDO, e não para o primeiro', () => {
    // O caso que o jogador percebe: ele escolheu Hitmonchan e recebeu
    // Hitmonlee. Sem alvo explícito o resultado seria o primeiro da lista, então
    // este teste só significa alguma coisa pedindo o SEGUNDO.
    const gameState = useGameStateStore.getState()
    const r = evolvePokeInstance(tyrogue(20), gameState, 'hitmonchan')
    expect(r && 'species' in r ? r.species.id : null).toBe('hitmonchan')
  })

  it('sem alvo, cai no primeiro — comportamento de sempre', () => {
    const gameState = useGameStateStore.getState()
    const r = evolvePokeInstance(tyrogue(20), gameState)
    expect(r && 'species' in r ? r.species.id : null).toBe('hitmonlee')
  })

  it('alvo fora da lista é RECUSADO, e não ignorado', () => {
    // Ignorar e cair no primeiro evoluiria para outra coisa que o jogador não
    // pediu — sem erro, sem aviso, e permanente.
    const gameState = useGameStateStore.getState()
    expect(evolvePokeInstance(tyrogue(20), gameState, 'mewtwo')).toBeNull()
  })

  it('alvo certo numa espécie de ramo único continua funcionando', () => {
    const gameState = useGameStateStore.getState()
    const r = evolvePokeInstance(createPokeInstance(rng, 'charmander', 20), gameState, 'charmeleon')
    expect(r && 'species' in r ? r.species.id : null).toBe('charmeleon')
  })
})

describe('o servidor valida o alvo (PH-139)', () => {
  // A migration é o único lugar onde essa regra pode existir de verdade: o
  // cliente checa para não chamar em vão, mas quem impede o abuso é a RPC.
  const sql = Object.entries(MIGRATIONS)
    .filter(([nome]) => nome.includes('escolha_de_evolucao'))
    .map(([, conteudo]) => conteudo)

  it('as duas migrations do par existem', () => {
    // Guarda anti-teste-vácuo, e também o par `_public`/`_dev` que o gate de CI
    // cobra.
    expect(sql).toHaveLength(2)
  })

  it.each(['public', 'dev'])('em %s, alvo fora da lista é recusado', (schema) => {
    const arquivo = sql.find((s) => s.includes(`${schema}.species_evolution_options`))
    expect(arquivo, `não achei a migration de ${schema}`).toBeDefined()
    // A recusa tem que ser explícita. Sem ela a função segue com `v_opcao`
    // vazio e o `update` escreve a espécie que o cliente mandou.
    expect(arquivo).toContain('Este POKE nao evolui para isso.')
    expect(arquivo).toContain('if not found then')
  })

  it.each(['public', 'dev'])('em %s, a sobrecarga de um argumento continua existindo', (schema) => {
    // Cliente e Edge Function sobem por pipelines diferentes: derrubar a
    // assinatura antiga quebraria a evolução na janela entre um deploy e outro.
    const arquivo = sql.find((s) => s.includes(`${schema}.species_evolution_options`))!
    expect(arquivo).toContain(`function ${schema}.evoluir_poke(p_poke_id uuid)`)
    expect(arquivo).toContain(`function ${schema}.evoluir_poke(p_poke_id uuid, p_alvo text default null)`)
  })

  it('o ramo do Tyrogue cadastrado no banco casa com o do cliente', () => {
    // Dois lugares com o mesmo dado, e nada além deste teste os liga. Divergir
    // não dá erro: dá uma opção que a tela mostra e o servidor recusa.
    const doCliente = opcoesDeEvolucao(SPECIES.tyrogue).map((o) => o.to).sort()
    for (const arquivo of sql) {
      for (const alvo of doCliente) {
        expect(arquivo).toContain(`'tyrogue', '${alvo}'`)
      }
    }
  })
})
