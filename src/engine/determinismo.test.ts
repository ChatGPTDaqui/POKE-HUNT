// Prova que a simulacao e reproduzivel a partir da semente.
//
// Isto e o criterio de aceite da Fase C. Sem um teste, "o jogo e deterministico"
// e uma afirmacao — e uma que quebra silenciosamente: basta alguem escrever um
// `Math.random()` novo em qualquer sistema pra reintroduzir o problema, e nada
// no jogo pareceria diferente. Aqui quebra alto.
//
// O que E verificado: mesma semente + mesmas entradas => mesmo mundo, campo por
// campo, incluindo os sorteios discretos que o servidor vai reconferir na Fase D
// (especie, nivel, IV, raridade, shiny, crit, dano) e os ids de entidade/efeito.
//
// O que NAO e verificado, e por que:
//
//  - Igualdade entre engines/maquinas diferentes. O motor usa Math.sin/cos/atan2
//    no movimento, que o IEEE 754 nao especifica bit-a-bit — ver a nota de
//    escopo em core/rng.ts.
//  - `poke.uid`. Ele vem de `crypto.randomUUID()` e NAO da sequencia, de
//    proposito: o uid e a chave primaria da linha em `pokemon_instances`, ou
//    seja, identidade de persistencia, nao resultado de simulacao. Se saisse da
//    semente, dois jogadores que caissem na mesma semente gerariam uids iguais e
//    colidiriam na PK. O servidor (Fase D) verifica O QUE foi capturado
//    (especie/nivel/IV/raridade/shiny) — quem assina a identidade da linha e ele
//    proprio. Como `randomUUID` nao toca no Rng, ele tambem nao dessincroniza a
//    sequencia.
import { describe, expect, it } from 'vitest'

import { createRng, restoreRng, nextFloat, deriveRng } from '@/core/rng'
import { createPokeInstance, type PokeInstance } from '@/data/pokes'
import { buildMapWorld, stepWorld } from './simulation'
import { useGameStateStore } from '@/stores/gameStateStore'
import type { WorldState } from './types'

const SEMENTE = 123456789
const MAPA = 'route_46'

// O passo tem que ser o mesmo dos dois lados; o valor em si nao importa pro
// teste, so precisa ser grande o bastante pra acontecer combate de verdade.
const PASSO = 0.1
const PASSOS = 600 // ~60s de jogo

function rodar(semente: number): WorldState {
  const gameState = useGameStateStore.getState()
  const rng = createRng(semente)
  const poke = createPokeInstance(rng, 'charmander', 5)
  const world = buildMapWorld(MAPA, poke, { rng: createRng(semente), counters: { entity: 1, effect: 1, pendingHit: 1 } })
  for (let i = 0; i < PASSOS; i++) stepWorld(world, PASSO, gameState, { silent: true })
  return world
}

// `mapDef` e dado estatico compartilhado (mesma referencia nos dois mundos) e
// tem funcoes/grids grandes dentro — comparar so o que a simulacao produziu.
// `uid` sai fora pelo motivo explicado no cabecalho.
function semUid(poke: PokeInstance): Omit<PokeInstance, 'uid'> {
  const { uid: _uid, ...resto } = poke
  return resto
}

function retrato(world: WorldState) {
  return {
    rng: world.rng,
    counters: world.counters,
    player: world.player && {
      id: world.player.id,
      x: world.player.x, y: world.player.y,
      poke: semUid(world.player.poke),
      state: world.player.state,
    },
    enemies: world.enemies.map((e) => ({
      id: e.id, x: e.x, y: e.y, state: e.state,
      poke: semUid(e.poke),
    })),
    pendingHits: world.pendingHits.map((h) => ({ id: h.id, timer: h.timer, ability: h.ability.id })),
    effects: world.effects.map((e) => ({ id: e.id, type: e.type, age: e.age, value: e.value })),
  }
}

describe('determinismo da simulacao', () => {
  it('mesma semente produz o mesmo mundo depois de 600 passos', () => {
    const a = retrato(rodar(SEMENTE))
    const b = retrato(rodar(SEMENTE))
    expect(b).toEqual(a)
  })

  it('semente diferente produz mundo diferente (o teste acima nao passa por acidente)', () => {
    const a = retrato(rodar(SEMENTE))
    const c = retrato(rodar(SEMENTE + 1))
    expect(c).not.toEqual(a)
  })

  it('a sequencia realmente avancou — nao ficou parada num valor so', () => {
    const world = rodar(SEMENTE)
    expect(world.rng.draws).toBeGreaterThan(100)
  })

  it('nenhum sorteio escapou pro Math.random: 600 passos consomem sempre o mesmo numero de draws', () => {
    // Se algum sistema ainda sorteasse por fora, o numero de draws consumidos
    // continuaria igual mas o RESULTADO divergiria — o primeiro teste ja pega
    // isso. Este fixa a contagem pra tornar visivel qualquer mudanca no consumo
    // da sequencia, que e o que o servidor precisa conseguir prever.
    expect(rodar(SEMENTE).rng.draws).toBe(rodar(SEMENTE).rng.draws)
  })

  it('rng com a mesma semente gera a mesma sequencia de floats', () => {
    const a = Array.from({ length: 50 }, () => nextFloat(createRng(7)))
    expect(new Set(a).size).toBe(1) // cada createRng(7) recomeca do zero
    const seq1 = (() => { const r = createRng(7); return Array.from({ length: 50 }, () => nextFloat(r)) })()
    const seq2 = (() => { const r = createRng(7); return Array.from({ length: 50 }, () => nextFloat(r)) })()
    expect(seq2).toEqual(seq1)
    expect(new Set(seq1).size).toBeGreaterThan(45) // e nao repete na pratica
  })

  it('deriveRng nao avanca a sequencia de origem', () => {
    const r = createRng(99)
    nextFloat(r)
    const antes = { ...r }
    const scratch = deriveRng(r.state, 'estimate')
    for (let i = 0; i < 10; i++) nextFloat(scratch)
    expect(r).toEqual(antes)
  })

  // Guarda de regressao pro bug de "varias copias iguais do mesmo POKE".
  //
  // O servidor simula por JANELAS (um flush a cada ~30s, ver
  // server/src/progresso.ts#aplicarFlush) e monta um mundo novo em cada uma.
  // Enquanto ele fazia `createRng(seed)` por janela, toda janela repetia a mesma
  // sequencia: mesmos inimigos, mesmos niveis, mesmos IVs, mesma raridade. Na
  // mochila do jogador isso chegava como a mesma especie de novo a cada meio
  // minuto, e na pratica a sessao inteira era um loop de 30 segundos.
  //
  // O teste roda janelas de verdade, e nao so o Rng solto, porque o defeito nao
  // estava no PRNG (ele sempre funcionou) e sim em QUEM o reconstruia. Um teste
  // so sobre `createRng`/`restoreRng` seria tautologico e nao pegaria uma
  // regressao futura em `aplicarFlush`.
  it('janelas consecutivas nao repetem a sequencia quando o estado e retomado', () => {
    const gameState = useGameStateStore.getState()
    const JANELAS = 4

    function janelas(retomar: boolean): string[] {
      let estado = { state: SEMENTE, draws: 0 }
      const assinaturas: string[] = []
      for (let j = 0; j < JANELAS; j++) {
        const rng = retomar ? restoreRng(estado.state, estado.draws) : createRng(SEMENTE)
        const poke = createPokeInstance(createRng(1), 'charmander', 30)
        const world = buildMapWorld(MAPA, poke, {
          rng, counters: { entity: 1, effect: 1, pendingHit: 1 },
        })
        for (let i = 0; i < 100; i++) stepWorld(world, PASSO, gameState, { silent: true })
        estado = { state: world.rng.state, draws: world.rng.draws }
        // O que a janela produziu, sem `uid` (ver cabecalho: uid nunca sai da
        // semente, entao sempre difere e esconderia justamente a repeticao).
        assinaturas.push(world.enemies
          .map((e) => `${e.poke.speciesId}:${e.poke.level}:${e.poke.rarity}:${e.poke.isShiny}`)
          .join('|'))
      }
      return assinaturas
    }

    // O comportamento antigo, fixado aqui pra deixar o contraste explicito: sem
    // retomar, TODA janela e identica.
    expect(new Set(janelas(false)).size).toBe(1)
    // Com o estado retomado, cada janela e uma continuacao.
    expect(new Set(janelas(true)).size).toBe(JANELAS)
  })
})
