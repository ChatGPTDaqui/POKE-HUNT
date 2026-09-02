// PH-119 — o caminho anúncio → perfil → conversa, e o que ele NÃO pode vazar.
//
// Duas coisas falham em silêncio aqui:
//
//   1. o perfil de terceiro mostrar dado privado. Não dá erro, não quebra nada:
//      só expõe o ouro de outro jogador numa tela que ninguém pensou em
//      auditar de novo;
//   2. a conversa inicial ficar "grudada" — o Social reabrir sempre o mesmo
//      contato porque ninguém limpou o pedido, e o jogador perder o acesso à
//      lista sem entender por quê.
import { beforeEach, describe, expect, it } from 'vitest'

import { useUiStore } from '@/stores/uiStore'

const MIGRATIONS = import.meta.glob('/supabase/migrations/*.sql', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

const sql = Object.entries(MIGRATIONS)
  .filter(([nome]) => nome.includes('perfil_publico'))
  .sort(([a], [b]) => a.localeCompare(b))

describe('a RPC de perfil público (PH-119)', () => {
  it('o par `_public`/`_dev` existe', () => {
    expect(sql.map(([nome]) => nome.replace(/.*_(public|dev)\.sql$/, '$1'))).toEqual(['public', 'dev'])
  })

  it.each(['public', 'dev'])('em %s, exige sessão', (schema) => {
    // Sem isto a função vira um endpoint de enumeração de jogadores para quem
    // não respeitar o `grant`.
    const arquivo = sql.find(([nome]) => nome.endsWith(`_${schema}.sql`))![1]
    expect(arquivo).toContain("raise exception 'nao autenticado'")
  })

  it.each(['public', 'dev'])('em %s, NÃO toca em nada privado', (schema) => {
    const arquivo = sql.find(([nome]) => nome.endsWith(`_${schema}.sql`))![1]
    // O corpo da função, sem os comentários — que citam `gold`/`diamonds`
    // justamente para dizer que ficam de fora, e fariam esta guarda acusar o
    // próprio texto que a documenta.
    const corpo = arquivo
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n')

    // `player_items` é a mochila; `gold`/`diamonds` são as colunas de carteira
    // em `players`; `email` vem de `auth.users`. Nenhum deles pode ser lido
    // aqui, e a função é `security definer` — ou seja, ela PODE ler tudo isso.
    // É a única barreira.
    for (const proibido of ['player_items', 'gold', 'diamonds', 'auth.users', 'email']) {
      expect(corpo, `perfil_publico de ${schema} menciona "${proibido}"`).not.toContain(proibido)
    }
  })

  it.each(['public', 'dev'])('em %s, aceita UM id e não uma lista', (schema) => {
    // Uma versão que aceitasse array viraria um jeito barato de raspar o tempo
    // de jogo da base inteira, e a tela nunca precisa de mais de um.
    const arquivo = sql.find(([nome]) => nome.endsWith(`_${schema}.sql`))![1]
    expect(arquivo).toContain(`function ${schema}.perfil_publico(p_user_id uuid)`)
    expect(arquivo).not.toMatch(/p_user_ids?\s+uuid\[\]/)
  })

  it.each(['public', 'dev'])('em %s, conta apagada devolve `existe: false` em vez de estourar', (schema) => {
    // Chegar aqui a partir de um anúncio de conta removida é um caso real. Erro
    // viraria toast vermelho para uma situação que só pede "não existe mais".
    const arquivo = sql.find(([nome]) => nome.endsWith(`_${schema}.sql`))![1]
    expect(arquivo).toContain("jsonb_build_object('existe', false)")
  })
})

describe('o caminho anúncio → perfil → conversa (PH-119)', () => {
  beforeEach(() => {
    useUiStore.setState({
      perfilPublicoAlvo: null,
      socialContatoInicial: null,
      perfilOpen: false,
      currentScreen: null,
    })
  })

  it('abrir o perfil de terceiro FECHA o perfil próprio', () => {
    // Os dois usam a mesma chave de janela (`perfil`) para a posição arrastada.
    // Deixar os dois abertos poria um exatamente em cima do outro.
    useUiStore.getState().setPerfilOpen(true)
    useUiStore.getState().abrirPerfilPublico({ userId: 'u1', nome: 'Fulano' })

    expect(useUiStore.getState().perfilOpen).toBe(false)
    expect(useUiStore.getState().perfilPublicoAlvo).toEqual({ userId: 'u1', nome: 'Fulano' })
  })

  it('"Conversar" abre o Social e fecha o perfil que levou até ele', () => {
    useUiStore.getState().abrirPerfilPublico({ userId: 'u1', nome: 'Fulano' })
    useUiStore.getState().abrirSocialCom({ userId: 'u1', nick: 'Fulano' })

    const s = useUiStore.getState()
    expect(s.currentScreen).toBe('social')
    expect(s.socialContatoInicial).toEqual({ userId: 'u1', nick: 'Fulano' })
    // Deixá-lo aberto empilharia duas janelas sobre a mesma conversa.
    expect(s.perfilPublicoAlvo).toBeNull()
  })

  it('o pedido de conversa é consumido UMA vez', () => {
    // O bug que isto impede: o Social relê `socialContatoInicial` a cada
    // montagem. Sem limpar, fechar o fio e voltar ao Social reabriria o mesmo
    // contato para sempre, e a lista de conversas ficaria inalcançável.
    useUiStore.getState().abrirSocialCom({ userId: 'u1', nick: 'Fulano' })
    expect(useUiStore.getState().socialContatoInicial).not.toBeNull()

    useUiStore.getState().consumirSocialContatoInicial()
    expect(useUiStore.getState().socialContatoInicial).toBeNull()
  })

  it('fechar o perfil não deixa alvo pendurado', () => {
    useUiStore.getState().abrirPerfilPublico({ userId: 'u1', nome: 'Fulano' })
    useUiStore.getState().fecharPerfilPublico()
    expect(useUiStore.getState().perfilPublicoAlvo).toBeNull()
  })
})

describe('a tela de perfil público não alcança dado privado (PH-119)', () => {
  const FONTE = import.meta.glob('/src/features/perfil/PerfilPublico.tsx', {
    query: '?raw', import: 'default', eager: true,
  }) as Record<string, string>

  const bruto = Object.values(FONTE)[0]

  // Sem os comentários. O cabeçalho do componente CITA `useGameStateStore` para
  // explicar por que ele não é usado — e uma guarda que acusasse o próprio texto
  // que a documenta obrigaria a apagar a explicação para o teste passar, que é o
  // pior trade possível.
  const fonte = bruto
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
    .join('\n')

  it('o componente foi lido, e o filtro de comentários não comeu o código', () => {
    expect(bruto).toContain('export function PerfilPublico')
    expect(fonte).toContain('export function PerfilPublico')
    expect(fonte).toContain('perfilPublico(')
  })

  it('NÃO importa o save do próprio jogador', () => {
    // A guarda é estrutural, e é o motivo de este componente ser separado de
    // `PerfilTreinador` em vez de um `if` dentro dele: sem `useGameStateStore`
    // ao alcance, não há como o ouro de ninguém chegar nesta tela por descuido.
    expect(fonte).not.toContain('useGameStateStore')
    expect(fonte).not.toContain('gameStateStore')
  })

  it('NÃO tem ação que só faz sentido em si mesmo', () => {
    // "Sair da conta" e "reiniciar o jogo" moram no perfil próprio. Um deles
    // aparecer aqui seria o pior tipo de bug de UI: destrutivo e plausível.
    //
    // `useAuthStore` NÃO entra nesta lista: ele é usado para saber quem é o
    // jogador e esconder o "Conversar" no próprio perfil — leitura de
    // identidade, não de save. O que não pode é `useGameStateStore`, que é o
    // caso do teste acima.
    for (const proibido of ['signOut', 'reiniciar']) {
      expect(fonte, `PerfilPublico menciona "${proibido}"`).not.toContain(proibido)
    }
  })

  it('não oferece "Conversar" no próprio perfil', () => {
    // O servidor recusa mensagem para si mesmo ("Voce nao pode mandar mensagem
    // pra si mesmo"), e a vitrine do Mercado NÃO esconde o que você mesmo
    // anunciou — então o caminho existe de verdade. Oferecer um botão que só
    // produz erro é pior que não oferecer.
    expect(fonte).toContain('data.userId === meuId')
  })
})

describe('o anúncio do próprio jogador não vira link (PH-119)', () => {
  const FONTE = import.meta.glob('/src/features/mercado/components/ComprarPokes.tsx', {
    query: '?raw', import: 'default', eager: true,
  }) as Record<string, string>

  const fonte = Object.values(FONTE)[0]

  it('compara o vendedor com o jogador antes de linkar', () => {
    // `mercadoPokes` lê `mercado_anuncios_ativos` sem excluir `seller_id = eu`,
    // então o próprio anúncio aparece na vitrine. Sem esta checagem o nome
    // viraria link para o próprio perfil, e de lá para um "Conversar" que o
    // servidor recusa — erro depois do clique, numa situação que dava para não
    // oferecer.
    expect(fonte).toContain('a.seller_id === meuId')
  })
})
