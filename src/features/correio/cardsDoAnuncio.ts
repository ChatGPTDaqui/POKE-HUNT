// Quais mensagens do fio desenham o card do anúncio (PH-435).
//
// O servidor estampa `contexto_anuncio` em TODA mensagem que sai com um anúncio
// na mão. Desenhar um card por estampa encheria a conversa de cards idênticos:
// quem clica duas vezes no "Conversar" da vitrine, ou volta ao mesmo anúncio
// depois de duas falas, geraria duas molduras dizendo a mesma coisa.
//
// A regra é a de divisor de data de aplicativo de mensagem: o card aparece
// quando o assunto MUDA. E "muda" se mede contra o último anúncio VISTO no fio,
// não contra a mensagem imediatamente anterior — senão uma fala solta no meio
// (`contexto_anuncio` nulo) reabriria o mesmo card do outro lado dela.
//
// Escolhido em vez de um índice UNIQUE por (par, anúncio) no banco: a constraint
// impediria a negociação legítima do mesmo POKE semanas depois, e custaria uma
// migration pra resolver um problema que é de RENDERIZAÇÃO.
import type { MensagemCorreio } from '@/data/remote/servidor'

/**
 * Ids das mensagens que devem ser precedidas pelo card, na ordem cronológica em
 * que o fio é lido (mais antiga primeiro — a mesma ordem que `lerConversa`
 * devolve).
 */
export function idsComCardDeAnuncio(mensagens: MensagemCorreio[]): Set<string> {
  const ids = new Set<string>()
  let ultimoVisto: string | null = null
  for (const m of mensagens) {
    const anuncioId = m.contexto_anuncio?.anuncioId
    if (!anuncioId) continue
    if (anuncioId !== ultimoVisto) {
      ids.add(m.id)
      ultimoVisto = anuncioId
    }
  }
  return ids
}
