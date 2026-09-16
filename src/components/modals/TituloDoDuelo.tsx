// PH-552: o titulo de 1 s do combate duelo ("Duelo contra X").
//
// Substitui as contagens regressivas de intro (5 s no Lance, 3 s na arena):
// a apresentacao de abertura — bola, pose de ameaca, habilidade de entrada —
// e o que antecede o primeiro golpe agora, e ela acontece NO CAMPO, entao o
// aviso nao pode cobrir o campo nem durar mais que um relance. So no cliente:
// nao le nem escreve nada do motor, e o servidor nao sabe que ele existe.
//
// Faixa fina no topo do campo, sem escurecer: o jogador precisa ver a bola
// sendo jogada por baixo dele.
import { useEffect, useState } from 'react'

const DURACAO_MS = 1000

export function TituloDoDuelo({ titulo }: { titulo: string }) {
  const [visivel, setVisivel] = useState(true)
  useEffect(() => {
    const id = window.setTimeout(() => setVisivel(false), DURACAO_MS)
    return () => window.clearTimeout(id)
  }, [])
  if (!visivel) return null

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[55] flex justify-center px-[1em]"
      style={{ top: 'calc(4.6em + var(--sa-top, 0px))' }}
    >
      <div className="vidro rounded-full border border-amber-500/70 px-[1.2em] py-[.4em] text-[1.05em] font-semibold text-amber-200 shadow-xl">
        {titulo}
      </div>
    </div>
  )
}
