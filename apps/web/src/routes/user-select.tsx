import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n/I18nProvider";
import { writeMatrixSession, type MatrixSessionProfile } from "../matrix/session";

interface TestUserConfig {
  users: MatrixSessionProfile[];
}

const TEST_USER_CONFIG_FILES = ["test-users.local.json", "test-users.example.json"];

function normalizeAssetPrefix(prefix: string | undefined): string {
  const raw = prefix?.trim() || "/";
  if (raw === "/") return "/";
  const leading = raw.startsWith("/") ? raw : `/${raw}`;
  return leading.endsWith("/") ? leading : `${leading}/`;
}

export function testUserConfigPaths(prefix: string | undefined): string[] {
  const basePath = normalizeAssetPrefix(prefix);
  return TEST_USER_CONFIG_FILES.map((file) => `${basePath}${file}`);
}

function testUserConfigPrefix(): string {
  return (
    import.meta.env.VITE_TEST_USERS_BASE_PATH ??
    import.meta.env.BASE_URL ??
    "/"
  );
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
  const candidates = testUserConfigPaths(testUserConfigPrefix());
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

const PAGE_BG =
  "radial-gradient(760px 520px at 50% 2%, rgba(212,177,92,0.14), transparent 70%), " +
  "radial-gradient(820px 620px at 12% 92%, rgba(110,134,255,0.14), transparent 68%), " +
  "linear-gradient(180deg, #0b0d15 0%, #151825 58%, #080a10 100%)";

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
    <section
      className="min-h-screen grid place-items-center p-5 sm:p-8 md:p-12"
      style={{ background: PAGE_BG }}
    >
      <div
        className="w-full max-w-[940px] flex flex-col gap-6 rounded-[18px] p-6 sm:p-8 md:p-10 text-[#eef2fb]"
        style={{
          border: "1px solid rgba(207,176,91,0.28)",
          background:
            "linear-gradient(180deg, rgba(27,30,44,0.96), rgba(12,14,23,0.94))",
          boxShadow:
            "0 34px 100px rgba(0,0,0,0.46), inset 0 1px 0 rgba(255,255,255,0.08)",
        }}
      >
        {/* Header */}
        <header className="flex justify-between items-start gap-5 flex-wrap sm:flex-nowrap">
          <div>
            <p className="m-0 mb-2 text-xs font-black tracking-[0.16em] uppercase text-[#d4b15c]">
              Test Users
            </p>
            <h1 className="m-0 text-[clamp(28px,4vw,42px)] font-black text-[#eef2fb]">
              选择测试账号
            </h1>
            <p className="mt-2.5 mb-0 text-[15px] text-[#a6afc3]">
              先选择一个用户身份，再进入创建房间或加入同一局进行联机测试。
            </p>
          </div>
          {/* Locale switcher — gold active */}
          <div
            className="inline-flex rounded-full p-0.5 shrink-0"
            role="group"
            aria-label="Language"
            style={{
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.14)",
            }}
          >
            <button
              type="button"
              className="px-2.5 py-1 rounded-full text-[11px] font-black tracking-[0.06em] transition-colors"
              style={
                locale === "zh-CN"
                  ? { background: "#d4b15c", color: "#11131b" }
                  : { color: "#dbe2f0" }
              }
              onClick={() => setLocale("zh-CN")}
            >
              中
            </button>
            <button
              type="button"
              className="px-2.5 py-1 rounded-full text-[11px] font-black tracking-[0.06em] transition-colors"
              style={
                locale === "en"
                  ? { background: "#d4b15c", color: "#11131b" }
                  : { color: "#dbe2f0" }
              }
              onClick={() => setLocale("en")}
            >
              EN
            </button>
          </div>
        </header>

        {/* States */}
        {loading ? (
          <p className="m-0 text-[15px] text-[#a6afc3]">Loading users...</p>
        ) : null}
        {!loading && error ? (
          <p className="m-0 text-[#ff9aa5]">{error}</p>
        ) : null}

        {/* User grid */}
        {!loading && cards.length > 0 ? (
          <div className="grid gap-4 sm:gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            {cards.map((user) => (
              <button
                key={user.userId}
                type="button"
                className="grid items-center gap-4 p-[18px] rounded-2xl text-left transition-all duration-160 hover:-translate-y-0.5"
                style={{
                  gridTemplateColumns: "64px minmax(0,1fr)",
                  border: "1px solid rgba(212,177,92,0.18)",
                  background:
                    "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03)), rgba(11,14,24,0.82)",
                  color: "inherit",
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget;
                  el.style.borderColor = "rgba(212,177,92,0.36)";
                  el.style.boxShadow = "0 18px 34px rgba(0,0,0,0.26)";
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget;
                  el.style.borderColor = "rgba(212,177,92,0.18)";
                  el.style.boxShadow = "";
                }}
                onClick={() => handleSelect(user)}
              >
                <span
                  className="w-16 h-16 rounded-full flex items-center justify-center text-[28px] font-black text-[#f8fbff]"
                  style={{
                    ...user.avatarStyle,
                    border: "2px solid rgba(255,255,255,0.14)",
                  }}
                >
                  {user.initial}
                </span>
                <span className="min-w-0 flex flex-col gap-1.5">
                  <strong className="block text-[17px] font-semibold text-[#eef2fb] truncate overflow-hidden text-ellipsis whitespace-nowrap">
                    {user.displayName}
                  </strong>
                  <span className="block text-xs text-[#a6afc3] truncate overflow-hidden text-ellipsis whitespace-nowrap">
                    {user.userId}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
