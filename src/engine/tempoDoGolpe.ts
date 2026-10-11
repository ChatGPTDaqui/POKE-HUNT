// A LINHA DO TEMPO DE UM GOLPE (11/10), pedido do dono:
//
//   t0 ── pose de ataque comeca no quadro 0
//    ├─ APICE (quadro <HitFrame> da arte PMD) ── o VFX do golpe nasce
//    ├─ apice + PRIMEIRO impacto da coreografia ── dano, numero, Hurt, derrota
//    └─ apice + ULTIMO impacto + folga ── o POKE pode voltar a andar
//
// Antes, a pose durava 0,5 s fixos (sem relacao com os quadros do sprite), o
// VFX so nascia quando ela acabava, o dano caia junto do nascimento (antes de o
// golpe chegar no alvo) e o POKE andava 0,7 s depois — com coreografias de ate
// 2 s, saia andando com o golpe ainda no ar.
//
// Puro e sem `render/`: roda no servidor (simulateWorldSeconds) igual ao
// cliente. Os instantes vem de duas tabelas de dados:
//   - quadros e duracoes da pose: data/battleSpriteAnims.ts (via resolveBattleAnim)
//   - apice: data/generated/apiceDoAtaque.generated.ts (scripts/extrair-apice-dos-ataques.mjs)
//   - impactos: data/generated/impactosDosGolpes.generated.ts (teste em render/vfx)
import { resolveBattleAnim } from '@/data/battleSprites'
import { APICE_DO_ATAQUE } from '@/data/generated/apiceDoAtaque.generated'
import { IMPACTOS_DOS_GOLPES } from '@/data/generated/impactosDosGolpes.generated'
import type { AttackAnimKind } from './types'

/** Pose de quem nao tem arte nenhuma (placeholder geometrico): o valor antigo. */
export const POSE_SEM_ARTE = 0.5
/** Onde cai o apice quando o acervo nao marca `HitFrame`: fracao da pose. */
export const APICE_ESTIMADO = 0.4
/**
 * Quanto o POKE ainda espera depois do ULTIMO impacto antes de andar. O dono
 * escolheu "ate o ultimo impacto" (nao a coreografia inteira com rescaldo): a
 * folga so evita que o passo comece no mesmo quadro da faisca.
 */
export const FOLGA_DEPOIS_DO_IMPACTO = 0.15

export interface TempoDoGolpe {
  /** Segundos desde o disparo ate o apice da pose (VFX nasce aqui). */
  apice: number
  /** Segundos desde o disparo ate o primeiro impacto (dano). */
  impacto: number
  /** Quanto a pose fica na tela. Charge repete em loop ate o impacto. */
  pose: number
  /** Desde o disparo, quando o POKE pode voltar a andar (golpe de dano). */
  soltura: number
}

const somaEmSegundos = (duracoes: readonly number[], quadros: number) =>
  duracoes.slice(0, quadros).reduce((s, d) => s + d, 0) / 60

/**
 * `kind` e a pose que `triggerAttackAnim` vai tocar. A especie pode nao ter
 * essa arte (ANIM_FALLBACKS troca Shoot por Charge etc.): o apice e o da pose
 * que REALMENTE toca.
 */
export function tempoDoGolpe(speciesId: string, kind: AttackAnimKind, abilityId: string): TempoDoGolpe {
  const arte = resolveBattleAnim(speciesId, kind)
  let duracao = POSE_SEM_ARTE
  let apice = POSE_SEM_ARTE * APICE_ESTIMADO
  if (arte && arte.durations.length > 0) {
    duracao = somaEmSegundos(arte.durations, arte.durations.length)
    const quadro = (APICE_DO_ATAQUE[speciesId] as Record<string, number | undefined> | undefined)?.[arte.name]
    apice = quadro !== undefined ? somaEmSegundos(arte.durations, quadro) : duracao * APICE_ESTIMADO
  }
  const [primeiro, derradeiro] = IMPACTOS_DOS_GOLPES[abilityId] ?? [0, 0]
  const impacto = apice + primeiro / 1000
  // Charge e uma pose de canalizar: o dono liberou repetir em loop enquanto o
  // golpe nao bateu (a arte PMD dela e curta, ~0,33 s em todas as especies).
  const pose = arte?.name === 'Charge' ? Math.max(duracao, impacto) : duracao
  return { apice, impacto, pose, soltura: Math.max(pose, apice + derradeiro / 1000 + FOLGA_DEPOIS_DO_IMPACTO) }
}
