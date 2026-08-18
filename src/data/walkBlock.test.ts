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
import { describe, expect, it } from 'vitest'

import { BIOMAS } from './biomas'
import { COLISAO_POR_ARTE } from './generated/subBiomaCollision.generated'
import { MAPS, getMap, mapDefParaSala, spawnPointParaSala, isCellBlocked } from './maps'

// Unica arte de sala sem referencia pintada hoje. Lista explicita pra uma
// arte nova nao entrar de carona no "ainda faltam algumas" — quando alguem
// pintar o Dojo, este teste avisa que da pra esvaziar a lista.
const ARTES_SEM_PINTURA = new Set(['assets/hunt-backgrounds/dojo.png'])

/** Toda arte que alguma sala ou alguma hunt pode botar na tela. */
function artesEmUso(): Map<string, string> {
  const usos = new Map<string, string>()
  for (const bioma of BIOMAS) {
    if (bioma.bg.image) usos.set(bioma.bg.image, `bioma ${bioma.chave}`)
    for (const sub of bioma.subBiomas) {
      if (sub.bg?.image) usos.set(sub.bg.image, `sub-bioma ${sub.chave}`)
    }
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
