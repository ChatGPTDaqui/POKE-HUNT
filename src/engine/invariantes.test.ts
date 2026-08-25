// Invariantes que a simulacao NUNCA pode quebrar.
//
// Todos falham em silencio: HP negativo desenha uma barra vazia, item negativo
// vira `hasItem` sempre falso, uid repetido faz o upsert do servidor sobrescrever
// um POKE com outro. Nenhum lanca excecao, entao so um teste que roda combate de
// verdade e olha o estado depois pega.
import { describe, expect, it, beforeEach } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { SPECIES } from '@/data/pokes'
import { LEGENDARY_SPECIES_IDS } from '@/data/legendaries'
import { buildMapWorld, stepWorld } from './simulation'
import { useGameStateStore } from '@/stores/gameStateStore'

const PASSO = 0.1
const PASSOS = 6000 // 10 minutos de jogo

function cacar(semente: number, mapa: string, nivel: number) {
  const gameState = useGameStateStore.getState()
  const rng = createRng(semente)
  const poke = createPokeInstance(rng, 'charmander', nivel)
  gameState.addPokeToTeam(poke)
  gameState.setActiveIndex(0)
  const world = buildMapWorld(mapa, poke, { seed: 0,
    rng: createRng(semente),
    counters: { entity: 1, effect: 1, pendingHit: 1 },
  })
  for (let i = 0; i < PASSOS; i++) stepWorld(world, PASSO, gameState, { silent: true })
  return { world, gameState }
}

describe('invariantes da simulacao', () => {
  beforeEach(() => {
    useGameStateStore.getState().resetToDefaults()
    const gameState = useGameStateStore.getState()
    gameState.setAutoToggle('autoCatch', true)
    gameState.setAutoToggle('autoPot', true)
    gameState.setAutoToggle('autoRevive', true)
    gameState.addItem('poke_ball', 5000)
    gameState.addItem('potion', 5000)
    gameState.addItem('revive', 5000)
  })

  it('10 minutos de caçada nao produzem estado invalido', () => {
    const { gameState } = cacar(20260809, 'mata_faixa1', 25)
    const s = useGameStateStore.getState()

    expect(s.wallet.gold).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(s.wallet.gold)).toBe(true)
    expect(s.wallet.diamonds).toBeGreaterThanOrEqual(0)

    for (const [itemId, qtd] of Object.entries(s.items)) {
      expect(qtd, `item ${itemId}`).toBeGreaterThan(0)
      expect(Number.isInteger(qtd), `item ${itemId} inteiro`).toBe(true)
    }

    const todos = [...s.team, ...s.bagPokes]
    expect(todos.length).toBeGreaterThan(1) // sem captura o teste nao provaria nada

    const uids = new Set<string>()
    for (const p of todos) {
      expect(uids.has(p.uid), `uid repetido: ${p.uid}`).toBe(false)
      uids.add(p.uid)
      expect(SPECIES[p.speciesId], `especie desconhecida: ${p.speciesId}`).toBeTruthy()
      expect(p.level).toBeGreaterThanOrEqual(1)
      expect(p.hp).toBeGreaterThanOrEqual(0)
      expect(p.hp, `HP acima do maximo em ${p.speciesId}`).toBeLessThanOrEqual(p.stats.hp)
      expect(p.exp).toBeGreaterThanOrEqual(0)
      for (const [stat, valor] of Object.entries(p.stats)) {
        expect(valor, `stat ${stat} de ${p.speciesId}`).toBeGreaterThan(0)
      }
      for (const [stat, valor] of Object.entries(p.ivs)) {
        expect(valor, `IV ${stat} de ${p.speciesId}`).toBeGreaterThanOrEqual(0)
        expect(valor, `IV ${stat} de ${p.speciesId}`).toBeLessThanOrEqual(31)
      }
    }

    expect(s.activeIndex).toBeGreaterThanOrEqual(0)
    expect(s.activeIndex).toBeLessThan(s.team.length)
    void gameState
  })

  it('a Pokedex so registra especie real e contagem nao-negativa', () => {
    cacar(777001, 'mata_faixa1', 20)
    const s = useGameStateStore.getState()
    const entradas = Object.entries(s.pokedexKills)
    expect(entradas.length).toBeGreaterThan(0)
    for (const [speciesId, entrada] of entradas) {
      expect(SPECIES[speciesId], `pokedex com especie fantasma: ${speciesId}`).toBeTruthy()
      expect(entrada.normal).toBeGreaterThanOrEqual(0)
      expect(entrada.shiny).toBeGreaterThanOrEqual(0)
      expect(entrada.normal + entrada.shiny).toBeGreaterThan(0)
    }
  })

  it('o POKE em campo so aparece uma vez no estado', () => {
    // `addCapturedPoke` empurra pra mochila; se algum caminho capturasse o
    // proprio POKE em campo (ou o duplicasse ao evoluir), so isto pegaria.
    const { world } = cacar(31337, 'mata_faixa1', 30)
    const s = useGameStateStore.getState()
    const ativo = world.player!.poke
    const ocorrencias = [...s.team, ...s.bagPokes].filter((p) => p.uid === ativo.uid).length
    expect(ocorrencias).toBe(1)
  })

  it('inimigo derrotado nunca fica com HP acima de zero na hora do loot', () => {
    const gameState = useGameStateStore.getState()
    const rng = createRng(9090)
    const poke = createPokeInstance(rng, 'charmander', 40)
    gameState.addPokeToTeam(poke)
    gameState.setActiveIndex(0)
    const world = buildMapWorld('mata_faixa1', poke, { seed: 0,
      rng: createRng(9090), counters: { entity: 1, effect: 1, pendingHit: 1 },
    })
    // O CADAVER TEM QUE SOBRAR PRA SER OLHADO (PH-130).
    //
    // Este teste passou VAZIO desde que foi escrito: em 6.000 passos e 160
    // abates ele via `state === 'dead'` ZERO vezes — so o ramo do inimigo vivo
    // rodava, e a regra que da nome ao arquivo nunca foi conferida. Sabotar o
    // motor (`enemy.poke.hp = 1` junto do `state = 'dead'`, em
    // movementSystem.ts) deixava o teste VERDE.
    //
    // A causa e a interacao de duas decisoes razoaveis: `silent: true` poe
    // `deathRemovalTimer = 0` (nao ha animacao a esperar) e o filtro do fim do
    // passo tira o inimigo de `world.enemies` no MESMO passo em que ele morre.
    // Quando o laco olhava, nao havia mais cadaver.
    //
    // `keepCorpses` e a terceira condicao daquele filtro, e e configuracao de
    // mapa DE VERDADE (a regra da Champion Lance) — o teste passa a medir um
    // estado que o jogo produz, nao um artificio. Mantem `silent: true`, que e
    // o que impede este teste de medir toast e animacao junto.
    world.mapDef!.keepCorpses = true
    let kills = 0
    // A violacao e COLETADA, e nao afirmada dentro do laco (PH-129). Eram
    // ~30 mil chamadas de `expect` (6.000 passos x inimigos vivos x 1 cada), e
    // montar o estado do matcher e o que custava: 503 ms sozinho, mais de 5 s
    // com a suite inteira disputando CPU — o caso reprovava por carga, nunca
    // por defeito. A cobertura e a MESMA: todo passo continua conferido, e
    // parar no primeiro furo e o que o `expect` no laco ja fazia ao estourar.
    // De brinde, a mensagem passa a dizer em QUE passo e com que HP quebrou.
    //
    // POR QUE SO UMA DIRECAO E AFIRMADA
    // ---------------------------------
    // A versao anterior tambem exigia o contrario ("nao-morto tem HP > 0"), e
    // ela passava por acidente: sem cadaver na lista, o laco so via inimigo
    // vivo. Com o cadaver preservado ela reprova — e reprova em comportamento
    // CORRETO, por dois motivos que valem escrever:
    //
    //   1. `updateMovement` (quem poe `state = 'dead'`) roda ANTES de
    //      `updateCombat` (quem zera o HP) no mesmo passo. Quem morre neste
    //      passo ainda carrega o `state` do passo anterior.
    //   2. O gate de troca de sala (`salaCountdownRemaining`) retorna de
    //      `stepWorld` ANTES de `updateMovement`. A contagem e armada logo
    //      depois de um abate, entao durante ela nenhum passo de movimento roda
    //      e o `state` velho fica de pe por varios passos.
    //
    // Nada de combate depende de `state`: o pool de acao e
    // `world.enemies.filter((e) => !isDead(e))` e `resolveHit` sai cedo em
    // `isDead(attacker)`/`isDead(target)`; `isDead()` e `hp <= 0` direto.
    // `state` e campo de movimento e animacao. Cobrar "hp<=0 implica
    // state=dead" seria exigir do motor garantia que ele nao da — e teste que
    // fica vermelho em comportamento correto e pior que teste nenhum.
    let furo: string | null = null
    let mortosVistos = 0
    let vivosVistos = 0
    for (let i = 0; i < PASSOS && furo === null; i++) {
      for (const _ of stepWorld(world, PASSO, gameState, { silent: true })) kills++
      for (const inimigo of world.enemies) {
        // `state === 'dead'` e o que marca inimigo abatido (EnemyEntity nao tem
        // `fainted`).
        const morto = inimigo.state === 'dead'
        if (morto) mortosVistos++
        else vivosVistos++
        if (morto && inimigo.poke.hp > 0) {
          furo = `passo ${i}: cadaver ${inimigo.poke.speciesId} com hp=${inimigo.poke.hp}`
          break
        }
      }
    }
    expect(furo, 'cadaver mostrando HP acima de zero').toBeNull()
    expect(kills).toBeGreaterThan(0)
    // GUARDA ANTI-VACUO, e a razao de o PH-130 existir: sem ela o teste volta a
    // afirmar so "inimigo vivo tem HP > 0" e segue verde com a metade que da
    // nome a ele nunca executada.
    expect(
      mortosVistos,
      'nenhum inimigo abatido foi observado — a metade principal do teste rodou vazia',
    ).toBeGreaterThan(0)
    expect(vivosVistos, 'nenhum inimigo vivo foi observado — o cenario nao esta lutando').toBeGreaterThan(0)
  })
})

// --- IV: a regra do Ultra Sun ---------------------------------------------
//
// Conferido em 2026-08-18 contra Gen VII. Selvagem comum: 6 sorteios uniformes
// independentes em 0..31 (ja era o comportamento). Lendario/Mitico: 3 IVs
// GARANTIDOS em 31, escolhidos aleatoriamente entre os 6 (era o que faltava).
//
// Falha silenciosa que isto tranca: a garantia mora dentro de `rollIvs`, que
// nao lanca nada se o bloco de lendario for removido — o unico sintoma seria
// Mewtwo saindo com IV medio de POKE de rota, coisa que ninguem nota olhando
// uma captura.
describe('IV conforme Ultra Sun', () => {
  const IV_MAX = 31
  const perfeitos = (ivs: object) => Object.values(ivs).filter((v) => v === IV_MAX).length

  it('lendario sai com pelo menos 3 IVs perfeitos, sempre', () => {
    for (const speciesId of LEGENDARY_SPECIES_IDS) {
      for (let semente = 0; semente < 40; semente++) {
        const poke = createPokeInstance(createRng(semente), speciesId, 50)
        expect(perfeitos(poke.ivs), `${speciesId} semente ${semente}`).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('especie comum NAO ganha piso de IV — a distribuicao segue uniforme em 0..31', () => {
    let soma = 0
    let n = 0
    let viuZeroOuPerto = false
    for (let semente = 0; semente < 400; semente++) {
      const poke = createPokeInstance(createRng(semente), 'rattata', 50)
      for (const v of Object.values(poke.ivs)) {
        soma += v
        n++
        if (v <= 1) viuZeroOuPerto = true
      }
    }
    // Media de uma uniforme 0..31 e 15,5. A folga cobre a variancia da amostra.
    expect(soma / n).toBeGreaterThan(13)
    expect(soma / n).toBeLessThan(18)
    // Um piso escondido apareceria aqui: sem ele, IV 0-1 tem que acontecer.
    expect(viuZeroOuPerto).toBe(true)
  })
})
