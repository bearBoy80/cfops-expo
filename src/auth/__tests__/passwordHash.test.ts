import { derivePasswordHash } from '../passwordHash';

test('derives the existing persisted scrypt hash asynchronously', async () => {
  await expect(
    derivePasswordHash('hunter2secret', 'ab'.repeat(16)),
  ).resolves.toBe(
    '82a32df0a7b7133ed1ec35f9cecbe1422070cbbf835bfbda77dcc780c605d9d2',
  );
});
