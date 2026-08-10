// O que "Iniciar novo jogo" precisa apagar ALEM do estado do jogador.
//
// `aplicarAcao('reiniciarJogo')` zera o objeto de estado e o `gravarEstado`
// seguinte propaga isso pras tabelas que ele conhece: `players`,
// `pokemon_instances` (só team/bag), `player_items`, `player_pokedex` e
// `player_auto_catch_rules`. Tudo que nasceu DEPOIS desse desenho ficava de
// fora, e sobrevivia a um reset:
//
//  - POKE anunciado no Mercado. Ele vive com `location='market'`, e o
//    delete-diff do `gravarEstado` filtra por `location in (team,bag)` de
//    proposito (senao o primeiro flush depois de anunciar apagaria o POKE com o
//    anuncio de pe). Consequencia: o jogador zerava a conta e continuava com um
//    POKE a venda — comprável por outra pessoa, e creditando ouro numa conta que
//    supostamente comecou do zero.
//  - Ordem de compra/venda de item, com o escrow dela (ouro e itens retidos de
//    um inventario que deixou de existir).
//  - Entrega pendente do Mercado: seria aplicada no proximo request e injetaria
//    ouro/itens numa conta recem-zerada.
//  - Historico de sessoes de hunt, que e de onde o Perfil tira o tempo de jogo.
//    Sem apagar, a conta "do zero" abria mostrando 40 horas jogadas.
//
// O que NAO e apagado, e por que:
//  - `players.trainer_name`: identidade publica, referenciada por amizades e por
//    `pokemon_instances.original_trainer`. Reset apaga PROGRESSO.
//  - Chat, Correio, amizades e Hall da Fama: sao o registro social/historico do
//    jogador, nao o save dele. Um Hall da Fama que se apaga deixa de ser hall.
import { apagar, atualizar, selecionarTudo, type Config } from './db.js'
import { recusarOfertasPendentes } from './mercado.js'

export async function limparMundoDoJogador(cfg: Config, userId: string): Promise<void> {
  // PH-4, como VENDEDOR: `market_offers.listing_id` tem `on delete cascade`
  // pra `market_listings` — apagar os anuncios abaixo sem este passo antes
  // apaga direto a oferta pendente de quem ofertou, sem passar por
  // `recusarOfertasPendentes` (unico caminho que devolve o escrow). Resultado
  // sem isto: ouro do ofertante some, e ele nem consegue mais cancelar (a
  // linha ja nao existe).
  const meusAnuncios = await selecionarTudo<{ id: string }>(
    cfg, `market_listings?seller_id=eq.${userId}&status=eq.ativo&select=id`,
  )
  for (const { id } of meusAnuncios) {
    await recusarOfertasPendentes(cfg, id, 'Conta resetada pelo vendedor — oferta devolvida')
  }

  // PH-4, como COMPRADOR: oferta que EU fiz em anuncio de outro jogador. Meu
  // wallet ja esta sendo zerado por este mesmo reset, entao nao ha escrow pra
  // devolver aqui — so cancela, pra o vendedor nao poder aceitar/recusar
  // depois e creditar (via `responderOferta`/`enfileirarEntrega`) uma conta
  // que "comecou do zero", injetando ouro/POKE de graca.
  await atualizar(cfg, `market_offers?buyer_id=eq.${userId}&status=eq.pendente`, {
    status: 'cancelada', resolved_at: new Date().toISOString(),
  })

  // ORDEM OBRIGATORIA: `market_listings.poke_uid` referencia
  // `pokemon_instances` com `on delete restrict`, entao o anuncio sai antes do
  // POKE. Invertido, o DELETE do POKE falha com violacao de chave estrangeira e
  // o reset morre no meio (o pior estado possivel: metade apagada).
  await apagar(cfg, `market_listings?seller_id=eq.${userId}`)
  await apagar(cfg, `pokemon_instances?user_id=eq.${userId}&location=eq.market`)
  await apagar(cfg, `market_orders?user_id=eq.${userId}`)
  await apagar(cfg, `market_deliveries?user_id=eq.${userId}`)
  await apagar(cfg, `game_sessions?user_id=eq.${userId}`)
}
