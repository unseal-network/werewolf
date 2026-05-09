import { useEffect, useMemo, useState } from "react";
import { createApiClient, type JoinedPlayer } from "../api/client";
import { GameTable } from "../components/GameTable";
import { PrivatePanel } from "../components/PrivatePanel";
import { WaitingRoom } from "../components/WaitingRoom";

export function GameRoomPage({ gameRoomId }: { gameRoomId: string }) {
  const [matrixToken, setMatrixToken] = useState(
    localStorage.getItem("matrixToken") ?? "matrix-token-alice"
  );
  const [players, setPlayers] = useState<JoinedPlayer["player"][]>([]);
  const [status, setStatus] = useState("waiting");
  const [events, setEvents] = useState<string[]>([]);
  const [error, setError] = useState("");

  const client = useMemo(
    () =>
      createApiClient({
        baseUrl: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000",
        getMatrixToken: () => matrixToken,
      }),
    [matrixToken]
  );

  useEffect(() => {
    const source = new EventSource(client.subscribeUrl(gameRoomId));
    source.onmessage = (event) => {
      setEvents((existing) => [event.data, ...existing].slice(0, 20));
    };
    return () => source.close();
  }, [client, gameRoomId]);

  async function join() {
    setError("");
    localStorage.setItem("matrixToken", matrixToken);
    try {
      const result = await client.joinGame(gameRoomId);
      setPlayers((existing) =>
        existing.some((player) => player.id === result.player.id)
          ? existing
          : [...existing, result.player]
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function start() {
    setError("");
    try {
      const result = await client.startGame(gameRoomId);
      setStatus(result.status);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  return (
    <section style={{ padding: 24, display: "grid", gap: 16 }}>
      <header>
        <h1 style={{ margin: 0 }}>Game Room</h1>
        <p style={{ color: "#cfc7b8" }}>{gameRoomId}</p>
      </header>
      <label style={{ display: "grid", gap: 6, maxWidth: 520 }}>
        Matrix Token
        <input value={matrixToken} onChange={(event) => setMatrixToken(event.target.value)} />
      </label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button type="button" onClick={join}>
          Join
        </button>
        <button type="button" onClick={start}>
          Start
        </button>
      </div>
      {error ? <p style={{ color: "#ffb4a9" }}>{error}</p> : null}
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        <WaitingRoom players={players} />
        <GameTable phase={status} deadlineAt={null} />
        <PrivatePanel />
      </div>
      <section>
        <h2>Events</h2>
        <ul>
          {events.map((event, index) => (
            <li key={`${event}-${index}`}>{event}</li>
          ))}
        </ul>
      </section>
    </section>
  );
}
