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
import { createHostBridge } from "../runtime/hostBridge";

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
      createHostBridge().hideApp?.();
    }
  }

  function getInitial(name: string) {
    const s = name.startsWith("@") ? name.slice(1) : name;
    return (s.charAt(0) ?? "?").toUpperCase();
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        minHeight: "100dvh",
        width: "100%",
        overflow: "hidden",
        background:
          "linear-gradient(160deg, #07041a 0%, #0d0825 40%, #120930 70%, #0a0618 100%)",
        display: "flex",
        flexDirection: "column",
        position: "relative",
      }}
    >
      {/* ── Ambient particles ────────────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "10%",
            left: "50%",
            transform: "translateX(-50%)",
            width: 320,
            height: 320,
            background:
              "radial-gradient(circle, rgba(109,40,217,0.28) 0%, transparent 70%)",
            borderRadius: "50%",
          }}
        />
        {[...Array(16)].map((_, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              width: i % 3 === 0 ? 2 : 1,
              height: i % 3 === 0 ? 2 : 1,
              borderRadius: "50%",
              background: `rgba(${i % 2 === 0 ? "196,181,253" : "255,209,102"},${0.2 + (i % 4) * 0.1})`,
              left: `${((i * 37 + 13) % 90) + 5}%`,
              top: `${((i * 23 + 7) % 60) + 5}%`,
            }}
          />
        ))}
      </div>

      {/* ── Mobile close/more header ─────────────────────────────────────── */}
      {co.isMobile && (
        <MobileHeader onClose={handleLeave} />
      )}

      {/* ── Scrollable main content ──────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          position: "relative",
          zIndex: 10,
          padding: "calc(var(--web-safe-area-top, 0px) + 52px) 20px 0",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          overflowY: "auto",
        }}
      >
        {/* User identity chip */}
        {userId && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              borderRadius: 14,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "rgba(139,92,246,0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                fontWeight: 700,
                color: "#c4b5fd",
                border: "1px solid rgba(139,92,246,0.3)",
                flexShrink: 0,
              }}
            >
              {getInitial(displayName)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  color: "#e2e8f0",
                  fontWeight: 600,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {displayName}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: "#475569",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {userId}
              </div>
            </div>
          </div>
        )}

        {/* Section header */}
        <div
          style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}
        >
          <div
            style={{
              flex: 1,
              height: 1,
              background:
                "linear-gradient(90deg, transparent, rgba(139,92,246,0.35))",
            }}
          />
          <span
            style={{
              fontSize: 10,
              color: "rgba(139,92,246,0.7)",
              letterSpacing: "0.22em",
              fontWeight: 700,
            }}
          >
            ✦ GAME SETUP ✦
          </span>
          <div
            style={{
              flex: 1,
              height: 1,
              background:
                "linear-gradient(270deg, transparent, rgba(139,92,246,0.35))",
            }}
          />
        </div>

        {/* Config cards */}
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
        >
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
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(139,92,246,0.18)",
                borderRadius: 18,
                padding: 14,
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: 5 }}
                >
                  <span style={{ fontSize: 14 }}>{icon}</span>
                  <span
                    style={{ fontSize: 10, color: "#64748b", fontWeight: 600 }}
                  >
                    {label}
                  </span>
                </div>
                <span style={{ fontSize: 10, color: "rgba(139,92,246,0.5)" }}>
                  ›
                </span>
              </div>
              <div
                style={{ fontSize: 15, fontWeight: 800, color: "#c4b5fd" }}
              >
                {value}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Bottom CTA ───────────────────────────────────────────────────── */}
      <div
        style={{
          flexShrink: 0,
          position: "relative",
          zIndex: 10,
          padding:
            "16px 20px calc(env(safe-area-inset-bottom, 0px) + 16px)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {/* Error */}
        {error && (
          <div
            style={{
              textAlign: "center",
              fontSize: 12,
              color: "#f87171",
              padding: "6px 12px",
              borderRadius: 10,
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.2)",
            }}
          >
            {error}
          </div>
        )}

        {/* Create button */}
        <button
          onClick={() => void handleCreate()}
          disabled={submitting}
          style={{
            width: "100%",
            height: 64,
            borderRadius: 20,
            background: submitting
              ? "rgba(255,255,255,0.06)"
              : "linear-gradient(135deg, #5b21b6, #7c3aed)",
            border: submitting
              ? "1px solid rgba(255,255,255,0.08)"
              : "1px solid rgba(255,209,102,0.5)",
            color: submitting ? "#475569" : "#ffd166",
            fontSize: 18,
            fontWeight: 800,
            cursor: submitting ? "not-allowed" : "pointer",
            opacity: submitting ? 0.6 : 1,
            boxShadow: submitting
              ? "none"
              : "0 0 24px rgba(109,40,217,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            transition: "all 150ms",
          }}
        >
          {submitting ? (
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                border: "2.5px solid rgba(255,255,255,0.2)",
                borderTopColor: "#fff",
                display: "inline-block",
                animation: "ic-spin 0.8s linear infinite",
              }}
            />
          ) : (
            "🐺 创建游戏"
          )}
        </button>

        {/* Leave */}
        <button
          onClick={handleLeave}
          style={{
            background: "transparent",
            border: "none",
            color: "rgba(148,163,184,0.5)",
            fontSize: 12,
            cursor: "pointer",
            padding: "8px",
            letterSpacing: "0.12em",
            fontWeight: 600,
          }}
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
        <div style={{ display: "flex", gap: 12 }}>
          {PLAYER_COUNTS.map((n) => (
            <button
              key={n}
              onClick={() => {
                setTargetPlayerCount(n);
                setActiveSheet(null);
              }}
              style={{
                flex: 1,
                padding: "20px 0",
                borderRadius: 16,
                background:
                  targetPlayerCount === n
                    ? "rgba(109,40,217,0.25)"
                    : "rgba(255,255,255,0.04)",
                border: `1px solid ${
                  targetPlayerCount === n
                    ? "rgba(139,92,246,0.6)"
                    : "rgba(255,255,255,0.08)"
                }`,
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 800,
                  color:
                    targetPlayerCount === n ? "#c4b5fd" : "#64748b",
                  textAlign: "center",
                }}
              >
                {n}
              </div>
              <div
                style={{
                  fontSize: 11,
                  textAlign: "center",
                  color:
                    targetPlayerCount === n
                      ? "rgba(196,181,253,0.7)"
                      : "#475569",
                  marginTop: 2,
                }}
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
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
        >
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => {
                setLanguage(lang.code);
                setActiveSheet(null);
              }}
              style={{
                padding: 14,
                borderRadius: 14,
                background:
                  language === lang.code
                    ? "rgba(109,40,217,0.22)"
                    : "rgba(255,255,255,0.04)",
                border: `1px solid ${
                  language === lang.code
                    ? "rgba(139,92,246,0.55)"
                    : "rgba(255,255,255,0.08)"
                }`,
                cursor: "pointer",
                fontSize: 15,
                fontWeight: 700,
                color: language === lang.code ? "#c4b5fd" : "#64748b",
                textAlign: "center",
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
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: 16,
                borderRadius: 16,
                background:
                  meetingRequired === opt.value
                    ? "rgba(109,40,217,0.22)"
                    : "rgba(255,255,255,0.04)",
                border: `1px solid ${
                  meetingRequired === opt.value
                    ? "rgba(139,92,246,0.55)"
                    : "rgba(255,255,255,0.08)"
                }`,
                cursor: "pointer",
                textAlign: "left",
                width: "100%",
              }}
            >
              <span style={{ fontSize: 24 }}>{opt.icon}</span>
              <div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color:
                      meetingRequired === opt.value ? "#c4b5fd" : "#e2e8f0",
                  }}
                >
                  {opt.label}
                </div>
                <div
                  style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}
                >
                  {opt.desc}
                </div>
              </div>
              {meetingRequired === opt.value && (
                <span
                  style={{
                    marginLeft: "auto",
                    color: "#8b5cf6",
                    fontSize: 18,
                  }}
                >
                  ✓
                </span>
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
