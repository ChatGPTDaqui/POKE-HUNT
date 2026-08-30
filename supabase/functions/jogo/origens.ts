// As origens de CORS das duas Edge Functions — `jogo` (producao) e `jogo-dev`
// (staging).
//
// POR QUE ESTE ARQUIVO EXISTE (PH-293)
// ---------------------------------------------------------------------------
// A lista vivia so no secret `ORIGENS_PERMITIDAS`, e a origem do cliente de
// staging nunca entrou nele: o ambiente carregava a tela e nunca carregava o
// jogo, com a mensagem de erro culpando o bloqueador de anuncios do jogador.
// Secret nao aparece em code review, nao entra em teste e nao tem historico.
//
// A primeira correcao levou a lista pra dentro de `jogo/index.ts` — e nao
// resolveu, porque `jogo-dev/index.ts` tem a PROPRIA leitura do secret. As duas
// cascas sao arquivos separados de proposito (o schema tem nome de var
// diferente pra nao colidir no secret store, ver o cabecalho de `jogo-dev`), e a
// lista de origens acabou duplicada junto.
//
// Ou seja: consertar duplicando teria reproduzido, dentro da propria correcao, o
// defeito que a issue descreve. Por isso a lista mora AQUI, num modulo so, e as
// duas cascas importam. `jogo-dev` ja importa `../jogo/servidor.js`, entao o
// caminho relativo entre elas ja e um caminho que o deploy do CLI segue.
//
// A LISTA E EXPLICITA E CONTINUA SEM CURINGA. `*` junto de `Authorization`
// deixaria qualquer site do mundo chamar a rota com o token do jogador. Preview
// do Cloudflare (`<hash>.poke-hunt-euj.pages.dev`) fica de fora pelo mesmo
// motivo: sao efemeros, e liberar por curinga e confiar em qualquer subdominio.

/**
 * Onde o jogo roda de verdade.
 *
 * COPIA de `src/data/origensDoJogo.ts` — o cliente precisa da mesma lista pra
 * saber se a origem atual e liberada (e a mensagem de erro parar de acusar o
 * navegador), e este arquivo roda no Deno, sem acesso a `src/`.
 * `origensDoJogo.test.ts` le o fonte daqui e reprova se as duas divergirem.
 */
export const ORIGENS_DO_JOGO = [
  'http://localhost:5173',
  'http://localhost:4173',
  'https://poke-hunt-euj.pages.dev',
  'https://dev.poke-hunt-euj.pages.dev',
]

/**
 * As origens do jogo MAIS o que o secret acrescentar.
 *
 * O secret nunca substitui: se ele hoje tem uma origem que o repo nao conhece
 * (dominio proprio, preview especifico), ela continua valendo. Ele serve pro que
 * nao da pra prever daqui — e nao pra ser a unica fonte, que foi o que quebrou.
 */
export function origensPermitidas(doSecret: string | undefined): string[] {
  return [...new Set([
    ...ORIGENS_DO_JOGO,
    ...(doSecret ?? '').split(',').map((o) => o.trim()).filter(Boolean),
  ])]
}
