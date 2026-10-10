-- Espelho de 20261010180000_diario_public.sql no schema `dev`. O raciocínio está na migration irmã.
begin;

create table if not exists dev.player_diario (
  user_id uuid not null references dev.players(user_id) on delete cascade,
  dia date not null,
  abates_base bigint not null,
  coletados text[] not null default '{}',
  primary key (user_id, dia)
);

-- Leitura própria; escrita só pelas RPCs (security definer). Um grant de
-- escrita deixaria o cliente rebaixar a própria base de abates.
alter table dev.player_diario enable row level security;
drop policy if exists "diario leitura propria" on dev.player_diario;
create policy "diario leitura propria" on dev.player_diario
  for select to authenticated using (user_id = auth.uid());
grant select on dev.player_diario to authenticated;
grant select, insert, update, delete on dev.player_diario to service_role;

-- Dia de Brasília. Uma função só, para as duas RPCs nunca discordarem.
create or replace function dev._dia_do_diario()
returns date
language sql
stable
as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

-- Anota a base do dia (se ainda não houver) e devolve o estado do diário.
create or replace function dev.abrir_dia()
returns jsonb
language plpgsql
security definer
set search_path = dev
as $$
declare
  v_user_id uuid := auth.uid();
  v_dia date := dev._dia_do_diario();
  v_linha dev.player_diario%rowtype;
  v_logins int;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;

  insert into dev.player_diario (user_id, dia, abates_base)
  select v_user_id, v_dia, coalesce(sum(normal_kills + shiny_kills), 0)
    from dev.player_pokedex where user_id = v_user_id
  on conflict (user_id, dia) do nothing;

  select * into v_linha from dev.player_diario where user_id = v_user_id and dia = v_dia;
  select count(*) into v_logins from dev.player_diario
    where user_id = v_user_id and date_trunc('month', dia) = date_trunc('month', v_dia) and 'login' = any (coletados);

  return jsonb_build_object(
    'dia', v_dia, 'abatesBase', v_linha.abates_base, 'coletados', to_jsonb(v_linha.coletados), 'loginsNoMes', v_logins
  );
end;
$$;

create or replace function dev.coletar_diario(p_item text)
returns jsonb
language plpgsql
security definer
set search_path = dev
as $$
declare
  v_user_id uuid := auth.uid();
  v_dia date := dev._dia_do_diario();
  v_linha dev.player_diario%rowtype;
  v_nivel int;
  v_base bigint;
  v_ouro bigint;
  v_itens jsonb;
  v_item jsonb;
  v_k int;
  v_abates bigint;
  v_alvo int;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;
  if p_item not in ('login', 'meta_100', 'meta_300', 'meta_1000') then
    raise exception 'Item do diario desconhecido.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

  -- Sem linha do dia (cliente coletou sem abrir), a base é agora: a meta de
  -- abates falha naturalmente, o login segue.
  insert into dev.player_diario (user_id, dia, abates_base)
  select v_user_id, v_dia, coalesce(sum(normal_kills + shiny_kills), 0)
    from dev.player_pokedex where user_id = v_user_id
  on conflict (user_id, dia) do nothing;
  select * into v_linha from dev.player_diario where user_id = v_user_id and dia = v_dia;

  if p_item = any (v_linha.coletados) then
    raise exception 'Ja coletado hoje.' using errcode = 'P0001';
  end if;

  select trainer_level into v_nivel from dev.players where user_id = v_user_id;
  if v_nivel is null then
    raise exception 'jogador sem linha em players' using errcode = 'P0001';
  end if;
  v_base := 100 * v_nivel + 5 * v_nivel * v_nivel;

  if p_item = 'login' then
    select count(*) + 1 into v_k from dev.player_diario
      where user_id = v_user_id and date_trunc('month', dia) = date_trunc('month', v_dia) and 'login' = any (coletados);
    case v_k
      when 7 then v_ouro := greatest(2000, v_base / 4); v_itens := '[{"itemId":"ultra_ball","quantidade":30},{"itemId":"revive","quantidade":3}]';
      when 14 then v_ouro := greatest(4000, v_base / 3); v_itens := '[{"itemId":"ultra_ball","quantidade":40},{"itemId":"revive","quantidade":5}]';
      when 21 then v_ouro := greatest(6000, v_base / 2); v_itens := '[{"itemId":"ultra_ball","quantidade":50},{"itemId":"max_revive","quantidade":3}]';
      when 28 then v_ouro := greatest(10000, v_base); v_itens := '[{"itemId":"ultra_ball","quantidade":100},{"itemId":"max_revive","quantidade":5}]';
      else v_ouro := greatest(300, v_base / 20); v_itens := '[{"itemId":"great_ball","quantidade":15},{"itemId":"super_potion","quantidade":5}]';
    end case;
  else
    v_alvo := substring(p_item from 6)::int;
    select coalesce(sum(normal_kills + shiny_kills), 0) into v_abates from dev.player_pokedex where user_id = v_user_id;
    if v_abates - v_linha.abates_base < v_alvo then
      raise exception 'Meta ainda nao cumprida (% de %).', v_abates - v_linha.abates_base, v_alvo using errcode = 'P0001';
    end if;
    case p_item
      when 'meta_100' then v_ouro := greatest(500, v_base / 10); v_itens := '[{"itemId":"great_ball","quantidade":20},{"itemId":"super_potion","quantidade":10}]';
      when 'meta_300' then v_ouro := greatest(1000, v_base / 5); v_itens := '[{"itemId":"ultra_ball","quantidade":25}]';
      else v_ouro := greatest(2500, v_base / 2); v_itens := '[{"itemId":"ultra_ball","quantidade":50},{"itemId":"revive","quantidade":3}]';
    end case;
  end if;

  for v_item in select * from jsonb_array_elements(v_itens) loop
    insert into dev.player_items (user_id, item_id, quantity)
    values (v_user_id, v_item->>'itemId', (v_item->>'quantidade')::int)
    on conflict (user_id, item_id) do update
      set quantity = dev.player_items.quantity + excluded.quantity, updated_at = now();
  end loop;
  -- SEMPRE toca players (mesmo motivo de reivindicar_passo): o CAS do flush
  -- da caçada relê o inventário em vez de gravar a quantidade antiga por cima.
  update dev.players set gold = gold + v_ouro where user_id = v_user_id;

  update dev.player_diario set coletados = array_append(coletados, p_item)
    where user_id = v_user_id and dia = v_dia;

  return jsonb_build_object('ok', true, 'mensagem', 'Premio do diario coletado!');
end;
$$;

revoke all on function dev.abrir_dia() from public;
revoke execute on function dev.abrir_dia() from anon;
grant execute on function dev.abrir_dia() to authenticated;
revoke all on function dev.coletar_diario(text) from public;
revoke execute on function dev.coletar_diario(text) from anon;
grant execute on function dev.coletar_diario(text) to authenticated;

commit;
