// Item 5 (leva QoL): os 6 icones de cura de status. `import.meta.glob` em vez
// de `node:fs` — mesmo motivo de elementVfx.test.ts: confere contra o que o
// Vite realmente empacota, nao o disco cru.
import { describe, expect, it } from 'vitest'
import { itemIconUrl } from './sprites'

const STATUS_HEAL_IDS = ['antidote', 'burn_heal', 'ice_heal', 'awakening', 'paralyze_heal', 'full_heal']

describe('icones dos itens de cura de status', () => {
  const arquivos = new Set(Object.keys(import.meta.glob('/assets/item-icons/*.png')))

  it.each(STATUS_HEAL_IDS)('%s tem itemIconUrl apontando pra um arquivo real', (id) => {
    const url = itemIconUrl(id)
    expect(url).not.toBeNull()
    expect(arquivos.has(`/${url}`)).toBe(true)
  })

  it('cada um dos 6 tem seu PROPRIO arquivo — nenhum reaproveita o de outro', () => {
    const urls = STATUS_HEAL_IDS.map((id) => itemIconUrl(id))
    expect(new Set(urls).size).toBe(STATUS_HEAL_IDS.length)
  })
})
