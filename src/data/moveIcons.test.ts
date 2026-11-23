import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { moveIcon, golpesComIcone, COLUNAS, LINHAS } from './moveIcons'
import { ABILITIES_DATA } from './generated/abilities.generated'

describe('icones de golpe', () => {
  it('o atlas existe em disco e a grade comporta todos os golpes', () => {
    expect(existsSync(join(process.cwd(), 'assets/move-icons-atlas.webp'))).toBe(true)
    expect(COLUNAS * LINHAS).toBeGreaterThanOrEqual(golpesComIcone().length)
  })
  it('todo id do atlas existe no catalogo e nao se repete', () => {
    const ids = golpesComIcone()
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(ABILITIES_DATA[id], id).toBeTruthy()
  })
  it('golpe sem arte devolve null (slot cai no icone do tipo)', () => {
    expect(moveIcon('growl')).toBeNull()
    expect(moveIcon(undefined)).toBeNull()
  })
  it('a ultima celula posiciona em 100% 100% quando a grade esta cheia ou dentro da grade', () => {
    const ultimo = moveIcon(golpesComIcone().at(-1))
    expect(ultimo?.estilo.backgroundPosition).toMatch(/^[\d.]+% [\d.]+%$/)
  })
})
