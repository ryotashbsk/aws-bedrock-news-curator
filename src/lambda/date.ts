export type TokyoDateParts = {
  readonly dateLabel: string;
  readonly year: string;
  readonly month: string;
  readonly day: string;
};

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

function readDatePart(parts: readonly Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  const part = parts.find((value) => value.type === type);
  if (!part) {
    throw new Error(`missing date part: ${type}`);
  }
  return part.value;
}
