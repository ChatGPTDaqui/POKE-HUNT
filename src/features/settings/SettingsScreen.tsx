// Configuracoes: abas Geral e Patch-notes.
import { useState } from 'react'
import { sortedPatchNotes } from '@/data/patchNotes'
import { controller } from '@/engine/controller'
import { useConfirmDialogStore } from '@/stores/confirmDialogStore'
import { useUiStore, HUD_SCALE_MIN, HUD_SCALE_MAX } from '@/stores/uiStore'
import { GameButton, GameCard, SegmentedTabs } from '@/components/game/controls'

function GeralTab() {
  const askConfirm = useConfirmDialogStore((s) => s.confirm)
  const hudScale = useUiStore((s) => s.hudScale)
  const setHudScale = useUiStore((s) => s.setHudScale)

  return (
    <div className="flex flex-col gap-[.7em]">
      <GameCard className="flex flex-col gap-[.4em] p-[.8em]">
        <div className="font-medium">Tamanho da interface</div>
        <div className="text-[.8em] text-n500">
          A HUD ja escala sozinha com a largura da tela. Este ajuste multiplica essa escala — util em monitor
          muito grande ou pra quem prefere tudo maior. Fica salvo neste aparelho.
        </div>
        <div className="flex items-center gap-[.6em]">
          <input
            type="range"
            min={HUD_SCALE_MIN}
            max={HUD_SCALE_MAX}
            step={0.05}
            value={hudScale}
            onChange={(e) => setHudScale(Number(e.target.value))}
            className="h-[1em] flex-1 cursor-pointer accent-primary"
            aria-label="Escala da interface"
          />
          <span className="w-[3.5em] text-right tabular-nums text-n300">
            {Math.round(hudScale * 100)}%
          </span>
          <GameButton variant="ghost" onClick={() => setHudScale(1)}>Padrao</GameButton>
        </div>
      </GameCard>

      <GameCard className="flex flex-col gap-[.4em] p-[.8em]">
        <div className="font-medium">Iniciar novo jogo</div>
        <div className="text-[.8em] text-n500">
          Apaga todo o progresso (equipe, itens, ouro, mapas) e comeca do zero.
        </div>
        <GameButton
          variant="danger"
          className="self-start"
          onClick={() =>
            askConfirm({
              title: 'Apagar todo o progresso?',
              message:
                'Equipe, itens, ouro e mapas desbloqueados serao perdidos. Essa acao nao pode ser desfeita.',
              confirmLabel: 'Apagar e recomecar',
              onConfirm: () => controller.resetGame(),
            })
          }
        >
          Iniciar novo jogo
        </GameButton>
      </GameCard>
    </div>
  )
}

function PatchNotesTab() {
  const notes = sortedPatchNotes()
  return (
    <div className="flex flex-col gap-[.6em]">
      {notes.map((note) => (
        <GameCard key={note.version} className="p-[.8em]">
          <div className="flex items-baseline justify-between gap-[.5em]">
            <b className="font-medium">{note.title}</b>
            <span className="shrink-0 text-[.75em] text-n500">v{note.version} · {note.date}</span>
          </div>
          <ul className="mt-[.4em] list-disc pl-[1.2em] text-[.8em] text-n400">
            {note.highlights.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        </GameCard>
      ))}
    </div>
  )
}

export function SettingsScreen() {
  const [tab, setTab] = useState<'geral' | 'patch'>('geral')
  return (
    <div className="flex flex-col gap-[.8em]">
      <SegmentedTabs
        value={tab}
        onChange={setTab}
        options={[
          { value: 'geral', label: 'Geral' },
          { value: 'patch', label: 'Patch-notes' },
        ]}
      />
      {tab === 'geral' ? <GeralTab /> : <PatchNotesTab />}
    </div>
  )
}
