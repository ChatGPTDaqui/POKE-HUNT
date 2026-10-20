// O que está pronto pra coletar em cada aba da janela Missões. Vira o selo do
// atalho único e decide a aba em que a janela abre.
import { useGameStateStore } from '@/stores/gameStateStore'
import { usePassosStore } from '@/stores/passosStore'
import { situacaoDosPassos } from '@/data/primeirosPassos'
import { progressoDoContrato, type Contrato, type Ovo } from '@/data/ovos'
import { useMuralStore } from '@/data/remote/muralRpc'
import { usePremiosProntosDoDiario } from '@/features/primeirosPassos/Diario'
import type { PendenciasDeMissoes } from '@/data/abasDeMissoes'

type Kills = Record<string, { normal?: number; shiny?: number } | undefined>

/**
 * Contratos prontos (cumpridos e nao entregues) + ovos prontos pra chocar
 * (20/10/2026). O mural so e conhecido depois de aberto uma vez na sessao —
 * antes disso so os ovos contam.
 */
export function contratosProntos(kills: Kills, contratos: readonly Contrato[], ovos: readonly Ovo[]): number {
  const cumpridos = contratos.filter((c) => !c.reivindicado && progressoDoContrato(c, kills[c.speciesId]) >= c.alvo).length
  return cumpridos + ovos.filter((o) => o.abatesRestantes <= 0).length
}

export function usePendenciasDeMissoes(): PendenciasDeMissoes {
  const diario = usePremiosProntosDoDiario()
  const carregado = usePassosStore((s) => s.carregado)
  const reivindicados = usePassosStore((s) => s.reivindicados)
  const objetivos = useGameStateStore((s) => (carregado && situacaoDosPassos(s, reivindicados).pronto ? 1 : 0))
  const contratos = useMuralStore((s) => s.mural?.contratos)
  const tasks = useGameStateStore((s) => contratosProntos(s.pokedexKills as Kills, contratos ?? [], s.ovos))
  return { diario, objetivos, tasks }
}
