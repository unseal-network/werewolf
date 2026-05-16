import { useT } from "../i18n/I18nProvider";

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
      <section className="start-dialog open ui-panel" role="dialog" aria-modal="true">
        <div className="start-title">{t("startDialog.title")}</div>
        <div className="start-copy">
          {t("startDialog.copy", { now: filled })}
        </div>
        <div className="start-actions">
          <button type="button" className="action secondary" onClick={onWait}>
            {t("stage.continueWait")}
          </button>
          <button type="button" className="action primary" onClick={onFillAi}>
            {t("stage.fillAi")}
          </button>
        </div>
      </section>
    </>
  );
}
