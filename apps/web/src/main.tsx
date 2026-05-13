import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { RootLayout } from "./routes/__root";
import { CreateGamePage } from "./routes/create";
import { GameRoomPage } from "./routes/game.$gameRoomId";
import { AnimationDemoPage } from "./routes/animation-demo";
import { UiDemoPage } from "./routes/ui-demo";
import { UserSelectPage } from "./routes/user-select";
import { I18nProvider } from "./i18n/I18nProvider";
import { hasStoredMatrixSession } from "./matrix/session";
import "./styles/game-room.css";

function App() {
  const [search, setSearch] = useState(window.location.search);

  useEffect(() => {
    const onPop = () => setSearch(window.location.search);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const params = new URLSearchParams(search);
  if (params.get("animationDemo") === "1") {
    return <AnimationDemoPage />;
  }
  if (params.get("uiDemo") === "1") {
    return <UiDemoPage />;
  }
  const gameRoomId = params.get("gameRoomId");
  const forceChooseUser = params.get("chooseUser") === "1";

  if (forceChooseUser || !hasStoredMatrixSession()) {
    return <UserSelectPage />;
  }

  if (gameRoomId) {
    return <GameRoomPage gameRoomId={gameRoomId} />;
  }
  return <CreateGamePage />;
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
