-- Jogador novo nascia com `unlocked_maps` VAZIO.
--
-- `handle_new_user` fazia `insert into players (user_id)` e a coluna caia no
-- default `'{}'`. A regra do jogo e outra: toda hunt SEM custo de desbloqueio
-- nasce liberada (era `DEFAULT_UNLOCKED_MAPS` no jogo vanilla).
--
-- No cliente isso passava despercebido porque hoje nenhum mapa tem
-- `unlock_cost`: o cartao da hunt so mostrava "Desbloquear" em vez de "Entrar",
-- e desbloquear de graca funcionava. Com o servidor virando a autoridade
-- (Fase D) o mesmo dado vira bloqueio duro — ele recusa `sessao/abrir` com
-- "hunt nao desbloqueada", e corretamente: o banco dizia que o jogador nao tem
-- hunt nenhuma. Foi assim que o bug apareceu.
--
-- A lista sai de `maps`, e nao e uma constante escrita a mao aqui: adicionar uma
-- hunt nova (ou dar custo a uma existente) continua funcionando sozinho, sem
-- ninguem lembrar de vir editar uma migration.

create or replace function public.hunts_iniciais()
returns text[]
language sql
stable
-- search_path travado: esta funcao e chamada de dentro de um SECURITY DEFINER,
-- onde um search_path herdado do chamador e vetor de escalonamento.
set search_path = ''
as $$
  select coalesce(array_agg(id order by sort_order), '{}')
  from public.maps
  where unlock_cost is null
$$;

-- Jogadores que ja existem: preenche so quem esta vazio. Quem ja desbloqueou
-- coisa (ou perdeu acesso a algo de proposito) nao e tocado.
update public.players
set unlocked_maps = public.hunts_iniciais()
where unlocked_maps = '{}';

-- E daqui pra frente, na criacao da linha.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.players (user_id, unlocked_maps)
  values (new.id, public.hunts_iniciais());

  -- Estoque inicial (o jogo comeca com 10.000 de cada consumivel vendavel).
  insert into public.player_items (user_id, item_id, quantity)
  select new.id, id, 10000
  from public.items
  where kind in ('ball', 'potion', 'revive');

  return new;
end;
$$;
