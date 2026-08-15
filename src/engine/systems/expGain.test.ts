// O XP por abate contra a formula real da Gen VII.
//
// Pedido do usuario: "conferir tambem se o ganho de xp ganho dos selvagens esta
// certo". O `baseExp` de cada especie ja e conferido contra a Bulbapedia por
// `npm run usum:learnsets` (251 de 251); o que falta e a FORMULA que consome
// esse numero, e e ela que estes testes travam.
//
// A formula escalada da Gen V+ (usada na Gen VII):
//
//   Exp = floor( b * L / 5 * (1/s) * ((2L + 10)^2.5 / (L + Lp + 10)^2.5) ) + 1
//
// b  = base experience yield do POKE derrotado
// L  = nivel do POKE derrotado
// Lp = nivel de quem venceu
// s  = quantos POKEs participaram — sempre 1 aqui (o jogo e de um POKE em campo)
//
// Os multiplicadores que a formula real tem e este jogo nao (Ovo da Sorte, POKE
// trocado, Compartilhar Exp, bonus de afeto) simplesmente nao existem como
// mecanica — nao sao omissoes silenciosas.
import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng'
import { createPokeInstance, SPECIES } from '@/data/pokes'
import { expRewardForEnemy } from './progressionSystem'
import { createFormulaEngine } from '@/core/formulaEngine'
import { FORMULAS } from '@/data/generated/formulas.generated'

const MULTIPLICADOR = createFormulaEngine(FORMULAS).evalOrDefault('XP_GLOBAL_MULTIPLIER', 0.1)

// A formula real, escrita a mao aqui de proposito: se o teste importasse a
// mesma expressao do jogo, ele provaria apenas que uma string e igual a ela
// mesma.
function genVII(baseExp: number, nivelInimigo: number, nivelVencedor: number): number {
  const bruto =
    Math.floor(
      ((baseExp * nivelInimigo) / 5) *
        ((2 * nivelInimigo + 10) ** 2.5 / (nivelInimigo + nivelVencedor + 10) ** 2.5),
    ) + 1
  return Math.max(1, Math.round(bruto * MULTIPLICADOR))
}

function inimigo(especie: string, nivel: number) {
  return createPokeInstance(createRng(1), especie, nivel)
}

describe('XP por abate de selvagem', () => {
  it('bate com a formula da Gen VII em toda combinacao de nivel testada', () => {
    // Faixa larga de `baseExp` de proposito: Magikarp e o piso do dex 1-251 e
    // Dragonite fica perto do teto, entao um erro de arredondamento que so
    // aparecesse num dos extremos nao passaria.
    for (const especie of ['rattata', 'typhlosion', 'dragonite', 'magikarp']) {
      for (const nivelInimigo of [1, 5, 20, 50, 85, 100]) {
        for (const nivelVencedor of [1, 5, 20, 50, 85, 100]) {
          const alvo = inimigo(especie, nivelInimigo)
          expect(
            expRewardForEnemy(alvo, nivelVencedor),
            `${especie} Lv${nivelInimigo} morto por Lv${nivelVencedor}`,
          ).toBe(genVII(SPECIES[especie].baseExp, nivelInimigo, nivelVencedor))
        }
      }
    }
  })

  it('o maximo e contra alvo do PROPRIO nivel — o termo escalado vale 1 no empate', () => {
    const alvo = inimigo('rattata', 50)
    const empatado = expRewardForEnemy(alvo, 50)
    expect(expRewardForEnemy(alvo, 20)).toBeGreaterThan(empatado)
    expect(expRewardForEnemy(alvo, 80)).toBeLessThan(empatado)
  })

  // A consequencia de jogo da formula escalada, e a diferenca real em relacao a
  // formula plana da Gen I-IV (`b*L/7`): farmar muito abaixo do proprio nivel
  // deixa de compensar.
  it('POKE de nivel alto ganha quase nada de mob de nivel baixo', () => {
    const fraco = inimigo('rattata', 5)
    const forte = inimigo('rattata', 90)
    const contraFraco = expRewardForEnemy(fraco, 90)
    const contraIgual = expRewardForEnemy(forte, 90)
    expect(contraFraco / contraIgual).toBeLessThan(0.05)
  })

  it('nunca devolve zero — abate sempre rende alguma coisa', () => {
    for (const especie of Object.keys(SPECIES)) {
      expect(expRewardForEnemy(inimigo(especie, 1), 100)).toBeGreaterThanOrEqual(1)
    }
  })

  it('o nivel do VENCEDOR e obrigatorio e muda o resultado', () => {
    // Guarda contra a regressao que o comentario de progressionSystem.ts
    // descreve: um default `= enemyPoke.level` faria a formula devolver sempre o
    // valor do empate, que e o MAXIMO da curva, sem erro nenhum aparecer.
    const alvo = inimigo('typhlosion', 50)
    expect(expRewardForEnemy(alvo, 50)).not.toBe(expRewardForEnemy(alvo, 90))
  })
})
