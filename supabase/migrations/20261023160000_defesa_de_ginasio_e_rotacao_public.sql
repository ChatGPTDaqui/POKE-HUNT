-- Equipe de defesa do ginasio + rotacao de golpes por POKE (23/10/2026, design
-- aprovado pelo dono: docs/planos/2026-10-23-montador-de-equipe-design.md).
--
-- 1. O lider escolhe a defesa no montador: por vaga, o POKE (REFERENCIA viva,
--    nao copia), os golpes e se ele usa Rotacao (ordem) ou Inteligente.
--    Cada desafio le os POKEs atuais. `equipe` continua sendo a foto pra NPC
--    e pra quem olha o ginasio.
-- 2. POKE que defende fica TRAVADO (e trancado, o cadeado da mochila): o dono nao vende, anuncia, leiloa, troca
--    nem solta (trigger em pokemon_instances). Sai da trava quando sai da
--    defesa ou quando o mandato acaba.
-- 3. Presets do PvP ganham `rotacao` por slot; o snapshot leva pro motor.

begin;

alter table public.ginasio_lider add column if not exists defesa jsonb;

-- Foto da equipe atual agora leva o id do POKE (vira a defesa de quem assume).
create or replace function public._equipe_de_ginasio(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'pokemon_id', p.id,
    'species_id', p.species_id,
    'level', p.level,
    'iv', jsonb_build_array(p.iv_hp, p.iv_atk_fis, p.iv_atk_esp, p.iv_def, p.iv_def_esp, p.iv_speed),
    'rarity', p.rarity::text,
    'is_shiny', p.is_shiny,
    'nature', p.nature,
    'active_abilities', to_jsonb(p.active_abilities),
    'golpes_de_maquina', to_jsonb(p.golpes_de_maquina)
  ) order by p.team_slot), '[]'::jsonb)
  from public.pokemon_instances p
  where p.user_id = p_user and p.location = 'team'
$$;
revoke all on function public._equipe_de_ginasio(uuid) from public, anon, authenticated;

-- A defesa VIVA: le os POKEs do lider agora, na ordem das vagas, com os golpes
-- e a rotacao de cada vaga. POKE que nao e mais do lider some da lista.
create or replace function public._defesa_viva(p_user uuid, p_defesa jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'pokemon_id', p.id,
    'species_id', p.species_id,
    'level', p.level,
    'iv', jsonb_build_array(p.iv_hp, p.iv_atk_fis, p.iv_atk_esp, p.iv_def, p.iv_def_esp, p.iv_speed),
    'rarity', p.rarity::text,
    'is_shiny', p.is_shiny,
    'nature', p.nature,
    'active_abilities', case when jsonb_array_length(coalesce(s.slot->'golpes', '[]'::jsonb)) > 0
      then s.slot->'golpes' else to_jsonb(p.active_abilities) end,
    'golpes_de_maquina', to_jsonb(p.golpes_de_maquina),
    'rotacao', coalesce((s.slot->>'rotacao')::boolean, false)
  ) order by s.ord), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_defesa, '[]'::jsonb)) with ordinality as s(slot, ord)
  join public.pokemon_instances p on p.id = (s.slot->>'pokemon_id')::uuid and p.user_id = p_user
$$;
revoke all on function public._defesa_viva(uuid, jsonb) from public, anon, authenticated;

-- Quem assume o mandato defende com a equipe com que venceu (por referencia);
-- depois edita no montador.
create or replace function public._rotacionar_mandatos()
returns void
language sql
security definer
set search_path = public
as $$
  -- Quem assume: POKEs da defesa nova ficam trancados (cadeado da mochila).
  update public.pokemon_instances pi set locked = true
  from public.ginasio_lider l, jsonb_array_elements(l.candidato_equipe) e
  where l.mandato_ate < now() and l.candidato_id is not null
    and pi.user_id = l.candidato_id and pi.id = (e->>'pokemon_id')::uuid;
  update public.ginasio_lider set
    lider_id = coalesce(candidato_id, lider_id),
    lider_nome = coalesce(candidato_nome, lider_nome),
    equipe = coalesce(candidato_equipe, equipe),
    defesa = case when candidato_id is null then defesa else (
      select jsonb_agg(jsonb_build_object('pokemon_id', e->>'pokemon_id', 'golpes', '[]'::jsonb, 'rotacao', false) order by o)
      from jsonb_array_elements(candidato_equipe) with ordinality as x(e, o)
      where e ? 'pokemon_id'
    ) end,
    ganhos_mandato = 0,
    candidato_id = null, candidato_nome = null, candidato_ticks = null, candidato_equipe = null, candidato_em = null,
    mandato_ate = now() + interval '7 days'
  where mandato_ate < now()
$$;
revoke all on function public._rotacionar_mandatos() from public, anon, authenticated;

create or replace function public.ginasios_estado()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_dia date := public._dia_do_diario();
begin
  if v_user is null then raise exception 'nao autenticado' using errcode = '28000'; end if;
  perform public._rotacionar_mandatos();
  return jsonb_build_object(
    'ginasios', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id, 'tipo', g.tipo, 'faixa', g.faixa, 'taxa', g.taxa,
        'liderId', l.lider_id, 'liderNome', l.lider_nome, 'equipe', l.equipe,
        'mandatoAte', l.mandato_ate,
        'ganhos', case when l.lider_id = v_user then l.ganhos_mandato else null end,
        'defesa', case when l.lider_id = v_user then coalesce(l.defesa, '[]'::jsonb) else null end,
        'candidatoNome', l.candidato_nome, 'candidatoTicks', l.candidato_ticks
      ) order by g.faixa, g.tipo)
      from public.ginasio g join public.ginasio_lider l on l.ginasio_id = g.id
    ), '[]'::jsonb),
    'insignias', coalesce((select jsonb_agg(ginasio_id) from public.player_insignias where user_id = v_user), '[]'::jsonb),
    'desafiosHoje', (select count(*) from public.ginasio_desafio where user_id = v_user and dia = v_dia),
    'pendentes', coalesce((
      select jsonb_agg(id) from public.ginasio_desafio where user_id = v_user and estado = 'aberto'
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.desafiar_ginasio(p_ginasio text, p_tipo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_dia date := public._dia_do_diario();
  v_g public.ginasio;
  v_l public.ginasio_lider;
  v_equipe jsonb;
  v_equipe_lider jsonb;
  v_motivo text;
  v_nome text;
  v_id uuid;
  v_ouro bigint;
begin
  if v_user is null then raise exception 'nao autenticado' using errcode = '28000'; end if;
  if p_tipo not in ('insignia', 'destronar') then raise exception 'Duelo desconhecido.' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext(v_user::text));
  perform public._rotacionar_mandatos();

  select * into v_g from public.ginasio where id = p_ginasio;
  if v_g.id is null then raise exception 'Ginásio não encontrado.' using errcode = 'P0001'; end if;
  select * into v_l from public.ginasio_lider where ginasio_id = p_ginasio;
  if v_l.lider_id = v_user then raise exception 'Você não pode desafiar o próprio ginásio.' using errcode = 'P0001'; end if;

  if (select count(*) from public.ginasio_desafio where user_id = v_user and dia = v_dia) >= 2 then
    raise exception 'Você já fez os 2 desafios de hoje.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.ginasio_desafio where user_id = v_user and estado = 'aberto') then
    raise exception 'Termine o desafio em andamento primeiro.' using errcode = 'P0001';
  end if;

  v_equipe := public._equipe_de_ginasio(v_user);
  v_motivo := public._motivo_de_equipe_invalida(v_equipe, case when p_tipo = 'destronar' then v_g.tipo end);
  if v_motivo is not null then raise exception '%', v_motivo using errcode = 'P0001'; end if;

  -- Lider humano defende com a defesa VIVA; incompleta (POKE sumiu num reset)
  -- cai na foto `equipe`. NPC usa a foto.
  v_equipe_lider := v_l.equipe;
  if v_l.lider_id is not null and v_l.defesa is not null then
    v_equipe_lider := public._defesa_viva(v_l.lider_id, v_l.defesa);
    if jsonb_array_length(v_equipe_lider) <> 6 then v_equipe_lider := v_l.equipe; end if;
  end if;

  update public.players set gold = gold - v_g.taxa where user_id = v_user and gold >= v_g.taxa
    returning gold into v_ouro;
  if not found then raise exception 'Ouro insuficiente para a taxa.' using errcode = 'P0001'; end if;

  select trainer_name into v_nome from public.players where user_id = v_user;
  insert into public.ginasio_desafio (user_id, ginasio_id, tipo, taxa, dia, desafiante_nome, equipe_desafiante, lider_id, lider_nome, equipe_lider)
  values (v_user, p_ginasio, p_tipo, v_g.taxa, v_dia, v_nome, v_equipe, v_l.lider_id, v_l.lider_nome, v_equipe_lider)
  returning id into v_id;

  return jsonb_build_object('desafioId', v_id, 'teto', v_g.faixa, 'liderNome', v_l.lider_nome, 'liderId', v_l.lider_id,
    'equipeDesafiante', v_equipe, 'equipeLider', v_equipe_lider, 'gold', v_ouro);
end;
$$;

-- O lider monta a defesa: 6 vagas {pokemon_id, golpes[], rotacao}. Mesmas
-- regras da equipe (6, max 2 da mesma especie, todos do tipo) + dono, sem
-- repeticao e golpes conhecidos (igual `salvar_preset_pvp`).
drop function if exists public.definir_equipe_do_ginasio(text);
create or replace function public.definir_defesa_do_ginasio(p_ginasio text, p_slots jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_g public.ginasio;
  v_slot record;
  v_pid uuid;
  v_conhecidos text[];
  v_golpes text[];
  v_vistos uuid[] := '{}';
  v_limpos jsonb := '[]'::jsonb;
  v_equipe jsonb;
  v_motivo text;
begin
  if v_user is null then raise exception 'nao autenticado' using errcode = '28000'; end if;
  select * into v_g from public.ginasio where id = p_ginasio;
  if v_g.id is null then raise exception 'Ginásio não encontrado.' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.ginasio_lider where ginasio_id = p_ginasio and lider_id = v_user) then
    raise exception 'Você não é o líder deste ginásio.' using errcode = 'P0001';
  end if;
  if p_slots is null or jsonb_typeof(p_slots) <> 'array' then raise exception 'Defesa inválida.' using errcode = 'P0001'; end if;

  for v_slot in select value as slot, ordinality as ord from jsonb_array_elements(p_slots) with ordinality loop
    begin
      v_pid := (v_slot.slot->>'pokemon_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'Vaga % inválida.', v_slot.ord using errcode = 'P0001';
    end;
    if v_pid is null then raise exception 'Vaga % inválida.', v_slot.ord using errcode = 'P0001'; end if;
    if v_pid = any (v_vistos) then raise exception 'Um POKE está repetido na defesa.' using errcode = 'P0001'; end if;
    select unlocked_abilities into v_conhecidos from public.pokemon_instances where id = v_pid and user_id = v_user;
    if not found then raise exception 'Um dos POKEs não pertence a você.' using errcode = 'P0001'; end if;
    if v_slot.slot ? 'golpes' and jsonb_typeof(v_slot.slot->'golpes') <> 'array' then
      raise exception 'Golpes da vaga % inválidos.', v_slot.ord using errcode = 'P0001';
    end if;
    v_golpes := array(select jsonb_array_elements_text(coalesce(v_slot.slot->'golpes', '[]'::jsonb)));
    if coalesce(array_length(v_golpes, 1), 0) > 4 then raise exception 'No máximo 4 golpes por POKE.' using errcode = 'P0001'; end if;
    if coalesce(array_length(v_golpes, 1), 0) <> (select count(distinct g) from unnest(v_golpes) g) then
      raise exception 'Golpe repetido na vaga %.', v_slot.ord using errcode = 'P0001';
    end if;
    if exists (select 1 from unnest(v_golpes) g where g <> 'basic_attack' and not (g = any (coalesce(v_conhecidos, '{}')))) then
      raise exception 'O POKE da vaga % não conhece um dos golpes.', v_slot.ord using errcode = 'P0001';
    end if;
    v_vistos := array_append(v_vistos, v_pid);
    v_limpos := v_limpos || jsonb_build_array(jsonb_build_object(
      'pokemon_id', v_pid::text, 'golpes', to_jsonb(v_golpes),
      'rotacao', coalesce((v_slot.slot->>'rotacao')::boolean, false)));
  end loop;

  v_equipe := public._defesa_viva(v_user, v_limpos);
  v_motivo := public._motivo_de_equipe_invalida(v_equipe, v_g.tipo);
  if v_motivo is not null then raise exception '%', v_motivo using errcode = 'P0001'; end if;

  -- Tranca (cadeado da mochila): venda em lote e telas de venda ja pulam POKE
  -- trancado; a trigger abaixo e a garantia se o dono destrancar.
  update public.pokemon_instances set locked = true where user_id = v_user and id = any (v_vistos) and not coalesce(locked, false);
  update public.ginasio_lider set defesa = v_limpos, equipe = v_equipe where ginasio_id = p_ginasio;
  return jsonb_build_object('ok', true, 'mensagem', 'Defesa do ginásio salva.');
end;
$$;
grant execute on function public.definir_defesa_do_ginasio(text, jsonb) to authenticated;

-- Trava: o DONO nao tira da caixa um POKE que defende ginasio. Vender/soltar
-- (delete), anunciar/leiloar/trocar (location sai de team/bag) e transferir
-- (user_id) passam por aqui; mudar entre equipe e mochila nao. Acao de outra
-- pessoa (comprador, cron, admin) ja nao alcanca o POKE travado, porque ele
-- nunca chega ao mercado/troca. Reset de conta libera via `pokehunt.liberar_defesa`.
create or replace function public._trava_poke_defensor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_g public.ginasio;
begin
  if coalesce(current_setting('pokehunt.liberar_defesa', true), '') = 'on' then return coalesce(new, old); end if;
  if auth.uid() is distinct from old.user_id then return coalesce(new, old); end if;
  if tg_op = 'UPDATE' and new.user_id = old.user_id and new.location in ('team', 'bag') then return new; end if;
  select g.* into v_g from public.ginasio_lider l join public.ginasio g on g.id = l.ginasio_id
   where l.lider_id = old.user_id and l.defesa @> jsonb_build_array(jsonb_build_object('pokemon_id', old.id::text))
   limit 1;
  if v_g.id is null then return coalesce(new, old); end if;
  raise exception 'Este POKE defende o ginásio % (%). Tire-o da defesa antes.', v_g.tipo, v_g.faixa using errcode = 'P0001';
end;
$$;
revoke all on function public._trava_poke_defensor() from public, anon, authenticated;
drop trigger if exists trava_poke_defensor on public.pokemon_instances;
create trigger trava_poke_defensor
  before update of user_id, location or delete on public.pokemon_instances
  for each row execute function public._trava_poke_defensor();

-- Reset de conta (copia da versao de 20260824050000 + defesa): os POKEs somem, entao a defesa vira foto (`equipe`) e a
-- trava libera so nesta transacao.
create or replace function public.reiniciar_jogo()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_anuncio record;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));
  perform set_config('pokehunt.liberar_defesa', 'on', true);
  update public.ginasio_lider set defesa = null where lider_id = v_user_id;

  for v_anuncio in select id from public.market_listings where seller_id = v_user_id and status = 'ativo' loop
    perform public.recusar_ofertas_pendentes(v_anuncio.id, 'Conta resetada pelo vendedor — oferta devolvida');
  end loop;

  update public.market_offers set status = 'cancelada', resolved_at = now()
  where buyer_id = v_user_id and status = 'pendente';

  delete from public.market_listings where seller_id = v_user_id;
  delete from public.pokemon_instances where user_id = v_user_id and location = 'market';
  delete from public.market_orders where user_id = v_user_id;
  delete from public.market_deliveries where user_id = v_user_id;
  delete from public.game_sessions where user_id = v_user_id;
  -- PH-126: as sessoes acabaram de ser apagadas, entao o tempo jogado volta a
  -- zero. O que o purge de retencao ja tinha arquivado tem que ir junto, senao
  -- a conta resetada aparece com horas que nao existem mais.
  delete from public.tempo_jogado_arquivado where user_id = v_user_id;

  update public.players set
    trainer_level = 1, trainer_exp = 0, gold = 1000, diamonds = 0,
    active_team_index = 0, current_map_id = null,
    unlocked_maps = '{}', unlocked_continents = array['faixa1','faixa2'],
    perf_stats = '{"gold":0,"xp":0,"mobs":0,"shinys":0,"captures":0,"items":0,"since":0}'::jsonb
  where user_id = v_user_id;
  delete from public.pokemon_instances where user_id = v_user_id;
  delete from public.player_items where user_id = v_user_id;
  delete from public.player_pokedex where user_id = v_user_id;
  delete from public.player_auto_catch_rules where user_id = v_user_id;

  insert into public.player_items (user_id, item_id, quantity)
  select v_user_id, c.item_id, c.quantity
  from public.concessao_inicial_de_itens() c;
end;
$$;

-- PvP: rotacao por slot.
create or replace function public.pvp_snapshot_preset(p_user uuid, p_tipo text)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(
           (to_jsonb(pi) - 'user_id')
             || jsonb_build_object(
               'golpes_escolhidos', coalesce(s.slot->'golpes', '[]'::jsonb),
               'rotacao', coalesce((s.slot->>'rotacao')::boolean, false))
           order by s.ord), '[]'::jsonb)
    from public.pvp_preset pr
   cross join lateral jsonb_array_elements(pr.slots) with ordinality as s(slot, ord)
    join public.pokemon_instances pi
      on pi.id = (s.slot->>'pokemon_id')::uuid and pi.user_id = p_user
   where pr.user_id = p_user and pr.tipo = p_tipo and pr.ativo;
$$;
revoke execute on function public.pvp_snapshot_preset(uuid, text) from public;

create or replace function public.salvar_preset_pvp(
  p_tipo text,
  p_posicao integer,
  p_nome text,
  p_slots jsonb
)
returns public.pvp_preset
language plpgsql
security definer
set search_path = public
as $$
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
      'golpes', to_jsonb(v_golpes),
      'rotacao', coalesce((v_slot.slot->>'rotacao')::boolean, false)
    ));
  end loop;

  perform public.pvp_garantir_presets(v_eu);

  update public.pvp_preset
     set nome = v_nome, slots = v_limpos, atualizado_em = now()
   where user_id = v_eu and tipo = p_tipo and posicao = p_posicao
  returning * into v_pr;

  return v_pr;
end
$$;
grant execute on function public.salvar_preset_pvp(text, integer, text, jsonb) to authenticated;

commit;
