export type RootStackParamList = {
  MainTabs: undefined;
  PlanDetail: { planId: string };
};

export type Plan = {
  id: string;
  title: string;
  friendName: string;
  location: string;
  note: string;
  eventAt: number;
  inviteCode: string;
  participants: string[];
  createdBy: string;
  createdAt: number;
  reminderTwoDays: boolean;
  reminderOneDay: boolean;
  reminderMorning: boolean;
};

export type NotificationMap = Record<string, { ids: string[]; signature: string }>;

export type Feedback = { tone: "ok" | "error"; text: string };

export type CalendarDay = { date: Date; key: string; inCurrentMonth: boolean };
