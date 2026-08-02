import type { CreateScenarioCommand } from "./CreateScenarioCommand";

export type UpdateScenarioCommand = Partial<
  Omit<CreateScenarioCommand, "ownerId" | "playerCount" | "playTime">
> & {
  playerCountType?: "fixed" | "range" | "free";
  playerCountFixed?: number | null;
  playerCountMin?: number | null;
  playerCountMax?: number | null;
  playerCountText?: string | null;
  playTimeType?: "fixed" | "range" | "free";
  playTimeFixed?: number | null;
  playTimeMin?: number | null;
  playTimeMax?: number | null;
  playTimeText?: string | null;
};
