-- PH-97 — historico de preco e volume do Mercado.
--
-- Gemeo public: `20260823050000_historico_de_preco_no_mercado_public.sql`.
--
-- ===========================================================================
-- O DADO SEMPRE EXISTIU. NUNCA FOI EXPOSTO.
-- ===========================================================================
-- `market_trades` guarda preco unitario, quantidade, moeda e timestamp de toda
-- negociacao desde a primeira migration do Mercado. A tela mostrava as 15
-- ultimas linhas cruas do item e nada mais: sem mediana, sem volume, sem
-- tendencia. Quem ia anunciar chutava o preco.
--
-- ===========================================================================
-- POR QUE VIEW AGREGADA, E NAO AS LINHAS CRUAS
-- ===========================================================================
-- Calcular mediana no navegador exige BAIXAR 30 dias de negociacao por item.
-- Num item liquido isso e milhares de linhas por abertura de aba — e o
-- PostgREST corta em 1000 sem erro nenhum (armadilha ja documentada neste
-- projeto), entao a "mediana" sairia de uma amostra truncada em silencio, que e
-- pior que nao ter mediana.
--
-- ===========================================================================
-- MEDIANA, E NAO MEDIA
-- ===========================================================================
-- Uma unica negociacao de dedo gordo (Poke Ball a 900.000) desloca a media e o
-- jogador ancora nela. `percentile_disc` e nao `percentile_cont` de propósito:
-- ele devolve um preco REALMENTE negociado em vez de interpolar dois — "a
-- mediana e 47,5" nao e um preco que existiu.
--
-- ===========================================================================
-- POR QUE A MOEDA ENTRA NO AGRUPAMENTO
-- ===========================================================================
-- Anuncio de POKE e em Ouro OU Diamante, e as duas escalas nao tem relacao
-- nenhuma (1 diamante nao vale 1 ouro). Uma mediana que misturasse as duas
-- seria um numero sem significado, e pior: pareceria um numero valido.
--
-- Item hoje e sempre em ouro (`criar_ordem_mercado` grava currency='gold'), mas
-- o agrupamento vai igual — se algum dia entrar outra moeda no livro, ela se
-- separa sozinha em vez de poluir a serie antiga.
--
-- ===========================================================================
-- IDENTIDADE NAO SAI DAQUI
-- ===========================================================================
-- Nenhuma das quatro views projeta `buyer_id`/`seller_id`. Agregado por dia nao
-- expoe quem negociou, e essa e a condicao pra o historico poder ser leitura
-- publica. `security_invoker = true` (mesmo padrao das views de mercado que ja
-- existem) faz a RLS do CHAMADOR valer — e a policy `trade leitura publica`
-- ja libera select em market_trades pra `authenticated`.

begin;

-- ===========================================================================
-- Indice por especie
-- ===========================================================================
-- `market_trades_por_item_idx` cobre `(item_id, created_at desc)` e serve o
-- lado de ITEM desde sempre. O lado de POKE nao tinha equivalente: a agregacao
-- por especie varreria a tabela inteira a cada cartao de anuncio aberto.
create index if not exists market_trades_por_especie_idx
  on dev.market_trades (species_id, created_at desc)
  where species_id is not null;

-- ===========================================================================
-- Serie diaria — 30 dias, por item
-- ===========================================================================
-- `item_id`/`currency` sao colunas de agrupamento, entao o filtro do cliente
-- (`where item_id = 'poke_ball'`) desce pra dentro da view e usa o indice em
-- vez de agregar o mercado inteiro pra descartar tudo menos uma linha.
create or replace view dev.mercado_historico_itens with (security_invoker = true) as
select
  item_id,
  currency,
  (created_at at time zone 'utc')::date as dia,
  percentile_disc(0.5) within group (order by unit_price) as mediana,
  min(unit_price) as minimo,
  max(unit_price) as maximo,
  sum(quantity)::bigint as volume,
  count(*)::int as negocios
from dev.market_trades
where kind = 'item'
  and item_id is not null
  and created_at >= now() - interval '30 days'
group by item_id, currency, (created_at at time zone 'utc')::date;

create or replace view dev.mercado_historico_pokes with (security_invoker = true) as
select
  species_id,
  currency,
  (created_at at time zone 'utc')::date as dia,
  percentile_disc(0.5) within group (order by unit_price) as mediana,
  min(unit_price) as minimo,
  max(unit_price) as maximo,
  sum(quantity)::bigint as volume,
  count(*)::int as negocios
from dev.market_trades
where kind = 'poke'
  and species_id is not null
  and created_at >= now() - interval '30 days'
group by species_id, currency, (created_at at time zone 'utc')::date;

-- ===========================================================================
-- Resumo — 24h / 7d / 30d
-- ===========================================================================
-- Views SEPARADAS da serie diaria, e nao derivadas dela, porque a pergunta e
-- outra: "mediana de 24h" tirada dos baldes diarios seria a mediana do dia
-- corrente (que as 00h05 tem cinco minutos de dado), nao a das ultimas 24
-- horas. `filter` dentro do `within group` deixa as tres janelas sairem numa
-- passada so.
create or replace view dev.mercado_resumo_historico_itens with (security_invoker = true) as
select
  item_id,
  currency,
  percentile_disc(0.5) within group (order by unit_price)
    filter (where created_at >= now() - interval '24 hours') as mediana_24h,
  percentile_disc(0.5) within group (order by unit_price)
    filter (where created_at >= now() - interval '7 days') as mediana_7d,
  coalesce(sum(quantity) filter (where created_at >= now() - interval '24 hours'), 0)::bigint as volume_24h,
  coalesce(sum(quantity), 0)::bigint as volume_30d,
  count(*)::int as negocios_30d
from dev.market_trades
where kind = 'item'
  and item_id is not null
  and created_at >= now() - interval '30 days'
group by item_id, currency;

create or replace view dev.mercado_resumo_historico_pokes with (security_invoker = true) as
select
  species_id,
  currency,
  percentile_disc(0.5) within group (order by unit_price)
    filter (where created_at >= now() - interval '24 hours') as mediana_24h,
  percentile_disc(0.5) within group (order by unit_price)
    filter (where created_at >= now() - interval '7 days') as mediana_7d,
  coalesce(sum(quantity) filter (where created_at >= now() - interval '24 hours'), 0)::bigint as volume_24h,
  coalesce(sum(quantity), 0)::bigint as volume_30d,
  count(*)::int as negocios_30d
from dev.market_trades
where kind = 'poke'
  and species_id is not null
  and created_at >= now() - interval '30 days'
group by species_id, currency;

-- `revoke ... from public` antes do grant: mesmo cuidado das views de mercado
-- que ja existem. Sem ele, `anon` herda o select do papel `PUBLIC` do Postgres
-- e o historico fica legivel sem sessao.
revoke all on dev.mercado_historico_itens from public;
revoke all on dev.mercado_historico_pokes from public;
revoke all on dev.mercado_resumo_historico_itens from public;
revoke all on dev.mercado_resumo_historico_pokes from public;
grant select on dev.mercado_historico_itens to authenticated;
grant select on dev.mercado_historico_pokes to authenticated;
grant select on dev.mercado_resumo_historico_itens to authenticated;
grant select on dev.mercado_resumo_historico_pokes to authenticated;

commit;
