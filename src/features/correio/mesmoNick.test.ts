// PH-214 — a unica regra que roda no CLIENTE ao pedir amizade pelo Ranking ou
// pelo Chat, e por que ela precisa combinar com a do servidor.
//
// Todo o resto (ja e amigo, pedido pendente, bloqueio entre os dois, nick que
// nao existe) e decidido por `pedir_amizade` no Postgres, e o cliente so repassa
// a mensagem. A UNICA coisa que a tela decide sozinha e se deve OFERECER a acao
// — e ela esconde o botao na propria linha do jogador.
//
// Isso e apresentacao, nao seguranca: o servidor recusa de qualquer jeito com
// "Voce nao pode adicionar a si mesmo.". Mas se a comparacao aqui divergir da de
// la, o jogador ve um botao que sempre da erro, e o erro nao explica que ele
// clicou em si mesmo.
//
// As duas sutilezas que a comparacao tem, e que erram calado:
//
//   CAIXA    o servidor compara com `lower(...)`. Sem `toLowerCase` aqui, o
//            nick que aparecesse com outra capitalizacao no ranking ganharia
//            botao — na propria linha do jogador.
//   ESPACO   nick pode chegar com espaco nas pontas dependendo de onde a tela o
//            leu; `=== ` cru falharia por um caractere invisivel.
import { describe, expect, it } from 'vitest'
import { mesmoNick } from './usePedirAmizade'

describe('mesmoNick (PH-214)', () => {
  it('igual e igual', () => {
    expect(mesmoNick('ClaudeTeste', 'ClaudeTeste')).toBe(true)
  })

  it('ignora caixa, como o `lower()` do servidor', () => {
    expect(mesmoNick('ClaudeTeste', 'claudeteste')).toBe(true)
    expect(mesmoNick('CLAUDETESTE', 'ClaudeTeste')).toBe(true)
  })

  it('ignora espaco nas pontas', () => {
    expect(mesmoNick(' ClaudeTeste ', 'ClaudeTeste')).toBe(true)
  })

  it('nick diferente e diferente — inclusive prefixo', () => {
    // O caso do prefixo importa: uma comparacao por `startsWith` esconderia o
    // botao de "Amigo2Teste" pra quem se chama "Amigo2".
    expect(mesmoNick('Amigo2', 'Amigo2Teste')).toBe(false)
    expect(mesmoNick('ClaudeTeste', 'oreisviana')).toBe(false)
  })

  it('vazio nao casa com nome de verdade', () => {
    // Conta sem nick definido nao pode esconder o botao da lista inteira.
    expect(mesmoNick('', 'oreisviana')).toBe(false)
    expect(mesmoNick('   ', 'oreisviana')).toBe(false)
  })
})
