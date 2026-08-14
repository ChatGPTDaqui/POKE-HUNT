
-- friendships: RLS ligada, zero policy e zero grant -- ninguem lia. Cada linha
-- ja vem em par (ver responder_pedido_amizade), entao "onde user_id=eu" basta.
grant select on dev.friendships to authenticated;
create policy "amizade leitura propria" on dev.friendships
  for select to authenticated using (user_id = auth.uid());

-- mail_messages tinha policy de UPDATE ("marca lida propria") mas faltava o
-- GRANT base -- mesma lacuna do market_offers, RLS sozinha nao bastava.
grant update on dev.mail_messages to authenticated;

-- Realtime: publication nao tinha NENHUMA tabela do schema dev ainda.
alter publication supabase_realtime add table dev.chat_messages;
alter publication supabase_realtime add table dev.mail_messages;
