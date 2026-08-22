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
import { BOSS_MAPS_DATA } from './nightmareMaps'
import { COLISAO_POR_ARTE } from './generated/subBiomaCollision.generated'
import { MAPS, getMap, mapDefParaSala, spawnPointParaSala, isCellBlocked } from './maps'

// PH-55 pintou as 2 ultimas (dojo.png, dragon.png) — lista vazia agora.
// Fica declarada (nao removida) de proposito: se uma arte nova entrar sem
// referencia pintada, o jeito de nao quebrar o teste de baixo e adicionar
// aqui explicitamente, nunca esvaziar a checagem.
const ARTES_SEM_PINTURA = new Set<string>()

/** Toda arte que alguma sala ou alguma hunt pode botar na tela. */
function artesEmUso(): Map<string, string> {
  const usos = new Map<string, string>()
  for (const bioma of BIOMAS) {
    if (bioma.bg.image) usos.set(bioma.bg.image, `bioma ${bioma.chave}`)
    for (const sub of bioma.subBiomas) {
      if (sub.bg?.image) usos.set(sub.bg.image, `sub-bioma ${sub.chave}`)
    }
  }
  // PH-55: BOSS_MAPS_DATA (boss_lance e as hunts BOSS por tipo) fica FORA do
  // sistema de biomas — mesmo motivo do route_46 logo abaixo, so que sem
  // special-case: dragon.png (arena do Lance) so aparece aqui, em nenhum
  // bioma/sub-bioma. Sem este loop, o teste "nenhuma referencia pintada fica
  // orfa" reprova toda vez que alguem pinta uma arte usada so por hunt BOSS.
  for (const [id, map] of Object.entries(BOSS_MAPS_DATA)) {
    if (map.bg.image) usos.set(map.bg.image, `boss ${id}`)
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
      'abyss.jpg', 'fairy-cave.jpg', 'ice-cave.jpg', 'island.jpg', 'lake.jpg',
      'metropolis.jpg', 'slum.jpg', 'town-night.jpg', 'town.jpg',
      'volcano.jpg', 'wasteland.jpg',
    ])
  })

  it('PH-55: a arena do Campeao Lance (boss_lance) tem grade, nao area aberta', () => {
    // Nenhuma asserção cobria isto antes: boss_lance nao e sub-bioma nem
    // hunt normal (nasce de bosses.maps/lance.map em nightmareMaps.ts, fora
    // do sistema de biomas), entao nao aparecia no loop `for bioma of
    // BIOMAS` dos testes acima — a arena podia ficar sem grade pra sempre
    // sem nenhum teste vermelho.
    const mapDef = mapDefParaSala('boss_lance', null)
    expect(mapDef).not.toBeNull()
    expect(mapDef!.collisionGrid).toEqual(COLISAO_POR_ARTE['assets/hunt-backgrounds/dragon.png'].grid)
    expect(mapDef!.colisaoDefineLimite).toBe(true)
  })

  it('toda grade tem o tamanho do mapa inteiro (35x23 celulas de 40px)', () => {
    // `isCellBlocked` trata "fora da grade" como bloqueado quando
    // colisaoDefineLimite esta ligado. Uma grade menor que os bounds
    // encolheria o mapa em silencio.
    for (const [arte, { grid }] of Object.entries(COLISAO_POR_ARTE)) {
      expect(grid.length, arte).toBe(23)
      for (const linha of grid) expect(linha.length, arte).toBe(35)
    }
  })
})
