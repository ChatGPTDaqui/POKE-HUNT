-- A planilha guarda MODO, o schema pedia NUMERO — por isso 18 golpes ficaram
-- com o campo nulo na primeira carga do catalogo.
--
--   Multi-hit  = "sim" (12 golpes). O schema pedia multi_hit_min/max smallint,
--                mas o range real (2-5, 2 pro Double Kick, 3 pro Triple Kick)
--                NAO esta na planilha — preencher viria do meu conhecimento de
--                Gen2, ou seja, dado inventado passando por dado importado.
--   Dano Fixo  = "ohko" | "level" | "half" (6 golpes). O schema pedia
--                fixed_damage int, e nenhum desses tres cabe num inteiro: a
--                semantica ja existe em codigo
--                (combatSystem.ts#FIXED_DAMAGE_ABILITIES), so nao como numero.
--
-- Isto precisa entrar ANTES de a planilha ser aposentada: depois disso o
-- `.xlsx` deixa de ser a fonte e o dado nao teria de onde voltar.
--
-- As colunas antigas estao 100% nulas (nenhuma linha usa), entao remove-las
-- nao perde nada — e carregar coluna morta ao lado da nova so criaria duvida
-- sobre qual e a verdadeira.

alter table public.moves drop column if exists multi_hit_min;
alter table public.moves drop column if exists multi_hit_max;
alter table public.moves drop column if exists fixed_damage;

alter table public.moves add column if not exists multi_hit boolean not null default false;
alter table public.moves add column if not exists fixed_damage_mode text;

alter table public.moves drop constraint if exists moves_fixed_damage_mode_valid;
alter table public.moves add constraint moves_fixed_damage_mode_valid
  check (fixed_damage_mode is null or fixed_damage_mode in ('ohko', 'level', 'half'));

comment on column public.moves.multi_hit is
  'Golpe acerta multiplas vezes. O range de acertos nao existe na planilha; o jogo usa a regra em codigo.';
comment on column public.moves.fixed_damage_mode is
  'Dano fixo por regra propria: ohko (derruba), level (dano = nivel), half (metade do HP atual do alvo).';
