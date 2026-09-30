// PILOTO do metodo novo: Flamethrower desenhado na grade de pixel.
//
// Storyboard (aprovar antes de polir):
//   1. ANTECIPACAO  0–130   brasa incha na boca em degraus; 4 fagulhas sao
//                           sugadas pra dentro.
//   2. DISPARO    130–200   o jato ESTALA ate o alvo em 70 ms, cabeca de bola.
//   3. CONTATO    200–650   estrela branca de 1 quadro; o jato respira em
//                           pulsos que viajam da boca ao alvo; o fogo bate no
//                           corpo e ESPIRRA pra cima e pra tras em linguas.
//   4. CORTE      650–760   a boca solta o jato, o rabo voa pro alvo e as
//                           linguas no corpo dao o ultimo estouro.
//   5. RESCALDO   760–1150  as linguas encolhem uma a uma; fumaca em bolotas
//                           sobe; fagulhas soltas.
//
// Hierarquia: o JATO e a forma principal; o espirro no alvo e a secundaria;
// fagulha e fumaca sao detalhe. Tremida em degraus de 60 ms (animacao "em
// dois", como pixel art feito a mao), movimento de viagem continuo.
import { CampoDePixels, ruido, type Faixa } from '../campoDePixels'
import { NEUTROS } from '../paletas'
import { limitar, saida, entrada } from '../primitivas'
import type { ContextoVfx, EntradaDeCoreografia, Pele, Ponto } from '../tipos'

const FORA = 9
const BRANCO = NEUTROS[1]

const CARGA_FIM = 130
const CHEGADA = 200
const CORTE = 650
const CORTE_FIM = 760
const DURACAO = 1150
/** A tremida anda em degraus deste tamanho: pose segurada, nao deslizada. */
const DEGRAU = 60

function faixasDoFogo(p: Pele): Faixa[] {
  return [{ ate: 0.12, cor: BRANCO }, { ate: 0.4, cor: p.nucleo }, { ate: 0.7, cor: p.meio }, { ate: 1, cor: p.base }]
}

/**
 * Lingua de fogo: bojo redondo embaixo, ponta fina curvada. `ang` e pra onde a
 * ponta aponta; `curva` entorta a ponta pro lado (-1..1).
 */
function lingua(
  campo: CampoDePixels, bx: number, by: number, ang: number, alt: number, larg: number, curva: number, tomBase = 0.18,
): void {
  if (alt <= 0.5 || larg <= 0.3) return
  const ax = Math.cos(ang), ay = Math.sin(ang)
  const m = alt + larg + 2
  campo.forma(bx - m, by - m, bx + m, by + m, (x, y) => {
    const dx = x - bx, dy = y - by
    const s = dx * ax + dy * ay
    if (s < -larg || s > alt) return FORA
    const q = -dx * ay + dy * ax
    const sn = Math.max(0, s) / alt
    const cq = curva * sn * sn * alt * 0.35
    const hw = s < 0 ? larg * Math.sqrt(1 - (s / larg) ** 2) : larg * (1 - sn) ** 1.15
    const dn = Math.abs(q - cq) / hw
    return dn < 1 ? tomBase + 0.5 * dn ** 1.3 + 0.62 * sn : FORA
  })
}

/** Estrela de 4 pontas (astroide): o quadro branco do impacto. */
function estrela(campo: CampoDePixels, cx: number, cy: number, r: number): void {
  if (r < 1) return
  campo.forma(cx - r - 1, cy - r - 1, cx + r + 1, cy + r + 1, (x, y) => {
    const v = (Math.abs(x - cx) / r) ** (2 / 3) + (Math.abs(y - cy) / r) ** (2 / 3)
    return v < 1 ? v * 0.45 : FORA
  })
}

interface Jato { a: Ponto; dx: number; dy: number; u0: number; u1: number; largura: number; ms: number; pulsos: readonly number[] }

/**
 * O jato: afina na boca, engrossa no alvo, borda serrilhada de linguas que
 * apontam PRA TRAS (o fogo e arrastado pelo proprio jato) e correm pra frente.
 * O lado de cima e mais alto que o de baixo — fogo sobe.
 */
function jato(campo: CampoDePixels, j: Jato): void {
  const { a, dx, dy, u0, u1, largura, ms, pulsos } = j
  if (u1 - u0 < 0.5) return
  const nx = -dy, ny = dx
  const pa = { x: a.x + dx * u0, y: a.y + dy * u0 }, pb = { x: a.x + dx * u1, y: a.y + dy * u1 }
  const m = largura * 2 + 4
  const passo = Math.floor(ms / DEGRAU)
  campo.forma(Math.min(pa.x, pb.x) - m, Math.min(pa.y, pb.y) - m, Math.max(pa.x, pb.x) + m, Math.max(pa.y, pb.y) + m, (x, y) => {
    const rx = x - a.x, ry = y - a.y
    const u = rx * dx + ry * dy
    if (u < u0 - 1 || u > u1 + 1) return FORA
    let v = rx * nx + ry * ny
    // Perfil: fino na boca, cheio no fim.
    let hw = 1.3 + (largura - 1.3) * Math.sqrt(limitar(u / Math.max(1, u1)))
    for (const p of pulsos) hw *= 1 + 0.45 * Math.exp(-(((u - p) / 3.2) ** 2))
    // Borda em BOLOTAS de 9 px (fogo rola, nao espeta), correndo pra frente em degraus.
    const cima = v * (dx >= 0 ? 1 : -1) < 0
    const fase = (u - passo * 4.5) / 9 + (cima ? 0 : 0.5)
    const bolota = 0.5 + 0.5 * Math.cos(fase * Math.PI * 2)
    hw += (cima ? 1.7 : 1) * bolota * limitar(u / 8)
    if (cima) hw *= 1.12
    else v *= 1.08
    const dn = Math.abs(v) / hw
    if (dn >= 1) return FORA
    // Mais quente perto da boca e no eixo.
    return 0.2 + 0.62 * dn ** 1.4 + 0.12 * limitar(u / 40)
  })
}

/** Bolota de fumaca: 3 bolas, luz em cima-esquerda. `r` = 0 some. */
function fumaca(campo: CampoDePixels, cx: number, cy: number, r: number): void {
  if (r < 0.8) return
  const lx = cx - r * 0.4, ly = cy - r * 0.45
  const bolas = [[cx, cy, r], [cx - r * 0.75, cy + r * 0.35, r * 0.7], [cx + r * 0.7, cy + r * 0.3, r * 0.65]] as const
  campo.forma(cx - r * 2, cy - r * 1.5, cx + r * 2, cy + r * 1.6, (x, y) => {
    for (const [bx, by, br] of bolas) {
      if ((x - bx) ** 2 + (y - by) ** 2 < br * br) return 0.25 + Math.hypot(x - lx, y - ly) / (r * 2.1)
    }
    return FORA
  })
}

/** Uma lingua do espirro no alvo, relativa ao ponto de contato. */
interface Espirro { dx: number; dy: number; alt: number; larg: number; inclina: number; nasce: number; morre: number }

function flamethrower(c: ContextoVfx): void {
  const { ctx, ms, origem, alvo, pele, rng } = c
  // Sorteios, todos no topo e sempre na mesma ordem.
  const angFagulhas = Array.from({ length: 6 }, () => rng() * Math.PI * 2)
  const semBrasas = Array.from({ length: 6 * 3 }, rng)
  const ladoFumaca = Array.from({ length: 3 }, rng)

  const dir = Math.atan2(alvo.y - origem.y, alvo.x - origem.x)
  const dx = Math.cos(dir), dy = Math.sin(dir)
  const boca = { x: origem.x + dx * 9, y: origem.y + dy * 9 - 2 }
  // Contato: a frente do corpo, nao o peito.
  const contato = { x: alvo.x - dx * 6, y: alvo.y - dy * 6 }
  const L = Math.max(4, Math.hypot(contato.x - boca.x, contato.y - boca.y))
  const jx = (contato.x - boca.x) / L, jy = (contato.y - boca.y) / L
  const passo = Math.floor(ms / DEGRAU)
  // "Pra tras" do alvo: o fogo e empurrado no sentido do jato.
  const tras = dx >= 0 ? 1 : -1

  const xa = Math.min(origem.x, alvo.x) - 34, xb = Math.max(origem.x, alvo.x) + 34
  const ya = Math.min(origem.y, alvo.y) - 34, yb = Math.max(origem.y, alvo.y) + 34

  // ---- Fumaca (atras de tudo) --------------------------------------------
  const fum = new CampoDePixels(xa, ya, xb, yb, 1)
  for (let i = 0; i < 2; i++) {
    const t0 = 800 + i * 120, vida = 330
    const t = (ms - t0) / vida
    if (t < 0 || t > 1) continue
    const r = t < 0.35 ? 2 + 3.5 * saida(t / 0.35) : 5.5 * (1 - entrada((t - 0.35) / 0.65))
    const zig = (Math.floor(t * 6) % 2 ? 1 : -1) * 0.8
    fumaca(fum, contato.x + tras * (3 + ladoFumaca[i] * 6) + zig, contato.y - 12 - 16 * saida(t), r)
  }
  const [, fMeio, fClaro] = pele.acento ?? [pele.contorno, pele.base, pele.meio]
  fum.pintar(ctx, [{ ate: 0.8, cor: fClaro }, { ate: 1, cor: fMeio }])

  // ---- Fogo ---------------------------------------------------------------
  const fogo = new CampoDePixels(xa, ya, xb, yb, 0)

  // 1. Antecipacao: brasa em degraus + fagulhas sugadas.
  if (ms < CARGA_FIM) {
    const k = ms / CARGA_FIM
    fogo.bola(boca.x, boca.y, [1.5, 2.5, 3.5, 4.5, 5.5][Math.min(4, Math.floor(k * 5))], 0.02)
    for (const a of angFagulhas) {
      const d = 17 * (1 - saida(k))
      fogo.bola(boca.x + Math.cos(a) * d, boca.y + Math.sin(a) * d * 0.8, 0.9, 0.3)
    }
  }

  // 2–4. Jato: estala ate o alvo, respira, e solta da boca no corte.
  if (ms >= CARGA_FIM && ms < CORTE_FIM) {
    const u1 = ms < CHEGADA ? L * saida((ms - CARGA_FIM) / (CHEGADA - CARGA_FIM)) : L
    const u0 = ms < CORTE ? 0 : L * entrada((ms - CORTE) / (CORTE_FIM - CORTE))
    // Pulsos: um a cada 90 ms, viajando 0,4 un/ms.
    const pulsos: number[] = []
    for (let t0 = CHEGADA; t0 < CORTE; t0 += 90) {
      const u = (ms - t0) * 0.4
      if (u >= 0 && u <= L) pulsos.push(u)
    }
    jato(fogo, { a: boca, dx: jx, dy: jy, u0, u1, largura: 3.6, ms, pulsos })
    // Cabeca: bola cheia na frente enquanto viaja.
    if (ms < CHEGADA + 40) fogo.bola(boca.x + jx * u1, boca.y + jy * u1, 5.2, 0.16)
    // Chama de boca: a fonte do jato, pulsando em degraus.
    if (ms < CORTE) fogo.bola(boca.x, boca.y, 2.6 + (passo % 2) * 0.7, 0.1)
  }

  // 3. Espirro no alvo: linguas pra cima e pra tras do corpo.
  const espirros: readonly Espirro[] = [
    { dx: 2, dy: -3, alt: 17, larg: 5, inclina: 0.3, nasce: 0, morre: 2 },
    { dx: 8, dy: -1, alt: 12, larg: 4, inclina: 0.85, nasce: 1, morre: 1 },
    { dx: -3, dy: -2, alt: 9, larg: 3.4, inclina: -0.25, nasce: 2, morre: 0 },
  ]
  if (ms >= CHEGADA) {
    // Massa no contato: as linguas nascem DELA, nao do nada.
    const cresce = saida(limitar((ms - CHEGADA) / 80))
    const some = 1 - entrada(limitar((ms - 820) / 200))
    const estouro = 1 + 0.35 * Math.sin(Math.PI * limitar((ms - CORTE) / 220))
    fogo.bola(contato.x + tras * 3, contato.y + 1, (6 + (passo % 2)) * cresce * some * estouro, 0.14)
    espirros.forEach((e, i) => {
      const cresce = saida(limitar((ms - CHEGADA - e.nasce * 25) / 90))
      const treme = 0.82 + 0.36 * ruido(passo * 7 + i)
      const estouro = 1 + 0.55 * Math.sin(Math.PI * limitar((ms - CORTE) / 220))
      const morre = 1 - entrada(limitar((ms - 800 - e.morre * 55) / 170))
      const alt = e.alt * cresce * treme * estouro * morre
      const curva = (ruido(passo * 3 + i * 5) < 0.5 ? -1 : 1) * 0.9
      lingua(fogo, contato.x + tras * e.dx, contato.y + e.dy, -Math.PI / 2 + tras * e.inclina, alt, e.larg * Math.min(1, morre * 1.5), curva)
    })
  }

  // Impacto: estrela branca curta (2 degraus), por cima de tudo no tom.
  if (ms >= CHEGADA && ms < CHEGADA + 70) estrela(fogo, contato.x, contato.y, ms < CHEGADA + 35 ? 11 : 6)

  // 5. Fagulhas soltas: sobem em zigue-zague segurado.
  for (let i = 0; i < 6; i++) {
    const t0 = 640 + i * 70, vida = 420
    const t = (ms - t0) / vida
    if (t < 0 || t > 1) continue
    const s0 = semBrasas[i * 3], s1 = semBrasas[i * 3 + 1], s2 = semBrasas[i * 3 + 2]
    const zig = (Math.floor(t * 5 + s2 * 2) % 2 ? 1 : -1) * 1.5
    fogo.bola(contato.x + tras * (s0 * 14 - 3) + zig, contato.y - 4 - s1 * 6 - 22 * saida(t), t < 0.7 ? 0.9 : 0.6, 0.3)
  }

  fogo.pintar(ctx, faixasDoFogo(pele), pele.contorno)
}

export const FLAMETHROWER_PILOTO: EntradaDeCoreografia = {
  desenhar: flamethrower, duracao: { 3: DURACAO }, alcance: 34, impactos: { 3: [CHEGADA] },
}
