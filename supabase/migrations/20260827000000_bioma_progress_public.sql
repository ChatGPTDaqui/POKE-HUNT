-- PH-200: progresso de bioma por faixa (gate de andares, design em _Architecture.md,
-- brainstorm 16/08). Indice de progresso, nao array de biomas liberados: a ordem dos
-- 12 biomas e sempre sequencial fixa, nunca pula — "jogador ja venceu os N primeiros
-- biomas desta faixa" basta.
alter table public.players
  add column bioma_progress jsonb not null default '{"faixa1": 0, "faixa2": 0, "faixa3": 0}'::jsonb;
