-- PH-100 — a contraparte fica sabendo que o negocio aconteceu.
--
-- Gemeo dev: `20260823080001_aviso_de_negocio_a_contraparte_dev.sql`.
--
-- DEPENDE DO PH-101 (`market_listings.modo`), usado pra distinguir "seu lance
-- foi coberto num leilao em andamento" de "sua oferta foi recusada". Timestamp
-- desta e maior, entao o deploy aplica na ordem certa.
--
-- ===========================================================================
-- O PROBLEMA
-- ===========================================================================
-- Quem AGE ve o toast. A CONTRAPARTE nao ve nada: o ouro entra na carteira e o
-- item na mochila, e ela so descobre o que aconteceu abrindo o Mercado e olhando
-- a aba Ativos — ou percebendo que o saldo mudou, que e indistinguivel de bug
-- ("meu ouro mudou sozinho").
--
-- ===========================================================================
-- TRIGGER, E NAO UM `insert` DENTRO DE CADA RPC
-- ===========================================================================
-- O caminho obvio seria acrescentar o aviso nas quatro RPCs que fecham negocio.
-- Trigger e melhor por dois motivos, e o segundo e o que decide:
--
--  1. Um lugar so em vez de quatro edicoes que alguem esquece de repetir.
--  2. Pega TODO caminho que registra negocio, inclusive os que ainda nao
--     existem. O encerramento de leilao (PH-101) e o exemplo imediato: ele
--     grava em `market_trades` e ganha o aviso sem uma linha propria.
--
-- ===========================================================================
-- QUEM RECEBE: OS DOIS LADOS, MENOS QUEM AGIU
-- ===========================================================================
-- `auth.uid()` dentro do trigger e o jogador que disparou a RPC. Ele ja viu o
-- toast, entao nao recebe correio. O outro lado recebe.
--
-- Quando `auth.uid()` e NULL — o encerramento de leilao roda pelo pg_cron, sem
-- sessao — os DOIS recebem. E o certo: ninguem clicou nada, o vendedor precisa
-- saber que vendeu e o vencedor que ganhou.
--
-- ===========================================================================
-- FALHAR AQUI NAO PODE DESFAZER O NEGOCIO
-- ===========================================================================
-- Um trigger que levanta excecao aborta a transacao INTEIRA — o ouro nao seria
-- creditado e o POKE nao trocaria de dono, por causa de uma mensagem. O aviso e
-- REGISTRO, nao entrega: o `exception when others` engole qualquer falha e
-- devolve o controle. O jogador perde o aviso e mantem o negocio, que e o lado
-- certo de errar.
--
-- ===========================================================================
-- POR QUE NAO PRECISA DE POLL NOVO
-- ===========================================================================
-- O aviso e uma linha em `mail_messages` com `tipo = 'sistema'`, e a caixa do
-- Correio ja le tudo que nao e `texto` como AVISO, ja conta `estado =
-- 'pendente'` no badge do HUD, e ja tem Realtime em INSERT nessa tabela. Ou
-- seja: o sino acende ao vivo sem uma requisicao periodica nova.
--
-- Isso importa porque o PH-65 existiu justamente pra cortar poll de badge —
-- dois deles gastavam 90 requisicoes por hora por aba. Um terceiro seria andar
-- pra tras.
--
-- DESVIO DA ISSUE, dito em voz alta: ela pedia badge no MERCADO tambem. O badge
-- do Mercado conta "lance esperando sua decisao", e negocio FECHADO nao espera
-- decisao nenhuma — somar os dois faria o numero deixar de significar "tem
-- coisa pra voce responder". O Correio e o lugar, e e o mesmo princípio que o
-- projeto ja aplicou ao pedido de amizade: "um lugar so para olhar quando
-- alguem interage com voce".

begin;

-- ===========================================================================
-- 1. Negocio fechado
-- ===========================================================================
create or replace function public.avisar_negocio_a_contraparte()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_ator uuid := auth.uid();
  v_o_que text;
  v_total bigint := new.unit_price::bigint * new.quantity;
begin
  -- O nome do que foi negociado. `coalesce` no id porque especie/item
  -- renomeados num sync posterior nao podem derrubar o aviso.
  if new.kind = 'item' then
    select coalesce(name, new.item_id) into v_o_que from public.items where id = new.item_id;
    v_o_que := coalesce(v_o_que, new.item_id) || ' x' || new.quantity;
  else
    select coalesce(name, new.species_id) into v_o_que from public.species where id = new.species_id;
    v_o_que := coalesce(v_o_que, new.species_id);
  end if;

  -- VENDEDOR. `taxa` sai do que ele recebeu (PH-98), entao o aviso mostra o
  -- LIQUIDO — e o numero que apareceu na carteira dele. Mostrar o bruto aqui
  -- faria o correio e o saldo discordarem.
  if new.seller_id is not null and (v_ator is null or v_ator <> new.seller_id) then
    insert into public.mail_messages (para_id, de_id, de_nome, tipo, assunto, corpo)
    values (
      new.seller_id, null, 'Mercado', 'sistema',
      'Vendido: ' || v_o_que,
      format('Você recebeu %s %s pela venda de %s.%s',
        v_total - coalesce(new.taxa, 0),
        case when new.currency = 'gold' then 'de ouro' else 'diamante(s)' end,
        v_o_que,
        case when coalesce(new.taxa, 0) > 0 then format(' Taxa do Mercado: %s.', new.taxa) else '' end)
    );
  end if;

  -- COMPRADOR.
  if new.buyer_id is not null and (v_ator is null or v_ator <> new.buyer_id) then
    insert into public.mail_messages (para_id, de_id, de_nome, tipo, assunto, corpo)
    values (
      new.buyer_id, null, 'Mercado', 'sistema',
      'Comprado: ' || v_o_que,
      format('%s é seu, por %s %s.', v_o_que, v_total,
        case when new.currency = 'gold' then 'de ouro' else 'diamante(s)' end)
    );
  end if;

  return new;
exception when others then
  -- Ver o cabecalho: o aviso e registro, nao entrega. Perder a mensagem e
  -- aceitavel; desfazer o negocio por causa dela nao.
  return new;
end;
$$;

drop trigger if exists market_trades_avisa_contraparte on public.market_trades;
create trigger market_trades_avisa_contraparte
  after insert on public.market_trades
  for each row execute function public.avisar_negocio_a_contraparte();

-- ===========================================================================
-- 2. Oferta recusada
-- ===========================================================================
-- Recusa NAO gera linha em `market_trades` (nao houve negocio), entao ela
-- precisa do proprio gatilho — e e metade do criterio de aceite: "oferta
-- aceita/recusada geram o mesmo aviso". A ACEITA ja vem pelo trigger de cima,
-- porque aceitar grava trade.
create or replace function public.avisar_oferta_recusada()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_ator uuid := auth.uid();
  v_anuncio public.market_listings;
  v_nome text;
begin
  select * into v_anuncio from public.market_listings where id = new.listing_id;
  if v_anuncio is null then return new; end if;

  -- LANCE COBERTO NUM LEILAO EM ANDAMENTO NAO VIRA CORREIO.
  --
  -- Uma disputa de vinte rodadas geraria vinte mensagens, e nenhuma delas diz
  -- algo que a tela nao esteja mostrando: o maior lance e o tempo restante
  -- estao no cartao, e o escrow volta pra carteira no mesmo instante.
  --
  -- O criterio pra distinguir e o STATUS DO ANUNCIO, e nao quem chamou: no
  -- encerramento e no cancelamento o anuncio JA saiu de 'ativo' antes de as
  -- ofertas perdedoras serem recusadas, entao o perdedor de um leilao que
  -- ACABOU recebe uma mensagem — uma, no fim. Recusa de oferta comum (o
  -- vendedor apertando "Recusar") tem anuncio 'ativo' mas modo 'preco_fixo',
  -- e por isso o teste olha os dois campos.
  if v_anuncio.modo = 'leilao' and v_anuncio.status = 'ativo' then
    return new;
  end if;

  if new.buyer_id is null or (v_ator is not null and v_ator = new.buyer_id) then
    return new;
  end if;

  select coalesce(name, v_anuncio.species_id) into v_nome from public.species where id = v_anuncio.species_id;

  insert into public.mail_messages (para_id, de_id, de_nome, tipo, assunto, corpo)
  values (
    new.buyer_id, null, 'Mercado', 'sistema',
    'Lance devolvido: ' || coalesce(v_nome, v_anuncio.species_id),
    format('Seu lance de %s %s em %s não foi aceito e o valor voltou pra sua carteira.',
      new.valor,
      case when new.currency = 'gold' then 'de ouro' else 'diamante(s)' end,
      coalesce(v_nome, v_anuncio.species_id))
  );
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists market_offers_avisa_recusa on public.market_offers;
-- `when` na definicao do trigger, e nao um `if` no corpo: uma transicao que nao
-- interessa nao chega nem a chamar a funcao. `market_offers` e escrita em todo
-- lance de leilao, e o caminho quente nao deveria pagar por um aviso que na
-- maioria das vezes nao vai sair.
create trigger market_offers_avisa_recusa
  after update of status on public.market_offers
  for each row
  when (new.status = 'recusada' and old.status = 'pendente')
  execute function public.avisar_oferta_recusada();

commit;
