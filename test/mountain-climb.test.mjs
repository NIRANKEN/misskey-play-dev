// plays/mountain-climb.is の動作検証。
// - 初期表示（登りフェーズ・5ボタン）が正しいこと
// - 「登山をしない」を選ぶとハッピーエンド（観光日和）に即遷移すること
// - 安全なルートだけを選べば、登頂成功→下山完了まで決定論的にクリアできること
//   （バランス上、「登る」「慎重に進む」系の単独スパムでは理論上力尽きない設計になっている）
// - Mk:save / Mk:load による「1日1回」ロックが機能すること
// - 統計的に発生しうるエンド（力尽きた／夢オチ／クマと冬眠／温泉・山小屋バイト）が
//   十分な試行回数の中で実際に出現すること

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

/** savedState.phase が 'end' になるまで、指定キーワードを含むボタンをクリックし続ける。
 *  「下山を始める」ボタンが出た場合は優先してクリックする（フェーズ遷移のため）。 */
async function autoPlay(keyword, overrides = {}, maxSteps = 20) {
	const { componentsById, getRootIds, mkStore } = await runPlayScript(scriptPath, overrides);
	for (let i = 0; i < maxSteps; i++) {
		const saved = mkStore.get('mc_state');
		if (saved && saved.phase === 'end') break;
		const summitBtn = findButtonByKeyword(componentsById, getRootIds, '下山を始める');
		const btn = summitBtn ?? findButtonByKeyword(componentsById, getRootIds, keyword);
		if (!btn) break;
		await btn.props.onClick();
	}
	return { componentsById, getRootIds, saved: mkStore.get('mc_state') };
}

/** 登り→登頂成功後は下山フェーズでもキーワードを切り替えられる版（onsen/lodge検証用）。 */
async function autoPlayPhased(keywordForPhase, overrides = {}, maxSteps = 20) {
	const { componentsById, getRootIds, mkStore } = await runPlayScript(scriptPath, overrides);
	for (let i = 0; i < maxSteps; i++) {
		const saved = mkStore.get('mc_state');
		if (saved && saved.phase === 'end') break;
		const summitBtn = findButtonByKeyword(componentsById, getRootIds, '下山を始める');
		if (summitBtn) {
			await summitBtn.props.onClick();
			continue;
		}
		const phase = saved ? saved.phase : 'climb';
		const keyword = keywordForPhase(phase);
		const btn = findButtonByKeyword(componentsById, getRootIds, keyword);
		if (!btn) break;
		await btn.props.onClick();
	}
	return { componentsById, getRootIds, saved: mkStore.get('mc_state') };
}

test('初期表示: 登りフェーズの5ボタン（登る/慎重に進む/走って登る/休憩/登山をしない）と体力・現在地が表示される', async () => {
	const { componentsById, getRootIds } = await runPlayScript(scriptPath);

	assert.ok(findButtonByKeyword(componentsById, getRootIds, '登る'), '「登る」ボタンが見つかりません');
	assert.ok(findButtonByKeyword(componentsById, getRootIds, '慎重に進む'), '「慎重に進む」ボタンが見つかりません');
	assert.ok(findButtonByKeyword(componentsById, getRootIds, '走って登る'), '「走って登る」ボタンが見つかりません');
	assert.ok(findButtonByKeyword(componentsById, getRootIds, '休憩'), '「休憩」ボタンが見つかりません');
	assert.ok(findButtonByKeyword(componentsById, getRootIds, '登山をしない'), '「登山をしない」ボタンが見つかりません');

	const texts = findAllComponents(componentsById, getRootIds(), c => c.type === 'text').map(c => c.props.text).join('\n');
	assert.match(texts, /体力: 100 \/ 100/, '初期体力の表示が見つかりません');
	assert.match(texts, /現在地: 0 \/ 100/, '初期進捗の表示が見つかりません');
});

test('「登山をしない」を選ぶと、失敗ではなくハッピーエンド（観光日和）に即座に遷移する', async () => {
	const { componentsById, getRootIds } = await runPlayScript(scriptPath);
	const skipBtn = findButtonByKeyword(componentsById, getRootIds, '登山をしない');
	await skipBtn.props.onClick();

	const mfmNodes = findAllComponents(componentsById, getRootIds(), c => c.type === 'mfm');
	const allMfmText = mfmNodes.map(n => n.props.text).join('\n');
	assert.match(allMfmText, /観光日和/, '観光日和エンドのMFM演出が見つかりません');

	const postFormButton = findComponent(componentsById, getRootIds(), c => c.type === 'postFormButton');
	assert.ok(postFormButton, '結果投稿ボタンが見つかりません');
	assert.match(postFormButton.props.form.text, /のんびり観光/, '観光日和エンドの共有文が見つかりません');
});

test('2回目の「登山をしない」ボタンは初回選択画面にのみ存在する（1手進めると消える）', async () => {
	const { componentsById, getRootIds } = await runPlayScript(scriptPath);
	const normalBtn = findButtonByKeyword(componentsById, getRootIds, '登る');
	await normalBtn.props.onClick();

	assert.equal(
		findButtonByKeyword(componentsById, getRootIds, '登山をしない'),
		undefined,
		'1手進めた後も「登山をしない」ボタンが残っています',
	);
});

test('安全ルート（登る→慎重に下山）だけを選べば、登頂成功→下山完了まで決定論的にクリアできる', async () => {
	const { componentsById, getRootIds, saved } = await autoPlayPhased(
		(phase) => (phase === 'descend' ? '慎重に' : '登る'),
		{},
		10,
	);

	assert.equal(saved && saved.ending, 'summit_descend', `安全ルートなのに想定外のエンドになりました: ${saved && saved.ending}`);

	const mfmNodes = findAllComponents(componentsById, getRootIds(), c => c.type === 'mfm');
	const allMfmText = mfmNodes.map(n => n.props.text).join('\n');
	assert.match(allMfmText, /下山完了/, '下山完了のMFM演出が見つかりません');
	assert.match(allMfmText, /sparkle/, 'sparkleエフェクトが見つかりません');
	assert.match(allMfmText, /x2/, '拡大(x2)エフェクトが見つかりません');

	const postFormButton = findComponent(componentsById, getRootIds(), c => c.type === 'postFormButton');
	assert.ok(postFormButton, '結果投稿ボタンが見つかりません');
	assert.match(postFormButton.props.form.text, /下山完了/, '下山完了エンドの共有文が見つかりません');
});

test('登頂成功時には、下山開始前に登頂成功のMFM演出（tada）が表示される', async () => {
	const { componentsById, getRootIds } = await runPlayScript(scriptPath);
	let mfmText = '';
	for (let i = 0; i < 10; i++) {
		const summitBtn = findButtonByKeyword(componentsById, getRootIds, '下山を始める');
		if (summitBtn) {
			const mfmNodes = findAllComponents(componentsById, getRootIds(), c => c.type === 'mfm');
			mfmText = mfmNodes.map(n => n.props.text).join('\n');
			break;
		}
		const btn = findButtonByKeyword(componentsById, getRootIds, '登る');
		await btn.props.onClick();
	}
	assert.match(mfmText, /tada/, '登頂成功のtadaエフェクトが見つかりません');
	assert.match(mfmText, /登頂成功/, '登頂成功のテキストが見つかりません');
});

test('1日1回ロック: 当日分の結果が保存済みなら、再訪時に同じ結果画面がそのまま表示される', async () => {
	const mkStore = new Map();
	mkStore.set('mc_state', {
		date: todayStr(),
		stamina: 42,
		progress: 100,
		progress2: 60,
		phase: 'end',
		turn: 4,
		restStreak: 0,
		ending: 'summit_descend',
		logText: '既存のログ',
	});

	const { componentsById, getRootIds } = await runPlayScript(scriptPath, { mkStore });

	// 登りフェーズのボタンは出ず、結果画面がそのまま表示される
	assert.equal(findButtonByKeyword(componentsById, getRootIds, '登る'), undefined, '当日結果が確定済みなのに登りフェーズが表示されています');
	const postFormButton = findComponent(componentsById, getRootIds(), c => c.type === 'postFormButton');
	assert.ok(postFormButton, '確定済み結果の投稿ボタンが見つかりません');
	assert.match(postFormButton.props.form.text, /下山完了/, '保存されていたエンド内容が再現されていません');
});

test('1日1回ロック: 保存日付が今日と異なれば、新規プレイ（登りフェーズ・初期状態）から始まる', async () => {
	const mkStore = new Map();
	mkStore.set('mc_state', {
		date: '2000-1-1',
		stamina: 1,
		progress: 99,
		progress2: 0,
		phase: 'end',
		turn: 9,
		restStreak: 0,
		ending: 'exhausted_climb',
		logText: '昨日のログ',
	});

	const { componentsById, getRootIds } = await runPlayScript(scriptPath, { mkStore });

	assert.ok(findButtonByKeyword(componentsById, getRootIds, '登山をしない'), '日付が変わったのに新規プレイ（初回画面）になっていません');
	const texts = findAllComponents(componentsById, getRootIds(), c => c.type === 'text').map(c => c.props.text).join('\n');
	assert.match(texts, /体力: 100 \/ 100/, '日付が変わったのに体力が引き継がれています');
});

test('persist: 行動するたびに Mk:save で当日の進行状況が保存される', async () => {
	const mkStore = new Map();
	const { componentsById, getRootIds } = await runPlayScript(scriptPath, { mkStore });
	const btn = findButtonByKeyword(componentsById, getRootIds, '登る');
	await btn.props.onClick();

	const saved = mkStore.get('mc_state');
	assert.ok(saved, 'Mk:saveで保存された状態が見つかりません');
	assert.equal(saved.date, todayStr());
	assert.equal(saved.phase, 'climb');
	assert.equal(saved.turn, 1);
});

test('統計: 「走って登る」を連打すると、力尽きる／夢オチ／UFO遭遇／登頂成功が十分な試行の中で実際に出現する', async () => {
	const seenEndings = new Set();
	const trials = 150;

	for (let i = 0; i < trials; i++) {
		const { saved } = await autoPlay('走って', { thisId: `climb_run_${i}`, userId: `user_run_${i}` }, 12);
		if (saved && saved.ending) seenEndings.add(saved.ending);
	}

	assert.ok(seenEndings.has('exhausted_climb'), `${trials}回試行しても「力尽きた（登り）」が出現しませんでした`);
	assert.ok(seenEndings.has('dream'), `${trials}回試行しても「夢オチ」が出現しませんでした`);
	assert.ok(seenEndings.has('ufo'), `${trials}回試行しても「UFOと遭遇」が出現しませんでした`);
	assert.ok(seenEndings.has('summit_descend'), `${trials}回試行しても「登頂成功→下山完了」が出現しませんでした`);
});

test('統計: 「慎重に進む」を連打すると、クマと冬眠／天狗に山伏修行／登頂成功が十分な試行の中で実際に出現する', async () => {
	const seenEndings = new Set();
	const trials = 150;

	for (let i = 0; i < trials; i++) {
		const { saved } = await autoPlay('慎重に', { thisId: `climb_careful_${i}`, userId: `user_careful_${i}` }, 25);
		if (saved && saved.ending) seenEndings.add(saved.ending);
	}

	assert.ok(seenEndings.has('bear'), `${trials}回試行しても「クマと冬眠」が出現しませんでした`);
	assert.ok(seenEndings.has('tengu'), `${trials}回試行しても「天狗に山伏修行」が出現しませんでした`);
	assert.ok(seenEndings.has('summit_descend'), `${trials}回試行しても「登頂成功→下山完了」が出現しませんでした`);
});

test('統計: 登り中に「休憩」を連打すると、山ガチャとの運命の再会／野鳥観察のネタエンドが十分な試行の中で実際に出現する', async () => {
	const seenEndings = new Set();
	const trials = 60;

	for (let i = 0; i < trials; i++) {
		const { saved } = await autoPlay('休憩', { thisId: `climb_rest_${i}`, userId: `user_climb_rest_${i}` }, 40);
		if (saved && saved.ending) seenEndings.add(saved.ending);
	}

	assert.ok(seenEndings.has('gacha_reunion'), `${trials}回試行しても「山ガチャとの運命の再会」が出現しませんでした`);
	assert.ok(seenEndings.has('bird_watching'), `${trials}回試行しても「野鳥観察に夢中」が出現しませんでした`);
});

test('統計: 安全に登頂後「走って下山」を連打すると、駅伝スカウト／SNSでバズる／下山完了が十分な試行の中で実際に出現する', async () => {
	const seenEndings = new Set();
	const trials = 200;

	for (let i = 0; i < trials; i++) {
		const { saved } = await autoPlayPhased(
			(phase) => (phase === 'descend' ? '走って' : '登る'),
			{ thisId: `descend_run_${i}`, userId: `user_descend_run_${i}` },
			20,
		);
		if (saved && saved.ending) seenEndings.add(saved.ending);
	}

	assert.ok(seenEndings.has('ekiden_scout'), `${trials}回試行しても「駅伝スカウト」が出現しませんでした`);
	assert.ok(seenEndings.has('sns_addiction'), `${trials}回試行しても「SNSでバズる」が出現しませんでした`);
	assert.ok(seenEndings.has('summit_descend'), `${trials}回試行しても「登頂成功→下山完了」が出現しませんでした`);
});

test('統計: 下山中に「休憩」を連打すると、温泉／山小屋バイトのネタエンドに必ず行き着く（両方が出現する）', async () => {
	const seenEndings = new Set();
	const trials = 40;

	for (let i = 0; i < trials; i++) {
		const { saved } = await autoPlayPhased(
			(phase) => (phase === 'descend' ? '休憩' : '登る'),
			{ thisId: `rest_${i}`, userId: `user_rest_${i}` },
			20,
		);
		assert.ok(saved && saved.ending, `${i}回目の試行がエンドに到達しませんでした`);
		assert.ok(
			saved.ending === 'onsen' || saved.ending === 'lodge',
			`下山中の休憩連打なのに想定外のエンドになりました: ${saved.ending}`,
		);
		seenEndings.add(saved.ending);
	}

	assert.ok(seenEndings.has('onsen'), `${trials}回試行しても「温泉から出られない」が出現しませんでした`);
	assert.ok(seenEndings.has('lodge'), `${trials}回試行しても「山小屋バイトにハマる」が出現しませんでした`);
});
