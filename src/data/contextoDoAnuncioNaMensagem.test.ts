// PH-435 — o que a migration do contexto do anúncio NÃO pode deixar de fazer.
//
// Três invariantes, e os três já quebraram sistema em produção neste projeto
// quando ignorados em outra função:
//
// 1. A assinatura de 4 argumentos de `enviar_mensagem` tem que ser DROPADA. Com
//    ela viva ao lado da de 5, toda chamada do PostgREST casa nas duas
//    candidatas (o argumento novo tem default) e volta "could not choose the
//    best candidate function" — o social pararia de mandar mensagem por
//    inteiro, e a migration teria "funcionado".
// 2. Os grants precisam ser reemitidos para a assinatura NOVA. `grant` é por
//    assinatura, não por nome: sem isso a função nasce sem `execute` pra
//    `authenticated` e todo envio volta 42501.
// 3. O snapshot só pode aceitar anúncio de um dos dois lados da conversa. Sem
//    essa condição, um cliente adulterado estampa o anúncio de um terceiro no
//    fio e o outro lado não tem como desconfiar.
import { describe, expect, it } from 'vitest'

const MIGRATIONS = import.meta.glob('/supabase/migrations/*.sql', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

function migration(sufixo: string): string {
  const chave = Object.keys(MIGRATIONS).find((c) => c.endsWith(sufixo))
  if (!chave) throw new Error(`migration nao encontrada: ${sufixo}`)
  return MIGRATIONS[chave]
}

const PAR = [
  ['public', '20260902100000_contexto_do_anuncio_na_mensagem_public.sql'],
  ['dev', '20260902100001_contexto_do_anuncio_na_mensagem_dev.sql'],
] as const

describe('a varredura enxergou os arquivos', () => {
  it('as duas metades do par existem', () => {
    // Guarda anti-vacuo: com o glob quebrado todo teste abaixo passaria medindo
    // o nada.
    for (const [, arquivo] of PAR) expect(migration(arquivo).length).toBeGreaterThan(500)
  })
})

describe.each(PAR)('migration de %s', (schema, arquivo) => {
  const sql = migration(arquivo)

  it('adiciona a coluna do snapshot', () => {
    expect(sql).toContain(`alter table ${schema}.mail_messages`)
    expect(sql).toContain('add column if not exists contexto_anuncio jsonb')
  })

  it('dropa a assinatura de 4 argumentos ANTES de criar a de 5', () => {
    const drop = sql.indexOf(`drop function if exists ${schema}.enviar_mensagem(text, uuid, text, jsonb);`)
    const criacao = sql.indexOf(`create function ${schema}.enviar_mensagem(`)
    expect(drop, 'o drop da assinatura antiga precisa existir').toBeGreaterThan(-1)
    expect(criacao, 'a funcao nova precisa ser criada').toBeGreaterThan(-1)
    expect(drop).toBeLessThan(criacao)
  })

  it('nao usa `create or replace` (que criaria sobrecarga em vez de substituir)', () => {
    expect(sql).not.toContain('create or replace function')
  })

  it('reemite o grant pra assinatura NOVA, com o uuid do anuncio', () => {
    expect(sql).toContain(`grant execute on function ${schema}.enviar_mensagem(text, uuid, text, jsonb, uuid) to authenticated;`)
    expect(sql).toContain(`revoke execute on function ${schema}.enviar_mensagem(text, uuid, text, jsonb, uuid) from anon;`)
  })

  it('so estampa anuncio de UM DOS DOIS lados da conversa', () => {
    expect(sql).toContain(`from ${schema}.market_listings l`)
    expect(sql).toContain('l.seller_id in (v_user_id, v_destino.user_id)')
    // E recusa em vez de deixar passar sem card: falha silenciosa aqui seria
    // indistinguivel de "anuncio sem contexto".
    expect(sql).toMatch(/if v_contexto is null then\s+raise exception/)
  })

  it('grava o snapshot na propria mensagem, junto do resto do insert', () => {
    expect(sql).toContain('anexo_itens, contexto_anuncio)')
    expect(sql).toContain("'pendente', v_anexos, v_contexto)")
  })

  it('devolve o snapshot no retorno, pro eco local do fio nascer igual ao gravado', () => {
    expect(sql).toContain("'contextoAnuncio', v_contexto")
  })

  it('mantem o rate limit contando so mensagem de texto — o caminho novo nao escapa dele', () => {
    // O card viaja NA mensagem de texto justamente pra continuar sujeito a
    // este limite. Se algum dia ele virar linha de outro tipo, este teste é o
    // que avisa que o limite deixou de cobrir o caminho.
    expect(sql).toContain(`from ${schema}.mail_messages where de_id = v_user_id and tipo = 'texto'`)
    expect(sql).toContain("'texto', null, trim(p_corpo)")
  })
})
