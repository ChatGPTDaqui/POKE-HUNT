-- Pedido do usuario: em vez de derrubar o outro aparelho na hora do login
-- (signOut scope=others direto, ja implementado), mostrar um aviso no
-- aparelho NOVO ("Jogar por aqui?") e so derrubar o outro quando o jogador
-- confirmar.
--
-- Pra isso o cliente precisa saber, logo apos autenticar, SE existe outra
-- sessao viva pra este usuario — dado que so o Supabase Auth tem
-- (`auth.sessions`, schema que o PostgREST nao expoe pra `dev`/`public`).
-- RPC security definer, so leitura, exclui a PROPRIA sessao (session_id vem
-- do claim do JWT) e ignora sessao ja expirada (`not_after`).
create or replace function public.tem_outra_sessao_de_auth_ativa()
returns boolean
language sql
security definer
set search_path = auth, public
stable
as $$
  select exists (
    select 1 from auth.sessions s
    where s.user_id = auth.uid()
      and s.id <> nullif(auth.jwt()->>'session_id', '')::uuid
      and (s.not_after is null or s.not_after > now())
  );
$$;

create or replace function dev.tem_outra_sessao_de_auth_ativa()
returns boolean
language sql
security definer
set search_path = auth, public
stable
as $$
  select exists (
    select 1 from auth.sessions s
    where s.user_id = auth.uid()
      and s.id <> nullif(auth.jwt()->>'session_id', '')::uuid
      and (s.not_after is null or s.not_after > now())
  );
$$;
