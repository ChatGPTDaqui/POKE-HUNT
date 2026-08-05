// Wiki: an in-game reference guide, entirely static/authored text + small
// interactive tools built from real game data (TYPE_CHART, RARITIES) — no
// player state is read here (unlike Pokedex, which tracks kill counts), so
// this panel never needs `gameState`/`controller`, just `container`.
import { TYPE_CHART, getEffectiveness } from '../../data/typeChart.generated.js';
import { colorForType, TYPE_COLORS } from '../../data/typeColors.js';
import { RARITIES, RARITY_ORDER } from '../../data/rarity.js';

const ALL_TYPES = Object.keys(TYPE_COLORS);

let activeWikiTab = 'inicio';
let selectedEffType = 'FIRE';

function typeChip(type) {
  return `<span class="type-chip" style="background:${colorForType(type)}">${type}</span>`;
}

function chipList(types) {
  if (types.length === 0) return '<span class="card-sub">Nenhum</span>';
  return `<div class="row" style="flex-wrap:wrap;gap:4px">${types.map(typeChip).join('')}</div>`;
}

// ---------- Primeiros Passos ----------

function renderInicioTab(container) {
  container.innerHTML = `
    <div class="card">
      <div class="card-info">
        <div class="card-title">Bem-vindo(a) ao NOVO POKE IDLE!</div>
        <div class="card-sub">
          Este e um jogo <b>idle</b>: seu POKE ativo anda e luta sozinho contra os
          selvagens de cada hunt, sem precisar apertar nenhum botao de ataque —
          seu trabalho e escolher onde caçar, cuidar do seu time e gerenciar
          recursos (itens, ouro, capturas).
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-info">
        <div class="card-title">1. Escolhendo seu inicial</div>
        <div class="card-sub">
          Na primeira vez que voce abre o jogo, escolhe um dos 3 iniciais
          classicos (Charmander, Squirtle ou Bulbasaur). Ele comeca no Nivel 1
          e ja pode ser levado direto pra Hunt Inicial — nao existe risco de
          cruzar com inimigos fortes logo de cara, essa hunt tem o nivel dos
          selvagens travado bem baixo.
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-info">
        <div class="card-title">2. Como funciona o combate automatico</div>
        <div class="card-sub">
          Assim que voce entra numa hunt, seu POKE ativo comeca a andar pelo
          mapa sozinho procurando o inimigo selvagem mais proximo. Ao chegar
          perto o suficiente ele engaja em combate automaticamente e usa seus
          golpes por conta propria (o golpe de maior poder disponivel, dando
          preferencia a golpes em area quando isso acerta 2 ou mais alvos).
          Depois de derrotar o inimigo, ele imediatamente escolhe um novo alvo
          e continua a caçada — seu POKE nunca fica parado esperando ordem.
          <br><br>
          Voce pode <b>desligar</b> um golpe especifico da rotacao automatica
          dando duplo clique no icone dele na barra de habilidades (a barra
          inferior central, acima do botao Auto) — util pra evitar que a IA
          gaste um golpe fraco quando um mais forte esta quase pronto.
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-info">
        <div class="card-title">3. Navegando pelos menus</div>
        <div class="card-sub">
          O menu inferior da tela tem os atalhos principais:
          <br>⚾ <b>Equipe</b> — seus ate 6 POKEs ativos, trocar quem esta em
          campo, evoluir, ver status completos.
          <br>🎒 <b>Mochila</b> — POKEs capturados extras e todos os seus
          itens (bolas, pocoes, revives, Stones).
          <br>🗺️ <b>Hunts</b> — escolher onde caçar (ver item 4 abaixo).
          <br>🛒 <b>Loja</b> — comprar itens e vender POKEs/itens por ouro.
          <br>📖 <b>Pokedex</b> — registro de toda especie do jogo, mesmo as
          que voce nunca capturou, com onde encontrar cada uma.
          <br>🏥 <b>Hospital</b> — clique na enfermeira em campo pra curar seu
          time por completo, de graça.
          <br>🤖 <b>Auto</b> (botao flutuante no canto inferior esquerdo) —
          liga/desliga auto-pot, auto-catch e auto-revive, e configura qual
          item cada automacao deve usar.
          <br>⚙️ <b>Config</b> — reiniciar o jogo e ver o historico de
          atualizacoes (Patch-notes).
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-info">
        <div class="card-title">4. Progredindo nas Hunts</div>
        <div class="card-sub">
          Cada hunt tem uma faixa de nivel recomendada e um conjunto de
          especies proprio (organizadas por bioma/tipo elemental — ver a aba
          "Efetividade de Tipos" e a Pokedex pra saber onde cada tipo
          aparece). Conforme seu POKE ativo sobe de nivel, procure hunts com
          niveis mais altos pra continuar evoluindo com desafio real. O Novo
          Continente (Kanto) e liberado depois de derrotar o Campeao Lance,
          o chefe final de Johto — e o Modo Pesadelo (espelho de toda hunt em
          nivel bem mais alto, incluindo as hunts BOSS dos 11 lendarios) fica
          disponivel a qualquer momento, sem custo, pra quem quiser um desafio
          maior ainda.
          <br><br>
          Deixe <b>auto-pot</b>, <b>auto-catch</b> e <b>auto-revive</b>
          ligados (vem ativados por padrao) pra caçar sem precisar
          intervir manualmente — configure as bolas/pocoes preferidas no
          painel 🤖 Auto.
        </div>
      </div>
    </div>
  `;
}

// ---------- Efetividade de Tipos ----------

function renderTiposTab(container) {
  container.innerHTML = `
    <div class="card">
      <div class="card-info" style="width:100%">
        <div class="card-title">Como funciona a efetividade de tipos</div>
        <div class="card-sub">
          Todo golpe tem um tipo elemental. Quando ele acerta um POKE, o dano
          e multiplicado de acordo com o tipo do defensor:
          <b>2x</b> (super eficaz), <b>0.5x</b> (pouco eficaz/resistido) ou
          <b>0x</b> (sem efeito/imune) — sem multiplicador nenhum, o golpe
          causa dano normal (1x). POKEs com <b>dois tipos</b> multiplicam os
          dois efeitos juntos (ex.: um golpe de Agua contra um POKE
          Terra+Rocha seria 2x * 2x = 4x de dano).
        </div>
        <select id="wiki-type-select" style="margin-top:8px">
          ${ALL_TYPES.map((t) => `<option value="${t}">${t}</option>`).join('')}
        </select>
      </div>
    </div>
    <div id="wiki-type-result"></div>
  `;

  const select = container.querySelector('#wiki-type-select');
  select.value = selectedEffType;
  const resultEl = container.querySelector('#wiki-type-result');

  function renderResult() {
    const atkRow = TYPE_CHART[selectedEffType] || {};
    const strongAtk = [];
    const weakAtk = [];
    const noEffAtk = [];
    for (const t of ALL_TYPES) {
      const m = atkRow[t];
      if (m === 2) strongAtk.push(t);
      else if (m === 0.5) weakAtk.push(t);
      else if (m === 0) noEffAtk.push(t);
    }

    const weaknesses = [];
    const resistances = [];
    const immunities = [];
    for (const t of ALL_TYPES) {
      const m = getEffectiveness(t, selectedEffType, null);
      if (m === 2) weaknesses.push(t);
      else if (m === 0.5) resistances.push(t);
      else if (m === 0) immunities.push(t);
    }

    resultEl.innerHTML = `
      <div class="card">
        <div class="card-info" style="width:100%">
          <div class="card-title">Atacando com golpes de ${typeChip(selectedEffType)}</div>
          <div class="card-sub">Super eficaz (2x) contra:</div>
          ${chipList(strongAtk)}
          <div class="card-sub" style="margin-top:6px">Pouco eficaz (0.5x) contra:</div>
          ${chipList(weakAtk)}
          <div class="card-sub" style="margin-top:6px">Sem efeito (0x) contra:</div>
          ${chipList(noEffAtk)}
        </div>
      </div>
      <div class="card">
        <div class="card-info" style="width:100%">
          <div class="card-title">Defendendo como um POKE de ${typeChip(selectedEffType)}</div>
          <div class="card-sub">Fraqueza — recebe 2x de:</div>
          ${chipList(weaknesses)}
          <div class="card-sub" style="margin-top:6px">Resistencia — recebe 0.5x de:</div>
          ${chipList(resistances)}
          <div class="card-sub" style="margin-top:6px">Imunidade — recebe 0x de:</div>
          ${chipList(immunities)}
        </div>
      </div>
    `;
  }

  select.addEventListener('change', () => {
    selectedEffType = select.value;
    renderResult();
  });
  renderResult();
}

// ---------- Raridades ----------

function renderRaridadesTab(container) {
  const rows = RARITY_ORDER.map((key) => RARITIES[key]);
  container.innerHTML = `
    <div class="card">
      <div class="card-info">
        <div class="card-title">O que e a raridade de um POKE</div>
        <div class="card-sub">
          Toda vez que um POKE aparece (selvagem em campo ou capturado), ele
          sorteia uma <b>raridade</b> — um eixo totalmente independente da
          especie ou da hunt de onde veio. Um Rattata comum pode nascer
          "Mythic" do mesmo jeito que um Dragonite pode nascer "Comum" — a
          chance por especie/hunt de aparecer ja existia antes e continua
          separada (ver a aba "Efetividade de Tipos"/Pokedex pra isso).
          Quanto mais rara, maior o multiplicador de status <b>e</b> de valor
          de venda — POKEs raros nao sao so um troféu, sao mais fortes de
          verdade.
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-info" style="width:100%">
        <div class="card-title">Tabela de raridades</div>
        <div class="moveset-table">
          <div class="moveset-row moveset-header">
            <span>Raridade</span><span>Chance</span><span>Status</span><span>Venda</span>
          </div>
          ${rows.map((r) => `
            <div class="moveset-row">
              <span style="color:${r.color};font-weight:600">${r.label}</span>
              <span>${r.weight}%</span>
              <span>${r.statMultiplier}x</span>
              <span>${r.sellMultiplier}x</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-info">
        <div class="card-title">Shiny — um eixo separado</div>
        <div class="card-sub">
          Alem da raridade, todo POKE tambem tem uma chance independente de
          nascer <b>Shiny</b> (aparencia alternativa, ✨ no nome) — a taxa
          real e 200x mais alta que a taxa oficial dos jogos, proporcional a
          taxa de captura da propria especie. Shiny nao muda status nem
          venda por si so (isso e o que a raridade acima faz) — e puramente
          um brinde visual raro, mas continua contando pro seu placar no
          painel de performance e no chat.
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-info">
        <div class="card-title">Lendarios</div>
        <div class="card-sub">
          Os 11 Pokemon lendarios do Dex nao aparecem em nenhuma hunt normal —
          eles sao exclusivos das 11 <b>hunts BOSS</b> do Modo Pesadelo (um
          confronto único e fixo por lendario, nivel bem alto, sem respawn).
          Em campo eles ganham uma escala visual 1.5x maior que o normal e uma
          barra de HP customizada (5x mais larga, 2x mais alta) pra refletir
          o quao imponente e essa luta — isso e visual/de apresentacao, a
          raridade sorteada neles continua seguindo a mesma tabela acima.
        </div>
      </div>
    </div>
  `;
}

// ---------- Mecanicas ----------

function renderMecanicasTab(container) {
  container.innerHTML = `
    <div class="card">
      <div class="card-info">
        <div class="card-title">Sistema de captura</div>
        <div class="card-sub">
          Ao derrotar um selvagem, a captura tenta usar a bola escolhida
          (manual ou via auto-catch) e rola uma chance de sucesso baseada em
          3 fatores: a <b>taxa de captura real</b> da especie (dado da
          planilha/Gen2 — quanto menor, mais raro e dificil de capturar), o
          <b>multiplicador da bola</b> usada (bolas melhores capturam mais
          facil) e um multiplicador global fixo de balanceamento. Todo POKE
          capturado entra na mochila resetado pro <b>Nivel 1</b>,
          independente do nivel que tinha em campo — e sempre carrega consigo
          a raridade e o status shiny que foram sorteados no momento em que
          apareceu.
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-info">
        <div class="card-title">Odio / agressividade (lure)</div>
        <div class="card-sub">
          Cada selvagem tem um raio de <b>agressividade</b> (aggro) — a
          distancia a partir da qual ele nota seu POKE e comeca a se
          aproximar. Esse alcance foi calibrado pra ser <b>moderado</b>: o
          selvagem só persegue de uma distancia media, nunca do mapa inteiro.
          Uma vez que a perseguição começa, existe um raio de <b>desistencia</b>
          (leash) mais generoso — se voce (ou ele) se afastar demais depois de
          já ter engajado, o selvagem desiste e volta a vagar perto do seu
          ponto de nascimento original, em vez de te seguir pra sempre.
          <br><br>
          Do lado do jogador: seu POKE ativo sempre foca o inimigo vivo mais
          proximo no mapa inteiro (ou o shiny mais proximo, se houver algum
          shiny vivo na hunt — prioridade automatica sobre qualquer outro
          alvo) e redefine esse alvo a cada abate, então ele caça ativamente
          pelo mapa em vez de ficar parado numa unica posicao esperando os
          selvagens virem.
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-info">
        <div class="card-title">Distancia de visao (camera/FOV)</div>
        <div class="card-sub">
          A camera comeca com um campo de visao 160% maior que o padrao
          original (voce ve mais mapa ao redor do seu POKE do que veria em
          100%), tanto durante as hunts quanto na cena do Hospital. Isso e só
          o ponto de partida — o zoom ainda pode ser ajustado livremente com
          os botoes +/- no canto superior direito ou Ctrl+Scroll do mouse,
          pra qualquer lado (mais perto ou ainda mais longe).
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-info">
        <div class="card-title">Habilidades em area (AoE)</div>
        <div class="card-sub">
          Alguns golpes (marcados com uma bolinha verde no icone da barra de
          habilidades) atingem <b>todos os alvos</b> dentro de um raio fixo
          ao redor de quem usou o golpe, em vez de só um alvo unico — o
          efeito visual em campo (o anel se expandindo) e desenhado exatamente
          do tamanho real dessa area, então dá pra ver visualmente quem vai
          ser atingido. A IA de combate prioriza usar um golpe AOE disponivel
          sempre que ele acertaria 2 ou mais inimigos ao mesmo tempo em vez de
          um golpe single-target de poder parecido.
          <br><br>
          Todo POKE, ao atingir o <b>Nivel 50</b>, aprende automaticamente um
          golpe em area exclusivo tematizado pelo seu próprio tipo elemental
          primario — a categoria de dano (Fisico ou Especial) desse golpe não
          e fixa: é decidida na hora, comparando o Atk Fisico e o Atk Especial
          daquele POKE especifico e usando o maior dos dois.
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-info">
        <div class="card-title">Sistema de recarga (tempo de acao)</div>
        <div class="card-sub">
          Cada golpe tem seu proprio cooldown individual, calculado a partir
          do PP real daquele golpe na planilha: <b>menos PP significa mais
          tempo de recarga</b> (um golpe de 5 PP recarrega bem mais lento que
          um de 35 PP). Esse cooldown ainda e ajustado pela <b>Velocidade</b>
          do seu POKE — quanto maior a Velocidade, mais rapido todos os
          golpes recarregam. O Ataque Basico (o golpe universal de reserva
          que todo POKE sempre tem, tipo "Struggle") e a unica excecao: seu
          cooldown e fixo, nao depende de PP nem de Velocidade. Enquanto um
          golpe esta em uso, o POKE fica parado no lugar — ele so volta a se
          mover depois que a acao termina.
        </div>
      </div>
    </div>
  `;
}

export function renderWikiMenu(container) {
  container.innerHTML = `
    <div class="screen-sticky-header">
      <h2>📚 Wiki</h2>
      <div class="row tabs" id="wiki-tabs">
        <button data-tab="inicio">Primeiros Passos</button>
        <button data-tab="tipos">Efetividade de Tipos</button>
        <button data-tab="raridades">Raridades</button>
        <button data-tab="mecanicas">Mecanicas</button>
      </div>
    </div>
    <div id="wiki-content"></div>
  `;

  container.querySelectorAll('#wiki-tabs button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === activeWikiTab);
    btn.addEventListener('click', () => {
      activeWikiTab = btn.dataset.tab;
      renderWikiMenu(container);
    });
  });

  const content = container.querySelector('#wiki-content');
  if (activeWikiTab === 'tipos') renderTiposTab(content);
  else if (activeWikiTab === 'raridades') renderRaridadesTab(content);
  else if (activeWikiTab === 'mecanicas') renderMecanicasTab(content);
  else renderInicioTab(content);
}
