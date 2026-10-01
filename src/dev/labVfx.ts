// Laboratorio de VFX de golpe (lab-vfx.html) — `vite dev` e staging, nunca producao.
//
// E a cena do lab v2 aprovado pelo dono (28/09), agora usando os MODULOS REAIS:
// coreografia do registro de tipo, pele, pixelizador. Mostra o golpe INTEIRO —
// atacante, viagem, impacto, reacao do alvo, numero de dano, o que sobra — ao
// lado da tira PNG atual. A licao da sessao: impacto solto, sem cena, nao
// emociona e engana a avaliacao.
//
// Um tipo por sessao: cada sessao acrescenta o seu tipo em TIPOS_DO_LAB.
import { AOE_RADIUS, getAbility } from '@/data/abilities'
import { BATTLE_SPRITE_ANIMS, type AnimName } from '@/data/battleSpriteAnims'
import type { ElementType } from '@/data/generated/types'
import { vfxDoGolpe } from '@/data/moveVfx'
import { tiraDeAreaDoElemento, tiraDoElemento, type TiraDeVfx } from '@/data/vfxTiras'
import { hashTexto, rngSemeado } from '@/render/vfx/aleatorio'
import { AGUA_AREA, AGUA_SINGLE, VITRINE_DA_AGUA } from '@/render/vfx/coreografias/agua'
import { ELETRICO_AREA, ELETRICO_SINGLE, VITRINE_DO_ELETRICO } from '@/render/vfx/coreografias/eletrico'
import { FOGO_AREA, FOGO_SINGLE, VITRINE_DO_FOGO } from '@/render/vfx/coreografias/fogo'
import { GRAMA_AREA, GRAMA_SINGLE, VITRINE_DA_GRAMA } from '@/render/vfx/coreografias/grama'
import { LUTADOR_AREA, LUTADOR_SINGLE, VITRINE_DO_LUTADOR } from '@/render/vfx/coreografias/lutador'
import { NORMAL_AREA, NORMAL_SINGLE, VITRINE_DO_NORMAL } from '@/render/vfx/coreografias/normal'
import { TERRA_AREA, TERRA_SINGLE, VITRINE_DA_TERRA } from '@/render/vfx/coreografias/terra'
import { VENENO_AREA, VENENO_SINGLE, VITRINE_DO_VENENO } from '@/render/vfx/coreografias/veneno'
import { VITRINE_DO_VOADOR, VOADOR_AREA, VOADOR_SINGLE } from '@/render/vfx/coreografias/voador'
import { PSIQUICO_AREA, PSIQUICO_SINGLE, VITRINE_DO_PSIQUICO } from '@/render/vfx/coreografias/psiquico'
import { semAcabamento } from '@/render/vfx/acabamento'
import { retanguloDoEfeito } from '@/render/vfx/desenharVfx'
import { PELES, paletaDaPele } from '@/render/vfx/paletas'
import { desenharPixelizado } from '@/render/vfx/pixelizador'
import type { EntradaDeCoreografia, Tier } from '@/render/vfx/tipos'

// ---------------------------------------------------------------------------
// Catalogo do lab: tipo -> 7 golpes-vitrine
// ---------------------------------------------------------------------------

interface GolpeDoLab {
  id: string; tipo: ElementType; area: boolean; tier: Tier; entrada: EntradaDeCoreografia; atacante: string
  /** Piloto de metodo novo: a esquerda mostra ESTA coreografia (a atual) no lugar da tira. */
  antes?: EntradaDeCoreografia
}

const TIPOS_DO_LAB: Partial<Record<ElementType, GolpeDoLab[]>> = {
  FIRE: [
    ...([1, 2, 3, 4] as const).map(t => ({ id: VITRINE_DO_FOGO.single[t], tipo: 'FIRE' as const, area: false, tier: t, entrada: FOGO_SINGLE[t], atacante: 'charmander' })),
    ...([1, 2, 3] as const).map(t => ({ id: VITRINE_DO_FOGO.area[t], tipo: 'FIRE' as const, area: true, tier: t, entrada: FOGO_AREA[t], atacante: 'charmander' })),
  ],
  ELECTRIC: [
    ...([1, 2, 3, 4] as const).map(t => ({ id: VITRINE_DO_ELETRICO.single[t], tipo: 'ELECTRIC' as const, area: false, tier: t, entrada: ELETRICO_SINGLE[t], atacante: 'pikachu' })),
    ...([1, 2, 3] as const).map(t => ({ id: VITRINE_DO_ELETRICO.area[t], tipo: 'ELECTRIC' as const, area: true, tier: t, entrada: ELETRICO_AREA[t], atacante: 'pikachu' })),
  ],
  WATER: [
    ...([1, 2, 3, 4] as const).map(t => ({ id: VITRINE_DA_AGUA.single[t], tipo: 'WATER' as const, area: false, tier: t, entrada: AGUA_SINGLE[t], atacante: 'squirtle' })),
    ...([1, 2, 3] as const).map(t => ({ id: VITRINE_DA_AGUA.area[t], tipo: 'WATER' as const, area: true, tier: t, entrada: AGUA_AREA[t], atacante: 'squirtle' })),
  ],
  GRASS: [
    ...([1, 2, 3, 4] as const).map(t => ({ id: VITRINE_DA_GRAMA.single[t], tipo: 'GRASS' as const, area: false, tier: t, entrada: GRAMA_SINGLE[t], atacante: 'bulbasaur' })),
    ...([1, 2, 3] as const).map(t => ({ id: VITRINE_DA_GRAMA.area[t], tipo: 'GRASS' as const, area: true, tier: t, entrada: GRAMA_AREA[t], atacante: 'bulbasaur' })),
  ],
  NORMAL: [
    ...([1, 2, 3, 4] as const).map(t => ({ id: VITRINE_DO_NORMAL.single[t], tipo: 'NORMAL' as const, area: false, tier: t, entrada: NORMAL_SINGLE[t], atacante: 'eevee' })),
    ...([1, 2, 3] as const).map(t => ({ id: VITRINE_DO_NORMAL.area[t], tipo: 'NORMAL' as const, area: true, tier: t, entrada: NORMAL_AREA[t], atacante: 'eevee' })),
  ],
  // Sem A1: nenhum golpe de lutador cai nele (ver coreografias/lutador.ts).
  FIGHTING: [
    ...([1, 2, 3, 4] as const).map(t => ({ id: VITRINE_DO_LUTADOR.single[t], tipo: 'FIGHTING' as const, area: false, tier: t, entrada: LUTADOR_SINGLE[t], atacante: 'machop' })),
    ...([2, 3] as const).map(t => ({ id: VITRINE_DO_LUTADOR.area[t], tipo: 'FIGHTING' as const, area: true, tier: t, entrada: LUTADOR_AREA[t]!, atacante: 'machop' })),
  ],
  FLYING: [
    ...([1, 2, 3, 4] as const).map(t => ({ id: VITRINE_DO_VOADOR.single[t], tipo: 'FLYING' as const, area: false, tier: t, entrada: VOADOR_SINGLE[t], atacante: 'pidgey' })),
    ...([1, 2, 3] as const).map(t => ({ id: VITRINE_DO_VOADOR.area[t], tipo: 'FLYING' as const, area: true, tier: t, entrada: VOADOR_AREA[t], atacante: 'pidgey' })),
  ],
  POISON: [
    ...([1, 2, 3, 4] as const).map(t => ({ id: VITRINE_DO_VENENO.single[t], tipo: 'POISON' as const, area: false, tier: t, entrada: VENENO_SINGLE[t], atacante: 'ekans' })),
    ...([1, 2, 3] as const).map(t => ({ id: VITRINE_DO_VENENO.area[t], tipo: 'POISON' as const, area: true, tier: t, entrada: VENENO_AREA[t], atacante: 'ekans' })),
  ],
  GROUND: [
    ...([1, 2, 3, 4] as const).map(t => ({ id: VITRINE_DA_TERRA.single[t], tipo: 'GROUND' as const, area: false, tier: t, entrada: TERRA_SINGLE[t], atacante: 'sandshrew' })),
    ...([1, 2, 3] as const).map(t => ({ id: VITRINE_DA_TERRA.area[t], tipo: 'GROUND' as const, area: true, tier: t, entrada: TERRA_AREA[t], atacante: 'sandshrew' })),
  ],
  PSYCHIC: [
    ...([1, 2, 3, 4] as const).map(t => ({ id: VITRINE_DO_PSIQUICO.single[t], tipo: 'PSYCHIC' as const, area: false, tier: t, entrada: PSIQUICO_SINGLE[t], atacante: 'espeon' })),
    ...([2, 3] as const).map(t => ({ id: VITRINE_DO_PSIQUICO.area[t], tipo: 'PSYCHIC' as const, area: true, tier: t, entrada: PSIQUICO_AREA[t]!, atacante: 'espeon' })),
  ],
}

// Acabamento de impacto (01/10): fora o FIRE (que tem o dele dentro de cada
// golpe), a esquerda mostra a coreografia SEM o acabamento, pra comparar.
for (const [tipo, golpes] of Object.entries(TIPOS_DO_LAB)) {
  if (tipo === 'FIRE') continue
  for (const g of golpes!) {
    const e = g.entrada
    g.antes ??= { ...e, desenhar: c => semAcabamento(() => e.desenhar(c)) }
  }
}

// ---------------------------------------------------------------------------
// Escala do jogo (ver render/escalaDoMundo.ts e subBiomaCollision de plains.jpg)
// ---------------------------------------------------------------------------

const ARTE = { escala: 0.8, x: -162.4, y: -149.6 }
const SPAWN = { x: 730, y: 830 }
const TURNO = 1700
/** Altura do "peito" acima do pe — o mesmo `radius * 0.6` do combatSystem. */
const PEITO = 12

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const opt: { velocidade: number; zoom: number; pixel: boolean; congelado: number | null } = { velocidade: 1, zoom: 2.5, pixel: true, congelado: null }

const imagens = new Map<string, HTMLImageElement>()
function imagem(url: string): HTMLImageElement {
  let i = imagens.get(url)
  if (!i) { i = new Image(); i.src = url; imagens.set(url, i) }
  return i
}
const fundo = imagem('/assets/hunt-backgrounds/plains.jpg')

/**
 * Linha da folha PMD pra quem olha na direcao (dx, dy). As 8 linhas sao:
 * baixo, baixo-dir, dir, cima-dir, cima, cima-esq, esq, baixo-esq.
 */
function linhaDaDirecao(dx: number, dy: number): number {
  const oitavo = Math.round(((Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8 // 0 dir, 2 baixo, 4 esq, 6 cima
  return [2, 1, 0, 7, 6, 5, 4, 3][oitavo]
}

// ---------------------------------------------------------------------------
// Entidade com sprite PMD real
// ---------------------------------------------------------------------------

const tinta = document.createElement('canvas')

class Ent {
  anim: AnimName = 'Idle'
  inicio = 0
  cor: string | null = null
  nome: string; x: number; y: number; linha: number
  constructor(nome: string, x: number, y: number, linha: number) {
    this.nome = nome; this.x = x; this.y = y; this.linha = linha
  }

  tocar(anim: AnimName, agora: number): void {
    if (BATTLE_SPRITE_ANIMS[this.nome]?.[anim]) { this.anim = anim; this.inicio = agora }
  }

  desenhar(ctx: CanvasRenderingContext2D, agora: number): void {
    const anims = BATTLE_SPRITE_ANIMS[this.nome]
    let meta = anims?.[this.anim]
    if (!anims || !meta) return
    let ticks = ((agora - this.inicio) * 60) / 1000
    const total = meta.durations.reduce((a, b) => a + b, 0)
    if (this.anim !== 'Idle' && ticks >= total) { this.anim = 'Idle'; this.inicio = agora; meta = anims.Idle!; ticks = 0 }
    if (this.anim === 'Idle') ticks %= meta.durations.reduce((a, b) => a + b, 0)
    let q = 0, acc = 0
    while (q < meta.durations.length - 1 && acc + meta.durations[q] <= ticks) acc += meta.durations[q++]
    ctx.fillStyle = 'rgba(30,50,20,.28)'
    ctx.beginPath(); ctx.ellipse(this.x, this.y + 11, 10, 3.5, 0, 0, 7); ctx.fill()
    const folha = imagem(`/assets/battle-sprites/${this.nome}/${this.anim}-Anim.png`)
    if (!folha.complete || !folha.naturalWidth) return
    const { frameWidth: fw, frameHeight: fh } = meta
    const x = Math.round(this.x - fw / 2), y = Math.round(this.y - fh / 2)
    if (!this.cor) { ctx.drawImage(folha, q * fw, this.linha * fh, fw, fh, x, y, fw, fh); return }
    // Silhueta chapada: o flash de impacto dos tiers 3 e 4.
    tinta.width = fw; tinta.height = fh
    const tc = tinta.getContext('2d')!
    tc.drawImage(folha, q * fw, this.linha * fh, fw, fh, 0, 0, fw, fh)
    tc.globalCompositeOperation = 'source-in'; tc.fillStyle = this.cor; tc.fillRect(0, 0, fw, fh)
    ctx.drawImage(tinta, x, y)
  }
}

// ---------------------------------------------------------------------------
// Cena
// ---------------------------------------------------------------------------

interface Numero { x: number; y: number; t0: number; v: string }
interface Tinta { ent: Ent; cor: string | null; em: number }

class Cena {
  canvas = document.createElement('canvas')
  t = 0 // relogio do par (congela no hit-stop)
  real = 0
  paradoAte = 0
  golpe!: GolpeDoLab
  atk!: Ent
  alvos: Ent[] = []
  figurantes: Ent[] = []
  numeros: Numero[] = []
  tintas: Tinta[] = []
  turnoT0 = 0
  proximoTurno = 0
  turnoId = 0
  impactosFeitos = 0
  Z = 1; vw = 0; vh = 0; cam = { x: 0, y: 0 }

  raiz: HTMLElement
  modo: 'tira' | 'anime'
  constructor(raiz: HTMLElement, modo: 'tira' | 'anime') {
    this.raiz = raiz; this.modo = modo
    raiz.append(this.canvas)
    new ResizeObserver(() => this.medir()).observe(raiz)
  }

  medir(): void {
    const r = this.raiz.getBoundingClientRect(), d = devicePixelRatio || 1
    this.canvas.width = Math.round(r.width * d); this.canvas.height = Math.round(r.height * d)
    this.Z = opt.zoom * d
    this.vw = this.canvas.width / this.Z; this.vh = this.canvas.height / this.Z
    this.cam = { x: SPAWN.x - this.vw / 2, y: SPAWN.y - this.vh / 2 }
  }

  montar(golpe: GolpeDoLab): void {
    this.golpe = golpe
    this.t = 0; this.paradoAte = 0; this.numeros = []; this.tintas = []; this.proximoTurno = 0; this.turnoId = 0
    if (golpe.area) {
      // Area: quem lanca no meio, tres alvos espalhados DENTRO do raio real.
      this.atk = new Ent(golpe.atacante, SPAWN.x, SPAWN.y, 0)
      this.alvos = [
        new Ent('doduo', SPAWN.x - 70, SPAWN.y - 30, linhaDaDirecao(70, 30)),
        new Ent('pidgey', SPAWN.x + 80, SPAWN.y - 10, linhaDaDirecao(-80, 10)),
        new Ent('rattata', SPAWN.x + 20, SPAWN.y + 60, linhaDaDirecao(-20, -60)),
      ]
      this.figurantes = []
    } else {
      this.atk = new Ent(golpe.atacante, SPAWN.x - 24, SPAWN.y - 4, linhaDaDirecao(46, 10))
      this.alvos = [new Ent('doduo', SPAWN.x + 22, SPAWN.y + 6, linhaDaDirecao(-46, -10))]
      this.figurantes = [new Ent('doduo', SPAWN.x - 90, SPAWN.y - 50, 0), new Ent('pidgey', SPAWN.x + 95, SPAWN.y - 35, 7)]
    }
  }

  passo(dtReal: number): void {
    this.real += dtReal
    // Storyboard: o quadro exato de `congelado` ms, sem andar o relogio.
    if (opt.congelado !== null) this.t = this.turnoT0 + opt.congelado
    else this.t += this.real < this.paradoAte ? 0 : dtReal * opt.velocidade
    if (this.t >= this.proximoTurno) {
      this.turnoT0 = this.t; this.proximoTurno = this.t + TURNO; this.turnoId++; this.impactosFeitos = 0
      this.atk.tocar('Attack', this.t)
    }
    const ms = this.t - this.turnoT0
    const entrada = this.modo === 'anime' ? this.golpe.entrada : this.golpe.antes
    const impactos = entrada ? (entrada.impactos?.[this.golpe.tier] ?? []) : [200]
    while (this.impactosFeitos < impactos.length && ms >= impactos[this.impactosFeitos]) {
      this.reagir(this.impactosFeitos === 0)
      this.impactosFeitos++
    }
    // Trocas de cor da silhueta no relogio REAL: o flash nao congela no hit-stop.
    this.tintas = this.tintas.filter(tt => { if (this.real >= tt.em) { tt.ent.cor = tt.cor; return false } return true })
    this.numeros = this.numeros.filter(n => this.t - n.t0 < 700)
  }

  /** A reacao do alvo: o que faz o golpe "doer" — Hurt, silhueta, hit-stop, numero. */
  reagir(primeiro: boolean): void {
    const tier = this.golpe.tier
    const forte = (this.modo === 'anime' || !!this.golpe.antes) && tier >= 3
    for (const a of this.alvos) {
      a.tocar('Hurt', this.t)
      if (forte) {
        a.cor = '#ffffff'
        this.tintas.push({ ent: a, cor: '#1a1024', em: this.real + 45 }, { ent: a, cor: null, em: this.real + 90 })
      } else if (primeiro) {
        a.cor = '#ffffff'
        this.tintas.push({ ent: a, cor: null, em: this.real + 60 })
      }
      if (primeiro) this.numeros.push({ x: a.x, y: a.y - 26, t0: this.t, v: '-' + (120 + (hashTexto(a.nome + this.turnoId) % 300)) })
    }
    if (forte && primeiro) this.paradoAte = this.real + (tier >= 4 ? 90 : 60)
  }

  desenhar(): void {
    const c = this.canvas.getContext('2d')!, Z = this.Z, cam = this.cam
    c.setTransform(1, 0, 0, 1, 0, 0); c.imageSmoothingEnabled = true
    if (fundo.complete && fundo.naturalWidth) {
      c.drawImage(fundo, (cam.x - ARTE.x) / ARTE.escala, (cam.y - ARTE.y) / ARTE.escala, this.vw / ARTE.escala, this.vh / ARTE.escala, 0, 0, this.canvas.width, this.canvas.height)
    }
    c.setTransform(Z, 0, 0, Z, -cam.x * Z, -cam.y * Z); c.imageSmoothingEnabled = false
    const todos = [...this.figurantes, this.atk, ...this.alvos].sort((a, b) => a.y - b.y)
    for (const e of todos) e.desenhar(c, this.figurantes.includes(e) ? this.real : this.t)

    const ms = this.t - this.turnoT0
    if (this.modo === 'anime') this.desenharAnime(c, ms, this.golpe.entrada)
    else if (this.golpe.antes) this.desenharAnime(c, ms, this.golpe.antes)
    else this.desenharTira(c, ms)

    c.font = 'bold 9px system-ui'; c.textAlign = 'center'; c.lineJoin = 'round'
    for (const n of this.numeros) {
      const f = (this.t - n.t0) / 700, y = n.y - 10 * (1 - (1 - f) ** 3)
      c.globalAlpha = 1 - f ** 3
      c.strokeStyle = '#000'; c.lineWidth = 2.5; c.strokeText(n.v, n.x, y)
      c.fillStyle = '#fff'; c.fillText(n.v, n.x, y)
    }
    c.globalAlpha = 1
  }

  pontos(): { origem: { x: number; y: number }; alvo: { x: number; y: number } } {
    const origem = { x: this.atk.x, y: this.atk.y - PEITO }
    const alvo = this.golpe.area ? origem : { x: this.alvos[0].x, y: this.alvos[0].y - PEITO }
    return { origem, alvo }
  }

  desenharAnime(c: CanvasRenderingContext2D, ms: number, entrada: EntradaDeCoreografia): void {
    const g = this.golpe
    const duracao = entrada.duracao[g.tier] ?? 1000
    if (ms > duracao) return
    const { origem, alvo } = this.pontos()
    const raio = g.area ? AOE_RADIUS : 0
    const pele = PELES[g.tipo]
    const pintar = (ctx: CanvasRenderingContext2D) => entrada.desenhar({
      ctx, ms, duracao, origem, alvo, raio, tier: g.tier, pele,
      angulo: g.area ? 0 : Math.atan2(alvo.y - origem.y, alvo.x - origem.x),
      rng: rngSemeado(hashTexto(`lab-${this.turnoId}`)),
      pedir: n => n,
    })
    if (opt.pixel) desenharPixelizado(c, retanguloDoEfeito(origem, alvo, entrada.alcance, raio), paletaDaPele(pele), pintar)
    else pintar(c)
  }

  /** Aproximacao do `drawQuadroDeTira` atual: a tira do golpe, ou a do tipo, a 10 fps. */
  desenharTira(c: CanvasRenderingContext2D, ms: number): void {
    const g = this.golpe
    const tipo = g.tipo
    const arte = vfxDoGolpe(g.id)
    const tira: TiraDeVfx | null = g.area ? (arte?.aoe ?? tiraDeAreaDoElemento(tipo)) : (arte?.single ?? tiraDoElemento(tipo))
    if (!tira) return
    const img = imagem('/' + tira.url)
    if (!img.complete || !img.naturalWidth) return
    const q = Math.floor(ms / 100)
    if (q >= Math.max(tira.quadros, 10)) return
    const fw = img.naturalWidth / tira.quadros, fh = img.naturalHeight
    const tam = g.area ? AOE_RADIUS * 2 * 1.15 : 44 * 1.05 * (tira.escala ?? 1)
    const h = (tam * fh) / fw
    const { origem, alvo } = this.pontos()
    const dir = tira.direcional
    const ang = dir ? Math.atan2(alvo.y - origem.y, alvo.x - origem.x) - (dir.anguloBaseGraus * Math.PI) / 180 : 0
    c.save(); c.translate(alvo.x, alvo.y); c.rotate(ang)
    c.drawImage(img, Math.min(q, tira.quadros - 1) * fw, 0, fw, fh, -tam * (dir?.ancoraX ?? 0.5), -h / 2, tam, h)
    c.restore()
  }
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

const cenas = [new Cena($('cena-tira'), 'tira'), new Cena($('cena-anime'), 'anime')]
let tipoAtual: ElementType = 'FIRE'
let golpeAtual = 2

function montarBotoes(): void {
  const barra = $('golpes')
  barra.innerHTML = ''
  ;(TIPOS_DO_LAB[tipoAtual] ?? []).forEach((g, i) => {
    const b = document.createElement('button')
    b.textContent = `${g.area ? 'Área' : 'Single'} T${g.tier} · ${getAbility(g.id)?.name ?? g.id}`
    b.className = i === golpeAtual ? 'on' : ''
    b.onclick = () => { golpeAtual = i; montarBotoes(); reiniciar() }
    barra.append(b)
  })
}

function reiniciar(): void {
  const g = TIPOS_DO_LAB[tipoAtual]![golpeAtual]
  const escolhido = Number($<HTMLSelectElement>('zoom').value)
  // Area com o raio real (175) nao cabe no zoom de perto: abre a camera.
  opt.zoom = g.area ? Math.min(escolhido, 1.2) : escolhido
  for (const c of cenas) { c.medir(); c.montar(g) }
  $('titulo-tira').textContent = g.antes ? 'Atual: sem acabamento de impacto' : 'Atual: tira PNG'
  $('titulo-anime').textContent = g.antes ? 'Novo: com acabamento de impacto' : 'Proposta: coreografia anime pixel'
}

const tipoSel = $<HTMLSelectElement>('tipo')
for (const t of Object.keys(TIPOS_DO_LAB)) tipoSel.add(new Option(t, t))
tipoSel.onchange = () => { tipoAtual = tipoSel.value as ElementType; golpeAtual = 0; montarBotoes(); reiniciar() }
$<HTMLSelectElement>('velocidade').onchange = e => { opt.velocidade = Number((e.target as HTMLSelectElement).value) }
$<HTMLSelectElement>('zoom').onchange = () => reiniciar()
$<HTMLSelectElement>('render').onchange = e => { opt.pixel = (e.target as HTMLSelectElement).value === 'pixel' }

montarBotoes()
reiniciar()

// Gancho do storyboard, por atributo (funciona de fora do mundo da pagina):
// <body data-lab-congelar="ms|vazio" data-lab-golpe="TIPO:indice">.
new MutationObserver(() => {
  const d = document.body.dataset
  opt.congelado = d.labCongelar ? Number(d.labCongelar) : null
  if (d.labGolpe) {
    const [tipo, i] = d.labGolpe.split(':')
    delete d.labGolpe
    tipoAtual = tipo as ElementType; tipoSel.value = tipo; golpeAtual = Number(i); montarBotoes(); reiniciar()
  }
  // Desenha na hora: com a aba em segundo plano o requestAnimationFrame para.
  // Duas vezes: a primeira abre o turno, a segunda chega no ms pedido.
  if (opt.congelado !== null) for (const c of cenas) {
    c.passo(0); c.passo(0)
    // O flash da silhueta anda no relogio real, que parado nao anda: limpa.
    for (const a of c.alvos) a.cor = null
    c.desenhar()
  }
}).observe(document.body, { attributes: true })

let antes = performance.now()
function quadro(agora: number): void {
  const dt = Math.min(50, agora - antes); antes = agora
  for (const c of cenas) {
    const t0 = performance.now()
    c.passo(dt); c.desenhar()
    $(`stat-${c.modo}`).textContent = `${(performance.now() - t0).toFixed(2)} ms/quadro · câmera ${c.vw | 0}×${c.vh | 0} un.`
  }
  requestAnimationFrame(quadro)
}
requestAnimationFrame(quadro)
