// PH-470 — a chance que a trilha mostra e a que o jogo sorteia.
//
// O QUE ESTE ARQUIVO MEDE, E POR QUE ELE NAO PODE SER DUAS PONTAS DO MESMO LADO.
// A licao e da PH-476, que aconteceu nesta mesma tela: o teste que devia travar
// a curva de profundidade comparava a TELA com a TABELA — duas pontas que sempre
// concordaram, porque a tela le a tabela — e o SORTEIO, que e quem decide,
// ficava de fora. Passou verde por dois meses sobre uma premissa falsa.
//
// Entao o caso principal aqui AMOSTRA O SORTEIO DE VERDADE, com as mesmas duas
// primitivas que `spawnEnemyAt` usa:
//
//     const chave = sortearSala(rng, mapId)                    // qual sub-bioma
//     const ctx = contextoDeSpawn(mapId, faixa, sala, [])      // qual pool
//     const id = weightedPick(rng, ctx.pool, ctx.peso)         // qual encontro
//
// Ele exercita as tres armadilhas que a agregacao de `elencoDoEstagio` tem que
// acertar, e nenhuma delas grita quando erra:
//
//   1. `ctx.peso` NAO soma 1 (`aparaOTeto` abaixa o topo e nao redistribui). A
//      soma real vai de 1,0000 a 0,0962 dependendo do par. Usar o peso cru como
//      % erra por um fator de 10.
//   2. O INDICE da sala recorta o pool pela janela de nivel — o mesmo sub-bioma
//      tem elenco diferente na primeira e na ultima sala.
//   3. Quem pondera o sub-bioma e `distribuicaoDeSala`, e nao o `peso` estatico
//      de `data/biomas.ts`.
import { describe, expect, it } from 'vitest'

import { weightedPick } from '@/core/random'
import { createRng } from '@/core/rng'
import { BIOMAS, BIOMA_POR_CHAVE } from '@/data/biomas'
import { ESTAGIOS_POR_BIOMA, estagioId, niveisDoEstagio, quantidadeDeSalas } from '@/data/estagios'
import { contextoDeSpawn, sortearSala } from '@/engine/systems/salaSystem'
import { elencoDoEstagio, subBiomasDoEstagio } from './elencoDoEstagio'

/**
 * A frequencia observada de cada encontro, sorteando do jeito que o motor
 * sorteia: uma sala por vez, indice andando em ciclo, encontro por
 * `weightedPick(ctx.pool, ctx.peso)`.
 */
function amostrar(bioma: string, estagio: number, n: number): Map<string, number> {
  const mapId = estagioId(bioma, estagio)
  const faixa = niveisDoEstagio(estagio)
  const salas = quantidadeDeSalas(mapId)
  const rng = createRng(20260903)
  const conta = new Map<string, number>()
  for (let i = 0; i < n; i++) {
    const chave = sortearSala(rng, mapId)
    if (!chave) continue
    // O indice anda em ciclo porque o jogador percorre as salas em ordem — cada
    // indice acontece uma vez por volta, que e o peso igual que a agregacao usa.
    const sala = { chave, indice: i % salas, abates: 0, ciclos: 0 }
    const ctx = contextoDeSpawn(mapId, faixa, sala, [])
    if (ctx.pool.length === 0) continue
    const id = weightedPick(rng, ctx.pool, ctx.peso)
    conta.set(id, (conta.get(id) ?? 0) + 1)
  }
  for (const [k, v] of conta) conta.set(k, (v / n) * 100)
  return conta
}

describe('a chance exibida e a que o sorteio produz', () => {
  it('bate com a amostragem do sorteio real, num estagio de cada bioma', () => {
    // Um estagio por bioma (o 5, no meio da curva, onde todos os sub-biomas
    // tendem a ter peso) x 20.000 sorteios. Tolerancia de 1,5 ponto: com a
    // menor fatia real em ~1%, o erro padrao de 20.000 amostras fica em ~0,07
    // ponto, e os defeitos que este teste existe pra pegar erram por FATOR
    // (peso cru sem normalizar) ou por dezenas de pontos (sub-bioma ponderado
    // errado).
    const errados: string[] = []
    for (const bioma of BIOMAS) {
      const daTela = elencoDoEstagio(BIOMA_POR_CHAVE[bioma.chave], 5)
      const observado = amostrar(bioma.chave, 5, 20000)
      const chaves = new Set([...daTela.map((e) => e.encounterId), ...observado.keys()])
      for (const id of chaves) {
        const naTela = daTela.find((e) => e.encounterId === id)?.pct ?? 0
        const real = observado.get(id) ?? 0
        if (Math.abs(naTela - real) > 1.5) {
          errados.push(`${bioma.chave} e5 ${id}: tela ${naTela.toFixed(2)}% vs sorteio ${real.toFixed(2)}%`)
        }
      }
    }
    expect(errados).toEqual([])
  })

  it('a soma fecha 100% nos 120 estagios', () => {
    // Guarda contra a armadilha (1): com o peso cru, a soma daria 9,6% no
    // Subterraneo 10 e ninguem notaria olhando linha por linha.
    for (const bioma of BIOMAS) {
      for (let e = 1; e <= ESTAGIOS_POR_BIOMA; e++) {
        const soma = elencoDoEstagio(bioma, e).reduce((s, x) => s + x.pct, 0)
        expect(soma, `${bioma.chave} e${e}`).toBeCloseTo(100, 4)
      }
    }
  })

  it('todo estagio tem elenco, e todo sub-bioma sorteavel tambem', () => {
    // Um estagio que abre sem listar POKE nenhum le como bug, e seria.
    for (const bioma of BIOMAS) {
      for (let e = 1; e <= ESTAGIOS_POR_BIOMA; e++) {
        expect(elencoDoEstagio(bioma, e).length, `${bioma.chave} e${e}`).toBeGreaterThan(0)
        for (const sub of subBiomasDoEstagio(bioma, e)) {
          const doSub = elencoDoEstagio(bioma, e, sub.chave)
          expect(doSub.length, `${bioma.chave} e${e} ${sub.chave}`).toBeGreaterThan(0)
          const soma = doSub.reduce((s, x) => s + x.pct, 0)
          expect(soma, `${bioma.chave} e${e} ${sub.chave}`).toBeCloseTo(100, 4)
        }
      }
    }
  })

  it('o recorte de sub-bioma nao e o estagio inteiro filtrado', () => {
    // A diferenca e o assunto da issue: dentro da Praia a chance de cada
    // especie e MAIOR do que no estagio, porque o denominador deixou de incluir
    // o Mar Aberto. Se os dois numeros fossem iguais, a aba nao teria funcao.
    const marinho = BIOMA_POR_CHAVE['marinho']
    const doEstagio = elencoDoEstagio(marinho, 3)
    const daPraia = elencoDoEstagio(marinho, 3, 'beach')
    // Guarda anti-vacuo: a Praia existe neste estagio e nao e o unico sub-bioma.
    expect(subBiomasDoEstagio(marinho, 3).length).toBeGreaterThan(1)
    expect(daPraia.length).toBeGreaterThan(0)

    // MEDE O INVARIANTE QUE E VERDADE, E DUAS TENTATIVAS ERRADAS ENSINARAM QUAL
    // ELE E (PH-503).
    //
    // A versao original pegava `daPraia[0]` — a especie mais comum da Praia — e
    // exigia que ela fosse estritamente maior no recorte. Quebrou com a tabela
    // de elenco da PH-502: a linha do topo e justamente a que bate no
    // `TETO_DE_FATIA` nos DOIS calculos, e 35% nao e maior que 35%.
    //
    // A segunda tentativa exigiu que NINGUEM caisse do estagio pro recorte. Isso
    // e FALSO, e o dado mostrou: `marinho_e3_wailmer` da 24,7% na Praia e 27,7%
    // no estagio. Wailmer e bem mais comum no Mar Aberto, e a media do estagio
    // (que soma P(sub-bioma) x P(especie | sub-bioma) sobre todos os
    // sub-biomas) sobe acima do valor dele na Praia. O argumento do denominador
    // nao vale pra quem TAMBEM mora ao lado.
    //
    // O invariante verdadeiro e sobre quem e EXCLUSIVO do sub-bioma: pra essa
    // especie, `pctNoEstagio = P(Praia) x pctNaPraia` com `P(Praia) < 1`, entao
    // ela e necessariamente maior no recorte. E e exatamente ela que justifica a
    // aba existir.
    const outrosSubs = subBiomasDoEstagio(marinho, 3).filter((s) => s.chave !== 'beach')
    const idsVizinhos = new Set(
      outrosSubs.flatMap((s) => elencoDoEstagio(marinho, 3, s.chave).map((x) => x.encounterId)),
    )
    const exclusivas = daPraia
      .map((x) => ({ praia: x, estagio: doEstagio.find((e) => e.encounterId === x.encounterId) }))
      .filter((p) => p.estagio != null && !idsVizinhos.has(p.praia.encounterId))
    expect(exclusivas.length, 'a Praia nao tem especie exclusiva neste estagio').toBeGreaterThan(0)
    for (const p of exclusivas) {
      expect(p.praia.pct, p.praia.encounterId).toBeGreaterThan(p.estagio!.pct + 1e-9)
    }
  })

  it('sub-bioma de peso zero no estagio nao aparece na lista de abas', () => {
    // A outra metade da curva de profundidade: no fundo do Marinho a Praia
    // sumiu, e oferecer uma aba "Praia 0%" seria anunciar um lugar que aquele
    // estagio nunca entrega.
    const marinho = BIOMA_POR_CHAVE['marinho']
    const doTopo = subBiomasDoEstagio(marinho, 1).map((s) => s.chave)
    const doFundo = subBiomasDoEstagio(marinho, ESTAGIOS_POR_BIOMA).map((s) => s.chave)
    expect(doTopo).toContain('beach')
    expect(doFundo).not.toContain('beach')
    expect(doFundo).toContain('seabed')
  })
})

describe('a tag de protetor', () => {
  it('marca ALGUMAS especies, e nao todas — senao ela nao informa nada', () => {
    // `contextoDoProtetor` degrada devolvendo o proprio `ctx` quando nenhum
    // chefe do sub-bioma cabe na janela de nivel (403 de 1815 combinacoes). Se
    // a agregacao aceitasse esse caso, TODA linha viria marcada.
    let comTag = 0
    let semTag = 0
    for (const bioma of BIOMAS) {
      for (let e = 1; e <= ESTAGIOS_POR_BIOMA; e++) {
        for (const x of elencoDoEstagio(bioma, e)) {
          if (x.guardian || x.lord) comTag += 1
          else semTag += 1
        }
      }
    }
    expect(comTag, 'nenhuma especie marcada como protetor').toBeGreaterThan(50)
    expect(semTag, 'TODA especie marcada — o pool degradado entrou').toBeGreaterThan(comTag)
  })

  it('ha estagio em que o pool do Lord difere do pool do Guardian', () => {
    // 665 das 1815 combinacoes divergem; se a agregacao marcasse os dois com o
    // mesmo conjunto, a tag "LORD" nunca diria nada a mais que "GUARDIAN".
    let divergem = 0
    for (const bioma of BIOMAS) {
      for (let e = 1; e <= ESTAGIOS_POR_BIOMA; e++) {
        const elenco = elencoDoEstagio(bioma, e)
        if (elenco.some((x) => x.lord !== x.guardian)) divergem += 1
      }
    }
    expect(divergem, 'Lord e Guardian sempre com o mesmo pool').toBeGreaterThan(0)
  })

  it('o campo_aberto_e1 nao marca ninguem — o sub-bioma `town` nao tem chefe', () => {
    // Caso nomeado, com o motivo: `SUB_BIOMA_TIERS.town` tem BOSS vazio, entao
    // `contextoDoProtetor` degrada e a marca nao deve entrar. E o cenario exato
    // que produziria 31 tags inuteis numa lista de 31 linhas.
    const doTown = elencoDoEstagio(BIOMA_POR_CHAVE['campo_aberto'], 1, 'town')
    expect(doTown.length).toBeGreaterThan(10)
    expect(doTown.every((x) => !x.guardian && !x.lord)).toBe(true)
  })
})
