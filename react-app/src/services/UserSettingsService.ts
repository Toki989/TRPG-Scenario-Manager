import type { ApiResult } from "../domain/errors/ApiResult";
import type { DiscordFormat, Theme, UserSettings } from "../domain/models/UserSettings";
import { userSettingsRepository } from "../repositories/settings/UserSettingsRepository";

export const DEFAULT_DISCORD_FORMAT: DiscordFormat = {
  fields: ["title", "system", "author", "playerCount", "playTime", "tags", "trailerText"],
  includeLabels: true,
  headingPrefix: "【シナリオ情報】",
  separator: "\n",
};

export const DEFAULT_USER_SETTINGS: Omit<UserSettings, "userId"> = {
  theme: "light",
  listColumns: 4,
  deleteConfirm: true,
  backupAfterSave: false,
  discordFormat: DEFAULT_DISCORD_FORMAT,
};

function normalizeDiscordFormat(value: Record<string, unknown> | null | undefined): DiscordFormat {
  const fields = Array.isArray(value?.fields)
    ? value.fields.filter((field): field is string => typeof field === "string")
    : DEFAULT_DISCORD_FORMAT.fields;
  return {
    fields: fields.length ? fields : DEFAULT_DISCORD_FORMAT.fields,
    includeLabels: typeof value?.includeLabels === "boolean" ? value.includeLabels : true,
    headingPrefix:
      typeof value?.headingPrefix === "string"
        ? value.headingPrefix
        : DEFAULT_DISCORD_FORMAT.headingPrefix,
    separator:
      typeof value?.separator === "string" ? value.separator : DEFAULT_DISCORD_FORMAT.separator,
  };
}

export class UserSettingsService {
  async get(userId: string): Promise<ApiResult<UserSettings>> {
    const result = await userSettingsRepository.get(userId);
    if (!result.success)
      return { success: false, error: { code: "DATABASE_ERROR", message: result.error.message } };
    if (!result.data) return { success: true, data: { userId, ...DEFAULT_USER_SETTINGS } };
    const row = result.data;
    return {
      success: true,
      data: {
        userId,
        theme: row.theme,
        listColumns: row.list_columns as 1 | 2 | 3 | 4,
        deleteConfirm: row.delete_confirm,
        backupAfterSave: row.backup_after_save,
        discordFormat: normalizeDiscordFormat(row.discord_format),
      },
    };
  }

  async save(
    userId: string,
    settings: Omit<UserSettings, "userId">,
  ): Promise<ApiResult<UserSettings>> {
    const result = await userSettingsRepository.upsert(userId, {
      theme: settings.theme as Theme,
      list_columns: settings.listColumns,
      delete_confirm: settings.deleteConfirm,
      backup_after_save: settings.backupAfterSave,
      discord_format: settings.discordFormat as unknown as Record<string, unknown>,
    });
    if (!result.success)
      return { success: false, error: { code: "DATABASE_ERROR", message: result.error.message } };
    return this.get(userId);
  }
}

export const userSettingsService = new UserSettingsService();
