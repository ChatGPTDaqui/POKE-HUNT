-- Porta pra public a migration 20260811233844 (so tinha rodado em dev).
-- Sem isto, vender_pokes/vender_todos_itens travava com 23503 sempre que o
-- POKE ja tinha passado pelo mercado alguma vez (listing fechada continua
-- referenciando o id, e o FK original bloqueava delete). species/level/rarity/
-- preco ja ficam denormalizados na propria linha de market_listings, entao
-- SET NULL nao perde o historico da venda.
alter table public.market_listings alter column poke_uid drop not null;
alter table public.market_listings drop constraint market_listings_poke_uid_fkey;
alter table public.market_listings add constraint market_listings_poke_uid_fkey
  foreign key (poke_uid) references public.pokemon_instances(id) on delete set null;
