import type { ApiResult } from "../domain/errors/ApiResult";
import { DRAFT_DATA_VERSION } from "../domain/backup/BackupPayload";
import type { ScenarioDraft } from "../domain/models/ScenarioDraft";
import { scenarioDraftRepository } from "../repositories/draft/ScenarioDraftRepository";

function toDraft(row: {
  id: string;
  owner_id: string;
  scenario_id: string | null;
  title: string;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}): ScenarioDraft {
  return {
    id: row.id,
    ownerId: row.owner_id,
    scenarioId: row.scenario_id,
    title: row.title,
    payload: row.payload,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeDraftPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return { ...payload, schemaVersion: DRAFT_DATA_VERSION };
}

export class ScenarioDraftService {
  async list(userId: string): Promise<ApiResult<ScenarioDraft[]>> {
    const result = await scenarioDraftRepository.list(userId);
    return result.success
      ? { success: true, data: result.data.map(toDraft) }
      : { success: false, error: { code: "DATABASE_ERROR", message: result.error.message } };
  }

  async get(userId: string, draftId: string): Promise<ApiResult<ScenarioDraft | null>> {
    const result = await scenarioDraftRepository.get(userId, draftId);
    return result.success
      ? { success: true, data: result.data ? toDraft(result.data) : null }
      : { success: false, error: { code: "DATABASE_ERROR", message: result.error.message } };
  }

  async save(
    userId: string,
    draft: {
      id?: string;
      scenarioId: string | null;
      title: string;
      payload: Record<string, unknown>;
    },
  ): Promise<ApiResult<ScenarioDraft>> {
    if (!userId)
      return { success: false, error: { code: "UNAUTHORIZED", message: "ログインが必要です。" } };
    const result = await scenarioDraftRepository.save(userId, {
      id: draft.id ?? crypto.randomUUID(),
      scenario_id: draft.scenarioId,
      title: draft.title.trim(),
      payload: normalizeDraftPayload(draft.payload),
    });
    return result.success
      ? { success: true, data: toDraft(result.data) }
      : { success: false, error: { code: "DATABASE_ERROR", message: result.error.message } };
  }

  async remove(userId: string, draftId: string): Promise<ApiResult<null>> {
    const result = await scenarioDraftRepository.remove(userId, draftId);
    return result.success
      ? result
      : { success: false, error: { code: "DATABASE_ERROR", message: result.error.message } };
  }
}

export const scenarioDraftService = new ScenarioDraftService();
