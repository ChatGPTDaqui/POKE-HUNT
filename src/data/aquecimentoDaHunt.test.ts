// PH-400: o que a hunt precisa DEPOIS do primeiro frame chega antes de ele ser
// preciso.
//
// O pedido era "nada carrega durante a jogabilidade". O que ainda carregava, e o
// peso medido em 01/09:
//
//   fundo da proxima sala   ~2,9 MB por arte (30 artes, 85,6 MB no total)
//   arte por golpe          164 arquivos, 5,3 MB
//   animacao de captura     8 arquivos, 170 kB
//
// A tentacao obvia — jogar tudo no preload da entrada — custaria ~9 MB antes de a
// cena aparecer nos biomas de 4 sub-biomas, e trocaria "o mapa carrega no meio do
// jogo" por "o botao Entrar demora dez segundos". Este arquivo tranca as tres
// decisoes que evitam isso: a LISTA e so o que falta, `saveData` desliga, e sair
// da hunt cancela.
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'

import {
  fundosDasOutrasSalas, tirasDosGolpesDoTime, aquecerHuntEmSegundoPlano, pararAquecimento,
  preloadHunt, tiposDeGolpe, battleSpriteUrlsFor,
} from './preload'
import { SUB_BIOMA_POR_CHAVE } from './biomas'
import { STARTER_HUNT_ID } from './huntSpawnOverrides'
import { getMap } from './maps'
import { getEncounter } from './enemies'
import { todasAsTirasDeVfx, TIRA_POR_ELEMENTO } from './vfxTiras'

vi.mock('@/render/sprites', () => ({
  primeImage: vi.fn(() => Promise.resolve()),
}))

const { primeImage } = await import('@/render/sprites')
const chamadas = () => (primeImage as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])

/** `navigator.connection` nao existe em jsdom — este helper o injeta. */
function comConexao(valor: { saveData?: boolean; effectiveType?: string } | undefined) {
  Object.defineProperty(navigator, 'connection', { value: valor, configurable: true })
}

beforeEach(() => {
  vi.clearAllMocks()
  comConexao(undefined)
})
afterEach(() => {
  pararAquecimento()
  comConexao(undefined)
})

describe('a lista de fundos a aquecer (PH-400)', () => {
  it('traz as OUTRAS salas do bioma, sem a atual', () => {
    // `grass` fica no campo aberto, que tem 4 sub-biomas.
    const entrada = SUB_BIOMA_POR_CHAVE['grass']
    const atual = entrada.sub.bg?.image ?? entrada.bioma.bg.image
    const outras = fundosDasOutrasSalas({ chave: 'grass' })

    expect(outras.length).toBeGreaterThan(0)
    expect(outras, 'a arte da sala atual ja chegou no preload de entrada').not.toContain(atual)
  })

  it('nao repete arte — sub-bioma sem imagem propria cai na do bioma', () => {
    const outras = fundosDasOutrasSalas({ chave: 'grass' })
    expect(new Set(outras).size).toBe(outras.length)
  })

  it('sem sala (hunt sem sistema de salas) nao ha nada a aquecer', () => {
    // Hunt inicial, as 11 BOSS, o Lance e o treino nao tem sala: aquecer o bioma
    // inteiro ali seria baixar arte que aquela hunt nunca mostra.
    expect(fundosDasOutrasSalas(null)).toEqual([])
    expect(fundosDasOutrasSalas({ chave: 'chave-que-nao-existe' })).toEqual([])
  })
})

describe('a lista de tiras de golpe (PH-400)', () => {
  it('sai dos golpes que a especie do time aprende, e nao das 164', () => {
    const tiras = tirasDosGolpesDoTime(['charmander'])
    // Uma especie conhece uma dezena de golpes; a pasta tem 164 arquivos.
    expect(tiras.length).toBeGreaterThan(0)
    expect(tiras.length).toBeLessThan(60)
    expect(tiras.every((u) => u.includes('move-vfx'))).toBe(true)
  })

  it('especie desconhecida nao estoura', () => {
    expect(tirasDosGolpesDoTime(['nao-existe'])).toEqual([])
  })

  it('time com duas especies nao repete tira compartilhada', () => {
    const tiras = tirasDosGolpesDoTime(['charmander', 'charmeleon'])
    expect(new Set(tiras).size).toBe(tiras.length)
  })
})

describe('quando o aquecimento NAO acontece (PH-400)', () => {
  it('`saveData` ligado nao baixa nada', async () => {
    comConexao({ saveData: true, effectiveType: '4g' })
    aquecerHuntEmSegundoPlano({ chave: 'grass' }, ['charmander'])
    await vi.waitFor(() => expect(true).toBe(true))

    // O jogador pediu economia de dados: aquecer ~9 MB de arte que ele pode nem
    // ver e escolher o solavanco dele pelo bolso dele.
    expect(chamadas()).toHaveLength(0)
  })

  it.each(['slow-2g', '2g'])('conexao %s nao baixa nada', async (effectiveType) => {
    comConexao({ effectiveType })
    aquecerHuntEmSegundoPlano({ chave: 'grass' }, ['charmander'])
    await vi.waitFor(() => expect(true).toBe(true))

    // Nessa banda o aquecimento nao chegaria antes da troca de sala de qualquer
    // jeito, e ainda roubaria o que a cena precisa agora.
    expect(chamadas()).toHaveLength(0)
  })

  it('sem `navigator.connection` (Safari, Firefox) AQUECE — o caso comum', async () => {
    comConexao(undefined)
    aquecerHuntEmSegundoPlano({ chave: 'grass' }, [])
    await vi.waitFor(() => expect(chamadas().length).toBeGreaterThan(0))
  })
})

describe('o aquecimento e sequencial e cancelavel (PH-400)', () => {
  it('baixa UMA por vez, e nao todas de uma vez', async () => {
    // Em paralelo, seis downloads de 2,9 MB disputam banda com a arte que a cena
    // esta desenhando agora.
    let resolver: (() => void) | null = null
    ;(primeImage as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise<void>((r) => { resolver = r }),
    )

    aquecerHuntEmSegundoPlano({ chave: 'grass' }, [])
    await vi.waitFor(() => expect(chamadas().length).toBe(1))

    // Enquanto a primeira nao resolve, a segunda nao comeca.
    expect(chamadas()).toHaveLength(1)
    resolver!()
    await vi.waitFor(() => expect(chamadas().length).toBe(2))
  })

  it('`pararAquecimento` interrompe a fila', async () => {
    let resolver: (() => void) | null = null
    ;(primeImage as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise<void>((r) => { resolver = r }),
    )

    aquecerHuntEmSegundoPlano({ chave: 'grass' }, [])
    await vi.waitFor(() => expect(chamadas().length).toBe(1))

    pararAquecimento()
    resolver!()
    // Passada a primeira, a fila nao continua: o jogador saiu da hunt e o resto
    // e arte de um bioma que ele nao esta mais vendo.
    await new Promise((r) => setTimeout(r, 10))
    expect(chamadas()).toHaveLength(1)
  })

  it('entrar noutra hunt cancela o aquecimento anterior', async () => {
    let resolver: (() => void) | null = null
    ;(primeImage as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise<void>((r) => { resolver = r }),
    )

    aquecerHuntEmSegundoPlano({ chave: 'grass' }, [])
    await vi.waitFor(() => expect(chamadas().length).toBe(1))
    const primeira = chamadas()[0]

    // Hunt nova: a fila antiga morre e a nova comeca.
    aquecerHuntEmSegundoPlano({ chave: 'cave' }, [])
    resolver!()
    await vi.waitFor(() => expect(chamadas().length).toBeGreaterThan(1))
    // A fila nova recomeca do inicio (as tiras de elemento vem antes dos fundos
    // nas duas); a antiga teria seguido pro SEGUNDO item dela.
    expect(chamadas()[1], 'a fila antiga continuou').toBe(primeira)
    expect(primeira).toBe(todasAsTirasDeVfx()[0])
  })
})

// 12/10/2026: entrar na Route 46 baixava 311 imagens (11,9 MB) antes da cena
// aparecer — a paleta shiny de todo o pool e as 31 tiras de elemento entravam
// no preload que segura o botao Entrar.
// As suites de cima trocam a implementacao por promessas penduradas, e
// `clearAllMocks` so zera as chamadas.
const resolverNaHora = () => {
  ;(primeImage as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => Promise.resolve())
}

describe('o preload da ENTRADA traz so o que a cena usa de cara', () => {
  beforeEach(resolverNaHora)

  const pool = [...new Set(getMap(STARTER_HUNT_ID)!.enemyPool
    .map((id) => getEncounter(id)?.speciesId).filter((id): id is string => !!id))]

  it('o pool entra na paleta normal, e a shiny NAO', async () => {
    await preloadHunt(STARTER_HUNT_ID, null)
    const pedidas = new Set(chamadas())
    for (const speciesId of pool) {
      for (const url of battleSpriteUrlsFor(speciesId, false)) expect(pedidas.has(url), url).toBe(true)
      for (const url of battleSpriteUrlsFor(speciesId, true)) expect(pedidas.has(url), url).toBe(false)
    }
  })

  it('o POKE do jogador entra na paleta dele, mesmo shiny', async () => {
    await preloadHunt(STARTER_HUNT_ID, { speciesId: 'squirtle', isShiny: true })
    const pedidas = new Set(chamadas())
    for (const url of battleSpriteUrlsFor('squirtle', true)) expect(pedidas.has(url), url).toBe(true)
  })

  it('as tiras de elemento sao so dos tipos de golpe da hunt', async () => {
    await preloadHunt(STARTER_HUNT_ID, null, { especies: ['squirtle'], golpes: [] })
    const pedidas = new Set(chamadas())
    const tipos = tiposDeGolpe(['squirtle', ...pool])
    for (const [tipo, tira] of Object.entries(TIRA_POR_ELEMENTO)) {
      expect(pedidas.has(tira.url), tipo).toBe(tipos.has(tipo))
    }
    // E de fato corta: a hunt inicial nao usa os 18 tipos.
    expect(tipos.size).toBeLessThan(Object.keys(TIRA_POR_ELEMENTO).length)
  })

  it('golpe de maquina conta, mesmo fora do learnset', () => {
    const semMaquina = tiposDeGolpe(['squirtle'])
    const comMaquina = tiposDeGolpe(['squirtle'], ['flamethrower'])
    expect(semMaquina.has('FIRE')).toBe(false)
    expect(comMaquina.has('FIRE')).toBe(true)
  })
})

describe('o aquecimento completa o que a entrada deixou de fora', () => {
  beforeEach(resolverNaHora)

  it('traz todas as tiras de elemento e a paleta shiny do pool, nessa ordem', async () => {
    aquecerHuntEmSegundoPlano(null, [], STARTER_HUNT_ID)
    const especie = getEncounter(getMap(STARTER_HUNT_ID)!.enemyPool[0])!.speciesId
    const shiny = battleSpriteUrlsFor(especie, true)[0]
    await vi.waitFor(() => expect(chamadas()).toContain(shiny))
    const pedidas = chamadas()
    for (const url of todasAsTirasDeVfx()) expect(pedidas).toContain(url)
    // Shiny por ultimo: e o unico item que pode nem ser usado na sessao.
    expect(pedidas.indexOf(shiny)).toBeGreaterThan(pedidas.indexOf(todasAsTirasDeVfx()[0]))
  })
})
