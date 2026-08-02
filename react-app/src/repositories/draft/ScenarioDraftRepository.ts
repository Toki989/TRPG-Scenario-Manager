import { supabase } from "../../lib/supabase/client";
import type { ScenarioDraftRow } from "../../lib/supabase/database.types";
import type { RepositoryResult } from "../common/types";

function unavailable(): RepositoryResult<never> {
  return {
    success: false,
    error: { type: "database", message: "Supabaseの環境変数が設定されていません。" },
  };
}

export class ScenarioDraftRepository {
  async list(userId: string): Promise<RepositoryResult<ScenarioDraftRow[]>> {
    if (!supabase) return unavailable();
    const { data, error } = await supabase
      .from("scenario_drafts")
      .select("*")
      .eq("owner_id", userId)
      .order("updated_at", { ascending: false });
    if (error)
      return { success: false, error: { type: "database", message: error.message, cause: error } };
    return { success: true, data: data ?? [] };
  }

  async get(userId: string, draftId: string): Promise<RepositoryResult<ScenarioDraftRow | null>> {
    if (!supabase) return unavailable();
    const { data, error } = await supabase
      .from("scenario_drafts")
      .select("*")
      .eq("owner_id", userId)
      .eq("id", draftId)
      .maybeSingle();
    if (error)
      return { success: false, error: { type: "database", message: error.message, cause: error } };
    return { success: true, data };
  }

  async save(
    userId: string,
    draft: Pick<ScenarioDraftRow, "id" | "scenario_id" | "title" | "payload">,
  ): Promise<RepositoryResult<ScenarioDraftRow>> {
    if (!supabase) return unavailable();
    const { data, error } = await supabase
      .from("scenario_drafts")
      .upsert({ owner_id: userId, ...draft }, { onConflict: "id" })
      .select("*")
      .single();
    if (error)
      return { success: false, error: { type: "database", message: error.message, cause: error } };
    return { success: true, data };
  }

  async remove(userId: string, draftId: string): Promise<RepositoryResult<null>> {
    if (!supabase) return unavailable();
    const { error } = await supabase
      .from("scenario_drafts")
      .delete()
      .eq("owner_id", userId)
      .eq("id", draftId);
    if (error)
      return { success: false, error: { type: "database", message: error.message, cause: error } };
    return { success: true, data: null };
  }
}

export const scenarioDraftRepository = new ScenarioDraftRepository();
