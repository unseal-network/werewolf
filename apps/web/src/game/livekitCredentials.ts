export interface LivekitCredentials {
  token: string;
  serverUrl: string;
  room?: string;
  identity?: string;
  canPublish?: boolean;
}

const credentialCache = new Map<string, Promise<LivekitCredentials>>();

export function getStableLivekitCredentials(
  key: string,
  fetcher: () => Promise<LivekitCredentials>
): Promise<LivekitCredentials> {
  const cached = credentialCache.get(key);
  if (cached) return cached;

  const pending = fetcher().catch((error) => {
    if (credentialCache.get(key) === pending) {
      credentialCache.delete(key);
    }
    throw error;
  });
  credentialCache.set(key, pending);
  return pending;
}

export function clearLivekitCredentialCacheForTests(): void {
  credentialCache.clear();
}
