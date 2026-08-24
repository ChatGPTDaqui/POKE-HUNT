-- PH-104 — o escrow do leilao volta pra quem foi coberto.
--
-- Gemeo public: `20260823100000_escrow_de_leilao_devolvido_public.sql`.
--
-- ===========================================================================
-- `record IS NOT NULL` NAO E A NEGACAO DE `record IS NULL`
-- ===========================================================================
-- As duas devolucoes de escrow de `dar_lance` (PH-101) nunca executaram. As
-- guardas eram:
--
--   if v_minha is not null then                                    -- meu lance anterior
--   if v_lider is not null and v_lider.buyer_id != v_user_id then  -- lider anterior
--
-- `v_minha` e `v_lider` sao do tipo `market_offers`, ou seja valor COMPOSTO. Pra
-- valor composto o Postgres define:
--
--   `IS NULL`     -> verdadeiro so se TODOS os campos sao nulos
--   `IS NOT NULL` -> verdadeiro so se TODOS os campos sao NAO-nulos
--
-- Nao sao negacao um do outro: uma linha com UM campo nulo e falsa nas duas.
-- Uma oferta pendente tem `resolved_at` nulo, entao as duas guardas eram
-- sempre falsas e nenhum ouro voltava.
--
-- O `case when v_lider is null` do calculo do minimo acertava por sorte: "nao
-- achou linha" e justamente o caso todos-nulos, onde `IS NULL` da certo. Ele
-- vai junto na correcao pra nao deixar no arquivo um acerto acidental que a
-- proxima leitura vai tomar como padrao bom.
--
-- Nao usei `if found`: entre o `select into v_lider` e o ponto onde a
-- devolucao acontece ha um segundo `select into` (o de `v_minha`), e ele
-- reescreve `FOUND`. `v_lider.id is not null` le a chave primaria, que e nula
-- exatamente quando o `select into` nao achou linha, e nao depende de nenhum
-- comando no meio.
--
-- ===========================================================================
-- O SINTOMA ERA PIOR QUE OURO PARADO
-- ===========================================================================
-- A oferta do jogador coberto ficava `pendente` pra sempre, e o indice unico
-- parcial `market_offers_uma_pendente (listing_id, buyer_id) where status =
-- 'pendente'` barrava o lance seguinte DELE naquele leilao. Ser coberto uma vez
-- tirava o jogador do leilao de vez — guerra de lances, que e o proposito da
-- feature, nao funcionava.
--
-- E o erro que chegava era a string crua do Postgres:
--
--   23505 duplicate key value violates unique constraint "market_offers_uma_pendente"
--
-- que e exatamente o que a regra critica do projeto proibe. `dar_lance` ganha o
-- mesmo `exception when unique_violation` que `ofertar_no_anuncio` ja tinha.
-- Com a devolucao consertada ele nao deve mais disparar; fica porque duas
-- transacoes concorrentes do MESMO jogador ainda podem colidir ali, e nesse
-- caso a diferenca e entre uma frase e um dump de constraint.
--
-- O ouro nunca se perdia: a varredura defensiva de `encerrar_leiloes_vencidos`
-- devolve todo `pendente` que nao e o vencedor, e ela funciona. O prejuizo era
-- ficar sem o ouro e fora do leilao por ate 24 horas.

begin;

create or replace function dev.dar_lance(p_anuncio_id uuid, p_valor bigint)
returns jsonb
language plpgsql security definer set search_path = dev, public
as $$
declare
  -- Janela de anti-sniping. Um lance dentro dela empurra o fim pelo MESMO
  -- tanto, entao o ultimo lance sempre tem resposta possivel.
  c_anti_snipe constant interval := interval '30 seconds';
  v_user_id uuid := auth.uid();
  v_anuncio dev.market_listings;
  v_lider dev.market_offers;
  v_minimo bigint;
  v_minha dev.market_offers;
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
  select * into v_anuncio from dev.market_listings where id = p_anuncio_id for update;
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

  select * into v_lider from dev.market_offers
    where listing_id = p_anuncio_id and status = 'pendente'
    order by valor desc, created_at asc
    limit 1
    for update;

  -- `v_lider.id is null` e nao `v_lider is null`: ver o cabecalho. Aqui as duas
  -- formas dariam o mesmo resultado, mas deixar a forma frouxa no arquivo e
  -- convidar a copia dela pra um lugar onde ela erra.
  v_minimo := case when v_lider.id is null then v_anuncio.lance_minimo
                   else v_lider.valor + v_anuncio.incremento_minimo end;
  if p_valor < v_minimo then
    -- Frase e nao 502: limite de negocio conferido so no cliente vira erro cru
    -- do PostgREST, que a Edge nao repassa (regra critica do CLAUDE.md).
    raise exception 'Lance abaixo do minimo — precisa ser pelo menos %.', v_minimo;
  end if;

  -- Meu lance anterior (o indice unico parcial garante no maximo um): devolvido
  -- antes de debitar o novo, senao o jogador precisaria ter o dobro em caixa pra
  -- cobrir o proprio lance.
  select * into v_minha from dev.market_offers
    where listing_id = p_anuncio_id and buyer_id = v_user_id and status = 'pendente'
    for update;
  if v_minha.id is not null then
    update dev.market_offers set status='cancelada', resolved_at=now() where id = v_minha.id;
    if v_minha.currency = 'gold' then
      update dev.players set gold = gold + v_minha.valor where user_id = v_user_id;
    else
      update dev.players set diamonds = diamonds + v_minha.valor where user_id = v_user_id;
    end if;
  end if;

  if v_anuncio.currency = 'gold' then
    update dev.players set gold = gold - p_valor where user_id = v_user_id and gold >= p_valor;
  else
    update dev.players set diamonds = diamonds - p_valor where user_id = v_user_id and diamonds >= p_valor;
  end if;
  if not found then
    raise exception '%', case when v_anuncio.currency='gold' then 'Ouro insuficiente.' else 'Diamantes insuficientes.' end;
  end if;

  -- Lider anterior de OUTRA pessoa: escrow devolvido agora. So um jogador segura
  -- dinheiro por leilao (ver o cabecalho).
  if v_lider.id is not null and v_lider.buyer_id != v_user_id then
    update dev.market_offers set status='recusada', resolved_at=now() where id = v_lider.id;
    if v_lider.currency = 'gold' then
      update dev.players set gold = gold + v_lider.valor where user_id = v_lider.buyer_id;
    else
      update dev.players set diamonds = diamonds + v_lider.valor where user_id = v_lider.buyer_id;
    end if;
  end if;

  -- Com a devolucao acima funcionando, a oferta anterior deste jogador ja foi
  -- `cancelada` e o indice unico parcial nao alcanca mais este insert. O
  -- `exception` fica pro que sobra: duas transacoes do MESMO jogador entrando
  -- juntas. Mesma postura de `ofertar_no_anuncio`.
  begin
    insert into dev.market_offers (listing_id, buyer_id, valor, currency)
    values (p_anuncio_id, v_user_id, p_valor, v_anuncio.currency);
  exception when unique_violation then
    raise exception 'Voce ja tem um lance pendente neste leilao — espere a resposta antes de enviar outro.';
  end;

  if v_anuncio.expira_em - now() <= c_anti_snipe then
    v_novo_fim := now() + c_anti_snipe;
    update dev.market_listings set expira_em = v_novo_fim where id = p_anuncio_id;
    v_esticou := true;
  else
    v_novo_fim := v_anuncio.expira_em;
  end if;

  select name into v_nome from dev.species where id = v_anuncio.species_id;
  return jsonb_build_object('ok', true, 'expiraEm', v_novo_fim, 'esticou', v_esticou, 'mensagem',
    case when v_esticou
      then format('Lance de %s em %s! O leilao foi estendido em 30s.', p_valor, coalesce(v_nome, v_anuncio.species_id))
      else format('Lance de %s em %s. O valor fica retido enquanto voce estiver na frente.', p_valor, coalesce(v_nome, v_anuncio.species_id))
    end);
end;
$$;

-- `create or replace` nao mexe em grant, mas repetir aqui e barato e deixa o
-- arquivo autossuficiente se alguem replicar o schema a partir dele.
revoke all on function dev.dar_lance(uuid, bigint) from public;
grant execute on function dev.dar_lance(uuid, bigint) to authenticated;

commit;
