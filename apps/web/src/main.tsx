import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { RootLayout } from "./routes/__root";
import { CreateGamePage } from "./routes/create";
import { GameRoomPage } from "./routes/game.$gameRoomId";
import { I18nProvider } from "./i18n/I18nProvider";
import "./styles/game-room.css";

function App() {
  const [search, setSearch] = useState(window.location.search);

  useEffect(() => {
    const onPop = () => setSearch(window.location.search);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const params = new URLSearchParams(search);
  const gameRoomId = params.get("gameRoomId");

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
