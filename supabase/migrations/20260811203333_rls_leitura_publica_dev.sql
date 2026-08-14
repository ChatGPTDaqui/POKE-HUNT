-- Projecao segura de players pra ranking/nomes de treinador — nunca gold/diamonds.
create view dev.treinadores_publico as
  select user_id, trainer_name, trainer_level, trainer_exp from dev.players;
grant select on dev.treinadores_publico to authenticated;

-- pokemon_instances: linha inteira publica, mesmo raciocinio do ranking.ts original
-- ("nao guarda nada privado alem do user_id, que ja e devolvido").
create policy "pokemon leitura publica" on dev.pokemon_instances
  for select to authenticated using (true);

-- hall_da_fama: sem dado sensivel.
create policy "hall leitura publica" on dev.hall_da_fama
  for select to authenticated using (true);
grant select on dev.hall_da_fama to authenticated;

-- game_sessions: so a propria (perfil precisa somar simulated_seconds).
create policy "sessao leitura propria" on dev.game_sessions
  for select to authenticated using (auth.uid() = user_id);
grant select on dev.game_sessions to authenticated;

-- market_listings: navegacao publica de ativos + historico proprio de qualquer status.
create policy "anuncio leitura publica ativos" on dev.market_listings
  for select to authenticated using (status = 'ativo');
create policy "anuncio leitura propria" on dev.market_listings
  for select to authenticated using (seller_id = auth.uid());
grant select on dev.market_listings to authenticated;

-- market_orders: livro de ofertas publico (so ativas) + historico proprio de qualquer status.
create policy "ordem leitura publica ativas" on dev.market_orders
  for select to authenticated using (status = 'ativa');
create policy "ordem leitura propria" on dev.market_orders
  for select to authenticated using (user_id = auth.uid());
grant select on dev.market_orders to authenticated;

-- market_trades: so participante, nao e navegavel publicamente.
create policy "trade leitura propria" on dev.market_trades
  for select to authenticated using (buyer_id = auth.uid() or seller_id = auth.uid());
grant select on dev.market_trades to authenticated;
