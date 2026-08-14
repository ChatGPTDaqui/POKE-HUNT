-- Porta pra public a migration 20260811203356 (so tinha rodado em dev).
drop policy "sessao leitura propria" on public.game_sessions;
