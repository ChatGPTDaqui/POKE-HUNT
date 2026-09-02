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
// par percorre JUNTO uma sequencia de meia-luas SORTEADAS — as "pernas" —, cada
// um virado pro outro. A pose de ataque continua congelando o movimento
// (`updateMovement` ja segura a posicao com `attackAnimTimer > 0`) e encerra a
// perna em curso, entao o ritmo vira gira -> trava -> golpe -> gira noutra
// direcao.
//
// TRES VERSOES, E O QUE A TELA REPROVOU EM CADA UMA
//
// 1. GIRO EM TORNO DO PONTO MEDIO: invisivel, 26px de passo. O raio de cada
//    corpo era metade da distancia entre os dois, e essa distancia e presa em
//    (29, 39) pelo combate — nao havia numero a mexer.
// 2. GIRO EM TORNO DE UM PIVO LATERAL FIXO: resolveu a largura (117px) e criou
//    outro defeito. O caminho era um arco unico, sempre com a mesma barriga,
//    percorrido pra la e pra ca — leu como o balanco de uma barca viking, que e
//    literalmente o que um pendulo e.
// 3. OITO DEITADO: alternou a curva, mas fecha sempre no mesmo ponto. Um
//    trajeto que volta pro comeco toda volta e tao previsivel quanto o pendulo.
//
// A licao das tres e a mesma: QUALQUER figura fixa vira padrao, porque o olho
// acha o padrao. Por isso nao ha figura — cada perna sorteia curvatura, lado e
// tamanho, e termina num lugar que a anterior nao anuncia. Ver `sortearPerna`.
//
// O CONTRAPESO E A COLEIRA. `renderer.ts#_computeCamera` trava no jogador SEM
// suavizacao nenhuma: tudo que o jogador faz, o fundo inteiro faz junto. Pernas
// sorteadas sem limite sao um passeio aleatorio, e o duelo migraria pela arena
// arrastando a cena junto ate raspar numa parede. Ver `COLEIRA_DA_ENCARADA`.
import { deriveRng, nextFloat } from '@/core/rng'
import { mapWalkRadius, type MapDef } from '@/data/maps'
import { isDead } from '../entity'
import { faceToward } from './animationSystem'
import { imobilizadoPorStatus } from './statusSystem'
import { empurrarCorpo } from './corpoNoMapa'
import type { EnemyEntity, EstadoDaEncarada, PlayerEntity, WorldState } from '../types'

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

/**
 * Comprimento tipico de uma PERNA — uma meia-lua — em px. O botao do tamanho do
 * passo.
 *
 * Cada perna sorteia +/-35% em cima disto: pernas todas do mesmo tamanho batem
 * como metronomo mesmo com a curva variando.
 *
 * Nao briga com o combate: a distancia entre os dois nao depende do caminho, so
 * de onde eles ficam em relacao ao ponto medio, que e sempre
 * `DISTANCIA_DA_ENCARADA`. O caminho move os dois juntos.
 */
const PASSO_DA_PERNA = 95

/**
 * Faixa de curvatura das pernas: a que distancia do par cai o pivo.
 *
 * Perto, a meia-lua e fechada e o par gira quase em torno de si; longe, ela e
 * aberta e vira quase um passo reto. Sortear DENTRO de uma faixa, em vez de um
 * valor fixo, e metade do que impede a coreografia de virar padrao — a outra
 * metade e o lado do pivo, tambem sorteado.
 */
const RAIO_DA_CURVA_MIN = 32
const RAIO_DA_CURVA_MAX = 95

/**
 * Ate onde o duelo pode se afastar de onde comecou, em px.
 *
 * Pernas sorteadas sem coleira sao um passeio aleatorio, e passeio aleatorio nao
 * fica onde comecou: o duelo migraria pela arena ate encostar numa parede e
 * ficar raspando. 170px deixa a danca sair do lugar de verdade — que e o pedido
 * — sem levar a luta pra fora do enquadramento em que ela comecou.
 */
const COLEIRA_DA_ENCARADA = 170

/**
 * Velocidade TANGENCIAL, px/s. Escolhida pela leitura da arte, nao pelo relogio:
 * e ela que decide se o `Walk` do sheet PMD combina com o quanto o corpo anda.
 * A cadencia do quadro e fixa (`animationSystem`: `durations[frame] / 60`), nao
 * escala com velocidade — deslocar devagar demais e o que produz o pe deslizando.
 *
 * O TETO E O ANDAR DO PROPRIO POKE: 58,5px/s pro inimigo, 91 pro jogador
 * (`entity.ts`). Acima disso a arte de andar passa a ficar LENTA demais pro
 * deslocamento e o POKE parece patinar pra frente — o defeito oposto do pe
 * deslizando, e igualmente visivel.
 *
 * Era 30 enquanto o passo tinha 26px de largura. Com as pernas de ~95px da
 * PH-402, 30px/s levaria mais de 3s por meia-lua; 55 fecha em ~1,7s.
 *
 * E CONSTANTE ENTRE PERNAS DE CURVATURA DIFERENTE, e isso nao sai de graca: cada
 * perna tem seu proprio raio, entao a mesma velocidade ANGULAR daria velocidades
 * lineares diferentes — a meia-lua aberta correria o dobro da fechada, com a
 * mesma cadencia de arte nas duas. Por isso o progresso e dividido pelo raio da
 * perna, e nao contado em angulo.
 */
const VELOCIDADE_DA_ENCARADA = 55

/**
 * Teto do passo por tick, como multiplo da velocidade tangencial.
 *
 * O alvo de cada tick e uma posicao ABSOLUTA, nao um deslocamento, entao o passo
 * pode ser maior que o tangencial quando o corpo esta longe de onde deveria
 * estar. No regime normal a diferenca e quase zero, mas ela vale muito em dois
 * momentos reais: no primeiro tick depois do engajamento (onde `separarCorpos`
 * deixou os dois contra os 34 da coreografia) e logo depois de uma parede ter
 * segurado alguem por alguns ticks. Sem teto, os dois casos pousariam como
 * teleporte.
 */
const TETO_DO_PASSO = 2

/**
 * Quanto tempo o par pode ficar sem sair do lugar antes de a coreografia
 * desistir daquele sentido.
 *
 * Acontece de verdade: `empurrarCorpo` recusa o passo que cairia em parede
 * pintada, e um par encostado na borda da arena do Lance insistiria no mesmo
 * trecho do caminho sem andar nada. Inverter e o conserto — o trecho anterior
 * esta livre por construcao, foi de la que eles vieram.
 */
const PARADO_ANTES_DE_INVERTER = 0.25

/**
 * Sorteia a PERNA seguinte: uma meia-lua com curvatura, lado e tamanho proprios,
 * partindo de onde o par esta agora.
 *
 * POR QUE PERNAS SORTEADAS, E NAO UM CAMINHO FIXO
 *
 * Foram duas tentativas de figura fixa, e a tela reprovou as duas pelo MESMO
 * motivo de fundo — o olho acha o padrao:
 *
 *  1. Arco unico em torno de um pivo fixo: a curva entortava sempre pro mesmo
 *     lado, e o vai-e-vem leu como o balanco de uma barca viking.
 *  2. Oito deitado: resolveu a curva alternada, mas fecha sempre no mesmo ponto,
 *     e um trajeto que volta pro comeco toda volta e tao previsivel quanto o
 *     pendulo.
 *
 * Aqui nao ha figura. Cada perna sorteia de novo de que lado fica o pivo (a
 * barriga da curva), a que distancia ele fica (o quanto ela e fechada ou aberta)
 * e quanto arco percorrer (o tamanho do passo) — entao cada meia-lua termina num
 * lugar que a anterior nao anuncia.
 *
 * NAO CONSOME `world.rng`, pelo mesmo motivo de `sortearSentido`: a sequencia
 * principal e reconferida pelo servidor, e um sorteio a mais aqui deslocaria
 * tudo o que vem depois. `deriveRng` da uma sequencia paralela, funcao pura de
 * (par, numero da perna).
 *
 * A COLEIRA. Sem ela isto e um passeio aleatorio, e passeio aleatorio nao fica
 * onde comecou: o duelo migraria pela arena ate encostar numa parede e ficar
 * raspando nela. Quando a perna sorteada terminaria longe demais da origem do
 * duelo, o sinal do arco e trocado — a mesma curva, virada pro outro lado, que
 * traz o par de volta. Trocar o SINAL, e nao sortear de novo, e o que mantem
 * isto sem laco: um sorteio que pode falhar de novo precisaria de um limite de
 * tentativas, e um limite de tentativas precisaria de um caso de desistencia.
 */
export function sortearPerna(estado: EstadoDaEncarada, centroX: number, centroY: number, angulo: number): void {
  const rng = deriveRng(0, `encarada-perna|${estado.parKey}|${estado.perna}`)
  const passo = estado.passo ?? PASSO_DA_PERNA

  estado.centroX = centroX
  estado.centroY = centroY
  estado.anguloBase = angulo
  estado.lado = nextFloat(rng) < 0.5 ? 1 : -1
  estado.raioDaCurva = RAIO_DA_CURVA_MIN + nextFloat(rng) * (RAIO_DA_CURVA_MAX - RAIO_DA_CURVA_MIN)
  estado.progresso = 0

  // O arco que percorre `passo` pixels neste raio. A variacao de +/-35% existe
  // pra o RITMO tambem nao virar padrao: pernas todas do mesmo tamanho batem
  // como metronomo mesmo com a curva mudando.
  const comprimento = passo * (0.65 + nextFloat(rng) * 0.7)
  const magnitude = comprimento / raioOrbitalDe(estado)
  const sinal = nextFloat(rng) < 0.5 ? 1 : -1
  estado.arcoDaPerna = magnitude * sinal

  const fim = pontoDoFimDaPerna(estado)
  const distDaOrigem = Math.hypot(fim.x - estado.origemX, fim.y - estado.origemY)
  if (distDaOrigem > (estado.coleira ?? COLEIRA_DA_ENCARADA)) {
    const espelho = { ...estado, arcoDaPerna: -estado.arcoDaPerna }
    const fimEspelhado = pontoDoFimDaPerna(espelho)
    const distEspelhada = Math.hypot(fimEspelhado.x - estado.origemX, fimEspelhado.y - estado.origemY)
    if (distEspelhada < distDaOrigem) estado.arcoDaPerna = -estado.arcoDaPerna
  }
}

/** O pivo desta perna: `raioDaCurva` px perpendicular ao eixo, do lado sorteado. */
function pivoDaPerna(estado: EstadoDaEncarada): { x: number; y: number } {
  const ux = Math.cos(estado.anguloBase)
  const uy = Math.sin(estado.anguloBase)
  return {
    x: estado.centroX - uy * estado.raioDaCurva * estado.lado,
    y: estado.centroY + ux * estado.raioDaCurva * estado.lado,
  }
}

/**
 * Distancia do CORPO ao pivo — o raio que ele de fato percorre.
 *
 * O corpo esta a meia distancia do centro ao longo do eixo, e o pivo esta
 * perpendicular a ele: dois catetos, e o raio e a hipotenusa. Os dois corpos tem
 * o mesmo raio (sao simetricos em relacao ao centro), entao a rotacao os leva
 * juntos e a distancia entre eles nao muda.
 */
function raioOrbitalDe(estado: EstadoDaEncarada): number {
  return Math.hypot(estado.raioDaCurva, DISTANCIA_DA_ENCARADA / 2)
}

/** Onde o ponto medio do par para, se esta perna for percorrida ate o fim. */
function pontoDoFimDaPerna(estado: EstadoDaEncarada): { x: number; y: number } {
  return girarEmTorno(estado.centroX, estado.centroY, pivoDaPerna(estado), estado.arcoDaPerna)
}

function girarEmTorno(x: number, y: number, pivo: { x: number; y: number }, angulo: number): { x: number; y: number } {
  const cos = Math.cos(angulo)
  const sen = Math.sin(angulo)
  const dx = x - pivo.x
  const dy = y - pivo.y
  return { x: pivo.x + dx * cos - dy * sen, y: pivo.y + dx * sen + dy * cos }
}

/**
 * Onde um dos dois corpos deve estar agora. `sinal` e -1 pro jogador e +1 pro
 * inimigo — quem fica de que lado do eixo.
 *
 * A DISTANCIA ENTRE OS DOIS E EXATA POR CONSTRUCAO, e nao por correcao: os dois
 * saem do mesmo ponto, deslocados meia distancia pra cada lado ao longo do mesmo
 * angulo, e depois rodam em torno do mesmo pivo — rotacao rigida preserva
 * distancia. Nao existe combinacao de curva, arco ou progresso que os afaste,
 * que e o que mantem a coreografia incapaz de mexer no combate por mais que os
 * numeros mudem depois.
 *
 * ABSOLUTO DENTRO DA PERNA, e nao incremental. A ancora e recalculada uma vez
 * por perna, das posicoes reais — o que se auto-corrige depois de uma parede
 * sem deixar o eixo derivar tick a tick, que foi o defeito da primeira versao.
 */
function alvoNoCaminho(estado: EstadoDaEncarada, sinal: 1 | -1): { x: number; y: number } {
  const meia = DISTANCIA_DA_ENCARADA / 2
  const partidaX = estado.centroX + Math.cos(estado.anguloBase) * meia * sinal
  const partidaY = estado.centroY + Math.sin(estado.anguloBase) * meia * sinal
  return girarEmTorno(partidaX, partidaY, pivoDaPerna(estado), estado.arcoDaPerna * estado.progresso)
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
  const meioX = (jogador.x + inimigo.x) / 2
  const meioY = (jogador.y + inimigo.y) / 2
  const dx = inimigo.x - jogador.x
  const dy = inimigo.y - jogador.y
  // Sobrepostos (`Math.atan2(0, 0)` e 0) so acontece antes de `separarCorpos`
  // ter agido uma vez; 0 e tao bom quanto qualquer eixo, e a perna seguinte ja
  // reancora a partir de posicoes separadas.
  const eixoAgora = dx === 0 && dy === 0 ? 0 : Math.atan2(dy, dx)

  let estado = world.encarada
  if (!estado || estado.parKey !== parKey) {
    estado = {
      parKey,
      // Onde o duelo comecou. So a COLEIRA le isto — o caminho em si sai da
      // ancora da perna atual, logo abaixo.
      origemX: meioX,
      origemY: meioY,
      centroX: meioX,
      centroY: meioY,
      anguloBase: eixoAgora,
      perna: 0,
      lado: 1,
      raioDaCurva: RAIO_DA_CURVA_MIN,
      arcoDaPerna: 0,
      progresso: 1, // ja "terminada": o bloco de avanco sorteia a primeira
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
  //
  // O golpe ENCERRA a perna em curso. E o que faz a coreografia ter o ritmo da
  // luta em vez de um ritmo proprio: cada troca de golpe recomeca a danca noutra
  // direcao, em vez de o par retomar a curva de onde parou como se nada tivesse
  // acontecido.
  const poseAgora = jogador.attackAnimTimer > 0 || inimigo.attackAnimTimer > 0
  if (poseAgora && !estado.poseAtiva) {
    estado.trocas += 1
    estado.progresso = 1
  }
  estado.poseAtiva = poseAgora

  // Pose de ataque congela (e o "trava" do ritmo). Imobilizado por status
  // tambem: sono e congelamento sao sobre nao poder agir, e uma coreografia
  // seria exatamente uma acao. Nao ha `else` — os dois casos so deixam
  // `encarando` em false, entao a arte cai na pose de ataque ou em 'Idle'.
  if (poseAgora || imobilizadoPorStatus(jogador) || imobilizadoPorStatus(inimigo)) return

  const velocidade = estado.velocidade ?? VELOCIDADE_DA_ENCARADA

  // Perna terminada: sorteia a proxima a partir de ONDE O PAR ESTA DE VERDADE,
  // e nao de onde a perna anterior deveria ter acabado. E aqui que a parede se
  // resolve sozinha — o desvio que ela causou vira o ponto de partida legitimo
  // do proximo trecho, em vez de um erro acumulado.
  if (estado.progresso >= 1) {
    estado.perna += 1
    sortearPerna(estado, meioX, meioY, eixoAgora)
  }

  const raioOrbital = raioOrbitalDe(estado)
  const arco = Math.abs(estado.arcoDaPerna)
  // Arco degenerado (perna de comprimento zero) travaria a divisao; termina a
  // perna e deixa a proxima entrar no tick seguinte.
  estado.progresso = arco > 1e-6
    ? Math.min(1, estado.progresso + (velocidade * dt) / (raioOrbital * arco))
    : 1

  const mapCx = mapDef.bounds.width / 2
  const mapCy = mapDef.bounds.height / 2
  const mapRadius = mapWalkRadius(mapDef)
  const teto = velocidade * TETO_DO_PASSO * dt

  const alvoJogador = alvoNoCaminho(estado, -1)
  const alvoInimigo = alvoNoCaminho(estado, 1)
  const antes = { jx: jogador.x, jy: jogador.y, ix: inimigo.x, iy: inimigo.y }
  moverPara(jogador, alvoJogador.x, alvoJogador.y, teto, mapDef, mapCx, mapCy, mapRadius)
  moverPara(inimigo, alvoInimigo.x, alvoInimigo.y, teto, mapDef, mapCx, mapCy, mapRadius)

  const andou = Math.hypot(jogador.x - antes.jx, jogador.y - antes.jy)
    + Math.hypot(inimigo.x - antes.ix, inimigo.y - antes.iy)
  // 10% do passo esperado, e nao "zero": `empurrarCorpo` degrada por eixo, entao
  // um corpo contra a parede ainda desliza uma fracao. Preso e nao andar quase
  // nada, nao apenas nao andar nada.
  if (andou < velocidade * dt * 0.1) {
    estado.paradoSegundos += dt
    if (estado.paradoSegundos >= PARADO_ANTES_DE_INVERTER) {
      // Preso contra parede: abandona a perna. A proxima e sorteada de novo, e
      // como o sorteio parte de onde o par ESTA, o par nao fica insistindo no
      // mesmo trecho impossivel. Abandonar e melhor que inverter — inverter so
      // devolveria o par pelo caminho de onde veio, e ele bateria de novo.
      estado.progresso = 1
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
