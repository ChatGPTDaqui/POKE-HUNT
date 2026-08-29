// PH-189 — o rotulo (nome, nivel, barra de HP) ancorava no topo da MOLDURA do
// quadro PMD, nao no desenho.
//
// Quadros do Sprite Collab tem padding vazio pra animacao de bounce, e o padding
// varia por especie: medido em `scripts/harness/vao-do-rotulo.mjs`, o vao entre a
// cabeca e o rotulo ia de 0 a 11px conforme a especie (Steelix 11px, Houndoom
// 10px, Charmeleon de frente 0px). Esse vao vazio e exatamente a faixa que o
// texto de combate do vizinho invade.
//
// O que este arquivo tranca: o vao e o MESMO em especies com padding
// radicalmente diferente. Sem a ancoragem, Steelix e Charmeleon divergem em
// 11px e o teste reprova.
import { describe, expect, it } from 'vitest'

import { drawNameLevelTag } from './sprites'
import { footOffsetFraction } from '@/data/spriteFootOffsets'
import { topoOpacoFraction } from '@/data/spriteTopOffsets'
import { TOPO_OPACO_POR_ANIM } from '@/data/generated/spriteTopOffsets.generated'
import type { WorldEntity } from '@/engine/types'

function ctxEspiao() {
  const escritas: { texto: string; y: number }[] = []
  const alvo = {
    font: '', fillStyle: '', strokeStyle: '', lineWidth: 0, lineJoin: '', textAlign: '',
    save() {}, restore() {},
    fillText(texto: string, _x: number, y: number) { escritas.push({ texto, y }) },
    strokeText() {},
    measureText: (t: string) => ({ width: t.length * 6 }),
    beginPath() {}, closePath() {}, stroke() {}, fill() {}, moveTo() {}, arcTo() {},
  }
  return { ctx: alvo as unknown as CanvasRenderingContext2D, escritas }
}

const Y_DO_CORPO = 200

function entidade(speciesId: string, anim: string, frameHeight: number): WorldEntity {
  return {
    id: `e-${speciesId}`, x: 100, y: Y_DO_CORPO, radius: 16,
    // Fileira 0 = Down (ver `animationSystem#SECTOR_TO_ROW`): a pose de frente,
    // que e a que a bancada mediu.
    facing: { x: 0, y: 1 },
    battleAnim: { name: anim, frameWidth: 32, frameHeight, url: '', durations: [8] },
    poke: { speciesId, level: 20, hp: 50, stats: { hp: 100 }, isShiny: false, ivs: {} },
  } as unknown as WorldEntity
}

/**
 * Onde o primeiro pixel opaco da sprite cai, em coordenada de mundo.
 *
 * Repete a geometria de `spriteBounds` de proposito — e a unica forma de ter uma
 * regua INDEPENDENTE do que `visualTopOffset` faz. Se as duas contas
 * divergirem, o vao medido abaixo deixa de ser constante e o teste reprova, que
 * e exatamente o que ele existe pra pegar.
 */
function topoVisivel(entity: WorldEntity): number {
  const anim = entity.battleAnim!
  const especie = entity.poke.speciesId
  const pe = footOffsetFraction(especie)
  const topo = topoOpacoFraction(especie, anim.name, 0)
  const chao = entity.y + anim.frameHeight * pe
  const moldura = chao - anim.frameHeight * (0.5 + pe)
  return moldura + anim.frameHeight * topo
}

/** Distancia entre o primeiro pixel opaco e a baseline do NOME. */
function vao(entity: WorldEntity): number {
  const { ctx, escritas } = ctxEspiao()
  drawNameLevelTag(ctx, entity)
  const nome = escritas.find((e) => !e.texto.startsWith('Lv'))!
  return topoVisivel(entity) - nome.y
}

// Extremos reais do acervo, medidos pela bancada: Steelix tem 11px de padding
// vazio de frente e Charmeleon (que cai no Walk, sem Idle proprio) tem 0.
const STEELIX = entidade('steelix', 'Idle', 112)
const CHARMELEON = entidade('charmeleon', 'Walk', 32)
const HOUNDOOM = entidade('houndoom', 'Idle', 64)

describe('vao entre a cabeca e o rotulo (PH-189)', () => {
  it('a bancada continua valendo: as especies escolhidas tem padding bem diferente', () => {
    // Guarda anti-teste-vacuo: se um reexport da arte zerasse o padding das
    // tres, o caso seguinte passaria sem provar nada.
    const padding = (e: WorldEntity) =>
      e.battleAnim!.frameHeight * topoOpacoFraction(e.poke.speciesId, e.battleAnim!.name, 0)
    expect(padding(STEELIX)).toBeGreaterThan(8)
    expect(padding(HOUNDOOM)).toBeGreaterThan(8)
    expect(padding(CHARMELEON)).toBe(0)
  })

  it('o vao e o MESMO nos tres, apesar dos 11px de diferenca de padding', () => {
    expect(vao(CHARMELEON)).toBeCloseTo(vao(STEELIX), 6)
    expect(vao(CHARMELEON)).toBeCloseTo(vao(HOUNDOOM), 6)
  })

  it('a fileira de direcao entra na conta — a silhueta de perfil e mais alta', () => {
    const deFrente = topoOpacoFraction('houndoom', 'Idle', 0)
    const deLado = topoOpacoFraction('houndoom', 'Idle', 4)
    expect(deLado).toBeLessThan(deFrente)
  })

  it('especie sem medicao cai no comportamento antigo, e nao num chute', () => {
    // Zero = ancora na moldura, como antes. Um padrao "medio" colaria o rotulo
    // DENTRO da cabeca de quem tem pouco padding, que e dano e nao so feiura.
    expect(topoOpacoFraction('especie-que-nao-existe', 'Idle', 0)).toBe(0)
  })

  it('a tabela gerada cobre o acervo inteiro de battle sprites', () => {
    // 245 das 246 pastas de `assets/battle-sprites` — a que falta nao tem
    // geometria declarada em `battleSpriteAnims.ts` e por isso nunca e desenhada.
    expect(Object.keys(TOPO_OPACO_POR_ANIM).length).toBeGreaterThanOrEqual(245)
  })
})
