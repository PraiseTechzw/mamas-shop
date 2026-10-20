import {
  AppText,
  Card,
  Field,
  Page,
  PrimaryButton,
  StatusBadge,
} from "@/components/ui/primitives";
import { colors } from "@/constants/theme";
import { getShopSettings, saveShopSettings } from "@/db/repositories/settings";
import { useAuth } from "@/features/auth/auth-context";
import { useSyncStatus } from "@/features/sync/sync-context";
import { formatDateTime, setAppCurrency } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { retrySyncConflicts } from "@/services/sync-engine";
import { router } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import {
  Banknote,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Cloud,
  Database,
  Info,
  Languages,
  LogOut,
  Package,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Store,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react-native";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Alert, Image, Pressable, StyleSheet, View } from "react-native";

export function SettingsScreen() {
  const signOut = async () => {
    const result = await supabase?.auth.signOut();
    if (result?.error) Alert.alert("Could not sign out", result.error.message);
    else router.replace("/(auth)/welcome");
  };
  const showLanguageInfo = () =>
    Alert.alert("Language", "English is currently the available app language.");

  return (
    <Page title="Settings" subtitle="Manage your shop and app preferences.">
      <Card style={{ gap: 2, paddingVertical: 5 }}>
        <SettingsRow
          title="Business Details"
          subtitle="Shop name and stock reminders"
          icon={Store}
          onPress={() => router.push("/settings/business")}
        />
        <SettingsRow
          title="Shop Team"
          subtitle="See the people connected to this shop"
          icon={Users}
          onPress={() => router.push("/settings/team")}
        />
        <SettingsRow
          title="Currency & Receipt"
          subtitle="Set your currency and preview receipt totals"
          icon={Banknote}
          onPress={() => router.push("/settings/currency")}
        />
        <SettingsRow
          title="Offline & Sync"
          subtitle="Local saves and cloud sync status"
          icon={Wifi}
          onPress={() => router.push("/settings/sync")}
        />
        <SettingsRow
          title="Backup & Restore"
          subtitle="See device and cloud data protection"
          icon={Database}
          onPress={() => router.push("/settings/backup")}
        />
        <SettingsRow
          title="Language"
          subtitle="Choose the app language"
          icon={Languages}
          value="English"
          onPress={showLanguageInfo}
        />
        <SettingsRow
          title="Help & Support"
          subtitle="Offline use and sync guidance"
          icon={CircleHelp}
          onPress={() => router.push("/settings/help")}
        />
        <SettingsRow
          title="About"
          subtitle="About Mama's Shop"
          icon={Info}
          onPress={() => router.push("/settings/about")}
        />
      </Card>
      <Pressable
        accessibilityRole="button"
        onPress={() => void signOut()}
        style={styles.signout}
      >
        <LogOut size={18} color={colors.danger} />
        <AppText variant="label" color={colors.danger}>
          Log out
        </AppText>
      </Pressable>
    </Page>
  );
}

function SettingsRow({
  title,
  subtitle,
  icon: Icon,
  value,
  onPress,
}: {
  title: string;
  subtitle: string;
  icon: typeof Store;
  value?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}${value ? `, ${value}` : ""}`}
      onPress={onPress}
      style={styles.settingsRow}
    >
      <Icon size={18} color={colors.purple} />
      <View style={{ flex: 1 }}>
        <AppText variant="label">{title}</AppText>
        <AppText
          variant="small"
          color={colors.secondary}
          style={{ marginTop: 2 }}
        >
          {subtitle}
        </AppText>
      </View>
      {value ? (
        <AppText variant="small" color={colors.secondary}>
          {value}
        </AppText>
      ) : null}
      <ChevronRight size={17} color={colors.secondary} />
    </Pressable>
  );
}

export function BusinessDetailsScreen() {
  return <ShopSettingsEditor section="business" />;
}

export function CurrencyReceiptScreen() {
  return <ShopSettingsEditor section="currency" />;
}

function ShopSettingsEditor({ section }: { section: "business" | "currency" }) {
  const db = useSQLiteContext();
  const { session, businessId } = useAuth();
  const owner = businessId ?? session?.user.id ?? "";
  const business = section === "business";
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [alerts, setAlerts] = useState(true);
  const [joinable, setJoinable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void getShopSettings(db, owner)
      .then((settings) => {
        if (!active) return;
        setName(settings.shop_name);
        setCurrency(settings.currency);
        setAppCurrency(settings.currency);
        setAlerts(Boolean(settings.low_stock_alerts));
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : "Shop settings could not be loaded.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    if (business && session?.user.id === owner && supabase) {
      void supabase.rpc("get_my_business_joinable").then(({ data }) => {
        if (active) setJoinable(data === true);
      });
    }
    return () => {
      active = false;
    };
  }, [db, owner, business, session?.user.id]);

  const save = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (business && session?.user.id === owner) {
        if (!supabase) throw new Error("Connect to the internet to update who can find and join your shop.");
        const { error: accessError } = await supabase.rpc("set_business_joinable", {
          p_enabled: joinable,
          p_business_name: name.trim(),
        });
        if (accessError) throw accessError;
      }
      await saveShopSettings(db, owner, name, currency, alerts);
      setAppCurrency(currency);
      setMessage("Your shop preferences have been updated.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Shop settings could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page
      title={business ? "Business Details" : "Currency & Receipt"}
      subtitle={
        business
          ? "Keep your shop profile up to date."
          : "Choose the currency used for shop totals."
      }
      back
      footer={
        !loading ? (
          <View className="gap-2">
            {error ? (
              <AppText variant="small" color={colors.danger}>
                {error}
              </AppText>
            ) : null}
            {message ? (
              <AppText variant="small" color={colors.success}>
                {message}
              </AppText>
            ) : null}
            <PrimaryButton
              label={busy ? "Saving…" : business ? "Save business details" : "Save changes"}
              loading={busy}
              onPress={() => void save()}
            />
          </View>
        ) : null
      }
    >
      {loading ? (
        <Card>
          <AppText color={colors.secondary}>Loading shop settings…</AppText>
        </Card>
      ) : business ? (
        <View className="gap-4">
          <View className="overflow-hidden rounded-3xl border border-line bg-surface">
            <View className="flex-row items-center gap-3 bg-brand px-4 py-4">
              <View className="h-12 w-12 items-center justify-center rounded-2xl bg-gold">
                <Store size={23} color={colors.deepPurple} />
              </View>
              <View className="min-w-0 flex-1 gap-0.5">
                <AppText variant="small" color={colors.surface}>BUSINESS PROFILE</AppText>
                <AppText variant="heading" color={colors.surface} numberOfLines={1}>
                  {name.trim() || "Your shop"}
                </AppText>
              </View>
            </View>
            <View className="gap-1 px-4 py-3">
              <AppText variant="small" color={colors.secondary}>
                Update how your shop appears and manage who can find it.
              </AppText>
            </View>
          </View>

          <Card className="gap-4">
            <View className="flex-row items-center gap-3">
              <View className="h-10 w-10 items-center justify-center rounded-xl bg-brand-tint">
                <Building2 size={19} color={colors.deepPurple} />
              </View>
              <View className="flex-1 gap-0.5">
                <AppText variant="heading">Shop identity</AppText>
                <AppText variant="small" color={colors.secondary}>
                  This name identifies your business in the app.
                </AppText>
              </View>
            </View>
            <Field
              label="Shop name"
              value={name}
              onChangeText={(value) => {
                setName(value);
                setMessage("");
              }}
              placeholder="Mama’s Shop"
              autoCapitalize="words"
              returnKeyType="done"
            />
          </Card>

          {session?.user.id === owner ? (
            <Card className="gap-3">
              <View className="flex-row items-center gap-3">
                <View className="h-10 w-10 items-center justify-center rounded-xl bg-brand-tint">
                  <Users size={19} color={colors.deepPurple} />
                </View>
                <View className="min-w-0 flex-1 gap-0.5">
                  <AppText variant="heading">Team access</AppText>
                  <AppText variant="small" color={colors.secondary}>
                    Choose whether staff can find this shop.
                  </AppText>
                </View>
                <StatusBadge
                  label={joinable ? "Open" : "Private"}
                  tone={joinable ? "green" : "purple"}
                />
              </View>
              <Pressable
                onPress={() => {
                  setJoinable((value) => !value);
                  setMessage("");
                }}
                className={`min-h-16 flex-row items-center gap-3 rounded-2xl border px-3 py-3 ${joinable ? "border-brand bg-brand-tint" : "border-line bg-surface"}`}
                accessibilityRole="switch"
                accessibilityState={{ checked: joinable }}
              >
                <View className="min-w-0 flex-1 gap-0.5">
                  <AppText variant="label">
                    Let people find and join this shop
                  </AppText>
                  <AppText variant="small" color={colors.secondary}>
                    Only the shop name is listed. Your records remain private.
                  </AppText>
                </View>
                <View
                  className={`h-7 w-12 justify-center rounded-full px-1 ${joinable ? "bg-brand" : "bg-line"}`}
                >
                  <View
                    className={`h-5 w-5 rounded-full ${joinable ? "self-end bg-gold" : "self-start bg-surface"}`}
                  />
                </View>
              </Pressable>
              <View className="flex-row items-start gap-2 rounded-xl bg-gold/15 px-3 py-2.5">
                <Info size={16} color={colors.deepPurple} />
                <AppText variant="small" color={colors.deepPurple} style={{ flex: 1 }}>
                  {joinable
                    ? "Your shop will appear in the Join a shop list after you save."
                    : "Your shop is hidden from staff discovery until you turn this on and save."}
                </AppText>
              </View>
            </Card>
          ) : null}

          <Card className="gap-3">
            <View className="flex-row items-center gap-3">
              <View className="h-10 w-10 items-center justify-center rounded-xl bg-brand-tint">
                <Package size={19} color={colors.deepPurple} />
              </View>
              <View className="min-w-0 flex-1 gap-0.5">
                <AppText variant="heading">Stock reminders</AppText>
                <AppText variant="small" color={colors.secondary}>
                  Get a visual reminder when products need restocking.
                </AppText>
              </View>
              <StatusBadge
                label={alerts ? "On" : "Off"}
                tone={alerts ? "green" : "purple"}
              />
            </View>
            <Pressable
              onPress={() => {
                setAlerts((value) => !value);
                setMessage("");
              }}
              className={`min-h-12 flex-row items-center justify-between rounded-2xl border px-3 ${alerts ? "border-brand bg-brand-tint" : "border-line bg-surface"}`}
              accessibilityRole="switch"
              accessibilityState={{ checked: alerts }}
            >
              <AppText variant="label">Low stock reminders</AppText>
              <View
                className={`h-7 w-12 justify-center rounded-full px-1 ${alerts ? "bg-brand" : "bg-line"}`}
              >
                <View
                  className={`h-5 w-5 rounded-full ${alerts ? "self-end bg-gold" : "self-start bg-surface"}`}
                />
              </View>
            </Pressable>
          </Card>
        </View>
      ) : (
        <Card style={{ gap: 14 }}>
          <AppText variant="heading">Shop currency</AppText>
              <AppText variant="small" color={colors.secondary}>
                Existing amounts remain unchanged; new totals use this currency.
              </AppText>
              <View style={styles.wrap}>
                {["USD", "ZWL", "ZAR", "BWP"].map((code) => {
                  const selected = currency === code;
                  return (
                    <Pressable
                      key={code}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      onPress={() => {
                        setCurrency(code);
                        setMessage("");
                      }}
                      style={[styles.chip, selected && styles.selected]}
                    >
                      <AppText
                        variant="label"
                        color={selected ? colors.deepPurple : colors.secondary}
                      >
                        {code}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.receiptPreview}>
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                >
                  <Building2 size={17} color={colors.purple} />
                  <AppText variant="label" numberOfLines={1}>
                    {name || "Your shop"}
                  </AppText>
                </View>
                <View style={styles.previewLine}>
                  <AppText variant="small" color={colors.secondary}>
                    Receipt total
                  </AppText>
                  <AppText variant="label">
                    {new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency,
                    }).format(12.5)}
                  </AppText>
                </View>
              </View>
        </Card>
      )}
    </Page>
  );
}

export function HelpAndSupportScreen() {
  const [expandedQuestion, setExpandedQuestion] = useState<number | null>(0);
  const answers = [
    {
      question: "Can I use the app without internet?",
      answer:
        "Yes. Sales, stock updates, and customer credit save on this device first. You can keep working while offline; saved changes sync when a connection returns.",
    },
    {
      question: "Where can I check whether my changes synced?",
      answer:
        "Open Offline & Sync to see your connection, queued changes, and any items that need review. You can retry a sync when you are online.",
    },
    {
      question: "How do I record a customer payment?",
      answer:
        "Open Customers, select the customer, and use Record Repayment. The payment is saved to the customer’s account history.",
    },
    {
      question: "How do I update product quantities?",
      answer:
        "Open Inventory and choose the product action for receiving stock or correcting a count. Stock changes are kept in the product history.",
    },
  ];

  return (
    <Page
      title="Help & Support"
      subtitle="Quick answers to help you run your shop."
      back
    >
      <View className="gap-4">
        <View className="overflow-hidden rounded-3xl bg-brand px-5 py-5">
          <View className="mb-4 h-11 w-11 items-center justify-center rounded-2xl bg-white/15">
            <CircleHelp size={23} color={colors.surface} />
          </View>
          <AppText variant="heading" color={colors.surface}>
            How can we help?
          </AppText>
          <AppText color={colors.lavenderTint} style={{ marginTop: 5, lineHeight: 21 }}>
            Find quick guidance for everyday shop tasks and offline use.
          </AppText>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/settings/sync")}
            className="mt-4 min-h-11 flex-row items-center justify-center gap-2 rounded-xl bg-white px-4 active:opacity-80"
          >
            <Wifi size={17} color={colors.deepPurple} />
            <AppText variant="label" color={colors.deepPurple}>
              Check sync status
            </AppText>
            <ChevronRight size={17} color={colors.deepPurple} />
          </Pressable>
        </View>

        <View className="gap-2">
          <AppText variant="heading">Browse help</AppText>
          <View className="overflow-hidden rounded-2xl border border-line bg-surface">
            <HelpTopic
              icon={ShoppingBag}
              title="Sales"
              subtitle="Record a sale and take payment"
            />
            <HelpTopic
              icon={Package}
              title="Inventory"
              subtitle="Receive stock and adjust quantities"
            />
            <HelpTopic
              icon={Users}
              title="Customer credit"
              subtitle="Manage balances and repayments"
              last
            />
          </View>
        </View>

        <View className="gap-2">
          <AppText variant="heading">Frequently asked questions</AppText>
          <View className="overflow-hidden rounded-2xl border border-line bg-surface px-4">
            {answers.map(({ question, answer }, index) => {
              const expanded = expandedQuestion === index;
              return (
                <Pressable
                  key={question}
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
                  onPress={() => setExpandedQuestion(expanded ? null : index)}
                  className={`py-3.5 ${index < answers.length - 1 ? "border-b border-line" : ""}`}
                >
                  <View className="flex-row items-center justify-between gap-3">
                    <AppText variant="label" style={{ flex: 1 }}>
                      {question}
                    </AppText>
                    <ChevronDown
                      size={18}
                      color={colors.secondary}
                      className={expanded ? "rotate-180" : ""}
                    />
                  </View>
                  {expanded ? (
                    <AppText
                      color={colors.secondary}
                      style={{ marginTop: 9, lineHeight: 21 }}
                    >
                      {answer}
                    </AppText>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Page>
  );
}

export function BackupRestoreScreen() {
  const {
    connection,
    syncing,
    pending,
    failed,
    conflicts,
    lastSyncedAt,
    unavailable,
  } = useSyncStatus();
  const notConfigured = unavailable === "not-configured";
  const cloudStatus = notConfigured
    ? {
        label: "Device only",
        tone: "amber" as const,
        title: "Cloud sync is not set up",
        detail:
          "Your shop data remains on this device. Connect cloud sync to keep changes available across signed-in devices.",
      }
    : conflicts || failed
      ? {
          label: "Needs attention",
          tone: "red" as const,
          title: "Some changes need attention",
          detail: `${conflicts + failed} change${conflicts + failed === 1 ? "" : "s"} could not sync yet. Review the sync status for details.`,
        }
      : connection === "offline"
        ? {
            label: "Waiting for internet",
            tone: "amber" as const,
            title: "Cloud sync will resume online",
            detail:
              "You can keep using the app. New changes are saved on this device and will sync when a connection returns.",
          }
        : pending > 0
          ? {
              label: "Waiting to sync",
              tone: "amber" as const,
              title: `${pending} saved change${pending === 1 ? "" : "s"} waiting`,
              detail:
                "Your changes are safely queued on this device and will upload when sync is available.",
            }
          : syncing
            ? {
                label: "Syncing",
                tone: "purple" as const,
                title: "Your shop is syncing",
                detail:
                  "Keep the app connected while the latest changes are shared with your signed-in shop.",
              }
            : {
                label: lastSyncedAt ? "Up to date" : "Ready",
                tone: lastSyncedAt ? ("green" as const) : ("purple" as const),
                title: lastSyncedAt
                  ? "Cloud sync is up to date"
                  : "Cloud sync is ready",
                detail:
                  "When cloud sync is configured and connected, shop changes are shared with your signed-in devices.",
              };

  return (
    <Page
      title="Backup & Restore"
      subtitle="Understand where your shop data is kept."
      back
    >
      <View className="gap-4">
        <View className="overflow-hidden rounded-3xl bg-brand px-5 py-5">
          <View className="mb-4 h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
            <ShieldCheck size={25} color={colors.surface} />
          </View>
          <AppText variant="heading" color={colors.surface}>
            Your shop data, protected
          </AppText>
          <AppText
            color={colors.surface}
            style={{ marginTop: 6, lineHeight: 21, opacity: 0.88 }}
          >
            Work continues offline. Changes save on this device first, then sync
            to your shop when cloud sync is available.
          </AppText>
        </View>

        <View className="gap-2">
          <AppText variant="heading">Your data locations</AppText>
          <View className="gap-3 rounded-2xl border border-line bg-surface p-4">
            <View className="flex-row items-start gap-3">
              <View className="h-10 w-10 items-center justify-center rounded-xl bg-brand-tint">
                <Smartphone size={19} color={colors.deepPurple} />
              </View>
              <View className="min-w-0 flex-1 gap-1">
                <View className="flex-row flex-wrap items-center justify-between gap-2">
                  <AppText variant="label">On this device</AppText>
                  <StatusBadge label="Saved locally" tone="green" />
                </View>
                <AppText
                  variant="small"
                  color={colors.secondary}
                  style={{ lineHeight: 19 }}
                >
                  Sales, stock, and customer records are stored locally so the
                  app remains usable without internet.
                </AppText>
              </View>
            </View>
            <View className="h-px bg-line" />
            <View className="flex-row items-start gap-3">
              <View className="h-10 w-10 items-center justify-center rounded-xl bg-brand-tint">
                <Cloud size={19} color={colors.purple} />
              </View>
              <View className="min-w-0 flex-1 gap-1">
                <View className="flex-row flex-wrap items-center justify-between gap-2">
                  <AppText variant="label">Cloud sync</AppText>
                  <StatusBadge
                    label={cloudStatus.label}
                    tone={cloudStatus.tone}
                  />
                </View>
                <AppText
                  variant="small"
                  color={colors.secondary}
                  style={{ lineHeight: 19 }}
                >
                  {cloudStatus.detail}
                </AppText>
                {lastSyncedAt ? (
                  <AppText
                    variant="small"
                    color={colors.secondary}
                    style={{ marginTop: 2 }}
                  >
                    Last successful sync · {formatDateTime(lastSyncedAt)}
                  </AppText>
                ) : null}
              </View>
            </View>
          </View>
        </View>

        <View className="gap-2">
          <AppText variant="heading">Manual backup & restore</AppText>
          <View className="gap-2 rounded-2xl border border-line bg-surface p-4">
            <View className="flex-row items-center gap-2">
              <Database size={17} color={colors.purple} />
              <AppText variant="label">Not available yet</AppText>
            </View>
            <AppText
              variant="small"
              color={colors.secondary}
              style={{ lineHeight: 20 }}
            >
              Exporting a backup file and restoring from one are not available
              in this version. Cloud sync helps share changes, but it is not a
              downloadable backup file.
            </AppText>
          </View>
        </View>

        <PrimaryButton
          label="Open sync status"
          onPress={() => router.push("/settings/sync")}
          icon={<Wifi size={17} color={colors.surface} />}
        />
      </View>
    </Page>
  );
}

function HelpTopic({
  icon: Icon,
  title,
  subtitle,
  last = false,
}: {
  icon: typeof ShoppingBag;
  title: string;
  subtitle: string;
  last?: boolean;
}) {
  return (
    <View
      className={`flex-row items-center gap-3 px-4 py-3 ${last ? "" : "border-b border-line"}`}
    >
      <View className="h-10 w-10 items-center justify-center rounded-xl bg-brand-tint">
        <Icon size={18} color={colors.deepPurple} />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <AppText variant="label">{title}</AppText>
        <AppText variant="small" color={colors.secondary}>
          {subtitle}
        </AppText>
      </View>
    </View>
  );
}

export function AboutScreen() {
  return (
    <Page title="About" subtitle="Mama's Shop" back>
      <View className="overflow-hidden rounded-3xl border border-brand/15 bg-surface">
        <View className="items-center bg-brand-tint px-5 py-6">
          <View className="mb-3 h-16 w-16 items-center justify-center rounded-2xl bg-surface">
            <Store size={31} color={colors.deepPurple} />
          </View>
          <AppText variant="heading">Mama&apos;s Shop</AppText>
          <AppText
            variant="small"
            color={colors.secondary}
            style={{ marginTop: 3 }}
          >
            Version 1.0.0
          </AppText>
        </View>
        <View className="gap-2 px-5 py-4">
          <AppText
            variant="label"
            color={colors.deepPurple}
            style={{ textAlign: "center" }}
          >
            Small business · Big dreams
          </AppText>
          <AppText
            color={colors.secondary}
            style={{ textAlign: "center", lineHeight: 22 }}
          >
            A simple, offline-first shop manager for recording sales, keeping
            stock accurate, and tracking customer credit.
          </AppText>
        </View>
      </View>

      <View className="gap-2">
        <AppText variant="heading">Made for everyday shopkeeping</AppText>
        <View className="overflow-hidden rounded-2xl border border-line bg-surface px-4">
          <AboutFeatureRow
            icon={<ShoppingCart size={17} color={colors.purple} />}
            title="Sales & checkout"
            description="Record cash, card, EcoCash, or credit sales with itemised receipts."
          />
          <AboutFeatureRow
            icon={<Package size={17} color={colors.success} />}
            title="Inventory management"
            description="Track stock levels, receive deliveries, and get low-stock reminders."
          />
          <AboutFeatureRow
            icon={<Users size={17} color={colors.warning} />}
            title="Customer credit"
            description="Keep a running tab for trusted customers and record repayments over time."
          />
          <AboutFeatureRow
            icon={<WifiOff size={17} color={colors.deepPurple} />}
            title="Works offline"
            description="All data saves on-device first and syncs to the cloud when you reconnect."
            last
          />
        </View>
      </View>

      <View className="gap-3 rounded-2xl border border-brand/20 bg-brand-tint p-4">
        <View className="flex-row items-center gap-2">
          <ShieldCheck size={18} color={colors.purple} />
          <AppText variant="label">Offline-ready by design</AppText>
        </View>
        <AppText
          variant="small"
          color={colors.secondary}
          style={{ lineHeight: 20 }}
        >
          Sales, stock, and customer credit are saved on this device first. When
          you sign in and reconnect, queued changes sync to your shop.
        </AppText>
      </View>

      <View className="overflow-hidden rounded-2xl border border-line bg-surface px-4">
        <AboutLinkRow
          label="Privacy information"
          onPress={() =>
            Alert.alert(
              "Privacy information",
              "Your shop records are stored on this device. When cloud sync is configured, changes are synced for your signed-in shop.",
            )
          }
        />
        <AboutLinkRow
          label="Terms of use"
          onPress={() =>
            Alert.alert(
              "Terms of use",
              "Mama's Shop helps you manage shop sales, stock, and customer credit. Keep your sign-in details secure.",
            )
          }
        />
        <AboutLinkRow
          label="Open-source licences"
          last
          onPress={() =>
            Alert.alert(
              "Open-source licences",
              "This app uses open-source software. Licence information is available from the individual project maintainers.",
            )
          }
        />
      </View>

      <AppText
        variant="small"
        color={colors.secondary}
        style={{ textAlign: "center", marginTop: 4, marginBottom: 8 }}
      >
        © {new Date().getFullYear()} Mama&apos;s Shop · Made by Praise Masunga
        with ❤️ for traders
      </AppText>
    </Page>
  );
}

function AboutFeatureRow({
  icon,
  title,
  description,
  last,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  last?: boolean;
}) {
  return (
    <View
      className={`flex-row items-start gap-3 py-3 ${last ? "" : "border-b border-line"}`}
    >
      <View className="mt-px h-9 w-9 items-center justify-center rounded-xl bg-brand-tint">
        {icon}
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <AppText variant="label">{title}</AppText>
        <AppText
          variant="small"
          color={colors.secondary}
          style={{ lineHeight: 18 }}
        >
          {description}
        </AppText>
      </View>
    </View>
  );
}

function AboutLinkRow({
  label,
  onPress,
  last,
}: {
  label: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`min-h-14 flex-row items-center py-3 ${last ? "" : "border-b border-line"}`}
    >
      <View className="min-w-0 flex-1">
        <AppText variant="label">{label}</AppText>
      </View>
      <ChevronRight size={17} color={colors.secondary} />
    </Pressable>
  );
}

export function SyncSettingsScreen() {
  const db = useSQLiteContext();
  const { session, businessId } = useAuth();
  const ownerId = businessId ?? session?.user.id ?? "";
  const {
    connection,
    syncing,
    pending,
    failed,
    conflicts,
    lastSyncedAt,
    unavailable,
    syncNow,
    refreshConnection,
  } = useSyncStatus();
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [uploadErrors, setUploadErrors] = useState<{
    operation: string;
    entity_type: string;
    last_error: string;
    attempt_count: number;
  }[]>([]);
  useEffect(() => {
    let active = true;
    void db.getAllAsync<{
      operation: string;
      entity_type: string;
      last_error: string;
      attempt_count: number;
    }>(
      "SELECT operation, entity_type, last_error, attempt_count FROM sync_outbox WHERE owner_id = ? AND last_error IS NOT NULL ORDER BY created_at DESC LIMIT 10",
      ownerId,
    ).then((rows) => {
      if (active) setUploadErrors(rows);
    }).catch(() => {
      if (active) setUploadErrors([]);
    });
    return () => {
      active = false;
    };
  }, [db, ownerId, failed, pending, syncing]);
  const checkConnectionNow = async () => {
    setCheckingConnection(true);
    setConnectionError("");
    try {
      await refreshConnection();
    } catch (reason) {
      setConnectionError(
        reason instanceof Error
          ? reason.message
          : "Could not check the connection.",
      );
    } finally {
      setCheckingConnection(false);
    }
  };

  if (connection === "offline") {
    return (
      <Page
        title="Offline Mode"
        subtitle="Your shop is still ready to use."
        back
      >
        <View className="gap-4">
          <View className="items-center gap-3 rounded-3xl border border-brand/20 bg-surface px-5 py-6">
            <View className="h-16 w-16 items-center justify-center rounded-2xl bg-brand-tint">
              <WifiOff size={30} color={colors.purple} />
            </View>
            <StatusBadge label="Offline · saved on this device" tone="amber" />
            <AppText variant="heading" style={{ textAlign: "center" }}>
              Your shop is ready to use
            </AppText>
            <AppText
              color={colors.secondary}
              style={{ textAlign: "center", lineHeight: 21 }}
            >
              No internet connection right now. Your work stays saved here and
              can sync when you reconnect.
            </AppText>
          </View>
          <View className="gap-3 rounded-2xl border border-line bg-surface p-4">
            <AppText variant="label">You can keep working</AppText>
            <View className="flex-row flex-wrap gap-2">
              {["Record sales", "Update stock", "Manage customer credit"].map(
                (item) => (
                  <View
                    key={item}
                    className="min-h-10 flex-row items-center gap-2 rounded-xl bg-brand-tint px-3"
                  >
                    <Check size={15} color={colors.success} />
                    <AppText variant="small" color={colors.deepPurple}>
                      {item}
                    </AppText>
                  </View>
                ),
              )}
            </View>
          </View>
          {connectionError ? (
            <AppText variant="small" color={colors.danger}>
              {connectionError}
            </AppText>
          ) : null}
          <PrimaryButton label="Continue" onPress={() => router.back()} />
          <Pressable
            accessibilityRole="button"
            disabled={checkingConnection}
            onPress={() => void checkConnectionNow()}
            className="min-h-12 flex-row items-center justify-center gap-2 rounded-2xl border border-brand bg-surface active:bg-brand-tint disabled:opacity-60"
          >
            <Wifi size={17} color={colors.deepPurple} />
            <AppText variant="label" color={colors.deepPurple}>
              {checkingConnection ? "Checking connection…" : "Check connection"}
            </AppText>
          </Pressable>
        </View>
      </Page>
    );
  }

  const art =
    failed || conflicts
      ? require("@/assets/images/shop-illustrations/sync/sync-failed.png")
      : pending || syncing
        ? require("@/assets/images/shop-illustrations/sync/sync-pending.png")
        : require("@/assets/images/shop-illustrations/sync/sync-complete.png");
  const statusLabel =
    unavailable === "not-configured"
      ? "Setup needed"
      : unavailable === "signed-out"
        ? "Sign-in required"
        : connection === "checking"
          ? "Checking connection"
          : syncing
            ? "Syncing"
            : conflicts
              ? "Review needed"
              : failed
                ? "Retry needed"
                : pending
                  ? "Waiting to sync"
                  : "Up to date";
  const tone =
    conflicts || failed
      ? "red"
      : unavailable || pending || connection !== "online"
        ? "amber"
        : syncing
          ? "purple"
          : "green";
  const headline =
    unavailable === "not-configured"
      ? "Cloud sync needs setup"
      : unavailable === "signed-out"
        ? "Sign in to sync your shop"
        : conflicts
          ? "Changes need your review"
          : failed
            ? "Some changes will retry"
            : pending
              ? `${pending} saved ${pending === 1 ? "change" : "changes"} waiting`
              : "Your saved changes are up to date";
  const description =
    unavailable === "not-configured"
      ? "Your records stay on this device. Add your Supabase project connection and apply the sync migrations to enable cloud sync."
      : unavailable === "signed-out"
        ? "Sign in to connect this device to your shop and sync its saved changes."
        : conflicts
          ? `${conflicts} incoming change${conflicts === 1 ? "" : "s"} could not be applied safely. Review the details below before retrying.`
          : failed
            ? `${failed} change${failed === 1 ? "" : "s"} could not upload yet. The app will retry when a connection is available.`
          : "Changes sync for your signed-in shop. Financial and stock history is kept as individual events.";
  const distinctUploadErrors = [
    ...new Map(uploadErrors.map((row) => [row.last_error, row])).values(),
  ].slice(0, 3);

  return (
    <Page
      title="Sync status"
      subtitle="Changes save here first, then sync to your signed-in shop."
      back
    >
      <View className="gap-4">
        <View className="items-center gap-3 rounded-3xl border border-line bg-surface px-5 py-4">
          <Image
            source={art}
            resizeMode="contain"
            className="h-32 w-36"
            accessibilityLabel="Illustration of shop connection and syncing"
          />
          <StatusBadge label={statusLabel} tone={tone} />
          <AppText variant="heading" style={{ textAlign: "center" }}>
            {headline}
          </AppText>
          <AppText
            color={colors.secondary}
            style={{ textAlign: "center", lineHeight: 21 }}
          >
            {description}
          </AppText>
          {lastSyncedAt ? (
            <AppText variant="small" color={colors.secondary}>
              Last successful sync · {formatDateTime(lastSyncedAt)}
            </AppText>
          ) : null}
        </View>
        <View className="flex-row gap-2">
          <SyncCount label="Waiting" count={pending} tone="amber" />
          <SyncCount
            label="Retry"
            count={failed}
            tone={failed ? "red" : "green"}
          />
          <SyncCount
            label="Review"
            count={conflicts}
            tone={conflicts ? "red" : "green"}
          />
        </View>
        <PrimaryButton
          label={syncing ? "Syncing…" : failed > 0 ? "Retry sync now" : "Sync now"}
          loading={syncing}
          disabled={connection !== "online" || Boolean(unavailable)}
          onPress={() => void syncNow(true)}
        />
      {failed > 0 ? (
        <View className="gap-3 rounded-2xl border border-danger/20 bg-surface p-4">
          <View className="flex-row items-center gap-2">
            <CircleHelp size={18} color={colors.danger} />
            <AppText variant="label" color={colors.danger}>
              Why uploads are retrying
            </AppText>
          </View>
          <AppText variant="small" color={colors.secondary} style={{ lineHeight: 20 }}>
            These changes are still saved on this device and remain in the upload queue. They are not in the cloud yet.
          </AppText>
          {distinctUploadErrors.length ? distinctUploadErrors.map((row) => (
            <View key={row.last_error} className="gap-1 rounded-xl bg-danger/10 p-3">
              <AppText variant="small" color={colors.deepPurple}>
                {row.entity_type} · {row.operation} · {row.attempt_count} {row.attempt_count === 1 ? "attempt" : "attempts"}
              </AppText>
              <AppText variant="small" color={colors.secondary} style={{ lineHeight: 19 }}>
                {row.last_error}
              </AppText>
            </View>
          )) : (
            <AppText variant="small" color={colors.secondary}>
              No saved error detail is available. Use Sync now to retry and refresh the status.
            </AppText>
          )}
        </View>
      ) : null}
      </View>
      {conflicts ? (
        <SyncConflictReview
          db={db}
          ownerId={ownerId}
          onRetry={() => void syncNow(true)}
        />
      ) : null}
      <View className="gap-3 rounded-2xl border border-line bg-surface p-4">
        <View className="flex-row items-center gap-3">
          <View className="h-10 w-10 items-center justify-center rounded-xl bg-brand-tint">
            <Database size={18} color={colors.deepPurple} />
          </View>
          <View className="min-w-0 flex-1 gap-0.5">
            <AppText variant="label">On this device</AppText>
            <AppText variant="small" color={colors.secondary}>
              {pending > 0 ? "Saved here · waiting for cloud sync" : "Local records stay available offline"}
            </AppText>
          </View>
          <StatusBadge label={pending > 0 ? "On device" : "Saved"} tone={pending > 0 ? "amber" : "green"} />
        </View>
        <View className="h-px bg-line" />
        <View className="flex-row items-center gap-3">
          <View className="h-10 w-10 items-center justify-center rounded-xl bg-brand-tint">
            <Wifi size={18} color={colors.purple} />
          </View>
          <View className="min-w-0 flex-1 gap-0.5">
            <AppText variant="label">Cloud sync</AppText>
            <AppText variant="small" color={colors.secondary}>
              {pending} pending · {failed} upload retries · {conflicts}{" "}
              conflicts
            </AppText>
          </View>
          <StatusBadge
            label={
              unavailable
                ? "Not connected"
                : connection === "online"
                  ? "Available"
                  : "Offline"
            }
            tone={
              unavailable ? "amber" : connection === "online" ? "purple" : "amber"
            }
          />
        </View>
      </View>
    </Page>
  );
}

function SyncCount({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "amber" | "red" | "green";
}) {
  return (
    <View className="min-w-0 flex-1 items-center gap-1 rounded-2xl border border-line bg-surface px-2 py-3">
      <AppText
        variant="amount"
        color={
          tone === "red"
            ? colors.danger
            : tone === "green"
              ? colors.success
              : colors.warning
        }
      >
        {count}
      </AppText>
      <AppText variant="small" color={colors.secondary}>
        {label}
      </AppText>
    </View>
  );
}

function SyncConflictReview({
  db,
  ownerId,
  onRetry,
}: {
  db: ReturnType<typeof useSQLiteContext>;
  ownerId: string;
  onRetry: () => void;
}) {
  const [rows, setRows] = useState<
    { idempotency_key: string; description: string; created_at: string }[]
  >([]);
  const [busy, setBusy] = useState(false);
  const fetchRows = useCallback(() =>
    db.getAllAsync<{
      idempotency_key: string;
      description: string;
      created_at: string;
    }>(
      "SELECT idempotency_key, description, created_at FROM sync_conflicts WHERE owner_id = ? AND resolved_at IS NULL ORDER BY created_at DESC LIMIT 5",
      ownerId,
    ), [db, ownerId]);
  useEffect(() => {
    let active = true;
    void fetchRows().then((nextRows) => {
      if (active) setRows(nextRows);
    });
    return () => {
      active = false;
    };
  }, [fetchRows]);
  const retry = async () => {
    setBusy(true);
    try {
      await retrySyncConflicts(db, ownerId);
      setRows(await fetchRows());
      onRetry();
    } finally {
      setBusy(false);
    }
  };
  return (
    <View className="gap-3 rounded-2xl border border-danger/20 bg-surface p-4">
      <View className="flex-row items-center gap-2">
        <CircleHelp size={18} color={colors.danger} />
        <AppText variant="heading" color={colors.danger}>
          Changes to review
        </AppText>
      </View>
      {rows.map((row) => (
        <View
          key={row.idempotency_key}
          className="flex-row items-start gap-2 rounded-xl bg-danger/10 p-3"
        >
          <CircleHelp size={16} color={colors.danger} />
          <AppText variant="small" color={colors.secondary} style={{ flex: 1 }}>
            {row.description}
          </AppText>
        </View>
      ))}
      <AppText
        variant="small"
        color={colors.secondary}
        style={{ lineHeight: 20 }}
      >
        Sync retries changes automatically when their missing records arrive.
        If a stock change still conflicts with newer inventory, resolve it on
        the original device, then retry.
      </AppText>
      <PrimaryButton
        label={busy ? "Retrying…" : "Retry unresolved changes"}
        loading={busy}
        onPress={() => void retry()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 13,
    minHeight: 40,
    justifyContent: "center",
  },
  selected: {
    borderColor: colors.purple,
    backgroundColor: colors.lavenderTint,
  },
  settingsRow: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  signout: {
    minHeight: 52,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 9,
    backgroundColor: colors.dangerTint,
    borderRadius: 14,
  },
  receiptPreview: {
    gap: 13,
    padding: 13,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: 13,
    backgroundColor: colors.background,
  },
  previewLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingTop: 10,
  },
});
