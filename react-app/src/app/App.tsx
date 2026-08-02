import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AppRoutes } from "./AppRoutes";
import { AppLayout } from "../components/layout/AppLayout";
import type { AuthUser } from "../domain/models/AuthUser";
import { authRepository } from "../repositories/auth/AuthRepository";
import { authService } from "../services/AuthService";
import { profileService } from "../services/ProfileService";
import type { ScenarioCard } from "../domain/dto/ScenarioCard";
import { scenarioService } from "../services/ScenarioService";
import type { ScenarioDetailDto } from "../domain/dto/ScenarioDetailDto";
import type { ScenarioShareDto } from "../domain/dto/ScenarioShareDto";
import { backupService } from "../services/BackupService";
import type { BackupPayload, BackupRestoreProgress } from "../domain/backup/BackupPayload";
import { scenarioImageService } from "../services/ScenarioImageService";
import { SettingsPage } from "../pages/SettingsPage";
import { DiscordFormatPage } from "../pages/DiscordFormatPage";
import { ProfileSetupPage } from "../pages/ProfileSetupPage";
import { ScenarioFormPage } from "../features/scenario-form/ScenarioForm";
import { userSettingsService } from "../services/UserSettingsService";
import { formatScenarioForDiscord } from "../services/DiscordScenarioFormatter";
import { ConfirmDialog } from "../components/modal/ConfirmDialog";

const TRPG_SYSTEMS = [
  "クトゥルフ神話TRPG（6版）",
  "新クトゥルフ神話TRPG（7版）",
  "エモクロアTRPG",
  "マーダーミステリー",
  "インセイン",
  "ダブルクロス The 3rd Edition",
  "シノビガミ",
  "ソード・ワールド2.5",
  "永い後日談のネクロニカ",
  "フタリソウサ",
  "ストリテラ",
  "その他",
] as const;

const TIME_FILTERS = [
  ["within-1", "1時間以内（0〜1時間）"],
  ["around-1", "1時間前後（1〜2時間）"],
  ["around-3", "3時間前後（2〜4時間）"],
  ["around-5", "5時間前後（4〜7時間）"],
  ["around-9", "9時間前後（7〜11時間）"],
  ["around-12", "12時間前後（11〜15時間）"],
  ["over-15", "15時間以上"],
] as const;

const LOST_RATE_OPTIONS = [
  ["none", "なし"],
  ["low", "低"],
  ["medium", "中"],
  ["high", "高"],
  ["very_high", "極高"],
  ["unknown", "不明"],
] as const;

const COMBAT_OPTIONS = [
  ["yes", "あり"],
  ["no", "なし"],
  ["conditional", "場合による"],
] as const;

function applyTheme(theme: "light" | "gray" | "dark") {
  document.documentElement.dataset.theme = theme;
  document.body.dataset.theme = theme;
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes}分${String(seconds % 60).padStart(2, "0")}秒` : `${seconds}秒`;
}

interface BackupDirectoryHandle {
  name: string;
  queryPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
  getDirectoryHandle(name: string, options: { create: boolean }): Promise<BackupDirectoryHandle>;
  getFileHandle(name: string, options: { create: boolean }): Promise<BackupFileHandle>;
}

interface BackupFileHandle {
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
}

interface BackupWindow extends Window {
  showDirectoryPicker?: (options: {
    mode: "readwrite";
    startIn: "downloads";
  }) => Promise<BackupDirectoryHandle>;
}

const Layout = AppLayout;

function LoginPage({
  user,
  profileReady,
}: {
  user: AuthUser | null;
  profileReady: boolean | null;
}) {
  const navigate = useNavigate();
  const [message, setMessage] = useState<string | null>(null);

  if (user) return <Navigate to={profileReady ? "/scenarios" : "/profile"} replace />;

  async function login() {
    setMessage(null);
    const result = await authService.loginWithGoogle();
    if (!result.success) setMessage(result.error.message);
  }

  return (
    <div className="auth-shell">
      <main className="auth-main">
        <section className="panel narrow-panel auth-card">
          <h1>ログイン</h1>
          <p>Googleアカウントでログインします。</p>
          <button className="primary-button" type="button" onClick={() => void login()}>
            Googleでログイン
          </button>
          {message ? (
            <p className="error-message" role="alert">
              {message}
            </p>
          ) : null}
          <button className="text-button" type="button" onClick={() => navigate("/")}>
            トップへ戻る
          </button>
        </section>
      </main>
    </div>
  );
}

function ScenarioListPage({ user }: { user: AuthUser | null }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [scenarios, setScenarios] = useState<ScenarioCard[]>([]);
  const [listColumns, setListColumns] = useState<1 | 2 | 3 | 4>(4);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const keyword = searchParams.get("q") ?? "";
  const [systemFilter, setSystemFilter] = useState("");
  const [sortOrder, setSortOrder] = useState("updated-desc");
  const [advanced, setAdvanced] = useState(false);
  const [countFilter, setCountFilter] = useState("");
  const [timeFilter, setTimeFilter] = useState("");
  const [lostFilter, setLostFilter] = useState("");
  const [trendFilter, setTrendFilter] = useState("");
  const [participationFilter, setParticipationFilter] = useState("");
  const [combatFilter, setCombatFilter] = useState("");
  const [favoriteOnly, setFavoriteOnly] = useState(false);

  useEffect(() => {
    if (!user) return;
    void scenarioService.getScenarioList(user.id).then((result) => {
      setLoading(false);
      if (result.success) setScenarios(result.data);
      else setMessage(result.error.message);
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void userSettingsService.get(user.id).then((result) => {
      if (result.success) setListColumns(result.data.listColumns);
    });
  }, [user]);

  const visibleScenarios = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    const filtered = scenarios.filter((scenario) => {
      const matchesKeyword =
        !normalizedKeyword ||
        [
          scenario.title,
          scenario.system,
          scenario.author ?? "",
          scenario.stage ?? "",
          scenario.recommendedSkills ?? "",
          scenario.tags.join(" "),
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedKeyword);
      const matchesSystem = !systemFilter || scenario.system === systemFilter;
      const matchesCount = !countFilter || matchesCountFilter(scenario, countFilter);
      const matchesTime = !timeFilter || matchesTimeFilter(scenario, timeFilter);
      const matchesLost = !lostFilter || scenario.lostRate === lostFilter;
      const matchesTrend = !trendFilter || scenario.tags.includes(trendFilter);
      const matchesParticipation =
        !participationFilter || participationKey(scenario) === participationFilter;
      const matchesCombat = !combatFilter || scenario.battle === combatFilter;
      const matchesFavorite = !favoriteOnly || scenario.favorite;
      return (
        matchesKeyword &&
        matchesSystem &&
        matchesCount &&
        matchesTime &&
        matchesLost &&
        matchesTrend &&
        matchesParticipation &&
        matchesCombat &&
        matchesFavorite
      );
    });
    return [...filtered].sort((left, right) => {
      if (sortOrder === "updated-desc") return right.updatedAt.getTime() - left.updatedAt.getTime();
      if (sortOrder === "updated-asc") return left.updatedAt.getTime() - right.updatedAt.getTime();
      if (sortOrder === "title-asc") return left.title.localeCompare(right.title, "ja");
      if (sortOrder === "title-desc") return right.title.localeCompare(left.title, "ja");
      if (sortOrder === "system-asc") return left.system.localeCompare(right.system, "ja");
      if (sortOrder === "author-asc")
        return (left.author ?? "").localeCompare(right.author ?? "", "ja");
      if (sortOrder === "author-desc")
        return (right.author ?? "").localeCompare(left.author ?? "", "ja");
      if (sortOrder === "created-desc") return right.createdAt.getTime() - left.createdAt.getTime();
      if (sortOrder === "created-asc") return left.createdAt.getTime() - right.createdAt.getTime();
      return 0;
    });
  }, [
    combatFilter,
    countFilter,
    favoriteOnly,
    keyword,
    lostFilter,
    participationFilter,
    scenarios,
    sortOrder,
    systemFilter,
    timeFilter,
    trendFilter,
  ]);

  const trendOptions = useMemo(
    () =>
      [...new Set(scenarios.flatMap((scenario) => scenario.tags))].sort((a, b) =>
        a.localeCompare(b, "ja"),
      ),
    [scenarios],
  );

  if (!user) return <Navigate to="/login" replace />;
  const currentUser = user;

  async function toggleFavorite(scenario: ScenarioCard) {
    const nextFavorite = !scenario.favorite;
    setScenarios((current) =>
      current.map((item) => (item.id === scenario.id ? { ...item, favorite: nextFavorite } : item)),
    );
    const result = await scenarioService.updateFavorite(currentUser.id, scenario.id, nextFavorite);
    if (!result.success) {
      setScenarios((current) =>
        current.map((item) =>
          item.id === scenario.id ? { ...item, favorite: scenario.favorite } : item,
        ),
      );
      setMessage(result.error.message);
    }
  }

  function resetFilters() {
    const next = new URLSearchParams(searchParams);
    next.delete("q");
    setSearchParams(next);
    setSystemFilter("");
    setSortOrder("updated-desc");
    setCountFilter("");
    setTimeFilter("");
    setLostFilter("");
    setTrendFilter("");
    setParticipationFilter("");
    setCombatFilter("");
    setFavoriteOnly(false);
  }

  function matchesCountFilter(scenario: ScenarioCard, filter: string) {
    if (scenario.playerCountType === "fixed") {
      return filter === "6+"
        ? (scenario.playerCountFixed ?? 0) >= 6
        : scenario.playerCountFixed === Number(filter);
    }
    if (scenario.playerCountType === "range") {
      const min = scenario.playerCountMin ?? 0;
      const max = scenario.playerCountMax ?? Number.MAX_SAFE_INTEGER;
      return filter === "6+" ? max >= 6 : min <= Number(filter) && max >= Number(filter);
    }
    return scenario.playerCount.includes(filter === "6+" ? "6" : filter);
  }

  function matchesTimeFilter(scenario: ScenarioCard, filter: string) {
    const min = scenario.playTimeType === "range" ? scenario.playTimeMin : scenario.playTimeFixed;
    const max = scenario.playTimeType === "range" ? scenario.playTimeMax : scenario.playTimeFixed;
    if (min === null && max === null) return false;
    const low = min ?? max ?? 0;
    const high = max ?? min ?? 0;
    const ranges: Record<string, [number, number]> = {
      "within-1": [0, 60],
      "around-1": [60, 120],
      "around-3": [120, 240],
      "around-5": [240, 420],
      "around-9": [420, 660],
      "around-12": [660, 900],
      "over-15": [900, Number.POSITIVE_INFINITY],
    };
    const [rangeMin, rangeMax] = ranges[filter] ?? [];
    return rangeMin !== undefined && low <= rangeMax && high >= rangeMin;
  }

  function participationKey(scenario: ScenarioCard) {
    const kp = scenario.kpStatus !== "notStarted";
    const pl = scenario.playStatus !== "notStarted";
    return kp && pl ? "both" : kp ? "kp-only" : pl ? "pl-only" : "none";
  }

  return (
    <Layout>
      <section className="list-page">
        <div className="page-title-row">
          <div>
            <h1>シナリオ一覧</h1>
            <p className="page-subtitle">登録したシナリオを検索・絞り込みできます。</p>
          </div>
        </div>
        <section className="panel filter-panel">
          <label className="filter-field">
            <span>システム</span>
            <select value={systemFilter} onChange={(event) => setSystemFilter(event.target.value)}>
              <option value="">すべて</option>
              {TRPG_SYSTEMS.map((system) => (
                <option value={system} key={system}>
                  {system}
                </option>
              ))}
            </select>
          </label>
          <div className="filter-actions">
            <label className="filter-field sort-field">
              <span>並び替え</span>
              <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}>
                <option value="updated-desc">更新日（新しい順）</option>
                <option value="updated-asc">更新日（古い順）</option>
                <option value="title-asc">タイトル（昇順）</option>
                <option value="title-desc">タイトル（降順）</option>
                <option value="author-asc">作者名（昇順）</option>
                <option value="author-desc">作者名（降順）</option>
                <option value="created-desc">登録日（新しい順）</option>
                <option value="created-asc">登録日（古い順）</option>
              </select>
            </label>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setAdvanced(!advanced)}
            >
              {advanced ? "詳細条件を閉じる" : "詳細条件"}
            </button>
            <button className="text-button reset-button" type="button" onClick={resetFilters}>
              ↻ リセット
            </button>
          </div>
          {advanced ? (
            <div className="advanced-filters">
              <label className="filter-field">
                <span>お気に入り</span>
                <select
                  value={favoriteOnly ? "favorite" : ""}
                  onChange={(event) => setFavoriteOnly(event.target.value === "favorite")}
                >
                  <option value="">すべて</option>
                  <option value="favorite">お気に入りのみ</option>
                </select>
              </label>
              <label className="filter-field">
                <span>人数</span>
                <select
                  value={countFilter}
                  onChange={(event) => setCountFilter(event.target.value)}
                >
                  <option value="">すべて</option>
                  {["1", "2", "3", "4", "5"].map((count) => (
                    <option value={count} key={count}>
                      {count}人
                    </option>
                  ))}
                  <option value="6+">6人以上</option>
                </select>
              </label>
              <label className="filter-field">
                <span>時間</span>
                <select value={timeFilter} onChange={(event) => setTimeFilter(event.target.value)}>
                  <option value="">すべて</option>
                  {TIME_FILTERS.map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="filter-field">
                <span>ロスト率</span>
                <select value={lostFilter} onChange={(event) => setLostFilter(event.target.value)}>
                  <option value="">すべて</option>
                  {LOST_RATE_OPTIONS.map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="filter-field">
                <span>タグ（シナリオ傾向）</span>
                <select
                  value={trendFilter}
                  onChange={(event) => setTrendFilter(event.target.value)}
                >
                  <option value="">すべて</option>
                  {trendOptions.map((tag) => (
                    <option value={tag} key={tag}>
                      {tag}
                    </option>
                  ))}
                </select>
              </label>
              <label className="filter-field">
                <span>進行状況</span>
                <select
                  value={participationFilter}
                  onChange={(event) => setParticipationFilter(event.target.value)}
                >
                  <option value="">すべて</option>
                  <option value="kp-only">KP完了</option>
                  <option value="pl-only">PLプレイ済み</option>
                  <option value="both">KP・PL両方完了</option>
                  <option value="none">どちらも未完了</option>
                </select>
              </label>
              <label className="filter-field">
                <span>戦闘の有無</span>
                <select
                  value={combatFilter}
                  onChange={(event) => setCombatFilter(event.target.value)}
                >
                  <option value="">すべて</option>
                  {COMBAT_OPTIONS.map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
        </section>
        <div className="list-meta">
          <span>
            全 {scenarios.length} 件中 {visibleScenarios.length} 件を表示
          </span>
          {visibleScenarios.length > 0 ? <span>カードを選択して詳細を表示</span> : null}
        </div>
        {loading ? (
          <p className="muted" role="status" aria-live="polite">
            読み込み中…
          </p>
        ) : null}
        {message ? (
          <p className="error-message" role="alert">
            {message}
          </p>
        ) : null}
        {!loading && !message && visibleScenarios.length === 0 ? (
          <section className="empty-state">
            <div className="empty-icon">📚</div>
            <h2>
              {scenarios.length
                ? "条件に一致するシナリオがありません"
                : "シナリオが登録されていません"}
            </h2>
            <p>
              {scenarios.length
                ? "検索条件や絞り込み条件を変更してください。"
                : "「＋新規登録」からシナリオを登録してください。"}
            </p>
          </section>
        ) : null}
        <div className="scenario-grid" data-columns={listColumns}>
          {visibleScenarios.map((scenario) => (
            <article className="scenario-card" key={scenario.id}>
              <Link className="scenario-card-image-link" to={`/scenarios/${scenario.id}`}>
                {scenario.thumbnailUrl ? (
                  <img
                    className="card-image"
                    src={scenario.thumbnailUrl}
                    alt={`${scenario.title}のトレーラー画像`}
                  />
                ) : (
                  <div className="card-image card-image-placeholder" aria-hidden="true">
                    ✦
                  </div>
                )}
              </Link>
              <div className="card-body">
                <div className="card-title-row">
                  <h2 className="card-title">
                    <Link to={`/scenarios/${scenario.id}`}>{scenario.title}</Link>
                  </h2>
                  <button
                    className={`favorite-mark${scenario.favorite ? " active" : ""}`}
                    type="button"
                    aria-label={scenario.favorite ? "お気に入りから外す" : "お気に入りに追加"}
                    aria-pressed={scenario.favorite}
                    onClick={() => void toggleFavorite(scenario)}
                  >
                    {scenario.favorite ? "★" : "☆"}
                  </button>
                </div>
                <p className="card-system">{scenario.system}</p>
                {scenario.author ? <p className="card-author">作者名：{scenario.author}</p> : null}
                {scenario.stage ? <p className="card-stage">舞台：{scenario.stage}</p> : null}
                <div className="card-facts">
                  <span>{scenario.playerCount}</span>
                  <span>|</span>
                  <span>{scenario.playTime}</span>
                </div>
                {scenario.recommendedSkills ? (
                  <p className="card-recommended">推奨技能：{scenario.recommendedSkills}</p>
                ) : null}
                {scenario.hoType ? <p className="card-ho">HO形式：{scenario.hoType}</p> : null}
                <div className="card-tags">
                  {scenario.tags.slice(0, 3).map((tag) => (
                    <span className="card-tag" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
                <p className="card-status">
                  ロスト率：
                  {LOST_RATE_OPTIONS.find(([value]) => value === scenario.lostRate)?.[1] ??
                    "不明"}{" "}
                  / KP：
                  {scenario.kpStatus === "completed" ? "完了" : "未着手"} / PL：
                  {scenario.playStatus === "completed" ? "プレイ済み" : "未プレイ"}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </Layout>
  );
}

function BackupPage({ user }: { user: AuthUser | null }) {
  const [fileName, setFileName] = useState("");
  const [payload, setPayload] = useState<BackupPayload | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [backupDirectory, setBackupDirectory] = useState<BackupDirectoryHandle | null>(null);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState<BackupRestoreProgress | null>(null);
  const [restoreStartedAt, setRestoreStartedAt] = useState<number | null>(null);
  const [restoreElapsed, setRestoreElapsed] = useState(0);

  useEffect(() => {
    if (restoreStartedAt === null) return;
    const updateElapsed = () => setRestoreElapsed(Date.now() - restoreStartedAt);
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 250);
    return () => window.clearInterval(timer);
  }, [restoreStartedAt]);

  if (!user) return <Navigate to="/login" replace />;
  const currentUser = user;

  async function chooseBackupDirectory() {
    const picker = (window as BackupWindow).showDirectoryPicker;
    if (!picker) {
      setMessage("このブラウザでは保存先を指定できないため、通常のダウンロードを使用します。");
      return;
    }
    try {
      const directory = await picker({ mode: "readwrite", startIn: "downloads" });
      setBackupDirectory(directory);
      setMessage(`保存先を「${directory.name}」に設定しました。`);
    } catch (error) {
      if ((error as { name?: string }).name !== "AbortError") {
        setMessage("保存先の設定に失敗しました。");
      }
    }
  }

  async function createBackup() {
    setBusy(true);
    setMessage(null);
    const result = await backupService.createBackup(currentUser.id);
    setBusy(false);
    if (!result.success) {
      setMessage(result.error.message);
      return;
    }
    const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" });
    const fileName = `trpg-scenario-manager-backup-${new Date().toISOString().slice(0, 10)}.json`;
    if (backupDirectory) {
      try {
        let permission = await backupDirectory.queryPermission({ mode: "readwrite" });
        if (permission !== "granted") {
          permission = await backupDirectory.requestPermission({ mode: "readwrite" });
        }
        if (permission === "granted") {
          const folder = await backupDirectory.getDirectoryHandle("TRPG Scenario Manager Backups", {
            create: true,
          });
          const file = await folder.getFileHandle(fileName, { create: true });
          const writable = await file.createWritable();
          await writable.write(await blob.text());
          await writable.close();
          setMessage("バックアップを指定した保存先に保存しました。");
          return;
        }
      } catch {
        setMessage("指定した保存先に書き込めなかったため、ダウンロードに切り替えます。");
      }
    }
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage("バックアップをダウンロードしました。");
  }

  async function selectBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setPayload(null);
    setMessage(null);
    if (!file) {
      setFileName("");
      return;
    }
    setFileName(file.name);
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const result = backupService.validateBackup(parsed, currentUser.id);
      if (result.success) setPayload(result.data);
      else setMessage(result.error.message);
    } catch {
      setMessage("対応していないJSONファイルです。");
    }
  }

  async function restoreBackup() {
    if (!payload) return;
    setConfirmRestore(true);
  }

  async function confirmRestoreBackup() {
    if (!payload) return;
    setBusy(true);
    setMessage(null);
    setRestoreProgress({ step: 0, total: 5, label: "復元を準備中…" });
    setRestoreStartedAt(Date.now());
    try {
      const result = await backupService.restoreBackup(payload, setRestoreProgress);
      setMessage(result.success ? "データを復元しました。" : result.error.message);
      if (result.success) {
        setPayload(null);
        setFileName("");
      }
    } catch {
      setMessage("復元処理中に予期しないエラーが発生しました。");
    } finally {
      setBusy(false);
      setConfirmRestore(false);
      setRestoreStartedAt(null);
    }
  }

  return (
    <Layout>
      <div className="page-title-row">
        <div>
          <p className="eyebrow">Backup & Restore</p>
          <h1>バックアップ・復元</h1>
          <p className="page-subtitle">登録データをJSONファイルとして保存・復元できます。</p>
        </div>
      </div>
      <section className="backup-card panel">
        <div className="backup-icon" aria-hidden="true">
          ↥
        </div>
        <div>
          <h2>バックアップ</h2>
          <p className="muted">所有しているシナリオ、HO、Episode、個人管理情報を保存します。</p>
          <div className="backup-location">
            <strong>保存先</strong>
            <span>{backupDirectory?.name ?? "未選択"}</span>
            <button
              className="secondary-button"
              type="button"
              onClick={() => void chooseBackupDirectory()}
            >
              保存先を選択
            </button>
            <small>保存先の直下に「TRPG Scenario Manager Backups」フォルダを作成します。</small>
          </div>
        </div>
        <button
          className="primary-button"
          type="button"
          onClick={() => void createBackup()}
          disabled={busy}
        >
          {busy ? "処理中…" : "バックアップを作成"}
        </button>
      </section>
      <section className="backup-card panel">
        <div className="backup-icon" aria-hidden="true">
          ↧
        </div>
        <div>
          <h2>復元</h2>
          <p className="muted">バックアップ内容で現在の所有シナリオを上書きします。</p>
        </div>
        <div className="restore-controls">
          <label className="secondary-button file-button">
            JSONファイルを選択
            <input
              type="file"
              accept="application/json,.json"
              onChange={(event) => void selectBackup(event)}
            />
          </label>
          <span className="muted">{fileName || "選択されていません"}</span>
          <button
            className="primary-button"
            type="button"
            onClick={() => void restoreBackup()}
            disabled={!payload || busy}
          >
            復元する
          </button>
        </div>
      </section>
      {busy && restoreStartedAt !== null && restoreProgress
        ? (() => {
            const percent = Math.round((restoreProgress.step / restoreProgress.total) * 100);
            const estimatedRemaining =
              restoreProgress.step > 1 && restoreProgress.step < restoreProgress.total
                ? (restoreElapsed * (restoreProgress.total - restoreProgress.step)) /
                  restoreProgress.step
                : null;
            return (
              <section
                className="restore-progress panel"
                aria-live="polite"
                aria-label="復元の進捗"
              >
                <div className="restore-progress-heading">
                  <strong>{restoreProgress.label}</strong>
                  <span>{percent}%</span>
                </div>
                <progress max={restoreProgress.total} value={restoreProgress.step} />
                <div className="restore-progress-meta">
                  <span>経過時間：{formatDuration(restoreElapsed)}</span>
                  {estimatedRemaining !== null ? (
                    <span>残り目安：約{formatDuration(estimatedRemaining)}</span>
                  ) : (
                    <span>残り時間を計算中…</span>
                  )}
                </div>
              </section>
            );
          })()
        : null}
      {message ? (
        <p className="status-message backup-message" role="status" aria-live="polite">
          {message}
        </p>
      ) : null}
      <section className="backup-notice panel">
        <h2>注意事項</h2>
        <ul>
          <li>復元前に所有者、アプリ名、データ形式を確認します。</li>
          <li>復元すると現在の所有シナリオは上書きされます。</li>
          <li>共有されている他ユーザーのシナリオはバックアップ対象外です。</li>
          <li>画像本体のバックアップはStorage機能実装後に追加します。</li>
        </ul>
      </section>
      <ConfirmDialog
        open={confirmRestore}
        title="バックアップを復元"
        message="現在の所有シナリオをバックアップ内容で上書きします。よろしいですか？"
        confirmLabel="復元する"
        busy={busy}
        onCancel={() => setConfirmRestore(false)}
        onConfirm={() => void confirmRestoreBackup()}
      />
    </Layout>
  );
}

function ScenarioDetailPage({ user }: { user: AuthUser | null }) {
  const navigate = useNavigate();
  const { scenarioId } = useParams<{ scenarioId: string }>();
  const [scenario, setScenario] = useState<ScenarioDetailDto | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [shareCode, setShareCode] = useState("");
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shares, setShares] = useState<ScenarioShareDto[]>([]);
  const [removingShareId, setRemovingShareId] = useState<string | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [confirmAction, setConfirmAction] = useState<"scenario" | "share" | null>(null);
  const [pendingShare, setPendingShare] = useState<ScenarioShareDto | null>(null);
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    if (!user || !scenarioId) return;
    void scenarioService.getScenarioDetail(user.id, scenarioId).then(async (result) => {
      setLoading(false);
      if (!result.success) {
        setMessage(result.error.message);
        return;
      }
      const signedUrls = await Promise.all(
        result.data.images.map((image) => scenarioImageService.getSignedUrl(image.storagePath)),
      );
      const sessions = await Promise.all(
        result.data.sessions.map(async (session) => ({
          ...session,
          characters: await Promise.all(
            session.characters.map(async (character) => {
              if (!character.portraitStoragePath) return character;
              const signed = await scenarioImageService.getSignedUrl(character.portraitStoragePath);
              return { ...character, portraitSignedUrl: signed.success ? signed.data : null };
            }),
          ),
        })),
      );
      setScenario({
        ...result.data,
        sessions,
        images: result.data.images.map((image, index) => ({
          ...image,
          signedUrl: signedUrls[index].success ? signedUrls[index].data : null,
        })),
      });
      if (result.data.ownerId === user.id) {
        void scenarioService.getShares(scenarioId).then((shareResult) => {
          if (shareResult.success) setShares(shareResult.data);
          else setShareMessage(shareResult.error.message);
        });
      }
    });
  }, [scenarioId, user]);

  if (!user) return <Navigate to="/login" replace />;
  const currentUser = user;

  async function removeScenario() {
    if (!scenario) return;
    setConfirmAction("scenario");
  }

  async function toggleDetailFavorite() {
    if (!scenario) return;
    const nextFavorite = !scenario.favorite;
    setScenario({ ...scenario, favorite: nextFavorite });
    const result = await scenarioService.updateFavorite(currentUser.id, scenario.id, nextFavorite);
    if (!result.success) {
      setScenario({ ...scenario, favorite: !nextFavorite });
      setMessage(result.error.message);
    }
  }

  async function confirmRemoveScenario() {
    if (!scenario) return;
    const result = await scenarioService.deleteScenario(scenario.id);
    setConfirmAction(null);
    if (result.success) navigate("/scenarios", { replace: true });
    else setMessage(result.error.message);
  }

  async function addShare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!scenarioId) return;
    setSharing(true);
    setShareMessage(null);
    const profileResult = await profileService.findByShareCode(shareCode);
    if (!profileResult.success) {
      setShareMessage(profileResult.error.message);
      setSharing(false);
      return;
    }
    if (!profileResult.data) {
      setShareMessage("該当するプロフィールが見つかりませんでした。");
      setSharing(false);
      return;
    }
    if (profileResult.data.id === currentUser.id) {
      setShareMessage("自分自身には共有できません。");
      setSharing(false);
      return;
    }
    const result = await scenarioService.addShare(scenarioId, profileResult.data.id);
    setSharing(false);
    if (result.success) {
      setShareCode("");
      setShareMessage(`${profileResult.data.displayName} さんに共有しました。`);
      const sharesResult = await scenarioService.getShares(scenarioId);
      if (sharesResult.success) setShares(sharesResult.data);
    } else setShareMessage(result.error.message);
  }

  async function removeShare(share: ScenarioShareDto) {
    if (!scenarioId) return;
    setPendingShare(share);
    setConfirmAction("share");
  }

  async function confirmRemoveShare() {
    if (!scenarioId || !pendingShare) return;
    const share = pendingShare;
    setRemovingShareId(share.id);
    setShareMessage(null);
    const result = await scenarioService.removeShare(scenarioId, share.sharedUserId);
    setRemovingShareId(null);
    setPendingShare(null);
    setConfirmAction(null);
    if (result.success) {
      setShares((currentShares) => currentShares.filter((current) => current.id !== share.id));
      setShareMessage(`${share.displayName} さんとの共有を解除しました。`);
    } else setShareMessage(result.error.message);
  }

  async function copyDiscordFormat() {
    if (!scenario) return;
    setCopying(true);
    const settingsResult = await userSettingsService.get(currentUser.id);
    if (!settingsResult.success) {
      setCopying(false);
      setMessage(settingsResult.error.message);
      return;
    }
    try {
      await navigator.clipboard.writeText(
        formatScenarioForDiscord(scenario, settingsResult.data.discordFormat),
      );
      setMessage("Discord用形式でコピーしました。");
    } catch {
      setMessage("クリップボードへコピーできませんでした。");
    } finally {
      setCopying(false);
    }
  }

  return (
    <Layout>
      <section className="scenario-detail-page">
        <Link className="back-link" to="/scenarios">
          ← シナリオ一覧へ戻る
        </Link>
        {loading ? (
          <p className="muted" role="status" aria-live="polite">
            読み込み中…
          </p>
        ) : null}
        {message ? (
          <p className="error-message" role="alert">
            {message}
          </p>
        ) : null}
        {scenario ? (
          <>
            <div className="detail-hero">
              <div className="detail-hero-media">
                {scenario.images.length > 0 && scenario.images[activeImageIndex]?.signedUrl ? (
                  <img
                    src={scenario.images[activeImageIndex].signedUrl ?? ""}
                    alt={`${scenario.title}のシナリオ画像${activeImageIndex + 1}`}
                    style={{
                      objectPosition: `${scenario.images[activeImageIndex].positionX}% ${scenario.images[activeImageIndex].positionY}%`,
                      transform: `translate(${(50 - scenario.images[activeImageIndex].positionX) * (scenario.images[activeImageIndex].zoom - 1)}%, ${(50 - scenario.images[activeImageIndex].positionY) * (scenario.images[activeImageIndex].zoom - 1)}%) scale(${scenario.images[activeImageIndex].zoom})`,
                      transformOrigin: "center",
                    }}
                  />
                ) : (
                  <span aria-hidden="true">✦</span>
                )}
                {scenario.images.length > 1 ? (
                  <>
                    <button
                      className="carousel-button carousel-button-prev"
                      type="button"
                      aria-label="前の画像"
                      onClick={() =>
                        setActiveImageIndex(
                          (activeImageIndex - 1 + scenario.images.length) % scenario.images.length,
                        )
                      }
                    >
                      ‹
                    </button>
                    <button
                      className="carousel-button carousel-button-next"
                      type="button"
                      aria-label="次の画像"
                      onClick={() =>
                        setActiveImageIndex((activeImageIndex + 1) % scenario.images.length)
                      }
                    >
                      ›
                    </button>
                    <span className="carousel-counter">
                      {activeImageIndex + 1} / {scenario.images.length}
                    </span>
                  </>
                ) : null}
              </div>
              <div className="detail-hero-copy">
                <div className="detail-title-row">
                  <h1>{scenario.title || "未設定"}</h1>
                  <button
                    className={`favorite-mark${scenario.favorite ? " active" : ""}`}
                    type="button"
                    aria-label={scenario.favorite ? "お気に入りから解除" : "お気に入りに追加"}
                    aria-pressed={scenario.favorite}
                    onClick={() => void toggleDetailFavorite()}
                  >
                    {scenario.favorite ? "★" : "☆"}
                  </button>
                </div>
                <div className="detail-tags">
                  {scenario.system ? <span className="detail-tag">{scenario.system}</span> : null}
                  <span className="detail-tag">{formatScenarioType(scenario.scenarioType)}</span>
                  {scenario.playerCount ? (
                    <span className="detail-tag">{scenario.playerCount}</span>
                  ) : null}
                  {scenario.playTime ? (
                    <span className="detail-tag">{scenario.playTime}</span>
                  ) : null}
                  {scenario.tags.slice(0, 3).map((tag) => (
                    <span className="detail-tag" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
                {scenario.author ? (
                  <p className="detail-author">作者名：{scenario.author}</p>
                ) : null}
                {scenario.titleReading || scenario.authorReading ? (
                  <p className="detail-author">
                    読み：
                    {[scenario.titleReading, scenario.authorReading].filter(Boolean).join(" / ")}
                  </p>
                ) : null}
                <p className="detail-summary">
                  {scenario.trailerText || "トレーラー文章は登録されていません"}
                </p>
              </div>
            </div>
            <div className="action-row detail-top-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => void copyDiscordFormat()}
                disabled={copying}
              >
                {copying ? "コピー中…" : "Discord用にコピー"}
              </button>
            </div>
            <section className="section-card">
              <h2 className="section-heading">基本情報</h2>
              <div className="data-grid">
                <div className="data-column">
                  <DetailItem label="TRPGシステム" value={scenario.system} />
                  <DetailItem label="作者名" value={scenario.author} />
                  <DetailItem label="作者読み" value={scenario.authorReading} />
                  <DetailItem label="舞台" value={scenario.stage} />
                </div>
                <div className="data-column">
                  <DetailItem label="人数" value={scenario.playerCount} />
                  <DetailItem label="人数形式" value={scenario.playerCountType} />
                </div>
                <div className="data-column">
                  <DetailItem label="時間" value={scenario.playTime} />
                  <DetailItem label="時間形式" value={scenario.playTimeType} />
                </div>
              </div>
            </section>
            <section className="section-card">
              <h2 className="section-heading">シナリオ情報</h2>
              <div className="data-grid">
                <div className="data-column">
                  <DetailItem label="推奨技能" value={scenario.recommendedSkills} />
                  <DetailItem label="準推奨技能" value={scenario.secondarySkills} />
                  <DetailItem label="非推奨" value={scenario.notRecommended} />
                </div>
                <div className="data-column">
                  <DetailItem label="ロスト率" value={formatLostRate(scenario.lostRate)} />
                  <DetailItem label="ロスト率補足" value={scenario.lostRateNote} />
                  <DetailItem label="HO形式" value={scenario.hoType} />
                  <DetailItem
                    label="HO内容"
                    value={
                      scenario.handouts
                        .map((handout) => handout.content)
                        .filter(Boolean)
                        .join("\n") || null
                    }
                  />
                </div>
                <div className="data-column">
                  <DetailItem label="戦闘の有無" value={formatBattle(scenario.battle)} />
                  <DetailItem label="シナリオ傾向" value={scenario.tags.join(" / ")} />
                  <DetailItem label="注意事項" value={scenario.cautions} />
                </div>
              </div>
            </section>
            <section className="section-card">
              <h2 className="section-heading">シナリオ管理</h2>
              <div className="data-grid">
                <div className="data-column">
                  <DetailItem label="購入・配布URL" value={scenario.purchaseUrl} />
                  <DetailItem label="KP" value={scenario.kpStatus === "completed" ? "✓" : null} />
                  <DetailItem label="PL" value={scenario.playStatus === "completed" ? "✓" : null} />
                </div>
                <div className="data-column">
                  <DetailItem label="個人メモ" value={scenario.memo} />
                  <DetailItem label="KPメモ" value={scenario.kpMemo} />
                  <DetailItem label="PLメモ" value={scenario.plMemo} />
                </div>
                <div className="data-column">
                  <DetailItem label="登録日" value={formatDateTime(scenario.createdAt)} />
                  <DetailItem label="更新日" value={formatDateTime(scenario.updatedAt)} />
                </div>
              </div>
            </section>
            <section className="section-card">
              <h2 className="section-heading">参加記録</h2>
              <div className="session-list">
                {scenario.sessions.length ? (
                  scenario.sessions.map((session) => (
                    <article className="session-card" key={session.id}>
                      <h3>
                        {session.name || "参加記録"} <span className="tag">{session.role}</span>
                      </h3>
                      <div className="character-list">
                        {session.characters.length ? (
                          session.characters.map((character) => (
                            <article className="character-card" key={character.id}>
                              {character.portraitSignedUrl ? (
                                <img
                                  className="character-portrait"
                                  src={character.portraitSignedUrl}
                                  alt={`${character.name || "PC"}の立ち絵`}
                                />
                              ) : null}
                              <div>
                                <h4>{character.name || "PC"}</h4>
                                <DetailItem label="PL名" value={character.playerName} />
                                <DetailItem label="いあきゃら" value={character.iacharaUrl} />
                                <DetailItem label="HO" value={character.ho} />
                                <DetailItem label="メモ" value={character.memo} />
                              </div>
                            </article>
                          ))
                        ) : (
                          <span className="muted">PC未登録</span>
                        )}
                      </div>
                    </article>
                  ))
                ) : (
                  <span className="muted">参加記録未登録</span>
                )}
              </div>
            </section>
            {scenario.handouts.length > 0 ? (
              <section className="detail-section">
                <h2>HO</h2>
                {scenario.handouts.map((handout) => (
                  <article className="detail-item" key={handout.id}>
                    <h3>{handout.label ?? "HO"}</h3>
                    <p className="preformatted">{handout.content}</p>
                  </article>
                ))}
              </section>
            ) : null}
            {scenario.episodes.length > 0 ? (
              <section className="detail-section">
                <h2>Episode</h2>
                {scenario.episodes.map((episode) => (
                  <article className="detail-item" key={episode.id}>
                    <h3>
                      {episode.episodeNumber}. {episode.title ?? "無題"}
                    </h3>
                    <p className="muted">{episode.time}</p>
                    {episode.summary ? <p className="preformatted">{episode.summary}</p> : null}
                  </article>
                ))}
              </section>
            ) : null}
            {scenario.ownerId === user.id ? (
              <div className="action-row detail-bottom-actions">
                <Link className="secondary-button" to={`/scenarios/${scenario.id}/edit`}>
                  編集
                </Link>
                <button
                  className="danger-button"
                  type="button"
                  onClick={() => void removeScenario()}
                >
                  シナリオを削除
                </button>
              </div>
            ) : null}
            {scenario.ownerId === user.id ? (
              <section
                className="detail-section detail-share-section"
                aria-labelledby="scenario-share-heading"
              >
                <p className="eyebrow">共有</p>
                <h2 id="scenario-share-heading">シナリオを共有</h2>
                <p className="muted">共有先の共有コードを入力すると、閲覧権限を付与します。</p>
                <form className="profile-form" onSubmit={(event) => void addShare(event)}>
                  <label htmlFor="scenario-share-code">共有コード</label>
                  <input
                    id="scenario-share-code"
                    value={shareCode}
                    onChange={(event) => setShareCode(event.target.value.toUpperCase())}
                    placeholder="TRPG-ABC234"
                    maxLength={11}
                    autoComplete="off"
                    required
                  />
                  <button className="primary-button" type="submit" disabled={sharing}>
                    {sharing ? "共有中…" : "共有する"}
                  </button>
                </form>
                {shareMessage ? (
                  <p className="status-message" role="status" aria-live="polite">
                    {shareMessage}
                  </p>
                ) : null}
                <h3>共有先一覧</h3>
                {shares.length === 0 ? (
                  <p className="muted">まだ共有先がありません。</p>
                ) : (
                  <ul className="share-list">
                    {shares.map((share) => (
                      <li key={share.id}>
                        <span>
                          <strong>{share.displayName}</strong>
                          <span className="muted">閲覧者</span>
                        </span>
                        <button
                          className="danger-button"
                          type="button"
                          onClick={() => void removeShare(share)}
                          disabled={removingShareId === share.id}
                        >
                          {removingShareId === share.id ? "解除中…" : "解除"}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ) : null}
          </>
        ) : null}
      </section>
      <ConfirmDialog
        open={confirmAction === "scenario"}
        title="シナリオを削除"
        message="このシナリオと関連する記録・画像を削除します。よろしいですか？"
        confirmLabel="削除する"
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => void confirmRemoveScenario()}
      />
      <ConfirmDialog
        open={confirmAction === "share"}
        title="共有を解除"
        message={`${pendingShare?.displayName ?? "このユーザー"} さんとの共有を解除します。よろしいですか？`}
        confirmLabel="解除する"
        busy={removingShareId !== null}
        onCancel={() => {
          setConfirmAction(null);
          setPendingShare(null);
        }}
        onConfirm={() => void confirmRemoveShare()}
      />
    </Layout>
  );
}

function formatLostRate(value: string | null) {
  return (
    {
      none: "なし",
      low: "低",
      medium: "中",
      high: "高",
      very_high: "極高",
      unknown: "不明",
    }[value ?? ""] ?? value
  );
}

function formatScenarioType(value: ScenarioCard["scenarioType"]) {
  return { normal: "通常", campaign: "キャンペーン", kpLess: "KPレス" }[value] ?? "未設定";
}

function formatBattle(value: string | null) {
  return { yes: "あり", no: "なし", conditional: "場合による" }[value ?? ""] ?? value;
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function DetailItem({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="detail-item">
      <h3>{label}</h3>
      <p className="preformatted">{value}</p>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [profileState, setProfileState] = useState<{ userId: string; ready: boolean } | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    void profileService.getMyProfile(user.id).then((result) => {
      if (active)
        setProfileState({ userId: user.id, ready: result.success && result.data !== null });
    });
    return () => {
      active = false;
    };
  }, [user]);

  const profileReady = user && profileState?.userId === user.id ? profileState.ready : null;

  useEffect(() => {
    void authService.getCurrentUser().then((result) => {
      if (result.success) setUser(result.data);
      setSessionChecked(true);
    });
    return authRepository.onAuthStateChange(setUser);
  }, []);

  useEffect(() => {
    if (!user) {
      applyTheme("light");
      return;
    }

    const cachedTheme = window.localStorage.getItem(`trpg-theme:${user.id}`);
    if (cachedTheme === "light" || cachedTheme === "gray" || cachedTheme === "dark") {
      applyTheme(cachedTheme);
    }

    void userSettingsService.get(user.id).then((result) => {
      if (!result.success) return;
      applyTheme(result.data.theme);
      window.localStorage.setItem(`trpg-theme:${user.id}`, result.data.theme);
    });
  }, [user]);

  if (!sessionChecked || (user !== null && profileReady === null)) {
    return <div className="loading-screen">読み込み中…</div>;
  }

  const authenticatedPage = (page: ReactNode) =>
    user ? (
      profileReady ? (
        page
      ) : (
        <Navigate to="/profile" replace />
      )
    ) : (
      <Navigate to="/login" replace />
    );

  return (
    <AppRoutes
      pages={{
        home: (
          <Navigate to={user ? (profileReady ? "/scenarios" : "/profile") : "/login"} replace />
        ),
        login: <LoginPage user={user} profileReady={profileReady} />,
        profile: (
          <ProfileSetupPage
            user={user}
            onProfileReady={() => {
              if (user) setProfileState({ userId: user.id, ready: true });
            }}
          />
        ),
        backup: authenticatedPage(<BackupPage user={user} />),
        settings: authenticatedPage(<SettingsPage user={user} />),
        discordFormat: authenticatedPage(<DiscordFormatPage user={user} />),
        scenarios: authenticatedPage(<ScenarioListPage user={user} />),
        scenarioCreate: authenticatedPage(<ScenarioFormPage mode="create" user={user} />),
        scenarioEdit: authenticatedPage(<ScenarioFormPage mode="edit" user={user} />),
        scenarioDetail: authenticatedPage(<ScenarioDetailPage user={user} />),
      }}
    />
  );
}
