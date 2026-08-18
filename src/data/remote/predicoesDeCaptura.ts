// Quais POKEs da mochila local sao PREDICAO, e nao verdade do servidor.
//
// Por que isto existe: o flush parou de devolver a mochila inteira (ver
// `OpcoesDeLeitura` em server/src/progresso.ts — ler 5 mil POKEs a cada 30s
// custava 3,2 MB por request e estourou a cota de egress do projeto). O que
// chega agora em `estado.bagPokes` sao SO as capturas daquela janela, entao o
// cliente nao pode mais simplesmente trocar a mochila local pela resposta.
//
// Sem esta lista, a alternativa seria somar as capturas do servidor por cima da
// mochila local — e cada POKE apareceria DUAS vezes: uma como predicao (a
// simulacao local roda o mesmo `captureSystem` e gera `uid` proprio, com
// `crypto.randomUUID`) e outra como a linha real que o servidor gravou, com
// outro `uid`. A predicao e o unico jeito de o jogador ver a captura na hora,
// entao ela fica — mas some assim que a verdade correspondente chega.
//
// Antes desta mudanca o mesmo efeito vinha de graca: a resposta trazia a
// mochila completa e `setState` jogava a predicao fora junto. A regra de
// substituicao e a mesma; so o mecanismo mudou.
//
// Nao ha nada persistido aqui de proposito: um F5 recarrega a mochila inteira
// pelo `/estado` (que continua completo), e uma predicao que sobreviveu ao
// reload nao existe.

const preditos = new Set<string>()

// Comeca LIGADO: uma captura registrada a mais nao faz mal nenhum (o modo local
// nunca consulta esta lista), mas uma captura que escapasse do registro viraria
// um POKE fantasma permanente na tela. `ativarPredicoesDeCaptura(false)` e
// chamado por `autoridade.ts` quando nao ha servidor, so pra a lista nao crescer
// sem limite numa sessao local longa.
let ativo = true

export function ativarPredicoesDeCaptura(valor: boolean): void {
  ativo = valor
  if (!valor) preditos.clear()
}

export function registrarCapturaPredita(uid: string): void {
  if (ativo) preditos.add(uid)
}

export function ehCapturaPredita(uid: string): boolean {
  return preditos.has(uid)
}

/** Chamado sempre que o servidor manda estado — parcial ou completo. */
export function limparCapturasPreditas(): void {
  preditos.clear()
}
