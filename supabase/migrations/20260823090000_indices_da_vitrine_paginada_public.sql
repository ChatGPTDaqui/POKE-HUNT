-- PH-99 — indices pra vitrine de POKE paginada e ordenada no servidor.
--
-- Gemeo dev: `20260823090001_indices_da_vitrine_paginada_dev.sql`.
--
-- DEPENDE DO PH-101 (`market_listings.expira_em`, usado no desempate da
-- ordenacao por preco). Timestamp desta e maior, entao o deploy aplica na ordem
-- certa.
--
-- ===========================================================================
-- O QUE MUDOU NA CONSULTA
-- ===========================================================================
-- A vitrine trazia `select *` sem limite e filtrava/ordenava em memoria no
-- navegador. Duas consequencias, e a segunda era silenciosa:
--
--  1. Custo e latencia cresciam com o Mercado inteiro, nao com o que o jogador
--     ve.
--  2. `.length` no resultado do PostgREST MENTE acima de 1000 linhas — corta e
--     nao avisa. A vitrine simplesmente pararia de mostrar anuncio, sem erro na
--     tela nem no console.
--
-- Agora e `range()` + `count=exact`, com filtro e ordenacao como predicado SQL.
-- Estes indices sao o que impede isso de virar seq scan a cada troca de pagina.
--
-- ===========================================================================
-- POR QUE PARCIAL EM `status = 'ativo'`
-- ===========================================================================
-- A vitrine so olha anuncio ativo, e `market_listings` acumula vendido e
-- cancelado pra sempre (e o historico do jogador). Sem o `where`, o indice
-- cresceria com o passado do Mercado enquanto a consulta so olha o presente —
-- e o indice parcial fica pequeno o suficiente pra caber em cache.
--
-- ===========================================================================
-- O QUE NAO GANHOU INDICE, DE PROPOSITO
-- ===========================================================================
-- A BUSCA (`species_id ilike '%termo%'`). Curinga no inicio nao usa btree, e o
-- que resolveria e um indice GIN de `pg_trgm` — extensao nova, num banco onde
-- o catalogo tem 226 especies e o filtro roda depois do recorte por
-- `status='ativo'`. Nao vale a extensao ainda; revisar se a vitrine passar de
-- alguns milhares de anuncios ativos.
--
-- ORDENAR POR NIVEL e POR IV. Sao as duas ordens menos usadas e o Postgres
-- ordena alguns milhares de linhas em memoria sem sentir. Seis indices mantidos
-- a cada anuncio criado, pra duas ordenacoes eventuais, e o mesmo mau negocio
-- que o ranking de POKE ja recusou (ver docs/08: "os seis criterios de atributo
-- nao ganharam indice, de proposito").

begin;

-- Ordem padrao da vitrine: preco crescente, com anuncio sem preco no fim.
-- `nulls last` no indice espelha o `nullsFirst: false` da consulta — sem isso o
-- planner nao pode usar o indice pra evitar o sort.
create index if not exists market_listings_vitrine_preco_idx
  on public.market_listings (price nulls last)
  where status = 'ativo';

-- Ordem "mais recente".
create index if not exists market_listings_vitrine_recente_idx
  on public.market_listings (created_at desc)
  where status = 'ativo';

commit;
