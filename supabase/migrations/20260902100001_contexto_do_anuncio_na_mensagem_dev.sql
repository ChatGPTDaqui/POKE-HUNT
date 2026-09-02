-- PAR DEV de 20260902100000_contexto_do_anuncio_na_mensagem_public.sql.
-- Gerado a partir dele trocando `public.` por `dev.`; `auth.` e compartilhado
-- e nao muda. Ver docs/11-operacao.md#fluxo-de-mudanca-de-schema.
--
-- O cabecalho com o porque de cada decisao esta no arquivo `_public`.

begin;

alter table dev.mail_messages
  add column if not exists contexto_anuncio jsonb;

comment on column dev.mail_messages.contexto_anuncio is
  'Snapshot do anuncio que originou a negociacao: {anuncioId, sellerId, speciesId, level, isShiny, rarity, ivPercent, price, currency, modo, apenasOferta}. '
  'Nulo na esmagadora maioria das mensagens. COPIA, nao referencia — ver o cabecalho do par _public.';

drop function if exists dev.enviar_mensagem(text, uuid, text, jsonb);

create function dev.enviar_mensagem(
  p_corpo text,
  p_para_id uuid default null,
  p_para_nick text default null,
  p_anexos jsonb default '[]'::jsonb,
  -- Opcional e por ultimo: toda chamada que ja existia continua valendo
  -- palavra por palavra.
  p_anuncio_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_eu record;
  v_destino record;
  v_destino_id uuid;
  v_ultima timestamptz;
  v_item jsonb;
  v_item_id text;
  v_qtd int;
  v_tem int;
  v_anexos jsonb := '[]'::jsonb;
  v_vistos text[] := '{}';
  v_ouro bigint := 0;
  v_contexto jsonb;
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;
  if p_corpo is null or length(trim(p_corpo)) = 0 or length(p_corpo) > 1000 then
    raise exception 'A mensagem precisa ter de 1 a 1000 caracteres.' using errcode = 'P0001';
  end if;

  select trainer_name into v_eu from dev.players where user_id = v_user_id;
  if v_eu is null then
    raise exception 'jogador sem linha em players' using errcode = 'P0001';
  end if;

  -- Resolve o destinatario por id ou por nick, nesta ordem.
  if p_para_id is not null then
    v_destino_id := p_para_id;
  elsif p_para_nick is not null and length(trim(p_para_nick)) between 1 and 40 then
    v_destino_id := dev.id_por_nome_de_treinador(trim(p_para_nick));
    if v_destino_id is null then
      raise exception 'Nao existe treinador chamado "%".', trim(p_para_nick) using errcode = 'P0001';
    end if;
  else
    raise exception 'destinatario invalido' using errcode = 'P0001';
  end if;

  if v_destino_id = v_user_id then
    raise exception 'Voce nao pode mandar mensagem pra si mesmo.' using errcode = 'P0001';
  end if;

  select user_id, trainer_name into v_destino from dev.players where user_id = v_destino_id;
  if v_destino is null then
    raise exception 'destinatario invalido' using errcode = 'P0001';
  end if;

  if dev.bloqueio_entre(v_user_id, v_destino.user_id) then
    raise exception 'Nao e possivel enviar mensagem para %.', v_destino.trainer_name using errcode = 'P0001';
  end if;

  -- Snapshot do anuncio (PH-435). O anuncio tem que ser de UM DOS DOIS lados
  -- da conversa: comprador falando do anuncio do vendedor, ou vendedor
  -- falando do proprio anuncio com quem ofertou. Qualquer outro id e recusado
  -- em vez de virar card silencioso — sem isso, um cliente adulterado
  -- estamparia o anuncio de um terceiro na conversa e o outro lado nao teria
  -- como desconfiar.
  --
  -- `status` NAO entra na condicao de proposito: negociacao sobre anuncio ja
  -- vendido ou retirado continua sendo negociacao, e o card e justamente o
  -- registro do que valia na hora.
  if p_anuncio_id is not null then
    select jsonb_build_object(
      'anuncioId', l.id,
      'sellerId', l.seller_id,
      'speciesId', l.species_id,
      'level', l.level,
      'isShiny', l.is_shiny,
      'rarity', l.rarity,
      'ivPercent', l.iv_percent,
      'price', l.price,
      'currency', l.currency,
      'modo', l.modo,
      'apenasOferta', l.apenas_oferta
    ) into v_contexto
    from dev.market_listings l
    where l.id = p_anuncio_id
      and l.seller_id in (v_user_id, v_destino.user_id);
    if v_contexto is null then
      raise exception 'Este anuncio nao e de nenhum dos dois lados desta conversa.' using errcode = 'P0001';
    end if;
  end if;

  -- Rate limit unico pros dois caminhos. Serializa por usuario com advisory
  -- lock: sem isso duas requisicoes simultaneas leem o mesmo `max(created_at)`
  -- e as duas passam.
  perform pg_advisory_xact_lock(hashtextextended('correio:' || v_user_id::text, 0));
  select max(created_at) into v_ultima
    from dev.mail_messages where de_id = v_user_id and tipo = 'texto';
  if v_ultima is not null and now() - v_ultima < interval '3 seconds' then
    raise exception 'Aguarde um instante antes de mandar outra mensagem.' using errcode = 'P0001';
  end if;

  -- Anexos: normaliza, recusa duplicata e DEBITA NO ENVIO. Debitar so na
  -- coleta deixaria o remetente prometer item que ele gastou nesse meio tempo.
  if p_anexos is not null and jsonb_typeof(p_anexos) = 'array' then
    if jsonb_array_length(p_anexos) > 5 then
      raise exception 'No maximo 5 itens diferentes por mensagem.' using errcode = 'P0001';
    end if;

    for v_item in select * from jsonb_array_elements(p_anexos) loop
      v_item_id := v_item->>'itemId';
      v_qtd := floor(coalesce((v_item->>'quantity')::numeric, 0));
      if v_item_id is null or v_qtd <= 0 then
        raise exception 'anexo invalido' using errcode = 'P0001';
      end if;
      if v_item_id = any(v_vistos) then
        raise exception 'Item repetido no anexo.' using errcode = 'P0001';
      end if;
      v_vistos := array_append(v_vistos, v_item_id);

      if v_item_id = 'gold' then
        v_ouro := v_qtd;
        update dev.players set gold = gold - v_qtd
          where user_id = v_user_id and gold >= v_qtd;
        if not found then
          raise exception 'Ouro insuficiente pro anexo.' using errcode = 'P0001';
        end if;
      else
        select quantity into v_tem from dev.player_items
          where user_id = v_user_id and item_id = v_item_id;
        if coalesce(v_tem, 0) < v_qtd then
          raise exception 'Voce nao tem % de %.', v_qtd, v_item_id using errcode = 'P0001';
        end if;
        update dev.player_items set quantity = quantity - v_qtd
          where user_id = v_user_id and item_id = v_item_id;
        delete from dev.player_items
          where user_id = v_user_id and item_id = v_item_id and quantity <= 0;
      end if;

      v_anexos := v_anexos || jsonb_build_array(jsonb_build_object('itemId', v_item_id, 'quantity', v_qtd));
    end loop;
  end if;

  insert into dev.mail_messages (para_id, de_id, de_nome, tipo, assunto, corpo, estado, anexo_itens, contexto_anuncio)
  values (v_destino.user_id, v_user_id, v_eu.trainer_name, 'texto', null, trim(p_corpo), 'pendente', v_anexos, v_contexto)
  returning id into v_id;

  return jsonb_build_object(
    'ok', true, 'id', v_id,
    'paraId', v_destino.user_id, 'paraNome', v_destino.trainer_name,
    'contextoAnuncio', v_contexto
  );
end;
$$;

revoke all on function dev.enviar_mensagem(text, uuid, text, jsonb, uuid) from public;
revoke execute on function dev.enviar_mensagem(text, uuid, text, jsonb, uuid) from anon;
grant execute on function dev.enviar_mensagem(text, uuid, text, jsonb, uuid) to authenticated;

commit;
