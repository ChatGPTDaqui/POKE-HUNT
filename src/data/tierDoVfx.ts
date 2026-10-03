// Tier e motivo do VFX de golpe, em DADOS (02/10).
//
// Moraram em render/vfx/resolverVfx.ts ate a trava "o POKE so anda depois do
// golpe": a primeira versao dela lia a duracao de cada coreografia pelo tier, e
// o motor nao pode importar render/vfx (as coreografias iriam pro bundle da
// Edge). A trava virou tempo FIXO a pedido do dono, mas a regra de tier ficou
// aqui — e pura, e o resolver de render reexporta.
export type TierDoVfx = 1 | 2 | 3 | 4

/** Forma fisica reconhecida pelo id do golpe. Manda na coreografia; o tipo so pinta. */
export type MotivoDoVfx = 'soco' | 'chute' | 'mordida' | 'garra' | 'chifre' | 'bicada' | 'corte' | 'investida'

/**
 * Faixas fixas de poder (D2/D3), iguais pra todo tipo: poder 90 e "forte" em
 * qualquer elemento. Poder entre faixas cai na de BAIXO — o limite e `<`.
 *
 * Os numeros sairam dos quartis reais do catalogo em 2026-09-28 (50/65/90).
 */
const LIMITES_SINGLE = [55, 80, 100] as const
const LIMITES_AREA = [65, 100] as const

/**
 * Golpe de DANO sem poder base (Magnitude, Seismic Toss... — ver
 * `DANO_SEM_PODER_BASE`) cai aqui: o dano existe, so nao tem numero pra
 * comparar. T2 e o meio honesto: nem o estalo do golpe fraco nem o espetaculo
 * do forte.
 */
const TIER_SEM_PODER: TierDoVfx = 2

export function tierDoPoder(power: number, area: boolean): TierDoVfx {
  if (power <= 0) return TIER_SEM_PODER
  const limites = area ? LIMITES_AREA : LIMITES_SINGLE
  let tier = 1
  for (const limite of limites) if (power >= limite) tier++
  return tier as TierDoVfx
}

/** Teto de tier por alvo: area tem 3 degraus, single tem 4. */
export function tetoDoTier(area: boolean): TierDoVfx {
  return area ? 3 : 4
}

/**
 * Ordem importa: `high_jump_kick` tem que virar chute, nao investida, e
 * `crush_claw` garra. O primeiro padrao que casa ganha.
 *
 * Por PEDACO do id separado por `_`, nao substring: `peck` nao pode casar em
 * `speck_x` nem `horn` em `thorn_*`.
 */
const MOTIVOS: ReadonlyArray<readonly [MotivoDoVfx, ReadonlyArray<string>]> = [
  ['soco', ['punch']],
  ['chute', ['kick']],
  ['mordida', ['bite', 'fang', 'crunch']],
  ['garra', ['claw', 'scratch']],
  ['chifre', ['horn', 'megahorn']],
  ['bicada', ['peck']],
  ['corte', ['chop', 'slash', 'cut']],
  ['investida', ['tackle', 'slam', 'rush']],
]

export function motivoDoGolpe(abilityId: string): MotivoDoVfx | null {
  const pedacos = abilityId.split('_')
  for (const [motivo, chaves] of MOTIVOS) {
    if (pedacos.some(p => chaves.includes(p))) return motivo
  }
  return null
}
