// Detalhes que a DESCRIÇÃO de cada golpe pede e que a forma da família não
// mostrava (09/10): crítico fácil, status que sobe ou cai, susto, queda,
// 1 de HP do False Swipe... Desenhado por cima da coreografia do golpe, numa
// janela em volta do contato. Usa rng próprio (semeado pelo id do golpe) pra
// não desalinhar o sorteio da coreografia.
import { emitirParticulas } from '../particulas'
import { entrada, estrelaDeImpacto, limitar, saida } from '../primitivas'
import { hashTexto, rngSemeado } from '../aleatorio'
import { BRANCO, CORES_DE_HP, ESCURO, barraDeHp, bola, brilho, entrePontos, janela, nuvem, poligono, setasDeStatus, susto } from './formas'
import { PELES } from '../paletas'
import type { ContextoVfx, Ponto } from '../tipos'

const AZUL = '#58a6f0', VERMELHO = '#e0303a', AMARELO = '#ffd23a', LARANJA = '#ff9a3a'
/** Cores que os detalhes usam: entram na paleta de quem chama `secundario`. */
export const CORES_SECUNDARIAS = [AZUL, VERMELHO, AMARELO, LARANJA, ...CORES_DE_HP,
  PELES.GROUND.base, PELES.GROUND.meio, PELES.GROUND.contorno, PELES.POISON.base, PELES.POISON.meio, PELES.POISON.contorno]

/** Brilho de crítico: estrela amarela de 4 pontas piscando no canto do impacto. */
function critico(ctx: CanvasRenderingContext2D, alvo: Ponto, t: number): void {
  if (t < .5) brilho(ctx, alvo.x + 10, alvo.y - 13, 4.4 * (1 - t / .5), AMARELO)
}

/** Contorno de um vulto (imagem residual) em `p`. */
function residuo(ctx: CanvasRenderingContext2D, p: Ponto, r: number): void {
  ctx.strokeStyle = ESCURO; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r * .85, 0, 0, Math.PI * 2); ctx.stroke()
  ctx.strokeStyle = BRANCO; ctx.lineWidth = 1; ctx.stroke()
}

/** Garra enorme de dragão (três unhas curvas) erguida acima do alvo. */
function garraGigante(ctx: CanvasRenderingContext2D, p: Ponto, s: number, cor: string, luz: string): void {
  ctx.save(); ctx.translate(p.x, p.y); ctx.scale(s, s)
  for (const [x, a] of [[-7, -.4], [0, 0], [7, .4]] as const) {
    ctx.save(); ctx.translate(x, 0); ctx.rotate(a + Math.PI)
    poligono(ctx, [[-3.4, 0], [3.4, 0], [2.6, 10], [-1, 17], [.4, 10]], ESCURO)
    poligono(ctx, [[-2.2, 1], [2.2, 1], [1.6, 9.4], [-.6, 15], [-.2, 9.4]], cor)
    poligono(ctx, [[-.6, 8], [.8, 8], [-.4, 14]], luz)
    ctx.restore()
  }
  ctx.fillStyle = ESCURO; ctx.beginPath(); ctx.ellipse(0, 2, 12, 6, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = cor; ctx.beginPath(); ctx.ellipse(0, 1.6, 10.6, 4.8, 0, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
}

/**
 * Desenha os detalhes do golpe `id`. `contato` é o ms do primeiro acerto
 * (o mesmo `impactos` da entrada).
 */
export function secundario(id: string, c: ContextoVfx, contato: number): void {
  const { ctx, ms, origem, alvo, pele } = c
  const rng = rngSemeado(hashTexto(id))
  const centro = { x: alvo.x, y: alvo.y - 3 }
  const t = janela(ms, contato, 260)
  const k = t === null ? 0 : saida(limitar(t / .2)) * (1 - entrada(limitar((t - .75) / .25)))
  const antes = janela(ms, contato - 140, 140)
  switch (id) {
    // --- Garra ---
    case 'crush_claw': if (t !== null) setasDeStatus(ctx, alvo, t, AZUL, 1, true); break // "may lower Defense"
    case 'metal_claw': if (t !== null) setasDeStatus(ctx, origem, t, VERMELHO, 1); break // "may raise the user's Attack"
    case 'shadow_claw': if (t !== null) critico(ctx, alvo, t); break // "critical hits land more easily"
    case 'dragon_claw':
      // "huge sharp claws": a garra enorme aparece acima do alvo antes do rasgo.
      if (antes !== null) garraGigante(ctx, { x: centro.x, y: centro.y - 18 + 8 * saida(antes) }, .9 + antes * .2, pele.base, pele.nucleo)
      break
    case 'false_swipe':
      // "the target is left with at least 1 HP": a barra cai até sobrar um tiquinho vermelho.
      if (t !== null) barraDeHp(ctx, { x: alvo.x, y: alvo.y + 17 }, 1 - .96 * saida(limitar(t / .5)))
      break

    // --- Lâmina ---
    case 'slash': case 'karate_chop': case 'cross_chop': case 'psycho_cut':
      if (t !== null) critico(ctx, alvo, t)
      break
    case 'night_slash':
      // "the instant an opportunity arises": um brilho de olho na sombra, e o corte.
      if (antes !== null && antes < .6) brilho(ctx, centro.x + 12, centro.y - 6, 2.4, VERMELHO)
      if (t !== null) critico(ctx, alvo, t)
      break
    case 'aerial_ace':
      // "confounds the target with speed": imagens residuais em volta do alvo antes do corte.
      if (antes !== null) for (let i = 0; i < 3; i++) {
        const a = i * 2.1 + antes * 3
        if (antes > i * .25) residuo(ctx, { x: centro.x + Math.cos(a) * 16, y: centro.y + Math.sin(a) * 10 }, 6)
      }
      break
    case 'razor_shell': if (t !== null) setasDeStatus(ctx, alvo, t, AZUL, 1, true); break // "may lower Defense"
    case 'fury_cutter':
      // "becomes more powerful if it hits in succession": degraus que sobem.
      if (t !== null) for (let i = 0; i < 3; i++) {
        const s = k * (1 + i * .35), x = alvo.x + 10 + i * 4, y = alvo.y - 8 - i * 4
        poligono(ctx, [[x - 2.4 * s, y + 1.4 * s], [x, y - 1.6 * s], [x + 2.4 * s, y + 1.4 * s], [x + 1.4 * s, y + 1.4 * s], [x, y], [x - 1.4 * s, y + 1.4 * s]], i === 2 ? AMARELO : BRANCO)
      }
      break
    case 'cross_poison':
      if (t !== null) {
        critico(ctx, alvo, t)
        for (let i = 0; i < 3; i++) { const v = (t * 1.6 + i * .33) % 1; bola(ctx, { x: alvo.x + (i - 1) * 7, y: alvo.y + 4 - v * 16 }, 2 * (1 - v) * k + .3, PELES.POISON) }
      }
      break

    // --- Chute ---
    case 'jump_kick': case 'high_jump_kick': {
      // "jumps up high": poeira de impulso no chão, de onde saltou.
      const pulo = janela(ms, 0, 160)
      if (pulo !== null) nuvem(ctx, { x: origem.x, y: origem.y + 11 }, pulo, 4, 8, PELES.GROUND, rng)
      break
    }
    case 'rolling_kick': case 'stomp': susto(ctx, alvo, k); break // "may make the target flinch"
    case 'low_kick':
      // "makes the target fall over": linhas de queda inclinadas e estrela no chão.
      if (t !== null) {
        for (let i = 0; i < 3; i++) poligono(ctx, [[alvo.x - 6 + i * 6, alvo.y - 12 + t * 6], [alvo.x - 4 + i * 6, alvo.y - 12 + t * 6], [alvo.x + 2 + i * 6, alvo.y - 2 + t * 6], [alvo.x + i * 6, alvo.y - 2 + t * 6]], BRANCO)
        estrelaDeImpacto(ctx, { x: alvo.x + 8, y: alvo.y + 10 }, 7, limitar((t - .3) / .7), pele, rng)
      }
      break
    case 'low_sweep': if (t !== null) setasDeStatus(ctx, alvo, t, AZUL, 1, true); break // "lowers the target's Speed"
    case 'mega_kick':
      // "muscle-packed power": veias de força laranja pulsando na perna antes do chute.
      if (antes !== null) for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + .4, r = 7 + 5 * antes + (Math.floor(ms / 50) % 2)
        const p = { x: origem.x, y: origem.y + 6 }
        poligono(ctx, [[p.x + Math.cos(a) * r, p.y + Math.sin(a) * r * .7], [p.x + Math.cos(a + .2) * (r + 5), p.y + Math.sin(a + .2) * (r + 5) * .7], [p.x + Math.cos(a - .2) * (r + 5), p.y + Math.sin(a - .2) * (r + 5) * .7]], LARANJA)
      }
      break
    case 'blaze_kick':
      // "critical hit more easily; may burn".
      if (t !== null) { critico(ctx, alvo, t); if (k > .1) emitirParticulas(ctx, pele, { x: alvo.x - 9, y: alvo.y - 12 }, 1, 2, (t * 2) % 1, 4 * k, rng) }
      break
    case 'stomping_tantrum':
      // "driven by frustration": veia de raiva vermelha pulsando em quem pisa.
      if (ms < contato + 200) {
        const s = 1.4 + (Math.floor(ms / 90) % 2) * .2, p = entrePontos(origem, { x: origem.x + 8, y: origem.y - 16 }, 1)
        ctx.save(); ctx.translate(p.x, p.y); ctx.scale(s, s)
        for (let i = 0; i < 4; i++) {
          ctx.rotate(Math.PI / 2)
          poligono(ctx, [[1.2, -1.2], [5.6, -3.6], [6.6, -1.4], [3, -.2]], ESCURO)
          poligono(ctx, [[1.8, -1.4], [5.2, -3], [5.8, -1.6], [3, -.8]], VERMELHO)
        }
        ctx.restore()
      }
      break
  }
}
