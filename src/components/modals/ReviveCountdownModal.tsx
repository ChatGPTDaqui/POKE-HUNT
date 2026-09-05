// Port do #revive-modal de js/ui/UIManager.js#_updateReviveModal.
//
// NAO estava na lista da diretiva (que citava so boss-defeat + Lance), mas e
// da mesma familia (modal que le world state em UIManager) e cobre um
// comportamento real: a contagem regressiva de 5s do Auto-Revive
// (autoSystem.ts#AUTO_REVIVE_DELAY, world.reviveCountdown). Sem ele o POKE
// simplesmente revive do nada, sem aviso nenhum.
//
// ---------------------------------------------------------------------------
// O CONTADOR DEIXA DE PROMETER O QUE PODE NAO CUMPRIR (PH-510)
// ---------------------------------------------------------------------------
// Este modal dizia "Auto-Revive em... 5" SEMPRE que o POKE caia com o toggle
// ligado, porque `autoSystem.ts` inicia a contagem olhando so o toggle e o
// desmaio — nao o inventario. Sem nenhum item da familia revive, ele contava
// ate zero e SUMIA sem fazer nada, com o POKE ainda no chao e nada na tela
// dizendo por que.
//
// A CONTAGEM SEM ITEM NAO E O DEFEITO, E FOI MANTIDA. Ela e uma JANELA DE
// GRACA: a Loja fica na barra de baixo durante a cacada, e o cabecalho de
// `CampoOverlay` registra o pedido explicito do dono de o aviso nao cobrir os
// menus — "durante os 5 segundos da contagem do Auto-Revive o jogador nao
// conseguia nem abrir a Mochila pra ver se ainda tinha Revive, que e
// exatamente o que ele quer fazer naquele momento". Ou seja: os 5 segundos
// existem pra ele correr e comprar. Cortar a contagem consertaria a frase
// tirando do jogador uma chance que hoje existe.
//
// O QUE MUDA E SO O TEXTO: sem revive na mochila ele para de afirmar que o
// POKE vai levantar e passa a dizer o que falta e o que fazer. Com revive, a
// mensagem e a de sempre.
//
// POR QUE `melhorRevive` E NAO UMA CHECAGEM PROPRIA. A pergunta aqui e
// exatamente "o que vai rodar daqui a 5 segundos vai achar alguma coisa?", e
// quem roda e `melhorRevive`. Existem HOJE tres definicoes de "familia revive"
// no projeto (esta funcao, `podeAutoReanimar` que a chama, e `REVIVE_IDS` em
// `components/auto/estoqueBaixo.ts`), e a PH-508 foi causada por duas delas
// discordando — um jogador com 149 Max Revive e zero Revive comum era tratado
// como sem revive nenhum. Escrever uma quarta aqui seria repetir o erro.
//
// `podeAutoReanimar` (que seria o predicado completo) NAO e usado de proposito:
// os outros dois termos dele — toggle ligado e nao ser hunt BOSS — ja estao
// garantidos pelo simples fato de haver contagem, porque e `autoSystem.ts:161`
// quem a inicia sob essas duas condicoes. Chama-lo aqui pediria um
// `isBossHunt` que este componente nao tem e teria que inventar.
import { useWorldStore } from '@/stores/worldStore'
import { useGameStateStore } from '@/stores/gameStateStore'
import { melhorRevive } from '@/engine/systems/autoSystem'
import { CampoOverlay } from './CampoOverlay'

export function ReviveCountdownModal() {
  const countdown = useWorldStore((s) => s.reviveCountdown)
  // Seletor devolve BOOLEANO, e nao o item: `melhorRevive` monta um objeto novo
  // a cada chamada, entao devolve-lo faria o Zustand ver uma referencia nova em
  // todo tick e re-renderizar o modal 60 vezes por segundo.
  const temRevive = useGameStateStore((s) => melhorRevive(s) !== null)

  if (countdown == null || countdown <= 0) return null

  // Confinado ao campo de batalha (ver CampoOverlay): a contagem durava 5
  // segundos cobrindo o menu inteiro, justo quando o jogador quer abrir a
  // Mochila pra conferir se ainda tem Revive.
  return (
    <CampoOverlay>
      <div className="text-sm font-medium">
        {temRevive ? 'POKE desmaiado! Auto-Revive em...' : 'POKE desmaiado! Sem Revive na mochila'}
      </div>
      <div
        className="font-mono text-5xl font-black"
        // Verde le como "esta tudo certo, so aguarde". Sem revive nao esta: o
        // laranja de aviso e a diferenca entre um relogio e um prazo.
        style={{ color: temRevive ? '#6ee7b7' : 'var(--color-warn)' }}
      >
        {Math.ceil(countdown)}
      </div>
      {!temRevive && (
        <div className="text-center text-xs text-n300">
          Compre um na Loja antes do tempo acabar, ou seu POKE fica caído.
        </div>
      )}
    </CampoOverlay>
  )
}
