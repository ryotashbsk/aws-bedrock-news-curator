export type TokyoDateParts = {
  readonly dateLabel: string;
  readonly year: string;
  readonly month: string;
  readonly day: string;
};

/** JST 基準の日付表示ラベルと S3 key 用日付部品 */
export function formatTokyoDateParts(date: Date): TokyoDateParts {
  const formatter = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });

  const parts = formatter.formatToParts(date);
  return {
    dateLabel: formatter.format(date),
    year: readDatePart(parts, "year"),
    month: readDatePart(parts, "month"),
    day: readDatePart(parts, "day"),
  };
}

/** 2つの日付が JST 基準で同じ年月日かを判定 */
export function isSameTokyoDate(date: Date, referenceDate: Date): boolean {
  const dateParts = formatTokyoDateParts(date);
  const referenceParts = formatTokyoDateParts(referenceDate);
  return (
    dateParts.year === referenceParts.year &&
    dateParts.month === referenceParts.month &&
    dateParts.day === referenceParts.day
  );
}

/** Intl.DateTimeFormatPart[] から指定 type の値を抽出。存在しない場合は例外 */
function readDatePart(parts: readonly Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  const part = parts.find((value) => value.type === type);
  if (!part) {
    throw new Error(`missing date part: ${type}`);
  }
  return part.value;
}
