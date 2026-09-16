// Os dois unicos avisos da arena (PH-540): o titulo do duelo e o resultado no
// fim. Todo o resto — HUD, barras, arte — e o da hunt.
//
// PH-552: a contagem de 3 s saiu — a abertura (bola, pose, habilidade) e o
// que antecede o primeiro golpe, e ela acontece no campo. Sobrou "Duelo
// contra X" por 1 s, so no cliente, sem cobrir a bola sendo jogada.
import { CampoOverlay } from '@/components/modals/CampoOverlay'
import { TituloDoDuelo } from '@/components/modals/TituloDoDuelo'
import { GameButton } from '@/components/game/controls'
import { useWorldStore } from '@/stores/worldStore'
import { sairDaArena, useArenaStore, vereditoParaTela } from './arena'

const TITULO = { vitoria: 'Vitória!', derrota: 'Derrota', empate: 'Empate' } as const
const COR = { vitoria: 'text-amber-300', derrota: 'text-destructive', empate: 'text-n300' } as const

export function ArenaOverlay() {
  const naArena = useWorldStore((s) => s.arena != null)
  const resultadoLocal = useWorldStore((s) => s.arena?.resultado ?? 'lutando')
  const veredito = useArenaStore((s) => s.veredito)
  const nomeDoRival = useArenaStore((s) => s.nomeDoRival)
  if (!naArena) return null

  const final = vereditoParaTela(resultadoLocal, veredito)
  if (!final) return <TituloDoDuelo titulo={`Duelo contra ${nomeDoRival}`} />

  return (
    <CampoOverlay interativo>
      <div className="mx-[1em] flex max-w-[22em] flex-col items-center gap-[.7em] rounded-xl border border-n700 bg-background px-[1.2em] py-[1em] text-center shadow-xl">
        <div className={`text-[1.2em] font-bold ${COR[final]}`}>{TITULO[final]}</div>
        <p className="text-[.85em] text-muted-foreground">Duelo contra {nomeDoRival}.</p>
        <GameButton onClick={sairDaArena}>Voltar ao Centro Pokémon</GameButton>
      </div>
    </CampoOverlay>
  )
}
