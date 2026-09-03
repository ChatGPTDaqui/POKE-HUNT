// O SELO de mudanca de ATRIBUTO, por atributo e direcao (PH-416, refeito na
// PH-480).
//
// O QUE ELE SUBSTITUI, DUAS VEZES
// -----------------------------------------------------------------------------
// PH-416: `statusVfx.ts` escolhia a arte por TIPO ELEMENTAL + direcao — 32 GIFs,
// 16 tipos x 2 direcoes. Aquele eixo nunca respondeu a pergunta que o jogador
// faz, QUAL atributo mudou: Ataque caindo e Velocidade caindo desenhavam
// exatamente a mesma coisa. E o mesmo defeito que a PH-121 corrigiu no selo do
// HUD ("os icones escolhidos nao estao conseguindo a representatividade visual
// adequada", com captura) e que continuava de pe no mundo.
//
// PH-480: a peca da PH-416 era uma TIRA de 16 quadros de 48x48 desenhada no
// CENTRO DO CORPO do alvo — mesmo lugar, mesmo tamanho e mesma duracao da arte
// de impacto de um golpe de dano. Pedido do dono, textual: "os efeitos de status
// ficaram muito ruins, eles estao sendo aplicados como se fossem sprites de
// ataque, sobrepondo as sprites de ataque. Como eles sao apenas indicador de
// alteracao de stats, vamos fazer algo bem simples, uns icones bem pequenos".
//
// Entao a peca virou SELO: um quadro so, 21x13, glifo do atributo mais seta de
// direcao, desenhado ACIMA DA CABECA (`sprites.ts#drawSeloDeEstagio`).
//
// A COR AGORA E A DA DIRECAO, E NAO A DO TIPO
// -----------------------------------------------------------------------------
// A arte continua sendo gerada quase BRANCA e a cor entra no desenho por
// `multiply` — o que mudou e QUAL cor. Ate a PH-480 era a do tipo elemental, e
// isso fazia sentido quando a peca era uma cena de 48px no corpo do alvo. Num
// selo de 13px de altura o canal de cor tem lugar pra UMA informacao, e a que o
// jogador precisa e subiu-ou-desceu; o tipo do golpe ja esta dito pelo resto da
// cena (a arte do proprio golpe, a cor do nome que flutua).
//
// `multiply` e nao `source-atop`, e a diferenca importa: `source-atop` pinta a
// cor sobre TODO pixel opaco e apagaria o contorno escuro, que e o que faz a
// arte existir sobre um POKE claro. Com `multiply`, branco x cor = cor e
// contorno x cor = contorno.
import type { StatDeEstagio } from './statusEffects'
import type { TiraDeVfx } from './vfxTiras'

const RAIZ = 'assets/estagio-vfx'

/**
 * UM quadro. O selo nao anima: o movimento que ele tem e a subida/descida que o
 * desenho faz com a peca inteira, e ela nao custa arquivo.
 *
 * A constante sobrevive a troca (era 16) porque `TiraDeVfx` continua sendo o
 * formato — quem desenha deduz a largura do quadro por `naturalWidth/quadros`, e
 * com 1 isso e o arquivo inteiro.
 */
export const QUADROS_DE_ESTAGIO = 1

/**
 * O tamanho do selo em unidade de MUNDO, 1:1 com o arquivo (`21x13`, gerado por
 * `scripts/gerar-estagio-vfx.mjs`).
 *
 * 1:1 e obrigatorio, nao economia: e pixel art com traco de 1px, e qualquer
 * escala nao-inteira racha o traco — a mesma licao que
 * `CAPTURE_ANIM_DRAW_SCALE` carrega em `sprites.ts`.
 */
export const SELO_LARGURA = 21
export const SELO_ALTURA = 13

export type DirecaoDeEstagio = 'aumenta' | 'diminui'

/**
 * Os 14 selos de atributo. Um par por atributo, e o par existe porque a SETA
 * difere: no `aumenta` ela aponta pra cima, no `diminui` pra baixo.
 *
 * POR QUE DOIS ARQUIVOS E NAO UM ESPELHADO NO DESENHO: espelhar no canvas
 * inverteria o GLIFO junto, e metade deles tem lateralidade (a lamina diagonal
 * do `atkFis`, o chevron do `speed`). 15 arquivos a ~140 bytes — o conjunto
 * inteiro pesa 2,1 kB — e mais barato que um `scale(1,-1)` seletivo no motor.
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
 *
 * E a unica das 15 SEM SETA: nao ha estagio pra medir direcao numa condicao, e
 * uma seta inventada mentiria. A ampulheta fica centrada no selo.
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
