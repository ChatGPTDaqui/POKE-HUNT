// PH-437 — o que a migration da reserva não pode deixar de fazer.
//
// A reserva mexe em DINHEIRO e em quem pode comprar o quê, e cada invariante
// aqui fecha um golpe concreto:
//
//  - sem a guarda em `comprar_anuncio`, esconder o anúncio da vitrine é teatro:
//    o id circula (o card da conversa carrega ele) e uma chamada direta compra o
//    POKE prometido a outro jogador;
//  - sem `price` na MESMA transação da reserva, existe uma janela com o anúncio
//    já mais barato e ainda público — e a vitrine ordena por preço crescente,
//    ou seja o POKE aparece no TOPO da lista de todo mundo exatamente nela;
//  - sem recusar leilão e somente-lance, a reserva passa por cima de ouro de
//    terceiro que já está em escrow.
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
  ['public', '20260902110000_reserva_de_anuncio_public.sql'],
  ['dev', '20260902110001_reserva_de_anuncio_dev.sql'],
] as const

describe('a varredura enxergou os arquivos', () => {
  it('as duas metades do par existem', () => {
    for (const [, arquivo] of PAR) expect(migration(arquivo).length).toBeGreaterThan(2000)
  })
})

describe.each(PAR)('reserva de anuncio em %s', (schema, arquivo) => {
  const sql = migration(arquivo)

  it('adiciona a coluna liberando o anuncio se a conta do reservado sumir', () => {
    // `on delete set null` e nao `cascade`: cascade apagaria o ANUNCIO, e com
    // ele o POKE ficaria preso num registro morto. `restrict` deixaria a linha
    // reservada pra um id inexistente — POKE invendavel pra sempre.
    expect(sql).toContain('add column if not exists reservado_para uuid references auth.users(id) on delete set null')
  })

  it('comprar_anuncio RECUSA terceiro, e nao so a vitrine esconde', () => {
    expect(sql).toContain('if v_anuncio.reservado_para is not null and v_anuncio.reservado_para <> v_user_id then')
    expect(sql).toContain("raise exception 'Este anuncio esta reservado para outro jogador.'")
  })

  it('comprar_anuncio conserva o advisory lock da versao vigente', () => {
    // A RPC DEBITA ouro. Recria-la a partir de uma copia velha ja removeu um
    // lock sem querer neste repo — e por isso que a versao vigente e a base.
    expect(sql).toContain('perform pg_advisory_xact_lock(hashtext(v_user_id::text));')
  })

  it('a vitrine esconde anuncio reservado de terceiro, mas nao do vendedor nem do reservado', () => {
    expect(sql).toContain('l.reservado_para is null')
    expect(sql).toContain('or l.reservado_para = auth.uid()')
    expect(sql).toContain('or l.seller_id = auth.uid()')
  })

  it('a view continua definer — `security_invoker = true` e o defeito do PH-128', () => {
    expect(sql).toContain(`alter view ${schema}.mercado_anuncios_ativos set (security_invoker = false);`)
  })

  it('a view expoe o NOME de quem reservou, nao so o uuid', () => {
    expect(sql).toContain('r.trainer_name as reservado_nome')
    expect(sql).toContain(`left join ${schema}.treinadores_publico r on r.user_id = l.reservado_para`)
  })

  it('recusa leilao e somente-lance', () => {
    expect(sql).toMatch(/if v_anuncio\.modo = 'leilao' then\s+raise exception 'Leilao nao aceita reserva/)
    expect(sql).toMatch(/if v_anuncio\.apenas_oferta then\s+raise exception 'Anuncio de lance nao aceita reserva/)
  })

  it('recusa anuncio com lance pendente — ouro de terceiro em escrow', () => {
    expect(sql).toContain("where listing_id = p_anuncio_id and status = 'pendente'")
    expect(sql).toContain('if v_ofertas > 0 then')
  })

  it('so o vendedor reserva, e nao pra si mesmo', () => {
    expect(sql).toContain("raise exception 'Este anuncio nao e seu.'")
    expect(sql).toContain("raise exception 'Voce nao pode reservar um anuncio pra si mesmo.'")
  })

  it('respeita bloqueio entre os dois', () => {
    expect(sql).toContain(`if ${schema}.bloqueio_entre(v_user_id, v_destino.user_id) then`)
  })

  it('grava preco e reserva no MESMO update', () => {
    // Separados, a janela entre os dois deixa o anuncio barato e publico.
    expect(sql).toMatch(/set reservado_para = p_para_id, price = p_price/)
  })

  it('limpar a reserva nao mexe no preco', () => {
    expect(sql).toMatch(/if p_para_id is null then\s+update \w+\.market_listings set reservado_para = null/)
  })

  it('valida o preco no servidor, dentro do teto da coluna', () => {
    expect(sql).toContain('if p_price is null or p_price <= 0 or p_price > 100000000 then')
  })

  it('so avisa o reservado quando a reserva MUDA — senao o aviso e rota de flood', () => {
    // O aviso entra por insert direto (nao por `enviar_mensagem`), logo nao
    // passa pelo rate limit de 3s. Esta comparacao e o que ocupa o lugar dele.
    expect(sql).toContain('v_mudou := v_anuncio.reservado_para is distinct from p_para_id')
    expect(sql).toContain('or v_anuncio.price is distinct from p_price;')
    expect(sql).toContain('if v_mudou then')
  })

  it('o aviso leva o card do anuncio (o contexto de PH-435)', () => {
    expect(sql).toContain('contexto_anuncio')
    expect(sql).toContain("'anuncioId', v_anuncio.id")
    expect(sql).toContain("'price', p_price")
  })

  it('a execucao e restrita a authenticated', () => {
    expect(sql).toContain(`revoke execute on function ${schema}.reservar_anuncio(uuid, uuid, int) from anon;`)
    expect(sql).toContain(`grant execute on function ${schema}.reservar_anuncio(uuid, uuid, int) to authenticated;`)
  })
})
