// O piso do farm offline: nunca menos que 50% da taxa online medida.
//
// Regra do usuario. Existe porque o combate offline roda em modo PESSIMISTA
// (dano minimo, zero critico, inimigo mais forte do pool) — e sem piso esse
// pior caso pode degenerar pra ZERO kills quando o POKE esta apertado contra o
// inimigo mais duro da hunt. O jogador ficaria 6h fora e receberia nada.
import { grantExp, type GameStateData, type GameStateStore, type OfflineSimSummary } from '#engine'

export const FRACAO_DO_PISO = 0.5

// A "taxa online medida" vem de `perfStats`, que ZERA a cada entrada em hunt.
// Sem amostra minima o piso vira exploit ao contrario: quem entra numa hunt e
// fecha o jogo em 3 segundos teria "1 kill / 3s" = 1200 kills/h, e metade disso
// pagaria mais que jogar. Com o minimo, trocar de hunt zera a amostra e o piso
// simplesmente nao se aplica — o que tambem fecha o truque de farmar uma hunt
// facil, trocar pra uma brutal e deslogar.
export const AMOSTRA_MINIMA_SEGUNDOS = 300
export const AMOSTRA_MINIMA_KILLS = 10

export interface ResultadoPiso {
  aplicado: boolean
  ouroAdicionado: number
  xpAdicionado: number
}

/**
 * Completa ouro/XP ate o piso, se a amostra permitir.
 *
 * O piso multiplica o tempo REALMENTE FARMADO (`simulatedSeconds`), nao o tempo
 * offline: se o POKE morreu aos 10 minutos por falta de pocao, o piso vale sobre
 * esses 10 minutos. Usar o tempo offline cheio anularia a regra de morte —
 * morrer renderia o mesmo que sobreviver.
 *
 * Captura, shiny e drop NAO entram: sao eventos, nao taxa. Nao existe "50% de um
 * shiny".
 */
export function aplicarPiso(
  store: GameStateStore,
  estado: GameStateData,
  resumo: OfflineSimSummary,
  agoraMs: number,
): ResultadoPiso {
  const nada = { aplicado: false, ouroAdicionado: 0, xpAdicionado: 0 }
  const perf = estado.perfStats
  const amostraSegundos = (agoraMs - perf.since) / 1000
  if (!Number.isFinite(amostraSegundos) || amostraSegundos < AMOSTRA_MINIMA_SEGUNDOS) return nada
  if (perf.mobs < AMOSTRA_MINIMA_KILLS) return nada

  const farmados = resumo.simulatedSeconds
  if (farmados <= 0) return nada

  const pisoOuro = Math.floor((perf.gold / amostraSegundos) * FRACAO_DO_PISO * farmados)
  const pisoXp = Math.floor((perf.xp / amostraSegundos) * FRACAO_DO_PISO * farmados)

  const ouroAdicionado = Math.max(0, pisoOuro - resumo.gold)
  const xpAdicionado = Math.max(0, pisoXp - resumo.xp)
  if (ouroAdicionado === 0 && xpAdicionado === 0) return nada

  if (ouroAdicionado > 0) store.addGold(ouroAdicionado)
  if (xpAdicionado > 0) {
    const ativo = estado.team[estado.activeIndex]
    // Sem POKE ativo o XP nao tem onde entrar. Nao inventa um destino: o piso de
    // ouro ja foi aplicado e o de XP simplesmente nao se aplica.
    if (ativo) {
      const r = grantExp(ativo, xpAdicionado)
      store.updatePokeInstance(ativo.uid, () => r.poke)
    }
  }
  // O resumo devolvido ao jogador tem que refletir o que ele REALMENTE recebeu,
  // senao o relatorio mente sobre o proprio piso.
  resumo.gold += ouroAdicionado
  resumo.xp += xpAdicionado
  return { aplicado: true, ouroAdicionado, xpAdicionado }
}
