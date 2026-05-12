import { useEffect, useMemo, useState } from "react";
import { createApiClient, defaultApiBaseUrl } from "../api/client";
import { useI18n } from "../i18n/I18nProvider";
import {
  DEFAULT_SOURCE_ROOM_ID,
  MATRIX_USER_ID_STORAGE_KEY,
  SOURCE_ROOM_STORAGE_KEY,
  matrixServerBaseFromToken,
  readMatrixToken,
  writeMatrixToken,
} from "../matrix/session";

export function CreateGamePage({
  initialError,
}: {
  initialError?: string | undefined;
} = {}) {
  const { t, locale, setLocale } = useI18n();
  const [title, setTitle] = useState(t("create.gameTitleDefault"));
  const defaultRoom = import.meta.env.VITE_DEMO_ROOM ?? DEFAULT_SOURCE_ROOM_ID;
  const [matrixToken, setMatrixToken] = useState(() => readMatrixToken());
  const [sourceMatrixRoomId, setSourceMatrixRoomId] = useState(
    () => localStorage.getItem(SOURCE_ROOM_STORAGE_KEY) ?? defaultRoom
  );
  const [joinedRooms, setJoinedRooms] = useState<string[]>([]);
  const [roomDisplayNames, setRoomDisplayNames] = useState<Record<string, string>>(
    {}
  );
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [roomSelectValue, setRoomSelectValue] = useState(sourceMatrixRoomId);
  const targetPlayerCount = 12;
  const [language, setLanguage] = useState<"zh-CN" | "en">("zh-CN");
  const [error, setError] = useState(initialError ?? "");

  const client = useMemo(
    () =>
      createApiClient({
        baseUrl: defaultApiBaseUrl(),
        getMatrixToken: () => matrixToken.trim(),
      }),
    [matrixToken]
  );

  useEffect(() => {
    setTitle((current) => {
      if (current === "" || current === "狼人杀" || current === "Werewolf Room") {
        return t("create.gameTitleDefault");
      }
      return current;
    });
  }, [t]);

  async function loadJoinedRooms() {
    setError("");
    setRoomsLoading(true);
    const token = matrixToken.trim();
    if (!token) {
      setError(t("create.tokenRequired"));
      setRoomsLoading(false);
      return;
    }
    try {
      writeMatrixToken(token);
      const matrixBase = matrixServerBaseFromToken(token);
      const [whoami, rooms] = await Promise.all([
        client.whoAmI(matrixBase),
        client.joinedRooms(matrixBase),
      ]);
      if (whoami.user_id) {
        localStorage.setItem(MATRIX_USER_ID_STORAGE_KEY, whoami.user_id);
      }
      const nextRooms = rooms.joined_rooms ?? [];
      setJoinedRooms(nextRooms);
      const roomsToLabel = Array.from(new Set([defaultRoom, ...nextRooms]));
      const labelEntries = await Promise.all(
        roomsToLabel.map(async (roomId) => {
          try {
            const label = await client.roomDisplayName(matrixBase, roomId);
            return label ? ([roomId, label] as const) : null;
          } catch {
            return null;
          }
        })
      );
      setRoomDisplayNames(
        Object.fromEntries(labelEntries.filter((entry): entry is readonly [string, string] => Boolean(entry)))
      );
      if (!sourceMatrixRoomId && nextRooms[0]) {
        setSourceMatrixRoomId(nextRooms[0]);
        setRoomSelectValue(nextRooms[0]);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setRoomsLoading(false);
    }
  }

  const roomOptions = useMemo(
    () => Array.from(new Set([defaultRoom, sourceMatrixRoomId, ...joinedRooms].filter(Boolean))),
    [defaultRoom, joinedRooms, sourceMatrixRoomId]
  );

  function onRoomSelect(value: string) {
    setRoomSelectValue(value);
    if (value !== "__custom__") {
      setSourceMatrixRoomId(value);
    }
  }

  function roomOptionLabel(roomId: string): string {
    const name = roomDisplayNames[roomId];
    const suffix = roomId === defaultRoom ? ` (${t("create.defaultRoom")})` : "";
    return name ? `${name} · ${roomId}${suffix}` : `${roomId}${suffix}`;
  }

  useEffect(() => {
    void loadJoinedRooms();
    // Load once for the initial token. Manual token edits use the refresh button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const token = matrixToken.trim();
    const roomId = sourceMatrixRoomId.trim();
    if (!token) {
      setError(t("create.tokenRequired"));
      return;
    }
    if (!roomId) {
      setError(t("create.roomRequired"));
      return;
    }
    writeMatrixToken(token);
    localStorage.setItem(SOURCE_ROOM_STORAGE_KEY, roomId);

    try {
      const result = await client.createGame({
        sourceMatrixRoomId: roomId,
        title,
        targetPlayerCount,
        language,
        timing: { nightActionSeconds: 45, speechSeconds: 60, voteSeconds: 30 },
        allowedSourceMatrixRoomIds: [],
      });
      const url = `${window.location.pathname}?gameRoomId=${result.gameRoomId}`;
      window.location.href = url;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  return (
    <section className="create-page">
      <div className="create-card">
        <header className="create-header">
          <h1>{t("create.title")}</h1>
          <div className="locale-switcher inline" role="group" aria-label={t("common.languageLabel")}>
            <button
              type="button"
              className={locale === "zh-CN" ? "active" : ""}
              onClick={() => setLocale("zh-CN")}
            >
              中
            </button>
            <button
              type="button"
              className={locale === "en" ? "active" : ""}
              onClick={() => setLocale("en")}
            >
              EN
            </button>
          </div>
        </header>
        <form onSubmit={submit} className="create-form">
          <label>
            {t("create.matrixToken")}
            <textarea
              value={matrixToken}
              onChange={(event) => setMatrixToken(event.target.value)}
              placeholder={t("create.matrixTokenPlaceholder")}
              spellCheck={false}
            />
          </label>
          <div className="create-room-tools">
            <button
              type="button"
              className="action secondary"
              onClick={() => void loadJoinedRooms()}
              disabled={roomsLoading}
            >
              {roomsLoading ? "..." : t("create.refreshRooms")}
            </button>
          </div>
          <label>
            {t("create.gameTitle")}
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label>
            {t("create.sourceRoom")}
            <select
              value={roomOptions.includes(roomSelectValue) ? roomSelectValue : "__custom__"}
              onChange={(event) => onRoomSelect(event.target.value)}
            >
              {roomOptions.map((roomId) => (
                <option key={roomId} value={roomId}>
                  {roomOptionLabel(roomId)}
                </option>
              ))}
              <option value="__custom__">{t("create.customRoom")}</option>
            </select>
          </label>
          {roomSelectValue === "__custom__" ? (
            <label>
              {t("create.customRoom")}
              <input
                value={sourceMatrixRoomId}
                onChange={(event) => setSourceMatrixRoomId(event.target.value)}
                placeholder="!room:example.com"
              />
            </label>
          ) : null}
          <label>
            {t("create.language")}
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value as "zh-CN" | "en")}
            >
              <option value="zh-CN">{t("create.languageZh")}</option>
              <option value="en">{t("create.languageEn")}</option>
            </select>
          </label>
          <button type="submit" className="action-primary">
            {t("create.submit")}
          </button>
          {error ? <p className="create-error">{error}</p> : null}
        </form>
      </div>
    </section>
  );
}
