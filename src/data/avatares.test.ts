// PH-548: o catalogo de avatares e os arquivos em assets/treinadores/ tem que
// andar juntos, e os ids tem que ser os slugs dos bots do PvP — e a migration
// que da a cada bot o proprio retrato depende disso.
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AVATARES, FORMATO_DE_AVATAR, avatarUrl, avatarCorpoUrl, avatarConhecido } from './avatares'

const RAIZ = join(__dirname, '..', '..')

describe('avatares do treinador (PH-548)', () => {
  it('todo id do catalogo tem corpo e rosto em assets/treinadores e passa no formato da RPC', () => {
    expect(AVATARES.length).toBeGreaterThan(0)
    for (const a of AVATARES) {
      expect(a.id, `id fora do formato: ${a.id}`).toMatch(FORMATO_DE_AVATAR)
      expect(existsSync(join(RAIZ, 'assets', 'treinadores', `${a.id}.png`)), `falta assets/treinadores/${a.id}.png`).toBe(true)
      expect(existsSync(join(RAIZ, 'assets', 'treinadores', 'rosto', `${a.id}.png`)), `falta assets/treinadores/rosto/${a.id}.png`).toBe(true)
    }
  })

  it('o catalogo contem os slugs dos bots do PvP (a migration da a cada bot o proprio retrato)', () => {
    const seed = readFileSync(join(RAIZ, 'scripts', 'pvp', 'seed-bots.mjs'), 'utf8')
    const slugs = [...seed.matchAll(/slug: '([a-z0-9-]+)'/g)].map((m) => m[1]).sort()
    const ids = new Set(AVATARES.map((a) => a.id))
    expect(slugs.length).toBeGreaterThan(0)
    for (const slug of slugs) expect(ids.has(slug), `bot sem avatar no catalogo: ${slug}`).toBe(true)
    // Ids unicos — dois iguais fariam o seletor mostrar o mesmo botao duas vezes.
    expect(ids.size).toBe(AVATARES.length)
  })

  it('id desconhecido ou vazio cai no icone padrao', () => {
    expect(avatarUrl('lance')).toBe('assets/treinadores/rosto/lance.png')
    expect(avatarCorpoUrl('lance')).toBe('assets/treinadores/lance.png')
    expect(avatarUrl('nao-existe')).toBeNull()
    expect(avatarUrl(null)).toBeNull()
    expect(avatarConhecido('')).toBeNull()
  })
})
