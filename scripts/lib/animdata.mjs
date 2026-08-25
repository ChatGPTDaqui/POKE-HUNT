// Leitura do `AnimData.xml` do acervo PMDCollab/SpriteCollab.
//
// UMA implementacao, e o motivo de ela ser uma so (PH-147): a resolucao de
// `<CopyOf>` NAO e detalhe de parse — ela E a medicao.
//
// Silcoon nao tem `Idle-Anim.png` e TEM a animacao Idle: o no dela aponta pra
// `Walk`, e quem importa segue a cadeia. Um contador que olhe nome de arquivo
// mede o NOME, nao a arte, e o resultado e um numero plausivel num relatorio
// que ninguem confere.
//
// Isso ja produziu resultado errado duas vezes, nas primeiras versoes dos dois
// scripts de conferencia:
//
//   - a cobertura de arte da geracao III listou `silcoon`, `cascoon` e `lileep`
//     como "sem Idle" — os tres resolvem por `CopyOf`;
//   - o levantamento de animacoes, escrito a mao com a contagem crua, errou
//     tres numeros (67 nomes virou 68, `Shoot` faltando em 12 especies virou
//     31, e `Strike` a 77% ficou de fora da tabela).
//
// Nos dois casos o erro foi do MEDIDOR. Com o parse copiado em tres arquivos, a
// proxima ferramenta que precisar disso tem uma chance a mais de nascer com o
// mesmo buraco.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * @typedef {object} NoDeAnimacao
 * @property {string|null} copyOf   Animacao de onde esta herda os quadros.
 * @property {number|null} frameWidth
 * @property {number|null} frameHeight
 * @property {number[]} duracoes    Em ticks de 1/60s, um por quadro.
 */

/**
 * Todos os nos de `AnimData.xml`, por nome.
 *
 * Parse por regex, e nao por parser de XML de verdade, porque o formato e
 * fixo e conhecido — sao os mesmos ~68 nomes em 1.000+ arquivos gerados pela
 * mesma ferramenta. Uma dependencia nova aqui custaria mais do que resolve.
 *
 * @param {string} caminho  Caminho do `AnimData.xml`.
 * @returns {Record<string, NoDeAnimacao>}
 */
export function lerAnimData(caminho) {
  const xml = readFileSync(caminho, 'utf8')
  const porNome = {}
  for (const bloco of xml.match(/<Anim>[\s\S]*?<\/Anim>/g) || []) {
    const nome = (bloco.match(/<Name>(.*?)<\/Name>/) || [])[1]
    if (!nome) continue
    porNome[nome] = {
      copyOf: (bloco.match(/<CopyOf>(.*?)<\/CopyOf>/) || [])[1] || null,
      frameWidth: Number((bloco.match(/<FrameWidth>(\d+)<\/FrameWidth>/) || [])[1]) || null,
      frameHeight: Number((bloco.match(/<FrameHeight>(\d+)<\/FrameHeight>/) || [])[1]) || null,
      duracoes: [...bloco.matchAll(/<Duration>(\d+)<\/Duration>/g)].map((m) => Number(m[1])),
    }
  }
  return porNome
}

/**
 * A animacao REAL por tras de um nome, seguindo `<CopyOf>` ate achar um no com
 * PNG em disco e geometria propria.
 *
 * Devolve `{ nome, no, arquivo }` do no RESOLVIDO — `nome` pode ser diferente
 * do pedido, e e ele que aponta pro arquivo a copiar. `null` quando a cadeia
 * termina sem PNG nenhum: a especie realmente nao tem aquela animacao.
 *
 * `vistos` corta ciclo. Nenhum arquivo real tem um, mas um `CopyOf` circular
 * travaria o processo inteiro num `while` sem fim, e o custo de evitar isso e
 * um `Set`.
 *
 * @param {string} nome
 * @param {Record<string, NoDeAnimacao>} porNome
 * @param {string} spriteDir  Pasta `sprite/<dex4>` da especie.
 * @param {Set<string>} [vistos]
 * @returns {{ nome: string, no: NoDeAnimacao, arquivo: string } | null}
 */
export function resolverAnim(nome, porNome, spriteDir, vistos = new Set()) {
  if (vistos.has(nome)) return null
  vistos.add(nome)
  const arquivo = join(spriteDir, `${nome}-Anim.png`)
  const no = porNome[nome]
  // `frameWidth` e o que separa um no de verdade de um no que so existe pra
  // apontar pra outro: o segundo nao tem geometria propria.
  if (existsSync(arquivo) && no && no.frameWidth) return { nome, no, arquivo }
  if (no && no.copyOf) return resolverAnim(no.copyOf, porNome, spriteDir, vistos)
  return null
}
