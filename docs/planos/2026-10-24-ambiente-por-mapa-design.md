# Vida nos mapas, um mapa por vez — design (24/10/2026)

Pedido do dono: dar vida aos fundos (luz, água mexendo, pingo, fogo...) tratando
**cada mapa como uma tarefa própria, em cascata**, e conferir a **proporção**
da arte com os sprites (POKE ~40 u, treinador 30 u de corpo), mudando a escala
do mapa se preciso. Decisões do dono: **sem aprovação prévia por mapa** (revisão
no jogo depois de cada lote); ordem **pelos mais jogados**.

## O que já existe (não reinventar)

| Camada | Arquivo | Cobertura em 24/10 |
|---|---|---|
| Partículas por preset (folha, brasa, poeira, neve, areia, gotejo) | `src/render/ambiente.ts` | 83 artes |
| Props ancorados (tocha, fogueira, chaminé, fumarola, gás, orbe, cascata, correnteza, quebra-mar, elétrica, vagalume, pétala) | `src/render/ambienteProps.ts` + `src/data/ancorasDeAmbiente.ts` (u,v da arte) | 18 artes |
| Máscara de água (ondulação só na água) | `scripts/build-agua-mask.js` ← `scripts/agua-refs/*.png` | 5 artes |
| Máscara de lava | `scripts/build-lava-mask.js` ← `scripts/lava-refs/` | poucas |

Invariante: nada disso toca `world.rng` nem o `WorldState` (gerador próprio,
semeado pela URL da arte).

## A tarefa de cada mapa

1. **Olhar a arte inteira** e listar o que o desenho promete: fogo, lampião,
   janela, água, cachoeira, vapor, cristal, neon, fumaça...
2. **Proporção**: comparar porta/escada/árvore/casa com o treinador (30 u) e o
   POKE (40 u). A escala hoje é única (`HUNT_BG_TILE_SCALE = 0,8`). Se o mapa
   destoar, ganha escala própria no build de colisão — que regenera bounds,
   grade e spawn (a grade é usada pelo servidor: rebuild do bundle da Edge) e as
   máscaras de água/lava. Âncoras são u,v e não mudam.
3. **Implementar**: âncoras do mapa; máscara de água/lava quando houver água/lava
   (referência derivada da cor da arte quando a água for inconfundível, conferida
   à mão); preset de partícula revisto; **tipo de prop novo só quando o mapa
   pedir** — candidatos: borboleta (campina/flor), raio de sol (clareira), janela
   acesa que pisca (vilarejo noturno), bolha (pântano, fonte termal), neon
   (cidade), névoa rasteira (cachoeira, pântano).
4. **Conferir no fundo real**, no tamanho de jogo, com custo por quadro
   (orçamento: < 1 ms no pior caso, como os props atuais).
5. **Commit do mapa**; promoção em **lotes** (~5 mapas), com revisão do dono
   no jogo.

## Ordem (dados de `game_sessions` em prod, 24/10)

1. Rota 46 — `forest.jpg`
2. Campo Aberto — planície, campina, mato alto (+ salas)
3. Sombrio, Urbano, Mata, Industrial, Ígneo, Marinho, Sagrado, Áridos,
   Gélido, Subterrâneo, Águas Interiores
4. Salas especiais (5%) e o resto do acervo

## Testes

- âncora dentro da arte (u,v ∈ [0,1]) e tipo conhecido (teste existente);
- máscara regenerada bate com a referência (script);
- escala própria: colisão/spawn regenerados e bundle da Edge byte a byte;
- nada do ambiente consome `world.rng` (testes existentes de `ambiente`).
