import type { MouseEvent, ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";

export function AppLayout({
  children,
  navigationGuard,
}: {
  children: ReactNode;
  navigationGuard?: (destination: string) => boolean;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const query = new URLSearchParams(location.search);
  const search = query.get("q") ?? "";

  function updateSearch(value: string) {
    if (navigationGuard && !navigationGuard("/scenarios")) return;
    const params = new URLSearchParams(location.search);
    if (value.trim()) params.set("q", value);
    else params.delete("q");
    navigate(
      { pathname: "/scenarios", search: params.toString() ? `?${params}` : "" },
      { replace: true },
    );
  }

  function handleNavigation(event: MouseEvent<HTMLAnchorElement>, destination: string) {
    if (navigationGuard && !navigationGuard(destination)) event.preventDefault();
    setMenuOpen(false);
  }

  const navClass = (path: string) => (location.pathname === path ? "is-active" : undefined);

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link
          className="brand"
          to="/scenarios"
          aria-label="シナリオ一覧へ"
          onClick={(event) => handleNavigation(event, "/scenarios")}
        >
          <span className="brand-mark" aria-hidden="true">
            ✦
          </span>
          <span>TRPG Scenario Manager</span>
        </Link>
        <nav
          id="main-navigation"
          className={`main-nav${menuOpen ? " is-open" : ""}`}
          aria-label="メインナビゲーション"
          onClick={() => setMenuOpen(false)}
        >
          <Link
            className={navClass("/scenarios")}
            to="/scenarios"
            onClick={(event) => handleNavigation(event, "/scenarios")}
          >
            一覧
          </Link>
          <Link
            className={navClass("/backup")}
            to="/backup"
            onClick={(event) => handleNavigation(event, "/backup")}
          >
            バックアップ
          </Link>
          <Link
            className={navClass("/settings/discord-format")}
            to="/settings/discord-format"
            onClick={(event) => handleNavigation(event, "/settings/discord-format")}
          >
            Discord形式
          </Link>
          <Link
            className={navClass("/settings")}
            to="/settings"
            onClick={(event) => handleNavigation(event, "/settings")}
          >
            設定
          </Link>
        </nav>
        <label className={`header-search${menuOpen ? " is-open" : ""}`}>
          <span className="sr-only">シナリオ検索</span>
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            value={search}
            onChange={(event) => updateSearch(event.target.value)}
            placeholder="検索（タイトル・作者・舞台など）"
          />
        </label>
        <Link
          className="header-new-button primary-button"
          to="/scenarios/new"
          onClick={(event) => handleNavigation(event, "/scenarios/new")}
        >
          ＋ 新規登録
        </Link>
        <button
          className="menu-button"
          type="button"
          aria-label="メニューを開閉"
          aria-controls="main-navigation"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? "×" : "☰"}
        </button>
      </header>
      <main id="main-content" className="page" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
