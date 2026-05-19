/**
 * create-iframe.tsx — iframe-mode create page (LobbyPage-style mobile UI).
 *
 * Shown when isHostRuntime() === true.
 * Token, userId and sourceMatrixRoomId are NOT entered manually — they have
 * already been written to localStorage by main.tsx's host-bridge bootstrap.
 * This component simply reads them and focuses on game config (player count,
 * language, voice) through BottomSheet pickers.
 *
 * No dependency on iframeMessage / HostBridge inside this file.
 */
import { useState } from "react";
import { co } from "@unseal-network/mobile-sdk";
import { MobileHeader } from "../components/MobileHeader";
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

// ── Props ────────────────────────────────────────────────────────────────────

export interface IframeCreatePageProps {
  initialError?: string;
  onGameCreated?: (
    gameRoomId: string,
    sourceMatrixRoomId: string
  ) => Promise<void> | void;
  /** Called when the user taps "Abandon". Defaults to bridge.hideApp(). */
  onLeave?: () => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export function IframeCreatePage({
  onGameCreated,
  onLeave,
}: IframeCreatePageProps) {
  // ── Shared game-config hook ──────────────────────────────────────────────
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

  // ── Local UI state ───────────────────────────────────────────────────────
  const [activeSheet, setActiveSheet] = useState<ActiveSheet>(null);
  const [meetingRequired, setMeetingRequired] = useState(false); // UI-only for now

  // ── Derived display values ───────────────────────────────────────────────
  const userId = readStoredMatrixUserId() ?? "";
  const displayName = readStoredMatrixDisplayName() ?? userId;
  const selectedLang =
    LANGUAGES.find((l) => l.code === language) ?? LANGUAGES[0]!;

  // ── Actions ─────────────────────────────────────────────────────────────
  async function handleCreate() {
    setError("");
    const token = readMatrixToken().trim();
    const roomId =
      (localStorage.getItem(SOURCE_ROOM_STORAGE_KEY) ?? "").trim();
    if (!roomId) {
      setError("未获取到来源房间 ID，请重新打开应用");
      return;
    }
    await submit({ sourceMatrixRoomId: roomId, matrixToken: token });
  }

  function handleLeave() {
    if (onLeave) {
      onLeave();
    } else {
      (window.iframeMessage as { hideApp?: () => void } | undefined)?.hideApp?.();
    }
  }

  function getInitial(name: string) {
    const s = name.startsWith("@") ? name.slice(1) : name;
    return (s.charAt(0) ?? "?").toUpperCase();
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-dvh w-full overflow-hidden flex flex-col relative"
      style={{ background: "linear-gradient(160deg, #07041a 0%, #0d0825 40%, #120930 70%, #0a0618 100%)" }}
    >
      {/* ── Ambient particles ──────────────────────────────────────────── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-[10%] left-1/2 -translate-x-1/2 w-80 h-80 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(109,40,217,0.28) 0%, transparent 70%)" }}
        />
        {[...Array(16)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              width: i % 3 === 0 ? 2 : 1,
              height: i % 3 === 0 ? 2 : 1,
              background: `rgba(${i % 2 === 0 ? "196,181,253" : "255,209,102"},${0.2 + (i % 4) * 0.1})`,
              left: `${((i * 37 + 13) % 90) + 5}%`,
              top: `${((i * 23 + 7) % 60) + 5}%`,
            }}
          />
        ))}
      </div>
      {/* ── Scrollable main content ─────────────────────────────────────── */}
      <div
        className="flex-1 relative z-10 overflow-y-auto flex flex-col gap-2.5"
        style={{ padding: "calc(var(--web-safe-area-top, 0px) + 2p) 20px 0" }}
      >
        {/* User identity chip */}
        {userId && (
          <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-[14px] bg-white/[0.03] border border-white/[0.07]">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-purple-text shrink-0 bg-violet-500/20 border border-violet-500/30">
              {getInitial(displayName)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] text-slate-200 font-semibold truncate">
                {displayName}
              </div>
              <div className="text-[10px] text-ink-faint truncate">
                {userId}
              </div>
            </div>
          </div>
        )}

        {/* Section header */}
        <div className="flex items-center gap-2.5 mt-1">
          <div
            className="flex-1 h-px"
            style={{ background: "linear-gradient(90deg, transparent, rgba(139,92,246,0.35))" }}
          />
          <span className="text-[10px] text-violet-500/70 tracking-[0.22em] font-bold">
            ✦ GAME SETUP ✦
          </span>
          <div
            className="flex-1 h-px"
            style={{ background: "linear-gradient(270deg, transparent, rgba(139,92,246,0.35))" }}
          />
        </div>

        {/* Config cards */}
        <div className="grid grid-cols-2 gap-2.5">
          {(
            [
              {
                icon: "👥",
                label: "人数",
                value: `${targetPlayerCount}P`,
                sheet: "players" as ActiveSheet,
              },
              {
                icon: "🌐",
                label: "语言",
                value: selectedLang.name,
                sheet: "language" as ActiveSheet,
              },
              {
                icon: "🎙",
                label: "语音",
                value: meetingRequired ? "已开启" : "已关闭",
                sheet: "voice" as ActiveSheet,
              },
            ] as const
          ).map(({ icon, label, value, sheet }) => (
            <button
              key={label}
              onClick={() => setActiveSheet(sheet)}
              className="bg-white/[0.04] border border-violet-500/[0.18] rounded-[18px] p-3.5 cursor-pointer text-left flex flex-col gap-1.5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <span className="text-sm">{icon}</span>
                  <span className="text-[10px] text-ink-muted font-semibold">{label}</span>
                </div>
                <span className="text-[10px] text-violet-500/50">›</span>
              </div>
              <div className="text-[15px] font-extrabold text-purple-text">
                {value}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Bottom CTA ───────────────────────────────────────────────────── */}
      <div
        className="shrink-0 relative z-10 flex flex-col gap-2"
        style={{ padding: "16px 20px calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
      >
        {/* Error */}
        {error && (
          <div className="text-center text-xs text-red-400 px-3 py-1.5 rounded-[10px] bg-red-500/10 border border-red-500/20">
            {error}
          </div>
        )}

        {/* Create button */}
        <button
          onClick={() => void handleCreate()}
          disabled={submitting}
          className="w-full h-16 rounded-[20px] text-lg font-extrabold flex items-center justify-center gap-2 transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
          style={{
            background: submitting ? "rgba(255,255,255,0.06)" : "linear-gradient(135deg, #5b21b6, #7c3aed)",
            border: submitting ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(255,209,102,0.5)",
            color: submitting ? "#475569" : "#ffd166",
            boxShadow: submitting ? "none" : "0 0 24px rgba(109,40,217,0.5)",
          }}
        >
          {submitting ? (
            <span className="w-[22px] h-[22px] rounded-full border-[2.5px] border-white/20 border-t-white inline-block animate-spin" />
          ) : (
            "🐺 创建游戏"
          )}
        </button>

        {/* Leave */}
        <button
          onClick={handleLeave}
          className="bg-transparent border-0 text-slate-400/50 text-xs cursor-pointer py-2 tracking-[0.12em] font-semibold"
        >
          ← Abandon
        </button>
      </div>

      {/* ── BottomSheets ─────────────────────────────────────────────────── */}

      {/* Player count */}
      <BottomSheet
        open={activeSheet === "players"}
        onClose={() => setActiveSheet(null)}
        title="玩家人数"
      >
        <div className="flex gap-3">
          {PLAYER_COUNTS.map((n) => (
            <button
              key={n}
              onClick={() => {
                setTargetPlayerCount(n);
                setActiveSheet(null);
              }}
              className="flex-1 py-5 rounded-2xl cursor-pointer transition-colors"
              style={{
                background: targetPlayerCount === n ? "rgba(109,40,217,0.25)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${targetPlayerCount === n ? "rgba(139,92,246,0.6)" : "rgba(255,255,255,0.08)"}`,
              }}
            >
              <div
                className="text-2xl font-extrabold text-center"
                style={{ color: targetPlayerCount === n ? "#c4b5fd" : "#64748b" }}
              >
                {n}
              </div>
              <div
                className="text-[11px] text-center mt-0.5"
                style={{ color: targetPlayerCount === n ? "rgba(196,181,253,0.7)" : "#475569" }}
              >
                人局
              </div>
            </button>
          ))}
        </div>
      </BottomSheet>

      {/* Language */}
      <BottomSheet
        open={activeSheet === "language"}
        onClose={() => setActiveSheet(null)}
        title="语言设置"
      >
        <div className="grid grid-cols-2 gap-2.5">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => {
                setLanguage(lang.code);
                setActiveSheet(null);
              }}
              className="p-3.5 rounded-[14px] cursor-pointer text-[15px] font-bold text-center transition-colors"
              style={{
                background: language === lang.code ? "rgba(109,40,217,0.22)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${language === lang.code ? "rgba(139,92,246,0.55)" : "rgba(255,255,255,0.08)"}`,
                color: language === lang.code ? "#c4b5fd" : "#64748b",
              }}
            >
              {lang.name}
            </button>
          ))}
        </div>
      </BottomSheet>

      {/* Voice (UI-only, meetingRequired not yet wired to API) */}
      <BottomSheet
        open={activeSheet === "voice"}
        onClose={() => setActiveSheet(null)}
        title="语音通话"
      >
        <div className="flex flex-col gap-2.5">
          {(
            [
              {
                value: true,
                label: "开启语音",
                desc: "玩家可使用语音通话",
                icon: "🎙",
              },
              {
                value: false,
                label: "关闭语音",
                desc: "仅使用文字模式",
                icon: "🔇",
              },
            ] as const
          ).map((opt) => (
            <button
              key={String(opt.value)}
              onClick={() => {
                setMeetingRequired(opt.value);
                setActiveSheet(null);
              }}
              className="flex items-center gap-3.5 p-4 rounded-2xl cursor-pointer text-left w-full transition-colors"
              style={{
                background: meetingRequired === opt.value ? "rgba(109,40,217,0.22)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${meetingRequired === opt.value ? "rgba(139,92,246,0.55)" : "rgba(255,255,255,0.08)"}`,
              }}
            >
              <span className="text-2xl">{opt.icon}</span>
              <div>
                <div
                  className="text-sm font-bold"
                  style={{ color: meetingRequired === opt.value ? "#c4b5fd" : "#e2e8f0" }}
                >
                  {opt.label}
                </div>
                <div className="text-xs text-ink-muted mt-0.5">{opt.desc}</div>
              </div>
              {meetingRequired === opt.value && (
                <span className="ml-auto text-violet-500 text-lg">✓</span>
              )}
            </button>
          ))}
        </div>
      </BottomSheet>

      <style>{`
        @keyframes ic-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
