// Os 10 estagios de cada bioma: régua de nivel, quantidade de salas e o peso
// de sub-bioma que AFUNDA conforme o jogador avanca.
//
// Este arquivo e a primeira peca do redesenho da progressao decidido em
// 02/09/2026 (PH-425). Ele SUBSTITUI, nas issues seguintes, as 3 faixas de 30
// niveis de `biomas.ts` (`FAIXAS`, `FAIXAS_INICIAIS`, `GRUPOS_DO_LANCE`) —
// mas nesta issue ele entra SEM CONSUMIDOR: as faixas continuam de pe e o
// comportamento de jogo nao muda. Quem liga isto na montagem das hunts e a
// PH-426; no motor de salas, a PH-427.
//
// POR QUE ESTAGIO NO LUGAR DE FAIXA. A divisao em 10 degraus JA EXISTE hoje,
// invisivel: `salaSystem#janelaDaSala` parte os 30 niveis da faixa em 10
// pedacos, um por sala. O jogador nunca ve essa divisao e nunca escolhe onde
// entrar — ele cai na sala 1 e sobe. "De 1-30 e muita margem" (palavras do
// dono do projeto): o estagio torna a divisao visivel e escolhivel, que e a
// unica coisa que faltava.
//
// A DIVISAO DE TRABALHO CONTINUA A MESMA DE `biomas.ts`:
//
//   generated/subBiomas.generated.ts   QUEM aparece em cada sub-bioma
//   biomas.ts                          COMO os sub-biomas se agrupam, com que
//                                      peso BASE, que loot e que arte
//   estagios.ts (este)                 QUANTOS estagios, que NIVEL cada um
//                                      cobre, quantas SALAS tem, e como o peso
//                                      de sub-bioma muda do estagio 1 ao 10
//
// O elenco NAO e recortado por estagio: ele continua vindo do sub-bioma. O que
// o estagio carrega e so a tabela de porcentagem. E isso que mantem o dado
// gerado no lugar e evita curar 120 listas a mao.
import { BIOMAS, ORDEM_DOS_BIOMAS, type BiomaDef, type SubBiomaDef } from './biomas'

// ---------------------------------------------------------------------------
// A regua
// ---------------------------------------------------------------------------
/** Quantos estagios cada bioma tem. Todos os 12 tem os mesmos 10. */
export const ESTAGIOS_POR_BIOMA = 10

/** Quantos niveis um estagio cobre. 10 x 10 = o modo normal inteiro. */
export const NIVEIS_POR_ESTAGIO = 10

/**
 * Teto de nivel do modo normal.
 *
 * Era 90 (fim da faixa III). Vira 100 porque 10 estagios de 10 niveis fecham
 * a centena — nao e numero escolhido a parte, e consequencia da regua. Acima
 * disso continua sendo Modo Pesadelo (Lv 101-200 no desenho novo) e as hunts
 * BOSS (Lv 300).
 */
export const TETO_DO_MODO_NORMAL = ESTAGIOS_POR_BIOMA * NIVEIS_POR_ESTAGIO

/**
 * Quantas salas cada estagio tem, do 1 ao 10.
 *
 * Sobe de 3 a 8 em vez das 10 fixas de hoje (`SALAS_POR_HUNT`): o estagio 1
 * precisa ser curto o bastante pra o novato ver o primeiro Lord cedo, e o
 * estagio 10 precisa ser longo o bastante pra o fim do bioma pesar. Com a
 * quota de 30 abates por sala (`ABATES_POR_SALA`, que fica como esta), a soma
 * da 55 salas e 1.650 abates por bioma.
 *
 * NUMEROS PROVISORIOS, e o dono do projeto sabe disso ("por enquanto"). O que
 * decide se estao certos e o TEMPO REAL por sala, que ainda nao foi medido —
 * e, quando for, tem que ser contra o servidor publicado, nao no motor
 * headless: os dois ja discordaram por quase 6x no dimensionamento da hunt
 * inicial (ver `MAX_INIMIGOS_HUNT_INICIAL` em biomas.ts).
 */
export const SALAS_POR_ESTAGIO: readonly number[] = [3, 4, 4, 5, 5, 6, 6, 7, 7, 8]

/** Total de salas de um bioma inteiro, os 10 estagios somados. */
export const SALAS_POR_BIOMA = SALAS_POR_ESTAGIO.reduce((a, b) => a + b, 0)

/** `true` se `estagio` e um numero de estagio valido (1..10, inteiro). */
export function estagioValido(estagio: number): boolean {
  return Number.isInteger(estagio) && estagio >= 1 && estagio <= ESTAGIOS_POR_BIOMA
}

/**
 * Faixa fechada de nivel do estagio: o estagio `e` cobre
 * `(e-1)*10+1` a `e*10`. Contigua e sem sobreposicao, cobrindo Lv 1-100.
 */
export function niveisDoEstagio(estagio: number): [number, number] {
  const topo = estagio * NIVEIS_POR_ESTAGIO
  return [topo - NIVEIS_POR_ESTAGIO + 1, topo]
}

/**
 * Zona maxima de `spawnStrength.zonaMinimaDaEspecie` que cabe neste estagio.
 *
 * A escala de zona e de 10 niveis desde sempre (zona 0 = Lv 1-10), entao o
 * casamento e direto: `estagio - 1`. Isso preserva o eixo de FORCA que impede
 * Tyranitar de nascer no comeco — e o mesmo eixo que as faixas usavam
 * (faixa1 ia ate a zona 2, que e o estagio 3 aqui).
 */
export function zonaMaximaDoEstagio(estagio: number): number {
  return estagio - 1
}

/** Quantas salas tem o estagio. */
export function salasDoEstagio(estagio: number): number {
  return SALAS_POR_ESTAGIO[estagio - 1]
}

// ---------------------------------------------------------------------------
// Id do estagio
// ---------------------------------------------------------------------------
/**
 * Id da hunt de um estagio. Estavel: vai pro banco (`players.current_map`,
 * `game_sessions.map_id`, `sala_protetor`), entao mudar o formato depois exige
 * migration de dado.
 *
 * Formato `<bioma>_e<N>` — o `_e` separa do formato antigo `<bioma>_faixa<N>`
 * sem ambiguidade, o que deixa os dois conviverem durante a traducao de save
 * legado (PH-429).
 */
export function estagioId(bioma: string, estagio: number): string {
  return `${bioma}_e${estagio}`
}

export interface EstagioDoMapId {
  bioma: string
  estagio: number
}

const PADRAO_DE_ESTAGIO = /^(.+)_e(\d+)$/

const CHAVES_DE_BIOMA: ReadonlySet<string> = new Set(BIOMAS.map((b) => b.chave))

/**
 * Inverso de `estagioId`, ou `null` se o mapId nao e de um estagio de bioma.
 *
 * Valida o bioma contra `BIOMAS` e o estagio contra a regua, de proposito: sem
 * isso `nightmare_marinho_e7` (o Modo Pesadelo prefixa o mapId, ver
 * nightmareMaps.ts) devolveria o bioma inventado `nightmare_marinho` e o gate
 * de entrada da autoridade (PH-430) liberaria sessao com progresso de um bioma
 * que nao existe. O Pesadelo ganha tratamento PROPRIO quando for a vez dele —
 * aqui ele so nao pode passar por engano.
 */
export function parseEstagioId(mapId: string): EstagioDoMapId | null {
  const m = PADRAO_DE_ESTAGIO.exec(mapId)
  if (!m) return null
  const bioma = m[1]
  const estagio = Number(m[2])
  if (!CHAVES_DE_BIOMA.has(bioma)) return null
  if (!estagioValido(estagio)) return null
  return { bioma, estagio }
}

/**
 * Indice do bioma deste mapId dentro de `ORDEM_DOS_BIOMAS`, ou `-1` quando o
 * mapId nao e de um estagio de bioma (hunt inicial, BOSS, Pesadelo).
 *
 * SUBSTITUI `biomas.ts#indiceDoBiomaNoMapId` (PH-426), que sabia ler so o
 * formato antigo `<bioma>_faixa<N>`. A funcao mora AQUI, e nao la, porque
 * `estagios.ts` ja importa `biomas.ts` — o contrario criaria ciclo, e
 * `ESTAGIOS` e calculado em tempo de import.
 *
 * O INVARIANTE QUE ELA CARREGA e o mesmo de antes: o gate server-side
 * (`authority/src/appSessao.ts#bloqueioDeBiomaPendente`) e o selo/ordem do menu
 * (`HuntMenu.tsx`) precisam concordar sobre "que bioma e esse mapId". Uma
 * funcao so, chamada pelos dois.
 *
 * ELA E TRANSITORIA. O gate por ORDEM de bioma morre na PH-430, quando os 12
 * biomas passam a nascer abertos e o eixo vira o estagio dentro do bioma.
 */
export function indiceDoBiomaDoEstagio(mapId: string): number {
  const estagio = parseEstagioId(mapId)
  return estagio ? ORDEM_DOS_BIOMAS.indexOf(estagio.bioma) : -1
}

// ---------------------------------------------------------------------------
// O peso de sub-bioma que afunda
// ---------------------------------------------------------------------------
// ESTA E A ALAVANCA DE IMERSAO DO REDESENHO, e ela nao e sobre especie: e
// sobre SUB-BIOMA. A composicao de um bioma nao precisa ser a mesma nos 10
// estagios. O Marinho comeca em Praia + Mar Aberto e termina no Leito
// Oceanico; o jogador afunda no bioma conforme progride, sem que nenhuma
// lista de especie seja curada a mao.
//
// E tambem a saida pro risco de elenco: o estagio 10 do Marinho nao precisa de
// um habitante forte na Praia, porque ele para de sortear Praia.
//
// O MODELO. Cada sub-bioma declara:
//
//   profundidade  onde no bioma ele esta no auge — 0 = estagio 1, 1 = estagio 10
//   pico          o peso dele NO auge
//   alcance       quanto ele se estende pra cada lado antes de zerar
//
// O peso no estagio `e` e `pico * afinidade`, com a afinidade caindo linear da
// distancia entre a posicao do estagio e a profundidade do sub-bioma. Depois
// os pesos do bioma sao normalizados pra somar 1.
//
// POR QUE NAO REAPROVEITAR O `peso` DE `biomas.ts`. Aquele peso e uma media de
// bioma inteiro ("10 = corriqueiro, 3 = o lugar raro"): o Leito Oceanico e 3
// porque e raro NO GERAL. Se ele fosse 3 aqui tambem, o estagio 10 do Marinho
// daria 30% de Leito contra 70% de Mar Aberto — o oposto do que o desenho
// pede. O `pico` diz outra coisa: quanto ele vale ONDE ele manda. Os dois
// numeros coexistem enquanto as faixas estiverem de pe; a PH-434, que apaga o
// vocabulario de faixa, e quem decide se `peso` sobrevive.
export interface PerfilDeProfundidade {
  /** 0 = auge no estagio 1, 1 = auge no estagio 10. */
  profundidade: number
  /** Peso no auge. */
  pico: number
  /**
   * Meia-largura da curva: o peso zera a esta distancia da profundidade.
   * Omitido = `ALCANCE_PADRAO`. E o escape pro caso em que a curva padrao nao
   * serve — sub-bioma que precisa estar presente no bioma inteiro pede
   * alcance maior; um que precisa ser um degrau curto pede menor.
   */
  alcance?: number
}

/**
 * Com 0,75 um sub-bioma cobre pouco mais de dois tercos do bioma, entao um
 * raso (profundidade 0) some por completo no estagio 10 e um profundo
 * (profundidade 1) some no estagio 1 — que e exatamente o efeito pedido. Valor
 * menor faz o bioma virar corredor de salas exclusivas; maior achata tudo e a
 * imersao some.
 */
export const ALCANCE_PADRAO = 0.75

/**
 * Perfil de cada um dos 33 sub-biomas.
 *
 * Escrito a mao, pelo mesmo motivo que os pesos de `biomas.ts` sao: "o que e
 * raso e o que e fundo neste lugar" e decisao tematica, nao dado derivavel.
 * Nao ha ordem implicita na lista de `subBiomas` que sirva — `seabed` e o
 * ultimo do Marinho por acaso de insercao, nao por profundidade.
 */
export const PERFIL_POR_SUB_BIOMA: Record<string, PerfilDeProfundidade> = {
  // campo_aberto — sai da vila e vai pro campo aberto de verdade.
  town: { profundidade: 0.05, pico: 6 },
  plains: { profundidade: 0.35, pico: 10 },
  grass: { profundidade: 0.45, pico: 10 },
  meadow: { profundidade: 0.85, pico: 8 },

  // mata — do mato alto da borda ao fundo da selva.
  'tall-grass': { profundidade: 0.15, pico: 10 },
  forest: { profundidade: 0.45, pico: 10 },
  jungle: { profundidade: 0.95, pico: 10 },

  // marinho — a costa fica pra tras e o mapa afunda.
  beach: { profundidade: 0.0, pico: 6 },
  sea: { profundidade: 0.45, pico: 10 },
  seabed: { profundidade: 1.0, pico: 10 },

  // aguas_interiores — so dois sub-biomas, entao a troca e suave de proposito:
  // zerar um deles cedo demais deixaria metade do bioma com uma sala so.
  lake: { profundidade: 0.25, pico: 10 },
  swamp: { profundidade: 0.9, pico: 9 },

  // aridos — ermos, deserto, e o fundo devastado.
  badlands: { profundidade: 0.1, pico: 10 },
  desert: { profundidade: 0.5, pico: 10 },
  wasteland: { profundidade: 1.0, pico: 10 },

  // subterraneo — aqui "afundar" e literal: comeca na montanha, termina na
  // caverna. A ordem de `biomas.ts` (cave primeiro) e de insercao, nao de
  // profundidade.
  mountain: { profundidade: 0.15, pico: 9 },
  cave: { profundidade: 0.85, pico: 10 },

  // gelido — da floresta nevada pra dentro da caverna de gelo.
  'snowy-forest': { profundidade: 0.15, pico: 9 },
  'ice-cave': { profundidade: 0.85, pico: 10 },

  // igneo — sub-bioma unico, entao a profundidade nao muda nada: ele e 100%
  // dos 10 estagios. Fica no meio pra deixar isso explicito em vez de
  // acidental.
  volcano: { profundidade: 0.5, pico: 10 },

  // urbano — o Dojo e o fundo do bioma de FIGHTING, nao a entrada: e onde os
  // fortes treinam.
  metropolis: { profundidade: 0.2, pico: 10 },
  slum: { profundidade: 0.6, pico: 8 },
  dojo: { profundidade: 0.95, pico: 10 },

  // industrial — da obra a ceu aberto ao laboratorio no fundo.
  'construction-site': { profundidade: 0.05, pico: 10 },
  factory: { profundidade: 0.4, pico: 10 },
  'power-plant': { profundidade: 0.7, pico: 9 },
  laboratory: { profundidade: 1.0, pico: 10 },

  // sagrado — ruinas na superficie, gruta feerica no fundo.
  ruins: { profundidade: 0.15, pico: 10 },
  temple: { profundidade: 0.55, pico: 10 },
  'fairy-cave': { profundidade: 1.0, pico: 10 },

  // sombrio — cemiterio, abismo, e o vazio.
  graveyard: { profundidade: 0.1, pico: 10 },
  abyss: { profundidade: 0.6, pico: 10 },
  space: { profundidade: 1.0, pico: 10 },
}

/**
 * Posicao do estagio na profundidade do bioma: 0 no estagio 1, 1 no estagio 10.
 */
export function posicaoDoEstagio(estagio: number): number {
  return (estagio - 1) / (ESTAGIOS_POR_BIOMA - 1)
}

function perfilDe(sub: SubBiomaDef): PerfilDeProfundidade {
  // Sub-bioma sem perfil declarado nao pode sumir do jogo: cai no meio do
  // bioma com o peso base dele, presente nos 10 estagios. Um teste tranca a
  // tabela contra os 33 de `BIOMAS`, entao este caminho so existe pra sobreviver
  // a um sub-bioma novo que chegue antes do perfil dele.
  return PERFIL_POR_SUB_BIOMA[sub.chave] ?? { profundidade: 0.5, pico: sub.peso }
}

function afinidade(perfil: PerfilDeProfundidade, posicao: number): number {
  const alcance = perfil.alcance ?? ALCANCE_PADRAO
  const distancia = Math.abs(posicao - perfil.profundidade)
  return Math.max(0, 1 - distancia / alcance)
}

/**
 * Peso normalizado de cada sub-bioma numa posicao do bioma. Soma 1.
 *
 * Separada de `pesosDoEstagio` porque e a parte que precisa ser testada com
 * entrada sintetica — inclusive o caso degenerado em que TODO sub-bioma zera
 * na posicao pedida (perfis todos rasos num estagio fundo). Ai o fallback e o
 * peso base: sala vazia e pior que sala fora do tema, do mesmo jeito que
 * `contextoDeSpawn` prefere pool errado a pool nenhum.
 */
export function pesosPorProfundidade(
  subs: readonly SubBiomaDef[],
  posicao: number,
): Record<string, number> {
  const brutos = subs.map((sub) => {
    const perfil = perfilDe(sub)
    return afinidade(perfil, posicao) * perfil.pico
  })
  let total = brutos.reduce((a, b) => a + b, 0)
  let base = brutos
  if (total <= 0) {
    base = subs.map((sub) => sub.peso)
    total = base.reduce((a, b) => a + b, 0)
  }
  if (total <= 0) {
    // Bioma sem sub-bioma com peso nenhum: reparte igual em vez de dividir por
    // zero. Nao acontece com os 12 de hoje; existe pra nao virar NaN silencioso.
    const igual = subs.length > 0 ? 1 / subs.length : 0
    return Object.fromEntries(subs.map((sub) => [sub.chave, igual]))
  }
  return Object.fromEntries(subs.map((sub, i) => [sub.chave, base[i] / total]))
}

/**
 * Peso de cada sub-bioma do bioma no estagio dado. Soma 1.
 *
 * E isto que o menu mostra como porcentagem (PH-431) e o que o sorteio de sala
 * consome (PH-427) — os dois precisam ler a mesma funcao, senao a tela promete
 * uma composicao e a sala entrega outra.
 */
export function pesosDoEstagio(bioma: BiomaDef, estagio: number): Record<string, number> {
  return pesosPorProfundidade(bioma.subBiomas, posicaoDoEstagio(estagio))
}

export interface EstagioDef {
  id: string
  bioma: string
  estagio: number
  /** Faixa fechada de nivel. */
  niveis: [number, number]
  zonaMaxima: number
  salas: number
  /** Peso normalizado por sub-bioma; soma 1. */
  pesosDeSubBioma: Record<string, number>
}

/** Os 120 estagios (12 biomas x 10), na ordem de `BIOMAS`. */
export const ESTAGIOS: EstagioDef[] = BIOMAS.flatMap((bioma) =>
  Array.from({ length: ESTAGIOS_POR_BIOMA }, (_, i) => {
    const estagio = i + 1
    return {
      id: estagioId(bioma.chave, estagio),
      bioma: bioma.chave,
      estagio,
      niveis: niveisDoEstagio(estagio),
      zonaMaxima: zonaMaximaDoEstagio(estagio),
      salas: salasDoEstagio(estagio),
      pesosDeSubBioma: pesosDoEstagio(bioma, estagio),
    }
  }),
)

export const ESTAGIO_POR_ID: Record<string, EstagioDef> = Object.fromEntries(
  ESTAGIOS.map((e) => [e.id, e]),
)
