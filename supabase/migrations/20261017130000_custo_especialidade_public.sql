-- PH-246 — o custo em Stone da especialidade passa a escalar com a OFERTA
-- de Stone de cada tipo.
--
-- O QUE ESTAVA QUEBRADO: o custo era um array unico (15/35/70/130/220) pros 18
-- tipos, mas a Stone so cai de POKE daquele tipo e os tipos nao aparecem na
-- mesma frequencia. Medido em 28/08, os abates pra fechar as duas trilhas iam
-- de 18.800 (FIRE/WATER/ELECTRIC/PSYCHIC) a 162.933 (STEEL) — nove vezes de
-- diferenca. E FLYING era literalmente incompravel: nenhuma especie do
-- catalogo tem FLYING como tipo primario, o drop so olhava o primario, e a
-- Pedra FLYING nao caia de lugar nenhum enquanto a tela anunciava o preco dos
-- 10 niveis.
--
-- A correcao tem duas metades. A outra esta no motor: awardKillLoot passa a
-- sortear entre tipo primario e secundario, o que da fonte ao FLYING. Esta
-- aqui iguala o ESFORCO — o custo de cada tipo sai de um alvo unico de abates
-- multiplicado pela oferta medida daquele tipo.
--
-- Gerado por scripts/gerar-custo-de-especialidade.ts, o mesmo laco que emite
-- src/data/generated/custoEspecialidade.generated.ts. Um teste reprova se os
-- dois divergirem — a licao de PH-245, onde duas derivacoes da mesma coisa
-- sairam de sincronia em producao.
begin;

-- ESPECIALIDADE COMO MISSAO (17/10/2026). Ate o nivel 10 (eram 5), e cada nivel
-- pede os requisitos de `especialidade_missao`, conferidos pelo MESMO
-- avaliador das conquistas (`conquista_valor` / `conquista_alvo`). A tabela
-- e regerada inteira por esta migration a partir de
-- src/data/especialidadeMissoes.ts — `especialidadeMissoes.test.ts` reprova
-- se os dois divergirem.
alter table public.player_especialidades
  drop constraint if exists player_especialidades_dano_nivel_check,
  drop constraint if exists player_especialidades_defesa_nivel_check;
alter table public.player_especialidades
  add constraint player_especialidades_dano_nivel_check check (dano_nivel between 0 and 10),
  add constraint player_especialidades_defesa_nivel_check check (defesa_nivel between 0 and 10);

create table if not exists public.especialidade_missao (
  tipo text not null,
  trilha text not null check (trilha in ('dano', 'defesa')),
  nivel smallint not null check (nivel between 1 and 10),
  requisitos jsonb not null,
  primary key (tipo, trilha, nivel)
);
alter table public.especialidade_missao enable row level security;
drop policy if exists "missao leitura publica" on public.especialidade_missao;
create policy "missao leitura publica" on public.especialidade_missao for select to authenticated using (true);
grant select on public.especialidade_missao to authenticated;

delete from public.especialidade_missao;
insert into public.especialidade_missao (tipo, trilha, nivel, requisitos) values
  ('NORMAL'::text, 'dano', 1, '[{"regra":{"t":"abates","tipo":"NORMAL","alvo":100},"texto":"Derrotar 100 POKEs NORMAL"}]'::jsonb),
  ('NORMAL'::text, 'dano', 2, '[{"regra":{"t":"abates","tipo":"NORMAL","alvo":300},"texto":"Derrotar 300 POKEs NORMAL"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"NORMAL"},"alvo":3},"texto":"Ter 3 espécies NORMAL diferentes capturadas por você"}]'::jsonb),
  ('NORMAL'::text, 'dano', 3, '[{"regra":{"t":"abates","tipo":"NORMAL","alvo":600},"texto":"Derrotar 600 POKEs NORMAL"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"campo_aberto","alvo":3},"texto":"Limpar o estágio 3 do Campo Aberto"}]'::jsonb),
  ('NORMAL'::text, 'dano', 4, '[{"regra":{"t":"abates","tipo":"NORMAL","alvo":1000},"texto":"Derrotar 1.000 POKEs NORMAL"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"NORMAL"},"alvo":5},"texto":"Ter 5 espécies NORMAL diferentes capturadas por você"}]'::jsonb),
  ('NORMAL'::text, 'dano', 5, '[{"regra":{"t":"abates","tipo":"NORMAL","alvo":1600},"texto":"Derrotar 1.600 POKEs NORMAL"},{"regra":{"t":"posse","f":{"tipo":"NORMAL","nivel_min":40},"alvo":1},"texto":"Ter um POKE NORMAL capturado por você no Lv 40"}]'::jsonb),
  ('NORMAL'::text, 'dano', 6, '[{"regra":{"t":"abates","tipo":"NORMAL","alvo":2400},"texto":"Derrotar 2.400 POKEs NORMAL"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"campo_aberto","alvo":6},"texto":"Limpar o estágio 6 do Campo Aberto"}]'::jsonb),
  ('NORMAL'::text, 'dano', 7, '[{"regra":{"t":"abates","tipo":"NORMAL","alvo":3500},"texto":"Derrotar 3.500 POKEs NORMAL"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"NORMAL"},"alvo":8},"texto":"Ter 8 espécies NORMAL diferentes capturadas por você"}]'::jsonb),
  ('NORMAL'::text, 'dano', 8, '[{"regra":{"t":"abates","tipo":"NORMAL","alvo":5000},"texto":"Derrotar 5.000 POKEs NORMAL"},{"regra":{"t":"posse","f":{"tipo":"NORMAL","nivel_min":60},"alvo":1},"texto":"Ter um POKE NORMAL capturado por você no Lv 60"}]'::jsonb),
  ('NORMAL'::text, 'dano', 9, '[{"regra":{"t":"abates","tipo":"NORMAL","alvo":7000},"texto":"Derrotar 7.000 POKEs NORMAL"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"campo_aberto","alvo":9},"texto":"Limpar o estágio 9 do Campo Aberto"}]'::jsonb),
  ('NORMAL'::text, 'dano', 10, '[{"regra":{"t":"abates","tipo":"NORMAL","alvo":10000},"texto":"Derrotar 10.000 POKEs NORMAL"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"campo_aberto","alvo":10},"texto":"Limpar o estágio 10 do Campo Aberto"},{"regra":{"t":"posse","f":{"tipo":"NORMAL","nivel_min":80},"alvo":1},"texto":"Ter um POKE NORMAL capturado por você no Lv 80"}]'::jsonb),
  ('NORMAL'::text, 'defesa', 1, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:NORMAL","alvo":1800},"texto":"Caçar 30 min com um POKE NORMAL em campo"}]'::jsonb),
  ('NORMAL'::text, 'defesa', 2, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:NORMAL","alvo":3600},"texto":"Caçar 1 h com um POKE NORMAL em campo"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"NORMAL"},"alvo":3},"texto":"Ter 3 espécies NORMAL diferentes capturadas por você"}]'::jsonb),
  ('NORMAL'::text, 'defesa', 3, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:NORMAL","alvo":7200},"texto":"Caçar 2 h com um POKE NORMAL em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"campo_aberto","alvo":3},"texto":"Limpar o estágio 3 do Campo Aberto"}]'::jsonb),
  ('NORMAL'::text, 'defesa', 4, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:NORMAL","alvo":14400},"texto":"Caçar 4 h com um POKE NORMAL em campo"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"NORMAL"},"alvo":5},"texto":"Ter 5 espécies NORMAL diferentes capturadas por você"}]'::jsonb),
  ('NORMAL'::text, 'defesa', 5, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:NORMAL","alvo":21600},"texto":"Caçar 6 h com um POKE NORMAL em campo"},{"regra":{"t":"posse","f":{"tipo":"NORMAL","nivel_min":40},"alvo":1},"texto":"Ter um POKE NORMAL capturado por você no Lv 40"}]'::jsonb),
  ('NORMAL'::text, 'defesa', 6, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:NORMAL","alvo":36000},"texto":"Caçar 10 h com um POKE NORMAL em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"campo_aberto","alvo":6},"texto":"Limpar o estágio 6 do Campo Aberto"}]'::jsonb),
  ('NORMAL'::text, 'defesa', 7, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:NORMAL","alvo":54000},"texto":"Caçar 15 h com um POKE NORMAL em campo"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"NORMAL"},"alvo":8},"texto":"Ter 8 espécies NORMAL diferentes capturadas por você"}]'::jsonb),
  ('NORMAL'::text, 'defesa', 8, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:NORMAL","alvo":72000},"texto":"Caçar 20 h com um POKE NORMAL em campo"},{"regra":{"t":"posse","f":{"tipo":"NORMAL","nivel_min":60},"alvo":1},"texto":"Ter um POKE NORMAL capturado por você no Lv 60"}]'::jsonb),
  ('NORMAL'::text, 'defesa', 9, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:NORMAL","alvo":108000},"texto":"Caçar 30 h com um POKE NORMAL em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"campo_aberto","alvo":9},"texto":"Limpar o estágio 9 do Campo Aberto"}]'::jsonb),
  ('NORMAL'::text, 'defesa', 10, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:NORMAL","alvo":144000},"texto":"Caçar 40 h com um POKE NORMAL em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"campo_aberto","alvo":10},"texto":"Limpar o estágio 10 do Campo Aberto"},{"regra":{"t":"posse","f":{"tipo":"NORMAL","nivel_min":80},"alvo":1},"texto":"Ter um POKE NORMAL capturado por você no Lv 80"}]'::jsonb),
  ('FIRE'::text, 'dano', 1, '[{"regra":{"t":"abates","tipo":"FIRE","alvo":100},"texto":"Derrotar 100 POKEs FIRE"}]'::jsonb),
  ('FIRE'::text, 'dano', 2, '[{"regra":{"t":"abates","tipo":"FIRE","alvo":300},"texto":"Derrotar 300 POKEs FIRE"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"FIRE"},"alvo":3},"texto":"Ter 3 espécies FIRE diferentes capturadas por você"}]'::jsonb),
  ('FIRE'::text, 'dano', 3, '[{"regra":{"t":"abates","tipo":"FIRE","alvo":600},"texto":"Derrotar 600 POKEs FIRE"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"igneo","alvo":3},"texto":"Limpar o estágio 3 do Ígneo"}]'::jsonb),
  ('FIRE'::text, 'dano', 4, '[{"regra":{"t":"abates","tipo":"FIRE","alvo":1000},"texto":"Derrotar 1.000 POKEs FIRE"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"FIRE"},"alvo":5},"texto":"Ter 5 espécies FIRE diferentes capturadas por você"}]'::jsonb),
  ('FIRE'::text, 'dano', 5, '[{"regra":{"t":"abates","tipo":"FIRE","alvo":1600},"texto":"Derrotar 1.600 POKEs FIRE"},{"regra":{"t":"posse","f":{"tipo":"FIRE","nivel_min":40},"alvo":1},"texto":"Ter um POKE FIRE capturado por você no Lv 40"}]'::jsonb),
  ('FIRE'::text, 'dano', 6, '[{"regra":{"t":"abates","tipo":"FIRE","alvo":2400},"texto":"Derrotar 2.400 POKEs FIRE"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"igneo","alvo":6},"texto":"Limpar o estágio 6 do Ígneo"}]'::jsonb),
  ('FIRE'::text, 'dano', 7, '[{"regra":{"t":"abates","tipo":"FIRE","alvo":3500},"texto":"Derrotar 3.500 POKEs FIRE"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"FIRE"},"alvo":8},"texto":"Ter 8 espécies FIRE diferentes capturadas por você"}]'::jsonb),
  ('FIRE'::text, 'dano', 8, '[{"regra":{"t":"abates","tipo":"FIRE","alvo":5000},"texto":"Derrotar 5.000 POKEs FIRE"},{"regra":{"t":"posse","f":{"tipo":"FIRE","nivel_min":60},"alvo":1},"texto":"Ter um POKE FIRE capturado por você no Lv 60"}]'::jsonb),
  ('FIRE'::text, 'dano', 9, '[{"regra":{"t":"abates","tipo":"FIRE","alvo":7000},"texto":"Derrotar 7.000 POKEs FIRE"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"igneo","alvo":9},"texto":"Limpar o estágio 9 do Ígneo"}]'::jsonb),
  ('FIRE'::text, 'dano', 10, '[{"regra":{"t":"abates","tipo":"FIRE","alvo":10000},"texto":"Derrotar 10.000 POKEs FIRE"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"igneo","alvo":10},"texto":"Limpar o estágio 10 do Ígneo"},{"regra":{"t":"posse","f":{"tipo":"FIRE","nivel_min":80},"alvo":1},"texto":"Ter um POKE FIRE capturado por você no Lv 80"}]'::jsonb),
  ('FIRE'::text, 'defesa', 1, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:FIRE","alvo":1800},"texto":"Caçar 30 min com um POKE FIRE em campo"}]'::jsonb),
  ('FIRE'::text, 'defesa', 2, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:FIRE","alvo":3600},"texto":"Caçar 1 h com um POKE FIRE em campo"},{"regra":{"t":"contador","chave":"clima_seg:sol","alvo":1800},"texto":"Caçar 30 min sob sol forte"}]'::jsonb),
  ('FIRE'::text, 'defesa', 3, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:FIRE","alvo":7200},"texto":"Caçar 2 h com um POKE FIRE em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"igneo","alvo":3},"texto":"Limpar o estágio 3 do Ígneo"}]'::jsonb),
  ('FIRE'::text, 'defesa', 4, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:FIRE","alvo":14400},"texto":"Caçar 4 h com um POKE FIRE em campo"},{"regra":{"t":"contador","chave":"clima_seg:sol","alvo":7200},"texto":"Caçar 2 h sob sol forte"}]'::jsonb),
  ('FIRE'::text, 'defesa', 5, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:FIRE","alvo":21600},"texto":"Caçar 6 h com um POKE FIRE em campo"},{"regra":{"t":"posse","f":{"tipo":"FIRE","nivel_min":40},"alvo":1},"texto":"Ter um POKE FIRE capturado por você no Lv 40"}]'::jsonb),
  ('FIRE'::text, 'defesa', 6, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:FIRE","alvo":36000},"texto":"Caçar 10 h com um POKE FIRE em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"igneo","alvo":6},"texto":"Limpar o estágio 6 do Ígneo"}]'::jsonb),
  ('FIRE'::text, 'defesa', 7, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:FIRE","alvo":54000},"texto":"Caçar 15 h com um POKE FIRE em campo"},{"regra":{"t":"contador","chave":"clima_seg:sol","alvo":18000},"texto":"Caçar 5 h sob sol forte"}]'::jsonb),
  ('FIRE'::text, 'defesa', 8, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:FIRE","alvo":72000},"texto":"Caçar 20 h com um POKE FIRE em campo"},{"regra":{"t":"posse","f":{"tipo":"FIRE","nivel_min":60},"alvo":1},"texto":"Ter um POKE FIRE capturado por você no Lv 60"}]'::jsonb),
  ('FIRE'::text, 'defesa', 9, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:FIRE","alvo":108000},"texto":"Caçar 30 h com um POKE FIRE em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"igneo","alvo":9},"texto":"Limpar o estágio 9 do Ígneo"}]'::jsonb),
  ('FIRE'::text, 'defesa', 10, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:FIRE","alvo":144000},"texto":"Caçar 40 h com um POKE FIRE em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"igneo","alvo":10},"texto":"Limpar o estágio 10 do Ígneo"},{"regra":{"t":"posse","f":{"tipo":"FIRE","nivel_min":80},"alvo":1},"texto":"Ter um POKE FIRE capturado por você no Lv 80"}]'::jsonb),
  ('WATER'::text, 'dano', 1, '[{"regra":{"t":"abates","tipo":"WATER","alvo":100},"texto":"Derrotar 100 POKEs WATER"}]'::jsonb),
  ('WATER'::text, 'dano', 2, '[{"regra":{"t":"abates","tipo":"WATER","alvo":300},"texto":"Derrotar 300 POKEs WATER"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"WATER"},"alvo":3},"texto":"Ter 3 espécies WATER diferentes capturadas por você"}]'::jsonb),
  ('WATER'::text, 'dano', 3, '[{"regra":{"t":"abates","tipo":"WATER","alvo":600},"texto":"Derrotar 600 POKEs WATER"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"marinho","alvo":3},"texto":"Limpar o estágio 3 do Marinho"}]'::jsonb),
  ('WATER'::text, 'dano', 4, '[{"regra":{"t":"abates","tipo":"WATER","alvo":1000},"texto":"Derrotar 1.000 POKEs WATER"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"WATER"},"alvo":5},"texto":"Ter 5 espécies WATER diferentes capturadas por você"}]'::jsonb),
  ('WATER'::text, 'dano', 5, '[{"regra":{"t":"abates","tipo":"WATER","alvo":1600},"texto":"Derrotar 1.600 POKEs WATER"},{"regra":{"t":"posse","f":{"tipo":"WATER","nivel_min":40},"alvo":1},"texto":"Ter um POKE WATER capturado por você no Lv 40"}]'::jsonb),
  ('WATER'::text, 'dano', 6, '[{"regra":{"t":"abates","tipo":"WATER","alvo":2400},"texto":"Derrotar 2.400 POKEs WATER"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"marinho","alvo":6},"texto":"Limpar o estágio 6 do Marinho"}]'::jsonb),
  ('WATER'::text, 'dano', 7, '[{"regra":{"t":"abates","tipo":"WATER","alvo":3500},"texto":"Derrotar 3.500 POKEs WATER"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"WATER"},"alvo":8},"texto":"Ter 8 espécies WATER diferentes capturadas por você"}]'::jsonb),
  ('WATER'::text, 'dano', 8, '[{"regra":{"t":"abates","tipo":"WATER","alvo":5000},"texto":"Derrotar 5.000 POKEs WATER"},{"regra":{"t":"posse","f":{"tipo":"WATER","nivel_min":60},"alvo":1},"texto":"Ter um POKE WATER capturado por você no Lv 60"}]'::jsonb),
  ('WATER'::text, 'dano', 9, '[{"regra":{"t":"abates","tipo":"WATER","alvo":7000},"texto":"Derrotar 7.000 POKEs WATER"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"marinho","alvo":9},"texto":"Limpar o estágio 9 do Marinho"}]'::jsonb),
  ('WATER'::text, 'dano', 10, '[{"regra":{"t":"abates","tipo":"WATER","alvo":10000},"texto":"Derrotar 10.000 POKEs WATER"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"marinho","alvo":10},"texto":"Limpar o estágio 10 do Marinho"},{"regra":{"t":"posse","f":{"tipo":"WATER","nivel_min":80},"alvo":1},"texto":"Ter um POKE WATER capturado por você no Lv 80"}]'::jsonb),
  ('WATER'::text, 'defesa', 1, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:WATER","alvo":1800},"texto":"Caçar 30 min com um POKE WATER em campo"}]'::jsonb),
  ('WATER'::text, 'defesa', 2, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:WATER","alvo":3600},"texto":"Caçar 1 h com um POKE WATER em campo"},{"regra":{"t":"contador","chave":"clima_seg:chuva","alvo":1800},"texto":"Caçar 30 min sob chuva"}]'::jsonb),
  ('WATER'::text, 'defesa', 3, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:WATER","alvo":7200},"texto":"Caçar 2 h com um POKE WATER em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"marinho","alvo":3},"texto":"Limpar o estágio 3 do Marinho"}]'::jsonb),
  ('WATER'::text, 'defesa', 4, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:WATER","alvo":14400},"texto":"Caçar 4 h com um POKE WATER em campo"},{"regra":{"t":"contador","chave":"clima_seg:chuva","alvo":7200},"texto":"Caçar 2 h sob chuva"}]'::jsonb),
  ('WATER'::text, 'defesa', 5, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:WATER","alvo":21600},"texto":"Caçar 6 h com um POKE WATER em campo"},{"regra":{"t":"posse","f":{"tipo":"WATER","nivel_min":40},"alvo":1},"texto":"Ter um POKE WATER capturado por você no Lv 40"}]'::jsonb),
  ('WATER'::text, 'defesa', 6, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:WATER","alvo":36000},"texto":"Caçar 10 h com um POKE WATER em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"marinho","alvo":6},"texto":"Limpar o estágio 6 do Marinho"}]'::jsonb),
  ('WATER'::text, 'defesa', 7, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:WATER","alvo":54000},"texto":"Caçar 15 h com um POKE WATER em campo"},{"regra":{"t":"contador","chave":"clima_seg:chuva","alvo":18000},"texto":"Caçar 5 h sob chuva"}]'::jsonb),
  ('WATER'::text, 'defesa', 8, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:WATER","alvo":72000},"texto":"Caçar 20 h com um POKE WATER em campo"},{"regra":{"t":"posse","f":{"tipo":"WATER","nivel_min":60},"alvo":1},"texto":"Ter um POKE WATER capturado por você no Lv 60"}]'::jsonb),
  ('WATER'::text, 'defesa', 9, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:WATER","alvo":108000},"texto":"Caçar 30 h com um POKE WATER em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"marinho","alvo":9},"texto":"Limpar o estágio 9 do Marinho"}]'::jsonb),
  ('WATER'::text, 'defesa', 10, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:WATER","alvo":144000},"texto":"Caçar 40 h com um POKE WATER em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"marinho","alvo":10},"texto":"Limpar o estágio 10 do Marinho"},{"regra":{"t":"posse","f":{"tipo":"WATER","nivel_min":80},"alvo":1},"texto":"Ter um POKE WATER capturado por você no Lv 80"}]'::jsonb),
  ('ELECTRIC'::text, 'dano', 1, '[{"regra":{"t":"abates","tipo":"ELECTRIC","alvo":100},"texto":"Derrotar 100 POKEs ELECTRIC"}]'::jsonb),
  ('ELECTRIC'::text, 'dano', 2, '[{"regra":{"t":"abates","tipo":"ELECTRIC","alvo":300},"texto":"Derrotar 300 POKEs ELECTRIC"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"ELECTRIC"},"alvo":3},"texto":"Ter 3 espécies ELECTRIC diferentes capturadas por você"}]'::jsonb),
  ('ELECTRIC'::text, 'dano', 3, '[{"regra":{"t":"abates","tipo":"ELECTRIC","alvo":600},"texto":"Derrotar 600 POKEs ELECTRIC"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"industrial","alvo":3},"texto":"Limpar o estágio 3 do Industrial"}]'::jsonb),
  ('ELECTRIC'::text, 'dano', 4, '[{"regra":{"t":"abates","tipo":"ELECTRIC","alvo":1000},"texto":"Derrotar 1.000 POKEs ELECTRIC"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"ELECTRIC"},"alvo":5},"texto":"Ter 5 espécies ELECTRIC diferentes capturadas por você"}]'::jsonb),
  ('ELECTRIC'::text, 'dano', 5, '[{"regra":{"t":"abates","tipo":"ELECTRIC","alvo":1600},"texto":"Derrotar 1.600 POKEs ELECTRIC"},{"regra":{"t":"posse","f":{"tipo":"ELECTRIC","nivel_min":40},"alvo":1},"texto":"Ter um POKE ELECTRIC capturado por você no Lv 40"}]'::jsonb),
  ('ELECTRIC'::text, 'dano', 6, '[{"regra":{"t":"abates","tipo":"ELECTRIC","alvo":2400},"texto":"Derrotar 2.400 POKEs ELECTRIC"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"industrial","alvo":6},"texto":"Limpar o estágio 6 do Industrial"}]'::jsonb),
  ('ELECTRIC'::text, 'dano', 7, '[{"regra":{"t":"abates","tipo":"ELECTRIC","alvo":3500},"texto":"Derrotar 3.500 POKEs ELECTRIC"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"ELECTRIC"},"alvo":8},"texto":"Ter 8 espécies ELECTRIC diferentes capturadas por você"}]'::jsonb),
  ('ELECTRIC'::text, 'dano', 8, '[{"regra":{"t":"abates","tipo":"ELECTRIC","alvo":5000},"texto":"Derrotar 5.000 POKEs ELECTRIC"},{"regra":{"t":"posse","f":{"tipo":"ELECTRIC","nivel_min":60},"alvo":1},"texto":"Ter um POKE ELECTRIC capturado por você no Lv 60"}]'::jsonb),
  ('ELECTRIC'::text, 'dano', 9, '[{"regra":{"t":"abates","tipo":"ELECTRIC","alvo":7000},"texto":"Derrotar 7.000 POKEs ELECTRIC"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"industrial","alvo":9},"texto":"Limpar o estágio 9 do Industrial"}]'::jsonb),
  ('ELECTRIC'::text, 'dano', 10, '[{"regra":{"t":"abates","tipo":"ELECTRIC","alvo":10000},"texto":"Derrotar 10.000 POKEs ELECTRIC"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"industrial","alvo":10},"texto":"Limpar o estágio 10 do Industrial"},{"regra":{"t":"posse","f":{"tipo":"ELECTRIC","nivel_min":80},"alvo":1},"texto":"Ter um POKE ELECTRIC capturado por você no Lv 80"}]'::jsonb),
  ('ELECTRIC'::text, 'defesa', 1, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:ELECTRIC","alvo":1800},"texto":"Caçar 30 min com um POKE ELECTRIC em campo"}]'::jsonb),
  ('ELECTRIC'::text, 'defesa', 2, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:ELECTRIC","alvo":3600},"texto":"Caçar 1 h com um POKE ELECTRIC em campo"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"ELECTRIC"},"alvo":3},"texto":"Ter 3 espécies ELECTRIC diferentes capturadas por você"}]'::jsonb),
  ('ELECTRIC'::text, 'defesa', 3, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:ELECTRIC","alvo":7200},"texto":"Caçar 2 h com um POKE ELECTRIC em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"industrial","alvo":3},"texto":"Limpar o estágio 3 do Industrial"}]'::jsonb),
  ('ELECTRIC'::text, 'defesa', 4, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:ELECTRIC","alvo":14400},"texto":"Caçar 4 h com um POKE ELECTRIC em campo"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"ELECTRIC"},"alvo":5},"texto":"Ter 5 espécies ELECTRIC diferentes capturadas por você"}]'::jsonb),
  ('ELECTRIC'::text, 'defesa', 5, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:ELECTRIC","alvo":21600},"texto":"Caçar 6 h com um POKE ELECTRIC em campo"},{"regra":{"t":"posse","f":{"tipo":"ELECTRIC","nivel_min":40},"alvo":1},"texto":"Ter um POKE ELECTRIC capturado por você no Lv 40"}]'::jsonb),
  ('ELECTRIC'::text, 'defesa', 6, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:ELECTRIC","alvo":36000},"texto":"Caçar 10 h com um POKE ELECTRIC em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"industrial","alvo":6},"texto":"Limpar o estágio 6 do Industrial"}]'::jsonb),
  ('ELECTRIC'::text, 'defesa', 7, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:ELECTRIC","alvo":54000},"texto":"Caçar 15 h com um POKE ELECTRIC em campo"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"ELECTRIC"},"alvo":8},"texto":"Ter 8 espécies ELECTRIC diferentes capturadas por você"}]'::jsonb),
  ('ELECTRIC'::text, 'defesa', 8, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:ELECTRIC","alvo":72000},"texto":"Caçar 20 h com um POKE ELECTRIC em campo"},{"regra":{"t":"posse","f":{"tipo":"ELECTRIC","nivel_min":60},"alvo":1},"texto":"Ter um POKE ELECTRIC capturado por você no Lv 60"}]'::jsonb),
  ('ELECTRIC'::text, 'defesa', 9, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:ELECTRIC","alvo":108000},"texto":"Caçar 30 h com um POKE ELECTRIC em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"industrial","alvo":9},"texto":"Limpar o estágio 9 do Industrial"}]'::jsonb),
  ('ELECTRIC'::text, 'defesa', 10, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:ELECTRIC","alvo":144000},"texto":"Caçar 40 h com um POKE ELECTRIC em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"industrial","alvo":10},"texto":"Limpar o estágio 10 do Industrial"},{"regra":{"t":"posse","f":{"tipo":"ELECTRIC","nivel_min":80},"alvo":1},"texto":"Ter um POKE ELECTRIC capturado por você no Lv 80"}]'::jsonb),
  ('GRASS'::text, 'dano', 1, '[{"regra":{"t":"abates","tipo":"GRASS","alvo":100},"texto":"Derrotar 100 POKEs GRASS"}]'::jsonb),
  ('GRASS'::text, 'dano', 2, '[{"regra":{"t":"abates","tipo":"GRASS","alvo":300},"texto":"Derrotar 300 POKEs GRASS"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"GRASS"},"alvo":3},"texto":"Ter 3 espécies GRASS diferentes capturadas por você"}]'::jsonb),
  ('GRASS'::text, 'dano', 3, '[{"regra":{"t":"abates","tipo":"GRASS","alvo":600},"texto":"Derrotar 600 POKEs GRASS"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"mata","alvo":3},"texto":"Limpar o estágio 3 do Mata"}]'::jsonb),
  ('GRASS'::text, 'dano', 4, '[{"regra":{"t":"abates","tipo":"GRASS","alvo":1000},"texto":"Derrotar 1.000 POKEs GRASS"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"GRASS"},"alvo":5},"texto":"Ter 5 espécies GRASS diferentes capturadas por você"}]'::jsonb),
  ('GRASS'::text, 'dano', 5, '[{"regra":{"t":"abates","tipo":"GRASS","alvo":1600},"texto":"Derrotar 1.600 POKEs GRASS"},{"regra":{"t":"posse","f":{"tipo":"GRASS","nivel_min":40},"alvo":1},"texto":"Ter um POKE GRASS capturado por você no Lv 40"}]'::jsonb),
  ('GRASS'::text, 'dano', 6, '[{"regra":{"t":"abates","tipo":"GRASS","alvo":2400},"texto":"Derrotar 2.400 POKEs GRASS"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"mata","alvo":6},"texto":"Limpar o estágio 6 do Mata"}]'::jsonb),
  ('GRASS'::text, 'dano', 7, '[{"regra":{"t":"abates","tipo":"GRASS","alvo":3500},"texto":"Derrotar 3.500 POKEs GRASS"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"GRASS"},"alvo":8},"texto":"Ter 8 espécies GRASS diferentes capturadas por você"}]'::jsonb),
  ('GRASS'::text, 'dano', 8, '[{"regra":{"t":"abates","tipo":"GRASS","alvo":5000},"texto":"Derrotar 5.000 POKEs GRASS"},{"regra":{"t":"posse","f":{"tipo":"GRASS","nivel_min":60},"alvo":1},"texto":"Ter um POKE GRASS capturado por você no Lv 60"}]'::jsonb),
  ('GRASS'::text, 'dano', 9, '[{"regra":{"t":"abates","tipo":"GRASS","alvo":7000},"texto":"Derrotar 7.000 POKEs GRASS"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"mata","alvo":9},"texto":"Limpar o estágio 9 do Mata"}]'::jsonb),
  ('GRASS'::text, 'dano', 10, '[{"regra":{"t":"abates","tipo":"GRASS","alvo":10000},"texto":"Derrotar 10.000 POKEs GRASS"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"mata","alvo":10},"texto":"Limpar o estágio 10 do Mata"},{"regra":{"t":"posse","f":{"tipo":"GRASS","nivel_min":80},"alvo":1},"texto":"Ter um POKE GRASS capturado por você no Lv 80"}]'::jsonb),
  ('GRASS'::text, 'defesa', 1, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:GRASS","alvo":1800},"texto":"Caçar 30 min com um POKE GRASS em campo"}]'::jsonb),
  ('GRASS'::text, 'defesa', 2, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:GRASS","alvo":3600},"texto":"Caçar 1 h com um POKE GRASS em campo"},{"regra":{"t":"contador","chave":"clima_seg:sol","alvo":1800},"texto":"Caçar 30 min sob sol forte"}]'::jsonb),
  ('GRASS'::text, 'defesa', 3, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:GRASS","alvo":7200},"texto":"Caçar 2 h com um POKE GRASS em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"mata","alvo":3},"texto":"Limpar o estágio 3 do Mata"}]'::jsonb),
  ('GRASS'::text, 'defesa', 4, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:GRASS","alvo":14400},"texto":"Caçar 4 h com um POKE GRASS em campo"},{"regra":{"t":"contador","chave":"clima_seg:sol","alvo":7200},"texto":"Caçar 2 h sob sol forte"}]'::jsonb),
  ('GRASS'::text, 'defesa', 5, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:GRASS","alvo":21600},"texto":"Caçar 6 h com um POKE GRASS em campo"},{"regra":{"t":"posse","f":{"tipo":"GRASS","nivel_min":40},"alvo":1},"texto":"Ter um POKE GRASS capturado por você no Lv 40"}]'::jsonb),
  ('GRASS'::text, 'defesa', 6, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:GRASS","alvo":36000},"texto":"Caçar 10 h com um POKE GRASS em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"mata","alvo":6},"texto":"Limpar o estágio 6 do Mata"}]'::jsonb),
  ('GRASS'::text, 'defesa', 7, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:GRASS","alvo":54000},"texto":"Caçar 15 h com um POKE GRASS em campo"},{"regra":{"t":"contador","chave":"clima_seg:sol","alvo":18000},"texto":"Caçar 5 h sob sol forte"}]'::jsonb),
  ('GRASS'::text, 'defesa', 8, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:GRASS","alvo":72000},"texto":"Caçar 20 h com um POKE GRASS em campo"},{"regra":{"t":"posse","f":{"tipo":"GRASS","nivel_min":60},"alvo":1},"texto":"Ter um POKE GRASS capturado por você no Lv 60"}]'::jsonb),
  ('GRASS'::text, 'defesa', 9, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:GRASS","alvo":108000},"texto":"Caçar 30 h com um POKE GRASS em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"mata","alvo":9},"texto":"Limpar o estágio 9 do Mata"}]'::jsonb),
  ('GRASS'::text, 'defesa', 10, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:GRASS","alvo":144000},"texto":"Caçar 40 h com um POKE GRASS em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"mata","alvo":10},"texto":"Limpar o estágio 10 do Mata"},{"regra":{"t":"posse","f":{"tipo":"GRASS","nivel_min":80},"alvo":1},"texto":"Ter um POKE GRASS capturado por você no Lv 80"}]'::jsonb),
  ('ICE'::text, 'dano', 1, '[{"regra":{"t":"abates","tipo":"ICE","alvo":100},"texto":"Derrotar 100 POKEs ICE"}]'::jsonb),
  ('ICE'::text, 'dano', 2, '[{"regra":{"t":"abates","tipo":"ICE","alvo":300},"texto":"Derrotar 300 POKEs ICE"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"ICE"},"alvo":3},"texto":"Ter 3 espécies ICE diferentes capturadas por você"}]'::jsonb),
  ('ICE'::text, 'dano', 3, '[{"regra":{"t":"abates","tipo":"ICE","alvo":600},"texto":"Derrotar 600 POKEs ICE"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"gelido","alvo":3},"texto":"Limpar o estágio 3 do Gélido"}]'::jsonb),
  ('ICE'::text, 'dano', 4, '[{"regra":{"t":"abates","tipo":"ICE","alvo":1000},"texto":"Derrotar 1.000 POKEs ICE"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"ICE"},"alvo":5},"texto":"Ter 5 espécies ICE diferentes capturadas por você"}]'::jsonb),
  ('ICE'::text, 'dano', 5, '[{"regra":{"t":"abates","tipo":"ICE","alvo":1600},"texto":"Derrotar 1.600 POKEs ICE"},{"regra":{"t":"posse","f":{"tipo":"ICE","nivel_min":40},"alvo":1},"texto":"Ter um POKE ICE capturado por você no Lv 40"}]'::jsonb),
  ('ICE'::text, 'dano', 6, '[{"regra":{"t":"abates","tipo":"ICE","alvo":2400},"texto":"Derrotar 2.400 POKEs ICE"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"gelido","alvo":6},"texto":"Limpar o estágio 6 do Gélido"}]'::jsonb),
  ('ICE'::text, 'dano', 7, '[{"regra":{"t":"abates","tipo":"ICE","alvo":3500},"texto":"Derrotar 3.500 POKEs ICE"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"ICE"},"alvo":8},"texto":"Ter 8 espécies ICE diferentes capturadas por você"}]'::jsonb),
  ('ICE'::text, 'dano', 8, '[{"regra":{"t":"abates","tipo":"ICE","alvo":5000},"texto":"Derrotar 5.000 POKEs ICE"},{"regra":{"t":"posse","f":{"tipo":"ICE","nivel_min":60},"alvo":1},"texto":"Ter um POKE ICE capturado por você no Lv 60"}]'::jsonb),
  ('ICE'::text, 'dano', 9, '[{"regra":{"t":"abates","tipo":"ICE","alvo":7000},"texto":"Derrotar 7.000 POKEs ICE"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"gelido","alvo":9},"texto":"Limpar o estágio 9 do Gélido"}]'::jsonb),
  ('ICE'::text, 'dano', 10, '[{"regra":{"t":"abates","tipo":"ICE","alvo":10000},"texto":"Derrotar 10.000 POKEs ICE"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"gelido","alvo":10},"texto":"Limpar o estágio 10 do Gélido"},{"regra":{"t":"posse","f":{"tipo":"ICE","nivel_min":80},"alvo":1},"texto":"Ter um POKE ICE capturado por você no Lv 80"}]'::jsonb),
  ('ICE'::text, 'defesa', 1, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:ICE","alvo":1800},"texto":"Caçar 30 min com um POKE ICE em campo"}]'::jsonb),
  ('ICE'::text, 'defesa', 2, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:ICE","alvo":3600},"texto":"Caçar 1 h com um POKE ICE em campo"},{"regra":{"t":"contador","chave":"clima_seg:neve","alvo":1800},"texto":"Caçar 30 min sob neve"}]'::jsonb),
  ('ICE'::text, 'defesa', 3, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:ICE","alvo":7200},"texto":"Caçar 2 h com um POKE ICE em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"gelido","alvo":3},"texto":"Limpar o estágio 3 do Gélido"}]'::jsonb),
  ('ICE'::text, 'defesa', 4, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:ICE","alvo":14400},"texto":"Caçar 4 h com um POKE ICE em campo"},{"regra":{"t":"contador","chave":"clima_seg:neve","alvo":7200},"texto":"Caçar 2 h sob neve"}]'::jsonb),
  ('ICE'::text, 'defesa', 5, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:ICE","alvo":21600},"texto":"Caçar 6 h com um POKE ICE em campo"},{"regra":{"t":"posse","f":{"tipo":"ICE","nivel_min":40},"alvo":1},"texto":"Ter um POKE ICE capturado por você no Lv 40"}]'::jsonb),
  ('ICE'::text, 'defesa', 6, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:ICE","alvo":36000},"texto":"Caçar 10 h com um POKE ICE em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"gelido","alvo":6},"texto":"Limpar o estágio 6 do Gélido"}]'::jsonb),
  ('ICE'::text, 'defesa', 7, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:ICE","alvo":54000},"texto":"Caçar 15 h com um POKE ICE em campo"},{"regra":{"t":"contador","chave":"clima_seg:neve","alvo":18000},"texto":"Caçar 5 h sob neve"}]'::jsonb),
  ('ICE'::text, 'defesa', 8, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:ICE","alvo":72000},"texto":"Caçar 20 h com um POKE ICE em campo"},{"regra":{"t":"posse","f":{"tipo":"ICE","nivel_min":60},"alvo":1},"texto":"Ter um POKE ICE capturado por você no Lv 60"}]'::jsonb),
  ('ICE'::text, 'defesa', 9, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:ICE","alvo":108000},"texto":"Caçar 30 h com um POKE ICE em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"gelido","alvo":9},"texto":"Limpar o estágio 9 do Gélido"}]'::jsonb),
  ('ICE'::text, 'defesa', 10, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:ICE","alvo":144000},"texto":"Caçar 40 h com um POKE ICE em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"gelido","alvo":10},"texto":"Limpar o estágio 10 do Gélido"},{"regra":{"t":"posse","f":{"tipo":"ICE","nivel_min":80},"alvo":1},"texto":"Ter um POKE ICE capturado por você no Lv 80"}]'::jsonb),
  ('FIGHTING'::text, 'dano', 1, '[{"regra":{"t":"abates","tipo":"FIGHTING","alvo":100},"texto":"Derrotar 100 POKEs FIGHTING"}]'::jsonb),
  ('FIGHTING'::text, 'dano', 2, '[{"regra":{"t":"abates","tipo":"FIGHTING","alvo":300},"texto":"Derrotar 300 POKEs FIGHTING"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"FIGHTING"},"alvo":3},"texto":"Ter 3 espécies FIGHTING diferentes capturadas por você"}]'::jsonb),
  ('FIGHTING'::text, 'dano', 3, '[{"regra":{"t":"abates","tipo":"FIGHTING","alvo":600},"texto":"Derrotar 600 POKEs FIGHTING"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"urbano","alvo":3},"texto":"Limpar o estágio 3 do Urbano"}]'::jsonb),
  ('FIGHTING'::text, 'dano', 4, '[{"regra":{"t":"abates","tipo":"FIGHTING","alvo":1000},"texto":"Derrotar 1.000 POKEs FIGHTING"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"FIGHTING"},"alvo":5},"texto":"Ter 5 espécies FIGHTING diferentes capturadas por você"}]'::jsonb),
  ('FIGHTING'::text, 'dano', 5, '[{"regra":{"t":"abates","tipo":"FIGHTING","alvo":1600},"texto":"Derrotar 1.600 POKEs FIGHTING"},{"regra":{"t":"posse","f":{"tipo":"FIGHTING","nivel_min":40},"alvo":1},"texto":"Ter um POKE FIGHTING capturado por você no Lv 40"}]'::jsonb),
  ('FIGHTING'::text, 'dano', 6, '[{"regra":{"t":"abates","tipo":"FIGHTING","alvo":2400},"texto":"Derrotar 2.400 POKEs FIGHTING"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"urbano","alvo":6},"texto":"Limpar o estágio 6 do Urbano"}]'::jsonb),
  ('FIGHTING'::text, 'dano', 7, '[{"regra":{"t":"abates","tipo":"FIGHTING","alvo":3500},"texto":"Derrotar 3.500 POKEs FIGHTING"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"FIGHTING"},"alvo":8},"texto":"Ter 8 espécies FIGHTING diferentes capturadas por você"}]'::jsonb),
  ('FIGHTING'::text, 'dano', 8, '[{"regra":{"t":"abates","tipo":"FIGHTING","alvo":5000},"texto":"Derrotar 5.000 POKEs FIGHTING"},{"regra":{"t":"posse","f":{"tipo":"FIGHTING","nivel_min":60},"alvo":1},"texto":"Ter um POKE FIGHTING capturado por você no Lv 60"}]'::jsonb),
  ('FIGHTING'::text, 'dano', 9, '[{"regra":{"t":"abates","tipo":"FIGHTING","alvo":7000},"texto":"Derrotar 7.000 POKEs FIGHTING"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"urbano","alvo":9},"texto":"Limpar o estágio 9 do Urbano"}]'::jsonb),
  ('FIGHTING'::text, 'dano', 10, '[{"regra":{"t":"abates","tipo":"FIGHTING","alvo":10000},"texto":"Derrotar 10.000 POKEs FIGHTING"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"urbano","alvo":10},"texto":"Limpar o estágio 10 do Urbano"},{"regra":{"t":"posse","f":{"tipo":"FIGHTING","nivel_min":80},"alvo":1},"texto":"Ter um POKE FIGHTING capturado por você no Lv 80"}]'::jsonb),
  ('FIGHTING'::text, 'defesa', 1, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:FIGHTING","alvo":1800},"texto":"Caçar 30 min com um POKE FIGHTING em campo"}]'::jsonb),
  ('FIGHTING'::text, 'defesa', 2, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:FIGHTING","alvo":3600},"texto":"Caçar 1 h com um POKE FIGHTING em campo"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"FIGHTING"},"alvo":3},"texto":"Ter 3 espécies FIGHTING diferentes capturadas por você"}]'::jsonb),
  ('FIGHTING'::text, 'defesa', 3, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:FIGHTING","alvo":7200},"texto":"Caçar 2 h com um POKE FIGHTING em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"urbano","alvo":3},"texto":"Limpar o estágio 3 do Urbano"}]'::jsonb),
  ('FIGHTING'::text, 'defesa', 4, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:FIGHTING","alvo":14400},"texto":"Caçar 4 h com um POKE FIGHTING em campo"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"FIGHTING"},"alvo":5},"texto":"Ter 5 espécies FIGHTING diferentes capturadas por você"}]'::jsonb),
  ('FIGHTING'::text, 'defesa', 5, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:FIGHTING","alvo":21600},"texto":"Caçar 6 h com um POKE FIGHTING em campo"},{"regra":{"t":"posse","f":{"tipo":"FIGHTING","nivel_min":40},"alvo":1},"texto":"Ter um POKE FIGHTING capturado por você no Lv 40"}]'::jsonb),
  ('FIGHTING'::text, 'defesa', 6, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:FIGHTING","alvo":36000},"texto":"Caçar 10 h com um POKE FIGHTING em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"urbano","alvo":6},"texto":"Limpar o estágio 6 do Urbano"}]'::jsonb),
  ('FIGHTING'::text, 'defesa', 7, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:FIGHTING","alvo":54000},"texto":"Caçar 15 h com um POKE FIGHTING em campo"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"FIGHTING"},"alvo":8},"texto":"Ter 8 espécies FIGHTING diferentes capturadas por você"}]'::jsonb),
  ('FIGHTING'::text, 'defesa', 8, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:FIGHTING","alvo":72000},"texto":"Caçar 20 h com um POKE FIGHTING em campo"},{"regra":{"t":"posse","f":{"tipo":"FIGHTING","nivel_min":60},"alvo":1},"texto":"Ter um POKE FIGHTING capturado por você no Lv 60"}]'::jsonb),
  ('FIGHTING'::text, 'defesa', 9, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:FIGHTING","alvo":108000},"texto":"Caçar 30 h com um POKE FIGHTING em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"urbano","alvo":9},"texto":"Limpar o estágio 9 do Urbano"}]'::jsonb),
  ('FIGHTING'::text, 'defesa', 10, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:FIGHTING","alvo":144000},"texto":"Caçar 40 h com um POKE FIGHTING em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"urbano","alvo":10},"texto":"Limpar o estágio 10 do Urbano"},{"regra":{"t":"posse","f":{"tipo":"FIGHTING","nivel_min":80},"alvo":1},"texto":"Ter um POKE FIGHTING capturado por você no Lv 80"}]'::jsonb),
  ('POISON'::text, 'dano', 1, '[{"regra":{"t":"abates","tipo":"POISON","alvo":100},"texto":"Derrotar 100 POKEs POISON"}]'::jsonb),
  ('POISON'::text, 'dano', 2, '[{"regra":{"t":"abates","tipo":"POISON","alvo":300},"texto":"Derrotar 300 POKEs POISON"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"POISON"},"alvo":3},"texto":"Ter 3 espécies POISON diferentes capturadas por você"}]'::jsonb),
  ('POISON'::text, 'dano', 3, '[{"regra":{"t":"abates","tipo":"POISON","alvo":600},"texto":"Derrotar 600 POKEs POISON"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"aguas_interiores","alvo":3},"texto":"Limpar o estágio 3 do Águas Interiores"}]'::jsonb),
  ('POISON'::text, 'dano', 4, '[{"regra":{"t":"abates","tipo":"POISON","alvo":1000},"texto":"Derrotar 1.000 POKEs POISON"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"POISON"},"alvo":5},"texto":"Ter 5 espécies POISON diferentes capturadas por você"}]'::jsonb),
  ('POISON'::text, 'dano', 5, '[{"regra":{"t":"abates","tipo":"POISON","alvo":1600},"texto":"Derrotar 1.600 POKEs POISON"},{"regra":{"t":"posse","f":{"tipo":"POISON","nivel_min":40},"alvo":1},"texto":"Ter um POKE POISON capturado por você no Lv 40"}]'::jsonb),
  ('POISON'::text, 'dano', 6, '[{"regra":{"t":"abates","tipo":"POISON","alvo":2400},"texto":"Derrotar 2.400 POKEs POISON"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"aguas_interiores","alvo":6},"texto":"Limpar o estágio 6 do Águas Interiores"}]'::jsonb),
  ('POISON'::text, 'dano', 7, '[{"regra":{"t":"abates","tipo":"POISON","alvo":3500},"texto":"Derrotar 3.500 POKEs POISON"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"POISON"},"alvo":8},"texto":"Ter 8 espécies POISON diferentes capturadas por você"}]'::jsonb),
  ('POISON'::text, 'dano', 8, '[{"regra":{"t":"abates","tipo":"POISON","alvo":5000},"texto":"Derrotar 5.000 POKEs POISON"},{"regra":{"t":"posse","f":{"tipo":"POISON","nivel_min":60},"alvo":1},"texto":"Ter um POKE POISON capturado por você no Lv 60"}]'::jsonb),
  ('POISON'::text, 'dano', 9, '[{"regra":{"t":"abates","tipo":"POISON","alvo":7000},"texto":"Derrotar 7.000 POKEs POISON"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"aguas_interiores","alvo":9},"texto":"Limpar o estágio 9 do Águas Interiores"}]'::jsonb),
  ('POISON'::text, 'dano', 10, '[{"regra":{"t":"abates","tipo":"POISON","alvo":10000},"texto":"Derrotar 10.000 POKEs POISON"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"aguas_interiores","alvo":10},"texto":"Limpar o estágio 10 do Águas Interiores"},{"regra":{"t":"posse","f":{"tipo":"POISON","nivel_min":80},"alvo":1},"texto":"Ter um POKE POISON capturado por você no Lv 80"}]'::jsonb),
  ('POISON'::text, 'defesa', 1, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:POISON","alvo":1800},"texto":"Caçar 30 min com um POKE POISON em campo"}]'::jsonb),
  ('POISON'::text, 'defesa', 2, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:POISON","alvo":3600},"texto":"Caçar 1 h com um POKE POISON em campo"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"POISON"},"alvo":3},"texto":"Ter 3 espécies POISON diferentes capturadas por você"}]'::jsonb),
  ('POISON'::text, 'defesa', 3, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:POISON","alvo":7200},"texto":"Caçar 2 h com um POKE POISON em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"aguas_interiores","alvo":3},"texto":"Limpar o estágio 3 do Águas Interiores"}]'::jsonb),
  ('POISON'::text, 'defesa', 4, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:POISON","alvo":14400},"texto":"Caçar 4 h com um POKE POISON em campo"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"POISON"},"alvo":5},"texto":"Ter 5 espécies POISON diferentes capturadas por você"}]'::jsonb),
  ('POISON'::text, 'defesa', 5, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:POISON","alvo":21600},"texto":"Caçar 6 h com um POKE POISON em campo"},{"regra":{"t":"posse","f":{"tipo":"POISON","nivel_min":40},"alvo":1},"texto":"Ter um POKE POISON capturado por você no Lv 40"}]'::jsonb),
  ('POISON'::text, 'defesa', 6, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:POISON","alvo":36000},"texto":"Caçar 10 h com um POKE POISON em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"aguas_interiores","alvo":6},"texto":"Limpar o estágio 6 do Águas Interiores"}]'::jsonb),
  ('POISON'::text, 'defesa', 7, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:POISON","alvo":54000},"texto":"Caçar 15 h com um POKE POISON em campo"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"POISON"},"alvo":8},"texto":"Ter 8 espécies POISON diferentes capturadas por você"}]'::jsonb),
  ('POISON'::text, 'defesa', 8, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:POISON","alvo":72000},"texto":"Caçar 20 h com um POKE POISON em campo"},{"regra":{"t":"posse","f":{"tipo":"POISON","nivel_min":60},"alvo":1},"texto":"Ter um POKE POISON capturado por você no Lv 60"}]'::jsonb),
  ('POISON'::text, 'defesa', 9, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:POISON","alvo":108000},"texto":"Caçar 30 h com um POKE POISON em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"aguas_interiores","alvo":9},"texto":"Limpar o estágio 9 do Águas Interiores"}]'::jsonb),
  ('POISON'::text, 'defesa', 10, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:POISON","alvo":144000},"texto":"Caçar 40 h com um POKE POISON em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"aguas_interiores","alvo":10},"texto":"Limpar o estágio 10 do Águas Interiores"},{"regra":{"t":"posse","f":{"tipo":"POISON","nivel_min":80},"alvo":1},"texto":"Ter um POKE POISON capturado por você no Lv 80"}]'::jsonb),
  ('GROUND'::text, 'dano', 1, '[{"regra":{"t":"abates","tipo":"GROUND","alvo":100},"texto":"Derrotar 100 POKEs GROUND"}]'::jsonb),
  ('GROUND'::text, 'dano', 2, '[{"regra":{"t":"abates","tipo":"GROUND","alvo":300},"texto":"Derrotar 300 POKEs GROUND"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"GROUND"},"alvo":3},"texto":"Ter 3 espécies GROUND diferentes capturadas por você"}]'::jsonb),
  ('GROUND'::text, 'dano', 3, '[{"regra":{"t":"abates","tipo":"GROUND","alvo":600},"texto":"Derrotar 600 POKEs GROUND"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"aridos","alvo":3},"texto":"Limpar o estágio 3 do Áridos"}]'::jsonb),
  ('GROUND'::text, 'dano', 4, '[{"regra":{"t":"abates","tipo":"GROUND","alvo":1000},"texto":"Derrotar 1.000 POKEs GROUND"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"GROUND"},"alvo":5},"texto":"Ter 5 espécies GROUND diferentes capturadas por você"}]'::jsonb),
  ('GROUND'::text, 'dano', 5, '[{"regra":{"t":"abates","tipo":"GROUND","alvo":1600},"texto":"Derrotar 1.600 POKEs GROUND"},{"regra":{"t":"posse","f":{"tipo":"GROUND","nivel_min":40},"alvo":1},"texto":"Ter um POKE GROUND capturado por você no Lv 40"}]'::jsonb),
  ('GROUND'::text, 'dano', 6, '[{"regra":{"t":"abates","tipo":"GROUND","alvo":2400},"texto":"Derrotar 2.400 POKEs GROUND"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"aridos","alvo":6},"texto":"Limpar o estágio 6 do Áridos"}]'::jsonb),
  ('GROUND'::text, 'dano', 7, '[{"regra":{"t":"abates","tipo":"GROUND","alvo":3500},"texto":"Derrotar 3.500 POKEs GROUND"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"GROUND"},"alvo":8},"texto":"Ter 8 espécies GROUND diferentes capturadas por você"}]'::jsonb),
  ('GROUND'::text, 'dano', 8, '[{"regra":{"t":"abates","tipo":"GROUND","alvo":5000},"texto":"Derrotar 5.000 POKEs GROUND"},{"regra":{"t":"posse","f":{"tipo":"GROUND","nivel_min":60},"alvo":1},"texto":"Ter um POKE GROUND capturado por você no Lv 60"}]'::jsonb),
  ('GROUND'::text, 'dano', 9, '[{"regra":{"t":"abates","tipo":"GROUND","alvo":7000},"texto":"Derrotar 7.000 POKEs GROUND"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"aridos","alvo":9},"texto":"Limpar o estágio 9 do Áridos"}]'::jsonb),
  ('GROUND'::text, 'dano', 10, '[{"regra":{"t":"abates","tipo":"GROUND","alvo":10000},"texto":"Derrotar 10.000 POKEs GROUND"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"aridos","alvo":10},"texto":"Limpar o estágio 10 do Áridos"},{"regra":{"t":"posse","f":{"tipo":"GROUND","nivel_min":80},"alvo":1},"texto":"Ter um POKE GROUND capturado por você no Lv 80"}]'::jsonb),
  ('GROUND'::text, 'defesa', 1, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:GROUND","alvo":1800},"texto":"Caçar 30 min com um POKE GROUND em campo"}]'::jsonb),
  ('GROUND'::text, 'defesa', 2, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:GROUND","alvo":3600},"texto":"Caçar 1 h com um POKE GROUND em campo"},{"regra":{"t":"contador","chave":"clima_seg:areia","alvo":1800},"texto":"Caçar 30 min sob tempestade de areia"}]'::jsonb),
  ('GROUND'::text, 'defesa', 3, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:GROUND","alvo":7200},"texto":"Caçar 2 h com um POKE GROUND em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"aridos","alvo":3},"texto":"Limpar o estágio 3 do Áridos"}]'::jsonb),
  ('GROUND'::text, 'defesa', 4, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:GROUND","alvo":14400},"texto":"Caçar 4 h com um POKE GROUND em campo"},{"regra":{"t":"contador","chave":"clima_seg:areia","alvo":7200},"texto":"Caçar 2 h sob tempestade de areia"}]'::jsonb),
  ('GROUND'::text, 'defesa', 5, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:GROUND","alvo":21600},"texto":"Caçar 6 h com um POKE GROUND em campo"},{"regra":{"t":"posse","f":{"tipo":"GROUND","nivel_min":40},"alvo":1},"texto":"Ter um POKE GROUND capturado por você no Lv 40"}]'::jsonb),
  ('GROUND'::text, 'defesa', 6, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:GROUND","alvo":36000},"texto":"Caçar 10 h com um POKE GROUND em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"aridos","alvo":6},"texto":"Limpar o estágio 6 do Áridos"}]'::jsonb),
  ('GROUND'::text, 'defesa', 7, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:GROUND","alvo":54000},"texto":"Caçar 15 h com um POKE GROUND em campo"},{"regra":{"t":"contador","chave":"clima_seg:areia","alvo":18000},"texto":"Caçar 5 h sob tempestade de areia"}]'::jsonb),
  ('GROUND'::text, 'defesa', 8, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:GROUND","alvo":72000},"texto":"Caçar 20 h com um POKE GROUND em campo"},{"regra":{"t":"posse","f":{"tipo":"GROUND","nivel_min":60},"alvo":1},"texto":"Ter um POKE GROUND capturado por você no Lv 60"}]'::jsonb),
  ('GROUND'::text, 'defesa', 9, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:GROUND","alvo":108000},"texto":"Caçar 30 h com um POKE GROUND em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"aridos","alvo":9},"texto":"Limpar o estágio 9 do Áridos"}]'::jsonb),
  ('GROUND'::text, 'defesa', 10, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:GROUND","alvo":144000},"texto":"Caçar 40 h com um POKE GROUND em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"aridos","alvo":10},"texto":"Limpar o estágio 10 do Áridos"},{"regra":{"t":"posse","f":{"tipo":"GROUND","nivel_min":80},"alvo":1},"texto":"Ter um POKE GROUND capturado por você no Lv 80"}]'::jsonb),
  ('FLYING'::text, 'dano', 1, '[{"regra":{"t":"abates","tipo":"FLYING","alvo":100},"texto":"Derrotar 100 POKEs FLYING"}]'::jsonb),
  ('FLYING'::text, 'dano', 2, '[{"regra":{"t":"abates","tipo":"FLYING","alvo":300},"texto":"Derrotar 300 POKEs FLYING"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"FLYING"},"alvo":3},"texto":"Ter 3 espécies FLYING diferentes capturadas por você"}]'::jsonb),
  ('FLYING'::text, 'dano', 3, '[{"regra":{"t":"abates","tipo":"FLYING","alvo":600},"texto":"Derrotar 600 POKEs FLYING"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"subterraneo","alvo":3},"texto":"Limpar o estágio 3 do Subterrâneo"}]'::jsonb),
  ('FLYING'::text, 'dano', 4, '[{"regra":{"t":"abates","tipo":"FLYING","alvo":1000},"texto":"Derrotar 1.000 POKEs FLYING"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"FLYING"},"alvo":5},"texto":"Ter 5 espécies FLYING diferentes capturadas por você"}]'::jsonb),
  ('FLYING'::text, 'dano', 5, '[{"regra":{"t":"abates","tipo":"FLYING","alvo":1600},"texto":"Derrotar 1.600 POKEs FLYING"},{"regra":{"t":"posse","f":{"tipo":"FLYING","nivel_min":40},"alvo":1},"texto":"Ter um POKE FLYING capturado por você no Lv 40"}]'::jsonb),
  ('FLYING'::text, 'dano', 6, '[{"regra":{"t":"abates","tipo":"FLYING","alvo":2400},"texto":"Derrotar 2.400 POKEs FLYING"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"subterraneo","alvo":6},"texto":"Limpar o estágio 6 do Subterrâneo"}]'::jsonb),
  ('FLYING'::text, 'dano', 7, '[{"regra":{"t":"abates","tipo":"FLYING","alvo":3500},"texto":"Derrotar 3.500 POKEs FLYING"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"FLYING"},"alvo":8},"texto":"Ter 8 espécies FLYING diferentes capturadas por você"}]'::jsonb),
  ('FLYING'::text, 'dano', 8, '[{"regra":{"t":"abates","tipo":"FLYING","alvo":5000},"texto":"Derrotar 5.000 POKEs FLYING"},{"regra":{"t":"posse","f":{"tipo":"FLYING","nivel_min":60},"alvo":1},"texto":"Ter um POKE FLYING capturado por você no Lv 60"}]'::jsonb),
  ('FLYING'::text, 'dano', 9, '[{"regra":{"t":"abates","tipo":"FLYING","alvo":7000},"texto":"Derrotar 7.000 POKEs FLYING"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"subterraneo","alvo":9},"texto":"Limpar o estágio 9 do Subterrâneo"}]'::jsonb),
  ('FLYING'::text, 'dano', 10, '[{"regra":{"t":"abates","tipo":"FLYING","alvo":10000},"texto":"Derrotar 10.000 POKEs FLYING"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"subterraneo","alvo":10},"texto":"Limpar o estágio 10 do Subterrâneo"},{"regra":{"t":"posse","f":{"tipo":"FLYING","nivel_min":80},"alvo":1},"texto":"Ter um POKE FLYING capturado por você no Lv 80"}]'::jsonb),
  ('FLYING'::text, 'defesa', 1, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:FLYING","alvo":1800},"texto":"Caçar 30 min com um POKE FLYING em campo"}]'::jsonb),
  ('FLYING'::text, 'defesa', 2, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:FLYING","alvo":3600},"texto":"Caçar 1 h com um POKE FLYING em campo"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"FLYING"},"alvo":3},"texto":"Ter 3 espécies FLYING diferentes capturadas por você"}]'::jsonb),
  ('FLYING'::text, 'defesa', 3, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:FLYING","alvo":7200},"texto":"Caçar 2 h com um POKE FLYING em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"subterraneo","alvo":3},"texto":"Limpar o estágio 3 do Subterrâneo"}]'::jsonb),
  ('FLYING'::text, 'defesa', 4, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:FLYING","alvo":14400},"texto":"Caçar 4 h com um POKE FLYING em campo"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"FLYING"},"alvo":5},"texto":"Ter 5 espécies FLYING diferentes capturadas por você"}]'::jsonb),
  ('FLYING'::text, 'defesa', 5, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:FLYING","alvo":21600},"texto":"Caçar 6 h com um POKE FLYING em campo"},{"regra":{"t":"posse","f":{"tipo":"FLYING","nivel_min":40},"alvo":1},"texto":"Ter um POKE FLYING capturado por você no Lv 40"}]'::jsonb),
  ('FLYING'::text, 'defesa', 6, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:FLYING","alvo":36000},"texto":"Caçar 10 h com um POKE FLYING em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"subterraneo","alvo":6},"texto":"Limpar o estágio 6 do Subterrâneo"}]'::jsonb),
  ('FLYING'::text, 'defesa', 7, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:FLYING","alvo":54000},"texto":"Caçar 15 h com um POKE FLYING em campo"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"FLYING"},"alvo":8},"texto":"Ter 8 espécies FLYING diferentes capturadas por você"}]'::jsonb),
  ('FLYING'::text, 'defesa', 8, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:FLYING","alvo":72000},"texto":"Caçar 20 h com um POKE FLYING em campo"},{"regra":{"t":"posse","f":{"tipo":"FLYING","nivel_min":60},"alvo":1},"texto":"Ter um POKE FLYING capturado por você no Lv 60"}]'::jsonb),
  ('FLYING'::text, 'defesa', 9, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:FLYING","alvo":108000},"texto":"Caçar 30 h com um POKE FLYING em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"subterraneo","alvo":9},"texto":"Limpar o estágio 9 do Subterrâneo"}]'::jsonb),
  ('FLYING'::text, 'defesa', 10, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:FLYING","alvo":144000},"texto":"Caçar 40 h com um POKE FLYING em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"subterraneo","alvo":10},"texto":"Limpar o estágio 10 do Subterrâneo"},{"regra":{"t":"posse","f":{"tipo":"FLYING","nivel_min":80},"alvo":1},"texto":"Ter um POKE FLYING capturado por você no Lv 80"}]'::jsonb),
  ('PSYCHIC'::text, 'dano', 1, '[{"regra":{"t":"abates","tipo":"PSYCHIC","alvo":100},"texto":"Derrotar 100 POKEs PSYCHIC"}]'::jsonb),
  ('PSYCHIC'::text, 'dano', 2, '[{"regra":{"t":"abates","tipo":"PSYCHIC","alvo":300},"texto":"Derrotar 300 POKEs PSYCHIC"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"PSYCHIC"},"alvo":3},"texto":"Ter 3 espécies PSYCHIC diferentes capturadas por você"}]'::jsonb),
  ('PSYCHIC'::text, 'dano', 3, '[{"regra":{"t":"abates","tipo":"PSYCHIC","alvo":600},"texto":"Derrotar 600 POKEs PSYCHIC"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"sagrado","alvo":3},"texto":"Limpar o estágio 3 do Sagrado"}]'::jsonb),
  ('PSYCHIC'::text, 'dano', 4, '[{"regra":{"t":"abates","tipo":"PSYCHIC","alvo":1000},"texto":"Derrotar 1.000 POKEs PSYCHIC"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"PSYCHIC"},"alvo":5},"texto":"Ter 5 espécies PSYCHIC diferentes capturadas por você"}]'::jsonb),
  ('PSYCHIC'::text, 'dano', 5, '[{"regra":{"t":"abates","tipo":"PSYCHIC","alvo":1600},"texto":"Derrotar 1.600 POKEs PSYCHIC"},{"regra":{"t":"posse","f":{"tipo":"PSYCHIC","nivel_min":40},"alvo":1},"texto":"Ter um POKE PSYCHIC capturado por você no Lv 40"}]'::jsonb),
  ('PSYCHIC'::text, 'dano', 6, '[{"regra":{"t":"abates","tipo":"PSYCHIC","alvo":2400},"texto":"Derrotar 2.400 POKEs PSYCHIC"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"sagrado","alvo":6},"texto":"Limpar o estágio 6 do Sagrado"}]'::jsonb),
  ('PSYCHIC'::text, 'dano', 7, '[{"regra":{"t":"abates","tipo":"PSYCHIC","alvo":3500},"texto":"Derrotar 3.500 POKEs PSYCHIC"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"PSYCHIC"},"alvo":8},"texto":"Ter 8 espécies PSYCHIC diferentes capturadas por você"}]'::jsonb),
  ('PSYCHIC'::text, 'dano', 8, '[{"regra":{"t":"abates","tipo":"PSYCHIC","alvo":5000},"texto":"Derrotar 5.000 POKEs PSYCHIC"},{"regra":{"t":"posse","f":{"tipo":"PSYCHIC","nivel_min":60},"alvo":1},"texto":"Ter um POKE PSYCHIC capturado por você no Lv 60"}]'::jsonb),
  ('PSYCHIC'::text, 'dano', 9, '[{"regra":{"t":"abates","tipo":"PSYCHIC","alvo":7000},"texto":"Derrotar 7.000 POKEs PSYCHIC"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"sagrado","alvo":9},"texto":"Limpar o estágio 9 do Sagrado"}]'::jsonb),
  ('PSYCHIC'::text, 'dano', 10, '[{"regra":{"t":"abates","tipo":"PSYCHIC","alvo":10000},"texto":"Derrotar 10.000 POKEs PSYCHIC"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"sagrado","alvo":10},"texto":"Limpar o estágio 10 do Sagrado"},{"regra":{"t":"posse","f":{"tipo":"PSYCHIC","nivel_min":80},"alvo":1},"texto":"Ter um POKE PSYCHIC capturado por você no Lv 80"}]'::jsonb),
  ('PSYCHIC'::text, 'defesa', 1, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:PSYCHIC","alvo":1800},"texto":"Caçar 30 min com um POKE PSYCHIC em campo"}]'::jsonb),
  ('PSYCHIC'::text, 'defesa', 2, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:PSYCHIC","alvo":3600},"texto":"Caçar 1 h com um POKE PSYCHIC em campo"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"PSYCHIC"},"alvo":3},"texto":"Ter 3 espécies PSYCHIC diferentes capturadas por você"}]'::jsonb),
  ('PSYCHIC'::text, 'defesa', 3, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:PSYCHIC","alvo":7200},"texto":"Caçar 2 h com um POKE PSYCHIC em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"sagrado","alvo":3},"texto":"Limpar o estágio 3 do Sagrado"}]'::jsonb),
  ('PSYCHIC'::text, 'defesa', 4, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:PSYCHIC","alvo":14400},"texto":"Caçar 4 h com um POKE PSYCHIC em campo"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"PSYCHIC"},"alvo":5},"texto":"Ter 5 espécies PSYCHIC diferentes capturadas por você"}]'::jsonb),
  ('PSYCHIC'::text, 'defesa', 5, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:PSYCHIC","alvo":21600},"texto":"Caçar 6 h com um POKE PSYCHIC em campo"},{"regra":{"t":"posse","f":{"tipo":"PSYCHIC","nivel_min":40},"alvo":1},"texto":"Ter um POKE PSYCHIC capturado por você no Lv 40"}]'::jsonb),
  ('PSYCHIC'::text, 'defesa', 6, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:PSYCHIC","alvo":36000},"texto":"Caçar 10 h com um POKE PSYCHIC em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"sagrado","alvo":6},"texto":"Limpar o estágio 6 do Sagrado"}]'::jsonb),
  ('PSYCHIC'::text, 'defesa', 7, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:PSYCHIC","alvo":54000},"texto":"Caçar 15 h com um POKE PSYCHIC em campo"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"PSYCHIC"},"alvo":8},"texto":"Ter 8 espécies PSYCHIC diferentes capturadas por você"}]'::jsonb),
  ('PSYCHIC'::text, 'defesa', 8, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:PSYCHIC","alvo":72000},"texto":"Caçar 20 h com um POKE PSYCHIC em campo"},{"regra":{"t":"posse","f":{"tipo":"PSYCHIC","nivel_min":60},"alvo":1},"texto":"Ter um POKE PSYCHIC capturado por você no Lv 60"}]'::jsonb),
  ('PSYCHIC'::text, 'defesa', 9, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:PSYCHIC","alvo":108000},"texto":"Caçar 30 h com um POKE PSYCHIC em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"sagrado","alvo":9},"texto":"Limpar o estágio 9 do Sagrado"}]'::jsonb),
  ('PSYCHIC'::text, 'defesa', 10, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:PSYCHIC","alvo":144000},"texto":"Caçar 40 h com um POKE PSYCHIC em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"sagrado","alvo":10},"texto":"Limpar o estágio 10 do Sagrado"},{"regra":{"t":"posse","f":{"tipo":"PSYCHIC","nivel_min":80},"alvo":1},"texto":"Ter um POKE PSYCHIC capturado por você no Lv 80"}]'::jsonb),
  ('BUG'::text, 'dano', 1, '[{"regra":{"t":"abates","tipo":"BUG","alvo":100},"texto":"Derrotar 100 POKEs BUG"}]'::jsonb),
  ('BUG'::text, 'dano', 2, '[{"regra":{"t":"abates","tipo":"BUG","alvo":300},"texto":"Derrotar 300 POKEs BUG"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"BUG"},"alvo":3},"texto":"Ter 3 espécies BUG diferentes capturadas por você"}]'::jsonb),
  ('BUG'::text, 'dano', 3, '[{"regra":{"t":"abates","tipo":"BUG","alvo":600},"texto":"Derrotar 600 POKEs BUG"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"mata","alvo":3},"texto":"Limpar o estágio 3 do Mata"}]'::jsonb),
  ('BUG'::text, 'dano', 4, '[{"regra":{"t":"abates","tipo":"BUG","alvo":1000},"texto":"Derrotar 1.000 POKEs BUG"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"BUG"},"alvo":5},"texto":"Ter 5 espécies BUG diferentes capturadas por você"}]'::jsonb),
  ('BUG'::text, 'dano', 5, '[{"regra":{"t":"abates","tipo":"BUG","alvo":1600},"texto":"Derrotar 1.600 POKEs BUG"},{"regra":{"t":"posse","f":{"tipo":"BUG","nivel_min":40},"alvo":1},"texto":"Ter um POKE BUG capturado por você no Lv 40"}]'::jsonb),
  ('BUG'::text, 'dano', 6, '[{"regra":{"t":"abates","tipo":"BUG","alvo":2400},"texto":"Derrotar 2.400 POKEs BUG"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"mata","alvo":6},"texto":"Limpar o estágio 6 do Mata"}]'::jsonb),
  ('BUG'::text, 'dano', 7, '[{"regra":{"t":"abates","tipo":"BUG","alvo":3500},"texto":"Derrotar 3.500 POKEs BUG"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"BUG"},"alvo":8},"texto":"Ter 8 espécies BUG diferentes capturadas por você"}]'::jsonb),
  ('BUG'::text, 'dano', 8, '[{"regra":{"t":"abates","tipo":"BUG","alvo":5000},"texto":"Derrotar 5.000 POKEs BUG"},{"regra":{"t":"posse","f":{"tipo":"BUG","nivel_min":60},"alvo":1},"texto":"Ter um POKE BUG capturado por você no Lv 60"}]'::jsonb),
  ('BUG'::text, 'dano', 9, '[{"regra":{"t":"abates","tipo":"BUG","alvo":7000},"texto":"Derrotar 7.000 POKEs BUG"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"mata","alvo":9},"texto":"Limpar o estágio 9 do Mata"}]'::jsonb),
  ('BUG'::text, 'dano', 10, '[{"regra":{"t":"abates","tipo":"BUG","alvo":10000},"texto":"Derrotar 10.000 POKEs BUG"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"mata","alvo":10},"texto":"Limpar o estágio 10 do Mata"},{"regra":{"t":"posse","f":{"tipo":"BUG","nivel_min":80},"alvo":1},"texto":"Ter um POKE BUG capturado por você no Lv 80"}]'::jsonb),
  ('BUG'::text, 'defesa', 1, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:BUG","alvo":1800},"texto":"Caçar 30 min com um POKE BUG em campo"}]'::jsonb),
  ('BUG'::text, 'defesa', 2, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:BUG","alvo":3600},"texto":"Caçar 1 h com um POKE BUG em campo"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"BUG"},"alvo":3},"texto":"Ter 3 espécies BUG diferentes capturadas por você"}]'::jsonb),
  ('BUG'::text, 'defesa', 3, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:BUG","alvo":7200},"texto":"Caçar 2 h com um POKE BUG em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"mata","alvo":3},"texto":"Limpar o estágio 3 do Mata"}]'::jsonb),
  ('BUG'::text, 'defesa', 4, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:BUG","alvo":14400},"texto":"Caçar 4 h com um POKE BUG em campo"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"BUG"},"alvo":5},"texto":"Ter 5 espécies BUG diferentes capturadas por você"}]'::jsonb),
  ('BUG'::text, 'defesa', 5, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:BUG","alvo":21600},"texto":"Caçar 6 h com um POKE BUG em campo"},{"regra":{"t":"posse","f":{"tipo":"BUG","nivel_min":40},"alvo":1},"texto":"Ter um POKE BUG capturado por você no Lv 40"}]'::jsonb),
  ('BUG'::text, 'defesa', 6, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:BUG","alvo":36000},"texto":"Caçar 10 h com um POKE BUG em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"mata","alvo":6},"texto":"Limpar o estágio 6 do Mata"}]'::jsonb),
  ('BUG'::text, 'defesa', 7, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:BUG","alvo":54000},"texto":"Caçar 15 h com um POKE BUG em campo"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"BUG"},"alvo":8},"texto":"Ter 8 espécies BUG diferentes capturadas por você"}]'::jsonb),
  ('BUG'::text, 'defesa', 8, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:BUG","alvo":72000},"texto":"Caçar 20 h com um POKE BUG em campo"},{"regra":{"t":"posse","f":{"tipo":"BUG","nivel_min":60},"alvo":1},"texto":"Ter um POKE BUG capturado por você no Lv 60"}]'::jsonb),
  ('BUG'::text, 'defesa', 9, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:BUG","alvo":108000},"texto":"Caçar 30 h com um POKE BUG em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"mata","alvo":9},"texto":"Limpar o estágio 9 do Mata"}]'::jsonb),
  ('BUG'::text, 'defesa', 10, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:BUG","alvo":144000},"texto":"Caçar 40 h com um POKE BUG em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"mata","alvo":10},"texto":"Limpar o estágio 10 do Mata"},{"regra":{"t":"posse","f":{"tipo":"BUG","nivel_min":80},"alvo":1},"texto":"Ter um POKE BUG capturado por você no Lv 80"}]'::jsonb),
  ('ROCK'::text, 'dano', 1, '[{"regra":{"t":"abates","tipo":"ROCK","alvo":100},"texto":"Derrotar 100 POKEs ROCK"}]'::jsonb),
  ('ROCK'::text, 'dano', 2, '[{"regra":{"t":"abates","tipo":"ROCK","alvo":300},"texto":"Derrotar 300 POKEs ROCK"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"ROCK"},"alvo":3},"texto":"Ter 3 espécies ROCK diferentes capturadas por você"}]'::jsonb),
  ('ROCK'::text, 'dano', 3, '[{"regra":{"t":"abates","tipo":"ROCK","alvo":600},"texto":"Derrotar 600 POKEs ROCK"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"subterraneo","alvo":3},"texto":"Limpar o estágio 3 do Subterrâneo"}]'::jsonb),
  ('ROCK'::text, 'dano', 4, '[{"regra":{"t":"abates","tipo":"ROCK","alvo":1000},"texto":"Derrotar 1.000 POKEs ROCK"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"ROCK"},"alvo":5},"texto":"Ter 5 espécies ROCK diferentes capturadas por você"}]'::jsonb),
  ('ROCK'::text, 'dano', 5, '[{"regra":{"t":"abates","tipo":"ROCK","alvo":1600},"texto":"Derrotar 1.600 POKEs ROCK"},{"regra":{"t":"posse","f":{"tipo":"ROCK","nivel_min":40},"alvo":1},"texto":"Ter um POKE ROCK capturado por você no Lv 40"}]'::jsonb),
  ('ROCK'::text, 'dano', 6, '[{"regra":{"t":"abates","tipo":"ROCK","alvo":2400},"texto":"Derrotar 2.400 POKEs ROCK"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"subterraneo","alvo":6},"texto":"Limpar o estágio 6 do Subterrâneo"}]'::jsonb),
  ('ROCK'::text, 'dano', 7, '[{"regra":{"t":"abates","tipo":"ROCK","alvo":3500},"texto":"Derrotar 3.500 POKEs ROCK"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"ROCK"},"alvo":8},"texto":"Ter 8 espécies ROCK diferentes capturadas por você"}]'::jsonb),
  ('ROCK'::text, 'dano', 8, '[{"regra":{"t":"abates","tipo":"ROCK","alvo":5000},"texto":"Derrotar 5.000 POKEs ROCK"},{"regra":{"t":"posse","f":{"tipo":"ROCK","nivel_min":60},"alvo":1},"texto":"Ter um POKE ROCK capturado por você no Lv 60"}]'::jsonb),
  ('ROCK'::text, 'dano', 9, '[{"regra":{"t":"abates","tipo":"ROCK","alvo":7000},"texto":"Derrotar 7.000 POKEs ROCK"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"subterraneo","alvo":9},"texto":"Limpar o estágio 9 do Subterrâneo"}]'::jsonb),
  ('ROCK'::text, 'dano', 10, '[{"regra":{"t":"abates","tipo":"ROCK","alvo":10000},"texto":"Derrotar 10.000 POKEs ROCK"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"subterraneo","alvo":10},"texto":"Limpar o estágio 10 do Subterrâneo"},{"regra":{"t":"posse","f":{"tipo":"ROCK","nivel_min":80},"alvo":1},"texto":"Ter um POKE ROCK capturado por você no Lv 80"}]'::jsonb),
  ('ROCK'::text, 'defesa', 1, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:ROCK","alvo":1800},"texto":"Caçar 30 min com um POKE ROCK em campo"}]'::jsonb),
  ('ROCK'::text, 'defesa', 2, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:ROCK","alvo":3600},"texto":"Caçar 1 h com um POKE ROCK em campo"},{"regra":{"t":"contador","chave":"clima_seg:areia","alvo":1800},"texto":"Caçar 30 min sob tempestade de areia"}]'::jsonb),
  ('ROCK'::text, 'defesa', 3, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:ROCK","alvo":7200},"texto":"Caçar 2 h com um POKE ROCK em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"subterraneo","alvo":3},"texto":"Limpar o estágio 3 do Subterrâneo"}]'::jsonb),
  ('ROCK'::text, 'defesa', 4, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:ROCK","alvo":14400},"texto":"Caçar 4 h com um POKE ROCK em campo"},{"regra":{"t":"contador","chave":"clima_seg:areia","alvo":7200},"texto":"Caçar 2 h sob tempestade de areia"}]'::jsonb),
  ('ROCK'::text, 'defesa', 5, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:ROCK","alvo":21600},"texto":"Caçar 6 h com um POKE ROCK em campo"},{"regra":{"t":"posse","f":{"tipo":"ROCK","nivel_min":40},"alvo":1},"texto":"Ter um POKE ROCK capturado por você no Lv 40"}]'::jsonb),
  ('ROCK'::text, 'defesa', 6, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:ROCK","alvo":36000},"texto":"Caçar 10 h com um POKE ROCK em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"subterraneo","alvo":6},"texto":"Limpar o estágio 6 do Subterrâneo"}]'::jsonb),
  ('ROCK'::text, 'defesa', 7, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:ROCK","alvo":54000},"texto":"Caçar 15 h com um POKE ROCK em campo"},{"regra":{"t":"contador","chave":"clima_seg:areia","alvo":18000},"texto":"Caçar 5 h sob tempestade de areia"}]'::jsonb),
  ('ROCK'::text, 'defesa', 8, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:ROCK","alvo":72000},"texto":"Caçar 20 h com um POKE ROCK em campo"},{"regra":{"t":"posse","f":{"tipo":"ROCK","nivel_min":60},"alvo":1},"texto":"Ter um POKE ROCK capturado por você no Lv 60"}]'::jsonb),
  ('ROCK'::text, 'defesa', 9, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:ROCK","alvo":108000},"texto":"Caçar 30 h com um POKE ROCK em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"subterraneo","alvo":9},"texto":"Limpar o estágio 9 do Subterrâneo"}]'::jsonb),
  ('ROCK'::text, 'defesa', 10, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:ROCK","alvo":144000},"texto":"Caçar 40 h com um POKE ROCK em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"subterraneo","alvo":10},"texto":"Limpar o estágio 10 do Subterrâneo"},{"regra":{"t":"posse","f":{"tipo":"ROCK","nivel_min":80},"alvo":1},"texto":"Ter um POKE ROCK capturado por você no Lv 80"}]'::jsonb),
  ('GHOST'::text, 'dano', 1, '[{"regra":{"t":"abates","tipo":"GHOST","alvo":100},"texto":"Derrotar 100 POKEs GHOST"}]'::jsonb),
  ('GHOST'::text, 'dano', 2, '[{"regra":{"t":"abates","tipo":"GHOST","alvo":300},"texto":"Derrotar 300 POKEs GHOST"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"GHOST"},"alvo":3},"texto":"Ter 3 espécies GHOST diferentes capturadas por você"}]'::jsonb),
  ('GHOST'::text, 'dano', 3, '[{"regra":{"t":"abates","tipo":"GHOST","alvo":600},"texto":"Derrotar 600 POKEs GHOST"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"sombrio","alvo":3},"texto":"Limpar o estágio 3 do Sombrio"}]'::jsonb),
  ('GHOST'::text, 'dano', 4, '[{"regra":{"t":"abates","tipo":"GHOST","alvo":1000},"texto":"Derrotar 1.000 POKEs GHOST"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"GHOST"},"alvo":5},"texto":"Ter 5 espécies GHOST diferentes capturadas por você"}]'::jsonb),
  ('GHOST'::text, 'dano', 5, '[{"regra":{"t":"abates","tipo":"GHOST","alvo":1600},"texto":"Derrotar 1.600 POKEs GHOST"},{"regra":{"t":"posse","f":{"tipo":"GHOST","nivel_min":40},"alvo":1},"texto":"Ter um POKE GHOST capturado por você no Lv 40"}]'::jsonb),
  ('GHOST'::text, 'dano', 6, '[{"regra":{"t":"abates","tipo":"GHOST","alvo":2400},"texto":"Derrotar 2.400 POKEs GHOST"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"sombrio","alvo":6},"texto":"Limpar o estágio 6 do Sombrio"}]'::jsonb),
  ('GHOST'::text, 'dano', 7, '[{"regra":{"t":"abates","tipo":"GHOST","alvo":3500},"texto":"Derrotar 3.500 POKEs GHOST"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"GHOST"},"alvo":8},"texto":"Ter 8 espécies GHOST diferentes capturadas por você"}]'::jsonb),
  ('GHOST'::text, 'dano', 8, '[{"regra":{"t":"abates","tipo":"GHOST","alvo":5000},"texto":"Derrotar 5.000 POKEs GHOST"},{"regra":{"t":"posse","f":{"tipo":"GHOST","nivel_min":60},"alvo":1},"texto":"Ter um POKE GHOST capturado por você no Lv 60"}]'::jsonb),
  ('GHOST'::text, 'dano', 9, '[{"regra":{"t":"abates","tipo":"GHOST","alvo":7000},"texto":"Derrotar 7.000 POKEs GHOST"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"sombrio","alvo":9},"texto":"Limpar o estágio 9 do Sombrio"}]'::jsonb),
  ('GHOST'::text, 'dano', 10, '[{"regra":{"t":"abates","tipo":"GHOST","alvo":10000},"texto":"Derrotar 10.000 POKEs GHOST"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"sombrio","alvo":10},"texto":"Limpar o estágio 10 do Sombrio"},{"regra":{"t":"posse","f":{"tipo":"GHOST","nivel_min":80},"alvo":1},"texto":"Ter um POKE GHOST capturado por você no Lv 80"}]'::jsonb),
  ('GHOST'::text, 'defesa', 1, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:GHOST","alvo":1800},"texto":"Caçar 30 min com um POKE GHOST em campo"}]'::jsonb),
  ('GHOST'::text, 'defesa', 2, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:GHOST","alvo":3600},"texto":"Caçar 1 h com um POKE GHOST em campo"},{"regra":{"t":"contador","chave":"clima_seg:nevoa","alvo":1800},"texto":"Caçar 30 min sob névoa"}]'::jsonb),
  ('GHOST'::text, 'defesa', 3, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:GHOST","alvo":7200},"texto":"Caçar 2 h com um POKE GHOST em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"sombrio","alvo":3},"texto":"Limpar o estágio 3 do Sombrio"}]'::jsonb),
  ('GHOST'::text, 'defesa', 4, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:GHOST","alvo":14400},"texto":"Caçar 4 h com um POKE GHOST em campo"},{"regra":{"t":"contador","chave":"clima_seg:nevoa","alvo":7200},"texto":"Caçar 2 h sob névoa"}]'::jsonb),
  ('GHOST'::text, 'defesa', 5, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:GHOST","alvo":21600},"texto":"Caçar 6 h com um POKE GHOST em campo"},{"regra":{"t":"posse","f":{"tipo":"GHOST","nivel_min":40},"alvo":1},"texto":"Ter um POKE GHOST capturado por você no Lv 40"}]'::jsonb),
  ('GHOST'::text, 'defesa', 6, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:GHOST","alvo":36000},"texto":"Caçar 10 h com um POKE GHOST em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"sombrio","alvo":6},"texto":"Limpar o estágio 6 do Sombrio"}]'::jsonb),
  ('GHOST'::text, 'defesa', 7, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:GHOST","alvo":54000},"texto":"Caçar 15 h com um POKE GHOST em campo"},{"regra":{"t":"contador","chave":"clima_seg:nevoa","alvo":18000},"texto":"Caçar 5 h sob névoa"}]'::jsonb),
  ('GHOST'::text, 'defesa', 8, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:GHOST","alvo":72000},"texto":"Caçar 20 h com um POKE GHOST em campo"},{"regra":{"t":"posse","f":{"tipo":"GHOST","nivel_min":60},"alvo":1},"texto":"Ter um POKE GHOST capturado por você no Lv 60"}]'::jsonb),
  ('GHOST'::text, 'defesa', 9, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:GHOST","alvo":108000},"texto":"Caçar 30 h com um POKE GHOST em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"sombrio","alvo":9},"texto":"Limpar o estágio 9 do Sombrio"}]'::jsonb),
  ('GHOST'::text, 'defesa', 10, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:GHOST","alvo":144000},"texto":"Caçar 40 h com um POKE GHOST em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"sombrio","alvo":10},"texto":"Limpar o estágio 10 do Sombrio"},{"regra":{"t":"posse","f":{"tipo":"GHOST","nivel_min":80},"alvo":1},"texto":"Ter um POKE GHOST capturado por você no Lv 80"}]'::jsonb),
  ('DRAGON'::text, 'dano', 1, '[{"regra":{"t":"abates","tipo":"DRAGON","alvo":100},"texto":"Derrotar 100 POKEs DRAGON"}]'::jsonb),
  ('DRAGON'::text, 'dano', 2, '[{"regra":{"t":"abates","tipo":"DRAGON","alvo":300},"texto":"Derrotar 300 POKEs DRAGON"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"DRAGON"},"alvo":3},"texto":"Ter 3 espécies DRAGON diferentes capturadas por você"}]'::jsonb),
  ('DRAGON'::text, 'dano', 3, '[{"regra":{"t":"abates","tipo":"DRAGON","alvo":600},"texto":"Derrotar 600 POKEs DRAGON"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"aridos","alvo":3},"texto":"Limpar o estágio 3 do Áridos"}]'::jsonb),
  ('DRAGON'::text, 'dano', 4, '[{"regra":{"t":"abates","tipo":"DRAGON","alvo":1000},"texto":"Derrotar 1.000 POKEs DRAGON"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"DRAGON"},"alvo":5},"texto":"Ter 5 espécies DRAGON diferentes capturadas por você"}]'::jsonb),
  ('DRAGON'::text, 'dano', 5, '[{"regra":{"t":"abates","tipo":"DRAGON","alvo":1600},"texto":"Derrotar 1.600 POKEs DRAGON"},{"regra":{"t":"posse","f":{"tipo":"DRAGON","nivel_min":40},"alvo":1},"texto":"Ter um POKE DRAGON capturado por você no Lv 40"}]'::jsonb),
  ('DRAGON'::text, 'dano', 6, '[{"regra":{"t":"abates","tipo":"DRAGON","alvo":2400},"texto":"Derrotar 2.400 POKEs DRAGON"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"aridos","alvo":6},"texto":"Limpar o estágio 6 do Áridos"}]'::jsonb),
  ('DRAGON'::text, 'dano', 7, '[{"regra":{"t":"abates","tipo":"DRAGON","alvo":3500},"texto":"Derrotar 3.500 POKEs DRAGON"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"DRAGON"},"alvo":8},"texto":"Ter 8 espécies DRAGON diferentes capturadas por você"}]'::jsonb),
  ('DRAGON'::text, 'dano', 8, '[{"regra":{"t":"abates","tipo":"DRAGON","alvo":5000},"texto":"Derrotar 5.000 POKEs DRAGON"},{"regra":{"t":"posse","f":{"tipo":"DRAGON","nivel_min":60},"alvo":1},"texto":"Ter um POKE DRAGON capturado por você no Lv 60"}]'::jsonb),
  ('DRAGON'::text, 'dano', 9, '[{"regra":{"t":"abates","tipo":"DRAGON","alvo":7000},"texto":"Derrotar 7.000 POKEs DRAGON"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"aridos","alvo":9},"texto":"Limpar o estágio 9 do Áridos"}]'::jsonb),
  ('DRAGON'::text, 'dano', 10, '[{"regra":{"t":"abates","tipo":"DRAGON","alvo":10000},"texto":"Derrotar 10.000 POKEs DRAGON"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"aridos","alvo":10},"texto":"Limpar o estágio 10 do Áridos"},{"regra":{"t":"posse","f":{"tipo":"DRAGON","nivel_min":80},"alvo":1},"texto":"Ter um POKE DRAGON capturado por você no Lv 80"}]'::jsonb),
  ('DRAGON'::text, 'defesa', 1, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:DRAGON","alvo":1800},"texto":"Caçar 30 min com um POKE DRAGON em campo"}]'::jsonb),
  ('DRAGON'::text, 'defesa', 2, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:DRAGON","alvo":3600},"texto":"Caçar 1 h com um POKE DRAGON em campo"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"DRAGON"},"alvo":3},"texto":"Ter 3 espécies DRAGON diferentes capturadas por você"}]'::jsonb),
  ('DRAGON'::text, 'defesa', 3, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:DRAGON","alvo":7200},"texto":"Caçar 2 h com um POKE DRAGON em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"aridos","alvo":3},"texto":"Limpar o estágio 3 do Áridos"}]'::jsonb),
  ('DRAGON'::text, 'defesa', 4, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:DRAGON","alvo":14400},"texto":"Caçar 4 h com um POKE DRAGON em campo"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"DRAGON"},"alvo":5},"texto":"Ter 5 espécies DRAGON diferentes capturadas por você"}]'::jsonb),
  ('DRAGON'::text, 'defesa', 5, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:DRAGON","alvo":21600},"texto":"Caçar 6 h com um POKE DRAGON em campo"},{"regra":{"t":"posse","f":{"tipo":"DRAGON","nivel_min":40},"alvo":1},"texto":"Ter um POKE DRAGON capturado por você no Lv 40"}]'::jsonb),
  ('DRAGON'::text, 'defesa', 6, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:DRAGON","alvo":36000},"texto":"Caçar 10 h com um POKE DRAGON em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"aridos","alvo":6},"texto":"Limpar o estágio 6 do Áridos"}]'::jsonb),
  ('DRAGON'::text, 'defesa', 7, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:DRAGON","alvo":54000},"texto":"Caçar 15 h com um POKE DRAGON em campo"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"DRAGON"},"alvo":8},"texto":"Ter 8 espécies DRAGON diferentes capturadas por você"}]'::jsonb),
  ('DRAGON'::text, 'defesa', 8, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:DRAGON","alvo":72000},"texto":"Caçar 20 h com um POKE DRAGON em campo"},{"regra":{"t":"posse","f":{"tipo":"DRAGON","nivel_min":60},"alvo":1},"texto":"Ter um POKE DRAGON capturado por você no Lv 60"}]'::jsonb),
  ('DRAGON'::text, 'defesa', 9, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:DRAGON","alvo":108000},"texto":"Caçar 30 h com um POKE DRAGON em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"aridos","alvo":9},"texto":"Limpar o estágio 9 do Áridos"}]'::jsonb),
  ('DRAGON'::text, 'defesa', 10, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:DRAGON","alvo":144000},"texto":"Caçar 40 h com um POKE DRAGON em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"aridos","alvo":10},"texto":"Limpar o estágio 10 do Áridos"},{"regra":{"t":"posse","f":{"tipo":"DRAGON","nivel_min":80},"alvo":1},"texto":"Ter um POKE DRAGON capturado por você no Lv 80"}]'::jsonb),
  ('DARK'::text, 'dano', 1, '[{"regra":{"t":"abates","tipo":"DARK","alvo":100},"texto":"Derrotar 100 POKEs DARK"}]'::jsonb),
  ('DARK'::text, 'dano', 2, '[{"regra":{"t":"abates","tipo":"DARK","alvo":300},"texto":"Derrotar 300 POKEs DARK"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"DARK"},"alvo":3},"texto":"Ter 3 espécies DARK diferentes capturadas por você"}]'::jsonb),
  ('DARK'::text, 'dano', 3, '[{"regra":{"t":"abates","tipo":"DARK","alvo":600},"texto":"Derrotar 600 POKEs DARK"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"sombrio","alvo":3},"texto":"Limpar o estágio 3 do Sombrio"}]'::jsonb),
  ('DARK'::text, 'dano', 4, '[{"regra":{"t":"abates","tipo":"DARK","alvo":1000},"texto":"Derrotar 1.000 POKEs DARK"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"DARK"},"alvo":5},"texto":"Ter 5 espécies DARK diferentes capturadas por você"}]'::jsonb),
  ('DARK'::text, 'dano', 5, '[{"regra":{"t":"abates","tipo":"DARK","alvo":1600},"texto":"Derrotar 1.600 POKEs DARK"},{"regra":{"t":"posse","f":{"tipo":"DARK","nivel_min":40},"alvo":1},"texto":"Ter um POKE DARK capturado por você no Lv 40"}]'::jsonb),
  ('DARK'::text, 'dano', 6, '[{"regra":{"t":"abates","tipo":"DARK","alvo":2400},"texto":"Derrotar 2.400 POKEs DARK"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"sombrio","alvo":6},"texto":"Limpar o estágio 6 do Sombrio"}]'::jsonb),
  ('DARK'::text, 'dano', 7, '[{"regra":{"t":"abates","tipo":"DARK","alvo":3500},"texto":"Derrotar 3.500 POKEs DARK"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"DARK"},"alvo":8},"texto":"Ter 8 espécies DARK diferentes capturadas por você"}]'::jsonb),
  ('DARK'::text, 'dano', 8, '[{"regra":{"t":"abates","tipo":"DARK","alvo":5000},"texto":"Derrotar 5.000 POKEs DARK"},{"regra":{"t":"posse","f":{"tipo":"DARK","nivel_min":60},"alvo":1},"texto":"Ter um POKE DARK capturado por você no Lv 60"}]'::jsonb),
  ('DARK'::text, 'dano', 9, '[{"regra":{"t":"abates","tipo":"DARK","alvo":7000},"texto":"Derrotar 7.000 POKEs DARK"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"sombrio","alvo":9},"texto":"Limpar o estágio 9 do Sombrio"}]'::jsonb),
  ('DARK'::text, 'dano', 10, '[{"regra":{"t":"abates","tipo":"DARK","alvo":10000},"texto":"Derrotar 10.000 POKEs DARK"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"sombrio","alvo":10},"texto":"Limpar o estágio 10 do Sombrio"},{"regra":{"t":"posse","f":{"tipo":"DARK","nivel_min":80},"alvo":1},"texto":"Ter um POKE DARK capturado por você no Lv 80"}]'::jsonb),
  ('DARK'::text, 'defesa', 1, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:DARK","alvo":1800},"texto":"Caçar 30 min com um POKE DARK em campo"}]'::jsonb),
  ('DARK'::text, 'defesa', 2, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:DARK","alvo":3600},"texto":"Caçar 1 h com um POKE DARK em campo"},{"regra":{"t":"contador","chave":"clima_seg:nevoa","alvo":1800},"texto":"Caçar 30 min sob névoa"}]'::jsonb),
  ('DARK'::text, 'defesa', 3, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:DARK","alvo":7200},"texto":"Caçar 2 h com um POKE DARK em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"sombrio","alvo":3},"texto":"Limpar o estágio 3 do Sombrio"}]'::jsonb),
  ('DARK'::text, 'defesa', 4, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:DARK","alvo":14400},"texto":"Caçar 4 h com um POKE DARK em campo"},{"regra":{"t":"contador","chave":"clima_seg:nevoa","alvo":7200},"texto":"Caçar 2 h sob névoa"}]'::jsonb),
  ('DARK'::text, 'defesa', 5, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:DARK","alvo":21600},"texto":"Caçar 6 h com um POKE DARK em campo"},{"regra":{"t":"posse","f":{"tipo":"DARK","nivel_min":40},"alvo":1},"texto":"Ter um POKE DARK capturado por você no Lv 40"}]'::jsonb),
  ('DARK'::text, 'defesa', 6, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:DARK","alvo":36000},"texto":"Caçar 10 h com um POKE DARK em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"sombrio","alvo":6},"texto":"Limpar o estágio 6 do Sombrio"}]'::jsonb),
  ('DARK'::text, 'defesa', 7, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:DARK","alvo":54000},"texto":"Caçar 15 h com um POKE DARK em campo"},{"regra":{"t":"contador","chave":"clima_seg:nevoa","alvo":18000},"texto":"Caçar 5 h sob névoa"}]'::jsonb),
  ('DARK'::text, 'defesa', 8, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:DARK","alvo":72000},"texto":"Caçar 20 h com um POKE DARK em campo"},{"regra":{"t":"posse","f":{"tipo":"DARK","nivel_min":60},"alvo":1},"texto":"Ter um POKE DARK capturado por você no Lv 60"}]'::jsonb),
  ('DARK'::text, 'defesa', 9, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:DARK","alvo":108000},"texto":"Caçar 30 h com um POKE DARK em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"sombrio","alvo":9},"texto":"Limpar o estágio 9 do Sombrio"}]'::jsonb),
  ('DARK'::text, 'defesa', 10, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:DARK","alvo":144000},"texto":"Caçar 40 h com um POKE DARK em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"sombrio","alvo":10},"texto":"Limpar o estágio 10 do Sombrio"},{"regra":{"t":"posse","f":{"tipo":"DARK","nivel_min":80},"alvo":1},"texto":"Ter um POKE DARK capturado por você no Lv 80"}]'::jsonb),
  ('STEEL'::text, 'dano', 1, '[{"regra":{"t":"abates","tipo":"STEEL","alvo":100},"texto":"Derrotar 100 POKEs STEEL"}]'::jsonb),
  ('STEEL'::text, 'dano', 2, '[{"regra":{"t":"abates","tipo":"STEEL","alvo":300},"texto":"Derrotar 300 POKEs STEEL"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"STEEL"},"alvo":3},"texto":"Ter 3 espécies STEEL diferentes capturadas por você"}]'::jsonb),
  ('STEEL'::text, 'dano', 3, '[{"regra":{"t":"abates","tipo":"STEEL","alvo":600},"texto":"Derrotar 600 POKEs STEEL"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"industrial","alvo":3},"texto":"Limpar o estágio 3 do Industrial"}]'::jsonb),
  ('STEEL'::text, 'dano', 4, '[{"regra":{"t":"abates","tipo":"STEEL","alvo":1000},"texto":"Derrotar 1.000 POKEs STEEL"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"STEEL"},"alvo":5},"texto":"Ter 5 espécies STEEL diferentes capturadas por você"}]'::jsonb),
  ('STEEL'::text, 'dano', 5, '[{"regra":{"t":"abates","tipo":"STEEL","alvo":1600},"texto":"Derrotar 1.600 POKEs STEEL"},{"regra":{"t":"posse","f":{"tipo":"STEEL","nivel_min":40},"alvo":1},"texto":"Ter um POKE STEEL capturado por você no Lv 40"}]'::jsonb),
  ('STEEL'::text, 'dano', 6, '[{"regra":{"t":"abates","tipo":"STEEL","alvo":2400},"texto":"Derrotar 2.400 POKEs STEEL"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"industrial","alvo":6},"texto":"Limpar o estágio 6 do Industrial"}]'::jsonb),
  ('STEEL'::text, 'dano', 7, '[{"regra":{"t":"abates","tipo":"STEEL","alvo":3500},"texto":"Derrotar 3.500 POKEs STEEL"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"STEEL"},"alvo":8},"texto":"Ter 8 espécies STEEL diferentes capturadas por você"}]'::jsonb),
  ('STEEL'::text, 'dano', 8, '[{"regra":{"t":"abates","tipo":"STEEL","alvo":5000},"texto":"Derrotar 5.000 POKEs STEEL"},{"regra":{"t":"posse","f":{"tipo":"STEEL","nivel_min":60},"alvo":1},"texto":"Ter um POKE STEEL capturado por você no Lv 60"}]'::jsonb),
  ('STEEL'::text, 'dano', 9, '[{"regra":{"t":"abates","tipo":"STEEL","alvo":7000},"texto":"Derrotar 7.000 POKEs STEEL"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"industrial","alvo":9},"texto":"Limpar o estágio 9 do Industrial"}]'::jsonb),
  ('STEEL'::text, 'dano', 10, '[{"regra":{"t":"abates","tipo":"STEEL","alvo":10000},"texto":"Derrotar 10.000 POKEs STEEL"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"industrial","alvo":10},"texto":"Limpar o estágio 10 do Industrial"},{"regra":{"t":"posse","f":{"tipo":"STEEL","nivel_min":80},"alvo":1},"texto":"Ter um POKE STEEL capturado por você no Lv 80"}]'::jsonb),
  ('STEEL'::text, 'defesa', 1, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:STEEL","alvo":1800},"texto":"Caçar 30 min com um POKE STEEL em campo"}]'::jsonb),
  ('STEEL'::text, 'defesa', 2, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:STEEL","alvo":3600},"texto":"Caçar 1 h com um POKE STEEL em campo"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"STEEL"},"alvo":3},"texto":"Ter 3 espécies STEEL diferentes capturadas por você"}]'::jsonb),
  ('STEEL'::text, 'defesa', 3, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:STEEL","alvo":7200},"texto":"Caçar 2 h com um POKE STEEL em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"industrial","alvo":3},"texto":"Limpar o estágio 3 do Industrial"}]'::jsonb),
  ('STEEL'::text, 'defesa', 4, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:STEEL","alvo":14400},"texto":"Caçar 4 h com um POKE STEEL em campo"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"STEEL"},"alvo":5},"texto":"Ter 5 espécies STEEL diferentes capturadas por você"}]'::jsonb),
  ('STEEL'::text, 'defesa', 5, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:STEEL","alvo":21600},"texto":"Caçar 6 h com um POKE STEEL em campo"},{"regra":{"t":"posse","f":{"tipo":"STEEL","nivel_min":40},"alvo":1},"texto":"Ter um POKE STEEL capturado por você no Lv 40"}]'::jsonb),
  ('STEEL'::text, 'defesa', 6, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:STEEL","alvo":36000},"texto":"Caçar 10 h com um POKE STEEL em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"industrial","alvo":6},"texto":"Limpar o estágio 6 do Industrial"}]'::jsonb),
  ('STEEL'::text, 'defesa', 7, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:STEEL","alvo":54000},"texto":"Caçar 15 h com um POKE STEEL em campo"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"STEEL"},"alvo":8},"texto":"Ter 8 espécies STEEL diferentes capturadas por você"}]'::jsonb),
  ('STEEL'::text, 'defesa', 8, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:STEEL","alvo":72000},"texto":"Caçar 20 h com um POKE STEEL em campo"},{"regra":{"t":"posse","f":{"tipo":"STEEL","nivel_min":60},"alvo":1},"texto":"Ter um POKE STEEL capturado por você no Lv 60"}]'::jsonb),
  ('STEEL'::text, 'defesa', 9, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:STEEL","alvo":108000},"texto":"Caçar 30 h com um POKE STEEL em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"industrial","alvo":9},"texto":"Limpar o estágio 9 do Industrial"}]'::jsonb),
  ('STEEL'::text, 'defesa', 10, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:STEEL","alvo":144000},"texto":"Caçar 40 h com um POKE STEEL em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"industrial","alvo":10},"texto":"Limpar o estágio 10 do Industrial"},{"regra":{"t":"posse","f":{"tipo":"STEEL","nivel_min":80},"alvo":1},"texto":"Ter um POKE STEEL capturado por você no Lv 80"}]'::jsonb),
  ('FAIRY'::text, 'dano', 1, '[{"regra":{"t":"abates","tipo":"FAIRY","alvo":100},"texto":"Derrotar 100 POKEs FAIRY"}]'::jsonb),
  ('FAIRY'::text, 'dano', 2, '[{"regra":{"t":"abates","tipo":"FAIRY","alvo":300},"texto":"Derrotar 300 POKEs FAIRY"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"FAIRY"},"alvo":3},"texto":"Ter 3 espécies FAIRY diferentes capturadas por você"}]'::jsonb),
  ('FAIRY'::text, 'dano', 3, '[{"regra":{"t":"abates","tipo":"FAIRY","alvo":600},"texto":"Derrotar 600 POKEs FAIRY"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"sagrado","alvo":3},"texto":"Limpar o estágio 3 do Sagrado"}]'::jsonb),
  ('FAIRY'::text, 'dano', 4, '[{"regra":{"t":"abates","tipo":"FAIRY","alvo":1000},"texto":"Derrotar 1.000 POKEs FAIRY"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"FAIRY"},"alvo":5},"texto":"Ter 5 espécies FAIRY diferentes capturadas por você"}]'::jsonb),
  ('FAIRY'::text, 'dano', 5, '[{"regra":{"t":"abates","tipo":"FAIRY","alvo":1600},"texto":"Derrotar 1.600 POKEs FAIRY"},{"regra":{"t":"posse","f":{"tipo":"FAIRY","nivel_min":40},"alvo":1},"texto":"Ter um POKE FAIRY capturado por você no Lv 40"}]'::jsonb),
  ('FAIRY'::text, 'dano', 6, '[{"regra":{"t":"abates","tipo":"FAIRY","alvo":2400},"texto":"Derrotar 2.400 POKEs FAIRY"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"sagrado","alvo":6},"texto":"Limpar o estágio 6 do Sagrado"}]'::jsonb),
  ('FAIRY'::text, 'dano', 7, '[{"regra":{"t":"abates","tipo":"FAIRY","alvo":3500},"texto":"Derrotar 3.500 POKEs FAIRY"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"FAIRY"},"alvo":8},"texto":"Ter 8 espécies FAIRY diferentes capturadas por você"}]'::jsonb),
  ('FAIRY'::text, 'dano', 8, '[{"regra":{"t":"abates","tipo":"FAIRY","alvo":5000},"texto":"Derrotar 5.000 POKEs FAIRY"},{"regra":{"t":"posse","f":{"tipo":"FAIRY","nivel_min":60},"alvo":1},"texto":"Ter um POKE FAIRY capturado por você no Lv 60"}]'::jsonb),
  ('FAIRY'::text, 'dano', 9, '[{"regra":{"t":"abates","tipo":"FAIRY","alvo":7000},"texto":"Derrotar 7.000 POKEs FAIRY"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"sagrado","alvo":9},"texto":"Limpar o estágio 9 do Sagrado"}]'::jsonb),
  ('FAIRY'::text, 'dano', 10, '[{"regra":{"t":"abates","tipo":"FAIRY","alvo":10000},"texto":"Derrotar 10.000 POKEs FAIRY"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"sagrado","alvo":10},"texto":"Limpar o estágio 10 do Sagrado"},{"regra":{"t":"posse","f":{"tipo":"FAIRY","nivel_min":80},"alvo":1},"texto":"Ter um POKE FAIRY capturado por você no Lv 80"}]'::jsonb),
  ('FAIRY'::text, 'defesa', 1, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:FAIRY","alvo":1800},"texto":"Caçar 30 min com um POKE FAIRY em campo"}]'::jsonb),
  ('FAIRY'::text, 'defesa', 2, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:FAIRY","alvo":3600},"texto":"Caçar 1 h com um POKE FAIRY em campo"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"FAIRY"},"alvo":3},"texto":"Ter 3 espécies FAIRY diferentes capturadas por você"}]'::jsonb),
  ('FAIRY'::text, 'defesa', 3, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:FAIRY","alvo":7200},"texto":"Caçar 2 h com um POKE FAIRY em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"sagrado","alvo":3},"texto":"Limpar o estágio 3 do Sagrado"}]'::jsonb),
  ('FAIRY'::text, 'defesa', 4, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:FAIRY","alvo":14400},"texto":"Caçar 4 h com um POKE FAIRY em campo"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"FAIRY"},"alvo":5},"texto":"Ter 5 espécies FAIRY diferentes capturadas por você"}]'::jsonb),
  ('FAIRY'::text, 'defesa', 5, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:FAIRY","alvo":21600},"texto":"Caçar 6 h com um POKE FAIRY em campo"},{"regra":{"t":"posse","f":{"tipo":"FAIRY","nivel_min":40},"alvo":1},"texto":"Ter um POKE FAIRY capturado por você no Lv 40"}]'::jsonb),
  ('FAIRY'::text, 'defesa', 6, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:FAIRY","alvo":36000},"texto":"Caçar 10 h com um POKE FAIRY em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"sagrado","alvo":6},"texto":"Limpar o estágio 6 do Sagrado"}]'::jsonb),
  ('FAIRY'::text, 'defesa', 7, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:FAIRY","alvo":54000},"texto":"Caçar 15 h com um POKE FAIRY em campo"},{"regra":{"t":"colecao","de":"possuidas","f":{"tipo":"FAIRY"},"alvo":8},"texto":"Ter 8 espécies FAIRY diferentes capturadas por você"}]'::jsonb),
  ('FAIRY'::text, 'defesa', 8, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:FAIRY","alvo":72000},"texto":"Caçar 20 h com um POKE FAIRY em campo"},{"regra":{"t":"posse","f":{"tipo":"FAIRY","nivel_min":60},"alvo":1},"texto":"Ter um POKE FAIRY capturado por você no Lv 60"}]'::jsonb),
  ('FAIRY'::text, 'defesa', 9, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:FAIRY","alvo":108000},"texto":"Caçar 30 h com um POKE FAIRY em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"sagrado","alvo":9},"texto":"Limpar o estágio 9 do Sagrado"}]'::jsonb),
  ('FAIRY'::text, 'defesa', 10, '[{"regra":{"t":"contador","chave":"ativo_tipo_seg:FAIRY","alvo":144000},"texto":"Caçar 40 h com um POKE FAIRY em campo"},{"regra":{"t":"metrica","m":"estagio_do_bioma","arg":"sagrado","alvo":10},"texto":"Limpar o estágio 10 do Sagrado"},{"regra":{"t":"posse","f":{"tipo":"FAIRY","nivel_min":80},"alvo":1},"texto":"Ter um POKE FAIRY capturado por você no Lv 80"}]'::jsonb);

-- Os requisitos da proxima missao de cada (tipo, trilha), com valor e alvo, pra
-- a tela mostrar a barra. Missao de quem ja esta no nivel maximo nao vem.
create or replace function public.minhas_missoes_especialidade()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'tipo', m.tipo, 'trilha', m.trilha, 'nivel', m.nivel,
      'requisitos', (
        select jsonb_agg(jsonb_build_object(
          'valor', public.conquista_valor(v_user_id, r->'regra'),
          'alvo', public.conquista_alvo(r->'regra')
        ) order by ord)
        from jsonb_array_elements(m.requisitos) with ordinality as x(r, ord)
      )
    ))
    from public.especialidade_missao m
    left join public.player_especialidades e on e.user_id = v_user_id and e.tipo = m.tipo
    where m.nivel = coalesce(case m.trilha when 'dano' then e.dano_nivel else e.defesa_nivel end, 0) + 1
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.minhas_missoes_especialidade() from public;
grant execute on function public.minhas_missoes_especialidade() to authenticated;

create or replace function public.subir_nivel_especialidade(p_tipo text, p_trilha text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_nivel_atual int;
  -- Custo POR TIPO. Antes era um array unico pros 18 — ver o cabecalho.
  v_stone_qtd_por_nivel int[];
  v_gold_por_nivel bigint[] := array[500, 1000, 2000, 3500, 6000, 10000, 15000, 22000, 32000, 45000];
  v_stone_qtd int;
  v_gold bigint;
  v_stone_id text;
  v_stone_atual int;
  v_requisitos jsonb;
  v_req jsonb;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;
  if p_trilha not in ('dano', 'defesa') then
    raise exception 'trilha invalida' using errcode = 'P0001';
  end if;

  -- O `case` tambem faz o papel de validar o tipo: nome fora da lista cai no
  -- `else` implicito e deixa a variavel nula.
  v_stone_qtd_por_nivel := case p_tipo
    when 'NORMAL' then array[3, 5, 7, 11, 15, 21, 29, 37, 47, 62]
    when 'FIRE' then array[6, 10, 15, 23, 33, 45, 60, 77, 100, 131]
    when 'WATER' then array[6, 10, 15, 23, 33, 45, 60, 77, 100, 131]
    when 'ELECTRIC' then array[6, 10, 15, 23, 33, 45, 60, 77, 100, 131]
    when 'GRASS' then array[3, 5, 8, 11, 16, 22, 30, 39, 50, 66]
    when 'ICE' then array[6, 10, 15, 23, 33, 45, 60, 77, 100, 131]
    when 'FIGHTING' then array[2, 3, 4, 7, 9, 13, 17, 22, 29, 38]
    when 'POISON' then array[2, 3, 4, 6, 9, 12, 17, 21, 28, 36]
    when 'GROUND' then array[6, 10, 15, 23, 33, 45, 60, 77, 100, 131]
    when 'FLYING' then array[3, 5, 8, 11, 16, 22, 30, 39, 50, 66]
    when 'PSYCHIC' then array[6, 10, 15, 23, 33, 45, 60, 77, 100, 131]
    when 'BUG' then array[1, 2, 4, 5, 8, 11, 14, 18, 24, 31]
    when 'ROCK' then array[6, 10, 15, 23, 33, 45, 60, 77, 100, 131]
    when 'GHOST' then array[2, 3, 4, 7, 9, 13, 17, 23, 29, 38]
    when 'DRAGON' then array[3, 5, 8, 11, 16, 22, 30, 39, 50, 66]
    when 'DARK' then array[1, 2, 2, 4, 5, 8, 10, 13, 17, 22]
    when 'STEEL' then array[6, 10, 15, 23, 33, 45, 60, 77, 100, 131]
    when 'FAIRY' then array[1, 1, 1, 1, 2, 3, 4, 5, 7, 9]
  end;
  if v_stone_qtd_por_nivel is null then
    raise exception 'tipo invalido' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

  insert into public.player_especialidades (user_id, tipo) values (v_user_id, p_tipo)
    on conflict (user_id, tipo) do nothing;

  select case p_trilha when 'dano' then dano_nivel else defesa_nivel end into v_nivel_atual
    from public.player_especialidades where user_id = v_user_id and tipo = p_tipo;

  if v_nivel_atual >= 10 then
    raise exception 'Especialidade ja esta no nivel maximo.' using errcode = 'P0001';
  end if;

  -- A MISSAO DO NIVEL: todo requisito tem que ter chegado ao alvo. Nivel ja
  -- pago antes da missao existir fica (so o PROXIMO pede missao).
  select requisitos into v_requisitos from public.especialidade_missao
    where tipo = p_tipo and trilha = p_trilha and nivel = v_nivel_atual + 1;
  if v_requisitos is null then
    raise exception 'Missao da especialidade nao encontrada.' using errcode = 'P0001';
  end if;
  for v_req in select jsonb_array_elements(v_requisitos) loop
    if public.conquista_valor(v_user_id, v_req->'regra') < public.conquista_alvo(v_req->'regra') then
      raise exception 'Missao incompleta: %', v_req->>'texto' using errcode = 'P0001';
    end if;
  end loop;

  v_stone_qtd := v_stone_qtd_por_nivel[v_nivel_atual + 1];
  v_gold := v_gold_por_nivel[v_nivel_atual + 1];
  v_stone_id := 'stone_' || lower(p_tipo);

  select quantity into v_stone_atual from public.player_items
    where user_id = v_user_id and item_id = v_stone_id;
  if coalesce(v_stone_atual, 0) < v_stone_qtd then
    raise exception 'Stones insuficientes.' using errcode = 'P0001';
  end if;

  update public.players set gold = gold - v_gold
    where user_id = v_user_id and gold >= v_gold;
  if not found then
    raise exception 'Ouro insuficiente.' using errcode = 'P0001';
  end if;

  -- Guarda live, e nao so o pre-check acima (PH-198, ver a migration
  -- ..._especialidade_guarda_de_stone_*): duas chamadas concorrentes da mesma
  -- conta passavam as duas pelo pre-check com o mesmo snapshot.
  update public.player_items set quantity = quantity - v_stone_qtd, updated_at = now()
    where user_id = v_user_id and item_id = v_stone_id and quantity >= v_stone_qtd;
  if not found then
    raise exception 'Stones insuficientes.' using errcode = 'P0001';
  end if;

  update public.player_especialidades set
    dano_nivel = case when p_trilha = 'dano' then dano_nivel + 1 else dano_nivel end,
    defesa_nivel = case when p_trilha = 'defesa' then defesa_nivel + 1 else defesa_nivel end,
    updated_at = now()
    where user_id = v_user_id and tipo = p_tipo;

  return jsonb_build_object(
    'ok', true,
    'mensagem', format('Especialidade %s (%s) subiu para o nivel %s.', p_tipo, p_trilha, v_nivel_atual + 1)
  );
end;
$$;

commit;
