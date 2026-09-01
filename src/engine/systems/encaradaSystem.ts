// A encarada (PH-397): o que os dois POKEs fazem ENTRE um golpe e o outro num
// duelo 1x1.
//
// O QUE ACONTECIA
//
// `updateMovement` para a entidade assim que ela entra no alcance de combate
// (`state: 'engaged'`), e `desiredAnimName` cai em 'Idle' porque 'engaged' nao e
// nem 'chase' nem 'wander'. Como `MIN_ACTION_GAP` e `TURNO_SEGUNDOS` (3s) e a
// pose de ataque dura 0,5s (`ATTACK_ANIM_DURATION`), a maior parte de um duelo e
// dois sprites imoveis a 30 pixels um do outro.
//
// O QUE ACONTECE AGORA
//
// Enquanto os dois estao engajados e nenhum deles esta no meio de uma pose, o
// par oscila num arco em torno do proprio ponto medio, cada um virado pro outro.
// A pose de ataque continua congelando o movimento (`updateMovement` ja segura a
// posicao com `attackAnimTimer > 0`), entao o ritmo vira gira -> trava -> golpe
// -> gira.
//
// POR QUE ARCO, E NAO VOLTA COMPLETA
//
// O raio disponivel e curto e nao da pra alargar sem mexer no combate:
// `engageRangeFor` e `raioA + raioB + 10` = 39px, e `separarCorpos` empurra ate
// a soma dos raios, 29px. Sobra uma orbita de raio ~17 em torno do ponto medio.
// Nesse raio, uma volta completa lenta o bastante pra arte nao parecer acelerada
// sai a ~13px/s — o POKE anda a 91 (jogador) / 58,5 (inimigo) px/s, entao a
// animacao Walk viraria "correndo no lugar". Rapida o bastante pra arte ler
// certo, a volta fecha em 3,6s e parece frenetico. O arco atende os dois: a
// velocidade TANGENCIAL fica em 30px/s (leitura de arte correta) e o
// deslocamento total fica preso num vai-e-vem de ~2s, que e o que se quer
// mesmo — dois lutadores se medindo, nao um carrossel.
//
// De quebra, o arco resolve a camera: `renderer.ts#_computeCamera` trava no
// jogador SEM suavizacao nenhuma, entao tudo que o jogador faz o fundo inteiro
// faz junto. Uma volta completa arrastaria a cena em circulos o duelo todo.
import { deriveRng, nextFloat } from '@/core/rng'
import { mapWalkRadius, type MapDef } from '@/data/maps'
import { isDead } from '../entity'
import { faceToward } from './animationSystem'
import { imobilizadoPorStatus } from './statusSystem'
import { empurrarCorpo } from './corpoNoMapa'
import type { EnemyEntity, PlayerEntity, WorldState } from '../types'

/**
 * A que distancia o par se encara.
 *
 * TEM QUE FICAR ESTRITAMENTE DENTRO DE (soma dos raios, engageRange) — hoje
 * (29, 39). Fora disso a coreografia deixa de ser cosmetica:
 *
 *  - acima de `engageRange`, o par DESENGAJA e volta a se perseguir. Nao e so
 *    um vai-e-vem feio: cliente e servidor rodam com passos de tempo diferentes
 *    (60fps variavel contra `LIVE_SIM_STEP_SECONDS`), entao os dois lados
 *    cruzariam o limite em instantes diferentes e o dano divergiria de verdade
 *    numa luta que o servidor arbitra;
 *  - abaixo da soma dos raios, `separarCorpos` (que roda DEPOIS desta funcao)
 *    passa a empurrar os dois todo tick e as duas regras brigam pra sempre.
 *
 * `encarada.test.ts` trava isso: se alguem mexer aqui, nos raios
 * das entidades ou no `MELEE_RANGE_PADDING`, o teste reprova antes de o jogo
 * mostrar o defeito.
 */
export const DISTANCIA_DA_ENCARADA = 34

/** Meia-abertura do arco. O par varre 100 graus no total, ida e volta. */
const ARCO_MAXIMO = (50 * Math.PI) / 180

/**
 * Velocidade TANGENCIAL, px/s. Escolhida pela leitura da arte, nao pelo relogio:
 * e ela que decide se o `Walk` do sheet PMD combina com o quanto o corpo anda.
 * A cadencia do quadro e fixa (`animationSystem`: `durations[frame] / 60`), nao
 * escala com velocidade — deslocar devagar demais e o que produz o pe deslizando.
 */
const VELOCIDADE_DA_ENCARADA = 30

/**
 * Teto do passo por tick, como multiplo da velocidade tangencial.
 *
 * O passo de um tick e tangencial + a correcao RADIAL que puxa o par de volta
 * pra `DISTANCIA_DA_ENCARADA`. No regime normal a correcao e quase zero, mas no
 * primeiro tick depois do engajamento ela vale a diferenca inteira entre onde
 * `separarCorpos` deixou os dois e os 34 — sem teto, isso pousaria como um
 * teleporte de alguns pixels.
 */
const TETO_DO_PASSO = 2

/**
 * Quanto tempo o par pode ficar sem sair do lugar antes de a coreografia
 * desistir daquele sentido.
 *
 * Acontece de verdade: `empurrarCorpo` recusa o passo que cairia em parede
 * pintada, e um par encostado na borda da arena do Lance varreria o arco
 * inteiro contra a parede sem andar nada. Inverter e o conserto — o outro lado
 * do arco esta livre por construcao (foi de la que eles vieram).
 */
const PARADO_ANTES_DE_INVERTER = 0.25

/**
 * Horario ou anti-horario, re-sorteado a cada golpe trocado.
 *
 * Pedido explicito: pode continuar no mesmo sentido ou inverter, 50/50 — nao e
 * uma inversao garantida.
 *
 * NAO CONSOME `world.rng`. A sequencia principal e comparada entre a predicao do
 * cliente e o resim da autoridade (core/rng.ts), entao um sorteio a mais aqui
 * deslocaria tudo o que vem depois — mesma razao pela qual
 * `movementSystem#direcaoDeDesempate` deriva dos ids em vez de sortear.
 * `deriveRng` existe exatamente pra isto: uma sequencia paralela, funcao pura de
 * (par, contador), reproduzivel nas duas pontas sem gastar nada da principal.
 *
 * Exportada so pro teste: "50/50, e nao uma inversao garantida" e uma afirmacao
 * sobre a DISTRIBUICAO, e nao da pra medir distribuicao por fora sem rodar
 * centenas de duelos.
 */
export function sortearSentido(parKey: string, trocas: number): 1 | -1 {
  return nextFloat(deriveRng(0, `encarada|${parKey}|${trocas}`)) < 0.5 ? 1 : -1
}

/**
 * O par de duelo, se houver um.
 *
 * Exige TODAS as condicoes, e cada uma por um motivo diferente:
 *
 *  - `mapDef.encarada` — flag explicita nos 12 mapas de duelo. Nao se infere de
 *    `maxEnemies === 1`: aquilo e botao de balanceamento e a coreografia se
 *    desligaria sozinha no dia em que alguem o ajustasse.
 *  - exatamente UM inimigo vivo — a coreografia e de PAR. Com dois ou mais em
 *    campo nao ha ponto medio que faca sentido. Mortos nao contam: a arena do
 *    Lance tem `keepCorpses`, entao os derrotados ficam em `world.enemies` pra
 *    sempre.
 *  - os dois em 'engaged', e o inimigo mirando o jogador — e a definicao de
 *    "estao se enfrentando agora". Sem isso a coreografia rodaria durante a
 *    aproximacao e brigaria com quem esta perseguindo.
 */
function parEmEncarada(world: WorldState): { jogador: PlayerEntity; inimigo: EnemyEntity } | null {
  const { player, enemies, mapDef } = world
  if (!mapDef?.encarada || !player) return null
  if (player.fainted || isDead(player) || player.state !== 'engaged') return null

  let inimigo: EnemyEntity | null = null
  for (const e of enemies) {
    if (isDead(e)) continue
    if (inimigo) return null // dois ou mais vivos: nao e duelo
    inimigo = e
  }
  if (!inimigo) return null
  if (inimigo.state !== 'engaged' || inimigo.targetId !== player.id) return null
  return { jogador: player, inimigo }
}

/**
 * Um tick de encarada.
 *
 * Chamada do fim de `updateMovement`, DEPOIS de todo mundo ter andado e ANTES de
 * `separarCorpos`. A ordem importa nas duas pontas: depois do movimento porque a
 * coreografia sobrepoe a posicao de quem ja parou, e antes da separacao porque e
 * ela quem tem a ultima palavra sobre corpo dentro de corpo.
 *
 * RODA TAMBEM EM MODO SILENCIOSO, e isso e de proposito. Foi um gate por
 * `silent` que travou entidades pra sempre no `tickAttackAnimTimers` (ver a nota
 * la): um estado que so avanca no cliente fica congelado em qualquer simulacao
 * de servidor. Aqui o custo e desprezivel — um par, uma vez por tick — e o
 * beneficio e nao ter duas maquinas de estado diferentes rodando dos dois lados.
 *
 * NAO TOCA EM `entity.state`. `updateCombat` filtra os inimigos por
 * `state === 'engaged'`; trocar pra 'chase' so pra ganhar a animacao de andar
 * PARARIA o combate. Quem carrega a informacao pro desenho e a flag efemera
 * `encarando`, lida so por `desiredAnimName`.
 */
export function aplicarEncarada(world: WorldState, dt: number): void {
  // Zera antes de decidir: quem saiu da encarada neste tick (POKE caiu, alguem
  // desengajou, um segundo inimigo entrou) tem que voltar pra pose parada no
  // mesmo frame, e nao um frame depois.
  if (world.player) world.player.encarando = false
  for (const e of world.enemies) e.encarando = false

  const par = parEmEncarada(world)
  if (!par) {
    world.encarada = null
    return
  }
  const { jogador, inimigo } = par
  const mapDef = world.mapDef!

  const parKey = `${jogador.id}|${inimigo.id}`
  let estado = world.encarada
  if (!estado || estado.parKey !== parKey) {
    const dx = inimigo.x - jogador.x
    const dy = inimigo.y - jogador.y
    estado = {
      parKey,
      // Sobrepostos (`Math.atan2(0, 0)` e 0) so acontece antes de
      // `separarCorpos` ter agido uma vez; 0 e tao bom quanto qualquer eixo,
      // e o proximo tick ja recalcula a partir de posicoes separadas.
      anguloBase: dx === 0 && dy === 0 ? 0 : Math.atan2(dy, dx),
      desvio: 0,
      sentido: sortearSentido(parKey, 0),
      trocas: 0,
      poseAtiva: jogador.attackAnimTimer > 0 || inimigo.attackAnimTimer > 0,
      paradoSegundos: 0,
    }
    world.encarada = estado
  }

  // BORDA DE SUBIDA da pose, nao o estado dela: contar "pose ativa" todo tick
  // somaria 30 trocas por golpe. Este e o unico acoplamento com o combate, e ele
  // e por OBSERVACAO — nenhum call site de ataque precisa saber que a encarada
  // existe, o que e o que impede um caminho novo de golpe de esquecer de avisar.
  const poseAgora = jogador.attackAnimTimer > 0 || inimigo.attackAnimTimer > 0
  if (poseAgora && !estado.poseAtiva) {
    estado.trocas += 1
    estado.sentido = sortearSentido(parKey, estado.trocas)
  }
  estado.poseAtiva = poseAgora

  // Pose de ataque congela (e o "trava" do ritmo). Imobilizado por status
  // tambem: sono e congelamento sao sobre nao poder agir, e uma coreografia
  // seria exatamente uma acao. Nao ha `else` — os dois casos so deixam
  // `encarando` em false, entao a arte cai na pose de ataque ou em 'Idle'.
  if (poseAgora || imobilizadoPorStatus(jogador) || imobilizadoPorStatus(inimigo)) return

  const raio = DISTANCIA_DA_ENCARADA / 2
  const passoAngular = (VELOCIDADE_DA_ENCARADA / raio) * dt
  let desvio = estado.desvio + estado.sentido * passoAngular
  if (desvio > ARCO_MAXIMO) {
    desvio = ARCO_MAXIMO
    estado.sentido = -1
  } else if (desvio < -ARCO_MAXIMO) {
    desvio = -ARCO_MAXIMO
    estado.sentido = 1
  }
  estado.desvio = desvio

  // O ponto medio sai das posicoes REAIS deste tick, e nao de um centro
  // guardado. E o que faz a coreografia se auto-corrigir: se uma parede segurou
  // um dos dois, o alvo do proximo tick ja considera onde eles de fato estao, em
  // vez de puxar os dois pra um centro que nao existe mais.
  const angulo = estado.anguloBase + desvio
  const meioX = (jogador.x + inimigo.x) / 2
  const meioY = (jogador.y + inimigo.y) / 2
  const ux = Math.cos(angulo)
  const uy = Math.sin(angulo)

  const mapCx = mapDef.bounds.width / 2
  const mapCy = mapDef.bounds.height / 2
  const mapRadius = mapWalkRadius(mapDef)
  const teto = VELOCIDADE_DA_ENCARADA * TETO_DO_PASSO * dt

  const antes = { jx: jogador.x, jy: jogador.y, ix: inimigo.x, iy: inimigo.y }
  moverPara(jogador, meioX - ux * raio, meioY - uy * raio, teto, mapDef, mapCx, mapCy, mapRadius)
  moverPara(inimigo, meioX + ux * raio, meioY + uy * raio, teto, mapDef, mapCx, mapCy, mapRadius)

  const andou = Math.hypot(jogador.x - antes.jx, jogador.y - antes.jy)
    + Math.hypot(inimigo.x - antes.ix, inimigo.y - antes.iy)
  // 10% do passo esperado, e nao "zero": `empurrarCorpo` degrada por eixo, entao
  // um corpo contra a parede ainda desliza uma fracao. Preso e nao andar quase
  // nada, nao apenas nao andar nada.
  if (andou < VELOCIDADE_DA_ENCARADA * dt * 0.1) {
    estado.paradoSegundos += dt
    if (estado.paradoSegundos >= PARADO_ANTES_DE_INVERTER) {
      estado.sentido = estado.sentido === 1 ? -1 : 1
      estado.paradoSegundos = 0
    }
  } else {
    estado.paradoSegundos = 0
  }

  jogador.encarando = true
  inimigo.encarando = true
  // Sem isto o par giraria de costas: `facing` alimenta a fileira do sheet PMD
  // (8 direcoes) e so quem MOVE escreve nele. Girar em torno do outro sem
  // reapontar mostraria o POKE andando de lado com a cara pra onde ele estava
  // olhando quando parou — que e o mesmo defeito que `triggerAttackAnim` teve.
  faceToward(jogador, inimigo)
  faceToward(inimigo, jogador)
}

/** Empurra `corpo` em direcao a (tx, ty), no maximo `teto` unidades neste tick. */
function moverPara(
  corpo: { x: number; y: number },
  tx: number,
  ty: number,
  teto: number,
  mapDef: MapDef,
  mapCx: number,
  mapCy: number,
  mapRadius: number,
): void {
  const dx = tx - corpo.x
  const dy = ty - corpo.y
  const dist = Math.hypot(dx, dy)
  if (dist === 0) return
  const fator = Math.min(1, teto / dist)
  empurrarCorpo(corpo, dx * fator, dy * fator, mapDef, mapCx, mapCy, mapRadius)
}
