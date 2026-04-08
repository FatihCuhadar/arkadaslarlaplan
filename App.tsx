import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import * as Calendar from "expo-calendar";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  updateDoc,
  where,
} from "firebase/firestore";

import { FeedbackBanner } from "./src/components/FeedbackBanner";
import { EmptyState } from "./src/components/EmptyState";
import { PlanCard } from "./src/components/PlanCard";
import { db, hasFirebaseConfig } from "./src/firebase";
import type {
  Feedback,
  NotificationMap,
  Plan,
  RootStackParamList,
} from "./src/types";
import {
  buildMonthCells,
  formatDateTime,
  formatDayLabel,
  generateInviteCode,
  getMorningReminder,
  getReminderSignature,
  parsePlan,
  toDayKey,
} from "./src/utils/planUtils";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const PLAN_NOTIFICATIONS_KEY = "plan_notifications_v1";
const WEEK_DAYS = ["Pzt", "Sal", "Car", "Per", "Cum", "Cmt", "Paz"];
const Tab = createBottomTabNavigator();

const RootStack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const [userId, setUserId] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [title, setTitle] = useState("");
  const [friendName, setFriendName] = useState("");
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [eventDate, setEventDate] = useState(
    new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [reminderTwoDays, setReminderTwoDays] = useState(true);
  const [reminderOneDay, setReminderOneDay] = useState(false);
  const [reminderMorning, setReminderMorning] = useState(true);
  const [inviteCodeInput, setInviteCodeInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [notifPermissionGranted, setNotifPermissionGranted] = useState(false);
  const [monthCursor, setMonthCursor] = useState(new Date());
  const [selectedDayKey, setSelectedDayKey] = useState(toDayKey(new Date()));

  const sortedPlans = useMemo(
    () => [...plans].sort((a, b) => a.eventAt - b.eventAt),
    [plans],
  );
  const upcomingPlans = useMemo(
    () => sortedPlans.filter((item) => item.eventAt >= Date.now()),
    [sortedPlans],
  );
  const nearestPlan = upcomingPlans[0] ?? null;

  const plansByDay = useMemo(() => {
    const map: Record<string, Plan[]> = {};
    for (const plan of sortedPlans) {
      const key = toDayKey(new Date(plan.eventAt));
      if (!map[key]) map[key] = [];
      map[key].push(plan);
    }
    return map;
  }, [sortedPlans]);

  const calendarDays = useMemo(() => buildMonthCells(monthCursor), [monthCursor]);
  const selectedDayPlans = plansByDay[selectedDayKey] ?? [];

  const monthLabel = useMemo(
    () =>
      monthCursor.toLocaleDateString("tr-TR", {
        month: "long",
        year: "numeric",
      }),
    [monthCursor],
  );

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const existing = await AsyncStorage.getItem("local_user_id");
        if (existing) {
          setUserId(existing);
          return;
        }
        const generated = `u_${Math.random().toString(36).slice(2, 12)}`;
        await AsyncStorage.setItem("local_user_id", generated);
        setUserId(generated);
      } catch {
        setFeedback({ tone: "error", text: "Cihaz kimligi olusturulamadi." });
      } finally {
        setAuthLoading(false);
      }
    };
    bootstrap();
  }, []);

  useEffect(() => {
    const setupNotifications = async () => {
      const permissions = await Notifications.getPermissionsAsync();
      let finalStatus = permissions.status;
      if (finalStatus !== "granted") {
        const requested = await Notifications.requestPermissionsAsync();
        finalStatus = requested.status;
      }
      setNotifPermissionGranted(finalStatus === "granted");
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("plans", {
          name: "Plan Hatirlatmalari",
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 200, 200, 200],
        });
      }
    };
    setupNotifications();
  }, []);

  useEffect(() => {
    if (!db || !userId) {
      setPlansLoading(false);
      return;
    }
    const plansQuery = query(
      collection(db, "plans"),
      where("participants", "array-contains", userId),
    );
    const unsubscribe = onSnapshot(
      plansQuery,
      (snapshot) => {
        const allPlans = snapshot.docs.map((item) => parsePlan(item.id, item.data()));
        setPlans(allPlans);
        setPlansLoading(false);
      },
      () => {
        setFeedback({ tone: "error", text: "Planlar yuklenirken bir hata olustu." });
        setPlansLoading(false);
      },
    );
    return () => unsubscribe();
  }, [userId]);

  useEffect(() => {
    const syncNotifications = async () => {
      if (!notifPermissionGranted) return;
      const storedRaw = await AsyncStorage.getItem(PLAN_NOTIFICATIONS_KEY);
      const map: NotificationMap = storedRaw ? JSON.parse(storedRaw) : {};
      const activeIds = new Set(plans.map((item) => item.id));
      for (const [planId, value] of Object.entries(map)) {
        if (activeIds.has(planId)) continue;
        await Promise.all(
          value.ids.map((id) => Notifications.cancelScheduledNotificationAsync(id)),
        );
        delete map[planId];
      }
      for (const plan of plans) {
        const signature = getReminderSignature(plan);
        if (map[plan.id]?.signature === signature) continue;
        const existingIds = map[plan.id]?.ids ?? [];
        await Promise.all(
          existingIds.map((id) => Notifications.cancelScheduledNotificationAsync(id)),
        );
        const newIds = await schedulePlanNotifications(plan);
        map[plan.id] = { ids: newIds, signature };
      }
      await AsyncStorage.setItem(PLAN_NOTIFICATIONS_KEY, JSON.stringify(map));
    };
    syncNotifications();
  }, [plans, notifPermissionGranted]);

  const schedulePlanNotifications = async (plan: Plan): Promise<string[]> => {
    const times = new Set<number>();
    const now = Date.now();
    if (plan.reminderTwoDays) times.add(plan.eventAt - 2 * 24 * 60 * 60 * 1000);
    if (plan.reminderOneDay) times.add(plan.eventAt - 24 * 60 * 60 * 1000);
    if (plan.reminderMorning) times.add(getMorningReminder(plan.eventAt));

    const ids: string[] = [];
    for (const time of times) {
      if (time <= now || time > plan.eventAt) continue;
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: `${plan.title} yaklasiyor`,
          body: `${plan.friendName} ile bulusma: ${formatDateTime(plan.eventAt)}`,
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(time),
          channelId: Platform.OS === "android" ? "plans" : undefined,
        },
      });
      ids.push(id);
    }
    return ids;
  };

  const clearPlanNotifications = async (planId: string) => {
    const storedRaw = await AsyncStorage.getItem(PLAN_NOTIFICATIONS_KEY);
    if (!storedRaw) return;
    const map: NotificationMap = JSON.parse(storedRaw);
    const ids = map[planId]?.ids ?? [];
    await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id)));
    delete map[planId];
    await AsyncStorage.setItem(PLAN_NOTIFICATIONS_KEY, JSON.stringify(map));
  };

  const resetPlanForm = () => {
    setTitle("");
    setFriendName("");
    setLocation("");
    setNote("");
    setEventDate(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000));
    setReminderTwoDays(true);
    setReminderOneDay(false);
    setReminderMorning(true);
  };

  const createPlan = async () => {
    if (!db || !userId) {
      setFeedback({ tone: "error", text: "Firebase ayarlari tamamlanmamis." });
      return;
    }
    if (!title.trim() || !friendName.trim()) {
      setFeedback({ tone: "error", text: "Baslik ve arkadas adi zorunlu." });
      return;
    }
    if (eventDate.getTime() <= Date.now()) {
      setFeedback({ tone: "error", text: "Gecmis tarihe plan olusturamazsin." });
      return;
    }
    setBusy(true);
    try {
      let inviteCode = "";
      for (let i = 0; i < 6; i += 1) {
        const candidate = generateInviteCode();
        const existing = await getDocs(
          query(collection(db, "plans"), where("inviteCode", "==", candidate), limit(1)),
        );
        if (existing.empty) {
          inviteCode = candidate;
          break;
        }
      }
      if (!inviteCode) throw new Error("Kod uretilemedi");

      await addDoc(collection(db, "plans"), {
        title: title.trim(),
        friendName: friendName.trim(),
        location: location.trim(),
        note: note.trim(),
        eventAt: eventDate.getTime(),
        createdAt: Date.now(),
        createdBy: userId,
        participants: [userId],
        inviteCode,
        reminderTwoDays,
        reminderOneDay,
        reminderMorning,
      });

      resetPlanForm();
      setFeedback({
        tone: "ok",
        text: "Plan olusturuldu. Davet kodunu arkadasinla paylasabilirsin.",
      });
    } catch {
      setFeedback({ tone: "error", text: "Plan olusturulurken hata olustu." });
    } finally {
      setBusy(false);
    }
  };

  const acceptInvite = async () => {
    if (!db || !userId) {
      setFeedback({ tone: "error", text: "Firebase ayarlari tamamlanmamis." });
      return;
    }
    const normalized = inviteCodeInput.trim().toUpperCase();
    if (!normalized) {
      setFeedback({ tone: "error", text: "Davet kodu gir." });
      return;
    }
    setBusy(true);
    try {
      const result = await getDocs(
        query(collection(db, "plans"), where("inviteCode", "==", normalized), limit(1)),
      );
      if (result.empty) {
        setFeedback({ tone: "error", text: "Kod bulunamadi." });
        return;
      }
      const item = result.docs[0];
      const plan = parsePlan(item.id, item.data());
      if (plan.participants.includes(userId)) {
        setFeedback({ tone: "ok", text: "Bu plana zaten dahilsin." });
        return;
      }
      await updateDoc(doc(db, "plans", item.id), {
        participants: arrayUnion(userId),
      });
      setInviteCodeInput("");
      setFeedback({ tone: "ok", text: "Davet kabul edildi, plan listene eklendi." });
    } catch {
      setFeedback({ tone: "error", text: "Davet kabul edilirken hata olustu." });
    } finally {
      setBusy(false);
    }
  };

  const leaveOrDeletePlan = async (plan: Plan): Promise<boolean> => {
    if (!db || !userId) return false;
    setBusy(true);
    try {
      if (plan.createdBy === userId) {
        await deleteDoc(doc(db, "plans", plan.id));
      } else {
        await updateDoc(doc(db, "plans", plan.id), {
          participants: arrayRemove(userId),
        });
      }
      await clearPlanNotifications(plan.id);
      setFeedback({
        tone: "ok",
        text: plan.createdBy === userId ? "Plan silindi." : "Plandan ayrildin.",
      });
      return true;
    } catch {
      setFeedback({ tone: "error", text: "Islem tamamlanamadi." });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const addPlanToCalendar = async (plan: Plan) => {
    try {
      const perm = await Calendar.requestCalendarPermissionsAsync();
      if (perm.status !== "granted") {
        setFeedback({ tone: "error", text: "Takvim izni gerekli." });
        return;
      }
      const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      const writable = calendars.find((item) => item.allowsModifications);
      if (!writable) {
        setFeedback({ tone: "error", text: "Yazilabilir bir takvim bulunamadi." });
        return;
      }
      await Calendar.createEventAsync(writable.id, {
        title: plan.title,
        startDate: new Date(plan.eventAt),
        endDate: new Date(plan.eventAt + 60 * 60 * 1000),
        notes: [plan.note, `Davet kodu: ${plan.inviteCode}`].filter(Boolean).join("\n"),
        location: plan.location || undefined,
      });
      setFeedback({ tone: "ok", text: "Plan takvime eklendi." });
    } catch {
      setFeedback({ tone: "error", text: "Takvime eklenemedi." });
    }
  };

  const onDateChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === "android") setShowDatePicker(false);
    if (event.type === "set" && selected) setEventDate(selected);
  };

  const confirmLeaveOrDelete = (plan: Plan) => {
    Alert.alert(
      "Onay",
      plan.createdBy === userId
        ? "Bu plani silmek istiyor musun?"
        : "Bu plandan ayrilmak istiyor musun?",
      [
        { text: "Vazgec", style: "cancel" },
        { text: "Evet", style: "destructive", onPress: () => leaveOrDeletePlan(plan) },
      ],
    );
  };

  const getPlanStatus = (plan: Plan) =>
    plan.eventAt < Date.now() ? "completed" : "confirmed";

  if (!hasFirebaseConfig) {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar style="dark" />
        <KeyboardAvoidingView
          style={styles.keyboardAvoid}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
        >
          <View style={styles.missingConfigWrap}>
            <Text style={styles.missingTitle}>Firebase baglantisi eksik</Text>
            <Text style={styles.missingText}>
              `.env` dosyasina EXPO_PUBLIC_FIREBASE_* alanlarini ekle ve uygulamayi
              yeniden baslat.
            </Text>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  const HomeScreen = ({ navigation }: { navigation: any }) => (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <Text style={styles.heading}>Ana Sayfa</Text>
          <Text style={styles.subheading}>
            Yaklasan planlarini gor, davet koduyla yeni plana katil.
          </Text>

          {authLoading ? (
            <View style={styles.inlineLoading}>
              <ActivityIndicator />
              <Text style={styles.loadingText}>Giris yapiliyor...</Text>
            </View>
          ) : null}

          <FeedbackBanner feedback={feedback} />

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Davet Kodu Ile Katil</Text>
            <TextInput
              value={inviteCodeInput}
              onChangeText={setInviteCodeInput}
              placeholder="Orn: AB12CD"
              placeholderTextColor="#6c727f"
              autoCapitalize="characters"
              style={styles.input}
            />
            <Pressable
              style={[styles.secondaryButton, busy ? styles.disabledButton : undefined]}
              onPress={acceptInvite}
              disabled={busy || authLoading}
            >
              <Text style={styles.secondaryButtonText}>Davet Kabul Et</Text>
            </Pressable>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Yaklasan Planlar</Text>
            {plansLoading ? (
              <View style={styles.inlineLoading}>
                <ActivityIndicator />
                <Text style={styles.loadingText}>Planlar yukleniyor...</Text>
              </View>
            ) : null}
            {!plansLoading && upcomingPlans.length === 0 ? (
              <EmptyState message="Yaklasan plan bulunmuyor." />
            ) : null}
            {nearestPlan
              ? (
                <PlanCard
                  plan={nearestPlan}
                  onPress={() => navigation.navigate("PlanDetail", { planId: nearestPlan.id })}
                  strongest
                  status={getPlanStatus(nearestPlan)}
                />
              )
              : null}
            {upcomingPlans
              .filter((item) => item.id !== nearestPlan?.id)
              .map((plan) =>
                (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    onPress={() => navigation.navigate("PlanDetail", { planId: plan.id })}
                    status={getPlanStatus(plan)}
                  />
                ),
              )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );

  const CalendarScreen = ({ navigation }: { navigation: any }) => (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>Takvim</Text>
        <Text style={styles.subheading}>
          Plan olan gunler isaretli. Bir gun secip planlarini goruntule.
        </Text>
        <FeedbackBanner feedback={feedback} />

        <View style={styles.card}>
          <View style={styles.monthHeader}>
            <Pressable
              style={styles.monthArrow}
              onPress={() =>
                setMonthCursor(
                  (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1),
                )
              }
            >
              <Text style={styles.monthArrowText}>{"<"}</Text>
            </Pressable>
            <Text style={styles.monthLabel}>{monthLabel}</Text>
            <Pressable
              style={styles.monthArrow}
              onPress={() =>
                setMonthCursor(
                  (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1),
                )
              }
            >
              <Text style={styles.monthArrowText}>{">"}</Text>
            </Pressable>
          </View>

          <View style={styles.weekRow}>
            {WEEK_DAYS.map((label) => (
              <Text key={label} style={styles.weekLabel}>
                {label}
              </Text>
            ))}
          </View>

          <View style={styles.daysGrid}>
            {calendarDays.map((cell) => {
              const hasPlan = Boolean(plansByDay[cell.key]?.length);
              const isSelected = selectedDayKey === cell.key;
              return (
                <Pressable
                  key={cell.key}
                  style={[
                    styles.dayCell,
                    !cell.inCurrentMonth && styles.dayCellMuted,
                    isSelected && styles.dayCellSelected,
                  ]}
                  onPress={() => {
                    setSelectedDayKey(cell.key);
                    if (!cell.inCurrentMonth) {
                      setMonthCursor(
                        new Date(cell.date.getFullYear(), cell.date.getMonth(), 1),
                      );
                    }
                  }}
                >
                  <Text
                    style={[
                      styles.dayNumber,
                      !cell.inCurrentMonth && styles.dayNumberMuted,
                      isSelected && styles.dayNumberSelected,
                    ]}
                  >
                    {cell.date.getDate()}
                  </Text>
                  {hasPlan ? <View style={styles.dayDot} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Secili Gun: {formatDayLabel(selectedDayKey)}</Text>
          {selectedDayPlans.length === 0 ? (
            <EmptyState message="Bu gun icin plan yok." />
          ) : null}
          {selectedDayPlans.map((plan) =>
            (
              <PlanCard
                key={plan.id}
                plan={plan}
                onPress={() => navigation.navigate("PlanDetail", { planId: plan.id })}
                status={getPlanStatus(plan)}
              />
            ),
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );

  const CreatePlanScreen = () => (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <Text style={styles.heading}>Yeni Plan</Text>
          <Text style={styles.subheading}>
            Yeni bir bulusma olustur, davet kodunu arkadasinla paylas.
          </Text>
          <FeedbackBanner feedback={feedback} />

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Plan Olustur</Text>

            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Plan basligi (orn: Kahve bulusmasi)"
              placeholderTextColor="#6c727f"
              style={styles.input}
            />
            <TextInput
              value={friendName}
              onChangeText={setFriendName}
              placeholder="Arkadas adi"
              placeholderTextColor="#6c727f"
              style={styles.input}
            />
            <TextInput
              value={location}
              onChangeText={setLocation}
              placeholder="Konum (opsiyonel)"
              placeholderTextColor="#6c727f"
              style={styles.input}
            />
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Not (opsiyonel)"
              placeholderTextColor="#6c727f"
              style={[styles.input, styles.noteInput]}
              multiline
            />

            <Pressable
              onPress={() => setShowDatePicker((prev) => !prev)}
              style={styles.dateButton}
            >
              <Text style={styles.dateButtonText}>
                Tarih/Saat: {formatDateTime(eventDate.getTime())}
              </Text>
            </Pressable>

            {showDatePicker ? (
              <DateTimePicker
                value={eventDate}
                mode="datetime"
                onChange={onDateChange}
                minimumDate={new Date()}
                display={Platform.OS === "ios" ? "inline" : "default"}
              />
            ) : null}

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>2 gun once hatirlat</Text>
              <Switch value={reminderTwoDays} onValueChange={setReminderTwoDays} />
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>1 gun once hatirlat</Text>
              <Switch value={reminderOneDay} onValueChange={setReminderOneDay} />
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Ayni gun 09:00 hatirlat</Text>
              <Switch value={reminderMorning} onValueChange={setReminderMorning} />
            </View>

            <Pressable
              style={[styles.primaryButton, busy ? styles.disabledButton : undefined]}
              onPress={createPlan}
              disabled={busy || authLoading}
            >
              <Text style={styles.primaryButtonText}>
                {busy ? "Kaydediliyor..." : "Plan Olustur"}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );

  const PlanDetailScreen = ({
    route,
    navigation,
  }: {
    route: { params: { planId: string } };
    navigation: any;
  }) => {
    const plan = sortedPlans.find((item) => item.id === route.params.planId);

    if (!plan) {
      return (
        <SafeAreaView style={styles.screen}>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.heading}>Plan Detay</Text>
            <View style={styles.card}>
              <EmptyState message="Plan bulunamadi veya silinmis." />
              <Pressable style={styles.secondaryButton} onPress={() => navigation.goBack()}>
                <Text style={styles.secondaryButtonText}>Geri Don</Text>
              </Pressable>
            </View>
          </ScrollView>
        </SafeAreaView>
      );
    }

    const reminderSummary: string[] = [];
    if (plan.reminderTwoDays) reminderSummary.push("2 gun once");
    if (plan.reminderOneDay) reminderSummary.push("1 gun once");
    if (plan.reminderMorning) reminderSummary.push("Ayni gun 09:00");

    const handleLeaveOrDelete = () => {
      Alert.alert(
        "Onay",
        plan.createdBy === userId
          ? "Bu plani silmek istiyor musun?"
          : "Bu plandan ayrilmak istiyor musun?",
        [
          { text: "Vazgec", style: "cancel" },
          {
            text: "Evet",
            style: "destructive",
            onPress: async () => {
              const ok = await leaveOrDeletePlan(plan);
              if (ok) {
                navigation.goBack();
              }
            },
          },
        ],
      );
    };

    return (
      <SafeAreaView style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.heading}>Plan Detay</Text>
          <FeedbackBanner feedback={feedback} />

          <View style={styles.card}>
            <Text style={styles.detailTitle}>{plan.title}</Text>
            <Text style={styles.detailRow}>Arkadas: {plan.friendName}</Text>
            <Text style={styles.detailRow}>Tarih/Saat: {formatDateTime(plan.eventAt)}</Text>
            <Text style={styles.detailRow}>
              Konum: {plan.location ? plan.location : "Belirtilmedi"}
            </Text>
            <Text style={styles.detailRow}>Not: {plan.note ? plan.note : "Yok"}</Text>
            <Text style={styles.detailRow}>Davet Kodu: {plan.inviteCode}</Text>
            <Text style={styles.detailRow}>
              Hatirlatmalar:{" "}
              {reminderSummary.length ? reminderSummary.join(", ") : "Kapali"}
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Katilimcilar ({plan.participants.length})</Text>
            {plan.participants.map((participantId) => (
              <Text key={participantId} style={styles.participantItem}>
                {participantId}
              </Text>
            ))}
          </View>

          <View style={styles.card}>
            <Pressable style={styles.smallAction} onPress={() => addPlanToCalendar(plan)}>
              <Text style={styles.smallActionText}>Takvime Ekle</Text>
            </Pressable>

            {plan.createdBy !== userId ? (
              <Pressable style={styles.secondaryButton} onPress={handleLeaveOrDelete}>
                <Text style={styles.secondaryButtonText}>Plandan Ayril</Text>
              </Pressable>
            ) : null}

            {plan.createdBy === userId ? (
              <Pressable style={[styles.secondaryButton, styles.dangerAction]} onPress={handleLeaveOrDelete}>
                <Text style={styles.secondaryButtonText}>Plani Sil</Text>
              </Pressable>
            ) : null}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  };

  const MainTabs = () => (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#155eef",
        tabBarInactiveTintColor: "#64748b",
        tabBarLabelStyle: { fontWeight: "700" },
        tabBarStyle: { height: 64, paddingBottom: 8, paddingTop: 8 },
      }}
    >
      <Tab.Screen name="Ana Sayfa" component={HomeScreen} />
      <Tab.Screen name="Takvim" component={CalendarScreen} />
      <Tab.Screen name="Yeni Plan" component={CreatePlanScreen} />
    </Tab.Navigator>
  );

  return (
    <>
      <StatusBar style="dark" />
      <NavigationContainer>
        <RootStack.Navigator>
          <RootStack.Screen
            name="MainTabs"
            component={MainTabs}
            options={{ headerShown: false }}
          />
          <RootStack.Screen
            name="PlanDetail"
            component={PlanDetailScreen}
            options={{ title: "Plan Detay" }}
          />
        </RootStack.Navigator>
      </NavigationContainer>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f3f4f8" },
  keyboardAvoid: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 36, gap: 14 },
  heading: { marginTop: 12, fontSize: 30, fontWeight: "800", color: "#13203a" },
  subheading: { marginTop: -4, color: "#475467", lineHeight: 20 },
  inlineLoading: { flexDirection: "row", alignItems: "center", gap: 8 },
  loadingText: { color: "#475467" },
  feedbackBox: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1 },
  feedbackOk: { backgroundColor: "#eafaf0", borderColor: "#93d5ac" },
  feedbackError: { backgroundColor: "#ffefef", borderColor: "#f6a7a7" },
  feedbackText: { color: "#1f2937", fontWeight: "600" },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d9dde4",
    padding: 14,
    gap: 10,
  },
  cardTitle: { fontSize: 18, fontWeight: "700", color: "#18263f" },
  input: {
    backgroundColor: "#f8faff",
    borderWidth: 1,
    borderColor: "#d2dae6",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#111827",
  },
  noteInput: { minHeight: 74, textAlignVertical: "top" },
  dateButton: {
    backgroundColor: "#eff5ff",
    borderColor: "#c8d8f3",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dateButtonText: { color: "#223457", fontWeight: "600" },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  switchLabel: { color: "#223457", fontWeight: "500" },
  primaryButton: {
    backgroundColor: "#155eef",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryButtonText: { color: "#ffffff", fontWeight: "700" },
  secondaryButton: {
    backgroundColor: "#0f172a",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryButtonText: { color: "#ffffff", fontWeight: "700" },
  disabledButton: { opacity: 0.6 },
  emptyText: { color: "#64748b" },
  planCard: {
    borderWidth: 1,
    borderColor: "#d6dbe8",
    borderRadius: 14,
    padding: 12,
    backgroundColor: "#fcfdff",
    gap: 4,
  },
  nearestPlanCard: { borderColor: "#6f9df3", backgroundColor: "#edf3ff" },
  nearestBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#155eef",
    color: "#fff",
    fontWeight: "700",
    fontSize: 12,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 4,
  },
  planTitle: { fontSize: 16, fontWeight: "700", color: "#1e293b" },
  planMeta: { color: "#334155" },
  inviteCode: { marginTop: 6, color: "#113576", fontWeight: "700" },
  detailLink: {
    marginTop: 8,
    color: "#155eef",
    fontWeight: "700",
  },
  detailTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#13203a",
    marginBottom: 6,
  },
  detailRow: {
    color: "#334155",
    lineHeight: 21,
  },
  participantItem: {
    backgroundColor: "#f3f6fc",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: "#223457",
    fontWeight: "500",
  },
  planActions: { flexDirection: "row", gap: 8, marginTop: 8 },
  smallAction: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: "#155eef",
    alignItems: "center",
    paddingVertical: 9,
  },
  dangerAction: { backgroundColor: "#be123c" },
  smallActionText: { color: "#fff", fontWeight: "700" },
  monthHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  monthArrow: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: "#e9eef8",
    alignItems: "center",
    justifyContent: "center",
  },
  monthArrowText: { color: "#1f2a44", fontWeight: "800" },
  monthLabel: { fontSize: 16, fontWeight: "700", color: "#1e293b" },
  weekRow: { flexDirection: "row" },
  weekLabel: {
    width: "14.285%",
    textAlign: "center",
    fontWeight: "700",
    color: "#64748b",
    fontSize: 12,
  },
  daysGrid: { flexDirection: "row", flexWrap: "wrap" },
  dayCell: {
    width: "14.285%",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    borderRadius: 10,
    marginTop: 4,
  },
  dayCellMuted: { opacity: 0.45 },
  dayCellSelected: { backgroundColor: "#dbeafe" },
  dayNumber: { color: "#1e293b", fontWeight: "600" },
  dayNumberMuted: { color: "#64748b" },
  dayNumberSelected: { color: "#0f3eb3", fontWeight: "700" },
  dayDot: {
    marginTop: 2,
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: "#155eef",
  },
  missingConfigWrap: { flex: 1, justifyContent: "center", paddingHorizontal: 20 },
  missingTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 8,
  },
  missingText: { color: "#334155", lineHeight: 22 },
});
