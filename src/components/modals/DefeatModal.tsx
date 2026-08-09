// Aviso de "voce foi derrotado e nao ha volta por si so".
//
// Era exclusivo das hunts BOSS (#boss-defeat-modal de js/ui/UIManager.js), onde
// auto-pot e auto-revive sao desligados de proposito. Passou a valer pra
// QUALQUER hunt em que o POKE cai sem como levantar — auto-revive desligado (o
// padrao de conta nova) ou Revive esgotado.
//
// Nao e cosmetico: com o POKE caido a cacada rende ZERO, e o servidor encerra a
// sessao por isso. Sem este aviso o jogador ficava olhando um POKE deitado num
// mapa que nao credita nada, sem nenhuma indicacao de que precisava curar — foi
// a versao "com o jogo aberto" do mesmo bug que matava o farm offline.
import { controller } from '@/engine/controller'
import { useWorldStore } from '@/stores/worldStore'
import { useGameStateStore } from '@/stores/gameStateStore'
import { Button } from '@/components/ui/button'
import { CampoOverlay } from './CampoOverlay'

export function DefeatModal() {
  const caido = useWorldStore((s) => Boolean(s.mapDef && s.player?.fainted))
  const huntBoss = useWorldStore((s) => Boolean(s.mapDef?.noRespawn))
  // Mesma condicao que o motor usa pra parar a simulacao (offlineSimSystem) e
  // que o autoSystem usa pra reanimar. Duplicar o criterio a mao seria a forma
  // classica de o aviso aparecer na hora errada.
  const podeLevantar = useGameStateStore(
    (s) => !huntBoss && s.autoToggles.autoRevive && (s.items.revive ?? 0) >= 1,
  )
  if (!caido || podeLevantar) return null

  return (
    <CampoOverlay interativo>
      <div className="mx-4 flex max-w-sm flex-col items-center gap-3 rounded-xl border border-destructive bg-background px-6 py-5 text-center shadow-xl">
        <div className="text-lg font-bold text-destructive">Voce foi derrotado!</div>
        <p className="text-sm text-muted-foreground">
          {huntBoss
            ? 'Nesta hunt nao ha auto-revive. A cacada acabou.'
            : 'Sem auto-revive (ou sem Revive na mochila) a cacada para aqui — um POKE desmaiado nao derrota nada, nem com o jogo fechado.'}
        </p>
        <Button variant="destructive" onClick={() => controller.returnToHospital({ x: 0, y: 0 })}>
          Voltar para o Hospital
        </Button>
      </div>
    </CampoOverlay>
  )
}
