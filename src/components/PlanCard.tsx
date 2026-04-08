import { Pressable, StyleSheet, Text } from "react-native";

import type { Plan } from "../types";
import { formatDateTime } from "../utils/planUtils";
import { StatusBadge, type PlanStatus } from "./StatusBadge";

type PlanCardProps = {
  plan: Plan;
  onPress: () => void;
  strongest?: boolean;
  status: PlanStatus;
};

export function PlanCard({ plan, onPress, strongest = false, status }: PlanCardProps) {
  return (
    <Pressable
      key={plan.id}
      style={[styles.planCard, strongest && styles.nearestPlanCard]}
      onPress={onPress}
    >
      <StatusBadge status={status} />
      <Text style={styles.planTitle}>{plan.title}</Text>
      <Text style={styles.planMeta}>{plan.friendName}</Text>
      <Text style={styles.planMeta}>{formatDateTime(plan.eventAt)}</Text>
      {plan.location ? <Text style={styles.planMeta}>Konum: {plan.location}</Text> : null}
      {plan.note ? <Text style={styles.planMeta}>Not: {plan.note}</Text> : null}
      <Text style={styles.inviteCode}>Davet Kodu: {plan.inviteCode}</Text>
      <Text style={styles.detailLink}>Detaya Git</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  planCard: {
    borderWidth: 1,
    borderColor: "#d6dbe8",
    borderRadius: 14,
    padding: 12,
    backgroundColor: "#fcfdff",
    gap: 4,
  },
  nearestPlanCard: {
    borderColor: "#6f9df3",
    backgroundColor: "#edf3ff",
  },
  planTitle: { fontSize: 16, fontWeight: "700", color: "#1e293b" },
  planMeta: { color: "#334155" },
  inviteCode: { marginTop: 6, color: "#113576", fontWeight: "700" },
  detailLink: { marginTop: 8, color: "#155eef", fontWeight: "700" },
});
