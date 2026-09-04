// A CHANCE QUE O CARTAO MOSTRA E A CHANCE QUE O MOTOR SORTEIA? (PH-497)
//
// O BUG QUE ESTAS GUARDAS EXISTEM PRA IMPEDIR
// -----------------------------------------------------------------------------
// `HuntMenu#huntOdds` calculava `P(sala)` com `sub.peso` — o peso BASE de
// `data/biomas.ts`, que e o mesmo nos dez estagios de um bioma. Quem sorteia a
// sala e `salaSystem#sortearSala`, e desde a PH-476 ele usa a CURVA DE
// PROFUNDIDADE de `data/estagios.ts`, que muda do estagio 1 ao 10.
//
// Medido nos 120 estagios antes do conserto: divergencia media de 19,6 pontos
// percentuais, e 41 pares (estagio, sub-bioma) que a tela anunciava e o motor
// nunca sorteia — `subterraneo_e1` mostrava Caverna 63% com o motor em 0%.
//
// A PH-476 consertou a metade do MOTOR (ele e que usava o peso estatico). Esta
// e a outra metade: a TELA ficou na regua antiga.
//
// POR QUE OS TESTES QUE JA EXISTIAM NAO PEGARAM, E O QUE ISSO ENSINA
// -----------------------------------------------------------------------------
// `hunts.test.ts` tem "as chances mostradas em cada hunt somam 100%". Somar 100
// nao diz nada sobre estar certo: uma distribuicao errada, normalizada, tambem
// soma 100. E o mesmo modo de falha da propria PH-476 — a trilha comparava a si
// mesma com a tabela de dados, e as duas concordavam porque NENHUMA das duas
// era o sorteio.
//
// Entao nenhuma das duas guardas abaixo recalcula a formula do `huntOdds`. A
// primeira compara o CONJUNTO de especies anunciadas com o conjunto que o
// sorteio alcanca; a segunda compara o numero anunciado com a FREQUENCIA REAL
// de um sorteio de verdade, com o RNG do jogo. Reimplementar a conta aqui
// deixaria a copia se conferindo com a copia, que e exatamente o buraco.
import { describe, it, expect } from 'vitest'
import { huntOdds } from '@/features/hunt/HuntMenu'
import { MAPS } from '@/data/maps'
import { POOL_POR_SALA } from '@/data/huntSpawnOverrides'
import { BIOMAS } from '@/data/biomas'
import { estagioId, quantidadeDeSalas, ESTAGIOS_POR_BIOMA } from '@/data/estagios'
import { contextoDeSpawn, distribuicaoDeSala, sortearSala } from '@/engine/systems/salaSystem'
import { getEncounter } from '@/data/enemies'
import { createRng, nextFloat } from '@/core/rng'
import { weightedPick } from '@/core/random'

/** Os 120 ids de estagio, na ordem de `BIOMAS`. */
const ESTAGIOS = BIOMAS.flatMap((b) =>
  Array.from({ length: ESTAGIOS_POR_BIOMA }, (_, i) => estagioId(b.chave, i + 1)),
)

/**
 * As especies que o SORTEIO alcanca neste estagio: uniao dos pools dos
 * sub-biomas com peso positivo, em qualquer indice de sala.
 *
 * Sai de `distribuicaoDeSala` + `contextoDeSpawn`, que sao as duas funcoes que
 * o motor chama de verdade — nao de uma releitura de `pesosDoEstagio`.
 */
function alcancaveisNoEstagio(mapId: string): Set<string> {
  const map = MAPS[mapId]
  const distribuicao = distribuicaoDeSala(mapId)
  const salas = quantidadeDeSalas(mapId)
  const fora = new Set<string>()
  for (const [chave, p] of Object.entries(distribuicao)) {
    if (!(p > 0)) continue
    for (let indice = 0; indice < salas; indice++) {
      const ctx = contextoDeSpawn(mapId, map.levelRange, { chave, indice, abates: 0, ciclos: 0 }, map.enemyPool)
      for (const id of ctx.pool) if (ctx.peso(id) > 0) fora.add(getEncounter(id)!.speciesId)
    }
  }
  return fora
}

describe('o cartao da hunt e o sorteio de sala', () => {
  it('anuncia exatamente as especies que o sorteio alcanca, nos 120 estagios', () => {
    const erros: string[] = []
    for (const mapId of ESTAGIOS) {
      const anunciadas = new Set(huntOdds(MAPS[mapId]).species.map((e) => e.species.id))
      const alcancaveis = alcancaveisNoEstagio(mapId)
      const fantasmas = [...anunciadas].filter((sp) => !alcancaveis.has(sp))
      const omitidas = [...alcancaveis].filter((sp) => !anunciadas.has(sp))
      // FANTASMA e o bug da PH-497: especie que o cartao anuncia e o estagio
      // nao produz, porque o sub-bioma dela foi zerado pela curva.
      if (fantasmas.length) erros.push(`${mapId} anuncia sem sorteio: ${fantasmas.sort().join(', ')}`)
      // OMITIDA e o erro simetrico, e ele seria pior: o jogador nao ve o que
      // pode caçar ali.
      if (omitidas.length) erros.push(`${mapId} sorteia sem anunciar: ${omitidas.sort().join(', ')}`)
    }
    expect(erros).toEqual([])
  })

  it('nao anuncia ninguem com chance zero', () => {
    for (const mapId of ESTAGIOS) {
      for (const e of huntOdds(MAPS[mapId]).species) {
        expect(e.pct, `${mapId}/${e.species.id}`).toBeGreaterThan(0)
      }
    }
  })

  // A TERCEIRA PONTA: SORTEIO DE VERDADE, COM O RNG DO JOGO.
  //
  // As duas guardas acima comparam CONJUNTOS, e conjunto nao pega numero errado
  // — o `sub.peso` antigo acertava o conjunto em 79 dos 120 estagios e errava
  // so a proporcao. Esta guarda sorteia como o jogo sorteia (sub-bioma por
  // `sortearSala`, especie por `weightedPick` sobre o peso da sala) e compara a
  // frequencia com a porcentagem anunciada.
  //
  // OS CINCO ESTAGIOS SAO OS QUE O BUG MORDIA MAIS, e nao uma amostra qualquer:
  // os tres primeiros tinham par com peso 0 no motor e 63% na tela; `marinho_e10`
  // era 16% na tela contra 79% no motor. `campo_aberto_e1` entra como controle
  // de estagio raso, onde as duas reguas quase concordam.
  //
  // TOLERANCIA DE 1,5 PONTO com 200 mil sorteios e semente fixa: o erro de
  // amostragem de uma fatia de 35% em 200 mil e ~0,2 ponto, entao ha folga de
  // 7x. A guarda reprova por regressao, nao por ruido.
  it('bate com a frequencia de um sorteio real nos estagios que o bug mordia', () => {
    const AMOSTRA = 200_000
    const TOLERANCIA = 1.5
    const erros: string[] = []
    for (const mapId of ['subterraneo_e1', 'gelido_e1', 'aguas_interiores_e10', 'marinho_e10', 'campo_aberto_e1']) {
      const map = MAPS[mapId]
      const salas = quantidadeDeSalas(mapId)
      const rng = createRng(20260904)
      const contagem = new Map<string, number>()
      for (let n = 0; n < AMOSTRA; n++) {
        // Cada indice de sala pesa igual porque o ciclo passa uma vez por cada
        // um — a mesma premissa que o `huntOdds` declara.
        const indice = Math.min(salas - 1, Math.floor(nextFloat(rng) * salas))
        const chave = sortearSala(rng, mapId)
        if (!chave) { erros.push(`${mapId} nao sorteou sala nenhuma`); break }
        const ctx = contextoDeSpawn(mapId, map.levelRange, { chave, indice, abates: 0, ciclos: 0 }, map.enemyPool)
        const escolhido = weightedPick(rng, [...ctx.pool], (id) => ctx.peso(id))
        const sp = getEncounter(escolhido)!.speciesId
        contagem.set(sp, (contagem.get(sp) ?? 0) + 1)
      }
      const anunciado = new Map(huntOdds(map).species.map((e) => [e.species.id, e.pct]))
      for (const [sp, pct] of anunciado) {
        const medido = ((contagem.get(sp) ?? 0) / AMOSTRA) * 100
        if (Math.abs(medido - pct) > TOLERANCIA) {
          erros.push(`${mapId}/${sp}: cartao ${pct.toFixed(1)}% x sorteio ${medido.toFixed(1)}%`)
        }
      }
    }
    expect(erros).toEqual([])
  })

  // Contra o teste passar de vazio: se `POOL_POR_SALA` quebrar, `ESTAGIOS` some
  // e as tres guardas acima ficam verdes sem medir nada.
  it('os 120 estagios existem e todos tem pool de sala', () => {
    expect(ESTAGIOS).toHaveLength(120)
    for (const mapId of ESTAGIOS) {
      expect(POOL_POR_SALA[mapId], mapId).toBeDefined()
      expect(Object.keys(distribuicaoDeSala(mapId)).length, mapId).toBeGreaterThan(0)
    }
  })
})
