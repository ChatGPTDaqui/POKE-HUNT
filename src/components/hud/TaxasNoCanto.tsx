// Gold/h, XP/h e Mobs/h no canto inferior direito (PH-279).
//
// Elas moravam no trilho de status, e sairam de la por dois motivos que se
// somaram: o pedido do usuario, e a largura. A faixa central do trilho passou a
// carregar a sala (PH-272), e as tres taxas comiam ~230px justamente dali — a
// PH-272 ja tinha precisado reduzi-las a so `Gold/h` pra o nome do sub-bioma
// caber. Aqui elas ganham espaco proprio e voltam inteiras.
//
// ANCORADA NO RODAPE MEDIDO, e nao num `bottom` fixo: a doca de acao muda de
// altura com o regime, com o numero de golpes do POKE e com a escala da HUD
// (ver `uiStore.footerHeight`, alimentado por um ResizeObserver em HudLayer).
// Um valor fixo aqui poria as taxas por cima da doca em algum desses casos, e a
// doca e o unico caminho de navegacao no celular.
//
// Continua sendo o mesmo BOTAO de antes: tocar abre o Hunt Analyzer. As taxas
// tambem seguem na gaveta de detalhes do trilho — quem procura o numero exato
// tem dois caminhos, e nenhum deles depende deste canto.
import { useGameStateStore } from '@/stores/gameStateStore'
import { getPerfStats } from '@/engine/systems/farmRates'
import { useIntervalo } from '@/hooks/useIntervalo'
import { useUiStore, useDeviceMode } from '@/stores/uiStore'
import { useWorldStore } from '@/stores/worldStore'

function fmtTaxa(valor: number): string {
  const abs = Math.abs(valor)
  if (abs >= 1_000_000) return `${(valor / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (abs >= 1000) return `${(valor / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return String(valor)
}

export function TaxasNoCanto() {
  const perfStats = useGameStateStore((s) => s.perfStats)
  const abrirAnalyzer = useUiStore((s) => s.setAnalyzerOpen)
  const footerHeight = useUiStore((s) => s.footerHeight)
  const mode = useDeviceMode().mode
  // Fora de hunt nao ha o que medir, e um "Gold/h 0" permanente no Hospital e
  // ruido: a taxa e sobre a cacada, e o jogador nao esta cacando.
  const emHunt = useWorldStore((s) => s.mapDef != null)
  // O denominador e tempo decorrido: ele avanca sozinho mesmo sem nenhum abate,
  // entao o valor precisa ser recalculado no relogio, nao no estado.
  useIntervalo(1000)
  if (!emHunt) return null
  const stats = getPerfStats({ perfStats } as Parameters<typeof getPerfStats>[0])

  return (
    <div
      className="pointer-events-none absolute right-[.5em] z-20 flex justify-end"
      // `+ .5em` e o mesmo respiro que o rodape usa contra a borda de baixo.
      style={{ bottom: `calc(${footerHeight}px + .5em)` }}
    >
      <button
        type="button"
        data-keep-open
        onClick={() => abrirAnalyzer(true)}
        title="Abrir o Hunt Analyzer"
        className={
          'vidro pointer-events-auto flex cursor-pointer items-center gap-[.7em] rounded-full '
          + 'px-[.9em] py-[.35em] font-[inherit] text-[.72em] text-n400'
        }
      >
        <span>Gold/h <b className="font-medium text-gold">{fmtTaxa(stats.goldPerHour)}</b></span>
        {/* No compacto so o ouro: em 390px as tres empurrariam o bloco pra cima
            da doca, e o ouro por hora e o numero pelo qual um jogo idle e
            julgado. Os outros dois continuam na gaveta e no Analyzer. */}
        {mode !== 'compacto' && (
          <>
            <span>XP/h <b className="font-medium text-n200">{fmtTaxa(stats.xpPerHour)}</b></span>
            <span>Mobs/h <b className="font-medium text-n200">{stats.mobsPerHour}</b></span>
          </>
        )}
      </button>
    </div>
  )
}
