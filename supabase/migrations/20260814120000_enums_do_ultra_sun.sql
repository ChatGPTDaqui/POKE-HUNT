-- Valores de enum novos, sozinhos num arquivo.
--
-- POR QUE SEPARADO: `alter type ... add value` e a insercao que USA o valor novo
-- nao cabem na mesma transacao. O Postgres aceita o ALTER dentro de um bloco,
-- mas rejeita qualquer uso do valor recem-adicionado ali mesmo
-- ("unsafe use of new value of enum type"). Cada arquivo de migration roda na
-- sua propria transacao, entao os inserts ficam no arquivo seguinte
-- (20260814120100).
--
-- FAIRY: a base de dados do jogo passou a ser Pokemon Ultra Sun (Gen VII), que
-- tem 18 tipos. Sem este valor, `stone_fairy` nao pode existir na tabela `items`
-- — e sem `stone_fairy` toda conta que matasse um POKE de tipo Fada travava
-- (ver a nota de bug em 20260814120100).
alter type element_type add value if not exists 'FAIRY';

-- status_heal: familia de item nova (Antidote, Awakening, Burn Heal, Ice Heal,
-- Paralyze Heal, Full Heal). Campo proprio em vez de reaproveitar 'potion':
-- o auto-item ordena pocoes por HP curado, e um item que cura 0 de HP entraria
-- naquela ordenacao como a "pior pocao" e seria escolhido no lugar errado.
alter type item_kind add value if not exists 'status_heal';
