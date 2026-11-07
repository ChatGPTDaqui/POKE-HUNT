// Limites do zoom da camera. Arquivo proprio porque o Renderer e a store do rotulo
// (+/- da HUD) precisam do mesmo numero, e a store nao deve carregar o Renderer.
export const MIN_ZOOM = 0.5
export const MAX_ZOOM = 2.5
// Comeca no maximo (07/11/2026, pedido do dono: 150% ficava longe demais). A
// distancia de combate e de 34-38 u, entao os dois corpos cabem ate num celular
// de 390 px, que nesse zoom mostra 156 u de largura.
export const DEFAULT_ZOOM = MAX_ZOOM
