import { useEffect, useMemo, useRef, useState } from "react";
import { createApiClient, defaultApiBaseUrl } from "../api/client";
import { useI18n } from "../i18n/I18nProvider";
import {
  DEFAULT_SOURCE_ROOM_ID,
  MATRIX_USER_ID_STORAGE_KEY,
  SOURCE_ROOM_STORAGE_KEY,
  clearMatrixSession,
  matrixServerBaseFromToken,
  readStoredMatrixDisplayName,
  readStoredMatrixUserId,
  readMatrixToken,
  writeMatrixIdentity,
  writeMatrixToken,
} from "../matrix/session";

interface FormSelectOption {
  value: string;
  label: string;
}

function FormSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: FormSelectOption[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={`form-select ${open ? "open" : ""}`}
      data-open={open ? "true" : "false"}
    >
      <button
        type="button"
        className="form-select-trigger"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="form-select-value">{selected?.label ?? ""}</span>
        <span className="form-select-chevron" aria-hidden>
          <svg viewBox="0 0 16 16" focusable="false">
            <path
              d="M3.5 5.75 8 10.25l4.5-4.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>
      <div className="form-select-menu" role="listbox" aria-hidden={!open}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={active}
              className={`form-select-option ${active ? "selected" : ""}`}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              <span className="form-select-option-check" aria-hidden>
                {active ? "✓" : ""}
              </span>
              <span className="form-select-option-label">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function CreateGamePage({
  initialError,
  onGameCreated,
}: {
  initialError?: string | undefined;
  onGameCreated?: ((gameRoomId: string, sourceMatrixRoomId: string) => Promise<void> | void) | undefined;
} = {}) {
  const { t, locale, setLocale } = useI18n();
  const [title, setTitle] = useState(t("create.gameTitleDefault"));
  const defaultRoom = import.meta.env.VITE_DEMO_ROOM ?? DEFAULT_SOURCE_ROOM_ID;
  const [matrixToken, setMatrixToken] = useState(() => readMatrixToken());
  const [selectedUserId, setSelectedUserId] = useState(
    () => readStoredMatrixUserId() ?? ""
  );
  const [selectedDisplayName, setSelectedDisplayName] = useState(
    () => readStoredMatrixDisplayName() ?? ""
  );
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
  const [agentSpeechRate, setAgentSpeechRate] = useState(1.5);
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
        writeMatrixIdentity(
          whoami.user_id,
          whoami.display_name ?? whoami.user_id
        );
        setSelectedUserId(whoami.user_id);
        setSelectedDisplayName(whoami.display_name ?? whoami.user_id);
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

  const roomSelectOptions = useMemo<FormSelectOption[]>(
    () => [
      ...roomOptions.map((roomId) => ({
        value: roomId,
        label: roomOptionLabel(roomId),
      })),
      { value: "__custom__", label: t("create.customRoom") },
    ],
    [roomOptions, t, roomDisplayNames, defaultRoom]
  );

  const languageOptions = useMemo<FormSelectOption[]>(
    () => [
      { value: "zh-CN", label: t("create.languageZh") },
      { value: "en", label: t("create.languageEn") },
    ],
    [t]
  );

  const speechRateOptions = useMemo<FormSelectOption[]>(
    () => [
      { value: "1", label: t("create.agentSpeechRate1") },
      { value: "1.25", label: t("create.agentSpeechRate125") },
      { value: "1.5", label: t("create.agentSpeechRate15") },
      { value: "1.75", label: t("create.agentSpeechRate175") },
      { value: "2", label: t("create.agentSpeechRate2") },
    ],
    [t]
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
        timing: {
          nightActionSeconds: 45,
          speechSeconds: 60,
          voteSeconds: 30,
          agentSpeechRate,
        },
      });
      await onGameCreated?.(result.gameRoomId, roomId);
      const url = `${window.location.pathname}?gameRoomId=${result.gameRoomId}`;
      window.location.href = url;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  function logout() {
    clearMatrixSession();
    window.location.href = `${window.location.pathname}?chooseUser=1`;
  }

  return (
    <section className="create-page">
      <div className="create-card">
        <header className="create-header">
          <div className="create-heading">
            <h1>{t("create.title")}</h1>
            {selectedUserId ? (
              <div className="create-session-chip">
                <strong>{selectedDisplayName || selectedUserId}</strong>
                <span>{selectedUserId}</span>
              </div>
            ) : null}
          </div>
          <div className="create-header-actions">
            <button type="button" className="action secondary" onClick={logout}>
              {t("create.logout")}
            </button>
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
          </div>
        </header>
        <form onSubmit={submit} className="create-form">
          <label className="create-field create-field-token">
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
          <label className="create-field">
            {t("create.gameTitle")}
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label className="create-field">
            {t("create.sourceRoom")}
            <FormSelect
              value={roomOptions.includes(roomSelectValue) ? roomSelectValue : "__custom__"}
              options={roomSelectOptions}
              onChange={onRoomSelect}
            />
          </label>
          {roomSelectValue === "__custom__" ? (
            <label className="create-field">
              {t("create.customRoom")}
              <input
                value={sourceMatrixRoomId}
                onChange={(event) => setSourceMatrixRoomId(event.target.value)}
                placeholder="!room:example.com"
              />
            </label>
          ) : null}
          <div className="create-form-grid">
            <label className="create-field">
              {t("create.language")}
              <FormSelect
                value={language}
                options={languageOptions}
                onChange={(value) => setLanguage(value as "zh-CN" | "en")}
              />
            </label>
            <label className="create-field">
              {t("create.agentSpeechRate")}
              <FormSelect
                value={String(agentSpeechRate)}
                options={speechRateOptions}
                onChange={(value) => setAgentSpeechRate(Number(value))}
              />
            </label>
          </div>
          <button type="submit" className="action-primary">
            {t("create.submit")}
          </button>
          {error ? <p className="create-error">{error}</p> : null}
        </form>
      </div>
    </section>
  );
}
