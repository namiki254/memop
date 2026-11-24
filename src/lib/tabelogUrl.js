/**
 * ピンに付ける食べログの店舗ページ URL（#5）．
 *
 * 入力は任意．入れる場合は https://tabelog.com/ か，そのサブドメイン
 * （s.tabelog.com など）のページだけを受け付ける．
 * Supabase 側の制約（docs/sql/issue-5-pin-tabelog-url.sql）と同じ条件にしている．
 */
export const TABELOG_URL_MAX_LENGTH = 500;

const TABELOG_URL_PATTERN = /^https:\/\/([a-z0-9-]+\.)*tabelog\.com\/\S*$/i;

/** 入力欄の値を保存用に整える．空欄なら null を返す */
export function normalizeTabelogUrl(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

export const TABELOG_URL_UNAVAILABLE_MESSAGE =
  "食べログ URL の保存は現在利用できません。URL を空欄にすると保存できます。運営担当者にお問い合わせください。";

/** Supabase に tabelog_url 列がまだ無い（SQL 未適用の）ときのエラーか */
export function isTabelogColumnMissingError(error) {
  return Boolean(error)
    && (error.code === "PGRST204" || error.code === "42703")
    && String(error.message ?? "").includes("tabelog_url");
}

/** 食べログの URL として保存・表示してよいか */
export function isTabelogUrl(value) {
  return typeof value === "string"
    && value.length <= TABELOG_URL_MAX_LENGTH
    && TABELOG_URL_PATTERN.test(value);
}
