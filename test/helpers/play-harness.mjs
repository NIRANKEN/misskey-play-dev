// Misskey Play (AiScript) スクリプトをNodeだけで検証するための共通テストハーネス。
//
// Misskey本体（packages/frontend/src/aiscript/ui.ts, api.ts）が提供する
// Ui:C:* / Mk:* ホストAPIと同じシグネチャのスタブを用意し、
// @syuilo/aiscript の Parser / Interpreter で実際にスクリプトを解析・実行する。
// これにより「構文が正しいか」だけでなく「ボタンを押した後の描画結果」まで
// 実行ベースで検証できる。

import { readFile } from 'node:fs/promises';
import { Parser, Interpreter, values, utils } from '@syuilo/aiscript';

/**
 * Ui:C:* / Mk:* のスタブ環境を1セット作る。
 * @param {object} overrides THIS_ID / USER_ID などを差し替えたい場合に指定する
 */
export function createStubEnv(overrides = {}) {
	const componentsById = new Map();
	let lastRenderRootIds = [];

	const toJs = (v) => (v === undefined ? undefined : utils.valToJs(v));

	function makeComponentInstance(type, def, id, call) {
		utils.assertObject(def);
		const _id = id ? id.value : `auto_${componentsById.size}`;
		const props = {};
		for (const [k, v] of def.value) {
			props[k] = utils.isFunction(v)
				? async (...args) => await call(v, args.map(a => utils.jsToVal(a)))
				: toJs(v);
		}
		componentsById.set(_id, { type, props });
		return values.OBJ(new Map([
			['id', values.STR(_id)],
			['update', values.FN_NATIVE(([updateDef]) => {
				utils.assertObject(updateDef);
				for (const [k, v] of updateDef.value) {
					props[k] = utils.isFunction(v) ? props[k] : toJs(v);
				}
				return values.NULL;
			})],
		]));
	}

	const uiC = (type) => values.FN_NATIVE(([def, id], opts) => makeComponentInstance(type, def, id, opts.topCall));

	const thisId = overrides.thisId ?? 'test_play_id';
	const thisUrl = overrides.thisUrl ?? `https://example.test/play/${thisId}`;

	const env = {
		THIS_ID: values.STR(thisId),
		THIS_URL: values.STR(thisUrl),
		USER_ID: values.STR(overrides.userId ?? 'test_user_id'),
		USER_NAME: values.STR(overrides.userName ?? 'テストユーザー'),
		USER_USERNAME: values.STR(overrides.userUsername ?? 'testuser'),
		LOCALE: values.STR('ja-JP'),
		SERVER_URL: values.STR('https://example.test'),

		'Mk:dialog': values.FN_NATIVE(async () => values.NULL),
		'Mk:confirm': values.FN_NATIVE(async () => values.TRUE),
		'Mk:toast': values.FN_NATIVE(() => values.NULL),
		'Mk:api': values.FN_NATIVE(async () => values.NULL),
		'Mk:save': values.FN_NATIVE(() => values.NULL),
		'Mk:load': values.FN_NATIVE(() => values.NULL),
		'Mk:remove': values.FN_NATIVE(() => values.NULL),
		'Mk:url': values.FN_NATIVE(() => values.STR(thisUrl)),

		'Ui:render': values.FN_NATIVE(([children]) => {
			utils.assertArray(children);
			lastRenderRootIds = children.value.map(v => {
				utils.assertObject(v);
				const id = v.value.get('id');
				utils.assertString(id);
				return id.value;
			});
			return values.NULL;
		}),
		'Ui:get': values.FN_NATIVE(([id]) => {
			utils.assertString(id);
			return componentsById.has(id.value) ? values.OBJ(new Map([['id', values.STR(id.value)]])) : values.NULL;
		}),
		'Ui:C:container': uiC('container'),
		'Ui:C:text': uiC('text'),
		'Ui:C:mfm': uiC('mfm'),
		'Ui:C:button': uiC('button'),
		'Ui:C:buttons': uiC('buttons'),
		'Ui:C:switch': uiC('switch'),
		'Ui:C:textarea': uiC('textarea'),
		'Ui:C:textInput': uiC('textInput'),
		'Ui:C:numberInput': uiC('numberInput'),
		'Ui:C:select': uiC('select'),
		'Ui:C:folder': uiC('folder'),
		'Ui:C:postFormButton': uiC('postFormButton'),
		'Ui:C:postForm': uiC('postForm'),
	};

	return {
		env,
		componentsById,
		getRootIds: () => lastRenderRootIds,
	};
}

/** componentsById と ルートID配列 から、条件に合う最初のコンポーネントを深さ優先で探す */
export function findComponent(componentsById, rootIds, predicate) {
	for (const id of rootIds) {
		const c = componentsById.get(id);
		if (!c) continue;
		if (predicate(c)) return c;
		if (Array.isArray(c.props.children)) {
			const childIds = c.props.children.map(ch => (ch && typeof ch === 'object') ? ch.id : ch);
			const found = findComponent(componentsById, childIds, predicate);
			if (found) return found;
		}
	}
	return null;
}

/** 条件に合うコンポーネントを深さ優先ですべて集める */
export function findAllComponents(componentsById, rootIds, predicate, acc = []) {
	for (const id of rootIds) {
		const c = componentsById.get(id);
		if (!c) continue;
		if (predicate(c)) acc.push(c);
		if (Array.isArray(c.props.children)) {
			const childIds = c.props.children.map(ch => (ch && typeof ch === 'object') ? ch.id : ch);
			findAllComponents(componentsById, childIds, predicate, acc);
		}
	}
	return acc;
}

/** .is ファイルを読み込み、パース＋実行(トップレベル文の評価)までを行う */
export async function runPlayScript(scriptPath, overrides = {}) {
	const script = await readFile(scriptPath, 'utf8');
	return runPlaySource(script, overrides);
}

/** スクリプト文字列を直接パース＋実行する */
export async function runPlaySource(script, overrides = {}) {
	const parser = new Parser();
	const ast = parser.parse(script); // 構文エラーがあればここで例外
	const { env, componentsById, getRootIds } = createStubEnv(overrides);
	const interpreter = new Interpreter(env, {
		in: async () => '',
		out: () => {},
		log: () => {},
	});
	await interpreter.exec(ast); // 実行時エラーがあればここで例外
	return { componentsById, getRootIds };
}
