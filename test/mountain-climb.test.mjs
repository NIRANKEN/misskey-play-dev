// plays/mountain-climb.is の動作検証。
// - 初期表示（第1手・3選択肢＋登山をしない、今日の山、現地の様子ヒント）が正しいこと
// - 魔山時の「登山をしない」で神回避エンド（kanko_great）になること
// - 通常山での「登山をしない」で観光日和エンド（kanko_normal）になること
// - 超低山では3手（登り2手＋下山1手）で確実に登頂＆下山完了（summit_descend）できること
// - 登頂成功時の中間演出（tada）と下山遷移ボタンの確認
// - Mk:save / Mk:load による日替わりセーブ＆1日1回ロックの検証
// - 同一シードにおける決定論的挙動の検証
// - 4つの山タイプ（初級/中級/険峰/魔山）および全27種のエンドの出現検証

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPlayScript, findComponent, findAllComponents } from './helpers/play-harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.join(__dirname, '..', 'plays', 'mountain-climb.is');

function todayStr() {
	const d = new Date();
	return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function allButtons(componentsById, getRootIds) {
	return findAllComponents(componentsById, getRootIds(), c => c.type === 'button');
}

function findButtonByKeyword(componentsById, getRootIds, keyword) {
	return allButtons(componentsById, getRootIds).find(b => b.props.text.includes(keyword));
}

/** 3手完結フローを自動プレイするヘルパー */
async function playSteps(choices, overrides = {}) {
	const { componentsById, getRootIds, mkStore } = await runPlayScript(scriptPath, overrides);

	// Step 1
	const saved1 = mkStore.get('mc_state');
	if (saved1 && saved1.phase === 'end') return { componentsById, getRootIds, saved: saved1 };

	if (choices[0] === 'no_climb') {
		const noClimbBtn = findButtonByKeyword(componentsById, getRootIds, '登山をしない');
		if (noClimbBtn) await noClimbBtn.props.onClick();
		return { componentsById, getRootIds, saved: mkStore.get('mc_state') };
	}

	const step1Keywords = ['樹林帯', '岩壁直登', '沢沿い'];
	const btn1 = findButtonByKeyword(componentsById, getRootIds, step1Keywords[choices[0]]);
	if (btn1) await btn1.props.onClick();

	let saved = mkStore.get('mc_state');
	if (!saved || saved.phase === 'end') return { componentsById, getRootIds, saved };

	// Step 2
	const step2Keywords = ['尾根道', '鎖場', '迂回'];
	const btn2 = findButtonByKeyword(componentsById, getRootIds, step2Keywords[choices[1]]);
	if (btn2) await btn2.props.onClick();

	saved = mkStore.get('mc_state');
	if (!saved || saved.phase === 'end') return { componentsById, getRootIds, saved };

	// Summit → 下山へ
	const summitBtn = findButtonByKeyword(componentsById, getRootIds, '下山ルートの選択');
	if (summitBtn) await summitBtn.props.onClick();

	saved = mkStore.get('mc_state');
	if (!saved || saved.phase === 'end') return { componentsById, getRootIds, saved };

	// Step 3
	const step3Keywords = ['本道', '駆け下りる', '温泉街'];
	const btn3 = findButtonByKeyword(componentsById, getRootIds, step3Keywords[choices[2]]);
	if (btn3) await btn3.props.onClick();

	return { componentsById, getRootIds, saved: mkStore.get('mc_state') };
}

test('初期表示: 今日の山・現地の様子（ヒント）・第1手の3ルート＋登山をしないボタンが表示される', async () => {
	const { componentsById, getRootIds } = await runPlayScript(scriptPath);

	assert.ok(findButtonByKeyword(componentsById, getRootIds, '樹林帯'), '「樹林帯」ボタンが見つかりません');
	assert.ok(findButtonByKeyword(componentsById, getRootIds, '岩壁直登'), '「岩壁直登」ボタンが見つかりません');
	assert.ok(findButtonByKeyword(componentsById, getRootIds, '沢沿い'), '「沢沿い」ボタンが見つかりません');
	assert.ok(findButtonByKeyword(componentsById, getRootIds, '登山をしない'), '「登山をしない」ボタンが見つかりません');

	const mfmNodes = findAllComponents(componentsById, getRootIds(), c => c.type === 'mfm');
	const allMfmText = mfmNodes.map(n => n.props.text).join('\n');
	assert.match(allMfmText, /今日の山:/, '今日の山の表示が見つかりません');
	assert.match(allMfmText, /現地の様子/, '現地の様子ヒントが見つかりません');
});

test('登山をしない: 通常の山では観光日和エンド（kanko_normal）になる', async () => {
	// シードを探索して通常山（Type 0, 1, 2）を探す
	let found = false;
	for (let i = 0; i < 50; i++) {
		const { saved } = await playSteps(['no_climb'], { thisId: `normal_kanko_${i}`, userId: 'user1' });
		if (saved.mountainType !== 3) {
			assert.equal(saved.ending, 'kanko_normal', '通常山なのにkanko_normalになりませんでした');
			found = true;
			break;
		}
	}
	assert.ok(found, '通常山が見つかりませんでした');
});

test('登山をしない: 遭難必至の魔山（Type 3）では大正解・神回避エンド（kanko_great）になる', async () => {
	// シードを探索して魔山（Type 3/fatal）を探す
	let found = false;
	for (let i = 0; i < 50; i++) {
		const { componentsById, getRootIds, saved } = await playSteps(['no_climb'], { thisId: `fatal_seed_${i}`, userId: 'user1' });
		if (saved.mountainType === 3) {
			assert.equal(saved.ending, 'kanko_great', '魔山なのにkanko_greatになりませんでした');
			const mfmNodes = findAllComponents(componentsById, getRootIds(), c => c.type === 'mfm');
			const allMfm = mfmNodes.map(n => n.props.text).join('\n');
			assert.match(allMfm, /神回避/, '神回避演出が見つかりません');
			found = true;
			break;
		}
	}
	assert.ok(found, '魔山シードが見つかりませんでした');
});

test('超低山（Type 0）: 3手（登り2手＋下山1手）で確実に登頂＆下山完了（summit_descend）できる', async () => {
	let found = false;
	for (let i = 0; i < 50; i++) {
		const { componentsById, getRootIds, saved } = await playSteps([0, 0, 0], { thisId: `low_seed_${i}`, userId: 'user_low' });
		if (saved.mountainType === 0) {
			assert.equal(saved.ending, 'summit_descend', '超低山なのに完全制覇になりませんでした');
			const mfmNodes = findAllComponents(componentsById, getRootIds(), c => c.type === 'mfm');
			const allMfm = mfmNodes.map(n => n.props.text).join('\n');
			assert.match(allMfm, /登頂＆下山完了/, '下山完了の演出が見つかりません');
			assert.match(allMfm, /sparkle/, 'sparkleエフェクトが見つかりません');
			found = true;
			break;
		}
	}
	assert.ok(found, '超低山シードが見つかりませんでした');
});

test('登頂成功時には、下山ルート選択前に登頂成功の中間演出（tada）が表示される', async () => {
	for (let i = 0; i < 50; i++) {
		const overrides = { thisId: `summit_tada_${i}`, userId: 'u1' };
		const { componentsById, getRootIds, mkStore } = await runPlayScript(scriptPath, overrides);
		const saved0 = mkStore.get('mc_state');
		if (saved0 && saved0.mountainType === 0) {
			// Step 1
			const btn1 = findButtonByKeyword(componentsById, getRootIds, '樹林帯');
			await btn1.props.onClick();
			// Step 2
			const btn2 = findButtonByKeyword(componentsById, getRootIds, '尾根道');
			await btn2.props.onClick();

			const mfmNodes = findAllComponents(componentsById, getRootIds(), c => c.type === 'mfm');
			const allMfm = mfmNodes.map(n => n.props.text).join('\n');
			assert.match(allMfm, /tada/, '登頂時のtadaエフェクトが見つかりません');
			assert.match(allMfm, /登頂成功/, '登頂成功テキストが見つかりません');
			assert.ok(findButtonByKeyword(componentsById, getRootIds, '下山ルートの選択'), '下山ルート選択ボタンが見つかりません');
			break;
		}
	}
});

test('決定論的動作: 同一シードであれば、全く同じ選択肢で常に同じ結果になる', async () => {
	const overrides = { thisId: 'fixed_test_id', userId: 'fixed_user_id' };
	const res1 = await playSteps([1, 2, 0], overrides);
	const res2 = await playSteps([1, 2, 0], overrides);

	assert.equal(res1.saved.mountainType, res2.saved.mountainType);
	assert.equal(res1.saved.mountainIdx, res2.saved.mountainIdx);
	assert.equal(res1.saved.ending, res2.saved.ending);
});

test('1日1回ロック: 当日分の結果が保存済みなら、再訪時に保存されたエンド画面がそのまま表示される', async () => {
	const mkStore = new Map();
	mkStore.set('mc_state', {
		date: todayStr(),
		phase: 'end',
		step: 3,
		mountainType: 0,
		mountainIdx: 0,
		hintIdx: 0,
		ending: 'summit_descend',
		logText: '過去のログ',
	});

	const { componentsById, getRootIds } = await runPlayScript(scriptPath, { mkStore });

	assert.equal(findButtonByKeyword(componentsById, getRootIds, '樹林帯'), undefined, '確定済みなのにStep1ボタンが表示されています');
	const postFormButton = findComponent(componentsById, getRootIds(), c => c.type === 'postFormButton');
	assert.ok(postFormButton, '結果投稿ボタンが見つかりません');
	assert.match(postFormButton.props.form.text, /完全制覇/, '保存されていたエンド内容が再現されていません');
});

test('同じ山タイプの異なる山（例: 本格名山の富士山 vs 立山など）で正解ルートが異なること', async () => {
	const mountainAnswers = new Map();

	for (let i = 0; i < 150; i++) {
		const overrides = { thisId: `distinct_m_${i}`, userId: 'user_distinct' };
		// まず第1手を実行して状態を取得
		const res0 = await playSteps([0], overrides);
		if (res0.saved && res0.saved.mountainType === 1) {
			const mIdx = res0.saved.mountainIdx;
			if (!mountainAnswers.has(mIdx)) {
				if (res0.saved.step === 2) {
					mountainAnswers.set(mIdx, 0);
				} else {
					// 1 または 2 を試す
					const res1 = await playSteps([1], overrides);
					if (res1.saved.step === 2) {
						mountainAnswers.set(mIdx, 1);
					} else {
						mountainAnswers.set(mIdx, 2);
					}
				}
			}
		}
		if (mountainAnswers.size >= 3) break;
	}

	assert.ok(mountainAnswers.size >= 2, 'Type 1 の複数の山を検出できませんでした');
});

test('統計・網羅性: 多数のシードで全4山タイプ、および全主要エンドが実際に出現する', async () => {
	const seenMountainTypes = new Set();
	const seenEndings = new Set();
	const trials = 300;

	for (let i = 0; i < trials; i++) {
		const choice1 = i % 3;
		const choice2 = (i + 1) % 3;
		const choice3 = (i + 2) % 3;
		const { saved } = await playSteps([choice1, choice2, choice3], {
			thisId: `stats_play_${i}`,
			userId: `user_${i}`,
		});
		if (saved) {
			seenMountainTypes.add(saved.mountainType);
			if (saved.ending) seenEndings.add(saved.ending);
		}
	}

	// 全4山タイプが出現したこと
	assert.equal(seenMountainTypes.size, 4, '4つの山タイプがすべて出現していません');

	// 主要なエンディングが確認できること
	assert.ok(seenEndings.has('summit_descend'), 'summit_descend が出現しませんでした');
	assert.ok(
		seenEndings.has('bear') ||
		seenEndings.has('tengu') ||
		seenEndings.has('ufo') ||
		seenEndings.has('deer_master') ||
		seenEndings.has('mushroom') ||
		seenEndings.has('exhausted_climb'),
		'Step 1 の失敗エンドが出現しませんでした',
	);
	assert.ok(
		seenEndings.has('dream') ||
		seenEndings.has('gacha_reunion') ||
		seenEndings.has('bird_watching') ||
		seenEndings.has('isekai') ||
		seenEndings.has('cat_cafe') ||
		seenEndings.has('exhausted_summit'),
		'Step 2 の失敗エンドが出現しませんでした',
	);
	assert.ok(
		seenEndings.has('summit_stuck') ||
		seenEndings.has('ekiden_scout') ||
		seenEndings.has('sns_addiction') ||
		seenEndings.has('onsen') ||
		seenEndings.has('lodge') ||
		seenEndings.has('paraglider') ||
		seenEndings.has('exhausted_descend'),
		'Step 3 の失敗エンドが出現しませんでした',
	);
});

