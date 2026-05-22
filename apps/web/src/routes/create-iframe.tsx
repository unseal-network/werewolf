/**
 * create-iframe.tsx — iframe-mode create page (LobbyPage-style mobile UI).
 *
 * Shown when isHostRuntime() === true.
 * Token, userId and sourceMatrixRoomId are NOT entered manually — they have
 * already been written to localStorage by main.tsx's host-bridge bootstrap.
 */
import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Users,
  Globe,
  Mic2,
  MicOff,
  Check,
} from "lucide-react";
import { BottomSheet } from "../components/BottomSheet";
import { useCreateGame } from "../hooks/useCreateGame";
import {
  SOURCE_ROOM_STORAGE_KEY,
  readMatrixToken,
  readStoredMatrixDisplayName,
  readStoredMatrixUserId,
} from "../matrix/session";

// ── Constants ────────────────────────────────────────────────────────────────

const PLAYER_COUNTS = [6, 8, 12] as const;
const LANGUAGES = [
  { code: "zh-CN" as const, name: "中文" },
  { code: "en" as const, name: "EN" },
];

type ActiveSheet = "players" | "language" | "voice" | null;

const base = `${(import.meta.env.BASE_URL ?? "/").replace(/\/?$/, "/")}`;
const assetBase = `${base}assets/werewolf-ui/final`;
const bgDay = `${base}assets/animation-demo/village-stage-day.avif`;

// ── Props ────────────────────────────────────────────────────────────────────

export interface IframeCreatePageProps {
  initialError?: string;
  onGameCreated?: (
    gameRoomId: string,
    sourceMatrixRoomId: string
  ) => Promise<void> | void;
  onLeave?: () => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export function IframeCreatePage({ onGameCreated, onLeave }: IframeCreatePageProps) {
  const {
    language,
    setLanguage,
    targetPlayerCount,
    setTargetPlayerCount,
    submitting,
    error,
    setError,
    submit,
  } = useCreateGame({ onGameCreated });

  const [activeSheet, setActiveSheet] = useState<ActiveSheet>(null);
  const [meetingRequired, setMeetingRequired] = useState(false);

  const userId      = readStoredMatrixUserId() ?? "";
  const displayName = readStoredMatrixDisplayName() ?? userId;
  const selectedLang = LANGUAGES.find((l) => l.code === language) ?? LANGUAGES[0]!;

  async function handleCreate() {
    setError("");
    const token  = readMatrixToken().trim();
    const roomId = (localStorage.getItem(SOURCE_ROOM_STORAGE_KEY) ?? "").trim();
    if (!roomId) { setError("未获取到来源房间 ID，请重新打开应用"); return; }
    await submit({ sourceMatrixRoomId: roomId, matrixToken: token });
  }

  function handleLeave() {
    if (onLeave) onLeave();
    else (window.iframeMessage as { hideApp?: () => void } | undefined)?.hideApp?.();
  }

  function getInitial(name: string) {
    const s = name.startsWith("@") ? name.slice(1) : name;
    return (s.charAt(0) ?? "?").toUpperCase();
  }

  // ── Config row definitions ──────────────────────────────────────────────
  const configRows = [
    {
      key: "players" as ActiveSheet,
      Icon: Users,
      label: "玩家人数",
      value: `${targetPlayerCount} 人`,
    },
    {
      key: "language" as ActiveSheet,
      Icon: Globe,
      label: "游戏语言",
      value: selectedLang.name,
    },
    {
      key: "voice" as ActiveSheet,
      Icon: meetingRequired ? Mic2 : MicOff,
      label: "语音模式",
      value: meetingRequired ? "已开启" : "已关闭",
    },
  ];

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="h-dvh w-full flex flex-col overflow-hidden relative">

      {/* ── Hero section: village image ──────────────────────────────── */}
      <div className="relative shrink-0" style={{ height: "42dvh", minHeight: 200 }}>
        {/* Village background */}
        <img
          src={bgDay}
          className="absolute inset-0 w-full h-full object-cover object-center select-none pointer-events-none"
          style={{ filter: "saturate(0.78) brightness(0.68)" }}
          aria-hidden
          loading="eager"
        />
        {/* Bottom fade into panel */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(to bottom, rgba(6,4,12,0.18) 0%, rgba(6,4,12,0.55) 60%, rgba(6,4,12,1.00) 100%)",
          }}
        />
        {/* Top safe-area fade */}
        <div
          className="absolute inset-x-0 top-0 pointer-events-none"
          style={{
            height: "calc(var(--web-safe-area-top, 0px) + 72px)",
            background: "linear-gradient(to bottom, rgba(6,4,12,0.55) 0%, transparent 100%)",
          }}
        />

        {/* Back button */}
        <button
          onClick={handleLeave}
          aria-label="返回"
          className="absolute z-10 w-[40px] h-[40px] rounded-[10px] flex items-center justify-center transition-all duration-150 active:scale-90 cursor-pointer"
          style={{
            top: "calc(var(--web-safe-area-top, 0px) + 12px)",
            left: "16px",
            background: "rgba(6,4,12,0.55)",
            border: "1px solid rgba(207,176,91,0.30)",
            color: "rgba(255,247,216,0.85)",
            backdropFilter: "blur(8px)",
          }}
        >
          <ChevronLeft size={18} strokeWidth={2} />
        </button>

        {/* Hero title */}
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-8 gap-1">
          <img
            src={`${assetBase}/hud/moon-medallion.webp`}
            style={{ width: 52, height: 52, filter: "drop-shadow(0 2px 12px rgba(212,177,92,0.60))" }}
            aria-hidden
          />
          <h1
            className="font-black m-0"
            style={{
              fontSize: 28,
              color: "#fff7d8",
              textShadow: "0 2px 16px rgba(0,0,0,0.90), 0 0 32px rgba(212,177,92,0.25)",
              letterSpacing: "0.08em",
            }}
          >
            狼人杀
          </h1>
          <p
            className="m-0 font-semibold"
            style={{ fontSize: 11, color: "rgba(212,177,92,0.80)", letterSpacing: "0.3em" }}
          >
            CREATE ROOM
          </p>
        </div>
      </div>

      {/* ── Bottom panel ─────────────────────────────────────────────── */}
      <div
        className="flex-1 flex flex-col overflow-y-auto"
        style={{ background: "rgba(6,4,12,1)" }}
      >
        {/* Glass card: config rows */}
        <div className="px-5 pt-4 pb-2 flex-1 flex flex-col gap-3">

          {/* Section label */}
          <div className="flex items-center gap-2.5">
            <div className="flex-1 h-px" style={{ background: "rgba(207,176,91,0.18)" }} />
            <span
              className="text-[10px] font-bold tracking-[0.22em]"
              style={{ color: "rgba(212,177,92,0.55)" }}
            >
              游戏设置
            </span>
            <div className="flex-1 h-px" style={{ background: "rgba(207,176,91,0.18)" }} />
          </div>

          {/* Config rows inside a card */}
          <div
            className="rounded-[16px] overflow-hidden"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(207,176,91,0.16)",
            }}
          >
            {configRows.map(({ key, Icon, label, value }, idx) => (
              <button
                key={key}
                onClick={() => setActiveSheet(key)}
                className="w-full flex items-center gap-3.5 px-4 py-[14px] transition-all duration-100 active:bg-white/[0.03] cursor-pointer"
                style={{
                  borderBottom:
                    idx < configRows.length - 1
                      ? "1px solid rgba(255,247,216,0.055)"
                      : "none",
                }}
              >
                <div
                  className="w-8 h-8 rounded-[9px] flex items-center justify-center shrink-0"
                  style={{
                    background: "rgba(212,177,92,0.12)",
                    border: "1px solid rgba(207,176,91,0.22)",
                  }}
                >
                  <Icon size={15} color="#d4b15c" />
                </div>
                <span
                  className="flex-1 text-left text-[14px] font-medium"
                  style={{ color: "rgba(255,247,216,0.70)" }}
                >
                  {label}
                </span>
                <span
                  className="text-[14px] font-bold shrink-0"
                  style={{ color: "#d4b15c" }}
                >
                  {value}
                </span>
                <ChevronRight size={14} color="rgba(207,176,91,0.40)" strokeWidth={2.5} />
              </button>
            ))}
          </div>

          {/* Identity chip */}
          {userId && (
            <div
              className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-[12px]"
              style={{
                background: "rgba(255,255,255,0.025)",
                border: "1px solid rgba(255,255,255,0.07)",
              }}
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{
                  background: "rgba(212,177,92,0.14)",
                  border: "1px solid rgba(207,176,91,0.28)",
                  color: "#d4b15c",
                }}
              >
                {getInitial(displayName)}
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className="text-[12px] font-semibold truncate"
                  style={{ color: "rgba(255,247,216,0.75)" }}
                >
                  {displayName}
                </div>
                <div
                  className="text-[10px] truncate"
                  style={{ color: "rgba(255,247,216,0.30)" }}
                >
                  {userId}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* CTA area */}
        <div
          className="shrink-0 px-5 flex flex-col gap-2"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)", paddingTop: 4 }}
        >
          {/* Error banner */}
          {error && (
            <div
              className="text-center text-xs px-3 py-2 rounded-[10px]"
              style={{
                color: "#fca5a5",
                background: "rgba(239,68,68,0.10)",
                border: "1px solid rgba(239,68,68,0.28)",
              }}
            >
              {error}
            </div>
          )}

          {/* Create button */}
          <button
            onClick={() => void handleCreate()}
            disabled={submitting}
            className="w-full h-[56px] rounded-[14px] flex items-center justify-center gap-2.5 font-black text-[16px] transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.97] cursor-pointer"
            style={{
              background: submitting
                ? "rgba(255,255,255,0.04)"
                : "linear-gradient(135deg, #2e2008 0%, #503515 50%, #2e2008 100%)",
              border: `1px solid ${submitting ? "rgba(207,176,91,0.12)" : "rgba(207,176,91,0.70)"}`,
              boxShadow: submitting
                ? "none"
                : "0 0 28px rgba(212,177,92,0.25), inset 0 1px 0 rgba(255,247,216,0.08)",
              color: submitting ? "rgba(255,247,216,0.30)" : "#d4b15c",
              letterSpacing: "0.06em",
              textShadow: submitting ? "none" : "0 2px 8px rgba(0,0,0,0.80)",
            }}
          >
            {submitting ? (
              <span
                className="w-5 h-5 rounded-full border-2 inline-block animate-spin"
                style={{ borderColor: "rgba(212,177,92,0.20)", borderTopColor: "#d4b15c" }}
              />
            ) : (
              <>
                <span>🐺</span>
                <span>创建游戏</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── BottomSheets ─────────────────────────────────────────────── */}

      {/* Player count */}
      <BottomSheet open={activeSheet === "players"} onClose={() => setActiveSheet(null)} title="玩家人数">
        <div className="flex gap-3">
          {PLAYER_COUNTS.map((n) => (
            <button
              key={n}
              onClick={() => { setTargetPlayerCount(n); setActiveSheet(null); }}
              className="flex-1 py-5 rounded-2xl cursor-pointer transition-all active:scale-[0.97] flex flex-col items-center gap-0.5"
              style={{
                background: targetPlayerCount === n ? "rgba(212,177,92,0.14)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${targetPlayerCount === n ? "rgba(207,176,91,0.55)" : "rgba(255,255,255,0.08)"}`,
              }}
            >
              <span
                className="text-2xl font-black"
                style={{ color: targetPlayerCount === n ? "#d4b15c" : "rgba(255,247,216,0.35)" }}
              >
                {n}
              </span>
              <span
                className="text-[11px]"
                style={{ color: targetPlayerCount === n ? "rgba(212,177,92,0.65)" : "rgba(255,247,216,0.22)" }}
              >
                人局
              </span>
              {targetPlayerCount === n && (
                <Check size={12} color="#d4b15c" strokeWidth={3} className="mt-0.5" />
              )}
            </button>
          ))}
        </div>
      </BottomSheet>

      {/* Language */}
      <BottomSheet open={activeSheet === "language"} onClose={() => setActiveSheet(null)} title="游戏语言">
        <div className="grid grid-cols-2 gap-2.5">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => { setLanguage(lang.code); setActiveSheet(null); }}
              className="p-4 rounded-[14px] cursor-pointer font-bold text-center transition-all active:scale-[0.97] flex flex-col items-center gap-1.5"
              style={{
                background: language === lang.code ? "rgba(212,177,92,0.14)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${language === lang.code ? "rgba(207,176,91,0.55)" : "rgba(255,255,255,0.08)"}`,
                color: language === lang.code ? "#d4b15c" : "rgba(255,247,216,0.40)",
                fontSize: 16,
              }}
            >
              {lang.name}
              {language === lang.code && <Check size={13} color="#d4b15c" strokeWidth={3} />}
            </button>
          ))}
        </div>
      </BottomSheet>

      {/* Voice */}
      <BottomSheet open={activeSheet === "voice"} onClose={() => setActiveSheet(null)} title="语音模式">
        <div className="flex flex-col gap-2.5">
          {(
            [
              { value: true,  Icon: Mic2,   label: "开启语音", desc: "玩家可使用麦克风通话" },
              { value: false, Icon: MicOff, label: "关闭语音", desc: "仅文字交流模式"       },
            ] as const
          ).map(({ value, Icon: RowIcon, label, desc }) => (
            <button
              key={String(value)}
              onClick={() => { setMeetingRequired(value); setActiveSheet(null); }}
              className="flex items-center gap-3.5 p-4 rounded-2xl cursor-pointer text-left w-full transition-all active:scale-[0.98]"
              style={{
                background: meetingRequired === value ? "rgba(212,177,92,0.12)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${meetingRequired === value ? "rgba(207,176,91,0.55)" : "rgba(255,255,255,0.08)"}`,
              }}
            >
              <div
                className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0"
                style={{
                  background: meetingRequired === value ? "rgba(212,177,92,0.15)" : "rgba(255,255,255,0.05)",
                  border: `1px solid ${meetingRequired === value ? "rgba(207,176,91,0.35)" : "rgba(255,255,255,0.08)"}`,
                }}
              >
                <RowIcon size={17} color={meetingRequired === value ? "#d4b15c" : "rgba(255,247,216,0.40)"} />
              </div>
              <div className="flex-1">
                <div
                  className="text-sm font-bold"
                  style={{ color: meetingRequired === value ? "#fff7d8" : "rgba(255,247,216,0.50)" }}
                >
                  {label}
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: "rgba(255,247,216,0.30)" }}>
                  {desc}
                </div>
              </div>
              {meetingRequired === value && (
                <Check size={16} color="#d4b15c" strokeWidth={2.5} className="shrink-0" />
              )}
            </button>
          ))}
        </div>
      </BottomSheet>
    </div>
  );
}
