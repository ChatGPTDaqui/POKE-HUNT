// Clima (12/11): os quatro golpes que INVOCAM o clima. Segunda família de
// golpes de status com efeito próprio. O que se desenha aqui é a invocação, em
// volta de quem usou — a chuva/sol/granizo/areia que fica no mapa depois é do
// `climaVisual.ts`, que lê `world.clima`.
//
// Cada um parte da descrição do jogo, e a forma é do golpe, não da família:
//   Rain Dance gotas sobem dançando e viram uma nuvem que desaba · Sunny Day
//   um sol nasce atrás da cabeça e abre os raios · Hail nuvem de gelo que
//   despeja pedras que QUICAM · Sandstorm a areia do chão se ergue em fitas e
//   o vento a leva de lado.
//
// TUDO acontece em quem USA o golpe (`origem`, o peito), por cima do POKE:
// traço e peça pequena, nada chapado em cima do corpo. Sem alfa.
//
// Fora do registro até o dono aprovar a família no lab.
import { getAbility } from '@/data/abilities'
import { PELES } from '../paletas'
import { entrada, limitar, saida } from '../primitivas'
import { rngSemeado } from '../aleatorio'
import { BRANCO, ESCURO, brilho, comAcento, janela, montarFamilia, poligono } from './formas'
import type { ContextoVfx, Pele, Ponto } from '../tipos'

/** `sobe`: o clima é chamado · `fica`: desaba, no auge · `some`: assenta. */
interface Perfil { sobe: number; fica: number; some: number }

export const PERFIS_DE_CLIMA: Record<string, Perfil> = {
  rain_dance: { sobe: 340, fica: 480, some: 260 },
  sunny_day: { sobe: 300, fica: 520, some: 260 },
  hail: { sobe: 300, fica: 540, some: 260 },
  sandstorm: { sobe: 340, fica: 480, some: 280 },
}

const COR = {
  chuva: ['#2f5fa8', '#6fb0ff', '#dff0ff'],
  nuvem: ['#56657c', '#93a4b8', '#d5dde8'],
  sol: ['#e0661e', '#ffb52e', '#fff3a0'],
  gelo: ['#5f9cc4', '#a8dcff', '#e8f8ff'],
  nuvemFria: ['#7f93ab', '#c3d3e4', '#f2f8ff'],
  areia: ['#8a6a3a', '#c9a25e', '#f0dba0'],
} as const

interface Cena {
  c: ContextoVfx; semente: number
  /** Peito de quem usa, o chão sob os pés e o céu logo acima da cabeça. */
  o: Ponto; chao: number; ceu: number
  /** 0..1 chamando, 0..1 no auge (null fora da fase), 0..1 assentando. */
  sobe: number; fica: number | null; some: number
}
function cena(p: Perfil, c: ContextoVfx): Cena {
  return {
    c, semente: Math.floor(c.rng() * 0xffffffff), o: c.origem, chao: c.origem.y + 12, ceu: c.origem.y - 32,
    sobe: limitar(c.ms / p.sobe), fica: janela(c.ms, p.sobe, p.fica), some: limitar((c.ms - p.sobe - p.fica) / p.some),
  }
}

/** Traço com contorno escuro por baixo. */
function traco(ctx: CanvasRenderingContext2D, pts: readonly Ponto[], largura: number, cor: string): void {
  if (pts.length < 2 || largura <= .2) return
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  for (const [w, c] of [[largura + 2, ESCURO], [largura, cor]] as const) {
    ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath()
    pts.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))
    ctx.stroke()
  }
}
/** Fio fino SEM contorno: detalhe pequeno demais pra carregar borda escura. */
function fio(ctx: CanvasRenderingContext2D, a: Ponto, b: Ponto, largura: number, cor: string): void {
  ctx.lineCap = 'round'; ctx.strokeStyle = cor; ctx.lineWidth = largura
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
}
function disco(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, cor: string): void {
  if (r <= .3) return
  ctx.fillStyle = cor; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
}

/**
 * Nuvem baixa em cima da cabeça. `k` 0..1 é o tamanho; `quina` troca os gomos
 * redondos por blocos (a de gelo é dura, a de chuva é fofa).
 */
function nuvemBaixa(ctx: CanvasRenderingContext2D, cx: number, cy: number, k: number, cores: readonly string[], quina = false): void {
  if (k <= .05) return
  const gomos = [[-12, 1.5, 5], [-5.5, -2.5, 7], [2.5, -4, 7.6], [9.5, -1, 6], [14, 2, 4.2]] as const
  const [sombra, meio, luz] = cores
  for (const [g, cor, dx, dy] of [[1.4, ESCURO, 0, 0], [0, sombra, 0, 0], [-1.6, meio, -.6, -1], [-3.6, luz, -1.2, -2]] as const) {
    for (const [x, y, r] of gomos) {
      const R = (r + g) * k
      if (R <= .4) continue
      const px = cx + x * k + dx, py = cy + y * k + dy
      if (quina) poligono(ctx, [[px - R, py + R * .7], [px - R * .6, py - R], [px + R * .6, py - R], [px + R, py + R * .7]], cor)
      else disco(ctx, px, py, R, cor)
    }
  }
  // Barriga reta e escura: é ela que diz "carregada".
  poligono(ctx, [[cx - 16 * k, cy + 3.4 * k], [cx + 17 * k, cy + 3.4 * k], [cx + 15 * k, cy + 6 * k], [cx - 14 * k, cy + 6 * k]], ESCURO)
  poligono(ctx, [[cx - 14.5 * k, cy + 2 * k], [cx + 15.5 * k, cy + 2 * k], [cx + 14 * k, cy + 4.6 * k], [cx - 13 * k, cy + 4.6 * k]], sombra)
}

const GOLPES: Record<string, (p: Perfil, s: Cena) => void> = {
  /** "The user summons a heavy rain that falls for five turns, powering up Water-type moves." */
  rain_dance(_p, s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.chuva
    // A DANÇA chama a chuva: cinco gotas sobem dos pés rodando em volta do
    // corpo, se juntam no alto numa nuvem carregada, e ela desaba — riscos de
    // chuva inclinados e respingos no chão dos dois lados.
    const fino = 1 - entrada(s.some), nuvemY = s.ceu
    if (s.fica === null && s.some <= 0) for (let i = 0; i < 5; i++) {
      const u = limitar((s.sobe - i * .09) / .62)
      if (u <= 0 || u >= 1) continue
      const a = u * Math.PI * 2.4 + i * 1.26, raio = 15 * (1 - u * .7)
      const x = s.o.x + Math.cos(a) * raio, y = s.chao - (s.chao - nuvemY) * saida(u)
      // Gota de ponta pra baixo (sobe de costas, como quem é puxado).
      poligono(ctx, [[x, y + 5.4], [x - 3.4, y], [x, y - 3.6], [x + 3.4, y]], ESCURO)
      poligono(ctx, [[x, y + 4], [x - 2.2, y], [x, y - 2.4], [x + 2.2, y]], meio)
      disco(ctx, x - .6, y - .6, .9, BRANCO)
    }
    nuvemBaixa(ctx, s.o.x, nuvemY, saida(limitar((s.sobe - .35) / .65)) * fino, COR.nuvem)
    if (s.fica !== null && s.fica < .22) brilho(ctx, s.o.x, nuvemY + 4, 6 * (1 - s.fica / .22) + 1, luz)
    if (s.fica !== null || s.some > 0) {
      const n = s.c.pedir(12), altura = s.chao - nuvemY - 6
      for (let i = 0; i < n; i++) {
        const rng = rngSemeado(s.semente + i * 31)
        const x0 = s.o.x - 20 + (i / Math.max(1, n - 1)) * 42 + (rng() - .5) * 3
        const v = (ms / (280 + rng() * 80) + i * .29 + rng() * .2) % 1
        if (s.some > 0 && v < s.some) continue
        const y = nuvemY + 6 + v * altura, x = x0 - v * 5
        if (v < .86) {
          fio(ctx, { x: x + .3, y: y - 1 }, { x: x - 2.3, y: y + 9 }, 2.6, fundo)
          fio(ctx, { x, y }, { x: x - 2, y: y + 8 }, 1.2, i % 3 ? meio : luz)
        }
        else {
          // Respingo: coroa de três pontas no chão.
          const k = (v - .86) / .14, px = x0 - 5, r = 2 + k * 3.5
          fio(ctx, { x: px - r, y: s.chao - k * 3 }, { x: px - r * .4, y: s.chao + 1 }, 1.2, luz)
          fio(ctx, { x: px + r, y: s.chao - k * 3 }, { x: px + r * .4, y: s.chao + 1 }, 1.2, luz)
          if (k < .6) disco(ctx, px, s.chao - 2 - k * 5, 1.1, BRANCO)
        }
      }
    }
  },

  /** "The user intensifies the sun for five turns, powering up Fire-type moves." */
  sunny_day(_p, s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.sol
    // Um SOL nasce atrás da cabeça: sobe pequeno, firma no alto e abre oito
    // raios que giram devagar e pulsam; dois feixes de luz descem até o chão
    // ao lado do corpo. No fim os raios recolhem e o disco apaga num clarão.
    const fino = 1 - entrada(s.some), nasce = saida(s.sobe)
    const cx = s.o.x, cy = s.o.y - 12 - (s.ceu - 2 - (s.o.y - 12)) * -nasce
    const R = (2.5 + 4.5 * nasce) * (s.some > 0 ? 1 - s.some * .5 : 1)
    const abre = s.fica === null ? (s.some > 0 ? fino : 0) : saida(limitar(s.fica / .3))
    if (abre > 0) {
      // Feixes: do sol ao chão, um de cada lado, piscando alternados.
      for (const lado of [-1, 1]) {
        const pe = { x: cx + lado * 20, y: s.chao + 1 }
        const de = { x: cx + lado * (R + 3), y: cy + R }
        const ate = { x: de.x + (pe.x - de.x) * abre, y: de.y + (pe.y - de.y) * abre }
        const aceso = Math.floor(ms / 130) % 2 === (lado > 0 ? 0 : 1)
        traco(ctx, [de, ate], aceso ? 1.6 : 1, aceso ? luz : meio)
        if (abre >= 1 && s.some <= 0) brilho(ctx, pe.x, pe.y - 1, aceso ? 3.2 : 2, luz)
      }
      // Raios: triângulos, longo e curto alternados, girando.
      const giro = ms / 900
      for (let i = 0; i < 8; i++) {
        const a = giro + i * Math.PI / 4, pulso = 1 + Math.sin(ms / 110 + i * 1.3) * .14
        const comp = (i % 2 ? 5 : 9) * abre * pulso, base = R + 2.2, meiaBase = i % 2 ? 1.5 : 2.1
        const p = (r: number, da = 0): readonly [number, number] => [cx + Math.cos(a + da) * r, cy + Math.sin(a + da) * r]
        const ab = meiaBase / base
        poligono(ctx, [p(base - .6, -ab * 1.5), p(base + comp + 1.4), p(base - .6, ab * 1.5)], ESCURO)
        poligono(ctx, [p(base, -ab), p(base + comp), p(base, ab)], i % 2 ? meio : luz)
      }
    }
    disco(ctx, cx, cy, R + 1.4, ESCURO); disco(ctx, cx, cy, R, fundo)
    disco(ctx, cx - .4, cy - .5, R * .74, meio); disco(ctx, cx - .9, cy - 1, R * .42, luz)
    if (s.fica !== null && s.fica < .2) brilho(ctx, cx, cy, 9 * (1 - s.fica / .2) + 2, luz)
    if (s.some > .45) brilho(ctx, cx, cy, 7 * (1 - s.some) + 1, BRANCO)
  },

  /** "The user summons a hailstorm lasting five turns. It damages all Pokémon except Ice types." */
  hail(_p, s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.gelo
    // Nuvem de GELO, dura e de quinas, fecha em cima da cabeça com pingentes
    // na barriga; dela caem pedras retas e pesadas, que batem no chão e
    // QUICAM, soltando lascas. No fim a nuvem racha em flocos.
    const fino = 1 - entrada(s.some), fecha = saida(s.sobe)
    const nuvemY = s.ceu
    if (s.some <= 0) {
      nuvemBaixa(ctx, s.o.x, nuvemY, fecha, COR.nuvemFria, true)
      // Pingentes na barriga.
      for (let i = 0; i < 4; i++) {
        const x = s.o.x - 9 + i * 6, h = (3 + (i % 2) * 2.5) * fecha
        poligono(ctx, [[x - 2.2, nuvemY + 5], [x + 2.2, nuvemY + 5], [x, nuvemY + 6.5 + h + 1.2]], ESCURO)
        poligono(ctx, [[x - 1.2, nuvemY + 5], [x + 1.2, nuvemY + 5], [x, nuvemY + 6 + h]], i % 2 ? luz : meio)
      }
    } else for (let i = 0; i < 6; i++) {
      // A nuvem se desfaz em flocos que abrem e caem devagar.
      const a = Math.PI * (1.1 + .8 * i / 5), x = s.o.x + Math.cos(a) * (8 + s.some * 14), y = nuvemY - Math.sin(a) * 2 + s.some * 9
      brilho(ctx, x, y, 3 * fino, i % 2 ? luz : BRANCO)
    }
    if (s.fica !== null || s.some > 0) {
      const n = s.c.pedir(6), queda = s.chao - nuvemY - 8
      for (let i = 0; i < n; i++) {
        const rng = rngSemeado(s.semente + i * 47)
        const x0 = s.o.x + (i % 2 ? 1 : -1) * (7 + Math.floor(i / 2) * 6.5 + rng() * 2)
        const v = (ms / (360 + rng() * 80) + i * .37) % 1
        if (s.some > 0 && v < s.some * .9) continue
        const cai = .58
        let x = x0, y: number, r = 3 + rng() * .8
        if (v < cai) y = nuvemY + 8 + entrada(v / cai) ** .5 * queda
        else {
          // Quique: arco pra fora, encolhendo.
          const k = (v - cai) / (1 - cai)
          x = x0 + (i % 2 ? 1 : -1) * k * 8; y = s.chao - Math.sin(k * Math.PI) * 7; r *= 1 - k * .5
          if (k < .35) {
            const e = k / .35
            for (const d of [-1, 1]) fio(ctx, { x: x0 + d * 2, y: s.chao }, { x: x0 + d * (3 + e * 4), y: s.chao - 1 - e * 3 }, 1.2, BRANCO)
          }
        }
        // Pedra: pentágono torto, girando de quadro em quadro.
        const g = Math.floor(ms / 110 + i) * .8
        // Pedra de quina: cinco pontas desiguais, pra não ler como bolha.
        const lasca = [1.15, .6, 1, .55, .95]
        const pedra = (R: number, dx = 0, dy = 0) => lasca.map((k, j) => [x + dx + Math.cos(g + j * 1.257) * R * k, y + dy + Math.sin(g + j * 1.257) * R * k] as const)
        poligono(ctx, pedra(r + 1.3), ESCURO); poligono(ctx, pedra(r), fundo); poligono(ctx, pedra(r * .7, -.4, -.5), meio)
        poligono(ctx, pedra(r * .3, -r * .2, -r * .25), BRANCO)
        void luz
      }
    }
  },

  /** "A five-turn sandstorm is summoned to hurt all combatants except Rock, Ground, and Steel types." */
  sandstorm(_p, s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.areia
    // A areia DO CHÃO é levantada pelo vento: poeira estoura dos dois lados dos
    // pés, e quatro rajadas compridas cruzam o corpo em alturas diferentes,
    // serpenteando e enrolando na ponta; grãos correm junto. No fim o vento
    // leva tudo pra direita. Rajada é fio, não massa: o corpo fica à mostra.
    const fino = 1 - entrada(s.some), ergue = saida(s.sobe), leva = entrada(s.some) * 24
    const topo = s.ceu + 6
    // Poeira nos pés, só dos lados (nunca em cima do corpo).
    for (const lado of [-1, 1]) for (let i = 0; i < 3; i++) {
      const sobe = (ms / 520 + i * .33) % 1
      const x = s.o.x + lado * (13 + i * 4 + sobe * 3) + leva, y = s.chao + 1 - sobe * 5 * ergue
      const r = (3 - i * .6) * (1 - sobe * .6) * ergue * fino
      disco(ctx, x, y, r + 1.1, ESCURO); disco(ctx, x, y, r, fundo); disco(ctx, x - .5, y - .6, r * .6, meio)
    }
    // Rajadas: nascem embaixo e vão ocupando as faixas de cima.
    const faixas = 4
    for (let f = 0; f < faixas; f++) {
      const nasce = limitar((s.sobe - f * .16) / .5)
      if (nasce <= 0) continue
      const y0 = s.chao - 4 - (f / (faixas - 1)) * (s.chao - 4 - topo)
      const v = (ms / (620 + f * 70) + f * .31) % 1
      // A rajada tem comprimento fixo e anda da esquerda pra direita.
      const comp = 26 * saida(nasce) * fino, cabeca = s.o.x - 30 + v * 60 + leva
      const pts: Ponto[] = []
      for (let i = 0; i <= 10; i++) {
        const u = i / 10, x = cabeca - comp * (1 - u)
        pts.push({ x, y: y0 + Math.sin(x * .16 + f * 2 + ms / 260) * 2.4 })
      }
      // Caracol na ponta: o vento enrola.
      const fim = pts[pts.length - 1]
      for (let i = 1; i <= 6; i++) {
        const a = -Math.PI / 2 + i * .85, r = 3.2 * (1 - i / 9) * Math.min(1, comp / 14)
        pts.push({ x: fim.x + Math.cos(a) * r, y: fim.y - 3 + Math.sin(a) * r + 3 * (1 - i / 6) })
      }
      const vida = Math.sin(v * Math.PI)
      if (comp < 4 || vida < .15) continue
      const cor = f % 2 ? luz : meio
      // Cauda fina, frente grossa.
      const meioDaFita = Math.floor(pts.length * .45)
      traco(ctx, pts.slice(0, meioDaFita + 1), 1.1 * vida, fundo)
      traco(ctx, pts.slice(meioDaFita), 2.2 * vida, cor)
    }
    // Grãos no vento, entre as rajadas.
    if (s.sobe > .3) {
      const n = s.c.pedir(10)
      for (let i = 0; i < n; i++) {
        const rng = rngSemeado(s.semente + i * 19)
        const v = (ms / (240 + rng() * 120) + rng()) % 1
        const y = topo + 2 + rng() * (s.chao - topo - 2) + Math.sin(v * 7 + i) * 1.2
        const x = s.o.x - 28 + v * 56 + leva
        const r = (.8 + rng() * .7) * Math.sin(v * Math.PI) * fino
        if (r < .5) continue
        disco(ctx, x, y, r + .9, ESCURO); disco(ctx, x, y, r, i % 2 ? luz : meio)
      }
    }
  },
}

const peleDe = (id: string): Pele => comAcento(PELES[getAbility(id)?.type ?? 'NORMAL'], ...Object.values(COR).flat())

export const CLIMA_POR_GOLPE = montarFamilia(PERFIS_DE_CLIMA, {
  desenhar: (p, c, id) => GOLPES[id](p, cena(p, c)),
  duracao: p => p.sobe + p.fica + p.some,
  // "Contato" de um clima é o instante em que ele DESABA.
  contato: p => p.sobe,
  alcance: 48, margem: () => ({ cima: 58, baixo: 40, lados: 66 }), pele: peleDe,
})
