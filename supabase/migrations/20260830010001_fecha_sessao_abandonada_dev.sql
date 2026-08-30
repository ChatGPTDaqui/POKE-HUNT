-- PH-277 (espelho do schema dev): sessao de hunt abandonada passa a fechar sozinha.
--
-- O QUE EXISTIA
--
-- Uma sessao so fechava por caminho explicito: `/sessao/fechar`, sair da hunt,
-- ou `sessaoAberta` fechando as EXTRAS quando achava mais de uma aberta do mesmo
-- jogador. Nao havia fechamento por inatividade. Quem fechava a aba sem o ultimo
-- flush completar deixava a linha aberta indefinidamente — medido em 29/08:
-- `dev` com uma parada ha 1 dia e 6 horas (`last_flush_at` = `started_at`, ou
-- seja, nunca flushou), `public` com uma parada ha ~4 horas.
--
-- POR QUE ISSO NAO E URGENTE HOJE, E POR QUE AINDA ASSIM ENTRA
--
-- Hoje nao ha credito indevido: o intervalo de volta e enorme, cai no regime
-- offline (`LIMIAR_OFFLINE_SEGUNDOS = 120`) e `FARM_OFFLINE_PAUSADO = true`
-- descarta. Mas essa protecao e uma CONSTANTE TEMPORARIA. No dia em que ela
-- voltar a `false`, a sessao esquecida vira credito retroativo de horas, com uma
-- assimetria injusta: quem fecha a aba de qualquer jeito ganha o farm offline,
-- quem sai pela porta (`/sessao/fechar`) nao ganha.
--
-- E, independente disso, enquanto a linha fica aberta qualquer leitura de "quem
-- esta em hunt agora" mente, sem jeito de separar sessao viva de abandonada sem
-- olhar `last_flush_at` na mao.
--
-- DOIS CAMINHOS, E OS DOIS SAO NECESSARIOS
--
--   ACESSO   `sessaoAberta` (authority/src/appSessao.ts) fecha a sessao
--            abandonada de quem VOLTA, e devolve `null` — entao o intervalo
--            esquecido nunca chega a `aplicarFlush`.
--   CRON     esta funcao, de hora em hora, fecha a de quem NUNCA volta. Sem
--            ela a linha continua aberta pra sempre e o dado segue mentindo.
--
-- 30 MINUTOS, e o numero tem gemeo em TypeScript (`SESSAO_INATIVA_SEGUNDOS`).
-- O cliente flusha a cada 30s e nunca passa de 90s (`INTERVALO_FLUSH_MAX_MS`)
-- com a aba viva. 30 min e 20x o teto. Nao e mais apertado de proposito: fechar
-- a sessao perde a POSICAO NAS SALAS (`sala_indice`, `ciclos`), e quem volta de
-- um notebook que dormiu 10 minutos recomecaria no ciclo 1, sala 1.
-- `limiteDeSessaoInativa.test.ts` reprova se o SQL e o TS se separarem.
--
-- NAO CREDITA NADA, e isso e o ponto: o tempo abandonado nunca foi simulado por
-- ninguem, exatamente como a orfa que `sessaoAberta` ja fechava sem creditar.
--
-- `current_map_id` E LIMPO JUNTO. Deixar a coluna apontando pra um mapa sem
-- sessao poe o jogador dentro de uma cacada que nao credita nada — o mesmo
-- cuidado que `sairDaHunt` ja toma.

create or replace function dev.fechar_sessoes_inativas(
  p_limite interval default interval '30 minutes'
)
returns integer
language plpgsql
security definer
set search_path to 'dev'
as $function$
declare
  v_jogadores uuid[];
begin
  -- Quem fechar, ANTES de escrever. Duas razoes:
  --
  --  1. o advisory lock por jogador tem que vir antes de qualquer escrita
  --     (mesma regra de toda RPC que toca `players` — ver advisoryLock.test.ts).
  --     Sem ele, um `gravar_progresso` concorrente pode regravar
  --     `current_map_id` DEPOIS deste UPDATE, a partir de um patch montado
  --     antes, e o jogador volta pra dentro de uma hunt sem sessao;
  --  2. `order by user_id` da ordem DETERMINISTA aos locks. Duas execucoes
  --     concorrentes (cron atrasado + chamada manual) que pegassem os mesmos
  --     locks em ordens opostas travariam uma na outra.
  select array_agg(distinct user_id order by user_id) into v_jogadores
    from dev.game_sessions
   where closed_at is null
     and last_flush_at < now() - p_limite;

  if v_jogadores is null then
    return 0;
  end if;

  perform pg_advisory_xact_lock(hashtext(j::text))
     from unnest(v_jogadores) as j
    order by j;

  -- O predicado e repetido de proposito: entre o SELECT e aqui o jogador pode
  -- ter voltado e flushado, e nesse caso a sessao NAO pode ser fechada. O lock
  -- acima ja o serializa contra `gravar_progresso`, mas nao contra o proprio
  -- claim de `aplicarFlush`, que nao passa por esta funcao.
  update dev.game_sessions
     set closed_at = now()
   where user_id = any(v_jogadores)
     and closed_at is null
     and last_flush_at < now() - p_limite;

  update dev.players
     set current_map_id = null
   where user_id = any(v_jogadores)
     and current_map_id is not null;

  return array_length(v_jogadores, 1);
end;
$function$;

-- Revoga das 3 de uma vez (PUBLIC, anon, authenticated) — a licao do
-- `gravar_progresso`: `revoke ... from public` sozinho NAO alcanca o grant
-- explicito e NOMEADO que `alter default privileges` da a anon/authenticated na
-- criacao de toda funcao nova neste projeto. Sem isto, qualquer jogador
-- autenticado poderia fechar a sessao de todo mundo.
revoke execute on function dev.fechar_sessoes_inativas(interval) from public, anon, authenticated;
grant execute on function dev.fechar_sessoes_inativas(interval) to service_role;

-- `unschedule` condicional + `schedule`: idempotentes juntos, e sem depender de
-- o job ja existir. Mesmo padrao de 20260823000000.
--
-- Minuto 59 pra nao competir com os purges de dev (`game-sessions-purge-dev` 41,
-- `chat-messages-purge-dev` 47, `audit-logs-purge-dev` 53) pela mesma janela do pg_cron.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'sessoes-inativas-fechar-dev') then
    perform cron.unschedule('sessoes-inativas-fechar-dev');
  end if;
end
$$;

select cron.schedule(
  'sessoes-inativas-fechar-dev',
  '59 * * * *',
  $$select dev.fechar_sessoes_inativas();$$
);

-- BACKFILL das linhas abertas hoje. E a propria funcao, entao nao ha uma
-- segunda regra pra divergir da primeira, e rodar de novo nao faz nada (a
-- segunda chamada nao acha linha com `closed_at is null` e sai em 0).
select dev.fechar_sessoes_inativas();
