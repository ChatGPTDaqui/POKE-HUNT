-- Realtime por BROADCAST privado, no lugar de postgres_changes (12/10/2026).
--
-- POR QUE: enquanto houver qualquer assinatura postgres_changes aberta, o
-- Realtime consulta o slot de replicacao por SQL (`realtime.list_changes`) sem
-- parar. Medido em producao: 4,4 M chamadas e ~7,5 h de CPU do banco em 53 dias,
-- a consulta mais cara do projeto com folga, decodificando o WAL de todas as
-- escritas (inclusive as ~13 do flush de hunt a cada 30 s). E cada mudanca
-- passava pela RLS uma vez por assinante.
--
-- O Broadcast from Database le `realtime.messages` por um slot que o Realtime
-- ja mantem ligado sempre, e autoriza o assinante UMA vez, ao entrar no canal.
-- A doc do Supabase recomenda Broadcast justamente por escala.
--
-- TOPICOS (o cliente esta em src/data/remote/aoVivo.ts):
--   <schema>:chat              chat mundo, todo autenticado le
--   <schema>:social:<uid>      correio que chega pro jogador (para_id)
--   <schema>:pvp:<uid>         pvp_sessao e pvp_historico dos dois lados
--   <schema>:troca:<uid>       troca_sessao dos dois lados
-- O schema entra no topico porque dev e public dividem o mesmo Realtime.
--
-- FASES: esta migration so ACRESCENTA (triggers + policy). As tabelas continuam
-- na publicacao `supabase_realtime` porque o cliente de producao ainda assina
-- postgres_changes ate a promocao. Tirar da publicacao e uma migration
-- posterior, depois que producao estiver no cliente novo — so ai o polling para.
--
-- Um arquivo so, cobrindo os dois schemas explicitamente: as funcoes leem o
-- schema do proprio trigger (`tg_table_schema`), e a policy de
-- `realtime.messages` e uma so pro projeto.
begin;

-- ---------------------------------------------------------------------------
-- Funcoes de aviso. `realtime.send` ja engole erro internamente: um problema no
-- Realtime nunca derruba o INSERT/UPDATE do jogo.
-- ---------------------------------------------------------------------------

-- Chat: manda a linha inteira, o cliente anexa sem refetch.
create or replace function public.avisar_chat_ao_vivo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(to_jsonb(new), tg_op, tg_table_schema || ':chat', true);
  return null;
end;
$$;

-- Correio: a linha vai so pro destinatario (para_id). DELETE manda a antiga.
create or replace function public.avisar_correio_ao_vivo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  linha jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
begin
  if linha->>'para_id' is not null then
    perform realtime.send(linha, tg_op, tg_table_schema || ':social:' || (linha->>'para_id'), true);
  end if;
  return null;
end;
$$;

-- PvP e troca: avisa anfitriao e convidado, da linha nova E da antiga (um
-- UPDATE que troca o convidado avisa quem saiu e quem entrou). O payload so diz
-- a tabela: o cliente sempre faz refetch, nunca aplica a linha.
-- tg_argv[0] e o canal ('pvp' ou 'troca').
create or replace function public.avisar_participantes_ao_vivo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  nova jsonb := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
  antiga jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  quem text;
begin
  for quem in
    select distinct x from unnest(array[
      nova->>'anfitriao_id', nova->>'convidado_id',
      antiga->>'anfitriao_id', antiga->>'convidado_id'
    ]) as x where x is not null
  loop
    perform realtime.send(
      jsonb_build_object('tabela', tg_table_name),
      tg_op,
      tg_table_schema || ':' || tg_argv[0] || ':' || quem,
      true
    );
  end loop;
  return null;
end;
$$;

revoke all on function public.avisar_chat_ao_vivo() from public, anon, authenticated;
revoke all on function public.avisar_correio_ao_vivo() from public, anon, authenticated;
revoke all on function public.avisar_participantes_ao_vivo() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Triggers, nos dois schemas.
-- ---------------------------------------------------------------------------

drop trigger if exists chat_ao_vivo on public.chat_messages;
create trigger chat_ao_vivo after insert on public.chat_messages
  for each row execute function public.avisar_chat_ao_vivo();
drop trigger if exists chat_ao_vivo on dev.chat_messages;
create trigger chat_ao_vivo after insert on dev.chat_messages
  for each row execute function public.avisar_chat_ao_vivo();

drop trigger if exists correio_ao_vivo on public.mail_messages;
create trigger correio_ao_vivo after insert or update or delete on public.mail_messages
  for each row execute function public.avisar_correio_ao_vivo();
drop trigger if exists correio_ao_vivo on dev.mail_messages;
create trigger correio_ao_vivo after insert or update or delete on dev.mail_messages
  for each row execute function public.avisar_correio_ao_vivo();

drop trigger if exists pvp_sessao_ao_vivo on public.pvp_sessao;
create trigger pvp_sessao_ao_vivo after insert or update or delete on public.pvp_sessao
  for each row execute function public.avisar_participantes_ao_vivo('pvp');
drop trigger if exists pvp_sessao_ao_vivo on dev.pvp_sessao;
create trigger pvp_sessao_ao_vivo after insert or update or delete on dev.pvp_sessao
  for each row execute function public.avisar_participantes_ao_vivo('pvp');

drop trigger if exists pvp_historico_ao_vivo on public.pvp_historico;
create trigger pvp_historico_ao_vivo after insert or update or delete on public.pvp_historico
  for each row execute function public.avisar_participantes_ao_vivo('pvp');
drop trigger if exists pvp_historico_ao_vivo on dev.pvp_historico;
create trigger pvp_historico_ao_vivo after insert or update or delete on dev.pvp_historico
  for each row execute function public.avisar_participantes_ao_vivo('pvp');

drop trigger if exists troca_sessao_ao_vivo on public.troca_sessao;
create trigger troca_sessao_ao_vivo after insert or update or delete on public.troca_sessao
  for each row execute function public.avisar_participantes_ao_vivo('troca');
drop trigger if exists troca_sessao_ao_vivo on dev.troca_sessao;
create trigger troca_sessao_ao_vivo after insert or update or delete on dev.troca_sessao
  for each row execute function public.avisar_participantes_ao_vivo('troca');

-- ---------------------------------------------------------------------------
-- Quem pode ENTRAR em cada topico privado. Igualdade exata, nao LIKE: o
-- jogador so assina o chat e os tres topicos com o proprio id. Sem policy de
-- INSERT: o cliente nao consegue publicar nesses topicos, so os triggers.
-- ---------------------------------------------------------------------------
drop policy if exists "jogo assina os proprios topicos" on realtime.messages;
create policy "jogo assina os proprios topicos" on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (select realtime.topic()) in (
      'public:chat',
      'dev:chat',
      'public:social:' || (select auth.uid())::text,
      'public:pvp:' || (select auth.uid())::text,
      'public:troca:' || (select auth.uid())::text,
      'dev:social:' || (select auth.uid())::text,
      'dev:pvp:' || (select auth.uid())::text,
      'dev:troca:' || (select auth.uid())::text
    )
  );

commit;
