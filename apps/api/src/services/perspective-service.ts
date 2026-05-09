export interface ViewerPerspective {
  playerId: string;
  team: "wolf" | "good";
}

export function canSeeEvent(
  viewer: ViewerPerspective,
  visibility: string
): boolean {
  if (visibility === "public") return true;
  if (visibility === "runtime") return false;
  if (visibility === "private:team:wolf") return viewer.team === "wolf";
  if (visibility.startsWith("private:user:")) {
    return visibility.slice("private:user:".length) === viewer.playerId;
  }
  return false;
}
