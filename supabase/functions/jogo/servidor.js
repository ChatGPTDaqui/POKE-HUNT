//#region \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
//#endregion
//#region server/src/db.ts
var ErroHttp = class extends Error {
	status;
	constructor(status, message) {
		super(message);
		this.status = status;
	}
};
function cabecalhos(cfg, extras = {}) {
	const perfil = {};
	if (cfg.schema && cfg.schema !== "public") {
		perfil["Accept-Profile"] = cfg.schema;
		perfil["Content-Profile"] = cfg.schema;
	}
	return {
		apikey: cfg.serviceRoleKey,
		Authorization: `Bearer ${cfg.serviceRoleKey}`,
		"Content-Type": "application/json",
		...perfil,
		...extras
	};
}
var ESPERA_ENTRE_TENTATIVAS_MS = [200, 700];
var TIMEOUT_MS = 1e4;
var dormir = (ms) => new Promise((r) => setTimeout(r, ms));
function ehFalhaTransitoria(status) {
	return status === 408 || status === 425 || status === 429 || status >= 500;
}
async function buscarComRetry(cfg, caminho, init) {
	let ultimo = null;
	for (let tentativa = 0; tentativa <= ESPERA_ENTRE_TENTATIVAS_MS.length; tentativa++) {
		if (tentativa > 0) await dormir(ESPERA_ENTRE_TENTATIVAS_MS[tentativa - 1]);
		try {
			const resposta = await fetch(`${cfg.supabaseUrl}/rest/v1/${caminho}`, {
				...init,
				signal: AbortSignal.timeout(TIMEOUT_MS)
			});
			const texto = await resposta.text();
			if (resposta.ok || !ehFalhaTransitoria(resposta.status)) return {
				resposta,
				texto
			};
			console.error(`PostgREST ${resposta.status} em ${caminho} (tentativa ${tentativa + 1}): ${texto.slice(0, 400)}`);
			ultimo = {
				resposta,
				texto
			};
		} catch (erro) {
			console.error(`PostgREST inacessivel em ${caminho} (tentativa ${tentativa + 1}): ${String(erro).slice(0, 200)}`);
			if (tentativa === ESPERA_ENTRE_TENTATIVAS_MS.length) throw new ErroHttp(502, "falha ao falar com o banco");
		}
	}
	if (!ultimo) throw new ErroHttp(502, "falha ao falar com o banco");
	return ultimo;
}
async function pedir(cfg, caminho, init) {
	const { resposta, texto } = await buscarComRetry(cfg, caminho, init);
	if (!resposta.ok) {
		console.error(`PostgREST ${resposta.status} em ${caminho}: ${texto.slice(0, 400)}`);
		throw new ErroHttp(502, "falha ao falar com o banco");
	}
	return texto ? JSON.parse(texto) : null;
}
async function selecionar(cfg, caminho) {
	return await pedir(cfg, caminho, { headers: cabecalhos(cfg) }) ?? [];
}
/**
* PostgREST corta em 1000 linhas por request SEM ERRO NENHUM (200 OK com dado
* mutilado). Este projeto ja levou essa mordida no catalogo — ver "Gotchas
* conhecidos" no CLAUDE.md. Aqui a defesa e a mesma: paginar por `Range` e
* conferir o total contra o `Content-Range` que o servidor devolve.
*/
async function selecionarTudo(cfg, caminho, pagina = 1e3) {
	const juncao = caminho.includes("?") ? "&" : "?";
	const acumulado = [];
	let inicio = 0;
	for (;;) {
		const { resposta, texto } = await buscarComRetry(cfg, `${caminho}${juncao}`, { headers: cabecalhos(cfg, {
			Range: `${inicio}-${inicio + pagina - 1}`,
			Prefer: "count=exact"
		}) });
		if (!resposta.ok) {
			console.error(`PostgREST ${resposta.status} em ${caminho}: ${texto.slice(0, 400)}`);
			throw new ErroHttp(502, "falha ao falar com o banco");
		}
		const lote = JSON.parse(texto);
		acumulado.push(...lote);
		const contentRange = resposta.headers.get("content-range");
		const total = Number(contentRange?.split("/")[1]);
		if (!Number.isFinite(total)) throw new ErroHttp(502, `Content-Range ausente/ilegivel em ${caminho}: ${contentRange}`);
		if (acumulado.length >= total || lote.length === 0) {
			if (acumulado.length !== total) throw new ErroHttp(502, `paginacao incompleta em ${caminho}: ${acumulado.length} de ${total}`);
			return acumulado;
		}
		inicio += pagina;
	}
}
async function inserir(cfg, tabela, linhas, opcoes = {}) {
	const prefer = [opcoes.retornar ? "return=representation" : "return=minimal", opcoes.upsert ? "resolution=merge-duplicates" : null].filter(Boolean).join(",");
	return await pedir(cfg, `${tabela}${opcoes.upsert ? `?on_conflict=${opcoes.upsert}` : ""}`, {
		method: "POST",
		headers: cabecalhos(cfg, { Prefer: prefer }),
		body: JSON.stringify(linhas)
	}) ?? [];
}
async function atualizar(cfg, caminho, patch) {
	await pedir(cfg, caminho, {
		method: "PATCH",
		headers: cabecalhos(cfg, { Prefer: "return=minimal" }),
		body: JSON.stringify(patch)
	});
}
/**
* PATCH que devolve as linhas afetadas — e a base de todo compare-and-swap
* deste servico.
*
* O servico e serverless: nao ha transacao aberta entre duas chamadas ao
* PostgREST, entao "ler a ordem, decidir, gravar" e uma corrida sempre que dois
* jogadores tocam o mesmo livro de ofertas. O padrao usado no Mercado e mandar
* o valor ANTIGO no filtro (`&remaining=eq.7`) junto do novo no corpo: se
* outra requisicao chegou primeiro, o filtro nao casa, a resposta volta VAZIA e
* quem chamou sabe que perdeu a corrida — em vez de sobrescrever em silencio.
*
* Com `return=minimal` isso seria indistinguivel de sucesso, que e exatamente
* o modo de falha que este helper existe pra evitar.
*/
async function atualizarRetornando(cfg, caminho, patch) {
	return await pedir(cfg, caminho, {
		method: "PATCH",
		headers: cabecalhos(cfg, { Prefer: "return=representation" }),
		body: JSON.stringify(patch)
	}) ?? [];
}
async function apagar(cfg, caminho) {
	await pedir(cfg, caminho, {
		method: "DELETE",
		headers: cabecalhos(cfg, { Prefer: "return=minimal" })
	});
}
//#endregion
//#region server/src/auth.ts
async function autenticar(cfg, req) {
	const header = req.headers.get("authorization") || "";
	const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
	if (!token) throw new ErroHttp(401, "faltou o token de sessao");
	const resposta = await fetch(`${cfg.supabaseUrl}/auth/v1/user`, { headers: {
		apikey: cfg.serviceRoleKey,
		Authorization: `Bearer ${token}`
	} });
	if (!resposta.ok) throw new ErroHttp(401, "sessao invalida ou expirada");
	const corpo = await resposta.json();
	if (!corpo?.id) throw new ErroHttp(401, "sessao sem usuario");
	return {
		id: corpo.id,
		email: corpo.email ?? null
	};
}
//#endregion
//#region src/core/rng.ts
function createRng(seed) {
	return {
		state: seed | 0,
		draws: 0
	};
}
/**
* Retoma uma sequencia ja em andamento, a partir do estado que foi persistido.
*
* Distinto de `createRng`, que sempre RECOMECA do zero. A diferenca ja custou um
* bug: o servidor refazia `createRng(seed)` a cada flush de 30s, entao a sessao
* inteira era a mesma sequencia repetida — mesmos inimigos, mesmos IVs, mesma
* raridade, indefinidamente (ver server/src/progresso.ts#aplicarFlush).
*
* `state | 0` porque o valor pode voltar do banco como string ou como float:
* mulberry32 so funciona sobre um inteiro de 32 bits com sinal.
*/
function restoreRng(state, draws) {
	return {
		state: state | 0,
		draws: Number.isFinite(draws) ? draws : 0
	};
}
/** Semente nova pra uma sessao. Na Fase D quem emite isto e o servidor. */
function randomSeed() {
	const buf = /* @__PURE__ */ new Uint32Array(1);
	crypto.getRandomValues(buf);
	return buf[0] | 0;
}
/**
* Proximo float em [0, 1). MUTA `rng` — de proposito: o Rng vive dentro do
* WorldState (draft do immer), entao mutar em lugar e o que faz o estado do
* sorteio ser salvo/retomado junto com o resto do mundo, sem sincronizacao
* extra.
*/
function nextFloat(rng) {
	rng.state = rng.state + 1831565813 | 0;
	let t = Math.imul(rng.state ^ rng.state >>> 15, 1 | rng.state);
	t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
	rng.draws += 1;
	return ((t ^ t >>> 14) >>> 0) / 4294967296;
}
/**
* Sequencia derivada, independente da principal. Serve pra sortear algo fora do
* mundo (preview de Pokedex, por exemplo) sem gastar sorteios da sequencia que
* o servidor verifica — consumir a principal por causa da UI dessincronizaria
* o replay.
*/
function deriveRng(seed, rotulo) {
	let h = seed | 0;
	for (let i = 0; i < rotulo.length; i++) h = Math.imul(h ^ rotulo.charCodeAt(i), 16777619) | 0;
	return createRng(h);
}
//#endregion
//#region src/core/formulaEngine.ts
var FUNCS = {
	floor: Math.floor,
	ceil: Math.ceil,
	round: Math.round,
	abs: Math.abs,
	sqrt: Math.sqrt,
	min: (a, b) => Math.min(a, b),
	max: (a, b) => Math.max(a, b),
	random: () => {
		throw new Error("random() exige um Rng: passe world.rng em formulaEngine.eval(chave, contexto, rng)");
	}
};
function tokenize(expr) {
	const tokens = [];
	let i = 0;
	while (i < expr.length) {
		const c = expr[i];
		if (/\s/.test(c)) {
			i++;
			continue;
		}
		if (/[0-9.]/.test(c)) {
			let j = i;
			while (j < expr.length && /[0-9.]/.test(expr[j])) j++;
			tokens.push({
				type: "number",
				value: parseFloat(expr.slice(i, j))
			});
			i = j;
			continue;
		}
		if (/[a-zA-Z_]/.test(c)) {
			let j = i;
			while (j < expr.length && /[a-zA-Z0-9_]/.test(expr[j])) j++;
			tokens.push({
				type: "ident",
				value: expr.slice(i, j)
			});
			i = j;
			continue;
		}
		if ("+-*/%^(),".includes(c)) {
			tokens.push({
				type: "op",
				value: c
			});
			i++;
			continue;
		}
		throw new Error(`Formula: caractere inesperado "${c}" em "${expr}"`);
	}
	return tokens;
}
function parse(tokens) {
	let pos = 0;
	const peek = () => tokens[pos];
	const next = () => tokens[pos++];
	function parseExpr() {
		let node = parseTerm();
		while (peek() && peek().type === "op" && (peek().value === "+" || peek().value === "-")) node = {
			type: "binary",
			op: next().value,
			left: node,
			right: parseTerm()
		};
		return node;
	}
	function parseTerm() {
		let node = parseUnary();
		while (peek() && peek().type === "op" && (peek().value === "*" || peek().value === "/" || peek().value === "%")) node = {
			type: "binary",
			op: next().value,
			left: node,
			right: parseUnary()
		};
		return node;
	}
	function parseUnary() {
		if (peek() && peek().type === "op" && peek().value === "-") {
			next();
			return {
				type: "neg",
				value: parseUnary()
			};
		}
		return parsePower();
	}
	function parsePower() {
		const base = parsePrimary();
		if (peek() && peek().type === "op" && peek().value === "^") {
			next();
			return {
				type: "binary",
				op: "^",
				left: base,
				right: parseUnary()
			};
		}
		return base;
	}
	function parsePrimary() {
		const tok = peek();
		if (!tok) throw new Error("Formula: fim inesperado da expressao");
		if (tok.type === "number") {
			next();
			return {
				type: "number",
				value: tok.value
			};
		}
		if (tok.type === "op" && tok.value === "(") {
			next();
			const node = parseExpr();
			if (!peek() || peek().value !== ")") throw new Error("Formula: parenteses desbalanceados");
			next();
			return node;
		}
		if (tok.type === "ident") {
			next();
			if (peek() && peek().type === "op" && peek().value === "(") {
				next();
				const args = [];
				if (peek() && peek().value !== ")") {
					args.push(parseExpr());
					while (peek() && peek().value === ",") {
						next();
						args.push(parseExpr());
					}
				}
				if (!peek() || peek().value !== ")") throw new Error("Formula: parenteses desbalanceados na funcao");
				next();
				return {
					type: "call",
					name: tok.value,
					args
				};
			}
			return {
				type: "var",
				name: tok.value
			};
		}
		throw new Error(`Formula: token inesperado ${JSON.stringify(tok)}`);
	}
	const result = parseExpr();
	if (pos < tokens.length) throw new Error("Formula: sobrou texto apos a expressao");
	return result;
}
function evalNode(node, context, rng) {
	switch (node.type) {
		case "number": return node.value;
		case "neg": return -evalNode(node.value, context, rng);
		case "var":
			if (!(node.name in context)) throw new Error(`Formula: variavel desconhecida "${node.name}"`);
			return context[node.name];
		case "call": {
			const fn = node.name === "random" && rng ? () => nextFloat(rng) : FUNCS[node.name];
			if (!fn) throw new Error(`Formula: funcao desconhecida "${node.name}"`);
			return fn(...node.args.map((a) => evalNode(a, context, rng)));
		}
		case "binary": {
			const l = evalNode(node.left, context, rng);
			const r = evalNode(node.right, context, rng);
			switch (node.op) {
				case "+": return l + r;
				case "-": return l - r;
				case "*": return l * r;
				case "/": return l / r;
				case "%": return l % r;
				case "^": return Math.pow(l, r);
				default: throw new Error(`Formula: operador desconhecido "${node.op}"`);
			}
		}
		default: throw new Error("Formula: no de AST desconhecido");
	}
}
var astCache = /* @__PURE__ */ new Map();
function getAst(expr) {
	let ast = astCache.get(expr);
	if (!ast) {
		ast = parse(tokenize(expr));
		astCache.set(expr, ast);
	}
	return ast;
}
function evalExpression(expr, context = {}, rng) {
	return evalNode(getAst(expr), context, rng);
}
function createFormulaEngine(formulas) {
	return {
		eval(key, context = {}, rng) {
			const entry = formulas[key];
			if (!entry) throw new Error(`Formula desconhecida: "${key}"`);
			return evalExpression(entry.expr, context, rng);
		},
		evalOrDefault(key, fallback, context = {}, rng) {
			if (!(key in formulas)) return fallback;
			return evalExpression(formulas[key].expr, context, rng);
		}
	};
}
//#endregion
//#region src/data/generated/formulas.generated.ts
var FORMULAS = {
	"DAMAGE_BASE": {
		"expr": "floor(floor(2*level/5+2)*power*atk/def/50)+2",
		"vars": [
			"level",
			"power",
			"atk",
			"def"
		]
	},
	"STAB_MULTIPLIER": {
		"expr": "1.5",
		"vars": []
	},
	"CRIT_CHANCE": {
		"expr": "1/16",
		"vars": []
	},
	"CRIT_MULTIPLIER": {
		"expr": "2",
		"vars": []
	},
	"DAMAGE_VARIATION": {
		"expr": "(floor(random()*16)+85)/100",
		"vars": []
	},
	"EXP_GAIN": {
		"expr": "floor(baseExp*level/7)",
		"vars": ["baseExp", "level"]
	},
	"STAT_FORMULA": {
		"expr": "floor((2*base+iv)*level/100)+5",
		"vars": [
			"base",
			"level",
			"iv"
		]
	},
	"HP_FORMULA": {
		"expr": "floor((2*base+iv)*level/100)+level+10",
		"vars": [
			"base",
			"level",
			"iv"
		]
	},
	"GLOBAL_CATCH_MULTIPLIER": {
		"expr": "0.3",
		"vars": []
	},
	"CATCH_CHANCE": {
		"expr": "min(1, catchRate/255*ballMultiplier*catchMultiplier)",
		"vars": [
			"catchRate",
			"ballMultiplier",
			"catchMultiplier"
		]
	},
	"SELL_ITEM_FRACTION": {
		"expr": "0.5",
		"vars": []
	},
	"SELL_ITEM_PRICE": {
		"expr": "floor(buyPrice*sellFraction)",
		"vars": ["buyPrice", "sellFraction"]
	},
	"POKEMON_SELL_DIVISOR": {
		"expr": "5",
		"vars": []
	},
	"POKEMON_SELL_VALUE": {
		"expr": "max(1, floor(level*baseExp/sellDivisor))",
		"vars": [
			"level",
			"baseExp",
			"sellDivisor"
		]
	},
	"KILL_MONEY_DIVISOR": {
		"expr": "15",
		"vars": []
	},
	"MONEY_FOR_KILL": {
		"expr": "max(1, floor(sellValue/killDivisor))",
		"vars": ["sellValue", "killDivisor"]
	},
	"GROWTH_MEDIUM_FAST": {
		"expr": "n^3",
		"vars": ["n (= level)"]
	},
	"GROWTH_SLIGHTLY_FAST": {
		"expr": "floor(3/4*n^3+10*n^2-30)",
		"vars": ["n (= level)"]
	},
	"GROWTH_SLIGHTLY_SLOW": {
		"expr": "floor(3/4*n^3+20*n^2-70)",
		"vars": ["n (= level)"]
	},
	"GROWTH_MEDIUM_SLOW": {
		"expr": "floor(6/5*n^3-15*n^2+100*n-140)",
		"vars": ["n (= level)"]
	},
	"GROWTH_FAST": {
		"expr": "floor(4/5*n^3)",
		"vars": ["n (= level)"]
	},
	"GROWTH_SLOW": {
		"expr": "floor(5/4*n^3)",
		"vars": ["n (= level)"]
	},
	"FISH_BITE_CHANCE": {
		"expr": "51",
		"vars": []
	},
	"TICK_MS": {
		"expr": "1400",
		"vars": []
	}
};
//#endregion
//#region src/data/generated/abilities.generated.ts
var ABILITIES_DATA = {
	"scratch": {
		"id": "scratch",
		"name": "Scratch",
		"type": "NORMAL",
		"category": "physical",
		"power": 40,
		"pp": 35
	},
	"growl": {
		"id": "growl",
		"name": "Growl",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 40
	},
	"ember": {
		"id": "ember",
		"name": "Ember",
		"type": "FIRE",
		"category": "special",
		"power": 40,
		"pp": 25
	},
	"smokescreen": {
		"id": "smokescreen",
		"name": "Smokescreen",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 20
	},
	"rage": {
		"id": "rage",
		"name": "Rage",
		"type": "NORMAL",
		"category": "physical",
		"power": 20,
		"pp": 20
	},
	"scary_face": {
		"id": "scary_face",
		"name": "Scary Face",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 10
	},
	"flamethrower": {
		"id": "flamethrower",
		"name": "Flamethrower",
		"type": "FIRE",
		"category": "special",
		"power": 95,
		"pp": 15
	},
	"slash": {
		"id": "slash",
		"name": "Slash",
		"type": "NORMAL",
		"category": "physical",
		"power": 70,
		"pp": 20
	},
	"dragon_rage": {
		"id": "dragon_rage",
		"name": "Dragon Rage",
		"type": "DRAGON",
		"category": "special",
		"power": 40,
		"pp": 10
	},
	"fire_spin": {
		"id": "fire_spin",
		"name": "Fire Spin",
		"type": "FIRE",
		"category": "special",
		"power": 15,
		"pp": 15
	},
	"tackle": {
		"id": "tackle",
		"name": "Tackle",
		"type": "NORMAL",
		"category": "physical",
		"power": 35,
		"pp": 35
	},
	"tail_whip": {
		"id": "tail_whip",
		"name": "Tail Whip",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 30
	},
	"bubble": {
		"id": "bubble",
		"name": "Bubble",
		"type": "WATER",
		"category": "special",
		"power": 20,
		"pp": 30
	},
	"withdraw": {
		"id": "withdraw",
		"name": "Withdraw",
		"type": "WATER",
		"category": "special",
		"power": 0,
		"pp": 40
	},
	"water_gun": {
		"id": "water_gun",
		"name": "Water Gun",
		"type": "WATER",
		"category": "special",
		"power": 40,
		"pp": 25
	},
	"bite": {
		"id": "bite",
		"name": "Bite",
		"type": "DARK",
		"category": "special",
		"power": 60,
		"pp": 25
	},
	"rapid_spin": {
		"id": "rapid_spin",
		"name": "Rapid Spin",
		"type": "NORMAL",
		"category": "physical",
		"power": 20,
		"pp": 40
	},
	"protect": {
		"id": "protect",
		"name": "Protect",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 10
	},
	"rain_dance": {
		"id": "rain_dance",
		"name": "Rain Dance",
		"type": "WATER",
		"category": "special",
		"power": 0,
		"pp": 5
	},
	"skull_bash": {
		"id": "skull_bash",
		"name": "Skull Bash",
		"type": "NORMAL",
		"category": "physical",
		"power": 100,
		"pp": 15
	},
	"hydro_pump": {
		"id": "hydro_pump",
		"name": "Hydro Pump",
		"type": "WATER",
		"category": "special",
		"power": 120,
		"pp": 5
	},
	"leech_seed": {
		"id": "leech_seed",
		"name": "Leech Seed",
		"type": "GRASS",
		"category": "special",
		"power": 0,
		"pp": 10
	},
	"vine_whip": {
		"id": "vine_whip",
		"name": "Vine Whip",
		"type": "GRASS",
		"category": "special",
		"power": 35,
		"pp": 10
	},
	"poisonpowder": {
		"id": "poisonpowder",
		"name": "PoisonPowder",
		"type": "POISON",
		"category": "physical",
		"power": 0,
		"pp": 35
	},
	"sleep_powder": {
		"id": "sleep_powder",
		"name": "Sleep Powder",
		"type": "GRASS",
		"category": "special",
		"power": 0,
		"pp": 15
	},
	"razor_leaf": {
		"id": "razor_leaf",
		"name": "Razor Leaf",
		"type": "GRASS",
		"category": "special",
		"power": 55,
		"pp": 25
	},
	"sweet_scent": {
		"id": "sweet_scent",
		"name": "Sweet Scent",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 20
	},
	"growth": {
		"id": "growth",
		"name": "Growth",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 40
	},
	"synthesis": {
		"id": "synthesis",
		"name": "Synthesis",
		"type": "GRASS",
		"category": "special",
		"power": 0,
		"pp": 5
	},
	"solarbeam": {
		"id": "solarbeam",
		"name": "SolarBeam",
		"type": "GRASS",
		"category": "special",
		"power": 120,
		"pp": 10
	},
	"gust": {
		"id": "gust",
		"name": "Gust",
		"type": "FLYING",
		"category": "physical",
		"power": 40,
		"pp": 35
	},
	"powder_snow": {
		"id": "powder_snow",
		"name": "Powder Snow",
		"type": "ICE",
		"category": "special",
		"power": 40,
		"pp": 25
	},
	"mist": {
		"id": "mist",
		"name": "Mist",
		"type": "ICE",
		"category": "special",
		"power": 0,
		"pp": 30
	},
	"agility": {
		"id": "agility",
		"name": "Agility",
		"type": "PSYCHIC",
		"category": "special",
		"power": 0,
		"pp": 30
	},
	"mind_reader": {
		"id": "mind_reader",
		"name": "Mind Reader",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 5
	},
	"ice_beam": {
		"id": "ice_beam",
		"name": "Ice Beam",
		"type": "ICE",
		"category": "special",
		"power": 95,
		"pp": 10
	},
	"reflect": {
		"id": "reflect",
		"name": "Reflect",
		"type": "PSYCHIC",
		"category": "special",
		"power": 0,
		"pp": 20
	},
	"blizzard": {
		"id": "blizzard",
		"name": "Blizzard",
		"type": "ICE",
		"category": "special",
		"power": 120,
		"pp": 5
	},
	"peck": {
		"id": "peck",
		"name": "Peck",
		"type": "FLYING",
		"category": "physical",
		"power": 35,
		"pp": 35
	},
	"thundershock": {
		"id": "thundershock",
		"name": "Thunder Shock",
		"type": "ELECTRIC",
		"category": "special",
		"power": 40,
		"pp": 30
	},
	"thunder_wave": {
		"id": "thunder_wave",
		"name": "Thunder Wave",
		"type": "ELECTRIC",
		"category": "special",
		"power": 0,
		"pp": 20
	},
	"detect": {
		"id": "detect",
		"name": "Detect",
		"type": "FIGHTING",
		"category": "physical",
		"power": 0,
		"pp": 5
	},
	"drill_peck": {
		"id": "drill_peck",
		"name": "Drill Peck",
		"type": "FLYING",
		"category": "physical",
		"power": 80,
		"pp": 20
	},
	"light_screen": {
		"id": "light_screen",
		"name": "Light Screen",
		"type": "PSYCHIC",
		"category": "special",
		"power": 0,
		"pp": 30
	},
	"thunder": {
		"id": "thunder",
		"name": "Thunder",
		"type": "ELECTRIC",
		"category": "special",
		"power": 120,
		"pp": 10
	},
	"wing_attack": {
		"id": "wing_attack",
		"name": "Wing Attack",
		"type": "FLYING",
		"category": "physical",
		"power": 60,
		"pp": 35
	},
	"endure": {
		"id": "endure",
		"name": "Endure",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 10
	},
	"safeguard": {
		"id": "safeguard",
		"name": "Safeguard",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 25
	},
	"sky_attack": {
		"id": "sky_attack",
		"name": "Sky Attack",
		"type": "FLYING",
		"category": "physical",
		"power": 140,
		"pp": 5
	},
	"leer": {
		"id": "leer",
		"name": "Leer",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 30
	},
	"roar": {
		"id": "roar",
		"name": "Roar",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 20
	},
	"quick_attack": {
		"id": "quick_attack",
		"name": "Quick Attack",
		"type": "NORMAL",
		"category": "physical",
		"power": 40,
		"pp": 30
	},
	"spark": {
		"id": "spark",
		"name": "Spark",
		"type": "ELECTRIC",
		"category": "special",
		"power": 65,
		"pp": 20
	},
	"crunch": {
		"id": "crunch",
		"name": "Crunch",
		"type": "DARK",
		"category": "special",
		"power": 80,
		"pp": 15
	},
	"stomp": {
		"id": "stomp",
		"name": "Stomp",
		"type": "NORMAL",
		"category": "physical",
		"power": 65,
		"pp": 20
	},
	"swagger": {
		"id": "swagger",
		"name": "Swagger",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 15
	},
	"fire_blast": {
		"id": "fire_blast",
		"name": "Fire Blast",
		"type": "FIRE",
		"category": "special",
		"power": 120,
		"pp": 5
	},
	"bubblebeam": {
		"id": "bubblebeam",
		"name": "Bubblebeam",
		"type": "WATER",
		"category": "special",
		"power": 65,
		"pp": 20
	},
	"aurora_beam": {
		"id": "aurora_beam",
		"name": "Aurora Beam",
		"type": "ICE",
		"category": "special",
		"power": 65,
		"pp": 20
	},
	"mirror_coat": {
		"id": "mirror_coat",
		"name": "Mirror Coat",
		"type": "PSYCHIC",
		"category": "special",
		"power": 1,
		"pp": 20
	},
	"aeroblast": {
		"id": "aeroblast",
		"name": "Aeroblast",
		"type": "FLYING",
		"category": "physical",
		"power": 100,
		"pp": 5
	},
	"recover": {
		"id": "recover",
		"name": "Recover",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 20
	},
	"swift": {
		"id": "swift",
		"name": "Swift",
		"type": "NORMAL",
		"category": "physical",
		"power": 60,
		"pp": 20
	},
	"whirlwind": {
		"id": "whirlwind",
		"name": "Whirlwind",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 20
	},
	"ancientpower": {
		"id": "ancientpower",
		"name": "AncientPower",
		"type": "ROCK",
		"category": "physical",
		"power": 60,
		"pp": 5
	},
	"future_sight": {
		"id": "future_sight",
		"name": "Future Sight",
		"type": "PSYCHIC",
		"category": "special",
		"power": 80,
		"pp": 15
	},
	"sacred_fire": {
		"id": "sacred_fire",
		"name": "Sacred Fire",
		"type": "FIRE",
		"category": "special",
		"power": 100,
		"pp": 5
	},
	"sunny_day": {
		"id": "sunny_day",
		"name": "Sunny Day",
		"type": "FIRE",
		"category": "special",
		"power": 0,
		"pp": 5
	},
	"confusion": {
		"id": "confusion",
		"name": "Confusion",
		"type": "PSYCHIC",
		"category": "special",
		"power": 50,
		"pp": 25
	},
	"heal_bell": {
		"id": "heal_bell",
		"name": "Heal Bell",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 5
	},
	"baton_pass": {
		"id": "baton_pass",
		"name": "Baton Pass",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 40
	},
	"perish_song": {
		"id": "perish_song",
		"name": "Perish Song",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 5
	},
	"disable": {
		"id": "disable",
		"name": "Disable",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 20
	},
	"barrier": {
		"id": "barrier",
		"name": "Barrier",
		"type": "PSYCHIC",
		"category": "special",
		"power": 0,
		"pp": 30
	},
	"psych_up": {
		"id": "psych_up",
		"name": "Psych Up",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 10
	},
	"psychic_m": {
		"id": "psychic_m",
		"name": "Psychic",
		"type": "PSYCHIC",
		"category": "special",
		"power": 90,
		"pp": 10
	},
	"amnesia": {
		"id": "amnesia",
		"name": "Amnesia",
		"type": "PSYCHIC",
		"category": "special",
		"power": 0,
		"pp": 20
	},
	"pound": {
		"id": "pound",
		"name": "Pound",
		"type": "NORMAL",
		"category": "physical",
		"power": 40,
		"pp": 35
	},
	"transform": {
		"id": "transform",
		"name": "Transform",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 10
	},
	"mega_punch": {
		"id": "mega_punch",
		"name": "Mega Punch",
		"type": "NORMAL",
		"category": "physical",
		"power": 80,
		"pp": 20
	},
	"metronome": {
		"id": "metronome",
		"name": "Metronome",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 10
	},
	"defense_curl": {
		"id": "defense_curl",
		"name": "Defense Curl",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 40
	},
	"rock_throw": {
		"id": "rock_throw",
		"name": "Rock Throw",
		"type": "ROCK",
		"category": "physical",
		"power": 50,
		"pp": 15
	},
	"magnitude": {
		"id": "magnitude",
		"name": "Magnitude",
		"type": "GROUND",
		"category": "physical",
		"power": 1,
		"pp": 30
	},
	"selfdestruct": {
		"id": "selfdestruct",
		"name": "Self-Destruct",
		"type": "NORMAL",
		"category": "physical",
		"power": 200,
		"pp": 5
	},
	"harden": {
		"id": "harden",
		"name": "Harden",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 30
	},
	"rollout": {
		"id": "rollout",
		"name": "Rollout",
		"type": "ROCK",
		"category": "physical",
		"power": 30,
		"pp": 20
	},
	"earthquake": {
		"id": "earthquake",
		"name": "Earthquake",
		"type": "GROUND",
		"category": "physical",
		"power": 100,
		"pp": 10
	},
	"explosion": {
		"id": "explosion",
		"name": "Explosion",
		"type": "NORMAL",
		"category": "physical",
		"power": 250,
		"pp": 5
	},
	"fury_attack": {
		"id": "fury_attack",
		"name": "Fury Attack",
		"type": "NORMAL",
		"category": "physical",
		"power": 15,
		"pp": 20
	},
	"pursuit": {
		"id": "pursuit",
		"name": "Pursuit",
		"type": "DARK",
		"category": "special",
		"power": 40,
		"pp": 20
	},
	"mirror_move": {
		"id": "mirror_move",
		"name": "Mirror Move",
		"type": "FLYING",
		"category": "physical",
		"power": 0,
		"pp": 20
	},
	"hyper_fang": {
		"id": "hyper_fang",
		"name": "Hyper Fang",
		"type": "NORMAL",
		"category": "physical",
		"power": 80,
		"pp": 15
	},
	"focus_energy": {
		"id": "focus_energy",
		"name": "Focus Energy",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 30
	},
	"super_fang": {
		"id": "super_fang",
		"name": "Super Fang",
		"type": "NORMAL",
		"category": "physical",
		"power": 1,
		"pp": 10
	},
	"absorb": {
		"id": "absorb",
		"name": "Absorb",
		"type": "GRASS",
		"category": "special",
		"power": 20,
		"pp": 20
	},
	"stun_spore": {
		"id": "stun_spore",
		"name": "Stun Spore",
		"type": "GRASS",
		"category": "special",
		"power": 0,
		"pp": 30
	},
	"acid": {
		"id": "acid",
		"name": "Acid",
		"type": "POISON",
		"category": "physical",
		"power": 40,
		"pp": 30
	},
	"moonlight": {
		"id": "moonlight",
		"name": "Moonlight",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 5
	},
	"petal_dance": {
		"id": "petal_dance",
		"name": "Petal Dance",
		"type": "GRASS",
		"category": "special",
		"power": 70,
		"pp": 20
	},
	"wrap": {
		"id": "wrap",
		"name": "Wrap",
		"type": "NORMAL",
		"category": "physical",
		"power": 15,
		"pp": 20
	},
	"slam": {
		"id": "slam",
		"name": "Slam",
		"type": "NORMAL",
		"category": "physical",
		"power": 80,
		"pp": 20
	},
	"barrage": {
		"id": "barrage",
		"name": "Barrage",
		"type": "NORMAL",
		"category": "physical",
		"power": 15,
		"pp": 20
	},
	"hypnosis": {
		"id": "hypnosis",
		"name": "Hypnosis",
		"type": "PSYCHIC",
		"category": "special",
		"power": 0,
		"pp": 20
	},
	"constrict": {
		"id": "constrict",
		"name": "Constrict",
		"type": "NORMAL",
		"category": "physical",
		"power": 10,
		"pp": 35
	},
	"bind": {
		"id": "bind",
		"name": "Bind",
		"type": "NORMAL",
		"category": "physical",
		"power": 15,
		"pp": 20
	},
	"mega_drain": {
		"id": "mega_drain",
		"name": "Mega Drain",
		"type": "GRASS",
		"category": "special",
		"power": 40,
		"pp": 10
	},
	"body_slam": {
		"id": "body_slam",
		"name": "Body Slam",
		"type": "NORMAL",
		"category": "physical",
		"power": 85,
		"pp": 15
	},
	"splash": {
		"id": "splash",
		"name": "Splash",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 40
	},
	"cotton_spore": {
		"id": "cotton_spore",
		"name": "Cotton Spore",
		"type": "GRASS",
		"category": "special",
		"power": 0,
		"pp": 40
	},
	"giga_drain": {
		"id": "giga_drain",
		"name": "Giga Drain",
		"type": "GRASS",
		"category": "special",
		"power": 60,
		"pp": 5
	},
	"string_shot": {
		"id": "string_shot",
		"name": "String Shot",
		"type": "BUG",
		"category": "physical",
		"power": 0,
		"pp": 40
	},
	"supersonic": {
		"id": "supersonic",
		"name": "Supersonic",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 20
	},
	"psybeam": {
		"id": "psybeam",
		"name": "Psybeam",
		"type": "PSYCHIC",
		"category": "special",
		"power": 65,
		"pp": 20
	},
	"poison_sting": {
		"id": "poison_sting",
		"name": "Poison Sting",
		"type": "POISON",
		"category": "physical",
		"power": 15,
		"pp": 35
	},
	"twineedle": {
		"id": "twineedle",
		"name": "Twineedle",
		"type": "BUG",
		"category": "physical",
		"power": 25,
		"pp": 20
	},
	"pin_missile": {
		"id": "pin_missile",
		"name": "Pin Missile",
		"type": "BUG",
		"category": "physical",
		"power": 14,
		"pp": 20
	},
	"leech_life": {
		"id": "leech_life",
		"name": "Leech Life",
		"type": "BUG",
		"category": "physical",
		"power": 20,
		"pp": 15
	},
	"spore": {
		"id": "spore",
		"name": "Spore",
		"type": "GRASS",
		"category": "special",
		"power": 0,
		"pp": 15
	},
	"foresight": {
		"id": "foresight",
		"name": "Foresight",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 40
	},
	"false_swipe": {
		"id": "false_swipe",
		"name": "False Swipe",
		"type": "NORMAL",
		"category": "physical",
		"power": 40,
		"pp": 40
	},
	"swords_dance": {
		"id": "swords_dance",
		"name": "Swords Dance",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 30
	},
	"double_team": {
		"id": "double_team",
		"name": "Double Team",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 15
	},
	"vicegrip": {
		"id": "vicegrip",
		"name": "Vice Grip",
		"type": "NORMAL",
		"category": "physical",
		"power": 55,
		"pp": 30
	},
	"seismic_toss": {
		"id": "seismic_toss",
		"name": "Seismic Toss",
		"type": "FIGHTING",
		"category": "physical",
		"power": 1,
		"pp": 20
	},
	"guillotine": {
		"id": "guillotine",
		"name": "Guillotine",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 5
	},
	"submission": {
		"id": "submission",
		"name": "Submission",
		"type": "FIGHTING",
		"category": "physical",
		"power": 80,
		"pp": 25
	},
	"comet_punch": {
		"id": "comet_punch",
		"name": "Comet Punch",
		"type": "NORMAL",
		"category": "physical",
		"power": 18,
		"pp": 15
	},
	"double_edge": {
		"id": "double_edge",
		"name": "Double-Edge",
		"type": "NORMAL",
		"category": "physical",
		"power": 120,
		"pp": 15
	},
	"night_shade": {
		"id": "night_shade",
		"name": "Night Shade",
		"type": "GHOST",
		"category": "physical",
		"power": 1,
		"pp": 15
	},
	"fury_swipes": {
		"id": "fury_swipes",
		"name": "Fury Swipes",
		"type": "NORMAL",
		"category": "physical",
		"power": 18,
		"pp": 15
	},
	"spider_web": {
		"id": "spider_web",
		"name": "Spider Web",
		"type": "BUG",
		"category": "physical",
		"power": 0,
		"pp": 10
	},
	"sonicboom": {
		"id": "sonicboom",
		"name": "Sonic Boom",
		"type": "NORMAL",
		"category": "physical",
		"power": 20,
		"pp": 20
	},
	"screech": {
		"id": "screech",
		"name": "Screech",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 40
	},
	"take_down": {
		"id": "take_down",
		"name": "Take Down",
		"type": "NORMAL",
		"category": "physical",
		"power": 90,
		"pp": 20
	},
	"bide": {
		"id": "bide",
		"name": "Bide",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 10
	},
	"spikes": {
		"id": "spikes",
		"name": "Spikes",
		"type": "GROUND",
		"category": "physical",
		"power": 0,
		"pp": 20
	},
	"metal_claw": {
		"id": "metal_claw",
		"name": "Metal Claw",
		"type": "STEEL",
		"category": "physical",
		"power": 50,
		"pp": 35
	},
	"horn_attack": {
		"id": "horn_attack",
		"name": "Horn Attack",
		"type": "NORMAL",
		"category": "physical",
		"power": 65,
		"pp": 25
	},
	"counter": {
		"id": "counter",
		"name": "Counter",
		"type": "FIGHTING",
		"category": "physical",
		"power": 1,
		"pp": 20
	},
	"reversal": {
		"id": "reversal",
		"name": "Reversal",
		"type": "FIGHTING",
		"category": "physical",
		"power": 1,
		"pp": 15
	},
	"megahorn": {
		"id": "megahorn",
		"name": "Megahorn",
		"type": "BUG",
		"category": "physical",
		"power": 120,
		"pp": 10
	},
	"flail": {
		"id": "flail",
		"name": "Flail",
		"type": "NORMAL",
		"category": "physical",
		"power": 1,
		"pp": 15
	},
	"haze": {
		"id": "haze",
		"name": "Haze",
		"type": "ICE",
		"category": "special",
		"power": 0,
		"pp": 30
	},
	"doubleslap": {
		"id": "doubleslap",
		"name": "DoubleSlap",
		"type": "NORMAL",
		"category": "physical",
		"power": 15,
		"pp": 10
	},
	"belly_drum": {
		"id": "belly_drum",
		"name": "Belly Drum",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 10
	},
	"lock_on": {
		"id": "lock_on",
		"name": "Lock On",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 5
	},
	"hyper_beam": {
		"id": "hyper_beam",
		"name": "Hyper Beam",
		"type": "NORMAL",
		"category": "physical",
		"power": 150,
		"pp": 5
	},
	"twister": {
		"id": "twister",
		"name": "Twister",
		"type": "DRAGON",
		"category": "special",
		"power": 40,
		"pp": 20
	},
	"confuse_ray": {
		"id": "confuse_ray",
		"name": "Confuse Ray",
		"type": "GHOST",
		"category": "physical",
		"power": 0,
		"pp": 10
	},
	"clamp": {
		"id": "clamp",
		"name": "Clamp",
		"type": "WATER",
		"category": "special",
		"power": 35,
		"pp": 10
	},
	"curse": {
		"id": "curse",
		"name": "Curse",
		"type": "GHOST",
		"category": "physical",
		"power": 0,
		"pp": 10
	},
	"headbutt": {
		"id": "headbutt",
		"name": "Headbutt",
		"type": "NORMAL",
		"category": "physical",
		"power": 70,
		"pp": 15
	},
	"rest": {
		"id": "rest",
		"name": "Rest",
		"type": "PSYCHIC",
		"category": "special",
		"power": 0,
		"pp": 10
	},
	"minimize": {
		"id": "minimize",
		"name": "Minimize",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 20
	},
	"waterfall": {
		"id": "waterfall",
		"name": "Waterfall",
		"type": "WATER",
		"category": "special",
		"power": 80,
		"pp": 15
	},
	"horn_drill": {
		"id": "horn_drill",
		"name": "Horn Drill",
		"type": "NORMAL",
		"category": "physical",
		"power": 1,
		"pp": 5
	},
	"spike_cannon": {
		"id": "spike_cannon",
		"name": "Spike Cannon",
		"type": "NORMAL",
		"category": "physical",
		"power": 20,
		"pp": 15
	},
	"crabhammer": {
		"id": "crabhammer",
		"name": "Crabhammer",
		"type": "WATER",
		"category": "special",
		"power": 90,
		"pp": 10
	},
	"sand_attack": {
		"id": "sand_attack",
		"name": "Sand Attack",
		"type": "GROUND",
		"category": "physical",
		"power": 0,
		"pp": 15
	},
	"sing": {
		"id": "sing",
		"name": "Sing",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 15
	},
	"pay_day": {
		"id": "pay_day",
		"name": "Pay Day",
		"type": "NORMAL",
		"category": "physical",
		"power": 40,
		"pp": 20
	},
	"faint_attack": {
		"id": "faint_attack",
		"name": "Faint Attack",
		"type": "DARK",
		"category": "special",
		"power": 60,
		"pp": 20
	},
	"tri_attack": {
		"id": "tri_attack",
		"name": "Tri Attack",
		"type": "NORMAL",
		"category": "physical",
		"power": 80,
		"pp": 10
	},
	"lick": {
		"id": "lick",
		"name": "Lick",
		"type": "GHOST",
		"category": "physical",
		"power": 20,
		"pp": 30
	},
	"dizzy_punch": {
		"id": "dizzy_punch",
		"name": "Dizzy Punch",
		"type": "NORMAL",
		"category": "physical",
		"power": 70,
		"pp": 10
	},
	"thrash": {
		"id": "thrash",
		"name": "Thrash",
		"type": "NORMAL",
		"category": "physical",
		"power": 90,
		"pp": 20
	},
	"conversion2": {
		"id": "conversion2",
		"name": "Conversion 2",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 30
	},
	"conversion": {
		"id": "conversion",
		"name": "Conversion",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 30
	},
	"sharpen": {
		"id": "sharpen",
		"name": "Sharpen",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 30
	},
	"zap_cannon": {
		"id": "zap_cannon",
		"name": "Zap Cannon",
		"type": "ELECTRIC",
		"category": "special",
		"power": 100,
		"pp": 5
	},
	"snore": {
		"id": "snore",
		"name": "Snore",
		"type": "NORMAL",
		"category": "physical",
		"power": 40,
		"pp": 15
	},
	"dream_eater": {
		"id": "dream_eater",
		"name": "Dream Eater",
		"type": "PSYCHIC",
		"category": "special",
		"power": 100,
		"pp": 15
	},
	"charm": {
		"id": "charm",
		"name": "Charm",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 20
	},
	"encore": {
		"id": "encore",
		"name": "Encore",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 5
	},
	"sweet_kiss": {
		"id": "sweet_kiss",
		"name": "Sweet Kiss",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 10
	},
	"glare": {
		"id": "glare",
		"name": "Glare",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 30
	},
	"spite": {
		"id": "spite",
		"name": "Spite",
		"type": "GHOST",
		"category": "physical",
		"power": 0,
		"pp": 10
	},
	"sketch": {
		"id": "sketch",
		"name": "Sketch",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 1
	},
	"milk_drink": {
		"id": "milk_drink",
		"name": "Milk Drink",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 10
	},
	"sandstorm": {
		"id": "sandstorm",
		"name": "Sandstorm",
		"type": "ROCK",
		"category": "physical",
		"power": 0,
		"pp": 10
	},
	"mimic": {
		"id": "mimic",
		"name": "Mimic",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 10
	},
	"low_kick": {
		"id": "low_kick",
		"name": "Low Kick",
		"type": "FIGHTING",
		"category": "physical",
		"power": 50,
		"pp": 20
	},
	"rock_slide": {
		"id": "rock_slide",
		"name": "Rock Slide",
		"type": "ROCK",
		"category": "physical",
		"power": 75,
		"pp": 10
	},
	"dig": {
		"id": "dig",
		"name": "Dig",
		"type": "GROUND",
		"category": "physical",
		"power": 60,
		"pp": 10
	},
	"fissure": {
		"id": "fissure",
		"name": "Fissure",
		"type": "GROUND",
		"category": "physical",
		"power": 1,
		"pp": 5
	},
	"bone_club": {
		"id": "bone_club",
		"name": "Bone Club",
		"type": "GROUND",
		"category": "physical",
		"power": 65,
		"pp": 20
	},
	"bonemerang": {
		"id": "bonemerang",
		"name": "Bonemerang",
		"type": "GROUND",
		"category": "physical",
		"power": 50,
		"pp": 10
	},
	"bone_rush": {
		"id": "bone_rush",
		"name": "Bone Rush",
		"type": "GROUND",
		"category": "physical",
		"power": 25,
		"pp": 10
	},
	"flame_wheel": {
		"id": "flame_wheel",
		"name": "Flame Wheel",
		"type": "FIRE",
		"category": "special",
		"power": 60,
		"pp": 25
	},
	"extremespeed": {
		"id": "extremespeed",
		"name": "Extreme Speed",
		"type": "NORMAL",
		"category": "physical",
		"power": 80,
		"pp": 5
	},
	"smog": {
		"id": "smog",
		"name": "Smog",
		"type": "POISON",
		"category": "physical",
		"power": 20,
		"pp": 20
	},
	"fire_punch": {
		"id": "fire_punch",
		"name": "Fire Punch",
		"type": "FIRE",
		"category": "special",
		"power": 75,
		"pp": 15
	},
	"thunderbolt": {
		"id": "thunderbolt",
		"name": "Thunderbolt",
		"type": "ELECTRIC",
		"category": "special",
		"power": 95,
		"pp": 15
	},
	"thunderpunch": {
		"id": "thunderpunch",
		"name": "Thunder Punch",
		"type": "ELECTRIC",
		"category": "special",
		"power": 75,
		"pp": 15
	},
	"double_kick": {
		"id": "double_kick",
		"name": "Double Kick",
		"type": "FIGHTING",
		"category": "physical",
		"power": 30,
		"pp": 30
	},
	"mean_look": {
		"id": "mean_look",
		"name": "Mean Look",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 5
	},
	"poison_gas": {
		"id": "poison_gas",
		"name": "Poison Gas",
		"type": "POISON",
		"category": "physical",
		"power": 0,
		"pp": 40
	},
	"sludge": {
		"id": "sludge",
		"name": "Sludge",
		"type": "POISON",
		"category": "physical",
		"power": 65,
		"pp": 20
	},
	"acid_armor": {
		"id": "acid_armor",
		"name": "Acid Armor",
		"type": "POISON",
		"category": "physical",
		"power": 0,
		"pp": 40
	},
	"sludge_bomb": {
		"id": "sludge_bomb",
		"name": "Sludge Bomb",
		"type": "POISON",
		"category": "physical",
		"power": 90,
		"pp": 10
	},
	"destiny_bond": {
		"id": "destiny_bond",
		"name": "Destiny Bond",
		"type": "GHOST",
		"category": "physical",
		"power": 0,
		"pp": 5
	},
	"karate_chop": {
		"id": "karate_chop",
		"name": "Karate Chop",
		"type": "FIGHTING",
		"category": "physical",
		"power": 50,
		"pp": 25
	},
	"cross_chop": {
		"id": "cross_chop",
		"name": "Cross Chop",
		"type": "FIGHTING",
		"category": "physical",
		"power": 100,
		"pp": 5
	},
	"vital_throw": {
		"id": "vital_throw",
		"name": "Vital Throw",
		"type": "FIGHTING",
		"category": "physical",
		"power": 70,
		"pp": 10
	},
	"meditate": {
		"id": "meditate",
		"name": "Meditate",
		"type": "PSYCHIC",
		"category": "special",
		"power": 0,
		"pp": 40
	},
	"rolling_kick": {
		"id": "rolling_kick",
		"name": "Rolling Kick",
		"type": "FIGHTING",
		"category": "physical",
		"power": 60,
		"pp": 15
	},
	"jump_kick": {
		"id": "jump_kick",
		"name": "Jump Kick",
		"type": "FIGHTING",
		"category": "physical",
		"power": 70,
		"pp": 25
	},
	"hi_jump_kick": {
		"id": "hi_jump_kick",
		"name": "Hi Jump Kick",
		"type": "FIGHTING",
		"category": "physical",
		"power": 85,
		"pp": 20
	},
	"mega_kick": {
		"id": "mega_kick",
		"name": "Mega Kick",
		"type": "NORMAL",
		"category": "physical",
		"power": 120,
		"pp": 5
	},
	"ice_punch": {
		"id": "ice_punch",
		"name": "Ice Punch",
		"type": "ICE",
		"category": "special",
		"power": 75,
		"pp": 15
	},
	"mach_punch": {
		"id": "mach_punch",
		"name": "Mach Punch",
		"type": "FIGHTING",
		"category": "physical",
		"power": 40,
		"pp": 30
	},
	"lovely_kiss": {
		"id": "lovely_kiss",
		"name": "Lovely Kiss",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 10
	},
	"present": {
		"id": "present",
		"name": "Present",
		"type": "NORMAL",
		"category": "physical",
		"power": 1,
		"pp": 15
	},
	"steel_wing": {
		"id": "steel_wing",
		"name": "Steel Wing",
		"type": "STEEL",
		"category": "physical",
		"power": 70,
		"pp": 25
	},
	"teleport": {
		"id": "teleport",
		"name": "Teleport",
		"type": "PSYCHIC",
		"category": "special",
		"power": 0,
		"pp": 20
	},
	"kinesis": {
		"id": "kinesis",
		"name": "Kinesis",
		"type": "PSYCHIC",
		"category": "special",
		"power": 0,
		"pp": 15
	},
	"hidden_power": {
		"id": "hidden_power",
		"name": "Hidden Power",
		"type": "NORMAL",
		"category": "physical",
		"power": 1,
		"pp": 15
	},
	"psywave": {
		"id": "psywave",
		"name": "Psywave",
		"type": "PSYCHIC",
		"category": "special",
		"power": 1,
		"pp": 15
	},
	"pain_split": {
		"id": "pain_split",
		"name": "Pain Split",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 20
	},
	"beat_up": {
		"id": "beat_up",
		"name": "Beat Up",
		"type": "DARK",
		"category": "special",
		"power": 10,
		"pp": 10
	},
	"outrage": {
		"id": "outrage",
		"name": "Outrage",
		"type": "DRAGON",
		"category": "special",
		"power": 90,
		"pp": 15
	},
	"octazooka": {
		"id": "octazooka",
		"name": "Octazooka",
		"type": "WATER",
		"category": "special",
		"power": 65,
		"pp": 10
	}
};
//#endregion
//#region src/data/typeColors.ts
var TYPE_COLORS = {
	NORMAL: "#a8a878",
	FIRE: "#ff6b35",
	WATER: "#4fc3f7",
	ELECTRIC: "#ffd23f",
	GRASS: "#4caf50",
	ICE: "#7dd3fc",
	FIGHTING: "#c0392b",
	POISON: "#9b59b6",
	GROUND: "#c9a66b",
	FLYING: "#a8d8ea",
	PSYCHIC: "#ff6b9d",
	BUG: "#8bc34a",
	ROCK: "#8d6e63",
	GHOST: "#6c5b7b",
	DRAGON: "#5b6ee1",
	DARK: "#4a4a4a",
	STEEL: "#b0bec5"
};
var FALLBACK_COLOR = "#d1c7b7";
function colorForType(type) {
	return type && TYPE_COLORS[type] || FALLBACK_COLOR;
}
//#endregion
//#region src/data/typedAoeMoves.ts
var TYPED_AOE_POWER = 70;
var TYPED_AOE_PP = 7;
function typedAoeMoveKey(type) {
	return `aoe50_${type.toLowerCase()}`;
}
function buildTypedAoeMoves() {
	const moves = {};
	for (const type of Object.keys(TYPE_COLORS)) {
		const key = typedAoeMoveKey(type);
		moves[key] = {
			id: key,
			name: `Explosao Elemental (${type})`,
			type,
			category: "dynamic",
			power: TYPED_AOE_POWER,
			pp: TYPED_AOE_PP
		};
	}
	return moves;
}
var TYPED_AOE_MOVES = buildTypedAoeMoves();
//#endregion
//#region src/data/abilities.ts
var TICK_SECONDS = createFormulaEngine(FORMULAS).eval("TICK_MS") / 1e3;
var PP_REFERENCE = 20;
function cooldownFromPp(pp) {
	return TICK_SECONDS * (PP_REFERENCE / Math.max(1, pp));
}
var BASIC_ATTACK = {
	id: "basic_attack",
	name: "Ataque Basico",
	category: "physical",
	type: "NORMAL",
	target: "single",
	power: 40,
	pp: 35
};
var AOE_ABILITY_KEYS = /* @__PURE__ */ new Set([
	"razor_leaf",
	"bubble",
	"earthquake",
	"explosion",
	"magnitude",
	"selfdestruct",
	...Object.keys(TYPED_AOE_MOVES)
]);
var ALL_ABILITIES_SOURCE = {
	...ABILITIES_DATA,
	...TYPED_AOE_MOVES
};
var ABILITIES = Object.fromEntries(Object.entries(ALL_ABILITIES_SOURCE).map(([key, ability]) => {
	const isAoe = AOE_ABILITY_KEYS.has(key);
	return [key, {
		...ability,
		target: isAoe ? "aoe" : "single",
		radius: isAoe ? 240 : void 0,
		cooldown: cooldownFromPp(ability.pp)
	}];
}));
function getAbility(id) {
	if (id === BASIC_ATTACK.id) return BASIC_ATTACK;
	return ABILITIES[id] || null;
}
function isDamagingAbility(ability) {
	return !!ability && ability.power > 0;
}
//#endregion
//#region src/data/generated/pokes.generated.ts
var SPECIES_DATA = {
	"charmander": {
		"id": "charmander",
		"name": "Charmander",
		"description": "Pokedex Nº4 - tipo FIRE.",
		"type": "FIRE",
		"type2": null,
		"catchRate": 45,
		"baseExp": 65,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 39,
			"atkFis": 52,
			"atkEsp": 60,
			"def": 43,
			"defEsp": 50,
			"speed": 65
		},
		"abilities": [
			{
				"key": "scratch",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "ember",
				"levelReq": 7
			},
			{
				"key": "smokescreen",
				"levelReq": 13
			},
			{
				"key": "rage",
				"levelReq": 19
			},
			{
				"key": "scary_face",
				"levelReq": 25
			},
			{
				"key": "flamethrower",
				"levelReq": 31
			},
			{
				"key": "slash",
				"levelReq": 37
			},
			{
				"key": "dragon_rage",
				"levelReq": 43
			},
			{
				"key": "fire_spin",
				"levelReq": 49
			}
		],
		"evolvesTo": "charmeleon",
		"evolvesAtLevel": 16
	},
	"squirtle": {
		"id": "squirtle",
		"name": "Squirtle",
		"description": "Pokedex Nº7 - tipo WATER.",
		"type": "WATER",
		"type2": null,
		"catchRate": 45,
		"baseExp": 66,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 44,
			"atkFis": 48,
			"atkEsp": 50,
			"def": 65,
			"defEsp": 64,
			"speed": 43
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "tail_whip",
				"levelReq": 4
			},
			{
				"key": "bubble",
				"levelReq": 7
			},
			{
				"key": "withdraw",
				"levelReq": 10
			},
			{
				"key": "water_gun",
				"levelReq": 13
			},
			{
				"key": "bite",
				"levelReq": 18
			},
			{
				"key": "rapid_spin",
				"levelReq": 23
			},
			{
				"key": "protect",
				"levelReq": 28
			},
			{
				"key": "rain_dance",
				"levelReq": 33
			},
			{
				"key": "skull_bash",
				"levelReq": 40
			},
			{
				"key": "hydro_pump",
				"levelReq": 47
			}
		],
		"evolvesTo": "wartortle",
		"evolvesAtLevel": 16
	},
	"bulbasaur": {
		"id": "bulbasaur",
		"name": "Bulbasaur",
		"description": "Pokedex Nº1 - tipo GRASS/POISON.",
		"type": "GRASS",
		"type2": "POISON",
		"catchRate": 45,
		"baseExp": 64,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 45,
			"atkFis": 49,
			"atkEsp": 65,
			"def": 49,
			"defEsp": 65,
			"speed": 45
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 4
			},
			{
				"key": "leech_seed",
				"levelReq": 7
			},
			{
				"key": "vine_whip",
				"levelReq": 10
			},
			{
				"key": "poisonpowder",
				"levelReq": 15
			},
			{
				"key": "sleep_powder",
				"levelReq": 15
			},
			{
				"key": "razor_leaf",
				"levelReq": 20
			},
			{
				"key": "sweet_scent",
				"levelReq": 25
			},
			{
				"key": "growth",
				"levelReq": 32
			},
			{
				"key": "synthesis",
				"levelReq": 39
			},
			{
				"key": "solarbeam",
				"levelReq": 46
			}
		],
		"evolvesTo": "ivysaur",
		"evolvesAtLevel": 16
	},
	"articuno": {
		"id": "articuno",
		"name": "Articuno",
		"description": "Pokedex Nº144 - tipo ICE/FLYING.",
		"type": "ICE",
		"type2": "FLYING",
		"catchRate": 3,
		"baseExp": 215,
		"growthCurve": "SLOW",
		"base": {
			"hp": 90,
			"atkFis": 85,
			"atkEsp": 95,
			"def": 100,
			"defEsp": 125,
			"speed": 85
		},
		"abilities": [
			{
				"key": "gust",
				"levelReq": 1
			},
			{
				"key": "powder_snow",
				"levelReq": 1
			},
			{
				"key": "mist",
				"levelReq": 13
			},
			{
				"key": "agility",
				"levelReq": 25
			},
			{
				"key": "mind_reader",
				"levelReq": 37
			},
			{
				"key": "ice_beam",
				"levelReq": 49
			},
			{
				"key": "reflect",
				"levelReq": 61
			},
			{
				"key": "blizzard",
				"levelReq": 73
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"zapdos": {
		"id": "zapdos",
		"name": "Zapdos",
		"description": "Pokedex Nº145 - tipo ELECTRIC/FLYING.",
		"type": "ELECTRIC",
		"type2": "FLYING",
		"catchRate": 3,
		"baseExp": 216,
		"growthCurve": "SLOW",
		"base": {
			"hp": 90,
			"atkFis": 90,
			"atkEsp": 125,
			"def": 85,
			"defEsp": 90,
			"speed": 100
		},
		"abilities": [
			{
				"key": "peck",
				"levelReq": 1
			},
			{
				"key": "thundershock",
				"levelReq": 1
			},
			{
				"key": "thunder_wave",
				"levelReq": 13
			},
			{
				"key": "agility",
				"levelReq": 25
			},
			{
				"key": "detect",
				"levelReq": 37
			},
			{
				"key": "drill_peck",
				"levelReq": 49
			},
			{
				"key": "light_screen",
				"levelReq": 61
			},
			{
				"key": "thunder",
				"levelReq": 73
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"moltres": {
		"id": "moltres",
		"name": "Moltres",
		"description": "Pokedex Nº146 - tipo FIRE/FLYING.",
		"type": "FIRE",
		"type2": "FLYING",
		"catchRate": 3,
		"baseExp": 217,
		"growthCurve": "SLOW",
		"base": {
			"hp": 90,
			"atkFis": 100,
			"atkEsp": 125,
			"def": 90,
			"defEsp": 85,
			"speed": 90
		},
		"abilities": [
			{
				"key": "wing_attack",
				"levelReq": 1
			},
			{
				"key": "ember",
				"levelReq": 1
			},
			{
				"key": "fire_spin",
				"levelReq": 13
			},
			{
				"key": "agility",
				"levelReq": 25
			},
			{
				"key": "endure",
				"levelReq": 37
			},
			{
				"key": "flamethrower",
				"levelReq": 49
			},
			{
				"key": "safeguard",
				"levelReq": 61
			},
			{
				"key": "sky_attack",
				"levelReq": 73
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"raikou": {
		"id": "raikou",
		"name": "Raikou",
		"description": "Pokedex Nº243 - tipo ELECTRIC.",
		"type": "ELECTRIC",
		"type2": null,
		"catchRate": 3,
		"baseExp": 216,
		"growthCurve": "SLOW",
		"base": {
			"hp": 90,
			"atkFis": 85,
			"atkEsp": 115,
			"def": 75,
			"defEsp": 100,
			"speed": 115
		},
		"abilities": [
			{
				"key": "bite",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "thundershock",
				"levelReq": 11
			},
			{
				"key": "roar",
				"levelReq": 21
			},
			{
				"key": "quick_attack",
				"levelReq": 31
			},
			{
				"key": "spark",
				"levelReq": 41
			},
			{
				"key": "reflect",
				"levelReq": 51
			},
			{
				"key": "crunch",
				"levelReq": 61
			},
			{
				"key": "thunder",
				"levelReq": 71
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"entei": {
		"id": "entei",
		"name": "Entei",
		"description": "Pokedex Nº244 - tipo FIRE.",
		"type": "FIRE",
		"type2": null,
		"catchRate": 3,
		"baseExp": 217,
		"growthCurve": "SLOW",
		"base": {
			"hp": 115,
			"atkFis": 115,
			"atkEsp": 90,
			"def": 85,
			"defEsp": 75,
			"speed": 100
		},
		"abilities": [
			{
				"key": "bite",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "ember",
				"levelReq": 11
			},
			{
				"key": "roar",
				"levelReq": 21
			},
			{
				"key": "fire_spin",
				"levelReq": 31
			},
			{
				"key": "stomp",
				"levelReq": 41
			},
			{
				"key": "flamethrower",
				"levelReq": 51
			},
			{
				"key": "swagger",
				"levelReq": 61
			},
			{
				"key": "fire_blast",
				"levelReq": 71
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"suicune": {
		"id": "suicune",
		"name": "Suicune",
		"description": "Pokedex Nº245 - tipo WATER.",
		"type": "WATER",
		"type2": null,
		"catchRate": 3,
		"baseExp": 215,
		"growthCurve": "SLOW",
		"base": {
			"hp": 100,
			"atkFis": 75,
			"atkEsp": 90,
			"def": 115,
			"defEsp": 115,
			"speed": 85
		},
		"abilities": [
			{
				"key": "bite",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "bubblebeam",
				"levelReq": 11
			},
			{
				"key": "rain_dance",
				"levelReq": 21
			},
			{
				"key": "gust",
				"levelReq": 31
			},
			{
				"key": "aurora_beam",
				"levelReq": 41
			},
			{
				"key": "mist",
				"levelReq": 51
			},
			{
				"key": "mirror_coat",
				"levelReq": 61
			},
			{
				"key": "hydro_pump",
				"levelReq": 71
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"lugia": {
		"id": "lugia",
		"name": "Lugia",
		"description": "Pokedex Nº249 - tipo PSYCHIC/FLYING.",
		"type": "PSYCHIC",
		"type2": "FLYING",
		"catchRate": 3,
		"baseExp": 220,
		"growthCurve": "SLOW",
		"base": {
			"hp": 106,
			"atkFis": 90,
			"atkEsp": 90,
			"def": 130,
			"defEsp": 154,
			"speed": 110
		},
		"abilities": [
			{
				"key": "aeroblast",
				"levelReq": 1
			},
			{
				"key": "safeguard",
				"levelReq": 11
			},
			{
				"key": "gust",
				"levelReq": 22
			},
			{
				"key": "recover",
				"levelReq": 33
			},
			{
				"key": "hydro_pump",
				"levelReq": 44
			},
			{
				"key": "rain_dance",
				"levelReq": 55
			},
			{
				"key": "swift",
				"levelReq": 66
			},
			{
				"key": "whirlwind",
				"levelReq": 77
			},
			{
				"key": "ancientpower",
				"levelReq": 88
			},
			{
				"key": "future_sight",
				"levelReq": 99
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"ho_oh": {
		"id": "ho_oh",
		"name": "Ho-Oh",
		"description": "Pokedex Nº250 - tipo FIRE/FLYING.",
		"type": "FIRE",
		"type2": "FLYING",
		"catchRate": 3,
		"baseExp": 220,
		"growthCurve": "SLOW",
		"base": {
			"hp": 106,
			"atkFis": 130,
			"atkEsp": 110,
			"def": 90,
			"defEsp": 154,
			"speed": 90
		},
		"abilities": [
			{
				"key": "sacred_fire",
				"levelReq": 1
			},
			{
				"key": "safeguard",
				"levelReq": 11
			},
			{
				"key": "gust",
				"levelReq": 22
			},
			{
				"key": "recover",
				"levelReq": 33
			},
			{
				"key": "fire_blast",
				"levelReq": 44
			},
			{
				"key": "sunny_day",
				"levelReq": 55
			},
			{
				"key": "swift",
				"levelReq": 66
			},
			{
				"key": "whirlwind",
				"levelReq": 77
			},
			{
				"key": "ancientpower",
				"levelReq": 88
			},
			{
				"key": "future_sight",
				"levelReq": 99
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"celebi": {
		"id": "celebi",
		"name": "Celebi",
		"description": "Pokedex Nº251 - tipo PSYCHIC/GRASS.",
		"type": "PSYCHIC",
		"type2": "GRASS",
		"catchRate": 45,
		"baseExp": 64,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 100,
			"atkFis": 100,
			"atkEsp": 100,
			"def": 100,
			"defEsp": 100,
			"speed": 100
		},
		"abilities": [
			{
				"key": "leech_seed",
				"levelReq": 1
			},
			{
				"key": "confusion",
				"levelReq": 1
			},
			{
				"key": "recover",
				"levelReq": 1
			},
			{
				"key": "heal_bell",
				"levelReq": 1
			},
			{
				"key": "safeguard",
				"levelReq": 10
			},
			{
				"key": "ancientpower",
				"levelReq": 20
			},
			{
				"key": "future_sight",
				"levelReq": 30
			},
			{
				"key": "baton_pass",
				"levelReq": 40
			},
			{
				"key": "perish_song",
				"levelReq": 50
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"mewtwo": {
		"id": "mewtwo",
		"name": "Mewtwo",
		"description": "Pokedex Nº150 - tipo PSYCHIC.",
		"type": "PSYCHIC",
		"type2": null,
		"catchRate": 3,
		"baseExp": 220,
		"growthCurve": "SLOW",
		"base": {
			"hp": 106,
			"atkFis": 110,
			"atkEsp": 154,
			"def": 90,
			"defEsp": 90,
			"speed": 130
		},
		"abilities": [
			{
				"key": "confusion",
				"levelReq": 1
			},
			{
				"key": "disable",
				"levelReq": 1
			},
			{
				"key": "barrier",
				"levelReq": 11
			},
			{
				"key": "swift",
				"levelReq": 22
			},
			{
				"key": "psych_up",
				"levelReq": 33
			},
			{
				"key": "future_sight",
				"levelReq": 44
			},
			{
				"key": "mist",
				"levelReq": 55
			},
			{
				"key": "psychic_m",
				"levelReq": 66
			},
			{
				"key": "amnesia",
				"levelReq": 77
			},
			{
				"key": "recover",
				"levelReq": 88
			},
			{
				"key": "safeguard",
				"levelReq": 99
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"mew": {
		"id": "mew",
		"name": "Mew",
		"description": "Pokedex Nº151 - tipo PSYCHIC.",
		"type": "PSYCHIC",
		"type2": null,
		"catchRate": 45,
		"baseExp": 64,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 100,
			"atkFis": 100,
			"atkEsp": 100,
			"def": 100,
			"defEsp": 100,
			"speed": 100
		},
		"abilities": [
			{
				"key": "pound",
				"levelReq": 1
			},
			{
				"key": "transform",
				"levelReq": 10
			},
			{
				"key": "mega_punch",
				"levelReq": 20
			},
			{
				"key": "metronome",
				"levelReq": 30
			},
			{
				"key": "psychic_m",
				"levelReq": 40
			},
			{
				"key": "ancientpower",
				"levelReq": 50
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"geodude": {
		"id": "geodude",
		"name": "Geodude",
		"description": "Pokedex Nº74 - tipo ROCK/GROUND.",
		"type": "ROCK",
		"type2": "GROUND",
		"catchRate": 255,
		"baseExp": 86,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 40,
			"atkFis": 80,
			"atkEsp": 30,
			"def": 100,
			"defEsp": 30,
			"speed": 20
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "defense_curl",
				"levelReq": 6
			},
			{
				"key": "rock_throw",
				"levelReq": 11
			},
			{
				"key": "magnitude",
				"levelReq": 16
			},
			{
				"key": "selfdestruct",
				"levelReq": 21
			},
			{
				"key": "harden",
				"levelReq": 26
			},
			{
				"key": "rollout",
				"levelReq": 31
			},
			{
				"key": "earthquake",
				"levelReq": 36
			},
			{
				"key": "explosion",
				"levelReq": 41
			}
		],
		"evolvesTo": "graveler",
		"evolvesAtLevel": 25
	},
	"spearow": {
		"id": "spearow",
		"name": "Spearow",
		"description": "Pokedex Nº21 - tipo NORMAL/FLYING.",
		"type": "NORMAL",
		"type2": "FLYING",
		"catchRate": 255,
		"baseExp": 58,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 40,
			"atkFis": 60,
			"atkEsp": 31,
			"def": 30,
			"defEsp": 31,
			"speed": 70
		},
		"abilities": [
			{
				"key": "peck",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 7
			},
			{
				"key": "fury_attack",
				"levelReq": 13
			},
			{
				"key": "pursuit",
				"levelReq": 25
			},
			{
				"key": "mirror_move",
				"levelReq": 31
			},
			{
				"key": "drill_peck",
				"levelReq": 37
			},
			{
				"key": "agility",
				"levelReq": 43
			}
		],
		"evolvesTo": "fearow",
		"evolvesAtLevel": 20
	},
	"rattata": {
		"id": "rattata",
		"name": "Rattata",
		"description": "Pokedex Nº19 - tipo NORMAL.",
		"type": "NORMAL",
		"type2": null,
		"catchRate": 255,
		"baseExp": 57,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 30,
			"atkFis": 56,
			"atkEsp": 25,
			"def": 35,
			"defEsp": 35,
			"speed": 72
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "tail_whip",
				"levelReq": 1
			},
			{
				"key": "quick_attack",
				"levelReq": 7
			},
			{
				"key": "hyper_fang",
				"levelReq": 13
			},
			{
				"key": "focus_energy",
				"levelReq": 20
			},
			{
				"key": "pursuit",
				"levelReq": 27
			},
			{
				"key": "super_fang",
				"levelReq": 34
			}
		],
		"evolvesTo": "raticate",
		"evolvesAtLevel": 20
	},
	"ivysaur": {
		"id": "ivysaur",
		"name": "Ivysaur",
		"description": "Pokedex Nº2 - tipo GRASS/POISON.",
		"type": "GRASS",
		"type2": "POISON",
		"catchRate": 45,
		"baseExp": 141,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 60,
			"atkFis": 62,
			"atkEsp": 80,
			"def": 63,
			"defEsp": 80,
			"speed": 60
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "leech_seed",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 4
			},
			{
				"key": "leech_seed",
				"levelReq": 7
			},
			{
				"key": "vine_whip",
				"levelReq": 10
			},
			{
				"key": "poisonpowder",
				"levelReq": 15
			},
			{
				"key": "sleep_powder",
				"levelReq": 15
			},
			{
				"key": "razor_leaf",
				"levelReq": 22
			},
			{
				"key": "sweet_scent",
				"levelReq": 29
			},
			{
				"key": "growth",
				"levelReq": 38
			},
			{
				"key": "synthesis",
				"levelReq": 47
			},
			{
				"key": "solarbeam",
				"levelReq": 56
			}
		],
		"evolvesTo": "venusaur",
		"evolvesAtLevel": 32
	},
	"venusaur": {
		"id": "venusaur",
		"name": "Venusaur",
		"description": "Pokedex Nº3 - tipo GRASS/POISON.",
		"type": "GRASS",
		"type2": "POISON",
		"catchRate": 45,
		"baseExp": 208,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 80,
			"atkFis": 82,
			"atkEsp": 100,
			"def": 83,
			"defEsp": 100,
			"speed": 80
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "leech_seed",
				"levelReq": 1
			},
			{
				"key": "vine_whip",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 4
			},
			{
				"key": "leech_seed",
				"levelReq": 7
			},
			{
				"key": "vine_whip",
				"levelReq": 10
			},
			{
				"key": "poisonpowder",
				"levelReq": 15
			},
			{
				"key": "sleep_powder",
				"levelReq": 15
			},
			{
				"key": "razor_leaf",
				"levelReq": 22
			},
			{
				"key": "sweet_scent",
				"levelReq": 29
			},
			{
				"key": "growth",
				"levelReq": 41
			},
			{
				"key": "synthesis",
				"levelReq": 53
			},
			{
				"key": "solarbeam",
				"levelReq": 65
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"oddish": {
		"id": "oddish",
		"name": "Oddish",
		"description": "Pokedex Nº43 - tipo GRASS/POISON.",
		"type": "GRASS",
		"type2": "POISON",
		"catchRate": 255,
		"baseExp": 78,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 45,
			"atkFis": 50,
			"atkEsp": 75,
			"def": 55,
			"defEsp": 65,
			"speed": 30
		},
		"abilities": [
			{
				"key": "absorb",
				"levelReq": 1
			},
			{
				"key": "sweet_scent",
				"levelReq": 7
			},
			{
				"key": "poisonpowder",
				"levelReq": 14
			},
			{
				"key": "stun_spore",
				"levelReq": 16
			},
			{
				"key": "sleep_powder",
				"levelReq": 18
			},
			{
				"key": "acid",
				"levelReq": 23
			},
			{
				"key": "moonlight",
				"levelReq": 32
			},
			{
				"key": "petal_dance",
				"levelReq": 39
			}
		],
		"evolvesTo": "gloom",
		"evolvesAtLevel": 21
	},
	"gloom": {
		"id": "gloom",
		"name": "Gloom",
		"description": "Pokedex Nº44 - tipo GRASS/POISON.",
		"type": "GRASS",
		"type2": "POISON",
		"catchRate": 120,
		"baseExp": 132,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 60,
			"atkFis": 65,
			"atkEsp": 85,
			"def": 70,
			"defEsp": 75,
			"speed": 40
		},
		"abilities": [
			{
				"key": "absorb",
				"levelReq": 1
			},
			{
				"key": "sweet_scent",
				"levelReq": 1
			},
			{
				"key": "poisonpowder",
				"levelReq": 1
			},
			{
				"key": "sweet_scent",
				"levelReq": 7
			},
			{
				"key": "poisonpowder",
				"levelReq": 14
			},
			{
				"key": "stun_spore",
				"levelReq": 16
			},
			{
				"key": "sleep_powder",
				"levelReq": 18
			},
			{
				"key": "acid",
				"levelReq": 24
			},
			{
				"key": "moonlight",
				"levelReq": 35
			},
			{
				"key": "petal_dance",
				"levelReq": 44
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"bellsprout": {
		"id": "bellsprout",
		"name": "Bellsprout",
		"description": "Pokedex Nº69 - tipo GRASS/POISON.",
		"type": "GRASS",
		"type2": "POISON",
		"catchRate": 255,
		"baseExp": 84,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 50,
			"atkFis": 75,
			"atkEsp": 70,
			"def": 35,
			"defEsp": 30,
			"speed": 40
		},
		"abilities": [
			{
				"key": "vine_whip",
				"levelReq": 1
			},
			{
				"key": "growth",
				"levelReq": 6
			},
			{
				"key": "wrap",
				"levelReq": 11
			},
			{
				"key": "sleep_powder",
				"levelReq": 15
			},
			{
				"key": "poisonpowder",
				"levelReq": 17
			},
			{
				"key": "stun_spore",
				"levelReq": 19
			},
			{
				"key": "acid",
				"levelReq": 23
			},
			{
				"key": "sweet_scent",
				"levelReq": 30
			},
			{
				"key": "razor_leaf",
				"levelReq": 37
			},
			{
				"key": "slam",
				"levelReq": 45
			}
		],
		"evolvesTo": "weepinbell",
		"evolvesAtLevel": 21
	},
	"weepinbell": {
		"id": "weepinbell",
		"name": "Weepinbell",
		"description": "Pokedex Nº70 - tipo GRASS/POISON.",
		"type": "GRASS",
		"type2": "POISON",
		"catchRate": 120,
		"baseExp": 151,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 65,
			"atkFis": 90,
			"atkEsp": 85,
			"def": 50,
			"defEsp": 45,
			"speed": 55
		},
		"abilities": [
			{
				"key": "vine_whip",
				"levelReq": 1
			},
			{
				"key": "growth",
				"levelReq": 1
			},
			{
				"key": "wrap",
				"levelReq": 1
			},
			{
				"key": "growth",
				"levelReq": 6
			},
			{
				"key": "wrap",
				"levelReq": 11
			},
			{
				"key": "sleep_powder",
				"levelReq": 15
			},
			{
				"key": "poisonpowder",
				"levelReq": 17
			},
			{
				"key": "stun_spore",
				"levelReq": 19
			},
			{
				"key": "acid",
				"levelReq": 24
			},
			{
				"key": "sweet_scent",
				"levelReq": 33
			},
			{
				"key": "razor_leaf",
				"levelReq": 42
			},
			{
				"key": "slam",
				"levelReq": 54
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"victreebel": {
		"id": "victreebel",
		"name": "Victreebel",
		"description": "Pokedex Nº71 - tipo GRASS/POISON.",
		"type": "GRASS",
		"type2": "POISON",
		"catchRate": 45,
		"baseExp": 191,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 80,
			"atkFis": 105,
			"atkEsp": 100,
			"def": 65,
			"defEsp": 60,
			"speed": 70
		},
		"abilities": [
			{
				"key": "vine_whip",
				"levelReq": 1
			},
			{
				"key": "sleep_powder",
				"levelReq": 1
			},
			{
				"key": "sweet_scent",
				"levelReq": 1
			},
			{
				"key": "razor_leaf",
				"levelReq": 1
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"exeggcute": {
		"id": "exeggcute",
		"name": "Exeggcute",
		"description": "Pokedex Nº102 - tipo GRASS/PSYCHIC.",
		"type": "GRASS",
		"type2": "PSYCHIC",
		"catchRate": 90,
		"baseExp": 98,
		"growthCurve": "SLOW",
		"base": {
			"hp": 60,
			"atkFis": 40,
			"atkEsp": 60,
			"def": 80,
			"defEsp": 45,
			"speed": 40
		},
		"abilities": [
			{
				"key": "barrage",
				"levelReq": 1
			},
			{
				"key": "hypnosis",
				"levelReq": 1
			},
			{
				"key": "reflect",
				"levelReq": 7
			},
			{
				"key": "leech_seed",
				"levelReq": 13
			},
			{
				"key": "confusion",
				"levelReq": 19
			},
			{
				"key": "stun_spore",
				"levelReq": 25
			},
			{
				"key": "poisonpowder",
				"levelReq": 31
			},
			{
				"key": "sleep_powder",
				"levelReq": 37
			},
			{
				"key": "solarbeam",
				"levelReq": 43
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"tangela": {
		"id": "tangela",
		"name": "Tangela",
		"description": "Pokedex Nº114 - tipo GRASS.",
		"type": "GRASS",
		"type2": null,
		"catchRate": 45,
		"baseExp": 166,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 65,
			"atkFis": 55,
			"atkEsp": 100,
			"def": 115,
			"defEsp": 40,
			"speed": 60
		},
		"abilities": [
			{
				"key": "constrict",
				"levelReq": 1
			},
			{
				"key": "sleep_powder",
				"levelReq": 4
			},
			{
				"key": "absorb",
				"levelReq": 10
			},
			{
				"key": "poisonpowder",
				"levelReq": 13
			},
			{
				"key": "vine_whip",
				"levelReq": 19
			},
			{
				"key": "bind",
				"levelReq": 25
			},
			{
				"key": "mega_drain",
				"levelReq": 31
			},
			{
				"key": "stun_spore",
				"levelReq": 34
			},
			{
				"key": "slam",
				"levelReq": 40
			},
			{
				"key": "growth",
				"levelReq": 46
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"chikorita": {
		"id": "chikorita",
		"name": "Chikorita",
		"description": "Pokedex Nº152 - tipo GRASS.",
		"type": "GRASS",
		"type2": null,
		"catchRate": 45,
		"baseExp": 64,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 45,
			"atkFis": 49,
			"atkEsp": 49,
			"def": 65,
			"defEsp": 65,
			"speed": 45
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "razor_leaf",
				"levelReq": 8
			},
			{
				"key": "reflect",
				"levelReq": 12
			},
			{
				"key": "poisonpowder",
				"levelReq": 15
			},
			{
				"key": "synthesis",
				"levelReq": 22
			},
			{
				"key": "body_slam",
				"levelReq": 29
			},
			{
				"key": "light_screen",
				"levelReq": 36
			},
			{
				"key": "safeguard",
				"levelReq": 43
			},
			{
				"key": "solarbeam",
				"levelReq": 50
			}
		],
		"evolvesTo": "bayleef",
		"evolvesAtLevel": 16
	},
	"bayleef": {
		"id": "bayleef",
		"name": "Bayleef",
		"description": "Pokedex Nº153 - tipo GRASS.",
		"type": "GRASS",
		"type2": null,
		"catchRate": 45,
		"baseExp": 141,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 60,
			"atkFis": 62,
			"atkEsp": 63,
			"def": 80,
			"defEsp": 80,
			"speed": 60
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "razor_leaf",
				"levelReq": 1
			},
			{
				"key": "reflect",
				"levelReq": 1
			},
			{
				"key": "razor_leaf",
				"levelReq": 8
			},
			{
				"key": "reflect",
				"levelReq": 12
			},
			{
				"key": "poisonpowder",
				"levelReq": 15
			},
			{
				"key": "synthesis",
				"levelReq": 23
			},
			{
				"key": "body_slam",
				"levelReq": 31
			},
			{
				"key": "light_screen",
				"levelReq": 39
			},
			{
				"key": "safeguard",
				"levelReq": 47
			},
			{
				"key": "solarbeam",
				"levelReq": 55
			}
		],
		"evolvesTo": "meganium",
		"evolvesAtLevel": 32
	},
	"meganium": {
		"id": "meganium",
		"name": "Meganium",
		"description": "Pokedex Nº154 - tipo GRASS.",
		"type": "GRASS",
		"type2": null,
		"catchRate": 45,
		"baseExp": 208,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 80,
			"atkFis": 82,
			"atkEsp": 83,
			"def": 100,
			"defEsp": 100,
			"speed": 80
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "razor_leaf",
				"levelReq": 1
			},
			{
				"key": "reflect",
				"levelReq": 1
			},
			{
				"key": "razor_leaf",
				"levelReq": 8
			},
			{
				"key": "reflect",
				"levelReq": 12
			},
			{
				"key": "poisonpowder",
				"levelReq": 15
			},
			{
				"key": "synthesis",
				"levelReq": 23
			},
			{
				"key": "body_slam",
				"levelReq": 31
			},
			{
				"key": "light_screen",
				"levelReq": 41
			},
			{
				"key": "safeguard",
				"levelReq": 51
			},
			{
				"key": "solarbeam",
				"levelReq": 61
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"hoppip": {
		"id": "hoppip",
		"name": "Hoppip",
		"description": "Pokedex Nº187 - tipo GRASS/FLYING.",
		"type": "GRASS",
		"type2": "FLYING",
		"catchRate": 255,
		"baseExp": 74,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 35,
			"atkFis": 35,
			"atkEsp": 35,
			"def": 40,
			"defEsp": 55,
			"speed": 50
		},
		"abilities": [
			{
				"key": "splash",
				"levelReq": 1
			},
			{
				"key": "synthesis",
				"levelReq": 5
			},
			{
				"key": "tail_whip",
				"levelReq": 5
			},
			{
				"key": "tackle",
				"levelReq": 10
			},
			{
				"key": "poisonpowder",
				"levelReq": 13
			},
			{
				"key": "stun_spore",
				"levelReq": 15
			},
			{
				"key": "sleep_powder",
				"levelReq": 17
			},
			{
				"key": "leech_seed",
				"levelReq": 20
			},
			{
				"key": "cotton_spore",
				"levelReq": 25
			},
			{
				"key": "mega_drain",
				"levelReq": 30
			}
		],
		"evolvesTo": "skiploom",
		"evolvesAtLevel": 18
	},
	"skiploom": {
		"id": "skiploom",
		"name": "Skiploom",
		"description": "Pokedex Nº188 - tipo GRASS/FLYING.",
		"type": "GRASS",
		"type2": "FLYING",
		"catchRate": 120,
		"baseExp": 136,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 55,
			"atkFis": 45,
			"atkEsp": 45,
			"def": 50,
			"defEsp": 65,
			"speed": 80
		},
		"abilities": [
			{
				"key": "splash",
				"levelReq": 1
			},
			{
				"key": "synthesis",
				"levelReq": 1
			},
			{
				"key": "tail_whip",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "synthesis",
				"levelReq": 5
			},
			{
				"key": "tail_whip",
				"levelReq": 5
			},
			{
				"key": "tackle",
				"levelReq": 10
			},
			{
				"key": "poisonpowder",
				"levelReq": 13
			},
			{
				"key": "stun_spore",
				"levelReq": 15
			},
			{
				"key": "sleep_powder",
				"levelReq": 17
			},
			{
				"key": "leech_seed",
				"levelReq": 22
			},
			{
				"key": "cotton_spore",
				"levelReq": 29
			},
			{
				"key": "mega_drain",
				"levelReq": 36
			}
		],
		"evolvesTo": "jumpluff",
		"evolvesAtLevel": 27
	},
	"jumpluff": {
		"id": "jumpluff",
		"name": "Jumpluff",
		"description": "Pokedex Nº189 - tipo GRASS/FLYING.",
		"type": "GRASS",
		"type2": "FLYING",
		"catchRate": 45,
		"baseExp": 176,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 75,
			"atkFis": 55,
			"atkEsp": 55,
			"def": 70,
			"defEsp": 85,
			"speed": 110
		},
		"abilities": [
			{
				"key": "splash",
				"levelReq": 1
			},
			{
				"key": "synthesis",
				"levelReq": 1
			},
			{
				"key": "tail_whip",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "synthesis",
				"levelReq": 5
			},
			{
				"key": "tail_whip",
				"levelReq": 5
			},
			{
				"key": "tackle",
				"levelReq": 10
			},
			{
				"key": "poisonpowder",
				"levelReq": 13
			},
			{
				"key": "stun_spore",
				"levelReq": 15
			},
			{
				"key": "sleep_powder",
				"levelReq": 17
			},
			{
				"key": "leech_seed",
				"levelReq": 22
			},
			{
				"key": "cotton_spore",
				"levelReq": 33
			},
			{
				"key": "mega_drain",
				"levelReq": 44
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"sunkern": {
		"id": "sunkern",
		"name": "Sunkern",
		"description": "Pokedex Nº191 - tipo GRASS.",
		"type": "GRASS",
		"type2": null,
		"catchRate": 235,
		"baseExp": 52,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 30,
			"atkFis": 30,
			"atkEsp": 30,
			"def": 30,
			"defEsp": 30,
			"speed": 30
		},
		"abilities": [
			{
				"key": "absorb",
				"levelReq": 1
			},
			{
				"key": "growth",
				"levelReq": 4
			},
			{
				"key": "mega_drain",
				"levelReq": 10
			},
			{
				"key": "sunny_day",
				"levelReq": 19
			},
			{
				"key": "synthesis",
				"levelReq": 31
			},
			{
				"key": "giga_drain",
				"levelReq": 46
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"sunflora": {
		"id": "sunflora",
		"name": "Sunflora",
		"description": "Pokedex Nº192 - tipo GRASS.",
		"type": "GRASS",
		"type2": null,
		"catchRate": 120,
		"baseExp": 146,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 75,
			"atkFis": 75,
			"atkEsp": 105,
			"def": 55,
			"defEsp": 85,
			"speed": 30
		},
		"abilities": [
			{
				"key": "absorb",
				"levelReq": 1
			},
			{
				"key": "pound",
				"levelReq": 1
			},
			{
				"key": "growth",
				"levelReq": 4
			},
			{
				"key": "razor_leaf",
				"levelReq": 10
			},
			{
				"key": "sunny_day",
				"levelReq": 19
			},
			{
				"key": "petal_dance",
				"levelReq": 31
			},
			{
				"key": "solarbeam",
				"levelReq": 46
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"caterpie": {
		"id": "caterpie",
		"name": "Caterpie",
		"description": "Pokedex Nº10 - tipo BUG.",
		"type": "BUG",
		"type2": null,
		"catchRate": 255,
		"baseExp": 53,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 45,
			"atkFis": 30,
			"atkEsp": 20,
			"def": 35,
			"defEsp": 20,
			"speed": 45
		},
		"abilities": [{
			"key": "tackle",
			"levelReq": 1
		}, {
			"key": "string_shot",
			"levelReq": 1
		}],
		"evolvesTo": "metapod",
		"evolvesAtLevel": 7
	},
	"metapod": {
		"id": "metapod",
		"name": "Metapod",
		"description": "Pokedex Nº11 - tipo BUG.",
		"type": "BUG",
		"type2": null,
		"catchRate": 120,
		"baseExp": 72,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 50,
			"atkFis": 20,
			"atkEsp": 25,
			"def": 55,
			"defEsp": 25,
			"speed": 30
		},
		"abilities": [{
			"key": "harden",
			"levelReq": 1
		}, {
			"key": "harden",
			"levelReq": 7
		}],
		"evolvesTo": "butterfree",
		"evolvesAtLevel": 10
	},
	"butterfree": {
		"id": "butterfree",
		"name": "Butterfree",
		"description": "Pokedex Nº12 - tipo BUG/FLYING.",
		"type": "BUG",
		"type2": "FLYING",
		"catchRate": 45,
		"baseExp": 160,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 60,
			"atkFis": 45,
			"atkEsp": 80,
			"def": 50,
			"defEsp": 80,
			"speed": 70
		},
		"abilities": [
			{
				"key": "confusion",
				"levelReq": 1
			},
			{
				"key": "confusion",
				"levelReq": 10
			},
			{
				"key": "poisonpowder",
				"levelReq": 13
			},
			{
				"key": "stun_spore",
				"levelReq": 14
			},
			{
				"key": "sleep_powder",
				"levelReq": 15
			},
			{
				"key": "supersonic",
				"levelReq": 18
			},
			{
				"key": "whirlwind",
				"levelReq": 23
			},
			{
				"key": "gust",
				"levelReq": 28
			},
			{
				"key": "psybeam",
				"levelReq": 34
			},
			{
				"key": "safeguard",
				"levelReq": 40
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"weedle": {
		"id": "weedle",
		"name": "Weedle",
		"description": "Pokedex Nº13 - tipo BUG/POISON.",
		"type": "BUG",
		"type2": "POISON",
		"catchRate": 255,
		"baseExp": 52,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 40,
			"atkFis": 35,
			"atkEsp": 20,
			"def": 30,
			"defEsp": 20,
			"speed": 50
		},
		"abilities": [{
			"key": "poison_sting",
			"levelReq": 1
		}, {
			"key": "string_shot",
			"levelReq": 1
		}],
		"evolvesTo": "kakuna",
		"evolvesAtLevel": 7
	},
	"kakuna": {
		"id": "kakuna",
		"name": "Kakuna",
		"description": "Pokedex Nº14 - tipo BUG/POISON.",
		"type": "BUG",
		"type2": "POISON",
		"catchRate": 120,
		"baseExp": 71,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 45,
			"atkFis": 25,
			"atkEsp": 25,
			"def": 50,
			"defEsp": 25,
			"speed": 35
		},
		"abilities": [{
			"key": "harden",
			"levelReq": 1
		}, {
			"key": "harden",
			"levelReq": 7
		}],
		"evolvesTo": "beedrill",
		"evolvesAtLevel": 10
	},
	"beedrill": {
		"id": "beedrill",
		"name": "Beedrill",
		"description": "Pokedex Nº15 - tipo BUG/POISON.",
		"type": "BUG",
		"type2": "POISON",
		"catchRate": 45,
		"baseExp": 159,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 65,
			"atkFis": 80,
			"atkEsp": 45,
			"def": 40,
			"defEsp": 80,
			"speed": 75
		},
		"abilities": [
			{
				"key": "fury_attack",
				"levelReq": 1
			},
			{
				"key": "fury_attack",
				"levelReq": 10
			},
			{
				"key": "focus_energy",
				"levelReq": 15
			},
			{
				"key": "twineedle",
				"levelReq": 20
			},
			{
				"key": "rage",
				"levelReq": 25
			},
			{
				"key": "pursuit",
				"levelReq": 30
			},
			{
				"key": "pin_missile",
				"levelReq": 35
			},
			{
				"key": "agility",
				"levelReq": 40
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"paras": {
		"id": "paras",
		"name": "Paras",
		"description": "Pokedex Nº46 - tipo BUG/GRASS.",
		"type": "BUG",
		"type2": "GRASS",
		"catchRate": 190,
		"baseExp": 70,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 35,
			"atkFis": 70,
			"atkEsp": 45,
			"def": 55,
			"defEsp": 55,
			"speed": 25
		},
		"abilities": [
			{
				"key": "scratch",
				"levelReq": 1
			},
			{
				"key": "stun_spore",
				"levelReq": 7
			},
			{
				"key": "poisonpowder",
				"levelReq": 13
			},
			{
				"key": "leech_life",
				"levelReq": 19
			},
			{
				"key": "spore",
				"levelReq": 25
			},
			{
				"key": "slash",
				"levelReq": 31
			},
			{
				"key": "growth",
				"levelReq": 37
			},
			{
				"key": "giga_drain",
				"levelReq": 43
			}
		],
		"evolvesTo": "parasect",
		"evolvesAtLevel": 24
	},
	"parasect": {
		"id": "parasect",
		"name": "Parasect",
		"description": "Pokedex Nº47 - tipo BUG/GRASS.",
		"type": "BUG",
		"type2": "GRASS",
		"catchRate": 75,
		"baseExp": 128,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 60,
			"atkFis": 95,
			"atkEsp": 60,
			"def": 80,
			"defEsp": 80,
			"speed": 30
		},
		"abilities": [
			{
				"key": "scratch",
				"levelReq": 1
			},
			{
				"key": "stun_spore",
				"levelReq": 1
			},
			{
				"key": "poisonpowder",
				"levelReq": 1
			},
			{
				"key": "stun_spore",
				"levelReq": 7
			},
			{
				"key": "poisonpowder",
				"levelReq": 13
			},
			{
				"key": "leech_life",
				"levelReq": 19
			},
			{
				"key": "spore",
				"levelReq": 28
			},
			{
				"key": "slash",
				"levelReq": 37
			},
			{
				"key": "growth",
				"levelReq": 46
			},
			{
				"key": "giga_drain",
				"levelReq": 55
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"venonat": {
		"id": "venonat",
		"name": "Venonat",
		"description": "Pokedex Nº48 - tipo BUG/POISON.",
		"type": "BUG",
		"type2": "POISON",
		"catchRate": 190,
		"baseExp": 75,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 60,
			"atkFis": 55,
			"atkEsp": 40,
			"def": 50,
			"defEsp": 55,
			"speed": 45
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "disable",
				"levelReq": 1
			},
			{
				"key": "foresight",
				"levelReq": 1
			},
			{
				"key": "supersonic",
				"levelReq": 9
			},
			{
				"key": "confusion",
				"levelReq": 17
			},
			{
				"key": "poisonpowder",
				"levelReq": 20
			},
			{
				"key": "leech_life",
				"levelReq": 25
			},
			{
				"key": "stun_spore",
				"levelReq": 28
			},
			{
				"key": "psybeam",
				"levelReq": 33
			},
			{
				"key": "sleep_powder",
				"levelReq": 36
			},
			{
				"key": "psychic_m",
				"levelReq": 41
			}
		],
		"evolvesTo": "venomoth",
		"evolvesAtLevel": 31
	},
	"venomoth": {
		"id": "venomoth",
		"name": "Venomoth",
		"description": "Pokedex Nº49 - tipo BUG/POISON.",
		"type": "BUG",
		"type2": "POISON",
		"catchRate": 75,
		"baseExp": 138,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 70,
			"atkFis": 65,
			"atkEsp": 90,
			"def": 60,
			"defEsp": 75,
			"speed": 90
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "disable",
				"levelReq": 1
			},
			{
				"key": "foresight",
				"levelReq": 1
			},
			{
				"key": "supersonic",
				"levelReq": 1
			},
			{
				"key": "supersonic",
				"levelReq": 9
			},
			{
				"key": "confusion",
				"levelReq": 17
			},
			{
				"key": "poisonpowder",
				"levelReq": 20
			},
			{
				"key": "leech_life",
				"levelReq": 25
			},
			{
				"key": "stun_spore",
				"levelReq": 28
			},
			{
				"key": "gust",
				"levelReq": 31
			},
			{
				"key": "psybeam",
				"levelReq": 36
			},
			{
				"key": "sleep_powder",
				"levelReq": 42
			},
			{
				"key": "psychic_m",
				"levelReq": 52
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"scyther": {
		"id": "scyther",
		"name": "Scyther",
		"description": "Pokedex Nº123 - tipo BUG/FLYING.",
		"type": "BUG",
		"type2": "FLYING",
		"catchRate": 45,
		"baseExp": 187,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 70,
			"atkFis": 110,
			"atkEsp": 55,
			"def": 80,
			"defEsp": 80,
			"speed": 105
		},
		"abilities": [
			{
				"key": "quick_attack",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "focus_energy",
				"levelReq": 6
			},
			{
				"key": "pursuit",
				"levelReq": 12
			},
			{
				"key": "false_swipe",
				"levelReq": 18
			},
			{
				"key": "agility",
				"levelReq": 24
			},
			{
				"key": "wing_attack",
				"levelReq": 30
			},
			{
				"key": "slash",
				"levelReq": 36
			},
			{
				"key": "swords_dance",
				"levelReq": 42
			},
			{
				"key": "double_team",
				"levelReq": 48
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"pinsir": {
		"id": "pinsir",
		"name": "Pinsir",
		"description": "Pokedex Nº127 - tipo BUG.",
		"type": "BUG",
		"type2": null,
		"catchRate": 45,
		"baseExp": 200,
		"growthCurve": "SLOW",
		"base": {
			"hp": 65,
			"atkFis": 125,
			"atkEsp": 55,
			"def": 100,
			"defEsp": 70,
			"speed": 85
		},
		"abilities": [
			{
				"key": "vicegrip",
				"levelReq": 1
			},
			{
				"key": "focus_energy",
				"levelReq": 7
			},
			{
				"key": "bind",
				"levelReq": 13
			},
			{
				"key": "seismic_toss",
				"levelReq": 19
			},
			{
				"key": "harden",
				"levelReq": 25
			},
			{
				"key": "guillotine",
				"levelReq": 31
			},
			{
				"key": "submission",
				"levelReq": 37
			},
			{
				"key": "swords_dance",
				"levelReq": 43
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"ledyba": {
		"id": "ledyba",
		"name": "Ledyba",
		"description": "Pokedex Nº165 - tipo BUG/FLYING.",
		"type": "BUG",
		"type2": "FLYING",
		"catchRate": 255,
		"baseExp": 54,
		"growthCurve": "FAST",
		"base": {
			"hp": 40,
			"atkFis": 20,
			"atkEsp": 40,
			"def": 30,
			"defEsp": 80,
			"speed": 55
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "supersonic",
				"levelReq": 8
			},
			{
				"key": "comet_punch",
				"levelReq": 15
			},
			{
				"key": "light_screen",
				"levelReq": 22
			},
			{
				"key": "reflect",
				"levelReq": 22
			},
			{
				"key": "safeguard",
				"levelReq": 22
			},
			{
				"key": "baton_pass",
				"levelReq": 29
			},
			{
				"key": "swift",
				"levelReq": 36
			},
			{
				"key": "agility",
				"levelReq": 43
			},
			{
				"key": "double_edge",
				"levelReq": 50
			}
		],
		"evolvesTo": "ledian",
		"evolvesAtLevel": 18
	},
	"ledian": {
		"id": "ledian",
		"name": "Ledian",
		"description": "Pokedex Nº166 - tipo BUG/FLYING.",
		"type": "BUG",
		"type2": "FLYING",
		"catchRate": 90,
		"baseExp": 134,
		"growthCurve": "FAST",
		"base": {
			"hp": 55,
			"atkFis": 35,
			"atkEsp": 55,
			"def": 50,
			"defEsp": 110,
			"speed": 85
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "supersonic",
				"levelReq": 1
			},
			{
				"key": "supersonic",
				"levelReq": 8
			},
			{
				"key": "comet_punch",
				"levelReq": 15
			},
			{
				"key": "light_screen",
				"levelReq": 24
			},
			{
				"key": "reflect",
				"levelReq": 24
			},
			{
				"key": "safeguard",
				"levelReq": 24
			},
			{
				"key": "baton_pass",
				"levelReq": 33
			},
			{
				"key": "swift",
				"levelReq": 42
			},
			{
				"key": "agility",
				"levelReq": 51
			},
			{
				"key": "double_edge",
				"levelReq": 60
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"spinarak": {
		"id": "spinarak",
		"name": "Spinarak",
		"description": "Pokedex Nº167 - tipo BUG/POISON.",
		"type": "BUG",
		"type2": "POISON",
		"catchRate": 255,
		"baseExp": 54,
		"growthCurve": "FAST",
		"base": {
			"hp": 40,
			"atkFis": 60,
			"atkEsp": 40,
			"def": 40,
			"defEsp": 40,
			"speed": 30
		},
		"abilities": [
			{
				"key": "poison_sting",
				"levelReq": 1
			},
			{
				"key": "string_shot",
				"levelReq": 1
			},
			{
				"key": "scary_face",
				"levelReq": 6
			},
			{
				"key": "constrict",
				"levelReq": 11
			},
			{
				"key": "night_shade",
				"levelReq": 17
			},
			{
				"key": "leech_life",
				"levelReq": 23
			},
			{
				"key": "fury_swipes",
				"levelReq": 30
			},
			{
				"key": "spider_web",
				"levelReq": 37
			},
			{
				"key": "agility",
				"levelReq": 45
			},
			{
				"key": "psychic_m",
				"levelReq": 53
			}
		],
		"evolvesTo": "ariados",
		"evolvesAtLevel": 22
	},
	"ariados": {
		"id": "ariados",
		"name": "Ariados",
		"description": "Pokedex Nº168 - tipo BUG/POISON.",
		"type": "BUG",
		"type2": "POISON",
		"catchRate": 90,
		"baseExp": 134,
		"growthCurve": "FAST",
		"base": {
			"hp": 70,
			"atkFis": 90,
			"atkEsp": 60,
			"def": 70,
			"defEsp": 60,
			"speed": 40
		},
		"abilities": [
			{
				"key": "poison_sting",
				"levelReq": 1
			},
			{
				"key": "string_shot",
				"levelReq": 1
			},
			{
				"key": "scary_face",
				"levelReq": 1
			},
			{
				"key": "constrict",
				"levelReq": 1
			},
			{
				"key": "scary_face",
				"levelReq": 6
			},
			{
				"key": "constrict",
				"levelReq": 11
			},
			{
				"key": "night_shade",
				"levelReq": 17
			},
			{
				"key": "leech_life",
				"levelReq": 25
			},
			{
				"key": "fury_swipes",
				"levelReq": 34
			},
			{
				"key": "spider_web",
				"levelReq": 43
			},
			{
				"key": "agility",
				"levelReq": 53
			},
			{
				"key": "psychic_m",
				"levelReq": 63
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"yanma": {
		"id": "yanma",
		"name": "Yanma",
		"description": "Pokedex Nº193 - tipo BUG/FLYING.",
		"type": "BUG",
		"type2": "FLYING",
		"catchRate": 75,
		"baseExp": 147,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 65,
			"atkFis": 65,
			"atkEsp": 75,
			"def": 45,
			"defEsp": 45,
			"speed": 95
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "foresight",
				"levelReq": 1
			},
			{
				"key": "quick_attack",
				"levelReq": 7
			},
			{
				"key": "double_team",
				"levelReq": 13
			},
			{
				"key": "sonicboom",
				"levelReq": 19
			},
			{
				"key": "detect",
				"levelReq": 25
			},
			{
				"key": "supersonic",
				"levelReq": 31
			},
			{
				"key": "wing_attack",
				"levelReq": 37
			},
			{
				"key": "screech",
				"levelReq": 43
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"pineco": {
		"id": "pineco",
		"name": "Pineco",
		"description": "Pokedex Nº204 - tipo BUG.",
		"type": "BUG",
		"type2": null,
		"catchRate": 190,
		"baseExp": 60,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 50,
			"atkFis": 65,
			"atkEsp": 35,
			"def": 90,
			"defEsp": 35,
			"speed": 15
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "protect",
				"levelReq": 1
			},
			{
				"key": "selfdestruct",
				"levelReq": 8
			},
			{
				"key": "take_down",
				"levelReq": 15
			},
			{
				"key": "rapid_spin",
				"levelReq": 22
			},
			{
				"key": "bide",
				"levelReq": 29
			},
			{
				"key": "explosion",
				"levelReq": 36
			},
			{
				"key": "spikes",
				"levelReq": 43
			},
			{
				"key": "double_edge",
				"levelReq": 50
			}
		],
		"evolvesTo": "forretress",
		"evolvesAtLevel": 31
	},
	"forretress": {
		"id": "forretress",
		"name": "Forretress",
		"description": "Pokedex Nº205 - tipo BUG/STEEL.",
		"type": "BUG",
		"type2": "STEEL",
		"catchRate": 75,
		"baseExp": 118,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 75,
			"atkFis": 90,
			"atkEsp": 60,
			"def": 140,
			"defEsp": 60,
			"speed": 40
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "protect",
				"levelReq": 1
			},
			{
				"key": "selfdestruct",
				"levelReq": 1
			},
			{
				"key": "selfdestruct",
				"levelReq": 8
			},
			{
				"key": "take_down",
				"levelReq": 15
			},
			{
				"key": "rapid_spin",
				"levelReq": 22
			},
			{
				"key": "bide",
				"levelReq": 29
			},
			{
				"key": "explosion",
				"levelReq": 39
			},
			{
				"key": "spikes",
				"levelReq": 49
			},
			{
				"key": "double_edge",
				"levelReq": 59
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"scizor": {
		"id": "scizor",
		"name": "Scizor",
		"description": "Pokedex Nº212 - tipo BUG/STEEL.",
		"type": "BUG",
		"type2": "STEEL",
		"catchRate": 25,
		"baseExp": 200,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 70,
			"atkFis": 130,
			"atkEsp": 55,
			"def": 100,
			"defEsp": 80,
			"speed": 65
		},
		"abilities": [
			{
				"key": "quick_attack",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "focus_energy",
				"levelReq": 6
			},
			{
				"key": "pursuit",
				"levelReq": 12
			},
			{
				"key": "false_swipe",
				"levelReq": 18
			},
			{
				"key": "agility",
				"levelReq": 24
			},
			{
				"key": "metal_claw",
				"levelReq": 30
			},
			{
				"key": "slash",
				"levelReq": 36
			},
			{
				"key": "swords_dance",
				"levelReq": 42
			},
			{
				"key": "double_team",
				"levelReq": 48
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"heracross": {
		"id": "heracross",
		"name": "Heracross",
		"description": "Pokedex Nº214 - tipo BUG/FIGHTING.",
		"type": "BUG",
		"type2": "FIGHTING",
		"catchRate": 45,
		"baseExp": 200,
		"growthCurve": "SLOW",
		"base": {
			"hp": 80,
			"atkFis": 125,
			"atkEsp": 40,
			"def": 75,
			"defEsp": 95,
			"speed": 85
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "horn_attack",
				"levelReq": 6
			},
			{
				"key": "endure",
				"levelReq": 12
			},
			{
				"key": "fury_attack",
				"levelReq": 19
			},
			{
				"key": "counter",
				"levelReq": 27
			},
			{
				"key": "take_down",
				"levelReq": 35
			},
			{
				"key": "reversal",
				"levelReq": 44
			},
			{
				"key": "megahorn",
				"levelReq": 54
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"magikarp": {
		"id": "magikarp",
		"name": "Magikarp",
		"description": "Pokedex Nº129 - tipo WATER.",
		"type": "WATER",
		"type2": null,
		"catchRate": 255,
		"baseExp": 20,
		"growthCurve": "SLOW",
		"base": {
			"hp": 20,
			"atkFis": 10,
			"atkEsp": 15,
			"def": 55,
			"defEsp": 20,
			"speed": 80
		},
		"abilities": [
			{
				"key": "splash",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 15
			},
			{
				"key": "flail",
				"levelReq": 30
			}
		],
		"evolvesTo": "gyarados",
		"evolvesAtLevel": 20
	},
	"wooper": {
		"id": "wooper",
		"name": "Wooper",
		"description": "Pokedex Nº194 - tipo WATER/GROUND.",
		"type": "WATER",
		"type2": "GROUND",
		"catchRate": 255,
		"baseExp": 52,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 55,
			"atkFis": 45,
			"atkEsp": 25,
			"def": 45,
			"defEsp": 25,
			"speed": 15
		},
		"abilities": [
			{
				"key": "water_gun",
				"levelReq": 1
			},
			{
				"key": "tail_whip",
				"levelReq": 1
			},
			{
				"key": "slam",
				"levelReq": 11
			},
			{
				"key": "amnesia",
				"levelReq": 21
			},
			{
				"key": "earthquake",
				"levelReq": 31
			},
			{
				"key": "rain_dance",
				"levelReq": 41
			},
			{
				"key": "mist",
				"levelReq": 51
			},
			{
				"key": "haze",
				"levelReq": 51
			}
		],
		"evolvesTo": "quagsire",
		"evolvesAtLevel": 20
	},
	"marill": {
		"id": "marill",
		"name": "Marill",
		"description": "Pokedex Nº183 - tipo WATER.",
		"type": "WATER",
		"type2": null,
		"catchRate": 190,
		"baseExp": 58,
		"growthCurve": "FAST",
		"base": {
			"hp": 70,
			"atkFis": 20,
			"atkEsp": 20,
			"def": 50,
			"defEsp": 50,
			"speed": 40
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "defense_curl",
				"levelReq": 3
			},
			{
				"key": "tail_whip",
				"levelReq": 6
			},
			{
				"key": "water_gun",
				"levelReq": 10
			},
			{
				"key": "rollout",
				"levelReq": 15
			},
			{
				"key": "bubblebeam",
				"levelReq": 21
			},
			{
				"key": "double_edge",
				"levelReq": 28
			},
			{
				"key": "rain_dance",
				"levelReq": 36
			}
		],
		"evolvesTo": "azumarill",
		"evolvesAtLevel": 18
	},
	"totodile": {
		"id": "totodile",
		"name": "Totodile",
		"description": "Pokedex Nº158 - tipo WATER.",
		"type": "WATER",
		"type2": null,
		"catchRate": 45,
		"baseExp": 66,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 50,
			"atkFis": 65,
			"atkEsp": 44,
			"def": 64,
			"defEsp": 48,
			"speed": 43
		},
		"abilities": [
			{
				"key": "scratch",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "rage",
				"levelReq": 7
			},
			{
				"key": "water_gun",
				"levelReq": 13
			},
			{
				"key": "bite",
				"levelReq": 20
			},
			{
				"key": "scary_face",
				"levelReq": 27
			},
			{
				"key": "slash",
				"levelReq": 35
			},
			{
				"key": "screech",
				"levelReq": 43
			},
			{
				"key": "hydro_pump",
				"levelReq": 52
			}
		],
		"evolvesTo": "croconaw",
		"evolvesAtLevel": 18
	},
	"poliwag": {
		"id": "poliwag",
		"name": "Poliwag",
		"description": "Pokedex Nº60 - tipo WATER.",
		"type": "WATER",
		"type2": null,
		"catchRate": 255,
		"baseExp": 77,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 40,
			"atkFis": 50,
			"atkEsp": 40,
			"def": 40,
			"defEsp": 40,
			"speed": 90
		},
		"abilities": [
			{
				"key": "bubble",
				"levelReq": 1
			},
			{
				"key": "hypnosis",
				"levelReq": 7
			},
			{
				"key": "water_gun",
				"levelReq": 13
			},
			{
				"key": "doubleslap",
				"levelReq": 19
			},
			{
				"key": "rain_dance",
				"levelReq": 25
			},
			{
				"key": "body_slam",
				"levelReq": 31
			},
			{
				"key": "belly_drum",
				"levelReq": 37
			},
			{
				"key": "hydro_pump",
				"levelReq": 43
			}
		],
		"evolvesTo": "poliwhirl",
		"evolvesAtLevel": 25
	},
	"remoraid": {
		"id": "remoraid",
		"name": "Remoraid",
		"description": "Pokedex Nº223 - tipo WATER.",
		"type": "WATER",
		"type2": null,
		"catchRate": 190,
		"baseExp": 78,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 35,
			"atkFis": 65,
			"atkEsp": 65,
			"def": 35,
			"defEsp": 35,
			"speed": 65
		},
		"abilities": [
			{
				"key": "water_gun",
				"levelReq": 1
			},
			{
				"key": "lock_on",
				"levelReq": 11
			},
			{
				"key": "psybeam",
				"levelReq": 22
			},
			{
				"key": "aurora_beam",
				"levelReq": 22
			},
			{
				"key": "bubblebeam",
				"levelReq": 22
			},
			{
				"key": "focus_energy",
				"levelReq": 33
			},
			{
				"key": "ice_beam",
				"levelReq": 44
			},
			{
				"key": "hyper_beam",
				"levelReq": 55
			}
		],
		"evolvesTo": "octillery",
		"evolvesAtLevel": 25
	},
	"psyduck": {
		"id": "psyduck",
		"name": "Psyduck",
		"description": "Pokedex Nº54 - tipo WATER.",
		"type": "WATER",
		"type2": null,
		"catchRate": 190,
		"baseExp": 80,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 50,
			"atkFis": 52,
			"atkEsp": 65,
			"def": 48,
			"defEsp": 50,
			"speed": 55
		},
		"abilities": [
			{
				"key": "scratch",
				"levelReq": 1
			},
			{
				"key": "tail_whip",
				"levelReq": 5
			},
			{
				"key": "disable",
				"levelReq": 10
			},
			{
				"key": "confusion",
				"levelReq": 16
			},
			{
				"key": "screech",
				"levelReq": 23
			},
			{
				"key": "psych_up",
				"levelReq": 31
			},
			{
				"key": "fury_swipes",
				"levelReq": 40
			},
			{
				"key": "hydro_pump",
				"levelReq": 50
			}
		],
		"evolvesTo": "golduck",
		"evolvesAtLevel": 33
	},
	"horsea": {
		"id": "horsea",
		"name": "Horsea",
		"description": "Pokedex Nº116 - tipo WATER.",
		"type": "WATER",
		"type2": null,
		"catchRate": 225,
		"baseExp": 83,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 30,
			"atkFis": 40,
			"atkEsp": 70,
			"def": 70,
			"defEsp": 25,
			"speed": 60
		},
		"abilities": [
			{
				"key": "bubble",
				"levelReq": 1
			},
			{
				"key": "smokescreen",
				"levelReq": 8
			},
			{
				"key": "leer",
				"levelReq": 15
			},
			{
				"key": "water_gun",
				"levelReq": 22
			},
			{
				"key": "twister",
				"levelReq": 29
			},
			{
				"key": "agility",
				"levelReq": 36
			},
			{
				"key": "hydro_pump",
				"levelReq": 43
			}
		],
		"evolvesTo": "seadra",
		"evolvesAtLevel": 32
	},
	"chinchou": {
		"id": "chinchou",
		"name": "Chinchou",
		"description": "Pokedex Nº170 - tipo WATER/ELECTRIC.",
		"type": "WATER",
		"type2": "ELECTRIC",
		"catchRate": 190,
		"baseExp": 90,
		"growthCurve": "SLOW",
		"base": {
			"hp": 75,
			"atkFis": 38,
			"atkEsp": 56,
			"def": 38,
			"defEsp": 56,
			"speed": 67
		},
		"abilities": [
			{
				"key": "bubble",
				"levelReq": 1
			},
			{
				"key": "thunder_wave",
				"levelReq": 1
			},
			{
				"key": "supersonic",
				"levelReq": 5
			},
			{
				"key": "flail",
				"levelReq": 13
			},
			{
				"key": "water_gun",
				"levelReq": 17
			},
			{
				"key": "spark",
				"levelReq": 25
			},
			{
				"key": "confuse_ray",
				"levelReq": 29
			},
			{
				"key": "take_down",
				"levelReq": 37
			},
			{
				"key": "hydro_pump",
				"levelReq": 41
			}
		],
		"evolvesTo": "lanturn",
		"evolvesAtLevel": 27
	},
	"shellder": {
		"id": "shellder",
		"name": "Shellder",
		"description": "Pokedex Nº90 - tipo WATER.",
		"type": "WATER",
		"type2": null,
		"catchRate": 190,
		"baseExp": 97,
		"growthCurve": "SLOW",
		"base": {
			"hp": 30,
			"atkFis": 65,
			"atkEsp": 45,
			"def": 100,
			"defEsp": 25,
			"speed": 40
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "withdraw",
				"levelReq": 1
			},
			{
				"key": "supersonic",
				"levelReq": 9
			},
			{
				"key": "aurora_beam",
				"levelReq": 17
			},
			{
				"key": "protect",
				"levelReq": 25
			},
			{
				"key": "leer",
				"levelReq": 33
			},
			{
				"key": "clamp",
				"levelReq": 41
			},
			{
				"key": "ice_beam",
				"levelReq": 49
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"slowpoke": {
		"id": "slowpoke",
		"name": "Slowpoke",
		"description": "Pokedex Nº79 - tipo WATER/PSYCHIC.",
		"type": "WATER",
		"type2": "PSYCHIC",
		"catchRate": 190,
		"baseExp": 99,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 90,
			"atkFis": 65,
			"atkEsp": 40,
			"def": 65,
			"defEsp": 40,
			"speed": 15
		},
		"abilities": [
			{
				"key": "curse",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 6
			},
			{
				"key": "water_gun",
				"levelReq": 15
			},
			{
				"key": "confusion",
				"levelReq": 20
			},
			{
				"key": "disable",
				"levelReq": 29
			},
			{
				"key": "headbutt",
				"levelReq": 34
			},
			{
				"key": "amnesia",
				"levelReq": 43
			},
			{
				"key": "psychic_m",
				"levelReq": 48
			}
		],
		"evolvesTo": "slowbro",
		"evolvesAtLevel": 37
	},
	"seel": {
		"id": "seel",
		"name": "Seel",
		"description": "Pokedex Nº86 - tipo WATER.",
		"type": "WATER",
		"type2": null,
		"catchRate": 190,
		"baseExp": 100,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 65,
			"atkFis": 45,
			"atkEsp": 45,
			"def": 55,
			"defEsp": 70,
			"speed": 45
		},
		"abilities": [
			{
				"key": "headbutt",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 5
			},
			{
				"key": "aurora_beam",
				"levelReq": 16
			},
			{
				"key": "rest",
				"levelReq": 21
			},
			{
				"key": "take_down",
				"levelReq": 32
			},
			{
				"key": "ice_beam",
				"levelReq": 37
			},
			{
				"key": "safeguard",
				"levelReq": 48
			}
		],
		"evolvesTo": "dewgong",
		"evolvesAtLevel": 34
	},
	"qwilfish": {
		"id": "qwilfish",
		"name": "Qwilfish",
		"description": "Pokedex Nº211 - tipo WATER/POISON.",
		"type": "WATER",
		"type2": "POISON",
		"catchRate": 45,
		"baseExp": 100,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 65,
			"atkFis": 95,
			"atkEsp": 55,
			"def": 75,
			"defEsp": 55,
			"speed": 85
		},
		"abilities": [
			{
				"key": "spikes",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "poison_sting",
				"levelReq": 1
			},
			{
				"key": "harden",
				"levelReq": 10
			},
			{
				"key": "minimize",
				"levelReq": 10
			},
			{
				"key": "water_gun",
				"levelReq": 19
			},
			{
				"key": "pin_missile",
				"levelReq": 28
			},
			{
				"key": "take_down",
				"levelReq": 37
			},
			{
				"key": "hydro_pump",
				"levelReq": 46
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"tentacool": {
		"id": "tentacool",
		"name": "Tentacool",
		"description": "Pokedex Nº72 - tipo WATER/POISON.",
		"type": "WATER",
		"type2": "POISON",
		"catchRate": 190,
		"baseExp": 105,
		"growthCurve": "SLOW",
		"base": {
			"hp": 40,
			"atkFis": 40,
			"atkEsp": 50,
			"def": 35,
			"defEsp": 100,
			"speed": 70
		},
		"abilities": [
			{
				"key": "poison_sting",
				"levelReq": 1
			},
			{
				"key": "supersonic",
				"levelReq": 6
			},
			{
				"key": "constrict",
				"levelReq": 12
			},
			{
				"key": "acid",
				"levelReq": 19
			},
			{
				"key": "bubblebeam",
				"levelReq": 25
			},
			{
				"key": "wrap",
				"levelReq": 30
			},
			{
				"key": "barrier",
				"levelReq": 36
			},
			{
				"key": "screech",
				"levelReq": 43
			},
			{
				"key": "hydro_pump",
				"levelReq": 49
			}
		],
		"evolvesTo": "tentacruel",
		"evolvesAtLevel": 30
	},
	"staryu": {
		"id": "staryu",
		"name": "Staryu",
		"description": "Pokedex Nº120 - tipo WATER.",
		"type": "WATER",
		"type2": null,
		"catchRate": 225,
		"baseExp": 106,
		"growthCurve": "SLOW",
		"base": {
			"hp": 30,
			"atkFis": 45,
			"atkEsp": 70,
			"def": 55,
			"defEsp": 55,
			"speed": 85
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "harden",
				"levelReq": 1
			},
			{
				"key": "water_gun",
				"levelReq": 7
			},
			{
				"key": "rapid_spin",
				"levelReq": 13
			},
			{
				"key": "recover",
				"levelReq": 19
			},
			{
				"key": "swift",
				"levelReq": 25
			},
			{
				"key": "bubblebeam",
				"levelReq": 31
			},
			{
				"key": "minimize",
				"levelReq": 37
			},
			{
				"key": "light_screen",
				"levelReq": 43
			},
			{
				"key": "hydro_pump",
				"levelReq": 50
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"goldeen": {
		"id": "goldeen",
		"name": "Goldeen",
		"description": "Pokedex Nº118 - tipo WATER.",
		"type": "WATER",
		"type2": null,
		"catchRate": 225,
		"baseExp": 111,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 45,
			"atkFis": 67,
			"atkEsp": 35,
			"def": 60,
			"defEsp": 50,
			"speed": 63
		},
		"abilities": [
			{
				"key": "peck",
				"levelReq": 1
			},
			{
				"key": "tail_whip",
				"levelReq": 1
			},
			{
				"key": "supersonic",
				"levelReq": 10
			},
			{
				"key": "horn_attack",
				"levelReq": 15
			},
			{
				"key": "flail",
				"levelReq": 24
			},
			{
				"key": "fury_attack",
				"levelReq": 29
			},
			{
				"key": "waterfall",
				"levelReq": 38
			},
			{
				"key": "horn_drill",
				"levelReq": 43
			},
			{
				"key": "agility",
				"levelReq": 52
			}
		],
		"evolvesTo": "seaking",
		"evolvesAtLevel": 33
	},
	"corsola": {
		"id": "corsola",
		"name": "Corsola",
		"description": "Pokedex Nº222 - tipo WATER/ROCK.",
		"type": "WATER",
		"type2": "ROCK",
		"catchRate": 60,
		"baseExp": 113,
		"growthCurve": "FAST",
		"base": {
			"hp": 55,
			"atkFis": 55,
			"atkEsp": 65,
			"def": 85,
			"defEsp": 85,
			"speed": 35
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "harden",
				"levelReq": 7
			},
			{
				"key": "bubble",
				"levelReq": 13
			},
			{
				"key": "recover",
				"levelReq": 19
			},
			{
				"key": "bubblebeam",
				"levelReq": 25
			},
			{
				"key": "spike_cannon",
				"levelReq": 31
			},
			{
				"key": "mirror_coat",
				"levelReq": 37
			},
			{
				"key": "ancientpower",
				"levelReq": 43
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"krabby": {
		"id": "krabby",
		"name": "Krabby",
		"description": "Pokedex Nº98 - tipo WATER.",
		"type": "WATER",
		"type2": null,
		"catchRate": 225,
		"baseExp": 115,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 30,
			"atkFis": 105,
			"atkEsp": 25,
			"def": 90,
			"defEsp": 25,
			"speed": 50
		},
		"abilities": [
			{
				"key": "bubble",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 5
			},
			{
				"key": "vicegrip",
				"levelReq": 12
			},
			{
				"key": "harden",
				"levelReq": 16
			},
			{
				"key": "stomp",
				"levelReq": 23
			},
			{
				"key": "guillotine",
				"levelReq": 27
			},
			{
				"key": "protect",
				"levelReq": 34
			},
			{
				"key": "crabhammer",
				"levelReq": 41
			}
		],
		"evolvesTo": "kingler",
		"evolvesAtLevel": 28
	},
	"poliwhirl": {
		"id": "poliwhirl",
		"name": "Poliwhirl",
		"description": "Pokedex Nº61 - tipo WATER.",
		"type": "WATER",
		"type2": null,
		"catchRate": 120,
		"baseExp": 131,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 65,
			"atkFis": 65,
			"atkEsp": 50,
			"def": 65,
			"defEsp": 50,
			"speed": 90
		},
		"abilities": [
			{
				"key": "bubble",
				"levelReq": 1
			},
			{
				"key": "hypnosis",
				"levelReq": 1
			},
			{
				"key": "water_gun",
				"levelReq": 1
			},
			{
				"key": "hypnosis",
				"levelReq": 7
			},
			{
				"key": "water_gun",
				"levelReq": 13
			},
			{
				"key": "doubleslap",
				"levelReq": 19
			},
			{
				"key": "rain_dance",
				"levelReq": 27
			},
			{
				"key": "body_slam",
				"levelReq": 35
			},
			{
				"key": "belly_drum",
				"levelReq": 43
			},
			{
				"key": "hydro_pump",
				"levelReq": 51
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"quagsire": {
		"id": "quagsire",
		"name": "Quagsire",
		"description": "Pokedex Nº195 - tipo WATER/GROUND.",
		"type": "WATER",
		"type2": "GROUND",
		"catchRate": 90,
		"baseExp": 137,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 95,
			"atkFis": 85,
			"atkEsp": 65,
			"def": 85,
			"defEsp": 65,
			"speed": 35
		},
		"abilities": [
			{
				"key": "water_gun",
				"levelReq": 1
			},
			{
				"key": "tail_whip",
				"levelReq": 1
			},
			{
				"key": "slam",
				"levelReq": 11
			},
			{
				"key": "amnesia",
				"levelReq": 23
			},
			{
				"key": "earthquake",
				"levelReq": 35
			},
			{
				"key": "rain_dance",
				"levelReq": 47
			},
			{
				"key": "mist",
				"levelReq": 59
			},
			{
				"key": "haze",
				"levelReq": 59
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"pidgey": {
		"id": "pidgey",
		"name": "Pidgey",
		"description": "Pokedex Nº16 - tipo NORMAL/FLYING.",
		"type": "NORMAL",
		"type2": "FLYING",
		"catchRate": 255,
		"baseExp": 55,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 40,
			"atkFis": 45,
			"atkEsp": 35,
			"def": 40,
			"defEsp": 35,
			"speed": 56
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "sand_attack",
				"levelReq": 5
			},
			{
				"key": "gust",
				"levelReq": 9
			},
			{
				"key": "quick_attack",
				"levelReq": 15
			},
			{
				"key": "whirlwind",
				"levelReq": 21
			},
			{
				"key": "wing_attack",
				"levelReq": 29
			},
			{
				"key": "agility",
				"levelReq": 37
			},
			{
				"key": "mirror_move",
				"levelReq": 47
			}
		],
		"evolvesTo": "pidgeotto",
		"evolvesAtLevel": 18
	},
	"pidgeotto": {
		"id": "pidgeotto",
		"name": "Pidgeotto",
		"description": "Pokedex Nº17 - tipo NORMAL/FLYING.",
		"type": "NORMAL",
		"type2": "FLYING",
		"catchRate": 120,
		"baseExp": 113,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 63,
			"atkFis": 60,
			"atkEsp": 50,
			"def": 55,
			"defEsp": 50,
			"speed": 71
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "sand_attack",
				"levelReq": 1
			},
			{
				"key": "gust",
				"levelReq": 1
			},
			{
				"key": "sand_attack",
				"levelReq": 5
			},
			{
				"key": "gust",
				"levelReq": 9
			},
			{
				"key": "quick_attack",
				"levelReq": 15
			},
			{
				"key": "whirlwind",
				"levelReq": 23
			},
			{
				"key": "wing_attack",
				"levelReq": 33
			},
			{
				"key": "agility",
				"levelReq": 43
			},
			{
				"key": "mirror_move",
				"levelReq": 55
			}
		],
		"evolvesTo": "pidgeot",
		"evolvesAtLevel": 36
	},
	"pidgeot": {
		"id": "pidgeot",
		"name": "Pidgeot",
		"description": "Pokedex Nº18 - tipo NORMAL/FLYING.",
		"type": "NORMAL",
		"type2": "FLYING",
		"catchRate": 45,
		"baseExp": 172,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 83,
			"atkFis": 80,
			"atkEsp": 70,
			"def": 75,
			"defEsp": 70,
			"speed": 91
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "sand_attack",
				"levelReq": 1
			},
			{
				"key": "gust",
				"levelReq": 1
			},
			{
				"key": "quick_attack",
				"levelReq": 1
			},
			{
				"key": "sand_attack",
				"levelReq": 5
			},
			{
				"key": "gust",
				"levelReq": 9
			},
			{
				"key": "quick_attack",
				"levelReq": 15
			},
			{
				"key": "whirlwind",
				"levelReq": 23
			},
			{
				"key": "wing_attack",
				"levelReq": 33
			},
			{
				"key": "agility",
				"levelReq": 46
			},
			{
				"key": "mirror_move",
				"levelReq": 61
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"raticate": {
		"id": "raticate",
		"name": "Raticate",
		"description": "Pokedex Nº20 - tipo NORMAL.",
		"type": "NORMAL",
		"type2": null,
		"catchRate": 90,
		"baseExp": 116,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 55,
			"atkFis": 81,
			"atkEsp": 50,
			"def": 60,
			"defEsp": 70,
			"speed": 97
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "tail_whip",
				"levelReq": 1
			},
			{
				"key": "quick_attack",
				"levelReq": 1
			},
			{
				"key": "quick_attack",
				"levelReq": 7
			},
			{
				"key": "hyper_fang",
				"levelReq": 13
			},
			{
				"key": "scary_face",
				"levelReq": 20
			},
			{
				"key": "pursuit",
				"levelReq": 30
			},
			{
				"key": "super_fang",
				"levelReq": 40
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"fearow": {
		"id": "fearow",
		"name": "Fearow",
		"description": "Pokedex Nº22 - tipo NORMAL/FLYING.",
		"type": "NORMAL",
		"type2": "FLYING",
		"catchRate": 90,
		"baseExp": 162,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 65,
			"atkFis": 90,
			"atkEsp": 61,
			"def": 65,
			"defEsp": 61,
			"speed": 100
		},
		"abilities": [
			{
				"key": "peck",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "fury_attack",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 7
			},
			{
				"key": "fury_attack",
				"levelReq": 13
			},
			{
				"key": "pursuit",
				"levelReq": 26
			},
			{
				"key": "mirror_move",
				"levelReq": 32
			},
			{
				"key": "drill_peck",
				"levelReq": 40
			},
			{
				"key": "agility",
				"levelReq": 47
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"jigglypuff": {
		"id": "jigglypuff",
		"name": "Jigglypuff",
		"description": "Pokedex Nº39 - tipo NORMAL.",
		"type": "NORMAL",
		"type2": null,
		"catchRate": 170,
		"baseExp": 76,
		"growthCurve": "FAST",
		"base": {
			"hp": 115,
			"atkFis": 45,
			"atkEsp": 45,
			"def": 20,
			"defEsp": 25,
			"speed": 20
		},
		"abilities": [
			{
				"key": "sing",
				"levelReq": 1
			},
			{
				"key": "defense_curl",
				"levelReq": 4
			},
			{
				"key": "pound",
				"levelReq": 9
			},
			{
				"key": "disable",
				"levelReq": 14
			},
			{
				"key": "rollout",
				"levelReq": 19
			},
			{
				"key": "doubleslap",
				"levelReq": 24
			},
			{
				"key": "rest",
				"levelReq": 29
			},
			{
				"key": "body_slam",
				"levelReq": 34
			},
			{
				"key": "double_edge",
				"levelReq": 39
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"meowth": {
		"id": "meowth",
		"name": "Meowth",
		"description": "Pokedex Nº52 - tipo NORMAL.",
		"type": "NORMAL",
		"type2": null,
		"catchRate": 255,
		"baseExp": 69,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 40,
			"atkFis": 45,
			"atkEsp": 40,
			"def": 35,
			"defEsp": 40,
			"speed": 90
		},
		"abilities": [
			{
				"key": "scratch",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "bite",
				"levelReq": 11
			},
			{
				"key": "pay_day",
				"levelReq": 20
			},
			{
				"key": "faint_attack",
				"levelReq": 28
			},
			{
				"key": "screech",
				"levelReq": 35
			},
			{
				"key": "fury_swipes",
				"levelReq": 41
			},
			{
				"key": "slash",
				"levelReq": 46
			}
		],
		"evolvesTo": "persian",
		"evolvesAtLevel": 28
	},
	"persian": {
		"id": "persian",
		"name": "Persian",
		"description": "Pokedex Nº53 - tipo NORMAL.",
		"type": "NORMAL",
		"type2": null,
		"catchRate": 90,
		"baseExp": 148,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 65,
			"atkFis": 70,
			"atkEsp": 65,
			"def": 60,
			"defEsp": 65,
			"speed": 115
		},
		"abilities": [
			{
				"key": "scratch",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "bite",
				"levelReq": 1
			},
			{
				"key": "bite",
				"levelReq": 11
			},
			{
				"key": "pay_day",
				"levelReq": 20
			},
			{
				"key": "faint_attack",
				"levelReq": 29
			},
			{
				"key": "screech",
				"levelReq": 38
			},
			{
				"key": "fury_swipes",
				"levelReq": 46
			},
			{
				"key": "slash",
				"levelReq": 53
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"farfetch_d": {
		"id": "farfetch_d",
		"name": "Farfetch'd",
		"description": "Pokedex Nº83 - tipo NORMAL/FLYING.",
		"type": "NORMAL",
		"type2": "FLYING",
		"catchRate": 45,
		"baseExp": 94,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 52,
			"atkFis": 65,
			"atkEsp": 58,
			"def": 55,
			"defEsp": 62,
			"speed": 60
		},
		"abilities": [
			{
				"key": "peck",
				"levelReq": 1
			},
			{
				"key": "sand_attack",
				"levelReq": 7
			},
			{
				"key": "leer",
				"levelReq": 13
			},
			{
				"key": "fury_attack",
				"levelReq": 19
			},
			{
				"key": "swords_dance",
				"levelReq": 25
			},
			{
				"key": "agility",
				"levelReq": 31
			},
			{
				"key": "slash",
				"levelReq": 37
			},
			{
				"key": "false_swipe",
				"levelReq": 44
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"doduo": {
		"id": "doduo",
		"name": "Doduo",
		"description": "Pokedex Nº84 - tipo NORMAL/FLYING.",
		"type": "NORMAL",
		"type2": "FLYING",
		"catchRate": 190,
		"baseExp": 96,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 35,
			"atkFis": 85,
			"atkEsp": 35,
			"def": 45,
			"defEsp": 35,
			"speed": 75
		},
		"abilities": [
			{
				"key": "peck",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "pursuit",
				"levelReq": 9
			},
			{
				"key": "fury_attack",
				"levelReq": 13
			},
			{
				"key": "tri_attack",
				"levelReq": 21
			},
			{
				"key": "rage",
				"levelReq": 25
			},
			{
				"key": "drill_peck",
				"levelReq": 33
			},
			{
				"key": "agility",
				"levelReq": 37
			}
		],
		"evolvesTo": "dodrio",
		"evolvesAtLevel": 31
	},
	"dodrio": {
		"id": "dodrio",
		"name": "Dodrio",
		"description": "Pokedex Nº85 - tipo NORMAL/FLYING.",
		"type": "NORMAL",
		"type2": "FLYING",
		"catchRate": 45,
		"baseExp": 158,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 60,
			"atkFis": 110,
			"atkEsp": 60,
			"def": 70,
			"defEsp": 60,
			"speed": 100
		},
		"abilities": [
			{
				"key": "peck",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "pursuit",
				"levelReq": 1
			},
			{
				"key": "fury_attack",
				"levelReq": 1
			},
			{
				"key": "pursuit",
				"levelReq": 9
			},
			{
				"key": "fury_attack",
				"levelReq": 13
			},
			{
				"key": "tri_attack",
				"levelReq": 21
			},
			{
				"key": "rage",
				"levelReq": 25
			},
			{
				"key": "drill_peck",
				"levelReq": 38
			},
			{
				"key": "agility",
				"levelReq": 47
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"lickitung": {
		"id": "lickitung",
		"name": "Lickitung",
		"description": "Pokedex Nº108 - tipo NORMAL.",
		"type": "NORMAL",
		"type2": null,
		"catchRate": 45,
		"baseExp": 127,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 90,
			"atkFis": 55,
			"atkEsp": 60,
			"def": 75,
			"defEsp": 75,
			"speed": 30
		},
		"abilities": [
			{
				"key": "lick",
				"levelReq": 1
			},
			{
				"key": "supersonic",
				"levelReq": 7
			},
			{
				"key": "defense_curl",
				"levelReq": 13
			},
			{
				"key": "stomp",
				"levelReq": 19
			},
			{
				"key": "wrap",
				"levelReq": 25
			},
			{
				"key": "disable",
				"levelReq": 31
			},
			{
				"key": "slam",
				"levelReq": 37
			},
			{
				"key": "screech",
				"levelReq": 43
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"kangaskhan": {
		"id": "kangaskhan",
		"name": "Kangaskhan",
		"description": "Pokedex Nº115 - tipo NORMAL.",
		"type": "NORMAL",
		"type2": null,
		"catchRate": 45,
		"baseExp": 175,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 105,
			"atkFis": 95,
			"atkEsp": 40,
			"def": 80,
			"defEsp": 80,
			"speed": 90
		},
		"abilities": [
			{
				"key": "comet_punch",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 7
			},
			{
				"key": "bite",
				"levelReq": 13
			},
			{
				"key": "tail_whip",
				"levelReq": 19
			},
			{
				"key": "mega_punch",
				"levelReq": 25
			},
			{
				"key": "rage",
				"levelReq": 31
			},
			{
				"key": "endure",
				"levelReq": 37
			},
			{
				"key": "dizzy_punch",
				"levelReq": 43
			},
			{
				"key": "reversal",
				"levelReq": 49
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"tauros": {
		"id": "tauros",
		"name": "Tauros",
		"description": "Pokedex Nº128 - tipo NORMAL.",
		"type": "NORMAL",
		"type2": null,
		"catchRate": 45,
		"baseExp": 211,
		"growthCurve": "SLOW",
		"base": {
			"hp": 75,
			"atkFis": 100,
			"atkEsp": 40,
			"def": 95,
			"defEsp": 70,
			"speed": 110
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "tail_whip",
				"levelReq": 4
			},
			{
				"key": "rage",
				"levelReq": 8
			},
			{
				"key": "horn_attack",
				"levelReq": 13
			},
			{
				"key": "scary_face",
				"levelReq": 19
			},
			{
				"key": "pursuit",
				"levelReq": 26
			},
			{
				"key": "rest",
				"levelReq": 34
			},
			{
				"key": "thrash",
				"levelReq": 43
			},
			{
				"key": "take_down",
				"levelReq": 53
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"ditto": {
		"id": "ditto",
		"name": "Ditto",
		"description": "Pokedex Nº132 - tipo NORMAL.",
		"type": "NORMAL",
		"type2": null,
		"catchRate": 35,
		"baseExp": 61,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 48,
			"atkFis": 48,
			"atkEsp": 48,
			"def": 48,
			"defEsp": 48,
			"speed": 48
		},
		"abilities": [{
			"key": "transform",
			"levelReq": 1
		}],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"eevee": {
		"id": "eevee",
		"name": "Eevee",
		"description": "Pokedex Nº133 - tipo NORMAL.",
		"type": "NORMAL",
		"type2": null,
		"catchRate": 45,
		"baseExp": 92,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 55,
			"atkFis": 55,
			"atkEsp": 45,
			"def": 50,
			"defEsp": 65,
			"speed": 55
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "tail_whip",
				"levelReq": 1
			},
			{
				"key": "sand_attack",
				"levelReq": 8
			},
			{
				"key": "growl",
				"levelReq": 16
			},
			{
				"key": "quick_attack",
				"levelReq": 23
			},
			{
				"key": "bite",
				"levelReq": 30
			},
			{
				"key": "baton_pass",
				"levelReq": 36
			},
			{
				"key": "take_down",
				"levelReq": 42
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"porygon": {
		"id": "porygon",
		"name": "Porygon",
		"description": "Pokedex Nº137 - tipo NORMAL.",
		"type": "NORMAL",
		"type2": null,
		"catchRate": 45,
		"baseExp": 130,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 65,
			"atkFis": 60,
			"atkEsp": 85,
			"def": 70,
			"defEsp": 75,
			"speed": 40
		},
		"abilities": [
			{
				"key": "conversion2",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "conversion",
				"levelReq": 1
			},
			{
				"key": "agility",
				"levelReq": 9
			},
			{
				"key": "psybeam",
				"levelReq": 12
			},
			{
				"key": "recover",
				"levelReq": 20
			},
			{
				"key": "sharpen",
				"levelReq": 24
			},
			{
				"key": "lock_on",
				"levelReq": 32
			},
			{
				"key": "tri_attack",
				"levelReq": 36
			},
			{
				"key": "zap_cannon",
				"levelReq": 44
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"snorlax": {
		"id": "snorlax",
		"name": "Snorlax",
		"description": "Pokedex Nº143 - tipo NORMAL.",
		"type": "NORMAL",
		"type2": null,
		"catchRate": 25,
		"baseExp": 154,
		"growthCurve": "SLOW",
		"base": {
			"hp": 160,
			"atkFis": 110,
			"atkEsp": 65,
			"def": 65,
			"defEsp": 110,
			"speed": 30
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "amnesia",
				"levelReq": 8
			},
			{
				"key": "defense_curl",
				"levelReq": 15
			},
			{
				"key": "belly_drum",
				"levelReq": 22
			},
			{
				"key": "headbutt",
				"levelReq": 29
			},
			{
				"key": "snore",
				"levelReq": 36
			},
			{
				"key": "rest",
				"levelReq": 36
			},
			{
				"key": "body_slam",
				"levelReq": 43
			},
			{
				"key": "rollout",
				"levelReq": 50
			},
			{
				"key": "hyper_beam",
				"levelReq": 57
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"sentret": {
		"id": "sentret",
		"name": "Sentret",
		"description": "Pokedex Nº161 - tipo NORMAL.",
		"type": "NORMAL",
		"type2": null,
		"catchRate": 255,
		"baseExp": 57,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 35,
			"atkFis": 46,
			"atkEsp": 35,
			"def": 34,
			"defEsp": 45,
			"speed": 20
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "defense_curl",
				"levelReq": 5
			},
			{
				"key": "quick_attack",
				"levelReq": 11
			},
			{
				"key": "fury_swipes",
				"levelReq": 17
			},
			{
				"key": "slam",
				"levelReq": 25
			},
			{
				"key": "rest",
				"levelReq": 33
			},
			{
				"key": "amnesia",
				"levelReq": 41
			}
		],
		"evolvesTo": "furret",
		"evolvesAtLevel": 15
	},
	"furret": {
		"id": "furret",
		"name": "Furret",
		"description": "Pokedex Nº162 - tipo NORMAL.",
		"type": "NORMAL",
		"type2": null,
		"catchRate": 90,
		"baseExp": 116,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 85,
			"atkFis": 76,
			"atkEsp": 45,
			"def": 64,
			"defEsp": 55,
			"speed": 90
		},
		"abilities": [
			{
				"key": "scratch",
				"levelReq": 1
			},
			{
				"key": "defense_curl",
				"levelReq": 1
			},
			{
				"key": "quick_attack",
				"levelReq": 1
			},
			{
				"key": "defense_curl",
				"levelReq": 5
			},
			{
				"key": "quick_attack",
				"levelReq": 11
			},
			{
				"key": "fury_swipes",
				"levelReq": 18
			},
			{
				"key": "slam",
				"levelReq": 28
			},
			{
				"key": "rest",
				"levelReq": 38
			},
			{
				"key": "amnesia",
				"levelReq": 48
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"hoothoot": {
		"id": "hoothoot",
		"name": "Hoothoot",
		"description": "Pokedex Nº163 - tipo NORMAL/FLYING.",
		"type": "NORMAL",
		"type2": "FLYING",
		"catchRate": 255,
		"baseExp": 58,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 60,
			"atkFis": 30,
			"atkEsp": 36,
			"def": 30,
			"defEsp": 56,
			"speed": 50
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "foresight",
				"levelReq": 6
			},
			{
				"key": "peck",
				"levelReq": 11
			},
			{
				"key": "hypnosis",
				"levelReq": 16
			},
			{
				"key": "reflect",
				"levelReq": 22
			},
			{
				"key": "take_down",
				"levelReq": 28
			},
			{
				"key": "confusion",
				"levelReq": 34
			},
			{
				"key": "dream_eater",
				"levelReq": 48
			}
		],
		"evolvesTo": "noctowl",
		"evolvesAtLevel": 20
	},
	"noctowl": {
		"id": "noctowl",
		"name": "Noctowl",
		"description": "Pokedex Nº164 - tipo NORMAL/FLYING.",
		"type": "NORMAL",
		"type2": "FLYING",
		"catchRate": 90,
		"baseExp": 162,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 100,
			"atkFis": 50,
			"atkEsp": 76,
			"def": 50,
			"defEsp": 96,
			"speed": 70
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "foresight",
				"levelReq": 1
			},
			{
				"key": "peck",
				"levelReq": 1
			},
			{
				"key": "foresight",
				"levelReq": 6
			},
			{
				"key": "peck",
				"levelReq": 11
			},
			{
				"key": "hypnosis",
				"levelReq": 16
			},
			{
				"key": "reflect",
				"levelReq": 25
			},
			{
				"key": "take_down",
				"levelReq": 33
			},
			{
				"key": "confusion",
				"levelReq": 41
			},
			{
				"key": "dream_eater",
				"levelReq": 57
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"cleffa": {
		"id": "cleffa",
		"name": "Cleffa",
		"description": "Pokedex Nº173 - tipo NORMAL.",
		"type": "NORMAL",
		"type2": null,
		"catchRate": 150,
		"baseExp": 37,
		"growthCurve": "FAST",
		"base": {
			"hp": 50,
			"atkFis": 25,
			"atkEsp": 45,
			"def": 28,
			"defEsp": 55,
			"speed": 15
		},
		"abilities": [
			{
				"key": "pound",
				"levelReq": 1
			},
			{
				"key": "charm",
				"levelReq": 1
			},
			{
				"key": "encore",
				"levelReq": 4
			},
			{
				"key": "sing",
				"levelReq": 8
			},
			{
				"key": "sweet_kiss",
				"levelReq": 13
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"igglybuff": {
		"id": "igglybuff",
		"name": "Igglybuff",
		"description": "Pokedex Nº174 - tipo NORMAL.",
		"type": "NORMAL",
		"type2": null,
		"catchRate": 170,
		"baseExp": 39,
		"growthCurve": "FAST",
		"base": {
			"hp": 90,
			"atkFis": 30,
			"atkEsp": 40,
			"def": 15,
			"defEsp": 20,
			"speed": 15
		},
		"abilities": [
			{
				"key": "sing",
				"levelReq": 1
			},
			{
				"key": "charm",
				"levelReq": 1
			},
			{
				"key": "defense_curl",
				"levelReq": 4
			},
			{
				"key": "pound",
				"levelReq": 9
			},
			{
				"key": "sweet_kiss",
				"levelReq": 14
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"togepi": {
		"id": "togepi",
		"name": "Togepi",
		"description": "Pokedex Nº175 - tipo NORMAL.",
		"type": "NORMAL",
		"type2": null,
		"catchRate": 190,
		"baseExp": 74,
		"growthCurve": "FAST",
		"base": {
			"hp": 35,
			"atkFis": 20,
			"atkEsp": 40,
			"def": 65,
			"defEsp": 65,
			"speed": 20
		},
		"abilities": [
			{
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "charm",
				"levelReq": 1
			},
			{
				"key": "metronome",
				"levelReq": 7
			},
			{
				"key": "sweet_kiss",
				"levelReq": 18
			},
			{
				"key": "encore",
				"levelReq": 25
			},
			{
				"key": "safeguard",
				"levelReq": 31
			},
			{
				"key": "double_edge",
				"levelReq": 38
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"aipom": {
		"id": "aipom",
		"name": "Aipom",
		"description": "Pokedex Nº190 - tipo NORMAL.",
		"type": "NORMAL",
		"type2": null,
		"catchRate": 45,
		"baseExp": 94,
		"growthCurve": "FAST",
		"base": {
			"hp": 55,
			"atkFis": 70,
			"atkEsp": 40,
			"def": 55,
			"defEsp": 55,
			"speed": 85
		},
		"abilities": [
			{
				"key": "scratch",
				"levelReq": 1
			},
			{
				"key": "tail_whip",
				"levelReq": 1
			},
			{
				"key": "sand_attack",
				"levelReq": 6
			},
			{
				"key": "baton_pass",
				"levelReq": 12
			},
			{
				"key": "fury_swipes",
				"levelReq": 19
			},
			{
				"key": "swift",
				"levelReq": 27
			},
			{
				"key": "screech",
				"levelReq": 36
			},
			{
				"key": "agility",
				"levelReq": 46
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"girafarig": {
		"id": "girafarig",
		"name": "Girafarig",
		"description": "Pokedex Nº203 - tipo NORMAL/PSYCHIC.",
		"type": "NORMAL",
		"type2": "PSYCHIC",
		"catchRate": 60,
		"baseExp": 149,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 70,
			"atkFis": 80,
			"atkEsp": 90,
			"def": 65,
			"defEsp": 65,
			"speed": 85
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "confusion",
				"levelReq": 1
			},
			{
				"key": "stomp",
				"levelReq": 1
			},
			{
				"key": "confusion",
				"levelReq": 7
			},
			{
				"key": "stomp",
				"levelReq": 13
			},
			{
				"key": "agility",
				"levelReq": 20
			},
			{
				"key": "baton_pass",
				"levelReq": 30
			},
			{
				"key": "psybeam",
				"levelReq": 41
			},
			{
				"key": "crunch",
				"levelReq": 54
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"dunsparce": {
		"id": "dunsparce",
		"name": "Dunsparce",
		"description": "Pokedex Nº206 - tipo NORMAL.",
		"type": "NORMAL",
		"type2": null,
		"catchRate": 190,
		"baseExp": 75,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 100,
			"atkFis": 70,
			"atkEsp": 65,
			"def": 70,
			"defEsp": 65,
			"speed": 45
		},
		"abilities": [
			{
				"key": "rage",
				"levelReq": 1
			},
			{
				"key": "defense_curl",
				"levelReq": 5
			},
			{
				"key": "glare",
				"levelReq": 13
			},
			{
				"key": "spite",
				"levelReq": 18
			},
			{
				"key": "pursuit",
				"levelReq": 26
			},
			{
				"key": "screech",
				"levelReq": 30
			},
			{
				"key": "take_down",
				"levelReq": 38
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"snubbull": {
		"id": "snubbull",
		"name": "Snubbull",
		"description": "Pokedex Nº209 - tipo NORMAL.",
		"type": "NORMAL",
		"type2": null,
		"catchRate": 190,
		"baseExp": 63,
		"growthCurve": "FAST",
		"base": {
			"hp": 60,
			"atkFis": 80,
			"atkEsp": 40,
			"def": 50,
			"defEsp": 40,
			"speed": 30
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "scary_face",
				"levelReq": 1
			},
			{
				"key": "tail_whip",
				"levelReq": 4
			},
			{
				"key": "charm",
				"levelReq": 8
			},
			{
				"key": "bite",
				"levelReq": 13
			},
			{
				"key": "lick",
				"levelReq": 19
			},
			{
				"key": "roar",
				"levelReq": 26
			},
			{
				"key": "rage",
				"levelReq": 34
			},
			{
				"key": "take_down",
				"levelReq": 43
			}
		],
		"evolvesTo": "granbull",
		"evolvesAtLevel": 23
	},
	"granbull": {
		"id": "granbull",
		"name": "Granbull",
		"description": "Pokedex Nº210 - tipo NORMAL.",
		"type": "NORMAL",
		"type2": null,
		"catchRate": 75,
		"baseExp": 178,
		"growthCurve": "FAST",
		"base": {
			"hp": 90,
			"atkFis": 120,
			"atkEsp": 60,
			"def": 75,
			"defEsp": 60,
			"speed": 45
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "scary_face",
				"levelReq": 1
			},
			{
				"key": "tail_whip",
				"levelReq": 4
			},
			{
				"key": "charm",
				"levelReq": 8
			},
			{
				"key": "bite",
				"levelReq": 13
			},
			{
				"key": "lick",
				"levelReq": 19
			},
			{
				"key": "roar",
				"levelReq": 28
			},
			{
				"key": "rage",
				"levelReq": 38
			},
			{
				"key": "take_down",
				"levelReq": 51
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"teddiursa": {
		"id": "teddiursa",
		"name": "Teddiursa",
		"description": "Pokedex Nº216 - tipo NORMAL.",
		"type": "NORMAL",
		"type2": null,
		"catchRate": 120,
		"baseExp": 124,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 60,
			"atkFis": 80,
			"atkEsp": 50,
			"def": 50,
			"defEsp": 50,
			"speed": 40
		},
		"abilities": [
			{
				"key": "scratch",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "lick",
				"levelReq": 8
			},
			{
				"key": "fury_swipes",
				"levelReq": 15
			},
			{
				"key": "faint_attack",
				"levelReq": 22
			},
			{
				"key": "rest",
				"levelReq": 29
			},
			{
				"key": "slash",
				"levelReq": 36
			},
			{
				"key": "snore",
				"levelReq": 43
			},
			{
				"key": "thrash",
				"levelReq": 50
			}
		],
		"evolvesTo": "ursaring",
		"evolvesAtLevel": 30
	},
	"ursaring": {
		"id": "ursaring",
		"name": "Ursaring",
		"description": "Pokedex Nº217 - tipo NORMAL.",
		"type": "NORMAL",
		"type2": null,
		"catchRate": 60,
		"baseExp": 189,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 90,
			"atkFis": 130,
			"atkEsp": 75,
			"def": 75,
			"defEsp": 75,
			"speed": 55
		},
		"abilities": [
			{
				"key": "scratch",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "lick",
				"levelReq": 1
			},
			{
				"key": "fury_swipes",
				"levelReq": 1
			},
			{
				"key": "lick",
				"levelReq": 8
			},
			{
				"key": "fury_swipes",
				"levelReq": 15
			},
			{
				"key": "faint_attack",
				"levelReq": 22
			},
			{
				"key": "rest",
				"levelReq": 29
			},
			{
				"key": "slash",
				"levelReq": 39
			},
			{
				"key": "snore",
				"levelReq": 49
			},
			{
				"key": "thrash",
				"levelReq": 59
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"porygon2": {
		"id": "porygon2",
		"name": "Porygon2",
		"description": "Pokedex Nº233 - tipo NORMAL.",
		"type": "NORMAL",
		"type2": null,
		"catchRate": 45,
		"baseExp": 180,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 85,
			"atkFis": 80,
			"atkEsp": 105,
			"def": 90,
			"defEsp": 95,
			"speed": 60
		},
		"abilities": [
			{
				"key": "conversion2",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "conversion",
				"levelReq": 1
			},
			{
				"key": "agility",
				"levelReq": 9
			},
			{
				"key": "psybeam",
				"levelReq": 12
			},
			{
				"key": "recover",
				"levelReq": 20
			},
			{
				"key": "defense_curl",
				"levelReq": 24
			},
			{
				"key": "lock_on",
				"levelReq": 32
			},
			{
				"key": "tri_attack",
				"levelReq": 36
			},
			{
				"key": "zap_cannon",
				"levelReq": 44
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"stantler": {
		"id": "stantler",
		"name": "Stantler",
		"description": "Pokedex Nº234 - tipo NORMAL.",
		"type": "NORMAL",
		"type2": null,
		"catchRate": 45,
		"baseExp": 165,
		"growthCurve": "SLOW",
		"base": {
			"hp": 73,
			"atkFis": 95,
			"atkEsp": 85,
			"def": 62,
			"defEsp": 65,
			"speed": 85
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 8
			},
			{
				"key": "hypnosis",
				"levelReq": 15
			},
			{
				"key": "stomp",
				"levelReq": 23
			},
			{
				"key": "sand_attack",
				"levelReq": 31
			},
			{
				"key": "take_down",
				"levelReq": 40
			},
			{
				"key": "confuse_ray",
				"levelReq": 49
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"smeargle": {
		"id": "smeargle",
		"name": "Smeargle",
		"description": "Pokedex Nº235 - tipo NORMAL.",
		"type": "NORMAL",
		"type2": null,
		"catchRate": 45,
		"baseExp": 106,
		"growthCurve": "FAST",
		"base": {
			"hp": 55,
			"atkFis": 20,
			"atkEsp": 20,
			"def": 35,
			"defEsp": 45,
			"speed": 75
		},
		"abilities": [
			{
				"key": "sketch",
				"levelReq": 1
			},
			{
				"key": "sketch",
				"levelReq": 11
			},
			{
				"key": "sketch",
				"levelReq": 21
			},
			{
				"key": "sketch",
				"levelReq": 31
			},
			{
				"key": "sketch",
				"levelReq": 41
			},
			{
				"key": "sketch",
				"levelReq": 51
			},
			{
				"key": "sketch",
				"levelReq": 61
			},
			{
				"key": "sketch",
				"levelReq": 71
			},
			{
				"key": "sketch",
				"levelReq": 81
			},
			{
				"key": "sketch",
				"levelReq": 91
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"miltank": {
		"id": "miltank",
		"name": "Miltank",
		"description": "Pokedex Nº241 - tipo NORMAL.",
		"type": "NORMAL",
		"type2": null,
		"catchRate": 45,
		"baseExp": 200,
		"growthCurve": "SLOW",
		"base": {
			"hp": 95,
			"atkFis": 80,
			"atkEsp": 40,
			"def": 105,
			"defEsp": 70,
			"speed": 100
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 4
			},
			{
				"key": "defense_curl",
				"levelReq": 8
			},
			{
				"key": "stomp",
				"levelReq": 13
			},
			{
				"key": "milk_drink",
				"levelReq": 19
			},
			{
				"key": "bide",
				"levelReq": 26
			},
			{
				"key": "rollout",
				"levelReq": 34
			},
			{
				"key": "body_slam",
				"levelReq": 43
			},
			{
				"key": "heal_bell",
				"levelReq": 53
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"graveler": {
		"id": "graveler",
		"name": "Graveler",
		"description": "Pokedex Nº75 - tipo ROCK/GROUND.",
		"type": "ROCK",
		"type2": "GROUND",
		"catchRate": 120,
		"baseExp": 134,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 55,
			"atkFis": 95,
			"atkEsp": 45,
			"def": 115,
			"defEsp": 45,
			"speed": 35
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "defense_curl",
				"levelReq": 1
			},
			{
				"key": "rock_throw",
				"levelReq": 1
			},
			{
				"key": "defense_curl",
				"levelReq": 6
			},
			{
				"key": "rock_throw",
				"levelReq": 11
			},
			{
				"key": "magnitude",
				"levelReq": 16
			},
			{
				"key": "selfdestruct",
				"levelReq": 21
			},
			{
				"key": "harden",
				"levelReq": 27
			},
			{
				"key": "rollout",
				"levelReq": 34
			},
			{
				"key": "earthquake",
				"levelReq": 41
			},
			{
				"key": "explosion",
				"levelReq": 48
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"golem": {
		"id": "golem",
		"name": "Golem",
		"description": "Pokedex Nº76 - tipo ROCK/GROUND.",
		"type": "ROCK",
		"type2": "GROUND",
		"catchRate": 45,
		"baseExp": 177,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 80,
			"atkFis": 110,
			"atkEsp": 55,
			"def": 130,
			"defEsp": 65,
			"speed": 45
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "defense_curl",
				"levelReq": 1
			},
			{
				"key": "rock_throw",
				"levelReq": 1
			},
			{
				"key": "magnitude",
				"levelReq": 1
			},
			{
				"key": "defense_curl",
				"levelReq": 6
			},
			{
				"key": "rock_throw",
				"levelReq": 11
			},
			{
				"key": "magnitude",
				"levelReq": 16
			},
			{
				"key": "selfdestruct",
				"levelReq": 21
			},
			{
				"key": "harden",
				"levelReq": 27
			},
			{
				"key": "rollout",
				"levelReq": 34
			},
			{
				"key": "earthquake",
				"levelReq": 41
			},
			{
				"key": "explosion",
				"levelReq": 48
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"onix": {
		"id": "onix",
		"name": "Onix",
		"description": "Pokedex Nº95 - tipo ROCK/GROUND.",
		"type": "ROCK",
		"type2": "GROUND",
		"catchRate": 45,
		"baseExp": 108,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 35,
			"atkFis": 45,
			"atkEsp": 30,
			"def": 160,
			"defEsp": 45,
			"speed": 70
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "screech",
				"levelReq": 1
			},
			{
				"key": "bind",
				"levelReq": 10
			},
			{
				"key": "rock_throw",
				"levelReq": 14
			},
			{
				"key": "harden",
				"levelReq": 23
			},
			{
				"key": "rage",
				"levelReq": 27
			},
			{
				"key": "sandstorm",
				"levelReq": 36
			},
			{
				"key": "slam",
				"levelReq": 40
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"omanyte": {
		"id": "omanyte",
		"name": "Omanyte",
		"description": "Pokedex Nº138 - tipo ROCK/WATER.",
		"type": "ROCK",
		"type2": "WATER",
		"catchRate": 45,
		"baseExp": 120,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 35,
			"atkFis": 40,
			"atkEsp": 90,
			"def": 100,
			"defEsp": 55,
			"speed": 35
		},
		"abilities": [
			{
				"key": "constrict",
				"levelReq": 1
			},
			{
				"key": "withdraw",
				"levelReq": 1
			},
			{
				"key": "bite",
				"levelReq": 13
			},
			{
				"key": "water_gun",
				"levelReq": 19
			},
			{
				"key": "leer",
				"levelReq": 31
			},
			{
				"key": "protect",
				"levelReq": 37
			},
			{
				"key": "ancientpower",
				"levelReq": 49
			},
			{
				"key": "hydro_pump",
				"levelReq": 55
			}
		],
		"evolvesTo": "omastar",
		"evolvesAtLevel": 40
	},
	"omastar": {
		"id": "omastar",
		"name": "Omastar",
		"description": "Pokedex Nº139 - tipo ROCK/WATER.",
		"type": "ROCK",
		"type2": "WATER",
		"catchRate": 45,
		"baseExp": 199,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 70,
			"atkFis": 60,
			"atkEsp": 115,
			"def": 125,
			"defEsp": 70,
			"speed": 55
		},
		"abilities": [
			{
				"key": "constrict",
				"levelReq": 1
			},
			{
				"key": "withdraw",
				"levelReq": 1
			},
			{
				"key": "bite",
				"levelReq": 1
			},
			{
				"key": "bite",
				"levelReq": 13
			},
			{
				"key": "water_gun",
				"levelReq": 19
			},
			{
				"key": "leer",
				"levelReq": 31
			},
			{
				"key": "protect",
				"levelReq": 37
			},
			{
				"key": "spike_cannon",
				"levelReq": 40
			},
			{
				"key": "ancientpower",
				"levelReq": 54
			},
			{
				"key": "hydro_pump",
				"levelReq": 65
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"kabuto": {
		"id": "kabuto",
		"name": "Kabuto",
		"description": "Pokedex Nº140 - tipo ROCK/WATER.",
		"type": "ROCK",
		"type2": "WATER",
		"catchRate": 45,
		"baseExp": 119,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 30,
			"atkFis": 80,
			"atkEsp": 55,
			"def": 90,
			"defEsp": 45,
			"speed": 55
		},
		"abilities": [
			{
				"key": "scratch",
				"levelReq": 1
			},
			{
				"key": "harden",
				"levelReq": 1
			},
			{
				"key": "absorb",
				"levelReq": 10
			},
			{
				"key": "leer",
				"levelReq": 19
			},
			{
				"key": "sand_attack",
				"levelReq": 28
			},
			{
				"key": "endure",
				"levelReq": 37
			},
			{
				"key": "mega_drain",
				"levelReq": 46
			},
			{
				"key": "ancientpower",
				"levelReq": 55
			}
		],
		"evolvesTo": "kabutops",
		"evolvesAtLevel": 40
	},
	"kabutops": {
		"id": "kabutops",
		"name": "Kabutops",
		"description": "Pokedex Nº141 - tipo ROCK/WATER.",
		"type": "ROCK",
		"type2": "WATER",
		"catchRate": 45,
		"baseExp": 201,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 60,
			"atkFis": 115,
			"atkEsp": 65,
			"def": 105,
			"defEsp": 70,
			"speed": 80
		},
		"abilities": [
			{
				"key": "scratch",
				"levelReq": 1
			},
			{
				"key": "harden",
				"levelReq": 1
			},
			{
				"key": "absorb",
				"levelReq": 1
			},
			{
				"key": "absorb",
				"levelReq": 10
			},
			{
				"key": "leer",
				"levelReq": 19
			},
			{
				"key": "sand_attack",
				"levelReq": 28
			},
			{
				"key": "endure",
				"levelReq": 37
			},
			{
				"key": "slash",
				"levelReq": 40
			},
			{
				"key": "mega_drain",
				"levelReq": 51
			},
			{
				"key": "ancientpower",
				"levelReq": 65
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"aerodactyl": {
		"id": "aerodactyl",
		"name": "Aerodactyl",
		"description": "Pokedex Nº142 - tipo ROCK/FLYING.",
		"type": "ROCK",
		"type2": "FLYING",
		"catchRate": 45,
		"baseExp": 202,
		"growthCurve": "SLOW",
		"base": {
			"hp": 80,
			"atkFis": 105,
			"atkEsp": 60,
			"def": 65,
			"defEsp": 75,
			"speed": 130
		},
		"abilities": [
			{
				"key": "wing_attack",
				"levelReq": 1
			},
			{
				"key": "agility",
				"levelReq": 8
			},
			{
				"key": "bite",
				"levelReq": 15
			},
			{
				"key": "supersonic",
				"levelReq": 22
			},
			{
				"key": "ancientpower",
				"levelReq": 29
			},
			{
				"key": "scary_face",
				"levelReq": 36
			},
			{
				"key": "take_down",
				"levelReq": 43
			},
			{
				"key": "hyper_beam",
				"levelReq": 50
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"sudowoodo": {
		"id": "sudowoodo",
		"name": "Sudowoodo",
		"description": "Pokedex Nº185 - tipo ROCK.",
		"type": "ROCK",
		"type2": null,
		"catchRate": 65,
		"baseExp": 135,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 70,
			"atkFis": 100,
			"atkEsp": 30,
			"def": 115,
			"defEsp": 65,
			"speed": 30
		},
		"abilities": [
			{
				"key": "rock_throw",
				"levelReq": 1
			},
			{
				"key": "mimic",
				"levelReq": 1
			},
			{
				"key": "flail",
				"levelReq": 10
			},
			{
				"key": "low_kick",
				"levelReq": 19
			},
			{
				"key": "rock_slide",
				"levelReq": 28
			},
			{
				"key": "faint_attack",
				"levelReq": 37
			},
			{
				"key": "slam",
				"levelReq": 46
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"larvitar": {
		"id": "larvitar",
		"name": "Larvitar",
		"description": "Pokedex Nº246 - tipo ROCK/GROUND.",
		"type": "ROCK",
		"type2": "GROUND",
		"catchRate": 45,
		"baseExp": 67,
		"growthCurve": "SLOW",
		"base": {
			"hp": 50,
			"atkFis": 64,
			"atkEsp": 45,
			"def": 50,
			"defEsp": 50,
			"speed": 41
		},
		"abilities": [
			{
				"key": "bite",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "sandstorm",
				"levelReq": 8
			},
			{
				"key": "screech",
				"levelReq": 15
			},
			{
				"key": "rock_slide",
				"levelReq": 22
			},
			{
				"key": "thrash",
				"levelReq": 29
			},
			{
				"key": "scary_face",
				"levelReq": 36
			},
			{
				"key": "crunch",
				"levelReq": 43
			},
			{
				"key": "earthquake",
				"levelReq": 50
			},
			{
				"key": "hyper_beam",
				"levelReq": 57
			}
		],
		"evolvesTo": "pupitar",
		"evolvesAtLevel": 30
	},
	"pupitar": {
		"id": "pupitar",
		"name": "Pupitar",
		"description": "Pokedex Nº247 - tipo ROCK/GROUND.",
		"type": "ROCK",
		"type2": "GROUND",
		"catchRate": 45,
		"baseExp": 144,
		"growthCurve": "SLOW",
		"base": {
			"hp": 70,
			"atkFis": 84,
			"atkEsp": 65,
			"def": 70,
			"defEsp": 70,
			"speed": 51
		},
		"abilities": [
			{
				"key": "bite",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "sandstorm",
				"levelReq": 1
			},
			{
				"key": "screech",
				"levelReq": 1
			},
			{
				"key": "sandstorm",
				"levelReq": 8
			},
			{
				"key": "screech",
				"levelReq": 15
			},
			{
				"key": "rock_slide",
				"levelReq": 22
			},
			{
				"key": "thrash",
				"levelReq": 29
			},
			{
				"key": "scary_face",
				"levelReq": 38
			},
			{
				"key": "crunch",
				"levelReq": 47
			},
			{
				"key": "earthquake",
				"levelReq": 56
			},
			{
				"key": "hyper_beam",
				"levelReq": 65
			}
		],
		"evolvesTo": "tyranitar",
		"evolvesAtLevel": 55
	},
	"tyranitar": {
		"id": "tyranitar",
		"name": "Tyranitar",
		"description": "Pokedex Nº248 - tipo ROCK/DARK.",
		"type": "ROCK",
		"type2": "DARK",
		"catchRate": 45,
		"baseExp": 218,
		"growthCurve": "SLOW",
		"base": {
			"hp": 100,
			"atkFis": 134,
			"atkEsp": 95,
			"def": 110,
			"defEsp": 100,
			"speed": 61
		},
		"abilities": [
			{
				"key": "bite",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "sandstorm",
				"levelReq": 1
			},
			{
				"key": "screech",
				"levelReq": 1
			},
			{
				"key": "sandstorm",
				"levelReq": 8
			},
			{
				"key": "screech",
				"levelReq": 15
			},
			{
				"key": "rock_slide",
				"levelReq": 22
			},
			{
				"key": "thrash",
				"levelReq": 29
			},
			{
				"key": "scary_face",
				"levelReq": 38
			},
			{
				"key": "crunch",
				"levelReq": 47
			},
			{
				"key": "earthquake",
				"levelReq": 61
			},
			{
				"key": "hyper_beam",
				"levelReq": 75
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"sandshrew": {
		"id": "sandshrew",
		"name": "Sandshrew",
		"description": "Pokedex Nº27 - tipo GROUND.",
		"type": "GROUND",
		"type2": null,
		"catchRate": 255,
		"baseExp": 93,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 50,
			"atkFis": 75,
			"atkEsp": 20,
			"def": 85,
			"defEsp": 30,
			"speed": 40
		},
		"abilities": [
			{
				"key": "scratch",
				"levelReq": 1
			},
			{
				"key": "defense_curl",
				"levelReq": 6
			},
			{
				"key": "sand_attack",
				"levelReq": 11
			},
			{
				"key": "poison_sting",
				"levelReq": 17
			},
			{
				"key": "slash",
				"levelReq": 23
			},
			{
				"key": "swift",
				"levelReq": 30
			},
			{
				"key": "fury_swipes",
				"levelReq": 37
			},
			{
				"key": "sandstorm",
				"levelReq": 45
			}
		],
		"evolvesTo": "sandslash",
		"evolvesAtLevel": 22
	},
	"sandslash": {
		"id": "sandslash",
		"name": "Sandslash",
		"description": "Pokedex Nº28 - tipo GROUND.",
		"type": "GROUND",
		"type2": null,
		"catchRate": 90,
		"baseExp": 163,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 75,
			"atkFis": 100,
			"atkEsp": 45,
			"def": 110,
			"defEsp": 55,
			"speed": 65
		},
		"abilities": [
			{
				"key": "scratch",
				"levelReq": 1
			},
			{
				"key": "defense_curl",
				"levelReq": 1
			},
			{
				"key": "sand_attack",
				"levelReq": 1
			},
			{
				"key": "defense_curl",
				"levelReq": 6
			},
			{
				"key": "sand_attack",
				"levelReq": 11
			},
			{
				"key": "poison_sting",
				"levelReq": 17
			},
			{
				"key": "slash",
				"levelReq": 24
			},
			{
				"key": "swift",
				"levelReq": 33
			},
			{
				"key": "fury_swipes",
				"levelReq": 42
			},
			{
				"key": "sandstorm",
				"levelReq": 52
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"diglett": {
		"id": "diglett",
		"name": "Diglett",
		"description": "Pokedex Nº50 - tipo GROUND.",
		"type": "GROUND",
		"type2": null,
		"catchRate": 255,
		"baseExp": 81,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 10,
			"atkFis": 55,
			"atkEsp": 35,
			"def": 25,
			"defEsp": 45,
			"speed": 95
		},
		"abilities": [
			{
				"key": "scratch",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 5
			},
			{
				"key": "magnitude",
				"levelReq": 9
			},
			{
				"key": "dig",
				"levelReq": 17
			},
			{
				"key": "sand_attack",
				"levelReq": 25
			},
			{
				"key": "slash",
				"levelReq": 33
			},
			{
				"key": "earthquake",
				"levelReq": 41
			},
			{
				"key": "fissure",
				"levelReq": 49
			}
		],
		"evolvesTo": "dugtrio",
		"evolvesAtLevel": 26
	},
	"dugtrio": {
		"id": "dugtrio",
		"name": "Dugtrio",
		"description": "Pokedex Nº51 - tipo GROUND.",
		"type": "GROUND",
		"type2": null,
		"catchRate": 50,
		"baseExp": 153,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 35,
			"atkFis": 80,
			"atkEsp": 50,
			"def": 50,
			"defEsp": 70,
			"speed": 120
		},
		"abilities": [
			{
				"key": "tri_attack",
				"levelReq": 1
			},
			{
				"key": "scratch",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "magnitude",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 5
			},
			{
				"key": "magnitude",
				"levelReq": 9
			},
			{
				"key": "dig",
				"levelReq": 17
			},
			{
				"key": "sand_attack",
				"levelReq": 25
			},
			{
				"key": "slash",
				"levelReq": 37
			},
			{
				"key": "earthquake",
				"levelReq": 49
			},
			{
				"key": "fissure",
				"levelReq": 61
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"cubone": {
		"id": "cubone",
		"name": "Cubone",
		"description": "Pokedex Nº104 - tipo GROUND.",
		"type": "GROUND",
		"type2": null,
		"catchRate": 190,
		"baseExp": 87,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 50,
			"atkFis": 50,
			"atkEsp": 40,
			"def": 95,
			"defEsp": 50,
			"speed": 35
		},
		"abilities": [
			{
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "tail_whip",
				"levelReq": 5
			},
			{
				"key": "bone_club",
				"levelReq": 9
			},
			{
				"key": "headbutt",
				"levelReq": 13
			},
			{
				"key": "leer",
				"levelReq": 17
			},
			{
				"key": "focus_energy",
				"levelReq": 21
			},
			{
				"key": "bonemerang",
				"levelReq": 25
			},
			{
				"key": "rage",
				"levelReq": 29
			},
			{
				"key": "false_swipe",
				"levelReq": 33
			},
			{
				"key": "thrash",
				"levelReq": 37
			},
			{
				"key": "bone_rush",
				"levelReq": 41
			}
		],
		"evolvesTo": "marowak",
		"evolvesAtLevel": 28
	},
	"marowak": {
		"id": "marowak",
		"name": "Marowak",
		"description": "Pokedex Nº105 - tipo GROUND.",
		"type": "GROUND",
		"type2": null,
		"catchRate": 75,
		"baseExp": 124,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 60,
			"atkFis": 80,
			"atkEsp": 50,
			"def": 110,
			"defEsp": 80,
			"speed": 45
		},
		"abilities": [
			{
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "tail_whip",
				"levelReq": 1
			},
			{
				"key": "bone_club",
				"levelReq": 1
			},
			{
				"key": "headbutt",
				"levelReq": 1
			},
			{
				"key": "tail_whip",
				"levelReq": 5
			},
			{
				"key": "bone_club",
				"levelReq": 9
			},
			{
				"key": "headbutt",
				"levelReq": 13
			},
			{
				"key": "leer",
				"levelReq": 17
			},
			{
				"key": "focus_energy",
				"levelReq": 21
			},
			{
				"key": "bonemerang",
				"levelReq": 25
			},
			{
				"key": "rage",
				"levelReq": 32
			},
			{
				"key": "false_swipe",
				"levelReq": 39
			},
			{
				"key": "thrash",
				"levelReq": 46
			},
			{
				"key": "bone_rush",
				"levelReq": 53
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"rhyhorn": {
		"id": "rhyhorn",
		"name": "Rhyhorn",
		"description": "Pokedex Nº111 - tipo GROUND/ROCK.",
		"type": "GROUND",
		"type2": "ROCK",
		"catchRate": 120,
		"baseExp": 135,
		"growthCurve": "SLOW",
		"base": {
			"hp": 80,
			"atkFis": 85,
			"atkEsp": 30,
			"def": 95,
			"defEsp": 30,
			"speed": 25
		},
		"abilities": [
			{
				"key": "horn_attack",
				"levelReq": 1
			},
			{
				"key": "tail_whip",
				"levelReq": 1
			},
			{
				"key": "stomp",
				"levelReq": 13
			},
			{
				"key": "fury_attack",
				"levelReq": 19
			},
			{
				"key": "scary_face",
				"levelReq": 31
			},
			{
				"key": "horn_drill",
				"levelReq": 37
			},
			{
				"key": "take_down",
				"levelReq": 49
			},
			{
				"key": "earthquake",
				"levelReq": 55
			}
		],
		"evolvesTo": "rhydon",
		"evolvesAtLevel": 42
	},
	"rhydon": {
		"id": "rhydon",
		"name": "Rhydon",
		"description": "Pokedex Nº112 - tipo GROUND/ROCK.",
		"type": "GROUND",
		"type2": "ROCK",
		"catchRate": 60,
		"baseExp": 204,
		"growthCurve": "SLOW",
		"base": {
			"hp": 105,
			"atkFis": 130,
			"atkEsp": 45,
			"def": 120,
			"defEsp": 45,
			"speed": 40
		},
		"abilities": [
			{
				"key": "horn_attack",
				"levelReq": 1
			},
			{
				"key": "tail_whip",
				"levelReq": 1
			},
			{
				"key": "stomp",
				"levelReq": 1
			},
			{
				"key": "fury_attack",
				"levelReq": 1
			},
			{
				"key": "stomp",
				"levelReq": 13
			},
			{
				"key": "fury_attack",
				"levelReq": 19
			},
			{
				"key": "scary_face",
				"levelReq": 31
			},
			{
				"key": "horn_drill",
				"levelReq": 37
			},
			{
				"key": "take_down",
				"levelReq": 54
			},
			{
				"key": "earthquake",
				"levelReq": 65
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"gligar": {
		"id": "gligar",
		"name": "Gligar",
		"description": "Pokedex Nº207 - tipo GROUND/FLYING.",
		"type": "GROUND",
		"type2": "FLYING",
		"catchRate": 60,
		"baseExp": 108,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 65,
			"atkFis": 75,
			"atkEsp": 35,
			"def": 105,
			"defEsp": 65,
			"speed": 85
		},
		"abilities": [
			{
				"key": "poison_sting",
				"levelReq": 1
			},
			{
				"key": "sand_attack",
				"levelReq": 6
			},
			{
				"key": "harden",
				"levelReq": 13
			},
			{
				"key": "quick_attack",
				"levelReq": 20
			},
			{
				"key": "faint_attack",
				"levelReq": 28
			},
			{
				"key": "slash",
				"levelReq": 36
			},
			{
				"key": "screech",
				"levelReq": 44
			},
			{
				"key": "guillotine",
				"levelReq": 52
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"phanpy": {
		"id": "phanpy",
		"name": "Phanpy",
		"description": "Pokedex Nº231 - tipo GROUND.",
		"type": "GROUND",
		"type2": null,
		"catchRate": 120,
		"baseExp": 124,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 90,
			"atkFis": 60,
			"atkEsp": 40,
			"def": 60,
			"defEsp": 40,
			"speed": 40
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "defense_curl",
				"levelReq": 9
			},
			{
				"key": "flail",
				"levelReq": 17
			},
			{
				"key": "take_down",
				"levelReq": 25
			},
			{
				"key": "rollout",
				"levelReq": 33
			},
			{
				"key": "endure",
				"levelReq": 41
			},
			{
				"key": "double_edge",
				"levelReq": 49
			}
		],
		"evolvesTo": "donphan",
		"evolvesAtLevel": 25
	},
	"donphan": {
		"id": "donphan",
		"name": "Donphan",
		"description": "Pokedex Nº232 - tipo GROUND.",
		"type": "GROUND",
		"type2": null,
		"catchRate": 60,
		"baseExp": 189,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 90,
			"atkFis": 120,
			"atkEsp": 60,
			"def": 120,
			"defEsp": 60,
			"speed": 50
		},
		"abilities": [
			{
				"key": "horn_attack",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "defense_curl",
				"levelReq": 9
			},
			{
				"key": "flail",
				"levelReq": 17
			},
			{
				"key": "fury_attack",
				"levelReq": 25
			},
			{
				"key": "rollout",
				"levelReq": 33
			},
			{
				"key": "rapid_spin",
				"levelReq": 41
			},
			{
				"key": "earthquake",
				"levelReq": 49
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"charmeleon": {
		"id": "charmeleon",
		"name": "Charmeleon",
		"description": "Pokedex Nº5 - tipo FIRE.",
		"type": "FIRE",
		"type2": null,
		"catchRate": 45,
		"baseExp": 142,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 58,
			"atkFis": 64,
			"atkEsp": 80,
			"def": 58,
			"defEsp": 65,
			"speed": 80
		},
		"abilities": [
			{
				"key": "scratch",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "ember",
				"levelReq": 1
			},
			{
				"key": "ember",
				"levelReq": 7
			},
			{
				"key": "smokescreen",
				"levelReq": 13
			},
			{
				"key": "rage",
				"levelReq": 20
			},
			{
				"key": "scary_face",
				"levelReq": 27
			},
			{
				"key": "flamethrower",
				"levelReq": 34
			},
			{
				"key": "slash",
				"levelReq": 41
			},
			{
				"key": "dragon_rage",
				"levelReq": 48
			},
			{
				"key": "fire_spin",
				"levelReq": 55
			}
		],
		"evolvesTo": "charizard",
		"evolvesAtLevel": 36
	},
	"charizard": {
		"id": "charizard",
		"name": "Charizard",
		"description": "Pokedex Nº6 - tipo FIRE/FLYING.",
		"type": "FIRE",
		"type2": "FLYING",
		"catchRate": 45,
		"baseExp": 209,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 78,
			"atkFis": 84,
			"atkEsp": 109,
			"def": 78,
			"defEsp": 85,
			"speed": 100
		},
		"abilities": [
			{
				"key": "scratch",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "ember",
				"levelReq": 1
			},
			{
				"key": "smokescreen",
				"levelReq": 1
			},
			{
				"key": "ember",
				"levelReq": 7
			},
			{
				"key": "smokescreen",
				"levelReq": 13
			},
			{
				"key": "rage",
				"levelReq": 20
			},
			{
				"key": "scary_face",
				"levelReq": 27
			},
			{
				"key": "flamethrower",
				"levelReq": 34
			},
			{
				"key": "wing_attack",
				"levelReq": 36
			},
			{
				"key": "slash",
				"levelReq": 44
			},
			{
				"key": "dragon_rage",
				"levelReq": 54
			},
			{
				"key": "fire_spin",
				"levelReq": 64
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"growlithe": {
		"id": "growlithe",
		"name": "Growlithe",
		"description": "Pokedex Nº58 - tipo FIRE.",
		"type": "FIRE",
		"type2": null,
		"catchRate": 190,
		"baseExp": 91,
		"growthCurve": "SLOW",
		"base": {
			"hp": 55,
			"atkFis": 70,
			"atkEsp": 70,
			"def": 45,
			"defEsp": 50,
			"speed": 60
		},
		"abilities": [
			{
				"key": "bite",
				"levelReq": 1
			},
			{
				"key": "roar",
				"levelReq": 1
			},
			{
				"key": "ember",
				"levelReq": 9
			},
			{
				"key": "leer",
				"levelReq": 18
			},
			{
				"key": "take_down",
				"levelReq": 26
			},
			{
				"key": "flame_wheel",
				"levelReq": 34
			},
			{
				"key": "agility",
				"levelReq": 42
			},
			{
				"key": "flamethrower",
				"levelReq": 50
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"arcanine": {
		"id": "arcanine",
		"name": "Arcanine",
		"description": "Pokedex Nº59 - tipo FIRE.",
		"type": "FIRE",
		"type2": null,
		"catchRate": 75,
		"baseExp": 213,
		"growthCurve": "SLOW",
		"base": {
			"hp": 90,
			"atkFis": 110,
			"atkEsp": 100,
			"def": 80,
			"defEsp": 80,
			"speed": 95
		},
		"abilities": [
			{
				"key": "roar",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "take_down",
				"levelReq": 1
			},
			{
				"key": "flame_wheel",
				"levelReq": 1
			},
			{
				"key": "extremespeed",
				"levelReq": 50
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"ponyta": {
		"id": "ponyta",
		"name": "Ponyta",
		"description": "Pokedex Nº77 - tipo FIRE.",
		"type": "FIRE",
		"type2": null,
		"catchRate": 190,
		"baseExp": 152,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 50,
			"atkFis": 85,
			"atkEsp": 65,
			"def": 55,
			"defEsp": 65,
			"speed": 90
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 4
			},
			{
				"key": "tail_whip",
				"levelReq": 8
			},
			{
				"key": "ember",
				"levelReq": 13
			},
			{
				"key": "stomp",
				"levelReq": 19
			},
			{
				"key": "fire_spin",
				"levelReq": 26
			},
			{
				"key": "take_down",
				"levelReq": 34
			},
			{
				"key": "agility",
				"levelReq": 43
			},
			{
				"key": "fire_blast",
				"levelReq": 53
			}
		],
		"evolvesTo": "rapidash",
		"evolvesAtLevel": 40
	},
	"rapidash": {
		"id": "rapidash",
		"name": "Rapidash",
		"description": "Pokedex Nº78 - tipo FIRE.",
		"type": "FIRE",
		"type2": null,
		"catchRate": 60,
		"baseExp": 192,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 65,
			"atkFis": 100,
			"atkEsp": 80,
			"def": 70,
			"defEsp": 80,
			"speed": 105
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "tail_whip",
				"levelReq": 1
			},
			{
				"key": "ember",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 4
			},
			{
				"key": "tail_whip",
				"levelReq": 8
			},
			{
				"key": "ember",
				"levelReq": 13
			},
			{
				"key": "stomp",
				"levelReq": 19
			},
			{
				"key": "fire_spin",
				"levelReq": 26
			},
			{
				"key": "take_down",
				"levelReq": 34
			},
			{
				"key": "fury_attack",
				"levelReq": 40
			},
			{
				"key": "agility",
				"levelReq": 47
			},
			{
				"key": "fire_blast",
				"levelReq": 61
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"magmar": {
		"id": "magmar",
		"name": "Magmar",
		"description": "Pokedex Nº126 - tipo FIRE.",
		"type": "FIRE",
		"type2": null,
		"catchRate": 45,
		"baseExp": 167,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 65,
			"atkFis": 95,
			"atkEsp": 100,
			"def": 57,
			"defEsp": 85,
			"speed": 93
		},
		"abilities": [
			{
				"key": "ember",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "smog",
				"levelReq": 1
			},
			{
				"key": "fire_punch",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 7
			},
			{
				"key": "smog",
				"levelReq": 13
			},
			{
				"key": "fire_punch",
				"levelReq": 19
			},
			{
				"key": "smokescreen",
				"levelReq": 25
			},
			{
				"key": "sunny_day",
				"levelReq": 33
			},
			{
				"key": "flamethrower",
				"levelReq": 41
			},
			{
				"key": "confuse_ray",
				"levelReq": 49
			},
			{
				"key": "fire_blast",
				"levelReq": 57
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"cyndaquil": {
		"id": "cyndaquil",
		"name": "Cyndaquil",
		"description": "Pokedex Nº155 - tipo FIRE.",
		"type": "FIRE",
		"type2": null,
		"catchRate": 45,
		"baseExp": 65,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 39,
			"atkFis": 52,
			"atkEsp": 60,
			"def": 43,
			"defEsp": 50,
			"speed": 65
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "smokescreen",
				"levelReq": 6
			},
			{
				"key": "ember",
				"levelReq": 12
			},
			{
				"key": "quick_attack",
				"levelReq": 19
			},
			{
				"key": "flame_wheel",
				"levelReq": 27
			},
			{
				"key": "swift",
				"levelReq": 36
			},
			{
				"key": "flamethrower",
				"levelReq": 46
			}
		],
		"evolvesTo": "quilava",
		"evolvesAtLevel": 14
	},
	"quilava": {
		"id": "quilava",
		"name": "Quilava",
		"description": "Pokedex Nº156 - tipo FIRE.",
		"type": "FIRE",
		"type2": null,
		"catchRate": 45,
		"baseExp": 142,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 58,
			"atkFis": 64,
			"atkEsp": 80,
			"def": 58,
			"defEsp": 65,
			"speed": 80
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "smokescreen",
				"levelReq": 1
			},
			{
				"key": "smokescreen",
				"levelReq": 6
			},
			{
				"key": "ember",
				"levelReq": 12
			},
			{
				"key": "quick_attack",
				"levelReq": 21
			},
			{
				"key": "flame_wheel",
				"levelReq": 31
			},
			{
				"key": "swift",
				"levelReq": 42
			},
			{
				"key": "flamethrower",
				"levelReq": 54
			}
		],
		"evolvesTo": "typhlosion",
		"evolvesAtLevel": 36
	},
	"typhlosion": {
		"id": "typhlosion",
		"name": "Typhlosion",
		"description": "Pokedex Nº157 - tipo FIRE.",
		"type": "FIRE",
		"type2": null,
		"catchRate": 45,
		"baseExp": 209,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 78,
			"atkFis": 84,
			"atkEsp": 109,
			"def": 78,
			"defEsp": 85,
			"speed": 100
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "smokescreen",
				"levelReq": 1
			},
			{
				"key": "ember",
				"levelReq": 1
			},
			{
				"key": "smokescreen",
				"levelReq": 6
			},
			{
				"key": "ember",
				"levelReq": 12
			},
			{
				"key": "quick_attack",
				"levelReq": 21
			},
			{
				"key": "flame_wheel",
				"levelReq": 31
			},
			{
				"key": "swift",
				"levelReq": 45
			},
			{
				"key": "flamethrower",
				"levelReq": 60
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"slugma": {
		"id": "slugma",
		"name": "Slugma",
		"description": "Pokedex Nº218 - tipo FIRE.",
		"type": "FIRE",
		"type2": null,
		"catchRate": 190,
		"baseExp": 78,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 40,
			"atkFis": 40,
			"atkEsp": 70,
			"def": 40,
			"defEsp": 40,
			"speed": 20
		},
		"abilities": [
			{
				"key": "smog",
				"levelReq": 1
			},
			{
				"key": "ember",
				"levelReq": 8
			},
			{
				"key": "rock_throw",
				"levelReq": 15
			},
			{
				"key": "harden",
				"levelReq": 22
			},
			{
				"key": "amnesia",
				"levelReq": 29
			},
			{
				"key": "flamethrower",
				"levelReq": 36
			},
			{
				"key": "rock_slide",
				"levelReq": 43
			},
			{
				"key": "body_slam",
				"levelReq": 50
			}
		],
		"evolvesTo": "magcargo",
		"evolvesAtLevel": 38
	},
	"magcargo": {
		"id": "magcargo",
		"name": "Magcargo",
		"description": "Pokedex Nº219 - tipo FIRE/ROCK.",
		"type": "FIRE",
		"type2": "ROCK",
		"catchRate": 75,
		"baseExp": 154,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 50,
			"atkFis": 50,
			"atkEsp": 80,
			"def": 120,
			"defEsp": 80,
			"speed": 30
		},
		"abilities": [
			{
				"key": "smog",
				"levelReq": 1
			},
			{
				"key": "ember",
				"levelReq": 1
			},
			{
				"key": "rock_throw",
				"levelReq": 1
			},
			{
				"key": "ember",
				"levelReq": 8
			},
			{
				"key": "rock_throw",
				"levelReq": 15
			},
			{
				"key": "harden",
				"levelReq": 22
			},
			{
				"key": "amnesia",
				"levelReq": 29
			},
			{
				"key": "flamethrower",
				"levelReq": 36
			},
			{
				"key": "rock_slide",
				"levelReq": 48
			},
			{
				"key": "body_slam",
				"levelReq": 60
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"magby": {
		"id": "magby",
		"name": "Magby",
		"description": "Pokedex Nº240 - tipo FIRE.",
		"type": "FIRE",
		"type2": null,
		"catchRate": 45,
		"baseExp": 117,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 45,
			"atkFis": 75,
			"atkEsp": 70,
			"def": 37,
			"defEsp": 55,
			"speed": 83
		},
		"abilities": [
			{
				"key": "ember",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 7
			},
			{
				"key": "smog",
				"levelReq": 13
			},
			{
				"key": "fire_punch",
				"levelReq": 19
			},
			{
				"key": "smokescreen",
				"levelReq": 25
			},
			{
				"key": "sunny_day",
				"levelReq": 31
			},
			{
				"key": "flamethrower",
				"levelReq": 37
			},
			{
				"key": "confuse_ray",
				"levelReq": 43
			},
			{
				"key": "fire_blast",
				"levelReq": 49
			}
		],
		"evolvesTo": "magmar",
		"evolvesAtLevel": 30
	},
	"pikachu": {
		"id": "pikachu",
		"name": "Pikachu",
		"description": "Pokedex Nº25 - tipo ELECTRIC.",
		"type": "ELECTRIC",
		"type2": null,
		"catchRate": 190,
		"baseExp": 82,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 35,
			"atkFis": 55,
			"atkEsp": 50,
			"def": 30,
			"defEsp": 40,
			"speed": 90
		},
		"abilities": [
			{
				"key": "thundershock",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "tail_whip",
				"levelReq": 6
			},
			{
				"key": "thunder_wave",
				"levelReq": 8
			},
			{
				"key": "quick_attack",
				"levelReq": 11
			},
			{
				"key": "double_team",
				"levelReq": 15
			},
			{
				"key": "slam",
				"levelReq": 20
			},
			{
				"key": "thunderbolt",
				"levelReq": 26
			},
			{
				"key": "agility",
				"levelReq": 33
			},
			{
				"key": "thunder",
				"levelReq": 41
			},
			{
				"key": "light_screen",
				"levelReq": 50
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"magnemite": {
		"id": "magnemite",
		"name": "Magnemite",
		"description": "Pokedex Nº81 - tipo ELECTRIC/STEEL.",
		"type": "ELECTRIC",
		"type2": "STEEL",
		"catchRate": 190,
		"baseExp": 89,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 25,
			"atkFis": 35,
			"atkEsp": 95,
			"def": 70,
			"defEsp": 55,
			"speed": 45
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "thundershock",
				"levelReq": 6
			},
			{
				"key": "supersonic",
				"levelReq": 11
			},
			{
				"key": "sonicboom",
				"levelReq": 16
			},
			{
				"key": "thunder_wave",
				"levelReq": 21
			},
			{
				"key": "lock_on",
				"levelReq": 27
			},
			{
				"key": "swift",
				"levelReq": 33
			},
			{
				"key": "screech",
				"levelReq": 39
			},
			{
				"key": "zap_cannon",
				"levelReq": 45
			}
		],
		"evolvesTo": "magneton",
		"evolvesAtLevel": 30
	},
	"magneton": {
		"id": "magneton",
		"name": "Magneton",
		"description": "Pokedex Nº82 - tipo ELECTRIC/STEEL.",
		"type": "ELECTRIC",
		"type2": "STEEL",
		"catchRate": 60,
		"baseExp": 161,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 50,
			"atkFis": 60,
			"atkEsp": 120,
			"def": 95,
			"defEsp": 70,
			"speed": 70
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "thundershock",
				"levelReq": 1
			},
			{
				"key": "supersonic",
				"levelReq": 1
			},
			{
				"key": "sonicboom",
				"levelReq": 1
			},
			{
				"key": "thundershock",
				"levelReq": 6
			},
			{
				"key": "supersonic",
				"levelReq": 11
			},
			{
				"key": "sonicboom",
				"levelReq": 16
			},
			{
				"key": "thunder_wave",
				"levelReq": 21
			},
			{
				"key": "lock_on",
				"levelReq": 27
			},
			{
				"key": "tri_attack",
				"levelReq": 35
			},
			{
				"key": "screech",
				"levelReq": 43
			},
			{
				"key": "zap_cannon",
				"levelReq": 53
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"voltorb": {
		"id": "voltorb",
		"name": "Voltorb",
		"description": "Pokedex Nº100 - tipo ELECTRIC.",
		"type": "ELECTRIC",
		"type2": null,
		"catchRate": 190,
		"baseExp": 103,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 40,
			"atkFis": 30,
			"atkEsp": 55,
			"def": 50,
			"defEsp": 55,
			"speed": 100
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "screech",
				"levelReq": 9
			},
			{
				"key": "sonicboom",
				"levelReq": 17
			},
			{
				"key": "selfdestruct",
				"levelReq": 23
			},
			{
				"key": "rollout",
				"levelReq": 29
			},
			{
				"key": "light_screen",
				"levelReq": 33
			},
			{
				"key": "swift",
				"levelReq": 37
			},
			{
				"key": "explosion",
				"levelReq": 39
			},
			{
				"key": "mirror_coat",
				"levelReq": 41
			}
		],
		"evolvesTo": "electrode",
		"evolvesAtLevel": 30
	},
	"electrode": {
		"id": "electrode",
		"name": "Electrode",
		"description": "Pokedex Nº101 - tipo ELECTRIC.",
		"type": "ELECTRIC",
		"type2": null,
		"catchRate": 60,
		"baseExp": 150,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 60,
			"atkFis": 50,
			"atkEsp": 80,
			"def": 70,
			"defEsp": 80,
			"speed": 140
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "screech",
				"levelReq": 1
			},
			{
				"key": "sonicboom",
				"levelReq": 1
			},
			{
				"key": "selfdestruct",
				"levelReq": 1
			},
			{
				"key": "screech",
				"levelReq": 9
			},
			{
				"key": "sonicboom",
				"levelReq": 17
			},
			{
				"key": "selfdestruct",
				"levelReq": 23
			},
			{
				"key": "rollout",
				"levelReq": 29
			},
			{
				"key": "light_screen",
				"levelReq": 34
			},
			{
				"key": "swift",
				"levelReq": 40
			},
			{
				"key": "explosion",
				"levelReq": 44
			},
			{
				"key": "mirror_coat",
				"levelReq": 48
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"electabuzz": {
		"id": "electabuzz",
		"name": "Electabuzz",
		"description": "Pokedex Nº125 - tipo ELECTRIC.",
		"type": "ELECTRIC",
		"type2": null,
		"catchRate": 45,
		"baseExp": 156,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 65,
			"atkFis": 83,
			"atkEsp": 95,
			"def": 57,
			"defEsp": 85,
			"speed": 105
		},
		"abilities": [
			{
				"key": "quick_attack",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "thunderpunch",
				"levelReq": 1
			},
			{
				"key": "thunderpunch",
				"levelReq": 9
			},
			{
				"key": "light_screen",
				"levelReq": 17
			},
			{
				"key": "swift",
				"levelReq": 25
			},
			{
				"key": "screech",
				"levelReq": 36
			},
			{
				"key": "thunderbolt",
				"levelReq": 47
			},
			{
				"key": "thunder",
				"levelReq": 58
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"pichu": {
		"id": "pichu",
		"name": "Pichu",
		"description": "Pokedex Nº172 - tipo ELECTRIC.",
		"type": "ELECTRIC",
		"type2": null,
		"catchRate": 190,
		"baseExp": 42,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 20,
			"atkFis": 40,
			"atkEsp": 35,
			"def": 15,
			"defEsp": 35,
			"speed": 60
		},
		"abilities": [
			{
				"key": "thundershock",
				"levelReq": 1
			},
			{
				"key": "charm",
				"levelReq": 1
			},
			{
				"key": "tail_whip",
				"levelReq": 6
			},
			{
				"key": "thunder_wave",
				"levelReq": 8
			},
			{
				"key": "sweet_kiss",
				"levelReq": 11
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"mareep": {
		"id": "mareep",
		"name": "Mareep",
		"description": "Pokedex Nº179 - tipo ELECTRIC.",
		"type": "ELECTRIC",
		"type2": null,
		"catchRate": 235,
		"baseExp": 59,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 55,
			"atkFis": 40,
			"atkEsp": 65,
			"def": 40,
			"defEsp": 45,
			"speed": 35
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "thundershock",
				"levelReq": 9
			},
			{
				"key": "thunder_wave",
				"levelReq": 16
			},
			{
				"key": "cotton_spore",
				"levelReq": 23
			},
			{
				"key": "light_screen",
				"levelReq": 30
			},
			{
				"key": "thunder",
				"levelReq": 37
			}
		],
		"evolvesTo": "flaaffy",
		"evolvesAtLevel": 15
	},
	"flaaffy": {
		"id": "flaaffy",
		"name": "Flaaffy",
		"description": "Pokedex Nº180 - tipo ELECTRIC.",
		"type": "ELECTRIC",
		"type2": null,
		"catchRate": 120,
		"baseExp": 117,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 70,
			"atkFis": 55,
			"atkEsp": 80,
			"def": 55,
			"defEsp": 60,
			"speed": 45
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "thundershock",
				"levelReq": 1
			},
			{
				"key": "thundershock",
				"levelReq": 9
			},
			{
				"key": "thunder_wave",
				"levelReq": 18
			},
			{
				"key": "cotton_spore",
				"levelReq": 27
			},
			{
				"key": "light_screen",
				"levelReq": 36
			},
			{
				"key": "thunder",
				"levelReq": 45
			}
		],
		"evolvesTo": "ampharos",
		"evolvesAtLevel": 30
	},
	"ampharos": {
		"id": "ampharos",
		"name": "Ampharos",
		"description": "Pokedex Nº181 - tipo ELECTRIC.",
		"type": "ELECTRIC",
		"type2": null,
		"catchRate": 45,
		"baseExp": 194,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 90,
			"atkFis": 75,
			"atkEsp": 115,
			"def": 75,
			"defEsp": 90,
			"speed": 55
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "thundershock",
				"levelReq": 1
			},
			{
				"key": "thunder_wave",
				"levelReq": 1
			},
			{
				"key": "thundershock",
				"levelReq": 9
			},
			{
				"key": "thunder_wave",
				"levelReq": 18
			},
			{
				"key": "cotton_spore",
				"levelReq": 27
			},
			{
				"key": "thunderpunch",
				"levelReq": 30
			},
			{
				"key": "light_screen",
				"levelReq": 42
			},
			{
				"key": "thunder",
				"levelReq": 57
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"elekid": {
		"id": "elekid",
		"name": "Elekid",
		"description": "Pokedex Nº239 - tipo ELECTRIC.",
		"type": "ELECTRIC",
		"type2": null,
		"catchRate": 45,
		"baseExp": 106,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 45,
			"atkFis": 63,
			"atkEsp": 65,
			"def": 37,
			"defEsp": 55,
			"speed": 95
		},
		"abilities": [
			{
				"key": "quick_attack",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "thunderpunch",
				"levelReq": 9
			},
			{
				"key": "light_screen",
				"levelReq": 17
			},
			{
				"key": "swift",
				"levelReq": 25
			},
			{
				"key": "screech",
				"levelReq": 33
			},
			{
				"key": "thunderbolt",
				"levelReq": 41
			},
			{
				"key": "thunder",
				"levelReq": 49
			}
		],
		"evolvesTo": "electabuzz",
		"evolvesAtLevel": 30
	},
	"ekans": {
		"id": "ekans",
		"name": "Ekans",
		"description": "Pokedex Nº23 - tipo POISON.",
		"type": "POISON",
		"type2": null,
		"catchRate": 255,
		"baseExp": 62,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 35,
			"atkFis": 60,
			"atkEsp": 40,
			"def": 44,
			"defEsp": 54,
			"speed": 55
		},
		"abilities": [
			{
				"key": "wrap",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "poison_sting",
				"levelReq": 9
			},
			{
				"key": "bite",
				"levelReq": 15
			},
			{
				"key": "glare",
				"levelReq": 23
			},
			{
				"key": "screech",
				"levelReq": 29
			},
			{
				"key": "acid",
				"levelReq": 37
			},
			{
				"key": "haze",
				"levelReq": 43
			}
		],
		"evolvesTo": "arbok",
		"evolvesAtLevel": 22
	},
	"arbok": {
		"id": "arbok",
		"name": "Arbok",
		"description": "Pokedex Nº24 - tipo POISON.",
		"type": "POISON",
		"type2": null,
		"catchRate": 90,
		"baseExp": 147,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 60,
			"atkFis": 85,
			"atkEsp": 65,
			"def": 69,
			"defEsp": 79,
			"speed": 80
		},
		"abilities": [
			{
				"key": "wrap",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "poison_sting",
				"levelReq": 1
			},
			{
				"key": "bite",
				"levelReq": 1
			},
			{
				"key": "poison_sting",
				"levelReq": 9
			},
			{
				"key": "bite",
				"levelReq": 15
			},
			{
				"key": "glare",
				"levelReq": 25
			},
			{
				"key": "screech",
				"levelReq": 33
			},
			{
				"key": "acid",
				"levelReq": 43
			},
			{
				"key": "haze",
				"levelReq": 51
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"nidoran_f": {
		"id": "nidoran_f",
		"name": "Nidoran♀",
		"description": "Pokedex Nº29 - tipo POISON.",
		"type": "POISON",
		"type2": null,
		"catchRate": 235,
		"baseExp": 59,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 55,
			"atkFis": 47,
			"atkEsp": 40,
			"def": 52,
			"defEsp": 40,
			"speed": 41
		},
		"abilities": [
			{
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "scratch",
				"levelReq": 8
			},
			{
				"key": "double_kick",
				"levelReq": 12
			},
			{
				"key": "poison_sting",
				"levelReq": 17
			},
			{
				"key": "tail_whip",
				"levelReq": 23
			},
			{
				"key": "bite",
				"levelReq": 30
			},
			{
				"key": "fury_swipes",
				"levelReq": 38
			}
		],
		"evolvesTo": "nidorina",
		"evolvesAtLevel": 16
	},
	"nidorina": {
		"id": "nidorina",
		"name": "Nidorina",
		"description": "Pokedex Nº30 - tipo POISON.",
		"type": "POISON",
		"type2": null,
		"catchRate": 120,
		"baseExp": 117,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 70,
			"atkFis": 62,
			"atkEsp": 55,
			"def": 67,
			"defEsp": 55,
			"speed": 56
		},
		"abilities": [
			{
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "scratch",
				"levelReq": 8
			},
			{
				"key": "double_kick",
				"levelReq": 12
			},
			{
				"key": "poison_sting",
				"levelReq": 19
			},
			{
				"key": "tail_whip",
				"levelReq": 27
			},
			{
				"key": "bite",
				"levelReq": 36
			},
			{
				"key": "fury_swipes",
				"levelReq": 46
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"nidoqueen": {
		"id": "nidoqueen",
		"name": "Nidoqueen",
		"description": "Pokedex Nº31 - tipo POISON/GROUND.",
		"type": "POISON",
		"type2": "GROUND",
		"catchRate": 45,
		"baseExp": 194,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 90,
			"atkFis": 82,
			"atkEsp": 75,
			"def": 87,
			"defEsp": 85,
			"speed": 76
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "scratch",
				"levelReq": 1
			},
			{
				"key": "double_kick",
				"levelReq": 1
			},
			{
				"key": "tail_whip",
				"levelReq": 1
			},
			{
				"key": "body_slam",
				"levelReq": 23
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"nidoran_m": {
		"id": "nidoran_m",
		"name": "Nidoran♂",
		"description": "Pokedex Nº32 - tipo POISON.",
		"type": "POISON",
		"type2": null,
		"catchRate": 235,
		"baseExp": 60,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 46,
			"atkFis": 57,
			"atkEsp": 40,
			"def": 40,
			"defEsp": 40,
			"speed": 50
		},
		"abilities": [
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "horn_attack",
				"levelReq": 8
			},
			{
				"key": "double_kick",
				"levelReq": 12
			},
			{
				"key": "poison_sting",
				"levelReq": 17
			},
			{
				"key": "focus_energy",
				"levelReq": 23
			},
			{
				"key": "fury_attack",
				"levelReq": 30
			},
			{
				"key": "horn_drill",
				"levelReq": 38
			}
		],
		"evolvesTo": "nidorino",
		"evolvesAtLevel": 16
	},
	"nidorino": {
		"id": "nidorino",
		"name": "Nidorino",
		"description": "Pokedex Nº33 - tipo POISON.",
		"type": "POISON",
		"type2": null,
		"catchRate": 120,
		"baseExp": 118,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 61,
			"atkFis": 72,
			"atkEsp": 55,
			"def": 57,
			"defEsp": 55,
			"speed": 65
		},
		"abilities": [
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "horn_attack",
				"levelReq": 8
			},
			{
				"key": "double_kick",
				"levelReq": 12
			},
			{
				"key": "poison_sting",
				"levelReq": 19
			},
			{
				"key": "focus_energy",
				"levelReq": 27
			},
			{
				"key": "fury_attack",
				"levelReq": 36
			},
			{
				"key": "horn_drill",
				"levelReq": 46
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"nidoking": {
		"id": "nidoking",
		"name": "Nidoking",
		"description": "Pokedex Nº34 - tipo POISON/GROUND.",
		"type": "POISON",
		"type2": "GROUND",
		"catchRate": 45,
		"baseExp": 195,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 81,
			"atkFis": 92,
			"atkEsp": 85,
			"def": 77,
			"defEsp": 75,
			"speed": 85
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "horn_attack",
				"levelReq": 1
			},
			{
				"key": "double_kick",
				"levelReq": 1
			},
			{
				"key": "poison_sting",
				"levelReq": 1
			},
			{
				"key": "thrash",
				"levelReq": 23
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"zubat": {
		"id": "zubat",
		"name": "Zubat",
		"description": "Pokedex Nº41 - tipo POISON/FLYING.",
		"type": "POISON",
		"type2": "FLYING",
		"catchRate": 255,
		"baseExp": 54,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 40,
			"atkFis": 45,
			"atkEsp": 30,
			"def": 35,
			"defEsp": 40,
			"speed": 55
		},
		"abilities": [
			{
				"key": "leech_life",
				"levelReq": 1
			},
			{
				"key": "supersonic",
				"levelReq": 6
			},
			{
				"key": "bite",
				"levelReq": 12
			},
			{
				"key": "confuse_ray",
				"levelReq": 19
			},
			{
				"key": "wing_attack",
				"levelReq": 27
			},
			{
				"key": "mean_look",
				"levelReq": 36
			},
			{
				"key": "haze",
				"levelReq": 46
			}
		],
		"evolvesTo": "golbat",
		"evolvesAtLevel": 22
	},
	"golbat": {
		"id": "golbat",
		"name": "Golbat",
		"description": "Pokedex Nº42 - tipo POISON/FLYING.",
		"type": "POISON",
		"type2": "FLYING",
		"catchRate": 90,
		"baseExp": 171,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 75,
			"atkFis": 80,
			"atkEsp": 65,
			"def": 70,
			"defEsp": 75,
			"speed": 90
		},
		"abilities": [
			{
				"key": "screech",
				"levelReq": 1
			},
			{
				"key": "leech_life",
				"levelReq": 1
			},
			{
				"key": "supersonic",
				"levelReq": 1
			},
			{
				"key": "supersonic",
				"levelReq": 6
			},
			{
				"key": "bite",
				"levelReq": 12
			},
			{
				"key": "confuse_ray",
				"levelReq": 19
			},
			{
				"key": "wing_attack",
				"levelReq": 30
			},
			{
				"key": "mean_look",
				"levelReq": 42
			},
			{
				"key": "haze",
				"levelReq": 55
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"grimer": {
		"id": "grimer",
		"name": "Grimer",
		"description": "Pokedex Nº88 - tipo POISON.",
		"type": "POISON",
		"type2": null,
		"catchRate": 190,
		"baseExp": 90,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 80,
			"atkFis": 80,
			"atkEsp": 40,
			"def": 50,
			"defEsp": 50,
			"speed": 25
		},
		"abilities": [
			{
				"key": "poison_gas",
				"levelReq": 1
			},
			{
				"key": "pound",
				"levelReq": 1
			},
			{
				"key": "harden",
				"levelReq": 5
			},
			{
				"key": "disable",
				"levelReq": 10
			},
			{
				"key": "sludge",
				"levelReq": 16
			},
			{
				"key": "minimize",
				"levelReq": 23
			},
			{
				"key": "screech",
				"levelReq": 31
			},
			{
				"key": "acid_armor",
				"levelReq": 40
			},
			{
				"key": "sludge_bomb",
				"levelReq": 50
			}
		],
		"evolvesTo": "muk",
		"evolvesAtLevel": 38
	},
	"muk": {
		"id": "muk",
		"name": "Muk",
		"description": "Pokedex Nº89 - tipo POISON.",
		"type": "POISON",
		"type2": null,
		"catchRate": 75,
		"baseExp": 157,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 105,
			"atkFis": 105,
			"atkEsp": 65,
			"def": 75,
			"defEsp": 100,
			"speed": 50
		},
		"abilities": [
			{
				"key": "poison_gas",
				"levelReq": 1
			},
			{
				"key": "pound",
				"levelReq": 1
			},
			{
				"key": "harden",
				"levelReq": 1
			},
			{
				"key": "minimize",
				"levelReq": 23
			},
			{
				"key": "screech",
				"levelReq": 31
			},
			{
				"key": "harden",
				"levelReq": 33
			},
			{
				"key": "disable",
				"levelReq": 37
			},
			{
				"key": "sludge",
				"levelReq": 45
			},
			{
				"key": "acid_armor",
				"levelReq": 45
			},
			{
				"key": "sludge_bomb",
				"levelReq": 60
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"koffing": {
		"id": "koffing",
		"name": "Koffing",
		"description": "Pokedex Nº109 - tipo POISON.",
		"type": "POISON",
		"type2": null,
		"catchRate": 190,
		"baseExp": 114,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 40,
			"atkFis": 65,
			"atkEsp": 60,
			"def": 95,
			"defEsp": 45,
			"speed": 35
		},
		"abilities": [
			{
				"key": "poison_gas",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "smog",
				"levelReq": 9
			},
			{
				"key": "selfdestruct",
				"levelReq": 17
			},
			{
				"key": "sludge",
				"levelReq": 21
			},
			{
				"key": "smokescreen",
				"levelReq": 25
			},
			{
				"key": "haze",
				"levelReq": 33
			},
			{
				"key": "explosion",
				"levelReq": 41
			},
			{
				"key": "destiny_bond",
				"levelReq": 45
			}
		],
		"evolvesTo": "weezing",
		"evolvesAtLevel": 35
	},
	"weezing": {
		"id": "weezing",
		"name": "Weezing",
		"description": "Pokedex Nº110 - tipo POISON.",
		"type": "POISON",
		"type2": null,
		"catchRate": 60,
		"baseExp": 173,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 65,
			"atkFis": 90,
			"atkEsp": 85,
			"def": 120,
			"defEsp": 70,
			"speed": 60
		},
		"abilities": [
			{
				"key": "poison_gas",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "smog",
				"levelReq": 1
			},
			{
				"key": "selfdestruct",
				"levelReq": 1
			},
			{
				"key": "smog",
				"levelReq": 9
			},
			{
				"key": "selfdestruct",
				"levelReq": 17
			},
			{
				"key": "sludge",
				"levelReq": 21
			},
			{
				"key": "smokescreen",
				"levelReq": 25
			},
			{
				"key": "haze",
				"levelReq": 33
			},
			{
				"key": "explosion",
				"levelReq": 44
			},
			{
				"key": "destiny_bond",
				"levelReq": 51
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"mankey": {
		"id": "mankey",
		"name": "Mankey",
		"description": "Pokedex Nº56 - tipo FIGHTING.",
		"type": "FIGHTING",
		"type2": null,
		"catchRate": 190,
		"baseExp": 74,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 40,
			"atkFis": 80,
			"atkEsp": 35,
			"def": 35,
			"defEsp": 45,
			"speed": 70
		},
		"abilities": [
			{
				"key": "scratch",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "low_kick",
				"levelReq": 9
			},
			{
				"key": "karate_chop",
				"levelReq": 15
			},
			{
				"key": "fury_swipes",
				"levelReq": 21
			},
			{
				"key": "focus_energy",
				"levelReq": 27
			},
			{
				"key": "seismic_toss",
				"levelReq": 33
			},
			{
				"key": "cross_chop",
				"levelReq": 39
			},
			{
				"key": "screech",
				"levelReq": 45
			},
			{
				"key": "thrash",
				"levelReq": 51
			}
		],
		"evolvesTo": "primeape",
		"evolvesAtLevel": 28
	},
	"primeape": {
		"id": "primeape",
		"name": "Primeape",
		"description": "Pokedex Nº57 - tipo FIGHTING.",
		"type": "FIGHTING",
		"type2": null,
		"catchRate": 75,
		"baseExp": 149,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 65,
			"atkFis": 105,
			"atkEsp": 60,
			"def": 60,
			"defEsp": 70,
			"speed": 95
		},
		"abilities": [
			{
				"key": "scratch",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "low_kick",
				"levelReq": 1
			},
			{
				"key": "rage",
				"levelReq": 1
			},
			{
				"key": "low_kick",
				"levelReq": 9
			},
			{
				"key": "karate_chop",
				"levelReq": 15
			},
			{
				"key": "fury_swipes",
				"levelReq": 21
			},
			{
				"key": "focus_energy",
				"levelReq": 27
			},
			{
				"key": "rage",
				"levelReq": 28
			},
			{
				"key": "seismic_toss",
				"levelReq": 36
			},
			{
				"key": "cross_chop",
				"levelReq": 45
			},
			{
				"key": "screech",
				"levelReq": 54
			},
			{
				"key": "thrash",
				"levelReq": 63
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"machop": {
		"id": "machop",
		"name": "Machop",
		"description": "Pokedex Nº66 - tipo FIGHTING.",
		"type": "FIGHTING",
		"type2": null,
		"catchRate": 180,
		"baseExp": 88,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 70,
			"atkFis": 80,
			"atkEsp": 35,
			"def": 50,
			"defEsp": 35,
			"speed": 35
		},
		"abilities": [
			{
				"key": "low_kick",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "focus_energy",
				"levelReq": 7
			},
			{
				"key": "karate_chop",
				"levelReq": 13
			},
			{
				"key": "seismic_toss",
				"levelReq": 19
			},
			{
				"key": "foresight",
				"levelReq": 25
			},
			{
				"key": "vital_throw",
				"levelReq": 31
			},
			{
				"key": "cross_chop",
				"levelReq": 37
			},
			{
				"key": "scary_face",
				"levelReq": 43
			},
			{
				"key": "submission",
				"levelReq": 49
			}
		],
		"evolvesTo": "machoke",
		"evolvesAtLevel": 28
	},
	"machoke": {
		"id": "machoke",
		"name": "Machoke",
		"description": "Pokedex Nº67 - tipo FIGHTING.",
		"type": "FIGHTING",
		"type2": null,
		"catchRate": 90,
		"baseExp": 146,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 80,
			"atkFis": 100,
			"atkEsp": 50,
			"def": 70,
			"defEsp": 60,
			"speed": 45
		},
		"abilities": [
			{
				"key": "low_kick",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "focus_energy",
				"levelReq": 1
			},
			{
				"key": "focus_energy",
				"levelReq": 8
			},
			{
				"key": "karate_chop",
				"levelReq": 15
			},
			{
				"key": "seismic_toss",
				"levelReq": 19
			},
			{
				"key": "foresight",
				"levelReq": 25
			},
			{
				"key": "vital_throw",
				"levelReq": 34
			},
			{
				"key": "cross_chop",
				"levelReq": 43
			},
			{
				"key": "scary_face",
				"levelReq": 52
			},
			{
				"key": "submission",
				"levelReq": 61
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"machamp": {
		"id": "machamp",
		"name": "Machamp",
		"description": "Pokedex Nº68 - tipo FIGHTING.",
		"type": "FIGHTING",
		"type2": null,
		"catchRate": 45,
		"baseExp": 193,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 90,
			"atkFis": 130,
			"atkEsp": 65,
			"def": 80,
			"defEsp": 85,
			"speed": 55
		},
		"abilities": [
			{
				"key": "low_kick",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "focus_energy",
				"levelReq": 1
			},
			{
				"key": "focus_energy",
				"levelReq": 8
			},
			{
				"key": "karate_chop",
				"levelReq": 15
			},
			{
				"key": "seismic_toss",
				"levelReq": 19
			},
			{
				"key": "foresight",
				"levelReq": 25
			},
			{
				"key": "vital_throw",
				"levelReq": 34
			},
			{
				"key": "cross_chop",
				"levelReq": 43
			},
			{
				"key": "scary_face",
				"levelReq": 52
			},
			{
				"key": "submission",
				"levelReq": 61
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"hitmonlee": {
		"id": "hitmonlee",
		"name": "Hitmonlee",
		"description": "Pokedex Nº106 - tipo FIGHTING.",
		"type": "FIGHTING",
		"type2": null,
		"catchRate": 45,
		"baseExp": 139,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 50,
			"atkFis": 120,
			"atkEsp": 35,
			"def": 53,
			"defEsp": 110,
			"speed": 87
		},
		"abilities": [
			{
				"key": "double_kick",
				"levelReq": 1
			},
			{
				"key": "meditate",
				"levelReq": 6
			},
			{
				"key": "rolling_kick",
				"levelReq": 11
			},
			{
				"key": "jump_kick",
				"levelReq": 16
			},
			{
				"key": "focus_energy",
				"levelReq": 21
			},
			{
				"key": "hi_jump_kick",
				"levelReq": 26
			},
			{
				"key": "mind_reader",
				"levelReq": 31
			},
			{
				"key": "foresight",
				"levelReq": 36
			},
			{
				"key": "endure",
				"levelReq": 41
			},
			{
				"key": "mega_kick",
				"levelReq": 46
			},
			{
				"key": "reversal",
				"levelReq": 51
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"hitmonchan": {
		"id": "hitmonchan",
		"name": "Hitmonchan",
		"description": "Pokedex Nº107 - tipo FIGHTING.",
		"type": "FIGHTING",
		"type2": null,
		"catchRate": 45,
		"baseExp": 140,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 50,
			"atkFis": 105,
			"atkEsp": 35,
			"def": 79,
			"defEsp": 110,
			"speed": 76
		},
		"abilities": [
			{
				"key": "comet_punch",
				"levelReq": 1
			},
			{
				"key": "agility",
				"levelReq": 7
			},
			{
				"key": "pursuit",
				"levelReq": 13
			},
			{
				"key": "thunderpunch",
				"levelReq": 26
			},
			{
				"key": "ice_punch",
				"levelReq": 26
			},
			{
				"key": "fire_punch",
				"levelReq": 26
			},
			{
				"key": "mach_punch",
				"levelReq": 32
			},
			{
				"key": "mega_punch",
				"levelReq": 38
			},
			{
				"key": "detect",
				"levelReq": 44
			},
			{
				"key": "counter",
				"levelReq": 50
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"tyrogue": {
		"id": "tyrogue",
		"name": "Tyrogue",
		"description": "Pokedex Nº236 - tipo FIGHTING.",
		"type": "FIGHTING",
		"type2": null,
		"catchRate": 75,
		"baseExp": 91,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 35,
			"atkFis": 35,
			"atkEsp": 35,
			"def": 35,
			"defEsp": 35,
			"speed": 35
		},
		"abilities": [{
			"key": "tackle",
			"levelReq": 1
		}],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"jynx": {
		"id": "jynx",
		"name": "Jynx",
		"description": "Pokedex Nº124 - tipo ICE/PSYCHIC.",
		"type": "ICE",
		"type2": "PSYCHIC",
		"catchRate": 45,
		"baseExp": 137,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 65,
			"atkFis": 50,
			"atkEsp": 115,
			"def": 35,
			"defEsp": 95,
			"speed": 95
		},
		"abilities": [
			{
				"key": "pound",
				"levelReq": 1
			},
			{
				"key": "lick",
				"levelReq": 1
			},
			{
				"key": "lovely_kiss",
				"levelReq": 1
			},
			{
				"key": "powder_snow",
				"levelReq": 1
			},
			{
				"key": "lovely_kiss",
				"levelReq": 9
			},
			{
				"key": "powder_snow",
				"levelReq": 13
			},
			{
				"key": "doubleslap",
				"levelReq": 21
			},
			{
				"key": "ice_punch",
				"levelReq": 25
			},
			{
				"key": "mean_look",
				"levelReq": 35
			},
			{
				"key": "body_slam",
				"levelReq": 41
			},
			{
				"key": "perish_song",
				"levelReq": 51
			},
			{
				"key": "blizzard",
				"levelReq": 57
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"swinub": {
		"id": "swinub",
		"name": "Swinub",
		"description": "Pokedex Nº220 - tipo ICE/GROUND.",
		"type": "ICE",
		"type2": "GROUND",
		"catchRate": 225,
		"baseExp": 78,
		"growthCurve": "SLOW",
		"base": {
			"hp": 50,
			"atkFis": 50,
			"atkEsp": 30,
			"def": 40,
			"defEsp": 30,
			"speed": 50
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "powder_snow",
				"levelReq": 10
			},
			{
				"key": "endure",
				"levelReq": 19
			},
			{
				"key": "take_down",
				"levelReq": 28
			},
			{
				"key": "mist",
				"levelReq": 37
			},
			{
				"key": "blizzard",
				"levelReq": 46
			},
			{
				"key": "amnesia",
				"levelReq": 55
			}
		],
		"evolvesTo": "piloswine",
		"evolvesAtLevel": 33
	},
	"piloswine": {
		"id": "piloswine",
		"name": "Piloswine",
		"description": "Pokedex Nº221 - tipo ICE/GROUND.",
		"type": "ICE",
		"type2": "GROUND",
		"catchRate": 75,
		"baseExp": 160,
		"growthCurve": "SLOW",
		"base": {
			"hp": 100,
			"atkFis": 100,
			"atkEsp": 60,
			"def": 80,
			"defEsp": 60,
			"speed": 50
		},
		"abilities": [
			{
				"key": "horn_attack",
				"levelReq": 1
			},
			{
				"key": "powder_snow",
				"levelReq": 1
			},
			{
				"key": "endure",
				"levelReq": 1
			},
			{
				"key": "powder_snow",
				"levelReq": 10
			},
			{
				"key": "endure",
				"levelReq": 19
			},
			{
				"key": "take_down",
				"levelReq": 28
			},
			{
				"key": "fury_attack",
				"levelReq": 33
			},
			{
				"key": "mist",
				"levelReq": 42
			},
			{
				"key": "blizzard",
				"levelReq": 56
			},
			{
				"key": "amnesia",
				"levelReq": 70
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"delibird": {
		"id": "delibird",
		"name": "Delibird",
		"description": "Pokedex Nº225 - tipo ICE/FLYING.",
		"type": "ICE",
		"type2": "FLYING",
		"catchRate": 45,
		"baseExp": 183,
		"growthCurve": "FAST",
		"base": {
			"hp": 45,
			"atkFis": 55,
			"atkEsp": 65,
			"def": 45,
			"defEsp": 45,
			"speed": 75
		},
		"abilities": [{
			"key": "present",
			"levelReq": 1
		}],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"smoochum": {
		"id": "smoochum",
		"name": "Smoochum",
		"description": "Pokedex Nº238 - tipo ICE/PSYCHIC.",
		"type": "ICE",
		"type2": "PSYCHIC",
		"catchRate": 45,
		"baseExp": 87,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 45,
			"atkFis": 30,
			"atkEsp": 85,
			"def": 15,
			"defEsp": 65,
			"speed": 65
		},
		"abilities": [
			{
				"key": "pound",
				"levelReq": 1
			},
			{
				"key": "lick",
				"levelReq": 1
			},
			{
				"key": "sweet_kiss",
				"levelReq": 9
			},
			{
				"key": "powder_snow",
				"levelReq": 13
			},
			{
				"key": "confusion",
				"levelReq": 21
			},
			{
				"key": "sing",
				"levelReq": 25
			},
			{
				"key": "mean_look",
				"levelReq": 33
			},
			{
				"key": "psychic_m",
				"levelReq": 37
			},
			{
				"key": "perish_song",
				"levelReq": 45
			},
			{
				"key": "blizzard",
				"levelReq": 49
			}
		],
		"evolvesTo": "jynx",
		"evolvesAtLevel": 30
	},
	"steelix": {
		"id": "steelix",
		"name": "Steelix",
		"description": "Pokedex Nº208 - tipo STEEL/GROUND.",
		"type": "STEEL",
		"type2": "GROUND",
		"catchRate": 25,
		"baseExp": 196,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 75,
			"atkFis": 85,
			"atkEsp": 55,
			"def": 200,
			"defEsp": 65,
			"speed": 30
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "screech",
				"levelReq": 1
			},
			{
				"key": "bind",
				"levelReq": 10
			},
			{
				"key": "rock_throw",
				"levelReq": 14
			},
			{
				"key": "harden",
				"levelReq": 23
			},
			{
				"key": "rage",
				"levelReq": 27
			},
			{
				"key": "sandstorm",
				"levelReq": 36
			},
			{
				"key": "slam",
				"levelReq": 40
			},
			{
				"key": "crunch",
				"levelReq": 49
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"skarmory": {
		"id": "skarmory",
		"name": "Skarmory",
		"description": "Pokedex Nº227 - tipo STEEL/FLYING.",
		"type": "STEEL",
		"type2": "FLYING",
		"catchRate": 25,
		"baseExp": 168,
		"growthCurve": "SLOW",
		"base": {
			"hp": 65,
			"atkFis": 80,
			"atkEsp": 40,
			"def": 140,
			"defEsp": 70,
			"speed": 70
		},
		"abilities": [
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "peck",
				"levelReq": 1
			},
			{
				"key": "sand_attack",
				"levelReq": 13
			},
			{
				"key": "swift",
				"levelReq": 19
			},
			{
				"key": "agility",
				"levelReq": 25
			},
			{
				"key": "fury_attack",
				"levelReq": 37
			},
			{
				"key": "steel_wing",
				"levelReq": 49
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"natu": {
		"id": "natu",
		"name": "Natu",
		"description": "Pokedex Nº177 - tipo PSYCHIC/FLYING.",
		"type": "PSYCHIC",
		"type2": "FLYING",
		"catchRate": 190,
		"baseExp": 73,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 40,
			"atkFis": 50,
			"atkEsp": 70,
			"def": 45,
			"defEsp": 45,
			"speed": 70
		},
		"abilities": [
			{
				"key": "peck",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "night_shade",
				"levelReq": 10
			},
			{
				"key": "teleport",
				"levelReq": 20
			},
			{
				"key": "future_sight",
				"levelReq": 30
			},
			{
				"key": "confuse_ray",
				"levelReq": 40
			},
			{
				"key": "psychic_m",
				"levelReq": 50
			}
		],
		"evolvesTo": "xatu",
		"evolvesAtLevel": 25
	},
	"xatu": {
		"id": "xatu",
		"name": "Xatu",
		"description": "Pokedex Nº178 - tipo PSYCHIC/FLYING.",
		"type": "PSYCHIC",
		"type2": "FLYING",
		"catchRate": 75,
		"baseExp": 171,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 65,
			"atkFis": 75,
			"atkEsp": 95,
			"def": 70,
			"defEsp": 70,
			"speed": 95
		},
		"abilities": [
			{
				"key": "peck",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "night_shade",
				"levelReq": 1
			},
			{
				"key": "night_shade",
				"levelReq": 10
			},
			{
				"key": "teleport",
				"levelReq": 20
			},
			{
				"key": "future_sight",
				"levelReq": 35
			},
			{
				"key": "confuse_ray",
				"levelReq": 50
			},
			{
				"key": "psychic_m",
				"levelReq": 65
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"abra": {
		"id": "abra",
		"name": "Abra",
		"description": "Pokedex Nº63 - tipo PSYCHIC.",
		"type": "PSYCHIC",
		"type2": null,
		"catchRate": 200,
		"baseExp": 73,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 25,
			"atkFis": 20,
			"atkEsp": 105,
			"def": 15,
			"defEsp": 55,
			"speed": 90
		},
		"abilities": [{
			"key": "teleport",
			"levelReq": 1
		}],
		"evolvesTo": "kadabra",
		"evolvesAtLevel": 16
	},
	"kadabra": {
		"id": "kadabra",
		"name": "Kadabra",
		"description": "Pokedex Nº64 - tipo PSYCHIC.",
		"type": "PSYCHIC",
		"type2": null,
		"catchRate": 100,
		"baseExp": 145,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 40,
			"atkFis": 35,
			"atkEsp": 120,
			"def": 30,
			"defEsp": 70,
			"speed": 105
		},
		"abilities": [
			{
				"key": "teleport",
				"levelReq": 1
			},
			{
				"key": "kinesis",
				"levelReq": 1
			},
			{
				"key": "confusion",
				"levelReq": 1
			},
			{
				"key": "confusion",
				"levelReq": 16
			},
			{
				"key": "disable",
				"levelReq": 18
			},
			{
				"key": "psybeam",
				"levelReq": 21
			},
			{
				"key": "recover",
				"levelReq": 26
			},
			{
				"key": "future_sight",
				"levelReq": 31
			},
			{
				"key": "psychic_m",
				"levelReq": 38
			},
			{
				"key": "reflect",
				"levelReq": 45
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"alakazam": {
		"id": "alakazam",
		"name": "Alakazam",
		"description": "Pokedex Nº65 - tipo PSYCHIC.",
		"type": "PSYCHIC",
		"type2": null,
		"catchRate": 50,
		"baseExp": 186,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 55,
			"atkFis": 50,
			"atkEsp": 135,
			"def": 45,
			"defEsp": 85,
			"speed": 120
		},
		"abilities": [
			{
				"key": "teleport",
				"levelReq": 1
			},
			{
				"key": "kinesis",
				"levelReq": 1
			},
			{
				"key": "confusion",
				"levelReq": 1
			},
			{
				"key": "confusion",
				"levelReq": 16
			},
			{
				"key": "disable",
				"levelReq": 18
			},
			{
				"key": "psybeam",
				"levelReq": 21
			},
			{
				"key": "recover",
				"levelReq": 26
			},
			{
				"key": "future_sight",
				"levelReq": 31
			},
			{
				"key": "psychic_m",
				"levelReq": 38
			},
			{
				"key": "reflect",
				"levelReq": 45
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"drowzee": {
		"id": "drowzee",
		"name": "Drowzee",
		"description": "Pokedex Nº96 - tipo PSYCHIC.",
		"type": "PSYCHIC",
		"type2": null,
		"catchRate": 190,
		"baseExp": 102,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 60,
			"atkFis": 48,
			"atkEsp": 43,
			"def": 45,
			"defEsp": 90,
			"speed": 42
		},
		"abilities": [
			{
				"key": "pound",
				"levelReq": 1
			},
			{
				"key": "hypnosis",
				"levelReq": 1
			},
			{
				"key": "disable",
				"levelReq": 10
			},
			{
				"key": "confusion",
				"levelReq": 18
			},
			{
				"key": "headbutt",
				"levelReq": 25
			},
			{
				"key": "poison_gas",
				"levelReq": 31
			},
			{
				"key": "meditate",
				"levelReq": 36
			},
			{
				"key": "psychic_m",
				"levelReq": 40
			},
			{
				"key": "psych_up",
				"levelReq": 43
			},
			{
				"key": "future_sight",
				"levelReq": 45
			}
		],
		"evolvesTo": "hypno",
		"evolvesAtLevel": 26
	},
	"hypno": {
		"id": "hypno",
		"name": "Hypno",
		"description": "Pokedex Nº97 - tipo PSYCHIC.",
		"type": "PSYCHIC",
		"type2": null,
		"catchRate": 75,
		"baseExp": 165,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 85,
			"atkFis": 73,
			"atkEsp": 73,
			"def": 70,
			"defEsp": 115,
			"speed": 67
		},
		"abilities": [
			{
				"key": "pound",
				"levelReq": 1
			},
			{
				"key": "hypnosis",
				"levelReq": 1
			},
			{
				"key": "disable",
				"levelReq": 1
			},
			{
				"key": "confusion",
				"levelReq": 1
			},
			{
				"key": "disable",
				"levelReq": 10
			},
			{
				"key": "confusion",
				"levelReq": 18
			},
			{
				"key": "headbutt",
				"levelReq": 25
			},
			{
				"key": "poison_gas",
				"levelReq": 33
			},
			{
				"key": "meditate",
				"levelReq": 40
			},
			{
				"key": "psychic_m",
				"levelReq": 49
			},
			{
				"key": "psych_up",
				"levelReq": 55
			},
			{
				"key": "future_sight",
				"levelReq": 60
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"unown": {
		"id": "unown",
		"name": "Unown",
		"description": "Pokedex Nº201 - tipo PSYCHIC.",
		"type": "PSYCHIC",
		"type2": null,
		"catchRate": 225,
		"baseExp": 61,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 48,
			"atkFis": 72,
			"atkEsp": 72,
			"def": 48,
			"defEsp": 48,
			"speed": 48
		},
		"abilities": [{
			"key": "hidden_power",
			"levelReq": 1
		}],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"wobbuffet": {
		"id": "wobbuffet",
		"name": "Wobbuffet",
		"description": "Pokedex Nº202 - tipo PSYCHIC.",
		"type": "PSYCHIC",
		"type2": null,
		"catchRate": 45,
		"baseExp": 177,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 190,
			"atkFis": 33,
			"atkEsp": 33,
			"def": 58,
			"defEsp": 58,
			"speed": 33
		},
		"abilities": [
			{
				"key": "counter",
				"levelReq": 1
			},
			{
				"key": "mirror_coat",
				"levelReq": 1
			},
			{
				"key": "safeguard",
				"levelReq": 1
			},
			{
				"key": "destiny_bond",
				"levelReq": 1
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"gastly": {
		"id": "gastly",
		"name": "Gastly",
		"description": "Pokedex Nº92 - tipo GHOST/POISON.",
		"type": "GHOST",
		"type2": "POISON",
		"catchRate": 190,
		"baseExp": 95,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 30,
			"atkFis": 35,
			"atkEsp": 100,
			"def": 30,
			"defEsp": 35,
			"speed": 80
		},
		"abilities": [
			{
				"key": "hypnosis",
				"levelReq": 1
			},
			{
				"key": "lick",
				"levelReq": 1
			},
			{
				"key": "spite",
				"levelReq": 8
			},
			{
				"key": "mean_look",
				"levelReq": 13
			},
			{
				"key": "curse",
				"levelReq": 16
			},
			{
				"key": "night_shade",
				"levelReq": 21
			},
			{
				"key": "confuse_ray",
				"levelReq": 28
			},
			{
				"key": "dream_eater",
				"levelReq": 33
			},
			{
				"key": "destiny_bond",
				"levelReq": 36
			}
		],
		"evolvesTo": "haunter",
		"evolvesAtLevel": 25
	},
	"haunter": {
		"id": "haunter",
		"name": "Haunter",
		"description": "Pokedex Nº93 - tipo GHOST/POISON.",
		"type": "GHOST",
		"type2": "POISON",
		"catchRate": 90,
		"baseExp": 126,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 45,
			"atkFis": 50,
			"atkEsp": 115,
			"def": 45,
			"defEsp": 55,
			"speed": 95
		},
		"abilities": [
			{
				"key": "hypnosis",
				"levelReq": 1
			},
			{
				"key": "lick",
				"levelReq": 1
			},
			{
				"key": "spite",
				"levelReq": 1
			},
			{
				"key": "spite",
				"levelReq": 8
			},
			{
				"key": "mean_look",
				"levelReq": 13
			},
			{
				"key": "curse",
				"levelReq": 16
			},
			{
				"key": "night_shade",
				"levelReq": 21
			},
			{
				"key": "confuse_ray",
				"levelReq": 31
			},
			{
				"key": "dream_eater",
				"levelReq": 39
			},
			{
				"key": "destiny_bond",
				"levelReq": 48
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"gengar": {
		"id": "gengar",
		"name": "Gengar",
		"description": "Pokedex Nº94 - tipo GHOST/POISON.",
		"type": "GHOST",
		"type2": "POISON",
		"catchRate": 45,
		"baseExp": 190,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 60,
			"atkFis": 65,
			"atkEsp": 130,
			"def": 60,
			"defEsp": 75,
			"speed": 110
		},
		"abilities": [
			{
				"key": "hypnosis",
				"levelReq": 1
			},
			{
				"key": "lick",
				"levelReq": 1
			},
			{
				"key": "spite",
				"levelReq": 1
			},
			{
				"key": "spite",
				"levelReq": 8
			},
			{
				"key": "mean_look",
				"levelReq": 13
			},
			{
				"key": "curse",
				"levelReq": 16
			},
			{
				"key": "night_shade",
				"levelReq": 21
			},
			{
				"key": "confuse_ray",
				"levelReq": 31
			},
			{
				"key": "dream_eater",
				"levelReq": 39
			},
			{
				"key": "destiny_bond",
				"levelReq": 48
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"misdreavus": {
		"id": "misdreavus",
		"name": "Misdreavus",
		"description": "Pokedex Nº200 - tipo GHOST.",
		"type": "GHOST",
		"type2": null,
		"catchRate": 45,
		"baseExp": 147,
		"growthCurve": "FAST",
		"base": {
			"hp": 60,
			"atkFis": 60,
			"atkEsp": 85,
			"def": 60,
			"defEsp": 85,
			"speed": 85
		},
		"abilities": [
			{
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "psywave",
				"levelReq": 1
			},
			{
				"key": "spite",
				"levelReq": 6
			},
			{
				"key": "confuse_ray",
				"levelReq": 12
			},
			{
				"key": "mean_look",
				"levelReq": 19
			},
			{
				"key": "psybeam",
				"levelReq": 27
			},
			{
				"key": "pain_split",
				"levelReq": 36
			},
			{
				"key": "perish_song",
				"levelReq": 46
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"murkrow": {
		"id": "murkrow",
		"name": "Murkrow",
		"description": "Pokedex Nº198 - tipo DARK/FLYING.",
		"type": "DARK",
		"type2": "FLYING",
		"catchRate": 30,
		"baseExp": 107,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 60,
			"atkFis": 85,
			"atkEsp": 85,
			"def": 42,
			"defEsp": 42,
			"speed": 91
		},
		"abilities": [
			{
				"key": "peck",
				"levelReq": 1
			},
			{
				"key": "pursuit",
				"levelReq": 11
			},
			{
				"key": "haze",
				"levelReq": 16
			},
			{
				"key": "night_shade",
				"levelReq": 26
			},
			{
				"key": "faint_attack",
				"levelReq": 31
			},
			{
				"key": "mean_look",
				"levelReq": 41
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"sneasel": {
		"id": "sneasel",
		"name": "Sneasel",
		"description": "Pokedex Nº215 - tipo DARK/ICE.",
		"type": "DARK",
		"type2": "ICE",
		"catchRate": 60,
		"baseExp": 132,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 55,
			"atkFis": 95,
			"atkEsp": 35,
			"def": 55,
			"defEsp": 75,
			"speed": 115
		},
		"abilities": [
			{
				"key": "scratch",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "quick_attack",
				"levelReq": 9
			},
			{
				"key": "screech",
				"levelReq": 17
			},
			{
				"key": "faint_attack",
				"levelReq": 25
			},
			{
				"key": "fury_swipes",
				"levelReq": 33
			},
			{
				"key": "agility",
				"levelReq": 41
			},
			{
				"key": "slash",
				"levelReq": 49
			},
			{
				"key": "beat_up",
				"levelReq": 57
			},
			{
				"key": "metal_claw",
				"levelReq": 65
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"houndour": {
		"id": "houndour",
		"name": "Houndour",
		"description": "Pokedex Nº228 - tipo DARK/FIRE.",
		"type": "DARK",
		"type2": "FIRE",
		"catchRate": 120,
		"baseExp": 114,
		"growthCurve": "SLOW",
		"base": {
			"hp": 45,
			"atkFis": 60,
			"atkEsp": 80,
			"def": 30,
			"defEsp": 50,
			"speed": 65
		},
		"abilities": [
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "ember",
				"levelReq": 1
			},
			{
				"key": "roar",
				"levelReq": 7
			},
			{
				"key": "smog",
				"levelReq": 13
			},
			{
				"key": "bite",
				"levelReq": 20
			},
			{
				"key": "faint_attack",
				"levelReq": 27
			},
			{
				"key": "flamethrower",
				"levelReq": 35
			},
			{
				"key": "crunch",
				"levelReq": 43
			}
		],
		"evolvesTo": "houndoom",
		"evolvesAtLevel": 24
	},
	"houndoom": {
		"id": "houndoom",
		"name": "Houndoom",
		"description": "Pokedex Nº229 - tipo DARK/FIRE.",
		"type": "DARK",
		"type2": "FIRE",
		"catchRate": 45,
		"baseExp": 204,
		"growthCurve": "SLOW",
		"base": {
			"hp": 75,
			"atkFis": 90,
			"atkEsp": 110,
			"def": 50,
			"defEsp": 80,
			"speed": 95
		},
		"abilities": [
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "ember",
				"levelReq": 1
			},
			{
				"key": "roar",
				"levelReq": 7
			},
			{
				"key": "smog",
				"levelReq": 13
			},
			{
				"key": "bite",
				"levelReq": 20
			},
			{
				"key": "faint_attack",
				"levelReq": 30
			},
			{
				"key": "flamethrower",
				"levelReq": 41
			},
			{
				"key": "crunch",
				"levelReq": 52
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"dratini": {
		"id": "dratini",
		"name": "Dratini",
		"description": "Pokedex Nº147 - tipo DRAGON.",
		"type": "DRAGON",
		"type2": null,
		"catchRate": 45,
		"baseExp": 67,
		"growthCurve": "SLOW",
		"base": {
			"hp": 41,
			"atkFis": 64,
			"atkEsp": 50,
			"def": 45,
			"defEsp": 50,
			"speed": 50
		},
		"abilities": [
			{
				"key": "wrap",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "thunder_wave",
				"levelReq": 8
			},
			{
				"key": "twister",
				"levelReq": 15
			},
			{
				"key": "dragon_rage",
				"levelReq": 22
			},
			{
				"key": "slam",
				"levelReq": 29
			},
			{
				"key": "agility",
				"levelReq": 36
			},
			{
				"key": "safeguard",
				"levelReq": 43
			},
			{
				"key": "outrage",
				"levelReq": 50
			},
			{
				"key": "hyper_beam",
				"levelReq": 57
			}
		],
		"evolvesTo": "dragonair",
		"evolvesAtLevel": 30
	},
	"dragonair": {
		"id": "dragonair",
		"name": "Dragonair",
		"description": "Pokedex Nº148 - tipo DRAGON.",
		"type": "DRAGON",
		"type2": null,
		"catchRate": 45,
		"baseExp": 144,
		"growthCurve": "SLOW",
		"base": {
			"hp": 61,
			"atkFis": 84,
			"atkEsp": 70,
			"def": 65,
			"defEsp": 70,
			"speed": 70
		},
		"abilities": [
			{
				"key": "wrap",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "thunder_wave",
				"levelReq": 1
			},
			{
				"key": "twister",
				"levelReq": 1
			},
			{
				"key": "thunder_wave",
				"levelReq": 8
			},
			{
				"key": "twister",
				"levelReq": 15
			},
			{
				"key": "dragon_rage",
				"levelReq": 22
			},
			{
				"key": "slam",
				"levelReq": 29
			},
			{
				"key": "agility",
				"levelReq": 38
			},
			{
				"key": "safeguard",
				"levelReq": 47
			},
			{
				"key": "outrage",
				"levelReq": 56
			},
			{
				"key": "hyper_beam",
				"levelReq": 65
			}
		],
		"evolvesTo": "dragonite",
		"evolvesAtLevel": 55
	},
	"dragonite": {
		"id": "dragonite",
		"name": "Dragonite",
		"description": "Pokedex Nº149 - tipo DRAGON/FLYING.",
		"type": "DRAGON",
		"type2": "FLYING",
		"catchRate": 45,
		"baseExp": 218,
		"growthCurve": "SLOW",
		"base": {
			"hp": 91,
			"atkFis": 134,
			"atkEsp": 100,
			"def": 95,
			"defEsp": 100,
			"speed": 80
		},
		"abilities": [
			{
				"key": "wrap",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "thunder_wave",
				"levelReq": 1
			},
			{
				"key": "twister",
				"levelReq": 1
			},
			{
				"key": "thunder_wave",
				"levelReq": 8
			},
			{
				"key": "twister",
				"levelReq": 15
			},
			{
				"key": "dragon_rage",
				"levelReq": 22
			},
			{
				"key": "slam",
				"levelReq": 29
			},
			{
				"key": "agility",
				"levelReq": 38
			},
			{
				"key": "safeguard",
				"levelReq": 47
			},
			{
				"key": "wing_attack",
				"levelReq": 55
			},
			{
				"key": "outrage",
				"levelReq": 61
			},
			{
				"key": "hyper_beam",
				"levelReq": 75
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"kingdra": {
		"id": "kingdra",
		"name": "Kingdra",
		"description": "Pokedex Nº230 - tipo WATER/DRAGON.",
		"type": "WATER",
		"type2": "DRAGON",
		"catchRate": 45,
		"baseExp": 207,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 75,
			"atkFis": 95,
			"atkEsp": 95,
			"def": 95,
			"defEsp": 95,
			"speed": 85
		},
		"abilities": [
			{
				"key": "bubble",
				"levelReq": 1
			},
			{
				"key": "smokescreen",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "water_gun",
				"levelReq": 1
			},
			{
				"key": "smokescreen",
				"levelReq": 8
			},
			{
				"key": "leer",
				"levelReq": 15
			},
			{
				"key": "water_gun",
				"levelReq": 22
			},
			{
				"key": "twister",
				"levelReq": 29
			},
			{
				"key": "agility",
				"levelReq": 40
			},
			{
				"key": "hydro_pump",
				"levelReq": 51
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"wartortle": {
		"id": "wartortle",
		"name": "Wartortle",
		"description": "Pokedex Nº8 - tipo WATER.",
		"type": "WATER",
		"type2": null,
		"catchRate": 45,
		"baseExp": 143,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 59,
			"atkFis": 63,
			"atkEsp": 65,
			"def": 80,
			"defEsp": 80,
			"speed": 58
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "tail_whip",
				"levelReq": 1
			},
			{
				"key": "bubble",
				"levelReq": 1
			},
			{
				"key": "tail_whip",
				"levelReq": 4
			},
			{
				"key": "bubble",
				"levelReq": 7
			},
			{
				"key": "withdraw",
				"levelReq": 10
			},
			{
				"key": "water_gun",
				"levelReq": 13
			},
			{
				"key": "bite",
				"levelReq": 19
			},
			{
				"key": "rapid_spin",
				"levelReq": 25
			},
			{
				"key": "protect",
				"levelReq": 31
			},
			{
				"key": "rain_dance",
				"levelReq": 37
			},
			{
				"key": "skull_bash",
				"levelReq": 45
			},
			{
				"key": "hydro_pump",
				"levelReq": 53
			}
		],
		"evolvesTo": "blastoise",
		"evolvesAtLevel": 36
	},
	"croconaw": {
		"id": "croconaw",
		"name": "Croconaw",
		"description": "Pokedex Nº159 - tipo WATER.",
		"type": "WATER",
		"type2": null,
		"catchRate": 45,
		"baseExp": 143,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 65,
			"atkFis": 80,
			"atkEsp": 59,
			"def": 80,
			"defEsp": 63,
			"speed": 58
		},
		"abilities": [
			{
				"key": "scratch",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "rage",
				"levelReq": 1
			},
			{
				"key": "rage",
				"levelReq": 7
			},
			{
				"key": "water_gun",
				"levelReq": 13
			},
			{
				"key": "bite",
				"levelReq": 21
			},
			{
				"key": "scary_face",
				"levelReq": 28
			},
			{
				"key": "slash",
				"levelReq": 37
			},
			{
				"key": "screech",
				"levelReq": 45
			},
			{
				"key": "hydro_pump",
				"levelReq": 55
			}
		],
		"evolvesTo": "feraligatr",
		"evolvesAtLevel": 30
	},
	"azumarill": {
		"id": "azumarill",
		"name": "Azumarill",
		"description": "Pokedex Nº184 - tipo WATER.",
		"type": "WATER",
		"type2": null,
		"catchRate": 75,
		"baseExp": 153,
		"growthCurve": "FAST",
		"base": {
			"hp": 100,
			"atkFis": 50,
			"atkEsp": 50,
			"def": 80,
			"defEsp": 80,
			"speed": 50
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "defense_curl",
				"levelReq": 1
			},
			{
				"key": "tail_whip",
				"levelReq": 1
			},
			{
				"key": "water_gun",
				"levelReq": 1
			},
			{
				"key": "defense_curl",
				"levelReq": 3
			},
			{
				"key": "tail_whip",
				"levelReq": 6
			},
			{
				"key": "water_gun",
				"levelReq": 10
			},
			{
				"key": "rollout",
				"levelReq": 15
			},
			{
				"key": "bubblebeam",
				"levelReq": 25
			},
			{
				"key": "double_edge",
				"levelReq": 36
			},
			{
				"key": "rain_dance",
				"levelReq": 48
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"seadra": {
		"id": "seadra",
		"name": "Seadra",
		"description": "Pokedex Nº117 - tipo WATER.",
		"type": "WATER",
		"type2": null,
		"catchRate": 75,
		"baseExp": 155,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 55,
			"atkFis": 65,
			"atkEsp": 95,
			"def": 95,
			"defEsp": 45,
			"speed": 85
		},
		"abilities": [
			{
				"key": "bubble",
				"levelReq": 1
			},
			{
				"key": "smokescreen",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "water_gun",
				"levelReq": 1
			},
			{
				"key": "smokescreen",
				"levelReq": 8
			},
			{
				"key": "leer",
				"levelReq": 15
			},
			{
				"key": "water_gun",
				"levelReq": 22
			},
			{
				"key": "twister",
				"levelReq": 29
			},
			{
				"key": "agility",
				"levelReq": 40
			},
			{
				"key": "hydro_pump",
				"levelReq": 51
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"lanturn": {
		"id": "lanturn",
		"name": "Lanturn",
		"description": "Pokedex Nº171 - tipo WATER/ELECTRIC.",
		"type": "WATER",
		"type2": "ELECTRIC",
		"catchRate": 75,
		"baseExp": 156,
		"growthCurve": "SLOW",
		"base": {
			"hp": 125,
			"atkFis": 58,
			"atkEsp": 76,
			"def": 58,
			"defEsp": 76,
			"speed": 67
		},
		"abilities": [
			{
				"key": "bubble",
				"levelReq": 1
			},
			{
				"key": "thunder_wave",
				"levelReq": 1
			},
			{
				"key": "supersonic",
				"levelReq": 1
			},
			{
				"key": "supersonic",
				"levelReq": 5
			},
			{
				"key": "flail",
				"levelReq": 13
			},
			{
				"key": "water_gun",
				"levelReq": 17
			},
			{
				"key": "spark",
				"levelReq": 25
			},
			{
				"key": "confuse_ray",
				"levelReq": 33
			},
			{
				"key": "take_down",
				"levelReq": 45
			},
			{
				"key": "hydro_pump",
				"levelReq": 53
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"slowbro": {
		"id": "slowbro",
		"name": "Slowbro",
		"description": "Pokedex Nº80 - tipo WATER/PSYCHIC.",
		"type": "WATER",
		"type2": "PSYCHIC",
		"catchRate": 75,
		"baseExp": 164,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 95,
			"atkFis": 75,
			"atkEsp": 100,
			"def": 110,
			"defEsp": 80,
			"speed": 30
		},
		"abilities": [
			{
				"key": "curse",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "water_gun",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 6
			},
			{
				"key": "water_gun",
				"levelReq": 15
			},
			{
				"key": "confusion",
				"levelReq": 20
			},
			{
				"key": "disable",
				"levelReq": 29
			},
			{
				"key": "headbutt",
				"levelReq": 34
			},
			{
				"key": "withdraw",
				"levelReq": 37
			},
			{
				"key": "amnesia",
				"levelReq": 46
			},
			{
				"key": "psychic_m",
				"levelReq": 54
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"octillery": {
		"id": "octillery",
		"name": "Octillery",
		"description": "Pokedex Nº224 - tipo WATER.",
		"type": "WATER",
		"type2": null,
		"catchRate": 75,
		"baseExp": 164,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 75,
			"atkFis": 105,
			"atkEsp": 105,
			"def": 75,
			"defEsp": 75,
			"speed": 45
		},
		"abilities": [
			{
				"key": "water_gun",
				"levelReq": 1
			},
			{
				"key": "constrict",
				"levelReq": 11
			},
			{
				"key": "psybeam",
				"levelReq": 22
			},
			{
				"key": "aurora_beam",
				"levelReq": 22
			},
			{
				"key": "bubblebeam",
				"levelReq": 22
			},
			{
				"key": "octazooka",
				"levelReq": 25
			},
			{
				"key": "focus_energy",
				"levelReq": 38
			},
			{
				"key": "ice_beam",
				"levelReq": 54
			},
			{
				"key": "hyper_beam",
				"levelReq": 70
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"mantine": {
		"id": "mantine",
		"name": "Mantine",
		"description": "Pokedex Nº226 - tipo WATER/FLYING.",
		"type": "WATER",
		"type2": "FLYING",
		"catchRate": 25,
		"baseExp": 168,
		"growthCurve": "SLOW",
		"base": {
			"hp": 65,
			"atkFis": 40,
			"atkEsp": 80,
			"def": 70,
			"defEsp": 140,
			"speed": 70
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "bubble",
				"levelReq": 1
			},
			{
				"key": "supersonic",
				"levelReq": 10
			},
			{
				"key": "bubblebeam",
				"levelReq": 18
			},
			{
				"key": "take_down",
				"levelReq": 25
			},
			{
				"key": "agility",
				"levelReq": 32
			},
			{
				"key": "wing_attack",
				"levelReq": 40
			},
			{
				"key": "confuse_ray",
				"levelReq": 49
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"seaking": {
		"id": "seaking",
		"name": "Seaking",
		"description": "Pokedex Nº119 - tipo WATER.",
		"type": "WATER",
		"type2": null,
		"catchRate": 60,
		"baseExp": 170,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 80,
			"atkFis": 92,
			"atkEsp": 65,
			"def": 65,
			"defEsp": 80,
			"speed": 68
		},
		"abilities": [
			{
				"key": "peck",
				"levelReq": 1
			},
			{
				"key": "tail_whip",
				"levelReq": 1
			},
			{
				"key": "tail_whip",
				"levelReq": 1
			},
			{
				"key": "supersonic",
				"levelReq": 10
			},
			{
				"key": "horn_attack",
				"levelReq": 15
			},
			{
				"key": "flail",
				"levelReq": 24
			},
			{
				"key": "fury_attack",
				"levelReq": 29
			},
			{
				"key": "waterfall",
				"levelReq": 41
			},
			{
				"key": "horn_drill",
				"levelReq": 49
			},
			{
				"key": "agility",
				"levelReq": 61
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"golduck": {
		"id": "golduck",
		"name": "Golduck",
		"description": "Pokedex Nº55 - tipo WATER.",
		"type": "WATER",
		"type2": null,
		"catchRate": 75,
		"baseExp": 174,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 80,
			"atkFis": 82,
			"atkEsp": 95,
			"def": 78,
			"defEsp": 80,
			"speed": 85
		},
		"abilities": [
			{
				"key": "scratch",
				"levelReq": 1
			},
			{
				"key": "tail_whip",
				"levelReq": 1
			},
			{
				"key": "disable",
				"levelReq": 1
			},
			{
				"key": "confusion",
				"levelReq": 1
			},
			{
				"key": "tail_whip",
				"levelReq": 5
			},
			{
				"key": "disable",
				"levelReq": 10
			},
			{
				"key": "confusion",
				"levelReq": 16
			},
			{
				"key": "screech",
				"levelReq": 23
			},
			{
				"key": "psych_up",
				"levelReq": 31
			},
			{
				"key": "fury_swipes",
				"levelReq": 44
			},
			{
				"key": "hydro_pump",
				"levelReq": 58
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"dewgong": {
		"id": "dewgong",
		"name": "Dewgong",
		"description": "Pokedex Nº87 - tipo WATER/ICE.",
		"type": "WATER",
		"type2": "ICE",
		"catchRate": 75,
		"baseExp": 176,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 90,
			"atkFis": 70,
			"atkEsp": 70,
			"def": 80,
			"defEsp": 95,
			"speed": 70
		},
		"abilities": [
			{
				"key": "headbutt",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "aurora_beam",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 5
			},
			{
				"key": "aurora_beam",
				"levelReq": 16
			},
			{
				"key": "rest",
				"levelReq": 21
			},
			{
				"key": "take_down",
				"levelReq": 32
			},
			{
				"key": "ice_beam",
				"levelReq": 43
			},
			{
				"key": "safeguard",
				"levelReq": 60
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"politoed": {
		"id": "politoed",
		"name": "Politoed",
		"description": "Pokedex Nº186 - tipo WATER.",
		"type": "WATER",
		"type2": null,
		"catchRate": 45,
		"baseExp": 185,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 90,
			"atkFis": 75,
			"atkEsp": 90,
			"def": 75,
			"defEsp": 100,
			"speed": 70
		},
		"abilities": [
			{
				"key": "water_gun",
				"levelReq": 1
			},
			{
				"key": "hypnosis",
				"levelReq": 1
			},
			{
				"key": "doubleslap",
				"levelReq": 1
			},
			{
				"key": "perish_song",
				"levelReq": 1
			},
			{
				"key": "perish_song",
				"levelReq": 35
			},
			{
				"key": "swagger",
				"levelReq": 51
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"tentacruel": {
		"id": "tentacruel",
		"name": "Tentacruel",
		"description": "Pokedex Nº73 - tipo WATER/POISON.",
		"type": "WATER",
		"type2": "POISON",
		"catchRate": 60,
		"baseExp": 205,
		"growthCurve": "SLOW",
		"base": {
			"hp": 80,
			"atkFis": 70,
			"atkEsp": 80,
			"def": 65,
			"defEsp": 120,
			"speed": 100
		},
		"abilities": [
			{
				"key": "poison_sting",
				"levelReq": 1
			},
			{
				"key": "supersonic",
				"levelReq": 1
			},
			{
				"key": "constrict",
				"levelReq": 1
			},
			{
				"key": "supersonic",
				"levelReq": 6
			},
			{
				"key": "constrict",
				"levelReq": 12
			},
			{
				"key": "acid",
				"levelReq": 19
			},
			{
				"key": "bubblebeam",
				"levelReq": 25
			},
			{
				"key": "wrap",
				"levelReq": 30
			},
			{
				"key": "barrier",
				"levelReq": 38
			},
			{
				"key": "screech",
				"levelReq": 47
			},
			{
				"key": "hydro_pump",
				"levelReq": 55
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"kingler": {
		"id": "kingler",
		"name": "Kingler",
		"description": "Pokedex Nº99 - tipo WATER.",
		"type": "WATER",
		"type2": null,
		"catchRate": 60,
		"baseExp": 206,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 55,
			"atkFis": 130,
			"atkEsp": 50,
			"def": 115,
			"defEsp": 50,
			"speed": 75
		},
		"abilities": [
			{
				"key": "bubble",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "vicegrip",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 5
			},
			{
				"key": "vicegrip",
				"levelReq": 12
			},
			{
				"key": "harden",
				"levelReq": 16
			},
			{
				"key": "stomp",
				"levelReq": 23
			},
			{
				"key": "guillotine",
				"levelReq": 27
			},
			{
				"key": "protect",
				"levelReq": 38
			},
			{
				"key": "crabhammer",
				"levelReq": 49
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"blastoise": {
		"id": "blastoise",
		"name": "Blastoise",
		"description": "Pokedex Nº9 - tipo WATER.",
		"type": "WATER",
		"type2": null,
		"catchRate": 45,
		"baseExp": 210,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 79,
			"atkFis": 83,
			"atkEsp": 85,
			"def": 100,
			"defEsp": 105,
			"speed": 78
		},
		"abilities": [
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "tail_whip",
				"levelReq": 1
			},
			{
				"key": "bubble",
				"levelReq": 1
			},
			{
				"key": "withdraw",
				"levelReq": 1
			},
			{
				"key": "tail_whip",
				"levelReq": 4
			},
			{
				"key": "bubble",
				"levelReq": 7
			},
			{
				"key": "withdraw",
				"levelReq": 10
			},
			{
				"key": "water_gun",
				"levelReq": 13
			},
			{
				"key": "bite",
				"levelReq": 19
			},
			{
				"key": "rapid_spin",
				"levelReq": 25
			},
			{
				"key": "protect",
				"levelReq": 31
			},
			{
				"key": "rain_dance",
				"levelReq": 42
			},
			{
				"key": "skull_bash",
				"levelReq": 55
			},
			{
				"key": "hydro_pump",
				"levelReq": 68
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"feraligatr": {
		"id": "feraligatr",
		"name": "Feraligatr",
		"description": "Pokedex Nº160 - tipo WATER.",
		"type": "WATER",
		"type2": null,
		"catchRate": 45,
		"baseExp": 210,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 85,
			"atkFis": 105,
			"atkEsp": 79,
			"def": 100,
			"defEsp": 83,
			"speed": 78
		},
		"abilities": [
			{
				"key": "scratch",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "rage",
				"levelReq": 1
			},
			{
				"key": "water_gun",
				"levelReq": 1
			},
			{
				"key": "rage",
				"levelReq": 7
			},
			{
				"key": "water_gun",
				"levelReq": 13
			},
			{
				"key": "bite",
				"levelReq": 21
			},
			{
				"key": "scary_face",
				"levelReq": 28
			},
			{
				"key": "slash",
				"levelReq": 38
			},
			{
				"key": "screech",
				"levelReq": 47
			},
			{
				"key": "hydro_pump",
				"levelReq": 58
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"gyarados": {
		"id": "gyarados",
		"name": "Gyarados",
		"description": "Pokedex Nº130 - tipo WATER/FLYING.",
		"type": "WATER",
		"type2": "FLYING",
		"catchRate": 45,
		"baseExp": 214,
		"growthCurve": "SLOW",
		"base": {
			"hp": 95,
			"atkFis": 125,
			"atkEsp": 60,
			"def": 79,
			"defEsp": 100,
			"speed": 81
		},
		"abilities": [
			{
				"key": "thrash",
				"levelReq": 1
			},
			{
				"key": "bite",
				"levelReq": 20
			},
			{
				"key": "dragon_rage",
				"levelReq": 25
			},
			{
				"key": "leer",
				"levelReq": 30
			},
			{
				"key": "twister",
				"levelReq": 35
			},
			{
				"key": "hydro_pump",
				"levelReq": 40
			},
			{
				"key": "rain_dance",
				"levelReq": 45
			},
			{
				"key": "hyper_beam",
				"levelReq": 50
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"lapras": {
		"id": "lapras",
		"name": "Lapras",
		"description": "Pokedex Nº131 - tipo WATER/ICE.",
		"type": "WATER",
		"type2": "ICE",
		"catchRate": 45,
		"baseExp": 219,
		"growthCurve": "SLOW",
		"base": {
			"hp": 130,
			"atkFis": 85,
			"atkEsp": 85,
			"def": 80,
			"defEsp": 95,
			"speed": 60
		},
		"abilities": [
			{
				"key": "water_gun",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "sing",
				"levelReq": 1
			},
			{
				"key": "mist",
				"levelReq": 8
			},
			{
				"key": "body_slam",
				"levelReq": 15
			},
			{
				"key": "confuse_ray",
				"levelReq": 22
			},
			{
				"key": "perish_song",
				"levelReq": 29
			},
			{
				"key": "ice_beam",
				"levelReq": 36
			},
			{
				"key": "rain_dance",
				"levelReq": 43
			},
			{
				"key": "safeguard",
				"levelReq": 50
			},
			{
				"key": "hydro_pump",
				"levelReq": 57
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	}
};
//#endregion
//#region src/core/random.ts
function randRange(rng, min, max) {
	return min + nextFloat(rng) * (max - min);
}
function randInt(rng, min, max) {
	return Math.floor(randRange(rng, min, max + 1));
}
function rollChance(rng, probability0to1) {
	return nextFloat(rng) < probability0to1;
}
function clamp(value, min, max) {
	return Math.max(min, Math.min(max, value));
}
function weightedPick(rng, items, weightFn) {
	const total = items.reduce((sum, item) => sum + weightFn(item), 0);
	let roll = nextFloat(rng) * total;
	for (const item of items) {
		roll -= weightFn(item);
		if (roll <= 0) return item;
	}
	return items[items.length - 1];
}
//#endregion
//#region src/data/rarity.ts
var RARITIES = {
	comum: {
		key: "comum",
		label: "COMUM",
		weight: 69,
		statMultiplier: 1,
		sellMultiplier: 1,
		color: "#9aa0a6"
	},
	incomum: {
		key: "incomum",
		label: "INCOMUM",
		weight: 22.7,
		statMultiplier: 1.15,
		sellMultiplier: 3,
		color: "#4ade80"
	},
	raro: {
		key: "raro",
		label: "RARO",
		weight: 7,
		statMultiplier: 1.35,
		sellMultiplier: 10,
		color: "#60a5fa"
	},
	ultra: {
		key: "ultra",
		label: "ULTRA",
		weight: 1,
		statMultiplier: 1.7,
		sellMultiplier: 40,
		color: "#a78bfa"
	},
	legendary: {
		key: "legendary",
		label: "LEGENDARY",
		weight: .25,
		statMultiplier: 2.2,
		sellMultiplier: 150,
		color: "#d4a017"
	},
	mythic: {
		key: "mythic",
		label: "MYTHIC",
		weight: .05,
		statMultiplier: 3,
		sellMultiplier: 600,
		color: "#e0348c"
	}
};
var RARITY_LIST = Object.values(RARITIES);
function rollRarity(rng) {
	return weightedPick(rng, RARITY_LIST, (r) => r.weight).key;
}
function rarityOf(poke) {
	const key = poke?.rarity;
	return key && RARITIES[key] || RARITIES.comum;
}
/**
* Realce de log: a PALAVRA da raridade pintada com a cor dela.
*
* Correcao de comportamento pedida explicitamente: a versao anterior pintava o
* NOME do POKE ("Sentret" saia azul quando o POKE era raro), o que confundia
* duas informacoes numa so — quem le nao tem como saber se o azul fala da
* especie ou da raridade. Agora quem recebe a cor e a propria palavra
* ("RARO"), e o nome fica na cor normal da linha.
*
* Devolve um objeto estrutural (`{texto, cor}`) em vez de importar o tipo
* `ToastRealce` da store — `data/` nao depende de `stores/`, e o formato e
* pequeno o bastante pra o TypeScript casar sozinho.
*/
function realceDaRaridade(poke) {
	const def = rarityOf(poke);
	return {
		texto: def.label,
		cor: def.color
	};
}
//#endregion
//#region src/data/pokes.ts
var MAX_CATCH_RATE = 255;
var formulaEngine$6 = createFormulaEngine(FORMULAS);
var SHINY_CHANCE_AT_MAX_CATCH_RATE = 1 / 8192 * formulaEngine$6.evalOrDefault("SHINY_RATE_MULTIPLIER", 100);
var SHAPES = [
	"triangle",
	"circle",
	"square",
	"diamond"
];
var GROWTH_FORMULA_BY_CURVE = {
	MEDIUM_FAST: "GROWTH_MEDIUM_FAST",
	SLIGHTLY_FAST: "GROWTH_SLIGHTLY_FAST",
	SLIGHTLY_SLOW: "GROWTH_SLIGHTLY_SLOW",
	MEDIUM_SLOW: "GROWTH_MEDIUM_SLOW",
	FAST: "GROWTH_FAST",
	SLOW: "GROWTH_SLOW"
};
function totalExpForLevel(level, growthCurve) {
	const formulaKey = GROWTH_FORMULA_BY_CURVE[growthCurve] || GROWTH_FORMULA_BY_CURVE.MEDIUM_SLOW;
	return Math.max(0, Math.round(formulaEngine$6.eval(formulaKey, { n: level })));
}
/**
* Requisito de EXP de um POKE — a curva acima, 30% mais cara.
*
* POR QUE UMA FUNCAO SEPARADA, E NAO um multiplicador dentro de
* `totalExpForLevel`: o TREINADOR usa a mesma maquina de curva
* (`trainerExpProgress`/`grantTrainerExp` chamam `totalExpForLevel` com
* MEDIUM_SLOW fixo). Encarecer la dentro deixaria o nivel de treinador 30% mais
* lento junto — coisa que ninguem pediu e que nao tem nada a ver com evolucao.
*
* POR QUE ISSO E "XP DE EVOLUCAO": evolucao neste jogo e 100% por NIVEL
* (`species.evolvesAtLevel`) — nao existe uma barra de EXP de evolucao separada
* pra encarecer. Encarecer o requisito de nivel do POKE E encarecer a evolucao,
* e e o unico lugar onde o pedido pode ser aplicado sem inventar mecanica nova.
*
* Knob de planilha como todo ajuste de economia: `POKE_EXP_REQUIREMENT_MULTIPLIER`
* na aba "Fórmulas" substitui o 1.3 sem tocar em codigo.
*/
var POKE_EXP_REQUIREMENT_MULTIPLIER = formulaEngine$6.evalOrDefault("POKE_EXP_REQUIREMENT_MULTIPLIER", 1.3);
function pokeExpForLevel(level, growthCurve) {
	return Math.round(totalExpForLevel(level, growthCurve) * POKE_EXP_REQUIREMENT_MULTIPLIER);
}
function hashString(s) {
	let h = 0;
	for (let i = 0; i < s.length; i++) h = h * 31 + s.charCodeAt(i) >>> 0;
	return h;
}
function withVisuals(species) {
	return {
		...species,
		shape: SHAPES[hashString(species.id) % SHAPES.length],
		color: colorForType(species.type)
	};
}
var SPECIES = Object.fromEntries(Object.entries(SPECIES_DATA).map(([key, species]) => [key, withVisuals(species)]));
for (const species of Object.values(SPECIES)) species.abilities = [...species.abilities, {
	key: typedAoeMoveKey(species.type),
	levelReq: 50
}];
for (const [fromId, toId] of Object.entries({
	kadabra: "alakazam",
	machoke: "machamp",
	haunter: "gengar",
	graveler: "golem",
	onix: "steelix",
	scyther: "scizor",
	seadra: "kingdra",
	poliwhirl: "politoed",
	porygon: "porygon2"
})) {
	const from = SPECIES[fromId];
	if (from && SPECIES[toId] && !from.evolvesTo) {
		from.evolvesTo = toId;
		from.evolvesAtLevel = 80;
		from.isSpecialEvolution = true;
	}
}
var SHINY_STAT_MULTIPLIER = 1.5;
function computeStatsAtLevel(species, level, ivs, rarityKey, isShiny) {
	const lvl = Math.max(1, level);
	const rarityMultiplier = (rarityKey && RARITIES[rarityKey] || RARITIES.comum).statMultiplier;
	const stats = {};
	for (const key of Object.keys(species.base)) {
		const formulaKey = key === "hp" ? "HP_FORMULA" : "STAT_FORMULA";
		const base = formulaEngine$6.eval(formulaKey, {
			base: species.base[key],
			level: lvl,
			iv: ivs[key]
		});
		const shinyBase = isShiny ? base * SHINY_STAT_MULTIPLIER : base;
		stats[key] = Math.max(1, Math.round(shinyBase * rarityMultiplier));
	}
	return stats;
}
var IV_MAX = 31;
function rollIvs(rng) {
	return {
		hp: randInt(rng, 0, IV_MAX),
		atkFis: randInt(rng, 0, IV_MAX),
		atkEsp: randInt(rng, 0, IV_MAX),
		def: randInt(rng, 0, IV_MAX),
		defEsp: randInt(rng, 0, IV_MAX),
		speed: randInt(rng, 0, IV_MAX)
	};
}
function novoPokeUid() {
	return crypto.randomUUID();
}
function createPokeInstance(rng, speciesId, level = 1, { ivs: fixedIvs, rarity: fixedRarity } = {}) {
	const species = SPECIES[speciesId];
	if (!species) throw new Error(`Especie desconhecida: ${speciesId}`);
	const ivs = fixedIvs || rollIvs(rng);
	const rarity = fixedRarity || rollRarity(rng);
	const isShiny = rollChance(rng, species.catchRate / MAX_CATCH_RATE * SHINY_CHANCE_AT_MAX_CATCH_RATE);
	const stats = computeStatsAtLevel(species, level, ivs, rarity, isShiny);
	return {
		uid: novoPokeUid(),
		speciesId,
		level,
		isShiny,
		rarity,
		exp: pokeExpForLevel(level, species.growthCurve),
		ivs,
		stats,
		hp: stats.hp,
		unlockedAbilities: species.abilities.filter((entry) => entry.levelReq <= level).map((entry) => entry.key).filter((key) => getAbility(key))
	};
}
//#endregion
//#region src/data/generated/waterCollisionMask.generated.ts
var WATER_COLLISION_GRID = [
	"11111111110000000000000000000000000",
	"10111111110000000000000000000000000",
	"10011111000000000000000000000000000",
	"00000000000000000000000000000000000",
	"00000000000000000000000000000000000",
	"00000000000000000001111111111111111",
	"00000000000000000011111111111111111",
	"11111000000111111111111111111111111",
	"11111111001111111111111111111111111",
	"11111111001111110000111111111111111",
	"11111111001111110000000011111111111",
	"00011111001111110000000001111111111",
	"00001111001111100000000001111111111",
	"00000111000111100000000000111111111",
	"00000000000000000000000000111111111",
	"11111111111111110000000000111111111",
	"11111111111111111000000001111111111",
	"11111111111111111100000001111111111",
	"11111111111111111111000011111111111",
	"11111111100111111111111111111111111",
	"11111111000111111111111111111111110",
	"11111110000111111111111111111111110",
	"11111100000111111111111111111111110"
];
var WATER_SPAWN_POINT = {
	x: 664.56,
	y: 86.56738461538407
};
//#endregion
//#region src/data/generated/maps.generated.ts
var MAPS_DATA = {
	"route_46": {
		"id": "route_46",
		"name": "Route 46 (Inicial)",
		"description": "Local selvagem: Route 46 (Inicial) (nivel 2-2).",
		"levelRange": [2, 2],
		"unlockCost": null,
		"continent": "johto",
		"bounds": {
			"width": 1400,
			"height": 900
		},
		"playerSpawn": {
			"x": 700,
			"y": 450
		},
		"bg": {
			"primary": "#284b3c",
			"secondary": "#2e5544",
			"image": "assets/hunt-backgrounds/forest.png"
		},
		"maxEnemies": 6,
		"respawnDelay": 6,
		"spawnPoints": [
			{
				"x": 500,
				"y": 320
			},
			{
				"x": 900,
				"y": 320
			},
			{
				"x": 500,
				"y": 580
			},
			{
				"x": 900,
				"y": 580
			},
			{
				"x": 700,
				"y": 250
			},
			{
				"x": 700,
				"y": 650
			}
		],
		"enemyPool": [
			"route_46_geodude",
			"route_46_spearow",
			"route_46_rattata"
		],
		"itemDrops": [{
			"itemId": "potion",
			"chance": .15
		}, {
			"itemId": "poke_ball",
			"chance": .1
		}]
	},
	"lv_1_10_floresta": {
		"id": "lv_1_10_floresta",
		"name": "Zona Nivel 1-10 (Floresta)",
		"description": "Local selvagem: Zona Nivel 1-10 (Floresta) (nivel 2-12).",
		"levelRange": [2, 12],
		"unlockCost": null,
		"continent": "johto",
		"bounds": {
			"width": 1400,
			"height": 900
		},
		"playerSpawn": {
			"x": 700,
			"y": 450
		},
		"bg": {
			"primary": "#284b3c",
			"secondary": "#2e5544",
			"image": "assets/hunt-backgrounds/forest.png"
		},
		"maxEnemies": 6,
		"respawnDelay": 6,
		"spawnPoints": [
			{
				"x": 500,
				"y": 320
			},
			{
				"x": 900,
				"y": 320
			},
			{
				"x": 500,
				"y": 580
			},
			{
				"x": 900,
				"y": 580
			},
			{
				"x": 700,
				"y": 250
			},
			{
				"x": 700,
				"y": 650
			}
		],
		"enemyPool": [
			"lv_1_10_floresta_ivysaur",
			"lv_1_10_floresta_venusaur",
			"lv_1_10_floresta_oddish",
			"lv_1_10_floresta_gloom",
			"lv_1_10_floresta_bellsprout",
			"lv_1_10_floresta_weepinbell",
			"lv_1_10_floresta_victreebel",
			"lv_1_10_floresta_exeggcute",
			"lv_1_10_floresta_tangela",
			"lv_1_10_floresta_chikorita",
			"lv_1_10_floresta_bayleef",
			"lv_1_10_floresta_meganium",
			"lv_1_10_floresta_hoppip",
			"lv_1_10_floresta_skiploom",
			"lv_1_10_floresta_jumpluff",
			"lv_1_10_floresta_sunkern",
			"lv_1_10_floresta_sunflora"
		],
		"itemDrops": [{
			"itemId": "potion",
			"chance": .15
		}, {
			"itemId": "poke_ball",
			"chance": .1
		}]
	},
	"lv_1_10_bosque": {
		"id": "lv_1_10_bosque",
		"name": "Zona Nivel 1-10 (Bosque)",
		"description": "Local selvagem: Zona Nivel 1-10 (Bosque) (nivel 2-12).",
		"levelRange": [2, 12],
		"unlockCost": null,
		"continent": "johto",
		"bounds": {
			"width": 1400,
			"height": 900
		},
		"playerSpawn": {
			"x": 700,
			"y": 450
		},
		"bg": {
			"primary": "#284b3c",
			"secondary": "#2e5544",
			"image": "assets/hunt-backgrounds/forest.png"
		},
		"maxEnemies": 6,
		"respawnDelay": 6,
		"spawnPoints": [
			{
				"x": 500,
				"y": 320
			},
			{
				"x": 900,
				"y": 320
			},
			{
				"x": 500,
				"y": 580
			},
			{
				"x": 900,
				"y": 580
			},
			{
				"x": 700,
				"y": 250
			},
			{
				"x": 700,
				"y": 650
			}
		],
		"enemyPool": [
			"lv_1_10_bosque_caterpie",
			"lv_1_10_bosque_metapod",
			"lv_1_10_bosque_butterfree",
			"lv_1_10_bosque_weedle",
			"lv_1_10_bosque_kakuna",
			"lv_1_10_bosque_beedrill",
			"lv_1_10_bosque_paras",
			"lv_1_10_bosque_parasect",
			"lv_1_10_bosque_venonat",
			"lv_1_10_bosque_venomoth",
			"lv_1_10_bosque_scyther",
			"lv_1_10_bosque_pinsir",
			"lv_1_10_bosque_ledyba",
			"lv_1_10_bosque_ledian",
			"lv_1_10_bosque_spinarak",
			"lv_1_10_bosque_ariados",
			"lv_1_10_bosque_yanma",
			"lv_1_10_bosque_pineco",
			"lv_1_10_bosque_forretress",
			"lv_1_10_bosque_scizor",
			"lv_1_10_bosque_heracross"
		],
		"itemDrops": [{
			"itemId": "potion",
			"chance": .15
		}, {
			"itemId": "poke_ball",
			"chance": .1
		}]
	},
	"lv_11_20_costa": {
		"id": "lv_11_20_costa",
		"name": "Zona Nivel 11-20 (Costa)",
		"description": "Local selvagem: Zona Nivel 11-20 (Costa) (nivel 10-18).",
		"levelRange": [10, 18],
		"unlockCost": null,
		"continent": "johto",
		"bounds": {
			"width": 1400,
			"height": 900
		},
		"playerSpawn": {
			"x": 700,
			"y": 450
		},
		"bg": {
			"primary": "#284b3c",
			"secondary": "#2e5544",
			"image": "assets/hunt-backgrounds/water.png"
		},
		"maxEnemies": 6,
		"respawnDelay": 6,
		"spawnPoints": [
			{
				"x": 500,
				"y": 320
			},
			{
				"x": 900,
				"y": 320
			},
			{
				"x": 500,
				"y": 580
			},
			{
				"x": 900,
				"y": 580
			},
			{
				"x": 700,
				"y": 250
			},
			{
				"x": 700,
				"y": 650
			}
		],
		"enemyPool": [
			"lv_11_20_costa_magikarp",
			"lv_11_20_costa_wooper",
			"lv_11_20_costa_marill",
			"lv_11_20_costa_totodile",
			"lv_11_20_costa_poliwag",
			"lv_11_20_costa_remoraid",
			"lv_11_20_costa_psyduck",
			"lv_11_20_costa_horsea",
			"lv_11_20_costa_chinchou",
			"lv_11_20_costa_shellder",
			"lv_11_20_costa_slowpoke",
			"lv_11_20_costa_seel",
			"lv_11_20_costa_qwilfish",
			"lv_11_20_costa_tentacool",
			"lv_11_20_costa_staryu",
			"lv_11_20_costa_goldeen",
			"lv_11_20_costa_corsola",
			"lv_11_20_costa_krabby",
			"lv_11_20_costa_poliwhirl",
			"lv_11_20_costa_quagsire"
		],
		"itemDrops": [{
			"itemId": "potion",
			"chance": .15
		}, {
			"itemId": "poke_ball",
			"chance": .1
		}]
	},
	"lv_11_20_planicie": {
		"id": "lv_11_20_planicie",
		"name": "Zona Nivel 11-20 (Planicie)",
		"description": "Local selvagem: Zona Nivel 11-20 (Planicie) (nivel 10-18).",
		"levelRange": [10, 18],
		"unlockCost": null,
		"continent": "johto",
		"bounds": {
			"width": 1400,
			"height": 900
		},
		"playerSpawn": {
			"x": 700,
			"y": 450
		},
		"bg": {
			"primary": "#284b3c",
			"secondary": "#2e5544",
			"image": "assets/hunt-backgrounds/forest.png"
		},
		"maxEnemies": 6,
		"respawnDelay": 6,
		"spawnPoints": [
			{
				"x": 500,
				"y": 320
			},
			{
				"x": 900,
				"y": 320
			},
			{
				"x": 500,
				"y": 580
			},
			{
				"x": 900,
				"y": 580
			},
			{
				"x": 700,
				"y": 250
			},
			{
				"x": 700,
				"y": 650
			}
		],
		"enemyPool": [
			"lv_11_20_planicie_pidgey",
			"lv_11_20_planicie_pidgeotto",
			"lv_11_20_planicie_pidgeot",
			"lv_11_20_planicie_rattata",
			"lv_11_20_planicie_raticate",
			"lv_11_20_planicie_spearow",
			"lv_11_20_planicie_fearow",
			"lv_11_20_planicie_jigglypuff",
			"lv_11_20_planicie_meowth",
			"lv_11_20_planicie_persian",
			"lv_11_20_planicie_farfetch_d",
			"lv_11_20_planicie_doduo",
			"lv_11_20_planicie_dodrio",
			"lv_11_20_planicie_lickitung",
			"lv_11_20_planicie_kangaskhan",
			"lv_11_20_planicie_tauros",
			"lv_11_20_planicie_ditto",
			"lv_11_20_planicie_eevee",
			"lv_11_20_planicie_porygon",
			"lv_11_20_planicie_snorlax",
			"lv_11_20_planicie_sentret",
			"lv_11_20_planicie_furret",
			"lv_11_20_planicie_hoothoot",
			"lv_11_20_planicie_noctowl",
			"lv_11_20_planicie_cleffa",
			"lv_11_20_planicie_igglybuff",
			"lv_11_20_planicie_togepi",
			"lv_11_20_planicie_aipom",
			"lv_11_20_planicie_girafarig",
			"lv_11_20_planicie_dunsparce",
			"lv_11_20_planicie_snubbull",
			"lv_11_20_planicie_granbull",
			"lv_11_20_planicie_teddiursa",
			"lv_11_20_planicie_ursaring",
			"lv_11_20_planicie_porygon2",
			"lv_11_20_planicie_stantler",
			"lv_11_20_planicie_smeargle",
			"lv_11_20_planicie_miltank"
		],
		"itemDrops": [{
			"itemId": "potion",
			"chance": .15
		}, {
			"itemId": "poke_ball",
			"chance": .1
		}]
	},
	"lv_21_30_caverna": {
		"id": "lv_21_30_caverna",
		"name": "Zona Nivel 21-30 (Caverna)",
		"description": "Local selvagem: Zona Nivel 21-30 (Caverna) (nivel 18-32).",
		"levelRange": [18, 32],
		"unlockCost": null,
		"continent": "johto",
		"bounds": {
			"width": 1400,
			"height": 900
		},
		"playerSpawn": {
			"x": 700,
			"y": 450
		},
		"bg": {
			"primary": "#1c1c2b",
			"secondary": "#242438",
			"image": "assets/hunt-backgrounds/cave.png"
		},
		"maxEnemies": 6,
		"respawnDelay": 6,
		"spawnPoints": [
			{
				"x": 500,
				"y": 320
			},
			{
				"x": 900,
				"y": 320
			},
			{
				"x": 500,
				"y": 580
			},
			{
				"x": 900,
				"y": 580
			},
			{
				"x": 700,
				"y": 250
			},
			{
				"x": 700,
				"y": 650
			}
		],
		"enemyPool": [
			"lv_21_30_caverna_geodude",
			"lv_21_30_caverna_graveler",
			"lv_21_30_caverna_golem",
			"lv_21_30_caverna_onix",
			"lv_21_30_caverna_omanyte",
			"lv_21_30_caverna_omastar",
			"lv_21_30_caverna_kabuto",
			"lv_21_30_caverna_kabutops",
			"lv_21_30_caverna_aerodactyl",
			"lv_21_30_caverna_sudowoodo",
			"lv_21_30_caverna_larvitar",
			"lv_21_30_caverna_pupitar",
			"lv_21_30_caverna_tyranitar"
		],
		"itemDrops": [{
			"itemId": "potion",
			"chance": .15
		}, {
			"itemId": "poke_ball",
			"chance": .1
		}]
	},
	"lv_21_30_deserto": {
		"id": "lv_21_30_deserto",
		"name": "Zona Nivel 21-30 (Deserto)",
		"description": "Local selvagem: Zona Nivel 21-30 (Deserto) (nivel 18-32).",
		"levelRange": [18, 32],
		"unlockCost": null,
		"continent": "johto",
		"bounds": {
			"width": 1400,
			"height": 900
		},
		"playerSpawn": {
			"x": 700,
			"y": 450
		},
		"bg": {
			"primary": "#284b3c",
			"secondary": "#2e5544",
			"image": "assets/hunt-backgrounds/cave.png"
		},
		"maxEnemies": 6,
		"respawnDelay": 6,
		"spawnPoints": [
			{
				"x": 500,
				"y": 320
			},
			{
				"x": 900,
				"y": 320
			},
			{
				"x": 500,
				"y": 580
			},
			{
				"x": 900,
				"y": 580
			},
			{
				"x": 700,
				"y": 250
			},
			{
				"x": 700,
				"y": 650
			}
		],
		"enemyPool": [
			"lv_21_30_deserto_sandshrew",
			"lv_21_30_deserto_sandslash",
			"lv_21_30_deserto_diglett",
			"lv_21_30_deserto_dugtrio",
			"lv_21_30_deserto_cubone",
			"lv_21_30_deserto_marowak",
			"lv_21_30_deserto_rhyhorn",
			"lv_21_30_deserto_rhydon",
			"lv_21_30_deserto_gligar",
			"lv_21_30_deserto_phanpy",
			"lv_21_30_deserto_donphan"
		],
		"itemDrops": [{
			"itemId": "potion",
			"chance": .15
		}, {
			"itemId": "poke_ball",
			"chance": .1
		}]
	},
	"lv_31_40_vulcanico": {
		"id": "lv_31_40_vulcanico",
		"name": "Zona Nivel 31-40 (Vulcanico)",
		"description": "Local selvagem: Zona Nivel 31-40 (Vulcanico) (nivel 15-51).",
		"levelRange": [15, 51],
		"unlockCost": null,
		"continent": "johto",
		"bounds": {
			"width": 1400,
			"height": 900
		},
		"playerSpawn": {
			"x": 700,
			"y": 450
		},
		"bg": {
			"primary": "#1c1c2b",
			"secondary": "#242438",
			"image": "assets/hunt-backgrounds/fire.png"
		},
		"maxEnemies": 6,
		"respawnDelay": 6,
		"spawnPoints": [
			{
				"x": 500,
				"y": 320
			},
			{
				"x": 900,
				"y": 320
			},
			{
				"x": 500,
				"y": 580
			},
			{
				"x": 900,
				"y": 580
			},
			{
				"x": 700,
				"y": 250
			},
			{
				"x": 700,
				"y": 650
			}
		],
		"enemyPool": [
			"lv_31_40_vulcanico_charmeleon",
			"lv_31_40_vulcanico_charizard",
			"lv_31_40_vulcanico_growlithe",
			"lv_31_40_vulcanico_arcanine",
			"lv_31_40_vulcanico_ponyta",
			"lv_31_40_vulcanico_rapidash",
			"lv_31_40_vulcanico_magmar",
			"lv_31_40_vulcanico_cyndaquil",
			"lv_31_40_vulcanico_quilava",
			"lv_31_40_vulcanico_typhlosion",
			"lv_31_40_vulcanico_slugma",
			"lv_31_40_vulcanico_magcargo",
			"lv_31_40_vulcanico_magby"
		],
		"itemDrops": [{
			"itemId": "potion",
			"chance": .15
		}, {
			"itemId": "poke_ball",
			"chance": .1
		}]
	},
	"lv_31_40_usina": {
		"id": "lv_31_40_usina",
		"name": "Zona Nivel 31-40 (Usina)",
		"description": "Local selvagem: Zona Nivel 31-40 (Usina) (nivel 15-51).",
		"levelRange": [15, 51],
		"unlockCost": null,
		"continent": "johto",
		"bounds": {
			"width": 1400,
			"height": 900
		},
		"playerSpawn": {
			"x": 700,
			"y": 450
		},
		"bg": {
			"primary": "#1c1c2b",
			"secondary": "#242438",
			"image": "assets/hunt-backgrounds/eletric.png"
		},
		"maxEnemies": 6,
		"respawnDelay": 6,
		"spawnPoints": [
			{
				"x": 500,
				"y": 320
			},
			{
				"x": 900,
				"y": 320
			},
			{
				"x": 500,
				"y": 580
			},
			{
				"x": 900,
				"y": 580
			},
			{
				"x": 700,
				"y": 250
			},
			{
				"x": 700,
				"y": 650
			}
		],
		"enemyPool": [
			"lv_31_40_usina_pikachu",
			"lv_31_40_usina_magnemite",
			"lv_31_40_usina_magneton",
			"lv_31_40_usina_voltorb",
			"lv_31_40_usina_electrode",
			"lv_31_40_usina_electabuzz",
			"lv_31_40_usina_pichu",
			"lv_31_40_usina_mareep",
			"lv_31_40_usina_flaaffy",
			"lv_31_40_usina_ampharos",
			"lv_31_40_usina_elekid"
		],
		"itemDrops": [{
			"itemId": "potion",
			"chance": .15
		}, {
			"itemId": "poke_ball",
			"chance": .1
		}]
	},
	"lv_41_50_pantano": {
		"id": "lv_41_50_pantano",
		"name": "Zona Nivel 41-50 (Pantano)",
		"description": "Local selvagem: Zona Nivel 41-50 (Pantano) (nivel 41-52).",
		"levelRange": [41, 52],
		"unlockCost": null,
		"continent": "johto",
		"bounds": {
			"width": 1400,
			"height": 900
		},
		"playerSpawn": {
			"x": 700,
			"y": 450
		},
		"bg": {
			"primary": "#284b3c",
			"secondary": "#2e5544",
			"image": "assets/hunt-backgrounds/water.png"
		},
		"maxEnemies": 6,
		"respawnDelay": 6,
		"spawnPoints": [
			{
				"x": 500,
				"y": 320
			},
			{
				"x": 900,
				"y": 320
			},
			{
				"x": 500,
				"y": 580
			},
			{
				"x": 900,
				"y": 580
			},
			{
				"x": 700,
				"y": 250
			},
			{
				"x": 700,
				"y": 650
			}
		],
		"enemyPool": [
			"lv_41_50_pantano_ekans",
			"lv_41_50_pantano_arbok",
			"lv_41_50_pantano_nidoran_f",
			"lv_41_50_pantano_nidorina",
			"lv_41_50_pantano_nidoqueen",
			"lv_41_50_pantano_nidoran_m",
			"lv_41_50_pantano_nidorino",
			"lv_41_50_pantano_nidoking",
			"lv_41_50_pantano_zubat",
			"lv_41_50_pantano_golbat",
			"lv_41_50_pantano_grimer",
			"lv_41_50_pantano_muk",
			"lv_41_50_pantano_koffing",
			"lv_41_50_pantano_weezing"
		],
		"itemDrops": [{
			"itemId": "potion",
			"chance": .15
		}, {
			"itemId": "poke_ball",
			"chance": .1
		}]
	},
	"lv_41_50_dojo": {
		"id": "lv_41_50_dojo",
		"name": "Zona Nivel 41-50 (Dojo)",
		"description": "Local selvagem: Zona Nivel 41-50 (Dojo) (nivel 41-52).",
		"levelRange": [41, 52],
		"unlockCost": null,
		"continent": "johto",
		"bounds": {
			"width": 1400,
			"height": 900
		},
		"playerSpawn": {
			"x": 700,
			"y": 450
		},
		"bg": {
			"primary": "#1c1c2b",
			"secondary": "#242438",
			"image": "assets/hunt-backgrounds/dojo.png"
		},
		"maxEnemies": 6,
		"respawnDelay": 6,
		"spawnPoints": [
			{
				"x": 500,
				"y": 320
			},
			{
				"x": 900,
				"y": 320
			},
			{
				"x": 500,
				"y": 580
			},
			{
				"x": 900,
				"y": 580
			},
			{
				"x": 700,
				"y": 250
			},
			{
				"x": 700,
				"y": 650
			}
		],
		"enemyPool": [
			"lv_41_50_dojo_mankey",
			"lv_41_50_dojo_primeape",
			"lv_41_50_dojo_machop",
			"lv_41_50_dojo_machoke",
			"lv_41_50_dojo_machamp",
			"lv_41_50_dojo_hitmonlee",
			"lv_41_50_dojo_hitmonchan",
			"lv_41_50_dojo_tyrogue"
		],
		"itemDrops": [{
			"itemId": "potion",
			"chance": .15
		}, {
			"itemId": "poke_ball",
			"chance": .1
		}]
	},
	"kanto_lv_1_10_geleira": {
		"id": "kanto_lv_1_10_geleira",
		"name": "Kanto Zona Nivel 52-62 (Geleira)",
		"description": "Local selvagem: Kanto Zona Nivel 52-62 (Geleira) (nivel 52-62).",
		"levelRange": [52, 62],
		"unlockCost": null,
		"continent": "kanto",
		"bounds": {
			"width": 1400,
			"height": 900
		},
		"playerSpawn": {
			"x": 700,
			"y": 450
		},
		"bg": {
			"primary": "#1c1c2b",
			"secondary": "#242438",
			"image": "assets/hunt-backgrounds/cave.png"
		},
		"maxEnemies": 6,
		"respawnDelay": 6,
		"spawnPoints": [
			{
				"x": 500,
				"y": 320
			},
			{
				"x": 900,
				"y": 320
			},
			{
				"x": 500,
				"y": 580
			},
			{
				"x": 900,
				"y": 580
			},
			{
				"x": 700,
				"y": 250
			},
			{
				"x": 700,
				"y": 650
			}
		],
		"enemyPool": [
			"kanto_lv_1_10_geleira_jynx",
			"kanto_lv_1_10_geleira_swinub",
			"kanto_lv_1_10_geleira_piloswine",
			"kanto_lv_1_10_geleira_delibird",
			"kanto_lv_1_10_geleira_smoochum"
		],
		"itemDrops": [{
			"itemId": "potion",
			"chance": .15
		}, {
			"itemId": "poke_ball",
			"chance": .1
		}]
	},
	"kanto_lv_1_10_fabrica": {
		"id": "kanto_lv_1_10_fabrica",
		"name": "Kanto Zona Nivel 52-62 (Fabrica)",
		"description": "Local selvagem: Kanto Zona Nivel 52-62 (Fabrica) (nivel 52-62).",
		"levelRange": [52, 62],
		"unlockCost": null,
		"continent": "kanto",
		"bounds": {
			"width": 1400,
			"height": 900
		},
		"playerSpawn": {
			"x": 700,
			"y": 450
		},
		"bg": {
			"primary": "#1c1c2b",
			"secondary": "#242438",
			"image": "assets/hunt-backgrounds/cave.png"
		},
		"maxEnemies": 6,
		"respawnDelay": 6,
		"spawnPoints": [
			{
				"x": 500,
				"y": 320
			},
			{
				"x": 900,
				"y": 320
			},
			{
				"x": 500,
				"y": 580
			},
			{
				"x": 900,
				"y": 580
			},
			{
				"x": 700,
				"y": 250
			},
			{
				"x": 700,
				"y": 650
			}
		],
		"enemyPool": [
			"kanto_lv_1_10_fabrica_steelix",
			"kanto_lv_1_10_fabrica_skarmory",
			"kanto_lv_1_10_fabrica_magnemite",
			"kanto_lv_1_10_fabrica_forretress",
			"kanto_lv_1_10_fabrica_magneton",
			"kanto_lv_1_10_fabrica_scizor"
		],
		"itemDrops": [{
			"itemId": "potion",
			"chance": .15
		}, {
			"itemId": "poke_ball",
			"chance": .1
		}]
	},
	"kanto_lv_11_20_penhascos": {
		"id": "kanto_lv_11_20_penhascos",
		"name": "Kanto Zona Nivel 60-70 (Penhascos)",
		"description": "Local selvagem: Kanto Zona Nivel 60-70 (Penhascos) (nivel 60-70).",
		"levelRange": [60, 70],
		"unlockCost": null,
		"continent": "kanto",
		"bounds": {
			"width": 1400,
			"height": 900
		},
		"playerSpawn": {
			"x": 700,
			"y": 450
		},
		"bg": {
			"primary": "#284b3c",
			"secondary": "#2e5544",
			"image": "assets/hunt-backgrounds/water.png"
		},
		"maxEnemies": 6,
		"respawnDelay": 6,
		"spawnPoints": [
			{
				"x": 500,
				"y": 320
			},
			{
				"x": 900,
				"y": 320
			},
			{
				"x": 500,
				"y": 580
			},
			{
				"x": 900,
				"y": 580
			},
			{
				"x": 700,
				"y": 250
			},
			{
				"x": 700,
				"y": 650
			}
		],
		"enemyPool": [
			"kanto_lv_11_20_penhascos_pidgey",
			"kanto_lv_11_20_penhascos_spearow",
			"kanto_lv_11_20_penhascos_zubat",
			"kanto_lv_11_20_penhascos_hoothoot",
			"kanto_lv_11_20_penhascos_ledyba",
			"kanto_lv_11_20_penhascos_hoppip",
			"kanto_lv_11_20_penhascos_doduo",
			"kanto_lv_11_20_penhascos_natu",
			"kanto_lv_11_20_penhascos_pidgeotto",
			"kanto_lv_11_20_penhascos_skiploom",
			"kanto_lv_11_20_penhascos_fearow",
			"kanto_lv_11_20_penhascos_golbat",
			"kanto_lv_11_20_penhascos_noctowl",
			"kanto_lv_11_20_penhascos_ledian",
			"kanto_lv_11_20_penhascos_xatu",
			"kanto_lv_11_20_penhascos_yanma"
		],
		"itemDrops": [{
			"itemId": "potion",
			"chance": .15
		}, {
			"itemId": "poke_ball",
			"chance": .1
		}]
	},
	"kanto_lv_11_20_torre_mistica": {
		"id": "kanto_lv_11_20_torre_mistica",
		"name": "Kanto Zona Nivel 60-70 (Torre Mistica)",
		"description": "Local selvagem: Kanto Zona Nivel 60-70 (Torre Mistica) (nivel 60-70).",
		"levelRange": [60, 70],
		"unlockCost": null,
		"continent": "kanto",
		"bounds": {
			"width": 1400,
			"height": 900
		},
		"playerSpawn": {
			"x": 700,
			"y": 450
		},
		"bg": {
			"primary": "#3e2f23",
			"secondary": "#4a3829",
			"image": "assets/hunt-backgrounds/dojo.png"
		},
		"maxEnemies": 6,
		"respawnDelay": 6,
		"spawnPoints": [
			{
				"x": 500,
				"y": 320
			},
			{
				"x": 900,
				"y": 320
			},
			{
				"x": 500,
				"y": 580
			},
			{
				"x": 900,
				"y": 580
			},
			{
				"x": 700,
				"y": 250
			},
			{
				"x": 700,
				"y": 650
			}
		],
		"enemyPool": [
			"kanto_lv_11_20_torre_mistica_abra",
			"kanto_lv_11_20_torre_mistica_kadabra",
			"kanto_lv_11_20_torre_mistica_alakazam",
			"kanto_lv_11_20_torre_mistica_drowzee",
			"kanto_lv_11_20_torre_mistica_hypno",
			"kanto_lv_11_20_torre_mistica_natu",
			"kanto_lv_11_20_torre_mistica_xatu",
			"kanto_lv_11_20_torre_mistica_unown",
			"kanto_lv_11_20_torre_mistica_wobbuffet"
		],
		"itemDrops": [{
			"itemId": "potion",
			"chance": .15
		}, {
			"itemId": "poke_ball",
			"chance": .1
		}]
	},
	"kanto_lv_21_35_cemiterio": {
		"id": "kanto_lv_21_35_cemiterio",
		"name": "Kanto Zona Nivel 68-85 (Cemiterio)",
		"description": "Local selvagem: Kanto Zona Nivel 68-85 (Cemiterio) (nivel 68-85).",
		"levelRange": [68, 85],
		"unlockCost": null,
		"continent": "kanto",
		"bounds": {
			"width": 1400,
			"height": 900
		},
		"playerSpawn": {
			"x": 700,
			"y": 450
		},
		"bg": {
			"primary": "#3e2f23",
			"secondary": "#4a3829",
			"image": "assets/hunt-backgrounds/cave.png"
		},
		"maxEnemies": 6,
		"respawnDelay": 6,
		"spawnPoints": [
			{
				"x": 500,
				"y": 320
			},
			{
				"x": 900,
				"y": 320
			},
			{
				"x": 500,
				"y": 580
			},
			{
				"x": 900,
				"y": 580
			},
			{
				"x": 700,
				"y": 250
			},
			{
				"x": 700,
				"y": 650
			}
		],
		"enemyPool": [
			"kanto_lv_21_35_cemiterio_gastly",
			"kanto_lv_21_35_cemiterio_haunter",
			"kanto_lv_21_35_cemiterio_gengar",
			"kanto_lv_21_35_cemiterio_misdreavus"
		],
		"itemDrops": [{
			"itemId": "potion",
			"chance": .15
		}, {
			"itemId": "poke_ball",
			"chance": .1
		}]
	},
	"kanto_lv_21_35_covil_sombrio": {
		"id": "kanto_lv_21_35_covil_sombrio",
		"name": "Kanto Zona Nivel 68-85 (Covil Sombrio)",
		"description": "Local selvagem: Kanto Zona Nivel 68-85 (Covil Sombrio) (nivel 68-85).",
		"levelRange": [68, 85],
		"unlockCost": null,
		"continent": "kanto",
		"bounds": {
			"width": 1400,
			"height": 900
		},
		"playerSpawn": {
			"x": 700,
			"y": 450
		},
		"bg": {
			"primary": "#1c1c2b",
			"secondary": "#242438",
			"image": "assets/hunt-backgrounds/cave.png"
		},
		"maxEnemies": 6,
		"respawnDelay": 6,
		"spawnPoints": [
			{
				"x": 500,
				"y": 320
			},
			{
				"x": 900,
				"y": 320
			},
			{
				"x": 500,
				"y": 580
			},
			{
				"x": 900,
				"y": 580
			},
			{
				"x": 700,
				"y": 250
			},
			{
				"x": 700,
				"y": 650
			}
		],
		"enemyPool": [
			"kanto_lv_21_35_covil_sombrio_murkrow",
			"kanto_lv_21_35_covil_sombrio_sneasel",
			"kanto_lv_21_35_covil_sombrio_houndour",
			"kanto_lv_21_35_covil_sombrio_houndoom"
		],
		"itemDrops": [{
			"itemId": "potion",
			"chance": .15
		}, {
			"itemId": "poke_ball",
			"chance": .1
		}]
	},
	"kanto_lv_36_55_ruinas_ancestrais": {
		"id": "kanto_lv_36_55_ruinas_ancestrais",
		"name": "Kanto Zona Nivel 80-105 (Ruinas Ancestrais)",
		"description": "Local selvagem: Kanto Zona Nivel 80-105 (Ruinas Ancestrais) (nivel 80-105).",
		"levelRange": [80, 105],
		"unlockCost": null,
		"continent": "kanto",
		"bounds": {
			"width": 1400,
			"height": 900
		},
		"playerSpawn": {
			"x": 700,
			"y": 450
		},
		"bg": {
			"primary": "#3e2f23",
			"secondary": "#4a3829",
			"image": "assets/hunt-backgrounds/dragon.png"
		},
		"maxEnemies": 6,
		"respawnDelay": 6,
		"spawnPoints": [
			{
				"x": 500,
				"y": 320
			},
			{
				"x": 900,
				"y": 320
			},
			{
				"x": 500,
				"y": 580
			},
			{
				"x": 900,
				"y": 580
			},
			{
				"x": 700,
				"y": 250
			},
			{
				"x": 700,
				"y": 650
			}
		],
		"enemyPool": [
			"kanto_lv_36_55_ruinas_ancestrais_dratini",
			"kanto_lv_36_55_ruinas_ancestrais_dragonair",
			"kanto_lv_36_55_ruinas_ancestrais_dragonite",
			"kanto_lv_36_55_ruinas_ancestrais_kingdra"
		],
		"itemDrops": [{
			"itemId": "potion",
			"chance": .15
		}, {
			"itemId": "poke_ball",
			"chance": .1
		}]
	},
	"kanto_lv_36_55_profundezas": {
		"id": "kanto_lv_36_55_profundezas",
		"name": "Kanto Zona Nivel 80-105 (Profundezas)",
		"description": "Local selvagem: Kanto Zona Nivel 80-105 (Profundezas) (nivel 80-105).",
		"levelRange": [80, 105],
		"unlockCost": null,
		"continent": "kanto",
		"bounds": {
			"width": 1400,
			"height": 900
		},
		"playerSpawn": {
			"x": 700,
			"y": 450
		},
		"bg": {
			"primary": "#284b3c",
			"secondary": "#2e5544",
			"image": "assets/hunt-backgrounds/water.png"
		},
		"maxEnemies": 6,
		"respawnDelay": 6,
		"spawnPoints": [
			{
				"x": 500,
				"y": 320
			},
			{
				"x": 900,
				"y": 320
			},
			{
				"x": 500,
				"y": 580
			},
			{
				"x": 900,
				"y": 580
			},
			{
				"x": 700,
				"y": 250
			},
			{
				"x": 700,
				"y": 650
			}
		],
		"enemyPool": [
			"kanto_lv_36_55_profundezas_wartortle",
			"kanto_lv_36_55_profundezas_croconaw",
			"kanto_lv_36_55_profundezas_azumarill",
			"kanto_lv_36_55_profundezas_seadra",
			"kanto_lv_36_55_profundezas_lanturn",
			"kanto_lv_36_55_profundezas_slowbro",
			"kanto_lv_36_55_profundezas_octillery",
			"kanto_lv_36_55_profundezas_mantine",
			"kanto_lv_36_55_profundezas_seaking",
			"kanto_lv_36_55_profundezas_golduck",
			"kanto_lv_36_55_profundezas_dewgong",
			"kanto_lv_36_55_profundezas_politoed",
			"kanto_lv_36_55_profundezas_tentacruel",
			"kanto_lv_36_55_profundezas_kingler",
			"kanto_lv_36_55_profundezas_kingdra",
			"kanto_lv_36_55_profundezas_blastoise",
			"kanto_lv_36_55_profundezas_feraligatr",
			"kanto_lv_36_55_profundezas_gyarados",
			"kanto_lv_36_55_profundezas_lapras"
		],
		"itemDrops": [{
			"itemId": "potion",
			"chance": .15
		}, {
			"itemId": "poke_ball",
			"chance": .1
		}]
	}
};
//#endregion
//#region src/data/generated/enemies.generated.ts
var ENCOUNTERS_DATA = {
	"route_46_geodude": {
		"id": "route_46_geodude",
		"speciesId": "geodude",
		"minLevel": 2,
		"maxLevel": 2,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 30
	},
	"route_46_spearow": {
		"id": "route_46_spearow",
		"speciesId": "spearow",
		"minLevel": 2,
		"maxLevel": 2,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 30
	},
	"route_46_rattata": {
		"id": "route_46_rattata",
		"speciesId": "rattata",
		"minLevel": 2,
		"maxLevel": 2,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 30
	},
	"lv_1_10_floresta_ivysaur": {
		"id": "lv_1_10_floresta_ivysaur",
		"speciesId": "ivysaur",
		"minLevel": 2,
		"maxLevel": 12,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"lv_1_10_floresta_venusaur": {
		"id": "lv_1_10_floresta_venusaur",
		"speciesId": "venusaur",
		"minLevel": 2,
		"maxLevel": 12,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
	},
	"lv_1_10_floresta_oddish": {
		"id": "lv_1_10_floresta_oddish",
		"speciesId": "oddish",
		"minLevel": 2,
		"maxLevel": 12,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"lv_1_10_floresta_gloom": {
		"id": "lv_1_10_floresta_gloom",
		"speciesId": "gloom",
		"minLevel": 2,
		"maxLevel": 12,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
	},
	"lv_1_10_floresta_bellsprout": {
		"id": "lv_1_10_floresta_bellsprout",
		"speciesId": "bellsprout",
		"minLevel": 2,
		"maxLevel": 12,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 20
	},
	"lv_1_10_floresta_weepinbell": {
		"id": "lv_1_10_floresta_weepinbell",
		"speciesId": "weepinbell",
		"minLevel": 2,
		"maxLevel": 12,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"lv_1_10_floresta_victreebel": {
		"id": "lv_1_10_floresta_victreebel",
		"speciesId": "victreebel",
		"minLevel": 2,
		"maxLevel": 12,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
	},
	"lv_1_10_floresta_exeggcute": {
		"id": "lv_1_10_floresta_exeggcute",
		"speciesId": "exeggcute",
		"minLevel": 2,
		"maxLevel": 12,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 20
	},
	"lv_1_10_floresta_tangela": {
		"id": "lv_1_10_floresta_tangela",
		"speciesId": "tangela",
		"minLevel": 2,
		"maxLevel": 12,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 30
	},
	"lv_1_10_floresta_chikorita": {
		"id": "lv_1_10_floresta_chikorita",
		"speciesId": "chikorita",
		"minLevel": 2,
		"maxLevel": 12,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"lv_1_10_floresta_bayleef": {
		"id": "lv_1_10_floresta_bayleef",
		"speciesId": "bayleef",
		"minLevel": 2,
		"maxLevel": 12,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"lv_1_10_floresta_meganium": {
		"id": "lv_1_10_floresta_meganium",
		"speciesId": "meganium",
		"minLevel": 2,
		"maxLevel": 12,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
	},
	"lv_1_10_floresta_hoppip": {
		"id": "lv_1_10_floresta_hoppip",
		"speciesId": "hoppip",
		"minLevel": 2,
		"maxLevel": 12,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"lv_1_10_floresta_skiploom": {
		"id": "lv_1_10_floresta_skiploom",
		"speciesId": "skiploom",
		"minLevel": 2,
		"maxLevel": 12,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"lv_1_10_floresta_jumpluff": {
		"id": "lv_1_10_floresta_jumpluff",
		"speciesId": "jumpluff",
		"minLevel": 2,
		"maxLevel": 12,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
	},
	"lv_1_10_floresta_sunkern": {
		"id": "lv_1_10_floresta_sunkern",
		"speciesId": "sunkern",
		"minLevel": 2,
		"maxLevel": 12,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"lv_1_10_floresta_sunflora": {
		"id": "lv_1_10_floresta_sunflora",
		"speciesId": "sunflora",
		"minLevel": 2,
		"maxLevel": 12,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"lv_1_10_bosque_caterpie": {
		"id": "lv_1_10_bosque_caterpie",
		"speciesId": "caterpie",
		"minLevel": 2,
		"maxLevel": 12,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"lv_1_10_bosque_metapod": {
		"id": "lv_1_10_bosque_metapod",
		"speciesId": "metapod",
		"minLevel": 2,
		"maxLevel": 12,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"lv_1_10_bosque_butterfree": {
		"id": "lv_1_10_bosque_butterfree",
		"speciesId": "butterfree",
		"minLevel": 2,
		"maxLevel": 12,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
	},
	"lv_1_10_bosque_weedle": {
		"id": "lv_1_10_bosque_weedle",
		"speciesId": "weedle",
		"minLevel": 2,
		"maxLevel": 12,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"lv_1_10_bosque_kakuna": {
		"id": "lv_1_10_bosque_kakuna",
		"speciesId": "kakuna",
		"minLevel": 2,
		"maxLevel": 12,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"lv_1_10_bosque_beedrill": {
		"id": "lv_1_10_bosque_beedrill",
		"speciesId": "beedrill",
		"minLevel": 2,
		"maxLevel": 12,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
	},
	"lv_1_10_bosque_paras": {
		"id": "lv_1_10_bosque_paras",
		"speciesId": "paras",
		"minLevel": 2,
		"maxLevel": 12,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"lv_1_10_bosque_parasect": {
		"id": "lv_1_10_bosque_parasect",
		"speciesId": "parasect",
		"minLevel": 2,
		"maxLevel": 12,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"lv_1_10_bosque_venonat": {
		"id": "lv_1_10_bosque_venonat",
		"speciesId": "venonat",
		"minLevel": 2,
		"maxLevel": 12,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"lv_1_10_bosque_venomoth": {
		"id": "lv_1_10_bosque_venomoth",
		"speciesId": "venomoth",
		"minLevel": 2,
		"maxLevel": 12,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
	},
	"lv_1_10_bosque_scyther": {
		"id": "lv_1_10_bosque_scyther",
		"speciesId": "scyther",
		"minLevel": 2,
		"maxLevel": 12,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
	},
	"lv_1_10_bosque_pinsir": {
		"id": "lv_1_10_bosque_pinsir",
		"speciesId": "pinsir",
		"minLevel": 2,
		"maxLevel": 12,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
	},
	"lv_1_10_bosque_ledyba": {
		"id": "lv_1_10_bosque_ledyba",
		"speciesId": "ledyba",
		"minLevel": 2,
		"maxLevel": 12,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"lv_1_10_bosque_ledian": {
		"id": "lv_1_10_bosque_ledian",
		"speciesId": "ledian",
		"minLevel": 2,
		"maxLevel": 12,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
	},
	"lv_1_10_bosque_spinarak": {
		"id": "lv_1_10_bosque_spinarak",
		"speciesId": "spinarak",
		"minLevel": 2,
		"maxLevel": 12,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"lv_1_10_bosque_ariados": {
		"id": "lv_1_10_bosque_ariados",
		"speciesId": "ariados",
		"minLevel": 2,
		"maxLevel": 12,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
	},
	"lv_1_10_bosque_yanma": {
		"id": "lv_1_10_bosque_yanma",
		"speciesId": "yanma",
		"minLevel": 2,
		"maxLevel": 12,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
	},
	"lv_1_10_bosque_pineco": {
		"id": "lv_1_10_bosque_pineco",
		"speciesId": "pineco",
		"minLevel": 2,
		"maxLevel": 12,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"lv_1_10_bosque_forretress": {
		"id": "lv_1_10_bosque_forretress",
		"speciesId": "forretress",
		"minLevel": 2,
		"maxLevel": 12,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"lv_1_10_bosque_scizor": {
		"id": "lv_1_10_bosque_scizor",
		"speciesId": "scizor",
		"minLevel": 2,
		"maxLevel": 12,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"lv_1_10_bosque_heracross": {
		"id": "lv_1_10_bosque_heracross",
		"speciesId": "heracross",
		"minLevel": 2,
		"maxLevel": 12,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"lv_11_20_costa_magikarp": {
		"id": "lv_11_20_costa_magikarp",
		"speciesId": "magikarp",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 30
	},
	"lv_11_20_costa_wooper": {
		"id": "lv_11_20_costa_wooper",
		"speciesId": "wooper",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 30
	},
	"lv_11_20_costa_marill": {
		"id": "lv_11_20_costa_marill",
		"speciesId": "marill",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"lv_11_20_costa_totodile": {
		"id": "lv_11_20_costa_totodile",
		"speciesId": "totodile",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"lv_11_20_costa_poliwag": {
		"id": "lv_11_20_costa_poliwag",
		"speciesId": "poliwag",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 30
	},
	"lv_11_20_costa_remoraid": {
		"id": "lv_11_20_costa_remoraid",
		"speciesId": "remoraid",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 30
	},
	"lv_11_20_costa_psyduck": {
		"id": "lv_11_20_costa_psyduck",
		"speciesId": "psyduck",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 30
	},
	"lv_11_20_costa_horsea": {
		"id": "lv_11_20_costa_horsea",
		"speciesId": "horsea",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 30
	},
	"lv_11_20_costa_chinchou": {
		"id": "lv_11_20_costa_chinchou",
		"speciesId": "chinchou",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 30
	},
	"lv_11_20_costa_shellder": {
		"id": "lv_11_20_costa_shellder",
		"speciesId": "shellder",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 20
	},
	"lv_11_20_costa_slowpoke": {
		"id": "lv_11_20_costa_slowpoke",
		"speciesId": "slowpoke",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 30
	},
	"lv_11_20_costa_seel": {
		"id": "lv_11_20_costa_seel",
		"speciesId": "seel",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 20
	},
	"lv_11_20_costa_qwilfish": {
		"id": "lv_11_20_costa_qwilfish",
		"speciesId": "qwilfish",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 30
	},
	"lv_11_20_costa_tentacool": {
		"id": "lv_11_20_costa_tentacool",
		"speciesId": "tentacool",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 30
	},
	"lv_11_20_costa_staryu": {
		"id": "lv_11_20_costa_staryu",
		"speciesId": "staryu",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"lv_11_20_costa_goldeen": {
		"id": "lv_11_20_costa_goldeen",
		"speciesId": "goldeen",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 30
	},
	"lv_11_20_costa_corsola": {
		"id": "lv_11_20_costa_corsola",
		"speciesId": "corsola",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"lv_11_20_costa_krabby": {
		"id": "lv_11_20_costa_krabby",
		"speciesId": "krabby",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 30
	},
	"lv_11_20_costa_poliwhirl": {
		"id": "lv_11_20_costa_poliwhirl",
		"speciesId": "poliwhirl",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 20
	},
	"lv_11_20_costa_quagsire": {
		"id": "lv_11_20_costa_quagsire",
		"speciesId": "quagsire",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 20
	},
	"lv_11_20_planicie_pidgey": {
		"id": "lv_11_20_planicie_pidgey",
		"speciesId": "pidgey",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 20
	},
	"lv_11_20_planicie_pidgeotto": {
		"id": "lv_11_20_planicie_pidgeotto",
		"speciesId": "pidgeotto",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"lv_11_20_planicie_pidgeot": {
		"id": "lv_11_20_planicie_pidgeot",
		"speciesId": "pidgeot",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
	},
	"lv_11_20_planicie_rattata": {
		"id": "lv_11_20_planicie_rattata",
		"speciesId": "rattata",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 30
	},
	"lv_11_20_planicie_raticate": {
		"id": "lv_11_20_planicie_raticate",
		"speciesId": "raticate",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"lv_11_20_planicie_spearow": {
		"id": "lv_11_20_planicie_spearow",
		"speciesId": "spearow",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 30
	},
	"lv_11_20_planicie_fearow": {
		"id": "lv_11_20_planicie_fearow",
		"speciesId": "fearow",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"lv_11_20_planicie_jigglypuff": {
		"id": "lv_11_20_planicie_jigglypuff",
		"speciesId": "jigglypuff",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
	},
	"lv_11_20_planicie_meowth": {
		"id": "lv_11_20_planicie_meowth",
		"speciesId": "meowth",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"lv_11_20_planicie_persian": {
		"id": "lv_11_20_planicie_persian",
		"speciesId": "persian",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
	},
	"lv_11_20_planicie_farfetch_d": {
		"id": "lv_11_20_planicie_farfetch_d",
		"speciesId": "farfetch_d",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"lv_11_20_planicie_doduo": {
		"id": "lv_11_20_planicie_doduo",
		"speciesId": "doduo",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"lv_11_20_planicie_dodrio": {
		"id": "lv_11_20_planicie_dodrio",
		"speciesId": "dodrio",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
	},
	"lv_11_20_planicie_lickitung": {
		"id": "lv_11_20_planicie_lickitung",
		"speciesId": "lickitung",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 20
	},
	"lv_11_20_planicie_kangaskhan": {
		"id": "lv_11_20_planicie_kangaskhan",
		"speciesId": "kangaskhan",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"lv_11_20_planicie_tauros": {
		"id": "lv_11_20_planicie_tauros",
		"speciesId": "tauros",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"lv_11_20_planicie_ditto": {
		"id": "lv_11_20_planicie_ditto",
		"speciesId": "ditto",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"lv_11_20_planicie_eevee": {
		"id": "lv_11_20_planicie_eevee",
		"speciesId": "eevee",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"lv_11_20_planicie_porygon": {
		"id": "lv_11_20_planicie_porygon",
		"speciesId": "porygon",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"lv_11_20_planicie_snorlax": {
		"id": "lv_11_20_planicie_snorlax",
		"speciesId": "snorlax",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"lv_11_20_planicie_sentret": {
		"id": "lv_11_20_planicie_sentret",
		"speciesId": "sentret",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 20
	},
	"lv_11_20_planicie_furret": {
		"id": "lv_11_20_planicie_furret",
		"speciesId": "furret",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"lv_11_20_planicie_hoothoot": {
		"id": "lv_11_20_planicie_hoothoot",
		"speciesId": "hoothoot",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 20
	},
	"lv_11_20_planicie_noctowl": {
		"id": "lv_11_20_planicie_noctowl",
		"speciesId": "noctowl",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"lv_11_20_planicie_cleffa": {
		"id": "lv_11_20_planicie_cleffa",
		"speciesId": "cleffa",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"lv_11_20_planicie_igglybuff": {
		"id": "lv_11_20_planicie_igglybuff",
		"speciesId": "igglybuff",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"lv_11_20_planicie_togepi": {
		"id": "lv_11_20_planicie_togepi",
		"speciesId": "togepi",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"lv_11_20_planicie_aipom": {
		"id": "lv_11_20_planicie_aipom",
		"speciesId": "aipom",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 20
	},
	"lv_11_20_planicie_girafarig": {
		"id": "lv_11_20_planicie_girafarig",
		"speciesId": "girafarig",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 20
	},
	"lv_11_20_planicie_dunsparce": {
		"id": "lv_11_20_planicie_dunsparce",
		"speciesId": "dunsparce",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
	},
	"lv_11_20_planicie_snubbull": {
		"id": "lv_11_20_planicie_snubbull",
		"speciesId": "snubbull",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"lv_11_20_planicie_granbull": {
		"id": "lv_11_20_planicie_granbull",
		"speciesId": "granbull",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
	},
	"lv_11_20_planicie_teddiursa": {
		"id": "lv_11_20_planicie_teddiursa",
		"speciesId": "teddiursa",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
	},
	"lv_11_20_planicie_ursaring": {
		"id": "lv_11_20_planicie_ursaring",
		"speciesId": "ursaring",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"lv_11_20_planicie_porygon2": {
		"id": "lv_11_20_planicie_porygon2",
		"speciesId": "porygon2",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"lv_11_20_planicie_stantler": {
		"id": "lv_11_20_planicie_stantler",
		"speciesId": "stantler",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"lv_11_20_planicie_smeargle": {
		"id": "lv_11_20_planicie_smeargle",
		"speciesId": "smeargle",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"lv_11_20_planicie_miltank": {
		"id": "lv_11_20_planicie_miltank",
		"speciesId": "miltank",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"lv_21_30_caverna_geodude": {
		"id": "lv_21_30_caverna_geodude",
		"speciesId": "geodude",
		"minLevel": 18,
		"maxLevel": 32,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 30
	},
	"lv_21_30_caverna_graveler": {
		"id": "lv_21_30_caverna_graveler",
		"speciesId": "graveler",
		"minLevel": 18,
		"maxLevel": 32,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 30
	},
	"lv_21_30_caverna_golem": {
		"id": "lv_21_30_caverna_golem",
		"speciesId": "golem",
		"minLevel": 18,
		"maxLevel": 32,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
	},
	"lv_21_30_caverna_onix": {
		"id": "lv_21_30_caverna_onix",
		"speciesId": "onix",
		"minLevel": 18,
		"maxLevel": 32,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 20
	},
	"lv_21_30_caverna_omanyte": {
		"id": "lv_21_30_caverna_omanyte",
		"speciesId": "omanyte",
		"minLevel": 18,
		"maxLevel": 32,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"lv_21_30_caverna_omastar": {
		"id": "lv_21_30_caverna_omastar",
		"speciesId": "omastar",
		"minLevel": 18,
		"maxLevel": 32,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"lv_21_30_caverna_kabuto": {
		"id": "lv_21_30_caverna_kabuto",
		"speciesId": "kabuto",
		"minLevel": 18,
		"maxLevel": 32,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"lv_21_30_caverna_kabutops": {
		"id": "lv_21_30_caverna_kabutops",
		"speciesId": "kabutops",
		"minLevel": 18,
		"maxLevel": 32,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"lv_21_30_caverna_aerodactyl": {
		"id": "lv_21_30_caverna_aerodactyl",
		"speciesId": "aerodactyl",
		"minLevel": 18,
		"maxLevel": 32,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"lv_21_30_caverna_sudowoodo": {
		"id": "lv_21_30_caverna_sudowoodo",
		"speciesId": "sudowoodo",
		"minLevel": 18,
		"maxLevel": 32,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"lv_21_30_caverna_larvitar": {
		"id": "lv_21_30_caverna_larvitar",
		"speciesId": "larvitar",
		"minLevel": 18,
		"maxLevel": 32,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"lv_21_30_caverna_pupitar": {
		"id": "lv_21_30_caverna_pupitar",
		"speciesId": "pupitar",
		"minLevel": 18,
		"maxLevel": 32,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
	},
	"lv_21_30_caverna_tyranitar": {
		"id": "lv_21_30_caverna_tyranitar",
		"speciesId": "tyranitar",
		"minLevel": 18,
		"maxLevel": 32,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
	},
	"lv_21_30_deserto_sandshrew": {
		"id": "lv_21_30_deserto_sandshrew",
		"speciesId": "sandshrew",
		"minLevel": 18,
		"maxLevel": 32,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"lv_21_30_deserto_sandslash": {
		"id": "lv_21_30_deserto_sandslash",
		"speciesId": "sandslash",
		"minLevel": 18,
		"maxLevel": 32,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"lv_21_30_deserto_diglett": {
		"id": "lv_21_30_deserto_diglett",
		"speciesId": "diglett",
		"minLevel": 18,
		"maxLevel": 32,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 30
	},
	"lv_21_30_deserto_dugtrio": {
		"id": "lv_21_30_deserto_dugtrio",
		"speciesId": "dugtrio",
		"minLevel": 18,
		"maxLevel": 32,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"lv_21_30_deserto_cubone": {
		"id": "lv_21_30_deserto_cubone",
		"speciesId": "cubone",
		"minLevel": 18,
		"maxLevel": 32,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 30
	},
	"lv_21_30_deserto_marowak": {
		"id": "lv_21_30_deserto_marowak",
		"speciesId": "marowak",
		"minLevel": 18,
		"maxLevel": 32,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
	},
	"lv_21_30_deserto_rhyhorn": {
		"id": "lv_21_30_deserto_rhyhorn",
		"speciesId": "rhyhorn",
		"minLevel": 18,
		"maxLevel": 32,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"lv_21_30_deserto_rhydon": {
		"id": "lv_21_30_deserto_rhydon",
		"speciesId": "rhydon",
		"minLevel": 18,
		"maxLevel": 32,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
	},
	"lv_21_30_deserto_gligar": {
		"id": "lv_21_30_deserto_gligar",
		"speciesId": "gligar",
		"minLevel": 18,
		"maxLevel": 32,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"lv_21_30_deserto_phanpy": {
		"id": "lv_21_30_deserto_phanpy",
		"speciesId": "phanpy",
		"minLevel": 18,
		"maxLevel": 32,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
	},
	"lv_21_30_deserto_donphan": {
		"id": "lv_21_30_deserto_donphan",
		"speciesId": "donphan",
		"minLevel": 18,
		"maxLevel": 32,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"lv_31_40_vulcanico_charmeleon": {
		"id": "lv_31_40_vulcanico_charmeleon",
		"speciesId": "charmeleon",
		"minLevel": 15,
		"maxLevel": 51,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"lv_31_40_vulcanico_charizard": {
		"id": "lv_31_40_vulcanico_charizard",
		"speciesId": "charizard",
		"minLevel": 15,
		"maxLevel": 51,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
	},
	"lv_31_40_vulcanico_growlithe": {
		"id": "lv_31_40_vulcanico_growlithe",
		"speciesId": "growlithe",
		"minLevel": 15,
		"maxLevel": 51,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"lv_31_40_vulcanico_arcanine": {
		"id": "lv_31_40_vulcanico_arcanine",
		"speciesId": "arcanine",
		"minLevel": 15,
		"maxLevel": 51,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"lv_31_40_vulcanico_ponyta": {
		"id": "lv_31_40_vulcanico_ponyta",
		"speciesId": "ponyta",
		"minLevel": 15,
		"maxLevel": 51,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 20
	},
	"lv_31_40_vulcanico_rapidash": {
		"id": "lv_31_40_vulcanico_rapidash",
		"speciesId": "rapidash",
		"minLevel": 15,
		"maxLevel": 51,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"lv_31_40_vulcanico_magmar": {
		"id": "lv_31_40_vulcanico_magmar",
		"speciesId": "magmar",
		"minLevel": 15,
		"maxLevel": 51,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"lv_31_40_vulcanico_cyndaquil": {
		"id": "lv_31_40_vulcanico_cyndaquil",
		"speciesId": "cyndaquil",
		"minLevel": 15,
		"maxLevel": 51,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"lv_31_40_vulcanico_quilava": {
		"id": "lv_31_40_vulcanico_quilava",
		"speciesId": "quilava",
		"minLevel": 15,
		"maxLevel": 51,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"lv_31_40_vulcanico_typhlosion": {
		"id": "lv_31_40_vulcanico_typhlosion",
		"speciesId": "typhlosion",
		"minLevel": 15,
		"maxLevel": 51,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
	},
	"lv_31_40_vulcanico_slugma": {
		"id": "lv_31_40_vulcanico_slugma",
		"speciesId": "slugma",
		"minLevel": 15,
		"maxLevel": 51,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"lv_31_40_vulcanico_magcargo": {
		"id": "lv_31_40_vulcanico_magcargo",
		"speciesId": "magcargo",
		"minLevel": 15,
		"maxLevel": 51,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"lv_31_40_vulcanico_magby": {
		"id": "lv_31_40_vulcanico_magby",
		"speciesId": "magby",
		"minLevel": 15,
		"maxLevel": 51,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"lv_31_40_usina_pikachu": {
		"id": "lv_31_40_usina_pikachu",
		"speciesId": "pikachu",
		"minLevel": 15,
		"maxLevel": 51,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"lv_31_40_usina_magnemite": {
		"id": "lv_31_40_usina_magnemite",
		"speciesId": "magnemite",
		"minLevel": 15,
		"maxLevel": 51,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 20
	},
	"lv_31_40_usina_magneton": {
		"id": "lv_31_40_usina_magneton",
		"speciesId": "magneton",
		"minLevel": 15,
		"maxLevel": 51,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"lv_31_40_usina_voltorb": {
		"id": "lv_31_40_usina_voltorb",
		"speciesId": "voltorb",
		"minLevel": 15,
		"maxLevel": 51,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 30
	},
	"lv_31_40_usina_electrode": {
		"id": "lv_31_40_usina_electrode",
		"speciesId": "electrode",
		"minLevel": 15,
		"maxLevel": 51,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"lv_31_40_usina_electabuzz": {
		"id": "lv_31_40_usina_electabuzz",
		"speciesId": "electabuzz",
		"minLevel": 15,
		"maxLevel": 51,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"lv_31_40_usina_pichu": {
		"id": "lv_31_40_usina_pichu",
		"speciesId": "pichu",
		"minLevel": 15,
		"maxLevel": 51,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"lv_31_40_usina_mareep": {
		"id": "lv_31_40_usina_mareep",
		"speciesId": "mareep",
		"minLevel": 15,
		"maxLevel": 51,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"lv_31_40_usina_flaaffy": {
		"id": "lv_31_40_usina_flaaffy",
		"speciesId": "flaaffy",
		"minLevel": 15,
		"maxLevel": 51,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"lv_31_40_usina_ampharos": {
		"id": "lv_31_40_usina_ampharos",
		"speciesId": "ampharos",
		"minLevel": 15,
		"maxLevel": 51,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
	},
	"lv_31_40_usina_elekid": {
		"id": "lv_31_40_usina_elekid",
		"speciesId": "elekid",
		"minLevel": 15,
		"maxLevel": 51,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"lv_41_50_pantano_ekans": {
		"id": "lv_41_50_pantano_ekans",
		"speciesId": "ekans",
		"minLevel": 41,
		"maxLevel": 52,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"lv_41_50_pantano_arbok": {
		"id": "lv_41_50_pantano_arbok",
		"speciesId": "arbok",
		"minLevel": 41,
		"maxLevel": 52,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"lv_41_50_pantano_nidoran_f": {
		"id": "lv_41_50_pantano_nidoran_f",
		"speciesId": "nidoran_f",
		"minLevel": 41,
		"maxLevel": 52,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 20
	},
	"lv_41_50_pantano_nidorina": {
		"id": "lv_41_50_pantano_nidorina",
		"speciesId": "nidorina",
		"minLevel": 41,
		"maxLevel": 52,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 30
	},
	"lv_41_50_pantano_nidoqueen": {
		"id": "lv_41_50_pantano_nidoqueen",
		"speciesId": "nidoqueen",
		"minLevel": 41,
		"maxLevel": 52,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
	},
	"lv_41_50_pantano_nidoran_m": {
		"id": "lv_41_50_pantano_nidoran_m",
		"speciesId": "nidoran_m",
		"minLevel": 41,
		"maxLevel": 52,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 20
	},
	"lv_41_50_pantano_nidorino": {
		"id": "lv_41_50_pantano_nidorino",
		"speciesId": "nidorino",
		"minLevel": 41,
		"maxLevel": 52,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 30
	},
	"lv_41_50_pantano_nidoking": {
		"id": "lv_41_50_pantano_nidoking",
		"speciesId": "nidoking",
		"minLevel": 41,
		"maxLevel": 52,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
	},
	"lv_41_50_pantano_zubat": {
		"id": "lv_41_50_pantano_zubat",
		"speciesId": "zubat",
		"minLevel": 41,
		"maxLevel": 52,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 20
	},
	"lv_41_50_pantano_golbat": {
		"id": "lv_41_50_pantano_golbat",
		"speciesId": "golbat",
		"minLevel": 41,
		"maxLevel": 52,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"lv_41_50_pantano_grimer": {
		"id": "lv_41_50_pantano_grimer",
		"speciesId": "grimer",
		"minLevel": 41,
		"maxLevel": 52,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 30
	},
	"lv_41_50_pantano_muk": {
		"id": "lv_41_50_pantano_muk",
		"speciesId": "muk",
		"minLevel": 41,
		"maxLevel": 52,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"lv_41_50_pantano_koffing": {
		"id": "lv_41_50_pantano_koffing",
		"speciesId": "koffing",
		"minLevel": 41,
		"maxLevel": 52,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 30
	},
	"lv_41_50_pantano_weezing": {
		"id": "lv_41_50_pantano_weezing",
		"speciesId": "weezing",
		"minLevel": 41,
		"maxLevel": 52,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
	},
	"lv_41_50_dojo_mankey": {
		"id": "lv_41_50_dojo_mankey",
		"speciesId": "mankey",
		"minLevel": 41,
		"maxLevel": 52,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"lv_41_50_dojo_primeape": {
		"id": "lv_41_50_dojo_primeape",
		"speciesId": "primeape",
		"minLevel": 41,
		"maxLevel": 52,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
	},
	"lv_41_50_dojo_machop": {
		"id": "lv_41_50_dojo_machop",
		"speciesId": "machop",
		"minLevel": 41,
		"maxLevel": 52,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 20
	},
	"lv_41_50_dojo_machoke": {
		"id": "lv_41_50_dojo_machoke",
		"speciesId": "machoke",
		"minLevel": 41,
		"maxLevel": 52,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"lv_41_50_dojo_machamp": {
		"id": "lv_41_50_dojo_machamp",
		"speciesId": "machamp",
		"minLevel": 41,
		"maxLevel": 52,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
	},
	"lv_41_50_dojo_hitmonlee": {
		"id": "lv_41_50_dojo_hitmonlee",
		"speciesId": "hitmonlee",
		"minLevel": 41,
		"maxLevel": 52,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"lv_41_50_dojo_hitmonchan": {
		"id": "lv_41_50_dojo_hitmonchan",
		"speciesId": "hitmonchan",
		"minLevel": 41,
		"maxLevel": 52,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"lv_41_50_dojo_tyrogue": {
		"id": "lv_41_50_dojo_tyrogue",
		"speciesId": "tyrogue",
		"minLevel": 41,
		"maxLevel": 52,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"kanto_lv_1_10_geleira_jynx": {
		"id": "kanto_lv_1_10_geleira_jynx",
		"speciesId": "jynx",
		"minLevel": 52,
		"maxLevel": 62,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"kanto_lv_1_10_geleira_swinub": {
		"id": "kanto_lv_1_10_geleira_swinub",
		"speciesId": "swinub",
		"minLevel": 52,
		"maxLevel": 62,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 30
	},
	"kanto_lv_1_10_geleira_piloswine": {
		"id": "kanto_lv_1_10_geleira_piloswine",
		"speciesId": "piloswine",
		"minLevel": 52,
		"maxLevel": 62,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"kanto_lv_1_10_geleira_delibird": {
		"id": "kanto_lv_1_10_geleira_delibird",
		"speciesId": "delibird",
		"minLevel": 52,
		"maxLevel": 62,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"kanto_lv_1_10_geleira_smoochum": {
		"id": "kanto_lv_1_10_geleira_smoochum",
		"speciesId": "smoochum",
		"minLevel": 52,
		"maxLevel": 62,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"kanto_lv_1_10_fabrica_steelix": {
		"id": "kanto_lv_1_10_fabrica_steelix",
		"speciesId": "steelix",
		"minLevel": 52,
		"maxLevel": 62,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"kanto_lv_1_10_fabrica_skarmory": {
		"id": "kanto_lv_1_10_fabrica_skarmory",
		"speciesId": "skarmory",
		"minLevel": 52,
		"maxLevel": 62,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
	},
	"kanto_lv_1_10_fabrica_magnemite": {
		"id": "kanto_lv_1_10_fabrica_magnemite",
		"speciesId": "magnemite",
		"minLevel": 52,
		"maxLevel": 62,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 20
	},
	"kanto_lv_1_10_fabrica_forretress": {
		"id": "kanto_lv_1_10_fabrica_forretress",
		"speciesId": "forretress",
		"minLevel": 52,
		"maxLevel": 62,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"kanto_lv_1_10_fabrica_magneton": {
		"id": "kanto_lv_1_10_fabrica_magneton",
		"speciesId": "magneton",
		"minLevel": 52,
		"maxLevel": 62,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"kanto_lv_1_10_fabrica_scizor": {
		"id": "kanto_lv_1_10_fabrica_scizor",
		"speciesId": "scizor",
		"minLevel": 52,
		"maxLevel": 62,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"kanto_lv_11_20_penhascos_pidgey": {
		"id": "kanto_lv_11_20_penhascos_pidgey",
		"speciesId": "pidgey",
		"minLevel": 60,
		"maxLevel": 70,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 20
	},
	"kanto_lv_11_20_penhascos_spearow": {
		"id": "kanto_lv_11_20_penhascos_spearow",
		"speciesId": "spearow",
		"minLevel": 60,
		"maxLevel": 70,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 30
	},
	"kanto_lv_11_20_penhascos_zubat": {
		"id": "kanto_lv_11_20_penhascos_zubat",
		"speciesId": "zubat",
		"minLevel": 60,
		"maxLevel": 70,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 20
	},
	"kanto_lv_11_20_penhascos_hoothoot": {
		"id": "kanto_lv_11_20_penhascos_hoothoot",
		"speciesId": "hoothoot",
		"minLevel": 60,
		"maxLevel": 70,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 20
	},
	"kanto_lv_11_20_penhascos_ledyba": {
		"id": "kanto_lv_11_20_penhascos_ledyba",
		"speciesId": "ledyba",
		"minLevel": 60,
		"maxLevel": 70,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"kanto_lv_11_20_penhascos_hoppip": {
		"id": "kanto_lv_11_20_penhascos_hoppip",
		"speciesId": "hoppip",
		"minLevel": 60,
		"maxLevel": 70,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"kanto_lv_11_20_penhascos_doduo": {
		"id": "kanto_lv_11_20_penhascos_doduo",
		"speciesId": "doduo",
		"minLevel": 60,
		"maxLevel": 70,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"kanto_lv_11_20_penhascos_natu": {
		"id": "kanto_lv_11_20_penhascos_natu",
		"speciesId": "natu",
		"minLevel": 60,
		"maxLevel": 70,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 30
	},
	"kanto_lv_11_20_penhascos_pidgeotto": {
		"id": "kanto_lv_11_20_penhascos_pidgeotto",
		"speciesId": "pidgeotto",
		"minLevel": 60,
		"maxLevel": 70,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"kanto_lv_11_20_penhascos_skiploom": {
		"id": "kanto_lv_11_20_penhascos_skiploom",
		"speciesId": "skiploom",
		"minLevel": 60,
		"maxLevel": 70,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"kanto_lv_11_20_penhascos_fearow": {
		"id": "kanto_lv_11_20_penhascos_fearow",
		"speciesId": "fearow",
		"minLevel": 60,
		"maxLevel": 70,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"kanto_lv_11_20_penhascos_golbat": {
		"id": "kanto_lv_11_20_penhascos_golbat",
		"speciesId": "golbat",
		"minLevel": 60,
		"maxLevel": 70,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"kanto_lv_11_20_penhascos_noctowl": {
		"id": "kanto_lv_11_20_penhascos_noctowl",
		"speciesId": "noctowl",
		"minLevel": 60,
		"maxLevel": 70,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"kanto_lv_11_20_penhascos_ledian": {
		"id": "kanto_lv_11_20_penhascos_ledian",
		"speciesId": "ledian",
		"minLevel": 60,
		"maxLevel": 70,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
	},
	"kanto_lv_11_20_penhascos_xatu": {
		"id": "kanto_lv_11_20_penhascos_xatu",
		"speciesId": "xatu",
		"minLevel": 60,
		"maxLevel": 70,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"kanto_lv_11_20_penhascos_yanma": {
		"id": "kanto_lv_11_20_penhascos_yanma",
		"speciesId": "yanma",
		"minLevel": 60,
		"maxLevel": 70,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
	},
	"kanto_lv_11_20_torre_mistica_abra": {
		"id": "kanto_lv_11_20_torre_mistica_abra",
		"speciesId": "abra",
		"minLevel": 60,
		"maxLevel": 70,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"kanto_lv_11_20_torre_mistica_kadabra": {
		"id": "kanto_lv_11_20_torre_mistica_kadabra",
		"speciesId": "kadabra",
		"minLevel": 60,
		"maxLevel": 70,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"kanto_lv_11_20_torre_mistica_alakazam": {
		"id": "kanto_lv_11_20_torre_mistica_alakazam",
		"speciesId": "alakazam",
		"minLevel": 60,
		"maxLevel": 70,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
	},
	"kanto_lv_11_20_torre_mistica_drowzee": {
		"id": "kanto_lv_11_20_torre_mistica_drowzee",
		"speciesId": "drowzee",
		"minLevel": 60,
		"maxLevel": 70,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 20
	},
	"kanto_lv_11_20_torre_mistica_hypno": {
		"id": "kanto_lv_11_20_torre_mistica_hypno",
		"speciesId": "hypno",
		"minLevel": 60,
		"maxLevel": 70,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"kanto_lv_11_20_torre_mistica_natu": {
		"id": "kanto_lv_11_20_torre_mistica_natu",
		"speciesId": "natu",
		"minLevel": 60,
		"maxLevel": 70,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 30
	},
	"kanto_lv_11_20_torre_mistica_xatu": {
		"id": "kanto_lv_11_20_torre_mistica_xatu",
		"speciesId": "xatu",
		"minLevel": 60,
		"maxLevel": 70,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"kanto_lv_11_20_torre_mistica_unown": {
		"id": "kanto_lv_11_20_torre_mistica_unown",
		"speciesId": "unown",
		"minLevel": 60,
		"maxLevel": 70,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 30
	},
	"kanto_lv_11_20_torre_mistica_wobbuffet": {
		"id": "kanto_lv_11_20_torre_mistica_wobbuffet",
		"speciesId": "wobbuffet",
		"minLevel": 60,
		"maxLevel": 70,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"kanto_lv_21_35_cemiterio_gastly": {
		"id": "kanto_lv_21_35_cemiterio_gastly",
		"speciesId": "gastly",
		"minLevel": 68,
		"maxLevel": 85,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 20
	},
	"kanto_lv_21_35_cemiterio_haunter": {
		"id": "kanto_lv_21_35_cemiterio_haunter",
		"speciesId": "haunter",
		"minLevel": 68,
		"maxLevel": 85,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"kanto_lv_21_35_cemiterio_gengar": {
		"id": "kanto_lv_21_35_cemiterio_gengar",
		"speciesId": "gengar",
		"minLevel": 68,
		"maxLevel": 85,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
	},
	"kanto_lv_21_35_cemiterio_misdreavus": {
		"id": "kanto_lv_21_35_cemiterio_misdreavus",
		"speciesId": "misdreavus",
		"minLevel": 68,
		"maxLevel": 85,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"kanto_lv_21_35_covil_sombrio_murkrow": {
		"id": "kanto_lv_21_35_covil_sombrio_murkrow",
		"speciesId": "murkrow",
		"minLevel": 68,
		"maxLevel": 85,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"kanto_lv_21_35_covil_sombrio_sneasel": {
		"id": "kanto_lv_21_35_covil_sombrio_sneasel",
		"speciesId": "sneasel",
		"minLevel": 68,
		"maxLevel": 85,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
	},
	"kanto_lv_21_35_covil_sombrio_houndour": {
		"id": "kanto_lv_21_35_covil_sombrio_houndour",
		"speciesId": "houndour",
		"minLevel": 68,
		"maxLevel": 85,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"kanto_lv_21_35_covil_sombrio_houndoom": {
		"id": "kanto_lv_21_35_covil_sombrio_houndoom",
		"speciesId": "houndoom",
		"minLevel": 68,
		"maxLevel": 85,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"kanto_lv_36_55_ruinas_ancestrais_dratini": {
		"id": "kanto_lv_36_55_ruinas_ancestrais_dratini",
		"speciesId": "dratini",
		"minLevel": 80,
		"maxLevel": 105,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 20
	},
	"kanto_lv_36_55_ruinas_ancestrais_dragonair": {
		"id": "kanto_lv_36_55_ruinas_ancestrais_dragonair",
		"speciesId": "dragonair",
		"minLevel": 80,
		"maxLevel": 105,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"kanto_lv_36_55_ruinas_ancestrais_dragonite": {
		"id": "kanto_lv_36_55_ruinas_ancestrais_dragonite",
		"speciesId": "dragonite",
		"minLevel": 80,
		"maxLevel": 105,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
	},
	"kanto_lv_36_55_ruinas_ancestrais_kingdra": {
		"id": "kanto_lv_36_55_ruinas_ancestrais_kingdra",
		"speciesId": "kingdra",
		"minLevel": 80,
		"maxLevel": 105,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
	},
	"kanto_lv_36_55_profundezas_wartortle": {
		"id": "kanto_lv_36_55_profundezas_wartortle",
		"speciesId": "wartortle",
		"minLevel": 80,
		"maxLevel": 105,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"kanto_lv_36_55_profundezas_croconaw": {
		"id": "kanto_lv_36_55_profundezas_croconaw",
		"speciesId": "croconaw",
		"minLevel": 80,
		"maxLevel": 105,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"kanto_lv_36_55_profundezas_azumarill": {
		"id": "kanto_lv_36_55_profundezas_azumarill",
		"speciesId": "azumarill",
		"minLevel": 80,
		"maxLevel": 105,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"kanto_lv_36_55_profundezas_seadra": {
		"id": "kanto_lv_36_55_profundezas_seadra",
		"speciesId": "seadra",
		"minLevel": 80,
		"maxLevel": 105,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"kanto_lv_36_55_profundezas_lanturn": {
		"id": "kanto_lv_36_55_profundezas_lanturn",
		"speciesId": "lanturn",
		"minLevel": 80,
		"maxLevel": 105,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"kanto_lv_36_55_profundezas_slowbro": {
		"id": "kanto_lv_36_55_profundezas_slowbro",
		"speciesId": "slowbro",
		"minLevel": 80,
		"maxLevel": 105,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"kanto_lv_36_55_profundezas_octillery": {
		"id": "kanto_lv_36_55_profundezas_octillery",
		"speciesId": "octillery",
		"minLevel": 80,
		"maxLevel": 105,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"kanto_lv_36_55_profundezas_mantine": {
		"id": "kanto_lv_36_55_profundezas_mantine",
		"speciesId": "mantine",
		"minLevel": 80,
		"maxLevel": 105,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"kanto_lv_36_55_profundezas_seaking": {
		"id": "kanto_lv_36_55_profundezas_seaking",
		"speciesId": "seaking",
		"minLevel": 80,
		"maxLevel": 105,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 20
	},
	"kanto_lv_36_55_profundezas_golduck": {
		"id": "kanto_lv_36_55_profundezas_golduck",
		"speciesId": "golduck",
		"minLevel": 80,
		"maxLevel": 105,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"kanto_lv_36_55_profundezas_dewgong": {
		"id": "kanto_lv_36_55_profundezas_dewgong",
		"speciesId": "dewgong",
		"minLevel": 80,
		"maxLevel": 105,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
	},
	"kanto_lv_36_55_profundezas_politoed": {
		"id": "kanto_lv_36_55_profundezas_politoed",
		"speciesId": "politoed",
		"minLevel": 80,
		"maxLevel": 105,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
	},
	"kanto_lv_36_55_profundezas_tentacruel": {
		"id": "kanto_lv_36_55_profundezas_tentacruel",
		"speciesId": "tentacruel",
		"minLevel": 80,
		"maxLevel": 105,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"kanto_lv_36_55_profundezas_kingler": {
		"id": "kanto_lv_36_55_profundezas_kingler",
		"speciesId": "kingler",
		"minLevel": 80,
		"maxLevel": 105,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 20
	},
	"kanto_lv_36_55_profundezas_kingdra": {
		"id": "kanto_lv_36_55_profundezas_kingdra",
		"speciesId": "kingdra",
		"minLevel": 80,
		"maxLevel": 105,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
	},
	"kanto_lv_36_55_profundezas_blastoise": {
		"id": "kanto_lv_36_55_profundezas_blastoise",
		"speciesId": "blastoise",
		"minLevel": 80,
		"maxLevel": 105,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
	},
	"kanto_lv_36_55_profundezas_feraligatr": {
		"id": "kanto_lv_36_55_profundezas_feraligatr",
		"speciesId": "feraligatr",
		"minLevel": 80,
		"maxLevel": 105,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
	},
	"kanto_lv_36_55_profundezas_gyarados": {
		"id": "kanto_lv_36_55_profundezas_gyarados",
		"speciesId": "gyarados",
		"minLevel": 80,
		"maxLevel": 105,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 20
	},
	"kanto_lv_36_55_profundezas_lapras": {
		"id": "kanto_lv_36_55_profundezas_lapras",
		"speciesId": "lapras",
		"minLevel": 80,
		"maxLevel": 105,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	}
};
//#endregion
//#region src/data/legendaries.ts
var LEGENDARY_SPECIES_IDS = [
	"articuno",
	"zapdos",
	"moltres",
	"raikou",
	"entei",
	"suicune",
	"lugia",
	"ho_oh",
	"celebi",
	"mewtwo",
	"mew"
];
//#endregion
//#region src/data/nightmareMaps.ts
var TYPE_BACKGROUND_IMAGE = {
	FIRE: "assets/hunt-backgrounds/fire.png",
	WATER: "assets/hunt-backgrounds/water.png",
	GRASS: "assets/hunt-backgrounds/forest.png",
	ROCK: "assets/hunt-backgrounds/cave.png",
	FIGHTING: "assets/hunt-backgrounds/dojo.png",
	ELECTRIC: "assets/hunt-backgrounds/eletric.png",
	DRAGON: "assets/hunt-backgrounds/dragon.png",
	BUG: "assets/hunt-backgrounds/forest.png",
	NORMAL: "assets/hunt-backgrounds/forest.png",
	POISON: "assets/hunt-backgrounds/water.png",
	FLYING: "assets/hunt-backgrounds/water.png",
	GROUND: "assets/hunt-backgrounds/cave.png",
	ICE: "assets/hunt-backgrounds/cave.png",
	STEEL: "assets/hunt-backgrounds/cave.png",
	PSYCHIC: "assets/hunt-backgrounds/dojo.png",
	GHOST: "assets/hunt-backgrounds/cave.png",
	DARK: "assets/hunt-backgrounds/cave.png"
};
function bossBackgroundImage(species) {
	return TYPE_BACKGROUND_IMAGE[species.type] || (species.type2 ? TYPE_BACKGROUND_IMAGE[species.type2] : void 0) || null;
}
var LEVEL_OFFSET = 100;
var BOSS_LEVEL = 300;
var NIGHTMARE_MIN_LEVEL = 150;
var shiftLevel = (level) => Math.max(level + LEVEL_OFFSET, NIGHTMARE_MIN_LEVEL);
function buildNightmareMirror(sourceMaps, sourceEncounters) {
	const maps = {};
	const encounters = {};
	for (const map of Object.values(sourceMaps)) {
		const newId = `nightmare_${map.id}`;
		const enemyPool = [];
		for (const encId of map.enemyPool) {
			const enc = sourceEncounters[encId];
			if (!enc) continue;
			const newEncId = `nightmare_${encId}`;
			encounters[newEncId] = {
				...enc,
				id: newEncId,
				minLevel: shiftLevel(enc.minLevel),
				maxLevel: shiftLevel(enc.maxLevel),
				...enc.levelWeights ? { levelWeights: enc.levelWeights.map((lw) => ({
					...lw,
					level: shiftLevel(lw.level)
				})) } : {}
			};
			enemyPool.push(newEncId);
		}
		maps[newId] = {
			...map,
			id: newId,
			name: `${map.name} (Pesadelo)`,
			continent: "nightmare",
			levelRange: [shiftLevel(map.levelRange[0]), shiftLevel(map.levelRange[1])],
			unlockCost: null,
			enemyPool
		};
	}
	return {
		maps,
		encounters
	};
}
function buildBossHunts() {
	const maps = {};
	const encounters = {};
	for (const speciesId of LEGENDARY_SPECIES_IDS) {
		const species = SPECIES[speciesId];
		if (!species) continue;
		const mapId = `boss_${speciesId}`;
		const encId = `${mapId}_encounter`;
		encounters[encId] = {
			id: encId,
			speciesId,
			minLevel: BOSS_LEVEL,
			maxLevel: BOSS_LEVEL,
			aggroRadius: 175,
			wanderRadius: 60,
			weight: 1
		};
		maps[mapId] = {
			id: mapId,
			name: `BOSS ${species.name}`,
			description: `Covil do lendario ${species.name} (nivel ${BOSS_LEVEL}) — aparece uma unica vez, sem respawn.`,
			levelRange: [BOSS_LEVEL, BOSS_LEVEL],
			unlockCost: null,
			continent: "nightmare",
			bounds: {
				width: 1400,
				height: 900
			},
			playerSpawn: {
				x: 700,
				y: 450
			},
			bg: {
				primary: "#3e2f23",
				secondary: "#4a3829",
				image: bossBackgroundImage(species)
			},
			maxEnemies: 1,
			noRespawn: true,
			respawnDelay: 6,
			spawnPoints: [{
				x: 700,
				y: 450
			}],
			enemyPool: [encId],
			itemDrops: []
		};
	}
	return {
		maps,
		encounters
	};
}
var LANCE_MAP_ID = "boss_lance";
var LANCE_RARITY = "legendary";
var LANCE_IVS = {
	hp: 23,
	atkFis: 23,
	atkEsp: 23,
	def: 23,
	defEsp: 23,
	speed: 23
};
var LANCE_TEAM = [
	{
		speciesId: "gyarados",
		level: 60
	},
	{
		speciesId: "dragonite",
		level: 55
	},
	{
		speciesId: "charizard",
		level: 60
	},
	{
		speciesId: "dragonite",
		level: 56
	},
	{
		speciesId: "aerodactyl",
		level: 60
	},
	{
		speciesId: "dragonite",
		level: 65
	}
];
function buildLanceHunt() {
	const encounters = {};
	const enemyPool = LANCE_TEAM.map((entry, i) => {
		const encId = `${LANCE_MAP_ID}_${i}`;
		encounters[encId] = {
			id: encId,
			speciesId: entry.speciesId,
			minLevel: entry.level,
			maxLevel: entry.level,
			aggroRadius: 175,
			wanderRadius: 60,
			weight: 1,
			rarity: LANCE_RARITY,
			ivs: LANCE_IVS
		};
		return encId;
	});
	return {
		map: {
			id: LANCE_MAP_ID,
			name: "BOSS Campeao Lance",
			description: "Batalha final de Johto contra o Campeao Lance — 6 POKEs Lendarios em sequencia (Gyarados, Dragonite, Charizard, Dragonite, Aerodactyl, Dragonite). Sem auto-pot/revive; ao desmaiar, o proximo POKE da equipe entra automaticamente. Captura desabilitada. Derrota-lo libera o Novo Continente (Kanto).",
			levelRange: [55, 65],
			unlockCost: null,
			continent: "johto",
			bounds: {
				width: 1400,
				height: 900
			},
			playerSpawn: {
				x: 700,
				y: 450
			},
			bg: {
				primary: "#3e2f23",
				secondary: "#4a3829",
				image: TYPE_BACKGROUND_IMAGE.DRAGON ?? null
			},
			maxEnemies: 1,
			noRespawn: true,
			noCatch: true,
			autoSwitchTeamOnFaint: true,
			sequence: enemyPool,
			unlocksContinentOnClear: "kanto",
			startCountdown: 5,
			keepCorpses: true,
			respawnDelay: 3,
			spawnPoints: [{
				x: 700,
				y: 450
			}],
			enemyPool,
			itemDrops: []
		},
		encounters
	};
}
var bosses = buildBossHunts();
var lance = buildLanceHunt();
var BOSS_MAPS_DATA = {
	...bosses.maps,
	[LANCE_MAP_ID]: lance.map
};
var BOSS_ENCOUNTERS_DATA = {
	...bosses.encounters,
	...lance.encounters
};
//#endregion
//#region src/data/evolutionStage.ts
var PRE_EVOLUCAO = {};
for (const especie of Object.values(SPECIES)) if (especie.evolvesTo && SPECIES[especie.evolvesTo]) PRE_EVOLUCAO[especie.evolvesTo] = especie.id;
var PROFUNDIDADE_MAXIMA = 10;
var CACHE = {};
/** 1 = forma base, 2 = primeira evolucao, 3+ = segunda evolucao em diante. */
function evolutionStage(speciesId) {
	const memo = CACHE[speciesId];
	if (memo != null) return memo;
	let estagio = 1;
	let atual = speciesId;
	while (PRE_EVOLUCAO[atual] && estagio < PROFUNDIDADE_MAXIMA) {
		atual = PRE_EVOLUCAO[atual];
		estagio += 1;
	}
	CACHE[speciesId] = estagio;
	return estagio;
}
/** "Pokemon de 3a evolucao" no sentido do jogador: o fim de uma cadeia de tres. */
function isTerceiraEvolucao(speciesId) {
	return evolutionStage(speciesId) >= 3;
}
//#endregion
//#region src/data/spawnStrength.ts
/** Soma dos 6 atributos base — a medida de forca usada em toda a serie. */
function baseStatTotal(speciesId) {
	const b = SPECIES_DATA[speciesId]?.base;
	if (!b) return 0;
	return b.hp + b.atkFis + b.atkEsp + b.def + b.defEsp + b.speed;
}
/**
* Faixas de forca -> zona minima.
*
* Os cortes saem da distribuicao real do elenco (226 especies): 300-349 e a
* moda (49 especies), 450-499 vem logo atras (41), e so 14 passam de 550. Nao
* sao numeros redondos escolhidos a esmo — sao os degraus onde a populacao
* realmente muda de patamar.
*
* Zona 3 e o primeiro degrau acima de Lv 30, que e o piso pedido
* explicitamente ("restrinja o spawn deles estritamente para zonas com faixa
* de level 30+"): toda especie com 425 de total ou mais cai nele ou acima.
*/
var FAIXAS = [
	{
		bstMinimo: 525,
		zona: 7
	},
	{
		bstMinimo: 475,
		zona: 5
	},
	{
		bstMinimo: 425,
		zona: 3
	},
	{
		bstMinimo: 350,
		zona: 1
	},
	{
		bstMinimo: 0,
		zona: 0
	}
];
/**
* Piso por estagio de evolucao, indexado por `evolutionStage` (1 = forma base).
*
* Existe porque BST sozinho deixa passar forma final fraca: Butterfree (395) e
* Beedrill (395) sao 3as evolucoes e cairiam na Zona 1 junto com o Caterpie
* que virou eles. Uma forma evoluida na zona de estreia le como bug mesmo
* quando o numero permite.
*/
var PISO_POR_ESTAGIO = [
	0,
	0,
	1,
	2
];
function zonaMinimaDaEspecie(speciesId) {
	const bst = baseStatTotal(speciesId);
	const porForca = FAIXAS.find((f) => bst >= f.bstMinimo)?.zona ?? 0;
	const estagio = Math.min(evolutionStage(speciesId), PISO_POR_ESTAGIO.length - 1);
	return Math.max(porForca, PISO_POR_ESTAGIO[estagio]);
}
//#endregion
//#region src/data/regions.ts
var LAST_KANTO_DEX = 151;
var DEX_RE = /Nº\s*(\d+)/;
var POKEDEX_NUMBER = Object.fromEntries(Object.entries(SPECIES_DATA).map(([id, species]) => {
	const match = species.description.match(DEX_RE);
	if (!match) throw new Error(`Especie "${id}" sem numero de Pokedex na descricao ("${species.description}") — sem ele nao da pra dizer se ela e de Kanto ou de Johto.`);
	return [id, Number(match[1])];
}));
function pokedexNumber(speciesId) {
	const dex = POKEDEX_NUMBER[speciesId];
	if (dex == null) throw new Error(`Especie desconhecida: ${speciesId}`);
	return dex;
}
function regionOfSpecies(speciesId) {
	return pokedexNumber(speciesId) <= LAST_KANTO_DEX ? "kanto" : "johto";
}
var REGIONS = ["johto", "kanto"];
var REGION_LABEL = {
	johto: "Johto",
	kanto: "Kanto"
};
var NON_WILD_SPECIES = /* @__PURE__ */ new Set([
	"porygon",
	"porygon2",
	"eevee"
]);
//#endregion
//#region src/data/huntSpawnOverrides.ts
var HUNT_BIOME = {
	lv_1_10_floresta: "GRASS",
	lv_1_10_bosque: "BUG",
	lv_11_20_costa: "WATER",
	lv_11_20_planicie: "NORMAL",
	lv_21_30_caverna: "ROCK",
	lv_21_30_deserto: "GROUND",
	lv_31_40_vulcanico: "FIRE",
	lv_31_40_usina: "ELECTRIC",
	lv_41_50_pantano: "POISON",
	lv_41_50_dojo: "FIGHTING",
	kanto_lv_1_10_geleira: "ICE",
	kanto_lv_1_10_fabrica: "STEEL",
	kanto_lv_11_20_penhascos: "FLYING",
	kanto_lv_11_20_torre_mistica: "PSYCHIC",
	kanto_lv_21_35_cemiterio: "GHOST",
	kanto_lv_21_35_covil_sombrio: "DARK",
	kanto_lv_36_55_ruinas_ancestrais: "DRAGON",
	kanto_lv_36_55_profundezas: "WATER"
};
var ZONA_POR_HUNT = {
	lv_1_10_floresta: 0,
	lv_1_10_bosque: 0,
	lv_11_20_costa: 1,
	lv_11_20_planicie: 1,
	lv_21_30_caverna: 2,
	lv_21_30_deserto: 2,
	lv_31_40_vulcanico: 3,
	lv_31_40_usina: 3,
	lv_41_50_pantano: 4,
	lv_41_50_dojo: 4,
	kanto_lv_1_10_geleira: 5,
	kanto_lv_1_10_fabrica: 5,
	kanto_lv_11_20_penhascos: 6,
	kanto_lv_11_20_torre_mistica: 6,
	kanto_lv_21_35_cemiterio: 7,
	kanto_lv_21_35_covil_sombrio: 7,
	kanto_lv_36_55_ruinas_ancestrais: 8,
	kanto_lv_36_55_profundezas: 8
};
var NIVEIS_POR_ZONA = 10;
function faixaDaZona(zona) {
	return [zona * NIVEIS_POR_ZONA + 1, (zona + 1) * NIVEIS_POR_ZONA];
}
function rotuloDoBioma(baseName) {
	const m = baseName.match(/\(([^)]+)\)\s*$/);
	return m ? m[1] : baseName;
}
var STARTER_HUNT_ID = "route_46";
var STARTER_HUNT_SPECIES = [
	"sentret",
	"hoothoot",
	"rattata"
];
var STARTER_LEVEL_WEIGHTS = [{
	level: 1,
	weight: 80
}, {
	level: 2,
	weight: 20
}];
var SPECIES_BIOME_OVERRIDE = {
	wooper: "GROUND",
	quagsire: "GROUND"
};
var MIN_TYPE_POOL = 4;
var BASE_STARTERS = /* @__PURE__ */ new Set([
	"charmander",
	"squirtle",
	"bulbasaur"
]);
var LEGENDARY = new Set(LEGENDARY_SPECIES_IDS);
var WILD_SPECIES_IDS = Object.keys(SPECIES_DATA).filter((id) => !BASE_STARTERS.has(id) && !LEGENDARY.has(id) && !NON_WILD_SPECIES.has(id)).sort((a, b) => pokedexNumber(a) - pokedexNumber(b));
function biomeOf(speciesId) {
	return SPECIES_BIOME_OVERRIDE[speciesId] ?? SPECIES_DATA[speciesId].type;
}
function poolFor(region, biome) {
	const mine = WILD_SPECIES_IDS.filter((id) => regionOfSpecies(id) === region);
	const primary = mine.filter((id) => biomeOf(id) === biome);
	if (primary.length >= MIN_TYPE_POOL) return primary;
	const secondary = mine.filter((id) => SPECIES_DATA[id].type2 === biome && !primary.includes(id));
	return [...primary, ...secondary];
}
var WEIGHT_BY_SPECIES = {};
for (const enc of Object.values(ENCOUNTERS_DATA)) WEIGHT_BY_SPECIES[enc.speciesId] = enc.weight;
var DEFAULT_WEIGHT = 10;
var maps = {};
var encounters = {};
function addEncounter(huntId, speciesId, minLevel, maxLevel, levelWeights) {
	const id = `${huntId}_${speciesId}`;
	encounters[id] = {
		id,
		speciesId,
		minLevel,
		maxLevel,
		aggroRadius: 175,
		wanderRadius: 60,
		weight: WEIGHT_BY_SPECIES[speciesId] ?? DEFAULT_WEIGHT,
		...levelWeights ? { levelWeights } : {}
	};
	return id;
}
var MIN_POOL_ZONA_AVANCADA = 3;
/**
* Junta as zonas avancadas magras, subindo o nivel de quem foi absorvido.
*
* Duas regras que nao sao arbitrarias:
*
* 1. **A zona BASE do bioma sempre sai como hunt propria**, mesmo com pool
*    pequeno. Ela e a que carrega o id historico (`lv_1_10_bosque`), e esse id
*    aparece em `unlocked_maps` e em `game_sessions.map_id` no Postgres —
*    fundi-la deixaria sessao viva apontando pra hunt que nao existe mais.
* 2. **A fusao so sobe de nivel, nunca desce.** `zonaMinimaDaEspecie` e um
*    PISO: subir respeita todo mundo do grupo, descer colocaria de volta na
*    hunt cedo exatamente o POKE que esta leva tirou de la.
*
* A sobra do topo vira hunt propria mesmo com uma especie so. A alternativa
* (fundir pra baixo) apagaria a hunt cedo do bioma; e uma hunt de um POKE so —
* Tyranitar na Zona 7 da Caverna, por exemplo — e conteudo legitimo, nao erro:
* e o dado real de Johto ter poucas especies ROCK.
*/
function agruparZonasMagras(porZona, zonaBase) {
	const saida = [];
	const base = porZona.get(zonaBase);
	if (base?.length) saida.push([zonaBase, base]);
	const acima = [...porZona.entries()].filter(([z]) => z !== zonaBase).sort((a, b) => a[0] - b[0]);
	let acumulado = [];
	for (const [z, especies] of acima) {
		acumulado = [...acumulado, ...especies];
		if (acumulado.length >= MIN_POOL_ZONA_AVANCADA) {
			saida.push([z, acumulado]);
			acumulado = [];
		}
	}
	if (acumulado.length) saida.push([acima[acima.length - 1][0], acumulado]);
	return saida;
}
function nameFor(baseName, region, zona) {
	return `${REGION_LABEL[region]} Zona ${zona} · ${rotuloDoBioma(baseName)}`;
}
for (const base of Object.values(MAPS_DATA)) {
	if (base.id === STARTER_HUNT_ID) {
		const pool = STARTER_HUNT_SPECIES.filter((id) => SPECIES_DATA[id]);
		maps[base.id] = {
			...base,
			name: "Route 46 (Inicial)",
			continent: "johto",
			levelRange: [STARTER_LEVEL_WEIGHTS[0].level, STARTER_LEVEL_WEIGHTS[STARTER_LEVEL_WEIGHTS.length - 1].level],
			enemyPool: pool.map((speciesId) => addEncounter(base.id, speciesId, STARTER_LEVEL_WEIGHTS[0].level, STARTER_LEVEL_WEIGHTS[STARTER_LEVEL_WEIGHTS.length - 1].level, STARTER_LEVEL_WEIGHTS))
		};
		continue;
	}
	const biome = HUNT_BIOME[base.id];
	if (!biome) throw new Error(`Hunt "${base.id}" sem bioma em HUNT_BIOME (data/huntSpawnOverrides.ts). Toda hunt gerada precisa declarar o tipo elemental dela pro recorte por regiao funcionar.`);
	const zona = ZONA_POR_HUNT[base.id];
	if (zona == null) throw new Error(`Hunt "${base.id}" sem zona em ZONA_POR_HUNT (data/huntSpawnOverrides.ts). Sem numero de zona nao ha faixa de nivel — e era justamente a divergencia entre nome e nivel que esta tabela existe pra fechar.`);
	for (const region of REGIONS) {
		const pool = poolFor(region, biome);
		if (!pool.length) continue;
		const idBase = base.continent === region ? base.id : `${base.id}_${region}`;
		const porZona = /* @__PURE__ */ new Map();
		for (const speciesId of pool) {
			const alvo = Math.max(zona, zonaMinimaDaEspecie(speciesId));
			const lista = porZona.get(alvo);
			if (lista) lista.push(speciesId);
			else porZona.set(alvo, [speciesId]);
		}
		for (const [zonaAlvo, especies] of agruparZonasMagras(porZona, zona)) {
			const id = zonaAlvo === zona ? idBase : `${idBase}_z${zonaAlvo}`;
			const [lo, hi] = faixaDaZona(zonaAlvo);
			const name = nameFor(base.name, region, zonaAlvo);
			maps[id] = {
				...base,
				id,
				name,
				levelRange: [lo, hi],
				description: `Local selvagem: ${name} (nivel ${lo}-${hi}).`,
				continent: region,
				enemyPool: especies.map((speciesId) => addEncounter(id, speciesId, lo, hi))
			};
		}
	}
}
var SHARE_TERCEIRA_EVOLUCAO = .002;
var LIMITE_ZONA_DE_FINAIS = .5;
for (const map of Object.values(maps)) {
	const fixos = map.enemyPool.filter((id) => isTerceiraEvolucao(encounters[id].speciesId));
	if (!fixos.length) continue;
	if (fixos.length / map.enemyPool.length >= LIMITE_ZONA_DE_FINAIS) continue;
	const pesoDosOutros = map.enemyPool.filter((id) => !fixos.includes(id)).reduce((soma, id) => soma + encounters[id].weight, 0);
	const denominador = 1 - SHARE_TERCEIRA_EVOLUCAO * fixos.length;
	if (pesoDosOutros <= 0 || denominador <= 0) continue;
	const peso = SHARE_TERCEIRA_EVOLUCAO * pesoDosOutros / denominador;
	for (const id of fixos) encounters[id].weight = peso;
}
var nightmare = buildNightmareMirror(maps, encounters);
var MAPS = {
	...maps,
	...nightmare.maps,
	...BOSS_MAPS_DATA
};
var ENCOUNTERS = {
	...encounters,
	...nightmare.encounters,
	...BOSS_ENCOUNTERS_DATA
};
//#endregion
//#region src/data/maps.ts
var RESPAWN_DELAY_MULTIPLIER = createFormulaEngine(FORMULAS).evalOrDefault("MOB_RESPAWN_DELAY_MULTIPLIER", .25);
var WATER_HUNT_IDS = /* @__PURE__ */ new Set(["lv_11_20_costa", "kanto_lv_36_55_profundezas"]);
function getMap(id) {
	const map = MAPS[id];
	if (!map) return null;
	if (WATER_HUNT_IDS.has(id)) return {
		...map,
		respawnDelay: map.respawnDelay * RESPAWN_DELAY_MULTIPLIER,
		collisionGrid: WATER_COLLISION_GRID,
		playerSpawn: WATER_SPAWN_POINT
	};
	const collisionGrid = null;
	return {
		...map,
		respawnDelay: map.respawnDelay * RESPAWN_DELAY_MULTIPLIER,
		collisionGrid
	};
}
function isCellBlocked(mapDef, x, y) {
	const grid = mapDef.collisionGrid;
	if (!grid) return false;
	const col = Math.floor(x / 40);
	const row = Math.floor(y / 40);
	if (row < 0 || row >= grid.length || col < 0 || col >= grid[0].length) return false;
	return grid[row][col] === "1";
}
function mapWalkRadius(mapDef) {
	return Math.min(mapDef.bounds.width, mapDef.bounds.height) / 2;
}
//#endregion
//#region src/data/enemies.ts
function getEncounter(id) {
	return ENCOUNTERS[id] || null;
}
//#endregion
//#region src/data/generated/items.generated.ts
var ITEMS_DATA = {
	"poke_ball": {
		"id": "poke_ball",
		"name": "Poké Ball",
		"kind": "ball",
		"description": "Item de captura.",
		"buyPrice": 200,
		"captureRate": 1
	},
	"great_ball": {
		"id": "great_ball",
		"name": "Great Ball",
		"kind": "ball",
		"description": "Item de captura.",
		"buyPrice": 600,
		"captureRate": 1.5
	},
	"ultra_ball": {
		"id": "ultra_ball",
		"name": "Ultra Ball",
		"kind": "ball",
		"description": "Item de captura.",
		"buyPrice": 1200,
		"captureRate": 2
	},
	"premier_ball": {
		"id": "premier_ball",
		"name": "Premier Ball",
		"kind": "ball",
		"description": "Item de captura.",
		"buyPrice": 3e3,
		"captureRate": 3
	},
	"potion": {
		"id": "potion",
		"name": "Potion",
		"kind": "potion",
		"description": "Restaura HP.",
		"buyPrice": 300,
		"healAmount": 20
	},
	"super_potion": {
		"id": "super_potion",
		"name": "Super Potion",
		"kind": "potion",
		"description": "Restaura HP.",
		"buyPrice": 700,
		"healAmount": 50
	},
	"hyper_potion": {
		"id": "hyper_potion",
		"name": "Hyper Potion",
		"kind": "potion",
		"description": "Restaura HP.",
		"buyPrice": 1200,
		"healAmount": 200
	},
	"max_potion": {
		"id": "max_potion",
		"name": "Max Potion",
		"kind": "potion",
		"description": "Restaura HP.",
		"buyPrice": 2500,
		"healAmount": Infinity
	},
	"revive": {
		"id": "revive",
		"name": "Revive",
		"kind": "revive",
		"description": "Reanima um POKE desmaiado.",
		"buyPrice": 1500,
		"reviveHpPercent": .5
	},
	"max_revive": {
		"id": "max_revive",
		"name": "Max Revive",
		"kind": "revive",
		"description": "Reanima um POKE desmaiado.",
		"buyPrice": 4e3,
		"reviveHpPercent": 1
	},
	"old_rod": {
		"id": "old_rod",
		"name": "Old Rod",
		"kind": "rod",
		"description": "Vara de pesca (mecanica ainda nao implementada).",
		"buyPrice": 500
	},
	"good_rod": {
		"id": "good_rod",
		"name": "Good Rod",
		"kind": "rod",
		"description": "Vara de pesca (mecanica ainda nao implementada).",
		"buyPrice": 2e3
	},
	"super_rod": {
		"id": "super_rod",
		"name": "Super Rod",
		"kind": "rod",
		"description": "Vara de pesca (mecanica ainda nao implementada).",
		"buyPrice": 5e3
	}
};
//#endregion
//#region src/data/stones.ts
var STONE_TYPES = Object.keys(TYPE_COLORS);
function stoneItemId(type) {
	return `stone_${type.toLowerCase()}`;
}
function stoneName(type) {
	return `Pedra ${type}`;
}
var STONE_ITEMS = Object.fromEntries(STONE_TYPES.map((type) => {
	const id = stoneItemId(type);
	return [id, {
		id,
		name: stoneName(type),
		kind: "stone",
		stoneType: type,
		description: `Usada para evoluir POKEs de tipo primario ${type} ao atingir o Nivel 80.`,
		sellPrice: 500
	}];
}));
//#endregion
//#region src/data/items.ts
var formulaEngine$5 = createFormulaEngine(FORMULAS);
var SELL_FRACTION = formulaEngine$5.eval("SELL_ITEM_FRACTION");
var DESCONTO_BOLA_POCAO = formulaEngine$5.evalOrDefault("BALL_POTION_BUY_DISCOUNT", .7);
var KINDS_COM_DESCONTO = /* @__PURE__ */ new Set(["ball", "potion"]);
var GENERATED_ITEMS = Object.fromEntries(Object.entries(ITEMS_DATA).map(([key, item]) => {
	const buyPrice = KINDS_COM_DESCONTO.has(item.kind) ? Math.max(1, Math.round(item.buyPrice * (1 - DESCONTO_BOLA_POCAO))) : item.buyPrice;
	const sellPrice = Math.max(1, Math.round(formulaEngine$5.eval("SELL_ITEM_PRICE", {
		buyPrice,
		sellFraction: SELL_FRACTION
	})));
	return [key, {
		...item,
		buyPrice,
		sellPrice
	}];
}));
Object.values(GENERATED_ITEMS).filter((item) => item.kind !== "rod").map((item) => ({
	itemId: item.id,
	currency: "gold"
}));
var ITEMS = {
	...GENERATED_ITEMS,
	...STONE_ITEMS
};
function getItem(id) {
	return ITEMS[id] || null;
}
var CAPTURE_ANIM_FRAME_DURATION = .07;
function captureAnimRowCount(success) {
	return success ? 15 : 11;
}
//#endregion
//#region src/data/statLabels.ts
var STAT_LABEL = {
	hp: "HP",
	atkFis: "Atk Fís",
	atkEsp: "Atk Esp",
	def: "Def",
	defEsp: "Def Esp",
	speed: "Vel"
};
var STAT_ORDER = [
	"hp",
	"atkFis",
	"atkEsp",
	"def",
	"defEsp",
	"speed"
];
/**
* "+3 HP, +2 Atk Fís, +1 Vel" — so os atributos que realmente subiram.
*
* Devolve string vazia quando nada mudou: em nivel alto de uma curva lenta um
* level-up pode nao mover atributo nenhum (a formula do Gen2 e inteira e
* arredonda pra baixo), e escrever "ganhou: " sem nada depois pareceria bug.
*/
function formatStatGains(gains) {
	if (!gains) return "";
	return STAT_ORDER.filter((key) => (gains[key] ?? 0) > 0).map((key) => `+${gains[key]} ${STAT_LABEL[key]}`).join(", ");
}
//#endregion
//#region src/data/spriteFootOffsets.ts
var FOOT_OFFSET_FRACTION = {
	charmander: .125,
	squirtle: .125,
	bulbasaur: .15,
	geodude: .25,
	spearow: .15,
	rattata: .188,
	pidgey: .15,
	sentret: .056,
	hoppip: .071,
	zubat: -.036,
	dunsparce: .417,
	caterpie: .156,
	weedle: .1,
	charmeleon: .089,
	wartortle: .125,
	ivysaur: .219,
	graveler: .104,
	fearow: .083,
	raticate: .104,
	pidgeotto: .104,
	furret: .1,
	skiploom: .156,
	golbat: 0,
	metapod: .175,
	kakuna: .075,
	charizard: .104,
	blastoise: .1,
	venusaur: .281,
	pidgeot: .104,
	jumpluff: .125,
	butterfree: 0,
	beedrill: .042,
	bellsprout: .156,
	unown: 0,
	growlithe: .104,
	sandshrew: .125,
	onix: .038,
	paras: .25,
	ekans: .146,
	slowpoke: .219,
	snubbull: .1,
	abra: .021,
	jigglypuff: .156,
	ditto: .188,
	nidoran_f: .15,
	nidoran_m: .167,
	sunkern: .094,
	yanma: .05,
	machop: .1,
	koffing: 0,
	weezing: .094,
	magnemite: .031,
	tauros: .125,
	miltank: .104,
	arbok: .125,
	farfetch_d: .188,
	natu: .188,
	smeargle: .125,
	swinub: .25,
	jynx: .175,
	krabby: .1,
	seel: .156,
	tangela: .125,
	lickitung: .146,
	weepinbell: .219,
	ursaring: .107,
	gligar: .018,
	donphan: .125,
	skarmory: .109,
	machoke: .104,
	larvitar: .104,
	pupitar: .054,
	magmar: .125,
	parasect: .219,
	ponyta: .15,
	rapidash: .143,
	doduo: .15,
	dodrio: .125,
	sandslash: .15,
	slowbro: .15,
	granbull: .125,
	kadabra: -.018,
	nidorina: .15,
	nidorino: .175,
	magneton: .1,
	xatu: .125,
	piloswine: .188,
	kingler: .125,
	dewgong: .125,
	tyranitar: .104,
	pichu: .083,
	cleffa: .156,
	igglybuff: .208,
	togepi: .156,
	pikachu: .071,
	hoothoot: .156,
	spinarak: .333,
	ledyba: .021,
	pineco: .125,
	oddish: .125,
	poliwag: .104,
	diglett: .333,
	voltorb: .125,
	meowth: .125,
	gastly: .018,
	drowzee: .1,
	magikarp: .313,
	goldeen: .125,
	horsea: 0,
	tentacool: .063,
	exeggcute: .225,
	mareep: .15,
	cyndaquil: .094,
	chikorita: .104,
	totodile: .104,
	mankey: .071,
	cubone: .15,
	chinchou: .15,
	shellder: .219,
	staryu: .125,
	grimer: .188,
	venonat: .125,
	psyduck: .125,
	wooper: .156,
	slugma: .2,
	houndour: .167,
	teddiursa: .156,
	phanpy: .15,
	remoraid: .05,
	tyrogue: .083,
	elekid: .071,
	magby: .104,
	smoochum: .1,
	marill: .125,
	sudowoodo: .1,
	murkrow: .125,
	aipom: .125,
	qwilfish: .05,
	corsola: .125,
	sneasel: .089,
	girafarig: .125,
	stantler: .146,
	misdreavus: .021,
	delibird: .15,
	sunflora: .089,
	wobbuffet: .15,
	mantine: .056,
	rhyhorn: .219,
	hitmonlee: .125,
	hitmonchan: .071,
	kangaskhan: .089,
	lapras: .161,
	porygon: .125,
	eevee: .156,
	scyther: .104,
	pinsir: .104,
	dratini: .15,
	omanyte: .188,
	kabuto: .25,
	aerodactyl: .016,
	snorlax: .078,
	heracross: .071,
	alakazam: .083,
	gengar: .125,
	machamp: .104,
	victreebel: .071,
	arcanine: .125,
	nidoking: .083,
	nidoqueen: .125,
	steelix: .009,
	gyarados: 0,
	articuno: -.011,
	zapdos: .01,
	moltres: -.031,
	raikou: .146,
	entei: .125,
	suicune: .167,
	lugia: .073,
	ho_oh: .054,
	celebi: 0,
	mewtwo: .078,
	mew: .018,
	noctowl: .078,
	ariados: .175,
	ledian: -.018,
	forretress: .025,
	gloom: .156,
	poliwhirl: .125,
	dugtrio: .344,
	electrode: .156,
	persian: .146,
	haunter: .036,
	hypno: .104,
	seaking: .063,
	seadra: .016,
	tentacruel: .083,
	flaaffy: .083,
	quilava: .375,
	bayleef: .107,
	croconaw: .083,
	primeape: .107,
	marowak: .104,
	lanturn: .071,
	muk: .15,
	venomoth: .018,
	golduck: .175,
	quagsire: .071,
	magcargo: .225,
	houndoom: .141,
	octillery: .281,
	electabuzz: .071,
	azumarill: .104,
	rhydon: .104,
	dragonair: .161,
	omastar: .125,
	kabutops: .104,
	ampharos: .078,
	typhlosion: .071,
	meganium: .107,
	feraligatr: .089,
	dragonite: .078,
	kingdra: -.028,
	politoed: .078,
	golem: .125,
	porygon2: .125,
	scizor: .125
};
var DEFAULT_FRACTION = .15;
function footOffsetFraction(speciesId) {
	const fraction = FOOT_OFFSET_FRACTION[speciesId];
	return fraction == null ? DEFAULT_FRACTION : fraction;
}
//#endregion
//#region src/engine/entity.ts
var PLAYER_MOVE_SPEED = 91;
var ENEMY_MOVE_SPEED = 58.5;
var AGGRO_RADIUS_MULTIPLIER = 1;
var ENEMY_LEASH_MULTIPLIER = 2.2;
function createPlayerEntity(counters, { poke, x, y }) {
	return {
		id: `entity-${counters.entity++}`,
		kind: "player",
		poke,
		x,
		y,
		facing: {
			x: 0,
			y: 1
		},
		radius: 14,
		state: "idle",
		cooldowns: {},
		globalCooldown: 0,
		targetId: null,
		deathHandled: false,
		flashTimer: 0,
		lastDamageTaken: {
			physical: {
				amount: 0,
				age: Infinity
			},
			special: {
				amount: 0,
				age: Infinity
			}
		},
		battleAnim: null,
		animFrame: 0,
		animElapsed: 0,
		attackAnim: null,
		attackAnimTimer: 0,
		effectLanes: [],
		pathWaypoints: null,
		pathIndex: 0,
		pathRecalcTimer: 0,
		pathTargetX: null,
		pathTargetY: null,
		moveSpeed: PLAYER_MOVE_SPEED,
		wanderTarget: null,
		wanderPause: 0,
		fainted: false
	};
}
function createEnemyEntity(counters, { poke, x, y, encounterId }) {
	const encounter = getEncounter(encounterId);
	if (!encounter) throw new Error(`Encontro desconhecido: ${encounterId}`);
	const aggroRadius = encounter.aggroRadius * AGGRO_RADIUS_MULTIPLIER;
	return {
		id: `entity-${counters.entity++}`,
		kind: "enemy",
		poke,
		x,
		y,
		facing: {
			x: 0,
			y: 1
		},
		radius: 15,
		state: "idle",
		cooldowns: {},
		globalCooldown: 0,
		targetId: null,
		deathHandled: false,
		flashTimer: 0,
		lastDamageTaken: {
			physical: {
				amount: 0,
				age: Infinity
			},
			special: {
				amount: 0,
				age: Infinity
			}
		},
		battleAnim: null,
		animFrame: 0,
		animElapsed: 0,
		attackAnim: null,
		attackAnimTimer: 0,
		effectLanes: [],
		pathWaypoints: null,
		pathIndex: 0,
		pathRecalcTimer: 0,
		pathTargetX: null,
		pathTargetY: null,
		encounterId,
		spawnPoint: {
			x,
			y
		},
		moveSpeed: ENEMY_MOVE_SPEED,
		wanderTarget: null,
		wanderPause: 0,
		aggroRadius,
		wanderRadius: encounter.wanderRadius,
		leashRadius: aggroRadius * ENEMY_LEASH_MULTIPLIER,
		deathRemovalTimer: null
	};
}
function getSpecies(entity) {
	return SPECIES[entity.poke.speciesId];
}
function getMaxHp(entity) {
	return entity.poke.stats.hp;
}
function isDead(entity) {
	return entity.poke.hp <= 0;
}
function getGroundOffset(entity) {
	if (!entity.battleAnim) return entity.radius;
	return entity.battleAnim.frameHeight * footOffsetFraction(getSpecies(entity).id);
}
function distanceTo(a, b) {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	return Math.sqrt(dx * dx + dy * dy);
}
function claimEffectLane(entity, effectId, size = 1) {
	let lane = 0;
	for (;;) {
		if (!entity.effectLanes.some((e) => lane < e.lane + e.size && e.lane < lane + size)) break;
		lane++;
	}
	entity.effectLanes.push({
		id: effectId,
		lane,
		size
	});
	return lane;
}
function releaseEffectLane(entity, effectId) {
	entity.effectLanes = entity.effectLanes.filter((e) => e.id !== effectId);
}
function tickCooldowns(entity, dt) {
	for (const key of Object.keys(entity.cooldowns)) entity.cooldowns[key] = Math.max(0, entity.cooldowns[key] - dt);
	if (entity.globalCooldown > 0) entity.globalCooldown = Math.max(0, entity.globalCooldown - dt);
	if (entity.flashTimer > 0) entity.flashTimer = Math.max(0, entity.flashTimer - dt);
	entity.lastDamageTaken.physical.age += dt;
	entity.lastDamageTaken.special.age += dt;
}
function isAbilityReady(entity, abilityId) {
	return !entity.cooldowns[abilityId];
}
function startCooldown(entity, abilityId, seconds) {
	entity.cooldowns[abilityId] = seconds;
}
function canAct(entity) {
	return entity.globalCooldown <= 0;
}
function startGlobalCooldown(entity, seconds) {
	entity.globalCooldown = seconds;
}
function takeDamage(entity, amount, category) {
	entity.poke.hp = Math.max(0, entity.poke.hp - amount);
	entity.flashTimer = .15;
	if (category === "physical" || category === "special") entity.lastDamageTaken[category] = {
		amount,
		age: 0
	};
}
function heal(entity, amount) {
	entity.poke.hp = Math.min(getMaxHp(entity), entity.poke.hp + amount);
}
function findEntityById(player, enemies, id) {
	if (!id) return null;
	if (player && player.id === id) return player;
	return enemies.find((e) => e.id === id) || null;
}
//#endregion
//#region src/engine/effect.ts
function createWorldEffect(counters, params) {
	const { type, x, y, targetX, targetY, radius = 10, color = "#fff", duration = .25, delay = 0, value, effectiveness, effectivenessLabel, text, unit, isAoe, owner = null, laneSize = 1, worldSize, elementType, ballItemId, success } = params;
	const id = `effect-${counters.effect++}`;
	const lane = owner ? claimEffectLane(owner, id, laneSize) : 0;
	return {
		id,
		type,
		x,
		y,
		targetX,
		targetY,
		radius,
		color,
		duration,
		delay,
		age: 0,
		value,
		effectiveness,
		effectivenessLabel: effectivenessLabel ?? void 0,
		text,
		unit,
		isAoe,
		worldSize,
		elementType,
		ballItemId,
		success,
		laneSize,
		ownerId: owner ? owner.id : null,
		lane
	};
}
function effectDone(effect) {
	return effect.age >= effect.delay + effect.duration;
}
function tickEffect(effect, dt) {
	effect.age += dt;
}
//#endregion
//#region src/core/pathfinding.ts
var NEIGHBORS = [
	[1, 0],
	[-1, 0],
	[0, 1],
	[0, -1],
	[1, 1],
	[1, -1],
	[-1, 1],
	[-1, -1]
];
var MAX_EXPANSIONS = 4e3;
function cellKey(col, row) {
	return `${col},${row}`;
}
function isBlocked(grid, col, row, circle) {
	if (row < 0 || row >= grid.length || col < 0 || col >= grid[0].length) return true;
	if (grid[row][col] === "1") return true;
	if (circle) {
		const x = col * 40 + 20;
		const y = row * 40 + 20;
		if (Math.hypot(x - circle.cx, y - circle.cy) > circle.radius) return true;
	}
	return false;
}
function heuristic(col, row, goalCol, goalRow) {
	return Math.hypot(goalCol - col, goalRow - row);
}
function reconstructPath(cameFrom, goalKey, startKey) {
	const cellPath = [];
	let key = goalKey;
	while (key && key !== startKey) {
		cellPath.push(key);
		key = cameFrom.get(key);
	}
	cellPath.reverse();
	return cellPath.map((k) => {
		const [col, row] = k.split(",").map(Number);
		return {
			x: col * 40 + 20,
			y: row * 40 + 20
		};
	});
}
function findPath(mapDef, startX, startY, goalX, goalY) {
	const grid = mapDef.collisionGrid;
	if (!grid) return null;
	const circle = {
		cx: mapDef.bounds.width / 2,
		cy: mapDef.bounds.height / 2,
		radius: mapWalkRadius(mapDef)
	};
	const toCol = (x) => Math.floor(x / 40);
	const toRow = (y) => Math.floor(y / 40);
	const startCol = toCol(startX), startRow = toRow(startY);
	const goalCol = toCol(goalX), goalRow = toRow(goalY);
	if (startCol === goalCol && startRow === goalRow) return [];
	if (isBlocked(grid, goalCol, goalRow, circle)) return null;
	const startKey = cellKey(startCol, startRow);
	const goalKey = cellKey(goalCol, goalRow);
	const cameFrom = /* @__PURE__ */ new Map();
	const gScore = /* @__PURE__ */ new Map([[startKey, 0]]);
	const open = /* @__PURE__ */ new Map([[startKey, heuristic(startCol, startRow, goalCol, goalRow)]]);
	const closed = /* @__PURE__ */ new Set();
	let expansions = 0;
	while (open.size > 0) {
		if (++expansions > MAX_EXPANSIONS) return null;
		let currentKey = null;
		let bestF = Infinity;
		for (const [key, f] of open) if (f < bestF) {
			bestF = f;
			currentKey = key;
		}
		if (!currentKey) break;
		open.delete(currentKey);
		if (currentKey === goalKey) return reconstructPath(cameFrom, goalKey, startKey).map((wp, i, arr) => i === arr.length - 1 ? {
			x: goalX,
			y: goalY
		} : wp);
		closed.add(currentKey);
		const [curCol, curRow] = currentKey.split(",").map(Number);
		for (const [dc, dr] of NEIGHBORS) {
			const nCol = curCol + dc, nRow = curRow + dr;
			const nKey = cellKey(nCol, nRow);
			if (closed.has(nKey) || isBlocked(grid, nCol, nRow, circle)) continue;
			if (dc !== 0 && dr !== 0 && (isBlocked(grid, curCol + dc, curRow, circle) || isBlocked(grid, curCol, curRow + dr, circle))) continue;
			const stepCost = dc !== 0 && dr !== 0 ? Math.SQRT2 : 1;
			const tentativeG = (gScore.get(currentKey) ?? Infinity) + stepCost;
			if (tentativeG < (gScore.get(nKey) ?? Infinity)) {
				cameFrom.set(nKey, currentKey);
				gScore.set(nKey, tentativeG);
				open.set(nKey, tentativeG + heuristic(nCol, nRow, goalCol, goalRow));
			}
		}
	}
	return null;
}
//#endregion
//#region src/data/abilityCategory.ts
/** O bloco de atributos que este POKE tem (ou tera) exatamente no nivel 50. */
function statsAtTypedAoeLevel(poke) {
	const species = SPECIES[poke.speciesId];
	if (!species) return poke.stats;
	return computeStatsAtLevel(species, 50, poke.ivs, poke.rarity, poke.isShiny);
}
function resolveAbilityCategory(ability, poke) {
	if (ability.category !== "dynamic") return ability.category;
	const stats = statsAtTypedAoeLevel(poke);
	return stats.atkFis >= stats.atkEsp ? "physical" : "special";
}
//#endregion
//#region src/data/generated/typeChart.generated.ts
var TYPE_CHART = {
	"NORMAL": {
		"NORMAL": 1,
		"FIRE": 1,
		"WATER": 1,
		"ELECTRIC": 1,
		"GRASS": 1,
		"ICE": 1,
		"FIGHTING": 1,
		"POISON": 1,
		"GROUND": 1,
		"FLYING": 1,
		"PSYCHIC": 1,
		"BUG": 1,
		"ROCK": .5,
		"GHOST": 0,
		"DRAGON": 1,
		"DARK": 1,
		"STEEL": .5
	},
	"FIRE": {
		"NORMAL": 1,
		"FIRE": .5,
		"WATER": .5,
		"ELECTRIC": 1,
		"GRASS": 2,
		"ICE": 2,
		"FIGHTING": 1,
		"POISON": 1,
		"GROUND": 1,
		"FLYING": 1,
		"PSYCHIC": 1,
		"BUG": 2,
		"ROCK": .5,
		"GHOST": 1,
		"DRAGON": .5,
		"DARK": 1,
		"STEEL": 2
	},
	"WATER": {
		"NORMAL": 1,
		"FIRE": 2,
		"WATER": .5,
		"ELECTRIC": 1,
		"GRASS": .5,
		"ICE": 1,
		"FIGHTING": 1,
		"POISON": 1,
		"GROUND": 2,
		"FLYING": 1,
		"PSYCHIC": 1,
		"BUG": 1,
		"ROCK": 2,
		"GHOST": 1,
		"DRAGON": .5,
		"DARK": 1,
		"STEEL": 1
	},
	"ELECTRIC": {
		"NORMAL": 1,
		"FIRE": 1,
		"WATER": 2,
		"ELECTRIC": .5,
		"GRASS": .5,
		"ICE": 1,
		"FIGHTING": 1,
		"POISON": 1,
		"GROUND": 0,
		"FLYING": 2,
		"PSYCHIC": 1,
		"BUG": 1,
		"ROCK": 1,
		"GHOST": 1,
		"DRAGON": .5,
		"DARK": 1,
		"STEEL": 1
	},
	"GRASS": {
		"NORMAL": 1,
		"FIRE": .5,
		"WATER": 2,
		"ELECTRIC": 1,
		"GRASS": .5,
		"ICE": 1,
		"FIGHTING": 1,
		"POISON": .5,
		"GROUND": 2,
		"FLYING": .5,
		"PSYCHIC": 1,
		"BUG": .5,
		"ROCK": 2,
		"GHOST": 1,
		"DRAGON": .5,
		"DARK": 1,
		"STEEL": .5
	},
	"ICE": {
		"NORMAL": 1,
		"FIRE": .5,
		"WATER": .5,
		"ELECTRIC": 1,
		"GRASS": 2,
		"ICE": .5,
		"FIGHTING": 1,
		"POISON": 1,
		"GROUND": 2,
		"FLYING": 2,
		"PSYCHIC": 1,
		"BUG": 1,
		"ROCK": 1,
		"GHOST": 1,
		"DRAGON": 2,
		"DARK": 1,
		"STEEL": .5
	},
	"FIGHTING": {
		"NORMAL": 2,
		"FIRE": 1,
		"WATER": 1,
		"ELECTRIC": 1,
		"GRASS": 1,
		"ICE": 2,
		"FIGHTING": 1,
		"POISON": .5,
		"GROUND": 1,
		"FLYING": .5,
		"PSYCHIC": .5,
		"BUG": .5,
		"ROCK": 2,
		"GHOST": 0,
		"DRAGON": 1,
		"DARK": 2,
		"STEEL": 2
	},
	"POISON": {
		"NORMAL": 1,
		"FIRE": 1,
		"WATER": 1,
		"ELECTRIC": 1,
		"GRASS": 2,
		"ICE": 1,
		"FIGHTING": 1,
		"POISON": .5,
		"GROUND": .5,
		"FLYING": 1,
		"PSYCHIC": 1,
		"BUG": 1,
		"ROCK": .5,
		"GHOST": .5,
		"DRAGON": 1,
		"DARK": 1,
		"STEEL": 0
	},
	"GROUND": {
		"NORMAL": 1,
		"FIRE": 2,
		"WATER": 1,
		"ELECTRIC": 2,
		"GRASS": .5,
		"ICE": 1,
		"FIGHTING": 1,
		"POISON": 2,
		"GROUND": 1,
		"FLYING": 0,
		"PSYCHIC": 1,
		"BUG": .5,
		"ROCK": 2,
		"GHOST": 1,
		"DRAGON": 1,
		"DARK": 1,
		"STEEL": 2
	},
	"FLYING": {
		"NORMAL": 1,
		"FIRE": 1,
		"WATER": 1,
		"ELECTRIC": .5,
		"GRASS": 2,
		"ICE": 1,
		"FIGHTING": 2,
		"POISON": 1,
		"GROUND": 1,
		"FLYING": 1,
		"PSYCHIC": 1,
		"BUG": 2,
		"ROCK": .5,
		"GHOST": 1,
		"DRAGON": 1,
		"DARK": 1,
		"STEEL": .5
	},
	"PSYCHIC": {
		"NORMAL": 1,
		"FIRE": 1,
		"WATER": 1,
		"ELECTRIC": 1,
		"GRASS": 1,
		"ICE": 1,
		"FIGHTING": 2,
		"POISON": 2,
		"GROUND": 1,
		"FLYING": 1,
		"PSYCHIC": .5,
		"BUG": 1,
		"ROCK": 1,
		"GHOST": 1,
		"DRAGON": 1,
		"DARK": 0,
		"STEEL": .5
	},
	"BUG": {
		"NORMAL": 1,
		"FIRE": .5,
		"WATER": 1,
		"ELECTRIC": 1,
		"GRASS": 2,
		"ICE": 1,
		"FIGHTING": .5,
		"POISON": .5,
		"GROUND": 1,
		"FLYING": .5,
		"PSYCHIC": 2,
		"BUG": 1,
		"ROCK": 1,
		"GHOST": .5,
		"DRAGON": 1,
		"DARK": 2,
		"STEEL": .5
	},
	"ROCK": {
		"NORMAL": 1,
		"FIRE": 2,
		"WATER": 1,
		"ELECTRIC": 1,
		"GRASS": 1,
		"ICE": 2,
		"FIGHTING": .5,
		"POISON": 1,
		"GROUND": .5,
		"FLYING": 2,
		"PSYCHIC": 1,
		"BUG": 2,
		"ROCK": 1,
		"GHOST": 1,
		"DRAGON": 1,
		"DARK": 1,
		"STEEL": .5
	},
	"GHOST": {
		"NORMAL": 0,
		"FIRE": 1,
		"WATER": 1,
		"ELECTRIC": 1,
		"GRASS": 1,
		"ICE": 1,
		"FIGHTING": 1,
		"POISON": 1,
		"GROUND": 1,
		"FLYING": 1,
		"PSYCHIC": 2,
		"BUG": 1,
		"ROCK": 1,
		"GHOST": 2,
		"DRAGON": 1,
		"DARK": .5,
		"STEEL": .5
	},
	"DRAGON": {
		"NORMAL": 1,
		"FIRE": 1,
		"WATER": 1,
		"ELECTRIC": 1,
		"GRASS": 1,
		"ICE": 1,
		"FIGHTING": 1,
		"POISON": 1,
		"GROUND": 1,
		"FLYING": 1,
		"PSYCHIC": 1,
		"BUG": 1,
		"ROCK": 1,
		"GHOST": 1,
		"DRAGON": 2,
		"DARK": 1,
		"STEEL": .5
	},
	"DARK": {
		"NORMAL": 1,
		"FIRE": 1,
		"WATER": 1,
		"ELECTRIC": 1,
		"GRASS": 1,
		"ICE": 1,
		"FIGHTING": .5,
		"POISON": 1,
		"GROUND": 1,
		"FLYING": 1,
		"PSYCHIC": 2,
		"BUG": 1,
		"ROCK": 1,
		"GHOST": 2,
		"DRAGON": 1,
		"DARK": .5,
		"STEEL": .5
	},
	"STEEL": {
		"NORMAL": 1,
		"FIRE": .5,
		"WATER": .5,
		"ELECTRIC": .5,
		"GRASS": 1,
		"ICE": 2,
		"FIGHTING": 1,
		"POISON": 1,
		"GROUND": 1,
		"FLYING": 1,
		"PSYCHIC": 1,
		"BUG": 1,
		"ROCK": 2,
		"GHOST": 1,
		"DRAGON": 1,
		"DARK": 1,
		"STEEL": .5
	}
};
function getEffectiveness(moveType, defType1, defType2) {
	const row = TYPE_CHART[moveType];
	if (!row) return 1;
	return (defType1 in row ? row[defType1] : 1) * (defType2 && defType2 in row ? row[defType2] : 1);
}
//#endregion
//#region src/data/battleSpriteAnims.ts
var BATTLE_SPRITE_ANIMS = {
	"charmander": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				6,
				8,
				6,
				8
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				12,
				8,
				8,
				8
			]
		},
		"Faint": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				8,
				12,
				4,
				10
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 24,
			"durations": [30, 35]
		}
	},
	"squirtle": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				12,
				8,
				12,
				8
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 32,
			"durations": [
				2,
				6,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				30,
				2,
				2,
				4,
				4,
				4,
				2,
				2
			]
		},
		"Faint": {
			"frameWidth": 40,
			"frameHeight": 32,
			"durations": [
				8,
				12,
				4,
				10
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [30, 35]
		}
	},
	"bulbasaur": {
		"Walk": {
			"frameWidth": 40,
			"frameHeight": 40,
			"durations": [
				4,
				4,
				4,
				4,
				4,
				4
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				12,
				4,
				4,
				4,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				40,
				6,
				6
			]
		},
		"Faint": {
			"frameWidth": 32,
			"frameHeight": 24,
			"durations": [
				8,
				12,
				4,
				10
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [30, 35]
		}
	},
	"geodude": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 48,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				4,
				1,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 24,
			"durations": [
				8,
				12,
				8,
				12
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				9,
				8,
				20,
				9,
				8,
				20
			]
		}
	},
	"spearow": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				6,
				4,
				4,
				4,
				4
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				2,
				3,
				3,
				3,
				3,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				40,
				2,
				3,
				4,
				3,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [30, 35]
		}
	},
	"rattata": {
		"Walk": {
			"frameWidth": 48,
			"frameHeight": 40,
			"durations": [
				6,
				4,
				4,
				4,
				4,
				4,
				4
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				4,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				40,
				2,
				2,
				2,
				4,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 24,
			"durations": [30, 35]
		}
	},
	"pidgey": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				6,
				4,
				4,
				4,
				4
			]
		},
		"Shoot": {
			"frameWidth": 24,
			"frameHeight": 48,
			"durations": [
				3,
				3,
				3,
				3,
				3,
				3,
				3,
				3,
				3,
				2,
				1
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				30,
				4,
				4,
				4,
				4
			]
		},
		"Faint": {
			"frameWidth": 32,
			"frameHeight": 24,
			"durations": [
				8,
				12,
				4,
				10
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 16,
			"durations": [35, 30]
		}
	},
	"sentret": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 40,
			"durations": [
				2,
				6,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 72,
			"durations": [
				30,
				10,
				2,
				2,
				3,
				3,
				3,
				2
			]
		},
		"Faint": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				8,
				12,
				4,
				10
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"hoppip": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 56,
			"durations": [
				4,
				4,
				4,
				4,
				4,
				4,
				4,
				4
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 56,
			"durations": [
				2,
				2,
				2,
				6,
				1,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 56,
			"durations": [
				60,
				10,
				8,
				10,
				8,
				6,
				4,
				2,
				8,
				8,
				8,
				8,
				8,
				8,
				8
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				8,
				8,
				26,
				8,
				8,
				26
			]
		}
	},
	"zubat": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 56,
			"durations": [
				6,
				6,
				6,
				6,
				6,
				6,
				6,
				6
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 56,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 56,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 56,
			"durations": [
				10,
				6,
				6,
				6,
				6,
				6,
				6,
				8
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 24,
			"durations": [30, 35]
		}
	},
	"dunsparce": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				8,
				6,
				6,
				6,
				6
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 40,
			"durations": [
				2,
				6,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 24,
			"durations": [36, 19]
		},
		"Faint": {
			"frameWidth": 32,
			"frameHeight": 24,
			"durations": [
				8,
				12,
				4,
				10
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 24,
			"durations": [30, 35]
		}
	},
	"caterpie": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				10,
				10,
				10
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				1,
				1,
				6
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				8,
				8,
				8,
				8,
				8,
				8,
				8,
				4,
				10,
				4
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [30, 35]
		}
	},
	"weedle": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				8,
				10,
				8
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				4,
				4,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				4
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				40,
				8,
				8,
				8
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"charmeleon": {
		"Walk": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 48,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				4,
				1,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 56,
			"durations": [
				40,
				2,
				3,
				3,
				3,
				2
			]
		},
		"Faint": {
			"frameWidth": 40,
			"frameHeight": 32,
			"durations": [
				8,
				12,
				4,
				10
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"wartortle": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				8,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				40,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"ivysaur": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				12,
				4,
				4,
				4,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				40,
				12,
				12,
				12
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"graveler": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				6,
				10,
				6,
				10
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 72,
			"durations": [
				4,
				1,
				2,
				4,
				4,
				2,
				1,
				1,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 40,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				60,
				10,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				10
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 24,
			"durations": [30, 35]
		}
	},
	"fearow": {
		"Walk": {
			"frameWidth": 40,
			"frameHeight": 64,
			"durations": [
				4,
				5,
				6,
				4,
				5,
				6
			]
		},
		"Shoot": {
			"frameWidth": 48,
			"frameHeight": 64,
			"durations": [
				3,
				3,
				3,
				3,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				1
			]
		},
		"Charge": {
			"frameWidth": 40,
			"frameHeight": 64,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 40,
			"frameHeight": 72,
			"durations": [
				40,
				20,
				4,
				4,
				4,
				4,
				4,
				4,
				4,
				4
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [30, 35]
		}
	},
	"raticate": {
		"Walk": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				4,
				6,
				4,
				4,
				4,
				4
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				4,
				2,
				2,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				30,
				6,
				3,
				4,
				3,
				6
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [35, 30]
		}
	},
	"pidgeotto": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				6,
				10,
				6,
				10
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 56,
			"durations": [
				3,
				3,
				3,
				3,
				3,
				3,
				3,
				3,
				3,
				2,
				1
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				40,
				2,
				4,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"furret": {
		"Walk": {
			"frameWidth": 56,
			"frameHeight": 64,
			"durations": [
				6,
				4,
				4,
				4,
				4,
				4,
				4,
				6
			]
		},
		"Shoot": {
			"frameWidth": 48,
			"frameHeight": 56,
			"durations": [
				2,
				6,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 40,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 40,
			"frameHeight": 40,
			"durations": [
				40,
				12,
				4,
				12,
				4,
				12
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [30, 35]
		}
	},
	"skiploom": {
		"Walk": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				8,
				8,
				8,
				8,
				8,
				8,
				8,
				8
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				6,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [20, 20]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				8,
				8,
				26,
				8,
				8,
				26
			]
		}
	},
	"golbat": {
		"Walk": {
			"frameWidth": 40,
			"frameHeight": 64,
			"durations": [
				6,
				6,
				6,
				6,
				6,
				6,
				6,
				6
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 64,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 40,
			"frameHeight": 64,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 40,
			"frameHeight": 56,
			"durations": [
				6,
				6,
				6,
				6
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 24,
			"durations": [30, 35]
		}
	},
	"metapod": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				4,
				2,
				2,
				2,
				2,
				4,
				4,
				4,
				4,
				4
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				4,
				2,
				2,
				2,
				4,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				10,
				14,
				10,
				14
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [30, 35]
		}
	},
	"kakuna": {
		"Walk": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				8,
				4,
				4,
				4,
				10
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				40,
				1,
				1,
				4,
				1,
				1
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [30, 35]
		}
	},
	"charizard": {
		"Walk": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 56,
			"frameHeight": 56,
			"durations": [
				4,
				6,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 48,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				15,
				15,
				15,
				15
			]
		},
		"Faint": {
			"frameWidth": 48,
			"frameHeight": 48,
			"durations": [
				8,
				12,
				4,
				10
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [30, 35]
		}
	},
	"blastoise": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				8,
				14,
				8,
				14
			]
		},
		"Shoot": {
			"frameWidth": 48,
			"frameHeight": 56,
			"durations": [
				4,
				2,
				6,
				2,
				2,
				4
			]
		},
		"Charge": {
			"frameWidth": 40,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 40,
			"frameHeight": 40,
			"durations": [
				32,
				12,
				4,
				4,
				4,
				4,
				4,
				8
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [30, 35]
		}
	},
	"venusaur": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				8,
				16,
				8,
				16
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 40,
			"durations": [
				12,
				4,
				4,
				4,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				30,
				16,
				12,
				16
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"pidgeot": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				8,
				12,
				8,
				12
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 64,
			"durations": [
				3,
				3,
				3,
				3,
				3,
				3,
				3,
				3,
				3,
				2,
				1
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				40,
				2,
				4,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"jumpluff": {
		"Walk": {
			"frameWidth": 24,
			"frameHeight": 48,
			"durations": [
				8,
				8,
				8,
				8,
				8,
				8,
				8,
				8
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				6,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				8,
				8,
				8,
				8
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				8,
				8,
				26,
				8,
				8,
				26
			]
		}
	},
	"butterfree": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 56,
			"durations": [
				8,
				8,
				8,
				8,
				8,
				8,
				8,
				8,
				8,
				8,
				8,
				8
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 56,
			"durations": [
				2,
				2,
				1,
				1,
				1,
				1,
				1,
				2,
				2,
				3,
				6,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 56,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 56,
			"durations": [
				8,
				8,
				8,
				8
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [35, 30]
		}
	},
	"beedrill": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				4,
				4,
				4,
				4
			]
		},
		"Shoot": {
			"frameWidth": 48,
			"frameHeight": 56,
			"durations": [
				2,
				2,
				2,
				2,
				4,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 56,
			"durations": [
				16,
				8,
				16,
				16,
				8,
				16
			]
		}
	},
	"bellsprout": {
		"Walk": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				4,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [20, 22]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [30, 35]
		}
	},
	"unown": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				6,
				6,
				5,
				5,
				6,
				6,
				6,
				5,
				5,
				6
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				20,
				8,
				20,
				8
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				30,
				4,
				35,
				4
			]
		}
	},
	"growlithe": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				6,
				8,
				6,
				8
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				6,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				40,
				4,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"sandshrew": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				6,
				10,
				6,
				10
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				40,
				2,
				2,
				2
			]
		},
		"Faint": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				8,
				12,
				4,
				10
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"onix": {
		"Walk": {
			"frameWidth": 88,
			"frameHeight": 112,
			"durations": [
				10,
				14,
				10,
				14
			]
		},
		"Shoot": {
			"frameWidth": 96,
			"frameHeight": 112,
			"durations": [
				2,
				2,
				6,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 56,
			"frameHeight": 104,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 96,
			"frameHeight": 104,
			"durations": [
				16,
				16,
				16,
				16
			]
		},
		"Sleep": {
			"frameWidth": 40,
			"frameHeight": 64,
			"durations": [30, 35]
		}
	},
	"paras": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 24,
			"durations": [
				6,
				8,
				6,
				8
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				1,
				2,
				2,
				2,
				2,
				2,
				1,
				2
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [
				24,
				6,
				6,
				6
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [30, 35]
		}
	},
	"ekans": {
		"Walk": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				6,
				6,
				6,
				6,
				6,
				6
			]
		},
		"Shoot": {
			"frameWidth": 64,
			"frameHeight": 64,
			"durations": [
				2,
				6,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				4
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [16, 16]
		},
		"Faint": {
			"frameWidth": 56,
			"frameHeight": 40,
			"durations": [
				8,
				12,
				4,
				10
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"slowpoke": {
		"Walk": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				4,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				40,
				8,
				8,
				8
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 16,
			"durations": [30, 35]
		}
	},
	"snubbull": {
		"Walk": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				6,
				8,
				6,
				8
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 40,
			"durations": [
				2,
				4,
				2,
				4,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				30,
				2,
				3,
				4,
				3,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"abra": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				8,
				10,
				8,
				10,
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 56,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				6,
				1,
				1,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 48,
			"durations": [
				24,
				8,
				8,
				24,
				8,
				8
			]
		},
		"Faint": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				8,
				12,
				4,
				10
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"jigglypuff": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				6,
				4,
				4,
				4,
				6
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				6,
				1,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				25,
				8,
				15,
				8,
				15
			]
		},
		"Faint": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				8,
				12,
				4,
				10
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [35, 35]
		}
	},
	"ditto": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				10,
				8,
				10,
				8,
				8
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [16, 16]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 16,
			"durations": [30, 35]
		}
	},
	"nidoran_f": {
		"Walk": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				6,
				4,
				4,
				4,
				4,
				4,
				4
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				4,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				24,
				6,
				6,
				6,
				6
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [30, 35]
		}
	},
	"nidoran_m": {
		"Walk": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				6,
				6,
				5,
				6,
				6,
				4
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				6,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				30,
				4,
				4,
				4,
				4
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"sunkern": {
		"Walk": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				4,
				6,
				6,
				6,
				6,
				6,
				6,
				6
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				3,
				2,
				1,
				1,
				1,
				1,
				1,
				2,
				2,
				4,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [26, 18]
		},
		"Faint": {
			"frameWidth": 48,
			"frameHeight": 32,
			"durations": [
				8,
				12,
				4,
				10
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"yanma": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				4,
				4,
				4,
				4,
				4,
				4,
				4,
				4,
				4,
				4,
				4,
				4,
				4,
				4,
				4,
				4
			]
		},
		"Shoot": {
			"frameWidth": 24,
			"frameHeight": 56,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				4,
				4,
				4,
				4,
				4,
				4,
				4,
				4,
				4,
				4,
				4,
				4
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [30, 35]
		}
	},
	"machop": {
		"Walk": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				8,
				8,
				8,
				8
			]
		},
		"Shoot": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				2,
				3,
				6,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				40,
				4,
				4,
				4
			]
		},
		"Faint": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				8,
				12,
				4,
				10
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"koffing": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 56,
			"durations": [
				6,
				6,
				6,
				6,
				8,
				6,
				6,
				6,
				6,
				8
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 56,
			"durations": [
				1,
				1,
				1,
				2,
				2,
				2,
				2,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 40,
			"frameHeight": 56,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 56,
			"durations": [
				10,
				10,
				8,
				10,
				10,
				8
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				16,
				12,
				16,
				16,
				12,
				16
			]
		}
	},
	"weezing": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 56,
			"durations": [
				8,
				8,
				8,
				8,
				8,
				8
			]
		},
		"Shoot": {
			"frameWidth": 48,
			"frameHeight": 64,
			"durations": [
				2,
				2,
				2,
				4,
				4,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 40,
			"frameHeight": 56,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 64,
			"durations": [
				12,
				12,
				12,
				12,
				12,
				12,
				12,
				12,
				12,
				12,
				12
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				16,
				12,
				16,
				16,
				12,
				16
			]
		}
	},
	"magnemite": {
		"Walk": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				8,
				6,
				6,
				8,
				6,
				6
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				6,
				1,
				2,
				4,
				2
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				10,
				14,
				10,
				14
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				20,
				8,
				8,
				20,
				8,
				8
			]
		}
	},
	"tauros": {
		"Walk": {
			"frameWidth": 40,
			"frameHeight": 56,
			"durations": [
				8,
				6,
				6,
				6,
				6,
				6,
				6
			]
		},
		"Charge": {
			"frameWidth": 40,
			"frameHeight": 56,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 56,
			"durations": [
				40,
				3,
				6,
				3,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"miltank": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 56,
			"durations": [
				8,
				1,
				1,
				2,
				2,
				2,
				2,
				2,
				4,
				4
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				40,
				8,
				3,
				5,
				3,
				8
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [30, 35]
		}
	},
	"arbok": {
		"Walk": {
			"frameWidth": 40,
			"frameHeight": 56,
			"durations": [
				6,
				6,
				8,
				6,
				6,
				6
			]
		},
		"Shoot": {
			"frameWidth": 72,
			"frameHeight": 72,
			"durations": [
				2,
				6,
				1,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				4
			]
		},
		"Charge": {
			"frameWidth": 40,
			"frameHeight": 56,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 56,
			"durations": [32, 14]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"farfetch_d": {
		"Walk": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				6,
				12,
				6,
				12
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				30,
				12,
				30,
				12
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [30, 35]
		}
	},
	"natu": {
		"Walk": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 24,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				8,
				4,
				8,
				4
			]
		},
		"Faint": {
			"frameWidth": 32,
			"frameHeight": 24,
			"durations": [
				8,
				12,
				4,
				10
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [30, 35]
		}
	},
	"smeargle": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				8,
				8,
				8,
				8
			]
		},
		"Shoot": {
			"frameWidth": 72,
			"frameHeight": 72,
			"durations": [
				2,
				6,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 56,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [36, 16]
		},
		"Faint": {
			"frameWidth": 40,
			"frameHeight": 40,
			"durations": [
				8,
				12,
				4,
				10
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"swinub": {
		"Walk": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [
				8,
				8,
				8,
				12
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 24,
			"durations": [
				2,
				6,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [
				36,
				6,
				6,
				6,
				6,
				6,
				6
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [30, 35]
		}
	},
	"jynx": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				8,
				12,
				8,
				12
			]
		},
		"Shoot": {
			"frameWidth": 48,
			"frameHeight": 56,
			"durations": [
				2,
				2,
				6,
				1,
				1,
				1,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				30,
				14,
				30,
				14
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [30, 35]
		}
	},
	"krabby": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				4,
				2,
				2,
				2,
				2,
				2,
				2,
				1,
				2,
				4,
				2,
				1
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [30, 30]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 16,
			"durations": [30, 35]
		}
	},
	"seel": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				8,
				6,
				8,
				10,
				6,
				6,
				6
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 40,
			"durations": [
				2,
				6,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [30, 20]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 24,
			"durations": [30, 35]
		}
	},
	"tangela": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				8,
				6,
				6,
				6,
				6,
				6
			]
		},
		"Shoot": {
			"frameWidth": 64,
			"frameHeight": 72,
			"durations": [
				2,
				8,
				1,
				2,
				4,
				4
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				34,
				6,
				6,
				6
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [30, 35]
		}
	},
	"lickitung": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				10,
				14,
				10,
				14
			]
		},
		"Shoot": {
			"frameWidth": 56,
			"frameHeight": 64,
			"durations": [
				2,
				6,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 48,
			"frameHeight": 48,
			"durations": [
				36,
				12,
				10,
				12
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"weepinbell": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				4,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				16,
				8,
				16,
				8
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				12,
				10,
				12,
				12,
				10,
				12
			]
		}
	},
	"ursaring": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 48,
			"frameHeight": 64,
			"durations": [
				2,
				2,
				2,
				6,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 40,
			"frameHeight": 56,
			"durations": [
				60,
				10,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				10
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [30, 35]
		}
	},
	"gligar": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 64,
			"durations": [
				6,
				4,
				4,
				4,
				8,
				4,
				4,
				4
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 72,
			"durations": [
				1,
				2,
				1,
				2,
				1,
				2,
				1,
				2,
				1,
				2,
				1,
				2,
				1,
				2,
				1,
				2,
				1,
				2,
				1,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 64,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 56,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Faint": {
			"frameWidth": 40,
			"frameHeight": 56,
			"durations": [
				8,
				12,
				4,
				10
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"donphan": {
		"Walk": {
			"frameWidth": 40,
			"frameHeight": 32,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 48,
			"frameHeight": 72,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 40,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 40,
			"frameHeight": 56,
			"durations": [
				40,
				8,
				20,
				8
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 24,
			"durations": [30, 35]
		}
	},
	"skarmory": {
		"Walk": {
			"frameWidth": 40,
			"frameHeight": 72,
			"durations": [
				4,
				4,
				4,
				4,
				8,
				8,
				8,
				8,
				8
			]
		},
		"Shoot": {
			"frameWidth": 48,
			"frameHeight": 56,
			"durations": [
				2,
				2,
				6,
				2,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				4
			]
		},
		"Charge": {
			"frameWidth": 48,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 40,
			"frameHeight": 64,
			"durations": [
				40,
				4,
				4,
				4,
				4,
				4,
				4
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [30, 35]
		}
	},
	"machoke": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Charge": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				40,
				4,
				4,
				4
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"larvitar": {
		"Walk": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				6,
				8,
				6,
				8
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				2,
				6,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 48,
			"durations": [
				30,
				1,
				2,
				4,
				2,
				1,
				16,
				1,
				2,
				4,
				2,
				1
			]
		},
		"Faint": {
			"frameWidth": 32,
			"frameHeight": 24,
			"durations": [
				8,
				12,
				4,
				10
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"pupitar": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 56,
			"durations": [
				6,
				6,
				6,
				6,
				6
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 56,
			"durations": [
				2,
				6,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 56,
			"durations": [
				4,
				4,
				4,
				12,
				6,
				4,
				4,
				36
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 48,
			"durations": [
				8,
				8,
				26,
				8,
				8,
				26
			]
		}
	},
	"magmar": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 56,
			"durations": [
				2,
				6,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				40,
				6,
				12,
				6
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [30, 35]
		}
	},
	"parasect": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 56,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				1,
				2,
				2,
				2,
				2,
				2,
				1,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				40,
				4,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [30, 35]
		}
	},
	"ponyta": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				6,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				60,
				10,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				10
			]
		},
		"Faint": {
			"frameWidth": 40,
			"frameHeight": 32,
			"durations": [
				8,
				12,
				4,
				10
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [30, 35]
		}
	},
	"rapidash": {
		"Walk": {
			"frameWidth": 40,
			"frameHeight": 56,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 48,
			"frameHeight": 72,
			"durations": [
				2,
				2,
				6,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 40,
			"frameHeight": 56,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 40,
			"frameHeight": 56,
			"durations": [
				60,
				10,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				10
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [30, 35]
		}
	},
	"doduo": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				8,
				12,
				8,
				12
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 40,
			"frameHeight": 40,
			"durations": [
				40,
				6,
				12,
				6
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [30, 35]
		}
	},
	"dodrio": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				8,
				12,
				8,
				12
			]
		},
		"Charge": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				40,
				10,
				16,
				10,
				16,
				10
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [30, 35]
		}
	},
	"sandslash": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				25,
				10,
				25,
				10
			]
		},
		"Faint": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				8,
				12,
				4,
				10
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"slowbro": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				8,
				12,
				8,
				12
			]
		},
		"Shoot": {
			"frameWidth": 48,
			"frameHeight": 48,
			"durations": [
				8,
				6,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 40,
			"frameHeight": 40,
			"durations": [30, 30]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 24,
			"durations": [30, 35]
		}
	},
	"granbull": {
		"Walk": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				8,
				12,
				8,
				12
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				6,
				2,
				2,
				2,
				4,
				2,
				4,
				2,
				4,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [40, 30]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"kadabra": {
		"Walk": {
			"frameWidth": 40,
			"frameHeight": 40,
			"durations": [
				8,
				12,
				8,
				12
			]
		},
		"Shoot": {
			"frameWidth": 48,
			"frameHeight": 56,
			"durations": [
				2,
				3,
				4,
				4,
				3,
				1,
				1,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 40,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 40,
			"frameHeight": 56,
			"durations": [
				4,
				4,
				6,
				6,
				6,
				6,
				6,
				6,
				4
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [30, 35]
		}
	},
	"nidorina": {
		"Walk": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				6,
				8,
				6,
				8
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				6,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				40,
				2,
				4,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [30, 35]
		}
	},
	"nidorino": {
		"Walk": {
			"frameWidth": 40,
			"frameHeight": 40,
			"durations": [
				6,
				12,
				6,
				12
			]
		},
		"Shoot": {
			"frameWidth": 56,
			"frameHeight": 64,
			"durations": [
				2,
				2,
				6,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 40,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 40,
			"frameHeight": 40,
			"durations": [
				40,
				10,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				6
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"magneton": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				8,
				8,
				8,
				8,
				8,
				8,
				8,
				8
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				6,
				1,
				2,
				4,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				14,
				10,
				14,
				10
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 48,
			"durations": [
				16,
				12,
				16,
				16,
				12,
				16
			]
		}
	},
	"xatu": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				2,
				3,
				6,
				1,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [30, 30]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"piloswine": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				4,
				1,
				1,
				1,
				1,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				40,
				8,
				8,
				8,
				8
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"kingler": {
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 48,
			"frameHeight": 56,
			"durations": [
				4,
				2,
				2,
				2,
				2,
				2,
				2,
				1,
				2,
				4,
				2,
				1
			]
		},
		"Charge": {
			"frameWidth": 48,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [30, 30]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [30, 35]
		}
	},
	"dewgong": {
		"Walk": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				8,
				6,
				6,
				6,
				10,
				8,
				8
			]
		},
		"Shoot": {
			"frameWidth": 48,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				4,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 48,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 48,
			"frameHeight": 40,
			"durations": [
				30,
				12,
				8,
				12,
				8,
				12
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 24,
			"durations": [30, 35]
		}
	},
	"tyranitar": {
		"Walk": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				10,
				16,
				10,
				16
			]
		},
		"Shoot": {
			"frameWidth": 48,
			"frameHeight": 56,
			"durations": [
				2,
				3,
				6,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 40,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Idle": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				14,
				24,
				14,
				24
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [30, 35]
		}
	},
	"pichu": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				32,
				4,
				6,
				6
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				6,
				6,
				6,
				6,
				6,
				6,
				6,
				6
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [30, 35]
		},
		"Faint": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				8,
				12,
				4,
				10
			]
		}
	},
	"cleffa": {
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [36, 18]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				8,
				6,
				6,
				6,
				8,
				6,
				6,
				6
			]
		},
		"Shoot": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				2,
				4,
				4,
				4,
				4,
				4,
				4,
				4,
				2
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [30, 35]
		}
	},
	"igglybuff": {
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [16, 16]
		},
		"Walk": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				8,
				4,
				4,
				4,
				8
			]
		},
		"Shoot": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [
				2,
				4,
				4,
				4,
				4,
				4,
				4,
				4,
				2
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [30, 35]
		}
	},
	"togepi": {
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				30,
				8,
				10,
				8
			]
		},
		"Walk": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				8,
				6,
				8,
				8,
				6,
				8
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [30, 35]
		}
	},
	"pikachu": {
		"Idle": {
			"frameWidth": 40,
			"frameHeight": 56,
			"durations": [
				40,
				2,
				3,
				3,
				3,
				2
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 56,
			"durations": [
				1,
				2,
				6,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 40,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [30, 35]
		},
		"Faint": {
			"frameWidth": 40,
			"frameHeight": 40,
			"durations": [
				8,
				12,
				4,
				10
			]
		}
	},
	"hoothoot": {
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				48,
				4,
				4,
				4
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				10,
				6,
				6,
				6,
				8
			]
		},
		"Shoot": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				3,
				3,
				3,
				3,
				3,
				3,
				3,
				3,
				3,
				3
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [30, 35]
		}
	},
	"spinarak": {
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [
				40,
				2,
				4,
				2
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 24,
			"durations": [
				10,
				10,
				10
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				2,
				6,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				4
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 24,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [30, 35]
		}
	},
	"ledyba": {
		"Idle": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				4,
				4,
				4,
				4,
				4,
				4,
				4,
				4,
				4,
				4,
				4,
				4
			]
		},
		"Walk": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				4,
				4,
				4,
				4,
				4,
				4
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				1,
				2,
				4,
				2,
				1,
				6,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 24,
			"durations": [30, 35]
		},
		"Faint": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				8,
				12,
				4,
				10
			]
		}
	},
	"pineco": {
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [26, 22]
		},
		"Walk": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				8,
				8,
				8,
				8,
				8,
				8
			]
		},
		"Shoot": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				8,
				8,
				26,
				8,
				8,
				26
			]
		}
	},
	"oddish": {
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				30,
				4,
				4,
				4,
				4
			]
		},
		"Walk": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				8,
				4,
				8,
				6,
				8,
				4,
				8,
				6
			]
		},
		"Shoot": {
			"frameWidth": 48,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				6,
				1,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [30, 35]
		}
	},
	"poliwag": {
		"Idle": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				30,
				8,
				6,
				6,
				4,
				4,
				4,
				4
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				8,
				6,
				6,
				6,
				6
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				2,
				4,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 40,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 24,
			"durations": [30, 35]
		}
	},
	"diglett": {
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [16, 16]
		},
		"Walk": {
			"frameWidth": 40,
			"frameHeight": 40,
			"durations": [
				8,
				8,
				8
			]
		},
		"Shoot": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [30, 35]
		}
	},
	"voltorb": {
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				22,
				6,
				2,
				6,
				6
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				6,
				6,
				10,
				4,
				4,
				4,
				6,
				8
			]
		},
		"Shoot": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [30, 35]
		},
		"Faint": {
			"frameWidth": 32,
			"frameHeight": 24,
			"durations": [
				8,
				12,
				4,
				10
			]
		}
	},
	"meowth": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				12,
				12,
				12,
				12
			]
		},
		"Walk": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				6,
				10,
				6,
				10
			]
		},
		"Shoot": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				2,
				1,
				2,
				3,
				3,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [30, 35]
		},
		"Faint": {
			"frameWidth": 40,
			"frameHeight": 32,
			"durations": [
				8,
				12,
				4,
				10
			]
		}
	},
	"gastly": {
		"Idle": {
			"frameWidth": 48,
			"frameHeight": 56,
			"durations": [
				10,
				10,
				10,
				10,
				10,
				10
			]
		},
		"Walk": {
			"frameWidth": 48,
			"frameHeight": 64,
			"durations": [
				6,
				6,
				6,
				6,
				6,
				6,
				6,
				6,
				6,
				6,
				6,
				6
			]
		},
		"Shoot": {
			"frameWidth": 48,
			"frameHeight": 64,
			"durations": [
				3,
				3,
				3,
				3,
				2,
				2,
				2,
				2,
				2,
				2,
				4
			]
		},
		"Charge": {
			"frameWidth": 40,
			"frameHeight": 56,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 56,
			"durations": [
				6,
				6,
				6,
				16,
				6,
				6,
				6,
				16
			]
		}
	},
	"drowzee": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				40,
				10,
				6,
				10
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				8,
				12,
				8,
				12
			]
		},
		"Shoot": {
			"frameWidth": 56,
			"frameHeight": 56,
			"durations": [
				2,
				2,
				6,
				1,
				1,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 40,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [35, 35]
		}
	},
	"magikarp": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				8,
				10,
				10,
				12
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				6,
				2,
				4,
				6,
				4,
				2,
				6
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				4,
				1,
				2,
				2,
				1,
				3,
				3,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 24,
			"durations": [30, 35]
		}
	},
	"goldeen": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				16,
				10,
				16,
				10,
				16,
				10,
				16,
				2,
				4,
				4,
				4,
				12,
				10,
				16,
				10
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				10,
				10,
				10,
				10,
				10,
				10,
				10,
				10
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				6,
				1,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				10,
				10,
				10,
				10,
				10,
				10
			]
		}
	},
	"horsea": {
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 48,
			"durations": [
				8,
				16,
				8,
				16
			]
		},
		"Walk": {
			"frameWidth": 24,
			"frameHeight": 48,
			"durations": [
				8,
				12,
				8,
				12
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				2,
				6,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 48,
			"durations": [
				16,
				12,
				16,
				16,
				12,
				16
			]
		}
	},
	"tentacool": {
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 48,
			"durations": [
				4,
				8,
				8,
				4,
				8,
				8,
				8
			]
		},
		"Walk": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 48,
			"frameHeight": 56,
			"durations": [
				8,
				1,
				2,
				6,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 24,
			"durations": [30, 35]
		}
	},
	"exeggcute": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				30,
				2,
				4,
				4,
				4,
				2
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				6,
				8,
				6,
				8
			]
		},
		"Shoot": {
			"frameWidth": 48,
			"frameHeight": 56,
			"durations": [
				2,
				2,
				1,
				1,
				2,
				6,
				1,
				2,
				6,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [30, 35]
		}
	},
	"mareep": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				30,
				4,
				3,
				3,
				3,
				4
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				6,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [30, 35]
		},
		"Faint": {
			"frameWidth": 32,
			"frameHeight": 24,
			"durations": [
				8,
				12,
				4,
				10
			]
		}
	},
	"cyndaquil": {
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [40, 16]
		},
		"Walk": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				6,
				8,
				6,
				8
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				3,
				6,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [30, 35]
		},
		"Faint": {
			"frameWidth": 32,
			"frameHeight": 24,
			"durations": [
				8,
				12,
				4,
				10
			]
		}
	},
	"chikorita": {
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 48,
			"durations": [
				40,
				2,
				4,
				3,
				1,
				1
			]
		},
		"Walk": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 48,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				5,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [30, 35]
		},
		"Faint": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				8,
				12,
				4,
				10
			]
		}
	},
	"totodile": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				30,
				4,
				2,
				6,
				3,
				2,
				3
			]
		},
		"Walk": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				2,
				3,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [30, 35]
		},
		"Faint": {
			"frameWidth": 40,
			"frameHeight": 32,
			"durations": [
				8,
				12,
				4,
				10
			]
		}
	},
	"mankey": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 56,
			"durations": [
				40,
				4,
				4,
				4,
				4
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 56,
			"durations": [
				8,
				4,
				4,
				4,
				8,
				4,
				4,
				4
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 24,
			"durations": [30, 35]
		}
	},
	"cubone": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				40,
				1,
				2,
				3,
				2,
				1
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [30, 35]
		},
		"Faint": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				8,
				12,
				4,
				10
			]
		}
	},
	"chinchou": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				14,
				10,
				12,
				12,
				14
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				10,
				4,
				6,
				8,
				8,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 64,
			"frameHeight": 64,
			"durations": [
				2,
				2,
				6,
				1,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				16,
				8,
				8,
				16,
				8,
				8,
				8
			]
		}
	},
	"shellder": {
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				14,
				40,
				14,
				30
			]
		},
		"Walk": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				10,
				6,
				10,
				10,
				6,
				10
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 40,
			"durations": [
				2,
				5,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				24,
				10,
				10,
				24,
				10,
				10
			]
		}
	},
	"staryu": {
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				36,
				10,
				6,
				10
			]
		},
		"Walk": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				4,
				8,
				1,
				1,
				1,
				4,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [30, 35]
		}
	},
	"grimer": {
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				40,
				8,
				30,
				8
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				8,
				8,
				8,
				8,
				8,
				8
			]
		},
		"Shoot": {
			"frameWidth": 48,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				4,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 40,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 24,
			"durations": [30, 35]
		}
	},
	"venonat": {
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [16, 16]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				8,
				6,
				6,
				6,
				8
			]
		},
		"Shoot": {
			"frameWidth": 56,
			"frameHeight": 64,
			"durations": [
				2,
				8,
				1,
				2,
				4,
				4
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [30, 35]
		},
		"Faint": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				8,
				12,
				4,
				10
			]
		}
	},
	"psyduck": {
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				16,
				20,
				16,
				20
			]
		},
		"Walk": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				8,
				12,
				8,
				12
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				2,
				4,
				5,
				1,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [35, 35]
		}
	},
	"wooper": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [24, 16]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				8,
				6,
				6,
				6,
				8,
				6,
				6,
				6
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				6,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [30, 35]
		},
		"Faint": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				8,
				12,
				4,
				10
			]
		}
	},
	"slugma": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				10,
				6,
				34,
				6
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				14,
				8,
				16,
				8
			]
		},
		"Shoot": {
			"frameWidth": 48,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				6,
				1,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [30, 35]
		}
	},
	"houndour": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				60,
				10,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				10
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 40,
			"durations": [
				6,
				2,
				6,
				1,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [30, 35]
		},
		"Faint": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				8,
				12,
				4,
				10
			]
		}
	},
	"teddiursa": {
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				40,
				12,
				8,
				12,
				8,
				20
			]
		},
		"Walk": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"phanpy": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				40,
				8,
				20,
				8
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				6,
				8,
				6,
				8
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 40,
			"durations": [
				2,
				3,
				5,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [30, 35]
		},
		"Faint": {
			"frameWidth": 40,
			"frameHeight": 24,
			"durations": [
				8,
				12,
				4,
				10
			]
		}
	},
	"remoraid": {
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				8,
				8,
				10,
				10,
				8,
				8,
				10,
				10
			]
		},
		"Walk": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				8,
				8,
				8,
				8
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 40,
			"durations": [
				2,
				6,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [
				8,
				8,
				26,
				8,
				8,
				26
			]
		}
	},
	"tyrogue": {
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 48,
			"durations": [
				30,
				1,
				2,
				4,
				4,
				2,
				1
			]
		},
		"Walk": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 24,
			"frameHeight": 56,
			"durations": [
				4,
				8,
				1,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"elekid": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 56,
			"durations": [
				30,
				4,
				6,
				4
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				6,
				10,
				6,
				10
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 56,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [30, 35]
		}
	},
	"magby": {
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 48,
			"durations": [
				30,
				2,
				3,
				4,
				3,
				2
			]
		},
		"Walk": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				2,
				6,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [30, 35]
		},
		"Faint": {
			"frameWidth": 40,
			"frameHeight": 40,
			"durations": [
				8,
				12,
				4,
				10
			]
		}
	},
	"smoochum": {
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				40,
				6,
				6,
				6,
				6
			]
		},
		"Walk": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				6,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [30, 35]
		},
		"Faint": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				8,
				12,
				4,
				10
			]
		}
	},
	"marill": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [26, 16]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				10,
				8,
				10,
				8
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				2,
				6,
				1,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 40,
			"frameHeight": 24,
			"durations": [30, 35]
		},
		"Faint": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				8,
				12,
				4,
				10
			]
		}
	},
	"sudowoodo": {
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [8]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 16,
			"durations": [30, 35]
		}
	},
	"murkrow": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				46,
				4,
				2
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				4,
				4,
				8,
				4,
				4,
				8
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				4,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 40,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [30, 35]
		},
		"Faint": {
			"frameWidth": 40,
			"frameHeight": 32,
			"durations": [
				8,
				12,
				4,
				10
			]
		}
	},
	"aipom": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [30, 18]
		},
		"Walk": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				8,
				4,
				6,
				4,
				8,
				4,
				6,
				4
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [30, 35]
		},
		"Faint": {
			"frameWidth": 40,
			"frameHeight": 40,
			"durations": [
				8,
				12,
				4,
				10
			]
		}
	},
	"qwilfish": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				12,
				10,
				10,
				10,
				12,
				10,
				10
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				8,
				8,
				8,
				8
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				8,
				8,
				26,
				8,
				8,
				26
			]
		}
	},
	"corsola": {
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				52,
				4,
				4
			]
		},
		"Walk": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				6,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"sneasel": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 56,
			"durations": [
				40,
				1,
				2,
				4,
				2,
				2,
				1
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 56,
			"durations": [
				2,
				6,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [30, 35]
		},
		"Faint": {
			"frameWidth": 40,
			"frameHeight": 40,
			"durations": [
				8,
				12,
				4,
				10
			]
		}
	},
	"girafarig": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				30,
				12,
				4,
				4,
				4,
				4,
				4,
				12
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [30, 35]
		},
		"Faint": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				8,
				12,
				4,
				10
			]
		}
	},
	"stantler": {
		"Idle": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				60,
				10,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				10
			]
		},
		"Walk": {
			"frameWidth": 40,
			"frameHeight": 64,
			"durations": [
				6,
				6,
				6,
				6,
				6,
				6
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 56,
			"durations": [
				2,
				4,
				4,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [30, 35]
		}
	},
	"misdreavus": {
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 48,
			"durations": [
				10,
				10,
				10,
				10,
				10,
				10,
				10,
				10
			]
		},
		"Walk": {
			"frameWidth": 24,
			"frameHeight": 48,
			"durations": [
				6,
				6,
				6,
				6,
				6,
				6,
				6,
				6
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 56,
			"durations": [
				2,
				3,
				3,
				3,
				5,
				1,
				1,
				1,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 48,
			"durations": [
				16,
				12,
				16,
				16,
				12,
				16
			]
		},
		"Faint": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				8,
				12,
				4,
				10
			]
		}
	},
	"delibird": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				12,
				12,
				12,
				12
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 56,
			"durations": [
				4,
				4,
				4,
				8,
				2,
				1,
				1,
				2,
				1,
				1,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [30, 35]
		},
		"Faint": {
			"frameWidth": 40,
			"frameHeight": 40,
			"durations": [
				8,
				12,
				4,
				10
			]
		}
	},
	"sunflora": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 56,
			"durations": [
				40,
				1,
				2,
				3,
				4,
				3,
				2,
				1,
				4,
				1,
				2,
				3,
				4,
				3,
				2,
				1
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				8,
				14,
				8,
				14
			]
		},
		"Shoot": {
			"frameWidth": 48,
			"frameHeight": 56,
			"durations": [
				2,
				6,
				1,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [30, 35]
		}
	},
	"wobbuffet": {
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				40,
				4,
				4,
				4,
				4,
				4,
				4,
				4,
				4
			]
		},
		"Walk": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [30, 35]
		}
	},
	"mantine": {
		"Idle": {
			"frameWidth": 64,
			"frameHeight": 72,
			"durations": [
				12,
				12,
				12,
				12,
				12,
				12,
				12,
				12
			]
		},
		"Walk": {
			"frameWidth": 64,
			"frameHeight": 72,
			"durations": [
				6,
				6,
				8,
				8,
				6,
				6,
				6,
				8,
				8,
				6
			]
		},
		"Shoot": {
			"frameWidth": 72,
			"frameHeight": 80,
			"durations": [
				2,
				2,
				2,
				2,
				6,
				1,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 64,
			"frameHeight": 64,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 48,
			"frameHeight": 48,
			"durations": [
				16,
				12,
				16,
				16,
				12,
				16
			]
		}
	},
	"rhyhorn": {
		"Idle": {
			"frameWidth": 40,
			"frameHeight": 32,
			"durations": [
				40,
				20,
				15
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				2,
				6,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"hitmonlee": {
		"Idle": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [40, 20]
		},
		"Walk": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				10,
				12,
				10,
				12
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 40,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"hitmonchan": {
		"Idle": {
			"frameWidth": 48,
			"frameHeight": 56,
			"durations": [
				30,
				6,
				8,
				6
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"kangaskhan": {
		"Idle": {
			"frameWidth": 40,
			"frameHeight": 56,
			"durations": [
				30,
				3,
				4,
				3,
				20
			]
		},
		"Walk": {
			"frameWidth": 40,
			"frameHeight": 56,
			"durations": [
				16,
				10,
				16,
				10
			]
		},
		"Shoot": {
			"frameWidth": 48,
			"frameHeight": 56,
			"durations": [
				2,
				1,
				1,
				1,
				1,
				1,
				6,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [30, 35]
		}
	},
	"lapras": {
		"Idle": {
			"frameWidth": 48,
			"frameHeight": 56,
			"durations": [
				40,
				12,
				16,
				12
			]
		},
		"Walk": {
			"frameWidth": 48,
			"frameHeight": 56,
			"durations": [
				10,
				12,
				10,
				12
			]
		},
		"Shoot": {
			"frameWidth": 64,
			"frameHeight": 72,
			"durations": [
				2,
				2,
				6,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 48,
			"frameHeight": 72,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 40,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"porygon": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				12,
				8,
				12,
				8
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				10,
				10,
				10,
				10
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				6,
				1,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				16,
				8,
				16,
				16,
				8,
				16
			]
		}
	},
	"eevee": {
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [16, 16]
		},
		"Walk": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				4,
				4,
				4,
				4,
				6,
				2,
				2
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				4,
				6,
				4,
				2,
				4,
				4,
				4,
				4
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 24,
			"durations": [30, 35]
		},
		"Faint": {
			"frameWidth": 40,
			"frameHeight": 32,
			"durations": [
				8,
				12,
				4,
				10
			]
		}
	},
	"scyther": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				40,
				10,
				14,
				10
			]
		},
		"Walk": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 48,
			"frameHeight": 64,
			"durations": [
				2,
				6,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 40,
			"frameHeight": 40,
			"durations": [30, 35]
		}
	},
	"pinsir": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				40,
				2,
				6,
				3,
				2
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				8,
				12,
				8,
				12
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"dratini": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				10,
				20,
				10,
				20
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				10,
				8,
				8,
				8,
				8
			]
		},
		"Shoot": {
			"frameWidth": 48,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				4,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [30, 35]
		}
	},
	"omanyte": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [30, 12]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				8,
				8,
				8,
				8
			]
		},
		"Shoot": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				1,
				2,
				2,
				2,
				2,
				1,
				6,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [30, 35]
		}
	},
	"kabuto": {
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [
				40,
				4,
				4
			]
		},
		"Walk": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				4,
				4,
				4,
				2,
				2,
				2,
				4,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 16,
			"durations": [30, 35]
		},
		"Faint": {
			"frameWidth": 32,
			"frameHeight": 24,
			"durations": [
				8,
				12,
				4,
				10
			]
		}
	},
	"aerodactyl": {
		"Idle": {
			"frameWidth": 40,
			"frameHeight": 64,
			"durations": [
				8,
				8,
				8,
				8,
				8,
				8,
				8,
				8
			]
		},
		"Walk": {
			"frameWidth": 40,
			"frameHeight": 64,
			"durations": [
				8,
				8,
				8,
				8
			]
		},
		"Shoot": {
			"frameWidth": 56,
			"frameHeight": 64,
			"durations": [
				2,
				2,
				6,
				1,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 40,
			"frameHeight": 64,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"snorlax": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 64,
			"durations": [
				40,
				1,
				3,
				4,
				3,
				1
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 56,
			"durations": [
				2,
				2,
				6,
				1,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 40,
			"frameHeight": 24,
			"durations": [30, 35]
		}
	},
	"heracross": {
		"Idle": {
			"frameWidth": 40,
			"frameHeight": 56,
			"durations": [
				30,
				8,
				4,
				8,
				4,
				8
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 56,
			"durations": [
				8,
				12,
				8,
				12
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 40,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 40,
			"frameHeight": 24,
			"durations": [30, 35]
		}
	},
	"alakazam": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				6,
				6,
				6,
				6,
				6,
				6,
				6,
				6
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				8,
				12,
				8,
				12
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				4,
				6,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				4
			]
		},
		"Charge": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"gengar": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				40,
				4,
				3,
				3,
				3,
				3,
				3,
				4
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 56,
			"frameHeight": 64,
			"durations": [
				2,
				4,
				1,
				1,
				10,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [30, 35]
		},
		"Faint": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				8,
				12,
				4,
				10
			]
		}
	},
	"machamp": {
		"Idle": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				40,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				12
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [30, 35]
		}
	},
	"victreebel": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 56,
			"durations": [
				35,
				3,
				3,
				5,
				5,
				5,
				3,
				3,
				3
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 56,
			"durations": [
				6,
				8,
				6,
				8
			]
		},
		"Shoot": {
			"frameWidth": 56,
			"frameHeight": 64,
			"durations": [
				2,
				2,
				2,
				4,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [30, 35]
		}
	},
	"arcanine": {
		"Idle": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [8]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 48,
			"frameHeight": 56,
			"durations": [
				2,
				2,
				6,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"nidoking": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [35, 12]
		},
		"Walk": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				8,
				14,
				8,
				14
			]
		},
		"Shoot": {
			"frameWidth": 48,
			"frameHeight": 64,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 56,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [30, 35]
		}
	},
	"nidoqueen": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				20,
				6,
				6,
				6,
				12
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 48,
			"frameHeight": 56,
			"durations": [
				2,
				2,
				4,
				1,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [30, 35]
		}
	},
	"steelix": {
		"Idle": {
			"frameWidth": 64,
			"frameHeight": 112,
			"durations": [
				18,
				8,
				18,
				8
			]
		},
		"Walk": {
			"frameWidth": 72,
			"frameHeight": 112,
			"durations": [
				10,
				14,
				10,
				14
			]
		},
		"Shoot": {
			"frameWidth": 96,
			"frameHeight": 120,
			"durations": [
				2,
				2,
				6,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 64,
			"frameHeight": 112,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 48,
			"frameHeight": 48,
			"durations": [30, 35]
		}
	},
	"gyarados": {
		"Idle": {
			"frameWidth": 72,
			"frameHeight": 128,
			"durations": [
				18,
				8,
				18,
				8
			]
		},
		"Walk": {
			"frameWidth": 88,
			"frameHeight": 128,
			"durations": [
				10,
				14,
				10,
				14
			]
		},
		"Shoot": {
			"frameWidth": 104,
			"frameHeight": 128,
			"durations": [
				2,
				2,
				4,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 96,
			"frameHeight": 112,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 72,
			"frameHeight": 112,
			"durations": [
				16,
				12,
				16,
				16,
				12,
				16
			]
		}
	},
	"articuno": {
		"Idle": {
			"frameWidth": 88,
			"frameHeight": 88,
			"durations": [
				8,
				10,
				8,
				16
			]
		},
		"Walk": {
			"frameWidth": 88,
			"frameHeight": 88,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 104,
			"frameHeight": 104,
			"durations": [
				1,
				2,
				1,
				2,
				1,
				2,
				1,
				2,
				1,
				2,
				1,
				2,
				6,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 72,
			"frameHeight": 96,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 56,
			"frameHeight": 48,
			"durations": [30, 35]
		}
	},
	"zapdos": {
		"Idle": {
			"frameWidth": 56,
			"frameHeight": 96,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Walk": {
			"frameWidth": 56,
			"frameHeight": 96,
			"durations": [
				6,
				6,
				6,
				6
			]
		},
		"Shoot": {
			"frameWidth": 72,
			"frameHeight": 112,
			"durations": [
				2,
				2,
				2,
				6,
				1,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 56,
			"frameHeight": 96,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 56,
			"frameHeight": 48,
			"durations": [30, 35]
		}
	},
	"moltres": {
		"Idle": {
			"frameWidth": 80,
			"frameHeight": 96,
			"durations": [
				8,
				12,
				8,
				12
			]
		},
		"Walk": {
			"frameWidth": 80,
			"frameHeight": 96,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 96,
			"frameHeight": 96,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 96,
			"frameHeight": 104,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 48,
			"frameHeight": 64,
			"durations": [30, 35]
		}
	},
	"raikou": {
		"Idle": {
			"frameWidth": 56,
			"frameHeight": 48,
			"durations": [
				60,
				10,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				10
			]
		},
		"Walk": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 56,
			"frameHeight": 56,
			"durations": [
				2,
				6,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 56,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [30, 35]
		}
	},
	"entei": {
		"Idle": {
			"frameWidth": 48,
			"frameHeight": 56,
			"durations": [
				60,
				10,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				10
			]
		},
		"Walk": {
			"frameWidth": 40,
			"frameHeight": 56,
			"durations": [
				10,
				12,
				10,
				12
			]
		},
		"Shoot": {
			"frameWidth": 56,
			"frameHeight": 64,
			"durations": [
				2,
				2,
				6,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				4
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 56,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [30, 35]
		}
	},
	"suicune": {
		"Idle": {
			"frameWidth": 48,
			"frameHeight": 48,
			"durations": [
				60,
				10,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				10
			]
		},
		"Walk": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				10,
				12,
				10,
				12
			]
		},
		"Shoot": {
			"frameWidth": 56,
			"frameHeight": 56,
			"durations": [
				2,
				6,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"lugia": {
		"Idle": {
			"frameWidth": 72,
			"frameHeight": 96,
			"durations": [30, 30]
		},
		"Walk": {
			"frameWidth": 80,
			"frameHeight": 96,
			"durations": [4, 4]
		},
		"Shoot": {
			"frameWidth": 88,
			"frameHeight": 128,
			"durations": [
				2,
				6,
				1,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 72,
			"frameHeight": 96,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 56,
			"frameHeight": 80,
			"durations": [30, 35]
		}
	},
	"ho_oh": {
		"Idle": {
			"frameWidth": 72,
			"frameHeight": 112,
			"durations": [
				12,
				10,
				12,
				10,
				12
			]
		},
		"Walk": {
			"frameWidth": 72,
			"frameHeight": 112,
			"durations": [
				8,
				6,
				8,
				6,
				8
			]
		},
		"Shoot": {
			"frameWidth": 80,
			"frameHeight": 120,
			"durations": [
				4,
				2,
				4,
				2,
				1,
				1,
				1,
				2,
				4,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				4
			]
		},
		"Charge": {
			"frameWidth": 72,
			"frameHeight": 112,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 56,
			"frameHeight": 56,
			"durations": [30, 35]
		}
	},
	"celebi": {
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 56,
			"durations": [
				8,
				7,
				6,
				6,
				6,
				7
			]
		},
		"Walk": {
			"frameWidth": 24,
			"frameHeight": 48,
			"durations": [
				4,
				4,
				4,
				4,
				4,
				4,
				4,
				4
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 64,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 56,
			"durations": [
				8,
				8,
				26,
				8,
				8,
				26
			]
		},
		"Faint": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				8,
				12,
				4,
				10
			]
		}
	},
	"mewtwo": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 64,
			"durations": [
				40,
				2,
				4,
				6,
				8,
				6,
				4,
				2
			]
		},
		"Walk": {
			"frameWidth": 48,
			"frameHeight": 56,
			"durations": [
				12,
				6,
				6,
				12,
				6,
				6
			]
		},
		"Shoot": {
			"frameWidth": 56,
			"frameHeight": 64,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 56,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [30, 35]
		},
		"Faint": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				8,
				12,
				4,
				10
			]
		}
	},
	"mew": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 56,
			"durations": [
				12,
				8,
				12,
				8
			]
		},
		"Walk": {
			"frameWidth": 40,
			"frameHeight": 64,
			"durations": [
				8,
				8,
				8,
				8,
				8,
				8
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 64,
			"durations": [
				2,
				2,
				2,
				3,
				3,
				3,
				3,
				3,
				3,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 56,
			"durations": [
				16,
				12,
				16,
				16,
				12,
				16
			]
		},
		"Faint": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				8,
				12,
				4,
				10
			]
		}
	},
	"noctowl": {
		"Idle": {
			"frameWidth": 40,
			"frameHeight": 64,
			"durations": [
				40,
				2,
				2,
				6,
				1,
				2,
				3,
				6,
				3,
				2,
				2,
				2,
				3,
				3,
				2,
				2
			]
		},
		"Walk": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				8,
				8,
				8,
				8
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				1,
				2,
				1,
				2,
				1,
				2,
				1,
				2,
				1,
				2,
				1,
				2,
				1,
				2,
				1,
				2
			]
		},
		"Charge": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [30, 35]
		}
	},
	"ariados": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				40,
				12,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				8
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				8,
				8,
				8,
				8
			]
		},
		"Shoot": {
			"frameWidth": 48,
			"frameHeight": 48,
			"durations": [
				2,
				6,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				4
			]
		},
		"Charge": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"ledian": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 56,
			"durations": [
				4,
				4,
				4,
				4,
				4,
				4,
				4,
				4,
				4,
				4,
				4,
				4
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 56,
			"durations": [
				4,
				4,
				4,
				4,
				4,
				4
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 56,
			"durations": [
				1,
				2,
				4,
				2,
				1,
				6,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [30, 35]
		}
	},
	"forretress": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				40,
				8,
				20,
				8
			]
		},
		"Walk": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				6,
				6,
				6,
				6,
				6,
				6,
				6,
				6
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				1,
				1,
				1,
				1,
				1,
				1,
				1,
				1,
				1,
				1,
				1,
				1,
				1,
				1,
				1,
				4,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				8,
				8,
				26,
				8,
				8,
				26
			]
		}
	},
	"gloom": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				30,
				8,
				8,
				8,
				8
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				6,
				8,
				6,
				8
			]
		},
		"Shoot": {
			"frameWidth": 48,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				6,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 40,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"poliwhirl": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				40,
				2,
				4,
				4,
				2
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 56,
			"frameHeight": 72,
			"durations": [
				1,
				1,
				2,
				6,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"dugtrio": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [12, 16]
		},
		"Walk": {
			"frameWidth": 56,
			"frameHeight": 48,
			"durations": [
				8,
				8,
				8
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 40,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"electrode": {
		"Idle": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				10,
				18,
				10,
				18
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				4,
				4,
				6,
				8,
				6,
				4,
				10
			]
		},
		"Shoot": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"persian": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [8]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 48,
			"frameHeight": 56,
			"durations": [
				2,
				2,
				4,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 16,
			"durations": [30, 35]
		}
	},
	"haunter": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 56,
			"durations": [
				14,
				8,
				14,
				8
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 56,
			"durations": [
				6,
				6,
				6,
				10,
				6,
				6,
				6,
				6,
				10,
				6
			]
		},
		"Shoot": {
			"frameWidth": 56,
			"frameHeight": 56,
			"durations": [
				2,
				6,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 40,
			"frameHeight": 56,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 56,
			"durations": [
				8,
				8,
				20,
				8,
				8,
				20
			]
		}
	},
	"hypno": {
		"Idle": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				30,
				1,
				2,
				3,
				3,
				3,
				2,
				1
			]
		},
		"Walk": {
			"frameWidth": 40,
			"frameHeight": 40,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 56,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				1,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 40,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [35, 35]
		}
	},
	"seaking": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				16,
				10,
				16,
				10,
				16,
				10,
				16,
				2,
				4,
				4,
				4,
				12,
				10,
				16,
				10
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				10,
				8,
				10,
				8
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 56,
			"durations": [
				2,
				2,
				6,
				1,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				10,
				10,
				10,
				10,
				10,
				10
			]
		}
	},
	"seadra": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 64,
			"durations": [
				12,
				12,
				12,
				12,
				8,
				8,
				8,
				8
			]
		},
		"Walk": {
			"frameWidth": 40,
			"frameHeight": 56,
			"durations": [
				8,
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 48,
			"frameHeight": 64,
			"durations": [
				2,
				6,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 56,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 56,
			"durations": [
				16,
				12,
				16,
				16,
				12,
				16
			]
		}
	},
	"tentacruel": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				6,
				10,
				10,
				6,
				10,
				10,
				10
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				4,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"flaaffy": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				30,
				4,
				3,
				3,
				3,
				4
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				6,
				1,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [30, 35]
		},
		"Faint": {
			"frameWidth": 40,
			"frameHeight": 40,
			"durations": [
				8,
				12,
				4,
				10
			]
		}
	},
	"quilava": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 24,
			"durations": [
				30,
				8,
				4,
				8,
				4
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 24,
			"durations": [
				6,
				10,
				6,
				10
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				3,
				6,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 24,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 24,
			"durations": [30, 35]
		},
		"Faint": {
			"frameWidth": 32,
			"frameHeight": 16,
			"durations": [
				8,
				12,
				4,
				10
			]
		}
	},
	"bayleef": {
		"Idle": {
			"frameWidth": 40,
			"frameHeight": 56,
			"durations": [
				40,
				14,
				20,
				14
			]
		},
		"Walk": {
			"frameWidth": 40,
			"frameHeight": 56,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 48,
			"frameHeight": 64,
			"durations": [
				2,
				2,
				6,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 40,
			"frameHeight": 56,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [30, 35]
		}
	},
	"croconaw": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [40, 25]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				12,
				10,
				12,
				10
			]
		},
		"Shoot": {
			"frameWidth": 48,
			"frameHeight": 56,
			"durations": [
				2,
				2,
				6,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"primeape": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 56,
			"durations": [
				22,
				4,
				6,
				4,
				22,
				4,
				6,
				4
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				6,
				8,
				6,
				8
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"marowak": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				40,
				6,
				16,
				6
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 48,
			"frameHeight": 56,
			"durations": [
				2,
				6,
				2,
				2,
				3,
				4
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [30, 35]
		}
	},
	"lanturn": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 56,
			"durations": [
				20,
				6,
				6,
				6,
				8,
				8,
				20,
				8,
				8
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				8,
				8,
				8,
				8
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				4,
				1,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 40,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				20,
				14,
				14,
				20,
				14,
				14
			]
		},
		"Faint": {
			"frameWidth": 40,
			"frameHeight": 32,
			"durations": [
				8,
				8,
				12,
				10
			]
		}
	},
	"muk": {
		"Idle": {
			"frameWidth": 40,
			"frameHeight": 40,
			"durations": [
				40,
				8,
				30,
				8
			]
		},
		"Walk": {
			"frameWidth": 48,
			"frameHeight": 40,
			"durations": [
				10,
				8,
				6,
				10,
				8
			]
		},
		"Shoot": {
			"frameWidth": 56,
			"frameHeight": 56,
			"durations": [
				2,
				6,
				1,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 24,
			"durations": [30, 35]
		}
	},
	"venomoth": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 56,
			"durations": [
				12,
				12,
				12,
				12,
				12,
				12,
				12,
				12
			]
		},
		"Walk": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				8,
				8,
				8,
				8,
				8,
				8,
				8,
				8,
				8,
				8,
				8,
				8
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				1,
				2,
				1,
				2,
				1,
				2,
				1,
				2,
				1,
				2,
				1,
				2,
				1,
				2,
				1,
				2,
				1,
				2,
				1,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 48,
			"durations": [
				30,
				8,
				8,
				30,
				8,
				8
			]
		}
	},
	"golduck": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				40,
				20,
				40,
				20
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				8,
				12,
				8,
				12
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 56,
			"durations": [
				2,
				2,
				6,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [35, 35]
		}
	},
	"quagsire": {
		"Idle": {
			"frameWidth": 48,
			"frameHeight": 56,
			"durations": [
				36,
				4,
				6,
				8,
				6,
				4,
				36
			]
		},
		"Walk": {
			"frameWidth": 48,
			"frameHeight": 40,
			"durations": [
				10,
				12,
				10,
				12
			]
		},
		"Shoot": {
			"frameWidth": 48,
			"frameHeight": 56,
			"durations": [
				2,
				6,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 40,
			"frameHeight": 56,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 24,
			"durations": [30, 35]
		}
	},
	"magcargo": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [30, 12]
		},
		"Walk": {
			"frameWidth": 40,
			"frameHeight": 40,
			"durations": [
				8,
				12,
				8,
				12
			]
		},
		"Shoot": {
			"frameWidth": 48,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				6,
				1,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"houndoom": {
		"Idle": {
			"frameWidth": 40,
			"frameHeight": 64,
			"durations": [
				60,
				10,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				10
			]
		},
		"Walk": {
			"frameWidth": 40,
			"frameHeight": 56,
			"durations": [
				8,
				12,
				8,
				12
			]
		},
		"Shoot": {
			"frameWidth": 48,
			"frameHeight": 64,
			"durations": [
				6,
				2,
				6,
				1,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 40,
			"frameHeight": 56,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"octillery": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [24, 20]
		},
		"Walk": {
			"frameWidth": 40,
			"frameHeight": 40,
			"durations": [
				10,
				12,
				8,
				16,
				8
			]
		},
		"Shoot": {
			"frameWidth": 56,
			"frameHeight": 48,
			"durations": [
				2,
				3,
				8,
				1,
				1,
				1,
				8,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"electabuzz": {
		"Idle": {
			"frameWidth": 40,
			"frameHeight": 56,
			"durations": [
				28,
				18,
				28,
				18
			]
		},
		"Walk": {
			"frameWidth": 40,
			"frameHeight": 56,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 48,
			"frameHeight": 56,
			"durations": [
				2,
				2,
				6,
				1,
				2,
				3,
				3,
				3,
				3,
				3,
				2
			]
		},
		"Charge": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [30, 35]
		}
	},
	"azumarill": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				30,
				6,
				6,
				6
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				6,
				1,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"rhydon": {
		"Idle": {
			"frameWidth": 48,
			"frameHeight": 48,
			"durations": [40, 26]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				8,
				12,
				8,
				12
			]
		},
		"Shoot": {
			"frameWidth": 48,
			"frameHeight": 64,
			"durations": [
				2,
				6,
				2,
				2,
				3,
				3,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 48,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [30, 35]
		}
	},
	"dragonair": {
		"Idle": {
			"frameWidth": 48,
			"frameHeight": 56,
			"durations": [
				8,
				6,
				6,
				8,
				6,
				6,
				6
			]
		},
		"Walk": {
			"frameWidth": 48,
			"frameHeight": 56,
			"durations": [
				8,
				6,
				6,
				8,
				6,
				6,
				6
			]
		},
		"Shoot": {
			"frameWidth": 64,
			"frameHeight": 80,
			"durations": [
				2,
				2,
				6,
				1,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 40,
			"frameHeight": 56,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 48,
			"durations": [30, 35]
		}
	},
	"omastar": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [30, 20]
		},
		"Walk": {
			"frameWidth": 40,
			"frameHeight": 40,
			"durations": [
				8,
				8,
				8,
				8
			]
		},
		"Shoot": {
			"frameWidth": 48,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				6,
				1,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"kabutops": {
		"Idle": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				20,
				10,
				20,
				10
			]
		},
		"Walk": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				6,
				4,
				8,
				4,
				6,
				4,
				8,
				4
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				4,
				6,
				2,
				2,
				2,
				2,
				2,
				2,
				4
			]
		},
		"Charge": {
			"frameWidth": 40,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [30, 35]
		}
	},
	"ampharos": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 64,
			"durations": [
				8,
				8,
				4,
				6,
				4,
				8,
				8
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 56,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 56,
			"durations": [
				2,
				6,
				2,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [30, 35]
		}
	},
	"typhlosion": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 56,
			"durations": [
				30,
				4,
				4,
				4
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				8,
				12,
				8,
				12
			]
		},
		"Shoot": {
			"frameWidth": 32,
			"frameHeight": 64,
			"durations": [
				3,
				6,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [30, 35]
		},
		"Faint": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				8,
				12,
				4,
				10
			]
		}
	},
	"meganium": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 56,
			"durations": [
				40,
				14,
				20,
				14
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 56,
			"durations": [
				10,
				14,
				10,
				14
			]
		},
		"Shoot": {
			"frameWidth": 48,
			"frameHeight": 64,
			"durations": [
				2,
				2,
				6,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 48,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [30, 35]
		}
	},
	"feraligatr": {
		"Idle": {
			"frameWidth": 40,
			"frameHeight": 56,
			"durations": [
				36,
				2,
				4,
				2,
				2,
				16
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				8,
				12,
				8,
				12
			]
		},
		"Shoot": {
			"frameWidth": 48,
			"frameHeight": 64,
			"durations": [
				2,
				6,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 40,
			"frameHeight": 56,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [30, 35]
		}
	},
	"dragonite": {
		"Idle": {
			"frameWidth": 40,
			"frameHeight": 64,
			"durations": [
				40,
				2,
				2,
				3,
				3,
				2,
				2
			]
		},
		"Walk": {
			"frameWidth": 40,
			"frameHeight": 56,
			"durations": [
				8,
				12,
				8,
				12
			]
		},
		"Shoot": {
			"frameWidth": 48,
			"frameHeight": 64,
			"durations": [
				2,
				2,
				6,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [30, 35]
		}
	},
	"kingdra": {
		"Idle": {
			"frameWidth": 40,
			"frameHeight": 72,
			"durations": [
				6,
				6,
				6,
				6,
				6,
				6,
				6,
				6,
				6,
				6,
				6,
				6
			]
		},
		"Walk": {
			"frameWidth": 40,
			"frameHeight": 64,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 48,
			"frameHeight": 72,
			"durations": [
				2,
				2,
				6,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 56,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 64,
			"durations": [
				16,
				12,
				16,
				16,
				12,
				16
			]
		}
	},
	"politoed": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 64,
			"durations": [
				40,
				3,
				5,
				3,
				6
			]
		},
		"Walk": {
			"frameWidth": 40,
			"frameHeight": 72,
			"durations": [
				4,
				4,
				4,
				4,
				4,
				4,
				10
			]
		},
		"Shoot": {
			"frameWidth": 40,
			"frameHeight": 64,
			"durations": [
				1,
				1,
				2,
				6,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 24,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"golem": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [30, 25]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				8,
				12,
				8,
				12
			]
		},
		"Shoot": {
			"frameWidth": 48,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				4,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 32,
			"frameHeight": 32,
			"durations": [30, 35]
		}
	},
	"porygon2": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				12,
				8,
				12,
				8
			]
		},
		"Walk": {
			"frameWidth": 32,
			"frameHeight": 48,
			"durations": [
				10,
				10,
				10,
				10
			]
		},
		"Shoot": {
			"frameWidth": 48,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				6,
				1,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 32,
			"frameHeight": 40,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 24,
			"frameHeight": 40,
			"durations": [
				16,
				12,
				16,
				16,
				12,
				16
			]
		}
	},
	"scizor": {
		"Idle": {
			"frameWidth": 32,
			"frameHeight": 64,
			"durations": [
				30,
				2,
				3,
				3,
				3,
				2
			]
		},
		"Walk": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				8,
				10,
				8,
				10
			]
		},
		"Shoot": {
			"frameWidth": 48,
			"frameHeight": 56,
			"durations": [
				2,
				2,
				6,
				1,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Charge": {
			"frameWidth": 40,
			"frameHeight": 48,
			"durations": [
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2,
				2
			]
		},
		"Sleep": {
			"frameWidth": 40,
			"frameHeight": 40,
			"durations": [30, 35]
		}
	}
};
//#endregion
//#region src/data/battleSprites.ts
var ANIM_FALLBACKS = {
	Shoot: [
		"Charge",
		"Idle",
		"Walk"
	],
	Charge: [
		"Shoot",
		"Idle",
		"Walk"
	],
	Faint: [
		"Sleep",
		"Idle",
		"Walk"
	],
	Idle: ["Walk"],
	Sleep: ["Idle", "Walk"]
};
function resolveBattleAnim(speciesId, animName, isShiny = false) {
	const species = BATTLE_SPRITE_ANIMS[speciesId];
	if (!species) return null;
	for (const name of [animName, ...ANIM_FALLBACKS[animName] ?? []]) {
		const meta = species[name];
		if (meta) return {
			name,
			url: battleSpriteUrl(speciesId, name, isShiny),
			...meta
		};
	}
	return null;
}
function battleSpriteUrl(speciesId, animName, isShiny = false) {
	return `assets/battle-sprites/${speciesId}/${animName}${isShiny ? "-Shiny" : ""}-Anim.png`;
}
//#endregion
//#region src/engine/systems/animationSystem.ts
var ATTACK_ANIM_DURATION = .5;
function desiredAnimName(entity) {
	if (isDead(entity)) return "Faint";
	if (entity.attackAnimTimer > 0) return entity.attackAnim;
	if (entity.state === "wander" || entity.state === "chase") return "Walk";
	return "Idle";
}
function tickAttackAnimTimers(world, dt) {
	const entities = [world.player, ...world.enemies];
	for (const entity of entities) if (entity && entity.attackAnimTimer > 0) entity.attackAnimTimer = Math.max(0, entity.attackAnimTimer - dt);
}
function updateAnimations(world, dt) {
	const entities = [world.player, ...world.enemies].filter((e) => Boolean(e));
	for (const entity of entities) {
		const wantedName = desiredAnimName(entity);
		const resolved = resolveBattleAnim(getSpecies(entity).id, wantedName, entity.poke.isShiny);
		if (!resolved) {
			entity.battleAnim = null;
			continue;
		}
		if (!entity.battleAnim || entity.battleAnim.url !== resolved.url) {
			entity.battleAnim = resolved;
			entity.animFrame = 0;
			entity.animElapsed = 0;
		}
		const frameOnLastFrame = entity.animFrame >= resolved.durations.length - 1;
		if (wantedName === "Faint" && frameOnLastFrame) continue;
		entity.animElapsed += dt;
		const frameDuration = resolved.durations[entity.animFrame] / 60;
		if (entity.animElapsed >= frameDuration) {
			entity.animElapsed -= frameDuration;
			entity.animFrame = frameOnLastFrame ? 0 : entity.animFrame + 1;
		}
	}
}
function faceToward(entity, target) {
	const dx = target.x - entity.x;
	const dy = target.y - entity.y;
	const dist = Math.hypot(dx, dy);
	if (dist === 0) return;
	entity.facing = {
		x: dx / dist,
		y: dy / dist
	};
}
function triggerAttackAnim(entity, isAoe, target) {
	entity.attackAnim = isAoe ? "Charge" : "Shoot";
	entity.attackAnimTimer = ATTACK_ANIM_DURATION;
	if (target) faceToward(entity, target);
}
//#endregion
//#region src/engine/systems/combatSystem.ts
var HIT_LAND_DELAY = ATTACK_ANIM_DURATION;
var IMPACT_EFFECT_DURATION = .35;
var AOE_EFFECT_DURATION = .55;
var formulaEngine$4 = createFormulaEngine(FORMULAS);
var STAB_MULTIPLIER = formulaEngine$4.eval("STAB_MULTIPLIER");
var CRIT_CHANCE = formulaEngine$4.eval("CRIT_CHANCE");
var CRIT_MULTIPLIER = formulaEngine$4.eval("CRIT_MULTIPLIER");
var SELF_DESTRUCT_ABILITY_KEYS = /* @__PURE__ */ new Set(["explosion", "selfdestruct"]);
var SELF_DESTRUCT_HP_LOSS_PERCENT = .5;
var SPEED_REFERENCE = formulaEngine$4.evalOrDefault("ATTACK_SPEED_REFERENCE", 100);
var BASE_ATTACK_INTERVAL = formulaEngine$4.evalOrDefault("BASIC_ATTACK_COOLDOWN", 2);
var MIN_ACTION_GAP = 2;
var MELEE_RANGE_PADDING = 10;
function engageRangeFor(attacker, defender) {
	return attacker.radius + defender.radius + MELEE_RANGE_PADDING;
}
function scaledCooldown(ability, speed) {
	if (ability.id === BASIC_ATTACK.id) return BASE_ATTACK_INTERVAL;
	return (ability.cooldown ?? 0) * (SPEED_REFERENCE / Math.max(1, speed));
}
function averageIv(ivs) {
	const vals = ivs ? Object.values(ivs) : [];
	if (!vals.length) return 0;
	return vals.reduce((sum, v) => sum + v, 0) / vals.length;
}
var MAGNITUDE_TABLE = [
	{
		chance: 5,
		power: 10
	},
	{
		chance: 10,
		power: 30
	},
	{
		chance: 20,
		power: 50
	},
	{
		chance: 30,
		power: 70
	},
	{
		chance: 20,
		power: 90
	},
	{
		chance: 10,
		power: 110
	},
	{
		chance: 5,
		power: 150
	}
];
function rollMagnitudePower(rng) {
	let roll = nextFloat(rng) * 100;
	for (const tier of MAGNITUDE_TABLE) {
		if (roll < tier.chance) return tier.power;
		roll -= tier.chance;
	}
	return MAGNITUDE_TABLE[MAGNITUDE_TABLE.length - 1].power;
}
function hpRatioPower(attackerPoke) {
	const ratio = Math.max(0, attackerPoke.hp) / attackerPoke.stats.hp;
	if (ratio <= .04) return 200;
	if (ratio <= .09) return 150;
	if (ratio <= .16) return 100;
	if (ratio <= .32) return 80;
	if (ratio <= .48) return 40;
	return 20;
}
function rollPresentPower(rng) {
	const roll = nextFloat(rng);
	if (roll < .4) return 40;
	if (roll < .7) return 80;
	return 120;
}
function hiddenPowerPower(attackerPoke) {
	return 30 + Math.round(averageIv(attackerPoke.ivs) / 31 * 40);
}
function psywaveDamage(rng, attackerPoke) {
	return Math.max(1, Math.round(attackerPoke.level * randRange(rng, .5, 1.5)));
}
var DYNAMIC_POWER_ABILITIES = {
	magnitude: (rng) => rollMagnitudePower(rng),
	reversal: (_rng, attackerPoke) => hpRatioPower(attackerPoke),
	flail: (_rng, attackerPoke) => hpRatioPower(attackerPoke),
	present: (rng) => rollPresentPower(rng),
	hidden_power: (_rng, attackerPoke) => hiddenPowerPower(attackerPoke)
};
var COUNTER_MEMORY_WINDOW = 3;
function counterDamage(attackerEntity, category) {
	const memory = attackerEntity.lastDamageTaken[category];
	if (memory.amount > 0 && memory.age <= COUNTER_MEMORY_WINDOW) return memory.amount * 2;
	return null;
}
var FIXED_DAMAGE_ABILITIES = {
	seismic_toss: (attackerPoke) => attackerPoke.level,
	night_shade: (attackerPoke) => attackerPoke.level,
	dragon_rage: () => 40,
	super_fang: (_a, defenderPoke) => Math.max(1, Math.floor(defenderPoke.hp / 2)),
	horn_drill: (_a, defenderPoke) => defenderPoke.hp,
	fissure: (_a, defenderPoke) => defenderPoke.hp,
	psywave: (attackerPoke, _d, _e, rng) => psywaveDamage(rng, attackerPoke),
	counter: (_a, _d, attackerEntity) => counterDamage(attackerEntity, "physical"),
	mirror_coat: (_a, _d, attackerEntity) => counterDamage(attackerEntity, "special")
};
function specialDamageFor(rng, ability, attackerEntity, defenderEntity) {
	const attackerPoke = attackerEntity.poke;
	const defenderPoke = defenderEntity.poke;
	const dynamic = DYNAMIC_POWER_ABILITIES[ability.id];
	if (dynamic) return {
		mode: "dynamicPower",
		power: dynamic(rng, attackerPoke)
	};
	const fixed = FIXED_DAMAGE_ABILITIES[ability.id];
	if (fixed) {
		const amount = fixed(attackerPoke, defenderPoke, attackerEntity, rng);
		if (amount === null) return {
			mode: "dynamicPower",
			power: 40
		};
		return {
			mode: "fixed",
			amount
		};
	}
	return null;
}
function estimateDamage(rng, attackerEntity, defenderEntity, ability) {
	const attackerPoke = attackerEntity.poke;
	const defenderPoke = defenderEntity.poke;
	const attackerSpecies = SPECIES[attackerPoke.speciesId];
	const defenderSpecies = SPECIES[defenderPoke.speciesId];
	const effectivenessMultiplier = getEffectiveness(ability.type, defenderSpecies.type, defenderSpecies.type2);
	if (effectivenessMultiplier === 0) return 0;
	const special = specialDamageFor(deriveRng(rng.state, "estimate"), ability, attackerEntity, defenderEntity);
	if (special && special.mode === "fixed") return special.amount;
	const isPhysical = resolveAbilityCategory(ability, attackerPoke) === "physical";
	const atk = isPhysical ? attackerPoke.stats.atkFis : attackerPoke.stats.atkEsp;
	const def = isPhysical ? defenderPoke.stats.def : defenderPoke.stats.defEsp;
	const power = special && special.mode === "dynamicPower" ? special.power : ability.power;
	let dmg = formulaEngine$4.eval("DAMAGE_BASE", {
		level: attackerPoke.level,
		power,
		atk,
		def
	});
	if (Boolean(ability.type) && (ability.type === attackerSpecies.type || ability.type === attackerSpecies.type2)) dmg *= STAB_MULTIPLIER;
	dmg *= effectivenessMultiplier;
	return dmg;
}
var DANO_VARIACAO_MINIMA = .85;
function computeDamage(rng, attackerEntity, defenderEntity, ability, pessimista = false) {
	const attackerPoke = attackerEntity.poke;
	const defenderPoke = defenderEntity.poke;
	const attackerSpecies = SPECIES[attackerPoke.speciesId];
	const defenderSpecies = SPECIES[defenderPoke.speciesId];
	const effectivenessMultiplier = getEffectiveness(ability.type, defenderSpecies.type, defenderSpecies.type2);
	const special = specialDamageFor(rng, ability, attackerEntity, defenderEntity);
	let dmg;
	let isCrit = false;
	if (special && special.mode === "fixed") dmg = effectivenessMultiplier === 0 ? 0 : special.amount;
	else {
		const isPhysical = resolveAbilityCategory(ability, attackerPoke) === "physical";
		const atk = isPhysical ? attackerPoke.stats.atkFis : attackerPoke.stats.atkEsp;
		const def = isPhysical ? defenderPoke.stats.def : defenderPoke.stats.defEsp;
		const power = special && special.mode === "dynamicPower" ? special.power : ability.power;
		dmg = formulaEngine$4.eval("DAMAGE_BASE", {
			level: attackerPoke.level,
			power,
			atk,
			def
		});
		if (Boolean(ability.type) && (ability.type === attackerSpecies.type || ability.type === attackerSpecies.type2)) dmg *= STAB_MULTIPLIER;
		dmg *= effectivenessMultiplier;
		isCrit = pessimista ? false : rollChance(rng, CRIT_CHANCE);
		if (isCrit) dmg *= CRIT_MULTIPLIER;
		dmg *= pessimista ? DANO_VARIACAO_MINIMA : formulaEngine$4.eval("DAMAGE_VARIATION", {}, rng);
	}
	let effectiveness = "normal";
	let effectivenessLabel = null;
	if (effectivenessMultiplier === 0) {
		effectiveness = "immune";
		effectivenessLabel = "Imune!";
	} else if (effectivenessMultiplier > 2) {
		effectiveness = "super";
		effectivenessLabel = "Super efetivo!";
	} else if (effectivenessMultiplier > 1) {
		effectiveness = "effective";
		effectivenessLabel = "Efetivo!";
	} else if (effectivenessMultiplier < 1) {
		effectiveness = "weak";
		effectivenessLabel = "Pouco efetivo";
	}
	return {
		amount: effectivenessMultiplier === 0 ? 0 : Math.max(1, Math.round(dmg)),
		effectiveness,
		effectivenessLabel,
		isCrit
	};
}
var EFFECTIVENESS_COLORS = {
	super: "#ff8c1a",
	effective: "#ffe14d",
	normal: "#ffffff",
	weak: "#5a5a5a",
	immune: "#000000"
};
function spawnDamageNumber(world, target, result) {
	world.effects.push(createWorldEffect(world.counters, {
		type: "damageNumber",
		x: target.x,
		y: target.y,
		targetX: target.x,
		targetY: target.y - target.radius - 40,
		color: EFFECTIVENESS_COLORS[result.effectiveness],
		duration: .9,
		value: result.amount,
		effectiveness: result.effectiveness !== "normal" ? result.effectiveness : void 0,
		effectivenessLabel: result.effectivenessLabel,
		owner: target,
		laneSize: result.effectivenessLabel ? 2 : 1
	}));
}
function basicAttackFor(attackerSpecies) {
	return {
		...BASIC_ATTACK,
		type: attackerSpecies.type
	};
}
function pickAbility(rng, entity, defenderEntity, aoeTargetCounter) {
	const attackerSpecies = SPECIES[entity.poke.speciesId];
	const disabled = entity.poke.disabledAbilities || {};
	const ready = [...entity.poke.unlockedAbilities, BASIC_ATTACK.id].filter((id) => !disabled[id]).map((id) => id === BASIC_ATTACK.id ? basicAttackFor(attackerSpecies) : getAbility(id)).filter((ability) => ability != null && isDamagingAbility(ability) && isAbilityReady(entity, ability.id));
	if (ready.length === 0) return null;
	const aoeReady = ready.filter((a) => a.target === "aoe" && aoeTargetCounter(a) >= 2);
	return (aoeReady.length > 0 ? aoeReady : ready).reduce((best, a) => estimateDamage(rng, entity, defenderEntity, a) > estimateDamage(rng, entity, defenderEntity, best) ? a : best);
}
function queueHit(world, attacker, target, ability) {
	world.pendingHits.push({
		id: `hit-${world.counters.pendingHit++}`,
		timer: HIT_LAND_DELAY,
		attackerId: attacker.id,
		targetId: target.id,
		ability
	});
}
function queueAoeVisual(world, attacker, ability) {
	world.pendingHits.push({
		id: `hit-${world.counters.pendingHit++}`,
		timer: HIT_LAND_DELAY,
		attackerId: attacker.id,
		targetId: null,
		ability,
		isAoeVisual: true
	});
}
function announceAbility(world, attacker, ability) {
	world.effects.push(createWorldEffect(world.counters, {
		type: "abilityName",
		x: attacker.x,
		y: attacker.y,
		targetX: attacker.x,
		targetY: attacker.y + getGroundOffset(attacker) + 14,
		text: ability.name,
		color: colorForType(ability.type),
		duration: .8,
		owner: attacker
	}));
}
function nearbyAliveEnemies(world) {
	return world.enemies.filter((e) => !isDead(e));
}
function executePlayerAction(world, player, engagedEnemies) {
	if (!canAct(player)) return;
	const primaryTarget = engagedEnemies[0];
	const allEnemies = nearbyAliveEnemies(world);
	const ability = pickAbility(world.rng, player, primaryTarget, (a) => allEnemies.filter((e) => Math.hypot(e.x - player.x, e.y - player.y) <= (a.radius ?? 0)).length);
	if (!ability) return;
	startCooldown(player, ability.id, scaledCooldown(ability, player.poke.stats.speed));
	startGlobalCooldown(player, MIN_ACTION_GAP);
	triggerAttackAnim(player, ability.target === "aoe", primaryTarget);
	announceAbility(world, player, ability);
	const targets = ability.target === "aoe" ? allEnemies.filter((e) => Math.hypot(e.x - player.x, e.y - player.y) <= (ability.radius ?? 0)) : [engagedEnemies[0]].filter(Boolean);
	for (const target of targets) queueHit(world, player, target, ability);
	if (ability.target === "aoe") queueAoeVisual(world, player, ability);
}
function executeEnemyAction(world, enemy, player) {
	if (!canAct(enemy)) return;
	const ability = pickAbility(world.rng, enemy, player, () => 1);
	if (!ability) return;
	startCooldown(enemy, ability.id, scaledCooldown(ability, enemy.poke.stats.speed));
	startGlobalCooldown(enemy, MIN_ACTION_GAP);
	triggerAttackAnim(enemy, ability.target === "aoe", player);
	announceAbility(world, enemy, ability);
	queueHit(world, enemy, player, ability);
	if (ability.target === "aoe") queueAoeVisual(world, enemy, ability);
}
function resolveHit(world, hit, defeatedEnemyIds, onPlayerFainted, silent) {
	const attacker = findEntityById(world.player, world.enemies, hit.attackerId);
	if (!attacker) return;
	const { ability } = hit;
	if (isDead(attacker)) return;
	if (hit.isAoeVisual) {
		if (!silent) world.effects.push(createWorldEffect(world.counters, {
			type: "abilityEffect",
			x: attacker.x,
			y: attacker.y,
			targetX: attacker.x,
			targetY: attacker.y - attacker.radius * .6,
			color: colorForType(ability.type),
			isAoe: true,
			duration: AOE_EFFECT_DURATION,
			worldSize: (ability.radius ?? 0) * 2,
			elementType: ability.type
		}));
		if (SELF_DESTRUCT_ABILITY_KEYS.has(ability.id) && !isDead(attacker)) {
			const recoil = Math.round(attacker.poke.hp * SELF_DESTRUCT_HP_LOSS_PERCENT);
			takeDamage(attacker, recoil);
			if (!silent) spawnDamageNumber(world, attacker, {
				amount: recoil,
				effectiveness: "normal",
				effectivenessLabel: null,
				isCrit: false
			});
			if (isDead(attacker)) {
				if (attacker.kind === "player") {
					if (!attacker.fainted) {
						attacker.fainted = true;
						onPlayerFainted();
					}
				} else if (!attacker.deathHandled) {
					attacker.deathHandled = true;
					defeatedEnemyIds.push(attacker.id);
				}
			}
		}
		return;
	}
	const target = findEntityById(world.player, world.enemies, hit.targetId);
	if (!target || isDead(target)) return;
	const result = computeDamage(world.rng, attacker, target, ability, world.pessimista);
	takeDamage(target, result.amount, resolveAbilityCategory(ability, attacker.poke));
	if (!silent) spawnDamageNumber(world, target, result);
	const isPlayerAttacker = attacker.kind === "player";
	if (!(ability.target === "aoe") && !silent) world.effects.push(createWorldEffect(world.counters, {
		type: "abilityEffect",
		x: target.x,
		y: target.y,
		targetX: target.x,
		targetY: target.y - target.radius * .6,
		color: colorForType(ability.type),
		isAoe: false,
		duration: IMPACT_EFFECT_DURATION,
		elementType: ability.type
	}));
	if (!isDead(target)) return;
	if (isPlayerAttacker) {
		if (!target.deathHandled) {
			target.deathHandled = true;
			defeatedEnemyIds.push(target.id);
		}
	} else if (target.kind === "player" && !target.fainted) {
		target.fainted = true;
		onPlayerFainted();
	}
}
function updateCombat(world, dt, opts = {}) {
	const silent = opts.silent ?? false;
	const { player, enemies } = world;
	if (!player) return {
		defeatedEnemyIds: [],
		playerJustFainted: false
	};
	tickCooldowns(player, dt);
	for (const enemy of enemies) tickCooldowns(enemy, dt);
	for (const effect of world.effects) tickEffect(effect, dt);
	for (const effect of world.effects) if (effectDone(effect) && effect.ownerId) {
		const owner = findEntityById(player, enemies, effect.ownerId);
		if (owner) releaseEffectLane(owner, effect.id);
	}
	world.effects = world.effects.filter((e) => !effectDone(e));
	const defeatedEnemyIds = [];
	let playerJustFainted = false;
	for (const hit of world.pendingHits) hit.timer -= dt;
	const landed = world.pendingHits.filter((hit) => hit.timer <= 0);
	world.pendingHits = world.pendingHits.filter((hit) => hit.timer > 0);
	for (const hit of landed) resolveHit(world, hit, defeatedEnemyIds, () => {
		playerJustFainted = true;
	}, silent);
	if (player.fainted) return {
		defeatedEnemyIds,
		playerJustFainted
	};
	const engagedEnemies = enemies.filter((e) => !isDead(e) && e.state === "engaged" && e.targetId === player.id);
	if (engagedEnemies.length > 0) {
		executePlayerAction(world, player, engagedEnemies);
		for (const enemy of engagedEnemies) {
			if (isDead(enemy) || player.fainted) continue;
			executeEnemyAction(world, enemy, player);
		}
	}
	return {
		defeatedEnemyIds,
		playerJustFainted
	};
}
//#endregion
//#region src/engine/systems/movementSystem.ts
var WANDER_MARGIN = 40;
var ARRIVE_THRESHOLD = 4;
var WANDER_PAUSE_MIN = 1;
var WANDER_PAUSE_MAX = 3;
var PATH_RECALC_INTERVAL = 1;
var PATH_TARGET_DRIFT = 60;
var PATH_TARGET_BIG_JUMP = 150;
function canOccupy(mapDef, x, y) {
	return !isCellBlocked(mapDef, x, y);
}
function stepDirect(entity, tx, ty, speed, dt) {
	const dx = tx - entity.x;
	const dy = ty - entity.y;
	const dist = Math.hypot(dx, dy);
	if (dist <= ARRIVE_THRESHOLD) return true;
	const step = Math.min(1, speed * dt / dist);
	entity.x += dx * step;
	entity.y += dy * step;
	entity.facing = {
		x: dx / dist,
		y: dy / dist
	};
	return false;
}
function slideToward(entity, tx, ty, speed, dt, mapDef) {
	const dx = tx - entity.x, dy = ty - entity.y;
	const dist = Math.hypot(dx, dy);
	if (dist <= ARRIVE_THRESHOLD) return true;
	const step = speed * dt;
	const ratio = Math.min(1, step / dist);
	const stepX = dx * ratio, stepY = dy * ratio;
	entity.facing = {
		x: dx / dist,
		y: dy / dist
	};
	const fullX = entity.x + stepX, fullY = entity.y + stepY;
	if (canOccupy(mapDef, fullX, fullY)) {
		entity.x = fullX;
		entity.y = fullY;
	} else if (canOccupy(mapDef, fullX, entity.y)) entity.x = fullX;
	else if (canOccupy(mapDef, entity.x, fullY)) entity.y = fullY;
	return false;
}
function hasLineOfSight(mapDef, x0, y0, x1, y1) {
	const dist = Math.hypot(x1 - x0, y1 - y0);
	const steps = Math.max(1, Math.ceil(dist / 20));
	for (let i = 1; i <= steps; i++) {
		const t = i / steps;
		if (isCellBlocked(mapDef, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
	}
	return true;
}
function moveToward(entity, tx, ty, speed, dt, mapDef) {
	if (!mapDef || !mapDef.collisionGrid) return stepDirect(entity, tx, ty, speed, dt);
	if (Math.hypot(tx - entity.x, ty - entity.y) <= ARRIVE_THRESHOLD) {
		entity.pathWaypoints = null;
		return true;
	}
	entity.pathRecalcTimer -= dt;
	const targetJump = Math.hypot(tx - (entity.pathTargetX ?? tx), ty - (entity.pathTargetY ?? ty));
	const drifted = targetJump > PATH_TARGET_DRIFT;
	const bigJump = targetJump > PATH_TARGET_BIG_JUMP;
	if (entity.pathWaypoints == null || bigJump || drifted && entity.pathRecalcTimer <= 0) {
		if (hasLineOfSight(mapDef, entity.x, entity.y, tx, ty)) entity.pathWaypoints = [];
		else {
			entity.pathWaypoints = findPath(mapDef, entity.x, entity.y, tx, ty) || [];
			entity.pathIndex = 0;
		}
		entity.pathTargetX = tx;
		entity.pathTargetY = ty;
		entity.pathRecalcTimer = PATH_RECALC_INTERVAL;
	}
	if (entity.pathWaypoints.length > 0) {
		const wp = entity.pathWaypoints[entity.pathIndex];
		if (stepDirect(entity, wp.x, wp.y, speed, dt)) {
			entity.pathIndex += 1;
			if (entity.pathIndex >= entity.pathWaypoints.length) entity.pathWaypoints = null;
		}
		return false;
	}
	return slideToward(entity, tx, ty, speed, dt, mapDef);
}
function clampToMapCircle(x, y, mapCx, mapCy, mapRadius) {
	const dx = x - mapCx;
	const dy = y - mapCy;
	const dist = Math.hypot(dx, dy);
	if (dist <= mapRadius || dist === 0) return {
		x,
		y
	};
	const ratio = mapRadius / dist;
	return {
		x: mapCx + dx * ratio,
		y: mapCy + dy * ratio
	};
}
function wanderStep(rng, entity, dt, centerX, centerY, radius, mapCx, mapCy, mapRadius, mapDef) {
	if (entity.wanderTarget) {
		const prevX = entity.x, prevY = entity.y;
		const arrived = moveToward(entity, entity.wanderTarget.x, entity.wanderTarget.y, entity.moveSpeed, dt, mapDef);
		const stuck = !arrived && entity.x === prevX && entity.y === prevY;
		if (arrived || stuck) {
			entity.wanderTarget = null;
			entity.wanderPause = randRange(rng, WANDER_PAUSE_MIN, WANDER_PAUSE_MAX);
		}
		return;
	}
	if (entity.wanderPause > 0) {
		entity.wanderPause -= dt;
		return;
	}
	const angle = randRange(rng, 0, Math.PI * 2);
	const dist = randRange(rng, radius * .3, radius);
	entity.wanderTarget = clampToMapCircle(centerX + Math.cos(angle) * dist, centerY + Math.sin(angle) * dist, mapCx, mapCy, mapRadius);
}
function findNearestAliveEnemy(player, enemies) {
	let nearest = null;
	let nearestDist = Infinity;
	for (const enemy of enemies) {
		if (isDead(enemy)) continue;
		const dist = distanceTo(player, enemy);
		if (dist < nearestDist) {
			nearestDist = dist;
			nearest = enemy;
		}
	}
	return nearest;
}
function findNearestAliveShiny(player, enemies) {
	let nearest = null;
	let nearestDist = Infinity;
	for (const enemy of enemies) {
		if (isDead(enemy) || !enemy.poke.isShiny) continue;
		const dist = distanceTo(player, enemy);
		if (dist < nearestDist) {
			nearestDist = dist;
			nearest = enemy;
		}
	}
	return nearest;
}
function wanderFreely(rng, entity, dt, cx, cy, radius, mapDef) {
	if (entity.wanderTarget) {
		const prevX = entity.x, prevY = entity.y;
		const arrived = moveToward(entity, entity.wanderTarget.x, entity.wanderTarget.y, entity.moveSpeed, dt, mapDef);
		const stuck = !arrived && entity.x === prevX && entity.y === prevY;
		if (arrived || stuck) {
			entity.wanderTarget = null;
			entity.wanderPause = randRange(rng, WANDER_PAUSE_MIN, WANDER_PAUSE_MAX);
		}
		return;
	}
	if (entity.wanderPause > 0) {
		entity.wanderPause -= dt;
		return;
	}
	const angle = randRange(rng, 0, Math.PI * 2);
	const dist = Math.sqrt(randRange(rng, 0, 1)) * radius;
	entity.wanderTarget = {
		x: cx + Math.cos(angle) * dist,
		y: cy + Math.sin(angle) * dist
	};
}
function updateMovement(world, dt) {
	const { player, enemies, mapDef } = world;
	if (!player || !mapDef) return;
	const mapCx = mapDef.bounds.width / 2;
	const mapCy = mapDef.bounds.height / 2;
	const mapRadius = mapWalkRadius(mapDef) - WANDER_MARGIN;
	if (player.fainted) player.state = "dead";
	else if (player.attackAnimTimer > 0) player.state = "engaged";
	else {
		const targetEnemy = findNearestAliveShiny(player, enemies) || findNearestAliveEnemy(player, enemies);
		if (targetEnemy) {
			const engageRange = engageRangeFor(player, targetEnemy);
			if (distanceTo(player, targetEnemy) <= engageRange) player.state = "engaged";
			else {
				player.state = "chase";
				moveToward(player, targetEnemy.x, targetEnemy.y, player.moveSpeed, dt, mapDef);
				player.wanderTarget = null;
			}
		} else {
			player.state = "wander";
			wanderFreely(world.rng, player, dt, mapCx, mapCy, mapRadius, mapDef);
		}
	}
	for (const enemy of enemies) {
		if (isDead(enemy)) {
			enemy.state = "dead";
			continue;
		}
		if (enemy.attackAnimTimer > 0) {
			enemy.state = "engaged";
			continue;
		}
		if (player.fainted) {
			enemy.state = "wander";
			enemy.targetId = null;
			wanderStep(world.rng, enemy, dt, enemy.spawnPoint.x, enemy.spawnPoint.y, enemy.wanderRadius, mapCx, mapCy, mapRadius, mapDef);
			continue;
		}
		const dist = distanceTo(enemy, player);
		if (dist <= engageRangeFor(enemy, player)) {
			enemy.state = "engaged";
			enemy.targetId = player.id;
			enemy.wanderTarget = null;
		} else if (dist <= enemy.aggroRadius || (enemy.state === "chase" || enemy.state === "engaged") && dist <= enemy.leashRadius) {
			enemy.state = "chase";
			enemy.targetId = player.id;
			enemy.wanderTarget = null;
			moveToward(enemy, player.x, player.y, enemy.moveSpeed, dt, mapDef);
		} else {
			enemy.state = "wander";
			enemy.targetId = null;
			if (Math.hypot(enemy.x - enemy.spawnPoint.x, enemy.y - enemy.spawnPoint.y) > enemy.wanderRadius) {
				moveToward(enemy, enemy.spawnPoint.x, enemy.spawnPoint.y, enemy.moveSpeed, dt, mapDef);
				enemy.wanderTarget = null;
			} else wanderStep(world.rng, enemy, dt, enemy.spawnPoint.x, enemy.spawnPoint.y, enemy.wanderRadius, mapCx, mapCy, mapRadius, mapDef);
		}
	}
}
//#endregion
//#region src/engine/systems/captureSystem.ts
var CAPTURE_LEVEL = 1;
var formulaEngine$3 = createFormulaEngine(FORMULAS);
var GLOBAL_CATCH_MULTIPLIER = formulaEngine$3.eval("GLOBAL_CATCH_MULTIPLIER");
function attemptCapture(rng, gameState, defeatedPoke, ballItemId) {
	const ball = getItem(ballItemId);
	if (!ball || ball.kind !== "ball" || ball.captureRate == null) return {
		success: false,
		reason: "invalid_ball"
	};
	if (!gameState.removeItem(ballItemId, 1)) return {
		success: false,
		reason: "no_ball"
	};
	const species = SPECIES[defeatedPoke.speciesId];
	const chance = clamp(formulaEngine$3.eval("CATCH_CHANCE", {
		catchRate: species.catchRate,
		ballMultiplier: ball.captureRate,
		catchMultiplier: GLOBAL_CATCH_MULTIPLIER
	}), 0, 1);
	if (!rollChance(rng, chance)) return {
		success: false,
		reason: "roll_failed",
		chance,
		ballItemId
	};
	const stats = computeStatsAtLevel(species, CAPTURE_LEVEL, defeatedPoke.ivs, defeatedPoke.rarity, defeatedPoke.isShiny);
	const newPoke = {
		...defeatedPoke,
		uid: novoPokeUid(),
		level: CAPTURE_LEVEL,
		exp: pokeExpForLevel(CAPTURE_LEVEL, species.growthCurve),
		originalTrainer: gameState.trainer.name,
		stats,
		hp: stats.hp,
		unlockedAbilities: species.abilities.filter((entry) => entry.levelReq <= CAPTURE_LEVEL).map((entry) => entry.key).filter((key) => getAbility(key))
	};
	gameState.addCapturedPoke(newPoke);
	return {
		success: true,
		location: "bag",
		chance,
		poke: newPoke,
		ballItemId
	};
}
//#endregion
//#region src/engine/systems/autoSystem.ts
var AUTO_ACTION_COOLDOWN = 1;
function resolveRulePotionId(gameState, rule) {
	if (rule.itemId !== "best") return rule.itemId;
	return Object.values(ITEMS).filter((item) => item.kind === "potion" && gameState.hasItem(item.id, 1)).sort((a, b) => (b.healAmount ?? 0) - (a.healAmount ?? 0))[0]?.id || null;
}
function updateAutoHeal(world, gameState, dt) {
	const player = world.player;
	const events = [];
	if (!player) return events;
	const timers = world.autoTimers;
	timers.pot = Math.max(0, timers.pot - dt);
	timers.revive = Math.max(0, timers.revive - dt);
	const isBossHunt = Boolean(world.mapDef && world.mapDef.noRespawn);
	if (!isBossHunt && gameState.autoToggles.autoRevive && player.fainted) world.reviveCountdown = world.reviveCountdown == null ? 5 : Math.max(0, world.reviveCountdown - dt);
	else world.reviveCountdown = null;
	if (!isBossHunt && gameState.autoToggles.autoRevive && player.fainted && (world.reviveCountdown ?? 0) <= 0 && timers.revive <= 0) {
		const revive = getItem("revive");
		if (revive && "reviveHpPercent" in revive && revive.reviveHpPercent != null && gameState.hasItem("revive", 1)) {
			gameState.removeItem("revive", 1);
			player.poke.hp = Math.round(player.poke.stats.hp * revive.reviveHpPercent);
			player.fainted = false;
			player.state = "wander";
			timers.revive = AUTO_ACTION_COOLDOWN;
			world.reviveCountdown = null;
			events.push({
				type: "auto_revive",
				itemId: "revive"
			});
		}
	}
	if (!isBossHunt && !player.fainted && gameState.autoToggles.autoPot && timers.pot <= 0) {
		const hpPct = player.poke.hp / player.poke.stats.hp * 100;
		for (const rule of gameState.autoPotRules) {
			if (hpPct > rule.hpPercent) continue;
			const resolvedId = resolveRulePotionId(gameState, rule);
			const item = resolvedId && getItem(resolvedId);
			if (!item || !("healAmount" in item) || item.healAmount == null || !gameState.hasItem(resolvedId, 1)) continue;
			gameState.removeItem(resolvedId, 1);
			heal(player, item.healAmount);
			timers.pot = AUTO_ACTION_COOLDOWN;
			events.push({
				type: "auto_pot",
				itemId: resolvedId
			});
			break;
		}
	}
	return events;
}
function maybeAutoCatch(rng, gameState, defeatedPoke) {
	if (!gameState.autoToggles.autoCatch) return null;
	const rule = gameState.autoCatchRules.find((r) => r.speciesId === defeatedPoke.speciesId);
	if (rule) {
		if (!rule.ballItemId || !gameState.hasItem(rule.ballItemId, 1)) return null;
		return attemptCapture(rng, gameState, defeatedPoke, rule.ballItemId);
	}
	const config = gameState.autoCatchConfig;
	const ballId = Boolean(defeatedPoke.isShiny) && config.catchShinyEnabled ? config.shinyBallId : config.ballId;
	if (!ballId || !gameState.hasItem(ballId, 1)) return null;
	return attemptCapture(rng, gameState, defeatedPoke, ballId);
}
//#endregion
//#region src/engine/systems/progressionSystem.ts
var formulaEngine$2 = createFormulaEngine(FORMULAS);
var XP_GLOBAL_MULTIPLIER = formulaEngine$2.evalOrDefault("XP_GLOBAL_MULTIPLIER", .14);
var DEATH_EXP_LOSS_PERCENT = formulaEngine$2.evalOrDefault("DEATH_EXP_LOSS_PERCENT", .05);
function expRewardForEnemy(enemyPoke) {
	const species = SPECIES[enemyPoke.speciesId];
	const base = formulaEngine$2.eval("EXP_GAIN", {
		baseExp: species.baseExp,
		level: enemyPoke.level
	});
	return Math.max(1, Math.round(base * XP_GLOBAL_MULTIPLIER));
}
function expProgressForInstance(pokeInstance, species) {
	const currentBase = pokeExpForLevel(pokeInstance.level, species.growthCurve);
	const nextTotal = pokeExpForLevel(pokeInstance.level + 1, species.growthCurve);
	return {
		into: pokeInstance.exp - currentBase,
		needed: Math.max(1, nextTotal - currentBase)
	};
}
var TRAINER_GROWTH_CURVE = "MEDIUM_SLOW";
function grantTrainerExp(trainer, amount) {
	let exp = trainer.exp + amount;
	let level = trainer.level;
	let leveledUp = false;
	while (exp >= totalExpForLevel(level + 1, TRAINER_GROWTH_CURVE)) {
		level += 1;
		leveledUp = true;
	}
	return {
		trainer: {
			...trainer,
			exp,
			level
		},
		leveledUp,
		level
	};
}
function grantExp(pokeInstance, amount) {
	const species = SPECIES[pokeInstance.speciesId];
	let exp = pokeInstance.exp + amount;
	let level = pokeInstance.level;
	let stats = pokeInstance.stats;
	let hp = pokeInstance.hp;
	const unlockedAbilities = [...pokeInstance.unlockedAbilities];
	let leveledUp = false;
	const newAbilities = [];
	while (exp >= pokeExpForLevel(level + 1, species.growthCurve)) {
		const previousMaxHp = stats.hp;
		level += 1;
		leveledUp = true;
		stats = computeStatsAtLevel(species, level, pokeInstance.ivs, pokeInstance.rarity, pokeInstance.isShiny);
		const hpGain = stats.hp - previousMaxHp;
		hp = Math.min(stats.hp, hp + hpGain);
		for (const entry of species.abilities) {
			if (entry.levelReq !== level || unlockedAbilities.includes(entry.key)) continue;
			const ability = getAbility(entry.key);
			if (!ability) continue;
			unlockedAbilities.push(entry.key);
			newAbilities.push(ability);
		}
	}
	const poke = {
		...pokeInstance,
		exp,
		level,
		stats,
		hp,
		unlockedAbilities
	};
	const statGains = leveledUp ? diffStats(pokeInstance.stats, stats) : null;
	return {
		poke,
		leveledUp,
		newAbilities,
		level,
		statGains
	};
}
function diffStats(antes, depois) {
	const out = {};
	for (const key of Object.keys(depois)) out[key] = depois[key] - antes[key];
	return out;
}
function applyDeathExpPenalty(pokeInstance) {
	const species = SPECIES[pokeInstance.speciesId];
	const { needed } = expProgressForInstance(pokeInstance, species);
	let exp = Math.max(0, pokeInstance.exp - Math.round(needed * DEATH_EXP_LOSS_PERCENT));
	const floor = pokeInstance.minLevel || 1;
	let level = pokeInstance.level;
	let stats = pokeInstance.stats;
	let hp = pokeInstance.hp;
	let leveledDown = false;
	while (level > floor && exp < pokeExpForLevel(level, species.growthCurve)) {
		level -= 1;
		leveledDown = true;
		stats = computeStatsAtLevel(species, level, pokeInstance.ivs, pokeInstance.rarity, pokeInstance.isShiny);
		hp = Math.min(hp, stats.hp);
	}
	return {
		poke: {
			...pokeInstance,
			exp,
			level,
			stats,
			hp
		},
		leveledDown,
		level
	};
}
//#endregion
//#region src/engine/systems/economySystem.ts
var formulaEngine$1 = createFormulaEngine(FORMULAS);
var POKEMON_SELL_DIVISOR = formulaEngine$1.eval("POKEMON_SELL_DIVISOR");
var KILL_MONEY_DIVISOR = formulaEngine$1.eval("KILL_MONEY_DIVISOR");
var STONE_DROP_CHANCE = formulaEngine$1.evalOrDefault("STONE_DROP_CHANCE", .05);
var KILL_GOLD_MULTIPLIER = formulaEngine$1.evalOrDefault("KILL_GOLD_MULTIPLIER", 5);
var GOLD_GLOBAL_MULTIPLIER = formulaEngine$1.evalOrDefault("GOLD_GLOBAL_MULTIPLIER", 1);
formulaEngine$1.evalOrDefault("MIN_POKEMON_SELL_VALUE", 1e3);
/**
* Valor bruto de um POKE pela formula da planilha, SEM o piso de venda.
*
* Existe separado de `pokemonSellValue` porque o ouro por kill deriva do mesmo
* numero (`MONEY_FOR_KILL = sellValue / killDivisor`). Aplicar o piso de 1000
* aqui dentro nao subiria so o preco de venda: com o divisor atual (15) e os
* multiplicadores de kill, o ouro por abate saltaria de ~5 para ~330 na hunt
* inicial — 60x, sem ninguem ter pedido inflacao de farm. Piso e regra de
* VENDA; deixar os dois na mesma funcao juntaria duas decisoes de
* balanceamento que precisam poder andar separadas.
*/
function pokemonBaseValue(level, baseExp, rarityKey) {
	const base = formulaEngine$1.eval("POKEMON_SELL_VALUE", {
		level,
		baseExp,
		sellDivisor: POKEMON_SELL_DIVISOR
	});
	const multiplier = (rarityKey && RARITIES[rarityKey] || RARITIES.comum).sellMultiplier;
	return Math.max(1, Math.floor(base * multiplier));
}
function awardKillLoot(rng, gameState, enemy, mapDef) {
	const species = SPECIES[enemy.poke.speciesId];
	const sellValue = pokemonBaseValue(enemy.poke.level, species.baseExp, enemy.poke.rarity);
	const baseGold = Math.max(1, Math.floor(formulaEngine$1.eval("MONEY_FOR_KILL", {
		sellValue,
		killDivisor: KILL_MONEY_DIVISOR
	})));
	const gold = Math.max(1, Math.round(baseGold * KILL_GOLD_MULTIPLIER * GOLD_GLOBAL_MULTIPLIER));
	gameState.addGold(gold);
	const droppedItems = [];
	for (const drop of mapDef.itemDrops) if (rollChance(rng, drop.chance)) {
		gameState.addItem(drop.itemId, 1);
		droppedItems.push(drop.itemId);
	}
	if (rollChance(rng, STONE_DROP_CHANCE)) {
		const stoneId = stoneItemId(species.type);
		gameState.addItem(stoneId, 1);
		droppedItems.push(stoneId);
	}
	return {
		gold,
		droppedItems
	};
}
//#endregion
//#region src/engine/systems/farmRates.ts
function recordKill(gameState, { gold, xp, isShiny }) {
	gameState.incrementPerfStats({
		gold,
		xp,
		mobs: 1,
		shinys: isShiny ? 1 : 0
	});
}
function recordBatch(gameState, { gold, xp, mobs, shinys }) {
	gameState.incrementPerfStats({
		gold,
		xp,
		mobs,
		shinys
	});
}
//#endregion
//#region src/engine/systems/pokedexSystem.ts
function recordPokedexKill(gameState, speciesId, isShiny) {
	const entry = gameState.pokedexKills[speciesId] || {
		normal: 0,
		shiny: 0
	};
	const next = isShiny ? {
		...entry,
		shiny: entry.shiny + 1
	} : {
		...entry,
		normal: entry.normal + 1
	};
	gameState.setPokedexKillEntry(speciesId, next);
}
//#endregion
//#region node_modules/zustand/esm/vanilla.mjs
var createStoreImpl = (createState) => {
	let state;
	const listeners = /* @__PURE__ */ new Set();
	const setState = (partial, replace) => {
		const nextState = typeof partial === "function" ? partial(state) : partial;
		if (!Object.is(nextState, state)) {
			const previousState = state;
			state = (replace != null ? replace : typeof nextState !== "object" || nextState === null) ? nextState : Object.assign({}, state, nextState);
			listeners.forEach((listener) => listener(state, previousState));
		}
	};
	const getState = () => state;
	const getInitialState = () => initialState;
	const subscribe = (listener) => {
		listeners.add(listener);
		return () => listeners.delete(listener);
	};
	const api = {
		setState,
		getState,
		getInitialState,
		subscribe
	};
	const initialState = state = createState(setState, getState, api);
	return api;
};
var createStore = ((createState) => createState ? createStoreImpl(createState) : createStoreImpl);
//#endregion
//#region node_modules/react/cjs/react.production.js
/**
* @license React
* react.production.js
*
* Copyright (c) Meta Platforms, Inc. and affiliates.
*
* This source code is licensed under the MIT license found in the
* LICENSE file in the root directory of this source tree.
*/
var require_react_production = /* @__PURE__ */ __commonJSMin(((exports) => {
	var ReactNoopUpdateQueue = {
		isMounted: function() {
			return !1;
		},
		enqueueForceUpdate: function() {},
		enqueueReplaceState: function() {},
		enqueueSetState: function() {}
	};
	var assign = Object.assign;
	var emptyObject = {};
	function Component(props, context, updater) {
		this.props = props;
		this.context = context;
		this.refs = emptyObject;
		this.updater = updater || ReactNoopUpdateQueue;
	}
	Component.prototype.isReactComponent = {};
	Component.prototype.setState = function(partialState, callback) {
		if ("object" !== typeof partialState && "function" !== typeof partialState && null != partialState) throw Error("takes an object of state variables to update or a function which returns an object of state variables.");
		this.updater.enqueueSetState(this, partialState, callback, "setState");
	};
	Component.prototype.forceUpdate = function(callback) {
		this.updater.enqueueForceUpdate(this, callback, "forceUpdate");
	};
	function ComponentDummy() {}
	ComponentDummy.prototype = Component.prototype;
	function PureComponent(props, context, updater) {
		this.props = props;
		this.context = context;
		this.refs = emptyObject;
		this.updater = updater || ReactNoopUpdateQueue;
	}
	var pureComponentPrototype = PureComponent.prototype = new ComponentDummy();
	pureComponentPrototype.constructor = PureComponent;
	assign(pureComponentPrototype, Component.prototype);
	pureComponentPrototype.isPureReactComponent = !0;
	Array.isArray;
	var ReactSharedInternals = {
		H: null,
		A: null,
		T: null,
		S: null
	};
	exports.useCallback = function(callback, deps) {
		return ReactSharedInternals.H.useCallback(callback, deps);
	};
	exports.useDebugValue = function() {};
	exports.useSyncExternalStore = function(subscribe, getSnapshot, getServerSnapshot) {
		return ReactSharedInternals.H.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
	};
}));
//#endregion
//#region node_modules/zustand/esm/react.mjs
var import_react = /* @__PURE__ */ __toESM((/* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = require_react_production();
})))(), 1);
var identity = (arg) => arg;
function useStore(api, selector = identity) {
	const slice = import_react.useSyncExternalStore(api.subscribe, import_react.useCallback(() => selector(api.getState()), [api, selector]), import_react.useCallback(() => selector(api.getInitialState()), [api, selector]));
	import_react.useDebugValue(slice);
	return slice;
}
var createImpl = (createState) => {
	const api = createStore(createState);
	const useBoundStore = (selector) => useStore(api, selector);
	Object.assign(useBoundStore, api);
	return useBoundStore;
};
var create = ((createState) => createState ? createImpl(createState) : createImpl);
//#endregion
//#region node_modules/immer/dist/immer.mjs
var NOTHING = Symbol.for("immer-nothing");
var DRAFTABLE = Symbol.for("immer-draftable");
var DRAFT_STATE = Symbol.for("immer-state");
function die(error, ...args) {
	throw new Error(`[Immer] minified error nr: ${error}. Full error at: https://bit.ly/3cXEKWf`);
}
var O = Object;
var getPrototypeOf = O.getPrototypeOf;
var CONSTRUCTOR = "constructor";
var PROTOTYPE = "prototype";
var CONFIGURABLE = "configurable";
var ENUMERABLE = "enumerable";
var WRITABLE = "writable";
var VALUE = "value";
var isDraft = (value) => !!value && !!value[DRAFT_STATE];
function isDraftable(value) {
	if (!value) return false;
	return isPlainObject(value) || isArray(value) || !!value[DRAFTABLE] || !!value[CONSTRUCTOR]?.[DRAFTABLE] || isMap(value) || isSet(value);
}
var objectCtorString = O[PROTOTYPE][CONSTRUCTOR].toString();
var cachedCtorStrings = /* @__PURE__ */ new WeakMap();
function isPlainObject(value) {
	if (!value || !isObjectish(value)) return false;
	const proto = getPrototypeOf(value);
	if (proto === null || proto === O[PROTOTYPE]) return true;
	const Ctor = O.hasOwnProperty.call(proto, CONSTRUCTOR) && proto[CONSTRUCTOR];
	if (Ctor === Object) return true;
	if (!isFunction(Ctor)) return false;
	let ctorString = cachedCtorStrings.get(Ctor);
	if (ctorString === void 0) {
		ctorString = Function.toString.call(Ctor);
		cachedCtorStrings.set(Ctor, ctorString);
	}
	return ctorString === objectCtorString;
}
function each(obj, iter, strict = true) {
	if (getArchtype(obj) === 0) (strict ? Reflect.ownKeys(obj) : O.keys(obj)).forEach((key) => {
		iter(key, obj[key], obj);
	});
	else obj.forEach((entry, index) => iter(index, entry, obj));
}
function getArchtype(thing) {
	const state = thing[DRAFT_STATE];
	return state ? state.type_ : isArray(thing) ? 1 : isMap(thing) ? 2 : isSet(thing) ? 3 : 0;
}
var has = (thing, prop, type = getArchtype(thing)) => type === 2 ? thing.has(prop) : O[PROTOTYPE].hasOwnProperty.call(thing, prop);
var get = (thing, prop, type = getArchtype(thing)) => type === 2 ? thing.get(prop) : thing[prop];
var set = (thing, propOrOldValue, value, type = getArchtype(thing)) => {
	if (type === 2) thing.set(propOrOldValue, value);
	else if (type === 3) thing.add(value);
	else thing[propOrOldValue] = value;
};
function is(x, y) {
	if (x === y) return x !== 0 || 1 / x === 1 / y;
	else return x !== x && y !== y;
}
var isArray = Array.isArray;
var isMap = (target) => target instanceof Map;
var isSet = (target) => target instanceof Set;
var isObjectish = (target) => typeof target === "object";
var isFunction = (target) => typeof target === "function";
var isBoolean = (target) => typeof target === "boolean";
function isArrayIndex(value) {
	const n = +value;
	return Number.isInteger(n) && String(n) === value;
}
var latest = (state) => state.copy_ || state.base_;
var getFinalValue = (state) => state.modified_ ? state.copy_ : state.base_;
function shallowCopy(base, strict) {
	if (isMap(base)) return new Map(base);
	if (isSet(base)) return new Set(base);
	if (isArray(base)) return Array[PROTOTYPE].slice.call(base);
	const isPlain = isPlainObject(base);
	if (strict === true || strict === "class_only" && !isPlain) {
		const descriptors = O.getOwnPropertyDescriptors(base);
		delete descriptors[DRAFT_STATE];
		let keys = Reflect.ownKeys(descriptors);
		for (let i = 0; i < keys.length; i++) {
			const key = keys[i];
			const desc = descriptors[key];
			if (desc[WRITABLE] === false) {
				desc[WRITABLE] = true;
				desc[CONFIGURABLE] = true;
			}
			if (desc.get || desc.set) descriptors[key] = {
				[CONFIGURABLE]: true,
				[WRITABLE]: true,
				[ENUMERABLE]: desc[ENUMERABLE],
				[VALUE]: base[key]
			};
		}
		return O.create(getPrototypeOf(base), descriptors);
	} else {
		const proto = getPrototypeOf(base);
		if (proto !== null && isPlain) return { ...base };
		const obj = O.create(proto);
		return O.assign(obj, base);
	}
}
function freeze(obj, deep = false) {
	if (isFrozen(obj) || isDraft(obj) || !isDraftable(obj)) return obj;
	if (getArchtype(obj) > 1) O.defineProperties(obj, {
		set: dontMutateMethodOverride,
		add: dontMutateMethodOverride,
		clear: dontMutateMethodOverride,
		delete: dontMutateMethodOverride
	});
	O.freeze(obj);
	if (deep) each(obj, (_key, value) => {
		freeze(value, true);
	}, false);
	return obj;
}
function dontMutateFrozenCollections() {
	die(2);
}
var dontMutateMethodOverride = { [VALUE]: dontMutateFrozenCollections };
function isFrozen(obj) {
	if (obj === null || !isObjectish(obj)) return true;
	return O.isFrozen(obj);
}
var PluginMapSet = "MapSet";
var PluginPatches = "Patches";
var PluginArrayMethods = "ArrayMethods";
var plugins = {};
function getPlugin(pluginKey) {
	const plugin = plugins[pluginKey];
	if (!plugin) die(0, pluginKey);
	return plugin;
}
var isPluginLoaded = (pluginKey) => !!plugins[pluginKey];
var currentScope;
var getCurrentScope = () => currentScope;
var createScope = (parent_, immer_) => ({
	drafts_: [],
	parent_,
	immer_,
	canAutoFreeze_: true,
	unfinalizedDrafts_: 0,
	handledSet_: /* @__PURE__ */ new Set(),
	processedForPatches_: /* @__PURE__ */ new Set(),
	mapSetPlugin_: isPluginLoaded(PluginMapSet) ? getPlugin(PluginMapSet) : void 0,
	arrayMethodsPlugin_: isPluginLoaded(PluginArrayMethods) ? getPlugin(PluginArrayMethods) : void 0
});
function usePatchesInScope(scope, patchListener) {
	if (patchListener) {
		scope.patchPlugin_ = getPlugin(PluginPatches);
		scope.patches_ = [];
		scope.inversePatches_ = [];
		scope.patchListener_ = patchListener;
	}
}
function revokeScope(scope) {
	leaveScope(scope);
	scope.drafts_.forEach(revokeDraft);
	scope.drafts_ = null;
}
function leaveScope(scope) {
	if (scope === currentScope) currentScope = scope.parent_;
}
var enterScope = (immer2) => currentScope = createScope(currentScope, immer2);
function revokeDraft(draft) {
	const state = draft[DRAFT_STATE];
	if (state.type_ === 0 || state.type_ === 1) state.revoke_();
	else state.revoked_ = true;
}
function processResult(result, scope) {
	scope.unfinalizedDrafts_ = scope.drafts_.length;
	const baseDraft = scope.drafts_[0];
	if (result !== void 0 && result !== baseDraft) {
		if (baseDraft[DRAFT_STATE].modified_) {
			revokeScope(scope);
			die(4);
		}
		if (isDraftable(result)) result = finalize(scope, result);
		const { patchPlugin_ } = scope;
		if (patchPlugin_) patchPlugin_.generateReplacementPatches_(baseDraft[DRAFT_STATE].base_, result, scope);
	} else result = finalize(scope, baseDraft);
	maybeFreeze(scope, result, true);
	revokeScope(scope);
	if (scope.patches_) scope.patchListener_(scope.patches_, scope.inversePatches_);
	return result !== NOTHING ? result : void 0;
}
function finalize(rootScope, value) {
	if (isFrozen(value)) return value;
	const state = value[DRAFT_STATE];
	if (!state) return handleValue(value, rootScope.handledSet_, rootScope);
	if (!isSameScope(state, rootScope)) return value;
	if (!state.modified_) return state.base_;
	if (!state.finalized_) {
		const { callbacks_ } = state;
		if (callbacks_) while (callbacks_.length > 0) callbacks_.pop()(rootScope);
		generatePatchesAndFinalize(state, rootScope);
	}
	return state.copy_;
}
function maybeFreeze(scope, value, deep = false) {
	if (!scope.parent_ && scope.immer_.autoFreeze_ && scope.canAutoFreeze_) freeze(value, deep);
}
function markStateFinalized(state) {
	state.finalized_ = true;
	state.scope_.unfinalizedDrafts_--;
}
var isSameScope = (state, rootScope) => state.scope_ === rootScope;
var EMPTY_LOCATIONS_RESULT = [];
function updateDraftInParent(parent, draftValue, finalizedValue, originalKey) {
	const parentCopy = latest(parent);
	const parentType = parent.type_;
	if (originalKey !== void 0) {
		if (get(parentCopy, originalKey, parentType) === draftValue) {
			set(parentCopy, originalKey, finalizedValue, parentType);
			return;
		}
	}
	if (!parent.draftLocations_) {
		const draftLocations = parent.draftLocations_ = /* @__PURE__ */ new Map();
		each(parentCopy, (key, value) => {
			if (isDraft(value)) {
				const keys = draftLocations.get(value) || [];
				keys.push(key);
				draftLocations.set(value, keys);
			}
		});
	}
	const locations = parent.draftLocations_.get(draftValue) ?? EMPTY_LOCATIONS_RESULT;
	for (const location of locations) set(parentCopy, location, finalizedValue, parentType);
}
function registerChildFinalizationCallback(parent, child, key) {
	parent.callbacks_.push(function childCleanup(rootScope) {
		const state = child;
		if (!state || !isSameScope(state, rootScope)) return;
		rootScope.mapSetPlugin_?.fixSetContents(state);
		const finalizedValue = getFinalValue(state);
		updateDraftInParent(parent, state.draft_ ?? state, finalizedValue, key);
		generatePatchesAndFinalize(state, rootScope);
	});
}
function generatePatchesAndFinalize(state, rootScope) {
	if (state.modified_ && !state.finalized_ && (state.type_ === 3 || state.type_ === 1 && state.allIndicesReassigned_ || (state.assigned_?.size ?? 0) > 0)) {
		const { patchPlugin_ } = rootScope;
		if (patchPlugin_) {
			const basePath = patchPlugin_.getPath(state);
			if (basePath) patchPlugin_.generatePatches_(state, basePath, rootScope);
		}
		markStateFinalized(state);
	}
}
function handleCrossReference(target, key, value) {
	const { scope_ } = target;
	if (isDraft(value)) {
		const state = value[DRAFT_STATE];
		if (isSameScope(state, scope_)) state.callbacks_.push(function crossReferenceCleanup() {
			prepareCopy(target);
			updateDraftInParent(target, value, getFinalValue(state), key);
		});
	} else if (isDraftable(value)) target.callbacks_.push(function nestedDraftCleanup() {
		const targetCopy = latest(target);
		if (target.type_ === 3) {
			if (targetCopy.has(value)) handleValue(value, scope_.handledSet_, scope_);
		} else if (get(targetCopy, key, target.type_) === value) {
			if (scope_.drafts_.length > 1 && (target.assigned_.get(key) ?? false) === true && target.copy_) handleValue(get(target.copy_, key, target.type_), scope_.handledSet_, scope_);
		}
	});
}
function handleValue(target, handledSet, rootScope) {
	if (!rootScope.immer_.autoFreeze_ && rootScope.unfinalizedDrafts_ < 1) return target;
	if (isDraft(target) || handledSet.has(target) || !isDraftable(target) || isFrozen(target)) return target;
	handledSet.add(target);
	each(target, (key, value) => {
		if (isDraft(value)) {
			const state = value[DRAFT_STATE];
			if (isSameScope(state, rootScope)) {
				set(target, key, getFinalValue(state), target.type_);
				markStateFinalized(state);
			}
		} else if (isDraftable(value)) handleValue(value, handledSet, rootScope);
	});
	return target;
}
function createProxyProxy(base, parent) {
	const baseIsArray = isArray(base);
	const state = {
		type_: baseIsArray ? 1 : 0,
		scope_: parent ? parent.scope_ : getCurrentScope(),
		modified_: false,
		finalized_: false,
		assigned_: void 0,
		parent_: parent,
		base_: base,
		draft_: null,
		copy_: null,
		revoke_: null,
		isManual_: false,
		callbacks_: void 0
	};
	let target = state;
	let traps = objectTraps;
	if (baseIsArray) {
		target = [state];
		traps = arrayTraps;
	}
	const { revoke, proxy } = Proxy.revocable(target, traps);
	state.draft_ = proxy;
	state.revoke_ = revoke;
	return [proxy, state];
}
var objectTraps = {
	get(state, prop) {
		if (prop === DRAFT_STATE) return state;
		let arrayPlugin = state.scope_.arrayMethodsPlugin_;
		const isArrayWithStringProp = state.type_ === 1 && typeof prop === "string";
		if (isArrayWithStringProp) {
			if (arrayPlugin?.isArrayOperationMethod(prop)) return arrayPlugin.createMethodInterceptor(state, prop);
		}
		const source = latest(state);
		if (!has(source, prop, state.type_)) return readPropFromProto(state, source, prop);
		const value = source[prop];
		if (state.finalized_ || !isDraftable(value)) return value;
		if (isArrayWithStringProp && state.operationMethod && arrayPlugin?.isMutatingArrayMethod(state.operationMethod) && isArrayIndex(prop)) return value;
		if (value === peek(state.base_, prop) || isRelocatedBaseRef(state, prop, value)) {
			prepareCopy(state);
			const childKey = state.type_ === 1 ? +prop : prop;
			const childDraft = createProxy(state.scope_, value, state, childKey);
			return state.copy_[childKey] = childDraft;
		}
		return value;
	},
	has(state, prop) {
		return prop in latest(state);
	},
	ownKeys(state) {
		return Reflect.ownKeys(latest(state));
	},
	set(state, prop, value) {
		const desc = getDescriptorFromProto(latest(state), prop);
		if (desc?.set) {
			desc.set.call(state.draft_, value);
			return true;
		}
		if (!state.modified_) {
			const current2 = peek(latest(state), prop);
			const currentState = current2?.[DRAFT_STATE];
			if (currentState && currentState.base_ === value) {
				state.copy_[prop] = value;
				state.assigned_.set(prop, false);
				return true;
			}
			if (is(value, current2) && (value !== void 0 || has(state.base_, prop, state.type_))) return true;
			prepareCopy(state);
			markChanged(state);
		}
		if (state.copy_[prop] === value && (value !== void 0 || has(state.copy_, prop, state.type_)) || Number.isNaN(value) && Number.isNaN(state.copy_[prop])) return true;
		state.copy_[prop] = value;
		state.assigned_.set(prop, true);
		handleCrossReference(state, prop, value);
		return true;
	},
	deleteProperty(state, prop) {
		prepareCopy(state);
		if (peek(state.base_, prop) !== void 0 || prop in state.base_) {
			state.assigned_.set(prop, false);
			markChanged(state);
		} else state.assigned_.delete(prop);
		if (state.copy_) delete state.copy_[prop];
		return true;
	},
	getOwnPropertyDescriptor(state, prop) {
		const owner = latest(state);
		const desc = Reflect.getOwnPropertyDescriptor(owner, prop);
		if (!desc) return desc;
		return {
			[WRITABLE]: true,
			[CONFIGURABLE]: state.type_ !== 1 || prop !== "length",
			[ENUMERABLE]: desc[ENUMERABLE],
			[VALUE]: owner[prop]
		};
	},
	defineProperty() {
		die(11);
	},
	getPrototypeOf(state) {
		return getPrototypeOf(state.base_);
	},
	setPrototypeOf() {
		die(12);
	}
};
var arrayTraps = {};
for (let key in objectTraps) {
	let fn = objectTraps[key];
	arrayTraps[key] = function() {
		const args = arguments;
		args[0] = args[0][0];
		return fn.apply(this, args);
	};
}
arrayTraps.deleteProperty = function(state, prop) {
	return arrayTraps.set.call(this, state, prop, void 0);
};
arrayTraps.set = function(state, prop, value) {
	return objectTraps.set.call(this, state[0], prop, value, state[0]);
};
function peek(draft, prop) {
	const state = draft[DRAFT_STATE];
	return (state ? latest(state) : draft)[prop];
}
function isRelocatedBaseRef(state, prop, value) {
	if (state.type_ !== 1 || !state.allIndicesReassigned_ || state.assigned_?.get(prop) || !isDraftable(value) || value[DRAFT_STATE]) return false;
	return state.baseRefs_.has(value);
}
function readPropFromProto(state, source, prop) {
	const desc = getDescriptorFromProto(source, prop);
	return desc ? VALUE in desc ? desc[VALUE] : desc.get?.call(state.draft_) : void 0;
}
function getDescriptorFromProto(source, prop) {
	if (!(prop in source)) return void 0;
	let proto = getPrototypeOf(source);
	while (proto) {
		const desc = Object.getOwnPropertyDescriptor(proto, prop);
		if (desc) return desc;
		proto = getPrototypeOf(proto);
	}
}
function markChanged(state) {
	if (!state.modified_) {
		state.modified_ = true;
		if (state.parent_) markChanged(state.parent_);
	}
}
function prepareCopy(state) {
	if (!state.copy_) {
		state.assigned_ = /* @__PURE__ */ new Map();
		state.copy_ = shallowCopy(state.base_, state.scope_.immer_.useStrictShallowCopy_);
	}
}
var Immer2 = class {
	constructor(config) {
		this.autoFreeze_ = true;
		this.useStrictShallowCopy_ = false;
		this.useStrictIteration_ = false;
		/**
		* The `produce` function takes a value and a "recipe function" (whose
		* return value often depends on the base state). The recipe function is
		* free to mutate its first argument however it wants. All mutations are
		* only ever applied to a __copy__ of the base state.
		*
		* Pass only a function to create a "curried producer" which relieves you
		* from passing the recipe function every time.
		*
		* Only plain objects and arrays are made mutable. All other objects are
		* considered uncopyable.
		*
		* Note: This function is __bound__ to its `Immer` instance.
		*
		* @param {any} base - the initial state
		* @param {Function} recipe - function that receives a proxy of the base state as first argument and which can be freely modified
		* @param {Function} patchListener - optional function that will be called with all the patches produced here
		* @returns {any} a new state, or the initial state if nothing was modified
		*/
		this.produce = (base, recipe, patchListener) => {
			if (isFunction(base) && !isFunction(recipe)) {
				const defaultBase = recipe;
				recipe = base;
				const self = this;
				return function curriedProduce(base2 = defaultBase, ...args) {
					return self.produce(base2, (draft) => recipe.call(this, draft, ...args));
				};
			}
			if (!isFunction(recipe)) die(6);
			if (patchListener !== void 0 && !isFunction(patchListener)) die(7);
			let result;
			if (isDraftable(base)) {
				const scope = enterScope(this);
				const proxy = createProxy(scope, base, void 0);
				let hasError = true;
				try {
					result = recipe(proxy);
					hasError = false;
				} finally {
					if (hasError) revokeScope(scope);
					else leaveScope(scope);
				}
				usePatchesInScope(scope, patchListener);
				return processResult(result, scope);
			} else if (!base || !isObjectish(base)) {
				result = recipe(base);
				if (result === void 0) result = base;
				if (result === NOTHING) result = void 0;
				if (this.autoFreeze_) freeze(result, true);
				if (patchListener) {
					const p = [];
					const ip = [];
					getPlugin(PluginPatches).generateReplacementPatches_(base, result, {
						patches_: p,
						inversePatches_: ip
					});
					patchListener(p, ip);
				}
				return result;
			} else die(1, base);
		};
		this.produceWithPatches = (base, recipe) => {
			if (isFunction(base)) return (state, ...args) => this.produceWithPatches(state, (draft) => base(draft, ...args));
			let patches, inversePatches;
			return [
				this.produce(base, recipe, (p, ip) => {
					patches = p;
					inversePatches = ip;
				}),
				patches,
				inversePatches
			];
		};
		if (isBoolean(config?.autoFreeze)) this.setAutoFreeze(config.autoFreeze);
		if (isBoolean(config?.useStrictShallowCopy)) this.setUseStrictShallowCopy(config.useStrictShallowCopy);
		if (isBoolean(config?.useStrictIteration)) this.setUseStrictIteration(config.useStrictIteration);
	}
	createDraft(base) {
		if (!isDraftable(base)) die(8);
		if (isDraft(base)) base = current(base);
		const scope = enterScope(this);
		const proxy = createProxy(scope, base, void 0);
		proxy[DRAFT_STATE].isManual_ = true;
		leaveScope(scope);
		return proxy;
	}
	finishDraft(draft, patchListener) {
		const state = draft && draft[DRAFT_STATE];
		if (!state || !state.isManual_) die(9);
		const { scope_: scope } = state;
		usePatchesInScope(scope, patchListener);
		return processResult(void 0, scope);
	}
	/**
	* Pass true to automatically freeze all copies created by Immer.
	*
	* By default, auto-freezing is enabled.
	*/
	setAutoFreeze(value) {
		this.autoFreeze_ = value;
	}
	/**
	* Pass true to enable strict shallow copy.
	*
	* By default, immer does not copy the object descriptors such as getter, setter and non-enumrable properties.
	*/
	setUseStrictShallowCopy(value) {
		this.useStrictShallowCopy_ = value;
	}
	/**
	* Pass false to use faster iteration that skips non-enumerable properties
	* but still handles symbols for compatibility.
	*
	* By default, strict iteration is enabled (includes all own properties).
	*/
	setUseStrictIteration(value) {
		this.useStrictIteration_ = value;
	}
	shouldUseStrictIteration() {
		return this.useStrictIteration_;
	}
	applyPatches(base, patches) {
		let i;
		for (i = patches.length - 1; i >= 0; i--) {
			const patch = patches[i];
			if (patch.path.length === 0 && patch.op === "replace") {
				base = patch.value;
				break;
			}
		}
		if (i > -1) patches = patches.slice(i + 1);
		const applyPatchesImpl = getPlugin(PluginPatches).applyPatches_;
		if (isDraft(base)) return applyPatchesImpl(base, patches);
		return this.produce(base, (draft) => applyPatchesImpl(draft, patches));
	}
};
function createProxy(rootScope, value, parent, key) {
	const [draft, state] = isMap(value) ? getPlugin(PluginMapSet).proxyMap_(value, parent) : isSet(value) ? getPlugin(PluginMapSet).proxySet_(value, parent) : createProxyProxy(value, parent);
	(parent?.scope_ ?? getCurrentScope()).drafts_.push(draft);
	state.callbacks_ = parent?.callbacks_ ?? [];
	state.key_ = key;
	if (parent && key !== void 0) registerChildFinalizationCallback(parent, state, key);
	else state.callbacks_.push(function rootDraftCleanup(rootScope2) {
		rootScope2.mapSetPlugin_?.fixSetContents(state);
		const { patchPlugin_ } = rootScope2;
		if (state.modified_ && patchPlugin_) patchPlugin_.generatePatches_(state, [], rootScope2);
	});
	return draft;
}
function current(value) {
	if (!isDraft(value)) die(10, value);
	return currentImpl(value);
}
function currentImpl(value) {
	if (!isDraftable(value) || isFrozen(value)) return value;
	const state = value[DRAFT_STATE];
	let copy;
	let strict = true;
	if (state) {
		if (!state.modified_) return state.base_;
		state.finalized_ = true;
		copy = shallowCopy(value, state.scope_.immer_.useStrictShallowCopy_);
		strict = state.scope_.immer_.shouldUseStrictIteration();
	} else copy = shallowCopy(value, true);
	each(copy, (key, childValue) => {
		set(copy, key, currentImpl(childValue));
	}, strict);
	if (state) state.finalized_ = false;
	return copy;
}
var produce = new Immer2().produce;
//#endregion
//#region node_modules/zustand/esm/middleware/immer.mjs
var immerImpl = (initializer) => (set, get, store) => {
	store.setState = (updater, replace, ...args) => {
		return set(typeof updater === "function" ? produce(updater) : updater, replace, ...args);
	};
	return initializer(store.setState, get, store);
};
var immer = immerImpl;
//#endregion
//#region src/stores/worldStore.ts
function emptyWorldState(seed = randomSeed()) {
	return {
		mapDef: null,
		player: null,
		enemies: [],
		effects: [],
		pendingHits: [],
		autoTimers: {
			pot: 0,
			revive: 0
		},
		reviveCountdown: null,
		respawnTimer: null,
		sequenceIndex: 0,
		sequenceCleared: false,
		countdownRemaining: null,
		rng: createRng(seed),
		counters: {
			entity: 1,
			effect: 1,
			pendingHit: 1
		},
		pessimista: false
	};
}
create()(immer((set) => ({
	...emptyWorldState(),
	setWorld: (world) => set((draft) => {
		Object.assign(draft, world);
	}),
	resetWorld: () => set((draft) => {
		Object.assign(draft, emptyWorldState());
	}),
	update: (recipe) => set((draft) => recipe(draft)),
	sortear: (fn) => {
		let resultado;
		set((draft) => {
			resultado = fn(draft.rng);
		});
		return resultado;
	}
})));
//#endregion
//#region src/stores/toastStore.ts
var CHANNEL_TO_TAB = {
	combat: "log",
	trade: "trade",
	world: "sistema"
};
var MAX_CHAT_LINES = 60;
var nextId = 1;
function makeId() {
	return `toast-${nextId++}`;
}
var useToastStore = create((set) => ({
	toasts: [],
	chatLines: {
		sistema: [],
		trade: [],
		log: []
	},
	pushToast: (message, type, channel, realce) => {
		const tab = CHANNEL_TO_TAB[channel] || "sistema";
		const line = {
			id: makeId(),
			message,
			type,
			realce
		};
		set((state) => {
			const nextTabLines = [...state.chatLines[tab], line];
			if (nextTabLines.length > MAX_CHAT_LINES) nextTabLines.shift();
			const chatLines = {
				...state.chatLines,
				[tab]: nextTabLines
			};
			if (channel === "combat") return { chatLines };
			const toastEntry = {
				id: line.id,
				message,
				type,
				realce
			};
			return {
				chatLines,
				toasts: [...state.toasts, toastEntry]
			};
		});
	},
	dismissToast: (id) => {
		set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
	}
}));
var formulaEngine = createFormulaEngine(FORMULAS);
formulaEngine.evalOrDefault("OFFLINE_FARM_MAX_HOURS", 6);
var OFFLINE_SIM_STEP_SECONDS = formulaEngine.evalOrDefault("OFFLINE_SIM_STEP_SECONDS", .1);
function shinyPrefix(isShiny) {
	return isShiny ? "✨ " : "";
}
function novoMundo(carry) {
	const base = emptyWorldState();
	if (carry) {
		base.rng = { ...carry.rng };
		base.counters = { ...carry.counters };
	}
	return base;
}
var SPAWN_MIN_DISTANCE = 250;
var SPAWN_MARGIN = 60;
var SPAWN_POINT_MAX_ATTEMPTS = 40;
function randomSpawnPoint(rng, mapDef) {
	const cx = mapDef.bounds.width / 2;
	const cy = mapDef.bounds.height / 2;
	const radius = mapWalkRadius(mapDef) - SPAWN_MARGIN;
	let x = cx, y = cy;
	let attempts = 0;
	do {
		const angle = randRange(rng, 0, Math.PI * 2);
		const dist = Math.sqrt(randRange(rng, 0, 1)) * radius;
		x = cx + Math.cos(angle) * dist;
		y = cy + Math.sin(angle) * dist;
		attempts++;
	} while (attempts < SPAWN_POINT_MAX_ATTEMPTS && (Math.hypot(x - mapDef.playerSpawn.x, y - mapDef.playerSpawn.y) < SPAWN_MIN_DISTANCE || isCellBlocked(mapDef, x, y)));
	return {
		x,
		y
	};
}
function spawnEnemyAt(world, mapDef) {
	const { rng, counters } = world;
	const point = randomSpawnPoint(rng, mapDef);
	const encounterId = weightedPick(rng, mapDef.enemyPool, (id) => getEncounter(id)?.weight ?? 45);
	const encounter = getEncounter(encounterId);
	if (!encounter) throw new Error(`Encontro desconhecido: ${encounterId}`);
	const level = encounter.levelWeights?.length ? weightedPick(rng, encounter.levelWeights, (entry) => entry.weight).level : randInt(rng, encounter.minLevel, encounter.maxLevel);
	return createEnemyEntity(counters, {
		poke: createPokeInstance(rng, encounter.speciesId, level),
		x: point.x,
		y: point.y,
		encounterId
	});
}
var SEQUENCE_SPAWN_OFFSET_MIN = 60;
var SEQUENCE_SPAWN_OFFSET_MAX = 150;
function sequenceSpawnPoint(rng, mapDef, base) {
	const mapCx = mapDef.bounds.width / 2;
	const mapCy = mapDef.bounds.height / 2;
	const radius = mapWalkRadius(mapDef);
	let x = base.x, y = base.y, attempts = 0;
	do {
		const angle = randRange(rng, 0, Math.PI * 2);
		const dist = randRange(rng, SEQUENCE_SPAWN_OFFSET_MIN, SEQUENCE_SPAWN_OFFSET_MAX);
		x = base.x + Math.cos(angle) * dist;
		y = base.y + Math.sin(angle) * dist;
		attempts++;
	} while (attempts < SPAWN_POINT_MAX_ATTEMPTS && (Math.hypot(x - mapCx, y - mapCy) > radius || isCellBlocked(mapDef, x, y)));
	return {
		x,
		y
	};
}
function spawnSequenceEnemy(world, mapDef, index) {
	const { rng, counters } = world;
	const encounterId = mapDef.sequence[index];
	const encounter = getEncounter(encounterId);
	if (!encounter) throw new Error(`Encontro desconhecido: ${encounterId}`);
	const base = mapDef.spawnPoints[0] || mapDef.playerSpawn;
	const point = index === 0 ? base : sequenceSpawnPoint(rng, mapDef, base);
	return createEnemyEntity(counters, {
		poke: createPokeInstance(rng, encounter.speciesId, encounter.minLevel, {
			rarity: encounter.rarity,
			ivs: encounter.ivs
		}),
		x: point.x,
		y: point.y,
		encounterId
	});
}
function buildMapWorld(mapId, activePoke, carry) {
	const mapDef = getMap(mapId);
	if (!mapDef) throw new Error(`Mapa desconhecido: ${mapId}`);
	const base = novoMundo(carry);
	const player = createPlayerEntity(base.counters, {
		poke: activePoke,
		x: mapDef.playerSpawn.x,
		y: mapDef.playerSpawn.y
	});
	if (isDead(player)) player.fainted = true;
	const enemies = [];
	if (!mapDef.startCountdown) {
		if (mapDef.sequence) enemies.push(spawnSequenceEnemy(base, mapDef, 0));
		else for (let i = 0; i < mapDef.maxEnemies; i++) enemies.push(spawnEnemyAt(base, mapDef));
	}
	return {
		...base,
		mapDef,
		player,
		enemies,
		effects: [],
		pendingHits: [],
		autoTimers: {
			pot: 0,
			revive: 0
		},
		reviveCountdown: null,
		respawnTimer: mapDef.respawnDelay,
		sequenceIndex: 0,
		sequenceCleared: false,
		countdownRemaining: mapDef.startCountdown || null
	};
}
function handleEnemyDefeated(world, enemy, gameState, opts = {}) {
	const silent = opts.silent ?? false;
	const player = world.player;
	const poke = player.poke;
	const enemySpecies = SPECIES[enemy.poke.speciesId];
	const expGain = expRewardForEnemy(enemy.poke);
	const grantResult = grantExp(poke, expGain);
	player.poke = grantResult.poke;
	gameState.updatePokeInstance(grantResult.poke.uid, () => grantResult.poke);
	const trainerResult = grantTrainerExp(gameState.trainer, expGain);
	gameState.setTrainer(trainerResult.trainer);
	const loot = awardKillLoot(world.rng, gameState, enemy, world.mapDef);
	const captureResult = world.mapDef.noCatch ? null : maybeAutoCatch(world.rng, gameState, enemy.poke);
	recordPokedexKill(gameState, enemy.poke.speciesId, Boolean(enemy.poke.isShiny));
	if (!silent) {
		recordKill(gameState, {
			gold: loot.gold,
			xp: expGain,
			isShiny: enemy.poke.isShiny
		});
		world.effects.push(createWorldEffect(world.counters, {
			type: "rewardText",
			x: enemy.x,
			y: enemy.y,
			targetX: enemy.x,
			targetY: enemy.y,
			value: expGain,
			unit: "XP",
			color: "#4ade80",
			duration: 1.1,
			owner: enemy
		}));
		world.effects.push(createWorldEffect(world.counters, {
			type: "rewardText",
			x: enemy.x,
			y: enemy.y,
			targetX: enemy.x,
			targetY: enemy.y,
			value: loot.gold,
			unit: "🪙",
			color: "#fff59d",
			duration: 1.1,
			owner: enemy
		}));
		useToastStore.getState().pushToast(`${shinyPrefix(enemy.poke.isShiny)}${enemySpecies.name} [${rarityOf(enemy.poke).label}] derrotado! +${expGain} EXP, +${loot.gold} ouro`, "gold", "combat", realceDaRaridade(enemy.poke));
		if (grantResult.leveledUp) {
			const ganhos = formatStatGains(grantResult.statGains);
			useToastStore.getState().pushToast(`${shinyPrefix(grantResult.poke.isShiny)}${SPECIES[grantResult.poke.speciesId].name} subiu para o nivel ${grantResult.level}!${ganhos ? ` ${ganhos}` : ""}`, "levelup", "combat");
			for (const ability of grantResult.newAbilities.filter(isDamagingAbility)) useToastStore.getState().pushToast(`Nova habilidade desbloqueada: ${ability.name}!`, "levelup", "combat");
		}
		if (trainerResult.leveledUp) useToastStore.getState().pushToast(`${gameState.trainer.name} subiu para o nivel ${trainerResult.level}!`, "levelup", "combat");
		for (const itemId of loot.droppedItems) {
			const item = getItem(itemId);
			if (item) useToastStore.getState().pushToast(`Item encontrado: ${item.name}`, "success", "world");
		}
		if (captureResult && "ballItemId" in captureResult && captureResult.ballItemId) {
			const rowCount = captureAnimRowCount(captureResult.success);
			world.effects.push(createWorldEffect(world.counters, {
				type: "captureAnim",
				x: enemy.x,
				y: enemy.y,
				targetX: enemy.x,
				targetY: enemy.y,
				ballItemId: captureResult.ballItemId,
				success: captureResult.success,
				delay: 4,
				duration: rowCount * CAPTURE_ANIM_FRAME_DURATION + .3
			}));
		}
		if (captureResult) {
			if (captureResult.success) {
				const location = captureResult.location === "bag" ? "mochila" : captureResult.location;
				const raridade = rarityOf(captureResult.poke).label;
				useToastStore.getState().pushToast(`${shinyPrefix(enemy.poke.isShiny)}${enemySpecies.name} [${raridade}] capturado! Foi para a ${location}.`, "capture-success", "world", realceDaRaridade(captureResult.poke));
			} else if (captureResult.reason === "roll_failed") useToastStore.getState().pushToast("A captura falhou!", "capture-fail", "combat");
		}
	}
	return {
		gold: loot.gold,
		xp: expGain,
		leveledUp: grantResult.leveledUp,
		trainerLeveledUp: trainerResult.leveledUp,
		isShiny: Boolean(enemy.poke.isShiny),
		captured: Boolean(captureResult && captureResult.success),
		capturedPoke: captureResult && captureResult.success ? captureResult.poke : null,
		droppedItems: loot.droppedItems
	};
}
function stepWorld(world, dt, gameState, opts = {}) {
	const silent = opts.silent ?? false;
	if (!world.player) return [];
	if (!world.mapDef) {
		if (!silent) updateAnimations(world, dt);
		return [];
	}
	if (world.countdownRemaining != null) {
		world.countdownRemaining -= dt;
		if (world.countdownRemaining <= 0) {
			world.countdownRemaining = null;
			if (world.mapDef.sequence) world.enemies.push(spawnSequenceEnemy(world, world.mapDef, world.sequenceIndex));
			else for (let i = 0; i < world.mapDef.maxEnemies; i++) world.enemies.push(spawnEnemyAt(world, world.mapDef));
		}
		if (!silent) updateAnimations(world, dt);
		return [];
	}
	updateMovement(world, dt);
	const { defeatedEnemyIds, playerJustFainted } = updateCombat(world, dt, { silent });
	tickAttackAnimTimers(world, dt);
	if (!silent) updateAnimations(world, dt);
	const kills = [];
	if (defeatedEnemyIds.length > 0) for (const enemyId of defeatedEnemyIds) {
		const enemy = world.enemies.find((e) => e.id === enemyId);
		if (!enemy) continue;
		kills.push(handleEnemyDefeated(world, enemy, gameState, { silent }));
		enemy.deathRemovalTimer = silent ? 0 : 4;
	}
	for (const enemy of world.enemies) if (isDead(enemy) && enemy.deathRemovalTimer != null && enemy.deathRemovalTimer > 0) enemy.deathRemovalTimer -= dt;
	world.enemies = world.enemies.filter((e) => !isDead(e) || (e.deathRemovalTimer ?? 0) > 0 || world.mapDef.keepCorpses);
	if (playerJustFainted && world.player) {
		const penaltyResult = applyDeathExpPenalty(world.player.poke);
		world.player.poke = penaltyResult.poke;
		gameState.updatePokeInstance(penaltyResult.poke.uid, () => penaltyResult.poke);
		if (!silent) useToastStore.getState().pushToast(`${SPECIES[world.player.poke.speciesId].name} desmaiou!${penaltyResult.leveledDown ? ` Caiu para o nivel ${penaltyResult.level}.` : ""}`, "error", "combat");
		if (world.mapDef.autoSwitchTeamOnFaint) {
			const nextIndex = gameState.team.findIndex((p) => p.hp > 0);
			if (nextIndex !== -1) {
				gameState.setActiveIndex(nextIndex);
				const nextPoke = gameState.team[nextIndex];
				world.player.poke = nextPoke;
				world.player.cooldowns = {};
				world.player.flashTimer = 0;
				world.player.fainted = false;
				world.player.state = "wander";
				world.player.targetId = null;
				if (!silent) useToastStore.getState().pushToast(`${shinyPrefix(nextPoke.isShiny)}${SPECIES[nextPoke.speciesId].name} entrou em campo!`, "success", "combat");
			}
		}
	}
	const autoEvents = updateAutoHeal(world, gameState, dt);
	if (!silent) for (const ev of autoEvents) {
		if (ev.type === "auto_pot") {
			const item = getItem(ev.itemId);
			if (item) useToastStore.getState().pushToast(`Auto-pot usou ${item.name}.`, "success", "combat");
		}
		if (ev.type === "auto_revive") useToastStore.getState().pushToast("Auto-revive reanimou seu POKE!", "success", "combat");
	}
	const aliveCount = world.enemies.filter((e) => !isDead(e)).length;
	if (world.mapDef.sequence && world.mapDef.unlocksContinentOnClear && !world.sequenceCleared && aliveCount === 0 && world.sequenceIndex === world.mapDef.sequence.length - 1) {
		world.sequenceCleared = true;
		const continent = world.mapDef.unlocksContinentOnClear;
		const wasLocked = !gameState.isContinentUnlocked(continent);
		gameState.unlockContinent(continent);
		if (!silent && wasLocked) useToastStore.getState().pushToast("Voce derrotou o Campeao Lance! O Novo Continente foi desbloqueado.", "success", "world");
	}
	if (aliveCount < world.mapDef.maxEnemies && !world.mapDef.noRespawn) {
		world.respawnTimer = (world.respawnTimer ?? 0) - dt;
		if (world.respawnTimer <= 0) {
			world.enemies.push(spawnEnemyAt(world, world.mapDef));
			world.respawnTimer = world.mapDef.respawnDelay;
		}
	} else if (world.mapDef.sequence && aliveCount === 0 && world.sequenceIndex < world.mapDef.sequence.length - 1) {
		world.respawnTimer = (world.respawnTimer ?? 0) - dt;
		if (world.respawnTimer <= 0) {
			world.sequenceIndex += 1;
			world.enemies.push(spawnSequenceEnemy(world, world.mapDef, world.sequenceIndex));
			world.respawnTimer = world.mapDef.respawnDelay;
		}
	}
	return kills;
}
//#endregion
//#region src/engine/systems/offlineSimSystem.ts
var DEFAULT_MAX_STEPS = 25e4;
var DEFAULT_MAX_WALL_CLOCK_MS = 2500;
var CLOCK_CHECK_EVERY = 512;
var COARSEN_FACTOR = 4;
var MAX_COARSEN_ROUNDS = 3;
function nowMs() {
	return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
}
function createEmptySummary() {
	return {
		requestedSeconds: 0,
		simulatedSeconds: 0,
		kills: 0,
		gold: 0,
		xp: 0,
		captures: [],
		shinySeen: 0,
		shinyCaptured: 0,
		itemsGained: {},
		itemsConsumed: {},
		pokeLeveledUp: false,
		trainerLeveledUp: false,
		pokeLevelsGained: 0,
		trainerLevelsGained: 0,
		pokeLevelBefore: 0,
		pokeLevelAfter: 0,
		trainerLevelBefore: 0,
		trainerLevelAfter: 0,
		stoppedEarly: false,
		truncated: false,
		stepSeconds: 0
	};
}
function simulateWorldSeconds({ world, gameState, seconds, stepSeconds, stepFn, maxSteps = DEFAULT_MAX_STEPS, maxWallClockMs = DEFAULT_MAX_WALL_CLOCK_MS }) {
	const summary = createEmptySummary();
	summary.requestedSeconds = seconds;
	if (!Number.isFinite(seconds) || seconds <= 0 || !world.player) return summary;
	const itemsBefore = { ...gameState.items };
	const isBossHunt = Boolean(world.mapDef && world.mapDef.noRespawn);
	summary.pokeLevelBefore = world.player.poke.level;
	summary.trainerLevelBefore = gameState.trainer.level;
	let step = Math.max(Math.max(.01, stepSeconds), seconds / Math.max(1, maxSteps));
	let deadline = nowMs() + maxWallClockMs;
	let coarsenRounds = 0;
	let sinceClockCheck = 0;
	let remaining = seconds;
	while (remaining > 0) {
		const dt = Math.min(step, remaining);
		remaining -= dt;
		const kills = stepFn(world, dt, { silent: true }) || [];
		for (const result of kills) {
			summary.kills += 1;
			summary.gold += result.gold;
			summary.xp += result.xp;
			if (result.leveledUp) summary.pokeLeveledUp = true;
			if (result.trainerLeveledUp) summary.trainerLeveledUp = true;
			if (result.isShiny) summary.shinySeen += 1;
			if (result.captured && result.capturedPoke) {
				summary.captures.push({
					speciesId: result.capturedPoke.speciesId,
					level: result.capturedPoke.level,
					isShiny: Boolean(result.capturedPoke.isShiny),
					rarity: result.capturedPoke.rarity
				});
				if (result.capturedPoke.isShiny) summary.shinyCaptured += 1;
			}
		}
		if (world.player.fainted) {
			if (!(!isBossHunt && gameState.autoToggles.autoRevive && gameState.hasItem("revive", 1))) {
				summary.stoppedEarly = true;
				break;
			}
		}
		sinceClockCheck += 1;
		if (sinceClockCheck >= CLOCK_CHECK_EVERY) {
			sinceClockCheck = 0;
			if (nowMs() >= deadline) {
				if (coarsenRounds < MAX_COARSEN_ROUNDS && remaining > step) {
					coarsenRounds += 1;
					step *= COARSEN_FACTOR;
					deadline = nowMs() + maxWallClockMs / 2;
				} else {
					summary.truncated = true;
					break;
				}
			}
		}
	}
	summary.stepSeconds = step;
	summary.simulatedSeconds = seconds - Math.max(0, remaining);
	summary.pokeLevelAfter = world.player.poke.level;
	summary.trainerLevelAfter = gameState.trainer.level;
	summary.pokeLevelsGained = Math.max(0, summary.pokeLevelAfter - summary.pokeLevelBefore);
	summary.trainerLevelsGained = Math.max(0, summary.trainerLevelAfter - summary.trainerLevelBefore);
	const itemIds = /* @__PURE__ */ new Set([...Object.keys(itemsBefore), ...Object.keys(gameState.items)]);
	for (const itemId of itemIds) {
		const delta = (gameState.items[itemId] || 0) - (itemsBefore[itemId] || 0);
		if (delta > 0) summary.itemsGained[itemId] = delta;
		else if (delta < 0) summary.itemsConsumed[itemId] = -delta;
	}
	return summary;
}
//#endregion
//#region src/stores/gameStateDefaults.ts
var STARTING_ITEMS = {
	poke_ball: 500,
	potion: 500,
	revive: 50
};
var DEFAULT_AUTO_POT_RULES = [{
	hpPercent: 70,
	itemId: "potion"
}];
var DEFAULT_AUTO_CATCH_CONFIG = {
	ballId: "poke_ball",
	catchShinyEnabled: true,
	shinyBallId: "great_ball"
};
function defaultUnlockedMaps() {
	return Object.values(MAPS).filter((map) => !map.unlockCost).map((map) => map.id);
}
function defaultGameStateData() {
	return {
		team: [],
		activeIndex: 0,
		bagPokes: [],
		items: { ...STARTING_ITEMS },
		lockedItems: {},
		wallet: {
			gold: 1e3,
			diamonds: 0
		},
		unlockedMaps: defaultUnlockedMaps(),
		currentMapId: null,
		autoToggles: {
			autoPot: true,
			autoCatch: false,
			autoRevive: false
		},
		autoPotRules: DEFAULT_AUTO_POT_RULES.map((r) => ({ ...r })),
		autoCatchConfig: { ...DEFAULT_AUTO_CATCH_CONFIG },
		autoCatchRules: [],
		perfStats: {
			gold: 0,
			xp: 0,
			mobs: 0,
			shinys: 0,
			since: Date.now()
		},
		trainer: {
			name: "Treinador",
			level: 1,
			exp: 0
		},
		pokedexKills: {},
		unlockedContinents: ["johto", "nightmare"]
	};
}
//#endregion
//#region src/data/remote/playerMapper.ts
function fromJson(value, fallback) {
	if (value == null || typeof value !== "object") return fallback;
	return value;
}
function toJson(value) {
	return value;
}
function rowToPoke(row) {
	const ivs = {
		hp: row.iv_hp,
		atkFis: row.iv_atk_fis,
		atkEsp: row.iv_atk_esp,
		def: row.iv_def,
		defEsp: row.iv_def_esp,
		speed: row.iv_speed
	};
	const gravados = {
		hp: row.stat_hp,
		atkFis: row.stat_atk_fis,
		atkEsp: row.stat_atk_esp,
		def: row.stat_def,
		defEsp: row.stat_def_esp,
		speed: row.stat_speed
	};
	const species = SPECIES[row.species_id];
	const stats = species ? computeStatsAtLevel(species, row.level, ivs, row.rarity, row.is_shiny) : gravados;
	return {
		uid: row.id,
		speciesId: row.species_id,
		level: row.level,
		exp: row.exp,
		hp: Math.min(row.hp, stats.hp),
		isShiny: row.is_shiny,
		rarity: row.rarity,
		ivs,
		stats,
		unlockedAbilities: row.unlocked_abilities,
		disabledAbilities: row.disabled_abilities ?? {},
		locked: row.locked,
		capturedAt: row.created_at,
		originalTrainer: row.original_trainer ?? void 0
	};
}
function snapshotToGameState(snap, defaults) {
	const p = snap.player;
	const team = snap.pokemon.filter((r) => r.location === "team").sort((a, b) => (a.team_slot ?? 0) - (b.team_slot ?? 0)).map(rowToPoke);
	const bagPokes = snap.pokemon.filter((r) => r.location === "bag").map(rowToPoke);
	const items = {};
	const lockedItems = {};
	for (const row of snap.items) {
		if (row.quantity > 0) items[row.item_id] = row.quantity;
		if (row.locked) lockedItems[row.item_id] = true;
	}
	const pokedexKills = {};
	for (const row of snap.pokedex) pokedexKills[row.species_id] = {
		normal: row.normal_kills,
		shiny: row.shiny_kills
	};
	const autoCatchRules = snap.autoCatchRules.map((r) => ({
		speciesId: r.species_id,
		ballItemId: r.ball_item_id
	}));
	return {
		team,
		bagPokes,
		activeIndex: Math.max(0, Math.min(p.active_team_index, Math.max(0, team.length - 1))),
		items,
		lockedItems,
		wallet: {
			gold: p.gold,
			diamonds: p.diamonds
		},
		unlockedMaps: p.unlocked_maps,
		unlockedContinents: p.unlocked_continents,
		currentMapId: p.current_map_id,
		autoToggles: fromJson(p.auto_toggles, defaults.autoToggles),
		autoPotRules: fromJson(p.auto_pot_rules, defaults.autoPotRules),
		autoCatchConfig: fromJson(p.auto_catch_config, defaults.autoCatchConfig),
		autoCatchRules,
		perfStats: fromJson(p.perf_stats, defaults.perfStats),
		trainer: {
			name: p.trainer_name,
			level: p.trainer_level,
			exp: p.trainer_exp
		},
		pokedexKills
	};
}
function gameStateToPlayerRow(userId, s) {
	return {
		user_id: userId,
		trainer_name: s.trainer.name,
		trainer_level: s.trainer.level,
		trainer_exp: s.trainer.exp,
		gold: s.wallet.gold,
		diamonds: s.wallet.diamonds,
		active_team_index: s.activeIndex,
		current_map_id: s.currentMapId,
		unlocked_maps: s.unlockedMaps,
		unlocked_continents: s.unlockedContinents,
		auto_toggles: toJson(s.autoToggles),
		auto_pot_rules: toJson(s.autoPotRules),
		auto_catch_config: toJson(s.autoCatchConfig),
		perf_stats: toJson(s.perfStats)
	};
}
function pokeToRow(userId, poke, location, teamSlot) {
	return {
		id: poke.uid,
		user_id: userId,
		species_id: poke.speciesId,
		location,
		team_slot: teamSlot,
		level: poke.level,
		exp: poke.exp,
		hp: Math.round(poke.hp),
		is_shiny: poke.isShiny,
		rarity: poke.rarity,
		locked: poke.locked ?? false,
		original_trainer: poke.originalTrainer ?? null,
		iv_hp: poke.ivs.hp,
		iv_atk_fis: poke.ivs.atkFis,
		iv_atk_esp: poke.ivs.atkEsp,
		iv_def: poke.ivs.def,
		iv_def_esp: poke.ivs.defEsp,
		iv_speed: poke.ivs.speed,
		stat_hp: poke.stats.hp,
		stat_atk_fis: poke.stats.atkFis,
		stat_atk_esp: poke.stats.atkEsp,
		stat_def: poke.stats.def,
		stat_def_esp: poke.stats.defEsp,
		stat_speed: poke.stats.speed,
		unlocked_abilities: poke.unlockedAbilities,
		disabled_abilities: poke.disabledAbilities ?? {}
	};
}
function gameStateToPokemonRows(userId, s) {
	return [...s.team.map((p, i) => pokeToRow(userId, p, "team", i)), ...s.bagPokes.map((p) => pokeToRow(userId, p, "bag", null))];
}
function gameStateToItemRows(userId, s) {
	return [.../* @__PURE__ */ new Set([...Object.keys(s.items), ...Object.keys(s.lockedItems)])].map((itemId) => ({
		user_id: userId,
		item_id: itemId,
		quantity: s.items[itemId] ?? 0,
		locked: Boolean(s.lockedItems[itemId])
	}));
}
function gameStateToPokedexRows(userId, s) {
	return Object.entries(s.pokedexKills).map(([speciesId, k]) => ({
		user_id: userId,
		species_id: speciesId,
		normal_kills: k.normal,
		shiny_kills: k.shiny
	}));
}
function gameStateToAutoCatchRuleRows(userId, s) {
	return s.autoCatchRules.map((r) => ({
		user_id: userId,
		species_id: r.speciesId,
		ball_item_id: r.ballItemId
	}));
}
//#endregion
//#region server/src/estadoDoJogador.ts
function criarEstadoDoJogador(dados) {
	const s = structuredClone(dados);
	const acharPoke = (uid) => {
		const iTime = s.team.findIndex((p) => p.uid === uid);
		if (iTime >= 0) return {
			lista: s.team,
			indice: iTime
		};
		const iBag = s.bagPokes.findIndex((p) => p.uid === uid);
		if (iBag >= 0) return {
			lista: s.bagPokes,
			indice: iBag
		};
		return null;
	};
	return {
		store: {
			get team() {
				return s.team;
			},
			get activeIndex() {
				return s.activeIndex;
			},
			get bagPokes() {
				return s.bagPokes;
			},
			get items() {
				return s.items;
			},
			get lockedItems() {
				return s.lockedItems;
			},
			get wallet() {
				return s.wallet;
			},
			get unlockedMaps() {
				return s.unlockedMaps;
			},
			get currentMapId() {
				return s.currentMapId;
			},
			get autoToggles() {
				return s.autoToggles;
			},
			get autoPotRules() {
				return s.autoPotRules;
			},
			get autoCatchConfig() {
				return s.autoCatchConfig;
			},
			get autoCatchRules() {
				return s.autoCatchRules;
			},
			get perfStats() {
				return s.perfStats;
			},
			get trainer() {
				return s.trainer;
			},
			get pokedexKills() {
				return s.pokedexKills;
			},
			get unlockedContinents() {
				return s.unlockedContinents;
			},
			setActiveIndex: (index) => {
				s.activeIndex = index;
			},
			addItem: (itemId, qty = 1) => {
				s.items[itemId] = (s.items[itemId] || 0) + qty;
			},
			hasItem: (itemId, qty = 1) => (s.items[itemId] || 0) >= qty,
			removeItem: (itemId, qty = 1) => {
				if ((s.items[itemId] || 0) < qty) return false;
				s.items[itemId] -= qty;
				if (s.items[itemId] <= 0) delete s.items[itemId];
				return true;
			},
			addGold: (amount) => {
				s.wallet.gold += amount;
			},
			spendGold: (amount) => {
				if (s.wallet.gold < amount) return false;
				s.wallet.gold -= amount;
				return true;
			},
			addDiamonds: (amount) => {
				s.wallet.diamonds += amount;
			},
			spendDiamonds: (amount) => {
				if (s.wallet.diamonds < amount) return false;
				s.wallet.diamonds -= amount;
				return true;
			},
			addCapturedPoke: (poke) => {
				s.bagPokes.push(poke);
				return "bag";
			},
			toggleItemLock: (itemId) => {
				if (s.lockedItems[itemId]) delete s.lockedItems[itemId];
				else s.lockedItems[itemId] = true;
			},
			isItemLocked: (itemId) => Boolean(s.lockedItems[itemId]),
			unlockMap: (mapId) => {
				if (!s.unlockedMaps.includes(mapId)) s.unlockedMaps.push(mapId);
			},
			isMapUnlocked: (mapId) => s.unlockedMaps.includes(mapId),
			unlockContinent: (c) => {
				if (!s.unlockedContinents.includes(c)) s.unlockedContinents.push(c);
			},
			isContinentUnlocked: (c) => s.unlockedContinents.includes(c),
			healTeamFully: () => {
				s.team = s.team.map((p) => ({
					...p,
					hp: p.stats.hp
				}));
			},
			setCurrentMapId: (mapId) => {
				s.currentMapId = mapId;
			},
			addPokeToTeam: (poke) => {
				s.team.push(poke);
			},
			moveTeamIndexToFront: (index) => {
				if (index <= 0 || index >= s.team.length) return;
				const [p] = s.team.splice(index, 1);
				s.team.unshift(p);
				s.activeIndex = 0;
			},
			moveTeamToBag: (uid) => {
				const i = s.team.findIndex((p) => p.uid === uid);
				if (i < 0 || s.team.length <= 1) return null;
				const [p] = s.team.splice(i, 1);
				s.bagPokes.push(p);
				if (s.activeIndex >= s.team.length) s.activeIndex = s.team.length - 1;
				return p;
			},
			moveBagToTeam: (uid) => {
				if (s.team.length >= 6) return null;
				const i = s.bagPokes.findIndex((p) => p.uid === uid);
				if (i < 0) return null;
				const [p] = s.bagPokes.splice(i, 1);
				s.team.push(p);
				return p;
			},
			removeBagPoke: (uid) => {
				const i = s.bagPokes.findIndex((p) => p.uid === uid);
				if (i < 0) return null;
				return s.bagPokes.splice(i, 1)[0];
			},
			removeBagPokes: (uids) => {
				const alvo = new Set(uids);
				const removidos = s.bagPokes.filter((p) => alvo.has(p.uid));
				s.bagPokes = s.bagPokes.filter((p) => !alvo.has(p.uid));
				return removidos;
			},
			updatePokeInstance: (uid, updater) => {
				const achado = acharPoke(uid);
				if (achado) achado.lista[achado.indice] = updater(achado.lista[achado.indice]);
			},
			setTrainer: (trainer) => {
				s.trainer = trainer;
			},
			resetPerfStats: () => {
				s.perfStats = {
					gold: 0,
					xp: 0,
					mobs: 0,
					shinys: 0,
					since: Date.now()
				};
			},
			incrementPerfStats: (delta) => {
				s.perfStats.gold += delta.gold;
				s.perfStats.xp += delta.xp;
				s.perfStats.mobs += delta.mobs;
				s.perfStats.shinys += delta.shinys;
			},
			setPokedexKillEntry: (speciesId, entry) => {
				s.pokedexKills[speciesId] = entry;
			},
			setAutoToggle: (key, value) => {
				s.autoToggles[key] = value;
			},
			addAutoPotRule: (rule) => {
				s.autoPotRules.push(rule);
			},
			updateAutoPotRule: (index, patch) => {
				if (s.autoPotRules[index]) s.autoPotRules[index] = {
					...s.autoPotRules[index],
					...patch
				};
			},
			removeAutoPotRule: (index) => {
				s.autoPotRules.splice(index, 1);
			},
			setAutoCatchConfig: (patch) => {
				s.autoCatchConfig = {
					...s.autoCatchConfig,
					...patch
				};
			},
			addAutoCatchRule: (rule) => {
				s.autoCatchRules.push(rule);
			},
			updateAutoCatchRule: (index, patch) => {
				if (s.autoCatchRules[index]) s.autoCatchRules[index] = {
					...s.autoCatchRules[index],
					...patch
				};
			},
			removeAutoCatchRule: (index) => {
				s.autoCatchRules.splice(index, 1);
			},
			toggleAbilityDisabled: (pokeUid, abilityId) => {
				const achado = acharPoke(pokeUid);
				if (!achado) return;
				const poke = achado.lista[achado.indice];
				const desligadas = { ...poke.disabledAbilities || {} };
				if (desligadas[abilityId]) delete desligadas[abilityId];
				else desligadas[abilityId] = true;
				achado.lista[achado.indice] = {
					...poke,
					disabledAbilities: desligadas
				};
			},
			resetToDefaults: () => {
				throw new Error("resetToDefaults nao pode ser chamado durante uma simulacao no servidor");
			}
		},
		dados: s
	};
}
//#endregion
//#region server/src/farmOffline.ts
var FRACAO_DO_PISO = .5;
var NENHUM_PISO = {
	aplicado: false,
	ouroAdicionado: 0,
	xpAdicionado: 0
};
/**
* Completa ouro/XP ate o piso, se a amostra permitir.
*
* O piso multiplica o tempo REALMENTE FARMADO (`simulatedSeconds`), nao o tempo
* offline: se o POKE morreu aos 10 minutos por falta de pocao, o piso vale sobre
* esses 10 minutos. Usar o tempo offline cheio anularia a regra de morte —
* morrer renderia o mesmo que sobreviver.
*
* Captura, shiny e drop NAO entram: sao eventos, nao taxa. Nao existe "50% de um
* shiny".
*/
function aplicarPiso(store, estado, resumo, agoraMs) {
	const nada = NENHUM_PISO;
	const perf = estado.perfStats;
	const amostraSegundos = (agoraMs - perf.since) / 1e3;
	if (!Number.isFinite(amostraSegundos) || amostraSegundos < 300) return nada;
	if (perf.mobs < 10) return nada;
	const farmados = resumo.simulatedSeconds;
	if (farmados <= 0) return nada;
	const pisoOuro = Math.floor(perf.gold / amostraSegundos * FRACAO_DO_PISO * farmados);
	const pisoXp = Math.floor(perf.xp / amostraSegundos * FRACAO_DO_PISO * farmados);
	const ouroAdicionado = Math.max(0, pisoOuro - resumo.gold);
	const xpAdicionado = Math.max(0, pisoXp - resumo.xp);
	if (ouroAdicionado === 0 && xpAdicionado === 0) return nada;
	if (ouroAdicionado > 0) store.addGold(ouroAdicionado);
	if (xpAdicionado > 0) {
		const ativo = estado.team[estado.activeIndex];
		if (ativo) {
			const r = grantExp(ativo, xpAdicionado);
			store.updatePokeInstance(ativo.uid, () => r.poke);
		}
	}
	resumo.gold += ouroAdicionado;
	resumo.xp += xpAdicionado;
	return {
		aplicado: true,
		ouroAdicionado,
		xpAdicionado
	};
}
//#endregion
//#region server/src/entregas.ts
/**
* Reivindica (de forma atomica) tudo que esta pendente pra este jogador.
*
* O `claimed_at=is.null` no FILTRO e o que torna isso atomico: dois requests
* simultaneos do mesmo jogador nao podem reivindicar a mesma linha duas vezes,
* porque o segundo PATCH nao encontra mais linha que case. A linha nao e
* apagada — fica com carimbo, servindo de historico auditavel de "o jogo
* realmente creditou isto".
*/
async function reivindicarEntregas(cfg, userId) {
	return atualizarRetornando(cfg, `market_deliveries?user_id=eq.${userId}&claimed_at=is.null`, { claimed_at: (/* @__PURE__ */ new Date()).toISOString() });
}
/**
* Desfaz o claim: as entregas voltam pra fila.
*
* Existe por causa de um bug REAL de perda de progresso. O claim acontece no
* `carregarEstadoParaEscrita`, ou seja, ANTES de a operacao rodar — e uma
* operacao recusada (409 "Ouro insuficiente", item travado, POKE ja evoluido...)
* nunca chega ao `gravarEstado`. As entregas ficavam carimbadas como aplicadas
* sem terem sido aplicadas a lugar nenhum. Medido: uma venda de 500 de ouro no
* Mercado sumiu porque o jogador, em seguida, tentou comprar algo que nao podia
* pagar. Como 409 e o erro mais comum do jogo, isso acontecia o tempo todo.
*/
async function devolverEntregas(cfg, entregas) {
	if (!entregas.length) return;
	await atualizarRetornando(cfg, `market_deliveries?id=in.(${entregas.map((e) => e.id).join(",")})`, { claimed_at: null });
}
/**
* Aplica as entregas ao estado JA CARREGADO, antes de ele ser gravado.
*
* Muta `estado` direto (e nao pela store) de proposito: isto roda entre o
* `carregarEstado` e o `criarEstadoDoJogador`, quando ainda nao existe store —
* e sao somas simples em campos que o mapper ja sabe persistir.
*/
function aplicarEntregasNoEstado(estado, entregas) {
	for (const e of entregas) {
		if (e.gold) estado.wallet.gold += e.gold;
		if (e.diamonds) estado.wallet.diamonds += e.diamonds;
		if (e.item_id && e.quantity > 0) estado.items[e.item_id] = (estado.items[e.item_id] ?? 0) + e.quantity;
	}
}
//#endregion
//#region server/src/progresso.ts
var CONQUISTA_LANCE = "boss_lance";
var MAX_SEGUNDOS_POR_FLUSH = 21600;
async function lerSnapshot(cfg, userId) {
	const [player, pokemon, items, pokedex, autoCatchRules] = await Promise.all([
		selecionar(cfg, `players?user_id=eq.${userId}&select=*`),
		selecionarTudo(cfg, `pokemon_instances?user_id=eq.${userId}&select=*`),
		selecionarTudo(cfg, `player_items?user_id=eq.${userId}&select=*`),
		selecionarTudo(cfg, `player_pokedex?user_id=eq.${userId}&select=*`),
		selecionarTudo(cfg, `player_auto_catch_rules?user_id=eq.${userId}&select=*`)
	]);
	if (!player[0]) throw new ErroHttp(404, "jogador sem linha em `players`");
	return {
		estado: snapshotToGameState({
			player: player[0],
			pokemon,
			items,
			pokedex,
			autoCatchRules
		}, defaultGameStateData()),
		pokeIdsNoLoad: new Set(pokemon.map((p) => p.id)),
		entregas: [],
		playerUpdatedAt: player[0].updated_at
	};
}
async function carregarEstado(cfg, userId) {
	return (await lerSnapshot(cfg, userId)).estado;
}
/**
* Como `carregarEstado`, mas tambem REIVINDICA as entregas pendentes do
* Mercado e as soma ao estado devolvido.
*
* So pode ser usada por quem VAI GRAVAR o estado em seguida: a reivindicacao
* carimba a linha como entregue, entao um caminho que carregue e nao grave
* perderia o credito. Por isso `/sessao/abrir` (que so valida a intencao)
* continua usando `carregarEstado` cru.
*/
async function carregarEstadoParaEscrita(cfg, userId) {
	const snapshot = await lerSnapshot(cfg, userId);
	const entregas = await reivindicarEntregas(cfg, userId);
	if (entregas.length) aplicarEntregasNoEstado(snapshot.estado, entregas);
	snapshot.entregas = entregas;
	return snapshot;
}
/**
* Carrega o estado pra escrita, roda `fn`, e DEVOLVE as entregas se `fn` abortar.
*
* Este embrulho existe porque a versao "carregue e lembre de tratar o erro" ja
* falhou na pratica em TODOS os call sites de uma vez: nenhum tinha try/catch, e
* qualquer 409 (o erro mais comum do jogo — ouro insuficiente, item travado,
* POKE indisponivel) apagava o que o jogador tinha recebido no Mercado. Com o
* embrulho, esquecer o tratamento deixa de ser possivel: quem carrega, carrega
* por aqui.
*/
async function comEstadoParaEscrita(cfg, userId, fn) {
	const ctx = await carregarEstadoParaEscrita(cfg, userId);
	try {
		return await fn(ctx);
	} catch (erro) {
		await devolverEntregas(cfg, ctx.entregas);
		throw erro;
	}
}
/**
* Grava o snapshot do jogador nas cinco tabelas.
*
* `pokeIdsNoLoad` (os ids que existiam quando ESTE estado foi lido) e o que
* impede um snapshot velho de destruir POKE que mudou de dono no meio do
* caminho. Duas regras, e as duas vieram de bug real de duplicacao/sumico:
*
*  - So APAGA linha que este snapshot conhecia. Uma linha criada depois da
*    leitura (o POKE que o jogador acabou de comprar no Mercado, num request
*    paralelo) nao esta no conjunto — antes ela caia no diff de remocao e o
*    comprador pagava por um POKE que sumia.
*  - So GRAVA linha que AINDA e deste jogador e ainda esta em team/bag. Sem
*    isso, o upsert (que escreve `user_id` e `location` a partir do estado em
*    memoria) ressuscitava o POKE recem-anunciado de volta pra mochila — com o
*    anuncio ainda de pe, ou seja, o mesmo POKE em dois lugares — e revertia
*    pro vendedor um POKE que o comprador ja tinha pago.
*/
async function gravarEstado(cfg, userId, estado, pokeIdsNoLoad, playerUpdatedAtEsperado) {
	if (!(await atualizarRetornando(cfg, `players?user_id=eq.${userId}&updated_at=eq.${encodeURIComponent(playerUpdatedAtEsperado)}`, gameStateToPlayerRow(userId, estado))).length) throw new ErroHttp(409, "outro comando em andamento — tente de novo");
	const linhasPoke = gameStateToPokemonRows(userId, estado);
	const idsAgora = new Set(linhasPoke.map((l) => l.id));
	const idsDeInteresse = [.../* @__PURE__ */ new Set([...pokeIdsNoLoad, ...idsAgora])];
	const atuais = idsDeInteresse.length ? await selecionarTudo(cfg, `pokemon_instances?id=in.(${idsDeInteresse.join(",")})&select=id,user_id,location`) : [];
	const porId = new Map(atuais.map((l) => [l.id, l]));
	const aindaMeu = (l) => l != null && l.user_id === userId && (l.location === "team" || l.location === "bag");
	const remover = [...pokeIdsNoLoad].filter((id) => !idsAgora.has(id) && aindaMeu(porId.get(id)));
	if (remover.length) await apagar(cfg, `pokemon_instances?user_id=eq.${userId}&id=in.(${remover.join(",")})`);
	const gravarPoke = linhasPoke.filter((l) => {
		const atual = porId.get(String(l.id));
		return atual == null || aindaMeu(atual);
	});
	if (gravarPoke.length) await inserir(cfg, "pokemon_instances", gravarPoke, { upsert: "id" });
	const linhasItens = gameStateToItemRows(userId, estado);
	const itemIdsAgora = new Set(linhasItens.map((l) => l.item_id));
	const removerItens = (await selecionarTudo(cfg, `player_items?user_id=eq.${userId}&select=item_id`)).map((l) => l.item_id).filter((id) => !itemIdsAgora.has(id));
	if (removerItens.length) await apagar(cfg, `player_items?user_id=eq.${userId}&item_id=in.(${removerItens.join(",")})`);
	if (linhasItens.length) await inserir(cfg, "player_items", linhasItens, { upsert: "user_id,item_id" });
	const linhasDex = gameStateToPokedexRows(userId, estado);
	const dexIdsAgora = new Set(linhasDex.map((l) => l.species_id));
	const removerDex = (await selecionarTudo(cfg, `player_pokedex?user_id=eq.${userId}&select=species_id`)).map((l) => l.species_id).filter((id) => !dexIdsAgora.has(id));
	if (removerDex.length) await apagar(cfg, `player_pokedex?user_id=eq.${userId}&species_id=in.(${removerDex.join(",")})`);
	if (linhasDex.length) await inserir(cfg, "player_pokedex", linhasDex, { upsert: "user_id,species_id" });
	const linhasAuto = gameStateToAutoCatchRuleRows(userId, estado);
	const especiesAgora = new Set(linhasAuto.map((l) => l.species_id));
	const removerAuto = (await selecionarTudo(cfg, `player_auto_catch_rules?user_id=eq.${userId}&select=species_id`)).map((l) => l.species_id).filter((id) => !especiesAgora.has(id));
	if (removerAuto.length) await apagar(cfg, `player_auto_catch_rules?user_id=eq.${userId}&species_id=in.(${removerAuto.join(",")})`);
	if (linhasAuto.length) await inserir(cfg, "player_auto_catch_rules", linhasAuto, { upsert: "user_id,species_id" });
}
/**
* Outro request do mesmo jogador ja esta creditando este intervalo.
*
* Distinto de `null` (sessao insimulavel, tem que fechar): aqui nao ha nada
* errado, so nao ha nada a fazer — quem perdeu a corrida nao simula, nao
* carrega e NAO grava, pra nao sobrescrever o resultado de quem ganhou com um
* estado lido antes dele.
*/
var FLUSH_OCUPADO = "ocupado";
/**
* O coracao da Fase D: simula do ultimo flush ate agora e grava.
*
* Repare no que NAO entra aqui: nada vindo do cliente. Nem quanto tempo passou
* (sai de `now()` menos `last_flush_at`), nem quantos kills houve, nem quanto
* ouro. O cliente so declarou, na abertura da sessao, em qual hunt esta.
*/
async function aplicarFlush(cfg, userId, sessao) {
	const agora = Date.now();
	const bruto = (agora - new Date(sessao.last_flush_at).getTime()) / 1e3;
	const segundos = Math.max(0, Math.min(bruto, MAX_SEGUNDOS_POR_FLUSH));
	const truncado = bruto > MAX_SEGUNDOS_POR_FLUSH;
	const [reivindicada] = await atualizarRetornando(cfg, `game_sessions?id=eq.${sessao.id}&closed_at=is.null&last_flush_at=eq.${encodeURIComponent(sessao.last_flush_at)}`, { last_flush_at: new Date(agora).toISOString() });
	if (!reivindicada) return FLUSH_OCUPADO;
	return comEstadoParaEscrita(cfg, userId, async (ctx) => {
		const resultado = await simularSessao(cfg, userId, sessao, ctx.estado, ctx.pokeIdsNoLoad, ctx.playerUpdatedAt, {
			agora,
			segundos,
			truncado
		});
		if (!resultado) await devolverEntregas(cfg, ctx.entregas);
		return resultado;
	});
}
async function simularSessao(cfg, userId, sessao, dados, pokeIdsNoLoad, playerUpdatedAt, janela) {
	const { agora, segundos, truncado } = janela;
	const { store, dados: estado } = criarEstadoDoJogador(dados);
	const continentesAntes = new Set(estado.unlockedContinents);
	const ativo = estado.team.find((p) => p.uid === sessao.poke_uid);
	if (!ativo) return null;
	store.setActiveIndex(estado.team.indexOf(ativo));
	if (!MAPS[sessao.map_id]) return null;
	const rng = restoreRng(Number(sessao.rng_state), Number(sessao.rng_draws));
	const world = buildMapWorld(sessao.map_id, ativo, {
		rng,
		counters: {
			entity: 1,
			effect: 1,
			pendingHit: 1
		}
	});
	const offline = segundos > 120;
	world.pessimista = offline;
	const resumo = simulateWorldSeconds({
		world,
		gameState: store,
		seconds: segundos,
		stepSeconds: OFFLINE_SIM_STEP_SECONDS,
		stepFn: (w, dt, opts) => stepWorld(w, dt, store, opts)
	});
	const piso = offline ? aplicarPiso(store, estado, resumo, agora) : NENHUM_PISO;
	if (!offline) recordBatch(store, {
		gold: resumo.gold,
		xp: resumo.xp,
		mobs: resumo.kills,
		shinys: resumo.shinySeen
	});
	estado.currentMapId = resumo.stoppedEarly ? null : sessao.map_id;
	await gravarEstado(cfg, userId, estado, pokeIdsNoLoad, playerUpdatedAt);
	if (!continentesAntes.has("kanto") && estado.unlockedContinents.includes("kanto")) await inserir(cfg, "hall_da_fama", {
		user_id: userId,
		conquista: CONQUISTA_LANCE
	}, { upsert: "user_id,conquista" });
	await atualizar(cfg, `game_sessions?id=eq.${sessao.id}`, {
		simulated_seconds: Number(sessao.simulated_seconds) + resumo.simulatedSeconds,
		rng_state: world.rng.state,
		rng_draws: world.rng.draws
	});
	return {
		segundosCreditados: segundos,
		truncado,
		resumo,
		estado,
		piso,
		encerrada: resumo.stoppedEarly ? "desmaio" : null
	};
}
//#endregion
//#region server/src/appSessao.ts
function json(dado, status = 200) {
	return new Response(JSON.stringify(dado), {
		status,
		headers: { "content-type": "application/json; charset=utf-8" }
	});
}
function corsHeaders(origem, permitidas) {
	if (!origem || !permitidas.includes(origem)) return {};
	return {
		"access-control-allow-origin": origem,
		"access-control-allow-headers": "authorization, content-type",
		"access-control-allow-methods": "GET, POST, OPTIONS",
		"access-control-max-age": "86400"
	};
}
function criarApp(cfg) {
	return async function handler(req) {
		const cors = corsHeaders(req.headers.get("origin"), cfg.origensPermitidas);
		if (req.method === "OPTIONS") return new Response(null, {
			status: 204,
			headers: cors
		});
		const url = new URL(req.url);
		let resposta;
		try {
			resposta = await rotear(cfg, req, url);
		} catch (erro) {
			if (erro instanceof ErroHttp) resposta = json({ erro: erro.message }, erro.status);
			else {
				console.error("erro nao tratado:", erro);
				resposta = json({ erro: "erro interno" }, 500);
			}
		}
		for (const [k, v] of Object.entries(cors)) resposta.headers.set(k, v);
		return resposta;
	};
}
async function rotear(cfg, req, url) {
	if (url.pathname === "/saude") return json({ ok: true });
	const jogador = await autenticar(cfg, req);
	if (url.pathname === "/sessao/abrir" && req.method === "POST") return abrirSessao(cfg, jogador.id, req);
	if (url.pathname === "/sessao/flush" && req.method === "POST") return flush(cfg, jogador.id);
	if (url.pathname === "/sessao/fechar" && req.method === "POST") return fechar(cfg, jogador.id);
	if (url.pathname === "/estado" && req.method === "GET") return comEstadoParaEscrita(cfg, jogador.id, async ({ estado, pokeIdsNoLoad, playerUpdatedAt }) => {
		await gravarEstado(cfg, jogador.id, estado, pokeIdsNoLoad, playerUpdatedAt);
		return json({ estado });
	});
	return json({ erro: "rota desconhecida" }, 404);
}
/**
* A sessao aberta do jogador — e no maximo UMA.
*
* O indice unico parcial `game_sessions_abertas` garante isso desde a migration
* `20260809180000`. A varredura abaixo continua existindo como defesa em
* profundidade e como conserto de dado legado: uma orfa nascida antes do indice
* (ou num ambiente sem a migration) seria flushada mais tarde e creditaria de
* novo um periodo que a sessao vencedora ja pagou — o exploit de duplicacao que
* aquela migration descreve. Fechar sem creditar e o certo: o tempo dela ja foi
* pago pela outra.
*/
async function sessaoAberta(cfg, userId) {
	const linhas = await selecionar(cfg, `game_sessions?user_id=eq.${userId}&closed_at=is.null&select=*&order=started_at.desc`);
	for (const orfa of linhas.slice(1)) await fecharLinhaDeSessao(cfg, orfa.id);
	return linhas[0] ?? null;
}
async function fecharLinhaDeSessao(cfg, sessaoId) {
	await atualizar(cfg, `game_sessions?id=eq.${sessaoId}`, { closed_at: (/* @__PURE__ */ new Date()).toISOString() });
}
/**
* Fecha a linha da sessao E tira o jogador da hunt.
*
* `current_map_id` tem que ser limpo junto: e ele que faz o cliente voltar pra
* hunt no proximo carregamento. Deixar a coluna apontando pra um mapa sem
* sessao poe o jogador dentro de uma cacada que nao credita nada.
*/
async function sairDaHunt(cfg, userId, sessaoId) {
	await fecharLinhaDeSessao(cfg, sessaoId);
	await atualizar(cfg, `players?user_id=eq.${userId}`, { current_map_id: null });
}
async function abrirSessao(cfg, userId, req) {
	const corpo = await req.json().catch(() => null);
	const mapId = corpo?.mapId;
	const pokeUid = corpo?.pokeUid;
	if (!mapId || !pokeUid) throw new ErroHttp(400, "mapId e pokeUid sao obrigatorios");
	if (!MAPS[mapId]) throw new ErroHttp(400, "hunt desconhecida");
	const estado = await carregarEstado(cfg, userId);
	const poke = estado.team.find((p) => p.uid === pokeUid);
	if (!poke) throw new ErroHttp(403, "este POKE nao esta na sua equipe");
	if (poke.hp <= 0) throw new ErroHttp(409, "Seu POKE esta desmaiado. Cure na Enfermeira antes de cacar.");
	if (MAPS[mapId].unlockCost != null && !estado.unlockedMaps.includes(mapId)) throw new ErroHttp(403, "hunt nao desbloqueada");
	const continente = MAPS[mapId].continent || "johto";
	if (!estado.unlockedContinents.includes(continente)) throw new ErroHttp(403, "continente nao desbloqueado");
	const anterior = await sessaoAberta(cfg, userId);
	if (anterior) {
		await aplicarFlush(cfg, userId, anterior);
		await fecharLinhaDeSessao(cfg, anterior.id);
	}
	const semente = randomSeed();
	let criada;
	try {
		[criada] = await inserir(cfg, "game_sessions", {
			user_id: userId,
			map_id: mapId,
			poke_uid: pokeUid,
			seed: semente,
			rng_state: semente,
			rng_draws: 0
		}, { retornar: true });
	} catch {
		const vencedora = await sessaoAberta(cfg, userId);
		if (!vencedora) throw new ErroHttp(409, "nao foi possivel abrir a sessao — tente de novo");
		return json({
			sessaoId: vencedora.id,
			mapId: vencedora.map_id,
			iniciadaEm: vencedora.last_flush_at
		});
	}
	await atualizar(cfg, `players?user_id=eq.${userId}`, {
		current_map_id: mapId,
		perf_stats: {
			gold: 0,
			xp: 0,
			mobs: 0,
			shinys: 0,
			since: Date.now()
		}
	});
	return json({
		sessaoId: criada.id,
		mapId,
		iniciadaEm: criada.last_flush_at
	});
}
async function flush(cfg, userId) {
	const sessao = await sessaoAberta(cfg, userId);
	if (!sessao) throw new ErroHttp(409, "nenhuma sessao aberta");
	const resultado = await aplicarFlush(cfg, userId, sessao);
	if (resultado === "ocupado") return json({
		segundosCreditados: 0,
		truncado: false,
		resumo: createEmptySummary(),
		piso: {
			aplicado: false,
			ouroAdicionado: 0,
			xpAdicionado: 0
		},
		estado: await carregarEstado(cfg, userId)
	});
	if (!resultado) {
		await sairDaHunt(cfg, userId, sessao.id);
		throw new ErroHttp(409, "nenhuma sessao aberta");
	}
	if (resultado.encerrada) await sairDaHunt(cfg, userId, sessao.id);
	return json({
		segundosCreditados: resultado.segundosCreditados,
		truncado: resultado.truncado,
		resumo: resultado.resumo,
		piso: resultado.piso,
		sessaoEncerrada: resultado.encerrada,
		estado: resultado.estado
	});
}
async function fechar(cfg, userId) {
	const sessao = await sessaoAberta(cfg, userId);
	if (!sessao) return json({ fechada: false });
	const resultado = await aplicarFlush(cfg, userId, sessao);
	await sairDaHunt(cfg, userId, sessao.id);
	if (!resultado || resultado === "ocupado") return json({ fechada: false });
	return json({
		fechada: true,
		resumo: resultado.resumo,
		piso: resultado.piso,
		estado: resultado.estado
	});
}
//#endregion
export { criarApp };
