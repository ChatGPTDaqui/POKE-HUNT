-- PH-128 -- a contagem de lances do leilao para de depender de quem esta olhando.
--
-- O DEFEITO, MEDIDO
-- -----------------
-- `mercado_anuncios_ativos` e `security_invoker = true` (roda com a permissao de
-- QUEM CHAMA) e calcula duas colunas agregando `market_offers`:
--
--   (select count(*) from market_offers o where o.listing_id = l.id and o.status = 'pendente') as ofertas
--   (select max(valor) from market_offers o where o.listing_id = l.id and o.status = 'pendente') as melhor_oferta
--
-- Mas a RLS de `market_offers` (correta, e que fica como esta) so libera duas
-- coisas: a oferta de quem a fez, e a oferta recebida por quem vende. Resultado:
-- o agregado conta o SUBCONJUNTO VISIVEL a quem chama e apresenta como total.
--
-- Reproduzido em `dev` em 2026-08-24, um leilao, mesmo instante, tres respostas
-- diferentes para a MESMA linha:
--
--   verdade (service_role): lance de 100 (recusada, foi coberta) + 250 (pendente)
--   vendedor              : ofertas=1  melhor_oferta=250   <- certo
--   quem deu 100 e foi coberto: ofertas=0  melhor_oferta=NULL  <- ve leilao vazio
--   quem deu 250 (lider)  : ofertas=1  melhor_oferta=250   <- certo por acaso, e o lance DELE
--
-- Um espectador que nunca deu lance ve 0/NULL igual ao segundo caso.
--
-- POR QUE ISSO NAO E COSMETICO
-- ----------------------------
-- 1. Quem foi coberto ve "nenhum lance" — a tela nao consegue nem dizer que ele
--    perdeu a lideranca.
-- 2. Quem chega ve leilao vazio e monta o lance a partir do minimo. `dar_lance`
--    confere o melhor lance REAL + incremento e recusa. A vitrine diz que 100
--    serve enquanto o piso de verdade e 260.
-- 3. Leilao e o unico lugar do jogo onde a contagem de interessados e a
--    informacao que decide quanto gastar.
--
-- Nao apareceu antes porque o vendedor ve o numero certo, e quem testa leilao
-- testa como vendedor.
--
-- O CONSERTO, E O QUE ELE NAO FAZ
-- -------------------------------
-- A view deixa de ser `security_invoker` e passa a rodar como dono, entao os
-- agregados enxergam todas as ofertas pendentes.
--
-- Isso NAO afrouxa `market_offers`: a view entrega `count` e `max`, nunca a
-- linha. `buyer_id` continua invisivel — quem deu lance e de quanto segue sendo
-- assunto de quem deu e de quem vende. Abrir a tabela linha a linha trocaria um
-- bug de contagem por um vazamento, e por isso nao foi o caminho.
--
-- E NAO amplia o que a view mostra de `market_listings`: ela filtra
-- `status = 'ativo'`, que e exatamente o conjunto que a policy "anuncio leitura
-- publica ativos" (`using (status = 'ativo')`) ja libera pra qualquer conta
-- autenticada. Como view de dono ela entrega o mesmo recorte, sem a RLS no
-- caminho.
--
-- A MESMA CLASSE NAS OUTRAS VIEWS: CONFERIDA, E SO ESTA
-- ----------------------------------------------------
-- `mercado_resumo_itens` agrega `market_orders`, cuja policy libera TODA linha
-- `status = 'ativa'` — e a view filtra por isso, entao o agregado ja e o total
-- de verdade. `mercado_historico_*` e `mercado_resumo_historico_*` agregam
-- `market_trades`, que tem leitura publica (`using (true)`). `mercado_ofertas_
-- recebidas` e por-vendedor de proposito. `market_offers` e a unica tabela
-- agregada por baixo de uma RLS restritiva.
--
-- AS COLUNAS SAO LISTADAS UMA POR UMA
-- -----------------------------------
-- Mesma disciplina do PH-105: a lista abaixo e identica ao que `l.*` expande
-- hoje (`database.types.ts` nao muda), e passa a ser explicita para que a
-- proxima coluna adicionada a `market_listings` nao entre na vitrine sozinha.

begin;

-- `drop` + `create`: a ordem de colunas de antes vinha da expansao de `l.*`, e
-- `create or replace view` exige a mesma ordem — que nao esta escrita em lugar
-- nenhum.
drop view if exists dev.mercado_anuncios_ativos;

create view dev.mercado_anuncios_ativos as
select
  l.id, l.seller_id, l.poke_uid,
  l.price, l.currency, l.status, l.apenas_oferta,
  l.species_id, l.level, l.rarity, l.is_shiny, l.iv_percent,
  l.modo, l.expira_em, l.lance_minimo, l.incremento_minimo,
  l.created_at, l.sold_at, l.buyer_id,
  t.trainer_name as vendedor,
  (select count(*) from dev.market_offers o
     where o.listing_id = l.id and o.status = 'pendente')::int as ofertas,
  (select max(valor) from dev.market_offers o
     where o.listing_id = l.id and o.status = 'pendente') as melhor_oferta
from dev.market_listings l
join dev.treinadores_publico t on t.user_id = l.seller_id
where l.status = 'ativo';

-- Explicito, e nao omitido: o default do Postgres e `false`, mas aqui isso E a
-- decisao. A view foi criada duas vezes com `security_invoker = true` (em
-- `20260811235800` e de novo em `20260823070000`, quando o leilao a recriou a
-- partir do texto antigo) — foi assim que o defeito nasceu e renasceu.
alter view dev.mercado_anuncios_ativos set (security_invoker = false);

revoke all on dev.mercado_anuncios_ativos from public;
grant select on dev.mercado_anuncios_ativos to authenticated;

commit;
