import { useEffect, useMemo, useState } from "react";
import { createApiClient } from "../api/client";
import { useI18n } from "../i18n/I18nProvider";

const DEMO_TOKEN = "syt_a2ltaWdhbWUx_WEnXKgiFtirbEiSPTMwU_2p1YIY";

export function CreateGamePage({
  initialError,
}: {
  initialError?: string | undefined;
} = {}) {
  const { t, locale, setLocale } = useI18n();
  const [title, setTitle] = useState(t("create.gameTitleDefault"));
  const defaultRoom = import.meta.env.VITE_DEMO_ROOM ?? "!FWTlpFYoOXfndnfReT:keepsecret.io";
  const [sourceMatrixRoomId, setSourceMatrixRoomId] = useState(
    () => localStorage.getItem("lastSourceMatrixRoomId") ?? defaultRoom
  );
  const targetPlayerCount = 12;
  const [language, setLanguage] = useState<"zh-CN" | "en">("zh-CN");
  const [error, setError] = useState(initialError ?? "");

  const client = useMemo(
    () =>
      createApiClient({
        baseUrl: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000",
        getMatrixToken: () => DEMO_TOKEN,
      }),
    []
  );

  useEffect(() => {
    setTitle((current) => {
      if (current === "" || current === "狼人杀" || current === "Werewolf Room") {
        return t("create.gameTitleDefault");
      }
      return current;
    });
  }, [t]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (sourceMatrixRoomId) {
      localStorage.setItem("lastSourceMatrixRoomId", sourceMatrixRoomId);
    }

    try {
      const result = await client.createGame({
        sourceMatrixRoomId,
        title,
        targetPlayerCount,
        language,
        timing: { nightActionSeconds: 45, speechSeconds: 60, voteSeconds: 30 },
        allowedSourceMatrixRoomIds: [],
      });
      const url = `${window.location.pathname}?gameRoomId=${result.gameRoomId}`;
      window.location.href = url;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  return (
    <section className="create-page">
      <div className="create-card">
        <header className="create-header">
          <h1>{t("create.title")}</h1>
          <div className="locale-switcher inline" role="group" aria-label={t("common.languageLabel")}>
            <button
              type="button"
              className={locale === "zh-CN" ? "active" : ""}
              onClick={() => setLocale("zh-CN")}
            >
              中
            </button>
            <button
              type="button"
              className={locale === "en" ? "active" : ""}
              onClick={() => setLocale("en")}
            >
              EN
            </button>
          </div>
        </header>
        <form onSubmit={submit} className="create-form">
          <label>
            {t("create.gameTitle")}
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label>
            {t("create.sourceRoom")}
            <input
              value={sourceMatrixRoomId}
              onChange={(event) => setSourceMatrixRoomId(event.target.value)}
              placeholder="!room:example.com"
            />
          </label>
          <label>
            {t("create.language")}
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value as "zh-CN" | "en")}
            >
              <option value="zh-CN">{t("create.languageZh")}</option>
              <option value="en">{t("create.languageEn")}</option>
            </select>
          </label>
          <button type="submit" className="action-primary">
            {t("create.submit")}
          </button>
          {error ? <p className="create-error">{error}</p> : null}
        </form>
      </div>
    </section>
  );
}
