// Mesma disciplina de elementVfx.test.ts: `drawStatusEffect` cai no
// procedural em silencio quando a imagem nao existe, entao um nome de
// arquivo errado nunca aparece como erro — so como golpe de status voltando
// a ser o burst antigo, sem ninguem notar. Ver assets/move-vfx/status/CREDITOS.txt.
import { describe, expect, it } from 'vitest'
import { statusVfxUrl, direcaoDoGolpeDeStatus, todosOsVfxDeStatus } from './statusVfx'
import type { ElementType } from './generated/types'

const noDisco = new Set(
  Object.keys(import.meta.glob('/assets/move-vfx/status/**/*.gif')).map((p) => p.replace(/^\//, '')),
)

const TIPOS_COM_ARTE: ElementType[] = [
  'NORMAL', 'FIRE', 'WATER', 'ELECTRIC', 'GRASS', 'ICE', 'FIGHTING', 'POISON',
  'GROUND', 'PSYCHIC', 'BUG', 'ROCK', 'GHOST', 'DARK', 'STEEL', 'FAIRY',
]

describe('vfx de golpe de status', () => {
  it('todo arquivo declarado existe no disco', () => {
    expect(todosOsVfxDeStatus().filter((u) => !noDisco.has(u))).toEqual([])
  })

  it('todo tipo com arte tem as duas direcoes (aumenta e diminui)', () => {
    const faltando = TIPOS_COM_ARTE.filter((t) => !statusVfxUrl(t, 'aumenta') || !statusVfxUrl(t, 'diminui'))
    expect(faltando).toEqual([])
  })

  it('FLYING e DRAGON nao tem arte (catalogo de origem nao tem sheet pra eles) — cai no fallback', () => {
    expect(statusVfxUrl('FLYING', 'aumenta')).toBeNull()
    expect(statusVfxUrl('DRAGON', 'diminui')).toBeNull()
  })

  it('tipo/direcao sem arte devolve null, nao quebra', () => {
    expect(statusVfxUrl(null, 'aumenta')).toBeNull()
    expect(statusVfxUrl(undefined, 'diminui')).toBeNull()
  })

  it('nenhum arquivo e reaproveitado entre tipo ou direcao', () => {
    const todos = todosOsVfxDeStatus()
    expect(new Set(todos).size).toBe(todos.length)
  })
})

describe('direcao do golpe de status', () => {
  it('estagio positivo (Danca das Espadas) vira aumenta', () => {
    expect(direcaoDoGolpeDeStatus([{ stat: 'atkFis', estagios: 2 }])).toBe('aumenta')
  })

  it('estagio negativo (Growl) vira diminui', () => {
    expect(direcaoDoGolpeDeStatus([{ stat: 'atkFis', estagios: -1 }])).toBe('diminui')
  })

  it('sem statChanges (confusao, veneno, sono...) cai em diminui', () => {
    expect(direcaoDoGolpeDeStatus(undefined)).toBe('diminui')
    expect(direcaoDoGolpeDeStatus([])).toBe('diminui')
  })
})
