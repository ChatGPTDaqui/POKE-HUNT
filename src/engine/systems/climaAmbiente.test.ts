// Clima de ambiente (PH-140): o clima que a sala tem sozinha.
//
// Tres coisas aqui falham em SILENCIO se ninguem travar:
//
//   1. O clima re-sortear a cada reconstrucao de mundo. O servidor reconstroi
//      o mundo a cada flush (30-90s); um clima que nao for funcao de
//      `(seed, sala)` pisca no meio do farm e, pior, faz o `authority/`
//      simular sob um clima diferente do que a tela mostrou.
//   2. O clima simplesmente nunca aparecer. Ceu limpo e um resultado legitimo
//      da tabela, entao "nada acontece" e indistinguivel de "a feature nao
//      esta ligada" — dai os testes de DISTRIBUICAO, e nao so de tipo.
//   3. A tabela divergir do PokeRogue, que e a fonte. `biomas.json` e o dado
//      versionado (o `.cache/` de onde ele sai e gitignored), entao e contra
//      ele que a comparacao tem que ser feita.
import { describe, expect, it } from 'vitest'

import { SUB_BIOMA_CLIMA } from '@/data/generated/subBiomas.generated'
import { SALAS_POR_HUNT } from '@/data/biomas'

import { climaAmbienteDaSala, climaDaSala } from './climaAmbiente'
import type { ClimaTipo, SalaAtiva } from '../types'

const BIOMAS_POKEROGUE = import.meta.glob('/scripts/pokerogue/biomas.json', {
  import: 'default',
  eager: true,
}) as Record<string, Record<string, { clima?: Record<string, number> }>>

function sala(chave: string, indice: number, ciclos = 0): SalaAtiva {
  return { chave, indice, abates: 0, ciclos }
}

/** Percorre muitas salas do mesmo sub-bioma e conta o que saiu. */
function distribuicao(chave: string, amostras: number): Map<ClimaTipo | null, number> {
  const contagem = new Map<ClimaTipo | null, number>()
  for (let i = 0; i < amostras; i++) {
    const ciclos = Math.floor(i / SALAS_POR_HUNT)
    const indice = i % SALAS_POR_HUNT
    const clima = climaDaSala(12345, sala(chave, indice, ciclos))
    contagem.set(clima, (contagem.get(clima) ?? 0) + 1)
  }
  return contagem
}

describe('clima de ambiente e derivado, nao guardado (PH-140)', () => {
  it('a mesma sala da sempre o mesmo clima', () => {
    // E ISTO que faz o clima sobreviver ao flush do servidor sem coluna nova em
    // `game_sessions`: o mundo e reconstruido, `climaDaSala` roda de novo e
    // devolve o mesmo resultado.
    for (const indice of [0, 3, 7]) {
      const primeiro = climaDaSala(999, sala('desert', indice))
      for (let i = 0; i < 5; i++) {
        expect(climaDaSala(999, sala('desert', indice))).toBe(primeiro)
      }
    }
  })

  it('sementes diferentes nao produzem a mesma sequencia de climas', () => {
    // Sem isto, o clima seria funcao so da sala — todo jogador do mundo veria
    // exatamente o mesmo tempo na mesma posicao da hunt.
    const comUma = Array.from({ length: 30 }, (_, i) => climaDaSala(1, sala('desert', i % SALAS_POR_HUNT, Math.floor(i / SALAS_POR_HUNT))))
    const comOutra = Array.from({ length: 30 }, (_, i) => climaDaSala(2, sala('desert', i % SALAS_POR_HUNT, Math.floor(i / SALAS_POR_HUNT))))
    expect(comUma).not.toEqual(comOutra)
  })

  it('salas diferentes da MESMA sessao variam de clima', () => {
    // O oposto do teste acima: fixar a semente nao pode congelar o clima da
    // hunt inteira. `desert` tem 3 resultados possiveis; em 40 salas os tres
    // precisam aparecer, senao o sorteio esta preso em alguma coisa.
    const vistos = new Set([...distribuicao('desert', 40).keys()])
    expect(vistos.size).toBeGreaterThanOrEqual(3)
  })

  it('o ciclo entra na identidade da sala', () => {
    // `indice` sozinho volta a 0 a cada 10 salas. Sem `ciclos`, a segunda volta
    // da hunt repetiria a PRIMEIRA inteira, clima por clima.
    //
    // Comparar as duas VOLTAS, e nao uma sala contra as dez seguintes: cada
    // sala ja varia entre si por causa do `indice`, entao a comparacao sala-a-
    // sala passaria mesmo com `ciclos` ignorado.
    const volta = (n: number) =>
      Array.from({ length: SALAS_POR_HUNT }, (_, i) => climaDaSala(7, sala('desert', i, n)))
    expect(volta(1)).not.toEqual(volta(0))
    expect(volta(2)).not.toEqual(volta(0))
  })
})

describe('a tabela por sub-bioma vale de verdade (PH-140)', () => {
  it('`plains` nunca tem clima', () => {
    // Peso `{ limpo: 1 }` no PokeRogue: tem tabela, e ela diz que nao chove.
    for (let i = 0; i < 50; i++) {
      expect(climaDaSala(i, sala('plains', i % SALAS_POR_HUNT))).toBeNull()
    }
  })

  it('`seabed` e sempre chuva e `volcano` sempre sol', () => {
    // Os dois nao tem peso de `limpo` nenhum — sao os unicos casos de clima
    // garantido, e servem de guarda anti-teste-vacuo pro resto do arquivo: se o
    // sorteio estivesse devolvendo `null` sempre, estes dois falhariam.
    for (let i = 0; i < 20; i++) {
      expect(climaDaSala(i, sala('seabed', i % SALAS_POR_HUNT))).toBe('chuva')
      expect(climaDaSala(i, sala('volcano', i % SALAS_POR_HUNT))).toBe('sol')
    }
  })

  it('`snowy-forest` nunca fica de ceu limpo, e cai em neve muito mais que em granizo', () => {
    // Neve 7, granizo 1, limpo 0. E o sub-bioma que prova que neve e granizo
    // sao climas DIFERENTES: se os dois tivessem virado 'granizo' na fusao, o
    // bioma inteiro seria dano continuo.
    const conta = distribuicao('snowy-forest', 400)
    expect(conta.get(null) ?? 0).toBe(0)
    expect(conta.get('neve') ?? 0).toBeGreaterThan(conta.get('granizo') ?? 0)
  })

  it('`desert` sorteia areia perto dos 53% que o peso promete', () => {
    // Peso: limpo 2, areia 8, sol 5 -> 8/15 = 53,3%. Margem larga (10 pontos)
    // de proposito: o teste existe pra pegar "a tabela nao esta sendo lida" e
    // "os pesos foram trocados de lugar", nao pra medir o gerador.
    const amostras = 600
    const conta = distribuicao('desert', amostras)
    const proporcaoAreia = (conta.get('areia') ?? 0) / amostras
    expect(proporcaoAreia).toBeGreaterThan(0.43)
    expect(proporcaoAreia).toBeLessThan(0.63)
  })

  it('`graveyard` produz nevoa — o clima que nenhum golpe cria', () => {
    // Nevoa so existe por ambiente (nao ha "Fog Dance" em geracao nenhuma).
    // Se o sorteio de ambiente quebrar, ela some do jogo inteiro.
    const conta = distribuicao('graveyard', 200)
    expect(conta.get('nevoa') ?? 0).toBeGreaterThan(0)
  })

  it('sub-bioma desconhecido nao explode, so nao tem clima', () => {
    expect(climaDaSala(1, sala('nao-existe', 0))).toBeNull()
    expect(climaDaSala(1, null)).toBeNull()
  })
})

describe('a tabela nao pode divergir do PokeRogue (PH-140)', () => {
  const CLIMA_DO_POKEROGUE: Record<string, string> = {
    NONE: 'limpo', RAIN: 'chuva', SUNNY: 'sol',
    SANDSTORM: 'areia', HAIL: 'granizo', SNOW: 'neve', FOG: 'nevoa',
  }

  it('cada sub-bioma tem os mesmos pesos do `weatherPool` de origem', () => {
    const biomas = Object.values(BIOMAS_POKEROGUE)[0]
    // Guarda anti-teste-vacuo: sem o JSON, o `for` abaixo nao iteraria nada.
    expect(biomas, 'nao consegui ler scripts/pokerogue/biomas.json').toBeDefined()
    expect(Object.keys(SUB_BIOMA_CLIMA).length).toBeGreaterThan(30)

    for (const [chave, pesos] of Object.entries(SUB_BIOMA_CLIMA)) {
      const origem = biomas[chave]?.clima
      expect(origem, `sub-bioma ${chave} nao existe em biomas.json`).toBeDefined()
      const esperado: Record<string, number> = {}
      for (const [tipoPr, peso] of Object.entries(origem!)) {
        const nosso = CLIMA_DO_POKEROGUE[tipoPr]
        expect(nosso, `WeatherType desconhecido: ${tipoPr}`).toBeDefined()
        esperado[nosso] = peso
      }
      expect(pesos, `pesos de ${chave} divergiram da origem`).toEqual(esperado)
    }
  })
})

describe('formato do clima de ambiente (PH-140)', () => {
  it('vem marcado como ambiente e sem contagem de turnos', () => {
    // `origem` e o que separa "volta ao ambiente quando expira" de "expira".
    // `Infinity` porque quem derruba clima de ambiente e a troca de sala, nao o
    // relogio de turno — decrementar `Infinity` nunca chega a zero.
    const clima = climaAmbienteDaSala(1, sala('seabed', 0))
    expect(clima).toEqual({ tipo: 'chuva', turnosRestantes: Infinity, origem: 'ambiente' })
  })

  it('sub-bioma sem clima devolve null, e nao um clima "limpo"', () => {
    // `null` e a ausencia de clima em todo o motor. Um objeto com tipo 'limpo'
    // faria cada leitor precisar conhecer um segundo jeito de dizer a mesma
    // coisa.
    expect(climaAmbienteDaSala(1, sala('plains', 0))).toBeNull()
  })
})
