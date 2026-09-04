// Bancada: a curva de profundidade escrita a mao concorda com o nivel real dos
// jogos? (PH-501)
//
// O QUE ELA COMPARA, E POR QUE E A ORDEM E NAO O NUMERO
// -----------------------------------------------------------------------------
// `data/estagios.ts#PERFIL_POR_SUB_BIOMA` da a cada sub-bioma uma
// `profundidade` de 0 a 1: onde dentro do BIOMA ele esta no auge. O numero e
// RELATIVO ao bioma — `seabed: 1.0` quer dizer "o mais fundo do Marinho", e nao
// "o lugar mais forte do jogo".
//
// A primeira versao desta conferencia normalizou o nivel real sobre a escala
// ABSOLUTA (Lv 2 a 67 -> 0 a 1) e acusou 10 divergencias. Estava medindo a coisa
// errada: a distribuicao de nivel real e concentrada em Lv 5-35, entao TODO
// sub-bioma cai entre 0,05 e 0,58 nessa escala e a comparacao com um numero
// relativo nao quer dizer nada.
//
// O instrumento certo e a ORDEM DENTRO DO BIOMA: o sub-bioma que a mao chamou de
// raso tem, no dado real, nivel medio menor que o que ela chamou de fundo? Isso
// e comparavel, e e a unica coisa que a curva de fato afirma.
//
// COMO RODAR
//   node scripts/derivar-encontros-por-local.mjs   (uma vez, ou quando a fonte mudar)
//   node scripts/harness/conferir-profundidade-dos-sub-biomas.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { subBiomaDoLocal, SEM_ANALOGO_REAL } from '../mapa-de-locais.mjs'

const RAIZ = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))))
const d = JSON.parse(fs.readFileSync(path.join(RAIZ, 'scripts/encontros-por-local.json'), 'utf8')).encontros

// Copia dos dois arquivos de dado, lida do FONTE e nao redigitada: redigitar
// deixaria a bancada medir contra um perfil que o jogo nao usa.
const fonteEstagios = fs.readFileSync(path.join(RAIZ, 'src/data/estagios.ts'), 'utf8')
const blocoPerfil = /PERFIL_POR_SUB_BIOMA[^=]*=\s*\{([\s\S]*?)\n\}/.exec(fonteEstagios)
if (!blocoPerfil) throw new Error('PERFIL_POR_SUB_BIOMA nao encontrado em src/data/estagios.ts')
const PROFUNDIDADE = {}
for (const m of blocoPerfil[1].matchAll(/'?([a-z-]+)'?\s*:\s*\{\s*profundidade:\s*([\d.]+)/g)) {
  PROFUNDIDADE[m[1]] = Number(m[2])
}

const fonteBiomas = fs.readFileSync(path.join(RAIZ, 'src/data/biomas.ts'), 'utf8')
const BIOMA_DO_SUB = {}
for (const b of fonteBiomas.matchAll(/chave:\s*'([a-z_]+)',\s*\n\s*nome:[\s\S]*?subBiomas:\s*\[([\s\S]*?)\n\s{4}\],/g)) {
  for (const s of b[2].matchAll(/chave:\s*'([a-z-]+)'/g)) BIOMA_DO_SUB[s[1]] = b[1]
}
if (Object.keys(BIOMA_DO_SUB).length !== 33) {
  throw new Error(`esperado 33 sub-biomas em biomas.ts, achei ${Object.keys(BIOMA_DO_SUB).length}`)
}

// Nivel medio real por sub-bioma, ponderado pela fatia da vaga: uma especie que
// ocupa 20% do local pesa 20x mais que a de 1%. Sem o peso, a vaga de 1% (a
// mais rara do mapa) mexeria a media tanto quanto a de 30%.
const soma = {}
const peso = {}
const especies = {}
for (const e of d) {
  const sub = subBiomaDoLocal(e.geracao, e.local, e.terreno)
  if (sub === null) continue
  const nivel = (e.nivelMin + e.nivelMax) / 2
  soma[sub] = (soma[sub] ?? 0) + nivel * e.fatia
  peso[sub] = (peso[sub] ?? 0) + e.fatia
  especies[sub] = especies[sub] ?? new Set()
  especies[sub].add(e.especie)
}

const linha = (s) => ({
  sub: s,
  n: especies[s].size,
  nivel: soma[s] / peso[s],
  profundidade: PROFUNDIDADE[s],
})

const porBioma = {}
for (const s of Object.keys(especies)) {
  const b = BIOMA_DO_SUB[s]
  ;(porBioma[b] = porBioma[b] ?? []).push(linha(s))
}

/**
 * Diferenca de nivel abaixo da qual dois sub-biomas EMPATAM, e a ordem entre
 * eles nao afirma nada.
 *
 * NAO E FOLGA ARBITRARIA — sem ela esta bancada fica vermelha pra sempre no
 * Marinho. Medido: `sea` da Lv 21,8 e `beach` da Lv 22,2, quatro DECIMOS de
 * nivel de diferenca, porque Tentacool ocupa 60% da vaga de agua em quase todo
 * local dos tres jogos e vai de Lv 5 a 40 — ele domina a media dos dois lados.
 * Chamar isso de "o dado discorda da mao" seria ler ruido como sinal.
 *
 * Tres niveis e o corte porque o menor desacordo REAL medido e de 21 niveis
 * (`forest` Lv 5,2 contra `tall-grass` Lv 26,3, na Mata): ha uma ordem de
 * grandeza entre o empate e o desacordo, e o corte fica no vao entre os dois.
 */
const EMPATE_EM_NIVEIS = 3

/**
 * A ordem por nivel real bate com a ordem por profundidade a mao?
 *
 * Compara PAR A PAR e ignora os pares empatados: duas listas ordenadas podem
 * diferir por uma troca entre vizinhos que estao a 0,4 nivel um do outro, e
 * comparar as listas inteiras como string acusaria isso como erro.
 */
function ordemBate(linhas) {
  for (const a of linhas) {
    for (const b of linhas) {
      if (a.sub >= b.sub) continue
      const difNivel = a.nivel - b.nivel
      if (Math.abs(difNivel) < EMPATE_EM_NIVEIS) continue
      const difMao = a.profundidade - b.profundidade
      if (Math.sign(difNivel) !== Math.sign(difMao)) return false
    }
  }
  return true
}

const desacordos = []
process.stdout.write('ORDEM DENTRO DO BIOMA: nivel real medio (ponderado pela vaga) x profundidade a mao\n')
process.stdout.write(`(par com menos de ${EMPATE_EM_NIVEIS} niveis de diferenca conta como EMPATE)\n`)
for (const bioma of Object.keys(porBioma).sort()) {
  const linhas = porBioma[bioma]
  if (linhas.length < 2) {
    const so = linhas[0]
    process.stdout.write(`\n${bioma}  (so ${so.sub} tem dado real — ordem nao testavel)\n`)
    process.stdout.write(`  ${so.sub.padEnd(14)} ${so.n} especies  Lv ${so.nivel.toFixed(1)}  prof ${so.profundidade}\n`)
    continue
  }
  const porNivel = [...linhas].sort((a, b) => a.nivel - b.nivel)
  const porMao = [...linhas].sort((a, b) => a.profundidade - b.profundidade)
  const bate = ordemBate(linhas)
  process.stdout.write(`\n${bioma}  ${bate ? 'CONCORDAM' : '>>> DISCORDAM'}\n`)
  for (const x of porNivel) {
    process.stdout.write(`  ${x.sub.padEnd(14)} ${String(x.n).padStart(3)} especies  Lv ${x.nivel.toFixed(1).padStart(5)}  prof ${x.profundidade}\n`)
  }
  if (!bate) {
    process.stdout.write(`  dado real:  ${porNivel.map((x) => x.sub).join(' < ')}\n`)
    process.stdout.write(`  a mao:      ${porMao.map((x) => x.sub).join(' < ')}\n`)
    desacordos.push(bioma)
  }
}

const semDado = Object.keys(BIOMA_DO_SUB).filter((s) => !especies[s])
process.stdout.write(`\nsub-biomas sem dado real (perfil continua a mao): ${semDado.length}\n  ${semDado.join(', ')}\n`)
const naoDeclarado = semDado.filter((s) => !SEM_ANALOGO_REAL.includes(s))
if (naoDeclarado.length) {
  process.stdout.write(`ATENCAO — sem dado e NAO declarado em SEM_ANALOGO_REAL: ${naoDeclarado.join(', ')}\n`)
}
process.stdout.write(`\nbiomas em desacordo: ${desacordos.length ? desacordos.join(', ') : 'nenhum'}\n`)
