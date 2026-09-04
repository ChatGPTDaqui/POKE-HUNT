// Gera a tabela de ELENCO e % de aparicao por (sub-bioma, estagio) — PH-502.
//
//   node scripts/derivar-encontros-por-local.mjs     (a fonte, uma vez)
//   node scripts/gerar-elenco-por-estagio.mjs
//
// Saida: `src/data/generated/elencoPorEstagio.generated.ts` (o que vai pro
// bundle) e `scripts/elenco-por-estagio.auditoria.json` (a proveniencia, que
// NAO vai pro bundle).
//
// ---------------------------------------------------------------------------
// O QUE ESTA TABELA SUBSTITUI, E POR QUE
// ---------------------------------------------------------------------------
// A chance de aparicao era o produto de quatro camadas, nenhuma delas autoral:
// peso de sub-bioma, faixa de tier do PokeRogue, desempate pelo `spawn_tier`
// real limitado a 4:1, e o teto de 35%. Medido nas 1.815 salas do jogo, a
// ULTIMA dominava: 1.355 salas (75%) tinham a especie mais comum travada em
// exatamente 35%, e a mediana da fatia do top-1 no jogo inteiro era 35,0%.
//
// O numero que o jogador via era o teto, e nao um desenho.
//
// ---------------------------------------------------------------------------
// A UNIDADE E A VAGA DE ENCONTRO, E ELA E A MESMA PARA AS DUAS FONTES
// ---------------------------------------------------------------------------
// Toda fatia aqui e "que fracao dos encontros deste lugar e esta linha", na
// escala da `GrassMonProbTable` do Gen2 (30/30/20/10/5/4/1) — a mesma escala
// que `scripts/derive-spawn-tiers.js` declara em `_escala`.
//
//   DADO REAL (rb/gsc/emerald)   a fatia E a vaga real do local, direto.
//   POKEROGUE                    o tier vira a vaga equivalente:
//                                COMMON 30, UNCOMMON 20, RARE 10,
//                                SUPER_RARE 5, ULTRA_RARE 1.
//
// Isso responde a objecao que a decisao de 2026-09-04 criou. O dono do projeto
// escolheu MANTER o pool do PokeRogue nos sub-biomas sem analogo real, o que
// poria duas reguas de raridade no mesmo jogo. Convertendo o tier pra vaga, a
// regua e UMA — o que muda entre as duas fontes e de onde vem o numero, e isso
// fica declarado em `origem`, linha por linha.
//
// ---------------------------------------------------------------------------
// A ENTRADA E A LINHA EVOLUTIVA, E NAO A FORMA
// ---------------------------------------------------------------------------
// O dado real da FORMAS (a Rota 101 tem Zigzagoon, nao "a linha do Zigzagoon"),
// mas nenhum jogo real solta forma final selvagem em rota — e o nosso desenho
// solta de proposito, senao 97 especies ficariam sem casa (o motivo esta em
// `gerar-subbiomas.mjs`).
//
// Guardar a fatia na RAIZ e deixar a forma ser resolvida pela janela de nivel
// (`huntSpawnOverrides#trechosDaLinha`) e o que faz as duas coisas conviverem.
// E o que da, de graca, a progressao de forma por estagio: `plains` no estagio
// 1 entrega Zigzagoon, Pidgey e Rattata; no estagio 8, Linoone, Pidgeot e
// Raticate — mesma tabela, mesma fatia, formas diferentes.
//
// ---------------------------------------------------------------------------
// MEDIA ENTRE LOCAIS, E NAO SOMA
// ---------------------------------------------------------------------------
// Um sub-bioma junta muitos locais reais (`grass` junta 22). A fatia de uma
// linha em (sub-bioma, estagio) e a MEDIA da fatia dela sobre os locais daquele
// estagio, contando ZERO nos locais onde ela nao aparece.
//
// Somar seria errado e o erro seria grande: Zigzagoon aparece em 11 rotas de
// Hoenn e Kecleon em 2, e somando o Zigzagoon ficaria com 5x a fatia dele so
// por estar em mais lugares — quando o que a media pergunta e a coisa certa,
// "entrando numa planicie qualquer daquela profundidade, o que aparece?".
// Como a fatia de cada local ja soma 100, a media tambem soma 100.
//
// ---------------------------------------------------------------------------
// OS 10 ESTAGIOS SAO EMITIDOS SEMPRE, INCLUSIVE OS QUE A CURVA ZERA
// ---------------------------------------------------------------------------
// Um sub-bioma so aparece nos estagios em que `data/estagios.ts` lhe da peso
// positivo — `beach` nao existe no estagio 10. Emitir so os ativos economizaria
// bytes, e o gerador teria que REIMPLEMENTAR `pesosPorProfundidade` em JS pra
// saber quais sao (ele nao importa TypeScript).
//
// Uma copia daquela curva aqui divergiria da original no primeiro ajuste, e o
// sintoma seria uma sala sorteando de uma tabela que nao existe. Emitir os 10 e
// deixar o consumidor — que tem a curva de verdade — ignorar o resto e mais
// barato que a copia. O custo esta medido no cabecalho do arquivo gerado.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { subBiomaDoLocal, SEM_ANALOGO_REAL } from './mapa-de-locais.mjs'
import { estagiosDoEncontro, ESTAGIOS } from './nivel-real-para-estagio.mjs'
import {
  lerCatalogo, grafoDeEvolucao, numeroDaDex, elegivel,
} from './lib/linhas-evolutivas.mjs'

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const SAIDA = path.join(RAIZ, 'src/data/generated/elencoPorEstagio.generated.ts')
const AUDITORIA = path.join(RAIZ, 'scripts/elenco-por-estagio.auditoria.json')

/** Vaga equivalente de cada tier selvagem do PokeRogue, na escala do Gen2. */
const VAGA_DO_TIER = { COMMON: 30, UNCOMMON: 20, RARE: 10, SUPER_RARE: 5, ULTRA_RARE: 1 }

/**
 * O MENOR pedaco da tabela que o preenchimento do PokeRogue ocupa, num
 * sub-bioma que TEM dado real e cobertura real completa.
 *
 * O ORCAMENTO DO PREENCHIMENTO NAO E FIXO, E DUAS TENTATIVAS ERRADAS ENSINARAM
 * POR QUE. Elas ficam escritas porque o numero final so faz sentido contra elas.
 *
 * TENTATIVA 1 — somar as vagas do PokeRogue direto com as fatias reais e
 * normalizar. Medido: o dado real ficava com 21,4% da massa em MEDIA (15% na
 * Usina), o oposto da decisao de 2026-09-04 ("a % sai do dado real, curado onde
 * falta"). A causa e assimetria de escala: a fatia real de uma linha e a MEDIA
 * sobre os locais do sub-bioma, enquanto toda linha do PokeRogue entra com vaga
 * cheia — com 12 linhas de preenchimento o bloco somava mais que o dado inteiro.
 *
 * TENTATIVA 2 — dar ao dado real uma fatia FIXA de 80%. Medido: 68 das 330
 * tabelas passavam de 50% numa linha so, e 15 delas batiam exatos 80% —
 * `seabed` nos estagios 7 a 10 virava Wailmer 80%, `grass` nos 6 a 10 virava
 * Tangela 80%. O motivo e que nos estagios ALTOS sobra pouca linha real (a
 * pesca de Emerald e declarada Lv 5-45 e chega no estagio 7; quase todo o resto
 * para antes), e um orcamento fixo entrega os 80% inteiros a quem sobrou.
 *
 * O QUE VALE: O ORCAMENTO E O QUE O DADO REAL NAO COBRE. As fatias reais sao
 * pontos percentuais de verdade — "40% dos encontros deste local sao Wailmer".
 * Quando elas somam 40, o dado real esta dizendo 40, e nao 100: os outros 60
 * pontos sao encontros que ele nao coloca nesta profundidade, e e o PokeRogue
 * que os preenche. Quando somam ~100, sobra so este piso.
 *
 * Assim o peso do dado real se auto-calibra pela cobertura dele, o que e a
 * leitura honesta: cobertura completa manda quase sozinha, cobertura de uma
 * linha vale uma linha.
 *
 * POR QUE UM PISO, E POR QUE 10: sem piso, especie cuja unica casa do PokeRogue
 * e um sub-bioma de cobertura real completa sai do jogo — a falha silenciosa
 * que a guarda de orfas existe pra impedir. Com 10%, uma linha de preenchimento
 * numa tabela de 12 delas fica com ~0,8% da sala, ainda uma ordem de grandeza
 * acima do piso de 0,05% que `hunts.test.ts` cobra.
 */
const PISO_DO_PREENCHIMENTO = 10

/**
 * Casas decimais da fatia no arquivo emitido.
 *
 * Cinco da resolucao de 0,001% numa fatia — duas ordens de grandeza abaixo do
 * piso de 0,05% por especie que `hunts.test.ts` cobra. O residuo do
 * arredondamento (medido: menos de 1e-4 numa tabela de vinte linhas) e devolvido
 * pra maior linha, entao o arquivo soma 1 exatamente como esta escrito.
 */
const CASAS_DA_FATIA = 5

const SPECIES = lerCatalogo()
const grafo = grafoDeEvolucao(SPECIES)

// ---------------------------------------------------------------------------
// Os 33 sub-biomas, lidos de biomas.ts (e nao redigitados)
// ---------------------------------------------------------------------------
const fonteBiomas = fs.readFileSync(path.join(RAIZ, 'src/data/biomas.ts'), 'utf8')
const SUB_BIOMAS = [...fonteBiomas.matchAll(/\{ chave: '([a-z-]+)', nome:/g)].map((m) => m[1])
if (SUB_BIOMAS.length !== 33) {
  throw new Error(`esperado 33 sub-biomas em biomas.ts, achei ${SUB_BIOMAS.length}`)
}

// ---------------------------------------------------------------------------
// Fonte 1 — o dado real, por (sub-bioma, estagio, local, linha)
// ---------------------------------------------------------------------------
const real = JSON.parse(fs.readFileSync(path.join(RAIZ, 'scripts/encontros-por-local.json'), 'utf8')).encontros

// sub -> estagio -> local -> linha -> fatia somada das formas daquela linha
const porLocal = new Map()
// sub -> estagio -> Set(local), para saber o divisor da media
const locaisDoEstagio = new Map()
// proveniencia, so pra auditoria
const proveniencia = new Map()

const foraDoJogo = new Set()
for (const e of real) {
  if (!elegivel(e.especie)) { foraDoJogo.add(e.especie); continue }
  const sub = subBiomaDoLocal(e.geracao, e.local, e.terreno)
  if (sub === null) continue
  if (!SUB_BIOMAS.includes(sub)) throw new Error(`sub-bioma inexistente no mapa: ${sub}`)
  const linha = grafo.raiz(e.especie)
  const local = `${e.geracao}|${e.local}|${e.terreno}`
  for (const estagio of estagiosDoEncontro(e.nivelMin, e.nivelMax)) {
    const chaveEstagio = `${sub}|${estagio}`
    if (!locaisDoEstagio.has(chaveEstagio)) locaisDoEstagio.set(chaveEstagio, new Set())
    locaisDoEstagio.get(chaveEstagio).add(local)
    const chave = `${chaveEstagio}|${local}|${linha}`
    porLocal.set(chave, (porLocal.get(chave) ?? 0) + e.fatia)
    const prov = `${chaveEstagio}|${linha}`
    if (!proveniencia.has(prov)) proveniencia.set(prov, new Set())
    proveniencia.get(prov).add(`${local} (${e.especie} ${e.fatia.toFixed(1)}%)`)
  }
}

/** Fatia media de cada linha em (sub, estagio), pelo dado real. Vazio se nao ha. */
function mediaReal(sub, estagio) {
  const chaveEstagio = `${sub}|${estagio}`
  const locais = locaisDoEstagio.get(chaveEstagio)
  if (!locais?.size) return new Map()
  const soma = new Map()
  for (const [chave, fatia] of porLocal) {
    if (!chave.startsWith(`${chaveEstagio}|`)) continue
    const linha = chave.slice(chave.lastIndexOf('|') + 1)
    soma.set(linha, (soma.get(linha) ?? 0) + fatia)
  }
  const media = new Map()
  for (const [linha, s] of soma) media.set(linha, s / locais.size)
  return media
}

// ---------------------------------------------------------------------------
// Fonte 2 — o PokeRogue, do dado gerado que ja existe
// ---------------------------------------------------------------------------
const fonteSub = fs.readFileSync(path.join(RAIZ, 'src/data/generated/subBiomas.generated.ts'), 'utf8')
const blocoTiers = /SUB_BIOMA_TIERS: SubBiomaTiers = \{([\s\S]*?)\n\};/.exec(fonteSub)
if (!blocoTiers) throw new Error('SUB_BIOMA_TIERS nao encontrado em subBiomas.generated.ts')

// sub -> linha -> melhor vaga (a mais comum entre os membros da linha)
const doPokeRogue = new Map()
for (const bloco of blocoTiers[1].matchAll(/'([a-z-]+)': \{([\s\S]*?)\n  \}/g)) {
  const sub = bloco[1]
  const porLinha = new Map()
  for (const tierBloco of bloco[2].matchAll(/(COMMON|UNCOMMON|RARE|SUPER_RARE|ULTRA_RARE): \[([\s\S]*?)\]/g)) {
    const vaga = VAGA_DO_TIER[tierBloco[1]]
    for (const sp of tierBloco[2].matchAll(/'([a-z0-9_]+)'/g)) {
      if (!elegivel(sp[1])) continue
      const linha = grafo.raiz(sp[1])
      // A linha vale pela vaga MAIS COMUM entre os membros dela naquele lugar:
      // se existe um caminho pelo qual a familia e comum ali, ela e comum.
      porLinha.set(linha, Math.max(porLinha.get(linha) ?? 0, vaga))
    }
  }
  doPokeRogue.set(sub, porLinha)
}
for (const sub of SUB_BIOMAS) {
  if (!doPokeRogue.has(sub)) throw new Error(`sub-bioma sem tier do PokeRogue: ${sub}`)
}

// ---------------------------------------------------------------------------
// Montagem
// ---------------------------------------------------------------------------
// sub -> estagio -> [{ linha, fatia, origem }]
const tabela = {}
const herdados = []
const auditoria = {}

for (const sub of SUB_BIOMAS) {
  tabela[sub] = {}
  // Estagios com dado real proprio, pra saber de quem herdar quando falta.
  const comReal = []
  for (let e = 1; e <= ESTAGIOS; e++) if (mediaReal(sub, e).size > 0) comReal.push(e)

  for (let estagio = 1; estagio <= ESTAGIOS; estagio++) {
    let media = mediaReal(sub, estagio)
    let estagioDaFonte = estagio
    if (media.size === 0 && comReal.length > 0) {
      // HERDA DO ESTAGIO REAL MAIS PROXIMO, e desempata pra BAIXO.
      //
      // Pra baixo porque a forma avanca sozinha pela janela de nivel: herdar do
      // estagio 6 no estagio 9 entrega a forma final da mesma linha, que e o que
      // se quer. Herdar pra cima entregaria a MESMA composicao de um lugar mais
      // fundo num lugar mais raso, sem nada a compensar.
      let melhor = comReal[0]
      for (const c of comReal) {
        const d = Math.abs(c - estagio)
        const dMelhor = Math.abs(melhor - estagio)
        if (d < dMelhor || (d === dMelhor && c < melhor)) melhor = c
      }
      media = mediaReal(sub, melhor)
      estagioDaFonte = melhor
      herdados.push(`${sub}|${estagio} <- ${melhor}`)
    }

    const fatias = new Map()
    const origem = new Map()
    for (const [linha, f] of media) {
      fatias.set(linha, f)
      origem.set(linha, 'real')
    }
    // PREENCHIMENTO COM O POKEROGUE — PREENCHIMENTO, NAO PAR.
    //
    // Linha que o PokeRogue poe neste sub-bioma e que o dado real nao cobre
    // entra pela vaga do tier dela, dentro do orcamento do que o dado real
    // deixou em aberto. Isso impede o modo de falha que este projeto mais teme:
    // uma especie perder a casa em silencio e existir no Bestiario, com sprite,
    // sem nunca aparecer. Nos 11 sub-biomas sem analogo real ele nao e
    // preenchimento, e a fonte — e vale 100%.
    //
    // O tamanho do orcamento e o ponto, e o raciocinio inteiro (com as duas
    // tentativas erradas que o produziram) esta em `PISO_DO_PREENCHIMENTO`.
    const preenchimento = [...(doPokeRogue.get(sub) ?? [])].filter(([linha]) => !fatias.has(linha))
    if (preenchimento.length > 0) {
      const somaReal = [...fatias.values()].reduce((a, b) => a + b, 0)
      const orcamento = somaReal > 0
        ? Math.max(PISO_DO_PREENCHIMENTO, 100 - somaReal)
        : 100
      const somaVagas = preenchimento.reduce((a, [, v]) => a + v, 0)
      for (const [linha, vaga] of preenchimento) {
        fatias.set(linha, (vaga / somaVagas) * orcamento)
        origem.set(linha, 'pokerogue')
      }
    }

    const total = [...fatias.values()].reduce((a, b) => a + b, 0)
    if (!(total > 0)) throw new Error(`(${sub}, ${estagio}) sem nenhuma linha`)
    const linhas = [...fatias]
      .map(([linha, f]) => ({ linha, fatia: f / total, origem: origem.get(linha) }))
      .sort((a, b) => b.fatia - a.fatia || numeroDaDex(SPECIES, a.linha) - numeroDaDex(SPECIES, b.linha))

    // ARREDONDA AQUI, E CORRIGE O RESIDUO NA MAIOR LINHA.
    //
    // O arquivo emitido escreve `fatia.toFixed(CASAS)`, e a soma dos valores
    // ARREDONDADOS nao e 1: medido, `plains` no estagio 2 fechava em 0,99997 com
    // vinte linhas. Normalizar antes de arredondar nao resolve — o erro nasce no
    // arredondamento.
    //
    // Isso importa porque a tabela promete somar 1 e o consumidor conta com
    // isso; um teste com tolerancia frouxa esconderia um erro de verdade no
    // gerador atras do mesmo numero. Arredondar e devolver o residuo pra maior
    // linha faz o arquivo somar 1 EXATAMENTE como esta escrito, e o residuo
    // (menos de 1e-4) e invisivel na maior fatia da tabela.
    const arredondada = linhas.map((x) => ({ ...x, fatia: Number(x.fatia.toFixed(CASAS_DA_FATIA)) }))
    const somaArredondada = arredondada.reduce((a, x) => a + x.fatia, 0)
    const residuo = Number((1 - somaArredondada).toFixed(CASAS_DA_FATIA))
    if (residuo !== 0) {
      arredondada[0].fatia = Number((arredondada[0].fatia + residuo).toFixed(CASAS_DA_FATIA))
    }
    tabela[sub][estagio] = arredondada

    auditoria[`${sub}|${estagio}`] = {
      estagioDaFonte,
      herdado: estagioDaFonte !== estagio,
      linhas: tabela[sub][estagio].map((x) => ({
        linha: x.linha,
        fatia: Number((x.fatia * 100).toFixed(2)),
        origem: x.origem,
        locais: x.origem === 'real'
          ? [...(proveniencia.get(`${sub}|${estagioDaFonte}|${x.linha}`) ?? [])].sort()
          : ['pool do PokeRogue'],
      })),
    }
  }
}

// ---------------------------------------------------------------------------
// Guardas do gerador
// ---------------------------------------------------------------------------
// Toda especie elegivel precisa de casa. Mesma guarda de `gerar-subbiomas.mjs`,
// pelo mesmo motivo: sem ela a especie some do jogo sem erro nenhum.
const linhasComCasa = new Set()
for (const sub of SUB_BIOMAS) for (let e = 1; e <= ESTAGIOS; e++) {
  for (const x of tabela[sub][e]) linhasComCasa.add(x.linha)
}
const orfas = Object.keys(SPECIES).filter((k) => elegivel(k) && !linhasComCasa.has(grafo.raiz(k)))
if (orfas.length) {
  throw new Error(
    `${orfas.length} especie(s) cuja LINHA nao tem casa em nenhum (sub-bioma, estagio): ` +
    `${orfas.join(', ')}.\nSem casa ela existe no Bestiario e com sprite mas nunca aparece — ` +
    'falha silenciosa. Confira o mapa de locais e o pool do PokeRogue.',
  )
}

const soUma = []
let fatiaMaxima = { valor: 0, onde: '' }
for (const sub of SUB_BIOMAS) for (let e = 1; e <= ESTAGIOS; e++) {
  const t = tabela[sub][e]
  if (t.length < 2) soUma.push(`${sub}|${e} (${t.map((x) => x.linha).join(',')})`)
  if (t[0].fatia > fatiaMaxima.valor) fatiaMaxima = { valor: t[0].fatia, onde: `${sub}|${e} ${t[0].linha}` }
  const soma = t.reduce((a, x) => a + x.fatia, 0)
  if (Math.abs(soma - 1) > 1e-9) throw new Error(`(${sub}, ${e}) soma ${soma}, esperado 1`)
}
if (soUma.length) {
  throw new Error(
    `${soUma.length} tabela(s) com uma linha so: ${soUma.join('; ')}.\n` +
    'Tabela de uma linha e uma sala em que uma especie e 100% do spawn — o caso ' +
    '`urbano_e3/dojo` = Meditite 100% que este redesenho existe pra acabar.',
  )
}

// ---------------------------------------------------------------------------
// Emissao
// ---------------------------------------------------------------------------
const nLinhas = SUB_BIOMAS.reduce((a, s) => a + Object.values(tabela[s]).reduce((b, t) => b + t.length, 0), 0)
const nReal = Object.values(auditoria).reduce((a, x) => a + x.linhas.filter((l) => l.origem === 'real').length, 0)

const out = []
out.push('// AUTO-GERADO por `node scripts/gerar-elenco-por-estagio.mjs`. Nao editar a mao —')
out.push('// a proxima geracao sobrescreve.')
out.push('//')
out.push('// QUEM aparece em cada (sub-bioma, estagio) e COM QUE FATIA. Esta tabela e a')
out.push('// fonte unica da chance de aparicao: ela SUBSTITUI a pilha de faixa de tier do')
out.push('// PokeRogue + desempate + colapso + teto de 35% que vigorava antes (ver')
out.push('// data/spawnPorTier.ts e o cabecalho do gerador).')
out.push('//')
out.push(`// ${SUB_BIOMAS.length} sub-biomas x ${ESTAGIOS} estagios = ${SUB_BIOMAS.length * ESTAGIOS} tabelas, ${nLinhas} linhas.`)
out.push(`// ${nReal} linhas vem do dado real dos jogos (rb/gsc/emerald) e ${nLinhas - nReal} do pool`)
out.push('// do PokeRogue, que e a fonte dos 11 sub-biomas sem analogo em Gen I-III:')
out.push(`// ${SEM_ANALOGO_REAL.join(', ')}.`)
out.push('//')
out.push('// A `fatia` e a chance da LINHA EVOLUTIVA, e nao da forma. Qual forma nasce sai')
out.push('// da janela de nivel da sala (huntSpawnOverrides#trechosDaLinha) — e o que faz o')
out.push('// estagio 8 de `plains` entregar Linoone onde o estagio 1 entrega Zigzagoon.')
out.push('//')
out.push('// Cada tabela soma 1 POR CONSTRUCAO. Nao ha teto de fatia aqui, e e de proposito:')
out.push('// o teto antigo mordia em 75% das salas do jogo e era ele, e nao o dado, que')
out.push(`// decidia a chance. A maior fatia desta tabela e ${(fatiaMaxima.valor * 100).toFixed(1)}% (${fatiaMaxima.onde}).`)
out.push('//')
out.push('// A PROVENIENCIA DE CADA LINHA — de que local real e de que vaga ela saiu — fica')
out.push('// em `scripts/elenco-por-estagio.auditoria.json`, que NAO entra no bundle. Ela e')
out.push('// grande, e este modulo esta no grafo da Edge Function: ele e montado a cada cold')
out.push('// start, dentro da janela de flush que e o recurso escasso do projeto.')
out.push("import type { ElencoDoSubBioma, ElencoPorEstagio } from './types';")
out.push('')
out.push('/**')
out.push(' * Toda especie que pode nascer em cada sub-bioma: a uniao das FAMILIAS de todas')
out.push(' * as linhas que aparecem em qualquer estagio dele.')
out.push(' *')
out.push(' * EXISTE SEPARADO DE `SUB_BIOMA_ESPECIES` (subBiomas.generated.ts) porque os dois')
out.push(' * respondem perguntas diferentes e as respostas divergem. Aquele e o pool do')
out.push(' * PokeRogue espalhado por familia; este e o pool do PokeRogue MAIS o que o dado')
out.push(' * real dos jogos coloca aqui. Tangela na Rota 21 e um caso: o dado real a poe no')
out.push(' * relvado e o PokeRogue nao — usar a lista antiga como filtro de forma jogaria')
out.push(' * fora a linha inteira, com a fatia dela e tudo.')
out.push(' *')
out.push(' * Quem consome: `huntSpawnOverrides#montarHunt`, como o conjunto de formas que')
out.push(' * `trechosDaLinha` aceita recortar naquele sub-bioma.')
out.push(' */')
out.push('export const ELENCO_DO_SUB_BIOMA: ElencoDoSubBioma = {')
for (const sub of SUB_BIOMAS) {
  const familias = new Set()
  for (let e = 1; e <= ESTAGIOS; e++) {
    for (const x of tabela[sub][e]) {
      for (const membro of grafo.membros.get(grafo.familia(x.linha)) ?? []) {
        if (elegivel(membro)) familias.add(membro)
      }
    }
  }
  const lista = [...familias].sort((a, b) => numeroDaDex(SPECIES, a) - numeroDaDex(SPECIES, b))
  out.push(`  '${sub}': [${lista.map((s) => `'${s}'`).join(', ')}],`)
}
out.push('};')
out.push('')
out.push('export const ELENCO_POR_ESTAGIO: ElencoPorEstagio = {')
for (const sub of SUB_BIOMAS) {
  out.push(`  '${sub}': {`)
  for (let e = 1; e <= ESTAGIOS; e++) {
    const t = tabela[sub][e].map((x) => `['${x.linha}', ${x.fatia.toFixed(CASAS_DA_FATIA)}]`)
    out.push(`    ${e}: [${t.join(', ')}],`)
  }
  out.push('  },')
}
out.push('};')
out.push('')

fs.writeFileSync(SAIDA, out.join('\n'))
fs.writeFileSync(AUDITORIA, JSON.stringify({
  _origem: 'Gerado por scripts/gerar-elenco-por-estagio.mjs. Proveniencia de cada linha da tabela de elenco. NAO entra no bundle.',
  _herdados: herdados,
  tabelas: auditoria,
}, null, 1))

console.log(
  `${SUB_BIOMAS.length * ESTAGIOS} tabelas | ${nLinhas} linhas (${nReal} do dado real, ${nLinhas - nReal} do PokeRogue) | ` +
  `maior fatia ${(fatiaMaxima.valor * 100).toFixed(1)}% em ${fatiaMaxima.onde} | ` +
  `${herdados.length} pares herdaram de outro estagio | ` +
  `${foraDoJogo.size} especies do dado real fora do spawn selvagem (${[...foraDoJogo].join(', ') || 'nenhuma'})`,
)
