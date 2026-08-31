-- PH-310 (PH-120, fatia 2): a OFERTA em cima da mesa, e a reserva do que esta
-- nela.
--
-- A fatia 1 entregou a mesa (`troca_sessao`) e nao movia POKE nem item. Esta
-- entrega o que vai em cima dela, a reserva do que esta na mesa e o contador de
-- versao que a fatia 3 vai usar pra recusar confirmacao velha.
--
-- Continua FORA daqui: a confirmacao dupla e a execucao atomica (fatia 3) e a
-- tela (fatia 4). Nada abaixo troca dono de coisa nenhuma — o POKE sai da
-- mochila de quem ofereceu e volta pra ela em toda saida possivel.
--
-- ===========================================================================
-- 1. A RESERVA E UM LUGAR, NAO UMA FLAG
-- ===========================================================================
-- O POKE ofertado vai pra `location = 'troca'` (valor adicionado no arquivo
-- anterior). Isso o remove de todas as RPCs que consomem POKE sem que nenhuma
-- delas mude uma linha, porque todas ja exigem `location = 'bag'`:
-- `vender_poke`, `anunciar_poke`, `criar_leilao`, `por_na_equipe`,
-- `evoluir_poke`. E `snapshotToGameState` filtra 'team'/'bag', entao ele some
-- da tela de quem ofereceu — que e o comportamento certo: enquanto esta na
-- mesa, nao esta com voce.
--
-- Item nao tem `location`: a reserva dele e DEBITO em `player_items`, com o
-- saldo guardado na linha da oferta. Mesmo espirito do escrow do Mercado.
--
-- ===========================================================================
-- 2. A VERSAO SOBE POR TRIGGER, E ESSA E A DECISAO QUE IMPEDE O GOLPE
-- ===========================================================================
-- `troca_sessao.versao` sobe a cada alteracao da oferta. A fatia 3 vai carregar
-- essa versao na confirmacao e recusar a que vier velha — e o que impede o
-- golpe classico de trocar a oferta no instante em que o outro confirma.
--
-- O incremento e TRIGGER e nao chamada dentro de cada RPC de proposito. Existe
-- um caminho que altera a oferta sem passar por RPC nenhuma:
--
--   `reiniciar_jogo` faz `delete from pokemon_instances where user_id = ...`
--
-- A linha da oferta some junto, pela FK em cascata. Se a versao nao subisse ai,
-- a confirmacao que o outro lado ja tinha dado continuaria valida sobre uma
-- mesa que mudou — ele entregaria o POKE dele e receberia nada. O trigger
-- enxerga o `delete` em cascata igual enxerga o `delete` da RPC.
--
-- ===========================================================================
-- 3. TODA SAIDA DEVOLVE
-- ===========================================================================
-- Cancelar e expirar passam por `_devolver_oferta`, que devolve POKE pra
-- mochila, item pro inventario e ESVAZIA a oferta. Concluir NAO passa por ele:
-- a fatia 3 TRANSFERE em vez de devolver, e reaproveitar este caminho la seria
-- desfazer a troca no instante em que ela acontece.
--
-- Esvaziar nao e limpeza cosmetica: e o que permite o indice UNIQUE global em
-- `poke_uid` abaixo. Guardando historico, o mesmo POKE nunca mais poderia ser
-- ofertado depois da primeira troca.

-- ---------------------------------------------------------------------------
-- A versao da oferta mora na MESA, nao na linha
-- ---------------------------------------------------------------------------
-- Na mesa porque e uma so pros dois lados: a confirmacao vale sobre a mesa
-- inteira, nao sobre um item dela.
alter table public.troca_sessao
  add column if not exists versao integer not null default 0;

comment on column public.troca_sessao.versao is
  'PH-310: sobe a cada alteracao da oferta (por trigger). A fatia 3 recusa confirmacao de versao antiga.';

-- ---------------------------------------------------------------------------
-- A oferta
-- ---------------------------------------------------------------------------
create table if not exists public.troca_oferta (
  id uuid primary key default gen_random_uuid(),
  sessao_id uuid not null references public.troca_sessao(id) on delete cascade,
  -- De QUEM e o que esta na mesa. Nao da pra derivar da sessao: os dois lados
  -- poem coisa na MESMA mesa.
  dono_id uuid not null references public.players(user_id) on delete cascade,
  tipo text not null check (tipo in ('poke', 'item')),
  -- `on delete cascade` e deliberado, e o trigger de versao e o que o torna
  -- seguro: o POKE pode sumir do banco por fora (reiniciar_jogo), e quando isso
  -- acontece a mesa precisa saber que mudou.
  poke_uid uuid references public.pokemon_instances(id) on delete cascade,
  item_id text references public.items(id) on delete restrict,
  quantidade integer not null default 1 check (quantidade > 0),
  criada_em timestamptz not null default now(),
  -- Uma linha e OU um POKE OU uma pilha de item, nunca as duas nem nenhuma.
  constraint troca_oferta_forma check (
    (tipo = 'poke' and poke_uid is not null and item_id is null and quantidade = 1)
    or (tipo = 'item' and item_id is not null and poke_uid is null)
  )
);

comment on table public.troca_oferta is
  'PH-310: o que cada lado pos na mesa de troca. POKE fica reservado em pokemon_instances.location = troca; item fica debitado de player_items.';

-- O MESMO POKE NAO PODE ESTAR EM DUAS MESAS.
--
-- Global e nao por sessao: um indice por sessao deixaria o mesmo POKE em duas
-- mesas diferentes. Funciona sendo global porque `_devolver_oferta` esvazia a
-- oferta em toda saida — nao ha linha de mesa morta ocupando o lugar.
--
-- Na pratica ha DUAS travas pro mesmo caso, e isso e de proposito: a RPC so
-- move POKE que esteja em 'bag', entao um POKE ja reservado nem chega aqui.
-- Este indice e a rede embaixo, pro dia em que alguem escrever a terceira RPC.
create unique index if not exists troca_oferta_poke_unico
  on public.troca_oferta (poke_uid)
  where poke_uid is not null;

-- Uma pilha por item por lado: por 5 Pocao e depois mais 3 vira uma linha de 8,
-- nao duas linhas. Sem isto o teto de linhas abaixo seria contornavel botando o
-- mesmo item varias vezes.
create unique index if not exists troca_oferta_item_por_lado
  on public.troca_oferta (sessao_id, dono_id, item_id)
  where item_id is not null;

create index if not exists troca_oferta_por_sessao
  on public.troca_oferta (sessao_id);

alter table public.troca_oferta enable row level security;

-- Le quem esta na mesa — os DOIS lados, porque ver o que o outro ofereceu e o
-- ponto da troca. Sem policy de escrita: tudo passa pelas RPCs abaixo, que sao
-- o unico lugar onde a reserva acontece junto com a linha. Um grant de INSERT
-- aqui deixaria inserir oferta sem reservar nada.
drop policy if exists "oferta leitura dos participantes" on public.troca_oferta;
create policy "oferta leitura dos participantes" on public.troca_oferta
  for select to authenticated
  using (exists (
    select 1 from public.troca_sessao s
     where s.id = sessao_id
       and (s.anfitriao_id = auth.uid() or s.convidado_id = auth.uid())
  ));

grant select on public.troca_oferta to authenticated;
grant select, insert, update, delete on public.troca_oferta to service_role;

-- ---------------------------------------------------------------------------
-- O trigger de versao
-- ---------------------------------------------------------------------------
create or replace function public.troca_oferta_sobe_versao()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- `coalesce(new, old)` porque o mesmo gatilho serve insert, update e delete.
  -- Quando a propria SESSAO e apagada, o cascade apaga estas linhas e o update
  -- abaixo nao acha nada — no-op, e nao erro.
  update public.troca_sessao
     set versao = versao + 1,
         atualizada_em = now()
   where id = coalesce(new.sessao_id, old.sessao_id);
  return null;
end;
$function$;

drop trigger if exists troca_oferta_versao on public.troca_oferta;
create trigger troca_oferta_versao
  after insert or update or delete on public.troca_oferta
  for each row execute function public.troca_oferta_sobe_versao();

-- ---------------------------------------------------------------------------
-- Devolver: o caminho unico de volta
-- ---------------------------------------------------------------------------
-- Sem `auth.uid()` aqui de proposito: quem chama e `encerrar_troca` (o
-- jogador), `expirar_trocas` (o cron) e, na fatia 3, a execucao. Repetir a
-- checagem de dono em cada um deles daria tres lugares pra esquecer.
create or replace function public._devolver_oferta(p_sessao_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- POKE volta pra mochila. O `and location = 'troca'` evita ressuscitar um
  -- POKE que ja tenha ido pra outro lugar por qualquer caminho futuro.
  update public.pokemon_instances p
     set location = 'bag', team_slot = null, updated_at = now()
    from public.troca_oferta o
   where o.sessao_id = p_sessao_id
     and o.poke_uid = p.id
     and p.user_id = o.dono_id
     and p.location = 'troca';

  -- Item volta somando: a linha pode ter sido apagada por chegar a zero, ou o
  -- jogador pode ter ganhado mais do mesmo item enquanto a mesa estava aberta.
  insert into public.player_items (user_id, item_id, quantity)
  select o.dono_id, o.item_id, o.quantidade
    from public.troca_oferta o
   where o.sessao_id = p_sessao_id and o.item_id is not null
  on conflict (user_id, item_id)
    do update set quantity = public.player_items.quantity + excluded.quantity,
                  updated_at = now();

  delete from public.troca_oferta where sessao_id = p_sessao_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- A mesa aberta em que EU estou — lida e travada
-- ---------------------------------------------------------------------------
-- `for update` porque todo caminho abaixo le o estado e escreve depois; sem ele
-- duas chamadas simultaneas leriam as duas a mesma mesa 'aberta'.
create or replace function public._mesa_aberta_minha(p_sessao_id uuid, p_eu uuid)
returns public.troca_sessao
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sessao public.troca_sessao;
begin
  select * into v_sessao from public.troca_sessao where id = p_sessao_id for update;
  if not found then
    raise exception 'Troca nao encontrada.';
  end if;
  if v_sessao.anfitriao_id <> p_eu and v_sessao.convidado_id <> p_eu then
    raise exception 'Voce nao esta nesta troca.';
  end if;
  -- 'convidada' nao serve: nao ha mesa antes de o outro aceitar, e deixar
  -- reservar POKE num convite que ninguem viu seria POKE preso de graca.
  if v_sessao.estado <> 'aberta' then
    raise exception 'Esta troca nao esta aberta.';
  end if;
  if v_sessao.expira_em <= now() then
    raise exception 'Esta troca expirou.';
  end if;
  return v_sessao;
end;
$function$;

-- Teto de linhas por lado. O numero espelha `TROCA_MAX_LINHAS_POR_LADO` no
-- TypeScript e ha teste comparando os dois.
--
-- Existe por dois motivos concretos, e nenhum e estetico: a execucao da fatia 3
-- e UMA transacao, e mesa de 300 linhas vira transacao longa segurando lock nas
-- duas contas; e a tela da fatia 4 precisa caber.
create or replace function public._troca_teto_por_lado()
returns integer language sql immutable as $function$ select 10 $function$;

-- ---------------------------------------------------------------------------
-- Por POKE na mesa / tirar POKE da mesa
-- ---------------------------------------------------------------------------
create or replace function public.por_poke_na_mesa(p_sessao_id uuid, p_poke_id uuid)
returns public.troca_sessao
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_eu uuid := auth.uid();
  v_sessao public.troca_sessao;
  v_minhas integer;
begin
  if v_eu is null then
    raise exception 'sem sessao autenticada';
  end if;
  v_sessao := public._mesa_aberta_minha(p_sessao_id, v_eu);

  select count(*) into v_minhas from public.troca_oferta
   where sessao_id = p_sessao_id and dono_id = v_eu;
  if v_minhas >= public._troca_teto_por_lado() then
    raise exception 'Sua parte da mesa esta cheia (% linhas).', public._troca_teto_por_lado();
  end if;

  -- A reserva E o update, e ele e a autoridade: quem nao conseguir mover a
  -- linha nao chega a inserir oferta. `location = 'bag'` cobre de uma vez o
  -- POKE em campo, o ja reservado em outra mesa e o anunciado no Mercado.
  update public.pokemon_instances
     set location = 'troca', team_slot = null, updated_at = now()
   where id = p_poke_id
     and user_id = v_eu
     and location = 'bag'
     and coalesce(locked, false) = false;
  if not found then
    raise exception 'POKE indisponivel — precisa estar na mochila, destravado e fora de outra troca.';
  end if;

  insert into public.troca_oferta (sessao_id, dono_id, tipo, poke_uid)
  values (p_sessao_id, v_eu, 'poke', p_poke_id);

  -- Rele DEPOIS do insert: o trigger ja subiu a versao, e o cliente precisa da
  -- versao nova pra confirmar na fatia 3.
  select * into v_sessao from public.troca_sessao where id = p_sessao_id;
  return v_sessao;
end;
$function$;

create or replace function public.tirar_poke_da_mesa(p_sessao_id uuid, p_poke_id uuid)
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

  -- Apaga primeiro: e o claim. Se a linha nao existe (ja tirada, ou levada pela
  -- cascata de um POKE apagado), nada e devolvido duas vezes.
  delete from public.troca_oferta
   where sessao_id = p_sessao_id and dono_id = v_eu and poke_uid = p_poke_id;
  if not found then
    raise exception 'Este POKE nao esta na sua parte da mesa.';
  end if;

  update public.pokemon_instances
     set location = 'bag', team_slot = null, updated_at = now()
   where id = p_poke_id and user_id = v_eu and location = 'troca';

  select * into v_sessao from public.troca_sessao where id = p_sessao_id;
  return v_sessao;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Por item na mesa / tirar item da mesa
-- ---------------------------------------------------------------------------
create or replace function public.por_item_na_mesa(p_sessao_id uuid, p_item_id text, p_quantidade integer)
returns public.troca_sessao
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_eu uuid := auth.uid();
  v_sessao public.troca_sessao;
  v_minhas integer;
  v_ja boolean;
begin
  if v_eu is null then
    raise exception 'sem sessao autenticada';
  end if;
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade invalida.';
  end if;
  v_sessao := public._mesa_aberta_minha(p_sessao_id, v_eu);

  select exists (
    select 1 from public.troca_oferta
     where sessao_id = p_sessao_id and dono_id = v_eu and item_id = p_item_id
  ) into v_ja;

  -- O teto conta LINHA, e somar em pilha que ja existe nao cria linha. Sem esta
  -- distincao, por mais 1 Pocao numa pilha existente seria recusado com a mesa
  -- cheia de pilhas que ja estavam la.
  if not v_ja then
    select count(*) into v_minhas from public.troca_oferta
     where sessao_id = p_sessao_id and dono_id = v_eu;
    if v_minhas >= public._troca_teto_por_lado() then
      raise exception 'Sua parte da mesa esta cheia (% linhas).', public._troca_teto_por_lado();
    end if;
  end if;

  -- O debito e o claim, e o `quantity >= p_quantidade` o torna atomico: duas
  -- chamadas simultaneas pedindo o saldo inteiro, so uma passa.
  update public.player_items
     set quantity = quantity - p_quantidade, updated_at = now()
   where user_id = v_eu
     and item_id = p_item_id
     and quantity >= p_quantidade
     and coalesce(locked, false) = false;
  if not found then
    raise exception 'Voce nao tem essa quantidade deste item disponivel.';
  end if;

  insert into public.troca_oferta (sessao_id, dono_id, tipo, item_id, quantidade)
  values (p_sessao_id, v_eu, 'item', p_item_id, p_quantidade)
  on conflict (sessao_id, dono_id, item_id) where item_id is not null
    do update set quantidade = public.troca_oferta.quantidade + excluded.quantidade;

  select * into v_sessao from public.troca_sessao where id = p_sessao_id;
  return v_sessao;
end;
$function$;

create or replace function public.tirar_item_da_mesa(p_sessao_id uuid, p_item_id text, p_quantidade integer)
returns public.troca_sessao
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_eu uuid := auth.uid();
  v_sessao public.troca_sessao;
  v_na_mesa integer;
begin
  if v_eu is null then
    raise exception 'sem sessao autenticada';
  end if;
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade invalida.';
  end if;
  v_sessao := public._mesa_aberta_minha(p_sessao_id, v_eu);

  select quantidade into v_na_mesa from public.troca_oferta
   where sessao_id = p_sessao_id and dono_id = v_eu and item_id = p_item_id
   for update;
  if not found then
    raise exception 'Este item nao esta na sua parte da mesa.';
  end if;
  if v_na_mesa < p_quantidade then
    raise exception 'Voce nao pos essa quantidade na mesa.';
  end if;

  -- Zerar por UPDATE estouraria o `check (quantidade > 0)`. Sao dois caminhos
  -- porque sao duas coisas diferentes: tirar parte, e tirar tudo.
  if v_na_mesa = p_quantidade then
    delete from public.troca_oferta
     where sessao_id = p_sessao_id and dono_id = v_eu and item_id = p_item_id;
  else
    update public.troca_oferta
       set quantidade = quantidade - p_quantidade
     where sessao_id = p_sessao_id and dono_id = v_eu and item_id = p_item_id;
  end if;

  insert into public.player_items (user_id, item_id, quantity)
  values (v_eu, p_item_id, p_quantidade)
  on conflict (user_id, item_id)
    do update set quantity = public.player_items.quantity + excluded.quantity,
                  updated_at = now();

  select * into v_sessao from public.troca_sessao where id = p_sessao_id;
  return v_sessao;
end;
$function$;

-- ---------------------------------------------------------------------------
-- As saidas da fatia 1 passam a devolver
-- ---------------------------------------------------------------------------
-- Reescritas inteiras e nao remendadas: `create or replace` substitui o corpo,
-- e deixar a versao antiga viva com uma chamada nova em outro arquivo faria a
-- definicao vigente depender da ordem dos deploys.
create or replace function public.encerrar_troca(p_sessao_id uuid, p_motivo text default 'cancelada')
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
  if p_motivo not in ('cancelada') then
    raise exception 'motivo invalido';
  end if;

  select * into v_sessao from public.troca_sessao
   where id = p_sessao_id for update;
  if not found then
    raise exception 'Troca nao encontrada.';
  end if;
  if v_sessao.anfitriao_id <> v_eu and v_sessao.convidado_id <> v_eu then
    raise exception 'Voce nao esta nesta troca.';
  end if;

  if v_sessao.estado not in ('convidada', 'aberta') then
    return v_sessao;
  end if;

  -- ANTES de mudar o estado: `_devolver_oferta` apaga linhas, o trigger sobe a
  -- versao, e a linha lida de volta no fim ja traz o numero final.
  perform public._devolver_oferta(p_sessao_id);

  update public.troca_sessao
     set estado = p_motivo,
         encerrada_por = v_eu,
         encerrada_em = now(),
         atualizada_em = now()
   where id = p_sessao_id
  returning * into v_sessao;

  return v_sessao;
end;
$function$;

create or replace function public.expirar_trocas()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_quantas integer := 0;
  v_id uuid;
begin
  -- Deixou de ser um UPDATE em massa: cada mesa vencida precisa DEVOLVER o que
  -- estava reservado antes de virar 'expirada', e devolver e por sessao.
  --
  -- `for update skip locked` porque o cron e `abrir_troca` podem cair na mesma
  -- mesa ao mesmo tempo; a que estiver travada por outra transacao fica pra
  -- proxima varredura em vez de bloquear a fila inteira.
  for v_id in
    select id from public.troca_sessao
     where estado in ('convidada', 'aberta')
       and expira_em <= now()
     for update skip locked
  loop
    perform public._devolver_oferta(v_id);
    update public.troca_sessao
       set estado = 'expirada', encerrada_em = now(), atualizada_em = now()
     where id = v_id;
    v_quantas := v_quantas + 1;
  end loop;
  return v_quantas;
end;
$function$;

create or replace function public.aceitar_troca(p_sessao_id uuid)
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

  select * into v_sessao from public.troca_sessao
   where id = p_sessao_id for update;
  if not found then
    raise exception 'Troca nao encontrada.';
  end if;
  if v_sessao.convidado_id <> v_eu then
    raise exception 'So quem foi convidado pode aceitar.';
  end if;
  if v_sessao.estado <> 'convidada' then
    raise exception 'Esta troca nao esta esperando aceite.';
  end if;
  if v_sessao.expira_em <= now() then
    -- Convite ainda nao tem oferta em cima (por na mesa exige 'aberta'), mas a
    -- devolucao vai aqui do mesmo jeito: e barata, e nao depender disso e o que
    -- faz a proxima mudanca de regra nao virar POKE preso.
    perform public._devolver_oferta(p_sessao_id);
    update public.troca_sessao
       set estado = 'expirada', encerrada_em = now(), atualizada_em = now()
     where id = p_sessao_id;
    raise exception 'Esta troca expirou.';
  end if;

  update public.troca_sessao
     set estado = 'aberta',
         atualizada_em = now(),
         expira_em = now() + interval '15 minutes'
   where id = p_sessao_id
  returning * into v_sessao;

  return v_sessao;
end;
$function$;

grant execute on function public.por_poke_na_mesa(uuid, uuid) to authenticated;
grant execute on function public.tirar_poke_da_mesa(uuid, uuid) to authenticated;
grant execute on function public.por_item_na_mesa(uuid, text, integer) to authenticated;
grant execute on function public.tirar_item_da_mesa(uuid, text, integer) to authenticated;
-- Os auxiliares NAO vao pro cliente: `_devolver_oferta` devolve sem perguntar de
-- quem e a mesa, e `_mesa_aberta_minha` so faz sentido dentro de uma transacao
-- que vai escrever em seguida.
grant execute on function public._devolver_oferta(uuid) to service_role;
grant execute on function public._mesa_aberta_minha(uuid, uuid) to service_role;
grant execute on function public._troca_teto_por_lado() to authenticated;
