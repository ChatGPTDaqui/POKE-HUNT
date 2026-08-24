-- PH-98 — taxa de venda no Mercado.
--
-- Gemeo public: `20260823060000_taxa_de_venda_no_mercado_public.sql`.
--
-- ===========================================================================
-- O PROBLEMA: O MERCADO ERA GRATUITO
-- ===========================================================================
-- Nenhuma das RPCs cobrava nada. O vendedor recebia 100%, o comprador pagava
-- 100%, e o ouro so circulava. Duas consequencias:
--
--  1. NAO EXISTIA SINK. Todo ouro que entra na economia (loot, venda pra Loja)
--     so saia por compra no sistema. Comercio entre jogadores era neutro, entao
--     o total em circulacao so crescia e o preco nominal de tudo acompanhava.
--
--  2. TRANSFERIR OURO ENTRE CONTAS ERA GRATIS E SEM ATRITO. Anunciar um POKE
--     de valor irrisorio por 10 milhoes e comprar de outra conta move o saldo
--     inteiro sem custo. O Correio com anexo de ouro tambem e uma porta, mas o
--     Mercado e a de maior volume.
--
-- O Mercado da Steam cobra ~15% justamente por isso.
--
-- ===========================================================================
-- 5% EM OURO, ISENTO EM DIAMANTE
-- ===========================================================================
-- Decidido com o usuario. Diamante e moeda premium: taxar dela e imposto duplo
-- sobre quem ja pagou pra te-la.
--
-- ===========================================================================
-- O COMPRADOR PAGA O PRECO CHEIO; A TAXA SAI DE QUEM RECEBE
-- ===========================================================================
-- E como a Steam faz, e e o UNICO jeito de o livro de ofertas continuar
-- coerente: se a taxa entrasse por cima do preco, o preco mostrado no livro
-- deixaria de ser o preco pago e o casamento por limite viraria mentira — uma
-- ordem de compra com limite 100 casaria com uma venda de 100 e o comprador
-- seria debitado 105, acima do limite que ele declarou.
--
-- ===========================================================================
-- ARREDONDAMENTO EXPLICITO, PRA BAIXO, A FAVOR DO VENDEDOR
-- ===========================================================================
-- `(valor * pct) / 100` em bigint e divisao INTEIRA, que trunca — e truncar
-- para valor positivo e o mesmo que floor. Explicito de propósito: sem decidir
-- isso, 5% de 1 de ouro vira 0 ou 1 dependendo de quem le, e a diferenca
-- aparece como centavo somado errado no fim do mes. Aqui 5% de 19 e 0, e o
-- vendedor recebe 19 inteiros.
--
-- ===========================================================================
-- UM SO LUGAR GUARDA O PERCENTUAL — INCLUSIVE PRO CLIENTE
-- ===========================================================================
-- `taxa_do_mercado()` e a fonte, e ela tem `grant execute` pra `authenticated`
-- de propósito: a tela precisa mostrar "voce recebe X (taxa de 5%: Y)" ANTES de
-- confirmar, e a alternativa seria o cliente carregar a propria copia do 5%.
-- Duas copias do mesmo numero em dois idiomas divergem — e o sintoma seria a
-- tela prometer um valor e o banco creditar outro, que e indistinguivel de bug
-- de ouro faltando (a classe de reclamacao mais cara de diagnosticar).
--
-- Expor o percentual nao e risco: ele e regra publica do jogo, nao segredo.

begin;

-- ===========================================================================
-- Registro da taxa cobrada
-- ===========================================================================
-- Coluna e nao calculo posterior: sem ela nao ha como auditar receita nem
-- responder "por que recebi menos do que anunciei" olhando o historico. E
-- recalcular a partir de `unit_price * quantity` daria o numero ERRADO pra toda
-- linha anterior a esta migration (taxa zero) e pra qualquer mudanca futura de
-- percentual.
alter table dev.market_trades
  add column if not exists taxa bigint not null default 0 check (taxa >= 0);

comment on column dev.market_trades.taxa is
  'Taxa cobrada do VENDEDOR nesta negociacao, na moeda da linha. 0 em diamante '
  '(isento) e em toda linha anterior ao PH-98.';

-- ===========================================================================
-- A fonte do percentual
-- ===========================================================================
create or replace function dev.taxa_do_mercado()
returns jsonb
language sql immutable
set search_path = dev, public
as $$
  select jsonb_build_object('percentual', 5, 'moedasIsentas', jsonb_build_array('diamond'));
$$;

comment on function dev.taxa_do_mercado() is
  'Regra da taxa de venda do Mercado. Chamavel pelo cliente de propósito: a tela '
  'mostra o liquido antes de confirmar, e uma segunda copia do percentual no '
  'front divergiria desta.';

-- `immutable` vale enquanto o percentual for literal. Se algum dia ele virar
-- consulta a tabela de configuracao, ESTE marcador precisa cair pra `stable` —
-- o planner tem licenca pra dobrar uma funcao immutable numa constante em tempo
-- de plano, e um plano em cache continuaria cobrando o percentual antigo.
create or replace function dev.taxa_de_venda(p_valor bigint, p_currency text)
returns bigint
language plpgsql immutable
set search_path = dev, public
as $$
declare
  v_regra jsonb := dev.taxa_do_mercado();
begin
  if p_valor is null or p_valor <= 0 then return 0; end if;
  if v_regra->'moedasIsentas' ? p_currency then return 0; end if;
  -- Divisao inteira: trunca, e truncar positivo e floor. Ver o cabecalho.
  return (p_valor * (v_regra->>'percentual')::bigint) / 100;
end;
$$;

grant execute on function dev.taxa_do_mercado() to authenticated;
-- `taxa_de_venda` NAO e exposta: o cliente precisa da REGRA (pra mostrar o
-- liquido), nao de uma calculadora no servidor. Menos superficie, e o calculo
-- que vale continua sendo o que roda dentro da transacao de venda.

-- ===========================================================================
-- criar_ordem_mercado — livro de ofertas de ITEM
-- ===========================================================================
-- Dois caminhos de credito, e os DOIS sao venda:
--   p_side='compra' -> quem vende e a contraparte (v_candidata.user_id)
--   p_side='venda'  -> quem vende e quem esta agindo (v_user_id)
--
-- O lado COMPRADOR nao muda em nada: continua debitado do valor cheio, e o
-- troco de quem executou abaixo do proprio limite continua sendo a diferenca
-- integral (a taxa e do outro lado da mesa e nao entra nessa conta).
create or replace function dev.criar_ordem_mercado(p_item_id text, p_side text, p_unit_price int, p_quantity int)
returns jsonb
language plpgsql security definer set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_item dev.items;
  v_ordem_id uuid;
  v_gold_retido int;
  v_candidata record;
  v_restante int;
  v_retido int;
  v_executado int := 0;
  v_gasto_total bigint := 0;
  v_recebido_total bigint := 0;
  v_taxa_total bigint := 0;
  v_taxa bigint;
  v_qtd int;
  v_valor bigint;
  v_novo_restante_outra int;
  v_troco bigint;
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode='28000'; end if;

  -- PH-67: serializa contra outras escritas concorrentes em players do MESMO
  -- usuario (inclusive gravar_progresso/flush). Lock de transacao, libera
  -- sozinho no commit/rollback, sem tabela nova.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));
  if p_side not in ('compra','venda') then raise exception 'side deve ser "compra" ou "venda"'; end if;
  if p_unit_price is null or p_unit_price <= 0 or p_unit_price > 100000000 then raise exception 'unitPrice invalido'; end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity > 1000000 then raise exception 'quantity invalido'; end if;

  select * into v_item from dev.items where id = p_item_id;
  if v_item is null then raise exception 'item desconhecido'; end if;

  if p_side = 'venda' then
    if exists(select 1 from dev.player_items where user_id=v_user_id and item_id=p_item_id and locked) then
      raise exception 'Este item esta travado — destrave antes de anunciar.';
    end if;
    update dev.player_items set quantity = quantity - p_quantity, updated_at = now()
      where user_id = v_user_id and item_id = p_item_id and quantity >= p_quantity;
    if not found then raise exception 'Voce nao tem essa quantidade.'; end if;
    v_gold_retido := 0;
  else
    v_gold_retido := p_unit_price * p_quantity;
    update dev.players set gold = gold - v_gold_retido where user_id = v_user_id and gold >= v_gold_retido;
    if not found then raise exception 'Ouro insuficiente.'; end if;
  end if;

  insert into dev.market_orders (user_id, item_id, side, unit_price, quantity, remaining, gold_retido)
  values (v_user_id, p_item_id, p_side, p_unit_price, p_quantity, p_quantity, v_gold_retido)
  returning id into v_ordem_id;

  v_restante := p_quantity;
  v_retido := v_gold_retido;

  for v_candidata in
    select * from dev.market_orders
    where item_id = p_item_id
      and side = case when p_side='compra' then 'venda' else 'compra' end
      and status = 'ativa'
      and user_id != v_user_id
      and (case when p_side='compra' then unit_price <= p_unit_price else unit_price >= p_unit_price end)
    order by (case when p_side='compra' then unit_price else -unit_price end) asc, created_at asc
    limit 40
    for update skip locked
  loop
    exit when v_restante <= 0;
    v_qtd := least(v_restante, v_candidata.remaining);
    continue when v_qtd <= 0;
    v_valor := v_candidata.unit_price::bigint * v_qtd;
    v_novo_restante_outra := v_candidata.remaining - v_qtd;
    -- Livro de item e sempre em ouro (a linha de trade abaixo grava 'gold'),
    -- mas a moeda vai pela funcao em vez de assumida: se o livro ganhar outra
    -- moeda, a isencao passa a valer sozinha.
    v_taxa := dev.taxa_de_venda(v_valor, 'gold');
    v_taxa_total := v_taxa_total + v_taxa;

    update dev.market_orders set
      remaining = v_novo_restante_outra,
      status = case when v_novo_restante_outra = 0 then 'concluida' else 'ativa' end,
      closed_at = case when v_novo_restante_outra = 0 then now() else null end,
      gold_retido = case when side = 'compra' then greatest(0, gold_retido - v_valor) else gold_retido end
    where id = v_candidata.id;

    if p_side = 'compra' then
      insert into dev.player_items (user_id, item_id, quantity) values (v_user_id, p_item_id, v_qtd)
        on conflict (user_id, item_id) do update set quantity = dev.player_items.quantity + v_qtd, updated_at = now();
      v_troco := (p_unit_price - v_candidata.unit_price)::bigint * v_qtd;
      if v_troco > 0 then
        update dev.players set gold = gold + v_troco where user_id = v_user_id;
      end if;
      v_retido := greatest(0, v_retido - p_unit_price * v_qtd);
      v_gasto_total := v_gasto_total + v_valor;
      -- Contraparte e a VENDEDORA aqui: recebe liquido.
      update dev.players set gold = gold + (v_valor - v_taxa) where user_id = v_candidata.user_id;
    else
      -- Quem age e a vendedora: recebe liquido, e o total devolvido pra tela
      -- tambem e liquido (era ele que a mensagem de "recebido" usava).
      update dev.players set gold = gold + (v_valor - v_taxa) where user_id = v_user_id;
      v_recebido_total := v_recebido_total + (v_valor - v_taxa);
      insert into dev.player_items (user_id, item_id, quantity) values (v_candidata.user_id, p_item_id, v_qtd)
        on conflict (user_id, item_id) do update set quantity = dev.player_items.quantity + v_qtd, updated_at = now();
    end if;

    insert into dev.market_trades (kind, item_id, quantity, unit_price, currency, buyer_id, seller_id, taxa)
    values ('item', p_item_id, v_qtd, v_candidata.unit_price, 'gold',
      case when p_side='compra' then v_user_id else v_candidata.user_id end,
      case when p_side='compra' then v_candidata.user_id else v_user_id end,
      v_taxa);

    v_restante := v_restante - v_qtd;
    v_executado := v_executado + v_qtd;
  end loop;

  update dev.market_orders set
    remaining = v_restante,
    gold_retido = case when p_side='compra' then v_retido else 0 end,
    status = case when v_restante = 0 then 'concluida' else 'ativa' end,
    closed_at = case when v_restante = 0 then now() else null end
  where id = v_ordem_id;

  return jsonb_build_object('ok', true, 'ordemId', v_ordem_id, 'executado', v_executado,
    'gastoTotal', v_gasto_total, 'recebidoTotal', v_recebido_total, 'taxaTotal', v_taxa_total);
end;
$$;

-- ===========================================================================
-- comprar_anuncio — POKE de preco fixo
-- ===========================================================================
create or replace function dev.comprar_anuncio(p_anuncio_id uuid)
returns jsonb
language plpgsql security definer set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_anuncio dev.market_listings;
  v_nome text;
  v_taxa bigint;
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode='28000'; end if;

  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

  select * into v_anuncio from dev.market_listings where id = p_anuncio_id for update;
  if v_anuncio is null or v_anuncio.status != 'ativo' then
    raise exception 'Este anuncio nao esta mais disponivel.';
  end if;
  if v_anuncio.seller_id = v_user_id then
    raise exception 'Voce nao pode comprar o proprio anuncio.';
  end if;
  if v_anuncio.apenas_oferta or v_anuncio.price is null then
    raise exception 'Este anuncio so aceita lances — envie uma oferta.';
  end if;

  -- Comprador paga cheio, nos dois casos.
  if v_anuncio.currency = 'gold' then
    update dev.players set gold = gold - v_anuncio.price where user_id = v_user_id and gold >= v_anuncio.price;
  else
    update dev.players set diamonds = diamonds - v_anuncio.price where user_id = v_user_id and diamonds >= v_anuncio.price;
  end if;
  if not found then
    raise exception '%', case when v_anuncio.currency='gold' then 'Ouro insuficiente.' else 'Diamantes insuficientes.' end;
  end if;

  update dev.market_listings set status='vendido', sold_at=now(), buyer_id=v_user_id where id = p_anuncio_id;
  update dev.pokemon_instances set user_id=v_user_id, location='bag', team_slot=null, updated_at=now() where id = v_anuncio.poke_uid;

  v_taxa := dev.taxa_de_venda(v_anuncio.price::bigint, v_anuncio.currency);
  if v_anuncio.currency = 'gold' then
    update dev.players set gold = gold + (v_anuncio.price - v_taxa) where user_id = v_anuncio.seller_id;
  else
    -- Diamante e isento, entao `v_taxa` e 0 aqui. Subtrair de qualquer forma
    -- mantem os dois ramos com a MESMA forma: se a isencao mudar um dia, nao
    -- ha um ramo que silenciosamente continua cobrando zero.
    update dev.players set diamonds = diamonds + (v_anuncio.price - v_taxa) where user_id = v_anuncio.seller_id;
  end if;

  insert into dev.market_trades (kind, species_id, quantity, unit_price, currency, buyer_id, seller_id, taxa)
  values ('poke', v_anuncio.species_id, 1, v_anuncio.price, v_anuncio.currency, v_user_id, v_anuncio.seller_id, v_taxa);

  select name into v_nome from dev.species where id = v_anuncio.species_id;
  return jsonb_build_object('ok', true, 'mensagem', format('%s comprado! Ele esta na sua mochila.', coalesce(v_nome, v_anuncio.species_id)));
end;
$$;

-- ===========================================================================
-- responder_oferta — aceitar lance
-- ===========================================================================
-- A RECUSA e o caminho de devolucao NAO ganham taxa, e isso e invariante: o
-- escrow devolvido e do COMPRADOR e volta integral. Cobrar taxa numa devolucao
-- seria cobrar por um negocio que nao aconteceu.
create or replace function dev.responder_oferta(p_oferta_id uuid, p_aceitar boolean)
returns jsonb
language plpgsql security definer set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_oferta dev.market_offers;
  v_anuncio dev.market_listings;
  v_nome text;
  v_devolvidas int;
  v_taxa bigint;
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode='28000'; end if;

  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

  select * into v_oferta from dev.market_offers where id = p_oferta_id for update;
  if v_oferta is null or v_oferta.status != 'pendente' then
    raise exception 'Esta oferta ja foi respondida.';
  end if;

  select * into v_anuncio from dev.market_listings where id = v_oferta.listing_id for update;
  if v_anuncio is null then raise exception 'anuncio nao encontrado'; end if;
  if v_anuncio.seller_id != v_user_id then raise exception 'Esta oferta nao e de um anuncio seu.'; end if;

  select name into v_nome from dev.species where id = v_anuncio.species_id;

  if not p_aceitar then
    update dev.market_offers set status='recusada', resolved_at=now() where id = p_oferta_id;
    -- Devolucao INTEGRAL, sem taxa. Ver a nota acima.
    if v_oferta.currency = 'gold' then
      update dev.players set gold = gold + v_oferta.valor where user_id = v_oferta.buyer_id;
    else
      update dev.players set diamonds = diamonds + v_oferta.valor where user_id = v_oferta.buyer_id;
    end if;
    return jsonb_build_object('ok', true, 'mensagem', 'Oferta recusada — o valor foi devolvido ao ofertante.');
  end if;

  if v_anuncio.status != 'ativo' then
    raise exception 'Este anuncio ja tinha sido encerrado.';
  end if;

  update dev.market_offers set status='aceita', resolved_at=now() where id = p_oferta_id;
  update dev.market_listings set status='vendido', sold_at=now(), buyer_id=v_oferta.buyer_id where id = v_anuncio.id;
  update dev.pokemon_instances set user_id=v_oferta.buyer_id, location='bag', team_slot=null, updated_at=now() where id = v_anuncio.poke_uid;

  v_taxa := dev.taxa_de_venda(v_oferta.valor::bigint, v_oferta.currency);
  if v_oferta.currency = 'gold' then
    update dev.players set gold = gold + (v_oferta.valor - v_taxa) where user_id = v_user_id;
  else
    update dev.players set diamonds = diamonds + (v_oferta.valor - v_taxa) where user_id = v_user_id;
  end if;

  insert into dev.market_trades (kind, species_id, quantity, unit_price, currency, buyer_id, seller_id, taxa)
  values ('poke', v_anuncio.species_id, 1, v_oferta.valor, v_oferta.currency, v_oferta.buyer_id, v_user_id, v_taxa);

  select dev.recusar_ofertas_pendentes(v_anuncio.id, format('Outra oferta por %s foi aceita', coalesce(v_nome, v_anuncio.species_id)), p_oferta_id) into v_devolvidas;

  return jsonb_build_object('ok', true, 'mensagem',
    case when v_devolvidas > 0
      then format('Lance aceito! %s foi entregue e %s outra(s) oferta(s) foram devolvidas.', coalesce(v_nome, v_anuncio.species_id), v_devolvidas)
      else format('Lance aceito! %s foi entregue ao ofertante.', coalesce(v_nome, v_anuncio.species_id))
    end);
end;
$$;

commit;
