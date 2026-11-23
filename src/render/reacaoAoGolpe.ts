// O CORPO DE QUEM LEVOU O GOLPE (coreografia de batalha, 23/11/2026).
//
// O motor marca `impactoVisual` no alvo quando o golpe pousa (combatSystem#
// resolveHit). Aqui sai o deslocamento da SPRITE — nunca do `x/y` do motor —
// em tres camadas, pela ordem da pesquisa (Sakurai, "hit stop"):
//
//   1. hitstop (so grau 3): o quadro congela (animationSystem#updateAnimations)
//      e o corpo treme na horizontal, com a tremida diminuindo;
//   2. recuo: o corpo e empurrado no sentido do golpe e volta (ease-out);
//   3. tremor curto por cima do recuo, um pulso por acerto do golpe multiplo.
//
// Puro: depende so do `impactoVisual` e do `reduzido`, pra ter teste sem canvas.
import type { ImpactoVisual } from '@/engine/types'
import { DURACAO_DO_TREMOR } from '@/engine/systems/animationSystem'

/** Pixels de mundo por grau (indice = grau). */
export const RECUO_POR_GRAU = [0, 1.5, 4, 8] as const
export const TREMOR_POR_GRAU = [0, 1.5, 1, 1.5] as const
/** Tremida horizontal durante o hitstop. */
export const TREMOR_DO_HITSTOP = 3
/** Quando o recuo chega no maximo, dentro do pulso. */
const SUBIDA_DO_RECUO = 0.04
const FREQUENCIA_DO_TREMOR = 28

export interface Deslocamento { dx: number; dy: number }
const PARADO: Deslocamento = Object.freeze({ dx: 0, dy: 0 })

export function deslocamentoDoImpacto(i: ImpactoVisual | undefined, reduzido: boolean): Deslocamento {
  if (!i || reduzido) return PARADO
  const t = i.idade
  if (t < i.hitstop) {
    const resta = 1 - t / i.hitstop
    return { dx: Math.sin(t * Math.PI * 2 * FREQUENCIA_DO_TREMOR) * TREMOR_DO_HITSTOP * (0.4 + 0.6 * resta), dy: 0 }
  }
  // O pulso mais recente que ja comecou.
  const depois = t - i.hitstop
  const k = i.intervalo > 0 ? Math.min(i.pulsos - 1, Math.floor(depois / i.intervalo)) : 0
  const u = depois - k * i.intervalo
  if (u < 0 || u > DURACAO_DO_TREMOR) return PARADO
  const envelope = u < SUBIDA_DO_RECUO
    ? u / SUBIDA_DO_RECUO
    : (1 - (u - SUBIDA_DO_RECUO) / (DURACAO_DO_TREMOR - SUBIDA_DO_RECUO)) ** 2
  const recuo = RECUO_POR_GRAU[i.grau] * envelope
  const tremor = Math.sin(u * Math.PI * 2 * FREQUENCIA_DO_TREMOR) * TREMOR_POR_GRAU[i.grau] * (1 - u / DURACAO_DO_TREMOR)
  if (i.angulo === null) return { dx: tremor, dy: 0 }
  // Na camera 3/4 o chao e achatado: o recuo vertical vale menos que o lateral.
  return { dx: Math.cos(i.angulo) * recuo + tremor, dy: Math.sin(i.angulo) * recuo * 0.5 }
}
