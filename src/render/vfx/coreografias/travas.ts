// Travas (13/11): quatro golpes de status que mexem no ÚLTIMO GOLPE do alvo.
// Décima quinta família de golpes de status com efeito próprio.
//
// Cada um parte da descrição do jogo, e a forma é do golpe, não da família:
//   Disable a carta do último golpe aparece e uma tranca bate em cima dela ·
//   Torment dois tridentes cutucam o alvo alternados, sem parar · Spite quatro
//   pontos de PP acima do alvo são roídos um a um por um fiapo escuro ·
//   Encore um holofote desce, palmas estouram dos lados e uma seta dá a volta
//   (de novo!).
//
// TUDO acontece no ALVO (`alvo` é o alto do corpo dele: cabeça em `y - 9`, pés
// em `y + 12`). Peça por fora do corpo. Sem alfa: some encolhendo.
import { getAbility } from '@/data/abilities'
import { PELES } from '../paletas'
import { entrada, limitar, recuo, saida } from '../primitivas'
import { BRANCO, ESCURO, brilho, comAcento, janela, montarFamilia, poligono } from './formas'
import { conta, disco, fio, linha, traco } from './tracos'
import type { ContextoVfx, Pele, Ponto } from '../tipos'

/** `sobe`: o golpe se arma · `fica`: no auge · `some`: assenta. */
interface Perfil { sobe: number; fica: number; some: number }

export const PERFIS_DE_TRAVA: Record<string, Perfil> = {
  disable: { sobe: 300, fica: 520, some: 240 },
  torment: { sobe: 220, fica: 620, some: 220 },
  spite: { sobe: 260, fica: 620, some: 240 },
  encore: { sobe: 280, fica: 600, some: 240 },
}

const COR = {
  carta: ['#5a6a8a', '#e8eef7', '#a8b8d8'],
  tranca: ['#8a6a1e', '#f0c040', '#fff4b0'],
  tridente: ['#7a1616', '#f04a3a', '#ffd0c0'],
  rancor: ['#2a1a3a', '#6a4a9a', '#c8b0f0'],
  pp: ['#2a8a4a', '#6fe08a'],
  palco: ['#c9952a', '#ffe36a', '#fffbe0'],
} as const

interface Cena {
  c: ContextoVfx; p: Perfil
  /** Alto do corpo do alvo, meio, cabeça e chão. */
  a: Ponto; meio: Ponto; cabeca: Ponto; chao: number
  sobe: number; fica: number | null; some: number
}
function cena(p: Perfil, c: ContextoVfx): Cena {
  return {
    c, p, a: c.alvo, meio: { x: c.alvo.x, y: c.alvo.y + 3 }, cabeca: { x: c.alvo.x, y: c.alvo.y - 9 }, chao: c.alvo.y + 12,
    sobe: limitar(c.ms / p.sobe), fica: janela(c.ms, p.sobe, p.fica), some: limitar((c.ms - p.sobe - p.fica) / p.some),
  }
}

const GOLPES: Record<string, (s: Cena) => void> = {
  /** "For four turns, this move prevents the target from using the move it last used." */
  disable(s) {
    const { ctx } = s.c, [fundo, meio, sombra] = COR.carta, [ouro, amarelo, luz] = COR.tranca
    // A CARTA do último golpe aparece acima da cabeça; uma tranca cai e BATE
    // em cima dela com tranco; a carta escurece e some junto.
    const fino = 1 - entrada(s.some), k = recuo(limitar(s.sobe * 1.3)) * fino, c = { x: s.cabeca.x, y: s.cabeca.y - 12 }
    if (k < .12) return
    const trancada = s.fica !== null && s.fica > .25 || s.some > 0
    const carta = (g: number): [number, number][] => [[c.x - (8 + g) * k, c.y - (5 + g) * k], [c.x + (8 + g) * k, c.y - (5 + g) * k], [c.x + (8 + g) * k, c.y + (5 + g) * k], [c.x - (8 + g) * k, c.y + (5 + g) * k]]
    poligono(ctx, carta(1.3), ESCURO); poligono(ctx, carta(0), trancada ? sombra : meio)
    // Linhas de texto da carta.
    for (let i = 0; i < 2; i++) fio(ctx, { x: c.x - 5.5 * k, y: c.y - 2 * k + i * 3.6 * k }, { x: c.x + (i ? 2 : 5.5) * k, y: c.y - 2 * k + i * 3.6 * k }, 1.3 * k, fundo)
    if (s.fica === null && s.some <= 0) return
    const t = s.fica ?? 1, cai = entrada(limitar(t / .25)), y = c.y - 16 * (1 - cai) + (t > .25 && t < .4 ? -Math.sin((t - .25) / .15 * Math.PI) * 2 : 0)
    // Cadeado: arco + corpo.
    const arco: Ponto[] = []
    for (let j = 0; j <= 8; j++) { const a = Math.PI + (j / 8) * Math.PI; arco.push({ x: c.x + Math.cos(a) * 3.2 * k, y: y - 2.5 * k + Math.sin(a) * 3.6 * k }) }
    traco(ctx, arco, 1.6 * k, amarelo)
    poligono(ctx, [[c.x - 5.4 * k, y - 3 * k], [c.x + 5.4 * k, y - 3 * k], [c.x + 5.4 * k, y + 5 * k], [c.x - 5.4 * k, y + 5 * k]], ESCURO)
    poligono(ctx, [[c.x - 4.2 * k, y - 1.8 * k], [c.x + 4.2 * k, y - 1.8 * k], [c.x + 4.2 * k, y + 3.8 * k], [c.x - 4.2 * k, y + 3.8 * k]], amarelo)
    disco(ctx, c.x, y + .6 * k, 1.2 * k, ouro); fio(ctx, { x: c.x, y: y + .6 * k }, { x: c.x, y: y + 2.6 * k }, 1 * k, ouro)
    if (t > .25 && t < .45) {
      const e = (t - .25) / .2
      brilho(ctx, c.x, y, 6 * (1 - e) + 1, luz)
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + .6; fio(ctx, { x: c.x + Math.cos(a) * (9 + e * 5), y: y + Math.sin(a) * (7 + e * 4) }, { x: c.x + Math.cos(a) * (13 + e * 5), y: y + Math.sin(a) * (10 + e * 4) }, 1.4 * (1 - e), BRANCO) }
    }
  },

  /** "The user torments and enrages the target, making it incapable of using the same move twice in a row." */
  torment(s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.tridente
    // ATORMENTAR: dois tridentes, um de cada lado, cutucam o alvo ALTERNADOS
    // (um entra enquanto o outro recua), sem parar; a cada cutucada, um risco.
    const forca = Math.min(1, s.sobe * 2) * (1 - entrada(s.some))
    for (const lado of [-1, 1]) {
      const cutuca = Math.max(0, Math.sin(ms * .02 + (lado > 0 ? 0 : Math.PI))), x = s.meio.x + lado * (22 - cutuca * 9), y = s.meio.y - 2 + lado * 3
      const k = forca
      if (k < .15) continue
      // Cabo e três dentes apontando pro corpo.
      traco(ctx, [{ x: x + lado * 10 * k, y }, { x, y }], 1.4 * k, fundo)
      traco(ctx, [{ x, y: y - 4.2 * k }, { x, y: y + 4.2 * k }], 1.2 * k, meio)
      for (let i = -1; i <= 1; i++) {
        const py = y + i * 4.2 * k
        fio(ctx, { x, y: py }, { x: x - lado * 7 * k, y: py }, 2.4 * k, ESCURO); fio(ctx, { x, y: py }, { x: x - lado * 7 * k, y: py }, 1 * k, i ? meio : luz)
      }
      if (cutuca > .85 && s.fica !== null) for (let i = 0; i < 2; i++) {
        const a = (lado > 0 ? Math.PI : 0) + (i ? .6 : -.6)
        fio(ctx, { x: x - lado * 6 + Math.cos(a) * 2, y: y + Math.sin(a) * 2 }, { x: x - lado * 6 + Math.cos(a) * 6, y: y + Math.sin(a) * 6 }, 1.3, BRANCO)
      }
    }
    // Veia de raiva na cabeça.
    if (s.fica !== null) {
      const k = (1 + Math.sin(ms * .03) * .15) * Math.min(1, s.fica * 4), x = s.cabeca.x + 6, y = s.cabeca.y - 4
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + .3, c = Math.cos(a), sn = Math.sin(a)
        traco(ctx, [{ x: x + c * 1.2 * k - sn * 3 * k, y: y + sn * 1.2 * k + c * 3 * k }, { x: x + c * 2.4 * k, y: y + sn * 2.4 * k }, { x: x + c * 1.2 * k + sn * 3 * k, y: y + sn * 1.2 * k - c * 3 * k }], 1.2 * k, meio)
      }
    }
  },

  /** "The user unleashes its grudge on the move last used by the target by cutting 4 PP from it." */
  spite(s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.rancor, [, ppLuz] = COR.pp
    // CORTAR 4 PP: quatro pontos verdes aparecem enfileirados acima do alvo; um
    // fiapo escuro com dois olhos passa por eles e RÓI um de cada vez — cada
    // ponto vira uma lasca e some.
    const fino = 1 - entrada(s.some), y = s.cabeca.y - 11, x0 = s.cabeca.x - 9
    const t = s.fica === null ? (s.some > 0 ? 1 : 0) : s.fica, comidos = Math.min(4, Math.floor(t * 4.6))
    for (let i = 0; i < 4; i++) {
      const x = x0 + i * 6, nasce = recuo(limitar(s.sobe * 2 - i * .2)) * fino
      if (nasce < .1) continue
      if (i < comidos) { conta(ctx, x, y, .9 * nasce, fundo); continue }
      conta(ctx, x, y, 2.2 * nasce, ppLuz); disco(ctx, x - .6, y - .6, .7 * nasce, BRANCO)
    }
    if (s.fica !== null) {
      const pos = x0 - 6 + Math.min(4.2, t * 4.6) * 6, k = 1, lambe = Math.sin(ms * .04) * 1
      const forma = (g: number): [number, number][] => [[pos - 5 - g, y + lambe], [pos - 1, y - (4 + g) * k], [pos + (3.4 + g) * k, y], [pos - 1, y + (4 + g) * k]]
      poligono(ctx, forma(1.2), ESCURO); poligono(ctx, forma(0), meio)
      disco(ctx, pos + .6, y - 1.2, .8, luz); disco(ctx, pos + .6, y + 1.2, .8, luz)
      // Lasca do ponto que acabou de ser roído.
      const dentro = (t * 4.6) % 1
      if (comidos > 0 && comidos <= 4 && dentro < .5) for (let j = 0; j < 2; j++) fio(ctx, { x: x0 + (comidos - 1) * 6, y: y + 2 + dentro * 6 }, { x: x0 + (comidos - 1) * 6 + (j ? 2 : -2), y: y + 4 + dentro * 8 }, 1.2 * (1 - dentro * 2), ppLuz)
    }
  },

  /** "The user compels the target to keep using the move it last used for three turns." */
  encore(s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.palco
    // BIS! Um holofote desce em cima do alvo (só as duas bordas do cone e a
    // roda de luz no chão); palmas estouram dos dois lados em compasso e uma
    // seta dá a volta acima da cabeça: de novo.
    const fino = 1 - entrada(s.some), desce = saida(s.sobe) * fino, topo = { x: s.a.x, y: s.cabeca.y - 30 }
    if (desce > .1) {
      for (const lado of [-1, 1]) { const b = { x: s.a.x + lado * 14 * desce, y: topo.y + (s.chao - topo.y) * desce }; fio(ctx, { x: topo.x + lado * 3, y: topo.y }, b, 2.4, fundo); fio(ctx, { x: topo.x + lado * 3, y: topo.y }, b, 1, luz) }
      const roda: Ponto[] = []
      for (let j = 0; j <= 20; j++) { const a = (j / 20) * Math.PI * 2; roda.push({ x: s.a.x + Math.cos(a) * 14 * desce, y: s.chao + Math.sin(a) * 4 * desce }) }
      linha(ctx, roda, 2.6, fundo); linha(ctx, roda, 1.1, meio)
    }
    if (s.fica === null) return
    // Palmas: dois estouros alternados.
    for (const lado of [-1, 1]) {
      const v = (ms / 300 + (lado > 0 ? 0 : .5)) % 1
      if (v > .6) continue
      const x = s.meio.x + lado * 19, y = s.meio.y - 4, e = v / .6
      for (let i = 0; i < 5; i++) { const a = i * (Math.PI * 2 / 5) + lado; fio(ctx, { x: x + Math.cos(a) * (2 + e * 3), y: y + Math.sin(a) * (2 + e * 3) }, { x: x + Math.cos(a) * (5 + e * 4), y: y + Math.sin(a) * (5 + e * 4) }, 1.5 * (1 - e), i % 2 ? luz : meio) }
    }
    // Seta em volta: três quartos de círculo girando, com ponta.
    const giro = ms * .008, c = { x: s.cabeca.x, y: s.cabeca.y - 11 }, pts: Ponto[] = []
    for (let j = 0; j <= 14; j++) { const a = giro + (j / 14) * Math.PI * 1.5; pts.push({ x: c.x + Math.cos(a) * 6.5, y: c.y + Math.sin(a) * 5 }) }
    traco(ctx, pts, 1.5, meio)
    const p = pts[pts.length - 1], q = pts[pts.length - 2], a = Math.atan2(p.y - q.y, p.x - q.x)
    poligono(ctx, [[p.x + Math.cos(a) * 5, p.y + Math.sin(a) * 5], [p.x + Math.cos(a + 2.2) * 4.4, p.y + Math.sin(a + 2.2) * 4.4], [p.x + Math.cos(a - 2.2) * 4.4, p.y + Math.sin(a - 2.2) * 4.4]], ESCURO)
    poligono(ctx, [[p.x + Math.cos(a) * 3.4, p.y + Math.sin(a) * 3.4], [p.x + Math.cos(a + 2.2) * 2.8, p.y + Math.sin(a + 2.2) * 2.8], [p.x + Math.cos(a - 2.2) * 2.8, p.y + Math.sin(a - 2.2) * 2.8]], luz)
  },
}

const peleDe = (id: string): Pele => comAcento(PELES[getAbility(id)?.type ?? 'NORMAL'], ...Object.values(COR).flat())

export const TRAVAS_POR_GOLPE = montarFamilia(PERFIS_DE_TRAVA, {
  desenhar: (p, c, id) => GOLPES[id](cena(p, c)),
  duracao: p => p.sobe + p.fica + p.some,
  contato: p => p.sobe,
  alcance: 46, margem: () => ({ cima: 60, baixo: 30, lados: 46 }), pele: peleDe,
})
