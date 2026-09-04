// Bancada de diagnostico: POR QUE o POKE de um jogador chega desmaiado quando
// ele volta ao jogo.
//
// ---------------------------------------------------------------------------
// O RELATO QUE MOTIVOU ISTO
// ---------------------------------------------------------------------------
// "o jogador vinny sempre ao voltar ao jogo encontra seu pokemon desmaiado no
// hospital e um anuncio 'seu poke desmaiou e a cacada foi encerrada. Cure na
// enfermeira para voltar a cacar'". SEMPRE, e nao de vez em quando.
//
// Aquela frase sai de `data/remote/autoridade.ts#MOTIVO_ENCERRAMENTO.desmaio`,
// disparada por `encerrada: 'desmaio'`, que a authority devolve quando
// `resumo.stoppedEarly` e verdadeiro — ou seja: durante a simulacao da
// ausencia o POKE caiu e NAO HAVIA COMO REANIMA-LO.
//
// ---------------------------------------------------------------------------
// POR QUE UM SCRIPT, E NAO OLHAR O CODIGO
// ---------------------------------------------------------------------------
// O codigo responde "o que acontece quando ele morre". Ele NAO responde a
// pergunta que importa aqui, que e sobre DADO: o POKE dele aguenta a hunt onde
// ele deixou o jogo rodando? Ele tem pocao? Auto-Pot esta ligado? Auto-Revive?
// Sao seis ou sete campos de uma linha de `players`, e adivinhar qualquer um
// deles produz um diagnostico errado com cara de certo.
//
// LEITURA APENAS. Nenhum `insert`/`update`/`delete` — escrita no remoto entra
// por migration versionada (regra do projeto), e um script de diagnostico nao e
// excecao a ela. Serve com `SERVICE_ROLE_KEY` porque precisa ler a linha de
// OUTRO jogador, o que a RLS (corretamente) nao permite pela chave anonima.
//
// USO:
//   node scripts/harness/por-que-o-poke-desmaia-na-ausencia.mjs vinny
//   node scripts/harness/por-que-o-poke-desmaia-na-ausencia.mjs          (lista os que mais desmaiam)
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

const PRINCIPAL = 'C:/Users/Mark2/Documents/NOVO POKE IDLE'
const env = { ...lerEnv(join(RAIZ, '.env')), ...lerEnv(join(PRINCIPAL, '.env')) }
const doAmbiente = (nome) => {
  const v = process.env[nome]
  return v && v.trim() ? v.trim() : undefined
}

const URL_BASE = env.SUPABASE_URL || doAmbiente('SUPABASE_URL')
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY || doAmbiente('SUPABASE_SERVICE_ROLE_KEY')

/**
 * `public` FIXO, e nao `env.SUPABASE_SCHEMA`.
 *
 * O `.env` da raiz aponta pra `dev` (e o mesmo arquivo dos scripts de
 * migracao), e um jogador de PRODUCAO nao existe naquele schema — a primeira
 * versao deste arquivo herdou o `dev` e devolveu "nenhum jogador com esse
 * nome", que le como "o relato e falso" quando na verdade era o schema errado.
 * `SCHEMA=<outro>` na linha de comando ainda troca, de proposito, pra poder
 * conferir o `dev` quando a pergunta for sobre ele.
 */
const SCHEMA = doAmbiente('SCHEMA') || 'public'

if (!URL_BASE || !SERVICE) {
  console.error('Faltando SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  console.error(`Procurei no .env de ${RAIZ} e de ${PRINCIPAL}, e depois no ambiente.`)
  process.exit(1)
}

const alvo = process.argv[2] ?? null

async function ler(caminho, { schema = SCHEMA, range = null } = {}) {
  const headers = {
    apikey: SERVICE,
    Authorization: `Bearer ${SERVICE}`,
    'Accept-Profile': schema,
  }
  // `.length` do resultado MENTE acima de 1000 linhas (o PostgREST corta sem
  // erro) — quando o que importa e a CONTAGEM, pedir `Range: 0-0` e ler
  // `Content-Range` e a unica forma confiavel. Regra do projeto.
  if (range) { headers.Range = range; headers.Prefer = 'count=exact' }
  const r = await fetch(`${URL_BASE}/rest/v1/${caminho}`, { headers })
  if (!r.ok) throw new Error(`${caminho} -> HTTP ${r.status} ${await r.text()}`)
  return { linhas: await r.json(), contagem: r.headers.get('content-range') }
}

const pct = (a, b) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '—')

// ---------------------------------------------------------------------------
// O diagnostico de UM jogador
// ---------------------------------------------------------------------------
async function diagnosticar(nome) {
  const { linhas: jogadores } = await ler(
    `players?trainer_name=ilike.*${encodeURIComponent(nome)}*`
    + '&select=user_id,trainer_name,trainer_level,current_map_id,auto_toggles,auto_pot_rules,gold,updated_at',
  )
  if (jogadores.length === 0) {
    console.log(`\nNenhum jogador com nome parecido com "${nome}".`)
    return
  }

  for (const j of jogadores) {
    console.log(`\n${'='.repeat(72)}`)
    console.log(`JOGADOR  ${j.trainer_name}   (treinador Lv ${j.trainer_level})`)
    console.log(`${'='.repeat(72)}`)
    console.log(`  onde parou:  ${j.current_map_id ?? '(fora de hunt)'}`)
    console.log(`  visto em:    ${j.updated_at}`)

    // --- as automacoes, que decidem se ele sobrevive sozinho ---------------
    const t = j.auto_toggles ?? {}
    const liga = (v) => (v ? 'LIGADO' : 'desligado')
    console.log('\n  AUTOMACOES')
    console.log(`    Auto-Pot     ${liga(t.autoPot)}`)
    console.log(`    Auto-Status  ${liga(t.autoStatus)}`)
    console.log(`    Auto-Revive  ${liga(t.autoRevive)}`)
    console.log(`    Auto-Catch   ${liga(t.autoCatch)}`)
    const regras = j.auto_pot_rules ?? []
    console.log(`    regra de pocao: ${regras.length ? JSON.stringify(regras) : '(nenhuma)'}`)

    // --- o estoque, que decide se as automacoes tem o que gastar ----------
    const { linhas: linhasDeItem } = await ler(
      `player_items?user_id=eq.${j.user_id}&select=item_id,quantity`,
    )
    const soma = (pref) => linhasDeItem
      .filter((l) => String(l.item_id).includes(pref))
      .reduce((a, l) => a + (Number(l.quantity) || 0), 0)
    const pocoes = soma('potion')
    const revives = soma('revive')
    console.log('\n  ESTOQUE')
    console.log(`    pocoes  ${pocoes}`)
    console.log(`    revives ${revives}`)

    // --- a equipe: quem esta em campo, e com quanto de vida --------------
    const { linhas: pokes } = await ler(
      `pokemon_instances?user_id=eq.${j.user_id}&location=eq.team`
      + '&select=id,species_id,level,hp,stat_hp,team_slot,status&order=team_slot.asc',
    )
    console.log('\n  EQUIPE (o slot 0 e quem caca)')
    for (const p of pokes) {
      const max = p.stat_hp ?? 0
      const hp = p.hp ?? 0
      const marca = hp <= 0 ? '  <<< DESMAIADO' : ''
      const st = p.status ? `  status=${p.status}` : ''
      console.log(
        `    [${p.team_slot}] ${String(p.species_id).padEnd(14)} Lv ${String(p.level).padStart(3)}`
        + `   HP ${hp}/${max} (${pct(hp, max)})${st}${marca}`,
      )
    }
    if (pokes.length === 0) console.log('    (equipe vazia)')

    // --- o veredito -------------------------------------------------------
    const ativo = pokes.find((p) => p.team_slot === 0) ?? pokes[0]
    console.log('\n  VEREDITO')
    const causas = []
    if (!t.autoPot) causas.push('Auto-Pot DESLIGADO — ninguem cura ele durante a ausencia')
    else if (pocoes === 0) causas.push('Auto-Pot ligado mas ZERO pocoes — a automacao nao tem o que gastar')
    if (!t.autoRevive) causas.push('Auto-Revive desligado — ao cair, a sessao encerra em vez de continuar')
    else if (revives === 0) causas.push('Auto-Revive ligado mas ZERO revives')
    if (ativo && (ativo.hp ?? 0) <= 0) causas.push('o POKE do slot 0 esta desmaiado AGORA')
    if (causas.length === 0) console.log('    nada obvio no dado deste jogador — ver a hunt e o nivel')
    for (const c of causas) console.log(`    - ${c}`)
  }
}

// ---------------------------------------------------------------------------
// A visao de POPULACAO — "e so o vinny, ou e todo mundo?"
// ---------------------------------------------------------------------------
//
// ESTA PARTE E A QUE MAIS IMPORTA, e o motivo esta numa licao ja paga por este
// projeto: contar a populacao inteira em vez de olhar um caso achou um bug 20x
// maior do que o relato sugeria. Se metade dos jogadores esta com Auto-Pot
// desligado e zero pocao, o problema nao e do vinny — e do desenho.
async function populacao() {
  const { contagem: totalCr } = await ler('players?select=id', { range: '0-0' })
  const total = Number(String(totalCr).split('/')[1] ?? 0)

  const { linhas: todos } = await ler(
    'players?select=user_id,trainer_name,auto_toggles,current_map_id',
  )
  // Uma leitura so das pocoes de TODO mundo, e nao uma por jogador: com N
  // jogadores em hunt isso seria N requests, e o que se quer aqui e a
  // distribuicao, nao o detalhe.
  const { linhas: pocoesDeTodos } = await ler(
    'player_items?item_id=like.*potion*&select=user_id,quantity',
  )
  const pocaoPorDono = new Map()
  for (const l of pocoesDeTodos) {
    pocaoPorDono.set(l.user_id, (pocaoPorDono.get(l.user_id) ?? 0) + (Number(l.quantity) || 0))
  }

  let semPot = 0, semPocao = 0, semRevive = 0, emHunt = 0
  const suspeitos = []
  for (const j of todos) {
    const t = j.auto_toggles ?? {}
    const pocoes = pocaoPorDono.get(j.user_id) ?? 0
    if (j.current_map_id) emHunt++
    if (!t.autoPot) semPot++
    if (t.autoPot && pocoes === 0) semPocao++
    if (!t.autoRevive) semRevive++
    if ((!t.autoPot || pocoes === 0) && j.current_map_id) {
      suspeitos.push(`${j.trainer_name} (${j.current_map_id}, ${pocoes} pocoes)`)
    }
  }

  console.log(`\n${'='.repeat(72)}`)
  console.log(`POPULACAO — ${total} jogadores`)
  console.log(`${'='.repeat(72)}`)
  console.log(`  em hunt agora:                    ${emHunt}`)
  console.log(`  Auto-Pot DESLIGADO:               ${semPot} (${pct(semPot, total)})`)
  console.log(`  Auto-Pot ligado mas SEM pocao:    ${semPocao} (${pct(semPocao, total)})`)
  console.log(`  Auto-Revive desligado:            ${semRevive} (${pct(semRevive, total)})`)
  console.log(`\n  em hunt E sem cura efetiva (${suspeitos.length}):`)
  for (const s of suspeitos.slice(0, 25)) console.log(`    - ${s}`)
  if (suspeitos.length > 25) console.log(`    ... e ${suspeitos.length - 25} outros`)
}

console.log(`Banco:  ${URL_BASE.replace(/\/\/(.{6}).*/, '//$1***')}`)
console.log(`Schema: ${SCHEMA}`)

if (alvo) await diagnosticar(alvo)
await populacao()
