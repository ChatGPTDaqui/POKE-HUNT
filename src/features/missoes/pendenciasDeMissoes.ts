// O que está pronto pra coletar em cada aba da janela Missões. Vira o selo do
// atalho único e decide a aba em que a janela abre.
import { useGameStateStore } from '@/stores/gameStateStore'
import { usePassosStore } from '@/stores/passosStore'
import { situacaoDosPassos } from '@/data/primeirosPassos'
import { cadeiaDoTipo, chaveDaMissao, MISSAO_TYPES } from '@/data/missoes'
import { usePremiosProntosDoDiario } from '@/features/primeirosPassos/Diario'
import type { PendenciasDeMissoes } from '@/data/abasDeMissoes'

type Kills = Record<string, { normal?: number; shiny?: number } | undefined>

/** Cadeias de Tasks cuja missão atual já bateu o alvo (pronta pra reivindicar). */
export function tasksProntas(kills: Kills, reivindicadas: Record<string, unknown>): number {
  let prontas = 0
  for (const tipo of MISSAO_TYPES) {
    const m = cadeiaDoTipo(tipo).find((x) => !reivindicadas[chaveDaMissao(tipo, x.speciesId)])
    if (!m) continue
    const k = kills[m.speciesId]
    if ((k?.normal ?? 0) + (k?.shiny ?? 0) >= m.alvo) prontas++
  }
  return prontas
}

export function usePendenciasDeMissoes(): PendenciasDeMissoes {
  const diario = usePremiosProntosDoDiario()
  const carregado = usePassosStore((s) => s.carregado)
  const reivindicados = usePassosStore((s) => s.reivindicados)
  const objetivos = useGameStateStore((s) => (carregado && situacaoDosPassos(s, reivindicados).pronto ? 1 : 0))
  const tasks = useGameStateStore((s) => tasksProntas(s.pokedexKills as Kills, s.missoesReivindicadas))
  return { diario, objetivos, tasks }
}
