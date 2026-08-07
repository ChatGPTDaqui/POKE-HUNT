// Quem e o jogador que mandou este request.
//
// A verificacao e feita PERGUNTANDO AO SUPABASE (`GET /auth/v1/user` com o
// token do jogador), e nao decodificando o JWT localmente. Custa uma ida de
// rede por request, e essa e a troca consciente:
//
//  - decodificar local exige guardar o segredo de assinatura aqui e acertar
//    algoritmo, `aud`, `exp`, rotacao de chave e revogacao. Errar qualquer um
//    desses e uma falha de autenticacao silenciosa — o tipo de bug que so
//    aparece quando alguem ja entrou na conta de outro;
//  - perguntar ao Supabase respeita revogacao e logout na hora, de graca.
//
// Se a latencia virar problema, o caminho e cache curto por token (poucos
// segundos), nao verificacao caseira.
import { ErroHttp, type Config } from './db.js'

export interface Jogador {
  id: string
  email: string | null
}

export async function autenticar(cfg: Config, req: Request): Promise<Jogador> {
  const header = req.headers.get('authorization') || ''
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  if (!token) throw new ErroHttp(401, 'faltou o token de sessao')

  // A `apikey` aqui e a service_role so pra o gateway aceitar a chamada; quem
  // identifica o usuario e o Bearer com o token DELE. Nao trocar a ordem: usar
  // a service_role como Bearer devolveria um usuario de servico, nao o jogador.
  const resposta = await fetch(`${cfg.supabaseUrl}/auth/v1/user`, {
    headers: { apikey: cfg.serviceRoleKey, Authorization: `Bearer ${token}` },
  })
  if (!resposta.ok) throw new ErroHttp(401, 'sessao invalida ou expirada')

  const corpo = (await resposta.json()) as { id?: string; email?: string | null }
  if (!corpo?.id) throw new ErroHttp(401, 'sessao sem usuario')
  return { id: corpo.id, email: corpo.email ?? null }
}
