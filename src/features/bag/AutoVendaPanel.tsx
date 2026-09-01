// Bot de auto-venda: vende a captura no instante em que ela acontece, filtrada
// por raridade.
//
// Mora na Mochila, e nao no painel do Bot com auto-pot/auto-catch, porque o que
// ele evita e a MOCHILA entupir: e aqui que o jogador ve o problema e aqui que
// ele vai procurar a solucao.
//
// Quem decide de fato e o MOTOR (`autoVendeEstaCaptura`, em captureSystem), que
// roda igual no cliente e no servidor. Esta tela so escreve a config — e a
// sincroniza pelo mesmo caminho em bloco das outras automacoes
// (`sincronizarAuto`), porque o servidor LE esta regra durante a simulacao:
// config dessincronizada aqui e POKE vendido (ou nao vendido) contra a vontade
// do jogador.
import { useEffect, useRef } from 'react'
import { CaretDown, CurrencyCircleDollar } from '@phosphor-icons/react'
import { RARITIES, type RarityKey } from '@/data/rarity'
import { useGameStateStore } from '@/stores/gameStateStore'
import { sincronizarAuto } from '@/data/remote/autoridade'
import { GameSwitch } from '@/components/game/controls'
import { cn } from '@/lib/utils'

// Ordem crescente de raridade, a mesma do resto do jogo — o jogador le de
// "vende o lixo" pra "vende o que e bom", que e a direcao da decisao.
const ORDEM: RarityKey[] = ['comum', 'incomum', 'raro', 'ultra', 'legendary', 'mythic']

/**
 * Resumo do estado para a barra fechada. Fechar a secao NAO pode esconder o
 * estado: sem isto o jogador nao saberia que esta vendendo COMUM
 * automaticamente sem abrir o bloco, e a primeira captura perdida viraria bug
 * reportado.
 */
export function useResumoAutoVenda(): { resumo: string; ligada: boolean; semRaridade: boolean } {
  const config = useGameStateStore((s) => s.autoSellConfig)
  const semRaridade = config.ligado && config.raridades.length === 0
  const resumo = !config.ligado
    ? 'desligada'
    : semRaridade
      ? 'sem raridade'
      : config.raridades.map((r) => RARITIES[r].label).join(', ')
  return { resumo, ligada: config.ligado, semRaridade }
}

/**
 * Gatilho da auto-venda, feito pra caber na fileira das abas.
 *
 * Ele era um bloco proprio no topo da lista: 46px de altura mais o espaco entre
 * blocos, permanentes, numa tela onde cada linha de card custa ~65px. A fileira
 * das abas ao lado usava 190px dos 374 disponiveis — o resto era vidro vazio.
 */
export function ChipAutoVenda({ aberto, onToggle }: { aberto: boolean; onToggle: () => void }) {
  const { resumo, ligada, semRaridade } = useResumoAutoVenda()
  return (
    <button
      type="button"
      aria-expanded={aberto}
      aria-label={`Auto-venda: ${resumo}`}
      onClick={onToggle}
      className={cn(
        'jogo-botão flex min-w-0 shrink cursor-pointer items-center gap-[.3em] rounded-[.6em]',
        'border border-n800 bg-n900 px-[.55em] font-[inherit] text-[.8em] transition-colors',
        semRaridade && 'border-warn/60',
      )}
    >
      <CurrencyCircleDollar className={cn('shrink-0 text-[1.15em]', ligada ? 'text-gold' : 'text-n500')} />
      <span className="truncate text-n400">{resumo}</span>
      <CaretDown className={cn('shrink-0 text-n500 transition-transform duration-150', aberto && 'rotate-180')} />
    </button>
  )
}

export function AutoVendaPanel() {
  const config = useGameStateStore((s) => s.autoSellConfig)
  const setAutoSellConfig = useGameStateStore((s) => s.setAutoSellConfig)

  // Mesmo desenho do AutoPanel: sincroniza em bloco quando muda, e IGNORA o
  // primeiro disparo — ele aconteceria logo depois de o estado chegar do
  // servidor e mandaria os mesmos valores de volta a cada abertura da tela.
  const primeiraSync = useRef(true)
  useEffect(() => {
    if (primeiraSync.current) {
      primeiraSync.current = false
      return
    }
    sincronizarAuto()
  }, [config])

  function alternarRaridade(chave: RarityKey) {
    const marcada = config.raridades.includes(chave)
    setAutoSellConfig({
      raridades: marcada
        ? config.raridades.filter((r) => r !== chave)
        : [...config.raridades, chave],
    })
  }

  return (
    <div className="flex flex-col gap-[.5em] rounded-[.7em] border border-n800 bg-n900 px-[.6em] py-[.55em]">
      <div className="flex items-center justify-between gap-[.5em]">
        <span className="text-[.8em] text-n400">Vender captura na hora</span>
        <GameSwitch
          label="Ligar auto-venda"
          checked={config.ligado}
          onChange={(valor) => setAutoSellConfig({ ligado: valor })}
        />
      </div>

      <p className="text-[.75em] leading-[1.35] text-n400">
        Vende a captura na hora, antes de ela entrar na mochila.{' '}
        <b className="text-shiny">Shiny nunca é vendido</b>, mesmo com a raridade dele marcada.
      </p>

      <div className="flex flex-wrap gap-[.3em]">
        {ORDEM.map((chave) => {
          const def = RARITIES[chave]
          const marcada = config.raridades.includes(chave)
          return (
            <button
              key={chave}
              type="button"
              aria-pressed={marcada}
              onClick={() => alternarRaridade(chave)}
              className={cn(
                // `jogo-botao`: gancho do alvo minimo de toque (ver index.css).
                // Sao seis chips lado a lado e, com 20px de altura, errar o
                // vizinho no dedo liga a venda automatica de uma raridade que
                // o jogador nao escolheu.
                'jogo-botão flex cursor-pointer items-center rounded-[.35em] border px-[.5em] py-[.25em] text-[.72em] transition-colors',
                marcada ? 'border-transparent font-semibold text-[#0b0e18]' : 'border-n700 text-n400',
              )}
              style={marcada ? { backgroundColor: def.color } : undefined}
            >
              {def.label}
            </button>
          )
        })}
      </div>

      {config.ligado && config.raridades.length === 0 && (
        <p className="text-[.72em] text-warn">
          Ligado, mas sem raridade marcada — nada será vendido.
        </p>
      )}
    </div>
  )
}
