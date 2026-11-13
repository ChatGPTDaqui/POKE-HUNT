// Reduções hostis (12/11): oito golpes de status que BAIXAM um atributo do
// alvo na base do susto, do barulho ou da sujeira. Décima segunda família de
// golpes de status com efeito próprio.
//
// Cada um parte da descrição do jogo, e a forma é do golpe, não da família:
//   Scary Face uma carranca cresce sobre quem usa e avança · Screech riscos
//   pontudos em leque, vibrando · Metal Sound duas chapas raspam e saem ondas
//   QUADRADAS · Eerie Impulse dois pulsos lentos e tortos que deixam o alvo
//   apagando · Smokescreen bola cuspida que abre em fumaça no rosto · Sand
//   Attack leque de areia jogado do chão na cara · Kinesis uma colher flutua
//   e entorta · Feather Dance penas caem balançando e grudam no alvo.
//
// Sai de quem usa (`origem`) e chega no alvo (`alvo`) — `STATUS_QUE_VIAJA`.
// O selo de atributo do jogo continua aparecendo. Sem alfa.
import { getAbility } from '@/data/abilities'
import { PELES } from '../paletas'
import { entrada, limitar, saida } from '../primitivas'
import { rngSemeado } from '../aleatorio'
import { BRANCO, ESCURO, brilho, comAcento, janela, montarFamilia, poligono } from './formas'
import { anel, arco, conta, disco, fio, linha, traco } from './tracos'
import type { ContextoVfx, Pele, Ponto } from '../tipos'

/** `vai`: sai de quem usa e chega · `pega`: age no alvo · `some`: assenta. */
interface Perfil { vai: number; pega: number; some: number }

export const PERFIS_DE_REDUCAO_HOSTIL: Record<string, Perfil> = {
  scary_face: { vai: 380, pega: 440, some: 240 },
  screech: { vai: 260, pega: 520, some: 220 },
  metal_sound: { vai: 320, pega: 480, some: 220 },
  eerie_impulse: { vai: 440, pega: 460, some: 260 },
  smokescreen: { vai: 320, pega: 520, some: 280 },
  sand_attack: { vai: 280, pega: 440, some: 240 },
  kinesis: { vai: 360, pega: 480, some: 240 },
  feather_dance: { vai: 380, pega: 540, some: 260 },
}

const COR = {
  carranca: ['#3a1a4a', '#a03ac0', '#ffe14a'],
  grito: ['#8a2a2a', '#ff7a5a', '#ffe8d8'],
  chapa: ['#4a5262', '#9aa6b8', '#f4f8ff'],
  impulso: ['#3a7a5a', '#8af0b0', '#eafff0'],
  fumaca: ['#3a3f4a', '#7a8290', '#c8ced8'],
  areia: ['#8a6a3a', '#c9a25e', '#f0dba0'],
  colher: ['#6a7286', '#c8d0e0', '#ffffff'],
  mente: ['#a03a8a', '#f08ad8', '#ffe0f8'],
  pena: ['#8a94a8', '#e8eef7', '#ffffff'],
  faisca: ['#c9952a', '#ffe36a'],
} as const

interface Cena {
  c: ContextoVfx; p: Perfil; semente: number
  /** Alto do corpo de quem usa e do alvo, cabeça do alvo, chão do alvo, lado. */
  o: Ponto; a: Ponto; cabeca: Ponto; chao: number; dir: number
  vai: number; pega: number | null; some: number
}
function cena(p: Perfil, c: ContextoVfx): Cena {
  return {
    c, p, semente: Math.floor(c.rng() * 0xffffffff), o: c.origem, a: c.alvo,
    cabeca: { x: c.alvo.x, y: c.alvo.y - 9 }, chao: c.alvo.y + 12, dir: c.alvo.x >= c.origem.x ? 1 : -1,
    vai: limitar(c.ms / p.vai), pega: janela(c.ms, p.vai, p.pega), some: limitar((c.ms - p.vai - p.pega) / p.some),
  }
}
/** Alvo abalado: riscos curtos tremendo dos dois lados do corpo. */
function tremor(s: Cena, forca: number, cor: string): void {
  if (forca <= .05) return
  const treme = Math.sin(s.c.ms * .13) * 1.3
  for (const lado of [-1, 1]) for (let i = 0; i < 2; i++) {
    const x = s.a.x + lado * (11 + i * 3.5) + treme * lado, y = s.a.y - 4 + i * 8
    linha(s.c.ctx, [{ x, y }, { x: x + lado * 1.6, y: y + 2.5 }, { x, y: y + 5 }], 1.5 * forca, cor)
  }
}

const GOLPES: Record<string, (s: Cena) => void> = {
  /** "The user frightens the target with a scary face to harshly lower its Speed stat." */
  scary_face(s) {
    const { ctx, ms } = s.c, [fundo, meio, olho] = COR.carranca
    // Uma CARRANCA (dois olhos tortos e uma boca de serra) cresce acima de
    // quem usa e AVANÇA pra cima do alvo; ele fica tremendo.
    const cresce = saida(limitar(s.vai / .5)), avanca = entrada(limitar((s.vai - .5) / .5))
    const fino = s.pega === null ? (s.some > 0 ? 0 : 1) : 1 - entrada(limitar(s.pega / .5))
    const de = { x: s.o.x, y: s.o.y - 16 }, ate = { x: s.a.x - s.dir * 8, y: s.a.y - 12 }
    const cx = de.x + (ate.x - de.x) * avanca, cy = de.y + (ate.y - de.y) * avanca
    const k = (.5 + cresce * .6 + avanca * .35) * fino, tique = Math.sin(ms * .08) * .6
    if (k > .15) {
      for (const lado of [-1, 1]) {
        const x = cx + lado * 6 * k, y = cy - 2 * k + tique
        // Olho em cunha, mais alto por fora.
        const cunha = (g: number): [number, number][] => [[x - lado * (4 + g) * k, y + (1.5 + g) * k], [x + lado * (4.5 + g) * k, y - (3.5 + g) * k], [x + lado * (4.5 + g) * k, y + (2.5 + g) * k]]
        poligono(ctx, cunha(1.3), ESCURO); poligono(ctx, cunha(0), olho)
        disco(ctx, x + lado * 1.6 * k, y, 1.1 * k, fundo)
      }
      // Boca de serra.
      const boca: Ponto[] = []
      for (let i = 0; i <= 6; i++) boca.push({ x: cx - 8 * k + i * (16 * k / 6), y: cy + (6 + (i % 2 ? 3 : 0)) * k })
      traco(ctx, boca, 1.5 * k, meio)
    }
    if (s.pega !== null) tremor(s, 1 - entrada(s.pega), olho)
  },

  /** "An earsplitting screech harshly lowers the target's Defense stat." */
  screech(s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.grito
    // Grito de RACHAR: cinco riscos pontudos saem da boca em leque e vibram
    // (zigue-zague apertado), alongando até o alvo; nele, rachaduras curtas.
    const boca = { x: s.o.x + s.dir * 5, y: s.o.y - 5 }, ang = Math.atan2(s.a.y - 4 - boca.y, s.a.x - boca.x)
    const dist = Math.hypot(s.a.x - boca.x, s.a.y - 4 - boca.y), forca = s.pega === null ? (s.some > 0 ? 0 : 1) : 1 - entrada(limitar((s.pega - .5) / .5))
    if (forca > .05) for (let i = 0; i < 5; i++) {
      const a = ang + (i - 2) * .16, comp = dist * saida(s.vai) * (i === 2 ? 1 : .86), pts: Ponto[] = []
      const n = Math.max(4, Math.floor(comp / 3.2))
      for (let j = 0; j <= n; j++) {
        const d = (j / n) * comp, lado = (j % 2 ? 1 : -1) * (1.6 + (d / dist) * 1.6) * Math.sin(ms * .09 + i)
        pts.push({ x: boca.x + Math.cos(a) * d - Math.sin(a) * lado, y: boca.y + Math.sin(a) * d + Math.cos(a) * lado })
      }
      linha(ctx, pts, 2.6 * forca, fundo); linha(ctx, pts, 1.1 * forca, i % 2 ? luz : meio)
    }
    if (s.pega !== null) {
      for (let i = 0; i < 3; i++) {
        const x = s.a.x - 7 + i * 7, y = s.a.y - 6 + (i % 2) * 6, e = saida(limitar(s.pega * 2.5 - i * .2)) * (1 - entrada(s.pega))
        linha(ctx, [{ x, y }, { x: x + 2 * e, y: y + 3 * e }, { x: x - 1 * e, y: y + 5 * e }, { x: x + 1.5 * e, y: y + 8 * e }], 1.3 * e, BRANCO)
      }
      tremor(s, .8 * (1 - entrada(s.pega)), luz)
    }
  },

  /** "A horrible sound like scraping metal harshly lowers the target's Sp. Def stat." */
  metal_sound(s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.chapa
    // Duas CHAPAS raspam uma na outra na frente de quem usa, soltando faísca;
    // do atrito saem ondas QUADRADAS (som duro) que crescem até o alvo.
    const lugar = { x: s.o.x + s.dir * 9, y: s.o.y - 2 }, raspa = Math.sin(ms * .05) * 3
    const forca = s.pega === null ? (s.some > 0 ? 0 : Math.min(1, s.vai * 3)) : 1 - entrada(limitar(s.pega / .4))
    if (forca > .1) {
      for (const lado of [-1, 1]) {
        const x = lugar.x + lado * 2, y = lugar.y + lado * raspa
        poligono(ctx, [[x - 2.6, y - 7.5], [x + 2.6, y - 7.5], [x + 2.6, y + 7.5], [x - 2.6, y + 7.5]].map(([px, py]) => [lugar.x + (px - lugar.x) * forca, lugar.y + (py - lugar.y) * forca] as [number, number]), ESCURO)
        poligono(ctx, [[x - 1.5, y - 6.4], [x + 1.5, y - 6.4], [x + 1.5, y + 6.4], [x - 1.5, y + 6.4]].map(([px, py]) => [lugar.x + (px - lugar.x) * forca, lugar.y + (py - lugar.y) * forca] as [number, number]), lado > 0 ? meio : fundo)
      }
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + (i - 1) * .8 + Math.sin(ms * .05) * .4
        fio(ctx, { x: lugar.x + Math.cos(a) * 2, y: lugar.y + Math.sin(a) * 2 }, { x: lugar.x + Math.cos(a) * 6, y: lugar.y + Math.sin(a) * 6 }, 1.2 * forca, COR.faisca[i % 2])
      }
    }
    if (s.some <= 0 && (s.pega === null || s.pega < .6)) for (let i = 0; i < 3; i++) {
      const fase = ms / (s.p.vai * .9) - i * .3
      if (fase < 0) continue
      const u = fase % 1, x = lugar.x + (s.a.x - lugar.x) * u, y = lugar.y + (s.a.y - 4 - lugar.y) * u, r = 2.5 + u * 6.5
      const vida = Math.sin(u * Math.PI)
      traco(ctx, [{ x: x - r * .5, y: y - r }, { x: x + r * .5, y: y - r }, { x: x + r * .5, y: y + r }, { x: x - r * .5, y: y + r }, { x: x - r * .5, y: y - r }], 1.2 * vida, i % 2 ? luz : meio)
    }
    if (s.pega !== null) tremor(s, 1 - entrada(s.pega), luz)
  },

  /** "The user's body generates an eerie impulse. Exposing the target to it harshly lowers the target's Sp. Atk stat." */
  eerie_impulse(s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.impulso
    // Impulso ESQUISITO: do corpo de quem usa saem dois pulsos LENTOS, anéis
    // tortos que balançam enquanto crescem; passam pelo alvo e ele fica
    // apagando — faíscas fracas caem dele como poeira.
    const dist = Math.hypot(s.a.x - s.o.x, s.a.y - s.o.y) + 10
    if (s.some <= 0) for (let i = 0; i < 2; i++) {
      const u = limitar((ms - i * 240) / (s.p.vai + 160))
      if (u <= 0 || u >= 1) continue
      const R = 4 + u * dist, pts: Ponto[] = []
      // Só a metade da FRENTE do anel, e achatada: o pulso vai na direção do alvo.
      const frente = Math.atan2(s.a.y - s.o.y, s.a.x - s.o.x), ry = Math.min(R * .5, 15)
      for (let j = 0; j <= 16; j++) {
        const a = -Math.PI / 2 + (j / 16) * Math.PI, torto = 1 + Math.sin(a * 3 + ms * .012 + i * 2) * .1
        const lx = Math.cos(a) * R * torto, ly = Math.sin(a) * ry * torto
        pts.push({ x: s.o.x + lx * Math.cos(frente) - ly * Math.sin(frente), y: s.o.y + 3 + lx * Math.sin(frente) + ly * Math.cos(frente) })
      }
      linha(ctx, pts, 2.8 * (1 - u), fundo); linha(ctx, pts, 1.2 * (1 - u), i ? luz : meio)
    }
    if (s.pega !== null || s.some > 0) {
      const n = s.c.pedir(6), fino = 1 - entrada(s.some)
      for (let i = 0; i < n; i++) {
        const rng = rngSemeado(s.semente + i * 67), v = ((s.pega ?? 1) * 1.4 + rng()) % 1
        const x = s.a.x + (rng() - .5) * 20, y = s.a.y - 8 + v * 20
        brilho(ctx, x, y, 1.9 * (1 - v) * fino, i % 2 ? meio : luz)
      }
    }
  },

  /** "The user releases an obscuring cloud of smoke or ink. This lowers the target's accuracy." */
  smokescreen(s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.fumaca
    // Uma bola escura é cuspida em arco e ABRE em fumaça na altura dos olhos
    // do alvo: gomos que incham e rolam pra cima, ficando em volta da cabeça.
    const alvo = { x: s.cabeca.x, y: s.cabeca.y + 2 }
    if (s.pega === null && s.some <= 0) {
      const p = arco({ x: s.o.x + s.dir * 4, y: s.o.y - 4 }, alvo, s.vai, 12)
      conta(ctx, p.x, p.y, 3, fundo); disco(ctx, p.x - .8, p.y - .9, 1, meio)
      const q = arco({ x: s.o.x + s.dir * 4, y: s.o.y - 4 }, alvo, Math.max(0, s.vai - .12), 12)
      conta(ctx, q.x, q.y, 1.6, meio)
      return
    }
    const t = s.pega ?? 1, fino = 1 - entrada(s.some), n = s.c.pedir(7)
    for (let i = 0; i < n; i++) {
      const rng = rngSemeado(s.semente + i * 73), a = (i / n) * Math.PI * 2 + rng()
      const abre = saida(limitar(t * 2.2 - i * .04)), d = abre * (8 + rng() * 5)
      const x = alvo.x + Math.cos(a) * d + Math.sin(ms * .004 + i) * 1.5, y = alvo.y + Math.sin(a) * d * .6 - t * 5 * rng()
      const r = (2.2 + rng() * 2.2) * abre * fino
      conta(ctx, x, y, r, i % 3 === 0 ? luz : i % 3 === 1 ? meio : fundo)
    }
  },

  /** "Sand is hurled in the target's face, reducing the target's accuracy." */
  sand_attack(s) {
    const { ctx } = s.c, [fundo, meio, luz] = COR.areia
    // Areia do CHÃO: um leque de grãos é varrido dos pés de quem usa pra cara
    // do alvo, baixo e rápido; bate, espalha e escorre.
    const pes = { x: s.o.x + s.dir * 5, y: s.o.y + 11 }, n = s.c.pedir(16), fino = 1 - entrada(s.some)
    for (let i = 0; i < n; i++) {
      const rng = rngSemeado(s.semente + i * 79)
      const destino = { x: s.cabeca.x + (rng() - .5) * 12, y: s.cabeca.y + 2 + (rng() - .5) * 9 }
      const u = limitar((s.c.ms - i * 7) / (s.p.vai - 60))
      if (u <= 0) continue
      const p = u < 1 ? arco(pes, destino, saida(u), 4 + rng() * 5) : destino
      const depois = s.pega ?? (s.some > 0 ? 1 : 0), espalha = saida(limitar(depois * 2.4))
      const x = p.x + (u >= 1 ? s.dir * espalha * (3 + rng() * 6) : 0), y = p.y + (u >= 1 ? depois * depois * (10 + rng() * 10) - espalha * 2 : 0)
      const r = (.9 + rng() * 1) * fino
      conta(ctx, x, y, r, i % 3 === 0 ? luz : i % 3 === 1 ? meio : fundo)
    }
    // Olho ardendo: dois "x" pequenos na altura do rosto.
    if (s.pega !== null && s.pega > .1 && s.pega < .8) for (const lado of [-1, 1]) {
      const x = s.cabeca.x + lado * 3.5, y = s.cabeca.y + 1, k = 1.8
      fio(ctx, { x: x - k, y: y - k }, { x: x + k, y: y + k }, 1.3, BRANCO); fio(ctx, { x: x + k, y: y - k }, { x: x - k, y: y + k }, 1.3, BRANCO)
    }
  },

  /** "The user distracts the target by bending a spoon. This lowers the target's accuracy." */
  kinesis(s) {
    const { ctx, ms } = s.c, [, meio, luz] = COR.colher
    // Uma COLHER flutua na frente de quem usa e o cabo ENTORTA até dobrar de
    // lado; anéis de mente saem dela e o alvo fica olhando, distraído.
    const lugar = { x: s.o.x + s.dir * 10, y: s.o.y - 6 + Math.sin(ms * .008) * 1.5 }
    const k = saida(limitar(s.vai * 2.5)) * (1 - entrada(s.some)), dobra = saida(limitar((s.vai - .35) / .65)) * 1.5
    if (k > .15) {
      // Cabo em dois trechos: o de cima fica reto, o de baixo dobra.
      const junta = { x: lugar.x, y: lugar.y + 3 * k }, ponta = { x: junta.x + Math.sin(dobra) * 8 * k * s.dir, y: junta.y + Math.cos(dobra) * 8 * k }
      traco(ctx, [{ x: lugar.x, y: lugar.y - 2 * k }, junta, ponta], 1.5 * k, meio)
      const concha = (g: number): [number, number][] => [[lugar.x, lugar.y - (8 + g) * k], [lugar.x + (3 + g) * k, lugar.y - 5.5 * k], [lugar.x + (2.2 + g) * k, lugar.y - 2 * k], [lugar.x - (2.2 + g) * k, lugar.y - 2 * k], [lugar.x - (3 + g) * k, lugar.y - 5.5 * k]]
      poligono(ctx, concha(1.2), ESCURO); poligono(ctx, concha(0), meio)
      disco(ctx, lugar.x - .8 * k, lugar.y - 5.5 * k, 1.1 * k, luz)
    }
    if (s.vai > .4 && s.some <= 0) for (let i = 0; i < 2; i++) {
      const u = (ms / 420 + i * .5) % 1
      anel(ctx, lugar.x, lugar.y - 3, 3 + u * 9, 3 + u * 9, 1.2 * (1 - u), COR.mente[1 + i])
    }
    if (s.pega !== null) {
      // Distraído: um "!" pequeno que vira "?" não cabe — fica o olhar preso,
      // um fio pontilhado do alvo até a colher.
      for (let i = 1; i < 6; i++) {
        const f = i / 6
        if ((i + Math.floor(ms / 110)) % 2) conta(ctx, s.cabeca.x + (lugar.x - s.cabeca.x) * f, s.cabeca.y + 2 + (lugar.y - 4 - s.cabeca.y) * f, .9, COR.mente[1])
      }
      brilho(ctx, s.cabeca.x - s.dir * 5, s.cabeca.y - 3, 2.6 * Math.abs(Math.sin(ms * .012)) + .5, COR.mente[2])
    }
  },

  /** "The user covers the target's body with a mass of down that harshly lowers its Attack stat." */
  feather_dance(s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.pena
    // PENAS: um punhado é jogado pro alto, cai devagar em balanço largo (de um
    // lado pro outro, virando) e GRUDA no corpo do alvo, cobrindo de leve.
    const n = s.c.pedir(9), fino = 1 - entrada(s.some)
    for (let i = 0; i < n; i++) {
      const rng = rngSemeado(s.semente + i * 89)
      const pouso = { x: s.a.x + (rng() - .5) * 20, y: s.a.y - 8 + rng() * 16 }, alto = { x: pouso.x + (rng() - .5) * 14, y: s.cabeca.y - 22 - rng() * 8 }
      const t = (ms - i * 28) / (s.p.vai * .55)
      if (t <= 0) continue
      const queda = limitar((t - 1) / 1.7)
      const p = t < 1 ? arco({ x: s.o.x, y: s.o.y - 6 }, alto, saida(t), 6) : { x: alto.x + (pouso.x - alto.x) * queda + Math.sin(queda * Math.PI * 3 + i) * 5 * (1 - queda), y: alto.y + (pouso.y - alto.y) * queda }
      const incl = queda < 1 ? Math.sin(queda * Math.PI * 3 + i) * .9 : (rng() - .5) * 1.4, k = (1 + rng() * .35) * fino
      const c = Math.cos(incl), sn = Math.sin(incl)
      const forma = (g: number): [number, number][] => ([[0, -4.6 - g], [1.9 + g, -1], [1.3 + g, 3], [0, 4.6 + g], [-1.3 - g, 3], [-1.9 - g, -1]] as const).map(([px, py]) => [p.x + (px * c - py * sn) * k, p.y + (px * sn + py * c) * k] as [number, number])
      if (k < .25) continue
      poligono(ctx, forma(1), ESCURO); poligono(ctx, forma(0), i % 3 ? meio : luz)
      fio(ctx, { x: p.x + sn * 3.6 * k, y: p.y - c * 3.6 * k }, { x: p.x - sn * 3.6 * k, y: p.y + c * 3.6 * k }, .8, fundo)
    }
  },
}

const peleDe = (id: string): Pele => comAcento(PELES[getAbility(id)?.type ?? 'NORMAL'], ...Object.values(COR).flat())

export const REDUCOES_HOSTIS_POR_GOLPE = montarFamilia(PERFIS_DE_REDUCAO_HOSTIL, {
  desenhar: (p, c, id) => GOLPES[id](cena(p, c)),
  duracao: p => p.vai + p.pega + p.some,
  // "Contato" é o instante em que a redução CHEGA no alvo.
  contato: p => p.vai,
  alcance: 46, margem: () => ({ cima: 58, baixo: 34, lados: 48 }), pele: peleDe,
})
