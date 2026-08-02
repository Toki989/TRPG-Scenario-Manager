import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import type { AuthUser } from "../domain/models/AuthUser";
import type { ProfileDto } from "../domain/dto/ProfileDto";
import type { Theme, UserSettings } from "../domain/models/UserSettings";
import { authService } from "../services/AuthService";
import { profileService } from "../services/ProfileService";
import { userSettingsService } from "../services/UserSettingsService";
import { AppLayout } from "../components/layout/AppLayout";
import { ConfirmDialog } from "../components/modal/ConfirmDialog";

export function SettingsPage({ user }: { user: AuthUser | null }) {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileDto | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showLogout, setShowLogout] = useState(false);

  useEffect(() => {
    if (!user) return;
    void Promise.all([profileService.getMyProfile(user.id), userSettingsService.get(user.id)]).then(
      ([profileResult, settingsResult]) => {
        if (profileResult.success) {
          setProfile(profileResult.data);
          setDisplayName(profileResult.data?.displayName ?? user.displayName ?? "");
        } else setMessage(profileResult.error.message);
        if (settingsResult.success) {
          setSettings(settingsResult.data);
          document.documentElement.dataset.theme = settingsResult.data.theme;
          document.body.dataset.theme = settingsResult.data.theme;
          window.localStorage.setItem(`trpg-theme:${user.id}`, settingsResult.data.theme);
        } else setMessage(settingsResult.error.message);
      },
    );
  }, [user]);

  if (!user) return <Navigate to="/login" replace />;
  const currentUser = user;

  async function saveProfile() {
    setBusy(true);
    setMessage(null);
    const result = await profileService.updateDisplayName(currentUser.id, displayName);
    setBusy(false);
    if (result.success) {
      setProfile(result.data);
      setMessage("プロフィールを保存しました。");
    } else setMessage(result.error.message);
  }

  async function saveSettings() {
    if (!settings) return;
    setBusy(true);
    setMessage(null);
    const result = await userSettingsService.save(currentUser.id, settings);
    setBusy(false);
    if (result.success) {
      setSettings(result.data);
      document.documentElement.dataset.theme = result.data.theme;
      document.body.dataset.theme = result.data.theme;
      window.localStorage.setItem(`trpg-theme:${currentUser.id}`, result.data.theme);
      setMessage("設定を保存しました。");
    } else setMessage(result.error.message);
  }

  async function regenerateShareCode() {
    setBusy(true);
    const result = await profileService.regenerateShareCode(currentUser.id);
    setBusy(false);
    if (result.success) {
      setProfile(result.data);
      setMessage("共有コードを再発行しました。");
    } else setMessage(result.error.message);
  }

  async function logout() {
    setBusy(true);
    const result = await authService.logout();
    setBusy(false);
    if (result.success) navigate("/login", { replace: true });
    else setMessage(result.error.message);
  }

  async function copyShareCode() {
    if (!profile) return;
    await navigator.clipboard.writeText(profile.shareCode);
    setMessage("共有コードをコピーしました。");
  }

  return (
    <AppLayout>
      <section className="panel settings-page">
        <div className="page-title-row">
          <div>
            <p className="eyebrow">Settings</p>
            <h1>設定</h1>
            <p className="page-subtitle">表示、プロフィール、アカウントの設定を管理します。</p>
          </div>
        </div>
        <section className="section-card">
          <h2 className="section-heading">表示設定</h2>
          {settings ? (
            <div className="form-grid">
              <div className="form-column">
                <label htmlFor="settings-theme">テーマ</label>
                <select
                  id="settings-theme"
                  value={settings.theme}
                  onChange={(event) =>
                    setSettings({ ...settings, theme: event.target.value as Theme })
                  }
                >
                  <option value="light">ライト</option>
                  <option value="gray">グレー</option>
                  <option value="dark">ダーク</option>
                </select>
              </div>
              <div className="form-column">
                <label htmlFor="settings-columns">一覧表示列数</label>
                <select
                  id="settings-columns"
                  value={settings.listColumns}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      listColumns: Number(event.target.value) as 1 | 2 | 3 | 4,
                    })
                  }
                >
                  {[1, 2, 3, 4].map((columns) => (
                    <option value={columns} key={columns}>
                      {columns}列
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <p className="muted">設定を読み込み中…</p>
          )}
          {settings ? (
            <div className="check-grid">
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={settings.deleteConfirm}
                  onChange={(event) =>
                    setSettings({ ...settings, deleteConfirm: event.target.checked })
                  }
                />
                削除時に確認する
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={settings.backupAfterSave}
                  onChange={(event) =>
                    setSettings({ ...settings, backupAfterSave: event.target.checked })
                  }
                />
                保存後にバックアップを案内する
              </label>
            </div>
          ) : null}
          <button
            className="primary-button"
            type="button"
            onClick={() => void saveSettings()}
            disabled={busy || !settings}
          >
            設定を保存
          </button>
        </section>

        <section className="section-card">
          <h2 className="section-heading">プロフィール</h2>
          <p className="muted">ログイン中: {user.email ?? "Googleアカウント"}</p>
          <label htmlFor="settings-display-name">表示名</label>
          <input
            id="settings-display-name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            maxLength={80}
          />
          <button
            className="primary-button"
            type="button"
            onClick={() => void saveProfile()}
            disabled={busy}
          >
            表示名を保存
          </button>
          {profile ? (
            <div className="share-code-panel">
              <strong>共有コード</strong>
              <code>{profile.shareCode}</code>
              <div className="action-row">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void copyShareCode()}
                >
                  コピー
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void regenerateShareCode()}
                  disabled={busy}
                >
                  再発行
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <section className="section-card">
          <h2 className="section-heading">関連設定</h2>
          <Link className="secondary-button" to="/settings/discord-format">
            Discord形式を設定
          </Link>
        </section>

        <div className="action-row">
          <Link className="text-button" to="/scenarios">
            一覧へ戻る
          </Link>
          <button
            className="danger-button"
            type="button"
            onClick={() => setShowLogout(true)}
            disabled={busy}
          >
            ログアウト
          </button>
        </div>
        {message ? (
          <p className="status-message" role="status" aria-live="polite">
            {message}
          </p>
        ) : null}
      </section>
      <ConfirmDialog
        open={showLogout}
        title="ログアウトしますか？"
        message="未保存の画面入力がある場合は失われます。"
        confirmLabel="ログアウト"
        onCancel={() => setShowLogout(false)}
        onConfirm={() => void logout()}
        busy={busy}
      />
    </AppLayout>
  );
}
