// O aviso de CHEGADA numa sala nova (PH-395).
//
// Substitui o toast "Entrando em nova área: Relvado." — o nome do lugar
// competia com "Item encontrado: Potion" no mesmo canto e com a mesma duracao.
//
// TRES DECISOES QUE NAO SAO ESTETICA:
//
// 1. NAO CONGELA O JOGO. A contagem regressiva de 3s (`SalaCountdownModal`) ja
//    congela movimento e combate de proposito — ela cobre a ida ao servidor.
//    Congelar mais 4 segundos por sala tiraria ~4% do tempo de farm de quem
//    troca de sala a cada 90s. Este aviso e sobreposicao visual: nada de
//    `pointer-events`, nada de gate no `stepWorld`.
//
// 2. NAO COBRE JANELA ABERTA (pedido explicito do usuario). Com menu, perfil,
//    analyzer ou tutorial na tela, ele simplesmente nao desenha — e o relogio
//    CONTINUA correndo (ver `useEffect`), entao ele nao fica esperando pra
//    aparecer atrasado quando o jogador fechar o menu. Aviso de chegada que
//    aparece depois de o jogador ja ter andado meia sala nao informa: confunde.
//
// 3. NAO E MODAL DE MEIO DE TELA. Ele entra logo abaixo do trilho de status,
//    onde o `SalaChip` mora — o jogador ja olha pra la pra saber onde esta, e o
//    centro do campo e onde o combate acontece.
import { useEffect } from 'react'
import { quantidadeDeSalas } from '@/data/estagios'
import { janelaDaSala, nomeDaSala } from '@/engine/systems/salaSystem'
import { SUB_BIOMA_POR_CHAVE } from '@/data/biomas'
import { useJanelaSobreOCampo } from '@/stores/janelaSobreOCampo'
import { useSplashDeSalaStore } from '@/stores/splashDeSalaStore'
import { useWorldStore } from '@/stores/worldStore'

/**
 * Quanto tempo o aviso fica na tela, em ms. Pedido explicito do usuario: 4
 * segundos.
 *
 * E bem mais que o toast que ele substitui, e isso e o ponto — mas tambem e por
 * isso que ele NAO pode congelar o jogo nem cobrir o campo: 4 segundos de
 * bloqueio a cada sala seria um imposto sobre o farm.
 */
export const DURACAO_DO_SPLASH_DE_SALA_MS = 4000

const CSS = `
@keyframes splash-sala-entra {
  0%   { opacity: 0; transform: translateY(-10px) scale(.96) }
  12%  { opacity: 1; transform: translateY(0) scale(1) }
  82%  { opacity: 1; transform: translateY(0) scale(1) }
  100% { opacity: 0; transform: translateY(-8px) scale(.99) }
}
@keyframes splash-sala-brilho {
  0%, 100% { opacity: .25 }
  50%      { opacity: .6 }
}
/* A faixa de luz que atravessa o cartao uma vez. E o unico movimento continuo
   aqui: o resto entra e sai, pra nao disputar atencao com o combate. */
@keyframes splash-sala-varredura {
  0%   { transform: translateX(-120%) }
  60%  { transform: translateX(120%) }
  100% { transform: translateX(120%) }
}
@media (prefers-reduced-motion: reduce) {
  .splash-sala-cartao { animation: splash-sala-entra var(--dur) ease-out forwards !important }
  .splash-sala-varredura, .splash-sala-brilho { animation: none !important; opacity: 0 !important }
}
`

export function SplashDeSala() {
  const atual = useSplashDeSalaStore((s) => s.atual)
  const encerrar = useSplashDeSalaStore((s) => s.encerrar)
  const janelaAberta = useJanelaSobreOCampo()
  const faixa = useWorldStore((s) => s.mapDef?.levelRange)
  // PH-427: o total de salas vem do estagio, nao de uma constante.
  const salas = quantidadeDeSalas(useWorldStore((s) => s.mapDef?.id) ?? '')

  // O RELOGIO NAO DEPENDE DE ESTAR VISIVEL, e isso e proposital (ver a nota 2 do
  // topo). O efeito roda pelo `id`, entao ele tambem nao e reiniciado por
  // re-render nenhum — so por aviso novo.
  const id = atual?.id
  useEffect(() => {
    if (id == null) return
    const t = setTimeout(() => encerrar(id), DURACAO_DO_SPLASH_DE_SALA_MS)
    return () => clearTimeout(t)
  }, [id, encerrar])

  if (!atual || janelaAberta) return null

  const { sala, fechouEstagio } = atual
  const nome = nomeDaSala(sala) ?? sala.chave
  const bioma = SUB_BIOMA_POR_CHAVE[sala.chave]?.bioma.nome ?? null
  const janela = faixa ? janelaDaSala(faixa, sala.indice, salas) : null

  return (
    <>
      <style>{CSS}</style>
      {/* `fixed` + `pointer-events-none`: o clique atravessa pro canvas. Abaixo
          do trilho de status (que tem ~3.7em) e centralizado na largura. */}
      <div
        className="pointer-events-none fixed inset-x-0 z-[46] flex justify-center"
        style={{ top: 'calc(4.6em + var(--sa-top, 0px))' }}
        aria-live="polite"
      >
        <div
          className="splash-sala-cartao relative overflow-hidden rounded-[.9em] border border-sky-300/30 bg-n900/85 px-[1.4em] py-[.7em] text-center shadow-[0_8px_30px_rgba(0,0,0,.45)] backdrop-blur-[3px]"
          style={{
            // `--dur` alimenta tambem o fallback de `prefers-reduced-motion`.
            ['--dur' as string]: `${DURACAO_DO_SPLASH_DE_SALA_MS}ms`,
            animation: `splash-sala-entra ${DURACAO_DO_SPLASH_DE_SALA_MS}ms ease-out forwards`,
          }}
        >
          {/* Varredura de luz: um brilho que cruza o cartao uma vez. */}
          <span
            aria-hidden
            className="splash-sala-varredura pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-sky-200/20 to-transparent"
            style={{ animation: `splash-sala-varredura ${DURACAO_DO_SPLASH_DE_SALA_MS}ms ease-out forwards` }}
          />
          <span
            aria-hidden
            className="splash-sala-brilho pointer-events-none absolute inset-0 rounded-[.9em] bg-sky-400/10"
            style={{ animation: 'splash-sala-brilho 2s ease-in-out infinite' }}
          />

          <div className="relative flex flex-col items-center gap-[.15em]">
            <span className="text-[.62em] font-semibold uppercase tracking-[.18em] text-sky-300/90">
              {fechouEstagio ? `Estágio concluído` : 'Nova área'}
            </span>
            <span className="text-[1.15em] font-black leading-tight text-n50">{nome}</span>
            <span className="flex items-center gap-[.5em] text-[.66em] text-n400">
              <span className="tabular-nums">Sala {sala.indice + 1}/{salas}</span>
              {janela && <span className="tabular-nums">Lv {janela[0]}-{janela[1]}</span>}
              {bioma && <span className="max-w-[8em] truncate">{bioma}</span>}
            </span>
          </div>
        </div>
      </div>
    </>
  )
}
