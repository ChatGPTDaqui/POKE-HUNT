// Hospeda a janela de menu aberta (uma por vez) dentro do GameWindow
// compartilhado.
//
// Duas coisas do vanilla que NAO precisam ser portadas:
//  - `_scrollPositions`: la o painel inteiro era destruido e recriado a cada
//    clique de filtro (`refresh()` = `overlayRoot.innerHTML = ''`), entao a
//    posicao do scroll tinha que ser salva/restaurada a mao. Aqui o painel e um
//    componente montado — ele so re-renderiza, o node de scroll continua o
//    mesmo, e a posicao se mantem sozinha.
//  - O padrao de "DOM incremental" pra nao quebrar clique: o reconciler do
//    React ja resolve isso.
import { useUiStore, useDeviceMode, type ScreenName } from '@/stores/uiStore'
import { useGameStateStore, MAX_TEAM_SIZE } from '@/stores/gameStateStore'
import { GameWindow } from '@/components/game/GameWindow'
import { Sheet } from '@/components/game/Sheet'
import { TeamMenu } from '@/features/team/TeamMenu'
import { BagMenu } from '@/features/bag/BagMenu'
import { ShopMenu } from '@/features/shop/ShopMenu'
import { HuntMenu } from '@/features/hunt/HuntMenu'
import { PokedexMenu } from '@/features/pokedex/PokedexMenu'
import { WikiMenu } from '@/features/wiki/WikiMenu'
import { SettingsScreen } from '@/features/settings/SettingsScreen'
import { BestiarioMenu } from '@/features/bestiario/BestiarioMenu'
import { TasksMenu } from '@/features/tasks/TasksMenu'
import { CorreioMenu } from '@/features/correio/CorreioMenu'
import { CalculadoraMenu } from '@/features/calc/CalculadoraMenu'
import { MercadoMenu } from '@/features/mercado/MercadoMenu'
import { RankingMenu } from '@/features/ranking/RankingMenu'
import { TutoriaisMenu } from '@/features/tutorial/TutoriaisMenu'

const PANELS: Record<ScreenName, () => React.ReactElement | null> = {
  equipe: TeamMenu,
  mochila: BagMenu,
  loja: ShopMenu,
  hunts: HuntMenu,
  pokedex: PokedexMenu,
  wiki: WikiMenu,
  config: SettingsScreen,
  bestiario: BestiarioMenu,
  tasks: TasksMenu,
  correio: CorreioMenu,
  calc: CalculadoraMenu,
  mercado: MercadoMenu,
  ranking: RankingMenu,
  tutoriais: TutoriaisMenu,
}

const TITLES: Record<ScreenName, string> = {
  equipe: 'Equipe',
  mochila: 'Mochila',
  loja: 'Loja',
  hunts: 'Selecione um mapa',
  pokedex: 'Pokedex',
  wiki: 'Wiki',
  config: 'Configuracoes',
  bestiario: 'Bestiário',
  tasks: 'Tasks & Missões',
  correio: 'Correio',
  calc: 'Calculadora de Força',
  mercado: 'Mercado',
  ranking: 'Ranking',
  tutoriais: 'Repetir Tutoriais',
}

// Largura padrao por tela, em `em`. Nao e capricho: a aba Itens da Loja tem
// duas colunas com icone + nome + preco + quantidade + botao cada uma, e nos
// 36em do painel comum as colunas ficam apertadas em QUALQUER viewport (era o
// item 2 da auditoria). Bestiario tem grade + painel de detalhe lado a lado.
const DEFAULT_WIDTH = 36
const WIDTHS: Partial<Record<ScreenName, number>> = {
  loja: 52,
  bestiario: 56,
  calc: 46,
  correio: 40,
  // Linha de ranking: posicao + icone + nome + treinador + nivel + valor. Em
  // 36em o nome do POKE e o do treinador brigam pelo mesmo espaco truncado.
  ranking: 44,
}

export function ScreenOverlay() {
  const currentScreen = useUiStore((s) => s.currentScreen)
  const closeScreen = useUiStore((s) => s.closeScreen)
  const teamSize = useGameStateStore((s) => s.team.length)
  const { usaSheet } = useDeviceMode()

  if (!currentScreen) return null
  const Panel = PANELS[currentScreen]
  // A contagem da equipe entra no titulo (e nao no corpo) porque e a informacao
  // que decide se ainda cabe alguem — vale estar visivel mesmo com a lista
  // rolada pra baixo, e a barra de titulo e a unica faixa que nao rola.
  const title = currentScreen === 'equipe'
    ? `Equipe (${teamSize}/${MAX_TEAM_SIZE})`
    : TITLES[currentScreen]

  // No celular o painel e um bottom sheet; no amplo, a janela arrastavel de
  // sempre. A LARGURA em `em` so existe do lado da janela — num sheet ela nao
  // significa nada (ele ocupa a largura da tela), e era isso que fazia a Loja
  // (52em) nascer colada nas duas bordas.
  if (usaSheet) {
    return (
      <Sheet winKey="panel" zIndex={31} onClose={closeScreen} title={title}>
        <Panel />
      </Sheet>
    )
  }

  return (
    <GameWindow
      winKey="panel"
      widthEm={WIDTHS[currentScreen] ?? DEFAULT_WIDTH}
      zIndex={31}
      backdrop={{ zIndex: 30 }}
      onClose={closeScreen}
      title={title}
    >
      <Panel />
    </GameWindow>
  )
}
