-- PAR DEV de 20260902110000_reserva_de_anuncio_public.sql.
-- Gerado a partir dele trocando `public.` por `dev.`; `auth.` e compartilhado
-- e nao muda. Ver docs/11-operacao.md#fluxo-de-mudanca-de-schema.
--
-- PH-437 — o preco combinado na conversa passa a ter como ser cobrado.
--
-- ===========================================================================
-- O BURACO QUE ISTO FECHA
-- ===========================================================================
-- Dois jogadores conversam pelo card do anuncio (PH-435), combinam 1.8M em vez
-- dos 2.5M anunciados — e ai nao havia como fechar:
--
--  - nao existe RPC pra alterar o preco de um anuncio ativo;
--  - cancelar e reanunciar mais barato expoe o POKE na vitrine PUBLICA, e
--    qualquer terceiro compra antes do combinado;
--  - a mesa de troca nao resolve: ela move POKE e item, nao ouro.
--
-- Ou seja: dava pra conversar, dava pra combinar, e nao dava pra fechar sem
-- confiar na palavra do outro. `reservado_para` + preco na mesma transacao e o
-- menor mecanismo que fecha isso.
--
-- ===========================================================================
-- POR QUE A VISIBILIDADE VAI NA VIEW, E A REGRA NA RPC
-- ===========================================================================
-- Sao duas camadas de proposito, porque protegem de coisas diferentes:
--
--  - a VIEW esconde o anuncio reservado de terceiros. E conveniencia de tela:
--    anuncio que ninguem mais pode comprar poluindo a vitrine e ruido.
--  - `comprar_anuncio` RECUSA a compra. E a regra. O id do anuncio circula (o
--    card da conversa carrega ele), entao esconder da lista nao impede uma
--    chamada direta — e limite que so existe no cliente vira 502.
--
-- `auth.uid()` funciona dentro da view mesmo com `security_invoker = false`:
-- ele le a claim do JWT do request (`current_setting`), nao o papel que
-- executa. A view continua definer pelo motivo do PH-128 — `security_invoker =
-- true` fazia a leitura depender da RLS de `treinadores_publico`, e foi assim
-- que aquele defeito nasceu duas vezes.
--
-- ===========================================================================
-- O QUE A RESERVA NAO ACEITA
-- ===========================================================================
-- Leilao e "somente lance" ficam FORA, e nao por simplificacao:
--
--  - reservar um leilao quebraria o lance de quem ja esta dentro, com ouro em
--    escrow, sem nada que ele possa fazer;
--  - `apenas_oferta` tem oferta pendente com ouro retido pela mesma razao.
--
-- Anuncio com oferta pendente tambem e recusado: o vendedor responde a oferta
-- (aceita ou recusa, e a recusa devolve integral) antes de prometer o POKE a
-- outra pessoa.

begin;

-- `on delete set null`: conta apagada libera o anuncio de volta pra vitrine em
-- vez de deixa-lo reservado pra um id que nao existe mais — que seria um POKE
-- invendavel pra sempre.
alter table dev.market_listings
  add column if not exists reservado_para uuid references auth.users(id) on delete set null;

comment on column dev.market_listings.reservado_para is
  'Comprador para quem este anuncio esta reservado (PH-437). Nulo = anuncio publico. '
  'So preco fixo aceita reserva; leilao e somente-lance nao.';

-- Indice parcial: a vitrine filtra por ele em toda pagina, e a esmagadora
-- maioria das linhas tem nulo aqui.
create index if not exists market_listings_reservados_idx
  on dev.market_listings (reservado_para)
  where reservado_para is not null and status = 'ativo';

-- ---------------------------------------------------------------------------
-- A vitrine esconde o que esta reservado pra outra pessoa
-- ---------------------------------------------------------------------------
-- `drop` + `create` e nao `create or replace`: a coluna nova muda a lista, e
-- `replace` exige a mesma ordem de antes. Mesma decisao do PH-128.
drop view if exists dev.mercado_anuncios_ativos;

create view dev.mercado_anuncios_ativos as
select
  l.id, l.seller_id, l.poke_uid,
  l.price, l.currency, l.status, l.apenas_oferta,
  l.species_id, l.level, l.rarity, l.is_shiny, l.iv_percent,
  l.modo, l.expira_em, l.lance_minimo, l.incremento_minimo,
  l.created_at, l.sold_at, l.buyer_id,
  l.reservado_para,
  -- Nome de quem reservou: sem ele a tela de anuncios so teria um uuid pra
  -- mostrar, e "reservado para 8f3a…" nao diz nada a ninguem. Junta pela
  -- esquerda porque a esmagadora maioria dos anuncios nao tem reserva.
  r.trainer_name as reservado_nome,
  t.trainer_name as vendedor,
  (select count(*) from dev.market_offers o
     where o.listing_id = l.id and o.status = 'pendente')::int as ofertas,
  (select max(valor) from dev.market_offers o
     where o.listing_id = l.id and o.status = 'pendente') as melhor_oferta
from dev.market_listings l
join dev.treinadores_publico t on t.user_id = l.seller_id
left join dev.treinadores_publico r on r.user_id = l.reservado_para
where l.status = 'ativo'
  -- O vendedor continua vendo o proprio anuncio reservado (a vitrine NAO
  -- esconde o que voce mesmo anunciou), e o reservado ve o dele — e por essa
  -- linha que ele consegue comprar pelo valor combinado.
  and (
    l.reservado_para is null
    or l.reservado_para = auth.uid()
    or l.seller_id = auth.uid()
  );

-- Explicito, e nao omitido: ver a nota do PH-128 no cabecalho.
alter view dev.mercado_anuncios_ativos set (security_invoker = false);

revoke all on dev.mercado_anuncios_ativos from public;
grant select on dev.mercado_anuncios_ativos to authenticated;

-- ---------------------------------------------------------------------------
-- comprar_anuncio — a regra, e nao so a tela
-- ---------------------------------------------------------------------------
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
  -- RESERVA (PH-437). O anuncio reservado sai da vitrine de quem nao e o
  -- vendedor nem o reservado, mas a vitrine e so a tela: o id do anuncio
  -- circula (ele veio num card de conversa, por exemplo), e sem esta linha uma
  -- chamada direta compraria o POKE que estava prometido a outro jogador.
  --
  -- Recusa com mensagem tratada, e nao por constraint: limite de negocio que
  -- so existe no cliente vira 502 em vez de erro que o jogador entende.
  if v_anuncio.reservado_para is not null and v_anuncio.reservado_para <> v_user_id then
    raise exception 'Este anuncio esta reservado para outro jogador.';
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

-- ---------------------------------------------------------------------------
-- reservar_anuncio — preco combinado e destinatario, na mesma transacao
-- ---------------------------------------------------------------------------
-- Preco E reserva juntos de proposito. Separados, existiria uma janela em que o
-- anuncio esta a 1.8M e ainda publico — e a vitrine e ordenada por preco
-- crescente, ou seja o POKE apareceria no TOPO da lista pra todo mundo
-- exatamente durante essa janela.
--
-- `p_para_id` nulo LIMPA a reserva (e nao mexe no preco): o vendedor desistiu,
-- ou o comprador sumiu, e o anuncio volta pra vitrine publica pelo valor que
-- estiver valendo.
create or replace function dev.reservar_anuncio(
  p_anuncio_id uuid,
  p_para_id uuid default null,
  p_price int default null
)
returns jsonb
language plpgsql security definer set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_anuncio dev.market_listings;
  v_destino record;
  v_ofertas int;
  v_nome text;
  v_mudou boolean;
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode='28000'; end if;

  -- Mesmo lock por usuario das outras RPCs de mercado: sem ele, dois cliques
  -- simultaneos leem o mesmo anuncio e o segundo sobrescreve a decisao do
  -- primeiro.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

  select * into v_anuncio from dev.market_listings where id = p_anuncio_id for update;
  if v_anuncio is null or v_anuncio.status <> 'ativo' then
    raise exception 'Este anuncio nao esta mais disponivel.';
  end if;
  if v_anuncio.seller_id <> v_user_id then
    raise exception 'Este anuncio nao e seu.';
  end if;
  if v_anuncio.modo = 'leilao' then
    raise exception 'Leilao nao aceita reserva — quem esta dando lance ja tem ouro retido nele.';
  end if;
  if v_anuncio.apenas_oferta then
    raise exception 'Anuncio de lance nao aceita reserva — aceite ou recuse os lances primeiro.';
  end if;

  -- Oferta pendente = ouro de terceiro retido neste anuncio. Prometer o POKE a
  -- outra pessoa antes de responder deixaria aquele ouro preso num negocio que
  -- nunca vai acontecer.
  select count(*) into v_ofertas from dev.market_offers
    where listing_id = p_anuncio_id and status = 'pendente';
  if v_ofertas > 0 then
    raise exception 'Este anuncio tem % lance(s) pendente(s) — responda antes de reservar.', v_ofertas;
  end if;

  -- LIMPAR a reserva. Sem tocar no preco: o valor que esta valendo e o que
  -- volta pra vitrine.
  if p_para_id is null then
    update dev.market_listings set reservado_para = null where id = p_anuncio_id;
    return jsonb_build_object('ok', true, 'mensagem', 'Reserva removida. O anuncio voltou para a vitrine.');
  end if;

  if p_para_id = v_user_id then
    raise exception 'Voce nao pode reservar um anuncio pra si mesmo.';
  end if;

  select user_id, trainer_name into v_destino from dev.players where user_id = p_para_id;
  if v_destino is null then
    raise exception 'Jogador nao encontrado.';
  end if;

  -- Mesma checagem do envio de mensagem: reservar pra quem bloqueou (ou pra
  -- quem voce bloqueou) criaria um compromisso que nenhum dos dois lados
  -- consegue conversar sobre.
  if dev.bloqueio_entre(v_user_id, v_destino.user_id) then
    raise exception 'Nao e possivel reservar para %.', v_destino.trainer_name;
  end if;

  if p_price is null or p_price <= 0 or p_price > 100000000 then
    raise exception 'Preco invalido.';
  end if;

  -- Reserva IDENTICA a que ja vale nao vira mensagem nova. E o que impede o
  -- aviso de virar rota de flood: a mensagem sai por insert direto (o vendedor
  -- nao esta "mandando mensagem", esta reservando), entao ela nao passa pelo
  -- rate limit de `enviar_mensagem`.
  v_mudou := v_anuncio.reservado_para is distinct from p_para_id
    or v_anuncio.price is distinct from p_price;

  update dev.market_listings
    set reservado_para = p_para_id, price = p_price
    where id = p_anuncio_id;

  select name into v_nome from dev.species where id = v_anuncio.species_id;

  if v_mudou then
    insert into dev.mail_messages (
      para_id, de_id, de_nome, tipo, assunto, corpo, estado, contexto_anuncio
    )
    select
      v_destino.user_id, v_user_id, p.trainer_name, 'texto', null,
      format('Reservei este POKE pra voce por %s. Ele saiu da vitrine — so voce consegue comprar.', p_price),
      'pendente',
      jsonb_build_object(
        'anuncioId', v_anuncio.id,
        'sellerId', v_anuncio.seller_id,
        'speciesId', v_anuncio.species_id,
        'level', v_anuncio.level,
        'isShiny', v_anuncio.is_shiny,
        'rarity', v_anuncio.rarity,
        'ivPercent', v_anuncio.iv_percent,
        'price', p_price,
        'currency', v_anuncio.currency,
        'modo', v_anuncio.modo,
        'apenasOferta', v_anuncio.apenas_oferta
      )
    from dev.players p where p.user_id = v_user_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'mensagem', format('%s reservado para %s por %s.', coalesce(v_nome, v_anuncio.species_id), v_destino.trainer_name, p_price)
  );
end;
$$;

revoke all on function dev.reservar_anuncio(uuid, uuid, int) from public;
revoke execute on function dev.reservar_anuncio(uuid, uuid, int) from anon;
grant execute on function dev.reservar_anuncio(uuid, uuid, int) to authenticated;

commit;
