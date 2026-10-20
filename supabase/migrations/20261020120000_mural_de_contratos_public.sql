-- Mural de contratos e ovos (20/10/2026). Design aprovado pelo dono:
-- docs/planos/2026-10-20-mural-de-contratos-e-ovos-design.md.
--
-- Substitui as cadeias de Tasks (`missao_cadeia`), que ficam no banco mas saem
-- da tela. Os NUMEROS deste arquivo repetem `src/data/ovos.ts`; quem tranca os
-- dois juntos e `src/data/ovos.test.ts` (le este SQL e compara). O bloco do
-- catalogo e GERADO pelo mesmo teste (GERAR_OVOS=1) a partir de
-- `src/data/catalogoDeOvos.ts`. O par `_dev` e derivado deste arquivo.
--
-- POR QUE `random()`: o sorteio do mural e do ovo e persistido na hora (linha
-- do contrato, linha do POKE). Nao ha mundo pra o cliente reproduzir, entao nao
-- precisa do RNG semeado do motor — mesmo raciocinio de `_sortear_eevee_do_lance`.

begin;

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
create table if not exists public.ovo_catalogo (
  bioma text not null,
  species_id text not null,
  base_id text not null,
  peso int not null check (peso > 0),
  traits text[] not null default '{}',
  trait_oculta text,
  primary key (bioma, species_id)
);
alter table public.ovo_catalogo enable row level security;
grant select, insert, update, delete on public.ovo_catalogo to service_role;

create table if not exists public.player_contratos (
  user_id uuid not null references public.players(user_id) on delete cascade,
  dia date not null,
  slot smallint not null check (slot between 0 and 9),
  species_id text not null,
  base_id text not null,
  raridade text not null check (raridade in ('comum','incomum','raro','ultra','legendary')),
  tipo text not null check (tipo in ('abates','shiny')),
  alvo int not null check (alvo > 0),
  base bigint not null default 0,
  reivindicado boolean not null default false,
  criado_em timestamptz not null default now(),
  primary key (user_id, dia, slot)
);
alter table public.player_contratos enable row level security;
drop policy if exists "contratos leitura propria" on public.player_contratos;
create policy "contratos leitura propria" on public.player_contratos for select to authenticated
  using ((select auth.uid()) = user_id);
grant select on public.player_contratos to authenticated;
grant select, insert, update, delete on public.player_contratos to service_role;

create table if not exists public.player_mural (
  user_id uuid primary key references public.players(user_id) on delete cascade,
  dia date not null,
  refreshes int not null default 0 check (refreshes >= 0)
);
alter table public.player_mural enable row level security;
drop policy if exists "mural leitura propria" on public.player_mural;
create policy "mural leitura propria" on public.player_mural for select to authenticated
  using ((select auth.uid()) = user_id);
grant select on public.player_mural to authenticated;
grant select, insert, update, delete on public.player_mural to service_role;

create table if not exists public.player_ovos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.players(user_id) on delete cascade,
  species_id text not null,
  raridade text not null check (raridade in ('comum','incomum','raro','ultra','legendary')),
  shiny boolean not null default false,
  abates_restantes int not null check (abates_restantes >= 0),
  na_equipe boolean not null default false,
  criado_em timestamptz not null default now()
);
create index if not exists player_ovos_user on public.player_ovos (user_id);
alter table public.player_ovos enable row level security;
drop policy if exists "ovos leitura propria" on public.player_ovos;
create policy "ovos leitura propria" on public.player_ovos for select to authenticated
  using ((select auth.uid()) = user_id);
grant select on public.player_ovos to authenticated;
grant select, insert, update, delete on public.player_ovos to service_role;

-- POKE nascido de ovo tem origem propria.
alter table public.pokemon_instances drop constraint if exists pokemon_instances_origem_valida;
alter table public.pokemon_instances add constraint pokemon_instances_origem_valida
  check (origem = any (array['captura', 'inicial', 'recompensa', 'transferido', 'desconhecida', 'ovo']));

-- ---------------------------------------------------------------------------
-- Catalogo (GERADO — nao editar a mao entre os marcadores)
-- ---------------------------------------------------------------------------
-- CATALOGO:INICIO
delete from public.ovo_catalogo;
insert into public.ovo_catalogo (bioma, species_id, base_id, peso, traits, trait_oculta) values
  ('aguas_interiores', 'arbok', 'ekans', 5, array['intimidate', 'shed_skin']::text[], 'unnerve'),
  ('aguas_interiores', 'azumarill', 'azurill', 5, array['thick_fat', 'huge_power']::text[], 'sap_sipper'),
  ('aguas_interiores', 'azurill', 'azurill', 10, array['thick_fat', 'huge_power']::text[], 'sap_sipper'),
  ('aguas_interiores', 'barboach', 'barboach', 30, array['oblivious', 'anticipation']::text[], 'hydration'),
  ('aguas_interiores', 'bellossom', 'bellossom', 1, array['chlorophyll']::text[], 'healer'),
  ('aguas_interiores', 'blastoise', 'squirtle', 1, array['torrent']::text[], 'rain_dish'),
  ('aguas_interiores', 'corphish', 'corphish', 30, array['hyper_cutter', 'shell_armor']::text[], 'adaptability'),
  ('aguas_interiores', 'crawdaunt', 'corphish', 5, array['hyper_cutter', 'shell_armor']::text[], 'adaptability'),
  ('aguas_interiores', 'crobat', 'zubat', 1, array['inner_focus']::text[], 'infiltrator'),
  ('aguas_interiores', 'croconaw', 'totodile', 5, array['torrent']::text[], 'sheer_force'),
  ('aguas_interiores', 'ekans', 'ekans', 10, array['intimidate', 'shed_skin']::text[], 'unnerve'),
  ('aguas_interiores', 'feebas', 'feebas', 10, array['swift_swim', 'oblivious']::text[], 'adaptability'),
  ('aguas_interiores', 'feraligatr', 'totodile', 1, array['torrent']::text[], 'sheer_force'),
  ('aguas_interiores', 'gloom', 'oddish', 1, array['chlorophyll']::text[], 'run_away'),
  ('aguas_interiores', 'golbat', 'zubat', 10, array['inner_focus']::text[], 'infiltrator'),
  ('aguas_interiores', 'goldeen', 'goldeen', 30, array['swift_swim', 'water_veil']::text[], 'lightning_rod'),
  ('aguas_interiores', 'golduck', 'psyduck', 10, array['damp', 'cloud_nine']::text[], 'swift_swim'),
  ('aguas_interiores', 'gulpin', 'gulpin', 20, array['liquid_ooze', 'sticky_hold']::text[], 'gluttony'),
  ('aguas_interiores', 'gyarados', 'magikarp', 20, array['swift_swim']::text[], 'rattled'),
  ('aguas_interiores', 'lombre', 'lotad', 20, array['swift_swim', 'rain_dish']::text[], 'own_tempo'),
  ('aguas_interiores', 'lotad', 'lotad', 30, array['swift_swim', 'rain_dish']::text[], 'own_tempo'),
  ('aguas_interiores', 'ludicolo', 'lotad', 1, array['swift_swim', 'rain_dish']::text[], 'own_tempo'),
  ('aguas_interiores', 'magikarp', 'magikarp', 30, array['swift_swim']::text[], 'rattled'),
  ('aguas_interiores', 'marill', 'azurill', 5, array['thick_fat', 'huge_power']::text[], 'sap_sipper'),
  ('aguas_interiores', 'marshtomp', 'mudkip', 5, array['torrent']::text[], 'damp'),
  ('aguas_interiores', 'masquerain', 'surskit', 5, array['swift_swim']::text[], 'rain_dish'),
  ('aguas_interiores', 'milotic', 'feebas', 5, array['swift_swim', 'oblivious']::text[], 'adaptability'),
  ('aguas_interiores', 'mudkip', 'mudkip', 10, array['torrent']::text[], 'damp'),
  ('aguas_interiores', 'oddish', 'oddish', 10, array['chlorophyll']::text[], 'run_away'),
  ('aguas_interiores', 'politoed', 'politoed', 1, array['water_absorb', 'damp']::text[], 'drizzle'),
  ('aguas_interiores', 'poliwag', 'poliwag', 30, array['water_absorb', 'damp']::text[], 'swift_swim'),
  ('aguas_interiores', 'poliwhirl', 'poliwag', 20, array['water_absorb', 'damp']::text[], 'swift_swim'),
  ('aguas_interiores', 'poliwrath', 'poliwag', 1, array['water_absorb', 'damp']::text[], 'swift_swim'),
  ('aguas_interiores', 'psyduck', 'psyduck', 30, array['damp', 'cloud_nine']::text[], 'swift_swim'),
  ('aguas_interiores', 'quagsire', 'wooper', 20, array['damp', 'water_absorb']::text[], 'unaware'),
  ('aguas_interiores', 'seaking', 'goldeen', 20, array['swift_swim', 'water_veil']::text[], 'lightning_rod'),
  ('aguas_interiores', 'slowbro', 'slowpoke', 10, array['oblivious', 'own_tempo']::text[], 'regenerator'),
  ('aguas_interiores', 'slowking', 'slowking', 5, array['oblivious', 'own_tempo']::text[], 'regenerator'),
  ('aguas_interiores', 'slowpoke', 'slowpoke', 30, array['oblivious', 'own_tempo']::text[], 'regenerator'),
  ('aguas_interiores', 'surskit', 'surskit', 10, array['swift_swim']::text[], 'rain_dish'),
  ('aguas_interiores', 'swalot', 'gulpin', 5, array['liquid_ooze', 'sticky_hold']::text[], 'gluttony'),
  ('aguas_interiores', 'swampert', 'mudkip', 1, array['torrent']::text[], 'damp'),
  ('aguas_interiores', 'totodile', 'totodile', 10, array['torrent']::text[], 'sheer_force'),
  ('aguas_interiores', 'vileplume', 'oddish', 1, array['chlorophyll']::text[], 'run_away'),
  ('aguas_interiores', 'wartortle', 'squirtle', 5, array['torrent']::text[], 'rain_dish'),
  ('aguas_interiores', 'whiscash', 'barboach', 20, array['oblivious', 'anticipation']::text[], 'hydration'),
  ('aguas_interiores', 'wooper', 'wooper', 30, array['damp', 'water_absorb']::text[], 'unaware'),
  ('aguas_interiores', 'yanma', 'yanma', 1, array['speed_boost', 'compound_eyes']::text[], 'frisk'),
  ('aguas_interiores', 'zubat', 'zubat', 20, array['inner_focus']::text[], 'infiltrator'),
  ('aridos', 'aerodactyl', 'aerodactyl', 5, array['rock_head', 'pressure']::text[], 'unnerve'),
  ('aridos', 'altaria', 'swablu', 5, array['natural_cure']::text[], 'cloud_nine'),
  ('aridos', 'anorith', 'anorith', 10, array['battle_armor']::text[], 'swift_swim'),
  ('aridos', 'armaldo', 'anorith', 5, array['battle_armor']::text[], 'swift_swim'),
  ('aridos', 'azumarill', 'azurill', 5, array['thick_fat', 'huge_power']::text[], 'sap_sipper'),
  ('aridos', 'azurill', 'azurill', 10, array['thick_fat', 'huge_power']::text[], 'sap_sipper'),
  ('aridos', 'bagon', 'bagon', 30, array['rock_head']::text[], 'sheer_force'),
  ('aridos', 'baltoy', 'baltoy', 20, array['levitate']::text[], null),
  ('aridos', 'cacnea', 'cacnea', 5, array['sand_veil']::text[], 'water_absorb'),
  ('aridos', 'cacturne', 'cacnea', 5, array['sand_veil']::text[], 'water_absorb'),
  ('aridos', 'camerupt', 'numel', 5, array['oblivious', 'simple']::text[], 'own_tempo'),
  ('aridos', 'claydol', 'baltoy', 20, array['levitate']::text[], null),
  ('aridos', 'cradily', 'lileep', 5, array['suction_cups']::text[], 'storm_drain'),
  ('aridos', 'cubone', 'cubone', 30, array['rock_head', 'lightning_rod']::text[], 'battle_armor'),
  ('aridos', 'diglett', 'diglett', 30, array['sand_veil', 'arena_trap']::text[], 'sand_force'),
  ('aridos', 'dodrio', 'doduo', 1, array['run_away', 'early_bird']::text[], 'tangled_feet'),
  ('aridos', 'doduo', 'doduo', 10, array['run_away', 'early_bird']::text[], 'tangled_feet'),
  ('aridos', 'donphan', 'phanpy', 5, array['pickup']::text[], 'sand_veil'),
  ('aridos', 'dragonair', 'dratini', 10, array['shed_skin']::text[], 'marvel_scale'),
  ('aridos', 'dragonite', 'dratini', 1, array['shed_skin']::text[], 'marvel_scale'),
  ('aridos', 'dratini', 'dratini', 20, array['shed_skin']::text[], 'marvel_scale'),
  ('aridos', 'dugtrio', 'diglett', 10, array['sand_veil', 'arena_trap']::text[], 'sand_force'),
  ('aridos', 'fearow', 'spearow', 10, array['keen_eye']::text[], 'sniper'),
  ('aridos', 'flygon', 'trapinch', 1, array['hyper_cutter', 'arena_trap']::text[], 'sheer_force'),
  ('aridos', 'geodude', 'geodude', 30, array['rock_head', 'sturdy']::text[], 'sand_veil'),
  ('aridos', 'gligar', 'gligar', 10, array['hyper_cutter', 'sand_veil']::text[], 'immunity'),
  ('aridos', 'golduck', 'psyduck', 10, array['damp', 'cloud_nine']::text[], 'swift_swim'),
  ('aridos', 'golem', 'geodude', 1, array['rock_head', 'sturdy']::text[], 'sand_veil'),
  ('aridos', 'graveler', 'geodude', 30, array['rock_head', 'sturdy']::text[], 'sand_veil'),
  ('aridos', 'larvitar', 'larvitar', 5, array['guts']::text[], 'sand_veil'),
  ('aridos', 'lileep', 'lileep', 10, array['suction_cups']::text[], 'storm_drain'),
  ('aridos', 'marill', 'azurill', 5, array['thick_fat', 'huge_power']::text[], 'sap_sipper'),
  ('aridos', 'marowak', 'cubone', 1, array['rock_head', 'lightning_rod']::text[], 'battle_armor'),
  ('aridos', 'numel', 'numel', 30, array['oblivious', 'simple']::text[], 'own_tempo'),
  ('aridos', 'onix', 'onix', 20, array['rock_head', 'sturdy']::text[], 'weak_armor'),
  ('aridos', 'phanpy', 'phanpy', 1, array['pickup']::text[], 'sand_veil'),
  ('aridos', 'psyduck', 'psyduck', 30, array['damp', 'cloud_nine']::text[], 'swift_swim'),
  ('aridos', 'pupitar', 'larvitar', 1, array['guts']::text[], 'sand_veil'),
  ('aridos', 'rhydon', 'rhyhorn', 1, array['lightning_rod', 'rock_head']::text[], 'reckless'),
  ('aridos', 'rhyhorn', 'rhyhorn', 10, array['lightning_rod', 'rock_head']::text[], 'reckless'),
  ('aridos', 'salamence', 'bagon', 1, array['rock_head']::text[], 'sheer_force'),
  ('aridos', 'sandshrew', 'sandshrew', 10, array['sand_veil']::text[], 'sand_rush'),
  ('aridos', 'sandslash', 'sandshrew', 5, array['sand_veil']::text[], 'sand_rush'),
  ('aridos', 'shelgon', 'bagon', 5, array['rock_head']::text[], 'sheer_force'),
  ('aridos', 'skarmory', 'skarmory', 1, array['keen_eye', 'sturdy']::text[], 'weak_armor'),
  ('aridos', 'spearow', 'spearow', 30, array['keen_eye']::text[], 'sniper'),
  ('aridos', 'steelix', 'onix', 5, array['rock_head', 'sturdy']::text[], 'weak_armor'),
  ('aridos', 'swablu', 'swablu', 30, array['natural_cure']::text[], 'cloud_nine'),
  ('aridos', 'trapinch', 'trapinch', 30, array['hyper_cutter', 'arena_trap']::text[], 'sheer_force'),
  ('aridos', 'tyranitar', 'larvitar', 1, array['guts']::text[], 'sand_veil'),
  ('aridos', 'vibrava', 'trapinch', 5, array['hyper_cutter', 'arena_trap']::text[], 'sheer_force'),
  ('campo_aberto', 'abra', 'abra', 10, array['synchronize', 'inner_focus']::text[], 'magic_guard'),
  ('campo_aberto', 'alakazam', 'abra', 1, array['synchronize', 'inner_focus']::text[], 'magic_guard'),
  ('campo_aberto', 'ampharos', 'mareep', 1, array['static']::text[], 'plus'),
  ('campo_aberto', 'arbok', 'ekans', 5, array['intimidate', 'shed_skin']::text[], 'unnerve'),
  ('campo_aberto', 'arcanine', 'growlithe', 5, array['intimidate', 'flash_fire']::text[], 'justified'),
  ('campo_aberto', 'ariados', 'spinarak', 1, array['swarm', 'insomnia']::text[], 'sniper'),
  ('campo_aberto', 'beautifly', 'wurmple', 1, array['shield_dust']::text[], 'run_away'),
  ('campo_aberto', 'bellsprout', 'bellsprout', 20, array['chlorophyll']::text[], 'gluttony'),
  ('campo_aberto', 'breloom', 'shroomish', 5, array['effect_spore', 'poison_heal']::text[], 'quick_feet'),
  ('campo_aberto', 'cascoon', 'cascoon', 10, array['shed_skin']::text[], null),
  ('campo_aberto', 'clefable', 'cleffa', 1, array['cute_charm', 'magic_guard']::text[], 'friend_guard'),
  ('campo_aberto', 'clefairy', 'cleffa', 1, array['cute_charm', 'magic_guard']::text[], 'friend_guard'),
  ('campo_aberto', 'cleffa', 'cleffa', 10, array['cute_charm', 'magic_guard']::text[], 'friend_guard'),
  ('campo_aberto', 'crobat', 'zubat', 1, array['inner_focus']::text[], 'infiltrator'),
  ('campo_aberto', 'delcatty', 'skitty', 5, array['cute_charm', 'normalize']::text[], 'wonder_skin'),
  ('campo_aberto', 'ditto', 'ditto', 5, array['limber']::text[], 'imposter'),
  ('campo_aberto', 'dodrio', 'doduo', 1, array['run_away', 'early_bird']::text[], 'tangled_feet'),
  ('campo_aberto', 'doduo', 'doduo', 10, array['run_away', 'early_bird']::text[], 'tangled_feet'),
  ('campo_aberto', 'dunsparce', 'dunsparce', 1, array['serene_grace', 'run_away']::text[], 'rattled'),
  ('campo_aberto', 'dustox', 'cascoon', 1, array['shed_skin']::text[], null),
  ('campo_aberto', 'ekans', 'ekans', 10, array['intimidate', 'shed_skin']::text[], 'unnerve'),
  ('campo_aberto', 'exploud', 'whismur', 1, array['soundproof']::text[], 'rattled'),
  ('campo_aberto', 'farfetch_d', 'farfetch_d', 5, array['keen_eye', 'inner_focus']::text[], 'defiant'),
  ('campo_aberto', 'fearow', 'spearow', 10, array['keen_eye']::text[], 'sniper'),
  ('campo_aberto', 'flaaffy', 'mareep', 10, array['static']::text[], 'plus'),
  ('campo_aberto', 'furret', 'sentret', 5, array['run_away', 'keen_eye']::text[], 'frisk'),
  ('campo_aberto', 'gardevoir', 'ralts', 1, array['synchronize', 'trace']::text[], 'telepathy'),
  ('campo_aberto', 'gloom', 'oddish', 1, array['chlorophyll']::text[], 'run_away'),
  ('campo_aberto', 'golbat', 'zubat', 10, array['inner_focus']::text[], 'infiltrator'),
  ('campo_aberto', 'granbull', 'snubbull', 1, array['intimidate', 'run_away']::text[], 'rattled'),
  ('campo_aberto', 'grimer', 'grimer', 30, array['stench', 'sticky_hold']::text[], 'poison_touch'),
  ('campo_aberto', 'growlithe', 'growlithe', 5, array['intimidate', 'flash_fire']::text[], 'justified'),
  ('campo_aberto', 'hoothoot', 'hoothoot', 20, array['insomnia', 'keen_eye']::text[], 'tinted_lens'),
  ('campo_aberto', 'hoppip', 'hoppip', 10, array['chlorophyll', 'leaf_guard']::text[], 'infiltrator'),
  ('campo_aberto', 'igglybuff', 'igglybuff', 10, array['cute_charm', 'competitive']::text[], 'friend_guard'),
  ('campo_aberto', 'illumise', 'illumise', 20, array['oblivious', 'tinted_lens']::text[], 'prankster'),
  ('campo_aberto', 'ivysaur', 'bulbasaur', 5, array['overgrow']::text[], 'chlorophyll'),
  ('campo_aberto', 'jigglypuff', 'igglybuff', 1, array['cute_charm', 'competitive']::text[], 'friend_guard'),
  ('campo_aberto', 'jumpluff', 'hoppip', 1, array['chlorophyll', 'leaf_guard']::text[], 'infiltrator'),
  ('campo_aberto', 'kadabra', 'abra', 5, array['synchronize', 'inner_focus']::text[], 'magic_guard'),
  ('campo_aberto', 'kirlia', 'ralts', 5, array['synchronize', 'trace']::text[], 'telepathy'),
  ('campo_aberto', 'koffing', 'koffing', 30, array['levitate', 'neutralizing_gas']::text[], 'stench'),
  ('campo_aberto', 'ledian', 'ledyba', 1, array['swarm', 'early_bird']::text[], 'rattled'),
  ('campo_aberto', 'ledyba', 'ledyba', 5, array['swarm', 'early_bird']::text[], 'rattled'),
  ('campo_aberto', 'lickitung', 'lickitung', 20, array['own_tempo', 'oblivious']::text[], 'cloud_nine'),
  ('campo_aberto', 'linoone', 'zigzagoon', 20, array['pickup', 'gluttony']::text[], 'quick_feet'),
  ('campo_aberto', 'lombre', 'lotad', 20, array['swift_swim', 'rain_dish']::text[], 'own_tempo'),
  ('campo_aberto', 'lotad', 'lotad', 30, array['swift_swim', 'rain_dish']::text[], 'own_tempo'),
  ('campo_aberto', 'loudred', 'whismur', 10, array['soundproof']::text[], 'rattled'),
  ('campo_aberto', 'ludicolo', 'lotad', 1, array['swift_swim', 'rain_dish']::text[], 'own_tempo'),
  ('campo_aberto', 'mankey', 'mankey', 10, array['vital_spirit', 'anger_point']::text[], 'defiant'),
  ('campo_aberto', 'mareep', 'mareep', 10, array['static']::text[], 'plus'),
  ('campo_aberto', 'masquerain', 'surskit', 5, array['swift_swim']::text[], 'rain_dish'),
  ('campo_aberto', 'meowth', 'meowth', 10, array['pickup', 'technician']::text[], 'unnerve'),
  ('campo_aberto', 'mightyena', 'poochyena', 20, array['run_away', 'quick_feet']::text[], 'rattled'),
  ('campo_aberto', 'miltank', 'miltank', 5, array['thick_fat', 'scrappy']::text[], 'sap_sipper'),
  ('campo_aberto', 'muk', 'grimer', 5, array['stench', 'sticky_hold']::text[], 'poison_touch'),
  ('campo_aberto', 'nidoking', 'nidoran_m', 1, array['poison_point', 'rivalry']::text[], 'hustle'),
  ('campo_aberto', 'nidoqueen', 'nidoran_f', 1, array['poison_point', 'rivalry']::text[], 'hustle'),
  ('campo_aberto', 'nidoran_f', 'nidoran_f', 20, array['poison_point', 'rivalry']::text[], 'hustle'),
  ('campo_aberto', 'nidoran_m', 'nidoran_m', 20, array['poison_point', 'rivalry']::text[], 'hustle'),
  ('campo_aberto', 'nidorina', 'nidoran_f', 30, array['poison_point', 'rivalry']::text[], 'hustle'),
  ('campo_aberto', 'nidorino', 'nidoran_m', 30, array['poison_point', 'rivalry']::text[], 'hustle'),
  ('campo_aberto', 'nincada', 'nincada', 20, array['compound_eyes']::text[], 'run_away'),
  ('campo_aberto', 'ninjask', 'nincada', 5, array['compound_eyes']::text[], 'run_away'),
  ('campo_aberto', 'noctowl', 'hoothoot', 5, array['insomnia', 'keen_eye']::text[], 'tinted_lens'),
  ('campo_aberto', 'nuzleaf', 'seedot', 1, array['chlorophyll', 'early_bird']::text[], 'pickpocket'),
  ('campo_aberto', 'oddish', 'oddish', 10, array['chlorophyll']::text[], 'run_away'),
  ('campo_aberto', 'paras', 'paras', 10, array['effect_spore', 'dry_skin']::text[], 'damp'),
  ('campo_aberto', 'parasect', 'paras', 5, array['effect_spore', 'dry_skin']::text[], 'damp'),
  ('campo_aberto', 'persian', 'meowth', 1, array['pickup', 'technician']::text[], 'unnerve'),
  ('campo_aberto', 'pichu', 'pichu', 10, array['static']::text[], 'lightning_rod'),
  ('campo_aberto', 'pidgeot', 'pidgey', 1, array['keen_eye', 'tangled_feet']::text[], 'big_pecks'),
  ('campo_aberto', 'pidgeotto', 'pidgey', 10, array['keen_eye', 'tangled_feet']::text[], 'big_pecks'),
  ('campo_aberto', 'pidgey', 'pidgey', 20, array['keen_eye', 'tangled_feet']::text[], 'big_pecks'),
  ('campo_aberto', 'pikachu', 'pichu', 5, array['static']::text[], 'lightning_rod'),
  ('campo_aberto', 'ponyta', 'ponyta', 20, array['run_away', 'flash_fire']::text[], 'flame_body'),
  ('campo_aberto', 'poochyena', 'poochyena', 30, array['run_away', 'quick_feet']::text[], 'rattled'),
  ('campo_aberto', 'primeape', 'mankey', 1, array['vital_spirit', 'anger_point']::text[], 'defiant'),
  ('campo_aberto', 'raichu', 'pichu', 5, array['static']::text[], 'lightning_rod'),
  ('campo_aberto', 'ralts', 'ralts', 5, array['synchronize', 'trace']::text[], 'telepathy'),
  ('campo_aberto', 'rapidash', 'ponyta', 10, array['run_away', 'flash_fire']::text[], 'flame_body'),
  ('campo_aberto', 'raticate', 'rattata', 10, array['run_away', 'guts']::text[], 'hustle'),
  ('campo_aberto', 'rattata', 'rattata', 30, array['run_away', 'guts']::text[], 'hustle'),
  ('campo_aberto', 'roselia', 'roselia', 5, array['natural_cure', 'poison_point']::text[], 'leaf_guard'),
  ('campo_aberto', 'seedot', 'seedot', 1, array['chlorophyll', 'early_bird']::text[], 'pickpocket'),
  ('campo_aberto', 'sentret', 'sentret', 20, array['run_away', 'keen_eye']::text[], 'frisk'),
  ('campo_aberto', 'shiftry', 'seedot', 1, array['chlorophyll', 'early_bird']::text[], 'pickpocket'),
  ('campo_aberto', 'shroomish', 'shroomish', 20, array['effect_spore', 'poison_heal']::text[], 'quick_feet'),
  ('campo_aberto', 'silcoon', 'wurmple', 10, array['shield_dust']::text[], 'run_away'),
  ('campo_aberto', 'skiploom', 'hoppip', 5, array['chlorophyll', 'leaf_guard']::text[], 'infiltrator'),
  ('campo_aberto', 'skitty', 'skitty', 1, array['cute_charm', 'normalize']::text[], 'wonder_skin'),
  ('campo_aberto', 'snorlax', 'snorlax', 5, array['immunity', 'thick_fat']::text[], 'gluttony'),
  ('campo_aberto', 'snubbull', 'snubbull', 5, array['intimidate', 'run_away']::text[], 'rattled'),
  ('campo_aberto', 'spearow', 'spearow', 30, array['keen_eye']::text[], 'sniper'),
  ('campo_aberto', 'spinarak', 'spinarak', 5, array['swarm', 'insomnia']::text[], 'sniper'),
  ('campo_aberto', 'spinda', 'spinda', 30, array['own_tempo', 'tangled_feet']::text[], 'contrary'),
  ('campo_aberto', 'sudowoodo', 'sudowoodo', 5, array['sturdy', 'rock_head']::text[], 'rattled'),
  ('campo_aberto', 'sunflora', 'sunkern', 5, array['chlorophyll', 'solar_power']::text[], 'early_bird'),
  ('campo_aberto', 'sunkern', 'sunkern', 10, array['chlorophyll', 'solar_power']::text[], 'early_bird'),
  ('campo_aberto', 'surskit', 'surskit', 10, array['swift_swim']::text[], 'rain_dish'),
  ('campo_aberto', 'swellow', 'taillow', 10, array['guts']::text[], 'scrappy'),
  ('campo_aberto', 'taillow', 'taillow', 20, array['guts']::text[], 'scrappy'),
  ('campo_aberto', 'tauros', 'tauros', 5, array['intimidate', 'anger_point']::text[], 'sheer_force'),
  ('campo_aberto', 'togepi', 'togepi', 10, array['hustle', 'serene_grace']::text[], 'super_luck'),
  ('campo_aberto', 'togetic', 'togepi', 5, array['hustle', 'serene_grace']::text[], 'super_luck'),
  ('campo_aberto', 'venomoth', 'venonat', 1, array['compound_eyes', 'tinted_lens']::text[], 'run_away'),
  ('campo_aberto', 'venonat', 'venonat', 5, array['compound_eyes', 'tinted_lens']::text[], 'run_away'),
  ('campo_aberto', 'venusaur', 'bulbasaur', 1, array['overgrow']::text[], 'chlorophyll'),
  ('campo_aberto', 'victreebel', 'bellsprout', 1, array['chlorophyll']::text[], 'gluttony'),
  ('campo_aberto', 'vileplume', 'oddish', 1, array['chlorophyll']::text[], 'run_away'),
  ('campo_aberto', 'volbeat', 'volbeat', 1, array['illuminate', 'swarm']::text[], 'prankster'),
  ('campo_aberto', 'weepinbell', 'bellsprout', 10, array['chlorophyll']::text[], 'gluttony'),
  ('campo_aberto', 'weezing', 'koffing', 1, array['levitate', 'neutralizing_gas']::text[], 'stench'),
  ('campo_aberto', 'whismur', 'whismur', 30, array['soundproof']::text[], 'rattled'),
  ('campo_aberto', 'wigglytuff', 'igglybuff', 5, array['cute_charm', 'competitive']::text[], 'friend_guard'),
  ('campo_aberto', 'wurmple', 'wurmple', 30, array['shield_dust']::text[], 'run_away'),
  ('campo_aberto', 'zigzagoon', 'zigzagoon', 20, array['pickup', 'gluttony']::text[], 'quick_feet'),
  ('campo_aberto', 'zubat', 'zubat', 20, array['inner_focus']::text[], 'infiltrator'),
  ('gelido', 'cloyster', 'shellder', 5, array['shell_armor', 'skill_link']::text[], 'overcoat'),
  ('gelido', 'crobat', 'zubat', 1, array['inner_focus']::text[], 'infiltrator'),
  ('gelido', 'delibird', 'delibird', 10, array['vital_spirit', 'hustle']::text[], 'insomnia'),
  ('gelido', 'dewgong', 'seel', 1, array['thick_fat', 'hydration']::text[], 'ice_body'),
  ('gelido', 'furret', 'sentret', 5, array['run_away', 'keen_eye']::text[], 'frisk'),
  ('gelido', 'glalie', 'snorunt', 5, array['inner_focus', 'ice_body']::text[], 'moody'),
  ('gelido', 'golbat', 'zubat', 10, array['inner_focus']::text[], 'infiltrator'),
  ('gelido', 'golduck', 'psyduck', 10, array['damp', 'cloud_nine']::text[], 'swift_swim'),
  ('gelido', 'horsea', 'horsea', 30, array['swift_swim', 'sniper']::text[], 'damp'),
  ('gelido', 'jynx', 'smoochum', 5, array['oblivious', 'forewarn']::text[], 'hydration'),
  ('gelido', 'kingdra', 'horsea', 1, array['swift_swim', 'sniper']::text[], 'damp'),
  ('gelido', 'kingler', 'krabby', 20, array['hyper_cutter', 'shell_armor']::text[], 'sheer_force'),
  ('gelido', 'krabby', 'krabby', 30, array['hyper_cutter', 'shell_armor']::text[], 'sheer_force'),
  ('gelido', 'lapras', 'lapras', 5, array['water_absorb', 'shell_armor']::text[], 'hydration'),
  ('gelido', 'piloswine', 'swinub', 5, array['oblivious', 'snow_cloak']::text[], 'thick_fat'),
  ('gelido', 'psyduck', 'psyduck', 30, array['damp', 'cloud_nine']::text[], 'swift_swim'),
  ('gelido', 'seadra', 'horsea', 10, array['swift_swim', 'sniper']::text[], 'damp'),
  ('gelido', 'sealeo', 'spheal', 5, array['thick_fat', 'ice_body']::text[], 'oblivious'),
  ('gelido', 'seel', 'seel', 20, array['thick_fat', 'hydration']::text[], 'ice_body'),
  ('gelido', 'sentret', 'sentret', 20, array['run_away', 'keen_eye']::text[], 'frisk'),
  ('gelido', 'shellder', 'shellder', 20, array['shell_armor', 'skill_link']::text[], 'overcoat'),
  ('gelido', 'slowbro', 'slowpoke', 10, array['oblivious', 'own_tempo']::text[], 'regenerator'),
  ('gelido', 'slowking', 'slowking', 5, array['oblivious', 'own_tempo']::text[], 'regenerator'),
  ('gelido', 'slowpoke', 'slowpoke', 30, array['oblivious', 'own_tempo']::text[], 'regenerator'),
  ('gelido', 'smoochum', 'smoochum', 10, array['oblivious', 'forewarn']::text[], 'hydration'),
  ('gelido', 'sneasel', 'sneasel', 1, array['inner_focus', 'keen_eye']::text[], 'pickpocket'),
  ('gelido', 'snorunt', 'snorunt', 10, array['inner_focus', 'ice_body']::text[], 'moody'),
  ('gelido', 'spheal', 'spheal', 30, array['thick_fat', 'ice_body']::text[], 'oblivious'),
  ('gelido', 'stantler', 'stantler', 10, array['intimidate', 'frisk']::text[], 'sap_sipper'),
  ('gelido', 'starmie', 'staryu', 5, array['illuminate', 'natural_cure']::text[], 'analytic'),
  ('gelido', 'staryu', 'staryu', 10, array['illuminate', 'natural_cure']::text[], 'analytic'),
  ('gelido', 'swinub', 'swinub', 30, array['oblivious', 'snow_cloak']::text[], 'thick_fat'),
  ('gelido', 'teddiursa', 'teddiursa', 1, array['pickup', 'quick_feet']::text[], 'honey_gather'),
  ('gelido', 'tentacool', 'tentacool', 30, array['clear_body', 'liquid_ooze']::text[], 'rain_dish'),
  ('gelido', 'tentacruel', 'tentacool', 10, array['clear_body', 'liquid_ooze']::text[], 'rain_dish'),
  ('gelido', 'ursaring', 'teddiursa', 10, array['pickup', 'quick_feet']::text[], 'honey_gather'),
  ('gelido', 'walrein', 'spheal', 1, array['thick_fat', 'ice_body']::text[], 'oblivious'),
  ('gelido', 'zubat', 'zubat', 20, array['inner_focus']::text[], 'infiltrator'),
  ('igneo', 'altaria', 'swablu', 5, array['natural_cure']::text[], 'cloud_nine'),
  ('igneo', 'arcanine', 'growlithe', 5, array['intimidate', 'flash_fire']::text[], 'justified'),
  ('igneo', 'camerupt', 'numel', 5, array['oblivious', 'simple']::text[], 'own_tempo'),
  ('igneo', 'charizard', 'charmander', 1, array['blaze']::text[], 'solar_power'),
  ('igneo', 'charmeleon', 'charmander', 5, array['blaze']::text[], 'solar_power'),
  ('igneo', 'cyndaquil', 'cyndaquil', 10, array['blaze']::text[], 'flash_fire'),
  ('igneo', 'fearow', 'spearow', 10, array['keen_eye']::text[], 'sniper'),
  ('igneo', 'geodude', 'geodude', 30, array['rock_head', 'sturdy']::text[], 'sand_veil'),
  ('igneo', 'golduck', 'psyduck', 10, array['damp', 'cloud_nine']::text[], 'swift_swim'),
  ('igneo', 'golem', 'geodude', 1, array['rock_head', 'sturdy']::text[], 'sand_veil'),
  ('igneo', 'graveler', 'geodude', 30, array['rock_head', 'sturdy']::text[], 'sand_veil'),
  ('igneo', 'grimer', 'grimer', 30, array['stench', 'sticky_hold']::text[], 'poison_touch'),
  ('igneo', 'growlithe', 'growlithe', 5, array['intimidate', 'flash_fire']::text[], 'justified'),
  ('igneo', 'grumpig', 'spoink', 5, array['thick_fat', 'own_tempo']::text[], 'gluttony'),
  ('igneo', 'houndoom', 'houndour', 5, array['early_bird', 'flash_fire']::text[], 'unnerve'),
  ('igneo', 'houndour', 'houndour', 5, array['early_bird', 'flash_fire']::text[], 'unnerve'),
  ('igneo', 'koffing', 'koffing', 30, array['levitate', 'neutralizing_gas']::text[], 'stench'),
  ('igneo', 'machamp', 'machop', 1, array['guts', 'no_guard']::text[], 'steadfast'),
  ('igneo', 'machoke', 'machop', 10, array['guts', 'no_guard']::text[], 'steadfast'),
  ('igneo', 'machop', 'machop', 20, array['guts', 'no_guard']::text[], 'steadfast'),
  ('igneo', 'magby', 'magby', 10, array['flame_body']::text[], 'vital_spirit'),
  ('igneo', 'magcargo', 'slugma', 5, array['magma_armor', 'flame_body']::text[], 'weak_armor'),
  ('igneo', 'magmar', 'magby', 5, array['flame_body']::text[], 'vital_spirit'),
  ('igneo', 'medicham', 'meditite', 5, array['pure_power']::text[], 'telepathy'),
  ('igneo', 'meditite', 'meditite', 10, array['pure_power']::text[], 'telepathy'),
  ('igneo', 'mightyena', 'poochyena', 20, array['run_away', 'quick_feet']::text[], 'rattled'),
  ('igneo', 'muk', 'grimer', 5, array['stench', 'sticky_hold']::text[], 'poison_touch'),
  ('igneo', 'numel', 'numel', 30, array['oblivious', 'simple']::text[], 'own_tempo'),
  ('igneo', 'ponyta', 'ponyta', 20, array['run_away', 'flash_fire']::text[], 'flame_body'),
  ('igneo', 'poochyena', 'poochyena', 30, array['run_away', 'quick_feet']::text[], 'rattled'),
  ('igneo', 'psyduck', 'psyduck', 30, array['damp', 'cloud_nine']::text[], 'swift_swim'),
  ('igneo', 'quilava', 'cyndaquil', 5, array['blaze']::text[], 'flash_fire'),
  ('igneo', 'rapidash', 'ponyta', 10, array['run_away', 'flash_fire']::text[], 'flame_body'),
  ('igneo', 'sandshrew', 'sandshrew', 10, array['sand_veil']::text[], 'sand_rush'),
  ('igneo', 'sandslash', 'sandshrew', 5, array['sand_veil']::text[], 'sand_rush'),
  ('igneo', 'skarmory', 'skarmory', 1, array['keen_eye', 'sturdy']::text[], 'weak_armor'),
  ('igneo', 'slowbro', 'slowpoke', 10, array['oblivious', 'own_tempo']::text[], 'regenerator'),
  ('igneo', 'slowpoke', 'slowpoke', 30, array['oblivious', 'own_tempo']::text[], 'regenerator'),
  ('igneo', 'slugma', 'slugma', 5, array['magma_armor', 'flame_body']::text[], 'weak_armor'),
  ('igneo', 'spearow', 'spearow', 30, array['keen_eye']::text[], 'sniper'),
  ('igneo', 'spinda', 'spinda', 30, array['own_tempo', 'tangled_feet']::text[], 'contrary'),
  ('igneo', 'spoink', 'spoink', 20, array['thick_fat', 'own_tempo']::text[], 'gluttony'),
  ('igneo', 'swablu', 'swablu', 30, array['natural_cure']::text[], 'cloud_nine'),
  ('igneo', 'torkoal', 'torkoal', 30, array['white_smoke', 'drought']::text[], 'shell_armor'),
  ('igneo', 'typhlosion', 'cyndaquil', 1, array['blaze']::text[], 'flash_fire'),
  ('igneo', 'weezing', 'koffing', 1, array['levitate', 'neutralizing_gas']::text[], 'stench'),
  ('industrial', 'ampharos', 'mareep', 1, array['static']::text[], 'plus'),
  ('industrial', 'beldum', 'beldum', 10, array['clear_body']::text[], 'light_metal'),
  ('industrial', 'diglett', 'diglett', 30, array['sand_veil', 'arena_trap']::text[], 'sand_force'),
  ('industrial', 'ditto', 'ditto', 5, array['limber']::text[], 'imposter'),
  ('industrial', 'donphan', 'phanpy', 5, array['pickup']::text[], 'sand_veil'),
  ('industrial', 'dugtrio', 'diglett', 10, array['sand_veil', 'arena_trap']::text[], 'sand_force'),
  ('industrial', 'electabuzz', 'elekid', 5, array['static']::text[], 'vital_spirit'),
  ('industrial', 'electrike', 'electrike', 30, array['static', 'lightning_rod']::text[], 'minus'),
  ('industrial', 'electrode', 'voltorb', 10, array['soundproof', 'static']::text[], 'aftermath'),
  ('industrial', 'elekid', 'elekid', 10, array['static']::text[], 'vital_spirit'),
  ('industrial', 'flaaffy', 'mareep', 10, array['static']::text[], 'plus'),
  ('industrial', 'grimer', 'grimer', 30, array['stench', 'sticky_hold']::text[], 'poison_touch'),
  ('industrial', 'gulpin', 'gulpin', 20, array['liquid_ooze', 'sticky_hold']::text[], 'gluttony'),
  ('industrial', 'hariyama', 'makuhita', 30, array['thick_fat', 'guts']::text[], 'sheer_force'),
  ('industrial', 'hitmonlee', 'tyrogue', 5, array['guts', 'steadfast']::text[], 'vital_spirit'),
  ('industrial', 'koffing', 'koffing', 30, array['levitate', 'neutralizing_gas']::text[], 'stench'),
  ('industrial', 'machamp', 'machop', 1, array['guts', 'no_guard']::text[], 'steadfast'),
  ('industrial', 'machoke', 'machop', 10, array['guts', 'no_guard']::text[], 'steadfast'),
  ('industrial', 'machop', 'machop', 20, array['guts', 'no_guard']::text[], 'steadfast'),
  ('industrial', 'magby', 'magby', 10, array['flame_body']::text[], 'vital_spirit'),
  ('industrial', 'magmar', 'magby', 5, array['flame_body']::text[], 'vital_spirit'),
  ('industrial', 'magnemite', 'magnemite', 20, array['magnet_pull', 'sturdy']::text[], 'analytic'),
  ('industrial', 'magneton', 'magnemite', 10, array['magnet_pull', 'sturdy']::text[], 'analytic'),
  ('industrial', 'makuhita', 'makuhita', 30, array['thick_fat', 'guts']::text[], 'sheer_force'),
  ('industrial', 'manectric', 'electrike', 10, array['static', 'lightning_rod']::text[], 'minus'),
  ('industrial', 'mareep', 'mareep', 10, array['static']::text[], 'plus'),
  ('industrial', 'metagross', 'beldum', 1, array['clear_body']::text[], 'light_metal'),
  ('industrial', 'metang', 'beldum', 5, array['clear_body']::text[], 'light_metal'),
  ('industrial', 'minun', 'minun', 20, array['minus']::text[], 'volt_absorb'),
  ('industrial', 'muk', 'grimer', 5, array['stench', 'sticky_hold']::text[], 'poison_touch'),
  ('industrial', 'nosepass', 'nosepass', 30, array['sturdy', 'magnet_pull']::text[], 'sand_force'),
  ('industrial', 'onix', 'onix', 20, array['rock_head', 'sturdy']::text[], 'weak_armor'),
  ('industrial', 'phanpy', 'phanpy', 1, array['pickup']::text[], 'sand_veil'),
  ('industrial', 'pichu', 'pichu', 10, array['static']::text[], 'lightning_rod'),
  ('industrial', 'pikachu', 'pichu', 5, array['static']::text[], 'lightning_rod'),
  ('industrial', 'plusle', 'plusle', 1, array['plus']::text[], 'lightning_rod'),
  ('industrial', 'raichu', 'pichu', 5, array['static']::text[], 'lightning_rod'),
  ('industrial', 'raticate', 'rattata', 10, array['run_away', 'guts']::text[], 'hustle'),
  ('industrial', 'rattata', 'rattata', 30, array['run_away', 'guts']::text[], 'hustle'),
  ('industrial', 'rhydon', 'rhyhorn', 1, array['lightning_rod', 'rock_head']::text[], 'reckless'),
  ('industrial', 'rhyhorn', 'rhyhorn', 10, array['lightning_rod', 'rock_head']::text[], 'reckless'),
  ('industrial', 'steelix', 'onix', 5, array['rock_head', 'sturdy']::text[], 'weak_armor'),
  ('industrial', 'swalot', 'gulpin', 5, array['liquid_ooze', 'sticky_hold']::text[], 'gluttony'),
  ('industrial', 'tyrogue', 'tyrogue', 10, array['guts', 'steadfast']::text[], 'vital_spirit'),
  ('industrial', 'voltorb', 'voltorb', 30, array['soundproof', 'static']::text[], 'aftermath'),
  ('industrial', 'weezing', 'koffing', 1, array['levitate', 'neutralizing_gas']::text[], 'stench'),
  ('marinho', 'carvanha', 'carvanha', 30, array['rough_skin']::text[], 'speed_boost'),
  ('marinho', 'chinchou', 'chinchou', 30, array['volt_absorb', 'illuminate']::text[], 'water_absorb'),
  ('marinho', 'clamperl', 'clamperl', 30, array['shell_armor']::text[], 'rattled'),
  ('marinho', 'cloyster', 'shellder', 5, array['shell_armor', 'skill_link']::text[], 'overcoat'),
  ('marinho', 'corphish', 'corphish', 30, array['hyper_cutter', 'shell_armor']::text[], 'adaptability'),
  ('marinho', 'corsola', 'corsola', 10, array['hustle', 'natural_cure']::text[], 'regenerator'),
  ('marinho', 'crawdaunt', 'corphish', 5, array['hyper_cutter', 'shell_armor']::text[], 'adaptability'),
  ('marinho', 'crobat', 'zubat', 1, array['inner_focus']::text[], 'infiltrator'),
  ('marinho', 'dewgong', 'seel', 1, array['thick_fat', 'hydration']::text[], 'ice_body'),
  ('marinho', 'feebas', 'feebas', 10, array['swift_swim', 'oblivious']::text[], 'adaptability'),
  ('marinho', 'golbat', 'zubat', 10, array['inner_focus']::text[], 'infiltrator'),
  ('marinho', 'goldeen', 'goldeen', 30, array['swift_swim', 'water_veil']::text[], 'lightning_rod'),
  ('marinho', 'gorebyss', 'gorebyss', 5, array['swift_swim']::text[], 'hydration'),
  ('marinho', 'gyarados', 'magikarp', 20, array['swift_swim']::text[], 'rattled'),
  ('marinho', 'horsea', 'horsea', 30, array['swift_swim', 'sniper']::text[], 'damp'),
  ('marinho', 'huntail', 'clamperl', 5, array['shell_armor']::text[], 'rattled'),
  ('marinho', 'kabuto', 'kabuto', 10, array['swift_swim', 'battle_armor']::text[], 'weak_armor'),
  ('marinho', 'kabutops', 'kabuto', 5, array['swift_swim', 'battle_armor']::text[], 'weak_armor'),
  ('marinho', 'kingdra', 'horsea', 1, array['swift_swim', 'sniper']::text[], 'damp'),
  ('marinho', 'kingler', 'krabby', 20, array['hyper_cutter', 'shell_armor']::text[], 'sheer_force'),
  ('marinho', 'krabby', 'krabby', 30, array['hyper_cutter', 'shell_armor']::text[], 'sheer_force'),
  ('marinho', 'lanturn', 'chinchou', 10, array['volt_absorb', 'illuminate']::text[], 'water_absorb'),
  ('marinho', 'lapras', 'lapras', 5, array['water_absorb', 'shell_armor']::text[], 'hydration'),
  ('marinho', 'luvdisc', 'luvdisc', 30, array['swift_swim']::text[], 'hydration'),
  ('marinho', 'magikarp', 'magikarp', 30, array['swift_swim']::text[], 'rattled'),
  ('marinho', 'mantine', 'mantine', 5, array['swift_swim', 'water_absorb']::text[], 'water_veil'),
  ('marinho', 'milotic', 'feebas', 5, array['swift_swim', 'oblivious']::text[], 'adaptability'),
  ('marinho', 'octillery', 'remoraid', 5, array['hustle', 'sniper']::text[], 'moody'),
  ('marinho', 'omanyte', 'omanyte', 10, array['swift_swim', 'shell_armor']::text[], 'weak_armor'),
  ('marinho', 'omastar', 'omanyte', 5, array['swift_swim', 'shell_armor']::text[], 'weak_armor'),
  ('marinho', 'pelipper', 'wingull', 5, array['keen_eye', 'hydration']::text[], 'rain_dish'),
  ('marinho', 'poliwag', 'poliwag', 30, array['water_absorb', 'damp']::text[], 'swift_swim'),
  ('marinho', 'poliwhirl', 'poliwag', 20, array['water_absorb', 'damp']::text[], 'swift_swim'),
  ('marinho', 'poliwrath', 'poliwag', 1, array['water_absorb', 'damp']::text[], 'swift_swim'),
  ('marinho', 'qwilfish', 'qwilfish', 30, array['poison_point', 'swift_swim']::text[], 'intimidate'),
  ('marinho', 'relicanth', 'relicanth', 5, array['swift_swim', 'rock_head']::text[], 'sturdy'),
  ('marinho', 'remoraid', 'remoraid', 30, array['hustle', 'sniper']::text[], 'moody'),
  ('marinho', 'seadra', 'horsea', 10, array['swift_swim', 'sniper']::text[], 'damp'),
  ('marinho', 'seaking', 'goldeen', 20, array['swift_swim', 'water_veil']::text[], 'lightning_rod'),
  ('marinho', 'seel', 'seel', 20, array['thick_fat', 'hydration']::text[], 'ice_body'),
  ('marinho', 'sharpedo', 'carvanha', 30, array['rough_skin']::text[], 'speed_boost'),
  ('marinho', 'shellder', 'shellder', 20, array['shell_armor', 'skill_link']::text[], 'overcoat'),
  ('marinho', 'slowbro', 'slowpoke', 10, array['oblivious', 'own_tempo']::text[], 'regenerator'),
  ('marinho', 'slowpoke', 'slowpoke', 30, array['oblivious', 'own_tempo']::text[], 'regenerator'),
  ('marinho', 'starmie', 'staryu', 5, array['illuminate', 'natural_cure']::text[], 'analytic'),
  ('marinho', 'staryu', 'staryu', 10, array['illuminate', 'natural_cure']::text[], 'analytic'),
  ('marinho', 'tentacool', 'tentacool', 30, array['clear_body', 'liquid_ooze']::text[], 'rain_dish'),
  ('marinho', 'tentacruel', 'tentacool', 10, array['clear_body', 'liquid_ooze']::text[], 'rain_dish'),
  ('marinho', 'wailmer', 'wailmer', 30, array['water_veil', 'oblivious']::text[], 'pressure'),
  ('marinho', 'wailord', 'wailmer', 1, array['water_veil', 'oblivious']::text[], 'pressure'),
  ('marinho', 'wingull', 'wingull', 30, array['keen_eye', 'hydration']::text[], 'rain_dish'),
  ('marinho', 'zubat', 'zubat', 20, array['inner_focus']::text[], 'infiltrator'),
  ('mata', 'aipom', 'aipom', 20, array['run_away', 'pickup']::text[], 'skill_link'),
  ('mata', 'arbok', 'ekans', 5, array['intimidate', 'shed_skin']::text[], 'unnerve'),
  ('mata', 'ariados', 'spinarak', 1, array['swarm', 'insomnia']::text[], 'sniper'),
  ('mata', 'bayleef', 'chikorita', 5, array['overgrow']::text[], 'leaf_guard'),
  ('mata', 'beautifly', 'wurmple', 1, array['shield_dust']::text[], 'run_away'),
  ('mata', 'beedrill', 'weedle', 1, array['shield_dust']::text[], 'run_away'),
  ('mata', 'bellossom', 'bellossom', 1, array['chlorophyll']::text[], 'healer'),
  ('mata', 'bellsprout', 'bellsprout', 20, array['chlorophyll']::text[], 'gluttony'),
  ('mata', 'breloom', 'shroomish', 5, array['effect_spore', 'poison_heal']::text[], 'quick_feet'),
  ('mata', 'butterfree', 'caterpie', 1, array['shield_dust']::text[], 'run_away'),
  ('mata', 'cascoon', 'cascoon', 10, array['shed_skin']::text[], null),
  ('mata', 'caterpie', 'caterpie', 10, array['shield_dust']::text[], 'run_away'),
  ('mata', 'chikorita', 'chikorita', 10, array['overgrow']::text[], 'leaf_guard'),
  ('mata', 'crobat', 'zubat', 1, array['inner_focus']::text[], 'infiltrator'),
  ('mata', 'dustox', 'cascoon', 1, array['shed_skin']::text[], null),
  ('mata', 'ekans', 'ekans', 10, array['intimidate', 'shed_skin']::text[], 'unnerve'),
  ('mata', 'exeggcute', 'exeggcute', 20, array['chlorophyll']::text[], 'harvest'),
  ('mata', 'exeggutor', 'exeggcute', 5, array['chlorophyll']::text[], 'harvest'),
  ('mata', 'farfetch_d', 'farfetch_d', 5, array['keen_eye', 'inner_focus']::text[], 'defiant'),
  ('mata', 'fearow', 'spearow', 10, array['keen_eye']::text[], 'sniper'),
  ('mata', 'forretress', 'pineco', 5, array['sturdy']::text[], 'overcoat'),
  ('mata', 'girafarig', 'girafarig', 20, array['inner_focus', 'early_bird']::text[], 'sap_sipper'),
  ('mata', 'gloom', 'oddish', 1, array['chlorophyll']::text[], 'run_away'),
  ('mata', 'golbat', 'zubat', 10, array['inner_focus']::text[], 'infiltrator'),
  ('mata', 'golduck', 'psyduck', 10, array['damp', 'cloud_nine']::text[], 'swift_swim'),
  ('mata', 'grovyle', 'treecko', 5, array['overgrow']::text[], 'unburden'),
  ('mata', 'heracross', 'heracross', 5, array['swarm', 'guts']::text[], 'moxie'),
  ('mata', 'hoothoot', 'hoothoot', 20, array['insomnia', 'keen_eye']::text[], 'tinted_lens'),
  ('mata', 'kakuna', 'weedle', 5, array['shield_dust']::text[], 'run_away'),
  ('mata', 'kangaskhan', 'kangaskhan', 5, array['early_bird', 'scrappy']::text[], 'inner_focus'),
  ('mata', 'kecleon', 'kecleon', 1, array['color_change']::text[], 'protean'),
  ('mata', 'meganium', 'chikorita', 1, array['overgrow']::text[], 'leaf_guard'),
  ('mata', 'metapod', 'caterpie', 5, array['shield_dust']::text[], 'run_away'),
  ('mata', 'nidoking', 'nidoran_m', 1, array['poison_point', 'rivalry']::text[], 'hustle'),
  ('mata', 'nidoqueen', 'nidoran_f', 1, array['poison_point', 'rivalry']::text[], 'hustle'),
  ('mata', 'nidoran_f', 'nidoran_f', 20, array['poison_point', 'rivalry']::text[], 'hustle'),
  ('mata', 'nidoran_m', 'nidoran_m', 20, array['poison_point', 'rivalry']::text[], 'hustle'),
  ('mata', 'nidorina', 'nidoran_f', 30, array['poison_point', 'rivalry']::text[], 'hustle'),
  ('mata', 'nidorino', 'nidoran_m', 30, array['poison_point', 'rivalry']::text[], 'hustle'),
  ('mata', 'nincada', 'nincada', 20, array['compound_eyes']::text[], 'run_away'),
  ('mata', 'ninjask', 'nincada', 5, array['compound_eyes']::text[], 'run_away'),
  ('mata', 'noctowl', 'hoothoot', 5, array['insomnia', 'keen_eye']::text[], 'tinted_lens'),
  ('mata', 'nuzleaf', 'seedot', 1, array['chlorophyll', 'early_bird']::text[], 'pickpocket'),
  ('mata', 'oddish', 'oddish', 10, array['chlorophyll']::text[], 'run_away'),
  ('mata', 'paras', 'paras', 10, array['effect_spore', 'dry_skin']::text[], 'damp'),
  ('mata', 'parasect', 'paras', 5, array['effect_spore', 'dry_skin']::text[], 'damp'),
  ('mata', 'pidgeot', 'pidgey', 1, array['keen_eye', 'tangled_feet']::text[], 'big_pecks'),
  ('mata', 'pidgeotto', 'pidgey', 10, array['keen_eye', 'tangled_feet']::text[], 'big_pecks'),
  ('mata', 'pidgey', 'pidgey', 20, array['keen_eye', 'tangled_feet']::text[], 'big_pecks'),
  ('mata', 'pineco', 'pineco', 10, array['sturdy']::text[], 'overcoat'),
  ('mata', 'pinsir', 'pinsir', 1, array['hyper_cutter', 'mold_breaker']::text[], 'moxie'),
  ('mata', 'psyduck', 'psyduck', 30, array['damp', 'cloud_nine']::text[], 'swift_swim'),
  ('mata', 'roselia', 'roselia', 5, array['natural_cure', 'poison_point']::text[], 'leaf_guard'),
  ('mata', 'sceptile', 'treecko', 1, array['overgrow']::text[], 'unburden'),
  ('mata', 'scizor', 'scyther', 5, array['swarm', 'technician']::text[], 'steadfast'),
  ('mata', 'scyther', 'scyther', 1, array['swarm', 'technician']::text[], 'steadfast'),
  ('mata', 'seedot', 'seedot', 1, array['chlorophyll', 'early_bird']::text[], 'pickpocket'),
  ('mata', 'seviper', 'seviper', 10, array['shed_skin']::text[], 'infiltrator'),
  ('mata', 'shedinja', 'shedinja', 5, array['wonder_guard']::text[], null),
  ('mata', 'shiftry', 'seedot', 1, array['chlorophyll', 'early_bird']::text[], 'pickpocket'),
  ('mata', 'shroomish', 'shroomish', 20, array['effect_spore', 'poison_heal']::text[], 'quick_feet'),
  ('mata', 'silcoon', 'wurmple', 10, array['shield_dust']::text[], 'run_away'),
  ('mata', 'slaking', 'slakoth', 1, array['truant']::text[], null),
  ('mata', 'slakoth', 'slakoth', 5, array['truant']::text[], null),
  ('mata', 'spearow', 'spearow', 30, array['keen_eye']::text[], 'sniper'),
  ('mata', 'spinarak', 'spinarak', 5, array['swarm', 'insomnia']::text[], 'sniper'),
  ('mata', 'stantler', 'stantler', 10, array['intimidate', 'frisk']::text[], 'sap_sipper'),
  ('mata', 'swellow', 'taillow', 10, array['guts']::text[], 'scrappy'),
  ('mata', 'taillow', 'taillow', 20, array['guts']::text[], 'scrappy'),
  ('mata', 'tangela', 'tangela', 30, array['chlorophyll', 'leaf_guard']::text[], 'regenerator'),
  ('mata', 'teddiursa', 'teddiursa', 1, array['pickup', 'quick_feet']::text[], 'honey_gather'),
  ('mata', 'treecko', 'treecko', 10, array['overgrow']::text[], 'unburden'),
  ('mata', 'tropius', 'tropius', 10, array['chlorophyll', 'solar_power']::text[], 'harvest'),
  ('mata', 'ursaring', 'teddiursa', 10, array['pickup', 'quick_feet']::text[], 'honey_gather'),
  ('mata', 'venomoth', 'venonat', 1, array['compound_eyes', 'tinted_lens']::text[], 'run_away'),
  ('mata', 'venonat', 'venonat', 5, array['compound_eyes', 'tinted_lens']::text[], 'run_away'),
  ('mata', 'victreebel', 'bellsprout', 1, array['chlorophyll']::text[], 'gluttony'),
  ('mata', 'vigoroth', 'slakoth', 5, array['truant']::text[], null),
  ('mata', 'vileplume', 'oddish', 1, array['chlorophyll']::text[], 'run_away'),
  ('mata', 'weedle', 'weedle', 10, array['shield_dust']::text[], 'run_away'),
  ('mata', 'weepinbell', 'bellsprout', 10, array['chlorophyll']::text[], 'gluttony'),
  ('mata', 'wurmple', 'wurmple', 30, array['shield_dust']::text[], 'run_away'),
  ('mata', 'yanma', 'yanma', 1, array['speed_boost', 'compound_eyes']::text[], 'frisk'),
  ('mata', 'zangoose', 'zangoose', 5, array['immunity']::text[], 'toxic_boost'),
  ('mata', 'zubat', 'zubat', 20, array['inner_focus']::text[], 'infiltrator'),
  ('sagrado', 'abra', 'abra', 10, array['synchronize', 'inner_focus']::text[], 'magic_guard'),
  ('sagrado', 'alakazam', 'abra', 1, array['synchronize', 'inner_focus']::text[], 'magic_guard'),
  ('sagrado', 'altaria', 'swablu', 5, array['natural_cure']::text[], 'cloud_nine'),
  ('sagrado', 'azumarill', 'azurill', 5, array['thick_fat', 'huge_power']::text[], 'sap_sipper'),
  ('sagrado', 'azurill', 'azurill', 10, array['thick_fat', 'huge_power']::text[], 'sap_sipper'),
  ('sagrado', 'baltoy', 'baltoy', 20, array['levitate']::text[], null),
  ('sagrado', 'banette', 'shuppet', 20, array['insomnia', 'frisk']::text[], 'cursed_body'),
  ('sagrado', 'beldum', 'beldum', 10, array['clear_body']::text[], 'light_metal'),
  ('sagrado', 'bellsprout', 'bellsprout', 20, array['chlorophyll']::text[], 'gluttony'),
  ('sagrado', 'chimecho', 'chimecho', 1, array['levitate']::text[], null),
  ('sagrado', 'claydol', 'baltoy', 20, array['levitate']::text[], null),
  ('sagrado', 'clefable', 'cleffa', 1, array['cute_charm', 'magic_guard']::text[], 'friend_guard'),
  ('sagrado', 'clefairy', 'cleffa', 1, array['cute_charm', 'magic_guard']::text[], 'friend_guard'),
  ('sagrado', 'cleffa', 'cleffa', 10, array['cute_charm', 'magic_guard']::text[], 'friend_guard'),
  ('sagrado', 'crobat', 'zubat', 1, array['inner_focus']::text[], 'infiltrator'),
  ('sagrado', 'cubone', 'cubone', 30, array['rock_head', 'lightning_rod']::text[], 'battle_armor'),
  ('sagrado', 'drowzee', 'drowzee', 20, array['insomnia', 'forewarn']::text[], 'inner_focus'),
  ('sagrado', 'dusclops', 'duskull', 5, array['levitate']::text[], 'frisk'),
  ('sagrado', 'duskull', 'duskull', 10, array['levitate']::text[], 'frisk'),
  ('sagrado', 'gardevoir', 'ralts', 1, array['synchronize', 'trace']::text[], 'telepathy'),
  ('sagrado', 'gastly', 'gastly', 20, array['levitate']::text[], null),
  ('sagrado', 'gengar', 'gastly', 1, array['levitate']::text[], null),
  ('sagrado', 'girafarig', 'girafarig', 20, array['inner_focus', 'early_bird']::text[], 'sap_sipper'),
  ('sagrado', 'golbat', 'zubat', 10, array['inner_focus']::text[], 'infiltrator'),
  ('sagrado', 'grumpig', 'spoink', 5, array['thick_fat', 'own_tempo']::text[], 'gluttony'),
  ('sagrado', 'haunter', 'gastly', 5, array['levitate']::text[], null),
  ('sagrado', 'hoothoot', 'hoothoot', 20, array['insomnia', 'keen_eye']::text[], 'tinted_lens'),
  ('sagrado', 'hypno', 'drowzee', 5, array['insomnia', 'forewarn']::text[], 'inner_focus'),
  ('sagrado', 'igglybuff', 'igglybuff', 10, array['cute_charm', 'competitive']::text[], 'friend_guard'),
  ('sagrado', 'jigglypuff', 'igglybuff', 1, array['cute_charm', 'competitive']::text[], 'friend_guard'),
  ('sagrado', 'jynx', 'smoochum', 5, array['oblivious', 'forewarn']::text[], 'hydration'),
  ('sagrado', 'kadabra', 'abra', 5, array['synchronize', 'inner_focus']::text[], 'magic_guard'),
  ('sagrado', 'kirlia', 'ralts', 5, array['synchronize', 'trace']::text[], 'telepathy'),
  ('sagrado', 'marill', 'azurill', 5, array['thick_fat', 'huge_power']::text[], 'sap_sipper'),
  ('sagrado', 'marowak', 'cubone', 1, array['rock_head', 'lightning_rod']::text[], 'battle_armor'),
  ('sagrado', 'mawile', 'mawile', 5, array['hyper_cutter', 'intimidate']::text[], 'sheer_force'),
  ('sagrado', 'medicham', 'meditite', 5, array['pure_power']::text[], 'telepathy'),
  ('sagrado', 'meditite', 'meditite', 10, array['pure_power']::text[], 'telepathy'),
  ('sagrado', 'metagross', 'beldum', 1, array['clear_body']::text[], 'light_metal'),
  ('sagrado', 'metang', 'beldum', 5, array['clear_body']::text[], 'light_metal'),
  ('sagrado', 'natu', 'natu', 30, array['synchronize', 'early_bird']::text[], 'magic_bounce'),
  ('sagrado', 'noctowl', 'hoothoot', 5, array['insomnia', 'keen_eye']::text[], 'tinted_lens'),
  ('sagrado', 'ralts', 'ralts', 5, array['synchronize', 'trace']::text[], 'telepathy'),
  ('sagrado', 'raticate', 'rattata', 10, array['run_away', 'guts']::text[], 'hustle'),
  ('sagrado', 'rattata', 'rattata', 30, array['run_away', 'guts']::text[], 'hustle'),
  ('sagrado', 'sableye', 'sableye', 30, array['keen_eye', 'stall']::text[], 'prankster'),
  ('sagrado', 'shuppet', 'shuppet', 30, array['insomnia', 'frisk']::text[], 'cursed_body'),
  ('sagrado', 'slowbro', 'slowpoke', 10, array['oblivious', 'own_tempo']::text[], 'regenerator'),
  ('sagrado', 'slowking', 'slowking', 5, array['oblivious', 'own_tempo']::text[], 'regenerator'),
  ('sagrado', 'slowpoke', 'slowpoke', 30, array['oblivious', 'own_tempo']::text[], 'regenerator'),
  ('sagrado', 'smoochum', 'smoochum', 10, array['oblivious', 'forewarn']::text[], 'hydration'),
  ('sagrado', 'spoink', 'spoink', 20, array['thick_fat', 'own_tempo']::text[], 'gluttony'),
  ('sagrado', 'swablu', 'swablu', 30, array['natural_cure']::text[], 'cloud_nine'),
  ('sagrado', 'togepi', 'togepi', 10, array['hustle', 'serene_grace']::text[], 'super_luck'),
  ('sagrado', 'togetic', 'togepi', 5, array['hustle', 'serene_grace']::text[], 'super_luck'),
  ('sagrado', 'unown', 'unown', 30, array['levitate']::text[], null),
  ('sagrado', 'victreebel', 'bellsprout', 1, array['chlorophyll']::text[], 'gluttony'),
  ('sagrado', 'weepinbell', 'bellsprout', 10, array['chlorophyll']::text[], 'gluttony'),
  ('sagrado', 'wigglytuff', 'igglybuff', 5, array['cute_charm', 'competitive']::text[], 'friend_guard'),
  ('sagrado', 'wobbuffet', 'wynaut', 10, array['shadow_tag']::text[], 'telepathy'),
  ('sagrado', 'wynaut', 'wynaut', 30, array['shadow_tag']::text[], 'telepathy'),
  ('sagrado', 'xatu', 'natu', 5, array['synchronize', 'early_bird']::text[], 'magic_bounce'),
  ('sagrado', 'zubat', 'zubat', 20, array['inner_focus']::text[], 'infiltrator'),
  ('sombrio', 'absol', 'absol', 10, array['pressure', 'super_luck']::text[], 'justified'),
  ('sombrio', 'baltoy', 'baltoy', 20, array['levitate']::text[], null),
  ('sombrio', 'banette', 'shuppet', 20, array['insomnia', 'frisk']::text[], 'cursed_body'),
  ('sombrio', 'beldum', 'beldum', 10, array['clear_body']::text[], 'light_metal'),
  ('sombrio', 'chimecho', 'chimecho', 1, array['levitate']::text[], null),
  ('sombrio', 'claydol', 'baltoy', 20, array['levitate']::text[], null),
  ('sombrio', 'clefable', 'cleffa', 1, array['cute_charm', 'magic_guard']::text[], 'friend_guard'),
  ('sombrio', 'clefairy', 'cleffa', 1, array['cute_charm', 'magic_guard']::text[], 'friend_guard'),
  ('sombrio', 'cleffa', 'cleffa', 10, array['cute_charm', 'magic_guard']::text[], 'friend_guard'),
  ('sombrio', 'crobat', 'zubat', 1, array['inner_focus']::text[], 'infiltrator'),
  ('sombrio', 'cubone', 'cubone', 30, array['rock_head', 'lightning_rod']::text[], 'battle_armor'),
  ('sombrio', 'dunsparce', 'dunsparce', 1, array['serene_grace', 'run_away']::text[], 'rattled'),
  ('sombrio', 'dusclops', 'duskull', 5, array['levitate']::text[], 'frisk'),
  ('sombrio', 'duskull', 'duskull', 10, array['levitate']::text[], 'frisk'),
  ('sombrio', 'exploud', 'whismur', 1, array['soundproof']::text[], 'rattled'),
  ('sombrio', 'gastly', 'gastly', 20, array['levitate']::text[], null),
  ('sombrio', 'gengar', 'gastly', 1, array['levitate']::text[], null),
  ('sombrio', 'golbat', 'zubat', 10, array['inner_focus']::text[], 'infiltrator'),
  ('sombrio', 'grimer', 'grimer', 30, array['stench', 'sticky_hold']::text[], 'poison_touch'),
  ('sombrio', 'haunter', 'gastly', 5, array['levitate']::text[], null),
  ('sombrio', 'houndoom', 'houndour', 5, array['early_bird', 'flash_fire']::text[], 'unnerve'),
  ('sombrio', 'houndour', 'houndour', 5, array['early_bird', 'flash_fire']::text[], 'unnerve'),
  ('sombrio', 'kingler', 'krabby', 20, array['hyper_cutter', 'shell_armor']::text[], 'sheer_force'),
  ('sombrio', 'koffing', 'koffing', 30, array['levitate', 'neutralizing_gas']::text[], 'stench'),
  ('sombrio', 'krabby', 'krabby', 30, array['hyper_cutter', 'shell_armor']::text[], 'sheer_force'),
  ('sombrio', 'loudred', 'whismur', 10, array['soundproof']::text[], 'rattled'),
  ('sombrio', 'lunatone', 'lunatone', 5, array['levitate']::text[], null),
  ('sombrio', 'magby', 'magby', 10, array['flame_body']::text[], 'vital_spirit'),
  ('sombrio', 'magmar', 'magby', 5, array['flame_body']::text[], 'vital_spirit'),
  ('sombrio', 'marowak', 'cubone', 1, array['rock_head', 'lightning_rod']::text[], 'battle_armor'),
  ('sombrio', 'mawile', 'mawile', 5, array['hyper_cutter', 'intimidate']::text[], 'sheer_force'),
  ('sombrio', 'medicham', 'meditite', 5, array['pure_power']::text[], 'telepathy'),
  ('sombrio', 'meditite', 'meditite', 10, array['pure_power']::text[], 'telepathy'),
  ('sombrio', 'metagross', 'beldum', 1, array['clear_body']::text[], 'light_metal'),
  ('sombrio', 'metang', 'beldum', 5, array['clear_body']::text[], 'light_metal'),
  ('sombrio', 'misdreavus', 'misdreavus', 5, array['levitate']::text[], null),
  ('sombrio', 'muk', 'grimer', 5, array['stench', 'sticky_hold']::text[], 'poison_touch'),
  ('sombrio', 'murkrow', 'murkrow', 5, array['insomnia', 'super_luck']::text[], 'prankster'),
  ('sombrio', 'paras', 'paras', 10, array['effect_spore', 'dry_skin']::text[], 'damp'),
  ('sombrio', 'parasect', 'paras', 5, array['effect_spore', 'dry_skin']::text[], 'damp'),
  ('sombrio', 'pelipper', 'wingull', 5, array['keen_eye', 'hydration']::text[], 'rain_dish'),
  ('sombrio', 'raticate', 'rattata', 10, array['run_away', 'guts']::text[], 'hustle'),
  ('sombrio', 'rattata', 'rattata', 30, array['run_away', 'guts']::text[], 'hustle'),
  ('sombrio', 'sableye', 'sableye', 30, array['keen_eye', 'stall']::text[], 'prankster'),
  ('sombrio', 'shuppet', 'shuppet', 30, array['insomnia', 'frisk']::text[], 'cursed_body'),
  ('sombrio', 'solrock', 'solrock', 20, array['levitate']::text[], null),
  ('sombrio', 'starmie', 'staryu', 5, array['illuminate', 'natural_cure']::text[], 'analytic'),
  ('sombrio', 'staryu', 'staryu', 10, array['illuminate', 'natural_cure']::text[], 'analytic'),
  ('sombrio', 'tentacool', 'tentacool', 30, array['clear_body', 'liquid_ooze']::text[], 'rain_dish'),
  ('sombrio', 'tentacruel', 'tentacool', 10, array['clear_body', 'liquid_ooze']::text[], 'rain_dish'),
  ('sombrio', 'weezing', 'koffing', 1, array['levitate', 'neutralizing_gas']::text[], 'stench'),
  ('sombrio', 'whismur', 'whismur', 30, array['soundproof']::text[], 'rattled'),
  ('sombrio', 'wingull', 'wingull', 30, array['keen_eye', 'hydration']::text[], 'rain_dish'),
  ('sombrio', 'zubat', 'zubat', 20, array['inner_focus']::text[], 'infiltrator'),
  ('subterraneo', 'aggron', 'aron', 1, array['sturdy', 'rock_head']::text[], 'heavy_metal'),
  ('subterraneo', 'altaria', 'swablu', 5, array['natural_cure']::text[], 'cloud_nine'),
  ('subterraneo', 'aron', 'aron', 20, array['sturdy', 'rock_head']::text[], 'heavy_metal'),
  ('subterraneo', 'bagon', 'bagon', 30, array['rock_head']::text[], 'sheer_force'),
  ('subterraneo', 'barboach', 'barboach', 30, array['oblivious', 'anticipation']::text[], 'hydration'),
  ('subterraneo', 'blaziken', 'torchic', 1, array['blaze']::text[], 'speed_boost'),
  ('subterraneo', 'combusken', 'torchic', 5, array['blaze']::text[], 'speed_boost'),
  ('subterraneo', 'crobat', 'zubat', 1, array['inner_focus']::text[], 'infiltrator'),
  ('subterraneo', 'cubone', 'cubone', 30, array['rock_head', 'lightning_rod']::text[], 'battle_armor'),
  ('subterraneo', 'donphan', 'phanpy', 5, array['pickup']::text[], 'sand_veil'),
  ('subterraneo', 'dunsparce', 'dunsparce', 1, array['serene_grace', 'run_away']::text[], 'rattled'),
  ('subterraneo', 'exploud', 'whismur', 1, array['soundproof']::text[], 'rattled'),
  ('subterraneo', 'fearow', 'spearow', 10, array['keen_eye']::text[], 'sniper'),
  ('subterraneo', 'geodude', 'geodude', 30, array['rock_head', 'sturdy']::text[], 'sand_veil'),
  ('subterraneo', 'golbat', 'zubat', 10, array['inner_focus']::text[], 'infiltrator'),
  ('subterraneo', 'goldeen', 'goldeen', 30, array['swift_swim', 'water_veil']::text[], 'lightning_rod'),
  ('subterraneo', 'golem', 'geodude', 1, array['rock_head', 'sturdy']::text[], 'sand_veil'),
  ('subterraneo', 'graveler', 'geodude', 30, array['rock_head', 'sturdy']::text[], 'sand_veil'),
  ('subterraneo', 'grumpig', 'spoink', 5, array['thick_fat', 'own_tempo']::text[], 'gluttony'),
  ('subterraneo', 'gyarados', 'magikarp', 20, array['swift_swim']::text[], 'rattled'),
  ('subterraneo', 'hariyama', 'makuhita', 30, array['thick_fat', 'guts']::text[], 'sheer_force'),
  ('subterraneo', 'lairon', 'aron', 20, array['sturdy', 'rock_head']::text[], 'heavy_metal'),
  ('subterraneo', 'larvitar', 'larvitar', 5, array['guts']::text[], 'sand_veil'),
  ('subterraneo', 'loudred', 'whismur', 10, array['soundproof']::text[], 'rattled'),
  ('subterraneo', 'lunatone', 'lunatone', 5, array['levitate']::text[], null),
  ('subterraneo', 'machamp', 'machop', 1, array['guts', 'no_guard']::text[], 'steadfast'),
  ('subterraneo', 'machoke', 'machop', 10, array['guts', 'no_guard']::text[], 'steadfast'),
  ('subterraneo', 'machop', 'machop', 20, array['guts', 'no_guard']::text[], 'steadfast'),
  ('subterraneo', 'magcargo', 'slugma', 5, array['magma_armor', 'flame_body']::text[], 'weak_armor'),
  ('subterraneo', 'magikarp', 'magikarp', 30, array['swift_swim']::text[], 'rattled'),
  ('subterraneo', 'makuhita', 'makuhita', 30, array['thick_fat', 'guts']::text[], 'sheer_force'),
  ('subterraneo', 'mankey', 'mankey', 10, array['vital_spirit', 'anger_point']::text[], 'defiant'),
  ('subterraneo', 'marowak', 'cubone', 1, array['rock_head', 'lightning_rod']::text[], 'battle_armor'),
  ('subterraneo', 'mawile', 'mawile', 5, array['hyper_cutter', 'intimidate']::text[], 'sheer_force'),
  ('subterraneo', 'medicham', 'meditite', 5, array['pure_power']::text[], 'telepathy'),
  ('subterraneo', 'meditite', 'meditite', 10, array['pure_power']::text[], 'telepathy'),
  ('subterraneo', 'murkrow', 'murkrow', 5, array['insomnia', 'super_luck']::text[], 'prankster'),
  ('subterraneo', 'natu', 'natu', 30, array['synchronize', 'early_bird']::text[], 'magic_bounce'),
  ('subterraneo', 'nosepass', 'nosepass', 30, array['sturdy', 'magnet_pull']::text[], 'sand_force'),
  ('subterraneo', 'onix', 'onix', 20, array['rock_head', 'sturdy']::text[], 'weak_armor'),
  ('subterraneo', 'paras', 'paras', 10, array['effect_spore', 'dry_skin']::text[], 'damp'),
  ('subterraneo', 'parasect', 'paras', 5, array['effect_spore', 'dry_skin']::text[], 'damp'),
  ('subterraneo', 'phanpy', 'phanpy', 1, array['pickup']::text[], 'sand_veil'),
  ('subterraneo', 'pidgeot', 'pidgey', 1, array['keen_eye', 'tangled_feet']::text[], 'big_pecks'),
  ('subterraneo', 'pidgeotto', 'pidgey', 10, array['keen_eye', 'tangled_feet']::text[], 'big_pecks'),
  ('subterraneo', 'pidgey', 'pidgey', 20, array['keen_eye', 'tangled_feet']::text[], 'big_pecks'),
  ('subterraneo', 'primeape', 'mankey', 1, array['vital_spirit', 'anger_point']::text[], 'defiant'),
  ('subterraneo', 'pupitar', 'larvitar', 1, array['guts']::text[], 'sand_veil'),
  ('subterraneo', 'rhydon', 'rhyhorn', 1, array['lightning_rod', 'rock_head']::text[], 'reckless'),
  ('subterraneo', 'rhyhorn', 'rhyhorn', 10, array['lightning_rod', 'rock_head']::text[], 'reckless'),
  ('subterraneo', 'sableye', 'sableye', 30, array['keen_eye', 'stall']::text[], 'prankster'),
  ('subterraneo', 'salamence', 'bagon', 1, array['rock_head']::text[], 'sheer_force'),
  ('subterraneo', 'seaking', 'goldeen', 20, array['swift_swim', 'water_veil']::text[], 'lightning_rod'),
  ('subterraneo', 'shelgon', 'bagon', 5, array['rock_head']::text[], 'sheer_force'),
  ('subterraneo', 'skarmory', 'skarmory', 1, array['keen_eye', 'sturdy']::text[], 'weak_armor'),
  ('subterraneo', 'slugma', 'slugma', 5, array['magma_armor', 'flame_body']::text[], 'weak_armor'),
  ('subterraneo', 'solrock', 'solrock', 20, array['levitate']::text[], null),
  ('subterraneo', 'spearow', 'spearow', 30, array['keen_eye']::text[], 'sniper'),
  ('subterraneo', 'spoink', 'spoink', 20, array['thick_fat', 'own_tempo']::text[], 'gluttony'),
  ('subterraneo', 'steelix', 'onix', 5, array['rock_head', 'sturdy']::text[], 'weak_armor'),
  ('subterraneo', 'swablu', 'swablu', 30, array['natural_cure']::text[], 'cloud_nine'),
  ('subterraneo', 'swellow', 'taillow', 10, array['guts']::text[], 'scrappy'),
  ('subterraneo', 'taillow', 'taillow', 20, array['guts']::text[], 'scrappy'),
  ('subterraneo', 'teddiursa', 'teddiursa', 1, array['pickup', 'quick_feet']::text[], 'honey_gather'),
  ('subterraneo', 'torchic', 'torchic', 10, array['blaze']::text[], 'speed_boost'),
  ('subterraneo', 'tyranitar', 'larvitar', 1, array['guts']::text[], 'sand_veil'),
  ('subterraneo', 'ursaring', 'teddiursa', 10, array['pickup', 'quick_feet']::text[], 'honey_gather'),
  ('subterraneo', 'whiscash', 'barboach', 20, array['oblivious', 'anticipation']::text[], 'hydration'),
  ('subterraneo', 'whismur', 'whismur', 30, array['soundproof']::text[], 'rattled'),
  ('subterraneo', 'wobbuffet', 'wynaut', 10, array['shadow_tag']::text[], 'telepathy'),
  ('subterraneo', 'wynaut', 'wynaut', 30, array['shadow_tag']::text[], 'telepathy'),
  ('subterraneo', 'xatu', 'natu', 5, array['synchronize', 'early_bird']::text[], 'magic_bounce'),
  ('subterraneo', 'zubat', 'zubat', 20, array['inner_focus']::text[], 'infiltrator'),
  ('urbano', 'arbok', 'ekans', 5, array['intimidate', 'shed_skin']::text[], 'unnerve'),
  ('urbano', 'banette', 'shuppet', 20, array['insomnia', 'frisk']::text[], 'cursed_body'),
  ('urbano', 'castform', 'castform', 5, array['forecast']::text[], null),
  ('urbano', 'cloyster', 'shellder', 5, array['shell_armor', 'skill_link']::text[], 'overcoat'),
  ('urbano', 'corphish', 'corphish', 30, array['hyper_cutter', 'shell_armor']::text[], 'adaptability'),
  ('urbano', 'crawdaunt', 'corphish', 5, array['hyper_cutter', 'shell_armor']::text[], 'adaptability'),
  ('urbano', 'crobat', 'zubat', 1, array['inner_focus']::text[], 'infiltrator'),
  ('urbano', 'ditto', 'ditto', 5, array['limber']::text[], 'imposter'),
  ('urbano', 'drowzee', 'drowzee', 20, array['insomnia', 'forewarn']::text[], 'inner_focus'),
  ('urbano', 'ekans', 'ekans', 10, array['intimidate', 'shed_skin']::text[], 'unnerve'),
  ('urbano', 'golbat', 'zubat', 10, array['inner_focus']::text[], 'infiltrator'),
  ('urbano', 'golduck', 'psyduck', 10, array['damp', 'cloud_nine']::text[], 'swift_swim'),
  ('urbano', 'grimer', 'grimer', 30, array['stench', 'sticky_hold']::text[], 'poison_touch'),
  ('urbano', 'gulpin', 'gulpin', 20, array['liquid_ooze', 'sticky_hold']::text[], 'gluttony'),
  ('urbano', 'gyarados', 'magikarp', 20, array['swift_swim']::text[], 'rattled'),
  ('urbano', 'hariyama', 'makuhita', 30, array['thick_fat', 'guts']::text[], 'sheer_force'),
  ('urbano', 'hitmonchan', 'hitmonchan', 5, array['keen_eye', 'iron_fist']::text[], 'inner_focus'),
  ('urbano', 'hitmonlee', 'tyrogue', 5, array['guts', 'steadfast']::text[], 'vital_spirit'),
  ('urbano', 'hitmontop', 'hitmontop', 5, array['intimidate', 'technician']::text[], 'steadfast'),
  ('urbano', 'houndoom', 'houndour', 5, array['early_bird', 'flash_fire']::text[], 'unnerve'),
  ('urbano', 'houndour', 'houndour', 5, array['early_bird', 'flash_fire']::text[], 'unnerve'),
  ('urbano', 'hypno', 'drowzee', 5, array['insomnia', 'forewarn']::text[], 'inner_focus'),
  ('urbano', 'kingler', 'krabby', 20, array['hyper_cutter', 'shell_armor']::text[], 'sheer_force'),
  ('urbano', 'koffing', 'koffing', 30, array['levitate', 'neutralizing_gas']::text[], 'stench'),
  ('urbano', 'krabby', 'krabby', 30, array['hyper_cutter', 'shell_armor']::text[], 'sheer_force'),
  ('urbano', 'linoone', 'zigzagoon', 20, array['pickup', 'gluttony']::text[], 'quick_feet'),
  ('urbano', 'machamp', 'machop', 1, array['guts', 'no_guard']::text[], 'steadfast'),
  ('urbano', 'machoke', 'machop', 10, array['guts', 'no_guard']::text[], 'steadfast'),
  ('urbano', 'machop', 'machop', 20, array['guts', 'no_guard']::text[], 'steadfast'),
  ('urbano', 'magikarp', 'magikarp', 30, array['swift_swim']::text[], 'rattled'),
  ('urbano', 'makuhita', 'makuhita', 30, array['thick_fat', 'guts']::text[], 'sheer_force'),
  ('urbano', 'mankey', 'mankey', 10, array['vital_spirit', 'anger_point']::text[], 'defiant'),
  ('urbano', 'medicham', 'meditite', 5, array['pure_power']::text[], 'telepathy'),
  ('urbano', 'meditite', 'meditite', 10, array['pure_power']::text[], 'telepathy'),
  ('urbano', 'meowth', 'meowth', 10, array['pickup', 'technician']::text[], 'unnerve'),
  ('urbano', 'muk', 'grimer', 5, array['stench', 'sticky_hold']::text[], 'poison_touch'),
  ('urbano', 'murkrow', 'murkrow', 5, array['insomnia', 'super_luck']::text[], 'prankster'),
  ('urbano', 'pelipper', 'wingull', 5, array['keen_eye', 'hydration']::text[], 'rain_dish'),
  ('urbano', 'persian', 'meowth', 1, array['pickup', 'technician']::text[], 'unnerve'),
  ('urbano', 'pichu', 'pichu', 10, array['static']::text[], 'lightning_rod'),
  ('urbano', 'pikachu', 'pichu', 5, array['static']::text[], 'lightning_rod'),
  ('urbano', 'primeape', 'mankey', 1, array['vital_spirit', 'anger_point']::text[], 'defiant'),
  ('urbano', 'psyduck', 'psyduck', 30, array['damp', 'cloud_nine']::text[], 'swift_swim'),
  ('urbano', 'raichu', 'pichu', 5, array['static']::text[], 'lightning_rod'),
  ('urbano', 'raticate', 'rattata', 10, array['run_away', 'guts']::text[], 'hustle'),
  ('urbano', 'rattata', 'rattata', 30, array['run_away', 'guts']::text[], 'hustle'),
  ('urbano', 'shellder', 'shellder', 20, array['shell_armor', 'skill_link']::text[], 'overcoat'),
  ('urbano', 'shuppet', 'shuppet', 30, array['insomnia', 'frisk']::text[], 'cursed_body'),
  ('urbano', 'smeargle', 'smeargle', 10, array['own_tempo', 'technician']::text[], 'moody'),
  ('urbano', 'sneasel', 'sneasel', 1, array['inner_focus', 'keen_eye']::text[], 'pickpocket'),
  ('urbano', 'starmie', 'staryu', 5, array['illuminate', 'natural_cure']::text[], 'analytic'),
  ('urbano', 'staryu', 'staryu', 10, array['illuminate', 'natural_cure']::text[], 'analytic'),
  ('urbano', 'swalot', 'gulpin', 5, array['liquid_ooze', 'sticky_hold']::text[], 'gluttony'),
  ('urbano', 'tentacool', 'tentacool', 30, array['clear_body', 'liquid_ooze']::text[], 'rain_dish'),
  ('urbano', 'tentacruel', 'tentacool', 10, array['clear_body', 'liquid_ooze']::text[], 'rain_dish'),
  ('urbano', 'tyrogue', 'tyrogue', 10, array['guts', 'steadfast']::text[], 'vital_spirit'),
  ('urbano', 'weezing', 'koffing', 1, array['levitate', 'neutralizing_gas']::text[], 'stench'),
  ('urbano', 'wingull', 'wingull', 30, array['keen_eye', 'hydration']::text[], 'rain_dish'),
  ('urbano', 'zigzagoon', 'zigzagoon', 20, array['pickup', 'gluttony']::text[], 'quick_feet'),
  ('urbano', 'zubat', 'zubat', 20, array['inner_focus']::text[], 'infiltrator');
-- CATALOGO:FIM

-- ---------------------------------------------------------------------------
-- Sorteio de um contrato
-- ---------------------------------------------------------------------------
-- Raridade por CHANCE_DO_CONTRATO; especie entre os biomas liberados, sem
-- repetir as do mural do dia; shiny so de Raro pra cima e de especie com peso
-- >= PESO_MINIMO_PRO_SHINY; abates = ABATES_DO_CONTRATO * min(1, peso/30), com
-- piso de 10.
create or replace function public._sortear_contrato(p_user uuid, p_dia date, p_slot int)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_biomas text[];
  v_raridade text;
  v_sorteio numeric := random() * 100;
  v_esp record;
  v_shiny boolean;
  v_alvo int;
  v_base bigint;
begin
  select array_agg(distinct k) into v_biomas from (
    select 'campo_aberto' as k
    union all
    select key from public.players p, jsonb_each(coalesce(p.bioma_progress, '{}'::jsonb))
      where p.user_id = p_user and jsonb_typeof(value) = 'number' and value::text::numeric >= 1
  ) b;

  select q.chave into v_raridade from (
    select c.chave, sum(c.peso) over (order by c.ord rows between unbounded preceding and current row) as ate
    from (values
      (1, 'comum', 50.0::numeric),
      (2, 'incomum', 28.0),
      (3, 'raro', 15.0),
      (4, 'ultra', 6.0),
      (5, 'legendary', 1.0)
    ) as c(ord, chave, peso)
  ) q where q.ate > v_sorteio order by q.ate limit 1;
  v_raridade := coalesce(v_raridade, 'comum');

  v_shiny := v_raridade in ('raro', 'ultra', 'legendary') and random() < 0.45;

  select c.species_id, c.base_id, max(c.peso) as peso into v_esp
    from public.ovo_catalogo c
    where c.bioma = any(v_biomas)
      and c.peso >= case when v_shiny then 20 else 5 end
      and c.species_id not in (
        select species_id from public.player_contratos where user_id = p_user and dia = p_dia
      )
    group by c.species_id, c.base_id
    order by random() limit 1;
  if not found then
    -- Sem especie elegivel pro shiny (bioma pobre): cai pra contrato normal.
    v_shiny := false;
    select c.species_id, c.base_id, max(c.peso) as peso into v_esp
      from public.ovo_catalogo c
      where c.bioma = any(v_biomas) and c.peso >= 5
        and c.species_id not in (
          select species_id from public.player_contratos where user_id = p_user and dia = p_dia
        )
      group by c.species_id, c.base_id
      order by random() limit 1;
    if not found then return; end if;
  end if;

  if v_shiny then
    v_alvo := 1;
    select coalesce(shiny_kills, 0) into v_base from public.player_pokedex
      where user_id = p_user and species_id = v_esp.species_id;
  else
    v_alvo := greatest(10, round((case v_raridade
      when 'comum' then 50 when 'incomum' then 100 when 'raro' then 200
      when 'ultra' then 400 else 800 end) * least(1.0, v_esp.peso / 30.0))::int);
    select coalesce(normal_kills, 0) + coalesce(shiny_kills, 0) into v_base from public.player_pokedex
      where user_id = p_user and species_id = v_esp.species_id;
  end if;

  insert into public.player_contratos (user_id, dia, slot, species_id, base_id, raridade, tipo, alvo, base)
  values (p_user, p_dia, p_slot, v_esp.species_id, v_esp.base_id, v_raridade,
    case when v_shiny then 'shiny' else 'abates' end, v_alvo, coalesce(v_base, 0));
end;
$$;
revoke all on function public._sortear_contrato(uuid, date, int) from public, anon, authenticated;

create or replace function public._mural_json(p_user uuid, p_dia date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'dia', p_dia,
    'refreshes', coalesce((select refreshes from public.player_mural where user_id = p_user and dia = p_dia), 0),
    'contratos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'slot', slot, 'speciesId', species_id, 'baseId', base_id, 'raridade', raridade,
        'tipo', tipo, 'alvo', alvo, 'base', base, 'reivindicado', reivindicado
      ) order by slot)
      from public.player_contratos where user_id = p_user and dia = p_dia
    ), '[]'::jsonb)
  )
$$;
revoke all on function public._mural_json(uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPCs do jogador
-- ---------------------------------------------------------------------------
create or replace function public.mural_de_contratos()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_dia date := public._dia_do_diario();
  v_slot int;
begin
  if v_user is null then raise exception 'nao autenticado' using errcode = '28000'; end if;
  perform pg_advisory_xact_lock(hashtext(v_user::text));
  if not exists (select 1 from public.player_contratos where user_id = v_user and dia = v_dia) then
    for v_slot in 0..4 loop
      perform public._sortear_contrato(v_user, v_dia, v_slot);
    end loop;
    insert into public.player_mural (user_id, dia, refreshes) values (v_user, v_dia, 0)
      on conflict (user_id) do update set dia = excluded.dia, refreshes = 0;
  end if;
  return public._mural_json(v_user, v_dia);
end;
$$;

create or replace function public.refresh_mural()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_dia date := public._dia_do_diario();
  v_refreshes int;
  v_preco int;
  v_slot int;
begin
  if v_user is null then raise exception 'nao autenticado' using errcode = '28000'; end if;
  perform pg_advisory_xact_lock(hashtext(v_user::text));
  perform public.mural_de_contratos();
  select case when dia = v_dia then refreshes else 0 end into v_refreshes
    from public.player_mural where user_id = v_user;
  v_refreshes := coalesce(v_refreshes, 0);
  v_preco := 10 * power(2, v_refreshes)::int;

  if not exists (select 1 from public.player_contratos
      where user_id = v_user and dia = v_dia and not reivindicado) then
    raise exception 'Nenhum contrato para trocar.' using errcode = 'P0001';
  end if;

  update public.players set diamonds = diamonds - v_preco
    where user_id = v_user and diamonds >= v_preco;
  if not found then
    raise exception 'Diamantes insuficientes (precisa de %).', v_preco using errcode = 'P0001';
  end if;

  for v_slot in select slot from public.player_contratos
      where user_id = v_user and dia = v_dia and not reivindicado order by slot loop
    delete from public.player_contratos where user_id = v_user and dia = v_dia and slot = v_slot;
  end loop;
  for v_slot in select s from generate_series(0, 4) s
      where s not in (select slot from public.player_contratos where user_id = v_user and dia = v_dia) loop
    perform public._sortear_contrato(v_user, v_dia, v_slot);
  end loop;

  insert into public.player_mural (user_id, dia, refreshes) values (v_user, v_dia, v_refreshes + 1)
    on conflict (user_id) do update set dia = excluded.dia, refreshes = excluded.refreshes;
  return public._mural_json(v_user, v_dia);
end;
$$;

create or replace function public.reivindicar_contrato(p_slot int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_dia date := public._dia_do_diario();
  v_c public.player_contratos;
  v_atual bigint;
  v_nome text;
begin
  if v_user is null then raise exception 'nao autenticado' using errcode = '28000'; end if;
  perform pg_advisory_xact_lock(hashtext(v_user::text));
  select * into v_c from public.player_contratos where user_id = v_user and dia = v_dia and slot = p_slot;
  if v_c is null or v_c.species_id is null then
    raise exception 'Contrato nao encontrado.' using errcode = 'P0001';
  end if;
  if v_c.reivindicado then
    raise exception 'Contrato ja reivindicado.' using errcode = 'P0001';
  end if;

  select case when v_c.tipo = 'shiny' then coalesce(shiny_kills, 0)
              else coalesce(normal_kills, 0) + coalesce(shiny_kills, 0) end
    into v_atual from public.player_pokedex where user_id = v_user and species_id = v_c.species_id;
  if coalesce(v_atual, 0) - v_c.base < v_c.alvo then
    raise exception 'O contrato ainda nao foi cumprido.' using errcode = 'P0001';
  end if;

  update public.player_contratos set reivindicado = true
    where user_id = v_user and dia = v_dia and slot = p_slot;
  insert into public.player_ovos (user_id, species_id, raridade, shiny, abates_restantes)
  values (v_user, v_c.base_id, v_c.raridade, v_c.tipo = 'shiny',
    case v_c.raridade when 'comum' then 200 when 'incomum' then 400 when 'raro' then 800
      when 'ultra' then 1500 else 3000 end);

  select name into v_nome from public.species where id = v_c.base_id;
  return jsonb_build_object('ok', true, 'mensagem', format('Você ganhou um ovo de %s!', coalesce(v_nome, v_c.base_id)));
end;
$$;

-- Ovo na equipe ocupa uma das 6 vagas: POKEs da equipe + ovos na equipe <= 6.
create or replace function public.mover_ovo(p_ovo uuid, p_para_equipe boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_vagas int;
begin
  if v_user is null then raise exception 'nao autenticado' using errcode = '28000'; end if;
  perform pg_advisory_xact_lock(hashtext(v_user::text));
  if not exists (select 1 from public.player_ovos where id = p_ovo and user_id = v_user) then
    raise exception 'Ovo nao encontrado.' using errcode = 'P0001';
  end if;
  if p_para_equipe then
    select (select count(*) from public.pokemon_instances where user_id = v_user and location = 'team')
         + (select count(*) from public.player_ovos where user_id = v_user and na_equipe and id <> p_ovo)
      into v_vagas;
    if v_vagas >= 6 then
      raise exception 'Sua equipe ja esta cheia (6 vagas).' using errcode = 'P0001';
    end if;
  end if;
  update public.player_ovos set na_equipe = p_para_equipe where id = p_ovo;
  return jsonb_build_object('ok', true, 'mensagem',
    case when p_para_equipe then 'O ovo entrou na equipe.' else 'O ovo foi para a Mochila.' end);
end;
$$;

-- O ovo PRONTO choca: raridade por RARIDADE_AO_CHOCAR, shiny (25% no ovo
-- shiny, senao a formula do jogo), IVs de 15 a 31, natureza uniforme e
-- habilidade da forma base (5% de oculta). Nasce no Lv 1, na equipe se o ovo
-- estava la, senao na Mochila.
create or replace function public.chocar_ovo(p_ovo uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_ovo public.player_ovos;
  v_species public.species;
  v_sorteio numeric := random() * 100;
  v_rarity text;
  v_shiny boolean;
  v_nature text;
  v_trait text;
  v_traits text[];
  v_oculta text;
  v_iv int[];
  v_stats record;
  v_time int;
  v_local public.pokemon_location;
  v_id uuid;
  v_nome_treinador text;
begin
  if v_user is null then raise exception 'nao autenticado' using errcode = '28000'; end if;
  perform pg_advisory_xact_lock(hashtext(v_user::text));
  select * into v_ovo from public.player_ovos where id = p_ovo and user_id = v_user;
  if v_ovo.id is null then raise exception 'Ovo nao encontrado.' using errcode = 'P0001'; end if;
  if v_ovo.abates_restantes > 0 then
    raise exception 'O ovo ainda nao esta pronto (faltam % abates).', v_ovo.abates_restantes using errcode = 'P0001';
  end if;
  select * into v_species from public.species where id = v_ovo.species_id;
  if v_species.id is null then raise exception 'especie desconhecida' using errcode = 'P0001'; end if;

  select q.chave into v_rarity from (
    select r.chave, sum(r.peso) over (order by r.ord rows between unbounded preceding and current row) as ate
    from (
      select * from (values
        ('comum', 1, 'comum', 60.0::numeric), ('comum', 2, 'incomum', 30.0), ('comum', 3, 'raro', 8.0),
        ('comum', 4, 'ultra', 1.6), ('comum', 5, 'legendary', 0.35), ('comum', 6, 'mythic', 0.05),
        ('incomum', 1, 'comum', 40.0), ('incomum', 2, 'incomum', 38.0), ('incomum', 3, 'raro', 17.0),
        ('incomum', 4, 'ultra', 4.0), ('incomum', 5, 'legendary', 0.85), ('incomum', 6, 'mythic', 0.15),
        ('raro', 1, 'comum', 20.0), ('raro', 2, 'incomum', 35.0), ('raro', 3, 'raro', 32.0),
        ('raro', 4, 'ultra', 10.0), ('raro', 5, 'legendary', 2.5), ('raro', 6, 'mythic', 0.5),
        ('ultra', 1, 'comum', 5.0), ('ultra', 2, 'incomum', 20.0), ('ultra', 3, 'raro', 40.0),
        ('ultra', 4, 'ultra', 27.0), ('ultra', 5, 'legendary', 6.5), ('ultra', 6, 'mythic', 1.5),
        ('legendary', 1, 'comum', 0.0), ('legendary', 2, 'incomum', 5.0), ('legendary', 3, 'raro', 30.0),
        ('legendary', 4, 'ultra', 40.0), ('legendary', 5, 'legendary', 20.0), ('legendary', 6, 'mythic', 5.0)
      ) as t(ovo, ord, chave, peso)
    ) r where r.ovo = v_ovo.raridade
  ) q where q.ate > v_sorteio order by q.ate limit 1;
  v_rarity := coalesce(v_rarity, 'comum');

  v_shiny := case when v_ovo.shiny then random() < 0.25
    else random() < (coalesce(v_species.catch_rate, 45)::numeric / 255) * (1.0 / 8192) * 100 end;

  select t.n into v_nature from (values
    ('hardy'), ('lonely'), ('brave'), ('adamant'), ('naughty'),
    ('bold'), ('docile'), ('relaxed'), ('impish'), ('lax'),
    ('timid'), ('hasty'), ('serious'), ('jolly'), ('naive'),
    ('modest'), ('mild'), ('quiet'), ('bashful'), ('rash'),
    ('calm'), ('gentle'), ('sassy'), ('careful'), ('quirky')
  ) as t(n) order by random() limit 1;

  select c.traits, c.trait_oculta into v_traits, v_oculta
    from public.ovo_catalogo c where c.base_id = v_ovo.species_id limit 1;
  v_trait := case
    when v_oculta is not null and (random() < 0.05 or coalesce(array_length(v_traits, 1), 0) = 0) then v_oculta
    when coalesce(array_length(v_traits, 1), 0) > 0 then v_traits[1 + floor(random() * array_length(v_traits, 1))::int]
    else null end;

  v_iv := array[
    15 + floor(random() * 17)::int, 15 + floor(random() * 17)::int, 15 + floor(random() * 17)::int,
    15 + floor(random() * 17)::int, 15 + floor(random() * 17)::int, 15 + floor(random() * 17)::int
  ];
  select * into v_stats from public._calcular_stats(v_species, 1,
    v_iv[1], v_iv[2], v_iv[3], v_iv[4], v_iv[5], v_iv[6], v_rarity, v_shiny, v_nature);

  select count(*) into v_time from public.pokemon_instances where user_id = v_user and location = 'team';
  v_local := case when v_ovo.na_equipe and v_time < 6 then 'team'::public.pokemon_location else 'bag'::public.pokemon_location end;
  select trainer_name into v_nome_treinador from public.players where user_id = v_user;

  delete from public.player_ovos where id = p_ovo;
  insert into public.pokemon_instances (
    user_id, species_id, location, team_slot, level, exp, hp, is_shiny, rarity, locked,
    iv_hp, iv_atk_fis, iv_atk_esp, iv_def, iv_def_esp, iv_speed,
    stat_hp, stat_atk_fis, stat_atk_esp, stat_def, stat_def_esp, stat_speed,
    unlocked_abilities, original_trainer, origem, nature, trait
  ) values (
    v_user, v_species.id, v_local, case when v_local = 'team' then v_time else null end,
    1, 0, v_stats.stat_hp, v_shiny, v_rarity::public.rarity_tier, false,
    v_iv[1], v_iv[2], v_iv[3], v_iv[4], v_iv[5], v_iv[6],
    v_stats.stat_hp, v_stats.stat_atk_fis, v_stats.stat_atk_esp, v_stats.stat_def, v_stats.stat_def_esp, v_stats.stat_speed,
    (select coalesce(array_agg(move_id), '{}') from public.species_moves where species_id = v_species.id and level_req <= 1),
    v_nome_treinador, 'ovo', v_nature, v_trait
  ) returning id into v_id;

  return jsonb_build_object(
    'ok', true, 'pokeId', v_id, 'speciesId', v_species.id, 'rarity', v_rarity, 'isShiny', v_shiny,
    'local', v_local::text, 'nature', v_nature, 'trait', v_trait,
    'mensagem', format('%s nasceu!', v_species.name)
  );
end;
$$;

-- Chamada pelo servidor do jogo (service_role) depois de gravar um flush: cada
-- abate da janela desconta 1 de todo ovo NA EQUIPE. Relativo (greatest), entao
-- nao briga com mover/chocar no meio do caminho.
create or replace function public._descontar_abates_dos_ovos(p_user uuid, p_abates int)
returns void
language sql
security definer
set search_path = public
as $$
  update public.player_ovos set abates_restantes = greatest(0, abates_restantes - greatest(0, p_abates))
  where user_id = p_user and na_equipe and abates_restantes > 0 and p_abates > 0
$$;
revoke all on function public._descontar_abates_dos_ovos(uuid, int) from public, anon, authenticated;
grant execute on function public._descontar_abates_dos_ovos(uuid, int) to service_role;

-- `por_na_equipe` passa a contar os ovos na equipe nas 6 vagas.
create or replace function public.por_na_equipe(p_poke_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_team_count int;
  v_ovos int;
  v_species_id text;
  v_nome text;
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode = '28000'; end if;

  select count(*) into v_team_count from public.pokemon_instances where user_id = v_user_id and location = 'team';
  select count(*) into v_ovos from public.player_ovos where user_id = v_user_id and na_equipe;
  select species_id into v_species_id from public.pokemon_instances
    where id = p_poke_id and user_id = v_user_id and location = 'bag';

  if v_species_id is null then
    raise exception 'POKE nao esta na mochila' using errcode = 'P0001';
  end if;
  if v_team_count + v_ovos >= 6 then
    raise exception 'Sua equipe ja esta cheia (6 vagas, ovos contam).' using errcode = 'P0001';
  end if;

  update public.pokemon_instances set location = 'team', team_slot = v_team_count, updated_at = now()
    where id = p_poke_id;

  select name into v_nome from public.species where id = v_species_id;
  return jsonb_build_object('ok', true, 'mensagem', format('%s entrou na equipe.', coalesce(v_nome, 'POKE')));
end;
$$;

-- Primeiro Passo "Reivindique uma missao" aceita contrato entregue.
create or replace function public.reivindicar_passo(p_passo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $
declare
  v_user_id uuid := auth.uid();
  v_ordem text[] := array[
    'primeiros_abates', 'nivel_5', 'primeira_captura', 'equipe_de_dois', 'primeiro_lord',
    'primeira_missao', 'primeira_especialidade', 'estagio_2', 'primeira_evolucao',
    'treinador_10', 'tres_biomas'
  ];
  v_biomas text[] := array[
    'campo_aberto', 'mata', 'marinho', 'aguas_interiores', 'aridos', 'subterraneo',
    'gelido', 'igneo', 'urbano', 'industrial', 'sagrado', 'sombrio'
  ];
  v_posicao int;
  v_reivindicados int;
  v_atual bigint;
  v_alvo int;
  v_ouro bigint;
  v_itens jsonb;
  v_item jsonb;
  v_player public.players%rowtype;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;

  v_posicao := array_position(v_ordem, p_passo);
  if v_posicao is null then
    raise exception 'Passo desconhecido.' using errcode = 'P0001';
  end if;

  -- Lock ANTES da leitura de negócio (mesmo motivo de `reivindicar_missao`):
  -- duas chamadas concorrentes não podem ler o mesmo snapshot.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

  if exists (select 1 from public.recompensa_concedida where user_id = v_user_id and chave = 'passo:' || p_passo) then
    raise exception 'Passo ja reivindicado.' using errcode = 'P0001';
  end if;

  select count(*) into v_reivindicados from public.recompensa_concedida
    where user_id = v_user_id and chave = any (select 'passo:' || x from unnest(v_ordem[1:v_posicao - 1]) x);
  if v_reivindicados <> v_posicao - 1 then
    raise exception 'Reivindique o passo anterior primeiro.' using errcode = 'P0001';
  end if;

  select * into v_player from public.players where user_id = v_user_id;
  if not found then
    raise exception 'jogador sem linha em players' using errcode = 'P0001';
  end if;

  case p_passo
    when 'primeiros_abates' then
      v_alvo := 10;
      select coalesce(sum(normal_kills + shiny_kills), 0) into v_atual from public.player_pokedex where user_id = v_user_id;
      v_ouro := 500; v_itens := '[{"itemId":"poke_ball","quantidade":50}]';
    when 'nivel_5' then
      v_alvo := 5;
      select coalesce(max(level), 0) into v_atual from public.pokemon_instances where user_id = v_user_id and location = 'team';
      v_ouro := 0; v_itens := '[{"itemId":"super_potion","quantidade":10}]';
    when 'primeira_captura' then
      v_alvo := 2;
      select count(*) into v_atual from public.pokemon_instances where user_id = v_user_id and location in ('team', 'bag');
      v_ouro := 0; v_itens := '[{"itemId":"great_ball","quantidade":25}]';
    when 'equipe_de_dois' then
      v_alvo := 2;
      select count(*) into v_atual from public.pokemon_instances where user_id = v_user_id and location = 'team';
      v_ouro := 1000; v_itens := '[{"itemId":"super_potion","quantidade":10}]';
    when 'primeiro_lord' then
      v_alvo := 1;
      v_atual := least(1, coalesce((v_player.bioma_progress->>'campo_aberto')::int, 0));
      v_ouro := 2500; v_itens := '[{"itemId":"ultra_ball","quantidade":25}]';
    when 'primeira_missao' then
      v_alvo := 1;
      -- Desde o mural (20/10/2026) contrato entregue tambem conta; Task antiga continua valendo.
      select (select count(*) from public.player_missoes_reivindicadas where user_id = v_user_id)
           + (select count(*) from public.player_contratos where user_id = v_user_id and reivindicado)
        into v_atual;
      v_ouro := 0; v_itens := '[{"itemId":"revive","quantidade":3},{"itemId":"great_ball","quantidade":25}]';
    when 'primeira_especialidade' then
      v_alvo := 1;
      select coalesce(sum(dano_nivel + defesa_nivel), 0) into v_atual from public.player_especialidades where user_id = v_user_id;
      v_ouro := 2000; v_itens := '[{"itemId":"great_ball","quantidade":50}]';
    when 'estagio_2' then
      v_alvo := 1;
      select least(1, count(*)) into v_atual from unnest(v_biomas) b
        where coalesce((v_player.bioma_progress->>b)::int, 0) >= 2;
      v_ouro := 3000; v_itens := '[{"itemId":"ultra_ball","quantidade":50}]';
    when 'primeira_evolucao' then
      v_alvo := 1;
      select least(1, count(*)) into v_atual from public.pokemon_instances pi
        where pi.user_id = v_user_id and pi.location in ('team', 'bag')
          and exists (select 1 from public.species_evolution_options o where o.evolves_to = pi.species_id);
      v_ouro := 4000; v_itens := '[{"itemId":"revive","quantidade":5}]';
    when 'treinador_10' then
      v_alvo := 10;
      v_atual := v_player.trainer_level;
      v_ouro := 0; v_itens := '[{"itemId":"ultra_ball","quantidade":50}]';
    when 'tres_biomas' then
      v_alvo := 3;
      select count(*) into v_atual from unnest(v_biomas) b
        where coalesce((v_player.bioma_progress->>b)::int, 0) >= 1;
      v_ouro := 6000; v_itens := '[{"itemId":"max_revive","quantidade":5}]';
  end case;

  if v_atual < v_alvo then
    raise exception 'Passo ainda nao cumprido (% de %).', v_atual, v_alvo using errcode = 'P0001';
  end if;

  -- SEMPRE toca `players`, mesmo quando o passo só dá itens: o trigger avança
  -- `updated_at`, e é isso que faz o CAS de `gravar_progresso` falhar e o flush
  -- da caçada reler o inventário. Sem o update, um flush que leu as bolas antes
  -- desta chamada gravaria a quantidade antiga por cima do presente.
  update public.players set gold = gold + v_ouro where user_id = v_user_id;
  for v_item in select * from jsonb_array_elements(v_itens) loop
    insert into public.player_items (user_id, item_id, quantity)
    values (v_user_id, v_item->>'itemId', (v_item->>'quantidade')::int)
    on conflict (user_id, item_id) do update
      set quantity = public.player_items.quantity + excluded.quantity, updated_at = now();
  end loop;

  insert into public.recompensa_concedida (user_id, chave) values (v_user_id, 'passo:' || p_passo);

  return jsonb_build_object('ok', true, 'mensagem', 'Recompensa do passo coletada!');
end;
$;

commit;
