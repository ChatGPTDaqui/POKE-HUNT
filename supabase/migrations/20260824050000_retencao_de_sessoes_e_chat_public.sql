-- PH-126 -- custo de Supabase com zero jogador: cron de leilao espacado e
-- retencao em `game_sessions` e `chat_messages`.
--
-- Continuacao do PH-88 (retencao de `audit_logs` + log-puller de 5 pra 30 min).
-- O que sobrou eram tres gastos que correm sozinhos, sem ninguem jogando.
--
-- 1. CRON DE LEILAO: DE 1 EM 1 MINUTO PRA 5 EM 5
-- ---------------------------------------------------------------------------
-- `leiloes-encerrar` (public) + `leiloes-encerrar-dev` davam 2.880 execucoes
-- por dia, para sempre, com ou sem leilao aberto. Cada uma e barata (a
-- varredura usa `market_listings_leiloes_a_vencer_idx` e sai por `limit`), so
-- que 2.880 vezes zero ainda e compute cobrado.
--
-- ATRASO MAXIMO DE ENCERRAMENTO: 5 MINUTOS em `public` (15 no `dev`, que tem
-- uso quase zero). Leilao dura horas e o anti-snipe estende so 30 segundos, e
-- o preco do atraso e limitado a duas coisas, as duas ja tratadas:
--
--   a) Lance fora de hora NAO abre: `dar_lance` recusa por `expira_em <=
--      now()`, nao por "o cron ja passou" — a checagem esta na propria funcao,
--      com comentario dizendo exatamente isso. A janela maior nao muda nada
--      ali.
--   b) O que muda e a ESPERA: o vencedor so recebe o POKE quando o cron roda,
--      e a tela mostra "encerrando..." nesse meio tempo (`formatarRestante`,
--      PH-101). Antes ate 1 minuto, agora ate 5.
--
-- 2. `game_sessions` SEM RETENCAO, E O TEMPO JOGADO DO PERFIL
-- ---------------------------------------------------------------------------
-- Uma linha por sessao de hunt, e nada apagava sessao fechada. A linha nao e
-- estreita (seed, rng_state, timestamps, faixa), entao 100 jogadores a 20
-- sessoes por dia dariam ~730 mil linhas por ano contra os 500 MB do plano.
--
-- O PORQUE DA TABELA NOVA: `meu_perfil()` calculava `segundosJogados` como
-- `sum(simulated_seconds)` sobre TODAS as sessoes do jogador. Apagar sessao
-- antiga, sem mais nada, faria o tempo jogado ENCOLHER na tela — um numero de
-- perfil andando pra tras sem explicacao. Entao o purge nao so apaga: ele soma
-- o que apagou em `tempo_jogado_arquivado`, no MESMO comando (CTE `delete ...
-- returning` + `insert on conflict`), e `meu_perfil()` passa a devolver
-- arquivado + o que ainda esta na tabela. O total nunca muda.
--
-- POR QUE TABELA SEPARADA, E NAO UMA COLUNA EM `players`: a linha de `players`
-- e a linha quente do jogador — o flush do jogo grava nela com CAS por
-- `updated_at` (PH-5) e as RPCs de acao tomam `pg_advisory_xact_lock` por
-- usuario antes de escrever (PH-67). Um contador mexido por cron ali dentro
-- dispararia o trigger `players_set_updated_at` e faria um flush em voo, que
-- leu a linha antes do purge, levar 409 na volta — conflito de escrita sem
-- ninguem estar errado. A tabela separada nao entra nesse CAS, nao precisa do
-- advisory lock, e nao aparece no `p_patch` de `gravar_progresso`.
--
-- `reiniciar_jogo()` apaga a linha junto com as sessoes: ele APAGA as sessoes
-- do jogador, e hoje isso zera o tempo jogado por consequencia. Sem o delete
-- explicito, o arquivado sobreviveria ao reset e a conta "resetada" apareceria
-- com horas jogadas.
--
-- `wipe_todos_os_saves` NAO precisa de ajuste: ele FECHA as sessoes
-- (`closed_at`), nao apaga — o tempo jogado ja sobrevive a ele hoje, e continua
-- sobrevivendo do mesmo jeito.
--
-- RETENCAO DE 90 DIAS, por `closed_at`: sessao aberta (`closed_at is null`)
-- nunca entra no purge, esteja aberta ha quanto tempo estiver. 90 dias porque
-- a sessao e o rastro de auditoria de quanto o SERVIDOR simulou — e o que se
-- olha quando um jogador contesta progresso.
--
-- 3. `chat_messages` SEM RETENCAO
-- ---------------------------------------------------------------------------
-- Chat do mundo, uma linha por mensagem, sem purge nenhum. E a tabela mais
-- facil de encher, porque e conversa. 30 dias nao tira nada de ninguem: o
-- cliente carrega as ultimas 50 (`LIMITE_HISTORICO`), e `anexos` guarda LINK
-- de item/POKE, nao item — apagar a mensagem nao destroi bem nenhum. (Anexo
-- que vale ouro e o do CORREIO, `mail_messages`, que fica fora deste escopo.)
--
-- TODO PURGE E EM LOTE, com `limit`, como o de `audit_logs`: o cron do Postgres
-- nao tem timeout proprio, entao um primeiro purge numa tabela acumulada
-- viraria uma transacao gigante segurando a conexao. Em lote, a fila drena
-- sozinha ao longo das horas.

-- ---------------------------------------------------------------------------
-- 1. Tempo jogado arquivado
-- ---------------------------------------------------------------------------
create table if not exists public.tempo_jogado_arquivado (
  user_id uuid primary key references auth.users(id) on delete cascade,
  segundos numeric not null default 0,
  atualizado_em timestamptz not null default now()
);

comment on table public.tempo_jogado_arquivado is
  'PH-126: soma de simulated_seconds das game_sessions ja apagadas pelo purge de retencao. meu_perfil() devolve isto MAIS a soma das sessoes ainda existentes, pra retencao nao fazer o tempo jogado andar pra tras na tela.';

-- RLS ligada e SEM policy: ninguem le pelo PostgREST. Quem precisa do numero e
-- `meu_perfil()`, que e SECURITY DEFINER e passa por cima da RLS, e o proprio
-- purge, que roda como dono do cron. Tabela sem policy responde 0 linhas ao
-- cliente, nao 403 — teste adversarial tem que afirmar o efeito, nao o status.
alter table public.tempo_jogado_arquivado enable row level security;

-- O purge filtra e ordena por `closed_at`. Sem indice, cada execucao horaria
-- varreria a tabela inteira — o oposto do objetivo. Parcial porque sessao
-- aberta nunca e candidata.
create index if not exists game_sessions_fechadas_antigas_idx
  on public.game_sessions (closed_at)
  where closed_at is not null;

-- ---------------------------------------------------------------------------
-- 2. meu_perfil: tempo jogado = arquivado + sessoes vivas
-- ---------------------------------------------------------------------------
create or replace function public.meu_perfil()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_rank int;
  v_total int;
  v_segundos numeric;
  v_arquivados numeric;
  v_hall timestamptz;
  v_criado timestamptz;
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode = '28000'; end if;

  select x.rank, x.total into v_rank, v_total from (
    select user_id,
      row_number() over (order by trainer_level desc, trainer_exp desc) as rank,
      count(*) over () as total
    from public.treinadores_publico
  ) x where x.user_id = v_user_id;

  select coalesce(sum(simulated_seconds), 0) into v_segundos from public.game_sessions where user_id = v_user_id;
  -- PH-126: `select into` sem linha deixa a variavel NULL, e quase todo jogador
  -- nunca vai ter linha aqui (so quem teve sessao purgada tem). Dai o
  -- `coalesce` na soma: sem ele, `segundosJogados` viraria null pra todo mundo.
  select segundos into v_arquivados from public.tempo_jogado_arquivado where user_id = v_user_id;
  v_segundos := v_segundos + coalesce(v_arquivados, 0);

  select conquistado_em into v_hall from public.hall_da_fama where user_id = v_user_id limit 1;
  select created_at into v_criado from public.players where user_id = v_user_id;

  return jsonb_build_object(
    'rank', coalesce(v_rank, 0),
    'totalJogadores', coalesce(v_total, 0),
    'segundosJogados', v_segundos,
    'contaCriadaEm', v_criado,
    'noHallDaFama', v_hall
  );
end;
$$;

revoke all on function public.meu_perfil() from public;
grant execute on function public.meu_perfil() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. reiniciar_jogo apaga o arquivado junto com as sessoes
-- ---------------------------------------------------------------------------
-- Copia fiel da versao vigente (20260822120100, a do advisory lock do PH-67);
-- a UNICA mudanca e o `delete from public.tempo_jogado_arquivado`, logo depois
-- do delete das sessoes que ele acompanha.
CREATE OR REPLACE FUNCTION public.reiniciar_jogo()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_anuncio record;
begin
  -- PH-67: serializa contra outras escritas concorrentes em players do MESMO
  -- usuario (inclusive gravar_progresso/flush). Lock de transacao, libera
  -- sozinho no commit/rollback, sem tabela nova.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;

  for v_anuncio in select id from public.market_listings where seller_id = v_user_id and status = 'ativo' loop
    perform public.recusar_ofertas_pendentes(v_anuncio.id, 'Conta resetada pelo vendedor — oferta devolvida');
  end loop;

  update public.market_offers set status = 'cancelada', resolved_at = now()
  where buyer_id = v_user_id and status = 'pendente';

  delete from public.market_listings where seller_id = v_user_id;
  delete from public.pokemon_instances where user_id = v_user_id and location = 'market';
  delete from public.market_orders where user_id = v_user_id;
  delete from public.market_deliveries where user_id = v_user_id;
  delete from public.game_sessions where user_id = v_user_id;
  -- PH-126: as sessoes acabaram de ser apagadas, entao o tempo jogado volta a
  -- zero. O que o purge de retencao ja tinha arquivado tem que ir junto, senao
  -- a conta resetada aparece com horas que nao existem mais.
  delete from public.tempo_jogado_arquivado where user_id = v_user_id;

  update public.players set
    trainer_level = 1, trainer_exp = 0, gold = 1000, diamonds = 0,
    active_team_index = 0, current_map_id = null,
    unlocked_maps = '{}', unlocked_continents = array['faixa1','faixa2'],
    perf_stats = '{"gold":0,"xp":0,"mobs":0,"shinys":0,"captures":0,"items":0,"since":0}'::jsonb
  where user_id = v_user_id;
  delete from public.pokemon_instances where user_id = v_user_id;
  delete from public.player_items where user_id = v_user_id;
  delete from public.player_pokedex where user_id = v_user_id;
  delete from public.player_auto_catch_rules where user_id = v_user_id;

  insert into public.player_items (user_id, item_id, quantity)
  select v_user_id, c.item_id, c.quantity
  from public.concessao_inicial_de_itens() c;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Cron: leilao mais espacado + os dois purges novos
-- ---------------------------------------------------------------------------
-- `if exists` antes do unschedule: em banco novo o job nao existe, e
-- `cron.unschedule` de nome inexistente LANCA — derrubaria a migration inteira.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'leiloes-encerrar') then
    perform cron.unschedule('leiloes-encerrar');
  end if;
  if exists (select 1 from cron.job where jobname = 'game-sessions-purge') then
    perform cron.unschedule('game-sessions-purge');
  end if;
  if exists (select 1 from cron.job where jobname = 'chat-messages-purge') then
    perform cron.unschedule('chat-messages-purge');
  end if;
end
$$;

select cron.schedule('leiloes-encerrar', '*/5 * * * *', $$select public.encerrar_leiloes_vencidos();$$);

-- Minutos diferentes dos outros purges (`audit-logs-purge` roda no 23 em
-- `public` e no 53 em `dev`) pra os jobs nao competirem pela mesma janela de
-- conexao do pg_cron.
select cron.schedule(
  'game-sessions-purge',
  '11 * * * *',
  $$
  with apagadas as (
    delete from public.game_sessions
    where id in (
      select id from public.game_sessions
      where closed_at is not null
        and closed_at < now() - interval '90 days'
      order by closed_at
      limit 10000
    )
    returning user_id, simulated_seconds
  ), por_jogador as (
    select user_id, sum(simulated_seconds) as segundos
    from apagadas group by user_id
  )
  insert into public.tempo_jogado_arquivado (user_id, segundos)
  select user_id, segundos from por_jogador
  on conflict (user_id) do update
    set segundos = public.tempo_jogado_arquivado.segundos + excluded.segundos,
        atualizado_em = now();
  $$
);

select cron.schedule(
  'chat-messages-purge',
  '17 * * * *',
  $$
  delete from public.chat_messages
  where id in (
    select id from public.chat_messages
    where created_at < now() - interval '30 days'
    order by created_at
    limit 10000
  );
  $$
);
