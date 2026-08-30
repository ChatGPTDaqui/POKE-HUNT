// PH-291 — o avanco manual de sala NAO pula o protetor vivo.
//
// O BURACO QUE ISTO FECHA
//
// O bloqueio do protetor existia em dois caminhos e so neles:
//
//   registrarAbate                    recusa armar transicao em sala com protetor
//   garantirTransicaoDeQuotaFechada   sai cedo quando `garantirProtetorDaSala()` da true
//
// `solicitarAvancoDeSala` — o caminho do botao "Proximo Nivel" e da rota
// `/sessao/avancar-sala` — passava por FORA dos dois. Com o toggle de avanco
// manual ligado, o jogador fechava a quota, o protetor nascia, e um clique
// avancava a sala com ele vivo.
//
// Isso anulava duas features de uma vez:
//
//  - PH-202/203: o protetor existe pra travar o avanco, e virava decoracao;
//  - PH-206/226/227: quem credita `bioma_progress` e vencer o LORD da sala 10
//    (`avancarBiomaProgressSeForOProximo`, dentro de `handleEnemyDefeated`).
//    Pulando o Lord, o ciclo fecha, `ciclos` incrementa e o progresso NUNCA e
//    creditado — o jogador farma pra sempre sem destravar o bioma seguinte.
//
// O caso do LORD abaixo e o que prova o segundo ponto: ele e a unica porta de
// entrada do progresso de bioma.
import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { buildMapWorld } from './simulation'
import { solicitarAvancoDeSala, salaTravadaPeloProtetor } from './systems/salaSystem'
import { ABATES_POR_SALA, SALAS_POR_HUNT } from '@/data/biomas'
import { especialidadeNiveisDefault } from '@/data/especialidades'
import type { WorldState } from './types'

const HUNT = 'mata_faixa1'

/**
 * Mundo numa sala com a quota JA FECHADA — o unico estado em que o avanco
 * manual e oferecido.
 */
function mundoComQuotaFechada(indice: number, chave: string): WorldState {
  const rng = createRng(4242)
  const poke = createPokeInstance(rng, 'charmander', 30)
  const world = buildMapWorld(
    HUNT, poke,
    { rng, seed: 7, counters: { entity: 1, effect: 1, pendingHit: 1 } },
    {
      sequenceIndex: 0,
      sequenceCleared: false,
      sala: { indice, chave, abates: ABATES_POR_SALA, ciclos: 0 },
      protetorPendente: null,
    },
    especialidadeNiveisDefault(),
  )
  return world
}

describe('a bancada monta o estado que o bug precisa', () => {
  it('a sala nasce com a quota fechada e pedindo protetor', () => {
    const world = mundoComQuotaFechada(SALAS_POR_HUNT - 1, 'forest')
    expect(world.sala?.abates).toBe(ABATES_POR_SALA)
    expect(
      salaTravadaPeloProtetor(world),
      'sem sala travada nao ha o que testar — o caso passaria por vacuidade',
    ).toBe(true)
  })
})

describe('solicitarAvancoDeSala respeita o protetor (PH-291)', () => {
  it('sala 10 (LORD) com protetor vivo: NAO avanca', () => {
    // O caso caro. O Lord da sala 10 e a unica porta de entrada de
    // `bioma_progress`; pular ele fecha o ciclo sem creditar nada, pra sempre.
    const world = mundoComQuotaFechada(SALAS_POR_HUNT - 1, 'forest')
    const antes = { ...world.sala! }

    const r = solicitarAvancoDeSala(world, HUNT)

    expect(r.avancou, 'avancou por cima do Lord vivo').toBe(false)
    expect(world.salaPendente, 'sorteou a proxima sala mesmo assim').toBeNull()
    expect(world.salaCountdownRemaining, 'armou a contagem de transicao').toBeNull()
    expect(world.sala).toEqual(antes)
  })

  it('salas 1-9 (GUARDIAN) com protetor vivo: NAO avanca', () => {
    const world = mundoComQuotaFechada(0, 'forest')
    const r = solicitarAvancoDeSala(world, HUNT)
    expect(r.avancou).toBe(false)
    expect(world.salaPendente).toBeNull()
  })

  it('protetor JA resolvido: avanca normalmente', () => {
    // O outro lado da guarda. Um corte cego (sempre recusar em sala com
    // protetor) quebraria o avanco manual justamente depois de o jogador ter
    // feito o trabalho — e ninguem ia ligar as duas coisas.
    const world = mundoComQuotaFechada(SALAS_POR_HUNT - 1, 'forest')
    world.protetorResolvido = true

    const r = solicitarAvancoDeSala(world, HUNT)

    expect(r.avancou, 'nao avancou com o protetor ja derrotado').toBe(true)
    expect(world.salaPendente).not.toBeNull()
  })

  it('quota ABERTA continua recusando, como sempre', () => {
    // Regressao do comportamento anterior a esta issue.
    const world = mundoComQuotaFechada(0, 'forest')
    world.sala = { ...world.sala!, abates: ABATES_POR_SALA - 1 }
    expect(solicitarAvancoDeSala(world, HUNT).avancou).toBe(false)
  })
})

describe('salaTravadaPeloProtetor (a pergunta que a tela tambem faz)', () => {
  it('sala sem protetor nunca trava', () => {
    // Hunt inicial, BOSS e Lance nao tem sala; sub-bioma fora dos 12 biomas da
    // ordem canonica nao pede protetor. Nos dois casos o avanco manual segue
    // valendo igual.
    const world = mundoComQuotaFechada(0, 'forest')
    world.sala = null
    expect(salaTravadaPeloProtetor(world)).toBe(false)
  })

  it('resolvido destrava', () => {
    const world = mundoComQuotaFechada(0, 'forest')
    expect(salaTravadaPeloProtetor(world)).toBe(true)
    world.protetorResolvido = true
    expect(salaTravadaPeloProtetor(world)).toBe(false)
  })
})
