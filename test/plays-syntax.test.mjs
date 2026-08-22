// plays/ 配下の全 .is ファイルについて、最低限の構文検証を行う。
// 新しいPlayスクリプトを追加した際、このテストが自動的に対象に含める。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Parser } from '@syuilo/aiscript';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const playsDir = path.join(__dirname, '..', 'plays');

const files = (await readdir(playsDir)).filter(f => f.endsWith('.is'));

test('plays/ ディレクトリに最低1つは .is ファイルがある', () => {
	assert.ok(files.length > 0, 'plays/*.is が見つかりません');
});

for (const file of files) {
	test(`${file}: バージョンプラグマがあり、構文エラーなくパースできる`, async () => {
		const script = await readFile(path.join(playsDir, file), 'utf8');
		assert.match(script, /^\/\/\/ @ \d+\.\d+\.\d+/, 'スクリプトの先頭にバージョンプラグマ (/// @ x.y.z) がありません');

		const parser = new Parser();
		assert.doesNotThrow(() => parser.parse(script));
	});
}
