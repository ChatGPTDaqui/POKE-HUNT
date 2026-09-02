// A IA renova o buff antes de ele vencer, e nao gasta acao quando ele esta cheio
// (PH-419).
//
// O QUE ESTA EM JOGO
// -----------------------------------------------------------------------------
// A PH-418 deu prazo de 18s ao estagio de atributo. A guarda da IA para golpe de
// buff sempre foi "o estagio esta abaixo do meu alvo?" (`ESTAGIO_ALVO_DA_IA`,
// hoje 2), e com prazo essa guarda passou a ter efeito contrario ao esperado: um
// POKE que ALCANCOU o alvo nunca reaplica, entao o buff cai aos 18s com o golpe
// pronto na mao e ele recomeca do zero. O prazo deixaria de ser DURACAO e viraria
// TETO DE USO.
//
// A regra da issue tem dois lados, e os dois precisam de teste porque eles se
// contradizem se um for implementado sem o outro: reaplicar quando o prazo da
// PROPRIA fonte estiver acabando (senao o buff pisca), e NAO reaplicar enquanto
// ele estiver cheio (senao a IA queima turno e a vazao cai).
//
// POR QUE O TESTE PASSA PELO `updateCombat`, E NAO CHAMA A DECISAO DIRETO
// -----------------------------------------------------------------------------
// A funcao que decide (`golpeDeApoioUtil`) nao e exportada, e exporta-la so pra
// teste esconderia o que mais importa aqui: a escolha final passa por
// `pickAbilityDaFila`, que tem um OVERKILL-GUARD — golpe de status nao executa
// se um golpe de dano pronto ja mata o alvo. Testar a decisao isolada daria
// verde num cenario que o jogo nunca executa.
//
// Dai o inimigo com HP alto: e o que tira o overkill-guard do caminho e deixa a
// pergunta do teste ser a do teste. Medido na bancada `prazo-do-estagio.mjs`,
// esse guard e o que limita o uptime de buff no jogo real — nao o prazo.
import { describe, expect, it } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { buildMapWorld } from '../simulation'
import { criarInimigoDeTeste } from '../testes/inimigoDeTeste'
import { updateCombat } from './combatSystem'
import { registrarFonteDeEstagio, temFontePropriaViva } from './statusSystem'
import { DURACAO_DE_ESTAGIO_SEGUNDOS, FOLGA_DE_RENOVACAO_SEGUNDOS } from '@/data/statusEffects'

const PASSO = 1 / 60

/**
 * Spearow com Agility no set: `agility` vale +2 em Velocidade e fecha
 * `ESTAGIO_ALVO_DA_IA` em UM uso, que e a condicao necessaria pra o caso desta
 * issue existir. Um buff de +1 (Defense Curl) deixa o POKE ABAIXO do alvo depois
 * de aplicado, entao a guarda antiga ja o reaplicava e nao ha o que testar.
 */
function cenario() {
  const rng = createRng(31)
  const counters = { entity: 1, effect: 1, pendingHit: 1 }
  const jogadorPoke = createPokeInstance(rng, 'spearow', 25)
  jogadorPoke.activeAbilities = ['agility']

  const world = buildMapWorld('campo_aberto_faixa1', jogadorPoke, { seed: 0, rng, counters })
  const player = world.player!

  // HP alto de proposito: tira o overkill-guard do caminho (ver o topo). Sem
  // isto o golpe de status nunca executa e os tres testes dariam o mesmo
  // resultado, seja qual for a regra de renovacao.
  const enemy = criarInimigoDeTeste(world, 'rattata', 25, { x: player.x, y: player.y })
  enemy.poke.stats = { ...enemy.poke.stats, hp: 99999 }
  enemy.poke.hp = 99999
  enemy.targetId = player.id
  world.enemies = [enemy]
  player.state = 'engaged'
  player.targetId = enemy.id

  return { world, player, enemy }
}

/**
 * Cenario do Belly Drum, com OUTRA especie, e a troca tem motivo medido.
 *
 * `sanearEscolhaDeGolpes` recusa golpe que a especie nao aprendeu, e Spearow nao
 * aprende Belly Drum — forcar `activeAbilities = ['belly_drum']` nele deixava o
 * POKE so com o Ataque Basico, o golpe nunca disparava, e o teste "o HP nao cai"
 * dava verde por nao ter acontecido nada. Foi o controle positivo que pegou.
 * Makuhita aprende Belly Drum no Lv25.
 */
function cenarioBellyDrum() {
  const rng = createRng(31)
  const counters = { entity: 1, effect: 1, pendingHit: 1 }
  const jogadorPoke = createPokeInstance(rng, 'makuhita', 25)
  jogadorPoke.activeAbilities = ['belly_drum']

  const world = buildMapWorld('campo_aberto_faixa1', jogadorPoke, { seed: 0, rng, counters })
  const player = world.player!

  const enemy = criarInimigoDeTeste(world, 'rattata', 25, { x: player.x, y: player.y })
  enemy.poke.stats = { ...enemy.poke.stats, hp: 99999 }
  enemy.poke.hp = 99999
  enemy.targetId = player.id
  world.enemies = [enemy]
  player.state = 'engaged'
  player.targetId = enemy.id

  return { world, player, enemy }
}

/** Roda combate por `segundos` de tempo simulado. */
function correr(world: ReturnType<typeof cenario>['world'], segundos: number) {
  for (let t = 0; t < Math.round(segundos / PASSO); t++) {
    updateCombat(world, PASSO, { silent: true })
  }
}

describe('renovacao preventiva de buff (PH-419)', () => {
  it('a IA aplica o buff e chega ao alvo dela', () => {
    const { world, player } = cenario()
    correr(world, 12)
    expect(player.estagios.speed, 'Agility vale +2 e o alvo da IA e 2').toBe(2)
  })

  it('NAO gasta acao com o buff de prazo cheio', () => {
    // Criterio 2 da issue: sem isto a IA reaplicaria todo turno e a vazao cairia
    // por turno queimado. O sinal e a LISTA de fontes: renovar mantem uma, e o
    // que o teste recusa e o desperdicio, nao o empilhamento (a fonte e a mesma,
    // entao empilhar nao acontece nem por acidente).
    const { world, player } = cenario()
    // 4s, e nao 12s: a IA aplica o buff no PRIMEIRO turno em que ele esta pronto,
    // entao aos 12s o prazo ja desceu quase ate a folga sozinho e a medicao nao
    // distinguiria "nao renovou" de "renovou e desceu de novo".
    correr(world, 4)
    const prazoCheio = player.estagiosFonte!.speed!.find((f) => f.id === 'agility')!.expiraEm!
    expect(prazoCheio, 'buff recem-aplicado, prazo longe da folga')
      .toBeGreaterThan(FOLGA_DE_RENOVACAO_SEGUNDOS)

    // Mais um turno inteiro com o prazo ainda longe da folga: ele tem que ter
    // ANDADO, e nao voltado pro topo.
    correr(world, 3)
    const depois = player.estagiosFonte!.speed!.find((f) => f.id === 'agility')!.expiraEm!
    expect(depois, 'prazo cheio nao se renova — seria turno jogado fora').toBeLessThan(prazoCheio)
    expect(depois, 'e ainda nao chegou na folga, senao o teste virou o outro')
      .toBeGreaterThan(FOLGA_DE_RENOVACAO_SEGUNDOS)
  })

  it('renova quando o prazo da PROPRIA fonte esta acabando', () => {
    // ESTE E O TESTE QUE REPROVA SEM A CORRECAO (criterio 4). Com a guarda
    // antiga ("estagio abaixo do alvo"), um POKE em +2 nunca reaplica: o prazo
    // desce ate zero, a fonte sai da lista e a Velocidade cai de +2 pra 0 de uma
    // vez. Com a renovacao, a fonte segue viva e o estagio nunca chega a cair.
    const { world, player } = cenario()
    correr(world, 12)
    expect(player.estagios.speed).toBe(2)

    // Empurra a fonte pra beira do vencimento sem esperar os 18s reais: reescreve
    // o prazo pela MESMA funcao que o motor usa, entao o estado montado e um
    // estado que o jogo produz.
    const fonte = player.estagiosFonte!.speed!.find((f) => f.id === 'agility')!
    registrarFonteDeEstagio(player, 'speed', { ...fonte, expiraEm: FOLGA_DE_RENOVACAO_SEGUNDOS - 0.5 })

    // Um turno e meio: tempo de a IA decidir e o golpe pousar.
    correr(world, 4.5)

    const renovada = player.estagiosFonte?.speed?.find((f) => f.id === 'agility')
    expect(renovada, 'a fonte venceu em vez de ser renovada').toBeDefined()
    expect(renovada!.expiraEm!, 'o prazo tem que ter voltado a encher')
      .toBeGreaterThan(FOLGA_DE_RENOVACAO_SEGUNDOS)
    expect(player.estagios.speed, 'o buff nao pode ter piscado').toBe(2)
  })

  // BELLY DRUM: CONTROLE POSITIVO PRIMEIRO, e nao por capricho.
  //
  // A primeira versao deste teste tinha SO a assercao de que o HP nao cai com
  // buff proprio de pe — e ela passava tambem com a guarda ANTIGA, porque naquele
  // cenario o Belly Drum nao executava de jeito nenhum. Um teste que da verde nas
  // duas versoes do codigo nao esta testando a mudanca; ele so afirma que nada
  // aconteceu, o que e verdade por acidente.
  //
  // Entao o par: o controle prova que o golpe DISPARA no cenario, e so depois o
  // outro prova que a condicao nova o segura.
  it('controle: Belly Drum DISPARA quando nao ha buff proprio de Ataque', () => {
    const { world, player } = cenarioBellyDrum()
    expect(temFontePropriaViva(player, 'atkFis')).toBe(false)

    const hpAntes = player.poke.hp
    correr(world, 9)

    expect(player.poke.hp, 'sem esta perda de HP o outro teste nao prova nada')
      .toBeLessThan(hpAntes)
    expect(player.estagios.atkFis, 'Belly Drum vai direto ao teto').toBeGreaterThan(0)
  })

  it('Belly Drum nao entra quando ja existe buff PROPRIO de Ataque de pe', () => {
    // Criterio 3: ele custa 50% do HP maximo e vai direto ao teto, entao ele fica
    // fora da renovacao preventiva E recusa empilhar custo de HP sobre um buff
    // que ja existe.
    const { world, player } = cenarioBellyDrum()
    registrarFonteDeEstagio(player, 'atkFis', {
      id: 'swords_dance', tipo: 'golpe', proprio: true, deQuem: 'Spearow',
      estagios: 2, expiraEm: DURACAO_DE_ESTAGIO_SEGUNDOS,
    })
    expect(temFontePropriaViva(player, 'atkFis')).toBe(true)

    const hpAntes = player.poke.hp
    correr(world, 9)

    expect(player.poke.hp, 'Belly Drum cobraria 50% do HP maximo').toBe(hpAntes)
  })
})
