// PH-137 — a face substituta tem que ler com a mesma URGÊNCIA da que ela troca.
//
// O acervo de arte tem 16 expressões por espécie; o jogo usa 7. Oito espécies
// não tinham NENHUMA das 7 e tinham alguma das outras — a cara delas nunca
// mudava, nem uma vez, e não por falta de arte: por o mapeamento ser estreito.
// `importar-faces-emocao.mjs#SUBSTITUTAS` fecha esse buraco.
//
// O risco de uma tabela de sinônimos é ela virar sinônimo de DICIONÁRIO. A face
// do trilho responde "o quanto incomoda", não "qual é o status" — quem diz qual
// é o status é o selo colorido do lado. Trocar `pain` por `Angry` é gramatical e
// está errado: raiva lê como "vai revidar", que é o oposto de "está apanhando".
//
// Este arquivo tranca as escolhas que custaram julgamento. Mudar uma reprova, e
// é para reprovar: a conversa tem que acontecer.
import { describe, expect, it } from 'vitest'

import { FACE_EMOCOES, FACE_EMOCOES_SHINY, FACE_EMOCOES_SUBSTITUTAS } from './generated/faceEmocoes.generated'

const SCRIPT = import.meta.glob('/scripts/importar-faces-emocao.mjs', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

const fonte = Object.values(SCRIPT)[0]

/** Lê `SUBSTITUTAS` do script — a fonte de verdade é ele, não uma cópia aqui. */
function substitutasDeclaradas(): Record<string, string[]> {
  const bloco = fonte.match(/const SUBSTITUTAS = \{([\s\S]*?)\n\}/)![1]
  const mapa: Record<string, string[]> = {}
  for (const linha of bloco.split('\n')) {
    const m = linha.match(/^\s*([a-z]+): \[(.*)\],/)
    if (m) mapa[m[1]] = m[2].split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean)
  }
  return mapa
}

describe('a tabela de faces substitutas (PH-137)', () => {
  const tabela = substitutasDeclaradas()

  it('o script foi lido e a tabela existe', () => {
    expect(fonte).toContain('const SUBSTITUTAS')
    expect(Object.keys(tabela)).toHaveLength(7)
  })

  it('nenhuma emoção fica sem substituta', () => {
    // Emoção sem alternativa é um buraco que continua aberto sem ninguém ver.
    for (const [emocao, lista] of Object.entries(tabela)) {
      expect(lista.length, `${emocao} não tem substituta nenhuma`).toBeGreaterThan(0)
    }
  })

  it('`Angry` nunca substitui dor nem apatia', () => {
    // A escolha que mais custou. Raiva lê como "vai revidar"; dor e apatia leem
    // como "está apanhando" e "desistiu". Trocar uma pela outra inverte a
    // leitura de relance, que é a única coisa que a face precisa acertar.
    expect(tabela.pain, 'Angry não pode substituir pain').not.toContain('Angry')
    expect(tabela.sigh, 'Angry não pode substituir sigh').not.toContain('Angry')
    expect(tabela.worried, 'Angry não pode substituir worried').not.toContain('Angry')
  })

  it('`Shouting` só entra em determined e stunned', () => {
    // Gritar serve para foco (grito de esforço) e para susto. Em `sigh` — que é
    // sono e desânimo — seria o oposto.
    for (const [emocao, lista] of Object.entries(tabela)) {
      if (emocao === 'determined' || emocao === 'stunned') continue
      expect(lista, `${emocao} não pode usar Shouting`).not.toContain('Shouting')
    }
  })

  it('`Happy` nunca substitui uma emoção negativa', () => {
    // O modo de falha mais visível de todos: POKE a 15% de vida com cara de
    // alegria. `joyous` é a única emoção positiva das sete.
    for (const [emocao, lista] of Object.entries(tabela)) {
      if (emocao === 'joyous' || emocao === 'determined') continue
      expect(lista, `${emocao} não pode usar Happy`).not.toContain('Happy')
      expect(lista, `${emocao} não pode usar Inspired`).not.toContain('Inspired')
    }
  })

  it('a canônica nunca aparece na própria lista de substitutas', () => {
    // `pain: ['Pain', ...]` seria inofensivo e sinal de que alguém não entendeu
    // a tabela: a canônica já ganha por construção, antes das substitutas.
    const canonica: Record<string, string> = {
      pain: 'Pain', worried: 'Worried', dizzy: 'Dizzy', stunned: 'Stunned',
      sigh: 'Sigh', joyous: 'Joyous', determined: 'Determined',
    }
    for (const [emocao, lista] of Object.entries(tabela)) {
      expect(lista).not.toContain(canonica[emocao])
    }
  })
})

describe('o mapa de substituições geradas (PH-137)', () => {
  it('registra de onde cada face substituída veio', () => {
    // Sem este registro, a próxima auditoria de arte olharia `emo/dizzy/onix.png`
    // em disco e concluiria que o acervo tem `Dizzy` do Onix — não tem.
    const total = Object.keys(FACE_EMOCOES_SUBSTITUTAS).length
    expect(total, 'nenhuma substituição registrada — a tabela não está sendo usada').toBeGreaterThan(50)
  })

  it('toda substituição aponta para uma espécie e emoção que o mapa lista', () => {
    // Divergência aqui significa que o gerador escreveu as duas metades em
    // momentos diferentes — o mapa prometendo uma face que a substituição diz
    // ter vindo de outro lugar, ou pior, de espécie nenhuma.
    const orfas: string[] = []
    for (const chave of Object.keys(FACE_EMOCOES_SUBSTITUTAS)) {
      const [paleta, emocao, especie] = chave.split(':')
      const tabela = paleta === 'shiny' ? FACE_EMOCOES_SHINY : FACE_EMOCOES
      if (!tabela[especie]?.includes(emocao as never)) orfas.push(chave)
    }
    expect(orfas).toEqual([])
  })

  it('só usa expressões que a tabela do script autoriza', () => {
    // A guarda de verdade: as regras acima olham a TABELA, esta olha o
    // RESULTADO. Alguém editando o mapa gerado à mão (ele diz "não editar",
    // mas) passaria por todas as outras.
    const autorizadas = new Set(Object.values(substitutasDeclaradas()).flat())
    const foraDaTabela = [...new Set(Object.values(FACE_EMOCOES_SUBSTITUTAS))]
      .filter((expressao) => !autorizadas.has(expressao))
    expect(foraDaTabela).toEqual([])
  })
})
