-- PH-245 — a cadeia de "Tasks & Missoes" vira TABELA, e a RPC passa a LER
-- em vez de derivar de novo.
--
-- O QUE ESTAVA QUEBRADO: `reivindicar_missao` montava a cadeia com
-- `row_number() over (order by dex_number)` sobre `public.species`, enquanto o
-- cliente montava a dele sobre o catalogo de `src/data`. As duas entradas nao
-- sao a mesma: o banco tem 251 especies, o catalogo do cliente tem 245
-- (faltam vulpix, ninetales, chansey, blissey, mr__mime, shuckle), e 4
-- especies tem tipo diferente nos dois lados porque o retype de Fairy entrou
-- so no cliente (clefairy, clefable, togetic, wigglytuff). Medido: as cadeias
-- divergiam em 6 dos 18 tipos. FAIRY divergia ja na posicao 1 — a tela
-- oferecia `clefairy` e a RPC respondia "essa especie nao pertence a cadeia
-- desse tipo", entao a cadeia inteira era inalcancavel sob autoridade.
--
-- A CORRECAO nao e "consertar o dado dos dois lados": e tirar a segunda
-- derivacao de cena. Esta tabela e gerada por
-- `scripts/gerar-cadeia-de-missoes.mjs`, o MESMO laco que emite
-- `src/data/generated/missaoCadeia.generated.ts`, e um teste reprova se os
-- dois arquivos divergirem. A RPC so faz `select`.
--
-- A tabela tambem carrega `alvo` e `recompensa` por linha em vez de repetir a
-- formula em SQL: numero copiado e a mesma classe de bug que a lista copiada.
begin;

create table if not exists public.missao_cadeia (
  -- public.element_type, e nao text com check copiado: o enum ja e a fonte de
  -- verdade de tipo elemental no banco (species.type1 usa ele), e uma lista de
  -- 18 nomes repetida num check e mais uma copia pra sair de sincronia. O enum
  -- vive em public e e compartilhado pelos dois schemas.
  tipo public.element_type not null,
  -- SEM foreign key pra public.species, de proposito: a cadeia e derivada do
  -- catalogo do CLIENTE, e schema dev recem-clonado pode nao ter todas as
  -- especies ainda. Com FK, a migration estouraria no deploy e travaria a fila
  -- de todos os pushes seguintes — o modo de falha de PH-153, e a mesma razao
  -- pela qual gerar-migration-evolucoes.mjs tambem nao usa FK aqui. O que
  -- protege contra id inventado e cadeiaDeMissoes.test.ts, que exige toda
  -- especie da cadeia estar em SPECIES e em algum enemyPool.
  species_id text not null,
  posicao int not null,
  alvo int not null check (alvo > 0),
  recompensa bigint not null check (recompensa >= 0),
  eh_ultima boolean not null,
  primary key (tipo, species_id),
  unique (tipo, posicao)
);

-- Catalogo, nao dado de jogador: todo mundo autenticado le, ninguem escreve.
-- Sem RLS de dono porque nao ha dono — e a mesma postura de `public.species`.
alter table public.missao_cadeia enable row level security;
drop policy if exists "leitura publica" on public.missao_cadeia;
create policy "leitura publica" on public.missao_cadeia for select to authenticated using (true);
grant select on public.missao_cadeia to authenticated;
grant select, insert, update, delete on public.missao_cadeia to service_role;

-- Regerado por inteiro a cada vez: a cadeia e derivada do catalogo, entao
-- linha que sumiu do catalogo tem que sumir daqui tambem. `delete` sem filtro
-- e proposital — a tabela nao guarda nada de jogador (o que o jogador
-- reivindicou vive em `player_missoes_reivindicadas`, e nao e tocado aqui).
delete from public.missao_cadeia;

insert into public.missao_cadeia (tipo, species_id, posicao, alvo, recompensa, eh_ultima) values
  ('NORMAL'::public.element_type, 'rattata', 0, 50, 1250, false),
  ('NORMAL'::public.element_type, 'spearow', 1, 75, 1875, false),
  ('NORMAL'::public.element_type, 'whismur', 2, 100, 2500, false),
  ('NORMAL'::public.element_type, 'spinda', 3, 125, 3125, false),
  ('NORMAL'::public.element_type, 'swablu', 4, 150, 3750, false),
  ('NORMAL'::public.element_type, 'pidgey', 5, 175, 4375, false),
  ('NORMAL'::public.element_type, 'lickitung', 6, 200, 5000, false),
  ('NORMAL'::public.element_type, 'sentret', 7, 225, 5625, false),
  ('NORMAL'::public.element_type, 'hoothoot', 8, 250, 6250, false),
  ('NORMAL'::public.element_type, 'aipom', 9, 275, 6875, false),
  ('NORMAL'::public.element_type, 'girafarig', 10, 300, 7500, false),
  ('NORMAL'::public.element_type, 'zigzagoon', 11, 325, 8125, false),
  ('NORMAL'::public.element_type, 'taillow', 12, 350, 8750, false),
  ('NORMAL'::public.element_type, 'linoone', 13, 375, 9375, false),
  ('NORMAL'::public.element_type, 'meowth', 14, 400, 10000, false),
  ('NORMAL'::public.element_type, 'doduo', 15, 425, 10625, false),
  ('NORMAL'::public.element_type, 'igglybuff', 16, 450, 11250, false),
  ('NORMAL'::public.element_type, 'stantler', 17, 475, 11875, false),
  ('NORMAL'::public.element_type, 'smeargle', 18, 500, 12500, false),
  ('NORMAL'::public.element_type, 'azurill', 19, 500, 12500, false),
  ('NORMAL'::public.element_type, 'pidgeotto', 20, 500, 12500, false),
  ('NORMAL'::public.element_type, 'raticate', 21, 500, 12500, false),
  ('NORMAL'::public.element_type, 'fearow', 22, 500, 12500, false),
  ('NORMAL'::public.element_type, 'ursaring', 23, 500, 12500, false),
  ('NORMAL'::public.element_type, 'swellow', 24, 500, 12500, false),
  ('NORMAL'::public.element_type, 'loudred', 25, 500, 12500, false),
  ('NORMAL'::public.element_type, 'farfetch_d', 26, 500, 12500, false),
  ('NORMAL'::public.element_type, 'kangaskhan', 27, 500, 12500, false),
  ('NORMAL'::public.element_type, 'tauros', 28, 500, 12500, false),
  ('NORMAL'::public.element_type, 'ditto', 29, 500, 12500, false),
  ('NORMAL'::public.element_type, 'snorlax', 30, 500, 12500, false),
  ('NORMAL'::public.element_type, 'miltank', 31, 500, 12500, false),
  ('NORMAL'::public.element_type, 'slakoth', 32, 500, 12500, false),
  ('NORMAL'::public.element_type, 'zangoose', 33, 500, 12500, false),
  ('NORMAL'::public.element_type, 'castform', 34, 500, 12500, false),
  ('NORMAL'::public.element_type, 'furret', 35, 500, 12500, false),
  ('NORMAL'::public.element_type, 'noctowl', 36, 500, 12500, false),
  ('NORMAL'::public.element_type, 'vigoroth', 37, 500, 12500, false),
  ('NORMAL'::public.element_type, 'delcatty', 38, 500, 12500, false),
  ('NORMAL'::public.element_type, 'wigglytuff', 39, 500, 12500, false),
  ('NORMAL'::public.element_type, 'dunsparce', 40, 500, 12500, false),
  ('NORMAL'::public.element_type, 'teddiursa', 41, 500, 12500, false),
  ('NORMAL'::public.element_type, 'skitty', 42, 500, 12500, false),
  ('NORMAL'::public.element_type, 'kecleon', 43, 500, 12500, false),
  ('NORMAL'::public.element_type, 'jigglypuff', 44, 500, 12500, false),
  ('NORMAL'::public.element_type, 'persian', 45, 500, 12500, false),
  ('NORMAL'::public.element_type, 'dodrio', 46, 500, 12500, false),
  ('NORMAL'::public.element_type, 'pidgeot', 47, 500, 12500, false),
  ('NORMAL'::public.element_type, 'slaking', 48, 500, 12500, false),
  ('NORMAL'::public.element_type, 'exploud', 49, 500, 37500, true),
  ('FIRE'::public.element_type, 'numel', 0, 50, 1250, false),
  ('FIRE'::public.element_type, 'torkoal', 1, 75, 1875, false),
  ('FIRE'::public.element_type, 'ponyta', 2, 100, 2500, false),
  ('FIRE'::public.element_type, 'cyndaquil', 3, 125, 3125, false),
  ('FIRE'::public.element_type, 'magby', 4, 150, 3750, false),
  ('FIRE'::public.element_type, 'torchic', 5, 175, 4375, false),
  ('FIRE'::public.element_type, 'rapidash', 6, 200, 5000, false),
  ('FIRE'::public.element_type, 'growlithe', 7, 225, 5625, false),
  ('FIRE'::public.element_type, 'slugma', 8, 250, 6250, false),
  ('FIRE'::public.element_type, 'houndour', 9, 275, 6875, false),
  ('FIRE'::public.element_type, 'charmeleon', 10, 300, 7500, false),
  ('FIRE'::public.element_type, 'arcanine', 11, 325, 8125, false),
  ('FIRE'::public.element_type, 'magmar', 12, 350, 8750, false),
  ('FIRE'::public.element_type, 'quilava', 13, 375, 9375, false),
  ('FIRE'::public.element_type, 'magcargo', 14, 400, 10000, false),
  ('FIRE'::public.element_type, 'houndoom', 15, 425, 10625, false),
  ('FIRE'::public.element_type, 'combusken', 16, 450, 11250, false),
  ('FIRE'::public.element_type, 'camerupt', 17, 475, 11875, false),
  ('FIRE'::public.element_type, 'charizard', 18, 500, 12500, false),
  ('FIRE'::public.element_type, 'typhlosion', 19, 500, 12500, false),
  ('FIRE'::public.element_type, 'blaziken', 20, 500, 23000, true),
  ('WATER'::public.element_type, 'psyduck', 0, 50, 1250, false),
  ('WATER'::public.element_type, 'poliwag', 1, 75, 1875, false),
  ('WATER'::public.element_type, 'tentacool', 2, 100, 2500, false),
  ('WATER'::public.element_type, 'slowpoke', 3, 125, 3125, false),
  ('WATER'::public.element_type, 'krabby', 4, 150, 3750, false),
  ('WATER'::public.element_type, 'horsea', 5, 175, 4375, false),
  ('WATER'::public.element_type, 'goldeen', 6, 200, 5000, false),
  ('WATER'::public.element_type, 'magikarp', 7, 225, 5625, false),
  ('WATER'::public.element_type, 'chinchou', 8, 250, 6250, false),
  ('WATER'::public.element_type, 'wooper', 9, 275, 6875, false),
  ('WATER'::public.element_type, 'qwilfish', 10, 300, 7500, false),
  ('WATER'::public.element_type, 'remoraid', 11, 325, 8125, false),
  ('WATER'::public.element_type, 'lotad', 12, 350, 8750, false),
  ('WATER'::public.element_type, 'wingull', 13, 375, 9375, false),
  ('WATER'::public.element_type, 'carvanha', 14, 400, 10000, false),
  ('WATER'::public.element_type, 'wailmer', 15, 425, 10625, false),
  ('WATER'::public.element_type, 'barboach', 16, 450, 11250, false),
  ('WATER'::public.element_type, 'corphish', 17, 475, 11875, false),
  ('WATER'::public.element_type, 'spheal', 18, 500, 12500, false),
  ('WATER'::public.element_type, 'clamperl', 19, 500, 12500, false),
  ('WATER'::public.element_type, 'luvdisc', 20, 500, 12500, false),
  ('WATER'::public.element_type, 'sharpedo', 21, 500, 12500, false),
  ('WATER'::public.element_type, 'seel', 22, 500, 12500, false),
  ('WATER'::public.element_type, 'shellder', 23, 500, 12500, false),
  ('WATER'::public.element_type, 'poliwhirl', 24, 500, 12500, false),
  ('WATER'::public.element_type, 'kingler', 25, 500, 12500, false),
  ('WATER'::public.element_type, 'seaking', 26, 500, 12500, false),
  ('WATER'::public.element_type, 'gyarados', 27, 500, 12500, false),
  ('WATER'::public.element_type, 'quagsire', 28, 500, 12500, false),
  ('WATER'::public.element_type, 'lombre', 29, 500, 12500, false),
  ('WATER'::public.element_type, 'whiscash', 30, 500, 12500, false),
  ('WATER'::public.element_type, 'staryu', 31, 500, 12500, false),
  ('WATER'::public.element_type, 'omanyte', 32, 500, 12500, false),
  ('WATER'::public.element_type, 'kabuto', 33, 500, 12500, false),
  ('WATER'::public.element_type, 'totodile', 34, 500, 12500, false),
  ('WATER'::public.element_type, 'corsola', 35, 500, 12500, false),
  ('WATER'::public.element_type, 'mudkip', 36, 500, 12500, false),
  ('WATER'::public.element_type, 'surskit', 37, 500, 12500, false),
  ('WATER'::public.element_type, 'feebas', 38, 500, 12500, false),
  ('WATER'::public.element_type, 'golduck', 39, 500, 12500, false),
  ('WATER'::public.element_type, 'tentacruel', 40, 500, 12500, false),
  ('WATER'::public.element_type, 'slowbro', 41, 500, 12500, false),
  ('WATER'::public.element_type, 'seadra', 42, 500, 12500, false),
  ('WATER'::public.element_type, 'lanturn', 43, 500, 12500, false),
  ('WATER'::public.element_type, 'lapras', 44, 500, 12500, false),
  ('WATER'::public.element_type, 'mantine', 45, 500, 12500, false),
  ('WATER'::public.element_type, 'relicanth', 46, 500, 12500, false),
  ('WATER'::public.element_type, 'wartortle', 47, 500, 12500, false),
  ('WATER'::public.element_type, 'cloyster', 48, 500, 12500, false),
  ('WATER'::public.element_type, 'starmie', 49, 500, 12500, false),
  ('WATER'::public.element_type, 'omastar', 50, 500, 12500, false),
  ('WATER'::public.element_type, 'kabutops', 51, 500, 12500, false),
  ('WATER'::public.element_type, 'croconaw', 52, 500, 12500, false),
  ('WATER'::public.element_type, 'marill', 53, 500, 12500, false),
  ('WATER'::public.element_type, 'slowking', 54, 500, 12500, false),
  ('WATER'::public.element_type, 'octillery', 55, 500, 12500, false),
  ('WATER'::public.element_type, 'marshtomp', 56, 500, 12500, false),
  ('WATER'::public.element_type, 'pelipper', 57, 500, 12500, false),
  ('WATER'::public.element_type, 'crawdaunt', 58, 500, 12500, false),
  ('WATER'::public.element_type, 'milotic', 59, 500, 12500, false),
  ('WATER'::public.element_type, 'sealeo', 60, 500, 12500, false),
  ('WATER'::public.element_type, 'huntail', 61, 500, 12500, false),
  ('WATER'::public.element_type, 'gorebyss', 62, 500, 12500, false),
  ('WATER'::public.element_type, 'azumarill', 63, 500, 12500, false),
  ('WATER'::public.element_type, 'dewgong', 64, 500, 12500, false),
  ('WATER'::public.element_type, 'wailord', 65, 500, 12500, false),
  ('WATER'::public.element_type, 'blastoise', 66, 500, 12500, false),
  ('WATER'::public.element_type, 'poliwrath', 67, 500, 12500, false),
  ('WATER'::public.element_type, 'feraligatr', 68, 500, 12500, false),
  ('WATER'::public.element_type, 'politoed', 69, 500, 12500, false),
  ('WATER'::public.element_type, 'kingdra', 70, 500, 12500, false),
  ('WATER'::public.element_type, 'swampert', 71, 500, 12500, false),
  ('WATER'::public.element_type, 'ludicolo', 72, 500, 12500, false),
  ('WATER'::public.element_type, 'walrein', 73, 500, 49500, true),
  ('ELECTRIC'::public.element_type, 'voltorb', 0, 50, 1250, false),
  ('ELECTRIC'::public.element_type, 'chinchou', 1, 75, 1875, false),
  ('ELECTRIC'::public.element_type, 'electrike', 2, 100, 2500, false),
  ('ELECTRIC'::public.element_type, 'magnemite', 3, 125, 3125, false),
  ('ELECTRIC'::public.element_type, 'minun', 4, 150, 3750, false),
  ('ELECTRIC'::public.element_type, 'pichu', 5, 175, 4375, false),
  ('ELECTRIC'::public.element_type, 'mareep', 6, 200, 5000, false),
  ('ELECTRIC'::public.element_type, 'elekid', 7, 225, 5625, false),
  ('ELECTRIC'::public.element_type, 'magneton', 8, 250, 6250, false),
  ('ELECTRIC'::public.element_type, 'electrode', 9, 275, 6875, false),
  ('ELECTRIC'::public.element_type, 'lanturn', 10, 300, 7500, false),
  ('ELECTRIC'::public.element_type, 'flaaffy', 11, 325, 8125, false),
  ('ELECTRIC'::public.element_type, 'manectric', 12, 350, 8750, false),
  ('ELECTRIC'::public.element_type, 'pikachu', 13, 375, 9375, false),
  ('ELECTRIC'::public.element_type, 'electabuzz', 14, 400, 10000, false),
  ('ELECTRIC'::public.element_type, 'raichu', 15, 425, 10625, false),
  ('ELECTRIC'::public.element_type, 'plusle', 16, 450, 11250, false),
  ('ELECTRIC'::public.element_type, 'ampharos', 17, 475, 20875, true),
  ('GRASS'::public.element_type, 'tangela', 0, 50, 1250, false),
  ('GRASS'::public.element_type, 'lotad', 1, 75, 1875, false),
  ('GRASS'::public.element_type, 'bellsprout', 2, 100, 2500, false),
  ('GRASS'::public.element_type, 'exeggcute', 3, 125, 3125, false),
  ('GRASS'::public.element_type, 'shroomish', 4, 150, 3750, false),
  ('GRASS'::public.element_type, 'lombre', 5, 175, 4375, false),
  ('GRASS'::public.element_type, 'oddish', 6, 200, 5000, false),
  ('GRASS'::public.element_type, 'paras', 7, 225, 5625, false),
  ('GRASS'::public.element_type, 'chikorita', 8, 250, 6250, false),
  ('GRASS'::public.element_type, 'hoppip', 9, 275, 6875, false),
  ('GRASS'::public.element_type, 'sunkern', 10, 300, 7500, false),
  ('GRASS'::public.element_type, 'treecko', 11, 325, 8125, false),
  ('GRASS'::public.element_type, 'lileep', 12, 350, 8750, false),
  ('GRASS'::public.element_type, 'tropius', 13, 375, 9375, false),
  ('GRASS'::public.element_type, 'weepinbell', 14, 400, 10000, false),
  ('GRASS'::public.element_type, 'roselia', 15, 425, 10625, false),
  ('GRASS'::public.element_type, 'cacnea', 16, 450, 11250, false),
  ('GRASS'::public.element_type, 'ivysaur', 17, 475, 11875, false),
  ('GRASS'::public.element_type, 'parasect', 18, 500, 12500, false),
  ('GRASS'::public.element_type, 'exeggutor', 19, 500, 12500, false),
  ('GRASS'::public.element_type, 'bayleef', 20, 500, 12500, false),
  ('GRASS'::public.element_type, 'skiploom', 21, 500, 12500, false),
  ('GRASS'::public.element_type, 'sunflora', 22, 500, 12500, false),
  ('GRASS'::public.element_type, 'grovyle', 23, 500, 12500, false),
  ('GRASS'::public.element_type, 'breloom', 24, 500, 12500, false),
  ('GRASS'::public.element_type, 'cacturne', 25, 500, 12500, false),
  ('GRASS'::public.element_type, 'cradily', 26, 500, 12500, false),
  ('GRASS'::public.element_type, 'seedot', 27, 500, 12500, false),
  ('GRASS'::public.element_type, 'gloom', 28, 500, 12500, false),
  ('GRASS'::public.element_type, 'nuzleaf', 29, 500, 12500, false),
  ('GRASS'::public.element_type, 'venusaur', 30, 500, 12500, false),
  ('GRASS'::public.element_type, 'vileplume', 31, 500, 12500, false),
  ('GRASS'::public.element_type, 'victreebel', 32, 500, 12500, false),
  ('GRASS'::public.element_type, 'meganium', 33, 500, 12500, false),
  ('GRASS'::public.element_type, 'bellossom', 34, 500, 12500, false),
  ('GRASS'::public.element_type, 'jumpluff', 35, 500, 12500, false),
  ('GRASS'::public.element_type, 'sceptile', 36, 500, 12500, false),
  ('GRASS'::public.element_type, 'ludicolo', 37, 500, 12500, false),
  ('GRASS'::public.element_type, 'shiftry', 38, 500, 32000, true),
  ('ICE'::public.element_type, 'swinub', 0, 50, 1250, false),
  ('ICE'::public.element_type, 'spheal', 1, 75, 1875, false),
  ('ICE'::public.element_type, 'delibird', 2, 100, 2500, false),
  ('ICE'::public.element_type, 'smoochum', 3, 125, 3125, false),
  ('ICE'::public.element_type, 'snorunt', 4, 150, 3750, false),
  ('ICE'::public.element_type, 'lapras', 5, 175, 4375, false),
  ('ICE'::public.element_type, 'cloyster', 6, 200, 5000, false),
  ('ICE'::public.element_type, 'jynx', 7, 225, 5625, false),
  ('ICE'::public.element_type, 'piloswine', 8, 250, 6250, false),
  ('ICE'::public.element_type, 'glalie', 9, 275, 6875, false),
  ('ICE'::public.element_type, 'sealeo', 10, 300, 7500, false),
  ('ICE'::public.element_type, 'sneasel', 11, 325, 8125, false),
  ('ICE'::public.element_type, 'dewgong', 12, 350, 8750, false),
  ('ICE'::public.element_type, 'walrein', 13, 375, 16375, true),
  ('FIGHTING'::public.element_type, 'makuhita', 0, 50, 1250, false),
  ('FIGHTING'::public.element_type, 'hariyama', 1, 75, 1875, false),
  ('FIGHTING'::public.element_type, 'machop', 2, 100, 2500, false),
  ('FIGHTING'::public.element_type, 'mankey', 3, 125, 3125, false),
  ('FIGHTING'::public.element_type, 'tyrogue', 4, 150, 3750, false),
  ('FIGHTING'::public.element_type, 'meditite', 5, 175, 4375, false),
  ('FIGHTING'::public.element_type, 'machoke', 6, 200, 5000, false),
  ('FIGHTING'::public.element_type, 'heracross', 7, 225, 5625, false),
  ('FIGHTING'::public.element_type, 'hitmonlee', 8, 250, 6250, false),
  ('FIGHTING'::public.element_type, 'hitmonchan', 9, 275, 6875, false),
  ('FIGHTING'::public.element_type, 'hitmontop', 10, 300, 7500, false),
  ('FIGHTING'::public.element_type, 'combusken', 11, 325, 8125, false),
  ('FIGHTING'::public.element_type, 'breloom', 12, 350, 8750, false),
  ('FIGHTING'::public.element_type, 'medicham', 13, 375, 9375, false),
  ('FIGHTING'::public.element_type, 'primeape', 14, 400, 10000, false),
  ('FIGHTING'::public.element_type, 'poliwrath', 15, 425, 10625, false),
  ('FIGHTING'::public.element_type, 'machamp', 16, 450, 11250, false),
  ('FIGHTING'::public.element_type, 'blaziken', 17, 475, 20875, true),
  ('POISON'::public.element_type, 'tentacool', 0, 50, 1250, false),
  ('POISON'::public.element_type, 'grimer', 1, 75, 1875, false),
  ('POISON'::public.element_type, 'koffing', 2, 100, 2500, false),
  ('POISON'::public.element_type, 'qwilfish', 3, 125, 3125, false),
  ('POISON'::public.element_type, 'nidorina', 4, 150, 3750, false),
  ('POISON'::public.element_type, 'nidorino', 5, 175, 4375, false),
  ('POISON'::public.element_type, 'nidoran_f', 6, 200, 5000, false),
  ('POISON'::public.element_type, 'nidoran_m', 7, 225, 5625, false),
  ('POISON'::public.element_type, 'zubat', 8, 250, 6250, false),
  ('POISON'::public.element_type, 'bellsprout', 9, 275, 6875, false),
  ('POISON'::public.element_type, 'gastly', 10, 300, 7500, false),
  ('POISON'::public.element_type, 'gulpin', 11, 325, 8125, false),
  ('POISON'::public.element_type, 'weedle', 12, 350, 8750, false),
  ('POISON'::public.element_type, 'ekans', 13, 375, 9375, false),
  ('POISON'::public.element_type, 'oddish', 14, 400, 10000, false),
  ('POISON'::public.element_type, 'seviper', 15, 425, 10625, false),
  ('POISON'::public.element_type, 'golbat', 16, 450, 11250, false),
  ('POISON'::public.element_type, 'weepinbell', 17, 475, 11875, false),
  ('POISON'::public.element_type, 'tentacruel', 18, 500, 12500, false),
  ('POISON'::public.element_type, 'venonat', 19, 500, 12500, false),
  ('POISON'::public.element_type, 'spinarak', 20, 500, 12500, false),
  ('POISON'::public.element_type, 'roselia', 21, 500, 12500, false),
  ('POISON'::public.element_type, 'ivysaur', 22, 500, 12500, false),
  ('POISON'::public.element_type, 'kakuna', 23, 500, 12500, false),
  ('POISON'::public.element_type, 'arbok', 24, 500, 12500, false),
  ('POISON'::public.element_type, 'muk', 25, 500, 12500, false),
  ('POISON'::public.element_type, 'haunter', 26, 500, 12500, false),
  ('POISON'::public.element_type, 'swalot', 27, 500, 12500, false),
  ('POISON'::public.element_type, 'gloom', 28, 500, 12500, false),
  ('POISON'::public.element_type, 'venomoth', 29, 500, 12500, false),
  ('POISON'::public.element_type, 'weezing', 30, 500, 12500, false),
  ('POISON'::public.element_type, 'ariados', 31, 500, 12500, false),
  ('POISON'::public.element_type, 'venusaur', 32, 500, 12500, false),
  ('POISON'::public.element_type, 'beedrill', 33, 500, 12500, false),
  ('POISON'::public.element_type, 'nidoqueen', 34, 500, 12500, false),
  ('POISON'::public.element_type, 'nidoking', 35, 500, 12500, false),
  ('POISON'::public.element_type, 'vileplume', 36, 500, 12500, false),
  ('POISON'::public.element_type, 'victreebel', 37, 500, 12500, false),
  ('POISON'::public.element_type, 'gengar', 38, 500, 12500, false),
  ('POISON'::public.element_type, 'crobat', 39, 500, 12500, false),
  ('POISON'::public.element_type, 'dustox', 40, 500, 33000, true),
  ('GROUND'::public.element_type, 'diglett', 0, 50, 1250, false),
  ('GROUND'::public.element_type, 'geodude', 1, 75, 1875, false),
  ('GROUND'::public.element_type, 'cubone', 2, 100, 2500, false),
  ('GROUND'::public.element_type, 'wooper', 3, 125, 3125, false),
  ('GROUND'::public.element_type, 'swinub', 4, 150, 3750, false),
  ('GROUND'::public.element_type, 'numel', 5, 175, 4375, false),
  ('GROUND'::public.element_type, 'trapinch', 6, 200, 5000, false),
  ('GROUND'::public.element_type, 'barboach', 7, 225, 5625, false),
  ('GROUND'::public.element_type, 'graveler', 8, 250, 6250, false),
  ('GROUND'::public.element_type, 'onix', 9, 275, 6875, false),
  ('GROUND'::public.element_type, 'nincada', 10, 300, 7500, false),
  ('GROUND'::public.element_type, 'baltoy', 11, 325, 8125, false),
  ('GROUND'::public.element_type, 'quagsire', 12, 350, 8750, false),
  ('GROUND'::public.element_type, 'whiscash', 13, 375, 9375, false),
  ('GROUND'::public.element_type, 'claydol', 14, 400, 10000, false),
  ('GROUND'::public.element_type, 'sandshrew', 15, 425, 10625, false),
  ('GROUND'::public.element_type, 'rhyhorn', 16, 450, 11250, false),
  ('GROUND'::public.element_type, 'gligar', 17, 475, 11875, false),
  ('GROUND'::public.element_type, 'dugtrio', 18, 500, 12500, false),
  ('GROUND'::public.element_type, 'larvitar', 19, 500, 12500, false),
  ('GROUND'::public.element_type, 'sandslash', 20, 500, 12500, false),
  ('GROUND'::public.element_type, 'steelix', 21, 500, 12500, false),
  ('GROUND'::public.element_type, 'piloswine', 22, 500, 12500, false),
  ('GROUND'::public.element_type, 'donphan', 23, 500, 12500, false),
  ('GROUND'::public.element_type, 'marshtomp', 24, 500, 12500, false),
  ('GROUND'::public.element_type, 'camerupt', 25, 500, 12500, false),
  ('GROUND'::public.element_type, 'vibrava', 26, 500, 12500, false),
  ('GROUND'::public.element_type, 'phanpy', 27, 500, 12500, false),
  ('GROUND'::public.element_type, 'marowak', 28, 500, 12500, false),
  ('GROUND'::public.element_type, 'rhydon', 29, 500, 12500, false),
  ('GROUND'::public.element_type, 'pupitar', 30, 500, 12500, false),
  ('GROUND'::public.element_type, 'nidoqueen', 31, 500, 12500, false),
  ('GROUND'::public.element_type, 'nidoking', 32, 500, 12500, false),
  ('GROUND'::public.element_type, 'golem', 33, 500, 12500, false),
  ('GROUND'::public.element_type, 'swampert', 34, 500, 12500, false),
  ('GROUND'::public.element_type, 'flygon', 35, 500, 30500, true),
  ('FLYING'::public.element_type, 'spearow', 0, 50, 1250, false),
  ('FLYING'::public.element_type, 'natu', 1, 75, 1875, false),
  ('FLYING'::public.element_type, 'wingull', 2, 100, 2500, false),
  ('FLYING'::public.element_type, 'swablu', 3, 125, 3125, false),
  ('FLYING'::public.element_type, 'pidgey', 4, 150, 3750, false),
  ('FLYING'::public.element_type, 'zubat', 5, 175, 4375, false),
  ('FLYING'::public.element_type, 'hoothoot', 6, 200, 5000, false),
  ('FLYING'::public.element_type, 'taillow', 7, 225, 5625, false),
  ('FLYING'::public.element_type, 'gyarados', 8, 250, 6250, false),
  ('FLYING'::public.element_type, 'doduo', 9, 275, 6875, false),
  ('FLYING'::public.element_type, 'hoppip', 10, 300, 7500, false),
  ('FLYING'::public.element_type, 'gligar', 11, 325, 8125, false),
  ('FLYING'::public.element_type, 'delibird', 12, 350, 8750, false),
  ('FLYING'::public.element_type, 'tropius', 13, 375, 9375, false),
  ('FLYING'::public.element_type, 'pidgeotto', 14, 400, 10000, false),
  ('FLYING'::public.element_type, 'fearow', 15, 425, 10625, false),
  ('FLYING'::public.element_type, 'golbat', 16, 450, 11250, false),
  ('FLYING'::public.element_type, 'swellow', 17, 475, 11875, false),
  ('FLYING'::public.element_type, 'farfetch_d', 18, 500, 12500, false),
  ('FLYING'::public.element_type, 'aerodactyl', 19, 500, 12500, false),
  ('FLYING'::public.element_type, 'ledyba', 20, 500, 12500, false),
  ('FLYING'::public.element_type, 'murkrow', 21, 500, 12500, false),
  ('FLYING'::public.element_type, 'mantine', 22, 500, 12500, false),
  ('FLYING'::public.element_type, 'noctowl', 23, 500, 12500, false),
  ('FLYING'::public.element_type, 'togetic', 24, 500, 12500, false),
  ('FLYING'::public.element_type, 'xatu', 25, 500, 12500, false),
  ('FLYING'::public.element_type, 'skiploom', 26, 500, 12500, false),
  ('FLYING'::public.element_type, 'pelipper', 27, 500, 12500, false),
  ('FLYING'::public.element_type, 'masquerain', 28, 500, 12500, false),
  ('FLYING'::public.element_type, 'ninjask', 29, 500, 12500, false),
  ('FLYING'::public.element_type, 'altaria', 30, 500, 12500, false),
  ('FLYING'::public.element_type, 'scyther', 31, 500, 12500, false),
  ('FLYING'::public.element_type, 'yanma', 32, 500, 12500, false),
  ('FLYING'::public.element_type, 'skarmory', 33, 500, 12500, false),
  ('FLYING'::public.element_type, 'dodrio', 34, 500, 12500, false),
  ('FLYING'::public.element_type, 'ledian', 35, 500, 12500, false),
  ('FLYING'::public.element_type, 'charizard', 36, 500, 12500, false),
  ('FLYING'::public.element_type, 'butterfree', 37, 500, 12500, false),
  ('FLYING'::public.element_type, 'pidgeot', 38, 500, 12500, false),
  ('FLYING'::public.element_type, 'dragonite', 39, 500, 12500, false),
  ('FLYING'::public.element_type, 'crobat', 40, 500, 12500, false),
  ('FLYING'::public.element_type, 'jumpluff', 41, 500, 12500, false),
  ('FLYING'::public.element_type, 'beautifly', 42, 500, 12500, false),
  ('FLYING'::public.element_type, 'salamence', 43, 500, 34500, true),
  ('PSYCHIC'::public.element_type, 'slowpoke', 0, 50, 1250, false),
  ('PSYCHIC'::public.element_type, 'natu', 1, 75, 1875, false),
  ('PSYCHIC'::public.element_type, 'unown', 2, 100, 2500, false),
  ('PSYCHIC'::public.element_type, 'wynaut', 3, 125, 3125, false),
  ('PSYCHIC'::public.element_type, 'drowzee', 4, 150, 3750, false),
  ('PSYCHIC'::public.element_type, 'exeggcute', 5, 175, 4375, false),
  ('PSYCHIC'::public.element_type, 'girafarig', 6, 200, 5000, false),
  ('PSYCHIC'::public.element_type, 'spoink', 7, 225, 5625, false),
  ('PSYCHIC'::public.element_type, 'solrock', 8, 250, 6250, false),
  ('PSYCHIC'::public.element_type, 'baltoy', 9, 275, 6875, false),
  ('PSYCHIC'::public.element_type, 'claydol', 10, 300, 7500, false),
  ('PSYCHIC'::public.element_type, 'abra', 11, 325, 8125, false),
  ('PSYCHIC'::public.element_type, 'smoochum', 12, 350, 8750, false),
  ('PSYCHIC'::public.element_type, 'meditite', 13, 375, 9375, false),
  ('PSYCHIC'::public.element_type, 'beldum', 14, 400, 10000, false),
  ('PSYCHIC'::public.element_type, 'slowbro', 15, 425, 10625, false),
  ('PSYCHIC'::public.element_type, 'wobbuffet', 16, 450, 11250, false),
  ('PSYCHIC'::public.element_type, 'ralts', 17, 475, 11875, false),
  ('PSYCHIC'::public.element_type, 'lunatone', 18, 500, 12500, false),
  ('PSYCHIC'::public.element_type, 'kadabra', 19, 500, 12500, false),
  ('PSYCHIC'::public.element_type, 'hypno', 20, 500, 12500, false),
  ('PSYCHIC'::public.element_type, 'exeggutor', 21, 500, 12500, false),
  ('PSYCHIC'::public.element_type, 'starmie', 22, 500, 12500, false),
  ('PSYCHIC'::public.element_type, 'jynx', 23, 500, 12500, false),
  ('PSYCHIC'::public.element_type, 'xatu', 24, 500, 12500, false),
  ('PSYCHIC'::public.element_type, 'slowking', 25, 500, 12500, false),
  ('PSYCHIC'::public.element_type, 'kirlia', 26, 500, 12500, false),
  ('PSYCHIC'::public.element_type, 'medicham', 27, 500, 12500, false),
  ('PSYCHIC'::public.element_type, 'grumpig', 28, 500, 12500, false),
  ('PSYCHIC'::public.element_type, 'metang', 29, 500, 12500, false),
  ('PSYCHIC'::public.element_type, 'chimecho', 30, 500, 12500, false),
  ('PSYCHIC'::public.element_type, 'alakazam', 31, 500, 12500, false),
  ('PSYCHIC'::public.element_type, 'gardevoir', 32, 500, 12500, false),
  ('PSYCHIC'::public.element_type, 'metagross', 33, 500, 29500, true),
  ('BUG'::public.element_type, 'wurmple', 0, 50, 1250, false),
  ('BUG'::public.element_type, 'nincada', 1, 75, 1875, false),
  ('BUG'::public.element_type, 'illumise', 2, 100, 2500, false),
  ('BUG'::public.element_type, 'caterpie', 3, 125, 3125, false),
  ('BUG'::public.element_type, 'weedle', 4, 150, 3750, false),
  ('BUG'::public.element_type, 'paras', 5, 175, 4375, false),
  ('BUG'::public.element_type, 'pineco', 6, 200, 5000, false),
  ('BUG'::public.element_type, 'surskit', 7, 225, 5625, false),
  ('BUG'::public.element_type, 'anorith', 8, 250, 6250, false),
  ('BUG'::public.element_type, 'silcoon', 9, 275, 6875, false),
  ('BUG'::public.element_type, 'cascoon', 10, 300, 7500, false),
  ('BUG'::public.element_type, 'venonat', 11, 325, 8125, false),
  ('BUG'::public.element_type, 'ledyba', 12, 350, 8750, false),
  ('BUG'::public.element_type, 'spinarak', 13, 375, 9375, false),
  ('BUG'::public.element_type, 'heracross', 14, 400, 10000, false),
  ('BUG'::public.element_type, 'metapod', 15, 425, 10625, false),
  ('BUG'::public.element_type, 'kakuna', 16, 450, 11250, false),
  ('BUG'::public.element_type, 'parasect', 17, 475, 11875, false),
  ('BUG'::public.element_type, 'forretress', 18, 500, 12500, false),
  ('BUG'::public.element_type, 'scizor', 19, 500, 12500, false),
  ('BUG'::public.element_type, 'masquerain', 20, 500, 12500, false),
  ('BUG'::public.element_type, 'ninjask', 21, 500, 12500, false),
  ('BUG'::public.element_type, 'shedinja', 22, 500, 12500, false),
  ('BUG'::public.element_type, 'armaldo', 23, 500, 12500, false),
  ('BUG'::public.element_type, 'scyther', 24, 500, 12500, false),
  ('BUG'::public.element_type, 'pinsir', 25, 500, 12500, false),
  ('BUG'::public.element_type, 'yanma', 26, 500, 12500, false),
  ('BUG'::public.element_type, 'volbeat', 27, 500, 12500, false),
  ('BUG'::public.element_type, 'venomoth', 28, 500, 12500, false),
  ('BUG'::public.element_type, 'ledian', 29, 500, 12500, false),
  ('BUG'::public.element_type, 'ariados', 30, 500, 12500, false),
  ('BUG'::public.element_type, 'butterfree', 31, 500, 12500, false),
  ('BUG'::public.element_type, 'beedrill', 32, 500, 12500, false),
  ('BUG'::public.element_type, 'beautifly', 33, 500, 12500, false),
  ('BUG'::public.element_type, 'dustox', 34, 500, 30000, true),
  ('ROCK'::public.element_type, 'geodude', 0, 50, 1250, false),
  ('ROCK'::public.element_type, 'nosepass', 1, 75, 1875, false),
  ('ROCK'::public.element_type, 'graveler', 2, 100, 2500, false),
  ('ROCK'::public.element_type, 'onix', 3, 125, 3125, false),
  ('ROCK'::public.element_type, 'aron', 4, 150, 3750, false),
  ('ROCK'::public.element_type, 'solrock', 5, 175, 4375, false),
  ('ROCK'::public.element_type, 'lairon', 6, 200, 5000, false),
  ('ROCK'::public.element_type, 'rhyhorn', 7, 225, 5625, false),
  ('ROCK'::public.element_type, 'omanyte', 8, 250, 6250, false),
  ('ROCK'::public.element_type, 'kabuto', 9, 275, 6875, false),
  ('ROCK'::public.element_type, 'corsola', 10, 300, 7500, false),
  ('ROCK'::public.element_type, 'lileep', 11, 325, 8125, false),
  ('ROCK'::public.element_type, 'anorith', 12, 350, 8750, false),
  ('ROCK'::public.element_type, 'aerodactyl', 13, 375, 9375, false),
  ('ROCK'::public.element_type, 'sudowoodo', 14, 400, 10000, false),
  ('ROCK'::public.element_type, 'larvitar', 15, 425, 10625, false),
  ('ROCK'::public.element_type, 'lunatone', 16, 450, 11250, false),
  ('ROCK'::public.element_type, 'relicanth', 17, 475, 11875, false),
  ('ROCK'::public.element_type, 'omastar', 18, 500, 12500, false),
  ('ROCK'::public.element_type, 'kabutops', 19, 500, 12500, false),
  ('ROCK'::public.element_type, 'magcargo', 20, 500, 12500, false),
  ('ROCK'::public.element_type, 'cradily', 21, 500, 12500, false),
  ('ROCK'::public.element_type, 'armaldo', 22, 500, 12500, false),
  ('ROCK'::public.element_type, 'rhydon', 23, 500, 12500, false),
  ('ROCK'::public.element_type, 'pupitar', 24, 500, 12500, false),
  ('ROCK'::public.element_type, 'golem', 25, 500, 12500, false),
  ('ROCK'::public.element_type, 'tyranitar', 26, 500, 12500, false),
  ('ROCK'::public.element_type, 'aggron', 27, 500, 26500, true),
  ('GHOST'::public.element_type, 'sableye', 0, 50, 1250, false),
  ('GHOST'::public.element_type, 'shuppet', 1, 75, 1875, false),
  ('GHOST'::public.element_type, 'gastly', 2, 100, 2500, false),
  ('GHOST'::public.element_type, 'banette', 3, 125, 3125, false),
  ('GHOST'::public.element_type, 'duskull', 4, 150, 3750, false),
  ('GHOST'::public.element_type, 'misdreavus', 5, 175, 4375, false),
  ('GHOST'::public.element_type, 'haunter', 6, 200, 5000, false),
  ('GHOST'::public.element_type, 'shedinja', 7, 225, 5625, false),
  ('GHOST'::public.element_type, 'dusclops', 8, 250, 6250, false),
  ('GHOST'::public.element_type, 'gengar', 9, 275, 11875, true),
  ('DRAGON'::public.element_type, 'bagon', 0, 50, 1250, false),
  ('DRAGON'::public.element_type, 'dratini', 1, 75, 1875, false),
  ('DRAGON'::public.element_type, 'dragonair', 2, 100, 2500, false),
  ('DRAGON'::public.element_type, 'vibrava', 3, 125, 3125, false),
  ('DRAGON'::public.element_type, 'altaria', 4, 150, 3750, false),
  ('DRAGON'::public.element_type, 'shelgon', 5, 175, 4375, false),
  ('DRAGON'::public.element_type, 'dragonite', 6, 200, 5000, false),
  ('DRAGON'::public.element_type, 'kingdra', 7, 225, 5625, false),
  ('DRAGON'::public.element_type, 'flygon', 8, 250, 6250, false),
  ('DRAGON'::public.element_type, 'salamence', 9, 275, 11875, true),
  ('DARK'::public.element_type, 'poochyena', 0, 50, 1250, false),
  ('DARK'::public.element_type, 'sableye', 1, 75, 1875, false),
  ('DARK'::public.element_type, 'carvanha', 2, 100, 2500, false),
  ('DARK'::public.element_type, 'sharpedo', 3, 125, 3125, false),
  ('DARK'::public.element_type, 'mightyena', 4, 150, 3750, false),
  ('DARK'::public.element_type, 'absol', 5, 175, 4375, false),
  ('DARK'::public.element_type, 'murkrow', 6, 200, 5000, false),
  ('DARK'::public.element_type, 'houndour', 7, 225, 5625, false),
  ('DARK'::public.element_type, 'houndoom', 8, 250, 6250, false),
  ('DARK'::public.element_type, 'cacturne', 9, 275, 6875, false),
  ('DARK'::public.element_type, 'crawdaunt', 10, 300, 7500, false),
  ('DARK'::public.element_type, 'sneasel', 11, 325, 8125, false),
  ('DARK'::public.element_type, 'nuzleaf', 12, 350, 8750, false),
  ('DARK'::public.element_type, 'tyranitar', 13, 375, 9375, false),
  ('DARK'::public.element_type, 'shiftry', 14, 400, 17500, true),
  ('STEEL'::public.element_type, 'magnemite', 0, 50, 1250, false),
  ('STEEL'::public.element_type, 'aron', 1, 75, 1875, false),
  ('STEEL'::public.element_type, 'lairon', 2, 100, 2500, false),
  ('STEEL'::public.element_type, 'beldum', 3, 125, 3125, false),
  ('STEEL'::public.element_type, 'magneton', 4, 150, 3750, false),
  ('STEEL'::public.element_type, 'mawile', 5, 175, 4375, false),
  ('STEEL'::public.element_type, 'forretress', 6, 200, 5000, false),
  ('STEEL'::public.element_type, 'steelix', 7, 225, 5625, false),
  ('STEEL'::public.element_type, 'scizor', 8, 250, 6250, false),
  ('STEEL'::public.element_type, 'metang', 9, 275, 6875, false),
  ('STEEL'::public.element_type, 'skarmory', 10, 300, 7500, false),
  ('STEEL'::public.element_type, 'aggron', 11, 325, 8125, false),
  ('STEEL'::public.element_type, 'metagross', 12, 350, 15250, true),
  ('FAIRY'::public.element_type, 'cleffa', 0, 50, 1250, false),
  ('FAIRY'::public.element_type, 'igglybuff', 1, 75, 1875, false),
  ('FAIRY'::public.element_type, 'togepi', 2, 100, 2500, false),
  ('FAIRY'::public.element_type, 'azurill', 3, 125, 3125, false),
  ('FAIRY'::public.element_type, 'snubbull', 4, 150, 3750, false),
  ('FAIRY'::public.element_type, 'ralts', 5, 175, 4375, false),
  ('FAIRY'::public.element_type, 'mawile', 6, 200, 5000, false),
  ('FAIRY'::public.element_type, 'togetic', 7, 225, 5625, false),
  ('FAIRY'::public.element_type, 'marill', 8, 250, 6250, false),
  ('FAIRY'::public.element_type, 'kirlia', 9, 275, 6875, false),
  ('FAIRY'::public.element_type, 'wigglytuff', 10, 300, 7500, false),
  ('FAIRY'::public.element_type, 'azumarill', 11, 325, 8125, false),
  ('FAIRY'::public.element_type, 'clefairy', 12, 350, 8750, false),
  ('FAIRY'::public.element_type, 'jigglypuff', 13, 375, 9375, false),
  ('FAIRY'::public.element_type, 'granbull', 14, 400, 10000, false),
  ('FAIRY'::public.element_type, 'clefable', 15, 425, 10625, false),
  ('FAIRY'::public.element_type, 'gardevoir', 16, 450, 19750, true)
on conflict (tipo, species_id) do update set
  posicao = excluded.posicao,
  alvo = excluded.alvo,
  recompensa = excluded.recompensa,
  eh_ultima = excluded.eh_ultima;

create or replace function public.reivindicar_missao(p_tipo text, p_species_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_posicao int;
  v_alvo int;
  v_recompensa bigint;
  v_reivindicadas int;
  v_abates bigint;
  v_ja_reivindicada boolean;
  v_tipo public.element_type;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;

  -- Valida ANTES de castar: `p_tipo::public.element_type` com lixo levanta
  -- `invalid input value for enum`, um erro cru do Postgres, em vez desta
  -- mensagem. Mesmo motivo da guarda que ja existia quando a coluna era text.
  if p_tipo not in (
    'NORMAL','FIRE','WATER','ELECTRIC','GRASS','ICE','FIGHTING','POISON',
    'GROUND','FLYING','PSYCHIC','BUG','ROCK','GHOST','DRAGON','DARK','STEEL','FAIRY'
  ) then
    raise exception 'tipo invalido' using errcode = 'P0001';
  end if;
  v_tipo := p_tipo::public.element_type;

  -- Lock ANTES de qualquer leitura de negocio (PH-199, ver a migration
  -- ..._missao_lock_antes_da_leitura_*): sem isto a segunda de duas chamadas
  -- concorrentes lia o snapshot velho e caia num erro cru de constraint em vez
  -- da mensagem certa.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

  select exists(
    select 1 from public.player_missoes_reivindicadas
    where user_id = v_user_id and tipo = p_tipo and species_id = p_species_id
  ) into v_ja_reivindicada;
  if v_ja_reivindicada then
    raise exception 'Missao ja reivindicada.' using errcode = 'P0001';
  end if;

  -- A cadeia vem da TABELA. Nao ha mais derivacao aqui, entao nao ha mais como
  -- ela discordar da que a tela desenhou.
  select posicao, alvo, recompensa into v_posicao, v_alvo, v_recompensa
    from public.missao_cadeia where tipo = v_tipo and species_id = p_species_id;
  if v_posicao is null then
    raise exception 'Essa especie nao pertence a cadeia desse tipo.' using errcode = 'P0001';
  end if;

  select count(*) into v_reivindicadas from public.player_missoes_reivindicadas
    where user_id = v_user_id and tipo = p_tipo;
  if v_reivindicadas != v_posicao then
    raise exception 'Complete a missao anterior da cadeia primeiro.' using errcode = 'P0001';
  end if;

  select coalesce(normal_kills, 0) + coalesce(shiny_kills, 0) into v_abates
    from public.player_pokedex where user_id = v_user_id and species_id = p_species_id;
  if coalesce(v_abates, 0) < v_alvo then
    raise exception 'Abates insuficientes para reivindicar esta missao.' using errcode = 'P0001';
  end if;

  update public.players set gold = gold + v_recompensa where user_id = v_user_id;
  if not found then
    raise exception 'jogador sem linha em players' using errcode = 'P0001';
  end if;

  insert into public.player_missoes_reivindicadas (user_id, tipo, species_id)
  values (v_user_id, p_tipo, p_species_id);

  return jsonb_build_object(
    'ok', true,
    'mensagem', format('Missao de %s (posicao %s) reivindicada — %s de ouro.', p_tipo, v_posicao + 1, v_recompensa)
  );
end;
$$;

-- O progresso de missao e ZERADO, e nao filtrado. O gate sequencial da RPC e
-- `count(reivindicadas do tipo) = posicao`, entao ele so funciona se as
-- reivindicacoes gravadas forem exatamente as posicoes 0..n-1 da cadeia VIGENTE.
-- As posicoes mudaram todas (a ordem deixou de ser por numero de Pokedex),
-- entao apagar so o que saiu da cadeia nao basta: uma especie que continua na
-- cadeia mas em OUTRA posicao deixa o `count` certo e as posicoes erradas —
-- o jogador veria as primeiras missoes da cadeia nova destravadas na tela e a
-- RPC as recusaria, que e exatamente a classe de divergencia que esta issue
-- veio fechar.
--
-- CUSTO MEDIDO ANTES DE ESCREVER ISTO (28/08): `public` tinha 4 linhas de 1
-- jogador e `dev` tinha 0. O ouro ja pago nao volta (esta na carteira), entao
-- o unico efeito e esse jogador poder reivindicar de novo as 4 — algumas
-- centenas de ouro. Filtrar com mais cuidado nao pagaria a complexidade.
delete from public.player_missoes_reivindicadas;

commit;
