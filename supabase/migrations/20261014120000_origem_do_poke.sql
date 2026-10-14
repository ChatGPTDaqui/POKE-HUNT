-- De onde veio cada POKE (14/10/2026) — base da regra de MERITO PROPRIO das
-- conquistas (spec 2026-10-14-conquistas-design, decisao do dono): POKE comprado
-- no Mercado ou recebido em troca nao desbloqueia conquista.
--
-- Ate aqui nada dizia isso. `original_trainer` nao serve: em 14/10 ele nao batia
-- com o `user_id` em nenhuma das 888 linhas de producao.
--
-- VALORES
--   captura      nasceu de uma captura na hunt (servidor de sessoes)
--   inicial      o inicial escolhido em `escolher_starter`
--   recompensa   presente do jogo coletado no correio (`coletar_anexo_correio`)
--   transferido  mudou de dono (Mercado, leilao, troca, qualquer caminho)
--   desconhecida linha anterior a esta migration, ou insert por caminho que nao
--                declara a origem. Nunca conta como merito.
--
-- COMO E GARANTIDO, sem depender de cada RPC lembrar:
--  * INSERT: vale a origem declarada pelo chamador; as duas RPCs que criam POKE
--    declaram pela configuracao `jogo.origem_poke` da propria funcao (ALTER
--    FUNCTION ... SET), sem reescrever o corpo delas. Sem declaracao, fica
--    `desconhecida` — o lado seguro.
--  * UPDATE: a origem e IMUTAVEL. Se o `user_id` mudar, vira `transferido`, seja
--    qual for o caminho (comprar_anuncio, leilao, _executar_troca, futuros).
--    O upsert do servidor de sessoes manda `captura` em toda linha que grava; o
--    trigger e o que impede isso de "promover" um POKE ja existente.
--
-- O cliente nao insere em `pokemon_instances` (nao ha policy de escrita); so o
-- servidor de sessoes (service_role) e RPCs security definer escrevem.
--
-- ATENCAO PARA QUEM REESCREVER `escolher_starter` OU `coletar_anexo_correio`:
-- `create or replace function` SUBSTITUI a configuracao da funcao. A nova versao
-- precisa repetir `set jogo.origem_poke = ...` — `origemDoPoke.test.ts` reprova
-- se a ultima definicao perder isso.
begin;

alter table public.pokemon_instances
  add column if not exists origem text not null default 'desconhecida';
alter table dev.pokemon_instances
  add column if not exists origem text not null default 'desconhecida';

alter table public.pokemon_instances drop constraint if exists pokemon_instances_origem_valida;
alter table public.pokemon_instances add constraint pokemon_instances_origem_valida
  check (origem in ('captura', 'inicial', 'recompensa', 'transferido', 'desconhecida'));
alter table dev.pokemon_instances drop constraint if exists pokemon_instances_origem_valida;
alter table dev.pokemon_instances add constraint pokemon_instances_origem_valida
  check (origem in ('captura', 'inicial', 'recompensa', 'transferido', 'desconhecida'));

-- Uma funcao so pros dois schemas: ela so le NEW/OLD.
create or replace function public.proteger_origem_do_poke()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  declarada text := nullif(current_setting('jogo.origem_poke', true), '');
begin
  if tg_op = 'INSERT' then
    if declarada is not null then
      new.origem := declarada;
    end if;
    return new;
  end if;

  -- UPDATE
  if new.user_id is distinct from old.user_id then
    new.origem := 'transferido';
  else
    new.origem := old.origem;
  end if;
  return new;
end;
$$;

revoke all on function public.proteger_origem_do_poke() from public, anon, authenticated;

drop trigger if exists origem_do_poke on public.pokemon_instances;
create trigger origem_do_poke before insert or update on public.pokemon_instances
  for each row execute function public.proteger_origem_do_poke();
drop trigger if exists origem_do_poke on dev.pokemon_instances;
create trigger origem_do_poke before insert or update on dev.pokemon_instances
  for each row execute function public.proteger_origem_do_poke();

alter function public.escolher_starter(text) set jogo.origem_poke = 'inicial';
alter function dev.escolher_starter(text) set jogo.origem_poke = 'inicial';
alter function public.coletar_anexo_correio(uuid) set jogo.origem_poke = 'recompensa';
alter function dev.coletar_anexo_correio(uuid) set jogo.origem_poke = 'recompensa';

commit;
