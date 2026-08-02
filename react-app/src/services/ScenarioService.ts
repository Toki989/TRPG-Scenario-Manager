import type { ScenarioCard } from "../domain/dto/ScenarioCard";
import type { ScenarioDetailDto } from "../domain/dto/ScenarioDetailDto";
import type { ApiResult } from "../domain/errors/ApiResult";
import { scenarioRepository } from "../repositories/scenario/ScenarioRepository";
import type {
  CreateScenarioCommand,
  ScenarioAggregateInput,
} from "../domain/commands/CreateScenarioCommand";
import type { UpdateScenarioCommand } from "../domain/commands/UpdateScenarioCommand";
import { scenarioShareRepository } from "../repositories/scenario/ScenarioShareRepository";
import type { ScenarioShareDto } from "../domain/dto/ScenarioShareDto";
import type { ScenarioShare } from "../domain/models/ScenarioShare";
import type { RepositoryError } from "../repositories/common/RepositoryError";
import { scenarioImageService } from "./ScenarioImageService";

function toScenarioShareDto(share: ScenarioShare): ScenarioShareDto {
  return {
    id: share.id,
    sharedUserId: share.sharedUserId,
    displayName: share.displayName,
    createdAt: share.createdAt,
  };
}

function shareError<T>(error: RepositoryError): ApiResult<T> {
  const cause = error.cause as { code?: string } | undefined;
  if (cause?.code === "23505") {
    return {
      success: false,
      error: { code: "DUPLICATE_SHARE", message: "このユーザーにはすでに共有済みです。" },
    };
  }
  if (cause?.code === "23503") {
    return {
      success: false,
      error: { code: "NOT_FOUND", message: "共有対象が見つかりません。" },
    };
  }
  if (cause?.code === "42501") {
    return {
      success: false,
      error: { code: "FORBIDDEN", message: "この共有操作を実行する権限がありません。" },
    };
  }
  return { success: false, error: { code: "DATABASE_ERROR", message: error.message } };
}

export class ScenarioService {
  async saveScenarioAggregate(input: ScenarioAggregateInput): Promise<ApiResult<string>> {
    if (!input.scenario.ownerId || !input.scenarioId) {
      return { success: false, error: { code: "UNAUTHORIZED", message: "ログインが必要です。" } };
    }
    const validation = validateCreate(input.scenario);
    if (validation) {
      return { success: false, error: { code: "VALIDATION_ERROR", message: validation } };
    }
    const result = await scenarioRepository.saveScenarioAggregate(input);
    return result.success
      ? result
      : { success: false, error: { code: "DATABASE_ERROR", message: result.error.message } };
  }

  async createScenario(command: CreateScenarioCommand): Promise<ApiResult<string>> {
    if (!command.ownerId)
      return { success: false, error: { code: "UNAUTHORIZED", message: "ログインが必要です。" } };
    const validation = validateCreate(command);
    if (validation)
      return { success: false, error: { code: "VALIDATION_ERROR", message: validation } };

    const created = await scenarioRepository.createScenario(command);
    if (!created.success)
      return { success: false, error: { code: "DATABASE_ERROR", message: created.error.message } };
    const userData = await scenarioRepository.createUserScenarioData(created.data);
    if (!userData.success) {
      // Compensation (Saga): createUserScenarioData失敗時は、作成済みシナリオを逆順でロールバックする。
      await scenarioRepository.deleteScenario(created.data);
      return { success: false, error: { code: "DATABASE_ERROR", message: userData.error.message } };
    }
    return { success: true, data: created.data };
  }

  async updateScenario(
    scenarioId: string,
    command: UpdateScenarioCommand,
  ): Promise<ApiResult<null>> {
    if (!scenarioId)
      return {
        success: false,
        error: { code: "VALIDATION_ERROR", message: "シナリオIDが必要です。" },
      };
    const result = await scenarioRepository.updateScenario(scenarioId, command);
    return result.success
      ? result
      : { success: false, error: { code: "DATABASE_ERROR", message: result.error.message } };
  }

  async deleteScenario(scenarioId: string): Promise<ApiResult<null>> {
    if (!scenarioId)
      return {
        success: false,
        error: { code: "VALIDATION_ERROR", message: "シナリオIDが必要です。" },
      };
    const result = await scenarioRepository.deleteScenario(scenarioId);
    return result.success
      ? result
      : { success: false, error: { code: "DATABASE_ERROR", message: result.error.message } };
  }

  async updateFavorite(
    userId: string,
    scenarioId: string,
    favorite: boolean,
  ): Promise<ApiResult<null>> {
    if (!userId)
      return { success: false, error: { code: "UNAUTHORIZED", message: "ログインが必要です。" } };
    const result = await scenarioRepository.updateFavorite(userId, scenarioId, favorite);
    return result.success
      ? result
      : { success: false, error: { code: "DATABASE_ERROR", message: result.error.message } };
  }

  async updateUserScenarioData(
    userId: string,
    scenarioId: string,
    data: {
      kpCompleted: boolean;
      playCompleted: boolean;
      purchaseUrl: string;
      memo: string;
    },
  ): Promise<ApiResult<null>> {
    if (!userId)
      return { success: false, error: { code: "UNAUTHORIZED", message: "ログインが必要です。" } };
    if (!scenarioId)
      return {
        success: false,
        error: { code: "VALIDATION_ERROR", message: "シナリオIDが必要です。" },
      };
    const result = await scenarioRepository.updateUserScenarioData(userId, scenarioId, {
      kpStatus: data.kpCompleted ? "completed" : "not_started",
      playStatus: data.playCompleted ? "completed" : "not_started",
      purchaseUrl: data.purchaseUrl,
      memo: data.memo,
    });
    return result.success
      ? result
      : { success: false, error: { code: "DATABASE_ERROR", message: result.error.message } };
  }

  async replaceScenarioEpisodes(
    scenarioId: string,
    episodes: {
      title: string;
      timeType: "fixed" | "range" | "free";
      timeFixed: number | null;
      timeMin: number | null;
      timeMax: number | null;
      timeText: string | null;
      summary: string | null;
      status: "not_started" | "completed";
      playDate: string | null;
    }[],
  ): Promise<ApiResult<null>> {
    if (!scenarioId)
      return {
        success: false,
        error: { code: "VALIDATION_ERROR", message: "シナリオIDが必要です。" },
      };
    const result = await scenarioRepository.replaceScenarioEpisodes(
      scenarioId,
      episodes.map((episode, index) => ({
        scenario_id: scenarioId,
        episode_number: index + 1,
        title: episode.title.trim() || null,
        time_type: episode.timeType,
        time_fixed: episode.timeType === "fixed" ? episode.timeFixed : null,
        time_min: episode.timeType === "range" ? episode.timeMin : null,
        time_max: episode.timeType === "range" ? episode.timeMax : null,
        time_text: episode.timeType === "free" ? episode.timeText?.trim() || null : null,
        summary: episode.summary,
        status: episode.status,
        play_date: episode.playDate,
      })),
    );
    return result.success
      ? result
      : { success: false, error: { code: "DATABASE_ERROR", message: result.error.message } };
  }

  async replaceScenarioHandouts(
    scenarioId: string,
    handouts: { label: string; content: string }[],
  ): Promise<ApiResult<null>> {
    if (!scenarioId)
      return {
        success: false,
        error: { code: "VALIDATION_ERROR", message: "シナリオIDが必要です。" },
      };

    const normalized = handouts
      .map((handout) => ({
        label: handout.label.trim() || null,
        content: handout.content.trim(),
      }))
      .filter((handout) => handout.content);

    const result = await scenarioRepository.replaceScenarioHandouts(
      scenarioId,
      normalized.map((handout, index) => ({
        scenario_id: scenarioId,
        display_order: index + 1,
        label: handout.label,
        content: handout.content,
      })),
    );
    return result.success
      ? result
      : { success: false, error: { code: "DATABASE_ERROR", message: result.error.message } };
  }

  async replaceScenarioSessions(
    scenarioId: string,
    sessions: {
      name: string;
      role: "KP" | "PL";
      characters: {
        name: string;
        playerName: string;
        iacharaUrl: string;
        ho: string;
        memo: string;
        portraitStoragePath: string | null;
      }[];
    }[],
  ): Promise<ApiResult<null>> {
    if (!scenarioId)
      return {
        success: false,
        error: { code: "VALIDATION_ERROR", message: "シナリオIDが必要です。" },
      };
    const normalized = sessions
      .map((session) => ({
        name: session.name.trim() || null,
        role: session.role,
        characters: session.characters
          .map((character) => ({
            name: character.name.trim() || null,
            playerName: character.playerName.trim() || null,
            iacharaUrl: character.iacharaUrl.trim() || null,
            ho: character.ho.trim() || null,
            memo: character.memo.trim() || null,
            portraitStoragePath: character.portraitStoragePath,
          }))
          .filter(
            (character) =>
              character.name ||
              character.playerName ||
              character.iacharaUrl ||
              character.ho ||
              character.memo ||
              character.portraitStoragePath,
          ),
      }))
      .filter((session) => session.name || session.characters.length);
    const result = await scenarioRepository.replaceScenarioSessions(scenarioId, normalized);
    return result.success
      ? result
      : { success: false, error: { code: "DATABASE_ERROR", message: result.error.message } };
  }

  async addShare(scenarioId: string, sharedUserId: string): Promise<ApiResult<null>> {
    if (!scenarioId || !sharedUserId) {
      return {
        success: false,
        error: { code: "VALIDATION_ERROR", message: "シナリオと共有先が必要です。" },
      };
    }
    const result = await scenarioShareRepository.createShare(scenarioId, sharedUserId);
    return result.success ? result : shareError(result.error);
  }

  async getShares(scenarioId: string): Promise<ApiResult<ScenarioShareDto[]>> {
    if (!scenarioId) {
      return {
        success: false,
        error: { code: "VALIDATION_ERROR", message: "シナリオIDが必要です。" },
      };
    }
    const result = await scenarioShareRepository.getShares(scenarioId);
    return result.success
      ? { success: true, data: result.data.map(toScenarioShareDto) }
      : shareError(result.error);
  }

  async removeShare(scenarioId: string, sharedUserId: string): Promise<ApiResult<null>> {
    if (!scenarioId || !sharedUserId) {
      return {
        success: false,
        error: { code: "VALIDATION_ERROR", message: "シナリオと共有先が必要です。" },
      };
    }
    const result = await scenarioShareRepository.deleteShare(scenarioId, sharedUserId);
    return result.success ? result : shareError(result.error);
  }

  async getScenarioDetail(
    userId: string,
    scenarioId: string,
  ): Promise<ApiResult<ScenarioDetailDto>> {
    if (!userId)
      return { success: false, error: { code: "UNAUTHORIZED", message: "ログインが必要です。" } };
    const result = await scenarioRepository.getScenarioDetail(userId, scenarioId);
    if (!result.success)
      return { success: false, error: { code: "DATABASE_ERROR", message: result.error.message } };
    if (!result.data)
      return {
        success: false,
        error: { code: "SCENARIO_NOT_FOUND", message: "シナリオが見つかりません。" },
      };
    return { success: true, data: result.data };
  }

  async getScenarioList(userId: string): Promise<ApiResult<ScenarioCard[]>> {
    if (!userId)
      return { success: false, error: { code: "UNAUTHORIZED", message: "ログインが必要です。" } };
    const result = await scenarioRepository.getScenarioList(userId);
    if (!result.success)
      return { success: false, error: { code: "DATABASE_ERROR", message: result.error.message } };
    const cards = await Promise.all(
      result.data.map(async (scenario) => {
        const thumbnailUrl = scenario.thumbnailStoragePath
          ? await scenarioImageService.getSignedUrl(scenario.thumbnailStoragePath)
          : null;
        return {
          id: scenario.id,
          title: scenario.title,
          system: scenario.system,
          scenarioType: scenario.scenarioType,
          author: scenario.author,
          stage: scenario.stage,
          recommendedSkills: scenario.recommendedSkills,
          hoType: scenario.hoType,
          playerCount: scenario.playerCount,
          playTime: scenario.playTime,
          tags: scenario.tags,
          playerCountType: scenario.playerCountType,
          playerCountFixed: scenario.playerCountFixed,
          playerCountMin: scenario.playerCountMin,
          playerCountMax: scenario.playerCountMax,
          playTimeType: scenario.playTimeType,
          playTimeFixed: scenario.playTimeFixed,
          playTimeMin: scenario.playTimeMin,
          playTimeMax: scenario.playTimeMax,
          lostRate: scenario.lostRate,
          battle: scenario.battle,
          thumbnailUrl: thumbnailUrl?.success ? thumbnailUrl.data : null,
          favorite: scenario.favorite,
          kpStatus: scenario.kpStatus,
          playStatus: scenario.playStatus,
          createdAt: scenario.createdAt,
          updatedAt: scenario.updatedAt,
        };
      }),
    );
    return {
      success: true,
      data: cards,
    };
  }
}

export const scenarioService = new ScenarioService();

function validateCreate(command: CreateScenarioCommand): string | null {
  if (!command.title.trim()) return "タイトルを入力してください。";
  if (command.playerCount.type === "fixed" && command.playerCount.value !== null) {
    if (!Number.isInteger(command.playerCount.value) || command.playerCount.value < 1)
      return "人数は1以上の整数で入力してください。";
  }
  if (command.playerCount.type === "range") {
    const { min, max } = command.playerCount;
    if ((min === null) !== (max === null)) return "人数を両方入力してください。";
    if (min !== null && (!Number.isInteger(min) || min < 1))
      return "人数は1以上の整数で入力してください。";
    if (max !== null && (!Number.isInteger(max) || max < 1))
      return "人数は1以上の整数で入力してください。";
    if (min !== null && max !== null && min > max) return "最小人数は最大人数以下にしてください。";
  }
  if (command.playTime.type === "fixed" && command.playTime.value !== null) {
    if (!Number.isInteger(command.playTime.value) || command.playTime.value < 0)
      return "プレイ時間は0以上の整数で入力してください。";
  }
  if (command.playTime.type === "range") {
    const { min, max } = command.playTime;
    if ((min === null) !== (max === null)) return "プレイ時間を両方入力してください。";
    if (min !== null && (!Number.isInteger(min) || min < 0))
      return "プレイ時間は0以上の整数で入力してください。";
    if (max !== null && (!Number.isInteger(max) || max < 0))
      return "プレイ時間は0以上の整数で入力してください。";
    if (min !== null && max !== null && min > max) return "最短時間は最長時間以下にしてください。";
  }
  return null;
}
