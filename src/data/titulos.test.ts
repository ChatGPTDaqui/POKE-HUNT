// Titulos do treinador (21/10/2026): catalogo unico, degraus de Especialidade e
// o SQL de `definir_titulo` concordando com o cliente.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  DEGRAUS_DE_ESPECIALIDADE, GEMA_DA_CONQUISTA, SUFIXO_DO_TIPO, VISUAL_DA_GEMA, GEMAS,
  idDoTituloDeEspecialidade, titulosDisponiveis, todosOsTitulos, tituloPorId,
} from './titulos'
import { CATALOGO_DE_CONQUISTAS } from './generated/conquistas.generated'
import { especialidadeNiveisDefault } from './especialidades'
import { TYPE_COLORS } from './typeColors'

const SQL = ['public', 'dev'].map((s) =>
  readFileSync(`supabase/migrations/20261021130${s === 'public' ? '000' : '001'}_titulos_de_especialidade_${s}.sql`, 'utf8'))

describe('catalogo de titulos', () => {
  it('54 titulos de Especialidade (18 tipos x 3 degraus) e todos os de conquista Ouro/Impossivel/Platina', () => {
    const t = todosOsTitulos()
    expect(t.filter((x) => x.origem === 'especialidade')).toHaveLength(54)
    const conquistas = CATALOGO_DE_CONQUISTAS.filter((c) => GEMA_DA_CONQUISTA[c.nivel])
    expect(t.filter((x) => x.origem === 'conquista')).toHaveLength(conquistas.length)
    expect(new Set(t.map((x) => x.id)).size).toBe(t.length)
    expect(Object.keys(SUFIXO_DO_TIPO).sort()).toEqual(Object.keys(TYPE_COLORS).sort())
  })

  it('degraus: Aprendiz Ambar, Especialista Jade, Mestre Safira; conquista pela gema do nivel', () => {
    expect(tituloPorId('esp:FIRE:3')).toMatchObject({ nome: 'Aprendiz das Chamas', gema: 'ambar' })
    expect(tituloPorId('esp:FIRE:7')).toMatchObject({ nome: 'Especialista das Chamas', gema: 'jade' })
    expect(tituloPorId('esp:FIRE:10')).toMatchObject({ nome: 'Mestre das Chamas', gema: 'safira' })
    const platina = CATALOGO_DE_CONQUISTAS.find((c) => c.nivel === 'platina')
    if (platina) expect(tituloPorId(platina.id)?.gema).toBe('diamante')
    expect(tituloPorId('nao_existe')).toBeNull()
  })

  it('so libera o titulo de Especialidade a partir do degrau, pelo maior entre dano e defesa', () => {
    const esp = especialidadeNiveisDefault()
    esp.WATER = { dano: 2, defesa: 7 }
    const ids = titulosDisponiveis({}, esp).map((t) => t.id)
    expect(ids).toContain(idDoTituloDeEspecialidade('WATER', 3))
    expect(ids).toContain(idDoTituloDeEspecialidade('WATER', 7))
    expect(ids).not.toContain(idDoTituloDeEspecialidade('WATER', 10))
    expect(ids.some((id) => id.startsWith('esp:FIRE'))).toBe(false)
  })

  it('lista do mais raro pro menos', () => {
    const esp = especialidadeNiveisDefault()
    esp.GRASS = { dano: 10, defesa: 0 }
    const gemas = titulosDisponiveis({}, esp).map((t) => GEMAS.indexOf(t.gema))
    expect(gemas).toEqual([...gemas].sort((a, b) => b - a))
  })

  it('toda gema tem visual definido', () => {
    for (const g of GEMAS) expect(VISUAL_DA_GEMA[g].cor).toMatch(/^#/)
  })

  it('o SQL aceita os mesmos degraus e os 18 tipos, nos dois schemas', () => {
    for (const sql of SQL) {
      expect(sql).toContain(`v_degrau not in (${DEGRAUS_DE_ESPECIALIDADE.map((d) => d.nivel).join(', ')})`)
      for (const tipo of Object.keys(SUFIXO_DO_TIPO)) expect(sql).toContain(`'${tipo}'`)
      expect(sql).toContain("v_id like 'esp:%'")
      expect(sql).toContain("c.nivel in ('ouro', 'impossivel', 'platina')")
    }
  })
})
