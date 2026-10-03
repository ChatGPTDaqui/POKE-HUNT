// So pra testes: roda cada teste com os registros VAZIOS e devolve o registro
// real no fim. Os testes do resolver e da invariante "so visual" inscrevem
// coreografias falsas; sem restaurar, um teste apagaria o FIRE de verdade pro
// seguinte.
import { afterEach, beforeEach } from 'vitest'
import { REGISTRO_DE_AREA, REGISTRO_DE_MOTIVO, REGISTRO_SINGLE, REGISTRO_POR_GOLPE } from './registro'

export function isolarRegistros(): void {
  const registros = [REGISTRO_SINGLE, REGISTRO_DE_AREA, REGISTRO_DE_MOTIVO, REGISTRO_POR_GOLPE] as Record<string, unknown>[]
  let guardados: Record<string, unknown>[] = []
  beforeEach(() => {
    guardados = registros.map(r => ({ ...r }))
    for (const r of registros) for (const k of Object.keys(r)) delete r[k]
  })
  afterEach(() => {
    registros.forEach((r, i) => {
      for (const k of Object.keys(r)) delete r[k]
      Object.assign(r, guardados[i])
    })
  })
}
