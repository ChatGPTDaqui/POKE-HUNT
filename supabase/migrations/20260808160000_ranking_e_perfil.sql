-- Ranking, Hall da Fama e as duas metricas do Perfil do Treinador que ainda
-- nao existiam em lugar nenhum.
--
-- Nada aqui e lido pelo cliente: as tres tabelas/colunas so sao consultadas
-- pelo servico de autoridade, com a `service_role`. As policies refletem
-- isso (RLS ligada, nenhuma policy pro papel `authenticated`) — um ranking
-- lido direto do navegador exporia a linha inteira de `players` de todo
-- mundo, nao so nome e nivel.

-- ---------------------------------------------------------------------------
-- 1. Tempo de jogo — sem coluna nova
-- ---------------------------------------------------------------------------
-- "Tempo de jogo" tem que ser o tempo REALMENTE simulado, nao a idade da
-- conta: quem criou conta ha um ano e jogou uma tarde nao tem um ano de jogo.
-- Esse numero JA e acumulado por sessao em `game_sessions.simulated_seconds`
-- (cada flush soma o intervalo creditado), e as sessoes fechadas continuam na
-- tabela — entao o total do jogador e a soma das linhas dele.
--
-- Uma coluna `players.play_seconds` seria O(1) na leitura, mas custaria uma
-- escrita a mais em TODO flush (30 em 30 segundos por jogador ativo) pra um
-- dado consultado so quando alguem abre o Perfil. O indice abaixo torna a
-- soma barata.
create index if not exists game_sessions_por_jogador_idx
  on public.game_sessions (user_id);

-- ---------------------------------------------------------------------------
-- 2. Hall da Fama
-- ---------------------------------------------------------------------------
-- Quem derrota o Campeao Lance ganha `kanto` em `unlocked_continents` — mas
-- essa coluna nao guarda QUANDO, e "os primeiros a completar" e uma ordem
-- por tempo. Uma tabela propria tambem deixa o recurso aberto pra outras
-- conquistas sem mais nenhuma migration.
create table if not exists public.hall_da_fama (
  user_id uuid not null references public.players(user_id) on delete cascade,
  conquista text not null,
  conquistado_em timestamptz not null default now(),
  primary key (user_id, conquista)
);

-- A consulta do Hall e sempre "os N primeiros de uma conquista".
create index if not exists hall_da_fama_ordem_idx
  on public.hall_da_fama (conquista, conquistado_em);

alter table public.hall_da_fama enable row level security;
-- Sem policy pra anon/authenticated: so a service_role (que ignora RLS)
-- enxerga. O ranking chega ao jogador pela rota do servidor, ja recortado
-- em nome + data.
grant select, insert on public.hall_da_fama to service_role;

-- ---------------------------------------------------------------------------
-- 3. Indices de ranking
-- ---------------------------------------------------------------------------
-- Ranking de treinadores ordena por nivel e desempata por EXP; o "Rank #" do
-- Perfil conta quantos tem EXP maior. Os dois usam o mesmo indice.
create index if not exists players_ranking_idx
  on public.players (trainer_exp desc, trainer_level desc);

-- Ranking de POKE por nivel. Os outros seis criterios (os atributos) NAO
-- ganham indice de proposito: seriam mais seis indices mantidos a cada
-- escrita de POKE, e a tabela hoje tem ordem de milhares de linhas — o scan
-- e mais barato que o custo permanente. Revisar se a base crescer de escala.
create index if not exists pokemon_instances_level_idx
  on public.pokemon_instances (level desc);
