import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  draftFromReply,
  parseTreeDraftRequest,
} from '../src/lib/ai/tree-lesson-draft';
import {
  treeLessonFrameSrc,
  parseTreeSettings,
} from '../src/lib/tree-lesson-settings';
test('drafts are data, constrained to a runnable equal-distance road', () => {
  const base = { road: 20, spacing: 5 };
  assert.deepEqual(
    parseTreeDraftRequest({ instruction: '  改为30米  ', base }),
    { instruction: '改为30米', base }
  );
  assert.equal(parseTreeDraftRequest({ instruction: '', base }), null);
  assert.equal(
    parseTreeDraftRequest({ instruction: 'a'.repeat(801), base }),
    null
  );
  assert.deepEqual(draftFromReply('{"road":30,"spacing":5}'), {
    road: 30,
    spacing: 5,
  });
  assert.equal(
    treeLessonFrameSrc({ road: 30, spacing: 5 }),
    '/courseware/zhi-shu/index.html#road=30&spacing=5'
  );
  for (const unsafe of [
    { road: 21, spacing: 5 },
    { road: 100, spacing: 1 },
    { road: 0, spacing: 0 },
    { road: 30, spacing: 5, url: 'other' },
    { road: '30', spacing: 5 },
    { unsupported: true },
  ]) {
    assert.equal(parseTreeSettings(unsafe), null);
    assert.equal(draftFromReply(JSON.stringify(unsafe)), null);
  }
  assert.equal(draftFromReply('<html></html>'), null);
});
