import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

// Derived from shipped client content, so Fly builds need no Git metadata.
export async function clientRevision(root) {
  const hash = createHash('sha256');
  async function visit(relative) {
    for (const entry of (await readdir(path.join(root, relative), { withFileTypes: true })).sort(
      (a, b) => a.name.localeCompare(b.name),
    )) {
      const filename = path.join(relative, entry.name);
      if (entry.isDirectory()) await visit(filename);
      else if (entry.isFile()) {
        hash.update(filename);
        hash.update('\0');
        hash.update(await readFile(path.join(root, filename)));
        hash.update('\0');
      }
    }
  }
  await visit('public');
  await visit('shared');
  for (const filename of [
    'build/three.module.js',
    'build/three.core.js',
    'examples/jsm/utils/BufferGeometryUtils.js',
    'examples/jsm/geometries/RoundedBoxGeometry.js',
  ]) {
    hash.update(filename);
    hash.update(await readFile(path.join(root, 'node_modules/three', filename)));
  }
  return hash.digest('hex');
}

export function assetHeaders(filename, data) {
  return {
    // Weak validators remain valid when Fly compresses the representation.
    ETag: `W/"${createHash('sha256').update(data).digest('hex')}"`,
    'Cache-Control': /^public\/track-titles\/[a-z]+\.[a-f0-9]{12}\.(?:webp|png)$/.test(filename)
      ? 'public, max-age=31536000, immutable'
      : 'public, no-cache',
  };
}
export function matchesETag(header, etag) {
  return (
    typeof header === 'string' &&
    header
      .split(',')
      .some(
        (value) =>
          value.trim() === '*' || value.trim().replace(/^W\//, '') === etag.replace(/^W\//, ''),
      )
  );
}
