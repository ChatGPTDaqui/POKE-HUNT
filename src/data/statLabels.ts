// Rotulo curto de cada atributo, num lugar so.
//
// Existia espalhado como literal em cada tela que lista status (perfil,
// calculadora, aviso de level-up). Centralizado aqui pra o aviso de level-up
// e o perfil nunca chamarem o mesmo atributo por nomes diferentes.
import type { StatBlock } from './pokes'
import type { StatDeEstagio } from './statusEffects'

export const STAT_LABEL: Record<keyof StatBlock, string> = {
  hp: 'HP',
  atkFis: 'Atk Fís',
  atkEsp: 'Atk Esp',
  def: 'Def',
  defEsp: 'Def Esp',
  speed: 'Vel',
}

export const STAT_ORDER: (keyof StatBlock)[] = ['hp', 'atkFis', 'atkEsp', 'def', 'defEsp', 'speed']

/**
 * "+3 HP, +2 Atk Fís, +1 Vel" — so os atributos que realmente subiram.
 *
 * Devolve string vazia quando nada mudou: em nivel alto de uma curva lenta um
 * level-up pode nao mover atributo nenhum (a formula do Gen2 e inteira e
 * arredonda pra baixo), e escrever "ganhou: " sem nada depois pareceria bug.
 */
export function formatStatGains(gains: StatBlock | null | undefined): string {
  if (!gains) return ''
  return STAT_ORDER
    .filter((key) => (gains[key] ?? 0) > 0)
    .map((key) => `+${gains[key]} ${STAT_LABEL[key]}`)
    .join(', ')
}

/**
 * Nome legivel das 6 curvas de EXP. Existia so como a chave crua
 * (`MEDIUM_SLOW`) nas telas que mostravam a curva — que nao diz nada a quem
 * nao conhece o dado, e ainda por cima em ingles no meio de uma tela em
 * portugues.
 *
 * A ordem do texto entre parenteses e o que o jogador realmente usa: quanto
 * mais lenta a curva, mais EXP o POKE precisa por nivel.
 */
export const GROWTH_LABEL: Record<string, string> = {
  ERRATIC: 'Erratica',
  FAST: 'Rapida',
  MEDIUM_FAST: 'Media-rapida',
  MEDIUM_SLOW: 'Media-lenta',
  SLOW: 'Lenta',
  FLUCTUATING: 'Flutuante',
}

// Rotulo dos ESTAGIOS de atributo. `accuracy`/`evasion` nao sao um dos 6 stats
// reais (STAT_LABEL, indexado por `keyof StatBlock`) — sao eixo de combate a
// parte (sand_attack/smokescreen e companhia). Rotulo proprio so pros dois; o
// resto reusa STAT_LABEL pra nao duplicar os nomes ja centralizados aqui.
//
// Morava dentro de StatusEffectsBar.tsx. Subiu pra ca quando a ficha do golpe
// (AbilityTooltip) passou a mostrar os estagios que cada golpe mexe — dois
// lugares chamando o mesmo atributo por nomes diferentes e exatamente o que
// este arquivo existe pra evitar.
export const ROTULO_ESTAGIO: Record<StatDeEstagio, string> = {
  atkFis: STAT_LABEL.atkFis,
  atkEsp: STAT_LABEL.atkEsp,
  def: STAT_LABEL.def,
  defEsp: STAT_LABEL.defEsp,
  speed: STAT_LABEL.speed,
  accuracy: 'Precisão',
  evasion: 'Evasão',
}
