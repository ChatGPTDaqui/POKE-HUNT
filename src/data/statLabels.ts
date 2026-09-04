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

/**
 * A SIGLA de cada estagio — o que aparece no selo, sozinha, com o sinal na
 * frente: `+Atk`, `−Vel`, `−Prec`.
 *
 * PH-493, pedido do dono do projeto: "vamos retirar os simbolos criados
 * anteriormente para representar a alteracao de status, vamos substituir pelas
 * abreviacoes de letras". Ela substitui DOIS conjuntos de simbolo que diziam a
 * mesma coisa em dialetos diferentes — o icone Phosphor do selo do HUD
 * (`statIcones.ts`, PH-121) e o glifo de 21x13 desenhado acima da cabeca
 * (`estagioVfx.ts`, PH-480). Os dois nasceram do mesmo problema (a arte anterior
 * nao dizia QUAL atributo mudou) e os dois responderam com desenho; a sigla
 * responde com a palavra, que nao depende de o jogador ter aprendido o
 * vocabulario.
 *
 * SEM ACENTO E SEM ESPACO, de proposito: ela e desenhada em 11px no canvas e em
 * `.55em` no HUD, e nos dois lugares o que cabe e uma palavra curta. `Atk Fís`
 * (o `ROTULO_ESTAGIO`) continua sendo o nome por extenso, e e ele que aparece no
 * `title`, na bolha e na lista do celular — a sigla nunca substitui a explicacao,
 * so o icone.
 *
 * `AtkF`/`AtkE` e `Def`/`DefE` sao o par assimetrico de propósito: Defesa fisica
 * e `Def` no jogo inteiro (`STAT_LABEL`), e renomea-la aqui pra `DefF` criaria
 * um terceiro nome pro mesmo atributo. O que precisa de marca e a variante
 * especial, e e ela que leva a letra.
 */
export const SIGLA_DE_ESTAGIO: Record<StatDeEstagio, string> = {
  atkFis: 'AtkF',
  atkEsp: 'AtkE',
  def: 'Def',
  defEsp: 'DefE',
  speed: 'Vel',
  accuracy: 'Prec',
  evasion: 'Evas',
}

/** `+Atk` / `−Vel`: o texto inteiro do selo, sinal e sigla, num lugar so. */
export function textoDoSelo(stat: StatDeEstagio, aumenta: boolean): string {
  // MENOS TIPOGRAFICO (U+2212), e nao hifen: o mesmo sinal que o texto
  // flutuante de dano e o de estagio ja usam. Um hifen em 11px lido ao lado de
  // um `+` fica visivelmente mais curto e mais alto, e o par para de ler como
  // par.
  return `${aumenta ? '+' : '−'}${SIGLA_DE_ESTAGIO[stat]}`
}
