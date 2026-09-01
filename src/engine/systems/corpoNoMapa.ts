// Onde um corpo PODE estar, e como move-lo pra la sem atravessar nada.
//
// Estas tres funcoes nasceram dentro de `movementSystem.ts` e sairam de la
// quando a encarada (PH-397) passou a precisar das mesmas garantias. A
// alternativa era `encaradaSystem` importar de `movementSystem` enquanto
// `movementSystem` importa `encaradaSystem` — um ciclo de import que funciona
// por acidente de hoisting no navegador e e exatamente o tipo de coisa que o
// bundle SSR da Edge (`npm run build:engine`) resolve de outro jeito.
//
// Nada aqui decide PRA ONDE alguem vai; so o que acontece quando ele tenta.
import { isCellBlocked, type MapDef } from '@/data/maps'
import type { Point } from '../types'

// A pegada de colisao de um POKE e uma caixa de `POKE_COLLISION_FOOTPRINT`, e
// checar so o ponto central contra a grade EQUIVALE a isso — mas nao porque
// "cada celula ja e uma caixa", que era o raciocinio antigo e valia so enquanto
// a pegada e o tamanho da celula eram o mesmo numero por coincidencia.
//
// Equivale porque a grade nao diz "aqui tem tinta": ela diz "o CENTRO do POKE
// pode estar aqui". A pegada e aplicada na GERACAO, por erosao
// (build-sub-bioma-collision.js, passo 1.5), o que mantem os lacos que chamam
// isto — ate 250 mil passos por chamada no resim do servidor — com uma consulta
// so em vez das nove que uma caixa exigiria em runtime.
//
// Mexer na pegada e mexer naquela constante e rodar o gerador de novo; nao ha
// nada a mudar aqui. Ver a nota longa em data/collisionConstants.ts (PH-94)
// pro que a medicao mostrou sobre a pegada de 40.
export function canOccupy(mapDef: MapDef, x: number, y: number): boolean {
  return !isCellBlocked(mapDef, x, y)
}

// Puxa (x, y) de volta pra borda circular caminhavel do mapa se caiu fora
// dela — a hunt nao tem mais cantos retangulares, so esse circulo invisivel.
export function clampToMapCircle(x: number, y: number, mapCx: number, mapCy: number, mapRadius: number): Point {
  const dx = x - mapCx
  const dy = y - mapCy
  const dist = Math.hypot(dx, dy)
  if (dist <= mapRadius || dist === 0) return { x, y }
  const ratio = mapRadius / dist
  return { x: mapCx + dx * ratio, y: mapCy + dy * ratio }
}

/**
 * Desloca um corpo por (dx, dy) respeitando parede pintada e o circulo andavel.
 *
 * Mesma degradacao por eixo do `slideToward`: o passo cheio, senao so X, senao
 * so Y, senao nao anda. Um empurrao NUNCA pode ser a porta de entrada pra
 * atravessar parede — a colisao da arte e mais forte que qualquer coreografia
 * ou separacao de corpos.
 */
export function empurrarCorpo(
  entity: { x: number; y: number },
  dx: number,
  dy: number,
  mapDef: MapDef,
  mapCx: number,
  mapCy: number,
  mapRadius: number,
): void {
  const alvo = clampToMapCircle(entity.x + dx, entity.y + dy, mapCx, mapCy, mapRadius)
  if (canOccupy(mapDef, alvo.x, alvo.y)) {
    entity.x = alvo.x
    entity.y = alvo.y
    return
  }
  if (canOccupy(mapDef, alvo.x, entity.y)) {
    entity.x = alvo.x
    return
  }
  if (canOccupy(mapDef, entity.x, alvo.y)) {
    entity.y = alvo.y
  }
}
