import { useT } from "../i18n/I18nProvider";

export interface TargetPlayer {
  seatNo: number;
  playerId: string;
  displayName: string;
}

interface TargetConfirmProps {
  selectedTarget?: TargetPlayer | null;
  mode: "guard" | "wolf" | "witch-save" | "witch-poison" | "seer" | "vote";
  onClear: () => void;
  onConfirm: () => void;
}

const modeKey: Record<TargetConfirmProps["mode"], string> = {
  guard: "confirm.guard",
  wolf: "confirm.wolf",
  "witch-save": "confirm.witchSave",
  "witch-poison": "confirm.witchPoison",
  seer: "confirm.seer",
  vote: "confirm.vote",
};

export function TargetConfirm({
  selectedTarget,
  mode,
  onClear,
  onConfirm,
}: TargetConfirmProps) {
  const t = useT();
  if (!selectedTarget) return null;
  const sentence = t(modeKey[mode] ?? "confirm.vote");

  return (
    <div className="target-confirm">
      <button
        type="button"
        className="selected-avatar"
        onClick={onClear}
        aria-label={t("confirm.cancel")}
      >
        {t("seat.numberLabel", { n: selectedTarget.seatNo })}
      </button>
      <p>
        {sentence}
        {" — "}
        {selectedTarget.displayName} ({t("seat.numberLabel", { n: selectedTarget.seatNo })})
      </p>
      <button type="button" className="action-primary" onClick={onConfirm}>
        {t("confirm.confirm")}
      </button>
    </div>
  );
}
