import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { moveIconUrl, golpesComIcone } from './moveIcons'
import { ABILITIES_DATA } from './generated/abilities.generated'

describe('icones de golpe', () => {
  it('todo id da lista tem arquivo em assets/move-icons', () => {
    for (const id of golpesComIcone()) {
      expect(existsSync(join(process.cwd(), 'assets/move-icons', `${id}.webp`)), id).toBe(true)
    }
  })
  it('golpe sem arte devolve null (slot cai no icone do tipo)', () => {
    expect(moveIconUrl('growl')).toBeNull()
    expect(moveIconUrl(undefined)).toBeNull()
  })
  it('ha cobertura relevante do catalogo', () => {
    const cobertos = Object.keys(ABILITIES_DATA).filter((id) => moveIconUrl(id)).length
    expect(cobertos).toBeGreaterThan(300)
  })
})
