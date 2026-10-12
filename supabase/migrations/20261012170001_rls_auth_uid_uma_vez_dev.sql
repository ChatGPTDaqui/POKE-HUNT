-- RLS: avaliar auth.uid() UMA vez por consulta, e nao uma vez por linha.
--
-- O advisor de performance do Supabase (auth_rls_initplan) apontava 26 policies
-- por schema chamando `auth.uid()` direto na expressao. Assim o Postgres
-- reavalia a funcao para cada linha examinada; com `(select auth.uid())` ela
-- vira um InitPlan, calculado uma vez e reaproveitado. O Realtime tambem roda
-- estas policies para cada assinante a cada mudanca publicada (chat, correio,
-- PvP, troca), entao o custo se multiplica pelo numero de jogadores online.
--
-- SEMANTICA IDENTICA: so a forma de chamar muda. As expressoes abaixo sao as
-- vigentes no banco em 12/10/2026 (pg_policies), com `auth.uid()` trocado por
-- `(select auth.uid())` e nomes de tabela qualificados com o schema. As
-- policies que ja usavam a forma com select (admins, players,
-- pokemon_instances, player_especialidades, player_missoes_reivindicadas)
-- ficam como estao. O par de `public` e 20261012170000.
begin;

alter policy "so admin le audit_logs" on dev.audit_logs
  using (exists (select 1 from dev.admins where admins.user_id = (select auth.uid())));

alter policy "bloqueio leitura propria" on dev.blocks
  using (user_id = (select auth.uid()));

alter policy "chat insere propria mensagem" on dev.chat_messages
  with check (
    (select auth.uid()) = user_id
    and not exists (
      select 1 from dev.chat_messages m2
      where m2.user_id = (select auth.uid())
        and m2.created_at > now() - '00:00:01.2'::interval
    )
  );

alter policy "amizade leitura propria" on dev.friendships
  using (user_id = (select auth.uid()));

alter policy "jogador le a propria sessao" on dev.game_sessions
  using ((select auth.uid()) = user_id);

alter policy "correio leitura de enviados" on dev.mail_messages
  using (de_id = (select auth.uid()));

alter policy "correio leitura propria" on dev.mail_messages
  using (para_id = (select auth.uid()));

alter policy "correio marca lida propria" on dev.mail_messages
  using (para_id = (select auth.uid()))
  with check (para_id = (select auth.uid()));

alter policy "anuncio leitura propria" on dev.market_listings
  using (seller_id = (select auth.uid()));

alter policy "oferta leitura propria (comprador)" on dev.market_offers
  using (buyer_id = (select auth.uid()));

alter policy "oferta leitura propria (vendedor)" on dev.market_offers
  using (exists (
    select 1 from dev.market_listings l
    where l.id = market_offers.listing_id and l.seller_id = (select auth.uid())
  ));

alter policy "ordem leitura propria" on dev.market_orders
  using (user_id = (select auth.uid()));

alter policy "trade leitura propria" on dev.market_trades
  using (buyer_id = (select auth.uid()) or seller_id = (select auth.uid()));

alter policy "jogador le as proprias regras" on dev.player_auto_catch_rules
  using ((select auth.uid()) = user_id);

alter policy "diario leitura propria" on dev.player_diario
  using (user_id = (select auth.uid()));

alter policy "jogador le os proprios itens" on dev.player_items
  using ((select auth.uid()) = user_id);

alter policy "jogador le a propria pokedex" on dev.player_pokedex
  using ((select auth.uid()) = user_id);

alter policy "pvp historico dos participantes" on dev.pvp_historico
  using (anfitriao_id = (select auth.uid()) or convidado_id = (select auth.uid()));

alter policy "pvp_preset leitura do dono" on dev.pvp_preset
  using (user_id = (select auth.uid()));

alter policy "pvp_rank leitura do dono" on dev.pvp_rank
  using (user_id = (select auth.uid()));

alter policy "pvp leitura dos participantes" on dev.pvp_sessao
  using (anfitriao_id = (select auth.uid()) or convidado_id = (select auth.uid()));

alter policy "recompensa leitura propria" on dev.recompensa_concedida
  using (user_id = (select auth.uid()));

alter policy "jogador le o protetor da propria sessao" on dev.sala_protetor
  using (exists (
    select 1 from dev.game_sessions gs
    where gs.id = sala_protetor.session_id and gs.user_id = (select auth.uid())
  ));

alter policy "log de troca dos participantes" on dev.troca_log
  using (anfitriao_id = (select auth.uid()) or convidado_id = (select auth.uid()));

alter policy "oferta leitura dos participantes" on dev.troca_oferta
  using (exists (
    select 1 from dev.troca_sessao s
    where s.id = troca_oferta.sessao_id
      and (s.anfitriao_id = (select auth.uid()) or s.convidado_id = (select auth.uid()))
  ));

alter policy "troca leitura dos participantes" on dev.troca_sessao
  using (anfitriao_id = (select auth.uid()) or convidado_id = (select auth.uid()));

commit;
