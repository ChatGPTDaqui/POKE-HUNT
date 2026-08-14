// Onde o jogador esta DENTRO da hunt: qual sala, qual sub-bioma, e quanto
// falta pra limpar.
//
// Some no Hospital e nas hunts sem salas (a inicial, as 11 BOSS e a do Campeao
// Lance) — nelas nao ha sala, e um chip vazio pendurado no HUD leria como bug.
import { useWorldStore } from '@/stores/worldStore'
import { SALAS_POR_HUNT, ABATES_POR_SALA } from '@/data/biomas'
import { janelaDaSala, nomeDaSala } from '@/engine/systems/salaSystem'

export function SalaChip() {
  const sala = useWorldStore((s) => s.sala)
  const faixa = useWorldStore((s) => s.mapDef?.levelRange)
  if (!sala) return null

  const nome = nomeDaSala(sala)
  // A janela sobe com a sala: a hunt afunda conforme voce limpa. Mostrar so o
  // intervalo da HUNT (Lv1-30) esconderia justamente isso.
  const janela = faixa ? janelaDaSala(faixa, sala.indice) : null
  const restantes = Math.max(0, ABATES_POR_SALA - sala.abates)
  const progresso = Math.min(1, sala.abates / ABATES_POR_SALA)

  return (
    <div className="hud-surface flex items-center gap-[.6em] rounded-full border border-n800 px-[1.1em] py-[.4em] shadow-sm">
      <span className="text-[.72em] tabular-nums text-n400">
        Sala <b className="font-medium text-n100">{sala.indice + 1}</b>/{SALAS_POR_HUNT}
      </span>
      <span className="text-[.78em] font-medium text-n100">{nome}</span>
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
      <span className="text-[.7em] tabular-nums text-n500">{restantes} p/ limpar</span>
      {sala.ciclos > 0 && (
        <span className="text-[.7em] tabular-nums text-n500">· ciclo {sala.ciclos + 1}</span>
      )}
    </div>
  )
}
