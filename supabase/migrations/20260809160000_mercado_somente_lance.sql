-- Mercado: modo "Somente Lance" para anúncios de POKE.
--
-- Um anúncio normal tem preço de compra direta. Um anúncio "somente lance" não
-- tem preço nenhum: outros jogadores enviam ofertas e o vendedor aceita ou
-- recusa. Por isso `price` passa a aceitar NULL, com uma check que amarra as
-- duas colunas — anúncio sem preço PRECISA estar marcado como somente-lance, e
-- anúncio com preço não pode estar. Sem a check, uma linha meio-preenchida
-- ficaria invisível na vitrine (sem preço para mostrar) e não compraria nem por
-- oferta.
alter table public.market_listings
  add column if not exists apenas_oferta boolean not null default false;

alter table public.market_listings
  alter column price drop not null;

alter table public.market_listings
  drop constraint if exists market_listings_preco_coerente;

alter table public.market_listings
  add constraint market_listings_preco_coerente
  check (case when apenas_oferta then price is null else price is not null end);

-- Ofertas sobre um anúncio.
--
-- O ouro/diamante é retido no momento em que a oferta é criada (ESCROW), como
-- já acontece com a ordem de compra de item. Sem isso, dez ofertas do mesmo
-- jogador com o mesmo ouro seriam todas aceitáveis, e a nona aceita não teria
-- como ser paga — o vendedor entregaria o POKE de graça.
create table if not exists public.market_offers (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.market_listings(id) on delete cascade,
  buyer_id uuid not null references auth.users(id) on delete cascade,
  valor bigint not null check (valor > 0),
  currency text not null check (currency in ('gold', 'diamond')),
  status text not null default 'pendente'
    check (status in ('pendente', 'aceita', 'recusada', 'cancelada')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- Uma oferta pendente por (anúncio, comprador): reenviar substitui, não
-- empilha. Parcial porque as resolvidas ficam como histórico e podem repetir o
-- par à vontade.
create unique index if not exists market_offers_uma_pendente
  on public.market_offers (listing_id, buyer_id)
  where status = 'pendente';

create index if not exists market_offers_por_anuncio
  on public.market_offers (listing_id)
  where status = 'pendente';

create index if not exists market_offers_por_comprador
  on public.market_offers (buyer_id, status);

-- Mesma postura das outras tabelas de mercado: RLS ligada e NENHUMA policy para
-- `authenticated`. Quem lê e escreve é o serviço de autoridade com
-- `service_role` — uma policy de leitura aqui exporia quanto cada jogador está
-- disposto a pagar por um POKE antes de a oferta ser respondida.
alter table public.market_offers enable row level security;
