-- Tres coisas que dependem dos enums adicionados em 20260814120000.
--
-- ---------------------------------------------------------------------------
-- 1. `stone_fairy` — CORRECAO DE BUG QUE TRAVA A CONTA
-- ---------------------------------------------------------------------------
-- O drop universal por kill (`awardKillLoot`) grava `stone_<tipo primario do
-- POKE morto>` em `player_items`, que tem FK para `items`. Com o tipo Fada no
-- catalogo do jogo mas `stone_fairy` ausente aqui, matar qualquer POKE de tipo
-- Fada colocava um id inexistente no inventario. O efeito nao e um erro
-- isolado: o item fica no estado do jogador, entao TODA gravacao seguinte volta
-- 502 pela mesma FK, e a conta para de salvar de vez.
--
-- Ordem importa: este insert vem ANTES de qualquer conta poder receber o drop,
-- por isso ele mora na migration e nao no `migrate-catalog-to-postgres.js`
-- (que continua bloqueado, ver scripts/lib/guarda-catalogo-gen2.js).
insert into public.items (id, name, kind, description, stone_type, sort_order)
values (
  'stone_fairy',
  'Pedra FAIRY',
  'stone',
  'Usada para evoluir POKEs de tipo primario FAIRY ao atingir o Nivel 80.',
  'FAIRY',
  30
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Itens de cura de status
-- ---------------------------------------------------------------------------
-- Lista, e nao um unico status: o Full Heal cura seis de uma vez. Guardar array
-- ate pro Antidote evita um caso especial em quem le.
alter table public.items
  add column if not exists heals_status text[];

-- O check antigo dizia "quem nao e potion/revive nao tem campo de cura
-- nenhum" — o que barraria os itens abaixo. Recriado incluindo a familia nova
-- e exigindo que ela traga a lista (um Antidote sem `heals_status` seria um
-- item de cura que nao cura nada, comprado e inerte).
alter table public.items drop constraint if exists heal_fields_match_kind;
alter table public.items add constraint heal_fields_match_kind check (
  (kind = 'potion' and (heal_amount is not null or heals_full) and heals_status is null) or
  (kind = 'revive' and revive_hp_percent is not null and heals_status is null) or
  (kind = 'status_heal' and heals_status is not null and array_length(heals_status, 1) >= 1
    and heal_amount is null and not heals_full and revive_hp_percent is null) or
  (kind not in ('potion','revive','status_heal')
    and heal_amount is null and not heals_full and revive_hp_percent is null and heals_status is null)
);

-- `buy_price` = preco de loja real do Ultra Sun, SEM desconto. O desconto de
-- 70% e o preco de venda continuam sendo decisao de balanceamento do cliente
-- (src/data/items.ts), como ja acontece com bolas e pocoes.
insert into public.items (id, name, kind, description, buy_price, heals_status, sort_order)
values
  ('antidote',      'Antidote',      'status_heal', 'Cura status.', 200, array['poison'],                                                     31),
  ('awakening',     'Awakening',     'status_heal', 'Cura status.', 100, array['sleep'],                                                      32),
  ('burn_heal',     'Burn Heal',     'status_heal', 'Cura status.', 300, array['burn'],                                                       33),
  ('ice_heal',      'Ice Heal',      'status_heal', 'Cura status.', 100, array['freeze'],                                                     34),
  ('paralyze_heal', 'Paralyze Heal', 'status_heal', 'Cura status.', 300, array['paralysis'],                                                  35),
  ('full_heal',     'Full Heal',     'status_heal', 'Cura status.', 400, array['poison','sleep','burn','freeze','paralysis','confusion'],     36)
on conflict (id) do nothing;

-- Precos de loja que estavam em valores de geracoes anteriores. A Gen VII
-- baixou Ultra Ball e Potion e subiu Hyper Potion e Revive.
update public.items set buy_price =  800 where id = 'ultra_ball'   and buy_price is distinct from  800;
update public.items set buy_price =  200 where id = 'potion'       and buy_price is distinct from  200;
update public.items set buy_price = 1500 where id = 'hyper_potion' and buy_price is distinct from 1500;
update public.items set buy_price = 2000 where id = 'revive'       and buy_price is distinct from 2000;

-- ---------------------------------------------------------------------------
-- 3. Os 4 golpes ativos
-- ---------------------------------------------------------------------------
-- Cada POKE passa a usar no maximo 4 golpes por vez, escolhidos pelo jogador no
-- menu Equipes (regra do jogo real).
--
-- POR QUE UMA COLUNA NOVA, e nao derivar como `unlocked_abilities`:
-- `unlocked_abilities` e DERIVAVEL (especie + nivel dizem tudo) e por isso
-- passou a ser recalculada na leitura. Esta nao e: e ESCOLHA do jogador, o
-- unico dado dos dois que se perde se nao for gravado.
--
-- NULL = jogador nunca escolheu; o cliente preenche com os 4 ultimos golpes
-- aprendidos, mesma regra dos selvagens. Distinguir NULL de '{}' importa:
-- array vazio e uma escolha valida (desligar tudo e cair no Ataque Basico) e
-- nao pode ser confundida com "ainda nao configurado".
alter table public.pokemon_instances
  add column if not exists active_abilities text[];

alter table public.pokemon_instances drop constraint if exists active_abilities_no_maximo_quatro;
alter table public.pokemon_instances
  add constraint active_abilities_no_maximo_quatro
  check (active_abilities is null or array_length(active_abilities, 1) is null or array_length(active_abilities, 1) <= 4);
