import { BIOMAS, ESTAGIOS_PARA_O_LANCE } from './biomas'
import { ESTAGIOS_POR_BIOMA } from './estagios'
import { maiorEstagioLimpo, type ProgressoPorBioma } from './progressoDeBioma'

export interface MarcoDaJornada {
  id: string
  nome: string
  atual: number
  alvo: number
  retorno: string
  pesadelo?: boolean
  estagio?: number
}

/** Reconhecimento derivado do save; não concede moeda nem altera os gates. */
export function marcosDaJornada(progresso: ProgressoPorBioma, lanceVencido: boolean): MarcoDaJornada[] {
  const contar = (estagio: number, pesadelo = false) => BIOMAS.filter(b => maiorEstagioLimpo(progresso, b.chave, pesadelo) >= estagio).length
  return [
    { id: 'primeiro', nome: 'Primeiro Lord', atual: Math.min(1, contar(1)), alvo: 1, estagio: 1, retorno: 'O próximo estágio desse bioma fica disponível.' },
    { id: 'explorador', nome: 'Explorador dos biomas', atual: contar(1), alvo: BIOMAS.length, estagio: 1, retorno: 'Conheça os biomas e as opções de tipos para montar sua equipe.' },
    { id: 'preparacao', nome: 'Rumo ao Campeão', atual: contar(ESTAGIOS_PARA_O_LANCE), alvo: BIOMAS.length, estagio: ESTAGIOS_PARA_O_LANCE, retorno: 'Libera o desafio do Campeão Lance.' },
    { id: 'lance', nome: 'Vitória sobre Lance', atual: Number(lanceVencido), alvo: 1, retorno: 'Libera o Modo Pesadelo; o Mundo continua disponível.' },
    { id: 'mundo', nome: 'Mundo completo', atual: contar(ESTAGIOS_POR_BIOMA), alvo: BIOMAS.length, estagio: ESTAGIOS_POR_BIOMA, retorno: 'Conclua todos os estágios do Mundo. Não é requisito para entrar no Pesadelo.' },
    { id: 'pesadelo', nome: 'Explorador do Pesadelo', atual: contar(1, true), alvo: BIOMAS.length, estagio: 1, pesadelo: true, retorno: 'O progresso é independente: vença o primeiro Lord de cada bioma novamente.' },
    { id: 'dominio', nome: 'Domínio do Pesadelo', atual: contar(ESTAGIOS_POR_BIOMA, true), alvo: BIOMAS.length, estagio: ESTAGIOS_POR_BIOMA, pesadelo: true, retorno: 'Conclua os estágios de todos os biomas do Pesadelo.' },
  ]
}

/** Favorece o bioma mais avançado, sem exigir completar todos a cada degrau. */
export function proximoBioma(progresso: ProgressoPorBioma, alvo: number, pesadelo = false) {
  return BIOMAS.filter(b => maiorEstagioLimpo(progresso, b.chave, pesadelo) < alvo)
    .sort((a, b) => maiorEstagioLimpo(progresso, b.chave, pesadelo) - maiorEstagioLimpo(progresso, a.chave, pesadelo))[0] ?? null
}

export const MARCOS_BESTIARIO = [500, 2500, 10_000, 50_000] as const
