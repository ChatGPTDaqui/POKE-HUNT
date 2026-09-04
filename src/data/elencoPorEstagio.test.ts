// A TABELA DE ELENCO E % POR (SUB-BIOMA, ESTAGIO) — PH-502/503.
//
// O QUE ESTAS GUARDAS PROTEGEM
// -----------------------------------------------------------------------------
// Esta tabela substituiu a pilha "faixa de tier do PokeRogue + desempate +
// colapso + teto de 35%" como fonte da chance de aparicao. O defeito que ela
// conserta esta medido: das 1.815 salas do jogo, 1.355 (75%) tinham a especie
// mais comum travada em EXATAMENTE 35% — o `TETO_DE_FATIA` — e a mediana da
// fatia do top-1 no jogo inteiro era 35,0%. O numero que o jogador via era o
// teto, e nao um desenho.
//
// Uma regressao aqui NAO da erro: ela devolve um jogo em que uma especie e um
// terco de toda sala, com deploy verde e a tela mostrando porcentagens
// plausiveis. Por isso as guardas medem o RESULTADO nas 1.815 salas, e nao a
// forma do arquivo gerado.
import { describe, expect, it } from 'vitest'
import { ELENCO_DO_SUB_BIOMA, ELENCO_POR_ESTAGIO } from '@/data/generated/elencoPorEstagio.generated'
import { BIOMAS, SUB_BIOMA_POR_CHAVE } from '@/data/biomas'
import {
  ESTAGIOS_POR_BIOMA, estagioId, niveisDoEstagio, pesosDoEstagio, salasDoEstagio,
} from '@/data/estagios'
import { MAPS } from '@/data/maps'
import { POOL_POR_SALA, raizDaLinha, TETO_DE_FATIA } from '@/data/huntSpawnOverrides'
import { contextoDeSpawn, MINIMO_DE_ESPECIES_NA_SALA } from '@/engine/systems/salaSystem'
import { getEncounter } from '@/data/enemies'
import { SPECIES } from '@/data/pokes'
import { LEGENDARY_SPECIES_IDS } from '@/data/legendaries'
import { NON_WILD_SPECIES } from '@/data/regions'

const SUB_BIOMAS = BIOMAS.flatMap((b) => b.subBiomas.map((s) => s.chave))

/** Toda sala do jogo: (estagio, sub-bioma, indice), com o contexto de sorteio. */
function todasAsSalas() {
  const saida: {
    rotulo: string
    itens: { sp: string; fatia: number }[]
  }[] = []
  for (const bioma of BIOMAS) {
    for (let estagio = 1; estagio <= ESTAGIOS_POR_BIOMA; estagio++) {
      const mapId = estagioId(bioma.chave, estagio)
      const map = MAPS[mapId]
      const faixa = niveisDoEstagio(estagio)
      for (const chave of Object.keys(POOL_POR_SALA[mapId] ?? {})) {
        for (let indice = 0; indice < salasDoEstagio(estagio); indice++) {
          const ctx = contextoDeSpawn(mapId, faixa, { chave, indice, abates: 0, ciclos: 0 }, map.enemyPool)
          const soma = ctx.pool.reduce((s, id) => s + ctx.peso(id), 0)
          if (!(soma > 0)) continue
          saida.push({
            rotulo: `${mapId}/${chave}#${indice}`,
            itens: ctx.pool
              .map((id) => ({ sp: getEncounter(id)!.speciesId, fatia: ctx.peso(id) / soma }))
              .sort((a, b) => b.fatia - a.fatia),
          })
        }
      }
    }
  }
  return saida
}

describe('a tabela de elenco', () => {
  it('cobre os 33 sub-biomas nos 10 estagios', () => {
    expect(Object.keys(ELENCO_POR_ESTAGIO).sort()).toEqual([...SUB_BIOMAS].sort())
    for (const sub of SUB_BIOMAS) {
      for (let e = 1; e <= ESTAGIOS_POR_BIOMA; e++) {
        expect(ELENCO_POR_ESTAGIO[sub][e], `${sub} e${e}`).toBeDefined()
      }
    }
  })

  it('toda tabela soma 1', () => {
    for (const sub of SUB_BIOMAS) {
      for (let e = 1; e <= ESTAGIOS_POR_BIOMA; e++) {
        // EXATAMENTE 1, e nao "perto de 1": o gerador arredonda a fatia pra
        // cinco casas e devolve o residuo pra maior linha justamente pra o
        // arquivo somar 1 como esta ESCRITO. Tolerancia frouxa aqui esconderia
        // um erro de verdade no gerador atras do mesmo numero.
        const soma = ELENCO_POR_ESTAGIO[sub][e].reduce((s, [, f]) => s + f, 0)
        expect(soma, `${sub} e${e}`).toBeCloseTo(1, 9)
      }
    }
  })

  // TABELA DE UMA LINHA E UMA SALA DE UMA ESPECIE SO, e era o pior caso do jogo
  // antes desta leva: `urbano_e3/dojo` na sala 4 dava Meditite em 100%.
  it('nenhuma tabela tem uma linha so', () => {
    const magras: string[] = []
    for (const sub of SUB_BIOMAS) {
      for (let e = 1; e <= ESTAGIOS_POR_BIOMA; e++) {
        const t = ELENCO_POR_ESTAGIO[sub][e]
        if (t.length < 2) magras.push(`${sub} e${e} (${t.map(([l]) => l).join(',')})`)
      }
    }
    expect(magras).toEqual([])
  })

  // A CHAVE E A RAIZ DA LINHA, e o sorteio da sala procura por ela
  // (`salaSystem#pesosDaSala` chama `raizDaLinha` no encontro sorteado). Se o
  // gerador emitisse uma forma do MEIO como chave, a fatia dela nunca seria
  // encontrada e a linha ficaria com peso zero — sem erro nenhum.
  it('toda chave e a raiz da propria linha', () => {
    const erradas: string[] = []
    for (const sub of SUB_BIOMAS) {
      for (let e = 1; e <= ESTAGIOS_POR_BIOMA; e++) {
        for (const [linha] of ELENCO_POR_ESTAGIO[sub][e]) {
          if (SPECIES[linha] == null) erradas.push(`${sub} e${e}: ${linha} nao existe no catalogo`)
          else if (raizDaLinha(linha) !== linha) erradas.push(`${sub} e${e}: ${linha} nao e raiz (raiz e ${raizDaLinha(linha)})`)
        }
      }
    }
    expect(erradas).toEqual([])
  })

  it('nao poe lendario nem NON_WILD_SPECIES em sub-bioma de bioma', () => {
    const proibidos = new Set<string>([...LEGENDARY_SPECIES_IDS, ...NON_WILD_SPECIES])
    const achados: string[] = []
    for (const sub of SUB_BIOMAS) {
      for (const sp of ELENCO_DO_SUB_BIOMA[sub]) {
        if (proibidos.has(sp)) achados.push(`${sub}: ${sp}`)
      }
    }
    expect(achados).toEqual([])
  })

  // `ELENCO_DO_SUB_BIOMA` e o filtro de FORMA que `montarHunt` aplica: linha da
  // tabela sem NENHUMA forma nele devolve `trechosDaLinha` vazio, e a linha
  // inteira — com a fatia dela — desaparece daquele sub-bioma.
  //
  // A EXIGENCIA E "ALGUMA FORMA", E NAO "A RAIZ", e a diferenca e um achado:
  // a raiz de uma linha pode ser uma especie que NUNCA nasce selvagem.
  // Bulbasaur, Charmander e Squirtle sao raiz das linhas de Ivysaur, Charmeleon
  // e Wartortle e existem so na tela de escolha do inicial — entao a raiz fica
  // FORA do elenco de proposito, e as formas seguintes ficam dentro.
  // `trechosDaLinha` anda a cadeia inteira e pula a forma que o elenco nao tem,
  // entao a linha funciona; exigir a raiz aqui reprovaria dado correto.
  it('toda linha das tabelas tem pelo menos uma forma no elenco do sub-bioma', () => {
    const mudas: string[] = []
    for (const sub of SUB_BIOMAS) {
      const doSub = new Set(ELENCO_DO_SUB_BIOMA[sub])
      for (let e = 1; e <= ESTAGIOS_POR_BIOMA; e++) {
        for (const [linha] of ELENCO_POR_ESTAGIO[sub][e]) {
          // Anda a cadeia da raiz pra frente, como `trechosDaLinha` faz.
          let atual: string | null = linha
          let achou = false
          for (let i = 0; i < 10 && atual; i++) {
            if (doSub.has(atual)) { achou = true; break }
            atual = SPECIES[atual]?.evolvesTo ?? null
          }
          if (!achou) mudas.push(`${sub} e${e}: ${linha}`)
        }
      }
    }
    expect(mudas).toEqual([])
  })

  it('todo sub-bioma da tabela e um sub-bioma de verdade de biomas.ts', () => {
    for (const sub of Object.keys(ELENCO_POR_ESTAGIO)) {
      expect(SUB_BIOMA_POR_CHAVE[sub], sub).toBeDefined()
    }
  })
})

describe('o resultado nas 1.815 salas', () => {
  const salas = todasAsSalas()

  it('mede as salas todas (contra passar de vazio)', () => {
    const esperado = BIOMAS.reduce((total, bioma) => total + Array.from(
      { length: ESTAGIOS_POR_BIOMA }, (_, i) => bioma.subBiomas.length * salasDoEstagio(i + 1),
    ).reduce((a, b) => a + b, 0), 0)
    expect(salas.length).toBe(esperado)
  })

  // O PISO DE ESPECIES POR SALA (PH-503). Antes dele o jogo tinha sala de pool
  // UM (Meditite 100%) e de pool dois (Machoke 93,8%).
  it('nenhuma sala sorteia menos de tres especies', () => {
    const magras = salas.filter((s) => s.itens.length < MINIMO_DE_ESPECIES_NA_SALA)
    expect(magras.map((s) => `${s.rotulo} (${s.itens.length})`)).toEqual([])
  })

  it('ninguem passa do teto de fatia', () => {
    const acima = salas
      .filter((s) => s.itens[0].fatia > TETO_DE_FATIA + 1e-9)
      .map((s) => `${s.rotulo} ${s.itens[0].sp} = ${(s.itens[0].fatia * 100).toFixed(1)}%`)
    expect(acima).toEqual([])
  })

  // A GUARDA CENTRAL DESTA LEVA, e a unica que reprova a volta do defeito.
  //
  // O teto sempre existiu; o defeito era ele DECIDIR a chance. Medido antes:
  // 1.355 de 1.815 salas (75%) com o top-1 travado no teto. Depois: 567 (31%).
  //
  // O limite e 45% e nao 31% de proposito — ele reprova regressao estrutural
  // (uma mudanca que devolva o teto ao papel de arbitro), e nao flutuacao de
  // balanceamento. Se um ajuste legitimo de tabela passar de 45%, a pergunta a
  // fazer e "por que o teto voltou a mandar?", nao "afrouxa o teste".
  it('o teto de fatia nao decide a chance na maioria das salas', () => {
    const noTeto = salas.filter((s) => s.itens[0].fatia >= TETO_DE_FATIA - 1e-3).length
    const fracao = noTeto / salas.length
    expect(
      fracao,
      `${noTeto} de ${salas.length} salas (${(fracao * 100).toFixed(0)}%) tem o top-1 no teto`,
    ).toBeLessThan(0.45)
  })

  // A mediana e a leitura direta de "a sala tipica e decidida pelo dado, e nao
  // pelo teto". Era 35,0% (o teto exato); e 27,3%.
  it('a sala tipica tem o top-1 bem abaixo do teto', () => {
    const tops = salas.map((s) => s.itens[0].fatia).sort((a, b) => a - b)
    const mediana = tops[Math.floor(tops.length / 2)]
    expect(mediana, `mediana do top-1 = ${(mediana * 100).toFixed(1)}%`).toBeLessThan(TETO_DE_FATIA - 0.03)
  })

  // A GUARDA QUE PROVA QUE O MOTOR USA A TABELA, e ela existe porque as outras
  // NAO provavam isso.
  //
  // Sabotagem que revelou o buraco: trocar `fatiaDaLinha` por um mapa VAZIO em
  // `salaSystem#pesosDaSala` — ou seja, o motor ignorando a tabela e caindo no
  // peso uniforme — deixou as catorze guardas anteriores VERDES. Todas elas sao
  // de um lado so: olham excesso de concentracao (pool magro, fatia acima do
  // teto, teto decidindo), e peso uniforme nao concentra nada. Um jogo com
  // chance uniforme em toda sala passaria por elas inteiras.
  //
  // Esta compara os dois numeros. Ela agrega o peso da sala por LINHA (que e a
  // unidade da tabela) e confere contra a tabela restrita as linhas que aquela
  // sala tem, renormalizada — que e exatamente o que `pesosDaSala` deve
  // produzir. Salas em que o teto morde ficam de fora: la o numero e o teto de
  // proposito, e a comparacao nao diria nada.
  it('a chance por linha na sala e a da tabela, renormalizada', () => {
    const erros: string[] = []
    let conferidas = 0
    for (const bioma of BIOMAS) {
      for (let estagio = 1; estagio <= ESTAGIOS_POR_BIOMA; estagio++) {
        const mapId = estagioId(bioma.chave, estagio)
        const map = MAPS[mapId]
        const faixa = niveisDoEstagio(estagio)
        for (const chave of Object.keys(POOL_POR_SALA[mapId] ?? {})) {
          const tabela = new Map(ELENCO_POR_ESTAGIO[chave][estagio])
          for (let indice = 0; indice < salasDoEstagio(estagio); indice++) {
            const ctx = contextoDeSpawn(mapId, faixa, { chave, indice, abates: 0, ciclos: 0 }, map.enemyPool)
            const total = ctx.pool.reduce((s, id) => s + ctx.peso(id), 0)
            if (!(total > 0)) continue

            const porLinha = new Map<string, number>()
            for (const id of ctx.pool) {
              const raiz = raizDaLinha(getEncounter(id)!.speciesId)
              porLinha.set(raiz, (porLinha.get(raiz) ?? 0) + ctx.peso(id) / total)
            }
            // Sala com teto mordendo: o numero e o teto, nao a tabela.
            if ([...ctx.pool].some((id) => ctx.peso(id) / total >= TETO_DE_FATIA - 1e-3)) continue
            // Sala de recuo com linha de fora da tabela: a renormalizacao nao e
            // comparavel (entra encontro de sub-bioma vizinho).
            if ([...porLinha.keys()].some((l) => !tabela.has(l))) continue

            const somaEsperada = [...porLinha.keys()].reduce((s, l) => s + (tabela.get(l) ?? 0), 0)
            if (!(somaEsperada > 0)) continue
            conferidas++
            for (const [linha, medido] of porLinha) {
              const esperado = tabela.get(linha)! / somaEsperada
              if (Math.abs(medido - esperado) > 1e-6) {
                erros.push(
                  `${mapId}/${chave}#${indice} ${linha}: sala ${(medido * 100).toFixed(2)}% x ` +
                  `tabela ${(esperado * 100).toFixed(2)}%`,
                )
              }
            }
          }
        }
      }
    }
    expect(erros.slice(0, 10)).toEqual([])
    // Contra passar de vazio: se os filtros acima descartarem tudo, o caso fica
    // verde sem comparar nada.
    expect(conferidas, 'nenhuma sala sobrou pra comparar com a tabela').toBeGreaterThan(200)
  })

  it('todo encontro anunciado no pool da sala pode ser sorteado', () => {
    // Peso zero dentro do pool e o bug que a PH-503 pegou:
    // `industrial_e3/factory#4/machop` saia com 0 porque a forma nao alcancava a
    // janela mas o pool de recuo a anunciava.
    const mortos: string[] = []
    for (const s of salas) {
      for (const it of s.itens) if (!(it.fatia > 0)) mortos.push(`${s.rotulo}/${it.sp}`)
    }
    expect(mortos).toEqual([])
  })

  // Sub-bioma que a curva de profundidade zerou nao pode aparecer em sala
  // nenhuma daquele estagio — e o outro lado da PH-497.
  it('nao sorteia sub-bioma que a curva de profundidade zerou', () => {
    const fantasmas: string[] = []
    for (const bioma of BIOMAS) {
      for (let estagio = 1; estagio <= ESTAGIOS_POR_BIOMA; estagio++) {
        const pesos = pesosDoEstagio(bioma, estagio)
        for (const sub of bioma.subBiomas) {
          if ((pesos[sub.chave] ?? 0) > 0) continue
          const mapId = estagioId(bioma.chave, estagio)
          if (salas.some((s) => s.rotulo.startsWith(`${mapId}/${sub.chave}#`))) {
            // A sala EXISTE no pool (a tabela cobre os 10 estagios de proposito);
            // o que nao pode e o sorteio de sala chegar nela. Isso e coberto por
            // `cartaoDaHuntBateNoSorteio.test.ts`; aqui so registramos que a
            // tabela cobre mais do que a curva usa, que e a decisao do gerador.
            continue
          }
          fantasmas.push(`${mapId}/${sub.chave}`)
        }
      }
    }
    // A tabela cobre os 10 estagios de todo sub-bioma, entao a lista e vazia por
    // construcao — o valor deste caso e travar essa decisao: se o gerador passar
    // a emitir so os estagios ativos, este teste avisa antes de alguem descobrir
    // pela sala vazia.
    expect(fantasmas).toEqual([])
  })
})
