// A aba "Biomas" da Wiki: o atlas visual dos 12 biomas, dos sub-biomas de cada
// um e das salas especiais (pedido do dono, 16/10/2026).
//
// TUDO VEM DE `data/atlasDosBiomas.ts`, que deriva do mesmo dado que o motor le
// (curva de profundidade, tabela de elenco, clima, loot). A Wiki nao tem numero
// digitado: rebalancear um sub-bioma muda esta tela junto.
//
// SEM AS ARTES DE FUNDO, DE PROPOSITO. Cada fundo tem 2048 px e de 1 a 4 MB; um
// bioma com seis sub-biomas baixaria dez a vinte megas so pra uma miniatura. O
// visual sai de cor por sub-bioma, da barra de composicao por estagio e do icone
// de rosto dos POKEs, que ja e leve e cacheado.
import { useState } from 'react'

import { ATLAS_DOS_BIOMAS, type FichaDoBioma, type FichaDoSubBioma } from '@/data/atlasDosBiomas'
import { CHANCE_DE_SALA_ESPECIAL, CHANCE_DA_PEDRA_TEMATICA } from '@/data/biomas'
import { ESTAGIOS_POR_BIOMA, niveisDoEstagio } from '@/data/estagios'
import { getItem } from '@/data/items'
import { SPECIES } from '@/data/pokes'
import { colorForType } from '@/data/typeColors'
import { APARENCIA } from '@/components/hud/ClimaChip'
import { PokeSwatch } from '@/components/shared/PokeSwatch'
import { TypeChip } from '@/components/shared/TypeChip'
import { WikiCard } from './WikiCard'

// Uma cor por posicao do sub-bioma no bioma. Distintas entre si e legiveis no
// fundo escuro; seis bastam (nenhum bioma tem mais que seis sub-biomas comuns).
const CORES = ['#5aa9e6', '#f2a541', '#7bc96f', '#e06c9f', '#b388eb', '#e5d352']

const pct = (x: number) => `${Math.round(x * 100)}%`

function nomeDoClima(tipo: string): { simbolo: string; nome: string } {
  if (tipo === 'limpo') return { simbolo: '🌤️', nome: 'Céu limpo' }
  const ap = APARENCIA[tipo as keyof typeof APARENCIA]
  return ap ? { simbolo: ap.simbolo, nome: ap.nome } : { simbolo: '', nome: tipo }
}

function intervalo(estagios: number[]): string {
  if (estagios.length === 0) return '—'
  const de = estagios[0]
  const ate = estagios[estagios.length - 1]
  return de === ate ? `estágio ${de}` : `estágios ${de} a ${ate}`
}

function Climas({ climas }: { climas: FichaDoSubBioma['climas'] }) {
  return (
    <span className="flex flex-wrap gap-[.35em]">
      {climas.map((c) => {
        const { simbolo, nome } = nomeDoClima(c.tipo)
        return (
          <span key={c.tipo} className="rounded bg-muted/40 px-[.35em] text-[.85em]" title={nome}>
            {simbolo} {nome} {pct(c.chance)}
          </span>
        )
      })}
    </span>
  )
}

function Itens({ itens }: { itens: string[] }) {
  return <span>{itens.map((id) => getItem(id)?.name ?? id).join(' · ')}</span>
}

function Rostos({ especies, destaque = [] }: { especies: readonly string[]; destaque?: readonly string[] }) {
  return (
    <span className="flex flex-wrap gap-[.25em]">
      {especies.map((id) => {
        const sp = SPECIES[id]
        if (!sp) return null
        const exclusivo = destaque.includes(id)
        return (
          <span key={id} className="flex flex-col items-center" title={sp.name}>
            <PokeSwatch species={sp} size={2.2} className={exclusivo ? 'ring-2 ring-amber-300 rounded-[.5em]' : undefined} />
            <span className={`text-[.65em] ${exclusivo ? 'font-semibold text-amber-300' : 'text-menu-muted'}`}>{sp.name}</span>
          </span>
        )
      })}
    </span>
  )
}

/** As 10 colunas da trilha: de que sub-biomas cada estagio e feito. */
function BarraDeComposicao({ ficha }: { ficha: FichaDoBioma }) {
  const cor = new Map(ficha.subBiomas.map((s, i) => [s.sub.chave, CORES[i % CORES.length]]))
  return (
    <div>
      <div className="flex h-[7em] items-stretch gap-[.2em]">
        {ficha.composicao.map((pesos, i) => (
          <div key={i} className="flex flex-1 flex-col-reverse overflow-hidden rounded-sm border" title={`Estágio ${i + 1}`}>
            {ficha.subBiomas.map((s) => {
              const f = pesos[s.sub.chave] ?? 0
              if (f <= 0) return null
              return (
                <div
                  key={s.sub.chave}
                  style={{ height: `${f * 100}%`, background: cor.get(s.sub.chave) }}
                  title={`Estágio ${i + 1}: ${s.sub.nome} ${pct(f)}`}
                />
              )
            })}
          </div>
        ))}
      </div>
      <div className="mt-[.2em] flex gap-[.2em] text-center text-[.7em] text-menu-muted">
        {Array.from({ length: ESTAGIOS_POR_BIOMA }, (_, i) => (
          <span key={i} className="flex-1">{i + 1}</span>
        ))}
      </div>
      <div className="mt-[.4em] flex flex-wrap gap-[.5em] text-[.8em]">
        {ficha.subBiomas.map((s) => (
          <span key={s.sub.chave} className="flex items-center gap-[.3em]">
            <span className="inline-block h-[.8em] w-[.8em] rounded-sm" style={{ background: cor.get(s.sub.chave) }} />
            {s.sub.nome}
          </span>
        ))}
      </div>
    </div>
  )
}

function CartaoDoSubBioma({ ficha, cor }: { ficha: FichaDoSubBioma; cor: string }) {
  const [de] = niveisDoEstagio(ficha.estagios[0] ?? 1)
  const [, ate] = niveisDoEstagio(ficha.estagios[ficha.estagios.length - 1] ?? 1)
  return (
    <div className="rounded-md border px-2 py-1.5" style={{ borderLeft: `.35em solid ${cor}` }}>
      <div className="flex flex-wrap items-baseline justify-between gap-[.4em]">
        <span className="font-semibold">{ficha.sub.nome}</span>
        <span className="text-[.8em] text-menu-muted">
          {intervalo(ficha.estagios)} (Lv {de}–{ate}) · mais comum no estágio {ficha.pico} ({pct(ficha.fatiaNoPico)} das salas)
        </span>
      </div>
      <div className="mt-[.35em] flex flex-col gap-[.3em] text-[.8em]">
        <div><span className="text-menu-muted">Clima: </span><Climas climas={ficha.climas} /></div>
        <div><span className="text-menu-muted">Itens: </span><Itens itens={ficha.itens} /></div>
        <div>
          <div className="mb-[.15em] text-menu-muted">Mais comuns no auge:</div>
          <Rostos especies={ficha.destaques} />
        </div>
      </div>
    </div>
  )
}

function SalasEspeciais({ ficha }: { ficha: FichaDoBioma }) {
  if (ficha.especiais.length === 0) return null
  return (
    <div className="flex flex-col gap-[.45em]">
      <div className="font-semibold">✨ Salas especiais</div>
      {ficha.especiais.map((e) => (
        <div key={e.sala.chave} className="rounded-md border border-amber-300/50 bg-amber-300/5 px-2 py-1.5">
          <div className="flex flex-wrap items-baseline justify-between gap-[.4em]">
            <span className="font-semibold text-amber-200">{e.sala.nome}</span>
            <span className="text-[.8em] text-menu-muted">
              {e.sala.estagioMinimo > 1 ? `a partir do estágio ${e.sala.estagioMinimo}` : 'em qualquer estágio'}
            </span>
          </div>
          <div className="mt-[.35em] flex flex-col gap-[.3em] text-[.8em]">
            {e.sala.pedra && (
              <div className="flex items-center gap-[.35em]">
                <span className="text-menu-muted">Pedra extra:</span> <TypeChip type={e.sala.pedra} />
              </div>
            )}
            {e.sala.shiny && (
              <div>
                <span className="text-menu-muted">Shiny: </span>
                {SPECIES[e.sala.shiny.especie]?.name} aparece shiny {e.sala.shiny.multiplicador}× mais vezes aqui.
              </div>
            )}
            <div><span className="text-menu-muted">Clima: </span><Climas climas={e.climas} /></div>
            <div><span className="text-menu-muted">Itens: </span><Itens itens={e.itens} /></div>
            <div>
              <div className="mb-[.15em] text-menu-muted">
                Quem aparece{e.exclusivas.length > 0 ? ' (em dourado: só existe nesta sala)' : ''}:
              </div>
              <Rostos especies={e.especies} destaque={e.exclusivas} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function BiomasTab() {
  const [chave, setChave] = useState(ATLAS_DOS_BIOMAS[0].bioma.chave)
  const ficha = ATLAS_DOS_BIOMAS.find((f) => f.bioma.chave === chave) ?? ATLAS_DOS_BIOMAS[0]
  const totalSub = ATLAS_DOS_BIOMAS.reduce((a, f) => a + f.subBiomas.length, 0)
  const totalEsp = ATLAS_DOS_BIOMAS.reduce((a, f) => a + f.especiais.length, 0)

  return (
    <div className="space-y-2">
      <WikiCard title="Como um bioma é montado">
        Cada um dos <b>{ATLAS_DOS_BIOMAS.length} biomas</b> é feito de <b>sub-biomas</b> — {totalSub} no jogo
        todo. Toda vez que você entra numa sala, o jogo sorteia em qual sub-bioma ela fica, e é o sub-bioma
        que decide <b>quem aparece</b>, o <b>clima</b> e os <b>itens</b> que caem.
        <br />
        <br />
        O sorteio muda conforme você <b>afunda</b> no bioma: cada sub-bioma tem os estágios em que manda. A
        barra colorida de cada bioma mostra isso — uma coluna por estágio, com a fatia de salas de cada lugar.
        <br />
        <br />
        Além deles existem <b>{totalEsp} salas especiais</b>, lugares do anime e dos jogos. Toda troca de sala
        tem <b>{pct(CHANCE_DE_SALA_ESPECIAL)}</b> de chance de cair numa delas (nunca na primeira sala da
        caçada). Nelas cada abate pode soltar uma <b>Pedra extra</b> do tipo do lugar
        ({pct(CHANCE_DA_PEDRA_TEMATICA)} a mais), e alguns Pokémon só existem lá.
      </WikiCard>

      <div className="flex flex-wrap gap-[.35em]">
        {ATLAS_DOS_BIOMAS.map((f) => {
          const ativo = f.bioma.chave === chave
          return (
            <button
              key={f.bioma.chave}
              type="button"
              onClick={() => setChave(f.bioma.chave)}
              aria-pressed={ativo}
              className={`rounded px-[.6em] py-[.25em] text-[.8em] font-medium text-white transition ${ativo ? 'ring-2 ring-white' : 'opacity-75 hover:opacity-100'}`}
              style={{ background: colorForType(f.bioma.tipo) }}
            >
              {f.bioma.nome}
            </button>
          )
        })}
      </div>

      <div
        className="rounded-md border p-2"
        style={{ background: `linear-gradient(135deg, ${ficha.bioma.bg.primary}, ${ficha.bioma.bg.secondary})` }}
      >
        <div className="flex items-center justify-between gap-[.5em]">
          <span className="text-[1.15em] font-bold text-white">{ficha.bioma.nome}</span>
          <span className="flex items-center gap-[.35em] text-[.8em] text-white/80">
            Tipo dominante <TypeChip type={ficha.bioma.tipo} />
          </span>
        </div>
        <div className="mt-[.2em] text-[.8em] text-white/80">
          {ficha.subBiomas.length} sub-biomas
          {ficha.especiais.length > 0 ? ` e ${ficha.especiais.length} sala${ficha.especiais.length > 1 ? 's' : ''} especia${ficha.especiais.length > 1 ? 'is' : 'l'}` : ''}
        </div>
        <div className="mt-[.6em] rounded bg-black/30 p-[.5em]">
          <div className="mb-[.3em] text-[.8em] text-white/80">De que é feito cada estágio</div>
          <BarraDeComposicao ficha={ficha} />
        </div>
      </div>

      <div className="flex flex-col gap-[.45em]">
        {ficha.subBiomas.map((s, i) => (
          <CartaoDoSubBioma key={s.sub.chave} ficha={s} cor={CORES[i % CORES.length]} />
        ))}
      </div>

      <SalasEspeciais ficha={ficha} />
    </div>
  )
}
