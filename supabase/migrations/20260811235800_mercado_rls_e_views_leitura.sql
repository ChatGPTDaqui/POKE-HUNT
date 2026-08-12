
-- market_offers nao tinha NENHUMA policy de SELECT -- ninguem conseguia ler
-- ofertas via client. Comprador ve as proprias; vendedor ve as recebidas nos
-- proprios anuncios.
create policy "oferta leitura propria (comprador)" on dev.market_offers
  for select to authenticated using (buyer_id = auth.uid());
create policy "oferta leitura propria (vendedor)" on dev.market_offers
  for select to authenticated using (
    exists (select 1 from dev.market_listings l where l.id = market_offers.listing_id and l.seller_id = auth.uid())
  );

-- Negocios (trades) viram publicos, mesmo padrao ja aplicado a ordens/anuncios
-- ativos: sinal de preco de mercado e informacao publica do jogo.
create policy "trade leitura publica" on dev.market_trades
  for select to authenticated using (true);

-- Resumo por item: so item com ALGUMA ordem ativa (mesmo filtro que o client
-- ja aplicava sobre a resposta do server antigo).
create view dev.mercado_resumo_itens with (security_invoker = true) as
select item_id,
  max(unit_price) filter (where side = 'compra') as melhor_compra,
  min(unit_price) filter (where side = 'venda') as melhor_venda,
  coalesce(sum(remaining) filter (where side = 'venda'), 0)::int as em_venda,
  coalesce(sum(remaining) filter (where side = 'compra'), 0)::int as em_compra
from dev.market_orders
where status = 'ativa' and remaining > 0
group by item_id;

-- Anuncios ativos com nome do vendedor + contagem/melhor oferta -- o que a
-- vitrine de Comprar Pokes precisa numa unica leitura.
create view dev.mercado_anuncios_ativos with (security_invoker = true) as
select l.*, t.trainer_name as vendedor,
  (select count(*) from dev.market_offers o where o.listing_id = l.id and o.status = 'pendente')::int as ofertas,
  (select max(valor) from dev.market_offers o where o.listing_id = l.id and o.status = 'pendente') as melhor_oferta
from dev.market_listings l
join dev.treinadores_publico t on t.user_id = l.seller_id
where l.status = 'ativo';

-- Ofertas pendentes recebidas nos MEUS anuncios, com nome do ofertante e o
-- anuncio embutido (join feito aqui pra o client nao precisar de 2 leituras).
create view dev.mercado_ofertas_recebidas with (security_invoker = true) as
select o.*, t.trainer_name as comprador, l.seller_id, l.species_id, l.level, l.is_shiny
from dev.market_offers o
join dev.market_listings l on l.id = o.listing_id
join dev.treinadores_publico t on t.user_id = o.buyer_id
where o.status = 'pendente';

revoke all on dev.mercado_resumo_itens from public;
revoke all on dev.mercado_anuncios_ativos from public;
revoke all on dev.mercado_ofertas_recebidas from public;
grant select on dev.mercado_resumo_itens to authenticated;
grant select on dev.mercado_anuncios_ativos to authenticated;
grant select on dev.mercado_ofertas_recebidas to authenticated;
