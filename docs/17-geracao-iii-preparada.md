# Geração III — preparada em PH-146, ligada em PH-332

> **ESTADO: LIGADA em 2026-08-31 (PH-332).** O elenco do jogo passou de 245 para
> 380 espécies e `DEX_MAX_PADRAO` de 251 para 386. O que está abaixo desta linha
> é o registro de como o trabalho foi PREPARADO (PH-146) — mantido porque a
> preparação é o que explica cada decisão. O que a ativação encontrou **além do
> plano** está na seção "O que o plano não previu", no fim, e é a parte que
> interessa para a próxima geração.

---

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

---

## O que o plano não previu (PH-332)

Os 10 passos acima foram seguidos. Cinco coisas apareceram no caminho, e nenhuma
delas dava erro — as cinco falhavam em silêncio, que é o modo de falha que esta
área toda tem. Registradas aqui na ordem do estrago.

### 1. Os 10 lendários de Hoenn entraram em hunt COMUM

Não existe flag de lendário em `scripts/usum/catalog.json` nem em
`pokes.generated.ts`. A exclusão vive em três listas escritas à mão, e a ativação
mexeu em uma só. Medido na primeira rodada de `usum:gerar` com a arte importada:

```
Geleira (Lv 52-62):          ... SPHEAL, SEALEO, WALREIN, REGICE
Fábrica (Lv 52-62):          ... BELDUM, METANG, METAGROSS, REGISTEEL, JIRACHI
Ruínas Ancestrais (80-105):  ... BAGON, SHELGON, SALAMENCE, LATIAS, LATIOS, RAYQUAZA
Torre Mística (60-70):       ... SPOINK, GRUMPIG, CHIMECHO, WYNAUT, DEOXYS
```

Rayquaza como encontro de rotina. As três listas:

| lista | arquivo | o que ela decide |
| --- | --- | --- |
| `LEGENDARY_SPECIES_IDS` | `src/data/legendaries.ts` | quem ganha hunt BOSS própria, e quem sorteia 3 IVs perfeitos |
| `LEGENDARY_SHEET_KEYS` | `scripts/sync-planilha.js` | quem fica FORA das pools de hunt |
| `LENDARIOS` | `scripts/gerar-subbiomas.mjs` | quem fica fora dos sub-biomas |

`src/data/lendariosEmDuasListas.test.ts` compara as três agora. Sem ele, a
próxima geração repete isto — e a terceira lista só se manifestou porque o
gerador de sub-biomas ESTOURA quando uma espécie elegível não tem casa
(`jirachi`, `deoxys`); se o PokeRogue tivesse dado bioma aos dez, ninguém saberia.

**Consequência de produto:** as 10 entraram em `LEGENDARY_SPECIES_IDS`, e por
isso ganharam hunt BOSS própria de graça — `buildBossHunts` é derivado da lista e
o fundo por tipo cobre os 18. **As hunts BOSS passaram de 11 para 21.**

### 2. O passo 5 não importava nada: arte e catálogo se travavam

O plano manda gerar o catálogo (4), importar a arte (5), gerar de novo (6).
Rodando exatamente isso, o passo 5 não importa nada, e a razão é circular:

```
pokes.generated.ts  <- usum:gerar  <- allSpeciesKeys  <- pools de hunt
                                                      <- ART_SPECIES_IDS
                                                         = assets/battle-sprites/
```

Sem arte, fora do catálogo gerado. `especiesDoCatalogo()` lê o catálogo gerado,
não acha as 135, nada é importado, continua sem arte. Medido: depois de
`usum:baixar` e `usum:gerar`, `catalog.json` tinha 386 espécies e
`pokes.generated.ts` tinha 245.

A saída **não** é desligar o filtro de arte por uma rodada (isso põe 135 espécies
em pool com forma geométrica, que é o que aquele filtro existe para impedir). É
importar a arte a partir da FONTE do catálogo:

```bash
npm run especies:importar -- --faixa-dex=252-386 --acervo="<checkout do SpriteCollab>"
```

`--faixa-dex` é novo (`especiesDaFaixa`) e lê `scripts/usum/catalog.json`, que já
tem `chave` e `dex` das 386 e não depende de arte nenhuma. O modo antigo (sem a
flag) continua igual.

### 3. Azurill quebrou a linha do Marill — e o defeito era mais velho que ela

`nivelDeTroca` (`huntSpawnOverrides.ts`) tem dois ramos: evolução ESPECIAL empurra
o alvo para o piso da faixa seguinte; evolução por NÍVEL usa o nível do catálogo.
Ninguém tinha visto uma linha em que o primeiro estágio é especial e o segundo é
por nível baixo — antes da Gen III não existia.

Azurill evolui por amizade (vira especial, empurra Marill para Lv31) e Marill
evolui em Lv18. Resultado: Marill ficava com a sub-faixa `[31, 17]`, vazia em toda
faixa, e **desaparecia do jogo**; e Azumarill entrava em Lv18-30 na mesma hunt em
que Azurill estava em Lv1-30. As duas guardas de `hunts.test.ts` pegaram as duas
metades.

A correção põe um TETO no empurrão: quando o alvo evolui por nível e esse nível é
menor que o piso da faixa, o gatilho vira `ceil(gatilho / 2)` — Azurill `[1,8]`,
Marill `[9,17]`, Azumarill `[18,30]`. A alternativa (`gatilho - 1`) também passa
nos testes e dá a Marill um ÚNICO nível de janela, que na prática é a espécie não
existir.

### 4. Duas tabelas geradas ficaram velhas em silêncio, e uma delas era de preço

- **`custoEspecialidade.generated.ts`** escala com a OFERTA de Stone por tipo, e a
  oferta é medida sobre os `enemyPool` reais. 135 espécies novas mudaram a oferta
  de quase todo tipo. Sem regerar, o custo por tipo ia de 1,01x de diferença para
  **15,5x** (STEEL a 1.880 abates, POISON a 29.218). O comando regera a tabela E o
  par de migrations do mesmo laço:
  `npm run custo:especialidade` (ele pede `--carimbo=YYYYMMDDHHMMSS`).
- **`faceEmocoes.generated.ts`** — 1.671 arquivos novos, 148 faces vindas de
  expressão substituta.

### 5. Dois testes de migration liam a PRIMEIRA, não a última

`custoDeEspecialidade.test.ts` e `todasAsEvolucoes.test.ts` localizavam a migration
por `find` / "é exatamente um par". Funcionou enquanto cada uma tinha um par só. A
Gen III foi a primeira vez que as duas precisaram de um SEGUNDO par, e o `find`
passou a comparar o módulo gerado (novo) com o SQL antigo — reprovando como se
cliente e servidor tivessem divergido. No banco quem manda é a última aplicada, e
é ela que os dois testes olham agora.

## As migrations que a ativação produziu

| par | o que faz |
| --- | --- |
| `20260831120000/1_especies_novas` | 135 espécies, 407 golpes, 1.864 linhas de learnset. `evolves_to` fica NULO |
| `20260831130000/1_custo_especialidade` | tabela de preço regerada com a oferta nova |
| `20260831140000/1_todas_as_evolucoes` | as arestas, incluindo as novas — 162 destinos únicos e 8 ramos |

A ordem é por FK e é obrigatória: golpes antes de espécies (por
`species_moves.move_id`), espécies antes das arestas (`evolves_to` é FK
auto-referente).

`scripts/gerar-migration-especies.mjs` é novo e existe porque
`npm run catalog:migrar` está bloqueado por `lib/guarda-catalogo-gen2.js` — o
passo 9 acima já nomeava as duas saídas, e esta é a segunda.

## Habilidades: o que a Gen III trouxe, e o que foi feito

19 habilidades novas apareceram no catálogo. **8 já estavam implementadas** e só
faltava texto (`air_lock`, `forecast`, `poison_heal`, `pure_power`, `rough_skin`,
`solid_rock`, `storm_drain`, `white_smoke`).

**5 foram implementadas nesta leva**, e duas delas por necessidade:

| habilidade | por que |
| --- | --- |
| `truant` | Slaking tem o maior BST do jogo (670). Sem o contrapeso, seria entregar o POKE mais forte do jogo como encontro de rotina |
| `wonder_guard` | Shedinja tem 1 de HP máximo. Sem ela, a espécie inteira é piada |
| `toxic_boost` | espelho do `guts`, que já existia |
| `simple` | dobra o delta de estágio; o teto de ±6 já existia |
| `heavy_metal` | **e `light_metal` junto** — ver abaixo |

**6 ficaram sem efeito, com motivo estrutural** em `MOTIVO_SEM_EFEITO`:
`color_change`, `protean` e `normalize` (o tipo é da ESPÉCIE, não da instância),
`minus` (não há aliado em campo), `stall` (não há ordem de turno), `wind_rider`
(o catálogo não marca golpe de vento).

**Achado de brinde:** `light_metal` estava em `MOTIVO_SEM_EFEITO` com a
justificativa *"Nenhum golpe daqui usa peso"* — e isso é **falso**. Low Kick,
Heavy Slam e Heat Crash leem peso desde sempre (`pesoEmKg`, `combatSystem.ts`). A
habilidade tinha 6 donos no elenco antigo e nunca fez nada, com um motivo escrito
que não se sustentava. As duas agora leem a habilidade no mesmo ponto.

40 golpes novos ganharam descrição em português (`moveDescriptions.ts`).

## Decisões de conteúdo, com o que as sustenta

**Iniciais de Hoenn (Treecko/Torchic/Mudkip) ENTRAM no mato.** O passo 1 acima
supunha que a regra do jogo é "inicial não é selvagem", e ela não é: a exclusão
(`INICIAIS_BASE` / `STARTER_SHEET_KEYS`) cobre só **Charmander, Squirtle e
Bulbasaur**, que são os três que a tela de escolha oferece
(`StartScreen.tsx#STARTER_SPECIES_IDS`). Chikorita, Cyndaquil e Totodile são
selvagens hoje. A regra real é "o que o jogador pode ESCOLHER não aparece no
mato" — e os de Hoenn não são escolhíveis.

**Shedinja e Wurmple ficam como o catálogo gerou.** Ninjask no nível 20 e Shedinja
como evolução especial (nível 80 + 40 pedras de INSETO); Silcoon e Cascoon os dois
no nível 7, escolha do jogador. É o gate do PH-145 e o modelo de ramo do PH-139,
sem exceção nova.

## O que continua aberto

- **`height_m` das 135 fica NULL.** O catálogo de Ultra Sun traz peso, não altura,
  e `pokeHeights.ts` é escrito à mão. Nada no jogo lê altura hoje
  (`scaleForSpecies` devolve 1), mas é dado faltando.
- **`scripts/usum/catalog-gen3.json` virou redundante** — ele e `catalog.json`
  agora têm as mesmas 386 espécies. Fica como registro da leva que o produziu;
  `recorteDaPokedex.test.ts` continua garantindo que nada em `src/` o importa.
- **A divergência de mapa de pré-evolução** entre `evolutionStage.ts` e
  `huntSpawnOverrides.ts`, registrada na seção "Divergência encontrada ao medir",
  continua como estava. Wurmple, Nincada e Clamperl são três ramos novos que
  aumentam a exposição a ela, e `zonaMinimaDaEspecie` continua sendo o que segura.
