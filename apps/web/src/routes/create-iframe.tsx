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
  Globe,
  Gauge,
  Users,
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

const LANGUAGES = [
  { code: "zh-CN" as const, name: "中文" },
  { code: "en" as const, name: "EN" },
];

type ActiveSheet = "language" | "speechRate" | "playerCount" | null;

const SPEECH_RATE_OPTIONS = [
  { value: 1,    label: "1x",    desc: { "zh-CN": "正常", en: "Normal" } },
  { value: 1.25, label: "1.25x", desc: { "zh-CN": "稍快", en: "Faster" } },
  { value: 1.5,  label: "1.5x",  desc: { "zh-CN": "快速", en: "Fast"   } },
  { value: 1.75, label: "1.75x", desc: { "zh-CN": "较快", en: "Quick"  } },
  { value: 2,    label: "2x",    desc: { "zh-CN": "极速", en: "Turbo"  } },
] as const;

const I18N = {
  "zh-CN": {
    gameTitle:        "狼人杀",
    createRoom:       "CREATE ROOM",
    settings:         "游戏设置",
    language:         "游戏语言",
    speechRate:       "语音倍速",
    playerCount:      "游戏人数",
    playerCountUnit:  "人",
    createButton:     "创建游戏",
    backLabel:        "返回",
    noRoomError:      "未获取到来源房间 ID，请重新打开应用",
    languageSheet:    "游戏语言",
    speechRateSheet:  "语音倍速",
    playerCountSheet: "游戏人数",
    speechRateNormal: "正常",
    speechRateTurbo:  "极速",
  },
  en: {
    gameTitle:        "Werewolf",
    createRoom:       "CREATE ROOM",
    settings:         "SETTINGS",
    language:         "Language",
    speechRate:       "Speech Speed",
    playerCount:      "Players",
    playerCountUnit:  "",
    createButton:     "Create Game",
    backLabel:        "Back",
    noRoomError:      "Source room ID not found, please reopen the app",
    languageSheet:    "Game Language",
    speechRateSheet:  "Speech Speed",
    playerCountSheet: "Players",
    speechRateNormal: "Normal",
    speechRateTurbo:  "Turbo",
  },
} as const;

type Lang = keyof typeof I18N;

function speechRateLabel(rate: number, lang: Lang): string {
  if (rate === 1) return I18N[lang].speechRateNormal;
  if (rate === 2) return I18N[lang].speechRateTurbo;
  return `${rate}x`;
}

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

const PLAYER_COUNT_OPTIONS = [6, 7, 8, 9, 10, 11, 12] as const;

export function IframeCreatePage({ onGameCreated, onLeave }: IframeCreatePageProps) {
  const {
    language,
    setLanguage,
    agentSpeechRate,
    setAgentSpeechRate,
    targetPlayerCount,
    setTargetPlayerCount,
    submitting,
    error,
    setError,
    submit,
  } = useCreateGame({ onGameCreated });

  const [activeSheet, setActiveSheet] = useState<ActiveSheet>(null);

  const userId      = readStoredMatrixUserId() ?? "";
  const displayName = readStoredMatrixDisplayName() ?? userId;
  const selectedLang = LANGUAGES.find((l) => l.code === language) ?? LANGUAGES[0]!;
  const t = I18N[language as Lang] ?? I18N["zh-CN"];

  async function handleCreate() {
    setError("");
    const token  = readMatrixToken().trim();
    const roomId = (localStorage.getItem(SOURCE_ROOM_STORAGE_KEY) ?? "").trim();
    if (!roomId) { setError(t.noRoomError); return; }
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
      key: "language" as ActiveSheet,
      Icon: Globe,
      label: t.language,
      value: selectedLang.name,
    },
    {
      key: "speechRate" as ActiveSheet,
      Icon: Gauge,
      label: t.speechRate,
      value: speechRateLabel(agentSpeechRate, language as Lang),
    },
    {
      key: "playerCount" as ActiveSheet,
      Icon: Users,
      label: t.playerCount,
      value: `${targetPlayerCount}${t.playerCountUnit}`,
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
          aria-label={t.backLabel}
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
            {t.gameTitle}
          </h1>
          <p
            className="m-0 font-semibold"
            style={{ fontSize: 11, color: "rgba(212,177,92,0.80)", letterSpacing: "0.3em" }}
          >
            {t.createRoom}
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
              {t.settings}
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
                <span>{t.createButton}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── BottomSheets ─────────────────────────────────────────────── */}

      {/* Language */}
      <BottomSheet open={activeSheet === "language"} onClose={() => setActiveSheet(null)} title={t.languageSheet}>
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

      {/* Player count */}
      <BottomSheet open={activeSheet === "playerCount"} onClose={() => setActiveSheet(null)} title={t.playerCountSheet}>
        <div className="grid grid-cols-4 gap-2.5">
          {PLAYER_COUNT_OPTIONS.map((count) => {
            const selected = targetPlayerCount === count;
            return (
              <button
                key={count}
                onClick={() => { setTargetPlayerCount(count); setActiveSheet(null); }}
                className="py-4 rounded-[14px] cursor-pointer font-bold text-center transition-all active:scale-[0.97] flex flex-col items-center gap-1"
                style={{
                  background: selected ? "rgba(212,177,92,0.14)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${selected ? "rgba(207,176,91,0.55)" : "rgba(255,255,255,0.08)"}`,
                  color: selected ? "#d4b15c" : "rgba(255,247,216,0.40)",
                  fontSize: 18,
                }}
              >
                {count}
                {selected && <Check size={12} color="#d4b15c" strokeWidth={3} />}
              </button>
            );
          })}
        </div>
      </BottomSheet>

      {/* Speech rate */}
      <BottomSheet open={activeSheet === "speechRate"} onClose={() => setActiveSheet(null)} title={t.speechRateSheet}>
        <div className="flex gap-2">
          {SPEECH_RATE_OPTIONS.map(({ value, label, desc: descMap }) => {
            const desc = descMap[language as Lang] ?? descMap["zh-CN"];
            const selected = agentSpeechRate === value;
            return (
              <button
                key={value}
                onClick={() => { setAgentSpeechRate(value); setActiveSheet(null); }}
                className="flex-1 py-4 rounded-2xl cursor-pointer transition-all active:scale-[0.97] flex flex-col items-center gap-0.5"
                style={{
                  background: selected ? "rgba(212,177,92,0.14)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${selected ? "rgba(207,176,91,0.55)" : "rgba(255,255,255,0.08)"}`,
                }}
              >
                <span
                  className="text-base font-black"
                  style={{ color: selected ? "#d4b15c" : "rgba(255,247,216,0.35)" }}
                >
                  {label}
                </span>
                <span
                  className="text-[10px]"
                  style={{ color: selected ? "rgba(212,177,92,0.65)" : "rgba(255,247,216,0.22)" }}
                >
                  {desc}
                </span>
                {selected && <Check size={11} color="#d4b15c" strokeWidth={3} className="mt-0.5" />}
              </button>
            );
          })}
        </div>
      </BottomSheet>
    </div>
  );
}
