import assert from 'node:assert/strict';
import test from 'node:test';
import { createShape } from '../src/components/own-whiteboard/core/model';
import {
  arrangeGeneratedResults,
  isTextMaterial,
  textMaterialProps,
  nearestVideo,
  MATERIAL_TEXT_LIMIT,
} from '../src/components/own-whiteboard/core/materials';

test('text/code material is recognized without treating binary documents as text', () => {
  assert.equal(isTextMaterial({ name: 'guide.MD', type: '' }), true);
  assert.equal(
    isTextMaterial({ name: 'data.json', type: 'application/json' }),
    true
  );
  assert.equal(isTextMaterial({ name: 'notes', type: 'text/plain' }), true);
  assert.equal(
    isTextMaterial({ name: 'book.pdf', type: 'application/pdf' }),
    false
  );
  const result = textMaterialProps('app.html', '<script>throw 1</script>');
  assert.equal(result.text, '<script>throw 1</script>');
  assert.equal('html' in result, false);
  assert.throws(() => textMaterialProps('binary.txt', 'a\0b'), /二进制/);
  assert.equal(
    textMaterialProps('long.txt', 'a'.repeat(MATERIAL_TEXT_LIMIT + 1))
      .sourceTruncated,
    true
  );
});

test('video analysis selects nearest edge within threshold, ignores other cards and distant media', () => {
  const analyzer = createShape('ai_video_analyzer', 0, 0);
  analyzer.w = 100;
  analyzer.h = 100;
  const far = createShape('video_player', 221, 0);
  const near = createShape('video_player', 220, 0);
  const image = createShape('image', 0, 0);
  assert.equal(nearestVideo(analyzer, [far, image]), undefined);
  assert.equal(nearestVideo(analyzer, [far, near, image])?.id, near.id);
  const closest = createShape('video', 120, 0);
  assert.equal(nearestVideo(analyzer, [near, closest])?.id, closest.id);
});

test('generated results use final expanded heights and leave source material in place', () => {
  const source = createShape('note', 0, 0);
  const longText = createShape('text', 300, 100);
  longText.h = 684;
  const nextCard = createShape('note', 300, 184);
  const placed = arrangeGeneratedResults(
    [source, longText, nextCard],
    [longText.id, nextCard.id]
  );
  assert.equal(placed[0], source);
  assert.equal(placed[1].y, 100);
  assert.equal(placed[2].y, 808);
  assert.equal(nextCard.y, 184);
});
