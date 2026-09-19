const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function kst(iso: string): Date {
  return new Date(new Date(iso).getTime() + KST_OFFSET_MS);
}

const pad = (n: number): string => String(n).padStart(2, "0");

/** e.g. "9월 26일(금) 19:00" */
export function formatKst(iso: string): string {
  const d = kst(iso);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일(${WEEKDAYS[d.getUTCDay()]}) ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** e.g. "2026.09.20" */
export function formatKstDate(iso: string): string {
  const d = kst(iso);
  return `${d.getUTCFullYear()}.${pad(d.getUTCMonth() + 1)}.${pad(d.getUTCDate())}`;
}

export function kstHour(iso: string): number {
  return kst(iso).getUTCHours();
}
