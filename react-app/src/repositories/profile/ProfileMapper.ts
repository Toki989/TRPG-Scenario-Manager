import type { Profile } from "../../domain/models/Profile";
import type { Database } from "../../lib/supabase/database.types";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export function mapProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    displayName: row.display_name,
    shareCode: row.share_code,
    avatarPath: row.avatar_path,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
