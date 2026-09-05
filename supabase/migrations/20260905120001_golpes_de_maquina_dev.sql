-- PAR DEV de 20260905120000_golpes_de_maquina_public.sql.
-- Gerado a partir dele trocando `public.` por `dev.`. Ver
-- docs/11-operacao.md#fluxo-de-mudanca-de-schema.
--
-- PH-512 — `pokemon_instances.golpes_de_maquina`, os golpes que ESTE POKE
-- aprendeu por TM/HM.
--
-- O raciocinio inteiro (por que coluna propria e nao soma em
-- `unlocked_abilities`; por que `text[]` e nao `jsonb`; por que sem indice; e
-- por que esta migration viaja sozinha na PR) esta no arquivo `_public`, que e
-- o original. Nao duplicado aqui de proposito: dois textos longos que precisam
-- concordar acabam divergindo, e o par so difere no schema.
begin;

alter table dev.pokemon_instances
  add column if not exists golpes_de_maquina text[] not null default '{}';

comment on column dev.pokemon_instances.golpes_de_maquina is
  'Ids de golpe que este POKE aprendeu por TM/HM (PH-512). Fonte, nao derivada: '
  'ao contrario de unlocked_abilities, que pokeToRow reescreve a cada flush a '
  'partir de (especie, nivel). Guarda a ORIGEM, que e o que permite mostrar o '
  'golpe em cor diferente na lista. So a RPC de ensinar escreve aqui.';

commit;
