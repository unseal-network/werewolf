import { useEffect, useMemo, useState } from "react";
import { createApiClient, defaultApiBaseUrl } from "../api/client";
import { useI18n } from "../i18n/I18nProvider";
import { SOURCE_ROOM_STORAGE_KEY, writeMatrixToken } from "../matrix/session";

export interface UseCreateGameOptions {
  onGameCreated?: ((
    gameRoomId: string,
    sourceMatrixRoomId: string
  ) => Promise<void> | void) | undefined;
}

export interface SubmitParams {
  sourceMatrixRoomId: string;
  matrixToken: string;
}

export interface UseCreateGameReturn {
  // Game config
  title: string;
  setTitle: (v: string) => void;
  language: "zh-CN" | "en";
  setLanguage: (v: "zh-CN" | "en") => void;
  agentSpeechRate: number;
  setAgentSpeechRate: (v: number) => void;
  targetPlayerCount: number;
  setTargetPlayerCount: (v: number) => void;
  // Submit
  submitting: boolean;
  error: string;
  setError: (v: string) => void;
  submit: (params: SubmitParams) => Promise<void>;
}

export function useCreateGame({
  onGameCreated,
}: UseCreateGameOptions = {}): UseCreateGameReturn {
  const { t } = useI18n();

  const [title, setTitle] = useState(() => t("create.gameTitleDefault"));
  const [language, setLanguage] = useState<"zh-CN" | "en">("zh-CN");
  const [agentSpeechRate, setAgentSpeechRate] = useState(1.5);
  const [targetPlayerCount, setTargetPlayerCount] = useState(12);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Keep title in sync with locale changes
  useEffect(() => {
    setTitle((current) => {
      if (
        current === "" ||
        current === "狼人杀" ||
        current === "Werewolf Room"
      ) {
        return t("create.gameTitleDefault");
      }
      return current;
    });
  }, [t]);

  // A stable base URL reference — token is supplied per-submit
  const baseUrl = useMemo(() => defaultApiBaseUrl(), []);

  async function submit({ sourceMatrixRoomId, matrixToken }: SubmitParams) {
    setError("");
    setSubmitting(true);

    const token = matrixToken.trim();
    const roomId = sourceMatrixRoomId.trim();

    try {
      // Persist before the API call
      writeMatrixToken(token);
      localStorage.setItem(SOURCE_ROOM_STORAGE_KEY, roomId);

      const client = createApiClient({
        baseUrl,
        getMatrixToken: () => token,
      });

      const result = await client.createGame({
        sourceMatrixRoomId: roomId,
        title,
        targetPlayerCount,
        language,
        timing: {
          nightActionSeconds: 45,
          speechSeconds: 60,
          voteSeconds: 30,
          agentSpeechRate,
        },
      });

      await onGameCreated?.(result.gameRoomId, roomId);
      window.location.href = `${window.location.pathname}?gameRoomId=${result.gameRoomId}`;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setSubmitting(false);
    }
    // Note: setSubmitting(false) is intentionally skipped on success because
    // the page will navigate away immediately.
  }

  return {
    title,
    setTitle,
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
  };
}
