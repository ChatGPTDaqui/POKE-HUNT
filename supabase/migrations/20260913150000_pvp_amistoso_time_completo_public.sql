-- PH-531 (parte 2): amistoso com time completo. Convite guarda o time do
-- anfitriao (o dele ja e o time salvo de PvP, montado na aba Build); no
-- aceite o convidado escolhe entre o time atual (aventura) ou o salvo de PvP
-- — os dois casos chegam aqui como array explicito de ids, ja que o time
-- atual so existe no client (gameStateStore), nao em pvp_time.
--
-- Aditiva: abrir_pvp/aceitar_pvp/registrar_resultado_pvp (1 poke, duplo
-- report) continuam intactas, so deixam de ser chamadas pelo client novo.

-- Generaliza `pvp_snapshot_time`: agora aceita qualquer array de ids do
-- proprio jogador, nao so o que esta salvo em `pvp_time`. Validacao de dono
-- e feita aqui — chamador nao precisa reconferir.
create or replace function public.pvp_snapshot_pokemon(p_user uuid, p_pokemon_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_qtd_validos integer;
begin
  if coalesce(array_length(p_pokemon_ids, 1), 0) = 0 then
    raise exception 'Nenhum POKE informado para o duelo.';
  end if;

  select count(*) into v_qtd_validos
    from unnest(p_pokemon_ids) as pid
    join public.pokemon_instances pi on pi.id = pid and pi.user_id = p_user;

  if v_qtd_validos <> array_length(p_pokemon_ids, 1) then
    raise exception 'Um dos POKEs informados nao pertence a voce.';
  end if;

  return (
    select coalesce(jsonb_agg(to_jsonb(pi) - 'user_id' order by ord), '[]'::jsonb)
    from unnest(p_pokemon_ids) with ordinality as u(pokemon_id, ord)
    join public.pokemon_instances pi on pi.id = u.pokemon_id
  );
end
$function$;

create or replace function public.pvp_snapshot_time(p_user uuid)
returns jsonb
language sql
stable
set search_path to 'public'
as $function$
  select public.pvp_snapshot_pokemon(p_user, (select pokemon_ids from public.pvp_time where user_id = p_user));
$function$;

-- Anfitriao convida usando o proprio time de PvP salvo (aba Build) — sem
-- escolha de "atual x salvo" pra quem convida, so pra quem aceita.
create or replace function public.abrir_pvp_time(p_convidado_id uuid)
returns public.pvp_sessao
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_eu uuid := auth.uid();
  v_time jsonb;
  v_s public.pvp_sessao;
begin
  if v_eu is null then raise exception 'sem sessao autenticada'; end if;
  if p_convidado_id is null or p_convidado_id = v_eu then
    raise exception 'Voce nao pode convidar voce mesmo para PvP.';
  end if;

  v_time := public.pvp_snapshot_time(v_eu);
  if jsonb_array_length(v_time) = 0 then
    raise exception 'Monte seu time de PvP na aba Build antes de convidar.';
  end if;

  update public.pvp_sessao
     set estado = 'expirada', encerrada_em = now()
   where estado in ('convidada', 'aberta') and expira_em <= now();

  if exists (
    select 1 from public.pvp_sessao
     where estado in ('convidada', 'aberta')
       and (anfitriao_id in (v_eu, p_convidado_id) or convidado_id in (v_eu, p_convidado_id))
  ) then
    raise exception 'Um dos treinadores ja esta em outro PvP.';
  end if;

  insert into public.pvp_sessao (anfitriao_id, convidado_id, modo, anfitriao_time)
  values (v_eu, p_convidado_id, 'amistoso', v_time)
  returning * into v_s;
  return v_s;
end
$function$;

-- Convidado aceita com um array explicito de ids (time atual OU salvo — a
-- escolha e feita no client, que sabe qual e o time atual de aventura; aqui
-- so valida dono e nao-vazio, do mesmo jeito pro caso ranqueado).
create or replace function public.aceitar_pvp_time(p_sessao_id uuid, p_pokemon_ids uuid[])
returns public.pvp_sessao
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_eu uuid := auth.uid();
  v_s public.pvp_sessao;
begin
  select * into v_s from public.pvp_sessao where id = p_sessao_id for update;
  if not found then raise exception 'Convite PvP nao encontrado.'; end if;
  if v_s.convidado_id <> v_eu then raise exception 'So o convidado pode aceitar este PvP.'; end if;
  if v_s.estado <> 'convidada' or v_s.expira_em <= now() then raise exception 'Este convite PvP expirou.'; end if;

  update public.pvp_sessao
     set estado = 'aberta', convidado_time = public.pvp_snapshot_pokemon(v_eu, p_pokemon_ids)
   where id = p_sessao_id
   returning * into v_s;
  return v_s;
end
$function$;

grant execute on function public.abrir_pvp_time(uuid) to authenticated;
grant execute on function public.aceitar_pvp_time(uuid, uuid[]) to authenticated;
revoke execute on function public.pvp_snapshot_pokemon(uuid, uuid[]) from public;
