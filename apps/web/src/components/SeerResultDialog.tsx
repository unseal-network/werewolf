import { useT } from "../i18n/I18nProvider";

interface SeerResultDialogProps {
  open: boolean;
  seatNo: number;
  alignment: "wolf" | "good";
  onClose: () => void;
}

export function SeerResultDialog({
  open,
  seatNo,
  alignment,
  onClose,
}: SeerResultDialogProps) {
  const t = useT();

  if (!open) return null;

  return (
    <>
      <div className="sheet-backdrop show" onClick={onClose} aria-hidden />
      <section className="seer-result-dialog open ui-panel" role="dialog" aria-modal="true">
        <button
          type="button"
          className="seer-result-close"
          onClick={onClose}
          aria-label={t("user.close")}
        >
          ×
        </button>
        <div className="seer-result-kicker">{t("role.seer")}</div>
        <div className="seer-result-seat">{t("seat.numberLabel", { n: seatNo })}</div>
        <div className={`seer-result-alignment ${alignment}`}>
          {t(`alignment.${alignment}`)}
        </div>
        <div className="seer-result-copy">
          {t("stage.privateResult.seer", {
            seat: seatNo,
            alignment: t(`alignment.${alignment}`),
          })}
        </div>
      </section>
    </>
  );
}
