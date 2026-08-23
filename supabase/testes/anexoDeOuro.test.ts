// PH-87 — o envio e a coleta de anexo precisam concordar sobre ONDE cada
// "item" mora.
//
// POR QUE ESTE TESTE LE SQL EM VEZ DE CHAMAR A RPC
//
// O bug que originou este arquivo era 100% servidor: `enviar_mensagem` debitava
// `gold` de `players.gold` e `coletar_anexo_correio` tentava creditar em
// `player_items`, que tem FK para `items`. Nenhum teste de cliente pegaria
// isso — todos mockam o Supabase, entao testariam o mock. E teste de
// integracao contra o banco precisa de credencial, que o CI nao tem.
//
// Sobra ler o SQL que vai para o banco. E frageis por natureza, entao o teste
// nao tenta entender a funcao inteira: extrai so os literais comparados com
// `v_item_id = '...'`, que e como as duas funcoes marcam "este item e caso
// especial, nao vai para player_items".
//
// A INVARIANTE, que e mais util que "gold funciona": os dois conjuntos tem que
// ser iguais. Se alguem amanha adicionar um segundo pseudo-item (bilhetes,
// fichas de evento) no envio e esquecer a coleta, este teste falha antes de a
// moeda sumir de novo — que foi exatamente a forma do PH-87.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const DIR = join(__dirname, '..', 'migrations')

/** Colapsa quebra de linha e indentacao pra busca por substring nao depender de formatacao. */
function normalizar(sql: string): string {
  return sql.replace(/[\t\r\n ]+/g, ' ').toLowerCase()
}

/**
 * Corpo da definicao MAIS RECENTE de `<schema>.<nome>`, ja normalizado. E a que
 * vale no banco: migrations aplicam em ordem de timestamp e a ultima
 * `create or replace` ganha.
 */
function corpoVigente(schema: string, nome: string): string {
  const arquivos = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()
  const alvos = [
    'create function ' + schema + '.' + nome + '(',
    'create or replace function ' + schema + '.' + nome + '(',
  ]
  let achado = ''
  for (const arquivo of arquivos) {
    const sql = normalizar(readFileSync(join(DIR, arquivo), 'utf8'))
    for (const alvo of alvos) {
      const i = sql.indexOf(alvo)
      if (i === -1) continue
      const daAbertura = sql.slice(i)
      // O corpo vai ate o `$$;` que fecha a funcao.
      const fim = daAbertura.indexOf('$$;')
      achado = fim === -1 ? daAbertura : daAbertura.slice(0, fim)
    }
  }
  return achado
}

/** Literais que a funcao trata como pseudo-item (`if v_item_id = 'gold'`). */
function itensEspeciais(corpo: string): string[] {
  const achados = new Set<string>()
  const marca = "v_item_id = '"
  let i = corpo.indexOf(marca)
  while (i !== -1) {
    const inicio = i + marca.length
    const fim = corpo.indexOf("'", inicio)
    if (fim === -1) break
    achados.add(corpo.slice(inicio, fim))
    i = corpo.indexOf(marca, fim)
  }
  return [...achados].sort()
}

describe.each(['public', 'dev'])('anexo de correio no schema %s', (schema) => {
  it('define as duas funcoes do fluxo de anexo', () => {
    expect(corpoVigente(schema, 'enviar_mensagem'), 'enviar_mensagem').not.toBe('')
    expect(corpoVigente(schema, 'coletar_anexo_correio'), 'coletar_anexo_correio').not.toBe('')
  })

  it('trata os MESMOS pseudo-itens no envio e na coleta', () => {
    const noEnvio = itensEspeciais(corpoVigente(schema, 'enviar_mensagem'))
    const naColeta = itensEspeciais(corpoVigente(schema, 'coletar_anexo_correio'))
    // Nao basta nao-vazio: o par tem que bater. Item debitado de um lugar e
    // creditado em outro e perda de moeda silenciosa.
    expect(naColeta).toEqual(noEnvio)
  })

  it('debita e credita o ouro na mesma coluna', () => {
    const envio = corpoVigente(schema, 'enviar_mensagem')
    const coleta = corpoVigente(schema, 'coletar_anexo_correio')
    expect(itensEspeciais(envio)).toContain('gold')
    expect(envio).toContain('update ' + schema + '.players set gold = gold - ')
    expect(coleta).toContain('update ' + schema + '.players set gold = gold + ')
  })

  it('nao manda ouro para player_items, que tem FK para items', () => {
    const coleta = corpoVigente(schema, 'coletar_anexo_correio')
    // O insert em `player_items` tem que estar no ramo `else`, depois do teste
    // de pseudo-item — nunca ser o caminho unico.
    const posGold = coleta.indexOf("v_item_id = 'gold'")
    const posInsert = coleta.indexOf('insert into ' + schema + '.player_items')
    expect(posGold, 'coleta precisa testar gold').toBeGreaterThan(-1)
    expect(posInsert, 'coleta precisa inserir itens normais').toBeGreaterThan(-1)
    expect(posGold).toBeLessThan(posInsert)
  })
})
