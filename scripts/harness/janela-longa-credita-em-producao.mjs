// PH-495 — uma janela de flush ACIMA do limiar credita tempo em PRODUCAO?
//
// A PERGUNTA QUE ESTA BANCADA RESPONDE, e que nenhum teste de unidade responde:
// o `sessaoVivaNaoEAusencia.test.ts` prova a REGRA (`segundosACreditar` apara em
// vez de descartar); esta prova que a regra chegou na EDGE PUBLICADA e vale pro
// jogador. Sao coisas diferentes — este projeto ja publicou bundle velho por
// esquecer `npm run build:edge`, e o teste continuaria verde.
//
// COMO ELA MEDE: abre uma hunt, fica `ESPERA_S` segundos SEM flushar (a condicao
// exata do bug — aba estrangulada pelo navegador) e flusha uma vez. O resumo que
// volta e a resposta.
//
//   antes da PH-495   ouro 0, xp 0, abates 0     (a janela era descartada)
//   depois            ouro 95, xp 32, abates 15  (medido em 04/09)
//
// E o aparo aparece no banco: 155s de parede viraram 122,8s simulados, e nao 155.
//
// NAO E GATE DE CI: leva ~3 minutos de relogio de parede de proposito, porque a
// espera E o experimento. Rodar em toda promocao seria pagar 3 minutos por uma
// pergunta que so muda quando alguem mexe em `segundosACreditar`.
//
// RODE SOZINHA. Outra bancada na mesma conta de teste fecha a sessao desta no
// `finally` e o flush volta 409 — ver a nota em `troca-de-sala-em-producao.mjs`,
// que ja custou uma leitura errada.
//
// NAO IMPRIME SEGREDO: nem token, nem senha, nem o estado do jogador.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// A raiz sai de `import.meta.url`, e nao de caminho absoluto de maquina: assim
// ela roda de qualquer worktree, como as outras bancadas deste diretorio.
const R = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const ler = (p) => { const m = {}; try { for (const l of readFileSync(p,'utf8').split('\n')) { const t=l.trim(); if(!t||t.startsWith('#')||!t.includes('='))continue; const i=t.indexOf('='); m[t.slice(0,i).trim()]=t.slice(i+1).trim().replace(/^["']|["']$/g,'') } } catch {} return m }
const env = ler(`${R}/.env`), local = ler(`${R}/.env.local`)
const URL_BASE = local.VITE_SUPABASE_URL || env.SUPABASE_URL
const ANON = local.VITE_SUPABASE_ANON_KEY
const SENHA = env.CONTA_TESTE_SENHA
const ORIGEM = 'https://poke-hunt-euj.pages.dev'
const F = `${URL_BASE}/functions/v1/jogo`

const r0 = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, { method:'POST', headers:{apikey:ANON,'Content-Type':'application/json',Origin:ORIGEM}, body: JSON.stringify({email:'claude@teste.pokehunt.local',password:SENHA})})
const { access_token } = await r0.json()
const H = { apikey:ANON, Authorization:`Bearer ${access_token}`, 'Content-Type':'application/json', Origin:ORIGEM }

await fetch(`${URL_BASE}/rest/v1/rpc/curar_equipe`, {method:'POST',headers:H,body:'{}'})
const est = await (await fetch(`${F}/estado`,{headers:H})).json()
const poke = est?.estado?.team?.[0]
console.log(`POKE: ${poke.speciesId} Lv${poke.level} HP ${poke.hp}`)

await fetch(`${F}/sessao/fechar`, {method:'POST',headers:H,body:JSON.stringify({parcial:true})})
const ab = await fetch(`${F}/sessao/abrir`, {method:'POST',headers:H,body:JSON.stringify({mapId:'campo_aberto_e1',pokeUid:poke.uid,retomando:false})})
console.log(`abrir: HTTP ${ab.status}`)

const ESPERA_S = 150   // acima do LIMIAR_OFFLINE_SEGUNDOS (120)
console.log(`Esperando ${ESPERA_S}s SEM flushar — e a condicao do bug (aba estrangulada)...`)
await new Promise((r) => setTimeout(r, ESPERA_S * 1000))

const t0 = Date.now()
const fl = await fetch(`${F}/sessao/flush`, {method:'POST',headers:H,body:JSON.stringify({parcial:true})})
const j = await fl.json()
console.log(`flush: HTTP ${fl.status} em ${((Date.now()-t0)/1000).toFixed(1)}s`)
console.log(`sala: indice ${j?.sala?.indice}, abates ${j?.sala?.abates}`)
console.log(`resumo: ouro ${j?.resumo?.gold ?? '?'}, xp ${j?.resumo?.xp ?? '?'}, abates ${j?.resumo?.kills ?? '?'}`)
await fetch(`${F}/sessao/fechar`, {method:'POST',headers:H,body:JSON.stringify({parcial:true})})
