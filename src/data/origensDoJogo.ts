// As origens de onde ESTE jogo e servido.
//
// POR QUE ISTO EXISTE (PH-293)
// ---------------------------------------------------------------------------
// A Edge Function recusa CORS de origem que nao esteja na lista, e a lista vivia
// SO no secret `ORIGENS_PERMITIDAS`. Um secret nao aparece em code review, nao
// entra em nenhum teste e nao tem historico — quando o cliente de staging subiu,
// ninguem lembrou de acrescenta-lo, e o resultado foi um ambiente inteiro que
// carrega a tela e nunca carrega o jogo. Medido em 30/08, um `OPTIONS` por
// origem contra `jogo-dev`:
//
//   https://dev.poke-hunt-euj.pages.dev  ->  (sem access-control-allow-origin)
//   http://localhost:5173                ->  liberado
//   https://poke-hunt-euj.pages.dev      ->  liberado
//
// Pior: o passo de pre-voo de toda promocao `dev`->`main` manda abrir o cliente
// de staging e conferir que a tela sobe. Ela sobe. O jogo e que nao carrega — e
// a mensagem de erro culpava o bloqueador de anuncios do jogador.
//
// A LISTA CONTINUA EXPLICITA. `*` junto de `Authorization` deixaria qualquer
// site do mundo chamar a rota com o token do jogador; isso nao mudou. O que
// mudou e onde ela mora: aqui, versionada, revisavel e testada — e o secret
// continua valendo pra ACRESCENTAR (dominio proprio, preview novo), nunca pra
// substituir.
//
// A COPIA DO SERVIDOR VIVE EM `supabase/functions/jogo/index.ts`, porque aquele
// arquivo roda no Deno e nao importa de `src/`. `origensDoJogo.test.ts` compara
// as duas listas lendo o fonte de la — a mesma tecnica que
// `gravarProgressoCobreOMapper` usa pro SQL. Divergir ali e o modo de falha que
// esta issue documenta, entao ele reprova.

/**
 * Onde o jogo roda de verdade. Nao inclui preview do Cloudflare
 * (`<hash>.poke-hunt-euj.pages.dev`): sao efemeros, e liberar por curinga
 * significaria confiar em qualquer subdominio, inclusive um que nao subiu daqui.
 */
export const ORIGENS_DO_JOGO: readonly string[] = [
  // Desenvolvimento local (`npm run dev`). Continua na lista porque e o unico
  // caminho de validacao ao vivo quando o staging esta fora.
  'http://localhost:5173',
  // `vite preview`, usado pra conferir o build antes de subir.
  'http://localhost:4173',
  // Cliente de PRODUCAO.
  'https://poke-hunt-euj.pages.dev',
  // Cliente de STAGING — o que faltava, e a razao desta issue.
  'https://dev.poke-hunt-euj.pages.dev',
]

/**
 * O endereco atual e um que o servidor libera?
 *
 * Serve pra mensagem de erro (`lib/erroDeRede.ts`) distinguir "CORS recusou esta
 * origem" de "algo barrou o request", que o navegador NAO conta ao JS — os dois
 * chegam como o mesmo `TypeError`. Aqui a pergunta e outra e tem resposta: o
 * proprio app sabe de onde foi servido.
 *
 * Fora do navegador (teste, SSR) devolve `true`: sem `location` nao ha origem
 * suspeita a apontar, e acusar CORS ali seria um palpite pior que o silencio.
 */
export function origemConhecida(origem?: string): boolean {
  const atual = origem ?? (typeof location === 'undefined' ? null : location.origin)
  if (!atual) return true
  return ORIGENS_DO_JOGO.includes(atual)
}
