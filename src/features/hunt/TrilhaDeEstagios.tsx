// A navegacao do mundo, em DOIS NIVEIS (PH-431).
//
// POR QUE DOIS, E NAO UMA LISTA SO. Com 120 hunts de bioma a lista de cards que
// existia deixa de ser navegavel: sao 121 linhas onde antes eram 37, e o cartao
// de "Marinho 4" nao se distingue do de "Marinho 5" a nao ser pelo numero. O
// jogador nao esta procurando uma hunt num catalogo — ele esta escolhendo ONDE
// no mundo cacar, e isso tem forma: primeiro o lugar, depois quao fundo nele.
//
//   Nivel 1   os 12 biomas, cada um com o quanto o jogador ja fundou nele
//   Nivel 2   a TRILHA dos 10 estagios daquele bioma
//
// A TRILHA E O PONTO, e nao decoracao. Ela e o unico lugar do jogo onde as duas
// coisas que o redesenho criou ficam visiveis ao mesmo tempo: que o bioma
// AFUNDA (a composicao de sub-bioma muda do estagio 1 ao 10) e que a cacada e
// DIRECIONADA (nenhum estagio fica obsoleto — voltar ao 3 pela especie que ele
// da e uma escolha, nao um retrocesso). Uma grade de dez quadrados nao conta
// nenhuma das duas; uma trilha conta as duas de relance.
import { useMemo } from 'react'

import { BIOMAS, BIOMA_POR_CHAVE, SUB_BIOMA_POR_CHAVE, type BiomaDef } from '@/data/biomas'
import {
  ESTAGIOS_POR_BIOMA, estagioId, niveisDoEstagio, pesosDoEstagio, quantidadeDeSalas,
} from '@/data/estagios'
import {
  bloqueioDoEstagio, estagioLiberado, maiorEstagioLimpo, type ProgressoPorBioma,
} from '@/data/progressoDeBioma'
import { MAPS } from '@/data/maps'
import { ENCOUNTERS } from '@/data/huntSpawnOverrides'
import { SPECIES, type Species } from '@/data/pokes'
import { colorForType } from '@/data/typeColors'
import { cn } from '@/lib/utils'

/**
 * O bioma sugerido pra quem esta comecando.
 *
 * ORIENTACAO, E NAO CADEADO — os 12 nascem abertos por decisao de desenho. O
 * risco que isto cobre e concreto: no dia 1 o jogador ve 12 portas que anunciam
 * exatamente a mesma coisa (Lv 1-10), e escolher entre doze iguais nao e
 * liberdade, e paralisia. Campo Aberto porque e o bioma NORMAL, o mais proximo
 * da primeira rota que a hunt inicial ja apresentou.
 */
export const BIOMA_RECOMENDADO = 'campo_aberto'

export type EstadoDoEstagio = 'limpo' | 'atual' | 'liberado' | 'bloqueado'

/**
 * O estado de um estagio pro jogador.
 *
 * Quatro, e nao tres, porque "liberado" e "o proximo que voce tem pra fazer"
 * pesam diferente na tela: o jogador precisa achar onde continuar sem ler os
 * dez. `atual` e o primeiro nao-limpo que esta liberado.
 */
export function estadoDoEstagio(
  progresso: ProgressoPorBioma, bioma: string, estagio: number,
): EstadoDoEstagio {
  const limpo = maiorEstagioLimpo(progresso, bioma)
  if (estagio <= limpo) return 'limpo'
  if (!estagioLiberado(progresso, bioma, estagio)) return 'bloqueado'
  return estagio === limpo + 1 ? 'atual' : 'liberado'
}

/** Os sub-biomas do estagio com a porcentagem de cada um, do maior pro menor. */
export function composicaoDoEstagio(
  bioma: BiomaDef, estagio: number,
): { chave: string; nome: string; pct: number }[] {
  const pesos = pesosDoEstagio(bioma, estagio)
  return Object.entries(pesos)
    .map(([chave, peso]) => ({
      chave,
      nome: SUB_BIOMA_POR_CHAVE[chave]?.sub.nome ?? chave,
      pct: peso * 100,
    }))
    // Sub-bioma com peso 0 nao e sorteado NESTE estagio — mostra-lo com "0%"
    // seria anunciar um lugar que o jogador nunca vai ver aqui. A ausencia dele
    // e justamente o que conta a historia de que o bioma afundou.
    .filter((s) => s.pct > 0.05)
    .sort((a, b) => b.pct - a.pct)
}

/** As especies que podem nascer no estagio, sem repetir. */
export function especiesDoEstagio(mapId: string): Species[] {
  const map = MAPS[mapId]
  if (!map) return []
  const vistas = new Set<string>()
  const lista: Species[] = []
  for (const encId of map.enemyPool) {
    const speciesId = ENCOUNTERS[encId]?.speciesId
    if (!speciesId) continue
    if (vistas.has(speciesId)) continue
    vistas.add(speciesId)
    const sp = SPECIES[speciesId]
    if (sp) lista.push(sp)
  }
  return lista
}

// ---------------------------------------------------------------------------
// Nivel 1 — os 12 biomas
// ---------------------------------------------------------------------------
function CartaoDeBioma({
  bioma, progresso, onEscolher,
}: {
  bioma: BiomaDef
  progresso: ProgressoPorBioma
  onEscolher: () => void
}) {
  const limpo = maiorEstagioLimpo(progresso, bioma.chave)
  const cor = colorForType(bioma.tipo)
  const recomendado = bioma.chave === BIOMA_RECOMENDADO && limpo === 0

  return (
    <button
      type="button"
      onClick={onEscolher}
      className={cn(
        'group flex min-w-0 flex-col gap-[.35em] rounded-[.7em] border p-[.5em] text-left transition-colors',
        'border-n800 bg-n900 hover:border-n600 hover:bg-n800',
      )}
    >
      <div className="flex min-w-0 items-center gap-[.45em]">
        <span
          className="h-[2em] w-[2em] shrink-0 rounded-full"
          style={{ background: cor, boxShadow: `0 0 10px ${cor}66` }}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-n100">{bioma.nome}</div>
          {/* O SELO VAI EMBAIXO, E NAO AO LADO DO NOME. Na bancada, com ele na
              mesma linha, "Campo Aberto" virava "Ca…" e o subtitulo quebrava em
              tres linhas — o cartao recomendado era o unico ilegivel da grade,
              justamente o que o novato precisa ler. */}
          <div className="flex min-w-0 flex-wrap items-center gap-[.3em] text-[.72em] text-n500">
            <span className="truncate">
              {limpo === 0
                ? 'nenhum estágio limpo'
                : limpo >= ESTAGIOS_POR_BIOMA
                  ? 'bioma completo'
                  : `${limpo} de ${ESTAGIOS_POR_BIOMA} estágios`}
            </span>
            {recomendado && (
              <span className="shrink-0 rounded-[.3em] bg-ok/20 px-[.35em] py-[.05em] text-[.86em] font-bold text-ok">
                COMECE AQUI
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Dez tracinhos, um por estagio. Le o progresso do bioma inteiro sem
          ninguem ter que abrir a trilha — e o que faz a tela de 12 responder
          "onde eu parei" em cada um deles ao mesmo tempo. */}
      <div className="flex gap-[.15em]">
        {Array.from({ length: ESTAGIOS_POR_BIOMA }, (_, i) => (
          <span
            key={i}
            className={cn('h-[.3em] flex-1 rounded-full', i < limpo ? '' : 'bg-n700')}
            style={i < limpo ? { background: cor } : undefined}
          />
        ))}
      </div>
    </button>
  )
}

export function MapaDeBiomas({
  progresso, onEscolher,
}: {
  progresso: ProgressoPorBioma
  onEscolher: (chave: string) => void
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(11em,1fr))] gap-[.5em]">
      {BIOMAS.map((bioma) => (
        <CartaoDeBioma
          key={bioma.chave}
          bioma={bioma}
          progresso={progresso}
          onEscolher={() => onEscolher(bioma.chave)}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Nivel 2 — a trilha
// ---------------------------------------------------------------------------
const ROTULO_DO_ESTADO: Record<EstadoDoEstagio, string> = {
  limpo: 'LIMPO · FARM LIVRE',
  atual: 'CONTINUE AQUI',
  liberado: '',
  bloqueado: '',
}

function NoDaTrilha({
  bioma, estagio, estado, progresso, aberto, ehAtiva, onAbrir, onEntrar, entrando,
}: {
  bioma: BiomaDef
  estagio: number
  estado: EstadoDoEstagio
  progresso: ProgressoPorBioma
  aberto: boolean
  ehAtiva: boolean
  onAbrir: () => void
  onEntrar: () => void
  entrando: boolean
}) {
  const mapId = estagioId(bioma.chave, estagio)
  const [lo, hi] = niveisDoEstagio(estagio)
  const cor = colorForType(bioma.tipo)
  const composicao = useMemo(() => composicaoDoEstagio(bioma, estagio), [bioma, estagio])
  const especies = useMemo(() => (aberto ? especiesDoEstagio(mapId) : []), [aberto, mapId])
  // A mensagem sai da MESMA funcao que o servidor usa pra recusar a sessao.
  // Antes cada lado montava a string a mao e um comentario em cada arquivo
  // pedia que nao divergissem (PH-227/229).
  const bloqueio = bloqueioDoEstagio(progresso, bioma.chave, estagio)

  const desabilitado = estado === 'bloqueado'

  return (
    <li className="relative flex gap-[.6em]">
      {/* O TRILHO. Uma linha vertical que atravessa os nos e para no ultimo —
          e ela que faz dez cartoes virarem uma trilha em vez de uma lista. O
          trecho ja percorrido vem na cor do bioma; o que falta, apagado. */}
      <div className="relative flex w-[1.6em] shrink-0 flex-col items-center">
        {estagio > 1 && (
          <span
            className="absolute top-0 h-[1.95em] w-[.18em] rounded-full"
            style={{ background: estado === 'limpo' || estado === 'atual' ? cor : '#3a3a44' }}
          />
        )}
        {estagio < ESTAGIOS_POR_BIOMA && (
          <span
            className="absolute bottom-0 top-[1.95em] w-[.18em] rounded-full"
            style={{ background: estado === 'limpo' ? cor : '#3a3a44' }}
          />
        )}
        <span
          className={cn(
            'relative z-[1] mt-[1.1em] flex h-[1.7em] w-[1.7em] items-center justify-center rounded-full',
            'text-[.8em] font-bold',
          )}
          style={
            estado === 'bloqueado'
              ? { background: '#26262e', color: '#6b6b78', boxShadow: 'inset 0 0 0 .12em #3a3a44' }
              : estado === 'limpo'
                ? { background: cor, color: '#0b0b0f' }
                : { background: '#15151c', color: cor, boxShadow: `inset 0 0 0 .14em ${cor}` }
          }
        >
          {estado === 'limpo' ? '✓' : estagio}
        </span>
      </div>

      <div
        className={cn(
          'mb-[.4em] min-w-0 flex-1 overflow-hidden rounded-[.6em] border bg-n900',
          ehAtiva ? 'border-ok' : estado === 'atual' ? 'border-n600' : 'border-n800',
          // O BLOQUEADO NAO USA `opacity`. Ela apaga o cartao INTEIRO, e a linha
          // que mais importa nele e justamente a que diz o que falta pra
          // liberar — apagar o aviso junto com o resto e o oposto do que a tela
          // quer. O que apaga e o TITULO (abaixo); a mensagem fica legivel.
          desabilitado && 'border-n800/60',
        )}
      >
        <div
          onClick={onAbrir}
          className="flex cursor-pointer items-center gap-[.5em] px-[.5em] py-[.4em] hover:bg-n800"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-[.35em]">
              <span className={cn("font-medium", desabilitado ? "text-n500" : "text-n100")}>Estágio {estagio}</span>
              <span className={cn("text-[.8em]", desabilitado ? "text-n600" : "text-n400")}>Lv {lo}-{hi}</span>
              <span className="text-[.72em] text-n600">{quantidadeDeSalas(mapId)} salas</span>
              {ROTULO_DO_ESTADO[estado] && (
                <span
                  className={cn(
                    'rounded-[.3em] px-[.35em] py-[.05em] text-[.62em] font-bold',
                    estado === 'limpo' ? 'bg-n700 text-n300' : 'bg-ok/20 text-ok',
                  )}
                >
                  {ROTULO_DO_ESTADO[estado]}
                </span>
              )}
              {ehAtiva && (
                <span className="rounded-[.3em] bg-ok/20 px-[.35em] py-[.05em] text-[.62em] font-bold text-ok">
                  EM CAÇADA
                </span>
              )}
            </div>

            {/* A COMPOSICAO DE SUB-BIOMA, na linha de cima e nao escondida no
                detalhe: e ela que conta que o bioma afunda. Ver a Praia cair de
                60% pra 0% ao descer a trilha e a unica leitura direta disso que
                o jogo oferece. */}
            <div className="mt-[.15em] truncate text-[.72em] text-n500">
              {composicao.map((s) => `${s.nome} ${Math.round(s.pct)}%`).join(' · ')}
            </div>

            {desabilitado && bloqueio && (
              <div className="mt-[.15em] text-[.72em] text-warn">{bloqueio}</div>
            )}
          </div>

          <button
            type="button"
            disabled={desabilitado || entrando}
            onClick={(e) => { e.stopPropagation(); onEntrar() }}
            className={cn(
              'shrink-0 rounded-[.4em] px-[.6em] py-[.25em] text-[.8em] font-medium',
              desabilitado
                ? 'cursor-not-allowed bg-n800 text-n600'
                : ehAtiva
                  ? 'bg-ok/20 text-ok hover:bg-ok/30'
                  : 'bg-n700 text-n100 hover:bg-n600',
            )}
          >
            {entrando ? 'Entrando...' : desabilitado ? 'Bloqueado' : ehAtiva ? 'Voltar' : 'Entrar'}
          </button>
        </div>

        {aberto && (
          <div className="flex flex-col gap-[.35em] border-t border-n800 p-[.5em]">
            <div className="flex flex-wrap gap-[.3em]">
              {composicao.map((s) => (
                <span
                  key={s.chave}
                  className="rounded-[.35em] bg-n800 px-[.4em] py-[.1em] text-[.72em] text-n300"
                >
                  {s.nome} <b className="text-n100">{Math.round(s.pct)}%</b>
                </span>
              ))}
            </div>
            <div className="text-[.72em] text-n500">
              POKEs deste estágio ({especies.length})
            </div>
            <div className="flex flex-wrap gap-[.25em]">
              {especies.map((sp) => (
                <span
                  key={sp.id}
                  className="rounded-[.35em] bg-n800 px-[.4em] py-[.1em] text-[.72em] text-n300"
                >
                  {sp.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </li>
  )
}

export function TrilhaDoBioma({
  biomaChave, progresso, mapaAtivoId, abertoId, entrandoId, onAbrir, onEntrar, onVoltar,
}: {
  biomaChave: string
  progresso: ProgressoPorBioma
  mapaAtivoId: string | null
  abertoId: string | null
  entrandoId: string | null
  onAbrir: (mapId: string | null) => void
  onEntrar: (mapId: string) => void
  onVoltar: () => void
}) {
  const bioma = BIOMA_POR_CHAVE[biomaChave]
  if (!bioma) return null
  const limpo = maiorEstagioLimpo(progresso, bioma.chave)

  return (
    <div className="flex flex-col gap-[.4em]">
      <div className="flex items-center gap-[.5em]">
        <button
          type="button"
          onClick={onVoltar}
          className="rounded-[.4em] bg-n800 px-[.5em] py-[.2em] text-[.8em] text-n300 hover:bg-n700"
        >
          ← Biomas
        </button>
        <span className="min-w-0 truncate font-medium text-n100">{bioma.nome}</span>
        <span className="text-[.75em] text-n500">
          {limpo} de {ESTAGIOS_POR_BIOMA} estágios
        </span>
      </div>

      <ol className="flex flex-col">
        {Array.from({ length: ESTAGIOS_POR_BIOMA }, (_, i) => {
          const estagio = i + 1
          const mapId = estagioId(bioma.chave, estagio)
          return (
            <NoDaTrilha
              key={mapId}
              bioma={bioma}
              estagio={estagio}
              estado={estadoDoEstagio(progresso, bioma.chave, estagio)}
              progresso={progresso}
              aberto={abertoId === mapId}
              ehAtiva={mapaAtivoId === mapId}
              entrando={entrandoId === mapId}
              onAbrir={() => onAbrir(abertoId === mapId ? null : mapId)}
              onEntrar={() => onEntrar(mapId)}
            />
          )
        })}
      </ol>
    </div>
  )
}
