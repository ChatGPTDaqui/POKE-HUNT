// PH-436 — "Correio" não é mais o nome da tela, e este arquivo é o que impede
// o nome antigo de voltar por descuido.
//
// A tela deixou de ser caixa de carta em PH-81 (virou fio de conversa por
// contato, com presença e painel de amigos), mas continuou se chamando Correio
// por mais um ano de commits. Quem quer negociar com alguém não procura
// "Correio".
//
// O rename tem TRÊS exceções, e cada uma por um motivo diferente:
//
//  1. `src/data/patchNotes.ts` — nota já publicada é histórico. Reescrever o que
//     o jogador leu em 2026-08 pra combinar com o nome de hoje seria falsear o
//     changelog. Mesma regra que manteve `boss_*` nas migrations antigas do
//     Guardian/Lord (PH-236).
//  2. `src/lib/database.types.ts` — arquivo GERADO a partir do schema remoto.
//     Editar aqui seria reprovado pelo gate na PR seguinte.
//  3. Nome de FUNÇÃO no Postgres (`excluir_correio`, `marcar_correio_lido`,
//     `coletar_anexo_correio`). A string é a chave da chamada: renomear no
//     cliente sem renomear no banco quebra as três RPCs, e renomear no banco
//     custaria migration por zero ganho funcional.
import { describe, expect, it } from 'vitest'

const FONTES = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

/** As unicas ocorrencias toleradas: nome de funcao no banco. */
const RPCS_DO_BANCO = ['excluir_correio', 'marcar_correio_lido', 'coletar_anexo_correio']

const ISENTOS = ['/src/data/patchNotes.ts', '/src/lib/database.types.ts']

// Este proprio arquivo cita "Correio" o tempo todo pra explicar a regra.
const ESTE_ARQUIVO = '/src/nomeDaTelaSocial.test.ts'

describe('a varredura enxergou o codigo', () => {
  it('o glob casou com src de verdade', () => {
    // Guarda anti-vacuo: com o glob quebrado o teste abaixo passa medindo nada.
    expect(Object.keys(FONTES).length).toBeGreaterThan(300)
    expect(Object.keys(FONTES)).toContain('/src/features/social/SocialMenu.tsx')
  })
})

describe('o nome antigo da tela nao volta (PH-436)', () => {
  it('nenhum arquivo do cliente diz Correio, tirando os isentos e o nome das RPCs', () => {
    const sobras: string[] = []
    for (const [caminho, fonte] of Object.entries(FONTES)) {
      if (caminho === ESTE_ARQUIVO || ISENTOS.includes(caminho)) continue
      let restante = fonte
      for (const rpc of RPCS_DO_BANCO) restante = restante.split(rpc).join('')
      for (const linha of restante.split('\n')) {
        if (/correio/i.test(linha)) sobras.push(`${caminho}: ${linha.trim()}`)
      }
    }
    expect(sobras, `sobrou o nome antigo:\n${sobras.join('\n')}`).toEqual([])
  })

  it('o diretorio da feature e `social`, e o menu se chama SocialMenu', () => {
    const caminhos = Object.keys(FONTES)
    expect(caminhos.some((c) => c.startsWith('/src/features/correio/'))).toBe(false)
    expect(caminhos).toContain('/src/features/social/SocialMenu.tsx')
    expect(caminhos).toContain('/src/data/remote/socialRealtime.ts')
  })

  it('a tela e o rotulo do menu dizem Social', () => {
    expect(FONTES['/src/features/screens/ScreenOverlay.tsx']).toContain("social: 'Social'")
    expect(FONTES['/src/components/hud/ActionDock.tsx']).toContain("{ screen: 'social', label: 'Social'")
  })

  it('o icone do menu nao e mais um envelope', () => {
    // O envelope era a ultima peca da interface dizendo "isto e carta".
    expect(FONTES['/src/components/hud/ActionDock.tsx']).not.toContain('Envelope')
  })
})
