import type { RepositoryError } from "./RepositoryError";

export type RepositoryResult<T> =
  { success: true; data: T } | { success: false; error: RepositoryError };
