// Quem aparece num estagio, com que chance, e quem pode sair como protetor.
//
// POR QUE ISTO E UM MODULO, E NAO MAIS UMA CONTA DENTRO DA TELA (PH-470)
// -----------------------------------------------------------------------------
// A trilha de estagios listava o elenco por NOME e mais nada — nem face, nem
// chance, nem quem e Guardian. O cartao de hunt antigo mostrava as quatro
// coisas, e a navegacao em dois niveis (PH-431) deixou isso para tras.
//
// A conta em si nao e simples, e e por isso que ela nao pode ficar solta na
// tela: ela tem que sair das MESMAS funcoes que o motor usa pra sortear, e ha
// tres armadilhas no caminho, todas silenciosas.
//
//  1. `ctx.peso` NAO E PROBABILIDADE E NAO SOMA 1. `aparaOTeto`
//     (data/huntSpawnOverrides.ts) so ABAIXA os pesos do topo ate o teto de
//     35% e nao redistribui o que sobrou. Medido: a soma vai de 1,0000 em
//     `campo_aberto_e1/town` a 0,0962 em `subterraneo_e10/cave`. Usar o peso
//     cru como % faria o Subterraneo 10 anunciar "0,61% crobat" onde o valor
//     real e 6,3%. Normalizar pela soma DAQUELE pool e obrigatorio.
//  2. O INDICE DA SALA ENTRA NA CONTA. `contextoDeSpawn` recorta o pool pela
//     janela de nivel da sala (`janelaDaSala`), entao metade do pool de um
//     sub-bioma nem existe na sala 1 — no `marinho_e3/beach` o krabby (teto de
//     nivel 27) cai fora na quarta sala e os outros tres se repartem o espaco
//     dele. A media tem que passar por cada indice.
//  3. QUEM DECIDE O SUB-BIOMA E `distribuicaoDeSala`, e nao o `peso` estatico
//     de `data/biomas.ts`. Foi exatamente essa confusao que fez a curva de
//     profundidade ficar dois meses na tela sem valer no jogo (PH-476).
import { SUB_BIOMA_POR_CHAVE, type BiomaDef } from '@/data/biomas'
import { estagioId, niveisDoEstagio, quantidadeDeSalas } from '@/data/estagios'
import { getEncounter } from '@/data/enemies'
import { SPECIES, type Species } from '@/data/pokes'
import {
  contextoDeSpawn, contextoDoProtetor, distribuicaoDeSala, protetorDaSala,
  type ContextoDeSpawn, type TipoDeProtetor,
} from '@/engine/systems/salaSystem'

export interface EspecieDoEstagio {
  /** Id do ENCONTRO, nao da especie — a hunt do Lance tem tres Dragonites. */
  encounterId: string
  species: Species
  /** Chance de aparicao, em porcentagem (0 a 100). */
  pct: number
  /** Pode sair como Guardian (salas 1 a n-1) nesta selecao. */
  guardian: boolean
  /** Pode sair como Lord (ultima sala) nesta selecao. */
  lord: boolean
}

export interface SubBiomaDoEstagio {
  chave: string
  nome: string
  /** Chance de uma sala deste estagio cair neste sub-bioma, em porcentagem. */
  pct: number
}

/** Uma `SalaAtiva` de mentira, so pra alimentar as funcoes puras do motor. */
function salaDeConsulta(chave: string, indice: number) {
  return { chave, indice, abates: 0, ciclos: 0 }
}

/**
 * A chance NORMALIZADA de cada encontro num (sub-bioma, indice de sala).
 *
 * `null` quando aquele indice nao sorteia nada (pool vazio, ou soma de peso
 * zero) — que nao acontece com os dados de hoje e por isso mesmo nao merece
 * virar `{}` silencioso.
 */
function chancesNaSala(
  mapId: string, faixa: readonly [number, number], chave: string, indice: number,
): { chances: Map<string, number>; ctx: ContextoDeSpawn } | null {
  const ctx = contextoDeSpawn(mapId, [faixa[0], faixa[1]], salaDeConsulta(chave, indice), [])
  const soma = ctx.pool.reduce((s, id) => s + ctx.peso(id), 0)
  if (!(soma > 0)) return null
  const chances = new Map<string, number>()
  for (const id of ctx.pool) chances.set(id, ctx.peso(id) / soma)
  return { chances, ctx }
}

/**
 * Quais encontros podem sair como protetor de um tipo, num (sub-bioma, indice).
 *
 * VAZIO QUANDO NAO HA POOL CURADO, e essa distincao e o ponto.
 * `contextoDoProtetor` degrada quando nenhum chefe do sub-bioma cabe na janela
 * de nivel — medido em 403 de 1815 combinacoes: ai QUALQUER especie da sala pode
 * sair como Guardian, o que e verdade e inutil de marcar. A tag apareceria em
 * todas as 31 linhas do `campo_aberto_e1/town` e nao diria nada.
 *
 * A DETECCAO E POR TAMANHO, E NAO POR REFERENCIA (`doProtetor === ctx`), e a
 * diferenca custou dois casos de teste vermelhos. `contextoDoProtetor` MEMOIZA
 * em `cacheDeProtetor` com chave `mapId|chave|indice|tipo`, entao da segunda
 * chamada em diante ele devolve o objeto guardado — que nao e mais a instancia
 * de `ctx` que ESTA chamada passou, mesmo no caso degenerado. Medido: com o
 * `===`, 1.612 de 2.292 linhas vinham marcadas.
 *
 * Pool do protetor com o tamanho do pool da sala significa "nao ha curadoria
 * aqui" nos dois caminhos de degradacao — o que devolve o `ctx` inteiro e o que
 * completa com os mais raros ate juntar `MINIMO_DE_CANDIDATOS_A_PROTETOR`. E se
 * algum dia um sub-bioma tiver lista de chefe igual ao pool inteiro, nao marcar
 * continua sendo a decisao certa pela mesma razao.
 */
function protetoresNaSala(
  mapId: string, ctx: ContextoDeSpawn, chave: string, indice: number, tipo: TipoDeProtetor,
): string[] {
  const doProtetor = contextoDoProtetor(mapId, ctx, salaDeConsulta(chave, indice), tipo)
  if (doProtetor.pool.length >= ctx.pool.length) return []
  return doProtetor.pool
}

/** Os sub-biomas que ESTE estagio sorteia, com a chance de cada um. */
export function subBiomasDoEstagio(bioma: BiomaDef, estagio: number): SubBiomaDoEstagio[] {
  const distribuicao = distribuicaoDeSala(estagioId(bioma.chave, estagio))
  return Object.entries(distribuicao)
    .map(([chave, p]) => ({
      chave,
      nome: SUB_BIOMA_POR_CHAVE[chave]?.sub.nome ?? chave,
      pct: p * 100,
    }))
    .sort((a, b) => b.pct - a.pct)
}

/**
 * O elenco de um recorte do estagio, com chance e marca de protetor.
 *
 * `chave` nulo = o estagio INTEIRO, ponderado pela chance de cada sub-bioma.
 * `chave` dado = so aquele sub-bioma, como se toda sala caisse nele — que e a
 * pergunta do jogador que quer uma especie especifica ("se eu pegar Praia, qual
 * a chance?").
 *
 * A media e sobre os INDICES de sala, com peso igual: o ciclo passa uma vez por
 * cada indice. Ver a armadilha (2) no cabecalho.
 */
export function elencoDoEstagio(
  bioma: BiomaDef, estagio: number, chave: string | null = null,
): EspecieDoEstagio[] {
  const mapId = estagioId(bioma.chave, estagio)
  const salas = quantidadeDeSalas(mapId)
  const faixa = niveisDoEstagio(estagio)
  const daTela = subBiomasDoEstagio(bioma, estagio)
  const recorte = chave == null ? daTela : daTela.filter((s) => s.chave === chave)
  if (recorte.length === 0) return []
  // Renormaliza: com um sub-bioma so, ele vale 100% do recorte.
  const somaDoRecorte = recorte.reduce((s, x) => s + x.pct, 0)
  if (!(somaDoRecorte > 0)) return []

  const acumulado = new Map<string, number>()
  const guardians = new Set<string>()
  const lords = new Set<string>()

  for (const sub of recorte) {
    const pSub = sub.pct / somaDoRecorte
    for (let indice = 0; indice < salas; indice++) {
      const naSala = chancesNaSala(mapId, faixa, sub.chave, indice)
      if (!naSala) continue
      for (const [id, p] of naSala.chances) {
        acumulado.set(id, (acumulado.get(id) ?? 0) + (pSub / salas) * p)
      }
      // `protetorDaSala` decide se o indice pede Guardian ou Lord — a ultima
      // sala do estagio pede o Lord, e o pool dos dois difere em 665 das 1815
      // combinacoes. Marcar os dois separado e o que deixa a tela dizer "este
      // aqui e Lord", que e a informacao que o jogador procura.
      const tipo = protetorDaSala(salaDeConsulta(sub.chave, indice), mapId)
      if (!tipo) continue
      const alvo = tipo === 'lord' ? lords : guardians
      for (const id of protetoresNaSala(mapId, naSala.ctx, sub.chave, indice, tipo)) alvo.add(id)
    }
  }

  return [...acumulado.entries()]
    .map(([encounterId, p]) => {
      const encontro = getEncounter(encounterId)
      const species = encontro ? SPECIES[encontro.speciesId] : null
      return species
        ? {
          encounterId,
          species,
          pct: p * 100,
          guardian: guardians.has(encounterId),
          lord: lords.has(encounterId),
        }
        : null
    })
    .filter((x): x is EspecieDoEstagio => x != null)
    .sort((a, b) => b.pct - a.pct || a.species.name.localeCompare(b.species.name))
}
