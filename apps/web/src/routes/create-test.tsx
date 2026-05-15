/**
 * create-test.tsx — Test-mode create page (desktop card UI).
 *
 * Shown when isHostRuntime() === false (non-iframe / development mode).
 * All data comes from user-facing inputs and the test-user localStorage session.
 * Has no dependency on iframeMessage / HostBridge at all.
 */
import { useEffect, useMemo, useState } from "react";
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
} from "../matrix/session";
import { FormSelect, type FormSelectOption } from "../components/FormSelect";
import { useCreateGame } from "../hooks/useCreateGame";

export interface TestCreatePageProps {
  initialError?: string;
  onGameCreated?: (
    gameRoomId: string,
    sourceMatrixRoomId: string
  ) => Promise<void> | void;
}

// Shared input style: white-ish field on dark card
const inputStyle: React.CSSProperties = {
  border: "1px solid rgba(223,189,103,0.28)",
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(240,242,247,0.98))",
};

const inputClass =
  "w-full min-h-[50px] rounded-[9px] px-3.5 py-3 text-[#141722] text-base outline-none transition-all focus:shadow-[0_0_0_4px_rgba(212,177,92,0.13)]";

export function TestCreatePage({
  initialError,
  onGameCreated,
}: TestCreatePageProps) {
  const { t, locale, setLocale } = useI18n();

  // ── Game config (shared hook) ────────────────────────────────────────────
  const {
    title,
    setTitle,
    language,
    setLanguage,
    agentSpeechRate,
    setAgentSpeechRate,
    targetPlayerCount: _targetPlayerCount,  // hardcoded to 12 in this mode
    submitting,
    error,
    setError,
    submit,
  } = useCreateGame({ onGameCreated });

  // ── Test-mode-only state ─────────────────────────────────────────────────
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
  const [roomDisplayNames, setRoomDisplayNames] = useState<
    Record<string, string>
  >({});
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [roomSelectValue, setRoomSelectValue] = useState(sourceMatrixRoomId);

  // Matrix API client — recreated when token changes
  const matrixClient = useMemo(
    () =>
      createApiClient({
        baseUrl: defaultApiBaseUrl(),
        getMatrixToken: () => matrixToken.trim(),
      }),
    [matrixToken]
  );

  // Keep initialError in error state if provided
  useEffect(() => {
    if (initialError) setError(initialError);
  }, [initialError, setError]);

  // ── Room loading ─────────────────────────────────────────────────────────
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
      const matrixBase = matrixServerBaseFromToken(token);
      const [whoami, rooms] = await Promise.all([
        matrixClient.whoAmI(matrixBase),
        matrixClient.joinedRooms(matrixBase),
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
            const label = await matrixClient.roomDisplayName(
              matrixBase,
              roomId
            );
            return label ? ([roomId, label] as const) : null;
          } catch {
            return null;
          }
        })
      );
      setRoomDisplayNames(
        Object.fromEntries(
          labelEntries.filter(
            (entry): entry is readonly [string, string] => Boolean(entry)
          )
        )
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

  useEffect(() => {
    void loadJoinedRooms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Room select options ──────────────────────────────────────────────────
  const roomOptions = useMemo(
    () =>
      Array.from(
        new Set(
          [defaultRoom, sourceMatrixRoomId, ...joinedRooms].filter(Boolean)
        )
      ),
    [defaultRoom, joinedRooms, sourceMatrixRoomId]
  );

  function roomOptionLabel(roomId: string): string {
    const name = roomDisplayNames[roomId];
    const suffix =
      roomId === defaultRoom ? ` (${t("create.defaultRoom")})` : "";
    return name ? `${name} · ${roomId}${suffix}` : `${roomId}${suffix}`;
  }

  const roomSelectOptions = useMemo<FormSelectOption[]>(
    () => [
      ...roomOptions.map((roomId) => ({
        value: roomId,
        label: roomOptionLabel(roomId),
      })),
      { value: "__custom__", label: t("create.customRoom") },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // ── Submit ───────────────────────────────────────────────────────────────
  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
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
    await submit({ sourceMatrixRoomId: roomId, matrixToken: token });
  }

  function logout() {
    clearMatrixSession();
    window.location.href = `${window.location.pathname}?chooseUser=1`;
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <section
      className="min-h-screen overflow-y-auto flex items-center justify-center p-5 sm:p-8 md:p-12"
      style={{
        background:
          "radial-gradient(760px 520px at 50% 2%, rgba(212,177,92,0.14), transparent 70%), " +
          "radial-gradient(820px 620px at 12% 92%, rgba(110,134,255,0.14), transparent 68%), " +
          "linear-gradient(180deg, #0b0d15 0%, #151825 58%, #080a10 100%)",
      }}
    >
      <div
        className="w-full max-w-[760px] rounded-[14px] p-6 sm:p-8 md:p-11"
        style={{
          border: "1px solid rgba(207,176,91,0.28)",
          background:
            "linear-gradient(180deg, rgba(27,30,44,0.96), rgba(12,14,23,0.94))",
          boxShadow:
            "0 34px 100px rgba(0,0,0,0.46), inset 0 1px 0 rgba(255,255,255,0.08)",
        }}
      >
        {/* Header */}
        <header className="flex items-start justify-between gap-4 mb-6 flex-wrap sm:flex-nowrap">
          <div className="min-w-0 flex flex-col gap-2.5">
            <h1 className="m-0 text-[26px] tracking-[0.12em] font-black text-[#eef2fb]">
              {t("create.title")}
            </h1>
            {selectedUserId ? (
              <div
                className="flex flex-col gap-1 px-3.5 py-2.5 rounded-xl min-w-0 max-w-[360px]"
                style={{
                  border: "1px solid rgba(212,177,92,0.22)",
                  background: "rgba(255,255,255,0.05)",
                }}
              >
                <strong className="text-sm font-semibold text-[#eef2fb] truncate">
                  {selectedDisplayName || selectedUserId}
                </strong>
                <span className="text-xs text-[#a6afc3] truncate">
                  {selectedUserId}
                </span>
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2.5 shrink-0 flex-wrap justify-end">
            <button
              type="button"
              className="min-h-[42px] px-4 rounded-[9px] text-sm text-[#eef2fb] whitespace-nowrap transition-colors hover:bg-white/[0.12]"
              style={{
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.075)",
              }}
              onClick={logout}
            >
              {t("create.logout")}
            </button>

            {/* Locale switcher */}
            <div
              className="inline-flex rounded-full p-0.5"
              role="group"
              aria-label={t("common.languageLabel")}
              style={{
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.14)",
              }}
            >
              {(["zh-CN", "en"] as const).map((code) => (
                <button
                  key={code}
                  type="button"
                  className="px-2.5 py-1 rounded-full text-[11px] font-black tracking-[0.06em] transition-colors"
                  style={
                    locale === code
                      ? { background: "#d4b15c", color: "#11131b" }
                      : { color: "#dbe2f0" }
                  }
                  onClick={() => setLocale(code)}
                >
                  {code === "zh-CN" ? "中" : "EN"}
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* Form */}
        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-3.5">
          {/* Matrix token */}
          <label className="flex flex-col gap-1.5 min-w-0 text-xs tracking-[0.14em] text-[rgba(190,198,220,0.92)]">
            {t("create.matrixToken")}
            <textarea
              className={`${inputClass} min-h-[76px] max-h-[124px] resize-y overflow-auto font-mono leading-relaxed`}
              style={{
                ...inputStyle,
                whiteSpace: "nowrap",
                overflowWrap: "normal",
                wordBreak: "normal",
              }}
              value={matrixToken}
              onChange={(e) => setMatrixToken(e.target.value)}
              placeholder={t("create.matrixTokenPlaceholder")}
              spellCheck={false}
            />
          </label>

          {/* Refresh rooms */}
          <div className="flex justify-end -mt-1">
            <button
              type="button"
              className="min-h-[42px] px-4 rounded-[9px] text-sm text-[#eef2fb] whitespace-nowrap transition-colors hover:bg-white/[0.12] disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.075)",
              }}
              onClick={() => void loadJoinedRooms()}
              disabled={roomsLoading}
            >
              {roomsLoading ? "..." : t("create.refreshRooms")}
            </button>
          </div>

          {/* Game title */}
          <label className="flex flex-col gap-1.5 min-w-0 text-xs tracking-[0.14em] text-[rgba(190,198,220,0.92)]">
            {t("create.gameTitle")}
            <input
              className={inputClass}
              style={inputStyle}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>

          {/* Source room */}
          <label className="flex flex-col gap-1.5 min-w-0 text-xs tracking-[0.14em] text-[rgba(190,198,220,0.92)]">
            {t("create.sourceRoom")}
            <FormSelect
              value={
                roomOptions.includes(roomSelectValue)
                  ? roomSelectValue
                  : "__custom__"
              }
              options={roomSelectOptions}
              onChange={onRoomSelect}
            />
          </label>

          {/* Custom room */}
          {roomSelectValue === "__custom__" ? (
            <label className="flex flex-col gap-1.5 min-w-0 text-xs tracking-[0.14em] text-[rgba(190,198,220,0.92)]">
              {t("create.customRoom")}
              <input
                className={inputClass}
                style={inputStyle}
                value={sourceMatrixRoomId}
                onChange={(e) => setSourceMatrixRoomId(e.target.value)}
                placeholder="!room:example.com"
              />
            </label>
          ) : null}

          {/* Language + speech rate */}
          <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
            <label className="flex flex-col gap-1.5 min-w-0 text-xs tracking-[0.14em] text-[rgba(190,198,220,0.92)]">
              {t("create.language")}
              <FormSelect
                value={language}
                options={languageOptions}
                onChange={(v) => setLanguage(v as "zh-CN" | "en")}
              />
            </label>
            <label className="flex flex-col gap-1.5 min-w-0 text-xs tracking-[0.14em] text-[rgba(190,198,220,0.92)]">
              {t("create.agentSpeechRate")}
              <FormSelect
                value={String(agentSpeechRate)}
                options={speechRateOptions}
                onChange={(v) => setAgentSpeechRate(Number(v))}
              />
            </label>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full min-h-[54px] mt-2 rounded-[9px] text-[#141009] font-black text-lg transition-all hover:-translate-y-px active:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0"
            style={{
              background: "linear-gradient(180deg, #f1d58a, #d4b15c)",
              boxShadow: "0 14px 34px rgba(212,177,92,0.24)",
            }}
            onMouseEnter={(e) => {
              if (!submitting)
                (e.currentTarget as HTMLButtonElement).style.boxShadow =
                  "0 18px 42px rgba(212,177,92,0.34)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.boxShadow =
                "0 14px 34px rgba(212,177,92,0.24)";
            }}
          >
            {submitting ? "..." : t("create.submit")}
          </button>

          {/* Error */}
          {error ? (
            <p className="m-0 text-[13px] text-[#ff9aa5]">{error}</p>
          ) : null}
        </form>
      </div>
    </section>
  );
}
