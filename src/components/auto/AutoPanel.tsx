// Corpo do painel de automacoes (auto-pot / auto-catch / auto-revive).
//
// Duas coisas do vanilla sumiram de proposito:
//  - `updateAutoPanelCounts` rodando a cada frame pra manter os badges "x12"
//    vivos sem tocar no <select>: era workaround pra nao reconstruir DOM
//    interativo debaixo do ponteiro. Aqui os badges saem de um selector do
//    Zustand, entao atualizam sozinhos.
//  - `controller.save()` apos cada mutacao: o `persist` grava sozinho.
import { useEffect, useRef } from 'react'
import { Question } from '@phosphor-icons/react'
import { ITEMS } from '@/data/items'
import { SPECIES } from '@/data/pokes'
import { getEncounter } from '@/data/enemies'
import { BEST_POTION_OPTION } from '@/engine/systems/autoSystem'
import { useGameStateStore } from '@/stores/gameStateStore'
import { sincronizarAuto } from '@/data/remote/autoridade'
import { useWorldStore } from '@/stores/worldStore'
import { GameButton, GameInput, GameSelect, GameSwitch } from '@/components/game/controls'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { estoqueDoItemDeRegra, LIMIAR_ESTOQUE_BAIXO } from './estoqueBaixo'
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

// `emUso` decide se o badge alerta. Um item selecionado num `<select>` de uma
// automacao DESLIGADA nao pisca: o bot nao vai gasta-lo, e um alerta que grita
// sem motivo e um alerta que o jogador aprende a ignorar.
function ItemCountBadge({ itemId, emUso = true }: { itemId: string; emUso?: boolean }) {
  const count = useGameStateStore((s) => estoqueDoItemDeRegra(s.items, itemId))
  if (itemId === BEST_POTION_OPTION) return null
  const baixo = emUso && count < LIMIAR_ESTOQUE_BAIXO
  return (
    <span
      className={cn(
        'shrink-0 rounded-full border px-[.4em] text-[.8em]',
        baixo ? 'animate-pulse-alerta border-bad font-semibold text-bad' : 'border-n700 text-n400',
      )}
      title={baixo ? `Acabando: menos de ${LIMIAR_ESTOQUE_BAIXO} em estoque` : undefined}
    >
      x{count}
    </span>
  )
}

function ToggleRow({
  label, tip, checked, onChange, badge,
}: {
  label: string
  tip: string
  checked: boolean
  onChange: (v: boolean) => void
  badge?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-[.5em]">
      <span className="flex flex-1 items-center gap-[.4em]">
        {label}
        <InfoIcon text={tip} />
      </span>
      {badge}
      <GameSwitch checked={checked} onChange={onChange} label={label} />
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
  const setAutoToggle = useGameStateStore((s) => s.setAutoToggle)
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
  }, [autoToggles, autoPotRules, autoCatchConfig, autoCatchRules])

  const huntSpecies = useCurrentHuntSpecies()

  return (
    <div className="flex flex-col gap-[.7em] text-[.8em]">
      <ToggleRow
        label="Auto-pot"
        tip="Usa pocao quando o HP cai do limite. A primeira regra que casar (na ordem da lista) e usada."
        checked={autoToggles.autoPot}
        onChange={(v) => setAutoToggle('autoPot', v)}
      />

      <div className="flex flex-col gap-[.5em] rounded-[.6em] border border-n800 p-[.6em]">
        <div className="text-[.9em] text-n400">Regra de auto-pot</div>
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
            <GameSelect
              value={rule.itemId}
              onChange={(e) => updateAutoPotRule(index, { itemId: e.target.value })}
              className="max-w-[9em] flex-1"
            >
              <option value={BEST_POTION_OPTION}>Escolher melhor</option>
              {POTION_OPTIONS.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </GameSelect>
            <ItemCountBadge itemId={rule.itemId} emUso={autoToggles.autoPot} />
            {autoPotRules.length > 1 && (
              <GameButton variant="ghost" onClick={() => removeAutoPotRule(index)}>Remover</GameButton>
            )}
          </div>
        ))}
        <GameButton
          variant="ghost"
          block
          disabled={autoPotRules.length >= MAX_AUTO_POT_RULES}
          onClick={() => addAutoPotRule({ hpPercent: 50, itemId: BEST_POTION_OPTION })}
        >
          + Adicionar regra
        </GameButton>
      </div>

      <ToggleRow
        label="Auto-catch"
        tip="Lanca a bola em todo inimigo derrotado; capturas vao para a mochila."
        checked={autoToggles.autoCatch}
        onChange={(v) => setAutoToggle('autoCatch', v)}
      />
      <ToggleRow
        label="Catch Shiny"
        tip="Usa uma bola diferente especificamente em shinies."
        checked={autoCatchConfig.catchShinyEnabled}
        onChange={(v) => setAutoCatchConfig({ catchShinyEnabled: v })}
      />

      <div className="grid grid-cols-2 gap-[.5em]">
        <BallPicker
          label="Bola padrao"
          value={autoCatchConfig.ballId}
          emUso={autoToggles.autoCatch}
          onChange={(ballId) => setAutoCatchConfig({ ballId })}
        />
        <BallPicker
          label="Bola Shiny"
          value={autoCatchConfig.shinyBallId}
          emUso={autoToggles.autoCatch && autoCatchConfig.catchShinyEnabled}
          disabled={!autoCatchConfig.catchShinyEnabled}
          onChange={(shinyBallId) => setAutoCatchConfig({ shinyBallId })}
        />
      </div>

      <div className="flex items-center gap-[.4em] font-medium">
        Regras por especie
        <InfoIcon text="Define uma bola especifica pra uma especie da hunt atual. Tem prioridade sobre a bola padrao/shiny. Se a bola da regra acabar, o bot so mata aquela especie em vez de gastar outra bola nela." />
      </div>

      {huntSpecies.length === 0 && (
        <div className="text-n500">Entre numa hunt pra configurar regras por especie.</div>
      )}

      <div className="flex flex-col gap-[.4em]">
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
              <GameSelect
                value={rule.ballItemId}
                onChange={(e) => updateAutoCatchRule(index, { ballItemId: e.target.value })}
              >
                {BALL_OPTIONS.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </GameSelect>
              <ItemCountBadge itemId={rule.ballItemId} emUso={autoToggles.autoCatch} />
              <GameButton variant="ghost" onClick={() => removeAutoCatchRule(index)}>Remover</GameButton>
            </div>
          )
        })}
      </div>

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

      <ToggleRow
        label="Auto-revive"
        tip="Se o POKE em campo desmaiar, usa um Revive da mochila automaticamente."
        checked={autoToggles.autoRevive}
        // O Revive nao tem `<select>` (o item e fixo), entao era o unico
        // consumivel do bot sem contagem visivel nenhuma.
        badge={<ItemCountBadge itemId="revive" emUso={autoToggles.autoRevive} />}
        onChange={(v) => setAutoToggle('autoRevive', v)}
      />
    </div>
  )
}

function BallPicker({
  label, value, onChange, disabled, emUso,
}: {
  label: string
  value: string
  onChange: (id: string) => void
  disabled?: boolean
  emUso?: boolean
}) {
  return (
    <div className="flex flex-col gap-[.25em]" style={{ opacity: disabled ? 0.45 : 1 }}>
      <span className="text-n400">{label}</span>
      <div className="flex items-center gap-[.3em]">
        <GameSelect
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1"
        >
          {BALL_OPTIONS.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </GameSelect>
        <ItemCountBadge itemId={value} emUso={emUso} />
      </div>
    </div>
  )
}
