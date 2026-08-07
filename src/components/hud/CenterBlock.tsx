// Bloco central do topo: carteira, onde o jogador esta, e progresso da Pokedex.
// Em telas estreitas ele tambem hospeda o chip de taxas (ver RatesCard).
import { Coin, Diamond } from '@phosphor-icons/react'
import { SPECIES } from '@/data/pokes'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useWorldStore } from '@/stores/worldStore'
import { useBreakpoints } from '@/stores/uiStore'
import { RatesChip } from './RatesCard'

const TOTAL_SPECIES = Object.keys(SPECIES).length

// Separador de milhar pt-BR. O HUD antigo imprimia o numero cru, e sete digitos
// de ouro sem separador nao sao legiveis de relance.
const fmt = new Intl.NumberFormat('pt-BR')

export function CenterBlock() {
  const gold = useGameStateStore((s) => s.wallet.gold)
  const diamonds = useGameStateStore((s) => s.wallet.diamonds)
  const pokedexKills = useGameStateStore((s) => s.pokedexKills)
  const huntName = useWorldStore((s) => s.mapDef?.name ?? 'Hospital')
  const { narrow } = useBreakpoints()

  // O jogo nao guarda "capturas por especie" — so abates (pokedexKills). Este
  // contador e, entao, de especies REGISTRADAS na Pokedex (pelo menos um abate),
  // e o rotulo diz isso. O handoff pedia "Pokes capturados 11/20"; inventar um
  // numerador que o save nao tem seria mostrar um numero errado com cara de
  // certo.
  const registradas = Object.keys(pokedexKills).length

  return (
    <div className="pointer-events-auto flex flex-col items-center gap-[.45em]">
      <div className="hud-surface flex flex-wrap justify-center gap-x-[1.2em] gap-y-[.3em] rounded-full border border-n800 px-[1.1em] py-[.45em] shadow-sm">
        <span className="flex items-center gap-[.4em] font-medium text-gold">
          <Coin weight="fill" className="text-[1.1em]" />
          {fmt.format(gold)}
        </span>
        <span className="flex items-center gap-[.4em] font-medium text-diamond">
          <Diamond weight="fill" className="text-[1em]" />
          {fmt.format(diamonds)}
        </span>
        <span className="text-[.78em] text-n400">{huntName}</span>
        <span className="text-[.78em] text-n300">
          Pokedex <b className="font-medium text-n100">{registradas}/{TOTAL_SPECIES}</b>
        </span>
      </div>

      {narrow && <RatesChip />}
    </div>
  )
}
