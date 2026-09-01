// LURE: reunir selvagens ANTES de comecar a lutar.
//
// O QUE ISSO RESOLVE
// -----------------------------------------------------------------------------
// O combate deste motor sempre soube lutar contra varios inimigos ao mesmo
// tempo: `updateCombat` monta `engagedEnemies` (todos os selvagens engajados no
// jogador, nao um) e um golpe `target: 'aoe'` atinge TODOS os que estiverem
// dentro de `ability.radius`. O que nunca existiu foi um jeito de CHEGAR nesse
// estado — o movimento levava o POKE ao inimigo vivo mais proximo, ele matava
// aquele, e so entao andava pro proximo. O golpe de area existia e nunca pegava
// mais de um alvo.
//
// O lure fecha esse buraco: o jogador escolhe reunir 1 a 4 selvagens, o POKE
// passa pelo raio de aggro de cada um puxando o bicho atras de si, e so quando a
// conta fecha ele para pra lutar — com o grupo colado, um golpe de area rende de
// 2 a 4 alvos por turno em vez de 1. E o que o jogo chama de farm em area.
//
// POR QUE ISTO E UM SISTEMA SEPARADO
// -----------------------------------------------------------------------------
// A DECISAO ("pra onde ir e por que") mora aqui; a EXECUCAO (pathfinding, A*,
// colisao, deslizar em parede) continua inteira no `movementSystem`, que ja
// resolve isso pra jogador, selvagem e wander. Este arquivo nunca move ninguem:
// ele escreve `world.lure.destino` e o movimento consome. Misturar os dois
// significaria duplicar o `moveToward` ou espalhar regra de lure dentro do laco
// de movimento, e o laco de movimento e o unico lugar do motor que roda pra
// TODA entidade em TODO tick.
//
// A CONTA E DERIVADA, NAO ACUMULADA
// -----------------------------------------------------------------------------
// `reunidos` e recontado das entidades vivas todo tick. Um contador incremental
// ("puxei 3") ficaria mentindo assim que um dos tres morresse no meio da
// reuniao (o jogador continua revidando enquanto puxa) ou soltasse o aggro por
// leash — e a fase esperaria pra sempre por um numero que nunca mais fecha. E o
// mesmo raciocinio de `trocaEmCampo` em types.ts: rederivar uma condicao
// observavel e mais barato e mais seguro que carregar estado.
//
// O JOGADOR NAO BATE DURANTE A REUNIAO (PH-264)
// -----------------------------------------------------------------------------
// REVERTIDO POR PEDIDO EXPLICITO DO USUARIO. Ate aqui nada suprimia a acao do
// jogador, com o argumento de que suprimir custaria DPS e faria o POKE apanhar
// de graca. Na tela isso lia como o lure nao funcionando: o jogador pede 4
// selvagens, o POKE encosta no primeiro e comeca a bater — "ele esta batendo
// antes de lurar a quantidade solicitada".
//
// Agora `reunindoParaLure` responde por essa decisao e `updateCombat` nao chama
// `executePlayerAction` enquanto ela for verdadeira. A reuniao ficou com a
// mecanica que o painel promete: reune primeiro, luta depois.
//
// O CUSTO E REAL E ESTA ACEITO: o selvagem que alcancar o jogador durante a
// reuniao bate sem revide (os inimigos continuam agindo — suprimir os dois lados
// seria invulnerabilidade, nao lure). O teto de `LURE_TEMPO_MAXIMO_DE_REUNIAO`
// e o que limita esse tempo, e ele nao e mais so uma rede de seguranca contra
// travamento: virou tambem o teto de quanto o POKE pode apanhar calado.
//
// Nao suprime NADA alem do golpe do jogador. Os hooks de entrada em combate
// (Intimidate, Download, clima automatico) continuam disparando ao engajar, e
// os inimigos continuam agindo normalmente.
import { isDead, distanceTo } from '../entity'
// PH-394: a regra de 'quem e alvo prioritario' tem UM dono, e e o movimento.
import { ehAlvoPrioritario } from './movementSystem'
import { LURE_QUANTIDADE_MIN, LURE_QUANTIDADE_MAX } from '@/stores/gameStateDefaults'
import type { GameStateStore } from '@/stores/gameStateStore'
import type { EnemyEntity, EstadoDeLure, PlayerEntity, WorldState } from '../types'

/**
 * Teto de tempo da fase `reunindo`, em segundos.
 *
 * NAO e afinacao de balanceamento: e a garantia de que a fase termina. Os casos
 * que ela cobre sao todos reais e nenhum e raro — candidato do outro lado de um
 * body-block que o A* nao contorna, retardatario que nunca chega porque nasceu
 * atras de parede, dois selvagens morrendo na reuniao mais rapido do que o
 * jogador consegue puxar o terceiro. Sem o teto, qualquer um deles vira um POKE
 * andando em circulos sem bater.
 *
 * 18s: a hunt tem 6 selvagens espalhados entre 250 e 550px do jogador
 * (simulation.ts#SPAWN_CONE_*), e a 91 px/s atravessar essa faixa duas vezes
 * custa ~12s. O teto precisa caber o caso normal com folga, senao ele deixa de
 * ser rede de seguranca e passa a ser o que decide a mecanica.
 */
export const LURE_TEMPO_MAXIMO_DE_REUNIAO = 18

/**
 * Fracao da coleira (`enemy.leashRadius`) a partir da qual o jogador SEGURA a
 * posicao esperando o retardatario.
 *
 * Sem isso a reuniao se desfaz pela retaguarda exatamente quando esta quase
 * fechando: puxar o 3o/4o selvagem leva o jogador longe do 1o, e passar de
 * `leashRadius` (2,2x o aggro, ~385px) faz o bicho desistir e voltar pro spawn.
 * O jogador chegaria no ultimo candidato com a conta no mesmo lugar de antes.
 *
 * 0,8 e nao 1,0 porque a checagem roda uma vez por tick e o selvagem tambem se
 * move: no limite exato ele solta o aggro no mesmo frame em que a espera
 * comecaria.
 *
 * SAO DOIS LIMIARES, E NAO UM (PH-280). Este e o de ENTRADA; a saida e o
 * `LURE_FRACAO_PARA_VOLTAR_A_ANDAR`, mais apertado. Com um limiar so, o POKE
 * ficava parando e voltando a andar varias vezes por segundo — o retardatario
 * oscila em torno da linha, e cada cruzamento zerava ou devolvia o destino.
 *
 * Medido em scripts/harness/lure-para-e-anda.mjs, 60 segundos por corrida:
 *
 *   lure desligado        0,0 paradas
 *   lure ligado, juntar 2  32,3
 *   lure ligado, juntar 3  81,2
 *   lure ligado, juntar 4 154,7   <- 2,6 solavancos POR SEGUNDO
 *
 * O tempo total parado era pequeno (5% da reuniao), entao o defeito nunca foi
 * "o POKE fica parado": era a FREQUENCIA da troca. E o mesmo remedio de um
 * termostato que liga e desliga sem parar — histerese.
 */
const LURE_FRACAO_DA_COLEIRA = 0.8

/**
 * Fracao da coleira abaixo da qual o jogador VOLTA a andar, depois de ter
 * parado pra esperar (PH-280).
 *
 * Mais apertada que a de entrada de proposito: o retardatario precisa ter
 * ENCOSTADO de verdade, e nao so raspado na linha de novo. A diferenca entre as
 * duas (0,8 -> 0,62) e a banda morta que mata o piscar.
 *
 * 0,62 e nao 0,7: a 0,7 a banda cobria ~38px de coleira tipica e as paradas
 * ainda ficavam nas dezenas na medicao. Nao pode ser MUITO menor tambem — abaixo
 * disso o jogador espera o retardatario colar nele, e a reuniao demora mais sem
 * ganhar nada.
 */
const LURE_FRACAO_PARA_VOLTAR_A_ANDAR = 0.62

/**
 * O jogador esta REUNINDO agora — ou seja, o golpe dele fica segurado (PH-264).
 *
 * Uma funcao, e nao `world.lure?.fase === 'reunindo'` escrito no combate: quem
 * responde "o jogador pode bater?" e o lure, e o `combatSystem` nao deve
 * conhecer as fases dele. Se amanha a supressao passar a valer so em parte da
 * reuniao (por HP baixo, por exemplo), muda aqui e o combate nao sabe de nada.
 */
export function reunindoParaLure(world: WorldState): boolean {
  return world.lure?.fase === 'reunindo'
}

/** Este selvagem esta com aggro NO JOGADOR agora? */
function estaReunido(enemy: EnemyEntity, playerId: string): boolean {
  if (isDead(enemy)) return false
  if (enemy.targetId !== playerId) return false
  // `chase` e `engaged` sao os dois estados de "esta atras de mim" (ver
  // movementSystem#updateMovement). `wander`/`dead` nao contam, e `idle` e o
  // estado de quem acabou de nascer.
  return enemy.state === 'chase' || enemy.state === 'engaged'
}

/**
 * O selvagem vivo mais proximo que ainda NAO esta atras do jogador — o proximo
 * a ser puxado.
 *
 * Mais proximo, e nao "o que fecha o grupo mais rapido": o custo de puxar e a
 * distancia percorrida, e qualquer heuristica mais esperta que isso precisaria
 * prever pra onde o wander dos outros vai levar, o que este motor nao sabe.
 */
function proximoCandidato(player: PlayerEntity, enemies: EnemyEntity[]): EnemyEntity | null {
  let melhor: EnemyEntity | null = null
  let melhorDist = Infinity
  for (const enemy of enemies) {
    if (isDead(enemy) || estaReunido(enemy, player.id)) continue
    const dist = distanceTo(player, enemy)
    if (dist < melhorDist) {
      melhorDist = dist
      melhor = enemy
    }
  }
  return melhor
}

/**
 * Ha ALVO PRIORITARIO vivo em campo — shiny ou protetor (Guardian/Lord)?
 *
 * ERA `temShinyVivo`, E ESSE ERA O BUG (PH-394). A saida de shiny existe porque
 * a prioridade de shiny do movimento e mais forte que o lure, e as duas mandam no
 * MESMO `player` em direcoes diferentes. O PH-331 deu ao protetor a mesma
 * prioridade do shiny em `movementSystem#ehAlvoPrioritario` — e ninguem atualizou
 * esta saida. Resultado com lure ligado: o POKE andava passando pelo protetor sem
 * bater (a fase `reunindo` sobrepoe a escolha de alvo, e `reunindoParaLure`
 * suprime o golpe), e como a sala so avanca quando o protetor cai, a hunt ficava
 * parada esperando uma reuniao que reinicia sozinha.
 *
 * Consome `ehAlvoPrioritario` em vez de repetir a pergunta: "quem e alvo
 * prioritario" precisa de UM dono, e ele e o movimento. Foi exatamente a copia da
 * regra (aqui olhando so shiny, la olhando os dois) que produziu este defeito.
 */
function temAlvoPrioritarioVivo(enemies: EnemyEntity[]): boolean {
  return enemies.some((e) => !isDead(e) && ehAlvoPrioritario(e))
}

/**
 * Recalcula `world.lure` pro tick atual. Roda ANTES de `updateMovement`, que e
 * quem consome `destino`.
 *
 * Sai por `world.lure = null` (lure inativo, movimento e o de sempre) em todos
 * os casos em que reunir nao faz sentido:
 *  - config desligada;
 *  - sem jogador/mapa (Hospital);
 *  - jogador desmaiado — quem esta no chao nao puxa nada, e a troca de POKE
 *    seguinte precisa comecar o ciclo do zero;
 *  - `passiveEnemies` (boneco de treino): ele nunca revida, entao reunir seria
 *    so andar a mais pelo mesmo dano.
 */
export function atualizarLure(world: WorldState, gameState: GameStateStore, dt: number): void {
  const { player, enemies, mapDef } = world
  const config = gameState.lureConfig

  if (!player || !mapDef || !config?.ligado || player.fainted || mapDef.passiveEnemies) {
    world.lure = null
    return
  }

  const alvo = Math.max(
    LURE_QUANTIDADE_MIN,
    Math.min(LURE_QUANTIDADE_MAX, Math.round(config.quantidade) || LURE_QUANTIDADE_MIN),
  )

  const reunidos = enemies.filter((e) => estaReunido(e, player.id))
  const anterior = world.lure

  // Ciclo novo: a luta anterior acabou (ninguem mais atras do jogador), ou o
  // lure acabou de ser ligado. Comeca reunindo, com o relogio cheio.
  let fase: EstadoDeLure['fase'] = anterior?.fase ?? 'reunindo'
  let tempoRestante = anterior?.tempoRestante ?? LURE_TEMPO_MAXIMO_DE_REUNIAO
  if (fase === 'lutando' && reunidos.length === 0) {
    fase = 'reunindo'
    tempoRestante = LURE_TEMPO_MAXIMO_DE_REUNIAO
  }

  let destino: EstadoDeLure['destino'] = null
  let esperandoRetardatario = false

  if (fase === 'reunindo') {
    tempoRestante -= dt
    const candidato = proximoCandidato(player, enemies)
    // As quatro saidas da reuniao. Nenhuma e opcional:
    //  - conta fechada: e o objetivo;
    //  - sem candidato: hunt de um inimigo so (a inicial, as 11 BOSS, o Lance)
    //    e tambem o caso em que TODOS ja estao reunidos — nao ha mais o que
    //    puxar, e insistir seria andar sem bater pra sempre;
    //  - ALVO PRIORITARIO vivo — shiny OU protetor (Guardian/Lord): a prioridade
    //    do movimento (movementSystem#ehAlvoPrioritario) e mais forte que o
    //    lure, e as duas mandariam no mesmo `player` em direcoes diferentes. Era
    //    SO shiny ate PH-394, e o protetor (prioritario desde PH-331) ficava de
    //    fora: o POKE passava por ele sem bater ate a reuniao fechar, e a sala
    //    nao avanca sem o protetor cair;
    //  - tempo-limite: ver LURE_TEMPO_MAXIMO_DE_REUNIAO.
    const fechou = reunidos.length >= alvo
    if (fechou || candidato == null || temAlvoPrioritarioVivo(enemies) || tempoRestante <= 0) {
      fase = 'lutando'
    } else {
      // Retardatario perto de soltar o aggro: segura a posicao em vez de puxar
      // mais um. O selvagem continua vindo (ele esta em `chase`), entao esperar
      // e o que RECUPERA a distancia — andar mais so a aumentaria.
      //
      // O LIMIAR DEPENDE DO QUE O JOGADOR JA ESTAVA FAZENDO (PH-280): pra
      // COMECAR a esperar basta passar de `LURE_FRACAO_DA_COLEIRA`; pra VOLTAR a
      // andar, o retardatario precisa ter encostado ate
      // `LURE_FRACAO_PARA_VOLTAR_A_ANDAR`. Sem essa banda morta, o POKE parava e
      // andava varias vezes por segundo — ver a medicao nas constantes.
      const jaEsperava = anterior?.esperandoRetardatario === true
      const fracao = jaEsperava ? LURE_FRACAO_PARA_VOLTAR_A_ANDAR : LURE_FRACAO_DA_COLEIRA
      const retardatario = reunidos.find(
        (e) => distanceTo(player, e) > e.leashRadius * fracao,
      )
      if (retardatario) esperandoRetardatario = true
      else destino = { x: candidato.x, y: candidato.y }
    }
  }

  world.lure = {
    fase,
    alvo,
    reunidos: reunidos.length,
    tempoRestante: Math.max(0, tempoRestante),
    destino,
    esperandoRetardatario,
  }
}
