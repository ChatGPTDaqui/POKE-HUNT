// PH-476 — o sorteio de sala segue a CURVA DE PROFUNDIDADE do estagio.
//
// O QUE ESTE ARQUIVO EXISTE PRA IMPEDIR, e ele ja aconteceu. A curva de
// profundidade (`pesosDoEstagio`, PH-425) e a mecanica central do redesenho: o
// bioma AFUNDA, entao a Praia domina o Marinho 1 e desaparece no Marinho 10.
// Ela era calculada, guardada em `ESTAGIO_POR_ID[...].pesosDeSubBioma`, exibida
// na trilha, anunciada na nota 7.38 — e `sortearSala` ponderava pelo peso
// ESTATICO de `data/biomas.ts`, o mesmo nos dez estagios. Erro de ate 62 pontos
// percentuais, em todos os 120 estagios, sem nada quebrar.
//
// E POR QUE NENHUM TESTE PEGOU. O teste que se chamava exatamente disso
// (`features/hunt/trilhaDeEstagios.test.tsx`, "sai da MESMA funcao que o
// sorteio de sala consome") comparava a TELA com a TABELA — duas pontas que
// sempre concordaram, porque a tela le a tabela. O sorteio, a terceira ponta e
// a unica que decide, nao entrava na comparacao.
//
// Daqui em diante a comparacao e contra o SORTEIO, por amostragem: os casos
// abaixo rodam `sortearSala` de verdade, milhares de vezes, e conferem a
// frequencia observada. Um sorteio que volte a ignorar a curva reprova aqui
// mesmo que a tabela continue perfeita.
import { describe, expect, it } from 'vitest'

import { createRng } from '@/core/rng'
import { BIOMAS, BIOMA_POR_CHAVE } from '@/data/biomas'
import { ESTAGIOS_POR_BIOMA, estagioId, pesosDoEstagio } from '@/data/estagios'
import { STARTER_HUNT_ID } from '@/data/huntSpawnOverrides'
import { distribuicaoDeSala, sortearSala, temSalas } from '@/engine/systems/salaSystem'

/** Frequencia observada de cada sub-bioma em N sorteios de verdade. */
function amostrar(mapId: string, n: number): Record<string, number> {
  const rng = createRng(20260903)
  const conta: Record<string, number> = {}
  for (let i = 0; i < n; i++) {
    const chave = sortearSala(rng, mapId)
    if (chave) conta[chave] = (conta[chave] ?? 0) + 1
  }
  for (const k of Object.keys(conta)) conta[k] /= n
  return conta
}

describe('a distribuicao declarada e a que o sorteio aplica', () => {
  it('bate com a amostragem, nos 120 estagios', () => {
    // O QUE ESTE CASO PROVA, E O QUE ELE NAO PROVA — dito porque a confusao
    // entre os dois e o defeito que este arquivo existe pra reparar.
    //
    // Ele prova que `distribuicaoDeSala` (o que a TELA vai ler) descreve o que
    // `sortearSala` de fato faz. As duas saem da mesma ponderacao de proposito,
    // entao sabotar a ponderacao NAO reprova este caso — ele continua
    // consistente, so consistente com outra coisa. Quem trava a ponderacao ser
    // a CURVA e o caso seguinte.
    //
    // Isso nao o torna vazio: sem ele, `distribuicaoDeSala` poderia divergir do
    // sorteio por um filtro a mais, uma normalizacao errada ou o atalho de "um
    // candidato so", e a tela mentiria de novo — por um motivo novo.
    //
    // 4000 sorteios por estagio: com 4 sub-biomas e a menor fatia real em ~1%,
    // o erro padrao fica em ~0,16 pontos e a tolerancia de 3 pontos nao esconde
    // uma ponderacao errada (a que existia errava de 13 a 62 pontos).
    const errados: string[] = []
    for (const bioma of BIOMAS) {
      for (let e = 1; e <= ESTAGIOS_POR_BIOMA; e++) {
        const mapId = estagioId(bioma.chave, e)
        const declarada = distribuicaoDeSala(mapId)
        const observada = amostrar(mapId, 4000)
        for (const chave of new Set([...Object.keys(declarada), ...Object.keys(observada)])) {
          const dif = Math.abs((declarada[chave] ?? 0) - (observada[chave] ?? 0))
          if (dif > 0.03) {
            errados.push(`${mapId}/${chave}: declarada ${((declarada[chave] ?? 0) * 100).toFixed(1)}% vs observada ${((observada[chave] ?? 0) * 100).toFixed(1)}%`)
          }
        }
      }
    }
    expect(errados).toEqual([])
  })

  it('a distribuicao declarada e a CURVA DO ESTAGIO, e nao o peso estatico', () => {
    // Este e o caso que reprovava antes do conserto. Ele compara a distribuicao
    // do sorteio com `pesosDoEstagio`, e nao com ela mesma.
    const errados: string[] = []
    for (const bioma of BIOMAS) {
      for (let e = 1; e <= ESTAGIOS_POR_BIOMA; e++) {
        const mapId = estagioId(bioma.chave, e)
        const doSorteio = distribuicaoDeSala(mapId)
        const daCurva = pesosDoEstagio(bioma, e)
        for (const chave of Object.keys(daCurva)) {
          const esperado = daCurva[chave]
          const real = doSorteio[chave] ?? 0
          // Peso zero na curva = o sub-bioma NAO existe neste estagio. Essa
          // metade da curva e a que conta a historia de o bioma afundar, e era
          // a que o sorteio mais violava (a Praia com 32% num estagio que
          // declara 0%).
          if (Math.abs(esperado - real) > 0.005) {
            errados.push(`${mapId}/${chave}: curva ${(esperado * 100).toFixed(1)}% vs sorteio ${(real * 100).toFixed(1)}%`)
          }
        }
      }
    }
    expect(errados).toEqual([])
  })

  it('o sub-bioma de peso zero no estagio NUNCA e sorteado', () => {
    // Guarda anti-vacuo primeiro: se nenhum estagio tivesse sub-bioma zerado, o
    // caso passaria sem medir nada. O Marinho 10 zera a Praia e o Campo Aberto
    // 10 zera a Cidade.
    const zerados: { mapId: string; chave: string }[] = []
    for (const bioma of BIOMAS) {
      for (let e = 1; e <= ESTAGIOS_POR_BIOMA; e++) {
        const pesos = pesosDoEstagio(bioma, e)
        for (const [chave, peso] of Object.entries(pesos)) {
          if (peso === 0) zerados.push({ mapId: estagioId(bioma.chave, e), chave })
        }
      }
    }
    expect(zerados.length).toBeGreaterThan(20)

    for (const { mapId, chave } of zerados) {
      expect(distribuicaoDeSala(mapId)[chave], `${mapId}/${chave}`).toBeUndefined()
    }
    // E na amostragem de verdade, num dos casos nomeados.
    expect(amostrar(estagioId('marinho', 10), 3000)['beach']).toBeUndefined()
    expect(amostrar(estagioId('campo_aberto', 10), 3000)['town']).toBeUndefined()
  })

  it('todo estagio continua com pelo menos um sub-bioma sorteavel', () => {
    // O corte de peso zero e o que fecha a curva, e e tambem o unico jeito de
    // um estagio ficar sem sala nenhuma. Sem este caso, um ajuste na curva
    // poderia zerar um bioma inteiro e a hunt ficaria presa no sub-bioma
    // anterior pra sempre — `novaSala` devolve `null` e `armarTransicaoDeSala`
    // repete a sala atual.
    for (const bioma of BIOMAS) {
      for (let e = 1; e <= ESTAGIOS_POR_BIOMA; e++) {
        const mapId = estagioId(bioma.chave, e)
        const d = distribuicaoDeSala(mapId)
        expect(Object.keys(d).length, `${mapId} sem sub-bioma sorteavel`).toBeGreaterThan(0)
        expect(sortearSala(createRng(1), mapId), `${mapId} sorteou nada`).toBeTruthy()
      }
    }
  })

  it('hunt SEM estagio continua no peso estatico do sub-bioma', () => {
    // A inicial, as BOSS, o Lance e o espelho do Pesadelo nao tem curva de
    // profundidade — la `sub.peso` e o peso certo, e nao um fallback. Se a
    // hunt inicial tiver salas, a distribuicao dela tem que sair do peso do
    // bioma; se nao tiver, `distribuicaoDeSala` devolve `{}`.
    if (temSalas(STARTER_HUNT_ID)) {
      const d = distribuicaoDeSala(STARTER_HUNT_ID)
      const soma = Object.values(d).reduce((s, v) => s + v, 0)
      expect(soma).toBeCloseTo(1, 6)
    } else {
      expect(distribuicaoDeSala(STARTER_HUNT_ID)).toEqual({})
    }
  })

  it('a soma da distribuicao e 1 em todo estagio', () => {
    for (const bioma of BIOMAS) {
      for (let e = 1; e <= ESTAGIOS_POR_BIOMA; e++) {
        const mapId = estagioId(bioma.chave, e)
        const soma = Object.values(distribuicaoDeSala(mapId)).reduce((s, v) => s + v, 0)
        expect(soma, mapId).toBeCloseTo(1, 6)
      }
    }
  })

  it('o Marinho afunda no SORTEIO, e nao so na tabela', () => {
    // O caso nomeado, com numero, pra a regressao ser legivel sem rodar a
    // varredura inteira. Praia domina em cima e desaparece no fundo; Leito
    // Oceanico faz o contrario.
    const e1 = distribuicaoDeSala(estagioId('marinho', 1))
    const e10 = distribuicaoDeSala(estagioId('marinho', 10))
    expect(BIOMA_POR_CHAVE['marinho']).toBeTruthy()
    expect(e1['beach']).toBeGreaterThan(0.5)
    expect(e1['seabed']).toBeUndefined()
    expect(e10['beach']).toBeUndefined()
    expect(e10['seabed']).toBeGreaterThan(0.7)
  })
})
