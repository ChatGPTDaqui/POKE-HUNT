-- PH-105 -- POKE de terceiro sai do alcance de quem nao e o dono.
--
-- O FURO
-- ------
-- `20260812180000_porta_rpc_everything_pra_public.sql` criou:
--
--   create policy "pokemon leitura publica" on public.pokemon_instances
--     for select to authenticated using (true);
--
-- O comentario de la explicava o motivo: "linha inteira publica, mesmo
-- raciocinio do ranking.ts original (nao guarda nada privado alem do
-- user_id)". Era verdade naquele schema. Depois disso a tabela ganhou IV por
-- atributo, `nature`, `trait`, `locked` e `original_trainer` -- ou seja,
-- exatamente o que da vantagem de negociacao num jogo com Mercado entre
-- jogadores. Confirmado ao vivo em 2026-08-24 contra `public`: um GET em
-- `pokemon_instances?select=*&user_id=neq.<meu_id>` com token de conta comum
-- devolve a linha inteira de qualquer outro jogador.
--
-- A policy sai. `jogador le os proprios pokemon` (que ja existe desde
-- `20260807030000_cliente_perde_a_escrita.sql`) passa a ser a unica leitura de
-- jogador, e `admin reads all` continua intacta.
--
-- O QUE DEPENDIA DA POLICY FROUXA -- E O QUE NAO
-- ----------------------------------------------
-- Varredura feita antes de fechar:
--
--   * `ranking_pokemon` -- DEPENDIA. E `security_invoker = true`, ou seja roda
--     com a permissao de quem chama; sem a policy frouxa o ranking voltaria
--     vazio. Refeita abaixo.
--   * `treinadores_publico` -- nao le esta tabela (le `players`), e nao e
--     `security_invoker`.
--   * as views do Mercado (`mercado_anuncios_ativos`, `mercado_*_historico_*`,
--     `mercado_resumo_*`, `mercado_ofertas_recebidas`) -- NAO leem
--     `pokemon_instances`. A vitrine mostra especie/nivel/IV%/shiny/raridade
--     das colunas de SNAPSHOT de `market_listings`, gravadas no anuncio. A
--     vitrine nao quebra.
--   * as 40+ RPCs que tocam POKE (`anunciar_poke`, `criar_leilao`,
--     `comprar_anuncio`, `amigos_detalhados`, ...) -- todas `security
--     definer`, rodam como dono e nao dependem de policy.
--   * `authority/` e a Edge Function -- falam PostgREST com `service_role`,
--     que ignora RLS por completo.
--   * o unico acesso direto do cliente a `pokemon_instances` por id
--     (`src/data/remote/mercadoRpc.ts`, refetch pos-anuncio) le POKE do
--     PROPRIO jogador -- coberto pela policy do dono.
--
-- POR QUE O RANKING PRECISA SER LIMITADO, E NAO SO "RODAR COMO DONO"
-- -----------------------------------------------------------------
-- Tirar `security_invoker` de `ranking_pokemon` sem mais nada NAO conserta
-- nada: a view era `select pi.*` da tabela inteira, entao rodando como dono
-- ela viraria um sinonimo da tabela sem RLS -- o mesmo vazamento, com outro
-- nome. `ranking_pokemon?user_id=eq.<alvo>&select=*` traria tudo de volta.
--
-- Entao a view passa a MATERIALIZAR o recorte que o ranking mostra: o top 50
-- de cada um dos 7 criterios que a tela oferece (nivel + os 6 atributos, ver
-- `COLUNA_POR_CRITERIO` em `src/data/remote/rankingRpc.ts`). O conjunto fica em
-- no maximo 350 linhas, e nenhum filtro do PostgREST alcanca linha de fora
-- dele. O POKE que aparece no ranking continua abrindo a ficha completa ao
-- clique -- isso e feature ("o POKE de outro jogador abre exatamente o mesmo
-- cartao", RankingMenu.tsx), e agora vale so pra quem esta no ranking de
-- verdade.
--
-- O `order by ... limit 50` do cliente sobre este conjunto devolve exatamente
-- as mesmas 50 linhas de antes: uma linha de fora do top 50 de um criterio nao
-- pode ter valor maior que as 50 que estao dentro dele.
--
-- Custo: 7 ordenacoes por leitura em vez de 1. E ordenacao sobre a mesma
-- tabela que o cliente ja ordenava, a tela cacheia por `staleTime`, e a
-- alternativa (uma RPC `security definer` com o criterio por parametro) mudaria
-- o contrato do cliente e o arquivo de types -- decisao separada, nao deste
-- conserto de seguranca.
--
-- AS COLUNAS SAO LISTADAS UMA POR UMA, DE PROPOSITO
-- -------------------------------------------------
-- A lista abaixo e exatamente a que a view ja expunha: `select pi.*` foi
-- CONGELADO na criacao (2026-08-12), entao `nature`, `trait`, `status`,
-- `status_turns` e `active_abilities`, adicionadas depois, nunca entraram nela.
-- Listar explicitamente mantem `database.types.ts` sem mudanca nenhuma E
-- fecha a porta pela qual o vazamento cresceu: a proxima coluna adicionada a
-- `pokemon_instances` nao vira publica sozinha.

begin;

drop policy if exists "pokemon leitura publica" on public.pokemon_instances;

-- Recriada explicitamente em vez de assumida: se por algum motivo ela nao
-- existir neste schema, derrubar a frouxa sem esta aqui trancaria o jogador
-- fora dos proprios POKE.
drop policy if exists "jogador le os proprios pokemon" on public.pokemon_instances;
create policy "jogador le os proprios pokemon" on public.pokemon_instances
  for select to authenticated using ((select auth.uid()) = user_id);

-- `drop` + `create`, e nao `create or replace`: a lista de colunas de antes
-- vinha da expansao de `pi.*`, e `create or replace view` exige a mesma ordem
-- de colunas -- ordem que nao esta escrita em lugar nenhum.
drop view if exists public.ranking_pokemon;

create view public.ranking_pokemon as
with elegivel as (
  select pi.id, pi.level,
         pi.stat_hp, pi.stat_atk_fis, pi.stat_atk_esp,
         pi.stat_def, pi.stat_def_esp, pi.stat_speed
  from public.pokemon_instances pi
  -- O join entra JA no recorte, e nao so no fim: POKE de linha orfa (sem
  -- `players`) consumiria uma vaga do top 50 e depois cairia no join, e o
  -- ranking mostraria 49.
  join public.treinadores_publico t on t.user_id = pi.user_id
),
top as (
      select id from (select id from elegivel order by level         desc nulls last limit 50) t_level
  union select id from (select id from elegivel order by stat_hp      desc nulls last limit 50) t_hp
  union select id from (select id from elegivel order by stat_atk_fis desc nulls last limit 50) t_atk_fis
  union select id from (select id from elegivel order by stat_atk_esp desc nulls last limit 50) t_atk_esp
  union select id from (select id from elegivel order by stat_def     desc nulls last limit 50) t_def
  union select id from (select id from elegivel order by stat_def_esp desc nulls last limit 50) t_def_esp
  union select id from (select id from elegivel order by stat_speed   desc nulls last limit 50) t_speed
)
select
  pi.id, pi.user_id, pi.species_id, pi.level, pi.exp, pi.hp,
  pi.is_shiny, pi.rarity,
  pi.iv_hp, pi.iv_atk_fis, pi.iv_atk_esp, pi.iv_def, pi.iv_def_esp, pi.iv_speed,
  pi.stat_hp, pi.stat_atk_fis, pi.stat_atk_esp, pi.stat_def, pi.stat_def_esp, pi.stat_speed,
  pi.unlocked_abilities, pi.disabled_abilities,
  pi.locked, pi.location, pi.team_slot,
  pi.original_trainer, pi.created_at, pi.updated_at,
  t.trainer_name as treinador
from public.pokemon_instances pi
join top on top.id = pi.id
join public.treinadores_publico t on t.user_id = pi.user_id;

-- Sem `security_invoker`: a view roda como dono, que e o que a deixa ler linha
-- de outro jogador agora que a tabela esta fechada. O recorte acima e o que
-- limita o que ela entrega. Explicito em vez de omitido -- o default do
-- Postgres e `false`, mas aqui isso E a decisao, nao um descuido.
alter view public.ranking_pokemon set (security_invoker = false);

revoke all on public.ranking_pokemon from public;
grant select on public.ranking_pokemon to authenticated;

commit;
