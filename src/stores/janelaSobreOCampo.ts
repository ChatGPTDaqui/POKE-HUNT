// "Ha alguma janela do jogo aberta por cima do campo agora?" (PH-395/PH-396)
//
// POR QUE ISTO EXISTE COMO UM LUGAR SO
//
// Pedido explicito do usuario: splash nao pode sobrepor janela aberta por menu
// ou conteudo do jogo. Sao DOIS splashes (chegada em sala nova e level-up) e
// CINCO fontes de "janela aberta", espalhadas por tres stores diferentes. Cada
// splash respondendo essa pergunta por conta propria significaria duas listas
// pra manter em sincronia — e a proxima janela do jogo entraria em uma e nao na
// outra, sem erro nenhum aparecendo.
//
// E o mesmo raciocinio de `salaNoTrilho` (dois componentes que precisam
// concordar) e de `ehAlvoPrioritario` (a regra de prioridade que o lure copiou
// olhando so metade dela, e virou o bug PH-394).
//
// O QUE ENTRA, E POR QUE CADA UM
//
//  - `currentScreen`: as telas do menu (Equipe, Mochila, Pokedex, Loja, ...).
//  - `perfilOpen` / `perfilPublicoAlvo`: o perfil do treinador e o de outro
//    jogador. Nao sao `ScreenName` porque nao vivem no menu, mas cobrem a tela
//    igual.
//  - `analyzerOpen`: o Hunt Analyzer, mesma familia.
//  - perfil de POKE (`pokeProfileStore`): abre por cima de qualquer tela.
//  - tutorial: janela modal com passos, e o unico caso em que o jogador esta
//    LENDO — e onde um splash por cima custa mais.
//
// O QUE NAO ENTRA, de proposito: os avisos do proprio campo (contagem de sala,
// revive, derrota, intro do Lance). Eles nao sao "janela do jogo", sao a mesma
// camada do splash — e a decisao de quem cede a vez ali e por z-index, nao por
// supressao.
import { useUiStore } from './uiStore'
import { usePokeProfileStore } from './pokeProfileStore'
import { useTutorialStore } from './tutorialStore'

/**
 * Hook. Tres `useStore` em vez de um seletor combinado porque as tres stores
 * sao independentes — e cada `useX` ja devolve booleano, entao o componente so
 * re-renderiza quando a RESPOSTA muda, e nao a cada mexida em qualquer uma
 * delas.
 */
export function useJanelaSobreOCampo(): boolean {
  const telaOuPerfil = useUiStore(
    (s) => s.currentScreen != null || s.perfilOpen || s.perfilPublicoAlvo != null || s.analyzerOpen,
  )
  const perfilDePoke = usePokeProfileStore((s) => s.open != null)
  const tutorial = useTutorialStore((s) => s.aberto != null)
  return telaOuPerfil || perfilDePoke || tutorial
}
