// Em que ponto da cadeia de evolucao uma especie esta: 1 = forma base,
// 2 = primeira evolucao, 3 = segunda evolucao ("terceira evolucao" na forma
// como o jogador conta).
//
// Le `SPECIES` (o catalogo JA montado por data/pokes.ts) e nao `SPECIES_DATA`
// cru de proposito: as evolucoes por TROCA (Kadabra->Alakazam, Onix->Steelix,
// as 9 cadeias de `SPECIAL_EVOLUTIONS`) nao existem no dado da planilha — sao
// costuradas no `SPECIES` em tempo de load. Contando pelo dado cru, Alakazam,
// Machamp, Gengar, Steelix, Scizor, Kingdra, Golem, Politoed e Porygon2
// apareceriam como forma BASE, que e o oposto do que sao.
import { SPECIES } from './pokes'

// Quem evolui em quem, na direcao inversa (alvo -> origem). Uma especie pode
// ser alvo de uma unica outra em todo o dado real do Gen1/Gen2, entao um mapa
// simples basta.
const PRE_EVOLUCAO: Record<string, string> = {}
for (const especie of Object.values(SPECIES)) {
  if (especie.evolvesTo && SPECIES[especie.evolvesTo]) {
    PRE_EVOLUCAO[especie.evolvesTo] = especie.id
  }
}

// Teto de seguranca: uma cadeia ciclica (dado corrompido por um sync futuro)
// travaria o boot inteiro num `while` infinito. Nenhuma cadeia real passa de 3.
const PROFUNDIDADE_MAXIMA = 10

const CACHE: Record<string, number> = {}

/** 1 = forma base, 2 = primeira evolucao, 3+ = segunda evolucao em diante. */
export function evolutionStage(speciesId: string): number {
  const memo = CACHE[speciesId]
  if (memo != null) return memo

  let estagio = 1
  let atual = speciesId
  while (PRE_EVOLUCAO[atual] && estagio < PROFUNDIDADE_MAXIMA) {
    atual = PRE_EVOLUCAO[atual]
    estagio += 1
  }
  CACHE[speciesId] = estagio
  return estagio
}

/** "Pokemon de 3a evolucao" no sentido do jogador: o fim de uma cadeia de tres. */
export function isTerceiraEvolucao(speciesId: string): boolean {
  return evolutionStage(speciesId) >= 3
}
