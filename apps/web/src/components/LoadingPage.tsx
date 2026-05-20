import { useState, useEffect } from "react";
import { Fingerprint, Globe, ChevronLeft } from "lucide-react";

interface LoadingPageProps {
  isAdmin?: boolean;
  onAdminAction?: () => void;
  error?: string | null;
  message?: string | undefined;
  detail?: string | undefined;
  onRetry?: () => void;
  onLeave?: () => void;
}

export function LoadingPage({
  isAdmin,
  onAdminAction,
  error,
  message,
  detail,
  onRetry,
  onLeave,
}: LoadingPageProps) {
  const [dots, setDots] = useState("");

  useEffect(() => {
    if (error) return;
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? "" : prev + "."));
    }, 500);
    return () => clearInterval(interval);
  }, [error]);

  return (
    <div
      className="h-dvh w-full overflow-hidden flex flex-col items-center justify-center p-10 relative"
      style={{ background: "linear-gradient(160deg, #07041a 0%, #0d0825 40%, #0a0618 100%)" }}
    >
      {/* Top bar */}
      <div className="fixed top-10 left-10 right-10 flex justify-between items-start opacity-20 pointer-events-none">
        <div>
          <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.4em] text-slate-400">
            <Globe size={10} />
            Live Protocol
          </div>
          <div className="text-2xl font-black tracking-tight opacity-10 text-slate-400">
            CONNECTING...
          </div>
        </div>
      </div>

      {/* Back button */}
      {onLeave && (
        <button
          onClick={onLeave}
          aria-label="返回"
          className="fixed z-10 w-[42px] h-[42px] rounded-[10px] flex items-center justify-center bg-violet-500/[0.12] border border-violet-500/30 text-[#c4b5fd] shadow-[0_0_12px_rgba(139,92,246,0.25),0_4px_12px_rgba(0,0,0,0.40)] active:scale-90 hover:bg-violet-500/20 hover:border-violet-500/50 transition-all duration-150 cursor-pointer"
          style={{ top: "calc(var(--web-safe-area-top, 0px) + 20px)", left: "20px" }}
        >
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
      )}

      {/* Admin button */}
      {isAdmin && onAdminAction && (
        <button
          onClick={onAdminAction}
          className="fixed top-10 right-10 w-8 h-8 rounded-[10px] flex items-center justify-center cursor-pointer text-sm text-red-300/90 bg-red-500/[0.12] border border-red-500/30"
        >
          ⚙︎
        </button>
      )}

      {/* Center content */}
      <div className="relative flex flex-col items-center">
        {/* Glow */}
        <div className="absolute inset-0 bg-white/[0.03] rounded-full blur-[48px] scale-[2.5] pointer-events-none" />

        {/* Icon + scan line */}
        <div className="relative">
          <Fingerprint
            size={64}
            strokeWidth={1}
            className="block text-violet-500/30"
          />
          {!error && (
            <div
              className="absolute top-0 left-0 w-full h-px bg-violet-500/40"
              style={{ animation: "lp-scan 2s ease-in-out infinite" }}
            />
          )}
        </div>

        {/* Text below icon */}
        <div className="mt-12 flex flex-col items-center gap-1.5">
          {error ? (
            <>
              <span className="text-xs text-red-400 text-center max-w-[280px]">
                {error}
              </span>
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="mt-2 px-5 py-2 rounded-[10px] bg-violet-500/20 border border-violet-500/40 text-violet-300 text-xs cursor-pointer"
                >
                  重试
                </button>
              )}
            </>
          ) : (
            <>
              <span className="text-[10px] font-black uppercase tracking-[0.6em] text-slate-500">
                {message ? `${message}${dots}` : `Retrieving Data${dots}`}
              </span>
              <p className="text-[9px] font-bold tracking-[0.2em] text-slate-500/50 italic m-0">
                {detail ?? "Synchronizing with the oracle"}
              </p>
            </>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="fixed bottom-10 opacity-10">
        <span className="text-[10px] font-black tracking-[0.5em] uppercase text-slate-400">
          Lupus Night Protocol v1.0
        </span>
      </div>

      <style>{`
        @keyframes lp-scan {
          0%   { transform: translateY(0);    opacity: 0; }
          50%  {                               opacity: 1; }
          100% { transform: translateY(64px); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
