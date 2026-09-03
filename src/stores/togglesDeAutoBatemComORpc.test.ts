// PH-492: as chaves de `autoToggles` (cliente) e a lista branca de
// `configurar_auto` (SQL) são a MESMA regra escrita em duas linguagens.
//
// O QUE ISTO IMPEDE, E JÁ ACONTECEU DUAS VEZES
// -----------------------------------------------------------------------------
// A RPC valida os toggles por lista branca e o `raise` derruba a TRANSAÇÃO
// INTEIRA. Como o cliente manda `autoToggles` cru num batch único
// (`sincronizarAuto`), uma chave que o SQL não conhece não falha sozinha: ela
// leva junto a bola, as regras de poção, as regras por espécie, os itens de cura
// e a auto-venda. **Nenhuma configuração de auto é gravada.**
//
// E é silencioso — `sincronizarAuto` termina em `.catch(reportarErro)`, sem
// refetch e sem travar a tela. O jogador vê funcionar na sessão (o motor local
// lê o store) e voltar ao antigo no F5.
//
//   26/08  a migration do `avancoManualDeSala` documenta a armadilha
//   28/08  a do `lureConfig` repete o aviso por escrito
//   02/09  a PH-428 acrescenta `avancarDeEstagio` no cliente e no bundle da
//          Edge, e esquece a migration — 24h em produção sem ninguém ver a causa
//
// Dois avisos em prosa não seguraram. Este teste segura.
//
// POR QUE LER O .SQL, E POR QUE O ÚLTIMO
// -----------------------------------------------------------------------------
// Não há como um teste TS chamar a função do banco sem rede e sem credencial, e
// um teste que precise das duas não roda no CI de PR. O `.sql` é a fonte que o
// banco recebeu.
//
// E tem que ser a ÚLTIMA migration que redefine a função, não a primeira que o
// grep acha: `CREATE OR REPLACE` empilha, e a definição vigente é a do carimbo
// mais alto. Esse detalhe já enganou uma sessão inteira neste repo.
import { describe, expect, it } from 'vitest'

import { defaultGameStateData } from './gameStateDefaults'

const MIGRATIONS = import.meta.glob('/supabase/migrations/*.sql', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

/**
 * A lista branca da definição VIGENTE de `configurar_auto` no schema dado.
 *
 * Devolve `null` quando não acha, e quem chama transforma isso em falha com
 * mensagem própria — um `[]` silencioso passaria o teste por vácuo.
 */
function listaBrancaVigente(schema: 'public' | 'dev'): string[] | null {
  const arquivos = Object.keys(MIGRATIONS)
    .filter((caminho) => MIGRATIONS[caminho].includes(`FUNCTION ${schema}.configurar_auto`))
    // Carimbo `YYYYMMDDHHmmss` no começo do nome: ordem alfabética é ordem
    // cronológica, e a última é a que vale.
    .sort()
  const ultima = arquivos[arquivos.length - 1]
  if (!ultima) return null
  // O bloco de toggles é o único `not in (...)` logo depois de
  // `jsonb_object_keys(p_patch->'toggles')`.
  const corpo = MIGRATIONS[ultima]
  const depoisDoLaco = corpo.slice(corpo.indexOf("p_patch->'toggles'"))
  const m = /v_key not in \(([^)]*)\)/.exec(depoisDoLaco)
  if (!m) return null
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
}

describe('os toggles de auto do cliente batem com a RPC (PH-492)', () => {
  const doCliente = Object.keys(defaultGameStateData().autoToggles).sort()

  it('o teste acha o que precisa ler — guarda anti-vácuo', () => {
    // Sem isto, um caminho de glob errado ou um rename de função deixaria as
    // duas assertivas abaixo passando com listas vazias dos dois lados.
    expect(Object.keys(MIGRATIONS).length, 'nenhuma migration foi carregada').toBeGreaterThan(0)
    expect(doCliente.length, 'autoToggles ficou vazio').toBeGreaterThan(0)
    expect(listaBrancaVigente('public'), 'não achei a lista branca do public').not.toBeNull()
    expect(listaBrancaVigente('dev'), 'não achei a lista branca do dev').not.toBeNull()
  })

  it.each(['public', 'dev'] as const)('schema %s aceita exatamente as chaves que o cliente manda', (schema) => {
    // IGUALDADE, e não `toContain`: chave a MENOS no SQL aborta o batch inteiro
    // (o defeito da PH-492); chave a MAIS é regra morta no banco, que engana
    // quem for ler depois.
    expect(listaBrancaVigente(schema)!.sort()).toEqual(doCliente)
  })

  it('os dois schemas têm a MESMA lista', () => {
    // Eles são espelhos. Divergir significa que um par de migration saiu pela
    // metade, e o sintoma aparece só no ambiente que ficou pra trás.
    expect(listaBrancaVigente('dev')!.sort()).toEqual(listaBrancaVigente('public')!.sort())
  })
})
