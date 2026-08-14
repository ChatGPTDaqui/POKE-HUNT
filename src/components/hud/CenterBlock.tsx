// Bloco central do topo: onde o jogador esta e progresso da Pokedex.
// Em telas estreitas ele tambem hospeda o chip de taxas (ver RatesCard).
import { SPECIES } from '@/data/pokes'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useWorldStore } from '@/stores/worldStore'
import { useBreakpoints } from '@/stores/uiStore'
import { RatesChip } from './RatesCard'
import { SalaChip } from './SalaChip'

const TOTAL_SPECIES = Object.keys(SPECIES).length

export function CenterBlock() {
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
      {/* A carteira saiu daqui pro card do treinador (pedido explicito de ancorar
          as moedas junto dos dados dele) — ver TrainerCard#Carteira. */}
      <div className="hud-surface flex flex-wrap justify-center gap-x-[1.2em] gap-y-[.3em] rounded-full border border-n800 px-[1.1em] py-[.45em] shadow-sm">
        <span className="text-[.78em] text-n400">{huntName}</span>
        <span className="text-[.78em] text-n300">
          Pokedex <b className="font-medium text-n100">{registradas}/{TOTAL_SPECIES}</b>
        </span>
      </div>

      <SalaChip />

      {narrow && <RatesChip />}
    </div>
  )
}
