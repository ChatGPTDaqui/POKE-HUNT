// Qual das evoluções (PH-139).
//
// Só aparece quando a espécie tem MAIS DE UM destino alcançável. Espécie de
// ramo único continua evoluindo com um clique — abrir um modal para confirmar
// algo sem alternativa seria só um passo a mais.
//
// A ESCOLHA É PERMANENTE, e o jogo não tem como desfazer. Por isso o botão diz
// o nome do alvo em vez de "Confirmar": quem clica em "Evoluir para Hitmonchan"
// não pode alegar que não viu para onde ia.
import { GameButton, GameCard } from '@/components/game/controls'
import { PokeSwatch } from '@/components/shared/PokeSwatch'
import { SPECIES } from '@/data/pokes'
import { stoneItemId } from '@/data/stones'
import { useGameStateStore } from '@/stores/gameStateStore'
import { ITEMS } from '@/data/items'

import type { OpcaoDeEvolucao, PokeInstance } from '@/data/pokes'
import type { StoneRequirement } from '@/engine/systems/progressionSystem'

export function EscolhaDeEvolucao({
  poke, opcoes, requisito, onEscolher, onCancelar,
}: {
  poke: PokeInstance
  opcoes: OpcaoDeEvolucao[]
  /** Pedras exigidas por opção, quando ela cobra. Chave = `to`. */
  requisito: (opcao: OpcaoDeEvolucao) => StoneRequirement | null
  onEscolher: (alvo: string) => void
  onCancelar: () => void
}) {
  const items = useGameStateStore((s) => s.items)
  const origem = SPECIES[poke.speciesId]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-[1em]">
      <GameCard className="flex w-full max-w-[26em] flex-col gap-[.6em] p-[.8em]">
        <div className="flex flex-col gap-[.15em]">
          <span className="text-[.95em] font-medium text-n100">
            {origem.name} pode evoluir de duas formas
          </span>
          <span className="text-[.78em] text-n400">
            A escolha é permanente — não dá para voltar atrás nem trocar depois.
          </span>
        </div>

        <div className="flex flex-col gap-[.4em]">
          {opcoes.map((opcao) => {
            const alvo = SPECIES[opcao.to]
            const req = requisito(opcao)
            const emEstoque = req ? (items[req.itemId] ?? 0) : 0
            // A opção cara aparece mesmo sem as pedras, desabilitada e dizendo
            // quanto falta: escondê-la deixaria o jogador achando que só existe
            // um caminho.
            const falta = req ? Math.max(0, req.count - emEstoque) : 0
            const bloqueada = falta > 0
            return (
              <div
                key={opcao.to}
                className="flex items-center gap-[.6em] rounded-[.5em] border border-n700 p-[.5em]"
              >
                <PokeSwatch species={alvo} isShiny={poke.isShiny} poke={poke} size={3} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[.85em] font-medium text-n100">{alvo.name}</span>
                  <span className="text-[.72em] text-n400">
                    {alvo.type}{alvo.type2 ? ` · ${alvo.type2}` : ''}
                  </span>
                  {req && (
                    <span className={bloqueada ? 'text-[.72em] text-bad' : 'text-[.72em] text-n500'}>
                      {req.count}x {ITEMS[stoneItemId(req.type)]?.name ?? req.itemId}
                      {bloqueada ? ` · faltam ${falta}` : ' · você tem'}
                    </span>
                  )}
                </div>
                <GameButton
                  variant="accent"
                  disabled={bloqueada}
                  onClick={() => onEscolher(opcao.to)}
                >
                  Evoluir para {alvo.name}
                </GameButton>
              </div>
            )
          })}
        </div>

        <GameButton onClick={onCancelar}>Agora não</GameButton>
      </GameCard>
    </div>
  )
}
