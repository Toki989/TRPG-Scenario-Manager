import type { ScenarioType } from "../models/Scenario";

export interface CreateScenarioCommand {
  ownerId: string;
  title: string;
  titleReading?: string;
  system?: string;
  scenarioType: ScenarioType;
  author?: string;
  authorReading?: string;
  stage?: string;
  playerCount:
    | { type: "fixed"; value: number | null }
    | { type: "range"; min: number | null; max: number | null }
    | { type: "free"; text: string };
  playTime:
    | { type: "fixed"; value: number | null }
    | { type: "range"; min: number | null; max: number | null }
    | { type: "free"; text: string };
  recommendedSkills?: string;
  secondarySkills?: string;
  notRecommended?: string;
  lostRate?: "none" | "low" | "medium" | "high" | "very_high" | "unknown";
  lostRateNote?: string;
  hoType?: "none" | "common" | "individual" | "secret" | "common_individual" | "special";
  battle?: "yes" | "no" | "conditional";
  cautions?: string;
  trailerText?: string;
  scenarioTags?: string[];
  legacyRegistration?: Record<string, unknown> | null;
}

export interface ScenarioAggregateInput {
  scenarioId: string;
  scenario: CreateScenarioCommand;
  userData: {
    favorite?: boolean;
    kpCompleted: boolean;
    playCompleted: boolean;
    purchaseUrl?: string | null;
    memo?: string | null;
    kpMemo?: string | null;
    plMemo?: string | null;
  };
  handouts: { label: string; content: string }[];
  episodes: {
    title: string;
    timeType: "fixed" | "range" | "free";
    timeFixed: number | null;
    timeMin: number | null;
    timeMax: number | null;
    timeText: string | null;
    summary: string | null;
    status: "not_started" | "completed";
    playDate: string | null;
  }[];
  sessions: {
    name: string;
    role: "KP" | "PL";
    characters: {
      name: string;
      playerName: string;
      iacharaUrl: string;
      ho: string;
      memo: string;
      portraitStoragePath: string | null;
    }[];
  }[];
}
