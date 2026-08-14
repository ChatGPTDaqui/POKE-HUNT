-- As hunts deixaram de ser separadas por REGIAO e passaram a ser 12 biomas
-- tematicos x 3 faixas de nivel (ver src/data/biomas.ts). Com isso,
-- `players.unlocked_continents` deixou de guardar continente e passou a
-- guardar o GRUPO DE GATE de cada hunt.
--
--   antes:  johto | kanto | nightmare
--   agora:  faixa1 | faixa2 | faixa3 | nightmare
--
-- faixa1 (Lv1-30) e faixa2 (Lv31-60) nascem abertas. faixa3 (Lv61-90) e o
-- Modo Pesadelo — que inclui as 11 hunts BOSS — sao liberados por derrotar o
-- Campeao Lance, cujo time e Lv55-65, exatamente o fim da faixa2.
--
-- SEM ESTA MIGRATION O JOGO NAO ABRE: nenhum jogador teria um grupo que casa
-- com alguma hunt, entao a lista de hunts sairia vazia pra todo mundo.

alter table public.players
  alter column unlocked_continents set default array['faixa1', 'faixa2'];

-- Jogadores existentes. `kanto` no valor antigo significa "ja venceu o Lance",
-- entao vira os dois grupos que ele abre hoje. Quem nao tinha fica com as duas
-- faixas iniciais. `where true` por causa da extensao safeupdate, que o
-- Supabase carrega no papel da API REST (ver CLAUDE.md).
update public.players
   set unlocked_continents = (
         select array_agg(distinct g)
           from unnest(
             array['faixa1', 'faixa2']
             || case when 'kanto' = any(unlocked_continents)
                     then array['faixa3', 'nightmare']
                     else array[]::text[] end
           ) as g
       )
 where true;

-- ---------------------------------------------------------------------------
-- Progresso da sequencia do Lance entre janelas de flush
-- ---------------------------------------------------------------------------
-- BUG REAL que estas duas colunas corrigem: o servidor simula por JANELAS e
-- reconstroi o mundo a cada flush (~30s). `sequenceIndex` vivia so em
-- `WorldState`, entao TODA janela recomecava no primeiro POKE do Lance — e o
-- `startCountdown` de 5s era pago de novo junto. Na pratica a luta so podia
-- ser vencida se os 6 POKEs dele caissem em ~25 segundos.
--
-- Isso deixou de ser detalhe agora que ele e o portao de metade do conteudo:
-- sem persistir, ninguem passa da faixa2. Mesma classe do bug do `rng_state`
-- (migration `sessao_guarda_o_estado_do_sorteio`): o que precisa sobreviver
-- nao e o mundo, e o PROGRESSO.
alter table public.game_sessions
  add column if not exists sequence_index integer not null default 0,
  add column if not exists sequence_cleared boolean not null default false;
