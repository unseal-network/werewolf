import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n/I18nProvider";
import { writeMatrixSession, type MatrixSessionProfile } from "../matrix/session";

interface TestUserConfig {
  users: MatrixSessionProfile[];
}

function hashHue(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash % 360;
}

function initialsForName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const first = Array.from(trimmed)[0];
  return (first ?? "?").toUpperCase();
}

function avatarStyle(userId: string) {
  const hue = hashHue(userId);
  return {
    background: `linear-gradient(160deg, hsl(${hue} 72% 34%), hsl(${(hue + 28) % 360} 78% 22%))`,
    boxShadow: `0 16px 36px hsl(${hue} 80% 12% / 0.42)`,
  };
}

async function loadTestUsers(): Promise<MatrixSessionProfile[]> {
  const candidates = ["/test-users.local.json", "/test-users.example.json"];
  for (const path of candidates) {
    try {
      const response = await fetch(path, { cache: "no-store" });
      if (!response.ok) continue;
      const payload = (await response.json()) as TestUserConfig;
      if (Array.isArray(payload.users) && payload.users.length > 0) {
        return payload.users.filter(
          (user) =>
            typeof user.accessToken === "string" &&
            typeof user.userId === "string" &&
            typeof user.displayName === "string"
        );
      }
    } catch {
      continue;
    }
  }
  return [];
}

export function nextUrlAfterUserSelect(pathname: string, search: string): string {
  const params = new URLSearchParams(search);
  params.delete("chooseUser");
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function UserSelectPage() {
  const { locale, setLocale } = useI18n();
  const [users, setUsers] = useState<MatrixSessionProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void loadTestUsers()
      .then((nextUsers) => {
        if (cancelled) return;
        setUsers(nextUsers);
        if (nextUsers.length === 0) {
          setError("No local test users configured.");
        }
      })
      .catch((caught) => {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : String(caught));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const cards = useMemo(
    () =>
      users.map((user) => ({
        ...user,
        initial: initialsForName(user.displayName || user.userId),
        avatarStyle: avatarStyle(user.userId),
      })),
    [users]
  );

  function handleSelect(profile: MatrixSessionProfile) {
    writeMatrixSession(profile);
    window.location.href = nextUrlAfterUserSelect(
      window.location.pathname,
      window.location.search
    );
  }

  return (
    <section className="account-select-page">
      <div className="account-select-card">
        <header className="account-select-header">
          <div>
            <p className="account-select-kicker">Test Users</p>
            <h1>选择测试账号</h1>
            <p className="account-select-copy">
              先选择一个用户身份，再进入创建房间或加入同一局进行联机测试。
            </p>
          </div>
          <div
            className="locale-switcher inline"
            role="group"
            aria-label="Language"
          >
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
        {loading ? <p className="account-select-state">Loading users...</p> : null}
        {!loading && error ? <p className="account-select-error">{error}</p> : null}
        {!loading && cards.length > 0 ? (
          <div className="account-select-grid">
            {cards.map((user) => (
              <button
                key={user.userId}
                type="button"
                className="account-select-user"
                onClick={() => handleSelect(user)}
              >
                <span className="account-select-avatar" style={user.avatarStyle}>
                  {user.initial}
                </span>
                <span className="account-select-meta">
                  <strong>{user.displayName}</strong>
                  <span>{user.userId}</span>
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
