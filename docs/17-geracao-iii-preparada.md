# Geração III preparada, e o que falta para ligá-la

**Estado: PREPARADA, NÃO LIGADA.** As 135 espécies de Hoenn (dex 252–386) têm
catálogo, peso de spawn, distribuição planejada e arte conferida. Nenhuma delas
aparece no jogo — não em hunt, não na Pokédex, não na loja, não em spawn.

Preparada em 2026-08-24, PH-146.

## Por que existe um estado intermediário

Ligar uma geração inteira é uma mudança de conteúdo com muitas partes que falham
em silêncio: espécie sem arte não entra nas hunts e ninguém é avisado
(`sync-planilha.js#ART_SPECIES_IDS`); espécie sem peso de spawn cai no fallback
"incomum" e a raridade real some; espécie sem sub-bioma existe na Pokédex e nunca
no mato. Nenhuma dessas falhas dá erro.

Separar "preparar" de "ligar" é o que permite conferir cada uma delas com o jogo
funcionando — em vez de descobrir na tela, depois.

## A trava

`scripts/fetch-usum-catalog.js#DEX_MAX_PADRAO` continua em **251**. O recorte
virou parâmetro (`--dex-max`), e mudá-lo **sem** `--saida` é erro, não aviso:

```
$ node scripts/fetch-usum-catalog.js --dex-max=386
Error: --dex-max=386 muda o elenco do jogo inteiro (o padrao e 251).
```

Sem essa trava, um comando distraído sobrescreveria `catalog.json` e o próximo
`npm run usum:gerar` poria 135 espécies em produção. `recorteDaPokedex.test.ts`
guarda o padrão, o número de espécies do jogo (245) e o fato de que nada em
`src/` importa o catálogo de preparação.

## O que já existe

| artefato | onde | o que é |
| --- | --- | --- |
| Catálogo | `scripts/usum/catalog-gen3.json` | 386 espécies (as 251 + 135), stats/tipos/movesets/habilidades resolvidos para o Ultra Sun, e as cadeias de evolução com o mesmo gate de PH-145. `_recorte.padrao: false` marca que o jogo não lê. |
| Peso de spawn | `scripts/spawn-tiers-gen3.json` | Tier das 135, derivado dos encontros reais de `pret/pokeemerald`. |
| Distribuição | `scripts/usum/distribuicao-gen3.json` | Por espécie: bioma, sub-bioma, faixa de nível, intervalo de nível, tier e peso. |
| Cobertura de arte | `npm run gen3:arte` | Medição por tipo de asset, com os buracos nomeados. |

Comandos: `npm run gen3:catalogo`, `npm run gen3:tiers`, `npm run gen3:relatorio`,
`npm run gen3:arte`.

## O que a distribuição diz

135 espécies, todas as não-lendárias com pelo menos um sub-bioma. Por bioma:

```
campo_aberto 38 · mata 24 · subterraneo 18 · sombrio 18 · aridos 18
marinho 16 · sagrado 14 · aguas_interiores 13 · igneo 11 · industrial 10
urbano 9 · gelido 6
```

Por faixa: I (Lv 1–30) 69 · II (Lv 31–60) 83 · III (Lv 61–90) 76 — uma espécie
conta em mais de uma faixa quando o estágio dela é o correto em ambas.

Por tier: `muito_comum` 26 · `comum` 18 · `incomum` 20 · `raro` 38 ·
`muito_raro` 33. **69 medidas em Emerald, 66 por regra** (10 lendários + 56 sem
encontro selvagem em Hoenn nenhuma — formas evoluídas por pedra, fósseis,
Beldum). A proporção é comparável à do elenco atual (150 medidas / 94 por regra).

### Peso de spawn: a fonte, e por que outra

`scripts/derive-spawn-tiers.js` lê três disassemblies em **assembly** de Game Boy
(`pret/pokecrystal`, `pokegold`, `pokered`) e tem um parser de `.asm` por tipo de
encontro. A Gen III é outra máquina: `pret/pokeemerald` publica os encontros em
JSON estruturado, com as taxas de cada slot declaradas no próprio arquivo.
Enfiar os dois no mesmo script seriam dois parsers sem nada em comum atrás da
mesma flag — daí `derive-spawn-tiers-gen3.mjs` separado.

O que os dois **compartilham** é a escala: os mesmos cinco tiers (30/20/10/5/1),
os mesmos cortes de chance, a mesma regra de fallback por estágio evolutivo. Isso
está duplicado de propósito e comentado nos dois lados. Divergir ali não daria
erro — daria um jogo em que uma geração inteira aparece mais que a outra sem que
nada explique.

Ficam de fora as tabelas de instalação do Emerald (`gBattlePyramid...`,
`gBattlePike...`): são desafios pós-jogo com elenco curado, e a chance ali não
tem relação com raridade no mundo.

## Cobertura de arte

Medido contra o checkout local do PMDCollab/SpriteCollab:

| asset | cobertura |
| --- | --- |
| `sprite/<dex>/AnimData.xml` | **135/135** |
| `portrait/<dex>/Normal.png` | **135/135** |
| `portrait/<dex>/0000/0001/Normal.png` (shiny) | **135/135** |
| `gen5ani/` e `gen5ani-shiny/` | **135/135** (já no repositório) |
| 7 faces de emoção | 116/135 |

**Nada bloqueia.** As 19 sem faces de emoção completas (12 com zero, 7 parciais)
caem na face neutra por desenho — `faceEmotions.ts#faceEmocaoUrl` nunca devolve
caminho que não existe em disco. É o mesmo buraco que o elenco atual já tem em 29
das 245, e é conteúdo, não código.

A importação **não foi feita**: são ~4.000 arquivos, e commitar peso no repositório
por um dado que ainda não é usado é o tipo de coisa que ninguém desfaz depois.

## O que ligar exige, em ordem

A ordem importa. Cada passo depende do anterior, e fazer fora de ordem falha em
silêncio — a coluna da direita diz como.

| # | passo | se fizer fora de ordem |
| --- | --- | --- |
| 1 | Decidir os três iniciais de Hoenn (Treecko/Torchic/Mudkip): entram no mato ou ficam só na tela de escolha, como os de Kanto? | Sem decidir, eles entram no mato por omissão — e a regra do jogo hoje é o oposto. |
| 2 | Fundir `spawn-tiers-gen3.json` em `spawn-tiers.json` | Sem isso as 135 caem no fallback `DEFAULT_WEIGHT = 10` e a raridade medida no Emerald é jogada fora, sem aviso. |
| 3 | `DEX_MAX_PADRAO` 251 → 386, e atualizar `recorteDaPokedex.test.ts` | O teste reprova — de propósito. Ele é a confirmação de que a mudança foi deliberada. |
| 4 | `npm run usum:baixar` e `npm run usum:gerar` | — |
| 5 | `npm run especies:importar -- --acervo=<pasta>` | O importador varre `pokes.generated.ts` e pula quem não está lá. Antes do passo 4 ele não importa nada e não reclama. |
| 6 | `npm run usum:gerar` de novo | A curadoria de hunts filtra por `assets/battle-sprites/`, lida em tempo de carga do módulo. Rodar só uma vez deixa as 135 fora de todos os pools — foi exatamente o que aconteceu em PH-145 com as 19. |
| 7 | `npm run subbiomas:gerar` | Sem isso as espécies existem no catálogo e não têm casa: `hunts.test.ts` reprova em "toda especie selvagem tem pelo menos uma hunt". |
| 8 | `npm run faces:emocao` | — |
| 9 | Migration do par `_public`/`_dev`: inserir as 135 em `species`, `species_moves` e as arestas de evolução | O banco recusa `species_id` que não existe (`23503`) na primeira captura. `npm run evolucoes:migration` gera a parte das evoluções. |
| 10 | `npm run db:types` | `database.types.ts` desatualizado reprova o gate de CI. |

O passo 9 é o mais pesado e o menos automatizado: `scripts/migrate-catalog-to-postgres.js`
está **bloqueado** por `lib/guarda-catalogo-gen2.js` (ele escreveria o catálogo
de Gen2 por cima do de USUM). Ligar a geração exige ou destravar aquele caminho
com a fonte certa, ou gerar a migration como `gerar-migration-evolucoes.mjs` faz.

## Divergência encontrada ao medir, e não corrigida aqui

`src/data/evolutionStage.ts` e `src/data/huntSpawnOverrides.ts` montam mapas de
pré-evolução **diferentes**: o primeiro com todos os destinos (corrigido em
PH-139), o segundo só com `evolvesTo`.

A consequência: o **segundo destino de um ramo** não tem pré-evolução do ponto de
vista das hunts, então vira raiz da própria linha e ocupa a sub-faixa inteira, em
vez de esperar a origem deixar de ser o estágio correto. Hoje isso não produz
nada absurdo porque `zonaMinimaDaEspecie` — que usa o estágio certo — ainda barra
a espécie nas faixas baixas. Mas são duas respostas para "quem evolui em quem", e
a segunda existe por omissão.

Isso vale mais na Gen III que no elenco atual: Wurmple (Silcoon/Cascoon), Nincada
(Ninjask/Shedinja) e Clamperl (Huntail/Gorebyss) são três ramos novos, contra os
cinco que existem hoje.

Está registrado e **não corrigido**: mudar aquele mapa move espécie de faixa no
elenco atual, o que é balanceamento, e balanceamento não entra de carona numa
issue de preparação. `relatorio-gen3.mjs` espelha o comportamento real dos dois
lados — `regraDeZonaEspelhada.test.ts` é quem garante isso.

## Fora de escopo, deliberadamente

- **Nincada → Shedinja saiu assimétrico, e isso precisa de decisão.** No catálogo
  gerado, `ninjask` é nível 20 e `shedinja` é evolução especial (nível 80 + 40
  pedras de INSETO) — porque a PokeAPI não declara gatilho de nível para
  Shedinja, e o gate de PH-145 trata "sem gatilho de nível" como pedra. Nos jogos
  Shedinja aparece *além* de Ninjask, se houver espaço no time e uma Poké Ball
  sobrando; aqui o modelo de ramo (PH-139) é "o jogador escolhe um". Ligar a
  geração exige decidir se os dois custam o mesmo ou se a assimetria fica.
- **Wurmple → Silcoon/Cascoon é aleatório** nos jogos (decidido por um valor
  escondido). Aqui saiu como os dois no nível 7, e vira escolha do jogador — que
  é o que o modelo de ramo faz.
- **Feebas → Milotic** depende de Beleza, que não existe aqui. Caiu no gate de
  evolução especial (nível 80 + 40 pedras), como toda evolução por pedra, troca
  ou amizade desde PH-145.
