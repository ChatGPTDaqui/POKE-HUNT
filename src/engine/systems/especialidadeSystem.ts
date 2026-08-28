// Local (sem-servidor) da acao de subir de nivel em "Especialidades" (PH-198)
// — mesmo papel que buyItem/sellItem tem em economySystem.ts: e o fallback
// que `pedirAcaoComLocal` roda quando nao ha servidor de autoridade
// configurado. Sob autoridade, quem decide de verdade e a RPC
// `subir_nivel_especialidade` (ver supabase/migrations); esta funcao existe
// pra o jogo continuar jogavel sem servidor.
import { stoneItemId } from '@/data/stones'
import { custoDoProximoNivel, type EspecialidadeTrilha } from '@/data/especialidades'
import type { ElementType } from '@/data/generated/types'
import type { GameStateStore } from '@/stores/gameStateStore'
import type { EconomyResult } from './economySystem'

export function subirNivelEspecialidade(
  gameState: GameStateStore,
  tipo: ElementType,
  trilha: EspecialidadeTrilha,
): EconomyResult {
  const nivelAtual = gameState.especialidades[tipo][trilha]
  const custo = custoDoProximoNivel(tipo, nivelAtual)
  if (!custo) return { success: false, reason: 'nivel_maximo' }

  const stoneId = stoneItemId(tipo)
  if (!gameState.hasItem(stoneId, custo.stoneQtd)) return { success: false, reason: 'stone_insuficiente' }
  if (!gameState.spendGold(custo.gold)) return { success: false, reason: 'insufficient_gold' }

  gameState.removeItem(stoneId, custo.stoneQtd)
  gameState.setEspecialidadeNivel(tipo, trilha, nivelAtual + 1)
  return { success: true }
}
