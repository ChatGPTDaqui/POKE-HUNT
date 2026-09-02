// Estagio de atributo em teste, pelo caminho REAL (PH-418).
//
// `entity.estagios` VIROU CACHE de `entity.estagiosFonte`. Escrever
// `entity.estagios.atkFis = -3` na mao monta um estado que o motor nao produz —
// numero sem fonte, logo sem prazo e sem autoria — e a partir da PH-418 nada
// respeita esse cache: `recalcularEstagio` reescreve tudo a partir das fontes, e
// `limparEstadoVolatil` decide o que cortar pelo campo `proprio` da fonte, que o
// atalho nao cria.
//
// Dez testes de quatro arquivos quebraram exatamente assim quando o prazo
// entrou. Eles nao estavam errados sobre o comportamento; estavam montando o
// cenario por um caminho que deixou de existir. Este helper aplica pela fonte,
// que e o unico jeito de um estagio entrar.
import { SPECIES } from '@/data/pokes'
import type { StatDeEstagio } from '@/data/statusEffects'
import { aplicarEstagioUnico } from '../systems/statusSystem'
import type { WorldEntity } from '../types'

export function darEstagio(
  alvo: WorldEntity,
  stat: StatDeEstagio,
  degraus: number,
  /**
   * `proprio: false` = veio de outro POKE, e e o que o fim de batalha corta.
   * `id` separa fontes distintas: fonte repetida RENOVA em vez de somar, entao
   * um teste que precisa de duas contribuicoes vivas tem que dar dois ids.
   */
  opcoes: { proprio?: boolean, id?: string } = {},
): void {
  aplicarEstagioUnico(alvo, stat, degraus, {
    id: opcoes.id ?? 'teste',
    tipo: 'golpe',
    proprio: opcoes.proprio ?? true,
    deQuem: SPECIES[alvo.poke.speciesId]?.name ?? alvo.poke.speciesId,
  })
}
