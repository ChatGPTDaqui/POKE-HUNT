// Vinheta do chefe da sala (21/10/2026, pedido do dono): "ao matar o poke 29,
// aparece uma breve cutscene dizendo boss, guardiao..., entao o referido poke
// nasce em algum lugar aleatorio do mapa". Fica DENTRO da faixa do campo (mesma
// regra da CutsceneDeArea: nunca cobre menu) e nao congela o jogo — o POKE ja
// sai andando ate o chefe enquanto ela passa.
import { useEffect } from 'react'
import { useStore } from 'zustand'
import { SPECIES } from '@/data/pokes'
import { gen5SpriteUrl } from '@/data/gen5Sprites'
import { anuncioDoChefeStore } from '@/stores/anuncioDoChefeVanilla'
import { useFaixaDoCampo } from '@/hooks/useFaixaDoCampo'

export const DURACAO_DO_ANUNCIO_MS = 2600

const CSS = `
@keyframes chefe-faixa { 0% { opacity: 0 } 10% { opacity: 1 } 85% { opacity: 1 } 100% { opacity: 0 } }
@keyframes chefe-listras { from { background-position: 0 0 } to { background-position: 120px 0 } }
@keyframes chefe-titulo {
  0% { opacity: 0; transform: scale(2.2); letter-spacing: .6em }
  14% { opacity: 1; transform: scale(1); letter-spacing: .18em }
  22% { transform: scale(1.06) } 30% { transform: scale(1) }
  100% { opacity: 1; transform: scale(1); letter-spacing: .18em }
}
@keyframes chefe-sprite {
  0%, 18% { opacity: 0; transform: translateY(14px) scale(.6); filter: brightness(0) drop-shadow(0 0 0 transparent) }
  34% { opacity: 1; transform: translateY(0) scale(1.08); filter: brightness(0) drop-shadow(0 0 .6em var(--cor)) }
  48% { filter: brightness(2.2) drop-shadow(0 0 1em var(--cor)) }
  60%, 100% { opacity: 1; transform: none; filter: brightness(1) drop-shadow(0 0 .7em var(--cor)) }
}
@keyframes chefe-nome { 0%, 40% { opacity: 0; transform: translateY(6px) } 55%, 100% { opacity: 1; transform: none } }
@media (prefers-reduced-motion: reduce) {
  .chefe-anuncio * { animation-duration: .01ms !important; animation-delay: 0s !important }
}
`

const ESTILO = {
  guardian: { titulo: 'Guardião', icone: '⚔', cor: '#ff5a4e' },
  lord: { titulo: 'Lord', icone: '👑', cor: '#f5c542' },
} as const

export function AnuncioDoChefe() {
  const atual = useStore(anuncioDoChefeStore, (s) => s.atual)
  const encerrar = useStore(anuncioDoChefeStore, (s) => s.encerrar)
  const faixa = useFaixaDoCampo()

  const id = atual?.id
  useEffect(() => {
    if (id == null) return
    const t = setTimeout(() => encerrar(id), DURACAO_DO_ANUNCIO_MS)
    return () => clearTimeout(t)
  }, [id, encerrar])

  if (!atual) return null
  const especie = SPECIES[atual.speciesId]
  const e = ESTILO[atual.tipo]

  return (
    <>
      <style>{CSS}</style>
      <div key={atual.id} className="chefe-anuncio pointer-events-none fixed left-0 right-0 z-[56] flex items-center justify-center overflow-hidden"
        style={{ ...faixa, ['--cor' as string]: e.cor }} role="status" aria-live="assertive">
        <div className="relative flex w-full flex-col items-center gap-[.3em] py-[1em]"
          style={{
            animation: `chefe-faixa ${DURACAO_DO_ANUNCIO_MS}ms ease-out forwards`,
            background: `linear-gradient(90deg, transparent, rgba(8,4,12,.88) 12%, rgba(8,4,12,.88) 88%, transparent)`,
            borderTop: `2px solid ${e.cor}`, borderBottom: `2px solid ${e.cor}`,
          }}>
          <div aria-hidden className="absolute inset-0 opacity-25"
            style={{ background: `repeating-linear-gradient(115deg, ${e.cor} 0 14px, transparent 14px 30px)`, animation: 'chefe-listras 1.2s linear infinite' }} />
          <div className="relative font-black uppercase"
            style={{ fontSize: 'clamp(1.8em, 7vw, 3em)', color: e.cor, textShadow: `0 0 .4em ${e.cor}, 0 .08em 0 #000`, animation: 'chefe-titulo .9s cubic-bezier(.2,1.4,.4,1) forwards' }}>
            {e.icone} {e.titulo}
          </div>
          {especie && (
            <img src={gen5SpriteUrl(especie.id, atual.isShiny)} alt="" className="relative h-[4.5em] w-[4.5em] object-contain"
              style={{ imageRendering: 'pixelated', animation: `chefe-sprite ${DURACAO_DO_ANUNCIO_MS}ms ease-out forwards` }} />
          )}
          <div className="relative text-[1em] font-semibold text-white"
            style={{ animation: `chefe-nome ${DURACAO_DO_ANUNCIO_MS}ms ease-out forwards` }}>
            {especie?.name ?? atual.speciesId}{atual.isShiny ? ' ✨' : ''} apareceu!
          </div>
        </div>
      </div>
    </>
  )
}
