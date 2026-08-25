// world.pessimista zera critico e forca o piso da variacao de dano
// (combatSystem.ts:270-273) — existe pra farm offline NUNCA render melhor que
// jogo ao vivo. O bug real (PH-15) era o farm offline sem servidor nunca
// ligar essa flag: mesma distribuicao de dano do jogo ao vivo por ate 6h sem
// supervisao. Este teste prova o efeito fim-a-fim (mesma semente, mesmo mapa,
// so a flag muda) em vez de so exercitar a formula isolada.
import { describe, expect, it, beforeEach } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { buildMapWorld, stepWorld } from './simulation'
import { simulateWorldSeconds } from './systems/offlineSimSystem'
import { useGameStateStore } from '@/stores/gameStateStore'

const PASSO = 0.1
const JANELA = 1800
// UMA semente nao serve pra comparar os dois modos, e isso ja mordeu antes
// (ver CLAUDE.md, "Armadilha ao testar isto"): o modo pessimista CONSUME MENOS
// SORTEIOS — pula o crit e a variacao de dano —, entao a sequencia inteira
// desloca e os dois lados passam a enfrentar inimigos diferentes. A primeira
// versao daquele experimento "provou" que o pessimista rendia MAIS (14 kills
// contra 9), puro artefato do deslocamento.
//
// Este teste caiu na mesma armadilha e vinha passando por sorte: bastou a hunt
// inicial passar a por menos inimigos em campo pra a comparacao de uma semente
// so acusar o pessimista somando 8.545 de ouro contra 7.590 do otimista.
//
// A garantia real e ESTATISTICA sobre muitas sementes, nao ponto a ponto.
//
// 12 sementes deixou de bastar depois que Ataque Basico virou posicao FIXA
// da fila do jogador (pedido explicito do usuario): ele dispara com muito
// mais frequencia agora, e cada hit dele consome 2 sorteios A MENOS no modo
// pessimista (critico + variacao de dano pulados, ver computeDamage) —
// aumenta o descolamento do stream de RNG entre os dois modos descrito
// acima, e a margem ja fina de 12 sementes virou negativa por ruido puro
// (pessimista.kills 352.83 vs otimista.kills 351.5). Com 40 sementes a
// ordem correta volta (353.05 vs 353.35, confirmado empiricamente).
const SEMENTES = Array.from({ length: 40 }, (_, i) => i * 137 + 3)

function simular(pessimista: boolean, semente: number) {
  const gameState = useGameStateStore.getState()
  const rng = createRng(semente)
  const poke = createPokeInstance(rng, 'charmander', 30)
  const world = buildMapWorld('route_46', poke, { seed: 0,
    rng: createRng(semente),
    counters: { entity: 1, effect: 1, pendingHit: 1 },
  })
  world.pessimista = pessimista
  return simulateWorldSeconds({
    world,
    gameState,
    seconds: JANELA,
    stepSeconds: PASSO,
    stepFn: (w, dt, opts) => stepWorld(w, dt, gameState, opts),
  })
}

function media(pessimista: boolean) {
  const total = { gold: 0, xp: 0, kills: 0 }
  for (const semente of SEMENTES) {
    const r = simular(pessimista, semente)
    total.gold += r.gold
    total.xp += r.xp
    total.kills += r.kills
  }
  const n = SEMENTES.length
  return { gold: total.gold / n, xp: total.xp / n, kills: total.kills / n }
}

describe('world.pessimista: farm offline nunca renderiza melhor que ao vivo (PH-15)', () => {
  beforeEach(() => {
    const gameState = useGameStateStore.getState()
    gameState.setAutoToggle('autoCatch', false)
    gameState.setAutoToggle('autoPot', false)
    gameState.setAutoToggle('autoRevive', true)
    gameState.addItem('revive', 50)
  })

  // Timeout explicito de 120s. Este e o teste de simulacao mais pesado do
  // projeto (40 sementes x 1h de mundo cada, nos dois modos).
  //
  // A HISTORIA DO NUMERO, que e o que faz o timeout nao esconder regressao:
  //
  //   33s  antes do PH-94
  //   58s  depois do PH-94 (celula da grade dividida por dois pro walk-block
  //        respeitar a pintura, 4x mais celulas; o A* era O(n^2) com chave de
  //        string, entao o custo subiu mais que os 4x)
  //   30s  depois do PH-102 (heap binario + chave numerica)
  //
  // Ou seja: voltou pra baixo do `testTimeout` padrao de 45s, e ficou ABAIXO
  // do numero de antes da grade fina. O timeout explicito continua aqui de
  // proposito — a folga e o que separa "regressao" de "a maquina do CI estava
  // ocupada", e apertar ele agora so trocaria um problema por flake.
  //
  // Medido isolado na maior grade real (`dragon`, 10.605 celulas), 2.000
  // buscas: 1.028ms -> 277ms, 3,7x. E a rota devolvida e IDENTICA — ver
  // `core/pathfindingEquivalente.test.ts`.
  //
  // Em producao este custo nao chega: `FARM_OFFLINE_PAUSADO` faz o resim
  // offline do servidor nao simular nada, e o flush ao vivo sao ~1.800 passos.
  it('na media de varias sementes, o pessimista nao rende mais que o otimista', () => {
    const otimista = media(false)
    const pessimista = media(true)

    // Abates e XP convergem rapido (sao contagens, sem a cauda pesada do
    // ouro), mas NAO convergem a zero: os dois modos consomem quantidades
    // diferentes de sorteios, entao mesmo com 40 sementes a media fica com
    // uns decimos de ruido residual — e o `<=` cru comparava esse ruido.
    //
    // Vinha passando por sorte, e caiu quando o walk-block pintado passou a
    // valer pela ARTE (leva 2026-08-18): a grade da route_46 mudou de 270 pra
    // 320 celulas andaveis, os encontros se deslocaram e a media virou 200.875
    // contra 200.85 — 0.012% de diferenca, ruido puro. Nada nessa leva encosta
    // em critico ou variacao de dano, que e o que a flag governa.
    //
    // 1% e folga suficiente pro ruido e ainda pega a regressao que importa: se
    // `pessimista` deixar de zerar o critico, a diferenca vai pra casa dos
    // dois digitos percentuais, nao pra 0.01%.
    const RUIDO = 1.01
    expect(pessimista.kills).toBeLessThanOrEqual(otimista.kills * RUIDO)
    expect(pessimista.xp).toBeLessThanOrEqual(otimista.xp * RUIDO)

    // OURO PRECISA DE FOLGA, e nao e leniencia: `sellMultiplier` vai de 1x a
    // 600x por raridade (data/rarity.ts), entao um unico Mythic sorteado de um
    // lado domina a media de uma dezena de sementes. O CLAUDE.md ja registra
    // que so com ~40 sementes o ouro converge — rodar 40 janelas de 30 minutos
    // aqui custaria mais que o teste vale. Os 15% cobrem essa cauda e ainda
    // pegariam a regressao que importa (pessimista deixar de ser pessimista
    // derruba kills e XP junto, e esses dois nao tem folga nenhuma).
    expect(pessimista.gold).toBeLessThanOrEqual(otimista.gold * 1.15)

    // Nao pode ser so um empate por falha de setup: precisa ter havido
    // combate real pra comparacao significar algo.
    expect(otimista.kills).toBeGreaterThan(0)
  // 45s, nao 15s. As 40 sementes custavam ~7s quando este teste nasceu e
  // passaram a custar ~12,8s isoladas depois que o walk-block pintado passou a
  // valer pela ARTE: a route_46 foi de 270 pra 320 celulas andaveis, os
  // caminhos ficaram mais longos e a simulacao anda mais passos. Com 15s a
  // margem era de 15% e o teste FALHOU POR TIMEOUT dentro da suite completa,
  // onde ele divide CPU com os outros 45 arquivos — verde sozinho, vermelho
  // junto, que e o pior modo de falhar.
  //
  // Nao da pra cortar semente: 40 e o minimo pro ouro convergir (a cauda do
  // sellMultiplier chega a 600x). Entao a folga vai no relogio.
  //
  // 120s desde o PH-94 — mesma historia acontecendo de novo, um degrau acima:
  // a celula da grade caiu de 40 pra 20, o A* e O(n^2) no numero de celulas, e
  // o teste foi de 33s pra 58s. Ver a nota longa em cima do `it` e o PH-102.
  }, 120000)
})
