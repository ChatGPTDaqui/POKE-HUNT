// PH-213 — bancada de reproducao do badge de pendencia do Correio.
//
// POR QUE ISTO EXISTE: o badge do Correio e alimentado por `usePendenciasDoCorreio`
// (src/hooks/usePendencias.ts), que soma tres coisas vindas da RPC `correio()`:
// conversas nao lidas, anexos por coletar e avisos pendentes. Ler o codigo nao
// diz se o contador ZERA depois de cada acao — pra isso e preciso ter pendencia
// de verdade no banco e olhar o numero antes e depois.
//
// Uma conta so nao consegue produzir isso: mensagem, pedido de amizade e aviso
// de venda nascem todos de OUTRO jogador. Daqui saem os dois lados.
//
// AS CONTAS: `claude@` (canonica) e `ph46-amigo2@`, as duas ja existentes no
// dominio reservado `@teste.pokehunt.local` e as duas com a senha de
// `CONTA_TESTE_SENHA`. Nao cria conta nova de proposito — ver o cabecalho de
// `scripts/conta-de-teste.js` sobre as 72 contas de lixo que motivaram a regra.
// Se um dia precisar de uma terceira, ela nasce naquele dominio e sai no
// `--limpar`.
//
//   node scripts/harness/badge-do-correio.mjs            # mede o ciclo inteiro
//   node scripts/harness/badge-do-correio.mjs --sujar    # so cria a pendencia
//
// `--sujar` existe pra reproduzir NA TELA: ele deixa a pendencia viva e sai,
// entao da pra abrir o jogo e olhar o badge com o olho.
//
// ELE ESCREVE NO BANCO REMOTO, e isso e intencional: manda mensagem, pede e
// aceita amizade, coleta anexo. Nao e escrita ad-hoc — e o jogo sendo jogado
// pelas MESMAS RPCs que a tela chama, com token de jogador e RLS ligada, que e
// justamente o que da valor ao resultado. Nao troca schema, nao roda SQL solto,
// e o alvo sao duas contas do dominio de teste. O cenario 2 desfaz a amizade
// entre as duas e a refaz no fim; se ele morrer no meio, rodar de novo
// restaura.
//
// RESULTADO EM 2026-08-29 (schema `dev`): os tres cenarios fecham o ciclo —
// conversa 0>1>0, aviso de pedido 0>1>0, anexo 0>2>1>0. Ou seja, o badge NAO
// fica preso em nenhum caminho normal. O unico ponto em que ele continua aceso
// depois de "ler" e a mensagem com anexo por coletar, e isso e de proposito
// (PH-22/PH-164). Ver PH-213.
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
      m[t.slice(0, i).trim()] = t.slice(i + 1).trim()
    }
  } catch { /* ausente e caso tratado abaixo */ }
  return m
}

// O `.env` da raiz e o mesmo de local e remoto (ver CLAUDE.md); o worktree pode
// nao ter copia propria, entao cai no diretorio principal.
const env = { ...lerEnv(join(RAIZ, '.env')), ...lerEnv('C:/Users/Mark2/Documents/NOVO POKE IDLE/.env') }
const local = { ...lerEnv(join(RAIZ, '.env.local')), ...lerEnv('C:/Users/Mark2/Documents/NOVO POKE IDLE/.env.local') }

const URL_BASE = local.VITE_SUPABASE_URL || env.SUPABASE_URL
const ANON = local.VITE_SUPABASE_ANON_KEY
const SENHA = env.CONTA_TESTE_SENHA
const SCHEMA = local.VITE_SUPABASE_SCHEMA || 'public'

if (!URL_BASE || !ANON || !SENHA) {
  console.error('Faltando VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / CONTA_TESTE_SENHA no .env')
  process.exit(1)
}

const CANONICA = 'claude@teste.pokehunt.local'
const AMIGA = 'ph46-amigo2@teste.pokehunt.local'

async function entrar(email) {
  const r = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: SENHA }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(`login ${email}: HTTP ${r.status} ${j.error_description || j.msg || ''}`)
  return { token: j.access_token, userId: j.user.id }
}

async function rpc(sessao, nome, corpo) {
  const r = await fetch(`${URL_BASE}/rest/v1/rpc/${nome}`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${sessao.token}`,
      'Content-Type': 'application/json',
      'Content-Profile': SCHEMA,
      'Accept-Profile': SCHEMA,
    },
    body: JSON.stringify(corpo ?? {}),
  })
  const texto = await r.text()
  if (!r.ok) throw new Error(`${nome}: HTTP ${r.status} ${texto.slice(0, 300)}`)
  return texto ? JSON.parse(texto) : null
}

/**
 * O MESMO calculo do sino, copiado de `usePendenciasDoCorreio`.
 *
 * Copiado e nao importado de proposito: aquele arquivo e um hook React com
 * `useQuery` dentro, e nao roda fora de componente. O risco de a copia divergir
 * e real, entao qualquer mudanca na formula do contador precisa vir aqui junto —
 * esta e a bancada que prova o comportamento, e uma bancada que mede outra
 * formula nao prova nada.
 */
function pendencias(caixa) {
  const naConversa = caixa.conversas.reduce((t, c) => t + c.naoLidas + c.anexosPendentes, 0)
  const emAvisos = caixa.avisos.filter((m) => {
    const temAlgoAnexado = (m.anexo_itens?.length ?? 0) > 0 || Boolean(m.anexo_poke)
    const temAnexoPendente = temAlgoAnexado && !m.anexo_coletado_em
    return temAnexoPendente || m.estado === 'pendente'
  }).length
  return { total: naConversa + emAvisos, naConversa, emAvisos }
}

/**
 * O mesmo que `correio()` monta no cliente: a RPC `conversas` mais os avisos
 * lidos por RLS direto de `mail_messages`. Nao existe RPC `correio` no banco —
 * ela e a funcao do cliente que junta as duas leituras.
 */
async function caixaDoCorreio(sessao) {
  const conversas = await rpc(sessao, 'conversas')
  const r = await fetch(
    `${URL_BASE}/rest/v1/mail_messages?para_id=eq.${sessao.userId}`
    + '&tipo=neq.texto&excluido_destinatario_em=is.null'
    + '&order=created_at.desc&limit=100&select=*',
    {
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${sessao.token}`,
        'Accept-Profile': SCHEMA,
      },
    },
  )
  const texto = await r.text()
  if (!r.ok) throw new Error(`avisos: HTTP ${r.status} ${texto.slice(0, 300)}`)
  return { conversas: conversas ?? [], avisos: JSON.parse(texto) }
}

async function contar(sessao, rotulo) {
  const caixa = await caixaDoCorreio(sessao)
  const p = pendencias(caixa)
  console.log(`  ${rotulo.padEnd(46)} total=${p.total}  (conversas=${p.naConversa} avisos=${p.emAvisos})`)
  return p
}

const soSujar = process.argv.includes('--sujar')

console.log(`Banco: ${URL_BASE}  schema: ${SCHEMA}\n`)

const eu = await entrar(CANONICA)
const amiga = await entrar(AMIGA)
console.log(`canonica: ${eu.userId}\namiga:    ${amiga.userId}\n`)

console.log('--- ANTES ---')
const antes = await contar(eu, 'estado inicial da canonica')

console.log('\n--- a amiga manda uma mensagem de conversa ---')
const enviada = await rpc(amiga, 'enviar_mensagem', {
  p_corpo: `PH-213 bancada ${new Date().toISOString()}`,
  p_para_id: eu.userId,
  p_para_nick: null,
  p_anexos: [],
})
console.log(`  enviada: ${enviada?.id ?? JSON.stringify(enviada)}`)
const depoisDeChegar = await contar(eu, 'depois da mensagem chegar')

if (depoisDeChegar.total <= antes.total) {
  console.log('\n  !! o contador NAO subiu com mensagem nova — isso ja e um achado.')
}

if (soSujar) {
  console.log('\n--sujar: pendencia deixada viva. Abra o jogo e olhe o badge.')
  process.exit(0)
}

console.log('\n--- a canonica abre a conversa (o que a tela faz ao abrir o fio) ---')
const marcadas = await rpc(eu, 'marcar_conversa_lida', { p_contato_id: amiga.userId })
console.log(`  marcar_conversa_lida: ${JSON.stringify(marcadas)}`)
const depoisDeLer = await contar(eu, 'depois de marcar a conversa lida')

console.log('\n=== VEREDITO (conversa) ===')
if (depoisDeLer.total === antes.total) {
  console.log('  OK — o contador voltou ao valor inicial depois de ler.')
} else {
  console.log(`  BADGE PRESO — era ${antes.total} antes, subiu pra ${depoisDeChegar.total},`)
  console.log(`  e depois de ler ficou em ${depoisDeLer.total} em vez de voltar pra ${antes.total}.`)
}

// ---------------------------------------------------------------------------
// Cenario 2: AVISO (pedido de amizade)
// ---------------------------------------------------------------------------
// A issue fala em "ler/tratar a mensagem (coletar anexo, etc.)", e aviso e o
// outro lado do contador — ele nao passa por `marcar_conversa_lida`, e o clique
// da tela (`LinhaDeMensagem.tsx:60`) se recusa a marcar lido justamente quando e
// pedido ou quando tem anexo. Entao o unico jeito de um pedido sair do contador
// e ser RESPONDIDO. Se responder nao tirar, o badge fica presa pra sempre.
//
// Desfaz a amizade pra poder pedir de novo. E reversivel e as duas contas sao de
// teste: no fim o pedido e ACEITO, devolvendo o par ao estado em que estava.
console.log('\n--- cenario 2: aviso de pedido de amizade ---')

const meuNick = (await rpc(eu, 'amigos_detalhados'), null)
try {
  await rpc(amiga, 'remover_amizade', { p_amigo_id: eu.userId })
  console.log('  amizade desfeita (pra poder pedir de novo)')
} catch (e) {
  console.log(`  remover_amizade: ${e.message.slice(0, 120)}`)
}

const antesDoPedido = await contar(eu, 'antes do pedido chegar')

// A canonica precisa ser achavel por nick. `pedir_amizade` recebe o NICK do
// destino, entao le do perfil publico em vez de chutar.
const rPerfil = await fetch(
  `${URL_BASE}/rest/v1/players?user_id=eq.${eu.userId}&select=trainer_name`,
  { headers: { apikey: ANON, Authorization: `Bearer ${eu.token}`, 'Accept-Profile': SCHEMA } },
)
const perfil = JSON.parse(await rPerfil.text())
const nick = perfil?.[0]?.trainer_name
console.log(`  nick da canonica: ${nick ?? '(nao encontrado)'}`)

if (nick) {
  const pedido = await rpc(amiga, 'pedir_amizade', { p_nick: nick })
  console.log(`  pedir_amizade: ${JSON.stringify(pedido)}`)
  const comPedido = await contar(eu, 'depois do pedido chegar')

  // Acha o aviso de pedido pendente pra responder.
  const caixa = await caixaDoCorreio(eu)
  const oPedido = caixa.avisos.find((m) => m.tipo === 'pedido_amizade' && m.estado === 'pendente')
  if (!oPedido) {
    console.log('  !! nenhum pedido pendente encontrado na caixa — nao da pra seguir.')
  } else {
    const resposta = await rpc(eu, 'responder_pedido_amizade', { p_mensagem_id: oPedido.id, p_aceitar: true })
    console.log(`  responder_pedido_amizade(aceitar): ${JSON.stringify(resposta)}`)
    const depoisDeResponder = await contar(eu, 'depois de ACEITAR o pedido')

    console.log('\n=== VEREDITO (aviso de pedido) ===')
    if (depoisDeResponder.total === antesDoPedido.total) {
      console.log('  OK — responder o pedido tirou o aviso do contador.')
    } else {
      console.log(`  BADGE PRESO — era ${antesDoPedido.total}, subiu pra ${comPedido.total},`)
      console.log(`  e depois de ACEITAR ficou em ${depoisDeResponder.total}.`)
      console.log('  O jogador tratou o aviso e o sino continua avisando.')
    }
  }
}

// ---------------------------------------------------------------------------
// Cenario 3: ANEXO por coletar
// ---------------------------------------------------------------------------
// O caso que a issue cita nominalmente ("coletar anexo, etc."), e o mais
// suspeito dos tres: `LinhaDeMensagem.tsx:60` se RECUSA a marcar lido quando a
// mensagem tem anexo (`!temAnexo`), entao ler nao tira do contador — so coletar
// tira. `usePendenciasDoCorreio` soma `c.anexosPendentes` alem de `c.naoLidas`,
// de proposito (PH-22/PH-164: carta ja lida com item preso dentro nao pode
// sumir do sino). Se `coletar_anexo_correio` nao zerar as duas coisas, o badge
// fica.
console.log('\n--- cenario 3: mensagem COM ANEXO ---')

const antesDoAnexo = await contar(eu, 'antes do anexo chegar')

const comAnexo = await rpc(amiga, 'enviar_mensagem', {
  p_corpo: `PH-213 anexo ${new Date().toISOString()}`,
  p_para_id: eu.userId,
  p_para_nick: null,
  p_anexos: [{ itemId: 'potion', quantity: 1 }],
})
console.log(`  enviada com anexo: ${comAnexo?.id ?? JSON.stringify(comAnexo)}`)
const comAnexoNaCaixa = await contar(eu, 'depois do anexo chegar')

// Primeiro so LER, sem coletar — e o passo que o jogador faz e depois estranha
// que o sino continua aceso.
await rpc(eu, 'marcar_conversa_lida', { p_contato_id: amiga.userId })
const soLido = await contar(eu, 'depois de LER (sem coletar)')
if (soLido.total > antesDoAnexo.total) {
  console.log('     ^ esperado: anexo por coletar CONTINUA no contador de proposito.')
}

// Agora coletar de verdade.
const caixaComAnexo = await caixaDoCorreio(eu)
const fio = caixaComAnexo.conversas.find((c) => c.anexosPendentes > 0)
console.log(`  conversa com anexo pendente: ${fio ? `${fio.anexosPendentes} anexo(s)` : '(nenhuma)'}`)

const idDaMensagem = comAnexo?.id
if (idDaMensagem) {
  try {
    const coleta = await rpc(eu, 'coletar_anexo_correio', { p_mensagem_id: idDaMensagem })
    console.log(`  coletar_anexo_correio: ${JSON.stringify(coleta).slice(0, 160)}`)
  } catch (erro) {
    console.log(`  coletar_anexo_correio FALHOU: ${erro.message.slice(0, 200)}`)
  }
  const depoisDeColetar = await contar(eu, 'depois de COLETAR o anexo')

  console.log('\n=== VEREDITO (anexo) ===')
  if (depoisDeColetar.total === antesDoAnexo.total) {
    console.log('  OK — coletar o anexo tirou a mensagem do contador.')
  } else {
    console.log(`  BADGE PRESO — era ${antesDoAnexo.total}, subiu pra ${comAnexoNaCaixa.total},`)
    console.log(`  e depois de COLETAR ficou em ${depoisDeColetar.total}.`)
  }
}
