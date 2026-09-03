// A FAIXA do campo de batalha: o retangulo entre o trilho de status e o rodape,
// em CSS pronto pra um `style`.
//
// POR QUE ELA EXISTE, E POR QUE FORA DE `CampoOverlay`
// -----------------------------------------------------------------------------
// A medida nasceu dentro de `modals/CampoOverlay.tsx`, de um pedido explicito do
// dono: "os avisos que aparecem na tela (como a contagem de 5 segundos do
// revive) nao devem cobrir os menus inferiores de forma alguma; restrinja a
// renderizacao desses overlays estritamente a area do background".
//
// Na PH-482 a cutscene de area passou a viver na MESMA faixa, e ai a conta
// ganhou dois consumidores. Copiar os calculos daria duas verdades: o dia em que
// o rodape mudar de altura, uma das duas para de acompanhar — e o defeito ("o
// aviso cobre o menu de novo") nao quebra teste nenhum sozinho.
//
// Arquivo proprio, e nao um segundo export em `CampoOverlay.tsx`, porque o lint
// do projeto reprova modulo de componente que exporta nao-componente
// (`react(only-export-components)`, que existe pro fast refresh funcionar).
//
// O LIMITE DE BAIXO E MEDIDO (`uiStore.footerHeight`, alimentado por um
// ResizeObserver no HudLayer), nao um `em` chutado: a altura do rodape muda com
// a largura da tela (o menu quebra em mais fileiras) E com o `hudScale` —
// qualquer constante erra em algum dos dois eixos. Mesma decisao ja tomada pelo
// chat e pelo botao Auto.
import { useUiStore } from '@/stores/uiStore'

// Folga acima da barra de golpes/doca.
const FOLGA_INFERIOR_EM = 0.8
// Abaixo do trilho de status. Era 7.5em, medida da "fileira de cards do topo"
// (POKE ativo + treinador + bloco central) que nao existe mais: o trilho tem
// ~3.7em com a folga. Os 3.8em a mais eram faixa morta no topo do aviso.
const TOPO_EM = 4.4

export interface FaixaDoCampo {
  top: string
  bottom: string
  marginLeft: string
  marginRight: string
}

export function useFaixaDoCampo(): FaixaDoCampo {
  const footerHeight = useUiStore((s) => s.footerHeight)
  // Enquanto a medida nao chega (primeiro paint), um valor conservador que
  // cobre o pior caso comum de rodape.
  //
  // `--sa-*` entra na conta porque quem usa esta faixa e `fixed` — fora da
  // `.hud-safe`, entao os recortes do aparelho (home indicator, notch) sao dele
  // pra resolver. Sem isso o aviso encostava na doca por baixo num iPhone, que e
  // exatamente o que ele existe pra nao fazer.
  return {
    top: `calc(${TOPO_EM}em + var(--sa-top, 0px))`,
    bottom: footerHeight
      ? `calc(${footerHeight}px + ${FOLGA_INFERIOR_EM}em + var(--sa-bottom, 0px))`
      : `calc(11em + var(--sa-bottom, 0px))`,
    marginLeft: 'var(--sa-left, 0px)',
    marginRight: 'var(--sa-right, 0px)',
  }
}
