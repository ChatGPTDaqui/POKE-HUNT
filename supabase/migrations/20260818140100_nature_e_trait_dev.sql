-- Par `dev` de 20260818140000_nature_e_trait_public.sql. Ver os comentarios de la:
-- este arquivo e o MESMO DDL no schema de teste, que precisa andar junto pra
-- testar em `dev` continuar valendo pra producao.
-- NATUREZA e HABILIDADE por POKE — os dois tracos individuais dos jogos que
-- este save nunca guardou. (O terceiro, a Caracteristica, e DERIVADO dos IVs e
-- por isso nao ganha coluna: ver src/data/characteristics.ts.)
--
-- POR QUE COLUNA, e nao derivado como `unlocked_abilities`: os dois sao
-- SORTEIOS por individuo, nao funcao de (especie, nivel). Dois Charmander do
-- mesmo nivel podem ter naturezas e habilidades diferentes, e e exatamente isso
-- que os torna individuais. Derivar do uuid daria estabilidade, mas amarraria
-- o traco a uma chave que existe por outro motivo — e mudaria o traco de todo
-- mundo se a derivacao fosse ajustada.
alter table dev.pokemon_instances
  add column if not exists nature text,
  add column if not exists trait text;

-- ---------------------------------------------------------------------------
-- BACKFILL NEUTRO, DE PROPOSITO
-- ---------------------------------------------------------------------------
-- Natureza mexe +10%/-10% em dois atributos. Sortear uma natureza REAL para os
-- POKEs que ja existem faria o time de todo jogador mudar de atributo da noite
-- pro dia, pra pior em metade dos casos, sem nada no jogo explicando por que.
--
-- As 5 naturezas NEUTRAS (o produto em que o atributo que sobe e o que desce
-- sao o mesmo) existem justamente pra isso: sao naturezas de verdade, contam na
-- ficha, e multiplicam tudo por 1. O POKE antigo fica com uma delas; todo POKE
-- criado a partir daqui sorteia entre as 25.
--
-- A escolha da neutra e estavel por linha (hash do uuid) e nao aleatoria: um
-- `random()` aqui daria natureza diferente a cada vez que alguem reaplicasse
-- a migration num ambiente novo.
update dev.pokemon_instances
set nature = (array['hardy', 'docile', 'serious', 'bashful', 'quirky'])[
  1 + (('x' || substr(md5(id::text), 1, 8))::bit(32)::bigint & 2147483647) % 5
]
where nature is null;

-- `trait` fica NULL de proposito no backfill. Diferente da natureza, o cliente
-- resolve a ausencia sozinho e SEM prejuizo: `traitDoPoke` (src/data/traits.ts)
-- cai no slot 1 da especie, que e a habilidade mais comum dela nos jogos. Um
-- backfill aqui teria que replicar a tabela de 226 especies dentro do SQL —
-- duas verdades pro mesmo dado, e a do banco envelheceria no proximo
-- `usum:gerar`. O valor e gravado na primeira vez que a linha for reescrita.

comment on column dev.pokemon_instances.nature is
  'Natureza (Gen III+): +10% num atributo, -10% em outro. NULL = tratado como neutra.';
comment on column dev.pokemon_instances.trait is
  'Habilidade passiva (o "Ability" dos jogos). NULL = cai no slot 1 da especie.';
