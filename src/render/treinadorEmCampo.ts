// O TREINADOR em campo: um boneco que anda atras do POKE do jogador (08/10).
//
// Pedido do dono: o personagem anda atras do POKE "deixando um espaco de 2
// quadrados" — 2 celulas da grade de colisao (20 px cada) ENTRE os dois.
//
// SO DESENHO, nada no motor: o treinador nao luta, nao colide e nao muda o
// combate, entao ele nao entra no `WorldState` (e nao vira divergencia com a
// autoridade, que re-simula o mundo). Ele segue o RASTRO do POKE — o caminho
// que o POKE fez, como nos jogos com POKE seguidor —, e nao a posicao atual:
// cortando caminho em linha reta, ele atravessaria parede e virava junto com
// cada meia-volta do POKE.
//
// Sprite (08/10): uma folha por SKIN (`data/skinsDoTreinador.ts`, escolhida no
// Perfil). A padrao, "mochila" (bone vermelho, colete azul, mochila), veio de uma folha
// 4x7 em PNG com alpha, convertida pro formato das folhas dos POKE — 8 linhas
// de direcao na ordem do PMD x 4 quadros, quadro 32x40, pe na linha 37. Na
// conversao: reducao por moda de cor em blocos (~5,4 px), cada linha da
// original na MESMA altura (a arte desenha os lados maiores que a frente) e
// paleta de 20 cores. Baixo-esquerda e espelho da baixo-direita (a unica
// direcao que faltava).
//
// Tamanho (08/10, pedido do dono): o boneco tem 30 px de altura (a arte
// anterior tinha 35) — um pouco menor, na proporcao dos POKE.
//
// Walk (09/10): ciclo do PMD (conferido no Machoke do SpriteCollab) — quadros
// 0 e 2 sao o NEUTRO (pernas juntas, corpo 1 px acima: o balanco do andar), 1 e
// 3 os passos com pe trocado. A arte da IA trazia 4 passos sem neutro nem
// balanco, e a perna "pedalava".
//
// Idle: a folha so tem passos (um pe sempre no ar). A pose em pe usa cabeca e
// tronco do passo mais fechado e redesenha as pernas paradas, lado a lado, com
// as cores da propria folha; o segundo quadro desce o tronco 1 px (respiracao).
import { COLLISION_GRID_CELL_SIZE } from '@/data/collisionConstants'
import { directionRowFromFacing } from '@/engine/systems/animationSystem'
import { FONTE } from './textoDeCombate'
import { SKIN_PADRAO, folhaDaSkin } from '@/data/skinsDoTreinador'

type Ponto = { x: number; y: number }

/** Espaco ENTRE o POKE e o treinador: 3 quadrados da grade (era 2 ate 09/10). */
export const ESPACO_DO_TREINADOR = 3 * COLLISION_GRID_CELL_SIZE
/*
 * Seguidor "de gente" (09/10). Ate aqui o boneco andava EXATAMENTE no rastro
 * do POKE, a distancia fixa: copiava cada vaivem do combate e cada zigue-zague
 * do caminho. Agora ele so anda quando o POKE se afasta alem de uma folga,
 * corta caminho em linha reta quando nada bloqueia (o rastro so serve pra
 * contornar parede), acelera e freia, aperta o passo quando fica pra tras e,
 * parado, fica olhando o POKE lutar.
 */
/** Comeca a andar quando o POKE passa desta folga alem da distancia de conforto (1 quadrado). */
const FOLGA_PRA_SEGUIR = COLLISION_GRID_CELL_SIZE
/** Velocidade (px/s) de quem acabou de sair andando. O POKE anda a 91. */
const VEL_MIN = 55
/** Teto: apertando o passo pra alcancar. */
const VEL_MAX = 130
/** Quanto a velocidade sobe por px de atraso alem da distancia de conforto. */
const VEL_POR_PX_DE_ATRASO = 1.5
/** Aceleracao (px/s por s): sai sem tranco; freia no dobro. */
const ACELERACAO = 260
/** Pontos do rastro a pelo menos isto um do outro (px). */
const PASSO_DO_RASTRO = 3
/** Teto de pontos guardados no rastro. */
const MAX_PONTOS_NO_RASTRO = 300
/** Treinador mais longe que isto do POKE (preso atras de parede) reaparece atras dele. */
const LONGE_DEMAIS = 400
/** Meia largura da "visada gorda": corta caminho sem raspar na parede (px). */
const LARGURA_DA_VISADA = 5
/** Sem caminho nenhum por mais que isto (s): reaparece atras do POKE. */
const TRAVADO_POR = 1
/** Quanto a direcao parada segue o POKE por quadro: vira devagar, sem tremer. */
const SUAVIZA_OLHAR = 0.08
/** Meia largura do corpo do boneco (px de mundo), pra o espaco ser entre os corpos. */
const RAIO_DO_TREINADOR = 6
/** Do centro do POKE ate o chao — o boneco pisa no mesmo chao que ele. */
const DO_CENTRO_AO_CHAO = 8
/** Salto maior que isto num quadro (troca de sala, reconstrucao) reposiciona sem andar. */
const SALTO = 120

const QUADRO_L = 32, QUADRO_A = 40
/** Linha do pe dentro do quadro. */
const PE_NO_QUADRO = 37
/** Altura do boneco (px), do pe ao topo do bone. */
const ALTURA_DO_BONECO = 30
/** Cor do nome do treinador: azul claro, pra nao confundir com o nome dos POKE (branco/raridade). */
const COR_DO_NOME = '#9fd8ff'
/**
 * Px de caminho por quadro de caminhada. A caminhada avanca pela DISTANCIA
 * andada, e nao pelo relogio (08/10): por distancia, cada passo cobre sempre o
 * mesmo chao e o pe nao escorrega.
 *
 * 09/10: o ciclo e o do PMD — NEUTRO, PASSO, NEUTRO, PASSO, nas proporcoes
 * 8/10/8/10 da AnimData (passo dura mais que o neutro). Volta inteira = 40 px.
 * Era 5 px por quadro (20 px a volta): com o POKE a 91 px/s davam 18 quadros
 * por segundo, perna de corrida num boneco que anda.
 */
const PX_POR_QUADRO_DE_PASSO = [9, 11, 9, 11]
/** Parado por pelo menos isto (s) pra voltar a pose em pe — sem pisca andar/parar. */
const FOLGA_PRA_PARAR = 0.15
/** Quanto a direcao segue o movimento por quadro (0..1): vira suave, sem tremer de linha. */
const SUAVIZA_DIRECAO = 0.25

/** Duracao (ticks de 1/60 s) de cada quadro. Toda skin tem o mesmo formato de folha. */
const DURACOES: Record<'Walk' | 'Idle', number[]> = {
  Walk: [8, 10, 8, 10],
  // Idle: pose EM PE (ver topo); o segundo quadro e a respiracao.
  Idle: [50, 50],
}

const imagens = new Map<string, HTMLImageElement>()
function imagem(url: string): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null
  let img = imagens.get(url)
  if (!img) { img = new Image(); img.src = url; imagens.set(url, img) }
  return img
}

interface Estado {
  /** Posicoes do POKE, a mais nova no fim. */
  rastro: Ponto[]
  /** Pe do treinador. */
  pos: Ponto | null
  facing: Ponto
  anim: 'Walk' | 'Idle'
  quadro: number
  /** Ticks (1/60 s) no quadro atual (Idle) ou px andados no quadro atual (Walk). */
  ticks: number
  /** Segundos sem andar. */
  parado: number
  /** Seguindo o POKE agora (decidido com folga, pra nao ligar/desligar a cada quadro). */
  seguindo: boolean
  /** Velocidade atual (px/s). */
  vel: number
  /** Segundos querendo andar sem caminho nenhum (encurralado). */
  travado: number
}

/** Distancia de conforto: do centro do POKE ate o centro do treinador. */
function distanciaNoRastro(raioDoPoke: number): number {
  return ESPACO_DO_TREINADOR + raioDoPoke + RAIO_DO_TREINADOR
}

/** Ponto do rastro a `d` px (de caminho) atras do mais novo; `null` se o rastro e curto. */
export function pontoAtras(rastro: readonly Ponto[], d: number): Ponto | null {
  let resta = d
  for (let i = rastro.length - 1; i > 0; i--) {
    const a = rastro[i], b = rastro[i - 1]
    const seg = Math.hypot(a.x - b.x, a.y - b.y)
    if (seg >= resta) {
      const k = seg === 0 ? 0 : resta / seg
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }
    }
    resta -= seg
  }
  return null
}

/**
 * Como `pontoAtras`, e diz em que trecho caiu: o ponto fica entre
 * `rastro[i - 1]` e `rastro[i]`. `null` se o rastro e curto.
 */
function pontoAtrasNoTrecho(rastro: readonly Ponto[], d: number): { p: Ponto; i: number } | null {
  let resta = d
  for (let i = rastro.length - 1; i > 0; i--) {
    const a = rastro[i], b = rastro[i - 1]
    const seg = Math.hypot(a.x - b.x, a.y - b.y)
    if (seg >= resta) {
      const k = seg === 0 ? 0 : resta / seg
      return { p: { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }, i }
    }
    resta -= seg
  }
  return null
}

/**
 * A linha de `de` ate `ate` nao atravessa nenhuma celula bloqueada da grade.
 * Percorre EXATAMENTE as celulas que a linha cruza (DDA de Amanatides-Woo),
 * consultando o centro de cada uma. Amostrar a linha a cada N px nao servia:
 * rente a uma quina, o mesmo trecho dava livre num quadro e bloqueado no
 * seguinte, e o treinador perdia a ancora do caminho e travava. Com o
 * percurso exato, todo pedaco de um trecho livre tambem e livre.
 */
function linhaLivre(de: Ponto, ate: Ponto, bloqueado: (x: number, y: number) => boolean): boolean {
  const L = COLLISION_GRID_CELL_SIZE
  let cx = Math.floor(de.x / L), cy = Math.floor(de.y / L)
  const fx = Math.floor(ate.x / L), fy = Math.floor(ate.y / L)
  const dx = ate.x - de.x, dy = ate.y - de.y
  const px = dx > 0 ? 1 : -1, py = dy > 0 ? 1 : -1
  const tdx = dx !== 0 ? Math.abs(L / dx) : Infinity
  const tdy = dy !== 0 ? Math.abs(L / dy) : Infinity
  let tmx = dx !== 0 ? ((dx > 0 ? (cx + 1) * L - de.x : de.x - cx * L) / Math.abs(dx)) : Infinity
  let tmy = dy !== 0 ? ((dy > 0 ? (cy + 1) * L - de.y : de.y - cy * L) / Math.abs(dy)) : Infinity
  for (let guarda = 0; guarda < 4096; guarda++) {
    if (bloqueado((cx + 0.5) * L, (cy + 0.5) * L)) return false
    if (cx === fx && cy === fy) return true
    // Proxima fronteira cruzada; passou do fim do trecho (t > 1), acabou.
    if (tmx < tmy) { if (tmx > 1) return true; tmx += tdx; cx += px } else { if (tmy > 1) return true; tmy += tdy; cy += py }
  }
  return true
}

type PokeEmCampo = Ponto & { radius: number; facing?: Ponto }

/**
 * Recuo do treinador atras da bola do proprio lado no duelo de PvP (09/10): a
 * mesma folga do campo (2 quadrados). Na arena (tatame da arte do dragon.jpg)
 * isso poe cada um na borda do tatame, de frente pro outro, como nos jogos.
 */
const RECUO_NO_DUELO = 2 * COLLISION_GRID_CELL_SIZE

/**
 * Onde o treinador fica parado no duelo: atras da bola do lado dele, olhando
 * pro rival. `bola` e o ponto de entrada (centro do POKE); `rival`, a bola do
 * outro lado. Devolve o PE e a direcao.
 */
export function lugarNoDuelo(bola: Ponto, rival: Ponto): { pe: Ponto; olhando: Ponto } {
  const dx = rival.x - bola.x, dy = rival.y - bola.y
  const n = Math.hypot(dx, dy) || 1
  const olhando = { x: dx / n, y: dy / n }
  return {
    pe: { x: bola.x - olhando.x * RECUO_NO_DUELO, y: bola.y - olhando.y * RECUO_NO_DUELO + DO_CENTRO_AO_CHAO },
    olhando,
  }
}

/**
 * Um treinador por `Renderer`: o estado (rastro, quadro da animacao) e de UMA
 * cena. Global, duas cenas na mesma pagina (as bancadas lado a lado) puxariam o
 * mesmo boneco de um mundo pro outro a cada quadro.
 */
export class TreinadorEmCampo {
  /** Nome mostrado em cima do boneco; `null`/vazio nao desenha nada. Quem monta a cena atualiza. */
  nome: string | null = null
  /** Skin (pasta em `assets/treinadores/campo/`); id desconhecido cai na padrao. Quem monta a cena atualiza. */
  skin: string = SKIN_PADRAO

  private e: Estado = { rastro: [], pos: null, facing: { x: 0, y: 1 }, anim: 'Idle', quadro: 0, ticks: 0, parado: 0, seguindo: false, vel: 0, travado: 0 }

  /** Pe do treinador agora (px de mundo), ou `null` se ele nao esta em campo. */
  get pe(): Ponto | null {
    return this.e.pos
  }

  get animacao(): 'Walk' | 'Idle' {
    return this.e.anim
  }

  /** Quadro da animacao atual (0..3 na caminhada). */
  get quadro(): number {
    return this.e.quadro
  }

  private reposicionar(poke: PokeEmCampo, bloqueado?: (x: number, y: number) => boolean): void {
    const f = poke.facing && (poke.facing.x || poke.facing.y) ? poke.facing : { x: 0, y: 1 }
    const n = Math.hypot(f.x, f.y) || 1
    const d = distanciaNoRastro(poke.radius)
    // Atras do POKE, do lado oposto ao que ele olha; o rastro comeca reto ate ele.
    // Se ali for parede (09/10), gira em volta do POKE ate achar chao livre e a
    // vista dele; sem nenhum, fica em cima do POKE (some atras do corpo dele).
    const base = Math.atan2(-f.y / n, -f.x / n)
    let atras = { x: poke.x, y: poke.y }
    for (const giro of [0, 1, -1, 2, -2, 3, -3, 4]) {
      const a = base + giro * (Math.PI / 4)
      const cand = { x: poke.x + Math.cos(a) * d, y: poke.y + Math.sin(a) * d }
      if (!bloqueado || (!bloqueado(cand.x, cand.y) && this.visivel(cand, poke, bloqueado))) { atras = cand; break }
    }
    this.e = {
      rastro: [atras, { x: poke.x, y: poke.y }],
      pos: { x: atras.x, y: atras.y + DO_CENTRO_AO_CHAO },
      facing: { x: f.x / n, y: f.y / n },
      anim: 'Idle', quadro: 0, ticks: 0, parado: 0, seguindo: false, vel: 0, travado: 0,
    }
  }

  /**
   * Duelo de PvP (09/10): fica PARADO no lugar dado, olhando pra `olhando`, so
   * respirando — nao segue o POKE. Zera o rastro: ao voltar pro campo,
   * `atualizar` reposiciona atras do POKE em vez de atravessar o mapa.
   */
  parado(pe: Ponto, olhando: Ponto, dt: number): void {
    const e = this.e
    if (e.anim !== 'Idle') { e.quadro = 0; e.ticks = 0 }
    e.rastro = []
    e.pos = { x: pe.x, y: pe.y }
    e.facing = { x: olhando.x, y: olhando.y }
    e.anim = 'Idle'
    e.parado += dt
    const duracoes = DURACOES.Idle
    e.ticks += dt * 60
    while (e.ticks >= duracoes[e.quadro]) {
      e.ticks -= duracoes[e.quadro]
      e.quadro = (e.quadro + 1) % duracoes.length
    }
  }

  /**
   * Avanca um quadro de desenho. `poke` e o POKE do jogador em campo (`null`
   * fora da hunt): sem ele o treinador some e o rastro zera. `bloqueado` diz se
   * um ponto do mundo e parede (grade de colisao da cena); sem ela, nada bloqueia.
   */
  atualizar(poke: PokeEmCampo | null, dt: number, bloqueado?: (x: number, y: number) => boolean): void {
    const e = this.e
    if (!poke) { e.rastro = []; e.pos = null; return }
    const ultimo = e.rastro[e.rastro.length - 1]
    if (!e.pos || !ultimo || Math.hypot(poke.x - ultimo.x, poke.y - ultimo.y) > SALTO
      || Math.hypot(poke.x - e.pos.x, poke.y - (e.pos.y - DO_CENTRO_AO_CHAO)) > LONGE_DEMAIS) {
      this.reposicionar(poke, bloqueado)
      return
    }
    if (Math.hypot(poke.x - ultimo.x, poke.y - ultimo.y) >= PASSO_DO_RASTRO) e.rastro.push({ x: poke.x, y: poke.y })
    // Parado vendo uma luta longa, o rastro so cresce: teto de ~900 px de caminho
    // (quem precisar de mais esta alem de LONGE_DEMAIS e reaparece atras do POKE).
    // O primeiro ponto fica: e a ancora do caminho de volta (ver a poda abaixo).
    if (e.rastro.length > MAX_PONTOS_NO_RASTRO) e.rastro.splice(1, e.rastro.length - MAX_PONTOS_NO_RASTRO)

    // Tudo em coordenada de CENTRO (a do POKE e a da grade); o pe fica 8 px abaixo.
    const antes = e.pos
    const c = { x: antes.x, y: antes.y - DO_CENTRO_AO_CHAO }
    const d = distanciaNoRastro(poke.radius)
    const longe = Math.hypot(poke.x - c.x, poke.y - c.y)
    if (e.seguindo && longe <= d) e.seguindo = false
    else if (!e.seguindo && longe > d + FOLGA_PRA_SEGUIR) e.seguindo = true

    const velAlvo = e.seguindo ? Math.min(VEL_MAX, VEL_MIN + Math.max(0, longe - d) * VEL_POR_PX_DE_ATRASO) : 0
    e.vel = velAlvo > e.vel ? Math.min(velAlvo, e.vel + ACELERACAO * dt) : Math.max(velAlvo, e.vel - ACELERACAO * 2 * dt)

    let novo = c
    // So anda SEGUINDO: fora disso para na hora, como gente (deslizar freando
    // fazia ele avancar pra dentro da distancia de conforto).
    if (!e.seguindo) e.vel = 0
    if (e.vel > 0) {
      // Meta: o ponto do rastro a `d` atras do POKE (ou ele mesmo, se o rastro
      // e curto). Mira: o ponto MAIS ADIANTADO do rastro que da pra ver em linha
      // reta — corta caminho no aberto e contorna parede pelo caminho do POKE.
      // Mede a partir de onde o POKE ESTA (o ultimo ponto gravado pode ficar ate
      // PASSO_DO_RASTRO atras dele).
      const noTrecho = pontoAtrasNoTrecho([...e.rastro, { x: poke.x, y: poke.y }], d)
      const meta = noTrecho?.p ?? { x: poke.x, y: poke.y }
      // Candidatas: a meta e depois o rastro do mais novo pro mais velho. Vale a
      // primeira que da pra ver em linha reta E cujo passo de agora nao cai em
      // parede (a quina que a amostragem da visada deixa passar).
      const passoAte = (alvo: Ponto): Ponto => {
        const ax = alvo.x - c.x, ay = alvo.y - c.y
        const ate = Math.hypot(ax, ay)
        if (ate <= 0.01) return c
        const anda = Math.min(ate, e.vel * dt)
        return { x: c.x + (ax / ate) * anda, y: c.y + (ay / ate) * anda }
      }
      // Ja dentro de parede (nasceu ali, ou a grade mudou): qualquer saida serve.
      const preso = !!bloqueado && bloqueado(c.x, c.y)
      // Duas passadas: 1a com a visada GORDA (atalho sem raspar na parede); se
      // nenhum ponto passa, a FINA (so seguir o rastro, que pode correr colado
      // na parede).
      const serve = (alvo: Ponto, largura: number): boolean => {
        // Onde ele ja esta nao e mira: passo zero "serve" sempre e ele ficava
        // parado em cima da ancora achando que estava andando.
        if (Math.hypot(alvo.x - c.x, alvo.y - c.y) < 0.5) return false
        if (!bloqueado || preso) return true
        const prox = passoAte(alvo)
        return !bloqueado(prox.x, prox.y) && this.visivel(c, alvo, bloqueado, largura)
      }
      let mira: Ponto | null = null
      let idx = -1
      for (const largura of [LARGURA_DA_VISADA, 0]) {
        if (serve(meta, largura)) { mira = meta; idx = -1; break }
        for (let i = e.rastro.length - 1; i >= 0; i--) {
          if (serve(e.rastro[i], largura)) { mira = e.rastro[i]; idx = i; break }
        }
        if (mira) break
      }
      // Sem atalho: anda NO rastro, ponto a ponto, sem exigir visada. O POKE
      // passou por ali (a regra de colisao dele nao e a celula inteira da grade,
      // entao a visada as vezes reprova o proprio caminho dele e o treinador
      // ficava parado em cima da ancora). O trecho ate rastro[0] tambem vale:
      // ele chegou ali andando em linha reta ate a ancora.
      if (!mira && e.rastro.length > 0) {
        const naAncora = Math.hypot(e.rastro[0].x - c.x, e.rastro[0].y - c.y) < 0.5
        idx = naAncora && e.rastro.length > 1 ? 1 : 0
        mira = e.rastro[idx]
      }
      if (mira) {
        e.travado = 0
        // Poda: o rastro passa a COMECAR na mira. Ele anda em linha reta ate
        // ela, entao no quadro seguinte ela continua a vista — sempre sobra um
        // caminho de volta pro rastro. (Podar pelo ponto "mais perto" em linha
        // reta jogava fora o caminho de verdade quando o mais perto ficava do
        // outro lado de uma parede fina, e ele travava encurralado.)
        if (idx >= 0) e.rastro.splice(0, idx)
        else if (noTrecho) e.rastro.splice(0, noTrecho.i, { x: meta.x, y: meta.y })
        novo = passoAte(mira)
        const chegou = mira === meta && Math.hypot(meta.x - novo.x, meta.y - novo.y) <= 0.01
        // Chegou na distancia de conforto (ou na meta): para ali, sem passo no lugar.
        if (Math.hypot(poke.x - novo.x, poke.y - novo.y) <= d || chegou) { e.seguindo = false; e.vel = 0 }
      }
      // Sem mira nenhuma (encurralado): espera um instante; preso, reaparece atras do POKE.
      else {
        e.travado += dt
        if (e.travado > TRAVADO_POR) { this.reposicionar(poke, bloqueado); return }
      }
    }
    e.pos = { x: novo.x, y: novo.y + DO_CENTRO_AO_CHAO }

    const dx = e.pos.x - antes.x, dy = e.pos.y - antes.y
    const passo = Math.hypot(dx, dy)
    const andou = passo > 0.05
    if (andou) {
      e.parado = 0
      // Direcao suavizada: o rastro tem quinas de 1 px, e seguir cada uma fazia
      // a linha do sprite (8 direcoes) trocar quadro a quadro.
      const n = Math.hypot(e.facing.x, e.facing.y) || 1
      e.facing = {
        x: (e.facing.x / n) * (1 - SUAVIZA_DIRECAO) + (dx / passo) * SUAVIZA_DIRECAO,
        y: (e.facing.y / n) * (1 - SUAVIZA_DIRECAO) + (dy / passo) * SUAVIZA_DIRECAO,
      }
    } else {
      e.parado += dt
      // Parado, fica de olho no POKE (vira devagar; perto demais nao mexe).
      const ox = poke.x - c.x, oy = poke.y - c.y
      const on = Math.hypot(ox, oy)
      if (on > 4) {
        const n = Math.hypot(e.facing.x, e.facing.y) || 1
        e.facing = {
          x: (e.facing.x / n) * (1 - SUAVIZA_OLHAR) + (ox / on) * SUAVIZA_OLHAR,
          y: (e.facing.y / n) * (1 - SUAVIZA_OLHAR) + (oy / on) * SUAVIZA_OLHAR,
        }
      }
      // Parou no meio do passo: fecha as pernas no NEUTRO (quadros pares) em vez
      // de congelar de perna aberta durante a folga.
      if (e.anim === 'Walk' && e.quadro % 2 === 1) { e.quadro -= 1; e.ticks = 0 }
    }
    const anim = andou || (e.anim === 'Walk' && e.parado < FOLGA_PRA_PARAR) ? 'Walk' : 'Idle'
    if (anim !== e.anim) { e.anim = anim; e.quadro = 0; e.ticks = 0 }
    const duracoes = DURACOES[e.anim]
    if (e.anim === 'Walk') {
      e.ticks += passo
      while (e.ticks >= PX_POR_QUADRO_DE_PASSO[e.quadro]) {
        e.ticks -= PX_POR_QUADRO_DE_PASSO[e.quadro]
        e.quadro = (e.quadro + 1) % duracoes.length
      }
    } else {
      e.ticks += dt * 60
      while (e.ticks >= duracoes[e.quadro]) {
        e.ticks -= duracoes[e.quadro]
        e.quadro = (e.quadro + 1) % duracoes.length
      }
    }
  }

  /**
   * Faixa de `de` ate `ate` sem parede: a linha do meio e, com `largura`, duas
   * paralelas a essa distancia de cada lado (o corpo do boneco).
   */
  private visivel(de: Ponto, ate: Ponto, bloqueado: (x: number, y: number) => boolean, largura = 0): boolean {
    if (!linhaLivre(de, ate, bloqueado)) return false
    if (largura <= 0) return true
    const dx = ate.x - de.x, dy = ate.y - de.y
    const dist = Math.hypot(dx, dy)
    if (dist < 0.01) return true
    const nx = (-dy / dist) * largura, ny = (dx / dist) * largura
    return linhaLivre({ x: de.x + nx, y: de.y + ny }, { x: ate.x + nx, y: ate.y + ny }, bloqueado)
      && linhaLivre({ x: de.x - nx, y: de.y - ny }, { x: ate.x - nx, y: ate.y - ny }, bloqueado)
  }

  /** Desenha o treinador (sombra + sprite). Coordenada de mundo, camera ja aplicada. */
  desenhar(ctx: CanvasRenderingContext2D): void {
    const { pos, anim, quadro, facing } = this.e
    if (!pos) return
    ctx.save()
    ctx.globalAlpha = 0.3
    ctx.fillStyle = '#000000'
    ctx.beginPath()
    ctx.ellipse(pos.x, pos.y, 7, 2.5, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    // Nome antes da sprite: com a imagem ainda carregando, o nome ja aparece.
    this.desenharNome(ctx, pos)
    const img = imagem(folhaDaSkin(this.skin, anim))
    if (!img || !img.complete || img.naturalWidth === 0) return
    const linha = directionRowFromFacing(facing)
    const suave = ctx.imageSmoothingEnabled
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(
      img, quadro * QUADRO_L, linha * QUADRO_A, QUADRO_L, QUADRO_A,
      Math.round(pos.x - QUADRO_L / 2), Math.round(pos.y - PE_NO_QUADRO), QUADRO_L, QUADRO_A,
    )
    ctx.imageSmoothingEnabled = suave
  }

  /** Nome em cima do bone, no mesmo estilo da placa dos POKE (contorno preto). */
  private desenharNome(ctx: CanvasRenderingContext2D, pos: Ponto): void {
    const nome = this.nome?.trim()
    if (!nome) return
    const y = Math.round(pos.y - ALTURA_DO_BONECO - 4)
    ctx.save()
    ctx.font = FONTE.nomeDaEspecie
    ctx.textAlign = 'center'
    ctx.lineWidth = 3
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#000000'
    ctx.strokeText(nome, pos.x, y)
    ctx.fillStyle = COR_DO_NOME
    ctx.fillText(nome, pos.x, y)
    ctx.restore()
  }
}
