// PH-67 — toda RPC que escreve em `players` precisa serializar por usuario.
//
// POR QUE ESTE TESTE EXISTE
//
// `flush` (a cada 30s) e as acoes do jogador competem pelo mesmo CAS em
// `players.updated_at`. Quem perde a corrida leva `CONFLITO_ESCRITA_JOGADOR` e
// a acao se perde. A correcao foi `pg_advisory_xact_lock(hashtext(user_id))` no
// inicio de cada RPC que escreve.
//
// O problema que este teste resolve nao e a correcao — e a EROSAO dela. A
// varredura original cobriu as RPCs que existiam naquele dia; `coletar_anexo_
// correio` passou a escrever em `players` semanas depois (PH-87, credito de
// ouro do anexo) e nasceu sem lock, sem nada acusar. Uma RPC nova sempre vai
// entrar por fora da varredura de ontem.
//
// Le o SQL em vez de chamar o banco pelo mesmo motivo de `anexoDeOuro.test.ts`:
// e uma propriedade do codigo que vai pro banco, e o CI nao tem credencial.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const DIR = join(__dirname, '..', 'migrations')

/**
 * RPCs que escrevem em `players` de DOIS jogadores (comprador e vendedor) e
 * por isso nao entram no padrao de uma linha.
 *
 * Travar as duas pontas exige ordem deterministica por uuid: sem isso, duas
 * compras cruzadas (A comprando de B enquanto B compra de A) travam uma na
 * outra. Nao e "esqueceram" — e trabalho de desenho separado, registrado na
 * PH-67. Tirar um nome desta lista sem adicionar o lock faz o teste falhar,
 * que e o comportamento desejado.
 */
const SEM_LOCK_POR_ENQUANTO = new Set([
  'criar_ordem_mercado',
  'comprar_anuncio',
  'responder_oferta',
  'recusar_ofertas_pendentes',
  // Manutencao/admin, roda fora do caminho do jogador e nunca concorre com flush.
  'wipe_todos_os_saves',
  'wipe_inventario_e_economia',
])

/** Corpo vigente de cada funcao (`<schema>.<nome>` -> corpo), ultima definicao ganha. */
function funcoesVigentes(): Map<string, string> {
  const vigente = new Map<string, string>()
  for (const arquivo of readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(DIR, arquivo), 'utf8').replace(/\r\n/g, '\n')
    const re = /create\s+(?:or\s+replace\s+)?function\s+(public|dev)\.([a-z0-9_]+)\s*\(/gi
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
  return vigente
}

function escrevemEmPlayers(): Array<[string, string]> {
  return [...funcoesVigentes()].filter(([chave, corpo]) => {
    const schema = chave.split('.')[0]
    return corpo.toLowerCase().includes(`update ${schema}.players`)
  })
}

describe('advisory lock nas RPCs que escrevem em players (PH-67)', () => {
  it('encontra as funcoes no SQL (guarda contra o parser silenciosamente vazio)', () => {
    // Sem isto, um regex quebrado faria todos os outros casos passarem por
    // vacuidade — o pior modo de falha possivel num teste de invariante.
    expect(escrevemEmPlayers().length).toBeGreaterThan(20)
  })

  it('toda RPC que escreve em players pega pg_advisory_xact_lock', () => {
    const semLock = escrevemEmPlayers()
      .filter(([, corpo]) => !/pg_advisory_xact_lock/i.test(corpo))
      .map(([chave]) => chave)
      .filter((chave) => !SEM_LOCK_POR_ENQUANTO.has(chave.split('.')[1]))
      .sort()
    expect(semLock, 'RPC nova escrevendo em players sem serializar por usuario').toEqual([])
  })

  it('as duas pontas de cada par dev/public concordam sobre o lock', () => {
    const porNome = new Map<string, Set<boolean>>()
    for (const [chave, corpo] of escrevemEmPlayers()) {
      const nome = chave.split('.')[1]
      if (!porNome.has(nome)) porNome.set(nome, new Set())
      porNome.get(nome)!.add(/pg_advisory_xact_lock/i.test(corpo))
    }
    // Um schema com lock e o outro sem e pior que os dois sem: o bug so
    // aparece em producao, depois de passar limpo na staging.
    const divergentes = [...porNome].filter(([, valores]) => valores.size > 1).map(([n]) => n)
    expect(divergentes, 'lock aplicado em um schema e nao no gemeo').toEqual([])
  })
})
