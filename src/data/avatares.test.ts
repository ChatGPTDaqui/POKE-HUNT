// PH-548: o catalogo de avatares e os arquivos em assets/treinadores/ tem que
// andar juntos, e os ids tem que ser os slugs dos bots do PvP — e a migration
// que da a cada bot o proprio retrato depende disso.
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AVATARES, FORMATO_DE_AVATAR, avatarUrl, avatarConhecido } from './avatares'

const RAIZ = join(__dirname, '..', '..')

describe('avatares do treinador (PH-548)', () => {
  it('todo id do catalogo tem retrato em assets/treinadores e passa no formato da RPC', () => {
    expect(AVATARES.length).toBeGreaterThan(0)
    for (const a of AVATARES) {
      expect(a.id, `id fora do formato: ${a.id}`).toMatch(FORMATO_DE_AVATAR)
      expect(existsSync(join(RAIZ, 'assets', 'treinadores', `${a.id}.png`)), `falta assets/treinadores/${a.id}.png`).toBe(true)
    }
  })

  it('os ids sao exatamente os slugs dos bots do PvP', () => {
    const seed = readFileSync(join(RAIZ, 'scripts', 'pvp', 'seed-bots.mjs'), 'utf8')
    const slugs = [...seed.matchAll(/slug: '([a-z0-9-]+)'/g)].map((m) => m[1]).sort()
    expect(AVATARES.map((a) => a.id).sort()).toEqual(slugs)
  })

  it('id desconhecido ou vazio cai no icone padrao', () => {
    expect(avatarUrl('lance')).toBe('assets/treinadores/lance.png')
    expect(avatarUrl('nao-existe')).toBeNull()
    expect(avatarUrl(null)).toBeNull()
    expect(avatarConhecido('')).toBeNull()
  })
})
