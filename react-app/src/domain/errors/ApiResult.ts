import type { AppErrorCode } from "./AppErrorCode";

export type ApiResult<T> =
  { success: true; data: T } | { success: false; error: { code: AppErrorCode; message: string } };
