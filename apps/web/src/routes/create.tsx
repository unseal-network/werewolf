import { useMemo, useState } from "react";
import { createApiClient } from "../api/client";

export function CreateGamePage() {
  const [title, setTitle] = useState("狼人杀");
  const [sourceMatrixRoomId, setSourceMatrixRoomId] =
    useState("!room:example.com");
  const [targetPlayerCount, setTargetPlayerCount] = useState(6);
  const [matrixToken, setMatrixToken] = useState(
    localStorage.getItem("matrixToken") ?? "matrix-token-alice"
  );
  const [createdUrl, setCreatedUrl] = useState("");
  const [error, setError] = useState("");

  const client = useMemo(
    () =>
      createApiClient({
        baseUrl: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000",
        getMatrixToken: () => matrixToken,
      }),
    [matrixToken]
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    localStorage.setItem("matrixToken", matrixToken);

    try {
      const result = await client.createGame({
        sourceMatrixRoomId,
        title,
        targetPlayerCount,
        timing: { nightActionSeconds: 45, speechSeconds: 60, voteSeconds: 30 },
        allowedSourceMatrixRoomIds: [],
      });
      setCreatedUrl(
        result.card.webUrl ?? `${window.location.pathname}?gameRoomId=${result.gameRoomId}`
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  return (
    <section style={{ margin: "0 auto", maxWidth: 920, padding: 24 }}>
      <form
        onSubmit={submit}
        style={{
          display: "grid",
          gap: 16,
          maxWidth: 560,
        }}
      >
        <h1 style={{ fontSize: 40, margin: "24px 0 8px" }}>Werewolf</h1>
        <label style={{ display: "grid", gap: 6 }}>
          Matrix Token
          <input value={matrixToken} onChange={(event) => setMatrixToken(event.target.value)} />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          Title
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          Source Matrix Room
          <input value={sourceMatrixRoomId} onChange={(event) => setSourceMatrixRoomId(event.target.value)} />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          Players
          <input
            type="number"
            min={6}
            max={12}
            value={targetPlayerCount}
            onChange={(event) => setTargetPlayerCount(Number(event.target.value))}
          />
        </label>
        <button type="submit">Create Game</button>
        {createdUrl ? (
          <a href={createdUrl} style={{ color: "#86d7ff" }}>
            Open game room
          </a>
        ) : null}
        {error ? <p style={{ color: "#ffb4a9" }}>{error}</p> : null}
      </form>
    </section>
  );
}
