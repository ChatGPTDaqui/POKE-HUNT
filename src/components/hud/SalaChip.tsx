// Onde o jogador esta DENTRO da hunt: qual sala, qual sub-bioma, e quanto
// falta pra limpar.
//
// Some no Hospital e nas hunts sem salas (a inicial, as 11 BOSS e a do Campeao
// Lance) — nelas nao ha sala, e um chip vazio pendurado no HUD leria como bug.
import { useWorldStore } from '@/stores/worldStore'
import { useGameStateStore } from '@/stores/gameStateStore'
import { SALAS_POR_HUNT, ABATES_POR_SALA } from '@/data/biomas'
import { janelaDaSala, nomeDaSala } from '@/engine/systems/salaSystem'
import { avancarSalaManualmente } from '@/data/remote/autoridade'
import { GameButton } from '@/components/game/controls'

export function SalaChip() {
  const sala = useWorldStore((s) => s.sala)
  const faixa = useWorldStore((s) => s.mapDef?.levelRange)
  const countdown = useWorldStore((s) => s.salaCountdownRemaining)
  const avancoManualLigado = useGameStateStore((s) => s.autoToggles.avancoManualDeSala)
  if (!sala) return null

  const nome = nomeDaSala(sala)
  // A janela sobe com a sala: a hunt afunda conforme voce limpa. Mostrar so o
  // intervalo da HUNT (Lv1-30) esconderia justamente isso.
  const janela = faixa ? janelaDaSala(faixa, sala.indice) : null
  const restantes = Math.max(0, ABATES_POR_SALA - sala.abates)
  const progresso = Math.min(1, sala.abates / ABATES_POR_SALA)
  // PH-180: so aparece com a quota FECHADA, o toggle ligado (senao a sala ja
  // trocou sozinha) e sem transicao em andamento (o clique nao tem o que
  // fazer enquanto o overlay de "Entrando em nova area" ja esta na tela).
  const podeAvancarManual = avancoManualLigado && sala.abates >= ABATES_POR_SALA && countdown == null

  return (
    <div className="vidro flex items-center gap-[.6em] overflow-hidden rounded-full px-[.9em] py-[.35em]">
      <span className="text-[.72em] tabular-nums text-n400">
        Sala <b className="font-medium text-n100">{sala.indice + 1}</b>/{SALAS_POR_HUNT}
      </span>
      <span className="min-w-0 truncate text-[.78em] font-medium text-n100">{nome}</span>
      {janela && (
        <span className="text-[.7em] tabular-nums text-n500">Lv {janela[0]}-{janela[1]}</span>
      )}
      {/* Barra em vez de so o numero: e a informacao que o jogador olha de
          relance pra saber se vale esperar a proxima sala. */}
      <span className="relative h-[.4em] w-[4.5em] overflow-hidden rounded-full bg-n800">
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-ok transition-[width] duration-300"
          style={{ width: `${progresso * 100}%` }}
        />
      </span>
      <span className="shrink-0 text-[.7em] tabular-nums text-n500">{restantes} p/ limpar</span>
      {sala.ciclos > 0 && (
        <span className="text-[.7em] tabular-nums text-n500">· ciclo {sala.ciclos + 1}</span>
      )}
      {podeAvancarManual && (
        <GameButton
          variant="ghost"
          className="shrink-0 px-[.5em] py-[.15em] text-[.68em]"
          onClick={() => void avancarSalaManualmente()}
        >
          Próximo Nível
        </GameButton>
      )}
    </div>
  )
}
