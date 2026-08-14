-- Helper interno: NAO exposto ao client (sem grant execute pra authenticated).
-- So chamavel de dentro de outra funcao SECURITY DEFINER (reiniciar_jogo aqui;
-- as RPCs de mercado do passo #15 tambem vao chamar). Opera sobre anuncio_id
-- ja validado pelo chamador -- nao recebe user_id, nao tem como ser usado
-- pra mexer em anuncio de outro sem passar por quem valida a posse antes.
create function dev.recusar_ofertas_pendentes(p_anuncio_id uuid, p_motivo text, p_exceto uuid default null)
returns int
language plpgsql
security definer
set search_path = dev, public
as $$
declare
  v_oferta record;
  v_count int := 0;
begin
  for v_oferta in
    update dev.market_offers
    set status = 'recusada', resolved_at = now()
    where listing_id = p_anuncio_id and status = 'pendente'
      and (p_exceto is null or id != p_exceto)
    returning buyer_id, valor, currency
  loop
    if v_oferta.currency = 'gold' then
      update dev.players set gold = gold + v_oferta.valor where user_id = v_oferta.buyer_id;
    else
      update dev.players set diamonds = diamonds + v_oferta.valor where user_id = v_oferta.buyer_id;
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Porta reiniciar.ts#limparMundoDoJogador + aplicarAcao('reiniciarJogo').
-- Ordem de delete preservada por causa das FKs (listings antes de pokemon,
-- restrict; ver comentario original).
create function dev.reiniciar_jogo()
returns void
language plpgsql
security definer
set search_path = dev, public
as $$
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
    unlocked_maps = '{}', unlocked_continents = array['johto','nightmare'],
    perf_stats = '{"gold":0,"xp":0,"mobs":0,"shinys":0,"captures":0,"items":0,"since":0}'::jsonb
  where user_id = v_user_id;
  delete from dev.pokemon_instances where user_id = v_user_id;
  delete from dev.player_items where user_id = v_user_id;
  delete from dev.player_pokedex where user_id = v_user_id;
  delete from dev.player_auto_catch_rules where user_id = v_user_id;
end;
$$;
revoke all on function dev.reiniciar_jogo() from public;
grant execute on function dev.reiniciar_jogo() to authenticated;

-- Porta social.ts#coletarAnexo (versao PH-21, com comClaimAtomico). Numa
-- transacao real o claim+undo desaparece: se o credito falhar, a transacao
-- inteira desfaz sozinha, sem precisar de PATCH de desfazer explicito.
-- Credito vai direto em player_items (upsert), NAO por fila de entrega --
-- so e seguro por gravar_estado_jogador (#13) ter que ser incremental/diff,
-- nunca overwrite total, daqui pra frente.
create function dev.coletar_anexo_correio(p_mensagem_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_msg dev.mail_messages;
  v_item jsonb;
  v_item_id text;
  v_quantity int;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;

  update dev.mail_messages
    set anexo_coletado_em = now(), estado = 'lido', read_at = now()
    where id = p_mensagem_id and para_id = v_user_id
      and anexo_coletado_em is null and anexo_itens != '[]'::jsonb
    returning * into v_msg;

  if v_msg is null then
    raise exception 'Nada para coletar nesta mensagem.' using errcode = 'P0001';
  end if;

  for v_item in select * from jsonb_array_elements(v_msg.anexo_itens) loop
    v_item_id := v_item->>'itemId';
    v_quantity := floor(coalesce((v_item->>'quantity')::numeric, 0));
    if v_item_id is not null and v_quantity > 0 then
      insert into dev.player_items (user_id, item_id, quantity)
      values (v_user_id, v_item_id, v_quantity)
      on conflict (user_id, item_id) do update
        set quantity = dev.player_items.quantity + excluded.quantity, updated_at = now();
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'itens', v_msg.anexo_itens);
end;
$$;
revoke all on function dev.coletar_anexo_correio(uuid) from public;
grant execute on function dev.coletar_anexo_correio(uuid) to authenticated;

-- Porta social.ts#pedirAmizade.
create function dev.pedir_amizade(p_nick text)
returns jsonb
language plpgsql
security definer
set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_eu record;
  v_destino_id uuid;
  v_destino record;
  v_ja_amigos boolean;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;
  if p_nick is null or length(trim(p_nick)) = 0 or length(p_nick) > 40 then
    raise exception 'nick invalido' using errcode = 'P0001';
  end if;

  select trainer_name into v_eu from dev.players where user_id = v_user_id;
  if v_eu is null then
    raise exception 'jogador sem linha em players' using errcode = 'P0001';
  end if;
  if lower(v_eu.trainer_name) = lower(p_nick) then
    raise exception 'Voce nao pode adicionar a si mesmo.' using errcode = 'P0001';
  end if;

  v_destino_id := dev.id_por_nome_de_treinador(p_nick);
  if v_destino_id is null then
    raise exception 'Nao existe treinador chamado "%".', p_nick using errcode = 'P0001';
  end if;
  select user_id, trainer_name into v_destino from dev.players where user_id = v_destino_id;

  select exists(
    select 1 from dev.friendships where user_id = v_user_id and amigo_id = v_destino.user_id
  ) into v_ja_amigos;
  if v_ja_amigos then
    raise exception '% ja e seu amigo.', v_destino.trainer_name using errcode = 'P0001';
  end if;

  begin
    insert into dev.mail_messages (para_id, de_id, de_nome, tipo, assunto, corpo)
    values (v_destino.user_id, v_user_id, v_eu.trainer_name, 'pedido_amizade', 'Pedido de amizade',
            v_eu.trainer_name || ' quer ser seu amigo.');
  exception when unique_violation then
    raise exception 'Voce ja tem um pedido pendente com %.', v_destino.trainer_name using errcode = 'P0001';
  end;

  return jsonb_build_object('mensagem', 'Pedido enviado para ' || v_destino.trainer_name || '.');
end;
$$;
revoke all on function dev.pedir_amizade(text) from public;
grant execute on function dev.pedir_amizade(text) to authenticated;

-- Porta social.ts#responderPedido.
create function dev.responder_pedido_amizade(p_mensagem_id uuid, p_aceitar boolean)
returns jsonb
language plpgsql
security definer
set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_pedido dev.mail_messages;
  v_eu_nome text;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;

  update dev.mail_messages
    set estado = case when p_aceitar then 'aceito' else 'recusado' end, read_at = now()
    where id = p_mensagem_id and para_id = v_user_id and tipo = 'pedido_amizade' and estado = 'pendente'
    returning * into v_pedido;

  if v_pedido is null then
    raise exception 'pedido nao encontrado ou ja respondido' using errcode = 'P0001';
  end if;
  if not p_aceitar then
    return jsonb_build_object('mensagem', 'Pedido recusado.');
  end if;
  if v_pedido.de_id is null then
    raise exception 'Quem enviou o pedido nao existe mais.' using errcode = 'P0001';
  end if;

  insert into dev.friendships (user_id, amigo_id) values
    (v_user_id, v_pedido.de_id), (v_pedido.de_id, v_user_id)
  on conflict (user_id, amigo_id) do nothing;

  select trainer_name into v_eu_nome from dev.players where user_id = v_user_id;
  insert into dev.mail_messages (para_id, de_id, de_nome, tipo, assunto, corpo)
  values (v_pedido.de_id, v_user_id, coalesce(v_eu_nome, 'Treinador'), 'sistema', 'Pedido aceito',
          coalesce(v_eu_nome, 'Um treinador') || ' aceitou seu pedido de amizade.');

  return jsonb_build_object('mensagem', 'Agora voce e amigo de ' || v_pedido.de_nome || '.');
end;
$$;
revoke all on function dev.responder_pedido_amizade(uuid, boolean) from public;
grant execute on function dev.responder_pedido_amizade(uuid, boolean) to authenticated;
