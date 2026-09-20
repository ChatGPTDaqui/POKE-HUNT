-- PH-563: presets de time de PvP (3 de ataque + 3 de defesa) com golpes por slot.
--
-- Substitui `pvp_time` (1 time por jogador, so ids) como FONTE do time que a
-- arena luta: `pvp_snapshot_time` passa a ler o preset de ATAQUE ativo e grava
-- `golpes_escolhidos` em cada linha do snapshot. O preset de DEFESA so vira alvo
-- na PH-565 (ranqueado assincrono); aqui ele ja existe e pode ser salvo.
--
-- TRANSICAO (PH-565 apaga `pvp_time`): o cliente publicado ainda le `pvp_time` e
-- chama `salvar_time_pvp`, e a fila/bots ainda olham `pvp_time`. Entao, enquanto
-- as duas coisas coexistem, o preset de ataque ATIVO e espelhado em `pvp_time`
-- (`pvp_espelhar_time`) e `salvar_time_pvp` grava o preset ataque #1 por baixo.
-- Um sentido por chamada, nunca os dois: nao ha loop.

create table if not exists public.pvp_preset (
  user_id uuid not null references public.players(user_id) on delete cascade,
  tipo text not null check (tipo in ('ataque', 'defesa')),
  posicao smallint not null check (posicao between 1 and 3),
  nome text not null default '',
  -- [{"pokemon_id": uuid, "golpes": text[]}] em ordem de formacao; `golpes`
  -- vazio = usa `active_abilities` do POKE.
  slots jsonb not null default '[]'::jsonb,
  ativo boolean not null default false,
  atualizado_em timestamptz not null default now(),
  primary key (user_id, tipo, posicao)
);

create unique index if not exists pvp_preset_um_ativo_por_tipo
  on public.pvp_preset (user_id, tipo) where ativo;

alter table public.pvp_preset enable row level security;
drop policy if exists "pvp_preset leitura do dono" on public.pvp_preset;
create policy "pvp_preset leitura do dono" on public.pvp_preset
  for select to authenticated
  using (user_id = auth.uid());
grant select on public.pvp_preset to authenticated;
grant select, insert, update, delete on public.pvp_preset to service_role;

-- Backfill: quem ja tinha `pvp_time` ganha ataque #1 e defesa #1 iguais, ativos,
-- sem golpe escolhido (cai no kit do POKE, exatamente o comportamento de hoje).
insert into public.pvp_preset (user_id, tipo, posicao, nome, slots, ativo)
select t.user_id, tipo, 1, '',
       coalesce((select jsonb_agg(jsonb_build_object('pokemon_id', pid, 'golpes', '[]'::jsonb) order by ord)
                   from unnest(t.pokemon_ids) with ordinality as u(pid, ord)), '[]'::jsonb),
       true
  from public.pvp_time t
 cross join (values ('ataque'), ('defesa')) as tipos(tipo)
on conflict (user_id, tipo, posicao) do nothing;

-- Espelha o preset de ataque ativo em `pvp_time` (transicao, ver cabecalho).
create or replace function public.pvp_espelhar_time(p_user uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ids uuid[];
begin
  select coalesce(array_agg((s.slot->>'pokemon_id')::uuid order by s.ord), '{}')
    into v_ids
    from public.pvp_preset pr
   cross join lateral jsonb_array_elements(pr.slots) with ordinality as s(slot, ord)
   where pr.user_id = p_user and pr.tipo = 'ataque' and pr.ativo;

  insert into public.pvp_time (user_id, pokemon_ids, atualizado_em)
  values (p_user, coalesce(v_ids, '{}'), now())
  on conflict (user_id) do update
    set pokemon_ids = excluded.pokemon_ids, atualizado_em = now();
end
$function$;
revoke execute on function public.pvp_espelhar_time(uuid) from public;

-- Garante as 6 linhas do jogador (3 ataque + 3 defesa) e 1 ativo por tipo.
create or replace function public.pvp_garantir_presets(p_user uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.pvp_preset (user_id, tipo, posicao)
  select p_user, tipo, posicao
    from (values ('ataque'), ('defesa')) as t(tipo)
   cross join generate_series(1, 3) as posicao
  on conflict (user_id, tipo, posicao) do nothing;

  update public.pvp_preset pr
     set ativo = true
   where pr.user_id = p_user and pr.posicao = 1
     and not exists (select 1 from public.pvp_preset o
                      where o.user_id = p_user and o.tipo = pr.tipo and o.ativo);
end
$function$;
revoke execute on function public.pvp_garantir_presets(uuid) from public;

create or replace function public.meus_presets_pvp()
returns setof public.pvp_preset
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_eu uuid := auth.uid();
begin
  if v_eu is null then raise exception 'sem sessao autenticada'; end if;
  perform public.pvp_garantir_presets(v_eu);
  return query select * from public.pvp_preset where user_id = v_eu order by tipo, posicao;
end
$function$;
grant execute on function public.meus_presets_pvp() to authenticated;

-- Salva um preset inteiro. Valida dono, repeticao, teto de 6 slots e de 4
-- golpes, e que cada golpe e conhecido pelo POKE (`unlocked_abilities` ja
-- contem os de TM pelo trigger `preservar_golpes_de_maquina`). Golpe que o
-- POKE nao sabe e ERRO, nao descarte silencioso: o cliente so oferece os
-- conhecidos, entao chegar aqui e bug ou payload forjado.
create or replace function public.salvar_preset_pvp(
  p_tipo text,
  p_posicao integer,
  p_nome text,
  p_slots jsonb
)
returns public.pvp_preset
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_eu uuid := auth.uid();
  v_slot record;
  v_pid uuid;
  v_conhecidos text[];
  v_golpes text[];
  v_vistos uuid[] := '{}';
  v_limpos jsonb := '[]'::jsonb;
  v_nome text := left(coalesce(trim(p_nome), ''), 24);
  v_pr public.pvp_preset;
begin
  if v_eu is null then raise exception 'sem sessao autenticada'; end if;
  if p_tipo not in ('ataque', 'defesa') then raise exception 'Tipo de preset invalido.'; end if;
  if p_posicao is null or p_posicao < 1 or p_posicao > 3 then raise exception 'Posicao de preset invalida.'; end if;
  if p_slots is null or jsonb_typeof(p_slots) <> 'array' then raise exception 'Formacao invalida.'; end if;
  if jsonb_array_length(p_slots) > 6 then raise exception 'Time de PvP aceita no maximo 6 POKEs.'; end if;

  for v_slot in select value as slot, ordinality as ord from jsonb_array_elements(p_slots) with ordinality loop
    if jsonb_typeof(v_slot.slot) <> 'object' or v_slot.slot->>'pokemon_id' is null then
      raise exception 'Slot % invalido.', v_slot.ord;
    end if;
    begin
      v_pid := (v_slot.slot->>'pokemon_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'Slot % invalido.', v_slot.ord;
    end;
    if v_pid = any (v_vistos) then
      raise exception 'Um dos POKEs informados esta repetido.';
    end if;

    select unlocked_abilities into v_conhecidos
      from public.pokemon_instances
     where id = v_pid and user_id = v_eu;
    if not found then
      raise exception 'Um dos POKEs informados nao pertence a voce.';
    end if;

    if v_slot.slot ? 'golpes' and jsonb_typeof(v_slot.slot->'golpes') <> 'array' then
      raise exception 'Golpes do slot % invalidos.', v_slot.ord;
    end if;
    v_golpes := array(select jsonb_array_elements_text(coalesce(v_slot.slot->'golpes', '[]'::jsonb)));
    if coalesce(array_length(v_golpes, 1), 0) > 4 then
      raise exception 'No maximo 4 golpes por POKE.';
    end if;
    if coalesce(array_length(v_golpes, 1), 0) <> (select count(distinct g) from unnest(v_golpes) g) then
      raise exception 'Golpe repetido no slot %.', v_slot.ord;
    end if;
    if exists (
      select 1 from unnest(v_golpes) g
       where g <> 'basic_attack' and not (g = any (coalesce(v_conhecidos, '{}')))
    ) then
      raise exception 'O POKE do slot % nao conhece um dos golpes escolhidos.', v_slot.ord;
    end if;

    v_vistos := array_append(v_vistos, v_pid);
    v_limpos := v_limpos || jsonb_build_array(jsonb_build_object(
      'pokemon_id', v_pid,
      'golpes', to_jsonb(v_golpes)
    ));
  end loop;

  perform public.pvp_garantir_presets(v_eu);

  update public.pvp_preset
     set nome = v_nome, slots = v_limpos, atualizado_em = now()
   where user_id = v_eu and tipo = p_tipo and posicao = p_posicao
  returning * into v_pr;

  if v_pr.tipo = 'ataque' and v_pr.ativo then
    perform public.pvp_espelhar_time(v_eu);
  end if;
  return v_pr;
end
$function$;
grant execute on function public.salvar_preset_pvp(text, integer, text, jsonb) to authenticated;

create or replace function public.ativar_preset_pvp(p_tipo text, p_posicao integer)
returns public.pvp_preset
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_eu uuid := auth.uid();
  v_pr public.pvp_preset;
begin
  if v_eu is null then raise exception 'sem sessao autenticada'; end if;
  if p_tipo not in ('ataque', 'defesa') then raise exception 'Tipo de preset invalido.'; end if;
  if p_posicao is null or p_posicao < 1 or p_posicao > 3 then raise exception 'Posicao de preset invalida.'; end if;

  perform public.pvp_garantir_presets(v_eu);

  update public.pvp_preset set ativo = false
   where user_id = v_eu and tipo = p_tipo and ativo and posicao <> p_posicao;
  update public.pvp_preset set ativo = true, atualizado_em = now()
   where user_id = v_eu and tipo = p_tipo and posicao = p_posicao
  returning * into v_pr;

  if p_tipo = 'ataque' then
    perform public.pvp_espelhar_time(v_eu);
  end if;
  return v_pr;
end
$function$;
grant execute on function public.ativar_preset_pvp(text, integer) to authenticated;

-- Cliente antigo (ate a PH-565): continua gravando so ids; por baixo vira o
-- preset de ataque ATIVO com golpes vazios (kit do POKE), pra snapshot e Build
-- novo enxergarem a mesma coisa.
create or replace function public.salvar_time_pvp(p_pokemon_ids uuid[])
returns public.pvp_time
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_eu uuid := auth.uid();
  v_ids uuid[];
  v_posicao integer;
  v_t public.pvp_time;
begin
  if v_eu is null then raise exception 'sem sessao autenticada'; end if;
  if array_length(p_pokemon_ids, 1) is not null and array_length(p_pokemon_ids, 1) > 6 then
    raise exception 'Time de PvP aceita no maximo 6 POKEs.';
  end if;

  select array_agg(distinct id) into v_ids
    from unnest(p_pokemon_ids) as id
    where exists (select 1 from public.pokemon_instances pi where pi.id = id and pi.user_id = v_eu);

  if coalesce(array_length(v_ids, 1), 0) <> coalesce(array_length(p_pokemon_ids, 1), 0) then
    raise exception 'Um dos POKEs informados nao pertence a voce ou esta repetido.';
  end if;

  perform public.pvp_garantir_presets(v_eu);
  select posicao into v_posicao from public.pvp_preset
   where user_id = v_eu and tipo = 'ataque' and ativo;

  update public.pvp_preset
     set slots = coalesce((select jsonb_agg(jsonb_build_object('pokemon_id', pid, 'golpes', '[]'::jsonb) order by ord)
                             from unnest(p_pokemon_ids) with ordinality as u(pid, ord)), '[]'::jsonb),
         atualizado_em = now()
   where user_id = v_eu and tipo = 'ataque' and posicao = v_posicao;

  perform public.pvp_espelhar_time(v_eu);
  select * into v_t from public.pvp_time where user_id = v_eu;
  return v_t;
end
$function$;

-- Snapshot do preset ativo de um tipo. Slot cujo POKE nao e mais do dono e
-- DESCARTADO (nao e erro): o preset e referencia, nao posse. Cada linha leva
-- `golpes_escolhidos` (text[] em json); vazio = kit do POKE.
create or replace function public.pvp_snapshot_preset(p_user uuid, p_tipo text)
returns jsonb
language sql
stable
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(
           (to_jsonb(pi) - 'user_id')
             || jsonb_build_object('golpes_escolhidos', coalesce(s.slot->'golpes', '[]'::jsonb))
           order by s.ord), '[]'::jsonb)
    from public.pvp_preset pr
   cross join lateral jsonb_array_elements(pr.slots) with ordinality as s(slot, ord)
    join public.pokemon_instances pi
      on pi.id = (s.slot->>'pokemon_id')::uuid and pi.user_id = p_user
   where pr.user_id = p_user and pr.tipo = p_tipo and pr.ativo;
$function$;
revoke execute on function public.pvp_snapshot_preset(uuid, text) from public;

-- Mesma assinatura de antes (fila, bots e amistoso chamam), agora lendo o
-- preset de ATAQUE ativo. Mantem o erro de time vazio que os chamadores esperam.
create or replace function public.pvp_snapshot_time(p_user uuid)
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v jsonb := public.pvp_snapshot_preset(p_user, 'ataque');
begin
  if jsonb_array_length(v) = 0 then
    raise exception 'Nenhum POKE informado para o duelo.';
  end if;
  return v;
end
$function$;
