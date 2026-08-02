/* global process, console */

import { readFile } from "node:fs/promises";

const filePath = process.argv[2];
if (!filePath) {
  console.error("使い方: npm run verify:legacy -- <旧バックアップJSON>");
  process.exit(1);
}

const payload = JSON.parse(await readFile(filePath, "utf8"));
if (payload.appName !== "TRPG Scenario Manager" || payload.dataVersion !== 2) {
  throw new Error("旧アプリのdataVersion: 2バックアップではありません。");
}
if (!Array.isArray(payload.scenarios) || payload.scenarios.length !== 10) {
  throw new Error(`シナリオ件数が想定外です: ${payload.scenarios?.length ?? "不明"}`);
}

const requiredBasic = [
  "title",
  "system",
  "author",
  "scenarioType",
  "countType",
  "timeType",
  "stage",
];
const requiredScenario = [
  "recommendedSkills",
  "secondarySkills",
  "lostRate",
  "lostRateNote",
  "hoType",
  "hoContent",
  "trends",
  "combat",
  "notes",
];
let imageCount = 0;
let hoCount = 0;
let sessionCount = 0;
for (const [index, scenario] of payload.scenarios.entries()) {
  for (const key of requiredBasic)
    if (!(key in scenario.basic)) throw new Error(`${index + 1}件目のbasic.${key}がありません。`);
  for (const key of requiredScenario)
    if (!(key in scenario.scenario))
      throw new Error(`${index + 1}件目のscenario.${key}がありません。`);
  if (typeof scenario.scenario.hoContent === "string")
    hoCount += scenario.scenario.hoContent ? scenario.scenario.hoContent.split("\u001e").length : 0;
  if (Array.isArray(scenario.trailer?.images)) {
    imageCount += scenario.trailer.images.length;
    for (const image of scenario.trailer.images) {
      if (typeof image.src !== "string" || !image.src.startsWith("data:image/"))
        throw new Error(`${index + 1}件目にStorageへ復元できない画像があります。`);
    }
  }
  sessionCount += Array.isArray(scenario.personal?.sessions)
    ? scenario.personal.sessions.length
    : 0;
}

const countException = payload.scenarios.find(
  (scenario) => scenario.basic.maxCount === "KP管理できる人数",
);
if (!countException) throw new Error("旧アプリ固有の自由文字列人数値を検出できませんでした。");

console.log(
  JSON.stringify(
    {
      dataVersion: payload.dataVersion,
      scenarios: payload.scenarios.length,
      base64Images: imageCount,
      hoEntriesByDelimiter: hoCount,
      sessions: sessionCount,
      preservedValue: countException.basic.maxCount,
    },
    null,
    2,
  ),
);
