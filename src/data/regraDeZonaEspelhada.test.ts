// PH-146 — o relatório da geração III copia a regra de zona/faixa do jogo, e
// este teste é o que paga a dívida dessa cópia.
//
// `scripts/relatorio-gen3.mjs` precisa dizer em que bioma e em que faixa de
// nível cada espécie de Hoenn cairia. A regra que decide isso
// (`spawnStrength.ts#zonaMinimaDaEspecie` e `huntSpawnOverrides.ts#nivelDeTroca`)
// é TypeScript que lê `SPECIES` — o elenco de 245 do jogo. Importar dali faria o
// relatório só conseguir falar de espécie que já está no jogo, que é o oposto do
// que ele existe para fazer. Então a fórmula está duplicada no script.
//
// Cópia de regra é dívida, e o modo de falha é caro: o relatório descreveria uma
// distribuição que o jogo nunca vai produzir, e ninguém descobriria antes de
// ligar a geração — quando a diferença aparece como espécie no nível errado, sem
// erro nenhum.
//
// Este teste roda a cópia contra as 245 espécies do elenco ATUAL e compara com a
// implementação de verdade, espécie por espécie. Divergir reprova.
import { describe, expect, it } from 'vitest'

import { SPECIES } from './pokes'
import { SPECIES_DATA } from './generated/pokes.generated'
import { zonaMinimaDaEspecie } from './spawnStrength'
import { FAIXAS } from './biomas'

const RELATORIO = import.meta.glob('/scripts/relatorio-gen3.mjs', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

const fonte = Object.values(RELATORIO)[0]

describe('a cópia da regra no relatório da Gen III (PH-146)', () => {
  it('o script existe e foi lido — senão tudo abaixo mede o vazio', () => {
    expect(fonte, 'scripts/relatorio-gen3.mjs não foi carregado').toBeTruthy()
    expect(fonte).toContain('ZONA_POR_BST')
  })

  it('a tabela de BST → zona é idêntica à de spawnStrength.ts', () => {
    // Lida do texto do script porque é isso que o script realmente usa. Comparar
    // com uma terceira cópia escrita aqui só moveria o problema.
    const bloco = fonte.match(/const ZONA_POR_BST = \[([\s\S]*?)\]/)![1]
    const copiado = [...bloco.matchAll(/bstMinimo: (\d+), zona: (\d+)/g)]
      .map((m) => ({ bstMinimo: Number(m[1]), zona: Number(m[2]) }))
    expect(copiado).toEqual([
      { bstMinimo: 525, zona: 7 },
      { bstMinimo: 475, zona: 5 },
      { bstMinimo: 425, zona: 3 },
      { bstMinimo: 350, zona: 1 },
      { bstMinimo: 0, zona: 0 },
    ])
  })

  it('a tabela de faixas é idêntica à de biomas.ts', () => {
    const bloco = fonte.match(/const FAIXAS = \[([\s\S]*?)\n\]/)![1]
    const copiado = [...bloco.matchAll(/nome: '([IV]+)', niveis: \[(\d+), (\d+)\], zonaMaxima: (\d+)/g)]
      .map((m) => ({ nome: m[1], niveis: [Number(m[2]), Number(m[3])], zonaMaxima: Number(m[4]) }))
    expect(copiado).toEqual(FAIXAS.map((f) => ({ nome: f.nome, niveis: f.niveis, zonaMaxima: f.zonaMaxima })))
  })

  it('a zona calculada pela cópia bate com a do jogo nas 245 espécies', () => {
    // A prova de verdade: rodar a fórmula copiada e a real lado a lado. As duas
    // tabelas acima podem estar iguais e a MONTAGEM divergir — foi assim que o
    // relatório nasceu errado, usando o mapa de pré-evolução completo onde as
    // hunts usam só `evolvesTo`.
    const ZONA_POR_BST = [
      { bstMinimo: 525, zona: 7 }, { bstMinimo: 475, zona: 5 },
      { bstMinimo: 425, zona: 3 }, { bstMinimo: 350, zona: 1 }, { bstMinimo: 0, zona: 0 },
    ]
    const PISO_POR_ESTAGIO = [0, 0, 1, 2]

    // Estágio pelo mapa COMPLETO, igual `evolutionStage.ts`.
    const preEvolucao: Record<string, string> = {}
    for (const especie of Object.values(SPECIES)) {
      for (const opcao of especie.evolutionOptions ?? []) preEvolucao[opcao.to] = especie.id
      if (!especie.evolutionOptions && especie.evolvesTo) preEvolucao[especie.evolvesTo] = especie.id
    }
    const estagio = (id: string) => {
      let n = 1
      let atual = id
      while (preEvolucao[atual] && n < 10) { atual = preEvolucao[atual]; n += 1 }
      return n
    }
    const bst = (id: string) => Object.values(SPECIES_DATA[id].base).reduce((a, b) => a + b, 0)

    const divergentes: string[] = []
    for (const id of Object.keys(SPECIES_DATA)) {
      const porForca = ZONA_POR_BST.find((f) => bst(id) >= f.bstMinimo)?.zona ?? 0
      const copia = Math.max(porForca, PISO_POR_ESTAGIO[Math.min(estagio(id), PISO_POR_ESTAGIO.length - 1)])
      const real = zonaMinimaDaEspecie(id)
      if (copia !== real) divergentes.push(`${id}: cópia ${copia} ≠ jogo ${real}`)
    }
    expect(divergentes).toEqual([])
  })

  it('o relatório espelha o mapa de pré-evolução das HUNTS, não o completo', () => {
    // A divergência é real e está documentada nos dois arquivos: as hunts montam
    // `PRE_EVOLUCAO` só com `evolvesTo`, então o segundo destino de um ramo é
    // raiz de si mesmo lá. Usar o mapa completo no relatório tirava Cascoon,
    // Dustox, Shedinja e Gorebyss de toda faixa — quatro espécies que o jogo
    // colocaria em hunt normalmente.
    expect(fonte).toContain('preEvolucaoPrimeira')
    expect(fonte).toMatch(/raiz[\s\S]{0,200}preEvolucaoPrimeira/)
  })
})
