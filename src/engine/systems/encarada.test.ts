// A encarada (PH-397) — a coreografia que o par de duelo faz entre um golpe e
// o outro.
//
// O que estes testes protegem, em ordem de gravidade:
//
//  1. A DISTANCIA DE TRABALHO cabe estritamente dentro de (soma dos raios,
//     engageRange). Fora disso a coreografia deixa de ser cosmetica: acima do
//     alcance o par desengaja — e como cliente e servidor rodam com passos de
//     tempo diferentes, eles desengajariam em instantes diferentes e o dano
//     divergiria; abaixo da soma dos raios ela briga com `separarCorpos` todo
//     tick. Os tres numeros (34, os raios, o padding de 10) moram em arquivos
//     diferentes, entao a relacao entre eles so existe se um teste a afirmar.
//  2. NAO CONSOME `world.rng`. A sequencia de sorteio e o que o servidor
//     reconfere; um sorteio a mais aqui deslocaria tudo o que vem depois.
//  3. Nao atravessa parede e nao congela contra ela.
//  4. Nao roda em hunt normal, com POKE imobilizado, morto, ou no meio da pose.
import { describe, expect, it, beforeEach } from 'vitest'

import { createRng } from '@/core/rng'
import type { PokeInstance } from '@/data/pokes'
import { isCellBlocked, mapDefParaSala } from '@/data/maps'
import { LANCE_MAP_ID } from '@/data/nightmareMaps'
import { LEGENDARY_SPECIES_IDS } from '@/data/legendaries'
import { MAPS } from '@/data/maps'
import { useGameStateStore } from '@/stores/gameStateStore'
import { buildMapWorld, stepWorld } from '../simulation'
import { engageRangeFor } from './combatSystem'
import { desiredAnimName } from './animationSystem'
import { aplicarEncarada, DISTANCIA_DA_ENCARADA, sortearPerna } from './encaradaSystem'
import type { EstadoDaEncarada } from '../types'
import type { EnemyEntity, PlayerEntity, WorldState } from '../types'

const PASSO = 1 / 60

function poke(uid: string): PokeInstance {
  return {
    uid,
    speciesId: 'mewtwo',
    level: 100,
    isShiny: false,
    rarity: 'legendary',
    exp: 0,
    ivs: { hp: 31, atkFis: 31, atkEsp: 31, def: 31, defEsp: 31, speed: 31 },
    stats: { hp: 99999, atkFis: 1, atkEsp: 1, def: 9999, defEsp: 9999, speed: 100 },
    hp: 99999,
    unlockedAbilities: [],
    activeAbilities: ['basic_attack'],
  }
}

function mundoDoLance(): WorldState {
  const gs = useGameStateStore.getState()
  gs.addPokeToTeam(poke('duelista'))
  gs.setActiveIndex(0)
  return buildMapWorld(LANCE_MAP_ID, useGameStateStore.getState().team[0], {
    seed: 0,
    rng: createRng(7),
    counters: { entity: 1, effect: 1, pendingHit: 1 },
  })
}

/**
 * Roda ate os dois estarem engajados um no outro, mantendo os dois de pe.
 *
 * O topo de HP a cada tick e o que deixa o duelo durar o tanto que o teste
 * precisa: sem ele o time do Lance cai em segundos e nao sobra encarada pra
 * medir. Nao mascara nada do que esta sob teste — a coreografia nao olha HP,
 * so estado de combate.
 */
function duelarAte(world: WorldState, ticks: number, aCadaTick?: (w: WorldState) => void): void {
  const gameState = useGameStateStore.getState()
  for (let i = 0; i < ticks; i++) {
    if (world.player) world.player.poke.hp = world.player.poke.stats.hp
    for (const e of world.enemies) e.poke.hp = e.poke.stats.hp
    stepWorld(world, PASSO, gameState, { silent: true })
    aCadaTick?.(world)
  }
}

/**
 * Zera a pose de ataque dos dois.
 *
 * Os testes que chamam `aplicarEncarada` DIRETO (sem `stepWorld`) nao tem quem
 * desconte `attackAnimTimer` — `tickAttackAnimTimers` roda dentro do
 * `stepWorld`. Sem isto, um `duelarAte` que por acaso termina no meio de um
 * golpe deixa a pose ativa pra sempre e a coreografia sai cedo em todas as
 * iteracoes seguintes: o teste passaria a medir "nao andou" em vez do que ele
 * diz medir.
 */
function zerarPose(jogador: PlayerEntity, inimigo: EnemyEntity): void {
  jogador.attackAnimTimer = 0
  inimigo.attackAnimTimer = 0
}

/** O que a perna `n` daquele par seria: lado, curvatura e arco. */
function assinaturaDaPerna(base: EstadoDaEncarada, n: number): string {
  const clone: EstadoDaEncarada = { ...base, perna: n }
  sortearPerna(clone, base.centroX, base.centroY, base.anguloBase)
  return `${clone.lado}|${clone.raioDaCurva.toFixed(3)}|${clone.arcoDaPerna.toFixed(3)}`
}

function parEngajado(world: WorldState): { jogador: PlayerEntity; inimigo: EnemyEntity } | null {
  const jogador = world.player
  const inimigo = world.enemies.find((e) => e.poke.hp > 0)
  if (!jogador || !inimigo) return null
  if (jogador.state !== 'engaged' || inimigo.state !== 'engaged') return null
  return { jogador, inimigo }
}

describe('encarada: a distancia de trabalho', () => {
  beforeEach(() => useGameStateStore.getState().resetToDefaults())

  it('cabe estritamente entre a soma dos raios e o alcance de combate', () => {
    // Os tres numeros vivem em arquivos diferentes: 34 aqui, os raios em
    // engine/entity.ts, o padding de 10 em combatSystem. A relacao entre eles e
    // o que faz a coreografia ser inofensiva, e nada alem deste teste a afirma.
    const world = mundoDoLance()
    duelarAte(world, 400)
    const par = parEngajado(world)
    expect(par, 'o par nunca engajou — o resto do arquivo nao mede nada').not.toBeNull()

    const somaDosRaios = par!.jogador.radius + par!.inimigo.radius
    const alcance = engageRangeFor(par!.jogador, par!.inimigo)
    expect(DISTANCIA_DA_ENCARADA).toBeGreaterThan(somaDosRaios)
    expect(DISTANCIA_DA_ENCARADA).toBeLessThan(alcance)
  })
})

describe('encarada: o que ela faz no duelo', () => {
  beforeEach(() => useGameStateStore.getState().resetToDefaults())

  it('o par se desloca em vez de ficar parado', () => {
    const world = mundoDoLance()
    duelarAte(world, 400)
    const par = parEngajado(world)!
    const inicio = { x: par.jogador.x, y: par.jogador.y }

    // Um ciclo inteiro do arco leva ~2s; 1s ja tem que ter tirado o POKE do
    // lugar de forma visivel.
    duelarAte(world, 60)
    const andou = Math.hypot(par.jogador.x - inicio.x, par.jogador.y - inicio.y)
    expect(andou).toBeGreaterThan(5)
  })

  it('o passo e largo o bastante pra aparecer na tela (PH-402)', () => {
    // A primeira versão girava em torno do PONTO MÉDIO, então o raio era metade
    // da distância entre os dois (17px) e o passo saía com 26px — some na tela,
    // e foi o que o teste visual pegou. O conserto foi soltar o raio da
    // distância de combate.
    //
    // Este número é a única coisa que impede alguém de "simplificar" de volta
    // pro ponto médio: os testes de distância, parede e rng continuariam todos
    // verdes com a coreografia invisível de novo.
    const world = mundoDoLance()
    duelarAte(world, 400)
    const par = parEngajado(world)!
    expect(world.encarada).not.toBeNull()

    const ancora = { x: par.jogador.x, y: par.jogador.y, chave: world.encarada!.parKey }
    let maisLonge = 0
    duelarAte(world, 900, (w) => {
      if (w.encarada?.parKey !== ancora.chave) return
      maisLonge = Math.max(maisLonge, Math.hypot(w.player!.x - ancora.x, w.player!.y - ancora.y))
    })

    expect(maisLonge).toBeGreaterThan(45)
  })

  it('cada perna e sorteada de novo — curva, lado e tamanho (PH-402)', () => {
    // As duas versões anteriores foram reprovadas na tela pelo MESMO motivo de
    // fundo: o caminho era uma figura fixa, e o olho acha o padrão. O arco em
    // torno de um pivô fixo leu como barca viking; o oito deitado alternava a
    // curva mas fechava sempre no mesmo ponto.
    //
    // O que impede as duas é a variedade das pernas. Estes três números são a
    // única coisa que a segura: sem eles, alguém fixa um valor "pra simplificar"
    // e a coreografia volta a ser previsível com todos os outros testes verdes.
    const world = mundoDoLance()
    duelarAte(world, 400)
    expect(world.encarada).not.toBeNull()

    const lados = new Set<number>()
    const sinaisDoArco = new Set<number>()
    const curvas: number[] = []
    let ultimaPerna = -1
    duelarAte(world, 2400, (w) => {
      const enc = w.encarada
      if (!enc || enc.perna === ultimaPerna) return
      ultimaPerna = enc.perna
      lados.add(enc.lado)
      sinaisDoArco.add(Math.sign(enc.arcoDaPerna))
      curvas.push(enc.raioDaCurva)
    })

    expect(curvas.length, 'nenhuma perna nova em 40s — o caminho travou').toBeGreaterThan(8)
    expect(lados, 'a curva entorta sempre pro mesmo lado — barca viking de volta').toEqual(new Set([1, -1]))
    expect(sinaisDoArco, 'o giro sai sempre pro mesmo sentido').toEqual(new Set([1, -1]))
    // Curvatura fixa daria um desvio-padrão zerado: todas as meia-luas com o
    // mesmo formato, variando só a orientação.
    const media = curvas.reduce((a, b) => a + b, 0) / curvas.length
    const desvio = Math.sqrt(curvas.reduce((a, c) => a + (c - media) ** 2, 0) / curvas.length)
    expect(desvio, 'todas as meia-luas com a mesma curvatura').toBeGreaterThan(8)
  })

  it('a danca nao volta pro mesmo ponto (PH-402)', () => {
    // O pedido literal depois de ver o oito na tela: "não ficou bom voltar para
    // onde começou, o ponto final podemos alterar de maneira aleatória".
    //
    // Um caminho fechado deixaria os fins de perna empilhados num punhado de
    // pontos. Aqui eles têm que estar espalhados.
    const world = mundoDoLance()
    duelarAte(world, 400)
    expect(world.encarada).not.toBeNull()

    const fins: { x: number; y: number }[] = []
    let ultimaPerna = -1
    duelarAte(world, 2400, (w) => {
      const enc = w.encarada
      if (!enc || enc.perna === ultimaPerna) return
      ultimaPerna = enc.perna
      fins.push({ x: enc.centroX, y: enc.centroY })
    })

    expect(fins.length).toBeGreaterThan(8)
    const repetidos = fins.filter((p, i) =>
      fins.some((q, j) => j < i && Math.hypot(p.x - q.x, p.y - q.y) < 8),
    ).length
    expect(repetidos / fins.length, 'as pernas terminam sempre nos mesmos pontos').toBeLessThan(0.4)
  })

  it('a coleira nao deixa o duelo migrar pela arena (PH-402)', () => {
    // O contrapeso do sorteio: pernas aleatórias sem coleira são um passeio
    // aleatório, e passeio aleatório não fica onde começou — o duelo andaria até
    // encostar numa parede e ficar raspando nela.
    const world = mundoDoLance()
    duelarAte(world, 400)
    expect(world.encarada).not.toBeNull()
    const origem = { x: world.encarada!.origemX, y: world.encarada!.origemY, chave: world.encarada!.parKey }

    let maisLonge = 0
    duelarAte(world, 3600, (w) => {
      if (w.encarada?.parKey !== origem.chave) return
      maisLonge = Math.max(maisLonge, Math.hypot(w.player!.x - origem.x, w.player!.y - origem.y))
    })

    // A coleira é 170 e mede o FIM da perna, então uma perna em curso pode
    // ultrapassar; o teto real é ela mais um passo, com folga.
    expect(maisLonge).toBeLessThan(320)
  })

  it('a distancia entre os dois nunca sai do alcance de combate, em 60s', () => {
    const world = mundoDoLance()
    duelarAte(world, 400)
    expect(parEngajado(world)).not.toBeNull()

    let pior = 0
    let desengajou = 0
    duelarAte(world, 3600, (w) => {
      const jogador = w.player!
      const inimigo = w.enemies.find((e) => e.poke.hp > 0)
      if (!inimigo) return
      if (!w.encarada) return // pose de ataque / troca de POKE: nao e o caso sob teste
      const dist = Math.hypot(inimigo.x - jogador.x, inimigo.y - jogador.y)
      pior = Math.max(pior, dist)
      if (dist > engageRangeFor(jogador, inimigo)) desengajou++
    })

    expect(desengajou, `o par saiu do alcance; pior distancia vista: ${pior}`).toBe(0)
  })

  it('a arte vira Walk enquanto gira e volta pra Idle quando para', () => {
    const world = mundoDoLance()
    duelarAte(world, 400)
    const par = parEngajado(world)!

    zerarPose(par.jogador, par.inimigo)

    par.jogador.encarando = true
    expect(desiredAnimName(par.jogador)).toBe('Walk')
    par.jogador.encarando = false
    expect(desiredAnimName(par.jogador)).toBe('Idle')
  })

  it('nao mexe em `state` — o combate continua contando os dois como engajados', () => {
    // Se a coreografia trocasse `state` pra 'chase' pra ganhar a animacao de
    // andar, `updateCombat` (que filtra `state === 'engaged'`) pararia de
    // resolver a luta.
    const world = mundoDoLance()
    duelarAte(world, 400)
    const par = parEngajado(world)!
    expect(par.jogador.state).toBe('engaged')
    expect(par.inimigo.state).toBe('engaged')
  })
})

describe('encarada: o que ela NAO faz', () => {
  beforeEach(() => useGameStateStore.getState().resetToDefaults())

  it('nao consome nenhum sorteio da sequencia principal', () => {
    const world = mundoDoLance()
    duelarAte(world, 400)
    expect(parEngajado(world)).not.toBeNull()

    const par = parEngajado(world)!
    zerarPose(par.jogador, par.inimigo)

    const antes = { ...world.rng }
    for (let i = 0; i < 600; i++) aplicarEncarada(world, PASSO)
    expect(world.rng).toEqual(antes)
  })

  it('nao roda num 1x1 sem a flag do mapa', () => {
    // Este e o teste da FLAG, e ele precisa de um mapa 1x1 pra isolar: numa
    // hunt normal a coreografia ja seria barrada por ter varios inimigos em
    // campo, entao aquele teste passa verde mesmo com o gate removido —
    // conferido sabotando o codigo.
    const world = mundoDoLance()
    duelarAte(world, 400)
    const par = parEngajado(world)!
    zerarPose(par.jogador, par.inimigo)
    expect(world.encarada, 'o cenario nao chegou a encarar; o resto do teste nao prova nada').not.toBeNull()

    world.mapDef = { ...world.mapDef!, encarada: false }
    world.encarada = null
    const antes = { x: par.jogador.x, y: par.jogador.y }
    for (let i = 0; i < 60; i++) aplicarEncarada(world, PASSO)

    expect(world.encarada).toBeNull()
    expect(par.jogador.encarando).toBe(false)
    expect(par.jogador.x).toBe(antes.x)
    expect(par.jogador.y).toBe(antes.y)
  })

  it('nao roda em hunt normal, que tem mais de um inimigo em campo', () => {
    const gs = useGameStateStore.getState()
    gs.addPokeToTeam(poke('normal'))
    gs.setActiveIndex(0)
    const world = buildMapWorld('route_46', useGameStateStore.getState().team[0], {
      seed: 0, rng: createRng(3), counters: { entity: 1, effect: 1, pendingHit: 1 },
    })
    duelarAte(world, 1200)
    expect(world.encarada).toBeNull()
    expect(world.player!.encarando).toBeFalsy()
    expect(world.enemies.some((e) => e.encarando)).toBe(false)
  })

  it('nao move ninguem no meio da pose de ataque', () => {
    const world = mundoDoLance()
    duelarAte(world, 400)
    const par = parEngajado(world)!
    zerarPose(par.jogador, par.inimigo)
    par.jogador.attackAnimTimer = 0.5
    const antes = { jx: par.jogador.x, jy: par.jogador.y, ix: par.inimigo.x, iy: par.inimigo.y }

    for (let i = 0; i < 10; i++) aplicarEncarada(world, PASSO)

    expect(par.jogador.x).toBe(antes.jx)
    expect(par.jogador.y).toBe(antes.jy)
    expect(par.inimigo.x).toBe(antes.ix)
    expect(par.inimigo.y).toBe(antes.iy)
    expect(par.jogador.encarando).toBe(false)
  })

  it('nao move ninguem com um dos dois dormindo', () => {
    // Sono e congelamento sao sobre nao poder AGIR, e uma coreografia e uma
    // acao. Basta um dos dois — nao ha encarada de um lado so.
    const world = mundoDoLance()
    duelarAte(world, 400)
    const par = parEngajado(world)!
    zerarPose(par.jogador, par.inimigo)
    par.inimigo.poke.status = { tipo: 'sleep', turnosRestantes: 3 }
    const antes = { jx: par.jogador.x, jy: par.jogador.y }

    for (let i = 0; i < 10; i++) aplicarEncarada(world, PASSO)

    expect(par.jogador.x).toBe(antes.jx)
    expect(par.jogador.y).toBe(antes.jy)
    expect(par.jogador.encarando).toBe(false)
  })

  it('solta a encarada quando o inimigo cai, mesmo com o cadaver em campo', () => {
    // A arena do Lance tem `keepCorpses`: o derrotado fica em `world.enemies`
    // pra sempre. Contar cadaver como par deixaria o jogador dancando com um
    // corpo ate o proximo POKE entrar.
    const world = mundoDoLance()
    duelarAte(world, 400)
    const par = parEngajado(world)!
    zerarPose(par.jogador, par.inimigo)
    par.inimigo.poke.hp = 0

    aplicarEncarada(world, PASSO)

    expect(world.encarada).toBeNull()
    expect(par.jogador.encarando).toBe(false)
    expect(par.inimigo.encarando).toBe(false)
  })
})

describe('encarada: parede', () => {
  beforeEach(() => useGameStateStore.getState().resetToDefaults())

  it('nao atravessa a colisao pintada da arena, e nao congela contra ela', () => {
    const world = mundoDoLance()
    duelarAte(world, 400)
    const par = parEngajado(world)!
    const mapDef = world.mapDef!
    expect(mapDef.collisionGrid, 'a arena do Lance perdeu a grade pintada').toBeTruthy()

    // Encosta o par na parede: anda pra fora do centro ate a primeira celula
    // bloqueada e recua o suficiente pra os dois caberem.
    const cx = mapDef.bounds.width / 2
    const cy = mapDef.bounds.height / 2
    let borda = 0
    for (let d = 0; d < mapDef.bounds.width; d += 2) {
      if (isCellBlocked(mapDef, cx, cy - d)) { borda = d; break }
    }
    expect(borda, 'nao achei parede nenhuma acima do centro').toBeGreaterThan(0)

    // Eixo do arco na horizontal, com o par COLADO na parede: varrendo o arco,
    // a excursao vertical de cada corpo e `raio * sen(50 graus)` = ~13px, entao
    // 4px de folga garante que o alvo caia dentro da tinta. Com folga maior o
    // teste passa verde sem nunca encostar em parede nenhuma — foi o que
    // aconteceu na primeira versao dele.
    const yEncostado = cy - borda + 4
    zerarPose(par.jogador, par.inimigo)
    par.jogador.x = cx - DISTANCIA_DA_ENCARADA / 2
    par.jogador.y = yEncostado
    par.inimigo.x = cx + DISTANCIA_DA_ENCARADA / 2
    par.inimigo.y = yEncostado
    world.encarada = null // reancora o eixo do arco na nova posicao
    expect(isCellBlocked(mapDef, par.jogador.x, par.jogador.y), 'o par nasceu dentro da parede').toBe(false)
    expect(isCellBlocked(mapDef, par.inimigo.x, par.inimigo.y), 'o par nasceu dentro da parede').toBe(false)

    let movimentoTotal = 0
    for (let i = 0; i < 600; i++) {
      const antes = { jx: par.jogador.x, jy: par.jogador.y }
      aplicarEncarada(world, PASSO)
      movimentoTotal += Math.hypot(par.jogador.x - antes.jx, par.jogador.y - antes.jy)
      expect(isCellBlocked(mapDef, par.jogador.x, par.jogador.y)).toBe(false)
      expect(isCellBlocked(mapDef, par.inimigo.x, par.inimigo.y)).toBe(false)
    }

    // Preso contra a parede a coreografia inverte o sentido em vez de travar —
    // 10s sem sair do lugar seria o defeito que `PARADO_ANTES_DE_INVERTER`
    // existe pra impedir.
    expect(movimentoTotal).toBeGreaterThan(10)
  })
})

describe('encarada: o golpe corta a perna', () => {
  beforeEach(() => useGameStateStore.getState().resetToDefaults())

  it('cada golpe trocado encerra a perna em curso', () => {
    // É o que faz a coreografia ter o RITMO DA LUTA em vez de um ritmo próprio:
    // a troca de golpe recomeça a dança noutra direção, em vez de o par retomar
    // a curva de onde parou como se nada tivesse acontecido.
    //
    // Se `trocas` ficar em 0, a borda de subida da pose de ataque deixou de ser
    // vista e nenhum outro teste deste arquivo acusa — a dança continua, só que
    // desacoplada do combate.
    const world = mundoDoLance()
    duelarAte(world, 400)
    expect(parEngajado(world)).not.toBeNull()
    const antes = world.encarada!.perna

    duelarAte(world, 1200) // 20s: cabem vários turnos de MIN_ACTION_GAP (3s)

    expect(world.encarada?.trocas ?? 0).toBeGreaterThan(0)
    // Cada troca força uma perna nova, então o contador de pernas tem que ter
    // andado pelo menos tanto quanto o de golpes.
    expect((world.encarada?.perna ?? 0) - antes).toBeGreaterThanOrEqual(world.encarada!.trocas)
  })

  it('pares diferentes nao herdam a mesma coreografia', () => {
    // O sorteio deriva de `parKey`. Se ele parasse de derivar (uma semente fixa
    // "pra simplificar"), todo duelo do jogo dançaria exatamente igual — e todos
    // os testes de variedade acima continuariam verdes, porque eles olham um
    // duelo só.
    const world = mundoDoLance()
    duelarAte(world, 500)
    const enc = world.encarada!
    const outro = { ...enc, parKey: 'entity-9|entity-8' }

    const daquele = [1, 2, 3, 4, 5].map((n) => assinaturaDaPerna(enc, n))
    const desteOutro = [1, 2, 3, 4, 5].map((n) => assinaturaDaPerna(outro, n))
    expect(daquele).not.toEqual(desteOutro)
  })
})

describe('encarada: onde ela esta ligada', () => {
  it('nos 12 mapas de duelo, e em nenhum outro', () => {
    const comEncarada = Object.values(MAPS).filter((m) => m.encarada).map((m) => m.id).sort()
    const esperado = [LANCE_MAP_ID, ...LEGENDARY_SPECIES_IDS.map((id) => `boss_${id}`)].sort()
    expect(comEncarada).toEqual(esperado)
  })

  it('sobrevive ao `mapDefParaSala`, que e por onde o motor le o mapa', () => {
    // `getMap` e `mapDefParaSala` reconstroem o objeto; um campo novo que nao
    // atravesse esse caminho chega no motor como `undefined` e a coreografia
    // some sem erro nenhum. Foi assim que o `respawnDelay` da arena virou 0,5s.
    expect(mapDefParaSala(LANCE_MAP_ID, null)?.encarada).toBe(true)
    expect(mapDefParaSala('route_46', null)?.encarada).toBeFalsy()
  })
})
