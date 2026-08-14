
create or replace function dev.responder_pedido_amizade(p_mensagem_id uuid, p_aceitar boolean)
returns jsonb
language plpgsql security definer set search_path = dev, public
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

  -- PH-20: se o outro lado tambem tinha um pedido pendente pra mim (direcao
  -- inversa, mandado antes de eu responder o dele), resolve junto -- sem
  -- isso ele ficava com "Aceitar/Recusar" pra alguem que ja virou amigo.
  update dev.mail_messages
    set estado = 'aceito', read_at = now()
    where para_id = v_pedido.de_id and de_id = v_user_id and tipo = 'pedido_amizade' and estado = 'pendente';

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
