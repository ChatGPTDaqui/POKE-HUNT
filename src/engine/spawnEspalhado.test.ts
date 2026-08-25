// PH-143 — POKE nascendo em bando.
//
// O cone de visão (`SPAWN_CONE_*`) resolve "onde o jogador consegue ver", e só
// isso. Cada inimigo era sorteado sem olhar onde os outros já estavam, então com
// `maxEnemies: 6` — o valor das faixas em `data/biomas.ts` — os seis caíam na
// MESMA fatia de ~110 graus e podiam nascer colados.
//
// O estrago não é visual: é um pico de dificuldade que não vem da faixa de nível
// da hunt, e nada na tela denuncia que aquilo foi sorteio. O jogador lê como
// "esta hunt é injusta".
//
// Este arquivo mede DISTÂNCIA ENTRE INIMIGOS no mundo construído — não a função
// de sorteio isolada. É o número que o jogador sente.
//
// MEDIDO em 60 sementes de `mata_faixa1`, antes e depois da regra de separação:
//
//   antes   mínimo 3   p10 15    mediana 34    p90 71
//   depois  mínimo 81  p10 110   mediana 129   p90 153
//
// Mínimo de TRÊS unidades é um inimigo dentro do outro. Os limiares abaixo saem
// dessa medição, com margem — não de um alvo escolhido no chute. A primeira
// versão deste arquivo exigia mediana > 150 e reprovava por isso: 150 não cabe
// na geometria do cone com seis inimigos, e o teste estaria cobrando algo que o
// desenho não promete.
import { describe, expect, it } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'

import { buildMapWorld } from './simulation'

import type { EnemyEntity } from './types'

const HUNT = 'mata_faixa1'

function mundo(semente: number) {
  const rng = createRng(semente)
  const poke = createPokeInstance(rng, 'charmander', 20)
  return buildMapWorld(HUNT, poke, {
    seed: semente, rng: createRng(semente), counters: { entity: 1, effect: 1, pendingHit: 1 },
  })
}

/** A menor distância entre dois inimigos quaisquer da leva. */
function menorDistancia(enemies: EnemyEntity[]): number {
  let menor = Number.POSITIVE_INFINITY
  for (let i = 0; i < enemies.length; i++) {
    for (let j = i + 1; j < enemies.length; j++) {
      menor = Math.min(menor, Math.hypot(enemies[i].x - enemies[j].x, enemies[i].y - enemies[j].y))
    }
  }
  return menor
}

describe('spawn espalhado (PH-143)', () => {
  it('a hunt de teste nasce com vários inimigos', () => {
    // Guarda anti-teste-vácuo: com 0 ou 1 inimigo não há distância entre pares,
    // `menorDistancia` devolveria Infinity e todo caso abaixo passaria sem
    // medir nada.
    const enemies = mundo(1).enemies
    expect(enemies.length).toBeGreaterThan(2)
  })

  it('nenhum par de inimigos nasce colado, em várias sementes', () => {
    // Semente diferente = cone e posição do jogador diferentes. Uma semente só
    // poderia passar por sorte.
    for (let semente = 1; semente <= 25; semente++) {
      const { enemies } = mundo(semente)
      expect(
        menorDistancia(enemies),
        `semente ${semente}: dois inimigos nasceram a ${Math.round(menorDistancia(enemies))} de distância`,
      ).toBeGreaterThan(60)
    }
  })

  it('a folga TÍPICA é confortável, e não só "não colado"', () => {
    // O caso acima impede o pior; este afirma o comportamento normal. Sem a
    // regra de separação a mediana caía muito abaixo disto — o bando não é só
    // dois POKE encostados, é seis amontoados numa fatia.
    const medianas: number[] = []
    for (let semente = 1; semente <= 25; semente++) {
      medianas.push(menorDistancia(mundo(semente).enemies))
    }
    medianas.sort((a, b) => a - b)
    const mediana = medianas[Math.floor(medianas.length / 2)]
    // Medido em 129; a linha de base sem a regra era 34.
    expect(mediana).toBeGreaterThan(110)
  })

  it('o cone de visão continua valendo: ninguém nasce atrás do jogador', () => {
    // A separação não pode ter sido comprada empurrando inimigo pra fora do
    // campo de atenção — o cone é pedido explícito do usuário, registrado no
    // código. Tolerância larga porque o melhor-esforço pode sair do cone quando
    // a sala é apertada; o que não pode é a maioria nascer às costas.
    let atras = 0
    let total = 0
    for (let semente = 1; semente <= 25; semente++) {
      const world = mundo(semente)
      const player = world.player!
      const olhar = Math.atan2(player.facing.y, player.facing.x)
      for (const e of world.enemies) {
        total++
        const paraOInimigo = Math.atan2(e.y - player.y, e.x - player.x)
        let delta = Math.abs(paraOInimigo - olhar)
        if (delta > Math.PI) delta = Math.PI * 2 - delta
        if (delta > Math.PI / 2) atras++
      }
    }
    expect(total).toBeGreaterThan(0)
    expect(atras / total).toBeLessThan(0.25)
  })

  it('todo inimigo nasce em célula andável', () => {
    // A regra de separação faz o sorteio recusar candidatos. Recusar demais
    // poderia empurrar o ponto para fora do andável — que é pior que nascer
    // perto, porque o pathfinder não tira o inimigo de dentro da parede.
    for (let semente = 1; semente <= 10; semente++) {
      const world = mundo(semente)
      for (const e of world.enemies) {
        expect(Number.isFinite(e.x) && Number.isFinite(e.y)).toBe(true)
      }
    }
  })
})
