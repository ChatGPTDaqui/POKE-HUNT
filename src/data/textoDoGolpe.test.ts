// A FICHA DO GOLPE TEM QUE SER VERIFICAVEL (PH-71).
//
// Dois testes, um pra cada metade da regra que moveDescriptions.ts documenta:
//
//   1. Os NUMEROS saem do objeto `Ability` (o mesmo dado que o motor consome),
//      nao de texto a mao. Isso nao pode divergir do combate porque e a mesma
//      fonte.
//   2. Golpe que causa dano nao mostra aviso nenhum na ficha, entao o texto e a
//      unica informacao que o jogador tem — e ele nao pode prometer mecanica que
//      este motor nao tem.
import { describe, expect, it } from 'vitest'

import { ABILITIES, getAbility, isDamagingAbility } from '@/data/abilities'
import { MOVE_DESCRIPTIONS, golpeTemEfeitoReal } from '@/data/moveDescriptions'
import { efeitosDoGolpe } from '@/components/shared/AbilityTooltip'

describe('efeitosDoGolpe — numeros lidos do dado', () => {
  it('status com chance', () => {
    // Ember: 10% de queimar no catalogo do Ultra Sun.
    expect(efeitosDoGolpe(getAbility('ember')!)).toContain('Queimado (10%)')
  })

  it('estagio de atributo diz a PORCENTAGEM prometida, e nao o degrau (PH-421, PH-481)', () => {
    // TESTE INVERTIDO NA PH-421, e a inversao e o ponto da issue: ele afirmava
    // 'Atk Fís -1 no alvo' e 'Atk Fís +2 em si'. Esse texto e o defeito — '-1'
    // e lido como 'menos um ponto de Ataque' e na verdade e 0,67x, um terco do
    // atributo embora. Quem le '-1' acha que perdeu quase nada e mantem uma luta
    // ja perdida.
    //
    // Chance certa continua sem '(100%)' no rotulo, porque chance certa nao e
    // informacao — isso nao mudou.
    expect(efeitosDoGolpe(getAbility('growl')!)).toContain('Atk Fís do alvo em −33% (0,67x)')
    expect(efeitosDoGolpe(getAbility('swords_dance')!)).toContain('Atk Fís de quem usa em +100% (2x)')
  })

  it('dreno diz de QUE o percentual e — foi o mal-entendido que abriu a issue', () => {
    for (const id of ['absorb', 'mega_drain', 'giga_drain']) {
      expect(efeitosDoGolpe(getAbility(id)!), id).toContain('Cura 50% do dano causado')
    }
  })

  it('recuo aparece separado do dreno, mesmo campo e sinal trocado', () => {
    expect(efeitosDoGolpe(getAbility('double_edge')!)).toContain('Recuo: 33% do dano causado')
  })

  it('cura, flinch, critico, armadilha e clima', () => {
    expect(efeitosDoGolpe(getAbility('recover')!)).toContain('Cura 50% do HP máximo')
    // "turno" saiu do texto de jogo na PH-422: o que o alvo perde e a ACAO, e
    // essa e a palavra que se entende sem saber que o turno deste motor e 3s.
    expect(efeitosDoGolpe(getAbility('rock_slide')!)).toContain('30% de tirar a ação do alvo')
    expect(efeitosDoGolpe(getAbility('slash')!)).toContain('Chance de crítico maior')
    expect(efeitosDoGolpe(getAbility('spikes')!)).toContain('Armadilha no campo inimigo')
    expect(efeitosDoGolpe(getAbility('rain_dance')!)).toContain('Muda o clima para chuva')
  })

  it('golpe sem efeito nenhum no dado nao inventa linha', () => {
    expect(efeitosDoGolpe(getAbility('tackle')!)).toEqual([])
  })
})

// Frases que descrevem mecanica que este motor NAO tem. Cada uma foi conferida
// contra o codigo antes de entrar aqui — a lista nao e um palpite de estilo.
//
// FICAM DE FORA de proposito, porque sao verdade: "de duas a cinco vezes"
// (multi-acerto, PH-68) e "prende o alvo" (PH-72).
const PROMESSAS_QUE_O_MOTOR_NAO_CUMPRE: [RegExp, string][] = [
  // Swagger e Flatter ficam de fora: eles APLICAM confusao de verdade
  // (`status: 'confusion'` no catalogo). O que nao existe e o lock-in de
  // Outrage/Thrash/Petal Dance, que atacavam varios turnos e confundiam no fim.
  [/depois fica confus|turnos e fica confus/i, 'nao ha lock-in de golpe com confusao no fim'],
  [/erra e o usuario se machuca/i, 'nao ha dano por errar o golpe'],
  // Perish Song e Destiny Bond ficam de fora: os dois estao implementados (ver
  // GOLPES_COM_EFEITO_HARDCODED). O padrao mira o auto-KO de quem USA o golpe.
  [/explode e desmaia|O usuario desmaia/, 'auto-KO de quem usa foi suavizado pra metade do HP'],
  [/ataca antes do alvo|fim da fila de acao|aja logo em seguida|golpes de prioridade/i, 'este motor nao tem ordem de turno'],
  [/trocando de POKE|expulsa o alvo do campo|volta para a bola/i, 'nao existe troca forcada de POKE em combate'],
  [/o dano aumenta a cada turno/i, 'veneno e 1/8 fixo por turno, sem escalada'],
  [/derruba o item|nao carregar item|queima as frutas/i, 'POKE nao carrega item neste jogo'],
  [/perde o tipo Fogo/i, 'nao ha troca de tipo em combate'],
  [/aliado/i, 'a luta e sempre 1 contra N, sem aliado'],
  [/dobra a Velocidade|dobra o Ataque/i, 'estagio de atributo nao e "dobra" — e +2'],
]

describe('texto de golpe que a ficha NAO desmente', () => {
  // A ficha mostra AVISO_SEM_DANO ("nao causa dano e nao tem nenhum efeito extra
  // implementado aqui") em golpe inerte. Nesses o texto de sabor pode continuar
  // descrevendo o golpe original, porque o aviso logo abaixo contradiz a
  // promessa de forma explicita. Nos OUTROS nao ha aviso nenhum, e o texto e
  // tudo que o jogador tem.
  const semAviso = Object.values(ABILITIES).filter(
    (a) => (a.power > 0 || golpeTemEfeitoReal(a)) && MOVE_DESCRIPTIONS[a.id],
  )

  it('a amostra e grande (o filtro nao esvaziou o teste sem ninguem notar)', () => {
    expect(semAviso.length).toBeGreaterThan(300)
  })

  for (const [padrao, motivo] of PROMESSAS_QUE_O_MOTOR_NAO_CUMPRE) {
    it(`nenhum promete: ${motivo}`, () => {
      const culpados = semAviso
        .filter((a) => padrao.test(MOVE_DESCRIPTIONS[a.id]))
        .map((a) => `${a.id}: "${MOVE_DESCRIPTIONS[a.id]}"`)
      expect(culpados).toEqual([])
    })
  }

  // O outro lado: golpe de dano nao pode ficar sem texto. Sem isto a regra acima
  // poderia ser "cumprida" apagando descricoes.
  it('todo golpe de dano do catalogo tem descricao', () => {
    const semTexto = Object.values(ABILITIES)
      .filter((a) => isDamagingAbility(a) && !MOVE_DESCRIPTIONS[a.id] && !a.id.startsWith('aoe50_'))
      .map((a) => a.id)
    expect(semTexto).toEqual([])
  })
})
