import type { ProgressStatus, ScenarioSummary } from "./Scenario";

export interface ScenarioHandout {
  id: string;
  displayOrder: number;
  label: string | null;
  content: string;
}

export interface ScenarioEpisode {
  id: string;
  episodeNumber: number;
  title: string | null;
  time: string;
  timeType: "fixed" | "range" | "free";
  timeFixed: number | null;
  timeMin: number | null;
  timeMax: number | null;
  timeText: string | null;
  summary: string | null;
  status: ProgressStatus;
  playDate: string | null;
}

export interface ScenarioImage {
  id: string;
  displayOrder: number;
  storagePath: string;
  signedUrl: string | null;
  positionX: number;
  positionY: number;
  zoom: number;
}

export interface ScenarioSessionCharacter {
  id: string;
  displayOrder: number;
  name: string | null;
  playerName: string | null;
  iacharaUrl: string | null;
  ho: string | null;
  memo: string | null;
  portraitStoragePath: string | null;
  portraitSignedUrl: string | null;
}

export interface ScenarioSession {
  id: string;
  displayOrder: number;
  name: string | null;
  role: "KP" | "PL";
  characters: ScenarioSessionCharacter[];
}

export interface ScenarioDetail extends ScenarioSummary {
  legacyRegistration: Record<string, unknown>;
  recommendedSkills: string | null;
  secondarySkills: string | null;
  notRecommended: string | null;
  lostRate: string | null;
  lostRateNote: string | null;
  hoType: string | null;
  battle: string | null;
  cautions: string | null;
  trailerText: string | null;
  handouts: ScenarioHandout[];
  episodes: ScenarioEpisode[];
  images: ScenarioImage[];
  sessions: ScenarioSession[];
}
