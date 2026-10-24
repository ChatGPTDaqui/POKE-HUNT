-- Espelho de 20261024140000_equipe_do_desafiante_public.sql no schema `dev`. GERADO por src/data/ginasios.test.ts.
-- Equipe do desafiante (24/10/2026, pedido do dono): quem desafia escolhe no
-- montador os 6 POKEs, os golpes e Rotacao/Inteligente — sem mexer na equipe
-- de caca. `desafiar_ginasio` ganha `p_slots` (sem ele, segue a equipe atual).
-- Quem vence o destronar assume defendendo com a MESMA escolha (golpes e
-- rotacao da vaga), nao so com os POKEs.

begin;

-- Valida vagas {pokemon_id, golpes[], rotacao}: dono, sem repeticao, ate 4
-- golpes conhecidos sem repetir. Devolve as vagas limpas. Mesmas regras de
-- `salvar_preset_pvp`.
create or replace function dev._vagas_validas(p_user uuid, p_slots jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = dev, public
as $$
declare
  v_slot record;
  v_pid uuid;
  v_conhecidos text[];
  v_golpes text[];
  v_vistos uuid[] := '{}';
  v_limpos jsonb := '[]'::jsonb;
begin
  if p_slots is null or jsonb_typeof(p_slots) <> 'array' then raise exception 'Equipe inválida.' using errcode = 'P0001'; end if;
  for v_slot in select value as slot, ordinality as ord from jsonb_array_elements(p_slots) with ordinality loop
    begin
      v_pid := (v_slot.slot->>'pokemon_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'Vaga % inválida.', v_slot.ord using errcode = 'P0001';
    end;
    if v_pid is null then raise exception 'Vaga % inválida.', v_slot.ord using errcode = 'P0001'; end if;
    if v_pid = any (v_vistos) then raise exception 'Um POKE está repetido na equipe.' using errcode = 'P0001'; end if;
    select unlocked_abilities into v_conhecidos from dev.pokemon_instances where id = v_pid and user_id = p_user;
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
  return v_limpos;
end;
$$;
revoke all on function dev._vagas_validas(uuid, jsonb) from public, anon, authenticated;

drop function if exists dev.desafiar_ginasio(text, text);
create or replace function dev.desafiar_ginasio(p_ginasio text, p_tipo text, p_slots jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = dev, public
as $$
declare
  v_user uuid := auth.uid();
  v_dia date := dev._dia_do_diario();
  v_g dev.ginasio;
  v_l dev.ginasio_lider;
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
  perform dev._rotacionar_mandatos();

  select * into v_g from dev.ginasio where id = p_ginasio;
  if v_g.id is null then raise exception 'Ginásio não encontrado.' using errcode = 'P0001'; end if;
  select * into v_l from dev.ginasio_lider where ginasio_id = p_ginasio;
  if v_l.lider_id = v_user then raise exception 'Você não pode desafiar o próprio ginásio.' using errcode = 'P0001'; end if;

  if (select count(*) from dev.ginasio_desafio where user_id = v_user and dia = v_dia) >= 2 then
    raise exception 'Você já fez os 2 desafios de hoje.' using errcode = 'P0001';
  end if;
  if exists (select 1 from dev.ginasio_desafio where user_id = v_user and estado = 'aberto') then
    raise exception 'Termine o desafio em andamento primeiro.' using errcode = 'P0001';
  end if;

  -- Equipe escolhida no montador (lida viva, com golpes e rotacao da vaga);
  -- sem escolha, a equipe de caca atual.
  if p_slots is null then
    v_equipe := dev._equipe_de_ginasio(v_user);
  else
    v_equipe := dev._defesa_viva(v_user, dev._vagas_validas(v_user, p_slots));
  end if;
  v_motivo := dev._motivo_de_equipe_invalida(v_equipe, case when p_tipo = 'destronar' then v_g.tipo end);
  if v_motivo is not null then raise exception '%', v_motivo using errcode = 'P0001'; end if;

  -- Lider humano defende com a defesa VIVA; incompleta (POKE sumiu num reset)
  -- cai na foto `equipe`. NPC usa a foto.
  v_equipe_lider := v_l.equipe;
  if v_l.lider_id is not null and v_l.defesa is not null then
    v_equipe_lider := dev._defesa_viva(v_l.lider_id, v_l.defesa);
    if jsonb_array_length(v_equipe_lider) <> 6 then v_equipe_lider := v_l.equipe; end if;
  end if;

  update dev.players set gold = gold - v_g.taxa where user_id = v_user and gold >= v_g.taxa
    returning gold into v_ouro;
  if not found then raise exception 'Ouro insuficiente para a taxa.' using errcode = 'P0001'; end if;

  select trainer_name into v_nome from dev.players where user_id = v_user;
  insert into dev.ginasio_desafio (user_id, ginasio_id, tipo, taxa, dia, desafiante_nome, equipe_desafiante, lider_id, lider_nome, equipe_lider)
  values (v_user, p_ginasio, p_tipo, v_g.taxa, v_dia, v_nome, v_equipe, v_l.lider_id, v_l.lider_nome, v_equipe_lider)
  returning id into v_id;

  return jsonb_build_object('desafioId', v_id, 'teto', v_g.faixa, 'liderNome', v_l.lider_nome, 'liderId', v_l.lider_id,
    'equipeDesafiante', v_equipe, 'equipeLider', v_equipe_lider, 'gold', v_ouro);
end;
$$;
grant execute on function dev.desafiar_ginasio(text, text, jsonb) to authenticated;

-- Defesa do lider passa a usar o mesmo validador.
create or replace function dev.definir_defesa_do_ginasio(p_ginasio text, p_slots jsonb)
returns jsonb
language plpgsql
security definer
set search_path = dev, public
as $$
declare
  v_user uuid := auth.uid();
  v_g dev.ginasio;
  v_limpos jsonb;
  v_equipe jsonb;
  v_motivo text;
begin
  if v_user is null then raise exception 'nao autenticado' using errcode = '28000'; end if;
  select * into v_g from dev.ginasio where id = p_ginasio;
  if v_g.id is null then raise exception 'Ginásio não encontrado.' using errcode = 'P0001'; end if;
  if not exists (select 1 from dev.ginasio_lider where ginasio_id = p_ginasio and lider_id = v_user) then
    raise exception 'Você não é o líder deste ginásio.' using errcode = 'P0001';
  end if;
  v_limpos := dev._vagas_validas(v_user, p_slots);
  v_equipe := dev._defesa_viva(v_user, v_limpos);
  v_motivo := dev._motivo_de_equipe_invalida(v_equipe, v_g.tipo);
  if v_motivo is not null then raise exception '%', v_motivo using errcode = 'P0001'; end if;

  -- Tranca (cadeado da mochila): venda em lote e telas de venda ja pulam POKE
  -- trancado; a trigger `trava_poke_defensor` e a garantia se o dono destrancar.
  update dev.pokemon_instances set locked = true
   where user_id = v_user and not coalesce(locked, false)
     and id in (select (e->>'pokemon_id')::uuid from jsonb_array_elements(v_limpos) e);
  update dev.ginasio_lider set defesa = v_limpos, equipe = v_equipe where ginasio_id = p_ginasio;
  return jsonb_build_object('ok', true, 'mensagem', 'Defesa do ginásio salva.');
end;
$$;
grant execute on function dev.definir_defesa_do_ginasio(text, jsonb) to authenticated;

-- Quem assume defende com a escolha da vitoria: golpes da vaga (o kit que
-- lutou) e a rotacao. Resto igual a 20261024120000.
create or replace function dev._rotacionar_mandatos()
returns void
language plpgsql
security definer
set search_path = dev, public
as $$
declare
  v_l record;
  v_nome text;
begin
  for v_l in select * from dev.ginasio_lider where mandato_ate < now() for update loop
    v_nome := dev._nome_do_ginasio(v_l.ginasio_id);
    if v_l.candidato_id is not null then
      perform dev._aviso_de_ginasio(v_l.candidato_id, 'Você é o novo líder!',
        format('Você assumiu o %s por 7 dias. A sua equipe da vitória já defende o ginásio; ajuste a defesa no painel.', v_nome));
      if v_l.candidato_id is distinct from v_l.lider_id then
        perform dev.somar_contadores(v_l.candidato_id, jsonb_build_object('ginasio_mandatos', 1));
        if v_l.lider_id is not null then
          perform dev._aviso_de_ginasio(v_l.lider_id, 'Você perdeu o ginásio',
            format('%s assumiu o %s. Os POKEs da sua defesa estão livres de novo.', v_l.candidato_nome, v_nome));
        end if;
      end if;
    elsif v_l.lider_id is not null then
      perform dev._aviso_de_ginasio(v_l.lider_id, 'Mandato renovado',
        format('Ninguém venceu o duelo para destronar no %s. Você continua líder por mais 7 dias.', v_nome));
    end if;
  end loop;

  -- Quem assume: POKEs da defesa nova ficam trancados (cadeado da mochila).
  update dev.pokemon_instances pi set locked = true
  from dev.ginasio_lider l, jsonb_array_elements(l.candidato_equipe) e
  where l.mandato_ate < now() and l.candidato_id is not null
    and pi.user_id = l.candidato_id and pi.id = (e->>'pokemon_id')::uuid;
  update dev.ginasio_lider set
    lider_id = coalesce(candidato_id, lider_id),
    lider_nome = coalesce(candidato_nome, lider_nome),
    equipe = coalesce(candidato_equipe, equipe),
    defesa = case when candidato_id is null then defesa else (
      select jsonb_agg(jsonb_build_object(
        'pokemon_id', e->>'pokemon_id',
        'golpes', case when jsonb_typeof(e->'active_abilities') = 'array' then e->'active_abilities' else '[]'::jsonb end,
        'rotacao', coalesce((e->>'rotacao')::boolean, false)) order by o)
      from jsonb_array_elements(candidato_equipe) with ordinality as x(e, o)
      where e ? 'pokemon_id'
    ) end,
    ganhos_mandato = 0,
    candidato_id = null, candidato_nome = null, candidato_ticks = null, candidato_equipe = null, candidato_em = null,
    mandato_ate = now() + interval '7 days'
  where mandato_ate < now();
end;
$$;
revoke all on function dev._rotacionar_mandatos() from public, anon, authenticated;

commit;
