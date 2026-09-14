-- PH-539 — TEMPORARIO, pra testar o ranqueado contra os bots sem base de
-- jogadores no nivel 80. Relaxa `pvp_time_pronto_ranqueado`: basta ter ao
-- menos 1 POKE proprio no time. Sem exigencia de 6 slots, nivel ou 4 golpes.
--
-- REVERTER: recriar a funcao como em 20260913140000_pvp_ranqueado_public.sql
-- (6/6, level >= 80, 4 golpes ativos) e voltar `GATE_RANQUEADO_RELAXADO` pra
-- false em src/features/pvp/PvpBuildTab.tsx.
create or replace function public.pvp_time_pronto_ranqueado(p_user uuid)
returns boolean
language sql
stable
set search_path to 'public'
as $function$
  select coalesce(array_length(t.pokemon_ids, 1), 0) >= 1
     and not exists (
       select 1 from unnest(t.pokemon_ids) as pid
       left join public.pokemon_instances pi on pi.id = pid
       where pi.id is null or pi.user_id <> p_user
     )
  from public.pvp_time t
  where t.user_id = p_user;
$function$;
