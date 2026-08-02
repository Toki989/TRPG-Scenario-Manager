import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type MouseEvent,
  type PointerEvent,
  type WheelEvent,
} from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import type { AuthUser } from "../../domain/models/AuthUser";
import type { CreateScenarioCommand } from "../../domain/commands/CreateScenarioCommand";
import { scenarioService } from "../../services/ScenarioService";
import { scenarioImageService } from "../../services/ScenarioImageService";
import { scenarioDraftService } from "../../services/ScenarioDraftService";
import type { ScenarioDraft } from "../../domain/models/ScenarioDraft";
import { ConfirmDialog } from "../../components/modal/ConfirmDialog";
import { AppLayout } from "../../components/layout/AppLayout";
import {
  blankEpisode,
  blankCharacter,
  blankHandout,
  blankSession,
  createBlankScenarioForm,
  formFromDetail,
  type CountType,
  type EpisodeDraft,
  type FormImageDraft,
  type HandoutDraft,
  type ScenarioFormState,
  type SessionDraft,
  type TimeType,
} from "./types";

const SYSTEMS = [
  "クトゥルフ神話TRPG（6版）",
  "新クトゥルフ神話TRPG（7版）",
  "エモクロアTRPG",
  "マーダーミステリー",
  "インセイン",
  "ダブルクロス The 3rd Edition",
  "シノビガミ",
  "ソード・ワールド2.5",
  "永い後日談のネクロニカ",
  "フタリソウサ",
  "ストリテラ",
  "その他",
] as const;

const TAGS = [
  "ホラー",
  "推理",
  "謎解き",
  "戦闘",
  "RP重視",
  "エモーショナル",
  "シリアス",
  "愉快",
  "ギャグ",
  "刑事",
  "青春",
  "恋愛",
  "うちよそ",
  "探索重視",
  "高難易度",
  "初心者向け",
  "秘匿HO",
  "クローズド",
  "シティ",
];

const sectionClass = "section-card scenario-form-section";

function numberOrNull(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formToCreateCommand(state: ScenarioFormState, ownerId: string): CreateScenarioCommand {
  let legacyRegistration: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(state.legacyRegistrationText || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      legacyRegistration = parsed as Record<string, unknown>;
    }
  } catch {
    // validateForm reports malformed JSON before this function is used.
  }
  const countText =
    state.playerCountType === "range" && !numberOrNull(state.playerCountMax)
      ? `${state.playerCountMin}〜${state.playerCountMax}`
      : state.playerCountText;
  const fixedTimeText = state.playTimeFixed
    ? `${state.playTimeFixed}${state.playTimeFixedUnit}`
    : "";
  const rangeTimeText =
    state.playTimeMin || state.playTimeMax
      ? `${state.playTimeMin}${state.playTimeMinUnit}〜${state.playTimeMax}${state.playTimeMaxUnit}`
      : "";
  const canUseNumericTime =
    state.playTimeType === "fixed"
      ? state.playTimeFixedUnit === "分"
      : state.playTimeMinUnit === "分" && state.playTimeMaxUnit === "分";
  const playerCount =
    state.playerCountType === "fixed"
      ? { type: "fixed" as const, value: numberOrNull(state.playerCountFixed) }
      : state.playerCountType === "range" &&
          numberOrNull(state.playerCountMin) !== null &&
          numberOrNull(state.playerCountMax) !== null
        ? {
            type: "range" as const,
            min: numberOrNull(state.playerCountMin),
            max: numberOrNull(state.playerCountMax),
          }
        : {
            type: "free" as const,
            text: state.playerCountType === "range" ? countText : state.playerCountText,
          };
  const playTime =
    state.playTimeType === "free"
      ? { type: "free" as const, text: state.playTimeText }
      : canUseNumericTime
        ? state.playTimeType === "fixed"
          ? { type: "fixed" as const, value: numberOrNull(state.playTimeFixed) }
          : {
              type: "range" as const,
              min: numberOrNull(state.playTimeMin),
              max: numberOrNull(state.playTimeMax),
            }
        : {
            type: "free" as const,
            text: state.playTimeType === "fixed" ? fixedTimeText : rangeTimeText,
          };
  const basic =
    legacyRegistration &&
    typeof legacyRegistration.basic === "object" &&
    legacyRegistration.basic !== null
      ? (legacyRegistration.basic as Record<string, unknown>)
      : {};
  const scenario =
    legacyRegistration &&
    typeof legacyRegistration.scenario === "object" &&
    legacyRegistration.scenario !== null
      ? (legacyRegistration.scenario as Record<string, unknown>)
      : {};
  const personal =
    legacyRegistration &&
    typeof legacyRegistration.personal === "object" &&
    legacyRegistration.personal !== null
      ? (legacyRegistration.personal as Record<string, unknown>)
      : {};
  const campaign =
    legacyRegistration &&
    typeof legacyRegistration.campaign === "object" &&
    legacyRegistration.campaign !== null
      ? (legacyRegistration.campaign as Record<string, unknown>)
      : {};
  const trailer =
    legacyRegistration &&
    typeof legacyRegistration.trailer === "object" &&
    legacyRegistration.trailer !== null
      ? (legacyRegistration.trailer as Record<string, unknown>)
      : {};
  const legacyData = {
    ...legacyRegistration,
    basic: {
      ...basic,
      title: state.title,
      titleReading: state.titleReading,
      system: state.system,
      author: state.author,
      authorReading: state.authorReading,
      scenarioType: state.scenarioType,
      countType: state.playerCountType,
      fixedCount: state.playerCountFixed,
      minCount: state.playerCountMin,
      maxCount: state.playerCountMax,
      freeCount: state.playerCountType === "free" ? state.playerCountText : (basic.freeCount ?? ""),
      timeType: state.playTimeType,
      fixedTime: state.playTimeType === "fixed" ? fixedTimeText : (basic.fixedTime ?? ""),
      fixedTimeValue: state.playTimeFixed,
      fixedTimeUnit: state.playTimeFixedUnit,
      minTime:
        state.playTimeType === "range"
          ? `${state.playTimeMin}${state.playTimeMinUnit}`
          : (basic.minTime ?? ""),
      minTimeValue: state.playTimeMin,
      minTimeUnit: state.playTimeMinUnit,
      maxTime:
        state.playTimeType === "range"
          ? `${state.playTimeMax}${state.playTimeMaxUnit}`
          : (basic.maxTime ?? ""),
      maxTimeValue: state.playTimeMax,
      maxTimeUnit: state.playTimeMaxUnit,
      freeTime: state.playTimeText,
      stage: state.stage,
    },
    scenario: {
      ...scenario,
      recommendedSkills: state.recommendedSkills,
      secondarySkills: state.secondarySkills,
      notRecommended: state.notRecommended,
      lostRate: {
        none: "なし",
        low: "低",
        medium: "中",
        high: "高",
        very_high: "極高",
        unknown: "不明",
      }[state.lostRate],
      lostRateNote: state.lostRateNote,
      hoType: {
        none: "なし",
        common: "共通HO",
        individual: "個別HO",
        secret: "秘匿HOあり",
        common_individual: "共通＋個別HO",
        special: "特殊",
      }[state.hoType],
      hoContent: state.handouts
        .map((handout) => handout.content)
        .filter(Boolean)
        .join("\u001e"),
      trends: state.scenarioTags,
      combat: { yes: "あり", no: "なし", conditional: "場合による" }[state.battle],
      notes: state.cautions,
    },
    campaign: {
      ...campaign,
      episodeCount: state.episodes.length,
      episodes: state.episodes.map((episode, index) => ({
        number: index + 1,
        title: episode.title,
        timeType: episode.timeType,
        timeValue: episode.timeValue,
        timeUnit: episode.timeUnit,
        timeFree: episode.timeFree,
        summary: episode.summary,
        status: episode.status === "completed" ? "プレイ済み" : "未プレイ",
        playDate: episode.playDate,
      })),
    },
    personal: {
      ...personal,
      url: state.purchaseUrl,
      isKp: state.kpCompleted,
      isPl: state.playCompleted,
      memo: state.kpMemo || state.memo,
      kp: {
        ...(typeof personal.kp === "object" && personal.kp !== null ? personal.kp : {}),
        memo: state.kpMemo,
      },
      pl: {
        ...(typeof personal.pl === "object" && personal.pl !== null ? personal.pl : {}),
        memo: state.plMemo,
      },
    },
    trailer: { ...trailer, text: state.trailerText },
  };
  return {
    ownerId,
    title: state.title,
    titleReading: state.titleReading,
    system: state.system,
    author: state.author,
    authorReading: state.authorReading,
    stage: state.stage,
    scenarioType: state.scenarioType,
    playerCount,
    playTime,
    recommendedSkills: state.recommendedSkills,
    secondarySkills: state.secondarySkills,
    notRecommended: state.notRecommended,
    lostRate: state.lostRate,
    lostRateNote: state.lostRateNote,
    hoType: state.hoType,
    battle: state.battle,
    cautions: state.cautions,
    trailerText: state.trailerText,
    scenarioTags: state.scenarioTags,
    legacyRegistration: legacyData,
  };
}

function withoutClientId<T extends { clientId: string }>(value: T): Omit<T, "clientId"> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "clientId")) as Omit<
    T,
    "clientId"
  >;
}

function draftPayload(state: ScenarioFormState): Record<string, unknown> {
  return {
    schemaVersion: 1,
    ...state,
    episodes: state.episodes.map(withoutClientId),
    handouts: state.handouts.map(withoutClientId),
    images: state.images.map(({ id, storagePath }) => ({ id, storagePath })),
    sessions: state.sessions.map((session) => ({
      ...withoutClientId(session),
      characters: session.characters.map((character) => ({
        ...withoutClientId(character),
        portrait: character.portrait
          ? { id: null, storagePath: character.portrait.storagePath }
          : null,
      })),
    })),
  };
}

function parseDraftEpisodes(value: unknown): EpisodeDraft[] {
  if (!Array.isArray(value)) return [blankEpisode()];
  const episodes = value.flatMap((episode) => {
    if (!episode || typeof episode !== "object") return [];
    const item = episode as Partial<EpisodeDraft>;
    return [
      {
        clientId: typeof item.clientId === "string" ? item.clientId : crypto.randomUUID(),
        title: typeof item.title === "string" ? item.title : "",
        timeType: item.timeType === "range" || item.timeType === "free" ? item.timeType : "fixed",
        timeFixed: typeof item.timeFixed === "string" ? item.timeFixed : "",
        timeMin: typeof item.timeMin === "string" ? item.timeMin : "",
        timeMax: typeof item.timeMax === "string" ? item.timeMax : "",
        timeText: typeof item.timeText === "string" ? item.timeText : "",
        timeValue:
          typeof item.timeValue === "string"
            ? item.timeValue
            : typeof item.timeFixed === "string"
              ? item.timeFixed
              : "",
        timeUnit: item.timeUnit === "分" ? "分" : "時間",
        timeFree:
          typeof item.timeFree === "string"
            ? item.timeFree
            : typeof item.timeText === "string"
              ? item.timeText
              : "",
        summary: typeof item.summary === "string" ? item.summary : "",
        status: item.status === "completed" ? "completed" : "not_started",
        playDate: typeof item.playDate === "string" ? item.playDate : "",
      } satisfies EpisodeDraft,
    ];
  });
  return episodes.length ? episodes : [blankEpisode()];
}

function parseDraftHandouts(value: unknown): HandoutDraft[] {
  if (!Array.isArray(value)) return [blankHandout()];
  const handouts = value.flatMap((handout) => {
    if (!handout || typeof handout !== "object") return [];
    const item = handout as Partial<HandoutDraft>;
    return [
      {
        clientId: typeof item.clientId === "string" ? item.clientId : crypto.randomUUID(),
        label: typeof item.label === "string" ? item.label : "",
        content: typeof item.content === "string" ? item.content : "",
      } satisfies HandoutDraft,
    ];
  });
  return handouts.length ? handouts : [blankHandout()];
}

function parseDraftImages(value: unknown): FormImageDraft[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((image) => {
    if (!image || typeof image !== "object") return [];
    const candidate = image as { id?: unknown; storagePath?: unknown };
    return typeof candidate.id === "string" && typeof candidate.storagePath === "string"
      ? [
          {
            id: candidate.id,
            storagePath: candidate.storagePath,
            signedUrl: null,
            file: null,
            previewUrl: null,
            positionX: 50,
            positionY: 50,
            zoom: 1,
          },
        ]
      : [];
  });
}

function parseDraftSessions(value: unknown): SessionDraft[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((session) => {
    if (!session || typeof session !== "object") return [];
    const candidate = session as Partial<SessionDraft>;
    const characters = Array.isArray(candidate.characters)
      ? candidate.characters.flatMap((character) => {
          if (!character || typeof character !== "object") return [];
          const item = character as Partial<SessionDraft["characters"][number]>;
          const portrait = item.portrait;
          return [
            {
              clientId: typeof item.clientId === "string" ? item.clientId : crypto.randomUUID(),
              name: typeof item.name === "string" ? item.name : "",
              playerName: typeof item.playerName === "string" ? item.playerName : "",
              iacharaUrl: typeof item.iacharaUrl === "string" ? item.iacharaUrl : "",
              ho: typeof item.ho === "string" ? item.ho : "",
              memo: typeof item.memo === "string" ? item.memo : "",
              portrait:
                portrait && typeof portrait === "object" && typeof portrait.storagePath === "string"
                  ? {
                      id: null,
                      storagePath: portrait.storagePath,
                      signedUrl: null,
                      file: null,
                      previewUrl: null,
                      positionX: 50,
                      positionY: 50,
                      zoom: 1,
                    }
                  : null,
            },
          ];
        })
      : [];
    return [
      {
        clientId: typeof candidate.clientId === "string" ? candidate.clientId : crypto.randomUUID(),
        name: typeof candidate.name === "string" ? candidate.name : "",
        role: candidate.role === "KP" ? "KP" : "PL",
        characters,
      },
    ];
  });
}

function validateForm(state: ScenarioFormState): string | null {
  if (!state.title.trim()) return "タイトルを入力してください。";
  if (!state.system.trim()) return "TRPGシステムを選択してください。";
  try {
    const parsed: unknown = JSON.parse(state.legacyRegistrationText || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return "旧アプリ互換データはJSONオブジェクトで入力してください。";
  } catch {
    return "旧アプリ互換データのJSON形式を確認してください。";
  }
  const numericFields: [string, string][] = [
    ["人数", state.playerCountType === "fixed" ? state.playerCountFixed : ""],
    ["最小人数", state.playerCountType === "range" ? state.playerCountMin : ""],
    ["最大人数", state.playerCountType === "range" ? state.playerCountMax : ""],
    ["プレイ時間", state.playTimeType === "fixed" ? state.playTimeFixed : ""],
    ["最短時間", state.playTimeType === "range" ? state.playTimeMin : ""],
    ["最長時間", state.playTimeType === "range" ? state.playTimeMax : ""],
  ];
  for (const [label, value] of numericFields) {
    if (label === "最大人数" && value === "KP管理できる人数") continue;
    if (value.trim() && (numberOrNull(value) === null || numberOrNull(value)! <= 0)) {
      return `${label}は1以上の数値で入力してください。`;
    }
  }
  if (
    state.playerCountType === "range" &&
    Boolean(state.playerCountMin.trim()) !== Boolean(state.playerCountMax.trim())
  ) {
    return "人数の範囲は最小人数と最大人数を両方入力してください。";
  }
  if (
    state.playerCountType === "range" &&
    numberOrNull(state.playerCountMin) !== null &&
    numberOrNull(state.playerCountMax) !== null &&
    numberOrNull(state.playerCountMax)! < numberOrNull(state.playerCountMin)!
  ) {
    return "最大人数は最小人数以上で入力してください。";
  }
  if (
    state.playTimeType === "range" &&
    Boolean(state.playTimeMin.trim()) !== Boolean(state.playTimeMax.trim())
  ) {
    return "プレイ時間の範囲は最短時間と最長時間を両方入力してください。";
  }
  if (
    state.playTimeType === "range" &&
    state.playTimeMin.trim() &&
    numberOrNull(state.playTimeMax)! < numberOrNull(state.playTimeMin)!
  ) {
    return "最長時間は最短時間以上で入力してください。";
  }
  if (state.purchaseUrl.trim()) {
    try {
      const url = new URL(state.purchaseUrl.trim());
      if (!["http:", "https:"].includes(url.protocol))
        return "購入・参照URLはhttpまたはhttpsで入力してください。";
    } catch {
      return "購入・参照URLの形式を確認してください。";
    }
  }
  if (state.scenarioType !== "campaign") return null;
  const episodes = state.episodes.filter(
    (episode) =>
      episode.title.trim() ||
      episode.timeValue.trim() ||
      episode.timeFree.trim() ||
      episode.timeText.trim(),
  );
  if (episodes.length === 0) return "キャンペーンは1話以上入力してください。";
  for (const [index, episode] of episodes.entries()) {
    if (
      (episode.timeType === "fixed" || episode.timeType === "range") &&
      (!numberOrNull(episode.timeValue) || numberOrNull(episode.timeValue)! <= 0)
    ) {
      return `${index + 1}話目の時間を1以上で入力してください。`;
    }
    if (episode.timeType === "free" && !episode.timeFree.trim() && !episode.timeText.trim())
      return `${index + 1}話目の時間を入力してください。`;
    if (episode.playDate && !/^\d{4}-\d{2}-\d{2}$/.test(episode.playDate))
      return `${index + 1}話目の実施日を確認してください。`;
  }
  return null;
}

export function ScenarioFormPage({
  mode,
  user,
  scenarioId,
}: {
  mode: "create" | "edit";
  user: AuthUser | null;
  scenarioId?: string;
}) {
  const routeParams = useParams<{ scenarioId: string }>();
  const currentScenarioId = scenarioId ?? routeParams.scenarioId;
  if (!user) return <Navigate to="/login" replace />;
  if (mode === "edit" && !currentScenarioId) return <Navigate to="/scenarios" replace />;
  return <ScenarioForm mode={mode} user={user} scenarioId={currentScenarioId} />;
}

function ScenarioForm({
  mode,
  user,
  scenarioId,
}: {
  mode: "create" | "edit";
  user: AuthUser;
  scenarioId?: string;
}) {
  const navigate = useNavigate();
  const tagGroupId = useId();
  const initialFormState = useMemo(() => createBlankScenarioForm(), []);
  const [state, setState] = useState<ScenarioFormState>(initialFormState);
  const [initialSnapshot, setInitialSnapshot] = useState<string | null>(() =>
    mode === "create" ? JSON.stringify(initialFormState) : null,
  );
  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<ScenarioDraft[]>([]);
  const [draftId, setDraftId] = useState<string | undefined>();
  const [selectedDraftId, setSelectedDraftId] = useState("");
  const [confirm, setConfirm] = useState<"draft" | "image" | null>(null);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const [pendingImageIndex, setPendingImageIndex] = useState<number | null>(null);
  const originalImageIds = useRef<Set<string>>(new Set());
  const originalImagePaths = useRef<Map<string, string>>(new Map());
  const originalPortraitPaths = useRef<Set<string>>(new Set());
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const hasUnsavedChanges = initialSnapshot !== null && JSON.stringify(state) !== initialSnapshot;

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const patch = <K extends keyof ScenarioFormState>(key: K, value: ScenarioFormState[K]) =>
    setState((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    let active = true;
    void scenarioDraftService.list(user.id).then((result) => {
      if (active && result.success) setDrafts(result.data);
    });
    if (mode === "create")
      return () => {
        active = false;
      };
    if (!scenarioId)
      return () => {
        active = false;
      };
    void scenarioService.getScenarioDetail(user.id, scenarioId).then(async (result) => {
      if (!active) return;
      if (!result.success) {
        setMessage(result.error.message);
        setLoading(false);
        return;
      }
      const images = await Promise.all(
        result.data.images.map(async (image) => {
          const signed = await scenarioImageService.getSignedUrl(image.storagePath);
          return {
            id: image.id,
            storagePath: image.storagePath,
            signedUrl: signed.success ? signed.data : null,
            file: null,
            previewUrl: null,
            positionX: image.positionX,
            positionY: image.positionY,
            zoom: image.zoom,
          } satisfies FormImageDraft;
        }),
      );
      const sessions = await Promise.all(
        result.data.sessions.map(async (session) => ({
          ...session,
          characters: await Promise.all(
            session.characters.map(async (character) => {
              if (!character.portraitStoragePath) return character;
              const signed = await scenarioImageService.getSignedUrl(character.portraitStoragePath);
              return { ...character, portraitSignedUrl: signed.success ? signed.data : null };
            }),
          ),
        })),
      );
      if (!active) return;
      originalImageIds.current = new Set(images.flatMap((image) => (image.id ? [image.id] : [])));
      originalImagePaths.current = new Map(
        images.flatMap((image) =>
          image.id && image.storagePath ? [[image.id, image.storagePath] as const] : [],
        ),
      );
      originalPortraitPaths.current = new Set(
        sessions.flatMap((session) =>
          session.characters.flatMap((character) =>
            character.portraitStoragePath ? [character.portraitStoragePath] : [],
          ),
        ),
      );
      const nextState = formFromDetail({ ...result.data, sessions }, images);
      setState(nextState);
      setInitialSnapshot(JSON.stringify(nextState));
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [mode, scenarioId, user.id]);

  useEffect(
    () => () => {
      stateRef.current.images.forEach((image) => {
        if (image.previewUrl) URL.revokeObjectURL(image.previewUrl);
      });
      stateRef.current.sessions.forEach((session) =>
        session.characters.forEach((character) => {
          if (character.portrait?.previewUrl) URL.revokeObjectURL(character.portrait.previewUrl);
        }),
      );
    },
    [],
  );

  const activeDraft = useMemo(
    () => drafts.find((draft) => draft.id === selectedDraftId),
    [drafts, selectedDraftId],
  );

  function loadDraft(draft: ScenarioDraft) {
    const payload = draft.payload as Partial<ScenarioFormState>;
    setState((current) => ({
      ...current,
      ...payload,
      episodes: parseDraftEpisodes(payload.episodes),
      handouts: parseDraftHandouts(payload.handouts),
      images: parseDraftImages(payload.images),
      sessions: parseDraftSessions(payload.sessions),
    }));
    setDraftId(draft.id);
    setMessage("下書きを読み込みました。未アップロード画像は復元されません。");
  }

  async function saveDraft() {
    setSaving(true);
    setMessage(null);
    const result = await scenarioDraftService.save(user.id, {
      id: draftId,
      scenarioId: scenarioId ?? null,
      title: state.title || "無題の下書き",
      payload: draftPayload(state),
    });
    setSaving(false);
    if (!result.success) {
      setMessage(result.error.message);
      return;
    }
    setDraftId(result.data.id);
    setDrafts((current) => [
      result.data,
      ...current.filter((draft) => draft.id !== result.data.id),
    ]);
    setMessage("下書きを保存しました。画像本体は通常保存時に保存されます。");
  }

  async function removeDraft() {
    if (!activeDraft) return;
    setSaving(true);
    const result = await scenarioDraftService.remove(user.id, activeDraft.id);
    setSaving(false);
    setConfirm(null);
    if (!result.success) {
      setMessage(result.error.message);
      return;
    }
    setDrafts((current) => current.filter((draft) => draft.id !== activeDraft.id));
    setSelectedDraftId("");
    if (draftId === activeDraft.id) setDraftId(undefined);
    setMessage("下書きを削除しました。");
  }

  function addImageFiles(files: File[]) {
    const supportedFiles = files.filter((file) =>
      ["image/png", "image/jpeg", "image/webp"].includes(file.type),
    );
    if (supportedFiles.length !== files.length) {
      setMessage("PNG・JPEG・WebP形式の画像を選択してください。");
    }
    const next = supportedFiles.map(
      (file) =>
        ({
          id: null,
          storagePath: null,
          signedUrl: null,
          file,
          previewUrl: URL.createObjectURL(file),
          positionX: 50,
          positionY: 50,
          zoom: 1,
        }) satisfies FormImageDraft,
    );
    setState((current) => ({ ...current, images: [...current.images, ...next] }));
  }

  function addImage(event: ChangeEvent<HTMLInputElement>) {
    addImageFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  function removeImage() {
    const index = pendingImageIndex ?? -1;
    if (index < 0) return;
    setState((current) => {
      const removed = current.images[index];
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return { ...current, images: current.images.filter((_, imageIndex) => imageIndex !== index) };
    });
    setConfirm(null);
    setPendingImageIndex(null);
  }

  function moveImage(index: number, direction: -1 | 1) {
    setState((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.images.length) return current;
      const images = [...current.images];
      [images[index], images[target]] = [images[target], images[index]];
      return { ...current, images };
    });
  }

  function updateImagePosition(
    index: number,
    position: Pick<FormImageDraft, "positionX" | "positionY" | "zoom">,
  ) {
    setState((current) => ({
      ...current,
      images: current.images.map((image, imageIndex) =>
        imageIndex === index ? { ...image, ...position } : image,
      ),
    }));
  }

  async function saveImages(targetId: string): Promise<{
    error: string | null;
    uploaded: { id: string; storagePath: string }[];
  }> {
    const currentImages = stateRef.current.images;
    const currentIds = new Set(currentImages.flatMap((image) => (image.id ? [image.id] : [])));
    const finalIds: string[] = [];
    const uploaded: { id: string; storagePath: string }[] = [];
    const cleanupUploaded = async () => {
      await Promise.all(
        uploaded.map((image) => scenarioImageService.delete(targetId, image.id, image.storagePath)),
      );
    };
    for (const image of currentImages) {
      if (image.id) {
        const positionResult = await scenarioImageService.updatePosition(targetId, image.id, {
          x: image.positionX,
          y: image.positionY,
          zoom: image.zoom,
        });
        if (!positionResult.success) return { error: positionResult.error.message, uploaded };
        finalIds.push(image.id);
        continue;
      }
      if (!image.file) continue;
      const result = await scenarioImageService.upload(targetId, image.file, finalIds.length + 1, {
        x: image.positionX,
        y: image.positionY,
        zoom: image.zoom,
      });
      if (!result.success) {
        await cleanupUploaded();
        return { error: result.error.message, uploaded };
      }
      uploaded.push(result.data);
      finalIds.push(result.data.id);
    }
    if (finalIds.length) {
      const result = await scenarioImageService.reorder(targetId, finalIds);
      if (!result.success) {
        await cleanupUploaded();
        return { error: result.error.message, uploaded };
      }
    }
    for (const imageId of originalImageIds.current) {
      if (!currentIds.has(imageId)) {
        const storagePath = originalImagePaths.current.get(imageId);
        if (storagePath) {
          const result = await scenarioImageService.delete(targetId, imageId, storagePath);
          if (!result.success) return { error: result.error.message, uploaded };
        }
      }
    }
    return { error: null, uploaded };
  }

  async function prepareSessions(targetId: string) {
    const uploadedPaths: string[] = [];
    const sessions: Parameters<typeof scenarioService.replaceScenarioSessions>[1] = [];
    for (const session of stateRef.current.sessions) {
      const characters = [];
      for (const character of session.characters) {
        let portraitStoragePath = character.portrait?.storagePath ?? null;
        if (character.portrait?.file) {
          const result = await scenarioImageService.uploadPortrait(
            targetId,
            character.portrait.file,
          );
          if (!result.success) {
            await Promise.all(
              uploadedPaths.map((path) => scenarioImageService.removeStorageObject(path)),
            );
            return { success: false as const, error: { message: result.error.message } };
          }
          portraitStoragePath = result.data.storagePath;
          uploadedPaths.push(portraitStoragePath);
        }
        characters.push({
          name: character.name.trim(),
          playerName: character.playerName.trim(),
          iacharaUrl: character.iacharaUrl.trim(),
          ho: character.ho.trim(),
          memo: character.memo.trim(),
          portraitStoragePath,
        });
      }
      sessions.push({ name: session.name.trim(), role: session.role, characters });
    }
    return { success: true as const, sessions, uploadedPaths };
  }

  async function removeUnusedPortraits(finalPaths: Set<string>) {
    const stalePaths = [...originalPortraitPaths.current].filter((path) => !finalPaths.has(path));
    for (const path of stalePaths) {
      const result = await scenarioImageService.removeStorageObject(path);
      if (!result.success) return result.error.message;
    }
    return null;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateForm(state);
    if (validation) {
      setMessage(validation);
      return;
    }
    setSaving(true);
    setMessage(null);
    const command = formToCreateCommand(state, user.id);
    let targetId = scenarioId;
    if (mode === "create") {
      const created = await scenarioService.createScenario(command);
      if (!created.success) {
        setSaving(false);
        setMessage(created.error.message);
        return;
      }
      targetId = created.data;
    }
    if (!targetId) {
      setSaving(false);
      setMessage("シナリオIDを取得できませんでした。");
      return;
    }
    const preparedSessions = await prepareSessions(targetId);
    if (!preparedSessions.success) {
      if (mode === "create") await scenarioService.deleteScenario(targetId);
      setSaving(false);
      setMessage(preparedSessions.error.message);
      return;
    }
    const episodes =
      state.scenarioType === "campaign"
        ? state.episodes
            .filter(
              (episode) =>
                episode.title.trim() ||
                episode.timeValue.trim() ||
                episode.timeFree.trim() ||
                episode.timeText.trim(),
            )
            .map((episode) => ({
              title: episode.title,
              timeType: episode.timeType === "range" ? "free" : episode.timeType,
              timeFixed:
                episode.timeType === "fixed" && episode.timeUnit === "分"
                  ? numberOrNull(episode.timeValue)
                  : null,
              timeMin: null,
              timeMax: null,
              timeText:
                episode.timeType === "free"
                  ? episode.timeFree || episode.timeText
                  : `${episode.timeValue}${episode.timeUnit}`,
              summary: episode.summary,
              status: episode.status,
              playDate: episode.playDate || null,
            }))
        : [];
    const aggregate = await scenarioService.saveScenarioAggregate({
      scenarioId: targetId,
      scenario: command,
      userData: {
        kpCompleted: state.kpCompleted,
        playCompleted: state.playCompleted,
        purchaseUrl: state.purchaseUrl,
        memo: state.memo,
        kpMemo: state.kpMemo,
        plMemo: state.plMemo,
      },
      episodes,
      handouts: state.handouts,
      sessions: preparedSessions.sessions,
    });
    if (!aggregate.success) {
      await Promise.all(
        preparedSessions.uploadedPaths.map((path) =>
          scenarioImageService.removeStorageObject(path),
        ),
      );
      if (mode === "create") await scenarioService.deleteScenario(targetId);
      setSaving(false);
      setMessage(aggregate.error.message);
      return;
    }
    const imageResult = await saveImages(targetId);
    if (imageResult.error) {
      await Promise.all(
        imageResult.uploaded.map((image) =>
          scenarioImageService.delete(targetId, image.id, image.storagePath),
        ),
      );
      await Promise.all(
        preparedSessions.uploadedPaths.map((path) =>
          scenarioImageService.removeStorageObject(path),
        ),
      );
      if (mode === "create") await scenarioService.deleteScenario(targetId);
      setSaving(false);
      setMessage(imageResult.error);
      return;
    }
    const finalPortraitPaths = new Set(
      preparedSessions.sessions.flatMap((session) =>
        session.characters.flatMap((character) =>
          character.portraitStoragePath ? [character.portraitStoragePath] : [],
        ),
      ),
    );
    const portraitError = await removeUnusedPortraits(finalPortraitPaths);
    if (portraitError) {
      setSaving(false);
      setMessage(portraitError);
      return;
    }
    if (draftId) await scenarioDraftService.remove(user.id, draftId);
    setSaving(false);
    navigate(`/scenarios/${targetId}`);
  }

  if (loading)
    return (
      <AppLayout>
        <section className="panel">
          <p className="muted" role="status" aria-live="polite">
            読み込み中…
          </p>
        </section>
      </AppLayout>
    );

  const update =
    <K extends keyof ScenarioFormState>(key: K) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      patch(key, event.target.value as ScenarioFormState[K]);

  function handleNavigation(event: MouseEvent<HTMLAnchorElement>, destination: string) {
    if (!hasUnsavedChanges) return;
    event.preventDefault();
    setPendingNavigation(destination);
  }

  function guardLayoutNavigation(destination: string) {
    if (!hasUnsavedChanges) return true;
    setPendingNavigation(destination);
    return false;
  }

  return (
    <AppLayout navigationGuard={guardLayoutNavigation}>
      <section className="panel scenario-form-page">
        <div className="edit-header">
          <Link
            className="back-link"
            to={mode === "edit" ? `/scenarios/${scenarioId}` : "/scenarios"}
            onClick={(event) =>
              handleNavigation(event, mode === "edit" ? `/scenarios/${scenarioId}` : "/scenarios")
            }
          >
            ← 戻る
          </Link>
          <h1 className="page-title">{mode === "create" ? "シナリオ登録" : "シナリオを編集"}</h1>
          <p className="page-subtitle">タイトル以外の項目は必要なものだけ入力できます。</p>
        </div>
        <form
          className="profile-form scenario-form edit-form"
          onSubmit={(event) => void submit(event)}
        >
          {drafts.length ? (
            <section className="section-card draft-tools">
              <h2 className="section-heading">下書き</h2>
              <div className="action-row">
                <select
                  value={selectedDraftId}
                  onChange={(event) => setSelectedDraftId(event.target.value)}
                >
                  <option value="">保存済みの下書きから再開</option>
                  {drafts.map((draft) => (
                    <option value={draft.id} key={draft.id}>
                      {draft.title || "無題"}（{new Date(draft.updatedAt).toLocaleString("ja-JP")}）
                    </option>
                  ))}
                </select>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => activeDraft && loadDraft(activeDraft)}
                  disabled={!activeDraft || saving}
                >
                  下書きを開く
                </button>
                <button
                  className="danger-button"
                  type="button"
                  onClick={() => setConfirm("draft")}
                  disabled={!activeDraft || saving}
                >
                  削除
                </button>
              </div>
            </section>
          ) : null}
          <section className={sectionClass}>
            <h2 className="section-heading">基本情報</h2>
            <div className="form-grid">
              <div className="form-column">
                <label htmlFor="scenario-title">タイトル *</label>
                <input
                  id="scenario-title"
                  value={state.title}
                  onChange={update("title")}
                  placeholder="シナリオのタイトルを入力"
                  required
                />
                <TextField
                  label="タイトルの読み方"
                  value={state.titleReading}
                  onChange={update("titleReading")}
                  placeholder="例：しなりおのたいとる"
                />
                <label htmlFor="scenario-system">TRPGシステム *</label>
                <select id="scenario-system" value={state.system} onChange={update("system")}>
                  <option value="">選択してください</option>
                  {state.system && !SYSTEMS.includes(state.system as (typeof SYSTEMS)[number]) ? (
                    <option value={state.system}>{state.system}（既存値）</option>
                  ) : null}
                  {SYSTEMS.map((system) => (
                    <option value={system} key={system}>
                      {system}
                    </option>
                  ))}
                </select>
                <label htmlFor="scenario-author">作者名</label>
                <input id="scenario-author" value={state.author} onChange={update("author")} />
                <TextField
                  label="作者名の読み方"
                  value={state.authorReading}
                  onChange={update("authorReading")}
                  placeholder="例：やまだ たろう"
                />
                <TextField
                  label="舞台"
                  value={state.stage}
                  onChange={update("stage")}
                  placeholder="例：現代日本、都市、クローズドシナリオなど"
                />
                <ScenarioTypeField
                  value={state.scenarioType}
                  onChange={(value) => patch("scenarioType", value)}
                />
              </div>
              <div className="form-column">
                <ChoiceField
                  label="人数形式"
                  value={state.playerCountType}
                  onChange={(value) => patch("playerCountType", value)}
                  options={[
                    ["fixed", "固定人数"],
                    ["range", "範囲指定"],
                    ["free", "自由入力"],
                  ]}
                />
                {state.playerCountType === "fixed" ? (
                  <SelectField
                    label="固定人数"
                    value={state.playerCountFixed}
                    onChange={update("playerCountFixed")}
                    options={[
                      ["1", "1人"],
                      ["2", "2人"],
                      ["3", "3人"],
                      ["4", "4人"],
                      ["5", "5人"],
                      ["6以上", "6人以上"],
                    ]}
                  />
                ) : null}
                {state.playerCountType === "range" ? (
                  <div className="split-fields">
                    <SelectField
                      label="最小人数"
                      value={state.playerCountMin}
                      onChange={update("playerCountMin")}
                      options={[
                        ["1", "1人"],
                        ["2", "2人"],
                        ["3", "3人"],
                        ["4", "4人"],
                        ["5", "5人"],
                      ]}
                    />
                    <SelectField
                      label="最大人数"
                      value={state.playerCountMax}
                      onChange={update("playerCountMax")}
                      options={[
                        ["1", "1人"],
                        ["2", "2人"],
                        ["3", "3人"],
                        ["4", "4人"],
                        ["5", "5人"],
                        ["6", "6人"],
                        ["7", "7人"],
                        ["8", "8人"],
                        ["9", "9人"],
                        ["10", "10人"],
                        ["11", "11人"],
                        ["12", "12人"],
                        ["13", "13人"],
                        ["14", "14人"],
                        ["15", "15人"],
                        ["KP管理できる人数", "KP管理できる人数"],
                      ]}
                    />
                  </div>
                ) : null}
                {state.playerCountType === "free" ? (
                  <TextField
                    label="人数自由入力"
                    value={state.playerCountText}
                    onChange={update("playerCountText")}
                    placeholder="例：1〜4人程度"
                  />
                ) : null}
                <p className="helper">人数形式に応じて、使用する項目を入力してください。</p>
              </div>
              <div className="form-column">
                <ChoiceField
                  label="時間形式"
                  value={state.playTimeType}
                  onChange={(value) => patch("playTimeType", value)}
                  options={[
                    ["fixed", "固定時間"],
                    ["range", "範囲指定"],
                    ["free", "自由入力"],
                  ]}
                />
                {state.playTimeType === "fixed" ? (
                  <TimeInputField
                    label="固定時間"
                    value={state.playTimeFixed}
                    unit={state.playTimeFixedUnit}
                    onValueChange={update("playTimeFixed")}
                    onUnitChange={(event) =>
                      patch("playTimeFixedUnit", event.target.value as "分" | "時間")
                    }
                    placeholder="例：約3時間"
                  />
                ) : null}
                {state.playTimeType === "range" ? (
                  <div className="split-fields">
                    <TimeInputField
                      label="最短時間"
                      value={state.playTimeMin}
                      unit={state.playTimeMinUnit}
                      onValueChange={update("playTimeMin")}
                      onUnitChange={(event) =>
                        patch("playTimeMinUnit", event.target.value as "分" | "時間")
                      }
                      placeholder="例：約2時間"
                    />
                    <TimeInputField
                      label="最長時間"
                      value={state.playTimeMax}
                      unit={state.playTimeMaxUnit}
                      onValueChange={update("playTimeMax")}
                      onUnitChange={(event) =>
                        patch("playTimeMaxUnit", event.target.value as "分" | "時間")
                      }
                      placeholder="例：約4時間"
                    />
                  </div>
                ) : null}
                {state.playTimeType === "free" ? (
                  <TextField
                    label="時間自由入力"
                    value={state.playTimeText}
                    onChange={update("playTimeText")}
                    placeholder="例：約3〜4時間"
                  />
                ) : null}
                <p className="helper">時間形式に応じて、使用する項目を入力してください。</p>
              </div>
            </div>
          </section>

          <CampaignFields
            scenarioType={state.scenarioType}
            episodes={state.episodes}
            onChange={(episodes) => patch("episodes", episodes)}
          />

          <section className={sectionClass}>
            <h2 className="section-heading">内容・傾向</h2>
            <div className="form-grid">
              <div className="form-column">
                <TextAreaField
                  className="compact-skill-field"
                  label="推奨技能"
                  value={state.recommendedSkills}
                  onChange={update("recommendedSkills")}
                />
                <TextAreaField
                  className="compact-skill-field"
                  label="準推奨技能"
                  value={state.secondarySkills}
                  onChange={update("secondarySkills")}
                />
                <TextAreaField
                  label="非推奨・注意技能"
                  value={state.notRecommended}
                  onChange={update("notRecommended")}
                />
              </div>
              <div className="form-column">
                <SelectField
                  label="ロスト率"
                  value={state.lostRate}
                  onChange={update("lostRate")}
                  options={[
                    ["none", "なし"],
                    ["low", "低"],
                    ["medium", "中"],
                    ["high", "高"],
                    ["very_high", "極高"],
                    ["unknown", "不明"],
                  ]}
                />
                <TextAreaField
                  label="ロスト率補足"
                  value={state.lostRateNote}
                  onChange={update("lostRateNote")}
                />
                <SelectField
                  label="HO形式"
                  value={state.hoType}
                  onChange={update("hoType")}
                  options={[
                    ["none", "なし"],
                    ["common", "共通HO"],
                    ["individual", "個別HO"],
                    ["secret", "秘匿HOあり"],
                    ["common_individual", "共通＋個別HO"],
                    ["special", "特殊"],
                  ]}
                />
                <HandoutFields
                  handouts={state.handouts}
                  onChange={(handouts) => patch("handouts", handouts)}
                />
              </div>
              <div className="form-column">
                <SelectField
                  label="戦闘"
                  value={state.battle}
                  onChange={update("battle")}
                  options={[
                    ["yes", "あり"],
                    ["no", "なし"],
                    ["conditional", "場合による"],
                  ]}
                />
                <TextAreaField
                  label="注意事項"
                  value={state.cautions}
                  onChange={update("cautions")}
                />
                <div role="group" aria-labelledby={`${tagGroupId}-label`}>
                  <span id={`${tagGroupId}-label`} className="field-label">
                    タグ
                  </span>
                  <div className="check-grid tag-grid">
                    {TAGS.map((tag) => (
                      <label className="check-label" key={tag}>
                        <input
                          type="checkbox"
                          checked={state.scenarioTags.includes(tag)}
                          onChange={() =>
                            patch(
                              "scenarioTags",
                              state.scenarioTags.includes(tag)
                                ? state.scenarioTags.filter((current) => current !== tag)
                                : [...state.scenarioTags, tag],
                            )
                          }
                        />
                        {tag}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <TrailerFields
            trailerText={state.trailerText}
            onTrailerTextChange={update("trailerText")}
            images={state.images}
            onAdd={addImage}
            onDrop={(files) => addImageFiles(files)}
            onMove={moveImage}
            onPositionChange={updateImagePosition}
            onRemove={(index) => {
              setPendingImageIndex(index);
              setConfirm("image");
            }}
          />
          <section className={sectionClass}>
            <h2 className="section-heading">シナリオ管理</h2>
            <div className="form-grid">
              <div className="form-column">
                <TextField
                  label="購入・配布URL"
                  value={state.purchaseUrl}
                  onChange={update("purchaseUrl")}
                  type="url"
                  placeholder="https://example.com"
                />
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={state.kpCompleted}
                    onChange={(event) => patch("kpCompleted", event.target.checked)}
                  />
                  KP
                </label>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={state.playCompleted}
                    onChange={(event) => patch("playCompleted", event.target.checked)}
                  />
                  PL
                </label>
              </div>
              <div className="form-column">
                <TextAreaField
                  label="KPメモ"
                  value={state.kpMemo || state.memo}
                  onChange={update("kpMemo")}
                  placeholder="KP用のメモを入力してください。"
                />
              </div>
              <div className="form-column">
                <p className="helper">登録日・更新日は保存時に自動管理されます。</p>
              </div>
            </div>
          </section>
          <SessionFields
            sessions={state.sessions}
            onChange={(sessions) => patch("sessions", sessions)}
            onMessage={setMessage}
          />

          {message ? (
            <p
              className="status-message"
              role={message.includes("失敗") || message.includes("エラー") ? "alert" : "status"}
              aria-live="polite"
            >
              {message}
            </p>
          ) : null}
          <div className="action-row form-submit-row">
            <button
              className="secondary-button"
              type="button"
              onClick={() => void saveDraft()}
              disabled={saving}
            >
              下書き保存
            </button>
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? "保存中…" : mode === "create" ? "登録する" : "変更を保存"}
            </button>
            <Link
              className="secondary-button"
              to={mode === "edit" ? `/scenarios/${scenarioId}` : "/scenarios"}
              onClick={(event) =>
                handleNavigation(event, mode === "edit" ? `/scenarios/${scenarioId}` : "/scenarios")
              }
            >
              キャンセル
            </Link>
          </div>
        </form>
        <ConfirmDialog
          open={confirm === "draft"}
          title="下書きを削除"
          message="この下書きを削除します。よろしいですか？"
          confirmLabel="削除する"
          busy={saving}
          onCancel={() => setConfirm(null)}
          onConfirm={() => void removeDraft()}
        />
        <ConfirmDialog
          open={confirm === "image"}
          title="画像を削除"
          message="フォームからこの画像を外します。通常保存前なら元データは変更されません。"
          confirmLabel="外す"
          danger={false}
          onCancel={() => setConfirm(null)}
          onConfirm={removeImage}
        />
        <ConfirmDialog
          open={pendingNavigation !== null}
          title="入力内容を破棄しますか？"
          message="保存していない入力内容があります。この画面を離れると失われます。"
          confirmLabel="移動する"
          danger={false}
          onCancel={() => setPendingNavigation(null)}
          onConfirm={() => {
            if (pendingNavigation) navigate(pendingNavigation);
            setPendingNavigation(null);
          }}
        />
      </section>
    </AppLayout>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  type?: "text" | "url" | "date";
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} type={type} value={value} onChange={onChange} placeholder={placeholder} />
    </div>
  );
}
function TextAreaField({
  label,
  value,
  onChange,
  className,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  className?: string;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className={`field${className ? ` ${className}` : ""}`}>
      <label htmlFor={id}>{label}</label>
      <textarea id={id} value={value} onChange={onChange} placeholder={placeholder} />
    </div>
  );
}
function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  options: readonly (readonly [string, string])[];
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={onChange}>
        {options.map(([option, text]) => (
          <option value={option} key={option}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );
}
function ChoiceField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: CountType | TimeType;
  onChange: (value: CountType & TimeType) => void;
  options: readonly (readonly [CountType & TimeType, string])[];
}) {
  const groupId = useId();
  return (
    <div className="field" role="group" aria-labelledby={`${groupId}-label`}>
      <span id={`${groupId}-label`} className="field-label">
        {label}
      </span>
      <div className="radio-group">
        {options.map(([option, text]) => {
          const id = `${groupId}-${option}`;
          return (
            <label className="radio-label" htmlFor={id} key={option}>
              <input
                id={id}
                name={groupId}
                type="radio"
                checked={value === option}
                onChange={() => onChange(option)}
              />
              {text}
            </label>
          );
        })}
      </div>
    </div>
  );
}

function ScenarioTypeField({
  value,
  onChange,
}: {
  value: ScenarioFormState["scenarioType"];
  onChange: (value: ScenarioFormState["scenarioType"]) => void;
}) {
  const groupId = useId();
  return (
    <div className="field scenario-type-field" role="group" aria-labelledby={`${groupId}-label`}>
      <span id={`${groupId}-label`} className="field-label">
        形式
      </span>
      <div className="radio-group scenario-type-tabs">
        {(
          [
            ["normal", "通常"],
            ["campaign", "キャンペーン"],
            ["kpLess", "KPレス"],
          ] as const
        ).map(([option, label]) => {
          const id = `${groupId}-${option}`;
          return (
            <label className="radio-label" htmlFor={id} key={option}>
              <input
                id={id}
                type="radio"
                name={groupId}
                checked={value === option}
                onChange={() => onChange(option)}
              />
              {label}
            </label>
          );
        })}
      </div>
    </div>
  );
}

function TimeInputField({
  label,
  value,
  unit,
  onValueChange,
  onUnitChange,
  placeholder,
}: {
  label: string;
  value: string;
  unit: "分" | "時間";
  onValueChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onUnitChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  placeholder: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="time-input">
        <input
          id={id}
          type="number"
          min="0"
          step="any"
          value={value}
          onChange={onValueChange}
          placeholder={placeholder}
        />
        <select value={unit} onChange={onUnitChange} aria-label={`${label}の単位`}>
          <option value="分">分</option>
          <option value="時間">時間</option>
        </select>
      </div>
    </div>
  );
}

function CampaignFields({
  scenarioType,
  episodes,
  onChange,
}: {
  scenarioType: ScenarioFormState["scenarioType"];
  episodes: EpisodeDraft[];
  onChange: (episodes: EpisodeDraft[]) => void;
}) {
  const update = (index: number, changes: Partial<EpisodeDraft>) =>
    onChange(
      episodes.map((episode, episodeIndex) =>
        episodeIndex === index ? { ...episode, ...changes } : episode,
      ),
    );
  return (
    <section className={`${sectionClass} campaign-fields`}>
      {scenarioType === "campaign" ? (
        <>
          <div className="section-heading-row">
            <h2 className="section-heading">キャンペーン各話</h2>
            <button
              className="secondary-button"
              type="button"
              onClick={() => onChange([...episodes, blankEpisode()])}
            >
              ＋ 話を追加
            </button>
          </div>
          {episodes.map((episode, index) => (
            <article className="nested-card" key={episode.clientId}>
              <div className="section-heading-row">
                <h3>{index + 1}話目</h3>
                {episodes.length > 1 ? (
                  <button
                    className="danger-button"
                    type="button"
                    aria-label={`${index + 1}話目を削除`}
                    onClick={() =>
                      onChange(episodes.filter((_, episodeIndex) => episodeIndex !== index))
                    }
                  >
                    削除
                  </button>
                ) : null}
              </div>
              <div className="form-grid">
                <div className="form-column">
                  <TextField
                    label="話タイトル"
                    value={episode.title}
                    onChange={(event) => update(index, { title: event.target.value })}
                    placeholder="話のタイトル"
                  />
                  <TextAreaField
                    className="episode-summary-field"
                    label="概要"
                    value={episode.summary}
                    onChange={(event) => update(index, { summary: event.target.value })}
                    placeholder="この話の概要"
                  />
                </div>
                <div className="form-column">
                  <ChoiceField
                    label="時間形式"
                    value={episode.timeType}
                    onChange={(value) => update(index, { timeType: value })}
                    options={[
                      ["fixed", "固定"],
                      ["range", "範囲"],
                      ["free", "自由入力"],
                    ]}
                  />
                  {episode.timeType === "fixed" || episode.timeType === "range" ? (
                    <TimeInputField
                      label="時間"
                      value={episode.timeValue}
                      unit={episode.timeUnit}
                      onValueChange={(event) =>
                        update(index, {
                          timeValue: event.target.value,
                          timeFixed: event.target.value,
                        })
                      }
                      onUnitChange={(event) =>
                        update(index, { timeUnit: event.target.value as "分" | "時間" })
                      }
                      placeholder="数値"
                    />
                  ) : null}
                  {episode.timeType === "free" ? (
                    <TextField
                      label="時間自由入力"
                      value={episode.timeFree}
                      onChange={(event) =>
                        update(index, {
                          timeFree: event.target.value,
                          timeText: event.target.value,
                        })
                      }
                      placeholder="例：約2〜3時間"
                    />
                  ) : null}
                </div>
                <div className="form-column">
                  <TextField
                    label="実施日"
                    value={episode.playDate}
                    onChange={(event) => update(index, { playDate: event.target.value })}
                    type="date"
                  />
                  <div className="episode-status-field">
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={episode.status === "completed"}
                        onChange={(event) =>
                          update(index, {
                            status: event.target.checked ? "completed" : "not_started",
                          })
                        }
                      />
                      完了
                    </label>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </>
      ) : null}
    </section>
  );
}

function HandoutFields({
  handouts,
  onChange,
}: {
  handouts: HandoutDraft[];
  onChange: (handouts: HandoutDraft[]) => void;
}) {
  return (
    <div className="nested-list">
      <div className="section-heading-row">
        <h3>HO・ハンドアウト</h3>
        <button
          className="secondary-button"
          type="button"
          onClick={() => onChange([...handouts, blankHandout()])}
        >
          ＋ 追加
        </button>
      </div>
      {handouts.map((handout, index) => (
        <div className="nested-card" key={handout.clientId}>
          <div className="action-row">
            <TextField
              label="Ho"
              value={handout.label}
              onChange={(event) =>
                onChange(
                  handouts.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, label: event.target.value } : item,
                  ),
                )
              }
            />
            {handouts.length > 1 ? (
              <button
                className="danger-button"
                type="button"
                aria-label={`HO・ハンドアウト${index + 1}を削除`}
                onClick={() => onChange(handouts.filter((_, itemIndex) => itemIndex !== index))}
              >
                削除
              </button>
            ) : null}
          </div>
          <TextAreaField
            label="内容"
            value={handout.content}
            onChange={(event) =>
              onChange(
                handouts.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, content: event.target.value } : item,
                ),
              )
            }
          />
        </div>
      ))}
    </div>
  );
}

function TrailerFields({
  trailerText,
  onTrailerTextChange,
  images,
  onAdd,
  onDrop,
  onMove,
  onPositionChange,
  onRemove,
}: {
  trailerText: string;
  onTrailerTextChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  images: FormImageDraft[];
  onAdd: (event: ChangeEvent<HTMLInputElement>) => void;
  onDrop: (files: File[]) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onPositionChange: (
    index: number,
    position: Pick<FormImageDraft, "positionX" | "positionY" | "zoom">,
  ) => void;
  onRemove: (index: number) => void;
}) {
  const drag = useRef<{
    index: number;
    pointerId: number;
    startX: number;
    startY: number;
    positionX: number;
    positionY: number;
  } | null>(null);
  const imageStyle = (image: FormImageDraft) => ({
    objectPosition: `${image.positionX}% ${image.positionY}%`,
    transform: `translate(${(50 - image.positionX) * (image.zoom - 1)}%, ${(50 - image.positionY) * (image.zoom - 1)}%) scale(${image.zoom})`,
    transformOrigin: "center",
  });
  const beginDrag = (event: PointerEvent<HTMLImageElement>, index: number) => {
    if (images[index].zoom <= 1) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      index,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      positionX: images[index].positionX,
      positionY: images[index].positionY,
    };
  };
  const moveDrag = (event: PointerEvent<HTMLImageElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const viewport = event.currentTarget.parentElement;
    if (!viewport) return;
    onPositionChange(current.index, {
      positionX: Math.max(
        0,
        Math.min(
          100,
          current.positionX - ((event.clientX - current.startX) / viewport.clientWidth) * 100,
        ),
      ),
      positionY: Math.max(
        0,
        Math.min(
          100,
          current.positionY - ((event.clientY - current.startY) / viewport.clientHeight) * 100,
        ),
      ),
      zoom: images[current.index].zoom,
    });
  };
  const zoomImage = (event: WheelEvent<HTMLImageElement>, index: number) => {
    event.preventDefault();
    const image = images[index];
    onPositionChange(index, {
      positionX: image.positionX,
      positionY: image.positionY,
      zoom: Math.max(1, Math.min(3, image.zoom + (event.deltaY < 0 ? 0.1 : -0.1))),
    });
  };
  return (
    <section className={sectionClass}>
      <h2 className="section-heading">トレーラー</h2>
      <div className="trailer-layout">
        <div>
          <TextAreaField
            label="トレーラー"
            value={trailerText}
            onChange={onTrailerTextChange}
            placeholder="シナリオのトレーラー・紹介文を入力してください。"
          />
        </div>
        <div>
          <div className="field">
            <label>トレーラー画像（複数枚可）</label>
            <div
              className="image-upload-drop"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                onDrop(Array.from(event.dataTransfer.files));
              }}
            >
              <span className="image-upload-icon">▧</span>
              <span>
                画像をドラッグ＆ドロップ
                <br />
                または
              </span>
              <label className="image-upload-action">
                ファイルを選択
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  onChange={onAdd}
                />
              </label>
            </div>
          </div>
          <p className="image-preview-helper">
            画像をドラッグして表示範囲を調整できます。ホイールまたはピンチでズームできます。
          </p>
          <div className="image-draft-grid">
            {images.map((image, index) => (
              <figure
                className="image-draft"
                key={image.id ?? image.previewUrl ?? `image-${index}`}
              >
                <div className="image-preview-viewport">
                  <img
                    className="image-preview-image"
                    src={image.previewUrl ?? image.signedUrl ?? ""}
                    alt={`選択したトレーラー画像 ${index + 1}`}
                    style={imageStyle(image)}
                    onPointerDown={(event) => beginDrag(event, index)}
                    onPointerMove={moveDrag}
                    onPointerUp={() => {
                      drag.current = null;
                    }}
                    onPointerCancel={() => {
                      drag.current = null;
                    }}
                    onWheel={(event) => zoomImage(event, index)}
                  />
                  <span className="image-zoom-label">{image.zoom.toFixed(1)}x</span>
                </div>
                <figcaption>
                  <span>
                    画像 {index + 1}
                    {image.file ? "（未保存）" : ""}
                  </span>
                  <div className="action-row">
                    <button
                      className="text-button"
                      type="button"
                      aria-label={`画像${index + 1}を前へ移動`}
                      onClick={() => onMove(index, -1)}
                      disabled={index === 0}
                    >
                      ←
                    </button>
                    <button
                      className="text-button"
                      type="button"
                      aria-label={`画像${index + 1}を後へ移動`}
                      onClick={() => onMove(index, 1)}
                      disabled={index === images.length - 1}
                    >
                      →
                    </button>
                    <button className="danger-button" type="button" onClick={() => onRemove(index)}>
                      画像{index + 1}を外す
                    </button>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function SessionFields({
  sessions,
  onChange,
  onMessage,
}: {
  sessions: SessionDraft[];
  onChange: (sessions: SessionDraft[]) => void;
  onMessage: (message: string) => void;
}) {
  const update = (index: number, changes: Partial<SessionDraft>) =>
    onChange(
      sessions.map((session, sessionIndex) =>
        sessionIndex === index ? { ...session, ...changes } : session,
      ),
    );

  function updateCharacter(
    sessionIndex: number,
    characterIndex: number,
    changes: Partial<SessionDraft["characters"][number]>,
  ) {
    update(sessionIndex, {
      characters: sessions[sessionIndex].characters.map((character, index) =>
        index === characterIndex ? { ...character, ...changes } : character,
      ),
    });
  }

  function addPortrait(
    event: ChangeEvent<HTMLInputElement>,
    sessionIndex: number,
    characterIndex: number,
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      onMessage("PNG・JPEG・WebP形式の画像を選択してください。");
      return;
    }
    const previous = sessions[sessionIndex].characters[characterIndex].portrait;
    if (previous?.previewUrl) URL.revokeObjectURL(previous.previewUrl);
    updateCharacter(sessionIndex, characterIndex, {
      portrait: {
        id: null,
        storagePath: null,
        signedUrl: null,
        file,
        previewUrl: URL.createObjectURL(file),
        positionX: 50,
        positionY: 50,
        zoom: 1,
      },
    });
  }

  function removePortrait(sessionIndex: number, characterIndex: number) {
    const previous = sessions[sessionIndex].characters[characterIndex].portrait;
    if (previous?.previewUrl) URL.revokeObjectURL(previous.previewUrl);
    updateCharacter(sessionIndex, characterIndex, { portrait: null });
  }

  return (
    <section className={sectionClass}>
      <div className="section-heading-row">
        <h2 className="section-heading">参加記録</h2>
        <button
          className="secondary-button"
          type="button"
          onClick={() => onChange([...sessions, blankSession()])}
        >
          ＋ 記録を追加
        </button>
      </div>
      {sessions.map((session, sessionIndex) => (
        <article className="nested-card" key={session.clientId}>
          <div className="section-heading-row">
            <h3>参加記録</h3>
            <button
              className="danger-button"
              type="button"
              aria-label={`参加記録${sessionIndex + 1}を削除`}
              onClick={() => onChange(sessions.filter((_, index) => index !== sessionIndex))}
            >
              削除
            </button>
          </div>
          <div className="form-grid">
            <div className="form-column">
              <TextField
                label="陣の名前"
                value={session.name}
                onChange={(event) => update(sessionIndex, { name: event.target.value })}
                placeholder="例：1陣"
              />
              <SelectField
                label="役割"
                value={session.role}
                onChange={(event) =>
                  update(sessionIndex, { role: event.target.value as SessionDraft["role"] })
                }
                options={[
                  ["PL", "PL"],
                  ["KP", "KP"],
                ]}
              />
            </div>
            <div className="form-column">
              <p className="muted">キャラクター</p>
              <button
                className="secondary-button"
                type="button"
                onClick={() =>
                  update(sessionIndex, { characters: [...session.characters, blankCharacter()] })
                }
              >
                ＋ PCを追加
              </button>
              {session.characters.map((character, characterIndex) => (
                <div className="nested-card" key={character.clientId}>
                  <div className="action-row">
                    <TextField
                      label="PC名"
                      value={character.name}
                      onChange={(event) =>
                        updateCharacter(sessionIndex, characterIndex, { name: event.target.value })
                      }
                    />
                    <button
                      className="danger-button"
                      type="button"
                      aria-label={`${character.name || `PC${characterIndex + 1}`}を削除`}
                      onClick={() =>
                        update(sessionIndex, {
                          characters: session.characters.filter(
                            (_, index) => index !== characterIndex,
                          ),
                        })
                      }
                    >
                      削除
                    </button>
                  </div>
                  <TextField
                    label="PL名"
                    value={character.playerName}
                    onChange={(event) =>
                      updateCharacter(sessionIndex, characterIndex, {
                        playerName: event.target.value,
                      })
                    }
                  />
                  <TextField
                    label="HO"
                    value={character.ho}
                    onChange={(event) =>
                      updateCharacter(sessionIndex, characterIndex, { ho: event.target.value })
                    }
                  />
                  <TextField
                    label="いあきゃらURL"
                    value={character.iacharaUrl}
                    onChange={(event) =>
                      updateCharacter(sessionIndex, characterIndex, {
                        iacharaUrl: event.target.value,
                      })
                    }
                    type="url"
                  />
                  <div className="portrait-field">
                    <span className="field-label">PC立ち絵</span>
                    {character.portrait?.previewUrl || character.portrait?.signedUrl ? (
                      <img
                        className="portrait-preview"
                        src={character.portrait.previewUrl ?? character.portrait.signedUrl ?? ""}
                        alt={`${character.name || "PC"}の立ち絵`}
                      />
                    ) : (
                      <div className="portrait-placeholder">立ち絵未設定</div>
                    )}
                    <div className="action-row">
                      <label className="secondary-button file-button">
                        立ち絵を選択
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={(event) => addPortrait(event, sessionIndex, characterIndex)}
                        />
                      </label>
                      {character.portrait ? (
                        <button
                          className="danger-button"
                          type="button"
                          aria-label={`${character.name || `PC${characterIndex + 1}`}の立ち絵を外す`}
                          onClick={() => removePortrait(sessionIndex, characterIndex)}
                        >
                          外す
                        </button>
                      ) : null}
                    </div>
                    {character.portrait?.file ? (
                      <p className="muted">保存時にWebPへ変換してアップロードします。</p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}
