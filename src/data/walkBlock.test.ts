// O walk-block pintado a mao e propriedade da ARTE de fundo, nao da chave do
// sub-bioma (ver maps.ts#mapDefParaSala pro porque). Estes testes trancam as
// falhas SILENCIOSAS dessa regra — nenhuma delas lanca excecao, todas
// aparecem so como "o POKE atravessou a parede":
//
// 1. Hunt sem salas ficar sem grade. Foi o bug relatado: o Modo Pesadelo (e
//    BOSS, e treino, e qualquer conteudo futuro) nao passa pelo sistema de
//    salas, entao com a tabela indexada por sub-bioma ele nao casava com
//    nada e rodava com o mapa inteiro aberto — na MESMA imagem em que a hunt
//    normal respeita predio, agua e parede.
// 2. Sub-bioma cuja arte nao tem referencia pintada. Some no meio das 33
//    salas sem ninguem notar: a sala existe, spawna, e so nao tem parede.
// 3. Referencia pintada que nao e usada por ninguem. O caso real foi
//    'cave-volcanic': pintada na leva de 2026-08-16, esquecida fora do
//    manifesto, e a sala 'cave' passou duas levas sem grade.
// 4. Ponto de spawn pintado que cai em celula bloqueada — o jogador nasce
//    dentro da parede e o motor tem que resgatar.
// 5. Circulo amarelo de spawn que a deteccao deixa de enxergar. Este e o
//    mais silencioso de todos: o mapa continua jogavel, o spawn so volta
//    pro centroide da area rosa (o meio do mapa), e a unica pessoa capaz de
//    notar e quem pintou o circulo — meses depois, se notar.
import { describe, expect, it } from 'vitest'

import { BIOMAS } from './biomas'
import { COLLISION_GRID_CELL_SIZE } from './collisionConstants'
import { COLISAO_POR_ARTE } from './generated/subBiomaCollision.generated'
import { MAPS, getMap, mapDefParaSala, spawnPointParaSala, spawnInimigoParaSala, isCellBlocked, type MapDef } from './maps'
import { LANCE_MAP_ID } from './nightmareMaps'

// A MESMA constante do gerador e de `isCellBlocked` — IMPORTADA, nunca
// repetida. Este numero estava hardcodado como 40 aqui e em
// engine/spawnPintado.test.ts, e as duas copias reprovaram no PH-94 quando a
// celula caiu pra 20: o teste passou a exigir que `grid.length * 40` batesse
// com um bounds medido em passos de 20. Ou seja, a suite guardava dentro dela a
// divergencia que ela existe pra impedir.
const CELULA = COLLISION_GRID_CELL_SIZE

// Vazia desde 2026-08-22: o Dojo era a ultima arte de sala sem referencia
// pintada, e a leva daquele dia fechou ela junto com a arena do dragao. A
// constante FICA — e o gancho pra proxima arte que entrar sem pintura ter que
// se declarar aqui em vez de sumir dentro de um "ainda faltam algumas".
const ARTES_SEM_PINTURA = new Set<string>()

/**
 * Toda arte que alguma sala ou alguma hunt pode botar na tela.
 *
 * Percorre os MAPAS tambem, e nao so `BIOMAS`, porque arte de hunt sem sala
 * (arena do Campeao Lance, BOSS, Modo Pesadelo, Treinamento) nao aparece em
 * bioma nenhum — `dragon.png` e exatamente esse caso e ficaria de fora do
 * inventario, marcada como pintura orfa mesmo estando em uso. E o mesmo furo
 * que o cabecalho deste arquivo descreve, so que do lado do inventario.
 */
function artesEmUso(): Map<string, string> {
  const usos = new Map<string, string>()
  for (const bioma of BIOMAS) {
    if (bioma.bg.image) usos.set(bioma.bg.image, `bioma ${bioma.chave}`)
    for (const sub of bioma.subBiomas) {
      if (sub.bg?.image) usos.set(sub.bg.image, `sub-bioma ${sub.chave}`)
    }
  }
  for (const [id, map] of Object.entries(MAPS)) {
    if (map.bg?.image) usos.set(map.bg.image, `hunt ${id}`)
  }
  return usos
}

describe('walk-block segue a arte, nao a chave da sala', () => {
  it('toda sala mostra uma arte com grade pintada', () => {
    const semGrade: string[] = []
    for (const bioma of BIOMAS) {
      for (const sub of bioma.subBiomas) {
        const arte = sub.bg?.image ?? bioma.bg.image
        if (!arte) { semGrade.push(`${sub.chave} (sem arte nenhuma)`); continue }
        if (ARTES_SEM_PINTURA.has(arte)) continue
        if (!COLISAO_POR_ARTE[arte]) semGrade.push(`${sub.chave} -> ${arte}`)
      }
    }
    expect(semGrade).toEqual([])
  })

  it('nenhuma referencia pintada fica orfa', () => {
    const emUso = artesEmUso()
    // route_46 nao e sub-bioma de bioma nenhum, mas mostra forest.jpg — a
    // arte dela ja entra por 'forest'. Qualquer outra sobra e pintura morta.
    const orfas = Object.keys(COLISAO_POR_ARTE).filter((arte) => !emUso.has(arte))
    expect(orfas).toEqual([])
  })

  it('o Modo Pesadelo herda a grade da hunt que ele espelha', () => {
    const pesadelos = Object.keys(MAPS).filter((id) => id.startsWith('nightmare_'))
    expect(pesadelos.length).toBeGreaterThan(0)

    for (const id of pesadelos) {
      const espelho = mapDefParaSala(id, null)
      const original = mapDefParaSala(id.replace(/^nightmare_/, ''), null)
      expect(espelho, id).not.toBeNull()
      // O que o bug fazia: `collisionGrid` null aqui e grade cheia no
      // original, com as duas hunts mostrando exatamente a mesma imagem.
      expect(espelho!.collisionGrid, id).not.toBeNull()
      expect(espelho!.collisionGrid, id).toEqual(original!.collisionGrid)
      expect(espelho!.colisaoDefineLimite, id).toBe(true)
    }
  })

  it('a hunt inicial continua com grade, agora sem special-case por id', () => {
    // Ela mostra forest.jpg e fica FORA do sistema de salas. Antes so tinha
    // grade por causa de um `if (mapId === STARTER_HUNT_ID)` escrito a mao em
    // maps.ts; agora vem da propria arte, como todo o resto.
    const mapDef = mapDefParaSala('route_46', null)
    expect(mapDef?.collisionGrid).toEqual(COLISAO_POR_ARTE['assets/hunt-backgrounds/forest.jpg'].grid)
  })

  it('a arte da SALA vence a arte do bioma quando ela tem uma', () => {
    // 'metropolis' tem arte propria; 'factory' nao tem e cai na do bioma.
    // Se a resolucao ignorasse a sala, as duas dariam a mesma grade.
    const comArte = mapDefParaSala('urbano_faixa1', { chave: 'metropolis' })
    const semArte = mapDefParaSala('industrial_faixa1', { chave: 'factory' })
    expect(comArte?.collisionGrid).toEqual(COLISAO_POR_ARTE['assets/hunt-backgrounds/metropolis.jpg'].grid)
    expect(semArte?.collisionGrid).toEqual(COLISAO_POR_ARTE['assets/hunt-backgrounds/industrial.jpg'].grid)
  })

  it('todo ponto de spawn pintado cai em celula andavel', () => {
    for (const bioma of BIOMAS) {
      for (const sub of bioma.subBiomas) {
        const mapId = `${bioma.chave}_faixa1`
        if (!getMap(mapId)) continue
        const mapDef = mapDefParaSala(mapId, { chave: sub.chave })
        const ponto = spawnPointParaSala(mapId, { chave: sub.chave })
        if (!mapDef || !ponto) continue
        expect(isCellBlocked(mapDef, ponto.x, ponto.y), `${sub.chave} nasce dentro da parede`).toBe(false)
      }
    }
  })

  it('toda arte com circulo amarelo pintado nasce dele, nao do centroide', () => {
    // A lista CRESCE quando o usuario pinta circulo em mais mapas — ele
    // avisou que vai. O jeito de atualizar e rodar
    // `node scripts/build-sub-bioma-collision.js` e copiar daqui quem saiu
    // com [amarelo] ou [amarelo projetado] no log.
    //
    // Duplicar a lista aqui e o ponto: se fosse derivada do proprio arquivo
    // gerado, o teste concordaria com qualquer regressao do gerador.
    const COM_CIRCULO = [
      'abyss.jpg', 'ice-cave.jpg', 'fairy-cave.jpg', 'island.jpg', 'lake.jpg',
      'metropolis.jpg', 'slum.jpg', 'wasteland.jpg', 'town-night.jpg',
      'town.jpg', 'volcano.jpg',
      // Leva 2026-08-22, as duas arenas de duelo.
      'dojo.png', 'dragon.png',
    ]

    const semCirculo: string[] = []
    for (const arte of COM_CIRCULO) {
      const chave = `assets/hunt-backgrounds/${arte}`
      const pintada = COLISAO_POR_ARTE[chave]
      expect(pintada, `${arte} sumiu do arquivo gerado`).toBeDefined()
      if (!pintada.spawnOrigem.startsWith('amarelo')) semCirculo.push(`${arte} (${pintada.spawnOrigem})`)
    }
    expect(
      semCirculo,
      'estas artes tem circulo amarelo pintado mas o spawn saiu do centroide rosa — ' +
        'a deteccao de cor em scripts/build-sub-bioma-collision.js#isYellow parou de ver o circulo',
    ).toEqual([])
  })

  it('nenhuma arte SEM circulo inventa um marcador', () => {
    // O lado oposto, e o motivo de `isYellow` ser estrito: o teste frouxo
    // anterior ('r>180 && g>180 && b<100') via areia, lava e luz de poste como
    // marcador. Numa referencia sem circulo isso poria o spawn num pedaco
    // qualquer de arte amarela — sem erro, sem aviso, so um nascimento no
    // lugar errado.
    const inventados = Object.entries(COLISAO_POR_ARTE)
      .filter(([, c]) => c.spawnOrigem.startsWith('amarelo'))
      .map(([arte]) => arte.replace('assets/hunt-backgrounds/', ''))
      .sort()
    expect(inventados).toEqual([
      'abyss.jpg', 'dojo.png', 'dragon.png', 'fairy-cave.jpg', 'ice-cave.jpg',
      'island.jpg', 'lake.jpg', 'metropolis.jpg', 'slum.jpg', 'town-night.jpg',
      'town.jpg', 'volcano.jpg', 'wasteland.jpg',
    ])
  })

  it('a arena do Campeao Lance tem grade — ela nao passa por nenhum outro teste daqui', () => {
    // `boss_lance` nao e sub-bioma nem espelho `nightmare_`, entao escapava dos
    // dois loops acima. Era literalmente a hunt mais longa do jogo rodando com
    // o mapa inteiro aberto.
    const arena = mapDefParaSala(LANCE_MAP_ID, null)
    expect(arena, 'a arena do Lance sumiu de MAPS').not.toBeNull()
    expect(arena!.collisionGrid).toEqual(COLISAO_POR_ARTE['assets/hunt-backgrounds/dragon.png'].grid)
    expect(arena!.colisaoDefineLimite).toBe(true)
  })

  describe('bola verde: por onde entra o POKE do lado inimigo', () => {
    const ARENAS = ['assets/hunt-backgrounds/dojo.png', 'assets/hunt-backgrounds/dragon.png']

    it('so as duas arenas de duelo tem bola verde', () => {
      const comVerde = Object.entries(COLISAO_POR_ARTE)
        .filter(([, c]) => c.spawnInimigo)
        .map(([arte]) => arte)
        .sort()
      // As outras 29 nao podem ganhar o campo por acidente: verde e a cor mais
      // comum da arte deste jogo, e um teste de cor frouxo poria "entrada do
      // inimigo" em cima de um arbusto qualquer.
      expect(comVerde).toEqual(ARENAS)
    })

    it('a bola verde cai em celula andavel, igual a amarela', () => {
      for (const arte of ARENAS) {
        const pintada = COLISAO_POR_ARTE[arte]
        const mapDef = { collisionGrid: pintada.grid, colisaoDefineLimite: true } as MapDef
        expect(isCellBlocked(mapDef, pintada.spawnInimigo!.x, pintada.spawnInimigo!.y), `${arte}: inimigo nasce na parede`).toBe(false)
      }
    })

    it('verde e amarela nao caem na mesma celula', () => {
      // Se caissem, jogador e inimigo nasceriam um dentro do outro e o duelo
      // comecaria com os dois em cima do mesmo pixel.
      for (const arte of ARENAS) {
        const { spawnPoint, spawnInimigo } = COLISAO_POR_ARTE[arte]
        expect(`${spawnInimigo!.x},${spawnInimigo!.y}`, arte).not.toBe(`${spawnPoint.x},${spawnPoint.y}`)
      }
    })

    it('a arena do Lance resolve a bola verde pela arte que ela mostra', () => {
      expect(spawnInimigoParaSala(LANCE_MAP_ID, null))
        .toEqual(COLISAO_POR_ARTE['assets/hunt-backgrounds/dragon.png'].spawnInimigo)
    })

    it('hunt sem bola verde devolve null em vez de inventar um ponto', () => {
      expect(spawnInimigoParaSala('route_46', null)).toBeNull()
    })
  })

  it('a grade de cada arte cobre exatamente o bounds dela', () => {
    // Era "35x23 pra todo mundo" ate PH-80, quando o mundo virou a caixa da
    // area pintada e cada arte passou a ter o seu tamanho. O invariante que
    // importa nao mudou: `isCellBlocked` trata "fora da grade" como bloqueado
    // quando `colisaoDefineLimite` esta ligado, entao uma grade menor que o
    // bounds encolhe o mapa em silencio, e uma maior libera area que o
    // renderer nem desenha.
    for (const [arte, { grid, bounds }] of Object.entries(COLISAO_POR_ARTE)) {
      expect(grid.length * CELULA, `${arte}: altura`).toBe(bounds.height)
      for (const linha of grid) expect(linha.length * CELULA, `${arte}: largura`).toBe(bounds.width)
    }
  })

  it('cada arte tem o seu tamanho de mundo — nao ha mais um tamanho unico', () => {
    // O ponto da PH-80. Se algum dia isto voltar a ser um valor so, o mundo
    // parou de seguir a pintura e ninguem vai perceber pela tela.
    const tamanhos = new Set(Object.values(COLISAO_POR_ARTE).map((c) => `${c.bounds.width}x${c.bounds.height}`))
    expect(tamanhos.size).toBeGreaterThan(1)
  })

  it('a colocacao da arte e emitida, nunca deduzida do bounds', () => {
    // Gerador e renderer chegavam na mesma transformacao por conta propria,
    // repetindo as mesmas constantes. Agora o gerador manda. Sem este campo o
    // desenho cai no enquadramento antigo e a grade descola do pixel.
    for (const [arte, c] of Object.entries(COLISAO_POR_ARTE)) {
      expect(c.arte, `${arte} sem colocacao`).toBeDefined()
      expect(c.arte.escala, arte).toBeGreaterThan(0)
    }
  })

  it('nenhum marcador precisa ser projetado pra dentro do mundo', () => {
    // Com o mundo recortado A PARTIR da tinta, um circulo pintado nao tem como
    // cair fora dele. `amarelo-projetado` era o remendo da era do 1400x900
    // fixo, quando 6 dos 11 circulos caiam fora da faixa visivel.
    const projetados = Object.entries(COLISAO_POR_ARTE)
      .filter(([, c]) => c.spawnOrigem === 'amarelo-projetado')
      .map(([arte]) => arte)
    expect(projetados).toEqual([])
  })
})
