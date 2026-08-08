-- O wipe total resetava `trainer_name` junto com o resto (`= default`), o que
-- devolvia TODA conta pro nome 'Treinador'.
--
-- Isso agora quebra de duas formas ao mesmo tempo:
--
-- 1. Estoura. `players_trainer_name_unico` (indice unico sobre
--    `lower(trainer_name)`) foi criado nesta leva; 57 linhas voltando pro mesmo
--    nome viola a unicidade e o wipe inteiro aborta na transacao.
-- 2. E errado mesmo sem o indice. O nick deixou de ser um rotulo cosmetico: e
--    escolhido no cadastro, e a identidade publica do jogador (chat, ranking,
--    Mercado) e a chave que o Correio usa pra achar alguem. Wipe apaga
--    PROGRESSO — apagar a identidade junto quebraria toda amizade e todo
--    registro de `original_trainer` que aponta pra ele.
--
-- Unica mudanca: a linha `trainer_name = default` sai. O resto da rotina e
-- identica a versao anterior (20260808150000).
create or replace function public.wipe_todos_os_saves()
returns table (jogadores_resetados bigint, pokes_apagados bigint, sessoes_fechadas bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  n_pokes bigint;
  n_sessoes bigint;
  n_jogadores bigint;
begin
  with apagados as (
    delete from public.pokemon_instances where true returning 1
  )
  select count(*) into n_pokes from apagados;

  delete from public.player_items where true;
  delete from public.player_pokedex where true;
  delete from public.player_auto_catch_rules where true;

  with fechadas as (
    update public.game_sessions
    set closed_at = now()
    where closed_at is null
    returning 1
  )
  select count(*) into n_sessoes from fechadas;

  with resetados as (
    update public.players
    set trainer_level = default,
        trainer_exp = default,
        gold = default,
        diamonds = default,
        active_team_index = default,
        current_map_id = null,
        unlocked_maps = public.hunts_iniciais(),
        unlocked_continents = default,
        auto_toggles = default,
        auto_pot_rules = default,
        auto_catch_config = default,
        perf_stats = default,
        updated_at = now()
    where true
    returning 1
  )
  select count(*) into n_jogadores from resetados;

  insert into public.player_items (user_id, item_id, quantity)
  select p.user_id, c.item_id, c.quantity
  from public.players p
  cross join public.concessao_inicial_de_itens() c;

  return query select n_jogadores, n_pokes, n_sessoes;
end;
$$;

revoke all on function public.wipe_todos_os_saves() from public;
revoke all on function public.wipe_todos_os_saves() from anon;
revoke all on function public.wipe_todos_os_saves() from authenticated;
grant execute on function public.wipe_todos_os_saves() to service_role;

-- O wipe tambem precisa limpar o que os sistemas NOVOS acumularam. Sem isto,
-- "todo mundo comeca do zero" deixaria de pe ordens de mercado com escrow de um
-- inventario que nao existe mais, anuncios apontando pra POKE apagado, entregas
-- pendentes de ouro e amizades/mensagens de um mundo anterior.
--
-- `market_listings.poke_uid` tem FK `on delete restrict` de proposito (anuncio
-- orfao seria pior), entao os anuncios TEM que sair antes dos POKEs — por isso
-- e uma rotina separada, chamada antes do wipe de progresso, e nao um bloco
-- dentro dele.
create or replace function public.wipe_mundo_social()
returns table (ordens bigint, anuncios bigint, negocios bigint, entregas bigint, mensagens bigint, amizades bigint, chat bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  n_ordens bigint; n_anuncios bigint; n_negocios bigint;
  n_entregas bigint; n_mensagens bigint; n_amizades bigint; n_chat bigint;
begin
  with x as (delete from public.market_orders where true returning 1) select count(*) into n_ordens from x;
  with x as (delete from public.market_listings where true returning 1) select count(*) into n_anuncios from x;
  with x as (delete from public.market_trades where true returning 1) select count(*) into n_negocios from x;
  with x as (delete from public.market_deliveries where true returning 1) select count(*) into n_entregas from x;
  with x as (delete from public.mail_messages where true returning 1) select count(*) into n_mensagens from x;
  with x as (delete from public.friendships where true returning 1) select count(*) into n_amizades from x;
  with x as (delete from public.chat_messages where true returning 1) select count(*) into n_chat from x;
  return query select n_ordens, n_anuncios, n_negocios, n_entregas, n_mensagens, n_amizades, n_chat;
end;
$$;

revoke all on function public.wipe_mundo_social() from public;
revoke all on function public.wipe_mundo_social() from anon;
revoke all on function public.wipe_mundo_social() from authenticated;
grant execute on function public.wipe_mundo_social() to service_role;
