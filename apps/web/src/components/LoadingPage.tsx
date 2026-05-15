import { useState, useEffect } from "react";
import { Fingerprint, Globe } from "lucide-react";

interface LoadingPageProps {
  isAdmin?: boolean;
  onAdminAction?: () => void;
  error?: string | null;
  onRetry?: () => void;
}

export function LoadingPage({
  isAdmin,
  onAdminAction,
  error,
  onRetry,
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
      style={{
        height: "100dvh",
        width: "100%",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px",
        background:
          "linear-gradient(160deg, #07041a 0%, #0d0825 40%, #0a0618 100%)",
        position: "relative",
      }}
    >
      {/* Top bar */}
      <div
        style={{
          position: "fixed",
          top: 40,
          left: 40,
          right: 40,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          opacity: 0.2,
          pointerEvents: "none",
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 9,
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "0.4em",
              color: "#94a3b8",
            }}
          >
            <Globe size={10} />
            Live Protocol
          </div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              opacity: 0.1,
              color: "#94a3b8",
            }}
          >
            CONNECTING...
          </div>
        </div>
      </div>

      {/* Admin button — rendered outside the low-opacity container */}
      {isAdmin && onAdminAction && (
        <button
          onClick={onAdminAction}
          style={{
            position: "fixed",
            top: 40,
            right: 40,
            width: 32,
            height: 32,
            borderRadius: 10,
            background: "rgba(239,68,68,0.12)",
            border: "1px solid rgba(239,68,68,0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            fontSize: 14,
            color: "rgba(252,165,165,0.9)",
          }}
        >
          ⚙︎
        </button>
      )}

      {/* Center content */}
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        {/* Glow */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(255,255,255,0.03)",
            borderRadius: "50%",
            filter: "blur(48px)",
            transform: "scale(2.5)",
            pointerEvents: "none",
          }}
        />
        {/* Icon + scan line */}
        <div style={{ position: "relative" }}>
          <Fingerprint
            size={64}
            strokeWidth={1}
            style={{ color: "rgba(139,92,246,0.3)", display: "block" }}
          />
          {!error && (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: 1,
                background: "rgba(139,92,246,0.4)",
                animation: "lp-scan 2s ease-in-out infinite",
              }}
            />
          )}
        </div>

        {/* Text below icon */}
        <div
          style={{
            marginTop: 48,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
          }}
        >
          {error ? (
            <>
              <span style={{ fontSize: 12, color: "#f87171", textAlign: "center", maxWidth: 280 }}>
                {error}
              </span>
              {onRetry && (
                <button
                  onClick={onRetry}
                  style={{
                    marginTop: 8,
                    padding: "8px 20px",
                    borderRadius: 10,
                    background: "rgba(139,92,246,0.2)",
                    border: "1px solid rgba(139,92,246,0.4)",
                    color: "#c4b5fd",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  重试
                </button>
              )}
            </>
          ) : (
            <>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 900,
                  textTransform: "uppercase",
                  letterSpacing: "0.6em",
                  color: "#64748b",
                }}
              >
                Retrieving Data{dots}
              </span>
              <p
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.2em",
                  color: "rgba(100,116,139,0.5)",
                  fontStyle: "italic",
                  margin: 0,
                }}
              >
                Synchronizing with the oracle
              </p>
            </>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{ position: "fixed", bottom: 40, opacity: 0.1 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 900,
            letterSpacing: "0.5em",
            textTransform: "uppercase",
            color: "#94a3b8",
          }}
        >
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
