// Energias (12/11): seis golpes de status em que quem usa se CARREGA de
// alguma força pra subir atributo. Décima primeira família de golpes de
// status com efeito próprio.
//
// Cada um parte da descrição do jogo, e a forma é do golpe, não da família:
//   Cosmic Power estrelas caem do alto em espiral e uma constelação acende ·
//   Stockpile um orbe se forma, é engolido e a barriga pulsa · Charge faíscas
//   convergem de fora pra dentro e o corpo estala · Magnetic Flux linhas de
//   campo correm de um polo ao outro · Barrier uma parede de painéis sobe do
//   chão na frente · Tail Glow uma luz pisca três vezes, cada vez mais forte.
//
// TUDO acontece em quem USA o golpe. `origem` é o ALTO do corpo: meio em
// `o.y + 3`, pés em `o.y + 12`, cabeça em `o.y - 9`. Sem alfa.
import { getAbility } from '@/data/abilities'
import { PELES } from '../paletas'
import { entrada, limitar, recuo, saida } from '../primitivas'
import { rngSemeado } from '../aleatorio'
import { BRANCO, ESCURO, brilho, comAcento, janela, montarFamilia, poligono } from './formas'
import { anel, conta, disco, fio, linha, traco } from './tracos'
import type { ContextoVfx, Pele, Ponto } from '../tipos'

/** `sobe`: o golpe se arma · `fica`: no auge · `some`: assenta. */
interface Perfil { sobe: number; fica: number; some: number }

export const PERFIS_DE_ENERGIA: Record<string, Perfil> = {
  cosmic_power: { sobe: 460, fica: 440, some: 260 },
  stockpile: { sobe: 340, fica: 460, some: 240 },
  charge: { sobe: 400, fica: 400, some: 220 },
  magnetic_flux: { sobe: 260, fica: 580, some: 240 },
  barrier: { sobe: 320, fica: 500, some: 240 },
  tail_glow: { sobe: 200, fica: 640, some: 240 },
}

const COR = {
  cosmo: ['#3a2a8a', '#9a8aff', '#fff6c0'],
  reserva: ['#8a6a1e', '#f0c040', '#fff4b0'],
  carga: ['#b58a00', '#ffe14a', '#fffbd0'],
  polo: ['#d03a3a', '#3a6ad0', '#c8d0e0'],
  parede: ['#6a4ab0', '#c0a0ff', '#f4ecff'],
  vagalume: ['#6a9a1e', '#d8f04a', '#fbffd0'],
} as const

interface Cena {
  c: ContextoVfx; p: Perfil; semente: number
  o: Ponto; meio: Ponto; chao: number; cabeca: Ponto; dir: number
  sobe: number; fica: number | null; some: number
}
function cena(p: Perfil, c: ContextoVfx): Cena {
  return {
    c, p, semente: Math.floor(c.rng() * 0xffffffff), o: c.origem, meio: { x: c.origem.x, y: c.origem.y + 3 }, chao: c.origem.y + 12,
    cabeca: { x: c.origem.x, y: c.origem.y - 9 }, dir: Math.cos(c.angulo) >= 0 ? 1 : -1,
    sobe: limitar(c.ms / p.sobe), fica: janela(c.ms, p.sobe, p.fica), some: limitar((c.ms - p.sobe - p.fica) / p.some),
  }
}

const GOLPES: Record<string, (s: Cena) => void> = {
  /** "The user absorbs a mystical power from space to raise its Defense and Sp. Def stats." */
  cosmic_power(s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.cosmo
    // Do ESPAÇO: cinco estrelas descem do alto em espiral larga até o corpo;
    // absorvidas, acendem uma constelação ligada por fios acima da cabeça.
    const fino = 1 - entrada(s.some)
    if (s.fica === null && s.some <= 0 || s.fica !== null && s.fica < .2) for (let i = 0; i < 5; i++) {
      const u = limitar(s.c.ms / s.p.sobe * 1.3 - i * .08)
      if (u <= 0 || u >= 1) continue
      const a = i * 1.26 + u * Math.PI * 2.2, R = 22 * (1 - saida(u))
      const x = s.meio.x + Math.cos(a) * R, y = s.meio.y - 30 * (1 - u) + Math.sin(a) * R * .3
      fio(ctx, { x, y }, { x: x - Math.cos(a + 1.2) * 5, y: y - 5 }, 1.2, meio)
      brilho(ctx, x, y, 2.6 * (1 - u * .4), luz)
    }
    if (s.fica !== null || s.some > 0) {
      const t = s.fica ?? 1
      const nos: Ponto[] = [[-11, -3], [-5, -9], [1, -5], [7, -11], [12, -4]].map(([dx, dy]) => ({ x: s.cabeca.x + dx, y: s.cabeca.y - 6 + dy }))
      for (let i = 0; i < nos.length; i++) {
        const acende = limitar(t * 4 - i * .5) * fino
        if (acende <= 0) continue
        if (i > 0 && acende > .3) { fio(ctx, nos[i - 1], nos[i], 2.2 * fino, fundo); fio(ctx, nos[i - 1], nos[i], .9 * fino, meio) }
      }
      for (let i = 0; i < nos.length; i++) {
        const acende = limitar(t * 4 - i * .5) * fino
        if (acende > 0) brilho(ctx, nos[i].x, nos[i].y, (2 + Math.sin(ms * .02 + i * 1.7) * .6) * acende + .3, luz)
      }
    }
  },

  /** "The user charges up power and raises both its Defense and Sp. Def stats. The move can be used three times." */
  stockpile(s) {
    const { ctx } = s.c, [, meio, luz] = COR.reserva
    // GUARDAR: um orbe se forma acima da cabeça com três contas girando, cai
    // pra dentro do corpo (gulp) e a barriga pulsa um anel dourado.
    const fino = 1 - entrada(s.some)
    if (s.fica === null && s.some <= 0) {
      const k = saida(s.sobe), y = s.cabeca.y - 10
      for (let i = 0; i < 3; i++) {
        const a = s.c.ms * .016 + i * (Math.PI * 2 / 3), R = 9 * (1 - k * .55)
        conta(ctx, s.cabeca.x + Math.cos(a) * R, y + Math.sin(a) * R * .5, 1.5, meio)
      }
      conta(ctx, s.cabeca.x, y, 4.2 * k, meio); disco(ctx, s.cabeca.x - 1.2, y - 1.2, 1.4 * k, luz)
      return
    }
    const t = s.fica ?? 1, cai = entrada(limitar(t / .3))
    if (cai < 1) {
      const y = s.cabeca.y - 10 + (s.meio.y + 2 - s.cabeca.y + 10) * cai
      conta(ctx, s.cabeca.x, y, 4.2 * (1 - cai * .5), meio); disco(ctx, s.cabeca.x - 1, y - 1, 1.2, luz)
      return
    }
    for (let i = 0; i < 2; i++) {
      const e = limitar((t - .3) / .7 * 1.6 - i * .5)
      if (e <= 0 || e >= 1) continue
      anel(ctx, s.meio.x, s.meio.y + 2, (4 + saida(e) * 11) * fino, (3 + saida(e) * 8) * fino, 1.8 * (1 - e), i ? luz : meio)
    }
    if (t < .45) brilho(ctx, s.meio.x, s.meio.y + 2, 5 * (1 - (t - .3) / .15) + .8, luz)
  },

  /** "The user boosts the power of the Electric move it uses on the next turn. This also raises the user's Sp. Def stat." */
  charge(s) {
    const { ctx, ms } = s.c, cores = COR.carga
    // CARREGAR: seis raiozinhos nascem longe e CONVERGEM pro corpo em rodadas;
    // um anel aperta junto. No auge o corpo fica estalando, cheio.
    const fino = 1 - entrada(s.some)
    if (s.fica === null && s.some <= 0) {
      for (let i = 0; i < 6; i++) {
        const u = (ms / 230 + i / 6) % 1, a = i * Math.PI / 3 + .3
        const rng = rngSemeado(s.semente + i * 13 + Math.floor(ms / 60) * 5)
        const r1 = 24 - u * 16, r0 = r1 + 7, pts: Ponto[] = []
        for (let j = 0; j <= 3; j++) { const r = r0 + (r1 - r0) * (j / 3), d = (j % 3 ? (rng() - .5) * 4 : 0); pts.push({ x: s.meio.x + Math.cos(a) * r - Math.sin(a) * d, y: s.meio.y + Math.sin(a) * r * .85 + Math.cos(a) * d }) }
        const vida = Math.sin(u * Math.PI) * Math.min(1, s.sobe * 3)
        linha(ctx, pts, 2.8 * vida, ESCURO); linha(ctx, pts, 1.3 * vida, cores[1 + i % 2])
      }
      anel(ctx, s.meio.x, s.meio.y, 20 - 9 * saida(s.sobe), 17 - 8 * saida(s.sobe), 1.2 * s.sobe, cores[0])
      return
    }
    const t = s.fica ?? 1
    if (t < .2) brilho(ctx, s.meio.x, s.meio.y, 8 * (1 - t / .2) + 1, cores[2])
    const rng = rngSemeado(s.semente + Math.floor(ms / 70) * 131), n = s.c.pedir(5)
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2, r = 9 + rng() * 4, x = s.meio.x + Math.cos(a) * r, y = s.meio.y + Math.sin(a) * r * .85
      const pts: Ponto[] = [{ x, y }]
      for (let j = 1; j <= 3; j++) pts.push({ x: x + Math.cos(a) * j * 2.2 + (rng() - .5) * 4, y: y + Math.sin(a) * j * 2.2 + (rng() - .5) * 4 })
      linha(ctx, pts, 2.6 * fino, ESCURO); linha(ctx, pts, 1.2 * fino, cores[1 + i % 2])
    }
  },

  /** "The user manipulates magnetic fields, which raises the Defense and Sp. Def stats." */
  magnetic_flux(s) {
    const { ctx, ms } = s.c, [norte, sul, aco] = COR.polo
    // CAMPO: dois polos (vermelho em cima, azul embaixo) e três linhas de
    // campo de cada lado, tracejadas, com os traços CORRENDO de um polo ao outro.
    const forca = Math.min(1, s.sobe * 1.5) * (1 - entrada(s.some)), topo = s.meio.y - 14, base = s.meio.y + 11
    for (const lado of [-1, 1]) for (let i = 0; i < 3; i++) {
      const bojo = (8 + i * 6) * forca, n = 12
      for (let j = 0; j < n; j++) {
        const f0 = ((j + (ms * .004) % 1) / n) % 1, f1 = f0 + .045
        if (f1 > 1) continue
        const q = (f: number): Ponto => ({ x: s.meio.x + lado * Math.sin(f * Math.PI) * bojo, y: topo + (base - topo) * f })
        fio(ctx, q(f0), q(f1), 2.4 * forca, ESCURO); fio(ctx, q(f0), q(f1), 1.1 * forca, aco)
      }
    }
    for (const [y, cor] of [[topo, norte], [base, sul]] as const) {
      const k = recuo(limitar(s.sobe * 1.6)) * (1 - entrada(s.some))
      if (k < .1) continue
      poligono(ctx, [[s.meio.x - 4.6 * k, y - 2.8 * k], [s.meio.x + 4.6 * k, y - 2.8 * k], [s.meio.x + 4.6 * k, y + 2.8 * k], [s.meio.x - 4.6 * k, y + 2.8 * k]], ESCURO)
      poligono(ctx, [[s.meio.x - 3.4 * k, y - 1.7 * k], [s.meio.x + 3.4 * k, y - 1.7 * k], [s.meio.x + 3.4 * k, y + 1.7 * k], [s.meio.x - 3.4 * k, y + 1.7 * k]], cor)
      fio(ctx, { x: s.meio.x - 2.4 * k, y: y - .7 * k }, { x: s.meio.x + 1 * k, y: y - .7 * k }, .8, BRANCO)
    }
  },

  /** "The user throws up a sturdy wall that sharply raises its Defense stat." */
  barrier(s) {
    const { ctx } = s.c, [fundo, meio, luz] = COR.parede
    // PAREDE: uma grade de seis painéis sobe do chão na FRENTE de quem usa,
    // fileira por fileira, trava com um tranco e um reflexo corre por ela.
    const fino = 1 - entrada(s.some), x0 = s.meio.x + s.dir * 13, larg = 4.5, alt = 8
    for (let fila = 0; fila < 3; fila++) {
      const e = recuo(limitar(s.sobe * 1.8 - fila * .28)) * fino
      if (e <= .05) continue
      for (let col = 0; col < 2; col++) {
        const x = x0 + (col - .5) * (larg * 2 + 1.5) * 1, y = s.chao - 4 - fila * (alt + 1.5) * e
        const w = larg * Math.min(1, e), h = alt / 2 * Math.min(1, e)
        // Só a moldura do painel: a parede não tapa o que está atrás.
        traco(ctx, [{ x: x - w, y: y - h }, { x: x + w, y: y - h }, { x: x + w, y: y + h }, { x: x - w, y: y + h }, { x: x - w, y: y - h }], 1.3, (fila + col) % 2 ? meio : fundo)
        fio(ctx, { x: x - w + 1.2, y: y - h + 1.4 }, { x: x - w + 3.2, y: y - h + 1.4 }, .9, luz)
      }
    }
    if (s.fica !== null && s.fica < .5) {
      const y = s.chao - 2 - (s.fica / .5) * 32
      fio(ctx, { x: x0 - 10, y: y + 4 }, { x: x0 + 10, y: y - 4 }, 2.6, luz); fio(ctx, { x: x0 - 10, y: y + 7 }, { x: x0 + 10, y: y - 1 }, 1, BRANCO)
    }
  },

  /** "The user stares at flashing lights to focus its mind, drastically raising its Sp. Atk stat." */
  tail_glow(s) {
    const { ctx } = s.c, [fundo, meio, luz] = COR.vagalume
    // Uma LUZ atrás de quem usa (na cauda) pisca três vezes, cada piscada mais
    // forte e com mais raios; entre uma e outra, apaga de verdade.
    const fino = 1 - entrada(s.some), lugar = { x: s.meio.x - s.dir * 12, y: s.meio.y + 2 }
    const t = s.fica === null ? (s.some > 0 ? 1 : 0) : s.fica, piscada = Math.min(2, Math.floor(t * 3)), dentro = (t * 3) % 1
    const aceso = s.fica === null ? (s.some > 0 ? 1 : s.sobe * .4) : Math.sin(Math.min(1, dentro / .75) * Math.PI)
    const forca = (.5 + piscada * .3) * aceso * fino
    conta(ctx, lugar.x, lugar.y, 2 * fino, fundo)
    if (forca < .08) return
    const raios = 4 + piscada * 2
    for (let i = 0; i < raios; i++) {
      const a = (i / raios) * Math.PI * 2 + piscada * .4, r0 = 4 + forca * 3, r1 = r0 + 3 + forca * 6
      fio(ctx, { x: lugar.x + Math.cos(a) * r0, y: lugar.y + Math.sin(a) * r0 }, { x: lugar.x + Math.cos(a) * r1, y: lugar.y + Math.sin(a) * r1 }, 2.6 * forca, ESCURO)
      fio(ctx, { x: lugar.x + Math.cos(a) * r0, y: lugar.y + Math.sin(a) * r0 }, { x: lugar.x + Math.cos(a) * r1, y: lugar.y + Math.sin(a) * r1 }, 1.2 * forca, i % 2 ? luz : meio)
    }
    conta(ctx, lugar.x, lugar.y, (2.4 + forca * 2.6) * fino, meio); disco(ctx, lugar.x, lugar.y, (1 + forca * 1.6) * fino, luz)
    disco(ctx, lugar.x - .8, lugar.y - .8, .8 * forca, BRANCO)
  },
}

const peleDe = (id: string): Pele => comAcento(PELES[getAbility(id)?.type ?? 'NORMAL'], ...Object.values(COR).flat())

export const ENERGIAS_POR_GOLPE = montarFamilia(PERFIS_DE_ENERGIA, {
  desenhar: (p, c, id) => GOLPES[id](cena(p, c)),
  duracao: p => p.sobe + p.fica + p.some,
  contato: p => p.sobe,
  alcance: 46, margem: () => ({ cima: 54, baixo: 34, lados: 48 }), pele: peleDe,
})
