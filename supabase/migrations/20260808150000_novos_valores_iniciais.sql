-- Novos valores iniciais de conta, e a fonte unica que os define.
--
-- Pedido explicito do usuario: todo jogador novo comeca com exatamente
-- 100 Poke Ball, 10 Revive, 100 Potion, 1000 de ouro e 0 diamantes.
-- Era 10.000 de CADA consumivel vendavel (4 bolas, 4 pocoes, 2 revives),
-- 500.000 de ouro e 5 diamantes.
--
-- Tres lugares precisavam concordar sobre "o que e uma conta nova":
-- `handle_new_user` (conta criada), `wipe_todos_os_saves` (reset total) e
-- agora o wipe parcial de inventario. Ate aqui a lista estava COPIADA em
-- dois deles (`select id from items where kind in (...)` com 10000 fixo) —
-- mudar o valor exigia lembrar dos dois. Vira uma funcao so.

-- ---------------------------------------------------------------------------
-- 1. A concessao inicial, num lugar so
-- ---------------------------------------------------------------------------
-- Retorna as linhas de `player_items` de uma conta nova. Item que nao esta
-- aqui simplesmente nao e concedido (nao vira linha com quantidade 0): o
-- resto do jogo trata "ausente" e "0" igual, e a Mochila nao lista o que o
-- jogador nao tem.
--
-- Os ids sao literais de proposito, ao contrario da versao anterior, que
-- derivava de `kind`. "Toda bola/pocao/revive do catalogo" deixou de valer:
-- agora so a bola COMUM, a pocao COMUM e o Revive entram — Great/Ultra/
-- Premier Ball, Super/Hyper/Max Potion e Max Revive passam a ser conquista,
-- nao concessao. Derivar de `kind` daria 10 itens, nao 3.
create or replace function public.concessao_inicial_de_itens()
returns table (item_id text, quantity int)
language sql
immutable
set search_path = ''
as $$
  select * from (values
    ('poke_ball', 100),
    ('potion',    100),
    ('revive',     10)
  ) as concessao(item_id, quantity)
$$;

revoke all on function public.concessao_inicial_de_itens() from public;
revoke all on function public.concessao_inicial_de_itens() from anon;
revoke all on function public.concessao_inicial_de_itens() from authenticated;
grant execute on function public.concessao_inicial_de_itens() to service_role;

-- ---------------------------------------------------------------------------
-- 2. Defaults da linha de `players`
-- ---------------------------------------------------------------------------
-- O wipe (total e parcial) reseta por `= default`, entao mudar aqui e o que
-- faz o valor novo valer nos dois sem editar as rotinas.
alter table public.players alter column gold set default 1000;
alter table public.players alter column diamonds set default 0;

-- Configuracao inicial do Bot (pedido explicito): pocao a 50% de vida,
-- auto-catch e auto-revive DESLIGADOS. Antes: pocao a 40%, os tres ligados.
-- O tutorial do Bot (cliente) parte exatamente deste estado.
alter table public.players alter column auto_toggles
  set default '{"autoPot":true,"autoCatch":false,"autoRevive":false}';
alter table public.players alter column auto_pot_rules
  set default '[{"hpPercent":50,"itemId":"potion"}]';

-- ---------------------------------------------------------------------------
-- 3. Conta nova passa a usar a concessao acima
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.players (user_id, unlocked_maps)
  values (new.id, public.hunts_iniciais());

  insert into public.player_items (user_id, item_id, quantity)
  select new.id, c.item_id, c.quantity
  from public.concessao_inicial_de_itens() c;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Wipe TOTAL passa a usar a mesma concessao
-- ---------------------------------------------------------------------------
-- Mesma funcao de antes (ver 20260808121000), so trocando o bloco de itens.
-- `where true` continua obrigatorio: a extensao pg_safeupdate roda no papel
-- que a API REST usa e recusa DELETE/UPDATE sem WHERE mesmo dentro de um
-- SECURITY DEFINER.
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
    set trainer_name = default,
        trainer_level = default,
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

-- ---------------------------------------------------------------------------
-- 5. Wipe PARCIAL: so inventario e economia
-- ---------------------------------------------------------------------------
-- Pedido explicito: "resetar o inventario e economia de TODOS os jogadores
-- do servidor para os novos valores iniciais". POKEs, Pokedex, nivel de
-- treinador, hunts desbloqueadas e configuracao do Bot NAO sao tocados — o
-- jogador perde o estoque, nao o progresso.
--
-- As travas de item (`player_items.locked`) se perdem junto, porque a linha
-- inteira e reescrita. Preservar trava de um item que o jogador nao tem mais
-- nao significa nada, e manter linha so pela trava faria a Mochila listar
-- item zerado.
--
-- Sessao de hunt aberta NAO e fechada: ela nao guarda inventario, e fechar
-- por conta propria descartaria o tempo ja farmado desde o ultimo flush.
create or replace function public.wipe_inventario_e_economia()
returns table (jogadores_afetados bigint, linhas_de_item_apagadas bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  n_itens bigint;
  n_jogadores bigint;
begin
  with apagados as (
    delete from public.player_items where true returning 1
  )
  select count(*) into n_itens from apagados;

  with resetados as (
    update public.players
    set gold = default,
        diamonds = default,
        updated_at = now()
    where true
    returning 1
  )
  select count(*) into n_jogadores from resetados;

  insert into public.player_items (user_id, item_id, quantity)
  select p.user_id, c.item_id, c.quantity
  from public.players p
  cross join public.concessao_inicial_de_itens() c;

  return query select n_jogadores, n_itens;
end;
$$;

-- Mesma razao do wipe total: toda funcao em `public` e chamavel por RPC com
-- a anon key que vai no bundle do jogo. Sem o revoke, qualquer visitante
-- zeraria o inventario de todo mundo com um fetch.
revoke all on function public.wipe_inventario_e_economia() from public;
revoke all on function public.wipe_inventario_e_economia() from anon;
revoke all on function public.wipe_inventario_e_economia() from authenticated;
grant execute on function public.wipe_inventario_e_economia() to service_role;

-- ---------------------------------------------------------------------------
-- 6. Aplica o wipe parcial agora, uma vez
-- ---------------------------------------------------------------------------
-- E o que o pedido descreve ("crie um script de migracao ... para resetar").
-- Rodar aqui dentro garante atomicidade com os defaults novos: nao existe
-- janela em que a conta ja foi zerada mas o default antigo ainda vale.
select public.wipe_inventario_e_economia();

-- Configuracao do Bot dos jogadores que JA existem: alinhada com o default
-- novo. Sem isto, so conta criada a partir de agora teria auto-catch/revive
-- desligados, e o tutorial do Bot explicaria uma tela que nao bate com o que
-- o jogador ve.
update public.players
set auto_toggles = '{"autoPot":true,"autoCatch":false,"autoRevive":false}',
    auto_pot_rules = '[{"hpPercent":50,"itemId":"potion"}]',
    updated_at = now()
where true;
