import { useEffect, useState } from "react";
import MotePage from "./modules/ripple/Page";
import "./shared/styles/theme.css";
import "./shared/styles/ui.css";
import "./shared/styles/motion.css";
import "./app.css";

async function api(path: string, body?: unknown) {
  const response = await fetch(`/api/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}
export default function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState(false);
  const [token, setToken] = useState("");
  const [dark, setDark] = useState(
    () =>
      localStorage.getItem("mote-theme") === "dark" ||
      (!localStorage.getItem("mote-theme") && matchMedia("(prefers-color-scheme: dark)").matches),
  );
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);
  useEffect(() => {
    let active = true;
    api("session")
      .then((data) => {
        if (active) setAuthenticated(data.authenticated);
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setAuthenticated(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const open = () => {
      setSettings(true);
      setError("");
    };
    window.addEventListener("mote-settings", open);
    return () => window.removeEventListener("mote-settings", open);
  }, []);
  if (authenticated === null) return <div className="mote-loading">mote</div>;
  if (!authenticated)
    return (
      <main className="mote-login">
        <div className="mote-login-card">
          <h1>
            mote<span>留住一闪而过</span>
          </h1>
          <p>随手写下，随时回看。</p>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (busy) return;
              setBusy(true);
              setError("");
              try {
                await api("login", { password });
                setAuthenticated(true);
                setPassword("");
              } catch (e) {
                setError(e instanceof Error ? e.message : "登录失败");
              } finally {
                setBusy(false);
              }
            }}
          >
            <label htmlFor="password">访问密码</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
            <button className="mote-primary" disabled={busy}>
              {busy ? "登录中…" : "进入 Mote"}
            </button>
            {error && <p role="alert">{error}</p>}
          </form>
        </div>
      </main>
    );
  return (
    <>
      <MotePage />
      {settings && (
        <div
          className="mote-settings-scrim"
          onClick={() => {
            setSettings(false);
            setToken("");
          }}
        >
          <section
            className="mote-settings"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setSettings(false);
                setToken("");
              }
            }}
          >
            <header>
              <h2 id="settings-title">设置与客户端</h2>
              <button
                autoFocus
                aria-label="关闭设置"
                onClick={() => {
                  setSettings(false);
                  setToken("");
                }}
              >
                ×
              </button>
            </header>
            <label className="mote-theme">
              <span>深色外观</span>
              <input
                type="checkbox"
                checked={dark}
                onChange={(e) => {
                  setDark(e.target.checked);
                  localStorage.setItem("mote-theme", e.target.checked ? "dark" : "light");
                }}
              />
            </label>
            <hr />
            <h3>Mote Notes 记事本</h3>
            <p>
              打开 Mote Notes，在悬浮记事本中写下想法，停笔后自动同步，⌘S 立即保存。当前连接选择 SSH
              (RN)，SSH Host 填 rn。
            </p>
            <label>
              服务器地址
              <input readOnly value={location.origin} />
            </label>
            <p>
              生成速记令牌后粘贴到客户端设置。令牌仅显示一次，可新增记录并更新记事本创建的记录。重新生成会使旧令牌失效。
            </p>
            <button
              className="mote-primary"
              disabled={busy}
              onClick={async () => {
                if (!confirm("生成新令牌会使之前的客户端令牌失效，继续吗？")) return;
                setBusy(true);
                setError("");
                try {
                  setToken((await api("capture-token", {})).token);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "生成失败");
                } finally {
                  setBusy(false);
                }
              }}
            >
              生成速记令牌
            </button>
            {token && (
              <label>
                速记令牌
                <input readOnly type="password" value={token} />
                <button
                  className="text-button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(token);
                      setError("已复制令牌");
                    } catch {
                      setError("复制失败，请选择令牌后手动复制");
                    }
                  }}
                >
                  复制令牌
                </button>
              </label>
            )}
            {error && <p role="status">{error}</p>}
            <hr />
            <button
              className="text-button"
              onClick={async () => {
                try {
                  await api("logout", {});
                  setToken("");
                  setSettings(false);
                  setAuthenticated(false);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "退出失败");
                }
              }}
            >
              退出登录
            </button>
          </section>
        </div>
      )}
    </>
  );
}
