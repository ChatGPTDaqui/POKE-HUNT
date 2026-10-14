import type { ReactNode } from 'react'
import { nivelDeAprendizado } from '@/data/activeAbilities'
import { getAbility } from '@/data/abilities'
import type { PokeInstance, Species } from '@/data/pokes'
import { Explicacao } from './Explicacao'

/** Consulta a mesma régua usada pelo aprendizado, sem antecipar TMs ou evoluções. */
export function proximoAprendizado(poke: PokeInstance, species: Species) {
  const futuros = [...nivelDeAprendizado(species)]
    .filter(([key, level]) => level > poke.level
      && !poke.unlockedAbilities.includes(key)
      && !poke.golpesDeMaquina?.includes(key) && getAbility(key))
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
  const nivel = futuros[0]?.[1]
  if (nivel === undefined) return null
  return { nivel, golpes: futuros.filter(([, level]) => level === nivel).map(([key]) => getAbility(key)!) }
}

export function ProximoGolpe({ poke, species, children }: {
  poke: PokeInstance; species: Species; children?: ReactNode
}) {
  const proximo = proximoAprendizado(poke, species)
  const resumo = children === undefined
  const descricao = proximo
    ? `Próximo golpe de ${species.name}: ${proximo.golpes.map(g => g.name).join(', ')} no nível ${proximo.nivel}`
    : `${species.name}: sem novos golpes por nível nesta forma`
  return (
    <Explicacao
      tabIndex={0}
      rotulo={resumo ? descricao : `Próximo golpe de ${species.name}`}
      className={resumo
        ? 'journey-next-move flex w-full min-w-0 items-center gap-[.3em] cursor-help touch-manipulation text-[.7em] leading-tight text-menu-muted focus-visible:outline focus-visible:outline-2'
        : 'inline-flex shrink-0 cursor-help touch-manipulation underline decoration-dotted underline-offset-[.2em] focus-visible:outline focus-visible:outline-2'}
      conteudo={(
        <div className="flex flex-col gap-[.3em] text-left">
          <b>Próximo aprendizado</b>
          {proximo ? (
            <>
              <span>No nível {proximo.nivel}, {species.name} aprenderá:</span>
              {proximo.golpes.map((golpe) => <span key={golpe.id}>{golpe.name}</span>)}
              <span className="text-menu-muted">Previsão da forma atual. Com quatro golpes ativos, escolha o novo na Equipe.</span>
            </>
          ) : <span>Esta forma não tem mais golpes para aprender por nível.</span>}
        </div>
      )}
    >
      {resumo ? proximo ? (
        <>
          <span aria-hidden="true" className="shrink-0">↗</span>
          <span className="min-w-0 truncate font-medium text-menu-ink">{proximo.golpes[0].name}</span>
          {proximo.golpes.length > 1 && <span className="shrink-0">+{proximo.golpes.length - 1}</span>}
          <span className="shrink-0 tabular-nums">Lv {proximo.nivel}</span>
        </>
      ) : <span className="truncate">Sem novos golpes por nível</span> : children}
    </Explicacao>
  )
}
