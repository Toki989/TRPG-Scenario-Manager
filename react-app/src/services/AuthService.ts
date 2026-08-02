import type { AuthUser } from "../domain/models/AuthUser";
import type { ApiResult } from "../domain/errors/ApiResult";
import { authRepository } from "../repositories/auth/AuthRepository";
import { profileRepository } from "../repositories/profile/ProfileRepository";

function errorResult<T>(message: string): ApiResult<T> {
  return { success: false, error: { code: "UNKNOWN", message } };
}

export class AuthService {
  async loginWithGoogle(): Promise<ApiResult<null>> {
    const result = await authRepository.signInWithGoogle();
    return result.success ? result : errorResult(result.error.message);
  }

  async logout(): Promise<ApiResult<null>> {
    const result = await authRepository.signOut();
    return result.success ? result : errorResult(result.error.message);
  }

  async getCurrentUser(): Promise<ApiResult<AuthUser | null>> {
    const result = await authRepository.getSession();
    if (!result.success) return errorResult(result.error.message);
    const user = result.data?.user;
    if (!user) return { success: true, data: null };

    const profile = await profileRepository.getMyProfile(user.id);
    if (!profile.success) return errorResult(profile.error.message);
    if (!profile.data) {
      const displayName =
        typeof user.user_metadata.display_name === "string"
          ? user.user_metadata.display_name
          : "ユーザー";
      const created = await profileRepository.createProfile(
        user.id,
        displayName,
        createShareCode(),
      );
      if (!created.success) return errorResult(created.error.message);
    }

    return {
      success: true,
      data: {
        id: user.id,
        email: user.email ?? null,
        displayName:
          typeof user.user_metadata.display_name === "string"
            ? user.user_metadata.display_name
            : null,
        avatarUrl:
          typeof user.user_metadata.avatar_url === "string" ? user.user_metadata.avatar_url : null,
      },
    };
  }
}

function createShareCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const values = crypto.getRandomValues(new Uint8Array(6));
  return `TRPG-${Array.from(values, (value) => alphabet[value % alphabet.length]).join("")}`;
}

export const authService = new AuthService();
