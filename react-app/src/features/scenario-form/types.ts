import type { ScenarioDetailDto } from "../../domain/dto/ScenarioDetailDto";

export type CountType = "fixed" | "range" | "free";
export type TimeType = "fixed" | "range" | "free";

export interface EpisodeDraft {
  clientId: string;
  title: string;
  timeType: TimeType;
  timeFixed: string;
  timeMin: string;
  timeMax: string;
  timeText: string;
  timeValue: string;
  timeUnit: "分" | "時間";
  timeFree: string;
  summary: string;
  status: "not_started" | "completed";
  playDate: string;
}

export interface HandoutDraft {
  clientId: string;
  label: string;
  content: string;
}

export interface SessionDraft {
  clientId: string;
  name: string;
  role: "KP" | "PL";
  characters: {
    clientId: string;
    name: string;
    playerName: string;
    iacharaUrl: string;
    ho: string;
    memo: string;
    portrait: FormImageDraft | null;
  }[];
}

export interface CharacterDraft {
  clientId: string;
  name: string;
  playerName: string;
  iacharaUrl: string;
  ho: string;
  memo: string;
  portrait: FormImageDraft | null;
}

export interface FormImageDraft {
  id: string | null;
  storagePath: string | null;
  signedUrl: string | null;
  file: File | null;
  previewUrl: string | null;
  positionX: number;
  positionY: number;
  zoom: number;
}

export interface ScenarioFormState {
  title: string;
  titleReading: string;
  system: string;
  author: string;
  authorReading: string;
  stage: string;
  scenarioType: "normal" | "campaign" | "kpLess";
  playerCountType: CountType;
  playerCountFixed: string;
  playerCountMin: string;
  playerCountMax: string;
  playerCountText: string;
  playTimeType: TimeType;
  playTimeFixed: string;
  playTimeFixedUnit: "分" | "時間";
  playTimeMin: string;
  playTimeMinUnit: "分" | "時間";
  playTimeMax: string;
  playTimeMaxUnit: "分" | "時間";
  playTimeText: string;
  recommendedSkills: string;
  secondarySkills: string;
  notRecommended: string;
  lostRate: "none" | "low" | "medium" | "high" | "very_high" | "unknown";
  lostRateNote: string;
  hoType: "none" | "common" | "individual" | "secret" | "common_individual" | "special";
  scenarioTags: string[];
  battle: "yes" | "no" | "conditional";
  cautions: string;
  trailerText: string;
  purchaseUrl: string;
  memo: string;
  kpMemo: string;
  plMemo: string;
  legacyRegistrationText: string;
  kpCompleted: boolean;
  playCompleted: boolean;
  episodes: EpisodeDraft[];
  handouts: HandoutDraft[];
  sessions: SessionDraft[];
  images: FormImageDraft[];
}

export function blankEpisode(): EpisodeDraft {
  return {
    clientId: crypto.randomUUID(),
    title: "",
    timeType: "fixed",
    timeFixed: "",
    timeMin: "",
    timeMax: "",
    timeText: "",
    timeValue: "",
    timeUnit: "時間",
    timeFree: "",
    summary: "",
    status: "not_started",
    playDate: "",
  };
}

export function blankHandout(): HandoutDraft {
  return { clientId: crypto.randomUUID(), label: "", content: "" };
}

export function blankSession(): SessionDraft {
  return { clientId: crypto.randomUUID(), name: "", role: "PL", characters: [] };
}

export function blankCharacter(): CharacterDraft {
  return {
    clientId: crypto.randomUUID(),
    name: "",
    playerName: "",
    iacharaUrl: "",
    ho: "",
    memo: "",
    portrait: null,
  };
}

export function createBlankScenarioForm(): ScenarioFormState {
  return {
    title: "",
    titleReading: "",
    system: "",
    author: "",
    authorReading: "",
    stage: "",
    scenarioType: "normal",
    playerCountType: "fixed",
    playerCountFixed: "",
    playerCountMin: "",
    playerCountMax: "",
    playerCountText: "",
    playTimeType: "fixed",
    playTimeFixed: "",
    playTimeFixedUnit: "時間",
    playTimeMin: "",
    playTimeMinUnit: "時間",
    playTimeMax: "",
    playTimeMaxUnit: "時間",
    playTimeText: "",
    recommendedSkills: "",
    secondarySkills: "",
    notRecommended: "",
    lostRate: "unknown",
    lostRateNote: "",
    hoType: "none",
    scenarioTags: [],
    battle: "no",
    cautions: "",
    trailerText: "",
    purchaseUrl: "",
    memo: "",
    kpMemo: "",
    plMemo: "",
    legacyRegistrationText: "{}",
    kpCompleted: false,
    playCompleted: false,
    episodes: [blankEpisode()],
    handouts: [blankHandout()],
    sessions: [],
    images: [],
  };
}

export function formFromDetail(
  detail: ScenarioDetailDto,
  images: FormImageDraft[],
): ScenarioFormState {
  const legacy = detail.legacyRegistration;
  const basic =
    legacy && typeof legacy.basic === "object" && legacy.basic !== null
      ? (legacy.basic as Record<string, unknown>)
      : null;
  const textValue = (value: unknown, fallback = "") =>
    typeof value === "string" ? value : fallback;
  const legacyCountType = textValue(basic?.countType);
  const legacyTimeType = textValue(basic?.timeType);
  const countType =
    legacyCountType === "range" || legacyCountType === "free" || legacyCountType === "fixed"
      ? legacyCountType
      : detail.playerCountType;
  const timeType =
    legacyTimeType === "range" || legacyTimeType === "free" || legacyTimeType === "fixed"
      ? legacyTimeType
      : detail.playTimeType;
  const episodeData =
    legacy && typeof legacy.campaign === "object" && legacy.campaign !== null
      ? (legacy.campaign as Record<string, unknown>).episodes
      : null;
  return {
    title: detail.title,
    titleReading: detail.titleReading ?? "",
    system: detail.system,
    author: detail.author ?? "",
    authorReading: detail.authorReading ?? "",
    stage: detail.stage ?? "",
    scenarioType: detail.scenarioType,
    playerCountType: countType,
    playerCountFixed: textValue(basic?.fixedCount, detail.playerCountFixed?.toString() ?? ""),
    playerCountMin: textValue(basic?.minCount, detail.playerCountMin?.toString() ?? ""),
    playerCountMax: textValue(basic?.maxCount, detail.playerCountMax?.toString() ?? ""),
    playerCountText: textValue(basic?.freeCount, detail.playerCountText ?? ""),
    playTimeType: timeType,
    playTimeFixed: textValue(basic?.fixedTimeValue, detail.playTimeFixed?.toString() ?? ""),
    playTimeFixedUnit:
      textValue(basic?.fixedTimeUnit, basic ? "時間" : "分") === "分" ? "分" : "時間",
    playTimeMin: textValue(basic?.minTimeValue, detail.playTimeMin?.toString() ?? ""),
    playTimeMinUnit: textValue(basic?.minTimeUnit, basic ? "時間" : "分") === "分" ? "分" : "時間",
    playTimeMax: textValue(basic?.maxTimeValue, detail.playTimeMax?.toString() ?? ""),
    playTimeMaxUnit: textValue(basic?.maxTimeUnit, basic ? "時間" : "分") === "分" ? "分" : "時間",
    playTimeText: textValue(basic?.freeTime, detail.playTimeText ?? ""),
    recommendedSkills: detail.recommendedSkills ?? "",
    secondarySkills: detail.secondarySkills ?? "",
    notRecommended: detail.notRecommended ?? "",
    lostRate: (detail.lostRate as ScenarioFormState["lostRate"]) ?? "unknown",
    lostRateNote: detail.lostRateNote ?? "",
    hoType: (detail.hoType as ScenarioFormState["hoType"]) ?? "none",
    scenarioTags: detail.tags,
    battle: (detail.battle as ScenarioFormState["battle"]) ?? "no",
    cautions: detail.cautions ?? "",
    trailerText: detail.trailerText ?? "",
    purchaseUrl: detail.purchaseUrl ?? "",
    memo: detail.memo ?? "",
    kpMemo: detail.kpMemo ?? "",
    plMemo: detail.plMemo ?? "",
    legacyRegistrationText: JSON.stringify(detail.legacyRegistration, null, 2),
    kpCompleted: detail.kpStatus === "completed",
    playCompleted: detail.playStatus === "completed",
    episodes:
      Array.isArray(episodeData) && episodeData.length
        ? episodeData
            .filter(
              (episode): episode is Record<string, unknown> =>
                typeof episode === "object" && episode !== null,
            )
            .map((episode) => ({
              clientId: crypto.randomUUID(),
              title: textValue(episode.title),
              timeType:
                textValue(episode.timeType) === "range" || textValue(episode.timeType) === "free"
                  ? (textValue(episode.timeType) as TimeType)
                  : "fixed",
              timeFixed: textValue(episode.timeValue),
              timeMin: "",
              timeMax: "",
              timeText: textValue(episode.timeFree),
              timeValue: textValue(episode.timeValue),
              timeUnit: textValue(episode.timeUnit, "時間") === "分" ? "分" : "時間",
              timeFree: textValue(episode.timeFree),
              summary: textValue(episode.summary),
              status:
                textValue(episode.status) === "プレイ済み" ||
                textValue(episode.status) === "completed"
                  ? "completed"
                  : "not_started",
              playDate: textValue(episode.playDate),
            }))
        : detail.episodes.length
          ? detail.episodes.map((episode) => ({
              clientId: crypto.randomUUID(),
              title: episode.title ?? "",
              timeType: episode.timeType,
              timeFixed: episode.timeFixed?.toString() ?? "",
              timeMin: episode.timeMin?.toString() ?? "",
              timeMax: episode.timeMax?.toString() ?? "",
              timeText: episode.timeText ?? "",
              timeValue: episode.timeFixed?.toString() ?? "",
              timeUnit: "分" as const,
              timeFree: episode.timeText ?? "",
              summary: episode.summary ?? "",
              status:
                episode.status === "completed" ? ("completed" as const) : ("not_started" as const),
              playDate: episode.playDate ?? "",
            }))
          : [blankEpisode()],
    handouts: detail.handouts.length
      ? detail.handouts.map((handout) => ({
          clientId: crypto.randomUUID(),
          label: handout.label ?? "",
          content: handout.content,
        }))
      : [blankHandout()],
    sessions: detail.sessions.map((session) => ({
      clientId: crypto.randomUUID(),
      name: session.name ?? "",
      role: session.role,
      characters: session.characters.map((character) => ({
        clientId: crypto.randomUUID(),
        name: character.name ?? "",
        playerName: character.playerName ?? "",
        iacharaUrl: character.iacharaUrl ?? "",
        ho: character.ho ?? "",
        memo: character.memo ?? "",
        portrait: character.portraitStoragePath
          ? {
              id: null,
              storagePath: character.portraitStoragePath,
              signedUrl: character.portraitSignedUrl,
              file: null,
              previewUrl: null,
              positionX: 50,
              positionY: 50,
              zoom: 1,
            }
          : null,
      })),
    })),
    images,
  };
}
