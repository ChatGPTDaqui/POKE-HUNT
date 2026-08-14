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
var dormir$1 = (ms) => new Promise((r) => setTimeout(r, ms));
function ehFalhaTransitoria(status) {
	return status === 408 || status === 425 || status === 429 || status >= 500;
}
async function buscarComRetry(cfg, caminho, init) {
	let ultimo = null;
	for (let tentativa = 0; tentativa <= ESPERA_ENTRE_TENTATIVAS_MS.length; tentativa++) {
		if (tentativa > 0) await dormir$1(ESPERA_ENTRE_TENTATIVAS_MS[tentativa - 1]);
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
/**
* Chama uma funcao do Postgres via `POST /rest/v1/rpc/<nome>`.
*
* Usado onde a pergunta e do BANCO e nao cabe num filtro: o unico caso hoje e
* "este nome de treinador esta livre?", que compara por `lower(trainer_name)`.
* Fazer isso com `ilike` daria falso positivo — `_` e curinga de uma letra em
* LIKE, e `_` e um caractere valido de nick, entao "ash_1" apareceria como
* ocupado por causa de um "ashX1" de outra pessoa.
*/
async function chamarRpc(cfg, nome, argumentos) {
	return await pedir(cfg, `rpc/${nome}`, {
		method: "POST",
		headers: cabecalhos(cfg),
		body: JSON.stringify(argumentos)
	});
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
	if: (cond, quandoVerdadeiro, quandoFalso) => cond ? quandoVerdadeiro : quandoFalso,
	lt: (a, b) => a < b ? 1 : 0,
	lte: (a, b) => a <= b ? 1 : 0,
	gt: (a, b) => a > b ? 1 : 0,
	gte: (a, b) => a >= b ? 1 : 0,
	eq: (a, b) => a === b ? 1 : 0,
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
		"expr": "floor(floor(floor(2*level/5+2)*power*atk/def)/50)+2",
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
		"expr": "1/24",
		"vars": []
	},
	"CRIT_MULTIPLIER": {
		"expr": "1.5",
		"vars": []
	},
	"DAMAGE_VARIATION": {
		"expr": "(floor(random()*16)+85)/100",
		"vars": []
	},
	"EXP_GAIN": {
		"expr": "floor(baseExp*level/5*((2*level+10)^2.5/(level+winnerLevel+10)^2.5))+1",
		"vars": [
			"baseExp",
			"level",
			"winnerLevel"
		]
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
		"expr": "0.0925",
		"vars": []
	},
	"CATCH_MODIFIED_RATE": {
		"expr": "max(0.00001, (3*hpMax-2*hpAtual)/(3*hpMax)*catchRate*ballMultiplier*statusBonus*catchMultiplier)",
		"vars": [
			"hpMax",
			"hpAtual",
			"catchRate",
			"ballMultiplier",
			"statusBonus",
			"catchMultiplier"
		]
	},
	"CATCH_SHAKE_PROBABILITY": {
		"expr": "min(1, (min(255, a)/255)^0.1875)",
		"vars": ["a"]
	},
	"CATCH_SHAKES": {
		"expr": "3",
		"vars": []
	},
	"CATCH_CHANCE": {
		"expr": "min(1, shakeProbability^shakes)",
		"vars": ["shakeProbability", "shakes"]
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
	"GROWTH_ERRATIC": {
		"expr": "floor(if(lt(n,50), n^3*(100-n)/50, if(lt(n,68), n^3*(150-n)/100, if(lt(n,98), n^3*floor((1911-10*n)/3)/500, n^3*(160-n)/100))))",
		"vars": ["n (= level)"]
	},
	"GROWTH_FLUCTUATING": {
		"expr": "floor(if(lt(n,15), n^3*(floor((n+1)/3)+24)/50, if(lt(n,36), n^3*(n+14)/50, n^3*(floor(n/2)+32)/50)))",
		"vars": ["n (= level)"]
	},
	"FISH_BITE_CHANCE": {
		"expr": "51",
		"vars": []
	},
	"TURNO_SEGUNDOS": {
		"expr": "2",
		"vars": []
	}
};
//#endregion
//#region src/data/generated/abilities.generated.ts
var ABILITIES_DATA = {
	"growl": {
		"id": "growl",
		"name": "Growl",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 40,
		"target": "aoe",
		"statChanges": [{
			"stat": "atkFis",
			"estagios": -1
		}],
		"statChance": 100,
		"accuracy": 100
	},
	"scratch": {
		"id": "scratch",
		"name": "Scratch",
		"type": "NORMAL",
		"category": "physical",
		"power": 40,
		"pp": 35,
		"target": "single",
		"accuracy": 100
	},
	"ember": {
		"id": "ember",
		"name": "Ember",
		"type": "FIRE",
		"category": "special",
		"power": 40,
		"pp": 25,
		"target": "single",
		"status": "burn",
		"statusChance": 10,
		"accuracy": 100
	},
	"smokescreen": {
		"id": "smokescreen",
		"name": "Smokescreen",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 20,
		"target": "single",
		"accuracy": 100
	},
	"dragon_rage": {
		"id": "dragon_rage",
		"name": "Dragon Rage",
		"type": "DRAGON",
		"category": "special",
		"power": 0,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"scary_face": {
		"id": "scary_face",
		"name": "Scary Face",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 10,
		"target": "single",
		"statChanges": [{
			"stat": "speed",
			"estagios": -2
		}],
		"statChance": 100,
		"accuracy": 100
	},
	"fire_fang": {
		"id": "fire_fang",
		"name": "Fire Fang",
		"type": "FIRE",
		"category": "physical",
		"power": 65,
		"pp": 15,
		"target": "single",
		"status": "burn",
		"statusChance": 10,
		"flinchChance": 10,
		"accuracy": 95
	},
	"flame_burst": {
		"id": "flame_burst",
		"name": "Flame Burst",
		"type": "FIRE",
		"category": "special",
		"power": 70,
		"pp": 15,
		"target": "single",
		"accuracy": 100
	},
	"slash": {
		"id": "slash",
		"name": "Slash",
		"type": "NORMAL",
		"category": "physical",
		"power": 70,
		"pp": 20,
		"target": "single",
		"critStages": 1,
		"accuracy": 100
	},
	"flamethrower": {
		"id": "flamethrower",
		"name": "Flamethrower",
		"type": "FIRE",
		"category": "special",
		"power": 90,
		"pp": 15,
		"target": "single",
		"status": "burn",
		"statusChance": 10,
		"accuracy": 100
	},
	"fire_spin": {
		"id": "fire_spin",
		"name": "Fire Spin",
		"type": "FIRE",
		"category": "special",
		"power": 35,
		"pp": 15,
		"target": "single",
		"accuracy": 85
	},
	"inferno": {
		"id": "inferno",
		"name": "Inferno",
		"type": "FIRE",
		"category": "special",
		"power": 100,
		"pp": 5,
		"target": "single",
		"status": "burn",
		"statusChance": 100,
		"accuracy": 50
	},
	"tackle": {
		"id": "tackle",
		"name": "Tackle",
		"type": "NORMAL",
		"category": "physical",
		"power": 40,
		"pp": 35,
		"target": "single",
		"accuracy": 100
	},
	"tail_whip": {
		"id": "tail_whip",
		"name": "Tail Whip",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 30,
		"target": "aoe",
		"statChanges": [{
			"stat": "def",
			"estagios": -1
		}],
		"statChance": 100,
		"accuracy": 100
	},
	"water_gun": {
		"id": "water_gun",
		"name": "Water Gun",
		"type": "WATER",
		"category": "special",
		"power": 40,
		"pp": 25,
		"target": "single",
		"accuracy": 100
	},
	"withdraw": {
		"id": "withdraw",
		"name": "Withdraw",
		"type": "WATER",
		"category": "status",
		"power": 0,
		"pp": 40,
		"target": "single",
		"statChanges": [{
			"stat": "def",
			"estagios": 1
		}],
		"statChance": 100,
		"statTarget": "self",
		"accuracy": 100
	},
	"bubble": {
		"id": "bubble",
		"name": "Bubble",
		"type": "WATER",
		"category": "special",
		"power": 40,
		"pp": 30,
		"target": "aoe",
		"statChanges": [{
			"stat": "speed",
			"estagios": -1
		}],
		"statChance": 10,
		"accuracy": 100
	},
	"bite": {
		"id": "bite",
		"name": "Bite",
		"type": "DARK",
		"category": "physical",
		"power": 60,
		"pp": 25,
		"target": "single",
		"flinchChance": 30,
		"accuracy": 100
	},
	"rapid_spin": {
		"id": "rapid_spin",
		"name": "Rapid Spin",
		"type": "NORMAL",
		"category": "physical",
		"power": 20,
		"pp": 40,
		"target": "single",
		"statChanges": [{
			"stat": "speed",
			"estagios": 1
		}],
		"statChance": 100,
		"accuracy": 100
	},
	"protect": {
		"id": "protect",
		"name": "Protect",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"water_pulse": {
		"id": "water_pulse",
		"name": "Water Pulse",
		"type": "WATER",
		"category": "special",
		"power": 60,
		"pp": 20,
		"target": "single",
		"status": "confusion",
		"statusChance": 20,
		"accuracy": 100
	},
	"aqua_tail": {
		"id": "aqua_tail",
		"name": "Aqua Tail",
		"type": "WATER",
		"category": "physical",
		"power": 90,
		"pp": 10,
		"target": "single",
		"accuracy": 90
	},
	"skull_bash": {
		"id": "skull_bash",
		"name": "Skull Bash",
		"type": "NORMAL",
		"category": "physical",
		"power": 130,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"iron_defense": {
		"id": "iron_defense",
		"name": "Iron Defense",
		"type": "STEEL",
		"category": "status",
		"power": 0,
		"pp": 15,
		"target": "single",
		"statChanges": [{
			"stat": "def",
			"estagios": 2
		}],
		"statChance": 100,
		"statTarget": "self",
		"accuracy": 100
	},
	"rain_dance": {
		"id": "rain_dance",
		"name": "Rain Dance",
		"type": "WATER",
		"category": "status",
		"power": 0,
		"pp": 5,
		"target": "single",
		"accuracy": 100
	},
	"hydro_pump": {
		"id": "hydro_pump",
		"name": "Hydro Pump",
		"type": "WATER",
		"category": "special",
		"power": 110,
		"pp": 5,
		"target": "single",
		"accuracy": 80
	},
	"leech_seed": {
		"id": "leech_seed",
		"name": "Leech Seed",
		"type": "GRASS",
		"category": "status",
		"power": 0,
		"pp": 10,
		"target": "single",
		"accuracy": 90
	},
	"vine_whip": {
		"id": "vine_whip",
		"name": "Vine Whip",
		"type": "GRASS",
		"category": "physical",
		"power": 45,
		"pp": 25,
		"target": "single",
		"accuracy": 100
	},
	"poison_powder": {
		"id": "poison_powder",
		"name": "Poison Powder",
		"type": "POISON",
		"category": "status",
		"power": 0,
		"pp": 35,
		"target": "single",
		"status": "poison",
		"statusChance": 100,
		"accuracy": 75
	},
	"sleep_powder": {
		"id": "sleep_powder",
		"name": "Sleep Powder",
		"type": "GRASS",
		"category": "status",
		"power": 0,
		"pp": 15,
		"target": "single",
		"status": "sleep",
		"statusChance": 100,
		"accuracy": 75
	},
	"take_down": {
		"id": "take_down",
		"name": "Take Down",
		"type": "NORMAL",
		"category": "physical",
		"power": 90,
		"pp": 20,
		"target": "single",
		"drainPercent": -25,
		"accuracy": 85
	},
	"razor_leaf": {
		"id": "razor_leaf",
		"name": "Razor Leaf",
		"type": "GRASS",
		"category": "physical",
		"power": 55,
		"pp": 25,
		"target": "aoe",
		"critStages": 1,
		"accuracy": 95
	},
	"sweet_scent": {
		"id": "sweet_scent",
		"name": "Sweet Scent",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 20,
		"target": "aoe",
		"accuracy": 100
	},
	"growth": {
		"id": "growth",
		"name": "Growth",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 20,
		"target": "single",
		"statChanges": [{
			"stat": "atkFis",
			"estagios": 1
		}, {
			"stat": "atkEsp",
			"estagios": 1
		}],
		"statChance": 100,
		"statTarget": "self",
		"accuracy": 100
	},
	"double_edge": {
		"id": "double_edge",
		"name": "Double-Edge",
		"type": "NORMAL",
		"category": "physical",
		"power": 120,
		"pp": 15,
		"target": "single",
		"drainPercent": -33,
		"accuracy": 100
	},
	"worry_seed": {
		"id": "worry_seed",
		"name": "Worry Seed",
		"type": "GRASS",
		"category": "status",
		"power": 0,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"synthesis": {
		"id": "synthesis",
		"name": "Synthesis",
		"type": "GRASS",
		"category": "status",
		"power": 0,
		"pp": 5,
		"target": "single",
		"healPercent": 50,
		"accuracy": 100
	},
	"seed_bomb": {
		"id": "seed_bomb",
		"name": "Seed Bomb",
		"type": "GRASS",
		"category": "physical",
		"power": 80,
		"pp": 15,
		"target": "single",
		"accuracy": 100
	},
	"gust": {
		"id": "gust",
		"name": "Gust",
		"type": "FLYING",
		"category": "special",
		"power": 40,
		"pp": 35,
		"target": "single",
		"accuracy": 100
	},
	"powder_snow": {
		"id": "powder_snow",
		"name": "Powder Snow",
		"type": "ICE",
		"category": "special",
		"power": 40,
		"pp": 25,
		"target": "aoe",
		"status": "freeze",
		"statusChance": 10,
		"accuracy": 100
	},
	"mist": {
		"id": "mist",
		"name": "Mist",
		"type": "ICE",
		"category": "status",
		"power": 0,
		"pp": 30,
		"target": "single",
		"accuracy": 100
	},
	"ice_shard": {
		"id": "ice_shard",
		"name": "Ice Shard",
		"type": "ICE",
		"category": "physical",
		"power": 40,
		"pp": 30,
		"target": "single",
		"accuracy": 100
	},
	"mind_reader": {
		"id": "mind_reader",
		"name": "Mind Reader",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 5,
		"target": "single",
		"accuracy": 100
	},
	"ancient_power": {
		"id": "ancient_power",
		"name": "Ancient Power",
		"type": "ROCK",
		"category": "special",
		"power": 60,
		"pp": 5,
		"target": "single",
		"statChanges": [
			{
				"stat": "atkFis",
				"estagios": 1
			},
			{
				"stat": "def",
				"estagios": 1
			},
			{
				"stat": "atkEsp",
				"estagios": 1
			},
			{
				"stat": "defEsp",
				"estagios": 1
			},
			{
				"stat": "speed",
				"estagios": 1
			}
		],
		"statChance": 10,
		"accuracy": 100
	},
	"agility": {
		"id": "agility",
		"name": "Agility",
		"type": "PSYCHIC",
		"category": "status",
		"power": 0,
		"pp": 30,
		"target": "single",
		"statChanges": [{
			"stat": "speed",
			"estagios": 2
		}],
		"statChance": 100,
		"statTarget": "self",
		"accuracy": 100
	},
	"freeze_dry": {
		"id": "freeze_dry",
		"name": "Freeze-Dry",
		"type": "ICE",
		"category": "special",
		"power": 70,
		"pp": 20,
		"target": "single",
		"status": "freeze",
		"statusChance": 10,
		"accuracy": 100
	},
	"reflect": {
		"id": "reflect",
		"name": "Reflect",
		"type": "PSYCHIC",
		"category": "status",
		"power": 0,
		"pp": 20,
		"target": "single",
		"accuracy": 100
	},
	"hail": {
		"id": "hail",
		"name": "Hail",
		"type": "ICE",
		"category": "status",
		"power": 0,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"tailwind": {
		"id": "tailwind",
		"name": "Tailwind",
		"type": "FLYING",
		"category": "status",
		"power": 0,
		"pp": 15,
		"target": "single",
		"accuracy": 100
	},
	"ice_beam": {
		"id": "ice_beam",
		"name": "Ice Beam",
		"type": "ICE",
		"category": "special",
		"power": 90,
		"pp": 10,
		"target": "single",
		"status": "freeze",
		"statusChance": 10,
		"accuracy": 100
	},
	"blizzard": {
		"id": "blizzard",
		"name": "Blizzard",
		"type": "ICE",
		"category": "special",
		"power": 110,
		"pp": 5,
		"target": "aoe",
		"status": "freeze",
		"statusChance": 10,
		"accuracy": 70
	},
	"roost": {
		"id": "roost",
		"name": "Roost",
		"type": "FLYING",
		"category": "status",
		"power": 0,
		"pp": 5,
		"target": "single",
		"healPercent": 50,
		"accuracy": 100
	},
	"hurricane": {
		"id": "hurricane",
		"name": "Hurricane",
		"type": "FLYING",
		"category": "special",
		"power": 110,
		"pp": 10,
		"target": "single",
		"status": "confusion",
		"statusChance": 30,
		"accuracy": 70
	},
	"sheer_cold": {
		"id": "sheer_cold",
		"name": "Sheer Cold",
		"type": "ICE",
		"category": "special",
		"power": 0,
		"pp": 5,
		"target": "single",
		"accuracy": 30
	},
	"peck": {
		"id": "peck",
		"name": "Peck",
		"type": "FLYING",
		"category": "physical",
		"power": 35,
		"pp": 35,
		"target": "single",
		"accuracy": 100
	},
	"thunder_shock": {
		"id": "thunder_shock",
		"name": "Thunder Shock",
		"type": "ELECTRIC",
		"category": "special",
		"power": 40,
		"pp": 30,
		"target": "single",
		"status": "paralysis",
		"statusChance": 10,
		"accuracy": 100
	},
	"thunder_wave": {
		"id": "thunder_wave",
		"name": "Thunder Wave",
		"type": "ELECTRIC",
		"category": "status",
		"power": 0,
		"pp": 20,
		"target": "single",
		"status": "paralysis",
		"statusChance": 100,
		"accuracy": 90
	},
	"detect": {
		"id": "detect",
		"name": "Detect",
		"type": "FIGHTING",
		"category": "status",
		"power": 0,
		"pp": 5,
		"target": "single",
		"accuracy": 100
	},
	"pluck": {
		"id": "pluck",
		"name": "Pluck",
		"type": "FLYING",
		"category": "physical",
		"power": 60,
		"pp": 20,
		"target": "single",
		"accuracy": 100
	},
	"charge": {
		"id": "charge",
		"name": "Charge",
		"type": "ELECTRIC",
		"category": "status",
		"power": 0,
		"pp": 20,
		"target": "single",
		"statChanges": [{
			"stat": "defEsp",
			"estagios": 1
		}],
		"statChance": 100,
		"statTarget": "self",
		"accuracy": 100
	},
	"discharge": {
		"id": "discharge",
		"name": "Discharge",
		"type": "ELECTRIC",
		"category": "special",
		"power": 80,
		"pp": 15,
		"target": "aoe",
		"status": "paralysis",
		"statusChance": 30,
		"accuracy": 100
	},
	"light_screen": {
		"id": "light_screen",
		"name": "Light Screen",
		"type": "PSYCHIC",
		"category": "status",
		"power": 0,
		"pp": 30,
		"target": "single",
		"accuracy": 100
	},
	"drill_peck": {
		"id": "drill_peck",
		"name": "Drill Peck",
		"type": "FLYING",
		"category": "physical",
		"power": 80,
		"pp": 20,
		"target": "single",
		"accuracy": 100
	},
	"thunder": {
		"id": "thunder",
		"name": "Thunder",
		"type": "ELECTRIC",
		"category": "special",
		"power": 110,
		"pp": 10,
		"target": "single",
		"status": "paralysis",
		"statusChance": 30,
		"accuracy": 70
	},
	"magnetic_flux": {
		"id": "magnetic_flux",
		"name": "Magnetic Flux",
		"type": "ELECTRIC",
		"category": "status",
		"power": 0,
		"pp": 20,
		"target": "single",
		"statChanges": [{
			"stat": "def",
			"estagios": 1
		}, {
			"stat": "defEsp",
			"estagios": 1
		}],
		"statChance": 100,
		"statTarget": "self",
		"accuracy": 100
	},
	"zap_cannon": {
		"id": "zap_cannon",
		"name": "Zap Cannon",
		"type": "ELECTRIC",
		"category": "special",
		"power": 120,
		"pp": 5,
		"target": "single",
		"status": "paralysis",
		"statusChance": 100,
		"accuracy": 50
	},
	"wing_attack": {
		"id": "wing_attack",
		"name": "Wing Attack",
		"type": "FLYING",
		"category": "physical",
		"power": 60,
		"pp": 35,
		"target": "single",
		"accuracy": 100
	},
	"endure": {
		"id": "endure",
		"name": "Endure",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"safeguard": {
		"id": "safeguard",
		"name": "Safeguard",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 25,
		"target": "single",
		"accuracy": 100
	},
	"air_slash": {
		"id": "air_slash",
		"name": "Air Slash",
		"type": "FLYING",
		"category": "special",
		"power": 75,
		"pp": 15,
		"target": "single",
		"flinchChance": 30,
		"accuracy": 95
	},
	"sunny_day": {
		"id": "sunny_day",
		"name": "Sunny Day",
		"type": "FIRE",
		"category": "status",
		"power": 0,
		"pp": 5,
		"target": "single",
		"accuracy": 100
	},
	"heat_wave": {
		"id": "heat_wave",
		"name": "Heat Wave",
		"type": "FIRE",
		"category": "special",
		"power": 95,
		"pp": 10,
		"target": "aoe",
		"status": "burn",
		"statusChance": 10,
		"accuracy": 90
	},
	"solar_beam": {
		"id": "solar_beam",
		"name": "Solar Beam",
		"type": "GRASS",
		"category": "special",
		"power": 120,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"sky_attack": {
		"id": "sky_attack",
		"name": "Sky Attack",
		"type": "FLYING",
		"category": "physical",
		"power": 140,
		"pp": 5,
		"target": "single",
		"flinchChance": 30,
		"critStages": 1,
		"accuracy": 90
	},
	"burn_up": {
		"id": "burn_up",
		"name": "Burn Up",
		"type": "FIRE",
		"category": "special",
		"power": 130,
		"pp": 5,
		"target": "single",
		"accuracy": 100
	},
	"extrasensory": {
		"id": "extrasensory",
		"name": "Extrasensory",
		"type": "PSYCHIC",
		"category": "special",
		"power": 80,
		"pp": 20,
		"target": "single",
		"flinchChance": 10,
		"accuracy": 100
	},
	"leer": {
		"id": "leer",
		"name": "Leer",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 30,
		"target": "aoe",
		"statChanges": [{
			"stat": "def",
			"estagios": -1
		}],
		"statChance": 100,
		"accuracy": 100
	},
	"roar": {
		"id": "roar",
		"name": "Roar",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 20,
		"target": "single",
		"accuracy": 100
	},
	"quick_attack": {
		"id": "quick_attack",
		"name": "Quick Attack",
		"type": "NORMAL",
		"category": "physical",
		"power": 40,
		"pp": 30,
		"target": "single",
		"accuracy": 100
	},
	"spark": {
		"id": "spark",
		"name": "Spark",
		"type": "ELECTRIC",
		"category": "physical",
		"power": 65,
		"pp": 20,
		"target": "single",
		"status": "paralysis",
		"statusChance": 30,
		"accuracy": 100
	},
	"crunch": {
		"id": "crunch",
		"name": "Crunch",
		"type": "DARK",
		"category": "physical",
		"power": 80,
		"pp": 15,
		"target": "single",
		"statChanges": [{
			"stat": "def",
			"estagios": -1
		}],
		"statChance": 20,
		"accuracy": 100
	},
	"thunder_fang": {
		"id": "thunder_fang",
		"name": "Thunder Fang",
		"type": "ELECTRIC",
		"category": "physical",
		"power": 65,
		"pp": 15,
		"target": "single",
		"status": "paralysis",
		"statusChance": 10,
		"flinchChance": 10,
		"accuracy": 95
	},
	"calm_mind": {
		"id": "calm_mind",
		"name": "Calm Mind",
		"type": "PSYCHIC",
		"category": "status",
		"power": 0,
		"pp": 20,
		"target": "single",
		"statChanges": [{
			"stat": "atkEsp",
			"estagios": 1
		}, {
			"stat": "defEsp",
			"estagios": 1
		}],
		"statChance": 100,
		"statTarget": "self",
		"accuracy": 100
	},
	"eruption": {
		"id": "eruption",
		"name": "Eruption",
		"type": "FIRE",
		"category": "special",
		"power": 150,
		"pp": 5,
		"target": "aoe",
		"accuracy": 100
	},
	"lava_plume": {
		"id": "lava_plume",
		"name": "Lava Plume",
		"type": "FIRE",
		"category": "special",
		"power": 80,
		"pp": 15,
		"target": "aoe",
		"status": "burn",
		"statusChance": 30,
		"accuracy": 100
	},
	"sacred_fire": {
		"id": "sacred_fire",
		"name": "Sacred Fire",
		"type": "FIRE",
		"category": "physical",
		"power": 100,
		"pp": 5,
		"target": "single",
		"status": "burn",
		"statusChance": 50,
		"accuracy": 95
	},
	"stomp": {
		"id": "stomp",
		"name": "Stomp",
		"type": "NORMAL",
		"category": "physical",
		"power": 65,
		"pp": 20,
		"target": "single",
		"flinchChance": 30,
		"accuracy": 100
	},
	"swagger": {
		"id": "swagger",
		"name": "Swagger",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 15,
		"target": "single",
		"status": "confusion",
		"statusChance": 100,
		"statChanges": [{
			"stat": "atkFis",
			"estagios": 2
		}],
		"statChance": 100,
		"accuracy": 85
	},
	"fire_blast": {
		"id": "fire_blast",
		"name": "Fire Blast",
		"type": "FIRE",
		"category": "special",
		"power": 110,
		"pp": 5,
		"target": "single",
		"status": "burn",
		"statusChance": 10,
		"accuracy": 85
	},
	"bubble_beam": {
		"id": "bubble_beam",
		"name": "Bubble Beam",
		"type": "WATER",
		"category": "special",
		"power": 65,
		"pp": 20,
		"target": "single",
		"statChanges": [{
			"stat": "speed",
			"estagios": -1
		}],
		"statChance": 10,
		"accuracy": 100
	},
	"aurora_beam": {
		"id": "aurora_beam",
		"name": "Aurora Beam",
		"type": "ICE",
		"category": "special",
		"power": 65,
		"pp": 20,
		"target": "single",
		"statChanges": [{
			"stat": "atkFis",
			"estagios": -1
		}],
		"statChance": 10,
		"accuracy": 100
	},
	"mirror_coat": {
		"id": "mirror_coat",
		"name": "Mirror Coat",
		"type": "PSYCHIC",
		"category": "special",
		"power": 0,
		"pp": 20,
		"target": "single",
		"accuracy": 100
	},
	"ice_fang": {
		"id": "ice_fang",
		"name": "Ice Fang",
		"type": "ICE",
		"category": "physical",
		"power": 65,
		"pp": 15,
		"target": "single",
		"status": "freeze",
		"statusChance": 10,
		"flinchChance": 10,
		"accuracy": 95
	},
	"weather_ball": {
		"id": "weather_ball",
		"name": "Weather Ball",
		"type": "NORMAL",
		"category": "special",
		"power": 50,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"whirlwind": {
		"id": "whirlwind",
		"name": "Whirlwind",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 20,
		"target": "single",
		"accuracy": 100
	},
	"dragon_rush": {
		"id": "dragon_rush",
		"name": "Dragon Rush",
		"type": "DRAGON",
		"category": "physical",
		"power": 100,
		"pp": 10,
		"target": "single",
		"flinchChance": 20,
		"accuracy": 75
	},
	"aeroblast": {
		"id": "aeroblast",
		"name": "Aeroblast",
		"type": "FLYING",
		"category": "special",
		"power": 100,
		"pp": 5,
		"target": "single",
		"critStages": 1,
		"accuracy": 95
	},
	"punishment": {
		"id": "punishment",
		"name": "Punishment",
		"type": "DARK",
		"category": "physical",
		"power": 0,
		"pp": 5,
		"target": "single",
		"accuracy": 100
	},
	"recover": {
		"id": "recover",
		"name": "Recover",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 5,
		"target": "single",
		"healPercent": 50,
		"accuracy": 100
	},
	"future_sight": {
		"id": "future_sight",
		"name": "Future Sight",
		"type": "PSYCHIC",
		"category": "special",
		"power": 120,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"natural_gift": {
		"id": "natural_gift",
		"name": "Natural Gift",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 15,
		"target": "single",
		"accuracy": 100
	},
	"brave_bird": {
		"id": "brave_bird",
		"name": "Brave Bird",
		"type": "FLYING",
		"category": "physical",
		"power": 120,
		"pp": 15,
		"target": "single",
		"drainPercent": -33,
		"accuracy": 100
	},
	"confusion": {
		"id": "confusion",
		"name": "Confusion",
		"type": "PSYCHIC",
		"category": "special",
		"power": 50,
		"pp": 25,
		"target": "single",
		"status": "confusion",
		"statusChance": 10,
		"accuracy": 100
	},
	"heal_bell": {
		"id": "heal_bell",
		"name": "Heal Bell",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 5,
		"target": "single",
		"accuracy": 100
	},
	"magical_leaf": {
		"id": "magical_leaf",
		"name": "Magical Leaf",
		"type": "GRASS",
		"category": "special",
		"power": 60,
		"pp": 20,
		"target": "single",
		"accuracy": 100
	},
	"baton_pass": {
		"id": "baton_pass",
		"name": "Baton Pass",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 40,
		"target": "single",
		"accuracy": 100
	},
	"heal_block": {
		"id": "heal_block",
		"name": "Heal Block",
		"type": "PSYCHIC",
		"category": "status",
		"power": 0,
		"pp": 15,
		"target": "aoe",
		"accuracy": 100
	},
	"healing_wish": {
		"id": "healing_wish",
		"name": "Healing Wish",
		"type": "PSYCHIC",
		"category": "status",
		"power": 0,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"leaf_storm": {
		"id": "leaf_storm",
		"name": "Leaf Storm",
		"type": "GRASS",
		"category": "special",
		"power": 130,
		"pp": 5,
		"target": "single",
		"statChanges": [{
			"stat": "atkEsp",
			"estagios": -2
		}],
		"statChance": 100,
		"accuracy": 90
	},
	"perish_song": {
		"id": "perish_song",
		"name": "Perish Song",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 5,
		"target": "single",
		"accuracy": 100
	},
	"disable": {
		"id": "disable",
		"name": "Disable",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 20,
		"target": "single",
		"accuracy": 100
	},
	"laser_focus": {
		"id": "laser_focus",
		"name": "Laser Focus",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 30,
		"target": "single",
		"accuracy": 100
	},
	"psywave": {
		"id": "psywave",
		"name": "Psywave",
		"type": "PSYCHIC",
		"category": "special",
		"power": 0,
		"pp": 15,
		"target": "single",
		"accuracy": 100
	},
	"swift": {
		"id": "swift",
		"name": "Swift",
		"type": "NORMAL",
		"category": "special",
		"power": 60,
		"pp": 20,
		"target": "aoe",
		"accuracy": 100
	},
	"psych_up": {
		"id": "psych_up",
		"name": "Psych Up",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"miracle_eye": {
		"id": "miracle_eye",
		"name": "Miracle Eye",
		"type": "PSYCHIC",
		"category": "status",
		"power": 0,
		"pp": 40,
		"target": "single",
		"accuracy": 100
	},
	"psycho_cut": {
		"id": "psycho_cut",
		"name": "Psycho Cut",
		"type": "PSYCHIC",
		"category": "physical",
		"power": 70,
		"pp": 20,
		"target": "single",
		"critStages": 1,
		"accuracy": 100
	},
	"guard_swap": {
		"id": "guard_swap",
		"name": "Guard Swap",
		"type": "PSYCHIC",
		"category": "status",
		"power": 0,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"power_swap": {
		"id": "power_swap",
		"name": "Power Swap",
		"type": "PSYCHIC",
		"category": "status",
		"power": 0,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"psychic": {
		"id": "psychic",
		"name": "Psychic",
		"type": "PSYCHIC",
		"category": "special",
		"power": 90,
		"pp": 10,
		"target": "single",
		"statChanges": [{
			"stat": "defEsp",
			"estagios": -1
		}],
		"statChance": 10,
		"accuracy": 100
	},
	"barrier": {
		"id": "barrier",
		"name": "Barrier",
		"type": "PSYCHIC",
		"category": "status",
		"power": 0,
		"pp": 20,
		"target": "single",
		"statChanges": [{
			"stat": "def",
			"estagios": 2
		}],
		"statChance": 100,
		"statTarget": "self",
		"accuracy": 100
	},
	"aura_sphere": {
		"id": "aura_sphere",
		"name": "Aura Sphere",
		"type": "FIGHTING",
		"category": "special",
		"power": 80,
		"pp": 20,
		"target": "single",
		"accuracy": 100
	},
	"amnesia": {
		"id": "amnesia",
		"name": "Amnesia",
		"type": "PSYCHIC",
		"category": "status",
		"power": 0,
		"pp": 20,
		"target": "single",
		"statChanges": [{
			"stat": "defEsp",
			"estagios": 2
		}],
		"statChance": 100,
		"statTarget": "self",
		"accuracy": 100
	},
	"me_first": {
		"id": "me_first",
		"name": "Me First",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 20,
		"target": "single",
		"accuracy": 100
	},
	"psystrike": {
		"id": "psystrike",
		"name": "Psystrike",
		"type": "PSYCHIC",
		"category": "special",
		"power": 100,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"pound": {
		"id": "pound",
		"name": "Pound",
		"type": "NORMAL",
		"category": "physical",
		"power": 40,
		"pp": 35,
		"target": "single",
		"accuracy": 100
	},
	"reflect_type": {
		"id": "reflect_type",
		"name": "Reflect Type",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 15,
		"target": "single",
		"accuracy": 100
	},
	"transform": {
		"id": "transform",
		"name": "Transform",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"mega_punch": {
		"id": "mega_punch",
		"name": "Mega Punch",
		"type": "NORMAL",
		"category": "physical",
		"power": 80,
		"pp": 20,
		"target": "single",
		"accuracy": 85
	},
	"metronome": {
		"id": "metronome",
		"name": "Metronome",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"nasty_plot": {
		"id": "nasty_plot",
		"name": "Nasty Plot",
		"type": "DARK",
		"category": "status",
		"power": 0,
		"pp": 20,
		"target": "single",
		"statChanges": [{
			"stat": "atkEsp",
			"estagios": 2
		}],
		"statChance": 100,
		"statTarget": "self",
		"accuracy": 100
	},
	"defense_curl": {
		"id": "defense_curl",
		"name": "Defense Curl",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 40,
		"target": "single",
		"statChanges": [{
			"stat": "def",
			"estagios": 1
		}],
		"statChance": 100,
		"statTarget": "self",
		"accuracy": 100
	},
	"mud_sport": {
		"id": "mud_sport",
		"name": "Mud Sport",
		"type": "GROUND",
		"category": "status",
		"power": 0,
		"pp": 15,
		"target": "single",
		"accuracy": 100
	},
	"rock_polish": {
		"id": "rock_polish",
		"name": "Rock Polish",
		"type": "ROCK",
		"category": "status",
		"power": 0,
		"pp": 20,
		"target": "single",
		"statChanges": [{
			"stat": "speed",
			"estagios": 2
		}],
		"statChance": 100,
		"statTarget": "self",
		"accuracy": 100
	},
	"rollout": {
		"id": "rollout",
		"name": "Rollout",
		"type": "ROCK",
		"category": "physical",
		"power": 30,
		"pp": 20,
		"target": "single",
		"accuracy": 90
	},
	"magnitude": {
		"id": "magnitude",
		"name": "Magnitude",
		"type": "GROUND",
		"category": "physical",
		"power": 0,
		"pp": 30,
		"target": "aoe",
		"accuracy": 100
	},
	"rock_throw": {
		"id": "rock_throw",
		"name": "Rock Throw",
		"type": "ROCK",
		"category": "physical",
		"power": 50,
		"pp": 15,
		"target": "single",
		"accuracy": 90
	},
	"smack_down": {
		"id": "smack_down",
		"name": "Smack Down",
		"type": "ROCK",
		"category": "physical",
		"power": 50,
		"pp": 15,
		"target": "single",
		"accuracy": 100
	},
	"bulldoze": {
		"id": "bulldoze",
		"name": "Bulldoze",
		"type": "GROUND",
		"category": "physical",
		"power": 60,
		"pp": 20,
		"target": "aoe",
		"statChanges": [{
			"stat": "speed",
			"estagios": -1
		}],
		"statChance": 100,
		"accuracy": 100
	},
	"self_destruct": {
		"id": "self_destruct",
		"name": "Self-Destruct",
		"type": "NORMAL",
		"category": "physical",
		"power": 200,
		"pp": 5,
		"target": "aoe",
		"accuracy": 100
	},
	"stealth_rock": {
		"id": "stealth_rock",
		"name": "Stealth Rock",
		"type": "ROCK",
		"category": "status",
		"power": 0,
		"pp": 20,
		"target": "single",
		"accuracy": 100
	},
	"rock_blast": {
		"id": "rock_blast",
		"name": "Rock Blast",
		"type": "ROCK",
		"category": "physical",
		"power": 25,
		"pp": 10,
		"target": "single",
		"accuracy": 90
	},
	"earthquake": {
		"id": "earthquake",
		"name": "Earthquake",
		"type": "GROUND",
		"category": "physical",
		"power": 100,
		"pp": 10,
		"target": "aoe",
		"accuracy": 100
	},
	"explosion": {
		"id": "explosion",
		"name": "Explosion",
		"type": "NORMAL",
		"category": "physical",
		"power": 250,
		"pp": 5,
		"target": "aoe",
		"accuracy": 100
	},
	"stone_edge": {
		"id": "stone_edge",
		"name": "Stone Edge",
		"type": "ROCK",
		"category": "physical",
		"power": 100,
		"pp": 5,
		"target": "single",
		"critStages": 1,
		"accuracy": 80
	},
	"pursuit": {
		"id": "pursuit",
		"name": "Pursuit",
		"type": "DARK",
		"category": "physical",
		"power": 40,
		"pp": 20,
		"target": "single",
		"accuracy": 100
	},
	"fury_attack": {
		"id": "fury_attack",
		"name": "Fury Attack",
		"type": "NORMAL",
		"category": "physical",
		"power": 15,
		"pp": 20,
		"target": "single",
		"accuracy": 85
	},
	"aerial_ace": {
		"id": "aerial_ace",
		"name": "Aerial Ace",
		"type": "FLYING",
		"category": "physical",
		"power": 60,
		"pp": 20,
		"target": "single",
		"accuracy": 100
	},
	"mirror_move": {
		"id": "mirror_move",
		"name": "Mirror Move",
		"type": "FLYING",
		"category": "status",
		"power": 0,
		"pp": 20,
		"target": "single",
		"accuracy": 100
	},
	"assurance": {
		"id": "assurance",
		"name": "Assurance",
		"type": "DARK",
		"category": "physical",
		"power": 60,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"focus_energy": {
		"id": "focus_energy",
		"name": "Focus Energy",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 30,
		"target": "single",
		"accuracy": 100
	},
	"hyper_fang": {
		"id": "hyper_fang",
		"name": "Hyper Fang",
		"type": "NORMAL",
		"category": "physical",
		"power": 80,
		"pp": 15,
		"target": "single",
		"flinchChance": 10,
		"accuracy": 90
	},
	"sucker_punch": {
		"id": "sucker_punch",
		"name": "Sucker Punch",
		"type": "DARK",
		"category": "physical",
		"power": 70,
		"pp": 5,
		"target": "single",
		"accuracy": 100
	},
	"super_fang": {
		"id": "super_fang",
		"name": "Super Fang",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 10,
		"target": "single",
		"accuracy": 90
	},
	"endeavor": {
		"id": "endeavor",
		"name": "Endeavor",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 5,
		"target": "single",
		"accuracy": 100
	},
	"petal_dance": {
		"id": "petal_dance",
		"name": "Petal Dance",
		"type": "GRASS",
		"category": "special",
		"power": 120,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"petal_blizzard": {
		"id": "petal_blizzard",
		"name": "Petal Blizzard",
		"type": "GRASS",
		"category": "physical",
		"power": 90,
		"pp": 15,
		"target": "aoe",
		"accuracy": 100
	},
	"absorb": {
		"id": "absorb",
		"name": "Absorb",
		"type": "GRASS",
		"category": "special",
		"power": 20,
		"pp": 25,
		"target": "single",
		"drainPercent": 50,
		"accuracy": 100
	},
	"acid": {
		"id": "acid",
		"name": "Acid",
		"type": "POISON",
		"category": "special",
		"power": 40,
		"pp": 30,
		"target": "aoe",
		"statChanges": [{
			"stat": "defEsp",
			"estagios": -1
		}],
		"statChance": 10,
		"accuracy": 100
	},
	"stun_spore": {
		"id": "stun_spore",
		"name": "Stun Spore",
		"type": "GRASS",
		"category": "status",
		"power": 0,
		"pp": 30,
		"target": "single",
		"status": "paralysis",
		"statusChance": 100,
		"accuracy": 75
	},
	"mega_drain": {
		"id": "mega_drain",
		"name": "Mega Drain",
		"type": "GRASS",
		"category": "special",
		"power": 40,
		"pp": 15,
		"target": "single",
		"drainPercent": 50,
		"accuracy": 100
	},
	"lucky_chant": {
		"id": "lucky_chant",
		"name": "Lucky Chant",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 30,
		"target": "single",
		"accuracy": 100
	},
	"moonlight": {
		"id": "moonlight",
		"name": "Moonlight",
		"type": "FAIRY",
		"category": "status",
		"power": 0,
		"pp": 5,
		"target": "single",
		"healPercent": 50,
		"accuracy": 100
	},
	"giga_drain": {
		"id": "giga_drain",
		"name": "Giga Drain",
		"type": "GRASS",
		"category": "special",
		"power": 75,
		"pp": 10,
		"target": "single",
		"drainPercent": 50,
		"accuracy": 100
	},
	"toxic": {
		"id": "toxic",
		"name": "Toxic",
		"type": "POISON",
		"category": "status",
		"power": 0,
		"pp": 10,
		"target": "single",
		"status": "poison",
		"statusChance": 100,
		"accuracy": 90
	},
	"moonblast": {
		"id": "moonblast",
		"name": "Moonblast",
		"type": "FAIRY",
		"category": "special",
		"power": 95,
		"pp": 15,
		"target": "single",
		"statChanges": [{
			"stat": "atkEsp",
			"estagios": -1
		}],
		"statChance": 30,
		"accuracy": 100
	},
	"grassy_terrain": {
		"id": "grassy_terrain",
		"name": "Grassy Terrain",
		"type": "GRASS",
		"category": "status",
		"power": 0,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"wrap": {
		"id": "wrap",
		"name": "Wrap",
		"type": "NORMAL",
		"category": "physical",
		"power": 15,
		"pp": 20,
		"target": "single",
		"accuracy": 90
	},
	"knock_off": {
		"id": "knock_off",
		"name": "Knock Off",
		"type": "DARK",
		"category": "physical",
		"power": 65,
		"pp": 20,
		"target": "single",
		"accuracy": 100
	},
	"gastro_acid": {
		"id": "gastro_acid",
		"name": "Gastro Acid",
		"type": "POISON",
		"category": "status",
		"power": 0,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"poison_jab": {
		"id": "poison_jab",
		"name": "Poison Jab",
		"type": "POISON",
		"category": "physical",
		"power": 80,
		"pp": 20,
		"target": "single",
		"status": "poison",
		"statusChance": 30,
		"accuracy": 100
	},
	"slam": {
		"id": "slam",
		"name": "Slam",
		"type": "NORMAL",
		"category": "physical",
		"power": 80,
		"pp": 20,
		"target": "single",
		"accuracy": 75
	},
	"wring_out": {
		"id": "wring_out",
		"name": "Wring Out",
		"type": "NORMAL",
		"category": "special",
		"power": 0,
		"pp": 5,
		"target": "single",
		"accuracy": 100
	},
	"leaf_tornado": {
		"id": "leaf_tornado",
		"name": "Leaf Tornado",
		"type": "GRASS",
		"category": "special",
		"power": 65,
		"pp": 10,
		"target": "single",
		"accuracy": 90
	},
	"spit_up": {
		"id": "spit_up",
		"name": "Spit Up",
		"type": "NORMAL",
		"category": "special",
		"power": 0,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"stockpile": {
		"id": "stockpile",
		"name": "Stockpile",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 20,
		"target": "single",
		"statChanges": [{
			"stat": "def",
			"estagios": 1
		}, {
			"stat": "defEsp",
			"estagios": 1
		}],
		"statChance": 100,
		"statTarget": "self",
		"accuracy": 100
	},
	"swallow": {
		"id": "swallow",
		"name": "Swallow",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 10,
		"target": "single",
		"healPercent": 25,
		"accuracy": 100
	},
	"leaf_blade": {
		"id": "leaf_blade",
		"name": "Leaf Blade",
		"type": "GRASS",
		"category": "physical",
		"power": 90,
		"pp": 15,
		"target": "single",
		"critStages": 1,
		"accuracy": 100
	},
	"barrage": {
		"id": "barrage",
		"name": "Barrage",
		"type": "NORMAL",
		"category": "physical",
		"power": 15,
		"pp": 20,
		"target": "single",
		"accuracy": 85
	},
	"hypnosis": {
		"id": "hypnosis",
		"name": "Hypnosis",
		"type": "PSYCHIC",
		"category": "status",
		"power": 0,
		"pp": 20,
		"target": "single",
		"status": "sleep",
		"statusChance": 100,
		"accuracy": 60
	},
	"uproar": {
		"id": "uproar",
		"name": "Uproar",
		"type": "NORMAL",
		"category": "special",
		"power": 90,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"bullet_seed": {
		"id": "bullet_seed",
		"name": "Bullet Seed",
		"type": "GRASS",
		"category": "physical",
		"power": 25,
		"pp": 30,
		"target": "single",
		"accuracy": 100
	},
	"bestow": {
		"id": "bestow",
		"name": "Bestow",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 15,
		"target": "single",
		"accuracy": 100
	},
	"constrict": {
		"id": "constrict",
		"name": "Constrict",
		"type": "NORMAL",
		"category": "physical",
		"power": 10,
		"pp": 35,
		"target": "single",
		"statChanges": [{
			"stat": "speed",
			"estagios": -1
		}],
		"statChance": 10,
		"accuracy": 100
	},
	"ingrain": {
		"id": "ingrain",
		"name": "Ingrain",
		"type": "GRASS",
		"category": "status",
		"power": 0,
		"pp": 20,
		"target": "single",
		"accuracy": 100
	},
	"bind": {
		"id": "bind",
		"name": "Bind",
		"type": "NORMAL",
		"category": "physical",
		"power": 15,
		"pp": 20,
		"target": "single",
		"accuracy": 85
	},
	"tickle": {
		"id": "tickle",
		"name": "Tickle",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 20,
		"target": "single",
		"statChanges": [{
			"stat": "atkFis",
			"estagios": -1
		}, {
			"stat": "def",
			"estagios": -1
		}],
		"statChance": 100,
		"accuracy": 100
	},
	"power_whip": {
		"id": "power_whip",
		"name": "Power Whip",
		"type": "GRASS",
		"category": "physical",
		"power": 120,
		"pp": 10,
		"target": "single",
		"accuracy": 85
	},
	"body_slam": {
		"id": "body_slam",
		"name": "Body Slam",
		"type": "NORMAL",
		"category": "physical",
		"power": 85,
		"pp": 15,
		"target": "single",
		"status": "paralysis",
		"statusChance": 30,
		"accuracy": 100
	},
	"aromatherapy": {
		"id": "aromatherapy",
		"name": "Aromatherapy",
		"type": "GRASS",
		"category": "status",
		"power": 0,
		"pp": 5,
		"target": "single",
		"accuracy": 100
	},
	"splash": {
		"id": "splash",
		"name": "Splash",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 40,
		"target": "single",
		"accuracy": 100
	},
	"fairy_wind": {
		"id": "fairy_wind",
		"name": "Fairy Wind",
		"type": "FAIRY",
		"category": "special",
		"power": 40,
		"pp": 30,
		"target": "single",
		"accuracy": 100
	},
	"acrobatics": {
		"id": "acrobatics",
		"name": "Acrobatics",
		"type": "FLYING",
		"category": "physical",
		"power": 55,
		"pp": 15,
		"target": "single",
		"accuracy": 100
	},
	"rage_powder": {
		"id": "rage_powder",
		"name": "Rage Powder",
		"type": "BUG",
		"category": "status",
		"power": 0,
		"pp": 20,
		"target": "single",
		"accuracy": 100
	},
	"cotton_spore": {
		"id": "cotton_spore",
		"name": "Cotton Spore",
		"type": "GRASS",
		"category": "status",
		"power": 0,
		"pp": 40,
		"target": "aoe",
		"statChanges": [{
			"stat": "speed",
			"estagios": -2
		}],
		"statChance": 100,
		"accuracy": 100
	},
	"u_turn": {
		"id": "u_turn",
		"name": "U-turn",
		"type": "BUG",
		"category": "physical",
		"power": 70,
		"pp": 20,
		"target": "single",
		"accuracy": 100
	},
	"bounce": {
		"id": "bounce",
		"name": "Bounce",
		"type": "FLYING",
		"category": "physical",
		"power": 85,
		"pp": 5,
		"target": "single",
		"status": "paralysis",
		"statusChance": 30,
		"accuracy": 85
	},
	"memento": {
		"id": "memento",
		"name": "Memento",
		"type": "DARK",
		"category": "status",
		"power": 0,
		"pp": 10,
		"target": "single",
		"statChanges": [{
			"stat": "atkFis",
			"estagios": -2
		}, {
			"stat": "atkEsp",
			"estagios": -2
		}],
		"statChance": 100,
		"accuracy": 100
	},
	"grass_whistle": {
		"id": "grass_whistle",
		"name": "Grass Whistle",
		"type": "GRASS",
		"category": "status",
		"power": 0,
		"pp": 15,
		"target": "single",
		"status": "sleep",
		"statusChance": 100,
		"accuracy": 55
	},
	"flower_shield": {
		"id": "flower_shield",
		"name": "Flower Shield",
		"type": "FAIRY",
		"category": "status",
		"power": 0,
		"pp": 10,
		"target": "single",
		"statChanges": [{
			"stat": "def",
			"estagios": 1
		}],
		"statChance": 100,
		"accuracy": 100
	},
	"string_shot": {
		"id": "string_shot",
		"name": "String Shot",
		"type": "BUG",
		"category": "status",
		"power": 0,
		"pp": 40,
		"target": "aoe",
		"statChanges": [{
			"stat": "speed",
			"estagios": -2
		}],
		"statChance": 100,
		"accuracy": 95
	},
	"bug_bite": {
		"id": "bug_bite",
		"name": "Bug Bite",
		"type": "BUG",
		"category": "physical",
		"power": 60,
		"pp": 20,
		"target": "single",
		"accuracy": 100
	},
	"harden": {
		"id": "harden",
		"name": "Harden",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 30,
		"target": "single",
		"statChanges": [{
			"stat": "def",
			"estagios": 1
		}],
		"statChance": 100,
		"statTarget": "self",
		"accuracy": 100
	},
	"psybeam": {
		"id": "psybeam",
		"name": "Psybeam",
		"type": "PSYCHIC",
		"category": "special",
		"power": 65,
		"pp": 20,
		"target": "single",
		"status": "confusion",
		"statusChance": 10,
		"accuracy": 100
	},
	"silver_wind": {
		"id": "silver_wind",
		"name": "Silver Wind",
		"type": "BUG",
		"category": "special",
		"power": 60,
		"pp": 5,
		"target": "single",
		"statChanges": [
			{
				"stat": "atkFis",
				"estagios": 1
			},
			{
				"stat": "def",
				"estagios": 1
			},
			{
				"stat": "atkEsp",
				"estagios": 1
			},
			{
				"stat": "defEsp",
				"estagios": 1
			},
			{
				"stat": "speed",
				"estagios": 1
			}
		],
		"statChance": 10,
		"accuracy": 100
	},
	"supersonic": {
		"id": "supersonic",
		"name": "Supersonic",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 20,
		"target": "single",
		"status": "confusion",
		"statusChance": 100,
		"accuracy": 55
	},
	"bug_buzz": {
		"id": "bug_buzz",
		"name": "Bug Buzz",
		"type": "BUG",
		"category": "special",
		"power": 90,
		"pp": 10,
		"target": "single",
		"statChanges": [{
			"stat": "defEsp",
			"estagios": -1
		}],
		"statChance": 10,
		"accuracy": 100
	},
	"captivate": {
		"id": "captivate",
		"name": "Captivate",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 20,
		"target": "aoe",
		"statChanges": [{
			"stat": "atkEsp",
			"estagios": -2
		}],
		"statChance": 100,
		"accuracy": 100
	},
	"quiver_dance": {
		"id": "quiver_dance",
		"name": "Quiver Dance",
		"type": "BUG",
		"category": "status",
		"power": 0,
		"pp": 20,
		"target": "single",
		"statChanges": [
			{
				"stat": "atkEsp",
				"estagios": 1
			},
			{
				"stat": "defEsp",
				"estagios": 1
			},
			{
				"stat": "speed",
				"estagios": 1
			}
		],
		"statChance": 100,
		"statTarget": "self",
		"accuracy": 100
	},
	"poison_sting": {
		"id": "poison_sting",
		"name": "Poison Sting",
		"type": "POISON",
		"category": "physical",
		"power": 15,
		"pp": 35,
		"target": "single",
		"status": "poison",
		"statusChance": 30,
		"accuracy": 100
	},
	"twineedle": {
		"id": "twineedle",
		"name": "Twineedle",
		"type": "BUG",
		"category": "physical",
		"power": 25,
		"pp": 20,
		"target": "single",
		"status": "poison",
		"statusChance": 20,
		"accuracy": 100
	},
	"rage": {
		"id": "rage",
		"name": "Rage",
		"type": "NORMAL",
		"category": "physical",
		"power": 20,
		"pp": 20,
		"target": "single",
		"accuracy": 100
	},
	"venoshock": {
		"id": "venoshock",
		"name": "Venoshock",
		"type": "POISON",
		"category": "special",
		"power": 65,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"toxic_spikes": {
		"id": "toxic_spikes",
		"name": "Toxic Spikes",
		"type": "POISON",
		"category": "status",
		"power": 0,
		"pp": 20,
		"target": "single",
		"accuracy": 100
	},
	"pin_missile": {
		"id": "pin_missile",
		"name": "Pin Missile",
		"type": "BUG",
		"category": "physical",
		"power": 25,
		"pp": 20,
		"target": "single",
		"accuracy": 95
	},
	"fell_stinger": {
		"id": "fell_stinger",
		"name": "Fell Stinger",
		"type": "BUG",
		"category": "physical",
		"power": 50,
		"pp": 25,
		"target": "single",
		"accuracy": 100
	},
	"fury_cutter": {
		"id": "fury_cutter",
		"name": "Fury Cutter",
		"type": "BUG",
		"category": "physical",
		"power": 40,
		"pp": 20,
		"target": "single",
		"accuracy": 95
	},
	"spore": {
		"id": "spore",
		"name": "Spore",
		"type": "GRASS",
		"category": "status",
		"power": 0,
		"pp": 15,
		"target": "single",
		"status": "sleep",
		"statusChance": 100,
		"accuracy": 100
	},
	"x_scissor": {
		"id": "x_scissor",
		"name": "X-Scissor",
		"type": "BUG",
		"category": "physical",
		"power": 80,
		"pp": 15,
		"target": "single",
		"accuracy": 100
	},
	"cross_poison": {
		"id": "cross_poison",
		"name": "Cross Poison",
		"type": "POISON",
		"category": "physical",
		"power": 70,
		"pp": 20,
		"target": "single",
		"status": "poison",
		"statusChance": 10,
		"critStages": 1,
		"accuracy": 100
	},
	"foresight": {
		"id": "foresight",
		"name": "Foresight",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 40,
		"target": "single",
		"accuracy": 100
	},
	"signal_beam": {
		"id": "signal_beam",
		"name": "Signal Beam",
		"type": "BUG",
		"category": "special",
		"power": 75,
		"pp": 15,
		"target": "single",
		"status": "confusion",
		"statusChance": 10,
		"accuracy": 100
	},
	"leech_life": {
		"id": "leech_life",
		"name": "Leech Life",
		"type": "BUG",
		"category": "physical",
		"power": 80,
		"pp": 10,
		"target": "single",
		"drainPercent": 50,
		"accuracy": 100
	},
	"zen_headbutt": {
		"id": "zen_headbutt",
		"name": "Zen Headbutt",
		"type": "PSYCHIC",
		"category": "physical",
		"power": 80,
		"pp": 15,
		"target": "single",
		"flinchChance": 20,
		"accuracy": 90
	},
	"poison_fang": {
		"id": "poison_fang",
		"name": "Poison Fang",
		"type": "POISON",
		"category": "physical",
		"power": 50,
		"pp": 15,
		"target": "single",
		"status": "poison",
		"statusChance": 50,
		"accuracy": 100
	},
	"vacuum_wave": {
		"id": "vacuum_wave",
		"name": "Vacuum Wave",
		"type": "FIGHTING",
		"category": "special",
		"power": 40,
		"pp": 30,
		"target": "single",
		"accuracy": 100
	},
	"false_swipe": {
		"id": "false_swipe",
		"name": "False Swipe",
		"type": "NORMAL",
		"category": "physical",
		"power": 40,
		"pp": 40,
		"target": "single",
		"accuracy": 100
	},
	"razor_wind": {
		"id": "razor_wind",
		"name": "Razor Wind",
		"type": "NORMAL",
		"category": "special",
		"power": 80,
		"pp": 10,
		"target": "aoe",
		"critStages": 1,
		"accuracy": 100
	},
	"double_team": {
		"id": "double_team",
		"name": "Double Team",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 15,
		"target": "single",
		"accuracy": 100
	},
	"night_slash": {
		"id": "night_slash",
		"name": "Night Slash",
		"type": "DARK",
		"category": "physical",
		"power": 70,
		"pp": 15,
		"target": "single",
		"critStages": 1,
		"accuracy": 100
	},
	"double_hit": {
		"id": "double_hit",
		"name": "Double Hit",
		"type": "NORMAL",
		"category": "physical",
		"power": 35,
		"pp": 10,
		"target": "single",
		"accuracy": 90
	},
	"swords_dance": {
		"id": "swords_dance",
		"name": "Swords Dance",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 20,
		"target": "single",
		"statChanges": [{
			"stat": "atkFis",
			"estagios": 2
		}],
		"statChance": 100,
		"statTarget": "self",
		"accuracy": 100
	},
	"feint": {
		"id": "feint",
		"name": "Feint",
		"type": "NORMAL",
		"category": "physical",
		"power": 30,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"vice_grip": {
		"id": "vice_grip",
		"name": "Vise Grip",
		"type": "NORMAL",
		"category": "physical",
		"power": 55,
		"pp": 30,
		"target": "single",
		"accuracy": 100
	},
	"seismic_toss": {
		"id": "seismic_toss",
		"name": "Seismic Toss",
		"type": "FIGHTING",
		"category": "physical",
		"power": 0,
		"pp": 20,
		"target": "single",
		"accuracy": 100
	},
	"revenge": {
		"id": "revenge",
		"name": "Revenge",
		"type": "FIGHTING",
		"category": "physical",
		"power": 60,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"vital_throw": {
		"id": "vital_throw",
		"name": "Vital Throw",
		"type": "FIGHTING",
		"category": "physical",
		"power": 70,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"brick_break": {
		"id": "brick_break",
		"name": "Brick Break",
		"type": "FIGHTING",
		"category": "physical",
		"power": 75,
		"pp": 15,
		"target": "single",
		"accuracy": 100
	},
	"submission": {
		"id": "submission",
		"name": "Submission",
		"type": "FIGHTING",
		"category": "physical",
		"power": 80,
		"pp": 20,
		"target": "single",
		"drainPercent": -25,
		"accuracy": 80
	},
	"storm_throw": {
		"id": "storm_throw",
		"name": "Storm Throw",
		"type": "FIGHTING",
		"category": "physical",
		"power": 60,
		"pp": 10,
		"target": "single",
		"critStages": 6,
		"accuracy": 100
	},
	"thrash": {
		"id": "thrash",
		"name": "Thrash",
		"type": "NORMAL",
		"category": "physical",
		"power": 120,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"superpower": {
		"id": "superpower",
		"name": "Superpower",
		"type": "FIGHTING",
		"category": "physical",
		"power": 120,
		"pp": 5,
		"target": "single",
		"statChanges": [{
			"stat": "atkFis",
			"estagios": -1
		}, {
			"stat": "def",
			"estagios": -1
		}],
		"statChance": 100,
		"accuracy": 100
	},
	"guillotine": {
		"id": "guillotine",
		"name": "Guillotine",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 5,
		"target": "single",
		"accuracy": 30
	},
	"mach_punch": {
		"id": "mach_punch",
		"name": "Mach Punch",
		"type": "FIGHTING",
		"category": "physical",
		"power": 40,
		"pp": 30,
		"target": "single",
		"accuracy": 100
	},
	"comet_punch": {
		"id": "comet_punch",
		"name": "Comet Punch",
		"type": "NORMAL",
		"category": "physical",
		"power": 18,
		"pp": 15,
		"target": "single",
		"accuracy": 85
	},
	"infestation": {
		"id": "infestation",
		"name": "Infestation",
		"type": "BUG",
		"category": "special",
		"power": 20,
		"pp": 20,
		"target": "single",
		"accuracy": 100
	},
	"night_shade": {
		"id": "night_shade",
		"name": "Night Shade",
		"type": "GHOST",
		"category": "special",
		"power": 0,
		"pp": 15,
		"target": "single",
		"accuracy": 100
	},
	"shadow_sneak": {
		"id": "shadow_sneak",
		"name": "Shadow Sneak",
		"type": "GHOST",
		"category": "physical",
		"power": 40,
		"pp": 30,
		"target": "single",
		"accuracy": 100
	},
	"fury_swipes": {
		"id": "fury_swipes",
		"name": "Fury Swipes",
		"type": "NORMAL",
		"category": "physical",
		"power": 18,
		"pp": 15,
		"target": "single",
		"accuracy": 80
	},
	"spider_web": {
		"id": "spider_web",
		"name": "Spider Web",
		"type": "BUG",
		"category": "status",
		"power": 0,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"sticky_web": {
		"id": "sticky_web",
		"name": "Sticky Web",
		"type": "BUG",
		"category": "status",
		"power": 0,
		"pp": 20,
		"target": "single",
		"accuracy": 100
	},
	"toxic_thread": {
		"id": "toxic_thread",
		"name": "Toxic Thread",
		"type": "POISON",
		"category": "status",
		"power": 0,
		"pp": 20,
		"target": "single",
		"status": "poison",
		"statusChance": 100,
		"statChanges": [{
			"stat": "speed",
			"estagios": -1
		}],
		"statChance": 100,
		"accuracy": 100
	},
	"venom_drench": {
		"id": "venom_drench",
		"name": "Venom Drench",
		"type": "POISON",
		"category": "status",
		"power": 0,
		"pp": 20,
		"target": "aoe",
		"statChanges": [
			{
				"stat": "atkFis",
				"estagios": -1
			},
			{
				"stat": "atkEsp",
				"estagios": -1
			},
			{
				"stat": "speed",
				"estagios": -1
			}
		],
		"statChance": 100,
		"accuracy": 100
	},
	"sonic_boom": {
		"id": "sonic_boom",
		"name": "Sonic Boom",
		"type": "NORMAL",
		"category": "special",
		"power": 0,
		"pp": 20,
		"target": "single",
		"accuracy": 90
	},
	"screech": {
		"id": "screech",
		"name": "Screech",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 40,
		"target": "single",
		"statChanges": [{
			"stat": "def",
			"estagios": -2
		}],
		"statChance": 100,
		"accuracy": 85
	},
	"bide": {
		"id": "bide",
		"name": "Bide",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"spikes": {
		"id": "spikes",
		"name": "Spikes",
		"type": "GROUND",
		"category": "status",
		"power": 0,
		"pp": 20,
		"target": "single",
		"accuracy": 100
	},
	"payback": {
		"id": "payback",
		"name": "Payback",
		"type": "DARK",
		"category": "physical",
		"power": 50,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"gyro_ball": {
		"id": "gyro_ball",
		"name": "Gyro Ball",
		"type": "STEEL",
		"category": "physical",
		"power": 0,
		"pp": 5,
		"target": "single",
		"accuracy": 100
	},
	"autotomize": {
		"id": "autotomize",
		"name": "Autotomize",
		"type": "STEEL",
		"category": "status",
		"power": 0,
		"pp": 15,
		"target": "single",
		"statChanges": [{
			"stat": "speed",
			"estagios": 2
		}],
		"statChance": 100,
		"statTarget": "self",
		"accuracy": 100
	},
	"heavy_slam": {
		"id": "heavy_slam",
		"name": "Heavy Slam",
		"type": "STEEL",
		"category": "physical",
		"power": 0,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"magnet_rise": {
		"id": "magnet_rise",
		"name": "Magnet Rise",
		"type": "ELECTRIC",
		"category": "status",
		"power": 0,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"mirror_shot": {
		"id": "mirror_shot",
		"name": "Mirror Shot",
		"type": "STEEL",
		"category": "special",
		"power": 65,
		"pp": 10,
		"target": "single",
		"accuracy": 85
	},
	"bullet_punch": {
		"id": "bullet_punch",
		"name": "Bullet Punch",
		"type": "STEEL",
		"category": "physical",
		"power": 40,
		"pp": 30,
		"target": "single",
		"accuracy": 100
	},
	"metal_claw": {
		"id": "metal_claw",
		"name": "Metal Claw",
		"type": "STEEL",
		"category": "physical",
		"power": 50,
		"pp": 35,
		"target": "single",
		"statChanges": [{
			"stat": "atkFis",
			"estagios": 1
		}],
		"statChance": 10,
		"accuracy": 95
	},
	"iron_head": {
		"id": "iron_head",
		"name": "Iron Head",
		"type": "STEEL",
		"category": "physical",
		"power": 80,
		"pp": 15,
		"target": "single",
		"flinchChance": 30,
		"accuracy": 100
	},
	"arm_thrust": {
		"id": "arm_thrust",
		"name": "Arm Thrust",
		"type": "FIGHTING",
		"category": "physical",
		"power": 15,
		"pp": 20,
		"target": "single",
		"accuracy": 100
	},
	"horn_attack": {
		"id": "horn_attack",
		"name": "Horn Attack",
		"type": "NORMAL",
		"category": "physical",
		"power": 65,
		"pp": 25,
		"target": "single",
		"accuracy": 100
	},
	"chip_away": {
		"id": "chip_away",
		"name": "Chip Away",
		"type": "NORMAL",
		"category": "physical",
		"power": 70,
		"pp": 20,
		"target": "single",
		"accuracy": 100
	},
	"counter": {
		"id": "counter",
		"name": "Counter",
		"type": "FIGHTING",
		"category": "physical",
		"power": 0,
		"pp": 20,
		"target": "single",
		"accuracy": 100
	},
	"megahorn": {
		"id": "megahorn",
		"name": "Megahorn",
		"type": "BUG",
		"category": "physical",
		"power": 120,
		"pp": 10,
		"target": "single",
		"accuracy": 85
	},
	"close_combat": {
		"id": "close_combat",
		"name": "Close Combat",
		"type": "FIGHTING",
		"category": "physical",
		"power": 120,
		"pp": 5,
		"target": "single",
		"statChanges": [{
			"stat": "def",
			"estagios": -1
		}, {
			"stat": "defEsp",
			"estagios": -1
		}],
		"statChance": 100,
		"accuracy": 100
	},
	"reversal": {
		"id": "reversal",
		"name": "Reversal",
		"type": "FIGHTING",
		"category": "physical",
		"power": 0,
		"pp": 15,
		"target": "single",
		"accuracy": 100
	},
	"flash_cannon": {
		"id": "flash_cannon",
		"name": "Flash Cannon",
		"type": "STEEL",
		"category": "special",
		"power": 80,
		"pp": 10,
		"target": "single",
		"statChanges": [{
			"stat": "defEsp",
			"estagios": -1
		}],
		"statChance": 10,
		"accuracy": 100
	},
	"water_sport": {
		"id": "water_sport",
		"name": "Water Sport",
		"type": "WATER",
		"category": "status",
		"power": 0,
		"pp": 15,
		"target": "single",
		"accuracy": 100
	},
	"soak": {
		"id": "soak",
		"name": "Soak",
		"type": "WATER",
		"category": "status",
		"power": 0,
		"pp": 20,
		"target": "single",
		"accuracy": 100
	},
	"wonder_room": {
		"id": "wonder_room",
		"name": "Wonder Room",
		"type": "PSYCHIC",
		"category": "status",
		"power": 0,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"aqua_jet": {
		"id": "aqua_jet",
		"name": "Aqua Jet",
		"type": "WATER",
		"category": "physical",
		"power": 40,
		"pp": 20,
		"target": "single",
		"accuracy": 100
	},
	"double_slap": {
		"id": "double_slap",
		"name": "Double Slap",
		"type": "NORMAL",
		"category": "physical",
		"power": 15,
		"pp": 10,
		"target": "single",
		"accuracy": 85
	},
	"mud_shot": {
		"id": "mud_shot",
		"name": "Mud Shot",
		"type": "GROUND",
		"category": "special",
		"power": 55,
		"pp": 15,
		"target": "single",
		"statChanges": [{
			"stat": "speed",
			"estagios": -1
		}],
		"statChance": 100,
		"accuracy": 95
	},
	"belly_drum": {
		"id": "belly_drum",
		"name": "Belly Drum",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"wake_up_slap": {
		"id": "wake_up_slap",
		"name": "Wake-Up Slap",
		"type": "FIGHTING",
		"category": "physical",
		"power": 70,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"mud_bomb": {
		"id": "mud_bomb",
		"name": "Mud Bomb",
		"type": "GROUND",
		"category": "special",
		"power": 65,
		"pp": 10,
		"target": "single",
		"accuracy": 85
	},
	"acid_spray": {
		"id": "acid_spray",
		"name": "Acid Spray",
		"type": "POISON",
		"category": "special",
		"power": 40,
		"pp": 20,
		"target": "single",
		"statChanges": [{
			"stat": "defEsp",
			"estagios": -2
		}],
		"statChance": 100,
		"accuracy": 100
	},
	"brine": {
		"id": "brine",
		"name": "Brine",
		"type": "WATER",
		"category": "special",
		"power": 65,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"hex": {
		"id": "hex",
		"name": "Hex",
		"type": "GHOST",
		"category": "special",
		"power": 65,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"sludge_wave": {
		"id": "sludge_wave",
		"name": "Sludge Wave",
		"type": "POISON",
		"category": "special",
		"power": 95,
		"pp": 10,
		"target": "aoe",
		"status": "poison",
		"statusChance": 10,
		"accuracy": 100
	},
	"curse": {
		"id": "curse",
		"name": "Curse",
		"type": "GHOST",
		"category": "status",
		"power": 0,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"yawn": {
		"id": "yawn",
		"name": "Yawn",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"headbutt": {
		"id": "headbutt",
		"name": "Headbutt",
		"type": "NORMAL",
		"category": "physical",
		"power": 70,
		"pp": 15,
		"target": "single",
		"flinchChance": 30,
		"accuracy": 100
	},
	"slack_off": {
		"id": "slack_off",
		"name": "Slack Off",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 5,
		"target": "single",
		"healPercent": 50,
		"accuracy": 100
	},
	"heal_pulse": {
		"id": "heal_pulse",
		"name": "Heal Pulse",
		"type": "PSYCHIC",
		"category": "status",
		"power": 0,
		"pp": 10,
		"target": "single",
		"healPercent": 50,
		"accuracy": 100
	},
	"icy_wind": {
		"id": "icy_wind",
		"name": "Icy Wind",
		"type": "ICE",
		"category": "special",
		"power": 55,
		"pp": 15,
		"target": "aoe",
		"statChanges": [{
			"stat": "speed",
			"estagios": -1
		}],
		"statChance": 100,
		"accuracy": 95
	},
	"encore": {
		"id": "encore",
		"name": "Encore",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 5,
		"target": "single",
		"accuracy": 100
	},
	"rest": {
		"id": "rest",
		"name": "Rest",
		"type": "PSYCHIC",
		"category": "status",
		"power": 0,
		"pp": 5,
		"target": "single",
		"accuracy": 100
	},
	"aqua_ring": {
		"id": "aqua_ring",
		"name": "Aqua Ring",
		"type": "WATER",
		"category": "status",
		"power": 0,
		"pp": 20,
		"target": "single",
		"accuracy": 100
	},
	"dive": {
		"id": "dive",
		"name": "Dive",
		"type": "WATER",
		"category": "physical",
		"power": 80,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"icicle_spear": {
		"id": "icicle_spear",
		"name": "Icicle Spear",
		"type": "ICE",
		"category": "physical",
		"power": 25,
		"pp": 30,
		"target": "single",
		"accuracy": 100
	},
	"clamp": {
		"id": "clamp",
		"name": "Clamp",
		"type": "WATER",
		"category": "physical",
		"power": 35,
		"pp": 15,
		"target": "single",
		"accuracy": 85
	},
	"razor_shell": {
		"id": "razor_shell",
		"name": "Razor Shell",
		"type": "WATER",
		"category": "physical",
		"power": 75,
		"pp": 10,
		"target": "single",
		"statChanges": [{
			"stat": "def",
			"estagios": -1
		}],
		"statChance": 50,
		"accuracy": 95
	},
	"whirlpool": {
		"id": "whirlpool",
		"name": "Whirlpool",
		"type": "WATER",
		"category": "special",
		"power": 35,
		"pp": 15,
		"target": "single",
		"accuracy": 85
	},
	"shell_smash": {
		"id": "shell_smash",
		"name": "Shell Smash",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 15,
		"target": "single",
		"statChanges": [
			{
				"stat": "def",
				"estagios": -1
			},
			{
				"stat": "defEsp",
				"estagios": -1
			},
			{
				"stat": "atkFis",
				"estagios": 2
			},
			{
				"stat": "atkEsp",
				"estagios": 2
			},
			{
				"stat": "speed",
				"estagios": 2
			}
		],
		"statChance": 100,
		"statTarget": "self",
		"accuracy": 100
	},
	"crabhammer": {
		"id": "crabhammer",
		"name": "Crabhammer",
		"type": "WATER",
		"category": "physical",
		"power": 100,
		"pp": 10,
		"target": "single",
		"critStages": 1,
		"accuracy": 90
	},
	"flail": {
		"id": "flail",
		"name": "Flail",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 15,
		"target": "single",
		"accuracy": 100
	},
	"wide_guard": {
		"id": "wide_guard",
		"name": "Wide Guard",
		"type": "ROCK",
		"category": "status",
		"power": 0,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"twister": {
		"id": "twister",
		"name": "Twister",
		"type": "DRAGON",
		"category": "special",
		"power": 40,
		"pp": 20,
		"target": "aoe",
		"flinchChance": 20,
		"accuracy": 100
	},
	"dragon_pulse": {
		"id": "dragon_pulse",
		"name": "Dragon Pulse",
		"type": "DRAGON",
		"category": "special",
		"power": 85,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"dragon_dance": {
		"id": "dragon_dance",
		"name": "Dragon Dance",
		"type": "DRAGON",
		"category": "status",
		"power": 0,
		"pp": 20,
		"target": "single",
		"statChanges": [{
			"stat": "atkFis",
			"estagios": 1
		}, {
			"stat": "speed",
			"estagios": 1
		}],
		"statChance": 100,
		"statTarget": "self",
		"accuracy": 100
	},
	"waterfall": {
		"id": "waterfall",
		"name": "Waterfall",
		"type": "WATER",
		"category": "physical",
		"power": 80,
		"pp": 15,
		"target": "single",
		"flinchChance": 20,
		"accuracy": 100
	},
	"horn_drill": {
		"id": "horn_drill",
		"name": "Horn Drill",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 5,
		"target": "single",
		"accuracy": 30
	},
	"camouflage": {
		"id": "camouflage",
		"name": "Camouflage",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 20,
		"target": "single",
		"accuracy": 100
	},
	"minimize": {
		"id": "minimize",
		"name": "Minimize",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"power_gem": {
		"id": "power_gem",
		"name": "Power Gem",
		"type": "ROCK",
		"category": "special",
		"power": 80,
		"pp": 20,
		"target": "single",
		"accuracy": 100
	},
	"confuse_ray": {
		"id": "confuse_ray",
		"name": "Confuse Ray",
		"type": "GHOST",
		"category": "status",
		"power": 0,
		"pp": 10,
		"target": "single",
		"status": "confusion",
		"statusChance": 100,
		"accuracy": 100
	},
	"cosmic_power": {
		"id": "cosmic_power",
		"name": "Cosmic Power",
		"type": "PSYCHIC",
		"category": "status",
		"power": 0,
		"pp": 20,
		"target": "single",
		"statChanges": [{
			"stat": "def",
			"estagios": 1
		}, {
			"stat": "defEsp",
			"estagios": 1
		}],
		"statChance": 100,
		"statTarget": "self",
		"accuracy": 100
	},
	"hyper_beam": {
		"id": "hyper_beam",
		"name": "Hyper Beam",
		"type": "NORMAL",
		"category": "special",
		"power": 150,
		"pp": 5,
		"target": "single",
		"accuracy": 90
	},
	"sing": {
		"id": "sing",
		"name": "Sing",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 15,
		"target": "single",
		"status": "sleep",
		"statusChance": 100,
		"accuracy": 55
	},
	"electro_ball": {
		"id": "electro_ball",
		"name": "Electro Ball",
		"type": "ELECTRIC",
		"category": "special",
		"power": 0,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"ion_deluge": {
		"id": "ion_deluge",
		"name": "Ion Deluge",
		"type": "ELECTRIC",
		"category": "status",
		"power": 0,
		"pp": 25,
		"target": "single",
		"accuracy": 100
	},
	"eerie_impulse": {
		"id": "eerie_impulse",
		"name": "Eerie Impulse",
		"type": "ELECTRIC",
		"category": "status",
		"power": 0,
		"pp": 15,
		"target": "single",
		"statChanges": [{
			"stat": "atkEsp",
			"estagios": -2
		}],
		"statChance": 100,
		"accuracy": 100
	},
	"spotlight": {
		"id": "spotlight",
		"name": "Spotlight",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 15,
		"target": "single",
		"accuracy": 100
	},
	"helping_hand": {
		"id": "helping_hand",
		"name": "Helping Hand",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 20,
		"target": "single",
		"accuracy": 100
	},
	"play_rough": {
		"id": "play_rough",
		"name": "Play Rough",
		"type": "FAIRY",
		"category": "physical",
		"power": 90,
		"pp": 10,
		"target": "single",
		"statChanges": [{
			"stat": "atkFis",
			"estagios": -1
		}],
		"statChance": 10,
		"accuracy": 90
	},
	"hyper_voice": {
		"id": "hyper_voice",
		"name": "Hyper Voice",
		"type": "NORMAL",
		"category": "special",
		"power": 90,
		"pp": 10,
		"target": "aoe",
		"accuracy": 100
	},
	"haze": {
		"id": "haze",
		"name": "Haze",
		"type": "ICE",
		"category": "status",
		"power": 0,
		"pp": 30,
		"target": "single",
		"accuracy": 100
	},
	"muddy_water": {
		"id": "muddy_water",
		"name": "Muddy Water",
		"type": "WATER",
		"category": "special",
		"power": 90,
		"pp": 10,
		"target": "aoe",
		"accuracy": 85
	},
	"destiny_bond": {
		"id": "destiny_bond",
		"name": "Destiny Bond",
		"type": "GHOST",
		"category": "status",
		"power": 0,
		"pp": 5,
		"target": "single",
		"accuracy": 100
	},
	"refresh": {
		"id": "refresh",
		"name": "Refresh",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 20,
		"target": "single",
		"accuracy": 100
	},
	"spike_cannon": {
		"id": "spike_cannon",
		"name": "Spike Cannon",
		"type": "NORMAL",
		"category": "physical",
		"power": 20,
		"pp": 15,
		"target": "single",
		"accuracy": 100
	},
	"earth_power": {
		"id": "earth_power",
		"name": "Earth Power",
		"type": "GROUND",
		"category": "special",
		"power": 90,
		"pp": 10,
		"target": "single",
		"statChanges": [{
			"stat": "defEsp",
			"estagios": -1
		}],
		"statChance": 10,
		"accuracy": 100
	},
	"lock_on": {
		"id": "lock_on",
		"name": "Lock-On",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 5,
		"target": "single",
		"accuracy": 100
	},
	"gunk_shot": {
		"id": "gunk_shot",
		"name": "Gunk Shot",
		"type": "POISON",
		"category": "physical",
		"power": 120,
		"pp": 5,
		"target": "single",
		"status": "poison",
		"statusChance": 30,
		"accuracy": 80
	},
	"octazooka": {
		"id": "octazooka",
		"name": "Octazooka",
		"type": "WATER",
		"category": "special",
		"power": 65,
		"pp": 10,
		"target": "single",
		"accuracy": 85
	},
	"sand_attack": {
		"id": "sand_attack",
		"name": "Sand Attack",
		"type": "GROUND",
		"category": "status",
		"power": 0,
		"pp": 15,
		"target": "single",
		"accuracy": 100
	},
	"feather_dance": {
		"id": "feather_dance",
		"name": "Feather Dance",
		"type": "FLYING",
		"category": "status",
		"power": 0,
		"pp": 15,
		"target": "single",
		"statChanges": [{
			"stat": "atkFis",
			"estagios": -2
		}],
		"statChance": 100,
		"accuracy": 100
	},
	"drill_run": {
		"id": "drill_run",
		"name": "Drill Run",
		"type": "GROUND",
		"category": "physical",
		"power": 80,
		"pp": 10,
		"target": "single",
		"critStages": 1,
		"accuracy": 95
	},
	"play_nice": {
		"id": "play_nice",
		"name": "Play Nice",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 20,
		"target": "single",
		"statChanges": [{
			"stat": "atkFis",
			"estagios": -1
		}],
		"statChance": 100,
		"accuracy": 100
	},
	"disarming_voice": {
		"id": "disarming_voice",
		"name": "Disarming Voice",
		"type": "FAIRY",
		"category": "special",
		"power": 40,
		"pp": 15,
		"target": "aoe",
		"accuracy": 100
	},
	"round": {
		"id": "round",
		"name": "Round",
		"type": "NORMAL",
		"category": "special",
		"power": 60,
		"pp": 15,
		"target": "single",
		"accuracy": 100
	},
	"mimic": {
		"id": "mimic",
		"name": "Mimic",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"fake_out": {
		"id": "fake_out",
		"name": "Fake Out",
		"type": "NORMAL",
		"category": "physical",
		"power": 40,
		"pp": 10,
		"target": "single",
		"flinchChance": 100,
		"accuracy": 100
	},
	"feint_attack": {
		"id": "feint_attack",
		"name": "Feint Attack",
		"type": "DARK",
		"category": "physical",
		"power": 60,
		"pp": 20,
		"target": "single",
		"accuracy": 100
	},
	"taunt": {
		"id": "taunt",
		"name": "Taunt",
		"type": "DARK",
		"category": "status",
		"power": 0,
		"pp": 20,
		"target": "single",
		"accuracy": 100
	},
	"pay_day": {
		"id": "pay_day",
		"name": "Pay Day",
		"type": "NORMAL",
		"category": "physical",
		"power": 40,
		"pp": 20,
		"target": "single",
		"accuracy": 100
	},
	"switcheroo": {
		"id": "switcheroo",
		"name": "Switcheroo",
		"type": "DARK",
		"category": "status",
		"power": 0,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"air_cutter": {
		"id": "air_cutter",
		"name": "Air Cutter",
		"type": "FLYING",
		"category": "special",
		"power": 60,
		"pp": 25,
		"target": "aoe",
		"critStages": 1,
		"accuracy": 95
	},
	"acupressure": {
		"id": "acupressure",
		"name": "Acupressure",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 30,
		"target": "single",
		"accuracy": 100
	},
	"jump_kick": {
		"id": "jump_kick",
		"name": "Jump Kick",
		"type": "FIGHTING",
		"category": "physical",
		"power": 100,
		"pp": 10,
		"target": "single",
		"accuracy": 95
	},
	"tri_attack": {
		"id": "tri_attack",
		"name": "Tri Attack",
		"type": "NORMAL",
		"category": "special",
		"power": 80,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"lick": {
		"id": "lick",
		"name": "Lick",
		"type": "GHOST",
		"category": "physical",
		"power": 30,
		"pp": 30,
		"target": "single",
		"status": "paralysis",
		"statusChance": 30,
		"accuracy": 100
	},
	"dizzy_punch": {
		"id": "dizzy_punch",
		"name": "Dizzy Punch",
		"type": "NORMAL",
		"category": "physical",
		"power": 70,
		"pp": 10,
		"target": "single",
		"status": "confusion",
		"statusChance": 20,
		"accuracy": 100
	},
	"outrage": {
		"id": "outrage",
		"name": "Outrage",
		"type": "DRAGON",
		"category": "physical",
		"power": 120,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"work_up": {
		"id": "work_up",
		"name": "Work Up",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 30,
		"target": "single",
		"statChanges": [{
			"stat": "atkFis",
			"estagios": 1
		}, {
			"stat": "atkEsp",
			"estagios": 1
		}],
		"statChance": 100,
		"statTarget": "self",
		"accuracy": 100
	},
	"giga_impact": {
		"id": "giga_impact",
		"name": "Giga Impact",
		"type": "NORMAL",
		"category": "physical",
		"power": 150,
		"pp": 5,
		"target": "single",
		"accuracy": 90
	},
	"covet": {
		"id": "covet",
		"name": "Covet",
		"type": "NORMAL",
		"category": "physical",
		"power": 60,
		"pp": 25,
		"target": "single",
		"accuracy": 100
	},
	"baby_doll_eyes": {
		"id": "baby_doll_eyes",
		"name": "Baby-Doll Eyes",
		"type": "FAIRY",
		"category": "status",
		"power": 0,
		"pp": 30,
		"target": "single",
		"statChanges": [{
			"stat": "atkFis",
			"estagios": -1
		}],
		"statChance": 100,
		"accuracy": 100
	},
	"charm": {
		"id": "charm",
		"name": "Charm",
		"type": "FAIRY",
		"category": "status",
		"power": 0,
		"pp": 20,
		"target": "single",
		"statChanges": [{
			"stat": "atkFis",
			"estagios": -2
		}],
		"statChance": 100,
		"accuracy": 100
	},
	"last_resort": {
		"id": "last_resort",
		"name": "Last Resort",
		"type": "NORMAL",
		"category": "physical",
		"power": 140,
		"pp": 5,
		"target": "single",
		"accuracy": 100
	},
	"trump_card": {
		"id": "trump_card",
		"name": "Trump Card",
		"type": "NORMAL",
		"category": "special",
		"power": 0,
		"pp": 5,
		"target": "single",
		"accuracy": 100
	},
	"conversion": {
		"id": "conversion",
		"name": "Conversion",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 30,
		"target": "single",
		"accuracy": 100
	},
	"conversion_2": {
		"id": "conversion_2",
		"name": "Conversion 2",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 30,
		"target": "single",
		"accuracy": 100
	},
	"sharpen": {
		"id": "sharpen",
		"name": "Sharpen",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 30,
		"target": "single",
		"statChanges": [{
			"stat": "atkFis",
			"estagios": 1
		}],
		"statChance": 100,
		"statTarget": "self",
		"accuracy": 100
	},
	"recycle": {
		"id": "recycle",
		"name": "Recycle",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"magic_coat": {
		"id": "magic_coat",
		"name": "Magic Coat",
		"type": "PSYCHIC",
		"category": "status",
		"power": 0,
		"pp": 15,
		"target": "single",
		"accuracy": 100
	},
	"snore": {
		"id": "snore",
		"name": "Snore",
		"type": "NORMAL",
		"category": "special",
		"power": 50,
		"pp": 15,
		"target": "single",
		"flinchChance": 30,
		"accuracy": 100
	},
	"sleep_talk": {
		"id": "sleep_talk",
		"name": "Sleep Talk",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"block": {
		"id": "block",
		"name": "Block",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 5,
		"target": "single",
		"accuracy": 100
	},
	"high_horsepower": {
		"id": "high_horsepower",
		"name": "High Horsepower",
		"type": "GROUND",
		"category": "physical",
		"power": 95,
		"pp": 10,
		"target": "single",
		"accuracy": 95
	},
	"follow_me": {
		"id": "follow_me",
		"name": "Follow Me",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 20,
		"target": "single",
		"accuracy": 100
	},
	"coil": {
		"id": "coil",
		"name": "Coil",
		"type": "POISON",
		"category": "status",
		"power": 0,
		"pp": 20,
		"target": "single",
		"statChanges": [{
			"stat": "atkFis",
			"estagios": 1
		}, {
			"stat": "def",
			"estagios": 1
		}],
		"statChance": 100,
		"statTarget": "self",
		"accuracy": 100
	},
	"echoed_voice": {
		"id": "echoed_voice",
		"name": "Echoed Voice",
		"type": "NORMAL",
		"category": "special",
		"power": 40,
		"pp": 15,
		"target": "single",
		"accuracy": 100
	},
	"psycho_shift": {
		"id": "psycho_shift",
		"name": "Psycho Shift",
		"type": "PSYCHIC",
		"category": "status",
		"power": 0,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"synchronoise": {
		"id": "synchronoise",
		"name": "Synchronoise",
		"type": "PSYCHIC",
		"category": "special",
		"power": 120,
		"pp": 10,
		"target": "aoe",
		"accuracy": 100
	},
	"dream_eater": {
		"id": "dream_eater",
		"name": "Dream Eater",
		"type": "PSYCHIC",
		"category": "special",
		"power": 100,
		"pp": 15,
		"target": "single",
		"drainPercent": 50,
		"accuracy": 100
	},
	"sweet_kiss": {
		"id": "sweet_kiss",
		"name": "Sweet Kiss",
		"type": "FAIRY",
		"category": "status",
		"power": 0,
		"pp": 10,
		"target": "single",
		"status": "confusion",
		"statusChance": 100,
		"accuracy": 75
	},
	"copycat": {
		"id": "copycat",
		"name": "Copycat",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 20,
		"target": "single",
		"accuracy": 100
	},
	"astonish": {
		"id": "astonish",
		"name": "Astonish",
		"type": "GHOST",
		"category": "physical",
		"power": 30,
		"pp": 15,
		"target": "single",
		"flinchChance": 30,
		"accuracy": 100
	},
	"fling": {
		"id": "fling",
		"name": "Fling",
		"type": "DARK",
		"category": "physical",
		"power": 0,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"odor_sleuth": {
		"id": "odor_sleuth",
		"name": "Odor Sleuth",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 40,
		"target": "single",
		"accuracy": 100
	},
	"spite": {
		"id": "spite",
		"name": "Spite",
		"type": "GHOST",
		"category": "status",
		"power": 0,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"mud_slap": {
		"id": "mud_slap",
		"name": "Mud-Slap",
		"type": "GROUND",
		"category": "special",
		"power": 20,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"dig": {
		"id": "dig",
		"name": "Dig",
		"type": "GROUND",
		"category": "physical",
		"power": 80,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"glare": {
		"id": "glare",
		"name": "Glare",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 30,
		"target": "single",
		"status": "paralysis",
		"statusChance": 100,
		"accuracy": 100
	},
	"fake_tears": {
		"id": "fake_tears",
		"name": "Fake Tears",
		"type": "DARK",
		"category": "status",
		"power": 0,
		"pp": 20,
		"target": "single",
		"statChanges": [{
			"stat": "defEsp",
			"estagios": -2
		}],
		"statChance": 100,
		"accuracy": 100
	},
	"hammer_arm": {
		"id": "hammer_arm",
		"name": "Hammer Arm",
		"type": "FIGHTING",
		"category": "physical",
		"power": 100,
		"pp": 10,
		"target": "single",
		"statChanges": [{
			"stat": "speed",
			"estagios": -1
		}],
		"statChance": 100,
		"accuracy": 90
	},
	"role_play": {
		"id": "role_play",
		"name": "Role Play",
		"type": "PSYCHIC",
		"category": "status",
		"power": 0,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"imprison": {
		"id": "imprison",
		"name": "Imprison",
		"type": "PSYCHIC",
		"category": "status",
		"power": 0,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"sketch": {
		"id": "sketch",
		"name": "Sketch",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 1,
		"target": "single",
		"accuracy": 100
	},
	"milk_drink": {
		"id": "milk_drink",
		"name": "Milk Drink",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 5,
		"target": "single",
		"healPercent": 50,
		"accuracy": 100
	},
	"steamroller": {
		"id": "steamroller",
		"name": "Steamroller",
		"type": "BUG",
		"category": "physical",
		"power": 65,
		"pp": 20,
		"target": "single",
		"flinchChance": 30,
		"accuracy": 100
	},
	"rock_tomb": {
		"id": "rock_tomb",
		"name": "Rock Tomb",
		"type": "ROCK",
		"category": "physical",
		"power": 60,
		"pp": 15,
		"target": "single",
		"statChanges": [{
			"stat": "speed",
			"estagios": -1
		}],
		"statChance": 100,
		"accuracy": 95
	},
	"dragon_breath": {
		"id": "dragon_breath",
		"name": "Dragon Breath",
		"type": "DRAGON",
		"category": "special",
		"power": 60,
		"pp": 20,
		"target": "single",
		"status": "paralysis",
		"statusChance": 30,
		"accuracy": 100
	},
	"rock_slide": {
		"id": "rock_slide",
		"name": "Rock Slide",
		"type": "ROCK",
		"category": "physical",
		"power": 75,
		"pp": 10,
		"target": "aoe",
		"flinchChance": 30,
		"accuracy": 90
	},
	"sand_tomb": {
		"id": "sand_tomb",
		"name": "Sand Tomb",
		"type": "GROUND",
		"category": "physical",
		"power": 35,
		"pp": 15,
		"target": "single",
		"accuracy": 85
	},
	"iron_tail": {
		"id": "iron_tail",
		"name": "Iron Tail",
		"type": "STEEL",
		"category": "physical",
		"power": 100,
		"pp": 15,
		"target": "single",
		"statChanges": [{
			"stat": "def",
			"estagios": -1
		}],
		"statChance": 30,
		"accuracy": 75
	},
	"sandstorm": {
		"id": "sandstorm",
		"name": "Sandstorm",
		"type": "ROCK",
		"category": "status",
		"power": 0,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"metal_sound": {
		"id": "metal_sound",
		"name": "Metal Sound",
		"type": "STEEL",
		"category": "status",
		"power": 0,
		"pp": 40,
		"target": "single",
		"statChanges": [{
			"stat": "defEsp",
			"estagios": -2
		}],
		"statChance": 100,
		"accuracy": 85
	},
	"sky_drop": {
		"id": "sky_drop",
		"name": "Sky Drop",
		"type": "FLYING",
		"category": "physical",
		"power": 60,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"low_kick": {
		"id": "low_kick",
		"name": "Low Kick",
		"type": "FIGHTING",
		"category": "physical",
		"power": 0,
		"pp": 20,
		"target": "single",
		"accuracy": 100
	},
	"wood_hammer": {
		"id": "wood_hammer",
		"name": "Wood Hammer",
		"type": "GRASS",
		"category": "physical",
		"power": 120,
		"pp": 15,
		"target": "single",
		"drainPercent": -33,
		"accuracy": 100
	},
	"tearful_look": {
		"id": "tearful_look",
		"name": "Tearful Look",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 20,
		"target": "single",
		"statChanges": [{
			"stat": "atkFis",
			"estagios": -1
		}, {
			"stat": "atkEsp",
			"estagios": -1
		}],
		"statChance": 100,
		"accuracy": 100
	},
	"head_smash": {
		"id": "head_smash",
		"name": "Head Smash",
		"type": "ROCK",
		"category": "physical",
		"power": 150,
		"pp": 5,
		"target": "single",
		"drainPercent": -50,
		"accuracy": 80
	},
	"dark_pulse": {
		"id": "dark_pulse",
		"name": "Dark Pulse",
		"type": "DARK",
		"category": "special",
		"power": 80,
		"pp": 15,
		"target": "single",
		"flinchChance": 20,
		"accuracy": 100
	},
	"crush_claw": {
		"id": "crush_claw",
		"name": "Crush Claw",
		"type": "NORMAL",
		"category": "physical",
		"power": 75,
		"pp": 10,
		"target": "single",
		"statChanges": [{
			"stat": "def",
			"estagios": -1
		}],
		"statChance": 50,
		"accuracy": 95
	},
	"fissure": {
		"id": "fissure",
		"name": "Fissure",
		"type": "GROUND",
		"category": "physical",
		"power": 0,
		"pp": 5,
		"target": "single",
		"accuracy": 30
	},
	"rototiller": {
		"id": "rototiller",
		"name": "Rototiller",
		"type": "GROUND",
		"category": "status",
		"power": 0,
		"pp": 10,
		"target": "single",
		"statChanges": [{
			"stat": "atkFis",
			"estagios": 1
		}, {
			"stat": "atkEsp",
			"estagios": 1
		}],
		"statChance": 100,
		"accuracy": 100
	},
	"bone_club": {
		"id": "bone_club",
		"name": "Bone Club",
		"type": "GROUND",
		"category": "physical",
		"power": 65,
		"pp": 20,
		"target": "single",
		"flinchChance": 10,
		"accuracy": 85
	},
	"bonemerang": {
		"id": "bonemerang",
		"name": "Bonemerang",
		"type": "GROUND",
		"category": "physical",
		"power": 50,
		"pp": 10,
		"target": "single",
		"accuracy": 90
	},
	"stomping_tantrum": {
		"id": "stomping_tantrum",
		"name": "Stomping Tantrum",
		"type": "GROUND",
		"category": "physical",
		"power": 75,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"retaliate": {
		"id": "retaliate",
		"name": "Retaliate",
		"type": "NORMAL",
		"category": "physical",
		"power": 70,
		"pp": 5,
		"target": "single",
		"accuracy": 100
	},
	"bone_rush": {
		"id": "bone_rush",
		"name": "Bone Rush",
		"type": "GROUND",
		"category": "physical",
		"power": 25,
		"pp": 10,
		"target": "single",
		"accuracy": 90
	},
	"sky_uppercut": {
		"id": "sky_uppercut",
		"name": "Sky Uppercut",
		"type": "FIGHTING",
		"category": "physical",
		"power": 85,
		"pp": 15,
		"target": "single",
		"accuracy": 90
	},
	"dragon_claw": {
		"id": "dragon_claw",
		"name": "Dragon Claw",
		"type": "DRAGON",
		"category": "physical",
		"power": 80,
		"pp": 15,
		"target": "single",
		"accuracy": 100
	},
	"flare_blitz": {
		"id": "flare_blitz",
		"name": "Flare Blitz",
		"type": "FIRE",
		"category": "physical",
		"power": 120,
		"pp": 15,
		"target": "single",
		"status": "burn",
		"statusChance": 10,
		"drainPercent": -33,
		"accuracy": 100
	},
	"shadow_claw": {
		"id": "shadow_claw",
		"name": "Shadow Claw",
		"type": "GHOST",
		"category": "physical",
		"power": 70,
		"pp": 15,
		"target": "single",
		"critStages": 1,
		"accuracy": 100
	},
	"flame_wheel": {
		"id": "flame_wheel",
		"name": "Flame Wheel",
		"type": "FIRE",
		"category": "physical",
		"power": 60,
		"pp": 25,
		"target": "single",
		"status": "burn",
		"statusChance": 10,
		"accuracy": 100
	},
	"extreme_speed": {
		"id": "extreme_speed",
		"name": "Extreme Speed",
		"type": "NORMAL",
		"category": "physical",
		"power": 80,
		"pp": 5,
		"target": "single",
		"accuracy": 100
	},
	"flame_charge": {
		"id": "flame_charge",
		"name": "Flame Charge",
		"type": "FIRE",
		"category": "physical",
		"power": 50,
		"pp": 20,
		"target": "single",
		"statChanges": [{
			"stat": "speed",
			"estagios": 1
		}],
		"statChance": 100,
		"accuracy": 100
	},
	"smog": {
		"id": "smog",
		"name": "Smog",
		"type": "POISON",
		"category": "special",
		"power": 30,
		"pp": 20,
		"target": "single",
		"status": "poison",
		"statusChance": 40,
		"accuracy": 70
	},
	"clear_smog": {
		"id": "clear_smog",
		"name": "Clear Smog",
		"type": "POISON",
		"category": "special",
		"power": 50,
		"pp": 15,
		"target": "single",
		"accuracy": 100
	},
	"fire_punch": {
		"id": "fire_punch",
		"name": "Fire Punch",
		"type": "FIRE",
		"category": "physical",
		"power": 75,
		"pp": 15,
		"target": "single",
		"status": "burn",
		"statusChance": 10,
		"accuracy": 100
	},
	"incinerate": {
		"id": "incinerate",
		"name": "Incinerate",
		"type": "FIRE",
		"category": "special",
		"power": 60,
		"pp": 15,
		"target": "aoe",
		"accuracy": 100
	},
	"nuzzle": {
		"id": "nuzzle",
		"name": "Nuzzle",
		"type": "ELECTRIC",
		"category": "physical",
		"power": 20,
		"pp": 20,
		"target": "single",
		"status": "paralysis",
		"statusChance": 100,
		"accuracy": 100
	},
	"thunderbolt": {
		"id": "thunderbolt",
		"name": "Thunderbolt",
		"type": "ELECTRIC",
		"category": "special",
		"power": 90,
		"pp": 15,
		"target": "single",
		"status": "paralysis",
		"statusChance": 10,
		"accuracy": 100
	},
	"wild_charge": {
		"id": "wild_charge",
		"name": "Wild Charge",
		"type": "ELECTRIC",
		"category": "physical",
		"power": 90,
		"pp": 15,
		"target": "single",
		"drainPercent": -25,
		"accuracy": 100
	},
	"magnet_bomb": {
		"id": "magnet_bomb",
		"name": "Magnet Bomb",
		"type": "STEEL",
		"category": "physical",
		"power": 60,
		"pp": 20,
		"target": "single",
		"accuracy": 100
	},
	"electric_terrain": {
		"id": "electric_terrain",
		"name": "Electric Terrain",
		"type": "ELECTRIC",
		"category": "status",
		"power": 0,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"charge_beam": {
		"id": "charge_beam",
		"name": "Charge Beam",
		"type": "ELECTRIC",
		"category": "special",
		"power": 50,
		"pp": 10,
		"target": "single",
		"statChanges": [{
			"stat": "atkEsp",
			"estagios": 1
		}],
		"statChance": 70,
		"accuracy": 90
	},
	"shock_wave": {
		"id": "shock_wave",
		"name": "Shock Wave",
		"type": "ELECTRIC",
		"category": "special",
		"power": 60,
		"pp": 20,
		"target": "single",
		"accuracy": 100
	},
	"thunder_punch": {
		"id": "thunder_punch",
		"name": "Thunder Punch",
		"type": "ELECTRIC",
		"category": "physical",
		"power": 75,
		"pp": 15,
		"target": "single",
		"status": "paralysis",
		"statusChance": 10,
		"accuracy": 100
	},
	"cotton_guard": {
		"id": "cotton_guard",
		"name": "Cotton Guard",
		"type": "GRASS",
		"category": "status",
		"power": 0,
		"pp": 10,
		"target": "single",
		"statChanges": [{
			"stat": "def",
			"estagios": 3
		}],
		"statChance": 100,
		"statTarget": "self",
		"accuracy": 100
	},
	"belch": {
		"id": "belch",
		"name": "Belch",
		"type": "POISON",
		"category": "special",
		"power": 120,
		"pp": 10,
		"target": "single",
		"accuracy": 90
	},
	"double_kick": {
		"id": "double_kick",
		"name": "Double Kick",
		"type": "FIGHTING",
		"category": "physical",
		"power": 30,
		"pp": 30,
		"target": "single",
		"accuracy": 100
	},
	"flatter": {
		"id": "flatter",
		"name": "Flatter",
		"type": "DARK",
		"category": "status",
		"power": 0,
		"pp": 15,
		"target": "single",
		"status": "confusion",
		"statusChance": 100,
		"statChanges": [{
			"stat": "atkEsp",
			"estagios": 1
		}],
		"statChance": 100,
		"accuracy": 100
	},
	"mean_look": {
		"id": "mean_look",
		"name": "Mean Look",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 5,
		"target": "single",
		"accuracy": 100
	},
	"quick_guard": {
		"id": "quick_guard",
		"name": "Quick Guard",
		"type": "FIGHTING",
		"category": "status",
		"power": 0,
		"pp": 15,
		"target": "single",
		"accuracy": 100
	},
	"poison_gas": {
		"id": "poison_gas",
		"name": "Poison Gas",
		"type": "POISON",
		"category": "status",
		"power": 0,
		"pp": 40,
		"target": "aoe",
		"status": "poison",
		"statusChance": 100,
		"accuracy": 90
	},
	"sludge": {
		"id": "sludge",
		"name": "Sludge",
		"type": "POISON",
		"category": "special",
		"power": 65,
		"pp": 20,
		"target": "single",
		"status": "poison",
		"statusChance": 30,
		"accuracy": 100
	},
	"sludge_bomb": {
		"id": "sludge_bomb",
		"name": "Sludge Bomb",
		"type": "POISON",
		"category": "special",
		"power": 90,
		"pp": 10,
		"target": "single",
		"status": "poison",
		"statusChance": 30,
		"accuracy": 100
	},
	"acid_armor": {
		"id": "acid_armor",
		"name": "Acid Armor",
		"type": "POISON",
		"category": "status",
		"power": 0,
		"pp": 20,
		"target": "single",
		"statChanges": [{
			"stat": "def",
			"estagios": 2
		}],
		"statChance": 100,
		"statTarget": "self",
		"accuracy": 100
	},
	"karate_chop": {
		"id": "karate_chop",
		"name": "Karate Chop",
		"type": "FIGHTING",
		"category": "physical",
		"power": 50,
		"pp": 25,
		"target": "single",
		"critStages": 1,
		"accuracy": 100
	},
	"cross_chop": {
		"id": "cross_chop",
		"name": "Cross Chop",
		"type": "FIGHTING",
		"category": "physical",
		"power": 100,
		"pp": 5,
		"target": "single",
		"critStages": 1,
		"accuracy": 80
	},
	"final_gambit": {
		"id": "final_gambit",
		"name": "Final Gambit",
		"type": "FIGHTING",
		"category": "special",
		"power": 0,
		"pp": 5,
		"target": "single",
		"accuracy": 100
	},
	"low_sweep": {
		"id": "low_sweep",
		"name": "Low Sweep",
		"type": "FIGHTING",
		"category": "physical",
		"power": 65,
		"pp": 20,
		"target": "single",
		"statChanges": [{
			"stat": "speed",
			"estagios": -1
		}],
		"statChance": 100,
		"accuracy": 100
	},
	"dual_chop": {
		"id": "dual_chop",
		"name": "Dual Chop",
		"type": "DRAGON",
		"category": "physical",
		"power": 40,
		"pp": 15,
		"target": "single",
		"accuracy": 90
	},
	"bulk_up": {
		"id": "bulk_up",
		"name": "Bulk Up",
		"type": "FIGHTING",
		"category": "status",
		"power": 0,
		"pp": 20,
		"target": "single",
		"statChanges": [{
			"stat": "atkFis",
			"estagios": 1
		}, {
			"stat": "def",
			"estagios": 1
		}],
		"statChance": 100,
		"statTarget": "self",
		"accuracy": 100
	},
	"dynamic_punch": {
		"id": "dynamic_punch",
		"name": "Dynamic Punch",
		"type": "FIGHTING",
		"category": "physical",
		"power": 100,
		"pp": 5,
		"target": "single",
		"status": "confusion",
		"statusChance": 100,
		"accuracy": 50
	},
	"strength": {
		"id": "strength",
		"name": "Strength",
		"type": "NORMAL",
		"category": "physical",
		"power": 80,
		"pp": 15,
		"target": "single",
		"accuracy": 100
	},
	"meditate": {
		"id": "meditate",
		"name": "Meditate",
		"type": "PSYCHIC",
		"category": "status",
		"power": 0,
		"pp": 40,
		"target": "single",
		"statChanges": [{
			"stat": "atkFis",
			"estagios": 1
		}],
		"statChance": 100,
		"statTarget": "self",
		"accuracy": 100
	},
	"mega_kick": {
		"id": "mega_kick",
		"name": "Mega Kick",
		"type": "NORMAL",
		"category": "physical",
		"power": 120,
		"pp": 5,
		"target": "single",
		"accuracy": 75
	},
	"rolling_kick": {
		"id": "rolling_kick",
		"name": "Rolling Kick",
		"type": "FIGHTING",
		"category": "physical",
		"power": 60,
		"pp": 15,
		"target": "single",
		"flinchChance": 30,
		"accuracy": 85
	},
	"high_jump_kick": {
		"id": "high_jump_kick",
		"name": "High Jump Kick",
		"type": "FIGHTING",
		"category": "physical",
		"power": 130,
		"pp": 10,
		"target": "single",
		"accuracy": 90
	},
	"blaze_kick": {
		"id": "blaze_kick",
		"name": "Blaze Kick",
		"type": "FIRE",
		"category": "physical",
		"power": 85,
		"pp": 10,
		"target": "single",
		"status": "burn",
		"statusChance": 10,
		"critStages": 1,
		"accuracy": 90
	},
	"focus_punch": {
		"id": "focus_punch",
		"name": "Focus Punch",
		"type": "FIGHTING",
		"category": "physical",
		"power": 150,
		"pp": 20,
		"target": "single",
		"accuracy": 100
	},
	"ice_punch": {
		"id": "ice_punch",
		"name": "Ice Punch",
		"type": "ICE",
		"category": "physical",
		"power": 75,
		"pp": 15,
		"target": "single",
		"status": "freeze",
		"statusChance": 10,
		"accuracy": 100
	},
	"draining_kiss": {
		"id": "draining_kiss",
		"name": "Draining Kiss",
		"type": "FAIRY",
		"category": "special",
		"power": 50,
		"pp": 10,
		"target": "single",
		"drainPercent": 75,
		"accuracy": 100
	},
	"lovely_kiss": {
		"id": "lovely_kiss",
		"name": "Lovely Kiss",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 10,
		"target": "single",
		"status": "sleep",
		"statusChance": 100,
		"accuracy": 75
	},
	"heart_stamp": {
		"id": "heart_stamp",
		"name": "Heart Stamp",
		"type": "PSYCHIC",
		"category": "physical",
		"power": 60,
		"pp": 25,
		"target": "single",
		"flinchChance": 30,
		"accuracy": 100
	},
	"avalanche": {
		"id": "avalanche",
		"name": "Avalanche",
		"type": "ICE",
		"category": "physical",
		"power": 60,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"present": {
		"id": "present",
		"name": "Present",
		"type": "NORMAL",
		"category": "physical",
		"power": 0,
		"pp": 15,
		"target": "single",
		"accuracy": 90
	},
	"steel_wing": {
		"id": "steel_wing",
		"name": "Steel Wing",
		"type": "STEEL",
		"category": "physical",
		"power": 70,
		"pp": 25,
		"target": "single",
		"statChanges": [{
			"stat": "def",
			"estagios": 1
		}],
		"statChance": 10,
		"accuracy": 90
	},
	"teleport": {
		"id": "teleport",
		"name": "Teleport",
		"type": "PSYCHIC",
		"category": "status",
		"power": 0,
		"pp": 20,
		"target": "single",
		"accuracy": 100
	},
	"stored_power": {
		"id": "stored_power",
		"name": "Stored Power",
		"type": "PSYCHIC",
		"category": "special",
		"power": 20,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"ominous_wind": {
		"id": "ominous_wind",
		"name": "Ominous Wind",
		"type": "GHOST",
		"category": "special",
		"power": 60,
		"pp": 5,
		"target": "single",
		"statChanges": [
			{
				"stat": "atkFis",
				"estagios": 1
			},
			{
				"stat": "def",
				"estagios": 1
			},
			{
				"stat": "atkEsp",
				"estagios": 1
			},
			{
				"stat": "defEsp",
				"estagios": 1
			},
			{
				"stat": "speed",
				"estagios": 1
			}
		],
		"statChance": 10,
		"accuracy": 100
	},
	"wish": {
		"id": "wish",
		"name": "Wish",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"kinesis": {
		"id": "kinesis",
		"name": "Kinesis",
		"type": "PSYCHIC",
		"category": "status",
		"power": 0,
		"pp": 15,
		"target": "single",
		"accuracy": 80
	},
	"telekinesis": {
		"id": "telekinesis",
		"name": "Telekinesis",
		"type": "PSYCHIC",
		"category": "status",
		"power": 0,
		"pp": 15,
		"target": "single",
		"accuracy": 100
	},
	"ally_switch": {
		"id": "ally_switch",
		"name": "Ally Switch",
		"type": "PSYCHIC",
		"category": "status",
		"power": 0,
		"pp": 15,
		"target": "single",
		"accuracy": 100
	},
	"trick": {
		"id": "trick",
		"name": "Trick",
		"type": "PSYCHIC",
		"category": "status",
		"power": 0,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"psyshock": {
		"id": "psyshock",
		"name": "Psyshock",
		"type": "PSYCHIC",
		"category": "special",
		"power": 80,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"nightmare": {
		"id": "nightmare",
		"name": "Nightmare",
		"type": "GHOST",
		"category": "status",
		"power": 0,
		"pp": 15,
		"target": "single",
		"accuracy": 100
	},
	"hidden_power": {
		"id": "hidden_power",
		"name": "Hidden Power",
		"type": "NORMAL",
		"category": "special",
		"power": 60,
		"pp": 15,
		"target": "single",
		"accuracy": 100
	},
	"shadow_ball": {
		"id": "shadow_ball",
		"name": "Shadow Ball",
		"type": "GHOST",
		"category": "special",
		"power": 80,
		"pp": 15,
		"target": "single",
		"statChanges": [{
			"stat": "defEsp",
			"estagios": -1
		}],
		"statChance": 20,
		"accuracy": 100
	},
	"shadow_punch": {
		"id": "shadow_punch",
		"name": "Shadow Punch",
		"type": "GHOST",
		"category": "physical",
		"power": 60,
		"pp": 20,
		"target": "single",
		"accuracy": 100
	},
	"pain_split": {
		"id": "pain_split",
		"name": "Pain Split",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 20,
		"target": "single",
		"accuracy": 100
	},
	"grudge": {
		"id": "grudge",
		"name": "Grudge",
		"type": "GHOST",
		"category": "status",
		"power": 0,
		"pp": 5,
		"target": "single",
		"accuracy": 100
	},
	"foul_play": {
		"id": "foul_play",
		"name": "Foul Play",
		"type": "DARK",
		"category": "physical",
		"power": 95,
		"pp": 15,
		"target": "single",
		"accuracy": 100
	},
	"torment": {
		"id": "torment",
		"name": "Torment",
		"type": "DARK",
		"category": "status",
		"power": 0,
		"pp": 15,
		"target": "single",
		"accuracy": 100
	},
	"quash": {
		"id": "quash",
		"name": "Quash",
		"type": "DARK",
		"category": "status",
		"power": 0,
		"pp": 15,
		"target": "single",
		"accuracy": 100
	},
	"hone_claws": {
		"id": "hone_claws",
		"name": "Hone Claws",
		"type": "DARK",
		"category": "status",
		"power": 0,
		"pp": 15,
		"target": "single",
		"statChanges": [{
			"stat": "atkFis",
			"estagios": 1
		}],
		"statChance": 100,
		"statTarget": "self",
		"accuracy": 100
	},
	"beat_up": {
		"id": "beat_up",
		"name": "Beat Up",
		"type": "DARK",
		"category": "physical",
		"power": 0,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"snatch": {
		"id": "snatch",
		"name": "Snatch",
		"type": "DARK",
		"category": "status",
		"power": 0,
		"pp": 10,
		"target": "single",
		"accuracy": 100
	},
	"howl": {
		"id": "howl",
		"name": "Howl",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 40,
		"target": "single",
		"statChanges": [{
			"stat": "atkFis",
			"estagios": 1
		}],
		"statChance": 100,
		"statTarget": "self",
		"accuracy": 100
	},
	"embargo": {
		"id": "embargo",
		"name": "Embargo",
		"type": "DARK",
		"category": "status",
		"power": 0,
		"pp": 15,
		"target": "single",
		"accuracy": 100
	},
	"dragon_tail": {
		"id": "dragon_tail",
		"name": "Dragon Tail",
		"type": "DRAGON",
		"category": "physical",
		"power": 60,
		"pp": 10,
		"target": "single",
		"accuracy": 90
	},
	"after_you": {
		"id": "after_you",
		"name": "After You",
		"type": "NORMAL",
		"category": "status",
		"power": 0,
		"pp": 15,
		"target": "single",
		"accuracy": 100
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
	STEEL: "#b0bec5",
	FAIRY: "#f5a9d0"
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
			pp: TYPED_AOE_PP,
			accuracy: 100
		};
	}
	return moves;
}
var TYPED_AOE_MOVES = buildTypedAoeMoves();
var TURNO_SEGUNDOS = createFormulaEngine(FORMULAS).eval("TURNO_SEGUNDOS");
var PP_REFERENCE = 20;
function cooldownFromPp(pp) {
	return TURNO_SEGUNDOS * (PP_REFERENCE / Math.max(1, pp));
}
var BASIC_ATTACK = {
	id: "basic_attack",
	name: "Ataque Basico",
	category: "physical",
	type: "NORMAL",
	target: "single",
	power: 40,
	pp: 35,
	accuracy: 100
};
var AOE_ABILITY_KEYS = new Set(Object.keys(TYPED_AOE_MOVES));
var ALL_ABILITIES_SOURCE = {
	...ABILITIES_DATA,
	...TYPED_AOE_MOVES
};
var ABILITIES = Object.fromEntries(Object.entries(ALL_ABILITIES_SOURCE).map(([key, ability]) => {
	const isAoe = AOE_ABILITY_KEYS.has(key) || "target" in ability && ability.target === "aoe";
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
var DANO_SEM_PODER_BASE = /* @__PURE__ */ new Set([
	"magnitude",
	"reversal",
	"flail",
	"present",
	"hidden_power",
	"seismic_toss",
	"night_shade",
	"dragon_rage",
	"super_fang",
	"psywave",
	"counter",
	"mirror_coat"
]);
function isDamagingAbility(ability) {
	if (!ability) return false;
	return ability.power > 0 || DANO_SEM_PODER_BASE.has(ability.id);
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
		"baseExp": 62,
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
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "scratch",
				"levelReq": 1
			},
			{
				"key": "ember",
				"levelReq": 7
			},
			{
				"key": "smokescreen",
				"levelReq": 10
			},
			{
				"key": "dragon_rage",
				"levelReq": 16
			},
			{
				"key": "scary_face",
				"levelReq": 19
			},
			{
				"key": "fire_fang",
				"levelReq": 25
			},
			{
				"key": "flame_burst",
				"levelReq": 28
			},
			{
				"key": "slash",
				"levelReq": 34
			},
			{
				"key": "flamethrower",
				"levelReq": 37
			},
			{
				"key": "fire_spin",
				"levelReq": 43
			},
			{
				"key": "inferno",
				"levelReq": 46
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
		"baseExp": 63,
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
				"key": "water_gun",
				"levelReq": 7
			},
			{
				"key": "withdraw",
				"levelReq": 10
			},
			{
				"key": "bubble",
				"levelReq": 13
			},
			{
				"key": "bite",
				"levelReq": 16
			},
			{
				"key": "rapid_spin",
				"levelReq": 19
			},
			{
				"key": "protect",
				"levelReq": 22
			},
			{
				"key": "water_pulse",
				"levelReq": 25
			},
			{
				"key": "aqua_tail",
				"levelReq": 28
			},
			{
				"key": "skull_bash",
				"levelReq": 31
			},
			{
				"key": "iron_defense",
				"levelReq": 34
			},
			{
				"key": "rain_dance",
				"levelReq": 37
			},
			{
				"key": "hydro_pump",
				"levelReq": 40
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
				"levelReq": 3
			},
			{
				"key": "leech_seed",
				"levelReq": 7
			},
			{
				"key": "vine_whip",
				"levelReq": 9
			},
			{
				"key": "poison_powder",
				"levelReq": 13
			},
			{
				"key": "sleep_powder",
				"levelReq": 13
			},
			{
				"key": "take_down",
				"levelReq": 15
			},
			{
				"key": "razor_leaf",
				"levelReq": 19
			},
			{
				"key": "sweet_scent",
				"levelReq": 21
			},
			{
				"key": "growth",
				"levelReq": 25
			},
			{
				"key": "double_edge",
				"levelReq": 27
			},
			{
				"key": "worry_seed",
				"levelReq": 31
			},
			{
				"key": "synthesis",
				"levelReq": 33
			},
			{
				"key": "seed_bomb",
				"levelReq": 37
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
		"baseExp": 261,
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
				"levelReq": 8
			},
			{
				"key": "ice_shard",
				"levelReq": 15
			},
			{
				"key": "mind_reader",
				"levelReq": 22
			},
			{
				"key": "ancient_power",
				"levelReq": 29
			},
			{
				"key": "agility",
				"levelReq": 36
			},
			{
				"key": "freeze_dry",
				"levelReq": 43
			},
			{
				"key": "reflect",
				"levelReq": 50
			},
			{
				"key": "hail",
				"levelReq": 57
			},
			{
				"key": "tailwind",
				"levelReq": 64
			},
			{
				"key": "ice_beam",
				"levelReq": 71
			},
			{
				"key": "blizzard",
				"levelReq": 78
			},
			{
				"key": "roost",
				"levelReq": 85
			},
			{
				"key": "hurricane",
				"levelReq": 92
			},
			{
				"key": "sheer_cold",
				"levelReq": 99
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
		"baseExp": 261,
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
				"key": "thunder_shock",
				"levelReq": 1
			},
			{
				"key": "thunder_wave",
				"levelReq": 8
			},
			{
				"key": "detect",
				"levelReq": 15
			},
			{
				"key": "pluck",
				"levelReq": 22
			},
			{
				"key": "ancient_power",
				"levelReq": 29
			},
			{
				"key": "charge",
				"levelReq": 36
			},
			{
				"key": "agility",
				"levelReq": 43
			},
			{
				"key": "discharge",
				"levelReq": 50
			},
			{
				"key": "rain_dance",
				"levelReq": 57
			},
			{
				"key": "light_screen",
				"levelReq": 64
			},
			{
				"key": "drill_peck",
				"levelReq": 71
			},
			{
				"key": "thunder",
				"levelReq": 78
			},
			{
				"key": "roost",
				"levelReq": 85
			},
			{
				"key": "magnetic_flux",
				"levelReq": 92
			},
			{
				"key": "zap_cannon",
				"levelReq": 99
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
		"baseExp": 261,
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
				"key": "ember",
				"levelReq": 1
			},
			{
				"key": "wing_attack",
				"levelReq": 1
			},
			{
				"key": "fire_spin",
				"levelReq": 8
			},
			{
				"key": "agility",
				"levelReq": 15
			},
			{
				"key": "endure",
				"levelReq": 22
			},
			{
				"key": "ancient_power",
				"levelReq": 29
			},
			{
				"key": "flamethrower",
				"levelReq": 36
			},
			{
				"key": "safeguard",
				"levelReq": 43
			},
			{
				"key": "air_slash",
				"levelReq": 50
			},
			{
				"key": "sunny_day",
				"levelReq": 57
			},
			{
				"key": "heat_wave",
				"levelReq": 64
			},
			{
				"key": "solar_beam",
				"levelReq": 71
			},
			{
				"key": "sky_attack",
				"levelReq": 78
			},
			{
				"key": "roost",
				"levelReq": 85
			},
			{
				"key": "hurricane",
				"levelReq": 92
			},
			{
				"key": "burn_up",
				"levelReq": 99
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
		"baseExp": 261,
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
				"key": "discharge",
				"levelReq": 1
			},
			{
				"key": "extrasensory",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "thunder_shock",
				"levelReq": 8
			},
			{
				"key": "roar",
				"levelReq": 15
			},
			{
				"key": "quick_attack",
				"levelReq": 22
			},
			{
				"key": "spark",
				"levelReq": 29
			},
			{
				"key": "reflect",
				"levelReq": 36
			},
			{
				"key": "crunch",
				"levelReq": 43
			},
			{
				"key": "thunder_fang",
				"levelReq": 50
			},
			{
				"key": "discharge",
				"levelReq": 57
			},
			{
				"key": "extrasensory",
				"levelReq": 64
			},
			{
				"key": "rain_dance",
				"levelReq": 71
			},
			{
				"key": "calm_mind",
				"levelReq": 78
			},
			{
				"key": "thunder",
				"levelReq": 85
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
		"baseExp": 261,
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
				"key": "eruption",
				"levelReq": 1
			},
			{
				"key": "extrasensory",
				"levelReq": 1
			},
			{
				"key": "lava_plume",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "sacred_fire",
				"levelReq": 1
			},
			{
				"key": "ember",
				"levelReq": 8
			},
			{
				"key": "roar",
				"levelReq": 15
			},
			{
				"key": "fire_spin",
				"levelReq": 22
			},
			{
				"key": "stomp",
				"levelReq": 29
			},
			{
				"key": "flamethrower",
				"levelReq": 36
			},
			{
				"key": "swagger",
				"levelReq": 43
			},
			{
				"key": "fire_fang",
				"levelReq": 50
			},
			{
				"key": "lava_plume",
				"levelReq": 57
			},
			{
				"key": "extrasensory",
				"levelReq": 64
			},
			{
				"key": "fire_blast",
				"levelReq": 71
			},
			{
				"key": "calm_mind",
				"levelReq": 78
			},
			{
				"key": "eruption",
				"levelReq": 85
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
		"baseExp": 261,
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
				"key": "bubble_beam",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "rain_dance",
				"levelReq": 1
			},
			{
				"key": "sheer_cold",
				"levelReq": 1
			},
			{
				"key": "bubble_beam",
				"levelReq": 8
			},
			{
				"key": "rain_dance",
				"levelReq": 15
			},
			{
				"key": "gust",
				"levelReq": 22
			},
			{
				"key": "aurora_beam",
				"levelReq": 29
			},
			{
				"key": "mist",
				"levelReq": 36
			},
			{
				"key": "mirror_coat",
				"levelReq": 43
			},
			{
				"key": "ice_fang",
				"levelReq": 50
			},
			{
				"key": "tailwind",
				"levelReq": 57
			},
			{
				"key": "extrasensory",
				"levelReq": 64
			},
			{
				"key": "hydro_pump",
				"levelReq": 71
			},
			{
				"key": "calm_mind",
				"levelReq": 78
			},
			{
				"key": "blizzard",
				"levelReq": 85
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
		"baseExp": 306,
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
				"key": "weather_ball",
				"levelReq": 1
			},
			{
				"key": "whirlwind",
				"levelReq": 1
			},
			{
				"key": "gust",
				"levelReq": 9
			},
			{
				"key": "dragon_rush",
				"levelReq": 15
			},
			{
				"key": "extrasensory",
				"levelReq": 23
			},
			{
				"key": "rain_dance",
				"levelReq": 29
			},
			{
				"key": "hydro_pump",
				"levelReq": 37
			},
			{
				"key": "aeroblast",
				"levelReq": 43
			},
			{
				"key": "punishment",
				"levelReq": 50
			},
			{
				"key": "ancient_power",
				"levelReq": 57
			},
			{
				"key": "safeguard",
				"levelReq": 65
			},
			{
				"key": "recover",
				"levelReq": 71
			},
			{
				"key": "future_sight",
				"levelReq": 79
			},
			{
				"key": "natural_gift",
				"levelReq": 85
			},
			{
				"key": "calm_mind",
				"levelReq": 93
			},
			{
				"key": "sky_attack",
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
		"baseExp": 306,
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
				"key": "weather_ball",
				"levelReq": 1
			},
			{
				"key": "whirlwind",
				"levelReq": 1
			},
			{
				"key": "gust",
				"levelReq": 9
			},
			{
				"key": "brave_bird",
				"levelReq": 15
			},
			{
				"key": "extrasensory",
				"levelReq": 23
			},
			{
				"key": "sunny_day",
				"levelReq": 29
			},
			{
				"key": "fire_blast",
				"levelReq": 37
			},
			{
				"key": "sacred_fire",
				"levelReq": 43
			},
			{
				"key": "punishment",
				"levelReq": 50
			},
			{
				"key": "ancient_power",
				"levelReq": 57
			},
			{
				"key": "safeguard",
				"levelReq": 65
			},
			{
				"key": "recover",
				"levelReq": 71
			},
			{
				"key": "future_sight",
				"levelReq": 79
			},
			{
				"key": "natural_gift",
				"levelReq": 85
			},
			{
				"key": "calm_mind",
				"levelReq": 93
			},
			{
				"key": "sky_attack",
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
		"baseExp": 270,
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
				"key": "confusion",
				"levelReq": 1
			},
			{
				"key": "heal_bell",
				"levelReq": 1
			},
			{
				"key": "leech_seed",
				"levelReq": 1
			},
			{
				"key": "recover",
				"levelReq": 1
			},
			{
				"key": "safeguard",
				"levelReq": 10
			},
			{
				"key": "magical_leaf",
				"levelReq": 19
			},
			{
				"key": "ancient_power",
				"levelReq": 28
			},
			{
				"key": "baton_pass",
				"levelReq": 37
			},
			{
				"key": "natural_gift",
				"levelReq": 46
			},
			{
				"key": "heal_block",
				"levelReq": 55
			},
			{
				"key": "future_sight",
				"levelReq": 64
			},
			{
				"key": "healing_wish",
				"levelReq": 73
			},
			{
				"key": "leaf_storm",
				"levelReq": 82
			},
			{
				"key": "perish_song",
				"levelReq": 91
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
		"baseExp": 306,
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
				"key": "laser_focus",
				"levelReq": 1
			},
			{
				"key": "psywave",
				"levelReq": 1
			},
			{
				"key": "safeguard",
				"levelReq": 1
			},
			{
				"key": "swift",
				"levelReq": 8
			},
			{
				"key": "future_sight",
				"levelReq": 15
			},
			{
				"key": "psych_up",
				"levelReq": 22
			},
			{
				"key": "miracle_eye",
				"levelReq": 29
			},
			{
				"key": "psycho_cut",
				"levelReq": 36
			},
			{
				"key": "guard_swap",
				"levelReq": 43
			},
			{
				"key": "power_swap",
				"levelReq": 43
			},
			{
				"key": "recover",
				"levelReq": 50
			},
			{
				"key": "psychic",
				"levelReq": 57
			},
			{
				"key": "barrier",
				"levelReq": 64
			},
			{
				"key": "aura_sphere",
				"levelReq": 70
			},
			{
				"key": "amnesia",
				"levelReq": 79
			},
			{
				"key": "mist",
				"levelReq": 86
			},
			{
				"key": "me_first",
				"levelReq": 93
			},
			{
				"key": "psystrike",
				"levelReq": 100
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
		"baseExp": 270,
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
				"key": "reflect_type",
				"levelReq": 1
			},
			{
				"key": "transform",
				"levelReq": 1
			},
			{
				"key": "mega_punch",
				"levelReq": 10
			},
			{
				"key": "metronome",
				"levelReq": 20
			},
			{
				"key": "psychic",
				"levelReq": 30
			},
			{
				"key": "barrier",
				"levelReq": 40
			},
			{
				"key": "ancient_power",
				"levelReq": 50
			},
			{
				"key": "amnesia",
				"levelReq": 60
			},
			{
				"key": "me_first",
				"levelReq": 70
			},
			{
				"key": "baton_pass",
				"levelReq": 80
			},
			{
				"key": "nasty_plot",
				"levelReq": 90
			},
			{
				"key": "aura_sphere",
				"levelReq": 100
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
		"baseExp": 60,
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
				"key": "defense_curl",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "mud_sport",
				"levelReq": 4
			},
			{
				"key": "rock_polish",
				"levelReq": 6
			},
			{
				"key": "rollout",
				"levelReq": 10
			},
			{
				"key": "magnitude",
				"levelReq": 12
			},
			{
				"key": "rock_throw",
				"levelReq": 16
			},
			{
				"key": "smack_down",
				"levelReq": 18
			},
			{
				"key": "bulldoze",
				"levelReq": 22
			},
			{
				"key": "self_destruct",
				"levelReq": 24
			},
			{
				"key": "stealth_rock",
				"levelReq": 28
			},
			{
				"key": "rock_blast",
				"levelReq": 30
			},
			{
				"key": "earthquake",
				"levelReq": 34
			},
			{
				"key": "explosion",
				"levelReq": 36
			},
			{
				"key": "double_edge",
				"levelReq": 40
			},
			{
				"key": "stone_edge",
				"levelReq": 42
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
		"baseExp": 52,
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
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "peck",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 4
			},
			{
				"key": "pursuit",
				"levelReq": 8
			},
			{
				"key": "fury_attack",
				"levelReq": 11
			},
			{
				"key": "aerial_ace",
				"levelReq": 15
			},
			{
				"key": "mirror_move",
				"levelReq": 18
			},
			{
				"key": "assurance",
				"levelReq": 22
			},
			{
				"key": "agility",
				"levelReq": 25
			},
			{
				"key": "focus_energy",
				"levelReq": 29
			},
			{
				"key": "roost",
				"levelReq": 32
			},
			{
				"key": "drill_peck",
				"levelReq": 36
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
		"baseExp": 51,
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
				"levelReq": 4
			},
			{
				"key": "focus_energy",
				"levelReq": 7
			},
			{
				"key": "bite",
				"levelReq": 10
			},
			{
				"key": "pursuit",
				"levelReq": 13
			},
			{
				"key": "hyper_fang",
				"levelReq": 16
			},
			{
				"key": "assurance",
				"levelReq": 19
			},
			{
				"key": "crunch",
				"levelReq": 22
			},
			{
				"key": "sucker_punch",
				"levelReq": 25
			},
			{
				"key": "super_fang",
				"levelReq": 28
			},
			{
				"key": "double_edge",
				"levelReq": 31
			},
			{
				"key": "endeavor",
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
		"baseExp": 142,
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
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "leech_seed",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 3
			},
			{
				"key": "leech_seed",
				"levelReq": 7
			},
			{
				"key": "vine_whip",
				"levelReq": 9
			},
			{
				"key": "poison_powder",
				"levelReq": 13
			},
			{
				"key": "sleep_powder",
				"levelReq": 13
			},
			{
				"key": "take_down",
				"levelReq": 15
			},
			{
				"key": "razor_leaf",
				"levelReq": 20
			},
			{
				"key": "sweet_scent",
				"levelReq": 23
			},
			{
				"key": "growth",
				"levelReq": 28
			},
			{
				"key": "double_edge",
				"levelReq": 31
			},
			{
				"key": "worry_seed",
				"levelReq": 36
			},
			{
				"key": "synthesis",
				"levelReq": 39
			},
			{
				"key": "solar_beam",
				"levelReq": 44
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
		"baseExp": 236,
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
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "leech_seed",
				"levelReq": 1
			},
			{
				"key": "petal_dance",
				"levelReq": 1
			},
			{
				"key": "petal_dance",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "vine_whip",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 3
			},
			{
				"key": "leech_seed",
				"levelReq": 7
			},
			{
				"key": "vine_whip",
				"levelReq": 9
			},
			{
				"key": "poison_powder",
				"levelReq": 13
			},
			{
				"key": "sleep_powder",
				"levelReq": 13
			},
			{
				"key": "take_down",
				"levelReq": 15
			},
			{
				"key": "razor_leaf",
				"levelReq": 20
			},
			{
				"key": "sweet_scent",
				"levelReq": 23
			},
			{
				"key": "growth",
				"levelReq": 28
			},
			{
				"key": "double_edge",
				"levelReq": 31
			},
			{
				"key": "worry_seed",
				"levelReq": 39
			},
			{
				"key": "synthesis",
				"levelReq": 45
			},
			{
				"key": "petal_blizzard",
				"levelReq": 50
			},
			{
				"key": "solar_beam",
				"levelReq": 53
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
		"baseExp": 64,
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
				"key": "growth",
				"levelReq": 1
			},
			{
				"key": "sweet_scent",
				"levelReq": 5
			},
			{
				"key": "acid",
				"levelReq": 9
			},
			{
				"key": "poison_powder",
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
				"key": "mega_drain",
				"levelReq": 19
			},
			{
				"key": "lucky_chant",
				"levelReq": 23
			},
			{
				"key": "moonlight",
				"levelReq": 27
			},
			{
				"key": "giga_drain",
				"levelReq": 31
			},
			{
				"key": "toxic",
				"levelReq": 35
			},
			{
				"key": "natural_gift",
				"levelReq": 39
			},
			{
				"key": "moonblast",
				"levelReq": 43
			},
			{
				"key": "grassy_terrain",
				"levelReq": 47
			},
			{
				"key": "petal_dance",
				"levelReq": 51
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
		"baseExp": 138,
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
				"key": "acid",
				"levelReq": 1
			},
			{
				"key": "growth",
				"levelReq": 1
			},
			{
				"key": "sweet_scent",
				"levelReq": 1
			},
			{
				"key": "sweet_scent",
				"levelReq": 5
			},
			{
				"key": "acid",
				"levelReq": 9
			},
			{
				"key": "poison_powder",
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
				"key": "mega_drain",
				"levelReq": 19
			},
			{
				"key": "lucky_chant",
				"levelReq": 24
			},
			{
				"key": "moonlight",
				"levelReq": 29
			},
			{
				"key": "giga_drain",
				"levelReq": 34
			},
			{
				"key": "toxic",
				"levelReq": 39
			},
			{
				"key": "natural_gift",
				"levelReq": 44
			},
			{
				"key": "petal_blizzard",
				"levelReq": 49
			},
			{
				"key": "grassy_terrain",
				"levelReq": 54
			},
			{
				"key": "petal_dance",
				"levelReq": 59
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
		"baseExp": 60,
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
				"levelReq": 7
			},
			{
				"key": "wrap",
				"levelReq": 11
			},
			{
				"key": "sleep_powder",
				"levelReq": 13
			},
			{
				"key": "poison_powder",
				"levelReq": 15
			},
			{
				"key": "stun_spore",
				"levelReq": 17
			},
			{
				"key": "acid",
				"levelReq": 23
			},
			{
				"key": "knock_off",
				"levelReq": 27
			},
			{
				"key": "sweet_scent",
				"levelReq": 29
			},
			{
				"key": "gastro_acid",
				"levelReq": 35
			},
			{
				"key": "razor_leaf",
				"levelReq": 39
			},
			{
				"key": "poison_jab",
				"levelReq": 41
			},
			{
				"key": "slam",
				"levelReq": 47
			},
			{
				"key": "wring_out",
				"levelReq": 50
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
		"baseExp": 137,
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
				"key": "growth",
				"levelReq": 1
			},
			{
				"key": "vine_whip",
				"levelReq": 1
			},
			{
				"key": "wrap",
				"levelReq": 1
			},
			{
				"key": "growth",
				"levelReq": 7
			},
			{
				"key": "wrap",
				"levelReq": 11
			},
			{
				"key": "sleep_powder",
				"levelReq": 13
			},
			{
				"key": "poison_powder",
				"levelReq": 15
			},
			{
				"key": "stun_spore",
				"levelReq": 17
			},
			{
				"key": "acid",
				"levelReq": 24
			},
			{
				"key": "knock_off",
				"levelReq": 29
			},
			{
				"key": "sweet_scent",
				"levelReq": 32
			},
			{
				"key": "gastro_acid",
				"levelReq": 39
			},
			{
				"key": "razor_leaf",
				"levelReq": 44
			},
			{
				"key": "poison_jab",
				"levelReq": 47
			},
			{
				"key": "slam",
				"levelReq": 54
			},
			{
				"key": "wring_out",
				"levelReq": 58
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
		"baseExp": 221,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 80,
			"atkFis": 105,
			"atkEsp": 100,
			"def": 65,
			"defEsp": 70,
			"speed": 70
		},
		"abilities": [
			{
				"key": "leaf_tornado",
				"levelReq": 1
			},
			{
				"key": "leaf_tornado",
				"levelReq": 1
			},
			{
				"key": "razor_leaf",
				"levelReq": 1
			},
			{
				"key": "sleep_powder",
				"levelReq": 1
			},
			{
				"key": "spit_up",
				"levelReq": 1
			},
			{
				"key": "stockpile",
				"levelReq": 1
			},
			{
				"key": "swallow",
				"levelReq": 1
			},
			{
				"key": "sweet_scent",
				"levelReq": 1
			},
			{
				"key": "vine_whip",
				"levelReq": 1
			},
			{
				"key": "leaf_storm",
				"levelReq": 32
			},
			{
				"key": "leaf_blade",
				"levelReq": 44
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
		"baseExp": 65,
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
				"key": "uproar",
				"levelReq": 1
			},
			{
				"key": "reflect",
				"levelReq": 7
			},
			{
				"key": "leech_seed",
				"levelReq": 11
			},
			{
				"key": "bullet_seed",
				"levelReq": 17
			},
			{
				"key": "stun_spore",
				"levelReq": 19
			},
			{
				"key": "poison_powder",
				"levelReq": 21
			},
			{
				"key": "sleep_powder",
				"levelReq": 23
			},
			{
				"key": "confusion",
				"levelReq": 27
			},
			{
				"key": "worry_seed",
				"levelReq": 33
			},
			{
				"key": "natural_gift",
				"levelReq": 37
			},
			{
				"key": "solar_beam",
				"levelReq": 43
			},
			{
				"key": "extrasensory",
				"levelReq": 47
			},
			{
				"key": "bestow",
				"levelReq": 50
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
		"baseExp": 87,
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
				"key": "ingrain",
				"levelReq": 1
			},
			{
				"key": "sleep_powder",
				"levelReq": 4
			},
			{
				"key": "vine_whip",
				"levelReq": 7
			},
			{
				"key": "absorb",
				"levelReq": 10
			},
			{
				"key": "poison_powder",
				"levelReq": 14
			},
			{
				"key": "bind",
				"levelReq": 17
			},
			{
				"key": "growth",
				"levelReq": 20
			},
			{
				"key": "mega_drain",
				"levelReq": 23
			},
			{
				"key": "knock_off",
				"levelReq": 27
			},
			{
				"key": "stun_spore",
				"levelReq": 30
			},
			{
				"key": "natural_gift",
				"levelReq": 33
			},
			{
				"key": "giga_drain",
				"levelReq": 36
			},
			{
				"key": "ancient_power",
				"levelReq": 38
			},
			{
				"key": "slam",
				"levelReq": 41
			},
			{
				"key": "tickle",
				"levelReq": 44
			},
			{
				"key": "wring_out",
				"levelReq": 46
			},
			{
				"key": "grassy_terrain",
				"levelReq": 48
			},
			{
				"key": "power_whip",
				"levelReq": 50
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
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "razor_leaf",
				"levelReq": 6
			},
			{
				"key": "poison_powder",
				"levelReq": 9
			},
			{
				"key": "synthesis",
				"levelReq": 12
			},
			{
				"key": "reflect",
				"levelReq": 17
			},
			{
				"key": "magical_leaf",
				"levelReq": 20
			},
			{
				"key": "natural_gift",
				"levelReq": 23
			},
			{
				"key": "sweet_scent",
				"levelReq": 28
			},
			{
				"key": "light_screen",
				"levelReq": 31
			},
			{
				"key": "body_slam",
				"levelReq": 34
			},
			{
				"key": "safeguard",
				"levelReq": 39
			},
			{
				"key": "aromatherapy",
				"levelReq": 42
			},
			{
				"key": "solar_beam",
				"levelReq": 45
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
		"baseExp": 142,
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
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "poison_powder",
				"levelReq": 1
			},
			{
				"key": "razor_leaf",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "razor_leaf",
				"levelReq": 6
			},
			{
				"key": "poison_powder",
				"levelReq": 9
			},
			{
				"key": "synthesis",
				"levelReq": 12
			},
			{
				"key": "reflect",
				"levelReq": 18
			},
			{
				"key": "magical_leaf",
				"levelReq": 22
			},
			{
				"key": "natural_gift",
				"levelReq": 26
			},
			{
				"key": "sweet_scent",
				"levelReq": 32
			},
			{
				"key": "light_screen",
				"levelReq": 36
			},
			{
				"key": "body_slam",
				"levelReq": 40
			},
			{
				"key": "safeguard",
				"levelReq": 46
			},
			{
				"key": "aromatherapy",
				"levelReq": 50
			},
			{
				"key": "solar_beam",
				"levelReq": 54
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
		"baseExp": 236,
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
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "petal_blizzard",
				"levelReq": 1
			},
			{
				"key": "petal_dance",
				"levelReq": 1
			},
			{
				"key": "petal_dance",
				"levelReq": 1
			},
			{
				"key": "poison_powder",
				"levelReq": 1
			},
			{
				"key": "razor_leaf",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "razor_leaf",
				"levelReq": 6
			},
			{
				"key": "poison_powder",
				"levelReq": 9
			},
			{
				"key": "synthesis",
				"levelReq": 12
			},
			{
				"key": "reflect",
				"levelReq": 18
			},
			{
				"key": "magical_leaf",
				"levelReq": 22
			},
			{
				"key": "natural_gift",
				"levelReq": 26
			},
			{
				"key": "sweet_scent",
				"levelReq": 34
			},
			{
				"key": "light_screen",
				"levelReq": 40
			},
			{
				"key": "body_slam",
				"levelReq": 46
			},
			{
				"key": "safeguard",
				"levelReq": 54
			},
			{
				"key": "aromatherapy",
				"levelReq": 60
			},
			{
				"key": "solar_beam",
				"levelReq": 66
			},
			{
				"key": "petal_blizzard",
				"levelReq": 70
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
		"baseExp": 50,
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
				"key": "absorb",
				"levelReq": 1
			},
			{
				"key": "splash",
				"levelReq": 1
			},
			{
				"key": "synthesis",
				"levelReq": 4
			},
			{
				"key": "tail_whip",
				"levelReq": 6
			},
			{
				"key": "tackle",
				"levelReq": 8
			},
			{
				"key": "fairy_wind",
				"levelReq": 10
			},
			{
				"key": "poison_powder",
				"levelReq": 12
			},
			{
				"key": "stun_spore",
				"levelReq": 14
			},
			{
				"key": "sleep_powder",
				"levelReq": 16
			},
			{
				"key": "bullet_seed",
				"levelReq": 19
			},
			{
				"key": "leech_seed",
				"levelReq": 22
			},
			{
				"key": "mega_drain",
				"levelReq": 25
			},
			{
				"key": "acrobatics",
				"levelReq": 28
			},
			{
				"key": "rage_powder",
				"levelReq": 31
			},
			{
				"key": "cotton_spore",
				"levelReq": 34
			},
			{
				"key": "u_turn",
				"levelReq": 37
			},
			{
				"key": "worry_seed",
				"levelReq": 40
			},
			{
				"key": "giga_drain",
				"levelReq": 43
			},
			{
				"key": "bounce",
				"levelReq": 46
			},
			{
				"key": "memento",
				"levelReq": 49
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
		"baseExp": 119,
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
				"key": "absorb",
				"levelReq": 1
			},
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
				"key": "synthesis",
				"levelReq": 4
			},
			{
				"key": "tail_whip",
				"levelReq": 6
			},
			{
				"key": "tackle",
				"levelReq": 8
			},
			{
				"key": "fairy_wind",
				"levelReq": 10
			},
			{
				"key": "poison_powder",
				"levelReq": 12
			},
			{
				"key": "stun_spore",
				"levelReq": 14
			},
			{
				"key": "sleep_powder",
				"levelReq": 16
			},
			{
				"key": "bullet_seed",
				"levelReq": 20
			},
			{
				"key": "leech_seed",
				"levelReq": 24
			},
			{
				"key": "mega_drain",
				"levelReq": 28
			},
			{
				"key": "acrobatics",
				"levelReq": 32
			},
			{
				"key": "rage_powder",
				"levelReq": 36
			},
			{
				"key": "cotton_spore",
				"levelReq": 40
			},
			{
				"key": "u_turn",
				"levelReq": 44
			},
			{
				"key": "worry_seed",
				"levelReq": 48
			},
			{
				"key": "giga_drain",
				"levelReq": 52
			},
			{
				"key": "bounce",
				"levelReq": 56
			},
			{
				"key": "memento",
				"levelReq": 60
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
		"baseExp": 207,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 75,
			"atkFis": 55,
			"atkEsp": 55,
			"def": 70,
			"defEsp": 95,
			"speed": 110
		},
		"abilities": [
			{
				"key": "absorb",
				"levelReq": 1
			},
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
				"key": "synthesis",
				"levelReq": 4
			},
			{
				"key": "tail_whip",
				"levelReq": 6
			},
			{
				"key": "tackle",
				"levelReq": 8
			},
			{
				"key": "fairy_wind",
				"levelReq": 10
			},
			{
				"key": "poison_powder",
				"levelReq": 12
			},
			{
				"key": "stun_spore",
				"levelReq": 14
			},
			{
				"key": "sleep_powder",
				"levelReq": 16
			},
			{
				"key": "bullet_seed",
				"levelReq": 20
			},
			{
				"key": "leech_seed",
				"levelReq": 24
			},
			{
				"key": "mega_drain",
				"levelReq": 29
			},
			{
				"key": "acrobatics",
				"levelReq": 34
			},
			{
				"key": "rage_powder",
				"levelReq": 39
			},
			{
				"key": "cotton_spore",
				"levelReq": 44
			},
			{
				"key": "u_turn",
				"levelReq": 49
			},
			{
				"key": "worry_seed",
				"levelReq": 54
			},
			{
				"key": "giga_drain",
				"levelReq": 59
			},
			{
				"key": "bounce",
				"levelReq": 64
			},
			{
				"key": "memento",
				"levelReq": 69
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
		"baseExp": 36,
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
				"levelReq": 1
			},
			{
				"key": "ingrain",
				"levelReq": 4
			},
			{
				"key": "grass_whistle",
				"levelReq": 7
			},
			{
				"key": "mega_drain",
				"levelReq": 10
			},
			{
				"key": "leech_seed",
				"levelReq": 13
			},
			{
				"key": "razor_leaf",
				"levelReq": 16
			},
			{
				"key": "worry_seed",
				"levelReq": 19
			},
			{
				"key": "giga_drain",
				"levelReq": 22
			},
			{
				"key": "endeavor",
				"levelReq": 25
			},
			{
				"key": "synthesis",
				"levelReq": 28
			},
			{
				"key": "natural_gift",
				"levelReq": 31
			},
			{
				"key": "solar_beam",
				"levelReq": 34
			},
			{
				"key": "double_edge",
				"levelReq": 37
			},
			{
				"key": "sunny_day",
				"levelReq": 40
			},
			{
				"key": "seed_bomb",
				"levelReq": 43
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
		"baseExp": 149,
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
				"key": "flower_shield",
				"levelReq": 1
			},
			{
				"key": "growth",
				"levelReq": 1
			},
			{
				"key": "pound",
				"levelReq": 1
			},
			{
				"key": "ingrain",
				"levelReq": 4
			},
			{
				"key": "grass_whistle",
				"levelReq": 7
			},
			{
				"key": "mega_drain",
				"levelReq": 10
			},
			{
				"key": "leech_seed",
				"levelReq": 13
			},
			{
				"key": "razor_leaf",
				"levelReq": 16
			},
			{
				"key": "worry_seed",
				"levelReq": 19
			},
			{
				"key": "giga_drain",
				"levelReq": 22
			},
			{
				"key": "bullet_seed",
				"levelReq": 25
			},
			{
				"key": "petal_dance",
				"levelReq": 28
			},
			{
				"key": "natural_gift",
				"levelReq": 31
			},
			{
				"key": "solar_beam",
				"levelReq": 34
			},
			{
				"key": "double_edge",
				"levelReq": 37
			},
			{
				"key": "sunny_day",
				"levelReq": 40
			},
			{
				"key": "leaf_storm",
				"levelReq": 43
			},
			{
				"key": "petal_blizzard",
				"levelReq": 50
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
		"baseExp": 39,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 45,
			"atkFis": 30,
			"atkEsp": 20,
			"def": 35,
			"defEsp": 20,
			"speed": 45
		},
		"abilities": [
			{
				"key": "string_shot",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "bug_bite",
				"levelReq": 9
			}
		],
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
			"levelReq": 1
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
		"baseExp": 178,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 60,
			"atkFis": 45,
			"atkEsp": 90,
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
				"key": "gust",
				"levelReq": 1
			},
			{
				"key": "gust",
				"levelReq": 1
			},
			{
				"key": "confusion",
				"levelReq": 11
			},
			{
				"key": "poison_powder",
				"levelReq": 13
			},
			{
				"key": "sleep_powder",
				"levelReq": 13
			},
			{
				"key": "stun_spore",
				"levelReq": 13
			},
			{
				"key": "psybeam",
				"levelReq": 17
			},
			{
				"key": "silver_wind",
				"levelReq": 19
			},
			{
				"key": "supersonic",
				"levelReq": 23
			},
			{
				"key": "safeguard",
				"levelReq": 25
			},
			{
				"key": "whirlwind",
				"levelReq": 29
			},
			{
				"key": "bug_buzz",
				"levelReq": 31
			},
			{
				"key": "rage_powder",
				"levelReq": 35
			},
			{
				"key": "captivate",
				"levelReq": 37
			},
			{
				"key": "tailwind",
				"levelReq": 41
			},
			{
				"key": "air_slash",
				"levelReq": 43
			},
			{
				"key": "quiver_dance",
				"levelReq": 47
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
		"baseExp": 39,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 40,
			"atkFis": 35,
			"atkEsp": 20,
			"def": 30,
			"defEsp": 20,
			"speed": 50
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
				"key": "bug_bite",
				"levelReq": 9
			}
		],
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
		"baseExp": 72,
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
			"levelReq": 1
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
		"baseExp": 178,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 65,
			"atkFis": 90,
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
				"key": "twineedle",
				"levelReq": 1
			},
			{
				"key": "twineedle",
				"levelReq": 1
			},
			{
				"key": "fury_attack",
				"levelReq": 11
			},
			{
				"key": "rage",
				"levelReq": 14
			},
			{
				"key": "pursuit",
				"levelReq": 17
			},
			{
				"key": "focus_energy",
				"levelReq": 20
			},
			{
				"key": "venoshock",
				"levelReq": 23
			},
			{
				"key": "assurance",
				"levelReq": 26
			},
			{
				"key": "toxic_spikes",
				"levelReq": 29
			},
			{
				"key": "pin_missile",
				"levelReq": 32
			},
			{
				"key": "poison_jab",
				"levelReq": 35
			},
			{
				"key": "agility",
				"levelReq": 38
			},
			{
				"key": "endeavor",
				"levelReq": 41
			},
			{
				"key": "fell_stinger",
				"levelReq": 44
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
		"baseExp": 57,
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
				"key": "poison_powder",
				"levelReq": 6
			},
			{
				"key": "stun_spore",
				"levelReq": 6
			},
			{
				"key": "absorb",
				"levelReq": 11
			},
			{
				"key": "fury_cutter",
				"levelReq": 17
			},
			{
				"key": "spore",
				"levelReq": 22
			},
			{
				"key": "slash",
				"levelReq": 27
			},
			{
				"key": "growth",
				"levelReq": 33
			},
			{
				"key": "giga_drain",
				"levelReq": 38
			},
			{
				"key": "aromatherapy",
				"levelReq": 43
			},
			{
				"key": "rage_powder",
				"levelReq": 49
			},
			{
				"key": "x_scissor",
				"levelReq": 54
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
		"baseExp": 142,
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
				"key": "absorb",
				"levelReq": 1
			},
			{
				"key": "cross_poison",
				"levelReq": 1
			},
			{
				"key": "poison_powder",
				"levelReq": 1
			},
			{
				"key": "scratch",
				"levelReq": 1
			},
			{
				"key": "stun_spore",
				"levelReq": 1
			},
			{
				"key": "poison_powder",
				"levelReq": 6
			},
			{
				"key": "stun_spore",
				"levelReq": 6
			},
			{
				"key": "absorb",
				"levelReq": 11
			},
			{
				"key": "fury_cutter",
				"levelReq": 17
			},
			{
				"key": "spore",
				"levelReq": 22
			},
			{
				"key": "slash",
				"levelReq": 29
			},
			{
				"key": "growth",
				"levelReq": 37
			},
			{
				"key": "giga_drain",
				"levelReq": 44
			},
			{
				"key": "aromatherapy",
				"levelReq": 51
			},
			{
				"key": "rage_powder",
				"levelReq": 59
			},
			{
				"key": "x_scissor",
				"levelReq": 66
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
		"baseExp": 61,
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
				"key": "disable",
				"levelReq": 1
			},
			{
				"key": "foresight",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "supersonic",
				"levelReq": 5
			},
			{
				"key": "confusion",
				"levelReq": 11
			},
			{
				"key": "poison_powder",
				"levelReq": 13
			},
			{
				"key": "psybeam",
				"levelReq": 17
			},
			{
				"key": "stun_spore",
				"levelReq": 23
			},
			{
				"key": "signal_beam",
				"levelReq": 25
			},
			{
				"key": "sleep_powder",
				"levelReq": 29
			},
			{
				"key": "leech_life",
				"levelReq": 35
			},
			{
				"key": "zen_headbutt",
				"levelReq": 37
			},
			{
				"key": "poison_fang",
				"levelReq": 41
			},
			{
				"key": "psychic",
				"levelReq": 47
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
		"baseExp": 158,
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
				"key": "bug_buzz",
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
				"key": "gust",
				"levelReq": 1
			},
			{
				"key": "gust",
				"levelReq": 1
			},
			{
				"key": "quiver_dance",
				"levelReq": 1
			},
			{
				"key": "silver_wind",
				"levelReq": 1
			},
			{
				"key": "supersonic",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "supersonic",
				"levelReq": 5
			},
			{
				"key": "confusion",
				"levelReq": 11
			},
			{
				"key": "poison_powder",
				"levelReq": 13
			},
			{
				"key": "psybeam",
				"levelReq": 17
			},
			{
				"key": "stun_spore",
				"levelReq": 23
			},
			{
				"key": "signal_beam",
				"levelReq": 25
			},
			{
				"key": "sleep_powder",
				"levelReq": 29
			},
			{
				"key": "leech_life",
				"levelReq": 37
			},
			{
				"key": "zen_headbutt",
				"levelReq": 41
			},
			{
				"key": "poison_fang",
				"levelReq": 47
			},
			{
				"key": "psychic",
				"levelReq": 55
			},
			{
				"key": "bug_buzz",
				"levelReq": 59
			},
			{
				"key": "quiver_dance",
				"levelReq": 63
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
		"baseExp": 100,
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
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "quick_attack",
				"levelReq": 1
			},
			{
				"key": "vacuum_wave",
				"levelReq": 1
			},
			{
				"key": "focus_energy",
				"levelReq": 5
			},
			{
				"key": "pursuit",
				"levelReq": 9
			},
			{
				"key": "false_swipe",
				"levelReq": 13
			},
			{
				"key": "agility",
				"levelReq": 17
			},
			{
				"key": "wing_attack",
				"levelReq": 21
			},
			{
				"key": "fury_cutter",
				"levelReq": 25
			},
			{
				"key": "slash",
				"levelReq": 29
			},
			{
				"key": "razor_wind",
				"levelReq": 33
			},
			{
				"key": "double_team",
				"levelReq": 37
			},
			{
				"key": "x_scissor",
				"levelReq": 41
			},
			{
				"key": "night_slash",
				"levelReq": 45
			},
			{
				"key": "double_hit",
				"levelReq": 49
			},
			{
				"key": "air_slash",
				"levelReq": 50
			},
			{
				"key": "swords_dance",
				"levelReq": 57
			},
			{
				"key": "feint",
				"levelReq": 61
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
		"baseExp": 175,
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
				"key": "focus_energy",
				"levelReq": 1
			},
			{
				"key": "vice_grip",
				"levelReq": 1
			},
			{
				"key": "bind",
				"levelReq": 4
			},
			{
				"key": "seismic_toss",
				"levelReq": 8
			},
			{
				"key": "harden",
				"levelReq": 11
			},
			{
				"key": "revenge",
				"levelReq": 15
			},
			{
				"key": "vital_throw",
				"levelReq": 18
			},
			{
				"key": "double_hit",
				"levelReq": 22
			},
			{
				"key": "brick_break",
				"levelReq": 26
			},
			{
				"key": "x_scissor",
				"levelReq": 29
			},
			{
				"key": "submission",
				"levelReq": 33
			},
			{
				"key": "storm_throw",
				"levelReq": 36
			},
			{
				"key": "swords_dance",
				"levelReq": 40
			},
			{
				"key": "thrash",
				"levelReq": 43
			},
			{
				"key": "superpower",
				"levelReq": 47
			},
			{
				"key": "guillotine",
				"levelReq": 50
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
		"baseExp": 53,
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
				"levelReq": 5
			},
			{
				"key": "swift",
				"levelReq": 8
			},
			{
				"key": "light_screen",
				"levelReq": 12
			},
			{
				"key": "reflect",
				"levelReq": 12
			},
			{
				"key": "safeguard",
				"levelReq": 12
			},
			{
				"key": "mach_punch",
				"levelReq": 15
			},
			{
				"key": "silver_wind",
				"levelReq": 19
			},
			{
				"key": "comet_punch",
				"levelReq": 22
			},
			{
				"key": "baton_pass",
				"levelReq": 26
			},
			{
				"key": "agility",
				"levelReq": 29
			},
			{
				"key": "bug_buzz",
				"levelReq": 33
			},
			{
				"key": "air_slash",
				"levelReq": 36
			},
			{
				"key": "double_edge",
				"levelReq": 40
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
		"baseExp": 137,
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
				"key": "supersonic",
				"levelReq": 1
			},
			{
				"key": "swift",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "supersonic",
				"levelReq": 5
			},
			{
				"key": "swift",
				"levelReq": 8
			},
			{
				"key": "light_screen",
				"levelReq": 12
			},
			{
				"key": "reflect",
				"levelReq": 12
			},
			{
				"key": "safeguard",
				"levelReq": 12
			},
			{
				"key": "mach_punch",
				"levelReq": 15
			},
			{
				"key": "silver_wind",
				"levelReq": 20
			},
			{
				"key": "comet_punch",
				"levelReq": 24
			},
			{
				"key": "baton_pass",
				"levelReq": 29
			},
			{
				"key": "agility",
				"levelReq": 33
			},
			{
				"key": "bug_buzz",
				"levelReq": 38
			},
			{
				"key": "air_slash",
				"levelReq": 42
			},
			{
				"key": "double_edge",
				"levelReq": 47
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
		"baseExp": 50,
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
				"key": "constrict",
				"levelReq": 1
			},
			{
				"key": "poison_sting",
				"levelReq": 1
			},
			{
				"key": "string_shot",
				"levelReq": 1
			},
			{
				"key": "absorb",
				"levelReq": 5
			},
			{
				"key": "infestation",
				"levelReq": 8
			},
			{
				"key": "scary_face",
				"levelReq": 12
			},
			{
				"key": "night_shade",
				"levelReq": 15
			},
			{
				"key": "shadow_sneak",
				"levelReq": 19
			},
			{
				"key": "fury_swipes",
				"levelReq": 22
			},
			{
				"key": "sucker_punch",
				"levelReq": 26
			},
			{
				"key": "spider_web",
				"levelReq": 29
			},
			{
				"key": "agility",
				"levelReq": 33
			},
			{
				"key": "pin_missile",
				"levelReq": 36
			},
			{
				"key": "psychic",
				"levelReq": 40
			},
			{
				"key": "poison_jab",
				"levelReq": 43
			},
			{
				"key": "cross_poison",
				"levelReq": 47
			},
			{
				"key": "sticky_web",
				"levelReq": 50
			},
			{
				"key": "toxic_thread",
				"levelReq": 54
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
		"baseExp": 140,
		"growthCurve": "FAST",
		"base": {
			"hp": 70,
			"atkFis": 90,
			"atkEsp": 60,
			"def": 70,
			"defEsp": 70,
			"speed": 40
		},
		"abilities": [
			{
				"key": "absorb",
				"levelReq": 1
			},
			{
				"key": "bug_bite",
				"levelReq": 1
			},
			{
				"key": "constrict",
				"levelReq": 1
			},
			{
				"key": "fell_stinger",
				"levelReq": 1
			},
			{
				"key": "focus_energy",
				"levelReq": 1
			},
			{
				"key": "poison_sting",
				"levelReq": 1
			},
			{
				"key": "string_shot",
				"levelReq": 1
			},
			{
				"key": "swords_dance",
				"levelReq": 1
			},
			{
				"key": "swords_dance",
				"levelReq": 1
			},
			{
				"key": "venom_drench",
				"levelReq": 1
			},
			{
				"key": "absorb",
				"levelReq": 5
			},
			{
				"key": "infestation",
				"levelReq": 8
			},
			{
				"key": "scary_face",
				"levelReq": 12
			},
			{
				"key": "night_shade",
				"levelReq": 15
			},
			{
				"key": "shadow_sneak",
				"levelReq": 19
			},
			{
				"key": "fury_swipes",
				"levelReq": 23
			},
			{
				"key": "sucker_punch",
				"levelReq": 28
			},
			{
				"key": "spider_web",
				"levelReq": 32
			},
			{
				"key": "agility",
				"levelReq": 37
			},
			{
				"key": "pin_missile",
				"levelReq": 41
			},
			{
				"key": "psychic",
				"levelReq": 46
			},
			{
				"key": "poison_jab",
				"levelReq": 50
			},
			{
				"key": "cross_poison",
				"levelReq": 55
			},
			{
				"key": "sticky_web",
				"levelReq": 58
			},
			{
				"key": "toxic_thread",
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
		"baseExp": 78,
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
				"key": "foresight",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "quick_attack",
				"levelReq": 6
			},
			{
				"key": "double_team",
				"levelReq": 11
			},
			{
				"key": "sonic_boom",
				"levelReq": 14
			},
			{
				"key": "detect",
				"levelReq": 17
			},
			{
				"key": "supersonic",
				"levelReq": 22
			},
			{
				"key": "uproar",
				"levelReq": 27
			},
			{
				"key": "pursuit",
				"levelReq": 30
			},
			{
				"key": "ancient_power",
				"levelReq": 33
			},
			{
				"key": "hypnosis",
				"levelReq": 38
			},
			{
				"key": "wing_attack",
				"levelReq": 43
			},
			{
				"key": "screech",
				"levelReq": 46
			},
			{
				"key": "u_turn",
				"levelReq": 49
			},
			{
				"key": "air_slash",
				"levelReq": 54
			},
			{
				"key": "bug_buzz",
				"levelReq": 57
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
		"baseExp": 58,
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
				"key": "protect",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "self_destruct",
				"levelReq": 6
			},
			{
				"key": "bug_bite",
				"levelReq": 9
			},
			{
				"key": "take_down",
				"levelReq": 12
			},
			{
				"key": "rapid_spin",
				"levelReq": 17
			},
			{
				"key": "bide",
				"levelReq": 20
			},
			{
				"key": "natural_gift",
				"levelReq": 23
			},
			{
				"key": "spikes",
				"levelReq": 28
			},
			{
				"key": "payback",
				"levelReq": 31
			},
			{
				"key": "explosion",
				"levelReq": 34
			},
			{
				"key": "iron_defense",
				"levelReq": 39
			},
			{
				"key": "gyro_ball",
				"levelReq": 42
			},
			{
				"key": "double_edge",
				"levelReq": 45
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
		"baseExp": 163,
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
				"key": "autotomize",
				"levelReq": 1
			},
			{
				"key": "autotomize",
				"levelReq": 1
			},
			{
				"key": "bug_bite",
				"levelReq": 1
			},
			{
				"key": "heavy_slam",
				"levelReq": 1
			},
			{
				"key": "magnet_rise",
				"levelReq": 1
			},
			{
				"key": "mirror_shot",
				"levelReq": 1
			},
			{
				"key": "mirror_shot",
				"levelReq": 1
			},
			{
				"key": "protect",
				"levelReq": 1
			},
			{
				"key": "self_destruct",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "toxic_spikes",
				"levelReq": 1
			},
			{
				"key": "zap_cannon",
				"levelReq": 1
			},
			{
				"key": "self_destruct",
				"levelReq": 6
			},
			{
				"key": "bug_bite",
				"levelReq": 9
			},
			{
				"key": "take_down",
				"levelReq": 12
			},
			{
				"key": "rapid_spin",
				"levelReq": 17
			},
			{
				"key": "bide",
				"levelReq": 20
			},
			{
				"key": "natural_gift",
				"levelReq": 23
			},
			{
				"key": "spikes",
				"levelReq": 28
			},
			{
				"key": "payback",
				"levelReq": 32
			},
			{
				"key": "explosion",
				"levelReq": 36
			},
			{
				"key": "iron_defense",
				"levelReq": 42
			},
			{
				"key": "gyro_ball",
				"levelReq": 46
			},
			{
				"key": "double_edge",
				"levelReq": 50
			},
			{
				"key": "magnet_rise",
				"levelReq": 56
			},
			{
				"key": "zap_cannon",
				"levelReq": 60
			},
			{
				"key": "heavy_slam",
				"levelReq": 64
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
		"baseExp": 175,
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
				"key": "bullet_punch",
				"levelReq": 1
			},
			{
				"key": "feint",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "quick_attack",
				"levelReq": 1
			},
			{
				"key": "focus_energy",
				"levelReq": 5
			},
			{
				"key": "pursuit",
				"levelReq": 9
			},
			{
				"key": "false_swipe",
				"levelReq": 13
			},
			{
				"key": "agility",
				"levelReq": 17
			},
			{
				"key": "metal_claw",
				"levelReq": 21
			},
			{
				"key": "fury_cutter",
				"levelReq": 25
			},
			{
				"key": "slash",
				"levelReq": 29
			},
			{
				"key": "razor_wind",
				"levelReq": 33
			},
			{
				"key": "iron_defense",
				"levelReq": 37
			},
			{
				"key": "x_scissor",
				"levelReq": 41
			},
			{
				"key": "night_slash",
				"levelReq": 45
			},
			{
				"key": "double_hit",
				"levelReq": 49
			},
			{
				"key": "iron_head",
				"levelReq": 50
			},
			{
				"key": "swords_dance",
				"levelReq": 57
			},
			{
				"key": "feint",
				"levelReq": 61
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
		"baseExp": 175,
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
				"key": "arm_thrust",
				"levelReq": 1
			},
			{
				"key": "bullet_seed",
				"levelReq": 1
			},
			{
				"key": "endure",
				"levelReq": 1
			},
			{
				"key": "horn_attack",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "night_slash",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "feint",
				"levelReq": 7
			},
			{
				"key": "aerial_ace",
				"levelReq": 10
			},
			{
				"key": "chip_away",
				"levelReq": 16
			},
			{
				"key": "counter",
				"levelReq": 19
			},
			{
				"key": "fury_attack",
				"levelReq": 25
			},
			{
				"key": "brick_break",
				"levelReq": 28
			},
			{
				"key": "pin_missile",
				"levelReq": 31
			},
			{
				"key": "take_down",
				"levelReq": 34
			},
			{
				"key": "megahorn",
				"levelReq": 37
			},
			{
				"key": "close_combat",
				"levelReq": 43
			},
			{
				"key": "reversal",
				"levelReq": 46
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
		"baseExp": 142,
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
				"key": "water_gun",
				"levelReq": 1
			},
			{
				"key": "tail_whip",
				"levelReq": 4
			},
			{
				"key": "water_gun",
				"levelReq": 7
			},
			{
				"key": "withdraw",
				"levelReq": 10
			},
			{
				"key": "bubble",
				"levelReq": 13
			},
			{
				"key": "bite",
				"levelReq": 17
			},
			{
				"key": "rapid_spin",
				"levelReq": 21
			},
			{
				"key": "protect",
				"levelReq": 25
			},
			{
				"key": "water_pulse",
				"levelReq": 29
			},
			{
				"key": "aqua_tail",
				"levelReq": 33
			},
			{
				"key": "skull_bash",
				"levelReq": 37
			},
			{
				"key": "iron_defense",
				"levelReq": 41
			},
			{
				"key": "rain_dance",
				"levelReq": 45
			},
			{
				"key": "hydro_pump",
				"levelReq": 49
			}
		],
		"evolvesTo": "blastoise",
		"evolvesAtLevel": 36
	},
	"blastoise": {
		"id": "blastoise",
		"name": "Blastoise",
		"description": "Pokedex Nº9 - tipo WATER.",
		"type": "WATER",
		"type2": null,
		"catchRate": 45,
		"baseExp": 239,
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
				"key": "flash_cannon",
				"levelReq": 1
			},
			{
				"key": "tackle",
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
				"key": "withdraw",
				"levelReq": 1
			},
			{
				"key": "tail_whip",
				"levelReq": 4
			},
			{
				"key": "water_gun",
				"levelReq": 7
			},
			{
				"key": "withdraw",
				"levelReq": 10
			},
			{
				"key": "bubble",
				"levelReq": 13
			},
			{
				"key": "bite",
				"levelReq": 17
			},
			{
				"key": "rapid_spin",
				"levelReq": 21
			},
			{
				"key": "protect",
				"levelReq": 25
			},
			{
				"key": "water_pulse",
				"levelReq": 29
			},
			{
				"key": "aqua_tail",
				"levelReq": 33
			},
			{
				"key": "skull_bash",
				"levelReq": 40
			},
			{
				"key": "iron_defense",
				"levelReq": 47
			},
			{
				"key": "rain_dance",
				"levelReq": 54
			},
			{
				"key": "hydro_pump",
				"levelReq": 60
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"psyduck": {
		"id": "psyduck",
		"name": "Psyduck",
		"description": "Pokedex Nº54 - tipo WATER.",
		"type": "WATER",
		"type2": null,
		"catchRate": 190,
		"baseExp": 64,
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
				"key": "water_sport",
				"levelReq": 1
			},
			{
				"key": "tail_whip",
				"levelReq": 4
			},
			{
				"key": "water_gun",
				"levelReq": 7
			},
			{
				"key": "confusion",
				"levelReq": 10
			},
			{
				"key": "fury_swipes",
				"levelReq": 13
			},
			{
				"key": "water_pulse",
				"levelReq": 16
			},
			{
				"key": "disable",
				"levelReq": 19
			},
			{
				"key": "screech",
				"levelReq": 22
			},
			{
				"key": "zen_headbutt",
				"levelReq": 25
			},
			{
				"key": "aqua_tail",
				"levelReq": 28
			},
			{
				"key": "soak",
				"levelReq": 31
			},
			{
				"key": "psych_up",
				"levelReq": 34
			},
			{
				"key": "amnesia",
				"levelReq": 37
			},
			{
				"key": "hydro_pump",
				"levelReq": 40
			},
			{
				"key": "wonder_room",
				"levelReq": 43
			}
		],
		"evolvesTo": "golduck",
		"evolvesAtLevel": 33
	},
	"golduck": {
		"id": "golduck",
		"name": "Golduck",
		"description": "Pokedex Nº55 - tipo WATER.",
		"type": "WATER",
		"type2": null,
		"catchRate": 75,
		"baseExp": 175,
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
				"key": "aqua_jet",
				"levelReq": 1
			},
			{
				"key": "me_first",
				"levelReq": 1
			},
			{
				"key": "scratch",
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
				"key": "water_sport",
				"levelReq": 1
			},
			{
				"key": "tail_whip",
				"levelReq": 4
			},
			{
				"key": "water_gun",
				"levelReq": 7
			},
			{
				"key": "confusion",
				"levelReq": 10
			},
			{
				"key": "fury_swipes",
				"levelReq": 13
			},
			{
				"key": "water_pulse",
				"levelReq": 16
			},
			{
				"key": "disable",
				"levelReq": 19
			},
			{
				"key": "screech",
				"levelReq": 22
			},
			{
				"key": "zen_headbutt",
				"levelReq": 25
			},
			{
				"key": "aqua_tail",
				"levelReq": 28
			},
			{
				"key": "soak",
				"levelReq": 31
			},
			{
				"key": "psych_up",
				"levelReq": 36
			},
			{
				"key": "amnesia",
				"levelReq": 41
			},
			{
				"key": "hydro_pump",
				"levelReq": 46
			},
			{
				"key": "wonder_room",
				"levelReq": 51
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"poliwag": {
		"id": "poliwag",
		"name": "Poliwag",
		"description": "Pokedex Nº60 - tipo WATER.",
		"type": "WATER",
		"type2": null,
		"catchRate": 255,
		"baseExp": 60,
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
				"key": "water_sport",
				"levelReq": 1
			},
			{
				"key": "water_gun",
				"levelReq": 5
			},
			{
				"key": "hypnosis",
				"levelReq": 8
			},
			{
				"key": "bubble",
				"levelReq": 11
			},
			{
				"key": "double_slap",
				"levelReq": 15
			},
			{
				"key": "rain_dance",
				"levelReq": 18
			},
			{
				"key": "body_slam",
				"levelReq": 21
			},
			{
				"key": "bubble_beam",
				"levelReq": 25
			},
			{
				"key": "mud_shot",
				"levelReq": 28
			},
			{
				"key": "belly_drum",
				"levelReq": 31
			},
			{
				"key": "wake_up_slap",
				"levelReq": 35
			},
			{
				"key": "hydro_pump",
				"levelReq": 38
			},
			{
				"key": "mud_bomb",
				"levelReq": 41
			}
		],
		"evolvesTo": "poliwhirl",
		"evolvesAtLevel": 25
	},
	"poliwhirl": {
		"id": "poliwhirl",
		"name": "Poliwhirl",
		"description": "Pokedex Nº61 - tipo WATER.",
		"type": "WATER",
		"type2": null,
		"catchRate": 120,
		"baseExp": 135,
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
				"key": "hypnosis",
				"levelReq": 1
			},
			{
				"key": "water_gun",
				"levelReq": 1
			},
			{
				"key": "water_sport",
				"levelReq": 1
			},
			{
				"key": "water_gun",
				"levelReq": 5
			},
			{
				"key": "hypnosis",
				"levelReq": 8
			},
			{
				"key": "bubble",
				"levelReq": 11
			},
			{
				"key": "double_slap",
				"levelReq": 15
			},
			{
				"key": "rain_dance",
				"levelReq": 18
			},
			{
				"key": "body_slam",
				"levelReq": 21
			},
			{
				"key": "bubble_beam",
				"levelReq": 27
			},
			{
				"key": "mud_shot",
				"levelReq": 32
			},
			{
				"key": "belly_drum",
				"levelReq": 37
			},
			{
				"key": "wake_up_slap",
				"levelReq": 43
			},
			{
				"key": "hydro_pump",
				"levelReq": 48
			},
			{
				"key": "mud_bomb",
				"levelReq": 53
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
		"baseExp": 67,
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
				"levelReq": 4
			},
			{
				"key": "constrict",
				"levelReq": 7
			},
			{
				"key": "acid",
				"levelReq": 10
			},
			{
				"key": "toxic_spikes",
				"levelReq": 13
			},
			{
				"key": "water_pulse",
				"levelReq": 16
			},
			{
				"key": "wrap",
				"levelReq": 19
			},
			{
				"key": "acid_spray",
				"levelReq": 22
			},
			{
				"key": "bubble_beam",
				"levelReq": 25
			},
			{
				"key": "barrier",
				"levelReq": 28
			},
			{
				"key": "poison_jab",
				"levelReq": 31
			},
			{
				"key": "brine",
				"levelReq": 34
			},
			{
				"key": "screech",
				"levelReq": 37
			},
			{
				"key": "hex",
				"levelReq": 40
			},
			{
				"key": "sludge_wave",
				"levelReq": 43
			},
			{
				"key": "hydro_pump",
				"levelReq": 46
			},
			{
				"key": "wring_out",
				"levelReq": 49
			}
		],
		"evolvesTo": "tentacruel",
		"evolvesAtLevel": 30
	},
	"tentacruel": {
		"id": "tentacruel",
		"name": "Tentacruel",
		"description": "Pokedex Nº73 - tipo WATER/POISON.",
		"type": "WATER",
		"type2": "POISON",
		"catchRate": 60,
		"baseExp": 180,
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
				"key": "acid",
				"levelReq": 1
			},
			{
				"key": "constrict",
				"levelReq": 1
			},
			{
				"key": "poison_sting",
				"levelReq": 1
			},
			{
				"key": "reflect_type",
				"levelReq": 1
			},
			{
				"key": "supersonic",
				"levelReq": 1
			},
			{
				"key": "wring_out",
				"levelReq": 1
			},
			{
				"key": "supersonic",
				"levelReq": 4
			},
			{
				"key": "constrict",
				"levelReq": 7
			},
			{
				"key": "acid",
				"levelReq": 10
			},
			{
				"key": "toxic_spikes",
				"levelReq": 13
			},
			{
				"key": "water_pulse",
				"levelReq": 16
			},
			{
				"key": "wrap",
				"levelReq": 19
			},
			{
				"key": "acid_spray",
				"levelReq": 22
			},
			{
				"key": "bubble_beam",
				"levelReq": 25
			},
			{
				"key": "barrier",
				"levelReq": 28
			},
			{
				"key": "poison_jab",
				"levelReq": 32
			},
			{
				"key": "brine",
				"levelReq": 36
			},
			{
				"key": "screech",
				"levelReq": 40
			},
			{
				"key": "hex",
				"levelReq": 44
			},
			{
				"key": "sludge_wave",
				"levelReq": 48
			},
			{
				"key": "hydro_pump",
				"levelReq": 52
			},
			{
				"key": "wring_out",
				"levelReq": 56
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
		"baseExp": 63,
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
				"key": "yawn",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 5
			},
			{
				"key": "water_gun",
				"levelReq": 9
			},
			{
				"key": "confusion",
				"levelReq": 14
			},
			{
				"key": "disable",
				"levelReq": 19
			},
			{
				"key": "headbutt",
				"levelReq": 23
			},
			{
				"key": "water_pulse",
				"levelReq": 28
			},
			{
				"key": "zen_headbutt",
				"levelReq": 32
			},
			{
				"key": "slack_off",
				"levelReq": 36
			},
			{
				"key": "amnesia",
				"levelReq": 41
			},
			{
				"key": "psychic",
				"levelReq": 45
			},
			{
				"key": "rain_dance",
				"levelReq": 49
			},
			{
				"key": "psych_up",
				"levelReq": 54
			},
			{
				"key": "heal_pulse",
				"levelReq": 58
			}
		],
		"evolvesTo": "slowbro",
		"evolvesAtLevel": 37
	},
	"slowbro": {
		"id": "slowbro",
		"name": "Slowbro",
		"description": "Pokedex Nº80 - tipo WATER/PSYCHIC.",
		"type": "WATER",
		"type2": "PSYCHIC",
		"catchRate": 75,
		"baseExp": 172,
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
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "heal_pulse",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "withdraw",
				"levelReq": 1
			},
			{
				"key": "withdraw",
				"levelReq": 1
			},
			{
				"key": "yawn",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 5
			},
			{
				"key": "water_gun",
				"levelReq": 9
			},
			{
				"key": "confusion",
				"levelReq": 14
			},
			{
				"key": "disable",
				"levelReq": 19
			},
			{
				"key": "headbutt",
				"levelReq": 23
			},
			{
				"key": "water_pulse",
				"levelReq": 28
			},
			{
				"key": "zen_headbutt",
				"levelReq": 32
			},
			{
				"key": "slack_off",
				"levelReq": 36
			},
			{
				"key": "amnesia",
				"levelReq": 43
			},
			{
				"key": "psychic",
				"levelReq": 49
			},
			{
				"key": "rain_dance",
				"levelReq": 55
			},
			{
				"key": "psych_up",
				"levelReq": 62
			},
			{
				"key": "heal_pulse",
				"levelReq": 68
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"seel": {
		"id": "seel",
		"name": "Seel",
		"description": "Pokedex Nº86 - tipo WATER.",
		"type": "WATER",
		"type2": null,
		"catchRate": 190,
		"baseExp": 65,
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
				"levelReq": 3
			},
			{
				"key": "water_sport",
				"levelReq": 7
			},
			{
				"key": "icy_wind",
				"levelReq": 11
			},
			{
				"key": "encore",
				"levelReq": 13
			},
			{
				"key": "ice_shard",
				"levelReq": 17
			},
			{
				"key": "rest",
				"levelReq": 21
			},
			{
				"key": "aqua_ring",
				"levelReq": 23
			},
			{
				"key": "aurora_beam",
				"levelReq": 27
			},
			{
				"key": "aqua_jet",
				"levelReq": 31
			},
			{
				"key": "brine",
				"levelReq": 33
			},
			{
				"key": "take_down",
				"levelReq": 37
			},
			{
				"key": "dive",
				"levelReq": 41
			},
			{
				"key": "aqua_tail",
				"levelReq": 43
			},
			{
				"key": "ice_beam",
				"levelReq": 47
			},
			{
				"key": "safeguard",
				"levelReq": 51
			},
			{
				"key": "hail",
				"levelReq": 53
			}
		],
		"evolvesTo": "dewgong",
		"evolvesAtLevel": 34
	},
	"dewgong": {
		"id": "dewgong",
		"name": "Dewgong",
		"description": "Pokedex Nº87 - tipo WATER/ICE.",
		"type": "WATER",
		"type2": "ICE",
		"catchRate": 75,
		"baseExp": 166,
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
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "headbutt",
				"levelReq": 1
			},
			{
				"key": "icy_wind",
				"levelReq": 1
			},
			{
				"key": "sheer_cold",
				"levelReq": 1
			},
			{
				"key": "sheer_cold",
				"levelReq": 1
			},
			{
				"key": "signal_beam",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 3
			},
			{
				"key": "signal_beam",
				"levelReq": 7
			},
			{
				"key": "icy_wind",
				"levelReq": 11
			},
			{
				"key": "encore",
				"levelReq": 13
			},
			{
				"key": "ice_shard",
				"levelReq": 17
			},
			{
				"key": "rest",
				"levelReq": 21
			},
			{
				"key": "aqua_ring",
				"levelReq": 23
			},
			{
				"key": "aurora_beam",
				"levelReq": 27
			},
			{
				"key": "aqua_jet",
				"levelReq": 31
			},
			{
				"key": "brine",
				"levelReq": 33
			},
			{
				"key": "take_down",
				"levelReq": 39
			},
			{
				"key": "dive",
				"levelReq": 45
			},
			{
				"key": "aqua_tail",
				"levelReq": 49
			},
			{
				"key": "ice_beam",
				"levelReq": 55
			},
			{
				"key": "safeguard",
				"levelReq": 61
			},
			{
				"key": "hail",
				"levelReq": 65
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"shellder": {
		"id": "shellder",
		"name": "Shellder",
		"description": "Pokedex Nº90 - tipo WATER.",
		"type": "WATER",
		"type2": null,
		"catchRate": 190,
		"baseExp": 61,
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
				"key": "water_gun",
				"levelReq": 1
			},
			{
				"key": "withdraw",
				"levelReq": 4
			},
			{
				"key": "supersonic",
				"levelReq": 8
			},
			{
				"key": "icicle_spear",
				"levelReq": 13
			},
			{
				"key": "protect",
				"levelReq": 16
			},
			{
				"key": "leer",
				"levelReq": 20
			},
			{
				"key": "clamp",
				"levelReq": 25
			},
			{
				"key": "ice_shard",
				"levelReq": 28
			},
			{
				"key": "razor_shell",
				"levelReq": 32
			},
			{
				"key": "aurora_beam",
				"levelReq": 37
			},
			{
				"key": "whirlpool",
				"levelReq": 40
			},
			{
				"key": "brine",
				"levelReq": 44
			},
			{
				"key": "iron_defense",
				"levelReq": 49
			},
			{
				"key": "ice_beam",
				"levelReq": 52
			},
			{
				"key": "shell_smash",
				"levelReq": 56
			},
			{
				"key": "hydro_pump",
				"levelReq": 61
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
		"baseExp": 65,
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
				"key": "mud_sport",
				"levelReq": 1
			},
			{
				"key": "vice_grip",
				"levelReq": 5
			},
			{
				"key": "leer",
				"levelReq": 9
			},
			{
				"key": "harden",
				"levelReq": 11
			},
			{
				"key": "bubble_beam",
				"levelReq": 15
			},
			{
				"key": "mud_shot",
				"levelReq": 19
			},
			{
				"key": "metal_claw",
				"levelReq": 21
			},
			{
				"key": "stomp",
				"levelReq": 25
			},
			{
				"key": "protect",
				"levelReq": 29
			},
			{
				"key": "guillotine",
				"levelReq": 31
			},
			{
				"key": "slam",
				"levelReq": 35
			},
			{
				"key": "brine",
				"levelReq": 39
			},
			{
				"key": "crabhammer",
				"levelReq": 41
			},
			{
				"key": "flail",
				"levelReq": 45
			}
		],
		"evolvesTo": "kingler",
		"evolvesAtLevel": 28
	},
	"kingler": {
		"id": "kingler",
		"name": "Kingler",
		"description": "Pokedex Nº99 - tipo WATER.",
		"type": "WATER",
		"type2": null,
		"catchRate": 60,
		"baseExp": 166,
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
				"key": "mud_sport",
				"levelReq": 1
			},
			{
				"key": "vice_grip",
				"levelReq": 1
			},
			{
				"key": "wide_guard",
				"levelReq": 1
			},
			{
				"key": "vice_grip",
				"levelReq": 5
			},
			{
				"key": "leer",
				"levelReq": 9
			},
			{
				"key": "harden",
				"levelReq": 11
			},
			{
				"key": "bubble_beam",
				"levelReq": 15
			},
			{
				"key": "mud_shot",
				"levelReq": 19
			},
			{
				"key": "metal_claw",
				"levelReq": 21
			},
			{
				"key": "stomp",
				"levelReq": 25
			},
			{
				"key": "protect",
				"levelReq": 32
			},
			{
				"key": "guillotine",
				"levelReq": 37
			},
			{
				"key": "slam",
				"levelReq": 44
			},
			{
				"key": "brine",
				"levelReq": 51
			},
			{
				"key": "crabhammer",
				"levelReq": 56
			},
			{
				"key": "flail",
				"levelReq": 63
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"horsea": {
		"id": "horsea",
		"name": "Horsea",
		"description": "Pokedex Nº116 - tipo WATER.",
		"type": "WATER",
		"type2": null,
		"catchRate": 225,
		"baseExp": 59,
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
				"levelReq": 5
			},
			{
				"key": "leer",
				"levelReq": 9
			},
			{
				"key": "water_gun",
				"levelReq": 13
			},
			{
				"key": "twister",
				"levelReq": 17
			},
			{
				"key": "bubble_beam",
				"levelReq": 21
			},
			{
				"key": "focus_energy",
				"levelReq": 26
			},
			{
				"key": "brine",
				"levelReq": 31
			},
			{
				"key": "agility",
				"levelReq": 36
			},
			{
				"key": "dragon_pulse",
				"levelReq": 41
			},
			{
				"key": "dragon_dance",
				"levelReq": 46
			},
			{
				"key": "hydro_pump",
				"levelReq": 52
			}
		],
		"evolvesTo": "seadra",
		"evolvesAtLevel": 32
	},
	"seadra": {
		"id": "seadra",
		"name": "Seadra",
		"description": "Pokedex Nº117 - tipo WATER.",
		"type": "WATER",
		"type2": null,
		"catchRate": 75,
		"baseExp": 154,
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
				"key": "hydro_pump",
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
				"key": "water_gun",
				"levelReq": 1
			},
			{
				"key": "smokescreen",
				"levelReq": 5
			},
			{
				"key": "leer",
				"levelReq": 9
			},
			{
				"key": "water_gun",
				"levelReq": 13
			},
			{
				"key": "twister",
				"levelReq": 17
			},
			{
				"key": "bubble_beam",
				"levelReq": 21
			},
			{
				"key": "focus_energy",
				"levelReq": 26
			},
			{
				"key": "brine",
				"levelReq": 31
			},
			{
				"key": "agility",
				"levelReq": 38
			},
			{
				"key": "dragon_pulse",
				"levelReq": 45
			},
			{
				"key": "dragon_dance",
				"levelReq": 52
			},
			{
				"key": "hydro_pump",
				"levelReq": 60
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
		"baseExp": 64,
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
				"key": "water_sport",
				"levelReq": 1
			},
			{
				"key": "supersonic",
				"levelReq": 5
			},
			{
				"key": "horn_attack",
				"levelReq": 8
			},
			{
				"key": "flail",
				"levelReq": 13
			},
			{
				"key": "water_pulse",
				"levelReq": 16
			},
			{
				"key": "aqua_ring",
				"levelReq": 21
			},
			{
				"key": "fury_attack",
				"levelReq": 24
			},
			{
				"key": "agility",
				"levelReq": 29
			},
			{
				"key": "waterfall",
				"levelReq": 32
			},
			{
				"key": "horn_drill",
				"levelReq": 37
			},
			{
				"key": "soak",
				"levelReq": 40
			},
			{
				"key": "megahorn",
				"levelReq": 45
			}
		],
		"evolvesTo": "seaking",
		"evolvesAtLevel": 33
	},
	"seaking": {
		"id": "seaking",
		"name": "Seaking",
		"description": "Pokedex Nº119 - tipo WATER.",
		"type": "WATER",
		"type2": null,
		"catchRate": 60,
		"baseExp": 158,
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
				"key": "megahorn",
				"levelReq": 1
			},
			{
				"key": "peck",
				"levelReq": 1
			},
			{
				"key": "poison_jab",
				"levelReq": 1
			},
			{
				"key": "supersonic",
				"levelReq": 1
			},
			{
				"key": "tail_whip",
				"levelReq": 1
			},
			{
				"key": "water_sport",
				"levelReq": 1
			},
			{
				"key": "supersonic",
				"levelReq": 5
			},
			{
				"key": "horn_attack",
				"levelReq": 8
			},
			{
				"key": "flail",
				"levelReq": 13
			},
			{
				"key": "water_pulse",
				"levelReq": 16
			},
			{
				"key": "aqua_ring",
				"levelReq": 21
			},
			{
				"key": "fury_attack",
				"levelReq": 24
			},
			{
				"key": "agility",
				"levelReq": 29
			},
			{
				"key": "waterfall",
				"levelReq": 32
			},
			{
				"key": "horn_drill",
				"levelReq": 40
			},
			{
				"key": "soak",
				"levelReq": 46
			},
			{
				"key": "megahorn",
				"levelReq": 54
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"staryu": {
		"id": "staryu",
		"name": "Staryu",
		"description": "Pokedex Nº120 - tipo WATER.",
		"type": "WATER",
		"type2": null,
		"catchRate": 225,
		"baseExp": 68,
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
				"key": "harden",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "water_gun",
				"levelReq": 4
			},
			{
				"key": "rapid_spin",
				"levelReq": 7
			},
			{
				"key": "recover",
				"levelReq": 10
			},
			{
				"key": "psywave",
				"levelReq": 13
			},
			{
				"key": "swift",
				"levelReq": 16
			},
			{
				"key": "bubble_beam",
				"levelReq": 18
			},
			{
				"key": "camouflage",
				"levelReq": 22
			},
			{
				"key": "gyro_ball",
				"levelReq": 24
			},
			{
				"key": "brine",
				"levelReq": 28
			},
			{
				"key": "minimize",
				"levelReq": 31
			},
			{
				"key": "reflect_type",
				"levelReq": 35
			},
			{
				"key": "power_gem",
				"levelReq": 37
			},
			{
				"key": "confuse_ray",
				"levelReq": 40
			},
			{
				"key": "psychic",
				"levelReq": 42
			},
			{
				"key": "light_screen",
				"levelReq": 46
			},
			{
				"key": "cosmic_power",
				"levelReq": 49
			},
			{
				"key": "hydro_pump",
				"levelReq": 53
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
		"baseExp": 40,
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
	"gyarados": {
		"id": "gyarados",
		"name": "Gyarados",
		"description": "Pokedex Nº130 - tipo WATER/FLYING.",
		"type": "WATER",
		"type2": "FLYING",
		"catchRate": 45,
		"baseExp": 189,
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
				"key": "bite",
				"levelReq": 1
			},
			{
				"key": "bite",
				"levelReq": 1
			},
			{
				"key": "thrash",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 21
			},
			{
				"key": "twister",
				"levelReq": 24
			},
			{
				"key": "ice_fang",
				"levelReq": 27
			},
			{
				"key": "aqua_tail",
				"levelReq": 30
			},
			{
				"key": "scary_face",
				"levelReq": 33
			},
			{
				"key": "dragon_rage",
				"levelReq": 36
			},
			{
				"key": "crunch",
				"levelReq": 39
			},
			{
				"key": "hydro_pump",
				"levelReq": 42
			},
			{
				"key": "dragon_dance",
				"levelReq": 45
			},
			{
				"key": "hurricane",
				"levelReq": 48
			},
			{
				"key": "rain_dance",
				"levelReq": 51
			},
			{
				"key": "hyper_beam",
				"levelReq": 54
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
		"baseExp": 187,
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
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "sing",
				"levelReq": 1
			},
			{
				"key": "water_gun",
				"levelReq": 1
			},
			{
				"key": "mist",
				"levelReq": 4
			},
			{
				"key": "confuse_ray",
				"levelReq": 7
			},
			{
				"key": "ice_shard",
				"levelReq": 10
			},
			{
				"key": "water_pulse",
				"levelReq": 14
			},
			{
				"key": "body_slam",
				"levelReq": 18
			},
			{
				"key": "rain_dance",
				"levelReq": 22
			},
			{
				"key": "perish_song",
				"levelReq": 27
			},
			{
				"key": "ice_beam",
				"levelReq": 32
			},
			{
				"key": "brine",
				"levelReq": 37
			},
			{
				"key": "safeguard",
				"levelReq": 43
			},
			{
				"key": "hydro_pump",
				"levelReq": 47
			},
			{
				"key": "sheer_cold",
				"levelReq": 50
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"totodile": {
		"id": "totodile",
		"name": "Totodile",
		"description": "Pokedex Nº158 - tipo WATER.",
		"type": "WATER",
		"type2": null,
		"catchRate": 45,
		"baseExp": 63,
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
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "scratch",
				"levelReq": 1
			},
			{
				"key": "water_gun",
				"levelReq": 6
			},
			{
				"key": "rage",
				"levelReq": 8
			},
			{
				"key": "bite",
				"levelReq": 13
			},
			{
				"key": "scary_face",
				"levelReq": 15
			},
			{
				"key": "ice_fang",
				"levelReq": 20
			},
			{
				"key": "flail",
				"levelReq": 22
			},
			{
				"key": "crunch",
				"levelReq": 27
			},
			{
				"key": "chip_away",
				"levelReq": 29
			},
			{
				"key": "slash",
				"levelReq": 34
			},
			{
				"key": "screech",
				"levelReq": 36
			},
			{
				"key": "thrash",
				"levelReq": 41
			},
			{
				"key": "aqua_tail",
				"levelReq": 43
			},
			{
				"key": "superpower",
				"levelReq": 48
			},
			{
				"key": "hydro_pump",
				"levelReq": 50
			}
		],
		"evolvesTo": "croconaw",
		"evolvesAtLevel": 18
	},
	"croconaw": {
		"id": "croconaw",
		"name": "Croconaw",
		"description": "Pokedex Nº159 - tipo WATER.",
		"type": "WATER",
		"type2": null,
		"catchRate": 45,
		"baseExp": 142,
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
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "scratch",
				"levelReq": 1
			},
			{
				"key": "water_gun",
				"levelReq": 1
			},
			{
				"key": "water_gun",
				"levelReq": 6
			},
			{
				"key": "rage",
				"levelReq": 8
			},
			{
				"key": "bite",
				"levelReq": 13
			},
			{
				"key": "scary_face",
				"levelReq": 15
			},
			{
				"key": "ice_fang",
				"levelReq": 21
			},
			{
				"key": "flail",
				"levelReq": 24
			},
			{
				"key": "crunch",
				"levelReq": 30
			},
			{
				"key": "chip_away",
				"levelReq": 33
			},
			{
				"key": "slash",
				"levelReq": 39
			},
			{
				"key": "screech",
				"levelReq": 42
			},
			{
				"key": "thrash",
				"levelReq": 48
			},
			{
				"key": "aqua_tail",
				"levelReq": 51
			},
			{
				"key": "superpower",
				"levelReq": 57
			},
			{
				"key": "hydro_pump",
				"levelReq": 60
			}
		],
		"evolvesTo": "feraligatr",
		"evolvesAtLevel": 30
	},
	"feraligatr": {
		"id": "feraligatr",
		"name": "Feraligatr",
		"description": "Pokedex Nº160 - tipo WATER.",
		"type": "WATER",
		"type2": null,
		"catchRate": 45,
		"baseExp": 239,
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
				"key": "agility",
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
				"key": "scratch",
				"levelReq": 1
			},
			{
				"key": "water_gun",
				"levelReq": 1
			},
			{
				"key": "water_gun",
				"levelReq": 6
			},
			{
				"key": "rage",
				"levelReq": 8
			},
			{
				"key": "bite",
				"levelReq": 13
			},
			{
				"key": "scary_face",
				"levelReq": 15
			},
			{
				"key": "ice_fang",
				"levelReq": 21
			},
			{
				"key": "flail",
				"levelReq": 24
			},
			{
				"key": "crunch",
				"levelReq": 32
			},
			{
				"key": "chip_away",
				"levelReq": 37
			},
			{
				"key": "slash",
				"levelReq": 45
			},
			{
				"key": "screech",
				"levelReq": 50
			},
			{
				"key": "thrash",
				"levelReq": 58
			},
			{
				"key": "aqua_tail",
				"levelReq": 63
			},
			{
				"key": "superpower",
				"levelReq": 71
			},
			{
				"key": "hydro_pump",
				"levelReq": 76
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"chinchou": {
		"id": "chinchou",
		"name": "Chinchou",
		"description": "Pokedex Nº170 - tipo WATER/ELECTRIC.",
		"type": "WATER",
		"type2": "ELECTRIC",
		"catchRate": 190,
		"baseExp": 66,
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
				"key": "supersonic",
				"levelReq": 1
			},
			{
				"key": "thunder_wave",
				"levelReq": 6
			},
			{
				"key": "electro_ball",
				"levelReq": 9
			},
			{
				"key": "water_gun",
				"levelReq": 12
			},
			{
				"key": "confuse_ray",
				"levelReq": 17
			},
			{
				"key": "bubble_beam",
				"levelReq": 20
			},
			{
				"key": "spark",
				"levelReq": 23
			},
			{
				"key": "signal_beam",
				"levelReq": 28
			},
			{
				"key": "flail",
				"levelReq": 31
			},
			{
				"key": "discharge",
				"levelReq": 34
			},
			{
				"key": "take_down",
				"levelReq": 39
			},
			{
				"key": "aqua_ring",
				"levelReq": 42
			},
			{
				"key": "hydro_pump",
				"levelReq": 45
			},
			{
				"key": "ion_deluge",
				"levelReq": 47
			},
			{
				"key": "charge",
				"levelReq": 50
			}
		],
		"evolvesTo": "lanturn",
		"evolvesAtLevel": 27
	},
	"lanturn": {
		"id": "lanturn",
		"name": "Lanturn",
		"description": "Pokedex Nº171 - tipo WATER/ELECTRIC.",
		"type": "WATER",
		"type2": "ELECTRIC",
		"catchRate": 75,
		"baseExp": 161,
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
				"key": "eerie_impulse",
				"levelReq": 1
			},
			{
				"key": "electro_ball",
				"levelReq": 1
			},
			{
				"key": "spit_up",
				"levelReq": 1
			},
			{
				"key": "spit_up",
				"levelReq": 1
			},
			{
				"key": "spotlight",
				"levelReq": 1
			},
			{
				"key": "stockpile",
				"levelReq": 1
			},
			{
				"key": "stockpile",
				"levelReq": 1
			},
			{
				"key": "supersonic",
				"levelReq": 1
			},
			{
				"key": "swallow",
				"levelReq": 1
			},
			{
				"key": "swallow",
				"levelReq": 1
			},
			{
				"key": "thunder_wave",
				"levelReq": 1
			},
			{
				"key": "thunder_wave",
				"levelReq": 6
			},
			{
				"key": "electro_ball",
				"levelReq": 9
			},
			{
				"key": "water_gun",
				"levelReq": 12
			},
			{
				"key": "confuse_ray",
				"levelReq": 17
			},
			{
				"key": "bubble_beam",
				"levelReq": 20
			},
			{
				"key": "spark",
				"levelReq": 23
			},
			{
				"key": "signal_beam",
				"levelReq": 29
			},
			{
				"key": "flail",
				"levelReq": 33
			},
			{
				"key": "discharge",
				"levelReq": 37
			},
			{
				"key": "take_down",
				"levelReq": 43
			},
			{
				"key": "aqua_ring",
				"levelReq": 47
			},
			{
				"key": "hydro_pump",
				"levelReq": 51
			},
			{
				"key": "ion_deluge",
				"levelReq": 54
			},
			{
				"key": "charge",
				"levelReq": 58
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"marill": {
		"id": "marill",
		"name": "Marill",
		"description": "Pokedex Nº183 - tipo WATER/FAIRY.",
		"type": "WATER",
		"type2": "FAIRY",
		"catchRate": 190,
		"baseExp": 88,
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
				"key": "water_gun",
				"levelReq": 1
			},
			{
				"key": "tail_whip",
				"levelReq": 2
			},
			{
				"key": "water_sport",
				"levelReq": 5
			},
			{
				"key": "bubble",
				"levelReq": 7
			},
			{
				"key": "defense_curl",
				"levelReq": 10
			},
			{
				"key": "rollout",
				"levelReq": 10
			},
			{
				"key": "bubble_beam",
				"levelReq": 13
			},
			{
				"key": "helping_hand",
				"levelReq": 16
			},
			{
				"key": "aqua_tail",
				"levelReq": 20
			},
			{
				"key": "play_rough",
				"levelReq": 23
			},
			{
				"key": "aqua_ring",
				"levelReq": 28
			},
			{
				"key": "rain_dance",
				"levelReq": 31
			},
			{
				"key": "double_edge",
				"levelReq": 37
			},
			{
				"key": "superpower",
				"levelReq": 40
			},
			{
				"key": "hydro_pump",
				"levelReq": 47
			}
		],
		"evolvesTo": "azumarill",
		"evolvesAtLevel": 18
	},
	"azumarill": {
		"id": "azumarill",
		"name": "Azumarill",
		"description": "Pokedex Nº184 - tipo WATER/FAIRY.",
		"type": "WATER",
		"type2": "FAIRY",
		"catchRate": 75,
		"baseExp": 189,
		"growthCurve": "FAST",
		"base": {
			"hp": 100,
			"atkFis": 50,
			"atkEsp": 60,
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
				"key": "tail_whip",
				"levelReq": 1
			},
			{
				"key": "water_gun",
				"levelReq": 1
			},
			{
				"key": "water_sport",
				"levelReq": 1
			},
			{
				"key": "tail_whip",
				"levelReq": 2
			},
			{
				"key": "water_sport",
				"levelReq": 5
			},
			{
				"key": "bubble",
				"levelReq": 7
			},
			{
				"key": "defense_curl",
				"levelReq": 10
			},
			{
				"key": "rollout",
				"levelReq": 10
			},
			{
				"key": "bubble_beam",
				"levelReq": 13
			},
			{
				"key": "helping_hand",
				"levelReq": 16
			},
			{
				"key": "aqua_tail",
				"levelReq": 21
			},
			{
				"key": "play_rough",
				"levelReq": 25
			},
			{
				"key": "aqua_ring",
				"levelReq": 31
			},
			{
				"key": "rain_dance",
				"levelReq": 35
			},
			{
				"key": "double_edge",
				"levelReq": 42
			},
			{
				"key": "superpower",
				"levelReq": 46
			},
			{
				"key": "hydro_pump",
				"levelReq": 55
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
		"baseExp": 225,
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
				"key": "bubble_beam",
				"levelReq": 1
			},
			{
				"key": "double_slap",
				"levelReq": 1
			},
			{
				"key": "hypnosis",
				"levelReq": 1
			},
			{
				"key": "perish_song",
				"levelReq": 1
			},
			{
				"key": "swagger",
				"levelReq": 27
			},
			{
				"key": "bounce",
				"levelReq": 37
			},
			{
				"key": "hyper_voice",
				"levelReq": 48
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"wooper": {
		"id": "wooper",
		"name": "Wooper",
		"description": "Pokedex Nº194 - tipo WATER/GROUND.",
		"type": "WATER",
		"type2": "GROUND",
		"catchRate": 255,
		"baseExp": 42,
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
				"key": "tail_whip",
				"levelReq": 1
			},
			{
				"key": "water_gun",
				"levelReq": 1
			},
			{
				"key": "mud_sport",
				"levelReq": 5
			},
			{
				"key": "mud_shot",
				"levelReq": 9
			},
			{
				"key": "slam",
				"levelReq": 15
			},
			{
				"key": "mud_bomb",
				"levelReq": 19
			},
			{
				"key": "amnesia",
				"levelReq": 23
			},
			{
				"key": "yawn",
				"levelReq": 29
			},
			{
				"key": "earthquake",
				"levelReq": 33
			},
			{
				"key": "rain_dance",
				"levelReq": 37
			},
			{
				"key": "haze",
				"levelReq": 43
			},
			{
				"key": "mist",
				"levelReq": 43
			},
			{
				"key": "muddy_water",
				"levelReq": 47
			}
		],
		"evolvesTo": "quagsire",
		"evolvesAtLevel": 20
	},
	"quagsire": {
		"id": "quagsire",
		"name": "Quagsire",
		"description": "Pokedex Nº195 - tipo WATER/GROUND.",
		"type": "WATER",
		"type2": "GROUND",
		"catchRate": 90,
		"baseExp": 151,
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
				"key": "mud_sport",
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
				"key": "mud_sport",
				"levelReq": 5
			},
			{
				"key": "mud_shot",
				"levelReq": 9
			},
			{
				"key": "slam",
				"levelReq": 15
			},
			{
				"key": "mud_bomb",
				"levelReq": 19
			},
			{
				"key": "amnesia",
				"levelReq": 24
			},
			{
				"key": "yawn",
				"levelReq": 31
			},
			{
				"key": "earthquake",
				"levelReq": 36
			},
			{
				"key": "rain_dance",
				"levelReq": 41
			},
			{
				"key": "haze",
				"levelReq": 48
			},
			{
				"key": "mist",
				"levelReq": 48
			},
			{
				"key": "muddy_water",
				"levelReq": 53
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"qwilfish": {
		"id": "qwilfish",
		"name": "Qwilfish",
		"description": "Pokedex Nº211 - tipo WATER/POISON.",
		"type": "WATER",
		"type2": "POISON",
		"catchRate": 45,
		"baseExp": 88,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 65,
			"atkFis": 95,
			"atkEsp": 55,
			"def": 85,
			"defEsp": 55,
			"speed": 85
		},
		"abilities": [
			{
				"key": "destiny_bond",
				"levelReq": 1
			},
			{
				"key": "fell_stinger",
				"levelReq": 1
			},
			{
				"key": "hydro_pump",
				"levelReq": 1
			},
			{
				"key": "poison_sting",
				"levelReq": 1
			},
			{
				"key": "spikes",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "water_gun",
				"levelReq": 1
			},
			{
				"key": "harden",
				"levelReq": 9
			},
			{
				"key": "minimize",
				"levelReq": 9
			},
			{
				"key": "bubble",
				"levelReq": 13
			},
			{
				"key": "rollout",
				"levelReq": 17
			},
			{
				"key": "toxic_spikes",
				"levelReq": 21
			},
			{
				"key": "spit_up",
				"levelReq": 25
			},
			{
				"key": "stockpile",
				"levelReq": 25
			},
			{
				"key": "revenge",
				"levelReq": 29
			},
			{
				"key": "brine",
				"levelReq": 33
			},
			{
				"key": "pin_missile",
				"levelReq": 37
			},
			{
				"key": "take_down",
				"levelReq": 41
			},
			{
				"key": "aqua_tail",
				"levelReq": 45
			},
			{
				"key": "poison_jab",
				"levelReq": 49
			},
			{
				"key": "destiny_bond",
				"levelReq": 53
			},
			{
				"key": "hydro_pump",
				"levelReq": 57
			},
			{
				"key": "fell_stinger",
				"levelReq": 60
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"corsola": {
		"id": "corsola",
		"name": "Corsola",
		"description": "Pokedex Nº222 - tipo WATER/ROCK.",
		"type": "WATER",
		"type2": "ROCK",
		"catchRate": 60,
		"baseExp": 144,
		"growthCurve": "FAST",
		"base": {
			"hp": 65,
			"atkFis": 55,
			"atkEsp": 65,
			"def": 95,
			"defEsp": 95,
			"speed": 35
		},
		"abilities": [
			{
				"key": "harden",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "bubble",
				"levelReq": 4
			},
			{
				"key": "recover",
				"levelReq": 8
			},
			{
				"key": "bubble_beam",
				"levelReq": 10
			},
			{
				"key": "refresh",
				"levelReq": 13
			},
			{
				"key": "ancient_power",
				"levelReq": 17
			},
			{
				"key": "spike_cannon",
				"levelReq": 20
			},
			{
				"key": "lucky_chant",
				"levelReq": 23
			},
			{
				"key": "brine",
				"levelReq": 27
			},
			{
				"key": "iron_defense",
				"levelReq": 29
			},
			{
				"key": "rock_blast",
				"levelReq": 31
			},
			{
				"key": "endure",
				"levelReq": 35
			},
			{
				"key": "aqua_ring",
				"levelReq": 38
			},
			{
				"key": "power_gem",
				"levelReq": 41
			},
			{
				"key": "mirror_coat",
				"levelReq": 45
			},
			{
				"key": "earth_power",
				"levelReq": 47
			},
			{
				"key": "flail",
				"levelReq": 50
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"remoraid": {
		"id": "remoraid",
		"name": "Remoraid",
		"description": "Pokedex Nº223 - tipo WATER.",
		"type": "WATER",
		"type2": null,
		"catchRate": 190,
		"baseExp": 60,
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
				"levelReq": 6
			},
			{
				"key": "psybeam",
				"levelReq": 10
			},
			{
				"key": "aurora_beam",
				"levelReq": 14
			},
			{
				"key": "bubble_beam",
				"levelReq": 18
			},
			{
				"key": "focus_energy",
				"levelReq": 22
			},
			{
				"key": "water_pulse",
				"levelReq": 26
			},
			{
				"key": "signal_beam",
				"levelReq": 30
			},
			{
				"key": "ice_beam",
				"levelReq": 34
			},
			{
				"key": "bullet_seed",
				"levelReq": 38
			},
			{
				"key": "hydro_pump",
				"levelReq": 42
			},
			{
				"key": "hyper_beam",
				"levelReq": 46
			},
			{
				"key": "soak",
				"levelReq": 50
			}
		],
		"evolvesTo": "octillery",
		"evolvesAtLevel": 25
	},
	"octillery": {
		"id": "octillery",
		"name": "Octillery",
		"description": "Pokedex Nº224 - tipo WATER.",
		"type": "WATER",
		"type2": null,
		"catchRate": 75,
		"baseExp": 168,
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
				"key": "aurora_beam",
				"levelReq": 1
			},
			{
				"key": "constrict",
				"levelReq": 1
			},
			{
				"key": "gunk_shot",
				"levelReq": 1
			},
			{
				"key": "octazooka",
				"levelReq": 1
			},
			{
				"key": "octazooka",
				"levelReq": 1
			},
			{
				"key": "psybeam",
				"levelReq": 1
			},
			{
				"key": "rock_blast",
				"levelReq": 1
			},
			{
				"key": "water_gun",
				"levelReq": 1
			},
			{
				"key": "constrict",
				"levelReq": 6
			},
			{
				"key": "psybeam",
				"levelReq": 10
			},
			{
				"key": "aurora_beam",
				"levelReq": 14
			},
			{
				"key": "bubble_beam",
				"levelReq": 18
			},
			{
				"key": "focus_energy",
				"levelReq": 22
			},
			{
				"key": "wring_out",
				"levelReq": 28
			},
			{
				"key": "signal_beam",
				"levelReq": 34
			},
			{
				"key": "ice_beam",
				"levelReq": 40
			},
			{
				"key": "bullet_seed",
				"levelReq": 46
			},
			{
				"key": "hydro_pump",
				"levelReq": 52
			},
			{
				"key": "hyper_beam",
				"levelReq": 58
			},
			{
				"key": "soak",
				"levelReq": 64
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
		"baseExp": 170,
		"growthCurve": "SLOW",
		"base": {
			"hp": 85,
			"atkFis": 40,
			"atkEsp": 80,
			"def": 70,
			"defEsp": 140,
			"speed": 70
		},
		"abilities": [
			{
				"key": "bubble",
				"levelReq": 1
			},
			{
				"key": "bubble_beam",
				"levelReq": 1
			},
			{
				"key": "bullet_seed",
				"levelReq": 1
			},
			{
				"key": "psybeam",
				"levelReq": 1
			},
			{
				"key": "roost",
				"levelReq": 1
			},
			{
				"key": "signal_beam",
				"levelReq": 1
			},
			{
				"key": "supersonic",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "supersonic",
				"levelReq": 3
			},
			{
				"key": "bubble_beam",
				"levelReq": 7
			},
			{
				"key": "confuse_ray",
				"levelReq": 11
			},
			{
				"key": "wing_attack",
				"levelReq": 14
			},
			{
				"key": "headbutt",
				"levelReq": 16
			},
			{
				"key": "water_pulse",
				"levelReq": 19
			},
			{
				"key": "wide_guard",
				"levelReq": 23
			},
			{
				"key": "take_down",
				"levelReq": 27
			},
			{
				"key": "agility",
				"levelReq": 32
			},
			{
				"key": "air_slash",
				"levelReq": 36
			},
			{
				"key": "aqua_ring",
				"levelReq": 39
			},
			{
				"key": "bounce",
				"levelReq": 46
			},
			{
				"key": "hydro_pump",
				"levelReq": 49
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
		"baseExp": 243,
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
				"key": "hydro_pump",
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
				"key": "water_gun",
				"levelReq": 1
			},
			{
				"key": "yawn",
				"levelReq": 1
			},
			{
				"key": "smokescreen",
				"levelReq": 5
			},
			{
				"key": "leer",
				"levelReq": 9
			},
			{
				"key": "water_gun",
				"levelReq": 13
			},
			{
				"key": "twister",
				"levelReq": 17
			},
			{
				"key": "bubble_beam",
				"levelReq": 21
			},
			{
				"key": "focus_energy",
				"levelReq": 26
			},
			{
				"key": "brine",
				"levelReq": 31
			},
			{
				"key": "agility",
				"levelReq": 38
			},
			{
				"key": "dragon_pulse",
				"levelReq": 45
			},
			{
				"key": "dragon_dance",
				"levelReq": 52
			},
			{
				"key": "hydro_pump",
				"levelReq": 60
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
		"baseExp": 50,
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
				"levelReq": 13
			},
			{
				"key": "whirlwind",
				"levelReq": 17
			},
			{
				"key": "twister",
				"levelReq": 21
			},
			{
				"key": "feather_dance",
				"levelReq": 25
			},
			{
				"key": "agility",
				"levelReq": 29
			},
			{
				"key": "wing_attack",
				"levelReq": 33
			},
			{
				"key": "roost",
				"levelReq": 37
			},
			{
				"key": "tailwind",
				"levelReq": 41
			},
			{
				"key": "mirror_move",
				"levelReq": 45
			},
			{
				"key": "air_slash",
				"levelReq": 49
			},
			{
				"key": "hurricane",
				"levelReq": 53
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
		"baseExp": 122,
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
				"key": "gust",
				"levelReq": 1
			},
			{
				"key": "sand_attack",
				"levelReq": 1
			},
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
				"levelReq": 13
			},
			{
				"key": "whirlwind",
				"levelReq": 17
			},
			{
				"key": "twister",
				"levelReq": 22
			},
			{
				"key": "feather_dance",
				"levelReq": 27
			},
			{
				"key": "agility",
				"levelReq": 32
			},
			{
				"key": "wing_attack",
				"levelReq": 37
			},
			{
				"key": "roost",
				"levelReq": 42
			},
			{
				"key": "tailwind",
				"levelReq": 47
			},
			{
				"key": "mirror_move",
				"levelReq": 52
			},
			{
				"key": "air_slash",
				"levelReq": 57
			},
			{
				"key": "hurricane",
				"levelReq": 62
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
		"baseExp": 216,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 83,
			"atkFis": 80,
			"atkEsp": 70,
			"def": 75,
			"defEsp": 70,
			"speed": 101
		},
		"abilities": [
			{
				"key": "gust",
				"levelReq": 1
			},
			{
				"key": "hurricane",
				"levelReq": 1
			},
			{
				"key": "quick_attack",
				"levelReq": 1
			},
			{
				"key": "sand_attack",
				"levelReq": 1
			},
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
				"levelReq": 13
			},
			{
				"key": "whirlwind",
				"levelReq": 17
			},
			{
				"key": "twister",
				"levelReq": 22
			},
			{
				"key": "feather_dance",
				"levelReq": 27
			},
			{
				"key": "agility",
				"levelReq": 32
			},
			{
				"key": "wing_attack",
				"levelReq": 38
			},
			{
				"key": "roost",
				"levelReq": 44
			},
			{
				"key": "tailwind",
				"levelReq": 50
			},
			{
				"key": "mirror_move",
				"levelReq": 56
			},
			{
				"key": "air_slash",
				"levelReq": 62
			},
			{
				"key": "hurricane",
				"levelReq": 68
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
		"catchRate": 127,
		"baseExp": 145,
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
				"key": "focus_energy",
				"levelReq": 1
			},
			{
				"key": "quick_attack",
				"levelReq": 1
			},
			{
				"key": "scary_face",
				"levelReq": 1
			},
			{
				"key": "scary_face",
				"levelReq": 1
			},
			{
				"key": "swords_dance",
				"levelReq": 1
			},
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
				"levelReq": 4
			},
			{
				"key": "focus_energy",
				"levelReq": 7
			},
			{
				"key": "bite",
				"levelReq": 10
			},
			{
				"key": "pursuit",
				"levelReq": 13
			},
			{
				"key": "hyper_fang",
				"levelReq": 16
			},
			{
				"key": "assurance",
				"levelReq": 19
			},
			{
				"key": "crunch",
				"levelReq": 24
			},
			{
				"key": "sucker_punch",
				"levelReq": 29
			},
			{
				"key": "super_fang",
				"levelReq": 34
			},
			{
				"key": "double_edge",
				"levelReq": 39
			},
			{
				"key": "endeavor",
				"levelReq": 44
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
		"baseExp": 155,
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
				"key": "drill_run",
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
				"key": "peck",
				"levelReq": 1
			},
			{
				"key": "pluck",
				"levelReq": 1
			},
			{
				"key": "pursuit",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 4
			},
			{
				"key": "pursuit",
				"levelReq": 8
			},
			{
				"key": "fury_attack",
				"levelReq": 11
			},
			{
				"key": "aerial_ace",
				"levelReq": 15
			},
			{
				"key": "mirror_move",
				"levelReq": 18
			},
			{
				"key": "assurance",
				"levelReq": 23
			},
			{
				"key": "agility",
				"levelReq": 27
			},
			{
				"key": "focus_energy",
				"levelReq": 32
			},
			{
				"key": "roost",
				"levelReq": 36
			},
			{
				"key": "drill_peck",
				"levelReq": 41
			},
			{
				"key": "drill_run",
				"levelReq": 45
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"jigglypuff": {
		"id": "jigglypuff",
		"name": "Jigglypuff",
		"description": "Pokedex Nº39 - tipo NORMAL/FAIRY.",
		"type": "NORMAL",
		"type2": "FAIRY",
		"catchRate": 170,
		"baseExp": 95,
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
				"levelReq": 3
			},
			{
				"key": "pound",
				"levelReq": 5
			},
			{
				"key": "play_nice",
				"levelReq": 9
			},
			{
				"key": "disarming_voice",
				"levelReq": 11
			},
			{
				"key": "disable",
				"levelReq": 14
			},
			{
				"key": "double_slap",
				"levelReq": 17
			},
			{
				"key": "rollout",
				"levelReq": 20
			},
			{
				"key": "round",
				"levelReq": 22
			},
			{
				"key": "spit_up",
				"levelReq": 25
			},
			{
				"key": "stockpile",
				"levelReq": 25
			},
			{
				"key": "swallow",
				"levelReq": 25
			},
			{
				"key": "wake_up_slap",
				"levelReq": 27
			},
			{
				"key": "rest",
				"levelReq": 30
			},
			{
				"key": "body_slam",
				"levelReq": 32
			},
			{
				"key": "gyro_ball",
				"levelReq": 35
			},
			{
				"key": "mimic",
				"levelReq": 38
			},
			{
				"key": "hyper_voice",
				"levelReq": 41
			},
			{
				"key": "double_edge",
				"levelReq": 45
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
		"baseExp": 58,
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
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "scratch",
				"levelReq": 1
			},
			{
				"key": "bite",
				"levelReq": 6
			},
			{
				"key": "fake_out",
				"levelReq": 9
			},
			{
				"key": "fury_swipes",
				"levelReq": 14
			},
			{
				"key": "screech",
				"levelReq": 17
			},
			{
				"key": "feint_attack",
				"levelReq": 22
			},
			{
				"key": "taunt",
				"levelReq": 25
			},
			{
				"key": "pay_day",
				"levelReq": 30
			},
			{
				"key": "slash",
				"levelReq": 33
			},
			{
				"key": "nasty_plot",
				"levelReq": 38
			},
			{
				"key": "assurance",
				"levelReq": 41
			},
			{
				"key": "captivate",
				"levelReq": 46
			},
			{
				"key": "night_slash",
				"levelReq": 49
			},
			{
				"key": "feint",
				"levelReq": 50
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
		"baseExp": 154,
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
				"key": "bite",
				"levelReq": 1
			},
			{
				"key": "fake_out",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "play_rough",
				"levelReq": 1
			},
			{
				"key": "scratch",
				"levelReq": 1
			},
			{
				"key": "swift",
				"levelReq": 1
			},
			{
				"key": "swift",
				"levelReq": 1
			},
			{
				"key": "switcheroo",
				"levelReq": 1
			},
			{
				"key": "bite",
				"levelReq": 6
			},
			{
				"key": "fake_out",
				"levelReq": 9
			},
			{
				"key": "fury_swipes",
				"levelReq": 14
			},
			{
				"key": "screech",
				"levelReq": 17
			},
			{
				"key": "feint_attack",
				"levelReq": 22
			},
			{
				"key": "taunt",
				"levelReq": 25
			},
			{
				"key": "power_gem",
				"levelReq": 32
			},
			{
				"key": "slash",
				"levelReq": 37
			},
			{
				"key": "nasty_plot",
				"levelReq": 44
			},
			{
				"key": "assurance",
				"levelReq": 49
			},
			{
				"key": "captivate",
				"levelReq": 56
			},
			{
				"key": "night_slash",
				"levelReq": 61
			},
			{
				"key": "feint",
				"levelReq": 65
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"farfetch_d": {
		"id": "farfetch_d",
		"name": "Farfetch’d",
		"description": "Pokedex Nº83 - tipo NORMAL/FLYING.",
		"type": "NORMAL",
		"type2": "FLYING",
		"catchRate": 45,
		"baseExp": 132,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 52,
			"atkFis": 90,
			"atkEsp": 58,
			"def": 55,
			"defEsp": 62,
			"speed": 60
		},
		"abilities": [
			{
				"key": "brave_bird",
				"levelReq": 1
			},
			{
				"key": "fury_cutter",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "peck",
				"levelReq": 1
			},
			{
				"key": "poison_jab",
				"levelReq": 1
			},
			{
				"key": "sand_attack",
				"levelReq": 1
			},
			{
				"key": "fury_attack",
				"levelReq": 7
			},
			{
				"key": "aerial_ace",
				"levelReq": 9
			},
			{
				"key": "knock_off",
				"levelReq": 13
			},
			{
				"key": "slash",
				"levelReq": 19
			},
			{
				"key": "air_cutter",
				"levelReq": 21
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
				"key": "night_slash",
				"levelReq": 33
			},
			{
				"key": "acrobatics",
				"levelReq": 37
			},
			{
				"key": "feint",
				"levelReq": 43
			},
			{
				"key": "false_swipe",
				"levelReq": 45
			},
			{
				"key": "air_slash",
				"levelReq": 49
			},
			{
				"key": "brave_bird",
				"levelReq": 55
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
		"baseExp": 62,
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
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "peck",
				"levelReq": 1
			},
			{
				"key": "quick_attack",
				"levelReq": 5
			},
			{
				"key": "rage",
				"levelReq": 8
			},
			{
				"key": "fury_attack",
				"levelReq": 12
			},
			{
				"key": "pursuit",
				"levelReq": 15
			},
			{
				"key": "pluck",
				"levelReq": 19
			},
			{
				"key": "double_hit",
				"levelReq": 22
			},
			{
				"key": "agility",
				"levelReq": 26
			},
			{
				"key": "uproar",
				"levelReq": 29
			},
			{
				"key": "acupressure",
				"levelReq": 33
			},
			{
				"key": "swords_dance",
				"levelReq": 36
			},
			{
				"key": "jump_kick",
				"levelReq": 40
			},
			{
				"key": "drill_peck",
				"levelReq": 43
			},
			{
				"key": "endeavor",
				"levelReq": 47
			},
			{
				"key": "thrash",
				"levelReq": 50
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
		"baseExp": 165,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 60,
			"atkFis": 110,
			"atkEsp": 60,
			"def": 70,
			"defEsp": 60,
			"speed": 110
		},
		"abilities": [
			{
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "peck",
				"levelReq": 1
			},
			{
				"key": "quick_attack",
				"levelReq": 1
			},
			{
				"key": "rage",
				"levelReq": 1
			},
			{
				"key": "tri_attack",
				"levelReq": 1
			},
			{
				"key": "tri_attack",
				"levelReq": 1
			},
			{
				"key": "quick_attack",
				"levelReq": 5
			},
			{
				"key": "rage",
				"levelReq": 8
			},
			{
				"key": "fury_attack",
				"levelReq": 12
			},
			{
				"key": "pursuit",
				"levelReq": 15
			},
			{
				"key": "pluck",
				"levelReq": 19
			},
			{
				"key": "double_hit",
				"levelReq": 22
			},
			{
				"key": "agility",
				"levelReq": 26
			},
			{
				"key": "uproar",
				"levelReq": 29
			},
			{
				"key": "acupressure",
				"levelReq": 34
			},
			{
				"key": "swords_dance",
				"levelReq": 38
			},
			{
				"key": "jump_kick",
				"levelReq": 43
			},
			{
				"key": "drill_peck",
				"levelReq": 47
			},
			{
				"key": "endeavor",
				"levelReq": 52
			},
			{
				"key": "thrash",
				"levelReq": 56
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
		"baseExp": 77,
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
				"levelReq": 5
			},
			{
				"key": "defense_curl",
				"levelReq": 9
			},
			{
				"key": "knock_off",
				"levelReq": 13
			},
			{
				"key": "wrap",
				"levelReq": 17
			},
			{
				"key": "stomp",
				"levelReq": 21
			},
			{
				"key": "disable",
				"levelReq": 25
			},
			{
				"key": "slam",
				"levelReq": 29
			},
			{
				"key": "rollout",
				"levelReq": 33
			},
			{
				"key": "chip_away",
				"levelReq": 37
			},
			{
				"key": "me_first",
				"levelReq": 41
			},
			{
				"key": "refresh",
				"levelReq": 45
			},
			{
				"key": "screech",
				"levelReq": 49
			},
			{
				"key": "power_whip",
				"levelReq": 53
			},
			{
				"key": "wring_out",
				"levelReq": 57
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
		"baseExp": 172,
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
				"levelReq": 1
			},
			{
				"key": "fake_out",
				"levelReq": 7
			},
			{
				"key": "tail_whip",
				"levelReq": 10
			},
			{
				"key": "bite",
				"levelReq": 13
			},
			{
				"key": "double_hit",
				"levelReq": 19
			},
			{
				"key": "rage",
				"levelReq": 22
			},
			{
				"key": "mega_punch",
				"levelReq": 25
			},
			{
				"key": "chip_away",
				"levelReq": 31
			},
			{
				"key": "dizzy_punch",
				"levelReq": 34
			},
			{
				"key": "crunch",
				"levelReq": 37
			},
			{
				"key": "endure",
				"levelReq": 43
			},
			{
				"key": "outrage",
				"levelReq": 46
			},
			{
				"key": "sucker_punch",
				"levelReq": 49
			},
			{
				"key": "reversal",
				"levelReq": 50
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
		"baseExp": 172,
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
				"levelReq": 3
			},
			{
				"key": "rage",
				"levelReq": 5
			},
			{
				"key": "horn_attack",
				"levelReq": 8
			},
			{
				"key": "scary_face",
				"levelReq": 11
			},
			{
				"key": "pursuit",
				"levelReq": 15
			},
			{
				"key": "rest",
				"levelReq": 19
			},
			{
				"key": "payback",
				"levelReq": 24
			},
			{
				"key": "work_up",
				"levelReq": 29
			},
			{
				"key": "take_down",
				"levelReq": 35
			},
			{
				"key": "zen_headbutt",
				"levelReq": 41
			},
			{
				"key": "swagger",
				"levelReq": 48
			},
			{
				"key": "thrash",
				"levelReq": 55
			},
			{
				"key": "double_edge",
				"levelReq": 63
			},
			{
				"key": "giga_impact",
				"levelReq": 71
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
		"baseExp": 101,
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
		"baseExp": 65,
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
				"key": "covet",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "helping_hand",
				"levelReq": 1
			},
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
				"levelReq": 5
			},
			{
				"key": "baby_doll_eyes",
				"levelReq": 9
			},
			{
				"key": "quick_attack",
				"levelReq": 13
			},
			{
				"key": "bite",
				"levelReq": 17
			},
			{
				"key": "swift",
				"levelReq": 17
			},
			{
				"key": "refresh",
				"levelReq": 20
			},
			{
				"key": "take_down",
				"levelReq": 25
			},
			{
				"key": "charm",
				"levelReq": 29
			},
			{
				"key": "baton_pass",
				"levelReq": 33
			},
			{
				"key": "double_edge",
				"levelReq": 37
			},
			{
				"key": "last_resort",
				"levelReq": 41
			},
			{
				"key": "trump_card",
				"levelReq": 45
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
		"baseExp": 79,
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
				"key": "conversion",
				"levelReq": 1
			},
			{
				"key": "conversion_2",
				"levelReq": 1
			},
			{
				"key": "sharpen",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "psybeam",
				"levelReq": 7
			},
			{
				"key": "agility",
				"levelReq": 12
			},
			{
				"key": "recover",
				"levelReq": 18
			},
			{
				"key": "magnet_rise",
				"levelReq": 23
			},
			{
				"key": "signal_beam",
				"levelReq": 29
			},
			{
				"key": "recycle",
				"levelReq": 34
			},
			{
				"key": "discharge",
				"levelReq": 40
			},
			{
				"key": "lock_on",
				"levelReq": 45
			},
			{
				"key": "tri_attack",
				"levelReq": 50
			},
			{
				"key": "magic_coat",
				"levelReq": 56
			},
			{
				"key": "zap_cannon",
				"levelReq": 62
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
		"baseExp": 189,
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
				"key": "defense_curl",
				"levelReq": 4
			},
			{
				"key": "amnesia",
				"levelReq": 9
			},
			{
				"key": "lick",
				"levelReq": 12
			},
			{
				"key": "chip_away",
				"levelReq": 17
			},
			{
				"key": "yawn",
				"levelReq": 20
			},
			{
				"key": "body_slam",
				"levelReq": 25
			},
			{
				"key": "rest",
				"levelReq": 28
			},
			{
				"key": "snore",
				"levelReq": 28
			},
			{
				"key": "sleep_talk",
				"levelReq": 33
			},
			{
				"key": "giga_impact",
				"levelReq": 35
			},
			{
				"key": "rollout",
				"levelReq": 36
			},
			{
				"key": "block",
				"levelReq": 41
			},
			{
				"key": "belly_drum",
				"levelReq": 44
			},
			{
				"key": "crunch",
				"levelReq": 49
			},
			{
				"key": "heavy_slam",
				"levelReq": 50
			},
			{
				"key": "high_horsepower",
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
		"baseExp": 43,
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
				"key": "foresight",
				"levelReq": 1
			},
			{
				"key": "scratch",
				"levelReq": 1
			},
			{
				"key": "defense_curl",
				"levelReq": 4
			},
			{
				"key": "quick_attack",
				"levelReq": 7
			},
			{
				"key": "fury_swipes",
				"levelReq": 13
			},
			{
				"key": "helping_hand",
				"levelReq": 16
			},
			{
				"key": "follow_me",
				"levelReq": 19
			},
			{
				"key": "slam",
				"levelReq": 25
			},
			{
				"key": "rest",
				"levelReq": 28
			},
			{
				"key": "sucker_punch",
				"levelReq": 31
			},
			{
				"key": "amnesia",
				"levelReq": 36
			},
			{
				"key": "baton_pass",
				"levelReq": 39
			},
			{
				"key": "me_first",
				"levelReq": 42
			},
			{
				"key": "hyper_voice",
				"levelReq": 47
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
		"baseExp": 145,
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
				"key": "agility",
				"levelReq": 1
			},
			{
				"key": "agility",
				"levelReq": 1
			},
			{
				"key": "coil",
				"levelReq": 1
			},
			{
				"key": "defense_curl",
				"levelReq": 1
			},
			{
				"key": "foresight",
				"levelReq": 1
			},
			{
				"key": "quick_attack",
				"levelReq": 1
			},
			{
				"key": "scratch",
				"levelReq": 1
			},
			{
				"key": "defense_curl",
				"levelReq": 4
			},
			{
				"key": "quick_attack",
				"levelReq": 7
			},
			{
				"key": "fury_swipes",
				"levelReq": 13
			},
			{
				"key": "helping_hand",
				"levelReq": 17
			},
			{
				"key": "follow_me",
				"levelReq": 21
			},
			{
				"key": "slam",
				"levelReq": 28
			},
			{
				"key": "rest",
				"levelReq": 32
			},
			{
				"key": "sucker_punch",
				"levelReq": 36
			},
			{
				"key": "amnesia",
				"levelReq": 42
			},
			{
				"key": "baton_pass",
				"levelReq": 46
			},
			{
				"key": "me_first",
				"levelReq": 50
			},
			{
				"key": "hyper_voice",
				"levelReq": 56
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
		"baseExp": 52,
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
				"key": "foresight",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "hypnosis",
				"levelReq": 4
			},
			{
				"key": "peck",
				"levelReq": 7
			},
			{
				"key": "confusion",
				"levelReq": 10
			},
			{
				"key": "echoed_voice",
				"levelReq": 13
			},
			{
				"key": "zen_headbutt",
				"levelReq": 16
			},
			{
				"key": "psycho_shift",
				"levelReq": 19
			},
			{
				"key": "extrasensory",
				"levelReq": 22
			},
			{
				"key": "take_down",
				"levelReq": 25
			},
			{
				"key": "reflect",
				"levelReq": 28
			},
			{
				"key": "air_slash",
				"levelReq": 31
			},
			{
				"key": "uproar",
				"levelReq": 34
			},
			{
				"key": "roost",
				"levelReq": 37
			},
			{
				"key": "moonblast",
				"levelReq": 40
			},
			{
				"key": "synchronoise",
				"levelReq": 43
			},
			{
				"key": "dream_eater",
				"levelReq": 46
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
		"baseExp": 158,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 100,
			"atkFis": 50,
			"atkEsp": 86,
			"def": 50,
			"defEsp": 96,
			"speed": 70
		},
		"abilities": [
			{
				"key": "dream_eater",
				"levelReq": 1
			},
			{
				"key": "foresight",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "hypnosis",
				"levelReq": 1
			},
			{
				"key": "sky_attack",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "hypnosis",
				"levelReq": 4
			},
			{
				"key": "peck",
				"levelReq": 7
			},
			{
				"key": "confusion",
				"levelReq": 10
			},
			{
				"key": "echoed_voice",
				"levelReq": 13
			},
			{
				"key": "zen_headbutt",
				"levelReq": 16
			},
			{
				"key": "psycho_shift",
				"levelReq": 19
			},
			{
				"key": "extrasensory",
				"levelReq": 23
			},
			{
				"key": "take_down",
				"levelReq": 27
			},
			{
				"key": "reflect",
				"levelReq": 31
			},
			{
				"key": "air_slash",
				"levelReq": 35
			},
			{
				"key": "uproar",
				"levelReq": 39
			},
			{
				"key": "roost",
				"levelReq": 43
			},
			{
				"key": "moonblast",
				"levelReq": 47
			},
			{
				"key": "synchronoise",
				"levelReq": 51
			},
			{
				"key": "dream_eater",
				"levelReq": 55
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"igglybuff": {
		"id": "igglybuff",
		"name": "Igglybuff",
		"description": "Pokedex Nº174 - tipo NORMAL/FAIRY.",
		"type": "NORMAL",
		"type2": "FAIRY",
		"catchRate": 170,
		"baseExp": 42,
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
				"key": "charm",
				"levelReq": 1
			},
			{
				"key": "sing",
				"levelReq": 1
			},
			{
				"key": "defense_curl",
				"levelReq": 3
			},
			{
				"key": "pound",
				"levelReq": 5
			},
			{
				"key": "sweet_kiss",
				"levelReq": 9
			},
			{
				"key": "copycat",
				"levelReq": 11
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
		"baseExp": 72,
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
				"levelReq": 4
			},
			{
				"key": "astonish",
				"levelReq": 8
			},
			{
				"key": "baton_pass",
				"levelReq": 11
			},
			{
				"key": "tickle",
				"levelReq": 15
			},
			{
				"key": "fury_swipes",
				"levelReq": 18
			},
			{
				"key": "swift",
				"levelReq": 22
			},
			{
				"key": "screech",
				"levelReq": 25
			},
			{
				"key": "agility",
				"levelReq": 29
			},
			{
				"key": "double_hit",
				"levelReq": 32
			},
			{
				"key": "fling",
				"levelReq": 36
			},
			{
				"key": "nasty_plot",
				"levelReq": 39
			},
			{
				"key": "last_resort",
				"levelReq": 43
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
		"baseExp": 159,
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
				"key": "astonish",
				"levelReq": 1
			},
			{
				"key": "confusion",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "guard_swap",
				"levelReq": 1
			},
			{
				"key": "power_swap",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "odor_sleuth",
				"levelReq": 5
			},
			{
				"key": "assurance",
				"levelReq": 10
			},
			{
				"key": "stomp",
				"levelReq": 14
			},
			{
				"key": "psybeam",
				"levelReq": 19
			},
			{
				"key": "agility",
				"levelReq": 23
			},
			{
				"key": "double_hit",
				"levelReq": 28
			},
			{
				"key": "zen_headbutt",
				"levelReq": 32
			},
			{
				"key": "crunch",
				"levelReq": 37
			},
			{
				"key": "baton_pass",
				"levelReq": 41
			},
			{
				"key": "nasty_plot",
				"levelReq": 46
			},
			{
				"key": "psychic",
				"levelReq": 50
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
		"baseExp": 145,
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
				"key": "defense_curl",
				"levelReq": 1
			},
			{
				"key": "rage",
				"levelReq": 1
			},
			{
				"key": "rollout",
				"levelReq": 3
			},
			{
				"key": "spite",
				"levelReq": 6
			},
			{
				"key": "pursuit",
				"levelReq": 8
			},
			{
				"key": "screech",
				"levelReq": 11
			},
			{
				"key": "mud_slap",
				"levelReq": 13
			},
			{
				"key": "yawn",
				"levelReq": 16
			},
			{
				"key": "ancient_power",
				"levelReq": 18
			},
			{
				"key": "body_slam",
				"levelReq": 21
			},
			{
				"key": "drill_run",
				"levelReq": 23
			},
			{
				"key": "roost",
				"levelReq": 26
			},
			{
				"key": "take_down",
				"levelReq": 28
			},
			{
				"key": "coil",
				"levelReq": 31
			},
			{
				"key": "dig",
				"levelReq": 33
			},
			{
				"key": "glare",
				"levelReq": 36
			},
			{
				"key": "double_edge",
				"levelReq": 38
			},
			{
				"key": "endeavor",
				"levelReq": 41
			},
			{
				"key": "air_slash",
				"levelReq": 43
			},
			{
				"key": "dragon_rush",
				"levelReq": 46
			},
			{
				"key": "endure",
				"levelReq": 48
			},
			{
				"key": "flail",
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
		"baseExp": 66,
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
				"key": "baby_doll_eyes",
				"levelReq": 1
			},
			{
				"key": "covet",
				"levelReq": 1
			},
			{
				"key": "fake_tears",
				"levelReq": 1
			},
			{
				"key": "fling",
				"levelReq": 1
			},
			{
				"key": "lick",
				"levelReq": 1
			},
			{
				"key": "scratch",
				"levelReq": 1
			},
			{
				"key": "fury_swipes",
				"levelReq": 8
			},
			{
				"key": "feint_attack",
				"levelReq": 15
			},
			{
				"key": "sweet_scent",
				"levelReq": 22
			},
			{
				"key": "play_nice",
				"levelReq": 25
			},
			{
				"key": "slash",
				"levelReq": 29
			},
			{
				"key": "charm",
				"levelReq": 36
			},
			{
				"key": "rest",
				"levelReq": 43
			},
			{
				"key": "snore",
				"levelReq": 43
			},
			{
				"key": "thrash",
				"levelReq": 50
			},
			{
				"key": "fling",
				"levelReq": 57
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
		"baseExp": 175,
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
				"key": "covet",
				"levelReq": 1
			},
			{
				"key": "fake_tears",
				"levelReq": 1
			},
			{
				"key": "hammer_arm",
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
				"key": "scratch",
				"levelReq": 1
			},
			{
				"key": "fury_swipes",
				"levelReq": 8
			},
			{
				"key": "feint_attack",
				"levelReq": 15
			},
			{
				"key": "sweet_scent",
				"levelReq": 22
			},
			{
				"key": "play_nice",
				"levelReq": 25
			},
			{
				"key": "slash",
				"levelReq": 29
			},
			{
				"key": "scary_face",
				"levelReq": 38
			},
			{
				"key": "rest",
				"levelReq": 47
			},
			{
				"key": "snore",
				"levelReq": 49
			},
			{
				"key": "thrash",
				"levelReq": 58
			},
			{
				"key": "hammer_arm",
				"levelReq": 67
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
				"key": "conversion",
				"levelReq": 1
			},
			{
				"key": "conversion_2",
				"levelReq": 1
			},
			{
				"key": "defense_curl",
				"levelReq": 1
			},
			{
				"key": "magic_coat",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "zap_cannon",
				"levelReq": 1
			},
			{
				"key": "psybeam",
				"levelReq": 7
			},
			{
				"key": "agility",
				"levelReq": 12
			},
			{
				"key": "recover",
				"levelReq": 18
			},
			{
				"key": "magnet_rise",
				"levelReq": 23
			},
			{
				"key": "signal_beam",
				"levelReq": 29
			},
			{
				"key": "recycle",
				"levelReq": 34
			},
			{
				"key": "discharge",
				"levelReq": 40
			},
			{
				"key": "lock_on",
				"levelReq": 45
			},
			{
				"key": "tri_attack",
				"levelReq": 50
			},
			{
				"key": "magic_coat",
				"levelReq": 56
			},
			{
				"key": "zap_cannon",
				"levelReq": 62
			},
			{
				"key": "hyper_beam",
				"levelReq": 67
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
		"baseExp": 163,
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
				"key": "me_first",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 3
			},
			{
				"key": "astonish",
				"levelReq": 7
			},
			{
				"key": "hypnosis",
				"levelReq": 10
			},
			{
				"key": "stomp",
				"levelReq": 13
			},
			{
				"key": "sand_attack",
				"levelReq": 16
			},
			{
				"key": "take_down",
				"levelReq": 21
			},
			{
				"key": "confuse_ray",
				"levelReq": 23
			},
			{
				"key": "calm_mind",
				"levelReq": 27
			},
			{
				"key": "role_play",
				"levelReq": 33
			},
			{
				"key": "zen_headbutt",
				"levelReq": 38
			},
			{
				"key": "jump_kick",
				"levelReq": 43
			},
			{
				"key": "imprison",
				"levelReq": 49
			},
			{
				"key": "captivate",
				"levelReq": 50
			},
			{
				"key": "me_first",
				"levelReq": 55
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
		"baseExp": 88,
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
		"baseExp": 172,
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
				"levelReq": 3
			},
			{
				"key": "defense_curl",
				"levelReq": 5
			},
			{
				"key": "stomp",
				"levelReq": 8
			},
			{
				"key": "milk_drink",
				"levelReq": 11
			},
			{
				"key": "bide",
				"levelReq": 15
			},
			{
				"key": "rollout",
				"levelReq": 19
			},
			{
				"key": "body_slam",
				"levelReq": 24
			},
			{
				"key": "zen_headbutt",
				"levelReq": 29
			},
			{
				"key": "captivate",
				"levelReq": 35
			},
			{
				"key": "gyro_ball",
				"levelReq": 41
			},
			{
				"key": "heal_bell",
				"levelReq": 48
			},
			{
				"key": "wake_up_slap",
				"levelReq": 50
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
		"baseExp": 137,
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
				"key": "defense_curl",
				"levelReq": 1
			},
			{
				"key": "mud_sport",
				"levelReq": 1
			},
			{
				"key": "rock_polish",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "mud_sport",
				"levelReq": 4
			},
			{
				"key": "rock_polish",
				"levelReq": 6
			},
			{
				"key": "rollout",
				"levelReq": 10
			},
			{
				"key": "magnitude",
				"levelReq": 12
			},
			{
				"key": "rock_throw",
				"levelReq": 16
			},
			{
				"key": "smack_down",
				"levelReq": 18
			},
			{
				"key": "bulldoze",
				"levelReq": 22
			},
			{
				"key": "self_destruct",
				"levelReq": 24
			},
			{
				"key": "stealth_rock",
				"levelReq": 30
			},
			{
				"key": "rock_blast",
				"levelReq": 34
			},
			{
				"key": "earthquake",
				"levelReq": 40
			},
			{
				"key": "explosion",
				"levelReq": 44
			},
			{
				"key": "double_edge",
				"levelReq": 50
			},
			{
				"key": "stone_edge",
				"levelReq": 54
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
		"baseExp": 223,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 80,
			"atkFis": 120,
			"atkEsp": 55,
			"def": 130,
			"defEsp": 65,
			"speed": 45
		},
		"abilities": [
			{
				"key": "defense_curl",
				"levelReq": 1
			},
			{
				"key": "heavy_slam",
				"levelReq": 1
			},
			{
				"key": "mud_sport",
				"levelReq": 1
			},
			{
				"key": "rock_polish",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "mud_sport",
				"levelReq": 4
			},
			{
				"key": "rock_polish",
				"levelReq": 6
			},
			{
				"key": "steamroller",
				"levelReq": 10
			},
			{
				"key": "magnitude",
				"levelReq": 12
			},
			{
				"key": "rock_throw",
				"levelReq": 16
			},
			{
				"key": "smack_down",
				"levelReq": 18
			},
			{
				"key": "bulldoze",
				"levelReq": 22
			},
			{
				"key": "self_destruct",
				"levelReq": 24
			},
			{
				"key": "stealth_rock",
				"levelReq": 30
			},
			{
				"key": "rock_blast",
				"levelReq": 34
			},
			{
				"key": "earthquake",
				"levelReq": 40
			},
			{
				"key": "explosion",
				"levelReq": 44
			},
			{
				"key": "double_edge",
				"levelReq": 50
			},
			{
				"key": "stone_edge",
				"levelReq": 54
			},
			{
				"key": "heavy_slam",
				"levelReq": 60
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
		"baseExp": 77,
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
				"key": "bind",
				"levelReq": 1
			},
			{
				"key": "harden",
				"levelReq": 1
			},
			{
				"key": "mud_sport",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "curse",
				"levelReq": 4
			},
			{
				"key": "rock_throw",
				"levelReq": 7
			},
			{
				"key": "rock_tomb",
				"levelReq": 10
			},
			{
				"key": "rage",
				"levelReq": 13
			},
			{
				"key": "stealth_rock",
				"levelReq": 16
			},
			{
				"key": "rock_polish",
				"levelReq": 19
			},
			{
				"key": "gyro_ball",
				"levelReq": 20
			},
			{
				"key": "smack_down",
				"levelReq": 22
			},
			{
				"key": "dragon_breath",
				"levelReq": 25
			},
			{
				"key": "slam",
				"levelReq": 28
			},
			{
				"key": "screech",
				"levelReq": 31
			},
			{
				"key": "rock_slide",
				"levelReq": 34
			},
			{
				"key": "sand_tomb",
				"levelReq": 37
			},
			{
				"key": "iron_tail",
				"levelReq": 40
			},
			{
				"key": "dig",
				"levelReq": 43
			},
			{
				"key": "stone_edge",
				"levelReq": 46
			},
			{
				"key": "double_edge",
				"levelReq": 49
			},
			{
				"key": "sandstorm",
				"levelReq": 52
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
		"baseExp": 71,
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
				"levelReq": 7
			},
			{
				"key": "water_gun",
				"levelReq": 10
			},
			{
				"key": "rollout",
				"levelReq": 16
			},
			{
				"key": "leer",
				"levelReq": 19
			},
			{
				"key": "mud_shot",
				"levelReq": 25
			},
			{
				"key": "brine",
				"levelReq": 28
			},
			{
				"key": "protect",
				"levelReq": 34
			},
			{
				"key": "ancient_power",
				"levelReq": 37
			},
			{
				"key": "tickle",
				"levelReq": 43
			},
			{
				"key": "rock_blast",
				"levelReq": 46
			},
			{
				"key": "shell_smash",
				"levelReq": 50
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
		"baseExp": 173,
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
				"key": "bite",
				"levelReq": 1
			},
			{
				"key": "constrict",
				"levelReq": 1
			},
			{
				"key": "hydro_pump",
				"levelReq": 1
			},
			{
				"key": "spike_cannon",
				"levelReq": 1
			},
			{
				"key": "spike_cannon",
				"levelReq": 1
			},
			{
				"key": "withdraw",
				"levelReq": 1
			},
			{
				"key": "bite",
				"levelReq": 7
			},
			{
				"key": "water_gun",
				"levelReq": 10
			},
			{
				"key": "rollout",
				"levelReq": 16
			},
			{
				"key": "leer",
				"levelReq": 19
			},
			{
				"key": "mud_shot",
				"levelReq": 25
			},
			{
				"key": "brine",
				"levelReq": 28
			},
			{
				"key": "protect",
				"levelReq": 34
			},
			{
				"key": "ancient_power",
				"levelReq": 37
			},
			{
				"key": "tickle",
				"levelReq": 48
			},
			{
				"key": "rock_blast",
				"levelReq": 56
			},
			{
				"key": "shell_smash",
				"levelReq": 67
			},
			{
				"key": "hydro_pump",
				"levelReq": 75
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
		"baseExp": 71,
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
				"key": "harden",
				"levelReq": 1
			},
			{
				"key": "scratch",
				"levelReq": 1
			},
			{
				"key": "absorb",
				"levelReq": 6
			},
			{
				"key": "leer",
				"levelReq": 11
			},
			{
				"key": "mud_shot",
				"levelReq": 16
			},
			{
				"key": "sand_attack",
				"levelReq": 21
			},
			{
				"key": "endure",
				"levelReq": 26
			},
			{
				"key": "aqua_jet",
				"levelReq": 31
			},
			{
				"key": "mega_drain",
				"levelReq": 36
			},
			{
				"key": "metal_sound",
				"levelReq": 41
			},
			{
				"key": "ancient_power",
				"levelReq": 46
			},
			{
				"key": "wring_out",
				"levelReq": 50
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
		"baseExp": 173,
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
				"key": "absorb",
				"levelReq": 1
			},
			{
				"key": "feint",
				"levelReq": 1
			},
			{
				"key": "harden",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "night_slash",
				"levelReq": 1
			},
			{
				"key": "scratch",
				"levelReq": 1
			},
			{
				"key": "slash",
				"levelReq": 1
			},
			{
				"key": "slash",
				"levelReq": 1
			},
			{
				"key": "absorb",
				"levelReq": 6
			},
			{
				"key": "leer",
				"levelReq": 11
			},
			{
				"key": "mud_shot",
				"levelReq": 16
			},
			{
				"key": "sand_attack",
				"levelReq": 21
			},
			{
				"key": "endure",
				"levelReq": 26
			},
			{
				"key": "aqua_jet",
				"levelReq": 31
			},
			{
				"key": "mega_drain",
				"levelReq": 36
			},
			{
				"key": "metal_sound",
				"levelReq": 45
			},
			{
				"key": "ancient_power",
				"levelReq": 54
			},
			{
				"key": "wring_out",
				"levelReq": 63
			},
			{
				"key": "night_slash",
				"levelReq": 72
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
		"baseExp": 180,
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
				"key": "bite",
				"levelReq": 1
			},
			{
				"key": "fire_fang",
				"levelReq": 1
			},
			{
				"key": "ice_fang",
				"levelReq": 1
			},
			{
				"key": "iron_head",
				"levelReq": 1
			},
			{
				"key": "scary_face",
				"levelReq": 1
			},
			{
				"key": "supersonic",
				"levelReq": 1
			},
			{
				"key": "thunder_fang",
				"levelReq": 1
			},
			{
				"key": "wing_attack",
				"levelReq": 1
			},
			{
				"key": "roar",
				"levelReq": 9
			},
			{
				"key": "agility",
				"levelReq": 17
			},
			{
				"key": "ancient_power",
				"levelReq": 25
			},
			{
				"key": "crunch",
				"levelReq": 33
			},
			{
				"key": "take_down",
				"levelReq": 41
			},
			{
				"key": "sky_drop",
				"levelReq": 49
			},
			{
				"key": "iron_head",
				"levelReq": 57
			},
			{
				"key": "hyper_beam",
				"levelReq": 65
			},
			{
				"key": "rock_slide",
				"levelReq": 73
			},
			{
				"key": "giga_impact",
				"levelReq": 81
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
		"baseExp": 144,
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
				"key": "copycat",
				"levelReq": 1
			},
			{
				"key": "flail",
				"levelReq": 1
			},
			{
				"key": "low_kick",
				"levelReq": 1
			},
			{
				"key": "rock_throw",
				"levelReq": 1
			},
			{
				"key": "slam",
				"levelReq": 1
			},
			{
				"key": "slam",
				"levelReq": 1
			},
			{
				"key": "wood_hammer",
				"levelReq": 1
			},
			{
				"key": "flail",
				"levelReq": 5
			},
			{
				"key": "low_kick",
				"levelReq": 8
			},
			{
				"key": "rock_throw",
				"levelReq": 12
			},
			{
				"key": "mimic",
				"levelReq": 15
			},
			{
				"key": "feint_attack",
				"levelReq": 19
			},
			{
				"key": "tearful_look",
				"levelReq": 22
			},
			{
				"key": "rock_tomb",
				"levelReq": 26
			},
			{
				"key": "block",
				"levelReq": 29
			},
			{
				"key": "rock_slide",
				"levelReq": 33
			},
			{
				"key": "counter",
				"levelReq": 36
			},
			{
				"key": "sucker_punch",
				"levelReq": 40
			},
			{
				"key": "double_edge",
				"levelReq": 43
			},
			{
				"key": "stone_edge",
				"levelReq": 47
			},
			{
				"key": "hammer_arm",
				"levelReq": 50
			},
			{
				"key": "head_smash",
				"levelReq": 54
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
		"baseExp": 60,
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
				"levelReq": 5
			},
			{
				"key": "screech",
				"levelReq": 10
			},
			{
				"key": "chip_away",
				"levelReq": 14
			},
			{
				"key": "rock_slide",
				"levelReq": 19
			},
			{
				"key": "scary_face",
				"levelReq": 23
			},
			{
				"key": "thrash",
				"levelReq": 28
			},
			{
				"key": "dark_pulse",
				"levelReq": 32
			},
			{
				"key": "payback",
				"levelReq": 37
			},
			{
				"key": "crunch",
				"levelReq": 41
			},
			{
				"key": "earthquake",
				"levelReq": 46
			},
			{
				"key": "stone_edge",
				"levelReq": 50
			},
			{
				"key": "hyper_beam",
				"levelReq": 55
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
				"levelReq": 5
			},
			{
				"key": "screech",
				"levelReq": 10
			},
			{
				"key": "chip_away",
				"levelReq": 14
			},
			{
				"key": "rock_slide",
				"levelReq": 19
			},
			{
				"key": "scary_face",
				"levelReq": 23
			},
			{
				"key": "thrash",
				"levelReq": 28
			},
			{
				"key": "dark_pulse",
				"levelReq": 34
			},
			{
				"key": "payback",
				"levelReq": 41
			},
			{
				"key": "crunch",
				"levelReq": 47
			},
			{
				"key": "earthquake",
				"levelReq": 54
			},
			{
				"key": "stone_edge",
				"levelReq": 60
			},
			{
				"key": "hyper_beam",
				"levelReq": 67
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
		"baseExp": 270,
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
				"key": "fire_fang",
				"levelReq": 1
			},
			{
				"key": "ice_fang",
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
				"key": "thunder_fang",
				"levelReq": 1
			},
			{
				"key": "sandstorm",
				"levelReq": 5
			},
			{
				"key": "screech",
				"levelReq": 10
			},
			{
				"key": "chip_away",
				"levelReq": 14
			},
			{
				"key": "rock_slide",
				"levelReq": 19
			},
			{
				"key": "scary_face",
				"levelReq": 23
			},
			{
				"key": "thrash",
				"levelReq": 28
			},
			{
				"key": "dark_pulse",
				"levelReq": 34
			},
			{
				"key": "payback",
				"levelReq": 41
			},
			{
				"key": "crunch",
				"levelReq": 47
			},
			{
				"key": "earthquake",
				"levelReq": 54
			},
			{
				"key": "stone_edge",
				"levelReq": 63
			},
			{
				"key": "hyper_beam",
				"levelReq": 73
			},
			{
				"key": "giga_impact",
				"levelReq": 82
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
		"baseExp": 60,
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
				"key": "defense_curl",
				"levelReq": 1
			},
			{
				"key": "scratch",
				"levelReq": 1
			},
			{
				"key": "sand_attack",
				"levelReq": 3
			},
			{
				"key": "poison_sting",
				"levelReq": 5
			},
			{
				"key": "rollout",
				"levelReq": 7
			},
			{
				"key": "rapid_spin",
				"levelReq": 9
			},
			{
				"key": "fury_cutter",
				"levelReq": 11
			},
			{
				"key": "magnitude",
				"levelReq": 14
			},
			{
				"key": "swift",
				"levelReq": 17
			},
			{
				"key": "fury_swipes",
				"levelReq": 20
			},
			{
				"key": "sand_tomb",
				"levelReq": 23
			},
			{
				"key": "slash",
				"levelReq": 26
			},
			{
				"key": "dig",
				"levelReq": 30
			},
			{
				"key": "gyro_ball",
				"levelReq": 34
			},
			{
				"key": "swords_dance",
				"levelReq": 38
			},
			{
				"key": "sandstorm",
				"levelReq": 42
			},
			{
				"key": "earthquake",
				"levelReq": 46
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
		"baseExp": 158,
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
				"key": "crush_claw",
				"levelReq": 1
			},
			{
				"key": "crush_claw",
				"levelReq": 1
			},
			{
				"key": "defense_curl",
				"levelReq": 1
			},
			{
				"key": "poison_sting",
				"levelReq": 1
			},
			{
				"key": "sand_attack",
				"levelReq": 1
			},
			{
				"key": "scratch",
				"levelReq": 1
			},
			{
				"key": "sand_attack",
				"levelReq": 3
			},
			{
				"key": "poison_sting",
				"levelReq": 5
			},
			{
				"key": "rollout",
				"levelReq": 7
			},
			{
				"key": "rapid_spin",
				"levelReq": 9
			},
			{
				"key": "fury_cutter",
				"levelReq": 11
			},
			{
				"key": "magnitude",
				"levelReq": 14
			},
			{
				"key": "swift",
				"levelReq": 17
			},
			{
				"key": "fury_swipes",
				"levelReq": 20
			},
			{
				"key": "sand_tomb",
				"levelReq": 24
			},
			{
				"key": "slash",
				"levelReq": 28
			},
			{
				"key": "dig",
				"levelReq": 33
			},
			{
				"key": "gyro_ball",
				"levelReq": 38
			},
			{
				"key": "swords_dance",
				"levelReq": 43
			},
			{
				"key": "sandstorm",
				"levelReq": 48
			},
			{
				"key": "earthquake",
				"levelReq": 53
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
		"baseExp": 53,
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
				"key": "sand_attack",
				"levelReq": 1
			},
			{
				"key": "scratch",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 4
			},
			{
				"key": "astonish",
				"levelReq": 7
			},
			{
				"key": "mud_slap",
				"levelReq": 10
			},
			{
				"key": "magnitude",
				"levelReq": 14
			},
			{
				"key": "bulldoze",
				"levelReq": 18
			},
			{
				"key": "sucker_punch",
				"levelReq": 22
			},
			{
				"key": "mud_bomb",
				"levelReq": 25
			},
			{
				"key": "earth_power",
				"levelReq": 28
			},
			{
				"key": "dig",
				"levelReq": 31
			},
			{
				"key": "slash",
				"levelReq": 35
			},
			{
				"key": "earthquake",
				"levelReq": 39
			},
			{
				"key": "fissure",
				"levelReq": 43
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
		"baseExp": 149,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 35,
			"atkFis": 100,
			"atkEsp": 50,
			"def": 50,
			"defEsp": 70,
			"speed": 120
		},
		"abilities": [
			{
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "night_slash",
				"levelReq": 1
			},
			{
				"key": "rototiller",
				"levelReq": 1
			},
			{
				"key": "sand_attack",
				"levelReq": 1
			},
			{
				"key": "sand_tomb",
				"levelReq": 1
			},
			{
				"key": "sand_tomb",
				"levelReq": 1
			},
			{
				"key": "scratch",
				"levelReq": 1
			},
			{
				"key": "tri_attack",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 4
			},
			{
				"key": "astonish",
				"levelReq": 7
			},
			{
				"key": "mud_slap",
				"levelReq": 10
			},
			{
				"key": "magnitude",
				"levelReq": 14
			},
			{
				"key": "bulldoze",
				"levelReq": 18
			},
			{
				"key": "sucker_punch",
				"levelReq": 22
			},
			{
				"key": "mud_bomb",
				"levelReq": 25
			},
			{
				"key": "earth_power",
				"levelReq": 30
			},
			{
				"key": "dig",
				"levelReq": 35
			},
			{
				"key": "slash",
				"levelReq": 41
			},
			{
				"key": "earthquake",
				"levelReq": 47
			},
			{
				"key": "fissure",
				"levelReq": 53
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
		"baseExp": 64,
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
				"levelReq": 3
			},
			{
				"key": "bone_club",
				"levelReq": 7
			},
			{
				"key": "headbutt",
				"levelReq": 11
			},
			{
				"key": "leer",
				"levelReq": 13
			},
			{
				"key": "focus_energy",
				"levelReq": 17
			},
			{
				"key": "bonemerang",
				"levelReq": 21
			},
			{
				"key": "rage",
				"levelReq": 23
			},
			{
				"key": "false_swipe",
				"levelReq": 27
			},
			{
				"key": "thrash",
				"levelReq": 31
			},
			{
				"key": "fling",
				"levelReq": 33
			},
			{
				"key": "stomping_tantrum",
				"levelReq": 37
			},
			{
				"key": "endeavor",
				"levelReq": 41
			},
			{
				"key": "double_edge",
				"levelReq": 43
			},
			{
				"key": "retaliate",
				"levelReq": 47
			},
			{
				"key": "bone_rush",
				"levelReq": 51
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
		"baseExp": 149,
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
				"key": "bone_club",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "headbutt",
				"levelReq": 1
			},
			{
				"key": "tail_whip",
				"levelReq": 1
			},
			{
				"key": "tail_whip",
				"levelReq": 3
			},
			{
				"key": "bone_club",
				"levelReq": 7
			},
			{
				"key": "headbutt",
				"levelReq": 11
			},
			{
				"key": "leer",
				"levelReq": 13
			},
			{
				"key": "focus_energy",
				"levelReq": 17
			},
			{
				"key": "bonemerang",
				"levelReq": 21
			},
			{
				"key": "rage",
				"levelReq": 23
			},
			{
				"key": "false_swipe",
				"levelReq": 27
			},
			{
				"key": "thrash",
				"levelReq": 33
			},
			{
				"key": "fling",
				"levelReq": 37
			},
			{
				"key": "stomping_tantrum",
				"levelReq": 43
			},
			{
				"key": "endeavor",
				"levelReq": 49
			},
			{
				"key": "double_edge",
				"levelReq": 53
			},
			{
				"key": "retaliate",
				"levelReq": 59
			},
			{
				"key": "bone_rush",
				"levelReq": 65
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
		"baseExp": 69,
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
				"key": "fury_attack",
				"levelReq": 5
			},
			{
				"key": "scary_face",
				"levelReq": 9
			},
			{
				"key": "smack_down",
				"levelReq": 13
			},
			{
				"key": "stomp",
				"levelReq": 17
			},
			{
				"key": "bulldoze",
				"levelReq": 21
			},
			{
				"key": "chip_away",
				"levelReq": 25
			},
			{
				"key": "rock_blast",
				"levelReq": 29
			},
			{
				"key": "drill_run",
				"levelReq": 33
			},
			{
				"key": "take_down",
				"levelReq": 37
			},
			{
				"key": "stone_edge",
				"levelReq": 41
			},
			{
				"key": "earthquake",
				"levelReq": 45
			},
			{
				"key": "megahorn",
				"levelReq": 49
			},
			{
				"key": "horn_drill",
				"levelReq": 53
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
		"baseExp": 170,
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
				"key": "fury_attack",
				"levelReq": 1
			},
			{
				"key": "hammer_arm",
				"levelReq": 1
			},
			{
				"key": "hammer_arm",
				"levelReq": 1
			},
			{
				"key": "horn_attack",
				"levelReq": 1
			},
			{
				"key": "horn_drill",
				"levelReq": 1
			},
			{
				"key": "scary_face",
				"levelReq": 1
			},
			{
				"key": "tail_whip",
				"levelReq": 1
			},
			{
				"key": "fury_attack",
				"levelReq": 5
			},
			{
				"key": "scary_face",
				"levelReq": 9
			},
			{
				"key": "smack_down",
				"levelReq": 13
			},
			{
				"key": "stomp",
				"levelReq": 17
			},
			{
				"key": "bulldoze",
				"levelReq": 21
			},
			{
				"key": "chip_away",
				"levelReq": 25
			},
			{
				"key": "rock_blast",
				"levelReq": 29
			},
			{
				"key": "drill_run",
				"levelReq": 33
			},
			{
				"key": "take_down",
				"levelReq": 37
			},
			{
				"key": "stone_edge",
				"levelReq": 41
			},
			{
				"key": "earthquake",
				"levelReq": 48
			},
			{
				"key": "megahorn",
				"levelReq": 55
			},
			{
				"key": "horn_drill",
				"levelReq": 62
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
		"baseExp": 86,
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
				"levelReq": 4
			},
			{
				"key": "harden",
				"levelReq": 7
			},
			{
				"key": "knock_off",
				"levelReq": 10
			},
			{
				"key": "quick_attack",
				"levelReq": 13
			},
			{
				"key": "fury_cutter",
				"levelReq": 16
			},
			{
				"key": "feint_attack",
				"levelReq": 19
			},
			{
				"key": "acrobatics",
				"levelReq": 22
			},
			{
				"key": "slash",
				"levelReq": 27
			},
			{
				"key": "u_turn",
				"levelReq": 30
			},
			{
				"key": "screech",
				"levelReq": 35
			},
			{
				"key": "x_scissor",
				"levelReq": 40
			},
			{
				"key": "sky_uppercut",
				"levelReq": 45
			},
			{
				"key": "swords_dance",
				"levelReq": 50
			},
			{
				"key": "guillotine",
				"levelReq": 55
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
		"baseExp": 66,
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
				"key": "defense_curl",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "odor_sleuth",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "flail",
				"levelReq": 6
			},
			{
				"key": "rollout",
				"levelReq": 10
			},
			{
				"key": "natural_gift",
				"levelReq": 15
			},
			{
				"key": "endure",
				"levelReq": 19
			},
			{
				"key": "slam",
				"levelReq": 24
			},
			{
				"key": "take_down",
				"levelReq": 28
			},
			{
				"key": "charm",
				"levelReq": 33
			},
			{
				"key": "last_resort",
				"levelReq": 37
			},
			{
				"key": "double_edge",
				"levelReq": 42
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
		"baseExp": 175,
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
				"key": "bulldoze",
				"levelReq": 1
			},
			{
				"key": "defense_curl",
				"levelReq": 1
			},
			{
				"key": "fire_fang",
				"levelReq": 1
			},
			{
				"key": "fury_attack",
				"levelReq": 1
			},
			{
				"key": "fury_attack",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "horn_attack",
				"levelReq": 1
			},
			{
				"key": "thunder_fang",
				"levelReq": 1
			},
			{
				"key": "rapid_spin",
				"levelReq": 6
			},
			{
				"key": "rollout",
				"levelReq": 10
			},
			{
				"key": "assurance",
				"levelReq": 15
			},
			{
				"key": "knock_off",
				"levelReq": 19
			},
			{
				"key": "slam",
				"levelReq": 24
			},
			{
				"key": "magnitude",
				"levelReq": 30
			},
			{
				"key": "scary_face",
				"levelReq": 37
			},
			{
				"key": "earthquake",
				"levelReq": 43
			},
			{
				"key": "giga_impact",
				"levelReq": 50
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
				"key": "ember",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "scratch",
				"levelReq": 1
			},
			{
				"key": "ember",
				"levelReq": 7
			},
			{
				"key": "smokescreen",
				"levelReq": 10
			},
			{
				"key": "dragon_rage",
				"levelReq": 17
			},
			{
				"key": "scary_face",
				"levelReq": 21
			},
			{
				"key": "fire_fang",
				"levelReq": 28
			},
			{
				"key": "flame_burst",
				"levelReq": 32
			},
			{
				"key": "slash",
				"levelReq": 39
			},
			{
				"key": "flamethrower",
				"levelReq": 43
			},
			{
				"key": "fire_spin",
				"levelReq": 50
			},
			{
				"key": "inferno",
				"levelReq": 54
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
		"baseExp": 240,
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
				"key": "air_slash",
				"levelReq": 1
			},
			{
				"key": "dragon_claw",
				"levelReq": 1
			},
			{
				"key": "ember",
				"levelReq": 1
			},
			{
				"key": "flare_blitz",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "heat_wave",
				"levelReq": 1
			},
			{
				"key": "scratch",
				"levelReq": 1
			},
			{
				"key": "shadow_claw",
				"levelReq": 1
			},
			{
				"key": "wing_attack",
				"levelReq": 1
			},
			{
				"key": "wing_attack",
				"levelReq": 1
			},
			{
				"key": "ember",
				"levelReq": 7
			},
			{
				"key": "smokescreen",
				"levelReq": 10
			},
			{
				"key": "dragon_rage",
				"levelReq": 17
			},
			{
				"key": "scary_face",
				"levelReq": 21
			},
			{
				"key": "fire_fang",
				"levelReq": 28
			},
			{
				"key": "flame_burst",
				"levelReq": 32
			},
			{
				"key": "slash",
				"levelReq": 41
			},
			{
				"key": "flamethrower",
				"levelReq": 47
			},
			{
				"key": "fire_spin",
				"levelReq": 56
			},
			{
				"key": "inferno",
				"levelReq": 62
			},
			{
				"key": "heat_wave",
				"levelReq": 71
			},
			{
				"key": "flare_blitz",
				"levelReq": 77
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
		"baseExp": 70,
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
				"levelReq": 6
			},
			{
				"key": "leer",
				"levelReq": 8
			},
			{
				"key": "odor_sleuth",
				"levelReq": 10
			},
			{
				"key": "helping_hand",
				"levelReq": 12
			},
			{
				"key": "flame_wheel",
				"levelReq": 17
			},
			{
				"key": "reversal",
				"levelReq": 19
			},
			{
				"key": "fire_fang",
				"levelReq": 21
			},
			{
				"key": "take_down",
				"levelReq": 23
			},
			{
				"key": "flame_burst",
				"levelReq": 28
			},
			{
				"key": "agility",
				"levelReq": 30
			},
			{
				"key": "retaliate",
				"levelReq": 32
			},
			{
				"key": "flamethrower",
				"levelReq": 34
			},
			{
				"key": "crunch",
				"levelReq": 39
			},
			{
				"key": "heat_wave",
				"levelReq": 41
			},
			{
				"key": "outrage",
				"levelReq": 43
			},
			{
				"key": "flare_blitz",
				"levelReq": 45
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
		"baseExp": 194,
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
				"key": "bite",
				"levelReq": 1
			},
			{
				"key": "fire_fang",
				"levelReq": 1
			},
			{
				"key": "odor_sleuth",
				"levelReq": 1
			},
			{
				"key": "roar",
				"levelReq": 1
			},
			{
				"key": "thunder_fang",
				"levelReq": 1
			},
			{
				"key": "extreme_speed",
				"levelReq": 34
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
		"baseExp": 82,
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
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "tail_whip",
				"levelReq": 4
			},
			{
				"key": "ember",
				"levelReq": 9
			},
			{
				"key": "flame_wheel",
				"levelReq": 13
			},
			{
				"key": "stomp",
				"levelReq": 17
			},
			{
				"key": "flame_charge",
				"levelReq": 21
			},
			{
				"key": "fire_spin",
				"levelReq": 25
			},
			{
				"key": "take_down",
				"levelReq": 29
			},
			{
				"key": "inferno",
				"levelReq": 33
			},
			{
				"key": "agility",
				"levelReq": 37
			},
			{
				"key": "fire_blast",
				"levelReq": 41
			},
			{
				"key": "bounce",
				"levelReq": 45
			},
			{
				"key": "flare_blitz",
				"levelReq": 49
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
		"baseExp": 175,
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
				"key": "ember",
				"levelReq": 1
			},
			{
				"key": "fury_attack",
				"levelReq": 1
			},
			{
				"key": "fury_attack",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "megahorn",
				"levelReq": 1
			},
			{
				"key": "poison_jab",
				"levelReq": 1
			},
			{
				"key": "quick_attack",
				"levelReq": 1
			},
			{
				"key": "tail_whip",
				"levelReq": 1
			},
			{
				"key": "tail_whip",
				"levelReq": 4
			},
			{
				"key": "ember",
				"levelReq": 9
			},
			{
				"key": "flame_wheel",
				"levelReq": 13
			},
			{
				"key": "stomp",
				"levelReq": 17
			},
			{
				"key": "flame_charge",
				"levelReq": 21
			},
			{
				"key": "fire_spin",
				"levelReq": 25
			},
			{
				"key": "take_down",
				"levelReq": 29
			},
			{
				"key": "inferno",
				"levelReq": 33
			},
			{
				"key": "agility",
				"levelReq": 37
			},
			{
				"key": "fire_blast",
				"levelReq": 41
			},
			{
				"key": "bounce",
				"levelReq": 45
			},
			{
				"key": "flare_blitz",
				"levelReq": 49
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
		"baseExp": 173,
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
				"key": "ember",
				"levelReq": 5
			},
			{
				"key": "smokescreen",
				"levelReq": 8
			},
			{
				"key": "feint_attack",
				"levelReq": 12
			},
			{
				"key": "fire_spin",
				"levelReq": 15
			},
			{
				"key": "clear_smog",
				"levelReq": 19
			},
			{
				"key": "flame_burst",
				"levelReq": 22
			},
			{
				"key": "confuse_ray",
				"levelReq": 26
			},
			{
				"key": "fire_punch",
				"levelReq": 29
			},
			{
				"key": "lava_plume",
				"levelReq": 36
			},
			{
				"key": "sunny_day",
				"levelReq": 42
			},
			{
				"key": "flamethrower",
				"levelReq": 49
			},
			{
				"key": "fire_blast",
				"levelReq": 55
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
		"baseExp": 62,
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
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "smokescreen",
				"levelReq": 6
			},
			{
				"key": "ember",
				"levelReq": 10
			},
			{
				"key": "quick_attack",
				"levelReq": 13
			},
			{
				"key": "flame_wheel",
				"levelReq": 19
			},
			{
				"key": "defense_curl",
				"levelReq": 22
			},
			{
				"key": "flame_charge",
				"levelReq": 28
			},
			{
				"key": "swift",
				"levelReq": 31
			},
			{
				"key": "lava_plume",
				"levelReq": 37
			},
			{
				"key": "flamethrower",
				"levelReq": 40
			},
			{
				"key": "inferno",
				"levelReq": 46
			},
			{
				"key": "rollout",
				"levelReq": 49
			},
			{
				"key": "double_edge",
				"levelReq": 55
			},
			{
				"key": "burn_up",
				"levelReq": 58
			},
			{
				"key": "eruption",
				"levelReq": 64
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
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "smokescreen",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "smokescreen",
				"levelReq": 6
			},
			{
				"key": "ember",
				"levelReq": 10
			},
			{
				"key": "quick_attack",
				"levelReq": 13
			},
			{
				"key": "flame_wheel",
				"levelReq": 20
			},
			{
				"key": "defense_curl",
				"levelReq": 24
			},
			{
				"key": "swift",
				"levelReq": 31
			},
			{
				"key": "flame_charge",
				"levelReq": 35
			},
			{
				"key": "lava_plume",
				"levelReq": 42
			},
			{
				"key": "flamethrower",
				"levelReq": 46
			},
			{
				"key": "inferno",
				"levelReq": 53
			},
			{
				"key": "rollout",
				"levelReq": 57
			},
			{
				"key": "double_edge",
				"levelReq": 64
			},
			{
				"key": "burn_up",
				"levelReq": 68
			},
			{
				"key": "eruption",
				"levelReq": 75
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
		"baseExp": 240,
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
				"key": "double_edge",
				"levelReq": 1
			},
			{
				"key": "ember",
				"levelReq": 1
			},
			{
				"key": "eruption",
				"levelReq": 1
			},
			{
				"key": "gyro_ball",
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
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "smokescreen",
				"levelReq": 6
			},
			{
				"key": "ember",
				"levelReq": 10
			},
			{
				"key": "quick_attack",
				"levelReq": 13
			},
			{
				"key": "flame_wheel",
				"levelReq": 20
			},
			{
				"key": "defense_curl",
				"levelReq": 24
			},
			{
				"key": "swift",
				"levelReq": 31
			},
			{
				"key": "flame_charge",
				"levelReq": 35
			},
			{
				"key": "lava_plume",
				"levelReq": 43
			},
			{
				"key": "flamethrower",
				"levelReq": 48
			},
			{
				"key": "inferno",
				"levelReq": 56
			},
			{
				"key": "rollout",
				"levelReq": 61
			},
			{
				"key": "double_edge",
				"levelReq": 69
			},
			{
				"key": "burn_up",
				"levelReq": 74
			},
			{
				"key": "eruption",
				"levelReq": 82
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
		"baseExp": 50,
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
				"key": "yawn",
				"levelReq": 1
			},
			{
				"key": "ember",
				"levelReq": 6
			},
			{
				"key": "rock_throw",
				"levelReq": 8
			},
			{
				"key": "harden",
				"levelReq": 13
			},
			{
				"key": "incinerate",
				"levelReq": 15
			},
			{
				"key": "clear_smog",
				"levelReq": 20
			},
			{
				"key": "ancient_power",
				"levelReq": 22
			},
			{
				"key": "flame_burst",
				"levelReq": 27
			},
			{
				"key": "rock_slide",
				"levelReq": 29
			},
			{
				"key": "lava_plume",
				"levelReq": 34
			},
			{
				"key": "amnesia",
				"levelReq": 36
			},
			{
				"key": "body_slam",
				"levelReq": 41
			},
			{
				"key": "recover",
				"levelReq": 43
			},
			{
				"key": "flamethrower",
				"levelReq": 48
			},
			{
				"key": "earth_power",
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
		"baseExp": 151,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 60,
			"atkFis": 50,
			"atkEsp": 90,
			"def": 120,
			"defEsp": 80,
			"speed": 30
		},
		"abilities": [
			{
				"key": "earth_power",
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
				"key": "shell_smash",
				"levelReq": 1
			},
			{
				"key": "shell_smash",
				"levelReq": 1
			},
			{
				"key": "smog",
				"levelReq": 1
			},
			{
				"key": "yawn",
				"levelReq": 1
			},
			{
				"key": "ember",
				"levelReq": 6
			},
			{
				"key": "rock_throw",
				"levelReq": 8
			},
			{
				"key": "harden",
				"levelReq": 13
			},
			{
				"key": "incinerate",
				"levelReq": 15
			},
			{
				"key": "clear_smog",
				"levelReq": 20
			},
			{
				"key": "ancient_power",
				"levelReq": 22
			},
			{
				"key": "flame_burst",
				"levelReq": 27
			},
			{
				"key": "rock_slide",
				"levelReq": 29
			},
			{
				"key": "lava_plume",
				"levelReq": 34
			},
			{
				"key": "amnesia",
				"levelReq": 36
			},
			{
				"key": "body_slam",
				"levelReq": 43
			},
			{
				"key": "recover",
				"levelReq": 47
			},
			{
				"key": "flamethrower",
				"levelReq": 54
			},
			{
				"key": "earth_power",
				"levelReq": 58
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
		"baseExp": 73,
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
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "smog",
				"levelReq": 1
			},
			{
				"key": "ember",
				"levelReq": 5
			},
			{
				"key": "smokescreen",
				"levelReq": 8
			},
			{
				"key": "feint_attack",
				"levelReq": 12
			},
			{
				"key": "fire_spin",
				"levelReq": 15
			},
			{
				"key": "clear_smog",
				"levelReq": 19
			},
			{
				"key": "flame_burst",
				"levelReq": 22
			},
			{
				"key": "confuse_ray",
				"levelReq": 26
			},
			{
				"key": "fire_punch",
				"levelReq": 29
			},
			{
				"key": "lava_plume",
				"levelReq": 33
			},
			{
				"key": "sunny_day",
				"levelReq": 36
			},
			{
				"key": "flamethrower",
				"levelReq": 40
			},
			{
				"key": "fire_blast",
				"levelReq": 43
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
		"baseExp": 112,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 35,
			"atkFis": 55,
			"atkEsp": 50,
			"def": 40,
			"defEsp": 50,
			"speed": 90
		},
		"abilities": [
			{
				"key": "tail_whip",
				"levelReq": 1
			},
			{
				"key": "thunder_shock",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 5
			},
			{
				"key": "play_nice",
				"levelReq": 7
			},
			{
				"key": "quick_attack",
				"levelReq": 10
			},
			{
				"key": "electro_ball",
				"levelReq": 13
			},
			{
				"key": "thunder_wave",
				"levelReq": 18
			},
			{
				"key": "feint",
				"levelReq": 21
			},
			{
				"key": "double_team",
				"levelReq": 23
			},
			{
				"key": "spark",
				"levelReq": 26
			},
			{
				"key": "nuzzle",
				"levelReq": 29
			},
			{
				"key": "discharge",
				"levelReq": 34
			},
			{
				"key": "slam",
				"levelReq": 37
			},
			{
				"key": "thunderbolt",
				"levelReq": 42
			},
			{
				"key": "agility",
				"levelReq": 45
			},
			{
				"key": "wild_charge",
				"levelReq": 50
			},
			{
				"key": "light_screen",
				"levelReq": 53
			},
			{
				"key": "thunder",
				"levelReq": 58
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
		"baseExp": 65,
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
				"key": "supersonic",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "thunder_shock",
				"levelReq": 5
			},
			{
				"key": "thunder_wave",
				"levelReq": 7
			},
			{
				"key": "magnet_bomb",
				"levelReq": 11
			},
			{
				"key": "light_screen",
				"levelReq": 13
			},
			{
				"key": "sonic_boom",
				"levelReq": 17
			},
			{
				"key": "spark",
				"levelReq": 19
			},
			{
				"key": "mirror_shot",
				"levelReq": 23
			},
			{
				"key": "metal_sound",
				"levelReq": 25
			},
			{
				"key": "electro_ball",
				"levelReq": 29
			},
			{
				"key": "flash_cannon",
				"levelReq": 31
			},
			{
				"key": "screech",
				"levelReq": 35
			},
			{
				"key": "discharge",
				"levelReq": 37
			},
			{
				"key": "lock_on",
				"levelReq": 41
			},
			{
				"key": "magnet_rise",
				"levelReq": 43
			},
			{
				"key": "gyro_ball",
				"levelReq": 47
			},
			{
				"key": "zap_cannon",
				"levelReq": 49
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
		"baseExp": 163,
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
				"key": "electric_terrain",
				"levelReq": 1
			},
			{
				"key": "supersonic",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "thunder_shock",
				"levelReq": 1
			},
			{
				"key": "thunder_wave",
				"levelReq": 1
			},
			{
				"key": "tri_attack",
				"levelReq": 1
			},
			{
				"key": "tri_attack",
				"levelReq": 1
			},
			{
				"key": "zap_cannon",
				"levelReq": 1
			},
			{
				"key": "thunder_shock",
				"levelReq": 5
			},
			{
				"key": "thunder_wave",
				"levelReq": 7
			},
			{
				"key": "magnet_bomb",
				"levelReq": 11
			},
			{
				"key": "light_screen",
				"levelReq": 13
			},
			{
				"key": "sonic_boom",
				"levelReq": 17
			},
			{
				"key": "spark",
				"levelReq": 19
			},
			{
				"key": "mirror_shot",
				"levelReq": 23
			},
			{
				"key": "metal_sound",
				"levelReq": 25
			},
			{
				"key": "electro_ball",
				"levelReq": 29
			},
			{
				"key": "flash_cannon",
				"levelReq": 33
			},
			{
				"key": "screech",
				"levelReq": 39
			},
			{
				"key": "discharge",
				"levelReq": 43
			},
			{
				"key": "lock_on",
				"levelReq": 49
			},
			{
				"key": "magnet_rise",
				"levelReq": 53
			},
			{
				"key": "gyro_ball",
				"levelReq": 59
			},
			{
				"key": "zap_cannon",
				"levelReq": 63
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
		"baseExp": 66,
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
				"key": "charge",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "sonic_boom",
				"levelReq": 4
			},
			{
				"key": "eerie_impulse",
				"levelReq": 6
			},
			{
				"key": "spark",
				"levelReq": 9
			},
			{
				"key": "rollout",
				"levelReq": 11
			},
			{
				"key": "screech",
				"levelReq": 13
			},
			{
				"key": "charge_beam",
				"levelReq": 16
			},
			{
				"key": "swift",
				"levelReq": 20
			},
			{
				"key": "electro_ball",
				"levelReq": 22
			},
			{
				"key": "self_destruct",
				"levelReq": 26
			},
			{
				"key": "light_screen",
				"levelReq": 29
			},
			{
				"key": "magnet_rise",
				"levelReq": 34
			},
			{
				"key": "discharge",
				"levelReq": 37
			},
			{
				"key": "explosion",
				"levelReq": 41
			},
			{
				"key": "gyro_ball",
				"levelReq": 46
			},
			{
				"key": "mirror_coat",
				"levelReq": 48
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
		"baseExp": 172,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 60,
			"atkFis": 50,
			"atkEsp": 80,
			"def": 70,
			"defEsp": 80,
			"speed": 150
		},
		"abilities": [
			{
				"key": "charge",
				"levelReq": 1
			},
			{
				"key": "eerie_impulse",
				"levelReq": 1
			},
			{
				"key": "magnetic_flux",
				"levelReq": 1
			},
			{
				"key": "sonic_boom",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "sonic_boom",
				"levelReq": 4
			},
			{
				"key": "eerie_impulse",
				"levelReq": 6
			},
			{
				"key": "spark",
				"levelReq": 9
			},
			{
				"key": "rollout",
				"levelReq": 11
			},
			{
				"key": "screech",
				"levelReq": 13
			},
			{
				"key": "charge_beam",
				"levelReq": 16
			},
			{
				"key": "swift",
				"levelReq": 20
			},
			{
				"key": "electro_ball",
				"levelReq": 22
			},
			{
				"key": "self_destruct",
				"levelReq": 26
			},
			{
				"key": "light_screen",
				"levelReq": 29
			},
			{
				"key": "magnet_rise",
				"levelReq": 36
			},
			{
				"key": "discharge",
				"levelReq": 41
			},
			{
				"key": "explosion",
				"levelReq": 47
			},
			{
				"key": "gyro_ball",
				"levelReq": 54
			},
			{
				"key": "mirror_coat",
				"levelReq": 58
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
		"baseExp": 172,
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
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "quick_attack",
				"levelReq": 1
			},
			{
				"key": "thunder_shock",
				"levelReq": 1
			},
			{
				"key": "thunder_shock",
				"levelReq": 5
			},
			{
				"key": "low_kick",
				"levelReq": 8
			},
			{
				"key": "swift",
				"levelReq": 12
			},
			{
				"key": "shock_wave",
				"levelReq": 15
			},
			{
				"key": "thunder_wave",
				"levelReq": 19
			},
			{
				"key": "electro_ball",
				"levelReq": 22
			},
			{
				"key": "light_screen",
				"levelReq": 26
			},
			{
				"key": "thunder_punch",
				"levelReq": 29
			},
			{
				"key": "discharge",
				"levelReq": 36
			},
			{
				"key": "screech",
				"levelReq": 42
			},
			{
				"key": "thunderbolt",
				"levelReq": 49
			},
			{
				"key": "thunder",
				"levelReq": 55
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
		"baseExp": 41,
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
				"key": "charm",
				"levelReq": 1
			},
			{
				"key": "thunder_shock",
				"levelReq": 1
			},
			{
				"key": "tail_whip",
				"levelReq": 5
			},
			{
				"key": "sweet_kiss",
				"levelReq": 10
			},
			{
				"key": "nasty_plot",
				"levelReq": 13
			},
			{
				"key": "thunder_wave",
				"levelReq": 18
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
		"baseExp": 56,
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
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "thunder_wave",
				"levelReq": 4
			},
			{
				"key": "thunder_shock",
				"levelReq": 8
			},
			{
				"key": "cotton_spore",
				"levelReq": 11
			},
			{
				"key": "charge",
				"levelReq": 15
			},
			{
				"key": "take_down",
				"levelReq": 18
			},
			{
				"key": "electro_ball",
				"levelReq": 22
			},
			{
				"key": "confuse_ray",
				"levelReq": 25
			},
			{
				"key": "power_gem",
				"levelReq": 29
			},
			{
				"key": "discharge",
				"levelReq": 32
			},
			{
				"key": "cotton_guard",
				"levelReq": 36
			},
			{
				"key": "signal_beam",
				"levelReq": 39
			},
			{
				"key": "light_screen",
				"levelReq": 43
			},
			{
				"key": "thunder",
				"levelReq": 46
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
		"baseExp": 128,
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
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "thunder_shock",
				"levelReq": 1
			},
			{
				"key": "thunder_wave",
				"levelReq": 1
			},
			{
				"key": "thunder_wave",
				"levelReq": 4
			},
			{
				"key": "thunder_shock",
				"levelReq": 8
			},
			{
				"key": "cotton_spore",
				"levelReq": 11
			},
			{
				"key": "charge",
				"levelReq": 16
			},
			{
				"key": "take_down",
				"levelReq": 20
			},
			{
				"key": "electro_ball",
				"levelReq": 25
			},
			{
				"key": "confuse_ray",
				"levelReq": 29
			},
			{
				"key": "power_gem",
				"levelReq": 34
			},
			{
				"key": "discharge",
				"levelReq": 38
			},
			{
				"key": "cotton_guard",
				"levelReq": 43
			},
			{
				"key": "signal_beam",
				"levelReq": 47
			},
			{
				"key": "light_screen",
				"levelReq": 52
			},
			{
				"key": "thunder",
				"levelReq": 56
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
		"baseExp": 230,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 90,
			"atkFis": 75,
			"atkEsp": 115,
			"def": 85,
			"defEsp": 90,
			"speed": 55
		},
		"abilities": [
			{
				"key": "dragon_pulse",
				"levelReq": 1
			},
			{
				"key": "fire_punch",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "ion_deluge",
				"levelReq": 1
			},
			{
				"key": "magnetic_flux",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "thunder_punch",
				"levelReq": 1
			},
			{
				"key": "thunder_punch",
				"levelReq": 1
			},
			{
				"key": "thunder_shock",
				"levelReq": 1
			},
			{
				"key": "thunder_wave",
				"levelReq": 1
			},
			{
				"key": "zap_cannon",
				"levelReq": 1
			},
			{
				"key": "thunder_wave",
				"levelReq": 4
			},
			{
				"key": "thunder_shock",
				"levelReq": 8
			},
			{
				"key": "cotton_spore",
				"levelReq": 11
			},
			{
				"key": "charge",
				"levelReq": 16
			},
			{
				"key": "take_down",
				"levelReq": 20
			},
			{
				"key": "electro_ball",
				"levelReq": 25
			},
			{
				"key": "confuse_ray",
				"levelReq": 29
			},
			{
				"key": "power_gem",
				"levelReq": 35
			},
			{
				"key": "discharge",
				"levelReq": 40
			},
			{
				"key": "cotton_guard",
				"levelReq": 46
			},
			{
				"key": "signal_beam",
				"levelReq": 51
			},
			{
				"key": "light_screen",
				"levelReq": 57
			},
			{
				"key": "thunder",
				"levelReq": 62
			},
			{
				"key": "dragon_pulse",
				"levelReq": 65
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
		"baseExp": 72,
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
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "quick_attack",
				"levelReq": 1
			},
			{
				"key": "thunder_shock",
				"levelReq": 5
			},
			{
				"key": "low_kick",
				"levelReq": 8
			},
			{
				"key": "swift",
				"levelReq": 12
			},
			{
				"key": "shock_wave",
				"levelReq": 15
			},
			{
				"key": "thunder_wave",
				"levelReq": 19
			},
			{
				"key": "electro_ball",
				"levelReq": 22
			},
			{
				"key": "light_screen",
				"levelReq": 26
			},
			{
				"key": "thunder_punch",
				"levelReq": 29
			},
			{
				"key": "discharge",
				"levelReq": 33
			},
			{
				"key": "screech",
				"levelReq": 36
			},
			{
				"key": "thunderbolt",
				"levelReq": 40
			},
			{
				"key": "thunder",
				"levelReq": 43
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
		"baseExp": 58,
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
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "wrap",
				"levelReq": 1
			},
			{
				"key": "poison_sting",
				"levelReq": 4
			},
			{
				"key": "bite",
				"levelReq": 9
			},
			{
				"key": "glare",
				"levelReq": 12
			},
			{
				"key": "screech",
				"levelReq": 17
			},
			{
				"key": "acid",
				"levelReq": 20
			},
			{
				"key": "spit_up",
				"levelReq": 25
			},
			{
				"key": "stockpile",
				"levelReq": 25
			},
			{
				"key": "swallow",
				"levelReq": 25
			},
			{
				"key": "acid_spray",
				"levelReq": 28
			},
			{
				"key": "mud_bomb",
				"levelReq": 33
			},
			{
				"key": "gastro_acid",
				"levelReq": 36
			},
			{
				"key": "belch",
				"levelReq": 38
			},
			{
				"key": "haze",
				"levelReq": 41
			},
			{
				"key": "coil",
				"levelReq": 44
			},
			{
				"key": "gunk_shot",
				"levelReq": 49
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
		"baseExp": 157,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 60,
			"atkFis": 95,
			"atkEsp": 65,
			"def": 69,
			"defEsp": 79,
			"speed": 80
		},
		"abilities": [
			{
				"key": "bite",
				"levelReq": 1
			},
			{
				"key": "crunch",
				"levelReq": 1
			},
			{
				"key": "crunch",
				"levelReq": 1
			},
			{
				"key": "fire_fang",
				"levelReq": 1
			},
			{
				"key": "ice_fang",
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
				"key": "thunder_fang",
				"levelReq": 1
			},
			{
				"key": "wrap",
				"levelReq": 1
			},
			{
				"key": "poison_sting",
				"levelReq": 4
			},
			{
				"key": "bite",
				"levelReq": 9
			},
			{
				"key": "glare",
				"levelReq": 12
			},
			{
				"key": "screech",
				"levelReq": 17
			},
			{
				"key": "acid",
				"levelReq": 20
			},
			{
				"key": "spit_up",
				"levelReq": 27
			},
			{
				"key": "stockpile",
				"levelReq": 27
			},
			{
				"key": "swallow",
				"levelReq": 27
			},
			{
				"key": "acid_spray",
				"levelReq": 32
			},
			{
				"key": "mud_bomb",
				"levelReq": 39
			},
			{
				"key": "gastro_acid",
				"levelReq": 44
			},
			{
				"key": "belch",
				"levelReq": 48
			},
			{
				"key": "haze",
				"levelReq": 51
			},
			{
				"key": "coil",
				"levelReq": 56
			},
			{
				"key": "gunk_shot",
				"levelReq": 63
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
		"baseExp": 55,
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
				"key": "scratch",
				"levelReq": 1
			},
			{
				"key": "tail_whip",
				"levelReq": 7
			},
			{
				"key": "double_kick",
				"levelReq": 9
			},
			{
				"key": "poison_sting",
				"levelReq": 13
			},
			{
				"key": "fury_swipes",
				"levelReq": 19
			},
			{
				"key": "bite",
				"levelReq": 21
			},
			{
				"key": "helping_hand",
				"levelReq": 25
			},
			{
				"key": "toxic_spikes",
				"levelReq": 31
			},
			{
				"key": "flatter",
				"levelReq": 33
			},
			{
				"key": "crunch",
				"levelReq": 37
			},
			{
				"key": "captivate",
				"levelReq": 43
			},
			{
				"key": "poison_fang",
				"levelReq": 45
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
		"baseExp": 128,
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
				"key": "scratch",
				"levelReq": 1
			},
			{
				"key": "tail_whip",
				"levelReq": 7
			},
			{
				"key": "double_kick",
				"levelReq": 9
			},
			{
				"key": "poison_sting",
				"levelReq": 13
			},
			{
				"key": "fury_swipes",
				"levelReq": 20
			},
			{
				"key": "bite",
				"levelReq": 23
			},
			{
				"key": "helping_hand",
				"levelReq": 28
			},
			{
				"key": "toxic_spikes",
				"levelReq": 35
			},
			{
				"key": "flatter",
				"levelReq": 38
			},
			{
				"key": "crunch",
				"levelReq": 43
			},
			{
				"key": "captivate",
				"levelReq": 50
			},
			{
				"key": "poison_fang",
				"levelReq": 58
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
		"baseExp": 227,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 90,
			"atkFis": 92,
			"atkEsp": 75,
			"def": 87,
			"defEsp": 85,
			"speed": 76
		},
		"abilities": [
			{
				"key": "double_kick",
				"levelReq": 1
			},
			{
				"key": "poison_sting",
				"levelReq": 1
			},
			{
				"key": "scratch",
				"levelReq": 1
			},
			{
				"key": "superpower",
				"levelReq": 1
			},
			{
				"key": "tail_whip",
				"levelReq": 1
			},
			{
				"key": "chip_away",
				"levelReq": 23
			},
			{
				"key": "body_slam",
				"levelReq": 35
			},
			{
				"key": "earth_power",
				"levelReq": 43
			},
			{
				"key": "superpower",
				"levelReq": 58
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
		"baseExp": 55,
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
				"key": "peck",
				"levelReq": 1
			},
			{
				"key": "focus_energy",
				"levelReq": 7
			},
			{
				"key": "double_kick",
				"levelReq": 9
			},
			{
				"key": "poison_sting",
				"levelReq": 13
			},
			{
				"key": "fury_attack",
				"levelReq": 19
			},
			{
				"key": "horn_attack",
				"levelReq": 21
			},
			{
				"key": "helping_hand",
				"levelReq": 25
			},
			{
				"key": "toxic_spikes",
				"levelReq": 31
			},
			{
				"key": "flatter",
				"levelReq": 33
			},
			{
				"key": "poison_jab",
				"levelReq": 37
			},
			{
				"key": "captivate",
				"levelReq": 43
			},
			{
				"key": "horn_drill",
				"levelReq": 45
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
		"baseExp": 128,
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
				"key": "peck",
				"levelReq": 1
			},
			{
				"key": "focus_energy",
				"levelReq": 7
			},
			{
				"key": "double_kick",
				"levelReq": 9
			},
			{
				"key": "poison_sting",
				"levelReq": 13
			},
			{
				"key": "fury_attack",
				"levelReq": 20
			},
			{
				"key": "horn_attack",
				"levelReq": 23
			},
			{
				"key": "helping_hand",
				"levelReq": 28
			},
			{
				"key": "toxic_spikes",
				"levelReq": 35
			},
			{
				"key": "flatter",
				"levelReq": 38
			},
			{
				"key": "poison_jab",
				"levelReq": 43
			},
			{
				"key": "captivate",
				"levelReq": 50
			},
			{
				"key": "horn_drill",
				"levelReq": 58
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
		"baseExp": 227,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 81,
			"atkFis": 102,
			"atkEsp": 85,
			"def": 77,
			"defEsp": 75,
			"speed": 85
		},
		"abilities": [
			{
				"key": "double_kick",
				"levelReq": 1
			},
			{
				"key": "focus_energy",
				"levelReq": 1
			},
			{
				"key": "megahorn",
				"levelReq": 1
			},
			{
				"key": "peck",
				"levelReq": 1
			},
			{
				"key": "poison_sting",
				"levelReq": 1
			},
			{
				"key": "chip_away",
				"levelReq": 23
			},
			{
				"key": "thrash",
				"levelReq": 35
			},
			{
				"key": "earth_power",
				"levelReq": 43
			},
			{
				"key": "megahorn",
				"levelReq": 58
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
		"baseExp": 49,
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
				"key": "absorb",
				"levelReq": 1
			},
			{
				"key": "supersonic",
				"levelReq": 5
			},
			{
				"key": "astonish",
				"levelReq": 7
			},
			{
				"key": "bite",
				"levelReq": 11
			},
			{
				"key": "wing_attack",
				"levelReq": 13
			},
			{
				"key": "confuse_ray",
				"levelReq": 17
			},
			{
				"key": "air_cutter",
				"levelReq": 19
			},
			{
				"key": "swift",
				"levelReq": 23
			},
			{
				"key": "poison_fang",
				"levelReq": 25
			},
			{
				"key": "mean_look",
				"levelReq": 29
			},
			{
				"key": "leech_life",
				"levelReq": 31
			},
			{
				"key": "haze",
				"levelReq": 35
			},
			{
				"key": "venoshock",
				"levelReq": 37
			},
			{
				"key": "air_slash",
				"levelReq": 41
			},
			{
				"key": "quick_guard",
				"levelReq": 43
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
		"baseExp": 159,
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
				"key": "absorb",
				"levelReq": 1
			},
			{
				"key": "astonish",
				"levelReq": 1
			},
			{
				"key": "bite",
				"levelReq": 1
			},
			{
				"key": "screech",
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
				"key": "astonish",
				"levelReq": 7
			},
			{
				"key": "bite",
				"levelReq": 11
			},
			{
				"key": "wing_attack",
				"levelReq": 13
			},
			{
				"key": "confuse_ray",
				"levelReq": 17
			},
			{
				"key": "air_cutter",
				"levelReq": 19
			},
			{
				"key": "swift",
				"levelReq": 24
			},
			{
				"key": "poison_fang",
				"levelReq": 27
			},
			{
				"key": "mean_look",
				"levelReq": 32
			},
			{
				"key": "leech_life",
				"levelReq": 35
			},
			{
				"key": "haze",
				"levelReq": 40
			},
			{
				"key": "venoshock",
				"levelReq": 43
			},
			{
				"key": "air_slash",
				"levelReq": 48
			},
			{
				"key": "quick_guard",
				"levelReq": 51
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
		"baseExp": 65,
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
				"levelReq": 4
			},
			{
				"key": "mud_slap",
				"levelReq": 7
			},
			{
				"key": "disable",
				"levelReq": 12
			},
			{
				"key": "sludge",
				"levelReq": 15
			},
			{
				"key": "mud_bomb",
				"levelReq": 18
			},
			{
				"key": "minimize",
				"levelReq": 21
			},
			{
				"key": "fling",
				"levelReq": 26
			},
			{
				"key": "sludge_bomb",
				"levelReq": 29
			},
			{
				"key": "sludge_wave",
				"levelReq": 32
			},
			{
				"key": "screech",
				"levelReq": 37
			},
			{
				"key": "gunk_shot",
				"levelReq": 40
			},
			{
				"key": "acid_armor",
				"levelReq": 43
			},
			{
				"key": "belch",
				"levelReq": 46
			},
			{
				"key": "memento",
				"levelReq": 48
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
		"baseExp": 175,
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
				"key": "harden",
				"levelReq": 1
			},
			{
				"key": "mud_slap",
				"levelReq": 1
			},
			{
				"key": "poison_gas",
				"levelReq": 1
			},
			{
				"key": "pound",
				"levelReq": 1
			},
			{
				"key": "venom_drench",
				"levelReq": 1
			},
			{
				"key": "venom_drench",
				"levelReq": 1
			},
			{
				"key": "harden",
				"levelReq": 4
			},
			{
				"key": "mud_slap",
				"levelReq": 7
			},
			{
				"key": "disable",
				"levelReq": 12
			},
			{
				"key": "sludge",
				"levelReq": 15
			},
			{
				"key": "mud_bomb",
				"levelReq": 18
			},
			{
				"key": "minimize",
				"levelReq": 21
			},
			{
				"key": "fling",
				"levelReq": 26
			},
			{
				"key": "sludge_bomb",
				"levelReq": 29
			},
			{
				"key": "sludge_wave",
				"levelReq": 32
			},
			{
				"key": "screech",
				"levelReq": 37
			},
			{
				"key": "gunk_shot",
				"levelReq": 40
			},
			{
				"key": "acid_armor",
				"levelReq": 46
			},
			{
				"key": "belch",
				"levelReq": 52
			},
			{
				"key": "memento",
				"levelReq": 57
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
		"baseExp": 68,
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
				"levelReq": 4
			},
			{
				"key": "smokescreen",
				"levelReq": 7
			},
			{
				"key": "assurance",
				"levelReq": 12
			},
			{
				"key": "clear_smog",
				"levelReq": 15
			},
			{
				"key": "sludge",
				"levelReq": 18
			},
			{
				"key": "self_destruct",
				"levelReq": 23
			},
			{
				"key": "haze",
				"levelReq": 26
			},
			{
				"key": "gyro_ball",
				"levelReq": 29
			},
			{
				"key": "sludge_bomb",
				"levelReq": 34
			},
			{
				"key": "explosion",
				"levelReq": 37
			},
			{
				"key": "destiny_bond",
				"levelReq": 40
			},
			{
				"key": "belch",
				"levelReq": 42
			},
			{
				"key": "memento",
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
		"baseExp": 172,
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
				"key": "double_hit",
				"levelReq": 1
			},
			{
				"key": "double_hit",
				"levelReq": 1
			},
			{
				"key": "poison_gas",
				"levelReq": 1
			},
			{
				"key": "smog",
				"levelReq": 1
			},
			{
				"key": "smokescreen",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "smog",
				"levelReq": 4
			},
			{
				"key": "smokescreen",
				"levelReq": 7
			},
			{
				"key": "assurance",
				"levelReq": 12
			},
			{
				"key": "clear_smog",
				"levelReq": 15
			},
			{
				"key": "sludge",
				"levelReq": 18
			},
			{
				"key": "self_destruct",
				"levelReq": 23
			},
			{
				"key": "haze",
				"levelReq": 26
			},
			{
				"key": "gyro_ball",
				"levelReq": 29
			},
			{
				"key": "sludge_bomb",
				"levelReq": 34
			},
			{
				"key": "explosion",
				"levelReq": 40
			},
			{
				"key": "destiny_bond",
				"levelReq": 46
			},
			{
				"key": "belch",
				"levelReq": 51
			},
			{
				"key": "memento",
				"levelReq": 57
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
		"baseExp": 61,
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
				"key": "covet",
				"levelReq": 1
			},
			{
				"key": "focus_energy",
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
				"key": "scratch",
				"levelReq": 1
			},
			{
				"key": "fury_swipes",
				"levelReq": 5
			},
			{
				"key": "karate_chop",
				"levelReq": 8
			},
			{
				"key": "pursuit",
				"levelReq": 12
			},
			{
				"key": "seismic_toss",
				"levelReq": 15
			},
			{
				"key": "swagger",
				"levelReq": 19
			},
			{
				"key": "cross_chop",
				"levelReq": 22
			},
			{
				"key": "assurance",
				"levelReq": 26
			},
			{
				"key": "punishment",
				"levelReq": 29
			},
			{
				"key": "thrash",
				"levelReq": 33
			},
			{
				"key": "close_combat",
				"levelReq": 36
			},
			{
				"key": "screech",
				"levelReq": 40
			},
			{
				"key": "stomping_tantrum",
				"levelReq": 43
			},
			{
				"key": "outrage",
				"levelReq": 47
			},
			{
				"key": "final_gambit",
				"levelReq": 50
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
		"baseExp": 159,
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
				"key": "final_gambit",
				"levelReq": 1
			},
			{
				"key": "fling",
				"levelReq": 1
			},
			{
				"key": "focus_energy",
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
				"key": "rage",
				"levelReq": 1
			},
			{
				"key": "scratch",
				"levelReq": 1
			},
			{
				"key": "fury_swipes",
				"levelReq": 5
			},
			{
				"key": "karate_chop",
				"levelReq": 8
			},
			{
				"key": "pursuit",
				"levelReq": 12
			},
			{
				"key": "seismic_toss",
				"levelReq": 15
			},
			{
				"key": "swagger",
				"levelReq": 19
			},
			{
				"key": "cross_chop",
				"levelReq": 22
			},
			{
				"key": "assurance",
				"levelReq": 26
			},
			{
				"key": "punishment",
				"levelReq": 30
			},
			{
				"key": "thrash",
				"levelReq": 35
			},
			{
				"key": "close_combat",
				"levelReq": 39
			},
			{
				"key": "screech",
				"levelReq": 44
			},
			{
				"key": "stomping_tantrum",
				"levelReq": 48
			},
			{
				"key": "outrage",
				"levelReq": 53
			},
			{
				"key": "final_gambit",
				"levelReq": 57
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
		"baseExp": 61,
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
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "low_kick",
				"levelReq": 1
			},
			{
				"key": "focus_energy",
				"levelReq": 3
			},
			{
				"key": "karate_chop",
				"levelReq": 7
			},
			{
				"key": "foresight",
				"levelReq": 9
			},
			{
				"key": "low_sweep",
				"levelReq": 13
			},
			{
				"key": "seismic_toss",
				"levelReq": 15
			},
			{
				"key": "revenge",
				"levelReq": 19
			},
			{
				"key": "knock_off",
				"levelReq": 21
			},
			{
				"key": "vital_throw",
				"levelReq": 25
			},
			{
				"key": "wake_up_slap",
				"levelReq": 27
			},
			{
				"key": "dual_chop",
				"levelReq": 31
			},
			{
				"key": "submission",
				"levelReq": 33
			},
			{
				"key": "bulk_up",
				"levelReq": 37
			},
			{
				"key": "cross_chop",
				"levelReq": 39
			},
			{
				"key": "scary_face",
				"levelReq": 43
			},
			{
				"key": "dynamic_punch",
				"levelReq": 45
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
		"baseExp": 142,
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
				"key": "focus_energy",
				"levelReq": 1
			},
			{
				"key": "karate_chop",
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
				"key": "focus_energy",
				"levelReq": 3
			},
			{
				"key": "karate_chop",
				"levelReq": 7
			},
			{
				"key": "foresight",
				"levelReq": 9
			},
			{
				"key": "low_sweep",
				"levelReq": 13
			},
			{
				"key": "seismic_toss",
				"levelReq": 15
			},
			{
				"key": "revenge",
				"levelReq": 19
			},
			{
				"key": "knock_off",
				"levelReq": 21
			},
			{
				"key": "vital_throw",
				"levelReq": 25
			},
			{
				"key": "wake_up_slap",
				"levelReq": 27
			},
			{
				"key": "dual_chop",
				"levelReq": 33
			},
			{
				"key": "submission",
				"levelReq": 37
			},
			{
				"key": "bulk_up",
				"levelReq": 43
			},
			{
				"key": "cross_chop",
				"levelReq": 47
			},
			{
				"key": "scary_face",
				"levelReq": 53
			},
			{
				"key": "dynamic_punch",
				"levelReq": 57
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
		"baseExp": 227,
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
				"key": "focus_energy",
				"levelReq": 1
			},
			{
				"key": "karate_chop",
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
				"key": "strength",
				"levelReq": 1
			},
			{
				"key": "strength",
				"levelReq": 1
			},
			{
				"key": "wide_guard",
				"levelReq": 1
			},
			{
				"key": "focus_energy",
				"levelReq": 3
			},
			{
				"key": "karate_chop",
				"levelReq": 7
			},
			{
				"key": "foresight",
				"levelReq": 9
			},
			{
				"key": "low_sweep",
				"levelReq": 13
			},
			{
				"key": "seismic_toss",
				"levelReq": 15
			},
			{
				"key": "revenge",
				"levelReq": 19
			},
			{
				"key": "knock_off",
				"levelReq": 21
			},
			{
				"key": "vital_throw",
				"levelReq": 25
			},
			{
				"key": "wake_up_slap",
				"levelReq": 27
			},
			{
				"key": "dual_chop",
				"levelReq": 33
			},
			{
				"key": "submission",
				"levelReq": 37
			},
			{
				"key": "bulk_up",
				"levelReq": 43
			},
			{
				"key": "cross_chop",
				"levelReq": 47
			},
			{
				"key": "scary_face",
				"levelReq": 53
			},
			{
				"key": "dynamic_punch",
				"levelReq": 57
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
		"baseExp": 159,
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
				"key": "close_combat",
				"levelReq": 1
			},
			{
				"key": "double_kick",
				"levelReq": 1
			},
			{
				"key": "double_kick",
				"levelReq": 1
			},
			{
				"key": "jump_kick",
				"levelReq": 1
			},
			{
				"key": "meditate",
				"levelReq": 1
			},
			{
				"key": "mega_kick",
				"levelReq": 1
			},
			{
				"key": "revenge",
				"levelReq": 1
			},
			{
				"key": "reversal",
				"levelReq": 1
			},
			{
				"key": "rolling_kick",
				"levelReq": 1
			},
			{
				"key": "meditate",
				"levelReq": 5
			},
			{
				"key": "rolling_kick",
				"levelReq": 9
			},
			{
				"key": "jump_kick",
				"levelReq": 13
			},
			{
				"key": "brick_break",
				"levelReq": 17
			},
			{
				"key": "focus_energy",
				"levelReq": 21
			},
			{
				"key": "feint",
				"levelReq": 25
			},
			{
				"key": "high_jump_kick",
				"levelReq": 29
			},
			{
				"key": "mind_reader",
				"levelReq": 33
			},
			{
				"key": "foresight",
				"levelReq": 37
			},
			{
				"key": "wide_guard",
				"levelReq": 41
			},
			{
				"key": "blaze_kick",
				"levelReq": 45
			},
			{
				"key": "endure",
				"levelReq": 49
			},
			{
				"key": "mega_kick",
				"levelReq": 53
			},
			{
				"key": "close_combat",
				"levelReq": 57
			},
			{
				"key": "reversal",
				"levelReq": 61
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
		"baseExp": 159,
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
				"key": "agility",
				"levelReq": 1
			},
			{
				"key": "close_combat",
				"levelReq": 1
			},
			{
				"key": "comet_punch",
				"levelReq": 1
			},
			{
				"key": "comet_punch",
				"levelReq": 1
			},
			{
				"key": "counter",
				"levelReq": 1
			},
			{
				"key": "focus_punch",
				"levelReq": 1
			},
			{
				"key": "mach_punch",
				"levelReq": 1
			},
			{
				"key": "pursuit",
				"levelReq": 1
			},
			{
				"key": "revenge",
				"levelReq": 1
			},
			{
				"key": "agility",
				"levelReq": 6
			},
			{
				"key": "pursuit",
				"levelReq": 11
			},
			{
				"key": "bullet_punch",
				"levelReq": 16
			},
			{
				"key": "mach_punch",
				"levelReq": 16
			},
			{
				"key": "feint",
				"levelReq": 21
			},
			{
				"key": "vacuum_wave",
				"levelReq": 26
			},
			{
				"key": "quick_guard",
				"levelReq": 31
			},
			{
				"key": "fire_punch",
				"levelReq": 36
			},
			{
				"key": "ice_punch",
				"levelReq": 36
			},
			{
				"key": "thunder_punch",
				"levelReq": 36
			},
			{
				"key": "sky_uppercut",
				"levelReq": 41
			},
			{
				"key": "mega_punch",
				"levelReq": 46
			},
			{
				"key": "detect",
				"levelReq": 50
			},
			{
				"key": "focus_punch",
				"levelReq": 56
			},
			{
				"key": "counter",
				"levelReq": 61
			},
			{
				"key": "close_combat",
				"levelReq": 66
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
		"baseExp": 42,
		"growthCurve": "MEDIUM_FAST",
		"base": {
			"hp": 35,
			"atkFis": 35,
			"atkEsp": 35,
			"def": 35,
			"defEsp": 35,
			"speed": 35
		},
		"abilities": [
			{
				"key": "fake_out",
				"levelReq": 1
			},
			{
				"key": "foresight",
				"levelReq": 1
			},
			{
				"key": "helping_hand",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			}
		],
		"evolvesTo": "hitmonlee",
		"evolvesAtLevel": 20
	},
	"jynx": {
		"id": "jynx",
		"name": "Jynx",
		"description": "Pokedex Nº124 - tipo ICE/PSYCHIC.",
		"type": "ICE",
		"type2": "PSYCHIC",
		"catchRate": 45,
		"baseExp": 159,
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
				"key": "draining_kiss",
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
				"key": "perish_song",
				"levelReq": 1
			},
			{
				"key": "pound",
				"levelReq": 1
			},
			{
				"key": "powder_snow",
				"levelReq": 1
			},
			{
				"key": "lick",
				"levelReq": 5
			},
			{
				"key": "lovely_kiss",
				"levelReq": 8
			},
			{
				"key": "powder_snow",
				"levelReq": 11
			},
			{
				"key": "double_slap",
				"levelReq": 15
			},
			{
				"key": "ice_punch",
				"levelReq": 18
			},
			{
				"key": "heart_stamp",
				"levelReq": 21
			},
			{
				"key": "mean_look",
				"levelReq": 25
			},
			{
				"key": "fake_tears",
				"levelReq": 28
			},
			{
				"key": "wake_up_slap",
				"levelReq": 33
			},
			{
				"key": "avalanche",
				"levelReq": 39
			},
			{
				"key": "body_slam",
				"levelReq": 44
			},
			{
				"key": "wring_out",
				"levelReq": 49
			},
			{
				"key": "perish_song",
				"levelReq": 55
			},
			{
				"key": "blizzard",
				"levelReq": 60
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
		"baseExp": 50,
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
				"key": "odor_sleuth",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "mud_sport",
				"levelReq": 5
			},
			{
				"key": "powder_snow",
				"levelReq": 8
			},
			{
				"key": "mud_slap",
				"levelReq": 11
			},
			{
				"key": "endure",
				"levelReq": 14
			},
			{
				"key": "mud_bomb",
				"levelReq": 18
			},
			{
				"key": "icy_wind",
				"levelReq": 21
			},
			{
				"key": "ice_shard",
				"levelReq": 24
			},
			{
				"key": "take_down",
				"levelReq": 28
			},
			{
				"key": "mist",
				"levelReq": 35
			},
			{
				"key": "earthquake",
				"levelReq": 37
			},
			{
				"key": "flail",
				"levelReq": 40
			},
			{
				"key": "blizzard",
				"levelReq": 44
			},
			{
				"key": "amnesia",
				"levelReq": 48
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
		"baseExp": 158,
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
				"key": "ancient_power",
				"levelReq": 1
			},
			{
				"key": "fury_attack",
				"levelReq": 1
			},
			{
				"key": "fury_attack",
				"levelReq": 1
			},
			{
				"key": "mud_sport",
				"levelReq": 1
			},
			{
				"key": "odor_sleuth",
				"levelReq": 1
			},
			{
				"key": "peck",
				"levelReq": 1
			},
			{
				"key": "powder_snow",
				"levelReq": 1
			},
			{
				"key": "mud_sport",
				"levelReq": 5
			},
			{
				"key": "powder_snow",
				"levelReq": 8
			},
			{
				"key": "mud_slap",
				"levelReq": 11
			},
			{
				"key": "endure",
				"levelReq": 14
			},
			{
				"key": "mud_bomb",
				"levelReq": 18
			},
			{
				"key": "icy_wind",
				"levelReq": 21
			},
			{
				"key": "ice_fang",
				"levelReq": 24
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
				"key": "thrash",
				"levelReq": 41
			},
			{
				"key": "earthquake",
				"levelReq": 46
			},
			{
				"key": "blizzard",
				"levelReq": 52
			},
			{
				"key": "amnesia",
				"levelReq": 58
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
		"baseExp": 116,
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
		}, {
			"key": "drill_peck",
			"levelReq": 25
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
		"baseExp": 61,
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
				"levelReq": 5
			},
			{
				"key": "sweet_kiss",
				"levelReq": 8
			},
			{
				"key": "powder_snow",
				"levelReq": 11
			},
			{
				"key": "confusion",
				"levelReq": 15
			},
			{
				"key": "sing",
				"levelReq": 18
			},
			{
				"key": "heart_stamp",
				"levelReq": 21
			},
			{
				"key": "mean_look",
				"levelReq": 25
			},
			{
				"key": "fake_tears",
				"levelReq": 28
			},
			{
				"key": "lucky_chant",
				"levelReq": 31
			},
			{
				"key": "avalanche",
				"levelReq": 35
			},
			{
				"key": "psychic",
				"levelReq": 38
			},
			{
				"key": "copycat",
				"levelReq": 41
			},
			{
				"key": "perish_song",
				"levelReq": 45
			},
			{
				"key": "blizzard",
				"levelReq": 48
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
		"baseExp": 179,
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
				"key": "bind",
				"levelReq": 1
			},
			{
				"key": "fire_fang",
				"levelReq": 1
			},
			{
				"key": "harden",
				"levelReq": 1
			},
			{
				"key": "ice_fang",
				"levelReq": 1
			},
			{
				"key": "mud_sport",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "thunder_fang",
				"levelReq": 1
			},
			{
				"key": "curse",
				"levelReq": 4
			},
			{
				"key": "rock_throw",
				"levelReq": 7
			},
			{
				"key": "rock_tomb",
				"levelReq": 10
			},
			{
				"key": "rage",
				"levelReq": 13
			},
			{
				"key": "stealth_rock",
				"levelReq": 16
			},
			{
				"key": "autotomize",
				"levelReq": 19
			},
			{
				"key": "gyro_ball",
				"levelReq": 20
			},
			{
				"key": "smack_down",
				"levelReq": 22
			},
			{
				"key": "dragon_breath",
				"levelReq": 25
			},
			{
				"key": "slam",
				"levelReq": 28
			},
			{
				"key": "screech",
				"levelReq": 31
			},
			{
				"key": "rock_slide",
				"levelReq": 34
			},
			{
				"key": "crunch",
				"levelReq": 37
			},
			{
				"key": "iron_tail",
				"levelReq": 40
			},
			{
				"key": "dig",
				"levelReq": 43
			},
			{
				"key": "stone_edge",
				"levelReq": 46
			},
			{
				"key": "double_edge",
				"levelReq": 49
			},
			{
				"key": "sandstorm",
				"levelReq": 52
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
		"baseExp": 163,
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
				"levelReq": 6
			},
			{
				"key": "metal_claw",
				"levelReq": 9
			},
			{
				"key": "air_cutter",
				"levelReq": 12
			},
			{
				"key": "fury_attack",
				"levelReq": 17
			},
			{
				"key": "feint",
				"levelReq": 20
			},
			{
				"key": "swift",
				"levelReq": 23
			},
			{
				"key": "spikes",
				"levelReq": 28
			},
			{
				"key": "agility",
				"levelReq": 31
			},
			{
				"key": "steel_wing",
				"levelReq": 34
			},
			{
				"key": "slash",
				"levelReq": 39
			},
			{
				"key": "metal_sound",
				"levelReq": 42
			},
			{
				"key": "air_slash",
				"levelReq": 45
			},
			{
				"key": "autotomize",
				"levelReq": 50
			},
			{
				"key": "night_slash",
				"levelReq": 53
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
		"baseExp": 64,
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
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "peck",
				"levelReq": 1
			},
			{
				"key": "night_shade",
				"levelReq": 6
			},
			{
				"key": "teleport",
				"levelReq": 9
			},
			{
				"key": "lucky_chant",
				"levelReq": 12
			},
			{
				"key": "stored_power",
				"levelReq": 17
			},
			{
				"key": "ominous_wind",
				"levelReq": 20
			},
			{
				"key": "confuse_ray",
				"levelReq": 23
			},
			{
				"key": "wish",
				"levelReq": 28
			},
			{
				"key": "psychic",
				"levelReq": 33
			},
			{
				"key": "miracle_eye",
				"levelReq": 36
			},
			{
				"key": "psycho_shift",
				"levelReq": 39
			},
			{
				"key": "future_sight",
				"levelReq": 44
			},
			{
				"key": "guard_swap",
				"levelReq": 47
			},
			{
				"key": "power_swap",
				"levelReq": 47
			},
			{
				"key": "me_first",
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
		"baseExp": 165,
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
				"key": "air_slash",
				"levelReq": 1
			},
			{
				"key": "air_slash",
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
				"key": "peck",
				"levelReq": 1
			},
			{
				"key": "tailwind",
				"levelReq": 1
			},
			{
				"key": "teleport",
				"levelReq": 1
			},
			{
				"key": "night_shade",
				"levelReq": 6
			},
			{
				"key": "teleport",
				"levelReq": 9
			},
			{
				"key": "lucky_chant",
				"levelReq": 12
			},
			{
				"key": "stored_power",
				"levelReq": 17
			},
			{
				"key": "ominous_wind",
				"levelReq": 20
			},
			{
				"key": "confuse_ray",
				"levelReq": 23
			},
			{
				"key": "wish",
				"levelReq": 29
			},
			{
				"key": "psychic",
				"levelReq": 35
			},
			{
				"key": "miracle_eye",
				"levelReq": 39
			},
			{
				"key": "psycho_shift",
				"levelReq": 43
			},
			{
				"key": "future_sight",
				"levelReq": 49
			},
			{
				"key": "guard_swap",
				"levelReq": 53
			},
			{
				"key": "power_swap",
				"levelReq": 53
			},
			{
				"key": "me_first",
				"levelReq": 57
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
		"baseExp": 62,
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
		"baseExp": 140,
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
				"key": "confusion",
				"levelReq": 1
			},
			{
				"key": "kinesis",
				"levelReq": 1
			},
			{
				"key": "kinesis",
				"levelReq": 1
			},
			{
				"key": "teleport",
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
				"key": "miracle_eye",
				"levelReq": 23
			},
			{
				"key": "reflect",
				"levelReq": 26
			},
			{
				"key": "psycho_cut",
				"levelReq": 28
			},
			{
				"key": "recover",
				"levelReq": 31
			},
			{
				"key": "telekinesis",
				"levelReq": 33
			},
			{
				"key": "ally_switch",
				"levelReq": 36
			},
			{
				"key": "psychic",
				"levelReq": 38
			},
			{
				"key": "role_play",
				"levelReq": 41
			},
			{
				"key": "future_sight",
				"levelReq": 43
			},
			{
				"key": "trick",
				"levelReq": 46
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
		"baseExp": 225,
		"growthCurve": "MEDIUM_SLOW",
		"base": {
			"hp": 55,
			"atkFis": 50,
			"atkEsp": 135,
			"def": 45,
			"defEsp": 95,
			"speed": 120
		},
		"abilities": [
			{
				"key": "confusion",
				"levelReq": 1
			},
			{
				"key": "kinesis",
				"levelReq": 1
			},
			{
				"key": "kinesis",
				"levelReq": 1
			},
			{
				"key": "teleport",
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
				"key": "miracle_eye",
				"levelReq": 23
			},
			{
				"key": "reflect",
				"levelReq": 26
			},
			{
				"key": "psycho_cut",
				"levelReq": 28
			},
			{
				"key": "recover",
				"levelReq": 31
			},
			{
				"key": "telekinesis",
				"levelReq": 33
			},
			{
				"key": "ally_switch",
				"levelReq": 36
			},
			{
				"key": "psychic",
				"levelReq": 38
			},
			{
				"key": "calm_mind",
				"levelReq": 41
			},
			{
				"key": "future_sight",
				"levelReq": 43
			},
			{
				"key": "trick",
				"levelReq": 46
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
		"baseExp": 66,
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
				"key": "hypnosis",
				"levelReq": 1
			},
			{
				"key": "pound",
				"levelReq": 1
			},
			{
				"key": "disable",
				"levelReq": 5
			},
			{
				"key": "confusion",
				"levelReq": 9
			},
			{
				"key": "headbutt",
				"levelReq": 13
			},
			{
				"key": "poison_gas",
				"levelReq": 17
			},
			{
				"key": "meditate",
				"levelReq": 21
			},
			{
				"key": "psybeam",
				"levelReq": 25
			},
			{
				"key": "wake_up_slap",
				"levelReq": 29
			},
			{
				"key": "psych_up",
				"levelReq": 33
			},
			{
				"key": "synchronoise",
				"levelReq": 37
			},
			{
				"key": "zen_headbutt",
				"levelReq": 41
			},
			{
				"key": "swagger",
				"levelReq": 45
			},
			{
				"key": "psychic",
				"levelReq": 49
			},
			{
				"key": "nasty_plot",
				"levelReq": 53
			},
			{
				"key": "psyshock",
				"levelReq": 57
			},
			{
				"key": "future_sight",
				"levelReq": 61
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
		"baseExp": 169,
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
				"key": "confusion",
				"levelReq": 1
			},
			{
				"key": "disable",
				"levelReq": 1
			},
			{
				"key": "future_sight",
				"levelReq": 1
			},
			{
				"key": "hypnosis",
				"levelReq": 1
			},
			{
				"key": "nasty_plot",
				"levelReq": 1
			},
			{
				"key": "nightmare",
				"levelReq": 1
			},
			{
				"key": "pound",
				"levelReq": 1
			},
			{
				"key": "switcheroo",
				"levelReq": 1
			},
			{
				"key": "disable",
				"levelReq": 5
			},
			{
				"key": "confusion",
				"levelReq": 9
			},
			{
				"key": "headbutt",
				"levelReq": 13
			},
			{
				"key": "poison_gas",
				"levelReq": 17
			},
			{
				"key": "meditate",
				"levelReq": 21
			},
			{
				"key": "psybeam",
				"levelReq": 25
			},
			{
				"key": "wake_up_slap",
				"levelReq": 29
			},
			{
				"key": "psych_up",
				"levelReq": 33
			},
			{
				"key": "synchronoise",
				"levelReq": 37
			},
			{
				"key": "zen_headbutt",
				"levelReq": 41
			},
			{
				"key": "swagger",
				"levelReq": 45
			},
			{
				"key": "psychic",
				"levelReq": 49
			},
			{
				"key": "nasty_plot",
				"levelReq": 53
			},
			{
				"key": "psyshock",
				"levelReq": 57
			},
			{
				"key": "future_sight",
				"levelReq": 61
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
		"baseExp": 118,
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
		"baseExp": 142,
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
				"key": "destiny_bond",
				"levelReq": 1
			},
			{
				"key": "mirror_coat",
				"levelReq": 1
			},
			{
				"key": "safeguard",
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
		"baseExp": 62,
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
				"levelReq": 5
			},
			{
				"key": "mean_look",
				"levelReq": 8
			},
			{
				"key": "curse",
				"levelReq": 12
			},
			{
				"key": "night_shade",
				"levelReq": 15
			},
			{
				"key": "confuse_ray",
				"levelReq": 19
			},
			{
				"key": "sucker_punch",
				"levelReq": 22
			},
			{
				"key": "payback",
				"levelReq": 26
			},
			{
				"key": "shadow_ball",
				"levelReq": 29
			},
			{
				"key": "dream_eater",
				"levelReq": 33
			},
			{
				"key": "dark_pulse",
				"levelReq": 36
			},
			{
				"key": "destiny_bond",
				"levelReq": 40
			},
			{
				"key": "hex",
				"levelReq": 43
			},
			{
				"key": "nightmare",
				"levelReq": 47
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
		"baseExp": 142,
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
				"key": "shadow_punch",
				"levelReq": 1
			},
			{
				"key": "shadow_punch",
				"levelReq": 1
			},
			{
				"key": "spite",
				"levelReq": 1
			},
			{
				"key": "spite",
				"levelReq": 5
			},
			{
				"key": "mean_look",
				"levelReq": 8
			},
			{
				"key": "curse",
				"levelReq": 12
			},
			{
				"key": "night_shade",
				"levelReq": 15
			},
			{
				"key": "confuse_ray",
				"levelReq": 19
			},
			{
				"key": "sucker_punch",
				"levelReq": 22
			},
			{
				"key": "payback",
				"levelReq": 28
			},
			{
				"key": "shadow_ball",
				"levelReq": 33
			},
			{
				"key": "dream_eater",
				"levelReq": 39
			},
			{
				"key": "dark_pulse",
				"levelReq": 44
			},
			{
				"key": "destiny_bond",
				"levelReq": 50
			},
			{
				"key": "hex",
				"levelReq": 55
			},
			{
				"key": "nightmare",
				"levelReq": 61
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
		"baseExp": 225,
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
				"key": "shadow_punch",
				"levelReq": 1
			},
			{
				"key": "shadow_punch",
				"levelReq": 1
			},
			{
				"key": "spite",
				"levelReq": 1
			},
			{
				"key": "spite",
				"levelReq": 5
			},
			{
				"key": "mean_look",
				"levelReq": 8
			},
			{
				"key": "curse",
				"levelReq": 12
			},
			{
				"key": "night_shade",
				"levelReq": 15
			},
			{
				"key": "confuse_ray",
				"levelReq": 19
			},
			{
				"key": "sucker_punch",
				"levelReq": 22
			},
			{
				"key": "payback",
				"levelReq": 28
			},
			{
				"key": "shadow_ball",
				"levelReq": 33
			},
			{
				"key": "dream_eater",
				"levelReq": 39
			},
			{
				"key": "dark_pulse",
				"levelReq": 44
			},
			{
				"key": "destiny_bond",
				"levelReq": 50
			},
			{
				"key": "hex",
				"levelReq": 55
			},
			{
				"key": "nightmare",
				"levelReq": 61
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
		"baseExp": 87,
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
				"levelReq": 5
			},
			{
				"key": "astonish",
				"levelReq": 10
			},
			{
				"key": "confuse_ray",
				"levelReq": 14
			},
			{
				"key": "mean_look",
				"levelReq": 19
			},
			{
				"key": "hex",
				"levelReq": 23
			},
			{
				"key": "psybeam",
				"levelReq": 28
			},
			{
				"key": "pain_split",
				"levelReq": 32
			},
			{
				"key": "payback",
				"levelReq": 37
			},
			{
				"key": "shadow_ball",
				"levelReq": 41
			},
			{
				"key": "perish_song",
				"levelReq": 46
			},
			{
				"key": "grudge",
				"levelReq": 50
			},
			{
				"key": "power_gem",
				"levelReq": 55
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
		"baseExp": 81,
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
				"key": "astonish",
				"levelReq": 1
			},
			{
				"key": "peck",
				"levelReq": 1
			},
			{
				"key": "pursuit",
				"levelReq": 5
			},
			{
				"key": "haze",
				"levelReq": 11
			},
			{
				"key": "wing_attack",
				"levelReq": 15
			},
			{
				"key": "night_shade",
				"levelReq": 21
			},
			{
				"key": "assurance",
				"levelReq": 25
			},
			{
				"key": "taunt",
				"levelReq": 31
			},
			{
				"key": "feint_attack",
				"levelReq": 35
			},
			{
				"key": "mean_look",
				"levelReq": 41
			},
			{
				"key": "foul_play",
				"levelReq": 45
			},
			{
				"key": "tailwind",
				"levelReq": 50
			},
			{
				"key": "sucker_punch",
				"levelReq": 55
			},
			{
				"key": "torment",
				"levelReq": 61
			},
			{
				"key": "quash",
				"levelReq": 65
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
		"baseExp": 86,
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
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "scratch",
				"levelReq": 1
			},
			{
				"key": "taunt",
				"levelReq": 1
			},
			{
				"key": "quick_attack",
				"levelReq": 8
			},
			{
				"key": "feint_attack",
				"levelReq": 10
			},
			{
				"key": "icy_wind",
				"levelReq": 14
			},
			{
				"key": "fury_swipes",
				"levelReq": 16
			},
			{
				"key": "agility",
				"levelReq": 20
			},
			{
				"key": "metal_claw",
				"levelReq": 22
			},
			{
				"key": "hone_claws",
				"levelReq": 25
			},
			{
				"key": "beat_up",
				"levelReq": 28
			},
			{
				"key": "screech",
				"levelReq": 32
			},
			{
				"key": "slash",
				"levelReq": 35
			},
			{
				"key": "snatch",
				"levelReq": 40
			},
			{
				"key": "punishment",
				"levelReq": 44
			},
			{
				"key": "ice_shard",
				"levelReq": 47
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
		"baseExp": 66,
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
				"key": "ember",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "howl",
				"levelReq": 4
			},
			{
				"key": "smog",
				"levelReq": 8
			},
			{
				"key": "roar",
				"levelReq": 13
			},
			{
				"key": "bite",
				"levelReq": 16
			},
			{
				"key": "odor_sleuth",
				"levelReq": 20
			},
			{
				"key": "beat_up",
				"levelReq": 25
			},
			{
				"key": "fire_fang",
				"levelReq": 28
			},
			{
				"key": "feint_attack",
				"levelReq": 32
			},
			{
				"key": "embargo",
				"levelReq": 37
			},
			{
				"key": "foul_play",
				"levelReq": 40
			},
			{
				"key": "flamethrower",
				"levelReq": 44
			},
			{
				"key": "crunch",
				"levelReq": 49
			},
			{
				"key": "nasty_plot",
				"levelReq": 52
			},
			{
				"key": "inferno",
				"levelReq": 56
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
		"baseExp": 175,
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
				"key": "ember",
				"levelReq": 1
			},
			{
				"key": "howl",
				"levelReq": 1
			},
			{
				"key": "inferno",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "nasty_plot",
				"levelReq": 1
			},
			{
				"key": "smog",
				"levelReq": 1
			},
			{
				"key": "thunder_fang",
				"levelReq": 1
			},
			{
				"key": "howl",
				"levelReq": 4
			},
			{
				"key": "smog",
				"levelReq": 8
			},
			{
				"key": "roar",
				"levelReq": 13
			},
			{
				"key": "bite",
				"levelReq": 16
			},
			{
				"key": "odor_sleuth",
				"levelReq": 20
			},
			{
				"key": "beat_up",
				"levelReq": 26
			},
			{
				"key": "fire_fang",
				"levelReq": 30
			},
			{
				"key": "feint_attack",
				"levelReq": 35
			},
			{
				"key": "embargo",
				"levelReq": 41
			},
			{
				"key": "foul_play",
				"levelReq": 45
			},
			{
				"key": "flamethrower",
				"levelReq": 50
			},
			{
				"key": "crunch",
				"levelReq": 56
			},
			{
				"key": "nasty_plot",
				"levelReq": 60
			},
			{
				"key": "inferno",
				"levelReq": 65
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
		"baseExp": 60,
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
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "wrap",
				"levelReq": 1
			},
			{
				"key": "thunder_wave",
				"levelReq": 5
			},
			{
				"key": "twister",
				"levelReq": 11
			},
			{
				"key": "dragon_rage",
				"levelReq": 15
			},
			{
				"key": "slam",
				"levelReq": 21
			},
			{
				"key": "agility",
				"levelReq": 25
			},
			{
				"key": "dragon_tail",
				"levelReq": 31
			},
			{
				"key": "aqua_tail",
				"levelReq": 35
			},
			{
				"key": "dragon_rush",
				"levelReq": 41
			},
			{
				"key": "safeguard",
				"levelReq": 45
			},
			{
				"key": "dragon_dance",
				"levelReq": 51
			},
			{
				"key": "outrage",
				"levelReq": 55
			},
			{
				"key": "hyper_beam",
				"levelReq": 61
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
		"baseExp": 147,
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
				"key": "wrap",
				"levelReq": 1
			},
			{
				"key": "thunder_wave",
				"levelReq": 5
			},
			{
				"key": "twister",
				"levelReq": 11
			},
			{
				"key": "dragon_rage",
				"levelReq": 15
			},
			{
				"key": "slam",
				"levelReq": 21
			},
			{
				"key": "agility",
				"levelReq": 25
			},
			{
				"key": "dragon_tail",
				"levelReq": 33
			},
			{
				"key": "aqua_tail",
				"levelReq": 39
			},
			{
				"key": "dragon_rush",
				"levelReq": 47
			},
			{
				"key": "safeguard",
				"levelReq": 53
			},
			{
				"key": "dragon_dance",
				"levelReq": 61
			},
			{
				"key": "outrage",
				"levelReq": 67
			},
			{
				"key": "hyper_beam",
				"levelReq": 75
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
		"baseExp": 270,
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
				"key": "fire_punch",
				"levelReq": 1
			},
			{
				"key": "hurricane",
				"levelReq": 1
			},
			{
				"key": "leer",
				"levelReq": 1
			},
			{
				"key": "roost",
				"levelReq": 1
			},
			{
				"key": "thunder_punch",
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
				"key": "wing_attack",
				"levelReq": 1
			},
			{
				"key": "wing_attack",
				"levelReq": 1
			},
			{
				"key": "wrap",
				"levelReq": 1
			},
			{
				"key": "thunder_wave",
				"levelReq": 5
			},
			{
				"key": "twister",
				"levelReq": 11
			},
			{
				"key": "dragon_rage",
				"levelReq": 15
			},
			{
				"key": "slam",
				"levelReq": 21
			},
			{
				"key": "agility",
				"levelReq": 25
			},
			{
				"key": "dragon_tail",
				"levelReq": 33
			},
			{
				"key": "aqua_tail",
				"levelReq": 39
			},
			{
				"key": "dragon_rush",
				"levelReq": 47
			},
			{
				"key": "safeguard",
				"levelReq": 53
			},
			{
				"key": "dragon_dance",
				"levelReq": 61
			},
			{
				"key": "outrage",
				"levelReq": 67
			},
			{
				"key": "hyper_beam",
				"levelReq": 75
			},
			{
				"key": "hurricane",
				"levelReq": 81
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"cleffa": {
		"id": "cleffa",
		"name": "Cleffa",
		"description": "Pokedex Nº173 - tipo FAIRY.",
		"type": "FAIRY",
		"type2": null,
		"catchRate": 150,
		"baseExp": 44,
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
				"key": "charm",
				"levelReq": 1
			},
			{
				"key": "pound",
				"levelReq": 1
			},
			{
				"key": "encore",
				"levelReq": 4
			},
			{
				"key": "sing",
				"levelReq": 7
			},
			{
				"key": "sweet_kiss",
				"levelReq": 10
			},
			{
				"key": "copycat",
				"levelReq": 13
			},
			{
				"key": "magical_leaf",
				"levelReq": 16
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"togepi": {
		"id": "togepi",
		"name": "Togepi",
		"description": "Pokedex Nº175 - tipo FAIRY.",
		"type": "FAIRY",
		"type2": null,
		"catchRate": 190,
		"baseExp": 49,
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
				"key": "charm",
				"levelReq": 1
			},
			{
				"key": "growl",
				"levelReq": 1
			},
			{
				"key": "metronome",
				"levelReq": 5
			},
			{
				"key": "sweet_kiss",
				"levelReq": 9
			},
			{
				"key": "yawn",
				"levelReq": 13
			},
			{
				"key": "encore",
				"levelReq": 17
			},
			{
				"key": "follow_me",
				"levelReq": 21
			},
			{
				"key": "bestow",
				"levelReq": 25
			},
			{
				"key": "wish",
				"levelReq": 29
			},
			{
				"key": "ancient_power",
				"levelReq": 33
			},
			{
				"key": "safeguard",
				"levelReq": 37
			},
			{
				"key": "baton_pass",
				"levelReq": 41
			},
			{
				"key": "double_edge",
				"levelReq": 45
			},
			{
				"key": "last_resort",
				"levelReq": 49
			},
			{
				"key": "after_you",
				"levelReq": 53
			}
		],
		"evolvesTo": null,
		"evolvesAtLevel": null
	},
	"snubbull": {
		"id": "snubbull",
		"name": "Snubbull",
		"description": "Pokedex Nº209 - tipo FAIRY.",
		"type": "FAIRY",
		"type2": null,
		"catchRate": 190,
		"baseExp": 60,
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
				"key": "charm",
				"levelReq": 1
			},
			{
				"key": "fire_fang",
				"levelReq": 1
			},
			{
				"key": "ice_fang",
				"levelReq": 1
			},
			{
				"key": "scary_face",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "tail_whip",
				"levelReq": 1
			},
			{
				"key": "thunder_fang",
				"levelReq": 1
			},
			{
				"key": "bite",
				"levelReq": 7
			},
			{
				"key": "lick",
				"levelReq": 13
			},
			{
				"key": "headbutt",
				"levelReq": 19
			},
			{
				"key": "roar",
				"levelReq": 25
			},
			{
				"key": "rage",
				"levelReq": 31
			},
			{
				"key": "play_rough",
				"levelReq": 37
			},
			{
				"key": "payback",
				"levelReq": 43
			},
			{
				"key": "crunch",
				"levelReq": 49
			}
		],
		"evolvesTo": "granbull",
		"evolvesAtLevel": 23
	},
	"granbull": {
		"id": "granbull",
		"name": "Granbull",
		"description": "Pokedex Nº210 - tipo FAIRY.",
		"type": "FAIRY",
		"type2": null,
		"catchRate": 75,
		"baseExp": 158,
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
				"key": "charm",
				"levelReq": 1
			},
			{
				"key": "fire_fang",
				"levelReq": 1
			},
			{
				"key": "ice_fang",
				"levelReq": 1
			},
			{
				"key": "outrage",
				"levelReq": 1
			},
			{
				"key": "scary_face",
				"levelReq": 1
			},
			{
				"key": "tackle",
				"levelReq": 1
			},
			{
				"key": "tail_whip",
				"levelReq": 1
			},
			{
				"key": "thunder_fang",
				"levelReq": 1
			},
			{
				"key": "bite",
				"levelReq": 7
			},
			{
				"key": "lick",
				"levelReq": 13
			},
			{
				"key": "headbutt",
				"levelReq": 19
			},
			{
				"key": "roar",
				"levelReq": 27
			},
			{
				"key": "rage",
				"levelReq": 35
			},
			{
				"key": "play_rough",
				"levelReq": 43
			},
			{
				"key": "payback",
				"levelReq": 51
			},
			{
				"key": "crunch",
				"levelReq": 59
			},
			{
				"key": "outrage",
				"levelReq": 67
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
var STAB_MULTIPLIER$1 = createFormulaEngine(FORMULAS).eval("STAB_MULTIPLIER");
function learnsetAte(species, level) {
	const aoe = typedAoeMoveKey(species.type);
	return species.abilities.filter((entry) => entry.levelReq <= level && entry.key !== aoe && getAbility(entry.key) != null).map((entry, i) => ({
		key: entry.key,
		levelReq: entry.levelReq,
		i
	})).sort((a, b) => a.levelReq - b.levelReq || a.i - b.i).map((entry) => entry.key);
}
function activeAbilitiesSelvagem(species, level) {
	return learnsetAte(species, level).slice(-4);
}
function activeAbilitiesPadrao(species, level) {
	const learnset = learnsetAte(species, level);
	const dano = learnset.map((key, i) => ({
		key,
		i,
		ability: getAbility(key)
	})).filter((r) => isDamagingAbility(r.ability)).sort((a, b) => danoEfetivo(b.ability, species) - danoEfetivo(a.ability, species) || b.i - a.i).slice(0, 4).map((r) => r.key);
	if (dano.length >= 4) return dano;
	const status = learnset.filter((key) => !isDamagingAbility(getAbility(key))).reverse();
	return [...dano, ...status].slice(0, 4);
}
function danoEfetivo(ability, species) {
	const temStab = ability.type === species.type || ability.type === species.type2;
	return ability.power * (temStab ? STAB_MULTIPLIER$1 : 1);
}
function encaixarNovosGolpes(atuais, novos) {
	const saida = [...atuais];
	for (const key of novos) {
		if (saida.length >= 4) break;
		if (saida.includes(key) || key === BASIC_ATTACK.id) continue;
		if (ehGolpeAoeDeNivel50(key)) continue;
		if (!getAbility(key)) continue;
		saida.push(key);
	}
	return saida;
}
function ehGolpeAoeDeNivel50(key) {
	return key in TYPED_AOE_MOVES;
}
function golpesUtilizaveis(poke, species, selvagem) {
	if (selvagem) return activeAbilitiesSelvagem(species, poke.level);
	const conhecidos = new Set(poke.unlockedAbilities);
	const escolhidos = (poke.activeAbilities ?? activeAbilitiesPadrao(species, poke.level)).filter((key) => conhecidos.has(key)).slice(0, 4);
	const aoe = typedAoeMoveKey(species.type);
	return conhecidos.has(aoe) ? [...escolhidos, aoe] : escolhidos;
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
	MEDIUM_SLOW: "GROWTH_MEDIUM_SLOW",
	FAST: "GROWTH_FAST",
	SLOW: "GROWTH_SLOW",
	ERRATIC: "GROWTH_ERRATIC",
	FLUCTUATING: "GROWTH_FLUCTUATING"
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
		unlockedAbilities: species.abilities.filter((entry) => entry.levelReq <= level).map((entry) => entry.key).filter((key) => getAbility(key)),
		activeAbilities: activeAbilitiesPadrao(species, level)
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
			"lv_11_20_costa_wartortle",
			"lv_11_20_costa_blastoise",
			"lv_11_20_costa_psyduck",
			"lv_11_20_costa_golduck",
			"lv_11_20_costa_poliwag",
			"lv_11_20_costa_poliwhirl",
			"lv_11_20_costa_tentacool",
			"lv_11_20_costa_tentacruel",
			"lv_11_20_costa_slowpoke",
			"lv_11_20_costa_slowbro",
			"lv_11_20_costa_seel",
			"lv_11_20_costa_dewgong",
			"lv_11_20_costa_shellder",
			"lv_11_20_costa_krabby",
			"lv_11_20_costa_kingler",
			"lv_11_20_costa_horsea",
			"lv_11_20_costa_seadra",
			"lv_11_20_costa_goldeen",
			"lv_11_20_costa_seaking",
			"lv_11_20_costa_staryu",
			"lv_11_20_costa_magikarp",
			"lv_11_20_costa_gyarados",
			"lv_11_20_costa_lapras",
			"lv_11_20_costa_totodile",
			"lv_11_20_costa_croconaw",
			"lv_11_20_costa_feraligatr",
			"lv_11_20_costa_chinchou",
			"lv_11_20_costa_lanturn",
			"lv_11_20_costa_marill",
			"lv_11_20_costa_azumarill",
			"lv_11_20_costa_politoed",
			"lv_11_20_costa_wooper",
			"lv_11_20_costa_quagsire",
			"lv_11_20_costa_qwilfish",
			"lv_11_20_costa_corsola",
			"lv_11_20_costa_remoraid",
			"lv_11_20_costa_octillery",
			"lv_11_20_costa_mantine",
			"lv_11_20_costa_kingdra"
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
			"lv_11_20_planicie_igglybuff",
			"lv_11_20_planicie_aipom",
			"lv_11_20_planicie_girafarig",
			"lv_11_20_planicie_dunsparce",
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
	"kanto_lv_36_55_clareira_encantada": {
		"id": "kanto_lv_36_55_clareira_encantada",
		"name": "Kanto Zona Nivel 80-105 (Clareira Encantada)",
		"description": "Local selvagem: Kanto Zona Nivel 80-105 (Clareira Encantada) (nivel 80-105).",
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
			"image": null
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
			"kanto_lv_36_55_clareira_encantada_cleffa",
			"kanto_lv_36_55_clareira_encantada_togepi",
			"kanto_lv_36_55_clareira_encantada_snubbull",
			"kanto_lv_36_55_clareira_encantada_granbull"
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
	"lv_11_20_costa_wartortle": {
		"id": "lv_11_20_costa_wartortle",
		"speciesId": "wartortle",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"lv_11_20_costa_blastoise": {
		"id": "lv_11_20_costa_blastoise",
		"speciesId": "blastoise",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
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
	"lv_11_20_costa_golduck": {
		"id": "lv_11_20_costa_golduck",
		"speciesId": "golduck",
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
	"lv_11_20_costa_poliwhirl": {
		"id": "lv_11_20_costa_poliwhirl",
		"speciesId": "poliwhirl",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 20
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
	"lv_11_20_costa_tentacruel": {
		"id": "lv_11_20_costa_tentacruel",
		"speciesId": "tentacruel",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
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
	"lv_11_20_costa_slowbro": {
		"id": "lv_11_20_costa_slowbro",
		"speciesId": "slowbro",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
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
	"lv_11_20_costa_dewgong": {
		"id": "lv_11_20_costa_dewgong",
		"speciesId": "dewgong",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
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
	"lv_11_20_costa_krabby": {
		"id": "lv_11_20_costa_krabby",
		"speciesId": "krabby",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 30
	},
	"lv_11_20_costa_kingler": {
		"id": "lv_11_20_costa_kingler",
		"speciesId": "kingler",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 20
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
	"lv_11_20_costa_seadra": {
		"id": "lv_11_20_costa_seadra",
		"speciesId": "seadra",
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
	"lv_11_20_costa_seaking": {
		"id": "lv_11_20_costa_seaking",
		"speciesId": "seaking",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 20
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
	"lv_11_20_costa_magikarp": {
		"id": "lv_11_20_costa_magikarp",
		"speciesId": "magikarp",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 30
	},
	"lv_11_20_costa_gyarados": {
		"id": "lv_11_20_costa_gyarados",
		"speciesId": "gyarados",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 20
	},
	"lv_11_20_costa_lapras": {
		"id": "lv_11_20_costa_lapras",
		"speciesId": "lapras",
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
	"lv_11_20_costa_croconaw": {
		"id": "lv_11_20_costa_croconaw",
		"speciesId": "croconaw",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"lv_11_20_costa_feraligatr": {
		"id": "lv_11_20_costa_feraligatr",
		"speciesId": "feraligatr",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
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
	"lv_11_20_costa_lanturn": {
		"id": "lv_11_20_costa_lanturn",
		"speciesId": "lanturn",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
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
	"lv_11_20_costa_azumarill": {
		"id": "lv_11_20_costa_azumarill",
		"speciesId": "azumarill",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"lv_11_20_costa_politoed": {
		"id": "lv_11_20_costa_politoed",
		"speciesId": "politoed",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
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
	"lv_11_20_costa_quagsire": {
		"id": "lv_11_20_costa_quagsire",
		"speciesId": "quagsire",
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
	"lv_11_20_costa_corsola": {
		"id": "lv_11_20_costa_corsola",
		"speciesId": "corsola",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
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
	"lv_11_20_costa_octillery": {
		"id": "lv_11_20_costa_octillery",
		"speciesId": "octillery",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"lv_11_20_costa_mantine": {
		"id": "lv_11_20_costa_mantine",
		"speciesId": "mantine",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"lv_11_20_costa_kingdra": {
		"id": "lv_11_20_costa_kingdra",
		"speciesId": "kingdra",
		"minLevel": 10,
		"maxLevel": 18,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
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
	"lv_11_20_planicie_igglybuff": {
		"id": "lv_11_20_planicie_igglybuff",
		"speciesId": "igglybuff",
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
	"kanto_lv_36_55_clareira_encantada_cleffa": {
		"id": "kanto_lv_36_55_clareira_encantada_cleffa",
		"speciesId": "cleffa",
		"minLevel": 80,
		"maxLevel": 105,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"kanto_lv_36_55_clareira_encantada_togepi": {
		"id": "kanto_lv_36_55_clareira_encantada_togepi",
		"speciesId": "togepi",
		"minLevel": 80,
		"maxLevel": 105,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 10
	},
	"kanto_lv_36_55_clareira_encantada_snubbull": {
		"id": "kanto_lv_36_55_clareira_encantada_snubbull",
		"speciesId": "snubbull",
		"minLevel": 80,
		"maxLevel": 105,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 5
	},
	"kanto_lv_36_55_clareira_encantada_granbull": {
		"id": "kanto_lv_36_55_clareira_encantada_granbull",
		"speciesId": "granbull",
		"minLevel": 80,
		"maxLevel": 105,
		"aggroRadius": 175,
		"wanderRadius": 60,
		"weight": 1
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
	DARK: "assets/hunt-backgrounds/cave.png",
	FAIRY: "assets/hunt-backgrounds/forest.png"
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
	kanto_lv_36_55_clareira_encantada: "FAIRY"
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
	kanto_lv_36_55_clareira_encantada: 8
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
		"buyPrice": 800,
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
		"buyPrice": 200,
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
		"buyPrice": 1500,
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
		"buyPrice": 2e3,
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
	"antidote": {
		"id": "antidote",
		"name": "Antidote",
		"kind": "status_heal",
		"description": "Cura status.",
		"buyPrice": 200,
		"healsStatus": ["poison"]
	},
	"awakening": {
		"id": "awakening",
		"name": "Awakening",
		"kind": "status_heal",
		"description": "Cura status.",
		"buyPrice": 100,
		"healsStatus": ["sleep"]
	},
	"burn_heal": {
		"id": "burn_heal",
		"name": "Burn Heal",
		"kind": "status_heal",
		"description": "Cura status.",
		"buyPrice": 300,
		"healsStatus": ["burn"]
	},
	"ice_heal": {
		"id": "ice_heal",
		"name": "Ice Heal",
		"kind": "status_heal",
		"description": "Cura status.",
		"buyPrice": 100,
		"healsStatus": ["freeze"]
	},
	"paralyze_heal": {
		"id": "paralyze_heal",
		"name": "Paralyze Heal",
		"kind": "status_heal",
		"description": "Cura status.",
		"buyPrice": 300,
		"healsStatus": ["paralysis"]
	},
	"full_heal": {
		"id": "full_heal",
		"name": "Full Heal",
		"kind": "status_heal",
		"description": "Cura status.",
		"buyPrice": 400,
		"healsStatus": [
			"poison",
			"sleep",
			"burn",
			"freeze",
			"paralysis",
			"confusion"
		]
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
var KINDS_COM_DESCONTO = /* @__PURE__ */ new Set([
	"ball",
	"potion",
	"status_heal"
]);
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
var KINDS_FORA_DA_LOJA = /* @__PURE__ */ new Set(["rod"]);
Object.values(GENERATED_ITEMS).filter((item) => !KINDS_FORA_DA_LOJA.has(item.kind)).map((item) => ({
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
		statusVolatil: null,
		estagios: {},
		imunidadeDeStatus: 0,
		proximoTurnoDeStatus: TURNO_SEGUNDOS,
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
		statusVolatil: null,
		estagios: {},
		imunidadeDeStatus: 0,
		proximoTurnoDeStatus: TURNO_SEGUNDOS,
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
//#region src/data/generated/status.generated.ts
var STATUS_RULES = {
	"naoVolateis": {
		"poison": {
			"duracaoEmTurnos": null,
			"danoPorTurnoFracaoDoMaximo": .125,
			"imunidadesPorTipo": ["POISON", "STEEL"]
		},
		"burn": {
			"duracaoEmTurnos": null,
			"danoPorTurnoFracaoDoMaximo": .0625,
			"multiplicadorDeDanoFisico": .5,
			"imunidadesPorTipo": ["FIRE"]
		},
		"paralysis": {
			"duracaoEmTurnos": null,
			"chanceDePerderOTurno": .25,
			"multiplicadorDeVelocidade": .5,
			"imunidadesPorTipo": ["ELECTRIC"]
		},
		"sleep": {
			"duracaoEmTurnos": [2, 4],
			"bloqueiaAcao": true,
			"imunidadesPorTipo": []
		},
		"freeze": {
			"duracaoEmTurnos": null,
			"chanceDeDescongelarPorTurno": .2,
			"bloqueiaAcao": true,
			"descongelaComTipo": "FIRE",
			"imunidadesPorTipo": ["ICE"]
		}
	},
	"volateis": { "confusion": {
		"duracaoEmTurnos": [2, 5],
		"chanceDeSeAtacar": .33,
		"poderDoAutoDano": 40,
		"imunidadesPorTipo": []
	} },
	"nomes": {
		"poison": "Envenenado",
		"burn": "Queimado",
		"paralysis": "Paralisado",
		"sleep": "Dormindo",
		"freeze": "Congelado",
		"confusion": "Confuso"
	},
	"golpesDePo": {
		"imunesPorTipo": ["GRASS"],
		"golpes": [
			"spore",
			"sleep_powder",
			"stun_spore",
			"poison_powder",
			"cotton_spore",
			"rage_powder",
			"powder"
		]
	},
	"reaplicacao": { "turnosDeImunidade": 3 }
};
Object.keys(STATUS_RULES.naoVolateis);
Object.keys(STATUS_RULES.volateis);
var SEGUNDOS_DE_IMUNIDADE_APOS_CURA = STATUS_RULES.reaplicacao.turnosDeImunidade * TURNO_SEGUNDOS;
function regraDoStatus(tipo) {
	return STATUS_RULES.naoVolateis[tipo] ?? STATUS_RULES.volateis[tipo] ?? null;
}
function ehVolatil(tipo) {
	return tipo in STATUS_RULES.volateis;
}
function nomeDoStatus(tipo) {
	return STATUS_RULES.nomes[tipo] ?? tipo;
}
var GOLPES_DE_PO = new Set(STATUS_RULES.golpesDePo.golpes);
/**
* O POKE alvo pode receber este status?
*
* Cobre as tres recusas do jogo real:
*   1. imunidade por TIPO (Fogo nao queima, Eletrico nao paralisa, ...)
*   2. imunidade a golpe de PO — GRASS ignora Spore/Stun Spore/Sleep Powder
*      (Gen VI em diante). Depende do GOLPE, nao do status, por isso
*      `abilityId` entra aqui.
*   3. ja ter um status nao-volatil. Nos jogos so cabe um por vez: um POKE
*      dormindo nao pode ser envenenado por cima.
*/
function podeReceberStatus(tipo, alvo, abilityId) {
	const regra = regraDoStatus(tipo);
	if (!regra) return false;
	if (regra.imunidadesPorTipo.includes(alvo.tipo1)) return false;
	if (alvo.tipo2 && regra.imunidadesPorTipo.includes(alvo.tipo2)) return false;
	if (abilityId && GOLPES_DE_PO.has(abilityId)) {
		const imunes = STATUS_RULES.golpesDePo.imunesPorTipo;
		if (imunes.includes(alvo.tipo1) || alvo.tipo2 && imunes.includes(alvo.tipo2)) return false;
	}
	if (!ehVolatil(tipo) && alvo.statusAtual != null) return false;
	return true;
}
function sortearDuracao(rng, tipo) {
	const regra = regraDoStatus(tipo);
	if (!regra || !regra.duracaoEmTurnos) return null;
	const [min, max] = regra.duracaoEmTurnos;
	return min + Math.floor(nextFloat(rng) * (max - min + 1));
}
function danoPorTurno(tipo, hpMaximo) {
	const fracao = regraDoStatus(tipo)?.danoPorTurnoFracaoDoMaximo;
	if (!fracao) return 0;
	return Math.max(1, Math.floor(hpMaximo * fracao));
}
function multiplicadorDeVelocidade(tipo) {
	if (!tipo) return 1;
	return regraDoStatus(tipo)?.multiplicadorDeVelocidade ?? 1;
}
function multiplicadorDeDanoFisico(tipo) {
	if (!tipo) return 1;
	return regraDoStatus(tipo)?.multiplicadorDeDanoFisico ?? 1;
}
function perdeOTurno(rng, status) {
	if (!status) return false;
	const regra = regraDoStatus(status.tipo);
	if (!regra) return false;
	if (regra.bloqueiaAcao) return true;
	if (regra.chanceDePerderOTurno) return nextFloat(rng) < regra.chanceDePerderOTurno;
	return false;
}
function chanceDeSeAtacar(tipo) {
	return regraDoStatus(tipo)?.chanceDeSeAtacar ?? 0;
}
function poderDoAutoDano(tipo) {
	return regraDoStatus(tipo)?.poderDoAutoDano ?? 0;
}
function descongelaCom(tipo, tipoDoGolpe, poderDoGolpe) {
	const regra = regraDoStatus(tipo);
	return Boolean(regra?.descongelaComTipo && regra.descongelaComTipo === tipoDoGolpe && poderDoGolpe > 0);
}
function chanceDeDescongelar(tipo) {
	return regraDoStatus(tipo)?.chanceDeDescongelarPorTurno ?? 0;
}
/**
* Multiplicador de um estagio, formula exata dos jogos: (2+n)/2 subindo e
* 2/(2-n) descendo.
*
* A assimetria e de proposito e e do jogo original: +1 da 1.5x, mas -1 da
* 0.67x, nao 0.5x. Usar `1 + n*0.5` dos dois lados (o "obvio") tornaria os
* debuffs bem mais fortes do que sao — em -2 a diferenca ja e 0.5 contra 0.5,
* mas em -6 seria 0 (imortal) contra 0.25.
*/
function multiplicadorDeEstagio(estagio) {
	const n = Math.max(-6, Math.min(6, estagio));
	return n >= 0 ? (2 + n) / 2 : 2 / (2 - n);
}
function multiplicadorDeStat(estagios, stat) {
	return multiplicadorDeEstagio(estagios?.[stat] ?? 0);
}
//#endregion
//#region src/data/statusColors.ts
var CORES = {
	poison: "#a855f7",
	burn: "#f97316",
	paralysis: "#facc15",
	sleep: "#94a3b8",
	freeze: "#38bdf8",
	confusion: "#f472b6"
};
function corDoStatus(tipo) {
	return CORES[tipo] ?? "#e5e5e5";
}
//#endregion
//#region src/engine/systems/statusSystem.ts
function statusNaoVolatil(entity) {
	return entity.poke.status ?? null;
}
/**
* Vale a pena tentar este status neste alvo AGORA?
*
* Usada pela IA (`pickAbility`) antes de escolher um golpe de status puro. Sem
* ela o inimigo gastaria turnos jogando Thunder Wave num POKE ja paralisado,
* num POKE de tipo ELECTRIC, ou dentro da janela de imunidade de reaplicacao —
* e a leitura pro jogador seria "esse POKE parou de atacar do nada".
*
* Nao sorteia nada: e a pergunta "pode pegar", nao "pegou".
*/
function statusVaiPegar(alvo, tipo, abilityId) {
	if (alvo.imunidadeDeStatus > 0) return false;
	if (ehVolatil(tipo) && alvo.statusVolatil) return false;
	const especie = SPECIES[alvo.poke.speciesId];
	return podeReceberStatus(tipo, {
		tipo1: especie.type,
		tipo2: especie.type2,
		statusAtual: statusNaoVolatil(alvo)?.tipo ?? null
	}, abilityId);
}
/**
* Tenta aplicar `tipo` em `alvo`. Devolve o status aplicado, ou null se nao
* pegou (imunidade, ja tem status, imunidade de reaplicacao, ou o sorteio da
* chance falhou).
*
* `abilityId` entra porque a imunidade a golpe de PO depende do GOLPE, nao do
* status: GRASS ignora Sleep Powder mas nao ignora Hypnosis.
*/
function aplicarStatus(rng, alvo, tipo, chance, abilityId) {
	if (alvo.imunidadeDeStatus > 0) return null;
	const especie = SPECIES[alvo.poke.speciesId];
	if (!podeReceberStatus(tipo, {
		tipo1: especie.type,
		tipo2: especie.type2,
		statusAtual: statusNaoVolatil(alvo)?.tipo ?? null
	}, abilityId)) return null;
	if (ehVolatil(tipo) && alvo.statusVolatil) return null;
	if (nextFloat(rng) * 100 >= chance) return null;
	const status = {
		tipo,
		turnosRestantes: sortearDuracao(rng, tipo)
	};
	if (ehVolatil(tipo)) alvo.statusVolatil = status;
	else alvo.poke.status = status;
	return status;
}
/**
* Aplica as mudancas de estagio de atributo de um golpe ("power ups").
*
* `ability.statTarget === 'self'` manda no proprio usuario (Danca das Espadas);
* ausente manda no alvo (Rosnado). Sem essa distincao, Danca das Espadas subiria
* o Ataque do INIMIGO — e o dado cru da PokeAPI nao a carrega, ela vem de
* `move.target` (ver fetch-usum-catalog.js).
*
* Devolve as mudancas que REALMENTE entraram: quem ja esta em +6 nao sobe mais,
* e o chamador precisa saber disso pra nao anunciar um buff que nao houve.
*/
function aplicarMudancasDeStat(rng, atacante, alvo, ability) {
	if (!ability.statChanges || !ability.statChance) return [];
	if (nextFloat(rng) * 100 >= ability.statChance) return [];
	const destino = ability.statTarget === "self" ? atacante : alvo;
	const aplicadas = [];
	for (const mudanca of ability.statChanges) {
		const antes = destino.estagios[mudanca.stat] ?? 0;
		const depois = Math.max(-6, Math.min(6, antes + mudanca.estagios));
		if (depois === antes) continue;
		destino.estagios[mudanca.stat] = depois;
		aplicadas.push({
			stat: mudanca.stat,
			estagios: depois - antes
		});
	}
	return aplicadas;
}
function aplicarEfeitosDoGolpe(rng, alvo, ability) {
	const congelado = statusNaoVolatil(alvo);
	if (congelado && descongelaCom(congelado.tipo, ability.type, ability.power)) curarStatus(alvo, congelado.tipo);
	if (!ability.status || !ability.statusChance) return null;
	return aplicarStatus(rng, alvo, ability.status, ability.statusChance, ability.id);
}
/**
* Tira um status e liga a imunidade de reaplicacao.
*
* `tipo` opcional: sem ele tira TUDO (o que o Centro Pokemon faz). Com ele,
* tira so aquele — e o que um Antidoto faz.
*/
function curarStatus(entity, tipo) {
	let curou = false;
	const nv = statusNaoVolatil(entity);
	if (nv && (!tipo || nv.tipo === tipo)) {
		entity.poke.status = null;
		curou = true;
	}
	if (entity.statusVolatil && (!tipo || entity.statusVolatil.tipo === tipo)) {
		entity.statusVolatil = null;
		curou = true;
	}
	if (curou) entity.imunidadeDeStatus = SEGUNDOS_DE_IMUNIDADE_APOS_CURA;
	return curou;
}
/**
* Zera o que os jogos zeram no fim da batalha: estagios de atributo e status
* volatil (confusao). O nao-volatil NAO sai daqui — ele sobrevive a batalha
* nos jogos, e e por isso que existe Antidoto.
*
* A imunidade de reaplicacao tambem nao e mexida: ela e sobre o tempo desde a
* ultima cura, nao sobre a batalha.
*/
function limparEstadoVolatil(entity) {
	entity.statusVolatil = null;
	entity.estagios = {};
}
/**
* Passa o tempo dos status de UMA entidade. Chamado todo frame; so faz algo
* quando o relogio de turno dela fecha.
*
* NAO aplica o dano no POKE — devolve quanto foi, pro chamador (combatSystem)
* decidir sobre numero flutuante, morte e loot com o mesmo caminho que ja usa
* pro resto do dano.
*/
function tickStatus(rng, entity, dt) {
	if (entity.imunidadeDeStatus > 0) entity.imunidadeDeStatus = Math.max(0, entity.imunidadeDeStatus - dt);
	entity.proximoTurnoDeStatus -= dt;
	if (entity.proximoTurnoDeStatus > 1e-9) return {
		dano: 0,
		expirados: []
	};
	entity.proximoTurnoDeStatus += TURNO_SEGUNDOS;
	const expirados = [];
	let dano = 0;
	const nv = statusNaoVolatil(entity);
	if (nv) {
		dano += danoPorTurno(nv.tipo, entity.poke.stats.hp);
		const chanceDeSair = chanceDeDescongelar(nv.tipo);
		if (chanceDeSair > 0) {
			if (nextFloat(rng) < chanceDeSair) {
				entity.poke.status = null;
				expirados.push(nv.tipo);
			}
		} else if (nv.turnosRestantes != null) {
			nv.turnosRestantes -= 1;
			if (nv.turnosRestantes <= 0) {
				entity.poke.status = null;
				expirados.push(nv.tipo);
			}
		}
	}
	const vol = entity.statusVolatil;
	if (vol && vol.turnosRestantes != null) {
		vol.turnosRestantes -= 1;
		if (vol.turnosRestantes <= 0) {
			entity.statusVolatil = null;
			expirados.push(vol.tipo);
		}
	}
	if (expirados.length) entity.imunidadeDeStatus = SEGUNDOS_DE_IMUNIDADE_APOS_CURA;
	return {
		dano,
		expirados
	};
}
/**
* O POKE consegue agir neste turno?
*
* Ordem igual a dos jogos: o status nao-volatil resolve ANTES da confusao —
* um POKE dormindo nem chega a se atacar de confuso.
*
* `calcularAutoDano` e injetado em vez de calculado aqui porque o dano de
* confusao usa o MESMO pipeline de dano do combate (nivel, Ataque, Defesa),
* que mora em combatSystem. Reimplementar aqui seria uma segunda formula de
* dano pra divergir na primeira mudanca de balanceamento.
*/
function tentarAgir(rng, entity, calcularAutoDano) {
	const nv = statusNaoVolatil(entity);
	if (nv && perdeOTurno(rng, nv)) return {
		agir: false,
		motivo: nv.tipo
	};
	const vol = entity.statusVolatil;
	if (vol) {
		const chance = chanceDeSeAtacar(vol.tipo);
		if (chance > 0 && nextFloat(rng) < chance) return {
			agir: false,
			motivo: vol.tipo,
			autoDano: calcularAutoDano(poderDoAutoDano(vol.tipo))
		};
	}
	return { agir: true };
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
		"STEEL": .5,
		"FAIRY": 1
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
		"STEEL": 2,
		"FAIRY": 1
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
		"STEEL": 1,
		"FAIRY": 1
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
		"STEEL": 1,
		"FAIRY": 1
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
		"STEEL": .5,
		"FAIRY": 1
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
		"STEEL": .5,
		"FAIRY": 1
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
		"STEEL": 2,
		"FAIRY": .5
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
		"STEEL": 0,
		"FAIRY": 2
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
		"STEEL": 2,
		"FAIRY": 1
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
		"STEEL": .5,
		"FAIRY": 1
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
		"STEEL": .5,
		"FAIRY": 1
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
		"STEEL": .5,
		"FAIRY": .5
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
		"STEEL": .5,
		"FAIRY": 1
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
		"STEEL": 1,
		"FAIRY": 1
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
		"STEEL": .5,
		"FAIRY": 0
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
		"STEEL": 1,
		"FAIRY": .5
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
		"STEEL": .5,
		"FAIRY": 2
	},
	"FAIRY": {
		"NORMAL": 1,
		"FIRE": .5,
		"WATER": 1,
		"ELECTRIC": 1,
		"GRASS": 1,
		"ICE": 1,
		"FIGHTING": 2,
		"POISON": .5,
		"GROUND": 1,
		"FLYING": 1,
		"PSYCHIC": 1,
		"BUG": 1,
		"ROCK": 1,
		"GHOST": 1,
		"DRAGON": 2,
		"DARK": 2,
		"STEEL": .5,
		"FAIRY": 1
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
var MIN_ACTION_GAP = TURNO_SEGUNDOS;
var MELEE_RANGE_PADDING = 10;
function engageRangeFor(attacker, defender) {
	return attacker.radius + defender.radius + MELEE_RANGE_PADDING;
}
function scaledCooldown(ability, speed) {
	if (ability.id === BASIC_ATTACK.id) return BASE_ATTACK_INTERVAL;
	return (ability.cooldown ?? 0) * (SPEED_REFERENCE / Math.max(1, speed));
}
function velocidadeEfetiva(entity) {
	return entity.poke.stats.speed * multiplicadorDeVelocidade(entity.poke.status?.tipo ?? null) * multiplicadorDeStat(entity.estagios, "speed");
}
function danoDeConfusao(entity, poder) {
	if (poder <= 0) return 0;
	const p = entity.poke;
	return Math.max(1, Math.round(formulaEngine$4.eval("DAMAGE_BASE", {
		level: p.level,
		power: poder,
		atk: p.stats.atkFis,
		def: p.stats.def
	})));
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
var ESTAGIO_ALVO_DA_IA = 2;
/**
* Vale a pena usar este golpe de APOIO puro (sem dano, sem status) agora?
*
* Cobre os dois lados: buff em si mesmo (Danca das Espadas) e debuff no
* oponente (Rosnado). Em ambos, so vale se o estagio ainda nao chegou no alvo
* da IA — repetir um buff no teto e um turno jogado fora, e o jogador ve o POKE
* "dancando" em vez de atacar.
*/
function golpeDeApoioUtil(entity, defenderEntity, ability) {
	if (ability.healPercent) return entity.poke.hp / entity.poke.stats.hp <= 1 - ability.healPercent / 100;
	if (!ability.statChanges || !ability.statChanges.length) return false;
	const destino = ability.statTarget === "self" ? entity : defenderEntity;
	return ability.statChanges.some((m) => {
		const atual = destino.estagios[m.stat] ?? 0;
		return m.estagios > 0 ? atual < ESTAGIO_ALVO_DA_IA : atual > -2;
	});
}
/**
* Dano estimado JA DESCONTADA a chance de errar.
*
* `estimateDamage` responde "quanto isso tira se acertar", que era a pergunta
* certa enquanto todo golpe sempre acertava. Com precisao valendo, ranquear por
* ela faz o POKE escolher Blizzard (110 de poder, 70% de precisao) em vez de um
* golpe de 100% quase tao forte — e perder o turno inteiro em 3 de cada 10
* tentativas.
*
* Medido: so essa troca vale 15% das kills/hora numa hunt onde o jogador esta
* muito acima do nivel, que e onde os golpes fortes e imprecisos dominam o
* moveset.
*/
function danoEsperado(rng, atacante, defensor, ability) {
	return estimateDamage(rng, atacante, defensor, ability) * ((ability.accuracy ?? 100) / 100);
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
		const atk = (isPhysical ? attackerPoke.stats.atkFis : attackerPoke.stats.atkEsp) * multiplicadorDeStat(attackerEntity.estagios, isPhysical ? "atkFis" : "atkEsp");
		const def = (isPhysical ? defenderPoke.stats.def : defenderPoke.stats.defEsp) * multiplicadorDeStat(defenderEntity.estagios, isPhysical ? "def" : "defEsp");
		const power = special && special.mode === "dynamicPower" ? special.power : ability.power;
		dmg = formulaEngine$4.eval("DAMAGE_BASE", {
			level: attackerPoke.level,
			power,
			atk,
			def
		});
		if (isPhysical) dmg *= multiplicadorDeDanoFisico(attackerPoke.status?.tipo ?? null);
		if (Boolean(ability.type) && (ability.type === attackerSpecies.type || ability.type === attackerSpecies.type2)) dmg *= STAB_MULTIPLIER;
		dmg *= effectivenessMultiplier;
		const chanceDeCritico = CRIT_CHANCE * Math.pow(3, Math.min(3, ability.critStages ?? 0));
		isCrit = pessimista ? false : rollChance(rng, Math.min(.5, chanceDeCritico));
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
	const prontos = golpesUtilizaveis(entity.poke, attackerSpecies, entity.kind === "enemy").filter((id) => !disabled[id]).map((id) => getAbility(id)).filter((a) => a != null && isAbilityReady(entity, a.id));
	const ready = prontos.filter((ability) => isDamagingAbility(ability));
	const statusPronto = prontos.filter((a) => a.power === 0 && (a.status != null && statusVaiPegar(defenderEntity, a.status, a.id) || golpeDeApoioUtil(entity, defenderEntity, a)));
	if (statusPronto.length > 0) {
		if (ready.reduce((max, a) => Math.max(max, estimateDamage(rng, entity, defenderEntity, a)), 0) < defenderEntity.poke.hp) return statusPronto.reduce((melhor, a) => (a.statusChance ?? 0) > (melhor.statusChance ?? 0) ? a : melhor);
	}
	if (ready.length === 0) {
		const basico = basicAttackFor(attackerSpecies);
		if (disabled[BASIC_ATTACK.id] || !isAbilityReady(entity, BASIC_ATTACK.id)) return null;
		return basico;
	}
	const aoeReady = ready.filter((a) => a.target === "aoe" && aoeTargetCounter(a) >= 2);
	return (aoeReady.length > 0 ? aoeReady : ready).reduce((best, a) => danoEsperado(rng, entity, defenderEntity, a) > danoEsperado(rng, entity, defenderEntity, best) ? a : best);
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
function anunciarStatus(world, alvo, tipo, quando = "entrou") {
	world.effects.push(createWorldEffect(world.counters, {
		type: "abilityName",
		x: alvo.x,
		y: alvo.y,
		targetX: alvo.x,
		targetY: alvo.y + getGroundOffset(alvo) + 14,
		text: quando === "entrou" ? `${nomeDoStatus(tipo)}!` : `${nomeDoStatus(tipo)} passou`,
		color: corDoStatus(tipo),
		duration: .8,
		owner: alvo
	}));
}
var ROTULO_DE_STAT = {
	atkFis: "Ataque",
	atkEsp: "Atq. Esp.",
	def: "Defesa",
	defEsp: "Def. Esp.",
	speed: "Velocidade"
};
function anunciarEstagios(world, alvo, mudancas) {
	const texto = mudancas.map((m) => `${ROTULO_DE_STAT[m.stat] ?? m.stat} ${(m.estagios > 0 ? "↑" : "↓").repeat(Math.abs(m.estagios))}`).join("  ");
	world.effects.push(createWorldEffect(world.counters, {
		type: "abilityName",
		x: alvo.x,
		y: alvo.y,
		targetX: alvo.x,
		targetY: alvo.y + getGroundOffset(alvo) + 14,
		text: texto,
		color: mudancas[0].estagios > 0 ? "#4ade80" : "#fb7185",
		duration: .9,
		owner: alvo
	}));
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
/**
* O status deixa este POKE agir agora? Roda ANTES de escolher o golpe, como
* nos jogos: sono, congelamento e paralisia comem o turno inteiro, e a
* confusao troca o golpe por uma pancada em si mesmo.
*
* Consome o cooldown global mesmo quando o turno e perdido. Sem isso um POKE
* dormindo tentaria agir a cada frame e o sono viraria um sorteio de 60 vezes
* por segundo em vez de um por turno.
*/
/**
* O golpe errou?
*
* A precisao existia no catalogo desde a migracao pro Ultra Sun, mas nao era
* emitida pro cliente nem usada — todo golpe sempre acertava. Passa a valer
* agora porque sem ela o status nao tem como ser fiel: Hypnosis com 60% de
* precisao e Sing com 55% viram sono garantido, e um golpe de sono garantido
* desequilibra o combate inteiro.
*
* UM sorteio por USO, nao por alvo. Nos jogos, um golpe de area rola precisao
* contra cada alvo; aqui o AOE ja e uma aproximacao (raio em pixels, sem
* posicionamento de batalha), e rolar por alvo so somaria variancia invisivel
* a uma mecanica que o jogador nem ve alvo a alvo.
*/
function golpeErrou(rng, ability) {
	const precisao = ability.accuracy ?? 100;
	if (precisao >= 100) return false;
	return nextFloat(rng) * 100 >= precisao;
}
function anunciarErro(world, atacante) {
	world.effects.push(createWorldEffect(world.counters, {
		type: "abilityName",
		x: atacante.x,
		y: atacante.y,
		targetX: atacante.x,
		targetY: atacante.y + getGroundOffset(atacante) + 14,
		text: "Errou!",
		color: "#94a3b8",
		duration: .7,
		owner: atacante
	}));
}
function statusImpedeAcao(world, entity, silent) {
	const r = tentarAgir(world.rng, entity, (poder) => danoDeConfusao(entity, poder));
	if (r.agir) return false;
	startGlobalCooldown(entity, MIN_ACTION_GAP);
	if (r.autoDano != null && r.autoDano > 0) {
		takeDamage(entity, r.autoDano, "physical");
		if (!silent) spawnDamageNumber(world, entity, {
			amount: r.autoDano,
			effectiveness: "normal",
			effectivenessLabel: null,
			isCrit: false
		});
	}
	if (!silent) anunciarStatus(world, entity, r.motivo);
	return true;
}
function executePlayerAction(world, player, engagedEnemies, silent) {
	if (!canAct(player)) return;
	if (statusImpedeAcao(world, player, silent)) return;
	const primaryTarget = engagedEnemies[0];
	const allEnemies = nearbyAliveEnemies(world);
	const ability = pickAbility(world.rng, player, primaryTarget, (a) => allEnemies.filter((e) => Math.hypot(e.x - player.x, e.y - player.y) <= (a.radius ?? 0)).length);
	if (!ability) return;
	startCooldown(player, ability.id, scaledCooldown(ability, velocidadeEfetiva(player)));
	startGlobalCooldown(player, MIN_ACTION_GAP);
	triggerAttackAnim(player, ability.target === "aoe", primaryTarget);
	announceAbility(world, player, ability);
	if (golpeErrou(world.rng, ability)) {
		if (!silent) anunciarErro(world, player);
		return;
	}
	const targets = ability.target === "aoe" ? allEnemies.filter((e) => Math.hypot(e.x - player.x, e.y - player.y) <= (ability.radius ?? 0)) : [engagedEnemies[0]].filter(Boolean);
	for (const target of targets) queueHit(world, player, target, ability);
	if (ability.target === "aoe") queueAoeVisual(world, player, ability);
}
function executeEnemyAction(world, enemy, player, silent) {
	if (!canAct(enemy)) return;
	if (statusImpedeAcao(world, enemy, silent)) return;
	const ability = pickAbility(world.rng, enemy, player, () => 1);
	if (!ability) return;
	startCooldown(enemy, ability.id, scaledCooldown(ability, velocidadeEfetiva(enemy)));
	startGlobalCooldown(enemy, MIN_ACTION_GAP);
	triggerAttackAnim(enemy, ability.target === "aoe", player);
	announceAbility(world, enemy, ability);
	if (golpeErrou(world.rng, ability)) {
		if (!silent) anunciarErro(world, enemy);
		return;
	}
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
	const danoCausado = Math.min(result.amount, target.poke.hp);
	if (result.amount > 0) {
		takeDamage(target, result.amount, resolveAbilityCategory(ability, attacker.poke));
		if (!silent) spawnDamageNumber(world, target, result);
	}
	if (!isDead(target)) {
		const aplicado = aplicarEfeitosDoGolpe(world.rng, target, ability);
		if (aplicado && !silent) anunciarStatus(world, target, aplicado.tipo, "entrou");
		const mudancas = aplicarMudancasDeStat(world.rng, attacker, target, ability);
		if (mudancas.length && !silent) anunciarEstagios(world, ability.statTarget === "self" ? attacker : target, mudancas);
	}
	if (ability.healPercent) {
		const quanto = Math.max(1, Math.round(attacker.poke.stats.hp * ability.healPercent / 100));
		heal(attacker, quanto);
		if (!silent) spawnDamageNumber(world, attacker, {
			amount: -quanto,
			effectiveness: "normal",
			effectivenessLabel: null,
			isCrit: false
		});
	}
	if (ability.flinchChance && nextFloat(world.rng) * 100 < ability.flinchChance) startGlobalCooldown(target, MIN_ACTION_GAP);
	if (ability.drainPercent && danoCausado > 0) {
		const quanto = Math.max(1, Math.round(danoCausado * Math.abs(ability.drainPercent) / 100));
		if (ability.drainPercent > 0) {
			heal(attacker, quanto);
			if (!silent) spawnDamageNumber(world, attacker, {
				amount: -quanto,
				effectiveness: "normal",
				effectivenessLabel: null,
				isCrit: false
			});
		} else {
			takeDamage(attacker, quanto);
			if (!silent) spawnDamageNumber(world, attacker, {
				amount: quanto,
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
	}
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
	const defeatedEnemyIds = [];
	let playerJustFainted = false;
	tickCooldowns(player, dt);
	for (const enemy of enemies) tickCooldowns(enemy, dt);
	for (const entity of [player, ...enemies]) {
		if (isDead(entity)) continue;
		const { dano, expirados } = tickStatus(world.rng, entity, dt);
		if (!silent) for (const tipo of expirados) anunciarStatus(world, entity, tipo, "saiu");
		if (dano <= 0) continue;
		takeDamage(entity, dano);
		if (!silent) spawnDamageNumber(world, entity, {
			amount: dano,
			effectiveness: "normal",
			effectivenessLabel: null,
			isCrit: false
		});
		if (!isDead(entity)) continue;
		if (entity.kind === "player") {
			if (!player.fainted) {
				player.fainted = true;
				playerJustFainted = true;
			}
		} else if (!entity.deathHandled) {
			entity.deathHandled = true;
			defeatedEnemyIds.push(entity.id);
		}
	}
	for (const effect of world.effects) tickEffect(effect, dt);
	for (const effect of world.effects) if (effectDone(effect) && effect.ownerId) {
		const owner = findEntityById(player, enemies, effect.ownerId);
		if (owner) releaseEffectLane(owner, effect.id);
	}
	world.effects = world.effects.filter((e) => !effectDone(e));
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
		executePlayerAction(world, player, engagedEnemies, silent);
		for (const enemy of engagedEnemies) {
			if (isDead(enemy) || player.fainted) continue;
			executeEnemyAction(world, enemy, player, silent);
		}
	} else limparEstadoVolatil(player);
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
var STATUS_BONUS_SEM_STATUS = 1;
/**
* Chance de captura pela cadeia da Gen VII: taxa modificada -> probabilidade de
* uma sacudida -> tres sacudidas.
*
* `hpAtual`/`hpMax` importam de verdade na Gen VII (alvo machucado e mais
* facil). Neste jogo a bola so e jogada DEPOIS do POKE selvagem cair, entao o
* termo de HP vale sempre 1 (o maximo) — mas ele fica na formula, e nao
* simplificado pra 1, porque e o que torna a conta a mesma dos jogos e porque
* qualquer captura futura com o alvo vivo passa a funcionar sozinha.
*/
function catchChance(catchRate, ballMultiplier, hpAtual, hpMax) {
	const a = formulaEngine$3.eval("CATCH_MODIFIED_RATE", {
		hpMax: Math.max(1, hpMax),
		hpAtual: clamp(hpAtual, 0, Math.max(1, hpMax)),
		catchRate,
		ballMultiplier,
		statusBonus: STATUS_BONUS_SEM_STATUS,
		catchMultiplier: GLOBAL_CATCH_MULTIPLIER
	});
	const shakeProbability = formulaEngine$3.eval("CATCH_SHAKE_PROBABILITY", { a });
	const shakes = formulaEngine$3.eval("CATCH_SHAKES");
	return clamp(formulaEngine$3.eval("CATCH_CHANCE", {
		shakeProbability,
		shakes
	}), 0, 1);
}
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
	const chance = catchChance(species.catchRate, ball.captureRate, defeatedPoke.hp, defeatedPoke.stats.hp);
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
		unlockedAbilities: species.abilities.filter((entry) => entry.levelReq <= CAPTURE_LEVEL).map((entry) => entry.key).filter((key) => getAbility(key)),
		activeAbilities: activeAbilitiesPadrao(species, CAPTURE_LEVEL),
		status: null
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
var COOLDOWN_DO_TREINADOR = 1.5;
var HP_CRITICO = .25;
function resolveRulePotionId(gameState, rule) {
	if (rule.itemId !== "best") return rule.itemId;
	return Object.values(ITEMS).filter((item) => item.kind === "potion" && gameState.hasItem(item.id, 1)).sort((a, b) => (b.healAmount ?? 0) - (a.healAmount ?? 0))[0]?.id || null;
}
/**
* O item de cura mais BARATO que resolve o status que o POKE tem agora.
*
* A ordem importa em ouro: o Full Heal cura os seis, mas custa 120 contra os 30
* de um Despertar. Deixar o bot pegar "o primeiro que serve" faria ele gastar
* quatro vezes mais pra curar um sono. Ordena por preco de compra e pega o
* primeiro que cobre o status — o Full Heal so entra quando e o unico que o
* jogador tem.
*/
function melhorCuraDeStatus(gameState, status) {
	return Object.values(ITEMS).filter((item) => "kind" in item && item.kind === "status_heal" && Array.isArray(item.healsStatus) && item.healsStatus.includes(status) && gameState.hasItem(item.id, 1)).sort((a, b) => a.buyPrice - b.buyPrice)[0] ?? null;
}
function updateAutoHeal(world, gameState, dt) {
	const player = world.player;
	const events = [];
	if (!player) return events;
	const timers = world.autoTimers;
	timers.treinador = Math.max(0, timers.treinador - dt);
	const isBossHunt = Boolean(world.mapDef && world.mapDef.noRespawn);
	if (!isBossHunt && gameState.autoToggles.autoRevive && player.fainted) world.reviveCountdown = world.reviveCountdown == null ? 5 : Math.max(0, world.reviveCountdown - dt);
	else world.reviveCountdown = null;
	if (isBossHunt || timers.treinador > 0) return events;
	if (gameState.autoToggles.autoRevive && player.fainted && (world.reviveCountdown ?? 0) <= 0) {
		const revive = getItem("revive");
		if (revive && "reviveHpPercent" in revive && revive.reviveHpPercent != null && gameState.hasItem("revive", 1)) {
			gameState.removeItem("revive", 1);
			player.poke.hp = Math.round(player.poke.stats.hp * revive.reviveHpPercent);
			player.fainted = false;
			player.state = "wander";
			timers.treinador = COOLDOWN_DO_TREINADOR;
			world.reviveCountdown = null;
			events.push({
				type: "auto_revive",
				itemId: "revive"
			});
			return events;
		}
	}
	if (player.fainted) return events;
	const fracaoDeHp = player.poke.hp / player.poke.stats.hp;
	const usarPocao = () => {
		if (!gameState.autoToggles.autoPot) return false;
		const hpPct = fracaoDeHp * 100;
		for (const rule of gameState.autoPotRules) {
			if (hpPct > rule.hpPercent) continue;
			const resolvedId = resolveRulePotionId(gameState, rule);
			const item = resolvedId && getItem(resolvedId);
			if (!item || !("healAmount" in item) || item.healAmount == null || !gameState.hasItem(resolvedId, 1)) continue;
			gameState.removeItem(resolvedId, 1);
			heal(player, item.healAmount);
			timers.treinador = COOLDOWN_DO_TREINADOR;
			events.push({
				type: "auto_pot",
				itemId: resolvedId
			});
			return true;
		}
		return false;
	};
	if (fracaoDeHp <= HP_CRITICO && usarPocao()) return events;
	if (gameState.autoToggles.autoPot) {
		const status = player.poke.status?.tipo ?? player.statusVolatil?.tipo ?? null;
		if (status) {
			const cura = melhorCuraDeStatus(gameState, status);
			if (cura) {
				gameState.removeItem(cura.id, 1);
				curarStatus(player, status);
				timers.treinador = COOLDOWN_DO_TREINADOR;
				events.push({
					type: "auto_status",
					itemId: cura.id
				});
				return events;
			}
		}
	}
	usarPocao();
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
var XP_GLOBAL_MULTIPLIER = formulaEngine$2.evalOrDefault("XP_GLOBAL_MULTIPLIER", .1);
var DEATH_EXP_LOSS_PERCENT = formulaEngine$2.evalOrDefault("DEATH_EXP_LOSS_PERCENT", .05);
/**
* XP por abate, pela formula escalada da Gen VII.
*
* `winnerLevel` (o `Lp` da formula) e o nivel de QUEM VENCEU — o POKE em campo,
* nao o Treinador. E parametro obrigatorio de proposito: um default aqui
* (`= enemyPoke.level`, por exemplo) faria a formula parecer funcionar em todo
* call site novo enquanto silenciosamente devolvia sempre o valor de nivel
* empatado, que e o MAXIMO da curva — o erro renderia XP a mais e ninguem
* notaria.
*
* O Treinador recebe a MESMA quantia (`simulation.ts` soma o mesmo valor nos
* dois), como sempre foi: o nivel do Treinador nao entra na conta.
*/
function expRewardForEnemy(enemyPoke, winnerLevel) {
	const species = SPECIES[enemyPoke.speciesId];
	const base = formulaEngine$2.eval("EXP_GAIN", {
		baseExp: species.baseExp,
		level: enemyPoke.level,
		winnerLevel
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
		unlockedAbilities,
		activeAbilities: encaixarNovosGolpes(pokeInstance.activeAbilities ?? activeAbilitiesPadrao(species, pokeInstance.level), newAbilities.map((a) => a.id))
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
		autoTimers: { treinador: 0 },
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
				realce,
				channel
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
		autoTimers: { treinador: 0 },
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
	const expGain = expRewardForEnemy(enemy.poke, poke.level);
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
		unlockedAbilities: species ? species.abilities.filter((a) => a.levelReq <= row.level).map((a) => a.key).filter((key) => getAbility(key)) : row.unlocked_abilities,
		disabledAbilities: row.disabled_abilities ?? {},
		activeAbilities: row.active_abilities ?? (species ? activeAbilitiesPadrao(species, row.level) : void 0),
		status: row.status ? {
			tipo: row.status,
			turnosRestantes: row.status_turns
		} : null,
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
		active_abilities: poke.activeAbilities ?? null,
		status: poke.status?.tipo ?? null,
		status_turns: poke.status?.turnosRestantes ?? null,
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
			setActiveAbilities: (pokeUid, abilityIds) => {
				const achado = acharPoke(pokeUid);
				if (!achado) return;
				achado.lista[achado.indice] = {
					...achado.lista[achado.indice],
					activeAbilities: [...abilityIds]
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
var TAMANHO_LOTE_ID = 100;
function porLotesDeId(ids) {
	const lotes = [];
	for (let i = 0; i < ids.length; i += TAMANHO_LOTE_ID) lotes.push(ids.slice(i, i + TAMANHO_LOTE_ID));
	return lotes;
}
var CONQUISTA_LANCE = "boss_lance";
var MAX_SEGUNDOS_POR_FLUSH = 21600;
var MARCA_DE_FLUSH_EXPIRA_MS = 3e4;
var ESPERA_MAXIMA_POR_FLUSH_MS = 2500;
var INTERVALO_DE_SONDAGEM_MS = 120;
var dormir = (ms) => new Promise((r) => setTimeout(r, ms));
/**
* Segura o request enquanto um flush do MESMO jogador ainda esta escrevendo.
*
* O CAS de `gravarEstado` (playerUpdatedAt) impede sobrescrita SILENCIOSA —
* mas nao impede DESCARTE: `aplicarFlush` avanca `last_flush_at` no claim,
* ANTES de simular, e so grava no fim. Se o CAS final perder a corrida (outro
* request escreveu `players` no meio da simulacao), a excecao 409 propaga e a
* simulacao inteira — ouro, XP, capturas de um intervalo real — e jogada fora
* SEM que `last_flush_at` volte atras, entao aquele tempo nao credita em
* flush nenhum. Esperar em vez de correr evita perder o trabalho: quem chega
* depois so precisa ler o resultado do flush que ja estava terminando.
*/
async function aguardarFlushEmAndamento(cfg, userId) {
	const limite = Date.now() + ESPERA_MAXIMA_POR_FLUSH_MS;
	for (;;) {
		if (!(await selecionar(cfg, `game_sessions?user_id=eq.${userId}&flushing_since=not.is.null&select=flushing_since`)).some((l) => Date.now() - new Date(l.flushing_since).getTime() < MARCA_DE_FLUSH_EXPIRA_MS)) return;
		if (Date.now() >= limite) return;
		await dormir(INTERVALO_DE_SONDAGEM_MS);
	}
}
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
async function comEstadoParaEscrita(cfg, userId, fn, opcoes = {}) {
	if (opcoes.esperarFlush !== false) await aguardarFlushEmAndamento(cfg, userId);
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
	const idsAgora = new Set(linhasPoke.map((l) => l.id).filter((id) => id != null));
	const idsDeInteresse = [.../* @__PURE__ */ new Set([...pokeIdsNoLoad, ...idsAgora])];
	const atuais = [];
	for (const lote of porLotesDeId(idsDeInteresse)) atuais.push(...await selecionarTudo(cfg, `pokemon_instances?id=in.(${lote.join(",")})&select=id,user_id,location`));
	const porId = new Map(atuais.map((l) => [l.id, l]));
	const aindaMeu = (l) => l != null && l.user_id === userId && (l.location === "team" || l.location === "bag");
	const remover = [...pokeIdsNoLoad].filter((id) => !idsAgora.has(id) && aindaMeu(porId.get(id)));
	for (const lote of porLotesDeId(remover)) await apagar(cfg, `pokemon_instances?user_id=eq.${userId}&id=in.(${lote.join(",")})`);
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
	const [reivindicada] = await atualizarRetornando(cfg, `game_sessions?id=eq.${sessao.id}&closed_at=is.null&last_flush_at=eq.${encodeURIComponent(sessao.last_flush_at)}`, {
		last_flush_at: new Date(agora).toISOString(),
		flushing_since: new Date(agora).toISOString()
	});
	if (!reivindicada) return FLUSH_OCUPADO;
	try {
		return await comEstadoParaEscrita(cfg, userId, async (ctx) => {
			const resultado = await simularSessao(cfg, userId, sessao, ctx.estado, ctx.pokeIdsNoLoad, ctx.playerUpdatedAt, {
				agora,
				segundos,
				truncado
			});
			if (!resultado) await devolverEntregas(cfg, ctx.entregas);
			return resultado;
		}, { esperarFlush: false });
	} finally {
		await atualizar(cfg, `game_sessions?id=eq.${sessao.id}`, { flushing_since: null });
	}
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
	const pausado = offline && true;
	const resumo = pausado ? createEmptySummary() : simulateWorldSeconds({
		world,
		gameState: store,
		seconds: segundos,
		stepSeconds: OFFLINE_SIM_STEP_SECONDS,
		stepFn: (w, dt, opts) => stepWorld(w, dt, store, opts)
	});
	const piso = offline && !pausado ? aplicarPiso(store, estado, resumo, agora) : NENHUM_PISO;
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
				await chamarRpc(cfg, "reportar_erro", {
					p_origem: "server",
					p_rota: url.pathname,
					p_mensagem: String(erro)
				}).catch(() => {});
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
	if (url.pathname === "/estado" && req.method === "GET") return comEstadoParaEscrita(cfg, jogador.id, async ({ estado, pokeIdsNoLoad, playerUpdatedAt, entregas }) => {
		if (entregas.length) await gravarEstado(cfg, jogador.id, estado, pokeIdsNoLoad, playerUpdatedAt);
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
