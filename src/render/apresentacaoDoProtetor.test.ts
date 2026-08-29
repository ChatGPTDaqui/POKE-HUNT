// PH-228/236: protetor (EnemyEntity.isProtetor) tinha ZERO pista visual
// distinta de mob comum — motor correto (spawn normal suspenso), so faltava
// a apresentacao. `LEGENDARY_SPECIES_IDS` (Modo Pesadelo) ja tinha barra de
// HP grande; este arquivo tranca que o protetor por sala/andar (isProtetor)
// ganha o MESMO tratamento mais 3 sinais novos: sprite maior, tag "GUARDIAN"/
// "LORD" no nome (conforme o tipo, PH-236), aura pulsante.
import { describe, expect, it } from 'vitest'

import { drawEntity, drawHpBar, drawNameLevelTag } from './sprites'
import { LEGENDARY_SPECIES_IDS } from '@/data/legendaries'
import type { WorldEntity } from '@/engine/types'

function ctxEspiao() {
  const escritas: string[] = []
  const retangulos: { x: number; w: number }[] = []
  let auraDesenhada = false
  let ultimoMoveTo: { x: number } | null = null
  const alvo = {
    font: '', fillStyle: '', strokeStyle: '', lineWidth: 0, lineJoin: '', textAlign: '', globalAlpha: 1,
    save() {}, restore() {},
    fillText(texto: string) { escritas.push(texto) },
    strokeText() {},
    beginPath() {}, closePath() {}, stroke() {}, fill() {}, arc() {},
    moveTo(x: number) { ultimoMoveTo = { x } },
    arcTo(x: number) {
      if (ultimoMoveTo) {
        retangulos.push({ x: ultimoMoveTo.x, w: x - ultimoMoveTo.x })
        ultimoMoveTo = null // so a PRIMEIRA arcTo de cada roundedRectPath fecha o par
      }
    },
    ellipse() {},
    createRadialGradient() {
      auraDesenhada = true
      return { addColorStop() {} } as unknown as CanvasGradient
    },
  }
  return { ctx: alvo as unknown as CanvasRenderingContext2D, escritas, retangulos, auraDesenhada: () => auraDesenhada }
}

function entidade(isProtetor: boolean, speciesId = 'charizard'): WorldEntity {
  return {
    id: 'e1', x: 100, y: 100, radius: 16, battleAnim: null, facing: 'down',
    isProtetor,
    poke: { speciesId, level: 30, isShiny: false, hp: 50, stats: { hp: 100 }, ivs: {} },
  } as unknown as WorldEntity
}

describe('tag "GUARDIAN"/"LORD" no nome (PH-228/236)', () => {
  it('protetor ganha a tag, mob comum nao', () => {
    const { ctx, escritas } = ctxEspiao()
    drawNameLevelTag(ctx, entidade(true), 'guardian')
    expect(escritas.some((t) => t.includes('GUARDIAN'))).toBe(true)

    const semProtetor = ctxEspiao()
    drawNameLevelTag(semProtetor.ctx, entidade(false), 'guardian')
    expect(semProtetor.escritas.some((t) => t.includes('GUARDIAN') || t.includes('LORD'))).toBe(false)
  })

  it('tipo lord mostra LORD, tipo guardian (ou tipo ausente) mostra GUARDIAN', () => {
    const doLord = ctxEspiao()
    drawNameLevelTag(doLord.ctx, entidade(true), 'lord')
    expect(doLord.escritas.some((t) => t.includes('LORD'))).toBe(true)
    expect(doLord.escritas.some((t) => t.includes('GUARDIAN'))).toBe(false)

    const doGuardian = ctxEspiao()
    drawNameLevelTag(doGuardian.ctx, entidade(true), 'guardian')
    expect(doGuardian.escritas.some((t) => t.includes('GUARDIAN'))).toBe(true)

    // Sem tipo (nao deveria acontecer em produção com isProtetor=true, mas
    // e a rede de seguranca): cai no fallback GUARDIAN, nunca undefined na tela.
    const semTipo = ctxEspiao()
    drawNameLevelTag(semTipo.ctx, entidade(true))
    expect(semTipo.escritas.some((t) => t.includes('GUARDIAN'))).toBe(true)
  })
})

describe('barra de HP maior pro protetor (PH-228)', () => {
  it('largura da barra do protetor e maior que a do mob comum', () => {
    const doProtetor = ctxEspiao()
    drawHpBar(doProtetor.ctx, entidade(true))
    const doMob = ctxEspiao()
    drawHpBar(doMob.ctx, entidade(false))

    expect(doProtetor.retangulos[0].w).toBeGreaterThan(doMob.retangulos[0].w)
  })

  // PH-256: a barra grande tem UM dono, e o lendario nao e ele.
  //
  // Enquanto `drawHpBar` testava `ehProtetor(entity) || LEGENDARY_SPECIES_IDS
  // .includes(...)`, um lendario em campo desenhava 160x10 contra os 32x5 de um
  // selvagem. O usuario pediu o tamanho comum de volta; este caso e o que
  // impede a condicao de reaparecer no `||` sem ninguem notar — o desenho do
  // canvas nao tem como falhar sozinho.
  it('lendario desenha a barra do mesmo tamanho que um mob comum', () => {
    for (const especie of LEGENDARY_SPECIES_IDS) {
      const doLendario = ctxEspiao()
      drawHpBar(doLendario.ctx, entidade(false, especie))
      const doMob = ctxEspiao()
      drawHpBar(doMob.ctx, entidade(false))

      expect(doLendario.retangulos[0].w).toBe(doMob.retangulos[0].w)
    }
  })

  // O protetor continua grande MESMO sendo lendario: quem decide e a flag, e
  // nao a especie. Sem este caso, trocar a condicao por `!ehLendario(...)`
  // passaria no teste de cima e quebraria o protetor do Modo Pesadelo.
  it('protetor lendario continua com a barra grande', () => {
    const doProtetor = ctxEspiao()
    drawHpBar(doProtetor.ctx, entidade(true, 'mewtwo'))
    const doMob = ctxEspiao()
    drawHpBar(doMob.ctx, entidade(false, 'mewtwo'))

    expect(doProtetor.retangulos[0].w).toBeGreaterThan(doMob.retangulos[0].w)
  })
})

describe('aura pulsante de protetor (PH-228)', () => {
  it('protetor desenha aura, mob comum nao', () => {
    const doProtetor = ctxEspiao()
    drawEntity(doProtetor.ctx, entidade(true))
    expect(doProtetor.auraDesenhada()).toBe(true)

    const doMob = ctxEspiao()
    drawEntity(doMob.ctx, entidade(false))
    expect(doMob.auraDesenhada()).toBe(false)
  })
})
