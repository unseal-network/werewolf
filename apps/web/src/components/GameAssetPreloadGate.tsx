import { useEffect, useState, type ReactNode } from "react";
import { GAME_ASSET_URLS, preloadGameAssets } from "../game/preloadAssets";
import { LoadingPage } from "./LoadingPage";

interface GameAssetPreloadGateProps {
  children: ReactNode;
  isAdmin?: boolean;
  onLeave?: (() => void) | undefined;
}

export function GameAssetPreloadGate({
  children,
  isAdmin,
  onLeave,
}: GameAssetPreloadGateProps) {
  const [progress, setProgress] = useState({
    loaded: 0,
    total: GAME_ASSET_URLS.length,
    ready: GAME_ASSET_URLS.length === 0,
  });

  useEffect(() => {
    let active = true;

    void preloadGameAssets((loaded, total) => {
      if (!active) return;
      setProgress({ loaded, total, ready: loaded >= total });
    }).then(() => {
      if (!active) return;
      setProgress((current) => ({ ...current, ready: true }));
    });

    return () => {
      active = false;
    };
  }, []);

  if (!progress.ready) {
    return (
      <LoadingPage
        {...(isAdmin === undefined ? {} : { isAdmin })}
        message={`加载游戏资源 ${progress.loaded}/${progress.total}`}
        detail="预热美术资源，稍后进入房间"
        {...(onLeave ? { onLeave } : {})}
      />
    );
  }

  return <>{children}</>;
}
