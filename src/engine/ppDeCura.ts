// Golpe de cura limitado por PP (pedido do dono, 19/10/2026).
//
// O jogo não tem PP: cada golpe só tem tempo de recarga (`cooldownFromPp`).
// Por isso Recover e Synthesis voltavam assim que a recarga terminava, e um
// selvagem com cura nunca morria — a luta travava. Agora a CURA PURA (golpe com
// `healPercent` e sem dano) gasta o PP do catálogo, contado POR ALVO: trocar de
// alvo devolve tudo. Vale para todo mundo (selvagem, jogador, protetor, duelo).
//
// Roda no servidor também (o motor é o mesmo bundle): só depende de estado da
// entidade, nunca de relógio de parede.
import type { Ability } from '@/data/abilities'

interface ComPpDeCura {
  /** Usos de cada golpe de cura contra o alvo atual. */
  usosDeCura?: Record<string, number>
  /** O alvo contra o qual os usos foram contados. */
  alvoDaCura?: string | null
}

/** Cura pura: cura e não causa dano. Dreno (Giga Drain) não entra. */
export function ehCuraPura(ability: Pick<Ability, 'healPercent' | 'power'>): boolean {
  return Boolean(ability.healPercent) && !ability.power
}

/** Trocou de alvo: zera a contagem. Chamar antes de escolher o golpe. */
export function sincronizarAlvoDaCura(entity: ComPpDeCura, alvoId: string | null | undefined): void {
  const alvo = alvoId ?? null
  if (entity.alvoDaCura === alvo) return
  entity.alvoDaCura = alvo
  entity.usosDeCura = {}
}

export function ppDeCuraRestante(entity: ComPpDeCura, ability: Pick<Ability, 'id' | 'pp' | 'healPercent' | 'power'>): number | null {
  if (!ehCuraPura(ability)) return null
  return Math.max(0, ability.pp - (entity.usosDeCura?.[ability.id] ?? 0))
}

/** O golpe de cura ainda tem PP contra o alvo atual? (Golpe que não é cura: sempre.) */
export function temPpDeCura(entity: ComPpDeCura, ability: Pick<Ability, 'id' | 'pp' | 'healPercent' | 'power'>): boolean {
  const restante = ppDeCuraRestante(entity, ability)
  return restante === null || restante > 0
}

/** Gasta 1 PP se for cura pura. Chamar no disparo do golpe. */
export function gastarPpDeCura(entity: ComPpDeCura, ability: Pick<Ability, 'id' | 'healPercent' | 'power'>): void {
  if (!ehCuraPura(ability)) return
  const usos = (entity.usosDeCura ??= {})
  usos[ability.id] = (usos[ability.id] ?? 0) + 1
}
