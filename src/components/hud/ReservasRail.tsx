// Trilho de reservas — a fila atras do POKE em campo (PH-75).
//
// SO as reservas. O POKE em campo ja tem a linha inteira do `StatusRail` (HP,
// XP, status, evolucao); repetir a foto dele aqui seria gastar a coluna com
// informacao que ja esta dois centimetros acima. Por isso a numeracao comeca em
// 2: o slot 1 e o campo.
//
// Isso tambem e o que faz "arrastar pra organizar" e "colocar em campo"
// conviverem. No modelo do servidor o ativo e SEMPRE o slot 0 (`definir_ativo`
// rotaciona o escolhido pro topo e empurra o resto pra baixo), entao ordem e
// campo nao sao independentes. Como o trilho mostra so a fila DE TRAS, arrastar
// reordena a fila e "colocar em campo" tira da fila — nenhuma acao desfaz a
// outra.
//
// Onde ele mora: dentro do container do topo que ja existe (o do `StatusRail` e
// do `SalaChip`), como bloco alinhado a esquerda. `HudLayer.tsx` registra que um
// `ActivePokeCard` ancorado a esquerda foi removido porque em 390px os cards
// laterais somavam ~450px numa tela de 374px uteis e cobriam a barra de HP.
// Entrando no mesmo container, o trilho EMPURRA em vez de sobrepor, que e a
// regra que aquele arquivo estabelece.
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowFatUp, IdentificationCard } from '@phosphor-icons/react'
import { SPECIES, type PokeInstance } from '@/data/pokes'
import { faceIconUrl } from '@/data/sprites'
import { rarityOf } from '@/data/rarity'
import { controller } from '@/engine/controller'
import { useGameStateStore } from '@/stores/gameStateStore'
import { usePokeProfileStore } from '@/stores/pokeProfileStore'
import { useDeviceMode } from '@/stores/uiStore'
import { PokeTooltipContent } from '@/components/shared/PokeTooltipContent'
import { cn } from '@/lib/utils'

/** Lado do quadrado da foto, em `em`, por regime. */
const TAMANHO_AMPLO = 2.6
const TAMANHO_COMPACTO = 1.9

/**
 * Quantos pixels o ponteiro precisa andar pra virar arrasto.
 *
 * Sem folga, qualquer clique com tremida de dedo comeca um arrasto e o menu
 * nunca abre no toque. Seis e o menor valor que sobreviveu ao teste de tocar e
 * soltar sem mover de proposito.
 */
const FOLGA_DE_ARRASTO = 6

interface Arrasto {
  /** Indice NA EQUIPE (nao no trilho): reserva 0 do trilho e equipe 1. */
  indice: number
  yInicial: number
  deslocamento: number
  passou: boolean
}

export function ReservasRail() {
  const team = useGameStateStore((s) => s.team)
  const { compacto, coarse } = useDeviceMode()
  const showProfile = usePokeProfileStore((s) => s.showProfile)

  const [arrasto, setArrasto] = useState<Arrasto | null>(null)
  const [menuAberto, setMenuAberto] = useState<string | null>(null)
  const [sobre, setSobre] = useState<string | null>(null)
  const alturaDoCard = useRef(0)
  const trilhoRef = useRef<HTMLDivElement>(null)

  // O slot 0 e o POKE em campo e vive no StatusRail.
  const reservas = team.slice(1)

  const tamanho = compacto ? TAMANHO_COMPACTO : TAMANHO_AMPLO

  // Quantas posicoes o card andou, a partir do deslocamento em pixels.
  const deslocamentoEmPosicoes = useCallback((px: number) => {
    const h = alturaDoCard.current
    if (!h) return 0
    return Math.round(px / h)
  }, [])

  // Fecha o menu ao tocar/clicar fora. Listener de documento, mesmo padrao do
  // fechar-ao-tocar-fora dos sheets — um backdrop que capturasse o toque faria
  // qualquer acao seguinte exigir dois toques.
  useEffect(() => {
    if (!menuAberto) return
    function aoApontar(e: PointerEvent) {
      if (!trilhoRef.current?.contains(e.target as Node)) setMenuAberto(null)
    }
    document.addEventListener('pointerdown', aoApontar)
    return () => document.removeEventListener('pointerdown', aoApontar)
  }, [menuAberto])

  // Equipe sem reserva nenhuma nao desenha nada — nem um bloco vazio ocupando
  // altura no topo da tela.
  if (reservas.length === 0) return null

  function aoDescer(e: React.PointerEvent<HTMLDivElement>, indiceNaEquipe: number) {
    // So o botao principal arrasta; o direito e do menu de contexto do browser.
    if (e.button !== 0) return
    alturaDoCard.current = e.currentTarget.getBoundingClientRect().height
    // Captura opcional: ela so mantem os eventos chegando quando o ponteiro sai
    // do card no meio do gesto. Chamada sem guarda, ela DERRUBA o clique inteiro
    // onde a API nao existe (jsdom, e navegador antigo sem Pointer Events) — e
    // o clique e o caminho pro menu, que e a funcao principal do card.
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setArrasto({ indice: indiceNaEquipe, yInicial: e.clientY, deslocamento: 0, passou: false })
  }

  function aoMover(e: React.PointerEvent<HTMLDivElement>) {
    if (!arrasto) return
    const deslocamento = e.clientY - arrasto.yInicial
    setArrasto((a) => (a ? {
      ...a,
      deslocamento,
      passou: a.passou || Math.abs(deslocamento) >= FOLGA_DE_ARRASTO,
    } : a))
  }

  function aoSubir(e: React.PointerEvent<HTMLDivElement>, poke: PokeInstance) {
    if (!arrasto) return
    const { indice, deslocamento, passou } = arrasto
    setArrasto(null)
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture?.(e.pointerId)
    }

    // Nao passou da folga = foi clique, nao arrasto.
    if (!passou) {
      setMenuAberto((atual) => (atual === poke.uid ? null : poke.uid))
      return
    }

    const destino = indice + deslocamentoEmPosicoes(deslocamento)
    // `clamp` no intervalo das RESERVAS: 1 (logo atras do campo) ate o fim.
    // Arrastar pra cima alem do topo NAO promove pra campo — isso e o
    // "Colocar em campo" do menu, que faz o preload da arte e mexe no
    // worldStore. A RPC recusa qualquer ordem que mude o slot 0.
    const alvo = Math.max(1, Math.min(team.length - 1, destino))
    if (alvo !== indice) controller.reorderTeam(indice, alvo)
  }

  return (
    // Wrapper sem clique: a camada da HUD inteira e `pointer-events-none` (ver
    // JogoCarregado.tsx) e cada filho reativa so a propria area. Um wrapper
    // clicavel de largura total bloquearia o toque no canvas na faixa toda.
    <div ref={trilhoRef} className="pointer-events-none flex">
      <div className="pointer-events-auto flex flex-col gap-[.25em]">
        {reservas.map((poke, i) => {
          const indiceNaEquipe = i + 1
          const especie = SPECIES[poke.speciesId]
          if (!especie) return null
          const url = faceIconUrl(especie.id, poke.isShiny)
          const arrastando = arrasto?.indice === indiceNaEquipe && arrasto.passou
          const hpPct = Math.max(0, Math.min(100, (poke.hp / poke.stats.hp) * 100))
          const desmaiado = poke.hp <= 0

          return (
            <div key={poke.uid} className="relative">
              <div
                role="button"
                tabIndex={0}
                aria-label={`Reserva ${indiceNaEquipe + 1}: ${especie.name} nivel ${poke.level}`}
                // `touch-action: none` e o que permite arrastar no toque: sem
                // isto o navegador trata o gesto vertical como rolagem e nunca
                // entrega os `pointermove`.
                style={{
                  touchAction: 'none',
                  transform: arrastando ? `translateY(${arrasto.deslocamento}px)` : undefined,
                }}
                className={cn(
                  'flex select-none items-center gap-[.3em] rounded-[.5em] border bg-n900/85 p-[.2em] pr-[.4em]',
                  'backdrop-blur-[2px] transition-colors',
                  arrastando ? 'z-10 border-primary opacity-90 shadow-lg' : 'border-n800 hover:border-n600',
                  menuAberto === poke.uid && 'border-primary',
                  desmaiado && 'grayscale',
                )}
                onPointerDown={(e) => aoDescer(e, indiceNaEquipe)}
                onPointerMove={aoMover}
                onPointerUp={(e) => aoSubir(e, poke)}
                onPointerCancel={() => setArrasto(null)}
                // Hover so com mouse. Em aparelho de toque o resumo vai no
                // menu — `pointerenter` dispara no toque tambem e deixaria a
                // bolha presa na tela depois do dedo sair.
                onPointerEnter={(e) => { if (e.pointerType === 'mouse') setSobre(poke.uid) }}
                onPointerLeave={() => setSobre(null)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setMenuAberto((atual) => (atual === poke.uid ? null : poke.uid))
                  }
                  // Setas movem sem arrastar: e o caminho de teclado pra
                  // reordenar, que ponteiro nenhum cobre.
                  if (e.key === 'ArrowUp' && indiceNaEquipe > 1) {
                    e.preventDefault()
                    controller.reorderTeam(indiceNaEquipe, indiceNaEquipe - 1)
                  }
                  if (e.key === 'ArrowDown' && indiceNaEquipe < team.length - 1) {
                    e.preventDefault()
                    controller.reorderTeam(indiceNaEquipe, indiceNaEquipe + 1)
                  }
                }}
              >
                <span
                  aria-hidden
                  className="w-[1em] shrink-0 text-center text-[.62em] text-n500"
                >
                  {indiceNaEquipe + 1}
                </span>

                <span className="relative inline-block shrink-0" style={{ width: `${tamanho}em`, height: `${tamanho}em` }}>
                  {url ? (
                    <img
                      src={url}
                      alt=""
                      className="h-full w-full rounded-[.4em] border-2 object-contain"
                      style={{ borderColor: rarityOf(poke).color }}
                    />
                  ) : (
                    <span
                      className="block h-full w-full rounded-[.4em] border-2"
                      style={{ background: especie.color, borderColor: rarityOf(poke).color }}
                    />
                  )}
                  {poke.isShiny && (
                    <span className="absolute -top-[.3em] -left-[.3em] text-[.6em] leading-none" aria-hidden>✨</span>
                  )}
                </span>

                <span className="flex flex-col leading-tight">
                  <span className="text-[.68em] text-n300">Nv {poke.level}</span>
                  {/* Barra de HP fina: e o dado que decide se vale trocar, e
                      ler "45/120" em 0.6em no celular nao funciona. */}
                  <span className="mt-[.15em] block h-[.22em] w-[2.6em] overflow-hidden rounded-full bg-n800">
                    <span
                      className={cn('block h-full rounded-full', hpPct <= 25 ? 'bg-hp-low' : 'bg-hp')}
                      style={{ width: `${hpPct}%` }}
                    />
                  </span>
                </span>
              </div>

              {/* Resumo de hover. Painel proprio em vez de `Explicacao`: aquele
                  componente tambem abre no TOQUE, e o toque aqui ja e o menu —
                  os dois no mesmo gatilho brigariam. */}
              {sobre === poke.uid && !arrasto && !coarse && (
                <div className="absolute top-0 left-full z-20 ml-[.35em] w-max rounded-[.5em] border border-n700 bg-background px-[.6em] py-[.4em] text-[.7em] shadow-xl">
                  <PokeTooltipContent poke={poke} species={especie} />
                </div>
              )}

              {menuAberto === poke.uid && (
                <div className="absolute top-0 left-full z-30 ml-[.35em] w-max rounded-[.5em] border border-n700 bg-background p-[.3em] shadow-xl">
                  {/* No toque nao houve hover nenhum, entao o resumo tem que
                      estar AQUI — senao o dado que decide a troca so existe
                      pra quem usa mouse. */}
                  {coarse && (
                    <div className="mb-[.3em] border-b border-n800 px-[.3em] pb-[.3em] text-[.7em]">
                      <PokeTooltipContent poke={poke} species={especie} />
                    </div>
                  )}
                  <button
                    type="button"
                    className="flex w-full items-center gap-[.4em] rounded-[.35em] px-[.5em] py-[.3em] text-left text-[.78em] hover:bg-n800"
                    onClick={() => { setMenuAberto(null); showProfile(poke, especie) }}
                  >
                    <IdentificationCard /> Perfil
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-[.4em] rounded-[.35em] px-[.5em] py-[.3em] text-left text-[.78em] hover:bg-n800"
                    onClick={() => { setMenuAberto(null); controller.setActiveTeamIndex(indiceNaEquipe) }}
                  >
                    <ArrowFatUp /> Colocar em campo
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
