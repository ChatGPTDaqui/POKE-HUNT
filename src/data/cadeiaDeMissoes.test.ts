// PH-245 — os guardas que faltavam em "Tasks & Missões".
//
// A suite original (PH-199) tinha 167 linhas e comparava o cliente com ele
// mesmo: nenhum dos tres defeitos abaixo era visivel por ela, e todos os tres
// estavam em producao.
//
//   1. 148 das 359 missoes eram INALCANCAVEIS. Seis especies do catalogo nao
//      aparecem em `enemyPool` nenhum (os 3 iniciais, eevee, porygon,
//      porygon2), entao `pokedexKills` nunca sobe pra elas. Quatro delas eram
//      posicao 1 de cadeia (FIRE, WATER, GRASS, POISON), e como a cadeia e
//      sequencial cada uma matava tudo que vinha depois.
//   2. A cadeia do CLIENTE e a da RPC eram derivadas separadamente, de
//      catalogos diferentes, e divergiam em 6 dos 18 tipos.
//   3. Lendarias (peso de spawn 1 contra 20 de uma comum) apareciam no MEIO
//      das cadeias com alvos de ate 1.275 abates.
//
// Cada `it` daqui reprova um desses. Sabotar `missaoCadeia.generated.ts` ou o
// SQL e ver estes testes ficarem vermelhos e o jeito de confirmar que eles
// medem alguma coisa.
import { describe, expect, it } from 'vitest'

import { MISSAO_TYPES, cadeiaDoTipo } from './missoes'
import { MISSAO_CADEIA } from './generated/missaoCadeia.generated'
import { LEGENDARY_SPECIES_IDS } from './legendaries'
import { MAPS } from './maps'
import { ENCOUNTERS } from './enemies'
import { BOSS_MAPS_DATA, BOSS_ENCOUNTERS_DATA } from './nightmareMaps'

const MIGRATIONS = import.meta.glob('/supabase/migrations/*.sql', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

/**
 * As especies que o jogador REALMENTE consegue abater — varridas dos pools de
 * verdade (`enemyPool` de toda hunt e de todo mapa de boss), e nao de uma
 * segunda lista. Uma missao apontando pra fora daqui e impossivel por
 * construcao.
 */
const ABATIVEIS = (() => {
  const ids = new Set<string>()
  for (const m of Object.values(MAPS as Record<string, { enemyPool?: string[] }>)) {
    for (const encId of m.enemyPool ?? []) {
      const enc = (ENCOUNTERS as Record<string, { speciesId?: string }>)[encId]
      if (enc?.speciesId) ids.add(enc.speciesId)
    }
  }
  for (const m of Object.values(BOSS_MAPS_DATA as Record<string, { enemyPool?: string[] }>)) {
    for (const encId of m.enemyPool ?? []) {
      const enc = (BOSS_ENCOUNTERS_DATA as Record<string, { speciesId?: string }>)[encId]
        ?? (ENCOUNTERS as Record<string, { speciesId?: string }>)[encId]
      if (enc?.speciesId) ids.add(enc.speciesId)
    }
  }
  return ids
})()

describe('a bancada mede alguma coisa', () => {
  it('os pools de verdade foram varridos, e a cadeia nao esta vazia', () => {
    // Sem isto, um glob que mudasse de forma deixaria todos os testes abaixo
    // passando contra conjuntos vazios — o modo de falha mais caro de um teste-guarda.
    expect(ABATIVEIS.size).toBeGreaterThan(200)
    expect(MISSAO_CADEIA.length).toBeGreaterThan(300)
    expect(Object.keys(MIGRATIONS).length).toBeGreaterThan(10)
  })
})

describe('toda missao e alcancavel', () => {
  it('nenhuma missao aponta pra especie que nao aparece em enemyPool nenhum', () => {
    const impossiveis = MISSAO_CADEIA
      .filter((m) => !ABATIVEIS.has(m.speciesId))
      .map((m) => `${m.tipo}#${m.posicao + 1} ${m.speciesId}`)
    expect(impossiveis, 'missao pedindo abate de especie que nunca spawna').toEqual([])
  })

  it('nenhuma missao pede abate de lendaria', () => {
    const lendarias = MISSAO_CADEIA
      .filter((m) => LEGENDARY_SPECIES_IDS.includes(m.speciesId))
      .map((m) => `${m.tipo}#${m.posicao + 1} ${m.speciesId} (alvo ${m.alvo})`)
    expect(lendarias, 'lendaria no meio de cadeia sequencial muralha tudo depois dela').toEqual([])
  })
})

describe('ordem por dificuldade, nao por numero de Pokedex', () => {
  it('a missao 1 de FLYING nao e Charizard', () => {
    // O caso concreto que abriu esta issue: dex 6 fazia de um estagio final a
    // PRIMEIRA coisa pedida na cadeia inteira de FLYING.
    expect(cadeiaDoTipo('FLYING')[0].speciesId).not.toBe('charizard')
  })

  it('nenhuma cadeia comeca por um estagio final de linha evolutiva conhecido', () => {
    const finaisNotorios = ['charizard', 'blastoise', 'venusaur', 'gengar', 'dragonite', 'tyranitar', 'alakazam', 'machamp']
    const ruins = MISSAO_TYPES
      .map((t) => [t, cadeiaDoTipo(t)[0]?.speciesId] as const)
      .filter(([, id]) => id && finaisNotorios.includes(id))
      .map(([t, id]) => `${t} comeca em ${id}`)
    expect(ruins).toEqual([])
  })
})

describe('o ouro por abate e comparavel entre os tipos', () => {
  it('o tipo mais generoso nao paga nem 25% a mais por abate que o mais avaro', () => {
    // Antes: WATER pagava 2,15 de ouro por abate e GHOST 16,3 — 7,6x de
    // diferenca decidida so por quantas especies o tipo tem no catalogo.
    const taxas = MISSAO_TYPES.map((tipo) => {
      const c = cadeiaDoTipo(tipo)
      const abates = c.reduce((s, m) => s + m.alvo, 0)
      const ouro = c.reduce((s, m) => s + m.recompensa, 0)
      return { tipo, taxa: ouro / abates }
    })
    const menor = Math.min(...taxas.map((t) => t.taxa))
    const maior = Math.max(...taxas.map((t) => t.taxa))
    expect(maior / menor, taxas.map((t) => `${t.tipo}=${t.taxa.toFixed(2)}`).join(' ')).toBeLessThan(1.25)
  })

  it('o bonus de conclusao escala com o tamanho da cadeia', () => {
    // Um lump-sum fixo pagava igual por fechar as 4 missoes de GHOST e as 46
    // de WATER. A ultima de uma cadeia longa tem que valer mais que a de uma curta.
    const bonus = (tipo: (typeof MISSAO_TYPES)[number]) => {
      const c = cadeiaDoTipo(tipo)
      const ultima = c[c.length - 1]
      const penultima = c[c.length - 2]
      // b = recompensa(ultima) - (alvo(ultima) * mesma taxa da penultima)
      return ultima.recompensa - ultima.alvo * (penultima.recompensa / penultima.alvo)
    }
    const curta = cadeiaDoTipo('GHOST').length
    const longa = cadeiaDoTipo('WATER').length
    expect(longa).toBeGreaterThan(curta)
    expect(bonus('WATER')).toBeGreaterThan(bonus('GHOST'))
  })
})

describe('cliente e RPC leem a MESMA cadeia (PH-245)', () => {
  /**
   * A migration de cadeia MAIS RECENTE, e nao a primeira que o glob devolver.
   *
   * `find` era o que estava aqui, e ele funcionou enquanto existia UM par. A
   * cadeia e regerada sempre que o elenco abativel muda, e a segunda regeracao
   * produziu um segundo par — a partir dai o `find` comparava o modulo gerado
   * (novo) com o SQL antigo e reprovava apontando pro lugar errado: parecia
   * divergencia cliente x servidor, quando o que havia era uma migration nova
   * que o teste nao estava olhando.
   *
   * No banco quem manda e a ULTIMA aplicada. Ordenar pelo nome do arquivo
   * funciona porque o carimbo e `YYYYMMDDHHMMSS` — mesma propriedade em que o
   * `db push` se apoia, e a mesma correcao que `custoDeEspecialidade.test.ts`
   * ja tinha precisado fazer no par de custo.
   */
  function migrationMaisRecente(sufixo: string): [string | undefined, string | undefined] {
    const [caminho, sql] = Object.entries(MIGRATIONS)
      .filter(([k]) => k.endsWith(sufixo))
      .sort(([a], [b]) => a.localeCompare(b))
      .pop() ?? []
    return [caminho, sql]
  }

  const [caminhoPublic, sqlPublic] = migrationMaisRecente('_missao_cadeia_public.sql')
  const [, sqlDev] = migrationMaisRecente('_missao_cadeia_dev.sql')

  /** As tuplas do `insert into ... missao_cadeia`, na ordem em que o SQL as escreve. */
  function linhasDoSql(sql: string) {
    const i = sql.indexOf('missao_cadeia (tipo, species_id, posicao, alvo, recompensa, eh_ultima) values')
    expect(i, 'o insert da cadeia sumiu da migration').toBeGreaterThan(-1)
    const trecho = sql.slice(i)
    return [...trecho.matchAll(/\('([A-Z]+)'::public\.element_type, '([a-z0-9_]+)', (\d+), (\d+), (\d+), (true|false)\)/g)].map((m) => ({
      tipo: m[1], speciesId: m[2], posicao: Number(m[3]),
      alvo: Number(m[4]), recompensa: Number(m[5]), ehUltima: m[6] === 'true',
    }))
  }

  it('o par de migrations existe', () => {
    expect(caminhoPublic, 'faltou a migration public da cadeia').toBeTruthy()
    expect(sqlDev, 'faltou o gemeo dev da migration da cadeia').toBeTruthy()
  })

  it('o SQL de public traz exatamente as mesmas linhas que o modulo gerado', () => {
    // O ponto inteiro desta issue. Se o gerador rodar so num dos lados, ou
    // alguem editar um arquivo a mao, isto fica vermelho.
    expect(linhasDoSql(sqlPublic!)).toEqual(MISSAO_CADEIA.map((m) => ({ ...m })))
  })

  it('o gemeo dev traz as mesmas linhas que o public', () => {
    expect(linhasDoSql(sqlDev!)).toEqual(linhasDoSql(sqlPublic!))
  })

  it('a RPC LE a tabela e nao deriva a cadeia de novo', () => {
    // Era `row_number() over (order by dex_number)` sobre `species` — a segunda
    // derivacao, e a origem da divergencia. Ela nao pode voltar.
    for (const [caminho, sql] of Object.entries(MIGRATIONS)) {
      const m = /missao_cadeia_(public|dev)\.sql$/.exec(caminho)
      if (!m) continue
      const schema = m[1]
      const corpoDaRpc = sql.slice(sql.indexOf('create or replace function'))
      expect(corpoDaRpc.includes('row_number()'), `${caminho} voltou a derivar a cadeia`).toBe(false)
      expect(corpoDaRpc.includes('public.species'), `${caminho} voltou a ler species direto`).toBe(false)
      expect(corpoDaRpc, `${caminho} nao le missao_cadeia`).toContain(`from ${schema}.missao_cadeia`)
    }
  })

  it('a migration zera o progresso de missao', () => {
    // O gate sequencial da RPC e `count(reivindicadas) = posicao`. Como TODAS as
    // posicoes mudaram, reivindicacao antiga sobrevivente deixaria o count certo
    // e a posicao errada — a UI destravaria missao que a RPC recusa.
    expect(sqlPublic!).toContain('delete from public.player_missoes_reivindicadas;')
    expect(sqlDev!).toContain('delete from dev.player_missoes_reivindicadas;')
  })
})
