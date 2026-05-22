import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { RootLayout } from "./routes/__root";
import { CreateGamePage } from "./routes/create";
import { GameRoomPage } from "./routes/game.$gameRoomId";
import { AnimationDemoPage } from "./routes/animation-demo";
import { UserSelectPage } from "./routes/user-select";
import { LoadingPage } from "./components/LoadingPage";
import { GameAssetPreloadGate } from "./components/GameAssetPreloadGate";
import { I18nProvider } from "./i18n/I18nProvider";
import { useIframeAuth } from "./hooks/useIframeAuth";
import {
  SOURCE_ROOM_STORAGE_KEY,
  hasStoredMatrixSession,
  setMatrixTokenRefresher,
  writeMatrixHomeserver,
  writeMatrixIdentity,
  writeMatrixToken,
} from "./matrix/session";
import {
  buildGameRoomUrl,
  gameRoomIdFromSearch,
  resolveRuntimeBootstrap,
} from "./runtime/bootstrap";
import { isHostRuntime } from "./runtime/hostBridge";
import { createUnsealClient, UnsealApiError, type UnsealClient } from "./runtime/unsealClient";
import { un } from "./runtime/devLog";
import "./index.css";
import "./styles/game-room.css";

// ── Types ─────────────────────────────────────────────────────────────────────

interface HostSession {
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

// ── App ───────────────────────────────────────────────────────────────────────

function App() {
  const [search, setSearch] = useState(window.location.search);
  const hostRuntime = useMemo(() => isHostRuntime(), []);
  const [hostBootstrap, setHostBootstrap] = useState<HostBootstrapState>(
    () => (hostRuntime ? { status: "checking" } : { status: "idle" })
  );
  const [isAdmin, setIsAdmin] = useState(false);
  const hostSessionRef = useRef<HostSession | undefined>(undefined);

  // useIframeAuth must be called unconditionally before any early returns
  const iframeAuth = useIframeAuth();

  // ── popstate listener ──────────────────────────────────────────────────────
  useEffect(() => {
    const onPop = () => setSearch(window.location.search);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // ── Host runtime bootstrap ─────────────────────────────────────────────────
  useEffect(() => {
    if (!hostRuntime) return;
    let cancelled = false;
    let pollTimer: number | null = null;
    const refreshHostToken = async () => {
      const fresh = (await iframeAuth.getToken()).trim();
      if (!fresh) throw new Error("未从 Unseal app 刷新到登录 token，请重新打开游戏");
      writeMatrixToken(fresh);
      return fresh;
    };
    const unregisterMatrixTokenRefresher = setMatrixTokenRefresher(refreshHostToken);

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
        // ── Step 1: get GameInfo + Token via SDK hook ──────────────────────
        const gameInfo = await iframeAuth.init();
        const hostToken = iframeAuth.getTokenSync().trim();

        if (cancelled) return;

        if (!hostToken) {
          throw new Error("未从 Unseal app 获取到登录 token，请重新打开游戏");
        }

        // ── Step 2: write identity to localStorage ─────────────────────────
        writeMatrixToken(hostToken);
        if (gameInfo.userId) {
          writeMatrixIdentity(
            gameInfo.userId,
            gameInfo.displayName ?? gameInfo.userId
          );
        }
        const hostRoomId = gameInfo.gameRoomId || undefined;
        if (hostRoomId) {
          localStorage.setItem(SOURCE_ROOM_STORAGE_KEY, hostRoomId);
        }

        const admin = (gameInfo.powerLevel ?? 0) >= 100;
        setIsAdmin(admin);
        let linkRoomId: string | null = gameInfo.linkRoomId || null;
        let unsealClient: UnsealClient | undefined;
        let unsealJwt: string | undefined;
        const unsealBase = unsealBaseFromStreamUrl(gameInfo.config?.streamURL);
        // Persist homeserver origin for mxc:// avatar URL resolution
        const streamUrl = gameInfo.config?.streamURL;
        if (streamUrl) {
          try {
            writeMatrixHomeserver(new URL(streamUrl).origin);
          } catch {
            // malformed URL — skip, readMatrixHomeserver() will fall back to default
          }
        }

        if (unsealBase && hostToken) {
          let unsealClientForRefresh: UnsealClient;
          unsealClient = createUnsealClient(unsealBase, {
            refreshJwt: async () => {
              const freshHostToken = await refreshHostToken();
              const refreshed = await unsealClientForRefresh.enter(freshHostToken);
              unsealJwt = refreshed.token;
              hostSessionRef.current = {
                ...hostSessionRef.current,
                hostRoomId,
                unsealClient: unsealClientForRefresh,
                unsealJwt,
              };
              if (refreshed.user?.userId) {
                writeMatrixIdentity(
                  refreshed.user.userId,
                  refreshed.user.displayName ?? refreshed.user.userId
                );
              }
              return refreshed.token;
            },
          });
          unsealClientForRefresh = unsealClient;
          const entered = await unsealClient.enter(hostToken);
          unsealJwt = entered.token;

          if (entered.user?.userId) {
            writeMatrixIdentity(
              entered.user.userId,
              entered.user.displayName ?? entered.user.userId
            );
          }

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

        // ── Step 4: routing decision ───────────────────────────────────────
        const session: HostSession = { hostRoomId, unsealClient, unsealJwt };
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
          setHostBootstrap({ status: "waiting", hostRoomId: decision.hostRoomId });
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
      unregisterMatrixTokenRefresher();
      if (pollTimer !== null) window.clearTimeout(pollTimer);
    };
  }, [hostRuntime]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ────────────────────────────────────────────────────────────────

  const params = new URLSearchParams(search);
  if (params.get("animationDemo") === "1") {
    return <AnimationDemoPage />;
  }

  const gameRoomId = gameRoomIdFromSearch(search);
  const forceChooseUser = params.get("chooseUser") === "1";

  // Loading states (host runtime only)
  if (hostRuntime && hostBootstrap.status === "checking") {
    return <LoadingPage isAdmin={isAdmin} onLeave={() => iframeAuth.iframeMessage.closeApp()} />;
  }
  if (hostRuntime && hostBootstrap.status === "waiting") {
    return <LoadingPage isAdmin={isAdmin} error="等待房主创建并绑定游戏房间..." onLeave={() => iframeAuth.iframeMessage.closeApp()} />;
  }
  if (hostRuntime && hostBootstrap.status === "error") {
    return (
      <LoadingPage
        isAdmin={isAdmin}
        error={hostBootstrap.message}
        onRetry={() => window.location.reload()}
        onLeave={() => iframeAuth.iframeMessage.closeApp()}
      />
    );
  }

  // Non-host: user selection
  if (!hostRuntime && (forceChooseUser || !hasStoredMatrixSession())) {
    return <UserSelectPage />;
  }

  // Game room
  if (gameRoomId) {
    return (
      <GameAssetPreloadGate
        isAdmin={isAdmin}
        onLeave={() => iframeAuth.iframeMessage.hideApp()}
      >
        <GameRoomPage
          key={gameRoomId}
          gameRoomId={gameRoomId}
          onLeave={() => iframeAuth.iframeMessage.hideApp()}
        />
      </GameAssetPreloadGate>
    );
  }

  // Create game
  const hostSession =
    hostBootstrap.status === "ready" ? hostBootstrap.session : undefined;

  return (
    <CreateGamePage
      onGameCreated={async (createdGameRoomId) => {
        const { unsealClient, unsealJwt, hostRoomId } = hostSessionRef.current ?? {};
        if (hostRoomId && unsealClient && unsealJwt) {
          await unsealClient.linkRoom(hostRoomId, createdGameRoomId, unsealJwt);
        }
      }}
      onLeave={() => iframeAuth.iframeMessage.hideApp()}
    />
  );
}

// ── Mount ─────────────────────────────────────────────────────────────────────

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <I18nProvider>
      <RootLayout>
        <App />
      </RootLayout>
    </I18nProvider>
  </React.StrictMode>
);
