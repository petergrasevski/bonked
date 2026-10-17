import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { TRACK_TITLES } from '../public/track-title-assets.js';
import { TRACKS } from '../shared/game.js';
import { assetHeaders } from '../server-assets.js';
const root = new URL('../public/', import.meta.url);
test('all race tracks have title artwork and a small preview fallback', async () => {
  assert.deepEqual(
    Object.keys(TRACK_TITLES).sort(),
    Object.keys(TRACKS)
      .filter((id) => id !== 'cafe')
      .sort(),
  );
  for (const id of Object.keys(TRACK_TITLES)) {
    assert.ok((await stat(new URL('track-previews/' + id + '.webp', root))).size < 30000);
  }
  assert.equal(TRACKS.factory.name, 'Skid Mark Industries');
  assert.equal(TRACKS.volcano.name, 'Krakatoa');
  assert.equal(TRACKS.ice.name, 'Frost & Furious');
});
test('three generated titles are compact, transparent PNGs with content-addressed immutable URLs', async () => {
  let total = 0;
  for (const id of ['factory', 'volcano', 'ice']) {
    const url = TRACK_TITLES[id],
      data = await readFile(new URL(url.slice(1), root));
    total += data.length;
    assert.ok(data.length < 100000);
    assert.equal(data.readUInt32BE(0), 0x89504e47);
    assert.equal(data.readUInt32BE(16), 640);
    assert.equal(data.readUInt32BE(20), 320);
    const digest = createHash('sha256').update(data).digest('hex').slice(0, 12);
    assert.ok(url.endsWith('.' + digest + '.png'));
    assert.match(
      assetHeaders('public' + url, data)['Cache-Control'],
      /max-age=31536000, immutable/,
    );
    let alpha = null;
    for (let at = 8; at < data.length;) {
      const n = data.readUInt32BE(at),
        kind = data.toString('ascii', at + 4, at + 8);
      if (kind === 'tRNS') alpha = data.subarray(at + 8, at + 8 + n);
      at += n + 12;
    }
    assert.ok(
      alpha && alpha.some((a) => a === 0) && alpha.some((a) => a > 200),
      'PNG palette must preserve transparent and opaque pixels',
    );
  }
  assert.ok(total < 160000, 'all three new PNGs stay below 160 KB combined');
});
