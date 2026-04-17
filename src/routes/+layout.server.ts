import type { LayoutServerLoad } from './$types.js';

let migrated = false;

export const load: LayoutServerLoad = async ({ cookies }) => {
  try {
    if (!migrated) {
      const { runMigrations } = await import('$server/db/migrate.js');
      runMigrations();
      migrated = true;
    }

    const userId = cookies.get('spent_uid');
    if (!userId) return { connected: false, email: null, lastSyncAt: null };

    const { getToken } = await import('$server/db/repo/oauthTokens.js');
    const { getSyncState } = await import('$server/db/repo/syncState.js');
    const { seedDefaultFilters } = await import('$server/db/repo/senderFilters.js');

    const token = getToken(userId);
    if (!token) return { connected: false, email: null, lastSyncAt: null };

    // Ensure default sender filters exist for this user (no-op if already seeded)
    seedDefaultFilters(userId);

    const syncState = getSyncState(userId);
    return {
      connected: true,
      email: token.email,
      lastSyncAt: syncState?.lastSyncAt ?? null,
    };
  } catch {
    return { connected: false, email: null, lastSyncAt: null };
  }
};
