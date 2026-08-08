// Port do #boss-defeat-modal de js/ui/UIManager.js. Hunts BOSS desligam
// auto-pot/auto-revive por completo (ver autoSystem.ts) — morrer la e
// definitivo de proposito, entao em vez da contagem regressiva de revive
// aparece este aviso permanente cuja unica saida e ir embora.
import { controller } from '@/engine/controller'
import { useWorldStore } from '@/stores/worldStore'
import { Button } from '@/components/ui/button'
import { CampoOverlay } from './CampoOverlay'

export function BossDefeatModal() {
  const visible = useWorldStore((s) => Boolean(s.mapDef?.noRespawn && s.player?.fainted))
  if (!visible) return null

  return (
    <CampoOverlay interativo>
      <div className="mx-4 flex max-w-sm flex-col items-center gap-3 rounded-xl border border-destructive bg-background px-6 py-5 text-center shadow-xl">
        <div className="text-lg font-bold text-destructive">Voce foi derrotado!</div>
        <Button variant="destructive" onClick={() => controller.returnToHospital({ x: 0, y: 0 })}>
          Volte para Hospital e nao pise mais aqui
        </Button>
      </div>
    </CampoOverlay>
  )
}
