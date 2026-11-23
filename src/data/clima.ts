// Aparência e efeitos de cada clima: nome, símbolo, cor e TUDO o que ele muda
// no combate. Saiu de components/hud/ClimaChip.tsx para um módulo de dados
// puro porque o site (site/, Wiki) também lê esta tabela no build, e o HUD
// puxava store e React junto.
import { TEXTO_DE_RITMO_CONTINUO } from './textoDeEstagioEPrazo'
import type { ClimaTipo } from '@/engine/types'

export interface Aparencia {
  nome: string
  /** Emoji em vez de icone da Phosphor: clima e a unica coisa do HUD em que a
   *  forma exata (gota, floco, sol) importa mais que a consistencia do traco. */
  simbolo: string
  /** Classe de cor do texto. Casa com o filtro que o canvas aplica. */
  cor: string
  /**
   * TUDO o que este clima muda no combate, uma linha por efeito (PH-267).
   *
   * Era uma frase so, no `title` nativo do HTML. Duas coisas estavam erradas
   * ali: o `title` e hover puro (dedo nao faz hover, e o atraso de ~1s do
   * navegador esconde a informacao de quem passa o mouse rapido — e a
   * observacao da PH-165, "o clima usa o pior dos tres padroes de explicacao do
   * jogo"), e a frase cobria so o efeito principal. O granizo, por exemplo, nao
   * dizia que o Blizzard nunca erra debaixo dele.
   *
   * CADA LINHA AQUI SAI DO MOTOR, e o comentario diz de onde. Texto de efeito
   * que o jogo nao aplica e pior que texto nenhum: o jogador planeja a luta em
   * cima dele.
   */
  efeitos: string[]
}

// Fonte de cada numero abaixo, pra conferencia:
//   combatSystem.ts#CLIMA_MULTIPLICADOR_FAVORECIDO      1.5   (Agua na chuva, Fogo no sol)
//   combatSystem.ts#CLIMA_MULTIPLICADOR_DESFAVORECIDO   0.5   (o tipo oposto)
//   combatSystem.ts#NEVE_DEFESA_GELO                    1.5   (so contra golpe FISICO)
//   combatSystem.ts#NEVOA_PRECISAO                      0.6
//   combatSystem.ts#SOLAR_BEAM_SOB_CLIMA_RUIM           0.5   (todo clima que nao e sol)
//   statusSystem.ts#danoDeClimaPorTurno                 1/16 do HP maximo, minimo 1
//   abilities.ts#GOLPE_NUNCA_ERRA_NO_CLIMA / PRECISAO_DO_GOLPE_NO_CLIMA
export const APARENCIA: Record<ClimaTipo, Aparencia> = {
  chuva: {
    nome: 'Chuva', simbolo: '🌧️', cor: 'text-[#8fc4e8]',
    efeitos: [
      'Golpes de Água causam +50% de dano.',
      'Golpes de Fogo causam −50%.',
      'Thunder e Hurricane nunca erram.',
      'Solar Beam cai pela metade.',
    ],
  },
  sol: {
    nome: 'Sol forte', simbolo: '☀️', cor: 'text-[#ffc861]',
    efeitos: [
      'Golpes de Fogo causam +50% de dano.',
      'Golpes de Água causam −50%.',
      'Thunder e Hurricane caem para 50% de precisão.',
    ],
  },
  granizo: {
    nome: 'Granizo', simbolo: '🧊', cor: 'text-[#a8e4f2]',
    efeitos: [
      `Tira 1/16 do HP ${TEXTO_DE_RITMO_CONTINUO} de quem não é do tipo Gelo.`,
      'Blizzard nunca erra.',
      'Solar Beam cai pela metade.',
    ],
  },
  neve: {
    nome: 'Neve', simbolo: '❄️', cor: 'text-[#d7ecff]',
    efeitos: [
      'Não tira HP de ninguém — quem faz isso é o granizo.',
      'POKE do tipo Gelo recebe +50% de Defesa contra golpe físico.',
      'Blizzard nunca erra.',
      'Solar Beam cai pela metade.',
    ],
  },
  areia: {
    nome: 'Tempestade de areia', simbolo: '🌪️', cor: 'text-[#e0c286]',
    efeitos: [
      `Tira 1/16 do HP ${TEXTO_DE_RITMO_CONTINUO} de quem não é Pedra, Terra ou Aço.`,
      'Solar Beam cai pela metade.',
    ],
  },
  nevoa: {
    nome: 'Neblina', simbolo: '🌫️', cor: 'text-[#c3ccd4]',
    efeitos: [
      'A precisão de todos os golpes cai para 60% do normal.',
      'Solar Beam cai pela metade.',
    ],
  },
}
