// A traducao do save antigo e o gate de estagio (PH-429/430).
//
// TODA FALHA AQUI E SILENCIOSA E CAI EM CIMA DO JOGADOR, das duas direcoes
// possiveis: traducao que erra pra baixo apaga o mundo que ele abriu (12 biomas
// voltam a ter so o estagio 1), e traducao que erra pra cima entrega conteudo
// que ele nao conquistou. Nenhuma das duas estoura em lugar nenhum — o gate
// simplesmente responde outra coisa.
import { describe, expect, it } from 'vitest'

import { BIOMAS } from './biomas'
import { ESTAGIOS_POR_BIOMA } from './estagios'
import {
  HUNT_DE_REFUGIO,
  ORDEM_LEGADA_DOS_BIOMAS,
  bloqueioDoEstagio,
  comEstagioLimpo,
  estagioLiberado,
  lerProgressoPorBioma,
  maiorEstagioLimpo,
  progressoPorBiomaDefault,
  traduzirMapIdLegado,
} from './progressoDeBioma'

describe('a forma do progresso', () => {
  it('nasce com os 12 biomas em zero', () => {
    const p = progressoPorBiomaDefault()
    expect(Object.keys(p).sort()).toEqual(BIOMAS.map((b) => b.chave).sort())
    expect(Object.values(p).every((v) => v === 0)).toBe(true)
  })

  it('bioma ausente, desconhecido ou com valor podre le como 0', () => {
    expect(maiorEstagioLimpo({}, 'marinho')).toBe(0)
    expect(maiorEstagioLimpo({ marinho: NaN }, 'marinho')).toBe(0)
    expect(maiorEstagioLimpo({ marinho: 4 }, 'bioma_que_nao_existe')).toBe(0)
    // Valor fora da regua e aparado, e nao propagado: um 99 gravado por engano
    // liberaria o Modo Pesadelo inteiro pelo gate de estagio.
    expect(maiorEstagioLimpo({ marinho: 99 }, 'marinho')).toBe(ESTAGIOS_POR_BIOMA)
    expect(maiorEstagioLimpo({ marinho: -3 }, 'marinho')).toBe(0)
  })

  it('comEstagioLimpo nunca regride', () => {
    let p = progressoPorBiomaDefault()
    p = comEstagioLimpo(p, 'marinho', 5)
    expect(p.marinho).toBe(5)
    // A caçada direcionada do redesenho (PH-428) faz o jogador voltar a
    // estagios antigos de proposito. Se a visita reescrevesse o progresso, ela
    // desligaria tudo o que ele abriu.
    p = comEstagioLimpo(p, 'marinho', 1)
    expect(p.marinho).toBe(5)
    p = comEstagioLimpo(p, 'marinho', 5)
    expect(p.marinho).toBe(5)
    p = comEstagioLimpo(p, 'marinho', 6)
    expect(p.marinho).toBe(6)
  })

  it('comEstagioLimpo recusa estagio fora da regua e nao toca outro bioma', () => {
    const p = comEstagioLimpo(progressoPorBiomaDefault(), 'marinho', 11)
    expect(p.marinho).toBe(0)
    const q = comEstagioLimpo(progressoPorBiomaDefault(), 'marinho', 7)
    expect(q.igneo).toBe(0)
  })
})

describe('o gate de estagio', () => {
  it('o estagio 1 de qualquer bioma esta sempre liberado', () => {
    const vazio = progressoPorBiomaDefault()
    for (const bioma of BIOMAS) {
      expect(estagioLiberado(vazio, bioma.chave, 1), bioma.chave).toBe(true)
    }
  })

  it('o estagio N pede o N-1 limpo, e nada mais', () => {
    const p = { ...progressoPorBiomaDefault(), marinho: 3 }
    expect(estagioLiberado(p, 'marinho', 3)).toBe(true)
    expect(estagioLiberado(p, 'marinho', 4)).toBe(true)
    expect(estagioLiberado(p, 'marinho', 5)).toBe(false)
    expect(estagioLiberado(p, 'marinho', 10)).toBe(false)
  })

  it('progresso de um bioma nao libera nada em outro', () => {
    const p = { ...progressoPorBiomaDefault(), marinho: 9 }
    expect(estagioLiberado(p, 'igneo', 2)).toBe(false)
    expect(estagioLiberado(p, 'igneo', 1)).toBe(true)
  })

  it('a mensagem de bloqueio diz QUAL estagio falta', () => {
    const p = { ...progressoPorBiomaDefault(), marinho: 3 }
    expect(bloqueioDoEstagio(p, 'marinho', 4)).toBeNull()
    const msg = bloqueioDoEstagio(p, 'marinho', 7)
    expect(msg).toContain('6')
  })

  it('estagio fora da regua nao passa por engano', () => {
    const p = { ...progressoPorBiomaDefault(), marinho: 10 }
    expect(estagioLiberado(p, 'marinho', 0)).toBe(false)
    expect(estagioLiberado(p, 'marinho', 11)).toBe(false)
    expect(estagioLiberado(p, 'marinho', 2.5)).toBe(false)
  })
})

describe('traducao do save antigo', () => {
  it('faixa1 = N vira estagio 3 nos N primeiros biomas da ordem LEGADA', () => {
    const p = lerProgressoPorBioma({ faixa1: 3, faixa2: 0, faixa3: 0 })
    expect(p).toEqual({
      ...progressoPorBiomaDefault(),
      campo_aberto: 3, subterraneo: 3, marinho: 3,
    })
  })

  it('faixa2 vira estagio 6 e faixa3 vira estagio 9', () => {
    expect(lerProgressoPorBioma({ faixa1: 0, faixa2: 2, faixa3: 0 })).toEqual({
      ...progressoPorBiomaDefault(), campo_aberto: 6, subterraneo: 6,
    })
    expect(lerProgressoPorBioma({ faixa1: 0, faixa2: 0, faixa3: 1 })).toEqual({
      ...progressoPorBiomaDefault(), campo_aberto: 9,
    })
  })

  it('as tres faixas se sobrepoem, e vale o MAIOR estagio', () => {
    // Linha real do banco, medida em 02/09: quem venceu 5 biomas na faixa3
    // tambem os venceu na faixa1 — nao se somam, se sobrepoem.
    const p = lerProgressoPorBioma({ faixa1: 7, faixa2: 6, faixa3: 5 })
    expect(p.campo_aberto).toBe(9)
    expect(p.subterraneo).toBe(9)
    expect(p.marinho).toBe(9)
    expect(p.industrial).toBe(9)
    expect(p.mata).toBe(9)          // 5o da ordem legada: coberto pela faixa3
    expect(p.aguas_interiores).toBe(6) // 6o: faixa2
    expect(p.urbano).toBe(3)        // 7o: so faixa1
    expect(p.gelido).toBe(0)
    expect(p.igneo).toBe(0)
  })

  it('faixa acima do total de biomas nao estoura e nao inventa bioma', () => {
    // Outra linha real: `{"faixa1": 11, "faixa2": 12, "faixa3": 12}`. O 12 e o
    // total de biomas, e ha 11 na faixa1 — as faixas nao vem em ordem
    // crescente no dado de verdade.
    const p = lerProgressoPorBioma({ faixa1: 11, faixa2: 12, faixa3: 12 })
    expect(Object.keys(p).length).toBe(12)
    expect(Object.values(p).every((v) => v === 9)).toBe(true)
  })

  it('NUNCA concede o estagio 10 — ele e conteudo que nao existia', () => {
    // O teto do modo normal era Lv 90 (fim da faixa3). O estagio 10 cobre
    // Lv 91-100. Ninguem pode ter limpado o que nao existia.
    const p = lerProgressoPorBioma({ faixa1: 12, faixa2: 12, faixa3: 12 })
    expect(Math.max(...Object.values(p))).toBe(9)
  })

  it('E IDEMPOTENTE: ler o proprio resultado nao muda mais nada', () => {
    // O caminho de carga roda muitas vezes por sessao, nao uma. Sem esta
    // propriedade o valor derivaria a cada leitura.
    const uma = lerProgressoPorBioma({ faixa1: 7, faixa2: 6, faixa3: 5 })
    const duas = lerProgressoPorBioma(uma)
    const tres = lerProgressoPorBioma(duas)
    expect(duas).toEqual(uma)
    expect(tres).toEqual(uma)
  })

  // PH-440: o TERCEIRO estado, que a PH-429 nao previu e o banco produziu em
  // horas. O objeto abaixo e copia literal de uma linha de `public` em 02/09.
  //
  // COMO ELE NASCE: a migration converteu a linha pro formato novo; o cliente
  // ainda publicado em producao (bundle antigo) leu, fez `{...defaults,
  // ...doBanco}` com `defaults = {faixa1: 0, faixa2: 0, faixa3: 0}` e regravou
  // no flush — deixando as chaves de faixa ZERADAS ao lado das chaves de bioma
  // corretas. Enquanto houver bundle antigo escrevendo na mesma coluna, os dois
  // formatos NAO sao mutuamente exclusivos.
  //
  // O QUE ISSO CAUSAVA: o leitor detectava "tem faixa, logo e legado", traduzia
  // os zeros das faixas e descartava tudo. Uma conta com os 12 biomas fechados
  // voltava zerada, sem erro em lugar nenhum.
  describe('objeto MISTO — os dois formatos na mesma linha (PH-440)', () => {
    const DO_BANCO_02_09 = {
      mata: 9, igneo: 0, aridos: 0, gelido: 0, urbano: 3, marinho: 9,
      sagrado: 0, sombrio: 0, industrial: 9, subterraneo: 9, campo_aberto: 9,
      aguas_interiores: 6,
      faixa1: 0, faixa2: 0, faixa3: 0,
    }

    it('nao perde NENHUM valor de bioma', () => {
      const p = lerProgressoPorBioma(DO_BANCO_02_09)
      expect(p.mata).toBe(9)
      expect(p.marinho).toBe(9)
      expect(p.industrial).toBe(9)
      expect(p.subterraneo).toBe(9)
      expect(p.campo_aberto).toBe(9)
      expect(p.aguas_interiores).toBe(6)
      expect(p.urbano).toBe(3)
      expect(p.igneo).toBe(0)
      expect(p).not.toHaveProperty('faixa1')
    })

    it('continua idempotente no estado misto', () => {
      const uma = lerProgressoPorBioma(DO_BANCO_02_09)
      expect(lerProgressoPorBioma(uma)).toEqual(uma)
    })

    it('quando os dois formatos discordam, vale o MAIOR', () => {
      // Misto com conflito real: a faixa1 diz "os 3 primeiros ate o estagio 3",
      // mas o campo_aberto ja esta em 9 pelo formato novo. Perder o 9 seria
      // regressao; ignorar a faixa seria perder o subterraneo e o marinho.
      const p = lerProgressoPorBioma({ campo_aberto: 9, faixa1: 3 })
      expect(p.campo_aberto).toBe(9)
      expect(p.subterraneo).toBe(3)
      expect(p.marinho).toBe(3)
      expect(p.mata).toBe(0)
    })

    it('so-novo e so-legado continuam valendo com o mesmo caminho', () => {
      // O conserto trocou "escolhe um dos dois caminhos" por "aplica os dois".
      // Os dois casos puros precisam continuar identicos ao que eram.
      expect(lerProgressoPorBioma({ marinho: 4 }).marinho).toBe(4)
      expect(lerProgressoPorBioma({ faixa1: 1, faixa2: 0, faixa3: 0 }).campo_aberto).toBe(3)
    })
  })

  it('entrada podre devolve o default em vez de estourar', () => {
    // Uma carga que falha derruba a sessao inteira. Progresso zerado e
    // recuperavel (o servidor grava de novo ao vencer o proximo Lord); sessao
    // que nao abre nao e.
    for (const podre of [null, undefined, 'texto', 42, [], [1, 2], { lixo: 'x' }]) {
      expect(lerProgressoPorBioma(podre)).toEqual(progressoPorBiomaDefault())
    }
    expect(lerProgressoPorBioma({ marinho: 'sete' })).toEqual(progressoPorBiomaDefault())
  })

  it('chave que nao e bioma e descartada no formato novo', () => {
    const p = lerProgressoPorBioma({ marinho: 4, bioma_inventado: 9 })
    expect(p.marinho).toBe(4)
    expect(p).not.toHaveProperty('bioma_inventado')
  })
})

describe('traducao de mapId legado', () => {
  it('mapId de estagio passa intacto', () => {
    expect(traduzirMapIdLegado('marinho_e7')).toBe('marinho_e7')
    expect(traduzirMapIdLegado('aguas_interiores_e10')).toBe('aguas_interiores_e10')
  })

  it('faixa antiga vira o PRIMEIRO estagio daquela faixa', () => {
    // O primeiro, e nao o ultimo: a faixa nao diz onde dentro dela o jogador
    // estava, e comecar no piso e o erro barato (ele sobe de novo em minutos).
    expect(traduzirMapIdLegado('mata_faixa1')).toBe('mata_e1')
    expect(traduzirMapIdLegado('marinho_faixa2')).toBe('marinho_e4')
    expect(traduzirMapIdLegado('igneo_faixa3')).toBe('igneo_e7')
    expect(traduzirMapIdLegado('aguas_interiores_faixa2')).toBe('aguas_interiores_e4')
  })

  it('bioma inventado com sufixo de faixa cai na hunt de refugio', () => {
    expect(traduzirMapIdLegado('bioma_que_nunca_existiu_faixa1')).toBe(HUNT_DE_REFUGIO)
  })

  it('hunt sem bioma passa intacta, e nulo continua nulo', () => {
    // Um mapId desconhecido chegando em `buildMapWorld` estoura e derruba a
    // sessao — mas trocar `route_46` ou `boss_lance` por refugio seria pior:
    // tiraria o jogador de uma hunt que existe.
    expect(traduzirMapIdLegado('route_46')).toBe('route_46')
    expect(traduzirMapIdLegado('boss_lance')).toBe('boss_lance')
    expect(traduzirMapIdLegado('nightmare_marinho_e7')).toBe('nightmare_marinho_e7')
    expect(traduzirMapIdLegado(null)).toBeNull()
    expect(traduzirMapIdLegado(undefined)).toBeNull()
    expect(traduzirMapIdLegado('')).toBeNull()
  })
})

describe('a ordem legada esta congelada', () => {
  it('tem os 12 biomas, sem duplicar e sem faltar', () => {
    expect(ORDEM_LEGADA_DOS_BIOMAS.length).toBe(BIOMAS.length)
    expect(new Set(ORDEM_LEGADA_DOS_BIOMAS).size).toBe(12)
    for (const chave of ORDEM_LEGADA_DOS_BIOMAS) {
      expect(BIOMAS.some((b) => b.chave === chave), `${chave} nao existe`).toBe(true)
    }
  })

  it('e exatamente a sequencia que os saves antigos gravaram', () => {
    // Trancada literal, e nao derivada de `ORDEM_DOS_BIOMAS`: o numero gravado
    // em `faixa1` e um indice NESTA lista. Se ela mudar, a traducao de um save
    // de ontem passa a apontar pro bioma errado, sem erro nenhum.
    expect(ORDEM_LEGADA_DOS_BIOMAS).toEqual([
      'campo_aberto', 'subterraneo', 'marinho', 'industrial',
      'mata', 'aguas_interiores', 'urbano', 'gelido',
      'aridos', 'sagrado', 'sombrio', 'igneo',
    ])
  })
})
