-- PH-126 -- espelho do 20260824050000 no schema `dev`. O raciocinio completo
-- (por que a tabela de arquivado existe e nao e coluna de `players`, por que o
-- purge e em lote, o que o atraso do cron custa) esta na migration irma em
-- `public`; aqui so o que difere.
--
-- O QUE DIFERE DE `public`:
--
--   1. `leiloes-encerrar-dev` vai a 15 MINUTOS, nao 5. O `dev` e staging: o
--      leilao ali existe pra ser testado, e quem testa dispara
--      `dev.encerrar_leiloes_vencidos()` a mao quando nao quer esperar. Manter
--      1 em 1 minuto num ambiente de uso quase zero era o pedaco mais barato
--      de cortar dos 2.880 disparos por dia.
--
--   2. Os purges rodam em minutos diferentes dos de `public` (41 e 47 contra 11
--      e 17), pela mesma razao que `audit-logs-purge-dev` roda no 53 e o de
--      `public` no 23: os dois schemas dividem o mesmo banco e o mesmo pg_cron.
--
-- Retencao IGUAL a de `public` (90 dias de sessao, 30 de chat) de proposito: um
-- staging que apaga mais cedo que producao esconde exatamente a classe de bug
-- que so aparece em dado velho.

-- ---------------------------------------------------------------------------
-- 1. Tempo jogado arquivado
-- ---------------------------------------------------------------------------
create table if not exists dev.tempo_jogado_arquivado (
  user_id uuid primary key references auth.users(id) on delete cascade,
  segundos numeric not null default 0,
  atualizado_em timestamptz not null default now()
);

comment on table dev.tempo_jogado_arquivado is
  'PH-126: soma de simulated_seconds das game_sessions ja apagadas pelo purge de retencao. meu_perfil() devolve isto MAIS a soma das sessoes ainda existentes, pra retencao nao fazer o tempo jogado andar pra tras na tela.';

alter table dev.tempo_jogado_arquivado enable row level security;

create index if not exists game_sessions_fechadas_antigas_idx_dev
  on dev.game_sessions (closed_at)
  where closed_at is not null;

-- ---------------------------------------------------------------------------
-- 2. meu_perfil: tempo jogado = arquivado + sessoes vivas
-- ---------------------------------------------------------------------------
create or replace function dev.meu_perfil()
returns jsonb
language plpgsql security definer set search_path = dev, public
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
    from dev.treinadores_publico
  ) x where x.user_id = v_user_id;

  select coalesce(sum(simulated_seconds), 0) into v_segundos from dev.game_sessions where user_id = v_user_id;
  -- PH-126: `select into` sem linha deixa a variavel NULL, e quase todo jogador
  -- nunca vai ter linha aqui. Dai o `coalesce` na soma.
  select segundos into v_arquivados from dev.tempo_jogado_arquivado where user_id = v_user_id;
  v_segundos := v_segundos + coalesce(v_arquivados, 0);

  select conquistado_em into v_hall from dev.hall_da_fama where user_id = v_user_id limit 1;
  select created_at into v_criado from dev.players where user_id = v_user_id;

  return jsonb_build_object(
    'rank', coalesce(v_rank, 0),
    'totalJogadores', coalesce(v_total, 0),
    'segundosJogados', v_segundos,
    'contaCriadaEm', v_criado,
    'noHallDaFama', v_hall
  );
end;
$$;

revoke all on function dev.meu_perfil() from public;
grant execute on function dev.meu_perfil() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. reiniciar_jogo apaga o arquivado junto com as sessoes
-- ---------------------------------------------------------------------------
-- Copia fiel da versao vigente (20260822120101); a UNICA mudanca e o
-- `delete from dev.tempo_jogado_arquivado`.
CREATE OR REPLACE FUNCTION dev.reiniciar_jogo()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'dev', 'public'
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

  for v_anuncio in select id from dev.market_listings where seller_id = v_user_id and status = 'ativo' loop
    perform dev.recusar_ofertas_pendentes(v_anuncio.id, 'Conta resetada pelo vendedor — oferta devolvida');
  end loop;

  update dev.market_offers set status = 'cancelada', resolved_at = now()
  where buyer_id = v_user_id and status = 'pendente';

  delete from dev.market_listings where seller_id = v_user_id;
  delete from dev.pokemon_instances where user_id = v_user_id and location = 'market';
  delete from dev.market_orders where user_id = v_user_id;
  delete from dev.market_deliveries where user_id = v_user_id;
  delete from dev.game_sessions where user_id = v_user_id;
  -- PH-126: o arquivado do purge de retencao vai junto com as sessoes.
  delete from dev.tempo_jogado_arquivado where user_id = v_user_id;

  update dev.players set
    trainer_level = 1, trainer_exp = 0, gold = 1000, diamonds = 0,
    active_team_index = 0, current_map_id = null,
    unlocked_maps = '{}', unlocked_continents = array['faixa1','faixa2'],
    perf_stats = '{"gold":0,"xp":0,"mobs":0,"shinys":0,"captures":0,"items":0,"since":0}'::jsonb
  where user_id = v_user_id;
  delete from dev.pokemon_instances where user_id = v_user_id;
  delete from dev.player_items where user_id = v_user_id;
  delete from dev.player_pokedex where user_id = v_user_id;
  delete from dev.player_auto_catch_rules where user_id = v_user_id;

  insert into dev.player_items (user_id, item_id, quantity)
  select v_user_id, c.item_id, c.quantity
  from dev.concessao_inicial_de_itens() c;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Cron: leilao mais espacado + os dois purges novos
-- ---------------------------------------------------------------------------
-- Nome COM sufixo `-dev`: `cron.job` e um por BANCO, nao por schema. Sem o
-- sufixo, o segundo `schedule` colidiria com o de `public` e um dos dois
-- ambientes ficaria sem o job — em silencio.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'leiloes-encerrar-dev') then
    perform cron.unschedule('leiloes-encerrar-dev');
  end if;
  if exists (select 1 from cron.job where jobname = 'game-sessions-purge-dev') then
    perform cron.unschedule('game-sessions-purge-dev');
  end if;
  if exists (select 1 from cron.job where jobname = 'chat-messages-purge-dev') then
    perform cron.unschedule('chat-messages-purge-dev');
  end if;
end
$$;

select cron.schedule('leiloes-encerrar-dev', '*/15 * * * *', $$select dev.encerrar_leiloes_vencidos();$$);

select cron.schedule(
  'game-sessions-purge-dev',
  '41 * * * *',
  $$
  with apagadas as (
    delete from dev.game_sessions
    where id in (
      select id from dev.game_sessions
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
  insert into dev.tempo_jogado_arquivado (user_id, segundos)
  select user_id, segundos from por_jogador
  on conflict (user_id) do update
    set segundos = dev.tempo_jogado_arquivado.segundos + excluded.segundos,
        atualizado_em = now();
  $$
);

select cron.schedule(
  'chat-messages-purge-dev',
  '47 * * * *',
  $$
  delete from dev.chat_messages
  where id in (
    select id from dev.chat_messages
    where created_at < now() - interval '30 days'
    order by created_at
    limit 10000
  );
  $$
);
