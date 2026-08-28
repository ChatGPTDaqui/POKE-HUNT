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
  ('NORMAL'::public.element_type, 'pidgey', 2, 100, 2500, false),
  ('NORMAL'::public.element_type, 'lickitung', 3, 125, 3125, false),
  ('NORMAL'::public.element_type, 'sentret', 4, 150, 3750, false),
  ('NORMAL'::public.element_type, 'hoothoot', 5, 175, 4375, false),
  ('NORMAL'::public.element_type, 'aipom', 6, 200, 5000, false),
  ('NORMAL'::public.element_type, 'girafarig', 7, 225, 5625, false),
  ('NORMAL'::public.element_type, 'meowth', 8, 250, 6250, false),
  ('NORMAL'::public.element_type, 'doduo', 9, 275, 6875, false),
  ('NORMAL'::public.element_type, 'igglybuff', 10, 300, 7500, false),
  ('NORMAL'::public.element_type, 'stantler', 11, 325, 8125, false),
  ('NORMAL'::public.element_type, 'smeargle', 12, 350, 8750, false),
  ('NORMAL'::public.element_type, 'pidgeotto', 13, 375, 9375, false),
  ('NORMAL'::public.element_type, 'raticate', 14, 400, 10000, false),
  ('NORMAL'::public.element_type, 'fearow', 15, 425, 10625, false),
  ('NORMAL'::public.element_type, 'ursaring', 16, 450, 11250, false),
  ('NORMAL'::public.element_type, 'farfetch_d', 17, 475, 11875, false),
  ('NORMAL'::public.element_type, 'kangaskhan', 18, 500, 12500, false),
  ('NORMAL'::public.element_type, 'tauros', 19, 500, 12500, false),
  ('NORMAL'::public.element_type, 'ditto', 20, 500, 12500, false),
  ('NORMAL'::public.element_type, 'snorlax', 21, 500, 12500, false),
  ('NORMAL'::public.element_type, 'miltank', 22, 500, 12500, false),
  ('NORMAL'::public.element_type, 'furret', 23, 500, 12500, false),
  ('NORMAL'::public.element_type, 'noctowl', 24, 500, 12500, false),
  ('NORMAL'::public.element_type, 'wigglytuff', 25, 500, 12500, false),
  ('NORMAL'::public.element_type, 'dunsparce', 26, 500, 12500, false),
  ('NORMAL'::public.element_type, 'teddiursa', 27, 500, 12500, false),
  ('NORMAL'::public.element_type, 'jigglypuff', 28, 500, 12500, false),
  ('NORMAL'::public.element_type, 'persian', 29, 500, 12500, false),
  ('NORMAL'::public.element_type, 'dodrio', 30, 500, 12500, false),
  ('NORMAL'::public.element_type, 'pidgeot', 31, 500, 28500, true),
  ('FIRE'::public.element_type, 'ponyta', 0, 50, 1250, false),
  ('FIRE'::public.element_type, 'cyndaquil', 1, 75, 1875, false),
  ('FIRE'::public.element_type, 'magby', 2, 100, 2500, false),
  ('FIRE'::public.element_type, 'rapidash', 3, 125, 3125, false),
  ('FIRE'::public.element_type, 'growlithe', 4, 150, 3750, false),
  ('FIRE'::public.element_type, 'slugma', 5, 175, 4375, false),
  ('FIRE'::public.element_type, 'houndour', 6, 200, 5000, false),
  ('FIRE'::public.element_type, 'charmeleon', 7, 225, 5625, false),
  ('FIRE'::public.element_type, 'arcanine', 8, 250, 6250, false),
  ('FIRE'::public.element_type, 'magmar', 9, 275, 6875, false),
  ('FIRE'::public.element_type, 'flareon', 10, 300, 7500, false),
  ('FIRE'::public.element_type, 'quilava', 11, 325, 8125, false),
  ('FIRE'::public.element_type, 'magcargo', 12, 350, 8750, false),
  ('FIRE'::public.element_type, 'houndoom', 13, 375, 9375, false),
  ('FIRE'::public.element_type, 'charizard', 14, 400, 10000, false),
  ('FIRE'::public.element_type, 'typhlosion', 15, 425, 18625, true),
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
  ('WATER'::public.element_type, 'seel', 12, 350, 8750, false),
  ('WATER'::public.element_type, 'shellder', 13, 375, 9375, false),
  ('WATER'::public.element_type, 'poliwhirl', 14, 400, 10000, false),
  ('WATER'::public.element_type, 'kingler', 15, 425, 10625, false),
  ('WATER'::public.element_type, 'seaking', 16, 450, 11250, false),
  ('WATER'::public.element_type, 'gyarados', 17, 475, 11875, false),
  ('WATER'::public.element_type, 'quagsire', 18, 500, 12500, false),
  ('WATER'::public.element_type, 'staryu', 19, 500, 12500, false),
  ('WATER'::public.element_type, 'omanyte', 20, 500, 12500, false),
  ('WATER'::public.element_type, 'kabuto', 21, 500, 12500, false),
  ('WATER'::public.element_type, 'totodile', 22, 500, 12500, false),
  ('WATER'::public.element_type, 'corsola', 23, 500, 12500, false),
  ('WATER'::public.element_type, 'golduck', 24, 500, 12500, false),
  ('WATER'::public.element_type, 'tentacruel', 25, 500, 12500, false),
  ('WATER'::public.element_type, 'slowbro', 26, 500, 12500, false),
  ('WATER'::public.element_type, 'seadra', 27, 500, 12500, false),
  ('WATER'::public.element_type, 'lanturn', 28, 500, 12500, false),
  ('WATER'::public.element_type, 'lapras', 29, 500, 12500, false),
  ('WATER'::public.element_type, 'marill', 30, 500, 12500, false),
  ('WATER'::public.element_type, 'mantine', 31, 500, 12500, false),
  ('WATER'::public.element_type, 'wartortle', 32, 500, 12500, false),
  ('WATER'::public.element_type, 'cloyster', 33, 500, 12500, false),
  ('WATER'::public.element_type, 'starmie', 34, 500, 12500, false),
  ('WATER'::public.element_type, 'vaporeon', 35, 500, 12500, false),
  ('WATER'::public.element_type, 'omastar', 36, 500, 12500, false),
  ('WATER'::public.element_type, 'kabutops', 37, 500, 12500, false),
  ('WATER'::public.element_type, 'croconaw', 38, 500, 12500, false),
  ('WATER'::public.element_type, 'azumarill', 39, 500, 12500, false),
  ('WATER'::public.element_type, 'slowking', 40, 500, 12500, false),
  ('WATER'::public.element_type, 'octillery', 41, 500, 12500, false),
  ('WATER'::public.element_type, 'dewgong', 42, 500, 12500, false),
  ('WATER'::public.element_type, 'blastoise', 43, 500, 12500, false),
  ('WATER'::public.element_type, 'poliwrath', 44, 500, 12500, false),
  ('WATER'::public.element_type, 'feraligatr', 45, 500, 12500, false),
  ('WATER'::public.element_type, 'politoed', 46, 500, 12500, false),
  ('WATER'::public.element_type, 'kingdra', 47, 500, 36500, true),
  ('ELECTRIC'::public.element_type, 'voltorb', 0, 50, 1250, false),
  ('ELECTRIC'::public.element_type, 'chinchou', 1, 75, 1875, false),
  ('ELECTRIC'::public.element_type, 'magnemite', 2, 100, 2500, false),
  ('ELECTRIC'::public.element_type, 'pichu', 3, 125, 3125, false),
  ('ELECTRIC'::public.element_type, 'mareep', 4, 150, 3750, false),
  ('ELECTRIC'::public.element_type, 'elekid', 5, 175, 4375, false),
  ('ELECTRIC'::public.element_type, 'magneton', 6, 200, 5000, false),
  ('ELECTRIC'::public.element_type, 'electrode', 7, 225, 5625, false),
  ('ELECTRIC'::public.element_type, 'lanturn', 8, 250, 6250, false),
  ('ELECTRIC'::public.element_type, 'flaaffy', 9, 275, 6875, false),
  ('ELECTRIC'::public.element_type, 'pikachu', 10, 300, 7500, false),
  ('ELECTRIC'::public.element_type, 'electabuzz', 11, 325, 8125, false),
  ('ELECTRIC'::public.element_type, 'jolteon', 12, 350, 8750, false),
  ('ELECTRIC'::public.element_type, 'raichu', 13, 375, 9375, false),
  ('ELECTRIC'::public.element_type, 'ampharos', 14, 400, 17500, true),
  ('GRASS'::public.element_type, 'tangela', 0, 50, 1250, false),
  ('GRASS'::public.element_type, 'bellsprout', 1, 75, 1875, false),
  ('GRASS'::public.element_type, 'exeggcute', 2, 100, 2500, false),
  ('GRASS'::public.element_type, 'oddish', 3, 125, 3125, false),
  ('GRASS'::public.element_type, 'paras', 4, 150, 3750, false),
  ('GRASS'::public.element_type, 'chikorita', 5, 175, 4375, false),
  ('GRASS'::public.element_type, 'hoppip', 6, 200, 5000, false),
  ('GRASS'::public.element_type, 'sunkern', 7, 225, 5625, false),
  ('GRASS'::public.element_type, 'weepinbell', 8, 250, 6250, false),
  ('GRASS'::public.element_type, 'ivysaur', 9, 275, 6875, false),
  ('GRASS'::public.element_type, 'parasect', 10, 300, 7500, false),
  ('GRASS'::public.element_type, 'exeggutor', 11, 325, 8125, false),
  ('GRASS'::public.element_type, 'bayleef', 12, 350, 8750, false),
  ('GRASS'::public.element_type, 'skiploom', 13, 375, 9375, false),
  ('GRASS'::public.element_type, 'sunflora', 14, 400, 10000, false),
  ('GRASS'::public.element_type, 'gloom', 15, 425, 10625, false),
  ('GRASS'::public.element_type, 'venusaur', 16, 450, 11250, false),
  ('GRASS'::public.element_type, 'vileplume', 17, 475, 11875, false),
  ('GRASS'::public.element_type, 'victreebel', 18, 500, 12500, false),
  ('GRASS'::public.element_type, 'meganium', 19, 500, 12500, false),
  ('GRASS'::public.element_type, 'bellossom', 20, 500, 12500, false),
  ('GRASS'::public.element_type, 'jumpluff', 21, 500, 23500, true),
  ('ICE'::public.element_type, 'swinub', 0, 50, 1250, false),
  ('ICE'::public.element_type, 'delibird', 1, 75, 1875, false),
  ('ICE'::public.element_type, 'smoochum', 2, 100, 2500, false),
  ('ICE'::public.element_type, 'lapras', 3, 125, 3125, false),
  ('ICE'::public.element_type, 'cloyster', 4, 150, 3750, false),
  ('ICE'::public.element_type, 'jynx', 5, 175, 4375, false),
  ('ICE'::public.element_type, 'piloswine', 6, 200, 5000, false),
  ('ICE'::public.element_type, 'sneasel', 7, 225, 5625, false),
  ('ICE'::public.element_type, 'dewgong', 8, 250, 10750, true),
  ('FIGHTING'::public.element_type, 'machop', 0, 50, 1250, false),
  ('FIGHTING'::public.element_type, 'mankey', 1, 75, 1875, false),
  ('FIGHTING'::public.element_type, 'tyrogue', 2, 100, 2500, false),
  ('FIGHTING'::public.element_type, 'machoke', 3, 125, 3125, false),
  ('FIGHTING'::public.element_type, 'heracross', 4, 150, 3750, false),
  ('FIGHTING'::public.element_type, 'hitmonlee', 5, 175, 4375, false),
  ('FIGHTING'::public.element_type, 'hitmonchan', 6, 200, 5000, false),
  ('FIGHTING'::public.element_type, 'hitmontop', 7, 225, 5625, false),
  ('FIGHTING'::public.element_type, 'primeape', 8, 250, 6250, false),
  ('FIGHTING'::public.element_type, 'poliwrath', 9, 275, 6875, false),
  ('FIGHTING'::public.element_type, 'machamp', 10, 300, 13000, true),
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
  ('POISON'::public.element_type, 'weedle', 11, 325, 8125, false),
  ('POISON'::public.element_type, 'ekans', 12, 350, 8750, false),
  ('POISON'::public.element_type, 'oddish', 13, 375, 9375, false),
  ('POISON'::public.element_type, 'golbat', 14, 400, 10000, false),
  ('POISON'::public.element_type, 'weepinbell', 15, 425, 10625, false),
  ('POISON'::public.element_type, 'tentacruel', 16, 450, 11250, false),
  ('POISON'::public.element_type, 'venonat', 17, 475, 11875, false),
  ('POISON'::public.element_type, 'spinarak', 18, 500, 12500, false),
  ('POISON'::public.element_type, 'ivysaur', 19, 500, 12500, false),
  ('POISON'::public.element_type, 'kakuna', 20, 500, 12500, false),
  ('POISON'::public.element_type, 'arbok', 21, 500, 12500, false),
  ('POISON'::public.element_type, 'muk', 22, 500, 12500, false),
  ('POISON'::public.element_type, 'haunter', 23, 500, 12500, false),
  ('POISON'::public.element_type, 'gloom', 24, 500, 12500, false),
  ('POISON'::public.element_type, 'venomoth', 25, 500, 12500, false),
  ('POISON'::public.element_type, 'weezing', 26, 500, 12500, false),
  ('POISON'::public.element_type, 'ariados', 27, 500, 12500, false),
  ('POISON'::public.element_type, 'venusaur', 28, 500, 12500, false),
  ('POISON'::public.element_type, 'beedrill', 29, 500, 12500, false),
  ('POISON'::public.element_type, 'nidoqueen', 30, 500, 12500, false),
  ('POISON'::public.element_type, 'nidoking', 31, 500, 12500, false),
  ('POISON'::public.element_type, 'vileplume', 32, 500, 12500, false),
  ('POISON'::public.element_type, 'victreebel', 33, 500, 12500, false),
  ('POISON'::public.element_type, 'gengar', 34, 500, 12500, false),
  ('POISON'::public.element_type, 'crobat', 35, 500, 30500, true),
  ('GROUND'::public.element_type, 'diglett', 0, 50, 1250, false),
  ('GROUND'::public.element_type, 'geodude', 1, 75, 1875, false),
  ('GROUND'::public.element_type, 'cubone', 2, 100, 2500, false),
  ('GROUND'::public.element_type, 'wooper', 3, 125, 3125, false),
  ('GROUND'::public.element_type, 'swinub', 4, 150, 3750, false),
  ('GROUND'::public.element_type, 'graveler', 5, 175, 4375, false),
  ('GROUND'::public.element_type, 'onix', 6, 200, 5000, false),
  ('GROUND'::public.element_type, 'quagsire', 7, 225, 5625, false),
  ('GROUND'::public.element_type, 'sandshrew', 8, 250, 6250, false),
  ('GROUND'::public.element_type, 'rhyhorn', 9, 275, 6875, false),
  ('GROUND'::public.element_type, 'gligar', 10, 300, 7500, false),
  ('GROUND'::public.element_type, 'dugtrio', 11, 325, 8125, false),
  ('GROUND'::public.element_type, 'larvitar', 12, 350, 8750, false),
  ('GROUND'::public.element_type, 'sandslash', 13, 375, 9375, false),
  ('GROUND'::public.element_type, 'steelix', 14, 400, 10000, false),
  ('GROUND'::public.element_type, 'piloswine', 15, 425, 10625, false),
  ('GROUND'::public.element_type, 'donphan', 16, 450, 11250, false),
  ('GROUND'::public.element_type, 'phanpy', 17, 475, 11875, false),
  ('GROUND'::public.element_type, 'marowak', 18, 500, 12500, false),
  ('GROUND'::public.element_type, 'rhydon', 19, 500, 12500, false),
  ('GROUND'::public.element_type, 'pupitar', 20, 500, 12500, false),
  ('GROUND'::public.element_type, 'nidoqueen', 21, 500, 12500, false),
  ('GROUND'::public.element_type, 'nidoking', 22, 500, 12500, false),
  ('GROUND'::public.element_type, 'golem', 23, 500, 24500, true),
  ('FLYING'::public.element_type, 'spearow', 0, 50, 1250, false),
  ('FLYING'::public.element_type, 'natu', 1, 75, 1875, false),
  ('FLYING'::public.element_type, 'pidgey', 2, 100, 2500, false),
  ('FLYING'::public.element_type, 'zubat', 3, 125, 3125, false),
  ('FLYING'::public.element_type, 'hoothoot', 4, 150, 3750, false),
  ('FLYING'::public.element_type, 'gyarados', 5, 175, 4375, false),
  ('FLYING'::public.element_type, 'doduo', 6, 200, 5000, false),
  ('FLYING'::public.element_type, 'hoppip', 7, 225, 5625, false),
  ('FLYING'::public.element_type, 'gligar', 8, 250, 6250, false),
  ('FLYING'::public.element_type, 'delibird', 9, 275, 6875, false),
  ('FLYING'::public.element_type, 'pidgeotto', 10, 300, 7500, false),
  ('FLYING'::public.element_type, 'fearow', 11, 325, 8125, false),
  ('FLYING'::public.element_type, 'golbat', 12, 350, 8750, false),
  ('FLYING'::public.element_type, 'farfetch_d', 13, 375, 9375, false),
  ('FLYING'::public.element_type, 'aerodactyl', 14, 400, 10000, false),
  ('FLYING'::public.element_type, 'ledyba', 15, 425, 10625, false),
  ('FLYING'::public.element_type, 'murkrow', 16, 450, 11250, false),
  ('FLYING'::public.element_type, 'mantine', 17, 475, 11875, false),
  ('FLYING'::public.element_type, 'noctowl', 18, 500, 12500, false),
  ('FLYING'::public.element_type, 'togetic', 19, 500, 12500, false),
  ('FLYING'::public.element_type, 'xatu', 20, 500, 12500, false),
  ('FLYING'::public.element_type, 'skiploom', 21, 500, 12500, false),
  ('FLYING'::public.element_type, 'scyther', 22, 500, 12500, false),
  ('FLYING'::public.element_type, 'yanma', 23, 500, 12500, false),
  ('FLYING'::public.element_type, 'skarmory', 24, 500, 12500, false),
  ('FLYING'::public.element_type, 'dodrio', 25, 500, 12500, false),
  ('FLYING'::public.element_type, 'ledian', 26, 500, 12500, false),
  ('FLYING'::public.element_type, 'charizard', 27, 500, 12500, false),
  ('FLYING'::public.element_type, 'butterfree', 28, 500, 12500, false),
  ('FLYING'::public.element_type, 'pidgeot', 29, 500, 12500, false),
  ('FLYING'::public.element_type, 'dragonite', 30, 500, 12500, false),
  ('FLYING'::public.element_type, 'crobat', 31, 500, 12500, false),
  ('FLYING'::public.element_type, 'jumpluff', 32, 500, 29000, true),
  ('PSYCHIC'::public.element_type, 'slowpoke', 0, 50, 1250, false),
  ('PSYCHIC'::public.element_type, 'natu', 1, 75, 1875, false),
  ('PSYCHIC'::public.element_type, 'unown', 2, 100, 2500, false),
  ('PSYCHIC'::public.element_type, 'drowzee', 3, 125, 3125, false),
  ('PSYCHIC'::public.element_type, 'exeggcute', 4, 150, 3750, false),
  ('PSYCHIC'::public.element_type, 'girafarig', 5, 175, 4375, false),
  ('PSYCHIC'::public.element_type, 'abra', 6, 200, 5000, false),
  ('PSYCHIC'::public.element_type, 'wobbuffet', 7, 225, 5625, false),
  ('PSYCHIC'::public.element_type, 'smoochum', 8, 250, 6250, false),
  ('PSYCHIC'::public.element_type, 'slowbro', 9, 275, 6875, false),
  ('PSYCHIC'::public.element_type, 'kadabra', 10, 300, 7500, false),
  ('PSYCHIC'::public.element_type, 'hypno', 11, 325, 8125, false),
  ('PSYCHIC'::public.element_type, 'exeggutor', 12, 350, 8750, false),
  ('PSYCHIC'::public.element_type, 'starmie', 13, 375, 9375, false),
  ('PSYCHIC'::public.element_type, 'jynx', 14, 400, 10000, false),
  ('PSYCHIC'::public.element_type, 'xatu', 15, 425, 10625, false),
  ('PSYCHIC'::public.element_type, 'espeon', 16, 450, 11250, false),
  ('PSYCHIC'::public.element_type, 'slowking', 17, 475, 11875, false),
  ('PSYCHIC'::public.element_type, 'alakazam', 18, 500, 22000, true),
  ('BUG'::public.element_type, 'caterpie', 0, 50, 1250, false),
  ('BUG'::public.element_type, 'weedle', 1, 75, 1875, false),
  ('BUG'::public.element_type, 'paras', 2, 100, 2500, false),
  ('BUG'::public.element_type, 'pineco', 3, 125, 3125, false),
  ('BUG'::public.element_type, 'venonat', 4, 150, 3750, false),
  ('BUG'::public.element_type, 'ledyba', 5, 175, 4375, false),
  ('BUG'::public.element_type, 'spinarak', 6, 200, 5000, false),
  ('BUG'::public.element_type, 'heracross', 7, 225, 5625, false),
  ('BUG'::public.element_type, 'metapod', 8, 250, 6250, false),
  ('BUG'::public.element_type, 'kakuna', 9, 275, 6875, false),
  ('BUG'::public.element_type, 'parasect', 10, 300, 7500, false),
  ('BUG'::public.element_type, 'forretress', 11, 325, 8125, false),
  ('BUG'::public.element_type, 'scizor', 12, 350, 8750, false),
  ('BUG'::public.element_type, 'scyther', 13, 375, 9375, false),
  ('BUG'::public.element_type, 'pinsir', 14, 400, 10000, false),
  ('BUG'::public.element_type, 'yanma', 15, 425, 10625, false),
  ('BUG'::public.element_type, 'venomoth', 16, 450, 11250, false),
  ('BUG'::public.element_type, 'ledian', 17, 475, 11875, false),
  ('BUG'::public.element_type, 'ariados', 18, 500, 12500, false),
  ('BUG'::public.element_type, 'butterfree', 19, 500, 12500, false),
  ('BUG'::public.element_type, 'beedrill', 20, 500, 23000, true),
  ('ROCK'::public.element_type, 'geodude', 0, 50, 1250, false),
  ('ROCK'::public.element_type, 'graveler', 1, 75, 1875, false),
  ('ROCK'::public.element_type, 'onix', 2, 100, 2500, false),
  ('ROCK'::public.element_type, 'rhyhorn', 3, 125, 3125, false),
  ('ROCK'::public.element_type, 'omanyte', 4, 150, 3750, false),
  ('ROCK'::public.element_type, 'kabuto', 5, 175, 4375, false),
  ('ROCK'::public.element_type, 'corsola', 6, 200, 5000, false),
  ('ROCK'::public.element_type, 'aerodactyl', 7, 225, 5625, false),
  ('ROCK'::public.element_type, 'sudowoodo', 8, 250, 6250, false),
  ('ROCK'::public.element_type, 'larvitar', 9, 275, 6875, false),
  ('ROCK'::public.element_type, 'omastar', 10, 300, 7500, false),
  ('ROCK'::public.element_type, 'kabutops', 11, 325, 8125, false),
  ('ROCK'::public.element_type, 'magcargo', 12, 350, 8750, false),
  ('ROCK'::public.element_type, 'rhydon', 13, 375, 9375, false),
  ('ROCK'::public.element_type, 'pupitar', 14, 400, 10000, false),
  ('ROCK'::public.element_type, 'golem', 15, 425, 10625, false),
  ('ROCK'::public.element_type, 'tyranitar', 16, 450, 19750, true),
  ('GHOST'::public.element_type, 'gastly', 0, 50, 1250, false),
  ('GHOST'::public.element_type, 'misdreavus', 1, 75, 1875, false),
  ('GHOST'::public.element_type, 'haunter', 2, 100, 2500, false),
  ('GHOST'::public.element_type, 'gengar', 3, 125, 5125, true),
  ('DRAGON'::public.element_type, 'dratini', 0, 50, 1250, false),
  ('DRAGON'::public.element_type, 'dragonair', 1, 75, 1875, false),
  ('DRAGON'::public.element_type, 'dragonite', 2, 100, 2500, false),
  ('DRAGON'::public.element_type, 'kingdra', 3, 125, 5125, true),
  ('DARK'::public.element_type, 'murkrow', 0, 50, 1250, false),
  ('DARK'::public.element_type, 'houndour', 1, 75, 1875, false),
  ('DARK'::public.element_type, 'umbreon', 2, 100, 2500, false),
  ('DARK'::public.element_type, 'houndoom', 3, 125, 3125, false),
  ('DARK'::public.element_type, 'sneasel', 4, 150, 3750, false),
  ('DARK'::public.element_type, 'tyranitar', 5, 175, 7375, true),
  ('STEEL'::public.element_type, 'magnemite', 0, 50, 1250, false),
  ('STEEL'::public.element_type, 'magneton', 1, 75, 1875, false),
  ('STEEL'::public.element_type, 'forretress', 2, 100, 2500, false),
  ('STEEL'::public.element_type, 'steelix', 3, 125, 3125, false),
  ('STEEL'::public.element_type, 'scizor', 4, 150, 3750, false),
  ('STEEL'::public.element_type, 'skarmory', 5, 175, 7375, true),
  ('FAIRY'::public.element_type, 'cleffa', 0, 50, 1250, false),
  ('FAIRY'::public.element_type, 'igglybuff', 1, 75, 1875, false),
  ('FAIRY'::public.element_type, 'togepi', 2, 100, 2500, false),
  ('FAIRY'::public.element_type, 'marill', 3, 125, 3125, false),
  ('FAIRY'::public.element_type, 'snubbull', 4, 150, 3750, false),
  ('FAIRY'::public.element_type, 'togetic', 5, 175, 4375, false),
  ('FAIRY'::public.element_type, 'azumarill', 6, 200, 5000, false),
  ('FAIRY'::public.element_type, 'wigglytuff', 7, 225, 5625, false),
  ('FAIRY'::public.element_type, 'clefairy', 8, 250, 6250, false),
  ('FAIRY'::public.element_type, 'jigglypuff', 9, 275, 6875, false),
  ('FAIRY'::public.element_type, 'granbull', 10, 300, 7500, false),
  ('FAIRY'::public.element_type, 'clefable', 11, 325, 14125, true)
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
