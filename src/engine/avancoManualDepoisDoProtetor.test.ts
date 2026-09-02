// PH-292 — derrotar o protetor com o avanco manual LIGADO nao troca a sala
// sozinho.
//
// A FEATURE QUE TINHA PARADO DE EXISTIR
// -----------------------------------------------------------------------------
// PH-177/178/180: com o avanco manual ligado, a sala fica parada em 30/30 e so
// troca no clique de "Proximo Nivel". Serve pra quem quer continuar farmando
// aquele sub-bioma em vez de ser empurrado pro proximo.
//
// `resolverProtetorDaSala` chamava `armarTransicaoDeSala` DIRETO, sem olhar o
// toggle. Isso estava certo enquanto so o bioma piloto tinha protetor: nas
// salas normais quem decidia era `registrarAbate`, que ja o respeitava.
//
// Desde PH-202/225 TODA sala de bioma tem protetor — Guardian nas 1-9, Lord na
// 10. Entao a sequencia real virou:
//
//   1. a quota fecha em 30/30 e `registrarAbate` se recusa a avancar (por causa
//      do protetor, nao do toggle);
//   2. o protetor nasce e suspende o respawn de mob comum;
//   3. o protetor cai e a transicao arma SOZINHA, com ou sem o toggle.
//
// A sala nunca ficava parada esperando o clique. O toggle sobrou valendo so
// para sala sem protetor — que hoje e nenhuma das de bioma. Nada quebrava: a
// promessa da UI simplesmente parou de valer, em silencio, e so apareceu quando
// a PH-291 tirou o botao da tela nesse intervalo.
//
// O CUSTO QUE A ISSUE TEMIA, E QUE NAO EXISTE
// -----------------------------------------------------------------------------
// A PH-292 registrou que respeitar o toggle exigiria "liberar o respawn de mob
// comum depois do protetor resolvido para o farm continuar fazendo sentido".
// Lendo o gate de respawn, ele ja e assim: a condicao e `!world.protetorPendente`,
// e `resolverProtetorDaSala` zera esse campo na primeira linha. O caso
// `o farm continua` abaixo mede isso em vez de confiar na leitura.
import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { buildMapWorld } from './simulation'
import { resolverProtetorDaSala, salaTravadaPeloProtetor } from './systems/salaSystem'
import { ABATES_POR_SALA } from '@/data/biomas'
import { quantidadeDeSalas } from '@/data/estagios'
import { especialidadeNiveisDefault } from '@/data/especialidades'
import type { WorldState } from './types'

const HUNT = 'mata_e1'
const SALAS = quantidadeDeSalas(HUNT)

/** Mundo numa sala de bioma com a quota fechada — o estado em que o toggle vale. */
function mundoComQuotaFechada(indice: number, chave = 'forest'): WorldState {
  const rng = createRng(4242)
  const poke = createPokeInstance(rng, 'charmander', 30)
  return buildMapWorld(
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
}

describe('a bancada monta o estado que o caso precisa', () => {
  it('a sala nasce travada pelo protetor, com a quota fechada', () => {
    // Guarda anti-vacuo: sem sala travada os casos abaixo mediriam outra coisa.
    const world = mundoComQuotaFechada(2)
    expect(world.sala?.abates).toBe(ABATES_POR_SALA)
    expect(salaTravadaPeloProtetor(world)).toBe(true)
    expect(world.protetorPendente, 'o protetor precisa estar em campo').not.toBeNull()
  })
})

describe('o toggle de avanco manual vale depois do protetor (PH-292)', () => {
  it('SEM o toggle a transicao arma sozinha, como sempre', () => {
    // O comportamento de hoje, e ele nao muda: quem nao liga o toggle continua
    // sendo levado pra proxima sala assim que o protetor cai.
    const world = mundoComQuotaFechada(2)
    resolverProtetorDaSala(world, HUNT)
    expect(world.salaCountdownRemaining).not.toBeNull()
    expect(world.salaPendente).not.toBeNull()
  })

  it('COM o toggle a sala fica parada esperando o clique', () => {
    const world = mundoComQuotaFechada(2)
    resolverProtetorDaSala(world, HUNT, { manualAdvance: true })
    expect(world.salaCountdownRemaining, 'a contagem nao pode ter comecado').toBeNull()
    expect(world.salaPendente, 'nenhuma sala nova pode estar armada').toBeNull()
    // A sala continua a MESMA, com a quota cheia.
    expect(world.sala?.indice).toBe(2)
    expect(world.sala?.abates).toBe(ABATES_POR_SALA)
  })

  it('o protetor conta como resolvido nos dois casos', () => {
    // Isto e o que impede o respawn infinito de protetor (PH-230): sem a marca,
    // `garantirProtetorDaSala` sorteia outro no tick seguinte, pra sempre. Ela
    // NAO pode depender do toggle.
    const comToggle = mundoComQuotaFechada(2)
    resolverProtetorDaSala(comToggle, HUNT, { manualAdvance: true })
    expect(comToggle.protetorResolvido).toBe(true)
    expect(salaTravadaPeloProtetor(comToggle)).toBe(false)

    const semToggle = mundoComQuotaFechada(2)
    resolverProtetorDaSala(semToggle, HUNT)
    expect(semToggle.protetorResolvido).toBe(true)
  })

  it('o farm continua: o protetor sai de campo e o respawn de mob comum destrava', () => {
    // O custo que a issue temia. O gate de respawn e `!world.protetorPendente`,
    // e a primeira linha de `resolverProtetorDaSala` zera esse campo — entao o
    // jogador que fica na sala continua encontrando selvagens, que e a razao de
    // ele ter ligado o toggle.
    const world = mundoComQuotaFechada(2)
    expect(world.protetorPendente).not.toBeNull()
    resolverProtetorDaSala(world, HUNT, { manualAdvance: true })
    expect(world.protetorPendente).toBeNull()
  })

  it('sob autoridade remota o toggle nao muda nada — quem avanca e o servidor', () => {
    // O corte de `salaSobAutoridade` vem ANTES, e continua vindo: o cliente nao
    // arma transicao nenhuma ali, com ou sem toggle. Sem esta ordem o caso
    // remoto passaria a depender de um toggle que ele nao consulta.
    const world = mundoComQuotaFechada(2)
    world.salaSobAutoridade = true
    resolverProtetorDaSala(world, HUNT, { manualAdvance: false })
    expect(world.salaCountdownRemaining).toBeNull()
    expect(world.salaPendente).toBeNull()
    expect(world.protetorResolvido, 'a marca sobe mesmo sob autoridade (PH-230)').toBe(true)
  })

  it('vale tambem na sala do LORD', () => {
    // A sala 10 e a que credita `bioma_progress`, e o credito acontece ANTES
    // desta funcao (`avancarBiomaProgressSeForOProximo`, em
    // `handleEnemyDefeated`). Segurar a transicao aqui nao pode custar o
    // progresso — este caso guarda a fronteira entre as duas coisas.
    const world = mundoComQuotaFechada(SALAS - 1)
    resolverProtetorDaSala(world, HUNT, { manualAdvance: true })
    expect(world.salaCountdownRemaining).toBeNull()
    expect(world.sala?.indice).toBe(SALAS - 1)
    expect(world.sala?.ciclos, 'o ciclo so fecha quando a sala de fato virar').toBe(0)
  })
})
