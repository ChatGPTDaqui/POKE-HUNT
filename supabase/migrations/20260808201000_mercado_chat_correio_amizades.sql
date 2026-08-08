-- Os tres sistemas sociais do jogo, que ate aqui nao existiam em lugar nenhum:
-- Mercado entre jogadores, Chat Mundo e Correio/Amizades.
--
-- REGRA DE ACESSO: nenhuma destas tabelas ganha policy pra `authenticated`.
-- Todo acesso passa pelo servico de autoridade (service_role). Nao e excesso de
-- zelo — uma ordem de venda guarda ESCROW (item que saiu do inventario) e uma
-- entrega guarda ouro a creditar; qualquer escrita direta do cliente aqui seria
-- impressao de dinheiro, e leitura direta exporia o inventario de terceiros.
--
-- Toda tabela abaixo e enable RLS + grant so pra service_role. Sem grant, ate a
-- service_role morre com 42501 (grants deixaram de ser automaticos no schema
-- public em projetos Supabase novos — ver a nota no schema inicial).

-- ===========================================================================
-- 1. Nome de treinador: escolhido no cadastro e unico
-- ===========================================================================
-- "Adicionar amigo pelo nick" e "ver de quem e o POKE do ranking" so funcionam
-- se o nick identificar uma pessoa. Hoje ele nao identifica: `trainer_name`
-- nasce com o default 'Treinador' pra todo mundo.
--
-- De-duplica o que ja existe ANTES de criar o indice unico, senao a migration
-- falha nos 57 jogadores atuais. O sufixo usa os 4 primeiros caracteres do
-- user_id: curto, estavel e nao colide.
update public.players p
set trainer_name = p.trainer_name || '#' || left(p.user_id::text, 4)
where exists (
  select 1 from public.players q
  where lower(q.trainer_name) = lower(p.trainer_name)
    and q.user_id <> p.user_id
);

create unique index if not exists players_trainer_name_unico
  on public.players (lower(trainer_name));

-- Disponibilidade do nick ANTES de o cadastro ser enviado. E consulta de
-- existencia, nao leitura de linha: devolve boolean e nada mais, entao pode
-- ser chamada por quem ainda nem tem conta (a tela de cadastro roda como
-- `anon`). Sem ela, o unico jeito de descobrir que o nome esta em uso seria
-- criar a conta e receber um erro de constraint.
create or replace function public.nome_de_treinador_disponivel(nome text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.players where lower(trainer_name) = lower(trim(nome))
  )
$$;

revoke all on function public.nome_de_treinador_disponivel(text) from public;
grant execute on function public.nome_de_treinador_disponivel(text) to anon, authenticated, service_role;

-- O nome escolhido viaja em `raw_user_meta_data` (options.data do signUp) e e
-- gravado na MESMA transacao que cria a conta. Alternativa seria o cliente
-- fazer um UPDATE logo apos o cadastro — que a RLS (corretamente) proibe desde
-- a Fase D, e que deixaria uma janela com o nome errado.
--
-- Colisao aqui e ultimo recurso (a tela ja checou): em vez de derrubar o
-- cadastro com "Database error saving new user", desambigua com sufixo. Perder
-- a conta por causa de um nick e desproporcional.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pedido text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'trainer_name', '')), '');
  escolhido text;
begin
  escolhido := coalesce(pedido, 'Treinador');
  if exists (select 1 from public.players where lower(trainer_name) = lower(escolhido)) then
    escolhido := escolhido || '#' || left(new.id::text, 4);
  end if;

  insert into public.players (user_id, trainer_name, unlocked_maps)
  values (new.id, escolhido, public.hunts_iniciais());

  insert into public.player_items (user_id, item_id, quantity)
  select new.id, c.item_id, c.quantity
  from public.concessao_inicial_de_itens() c;

  return new;
end;
$$;

-- ===========================================================================
-- 2. Mercado — livro de ofertas de ITENS
-- ===========================================================================
-- Modelo pedido: "leilao/livro de ofertas, semelhante ao Mercado Comunitario da
-- Steam". Ou seja duas filas por item (compra e venda) que se cruzam por preco.
--
-- `item_id` NAO tem FK pra `items`: as 17 Pedras de evolucao sao conteudo
-- hand-authored do cliente (data/stones.ts) e nunca entraram no catalogo do
-- banco. Uma FK aqui proibiria negociar exatamente o item mais escasso do jogo.
--
-- ESCROW e o que impede vender o que nao se tem: criar uma ordem de VENDA tira
-- os itens do inventario na hora, e criar uma de COMPRA tira o ouro. O que
-- sobra volta no cancelamento. Sem escrow, duas ordens de venda do mesmo
-- estoque venderiam o dobro do que existe.
create table public.market_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null,
  side text not null check (side in ('compra', 'venda')),
  unit_price int not null check (unit_price > 0 and unit_price <= 100000000),
  quantity int not null check (quantity > 0),
  remaining int not null check (remaining >= 0),
  -- Ouro ainda retido por esta ordem de compra (0 em ordens de venda). Guardado
  -- explicitamente, e nao recalculado de `remaining * unit_price`, porque a
  -- ordem agressora pode executar mais barato que o proprio limite — o troco ja
  -- foi devolvido e o retido nao bate mais com a multiplicacao.
  gold_retido int not null default 0 check (gold_retido >= 0),
  status text not null default 'ativa' check (status in ('ativa', 'concluida', 'cancelada')),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint market_orders_remaining_cabe check (remaining <= quantity)
);

-- O casamento varre "melhor preco primeiro, mais antiga primeiro" dentro de um
-- item. Este e o unico caminho de leitura quente do Mercado.
create index market_orders_livro_idx
  on public.market_orders (item_id, side, unit_price, created_at)
  where status = 'ativa';
create index market_orders_do_jogador_idx on public.market_orders (user_id, created_at desc);

-- ===========================================================================
-- 3. Mercado — anuncios de POKE (preco fixo)
-- ===========================================================================
-- Pedido explicito: POKE nao entra no livro de ofertas; o vendedor define um
-- preco fixo em Gold ou Diamante. Faz sentido no dado: um item e fungivel (100
-- Poke Ball sao 100 Poke Ball), um POKE nao — IV, raridade e shiny fazem cada
-- linha ser unica, e nao existe "melhor preco" entre coisas diferentes.
create table public.market_listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references auth.users(id) on delete cascade,
  -- `restrict` de proposito: apagar um POKE que esta anunciado deixaria o
  -- anuncio orfao. Quem cancela/vende o anuncio devolve o POKE antes.
  poke_uid uuid not null references public.pokemon_instances(id) on delete restrict,
  price int not null check (price > 0 and price <= 100000000),
  currency text not null check (currency in ('gold', 'diamond')),
  status text not null default 'ativo' check (status in ('ativo', 'vendido', 'cancelado')),
  -- Copias desnormalizadas pra vitrine: a busca do comprador filtra por
  -- especie/nivel/raridade/shiny sem precisar juntar com `pokemon_instances`
  -- (que a service_role le, mas que traria a linha inteira de outro jogador).
  species_id text not null,
  level int not null,
  rarity rarity_tier not null,
  is_shiny boolean not null default false,
  iv_percent int not null default 0,
  created_at timestamptz not null default now(),
  sold_at timestamptz,
  buyer_id uuid references auth.users(id) on delete set null
);

create unique index market_listings_um_anuncio_ativo_por_poke
  on public.market_listings (poke_uid) where status = 'ativo';
create index market_listings_vitrine_idx
  on public.market_listings (species_id, price) where status = 'ativo';
create index market_listings_do_vendedor_idx on public.market_listings (seller_id, created_at desc);

-- ===========================================================================
-- 4. Mercado — historico
-- ===========================================================================
-- Tabela propria, e nao "ordens com status concluida": uma unica ordem de venda
-- de 100 unidades pode casar com 7 compradores diferentes a precos diferentes.
-- O historico e por NEGOCIO, nao por ordem.
create table public.market_trades (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('item', 'poke')),
  item_id text,
  species_id text,
  quantity int not null default 1 check (quantity > 0),
  unit_price int not null check (unit_price > 0),
  currency text not null default 'gold' check (currency in ('gold', 'diamond')),
  buyer_id uuid references auth.users(id) on delete set null,
  seller_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index market_trades_recentes_idx on public.market_trades (created_at desc);
create index market_trades_por_item_idx on public.market_trades (item_id, created_at desc) where item_id is not null;

-- ===========================================================================
-- 5. Entregas pendentes
-- ===========================================================================
-- O PROBLEMA QUE ESTA TABELA RESOLVE: quando A compra de B, B pode estar
-- offline — ou pior, no meio de um flush. O servidor grava o estado do jogador
-- reescrevendo o snapshot inteiro (`gravarEstado`), entao creditar ouro na
-- linha de B com um UPDATE solto seria sobrescrito pelo flush de B segundos
-- depois, sem erro nenhum aparecer.
--
-- Em vez disso o credito vira uma LINHA. Ela e reivindicada (claim atomico:
-- update ... where claimed_at is null returning) dentro do proprio request de B,
-- e aplicada ao estado que aquele request ja vai gravar. Nao ha janela.
create table public.market_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  gold int not null default 0 check (gold >= 0),
  diamonds int not null default 0 check (diamonds >= 0),
  item_id text,
  quantity int not null default 0 check (quantity >= 0),
  motivo text not null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);

create index market_deliveries_pendentes_idx
  on public.market_deliveries (user_id) where claimed_at is null;

-- ===========================================================================
-- 6. Chat Mundo
-- ===========================================================================
-- So mensagem DE JOGADOR. Aviso de sistema, log de combate e resultado de
-- compra continuam vivendo no cliente (toastStore) — pedido explicito: "isole o
-- Chat Mundo para que ele receba apenas mensagens ao vivo enviadas por outros
-- jogadores".
--
-- `anexos` guarda os links de item/POKE que o jogador injetou com Shift+clique.
-- Guardar o SNAPSHOT (nome, nivel, IV, raridade) e nao so um id e deliberado: o
-- POKE pode ser vendido ou evoluir depois, e o link tem que continuar mostrando
-- o que foi mostrado na hora — alem de nao dar a ninguem um jeito de consultar
-- POKE alheio por id.
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trainer_name text not null,
  body text not null check (char_length(body) between 1 and 240),
  anexos jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index chat_messages_recentes_idx on public.chat_messages (created_at desc);

-- ===========================================================================
-- 7. Correio e amizades
-- ===========================================================================
create table public.mail_messages (
  id uuid primary key default gen_random_uuid(),
  para_id uuid not null references auth.users(id) on delete cascade,
  de_id uuid references auth.users(id) on delete set null,
  de_nome text not null,
  tipo text not null check (tipo in ('texto', 'pedido_amizade', 'sistema')),
  assunto text not null,
  corpo text not null default '',
  -- 'pendente' so tem significado em pedido de amizade; mensagem de texto nasce
  -- 'pendente' e vira 'lido'. Um enum separado por tipo seria mais puro e
  -- obrigaria dois caminhos de leitura pra mesma caixa de entrada.
  estado text not null default 'pendente' check (estado in ('pendente', 'aceito', 'recusado', 'lido')),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index mail_messages_caixa_idx on public.mail_messages (para_id, created_at desc);
-- Um pedido de amizade pendente por par. Sem isto, spam de "Adicionar amigo"
-- enche a caixa do destinatario com linhas identicas.
create unique index mail_messages_um_pedido_pendente
  on public.mail_messages (para_id, de_id)
  where tipo = 'pedido_amizade' and estado = 'pendente';

-- Amizade e simetrica, e guardada nos DOIS sentidos (duas linhas por par). A
-- alternativa — uma linha com `least/greatest` — economiza metade das linhas e
-- custa um `or` em toda consulta de "meus amigos", que e a unica consulta que
-- existe aqui.
create table public.friendships (
  user_id uuid not null references auth.users(id) on delete cascade,
  amigo_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, amigo_id),
  constraint amizade_nao_reflexiva check (user_id <> amigo_id)
);

-- ===========================================================================
-- 8. RLS e grants
-- ===========================================================================
alter table public.market_orders     enable row level security;
alter table public.market_listings   enable row level security;
alter table public.market_trades     enable row level security;
alter table public.market_deliveries enable row level security;
alter table public.chat_messages     enable row level security;
alter table public.mail_messages     enable row level security;
alter table public.friendships       enable row level security;

-- Zero policy pra anon/authenticated: RLS ligada sem policy = ninguem fora da
-- service_role enxerga nada. Intencional — ver o cabecalho.
grant select, insert, update, delete on public.market_orders     to service_role;
grant select, insert, update, delete on public.market_listings   to service_role;
grant select, insert, update, delete on public.market_trades     to service_role;
grant select, insert, update, delete on public.market_deliveries to service_role;
grant select, insert, update, delete on public.chat_messages     to service_role;
grant select, insert, update, delete on public.mail_messages     to service_role;
grant select, insert, update, delete on public.friendships       to service_role;
