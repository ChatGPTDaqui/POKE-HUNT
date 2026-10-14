// Doca da Jornada: oito destinos na ordem original, Hunt no centro geométrico.
// Grupos laterais têm a mesma largura; no mobile usam duas fileiras para manter
// alvos de toque. Paisagem preserva os nomes. Gestão recolhe apenas os controles
// visuais de combate — Auto e o motor continuam funcionando.
import { useRef, useState } from 'react'
import {
  Backpack, BookOpen, Books, Calculator, ChatsCircle, CheckSquare, DotsThreeOutline,
  FirstAid, Gear, GraduationCap, MagnifyingGlassMinus, MagnifyingGlassPlus,
  Robot, Scales, Sparkle, Storefront, Trophy, UsersThree, Warning, BookBookmark, type Icon,
  ArrowsLeftRight, Sword, Medal,
} from '@phosphor-icons/react'
import { useWorldStore } from '@/stores/worldStore'
import { useDiarioStore } from '@/stores/diarioStore'
import { useRendererStore } from '@/stores/rendererStore'
import { useUiStore, useDeviceMode, type ScreenName } from '@/stores/uiStore'
import {
  usePendenciasDoMercado, usePendenciasDoSocial, fraseDasPendencias,
} from '@/hooks/usePendencias'
import { useEstoqueBaixoNoAuto, LIMIAR_ESTOQUE_BAIXO } from '@/components/auto/estoqueBaixo'
import { NotificationBadge } from '@/components/game/NotificationBadge'
import { ANCORA, useAncoraDeVfx } from '@/hooks/useAncoraDeVfx'
import { AbilityHud } from '@/components/hud/AbilityHud'
import { StatusEffectsBar } from '@/components/hud/StatusEffectsBar'
import { Sheet } from '@/components/game/Sheet'
import { JourneyDestination } from '@/components/game/JourneyDestination'
import { EquipmentArt, type ArtKind } from '@/components/game/JourneyArtwork'
import { useMedirAltura } from '@/hooks/useMedirAltura'
import { useGestaoAberta } from '@/hooks/useGestaoAberta'
import { TELAS_NA_COLUNA } from '@/components/hud/ColunaDeAtalhos'
import { cn } from '@/lib/utils'
import { MarcaDeCadeado } from '@/features/primeirosPassos/MarcaDeCadeado'
import { avisarTrancado, useTrancas } from '@/features/primeirosPassos/useDesbloqueio'
import { useDestaqueDoPasso } from '@/features/primeirosPassos/useDestaqueDoPasso'

export interface Destino {
  /** Ausente nos slots que NAO abrem tela: Hospital (troca a cena) e Mais. */
  screen?: ScreenName
  label: string
  Icon: Icon
  /** Imagem que substitui o icone vetorial; o `Icon` continua sendo o fallback. */
  iconUrl?: string
  art?: ArtKind
}

// Os tres slots a esquerda do Hunt e os dois de tela a direita dele. Hospital
// e Mais nao entram aqui: nenhum dos dois e uma `ScreenName` (um troca a cena
// do canvas, o outro abre a grade).
type DestinoDeTela = Destino & { screen: ScreenName }

const ESQUERDA: DestinoDeTela[] = [
  { screen: 'equipe', label: 'Equipe', Icon: UsersThree, art: 'team' },
  { screen: 'mochila', label: 'Mochila', Icon: Backpack, art: 'bag' },
  { screen: 'pokedex', label: 'Pokédex', Icon: BookOpen, art: 'dex' },
]
const DIREITA: DestinoDeTela[] = [
  { screen: 'loja', label: 'Loja', Icon: Storefront, art: 'shop' },
  { screen: 'mercado', label: 'Mercado', Icon: Scales, art: 'market' },
]

// O que vive dentro de "Mais". Ordem por frequencia de uso real, nao
// alfabetica: Social abre varias vezes por sessao, Configuracoes uma vez por
// mes.
const SECUNDARIOS: DestinoDeTela[] = [
  // Icone de CHAT, nao de envelope (PH-436): a tela deixou de ser caixa de
  // carta em PH-81, e o envelope era a ultima peca dizendo o contrario.
  { screen: 'social', label: 'Social', Icon: ChatsCircle },
  { screen: 'troca', label: 'Troca', Icon: ArrowsLeftRight },
  { screen: 'ranking', label: 'Ranking', Icon: Trophy },
  { screen: 'conquistas', label: 'Conquistas', Icon: Medal },
  { screen: 'pvp', label: 'PvP', Icon: Sword },
  { screen: 'bestiario', label: 'Bestiário', Icon: BookBookmark },
  { screen: 'especialidades', label: 'Especialidades', Icon: Sparkle },
  { screen: 'tasks', label: 'Tasks', Icon: CheckSquare },
  { screen: 'calc', label: 'Calculadora', Icon: Calculator },
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
  const painelAberto = useGestaoAberta()

  return (
    <div className="pointer-events-auto flex flex-col items-center gap-[.35em]">
      {!painelAberto && <StatusEffectsBar />}

      {/* Linha de acao: zoom (so em hunt), golpes, Auto. Os tres na mesma
          fileira porque sao o que o jogador toca DURANTE a luta; a barra de
          navegacao embaixo e pra sair dela. */}
      {!painelAberto && <div className="flex w-full items-end justify-center gap-[.4em]">
        {emHunt && <ControleZoom />}
        <AbilityHud />
        <BotaoAuto />
      </div>}

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
  const pendenciasSocial = usePendenciasDoSocial()
  // Medida propria (ver `uiStore#navHeight`): deitado, o sheet para em cima
  // desta barra e nao do rodape inteiro.
  const navRef = useRef<HTMLElement>(null)
  useMedirAltura(navRef, useUiStore((s) => s.setNavHeight))

  const pendenciasEmMais = destinosDaGrade().reduce((soma, d) => (
    soma + (d.screen === 'mercado' ? pendenciasMercado : d.screen === 'social' ? pendenciasSocial.total : 0)
  ), 0)
  // PH-287: o "Mais" e o unico lugar onde o numero do Social aparece somado ao
  // do Mercado, entao a frase dele nao serve pro selo inteiro. Ela vai no rotulo
  // acessivel do item de Social dentro do sheet, que e onde o jogador chega
  // depois de tocar aqui.
  const detalheDoSocial = fraseDasPendencias(pendenciasSocial)

  // Hospital nao abre tela: ele TROCA a cena do canvas. Fora de uma hunt o
  // jogador ja esta la, entao o slot vira indicador de "voce esta aqui" e o
  // toque so fecha o que estiver aberto por cima — nao ha viagem a fazer.
  const emHunt = useWorldStore((s) => s.mapDef != null)
  const closeScreen = useUiStore((s) => s.closeScreen)
  // PH-263: dentro da hunt o toque MARCA a viagem em vez de fazer a viagem. A
  // contagem de 3s e a troca de cena moram em `ViagemAoHospitalOverlay` — o
  // cabecalho dela explica por que a saida deixou de ser instantanea.
  //
  // Segundo toque durante a contagem CANCELA. O mesmo botao serve de desfazer
  // porque ele e o unico lugar em que o jogador ja esta olhando quando percebe
  // que clicou sem querer; sem isso ele fica 3 segundos preso a uma saida que
  // nao pediu.
  const viagemMarcada = useUiStore((s) => s.viagemAoHospital != null)
  const tranca = useTrancas()
  const destaqueEquipe = useDestaqueDoPasso('equipe')
  const destaqueHunt = useDestaqueDoPasso('hunts')
  const iniciarViagem = useUiStore((s) => s.iniciarViagemAoHospital)
  const cancelarViagem = useUiStore((s) => s.cancelarViagemAoHospital)
  function irAoHospital() {
    closeScreen()
    setMoreOpen(false)
    if (!emHunt) return
    if (viagemMarcada) cancelarViagem()
    else iniciarViagem()
  }

  return (
    // `data-keep-open`: estes botoes ja alternam a tela sozinhos. Sem a marca, o
    // fechar-ao-tocar-fora do sheet fecharia a tela ANTES do onClick e o gesto
    // viraria "fecha e reabre".
    <nav
      ref={navRef}
      onClickCapture={() => useDiarioStore.getState().fecharPainel()}
      data-keep-open
      className={cn(
        'journey-navigation vidro w-full rounded-[1.15em]',
        deitado ? 'px-[.5em] py-[.2em]' : 'px-[.4em] py-[.3em]',
      )}
    >
      <div className="journey-navigation-left">{ESQUERDA.map((d) => (
        <SlotNav
          key={d.screen}
          destino={d}
          ativo={currentScreen === d.screen}
          rotulo
          destaque={d.screen === 'equipe' ? destaqueEquipe.classe : ''}
          onClick={() => { if (d.screen === 'equipe') destaqueEquipe.aoTocar(); toggleScreen(d.screen) }}
        />
      ))}</div>

      <SlotHunt
        ativo={currentScreen === 'hunts'}
        deitado={deitado}
        destaque={destaqueHunt.classe}
        onClick={() => { destaqueHunt.aoTocar(); toggleScreen('hunts') }}
      />

      <div className="journey-navigation-right"><SlotNav
        destino={DIREITA[0]}
        ativo={currentScreen === DIREITA[0].screen}
        rotulo
        onClick={() => toggleScreen(DIREITA[0].screen)}
      />

      {/* `ativo` durante a contagem tambem: o slot fica marcado desde o toque,
          e nao so quando a viagem termina — sem isso o unico sinal de que o
          comando pegou seria o overlay no meio do campo. */}
      <SlotNav
        destino={{ label: 'Hospital', Icon: FirstAid, art: 'hospital' }}
        ativo={!emHunt || viagemMarcada}
        rotulo
        onClick={irAoHospital}
      />

      <SlotNav
        destino={DIREITA[1]}
        ativo={currentScreen === DIREITA[1].screen}
        rotulo
        badge={pendenciasMercado}
        trancado={tranca(DIREITA[1].screen)}
        onClick={() => {
          const passo = tranca(DIREITA[1].screen)
          if (passo) avisarTrancado(passo)
          else toggleScreen(DIREITA[1].screen)
        }}
      />

      <SlotNav
        destino={{ label: 'Mais', Icon: DotsThreeOutline, art: 'guide' }}
        ativo={moreOpen}
        rotulo
        badge={pendenciasEmMais}
        // PH-287: o selo do "Mais" soma Social e Mercado, e o numero sozinho
        // nao diz de onde ele vem. Quando o que esta pendente e do Social, o
        // rotulo passa a dizer o que e — a diferenca entre "tem 2 coisas" e "tem
        // 1 mensagem por ler e 1 item por coletar".
        descricaoDoBadge={detalheDoSocial ?? undefined}
        onClick={() => setMoreOpen(!moreOpen)}
      /></div>
    </nav>
  )
}

function SlotNav({
  destino, ativo, rotulo, badge = 0, descricaoDoBadge, trancado, destaque, onClick,
}: {
  destino: Destino
  ativo: boolean
  rotulo: boolean
  badge?: number
  /** Passo que ainda tranca este menu (Primeiros Passos). */
  trancado?: string | null
  /** Classe do anel do passo atual, quando ele aponta pra este botão. */
  destaque?: string
  /**
   * O que o selo esta contando, em palavras (PH-287).
   *
   * Sem isto o rotulo acessivel e "2 pendência(s) em Mais", que e o numero
   * repetido. Com isto ele vira "1 mensagem por ler e 1 item por coletar" — a
   * diferenca entre o jogador saber que ainda falta PEGAR alguma coisa e ele
   * concluir que o sino travou (o relato que abriu a PH-213).
   */
  descricaoDoBadge?: string
  onClick: () => void
}) {
  const [imagemQuebrada, setImagemQuebrada] = useState(false)
  const { Icon, iconUrl, label, art } = destino
  // A Mochila e o destino dos itens que caem no chao (render/itemNoChao.ts).
  const botaoRef = useRef<HTMLButtonElement>(null)
  useAncoraDeVfx(destino.screen === 'mochila' ? ANCORA.mochila : null, botaoRef)
  return (
    <button
      ref={botaoRef}
      type="button"
      aria-label={label}
      aria-pressed={ativo}
      onClick={onClick}
      className={cn(
        'journey-nav-slot relative flex min-h-[44px] min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-[.15em]',
        'rounded-[.8em] px-[.1em] py-[.25em] font-[inherit] transition-colors',
        ativo ? 'bg-n800 text-foreground' : 'text-n400',
        trancado && 'opacity-55',
        destaque,
      )}
    >
      {trancado && <MarcaDeCadeado passoId={trancado} />}
      {art ? <EquipmentArt kind={art} className="journey-nav-art" /> : iconUrl && !imagemQuebrada ? (
        <img
          src={iconUrl}
          alt=""
          onError={() => setImagemQuebrada(true)}
          className="h-[1.25em] w-[1.25em] object-contain"
          style={{ imageRendering: 'pixelated' }}
        />
      ) : (
        <Icon className="journey-nav-symbol text-[1.25em]" weight="duotone" />
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
      <NotificationBadge
        count={badge}
        titulo={descricaoDoBadge
          ? `${label}: ${descricaoDoBadge}`
          : `${badge} pendência(s) em ${label}`}
      />
    </button>
  )
}

// Hunt e o unico slot com peso visual proprio: pilula clara, o acento do tema.
function SlotHunt({ ativo, deitado, destaque, onClick }: { ativo: boolean; deitado: boolean; destaque?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Hunt"
      data-journey-hunt
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
          destaque,
        )}
      >
        <EquipmentArt kind="map" className="journey-hunt-art" />
      </span>
      <span className="leading-none" style={{ fontSize: 'min(.68em, 2.6vw)' }}>Hunt</span>
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
  const pendenciasSocial = usePendenciasDoSocial()
  const destinos = destinosDaGrade()
  const tranca = useTrancas()

  if (!moreOpen) return null

  return (
    <Sheet appearance="journey" winKey="mais" snap="conteudo" zIndex={33} onClose={() => setMoreOpen(false)} title="Mais">
      <div className="journey-guide">
        <div className="journey-guide-intro"><EquipmentArt kind="guide" /><p>Seu guia de jornada<span>Encontre treinadores e consulte suas ferramentas.</span></p></div>
        {[
          { title: 'Encontrar outros treinadores', screens: ['social', 'troca', 'ranking'] },
          { title: 'Consultar e ajustar', screens: ['conquistas', 'bestiario', 'wiki', 'tutoriais', 'config'] },
        ].map((group) => <section key={group.title} aria-label={group.title}>
        <h3 className="journey-guide-heading">{group.title}</h3>
        <div className="journey-destinations">
        {/* Atalhos permanentes, incluindo Diário, ficam na coluna direita. */}
        {destinos.filter((d) => group.screens.includes(d.screen)).map(({ screen, label, Icon }) => (
          <JourneyDestination
            key={screen}
            label={label}
            Icon={Icon}
            description={DESCRICOES_DO_GUIA[screen]}
            badge={screen === 'social' ? pendenciasSocial.total : 0}
            // PH-287: aqui a frase e VISIVEL, nao so acessivel. Este sheet e a
            // tela em que o jogador chega procurando "o que e que esta aceso", e
            // ele tem espaco pra uma linha embaixo do rotulo — a doca, com oito
            // slots em 390px, nao tem.
            detalhe={screen === 'social' ? fraseDasPendencias(pendenciasSocial) : null}
            trancado={tranca(screen)}
            onClick={() => {
              const passo = tranca(screen)
              if (passo) return avisarTrancado(passo)
              toggleScreen(screen)
              setMoreOpen(false)
            }}
          />
        ))}
        </div></section>)}
      </div>
    </Sheet>
  )
}

const DESCRICOES_DO_GUIA: Partial<Record<ScreenName, string>> = {
  social: 'Amigos e mensagens', troca: 'Troque com outros treinadores', ranking: 'Acompanhe suas conquistas',
  bestiario: 'Encontros e descobertas', wiki: 'Conhecimento da jornada', tutoriais: 'Aprenda a jogar', config: 'Preferências do jogo',
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
  const destaque = useDestaqueDoPasso('auto')
  return (
    <button
      type="button"
      data-auto-toggle
      data-keep-open
      aria-label={estoqueBaixo
        ? `Automações — um consumível em uso está abaixo de ${LIMIAR_ESTOQUE_BAIXO}`
        : 'Automações'}
      aria-pressed={open}
      onClick={() => { destaque.aoTocar(); setOpen(!open) }}
      className={cn(
        destaque.classe,
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
