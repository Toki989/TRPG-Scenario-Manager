import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import type { AuthUser } from "../domain/models/AuthUser";
import type { DiscordFormat, UserSettings } from "../domain/models/UserSettings";
import { AppLayout } from "../components/layout/AppLayout";
import { DEFAULT_DISCORD_FORMAT, userSettingsService } from "../services/UserSettingsService";
import { DISCORD_FIELD_OPTIONS, formatDiscordPreview } from "../services/DiscordScenarioFormatter";

export function DiscordFormatPage({ user }: { user: AuthUser | null }) {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    void userSettingsService.get(user.id).then((result) => {
      if (result.success) setSettings(result.data);
      else setMessage(result.error.message);
    });
  }, [user]);

  if (!user) return <Navigate to="/login" replace />;
  const currentUser = user;

  function updateFormat(patch: Partial<DiscordFormat>) {
    if (settings)
      setSettings({ ...settings, discordFormat: { ...settings.discordFormat, ...patch } });
  }

  function moveField(index: number, direction: -1 | 1) {
    if (!settings) return;
    const target = index + direction;
    if (target < 0 || target >= settings.discordFormat.fields.length) return;
    const fields = [...settings.discordFormat.fields];
    [fields[index], fields[target]] = [fields[target], fields[index]];
    updateFormat({ fields });
  }

  function toggleField(field: string) {
    if (!settings) return;
    const fields = settings.discordFormat.fields.includes(field)
      ? settings.discordFormat.fields.filter((current) => current !== field)
      : [...settings.discordFormat.fields, field];
    updateFormat({ fields: fields.length ? fields : DEFAULT_DISCORD_FORMAT.fields });
  }

  async function save() {
    if (!settings) return;
    setBusy(true);
    const result = await userSettingsService.save(currentUser.id, settings);
    setBusy(false);
    setMessage(result.success ? "Discord形式を保存しました。" : result.error.message);
    if (result.success) setSettings(result.data);
  }

  return (
    <AppLayout>
      <section className="panel narrow-panel">
        <Link className="back-link" to="/settings">
          ← 設定へ戻る
        </Link>
        <p className="eyebrow">Discord Format</p>
        <h1>Discord形式設定</h1>
        {settings ? (
          <>
            <label htmlFor="discord-heading">見出し</label>
            <input
              id="discord-heading"
              value={settings.discordFormat.headingPrefix}
              onChange={(event) => updateFormat({ headingPrefix: event.target.value })}
            />
            <label htmlFor="discord-separator">区切り文字</label>
            <select
              id="discord-separator"
              value={settings.discordFormat.separator}
              onChange={(event) => updateFormat({ separator: event.target.value })}
            >
              <option value={"\n"}>改行</option>
              <option value={"\n\n"}>空行</option>
            </select>
            <label className="check-label">
              <input
                type="checkbox"
                checked={settings.discordFormat.includeLabels}
                onChange={(event) => updateFormat({ includeLabels: event.target.checked })}
              />
              項目名を付ける
            </label>
            <h2 className="section-heading">出力項目</h2>
            <div className="discord-field-list">
              {DISCORD_FIELD_OPTIONS.map(([field, label]) => {
                const index = settings.discordFormat.fields.indexOf(field);
                return (
                  <div className="discord-field-row" key={field}>
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={index >= 0}
                        onChange={() => toggleField(field)}
                      />
                      {label}
                    </label>
                    {index >= 0 ? (
                      <span className="action-row">
                        <button
                          className="text-button"
                          type="button"
                          onClick={() => moveField(index, -1)}
                          disabled={index === 0}
                        >
                          ↑
                        </button>
                        <button
                          className="text-button"
                          type="button"
                          onClick={() => moveField(index, 1)}
                          disabled={index === settings.discordFormat.fields.length - 1}
                        >
                          ↓
                        </button>
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <section className="discord-preview-section" aria-labelledby="discord-preview-heading">
              <h2 id="discord-preview-heading" className="section-heading">
                プレビュー
              </h2>
              <pre className="discord-preview">
                {formatDiscordPreview(settings.discordFormat) || "表示する項目を選択してください。"}
              </pre>
            </section>
            <p className="muted">シナリオ詳細の「Discord用にコピー」でこの形式を使います。</p>
            <button
              className="primary-button"
              type="button"
              onClick={() => void save()}
              disabled={busy}
            >
              保存
            </button>
          </>
        ) : (
          <p className="muted">設定を読み込み中…</p>
        )}
        {message ? (
          <p className="status-message" role="status" aria-live="polite">
            {message}
          </p>
        ) : null}
      </section>
    </AppLayout>
  );
}
