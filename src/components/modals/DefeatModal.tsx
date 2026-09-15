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
import { podeLevantarDoDesmaio } from '@/engine/systems/autoSystem'
import { useWorldStore } from '@/stores/worldStore'
import { useGameStateStore } from '@/stores/gameStateStore'
import { GameButton } from '@/components/game/controls'
import { CampoOverlay } from './CampoOverlay'

export function DefeatModal() {
  // Na arena (PH-540) quem cai e trocado pelo proximo do time; o fim e o
  // ArenaOverlay que anuncia.
  const caido = useWorldStore((s) => Boolean(s.mapDef && !s.arena && s.player?.fainted))
  const mapDef = useWorldStore((s) => s.mapDef)
  const huntBoss = Boolean(mapDef?.noRespawn)
  // O MESMO predicado que o servidor usa pra parar a simulacao
  // (offlineSimSystem), e nao uma copia a mao — a copia que vivia aqui
  // (`!huntBoss && autoRevive && items.revive >= 1`) era a forma classica de o
  // aviso aparecer na hora errada, e apareceu: no Lance ela ignorava o
  // substituto do time e dizia "Voce foi derrotado" 2 s antes do proximo POKE
  // entrar (PH-546). Tambem ignorava o Max Revive, como a PH-508 ja tinha
  // corrigido no motor.
  const podeLevantar = useGameStateStore((s) => podeLevantarDoDesmaio(s, mapDef))
  if (!caido || podeLevantar) return null

  return (
    <CampoOverlay interativo>
      {/* Em `em`, e nao nos primitivos do shadcn (`rem`): dentro da HUD o
          tamanho tem que acompanhar a escala fluida e o `hudScale`, e o botao
          precisa do alvo de toque de 44px que so o `GameButton` carrega. */}
      <div className="mx-[1em] flex max-w-[22em] flex-col items-center gap-[.7em] rounded-xl border border-destructive bg-background px-[1.2em] py-[1em] text-center shadow-xl">
        <div className="text-[1.05em] font-bold text-destructive">Você foi derrotado!</div>
        <p className="text-[.85em] text-muted-foreground">
          {huntBoss
            ? 'Nesta hunt não há auto-revive. A caçada acabou.'
            : 'Sem auto-revive (ou sem Revive na mochila) a caçada para aqui — um POKE desmaiado não derrota nada, nem com o jogo fechado.'}
        </p>
        <GameButton variant="danger" onClick={() => controller.returnToHospital({ x: 0, y: 0 })}>
          Voltar para o Hospital
        </GameButton>
      </div>
    </CampoOverlay>
  )
}
