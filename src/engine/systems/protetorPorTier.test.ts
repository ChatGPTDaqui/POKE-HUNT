// Guardian e Lord saem do elenco de CHEFE do sub-bioma (as pools BOSS do
// PokeRogue), e nao mais do pool de spawn comum da sala.
//
// O teste que importa aqui nao e "o Guardian e um chefe" — e o MINIMO DE
// CANDIDATOS. O cao de guarda de `simulation.ts` descarta o protetor depois de
// 12s sem levar dano e deixa o tick seguinte sortear outro, com o mesmo filtro;
// com um candidato so, "outro" e o mesmo bicho e a sala trava pra sempre, com o
// gate de `bioma_progress` atras dela. Cinco sub-biomas tem exatamente um chefe
// no PokeRogue inteiro, entao isso deixou de ser hipotese quando o pool virou
// so-chefe.
import { describe, expect, it } from 'vitest'
import { MAPS, POOL_POR_SALA, ENCOUNTERS } from '@/data/huntSpawnOverrides'
import { SALAS_POR_HUNT } from '@/data/biomas'
import { SUB_BIOMA_TIERS } from '@/data/generated/subBiomas.generated'
import { TIERS_DE_PROTETOR } from '@/data/spawnPorTier'
import {
  contextoDeSpawn, contextoDoProtetor, protetorDaSala,
  MINIMO_DE_CANDIDATOS_A_PROTETOR, type TipoDeProtetor,
} from './salaSystem'

/** Toda combinacao (hunt de bioma, sub-bioma, indice de sala) que pede protetor. */
function* salasComProtetor() {
  for (const [huntId, salas] of Object.entries(POOL_POR_SALA)) {
    const mapDef = MAPS[huntId]
    for (const chave of Object.keys(salas)) {
      for (let indice = 0; indice < SALAS_POR_HUNT; indice++) {
        const sala = { chave, indice, abates: 0, ciclos: 0 }
        const tipo = protetorDaSala(sala)
        if (!tipo) continue
        const ctx = contextoDeSpawn(huntId, mapDef.levelRange, sala, mapDef.enemyPool)
        yield { huntId, sala, tipo, ctx, doProtetor: contextoDoProtetor(huntId, ctx, sala, tipo) }
      }
    }
  }
}

const especie = (id: string) => ENCOUNTERS[id].speciesId

describe('elenco de protetor', () => {
  it('nenhuma sala fica com menos candidatos que o minimo', () => {
    const erros: string[] = []
    for (const { huntId, sala, tipo, ctx, doProtetor } of salasComProtetor()) {
      // O unico jeito legitimo de ficar abaixo do minimo e a sala inteira ter
      // menos encontros que isso.
      const teto = Math.min(MINIMO_DE_CANDIDATOS_A_PROTETOR, ctx.pool.length)
      if (doProtetor.pool.length < teto) {
        erros.push(`${huntId}/${sala.chave}#${sala.indice} ${tipo}: ${doProtetor.pool.length} candidato(s)`)
      }
    }
    expect(erros).toEqual([])
  })

  it('o sorteio do protetor fecha: peso positivo e soma maior que zero', () => {
    const erros: string[] = []
    for (const { huntId, sala, tipo, doProtetor } of salasComProtetor()) {
      const soma = doProtetor.pool.reduce((s, id) => s + doProtetor.peso(id), 0)
      if (!(soma > 0)) erros.push(`${huntId}/${sala.chave}#${sala.indice} ${tipo} soma ${soma}`)
      for (const id of doProtetor.pool) {
        if (!(doProtetor.peso(id) > 0)) erros.push(`${huntId}/${sala.chave}#${sala.indice} ${tipo}/${especie(id)} peso 0`)
      }
    }
    expect(erros).toEqual([])
  })

  it('o candidato a protetor sempre pode nascer naquela sala', () => {
    // Ele e criado com o nivel da janela da sala; um encontro de fora do pool
    // ativo nasceria com nivel que nao existe ali.
    const erros: string[] = []
    for (const { huntId, sala, tipo, ctx, doProtetor } of salasComProtetor()) {
      const ativo = new Set(ctx.pool)
      for (const id of doProtetor.pool) {
        if (!ativo.has(id)) erros.push(`${huntId}/${sala.chave}#${sala.indice} ${tipo}: ${especie(id)} fora do pool da sala`)
      }
    }
    expect(erros).toEqual([])
  })

  // Onde HA chefe disponivel, ele tem que ser preferido — senao a mudanca toda
  // nao fez nada e ninguem percebe, porque um protetor comum tambem "funciona".
  it('havendo chefe disponivel na sala, o elenco e so de chefe', () => {
    const erros: string[] = []
    let comChefe = 0
    for (const { huntId, sala, tipo, ctx, doProtetor } of salasComProtetor()) {
      const chefes = new Set(TIERS_DE_PROTETOR.flatMap((t) => SUB_BIOMA_TIERS[sala.chave]?.[t] ?? []))
      const disponiveis = ctx.pool.filter((id) => chefes.has(especie(id)))
      if (disponiveis.length < MINIMO_DE_CANDIDATOS_A_PROTETOR) continue
      comChefe++
      for (const id of doProtetor.pool) {
        if (!chefes.has(especie(id))) {
          erros.push(`${huntId}/${sala.chave}#${sala.indice} ${tipo}: ${especie(id)} nao e chefe, e havia ${disponiveis.length}`)
        }
      }
    }
    expect(erros).toEqual([])
    expect(comChefe, 'nenhuma sala com chefe suficiente — o teste passou de vazio').toBeGreaterThan(100)
  })

  // O Lord da sala 10 comeca no BOSS_RARE e o Guardian no BOSS. Onde o
  // sub-bioma tem os dois tiers com folga, os elencos tem que ser diferentes —
  // e o que faz a ultima sala parecer a ultima sala.
  it('onde o lugar tem BOSS e BOSS_RARE, o Lord nao e o mesmo elenco do Guardian', () => {
    let diferentes = 0
    for (const [huntId, salas] of Object.entries(POOL_POR_SALA)) {
      const mapDef = MAPS[huntId]
      for (const chave of Object.keys(salas)) {
        const noPool = (t: (typeof TIERS_DE_PROTETOR)[number], indice: number) => {
          const elenco = new Set(SUB_BIOMA_TIERS[chave]?.[t] ?? [])
          const ctx = contextoDeSpawn(huntId, mapDef.levelRange, { chave, indice, abates: 0, ciclos: 0 }, mapDef.enemyPool)
          return ctx.pool.filter((id) => elenco.has(especie(id)))
        }
        const ultima = SALAS_POR_HUNT - 1
        if (noPool('BOSS', ultima).length < MINIMO_DE_CANDIDATOS_A_PROTETOR) continue
        if (noPool('BOSS_RARE', ultima).length < MINIMO_DE_CANDIDATOS_A_PROTETOR) continue
        const sala = { chave, indice: ultima, abates: 0, ciclos: 0 }
        const ctx = contextoDeSpawn(huntId, mapDef.levelRange, sala, mapDef.enemyPool)
        const comoLord = contextoDoProtetor(huntId, ctx, sala, 'lord' as TipoDeProtetor).pool
        const comoGuardian = contextoDoProtetor(huntId, ctx, { ...sala, indice: 0 }, 'guardian' as TipoDeProtetor).pool
        expect(new Set(comoLord)).not.toEqual(new Set(comoGuardian))
        diferentes++
      }
    }
    expect(diferentes, 'nenhum sub-bioma com BOSS e BOSS_RARE cheios — teste passou de vazio').toBeGreaterThan(0)
  })
})
