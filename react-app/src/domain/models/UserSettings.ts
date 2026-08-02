export type Theme = "light" | "gray" | "dark";

export interface DiscordFormat {
  fields: string[];
  includeLabels: boolean;
  headingPrefix: string;
  separator: string;
}

export interface UserSettings {
  userId: string;
  theme: Theme;
  listColumns: 1 | 2 | 3 | 4;
  deleteConfirm: boolean;
  backupAfterSave: boolean;
  discordFormat: DiscordFormat;
}
