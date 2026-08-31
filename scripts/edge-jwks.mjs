// Imprime o comando pra gravar o segredo `JOGO_JWKS` da Edge Function.
//
//   npm run edge:jwks
//
// POR QUE ISTO EXISTE (PH-333)
// -----------------------------------------------------------------------------
// `authority/src/auth.ts#chavePublica` valida o JWT do jogador com a chave
// PUBLICA do projeto. A ordem de busca dela e:
//
//   1. cache do isolate (`chaves`, um Map de modulo)
//   2. `cfg.jwksJson` — o segredo `JOGO_JWKS`
//   3. GET no endpoint publico `/auth/v1/.well-known/jwks.json`
//
// O comentario naquele arquivo diz que a busca de rede "na pratica e uma vez por
// ROTACAO de chave, nao por request". MEDIDO nos logs em 2026-08-31, janela de
// 24h:
//
//   /auth/v1/.well-known/jwks.json   9.141 requests   user-agent Deno/SupabaseEdgeRuntime
//   invocacoes da Edge Function      9.414
//
// Ou seja: 97% das invocacoes fazem a busca. O passo 1 nao ajuda porque o
// isolate quase nunca e reusado, e o passo 2 nunca dispara porque o segredo
// NUNCA FOI GRAVADO — `JOGO_JWKS` nao aparece em `docs/`, em `.github/` nem em
// script nenhum deste repo antes desta issue.
//
// O QUE ISSO CUSTA, medido e sem arredondar pra cima:
//
//   egress    240 B por resposta x 9.141 = ~2,1 MB/dia. Pouco.
//   LATENCIA  um round-trip HTTP a mais em TODA request autenticada. E este e o
//             motivo real de arrumar: cada flush do jogo espera por ele.
//
// POR QUE ESTE SCRIPT SO IMPRIME, E NAO EXECUTA: gravar segredo mexe na
// configuracao de producao. Quem decide isso e quem opera, nao um script — e
// muito menos um agente rodando em background. O comando sai pronto pra colar.
//
// SEGURANCA: o JWKS e a chave PUBLICA, publicada num endpoint aberto a qualquer
// um. Nao ha segredo nenhum no que este script imprime; ele se chama "segredo"
// so porque a Edge Function le variavel de ambiente por `Deno.env`, e no Supabase
// isso e a area de secrets.
//
// ROTACAO: se a chave girar e o segredo ficar velho, o `kid` novo nao esta nele e
// o passo 3 resolve sozinho — o jogo nao quebra, so volta a pagar a busca. Rodar
// este script de novo depois de uma rotacao e o que devolve o ganho.
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))

function lerEnv(nome) {
  const arquivo = join(RAIZ, nome)
  if (!existsSync(arquivo)) return {}
  const env = {}
  for (const linha of readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
    const t = linha.trim()
    if (!t || t.startsWith('#') || !t.includes('=')) continue
    const i = t.indexOf('=')
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
  return env
}

const env = lerEnv('.env')
const URL_BASE = env.SUPABASE_URL
if (!URL_BASE) {
  console.error('Faltou SUPABASE_URL no .env da raiz.')
  process.exit(1)
}

const resposta = await fetch(`${URL_BASE}/auth/v1/.well-known/jwks.json`)
if (!resposta.ok) {
  console.error(`O endpoint de JWKS respondeu HTTP ${resposta.status}.`)
  process.exit(1)
}
const texto = (await resposta.text()).trim()

let chaves
try {
  chaves = JSON.parse(texto).keys ?? []
} catch {
  console.error('O endpoint devolveu algo que nao e JSON. Nao vou imprimir comando com isso.')
  process.exit(1)
}
if (chaves.length === 0) {
  // Projeto ainda em chave simetrica (HS256 com o JWT secret legado) nao publica
  // chave nenhuma aqui — e ai o segredo nao resolveria nada.
  console.error('O JWKS nao tem chave nenhuma. Este projeto pode estar em JWT simetrico; nao ha o que gravar.')
  process.exit(1)
}

console.log('\nJWKS do projeto (chave publica, nada sigiloso):')
console.log(`  ${texto}`)
console.log(`\n  ${chaves.length} chave(s): ${chaves.map((k) => `${k.kid} (${k.alg})`).join(', ')}`)
console.log(`  ${Buffer.byteLength(texto)} bytes\n`)

console.log('Comando pra gravar o segredo (NAO foi executado — cole e rode):\n')
console.log(`  npx supabase secrets set --project-ref ${new URL(URL_BASE).hostname.split('.')[0]} JOGO_JWKS='${texto}'`)
console.log('\nDepois de gravar, a Edge Function precisa ser republicada pra o valor entrar:\n')
console.log('  npm run edge:publicar')
console.log('\nPra confirmar que funcionou, conte as buscas de JWKS numa janela nova de logs:\n')
console.log("  source='edge_logs' and log_attributes['request.path']='/auth/v1/.well-known/jwks.json'")
console.log('\nO esperado depois da correcao e ZERO (ou so o punhado de uma rotacao de chave).\n')
