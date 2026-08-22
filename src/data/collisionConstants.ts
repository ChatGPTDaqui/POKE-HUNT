// Tamanho de celula da grade de colisao, em pixels de mundo. Nao e gerado —
// e um valor fixo compartilhado por dois lados que precisam concordar: o
// gerador (scripts/build-sub-bioma-collision.js#CELL_SIZE) e todo consumidor
// de grade em runtime (pathfinding, movimento, maps.ts). Morava em
// generated/collisionGrids.generated.ts (PH-56 removeu esse arquivo — sistema
// morto, superado por COLISAO_POR_ARTE), mas o valor em si nunca foi
// derivado de planilha nem de imagem — so mudava se alguem decidisse
// repintar toda referencia com outra granularidade.
export const COLLISION_GRID_CELL_SIZE = 40
