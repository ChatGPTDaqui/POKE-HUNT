// Corpo do painel de automacoes.
//
// REORGANIZACAO (pedido explicito): as tres automacoes viraram tres blocos
// fechados — Auto-catch, Auto-pot e Auto-revive —, cada um com o proprio toggle
// no cabecalho e as proprias regras dentro. Antes os toggles e as regras
// estavam intercalados em fluxo unico: "Auto-pot", a regra de pocao, "Auto-
// catch", "Catch Shiny", as bolas, as regras por especie, e so no fim
// "Auto-revive" — quem procurava a configuracao de captura passava por uma
// regra de pocao no caminho.
//
// Duas coisas do vanilla continuam nao sendo portadas de proposito:
//  - `updateAutoPanelCounts` rodando a cada frame pra manter os badges vivos:
//    era workaround pra nao reconstruir DOM interativo debaixo do ponteiro.
//    Aqui as contagens saem de selectors do Zustand.
//  - `controller.save()` apos cada mutacao: o `persist` grava sozinho.
import { useEffect, useMemo, useRef } from 'react'
import { Question, Warning } from '@phosphor-icons/react'
import { ITEMS } from '@/data/items'
import { SPECIES } from '@/data/pokes'
import { getEncounter } from '@/data/enemies'
import { BEST_POTION_OPTION } from '@/engine/systems/autoSystem'
import { useGameStateStore } from '@/stores/gameStateStore'
import { sincronizarAuto } from '@/data/remote/autoridade'
import { useWorldStore } from '@/stores/worldStore'
import { GameButton, GameCheck, GameInput, GameSelect, GameSwitch } from '@/components/game/controls'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { estoqueDoItemDeRegra, itensEmUso, LIMIAR_ESTOQUE_BAIXO } from './estoqueBaixo'
import { usePrevisaoDeConsumo, formatarTempoRestante, rotuloDoRecurso } from './consumo'
import { ItemPicker, type OpcaoDeItem } from './ItemPicker'
import { cn } from '@/lib/utils'

const MAX_AUTO_POT_RULES = 3

const POTION_OPTIONS = Object.values(ITEMS).filter((i) => i.kind === 'potion')
const BALL_OPTIONS = Object.values(ITEMS).filter((i) => i.kind === 'ball')

function InfoIcon({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="inline-flex h-[1.15em] w-[1.15em] cursor-help items-center justify-center rounded-full border border-n600 text-n500" />
        }
      >
        <Question className="text-[.7em]" />
      </TooltipTrigger>
      <TooltipContent className="max-w-[18em] bg-popover text-popover-foreground">{text}</TooltipContent>
    </Tooltip>
  )
}

/** Monta as opcoes do ItemPicker com estoque e alerta ja resolvidos. */
function useOpcoes(base: { id: string; name: string }[], emUso: boolean, extra?: OpcaoDeItem): OpcaoDeItem[] {
  const items = useGameStateStore((s) => s.items)
  const lista = base.map((item) => {
    const quantidade = estoqueDoItemDeRegra(items, item.id)
    return {
      id: item.id,
      nome: item.name,
      quantidade,
      // `emUso` decide se alerta. Um item selecionado numa automacao DESLIGADA
      // nao pisca: o bot nao vai gasta-lo, e um alerta que grita sem motivo e
      // um alerta que o jogador aprende a ignorar.
      alerta: emUso && quantidade < LIMIAR_ESTOQUE_BAIXO,
    }
  })
  return extra ? [extra, ...lista] : lista
}

/** Bloco de uma automacao: cabecalho com toggle + corpo com as regras dela. */
function BlocoAuto({
  titulo, dica, ligado, aoLigar, extraCabecalho, children,
}: {
  titulo: string
  dica: string
  ligado: boolean
  aoLigar: (v: boolean) => void
  extraCabecalho?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <section
      className={cn(
        'flex flex-col gap-[.5em] rounded-[.7em] border p-[.6em] transition-colors',
        ligado ? 'border-n700 bg-n900/60' : 'border-n800',
      )}
    >
      <header className="flex items-center gap-[.5em]">
        <span className="flex flex-1 items-center gap-[.4em] font-medium">
          {titulo}
          <InfoIcon text={dica} />
        </span>
        {extraCabecalho}
        <GameSwitch checked={ligado} onChange={aoLigar} label={titulo} />
      </header>
      {/* O corpo continua visivel com a automacao desligada, so esmaecido: a
          configuracao e o motivo de o jogador abrir este painel, e escondê-la
          faria "ligar" virar um salto no escuro. */}
      {children && <div className={cn('flex flex-col gap-[.5em]', !ligado && 'opacity-55')}>{children}</div>}
    </section>
  )
}

/** Aviso minimalista de "os suprimentos estao acabando". */
function PrevisaoDeRecursos() {
  // `itensEmUso` devolve um ARRAY NOVO a cada chamada, entao usa-lo direto como
  // selector do zustand nunca compara igual e o componente re-renderiza pra
  // sempre ("Maximum update depth exceeded", reproduzido ao vivo). Os quatro
  // pedacos de estado sao selecionados individualmente (referencias estaveis) e
  // a lista e derivada num `useMemo`.
  const autoToggles = useGameStateStore((s) => s.autoToggles)
  const autoPotRules = useGameStateStore((s) => s.autoPotRules)
  const autoCatchConfig = useGameStateStore((s) => s.autoCatchConfig)
  const autoCatchRules = useGameStateStore((s) => s.autoCatchRules)
  const emUso = useMemo(
    () => itensEmUso({ autoToggles, autoPotRules, autoCatchConfig, autoCatchRules }),
    [autoToggles, autoPotRules, autoCatchConfig, autoCatchRules],
  )
  const previsoes = usePrevisaoDeConsumo(emUso)
  if (previsoes.length === 0) return null
  return (
    <div className="flex flex-col gap-[.2em] rounded-[.6em] border border-bad/50 bg-bad/8 px-[.6em] py-[.45em] text-[.8em]">
      <span className="flex items-center gap-[.35em] font-medium text-bad">
        <Warning weight="fill" /> Suprimentos acabando
      </span>
      {previsoes.map((p) => (
        <span key={p.itemId} className="flex justify-between gap-[.45em] text-n300">
          <span className="truncate">{rotuloDoRecurso(p.itemId, (id) => ITEMS[id]?.name ?? id)}</span>
          <span className="shrink-0 tabular-nums">
            {formatarTempoRestante(p.horasRestantes)}
            <span className="text-n500"> · {Math.round(p.porHora)}/h</span>
          </span>
        </span>
      ))}
    </div>
  )
}

// Especies que podem nascer na hunt atual — mesma cadeia enemyPool ->
// encounter -> species que o HuntMenu usa. Deduplicado, ja que a mesma especie
// pode ter varias linhas de encontro no mesmo pool.
function useCurrentHuntSpecies() {
  const mapDef = useWorldStore((s) => s.mapDef)
  if (!mapDef) return []
  const seen = new Map<string, (typeof SPECIES)[string]>()
  for (const encounterId of mapDef.enemyPool) {
    const enc = getEncounter(encounterId)
    const species = enc && SPECIES[enc.speciesId]
    if (species && !seen.has(species.id)) seen.set(species.id, species)
  }
  return [...seen.values()]
}

export function AutoPanel() {
  const autoToggles = useGameStateStore((s) => s.autoToggles)
  const autoPotRules = useGameStateStore((s) => s.autoPotRules)
  const autoCatchConfig = useGameStateStore((s) => s.autoCatchConfig)
  const autoCatchRules = useGameStateStore((s) => s.autoCatchRules)
  const autoStatusConfig = useGameStateStore((s) => s.autoStatusConfig)
  const setAutoToggle = useGameStateStore((s) => s.setAutoToggle)
  const setAutoStatusItem = useGameStateStore((s) => s.setAutoStatusItem)
  const addAutoPotRule = useGameStateStore((s) => s.addAutoPotRule)
  const updateAutoPotRule = useGameStateStore((s) => s.updateAutoPotRule)
  const removeAutoPotRule = useGameStateStore((s) => s.removeAutoPotRule)
  const setAutoCatchConfig = useGameStateStore((s) => s.setAutoCatchConfig)
  const addAutoCatchRule = useGameStateStore((s) => s.addAutoCatchRule)
  const updateAutoCatchRule = useGameStateStore((s) => s.updateAutoCatchRule)
  const removeAutoCatchRule = useGameStateStore((s) => s.removeAutoCatchRule)

  // A config de auto e sincronizada em BLOCO quando muda, em vez de rotear os
  // 14 pontos de mutacao um a um — ver sincronizarAuto(). Nao e cosmetico: o
  // servidor le estas regras ao decidir usar pocao/bola durante a simulacao.
  //
  // O primeiro disparo e ignorado de proposito: ele aconteceria logo apos o
  // estado chegar DO servidor, e mandaria os mesmos valores de volta a cada
  // abertura do painel.
  const primeiraSync = useRef(true)
  useEffect(() => {
    if (primeiraSync.current) {
      primeiraSync.current = false
      return
    }
    sincronizarAuto()
  }, [autoToggles, autoPotRules, autoCatchConfig, autoCatchRules, autoStatusConfig])

  const huntSpecies = useCurrentHuntSpecies()
  const opcoesPocao = useOpcoes(POTION_OPTIONS, autoToggles.autoPot, {
    id: BEST_POTION_OPTION, nome: 'Escolher melhor', quantidade: null,
  })
  const opcoesBola = useOpcoes(BALL_OPTIONS, autoToggles.autoCatch)
  const opcoesBolaShiny = useOpcoes(BALL_OPTIONS, autoToggles.autoCatch && autoCatchConfig.catchShinyEnabled)
  const opcoesRevive = useOpcoes(
    Object.values(ITEMS).filter((i) => i.kind === 'revive'),
    autoToggles.autoRevive,
  )
  const opcoesCuraDeStatus = useOpcoes(
    Object.values(ITEMS).filter((i) => i.kind === 'status_heal'),
    autoToggles.autoStatus,
  )

  return (
    <div className="flex flex-col gap-[.45em] text-[.8em]">
      <PrevisaoDeRecursos />

      <BlocoAuto
        titulo="Auto-catch"
        dica="Lanca a bola em todo inimigo derrotado; capturas vao para a mochila."
        ligado={autoToggles.autoCatch}
        aoLigar={(v) => setAutoToggle('autoCatch', v)}
      >
        <div className="grid grid-cols-2 gap-[.5em]">
          <label className="flex flex-col gap-[.25em]">
            <span className="text-n400">Bola padrao</span>
            <ItemPicker
              label="Bola padrao"
              value={autoCatchConfig.ballId}
              opcoes={opcoesBola}
              onChange={(ballId) => setAutoCatchConfig({ ballId })}
            />
          </label>
          <label className="flex flex-col gap-[.25em]" style={{ opacity: autoCatchConfig.catchShinyEnabled ? 1 : 0.45 }}>
            <span className="flex items-center justify-between gap-[.3em] text-n400">
              Bola Shiny
              <GameSwitch
                checked={autoCatchConfig.catchShinyEnabled}
                onChange={(v) => setAutoCatchConfig({ catchShinyEnabled: v })}
                label="Usar bola diferente em shinies"
              />
            </span>
            <ItemPicker
              label="Bola Shiny"
              value={autoCatchConfig.shinyBallId}
              opcoes={opcoesBolaShiny}
              disabled={!autoCatchConfig.catchShinyEnabled}
              onChange={(shinyBallId) => setAutoCatchConfig({ shinyBallId })}
            />
          </label>
        </div>

        <div className="flex items-center gap-[.4em] font-medium">
          Regras por especie
          <InfoIcon text="Define uma bola especifica pra uma especie da hunt atual. Tem prioridade sobre a bola padrao/shiny. Se a bola da regra acabar, o bot so mata aquela especie em vez de gastar outra bola nela." />
        </div>

        {huntSpecies.length === 0 && (
          <div className="text-n500">Entre numa hunt pra configurar regras por especie.</div>
        )}

        {autoCatchRules.map((rule, index) => {
          // A especie de uma regra pode sobreviver a hunt em que foi criada (o
          // jogador seguiu em frente) — mantem ela selecionavel/visivel em vez
          // de sumir silenciosamente do proprio dropdown.
          const options = new Map(huntSpecies.map((s) => [s.id, s.name]))
          if (rule.speciesId && !options.has(rule.speciesId)) {
            const stale = SPECIES[rule.speciesId]
            options.set(rule.speciesId, stale ? `${stale.name} (fora da hunt atual)` : rule.speciesId)
          }
          return (
            <div key={index} className="flex flex-wrap items-center gap-[.4em] rounded-[.5em] border border-n800 p-[.4em]">
              <GameSelect
                value={rule.speciesId}
                onChange={(e) => updateAutoCatchRule(index, { speciesId: e.target.value })}
                className="flex-1"
              >
                {[...options.entries()].map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </GameSelect>
              <ItemPicker
                label="Bola da regra"
                className="w-[8.5em]"
                value={rule.ballItemId}
                opcoes={opcoesBola}
                onChange={(ballItemId) => updateAutoCatchRule(index, { ballItemId })}
              />
              <GameButton variant="ghost" onClick={() => removeAutoCatchRule(index)}>Remover</GameButton>
            </div>
          )
        })}

        <GameButton
          variant="ghost"
          block
          disabled={huntSpecies.length === 0}
          onClick={() => {
            if (huntSpecies.length === 0) return
            const jaTemRegra = new Set(autoCatchRules.map((r) => r.speciesId))
            const primeiraLivre = huntSpecies.find((s) => !jaTemRegra.has(s.id)) || huntSpecies[0]
            addAutoCatchRule({ speciesId: primeiraLivre.id, ballItemId: autoCatchConfig.ballId })
          }}
        >
          + Adicionar regra
        </GameButton>
      </BlocoAuto>

      <BlocoAuto
        titulo="Auto-pot"
        dica="Usa pocao quando o HP cai do limite. A primeira regra que casar (na ordem da lista) e usada."
        ligado={autoToggles.autoPot}
        aoLigar={(v) => setAutoToggle('autoPot', v)}
      >
        {autoPotRules.map((rule, index) => (
          <div key={index} className="flex flex-wrap items-center gap-[.4em]">
            <span>Vida ≤</span>
            <GameInput
              type="number"
              min={1}
              max={99}
              value={rule.hpPercent}
              onChange={(e) =>
                updateAutoPotRule(index, { hpPercent: Math.max(1, Math.min(99, Number(e.target.value) || 1)) })
              }
              // Largura fixa e pequena: sem ela o input numerico cai no tamanho
              // default do navegador (~20 caracteres) e transborda a janela de
              // 19em na horizontal.
              className="w-[3.4em] text-center"
            />
            <span>% usar</span>
            <ItemPicker
              label="Pocao da regra"
              className="min-w-[8em] flex-1"
              value={rule.itemId}
              opcoes={opcoesPocao}
              onChange={(itemId) => updateAutoPotRule(index, { itemId })}
            />
            {autoPotRules.length > 1 && (
              <GameButton variant="ghost" onClick={() => removeAutoPotRule(index)}>Remover</GameButton>
            )}
          </div>
        ))}
        <GameButton
          variant="ghost"
          block
          disabled={autoPotRules.length >= MAX_AUTO_POT_RULES}
          onClick={() => addAutoPotRule({ hpPercent: 70, itemId: BEST_POTION_OPTION })}
        >
          + Adicionar regra
        </GameButton>
      </BlocoAuto>

      <BlocoAuto
        titulo="Auto-status"
        dica="Cura veneno, queimadura, paralisia, sono, congelamento e confusao com o item mais barato que resolver."
        ligado={autoToggles.autoStatus}
        aoLigar={(v) => setAutoToggle('autoStatus', v)}
      >
        {/* O bot pega sempre o MAIS BARATO que cobre o status que o POKE tem
            (autoSystem.ts#melhorCuraDeStatus) — um Despertar de 30 no lugar de
            um Full Heal de 120. O checkbox de cada linha NAO escolhe qual
            usar (isso continua automatico): so tira aquele item especifico
            da lista de candidatos, pro jogador guardar um item sem precisar
            desligar a automacao inteira. */}
        <div className="flex flex-col gap-[.25em]">
          {opcoesCuraDeStatus.map((o) => (
            <div key={o.id} className="flex items-center justify-between gap-[.5em] text-n400">
              <GameCheck
                checked={autoStatusConfig[o.id] !== false}
                onChange={(v) => setAutoStatusItem(o.id, v)}
              >
                {o.nome}
              </GameCheck>
              <span className={cn('tabular-nums', o.alerta && 'font-semibold text-bad')}>x{o.quantidade}</span>
            </div>
          ))}
        </div>
      </BlocoAuto>

      <BlocoAuto
        titulo="Auto-revive"
        dica="Se o POKE em campo desmaiar, usa um Revive da mochila automaticamente."
        ligado={autoToggles.autoRevive}
        aoLigar={(v) => setAutoToggle('autoRevive', v)}
      >
        {/* O Revive nao tem escolha de item (o bot usa o que houver), entao a
            lista aqui e so leitura de estoque — mas ela precisa existir: era o
            unico consumivel do bot sem contagem visivel nenhuma. */}
        <div className="flex flex-col gap-[.25em]">
          {opcoesRevive.map((o) => (
            <div key={o.id} className="flex items-center justify-between gap-[.5em] text-n400">
              <span>{o.nome}</span>
              <span className={cn('tabular-nums', o.alerta && 'font-semibold text-bad')}>x{o.quantidade}</span>
            </div>
          ))}
        </div>
      </BlocoAuto>
    </div>
  )
}
