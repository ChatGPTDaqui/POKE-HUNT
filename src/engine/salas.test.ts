// Salas: a hunt e percorrida em 10 sub-biomas sorteados, e limpar a quota de
// abates leva pra proxima.
//
// Toda falha aqui e silenciosa. Uma sala que nao avanca deixa o jogador no
// mesmo sub-bioma pra sempre e nada no jogo denuncia; um pool de sala ignorado
// faz o spawn voltar a ser o da hunt inteira e a feature simplesmente nao
// existe, tambem sem erro. Foi assim que o `sequenceIndex` do Campeao Lance
// ficou quebrado por levas.
import { describe, expect, it, beforeEach } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { buildMapWorld, stepWorld, handleEnemyDefeated } from './simulation'
import {
  janelaDaSala, poolAtivo, registrarAbate, temSalas, aplicarTransicaoDeSala, SALA_TRANSITION_COUNTDOWN,
  reconciliarSalaDaAutoridade, ESPERA_MAXIMA_PELA_AUTORIDADE, protetorDaSala,
} from './systems/salaSystem'
import { POOL_POR_SALA } from '@/data/huntSpawnOverrides'
import { ABATES_POR_SALA, ABATES_COMUNS_POR_SALA } from '@/data/biomas'
import { ESTAGIOS_POR_BIOMA, estagioId, niveisDoEstagio, quantidadeDeSalas, salasDoEstagio } from '@/data/estagios'
import { ENCOUNTERS } from '@/data/huntSpawnOverrides'
import { useGameStateStore } from '@/stores/gameStateStore'
import type { SalaAtiva, WorldState } from './types'

const HUNT = 'mata_e1'
const SALAS = quantidadeDeSalas(HUNT)

function mundo(semente: number, mapa = HUNT): WorldState {
  const rng = createRng(semente)
  const poke = createPokeInstance(rng, 'charmander', 20)
  return buildMapWorld(mapa, poke, { seed: 0,
    rng: createRng(semente),
    counters: { entity: 1, effect: 1, pendingHit: 1 },
  })
}

/**
 * PH-225/236: todo bioma agora pede protetor em TODA sala (nao so a
 * ultima) — `registrarAbate` se recusa a armar a transicao enquanto
 * `protetorDaSala(sala)` for verdade (ver salaSystem.ts), e o motor so cria
 * o protetor de verdade via `stepWorld`/`buildMapWorld`, nunca via
 * `registrarAbate` sozinho. Ao fechar a quota aqui (helper de baixo nivel,
 * sem stepWorld), o teste precisa simular o resto do fluxo real: um tick pra
 * nascer o protetor, resolve-lo (mata direto, silent) e SO ENTAO a quota
 * realmente libera a transicao. Sem isto, o helper ficaria testando um
 * caminho que nao existe mais em bioma nenhum do jogo.
 */
/**
 * Devolve `avancou`/`fechouEstagio` igual `registrarAbate` devolveria — o
 * sinal se perde de verdade quando a transicao arma via
 * `resolverProtetorDaSala` (o `armarTransicaoDeSala` interno descarta o
 * retorno), entao quem chama `abater()` esperando ler `fechouEstagio` no
 * evento do abate 30 precisa deste substituto.
 */
function resolverProtetorSeHouver(world: WorldState): { avancou: boolean; fechouEstagio: boolean } {
  // PH-473: a quota que faz o protetor nascer e a de COMUNS (29) — ele e o 30o
  // abate, nao o 31o. Este guard era `< ABATES_POR_SALA` e passou a sair cedo
  // sempre, porque `registrarAbate` agora capa em 29 enquanto o protetor esta
  // de pe: o helper "resolvia" um protetor que nunca ia nascer.
  if (world.sala!.abates < ABATES_COMUNS_POR_SALA || !protetorDaSala(world.sala, HUNT)) {
    return { avancou: false, fechouEstagio: false }
  }
  const gameState = useGameStateStore.getState()
  if (!world.protetorPendente) tick(world, 0.1, gameState) // nasce o protetor
  matarProtetor(world, gameState)
  const fechouEstagio = world.salaPendente?.indice === 0
  return { avancou: world.salaCountdownRemaining != null, fechouEstagio }
}

/**
 * Mata o protetor em campo e CONTA o abate dele (PH-473).
 *
 * O abate do protetor e o 30o da sala. No jogo quem conta e o laco de kills do
 * `stepWorld`; estes helpers chamam `handleEnemyDefeated` na mao, entao a
 * contagem e responsabilidade deles — sem isto a sala ficaria eternamente em
 * 29/30 nos testes e a barra do HUD que eles descrevem nao seria a do jogo.
 */
function matarProtetor(
  world: WorldState, gameState: ReturnType<typeof useGameStateStore.getState>,
): boolean {
  const protetor = world.enemies.find((e) => e.isProtetor)
  if (!protetor) return false
  handleEnemyDefeated(world, protetor, gameState, { silent: true })
  world.enemies = world.enemies.filter((e) => !e.isProtetor)
  registrarAbate(world, world.mapDef!.id)
  return true
}

/**
 * Mesma logica de `resolverProtetorSeHouver`, mas envolvendo `stepWorld` —
 * pros testes que avancam o mundo em loop direto (nao passam pelo helper
 * `abater()`). Resolve o protetor NA HORA que ele aparece, no mesmo tick,
 * pra nao alterar o numero de ticks que cada teste ja calculava com cuidado
 * (ESPERA_MAXIMA_PELA_AUTORIDADE, SALA_TRANSITION_COUNTDOWN etc).
 */
function tick(world: WorldState, dt: number, gameState: ReturnType<typeof useGameStateStore.getState>) {
  stepWorld(world, dt, gameState, { silent: true })
  if (world.protetorPendente) matarProtetor(world, gameState)
}

/**
 * Conta abates direto, sem esperar o combate — o alvo aqui e a maquina de
 * salas. Ao fechar a quota, `registrarAbate` so ARMA a transicao (ver
 * salaSystem.ts); resolve na hora (equivalente a um tick de `stepWorld` com
 * dt >= SALA_TRANSITION_COUNTDOWN) pra poder continuar contando abates da
 * sala seguinte no mesmo loop.
 */
function abater(world: WorldState, quantos: number) {
  const eventos = []
  for (let i = 0; i < quantos; i++) {
    const evento = registrarAbate(world, world.mapDef!.id)
    const doProtetor = resolverProtetorSeHouver(world)
    eventos.push(doProtetor.avancou ? doProtetor : evento)
    if (world.salaCountdownRemaining != null) {
      aplicarTransicaoDeSala(world, world.mapDef!.id)
      world.salaCountdownRemaining = null
    }
  }
  return eventos
}

describe('salas', () => {
  beforeEach(() => {
    useGameStateStore.getState().resetToDefaults()
  })

  it('hunt de bioma nasce dentro de uma sala; inicial e BOSS nao tem sala', () => {
    expect(temSalas(HUNT)).toBe(true)
    expect(temSalas('route_46')).toBe(false)
    expect(temSalas('boss_lance')).toBe(false)

    const world = mundo(1)
    expect(world.sala).not.toBeNull()
    expect(world.sala!.indice).toBe(0)
    expect(world.sala!.abates).toBe(0)
    expect(world.sala!.ciclos).toBe(0)
    expect(POOL_POR_SALA[HUNT][world.sala!.chave]).toBeTruthy()

    expect(mundo(1, 'route_46').sala).toBeNull()
    expect(mundo(1, 'boss_lance').sala).toBeNull()
  })

  it('a sala avanca exatamente na quota de abates, nao antes', () => {
    const world = mundo(2)
    const antes = world.sala!.chave

    const parciais = abater(world, ABATES_COMUNS_POR_SALA - 1)
    expect(parciais.every((e) => !e.avancou)).toBe(true)
    expect(world.sala!.indice).toBe(0)
    expect(world.sala!.abates).toBe(ABATES_COMUNS_POR_SALA - 1)
    expect(world.salaCountdownRemaining).toBeNull()

    // O abate que fecha a quota so ARMA a transicao — a sala AINDA e a
    // antiga ate a contagem regressiva zerar (ver salaSystem.ts). PH-225:
    // sala com protetor habilitado NAO arma no proprio abate — so depois de
    // resolver o protetor que nasce por causa dele (registrarAbate se
    // recusa de proposito, ver salaSystem.ts#registrarAbate).
    //
    // PH-473: E A QUOTA DE COMUNS SAO 29, nao 30. O protetor e o 30o abate,
    // entao a barra para em 29/30 ate ele cair — o cap de `registrarAbate` e a
    // quota vigente, e nao o total. Antes disto ela ia a 30/30 e a sala nao
    // avancava, que e a leitura "completei a sala e ela travou".
    const ultimo = registrarAbate(world, world.mapDef!.id)
    expect(ultimo.avancou).toBe(false)
    expect(world.sala!.abates).toBe(ABATES_COMUNS_POR_SALA)
    resolverProtetorSeHouver(world)
    // O abate do protetor fecha os 30.
    expect(world.sala!.abates).toBe(ABATES_POR_SALA)
    expect(world.sala!.indice).toBe(0)
    expect(world.salaCountdownRemaining).toBe(SALA_TRANSITION_COUNTDOWN)
    expect(world.salaPendente).not.toBeNull()
    expect(world.salaPendente!.indice).toBe(1)

    aplicarTransicaoDeSala(world, world.mapDef!.id)
    expect(world.sala!.indice).toBe(1)
    expect(world.sala!.abates).toBe(0)
    expect(world.salaPendente).toBeNull()
    // A sala nova pode calhar de ser o mesmo sub-bioma (o sorteio e com
    // reposicao); o que nao pode e o contador nao zerar.
    expect(typeof world.sala!.chave).toBe('string')
    expect(antes).toBeTruthy()
  })

  it('a contagem regressiva entre salas congela o mundo e troca tudo do zero ao zerar', () => {
    const world = mundo(6)
    const gameState = useGameStateStore.getState()

    for (let i = 0; i < ABATES_POR_SALA; i++) registrarAbate(world, world.mapDef!.id)
    resolverProtetorSeHouver(world) // PH-225: sala com protetor habilitado, so arma depois de resolver
    expect(world.salaCountdownRemaining).toBe(SALA_TRANSITION_COUNTDOWN)
    expect(world.sala!.indice).toBe(0)

    // Congelado: um tick pequeno so desconta a contagem, nada mais muda.
    //
    // `silent: false` desde a PH-331, e a diferenca e o assunto do teste: a
    // contagem regressiva existe pro JOGADOR ler o nome da area nova, entao
    // simulacao silenciosa (resim do servidor, catch-up de aba oculta) passa a
    // encurta-la pra zero — sem plateia nao ha o que esperar, e a espera custava
    // a transicao inteira quando a janela de flush fechava no meio dela. Quem
    // congela o mundo por 3 segundos e o jogo ao vivo, e e ele que este caso
    // mede. O corte silencioso tem cobertura propria em
    // `avancoDeSalaAtravessaAJanela.test.ts`.
    const enemiesAntes = world.enemies.length
    stepWorld(world, 0.1, gameState, { silent: false })
    expect(world.sala!.indice).toBe(0)
    expect(world.enemies.length).toBe(enemiesAntes)

    // Tick grande o bastante zera a contagem: sala nova, area do zero.
    stepWorld(world, SALA_TRANSITION_COUNTDOWN, gameState, { silent: false })
    expect(world.salaCountdownRemaining).toBeNull()
    expect(world.sala!.indice).toBe(1)
    expect(world.sala!.abates).toBe(0)
    expect(world.enemies.length).toBeGreaterThan(0)
    const daSalaNova = new Set(POOL_POR_SALA[HUNT][world.sala!.chave].map((id) => ENCOUNTERS[id].speciesId))
    for (const inimigo of world.enemies) {
      expect(daSalaNova.has(inimigo.poke.speciesId)).toBe(true)
    }
  })

  it('fechar as 10 salas reinicia o ciclo em vez de acabar a hunt', () => {
    const world = mundo(3)
    // Um ciclo inteiro menos o ultimo abate.
    const eventos = abater(world, ABATES_COMUNS_POR_SALA * SALAS)
    const fechamentos = eventos.filter((e) => e.fechouEstagio)

    expect(fechamentos.length).toBe(1)
    expect(world.sala!.indice).toBe(0)
    expect(world.sala!.ciclos).toBe(1)
    // "Acabar a hunt" faria 6 horas de farm offline valerem os poucos minutos
    // ate a sala 10.
    expect(world.sala).not.toBeNull()
  })

  it('so nasce inimigo do pool da sala atual', () => {
    const world = mundo(4)
    const daSala = new Set(POOL_POR_SALA[HUNT][world.sala!.chave])
    const especiesDaSala = new Set([...daSala].map((id) => ENCOUNTERS[id].speciesId))

    // O mundo ja nasce com `maxEnemies` inimigos; todos tem que vir da sala.
    expect(world.enemies.length).toBeGreaterThan(0)
    for (const inimigo of world.enemies) {
      expect(especiesDaSala.has(inimigo.poke.speciesId), `${inimigo.poke.speciesId} fora da sala ${world.sala!.chave}`).toBe(true)
    }

    // E o respawn, que roda por outro caminho no stepWorld, tambem.
    const gameState = useGameStateStore.getState()
    for (let i = 0; i < 3000; i++) tick(world, 0.1, gameState)
    const salaAgora = world.sala!.chave
    const permitidas = new Set(POOL_POR_SALA[HUNT][salaAgora].map((id) => ENCOUNTERS[id].speciesId))
    for (const inimigo of world.enemies) {
      expect(permitidas.has(inimigo.poke.speciesId), `${inimigo.poke.speciesId} fora da sala ${salaAgora}`).toBe(true)
    }
  })

  it('a sala sobrevive a reconstrucao do mundo', () => {
    // Este e o teste que o Campeao Lance nao tinha. O servidor reconstroi o
    // mundo a cada janela de flush (~30s); sem passar o progresso, a hunt
    // voltaria pra sala 1 de meio em meio minuto pra sempre.
    const poke = createPokeInstance(createRng(5), 'charmander', 20)
    const salva = { indice: 6, chave: 'jungle', abates: 4, ciclos: 2 }
    const world = buildMapWorld(
      HUNT, poke,
      { seed: 0, rng: createRng(5), counters: { entity: 1, effect: 1, pendingHit: 1 } },
      { sala: salva },
    )
    expect(world.sala).toEqual(salva)

    const permitidas = new Set(POOL_POR_SALA[HUNT].jungle.map((id) => ENCOUNTERS[id].speciesId))
    for (const inimigo of world.enemies) {
      expect(permitidas.has(inimigo.poke.speciesId)).toBe(true)
    }
  })

  it('sem sala, o pool ativo e o da hunt inteira', () => {
    const inteiro = ['a', 'b']
    expect(poolAtivo(HUNT, null, inteiro)).toBe(inteiro)
  })

  // Uma faixa cobria 30 niveis. Sem a janela, a PRIMEIRA sala ja podia jogar um
  // POKE Lv30 contra quem acabou de sair do Hospital — medido no motor
  // headless: Charmander Lv25 morreu em 4 abates em 30 minutos de "Mata I", e
  // com a janela fez 114 abates e chegou na ultima sala.
  //
  // PH-427: agora o teste roda nos 10 ESTAGIOS, cada um com o numero de salas
  // dele (3 a 8). E o caso mais apertado do sistema: 10 niveis divididos por 8
  // salas dao degraus de 1,25 nivel, e varias salas ficam com janela de um
  // unico nivel. Nenhum buraco e nenhuma inversao pode aparecer ai.
  it('a janela cobre o estagio inteiro, sem buraco, nos 10 estagios', () => {
    for (let estagio = 1; estagio <= ESTAGIOS_POR_BIOMA; estagio++) {
      const niveis = niveisDoEstagio(estagio)
      const salas = salasDoEstagio(estagio)
      const janelas = Array.from({ length: salas }, (_, i) => janelaDaSala(niveis, i, salas))
      const onde = `estagio ${estagio} (${salas} salas, Lv ${niveis[0]}-${niveis[1]})`

      // O criterio de aceite da issue: a primeira sala comeca no PISO do
      // estagio e a ultima termina no TETO dele.
      expect(janelas[0][0], `${onde}: a sala 1 nao comeca no piso`).toBe(niveis[0])
      expect(janelas[salas - 1][1], `${onde}: a ultima sala nao chega no teto`).toBe(niveis[1])

      for (const [lo, hi] of janelas) {
        expect(lo, onde).toBeGreaterThanOrEqual(niveis[0])
        expect(hi, onde).toBeLessThanOrEqual(niveis[1])
        expect(hi, onde).toBeGreaterThanOrEqual(lo)
      }
      // Contigua: a sala seguinte nunca comeca depois do fim da anterior, senao
      // haveria nivel que nenhuma sala alcanca.
      for (let i = 1; i < janelas.length; i++) {
        expect(janelas[i][0], `${onde}: buraco entre a sala ${i} e a ${i + 1}`)
          .toBeLessThanOrEqual(janelas[i - 1][1] + 1)
      }
      // E monotonica: a hunt afunda, nunca volta.
      for (let i = 1; i < janelas.length; i++) {
        expect(janelas[i][0], onde).toBeGreaterThanOrEqual(janelas[i - 1][0])
      }
    }
  })

  it('a sala so faz nascer inimigo dentro da janela dela', () => {
    const poke = createPokeInstance(createRng(9), 'charmander', 20)
    const world = buildMapWorld(
      HUNT, poke,
      { seed: 0, rng: createRng(9), counters: { entity: 1, effect: 1, pendingHit: 1 } },
      { sala: { indice: 0, chave: 'tall-grass', abates: 0, ciclos: 0 } },
    )
    const [, teto] = janelaDaSala(world.mapDef!.levelRange, 0, SALAS)
    for (const inimigo of world.enemies) {
      expect(inimigo.poke.level, `${inimigo.poke.speciesId} acima da janela da sala 1`).toBeLessThanOrEqual(teto)
    }
  })

  // O criterio de aceite da PH-427, nomeado: o Lord muda de endereco conforme
  // o estagio. Com a constante antiga (indice 9 fixo) o estagio 1 nunca teria
  // Lord — a sala 3 pediria Guardian pra sempre e o estagio nunca fecharia.
  it('o Lord mora na ULTIMA sala do estagio, e a ultima muda com o estagio', () => {
    const casos: [number, number][] = [[1, 3], [10, 8]]
    for (const [estagio, salasEsperadas] of casos) {
      const mapId = estagioId('mata', estagio)
      expect(quantidadeDeSalas(mapId), `estagio ${estagio}`).toBe(salasEsperadas)
      for (let indice = 0; indice < salasEsperadas - 1; indice++) {
        expect(protetorDaSala({ indice, chave: 'jungle', abates: 0, ciclos: 0 }, mapId), `e${estagio} sala ${indice + 1}`)
          .toBe('guardian')
      }
      expect(
        protetorDaSala({ indice: salasEsperadas - 1, chave: 'jungle', abates: 0, ciclos: 0 }, mapId),
        `e${estagio} sala ${salasEsperadas}`,
      ).toBe('lord')
    }
  })
})

// ---------------------------------------------------------------------------
// Sala sob AUTORIDADE do servidor
// ---------------------------------------------------------------------------
// O bug que este bloco tranca foi observado ao vivo (log em
// salaSystem.ts#registrarAbate): as duas simulacoes sorteiam sub-bioma com
// sequencias diferentes, entao o cliente aplicava o palpite dele e o flush
// escrevia o do servidor por cima — sem aviso na tela e sem trocar o mapa
// desenhado. Nada disso lanca erro: o HUD mostra um nome, o canvas desenha
// outro sub-bioma, e a colisao continua a da sala anterior.
describe('sala sob autoridade do servidor', () => {
  beforeEach(() => {
    useGameStateStore.getState().resetToDefaults()
  })

  it('o cliente conta o abate e NAO sorteia a proxima sala', () => {
    const world = mundo(7)
    world.salaSobAutoridade = true
    const daPrimeira = world.sala!.chave

    for (let i = 0; i < ABATES_POR_SALA + 5; i++) registrarAbate(world, world.mapDef!.id)

    expect(world.sala!.chave).toBe(daPrimeira)
    expect(world.sala!.indice).toBe(0)
    // PH-473: o teto sob autoridade e a QUOTA VIGENTE, e com o protetor de pe
    // ela e 29 — a barra do cliente nao pode ir a 30/30 antes de o chefe cair,
    // senao ela volta a dizer "sala completa" com a sala parada.
    expect(world.sala!.abates).toBe(ABATES_COMUNS_POR_SALA) // com teto, sem estourar a quota
    expect(world.salaPendente).toBeNull()
    expect(world.salaCountdownRemaining).toBeNull()
  })

  it('sem autoridade remota o sorteio local continua valendo', () => {
    const world = mundo(7)
    expect(world.salaSobAutoridade).toBe(false)
    for (let i = 0; i < ABATES_POR_SALA; i++) registrarAbate(world, world.mapDef!.id)
    resolverProtetorSeHouver(world) // PH-225: sala com protetor habilitado, so arma depois de resolver
    expect(world.salaPendente).not.toBeNull()
    expect(world.salaCountdownRemaining).toBe(SALA_TRANSITION_COUNTDOWN)
  })

  it('sala do servidor IGUAL: so o contador anda, sem aviso e sem trocar cena', () => {
    const world = mundo(11)
    const atual = world.sala!
    reconciliarSalaDaAutoridade(world, { ...atual, abates: 7 })
    expect(world.sala!.abates).toBe(7)
    expect(world.salaPendente).toBeNull()
    expect(world.salaCountdownRemaining).toBeNull()
  })

  it('contador do servidor nunca puxa a barra pra tras', () => {
    // Entre o inicio da janela e a resposta o jogador continuou matando: o
    // contador local ja passou do que o servidor viu. Aceitar o menor fazia a
    // barra do HUD recuar sozinha — foi um dos sintomas do log.
    const world = mundo(11)
    world.sala!.abates = 9
    reconciliarSalaDaAutoridade(world, { ...world.sala!, abates: 4 })
    expect(world.sala!.abates).toBe(9)
  })

  it('sala do servidor DIFERENTE entra pela transicao, nao por escrita direta', () => {
    const world = mundo(11)
    const antes = world.sala!.chave
    const outra = Object.keys(POOL_POR_SALA[HUNT]).find((c) => c !== antes)!

    reconciliarSalaDaAutoridade(world, { indice: 1, chave: outra, abates: 0, ciclos: 0 })

    // A sala em campo NAO troca na hora: quem troca mapa/colisao/inimigos e
    // `aplicarTransicaoDeSala`, no fim da contagem regressiva.
    expect(world.sala!.chave).toBe(antes)
    expect(world.salaPendente!.chave).toBe(outra)
    expect(world.salaCountdownRemaining).toBe(SALA_TRANSITION_COUNTDOWN)
  })

  it('sala ANTERIOR do servidor e ignorada (nao volta pra sala 1)', () => {
    const world = mundo(11)
    const primeira = world.sala!.chave
    world.sala = { indice: 3, chave: primeira, abates: 5, ciclos: 0 }
    const outra = Object.keys(POOL_POR_SALA[HUNT]).find((c) => c !== primeira)!

    reconciliarSalaDaAutoridade(world, { indice: 0, chave: outra, abates: 0, ciclos: 0 })

    expect(world.sala!.indice).toBe(3)
    expect(world.salaPendente).toBeNull()
    expect(world.salaCountdownRemaining).toBeNull()
  })

  it('ciclo NOVO conta como avanco, mesmo com indice menor', () => {
    const world = mundo(11)
    const primeira = world.sala!.chave
    // PH-427: a ULTIMA sala do estagio, lida da fonte. Era 9 fixo, um indice
    // que nem existe num estagio de 3 salas — e com a posicao comparavel agora
    // multiplicada pelas salas DO ESTAGIO (`ciclos * salas + indice`), o 9
    // ficava adiante do ciclo novo e a reconciliacao recusava o avanco.
    world.sala = { indice: SALAS - 1, chave: primeira, abates: ABATES_POR_SALA, ciclos: 0 }
    const outra = Object.keys(POOL_POR_SALA[HUNT]).find((c) => c !== primeira)!

    reconciliarSalaDaAutoridade(world, { indice: 0, chave: outra, abates: 0, ciclos: 1 })

    expect(world.salaPendente!.ciclos).toBe(1)
    expect(world.salaCountdownRemaining).toBe(SALA_TRANSITION_COUNTDOWN)
  })

  it('a transicao vinda do servidor troca a cena inteira, como a local', () => {
    const world = mundo(11)
    const outra = Object.keys(POOL_POR_SALA[HUNT]).find((c) => c !== world.sala!.chave)!
    world.enemies.push(...world.enemies) // qualquer coisa em campo
    reconciliarSalaDaAutoridade(world, { indice: 1, chave: outra, abates: 0, ciclos: 0 })

    const gameState = useGameStateStore.getState()
    stepWorld(world, SALA_TRANSITION_COUNTDOWN + 0.1, gameState, { silent: true })

    expect(world.sala!.chave).toBe(outra)
    expect(world.salaPendente).toBeNull()
    // Pool da sala NOVA, nao da anterior: e a prova de que a cena trocou de
    // verdade, e nao so o rotulo do HUD. Era exatamente aqui que o bug morava —
    // o nome mudava e o mundo (arte, colisao, spawn) ficava na sala velha.
    const especiesDaNova = new Set(POOL_POR_SALA[HUNT][outra].map((id) => ENCOUNTERS[id].speciesId))
    expect(world.enemies.length).toBeGreaterThan(0)
    for (const inimigo of world.enemies) {
      expect(especiesDaNova.has(inimigo.poke.speciesId), inimigo.poke.speciesId + ' fora da sala ' + outra).toBe(true)
    }
  })

  // Os dois testes abaixo sao um par: `null` do servidor significa coisas
  // OPOSTAS em hunt com e sem salas, e tratar os dois igual apagava a sala em
  // jogo. Medido ao vivo em 2026-08-20 nas hunts do Pesadelo (cliente novo,
  // Edge Function publicada ainda velha): o chip "Sala 1/10" desaparecia e o
  // sub-bioma voltava atras no primeiro flush. Sem aviso, sem erro no console.
  it('null do servidor NAO apaga a sala de hunt que tem salas (servidor velho)', () => {
    const world = mundo(13)
    const antes = { ...world.sala! }
    expect(temSalas(world.mapDef!.id)).toBe(true)

    reconciliarSalaDaAutoridade(world, null)

    expect(world.sala).not.toBeNull()
    expect(world.sala!.chave).toBe(antes.chave)
    expect(world.sala!.indice).toBe(antes.indice)
    expect(world.salaPendente).toBeNull()
    expect(world.salaCountdownRemaining).toBeNull()
  })

  it('null do servidor APAGA a sala de hunt sem salas (o caso legitimo)', () => {
    // O contrafactual do teste acima: sem ele, "nunca apagar em null" passaria
    // igual e deixaria sub-bioma pendurado no HUD fora de hunt de bioma.
    const world = mundo(13, 'route_46')
    expect(temSalas(world.mapDef!.id)).toBe(false)
    world.sala = { indice: 3, chave: 'grass', abates: 5, ciclos: 0 }

    reconciliarSalaDaAutoridade(world, null)

    expect(world.sala).toBeNull()
    expect(world.salaPendente).toBeNull()
    expect(world.salaCountdownRemaining).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Quota fechada vale por si — o livelock da janela curta
// ---------------------------------------------------------------------------
// `salaPendente`/`salaCountdownRemaining` sao efemeros: nao atravessam a
// reconstrucao de mundo que o servidor faz a cada janela de flush. Enquanto a
// transicao dependia do PROXIMO abate, uma janela curta demais pra caber
// "matar + 3s de contagem" perdia a transicao e recomecava do zero na janela
// seguinte — a sala travava em `abates: 30` pra sempre. Observado ao vivo em
// 2026-08-19 com janelas de 5s (o cliente passou a pedir flush na hora que a
// quota fecha), e invisivel antes porque a janela normal e de 30s.
describe('quota de sala fechada atravessa a janela', () => {
  beforeEach(() => {
    useGameStateStore.getState().resetToDefaults()
  })

  it('sala que ABRE a janela com a quota cheia troca sem depender de abate novo', () => {
    const world = mundo(21)
    const daPrimeira = world.sala!.chave
    world.sala!.abates = ABATES_POR_SALA
    // Sem inimigo em campo: nada pode morrer, entao a unica coisa capaz de
    // armar a transicao e a quota ja fechada.
    world.enemies = []
    world.respawnTimer = 999

    const gameState = useGameStateStore.getState()
    for (let i = 0; i < 60; i++) tick(world, 0.1, gameState)

    expect(world.sala!.indice).toBe(1)
    expect(world.salaPendente).toBeNull()
    expect(world.salaCountdownRemaining).toBeNull()
    // Sub-bioma novo (pode repetir por sorteio, mas o indice tem que ter andado)
    expect(typeof world.sala!.chave).toBe('string')
    expect(daPrimeira).toBeTruthy()
  })

  it('a janela do servidor troca a sala mesmo sem abate nenhum nela', () => {
    // Cada iteracao imita uma janela de flush: mundo reconstruido do progresso
    // persistido, simulacao, progresso lido de volta. Com a transicao dependendo
    // de abate, o indice ficava em 0 pra sempre.
    //
    // 5 segundos era o piso REAL da janela ate PH-273, quando o pedido de sala
    // repetia a cada 5s (autoridade.ts#REPETIR_PEDIDO_DE_SALA_MS, hoje 30s
    // porque janela curta travava a hunt). O piso baixo continua aqui de
    // proposito: a contagem regressiva e de 3s, e uma janela mais curta que ela
    // nao pode travar a troca — deve apenas rearmar na janela seguinte.
    let progresso = { indice: 0, chave: '', abates: ABATES_POR_SALA, ciclos: 0 }
    const primeiro = mundo(33)
    progresso = { ...progresso, chave: primeiro.sala!.chave }

    const gameState = useGameStateStore.getState()
    const poke = createPokeInstance(createRng(33), 'charmander', 20)
    const world = buildMapWorld(HUNT, poke, { seed: 0,
      rng: createRng(33),
      counters: { entity: 1, effect: 1, pendingHit: 1 },
    }, { sala: { ...progresso } })
    // PH-225: quota ja fechada na propria reconstrucao (`progresso.sala.abates`)
    // faz `buildMapWorld` reconstruir o protetor pendente na hora — a linha
    // antiga `world.enemies = []` (pre-protetor) apagava a entidade sem
    // apagar `world.protetorPendente`, travando a sala pra sempre
    // (protetorPendente "fantasma", sem entidade correspondente pra
    // resolver). Resolve o protetor ANTES de zerar o campo, entao.
    resolverProtetorSeHouver(world)
    world.enemies = []
    world.respawnTimer = 999
    for (let i = 0; i < 50; i++) tick(world, 0.1, gameState)

    expect(world.sala!.indice, 'a sala nao avancou numa janela de 5s sem abate').toBe(1)
    expect(world.salaPendente, 'a transicao ficou pendurada').toBeNull()
    // `abates` NAO e mais necessariamente 0 aqui (PH-331). A janela silenciosa
    // deixou de esperar os 3s da contagem regressiva, entao a sala nova entra em
    // vigor com ~4,8s de janela sobrando pro jogador farmar nela — e o contador
    // legitimamente sai de zero. O que o teste garante e que ele foi ZERADO na
    // troca (nao herdou os 30 da sala anterior), nao que nada aconteceu depois.
    expect(world.sala!.abates).toBeLessThan(ABATES_POR_SALA)
  })

  it('sob autoridade remota a quota cheia NAO arma nada (quem decide e o servidor)', () => {
    const world = mundo(21)
    world.salaSobAutoridade = true
    const daPrimeira = world.sala!.chave
    world.sala!.abates = ABATES_POR_SALA
    world.enemies = []
    world.respawnTimer = 999

    const gameState = useGameStateStore.getState()
    for (let i = 0; i < 60; i++) tick(world, 0.1, gameState)

    expect(world.sala!.indice).toBe(0)
    expect(world.sala!.chave).toBe(daPrimeira)
    expect(world.salaPendente).toBeNull()
  })
})

// A rede de seguranca de VERSAO: servidor publicado antes de 2026-08-19 nunca
// fecha a transicao quando a janela e curta, e o cliente — que parou de sortear —
// ficaria com a barra cheia e a sala parada pra sempre. Depois da espera, a
// predicao local volta a valer.
describe('espera pela autoridade tem teto', () => {
  beforeEach(() => {
    useGameStateStore.getState().resetToDefaults()
  })

  it('cliente volta a sortear se o servidor nao trouxer sala nova', () => {
    const world = mundo(45)
    world.salaSobAutoridade = true
    world.sala!.abates = ABATES_POR_SALA
    // PH-225: chave sem bioma mapeado de proposito — este teste e sobre o
    // MECANISMO de espera/fallback de autoridade, nao sobre protetor. Sob
    // salaSobAutoridade, resolver o protetor nao arma nada localmente (so o
    // servidor decide a proxima sala), entao a mesma sala re-pediria
    // protetor pra sempre e nunca deixaria o timer de espera abaixo
    // acumular.
    world.sala!.chave = 'sala-de-teste-sem-protetor'
    world.enemies = []
    world.respawnTimer = 999
    const gameState = useGameStateStore.getState()
    // PH-271: o servidor deste cenario esta MUDO — nenhuma resposta chega, e e
    // so isso que libera o palpite local hoje. Servidor que responde, mesmo
    // repetindo a mesma sala, faz o cliente esperar.

    // Antes do teto: nada acontece, o cliente espera.
    for (let i = 0; i < Math.floor((ESPERA_MAXIMA_PELA_AUTORIDADE - 2) / 0.1); i++) {
      tick(world, 0.1, gameState)
    }
    expect(world.sala!.indice).toBe(0)
    expect(world.salaPendente).toBeNull()

    // Passado o teto (mais a contagem regressiva), a sala anda.
    for (let i = 0; i < Math.floor((2 + SALA_TRANSITION_COUNTDOWN + 1) / 0.1); i++) {
      tick(world, 0.1, gameState)
    }
    expect(world.sala!.indice).toBe(1)
  })

  it('a espera zera quando a sala do servidor chega', () => {
    const world = mundo(45)
    world.salaSobAutoridade = true
    world.sala!.abates = ABATES_POR_SALA
    world.sala!.chave = 'sala-de-teste-sem-protetor' // ver nota do teste acima
    world.enemies = []
    world.respawnTimer = 999
    const gameState = useGameStateStore.getState()
    for (let i = 0; i < 100; i++) tick(world, 0.1, gameState)
    expect(world.salaEsperaDaAutoridade).toBeGreaterThan(0)

    const outra = Object.keys(POOL_POR_SALA[HUNT]).find((c) => c !== world.sala!.chave)!
    reconciliarSalaDaAutoridade(world, { indice: 1, chave: outra, abates: 0, ciclos: 0 })
    expect(world.salaEsperaDaAutoridade).toBe(0)
  })
})

// A predicao do fallback nao pode virar um trilho paralelo. Estes dois casos
// sao o bug relatado como "o sub-bioma troca do nada": depois de uma predicao
// local, TODA sala do servidor caia na protecao anti-regressao e era
// descartada, e o cliente seguia sorteando sozinho a cada teto de espera — com
// o pool e o loot creditados vindo de outra sala, sem nada na tela denunciando.
describe('predicao local cede pra autoridade', () => {
  beforeEach(() => {
    useGameStateStore.getState().resetToDefaults()
  })

  /** Leva o mundo ate o fallback local disparar, e devolve a sala predita. */
  function predizerLocalmente(world: WorldState) {
    const gameState = useGameStateStore.getState()
    world.salaSobAutoridade = true
    world.sala!.abates = ABATES_POR_SALA
    world.sala!.chave = 'sala-de-teste-sem-protetor' // ver nota em "espera pela autoridade tem teto"
    world.enemies = []
    world.respawnTimer = 999
    // PH-271: o relogio de espera conta SILENCIO. Nenhuma resposta da
    // autoridade neste cenario, entao ele estoura e o palpite local vale.
    const ticks = Math.floor((ESPERA_MAXIMA_PELA_AUTORIDADE + SALA_TRANSITION_COUNTDOWN + 1) / 0.1)
    for (let i = 0; i < ticks; i++) tick(world, 0.1, gameState)
    return world.sala!
  }

  it('sala ANTERIOR do servidor e aceita quando a sala em vigor e palpite local', () => {
    const world = mundo(45)
    const primeira = { ...world.sala! }
    const predita = predizerLocalmente(world)
    expect(predita.indice).toBe(1)
    expect(world.salaPredita).toBe(true)

    // O servidor nunca saiu da sala 0 — e a sala dele que vale.
    const doServidor = { indice: 0, chave: primeira.chave, abates: ABATES_POR_SALA, ciclos: 0 }
    reconciliarSalaDaAutoridade(world, doServidor)
    expect(world.salaPendente).toEqual(doServidor)
    expect(world.salaCountdownRemaining).toBe(SALA_TRANSITION_COUNTDOWN)
    expect(world.salaPredita).toBe(false)

    aplicarTransicaoDeSala(world, world.mapDef!.id)
    expect(world.sala!.indice).toBe(0)
    expect(world.sala!.chave).toBe(primeira.chave)
  })

  it('sem predicao envolvida, sala anterior do servidor continua ignorada', () => {
    const world = mundo(45)
    world.salaSobAutoridade = true
    const outra = Object.keys(POOL_POR_SALA[HUNT]).find((c) => c !== world.sala!.chave)!
    reconciliarSalaDaAutoridade(world, { indice: 3, chave: outra, abates: 0, ciclos: 0 })
    aplicarTransicaoDeSala(world, world.mapDef!.id)
    expect(world.sala!.indice).toBe(3)
    expect(world.salaPredita).toBe(false)

    // Flush cobrindo uma janela que comecou antes da troca: o caso legitimo que
    // a protecao anti-regressao existe pra barrar.
    reconciliarSalaDaAutoridade(world, { indice: 1, chave: outra, abates: 5, ciclos: 0 })
    expect(world.salaPendente).toBeNull()
    expect(world.sala!.indice).toBe(3)
  })

  it('o fallback vale por UMA sala: nao arma a segunda sem confirmacao', () => {
    const world = mundo(45)
    const gameState = useGameStateStore.getState()
    predizerLocalmente(world)
    expect(world.sala!.indice).toBe(1)

    // Quota da sala predita fecha e a espera estoura de novo — e nada acontece,
    // porque a predicao anterior segue sem confirmacao do servidor.
    world.sala!.abates = ABATES_POR_SALA
    // A sala predita e sorteada de verdade (novaSala) — real, com protetor
    // habilitado de novo. Mesma nota das outras: fora do escopo deste teste.
    world.sala!.chave = 'sala-de-teste-sem-protetor'
    const ticks = Math.floor((ESPERA_MAXIMA_PELA_AUTORIDADE * 2 + SALA_TRANSITION_COUNTDOWN + 1) / 0.1)
    for (let i = 0; i < ticks; i++) tick(world, 0.1, gameState)
    expect(world.sala!.indice).toBe(1)
    expect(world.salaPendente).toBeNull()
  })

  it('servidor confirmando a MESMA sala destrava o fallback de novo', () => {
    const world = mundo(45)
    const gameState = useGameStateStore.getState()
    const predita = predizerLocalmente(world)
    // Mesma nota das outras: a sala predita e sorteada de verdade (com
    // protetor habilitado), fora do escopo deste teste (mecanismo de fallback).
    world.sala!.chave = 'sala-de-teste-sem-protetor'

    reconciliarSalaDaAutoridade(world, { ...predita, chave: 'sala-de-teste-sem-protetor', abates: ABATES_POR_SALA })
    expect(world.salaPredita).toBe(false)

    // PH-271: a confirmacao acima zerou o relogio de silencio. Daqui pra frente
    // o servidor nao responde mais, e sao os ticks abaixo que o fazem estourar
    // de novo — uma sala de adiantamento, como antes.

    const ticks = Math.floor((ESPERA_MAXIMA_PELA_AUTORIDADE + SALA_TRANSITION_COUNTDOWN + 1) / 0.1)
    for (let i = 0; i < ticks; i++) tick(world, 0.1, gameState)
    expect(world.sala!.indice).toBe(2)
    expect(world.salaPredita).toBe(true)
  })
})

// PH-258 — a sala nova que nasce MORTA, e o contador que mente na troca.
//
// Os dois casos abaixo vem do mesmo relato: "a hunt muda de bioma sem ter
// completado as 30 kills, e em alguns casos ficando tambem sem novos oponentes;
// ha casos em que nao se passa da sala 2".
describe('transicao de sala nao deixa lixo pra tras (PH-258)', () => {
  beforeEach(() => {
    useGameStateStore.getState().resetToDefaults()
  })

  it('protetor da sala anterior nao segue pendurado — e o campo volta a nascer', () => {
    // O CAMINHO REAL: a quota fecha, o protetor da sala nasce, o jogador NAO o
    // mata, e o flush do servidor traz a sala seguinte. `aplicarTransicaoDeSala`
    // zerava `world.enemies` mas deixava `protetorPendente` — e o respawn de mob
    // comum tem `&& !world.protetorPendente` na condicao. Sala nova, campo
    // vazio, respawn desligado por um protetor que nao existe mais: nada nasce,
    // ninguem morre, a quota nunca fecha. F5 era a unica saida.
    const world = mundo(77)
    const gameState = useGameStateStore.getState()
    world.sala!.abates = ABATES_POR_SALA

    // Um tick pra o protetor da sala nascer (sem resolver — e esse o caso).
    //
    // PH-475: A AUTORIDADE SO LIGA DEPOIS DISSO. Sob `salaSobAutoridade` o
    // cliente parou de sortear o proprio chefe (ele ADOTA o do flush), entao um
    // tick com a autoridade ja ligada nao faz nascer ninguem e o cenario deste
    // caso — "protetor em campo quando a sala troca" — nao se monta. O chefe
    // nasce pelo caminho local, que e o mesmo `criarEntidadeDoProtetor`, e a
    // autoridade entra em vigor em seguida.
    stepWorld(world, 0.1, gameState, { silent: true })
    expect(world.protetorPendente, 'o cenario exige protetor pendente').not.toBeNull()
    world.salaSobAutoridade = true

    // O servidor manda a sala seguinte.
    const proxima = { indice: 1, chave: world.sala!.chave, abates: 0, ciclos: 0 }
    reconciliarSalaDaAutoridade(world, proxima)
    for (let i = 0; i < Math.ceil(SALA_TRANSITION_COUNTDOWN / 0.1) + 2; i++) {
      stepWorld(world, 0.1, gameState, { silent: true })
    }

    expect(world.sala!.indice, 'a sala trocou').toBe(1)
    expect(world.protetorPendente, 'protetor fantasma da sala anterior').toBeNull()

    // E o campo volta a ter inimigo: sem isto a sala e um mapa vazio pra sempre.
    for (let i = 0; i < Math.ceil(world.mapDef!.respawnDelay / 0.1) + 20; i++) {
      stepWorld(world, 0.1, gameState, { silent: true })
    }
    expect(world.enemies.filter((e) => e.poke.hp > 0).length).toBeGreaterThan(0)
  })

  it('a barra fecha antes do aviso quando o servidor troca a sala', () => {
    // Cliente e servidor contam abates em sequencias de sorteio diferentes —
    // medido em scripts/harness/divergencia-de-quota.mjs: mediana de 32,6s de
    // diferenca pra fechar a quota, 112s no pior caso. Quem decide a troca e o
    // servidor, entao quando ele manda sala nova a quota FECHOU; deixar a barra
    // em 12/30 com "Entrando em nova area" na tela le como bug.
    const world = mundo(78)
    world.salaSobAutoridade = true
    world.sala!.abates = 12

    reconciliarSalaDaAutoridade(world, { indice: 1, chave: world.sala!.chave, abates: 0, ciclos: 0 })

    expect(world.sala!.abates).toBe(ABATES_POR_SALA)
    expect(world.salaPendente?.indice).toBe(1)
    expect(world.salaCountdownRemaining).toBe(SALA_TRANSITION_COUNTDOWN)
  })

  it('sala IGUAL (so o contador andou) nao mexe na barra', () => {
    // O contrato negativo: encher a barra so vale quando a sala TROCA. No caso
    // comum — um flush a cada 30s, mesma sala — o contador do servidor manda,
    // e forcar 30 aqui anunciaria quota fechada a hunt inteira.
    const world = mundo(79)
    world.salaSobAutoridade = true
    world.sala!.abates = 12

    reconciliarSalaDaAutoridade(world, { ...world.sala!, abates: 14 })

    expect(world.sala!.abates).toBe(14)
    expect(world.salaPendente).toBeNull()
  })
})

// PH-271 — o palpite local so vale contra servidor MUDO.
//
// O sintoma no jogo era o sub-bioma trocando sozinho com o numero da sala
// parado ("Sala 3/10 Planicie" -> "Sala 3/10 Vilarejo"): o cliente chutava a
// sala seguinte e a autoridade corrigia depois, na frente do jogador.
//
// Duas tentativas falharam antes destes casos, e as duas por confiar em algo
// que nao prova nada sobre o servidor:
//
//  1. aumentar a espera (20s -> 120s), cobrindo o p90 de 107s da divergencia
//     medida em scripts/harness/divergencia-de-quota.mjs. Voltando ao jogo-dev,
//     a troca fantasma apareceu igual — relogio maior so adia.
//  2. exigir "3 respostas seguidas com a quota do servidor cheia", na teoria um
//     servidor que nunca avanca. Ao vivo isso e a cara do servidor NORMAL: com
//     a quota fechada o cliente pedia flush a cada 5s, entao 3 respostas eram 15
//     segundos, e o servidor legitimamente fica minutos na mesma sala matando
//     o protetor dela (medido em 29/08: guardiao `lickitung` da sala 2, ~3
//     minutos, com `kills: 0` em quase toda janela de 5s).
//
// O que sobrou e o unico sinal que nao depende do conteudo da resposta: nao ter
// resposta nenhuma. Servidor que responde e o dono da sala, e o cliente espera.
describe('palpite de sala so contra servidor mudo (PH-271)', () => {
  beforeEach(() => {
    useGameStateStore.getState().resetToDefaults()
  })

  /** Mundo sob autoridade com a quota LOCAL fechada, antes de qualquer espera. */
  function comQuotaFechada(semente: number) {
    const world = mundo(semente)
    const gameState = useGameStateStore.getState()
    world.salaSobAutoridade = true
    world.sala!.abates = ABATES_POR_SALA
    // Chave sem protetor: estes casos sao sobre o palpite, nao sobre o gate de
    // protetor (mesmo cuidado do bloco de espera logo acima).
    world.sala!.chave = 'sala-de-teste-sem-protetor'
    world.enemies = []
    world.respawnTimer = 999
    return { world, gameState }
  }

  /**
   * Roda o mundo por `segundos`, com o servidor respondendo a cada 30 (a
   * cadencia real do flush) e mandando `abatesDoServidor` na resposta.
   *
   * Os ticks tem que rodar ENTRE as respostas, e nao todos antes: se a espera
   * vence sem nenhuma resposta ter chegado, o cenario deixa de ser "servidor
   * atrasado" e vira "servidor mudo" — que e o outro caso, e ai o palpite e
   * legitimo. Foi assim que a primeira versao deste teste passou sem provar
   * nada.
   */
  function rodarComServidorRespondendo(
    world: WorldState,
    gameState: ReturnType<typeof useGameStateStore.getState>,
    segundos: number,
    abatesDoServidor: (passo: number) => number,
    // Sala fixa a mandar em vez da atual — pros casos em que a resposta vai ser
    // descartada por `reconciliarSalaDaAutoridade` e ainda assim precisa contar
    // como "o servidor esta vivo".
    salaFixa?: SalaAtiva,
  ) {
    for (let s = 0; s < segundos; s++) {
      if (s % 30 === 0) {
        reconciliarSalaDaAutoridade(world, salaFixa ?? { ...world.sala!, abates: abatesDoServidor(s / 30) })
      }
      for (let t = 0; t < 10; t++) tick(world, 0.1, gameState)
    }
  }

  it('servidor ATRASADO (quota dele ainda subindo): o cliente espera, nao chuta', () => {
    const { world, gameState } = comQuotaFechada(61)
    // O dobro da espera de tempo, com o servidor respondendo a cada 30s e a
    // quota DELE ainda subindo: e o caso normal medido na bancada (mediana de
    // 32,6s de atraso, p90 de 107s).
    rodarComServidorRespondendo(world, gameState, ESPERA_MAXIMA_PELA_AUTORIDADE * 2, (i) => 10 + i)

    expect(world.salaPredita, 'o cliente chutou contra um servidor que esta so atrasado').toBe(false)
    expect(world.salaPendente).toBeNull()
    expect(world.sala!.indice).toBe(0)
  })

  it('servidor PARADO NA MESMA SALA com a quota cheia (matando o protetor): o cliente espera', () => {
    const { world, gameState } = comQuotaFechada(62)
    // O caso medido ao vivo em 29/08, e o que a segunda tentativa de correcao
    // confundia com "servidor de versao antiga": a quota do servidor esta cheia
    // e ele continua na mesma sala, flush apos flush, porque o protetor da sala
    // dele ainda nao morreu. Isso durou ~3 minutos numa sessao real — o dobro
    // da espera de tempo aqui e conservador perto disso.
    rodarComServidorRespondendo(world, gameState, ESPERA_MAXIMA_PELA_AUTORIDADE * 2, () => ABATES_POR_SALA)

    expect(world.salaPredita, 'o cliente chutou por cima de um servidor vivo').toBe(false)
    expect(world.salaPendente).toBeNull()
    expect(world.sala!.indice).toBe(0)
  })

  it('servidor MUDO (nenhuma resposta): o cliente chuta — senao a hunt trava na queda de rede', () => {
    const { world, gameState } = comQuotaFechada(65)
    // Nenhuma resposta da autoridade aqui, de proposito. E o unico caso que
    // ainda libera o palpite, e sem ele a hunt travaria com a barra cheia toda
    // vez que a rede caisse — pior que o bug que a PH-271 veio consertar.
    //
    // A asserção olha a SALA, e nao `salaPredita` nem `salaCountdownRemaining`:
    // os dois sao instantaneos e ja mudaram quando o teste mede. O que fica e o
    // avanco, e e ele que o jogador ve.
    for (let i = 0; i < Math.ceil((ESPERA_MAXIMA_PELA_AUTORIDADE + SALA_TRANSITION_COUNTDOWN + 1) / 0.1); i++) {
      tick(world, 0.1, gameState)
    }

    expect(world.sala!.indice, 'a hunt travaria pra sempre numa queda de rede').toBe(1)
  })

  it('resposta ANTIGA (sala anterior, que sera descartada) tambem conta como servidor vivo', () => {
    const { world, gameState } = comQuotaFechada(64)
    // Resposta que `reconciliarSalaDaAutoridade` descarta logo em seguida por
    // ser de posicao anterior. Ela nao muda nada no estado da sala — mas prova
    // que o servidor esta vivo, e e so isso que o relogio de silencio pergunta.
    // Contar so as respostas "uteis" deixava um cliente ja divergente com cara
    // de servidor mudo, e ai ele chutava de novo em cima da propria divergencia.
    world.sala!.ciclos = 2
    rodarComServidorRespondendo(
      world, gameState, ESPERA_MAXIMA_PELA_AUTORIDADE * 2,
      () => ABATES_POR_SALA, { ...world.sala!, ciclos: 1, abates: ABATES_POR_SALA },
    )

    // A asserção e no RELOGIO, e nao no palpite: neste cenario o palpite nao
    // chega a disparar nem com a correcao desligada (a resposta descartada
    // deixa o mundo em estados que nao alimentam o relogio a cada tick), entao
    // olhar `salaPredita` seria um teste que passa sem provar nada. O que a
    // correcao muda de verdade e o relogio nunca passar de uma janela de flush.
    expect(
      world.salaEsperaDaAutoridade,
      'resposta descartada nao zerou o silencio — o cliente acha que o servidor sumiu',
    ).toBeLessThan(45) // menos de uma janela e meia de flush; sem a correcao passa de 120
    expect(world.salaPredita).toBe(false)
    expect(world.sala!.indice).toBe(0)
  })
})
