-- Gemeo dev de 20260914200000_fila_ranqueada_expira_sessao_vencida_public.sql.
create or replace function dev.entrar_fila_ranqueada()
returns dev.pvp_rank
language plpgsql
security definer
set search_path to 'dev'
as $function$
declare
  v_eu uuid := auth.uid();
  v_rank dev.pvp_rank;
begin
  if v_eu is null then raise exception 'sem sessao autenticada'; end if;

  update dev.pvp_sessao
     set estado = 'expirada', encerrada_em = now()
   where estado in ('convidada', 'aberta') and expira_em <= now();

  if exists (
    select 1 from dev.pvp_sessao
     where estado in ('convidada', 'aberta')
       and (anfitriao_id = v_eu or convidado_id = v_eu)
  ) then
    raise exception 'Voce ja esta em um duelo PvP.';
  end if;

  if not coalesce(dev.pvp_time_pronto_ranqueado(v_eu), false) then
    raise exception 'Seu time de PvP precisa de 6 POKEs, todos nivel 80+ com os 4 golpes escolhidos.';
  end if;

  v_rank := dev.pvp_garantir_rank(v_eu);
  if v_rank.partidas_hoje >= 5 then
    raise exception 'Limite de 5 partidas ranqueadas hoje atingido. Volta amanha.';
  end if;

  insert into dev.pvp_fila (user_id, mmr, entrou_em)
  values (v_eu, v_rank.mmr, now())
  on conflict (user_id) do update set mmr = excluded.mmr;

  return v_rank;
end
$function$;

grant execute on function dev.entrar_fila_ranqueada() to authenticated;
