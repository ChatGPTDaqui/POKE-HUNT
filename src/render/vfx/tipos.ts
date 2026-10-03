// Tipos do VFX procedural de golpe (spec 2026-09-28, "anime pixel").
//
// TUDO AQUI E SO DESENHO. Nenhum tipo deste arquivo e lido pela simulacao, e
// nenhuma coreografia recebe referencia a entidade, mundo ou efeito mutavel —
// so numeros congelados no momento do golpe. E isso que garante que ligar ou
// desligar o VFX nao muda dano, ordem de eventos nem relogio de combate
// (PvP/ranked dependem disso). Trancado em `soVisual.test.ts`.

/**
 * Nivel de elaboracao do efeito. Single usa 1..4, area usa 1..3.
 *
 * Cada tier ACRESCENTA ingrediente (estrela, flash, antecipacao...), nao so
 * tamanho — a tabela esta no spec. Golpe forte le como forte porque tem coisa
 * que o fraco nao tem, e nao porque o mesmo desenho ficou maior.
 */
export type Tier = 1 | 2 | 3 | 4

/** Forma fisica reconhecida pelo id do golpe. Manda na coreografia; o tipo so pinta. */
export type Motivo = 'soco' | 'chute' | 'mordida' | 'garra' | 'chifre' | 'bicada' | 'corte' | 'investida'

/** Primitiva de particula que "e" o tipo — o que sobra no ar depois do impacto. */
export type ParticulaDoTipo =
  | 'chama' | 'faisca' | 'gota' | 'folha' | 'cristal' | 'poeira' | 'pena' | 'pedra'
  | 'bolha' | 'psi' | 'sombra' | 'estrela' | 'escama' | 'metal' | 'esporo' | 'fantasma' | 'impacto' | 'golpe'

/**
 * Pele de um tipo: as camadas de cor na ordem em que sao pintadas.
 *
 * `contorno` e sempre o mais escuro e vai POR BAIXO de todas as particulas de
 * uma vez — e isso que funde as particulas numa massa unica com borda de
 * desenho (o truque que o lab validou no fogo).
 */
export interface Pele {
  contorno: string
  base: string
  meio: string
  nucleo: string
  /** Cor de dentro da estrela de impacto. */
  estrela: string
  particula: ParticulaDoTipo
  /**
   * Cores de CONTRASTE do tipo, fora da escala principal: fumaca escura do
   * fogo, fagulha quente do aco, borda vermelha do sombrio. Entram na paleta
   * do pixelizador — sem isso elas seriam "corrigidas" pra cor mais proxima da
   * pele e o contraste sumiria.
   */
  acento?: readonly string[]
}

export interface Ponto { x: number; y: number }

/**
 * Tudo que uma coreografia pode ler. Unidades de MUNDO (POKE ~ 40).
 *
 * Coreografia e funcao PURA de `ms`: o mesmo `ms` desenha sempre o mesmo
 * quadro, porque a aleatoriedade vem de `rng` semeado pelo id do efeito. Sem
 * estado entre quadros nao ha o que vazar quando o efeito morre, nem o que
 * dessincronizar se o jogo pular quadros.
 */
export interface ContextoVfx {
  ctx: CanvasRenderingContext2D
  /** ms desde o inicio do efeito. */
  ms: number
  /** Duracao da coreografia neste tier, em ms. */
  duracao: number
  origem: Ponto
  alvo: Ponto
  /** Angulo origem -> alvo em radianos (0 quando nao ha direcao). */
  angulo: number
  /** Raio da area (so AoE; 0 no single). */
  raio: number
  tier: Tier
  pele: Pele
  /** Gerador deterministico: chamar na MESMA ordem a cada quadro. */
  rng: () => number
  /** Pede `n` particulas ao orcamento do quadro; devolve quantas pode desenhar. */
  pedir: (n: number) => number
}

export type Coreografia = (c: ContextoVfx) => void

export interface EntradaDeCoreografia {
  desenhar: Coreografia
  /** Duracao por tier em ms. */
  duracao: Partial<Record<Tier, number>>
  /**
   * Single: meio-lado do retangulo que o efeito ocupa, em volta do alvo e da
   * origem. Area: quanto o efeito SOBE acima do peito de quem lancou (a largura
   * sai do raio; ver `retanguloDoEfeito`).
   */
  alcance: number
  /**
   * Single, opcional: folga POR LADO em vez do `alcance` igual pros quatro. Pro
   * golpe que cai do ceu (Thunder): 200 pra cima, mas ~60 pros lados e pra
   * baixo. Com o `alcance` dos quatro lados o pixelizador varria ~3x os pixels
   * do raio, todo quadro (02/10). Medir a extensao real antes de apertar: o que
   * passar da folga sai CORTADO na borda do retangulo.
   */
  margem?: { cima: number; baixo: number; lados: number }
  /**
   * Instantes (ms) em que o golpe BATE, por tier. E o gancho da reacao do alvo
   * — Hurt, flash de silhueta, hit-stop, numero de dano — que acontece FORA da
   * coreografia (ela so desenha o efeito). O lab ja usa; o jogo passa a usar
   * quando a reacao entrar no desenho das entidades.
   */
  impactos?: Partial<Record<Tier, readonly number[]>>
}
