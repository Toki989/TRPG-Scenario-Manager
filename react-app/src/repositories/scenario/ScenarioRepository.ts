import { supabase } from "../../lib/supabase/client";
import type { ScenarioSummary } from "../../domain/models/Scenario";
import type { ScenarioDetail } from "../../domain/models/ScenarioDetail";
import type {
  CreateScenarioCommand,
  ScenarioAggregateInput,
} from "../../domain/commands/CreateScenarioCommand";
import type { UpdateScenarioCommand } from "../../domain/commands/UpdateScenarioCommand";
import type { Database } from "../../lib/supabase/database.types";
import type {
  BackupRestoreProgress,
  ScenarioBackupRecord,
} from "../../domain/backup/BackupPayload";
import type { RepositoryResult } from "../common/types";
import { mapScenarioDetail, mapScenarioSummary } from "./ScenarioMapper";

function unavailable(): RepositoryResult<never> {
  return {
    success: false,
    error: { type: "database", message: "Supabaseの環境変数が設定されていません。" },
  };
}

export class ScenarioRepository {
  async saveScenarioAggregate(input: ScenarioAggregateInput): Promise<RepositoryResult<string>> {
    if (!supabase) return unavailable();
    const { data, error } = await supabase.rpc("save_scenario_aggregate", {
      p_scenario_id: input.scenarioId,
      p_scenario: {
        title: input.scenario.title,
        titleReading: input.scenario.titleReading ?? "",
        system: input.scenario.system ?? "",
        scenarioType: input.scenario.scenarioType,
        author: input.scenario.author ?? "",
        authorReading: input.scenario.authorReading ?? "",
        stage: input.scenario.stage ?? "",
        playerCountType: input.scenario.playerCount.type,
        playerCountFixed:
          input.scenario.playerCount.type === "fixed" ? input.scenario.playerCount.value : null,
        playerCountMin:
          input.scenario.playerCount.type === "range" ? input.scenario.playerCount.min : null,
        playerCountMax:
          input.scenario.playerCount.type === "range" ? input.scenario.playerCount.max : null,
        playerCountText:
          input.scenario.playerCount.type === "free" ? input.scenario.playerCount.text : null,
        playTimeType: input.scenario.playTime.type,
        playTimeFixed:
          input.scenario.playTime.type === "fixed" ? input.scenario.playTime.value : null,
        playTimeMin: input.scenario.playTime.type === "range" ? input.scenario.playTime.min : null,
        playTimeMax: input.scenario.playTime.type === "range" ? input.scenario.playTime.max : null,
        playTimeText: input.scenario.playTime.type === "free" ? input.scenario.playTime.text : null,
        recommendedSkills: input.scenario.recommendedSkills ?? "",
        secondarySkills: input.scenario.secondarySkills ?? "",
        notRecommended: input.scenario.notRecommended ?? "",
        lostRate: input.scenario.lostRate ?? "unknown",
        lostRateNote: input.scenario.lostRateNote ?? "",
        hoType: input.scenario.hoType ?? "none",
        scenarioTags: input.scenario.scenarioTags ?? [],
        battle: input.scenario.battle ?? "no",
        cautions: input.scenario.cautions ?? "",
        trailerText: input.scenario.trailerText ?? "",
        legacyRegistration: input.scenario.legacyRegistration ?? {},
      },
      p_user_data: {
        favorite: input.userData.favorite ?? false,
        kpCompleted: input.userData.kpCompleted,
        playCompleted: input.userData.playCompleted,
        purchaseUrl: input.userData.purchaseUrl ?? "",
        memo: input.userData.memo ?? "",
        kpMemo: input.userData.kpMemo ?? "",
        plMemo: input.userData.plMemo ?? "",
      },
      p_handouts: input.handouts.map((handout) => ({
        label: handout.label,
        content: handout.content,
      })),
      p_episodes: input.episodes.map((episode) => ({ ...episode })),
      p_sessions: input.sessions.map((session) => ({
        name: session.name,
        role: session.role,
        characters: session.characters.map((character) => ({ ...character })),
      })),
    });
    if (error) {
      return { success: false, error: { type: "database", message: error.message, cause: error } };
    }
    if (!data) {
      return {
        success: false,
        error: { type: "database", message: "保存対象IDを取得できませんでした." },
      };
    }
    const { error: compatibilityError } = await supabase
      .from("scenarios")
      .update({
        title_reading: input.scenario.titleReading?.trim() || null,
        author_reading: input.scenario.authorReading?.trim() || null,
        legacy_registration: input.scenario.legacyRegistration ?? {},
      })
      .eq("id", data);
    if (compatibilityError) {
      return {
        success: false,
        error: { type: "database", message: compatibilityError.message, cause: compatibilityError },
      };
    }
    const { error: memoError } = await supabase
      .from("user_scenario_data")
      .update({
        kp_memo: input.userData.kpMemo?.trim() || null,
        pl_memo: input.userData.plMemo?.trim() || null,
      })
      .eq("scenario_id", data)
      .eq("user_id", input.scenario.ownerId);
    if (memoError) {
      return {
        success: false,
        error: { type: "database", message: memoError.message, cause: memoError },
      };
    }
    return { success: true, data };
  }

  async createScenario(command: CreateScenarioCommand): Promise<RepositoryResult<string>> {
    if (!supabase) return unavailable();
    const currentUser = await getAuthenticatedUserId();
    if (!currentUser.success) return currentUser;
    const { data, error } = await supabase.rpc("create_scenario", {
      p_owner_id: currentUser.data,
      p_title: command.title.trim(),
      p_system: command.system?.trim() ?? "",
      p_scenario_type: command.scenarioType === "kpLess" ? "kp_less" : command.scenarioType,
      p_author: command.author?.trim() ?? "",
      p_player_count_type: command.playerCount.type,
      p_player_count_fixed: command.playerCount.type === "fixed" ? command.playerCount.value : null,
      p_player_count_min: command.playerCount.type === "range" ? command.playerCount.min : null,
      p_player_count_max: command.playerCount.type === "range" ? command.playerCount.max : null,
      p_player_count_text:
        command.playerCount.type === "free" ? command.playerCount.text.trim() || null : null,
      p_play_time_type: command.playTime.type,
      p_play_time_fixed: command.playTime.type === "fixed" ? command.playTime.value : null,
      p_play_time_min: command.playTime.type === "range" ? command.playTime.min : null,
      p_play_time_max: command.playTime.type === "range" ? command.playTime.max : null,
      p_play_time_text:
        command.playTime.type === "free" ? command.playTime.text.trim() || null : null,
    });
    if (error)
      return { success: false, error: { type: "database", message: error.message, cause: error } };
    if (!data)
      return {
        success: false,
        error: { type: "database", message: "シナリオIDを取得できませんでした。" },
      };
    return { success: true, data };
  }

  async createUserScenarioData(scenarioId: string): Promise<RepositoryResult<null>> {
    if (!supabase) return unavailable();
    const currentUser = await getAuthenticatedUserId();
    if (!currentUser.success) return currentUser;
    const { error } = await supabase.from("user_scenario_data").insert({
      user_id: currentUser.data,
      scenario_id: scenarioId,
      favorite: false,
      kp_status: "not_started",
      play_status: "not_started",
    });
    if (error)
      return { success: false, error: { type: "database", message: error.message, cause: error } };
    return { success: true, data: null };
  }

  async updateScenario(
    scenarioId: string,
    command: UpdateScenarioCommand,
  ): Promise<RepositoryResult<null>> {
    if (!supabase) return unavailable();
    const { error } = await supabase
      .from("scenarios")
      .update(toScenarioUpdate(command))
      .eq("id", scenarioId);
    if (error)
      return { success: false, error: { type: "database", message: error.message, cause: error } };
    return { success: true, data: null };
  }

  async deleteScenario(scenarioId: string): Promise<RepositoryResult<null>> {
    if (!supabase) return unavailable();
    const { error } = await supabase.from("scenarios").delete().eq("id", scenarioId);
    if (error)
      return { success: false, error: { type: "database", message: error.message, cause: error } };
    return { success: true, data: null };
  }

  async updateFavorite(
    userId: string,
    scenarioId: string,
    favorite: boolean,
  ): Promise<RepositoryResult<null>> {
    if (!supabase) return unavailable();
    const { error } = await supabase
      .from("user_scenario_data")
      .update({ favorite })
      .eq("user_id", userId)
      .eq("scenario_id", scenarioId);
    if (error)
      return { success: false, error: { type: "database", message: error.message, cause: error } };
    return { success: true, data: null };
  }

  async updateUserScenarioData(
    userId: string,
    scenarioId: string,
    data: {
      kpStatus?: "not_started" | "completed";
      playStatus?: "not_started" | "completed";
      purchaseUrl?: string | null;
      memo?: string | null;
    },
  ): Promise<RepositoryResult<null>> {
    if (!supabase) return unavailable();
    const { error } = await supabase
      .from("user_scenario_data")
      .update({
        kp_status: data.kpStatus,
        play_status: data.playStatus,
        purchase_url: data.purchaseUrl?.trim() || null,
        memo: data.memo?.trim() || null,
      })
      .eq("user_id", userId)
      .eq("scenario_id", scenarioId);
    if (error)
      return { success: false, error: { type: "database", message: error.message, cause: error } };
    return { success: true, data: null };
  }

  async replaceScenarioEpisodes(
    scenarioId: string,
    episodes: Database["public"]["Tables"]["scenario_episodes"]["Insert"][],
  ): Promise<RepositoryResult<null>> {
    if (!supabase) return unavailable();
    const { error: deleteError } = await supabase
      .from("scenario_episodes")
      .delete()
      .eq("scenario_id", scenarioId);
    if (deleteError)
      return {
        success: false,
        error: { type: "database", message: deleteError.message, cause: deleteError },
      };

    if (episodes.length === 0) return { success: true, data: null };

    const { error: insertError } = await supabase.from("scenario_episodes").insert(episodes);
    if (insertError)
      return {
        success: false,
        error: { type: "database", message: insertError.message, cause: insertError },
      };
    return { success: true, data: null };
  }

  async replaceScenarioHandouts(
    scenarioId: string,
    handouts: Database["public"]["Tables"]["scenario_handouts"]["Insert"][],
  ): Promise<RepositoryResult<null>> {
    if (!supabase) return unavailable();
    const { error: deleteError } = await supabase
      .from("scenario_handouts")
      .delete()
      .eq("scenario_id", scenarioId);
    if (deleteError)
      return {
        success: false,
        error: { type: "database", message: deleteError.message, cause: deleteError },
      };

    if (handouts.length === 0) return { success: true, data: null };

    const { error: insertError } = await supabase.from("scenario_handouts").insert(handouts);
    if (insertError)
      return {
        success: false,
        error: { type: "database", message: insertError.message, cause: insertError },
      };
    return { success: true, data: null };
  }

  async replaceScenarioSessions(
    scenarioId: string,
    sessions: {
      name: string | null;
      role: "KP" | "PL";
      characters: {
        name: string | null;
        playerName: string | null;
        iacharaUrl: string | null;
        ho: string | null;
        memo: string | null;
        portraitStoragePath: string | null;
      }[];
    }[],
  ): Promise<RepositoryResult<null>> {
    if (!supabase) return unavailable();
    const { error: deleteError } = await supabase
      .from("scenario_sessions")
      .delete()
      .eq("scenario_id", scenarioId);
    if (deleteError)
      return {
        success: false,
        error: { type: "database", message: deleteError.message, cause: deleteError },
      };

    for (const [sessionIndex, session] of sessions.entries()) {
      const { data, error } = await supabase
        .from("scenario_sessions")
        .insert({
          scenario_id: scenarioId,
          display_order: sessionIndex + 1,
          name: session.name,
          role: session.role,
        })
        .select("id")
        .single();
      if (error)
        return {
          success: false,
          error: { type: "database", message: error.message, cause: error },
        };
      if (session.characters.length) {
        const { error: characterError } = await supabase.from("scenario_session_characters").insert(
          session.characters.map((character, characterIndex) => ({
            session_id: data.id,
            display_order: characterIndex + 1,
            name: character.name,
            player_name: character.playerName,
            iachara_url: character.iacharaUrl,
            ho: character.ho,
            memo: character.memo,
            portrait_storage_path: character.portraitStoragePath,
          })),
        );
        if (characterError)
          return {
            success: false,
            error: { type: "database", message: characterError.message, cause: characterError },
          };
      }
    }
    return { success: true, data: null };
  }

  async getScenarioDetail(
    userId: string,
    scenarioId: string,
  ): Promise<RepositoryResult<ScenarioDetail | null>> {
    if (!supabase) return unavailable();

    const scenarioResult = await supabase
      .from("scenarios")
      .select("*")
      .eq("id", scenarioId)
      .maybeSingle();
    if (scenarioResult.error) {
      return {
        success: false,
        error: {
          type: "database",
          message: scenarioResult.error.message,
          cause: scenarioResult.error,
        },
      };
    }
    if (!scenarioResult.data) return { success: true, data: null };

    const [userDataResult, handoutsResult, episodesResult, imagesResult, sessionsResult] =
      await Promise.all([
        supabase
          .from("user_scenario_data")
          .select(
            "scenario_id, favorite, kp_status, play_status, purchase_url, memo, kp_memo, pl_memo",
          )
          .eq("user_id", userId)
          .eq("scenario_id", scenarioId)
          .maybeSingle(),
        supabase
          .from("scenario_handouts")
          .select("*")
          .eq("scenario_id", scenarioId)
          .order("display_order"),
        supabase
          .from("scenario_episodes")
          .select("*")
          .eq("scenario_id", scenarioId)
          .order("episode_number"),
        supabase
          .from("scenario_images")
          .select("*")
          .eq("scenario_id", scenarioId)
          .order("display_order"),
        supabase
          .from("scenario_sessions")
          .select("*")
          .eq("scenario_id", scenarioId)
          .order("display_order"),
      ]);
    const sessionIds = sessionsResult.data?.map((session) => session.id) ?? [];
    const charactersResult = sessionIds.length
      ? await supabase
          .from("scenario_session_characters")
          .select("*")
          .in("session_id", sessionIds)
          .order("display_order")
      : { data: [], error: null };
    const childError =
      userDataResult.error ??
      handoutsResult.error ??
      episodesResult.error ??
      imagesResult.error ??
      sessionsResult.error ??
      charactersResult.error;
    if (childError) {
      return {
        success: false,
        error: { type: "database", message: childError.message, cause: childError },
      };
    }

    return {
      success: true,
      data: mapScenarioDetail(
        scenarioResult.data,
        userDataResult.data ?? undefined,
        handoutsResult.data ?? [],
        episodesResult.data ?? [],
        imagesResult.data ?? [],
        sessionsResult.data ?? [],
        charactersResult.data ?? [],
      ),
    };
  }

  async getScenarioList(userId: string): Promise<RepositoryResult<ScenarioSummary[]>> {
    if (!supabase) return unavailable();

    const scenariosResult = await supabase
      .from("scenarios")
      .select("*")
      .order("created_at", { ascending: false });
    if (scenariosResult.error) {
      return {
        success: false,
        error: {
          type: "database",
          message: scenariosResult.error.message,
          cause: scenariosResult.error,
        },
      };
    }

    const scenarioIds = scenariosResult.data.map((scenario) => scenario.id);
    if (scenarioIds.length === 0) return { success: true, data: [] };

    const userDataResult = await supabase
      .from("user_scenario_data")
      .select("scenario_id, favorite, kp_status, play_status, purchase_url, memo, kp_memo, pl_memo")
      .eq("user_id", userId)
      .in("scenario_id", scenarioIds);
    if (userDataResult.error) {
      return {
        success: false,
        error: {
          type: "database",
          message: userDataResult.error.message,
          cause: userDataResult.error,
        },
      };
    }

    const imagesResult = await supabase
      .from("scenario_images")
      .select("scenario_id, storage_path, display_order")
      .in("scenario_id", scenarioIds)
      .order("display_order");
    if (imagesResult.error) {
      return {
        success: false,
        error: { type: "database", message: imagesResult.error.message, cause: imagesResult.error },
      };
    }

    const userDataByScenarioId = new Map(
      userDataResult.data.map((data) => [data.scenario_id, data]),
    );
    const thumbnailByScenarioId = new Map<string, string>();
    for (const image of imagesResult.data) {
      if (!thumbnailByScenarioId.has(image.scenario_id)) {
        thumbnailByScenarioId.set(image.scenario_id, image.storage_path);
      }
    }
    return {
      success: true,
      data: scenariosResult.data.map((scenario) =>
        mapScenarioSummary(
          scenario,
          userDataByScenarioId.get(scenario.id),
          thumbnailByScenarioId.get(scenario.id) ?? null,
        ),
      ),
    };
  }

  async getOwnedScenarioBackups(userId: string): Promise<RepositoryResult<ScenarioBackupRecord[]>> {
    if (!supabase) return unavailable();
    const client = supabase;
    const { data: scenarios, error: scenariosError } = await client
      .from("scenarios")
      .select("*")
      .eq("owner_id", userId)
      .order("created_at");
    if (scenariosError) {
      return {
        success: false,
        error: { type: "database", message: scenariosError.message, cause: scenariosError },
      };
    }
    if (!scenarios.length) return { success: true, data: [] };

    const scenarioIds = scenarios.map((scenario) => scenario.id);
    const [handouts, episodes, images, sessions, userData] = await Promise.all([
      client.from("scenario_handouts").select("*").in("scenario_id", scenarioIds),
      client.from("scenario_episodes").select("*").in("scenario_id", scenarioIds),
      client.from("scenario_images").select("*").in("scenario_id", scenarioIds),
      client.from("scenario_sessions").select("*").in("scenario_id", scenarioIds),
      client
        .from("user_scenario_data")
        .select("*")
        .eq("user_id", userId)
        .in("scenario_id", scenarioIds),
    ]);
    const sessionIds = sessions.data?.map((session) => session.id) ?? [];
    const sessionCharacters = sessionIds.length
      ? await client.from("scenario_session_characters").select("*").in("session_id", sessionIds)
      : { data: [], error: null };
    const error =
      handouts.error ??
      episodes.error ??
      images.error ??
      sessions.error ??
      sessionCharacters.error ??
      userData.error;
    if (error) {
      return {
        success: false,
        error: {
          type: "database",
          message: error.message ?? "バックアップデータを取得できませんでした。",
          cause: error,
        },
      };
    }

    const groupByScenarioId = <T extends { scenario_id: string }>(rows: T[]) => {
      const grouped = new Map<string, T[]>();
      for (const row of rows)
        grouped.set(row.scenario_id, [...(grouped.get(row.scenario_id) ?? []), row]);
      return grouped;
    };
    const handoutsByScenarioId = groupByScenarioId(handouts.data ?? []);
    const episodesByScenarioId = groupByScenarioId(episodes.data ?? []);
    const imagesByScenarioId = groupByScenarioId(images.data ?? []);
    const sessionsByScenarioId = groupByScenarioId(sessions.data ?? []);
    const charactersBySessionId = new Map<string, typeof sessionCharacters.data>();
    for (const character of sessionCharacters.data ?? []) {
      charactersBySessionId.set(character.session_id, [
        ...(charactersBySessionId.get(character.session_id) ?? []),
        character,
      ]);
    }
    const userDataByScenarioId = new Map(
      (userData.data ?? []).map((data) => [data.scenario_id, data]),
    );

    return {
      success: true,
      data: scenarios.map((scenario) => ({
        scenario,
        handouts: handoutsByScenarioId.get(scenario.id) ?? [],
        episodes: episodesByScenarioId.get(scenario.id) ?? [],
        images: imagesByScenarioId.get(scenario.id) ?? [],
        sessions: sessionsByScenarioId.get(scenario.id) ?? [],
        sessionCharacters: (sessionsByScenarioId.get(scenario.id) ?? []).flatMap(
          (session) => charactersBySessionId.get(session.id) ?? [],
        ),
        userData: userDataByScenarioId.get(scenario.id) ?? null,
      })),
    };
  }

  async replaceOwnedScenarioBackups(
    userId: string,
    records: ScenarioBackupRecord[],
    onProgress?: (progress: BackupRestoreProgress) => void,
  ): Promise<RepositoryResult<null>> {
    if (!supabase) return unavailable();
    const client = supabase;
    const report = (step: number, label: string) => onProgress?.({ step, total: 6, label });
    report(0, "復元を準備中…");
    const current = await this.getOwnedScenarioBackups(userId);
    if (!current.success) return current;
    report(1, "既存データを確認しました");

    const restore = async (items: ScenarioBackupRecord[], reportProgress = true) => {
      if (!items.length) {
        if (reportProgress) {
          report(3, "シナリオがありません");
          report(4, "関連データがありません");
          report(5, "関連データがありません");
        }
        return;
      }
      const handouts = items.flatMap((item) => item.handouts);
      const episodes = items.flatMap((item) => item.episodes);
      const images = items.flatMap((item) => item.images);
      const sessions = items.flatMap((item) => item.sessions);
      const sessionCharacters = items.flatMap((item) => item.sessionCharacters);
      const userData = items.flatMap((item) =>
        item.userData
          ? [
              {
                user_id: item.userData.user_id,
                scenario_id: item.userData.scenario_id,
                favorite: item.userData.favorite,
                kp_status: item.userData.kp_status,
                play_status: item.userData.play_status,
                purchase_url: item.userData.purchase_url,
                memo: item.userData.memo,
                kp_memo: item.userData.kp_memo,
                pl_memo: item.userData.pl_memo,
              },
            ]
          : [],
      );

      const { error: scenarioError } = await client
        .from("scenarios")
        .insert(items.map((item) => item.scenario));
      if (scenarioError) throw scenarioError;
      if (reportProgress) report(3, "シナリオを復元しました");

      const insertions = [
        handouts.length ? client.from("scenario_handouts").insert(handouts) : null,
        episodes.length ? client.from("scenario_episodes").insert(episodes) : null,
        images.length ? client.from("scenario_images").insert(images) : null,
        sessions.length ? client.from("scenario_sessions").insert(sessions) : null,
        userData.length ? client.from("user_scenario_data").insert(userData) : null,
      ].filter((request): request is NonNullable<typeof request> => request !== null);
      const results = await Promise.all(insertions);
      const insertionError = results.find((result) => result.error)?.error;
      if (insertionError) throw insertionError;
      if (reportProgress) report(4, "HO・Episode・画像・参加記録を復元しました");
      if (sessionCharacters.length) {
        const { error } = await client
          .from("scenario_session_characters")
          .insert(sessionCharacters);
        if (error) throw error;
      }
      if (reportProgress) report(5, "関連データを復元しました");
    };

    const { error: deleteError } = await client.from("scenarios").delete().eq("owner_id", userId);
    if (deleteError)
      return {
        success: false,
        error: { type: "database", message: deleteError.message, cause: deleteError },
      };
    report(2, "既存データを削除しました");

    try {
      await restore(records);
      return { success: true, data: null };
    } catch (error) {
      await client.from("scenarios").delete().eq("owner_id", userId);
      try {
        await restore(current.data);
      } catch {
        // Keep the original database error; the failed compensation is logged by Supabase.
      }
      const cause = error as { message?: string };
      return {
        success: false,
        error: {
          type: "database",
          message: cause.message ?? "データを復元できませんでした。",
          cause: error,
        },
      };
    }
  }
}

export const scenarioRepository = new ScenarioRepository();

async function getAuthenticatedUserId(): Promise<RepositoryResult<string>> {
  if (!supabase) return unavailable();
  const { data, error } = await supabase.auth.getUser();
  if (error)
    return { success: false, error: { type: "auth", message: error.message, cause: error } };
  if (!data.user)
    return { success: false, error: { type: "auth", message: "ログインが必要です。" } };
  return { success: true, data: data.user.id };
}

function toScenarioUpdate(
  command: UpdateScenarioCommand,
): Database["public"]["Tables"]["scenarios"]["Update"] {
  const update: Database["public"]["Tables"]["scenarios"]["Update"] = {};
  if (command.title !== undefined) update.title = command.title.trim();
  if (command.system !== undefined) update.system = command.system.trim() || null;
  if (command.scenarioType !== undefined)
    update.scenario_type = command.scenarioType === "kpLess" ? "kp_less" : command.scenarioType;
  if (command.author !== undefined) update.author = command.author.trim() || null;
  if (command.titleReading !== undefined)
    update.title_reading = command.titleReading.trim() || null;
  if (command.authorReading !== undefined)
    update.author_reading = command.authorReading.trim() || null;
  if (command.legacyRegistration !== undefined)
    update.legacy_registration = command.legacyRegistration ?? {};
  if (command.stage !== undefined) update.stage = command.stage.trim() || null;
  if (command.recommendedSkills !== undefined)
    update.recommended_skills = command.recommendedSkills.trim() || null;
  if (command.secondarySkills !== undefined)
    update.secondary_skills = command.secondarySkills.trim() || null;
  if (command.notRecommended !== undefined)
    update.not_recommended = command.notRecommended.trim() || null;
  if (command.lostRate !== undefined) update.lost_rate = command.lostRate;
  if (command.lostRateNote !== undefined)
    update.lost_rate_note = command.lostRateNote.trim() || null;
  if (command.hoType !== undefined) update.ho_type = command.hoType;
  if (command.battle !== undefined) update.battle = command.battle;
  if (command.cautions !== undefined) update.cautions = command.cautions.trim() || null;
  if (command.trailerText !== undefined) update.trailer_text = command.trailerText.trim() || null;
  if (command.scenarioTags !== undefined) update.scenario_tags = command.scenarioTags;
  if (command.playerCountType !== undefined) update.player_count_type = command.playerCountType;
  if (command.playerCountFixed !== undefined) update.player_count_fixed = command.playerCountFixed;
  if (command.playerCountMin !== undefined) update.player_count_min = command.playerCountMin;
  if (command.playerCountMax !== undefined) update.player_count_max = command.playerCountMax;
  if (command.playerCountText !== undefined) update.player_count_text = command.playerCountText;
  if (command.playTimeType !== undefined) update.play_time_type = command.playTimeType;
  if (command.playTimeFixed !== undefined) update.play_time_fixed = command.playTimeFixed;
  if (command.playTimeMin !== undefined) update.play_time_min = command.playTimeMin;
  if (command.playTimeMax !== undefined) update.play_time_max = command.playTimeMax;
  if (command.playTimeText !== undefined) update.play_time_text = command.playTimeText;
  return update;
}
