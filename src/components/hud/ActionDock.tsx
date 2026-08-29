// Doca de acao — a UNICA superficie permanente do rodape.
//
// Junta o que antes eram tres coisas soltas que se empurravam: a barra de
// golpes, o `MainMenu` (8 circulos que quebravam em duas fileiras em 390px) e o
// botao Auto flutuante, que tinha que MEDIR o rodape pra nao ficar por tras
// dele. Aqui os tres sao filhos do mesmo flex — nao ha o que medir.
//
// A navegacao e uma barra de 8 slots FIXOS, iguais nos tres regimes: Equipe,
// Mochila, Pokedex, Hunt, Loja, Hospital, Mercado, Mais. Nada entra ou sai por
// largura de tela — o jogador aprende a posicao uma vez e ela nao se mexe.
//
// Hunt tem peso proprio (pilula do acento, icone maior) por ser a acao que
// troca a CENA do jogo, e nao so a tela por cima dela. Hospital e a outra
// metade desse par: fora de uma hunt ele e o destino atual, e aparece marcado.
//
// **Hunt nao fica em cima do centro exato da barra, e nao da pra ficar.** Sao
// 7 destinos alem dele — numero impar — entao qualquer divisao deixa 3 de um
// lado e 4 do outro, e o centro do slot do meio cai meio slot (~21px em 390px)
// a esquerda do centro da barra. As unicas saidas exatas sao 6 ou 8 destinos
// alem do Hunt. A alternativa — grupos de larguras diferentes pra compensar —
// foi medida e rejeitada: em 390px joga os 4 slots da direita pra 38,7px, e em
// 320px pra 31px, abaixo do minimo de toque.
//
// Em 'deitado' os rotulos somem e tudo vira uma fileira so: com 390px de altura
// cada linha do rodape custa 13% do jogo visivel.
import { useRef, useState } from 'react'
import {
  Backpack, BookOpen, Books, Calculator, CheckSquare, DotsThreeOutline, Envelope,
  FirstAid, Gear, GraduationCap, MagnifyingGlassMinus, MagnifyingGlassPlus, MapTrifold,
  Robot, Scales, Sparkle, Storefront, Trophy, UsersThree, Warning, BookBookmark, type Icon,
} from '@phosphor-icons/react'
import { controller } from '@/engine/controller'
import { useWorldStore } from '@/stores/worldStore'
import { useRendererStore } from '@/stores/rendererStore'
import { useUiStore, useDeviceMode, type ScreenName } from '@/stores/uiStore'
import { usePendenciasDoMercado, usePendenciasDoCorreio } from '@/hooks/usePendencias'
import { useEstoqueBaixoNoAuto, LIMIAR_ESTOQUE_BAIXO } from '@/components/auto/estoqueBaixo'
import { NotificationBadge } from '@/components/game/NotificationBadge'
import { AbilityHud } from '@/components/hud/AbilityHud'
import { StatusEffectsBar } from '@/components/hud/StatusEffectsBar'
import { Sheet } from '@/components/game/Sheet'
import { useMedirAltura } from '@/hooks/useMedirAltura'
import { TELAS_NA_COLUNA } from '@/components/hud/ColunaDeAtalhos'
import { cn } from '@/lib/utils'

export interface Destino {
  /** Ausente nos slots que NAO abrem tela: Hospital (troca a cena) e Mais. */
  screen?: ScreenName
  label: string
  Icon: Icon
  /** Imagem que substitui o icone vetorial; o `Icon` continua sendo o fallback. */
  iconUrl?: string
}

// Os tres slots a esquerda do Hunt e os dois de tela a direita dele. Hospital
// e Mais nao entram aqui: nenhum dos dois e uma `ScreenName` (um troca a cena
// do canvas, o outro abre a grade).
type DestinoDeTela = Destino & { screen: ScreenName }

const ESQUERDA: DestinoDeTela[] = [
  { screen: 'equipe', label: 'Equipe', Icon: UsersThree, iconUrl: 'assets/ui-icons/equipe.png' },
  { screen: 'mochila', label: 'Mochila', Icon: Backpack },
  { screen: 'pokedex', label: 'Pokedex', Icon: BookOpen },
]
const DIREITA: DestinoDeTela[] = [
  { screen: 'loja', label: 'Loja', Icon: Storefront },
  { screen: 'mercado', label: 'Mercado', Icon: Scales },
]

// O que vive dentro de "Mais". Ordem por frequencia de uso real, nao
// alfabetica: Correio abre varias vezes por sessao, Configuracoes uma vez por
// mes.
const SECUNDARIOS: DestinoDeTela[] = [
  { screen: 'correio', label: 'Correio', Icon: Envelope },
  { screen: 'bestiario', label: 'Bestiário', Icon: BookBookmark },
  { screen: 'especialidades', label: 'Especialidades', Icon: Sparkle },
  { screen: 'tasks', label: 'Tasks', Icon: CheckSquare },
  { screen: 'calc', label: 'Calculadora', Icon: Calculator },
  { screen: 'ranking', label: 'Ranking', Icon: Trophy },
  { screen: 'wiki', label: 'Wiki', Icon: Books },
  { screen: 'tutoriais', label: 'Tutoriais', Icon: GraduationCap },
  { screen: 'config', label: 'Ajustes', Icon: Gear },
]

/**
 * O mesmo destino nunca pode estar na barra E na grade do "Mais": os dois
 * lugares somam badge de pendencia, entao a duplicata faz o jogador ler "2
 * pendencias" onde ha uma. Esta e a lista unica das telas que a barra ja cobre.
 */
export const TELAS_NA_BARRA: ReadonlySet<ScreenName> = new Set<ScreenName>(
  [...ESQUERDA, ...DIREITA].map((d) => d.screen),
)

/**
 * A mesma regra vale pra COLUNA DE ATALHOS do canto superior direito (PH-257):
 * Especialidades, Tasks e Bestiario tem lugar fixo na tela agora, e continuar
 * listando os tres aqui somaria badge duas vezes.
 *
 * Eles ficam em `SECUNDARIOS` de proposito, filtrados no fim em vez de
 * removidos: a lista continua sendo o inventario unico de "todo destino que nao
 * e slot da barra", e mover um deles de volta pro "Mais" e uma linha na coluna,
 * nao um destino que ninguem lembra que existia.
 */
export function destinosDaGrade(): DestinoDeTela[] {
  return SECUNDARIOS.filter(
    (d) => !TELAS_NA_BARRA.has(d.screen) && !TELAS_NA_COLUNA.some((c) => c.screen === d.screen),
  )
}

export function ActionDock() {
  const { mode } = useDeviceMode()
  const emHunt = useWorldStore((s) => s.mapDef != null)
  const deitado = mode === 'deitado'

  return (
    <div className="pointer-events-auto flex flex-col items-center gap-[.35em]">
      <StatusEffectsBar />

      {/* Linha de acao: zoom (so em hunt), golpes, Auto. Os tres na mesma
          fileira porque sao o que o jogador toca DURANTE a luta; a barra de
          navegacao embaixo e pra sair dela. */}
      <div className="flex w-full items-end justify-center gap-[.4em]">
        {emHunt && <ControleZoom />}
        <AbilityHud />
        <BotaoAuto />
      </div>

      <BarraNavegacao deitado={deitado} />
    </div>
  )
}

// --- barra de navegacao ------------------------------------------------------
function BarraNavegacao({ deitado }: { deitado: boolean }) {
  const currentScreen = useUiStore((s) => s.currentScreen)
  const toggleScreen = useUiStore((s) => s.toggleScreen)
  const moreOpen = useUiStore((s) => s.moreOpen)
  const setMoreOpen = useUiStore((s) => s.setMoreOpen)
  const pendenciasMercado = usePendenciasDoMercado()
  const pendenciasCorreio = usePendenciasDoCorreio()
  // Medida propria (ver `uiStore#navHeight`): deitado, o sheet para em cima
  // desta barra e nao do rodape inteiro.
  const navRef = useRef<HTMLElement>(null)
  useMedirAltura(navRef, useUiStore((s) => s.setNavHeight))

  const pendenciasEmMais = destinosDaGrade().reduce((soma, d) => (
    soma + (d.screen === 'mercado' ? pendenciasMercado : d.screen === 'correio' ? pendenciasCorreio : 0)
  ), 0)

  // Hospital nao abre tela: ele TROCA a cena do canvas. Fora de uma hunt o
  // jogador ja esta la, entao o slot vira indicador de "voce esta aqui" e o
  // toque so fecha o que estiver aberto por cima — nao ha viagem a fazer.
  const emHunt = useWorldStore((s) => s.mapDef != null)
  const closeScreen = useUiStore((s) => s.closeScreen)
  function irAoHospital() {
    closeScreen()
    setMoreOpen(false)
    if (emHunt) void controller.returnToHospital({ x: 0, y: 0 })
  }

  return (
    // `data-keep-open`: estes botoes ja alternam a tela sozinhos. Sem a marca, o
    // fechar-ao-tocar-fora do sheet fecharia a tela ANTES do onClick e o gesto
    // viraria "fecha e reabre".
    <nav
      ref={navRef}
      data-keep-open
      className={cn(
        'vidro flex w-full items-center justify-around gap-[.15em] rounded-[1.15em]',
        deitado ? 'px-[.5em] py-[.2em]' : 'px-[.4em] py-[.3em]',
      )}
    >
      {ESQUERDA.map((d) => (
        <SlotNav
          key={d.screen}
          destino={d}
          ativo={currentScreen === d.screen}
          rotulo={!deitado}
          onClick={() => toggleScreen(d.screen)}
        />
      ))}

      <SlotHunt
        ativo={currentScreen === 'hunts'}
        deitado={deitado}
        onClick={() => toggleScreen('hunts')}
      />

      <SlotNav
        destino={DIREITA[0]}
        ativo={currentScreen === DIREITA[0].screen}
        rotulo={!deitado}
        onClick={() => toggleScreen(DIREITA[0].screen)}
      />

      <SlotNav
        destino={{ label: 'Hospital', Icon: FirstAid }}
        ativo={!emHunt}
        rotulo={!deitado}
        onClick={irAoHospital}
      />

      <SlotNav
        destino={DIREITA[1]}
        ativo={currentScreen === DIREITA[1].screen}
        rotulo={!deitado}
        badge={pendenciasMercado}
        onClick={() => toggleScreen(DIREITA[1].screen)}
      />

      <SlotNav
        destino={{ label: 'Mais', Icon: DotsThreeOutline }}
        ativo={moreOpen}
        rotulo={!deitado}
        badge={pendenciasEmMais}
        onClick={() => setMoreOpen(!moreOpen)}
      />
    </nav>
  )
}

function SlotNav({
  destino, ativo, rotulo, badge = 0, onClick,
}: {
  destino: Destino
  ativo: boolean
  rotulo: boolean
  badge?: number
  onClick: () => void
}) {
  const [imagemQuebrada, setImagemQuebrada] = useState(false)
  const { Icon, iconUrl, label } = destino
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={ativo}
      onClick={onClick}
      className={cn(
        'relative flex min-h-[44px] min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-[.15em]',
        'rounded-[.8em] px-[.1em] py-[.25em] font-[inherit] transition-colors',
        ativo ? 'bg-n800 text-foreground' : 'text-n400',
      )}
    >
      {iconUrl && !imagemQuebrada ? (
        <img
          src={iconUrl}
          alt=""
          onError={() => setImagemQuebrada(true)}
          className="h-[1.25em] w-[1.25em] object-contain"
          style={{ imageRendering: 'pixelated' }}
        />
      ) : (
        <Icon className="text-[1.25em]" weight={ativo ? 'fill' : 'regular'} />
      )}
      {/* O rotulo NAO e enfeite no toque: sem hover nao existe `title`, e um
          icone sozinho e adivinhacao. Ele so sai em 'deitado', onde cada
          linha custa 13% da altura do jogo. */}
      {rotulo && (
        // `min()` e nao `.58em` seco: com 8 slots a largura util e 1/8 da barra,
        // e em 320px isso da 34px — "Hospital" e "Mercado" truncavam pra
        // "Hospit…". O rotulo passa a encolher junto com a tela. Medido: em
        // 320px nenhum dos oito trunca, em 390px o texto volta ao tamanho cheio.
        <span
          className="w-full truncate text-center leading-none tracking-[.01em]"
          style={{ fontSize: 'min(.58em, 2.3vw)' }}
        >
          {label}
        </span>
      )}
      <NotificationBadge count={badge} titulo={`${badge} pendência(s) em ${label}`} />
    </button>
  )
}

// Hunt e o unico slot com peso visual proprio: pilula clara, o acento do tema.
function SlotHunt({ ativo, deitado, onClick }: { ativo: boolean; deitado: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Hunt"
      aria-pressed={ativo}
      onClick={onClick}
      className={cn(
        'relative flex min-h-[44px] min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-[.15em]',
        'rounded-[.8em] px-[.1em] py-[.25em] font-[inherit] transition-colors',
        ativo ? 'text-foreground' : 'text-n300',
      )}
    >
      <span
        className={cn(
          'flex items-center justify-center rounded-full transition-colors',
          deitado ? 'h-[2.05em] w-[2.05em]' : 'h-[2.3em] w-[2.3em]',
          ativo ? 'bg-primary text-primary-foreground' : 'bg-n800 text-n100',
        )}
      >
        <MapTrifold className="text-[1.45em]" weight="fill" />
      </span>
      {!deitado && <span className="leading-none" style={{ fontSize: 'min(.58em, 2.3vw)' }}>Hunt</span>}
    </button>
  )
}

// --- "Mais" ------------------------------------------------------------------
/**
 * Grade do "Mais". Renderizada pelo `HudLayer`, IRMA da doca e nao filha dela:
 * um `absolute` resolve contra o ancestral posicionado mais proximo, e dentro
 * da doca (que e absoluta, ancorada embaixo, com largura de conteudo) o sheet
 * herdaria aquela caixa em vez da tela.
 */
export function SheetMais() {
  const moreOpen = useUiStore((s) => s.moreOpen)
  const toggleScreen = useUiStore((s) => s.toggleScreen)
  const setMoreOpen = useUiStore((s) => s.setMoreOpen)
  const pendenciasCorreio = usePendenciasDoCorreio()
  const destinos = destinosDaGrade()

  if (!moreOpen) return null

  return (
    <Sheet winKey="mais" snap="conteudo" zIndex={33} onClose={() => setMoreOpen(false)} title="Mais">
      <div className="grid grid-cols-4 gap-[.5em]">
        {destinos.map(({ screen, label, Icon }) => (
          <ItemGrade
            key={screen}
            label={label}
            Icon={Icon}
            badge={screen === 'correio' ? pendenciasCorreio : 0}
            onClick={() => {
              toggleScreen(screen)
              setMoreOpen(false)
            }}
          />
        ))}
      </div>
    </Sheet>
  )
}

function ItemGrade({
  label, Icon, badge = 0, onClick,
}: {
  label: string
  Icon: Icon
  badge?: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex cursor-pointer flex-col items-center justify-center gap-[.35em] rounded-[.9em]',
        'border border-n800 bg-n900/70 px-[.2em] py-[.75em] font-[inherit] text-n300 transition-colors',
        'hover:border-n600 hover:text-foreground',
      )}
    >
      <Icon className="text-[1.5em]" />
      <span className="text-[.7em] leading-none">{label}</span>
      <NotificationBadge count={badge} titulo={`${badge} pendência(s) em ${label}`} />
    </button>
  )
}

// --- zoom e auto -------------------------------------------------------------
// O zoom perdeu a pilula com porcentagem: o numero nao e acionavel e ocupava
// 2.6em permanentes ao lado dos golpes. Dois botoes, e o efeito e visivel no
// proprio mapa.
function ControleZoom() {
  const zoomStep = useRendererStore((s) => s.zoomStep)
  return (
    <div className="vidro flex shrink-0 flex-col overflow-hidden rounded-[.7em]">
      <BotaoZoom label="Aumentar zoom" onClick={() => zoomStep(1)}>
        <MagnifyingGlassPlus />
      </BotaoZoom>
      <BotaoZoom label="Diminuir zoom" onClick={() => zoomStep(-1)}>
        <MagnifyingGlassMinus />
      </BotaoZoom>
    </div>
  )
}

function BotaoZoom({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-[1.6em] w-[1.9em] cursor-pointer items-center justify-center text-[.9em] text-n300 active:bg-n800"
    >
      {children}
    </button>
  )
}

function BotaoAuto() {
  const open = useUiStore((s) => s.autoOpen)
  const setOpen = useUiStore((s) => s.setAutoOpen)
  // O alerta vive no BOTAO, e nao so dentro do painel: o painel fica fechado
  // quase o tempo todo, e um aviso de "as bolas estao acabando" que so aparece
  // depois de abrir chega tarde demais pra servir.
  const estoqueBaixo = useEstoqueBaixoNoAuto()
  return (
    <button
      type="button"
      data-auto-toggle
      data-keep-open
      aria-label={estoqueBaixo
        ? `Automações — um consumível em uso está abaixo de ${LIMIAR_ESTOQUE_BAIXO}`
        : 'Automações'}
      aria-pressed={open}
      onClick={() => setOpen(!open)}
      className={cn(
        'vidro alvo-toque flex shrink-0 cursor-pointer items-center justify-center gap-[.25em] rounded-[.7em] px-[.5em]',
        'font-[inherit] text-[.85em] transition-colors',
        open ? 'border-primary text-n100' : 'text-n300',
        estoqueBaixo && 'animate-pulse-alerta border-bad text-bad',
      )}
    >
      <Robot className="text-[1.2em]" weight={open ? 'fill' : 'regular'} />
      {estoqueBaixo && <Warning className="text-[.95em]" weight="fill" />}
    </button>
  )
}
