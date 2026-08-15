-- Bug real achado em QA manual: "Iniciar novo jogo" (reiniciar_jogo) apaga
-- player_items mas nunca re-concede o kit inicial (Poke Ball/Potion/Revive) —
-- diferente de handle_new_user e wipe_inventario_e_economia, que ja chamam
-- concessao_inicial_de_itens() corretamente. Conta resetada fica com ZERO
-- itens: auto-pot (ligado por padrao) e auto-catch nunca tem o que usar.
-- Reproduzido ao vivo: reset -> player_items vazio -> alerta "consumivel
-- abaixo de 10" na primeira tela do jogo, pra conta que acabou de nascer.
create or replace function public.reiniciar_jogo()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_anuncio record;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;

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
$function$;
