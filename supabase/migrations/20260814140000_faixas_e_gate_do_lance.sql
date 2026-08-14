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

-- ---------------------------------------------------------------------------
-- Salas
-- ---------------------------------------------------------------------------
-- Uma hunt e percorrida em 10 SALAS, e cada sala e um sub-bioma sorteado do
-- bioma dela (ver src/data/biomas.ts e engine/systems/salaSystem.ts). Pelo
-- mesmo motivo das colunas acima, a sala tem que viver na LINHA e nao no
-- mundo: o mundo e reconstruido a cada flush.
--
-- Nao ha coluna de "plano das 10 salas": o sub-bioma da PROXIMA sala so e
-- sorteado no momento do avanco. Um plano teria que ser mandado ao cliente
-- (que ai le qual sala e a boa, sai e reentra ate ela cair na primeira —
-- reroll gratis) ou escondido dele (e ai nao ha o que mostrar).
alter table public.game_sessions
  add column if not exists sala_indice integer not null default 0,
  add column if not exists sala_chave text,
  add column if not exists sala_abates integer not null default 0,
  add column if not exists ciclos integer not null default 0;

-- ---------------------------------------------------------------------------
-- O RPC de "iniciar novo jogo" tinha os grupos ESCRITOS A MAO
-- ---------------------------------------------------------------------------
-- `reiniciar_jogo` (migration 20260812180000, RPC-everything) nao usa o
-- default da coluna: ele grava `array['johto','nightmare']` literal. Sem este
-- patch, quem clicasse em "Iniciar novo jogo" ficaria com dois grupos que nao
-- casam com hunt nenhuma — a lista de hunts sai VAZIA, sem erro em lugar
-- nenhum. As demais rotinas (`handle_new_user`, `wipe_todos_os_saves`) usam
-- `default`/`hunts_iniciais()` e ja acompanham a mudanca acima sozinhas.
--
-- Patch TEXTUAL sobre a definicao corrente em vez de reescrever a funcao
-- inteira: ela tem ~60 linhas que nao tem nada a ver com esta leva, e copia-la
-- aqui congelaria uma versao que outra migration pode ter mudado depois. O
-- `raise exception` no fim e o ponto: se o literal alvo sumir ou mudar de
-- forma, esta migration FALHA em vez de virar no-op silencioso e deixar o
-- reset quebrado.
do $$
declare
  r record;
  novo text;
  trocou int := 0;
begin
  for r in
    select n.nspname as sch, p.oid
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'dev')
       and p.proname = 'reiniciar_jogo'
       and p.prokind = 'f'
  loop
    novo := replace(
      pg_get_functiondef(r.oid),
      $lit$array['johto','nightmare']$lit$,
      $lit$array['faixa1','faixa2']$lit$
    );
    if novo <> pg_get_functiondef(r.oid) then
      execute novo;
      trocou := trocou + 1;
    end if;
  end loop;

  if trocou = 0 then
    raise exception
      'reiniciar_jogo nao continha o literal array[''johto'',''nightmare''] — '
      'confira se ela ja foi corrigida ou se o texto mudou de forma';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Espelho `dev`
-- ---------------------------------------------------------------------------
-- `dev` e clone de `public` usado pra desenvolvimento (migration
-- `clone_schema_to_dev`). Deixar so `public` migrado faria o proximo teste
-- contra `dev` falhar com "coluna nao existe" — erro que parece bug do codigo
-- novo e nao divergencia de schema. `if exists` porque o clone e opcional.
do $$
begin
  if to_regclass('dev.players') is not null then
    alter table dev.players
      alter column unlocked_continents set default array['faixa1', 'faixa2'];
    update dev.players
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
  end if;

  if to_regclass('dev.game_sessions') is not null then
    alter table dev.game_sessions
      add column if not exists sequence_index integer not null default 0,
      add column if not exists sequence_cleared boolean not null default false,
      add column if not exists sala_indice integer not null default 0,
      add column if not exists sala_chave text,
      add column if not exists sala_abates integer not null default 0,
      add column if not exists ciclos integer not null default 0;
  end if;
end
$$;
