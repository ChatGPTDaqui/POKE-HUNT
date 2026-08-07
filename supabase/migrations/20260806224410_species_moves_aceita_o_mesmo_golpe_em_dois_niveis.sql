-- FIX (perda de dado, achado pelo diff byte-a-byte de `generate-catalog.js`):
-- a chave primaria (species_id, move_id) descartava 162 das 2215 linhas da aba
-- Movesets, em silencio.
--
-- O caso real: uma forma evoluida aprende o mesmo golpe DUAS vezes — no nivel 1
-- (herdado da pre-evolucao, pra nao nascer sem golpe ao evoluir) e de novo no
-- nivel em que a especie o aprenderia sozinha. Ex.: QUILAVA|SMOKESCREEN nos
-- niveis 1 e 6; TYPHLOSION|EMBER nos niveis 1 e 12; ALAKAZAM|CONFUSION nos
-- niveis 1 e 16.
--
-- Isso nao e ruido: `species.abilities` no arquivo gerado contem as duas
-- entradas, e ProgressionSystem re-percorre esse array a cada level-up. Com a
-- PK antiga, `pokes.generated.ts` regenerado do Postgres saia 10KB menor que o
-- da planilha — 640 linhas de golpe a menos.
--
-- O par (especie, golpe) continua unico POR NIVEL; o que passa a ser permitido
-- e a mesma dupla em niveis diferentes.

alter table public.species_moves drop constraint species_moves_pkey;
alter table public.species_moves add primary key (species_id, move_id, level_req);

comment on table public.species_moves is
  'Moveset por especie. Uma especie pode aprender o MESMO golpe em mais de um nivel (forma evoluida que herda o golpe no nivel 1 e o reaprende depois) — por isso o nivel faz parte da chave.';
