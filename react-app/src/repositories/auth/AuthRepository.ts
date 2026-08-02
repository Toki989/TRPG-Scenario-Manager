import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase/client";
import type { RepositoryResult } from "../common/types";
import type { AuthUser } from "../../domain/models/AuthUser";

function toAuthUser(user: User): AuthUser {
  const metadata = user.user_metadata;
  return {
    id: user.id,
    email: user.email ?? null,
    displayName: typeof metadata.display_name === "string" ? metadata.display_name : null,
    avatarUrl: typeof metadata.avatar_url === "string" ? metadata.avatar_url : null,
  };
}

function missingClient(): RepositoryResult<never> {
  return {
    success: false,
    error: { type: "auth", message: "Supabaseの環境変数が設定されていません。" },
  };
}

function authError(message: string): RepositoryResult<never> {
  return { success: false, error: { type: "auth", message } };
}

export class AuthRepository {
  async signInWithGoogle(): Promise<RepositoryResult<null>> {
    if (!supabase) return missingClient();
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google" });
    return error ? authError(error.message) : { success: true, data: null };
  }

  async signOut(): Promise<RepositoryResult<null>> {
    if (!supabase) return missingClient();
    const { error } = await supabase.auth.signOut();
    return error ? authError(error.message) : { success: true, data: null };
  }

  async getSession(): Promise<RepositoryResult<Session | null>> {
    if (!supabase) return missingClient();
    const { data, error } = await supabase.auth.getSession();
    return error ? authError(error.message) : { success: true, data: data.session };
  }

  onAuthStateChange(callback: (user: AuthUser | null) => void): () => void {
    if (!supabase) return () => undefined;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      callback(session?.user ? toAuthUser(session.user) : null);
    });
    return () => data.subscription.unsubscribe();
  }
}

export const authRepository = new AuthRepository();
