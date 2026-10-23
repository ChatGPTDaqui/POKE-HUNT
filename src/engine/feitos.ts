// Feitos de Especialidade (23/10/2026, entrega 3 do design de 19/10): o que o
// POKE de um tipo FEZ em combate, contado pela simulacao. O servidor soma os
// feitos da janela em `player_contador` a cada flush (authority/progresso.ts),
// e as missoes de Especialidade leem de la (`especialidadeMissoes.ts`).
//
// Chaves (sempre por tipo elemental, os dois tipos do POKE contam):
//   abate_tipo:T        selvagem derrotado com um POKE do tipo em campo
//   supereficaz_tipo:T  acerto super-efetivo com golpe do tipo
//   protetor_tipo:T     Guardiao/Lord derrotado com POKE do tipo em campo
//   resistido_tipo:T    golpe "pouco efetivo" recebido por POKE do tipo
//   critico_tipo:T      abate com o POKE do tipo abaixo de 25% de HP (10% era
//                       inalcancavel com o auto-pot padrao curando aos 70%)
//   vantagem_tipo:T     abate de quem tinha vantagem de tipo sobre o POKE
//   estagio_equipe:T    estagio limpo (Lord da ultima sala) com a equipe toda do tipo
// Capturas e evolucoes do tipo NAO passam por aqui: capturas saem do resumo da
// janela, evolucoes da RPC `evoluir_poke`.
import { SPECIES } from '@/data/pokes'
import { getEffectiveness } from '@/data/generated/typeChart.generated'
import type { ElementType } from '@/data/generated/types'
import type { WorldState } from './types'

export function contarFeito(world: Pick<WorldState, 'feitos'>, chave: string, n = 1): void {
  if (n <= 0) return
  const feitos = (world.feitos ??= {})
  feitos[chave] = (feitos[chave] ?? 0) + n
}

export function tiposDaEspecie(speciesId: string): ElementType[] {
  const s = SPECIES[speciesId]
  if (!s) return []
  return [...new Set([s.type, s.type2].filter(Boolean) as ElementType[])]
}

export function contarParaOsTipos(world: Pick<WorldState, 'feitos'>, prefixo: string, speciesId: string): void {
  for (const t of tiposDaEspecie(speciesId)) contarFeito(world, `${prefixo}:${t}`)
}

/** O atacante tem vantagem de tipo sobre o defensor (algum tipo dele e super-efetivo)? */
export function temVantagemDeTipo(atacanteId: string, defensorId: string): boolean {
  const def = SPECIES[defensorId]
  if (!def) return false
  return tiposDaEspecie(atacanteId).some((t) => getEffectiveness(t, def.type as ElementType, (def.type2 ?? null) as ElementType | null) > 1)
}

/** Fracao de HP abaixo da qual um abate conta como "sobreviver no limite". */
export const HP_CRITICO = 0.25
