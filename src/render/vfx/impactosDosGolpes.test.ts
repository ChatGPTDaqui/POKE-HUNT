// A TABELA DE IMPACTOS DO MOTOR BATE COM AS COREOGRAFIAS.
//
// O motor (que tambem roda no servidor) aplica o dano no PRIMEIRO impacto do
// VFX e solta o POKE depois do ULTIMO (engine/tempoDoGolpe.ts). Ele nao pode
// importar `render/` — o bundle do servidor nao leva canvas —, entao le os
// instantes de src/data/generated/impactosDosGolpes.generated.ts. Este teste
// recalcula a tabela a partir de `resolverVfx` e reprova se uma coreografia
// mudou os `impactos` sem regerar.
//
// Regerar: ATUALIZAR_IMPACTOS=1 npx vitest run src/render/vfx/impactosDosGolpes.test.ts
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

import { ABILITIES, isDamagingAbility } from '@/data/abilities'
import { IMPACTOS_DOS_GOLPES } from '@/data/generated/impactosDosGolpes.generated'
import { resolverVfx } from './resolverVfx'

/** [primeiro, ultimo] impacto em ms, no tier BASE (sem critico), por golpe. */
function calcular(): Record<string, readonly [number, number]> {
  const tabela: Record<string, readonly [number, number]> = {}
  for (const golpe of Object.values(ABILITIES).sort((a, b) => a.id.localeCompare(b.id))) {
    if (!isDamagingAbility(golpe)) continue
    const r = resolverVfx({ abilityId: golpe.id, area: golpe.target === 'aoe' })
    const impactos = r?.entrada.impactos?.[r.tier]
    if (!impactos?.length) continue
    tabela[golpe.id] = [impactos[0], Math.max(...impactos)]
  }
  return tabela
}

function escrever(tabela: Record<string, readonly [number, number]>): void {
  const linhas = Object.entries(tabela).map(([id, [a, b]]) => `  ${id}: [${a}, ${b}],`).join('\n')
  fs.writeFileSync('src/data/generated/impactosDosGolpes.generated.ts', `// GERADO por src/render/vfx/impactosDosGolpes.test.ts (ATUALIZAR_IMPACTOS=1) — nao editar a mao.
// [primeiro, ultimo] instante (ms, desde o nascimento do VFX) em que o golpe BATE,
// no tier base. Golpe ausente nao tem coreografia nova: impacto no instante do apice.
export const IMPACTOS_DOS_GOLPES: Readonly<Record<string, readonly [number, number]>> = {
${linhas}
}
`)
}

describe('impactos dos golpes (tabela do motor)', () => {
  it('bate com os impactos declarados nas coreografias', () => {
    const esperado = calcular()
    if (process.env.ATUALIZAR_IMPACTOS === '1') escrever(esperado)
    expect(IMPACTOS_DOS_GOLPES).toEqual(esperado)
  })

  it('cobre todo golpe de dano que tem coreografia nova', () => {
    // Golpe com VFX novo sem `impactos` cairia no apice e o POKE andaria com o
    // golpe ainda no ar — exatamente o defeito que a tabela existe pra evitar.
    const semImpacto = Object.values(ABILITIES)
      .filter(isDamagingAbility)
      .filter((g) => resolverVfx({ abilityId: g.id, area: g.target === 'aoe' }) && !IMPACTOS_DOS_GOLPES[g.id])
      .map((g) => g.id)
    expect(semImpacto).toEqual([])
  })
})
