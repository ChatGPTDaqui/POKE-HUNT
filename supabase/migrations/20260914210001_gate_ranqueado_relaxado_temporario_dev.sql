-- Gemeo dev de 20260914210000_gate_ranqueado_relaxado_temporario_public.sql (TEMPORARIO, PH-539).
create or replace function dev.pvp_time_pronto_ranqueado(p_user uuid)
returns boolean
language sql
stable
set search_path to 'dev'
as $function$
  select coalesce(array_length(t.pokemon_ids, 1), 0) >= 1
     and not exists (
       select 1 from unnest(t.pokemon_ids) as pid
       left join dev.pokemon_instances pi on pi.id = pid
       where pi.id is null or pi.user_id <> p_user
     )
  from dev.pvp_time t
  where t.user_id = p_user;
$function$;
