// PH-145 — o guarda permanente contra "os dois lados existem e mesmo assim não
// evolui".
//
// O bug original não era uma espécie quebrada: era uma CATEGORIA inteira de
// aresta que nunca chegava ao catálogo. `scripts/fetch-usum-catalog.js` só lia
// gatilho de nível, então evolução por pedra, troca ou amizade saía com
// `evolvesTo` vazio — e como o elenco é o fecho transitivo das cadeias, a aresta
// ausente também mantinha 19 espécies fora do jogo.
//
// Nada disso dava erro. O sintoma era o jogador subir um Growlithe até o fim e
// ele nunca virar Arcanine, com Arcanine spawnando em hunt na mesma tela.
//
// Por isso o teste mede contra a FONTE (as cadeias reais da PokeAPI, já em
// cache) e não contra uma lista escrita à mão aqui: uma lista à mão teria o
// mesmo buraco que o gerador tinha, e passaria.
import { describe, expect, it } from 'vitest'

import { SPECIES, opcoesDeEvolucao } from './pokes'
import { SPECIES_DATA } from './generated/pokes.generated'
import { evolutionStoneRequirement } from '@/engine/systems/progressionSystem'

// `catalog.json#arestasReais`, e NÃO `scripts/.cache/pokeapi/evolution_chain_*`.
// O cache está em `.gitignore`: lendo dele, este arquivo passaria aqui e mediria
// o VAZIO no CI, que é o modo de falha mais caro que um teste-guarda pode ter.
// A lista emitida carrega só (origem, destino, nível-se-houver) — o gate de
// nível 80 + pedras é decisão deste jogo e não está lá, então a comparação
// continua sendo contra a fonte.
import CATALOGO from '../../scripts/usum/catalog.json'

const MIGRATIONS = import.meta.glob('/supabase/migrations/*.sql', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

interface ArestaReal {
  de: string
  para: string
  /** Nível do gatilho `level-up`, ou null quando é pedra, troca ou amizade. */
  porNivel: number | null
}

// Só as arestas em que os DOIS lados estão no elenco. As outras não são defeito:
// o elenco é Kanto + Johto por decisão (`DEX_MAX` em fetch-usum-catalog.js), e
// `eevee -> sylveon` apontar pra fora dele é escopo, não buraco.
const noElenco = (CATALOGO.arestasReais as ArestaReal[])
  .filter((a) => SPECIES_DATA[a.de] && SPECIES_DATA[a.para])

describe('nenhum beco sem saída (PH-145)', () => {
  it('o catálogo traz as arestas reais — senão este arquivo inteiro mede o vazio', () => {
    expect(CATALOGO.arestasReais.length).toBeGreaterThan(100)
    expect(noElenco.length).toBeGreaterThan(100)
    // Sem pelo menos uma aresta SEM gatilho de nível, o caso de pedra/troca/
    // amizade — o bug inteiro desta issue — não estaria sendo medido.
    expect(noElenco.filter((a) => a.porNivel === null).length).toBeGreaterThan(20)
  })

  it('toda aresta real com os dois lados no elenco EXISTE no catálogo', () => {
    // O teste que a issue pediu, e o que teria pego o bug original: Growlithe
    // com Arcanine no jogo e sem caminho até ele.
    const faltando = noElenco
      .filter((a) => !opcoesDeEvolucao(SPECIES[a.de]).some((o) => o.to === a.para))
      .map((a) => `${a.de} -> ${a.para}`)
    expect(faltando).toEqual([])
  })

  it('nenhum destino aponta pra espécie fora do elenco', () => {
    // O oposto do caso acima, e igualmente silencioso: a tela desenharia um
    // botão para uma espécie que `SPECIES` não tem, e a RPC responderia
    // "especie de destino desconhecida" só depois do clique.
    const orfas: string[] = []
    for (const especie of Object.values(SPECIES)) {
      for (const opcao of opcoesDeEvolucao(especie)) {
        if (!SPECIES[opcao.to]) orfas.push(`${especie.id} -> ${opcao.to}`)
      }
    }
    expect(orfas).toEqual([])
  })

  it('evolução por pedra/troca/amizade cobra pedras; evolução por nível não', () => {
    // O gate não é decorativo: `isSpecial` é o que faz a tela mostrar o custo e
    // a RPC debitar. Marcar errado dá evolução de graça ou preço em quem não
    // deveria ter — nos dois casos sem erro nenhum.
    for (const aresta of noElenco) {
      const opcao = opcoesDeEvolucao(SPECIES[aresta.de]).find((o) => o.to === aresta.para)!
      if (aresta.porNivel != null) {
        expect(opcao.isSpecial, `${aresta.de} -> ${aresta.para} evolui no nível ${aresta.porNivel}`).toBe(false)
        expect(opcao.atLevel).toBe(aresta.porNivel)
      } else {
        expect(opcao.isSpecial, `${aresta.de} -> ${aresta.para} não tem gatilho de nível`).toBe(true)
      }
    }
  })
})

describe('as cinco Eeveelutions cobram pedras de tipos diferentes (PH-145)', () => {
  const opcoes = opcoesDeEvolucao(SPECIES.eevee)

  it('Eevee tem os cinco destinos da faixa Gen1/Gen2', () => {
    expect(opcoes.map((o) => o.to).sort())
      .toEqual(['espeon', 'flareon', 'jolteon', 'umbreon', 'vaporeon'])
  })

  it('cada caminho cobra a pedra do tipo do DESTINO', () => {
    // É o que torna a escolha legível: cinco botões com o mesmo preço não são
    // uma decisão. `stoneType` existe por causa deste caso.
    const esperado: Record<string, string> = {
      vaporeon: 'stone_water', jolteon: 'stone_electric', flareon: 'stone_fire',
      espeon: 'stone_psychic', umbreon: 'stone_dark',
    }
    for (const opcao of opcoes) {
      const req = evolutionStoneRequirement(SPECIES.eevee, opcao)
      expect(req?.itemId, `${opcao.to}`).toBe(esperado[opcao.to])
    }
  })

  it('os cinco custos são distintos entre si', () => {
    // Guarda contra o modo de falha real: `stoneType` sumir do dado gerado e
    // todos caírem no tipo da ORIGEM (Eevee é NORMAL), o que passaria nos dois
    // casos acima se o mapa esperado fosse lido do mesmo lugar.
    const itens = opcoes.map((o) => evolutionStoneRequirement(SPECIES.eevee, o)?.itemId)
    expect(new Set(itens).size).toBe(opcoes.length)
  })
})

describe('espécie de destino único NÃO mudou de pedra (PH-145)', () => {
  // A regressão que `stoneType` nullable existe para evitar: aplicar "tipo do
  // destino" a todo mundo trocaria a pedra de Onix->Steelix de ROCHA para AÇO e
  // encareceria, no meio do caminho, quem já estava juntando.
  it.each([
    ['onix', 'stone_rock'],
    ['scyther', 'stone_bug'],
    ['seadra', 'stone_water'],
    ['graveler', 'stone_rock'],
    ['growlithe', 'stone_fire'],
  ])('%s cobra %s (tipo da ORIGEM)', (id, itemId) => {
    const opcao = opcoesDeEvolucao(SPECIES[id])[0]
    expect(opcao.isSpecial).toBe(true)
    expect(opcao.stoneType).toBeUndefined()
    expect(evolutionStoneRequirement(SPECIES[id], opcao)?.itemId).toBe(itemId)
  })
})

describe('o servidor conhece as mesmas arestas que o cliente (PH-145)', () => {
  // Dois lugares com o mesmo dado e nada além deste teste os ligando. Divergir
  // não dá erro: dá uma opção que a tela mostra e o servidor recusa — ou pior,
  // um gate que o cliente acha caro e o servidor libera de graça.
  const sql = Object.entries(MIGRATIONS)
    .filter(([nome]) => nome.includes('todas_as_evolucoes'))
    .sort(([a], [b]) => a.localeCompare(b))

  it('o par `_public`/`_dev` existe', () => {
    expect(sql.map(([nome]) => nome.replace(/.*_(public|dev)\.sql$/, '$1'))).toEqual(['public', 'dev'])
  })

  it.each(['public', 'dev'])('em %s, toda aresta do cliente está cadastrada', (schema) => {
    const arquivo = sql.find(([nome]) => nome.endsWith(`_${schema}.sql`))![1]
    const faltando: string[] = []
    for (const especie of Object.values(SPECIES)) {
      const opcoes = opcoesDeEvolucao(especie)
      for (const opcao of opcoes) {
        // Destino único vive na coluna de `species` (o `update`), ramo na tabela
        // de opções (o `insert`) — as duas formas põem o par no mesmo literal.
        const linha = `'${especie.id}', '${opcao.to}', ${opcao.atLevel}, ${opcao.isSpecial}`
        if (!arquivo.includes(linha)) faltando.push(linha)
      }
    }
    expect(faltando).toEqual([])
  })

  it.each(['public', 'dev'])('em %s, a pedra sai da opção quando ela diz qual é', (schema) => {
    const arquivo = sql.find(([nome]) => nome.endsWith(`_${schema}.sql`))![1]
    // Sem o `coalesce`, `stone_type` vira coluna morta: as cinco Eeveelutions
    // voltam a custar 40 pedras NORMAIS e nenhum teste de cliente percebe.
    expect(arquivo).toContain('coalesce(v_opcao.stone_type, v_species.type1)')
    expect(arquivo).toContain("'stone_' || lower(v_stone_type::text)")
  })
})
