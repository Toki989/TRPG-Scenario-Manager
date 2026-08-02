export type RepositoryError =
  | { type: "database"; message: string; cause?: unknown }
  | { type: "storage"; message: string; cause?: unknown }
  | { type: "auth"; message: string; cause?: unknown }
  | { type: "rpc"; message: string; cause?: unknown }
  | { type: "file"; message: string; cause?: unknown };
