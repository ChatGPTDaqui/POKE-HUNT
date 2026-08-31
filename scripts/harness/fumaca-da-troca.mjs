// PH-315 — a troca direta executa de verdade? Esta bancada responde falando com
// o Postgres.
//
// POR QUE ISTO EXISTE
// ---------------------------------------------------------------------------
// As tres fatias da troca (PH-120, PH-310, PH-312) tem 64 casos de teste e
// NENHUM fala com o banco: todos leem o SQL como texto ou exercitam o cliente
// com o banco fingido. Isso pega migration mal escrita e regressao de decisao.
// Nao pega:
//
//   - funcao que nao compila no PL/pgSQL de verdade;
//   - `grant` faltando, que so aparece como `permission denied` em runtime;
//   - RLS barrando a leitura que a tela vai fazer;
//   - e, principalmente, A REGRA QUE E O MOTIVO DA FEATURE EXISTIR:
//     confirmacao de versao antiga tem que ser RECUSADA.
//
// Versionada, e nao um script de uma vez, pela regra de harness do projeto: a
// PH-189 perdeu a bancada que produziu as medicoes dela por nao ter feito isso.
//
// O QUE ELA FAZ
// ---------------------------------------------------------------------------
// Contra o schema `dev`, com duas contas de teste reais, o caminho inteiro:
//
//   1. abre a mesa e aceita;
//   2. os dois poem POKE — e o POKE sai de 'bag' pra 'troca' DE VERDADE;
//   3. um confirma; o outro ALTERA a oferta, o que sobe a versao;
//   4. confirmar na versao velha e recusado (este e o passo que importa);
//   5. confirmar na versao nova executa, e os POKEs trocam de dono;
//   6. `troca_oferta` fica vazia, a sessao vira 'concluida', `troca_log` ganha
//      a linha;
//   7. TROCA DE VOLTA, pra nao deixar as contas de teste embaralhadas.
//
// SO O SCHEMA `dev`. Nao ha bandeira pra mudar isso: a bancada escreve de
// verdade (abre mesa, move POKE, troca dono), e escrever assim em `public` seria
// mexer no acervo de jogador real.
//
//   node scripts/harness/fumaca-da-troca.mjs
//
// Sai com codigo != 0 se qualquer passo reprovar. Nao imprime senha nem token.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCHEMA = 'dev'

/** Mesmo leitor de `.env` dos outros scripts — o projeto nao usa dotenv. */
function lerEnv(caminho) {
  const m = {}
  try {
    for (const linha of readFileSync(caminho, 'utf8').split('\n')) {
      const t = linha.trim()
      if (!t || t.startsWith('#') || !t.includes('=')) continue
      const i = t.indexOf('=')
      m[t.slice(0, i).trim()] = t.slice(i + 1).trim()
    }
  } catch { /* ausente e caso tratado abaixo */ }
  return m
}

// O `.env` da raiz e o mesmo de local e remoto (ver CLAUDE.md); o worktree pode
// nao ter copia propria, entao cai no diretorio principal — mesmo padrao de
// `fumaca-de-producao.mjs`.
const PRINCIPAL = 'C:/Users/Mark2/Documents/NOVO POKE IDLE'
const env = { ...lerEnv(join(RAIZ, '.env')), ...lerEnv(join(PRINCIPAL, '.env')) }
const local = { ...lerEnv(join(RAIZ, '.env.local')), ...lerEnv(join(PRINCIPAL, '.env.local')) }

const URL_BASE = local.VITE_SUPABASE_URL || env.SUPABASE_URL
const ANON = local.VITE_SUPABASE_ANON_KEY
const SENHA = env.CONTA_TESTE_SENHA
// Opcional: sem ela a bancada roda igual e só pula a conferência da caixa de
// entregas, que nenhum token de jogador consegue ler.
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY

/** Quantas unidades de item entram na mesa. Pequeno de propósito: as contas de
 *  teste ficam com uma entrega pendente até jogarem de novo, e 5 é um número
 *  que ninguém sente. */
const ITEM = { id: 'potion', quantidade: 5 }

if (!URL_BASE || !ANON || !SENHA) {
  console.error('Faltando VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / CONTA_TESTE_SENHA no .env')
  process.exit(1)
}

// Os emails SAO estes. O prefixo `ph46-` nao se adivinha — ja custou uma sessao
// inteira relatando "conta bloqueada" quando so o email estava errado. Na
// duvida: `node scripts/conta-de-teste.js`.
const CONTAS = {
  A: { email: 'claude@teste.pokehunt.local', nome: 'ClaudeTeste' },
  B: { email: 'ph46-amigo2@teste.pokehunt.local', nome: 'Amigo2Teste' },
}

let falhas = 0
let passos = 0

function ok(texto) {
  passos += 1
  console.log(`  ok      ${texto}`)
}

function falhou(texto, detalhe) {
  passos += 1
  falhas += 1
  console.log(`  FALHOU  ${texto}`)
  if (detalhe) console.log(`          ${detalhe}`)
}

function conferir(condicao, texto, detalhe) {
  if (condicao) ok(texto)
  else falhou(texto, detalhe)
  return condicao
}

async function entrar(email) {
  const r = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: SENHA }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(`login HTTP ${r.status}: ${j.error_description || j.msg || ''}`)
  return { token: j.access_token, userId: j.user.id }
}

/**
 * Chama uma RPC no schema `dev`.
 *
 * `Content-Profile` e o cabecalho que escolhe o schema num POST do PostgREST
 * (`Accept-Profile` e o do GET). Sem ele a chamada cairia em `public`, que e
 * justamente onde esta bancada nao pode escrever.
 *
 * Devolve `{ ok, status, corpo }` em vez de estourar: metade dos passos aqui
 * ESPERA erro, e transformar erro em excecao obrigaria try/catch em todo lugar.
 */
async function rpc(token, nome, params) {
  const r = await fetch(`${URL_BASE}/rest/v1/rpc/${nome}`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Content-Profile': SCHEMA,
    },
    body: JSON.stringify(params ?? {}),
  })
  const texto = await r.text()
  let corpo = null
  try { corpo = texto ? JSON.parse(texto) : null } catch { corpo = texto }
  return { ok: r.ok, status: r.status, corpo }
}

/** Leitura no schema `dev`, com o token do jogador — ou seja, sob RLS. */
async function ler(token, caminho) {
  const r = await fetch(`${URL_BASE}/rest/v1/${caminho}`, {
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      'Accept-Profile': SCHEMA,
    },
  })
  const texto = await r.text()
  try { return JSON.parse(texto) } catch { return texto }
}

/**
 * Leitura com a service role, usada SO pra `market_deliveries`.
 *
 * A tabela nao tem policy nenhuma (conferido: `pg_policy` vazia pra ela), o que
 * e correto — quem le a caixa de entregas e a Edge, com service role, dentro do
 * `/estado`. O cliente nunca a le direto.
 *
 * Isso e leitura, e so leitura. A regra do `CLAUDE.local.md` que proibe REST com
 * service role na mao e sobre ESCRITA de dado — a mesma distincao que liberou
 * `execute_sql` pra select na PH-309.
 */
async function lerComoServidor(caminho) {
  if (!SERVICE) return null
  const r = await fetch(`${URL_BASE}/rest/v1/${caminho}`, {
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      'Accept-Profile': SCHEMA,
    },
  })
  const texto = await r.text()
  try { return JSON.parse(texto) } catch { return texto }
}

async function quantidadeDoItem(jogador, itemId) {
  const linhas = await ler(
    jogador.token,
    `player_items?user_id=eq.${jogador.userId}&item_id=eq.${itemId}&select=quantity`,
  )
  return Array.isArray(linhas) && linhas.length ? linhas[0].quantity : 0
}

/** A mensagem do Postgres, que e a mensagem que o jogador veria. */
function mensagem(resposta) {
  const c = resposta.corpo
  if (c && typeof c === 'object' && c.message) return c.message
  return typeof c === 'string' ? c.slice(0, 160) : JSON.stringify(c ?? '').slice(0, 160)
}

/**
 * Fecha qualquer mesa viva das duas contas antes de comecar.
 *
 * Sem isto, uma execucao que morreu no meio deixa a proxima reprovando em
 * "Voce ja esta numa troca" — e o erro parece ser da feature, nao do lixo da
 * rodada anterior.
 */
async function limparMesasVivas(jogador) {
  const vivas = await ler(jogador.token, 'troca_sessao?estado=in.(convidada,aberta)&select=id')
  if (!Array.isArray(vivas)) return 0
  for (const s of vivas) await rpc(jogador.token, 'encerrar_troca', { p_sessao_id: s.id, p_motivo: 'cancelada' })
  return vivas.length
}

async function pokesNaMochila(jogador, quantos) {
  const linhas = await ler(
    jogador.token,
    `pokemon_instances?user_id=eq.${jogador.userId}&location=eq.bag&select=id,species_id&order=created_at.asc&limit=${quantos}`,
  )
  return Array.isArray(linhas) ? linhas : []
}

async function donoDe(jogador, pokeId) {
  const linhas = await ler(jogador.token, `pokemon_instances?id=eq.${pokeId}&select=user_id,location`)
  return Array.isArray(linhas) && linhas.length ? linhas[0] : null
}

/**
 * Uma troca inteira, do convite a execucao.
 *
 * Recebe quem convida, quem aceita e o que cada um poe. Usada duas vezes: a
 * troca de ida (com os passos de versao velha no meio) e a de volta, que so
 * precisa restaurar.
 */
async function trocaCompleta({ anfitriao, convidado, doAnfitriao, doConvidado, itemDoAnfitriao, comProvaDeVersao }) {
  const abertura = await rpc(anfitriao.token, 'abrir_troca', { p_convidado_id: convidado.userId })
  if (!conferir(abertura.ok, 'abrir a mesa', mensagem(abertura))) return null
  const sessaoId = abertura.corpo.id

  const aceite = await rpc(convidado.token, 'aceitar_troca', { p_sessao_id: sessaoId })
  if (!conferir(aceite.ok && aceite.corpo.estado === 'aberta', 'o convidado aceita', mensagem(aceite))) return null

  let versao = aceite.corpo.versao

  for (const poke of doAnfitriao) {
    const r = await rpc(anfitriao.token, 'por_poke_na_mesa', { p_sessao_id: sessaoId, p_poke_id: poke.id })
    if (!conferir(r.ok, `o anfitriao poe ${poke.species_id} na mesa`, mensagem(r))) return null
    conferir(r.corpo.versao > versao, '  a versao da mesa sobe', `era ${versao}, veio ${r.corpo.versao}`)
    versao = r.corpo.versao
  }

  // A reserva e o ponto da fatia 2: o POKE tem que ter SAIDO da mochila.
  if (doAnfitriao.length) {
    const linha = await donoDe(anfitriao, doAnfitriao[0].id)
    conferir(linha?.location === 'troca', '  o POKE saiu da mochila (location = troca)', `veio ${linha?.location}`)
  }

  // ITEM: a reserva dele nao e lugar, e DEBITO. O saldo do ofertante tem que
  // cair na hora — item so prometido pode ser vendido antes de a troca sair.
  if (itemDoAnfitriao) {
    const antes = await quantidadeDoItem(anfitriao, itemDoAnfitriao.id)
    const r = await rpc(anfitriao.token, 'por_item_na_mesa', {
      p_sessao_id: sessaoId, p_item_id: itemDoAnfitriao.id, p_quantidade: itemDoAnfitriao.quantidade,
    })
    if (!conferir(r.ok, `o anfitriao poe ${itemDoAnfitriao.quantidade}x ${itemDoAnfitriao.id} na mesa`, mensagem(r))) return null
    versao = r.corpo.versao
    const depois = await quantidadeDoItem(anfitriao, itemDoAnfitriao.id)
    conferir(depois === antes - itemDoAnfitriao.quantidade, '  o item foi DEBITADO do inventario', `${antes} -> ${depois}`)
  }

  for (const poke of doConvidado) {
    const r = await rpc(convidado.token, 'por_poke_na_mesa', { p_sessao_id: sessaoId, p_poke_id: poke.id })
    if (!conferir(r.ok, `o convidado poe ${poke.species_id} na mesa`, mensagem(r))) return null
    versao = r.corpo.versao
  }

  // O outro lado enxerga a mesa inteira? A policy libera os DOIS lados de
  // proposito — ver o que o outro ofereceu e o ponto da troca.
  const linhasEsperadas = doAnfitriao.length + doConvidado.length + (itemDoAnfitriao ? 1 : 0)
  const mesaVistaPeloConvidado = await ler(
    convidado.token,
    `troca_oferta?sessao_id=eq.${sessaoId}&select=id,dono_id,tipo,poke_uid,species_id,level,iv_percent`,
  )
  conferir(
    Array.isArray(mesaVistaPeloConvidado) && mesaVistaPeloConvidado.length === linhasEsperadas,
    '  o convidado le a mesa inteira, dos dois lados',
    `veio ${Array.isArray(mesaVistaPeloConvidado) ? mesaVistaPeloConvidado.length : mesaVistaPeloConvidado}, esperava ${linhasEsperadas}`,
  )

  // O RETRATO DO POKE, LIDO PELO LADO QUE NAO E DONO (PH-319).
  //
  // Esta e a conferencia que a tela depende e que nenhuma outra faz. A RLS de
  // `pokemon_instances` tem uma policy so — "o jogador le os proprios POKEs" —
  // entao a copia em `troca_oferta` e o UNICO caminho pelo qual o convidado
  // descobre que o que esta na mesa e um Goldeen nivel 12, e nao um uuid.
  //
  // Ela existe porque `por_poke_na_mesa` foi REESCRITA pela PH-314 e a bancada
  // continuou verde: nada aqui teria acusado um `insert` sem as colunas novas.
  if (Array.isArray(mesaVistaPeloConvidado) && doAnfitriao.length) {
    const esperado = doAnfitriao[0]
    const linha = mesaVistaPeloConvidado.find((l) => l.poke_uid === esperado.id)
    conferir(
      linha?.species_id === esperado.species_id,
      '  o convidado ve a ESPECIE do POKE do anfitriao',
      `esperava ${esperado.species_id}, veio ${linha?.species_id ?? '(nada)'}`,
    )
    conferir(
      typeof linha?.level === 'number' && linha.level > 0,
      '  ...com o nivel junto',
      `veio ${JSON.stringify(linha?.level)}`,
    )
    conferir(
      typeof linha?.iv_percent === 'number' && linha.iv_percent >= 0 && linha.iv_percent <= 100,
      '  ...e o IV numa faixa que faz sentido',
      `veio ${JSON.stringify(linha?.iv_percent)}`,
    )
  }

  if (comProvaDeVersao) {
    // ESTE E O PASSO QUE IMPORTA. O convidado confirma; o anfitriao muda a
    // oferta em seguida (tirando o que acabou de por); a confirmacao do
    // convidado tem que deixar de valer, e a tentativa dele de reconfirmar na
    // versao VELHA tem que ser recusada.
    const c1 = await rpc(convidado.token, 'confirmar_troca', { p_sessao_id: sessaoId, p_versao: versao })
    conferir(c1.ok && c1.corpo.estado === 'aberta', '  o convidado confirma, e a troca NAO executa sozinha', mensagem(c1))
    const versaoVelha = versao

    const tirou = await rpc(anfitriao.token, 'tirar_poke_da_mesa', {
      p_sessao_id: sessaoId, p_poke_id: doAnfitriao[doAnfitriao.length - 1].id,
    })
    if (!conferir(tirou.ok, '  o anfitriao muda a oferta depois da confirmacao', mensagem(tirou))) return null
    versao = tirou.corpo.versao
    conferir(versao > versaoVelha, '  a versao subiu com a mudanca', `era ${versaoVelha}, veio ${versao}`)
    conferir(
      tirou.corpo.versao_confirmada_convidado !== versao,
      '  a confirmacao do convidado deixou de valer',
      `confirmada em ${tirou.corpo.versao_confirmada_convidado}, mesa em ${versao}`,
    )

    const velha = await rpc(convidado.token, 'confirmar_troca', { p_sessao_id: sessaoId, p_versao: versaoVelha })
    conferir(
      !velha.ok && String(mensagem(velha)).includes('A oferta mudou'),
      '  CONFIRMAR NA VERSAO VELHA E RECUSADO',
      `status ${velha.status}: ${mensagem(velha)}`,
    )

    // Devolve o POKE tirado, pra troca de volta encontrar o mesmo acervo.
    const repos = await rpc(anfitriao.token, 'por_poke_na_mesa', {
      p_sessao_id: sessaoId, p_poke_id: doAnfitriao[doAnfitriao.length - 1].id,
    })
    if (!conferir(repos.ok, '  o anfitriao repoe o POKE', mensagem(repos))) return null
    versao = repos.corpo.versao
  }

  const cA = await rpc(anfitriao.token, 'confirmar_troca', { p_sessao_id: sessaoId, p_versao: versao })
  if (!conferir(cA.ok, 'o anfitriao confirma', mensagem(cA))) return null
  conferir(cA.corpo.estado === 'aberta', '  uma confirmacao so nao executa', `estado ${cA.corpo.estado}`)

  const cB = await rpc(convidado.token, 'confirmar_troca', { p_sessao_id: sessaoId, p_versao: versao })
  if (!conferir(cB.ok, 'o convidado confirma', mensagem(cB))) return null
  conferir(cB.corpo.estado === 'concluida', 'a SEGUNDA confirmacao executa a troca', `estado ${cB.corpo.estado}`)

  return sessaoId
}

async function main() {
  console.log(`Banco:  ${URL_BASE}`)
  console.log(`Schema: ${SCHEMA} (a bancada escreve; por isso nunca public)`)

  let A
  let B
  try {
    const [a, b] = await Promise.all([entrar(CONTAS.A.email), entrar(CONTAS.B.email)])
    A = { ...a, ...CONTAS.A }
    B = { ...b, ...CONTAS.B }
  } catch (e) {
    console.log(`\nLOGIN FALHOU — ${e.message}`)
    console.log('Falha de autenticacao em conta de teste e email errado ate prova em contrario.')
    console.log('Conferir com: node scripts/conta-de-teste.js')
    process.exit(1)
  }
  console.log(`Contas: ${A.nome} e ${B.nome}\n`)

  console.log('--- limpeza da rodada anterior ---')
  const limpas = (await limparMesasVivas(A)) + (await limparMesasVivas(B))
  console.log(`  ${limpas} mesa(s) viva(s) encerrada(s)`)

  const doA = await pokesNaMochila(A, 2)
  const doB = await pokesNaMochila(B, 1)
  if (doA.length < 2 || doB.length < 1) {
    console.log(`\nSEM ACERVO: ${A.nome} tem ${doA.length} na mochila (precisa 2), ${B.nome} tem ${doB.length} (precisa 1).`)
    console.log('A bancada nao inventa POKE — capturar pelo jogo ou usar outra conta.')
    process.exit(1)
  }
  console.log(`\n--- troca de ida: ${A.nome} da ${doA.map((p) => p.species_id).join(' + ')}, ${B.nome} da ${doB[0].species_id} ---`)

  const sessaoId = await trocaCompleta({
    anfitriao: A, convidado: B, doAnfitriao: doA, doConvidado: doB, itemDoAnfitriao: ITEM, comProvaDeVersao: true,
  })
  if (!sessaoId) {
    console.log('\nA troca de ida nao completou. O acervo pode ter ficado NA MESA — rodar de novo faz a limpeza.')
    process.exit(1)
  }

  console.log('\n--- o que sobrou depois de executar ---')
  for (const poke of doA) {
    const linha = await donoDe(B, poke.id)
    conferir(
      linha?.user_id === B.userId && linha?.location === 'bag',
      `${poke.species_id} passou pra ${B.nome}, na mochila`,
      `dono ${linha?.user_id?.slice(0, 8)}, lugar ${linha?.location}`,
    )
  }
  const linhaB = await donoDe(A, doB[0].id)
  conferir(
    linhaB?.user_id === A.userId && linhaB?.location === 'bag',
    `${doB[0].species_id} passou pra ${A.nome}, na mochila`,
    `dono ${linhaB?.user_id?.slice(0, 8)}, lugar ${linhaB?.location}`,
  )

  const sobrouNaMesa = await ler(A.token, `troca_oferta?sessao_id=eq.${sessaoId}&select=id`)
  conferir(Array.isArray(sobrouNaMesa) && sobrouNaMesa.length === 0, 'a mesa ficou vazia', JSON.stringify(sobrouNaMesa))

  const log = await ler(A.token, `troca_log?sessao_id=eq.${sessaoId}&select=id,versao,oferta`)
  conferir(Array.isArray(log) && log.length === 1, 'o log da troca foi gravado', JSON.stringify(log).slice(0, 120))
  if (Array.isArray(log) && log.length === 1) {
    // POKEs dos dois lados MAIS a pilha de item — o retrato tem que guardar a
    // mesa inteira, senao a reclamacao "eu mandei 5 pocoes" nao tem prova.
    const linhasNoLog = doA.length + doB.length + 1
    conferir(
      Array.isArray(log[0].oferta) && log[0].oferta.length === linhasNoLog,
      '  o log guarda as duas ofertas, POKE e item',
      `${Array.isArray(log[0].oferta) ? log[0].oferta.length : '?'} linha(s), esperava ${linhasNoLog}`,
    )
  }

  const logDoTerceiro = await ler(B.token, 'troca_log?select=id')
  conferir(Array.isArray(logDoTerceiro), 'o outro participante tambem le o log', JSON.stringify(logDoTerceiro).slice(0, 80))

  // O ITEM NAO CAI EM `player_items` DE QUEM RECEBE, e nao cair E o certo: o
  // flush do destinatario reescreve aquela tabela com o numero LOCAL dele, e
  // credito direto seria sobrescrito sem erro nenhum. Ele vira ENTREGA, aplicada
  // no proximo `/estado` dele. Ver a nota 4 da migration da PH-312.
  if (SERVICE) {
    const entregas = await lerComoServidor(
      `market_deliveries?user_id=eq.${B.userId}&motivo=eq.troca&claimed_at=is.null&select=item_id,quantity&order=created_at.desc&limit=1`,
    )
    const e = Array.isArray(entregas) && entregas.length ? entregas[0] : null
    conferir(
      e?.item_id === ITEM.id && e?.quantity === ITEM.quantidade,
      `o item foi pra caixa de entregas de ${B.nome}, e nao pra player_items`,
      JSON.stringify(entregas).slice(0, 120),
    )
  } else {
    console.log('  (pulado) conferencia da caixa de entregas — sem SUPABASE_SERVICE_ROLE_KEY no .env')
  }

  console.log(`\n--- troca de volta, pra devolver o acervo ---`)
  // B devolve o mesmo tanto de item, pra soma fechar: cada conta termina com
  // 5 debitados e 5 esperando na caixa de entregas. Depois que as duas jogarem
  // de novo, o saldo volta ao que era.
  const volta = await trocaCompleta({
    anfitriao: B, convidado: A, doAnfitriao: doA, doConvidado: doB, itemDoAnfitriao: ITEM, comProvaDeVersao: false,
  })
  if (volta) {
    const devolvido = await donoDe(A, doA[0].id)
    conferir(devolvido?.user_id === A.userId, `${doA[0].species_id} voltou pra ${A.nome}`, `dono ${devolvido?.user_id?.slice(0, 8)}`)
    console.log(`  nota: ${ITEM.quantidade}x ${ITEM.id} de cada lado ficam na caixa de entregas ate a conta jogar de novo — e assim que o credito funciona.`)
  } else {
    console.log('  A troca de volta nao completou — o acervo das contas de teste ficou trocado.')
  }

  console.log(`\n=== ${falhas === 0 ? `TUDO OK — ${passos} conferencias` : `REPROVOU — ${falhas} de ${passos} conferencias`} ===`)
  process.exit(falhas === 0 ? 0 : 1)
}

await main()
