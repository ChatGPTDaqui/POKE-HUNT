// Mesma disciplina de vfxTiras.test.ts: o desenho cai no procedural em silencio
// quando a imagem nao existe, entao um nome de arquivo errado nunca aparece como
// erro — so como arte faltando, sem ninguem notar.
//
// ESTE ARQUIVO ENCOLHEU NA PH-416, e o que saiu daqui foi pra
// `estagioVfx.test.ts`. Este modulo deixou de ser "a arte de todo golpe de
// status" e passou a servir UM consumidor: o fundo do selo de condicao no HUD
// (`StatusEffectsBar`), que pede a arte do tipo primario do POKE.
import { describe, expect, it } from 'vitest'
import { statusVfxUrl, todosOsVfxDeStatus } from './statusVfx'
import type { ElementType } from './generated/types'

const noDisco = new Set(
  Object.keys(import.meta.glob('/assets/move-vfx/status/**/*.gif')).map((p) => p.replace(/^\//, '')),
)

const TIPOS_COM_ARTE: ElementType[] = [
  'NORMAL', 'FIRE', 'WATER', 'ELECTRIC', 'GRASS', 'ICE', 'FIGHTING', 'POISON',
  'GROUND', 'PSYCHIC', 'BUG', 'ROCK', 'GHOST', 'DARK', 'STEEL', 'FAIRY',
]

describe('arte de condicao do selo do HUD', () => {
  it('todo arquivo declarado existe no disco', () => {
    expect(todosOsVfxDeStatus().filter((u) => !noDisco.has(u))).toEqual([])
  })

  it('todo tipo com arte tem a peca dele', () => {
    expect(TIPOS_COM_ARTE.filter((t) => !statusVfxUrl(t))).toEqual([])
  })

  it('as 16 tiras de `aumenta` NAO existem mais no disco', () => {
    // Elas serviam a arte de mudanca de atributo, que virou tira gerada por
    // atributo (`estagioVfx.ts`). Sem consumidor, elas sairiam do repo em
    // silencio e voltariam na primeira vez que alguem "restaurasse" a pasta.
    // Este teste e o que impede a volta.
    const sobrando = [...noDisco].filter((u) => u.includes('/aumenta/'))
    expect(sobrando).toEqual([])
  })

  it('FLYING e DRAGON nao tem arte (o catalogo de origem nao tem sheet pra eles) — cai no fallback', () => {
    expect(statusVfxUrl('FLYING')).toBeNull()
    expect(statusVfxUrl('DRAGON')).toBeNull()
  })

  it('tipo ausente devolve null, nao quebra', () => {
    expect(statusVfxUrl(null)).toBeNull()
    expect(statusVfxUrl(undefined)).toBeNull()
  })

  it('nenhum arquivo e reaproveitado entre tipos', () => {
    const todos = todosOsVfxDeStatus()
    expect(new Set(todos).size).toBe(todos.length)
  })
})
