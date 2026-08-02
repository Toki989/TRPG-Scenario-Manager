import type { ApiResult } from "../domain/errors/ApiResult";
import {
  BACKUP_APP_NAME,
  BACKUP_DATA_VERSION,
  type BackupPayload,
  type BackupRestoreProgress,
  type LegacyImageUpload,
  type ScenarioBackupRecord,
} from "../domain/backup/BackupPayload";
import type {
  ScenarioEpisodeRow,
  ScenarioHandoutRow,
  ScenarioRow,
  ScenarioSessionCharacterRow,
  ScenarioSessionRow,
  UserScenarioDataRow,
} from "../lib/supabase/database.types";
import { scenarioRepository } from "../repositories/scenario/ScenarioRepository";
import { scenarioImageService } from "./ScenarioImageService";

function databaseError<T>(message: string): ApiResult<T> {
  return { success: false, error: { code: "DATABASE_ERROR", message } };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBackupRecord(value: unknown): value is ScenarioBackupRecord {
  if (!isObject(value) || !isObject(value.scenario)) return false;
  return (
    typeof value.scenario.id === "string" &&
    typeof value.scenario.owner_id === "string" &&
    Array.isArray(value.handouts) &&
    Array.isArray(value.episodes) &&
    Array.isArray(value.images) &&
    Array.isArray(value.sessions) &&
    Array.isArray(value.sessionCharacters) &&
    (value.userData === null || isObject(value.userData))
  );
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nullableText(value: unknown): string | null {
  const result = text(value).trim();
  return result || null;
}

function legacyLostRate(value: unknown): ScenarioRow["lost_rate"] {
  const values: Record<string, ScenarioRow["lost_rate"]> = {
    なし: "none",
    低: "low",
    中: "medium",
    高: "high",
    極高: "very_high",
    非常に高い: "very_high",
    不明: "unknown",
  };
  return values[text(value)] ?? null;
}

function legacyHoType(value: unknown): ScenarioRow["ho_type"] {
  const source = text(value);
  if (source.includes("秘匿")) return "secret";
  if (source.includes("共通") && source.includes("個別")) return "common_individual";
  if (source.includes("共通")) return "common";
  if (source.includes("個別")) return "individual";
  if (source.includes("HO") || source.includes("秘匿")) return "special";
  return "none";
}

function legacyBattle(value: unknown): ScenarioRow["battle"] {
  const source = text(value);
  return source === "あり" ? "yes" : source === "なし" ? "no" : source ? "conditional" : null;
}

function legacyToPayload(value: Record<string, unknown>, userId: string): ApiResult<BackupPayload> {
  if (!Array.isArray(value.scenarios))
    return {
      success: false,
      error: { code: "BACKUP_INVALID", message: "旧バックアップのシナリオデータが壊れています。" },
    };
  const scenarios: ScenarioBackupRecord[] = [];
  const legacyImageUploads: LegacyImageUpload[] = [];
  const now = new Date().toISOString();
  for (const raw of value.scenarios) {
    if (!isObject(raw))
      return {
        success: false,
        error: { code: "BACKUP_INVALID", message: "旧バックアップの形式が正しくありません。" },
      };
    const basic = isObject(raw.basic) ? raw.basic : {};
    const scenario = isObject(raw.scenario) ? raw.scenario : {};
    const trailer = isObject(raw.trailer) ? raw.trailer : {};
    const personal = isObject(raw.personal) ? raw.personal : {};
    const campaign = isObject(raw.campaign) ? raw.campaign : {};
    const id = crypto.randomUUID();
    const createdAt = text(raw.createdAt) || now;
    const updatedAt = text(raw.updatedAt) || createdAt;
    const requestedCountType =
      text(basic.countType) === "range" || text(basic.countType) === "free"
        ? (text(basic.countType) as "range" | "free")
        : "fixed";
    const parsedMinCount = Number.parseInt(text(basic.minCount), 10);
    const parsedMaxCount = Number.parseInt(text(basic.maxCount), 10);
    const countType: ScenarioRow["player_count_type"] =
      requestedCountType === "range" &&
      Number.isFinite(parsedMinCount) &&
      parsedMinCount > 0 &&
      Number.isFinite(parsedMaxCount) &&
      parsedMaxCount >= parsedMinCount
        ? "range"
        : requestedCountType === "range"
          ? "free"
          : requestedCountType;
    const legacyCountText =
      countType === "free" && requestedCountType === "range"
        ? `${text(basic.minCount)}〜${text(basic.maxCount)}`
        : (nullableText(basic.freeCount) ?? "未設定");
    const timeType: ScenarioRow["play_time_type"] =
      text(basic.timeType) === "range" || text(basic.timeType) === "free"
        ? (text(basic.timeType) as "range" | "free")
        : "fixed";
    const legacyTimeText =
      timeType === "fixed"
        ? text(basic.fixedTime) || text(basic.fixedTimeValue)
        : timeType === "range"
          ? `${text(basic.minTime)}〜${text(basic.maxTime)}`
          : text(basic.freeTime);
    const row: ScenarioRow = {
      id,
      owner_id: userId,
      title: text(basic.title).trim() || "無題のシナリオ",
      system: text(basic.system).trim() || "その他",
      scenario_type:
        basic.scenarioType === "campaign"
          ? "campaign"
          : basic.scenarioType === "kpLess"
            ? "kp_less"
            : "normal",
      author: nullableText(basic.author),
      stage: nullableText(basic.stage),
      title_reading: nullableText(basic.titleReading),
      author_reading: nullableText(basic.authorReading),
      recommended_skills: nullableText(scenario.recommendedSkills),
      secondary_skills: nullableText(scenario.secondarySkills),
      not_recommended: nullableText(scenario.notRecommended),
      lost_rate: legacyLostRate(scenario.lostRate),
      lost_rate_note: nullableText(scenario.lostRateNote),
      ho_type: legacyHoType(scenario.hoType),
      player_count_type: countType,
      player_count_fixed:
        countType === "fixed" ? Number.parseInt(text(basic.fixedCount), 10) || null : null,
      player_count_min: countType === "range" ? parsedMinCount : null,
      player_count_max: countType === "range" ? parsedMaxCount : null,
      player_count_text: countType === "free" ? legacyCountText : null,
      // Keep the old app's literal time notation instead of converting hours to minutes.
      play_time_type: "free",
      play_time_fixed: null,
      play_time_min: null,
      play_time_max: null,
      play_time_text: nullableText(legacyTimeText) ?? "未設定",
      scenario_tags: Array.isArray(scenario.trends)
        ? scenario.trends.filter((item): item is string => typeof item === "string")
        : [],
      battle: legacyBattle(scenario.combat),
      cautions: nullableText(scenario.notes),
      trailer_text: nullableText(trailer.text),
      created_at: createdAt,
      updated_at: updatedAt,
      legacy_registration: (() => {
        const copy = { basic, scenario, campaign, personal, trailer: { ...trailer } };
        delete (copy.trailer as Record<string, unknown>).images;
        return copy;
      })(),
    };
    const handoutParts = text(scenario.hoContent)
      .split("\u001e")
      .map((item) => item.trim())
      .filter(Boolean);
    const handouts: ScenarioHandoutRow[] = handoutParts.map((content, index) => ({
      id: crypto.randomUUID(),
      scenario_id: id,
      display_order: index + 1,
      label: handoutParts.length === 1 ? "Ho" : `Ho ${index + 1}`,
      content,
      created_at: createdAt,
      updated_at: updatedAt,
    }));
    const episodes: ScenarioEpisodeRow[] = (
      Array.isArray(campaign.episodes) ? campaign.episodes : []
    )
      .filter(isObject)
      .map((episode, index) => ({
        id: crypto.randomUUID(),
        scenario_id: id,
        episode_number: index + 1,
        title: nullableText(episode.title),
        time_type: "free",
        time_fixed: null,
        time_min: null,
        time_max: null,
        time_text: nullableText(episode.time) ?? "未設定",
        summary: nullableText(episode.summary),
        status: episode.status === "completed" ? "completed" : "not_started",
        play_date: nullableText(episode.playDate),
        created_at: createdAt,
        updated_at: updatedAt,
        legacy_time_text: nullableText(episode.time),
      }));
    const userData: UserScenarioDataRow = {
      id: crypto.randomUUID(),
      user_id: userId,
      scenario_id: id,
      favorite: raw.favorite === true,
      kp_status: personal.isKp === true ? "completed" : "not_started",
      play_status: personal.isPl === true ? "completed" : "not_started",
      purchase_url: nullableText(personal.url),
      memo: nullableText(personal.memo),
      kp_memo: isObject(personal.kp) ? nullableText(personal.kp.memo) : null,
      pl_memo: isObject(personal.pl) ? nullableText(personal.pl.memo) : null,
    };
    const sessions: ScenarioSessionRow[] = [];
    const sessionCharacters: ScenarioSessionCharacterRow[] = [];
    const sourceSessions = Array.isArray(personal.sessions)
      ? personal.sessions.filter(isObject)
      : isObject(personal.pl) && Array.isArray(personal.pl.characters)
        ? [{ name: "1陣", role: "PL", characters: personal.pl.characters }]
        : [];
    sourceSessions.forEach((sourceSession, sessionIndex) => {
      const sessionId = crypto.randomUUID();
      sessions.push({
        id: sessionId,
        scenario_id: id,
        display_order: sessionIndex + 1,
        name: nullableText(sourceSession.name),
        role: sourceSession.role === "KP" ? "KP" : "PL",
        created_at: createdAt,
        updated_at: updatedAt,
      });
      if (Array.isArray(sourceSession.characters))
        sourceSession.characters.filter(isObject).forEach((character, characterIndex) =>
          sessionCharacters.push({
            id: crypto.randomUUID(),
            session_id: sessionId,
            display_order: characterIndex + 1,
            name: nullableText(character.name),
            player_name: nullableText(character.playerName),
            iachara_url: nullableText(character.iacharaUrl || character.url),
            ho: nullableText(character.ho),
            memo: nullableText(character.memo),
            portrait_storage_path: null,
            created_at: createdAt,
            updated_at: updatedAt,
          }),
        );
    });
    if (Array.isArray(trailer.images)) {
      for (const [index, image] of trailer.images.entries()) {
        if (!isObject(image) || !text(image.src).startsWith("data:image/")) {
          return {
            success: false,
            error: {
              code: "BACKUP_INVALID",
              message: `旧バックアップの画像${index + 1}を復元できるBase64画像として解釈できません。`,
            },
          };
        }
        const position = isObject(image.position) ? image.position : {};
        legacyImageUploads.push({
          scenarioId: id,
          displayOrder: index + 1,
          dataUrl: text(image.src),
          positionX: typeof position.x === "number" ? position.x : 50,
          positionY: typeof position.y === "number" ? position.y : 50,
          zoom: typeof image.zoom === "number" ? image.zoom : 1,
        });
      }
    }
    scenarios.push({
      scenario: row,
      handouts,
      episodes,
      images: [],
      sessions,
      sessionCharacters,
      userData,
    });
  }
  return {
    success: true,
    data: {
      appName: BACKUP_APP_NAME,
      dataVersion: BACKUP_DATA_VERSION,
      createdAt: now,
      ownerId: userId,
      scenarios,
      legacyImageUploads,
    },
  };
}

function dataUrlToFile(dataUrl: string, index: number): File | null {
  const match = dataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!match) return null;
  const binary = atob(match[2]);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new File([bytes], `legacy-image-${index + 1}`, { type: match[1] });
}

export class BackupService {
  async createBackup(userId: string): Promise<ApiResult<BackupPayload>> {
    if (!userId)
      return { success: false, error: { code: "UNAUTHORIZED", message: "ログインが必要です。" } };
    const result = await scenarioRepository.getOwnedScenarioBackups(userId);
    return result.success
      ? {
          success: true,
          data: {
            appName: BACKUP_APP_NAME,
            dataVersion: BACKUP_DATA_VERSION,
            createdAt: new Date().toISOString(),
            ownerId: userId,
            scenarios: result.data,
          },
        }
      : databaseError(result.error.message);
  }

  validateBackup(value: unknown, userId: string): ApiResult<BackupPayload> {
    if (!isObject(value))
      return {
        success: false,
        error: { code: "BACKUP_INVALID", message: "JSON形式が正しくありません。" },
      };
    if (value.appName !== BACKUP_APP_NAME)
      return {
        success: false,
        error: { code: "BACKUP_INVALID", message: "別のアプリのバックアップです。" },
      };
    if (value.dataVersion === 2) return legacyToPayload(value, userId);
    if (value.dataVersion !== BACKUP_DATA_VERSION)
      return {
        success: false,
        error: { code: "BACKUP_INVALID", message: "対応していないバックアップ形式です。" },
      };
    if (value.ownerId !== userId)
      return {
        success: false,
        error: { code: "FORBIDDEN", message: "このバックアップの所有者ではありません。" },
      };
    if (!Array.isArray(value.scenarios) || !value.scenarios.every(isBackupRecord))
      return {
        success: false,
        error: { code: "BACKUP_INVALID", message: "シナリオデータが壊れています。" },
      };
    const ids = value.scenarios.map((item) => item.scenario.id);
    if (
      new Set(ids).size !== ids.length ||
      value.scenarios.some((item) => item.scenario.owner_id !== userId)
    )
      return {
        success: false,
        error: { code: "BACKUP_INVALID", message: "所有者またはID情報が正しくありません。" },
      };
    return {
      success: true,
      data: value as unknown as BackupPayload,
    };
  }

  async restoreBackup(
    payload: BackupPayload,
    onProgress?: (progress: BackupRestoreProgress) => void,
  ): Promise<ApiResult<null>> {
    const current = await scenarioRepository.getOwnedScenarioBackups(payload.ownerId);
    if (!current.success)
      return databaseError(`復元前の退避に失敗しました。${current.error.message}`);
    const result = await scenarioRepository.replaceOwnedScenarioBackups(
      payload.ownerId,
      payload.scenarios,
      onProgress,
    );
    if (!result.success) return databaseError(result.error.message);
    const imageUploads = payload.legacyImageUploads ?? [];
    const uploadedImages: { scenarioId: string; id: string; storagePath: string }[] = [];
    onProgress?.({
      step: 5,
      total: 6,
      label: imageUploads.length ? "旧バックアップの画像を復元中…" : "画像の復元を確認中…",
    });
    try {
      for (const [index, upload] of imageUploads.entries()) {
        const file = dataUrlToFile(upload.dataUrl, index);
        if (!file) throw new Error(`画像「${index + 1}」のBase64形式を解釈できませんでした。`);
        const imageResult = await scenarioImageService.upload(
          upload.scenarioId,
          file,
          upload.displayOrder,
          { x: upload.positionX, y: upload.positionY, zoom: upload.zoom },
        );
        if (!imageResult.success)
          throw new Error(
            `画像「${index + 1}」を復元できませんでした。${imageResult.error.message}`,
          );
        uploadedImages.push({ scenarioId: upload.scenarioId, ...imageResult.data });
      }
    } catch (error) {
      await Promise.all(
        uploadedImages.map((image) =>
          scenarioImageService.delete(image.scenarioId, image.id, image.storagePath),
        ),
      );
      const rollback = await scenarioRepository.replaceOwnedScenarioBackups(
        payload.ownerId,
        current.data,
      );
      const message = error instanceof Error ? error.message : "画像の復元に失敗しました。";
      return databaseError(
        `${message} 復元前のデータへ戻しました${rollback.success ? "。" : "が、退避データの復元にも失敗しました。"}`,
      );
    }
    onProgress?.({ step: 6, total: 6, label: "復元が完了しました" });
    return { success: true, data: null };
  }
}

export const backupService = new BackupService();
