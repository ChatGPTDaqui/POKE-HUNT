# Colisão pelo chão dos fundos novos

Ferramenta usada nas ondas de fundos próprios dos sub-biomas e salas especiais
(8.27 a 8.30, 17/10/2026). Ela gera a referência pintada em
`scripts/body-block-refs/<chave>.png`: rosa onde o POKE anda, círculo amarelo
no spawn. Depois quem converte em grade é `scripts/build-sub-bioma-collision.js`.

A regra do dono é que o POKE anda **só no chão**. Ele não passa por árvore,
pedra, cerca, parede, túmulo, móvel nem água, e chega por uma entrada (porta,
escada, trilha, píer), nunca no meio do mapa.

## Fluxo para um mapa novo

As artes chegam do dono em `Downloads/sub-biomas/<chave>.png`. São JPEG de
1024 px com extensão `.png`; o script amplia 2× por vizinho mais próximo.

1. Gere a prévia com grade (32 px na escala 512):
   `node scripts/colisao-pelo-chao/previa-grade.cjs <repo> <saida> chave1,chave2`
2. Escreva a config do mapa num `mapas-chao-N.cjs`, com coordenadas na escala
   512. Os campos estão descritos abaixo.
3. Rode e revise **mapa por mapa** (as prévias saem em 768):
   `node scripts/colisao-pelo-chao/pintar.cjs <repo> <saida> chave1,chave2`
4. Ajuste e repita. Para medir a cor de um ponto, use
   `node scripts/colisao-pelo-chao/sonda.cjs <repo> <chave> x,y ...`
5. Com tudo certo, grave com `--escrever`. Isso grava a arte em
   `assets/hunt-backgrounds/<chave>.jpg` e a referência.
6. Registre o mapa nos quatro lugares abaixo, rode
   `node scripts/build-sub-bioma-collision.js` e mostre a montagem ao dono antes
   de publicar.
   - `ARTE` e `bg` do sub-bioma em `src/data/biomas.ts`
   - `REFS` em `build-sub-bioma-collision.js`
   - `PRESET_POR_ARTE` em `src/render/ambiente.ts`
   - as duas listas de `src/data/walkBlock.test.ts`

## Campos da config (escala 512)

- `rects` / `polys`: região onde o chão pode existir.
- `tirar`: retângulos que nunca são chão (objetos que a cor não separa).
- `forcar`: retângulos sempre chão (ponte, escada, porta).
- `chao`: pontos-semente de chão; vale a cor média de cada um. Também há
  `tol` (distância de cor) e `desvio` (variação máxima dentro do bloco).
- `regra(r, g, b, desvio)`: substitui as sementes por uma regra de cor.
  `() => true` serve para interior liso.
- `semAgua`: descarta blocos azuis.
- `semContorno`: desliga a barreira de contorno escuro (mapas escuros e
  interiores).
- `contorno`, `contornoFator`, `maxEscuro`: ajustes da barreira de contorno.
- `fechar`: costura bordas finas entre dois chãos (0 desliga).
- `abertura`: remove fiapos e frestas.
- `buraco`: tamanho máximo de buraco que é preenchido.
- `spawn`: ponto de chegada, numa entrada.

`mapas-v2.cjs` guarda os ajustes da revisão de 17/10 por cima das ondas 1 e 2.

## Lições

- Só a cor não basta. Cercas finas, ressaltos, túmulos e lanternas precisam de
  `tirar`, e escadas costumam precisar de `forcar`.
- O componente ligado ao spawn é o que vale: ilha de chão atrás de parede cai
  fora sozinha.
- Uma `tirar` grande pode desconectar uma área legítima. Confira se algo sumiu.
