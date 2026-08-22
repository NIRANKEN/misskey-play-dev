// plays/mountain-gacha.is の動作検証。
// - 初期表示にボタンがあること
// - ボタンを押すと結果カードが描画され、必要な要素(山名・写真リンク・地図リンク・投稿ボタン)が揃っていること
// - 「日替わり固定」の乱数ロジックが機能していること（同一条件なら同じ結果、条件を変えれば別の山も出る）

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPlayScript, runPlaySource, findComponent, findAllComponents } from './helpers/play-harness.mjs';
import { readFile } from 'node:fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.join(__dirname, '..', 'plays', 'mountain-gacha.is');

async function clickGachaButton(overrides) {
	const { componentsById, getRootIds } = await runPlayScript(scriptPath, overrides);
	const button = findComponent(componentsById, getRootIds(), c => c.type === 'button');
	assert.ok(button, '初期表示にボタンが見つかりませんでした');
	await button.props.onClick();
	return { componentsById, getRootIds };
}

test('初期表示: ガチャボタンを含むコンテナが描画される', async () => {
	const { componentsById, getRootIds } = await runPlayScript(scriptPath);
	const button = findComponent(componentsById, getRootIds(), c => c.type === 'button');
	assert.ok(button, 'ボタンが見つかりません');
	assert.equal(typeof button.props.onClick, 'function');
});

test('ボタン押下後: 結果に必要な要素が揃っている', async () => {
	const { componentsById, getRootIds } = await clickGachaButton();

	const mfmNodes = findAllComponents(componentsById, getRootIds(), c => c.type === 'mfm');
	const allMfmText = mfmNodes.map(n => n.props.text).join('\n');

	assert.match(allMfmText, /\*\*.+\*\*/, '山名を表す太字テキストが見つかりません');
	assert.match(allMfmText, /https:\/\/maps\.google\.com\/\?q=/, 'Googleマップへのリンクが見つかりません');

	const postFormButton = findComponent(componentsById, getRootIds(), c => c.type === 'postFormButton');
	assert.ok(postFormButton, '「結果を投稿する」ボタン(postFormButton)が見つかりません');
	assert.ok(postFormButton.props.form && typeof postFormButton.props.form.text === 'string' && postFormButton.props.form.text.length > 0);
});

test('日替わり固定: 同じTHIS_ID/USER_ID/日付なら、何度引いても同じ結果になる', async () => {
	const overrides = { thisId: 'fixed_play', userId: 'fixed_user' };

	const first = await clickGachaButton(overrides);
	const firstName = findComponent(first.componentsById, first.getRootIds(), c => c.type === 'mfm').props.text;

	const second = await clickGachaButton(overrides);
	const secondName = findComponent(second.componentsById, second.getRootIds(), c => c.type === 'mfm').props.text;

	assert.equal(firstName, secondName, '同一条件での再実行結果が一致しませんでした');
});

test('mountains配列に登録された全ての山が、シードを変えれば出現しうる（データ健全性チェック）', async () => {
	const script = await readFile(scriptPath, 'utf8');

	// mountains配列の登録件数を把握するため、`name: "..."` の出現数を数える
	// (簡易的なチェック。データの追加/削除に追従して母数が変わる)
	const declaredCount = [...script.matchAll(/\n\t\tname: "/g)].length;
	assert.ok(declaredCount >= 20, `mountains配列は20件以上を想定していますが${declaredCount}件でした`);

	const seenNames = new Set();
	const trials = 400;

	for (let i = 0; i < trials; i++) {
		const { componentsById, getRootIds } = await clickGachaButton({
			thisId: `play_${i}`,
			userId: `user_${i}`,
		});
		const nameNode = findComponent(componentsById, getRootIds(), c => c.type === 'mfm');
		seenNames.add(nameNode.props.text.replace(/\*/g, ''));
	}

	assert.equal(
		seenNames.size,
		declaredCount,
		`${trials}回試行して${seenNames.size}/${declaredCount}座しか出現しませんでした（未出現: 乱数ロジックかデータに偏り・不備がある可能性）`,
	);
});

test('構文エラーになる壊れたスクリプトは失敗として検出できる（ハーネス自体の健全性チェック）', async () => {
	await assert.rejects(() => runPlaySource('/// @ 1.0.0\nlet x = ('));
});
