-- Segundo (e ultimo) ajuste de chave em species_moves, tambem achado pelo diff
-- byte-a-byte: a planilha tem UMA linha literalmente repetida —
-- SEAKING | TAIL_WHIP | nivel 1 aparece duas vezes.
--
-- O pipeline nao deduplica, entao `species.abilities` do Seaking traz Tail Whip
-- duas vezes no arquivo gerado. Efeito real no jogo: nenhum no combate
-- (progressionSystem ja ignora golpe repetido via `unlockedAbilities.includes`),
-- so a aba "Golpes" do perfil lista a linha duas vezes. Parece erro de digitacao
-- na planilha — mas corrigi-lo aqui embutiria uma mudanca de jogo dentro da
-- migracao de fonte, que e exatamente o que a verificacao byte-a-byte existe pra
-- impedir. Fica preservado; quem quiser limpar faz depois, como commit proprio
-- e visivel.
--
-- A chave passa a ser (especie, posicao): o moveset e uma LISTA ORDENADA, e a
-- posicao dentro dela e a identidade real de cada linha. Isso acomoda tanto o
-- mesmo golpe em dois niveis (migration anterior) quanto a linha repetida, sem
-- precisar de coluna sintetica.

alter table public.species_moves drop constraint species_moves_pkey;
alter table public.species_moves add primary key (species_id, sort_order);

comment on column public.species_moves.sort_order is
  'Posicao no moveset da especie (0-based) — junto com species_id, e a chave primaria. Reproduz o array `abilities` exato ao ordenar por ela.';
