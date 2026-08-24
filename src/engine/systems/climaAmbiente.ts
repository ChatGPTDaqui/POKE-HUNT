// Clima de AMBIENTE (PH-140): o clima que a sala tem por si so, sem ninguem
// lancar golpe nenhum.
//
// ---------------------------------------------------------------------------
// POR QUE E DERIVADO, E NAO GUARDADO
// ---------------------------------------------------------------------------
// `world.clima` e volatil de proposito (ver engine/types.ts): nao atravessa
// reconstrucao de mundo, entao o flush do servidor — que roda a cada 30-90s —
// apaga o campo. Guardar o clima ambiente ali faria ele PISCAR no meio do farm.
//
// Persistir em `game_sessions` resolveria, mas custaria coluna nova e migration
// nos dois schemas. E desnecessario: `seed` e `sala` JA sao persistidos, e o
// clima e funcao deles. `climaDaSala` e pura — mesma sala, mesmo clima, sempre,
// no cliente e no `authority/`. Reconstruiu o mundo, o clima volta igual.
//
// Isso tambem e o que garante que o servidor simula o tempo offline sob o MESMO
// clima que a tela mostrou. Um sorteio local (`Math.random`, ou consumir a
// sequencia principal do mundo) faria os dois lados fecharem dano diferente.
//
// ---------------------------------------------------------------------------
// POR QUE `deriveRng` E NAO O RNG DO MUNDO
// ---------------------------------------------------------------------------
// `nextFloat(world.rng)` AVANCA a sequencia principal — a mesma que decide
// shiny, IV, raridade e crit, e que o servidor audita. Um sorteio a mais aqui
// deslocaria todos os seguintes. `deriveRng` existe exatamente pra isso: gera
// uma sequencia independente a partir da semente e de um rotulo.
import { deriveRng, nextFloat } from '@/core/rng'
import { SUB_BIOMA_CLIMA } from '@/data/generated/subBiomas.generated'
import { SALAS_POR_HUNT } from '@/data/biomas'

import type { Clima, ClimaTipo, SalaAtiva, WorldState } from '../types'

/**
 * Identidade da sala DENTRO da sessao. `indice` sozinho nao serve: ele volta a
 * 0 a cada ciclo de 10 salas, e o jogador que desse a volta cairia sempre no
 * mesmo clima da primeira sala.
 */
function posicaoDaSala(sala: SalaAtiva): number {
  return sala.ciclos * SALAS_POR_HUNT + sala.indice
}

/**
 * O clima desta sala, ou `null` para ceu limpo.
 *
 * `null` sai de dois casos que valem a pena distinguir na leitura, mesmo dando
 * no mesmo resultado: o sub-bioma nao tem tabela nenhuma (nunca tem clima), ou
 * tem tabela e o sorteio caiu em `limpo` (que e um resultado como outro
 * qualquer — 53% em `badlands`, por exemplo).
 */
export function climaDaSala(seed: number, sala: SalaAtiva | null): ClimaTipo | null {
  if (!sala) return null
  const pesos = SUB_BIOMA_CLIMA[sala.chave]
  if (!pesos) return null

  const entradas = Object.entries(pesos).filter(([, peso]) => (peso ?? 0) > 0)
  const total = entradas.reduce((soma, [, peso]) => soma + (peso ?? 0), 0)
  if (total <= 0) return null

  // Rotulo com a CHAVE do sub-bioma junto: sem ela, duas sessoes cujas salas
  // caissem na mesma posicao com sub-biomas diferentes usariam o mesmo sorteio,
  // e o clima ficaria correlacionado entre lugares que nao tem nada a ver.
  const rng = deriveRng(seed, `clima:${sala.chave}:${posicaoDaSala(sala)}`)
  let sorteio = nextFloat(rng) * total
  for (const [nome, peso] of entradas) {
    sorteio -= peso ?? 0
    if (sorteio < 0) return nome === 'limpo' ? null : (nome as ClimaTipo)
  }
  // Só alcançável por erro de ponto flutuante no último passo.
  const ultimo = entradas[entradas.length - 1][0]
  return ultimo === 'limpo' ? null : (ultimo as ClimaTipo)
}

/**
 * O `Clima` de ambiente pronto pra `world.clima`, ou `null`.
 *
 * `Infinity` em `turnosRestantes` porque o relogio de turno nao derruba clima
 * de ambiente — quem derruba e a troca de sala, e ela troca a SALA inteira,
 * fazendo `climaDaSala` devolver outra coisa.
 */
export function climaAmbienteDaSala(seed: number, sala: SalaAtiva | null): Clima | null {
  const tipo = climaDaSala(seed, sala)
  return tipo ? { tipo, turnosRestantes: Infinity, origem: 'ambiente' } : null
}

/**
 * Volta `world.clima` pro clima da sala atual.
 *
 * Chamado em TODO ponto que antes zerava o clima — fim de batalha, expiracao do
 * golpe, troca de sala. A diferenca importa: com clima de ambiente, "acabou o
 * Sunny Day" nao significa ceu limpo, significa que o clima do lugar voltou a
 * aparecer. Zerar deixaria o deserto sem areia pelo resto da sala so porque
 * alguem usou um golpe de clima uma vez.
 */
export function reporClimaDeAmbiente(world: WorldState): void {
  world.clima = climaAmbienteDaSala(world.seed, world.sala)
}
