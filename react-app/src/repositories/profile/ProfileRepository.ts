import { supabase } from "../../lib/supabase/client";
import type { Profile } from "../../domain/models/Profile";
import type { RepositoryResult } from "../common/types";
import { mapProfile } from "./ProfileMapper";

function unavailable(): RepositoryResult<never> {
  return {
    success: false,
    error: { type: "database", message: "Supabaseの環境変数が設定されていません。" },
  };
}

export class ProfileRepository {
  async findByShareCode(
    shareCode: string,
  ): Promise<RepositoryResult<{ id: string; displayName: string } | null>> {
    if (!supabase) return unavailable();
    const { data, error } = await supabase.rpc("find_profile_by_share_code", {
      p_share_code: shareCode.trim().toUpperCase(),
    });
    if (error)
      return { success: false, error: { type: "rpc", message: error.message, cause: error } };
    const row = data[0];
    return { success: true, data: row ? { id: row.id, displayName: row.display_name } : null };
  }

  async createProfile(
    userId: string,
    displayName: string,
    shareCode: string,
  ): Promise<RepositoryResult<Profile>> {
    if (!supabase) return unavailable();
    const { data, error } = await supabase
      .from("profiles")
      .insert({ id: userId, display_name: displayName.trim(), share_code: shareCode })
      .select("*")
      .single();
    if (error)
      return { success: false, error: { type: "database", message: error.message, cause: error } };
    return { success: true, data: mapProfile(data) };
  }

  async getMyProfile(userId: string): Promise<RepositoryResult<Profile | null>> {
    if (!supabase) return unavailable();
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (error)
      return { success: false, error: { type: "database", message: error.message, cause: error } };
    return { success: true, data: data ? mapProfile(data) : null };
  }

  async updateProfile(userId: string, displayName: string): Promise<RepositoryResult<Profile>> {
    if (!supabase) return unavailable();
    const { data, error } = await supabase
      .from("profiles")
      .update({ display_name: displayName.trim() })
      .eq("id", userId)
      .select("*")
      .single();
    if (error)
      return { success: false, error: { type: "database", message: error.message, cause: error } };
    return { success: true, data: mapProfile(data) };
  }

  async regenerateShareCode(userId: string, shareCode: string): Promise<RepositoryResult<Profile>> {
    if (!supabase) return unavailable();
    const { data, error } = await supabase
      .from("profiles")
      .update({ share_code: shareCode })
      .eq("id", userId)
      .select("*")
      .single();
    if (error)
      return { success: false, error: { type: "database", message: error.message, cause: error } };
    return { success: true, data: mapProfile(data) };
  }
}

export const profileRepository = new ProfileRepository();
