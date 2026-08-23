-- PH-101 — Leilão de POKE.
--
-- Gemeo dev: `20260823070001_leilao_de_poke_dev.sql`.
--
-- DEPENDE DO PH-98: `taxa_de_venda` e `market_trades.taxa` vem da migration
-- 20260823060000/01. Timestamp desta e maior, entao o deploy aplica na ordem
-- certa — mas se o PH-98 nao for mergeado, o encerramento de leilao estoura em
-- tempo de execucao ("function taxa_de_venda does not exist"), nao no apply.
--
-- ===========================================================================
-- O QUE FOI REAPROVEITADO, E POR QUE ISSO IMPORTA
-- ===========================================================================
-- Leilao NAO e um sistema paralelo. `market_offers` ja tem exatamente o que um
-- lance precisa:
--
--   * ESCROW — o valor sai do bolso do ofertante na hora. Sem isso, dez lances
--     do mesmo ouro seriam todos validos e o decimo aceito nao teria como ser
--     pago.
--   * INDICE UNICO PARCIAL `(listing_id, buyer_id) where status='pendente'` —
--     e literalmente a regra "dar lance de novo SUBSTITUI, nao empilha".
--   * DEVOLUCAO EM TODO CAMINHO DE SAIDA, incluindo o reset de conta
--     (`reiniciar_jogo` varre os anuncios do jogador e chama
--     `recusar_ofertas_pendentes` em cada um). Conferido: leilao herda isso de
--     graca, nao ha nada a mudar la — era o PH-4.
--
-- ===========================================================================
-- LEILAO E `apenas_oferta = true` + `modo = 'leilao'`
-- ===========================================================================
-- De propósito, e nao um terceiro valor de `apenas_oferta`: com isso a check
-- `market_listings_preco_coerente` que ja existe forca `price is null`, e
-- `comprar_anuncio` — que ja recusa com frase quem tenta compra direta em
-- anuncio de lance — passa a cobrir leilao SEM UMA LINHA DE MUDANCA.
--
-- O criterio de aceite pedia "compra direta em leilao responde 409 com frase".
-- Ele e atendido pelo caminho que ja existia, e isso e melhor que um `if` novo:
-- um `if` novo poderia ser esquecido numa RPC futura, a check nao.
--
-- ===========================================================================
-- SO O LIDER SEGURA DINHEIRO
-- ===========================================================================
-- Quando um lance supera o atual, o escrow do lider anterior volta NA MESMA
-- transacao. A alternativa (todo mundo segurando o proprio lance ate o fim)
-- prenderia o ouro de cinco pessoas por 24 horas num leilao que uma vai ganhar.
--
-- Consequencia direta: RETRATAR LANCE E PROIBIDO em leilao. Se fosse permitido,
-- o padrao otimo seria dar um lance altissimo pra afastar todos, e retratar
-- perto do fim — o leilao viraria teatro. `cancelar_oferta` ganha essa guarda.
--
-- ===========================================================================
-- ANTI-SNIPING: +30s A CADA LANCE NO FIM
-- ===========================================================================
-- Sem isso um leilao nao e leilao: ganha quem tem ping melhor e a aba aberta no
-- segundo final, e dar lance cedo so serve pra avisar o concorrente de quanto
-- ele precisa cobrir. Com a extensao, quem quer ganhar tem que cobrir de
-- verdade.
--
-- O relogio que vale e `expira_em`, sempre — `dar_lance` recusa lance depois
-- dele mesmo que o cron ainda nao tenha rodado. Sem isso, o minuto entre a
-- expiracao e a varredura seria uma janela pra lance fora de hora.
--
-- ===========================================================================
-- ENCERRAMENTO POR pg_cron EM SQL PURO
-- ===========================================================================
-- Nenhuma invocacao de Edge Function. O contraste esta no proprio repo: o
-- `log-puller` custava 8.640 invocacoes por mes (ver
-- 20260823000000_retencao_de_audit_logs...), e este job custa CPU de banco e
-- nada mais.
--
-- EM LOTE, com `limit` e `for update skip locked`: o cron do Postgres nao tem
-- timeout proprio, ele so segura a conexao — mesmo raciocinio do purge de
-- `audit_logs`. Um pico de leiloes vencendo junto drena em execucoes seguidas
-- em vez de virar uma transacao gigante.
--
-- SEM ADVISORY LOCK, e isso e deliberado: a funcao nao tem `auth.uid()` (nao ha
-- sessao), e TODA escrita dela em `players` e incremento (`gold = gold + X`).
-- O proprio PH-67 registra que incremento nao precisa de lock — ele e atomico
-- dentro do UPDATE. O que o advisory lock protege e o CAS do flush, e quem faz
-- CAS e o dono da sessao, nao esta funcao.

begin;

-- ===========================================================================
-- 1. Colunas e coerencia
-- ===========================================================================
alter table public.market_listings
  add column if not exists modo text not null default 'preco_fixo',
  add column if not exists expira_em timestamptz,
  add column if not exists lance_minimo bigint,
  add column if not exists incremento_minimo bigint;

alter table public.market_listings
  drop constraint if exists market_listings_modo_valido;
alter table public.market_listings
  add constraint market_listings_modo_valido check (modo in ('preco_fixo', 'leilao'));

-- Status novo: 'expirado' e diferente de 'cancelado'. O vendedor precisa saber
-- se o leilao acabou sem lance nenhum (o POKE voltou porque ninguem quis) ou se
-- ele proprio retirou o anuncio — sao duas historias diferentes, e reaproveitar
-- 'cancelado' apagaria essa diferenca pra sempre.
alter table public.market_listings
  drop constraint if exists market_listings_status_check;
alter table public.market_listings
  add constraint market_listings_status_check
  check (status in ('ativo', 'vendido', 'cancelado', 'expirado'));

-- Linha de leilao meio preenchida tem que ser IMPOSSIVEL, pelo mesmo motivo
-- que `market_listings_preco_coerente` existe: um leilao sem `expira_em` nunca
-- encerraria, e um sem incremento aceitaria lance de +1 pra sempre. Nenhum dos
-- dois daria erro — os dois ficariam quebrados em silencio.
alter table public.market_listings
  drop constraint if exists market_listings_leilao_coerente;
alter table public.market_listings
  add constraint market_listings_leilao_coerente check (
    case when modo = 'leilao' then
      apenas_oferta
      and expira_em is not null
      and lance_minimo is not null and lance_minimo > 0
      and incremento_minimo is not null and incremento_minimo > 0
    else
      expira_em is null and lance_minimo is null and incremento_minimo is null
    end
  );

-- Indice do cron: a varredura roda de minuto em minuto pra sempre, e sem ele
-- ela e um seq scan em `market_listings` 1.440 vezes por dia. Parcial pelo
-- mesmo criterio da consulta, entao ele fica minusculo (so leilao ativo).
create index if not exists market_listings_leiloes_a_vencer_idx
  on public.market_listings (expira_em)
  where status = 'ativo' and modo = 'leilao';

-- ===========================================================================
-- 1.5 A VITRINE PRECISA SER RECRIADA — `l.*` NUMA VIEW E CONGELADO
-- ===========================================================================
-- `mercado_anuncios_ativos` foi criada com `select l.*, ...`, e o Postgres
-- EXPANDE o `*` no momento da criacao e guarda a lista de colunas resultante.
-- Coluna adicionada na tabela depois NAO entra na view.
--
-- Sem este passo o leilao "funcionaria" e estaria quebrado do jeito mais chato
-- possivel: as RPCs gravariam `modo`/`expira_em`/`lance_minimo`/
-- `incremento_minimo` corretamente, a tela leria `undefined` nos quatro, e todo
-- leilao apareceria na vitrine como "somente lance" — sem cronometro, sem
-- minimo, sem botao de lance. Nada daria erro.
--
-- `drop` + `create` e nao `create or replace`: aquele exige que as colunas
-- existentes mantenham nome, tipo E ORDEM, e as novas so podem ir no fim.
-- Reproduzir a ordem exata da expansao original a mao (a tabela ganhou
-- `apenas_oferta` por `alter table` depois do `create table`, entao ela vem
-- DEPOIS de `buyer_id`) e o tipo de detalhe que se erra em silencio.
--
-- `drop` derruba os grants junto, entao eles sao refeitos abaixo — sem isso a
-- vitrine fica ilegivel pra `authenticated` e o Mercado abre vazio.
drop view if exists public.mercado_anuncios_ativos;
create view public.mercado_anuncios_ativos with (security_invoker = true) as
select l.*, t.trainer_name as vendedor,
  (select count(*) from public.market_offers o where o.listing_id = l.id and o.status = 'pendente')::int as ofertas,
  (select max(valor) from public.market_offers o where o.listing_id = l.id and o.status = 'pendente') as melhor_oferta
from public.market_listings l
join public.treinadores_publico t on t.user_id = l.seller_id
where l.status = 'ativo';

revoke all on public.mercado_anuncios_ativos from public;
grant select on public.mercado_anuncios_ativos to authenticated;

-- ===========================================================================
-- 2. criar_leilao
-- ===========================================================================
-- RPC PROPRIA, e nao parametros novos em `anunciar_poke`: aquela funcao tem
-- assinatura `(uuid, int, text, boolean)` com grant proprio, e acrescentar
-- argumentos cria um OVERLOAD — duas funcoes de mesmo nome, e o PostgREST passa
-- a responder erro de ambiguidade em vez de chamar qualquer uma. Trocar a
-- assinatura exigiria `drop`, que derruba o cliente ainda carregado no
-- navegador de quem esta jogando durante o deploy.
--
-- E o leilao tem parametros de verdade diferentes: nao tem preco, tem duracao,
-- lance minimo e incremento.
create or replace function public.criar_leilao(
  p_poke_id uuid,
  p_currency text,
  p_horas int,
  p_lance_minimo bigint,
  p_incremento_minimo bigint
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_poke public.pokemon_instances;
  v_currency text := case when p_currency = 'diamond' then 'diamond' else 'gold' end;
  v_iv_percent int;
  v_nome text;
  v_expira timestamptz;
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode='28000'; end if;

  -- Duracao FECHADA em tres valores (decidido com o usuario). Nao e uma faixa
  -- livre de propósito: leilao de 5 minutos e leilao de um mes sao dois
  -- problemas diferentes de moderacao, e nenhum dos dois foi pedido.
  if p_horas not in (6, 12, 24) then
    raise exception 'Duracao invalida — escolha 6, 12 ou 24 horas.';
  end if;
  if p_lance_minimo is null or p_lance_minimo <= 0 or p_lance_minimo > 100000000 then
    raise exception 'Lance minimo invalido.';
  end if;
  if p_incremento_minimo is null or p_incremento_minimo <= 0 or p_incremento_minimo > 100000000 then
    raise exception 'Incremento minimo invalido.';
  end if;

  v_expira := now() + make_interval(hours => p_horas);

  -- Mesmo UPDATE-com-returning de `anunciar_poke`: ele e o que garante numa
  -- operacao so que o POKE e do jogador, esta na mochila e nao esta travado.
  -- Ler-depois-escrever aqui abriria janela pra o mesmo POKE ir pra dois
  -- anuncios.
  update public.pokemon_instances set location='market', team_slot=null, updated_at=now()
    where id = p_poke_id and user_id = v_user_id and location = 'bag' and coalesce(locked,false) = false
    returning * into v_poke;
  if v_poke is null then
    raise exception 'POKE indisponivel — precisa estar na mochila e destravado.';
  end if;

  v_iv_percent := round((v_poke.iv_hp + v_poke.iv_atk_fis + v_poke.iv_atk_esp + v_poke.iv_def + v_poke.iv_def_esp + v_poke.iv_speed) / (31.0*6) * 100);

  insert into public.market_listings (
    seller_id, poke_uid, price, apenas_oferta, currency,
    species_id, level, rarity, is_shiny, iv_percent,
    modo, expira_em, lance_minimo, incremento_minimo
  )
  values (
    v_user_id, p_poke_id, null, true, v_currency,
    v_poke.species_id, v_poke.level, v_poke.rarity, v_poke.is_shiny, v_iv_percent,
    'leilao', v_expira, p_lance_minimo, p_incremento_minimo
  );

  select name into v_nome from public.species where id = v_poke.species_id;
  return jsonb_build_object('ok', true, 'expiraEm', v_expira, 'mensagem',
    format('%s em leilao por %s horas, a partir de %s.', coalesce(v_nome, v_poke.species_id), p_horas, p_lance_minimo));
end;
$$;
revoke all on function public.criar_leilao(uuid, text, int, bigint, bigint) from public;
grant execute on function public.criar_leilao(uuid, text, int, bigint, bigint) to authenticated;

-- ===========================================================================
-- 3. dar_lance
-- ===========================================================================
create or replace function public.dar_lance(p_anuncio_id uuid, p_valor bigint)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  -- Janela de anti-sniping. Um lance dentro dela empurra o fim pelo MESMO
  -- tanto, entao o ultimo lance sempre tem resposta possivel.
  c_anti_snipe constant interval := interval '30 seconds';
  v_user_id uuid := auth.uid();
  v_anuncio public.market_listings;
  v_lider public.market_offers;
  v_minimo bigint;
  v_minha public.market_offers;
  v_novo_fim timestamptz;
  v_esticou boolean := false;
  v_nome text;
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode='28000'; end if;
  if p_valor is null or p_valor <= 0 or p_valor > 100000000 then raise exception 'Valor de lance invalido.'; end if;

  -- PH-67: esta RPC DEBITA o ouro de quem chama, entao serializa contra o flush
  -- do proprio jogador. A devolucao ao lider anterior e incremento e nao precisa
  -- de lock (ver o cabecalho).
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

  -- `for update` no anuncio: dois lances simultaneos no mesmo leilao tem que
  -- ser serializados, senao os dois leem o mesmo lider e os dois "superam" o
  -- mesmo valor.
  select * into v_anuncio from public.market_listings where id = p_anuncio_id for update;
  if v_anuncio is null or v_anuncio.status != 'ativo' then
    raise exception 'Este leilao nao esta mais disponivel.';
  end if;
  if v_anuncio.modo != 'leilao' then
    raise exception 'Este anuncio nao e um leilao — use Ofertar.';
  end if;
  if v_anuncio.seller_id = v_user_id then
    raise exception 'Voce nao pode dar lance no proprio leilao.';
  end if;
  -- O relogio que vale e `expira_em`, e nao "o cron ainda nao rodou": senao o
  -- minuto entre a expiracao e a varredura seria janela pra lance fora de hora.
  if v_anuncio.expira_em <= now() then
    raise exception 'Este leilao ja encerrou.';
  end if;

  select * into v_lider from public.market_offers
    where listing_id = p_anuncio_id and status = 'pendente'
    order by valor desc, created_at asc
    limit 1
    for update;

  v_minimo := case when v_lider is null then v_anuncio.lance_minimo
                   else v_lider.valor + v_anuncio.incremento_minimo end;
  if p_valor < v_minimo then
    -- Frase e nao 502: limite de negocio conferido so no cliente vira erro cru
    -- do PostgREST, que a Edge nao repassa (regra critica do CLAUDE.md).
    raise exception 'Lance abaixo do minimo — precisa ser pelo menos %.', v_minimo;
  end if;

  -- Meu lance anterior (o indice unico parcial garante no maximo um): devolvido
  -- antes de debitar o novo, senao o jogador precisaria ter o dobro em caixa pra
  -- cobrir o proprio lance.
  select * into v_minha from public.market_offers
    where listing_id = p_anuncio_id and buyer_id = v_user_id and status = 'pendente'
    for update;
  if v_minha is not null then
    update public.market_offers set status='cancelada', resolved_at=now() where id = v_minha.id;
    if v_minha.currency = 'gold' then
      update public.players set gold = gold + v_minha.valor where user_id = v_user_id;
    else
      update public.players set diamonds = diamonds + v_minha.valor where user_id = v_user_id;
    end if;
  end if;

  if v_anuncio.currency = 'gold' then
    update public.players set gold = gold - p_valor where user_id = v_user_id and gold >= p_valor;
  else
    update public.players set diamonds = diamonds - p_valor where user_id = v_user_id and diamonds >= p_valor;
  end if;
  if not found then
    raise exception '%', case when v_anuncio.currency='gold' then 'Ouro insuficiente.' else 'Diamantes insuficientes.' end;
  end if;

  -- Lider anterior de OUTRA pessoa: escrow devolvido agora. So um jogador segura
  -- dinheiro por leilao (ver o cabecalho).
  if v_lider is not null and v_lider.buyer_id != v_user_id then
    update public.market_offers set status='recusada', resolved_at=now() where id = v_lider.id;
    if v_lider.currency = 'gold' then
      update public.players set gold = gold + v_lider.valor where user_id = v_lider.buyer_id;
    else
      update public.players set diamonds = diamonds + v_lider.valor where user_id = v_lider.buyer_id;
    end if;
  end if;

  insert into public.market_offers (listing_id, buyer_id, valor, currency)
  values (p_anuncio_id, v_user_id, p_valor, v_anuncio.currency);

  if v_anuncio.expira_em - now() <= c_anti_snipe then
    v_novo_fim := now() + c_anti_snipe;
    update public.market_listings set expira_em = v_novo_fim where id = p_anuncio_id;
    v_esticou := true;
  else
    v_novo_fim := v_anuncio.expira_em;
  end if;

  select name into v_nome from public.species where id = v_anuncio.species_id;
  return jsonb_build_object('ok', true, 'expiraEm', v_novo_fim, 'esticou', v_esticou, 'mensagem',
    case when v_esticou
      then format('Lance de %s em %s! O leilao foi estendido em 30s.', p_valor, coalesce(v_nome, v_anuncio.species_id))
      else format('Lance de %s em %s. O valor fica retido enquanto voce estiver na frente.', p_valor, coalesce(v_nome, v_anuncio.species_id))
    end);
end;
$$;
revoke all on function public.dar_lance(uuid, bigint) from public;
grant execute on function public.dar_lance(uuid, bigint) to authenticated;

-- ===========================================================================
-- 4. Guardas nas RPCs que existiam
-- ===========================================================================
-- `ofertar_no_anuncio` aceita qualquer anuncio `apenas_oferta`, e leilao E
-- `apenas_oferta`. Sem esta guarda o caminho antigo seria um DESVIO das regras
-- do leilao: daria pra ofertar 1 de ouro num leilao com incremento de 5.000,
-- sem passar pelo minimo, sem devolver o lider e sem esticar o relogio.
create or replace function public.ofertar_no_anuncio(p_anuncio_id uuid, p_valor bigint)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_anuncio public.market_listings;
  v_nome text;
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode='28000'; end if;
  if p_valor is null or p_valor <= 0 or p_valor > 100000000 then raise exception 'valor invalido'; end if;

  -- PH-67: esta RPC DEBITA o ouro de quem chama, e a versao vigente dela (da
  -- varredura de 2026-08-22) ja tinha o lock. Recria-la a partir da definicao
  -- de 2026-08-11 o REMOVERIA — foi o que a primeira versao deste arquivo fez,
  -- e `supabase/testes/advisoryLock.test.ts` pegou. E pra isso que aquele teste
  -- existe: "uma RPC nova sempre vai entrar por fora da varredura de ontem", e
  -- uma RPC RECRIADA de uma copia velha e o mesmo problema pela porta oposta.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

  select * into v_anuncio from public.market_listings where id = p_anuncio_id;
  if v_anuncio is null or v_anuncio.status != 'ativo' then
    raise exception 'Este anuncio nao esta mais disponivel.';
  end if;
  if not v_anuncio.apenas_oferta then
    raise exception 'Este anuncio tem preco fixo — use Comprar.';
  end if;
  if v_anuncio.modo = 'leilao' then
    raise exception 'Este anuncio e um leilao — use Dar lance.';
  end if;
  if v_anuncio.seller_id = v_user_id then
    raise exception 'Voce nao pode ofertar no proprio anuncio.';
  end if;

  if v_anuncio.currency = 'gold' then
    update public.players set gold = gold - p_valor where user_id = v_user_id and gold >= p_valor;
  else
    update public.players set diamonds = diamonds - p_valor where user_id = v_user_id and diamonds >= p_valor;
  end if;
  if not found then
    raise exception '%', case when v_anuncio.currency='gold' then 'Ouro insuficiente.' else 'Diamantes insuficientes.' end;
  end if;

  begin
    insert into public.market_offers (listing_id, buyer_id, valor, currency)
    values (p_anuncio_id, v_user_id, p_valor, v_anuncio.currency);
  exception when unique_violation then
    raise exception 'Voce ja tem um lance pendente neste anuncio — cancele antes de enviar outro.';
  end;

  select name into v_nome from public.species where id = v_anuncio.species_id;
  return jsonb_build_object('ok', true, 'mensagem', format('Oferta de %s enviada por %s. O valor fica retido ate o vendedor responder.', p_valor, coalesce(v_nome, v_anuncio.species_id)));
end;
$$;

-- `cancelar_oferta`: retratar lance de LEILAO e proibido. Ver o cabecalho — com
-- retratacao permitida, o padrao otimo e dar um lance altissimo pra afastar
-- todos e retratar perto do fim.
create or replace function public.cancelar_oferta(p_oferta_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_oferta public.market_offers;
  v_modo text;
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode='28000'; end if;

  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

  -- Le o modo ANTES de cancelar: com o update-returning primeiro, a oferta ja
  -- estaria cancelada quando o raise acontecesse — e `raise` desfaz a
  -- transacao, entao o resultado final seria o mesmo, mas o codigo passaria a
  -- depender do rollback pra ficar correto em vez de nao fazer a coisa errada.
  select l.modo into v_modo
    from public.market_offers o
    join public.market_listings l on l.id = o.listing_id
    where o.id = p_oferta_id and o.buyer_id = v_user_id and o.status = 'pendente';
  if v_modo = 'leilao' then
    raise exception 'Lance de leilao nao pode ser retirado — ele vale ate alguem cobrir.';
  end if;

  update public.market_offers set status='cancelada', resolved_at=now()
    where id = p_oferta_id and buyer_id = v_user_id and status = 'pendente'
    returning * into v_oferta;
  if v_oferta is null then raise exception 'oferta nao encontrada ou ja respondida'; end if;

  if v_oferta.currency = 'gold' then
    update public.players set gold = gold + v_oferta.valor where user_id = v_user_id;
  else
    update public.players set diamonds = diamonds + v_oferta.valor where user_id = v_user_id;
  end if;

  return jsonb_build_object('ok', true, 'mensagem', format('Oferta cancelada — %s devolvido(s).', v_oferta.valor));
end;
$$;

-- `cancelar_anuncio`: leilao COM lance nao pode ser retirado.
--
-- Decisao explicita, e nao efeito colateral: o vendedor que ve um lance alto e
-- cancela esta retratando uma venda ja comprometida. Devolver o escrow e
-- deixar cancelar seria o mesmo abuso do outro lado da mesa. Leilao SEM lance
-- cancela normalmente — ninguem se comprometeu com nada ainda.
create or replace function public.cancelar_anuncio(p_anuncio_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_anuncio public.market_listings;
  v_devolvidas int;
  v_modo text;
  v_lances int;
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode='28000'; end if;

  select modo, (select count(*) from public.market_offers o where o.listing_id = l.id and o.status = 'pendente')
    into v_modo, v_lances
    from public.market_listings l
    where l.id = p_anuncio_id and l.seller_id = v_user_id and l.status = 'ativo';
  if v_modo = 'leilao' and v_lances > 0 then
    raise exception 'Este leilao ja tem lance — nao da pra retirar. Ele encerra no horario anunciado.';
  end if;

  update public.market_listings set status='cancelado' where id = p_anuncio_id and seller_id = v_user_id and status = 'ativo'
    returning * into v_anuncio;
  if v_anuncio is null then raise exception 'anuncio nao encontrado ou ja encerrado'; end if;

  update public.pokemon_instances set location='bag', team_slot=null, updated_at=now() where id = v_anuncio.poke_uid;

  select public.recusar_ofertas_pendentes(p_anuncio_id, 'Anuncio retirado do Mercado') into v_devolvidas;

  return jsonb_build_object('ok', true, 'mensagem',
    case when v_devolvidas > 0
      then format('Anuncio cancelado — o POKE voltou pra sua mochila e %s oferta(s) foram devolvidas.', v_devolvidas)
      else 'Anuncio cancelado — o POKE voltou pra sua mochila.'
    end);
end;
$$;

-- ===========================================================================
-- 5. Encerramento — o job
-- ===========================================================================
create or replace function public.encerrar_leiloes_vencidos(p_limite int default 200)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_leilao record;
  v_vencedora public.market_offers;
  v_perdedora record;
  v_taxa bigint;
  v_nome text;
  v_encerrados int := 0;
  v_vendidos int := 0;
  v_sem_lance int := 0;
  v_devolvidos int := 0;
begin
  for v_leilao in
    select * from public.market_listings
    where modo = 'leilao' and status = 'ativo' and expira_em <= now()
    order by expira_em
    limit p_limite
    -- `skip locked`: um leilao que esta sendo travado por um `dar_lance` neste
    -- instante e pulado e sai na varredura seguinte, em vez de a execucao
    -- inteira esperar por ele.
    for update skip locked
  loop
    v_encerrados := v_encerrados + 1;

    select * into v_vencedora from public.market_offers
      where listing_id = v_leilao.id and status = 'pendente'
      -- Empate de valor decide pelo mais ANTIGO: quem chegou primeiro naquele
      -- preco. Sem o segundo critério a escolha seria a ordem que o Postgres
      -- resolvesse devolver, ou seja loteria.
      order by valor desc, created_at asc
      limit 1
      for update;

    if v_vencedora is null then
      -- Ninguem quis: o POKE volta pra mochila do vendedor. `expirado` e nao
      -- `cancelado` porque as duas coisas contam historias diferentes.
      update public.market_listings set status='expirado' where id = v_leilao.id;
      update public.pokemon_instances set location='bag', team_slot=null, updated_at=now()
        where id = v_leilao.poke_uid;
      v_sem_lance := v_sem_lance + 1;
      continue;
    end if;

    update public.market_offers set status='aceita', resolved_at=now() where id = v_vencedora.id;
    update public.market_listings set status='vendido', sold_at=now(), buyer_id=v_vencedora.buyer_id
      where id = v_leilao.id;
    update public.pokemon_instances set user_id=v_vencedora.buyer_id, location='bag', team_slot=null, updated_at=now()
      where id = v_leilao.poke_uid;

    -- O escrow do vencedor JA saiu do bolso dele quando o lance foi dado, entao
    -- aqui nao ha debito — so o credito liquido ao vendedor. Se houvesse debito,
    -- um vencedor que gastou o ouro no meio do leilao ficaria negativo.
    v_taxa := public.taxa_de_venda(v_vencedora.valor, v_vencedora.currency);
    if v_vencedora.currency = 'gold' then
      update public.players set gold = gold + (v_vencedora.valor - v_taxa) where user_id = v_leilao.seller_id;
    else
      update public.players set diamonds = diamonds + (v_vencedora.valor - v_taxa) where user_id = v_leilao.seller_id;
    end if;

    insert into public.market_trades (kind, species_id, quantity, unit_price, currency, buyer_id, seller_id, taxa)
    values ('poke', v_leilao.species_id, 1, v_vencedora.valor, v_vencedora.currency,
            v_vencedora.buyer_id, v_leilao.seller_id, v_taxa);

    -- Defensivo. Pelo desenho de escrow unico nao deve haver perdedor com valor
    -- retido aqui, mas o custo de varrer e zero e o custo de ERRAR e ouro preso
    -- pra sempre num jogador que nem sabe.
    --
    -- Nao reusa `recusar_ofertas_pendentes`: aquela funcao exige
    -- `auth.uid() = seller_id`, e esta roda pelo cron, sem sessao nenhuma.
    for v_perdedora in
      select * from public.market_offers
      where listing_id = v_leilao.id and status = 'pendente' and id != v_vencedora.id
      for update
    loop
      update public.market_offers set status='recusada', resolved_at=now() where id = v_perdedora.id;
      if v_perdedora.currency = 'gold' then
        update public.players set gold = gold + v_perdedora.valor where user_id = v_perdedora.buyer_id;
      else
        update public.players set diamonds = diamonds + v_perdedora.valor where user_id = v_perdedora.buyer_id;
      end if;
      v_devolvidos := v_devolvidos + 1;
    end loop;

    v_vendidos := v_vendidos + 1;
  end loop;

  return jsonb_build_object('encerrados', v_encerrados, 'vendidos', v_vendidos,
    'semLance', v_sem_lance, 'escrowDevolvido', v_devolvidos);
end;
$$;

-- NAO exposta ao cliente: quem encerra e o cron. Um jogador podendo disparar o
-- encerramento poderia forcar a liquidacao no instante que lhe convem.
revoke all on function public.encerrar_leiloes_vencidos(int) from public;

-- `if exists` antes do unschedule: em banco novo o job nao existe, e
-- `cron.unschedule` de nome inexistente LANCA — derrubaria a migration inteira.
-- Mesma armadilha que a migration do log-puller documenta.
--
-- Nome COM sufixo do schema: `cron.job` e um por banco, e os dois schemas
-- (dev e public) agendam o proprio job. Sem o sufixo, o segundo `schedule`
-- colidiria com o primeiro e um dos dois ambientes ficaria sem encerramento —
-- em silencio, porque o leilao continua aceitando lance normalmente e so nunca
-- termina.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'leiloes-encerrar') then
    perform cron.unschedule('leiloes-encerrar');
  end if;
end
$$;

select cron.schedule('leiloes-encerrar', '* * * * *', $$select public.encerrar_leiloes_vencidos();$$);

commit;
