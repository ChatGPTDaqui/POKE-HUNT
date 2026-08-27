// Local (sem-servidor) da acao de reivindicar missao em "Tasks & Missões"
// (PH-199) — mesmo papel que `especialidadeSystem.ts#subirNivelEspecialidade`
// tem: fallback pra `pedirAcaoComLocal` quando nao ha servidor de autoridade.
// Sob autoridade quem decide de verdade e a RPC `reivindicar_missao`.
import { cadeiaDoTipo, chaveDaMissao } from '@/data/missoes'
import type { ElementType } from '@/data/generated/types'
import type { GameStateStore } from '@/stores/gameStateStore'
import type { EconomyResult } from './economySystem'

export function reivindicarMissao(
  gameState: GameStateStore,
  tipo: ElementType,
  speciesId: string,
): EconomyResult {
  const cadeia = cadeiaDoTipo(tipo)
  const missao = cadeia.find((m) => m.speciesId === speciesId)
  if (!missao) return { success: false, reason: 'especie_fora_da_cadeia' }

  // Sequencial: toda missao ANTERIOR da cadeia precisa ja estar reivindicada.
  // Testar so a posicao imediatamente anterior bastaria hoje (reivindicar so
  // avanca uma de cada vez), mas testar a cadeia inteira nao custa mais e nao
  // depende dessa premissa continuar valendo.
  for (let i = 0; i < missao.posicao; i++) {
    if (!gameState.missoesReivindicadas[chaveDaMissao(tipo, cadeia[i].speciesId)]) {
      return { success: false, reason: 'missao_anterior_pendente' }
    }
  }

  const chave = chaveDaMissao(tipo, speciesId)
  if (gameState.missoesReivindicadas[chave]) return { success: false, reason: 'ja_reivindicada' }

  const kills = gameState.pokedexKills[speciesId]
  const abates = (kills?.normal ?? 0) + (kills?.shiny ?? 0)
  if (abates < missao.alvo) return { success: false, reason: 'abates_insuficientes' }

  gameState.addGold(missao.recompensa)
  gameState.setMissaoReivindicada(chave)
  return { success: true }
}
