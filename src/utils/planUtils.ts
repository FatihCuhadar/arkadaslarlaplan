import type { DocumentData } from "firebase/firestore";

import type { CalendarDay, Plan } from "../types";

export const toDayKey = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export const buildMonthCells = (monthCursor: Date): CalendarDay[] => {
  const year = monthCursor.getFullYear();
  const month = monthCursor.getMonth();
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - offset);
  const cells: CalendarDay[] = [];
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + i);
    cells.push({
      date,
      key: toDayKey(date),
      inCurrentMonth: date.getMonth() === month,
    });
  }
  return cells;
};

export const getReminderSignature = (plan: Plan): string =>
  `${plan.eventAt}-${Number(plan.reminderTwoDays)}-${Number(plan.reminderOneDay)}-${Number(plan.reminderMorning)}`;

export const formatDateTime = (timestamp: number): string =>
  new Date(timestamp).toLocaleString("tr-TR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

export const generateInviteCode = (): string =>
  Math.random().toString(36).slice(2, 8).toUpperCase();

export const getMorningReminder = (eventAt: number): number => {
  const morning = new Date(eventAt);
  morning.setHours(9, 0, 0, 0);
  return morning.getTime();
};

export const parsePlan = (id: string, raw: DocumentData): Plan => ({
  id,
  title: raw.title ?? "",
  friendName: raw.friendName ?? "",
  location: raw.location ?? "",
  note: raw.note ?? "",
  eventAt: raw.eventAt ?? Date.now(),
  inviteCode: raw.inviteCode ?? "",
  participants: Array.isArray(raw.participants) ? raw.participants : [],
  createdBy: raw.createdBy ?? "",
  createdAt: raw.createdAt ?? Date.now(),
  reminderTwoDays: raw.reminderTwoDays ?? true,
  reminderOneDay: raw.reminderOneDay ?? false,
  reminderMorning: raw.reminderMorning ?? true,
});

export const formatDayLabel = (key: string): string => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("tr-TR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
};
