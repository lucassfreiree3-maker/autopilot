const SAO_PAULO_TZ = "America/Sao_Paulo";

export function timestampSP(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: SAO_PAULO_TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .format(d)
    .replace(" ", "T");
  const ms = String(d.getMilliseconds()).padStart(3, "0");

  const tzname =
    new Intl.DateTimeFormat("en-US", {
      timeZone: SAO_PAULO_TZ,
      timeZoneName: "shortOffset",
    })
      .formatToParts(d)
      .find((p) => p.type === "timeZoneName")?.value || "GMT-3";

  function gmtToOffset(str: string): string {
    const m = str.match(/([+-])(\d{1,2})(?::?(\d{2}))?/);
    if (!m) return "-03:00";
    const sign = m[1] === "-" ? "-" : "+";
    const hh = m[2].padStart(2, "0");
    const mm = (m[3] || "00").padStart(2, "0");
    return `${sign}${hh}:${mm}`;
  }
  const offset = gmtToOffset(
    tzname.replace("GMT", "").replace("UTC", "").replace("GMT", ""),
  );

  return `${parts}.${ms}${offset}`;
}

export function humanTimestampSP(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: SAO_PAULO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(new Date());
}

export function formatDateSP(
  value: Date | string = new Date(),
  separator = "-",
): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: SAO_PAULO_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(date);

  const dd = parts.find((part) => part.type === "day")?.value ?? "";
  const mm = parts.find((part) => part.type === "month")?.value ?? "";
  const yyyy = parts.find((part) => part.type === "year")?.value ?? "";

  if (!dd || !mm || !yyyy) return "";
  return [dd, mm, yyyy].join(separator);
}

export function isoDateToBrazilianDate(
  value: string,
  separator = "-",
): string {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const isoDateMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDateMatch) {
    const [, yyyy, mm, dd] = isoDateMatch;
    return [dd, mm, yyyy].join(separator);
  }

  return formatDateSP(raw, separator);
}

export function parseBrazilianLogDateTimeToEpochMs(
  date: string,
  time: string,
): number {
  const trimmedDate = String(date || "").trim();
  const trimmedTime = String(time || "").trim();
  const match = trimmedDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  if (!match || !trimmedTime) return Number.NaN;

  const [, dd, mm, yyyy] = match;
  return new Date(`${yyyy}-${mm}-${dd}T${trimmedTime}-03:00`).getTime();
}

export function normalizeTimestampToSP(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const simpleMatch = raw.match(
    /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.\d+)?$/,
  );
  if (simpleMatch) {
    return `${simpleMatch[1]}T${simpleMatch[2]}-03:00`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;

  return timestampSP(parsed);
}
