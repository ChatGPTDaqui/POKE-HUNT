-- Jogador novo nascia com ZERO itens.
--
-- No jogo antigo os 10.000 de cada item inicial vinham de uma constante no
-- CLIENTE (STARTING_ITEMS, em GameState.js). Com o Postgres virando fonte de
-- verdade, a linha de `players` passou a ser criada pela trigger — mas nada
-- semeava `player_items`. Resultado observado no teste ponta a ponta: conta
-- recem-criada com 500.000 de ouro e nenhuma pocao/bola/revive, e por tabela
-- auto-pot e auto-revive nunca disparando (nao ha item pra usar).
--
-- Mesma classe do bug ja corrigido no `merge` do zustand/persist: default de
-- jogo novo que existia so no cliente e se perdeu ao trocar a camada de
-- persistencia. A concessao inicial passa a ser do servidor — que e onde ela
-- precisa estar de qualquer forma quando a autoridade migrar (Fase D), pra o
-- cliente nao poder se auto-conceder item.
--
-- Varas (kind='rod') ficam de fora: pesca nao esta implementada e elas nao sao
-- vendaveis, exatamente como no STARTING_ITEMS original.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.players (user_id) values (new.id);

  insert into public.player_items (user_id, item_id, quantity)
  select new.id, i.id, 10000
  from public.items i
  where i.kind in ('ball', 'potion', 'revive');

  return new;
end;
$$;
