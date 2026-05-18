import { useT } from "../i18n/I18nProvider";
import { GameButton } from "./GameButton";
import { UiPanelFrame } from "./UiPanelFrame";

interface StartDialogProps {
  open: boolean;
  filled: number;
  target: number;
  onFillAi: () => void;
  onWait: () => void;
}

export function StartDialog({ open, filled, target, onFillAi, onWait }: StartDialogProps) {
  const t = useT();
  if (!open) return null;

  return (
    <>
      <div
        className="sheet-backdrop show"
        onClick={onWait}
        aria-hidden
      />
      <UiPanelFrame
        as="section"
        className="start-dialog open"
        contentClassName="start-dialog-content"
        role="dialog"
        aria-modal="true"
        tone="filled"
        size="medium"
        ornament
      >
        <div className="start-title">{t("startDialog.title")}</div>
        <div className="start-copy">
          {t("startDialog.copy", { now: filled })}
        </div>
        <div className="start-actions">
          <GameButton
            variant="secondary"
            size="sm"
            label={t("stage.continueWait")}
            onClick={onWait}
          />
          <GameButton
            variant="primary"
            size="sm"
            label={t("stage.fillAi")}
            onClick={onFillAi}
          />
        </div>
      </UiPanelFrame>
    </>
  );
}
