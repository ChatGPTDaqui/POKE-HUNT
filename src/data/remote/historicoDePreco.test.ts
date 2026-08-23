// PH-97: "sem negocio" nao pode virar "preco zero".
//
// O Postgres devolve `null` em `mediana_24h` quando nenhuma negociacao caiu na
// janela — `percentile_disc` sobre conjunto vazio e null, nao zero. Se o
// mapeamento normalizar isso pra 0 (o reflexo obvio, `Number(null) === 0`), a
// tela passa a mostrar um PRECO de zero para todo item que ninguem negociou
// hoje. E um numero em que da pra clicar, e o jogador ancora nele.
//
// Este projeto ja pagou exatamente esse prejuizo: o guard de `isLoading` em
// `ComprarItens.tsx` existe porque o campo de preco nascia em 0 enquanto a
// query estava no ar, "e um numero em que da pra clicar" (comentario original).
//
// VOLUME e o oposto e por isso e testado junto: "ninguem negociou" e volume
// ZERO de verdade, nao ausencia. Zero unidades e um fato; zero de preco e uma
// mentira. O mesmo mapeamento tem que tratar os dois de formas diferentes, e e
// essa assimetria que um refactor bem-intencionado destroi.
import { describe, expect, it } from 'vitest'

import { mapearResumoDeHistorico } from './mercadoRpc'

describe('resumo de historico de preco (PH-97)', () => {
  it('sem linha nenhuma devolve null — nao um resumo de zeros', () => {
    // Item que nunca foi negociado nao tem linha na view agregada. A tela usa
    // este `null` pra decidir entre "sem historico" e mostrar numeros.
    expect(mapearResumoDeHistorico(null)).toBeNull()
  })

  it('mediana ausente sobrevive como null', () => {
    const r = mapearResumoDeHistorico({
      mediana_24h: null,
      mediana_7d: 120,
      volume_24h: 0,
      volume_30d: 340,
      negocios_30d: 12,
    })
    expect(r).not.toBeNull()
    expect(r!.mediana24h).toBeNull()
    expect(r!.mediana7d).toBe(120)
  })

  it('volume ausente vira 0, porque zero unidades e um fato', () => {
    const r = mapearResumoDeHistorico({
      mediana_24h: null, mediana_7d: null,
      volume_24h: null, volume_30d: null, negocios_30d: null,
    })
    expect(r!.volume24h).toBe(0)
    expect(r!.volume30d).toBe(0)
    expect(r!.negocios30d).toBe(0)
  })

  it('mediana ZERO nao e confundida com ausencia', () => {
    // `unit_price > 0` e check de banco, entao mediana 0 nao acontece hoje. O
    // teste existe pra o mapeamento nao ser reescrito com `|| null` (que
    // engoliria o zero) no dia em que essa check mudar — `== null` e o teste
    // certo, `falsy` nao e.
    const r = mapearResumoDeHistorico({
      mediana_24h: 0, mediana_7d: 0, volume_24h: 0, volume_30d: 0, negocios_30d: 0,
    })
    expect(r!.mediana24h).toBe(0)
    expect(r!.mediana7d).toBe(0)
  })

  it('numero que chega como string do PostgREST vira number', () => {
    // `bigint` (sum de quantity) e `numeric` viajam como STRING no JSON do
    // PostgREST — JS nao representa bigint em JSON. Sem o `Number()`, a tela
    // faria `"340" + 1 === "3401"` na primeira conta e o `fmt.format` receberia
    // string.
    const r = mapearResumoDeHistorico({
      mediana_24h: '47', mediana_7d: '51', volume_24h: '18', volume_30d: '340', negocios_30d: '12',
    })
    expect(r!.mediana24h).toBe(47)
    expect(r!.volume30d).toBe(340)
    expect(typeof r!.volume30d).toBe('number')
  })
})
