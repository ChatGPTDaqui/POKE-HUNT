// Titulo, vitrine e ranking de conquistas (14/10/2026). Recompensa e so
// cosmetica, mas ainda assim nao pode ser forjada: titulo e vitrine so com
// conquista que o jogador TEM, e o ranking nao mistura bot.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const DIR = join(__dirname, '..', 'migrations')
function ultima(sufixo: string): string {
  const arquivos = readdirSync(DIR).filter((f) => f.endsWith(sufixo)).sort()
  expect(arquivos.length, `nenhuma migration ${sufixo}`).toBeGreaterThan(0)
  return readFileSync(join(DIR, arquivos[arquivos.length - 1]), 'utf8').replace(/--[^\n]*/g, '')
}

for (const schema of ['public', 'dev'] as const) {
  describe(`titulos e vitrine (${schema})`, () => {
    const sql = ultima(`_conquistas_titulos_${schema}.sql`)

    it('titulo so de conquista propria e dos niveis Ouro/Impossivel/Platina', () => {
      const corpo = sql.slice(sql.indexOf(`function ${schema}.definir_titulo`))
      expect(corpo).toMatch(/pc\.user_id = v_user_id and pc\.conquista_id = v_id/)
      expect(corpo).toMatch(/c\.nivel in \('ouro', 'impossivel', 'platina'\)/)
    })

    it('vitrine tem no maximo 3 e so conquista propria', () => {
      expect(sql).toMatch(/check \(cardinality\(vitrine\) <= 3\)/)
      const corpo = sql.slice(sql.indexOf(`function ${schema}.definir_vitrine`))
      expect(corpo).toMatch(/cardinality\(v_ids\) > 3/)
      expect(corpo).toMatch(/pc\.user_id = v_user_id and pc\.conquista_id = x/)
    })

    it('o ranking deixa bot de fora', () => {
      const corpo = sql.slice(sql.indexOf(`function ${schema}.ranking_conquistas`))
      expect(corpo).toMatch(/not exists \(select 1 from [a-z.]*pvp_bots b where b\.user_id = pc\.user_id\)/)
    })

    it('a view publica ganha titulo e vitrine no FIM (create or replace view exige)', () => {
      expect(sql).toMatch(/p\.skin_treinador,\s*p\.titulo,\s*p\.vitrine\s*from/)
    })
  })
}
