import type { ScenarioDetailDto } from "../domain/dto/ScenarioDetailDto";
import type { DiscordFormat } from "../domain/models/UserSettings";

export const DISCORD_FIELD_OPTIONS = [
  ["title", "タイトル"],
  ["system", "システム"],
  ["author", "作者"],
  ["stage", "舞台"],
  ["playerCount", "人数"],
  ["playTime", "時間"],
  ["tags", "傾向・タグ"],
  ["recommendedSkills", "推奨技能"],
  ["lostRate", "ロスト率"],
  ["hoType", "HO形式"],
  ["battle", "戦闘"],
  ["trailerText", "トレーラー"],
] as const;

const LABELS = new Map<string, string>(DISCORD_FIELD_OPTIONS);

const PREVIEW_VALUES: Record<string, string> = {
  title: "夜の帳に沈む街",
  system: "クトゥルフ神話TRPG（7版）",
  author: "サンプル作者",
  stage: "現代日本",
  playerCount: "2〜4人",
  playTime: "約3時間",
  tags: "ホラー / 探索 / シティ",
  recommendedSkills: "目星、聞き耳",
  lostRate: "中",
  hoType: "個別HO",
  battle: "場合による",
  trailerText: "これはDiscord形式のプレビューです。",
};

function valueFor(field: string, scenario: ScenarioDetailDto): string {
  const values: Record<string, string | null | undefined> = {
    title: scenario.title,
    system: scenario.system,
    author: scenario.author,
    stage: scenario.stage,
    playerCount: scenario.playerCount,
    playTime: scenario.playTime,
    tags: scenario.tags.join(" / "),
    recommendedSkills: scenario.recommendedSkills,
    lostRate: scenario.lostRate,
    hoType: scenario.hoType,
    battle: scenario.battle,
    trailerText: scenario.trailerText,
  };
  return values[field]?.trim() ?? "";
}

export function formatScenarioForDiscord(
  scenario: ScenarioDetailDto,
  format: DiscordFormat,
): string {
  const body = format.fields
    .map((field) => {
      const value = valueFor(field, scenario);
      if (!value) return "";
      return format.includeLabels && LABELS.has(field) ? `${LABELS.get(field)}：${value}` : value;
    })
    .filter(Boolean)
    .join(format.separator);
  return [format.headingPrefix.trim(), body].filter(Boolean).join(format.separator);
}

export function formatDiscordPreview(format: DiscordFormat): string {
  const body = format.fields
    .map((field) => {
      const value = PREVIEW_VALUES[field]?.trim() ?? "";
      if (!value) return "";
      return format.includeLabels && LABELS.has(field) ? `${LABELS.get(field)}：${value}` : value;
    })
    .filter(Boolean)
    .join(format.separator);

  return [format.headingPrefix.trim(), body].filter(Boolean).join(format.separator);
}
