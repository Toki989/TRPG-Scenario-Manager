import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import type { AuthUser } from "../domain/models/AuthUser";
import { authService } from "../services/AuthService";
import { profileService } from "../services/ProfileService";

export function ProfileSetupPage({
  user,
  onProfileReady,
}: {
  user: AuthUser | null;
  onProfileReady: () => void;
}) {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    void profileService.getMyProfile(user.id).then((result) => {
      setLoading(false);
      if (!result.success) {
        setMessage(result.error.message);
        return;
      }
      if (result.data) {
        onProfileReady();
        navigate("/scenarios", { replace: true });
      }
    });
  }, [navigate, onProfileReady, user]);

  if (!user) return <Navigate to="/login" replace />;
  const currentUser = user;

  async function createProfile() {
    const normalizedName = displayName.trim();
    if (!normalizedName) {
      setMessage("表示名を入力してください。");
      return;
    }

    setBusy(true);
    setMessage(null);
    const result = await profileService.createInitialProfile(currentUser.id, normalizedName);
    setBusy(false);
    if (!result.success) {
      setMessage(result.error.message);
      return;
    }
    onProfileReady();
    navigate("/scenarios", { replace: true });
  }

  async function logout() {
    setBusy(true);
    const result = await authService.logout();
    setBusy(false);
    if (result.success) navigate("/login", { replace: true });
    else setMessage(result.error.message);
  }

  if (loading) {
    return <div className="loading-screen">プロフィールを確認中…</div>;
  }

  return (
    <div className="auth-shell">
      <main className="auth-main">
        <section className="panel narrow-panel auth-card profile-setup-card">
          {user.avatarUrl ? (
            <img
              className="profile-setup-avatar"
              src={user.avatarUrl}
              alt="Googleアカウントのプロフィール画像"
            />
          ) : (
            <div className="profile-setup-avatar profile-setup-avatar-fallback" aria-hidden="true">
              {Array.from((user.displayName ?? user.email ?? "G").trim())[0] ?? "G"}
            </div>
          )}
          <p className="eyebrow">Profile setup</p>
          <h1>プロフィールを作成</h1>
          <p>初回利用のため、表示名を登録してください。</p>
          <p className="muted">ログイン中: {user.email ?? "Googleアカウント"}</p>
          <div className="profile-form">
            <label htmlFor="profile-setup-display-name">表示名</label>
            <input
              id="profile-setup-display-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={80}
              autoComplete="nickname"
              disabled={busy}
            />
            <button
              className="primary-button"
              type="button"
              onClick={() => void createProfile()}
              disabled={busy}
            >
              {busy ? "登録中…" : "プロフィールを登録"}
            </button>
          </div>
          {message ? (
            <p className="error-message" role="alert">
              {message}
            </p>
          ) : null}
          <button
            className="text-button"
            type="button"
            onClick={() => void logout()}
            disabled={busy}
          >
            ログアウト
          </button>
        </section>
      </main>
    </div>
  );
}
