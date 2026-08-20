import assert from 'node:assert/strict';
import {
  OneWorkAccessError,
  validateOneWorkPackIds,
} from '@/lib/onework-access';
import { ALL_PACKS_GRANT } from '@/lib/onework-constants';

async function expectInvalid(
  packIds: string[],
  findActivePackIds: (
    packIds: readonly string[]
  ) => Promise<readonly string[]> = async () => []
) {
  await assert.rejects(
    () => validateOneWorkPackIds(packIds, findActivePackIds),
    (error: unknown) =>
      error instanceof OneWorkAccessError && error.code === 'INVALID_PACKS'
  );
}

async function main() {
  let wildcardLookupCalls = 0;
  assert.deepEqual(
    await validateOneWorkPackIds([` ${ALL_PACKS_GRANT} `], async () => {
      wildcardLookupCalls += 1;
      return [];
    }),
    [ALL_PACKS_GRANT]
  );
  assert.equal(
    wildcardLookupCalls,
    0,
    'wildcard entitlement must not depend on the current catalog contents'
  );

  await expectInvalid([ALL_PACKS_GRANT, 'independent-worker-core-v1']);
  await expectInvalid([]);
  await expectInvalid(['Independent Worker v1']);
  await expectInvalid(['a'.repeat(161)]);

  const requested: string[][] = [];
  assert.deepEqual(
    await validateOneWorkPackIds(
      [
        ' independent-worker-core-v1 ',
        'onework-workbuddy-v1',
        'independent-worker-core-v1',
      ],
      async (packIds) => {
        requested.push([...packIds]);
        return ['independent-worker-core-v1', 'onework-workbuddy-v1'];
      }
    ),
    ['independent-worker-core-v1', 'onework-workbuddy-v1']
  );
  assert.deepEqual(requested, [
    ['independent-worker-core-v1', 'onework-workbuddy-v1'],
  ]);

  await expectInvalid(
    ['independent-worker-core-v1', 'independent-worker-content-v1'],
    async () => ['independent-worker-core-v1']
  );
  await expectInvalid(['independent-worker-core-v1'], async () => []);

  console.log('one-worker-os pack authorization tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
