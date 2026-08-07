// Port de js/ui/panels/pokeTooltip.js — resumo compacto so-de-hover. O
// detalhamento completo (habilidades, barra de EXP, todos os IVs) continua
// vivendo atras do card clicavel (PokeStatDetail.tsx).
import { averageIvPercent } from '@/data/pokes'
import type { PokeInstance, Species } from '@/data/pokes'
import { PokeNameTag } from './PokeNameTag'

export function PokeTooltipContent({ poke, species }: { poke: PokeInstance; species: Species }) {
  const typeLabel = species.type2 ? `${species.type} / ${species.type2}` : species.type
  const ivPct = averageIvPercent(poke.ivs).toFixed(0)
  return (
    <div className="space-y-0.5 text-left">
      <div className="mb-1 flex items-center gap-1 font-medium">
        <PokeNameTag poke={poke} species={species} /> <span>({typeLabel})</span>
      </div>
      <div>HP: {Math.floor(poke.hp)}/{poke.stats.hp}</div>
      <div>Atk Fis/Esp: {poke.stats.atkFis} / {poke.stats.atkEsp}</div>
      <div>Def Fis/Esp: {poke.stats.def} / {poke.stats.defEsp}</div>
      <div>Velocidade: {poke.stats.speed}</div>
      <div>IV medio: {ivPct}%</div>
    </div>
  )
}
