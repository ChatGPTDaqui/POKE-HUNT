// ESC fecha a camada do TOPO, e so ela (PH-376).
//
// Uma varredura por `'Escape'` em `src/` devolvia UM arquivo antes disto
// (`features/correio/RecebimentoDePoke.tsx`). Loja, Mochila, Bestiario, perfil
// do POKE, Hunt Analyzer, painel Auto e o proprio `ConfirmDialog` so fechavam
// no X ou no clique fora. No celular o botao Voltar cobre esse caso
// (`useVoltarFechaPainel`); no desktop — o regime `amplo` inteiro — nao havia
// equivalente nenhum.
//
// POR QUE UM REGISTRO GLOBAL, E NAO UM LISTENER POR PAINEL: com um
// `keydown` por componente, um ESC com o perfil do POKE aberto POR CIMA da Loja
// fecharia os dois no mesmo evento — todos os listeners recebem a mesma tecla, e
// nenhum deles sabe que existe outro. E o mesmo modo de falha que o
// `useVoltarFechaPainel` ja documenta pro botao Voltar do celular ("dono unico",
// por causa do `popstate` atrasado), resolvido aqui pelo mesmo caminho: uma
// pilha, um dono.
//
// A PRIORIDADE E O `zIndex`, e nao um numero novo. A ordem de empilhamento ja e
// a verdade sobre quem esta por cima de quem (ver o mapa de camadas no topo de
// `features/game/HudLayer.tsx`): painel 31, sheet sobre painel 33, Auto 40,
// perfil do POKE 45, relatorio offline 50, confirmacao 60. Inventar uma segunda
// escala daria duas listas pra manter de acordo, e nenhum erro no dia em que
// elas divergissem.
import { useEffect } from 'react'

interface Camada {
  prioridade: number
  fechar: () => void
  /** Desempate entre camadas de mesma prioridade: a que montou depois ganha. */
  ordem: number
}

const camadas: Camada[] = []
let proximaOrdem = 1
let ouvindo = false

/** A camada de cima: maior `zIndex`, e entre iguais a que montou por ultimo. */
function camadaDoTopo(): Camada | undefined {
  let topo: Camada | undefined
  for (const camada of camadas) {
    if (!topo) { topo = camada; continue }
    if (camada.prioridade > topo.prioridade) topo = camada
    else if (camada.prioridade === topo.prioridade && camada.ordem > topo.ordem) topo = camada
  }
  return topo
}

function aoTeclar(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  // `defaultPrevented`: quem tratou o ESC antes (um combobox nativo abrindo e
  // fechando, por exemplo) ja resolveu o gesto — fechar o painel por cima disso
  // tiraria da tela o que o jogador estava editando.
  if (event.defaultPrevented) return
  const topo = camadaDoTopo()
  if (!topo) return
  event.preventDefault()
  topo.fechar()
}

function garantirListener(): void {
  if (ouvindo) return
  document.addEventListener('keydown', aoTeclar)
  ouvindo = true
}

function soltarListener(): void {
  if (!ouvindo || camadas.length > 0) return
  document.removeEventListener('keydown', aoTeclar)
  ouvindo = false
}

/**
 * Registra esta camada na pilha do ESC enquanto ela estiver montada.
 *
 * `prioridade` e o `zIndex` da camada. `ativo` existe pro chamador que renderiza
 * sempre e so as vezes esta aberto — passar `false` tira da pilha sem
 * desmontar.
 */
export function useFecharComEsc(fechar: () => void, prioridade: number, ativo = true): void {
  useEffect(() => {
    if (!ativo) return
    const camada: Camada = { prioridade, fechar, ordem: proximaOrdem++ }
    camadas.push(camada)
    garantirListener()
    return () => {
      const i = camadas.indexOf(camada)
      if (i >= 0) camadas.splice(i, 1)
      soltarListener()
    }
    // `fechar` entra nas dependencias de proposito: os call sites passam
    // `onClose` vindo de prop, e uma referencia velha fecharia o painel errado
    // depois de uma troca de tela.
  }, [fechar, prioridade, ativo])
}

/** So pro teste: a pilha nao vaza entre casos. */
export function _limparCamadasDoEsc(): void {
  camadas.length = 0
  soltarListener()
}
