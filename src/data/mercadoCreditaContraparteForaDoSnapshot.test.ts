// PH-513 — o item comprado no Mercado durante uma cacada sumia no flush
// seguinte.
//
// `criar_ordem_mercado` creditava a CONTRAPARTE compradora (o dono passivo da
// ordem, que nao esta no request — pode estar cacando, ou nem online) com
// `insert ... on conflict do update` direto em `player_items`. O flush dela
// (`gravarEstado`, authority/src/progresso.ts) reescreve `player_items` a
// partir do estado lido no inicio da janela e apaga todo `item_id` que nao
// esta nele; e como a linha nao tocava `players`, o CAS em `updated_at` nem
// via a mudanca. O credito entrava e o flush o apagava, sem erro, sem log.
//
// A regra que este teste amarra: credito pra quem NAO esta no request vai pela
// caixa de entregas (`market_deliveries`, reivindicada e aplicada dentro do
// proximo request do proprio destinatario — ver authority/src/entregas.ts),
// nunca direto em `player_items`. E a mesma regra que a troca ja segue
// (20260830070000). Le a definicao VIGENTE da RPC nos dois schemas, como
// `togglesDeAutoBatemComORpc.test.ts` faz com `configurar_auto` — uma
// redefinicao futura que volte ao insert direto reprova aqui.
import { describe, expect, it } from 'vitest'

const MIGRATIONS = import.meta.glob('/supabase/migrations/*.sql', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

/** Corpo da definicao VIGENTE (ultima migration, por nome) de `criar_ordem_mercado`. */
function definicaoVigente(schema: 'public' | 'dev'): string | null {
  const assinatura = `create or replace function ${schema}.criar_ordem_mercado`
  const arquivos = Object.keys(MIGRATIONS)
    .filter((caminho) => MIGRATIONS[caminho].includes(assinatura))
    .sort()
  const ultima = arquivos[arquivos.length - 1]
  if (!ultima) return null
  const corpo = MIGRATIONS[ultima]
  const ini = corpo.indexOf(assinatura)
  const fim = corpo.indexOf('\n$$;', ini)
  return fim === -1 ? null : corpo.slice(ini, fim)
}

/**
 * O trecho do laco de casamento em que quem AGE e a vendedora (`p_side =
 * 'venda'`) — a contraparte, `v_candidata`, e a compradora passiva.
 */
function ramoDaCompradoraPassiva(definicao: string): string {
  const ini = definicao.indexOf("if p_side = 'compra' then")
  const meio = definicao.indexOf('\n    else', ini)
  const fim = definicao.indexOf('end if;', meio)
  expect(ini, 'nao achei o ramo p_side=compra').toBeGreaterThan(-1)
  expect(meio, 'nao achei o else do ramo').toBeGreaterThan(ini)
  expect(fim, 'nao achei o end if do ramo').toBeGreaterThan(meio)
  return definicao.slice(meio, fim)
}

describe('o Mercado credita a contraparte pela caixa de entregas, nao direto em player_items (PH-513)', () => {
  it('o teste acha o que precisa ler — guarda anti-vacuo', () => {
    expect(Object.keys(MIGRATIONS).length, 'nenhuma migration foi carregada').toBeGreaterThan(0)
    expect(definicaoVigente('public'), 'nao achei criar_ordem_mercado no public').not.toBeNull()
    expect(definicaoVigente('dev'), 'nao achei criar_ordem_mercado no dev').not.toBeNull()
  })

  it.each(['public', 'dev'] as const)('schema %s: a compradora passiva recebe o item por market_deliveries', (schema) => {
    const ramo = ramoDaCompradoraPassiva(definicaoVigente(schema)!)
    expect(ramo).toContain(`insert into ${schema}.market_deliveries`)
    expect(ramo).toContain('v_candidata.user_id')
    expect(ramo).not.toMatch(new RegExp(`insert into ${schema}\\.player_items[\\s\\S]*v_candidata\\.user_id`))
  })

  it.each(['public', 'dev'] as const)('schema %s: quem AGE continua creditado direto (o cliente refaz a leitura em seguida)', (schema) => {
    const definicao = definicaoVigente(schema)!
    const ini = definicao.indexOf("if p_side = 'compra' then")
    const ramoDeQuemCompra = definicao.slice(ini, definicao.indexOf('\n    else', ini))
    expect(ramoDeQuemCompra).toContain(`insert into ${schema}.player_items`)
    expect(ramoDeQuemCompra).toContain('values (v_user_id, p_item_id, v_qtd)')
  })
})
