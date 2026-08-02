import type { ProfileDto, PublicProfileDto } from "../domain/dto/ProfileDto";
import type { ApiResult } from "../domain/errors/ApiResult";
import type { Profile } from "../domain/models/Profile";
import { profileRepository } from "../repositories/profile/ProfileRepository";

function toDto(profile: Profile): ProfileDto {
  return {
    id: profile.id,
    displayName: profile.displayName,
    shareCode: profile.shareCode,
    avatarUrl: null,
  };
}

function databaseError<T>(message: string): ApiResult<T> {
  return { success: false, error: { code: "DATABASE_ERROR", message } };
}

function makeShareCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const values = crypto.getRandomValues(new Uint8Array(6));
  return `TRPG-${Array.from(values, (value) => alphabet[value % alphabet.length]).join("")}`;
}

export class ProfileService {
  async createInitialProfile(userId: string, displayName: string): Promise<ApiResult<ProfileDto>> {
    const result = await profileRepository.createProfile(
      userId,
      displayName.trim() || "ユーザー",
      makeShareCode(),
    );
    return result.success
      ? { success: true, data: toDto(result.data) }
      : databaseError(result.error.message);
  }

  async getMyProfile(userId: string): Promise<ApiResult<ProfileDto | null>> {
    const result = await profileRepository.getMyProfile(userId);
    return result.success
      ? { success: true, data: result.data ? toDto(result.data) : null }
      : databaseError(result.error.message);
  }

  async updateDisplayName(userId: string, displayName: string): Promise<ApiResult<ProfileDto>> {
    if (!displayName.trim()) {
      return {
        success: false,
        error: { code: "VALIDATION_ERROR", message: "表示名を入力してください。" },
      };
    }
    const result = await profileRepository.updateProfile(userId, displayName);
    return result.success
      ? { success: true, data: toDto(result.data) }
      : databaseError(result.error.message);
  }

  async findByShareCode(shareCode: string): Promise<ApiResult<PublicProfileDto | null>> {
    const normalized = shareCode.trim().toUpperCase();
    if (!/^TRPG-[A-HJ-NP-Z2-9]{6}$/.test(normalized)) {
      return {
        success: false,
        error: { code: "VALIDATION_ERROR", message: "共有コードの形式が正しくありません。" },
      };
    }
    const result = await profileRepository.findByShareCode(normalized);
    return result.success
      ? { success: true, data: result.data }
      : databaseError(result.error.message);
  }

  async regenerateShareCode(userId: string): Promise<ApiResult<ProfileDto>> {
    const result = await profileRepository.regenerateShareCode(userId, makeShareCode());
    return result.success
      ? { success: true, data: toDto(result.data) }
      : databaseError(result.error.message);
  }
}

export const profileService = new ProfileService();
