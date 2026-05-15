import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { RootLayout } from "./routes/__root";
import { CreateGamePage } from "./routes/create";
import { GameRoomPage } from "./routes/game.$gameRoomId";
import { AnimationDemoPage } from "./routes/animation-demo";
import { UserSelectPage } from "./routes/user-select";
import { LoadingPage } from "./components/LoadingPage";
import { I18nProvider } from "./i18n/I18nProvider";
import {
  SOURCE_ROOM_STORAGE_KEY,
  hasStoredMatrixSession,
  writeMatrixIdentity,
  writeMatrixToken,
} from "./matrix/session";
import {
  buildGameRoomUrl,
  gameRoomIdFromSearch,
  resolveRuntimeBootstrap,
} from "./runtime/bootstrap";
import { createHostBridge, isHostRuntime, type HostBridge } from "./runtime/hostBridge";
import { createUnsealClient, UnsealApiError, type UnsealClient } from "./runtime/unsealClient";
import "./index.css";
import "./styles/game-room.css";

interface HostSession {
  bridge: HostBridge;
  hostRoomId?: string | undefined;
  unsealClient?: UnsealClient | undefined;
  unsealJwt?: string | undefined;
}

type HostBootstrapState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "ready"; session?: HostSession | undefined }
  | { status: "waiting"; hostRoomId: string }
  | { status: "error"; message: string };

function unsealBaseFromStreamUrl(streamUrl: string | undefined): string | null {
  const trimmed = streamUrl?.trim();
  if (!trimmed) return null;
  return `${trimmed.replace(/\/+$/, "")}/app-mgr/room`;
}

function App() {
  const [search, setSearch] = useState(window.location.search);
  const hostRuntime = useMemo(() => isHostRuntime(), []);
  const [hostBootstrap, setHostBootstrap] = useState<HostBootstrapState>(
    () => (hostRuntime ? { status: "checking" } : { status: "idle" })
  );
  const [isAdmin, setIsAdmin] = useState(false);
  const hostSessionRef = useRef<HostSession | undefined>(undefined);

  useEffect(() => {
    const onPop = () => setSearch(window.location.search);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const params = new URLSearchParams(search);
  if (params.get("animationDemo") === "1") {
    return <AnimationDemoPage />;
  }
  const gameRoomId = gameRoomIdFromSearch(search);
  const forceChooseUser = params.get("chooseUser") === "1";

  useEffect(() => {
    if (!hostRuntime) return;
    let cancelled = false;
    let pollTimer: number | null = null;

    const setGameUrl = (nextGameRoomId: string) => {
      const nextUrl = buildGameRoomUrl(
        window.location.pathname,
        window.location.search,
        nextGameRoomId
      );
      window.history.replaceState(null, "", nextUrl);
      setSearch(window.location.search);
    };

    const pollForLink = async (
      client: UnsealClient,
      hostRoomId: string,
      jwt: string
    ) => {
      if (cancelled) return;
      try {
        const room = await client.getRoom(hostRoomId, jwt);
        if (room.linkRoomId) {
          setGameUrl(room.linkRoomId);
          setHostBootstrap({ status: "ready", session: hostSessionRef.current });
          return;
        }
      } catch {
        // Host room lookup may race creation; keep waiting.
      }
      pollTimer = window.setTimeout(() => {
        void pollForLink(client, hostRoomId, jwt);
      }, 1000);
    };

    async function run() {
      setHostBootstrap({ status: "checking" });
      try {
        const bridge = createHostBridge();
        const [info, matrixToken] = await Promise.all([
          bridge.getInfo(),
          bridge.getToken(),
        ]);
        if (cancelled) return;

        if (matrixToken) {
          writeMatrixToken(matrixToken);
        }
        if (info.userId) {
          writeMatrixIdentity(info.userId, info.displayName ?? info.userId);
        }
        const hostRoomId = info.roomId ?? info.gameRoomId;
        if (hostRoomId) {
          localStorage.setItem(SOURCE_ROOM_STORAGE_KEY, hostRoomId);
        }

        // Persist admin status for LoadingPage
        const admin = (info.powerLevel ?? 0) >= 100;
        setIsAdmin(admin);

        let linkRoomId = info.linkRoomId ?? null;
        let unsealClient: UnsealClient | undefined;
        let unsealJwt: string | undefined;
        const unsealBase = unsealBaseFromStreamUrl(info.config?.streamURL);
        if (unsealBase && matrixToken) {
          unsealClient = createUnsealClient(unsealBase);
          const entered = await unsealClient.enter(matrixToken);
          unsealJwt = entered.token;
          if (hostRoomId) {
            try {
              const room = await unsealClient.getRoom(hostRoomId, unsealJwt);
              linkRoomId = room.linkRoomId;
            } catch (error) {
              if (!(error instanceof UnsealApiError && error.code === "ROOM_002")) {
                throw error;
              }
            }
          }
        }

        const session: HostSession = {
          bridge,
          hostRoomId,
          unsealClient,
          unsealJwt,
        };
        hostSessionRef.current = session;
        const decision = resolveRuntimeBootstrap({
          urlGameRoomId: gameRoomIdFromSearch(window.location.search),
          hostRoomId,
          hostLinkRoomId: linkRoomId,
          isHostRuntime: true,
          isAdmin: admin,
        });

        if (decision.kind === "resume") {
          setGameUrl(decision.gameRoomId);
          setHostBootstrap({ status: "ready", session });
          return;
        }
        if (decision.kind === "wait-for-host-link") {
          setHostBootstrap({
            status: "waiting",
            hostRoomId: decision.hostRoomId,
          });
          if (unsealClient && unsealJwt) {
            void pollForLink(unsealClient, decision.hostRoomId, unsealJwt);
          }
          return;
        }
        setHostBootstrap({ status: "ready", session });
      } catch (error) {
        if (!cancelled) {
          setHostBootstrap({
            status: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
      if (pollTimer !== null) window.clearTimeout(pollTimer);
    };
  }, [hostRuntime]);

  // ── Loading states (host runtime only) ──────────────────────────────────

  if (hostRuntime && hostBootstrap.status === "checking") {
    return <LoadingPage isAdmin={isAdmin} />;
  }

  if (hostRuntime && hostBootstrap.status === "waiting") {
    return (
      <LoadingPage
        isAdmin={isAdmin}
        error="等待房主创建并绑定游戏房间..."
      />
    );
  }

  if (hostRuntime && hostBootstrap.status === "error") {
    return (
      <LoadingPage
        isAdmin={isAdmin}
        error={hostBootstrap.message}
        onRetry={() => window.location.reload()}
      />
    );
  }

  // ── Non-host runtime: user selection ────────────────────────────────────

  if (!hostRuntime && (forceChooseUser || !hasStoredMatrixSession())) {
    return <UserSelectPage />;
  }

  // ── Game room ────────────────────────────────────────────────────────────

  if (gameRoomId) {
    return <GameRoomPage gameRoomId={gameRoomId} />;
  }

  // ── Create game ──────────────────────────────────────────────────────────

  const hostSession =
    hostBootstrap.status === "ready" ? hostBootstrap.session : undefined;

  return (
    <CreateGamePage
      onGameCreated={async (createdGameRoomId) => {
        if (
          hostSession?.hostRoomId &&
          hostSession.unsealClient &&
          hostSession.unsealJwt
        ) {
          await hostSession.unsealClient.linkRoom(
            hostSession.hostRoomId,
            createdGameRoomId,
            hostSession.unsealJwt
          );
        }
      }}
      onLeave={() => hostSession?.bridge.hideApp?.()}
    />
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <I18nProvider>
      <RootLayout>
        <App />
      </RootLayout>
    </I18nProvider>
  </React.StrictMode>
);
