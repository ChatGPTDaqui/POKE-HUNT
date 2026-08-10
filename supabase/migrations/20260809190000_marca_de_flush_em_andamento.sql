-- Reconstituida a partir do estado real do cloud (cffbihbmhiuudahsgjsn) --
-- essa migration foi aplicada direto no projeto e nunca commitada no repo.
-- Definicao das colunas confirmada via information_schema no cloud em 2026-08-10.
alter table game_sessions
  add column if not exists flushing_since timestamptz,
  add column if not exists last_flush_at timestamptz not null default now();
