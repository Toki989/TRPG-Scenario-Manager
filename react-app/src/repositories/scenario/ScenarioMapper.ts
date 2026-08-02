import type { ProgressStatus, ScenarioSummary } from "../../domain/models/Scenario";
import type {
  ScenarioDetail,
  ScenarioEpisode,
  ScenarioHandout,
  ScenarioImage,
  ScenarioSession,
} from "../../domain/models/ScenarioDetail";
import type { Database } from "../../lib/supabase/database.types";

type ScenarioRow = Database["public"]["Tables"]["scenarios"]["Row"];
type UserDataRow = Pick<
  Database["public"]["Tables"]["user_scenario_data"]["Row"],
  | "scenario_id"
  | "favorite"
  | "kp_status"
  | "play_status"
  | "purchase_url"
  | "memo"
  | "kp_memo"
  | "pl_memo"
>;
type HandoutRow = Database["public"]["Tables"]["scenario_handouts"]["Row"];
type EpisodeRow = Database["public"]["Tables"]["scenario_episodes"]["Row"];
type ImageRow = Database["public"]["Tables"]["scenario_images"]["Row"];
type SessionRow = Database["public"]["Tables"]["scenario_sessions"]["Row"];
type SessionCharacterRow = Database["public"]["Tables"]["scenario_session_characters"]["Row"];

function formatCount(row: ScenarioRow): string {
  const basic = row.legacy_registration.basic;
  if (basic && typeof basic === "object" && !Array.isArray(basic)) {
    const value = basic as Record<string, unknown>;
    const text = (item: unknown) => (typeof item === "string" ? item : "");
    if (text(value.countType) === "fixed") return `${text(value.fixedCount) || "-"}人固定`;
    if (text(value.countType) === "range")
      return `${text(value.minCount) || "-"}〜${text(value.maxCount) || "-"}${text(value.maxCount) === "KP管理できる人数" ? "" : "人"}`;
    if (text(value.countType) === "free") return text(value.freeCount) || "自由入力";
  }
  if (row.player_count_type === "fixed")
    return row.player_count_fixed === null ? "未設定" : `${row.player_count_fixed}人`;
  if (row.player_count_type === "range")
    return row.player_count_min === null || row.player_count_max === null
      ? "未設定"
      : `${row.player_count_min}〜${row.player_count_max}人`;
  return row.player_count_text ?? "未設定";
}

function formatTime(row: ScenarioRow): string {
  const basic = row.legacy_registration.basic;
  if (basic && typeof basic === "object" && !Array.isArray(basic)) {
    const value = basic as Record<string, unknown>;
    const text = (item: unknown) => (typeof item === "string" ? item : "");
    if (text(value.timeType) === "fixed")
      return text(value.fixedTimeValue)
        ? `${text(value.fixedTimeValue)}${text(value.fixedTimeUnit) || "時間"}`
        : text(value.fixedTime) || "未設定";
    if (text(value.timeType) === "range")
      return text(value.minTimeValue) || text(value.maxTimeValue)
        ? `${text(value.minTimeValue) || "-"}${text(value.minTimeUnit) || "時間"}〜${text(value.maxTimeValue) || "-"}${text(value.maxTimeUnit) || "時間"}`
        : `${text(value.minTime) || "-"}〜${text(value.maxTime) || "-"}時間`;
    if (text(value.timeType) === "free") return text(value.freeTime) || "自由入力";
  }
  if (row.play_time_type === "fixed")
    return row.play_time_fixed === null ? "未設定" : `${row.play_time_fixed}分`;
  if (row.play_time_type === "range")
    return row.play_time_min === null || row.play_time_max === null
      ? "未設定"
      : `${row.play_time_min}〜${row.play_time_max}分`;
  return row.play_time_text ?? "未設定";
}

function toStatus(status: UserDataRow["kp_status"]): ProgressStatus {
  return status === "not_started" ? "notStarted" : status;
}

function formatEpisodeTime(row: EpisodeRow): string {
  if (row.time_type === "fixed") return `${row.time_fixed}分`;
  if (row.time_type === "range") return `${row.time_min}〜${row.time_max}分`;
  return row.time_text ?? "未設定";
}

function mapHandout(row: HandoutRow): ScenarioHandout {
  return { id: row.id, displayOrder: row.display_order, label: row.label, content: row.content };
}

function mapEpisode(row: EpisodeRow): ScenarioEpisode {
  return {
    id: row.id,
    episodeNumber: row.episode_number,
    title: row.title,
    time: formatEpisodeTime(row),
    timeType: row.time_type,
    timeFixed: row.time_fixed,
    timeMin: row.time_min,
    timeMax: row.time_max,
    timeText: row.time_text,
    summary: row.summary,
    status: toStatus(row.status),
    playDate: row.play_date,
  };
}

function mapImage(row: ImageRow): ScenarioImage {
  return {
    id: row.id,
    displayOrder: row.display_order,
    storagePath: row.storage_path,
    signedUrl: null,
    positionX: row.position_x,
    positionY: row.position_y,
    zoom: row.zoom,
  };
}

function mapSession(row: SessionRow, characters: SessionCharacterRow[]): ScenarioSession {
  return {
    id: row.id,
    displayOrder: row.display_order,
    name: row.name,
    role: row.role,
    characters: characters
      .filter((character) => character.session_id === row.id)
      .sort((a, b) => a.display_order - b.display_order)
      .map((character) => ({
        id: character.id,
        displayOrder: character.display_order,
        name: character.name,
        playerName: character.player_name,
        iacharaUrl: character.iachara_url,
        ho: character.ho,
        memo: character.memo,
        portraitStoragePath: character.portrait_storage_path,
        portraitSignedUrl: null,
      })),
  };
}

export function mapScenarioSummary(
  row: ScenarioRow,
  userData?: UserDataRow,
  thumbnailStoragePath: string | null = null,
): ScenarioSummary {
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    system: row.system ?? "",
    scenarioType: row.scenario_type === "kp_less" ? "kpLess" : row.scenario_type,
    author: row.author,
    titleReading: row.title_reading,
    authorReading: row.author_reading,
    stage: row.stage,
    recommendedSkills: row.recommended_skills,
    hoType: row.ho_type,
    playerCount: formatCount(row),
    playerCountType: row.player_count_type,
    playerCountFixed: row.player_count_fixed,
    playerCountMin: row.player_count_min,
    playerCountMax: row.player_count_max,
    playerCountText: row.player_count_text,
    playTime: formatTime(row),
    playTimeType: row.play_time_type,
    playTimeFixed: row.play_time_fixed,
    playTimeMin: row.play_time_min,
    playTimeMax: row.play_time_max,
    playTimeText: row.play_time_text,
    tags: row.scenario_tags,
    lostRate: row.lost_rate,
    battle: row.battle,
    thumbnailStoragePath,
    favorite: userData?.favorite ?? false,
    kpStatus: toStatus(userData?.kp_status ?? "not_started"),
    playStatus: toStatus(userData?.play_status ?? "not_started"),
    purchaseUrl: userData?.purchase_url ?? null,
    memo: userData?.memo ?? null,
    kpMemo: userData?.kp_memo ?? null,
    plMemo: userData?.pl_memo ?? null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function mapScenarioDetail(
  row: ScenarioRow,
  userData: UserDataRow | undefined,
  handouts: HandoutRow[],
  episodes: EpisodeRow[],
  images: ImageRow[],
  sessions: SessionRow[] = [],
  sessionCharacters: SessionCharacterRow[] = [],
): ScenarioDetail {
  return {
    ...mapScenarioSummary(row, userData),
    legacyRegistration: row.legacy_registration,
    recommendedSkills: row.recommended_skills,
    secondarySkills: row.secondary_skills,
    notRecommended: row.not_recommended,
    lostRate: row.lost_rate,
    lostRateNote: row.lost_rate_note,
    hoType: row.ho_type,
    battle: row.battle,
    cautions: row.cautions,
    trailerText: row.trailer_text,
    handouts: handouts.map(mapHandout),
    episodes: episodes.map(mapEpisode),
    images: images.map(mapImage),
    sessions: sessions.map((session) => mapSession(session, sessionCharacters)),
  };
}
