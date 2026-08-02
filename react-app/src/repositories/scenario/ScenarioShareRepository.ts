import { supabase } from "../../lib/supabase/client";
import type { ScenarioShare } from "../../domain/models/ScenarioShare";
import type { RepositoryResult } from "../common/types";

function unavailable(): RepositoryResult<never> {
  return {
    success: false,
    error: { type: "database", message: "Supabaseの環境変数が設定されていません。" },
  };
}

export class ScenarioShareRepository {
  async createShare(scenarioId: string, sharedUserId: string): Promise<RepositoryResult<null>> {
    if (!supabase) return unavailable();
    const { error } = await supabase.from("scenario_shares").insert({
      scenario_id: scenarioId,
      shared_user_id: sharedUserId,
      permission: "viewer",
    });
    if (error)
      return { success: false, error: { type: "database", message: error.message, cause: error } };
    return { success: true, data: null };
  }

  async getShares(scenarioId: string): Promise<RepositoryResult<ScenarioShare[]>> {
    if (!supabase) return unavailable();
    const { data, error } = await supabase.rpc("list_scenario_shares", {
      p_scenario_id: scenarioId,
    });
    if (error)
      return { success: false, error: { type: "rpc", message: error.message, cause: error } };
    return {
      success: true,
      data: data.map((row) => ({
        id: row.id,
        sharedUserId: row.shared_user_id,
        displayName: row.display_name,
        createdAt: row.created_at,
      })),
    };
  }

  async deleteShare(scenarioId: string, sharedUserId: string): Promise<RepositoryResult<null>> {
    if (!supabase) return unavailable();
    const { error } = await supabase
      .from("scenario_shares")
      .delete()
      .eq("scenario_id", scenarioId)
      .eq("shared_user_id", sharedUserId);
    if (error)
      return { success: false, error: { type: "database", message: error.message, cause: error } };
    return { success: true, data: null };
  }
}

export const scenarioShareRepository = new ScenarioShareRepository();
