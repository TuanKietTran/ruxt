import { expect, test } from 'vitest';
import { checkEnv } from '../../tools/platform/src/secrets.ts';

test('checkEnv reports presence by name only, never values', () => {
  process.env.PLT_TEST_SECRET = 's3cr3t';
  try {
    const result = checkEnv(['PLT_TEST_SECRET', 'PLT_TEST_MISSING'], 'staging');
    expect(result).toEqual([
      { environment: 'staging', name: 'PLT_TEST_SECRET', present: true },
      { environment: 'staging', name: 'PLT_TEST_MISSING', present: false },
    ]);
    for (const row of result) expect(row).not.toHaveProperty('value');
  } finally {
    delete process.env.PLT_TEST_SECRET;
  }
});
