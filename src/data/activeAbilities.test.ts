// Invariantes do limite de 4 golpes. Estes testes existem porque a regra tem
// tres modos diferentes (selvagem, padrao do jogador, escolha do jogador) e o
// erro mais provavel — o AOE de nivel 50 escorregar pra dentro de um slot — nao
// causa erro nenhum, so come 25% do kit em silencio.
import { describe, it, expect } from 'vitest'
import { SPECIES } from './pokes'
import { getAbility, isDamagingAbility } from './abilities'
import { typedAoeMoveKey, TYPED_AOE_LEVEL } from './typedAoeMoves'
import {
  MAX_ACTIVE_ABILITIES, activeAbilitiesPadrao, activeAbilitiesSelvagem,
  encaixarNovosGolpes, golpesUtilizaveis, ehGolpeAoeDeNivel50, golpesAprendidosAte,
} from './activeAbilities'
import type { PokeInstance } from './pokes'

const NIVEIS = [1, 10, 30, 50, 80]

function pokeFalso(speciesId: string, level: number, extra: Partial<PokeInstance> = {}): PokeInstance {
  const species = SPECIES[speciesId]
  return {
    uid: `teste-${speciesId}`,
    speciesId,
    level,
    isShiny: false,
    rarity: 'comum',
    exp: 0,
    ivs: { hp: 0, atkFis: 0, atkEsp: 0, def: 0, defEsp: 0, speed: 0 },
    stats: { hp: 1, atkFis: 1, atkEsp: 1, def: 1, defEsp: 1, speed: 1 },
    hp: 1,
    unlockedAbilities: species.abilities
      .filter((a) => a.levelReq <= level)
      .map((a) => a.key)
      .filter((k) => getAbility(k)),
    ...extra,
  }
}

describe('limite de 4 golpes', () => {
  it('nunca passa de 4, em nenhuma especie ou nivel', () => {
    for (const species of Object.values(SPECIES)) {
      for (const level of NIVEIS) {
        expect(activeAbilitiesPadrao(species, level).length).toBeLessThanOrEqual(MAX_ACTIVE_ABILITIES)
        expect(activeAbilitiesSelvagem(species, level).length).toBeLessThanOrEqual(MAX_ACTIVE_ABILITIES)
      }
    }
  })

  it('o AOE de nivel 50 nunca ocupa slot, nem no padrao nem no selvagem', () => {
    for (const species of Object.values(SPECIES)) {
      const aoe = typedAoeMoveKey(species.type)
      for (const level of [TYPED_AOE_LEVEL, TYPED_AOE_LEVEL + 30]) {
        expect(activeAbilitiesPadrao(species, level)).not.toContain(aoe)
        expect(activeAbilitiesSelvagem(species, level)).not.toContain(aoe)
      }
    }
  })

  it('so escolhe golpe que a especie ja aprendeu naquele nivel', () => {
    for (const species of Object.values(SPECIES)) {
      for (const level of NIVEIS) {
        const permitidos = new Set(species.abilities.filter((a) => a.levelReq <= level).map((a) => a.key))
        for (const key of activeAbilitiesPadrao(species, level)) expect(permitidos.has(key)).toBe(true)
        for (const key of activeAbilitiesSelvagem(species, level)) expect(permitidos.has(key)).toBe(true)
      }
    }
  })

  it('o padrao do jogador leva os 4 de maior dano efetivo, e nao os 4 ultimos', () => {
    // A regressao que este teste guarda custou metade das kills/hora numa
    // caçada limitada por dano — ver a nota em activeAbilitiesPadrao.
    for (const species of Object.values(SPECIES)) {
      for (const level of NIVEIS) {
        const escolhidos = activeAbilitiesPadrao(species, level).map((k) => getAbility(k)!)
        const dano = escolhidos.filter((a) => isDamagingAbility(a))
        if (dano.length === 0) continue

        const stab = (a: NonNullable<ReturnType<typeof getAbility>>) =>
          a.power * (a.type === species.type || a.type === species.type2 ? 1.5 : 1)
        const piorEscolhido = Math.min(...dano.map(stab))

        // Mesmo motivo do outro caso: `levelReq` cru inclui o bloco de golpes
        // rememoraveis do nivel 1, que o POKE nao sabe de verdade naquele nivel.
        const disponiveis = golpesAprendidosAte(species, level)
          .filter((k) => k !== typedAoeMoveKey(species.type))
          .map((k) => getAbility(k))
          .filter((a): a is NonNullable<typeof a> => a != null && isDamagingAbility(a))
        const fora = disponiveis.filter((a) => !escolhidos.some((e) => e.id === a.id))
        for (const a of fora) expect(stab(a)).toBeLessThanOrEqual(piorEscolhido)
      }
    }
  })

  it('o padrao do jogador prefere golpe de dano — nenhum POKE nasce com kit inerte', () => {
    for (const species of Object.values(SPECIES)) {
      for (const level of NIVEIS) {
        // `golpesAprendidosAte` e nao `species.abilities` cru: o `levelReq` do
        // catalogo traz o bloco de golpes rememoraveis do nivel 1 das especies
        // evoluidas, que o POKE daquele nivel nao sabe de verdade. Usar o dado
        // cru aqui faria o teste exigir dano de um Typhlosion nivel 1.
        const learnset = golpesAprendidosAte(species, level)
          .filter((k) => k !== typedAoeMoveKey(species.type))
          .map((k) => getAbility(k))
        const temDano = learnset.some((a) => isDamagingAbility(a))
        if (!temDano) continue
        const escolhidos = activeAbilitiesPadrao(species, level).map((k) => getAbility(k))
        expect(escolhidos.some((a) => isDamagingAbility(a))).toBe(true)
      }
    }
  })
})

describe('golpesUtilizaveis', () => {
  it('selvagem nao recebe o AOE de nivel 50, mesmo no nivel 80', () => {
    const poke = pokeFalso('charizard', 80)
    const species = SPECIES.charizard
    const pool = golpesUtilizaveis(poke, species, true)
    expect(pool).not.toContain(typedAoeMoveKey(species.type))
    expect(pool.length).toBeLessThanOrEqual(MAX_ACTIVE_ABILITIES)
  })

  it('POKE do jogador recebe o AOE FORA dos 4 slots', () => {
    const species = SPECIES.charizard
    const poke = pokeFalso('charizard', 80)
    const pool = golpesUtilizaveis(poke, species, false)
    expect(pool).toContain(typedAoeMoveKey(species.type))
    expect(pool.length).toBe(MAX_ACTIVE_ABILITIES + 1)
  })

  it('selvagem ignora a escolha gravada — ele deriva da especie', () => {
    const species = SPECIES.charizard
    const poke = pokeFalso('charizard', 80, { activeAbilities: [] })
    expect(golpesUtilizaveis(poke, species, true).length).toBeGreaterThan(0)
  })

  it('lista vazia e escolha valida: o POKE do jogador fica so com o AOE', () => {
    const species = SPECIES.charizard
    const poke = pokeFalso('charizard', 80, { activeAbilities: [] })
    expect(golpesUtilizaveis(poke, species, false)).toEqual([typedAoeMoveKey(species.type)])
  })

  it('descarta escolha que o POKE nao conhece mais (especie trocada por evolucao)', () => {
    const species = SPECIES.charizard
    const poke = pokeFalso('charizard', 80, { activeAbilities: ['golpe_que_nao_existe', 'ember'] })
    expect(golpesUtilizaveis(poke, species, false)).not.toContain('golpe_que_nao_existe')
  })
})

describe('encaixarNovosGolpes', () => {
  it('preenche slot vazio', () => {
    expect(encaixarNovosGolpes(['ember', 'scratch'], ['flamethrower'])).toEqual(['ember', 'scratch', 'flamethrower'])
  })

  it('com os 4 cheios, nao derruba escolha do jogador', () => {
    const cheio = ['ember', 'scratch', 'growl', 'leer']
    expect(encaixarNovosGolpes(cheio, ['flamethrower'])).toEqual(cheio)
  })

  it('nunca encaixa o AOE de nivel 50 nem o Ataque Basico', () => {
    const aoe = typedAoeMoveKey('FIRE')
    expect(ehGolpeAoeDeNivel50(aoe)).toBe(true)
    expect(encaixarNovosGolpes(['ember'], [aoe, 'basic_attack'])).toEqual(['ember'])
  })
})

// O relato que originou a regra original: "Typhlosion possui golpes
// extremamente fortes no lvl 1". O caminho real e a CAPTURA, que reseta o
// POKE pro nivel 1 (CAPTURE_LEVEL) — capturava-se um Typhlosion selvagem de
// nivel 40 e ele voltava nivel 1 sabendo Eruption, de 150 de poder.
//
// Decisao de jogo (pedido explicito do usuario): um POKE so aprende golpe com
// nivel real na SUA propria especie — sem atalho de Recordador de Golpes.
// Corrigido na FONTE (`scripts/lib/pokeapi.js#removerGolpesDeRecordador`,
// `npm run usum:baixar`), nao mais em runtime: Typhlosion nao tem mais NENHUM
// golpe herdado do bloco de nivel 1 do Cyndaquil/Quilava — nem Tackle, nem
// Ember. Quem quer esses golpes evolui/mantem o POKE na forma que os aprende
// de verdade.
describe('golpes de recordador removidos do catalogo', () => {
  it('Typhlosion nivel 1 nao sabe Eruption nem golpe nenhum — o primeiro real e Smokescreen, no nivel 6', () => {
    expect(golpesAprendidosAte(SPECIES.typhlosion, 1)).toEqual([])
    expect(golpesAprendidosAte(SPECIES.typhlosion, 5)).toEqual([])
    expect(golpesAprendidosAte(SPECIES.typhlosion, 6)).toContain('smokescreen')
  })

  it('...e Eruption so no nivel 82, que e quando o jogo original ensina', () => {
    expect(golpesAprendidosAte(SPECIES.typhlosion, 82)).toContain('eruption')
    expect(golpesAprendidosAte(SPECIES.typhlosion, 81)).not.toContain('eruption')
  })

  it('Tackle e Ember NAO existem mais no learnset do Typhlosion — so no do Cyndaquil, que os aprende de verdade', () => {
    expect(golpesAprendidosAte(SPECIES.typhlosion, 100)).not.toContain('tackle')
    expect(golpesAprendidosAte(SPECIES.cyndaquil, 100)).toContain('tackle')
  })

  it('golpe de evolucao de verdade (nivel 0 cru na PokeAPI) fica, exigindo o nivel da evolucao — Metapod nasce sabendo Harden', () => {
    expect(golpesAprendidosAte(SPECIES.metapod, 6)).not.toContain('harden')
    expect(golpesAprendidosAte(SPECIES.metapod, 7)).toContain('harden')
  })

  it('especie BASE nao e afetada: nivel 1 dela e nivel 1 de verdade', () => {
    expect(golpesAprendidosAte(SPECIES.cyndaquil, 1)).toContain('tackle')
  })

  // Sem esta recomposicao a correcao acima seria uma regressao pior que o bug.
  // Medido contra o banco de producao antes de publicar: dos 7.184 POKEs salvos
  // com golpes escolhidos, 3.188 perdiam ao menos um e 714 ficavam com ZERO,
  // lutando so de Ataque Basico sem nada na tela dizendo por que.
  describe('escolha do jogador que aponta pra golpe nao mais conhecido', () => {
    it('recompoe o slot com o padrao em vez de deixar o POKE sem golpe', () => {
      const species = SPECIES.typhlosion
      const poke = pokeFalso('typhlosion', 40, {
        // O estado real de um save antigo: Eruption estava valendo no nivel 40
        // pela regra velha, e agora exige 82.
        activeAbilities: ['eruption', 'double_edge'],
        unlockedAbilities: golpesAprendidosAte(species, 40),
      })

      const usaveis = golpesUtilizaveis(poke, species, false)
      expect(usaveis).not.toContain('eruption')
      expect(usaveis.length).toBeGreaterThan(0)
    })

    it('escolha VAZIA continua vazia — e a opcao de lutar so com o Ataque Basico', () => {
      const species = SPECIES.typhlosion
      const poke = pokeFalso('typhlosion', 40, {
        activeAbilities: [],
        unlockedAbilities: golpesAprendidosAte(species, 40),
      })

      expect(golpesUtilizaveis(poke, species, false).filter((k) => !ehGolpeAoeDeNivel50(k))).toEqual([])
    })

    it('escolha inteira valida nao e mexida', () => {
      const species = SPECIES.typhlosion
      const escolha = ['ember', 'flame_wheel']
      const poke = pokeFalso('typhlosion', 40, {
        activeAbilities: escolha,
        unlockedAbilities: golpesAprendidosAte(species, 40),
      })

      expect(golpesUtilizaveis(poke, species, false).filter((k) => !ehGolpeAoeDeNivel50(k))).toEqual(escolha)
    })
  })

  it('nenhuma especie EVOLUIDA entrega golpe de poder >= 100 no nivel 1', () => {
    for (const species of Object.values(SPECIES)) {
      const evoluida = Object.values(SPECIES).some((s) => s.evolvesTo === species.id)
      if (!evoluida) continue
      for (const key of golpesAprendidosAte(species, 1)) {
        const poder = getAbility(key)?.power ?? 0
        expect(poder, `${species.id} entrega ${key} (${poder} de poder) no nivel 1`).toBeLessThan(100)
      }
    }
  })
})
