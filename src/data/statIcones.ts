// Identidade visual de cada ESTAGIO de atributo (PH-121).
//
// O selo do HUD usava `statusVfxUrl(tipo do POKE, direcao)`: a arte variava com
// o TIPO do POKE e com subir/descer, e NAO com o atributo. Ataque caindo e
// Velocidade caindo desenhavam exatamente a mesma coisa, e o unico
// diferenciador era o `−1`/`+1` no canto e o `title` — que no celular nem
// existe. Pedido do usuario, com captura: "os icones escolhidos nao estao
// conseguindo a representatividade visual adequada".
//
// POR QUE ICONE DE CODIGO E NAO SPRITE
// -----------------------------------
// Seriam 6 atributos x 2 direcoes = 12 recortes a garimpar no acervo, e a
// propria issue diz que e essa familia de arte que nao representa. Phosphor ja
// e o conjunto de icones DO APP (36 arquivos; ver
// docs/12-decisoes-descartadas.md#unificar-as-duas-bibliotecas-de-icone), entao
// isto reusa vocabulario existente em vez de inventar um segundo. De brinde:
// escala em qualquer DPI, nao entra nos ~270MB de `assets/`, e nao depende de
// pipeline de corte.
//
// A DIRECAO NAO MORA AQUI de proposito. Ela ja e comunicada por dois canais no
// selo (borda verde/vermelha e o `+N`/`−N`), e duplicar no icone gastaria a
// unica coisa que o icone tem pra dizer: QUAL atributo.
import type { Icon } from '@phosphor-icons/react'
import {
  Sword, Sparkle, Shield, ShieldStar, Wind, Crosshair, Ghost,
} from '@phosphor-icons/react'
import type { StatDeEstagio } from './statusEffects'

export const ICONE_DE_ESTAGIO: Record<StatDeEstagio, Icon> = {
  atkFis: Sword,
  // Ataque especial e ataque, mas nao com o corpo — mesma familia de "brilho"
  // que o jogo ja usa pra shiny e pra efeito especial.
  atkEsp: Sparkle,
  def: Shield,
  // Def. Esp. e escudo TAMBEM, entao precisa da variante marcada: dois escudos
  // identicos seriam o mesmo defeito que este arquivo existe pra consertar.
  defEsp: ShieldStar,
  speed: Wind,
  accuracy: Crosshair,
  // Evasao e o oposto de mira: ficar dificil de acertar.
  evasion: Ghost,
}
