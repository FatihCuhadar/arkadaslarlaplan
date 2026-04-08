import { StyleSheet, Text, View } from "react-native";

export type PlanStatus =
  | "pending"
  | "confirmed"
  | "rescheduled"
  | "cancelled"
  | "completed";

type StatusBadgeProps = {
  status: PlanStatus;
};

const LABELS: Record<PlanStatus, string> = {
  pending: "Beklemede",
  confirmed: "Onayli",
  rescheduled: "Ertelendi",
  cancelled: "Iptal",
  completed: "Tamamlandi",
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <View style={[styles.badge, styles[status]]}>
      <Text style={styles.text}>{LABELS[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 4,
  },
  text: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 12,
  },
  pending: { backgroundColor: "#ea580c" },
  confirmed: { backgroundColor: "#155eef" },
  rescheduled: { backgroundColor: "#7c3aed" },
  cancelled: { backgroundColor: "#be123c" },
  completed: { backgroundColor: "#475467" },
});
