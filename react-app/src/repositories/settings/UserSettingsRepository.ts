import { supabase } from "../../lib/supabase/client";
import type { UserSettingsRow } from "../../lib/supabase/database.types";
import type { RepositoryResult } from "../common/types";

function unavailable(): RepositoryResult<never> {
  return {
    success: false,
    error: { type: "database", message: "Supabaseの環境変数が設定されていません。" },
  };
}

export class UserSettingsRepository {
  async get(userId: string): Promise<RepositoryResult<UserSettingsRow | null>> {
    if (!supabase) return unavailable();
    const { data, error } = await supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error)
      return { success: false, error: { type: "database", message: error.message, cause: error } };
    return { success: true, data };
  }

  async upsert(
    userId: string,
    settings: Omit<UserSettingsRow, "user_id" | "created_at" | "updated_at">,
  ): Promise<RepositoryResult<UserSettingsRow>> {
    if (!supabase) return unavailable();
    const { data, error } = await supabase
      .from("user_settings")
      .upsert({ user_id: userId, ...settings }, { onConflict: "user_id" })
      .select("*")
      .single();
    if (error)
      return { success: false, error: { type: "database", message: error.message, cause: error } };
    return { success: true, data };
  }
}

export const userSettingsRepository = new UserSettingsRepository();
