// Menu principal: circulos sem contêiner retangular em volta, sempre
// centralizados no rodape. E o elemento fixo da interface — todo o resto
// (chat, Auto, barra de golpes) se posiciona em volta dele.
//
// Hospital NAO abre uma tela: ele TROCA A CENA do canvas de volta pro
// Hospital, e por isso e um botao de acao no meio dos de tela. So aparece
// dentro de uma hunt — no Hospital ele nao faria nada, e um botao que nao faz
// nada e pior que a ausencia dele.
//
// "Mais" fica FORA da fileira, a direita, e abre um popover com o que nao
// merece um circulo permanente (Wiki, Config).
import { useEffect, useRef, useState } from 'react'
import {
  Backpack, BookOpen, DotsThree, FirstAid, Gear, GraduationCap, MapTrifold, Scales,
  Storefront, Trophy, UsersThree, Books, type Icon,
} from '@phosphor-icons/react'
import { controller } from '@/engine/controller'
import { useWorldStore } from '@/stores/worldStore'
import { useUiStore, useBreakpoints, type ScreenName } from '@/stores/uiStore'
import { cn } from '@/lib/utils'

interface MenuEntry {
  screen: ScreenName
  label: string
  Icon: Icon
  /**
   * Imagem que SUBSTITUI o icone vetorial. Pedido explicito do usuario pra
   * Equipe (o item_0004 do pack de icones do Scarlet/Violet, copiado pra
   * assets/ui-icons/equipe.png). `Icon` continua obrigatorio de proposito: e
   * o fallback se a imagem nao carregar — um botao sem icone nenhum nao diz
   * o que faz.
   */
  iconUrl?: string
  big?: boolean
}

// Ordem fixa. Hunt e o circulo grande do centro: e a acao que o jogador repete
// mais, e a unica que muda a cena do jogo.
const MAIN_MENUS: MenuEntry[] = [
  { screen: 'equipe', label: 'Equipe', Icon: UsersThree, iconUrl: 'assets/ui-icons/equipe.png' },
  { screen: 'mochila', label: 'Mochila', Icon: Backpack },
  { screen: 'pokedex', label: 'Pokedex', Icon: BookOpen },
  { screen: 'hunts', label: 'Hunt', Icon: MapTrifold, big: true },
  { screen: 'loja', label: 'Loja', Icon: Storefront },
  { screen: 'mercado', label: 'Mercado', Icon: Scales },
]

const MORE_MENUS: { screen: ScreenName; label: string; Icon: Icon }[] = [
  { screen: 'ranking', label: 'Ranking', Icon: Trophy },
  { screen: 'tutoriais', label: 'Repetir Tutoriais', Icon: GraduationCap },
  { screen: 'wiki', label: 'Wiki', Icon: Books },
  { screen: 'config', label: 'Configurações', Icon: Gear },
]

export function MainMenu() {
  const currentScreen = useUiStore((s) => s.currentScreen)
  const toggleScreen = useUiStore((s) => s.toggleScreen)
  const closeScreen = useUiStore((s) => s.closeScreen)
  const moreOpen = useUiStore((s) => s.moreOpen)
  const setMoreOpen = useUiStore((s) => s.setMoreOpen)
  const emHunt = useWorldStore((w) => w.mapDef != null)
  const { narrow } = useBreakpoints()

  const showLabels = !narrow
  // Hospital entra depois da Loja (mesma posicao do menu antigo) e some fora de
  // uma hunt.
  const entries = emHunt
    ? [...MAIN_MENUS.slice(0, 5), null, ...MAIN_MENUS.slice(5)]
    : MAIN_MENUS

  return (
    // `data-keep-open`: o fechar-ao-clicar-fora das janelas ignora cliques
    // aqui, porque estes botoes ja alternam a tela sozinhos — sem a marca,
    // clicar no botao da tela ABERTA fecharia (pelo listener) e reabriria
    // (pelo onClick) no mesmo gesto.
    <nav
      data-keep-open
      className={cn(
        'pointer-events-auto relative flex max-w-[92vw] flex-wrap items-end justify-center',
        narrow ? 'gap-x-[.45em] gap-y-[.4em]' : 'gap-x-[.5em] gap-y-[.5em]',
      )}
    >
      {entries.map((entry) =>
        entry == null ? (
          <MenuSlot
            key="hospital"
            label="Hospital"
            showLabel={showLabels}
            compact={narrow}
            active={false}
            Icon={FirstAid}
            onClick={() => {
              void controller.returnToHospital({ x: 0, y: 0 })
              closeScreen()
            }}
          />
        ) : (
          <MenuSlot
            key={entry.screen}
            label={entry.label}
            showLabel={showLabels}
            compact={narrow}
            big={entry.big}
            active={currentScreen === entry.screen}
            Icon={entry.Icon}
            iconUrl={entry.iconUrl}
            onClick={() => toggleScreen(entry.screen)}
          />
        ),
      )}

      <MoreMenu open={moreOpen} setOpen={setMoreOpen} showLabel={showLabels} compact={narrow} />
    </nav>
  )
}

function MenuSlot({
  label, Icon, iconUrl, active, big, showLabel, compact, onClick,
}: {
  label: string
  Icon: Icon
  iconUrl?: string
  active: boolean
  big?: boolean
  showLabel: boolean
  compact?: boolean
  onClick: () => void
}) {
  // Se a imagem falhar (arquivo movido/404), cai no icone vetorial em vez de
  // deixar um circulo vazio.
  const [imagemQuebrada, setImagemQuebrada] = useState(false)
  // Em mobile (compact) os circulos encolhem pra caber numa fileira so — sem
  // isso, 7 slots quebram em tres fileiras e o rodape fica alto demais, empurrando
  // chat/Auto pra cima e comendo o campo de batalha.
  const size = big
    ? (compact ? 'h-[3.2em] w-[3.2em]' : 'h-[3.9em] w-[3.9em]')
    : (compact ? 'h-[2.6em] w-[2.6em]' : 'h-[3.1em] w-[3.1em]')
  const iconSize = big
    ? (compact ? 'text-[1.45em]' : 'text-[1.7em]')
    : (compact ? 'text-[1.15em]' : 'text-[1.3em]')
  return (
    <div className="flex flex-col items-center gap-[.25em]">
      <button
        type="button"
        title={label}
        onClick={onClick}
        className={cn(
          'flex cursor-pointer items-center justify-center rounded-full border transition-[transform,border-color,background-color] duration-100',
          'hover:-translate-y-[3px] hover:border-primary',
          'focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none',
          size,
          active
            ? 'border-foreground bg-foreground text-[#0b0b0d]'
            : 'border-n700 bg-n900 text-n200',
        )}
      >
        {iconUrl && !imagemQuebrada ? (
          <img
            src={iconUrl}
            alt=""
            onError={() => setImagemQuebrada(true)}
            // `object-contain` (nao cover): o icone do pack tem margem propria
            // e cortar as bordas comeria a borda do desenho. A caixa e um
            // pouco menor que o circulo pra sobrar respiro.
            className={cn('object-contain', big ? 'h-[62%] w-[62%]' : 'h-[58%] w-[58%]')}
            style={{ imageRendering: 'pixelated' }}
          />
        ) : (
          <Icon className={iconSize} />
        )}
      </button>
      {showLabel && (
        // `text-shadow` porque o rotulo fica direto sobre o canvas, sem
        // superficie por tras — sem contorno ele some num fundo claro do mapa.
        <span
          className={cn(
            'text-[.82em] font-bold tracking-[.02em] whitespace-nowrap',
            active ? 'text-foreground' : 'text-n300',
          )}
          style={{ textShadow: '0 1px 3px rgba(0,0,0,.7)' }}
        >
          {label}
        </span>
      )}
    </div>
  )
}

function MoreMenu({
  open, setOpen, showLabel, compact,
}: {
  open: boolean
  setOpen: (open: boolean) => void
  showLabel: boolean
  compact?: boolean
}) {
  const toggleScreen = useUiStore((s) => s.toggleScreen)
  const ref = useRef<HTMLDivElement>(null)

  // Fecha ao clicar fora. O listener e registrado no proximo tick pra que o
  // mesmo clique que abriu (borbulhando do botao) nao o feche na hora.
  useEffect(() => {
    if (!open) return
    let armado = false
    const timer = setTimeout(() => {
      armado = true
    }, 0)
    function onDown(e: MouseEvent) {
      if (!armado) return
      if (ref.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown, true)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', onDown, true)
    }
  }, [open, setOpen])

  return (
    <div ref={ref} className="relative flex flex-col items-center gap-[.25em]">
      <button
        type="button"
        title="Exibir mais menus"
        onClick={() => setOpen(!open)}
        className={cn(
          'flex cursor-pointer items-center justify-center rounded-full border border-dashed transition-colors',
          'focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none',
          compact ? 'h-[2.6em] w-[2.6em]' : 'h-[3.1em] w-[3.1em]',
          open ? 'border-primary text-n200' : 'border-n600 text-n300 hover:border-primary hover:text-n200',
        )}
      >
        <DotsThree className={compact ? 'text-[1.15em]' : 'text-[1.3em]'} />
      </button>
      {showLabel && (
        <span
          className="text-[.82em] font-bold tracking-[.02em] text-n400"
          style={{ textShadow: '0 1px 3px rgba(0,0,0,.7)' }}
        >
          Mais
        </span>
      )}

      {open && (
        <div className="absolute right-0 bottom-[calc(100%+.6em)] z-[41] flex min-w-[11em] flex-col gap-[.15em] rounded-lg border border-n700 bg-background/95 p-[.4em] shadow-2xl backdrop-blur-md">
          {MORE_MENUS.map(({ screen, label, Icon }) => (
            <button
              key={screen}
              type="button"
              onClick={() => {
                toggleScreen(screen)
                setOpen(false)
              }}
              className="flex cursor-pointer items-center gap-[.55em] rounded-[.4em] px-[.55em] py-[.5em] text-left font-[inherit] text-[.85em] text-foreground hover:bg-n800"
            >
              <Icon className="text-[1.15em] text-n300" />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
