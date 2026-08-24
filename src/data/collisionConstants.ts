// Constantes da grade de colisao. Nao sao geradas — sao valores fixos
// compartilhados por dois lados que precisam concordar: o gerador
// (scripts/build-sub-bioma-collision.js, que LE este arquivo em vez de repetir
// os numeros) e todo consumidor de grade em runtime (pathfinding, movimento,
// maps.ts).
//
// Moravam em generated/collisionGrids.generated.ts (PH-56 removeu esse arquivo
// — sistema morto, superado por COLISAO_POR_ARTE), mas o valor em si nunca foi
// derivado de planilha nem de imagem.

/**
 * Tamanho de celula da grade de colisao, em unidades de mundo.
 *
 * ERA 40, e caiu pra 20 no PH-94.
 *
 * O motivo: a grade responde "o CENTRO do POKE pode estar aqui", e uma celula
 * e andavel quando `PINK_CELL_RATIO` da area dela esta pintada. Com celula de
 * 40 e o ratio de 0.3 que o gerador precisava usar, o centro do POKE podia
 * ficar ~28px DENTRO do que a arte mostra como parede — era isso que o jogador
 * via como "a pintura nao esta sendo respeitada", nas 31 artes.
 *
 * O ratio nao podia simplesmente subir: rua de cidade tem uma celula de 40 de
 * largura, e a 0.5 a poda por conectividade apagava 430 celulas (town-night
 * perdia 246 das 629). Medido no PH-94. Com celula de 20 a mesma rua tem duas
 * celulas, o ratio sobe pra 0.6 e a poda vai a ZERO nas sete artes urbanas —
 * a folga do centro na parede cai de ~28px pra ~8px.
 *
 * Custo aceito, decidido com o usuario: ver `POKE_COLLISION_FOOTPRINT`.
 */
export const COLLISION_GRID_CELL_SIZE = 20

/**
 * Pegada de colisao do POKE, em unidades de mundo — a caixa que precisa caber
 * em area andavel.
 *
 * ELA VALIA 40 ("exatamente 1 caixa da grade, por pedido explicito do
 * usuario", ver movementSystem.ts#canOccupy) enquanto a celula tambem valia
 * 40: os dois eram o mesmo numero e o pedido ficava satisfeito por acidente de
 * coincidencia, sem nenhum mecanismo por tras.
 *
 * O PH-94 mediu o que acontece ao honrar 40 de verdade — exigindo, na geracao,
 * que a caixa inteira caiba na tinta (erosao). Os corredores pintados sao mais
 * ESTREITOS que 40 na maior parte do jogo, e cinco artes zeram: jungle vai de
 * 33% de area andavel pra 1 celula, cave-volcanic pra 1, temple pra 2, town pra
 * 8, volcano pra 22. Ou seja: a pegada de 40 nunca foi honrada — quem pagava
 * por ela era a folga de parede do ratio 0.3, em silencio.
 *
 * Decisao tomada com o usuario: a pegada passa a valer 20, honestamente, em vez
 * de 40 na teoria e algo entre 12 e 20 na pratica. O POKE passa por vao mais
 * estreito, e em troca respeita a tinta ~3x mais de perto. A alternativa era
 * repintar as 31 referencias com corredor mais largo.
 *
 * A erosao continua implementada no gerador (passo 1.5) e e o lugar certo pra
 * mexer nisso: com pegada igual a celula o raio de erosao e 0 e nada acontece,
 * e subir a pegada volta a apertar sem custo nenhum no laco quente — que roda
 * ate 250 mil passos por chamada no resim do servidor.
 */
export const POKE_COLLISION_FOOTPRINT = 20
