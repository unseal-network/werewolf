import React from "react";
import { createRoot } from "react-dom/client";
import { RootLayout } from "./routes/__root";
import { CreateGamePage } from "./routes/create";
import { GameRoomPage } from "./routes/game.$gameRoomId";

function App() {
  const gameRoomId = new URLSearchParams(window.location.search).get(
    "gameRoomId"
  );

  return (
    <RootLayout>{gameRoomId ? <GameRoomPage gameRoomId={gameRoomId} /> : <CreateGamePage />}</RootLayout>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
