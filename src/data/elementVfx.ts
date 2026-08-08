// Arte real de efeito de golpe, por tipo elemental.
//
// O VFX de combate deste jogo nasceu 100% procedural (render/sprites.ts:
// `drawImpactBurst` e `drawAoeRing`, cor vinda de `colorForType`) porque nunca
// houve arte de golpe no repositorio — a nota antiga em CLAUDE.md ja previa o
// ponto de encaixe: "se spritesheets aparecerem, so plugam dentro do desenho".
// Este arquivo E esse encaixe.
//
// Oito tipos tem arte hoje (FOGO veio primeiro; AGUA, RAIO, NORMAL, GRAMA,
// INSETO, LUTADOR e PEDRA vieram no pedido seguinte). Todo tipo sem entrada
// aqui continua no desenho procedural, que segue sendo comportamento padrao e
// nao "modo degradado".
//
// Cada quadro e um PNG SOLTO de 32x32 (nao um spritesheet), porque e assim que
// o repositorio de origem publica. Nao ha `AnimData.xml` nem recorte: a
// animacao e a lista, na ordem. Procedencia e licenca em
// assets/move-vfx/CREDITOS.txt.
import type { ElementType } from './generated/types'

export interface VfxDeElemento {
  /** Impacto de alvo unico. */
  single: string[]
  /** Area de efeito — desenhado no diametro real do AOE. */
  aoe: string[]
  /**
   * Correcao de tamanho por tipo, multiplicando a escala base do desenho.
   *
   * Os quadros do repositorio de origem nao tem enquadramento padronizado: uns
   * preenchem os 32x32 (as nuvens), outros desenham um simbolo pequeno no
   * centro com muita margem transparente (`sting`, `sandblast`). Desenhados
   * todos no mesmo tamanho, os do segundo grupo saem visivelmente menores que o
   * efeito procedural que substituem — foi o que aconteceu na primeira
   * montagem, conferida com os quadros sobre o fundo real de hunt.
   */
  escala?: { single?: number; aoe?: number }
}

const RAIZ = 'assets/move-vfx'
const quadros = (pasta: string, ...nomes: string[]): string[] =>
  nomes.map((n) => `${RAIZ}/${pasta}/${n}.png`)

// A regra de montagem, igual pros oito: `single` e um impacto curto e denso
// (0,35s de vida), `aoe` conta explosao -> permanencia -> dissipacao ao longo
// dos 0,55s da area. Por isso varios AOE terminam num quadro de nuvem/poeira
// mais fraco que o primeiro: na ordem inversa pareceria o efeito acendendo
// depois do dano.
//
// Criterio de escolha, alem do tema: **contraste sobre o fundo real da hunt**.
// A primeira montagem usou `bog_flash`/`slime_wave` (GRAMA) e
// `shatter_wave_white` (LUTADOR); conferidos sobre `assets/hunt-backgrounds/`
// no tamanho de jogo, o verde-escuro sumia na grama e o cinza sumia em
// qualquer fundo. Trocados por arte de alto contraste. Um efeito invisivel e
// pior que o desenho procedural que ele substituiu.
export const VFX_POR_ELEMENTO: Partial<Record<ElementType, VfxDeElemento>> = {
  FIRE: {
    single: quadros('fire', 'flame0', 'flame1', 'flame2'),
    aoe: quadros('fire', 'fire_storm0', 'cloud_fire2', 'cloud_fire1', 'cloud_fire0'),
  },
  WATER: {
    // Redemoinho azul comprimido no impacto; na area ele abre como vortice
    // grande e some.
    single: quadros('water', 'permafrost_cold0', 'permafrost_cold1'),
    aoe: quadros('water', 'polar_vortex2', 'polar_vortex1'),
  },
  ELECTRIC: {
    // 5 arcos diferentes tocados em sequencia leem como faisca piscando —
    // eles sao variacoes da mesma descarga, nao 8 direcoes de projetil.
    single: quadros('electric', 'electric_arc0', 'electric_arc1', 'electric_arc2', 'electric_arc3', 'electric_arc4'),
    aoe: quadros('electric', 'strong_elec_shot0', 'strong_elec_shot1', 'strong_elec_shot2'),
  },
  NORMAL: {
    // Golpe fisico sem elemento: corte em meia-lua no alvo, onda de choque
    // circular quando e area.
    single: quadros('normal', 'sundering0', 'sundering1', 'sundering2', 'sundering3'),
    aoe: quadros('normal', 'shatter_wave_yellow0', 'shatter_wave_yellow1'),
  },
  GRASS: {
    // Do quadro mais denso pro mais ralo: o impacto ja acontece cheio e
    // desbota. Na ordem do arquivo (0,1,2) ele iria do ralo pro denso, ou seja,
    // o efeito ficaria mais forte DEPOIS do dano.
    single: quadros('grass', 'cloud_poison2', 'cloud_poison1', 'cloud_poison0'),
    aoe: quadros('grass', 'contam0', 'contam1', 'contam2', 'contam3'),
  },
  BUG: {
    // `sting` desenha um simbolo pequeno no centro de um quadro quase todo
    // transparente: no tamanho normal ele sai do tamanho de uma moeda.
    single: quadros('bug', 'sting0', 'sting1', 'sting2'),
    aoe: quadros('bug', 'cloud_meph2', 'cloud_meph1', 'cloud_meph0'),
    escala: { single: 2.2 },
  },
  FIGHTING: {
    single: quadros('fighting', 'manifold_assault0', 'manifold_assault1'),
    aoe: quadros('fighting', 'haemoclasm0', 'haemoclasm1', 'haemoclasm2', 'haemoclasm3'),
  },
  ROCK: {
    single: quadros('rock', 'sandblast0', 'sandblast1', 'sandblast2'),
    // Pedra estourando primeiro, poeira baixando depois.
    aoe: quadros('rock', 'shatter_wall0', 'shatter_wall1', 'cloud_dust0', 'cloud_dust2'),
    escala: { single: 1.7 },
  },
}

export function vfxDoElemento(tipo: string | undefined): VfxDeElemento | null {
  if (!tipo) return null
  return VFX_POR_ELEMENTO[tipo as ElementType] ?? null
}

/** Toda URL de quadro que existe — usado pelo preload. */
export function todosOsQuadrosDeVfx(): string[] {
  return Object.values(VFX_POR_ELEMENTO).flatMap((v) => [...v.single, ...v.aoe])
}
