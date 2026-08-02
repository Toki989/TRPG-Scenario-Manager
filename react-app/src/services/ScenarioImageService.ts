import type { ApiResult } from "../domain/errors/ApiResult";
import { scenarioImageRepository } from "../repositories/scenario/ScenarioImageRepository";

function errorResult<T>(message: string): ApiResult<T> {
  return { success: false, error: { code: "STORAGE_UPLOAD_FAILED", message } };
}

async function compressImage(file: File): Promise<Blob> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    throw new Error("PNG・JPEG・WebP形式の画像を選択してください。");
  }
  const source = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = source;
    await image.decode();
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("画像を圧縮できませんでした。"))),
        "image/webp",
        0.82,
      );
    });
  } finally {
    URL.revokeObjectURL(source);
  }
}

export class ScenarioImageService {
  async uploadPortrait(
    scenarioId: string,
    file: File,
  ): Promise<ApiResult<{ storagePath: string }>> {
    if (!scenarioId || !file) return errorResult("画像を選択してください。");
    try {
      const blob = await compressImage(file);
      const path = `${scenarioId}/portraits/${crypto.randomUUID()}.webp`;
      const result = await scenarioImageRepository.uploadObject(path, blob);
      return result.success
        ? { success: true, data: { storagePath: path } }
        : errorResult(result.error.message);
    } catch (error) {
      return errorResult(error instanceof Error ? error.message : "立ち絵の処理に失敗しました。");
    }
  }

  async removeStorageObject(path: string): Promise<ApiResult<null>> {
    const result = await scenarioImageRepository.removeObject(path);
    return result.success ? result : errorResult(result.error.message);
  }

  async upload(
    scenarioId: string,
    file: File,
    displayOrder: number,
    position?: { x: number; y: number; zoom: number },
  ): Promise<ApiResult<{ id: string; storagePath: string }>> {
    if (!scenarioId || !file) return errorResult("画像を選択してください。");
    try {
      const blob = await compressImage(file);
      const path = `${scenarioId}/${crypto.randomUUID()}.webp`;
      const result = await scenarioImageRepository.upload(
        scenarioId,
        path,
        blob,
        displayOrder,
        position,
      );
      return result.success ? result : errorResult(result.error.message);
    } catch (error) {
      return errorResult(error instanceof Error ? error.message : "画像の処理に失敗しました。");
    }
  }

  async getSignedUrl(path: string): Promise<ApiResult<string>> {
    const result = await scenarioImageRepository.createSignedUrl(path);
    return result.success ? result : errorResult(result.error.message);
  }

  async replace(
    scenarioId: string,
    imageId: string,
    oldPath: string,
    file: File,
  ): Promise<ApiResult<null>> {
    try {
      const blob = await compressImage(file);
      const newPath = `${scenarioId}/${crypto.randomUUID()}.webp`;
      const result = await scenarioImageRepository.replace(
        scenarioId,
        imageId,
        oldPath,
        newPath,
        blob,
      );
      return result.success ? result : errorResult(result.error.message);
    } catch (error) {
      return errorResult(error instanceof Error ? error.message : "画像の差し替えに失敗しました。");
    }
  }

  async delete(scenarioId: string, imageId: string, path: string): Promise<ApiResult<null>> {
    const result = await scenarioImageRepository.delete(scenarioId, imageId, path);
    return result.success ? result : errorResult(result.error.message);
  }

  async reorder(scenarioId: string, imageIds: string[]): Promise<ApiResult<null>> {
    const result = await scenarioImageRepository.reorder(scenarioId, imageIds);
    return result.success ? result : errorResult(result.error.message);
  }

  async updatePosition(
    scenarioId: string,
    imageId: string,
    position: { x: number; y: number; zoom: number },
  ): Promise<ApiResult<null>> {
    const result = await scenarioImageRepository.updatePosition(scenarioId, imageId, position);
    return result.success ? result : errorResult(result.error.message);
  }
}

export const scenarioImageService = new ScenarioImageService();
