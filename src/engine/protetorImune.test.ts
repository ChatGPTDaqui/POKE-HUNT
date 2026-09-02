// PH-301: a sala nao pode travar para sempre porque o protetor e IMUNE ao
// tipo do POKE.
//
// O TRAVAMENTO, medido em bancada antes da correcao (hunt `campo_aberto_e1`,
// semente 4242, janelas de 30s do servidor): sala 4 em 30/30, protetor `ponyta`
// com Flash Fire, POKE `charmander` Lv102 com os 4 golpes de FOGO que
// `activeAbilitiesPadrao` da a ele. O POKE atravessa o mapa, engaja a 38px e
// lanca golpe atras de golpe — e o `hp_atual` do protetor fica em 46, janela
// apos janela, indefinidamente. Nao ha erro, nao ha aviso, nao ha saida: a sala
// so avanca quando o protetor morre, e ele e o unico inimigo em campo.
//
// Sao TRES defesas, e cada uma cobre o que a anterior nao alcanca:
//
//  1. a escolha de golpe pula golpe anulado por imunidade — resolve quando o
//     POKE tem alternativa no proprio moveset;
//  2. o sorteio do protetor repete ate cair um que o POKE em campo consiga
//     danificar — resolve o monotipo, que nao tem alternativa nenhuma;
//  3. o cao de guarda troca o protetor que fica tempo demais engajado sem
//     perder HP — resolve o que escapa das duas primeiras (troca de POKE depois
//     do sorteio, estagio de defesa, pool todo imune).
import { describe, expect, it, beforeEach } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { getAbility } from '@/data/abilities'
import {
  buildMapWorld, stepWorld, PROTETOR_SEM_DANO_LIMITE, LIVE_SIM_STEP_SECONDS,
} from './simulation'
import { podeDanificar, golpeAnuladoPorImunidade } from './systems/combatSystem'
import { bloqueiaAcaoSempre } from '@/data/statusEffects'
import { ABATES_POR_SALA } from '@/data/biomas'
import { useGameStateStore } from '@/stores/gameStateStore'
import type { WorldState } from './types'

const HUNT = 'campo_aberto_e1'
// 'meadow' (Campina) e sub-bioma de `campo_aberto`, o primeiro de ORDEM_DOS_BIOMAS — pede Guardian
// nas salas 1-9. Mesmo padrao de `protetor.test.ts`: a chave nao precisa ser
// alcancavel pelo sorteio desta hunt pra exercitar a logica.
const SALA_COM_PROTETOR = { indice: 0, chave: 'meadow', abates: ABATES_POR_SALA, ciclos: 0 }

/** Charmander de nivel alto: monotipo de FOGO, o caso que travava. */
function charmander(semente: number, golpes?: string[]) {
  const poke = createPokeInstance(createRng(semente), 'charmander', 102)
  if (golpes) poke.activeAbilities = golpes
  return poke
}

function mundoComProtetor(semente: number, golpes?: string[]): WorldState {
  return buildMapWorld(
    HUNT, charmander(semente, golpes),
    { seed: semente, rng: createRng(semente), counters: { entity: 1, effect: 1, pendingHit: 1 } },
    { sala: { ...SALA_COM_PROTETOR } },
  )
}

function avancar(world: WorldState, segundos: number) {
  for (let t = 0; t < Math.round(segundos / LIVE_SIM_STEP_SECONDS); t++) {
    stepWorld(world, LIVE_SIM_STEP_SECONDS, useGameStateStore.getState(), { silent: true })
  }
}

describe('PH-301: imunidade nao pode travar a sala', () => {
  beforeEach(() => {
    useGameStateStore.getState().resetToDefaults()
  })

  it('golpeAnuladoPorImunidade separa imunidade de "pouco dano"', () => {
    const world = mundoComProtetor(11)
    const alvo = world.enemies[0]
    // Flash Fire e imunidade a FOGO; o mesmo alvo continua levando NORMAL.
    alvo.poke = createPokeInstance(createRng(11), 'ponyta', 16, { trait: 'flash_fire' })
    const fogo = getAbility('flamethrower')!
    const normal = getAbility('slash')!
    expect(golpeAnuladoPorImunidade(world.rng, world.player!, alvo, fogo)).toBe(true)
    expect(golpeAnuladoPorImunidade(world.rng, world.player!, alvo, normal)).toBe(false)
  })

  // Defesa 1. Sem ela a fila gasta 3 de cada 4 turnos num golpe que causa zero
  // por definicao — o alvo ate morre, mas leva 4x o tempo.
  it('com alternativa no moveset, o POKE nao gasta turno em golpe anulado', () => {
    const world = mundoComProtetor(21, ['flamethrower', 'flame_burst', 'fire_fang', 'slash'])
    const protetor = world.enemies.find((e) => e.isProtetor)!
    protetor.poke = createPokeInstance(createRng(21), 'ponyta', 16, { trait: 'flash_fire' })
    protetor.poke.hp = protetor.poke.stats.hp
    world.protetorPendente!.hpAtual = protetor.poke.hp
    world.protetorPendente!.uid = protetor.poke.uid
    // Encostados: o teste e sobre escolha de golpe, nao sobre caminhada.
    protetor.x = world.player!.x + 30
    protetor.y = world.player!.y

    const hpInicial = protetor.poke.hp
    avancar(world, 4)
    expect(protetor.poke.hp).toBeLessThan(hpInicial)
  })

  // Defesa 2. O monotipo nao tem alternativa nenhuma — quem resolve e o sorteio.
  it('o protetor sorteado e sempre danificavel pelo POKE em campo', () => {
    const imunes: string[] = []
    for (let semente = 1; semente <= 120; semente++) {
      const world = mundoComProtetor(semente)
      const protetor = world.enemies.find((e) => e.isProtetor)
      expect(protetor).toBeDefined()
      if (!podeDanificar(world.rng, world.player!, protetor!)) imunes.push(protetor!.poke.speciesId)
    }
    expect(imunes).toEqual([])
  })

  // Defesa 3. O sorteio nao cobre o que muda DEPOIS dele: aqui a imunidade e
  // enfiada a forca por cima de um protetor ja sorteado, que e o que acontece
  // quando o jogador troca de POKE no meio da luta.
  it('protetor que nao perde HP engajado e trocado por outro', () => {
    const world = mundoComProtetor(31)
    const protetor = world.enemies.find((e) => e.isProtetor)!
    const uidOriginal = protetor.poke.uid
    protetor.poke = createPokeInstance(createRng(31), 'ponyta', 16, { trait: 'flash_fire', uid: uidOriginal })
    protetor.poke.hp = protetor.poke.stats.hp
    world.protetorPendente!.uid = uidOriginal
    world.protetorPendente!.hpAtual = protetor.poke.hp
    protetor.x = world.player!.x + 30
    protetor.y = world.player!.y

    // Ainda dentro do limite: o impasse precisa estar de pe neste ponto, senao
    // o teste passaria por outro motivo que nao o cao de guarda.
    avancar(world, PROTETOR_SEM_DANO_LIMITE - 2)
    expect(world.enemies.some((e) => e.poke.uid === uidOriginal)).toBe(true)
    expect(world.protetorSemDanoSegundos).toBeGreaterThan(0)

    avancar(world, 3)

    // Este protetor era imune ao arsenal INTEIRO do POKE: ele nao tinha como
    // morrer. Sumir do campo so pode ter vindo do cao de guarda.
    expect(world.enemies.some((e) => e.poke.uid === uidOriginal)).toBe(false)
    expect(world.protetorPendente?.uid ?? null).not.toBe(uidOriginal)
    // O gate continua de pe: trocar o protetor NAO resolve a sala sozinho, e o
    // avanco (com o credito de bioma_progress) segue dependendo de matar um.
    expect(world.sala?.abates).toBe(ABATES_POR_SALA)
  })

  // PH-305: o cao de guarda mede "bato e nao tiro HP", e nao "nao estou
  // batendo". Sem esta distincao, um POKE CONGELADO fazia o guardiao ir embora
  // no meio de uma luta que estava indo bem — e o HP que ele ja tinha perdido
  // ia junto, porque o substituto nasce inteiro. Congelamento nao tem duracao
  // fixa (sorteio de 20% por turno), entao a cauda passa dos 12s com folga.
  it('bloqueiaAcaoSempre separa "nao pode agir" de "as vezes perde o turno"', () => {
    // Sono e congelamento bloqueiam sempre; paralisia perde o turno por
    // sorteio, entao o POKE segue atacando e o impasse continua medindo o que
    // deve. E a leitura e PURA — nao pode consumir a sequencia de sorteio.
    expect(bloqueiaAcaoSempre({ tipo: 'freeze', turnosRestantes: 3 })).toBe(true)
    expect(bloqueiaAcaoSempre({ tipo: 'sleep', turnosRestantes: 3 })).toBe(true)
    expect(bloqueiaAcaoSempre({ tipo: 'paralysis', turnosRestantes: null })).toBe(false)
    expect(bloqueiaAcaoSempre({ tipo: 'poison', turnosRestantes: 3 })).toBe(false)
    expect(bloqueiaAcaoSempre(null)).toBe(false)
  })

  it('POKE impedido de agir nao faz o relogio do impasse andar', () => {
    const world = mundoComProtetor(31)
    const protetor = world.enemies.find((e) => e.isProtetor)!
    const uidOriginal = protetor.poke.uid
    protetor.poke.hp = protetor.poke.stats.hp
    world.protetorPendente!.hpAtual = protetor.poke.hp
    protetor.x = world.player!.x + 30
    protetor.y = world.player!.y

    // O congelamento e REPOSTO a cada tick de proposito: ele acaba por sorteio
    // (20% por turno) e derrete na hora com qualquer golpe de FOGO que acerte,
    // entao deixar o relogio decidir tornaria o teste um jogo de dados. O que
    // se quer provar e "enquanto o POKE nao pode agir, o relogio nao anda", e
    // e isso que este laco monta.
    for (let t = 0; t < Math.round((PROTETOR_SEM_DANO_LIMITE * 2) / LIVE_SIM_STEP_SECONDS); t++) {
      world.player!.poke.status = { tipo: 'freeze', turnosRestantes: 99 }
      stepWorld(world, LIVE_SIM_STEP_SECONDS, useGameStateStore.getState(), { silent: true })
    }

    // Dobro do limite passou sem o POKE poder atacar: nada de trocar o
    // guardiao e jogar fora o HP que ele ja tinha perdido.
    //
    // `toBeLessThan(1)` e nao `toBe(0)`: no tick em que o congelamento sai
    // (`tickStatus` roda antes do cao de guarda, dentro do mesmo passo) o POKE
    // JA podia agir, e contar aquele frame esta certo. Sao centesimos de
    // segundo; o que nao pode e chegar perto dos 12.
    expect(world.protetorSemDanoSegundos).toBeLessThan(1)
    expect(world.enemies.some((e) => e.poke.uid === uidOriginal)).toBe(true)
  })

  // O caso completo, do jeito que o jogador vive: monotipo de FOGO numa sala
  // com a quota fechada. Antes da correcao o HP do protetor nao se mexia.
  it('monotipo de FOGO resolve a sala em vez de bater de graca pra sempre', () => {
    const world = mundoComProtetor(41)
    expect(world.protetorPendente).not.toBeNull()
    avancar(world, 60)
    // Ou o protetor morreu (sala liberada), ou foi trocado — o que nao pode e
    // o mesmo protetor continuar em campo com o HP intacto.
    const aindaOMesmo = world.enemies.some(
      (e) => e.isProtetor && e.poke.uid === world.protetorPendente?.uid && e.poke.hp === e.poke.stats.hp,
    )
    expect(aindaOMesmo).toBe(false)
  })
})
