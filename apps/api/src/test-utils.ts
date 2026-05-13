import { InMemoryGameService } from "./services/game-service";

const testUsers = new Map([
  ["matrix-token-alice", "@alice:example.com"],
  ["matrix-token-bob", "@bob:example.com"],
  ["matrix-token-cara", "@cara:example.com"],
  ["matrix-token-dan", "@dan:example.com"],
  ["matrix-token-erin", "@erin:example.com"],
  ["matrix-token-finn", "@finn:example.com"],
]);

export function createTestDeps() {
  return {
    games: new InMemoryGameService(),
    matrix: {
      async whoami(token: string) {
        const userId = testUsers.get(token);
        if (userId) {
          return { user_id: userId };
        }
        throw new Error("invalid token");
      },
      async profile(userId: string) {
        const localpart = userId.split(":")[0]?.replace(/^@/, "") || userId;
        return {
          displayname: localpart.charAt(0).toUpperCase() + localpart.slice(1),
          avatarUrl: `https://example.com/${encodeURIComponent(localpart)}.png`,
        };
      },
    },
  };
}
