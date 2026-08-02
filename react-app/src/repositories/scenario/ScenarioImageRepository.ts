import { supabase } from "../../lib/supabase/client";
import type { RepositoryResult } from "../common/types";

const BUCKET = "scenario-images";

function unavailable(): RepositoryResult<never> {
  return {
    success: false,
    error: { type: "storage", message: "Supabaseの環境変数が設定されていません。" },
  };
}

export class ScenarioImageRepository {
  async uploadObject(path: string, blob: Blob): Promise<RepositoryResult<null>> {
    if (!supabase) return unavailable();
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
      contentType: "image/webp",
      upsert: false,
    });
    return error
      ? { success: false, error: { type: "storage", message: error.message, cause: error } }
      : { success: true, data: null };
  }

  async removeObject(path: string): Promise<RepositoryResult<null>> {
    if (!supabase) return unavailable();
    const { error } = await supabase.storage.from(BUCKET).remove([path]);
    return error
      ? { success: false, error: { type: "storage", message: error.message, cause: error } }
      : { success: true, data: null };
  }

  async upload(
    scenarioId: string,
    path: string,
    blob: Blob,
    displayOrder: number,
    position = { x: 50, y: 50, zoom: 1 },
  ): Promise<RepositoryResult<{ id: string; storagePath: string }>> {
    if (!supabase) return unavailable();
    const storageResult = await supabase.storage.from(BUCKET).upload(path, blob, {
      contentType: "image/webp",
      upsert: false,
    });
    if (storageResult.error) {
      return {
        success: false,
        error: {
          type: "storage",
          message: storageResult.error.message,
          cause: storageResult.error,
        },
      };
    }
    const { data, error } = await supabase
      .from("scenario_images")
      .insert({
        scenario_id: scenarioId,
        storage_path: path,
        display_order: displayOrder,
        position_x: position.x,
        position_y: position.y,
        zoom: position.zoom,
      })
      .select("id")
      .single();
    if (error) {
      await supabase.storage.from(BUCKET).remove([path]);
      return { success: false, error: { type: "database", message: error.message, cause: error } };
    }
    return { success: true, data: { id: data.id, storagePath: path } };
  }

  async createSignedUrl(path: string): Promise<RepositoryResult<string>> {
    if (!supabase) return unavailable();
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
    return error
      ? { success: false, error: { type: "storage", message: error.message, cause: error } }
      : { success: true, data: data.signedUrl };
  }

  async replace(
    scenarioId: string,
    imageId: string,
    oldPath: string,
    newPath: string,
    blob: Blob,
  ): Promise<RepositoryResult<null>> {
    if (!supabase) return unavailable();
    const uploadResult = await supabase.storage.from(BUCKET).upload(newPath, blob, {
      contentType: "image/webp",
      upsert: false,
    });
    if (uploadResult.error)
      return {
        success: false,
        error: { type: "storage", message: uploadResult.error.message, cause: uploadResult.error },
      };
    const { error: updateError } = await supabase
      .from("scenario_images")
      .update({ storage_path: newPath })
      .eq("id", imageId)
      .eq("scenario_id", scenarioId);
    if (updateError) {
      await supabase.storage.from(BUCKET).remove([newPath]);
      return {
        success: false,
        error: { type: "database", message: updateError.message, cause: updateError },
      };
    }
    const { error: removeError } = await supabase.storage.from(BUCKET).remove([oldPath]);
    return removeError
      ? {
          success: false,
          error: { type: "storage", message: removeError.message, cause: removeError },
        }
      : { success: true, data: null };
  }

  async delete(scenarioId: string, imageId: string, path: string): Promise<RepositoryResult<null>> {
    if (!supabase) return unavailable();
    const { error: databaseError } = await supabase
      .from("scenario_images")
      .delete()
      .eq("id", imageId)
      .eq("scenario_id", scenarioId);
    if (databaseError)
      return {
        success: false,
        error: { type: "database", message: databaseError.message, cause: databaseError },
      };
    const { error: storageError } = await supabase.storage.from(BUCKET).remove([path]);
    return storageError
      ? {
          success: false,
          error: { type: "storage", message: storageError.message, cause: storageError },
        }
      : { success: true, data: null };
  }

  async reorder(scenarioId: string, imageIds: string[]): Promise<RepositoryResult<null>> {
    if (!supabase) return unavailable();
    for (const [index, imageId] of imageIds.entries()) {
      const { error } = await supabase
        .from("scenario_images")
        .update({ display_order: 1000 + index })
        .eq("id", imageId)
        .eq("scenario_id", scenarioId);
      if (error)
        return {
          success: false,
          error: { type: "database", message: error.message, cause: error },
        };
    }
    for (const [index, imageId] of imageIds.entries()) {
      const { error } = await supabase
        .from("scenario_images")
        .update({ display_order: index + 1 })
        .eq("id", imageId)
        .eq("scenario_id", scenarioId);
      if (error)
        return {
          success: false,
          error: { type: "database", message: error.message, cause: error },
        };
    }
    return { success: true, data: null };
  }

  async updatePosition(
    scenarioId: string,
    imageId: string,
    position: { x: number; y: number; zoom: number },
  ): Promise<RepositoryResult<null>> {
    if (!supabase) return unavailable();
    const { error } = await supabase
      .from("scenario_images")
      .update({ position_x: position.x, position_y: position.y, zoom: position.zoom })
      .eq("id", imageId)
      .eq("scenario_id", scenarioId);
    return error
      ? { success: false, error: { type: "database", message: error.message, cause: error } }
      : { success: true, data: null };
  }
}

export const scenarioImageRepository = new ScenarioImageRepository();
