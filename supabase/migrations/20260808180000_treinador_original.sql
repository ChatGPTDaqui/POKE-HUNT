-- Treinador original: quem capturou o POKE, gravado no momento da captura.
--
-- Por que uma coluna nova em vez de derivar de `players.trainer_name` pelo
-- `user_id`: o nome do dono responde "de quem e agora", e o nome pode ser
-- trocado depois. O registro de captura precisa ser imutavel — e o unico dado
-- que sobrevive a uma renomeacao, e o unico que continuaria correto se algum
-- dia existir troca entre jogadores (nao existe hoje).
--
-- Nullable de proposito: POKE criado antes desta migration nao tem como saber
-- quem o capturou de verdade. O backfill abaixo usa o nome do dono ATUAL, que
-- e a melhor aproximacao possivel enquanto nao ha troca — mas linha nova
-- continua podendo nascer sem valor (ex.: um caminho de criacao futuro que
-- esqueca de preencher), e a UI trata ausencia em vez de mostrar "null".
alter table public.pokemon_instances
  add column if not exists original_trainer text;

-- Backfill: sem troca no jogo, o dono atual E quem capturou. Uma vez so; a
-- partir daqui quem grava e a captura.
update public.pokemon_instances pi
set original_trainer = p.trainer_name
from public.players p
where pi.user_id = p.user_id
  and pi.original_trainer is null;
