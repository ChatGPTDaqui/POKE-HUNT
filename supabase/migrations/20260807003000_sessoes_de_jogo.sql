-- Sessao de jogo: a unidade que o SERVIDOR usa pra saber quanto tempo simular.
--
-- Sem isto, quem diria "passei 40 minutos cacando" seria o cliente, e a mentira
-- mais barata do jogo seria simplesmente inflar esse numero. A regra e: o
-- cliente declara INTENCAO (em qual hunt esta, com qual POKE); quanto tempo
-- passou e sempre `now()` menos `last_flush_at`, medido aqui, no relogio do
-- servidor.
--
-- `seed` tambem nasce aqui, e nao no cliente: e ela que determina shiny, IV,
-- raridade e crit (ver core/rng.ts). Deixar o cliente escolher a semente seria
-- deixar ele procurar a que da shiny.
create table game_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  map_id text not null references maps(id) on delete restrict,
  -- Qual POKE o jogador declarou levar. Validado contra `pokemon_instances` na
  -- abertura: nao adianta declarar um POKE que nao e seu ou que esta na mochila.
  poke_uid uuid not null references pokemon_instances(id) on delete cascade,

  -- int8 e nao int4: a semente e um inteiro de 32 bits COM SINAL no motor
  -- (`seed | 0`), e o Postgres nao tem uint32. Guardar o valor com sinal em int8
  -- evita conversao implicita nas pontas.
  seed bigint not null,

  started_at timestamptz not null default now(),
  -- O relogio de referencia do proximo flush. Avanca a cada simulacao aplicada.
  last_flush_at timestamptz not null default now(),
  -- Quanto tempo de jogo esta sessao ja rendeu. So auditoria/diagnostico — a
  -- decisao de quanto simular nunca sai daqui, sai do relogio.
  simulated_seconds numeric not null default 0,
  closed_at timestamptz
);

create index game_sessions_abertas on game_sessions (user_id) where closed_at is null;

alter table game_sessions enable row level security;

-- O jogador PODE ler a propria sessao (a UI mostra em qual hunt esta), mas nao
-- pode criar, alterar nem fechar: isso e exatamente o que o servidor faz com a
-- `service_role`, que ignora RLS. Sem policy de insert/update/delete, qualquer
-- tentativa do cliente casa zero linhas.
--
-- Cuidado ao testar: um DELETE do cliente volta **200, nao 403** — a RLS
-- simplesmente nao encontra linha pra apagar. Teste adversarial tem que
-- afirmar o efeito no banco, nunca o status code.
create policy "jogador le a propria sessao" on game_sessions
  for select to authenticated using (auth.uid() = user_id);
