import type { ProgressStatus, ScenarioType } from "../models/Scenario";

export interface ScenarioCard {
  id: string;
  title: string;
  system: string;
  scenarioType: ScenarioType;
  author: string | null;
  stage: string | null;
  recommendedSkills: string | null;
  hoType: string | null;
  playerCount: string;
  playTime: string;
  tags: string[];
  playerCountType: "fixed" | "range" | "free";
  playerCountFixed: number | null;
  playerCountMin: number | null;
  playerCountMax: number | null;
  playTimeType: "fixed" | "range" | "free";
  playTimeFixed: number | null;
  playTimeMin: number | null;
  playTimeMax: number | null;
  lostRate: string | null;
  battle: string | null;
  thumbnailUrl: string | null;
  favorite: boolean;
  kpStatus: ProgressStatus;
  playStatus: ProgressStatus;
  createdAt: Date;
  updatedAt: Date;
}
