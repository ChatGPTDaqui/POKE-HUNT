-- PH-198 — "Especialidades": progressao de dano/defesa por tipo elemental.
-- Gemeo public de `20260826200001_especialidades_dev.sql`.
--
-- `tipo` e TEXT + check, NAO o enum `element_type`: aquele enum (criado em
-- 20260806201818) tem só 17 valores e nunca ganhou 'FAIRY' (ver
-- 20260814120100, que teve que contornar a mesma lacuna pra `items.stone_type`
-- indo direto de TEXT). Usar o enum aqui herdaria o mesmo bug pra Especialidade
-- Fada. A lacuna do enum em si fica fora desta migration — achado reportado
-- separado, nao e desta issue.
begin;

create table public.player_especialidades (
  user_id uuid not null references public.players(user_id) on delete cascade,
  tipo text not null check (tipo in (
    'NORMAL','FIRE','WATER','ELECTRIC','GRASS','ICE','FIGHTING','POISON',
    'GROUND','FLYING','PSYCHIC','BUG','ROCK','GHOST','DRAGON','DARK','STEEL','FAIRY'
  )),
  dano_nivel smallint not null default 0 check (dano_nivel between 0 and 5),
  defesa_nivel smallint not null default 0 check (defesa_nivel between 0 and 5),
  updated_at timestamptz not null default now(),
  primary key (user_id, tipo)
);

alter table public.player_especialidades enable row level security;

create policy "own rows all" on public.player_especialidades for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "admin reads all" on public.player_especialidades for select to authenticated
  using ((select public.is_admin()));

grant select, insert, update, delete on public.player_especialidades to authenticated;
grant select, insert, update, delete on public.player_especialidades to service_role;

-- Sobe UM nivel de UMA trilha (dano OU defesa) de UM tipo por chamada — mesmo
-- desenho de granularidade de `comprar_item`. Material consumido e a Stone do
-- proprio tipo (`data/stones.ts` no cliente): ja existe, ja tem fonte de drop
-- (kill universal), evita inventar item novo sem como o jogador conseguir.
create function public.subir_nivel_especialidade(p_tipo text, p_trilha text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_nivel_atual int;
  -- Custo pra alcancar o nivel (indice+1) — mesma tabela de
  -- `data/especialidades.ts#ESPECIALIDADE_CUSTOS`. Os dois lados PRECISAM
  -- concordar (mesmo cuidado documentado em 20260814120100 pro desconto de
  -- loja): quem cobra de verdade e este SQL, o cliente so espelha pra
  -- mostrar o preco antes de clicar.
  v_stone_qtd_por_nivel int[] := array[15, 35, 70, 130, 220];
  v_gold_por_nivel bigint[] := array[500, 1500, 4000, 10000, 25000];
  v_stone_qtd int;
  v_gold bigint;
  v_stone_id text;
  v_stone_atual int;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;
  if p_trilha not in ('dano', 'defesa') then
    raise exception 'trilha invalida' using errcode = 'P0001';
  end if;
  if p_tipo not in (
    'NORMAL','FIRE','WATER','ELECTRIC','GRASS','ICE','FIGHTING','POISON',
    'GROUND','FLYING','PSYCHIC','BUG','ROCK','GHOST','DRAGON','DARK','STEEL','FAIRY'
  ) then
    raise exception 'tipo invalido' using errcode = 'P0001';
  end if;

  -- Mesmo padrao de todas as RPCs que escrevem em `players` (PH-67): serializa
  -- contra o flush periodico do MESMO usuario, evita a corrida de
  -- CONFLITO_ESCRITA_JOGADOR.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

  insert into public.player_especialidades (user_id, tipo) values (v_user_id, p_tipo)
    on conflict (user_id, tipo) do nothing;

  select case p_trilha when 'dano' then dano_nivel else defesa_nivel end into v_nivel_atual
    from public.player_especialidades where user_id = v_user_id and tipo = p_tipo;

  if v_nivel_atual >= 5 then
    raise exception 'Especialidade ja esta no nivel maximo.' using errcode = 'P0001';
  end if;

  v_stone_qtd := v_stone_qtd_por_nivel[v_nivel_atual + 1];
  v_gold := v_gold_por_nivel[v_nivel_atual + 1];
  v_stone_id := 'stone_' || lower(p_tipo);

  select quantity into v_stone_atual from public.player_items
    where user_id = v_user_id and item_id = v_stone_id;
  if coalesce(v_stone_atual, 0) < v_stone_qtd then
    raise exception 'Stones insuficientes.' using errcode = 'P0001';
  end if;

  update public.players set gold = gold - v_gold
    where user_id = v_user_id and gold >= v_gold;
  if not found then
    raise exception 'Ouro insuficiente.' using errcode = 'P0001';
  end if;

  update public.player_items set quantity = quantity - v_stone_qtd, updated_at = now()
    where user_id = v_user_id and item_id = v_stone_id;

  update public.player_especialidades set
    dano_nivel = case when p_trilha = 'dano' then dano_nivel + 1 else dano_nivel end,
    defesa_nivel = case when p_trilha = 'defesa' then defesa_nivel + 1 else defesa_nivel end,
    updated_at = now()
    where user_id = v_user_id and tipo = p_tipo;

  return jsonb_build_object(
    'ok', true,
    'mensagem', format('Especialidade %s (%s) subiu para o nivel %s.', p_tipo, p_trilha, v_nivel_atual + 1)
  );
end;
$$;

revoke all on function public.subir_nivel_especialidade(text, text) from public;
revoke execute on function public.subir_nivel_especialidade(text, text) from anon;
grant execute on function public.subir_nivel_especialidade(text, text) to authenticated;

commit;
