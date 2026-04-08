import { StyleSheet, Text, View } from "react-native";

import type { Feedback } from "../types";

type FeedbackBannerProps = {
  feedback: Feedback | null;
};

export function FeedbackBanner({ feedback }: FeedbackBannerProps) {
  if (!feedback) {
    return null;
  }

  return (
    <View
      style={[
        styles.feedbackBox,
        feedback.tone === "ok" ? styles.feedbackOk : styles.feedbackError,
      ]}
    >
      <Text style={styles.feedbackText}>{feedback.text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  feedbackBox: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
  },
  feedbackOk: {
    backgroundColor: "#eafaf0",
    borderColor: "#93d5ac",
  },
  feedbackError: {
    backgroundColor: "#ffefef",
    borderColor: "#f6a7a7",
  },
  feedbackText: {
    color: "#1f2937",
    fontWeight: "600",
  },
});
