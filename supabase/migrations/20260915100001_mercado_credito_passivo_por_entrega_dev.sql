-- PH-513 — item comprado no Mercado durante cacada sumia no flush seguinte.
--
-- `criar_ordem_mercado` creditava o dono PASSIVO de uma ordem de compra com
-- `insert ... on conflict do update` direto em dev.player_items, sem tocar
-- dev.players. O flush de cacada dele (gravarEstado, authority/src/progresso.ts)
-- reescreve player_items a partir do estado lido no inicio da janela e apaga
-- todo item_id que nao esta nele — o credito entrava e o flush o apagava,
-- sem erro, sem log. O CAS em players.updated_at nao via nada porque players
-- nao mudou.
--
-- Unica mudanca nesta redefinicao: o credito de item da contraparte compradora
-- passa por market_deliveries, como a troca ja faz. O lado que AGE (quem chama
-- a RPC) continua creditado direto — o cliente refaz a leitura logo em seguida
-- (mercadoRpc.ts#refetchAposOrdem). O ouro da contraparte vendedora continua
-- direto em players: o trigger players_set_updated_at faz o CAS do flush dela
-- recusar a escrita velha e reler.
-- Gemeo dev de 20260915100000_mercado_credito_passivo_por_entrega_public.sql.
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
      -- PH-513: a contraparte e a COMPRADORA, e ela nao esta neste request —
      -- pode estar cacando, ou nem online. Escrever direto em player_items
      -- aqui era a classe de bug de "credito fora do snapshot": o flush
      -- seguinte dela reescreve a tabela a partir do estado que leu ANTES
      -- deste casamento e apaga (ou sobrescreve) o item. E como esta linha
      -- nao tocava players, o CAS de gravar_progresso nem via a mudanca.
      -- O credito vai pela caixa de entregas (market_deliveries), reivindicada
      -- e aplicada dentro do proximo request da propria compradora — o mesmo
      -- caminho que a troca ja usa (20260830070000).
      insert into dev.market_deliveries (user_id, gold, diamonds, item_id, quantity, motivo)
      values (v_candidata.user_id, 0, 0, p_item_id, v_qtd, 'mercado-compra');
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
