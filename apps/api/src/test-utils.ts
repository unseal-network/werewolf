import { InMemoryGameService } from "./services/game-service";

export function createTestDeps() {
  return {
    games: new InMemoryGameService(),
    matrix: {
      async whoami(token: string) {
        if (token === "matrix-token-alice") {
          return { user_id: "@alice:example.com" };
        }
        throw new Error("invalid token");
      },
    },
  };
}
