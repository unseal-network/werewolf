import { useEffect, useMemo, useState } from "react";
import {
  createApiClient,
  type GameEventDto,
  type JoinedPlayer,
} from "../api/client";
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
  const [timeline, setTimeline] = useState<GameEventDto[]>([]);
  const [bulkTokens, setBulkTokens] = useState(
    localStorage.getItem("matrixTokens") ?? matrixToken
  );
  const [agentApiKey, setAgentApiKey] = useState(
    localStorage.getItem("agentApiKey") ?? ""
  );
  const [winner, setWinner] = useState("");
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

  async function joinAll() {
    setError("");
    const tokens = bulkTokens.split(/\s+/).filter(Boolean);
    localStorage.setItem("matrixTokens", tokens.join("\n"));
    const joined: JoinedPlayer["player"][] = [];
    for (const token of tokens) {
      const scopedClient = createApiClient({
        baseUrl: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000",
        getMatrixToken: () => token,
      });
      const result = await scopedClient.joinGame(gameRoomId);
      joined.push(result.player);
    }
    setPlayers(joined);
  }

  async function runRuntimeToEnd() {
    setError("");
    localStorage.setItem("agentApiKey", agentApiKey);
    const collected: GameEventDto[] = [];
    for (let index = 0; index < 30; index += 1) {
      const result = await client.runRuntimeTick(gameRoomId, {
        agentApiKey,
        agentApiBaseUrl: "https://un-server.dev-excel-alt.pagepeek.org/api",
      });
      collected.push(...result.events);
      setStatus(result.projection.phase);
      setWinner(result.projection.winner ?? "");
      setTimeline([...collected]);
      if (result.done) return;
    }
    setError("Runtime did not finish within 30 ticks");
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
      <label style={{ display: "grid", gap: 6, maxWidth: 520 }}>
        Matrix Tokens
        <textarea rows={6} value={bulkTokens} onChange={(event) => setBulkTokens(event.target.value)} />
      </label>
      <label style={{ display: "grid", gap: 6, maxWidth: 520 }}>
        Agent API Key
        <input value={agentApiKey} onChange={(event) => setAgentApiKey(event.target.value)} />
      </label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button type="button" onClick={join}>
          Join
        </button>
        <button type="button" onClick={joinAll}>
          Join Tokens
        </button>
        <button type="button" onClick={start}>
          Start
        </button>
        <button type="button" onClick={runRuntimeToEnd}>
          Run Runtime
        </button>
      </div>
      {error ? <p style={{ color: "#ffb4a9" }}>{error}</p> : null}
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        <WaitingRoom players={players} />
        <GameTable phase={status} deadlineAt={null} />
        <PrivatePanel />
      </div>
      {winner ? <p>Winner: {winner}</p> : null}
      <section>
        <h2>Timeline</h2>
        <ol>
          {timeline.map((event) => (
            <li key={event.id}>
              <strong>{event.seq}. {event.type}</strong>
              {event.actorId ? ` actor=${event.actorId}` : ""}
              {event.subjectId ? ` subject=${event.subjectId}` : ""}
              <pre style={{ whiteSpace: "pre-wrap" }}>
                {JSON.stringify(event.payload, null, 2)}
              </pre>
            </li>
          ))}
        </ol>
      </section>
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
