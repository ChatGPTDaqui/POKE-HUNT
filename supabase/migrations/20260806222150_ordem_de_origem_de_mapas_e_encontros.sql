-- Complemento de `ordem_de_origem_do_catalogo`: a ordem tambem e dado real em
-- `maps` e `map_encounters`, e faltou nas duas.
--
-- map_encounters  A hunt inicial (route_46) tem 3 especies cuja ordem vem da
--                 aba Encontros: geodude, spearow, rattata. Nao e alfabetica,
--                 nem por Pokedex (74, 21, 19), nem por taxa de captura (as 3
--                 sao 255) — nao ha chave que a reproduza, e ela decide a
--                 ordem do `enemyPool` no maps.generated.ts. As outras 18
--                 hunts nao dependem disto (a ordem delas e recalculada pela
--                 curadoria por tipo, que continua viva em sync-planilha.js),
--                 mas guardar so pra uma seria uma pegadinha esperando quem
--                 mexer nisso depois.
--
-- maps            A ordem das 19 hunts no arquivo gerado e a ordem em que o
--                 pipeline as cria (inicial, depois os 9 brackets por nivel,
--                 2 biomas cada). Derivar isso de volta exigia adivinhar o
--                 prefixo do bracket a partir do id — guardar o indice torna
--                 a releitura um `order by sort_order`.

alter table public.maps add column if not exists sort_order int not null default 0;
alter table public.map_encounters add column if not exists sort_order int not null default 0;

comment on column public.maps.sort_order is
  'Ordem em que o pipeline cria as hunts. Define a ordem das chaves no arquivo gerado.';
comment on column public.map_encounters.sort_order is
  'Ordem de origem do encontro dentro do mapa. Define a ordem do enemyPool.';
