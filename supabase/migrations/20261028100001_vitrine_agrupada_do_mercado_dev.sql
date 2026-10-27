-- (par DEV) Vitrine agrupada e historico por grupo (28/10/2026) — PR 2 do preco medio.
-- Spec: docs/planos/2026-10-27-mercado-preco-medio-design.md
--
-- 1. `vitrine_de_pokes(...)`: um card por GRUPO (espécie + shiny + faixa de IV
--    + moeda), com quantos anuncios e o "a partir de". Os filtros da vitrine
--    valem sobre os ANUNCIOS antes de agrupar (IV minimo, nivel, raridade, so
--    lance...), e o total de grupos vem na propria linha (`total`), pra a tela
--    paginar sem `.length` — regra critica do projeto (corte silencioso de
--    1000 linhas do PostgREST).
--
--    Le de `mercado_anuncios_ativos`, e nao de `market_listings` cru: e ali que
--    mora a regra de reserva (anuncio reservado so aparece pro vendedor e pro
--    reservado). A funcao e `security invoker`, entao a view resolve
--    `auth.uid()` de quem chamou, igual a vitrine de sempre.
--
-- 2. `mercado_historico_grupos`: a serie diaria de 30 dias por grupo, mesmo
--    formato de `mercado_historico_pokes`. So vendas com faixa gravada (a
--    partir da 8.56); as antigas continuam na serie por espécie.

create or replace function dev.vitrine_de_pokes(
  p_termo text default null,
  p_moedas text[] default null,
  p_raridades text[] default null,
  p_shiny boolean default null,
  p_nivel_min int default null,
  p_iv_min int default null,
  p_so_lance boolean default null,
  p_ordem text default 'preco',
  p_pagina int default 0,
  p_por_pagina int default 24
)
returns table (
  species_id text,
  is_shiny boolean,
  iv_faixa text,
  currency text,
  anuncios int,
  a_partir_de int,
  maior_nivel int,
  recente timestamptz,
  total bigint
)
language sql
stable
set search_path = dev, public
as $$
  with filtrados as (
    select a.*, dev.faixa_de_iv(a.iv_percent) as faixa
    from dev.mercado_anuncios_ativos a
    where (p_termo is null or a.species_id ilike '%' || lower(p_termo) || '%')
      and (p_moedas is null or a.currency = any(p_moedas))
      and (p_raridades is null or a.rarity::text = any(p_raridades))
      and (p_shiny is not true or a.is_shiny)
      and (p_nivel_min is null or a.level >= p_nivel_min)
      and (p_iv_min is null or a.iv_percent >= p_iv_min)
      and (p_so_lance is not true or a.apenas_oferta)
  ),
  grupos as (
    select
      f.species_id, f.is_shiny, f.faixa as iv_faixa, f.currency,
      count(*)::int as anuncios,
      min(case
        when f.modo = 'leilao' then coalesce(f.melhor_oferta + coalesce(f.incremento_minimo, 1), f.lance_minimo)
        when f.apenas_oferta or f.price is null then null
        else f.price
      end)::int as a_partir_de,
      max(f.level)::int as maior_nivel,
      max(f.created_at) as recente
    from filtrados f
    group by f.species_id, f.is_shiny, f.faixa, f.currency
  )
  select g.*, count(*) over () as total
  from grupos g
  order by
    case when p_ordem = 'anunciados' then -g.anuncios end nulls last,
    case when p_ordem = 'recente' then g.recente end desc nulls last,
    case when p_ordem = 'nivel' then -g.maior_nivel end nulls last,
    case when p_ordem = 'iv' then g.iv_faixa end desc nulls last,
    g.a_partir_de asc nulls last,
    g.species_id, g.is_shiny, g.iv_faixa, g.currency
  limit least(greatest(coalesce(p_por_pagina, 24), 1), 60)
  offset greatest(coalesce(p_pagina, 0), 0) * least(greatest(coalesce(p_por_pagina, 24), 1), 60)
$$;

revoke all on function dev.vitrine_de_pokes(text, text[], text[], boolean, int, int, boolean, text, int, int) from public, anon;
grant execute on function dev.vitrine_de_pokes(text, text[], text[], boolean, int, int, boolean, text, int, int) to authenticated;

create or replace view dev.mercado_historico_grupos with (security_invoker = true) as
select
  species_id,
  is_shiny,
  iv_faixa,
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
  and iv_faixa is not null
  and created_at >= now() - interval '30 days'
group by species_id, is_shiny, iv_faixa, currency, (created_at at time zone 'utc')::date;

revoke all on dev.mercado_historico_grupos from public;
grant select on dev.mercado_historico_grupos to authenticated;
