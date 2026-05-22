import { useEffect } from "react";
import { ChevronLeft, AlertTriangle, RefreshCw, Loader2, Settings2 } from "lucide-react";

interface LoadingPageProps {
  isAdmin?: boolean;
  onAdminAction?: () => void;
  error?: string | null;
  message?: string | undefined;
  detail?: string | undefined;
  onRetry?: () => void;
  onLeave?: () => void;
}

const base      = `${(import.meta.env.BASE_URL ?? "/").replace(/\/?$/, "/")}`;
const assetBase = `${base}assets/werewolf-ui/final`;
const bgDay     = `${base}assets/animation-demo/village-stage-day.avif`;

export function LoadingPage({
  isAdmin,
  onAdminAction,
  error,
  message,
  detail,
  onRetry,
  onLeave,
}: LoadingPageProps) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div className="h-dvh w-full flex flex-col overflow-hidden relative">

      {/* ── Hero section ─────────────────────────────────────────────── */}
      <div className="relative shrink-0" style={{ height: "52dvh", minHeight: 240 }}>

        {/* Village background */}
        <img
          src={bgDay}
          className="absolute inset-0 w-full h-full object-cover object-center select-none pointer-events-none"
          style={{ filter: "saturate(0.72) brightness(0.62)" }}
          aria-hidden
          loading="eager"
        />

        {/* Bottom fade */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(to bottom, rgba(6,4,12,0.22) 0%, rgba(6,4,12,0.50) 55%, rgba(6,4,12,1.00) 100%)",
          }}
        />

        {/* Top safe-area fade */}
        <div
          className="absolute inset-x-0 top-0 pointer-events-none"
          style={{
            height: "calc(var(--web-safe-area-top, 0px) + 80px)",
            background: "linear-gradient(to bottom, rgba(6,4,12,0.60) 0%, transparent 100%)",
          }}
        />

        {/* Back button */}
        {onLeave && (
          <button
            onClick={onLeave}
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
        )}

        {/* Admin button */}
        {isAdmin && onAdminAction && (
          <button
            onClick={onAdminAction}
            aria-label="管理"
            className="absolute z-10 w-[40px] h-[40px] rounded-[10px] flex items-center justify-center transition-all duration-150 active:scale-90 cursor-pointer"
            style={{
              top: "calc(var(--web-safe-area-top, 0px) + 12px)",
              right: "16px",
              background: "rgba(6,4,12,0.55)",
              border: "1px solid rgba(207,176,91,0.22)",
              color: "rgba(212,177,92,0.75)",
              backdropFilter: "blur(8px)",
            }}
          >
            <Settings2 size={16} strokeWidth={2} />
          </button>
        )}

        {/* Hero content: moon icon + title */}
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-10 gap-2">
          {/* Moon medallion with glow + float */}
          <div className="relative flex items-center justify-center" style={{ width: 72, height: 72 }}>
            <div
              className="absolute rounded-full pointer-events-none"
              style={{
                inset: "-24px",
                background: "radial-gradient(circle, rgba(212,177,92,0.18) 0%, transparent 68%)",
                animation: "lp-glow-pulse 3s ease-in-out infinite",
              }}
            />
            <img
              src={`${assetBase}/effect/avatar-selected-glow.webp`}
              className="absolute pointer-events-none select-none"
              style={{
                inset: "-22px",
                width: "calc(100% + 44px)",
                opacity: 0.40,
                animation: "lp-glow-pulse 3s ease-in-out infinite",
              }}
              aria-hidden
            />
            <img
              src={`${assetBase}/hud/moon-medallion.webp`}
              style={{
                width: 68,
                height: 68,
                filter: "drop-shadow(0 0 14px rgba(212,177,92,0.65)) drop-shadow(0 4px 10px rgba(0,0,0,0.80))",
                animation: "lp-float 4s ease-in-out infinite",
              }}
              aria-hidden
            />
          </div>

          <h1
            className="font-black m-0"
            style={{
              fontSize: 30,
              color: "#fff7d8",
              textShadow: "0 2px 18px rgba(0,0,0,0.90), 0 0 28px rgba(212,177,92,0.22)",
              letterSpacing: "0.08em",
            }}
          >
            狼人杀
          </h1>

          <p
            className="m-0 font-semibold"
            style={{
              fontSize: 11,
              letterSpacing: "0.30em",
              color: error ? "rgba(252,165,165,0.75)" : "rgba(212,177,92,0.80)",
            }}
          >
            {error ? "CONNECTION FAILED" : "CONNECTING..."}
          </p>
        </div>
      </div>

      {/* ── Bottom panel ─────────────────────────────────────────────── */}
      <div
        className="flex-1 flex flex-col items-center justify-center px-6 gap-5"
        style={{ background: "rgba(6,4,12,1)" }}
      >
        {/* Gold divider */}
        <div className="w-full flex items-center gap-3">
          <div className="flex-1 h-px" style={{ background: "rgba(207,176,91,0.18)" }} />
          <img
            src={`${assetBase}/badge/moon.webp`}
            style={{ width: 12, height: 12, opacity: 0.55 }}
            aria-hidden
          />
          <div className="flex-1 h-px" style={{ background: "rgba(207,176,91,0.18)" }} />
        </div>

        {/* State area */}
        {error ? (
          /* ── Error state ── */
          <div className="w-full flex flex-col items-center gap-4">
            {/* Error card */}
            <div
              className="w-full rounded-[14px] p-4 flex items-start gap-3"
              style={{
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.25)",
              }}
            >
              <AlertTriangle
                size={18}
                className="shrink-0 mt-0.5"
                style={{ color: "#fca5a5" }}
              />
              <p
                className="text-sm m-0 leading-relaxed"
                style={{ color: "#fca5a5" }}
              >
                {error}
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 w-full">
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="flex-1 h-11 rounded-[12px] flex items-center justify-center gap-2 font-bold text-sm transition-all active:scale-[0.97] cursor-pointer"
                  style={{
                    background: "linear-gradient(135deg, #2e2008, #503515)",
                    border: "1px solid rgba(207,176,91,0.60)",
                    color: "#d4b15c",
                    boxShadow: "0 0 16px rgba(212,177,92,0.18)",
                  }}
                >
                  <RefreshCw size={14} strokeWidth={2.5} />
                  重试
                </button>
              )}
              {onLeave && (
                <button
                  onClick={onLeave}
                  className="flex-1 h-11 rounded-[12px] flex items-center justify-center gap-2 font-bold text-sm transition-all active:scale-[0.97] cursor-pointer"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    color: "rgba(255,247,216,0.50)",
                  }}
                >
                  <ChevronLeft size={14} strokeWidth={2.5} />
                  返回
                </button>
              )}
            </div>
          </div>
        ) : (
          /* ── Loading state ── */
          <div className="flex flex-col items-center gap-3">
            {/* Spinner row */}
            <div className="flex items-center gap-3">
              <Loader2
                size={18}
                className="animate-spin"
                style={{ color: "#d4b15c" }}
              />
              <span
                className="font-bold text-sm"
                style={{ color: "rgba(255,247,216,0.65)", letterSpacing: "0.06em" }}
              >
                {message ?? "正在连接..."}
              </span>
            </div>

            {/* Detail text */}
            <p
              className="m-0 text-center text-[11px]"
              style={{ color: "rgba(255,247,216,0.28)", letterSpacing: "0.14em" }}
            >
              {detail ?? "传唤仪式进行中"}
            </p>

            {/* 3-bar indicator */}
            <div className="flex items-end gap-[5px] mt-1" style={{ height: 16 }} aria-hidden>
              <span className="lp-bar lp-bar-1" />
              <span className="lp-bar lp-bar-2" />
              <span className="lp-bar lp-bar-3" />
            </div>
          </div>
        )}

        {/* Footer */}
        <div
          className="absolute bottom-0 inset-x-0 flex items-center justify-center gap-2"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)", opacity: 0.25 }}
        >
          <img src={`${assetBase}/badge/moon.webp`} style={{ width: 11, height: 11 }} aria-hidden />
          <span
            className="text-[9px] font-black uppercase"
            style={{ color: "#d4b15c", letterSpacing: "0.45em" }}
          >
            Werewolf · Night Protocol
          </span>
          <img src={`${assetBase}/badge/moon.webp`} style={{ width: 11, height: 11 }} aria-hidden />
        </div>
      </div>

      <style>{`
        @keyframes lp-float {
          0%, 100% { transform: translateY(0px);  }
          50%       { transform: translateY(-6px); }
        }
        @keyframes lp-glow-pulse {
          0%, 100% { opacity: 0.30; transform: scale(1.00); }
          50%       { opacity: 0.55; transform: scale(1.05); }
        }
        @keyframes lp-bar {
          0%, 100% { height: 3px;  opacity: 0.40; }
          50%       { height: 13px; opacity: 1;    }
        }
        .lp-bar {
          display: inline-block;
          width: 3px;
          border-radius: 999px;
          background: #d4b15c;
          height: 3px;
        }
        .lp-bar-1 { animation: lp-bar 0.9s ease-in-out infinite 0s;    }
        .lp-bar-2 { animation: lp-bar 0.9s ease-in-out infinite 0.18s; }
        .lp-bar-3 { animation: lp-bar 0.9s ease-in-out infinite 0.36s; }
      `}</style>
    </div>
  );
}
