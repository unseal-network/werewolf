import { useState } from "react";
import { PlayerRadialPicker, type PlayerRadialTarget } from "../components/PlayerRadialPicker";

const targets: PlayerRadialTarget[] = [
  { seatNo: 1, playerId: "p1", displayName: "game-10" },
  { seatNo: 2, playerId: "p2", displayName: "game-12" },
  { seatNo: 3, playerId: "p3", displayName: "game-13" },
  { seatNo: 4, playerId: "p4", displayName: "game-1" },
  { seatNo: 5, playerId: "p5", displayName: "game-2" },
  { seatNo: 6, playerId: "p6", displayName: "kimi game 1" },
];

const maxTargets: PlayerRadialTarget[] = Array.from({ length: 12 }, (_, index) => ({
  seatNo: index + 1,
  playerId: `p${index + 1}`,
  displayName: index === 11 ? "kimi game 12" : `game-${index + 1}`,
}));

function DemoBubble({
  title,
  radial = false,
  bare = false,
  children,
}: {
  title: string;
  radial?: boolean;
  bare?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="ui-demo-case">
      <div className="ui-demo-case-title">{title}</div>
      {bare ? (
        <div className="target-row action-control-stack ui-demo-bare-control">{children}</div>
      ) : (
        <article className="phase-card action-bubble is-open" data-radial={radial ? "true" : "false"}>
          <div className="action-bubble-panel">
            <div className="target-row action-control-stack">{children}</div>
          </div>
        </article>
      )}
    </section>
  );
}

function VoiceMock({ showAction = true }: { showAction?: boolean }) {
  const [mode, setMode] = useState<"voice" | "text">("voice");
  const [text, setText] = useState("");
  const [pressing, setPressing] = useState(false);
  return (
    <div className="voice-panel">
      <div className="voice-bubble-row" data-mode={mode}>
        <button
          type="button"
          className={[
            "voice-bubble",
            "voice-bubble-left",
            mode === "voice" ? "voice-bubble-large" : "voice-bubble-square",
            pressing ? "pressing" : "",
          ].filter(Boolean).join(" ")}
          onPointerDown={() => {
            if (mode === "voice") setPressing(true);
          }}
          onPointerUp={() => setPressing(false)}
          onPointerCancel={() => setPressing(false)}
          onPointerLeave={() => setPressing(false)}
          onClick={() => {
            if (mode === "text") setMode("voice");
          }}
        >
          {mode === "text" ? <span className="voice-bubble-icon">🎙</span> : null}
          <strong>{mode === "voice" ? "按住发言" : ""}</strong>
        </button>
        <div
          className={`voice-bubble voice-bubble-right ${
            mode === "text" ? "voice-bubble-large voice-text-bubble" : "voice-bubble-square"
          }`}
          role={mode === "voice" ? "button" : undefined}
          tabIndex={mode === "voice" ? 0 : undefined}
          onClick={mode === "voice" ? () => setMode("text") : undefined}
        >
          {mode === "voice" ? (
            <span className="voice-bubble-icon">⌨️</span>
          ) : (
            <textarea
              className="speech-textarea"
              value={text}
              placeholder="说点什么..."
              onChange={(event) => setText(event.target.value)}
            />
          )}
        </div>
      </div>
      {showAction ? (
        <div className="target-row voice-actions">
          {mode === "text" ? (
            <button type="button" className="stage-confirm" disabled={!text.trim()}>提交发言</button>
          ) : (
            <button type="button" className="stage-skip">跳过</button>
          )}
        </div>
      ) : null}
    </div>
  );
}

function CombinedActionMock() {
  const [target, setTarget] = useState<string | null>(null);
  return (
    <div className="ui-demo-combo">
      <div className="ui-demo-combo-input">
        <VoiceMock showAction={false} />
      </div>
      <PlayerRadialPicker
        targets={targets}
        selectedTargetId={target}
        confirmLabel="确认选择"
        showActionButton={false}
        onSelect={setTarget}
        onClear={() => setTarget(null)}
        onConfirm={() => undefined}
      />
      <button
        type="button"
        className={`${target ? "stage-confirm" : "stage-skip"} gothic-wide-action ui-demo-combo-submit`}
        onClick={() => {
          if (!target) return;
          setTarget(null);
        }}
      >
        {target ? "确认选择" : "跳过"}
      </button>
    </div>
  );
}

function PlayerCountControl({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="live-count-control">
      <div className="live-count-readout">
        <span>人数</span>
        <strong>{value}</strong>
      </div>
      <input
        className="live-count-slider"
        type="range"
        min={2}
        max={12}
        step={1}
        value={value}
        aria-label="选择玩家人数"
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
      <div className="live-count-scale" aria-hidden>
        <span>2</span>
        <span>6</span>
        <span>12</span>
      </div>
    </div>
  );
}

export function UiDemoPage() {
  const [liveTarget, setLiveTarget] = useState<string | null>(null);
  const [playerCount, setPlayerCount] = useState(12);
  const liveTargets = maxTargets.slice(0, playerCount);

  function updatePlayerCount(count: number) {
    setPlayerCount(count);
    setLiveTarget((current) =>
      maxTargets.slice(0, count).some((target) => target.playerId === current)
        ? current
        : null
    );
  }

  return (
    <main className="game-room-root visual-runtime-root ui-demo-page" data-visual-runtime="true" data-scene="night">
      <div className="dom-ui-layer ui-demo-layer">
        <header className="ui-demo-header">
          <h1>Action Bubble UI</h1>
          <p>Standalone component preview</p>
        </header>
        <div className="ui-demo-grid">
          <DemoBubble title="组合：输入 / 选择器 / 提交按钮" bare>
            <CombinedActionMock />
          </DemoBubble>

          <DemoBubble title={`${playerCount} 人实时圆盘：拖动查看 2-12 人效果`} bare>
            <div className="live-count-demo">
              <PlayerCountControl value={playerCount} onChange={updatePlayerCount} />
              <PlayerRadialPicker
                key={playerCount}
                targets={liveTargets}
                selectedTargetId={liveTarget}
                confirmLabel="确认投票"
                skipLabel="跳过"
                defaultOpen
                onSelect={setLiveTarget}
                onClear={() => setLiveTarget(null)}
                onConfirm={() => undefined}
                onSkip={() => undefined}
              />
            </div>
          </DemoBubble>

          <DemoBubble title="发言：麦克风 / 文字互斥" bare>
            <VoiceMock />
          </DemoBubble>

          <DemoBubble title="女巫救人：二选一">
            <div className="binary-action">
              <button type="button" className="stage-confirm">救</button>
              <button type="button" className="stage-skip">不救</button>
            </div>
          </DemoBubble>
        </div>
      </div>
    </main>
  );
}
