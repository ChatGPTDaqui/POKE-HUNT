-- PH-312 (PH-120, fatia 3): a confirmacao dupla e a execucao atomica.
--
-- A fatia 1 entregou a mesa; a fatia 2, a oferta versionada e a reserva. Nenhuma
-- das duas trocava o dono de coisa nenhuma. Esta troca.
--
-- ===========================================================================
-- 1. A CONFIRMACAO GUARDA A VERSAO, E NAO UM "SIM"
-- ===========================================================================
-- Cada lado guarda em qual VERSAO da oferta ele confirmou. Nulo = nao confirmou.
-- A confirmacao vale enquanto `versao_confirmada = troca_sessao.versao`.
--
-- Com booleano, alterar a oferta exigiria LEMBRAR de apagar as duas
-- confirmacoes a cada mudanca — e no dia em que um caminho novo esquecesse, o
-- golpe voltava inteiro (trocar a oferta no instante em que o outro confirma).
--
-- Guardando a versao, a confirmacao ENVELHECE SOZINHA. O trigger da fatia 2 ja
-- sobe `versao` em toda alteracao de `troca_oferta`, inclusive na remocao em
-- cascata que vem de `reiniciar_jogo` apagar os POKEs do jogador. Nao ha nada
-- pra lembrar de apagar, entao nao ha nada pra esquecer.
--
-- ===========================================================================
-- 2. QUEM CONFIRMA POR ULTIMO EXECUTA, NA MESMA TRANSACAO
-- ===========================================================================
-- Nao existe RPC de "executar". Ela seria uma terceira chamada, e portanto uma
-- terceira janela: entre a segunda confirmacao e ela, a oferta poderia mudar.
--
-- ===========================================================================
-- 3. OS LOCKS DAS DUAS CONTAS SAO TOMADOS EM ORDEM DE UUID
-- ===========================================================================
-- A transacao toca as duas contas. Dois pares confirmando ao mesmo tempo em
-- sentidos opostos (A<->B e B<->A nao acontece, mas A<->B e B<->C sim) travariam
-- um no outro se cada um pegasse "primeiro o meu". `least`/`greatest` fazem os
-- dois pegarem na MESMA ordem, e isso torna o deadlock impossivel em vez de
-- improvavel.
--
-- ===========================================================================
-- 4. ITEM VAI PELA CAIXA DE ENTREGAS. POKE VAI DIRETO. A DIFERENCA IMPORTA.
-- ===========================================================================
-- `savePlayerState` reescreve `player_items` com a quantidade LOCAL do jogador.
-- Creditar o item recebido direto na tabela seria escrita fora do snapshot: o
-- proximo flush de quem recebeu — que pode estar cacando neste segundo, ou nem
-- estar online — grava por cima o numero que ele tinha em memoria, e o item
-- simplesmente nao chega. Sem erro em lugar nenhum.
--
-- `market_deliveries` existe exatamente pra isso, com esse argumento escrito no
-- proprio `authority/src/entregas.ts`, e o Mercado ja credita assim ha meses. O
-- credito vira LINHA, reivindicada dentro do proximo `/estado` do proprio
-- destinatario e aplicada ao estado que aquele request ja vai gravar.
--
-- POKE NAO precisa disso, e a assimetria e real: o flush so escreve as linhas
-- que estao em `team`/`bagPokes` do estado local, e so apaga id que esta no
-- dominio conhecido (PH-182). Um POKE que acabou de mudar de `user_id` nao esta
-- em nenhum dos dois na conta que recebeu — o flush dela nao o toca.
--
-- ISTO TAMBEM CONSERTA A DEVOLUCAO DA FATIA 2, pelo mesmo motivo. `_devolver_
-- oferta` creditava `player_items` direto, e o caminho de EXPIRACAO roda no
-- pg_cron, quando o dono provavelmente nem esta na tela — que e exatamente
-- quando a escrita fora do snapshot se perde. Reescrita aqui pra enfileirar
-- entrega. POKE continua voltando direto, pela assimetria acima.

-- ---------------------------------------------------------------------------
-- As duas confirmacoes
-- ---------------------------------------------------------------------------
alter table public.troca_sessao
  add column if not exists versao_confirmada_anfitriao integer,
  add column if not exists versao_confirmada_convidado integer;

comment on column public.troca_sessao.versao_confirmada_anfitriao is
  'PH-312: em qual versao da oferta o anfitriao confirmou. Vale so enquanto for igual a versao atual.';
comment on column public.troca_sessao.versao_confirmada_convidado is
  'PH-312: em qual versao da oferta o convidado confirmou. Vale so enquanto for igual a versao atual.';

-- ---------------------------------------------------------------------------
-- O log da troca
-- ---------------------------------------------------------------------------
-- SEM FK, DE PROPOSITO, nas tres colunas de id.
--
-- As linhas de `troca_oferta` sao apagadas ao concluir (e o que permite o indice
-- UNIQUE global em `poke_uid`), entao o registro do que foi trocado precisa
-- sobreviver por conta propria. Uma FK pra `troca_sessao` traria `on delete
-- cascade` junto — e `troca_sessao` ja cascateia de `players`. Bastaria uma
-- conta ser apagada pra reclamacao da OUTRA perder a prova.
--
-- `audit_logs` tambem nao serve: ela tem purga de retencao, e reclamacao de
-- troca aparece semanas depois.
create table if not exists public.troca_log (
  id uuid primary key default gen_random_uuid(),
  sessao_id uuid not null,
  anfitriao_id uuid not null,
  convidado_id uuid not null,
  -- A versao em que os dois confirmaram. E o numero que prova que os dois viram
  -- a MESMA mesa.
  versao integer not null,
  -- O que estava na mesa, lado a lado, no instante da execucao.
  oferta jsonb not null,
  executada_em timestamptz not null default now()
);

comment on table public.troca_log is
  'PH-312: o que foi trocado, por sessao. Sem FK de proposito — o registro precisa sobreviver a exclusao de conta e a purga de retencao.';

create index if not exists troca_log_por_jogador
  on public.troca_log (anfitriao_id, executada_em desc);
create index if not exists troca_log_por_convidado
  on public.troca_log (convidado_id, executada_em desc);

alter table public.troca_log enable row level security;

drop policy if exists "log de troca dos participantes" on public.troca_log;
create policy "log de troca dos participantes" on public.troca_log
  for select to authenticated
  using (anfitriao_id = auth.uid() or convidado_id = auth.uid());

grant select on public.troca_log to authenticated;
grant select, insert on public.troca_log to service_role;

-- ---------------------------------------------------------------------------
-- Devolver, agora pela caixa de entregas
-- ---------------------------------------------------------------------------
create or replace function public._devolver_oferta(p_sessao_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- POKE volta direto: o flush de quem recebe nao escreve linha que nao esta no
  -- estado local dele, entao nao ha o que sobrescrever.
  update public.pokemon_instances p
     set location = 'bag', team_slot = null, updated_at = now()
    from public.troca_oferta o
   where o.sessao_id = p_sessao_id
     and o.poke_uid = p.id
     and p.user_id = o.dono_id
     and p.location = 'troca';

  -- ITEM volta pela caixa de entregas (PH-312). O caminho de expiracao roda no
  -- pg_cron, com o dono provavelmente offline — e escrita direta em
  -- `player_items` seria sobrescrita pelo flush seguinte dele.
  insert into public.market_deliveries (user_id, gold, diamonds, item_id, quantity, motivo)
  select o.dono_id, 0, 0, o.item_id, o.quantidade, 'troca-devolvida'
    from public.troca_oferta o
   where o.sessao_id = p_sessao_id and o.item_id is not null;

  delete from public.troca_oferta where sessao_id = p_sessao_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- A execucao
-- ---------------------------------------------------------------------------
-- Interna: nunca vem do cliente. Ela e chamada por `confirmar_troca` quando a
-- SEGUNDA confirmacao valida chega, dentro da mesma transacao.
create or replace function public._executar_troca(p_sessao_id uuid)
returns public.troca_sessao
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_s public.troca_sessao;
  v_a uuid;
  v_b uuid;
  v_oferta jsonb;
  v_linha record;
  v_destino uuid;
begin
  select * into v_s from public.troca_sessao where id = p_sessao_id for update;
  if not found then
    raise exception 'Troca nao encontrada.';
  end if;
  if v_s.estado <> 'aberta' then
    raise exception 'Esta troca nao esta aberta.';
  end if;

  v_a := v_s.anfitriao_id;
  v_b := v_s.convidado_id;

  -- ORDEM DETERMINISTICA. Ver a nota 3 no topo: e o que faz duas trocas
  -- concorrentes com um jogador em comum nao travarem uma na outra.
  perform pg_advisory_xact_lock(hashtext(least(v_a, v_b)::text));
  perform pg_advisory_xact_lock(hashtext(greatest(v_a, v_b)::text));

  -- O retrato do que esta na mesa, tirado ANTES de qualquer coisa mudar. Depois
  -- disto as linhas somem, e sem o retrato nao haveria como auditar reclamacao.
  select coalesce(jsonb_agg(jsonb_build_object(
           'dono', o.dono_id,
           'tipo', o.tipo,
           'poke_uid', o.poke_uid,
           'item_id', o.item_id,
           'quantidade', o.quantidade
         ) order by o.criada_em), '[]'::jsonb)
    into v_oferta
    from public.troca_oferta o
   where o.sessao_id = p_sessao_id;

  if v_oferta = '[]'::jsonb then
    raise exception 'A mesa esta vazia.';
  end if;

  -- POKE: um UPDATE por linha, com o dono e o lugar ANTIGOS no WHERE. Ele e a
  -- revalidacao e a transferencia ao mesmo tempo — se qualquer coisa tiver
  -- mudado por fora, ele nao acha linha e a transacao inteira volta atras.
  --
  -- `locked = false` porque a trava e do dono anterior: manter travado deixaria
  -- quem recebeu sem conseguir usar o POKE sem descobrir por que.
  -- `original_trainer` NAO e tocado — e o registro de quem capturou, e e o que
  -- da sentido a trocar POKE de outro treinador.
  for v_linha in
    select * from public.troca_oferta where sessao_id = p_sessao_id and tipo = 'poke'
  loop
    v_destino := case when v_linha.dono_id = v_a then v_b else v_a end;
    update public.pokemon_instances
       set user_id = v_destino,
           location = 'bag',
           team_slot = null,
           locked = false,
           updated_at = now()
     where id = v_linha.poke_uid
       and user_id = v_linha.dono_id
       and location = 'troca';
    if not found then
      raise exception 'A oferta mudou durante a troca. Nada foi movido — refaca a mesa.';
    end if;
  end loop;

  -- ITEM: ja foi debitado de quem ofereceu na fatia 2. O credito vai pela caixa
  -- de entregas (ver nota 4 no topo) — o outro lado pode nem estar online.
  insert into public.market_deliveries (user_id, gold, diamonds, item_id, quantity, motivo)
  select case when o.dono_id = v_a then v_b else v_a end, 0, 0, o.item_id, o.quantidade, 'troca'
    from public.troca_oferta o
   where o.sessao_id = p_sessao_id and o.tipo = 'item';

  -- Apaga a oferta SEM devolver: `_devolver_oferta` desfaria a troca no instante
  -- em que ela acontece. E a razao de a execucao nao reaproveitar aquele
  -- caminho, apesar de os dois terminarem com a mesa vazia.
  delete from public.troca_oferta where sessao_id = p_sessao_id;

  insert into public.troca_log (sessao_id, anfitriao_id, convidado_id, versao, oferta)
  values (p_sessao_id, v_a, v_b, v_s.versao, v_oferta);

  update public.troca_sessao
     set estado = 'concluida',
         encerrada_em = now(),
         atualizada_em = now()
   where id = p_sessao_id
  returning * into v_s;

  return v_s;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Confirmar e desconfirmar
-- ---------------------------------------------------------------------------
create or replace function public.confirmar_troca(p_sessao_id uuid, p_versao integer)
returns public.troca_sessao
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_eu uuid := auth.uid();
  v_sessao public.troca_sessao;
begin
  if v_eu is null then
    raise exception 'sem sessao autenticada';
  end if;
  -- Trava a mesa e cobra 'aberta' + dentro do prazo. Da fatia 2.
  v_sessao := public._mesa_aberta_minha(p_sessao_id, v_eu);

  -- O CORACAO DA REGRA: confirmacao carrega a versao que o jogador VIU.
  -- Se a oferta mudou entre a tela e o clique, a versao nao bate e o servidor
  -- recusa — e e por isso que trocar a oferta no instante da confirmacao nao
  -- funciona.
  if p_versao is null or p_versao <> v_sessao.versao then
    raise exception 'A oferta mudou. Confira a mesa de novo antes de confirmar.';
  end if;

  perform 1 from public.troca_oferta where sessao_id = p_sessao_id;
  if not found then
    raise exception 'A mesa esta vazia.';
  end if;

  if v_eu = v_sessao.anfitriao_id then
    update public.troca_sessao
       set versao_confirmada_anfitriao = p_versao, atualizada_em = now()
     where id = p_sessao_id;
  else
    update public.troca_sessao
       set versao_confirmada_convidado = p_versao, atualizada_em = now()
     where id = p_sessao_id;
  end if;

  select * into v_sessao from public.troca_sessao where id = p_sessao_id;

  -- A SEGUNDA confirmacao valida executa, aqui, nesta transacao. Comparar as
  -- duas contra `versao` (e nao uma contra a outra) e o que garante que as duas
  -- valem AGORA, e nao que as duas valeram em algum momento.
  if v_sessao.versao_confirmada_anfitriao = v_sessao.versao
     and v_sessao.versao_confirmada_convidado = v_sessao.versao then
    v_sessao := public._executar_troca(p_sessao_id);
  end if;

  return v_sessao;
end;
$function$;

create or replace function public.desconfirmar_troca(p_sessao_id uuid)
returns public.troca_sessao
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_eu uuid := auth.uid();
  v_sessao public.troca_sessao;
begin
  if v_eu is null then
    raise exception 'sem sessao autenticada';
  end if;
  v_sessao := public._mesa_aberta_minha(p_sessao_id, v_eu);

  -- Voltar atras nao e erro nem precisa de motivo: enquanto a outra ponta nao
  -- confirmou, desistir da confirmacao e o mesmo direito que cancelar a mesa.
  if v_eu = v_sessao.anfitriao_id then
    update public.troca_sessao
       set versao_confirmada_anfitriao = null, atualizada_em = now()
     where id = p_sessao_id;
  else
    update public.troca_sessao
       set versao_confirmada_convidado = null, atualizada_em = now()
     where id = p_sessao_id;
  end if;

  select * into v_sessao from public.troca_sessao where id = p_sessao_id;
  return v_sessao;
end;
$function$;

grant execute on function public.confirmar_troca(uuid, integer) to authenticated;
grant execute on function public.desconfirmar_troca(uuid) to authenticated;
-- `_executar_troca` NAO vai pro cliente: chamada solta, ela executaria sem
-- passar pela conferencia de versao das duas confirmacoes.
grant execute on function public._executar_troca(uuid) to service_role;
