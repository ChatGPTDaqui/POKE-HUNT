// Arte do golpe que muda ATRIBUTO, por atributo e direcao (PH-416).
//
// O QUE ELA SUBSTITUI
// -----------------------------------------------------------------------------
// `statusVfx.ts` escolhia a arte por TIPO ELEMENTAL + direcao: 32 GIFs, 16 tipos
// x 2 direcoes. Aquele eixo nunca respondeu a pergunta que o jogador faz — QUAL
// atributo mudou. Ataque caindo e Velocidade caindo desenhavam exatamente a
// mesma coisa, e o unico diferenciador era o texto flutuante.
//
// E o mesmo defeito que a PH-121 corrigiu no selo do HUD ("os icones escolhidos
// nao estao conseguindo a representatividade visual adequada", com captura) e
// que continuava de pe no mundo.
//
// POR QUE O TIPO NAO SE PERDE
// -----------------------------------------------------------------------------
// A arte e gerada quase BRANCA, e a cor do tipo entra no desenho
// (`sprites.ts#drawEstagioEffect`) por `multiply`. Assim o eixo do tipo continua
// existindo — um Rosnado de POISON sai roxo e um de FIRE sai laranja — sem
// custar arquivo: assar a cor daria 15 x 16 tipos = 240 arquivos.
//
// `multiply` e nao `source-atop`, e a diferenca importa: `source-atop` pinta a
// cor sobre TODO pixel opaco e apagaria o contorno escuro, que e o que faz a
// arte existir sobre um POKE claro. Com `multiply`, branco x cor = cor e
// contorno x cor = contorno.
import type { StatDeEstagio } from './statusEffects'
import type { TiraDeVfx } from './vfxTiras'

const RAIZ = 'assets/estagio-vfx'

/**
 * Uniforme nas 15, igual a arte de condicao da PH-416 — por isso a constante em
 * vez de um numero por arquivo.
 */
export const QUADROS_DE_ESTAGIO = 16

export type DirecaoDeEstagio = 'aumenta' | 'diminui'

/**
 * As 14 tiras de atributo. Um par por atributo, e o par existe porque o
 * movimento dos motes e a unica coisa que difere: no `aumenta` eles nascem
 * embaixo e sobem, no `diminui` nascem em cima e caem.
 *
 * POR QUE NAO UMA TIRA SO TOCADA AO CONTRARIO: os motes APAGAM no fim do
 * percurso. De tras pra frente eles acenderiam no fim, e o efeito leria como
 * algo se juntando em vez de se dissipando. 15 arquivos a ~1,9KB e mais barato
 * que essa complexidade no motor.
 */
export const TIRA_POR_ESTAGIO: Record<StatDeEstagio, Record<DirecaoDeEstagio, TiraDeVfx>> = {
  atkFis: {
    aumenta: { url: `${RAIZ}/atkFis-aumenta.png`, quadros: QUADROS_DE_ESTAGIO },
    diminui: { url: `${RAIZ}/atkFis-diminui.png`, quadros: QUADROS_DE_ESTAGIO },
  },
  atkEsp: {
    aumenta: { url: `${RAIZ}/atkEsp-aumenta.png`, quadros: QUADROS_DE_ESTAGIO },
    diminui: { url: `${RAIZ}/atkEsp-diminui.png`, quadros: QUADROS_DE_ESTAGIO },
  },
  def: {
    aumenta: { url: `${RAIZ}/def-aumenta.png`, quadros: QUADROS_DE_ESTAGIO },
    diminui: { url: `${RAIZ}/def-diminui.png`, quadros: QUADROS_DE_ESTAGIO },
  },
  defEsp: {
    aumenta: { url: `${RAIZ}/defEsp-aumenta.png`, quadros: QUADROS_DE_ESTAGIO },
    diminui: { url: `${RAIZ}/defEsp-diminui.png`, quadros: QUADROS_DE_ESTAGIO },
  },
  speed: {
    aumenta: { url: `${RAIZ}/speed-aumenta.png`, quadros: QUADROS_DE_ESTAGIO },
    diminui: { url: `${RAIZ}/speed-diminui.png`, quadros: QUADROS_DE_ESTAGIO },
  },
  accuracy: {
    aumenta: { url: `${RAIZ}/accuracy-aumenta.png`, quadros: QUADROS_DE_ESTAGIO },
    diminui: { url: `${RAIZ}/accuracy-diminui.png`, quadros: QUADROS_DE_ESTAGIO },
  },
  evasion: {
    aumenta: { url: `${RAIZ}/evasion-aumenta.png`, quadros: QUADROS_DE_ESTAGIO },
    diminui: { url: `${RAIZ}/evasion-diminui.png`, quadros: QUADROS_DE_ESTAGIO },
  },
}

/**
 * A 15a peca: golpe que aplica CONDICAO (confusao, veneno, sono...).
 *
 * Ela existe porque a arte antiga fazia DOIS papeis com o mesmo arquivo — o
 * `NOTAS.txt` do acervo dizia "golpe que baixa atributo, ou aplica condicao
 * (sem estagio pra medir direcao, tratado como diminui)". Trocar a arte de
 * atributo sem dar peca propria a condicao deixaria esses golpes sem VFX.
 *
 * Ela e GENERICA de proposito: QUAL condicao pegou ja e dito pelo simbolo que
 * fica no corpo (`TIRA_POR_CONDICAO_NO_CORPO`, PH-416). Esta peca e so o
 * lancamento, e a ampulheta diz o que ela tem pra dizer — comecou a correr um
 * prazo, que desde a PH-422 o jogo mostra em segundos.
 */
export const TIRA_DE_CONDICAO_APLICADA: TiraDeVfx = {
  url: `${RAIZ}/condicao.png`,
  quadros: QUADROS_DE_ESTAGIO,
}

/**
 * A tira do efeito, ou `null` quando nao ha o que desenhar.
 *
 * `stat` ausente com `direcao` presente e o caso da CONDICAO: golpe de status
 * que nao mexe em atributo nenhum.
 */
export function tiraDeEstagio(
  stat: StatDeEstagio | null | undefined,
  direcao: DirecaoDeEstagio | null | undefined,
): TiraDeVfx | null {
  if (!direcao) return null
  if (!stat) return TIRA_DE_CONDICAO_APLICADA
  return TIRA_POR_ESTAGIO[stat]?.[direcao] ?? null
}

/**
 * O par (atributo, direcao) do golpe, tirado da MESMA entrada de `statChanges`.
 *
 * ELES TEM QUE SAIR JUNTOS, e nao de duas funcoes independentes. Um golpe pode
 * mexer em varios atributos em sentidos opostos — Shell Smash sobe Ataque e
 * baixa Defesa —, entao derivar o atributo por uma regra ("o de maior modulo")
 * e a direcao por outra ("o primeiro") produziria par TORTO: escudo com motes
 * subindo num golpe que baixa a Defesa. A arte diria o contrario do que o jogo
 * fez.
 *
 * A entrada escolhida e a PRIMEIRA, que e a que `direcaoDoGolpeDeStatus` ja
 * usava desde a PH-367 — a direcao no ar hoje sai dela, e trocar o criterio
 * mudaria a direcao de golpes que ninguem pediu pra mudar.
 *
 * `null` = golpe de status que nao mexe em atributo (condicao). Quem chama
 * traduz isso na peca generica de condicao.
 */
export function estagioDoGolpe(
  statChanges: { stat: StatDeEstagio, estagios: number }[] | null | undefined,
): { stat: StatDeEstagio, direcao: DirecaoDeEstagio } | null {
  const primeiro = statChanges?.[0]
  if (!primeiro) return null
  return { stat: primeiro.stat, direcao: primeiro.estagios > 0 ? 'aumenta' : 'diminui' }
}

/** Todas as 15 URLs — usado pelo preload e pelo teste de existencia. */
export function urlsDeEstagio(): string[] {
  return [
    ...Object.values(TIRA_POR_ESTAGIO).flatMap((par) => [par.aumenta.url, par.diminui.url]),
    TIRA_DE_CONDICAO_APLICADA.url,
  ]
}
