// Port de js/ui/panels/SettingsScreen.js — abas Geral e Patch-notes.
import { useState } from 'react'
import { sortedPatchNotes } from '@/data/patchNotes'
import { controller } from '@/engine/controller'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

function GeralTab() {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">Iniciar novo jogo</div>
        <div className="text-xs text-muted-foreground">
          Apaga todo o progresso (equipe, itens, ouro, mapas) e comeca do zero.
        </div>
      </div>
      {/* O vanilla usava um botao de "clique 2x pra confirmar" com timeout de
          4s; um AlertDialog de verdade e mais claro e nao depende de o usuario
          lembrar de clicar de novo dentro da janela de tempo. */}
      <AlertDialog>
        <AlertDialogTrigger render={<Button variant="destructive" size="sm" className="shrink-0 text-xs" />}>
          Iniciar novo jogo
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar todo o progresso?</AlertDialogTitle>
            <AlertDialogDescription>
              Equipe, itens, ouro e mapas desbloqueados serao perdidos. Essa acao nao pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => controller.resetGame()}>Apagar e recomecar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function PatchNotesTab() {
  const notes = sortedPatchNotes()
  return (
    <div className="space-y-2">
      {notes.map((note) => (
        <div key={note.version} className="rounded-lg border bg-card p-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-medium">{note.title}</span>
            <span className="shrink-0 text-xs text-muted-foreground">v{note.version}</span>
          </div>
          <div className="text-xs text-muted-foreground">{note.date}</div>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
            {note.highlights.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

export function SettingsScreen() {
  const [tab, setTab] = useState('geral')
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Configuracoes</h2>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="geral">Geral</TabsTrigger>
          <TabsTrigger value="patchnotes">Patch-notes</TabsTrigger>
        </TabsList>
        <TabsContent value="geral" className="mt-3"><GeralTab /></TabsContent>
        <TabsContent value="patchnotes" className="mt-3"><PatchNotesTab /></TabsContent>
      </Tabs>
    </div>
  )
}
