import type {
  ScenarioEpisodeRow,
  ScenarioHandoutRow,
  ScenarioImageRow,
  ScenarioRow,
  ScenarioSessionCharacterRow,
  ScenarioSessionRow,
  UserScenarioDataRow,
} from "../../lib/supabase/database.types";

export const BACKUP_APP_NAME = "TRPG Scenario Manager";
export const BACKUP_DATA_VERSION = 1;
export const DRAFT_DATA_VERSION = 1;

export interface ScenarioBackupRecord {
  scenario: ScenarioRow;
  handouts: ScenarioHandoutRow[];
  episodes: ScenarioEpisodeRow[];
  images: ScenarioImageRow[];
  sessions: ScenarioSessionRow[];
  sessionCharacters: ScenarioSessionCharacterRow[];
  userData: UserScenarioDataRow | null;
}

export interface BackupPayload {
  appName: string;
  dataVersion: number;
  createdAt: string;
  ownerId: string;
  scenarios: ScenarioBackupRecord[];
  legacyImageUploads?: LegacyImageUpload[];
}

export interface LegacyImageUpload {
  scenarioId: string;
  displayOrder: number;
  dataUrl: string;
  positionX: number;
  positionY: number;
  zoom: number;
}

export interface BackupRestoreProgress {
  step: number;
  total: number;
  label: string;
}
