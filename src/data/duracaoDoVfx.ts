// Quanto tempo o VFX de um golpe fica na tela — em DADOS, pro motor ler.
//
// POR QUE EXISTE (02/10): o dono pediu que o POKE so ande depois que o golpe
// terminar. Antes a trava era so a pose de ataque (0,5 s); o efeito comeca
// quando o golpe pousa e dura 0,6 a 2,1 s, entao o POKE que derrotava o alvo
// saia andando e o efeito ficava pra tras.
//
// A trava e do MOTOR, nao do desenho: o servidor re-simula o movimento
// (engine/bundleDaEdgeAtualizado.test.ts), e uma trava so no cliente seria
// divergencia de autoridade. E o motor nao pode importar render/vfx — as
// coreografias iriam inteiras pro bundle da Edge. Daqui a tabela abaixo, que e
// uma COPIA das duracoes do registro de render/vfx.
//
// QUEM GARANTE QUE A COPIA NAO ENVELHECE: render/vfx/duracaoDoVfx.test.ts
// compara, golpe a golpe, `duracaoVisualDoGolpe` com o que o desenho resolve
// de fato (`resolverVfx` + `duracaoDoTier`). Mudou uma duracao numa
// coreografia, o teste falha e imprime a tabela nova pra colar aqui.
import { getAbility, isDamagingAbility } from './abilities'
import type { ElementType } from './generated/types'

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

type PorTier = Partial<Record<TierDoVfx, number>>

/**
 * Duracao (ms) ja resolvida por tier — com o mesmo recuo de
 * `render/vfx/desenharVfx.ts#duracaoDoTier` (tier sem duracao propria usa a do
 * maior tier abaixo dele). Tier AUSENTE = o desenho nao tem coreografia nele.
 * Motivo fica de fora enquanto `REGISTRO_DE_MOTIVO` estiver vazio; o teste
 * avisa se ele ganhar entradas.
 */
export const DURACAO_DO_VFX: { single: Partial<Record<ElementType, PorTier>>; area: Partial<Record<ElementType, PorTier>> } = {
  single: {
    FIRE: { 1: 900, 2: 1150, 3: 1450, 4: 1500 },
    ELECTRIC: { 1: 700, 2: 1000, 3: 1100, 4: 1800 },
    WATER: { 1: 900, 2: 1000, 3: 1100, 4: 1600 },
    GRASS: { 1: 1000, 2: 1100, 3: 1100, 4: 1800 },
    NORMAL: { 1: 600, 2: 800, 3: 1000, 4: 1400 },
    FIGHTING: { 1: 700, 2: 900, 3: 1100, 4: 1600 },
    FLYING: { 1: 1100, 2: 1000, 3: 1200, 4: 1700 },
    POISON: { 1: 900, 2: 1100, 3: 1500, 4: 1800 },
    GROUND: { 1: 900, 2: 1100, 3: 1400, 4: 1600 },
    PSYCHIC: { 1: 1200, 2: 1100, 3: 1400, 4: 1800 },
    BUG: { 1: 1000, 2: 900, 3: 1000, 4: 1300 },
    ROCK: { 1: 1000, 2: 1500, 3: 1100, 4: 1600 },
    FAIRY: { 1: 1000, 2: 1000, 3: 1700, 4: 1300 },
    DARK: { 1: 800, 2: 900, 3: 1100, 4: 1400 },
    STEEL: { 1: 800, 2: 1100, 3: 1000, 4: 1300 },
    ICE: { 1: 1100, 2: 1200, 3: 1700, 4: 1500 },
    GHOST: { 1: 1200, 2: 800, 3: 1200, 4: 1400 },
    DRAGON: { 1: 900, 2: 1200, 3: 1000, 4: 1400 },
  },
  area: {
    FIRE: { 1: 800, 2: 1500, 3: 1800 },
    ELECTRIC: { 1: 800, 2: 1000, 3: 1800 },
    WATER: { 1: 900, 2: 1200, 3: 1500 },
    GRASS: { 1: 1000, 2: 1450, 3: 1600 },
    NORMAL: { 1: 1100, 2: 1200, 3: 1500 },
    FIGHTING: { 2: 1100, 3: 1700 },
    FLYING: { 1: 1000, 2: 1300, 3: 1600 },
    POISON: { 1: 1300, 2: 1500, 3: 1800 },
    GROUND: { 1: 900, 2: 1300, 3: 1800 },
    PSYCHIC: { 2: 1300, 3: 1800 },
    BUG: { 1: 1100, 2: 1500, 3: 1700 },
    ROCK: { 2: 1500, 3: 1800 },
    FAIRY: { 1: 1100, 2: 1500, 3: 1700 },
    DARK: { 1: 1100, 2: 1500, 3: 1700 },
    STEEL: { 2: 1500, 3: 1700 },
    ICE: { 1: 1300, 2: 1500, 3: 1800 },
    GHOST: { 2: 1600, 3: 2100 },
    DRAGON: { 1: 1300, 2: 1400, 3: 1800 },
  },
}

/**
 * Quanto (ms) o VFX procedural do golpe fica na tela depois de pousar; 0 quando
 * o golpe nao tem coreografia (status, desconhecido, tier sem desenho).
 *
 * Sem `critico`: o efeito de golpe NAO recebe `isCrit` do motor (so o numero de
 * dano recebe), entao o tier desenhado e sempre o do poder. Ver a nota em
 * render/vfx/duracaoDoVfx.test.ts.
 */
export function duracaoVisualDoGolpe(abilityId: string, area: boolean): number {
  const golpe = getAbility(abilityId)
  if (!golpe || !isDamagingAbility(golpe)) return 0
  const tier = tierDoPoder(golpe.power, area)
  return DURACAO_DO_VFX[area ? 'area' : 'single'][golpe.type]?.[tier] ?? 0
}
