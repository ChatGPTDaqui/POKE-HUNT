-- Espelho dev de 20260815160000_reiniciar_jogo_concede_itens_iniciais_public.sql
-- (o par public/dev tem que ficar sincronizado, ver duas-sessoes-branches-paralelas).
create or replace function dev.reiniciar_jogo()
returns void
language plpgsql
security definer
set search_path to 'dev', 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_anuncio record;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;

  for v_anuncio in select id from dev.market_listings where seller_id = v_user_id and status = 'ativo' loop
    perform dev.recusar_ofertas_pendentes(v_anuncio.id, 'Conta resetada pelo vendedor — oferta devolvida');
  end loop;

  update dev.market_offers set status = 'cancelada', resolved_at = now()
  where buyer_id = v_user_id and status = 'pendente';

  delete from dev.market_listings where seller_id = v_user_id;
  delete from dev.pokemon_instances where user_id = v_user_id and location = 'market';
  delete from dev.market_orders where user_id = v_user_id;
  delete from dev.market_deliveries where user_id = v_user_id;
  delete from dev.game_sessions where user_id = v_user_id;

  update dev.players set
    trainer_level = 1, trainer_exp = 0, gold = 1000, diamonds = 0,
    active_team_index = 0, current_map_id = null,
    unlocked_maps = '{}', unlocked_continents = array['faixa1','faixa2'],
    perf_stats = '{"gold":0,"xp":0,"mobs":0,"shinys":0,"captures":0,"items":0,"since":0}'::jsonb
  where user_id = v_user_id;
  delete from dev.pokemon_instances where user_id = v_user_id;
  delete from dev.player_items where user_id = v_user_id;
  delete from dev.player_pokedex where user_id = v_user_id;
  delete from dev.player_auto_catch_rules where user_id = v_user_id;

  insert into dev.player_items (user_id, item_id, quantity)
  select v_user_id, c.item_id, c.quantity
  from dev.concessao_inicial_de_itens() c;
end;
$function$;
