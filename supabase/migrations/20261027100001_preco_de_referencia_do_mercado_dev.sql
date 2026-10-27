-- (par DEV) Preco de referencia do Mercado (27/10/2026) — "preco medio" estilo Steam.
-- Spec: docs/planos/2026-10-27-mercado-preco-medio-design.md
--
-- O QUE MUDA
--   1. `market_trades` passa a guardar shiny e FAIXA de IV da venda de POKE.
--      Sem isso a mediana de um Charizard shiny IV 100 e a de um comum saiam
--      do mesmo saco.
--   2. `faixa_de_iv(int)`: as quatro faixas (f0, f60, f80, f95). Par exato de
--      src/features/mercado/faixaDeIv.ts — um teste prende os dois.
--   3. Trigger que preenche shiny/faixa a partir do ANUNCIO vendido.
--   4. RPC `preco_de_referencia(chaves[])`: mediana de 7 dias + "a partir de".
--
-- POR QUE TRIGGER, E NAO EDITAR AS TRES RPCS QUE VENDEM POKE
-- (comprar_anuncio, responder_oferta, encerrar_leiloes_vencidos)
--   As tres sao longas, ja foram redefinidas varias vezes e tem par em `dev`.
--   Reescreve-las so pra acrescentar duas colunas no insert e o jeito mais
--   facil de reverter, sem querer, um conserto de dinheiro feito depois. O
--   trigger fica num lugar so e pega qualquer RPC futura que venda POKE.
--
--   Como ele acha o anuncio: as tres marcam o anuncio `vendido` com
--   `sold_at = now()` e o comprador ANTES do insert, na mesma transacao —
--   `now()` e o instante da transacao, entao o anuncio vendido nesta
--   transacao e o que casa vendedor + comprador + especie + sold_at.
--   Ambiguidade so existiria se a varredura de leiloes vencidos encerrasse,
--   na mesma rodada, dois leiloes do mesmo vendedor, da mesma especie, ganhos
--   pelo mesmo comprador — e ai a faixa de um poderia ir pro outro. Aceito: o
--   pior caso e uma venda numa faixa vizinha da media, nunca dinheiro.

alter table dev.market_trades
  add column if not exists is_shiny boolean,
  add column if not exists iv_faixa text check (iv_faixa in ('f0', 'f60', 'f80', 'f95'));

create or replace function dev.faixa_de_iv(p int)
returns text
language sql
immutable
as $$
  select case
    when p is null then null
    when p >= 95 then 'f95'
    when p >= 80 then 'f80'
    when p >= 60 then 'f60'
    else 'f0'
  end
$$;

create or replace function dev.trade_herda_caracteristicas()
returns trigger
language plpgsql
security definer
set search_path = dev, public
as $$
declare
  v_anuncio record;
begin
  if new.kind <> 'poke' or new.iv_faixa is not null then
    return new;
  end if;
  select l.is_shiny, l.iv_percent into v_anuncio
    from dev.market_listings l
    where l.status = 'vendido'
      and l.sold_at = now()
      and l.seller_id = new.seller_id
      and l.buyer_id is not distinct from new.buyer_id
      and l.species_id = new.species_id
    order by l.id
    limit 1;
  if found then
    new.is_shiny := v_anuncio.is_shiny;
    new.iv_faixa := dev.faixa_de_iv(v_anuncio.iv_percent);
  end if;
  return new;
end;
$$;

drop trigger if exists market_trades_herda_caracteristicas on dev.market_trades;
create trigger market_trades_herda_caracteristicas
  before insert on dev.market_trades
  for each row execute function dev.trade_herda_caracteristicas();

create index if not exists market_trades_por_grupo_idx
  on dev.market_trades (species_id, is_shiny, iv_faixa, created_at desc)
  where kind = 'poke';

-- ---------------------------------------------------------------------------
-- preco_de_referencia
-- ---------------------------------------------------------------------------
-- Chave: 'item:<item_id>' ou 'poke:<species_id>:<0|1>:<faixa>'. Chave fora do
-- formato e ignorada (sem erro); no maximo 200 por chamada.
--
-- Devolve uma linha por chave x moeda em que haja venda em 7 dias OU anuncio
-- aberto. Chave sem nada nao volta — o cliente le ausencia como "sem vendas,
-- nada a venda".
--
--   mediana_7d   percentile_disc(0.5): um preco que alguem PAGOU, nunca uma
--                media interpolada que ninguem pagou.
--   vendas_7d    quantas vendas entraram na mediana.
--   a_partir_de  menor preco pra comprar AGORA: anuncio de preco fixo, ou o
--                lance que bateria o leilao (lance atual + incremento, ou o
--                lance minimo se ninguem deu lance). Anuncio reservado pra
--                outro jogador fica fora — ninguem mais pode comprar. Item:
--                menor ordem de venda ativa.
--   anuncios     anuncios/ordens de venda abertos.
create or replace function dev.preco_de_referencia(p_chaves text[])
returns table (
  chave text,
  currency text,
  mediana_7d int,
  vendas_7d int,
  a_partir_de int,
  anuncios int
)
language sql
stable
security definer
set search_path = dev, public
as $$
  with chaves as (
    select distinct
      k as chave,
      split_part(k, ':', 1) as tipo,
      split_part(k, ':', 2) as alvo,
      split_part(k, ':', 3) = '1' as shiny,
      nullif(split_part(k, ':', 4), '') as faixa
    from unnest((coalesce(p_chaves, '{}'::text[]))[1:200]) as k
    where k ~ '^item:[a-z0-9_-]+$'
       or k ~ '^poke:[a-z0-9_-]+:[01]:f(0|60|80|95)$'
  ),
  vendas as (
    select c.chave, t.currency,
      percentile_disc(0.5) within group (order by t.unit_price) as mediana,
      count(*)::int as n
    from chaves c
    join dev.market_trades t
      on t.created_at > now() - interval '7 days'
     and (
       (c.tipo = 'item' and t.kind = 'item' and t.item_id = c.alvo)
       or (c.tipo = 'poke' and t.kind = 'poke' and t.species_id = c.alvo
           and t.is_shiny = c.shiny and t.iv_faixa = c.faixa)
     )
    group by c.chave, t.currency
  ),
  abertos_poke as (
    select c.chave, l.currency,
      min(case
        when l.modo = 'leilao' then coalesce(
          (select max(o.valor) from dev.market_offers o
            where o.listing_id = l.id and o.status = 'pendente') + coalesce(l.incremento_minimo, 1),
          l.lance_minimo)
        when l.apenas_oferta or l.price is null then null
        else l.price
      end)::int as minimo,
      count(*)::int as n
    from chaves c
    join dev.market_listings l
      on c.tipo = 'poke'
     and l.status = 'ativo'
     and l.reservado_para is null
     and l.species_id = c.alvo
     and l.is_shiny = c.shiny
     and dev.faixa_de_iv(l.iv_percent) = c.faixa
    group by c.chave, l.currency
  ),
  abertos_item as (
    select c.chave, 'gold'::text as currency, min(o.unit_price)::int as minimo, count(*)::int as n
    from chaves c
    join dev.market_orders o
      on c.tipo = 'item' and o.item_id = c.alvo and o.side = 'venda' and o.status = 'ativa' and o.remaining > 0
    group by c.chave
  ),
  abertos as (
    select * from abertos_poke
    union all
    select * from abertos_item
  )
  select
    coalesce(v.chave, a.chave),
    coalesce(v.currency, a.currency),
    v.mediana,
    coalesce(v.n, 0),
    a.minimo,
    coalesce(a.n, 0)
  from vendas v
  full join abertos a on a.chave = v.chave and a.currency = v.currency
$$;

revoke all on function dev.preco_de_referencia(text[]) from public, anon;
grant execute on function dev.preco_de_referencia(text[]) to authenticated;
grant execute on function dev.faixa_de_iv(int) to authenticated;
