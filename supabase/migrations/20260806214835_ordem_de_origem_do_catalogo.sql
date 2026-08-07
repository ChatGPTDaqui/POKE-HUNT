-- A ORDEM DAS LINHAS da planilha e dado real, e o schema nao a capturava.
--
-- Descoberto ao escrever `generate-catalog.js`: o gerador precisa produzir os
-- *.generated.ts byte-a-byte identicos aos que a planilha produz, e a ordem
-- das chaves nesses arquivos vem da ordem das linhas na aba de origem. Sem
-- guarda-la, regenerar a partir do Postgres embaralha:
--
--   formulas       as 24 chaves saem agrupadas por assunto (dano, captura,
--                  economia, curvas de crescimento), nao alfabeticamente.
--   items          agrupados por tipo e por tier dentro do tipo
--                  (poke/great/ultra/premier, depois as pocoes...).
--   species_moves  202 pares (especie, nivel) tem mais de um golpe no mesmo
--                  nivel. O desempate e a ordem da planilha: `sort()` do JS e
--                  estavel, entao empate mantem a ordem de origem. Testado:
--                  desempatar por move_id alfabetico reproduz so 107 das 251
--                  especies (ex.: CYNDAQUIL e tackle@1 antes de leer@1).
--
-- Isto precisa entrar ANTES de a planilha ser aposentada — depois dela deixar
-- de ser a fonte, a ordem nao teria de onde voltar. Mesma classe da lacuna de
-- multi_hit/fixed_damage_mode corrigida na migration anterior.
--
-- NAO precisa de coluna: a ordem dos 17 tipos (linhas E colunas do
-- type_chart) ja existe em web/src/data/typeColors.ts, arquivo hand-authored
-- do jogo que sobrevive a aposentadoria — conferido, bate exatamente. Guardar
-- de novo no banco criaria uma segunda fonte de verdade pra mesma coisa.
--
-- A ordem das ESPECIES em pokes.generated.ts tambem nao precisa de coluna: e
-- derivada (iniciais, lendarios, especies das hunts na ordem das hunts, e
-- entao a expansao da cadeia evolutiva), e a curadoria que a produz continua
-- viva em sync-planilha.js.

alter table public.formulas add column if not exists sort_order int not null default 0;
alter table public.items add column if not exists sort_order int not null default 0;
alter table public.species_moves add column if not exists sort_order int not null default 0;

comment on column public.formulas.sort_order is
  'Ordem de origem na aba Formulas. Define a ordem das chaves no arquivo gerado.';
comment on column public.items.sort_order is
  'Ordem de origem na aba Itens. Stones (hand-authored) vem depois dos itens da planilha.';
comment on column public.species_moves.sort_order is
  'Ordem de origem na aba Movesets. Desempata golpes aprendidos no mesmo nivel.';
