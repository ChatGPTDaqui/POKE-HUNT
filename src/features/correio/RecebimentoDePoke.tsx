// Tela de recebimento: o POKE que acabou de sair do correio, com destaque
// (PH-164).
//
// POR QUE UMA TELA, e nao so um toast: o toast do jogo dura ~3s e divide espaco
// com auto-pot, auto-catch e recompensa de abate — uma concessao que acontece
// UMA VEZ na vida da conta nao pode competir com isso. A tela para o jogo,
// mostra o que chegou e espera um clique.
//
// NAO SOBREVIVE A RECARGA, de proposito (criterio de aceite 6): o estado vive
// no componente que abriu, e nada e persistido. Uma splash guardada em
// localStorage reapareceria a cada F5 e viraria um anuncio que o jogador nao
// consegue desligar — e o POKE ja esta na equipe, entao a tela nao guarda
// informacao nenhuma que se perca ao fechar.
import { useEffect } from 'react'
import { GameButton } from '@/components/game/controls'
import { gen5SpriteUrl } from '@/data/gen5Sprites'
import { spriteUrl } from '@/data/sprites'
import type { PokeRecebido } from '@/data/remote/correioRealtime'

const CSS = `
@keyframes recebimento-brilho {
  0%   { opacity: .35; transform: scale(.9) }
  50%  { opacity: .75; transform: scale(1.06) }
  100% { opacity: .35; transform: scale(.9) }
}
@keyframes recebimento-entrada {
  0%   { opacity: 0; transform: translateY(14px) scale(.86) }
  60%  { opacity: 1; transform: translateY(0) scale(1.04) }
  100% { opacity: 1; transform: translateY(0) scale(1) }
}
@media (prefers-reduced-motion: reduce) {
  .recebimento-arte, .recebimento-halo { animation: none !important }
}
`

interface Props {
  poke: PokeRecebido
  onFechar: () => void
}

export function RecebimentoDePoke({ poke, onFechar }: Props) {
  // Esc fecha. Uma tela que so sai por clique num botao especifico e uma
  // armadilha no teclado.
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') onFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onFechar])

  // A arte grande e o GIF animado do perfil; o PNG estatico e o degrau de
  // baixo. `onError` troca um pelo outro em vez de deixar o alt quebrado — a
  // tela inteira e a arte, e sem ela nao sobra nada pra mostrar.
  const animado = gen5SpriteUrl(poke.speciesId, poke.isShiny)
  const estatico = spriteUrl(poke.speciesId, poke.isShiny)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Voce recebeu ${poke.nome}`}
      className="fixed inset-0 z-[50] flex items-center justify-center bg-black/80 p-[1em]"
      onClick={onFechar}
    >
      <style>{CSS}</style>
      <div
        className="recebimento-arte flex w-full max-w-[22em] flex-col items-center gap-[.6em] rounded-[.8em] border border-amber-500/60 bg-n900 px-[1.2em] py-[1.4em] text-center shadow-2xl"
        style={{ animation: 'recebimento-entrada .45s ease-out both' }}
        // O clique no cartao nao pode fechar junto com o do fundo.
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[.8em] uppercase tracking-[.15em] text-amber-300">Voce recebeu</div>

        <div className="relative flex h-[9em] w-[9em] items-center justify-center">
          <div
            aria-hidden
            className="recebimento-halo absolute inset-0 rounded-full bg-amber-400/25 blur-xl"
            style={{ animation: 'recebimento-brilho 2.4s ease-in-out infinite' }}
          />
          <img
            src={animado}
            alt={poke.nome}
            className="relative max-h-full max-w-full object-contain"
            style={{ imageRendering: 'pixelated' }}
            onError={(e) => {
              const img = e.currentTarget
              if (estatico && img.src !== estatico && !img.src.endsWith(estatico)) img.src = estatico
            }}
          />
        </div>

        <div className="flex flex-col gap-[.15em]">
          <b className="text-[1.3em] font-semibold text-foreground">
            {poke.isShiny && <span className="text-[#b366ff]">✨ </span>}
            {poke.nome}
          </b>
          <span className="text-[.85em] text-n400">Nivel {poke.level}</span>
        </div>

        <p className="text-[.85em] text-n300">
          {poke.nome} entrou na sua equipe.
        </p>

        {/* `autoFocus`: a tela cobre o correio inteiro, e sem isso o foco do
            teclado fica numa lista que nao da mais pra ver. */}
        <GameButton autoFocus variant="primary" block onClick={onFechar}>
          Continuar
        </GameButton>
      </div>
    </div>
  )
}
