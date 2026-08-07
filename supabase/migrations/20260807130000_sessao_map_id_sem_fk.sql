-- `game_sessions.map_id` tinha um FK pra `maps(id)`. As hunts do Modo Pesadelo
-- e as 11 hunts BOSS sao geradas em RUNTIME (data/nightmareMaps.ts) e NUNCA
-- entram na tabela `maps` — abrir sessao numa delas violava o FK, o INSERT
-- estourava e o `/sessao/abrir` respondia 502. Resultado: todo o endgame (19
-- espelhos do Pesadelo + 11 BOSS) era injogavel sob autoridade do servidor, que
-- e o unico modo desde que a RLS foi revogada.
--
-- O FK era redundante: o servidor JA valida em codigo que o mapa existe
-- (`app.ts#abrirSessao`: `if (!MAPS[mapId]) 400`), que a hunt esta desbloqueada
-- e que o continente esta liberado — a mesma regra real do jogo que o fix de
-- desbloqueio do D3 adotou no lugar de confiar na coluna `unlocked_maps`. A
-- coluna continua `text not null`; so o vinculo com o catalogo sai.
--
-- Dropar pelo nome real (achado em `pg_constraint`), e nao por um
-- `drop constraint if exists game_sessions_map_id_fkey`: se o nome divergisse do
-- palpite, o IF EXISTS no-op deixaria o FK vivo e o bug de pe — em silencio,
-- justamente o modo de falha que este projeto recusa.
do $$
declare
  nome text;
begin
  select conname into nome
  from pg_constraint
  where conrelid = 'public.game_sessions'::regclass
    and contype = 'f'
    and confrelid = 'public.maps'::regclass;
  if nome is not null then
    execute format('alter table public.game_sessions drop constraint %I', nome);
  end if;
end $$;
