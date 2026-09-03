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
import { useMemo, useState } from 'react'

import { BIOMAS, BIOMA_POR_CHAVE, SUB_BIOMA_POR_CHAVE, type BiomaDef } from '@/data/biomas'
import {
  ESTAGIOS_POR_BIOMA, estagioId, niveisDoEstagio, parseEstagioId, pesosDoEstagio,
  quantidadeDeSalas,
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
/**
 * A arte de fundo da trilha de um bioma (PH-441).
 *
 * URL RELATIVA, como toda arte do jogo: `assets/` mora na RAIZ do repo, fora de
 * `public/`, e e servida por um plugin em dev e copiada pro `dist` no build
 * (ver vite.config.ts e scripts/copiar-assets.mjs). Um caminho absoluto aqui
 * quebraria no site publicado sem quebrar em dev.
 *
 * O nome do arquivo E a chave do bioma, e nao o nome de exibicao: as artes
 * chegaram como "campo aberto.jpg" e "metropole.jpg" (o Urbano), e nome com
 * espaco, maiuscula e acento vira URL fragil — o 404 de arte nao lanca erro
 * nenhum, so nao desenha.
 */
export function urlDoFundoDoBioma(chave: string): string {
  return `assets/biome-selector/${chave}.jpg`
}

/**
 * O fundo, com a arte entrando por cima da cor.
 *
 * TRES CAMADAS, e cada uma resolve um problema distinto:
 *
 *  1. a COR do bioma (no elemento-pai) — o piso enquanto os ~3 MB nao chegam;
 *  2. a ARTE, que aparece com transicao quando carrega. `onLoad` e nao
 *     `background-image` porque so o `<img>` avisa quando terminou, e sem esse
 *     aviso a unica opcao seria mostrar a arte na hora — que e o "pisca";
 *  3. o VEU escuro, que e o que torna o texto legivel. As 12 artes sao fotos
 *     de cena, com area clara e area escura na mesma imagem: sem o veu, metade
 *     dos nomes de estagio some no claro e a outra metade nao.
 */
function FundoDoBioma({ biomaChave }: { biomaChave: string }) {
  const [carregou, setCarregou] = useState(false)
  // A chave force a remontagem ao trocar de bioma: sem ela o `carregou` de um
  // bioma valeria pro seguinte, e a arte nova apareceria sem transicao.
  return (
    <div key={biomaChave} aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      <img
        src={urlDoFundoDoBioma(biomaChave)}
        alt=""
        onLoad={() => setCarregou(true)}
        className={cn(
          'h-full w-full object-cover transition-opacity duration-500',
          carregou ? 'opacity-100' : 'opacity-0',
        )}
      />
      {/* O VEU E O QUE TORNA O TEXTO LEGIVEL, e calibrar a forca dele foi feito
          na bancada: a 85% a arte sumia (o motivo de ela existir ia junto), e
          sem veu nenhum metade dos nomes de estagio desaparecia nas areas
          claras das fotos. Mais forte em cima e embaixo, onde ficam o
          cabecalho e o fim da lista. */}
      <div className="absolute inset-0 bg-gradient-to-b from-n900/80 via-n900/40 to-n900/85" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// O CAMINHO
// ---------------------------------------------------------------------------
/**
 * Onde cada um dos 10 nos fica sobre a arte, em coordenadas RELATIVAS (0-1).
 *
 * POR QUE RELATIVAS. A area do mapa muda de largura com a tela, e a arte e
 * `object-cover`. Coordenada em pixel casaria com uma largura so e sairia do
 * lugar em qualquer outra — o no ficaria fora do caminho que ele deveria
 * seguir, sem nada quebrar.
 *
 * O CAMINHO DESCE, e isso nao e estetica: as 12 artes foram desenhadas
 * acompanhando a profundidade do bioma (no Marinho, ceu e praia em cima, leito
 * oceanico com corais embaixo; no Gelido, floresta nevada em cima e caverna de
 * gelo no fundo). Como o estagio 1 e o raso e o 10 e o fundo, um caminho que
 * subisse poria o estagio 10 na praia — a arte contaria o contrario da
 * mecanica.
 *
 * UM CAMINHO SO PRA OS 12, E NAO 120 COORDENADAS A MAO. Afinar cada no contra
 * cada arte fica melhor e custa 120 numeros que ninguem revisa e que quebram na
 * primeira troca de arte. O override existe (`CAMINHO_POR_BIOMA`) pra o bioma
 * cuja arte pedir outra coisa — mesmo padrao da curva de profundidade em
 * `estagios.ts`: uma regra que serve pra todos, com escape nomeado.
 *
 * A serpentina fica entre 10% e 90% da altura de proposito: a arte e quadrada
 * e a area do mapa e 4/3, entao `object-cover` corta um pouco de cima e de
 * baixo. No sem folga cairia bem na borda do corte.
 */
export const CAMINHO_PADRAO: readonly (readonly [number, number])[] = [
  [0.14, 0.10],
  [0.34, 0.17],
  [0.51, 0.27],
  [0.33, 0.37],
  [0.51, 0.46],
  [0.71, 0.52],
  [0.84, 0.62],
  [0.65, 0.71],
  [0.44, 0.79],
  [0.62, 0.90],
]

/**
 * Caminho proprio de um bioma, quando a arte dele pedir. Vazio hoje — o escape
 * existe pra nao travar em 120 coordenadas antes de alguem ver como o caminho
 * padrao cai sobre cada imagem.
 */
export const CAMINHO_POR_BIOMA: Record<string, readonly (readonly [number, number])[]> = {}

export function caminhoDoBioma(chave: string): readonly (readonly [number, number])[] {
  return CAMINHO_POR_BIOMA[chave] ?? CAMINHO_PADRAO
}

// ---------------------------------------------------------------------------
// O no sobre o mapa
// ---------------------------------------------------------------------------
/**
 * O rotulo curto do estado.
 *
 * ELE MIGROU PRO PAINEL com o desenho espacial: o no e um circulo com um
 * numero e nao carrega texto nenhum. O estado dele se le por forma e cor.
 */
const ROTULO_DO_ESTADO: Record<EstadoDoEstagio, string> = {
  limpo: 'LIMPO · FARM LIVRE',
  atual: 'CONTINUE AQUI',
  liberado: '',
  bloqueado: '',
}

function NoNoMapa({
  estagio, estado, cor, x, y, selecionado, ehAtiva, onSelecionar,
}: {
  estagio: number
  estado: EstadoDoEstagio
  cor: string
  x: number
  y: number
  selecionado: boolean
  ehAtiva: boolean
  onSelecionar: () => void
}) {
  const bloqueado = estado === 'bloqueado'
  return (
    <button
      type="button"
      onClick={onSelecionar}
      aria-label={`Estágio ${estagio}`}
      aria-pressed={selecionado}
      className={cn(
        'absolute z-[2] flex h-[2.4em] w-[2.4em] -translate-x-1/2 -translate-y-1/2',
        'items-center justify-center rounded-full text-[.85em] font-bold transition-transform',
        'hover:scale-110',
        // O ATUAL PULSA. Com dez pontos espalhados sobre uma foto, "onde eu
        // continuo" nao se acha lendo — precisa de um canal que o olho pegue
        // antes de qualquer texto.
        estado === 'atual' && 'animate-pulse',
      )}
      style={{
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        background: bloqueado ? '#1a1a22' : estado === 'limpo' ? cor : '#12121a',
        color: bloqueado ? '#6b6b78' : estado === 'limpo' ? '#0b0b0f' : cor,
        // Anel duplo: o de dentro na cor do estado, o de fora PRETO. As artes
        // tem area clara, e um anel claro sobre neve some — o contorno escuro
        // e o que garante a silhueta do no em qualquer foto.
        boxShadow: bloqueado
          ? 'inset 0 0 0 .14em #3a3a44, 0 0 0 .16em rgba(0,0,0,.75)'
          : `inset 0 0 0 .16em ${cor}, 0 0 0 .16em rgba(0,0,0,.75), 0 0 .9em ${cor}88`,
        outline: selecionado ? '.18em solid #f4f4f6' : undefined,
        outlineOffset: '.12em',
      }}
    >
      {estado === 'limpo' ? '✓' : estagio}
      {ehAtiva && (
        <span
          aria-hidden
          className="absolute -right-[.15em] -top-[.15em] h-[.7em] w-[.7em] rounded-full bg-ok"
          style={{ boxShadow: '0 0 0 .12em rgba(0,0,0,.75)' }}
        />
      )}
    </button>
  )
}

/**
 * A linha que liga os nos, em SVG sobre a arte.
 *
 * DOIS TRACOS, e nao um: o trecho ja percorrido vem na cor do bioma e o que
 * falta vem pontilhado e apagado. Uma linha unica desenharia um caminho sem
 * progresso — e o progresso e a unica coisa que a FORMA da trilha existe pra
 * contar.
 *
 * Cada traco vai com um contorno preto por baixo. As 12 artes tem area clara: a
 * linha na cor do bioma sozinha some na neve do Gelido e no ceu do Marinho.
 *
 * `preserveAspectRatio="none"` com viewBox 0-100 deixa o SVG esticar junto com
 * a caixa, entao as coordenadas do caminho e as do SVG sao as MESMAS — os nos
 * (posicionados em %) e a linha nunca saem de sincronia.
 */
function LinhaDoCaminho({
  pontos, limpo, cor,
}: {
  pontos: readonly (readonly [number, number])[]
  limpo: number
  cor: string
}) {
  const traco = (de: number, ate: number) => pontos
    .slice(de, ate)
    .map(([x, y]) => `${x * 100},${y * 100}`)
    .join(' ')
  // O trecho percorrido vai ate o no do ultimo estagio limpo, e o que falta
  // comeca NELE — senao haveria um vao entre os dois.
  const feito = traco(0, Math.max(limpo, 1))
  const falta = traco(Math.max(limpo - 1, 0), pontos.length)

  return (
    <svg
      aria-hidden
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 z-[1] h-full w-full"
    >
      <polyline
        points={falta} fill="none" stroke="rgba(0,0,0,.55)"
        strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <polyline
        points={falta} fill="none" stroke="#8b8b99" strokeDasharray="6 6"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {limpo > 0 && (
        <>
          <polyline
            points={feito} fill="none" stroke="rgba(0,0,0,.6)"
            strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <polyline
            points={feito} fill="none" stroke={cor}
            strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </>
      )}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// O painel de detalhe
// ---------------------------------------------------------------------------
/**
 * O que a lista vertical mostrava em cada linha, agora num painel so.
 *
 * O NO NAO CABE ISSO. Um circulo com um numero nao carrega faixa de nivel,
 * composicao de sub-bioma com porcentagem, contagem de salas e mensagem de
 * bloqueio — e foi exatamente por isso que a primeira versao virou uma lista.
 * A troca e a das duas referencias que o dono mandou: o mapa responde "onde
 * estou e pra onde vou", o painel responde "o que tem la".
 */
function PainelDoEstagio({
  bioma, estagio, estado, progresso, ehAtiva, entrando, onEntrar,
}: {
  bioma: BiomaDef
  estagio: number
  estado: EstadoDoEstagio
  progresso: ProgressoPorBioma
  ehAtiva: boolean
  entrando: boolean
  onEntrar: () => void
}) {
  const mapId = estagioId(bioma.chave, estagio)
  const [lo, hi] = niveisDoEstagio(estagio)
  const composicao = useMemo(() => composicaoDoEstagio(bioma, estagio), [bioma, estagio])
  const especies = useMemo(() => especiesDoEstagio(mapId), [mapId])
  const bloqueio = bloqueioDoEstagio(progresso, bioma.chave, estagio)
  const bloqueado = estado === 'bloqueado'

  return (
    <div className="flex flex-col gap-[.4em] rounded-[.6em] border border-n800 bg-n900 p-[.55em]">
      <div className="flex flex-wrap items-center gap-[.4em]">
        <span className="font-semibold text-n100">Estágio {estagio}</span>
        <span className="text-[.8em] text-n400">Lv {lo}-{hi}</span>
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
        <span className="flex-1" />
        <button
          type="button"
          disabled={bloqueado || entrando}
          onClick={onEntrar}
          className={cn(
            'shrink-0 rounded-[.4em] px-[.7em] py-[.25em] text-[.85em] font-medium',
            bloqueado
              ? 'cursor-not-allowed bg-n800 text-n600'
              : ehAtiva
                ? 'bg-ok/20 text-ok hover:bg-ok/30'
                : 'bg-n700 text-n100 hover:bg-n600',
          )}
        >
          {entrando ? 'Entrando...' : bloqueado ? 'Bloqueado' : ehAtiva ? 'Voltar' : 'Entrar'}
        </button>
      </div>

      {bloqueado && bloqueio && <div className="text-[.78em] text-warn">{bloqueio}</div>}

      {/* A COMPOSICAO DE SUB-BIOMA e o que conta que o bioma afunda: no Marinho
          a Praia cai de 60% pra 0% e o Leito Oceanico sobe de 0% pra 79% ao
          descer os dez. Sub-bioma de peso zero nao aparece — a ausencia dele E
          a historia. */}
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

      <div className="text-[.72em] text-n500">POKEs deste estágio ({especies.length})</div>
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
  )
}

// ---------------------------------------------------------------------------
// A trilha
// ---------------------------------------------------------------------------
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
  const cor = colorForType(bioma.tipo)
  const pontos = caminhoDoBioma(bioma.chave)

  // O painel abre no estagio ATUAL quando o jogador entra no bioma, e nao
  // vazio: chegar num mapa e ter que adivinhar qual dos dez clicar e o mesmo
  // problema que o pulso do no resolve — so que sem resposta nenhuma.
  const doAberto = abertoId != null ? parseEstagioId(abertoId) : null
  const selecionado = doAberto?.bioma === bioma.chave
    ? doAberto.estagio
    : Math.min(limpo + 1, ESTAGIOS_POR_BIOMA)

  return (
    <div className="flex flex-col gap-[.5em]">
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

      {/* O MAPA. Proporcao FIXA pra a arte nao distorcer e pra as coordenadas
          relativas do caminho valerem em qualquer largura de tela. */}
      <div
        data-testid="mapa-da-trilha"
        className="relative isolate aspect-[4/3] w-full overflow-hidden rounded-[.7em] border border-n800"
        style={{ background: bioma.bg.primary }}
      >
        <FundoDoBioma biomaChave={bioma.chave} />
        <LinhaDoCaminho pontos={pontos} limpo={limpo} cor={cor} />
        {pontos.map(([x, y], i) => {
          const estagio = i + 1
          const mapId = estagioId(bioma.chave, estagio)
          return (
            <NoNoMapa
              key={mapId}
              estagio={estagio}
              estado={estadoDoEstagio(progresso, bioma.chave, estagio)}
              cor={cor}
              x={x}
              y={y}
              selecionado={selecionado === estagio}
              ehAtiva={mapaAtivoId === mapId}
              onSelecionar={() => onAbrir(mapId)}
            />
          )
        })}
      </div>

      <PainelDoEstagio
        bioma={bioma}
        estagio={selecionado}
        estado={estadoDoEstagio(progresso, bioma.chave, selecionado)}
        progresso={progresso}
        ehAtiva={mapaAtivoId === estagioId(bioma.chave, selecionado)}
        entrando={entrandoId === estagioId(bioma.chave, selecionado)}
        onEntrar={() => onEntrar(estagioId(bioma.chave, selecionado))}
      />
    </div>
  )
}
