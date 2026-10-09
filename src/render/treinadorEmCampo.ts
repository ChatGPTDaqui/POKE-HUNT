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
// Sprite (08/10): arte enviada pelo dono (folha 4x8, JPEG ampliado ~3,25x com
// fundo branco), convertida pro formato das folhas dos POKE — 8 linhas de
// direcao na ordem do PMD x 4 quadros, quadro 32x40, pe na linha 37. Na
// conversao: fundo tirado por preenchimento a partir da borda (o branco do bone
// e das mangas fica), reducao por moda de cor em blocos de 3,25 px, paleta de
// 18 cores. A arte so tinha lados ESQUERDOS (linhas 1, 2 e 4 da original:
// baixo-esq, esq, cima-esq); os direitos sao espelho. Idle = quadro 0 parado.
// (A v1/v2 gerada por script, colete azul, saiu junto com o gerador.)
import { COLLISION_GRID_CELL_SIZE } from '@/data/collisionConstants'
import { directionRowFromFacing } from '@/engine/systems/animationSystem'

type Ponto = { x: number; y: number }

/** Espaco ENTRE o POKE e o treinador: 2 quadrados da grade. */
export const ESPACO_DO_TREINADOR = 2 * COLLISION_GRID_CELL_SIZE
/** Meia largura do corpo do boneco (px de mundo), pra o espaco ser entre os corpos. */
const RAIO_DO_TREINADOR = 6
/** Do centro do POKE ate o chao — o boneco pisa no mesmo chao que ele. */
const DO_CENTRO_AO_CHAO = 8
/** Salto maior que isto num quadro (troca de sala, reconstrucao) reposiciona sem andar. */
const SALTO = 120

const QUADRO_L = 32, QUADRO_A = 40
/** Linha do pe dentro do quadro. */
const PE_NO_QUADRO = 37
/**
 * Px de caminho por quadro de caminhada (08/10, "movimentos fluidos"). A
 * caminhada avanca pela DISTANCIA andada, e nao pelo relogio: com o relogio, o
 * passo seguia no mesmo ritmo com o POKE devagar ou rapido, e o pe escorregava
 * no chao. Por distancia, cada passo cobre sempre o mesmo chao.
 */
const PX_POR_QUADRO_DE_PASSO = 5
/** Parado por pelo menos isto (s) pra voltar a pose em pe — sem pisca andar/parar. */
const FOLGA_PRA_PARAR = 0.15
/** Quanto a direcao segue o movimento por quadro (0..1): vira suave, sem tremer de linha. */
const SUAVIZA_DIRECAO = 0.25

interface Anim { url: string; duracoes: number[] }
const ANIMS: Record<'Walk' | 'Idle', Anim> = {
  Walk: { url: 'assets/treinadores/campo/bone-vermelho/Walk-Anim.png', duracoes: [8, 8, 8, 8] },
  // Idle (08/10): pose EM PE montada da folha (pes juntos sob o corpo), e o
  // segundo quadro desce o tronco 1 px — respiracao lenta.
  Idle: { url: 'assets/treinadores/campo/bone-vermelho/Idle-Anim.png', duracoes: [50, 50] },
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
}

/** Distancia do centro do POKE ate o pe do treinador, medida ao longo do rastro. */
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

type PokeEmCampo = Ponto & { radius: number; facing?: Ponto }

/**
 * Um treinador por `Renderer`: o estado (rastro, quadro da animacao) e de UMA
 * cena. Global, duas cenas na mesma pagina (as bancadas lado a lado) puxariam o
 * mesmo boneco de um mundo pro outro a cada quadro.
 */
export class TreinadorEmCampo {
  private e: Estado = { rastro: [], pos: null, facing: { x: 0, y: 1 }, anim: 'Idle', quadro: 0, ticks: 0, parado: 0 }

  /** Pe do treinador agora (px de mundo), ou `null` se ele nao esta em campo. */
  get pe(): Ponto | null {
    return this.e.pos
  }

  get animacao(): 'Walk' | 'Idle' {
    return this.e.anim
  }

  private reposicionar(poke: PokeEmCampo): void {
    const f = poke.facing && (poke.facing.x || poke.facing.y) ? poke.facing : { x: 0, y: 1 }
    const n = Math.hypot(f.x, f.y) || 1
    const d = distanciaNoRastro(poke.radius)
    // Atras do POKE, do lado oposto ao que ele olha; o rastro comeca reto ate ele.
    const atras = { x: poke.x - (f.x / n) * d, y: poke.y - (f.y / n) * d }
    this.e = {
      rastro: [atras, { x: poke.x, y: poke.y }],
      pos: { x: atras.x, y: atras.y + DO_CENTRO_AO_CHAO },
      facing: { x: f.x / n, y: f.y / n },
      anim: 'Idle', quadro: 0, ticks: 0, parado: 0,
    }
  }

  /**
   * Avanca um quadro de desenho. `poke` e o POKE do jogador em campo (`null`
   * fora da hunt): sem ele o treinador some e o rastro zera.
   */
  atualizar(poke: PokeEmCampo | null, dt: number): void {
    const e = this.e
    if (!poke) { e.rastro = []; e.pos = null; return }
    const ultimo = e.rastro[e.rastro.length - 1]
    if (!e.pos || !ultimo || Math.hypot(poke.x - ultimo.x, poke.y - ultimo.y) > SALTO) {
      this.reposicionar(poke)
      return
    }
    if (Math.hypot(poke.x - ultimo.x, poke.y - ultimo.y) >= 1) e.rastro.push({ x: poke.x, y: poke.y })

    const d = distanciaNoRastro(poke.radius)
    const alvo = pontoAtras(e.rastro, d)
    const antes = e.pos
    if (alvo) {
      e.pos = { x: alvo.x, y: alvo.y + DO_CENTRO_AO_CHAO }
      // Poda: so precisa do caminho ate o treinador (com folga).
      let total = 0
      for (let i = e.rastro.length - 1; i > 0; i--) {
        total += Math.hypot(e.rastro[i].x - e.rastro[i - 1].x, e.rastro[i].y - e.rastro[i - 1].y)
        if (total > d + 40) { e.rastro.splice(0, i - 1); break }
      }
    }

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
    }
    const anim = andou || (e.anim === 'Walk' && e.parado < FOLGA_PRA_PARAR) ? 'Walk' : 'Idle'
    if (anim !== e.anim) { e.anim = anim; e.quadro = 0; e.ticks = 0 }
    const duracoes = ANIMS[e.anim].duracoes
    if (e.anim === 'Walk') {
      e.ticks += passo
      while (e.ticks >= PX_POR_QUADRO_DE_PASSO) {
        e.ticks -= PX_POR_QUADRO_DE_PASSO
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
    const img = imagem(ANIMS[anim].url)
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
}
