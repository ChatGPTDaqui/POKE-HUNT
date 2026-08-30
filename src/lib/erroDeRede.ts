// Traducao de "o request nao chegou a lugar nenhum".
//
// Existe num modulo proprio porque DOIS caminhos independentes precisam da mesma
// resposta e nao se conhecem: o login (`stores/authStore.ts`, que fala direto com
// o Supabase) e o cliente do servico de autoridade (`data/remote/servidor.ts`).
// Escrever a frase nos dois era garantia de divergirem no primeiro ajuste.
//
// POR QUE A MENSAGEM CITA BLOQUEADOR DE ANUNCIOS
//
// `fetch` rejeita com o MESMO `TypeError` para coisas muito diferentes: sem
// internet, DNS falhando, CORS recusado e — o caso que motivou isto — o request
// barrado por extensao (`net::ERR_BLOCKED_BY_CLIENT`, o que uBlock Origin,
// AdBlock e o Brave Shields produzem) ou por filtro de DNS (Pi-hole, NextDNS).
//
// O navegador NAO conta ao JS qual foi, e isso e proposital: se a pagina pudesse
// distinguir "bloqueado" de "offline", ela poderia detectar e chantagear quem usa
// bloqueador. A unica pista honesta que sobra e `navigator.onLine` — se o
// aparelho diz que esta online e ainda assim nao houve resposta nenhuma, a causa
// quase nunca e a internet do jogador.
//
// Isto e diagnostico, nao coerçao: a frase cita as possibilidades, o jogo
// continua funcionando igual pra quem usa bloqueador e nada aqui exige
// desliga-lo. A alternativa comum — servir um arquivo-isca `ads.js` e ver se ele
// carrega — foi descartada de proposito: e a tecnica dos sites anti-adblock,
// obrigaria a publicar um arquivo com nome que as listas barram (o que arrisca
// marcar o proprio dominio), e ainda assim so provaria "existe bloqueador", nao
// que foi ele que derrubou ESTE request.

import { origemConhecida } from '@/data/origensDoJogo'

/** Um erro que significa "nao houve resposta nenhuma"? */
export function ehFalhaSemResposta(mensagem: string): boolean {
  const m = mensagem.toLowerCase()
  // "Failed to fetch" (Chromium), "Load failed" (Safari), "NetworkError..."
  // (Firefox). Sao as tres formas do mesmo evento.
  return m.includes('failed to fetch') || m.includes('load failed') || m.includes('networkerror')
}

export function mensagemDeFalhaDeRede(
  online = typeof navigator === 'undefined' || navigator.onLine !== false,
  origemLiberada = origemConhecida(),
): string {
  if (!online) return 'Sem conexao — verifique sua internet e tente de novo.'
  // PH-293: A ORIGEM E A PISTA QUE FALTAVA, E ELA E CERTEIRA.
  //
  // O navegador nao conta ao JS que a falha foi CORS (ver o cabecalho), mas nao
  // precisa: o app SABE de onde foi servido e sabe quais enderecos o servidor
  // libera (`ORIGENS_DO_JOGO`). Endereco fora da lista + nenhuma resposta =
  // quase certamente a origem recusada, e nao um bloqueador.
  //
  // A frase importa porque a errada manda procurar no lugar errado: foi o que
  // aconteceu com o cliente de staging, que ficou quebrado acusando extensao de
  // privacidade de quem nem tinha uma. E ela e pra QUEM OPERA o jogo tanto
  // quanto pro jogador — quem abre o staging pro pre-voo de promocao e
  // exatamente a pessoa que precisa ler "este endereco nao esta liberado".
  if (!origemLiberada) {
    const onde = typeof location === 'undefined' ? 'este endereco' : location.origin
    return `O servidor nao aceita chamadas de ${onde}. Este endereco nao esta na`
      + ' lista de origens liberadas do jogo — nao e problema do seu navegador.'
  }
  return 'Nao foi possivel falar com o servidor. Voce parece estar online, entao'
    + ' o mais provavel e um bloqueador de anuncios, extensao de privacidade ou'
    + ' filtro de DNS barrando o jogo — libere este site e tente de novo.'
}
