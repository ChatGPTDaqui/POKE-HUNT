// PH-398: o splash de level-up passa a ser UM POR NIVEL, com os ganhos daquele
// nivel.
//
// O que este arquivo tranca e a fonte do dado, e ela e a metade que erra em
// silencio: `grantExp` sempre soube subir varios niveis num abate (`while`
// interno), mas devolvia so o nivel FINAL e a soma dos ganhos. Uma tela que
// tentasse desmembrar isso teria que conhecer curva de crescimento, natureza, IV
// e raridade — a regra de progressao inteira, num segundo lugar. O `niveis` sai
// de graca de dentro do laco que ja calcula stat por stat.
//
// A outra metade (um cartao por entrada, teto de fila, 4 segundos) esta em
// `stores/filaDeCelebracao.test.ts` e `data/marcoDaCelebracao.test.ts`.
import { describe, expect, it } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance, SPECIES, pokeExpForLevel } from '@/data/pokes'
import { grantExp } from './progressionSystem'

/** EXP que leva o POKE do nivel dele ate `alvo`, com folga de 1. */
function expAte(speciesId: string, deNivel: number, alvo: number): number {
  const curva = SPECIES[speciesId].growthCurve
  return pokeExpForLevel(alvo, curva) - pokeExpForLevel(deNivel, curva) + 1
}

describe('grantExp devolve o detalhe POR NIVEL (PH-398)', () => {
  it('um nivel: uma entrada, com os ganhos daquele nivel', () => {
    const poke = createPokeInstance(createRng(3), 'charmander', 10)
    const r = grantExp(poke, expAte('charmander', 10, 11))

    expect(r.leveledUp).toBe(true)
    expect(r.niveis).toHaveLength(1)
    expect(r.niveis[0].nivel).toBe(11)
    // Com um nivel so, o ganho da entrada E a soma do bloco.
    expect(r.niveis[0].ganhos).toEqual(r.statGains)
  })

  it('rajada de varios niveis: uma entrada por nivel, na ordem', () => {
    const poke = createPokeInstance(createRng(3), 'charmander', 10)
    const r = grantExp(poke, expAte('charmander', 10, 15))

    expect(r.level).toBe(15)
    expect(r.niveis.map((n) => n.nivel)).toEqual([11, 12, 13, 14, 15])
  })

  it('a soma das entradas fecha com `statGains` — nenhum ganho se perde nem duplica', () => {
    const poke = createPokeInstance(createRng(7), 'bulbasaur', 20)
    const r = grantExp(poke, expAte('bulbasaur', 20, 26))

    expect(r.niveis).toHaveLength(6)
    const chaves = Object.keys(r.statGains!) as (keyof typeof r.statGains)[]
    for (const k of chaves) {
      const soma = r.niveis.reduce((acc, n) => acc + n.ganhos[k], 0)
      expect(soma, `atributo ${String(k)} nao fecha`).toBe(r.statGains![k])
    }
  })

  it('cada entrada carrega SO os golpes daquele nivel', () => {
    // Charmander aprende golpe em niveis conhecidos; o que importa aqui e a
    // reparticao: todo golpe do bloco aparece em exatamente UMA entrada.
    const poke = createPokeInstance(createRng(11), 'charmander', 5)
    const r = grantExp(poke, expAte('charmander', 5, 25))

    const doBloco = r.newAbilities.map((a) => a.id).sort()
    const dasEntradas = r.niveis.flatMap((n) => n.golpesNovos.map((a) => a.id)).sort()
    expect(dasEntradas).toEqual(doBloco)

    // E cada golpe cai no nivel certo: a entrada que o carrega tem o nivel em
    // que ele foi aprendido.
    for (const entrada of r.niveis) {
      for (const golpe of entrada.golpesNovos) {
        expect(entrada.nivel, `${golpe.id} caiu no nivel errado`).toBeGreaterThan(poke.level)
      }
    }
  })

  it('sem level-up, a lista vem vazia (e nao com uma entrada de zero)', () => {
    const poke = createPokeInstance(createRng(3), 'charmander', 10)
    const r = grantExp(poke, 1)

    expect(r.leveledUp).toBe(false)
    expect(r.niveis).toEqual([])
    expect(r.statGains).toBeNull()
  })
})
