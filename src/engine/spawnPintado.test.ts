// O circulo amarelo pintado tem que chegar ao MUNDO, nao so ao arquivo gerado.
//
// `data/walkBlock.test.ts` garante que o circulo virou `spawnPoint` no dado.
// Isto aqui e a outra metade do caminho: que `buildMapWorld` USA esse ponto pra
// nascer o jogador. Sao duas coisas, e ja se soltaram uma da outra —
// `spawnPointParaSala` recebia `(sala)` e passou a receber `(mapId, sala)` na
// mesma leva em que o walk-block virou propriedade da arte.
//
// A falha e silenciosa dos dois lados: se o mundo parar de ler o ponto, o
// jogador nasce no `playerSpawn` fixo da GEOMETRIA — um ponto que existe, e
// andavel na maioria dos mapas, e nao levanta erro nenhum. O unico sintoma e
// "nasci no lugar errado", que ninguem reporta como bug.
import { describe, expect, it } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { COLISAO_POR_ARTE } from '@/data/generated/subBiomaCollision.generated'
import { MAPS, isCellBlocked, mapDefParaSala, spawnPointParaSala } from '@/data/maps'
import { temSalas } from './systems/salaSystem'
import { buildMapWorld } from './simulation'

const MUNDO = { width: 1400, height: 900 }
const CELULA = 40

/**
 * Hunts que resolvem grade e spawn pela arte do BIOMA, sem passar pelo sistema
 * de salas — Modo Pesadelo, BOSS, Lance, treino. Era exatamente o conjunto que
 * ficava sem walk-block nenhum quando a tabela era indexada por sub-bioma.
 */
function huntsSemSalaComPintura(): string[] {
  return Object.keys(MAPS).filter((id) => !temSalas(id) && spawnPointParaSala(id, null) != null)
}

describe('o circulo amarelo chega ao mundo', () => {
  it('todo spawn pintado e andavel na propria grade da arte', () => {
    // Redundante com walkBlock.test.ts de proposito: caindo os dois juntos, o
    // defeito e no gerador; caindo so este, e no consumo.
    const ruins: string[] = []
    for (const [arte, pintada] of Object.entries(COLISAO_POR_ARTE)) {
      const { x, y } = pintada.spawnPoint
      const col = Math.floor(x / CELULA)
      const row = Math.floor(y / CELULA)
      if (pintada.grid[row]?.[col] !== '0') ruins.push(`${arte} em (${x},${y})`)
    }
    expect(ruins, 'spawn pintado caindo em celula bloqueada').toEqual([])
  })

  it('a celula do spawn cabe INTEIRA no mundo', () => {
    // Os 10 circulos da leva 2026-08-18 foram pintados FORA da janela visivel
    // (a arte e 2048x2048 e so a faixa central dela vira mundo), e o gerador os
    // projeta pra dentro. Sem cuidado, a projecao punha o nascimento em y=900 —
    // a borda EXATA —, e o POKE aparecia colado na beirada com o mapa inteiro
    // atras dele.
    //
    // A checagem e sobre a CELULA, nao sobre uma margem fixa em volta do ponto.
    // A grade tem 23 fileiras de 40px cobrindo 900px de mundo: a fileira 22 vai
    // de 880 a 920 e transborda, entao o centro dela (y=900) e o unico valor
    // ruim do eixo Y. No X fecha certo (35 colunas x 40 = 1400) e toda coluna
    // serve. Uma margem fixa reprovaria y=20 (fileira 0, que cabe inteira e e
    // um spawn perfeitamente bom — o lake.jpg nasce la) e deixaria passar o
    // caso que importa se a folga fosse menor.
    //
    // O clamp da projecao recua uma celula das bordas, mas quem decide o ponto
    // final e o snap pra celula andavel mais proxima: se a unica area pintada
    // perto do circulo estiver na primeira fileira, e la que o jogador nasce.
    const transbordando: string[] = []
    for (const [arte, pintada] of Object.entries(COLISAO_POR_ARTE)) {
      const { x, y } = pintada.spawnPoint
      const col = Math.floor(x / CELULA)
      const row = Math.floor(y / CELULA)
      const cabe = col >= 0 && row >= 0
        && (col + 1) * CELULA <= MUNDO.width
        && (row + 1) * CELULA <= MUNDO.height
      if (!cabe) transbordando.push(`${arte} em (${x},${y}), celula ${col},${row}`)
    }
    expect(transbordando).toEqual([])
  })

  it('hunt sem sala resolve spawn pela arte do bioma, e ele e andavel', () => {
    const hunts = huntsSemSalaComPintura()
    expect(hunts.length, 'nenhuma hunt sem sala resolveu spawn — a regra da arte quebrou').toBeGreaterThan(0)

    const dentroDeParede: string[] = []
    for (const id of hunts) {
      const def = mapDefParaSala(id, null)!
      const ponto = spawnPointParaSala(id, null)!
      if (isCellBlocked(def, ponto.x, ponto.y)) dentroDeParede.push(`${id} em (${ponto.x},${ponto.y})`)
    }
    expect(dentroDeParede).toEqual([])
  })

  it('o jogador nasce NO ponto pintado, nao no playerSpawn fixo da geometria', () => {
    const poke = createPokeInstance(createRng(11), 'charmander', 20)
    const erros: string[] = []
    for (const id of huntsSemSalaComPintura()) {
      const esperado = spawnPointParaSala(id, null)!
      const world = buildMapWorld(id, poke, {
        rng: createRng(11),
        counters: { entity: 1, effect: 1, pendingHit: 1 },
      })
      const real = { x: world.player!.x, y: world.player!.y }
      if (real.x !== esperado.x || real.y !== esperado.y) {
        erros.push(`${id}: nasceu em (${real.x},${real.y}), pintado era (${esperado.x},${esperado.y})`)
      }
    }
    expect(erros).toEqual([])
  })

  it('numa hunt COM salas, a sala sorteada manda no ponto de nascimento', () => {
    // O outro caminho, e o que cobre os 10 circulos desta leva: eles estao em
    // SUB-BIOMAS (metropole, cortico, vilarejo, lago, vulcao, ...), nao em
    // hunts soltas. Aqui a arte vem da sala, e nao do bioma, e e a sala que
    // decide grade e spawn.
    //
    // Sem isto, os dois casos poderiam divergir sem ninguem ver: a hunt sem
    // sala nasceria certo e a sala continuaria caindo no `playerSpawn` fixo.
    const poke = createPokeInstance(createRng(3), 'charmander', 20)
    const comSalas = Object.keys(MAPS).filter((id) => temSalas(id))
    expect(comSalas.length).toBeGreaterThan(0)
    const mapa = comSalas[0]

    const salasPintadas = ['metropolis', 'slum', 'town', 'lake', 'volcano', 'island']
    const erros: string[] = []
    for (const chave of salasPintadas) {
      const esperado = spawnPointParaSala(mapa, { chave })
      if (!esperado) { erros.push(`${chave}: sem spawn pintado`); continue }

      const world = buildMapWorld(mapa, poke, {
        rng: createRng(3),
        counters: { entity: 1, effect: 1, pendingHit: 1 },
      }, { sala: { indice: 0, chave, abates: 0, ciclos: 0 } })

      const real = { x: world.player!.x, y: world.player!.y }
      if (real.x !== esperado.x || real.y !== esperado.y) {
        erros.push(`${chave}: nasceu em (${real.x},${real.y}), pintado era (${esperado.x},${esperado.y})`)
      }
    }
    expect(erros).toEqual([])
  })
})
