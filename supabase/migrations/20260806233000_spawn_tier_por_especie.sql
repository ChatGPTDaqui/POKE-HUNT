-- Peso de spawn deixa de ser `species.catch_rate` e passa a ser um TIER derivado
-- do dado real de encontro selvagem do Gen1/Gen2.
--
-- Por que o peso antigo estava errado: taxa de CAPTURA nao tem relacao com
-- frequencia de APARICAO. Dunsparce e facil de capturar (catch_rate 190) e
-- ocupava 27% da hunt, quando no jogo real ele e a vaga de 1% — a mais rara do
-- mapa. Foi escolhido na epoca por ser "um dado que a planilha ja tinha".
--
-- O comentario de `map_encounters.weight` (migration initial_schema) previa
-- derivar o peso de `location_encounters` + `encounter_slot_rates`. Esse caminho
-- nao se sustentou, por dois motivos medidos e nao supostos:
--
--  1. `locations`/`location_encounters` estao vazias, e 18 das 19 hunts do jogo
--     NAO sao locais reais — sao agrupamentos por tipo/bioma curados
--     (`lv_1_10_floresta` junta 17 especies GRASS daquela faixa de nivel). So
--     `route_46` corresponde a um local real de Johto. Nao ha (local, periodo)
--     pra agrupar.
--  2. A coluna `Slot` da planilha nao e fiel. Conferida especie a especie contra
--     o disassembly pret/pokecrystal, 48 das 78 divergiam: TENTACOOL saia 30%
--     quando o valor real e 74% (ele ocupa a vaga de 60% da agua em quase todo
--     lugar) e MAGIKARP 51% contra 69% reais. A planilha e uma reconstrucao; o
--     disassembly e o dado do jogo.
--
-- O tier vem de `scripts/derive-spawn-tiers.js`, que le os disassemblies
-- pret/pokecrystal, pret/pokegold e pret/pokered e cobre as quatro formas de
-- encontro selvagem do Gen2 (grama, surf, pesca, headbutt). Das 251 especies do
-- dex, 150 saem do dado do Gen2, 7 do Gen1 (nao aparecem no Gen2) e 94 de regra
-- declarada — sao as que nao tem encontro selvagem em nenhuma das duas geracoes
-- (evolucao por troca/pedra, presente, fossil, lendario), onde nao existe taxa
-- pra medir. `scripts/spawn-tiers.json` registra a procedencia de cada uma
-- (`gsc`/`rb`/`regra`), pra continuar auditavel o que foi medido e o que foi
-- decidido.

-- Os pesos SAO as vagas reais da GrassMonProbTable do Gen2 (30/20/10/5/1), nao
-- numeros escolhidos a esmo. Tabela propria, em vez de enum com o peso no
-- codigo, porque peso e dado de balanceamento: rebalancear vira um update, nao
-- um deploy.
create table spawn_tiers (
  key text primary key,
  weight numeric not null check (weight > 0),
  sort_order int not null unique
);

insert into spawn_tiers (key, weight, sort_order) values
  ('muito_comum', 30, 1),
  ('comum', 20, 2),
  ('incomum', 10, 3),
  ('raro', 5, 4),
  ('muito_raro', 1, 5);

alter table spawn_tiers enable row level security;
create policy "spawn_tiers e catalogo publico" on spawn_tiers
  for select to anon, authenticated using (true);

-- Sem default de proposito: uma especie nova tem que declarar o tier. Com
-- default, ela entraria muda como 'incomum' e ninguem notaria. O backfill logo
-- abaixo cobre as 251 existentes, e o `set not null` no fim trava a regra.
alter table species add column spawn_tier text references spawn_tiers(key) on delete restrict;

update species set spawn_tier = 'muito_comum' where id in (
  'chinchou', 'cubone', 'diglett', 'geodude', 'goldeen', 'graveler', 'grimer', 'horsea',
  'koffing', 'krabby', 'magikarp', 'natu', 'nidorina', 'nidorino', 'poliwag', 'psyduck',
  'qwilfish', 'rattata', 'remoraid', 'slowpoke', 'spearow', 'swinub', 'tangela', 'tentacool',
  'unown', 'voltorb', 'wooper'
);

update species set spawn_tier = 'comum' where id in (
  'aipom', 'bellsprout', 'dratini', 'drowzee', 'exeggcute', 'gastly', 'girafarig', 'gyarados',
  'hoothoot', 'kingler', 'lickitung', 'machop', 'magnemite', 'nidoran_f', 'nidoran_m', 'onix',
  'pidgey', 'poliwhirl', 'ponyta', 'quagsire', 'seaking', 'seel', 'sentret', 'shellder',
  'zubat'
);

update species set spawn_tier = 'incomum' where id in (
  'abra', 'bulbasaur', 'caterpie', 'charmander', 'chikorita', 'cleffa', 'corsola', 'cyndaquil',
  'delibird', 'doduo', 'dragonair', 'dugtrio', 'eevee', 'ekans', 'electrode', 'elekid',
  'fearow', 'flaaffy', 'gligar', 'golbat', 'golduck', 'hoppip', 'igglybuff', 'kabuto',
  'lanturn', 'machoke', 'magby', 'magneton', 'mankey', 'mareep', 'meowth', 'oddish',
  'omanyte', 'paras', 'pichu', 'pidgeotto', 'pineco', 'porygon', 'rapidash', 'raticate',
  'rhyhorn', 'sandshrew', 'seadra', 'slowbro', 'smeargle', 'smoochum', 'squirtle', 'stantler',
  'staryu', 'sunkern', 'tentacruel', 'togepi', 'totodile', 'tyrogue', 'ursaring', 'weedle',
  'weepinbell', 'wobbuffet'
);

update species set spawn_tier = 'raro' where id in (
  'aerodactyl', 'arbok', 'arcanine', 'azumarill', 'bayleef', 'blissey', 'charmeleon', 'cloyster',
  'croconaw', 'ditto', 'donphan', 'electabuzz', 'espeon', 'exeggutor', 'farfetch_d', 'flareon',
  'forretress', 'furret', 'growlithe', 'haunter', 'heracross', 'hitmonchan', 'hitmonlee', 'hitmontop',
  'houndoom', 'houndour', 'hypno', 'ivysaur', 'jolteon', 'jynx', 'kabutops', 'kadabra',
  'kakuna', 'kangaskhan', 'lapras', 'larvitar', 'ledyba', 'magcargo', 'magmar', 'mantine',
  'marill', 'metapod', 'miltank', 'misdreavus', 'mr__mime', 'muk', 'murkrow', 'ninetales',
  'noctowl', 'octillery', 'omastar', 'parasect', 'pikachu', 'piloswine', 'porygon2', 'quilava',
  'raichu', 'sandslash', 'scizor', 'shuckle', 'skiploom', 'slowking', 'slugma', 'snorlax',
  'snubbull', 'spinarak', 'starmie', 'steelix', 'sudowoodo', 'sunflora', 'tauros', 'togetic',
  'umbreon', 'vaporeon', 'venonat', 'vulpix', 'wartortle', 'wigglytuff', 'xatu'
);

update species set spawn_tier = 'muito_raro' where id in (
  'alakazam', 'ampharos', 'ariados', 'articuno', 'beedrill', 'bellossom', 'blastoise', 'butterfree',
  'celebi', 'chansey', 'charizard', 'clefable', 'clefairy', 'crobat', 'dewgong', 'dodrio',
  'dragonite', 'dunsparce', 'entei', 'feraligatr', 'gengar', 'gloom', 'golem', 'granbull',
  'ho_oh', 'jigglypuff', 'jumpluff', 'kingdra', 'ledian', 'lugia', 'machamp', 'marowak',
  'meganium', 'mew', 'mewtwo', 'moltres', 'nidoking', 'nidoqueen', 'persian', 'phanpy',
  'pidgeot', 'pinsir', 'politoed', 'poliwrath', 'primeape', 'pupitar', 'raikou', 'rhydon',
  'scyther', 'skarmory', 'sneasel', 'suicune', 'teddiursa', 'typhlosion', 'tyranitar', 'venomoth',
  'venusaur', 'victreebel', 'vileplume', 'weezing', 'yanma', 'zapdos'
);

alter table species alter column spawn_tier set not null;
