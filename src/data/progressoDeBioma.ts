// O progresso do jogador no mundo: um numero por bioma, "maior estagio ja
// limpo".
//
// SUBSTITUI O FORMATO DE TRES INTEIROS POR FAIXA (PH-429). `bioma_progress`
// guardava `{faixa1, faixa2, faixa3}`, e cada numero era "quantos biomas da
// ORDEM_DOS_BIOMAS o jogador venceu naquela faixa" — um eixo unico, sequencial,
// com o bioma seguinte trancado atras do anterior.
//
// O redesenho de 02/09 tirou esse eixo: os 12 biomas nascem TODOS abertos e o
// progresso e por bioma, independente. O jogador pode estar no estagio 7 do
// Marinho e no 2 do Igneo ao mesmo tempo, e `ORDEM_DOS_BIOMAS` deixa de decidir
// o que esta liberado (ela sobrevive por enquanto so pra traduzir save antigo).
//
// POR QUE ARQUIVO PROPRIO, E NAO DENTRO DE `estagios.ts`. Aquele arquivo e a
// REGUA (quantos estagios, que nivel, quantas salas, que peso) — dado de
// desenho, sem estado de jogador. Este e PERSISTENCIA: ele define uma forma que
// vai pro banco, precisa sobreviver a save antigo e nao pode mudar sem
// migration. Misturar os dois faria a regua parecer versionada.
import { BIOMAS, ORDEM_DOS_BIOMAS } from './biomas'
import { ESTAGIOS_POR_BIOMA, estagioValido, parseEstagioId } from './estagios'

/**
 * Maior estagio JA LIMPO de cada bioma, de 0 (nenhum) a 10 (bioma fechado).
 *
 * Chave = `bioma.chave` (`campo_aberto`, `marinho`, ...). Bioma ausente conta
 * como 0 — `maiorEstagioLimpo` garante isso, e ninguem deve indexar o objeto
 * direto por essa razao.
 */
export type ProgressoPorBioma = Record<string, number>

/**
 * O NOME MUDOU DE `BiomaProgress` PRA `ProgressoPorBioma` DE PROPOSITO.
 *
 * As duas formas sao objetos de numeros, e `Record<string, number>` aceita
 * `p['faixa1']` sem reclamar — quem lesse a chave antiga receberia `undefined`,
 * o `?? 0` transformaria em zero, e o gate trancaria o jogo inteiro em silencio.
 * Trocar o nome do tipo obriga o compilador a apontar cada lugar que precisava
 * ser relido. Foi a unica forma de tornar a mudanca de formato barulhenta.
 */

/** Progresso de conta nova: os 12 biomas em zero, nenhum estagio limpo. */
export function progressoPorBiomaDefault(): ProgressoPorBioma {
  return Object.fromEntries(BIOMAS.map((b) => [b.chave, 0]))
}

/** Maior estagio limpo do bioma. Bioma desconhecido ou ausente: 0. */
export function maiorEstagioLimpo(progresso: ProgressoPorBioma, bioma: string): number {
  const bruto = progresso[bioma]
  if (typeof bruto !== 'number' || !Number.isFinite(bruto)) return 0
  return Math.min(Math.max(Math.trunc(bruto), 0), ESTAGIOS_POR_BIOMA)
}

/**
 * Registra o estagio como limpo. NUNCA REGRIDE: limpar de novo um estagio
 * antigo (a caçada direcionada da PH-428, que e o ponto do redesenho) nao pode
 * desligar o estagio seguinte.
 *
 * Devolve um objeto novo — o estado do jogo e tratado como imutavel pelos
 * consumidores (store do Zustand, snapshot do flush).
 */
export function comEstagioLimpo(
  progresso: ProgressoPorBioma, bioma: string, estagio: number,
): ProgressoPorBioma {
  if (!estagioValido(estagio)) return progresso
  const atual = maiorEstagioLimpo(progresso, bioma)
  if (estagio <= atual) return progresso
  return { ...progresso, [bioma]: estagio }
}

/**
 * O estagio esta liberado pra entrar?
 *
 * O estagio 1 de QUALQUER bioma esta sempre liberado — e o que faz os 12
 * biomas nascerem abertos. O estagio N pede o N-1 limpo.
 *
 * A MESMA FUNCAO E CHAMADA PELOS DOIS LADOS (gate da autoridade em
 * `appSessao.ts` e selo do menu em `HuntMenu.tsx`), pelo mesmo motivo que
 * `indiceDoBiomaDoEstagio` era compartilhada antes dela: quando os dois
 * calculam a mesma regra separado, eles divergem, e o jogador ve uma hunt
 * aberta que o servidor recusa.
 */
export function estagioLiberado(
  progresso: ProgressoPorBioma, bioma: string, estagio: number,
): boolean {
  if (!estagioValido(estagio)) return false
  if (estagio === 1) return true
  return maiorEstagioLimpo(progresso, bioma) >= estagio - 1
}

/**
 * Mensagem de bloqueio do estagio, ou `null` se ele esta liberado.
 *
 * Mora aqui, e nao no gate do servidor nem na tela, porque as duas pontas
 * mostram o MESMO texto — o cliente pra explicar o cadeado, o servidor pra
 * recusar a sessao. Quando isso vivia em dois lugares (PH-227/229) a nota do
 * arquivo tinha que pedir que ninguem os deixasse divergir.
 */
export function bloqueioDoEstagio(
  progresso: ProgressoPorBioma, bioma: string, estagio: number,
): string | null {
  if (estagioLiberado(progresso, bioma, estagio)) return null
  return `Vença o Lord do estágio ${estagio - 1} para liberar este.`
}

// ---------------------------------------------------------------------------
// Traducao do save antigo
// ---------------------------------------------------------------------------
/**
 * As tres faixas antigas, e ate que estagio cada uma vale na traducao.
 *
 * A REGRA: faixa1 cobria Lv 1-30, que sao os estagios 1 a 3; faixa2 cobria Lv
 * 31-60 (estagios 4 a 6); faixa3 cobria Lv 61-90 (estagios 7 a 9). Quem venceu
 * o Lord de um bioma na faixa1 limpou, no vocabulario novo, tudo ate o estagio
 * 3 daquele bioma.
 *
 * O ESTAGIO 10 NAO E CONCEDIDO POR TRADUCAO NENHUMA, e isso e deliberado: ele
 * cobre Lv 91-100, conteudo que nao existia (o teto era 90). Ninguem pode ter
 * limpado o que nao existia — o jogador nao perde progresso e nao ganha o que
 * nao tinha.
 */
const ESTAGIO_DA_FAIXA_LEGADA: readonly (readonly [string, number])[] = [
  ['faixa1', 3],
  ['faixa2', 6],
  ['faixa3', 9],
]

/**
 * A ordem dos biomas COMO ELA ERA quando os saves antigos foram escritos.
 *
 * Congelada aqui de propósito, em vez de ler `ORDEM_DOS_BIOMAS`: o numero
 * gravado em `faixa1` e um INDICE nessa lista, e se a lista mudar amanha a
 * traducao de um save de ontem passa a apontar pro bioma errado. Save antigo se
 * le com a regra antiga. A constante viva continua sendo usada pelo resto do
 * codigo enquanto ela existir (ela sai na PH-434).
 */
export const ORDEM_LEGADA_DOS_BIOMAS: readonly string[] = [
  'campo_aberto',
  'subterraneo',
  'marinho',
  'industrial',
  'mata',
  'aguas_interiores',
  'urbano',
  'gelido',
  'aridos',
  'sagrado',
  'sombrio',
  'igneo',
]


/**
 * Le `players.bioma_progress` em qualquer um dos dois formatos.
 *
 * IDEMPOTENTE, e o teste tranca isso: rodar sobre o resultado dela nao muda
 * mais nada. Sem essa propriedade a traducao rodaria a cada carga e o valor
 * derivaria — e o caminho de carga roda muitas vezes por sessao, nao uma.
 *
 * Entrada podre (null, string, numero, chave que nao e bioma, valor que nao e
 * numero) devolve o default em vez de estourar: uma carga que falha derruba a
 * sessao inteira, e um progresso zerado e recuperavel (o servidor grava de
 * novo ao vencer o proximo Lord) enquanto uma sessao que nao abre nao e.
 */
export function lerProgressoPorBioma(bruto: unknown): ProgressoPorBioma {
  const base = progressoPorBiomaDefault()
  if (bruto == null || typeof bruto !== 'object' || Array.isArray(bruto)) return base
  const objeto = bruto as Record<string, unknown>

  // PASSO 1 — o que ja esta no formato novo. Chave que nao e bioma conhecido ou
  // valor que nao e numero e descartada em silencio: ela nao teria consumidor, e
  // propagar lixo pro banco a cada flush e pior que perde-lo.
  let lido = base // `base` ja e objeto novo; mutar aqui nao vaza pra ninguem
  for (const chave of Object.keys(base)) {
    const valor = objeto[chave]
    if (typeof valor !== 'number' || !Number.isFinite(valor)) continue
    lido[chave] = Math.min(Math.max(Math.trunc(valor), 0), ESTAGIOS_POR_BIOMA)
  }

  // PASSO 2 — o que vem das faixas antigas, aplicado POR CIMA e pelo MAXIMO.
  //
  // OS DOIS PASSOS RODAM SEMPRE, E ESSE E O CONSERTO DA PH-440. A versao
  // original escolhia UM dos dois caminhos pela presenca de qualquer chave
  // `faixa*`, assumindo que os formatos eram mutuamente exclusivos. Nao sao:
  // enquanto houver um cliente com bundle antigo escrevendo na MESMA coluna — o
  // que e exatamente o intervalo entre o deploy da `dev` e a promocao pra
  // `main` — a linha volta do banco com as duas coisas juntas. O bundle antigo
  // fazia `{...defaults, ...doBanco}` com `defaults = {faixa1: 0, faixa2: 0,
  // faixa3: 0}`, entao ele regrava as chaves de faixa ZERADAS ao lado das
  // chaves de bioma corretas.
  //
  // Diante desse objeto misto, o caminho legado traduzia so os zeros das faixas
  // e DESCARTAVA o progresso de bioma. Medido no banco em 02/09: duas linhas de
  // `public` no estado misto, uma delas com os 12 biomas fechados. O leitor as
  // devolvia inteiramente zeradas — o jogador voltava ao estagio 1 em tudo, sem
  // erro nenhum na tela.
  //
  // Aplicar os dois pelo maximo e correto nos tres casos: so-novo (o passo 2
  // nao acha faixa e nao faz nada), so-legado (o passo 1 nao acha bioma e
  // comeca do zero) e misto (o maior dos dois vence, que e o que preserva o
  // progresso).
  for (const [faixa, estagio] of ESTAGIO_DA_FAIXA_LEGADA) {
    const quantos = objeto[faixa]
    if (typeof quantos !== 'number' || !Number.isFinite(quantos)) continue
    // `faixa1: 7` significa "venceu os 7 PRIMEIROS biomas da ordem", entao os
    // indices 0 a 6. `Math.min` protege contra o valor 12+ que ja existe no
    // banco (uma linha tem `faixa2: 12`, o total de biomas).
    const ate = Math.min(Math.trunc(quantos), ORDEM_LEGADA_DOS_BIOMAS.length)
    for (let i = 0; i < ate; i++) {
      lido = comEstagioLimpo(lido, ORDEM_LEGADA_DOS_BIOMAS[i], estagio)
    }
  }
  return lido
}

// ---------------------------------------------------------------------------
// mapId legado
// ---------------------------------------------------------------------------
/** Hunt pra onde cai quem estava num mapId que nao existe mais. */
export const HUNT_DE_REFUGIO = 'route_46'

const PADRAO_DE_FAIXA_LEGADA = /^(.+)_faixa([123])$/

/**
 * Traduz um mapId gravado (`players.current_map_id`, `game_sessions.map_id`)
 * pro formato de estagio.
 *
 * TRES CASOS, e o terceiro e o que importa:
 *
 *  - ja e estagio (`marinho_e7`): devolve igual;
 *  - e faixa antiga (`marinho_faixa2`): vira o PRIMEIRO estagio daquela faixa
 *    (faixa1 -> e1, faixa2 -> e4, faixa3 -> e7). O primeiro, e nao o ultimo,
 *    porque a faixa nao diz onde dentro dela o jogador estava — e comecar no
 *    piso e o erro barato: ele sobe de novo em minutos. Comecar no topo daria
 *    conteudo que ele talvez nao tivesse alcancado;
 *  - qualquer outra coisa: a hunt inicial. Um mapId desconhecido chegando em
 *    `buildMapWorld` estoura (`Mapa desconhecido: ...`) e derruba a sessao —
 *    era assim que a hunt de faixa saia do ar e levava o jogador com ela.
 */
export function traduzirMapIdLegado(mapId: string | null | undefined): string | null {
  if (mapId == null || mapId === '') return null
  if (parseEstagioId(mapId)) return mapId
  // Hunt sem bioma (inicial, BOSS, Treinamento) e o espelho do Pesadelo passam
  // intactos: nenhum deles usa o formato de faixa.
  if (!PADRAO_DE_FAIXA_LEGADA.test(mapId)) return mapId

  const m = PADRAO_DE_FAIXA_LEGADA.exec(mapId)
  const bioma = m?.[1] ?? ''
  const faixa = Number(m?.[2] ?? 0)
  if (!ORDEM_DOS_BIOMAS.includes(bioma)) return HUNT_DE_REFUGIO
  const primeiroEstagio = (faixa - 1) * 3 + 1
  return `${bioma}_e${primeiroEstagio}`
}
