// Criacao de personagem: nome do treinador PRIMEIRO, inicial depois.
//
// A ordem e pedido explicito. Antes o nome so existia no formulario de
// cadastro, e quem clicava "Iniciar novo jogo" (Configuracoes) caia direto na
// escolha do inicial mantendo o nick antigo, sem nenhuma tela pra troca-lo —
// "novo jogo" so era novo pra metade da identidade.
//
// A tela e a mesma nos dois casos (conta recem-criada e reset), porque o estado
// que a dispara e o mesmo: jogador sem nenhum POKE.
import { useState, type FormEvent } from 'react'
import { SPECIES } from '@/data/pokes'
import { gen5SpriteUrl } from '@/data/gen5Sprites'
import { controller } from '@/engine/controller'
import { useGameStateStore } from '@/stores/gameStateStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// Trio inicial fixo — separado do roster (bem maior) que vem da planilha.
const STARTER_SPECIES_IDS = ['charmander', 'squirtle', 'bulbasaur']

// `hospitalSpot` e so a posicao INICIAL guardada na entidade do jogador:
// Renderer.renderHospital sempre recalcula a posicao real de desenho a partir
// do tamanho do canvas a cada frame, e stepWorld nem roda movimento na cena
// do Hospital — entao esse valor e inerte fora do GameCanvas.
const INERT_HOSPITAL_SPOT = { x: 0, y: 0 }

// Mesmos limites do cadastro (features/auth/AuthForm.tsx) e do servidor
// (server/src/acoes.ts). Aqui e so UX: quem barra de verdade e o servidor, que
// tambem e o unico que sabe se o nome ja esta em uso.
const MIN_NICK = 3
const MAX_NICK = 16
const NICK_VALIDO = /^[A-Za-z0-9_]+$/

// Nome que o banco da a quem ainda nao escolheu (default da coluna e do wipe).
// Pre-preencher o campo com ele so faria o jogador apagar antes de digitar.
const NOME_PADRAO = 'Treinador'

function validaNick(nick: string): string | null {
  if (nick.length < MIN_NICK || nick.length > MAX_NICK) {
    return `O nome precisa ter de ${MIN_NICK} a ${MAX_NICK} caracteres.`
  }
  if (!NICK_VALIDO.test(nick)) return 'Use apenas letras, números e _ .'
  return null
}

export function StartScreen() {
  const nomeAtual = useGameStateStore((s) => s.trainer.name)
  const [passo, setPasso] = useState<'nome' | 'inicial'>('nome')

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 overflow-y-auto bg-background/95 p-6">
      <h2 className="text-2xl font-semibold">NOVO POKE IDLE</h2>
      {passo === 'nome' ? (
        <PassoNome nomeAtual={nomeAtual} aoConfirmar={() => setPasso('inicial')} />
      ) : (
        <PassoInicial nome={nomeAtual} aoVoltar={() => setPasso('nome')} />
      )}
    </div>
  )
}

function PassoNome({ nomeAtual, aoConfirmar }: { nomeAtual: string; aoConfirmar: () => void }) {
  const [nome, setNome] = useState(nomeAtual === NOME_PADRAO ? '' : nomeAtual)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const limpo = nome.trim()
    const problema = validaNick(limpo)
    if (problema) return setErro(problema)

    setErro(null)
    setEnviando(true)
    const ok = await controller.definirNomeDoTreinador(limpo)
    setEnviando(false)
    // Recusa do servidor (nome em uso) ja virou toast no `pedirAcao`. A tela so
    // nao avanca — avancar aqui registraria o inicial sob um nome que nao e o
    // que o jogador escolheu.
    if (ok) aoConfirmar()
  }

  return (
    <form onSubmit={enviar} className="flex w-full max-w-sm flex-col gap-3 rounded-lg border bg-card p-6">
      <p className="text-sm text-muted-foreground">
        Antes de tudo: como voce quer ser chamado? Este nome aparece no chat, no ranking, no Mercado e
        fica registrado em todo POKE que voce capturar.
      </p>
      <Input
        name="nome-treinador" autoFocus required maxLength={MAX_NICK}
        placeholder="Nome do treinador"
        value={nome} onChange={(e) => setNome(e.target.value)}
      />
      <p className="text-xs text-muted-foreground">
        {MIN_NICK} a {MAX_NICK} caracteres, letras, numeros e _ .
      </p>
      {erro && (
        <p role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {erro}
        </p>
      )}
      <Button type="submit" disabled={enviando}>
        {enviando ? 'Aguarde...' : 'Confirmar e escolher meu POKE'}
      </Button>
    </form>
  )
}

function PassoInicial({ nome, aoVoltar }: { nome: string; aoVoltar: () => void }) {
  return (
    <>
      <p className="max-w-md text-center text-sm text-muted-foreground">
        Tudo certo, {nome}. Escolha um POKE para chamar de seu.
      </p>

      <div className="flex flex-wrap justify-center gap-4">
        {STARTER_SPECIES_IDS.map((speciesId) => {
          const species = SPECIES[speciesId]
          if (!species) return null
          return (
            <div key={speciesId} className="flex w-56 flex-col items-center gap-2 rounded-lg border bg-card p-4">
              <img
                src={gen5SpriteUrl(species.id, false)}
                alt={species.name}
                className="h-24 w-24 object-contain [image-rendering:pixelated]"
              />
              <div className="text-base font-medium">{species.name}</div>
              <div className="text-center text-xs text-muted-foreground">{species.description}</div>
              <Button className="mt-1 w-full" onClick={() => controller.chooseStarter(species.id, INERT_HOSPITAL_SPOT)}>
                Escolher
              </Button>
            </div>
          )
        })}
      </div>

      <button type="button" onClick={aoVoltar} className="text-xs text-muted-foreground underline underline-offset-4">
        Trocar o nome do treinador
      </button>
    </>
  )
}
