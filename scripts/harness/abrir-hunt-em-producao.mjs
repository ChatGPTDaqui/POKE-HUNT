// Uma hunt ABRE em producao? A unica checagem que pega gate de hunt quebrado.
//
// POR QUE ELA EXISTE, e por que `fumaca-de-producao.mjs` nao substitui. Aquela
// confere login + `/estado` + CORS, e os tres passam com TODA hunt do jogo
// bloqueada — `/estado` nao consulta gate de hunt nenhum. Ela deu "TUDO OK"
// duas vezes em 02/09 com o jogo inacessivel (PH-447: o gate de continente
// reprovando as 8 linhas de producao porque `unlocked_continents` guardava o
// vocabulario anterior a PH-434). As duas bancadas sao complementares: a de
// fumaca responde "o jogador consegue entrar e carregar o estado", esta
// responde "e consegue cacar".
//
// A ORDEM DAS GUARDAS DE `abrirSessao`, E A ARMADILHA NELA.
// `authority/src/appSessao.ts` recusa nesta ordem:
//
//   1. mapId desconhecido ......................... 400 'hunt desconhecida'
//   2. POKE fora da equipe ........................ 403
//   3. poke.hp <= 0 ............................... 409 'POKE esta desmaiado'
//   4. custo em ouro nao pago ..................... 403
//   5. gate de CONTINENTE (grupoLiberado) ......... 403 'Derrote o Campeao...'
//   6. gate de ESTAGIO ............................ 403
//   7. gate do LANCE (so boss_lance) .............. 403
//
// A conta de teste tem o POKE desmaiado por padrao em producao, entao o 409 do
// passo 3 e o resultado NORMAL e nao prova nada: ele dispara DUAS guardas antes
// do gate de continente. Ler esse 409 como aprovacao foi exatamente o erro que
// deixou a promocao da 7.38 passar por verificada, com o jogo trancado. Por
// isso o script CURA a equipe antes de pedir a hunt — pela acao do proprio
// jogo (`curar_equipe`), nao por escrita direta no banco, que a regra do
// projeto proibe.
//
// O PAINEL COBRE AS DUAS DIRECOES, e a segunda e a que uma verificacao ingenua
// esquece: o risco de consertar um gate e liberar tudo. As hunts do Modo
// Pesadelo e o Campeao Lance TEM que continuar recusando pra conta que nao os
// conquistou — um 200 ali reprova a bancada tanto quanto um 403 na Rota 46.
//
// FECHA A SESSAO SEMPRE, inclusive em erro: sessao aberta na conta de teste
// derruba a aba de quem estiver jogando (trava de sessao dupla, indice UNIQUE
// parcial no banco).
//
// NAO IMPRIME SEGREDO: nem token, nem senha, nem o corpo do `/estado` (que
// carrega a equipe inteira). So o veredito de cada condicao.
//
// Sai com codigo 1 se qualquer expectativa falhar, 2 se a checagem ficou
// inconclusiva (nao deu pra curar o POKE) — da pra usar como gate sem ler a
// saida.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** Mesmo leitor de `.env` dos outros scripts — o projeto nao usa dotenv. */
function lerEnv(caminho) {
  const m = {}
  try {
    for (const linha of readFileSync(caminho, 'utf8').split('\n')) {
      const t = linha.trim()
      if (!t || t.startsWith('#') || !t.includes('=')) continue
      const i = t.indexOf('=')
      m[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    }
  } catch { /* ausente e caso tratado abaixo */ }
  return m
}

// O `.env` da raiz e o mesmo de local e remoto (ver CLAUDE.md). Sem caminho
// absoluto de maquina: a raiz sai de `import.meta.url`, entao o script roda de
// qualquer worktree — e um worktree sem `.env` proprio reprova com mensagem
// clara em vez de 401 misterioso.
const env = lerEnv(join(RAIZ, '.env'))
const local = lerEnv(join(RAIZ, '.env.local'))

const URL_BASE = local.VITE_SUPABASE_URL || env.SUPABASE_URL
const ANON = local.VITE_SUPABASE_ANON_KEY
const SENHA = env.CONTA_TESTE_SENHA
const CONTA = 'claude@teste.pokehunt.local'
const ORIGEM = 'https://poke-hunt-euj.pages.dev'
const FUNCAO = 'jogo'

if (!URL_BASE || !ANON || !SENHA) {
  console.error('Falta VITE_SUPABASE_URL/SUPABASE_URL, VITE_SUPABASE_ANON_KEY ou CONTA_TESTE_SENHA')
  console.error(`Procurei em ${join(RAIZ, '.env')} e ${join(RAIZ, '.env.local')}`)
  process.exit(1)
}

/**
 * O painel. `espera` e o que APROVA a bancada.
 *
 * Os ids sao de tres biomas diferentes de proposito: um gate quebrado por
 * bioma (um sub-bioma sem pool, um id que o gerador nao emitiu) nao aparece
 * checando um so.
 */
const PAINEL = [
  { mapId: 'route_46', espera: 200, porque: 'a primeira cacada do jogo, sem gate nenhum' },
  { mapId: 'campo_aberto_e1', espera: 200, porque: 'estagio 1 sempre liberado' },
  { mapId: 'sombrio_e1', espera: 200, porque: 'estagio 1 de outro bioma — nao e um caso isolado' },
  { mapId: 'nightmare_route_46', espera: 403, porque: 'Modo Pesadelo e premio do Lance; 200 aqui = gate afrouxou' },
  { mapId: 'boss_lance', espera: 403, porque: 'portao da PH-432 (estagio 5 nos 12 biomas)' },
]

async function entrar() {
  const r = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json', Origin: ORIGEM },
    body: JSON.stringify({ email: CONTA, password: SENHA }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(`login HTTP ${r.status}: ${j.error_description || j.msg || ''}`)
  return j.access_token
}

let cabecalhos = null

/** Fecha a sessao aberta, se houver. Silencioso: e limpeza, nao verificacao. */
async function fecharSessao() {
  if (!cabecalhos) return
  try {
    await fetch(`${URL_BASE}/functions/v1/${FUNCAO}/sessao/fechar`, {
      method: 'POST', headers: cabecalhos, body: '{}',
    })
  } catch { /* melhor engolir aqui que mascarar a falha real com um erro de limpeza */ }
}

async function conferir() {
  const token = await entrar()
  cabecalhos = {
    apikey: ANON, Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json', Origin: ORIGEM,
  }
  console.log(`Banco: ${URL_BASE}`)
  console.log(`Conta: ${CONTA}`)
  console.log(`Origem: ${ORIGEM}\n`)
  console.log('  login  ok')

  const est = await (await fetch(`${URL_BASE}/functions/v1/${FUNCAO}/estado`, { headers: cabecalhos })).json()
  const grupos = est?.estado?.unlockedContinents
  console.log(`  grupos liberados: ${JSON.stringify(grupos)}`)

  // A cura vem ANTES de qualquer pedido de hunt — ver a nota de cabecalho.
  // Sem ela a bancada para no 409 do passo 3 e nao chega em nenhum gate.
  const cura = await fetch(`${URL_BASE}/rest/v1/rpc/curar_equipe`, {
    method: 'POST', headers: cabecalhos, body: '{}',
  })
  console.log(`  curar_equipe: HTTP ${cura.status}`)

  const est2 = await (await fetch(`${URL_BASE}/functions/v1/${FUNCAO}/estado`, { headers: cabecalhos })).json()
  const equipe = est2?.estado?.team ?? []
  if (!equipe.length) {
    console.log('\nINCONCLUSIVO: a conta de teste esta sem POKE — nao da pra pedir hunt.')
    return 2
  }
  if (equipe[0].hp <= 0) {
    console.log('\nINCONCLUSIVO: o POKE segue desmaiado depois de curar_equipe.')
    console.log('A guarda de HP recusa antes de todo gate, entao nada abaixo mediria gate.')
    return 2
  }
  console.log(`  POKE pronto: ${equipe[0].speciesId} Lv${equipe[0].level}, HP ${equipe[0].hp}\n`)

  let reprovou = false
  for (const { mapId, espera, porque } of PAINEL) {
    const r = await fetch(`${URL_BASE}/functions/v1/${FUNCAO}/sessao/abrir`, {
      method: 'POST', headers: cabecalhos,
      body: JSON.stringify({ mapId, pokeUid: equipe[0].uid }),
    })
    const corpo = await r.text()
    // Sessao aberta e fechada NA HORA: a proxima linha do painel abre outra, e
    // duas sessoes na mesma conta e o caso que a trava de sessao dupla recusa.
    if (r.ok) await fecharSessao()

    const ok = r.status === espera
    if (!ok) reprovou = true
    console.log(`  ${ok ? 'ok  ' : 'FALHOU'} ${mapId} -> HTTP ${r.status} (esperado ${espera})`)
    console.log(`         ${porque}`)
    if (!ok) {
      // So no caminho de falha, e truncado: o corpo de erro e a mensagem de
      // gate, que e o dado util; o de sucesso carrega id de sessao.
      console.log(`         corpo: ${corpo.slice(0, 160)}`)
    }
  }

  return reprovou ? 1 : 0
}

let codigo = 1
try {
  codigo = await conferir()
} catch (e) {
  console.error(`\nERRO: ${e.message}`)
  codigo = 1
} finally {
  await fecharSessao()
}

console.log(
  codigo === 0 ? '\n=== TUDO OK — hunt ABRE em producao, e os gates que devem recusar recusam ==='
  : codigo === 2 ? '\n=== INCONCLUSIVO — a conta de teste nao estava em estado de cacar ==='
  : '\n=== REPROVOU — ver as linhas FALHOU acima ===',
)
process.exit(codigo)
