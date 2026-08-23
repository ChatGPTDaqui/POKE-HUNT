// PH-100 — o aviso de negocio nao pode derrubar o negocio.
//
// POR QUE ESTE TESTE EXISTE
//
// Os dois triggers de aviso rodam DENTRO da transacao que credita o ouro e
// troca o POKE de dono. Um trigger que levanta excecao aborta a transacao
// inteira: o jogador nao receberia o pagamento por causa de uma mensagem que
// nao pode ser gravada.
//
// A protecao e um `exception when others then return new` no fim de cada
// funcao — e ela e exatamente o tipo de coisa que uma limpeza bem-intencionada
// remove ("engolir erro e ma pratica"). Aqui engolir e a decisao: o aviso e
// REGISTRO, nao entrega, e perder a mensagem e melhor que desfazer a venda.
//
// Le o SQL em vez de chamar o banco pelo mesmo motivo de `advisoryLock.test.ts`:
// e propriedade do codigo que vai pro banco, e o CI nao tem credencial.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const DIR = join(__dirname, '..', 'migrations')

/** Funcoes de trigger de aviso, por `<schema>.<nome>` -> corpo vigente. */
function gatilhosDeAviso(): Array<[string, string]> {
  const vigente = new Map<string, string>()
  for (const arquivo of readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(DIR, arquivo), 'utf8').replace(/\r\n/g, '\n')
    const re = /create\s+(?:or\s+replace\s+)?function\s+(public|dev)\.(avisar_[a-z0-9_]+)\s*\(/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(sql)) !== null) {
      const daAbertura = sql.slice(m.index)
      const fim = daAbertura.indexOf('$$;')
      vigente.set(
        `${m[1].toLowerCase()}.${m[2].toLowerCase()}`,
        fim === -1 ? daAbertura : daAbertura.slice(0, fim),
      )
    }
  }
  return [...vigente]
}

describe('aviso de negocio nao derruba o negocio (PH-100)', () => {
  it('encontra as funcoes de aviso (guarda contra o parser vazio)', () => {
    // Sem isto, um regex quebrado faria os casos abaixo passarem por vacuidade
    // — o pior modo de falha num teste de invariante.
    expect(gatilhosDeAviso().length).toBeGreaterThanOrEqual(4)
  })

  it('toda funcao de aviso engole a propria falha', () => {
    const semProtecao = gatilhosDeAviso()
      .filter(([, corpo]) => !/exception\s+when\s+others/i.test(corpo))
      .map(([chave]) => chave)
      .sort()
    expect(
      semProtecao,
      'trigger de aviso sem "exception when others": uma falha de mensagem abortaria a transacao do negocio',
    ).toEqual([])
  })

  it('nenhuma funcao de aviso escreve em players', () => {
    // Aviso e registro. Se um trigger de aviso comecar a mexer em ouro, ele
    // passa a ser parte do negocio — e ai o `exception when others` acima deixa
    // de ser protecao e vira uma forma de PERDER dinheiro em silencio.
    const mexemEmOuro = gatilhosDeAviso()
      .filter(([chave, corpo]) => {
        const schema = chave.split('.')[0]
        return corpo.toLowerCase().includes(`update ${schema}.players`)
      })
      .map(([chave]) => chave)
    expect(mexemEmOuro, 'trigger de aviso escrevendo em players').toEqual([])
  })

  it('as duas pontas dev/public concordam', () => {
    const porNome = new Map<string, Set<string>>()
    for (const [chave, corpo] of gatilhosDeAviso()) {
      const nome = chave.split('.')[1]
      const schema = chave.split('.')[0]
      // Normaliza o schema pra comparar os corpos: as duas versoes tem que ser
      // a mesma logica, e so o schema pode diferir.
      const normalizado = corpo.replace(new RegExp(`\\b${schema}\\.`, 'g'), '<schema>.')
        .replace(/set search_path = [^\n]+/g, 'set search_path = <x>')
      if (!porNome.has(nome)) porNome.set(nome, new Set())
      porNome.get(nome)!.add(normalizado)
    }
    // Um schema avisando e o outro nao (ou avisando diferente) e pior que
    // nenhum dos dois avisar: o bug so aparece em producao, depois de passar
    // limpo na staging.
    const divergentes = [...porNome].filter(([, corpos]) => corpos.size > 1).map(([n]) => n)
    expect(divergentes, 'funcao de aviso com logica diferente entre dev e public').toEqual([])
  })
})
