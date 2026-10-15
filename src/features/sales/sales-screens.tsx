import { IllustratedEmptyState } from "@/components/feedback/illustrated-empty-state";
import {
  AppText,
  Card,
  Field,
  Page,
  PrimaryButton,
  SectionTitle,
  StatusBadge,
} from "@/components/ui/primitives";
import { colors } from "@/constants/theme";
import { getCustomer } from "@/db/repositories/customers";
import {
  listProductsForSale,
  listRecentSales,
  recordSale,
} from "@/db/repositories/sales";
import type {
  Customer,
  PaymentMethod,
  Product,
  SaleSummary,
} from "@/db/schema";
import { useAuth } from "@/features/auth/auth-context";
import { formatDateTime, formatMoney, toCents } from "@/lib/format";
import { useCart } from "@/stores/cart";
import { router } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import {
  Banknote,
  Check,
  CreditCard,
  Minus,
  Plus,
  ReceiptText,
  Search,
  Smartphone,
} from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

export function SalesScreen() {
  const db = useSQLiteContext();
  const { session } = useAuth();
  const ownerId = session?.user.id ?? "";
  const [rows, setRows] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const lines = useCart((state) => state.lines);
  const creditMode = useCart((state) => state.creditMode);
  const addProduct = useCart((state) => state.addProduct);
  const total = lines.reduce(
    (sum, item) => sum + Math.round(item.priceCents * item.quantity),
    0,
  );
  useEffect(() => {
    let active = true;
    void listProductsForSale(db, ownerId, search).then((data) => {
      if (active) setRows(data);
    });
    return () => {
      active = false;
    };
  }, [db, ownerId, search]);
  return (
    <Page
      title={creditMode ? "New credit sale" : "Quick sale"}
      subtitle={
        creditMode
          ? "Choose products for this customer account."
          : "Tap a product to add it to the sale."
      }
      right={
        <Pressable onPress={() => router.push("/sales/history")} hitSlop={8}>
          <ReceiptText size={21} stroke={colors.purple} />
        </Pressable>
      }
    >
      <View style={styles.searchBox}>
        <Search size={18} stroke={colors.secondary} />
        <Field
          label=""
          accessibilityLabel="Search products"
          placeholder="Search products or categories"
          value={search}
          onChangeText={setSearch}
          containerStyle={{ flex: 1 }}
        />
      </View>
      <View style={styles.categoryRow}>
        <StatusBadge label="In stock" />
        <AppText variant="small" color={colors.secondary}>
          Only items ready to sell are shown
        </AppText>
      </View>
      {!rows.length ? (
        <IllustratedEmptyState
          image={require("@/assets/images/shop-illustrations/inventory/empty-cart.png")}
          title={search ? "No matching products" : "No products ready to sell"}
          description={
            search
              ? "Try another name or category."
              : "Add products and receive stock before recording your first sale."
          }
          action={
            <PrimaryButton
              label={search ? "Clear search" : "Open inventory"}
              onPress={
                search
                  ? () => setSearch("")
                  : () => router.push("/(tabs)/inventory")
              }
            />
          }
        />
      ) : (
        <View style={styles.productGrid}>
          {rows.map((product) => {
            const inCart = lines.find((line) => line.productId === product.id);
            return (
              <Pressable
                key={product.id}
                onPress={() => addProduct(product)}
                style={({ pressed }) => [
                  styles.productCard,
                  pressed && { opacity: 0.86 },
                ]}
              >
                <View style={styles.productArt}>
                  <ReceiptText size={22} stroke={colors.purple} />
                </View>
                <AppText variant="label" numberOfLines={2}>
                  {product.name}
                </AppText>
                <AppText variant="small" color={colors.secondary}>
                  {product.category} · {product.stock_quantity} {product.unit}
                </AppText>
                <View style={styles.productBottom}>
                  <AppText variant="amount" style={{ fontSize: 16 }}>
                    {formatMoney(product.price_cents)}
                  </AppText>
                  <View style={styles.addCircle}>
                    {inCart ? (
                      <AppText variant="small" color="#fff">
                        {inCart.quantity}
                      </AppText>
                    ) : (
                      <Plus size={16} stroke="#fff" />
                    )}
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
      {lines.length ? (
        <Card style={styles.cartPreview}>
          <View style={styles.cartHead}>
            <View style={{ flex: 1 }}>
              <AppText variant="label">
                Current sale · {lines.length}{" "}
                {lines.length === 1 ? "item" : "items"}
              </AppText>
              {creditMode ? (
                <AppText
                  variant="small"
                  color={colors.warning}
                  style={{ marginTop: 3 }}
                >
                  Credit sale
                </AppText>
              ) : null}
            </View>
            <AppText variant="amount">{formatMoney(total)}</AppText>
          </View>
          <View style={styles.cartActions}>
            <Pressable
              onPress={() => {
                useCart.getState().clear();
              }}
            >
              <AppText variant="small" color={colors.danger}>
                Clear
              </AppText>
            </Pressable>
            <PrimaryButton
              label="Review sale"
              onPress={() => router.push("/sales/checkout")}
              style={{ flex: 1, minHeight: 46 }}
            />
          </View>
        </Card>
      ) : null}
    </Page>
  );
}

const methods: {
  key: PaymentMethod;
  title: string;
  detail: string;
  icon: React.ReactNode;
}[] = [
  {
    key: "CASH",
    title: "Cash",
    detail: "Paid in person",
    icon: <Banknote size={19} stroke={colors.success} />,
  },
  {
    key: "ECOCASH",
    title: "EcoCash",
    detail: "Mobile money",
    icon: <Smartphone size={19} stroke={colors.info} />,
  },
  {
    key: "CARD",
    title: "Card / Other",
    detail: "Other payment",
    icon: <CreditCard size={19} stroke={colors.purple} />,
  },
];

export function CheckoutScreen() {
  const db = useSQLiteContext();
  const { session } = useAuth();
  const ownerId = session?.user.id ?? "";
  const lines = useCart((state) => state.lines);
  const customerId = useCart((state) => state.customerId);
  const creditMode = useCart((state) => state.creditMode);
  const clear = useCart((state) => state.clear);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const total = useMemo(
    () =>
      lines.reduce(
        (sum, line) => sum + Math.round(line.priceCents * line.quantity),
        0,
      ),
    [lines],
  );
  const [paidAmount, setPaidAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // eslint-disable-next-line react-hooks/set-state-in-effect -- keep the suggested payment amount in sync with the cart total.
  useEffect(() => {
    setPaidAmount((total / 100).toFixed(2));
  }, [total]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- resolve the selected account from local SQLite.
  useEffect(() => {
    if (customerId) void getCustomer(db, ownerId, customerId).then(setCustomer);
    else setCustomer(null);
  }, [db, ownerId, customerId]);
  const paidCents = toCents(paidAmount);
  const balance = Math.max(0, total - paidCents);
  const completeSale = async () => {
    setError("");
    if (!lines.length) {
      setError("Add a product before completing the sale.");
      return;
    }
    if (creditMode && !customerId) {
      setError("Choose a customer for this credit sale.");
      return;
    }
    if (!creditMode && balance > 0) {
      setError("Choose a customer before leaving an amount unpaid.");
      return;
    }
    setBusy(true);
    try {
      const result = await recordSale(db, {
        items: lines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
        })),
        customerId,
        amountPaidCents: paidCents,
        method,
        createdBy: session?.user.id ?? null,
        ownerId,
      });
      clear();
      Alert.alert(
        "Sale saved",
        result.balanceCents > 0
          ? "Balance of " +
              formatMoney(result.balanceCents) +
              " added to " +
              (customer?.name ?? "the customer account") +
              "."
          : "Receipt " + result.receiptNumber + " is ready.",
      );
      router.replace("/sales/history");
    } catch (value) {
      setError(
        value instanceof Error ? value.message : "We could not save the sale.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Page
      title="Complete sale"
      subtitle="Check the basket, then record how it was paid."
      back
    >
      <Card style={{ gap: 13 }}>
        <SectionTitle>Order items</SectionTitle>
        {lines.map((line) => (
          <View key={line.productId} style={styles.orderRow}>
            <View style={{ flex: 1 }}>
              <AppText variant="label">{line.name}</AppText>
              <AppText
                variant="small"
                color={colors.secondary}
                style={{ marginTop: 3 }}
              >
                {formatMoney(line.priceCents)} each
              </AppText>
            </View>
            <View style={styles.qtyControl}>
              <Pressable
                onPress={() =>
                  useCart.getState().changeQuantity(line.productId, -1)
                }
                style={styles.qtyButton}
              >
                <Minus size={14} stroke={colors.deepPurple} />
              </Pressable>
              <AppText variant="label">{line.quantity}</AppText>
              <Pressable
                onPress={() =>
                  useCart.getState().changeQuantity(line.productId, 1)
                }
                style={styles.qtyButton}
              >
                <Plus size={14} stroke={colors.deepPurple} />
              </Pressable>
            </View>
            <AppText variant="label">
              {formatMoney(line.priceCents * line.quantity)}
            </AppText>
          </View>
        ))}
        {!lines.length ? (
          <AppText color={colors.secondary}>Your basket is empty.</AppText>
        ) : null}
        <View style={styles.totalRow}>
          <AppText variant="heading">Total</AppText>
          <AppText variant="amount">{formatMoney(total)}</AppText>
        </View>
      </Card>
      {creditMode ? (
        <Card style={{ gap: 9 }}>
          <AppText variant="heading">Customer account</AppText>
          {customer ? (
            <View style={styles.customerPill}>
              <View style={styles.customerAvatar}>
                <AppText variant="label" color={colors.deepPurple}>
                  {customer.name[0]?.toUpperCase()}
                </AppText>
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="label">{customer.name}</AppText>
                <AppText variant="small" color={colors.secondary}>
                  {customer.phone || "No phone number"}
                </AppText>
              </View>
              <StatusBadge label="Credit sale" tone="amber" />
            </View>
          ) : (
            <AppText color={colors.danger}>
              No customer selected. Return to the credit customer list and
              choose a customer.
            </AppText>
          )}
        </Card>
      ) : null}
      <Card style={{ gap: 12 }}>
        <AppText variant="heading">Payment method</AppText>
        {methods.map((item) => (
          <Pressable
            key={item.key}
            onPress={() => setMethod(item.key)}
            style={[
              styles.methodRow,
              method === item.key && styles.methodSelected,
            ]}
          >
            <View style={styles.methodIcon}>{item.icon}</View>
            <View style={{ flex: 1 }}>
              <AppText variant="label">{item.title}</AppText>
              <AppText
                variant="small"
                color={colors.secondary}
                style={{ marginTop: 3 }}
              >
                {item.detail}
              </AppText>
            </View>
            <View
              style={[
                styles.radio,
                method === item.key && styles.radioSelected,
              ]}
            >
              {method === item.key ? <View style={styles.radioDot} /> : null}
            </View>
          </Pressable>
        ))}
        {creditMode ? (
          <Field
            label="Amount received now"
            keyboardType="decimal-pad"
            value={paidAmount}
            onChangeText={setPaidAmount}
            placeholder="0.00"
          />
        ) : (
          <View style={styles.balanceBox}>
            <AppText variant="label" color={colors.secondary}>
              Amount to receive
            </AppText>
            <AppText variant="amount">{formatMoney(total)}</AppText>
          </View>
        )}
        {creditMode && balance > 0 ? (
          <View style={styles.balanceBox}>
            <AppText variant="label" color={colors.warning}>
              Remaining balance
            </AppText>
            <AppText variant="amount" color={colors.warning}>
              {formatMoney(balance)}
            </AppText>
          </View>
        ) : null}
      </Card>
      {error ? (
        <View style={styles.errorBox}>
          <AppText variant="small" color={colors.danger}>
            {error}
          </AppText>
        </View>
      ) : null}
      <PrimaryButton
        label="Save sale"
        loading={busy}
        onPress={completeSale}
        icon={<Check size={19} stroke="#fff" />}
      />
    </Page>
  );
}

export function SalesHistoryScreen() {
  const db = useSQLiteContext();
  const { session } = useAuth();
  const ownerId = session?.user.id ?? "";
  const [sales, setSales] = useState<SaleSummary[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const load = async () => {
    setRefreshing(true);
    try {
      setSales(await listRecentSales(db, ownerId));
    } finally {
      setRefreshing(false);
    }
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps -- load local SQLite sales when the account scope changes.
  useEffect(() => {
    void load();
  }, [db, ownerId]);
  return (
    <Page
      title="Sales history"
      subtitle="Every sale recorded on this device."
      back
      scroll={false}
    >
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={load}
            tintColor={colors.purple}
          />
        }
        contentContainerStyle={{ gap: 10, paddingBottom: 24 }}
      >
        {sales.map((sale) => (
          <Pressable
            key={sale.id}
            onPress={() =>
              Alert.alert(
                "Receipt " + sale.receipt_number,
                (sale.customer_name || "Walk-in customer") +
                  "\n" +
                  formatDateTime(sale.created_at) +
                  "\nPaid " +
                  formatMoney(sale.paid_cents) +
                  (sale.balance_cents
                    ? "\nOwed " + formatMoney(sale.balance_cents)
                    : ""),
              )
            }
          >
            <Card style={styles.historyRow}>
              <View style={styles.receiptIcon}>
                <ReceiptText stroke={colors.purple} size={18} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="label">
                  {sale.customer_name || "Walk-in customer"}
                </AppText>
                <AppText
                  variant="small"
                  color={colors.secondary}
                  style={{ marginTop: 3 }}
                >
                  {sale.receipt_number} · {formatDateTime(sale.created_at)}
                </AppText>
              </View>
              <View style={{ alignItems: "flex-end", gap: 6 }}>
                <AppText variant="label">
                  {formatMoney(sale.total_cents)}
                </AppText>
                <StatusBadge
                  label={
                    sale.status === "PAID"
                      ? "Paid"
                      : sale.status === "PARTIAL"
                        ? "Part paid"
                        : "On credit"
                  }
                  tone={sale.status === "PAID" ? "green" : "amber"}
                />
              </View>
            </Card>
          </Pressable>
        ))}
        {!sales.length ? (
          <IllustratedEmptyState
            image={require("@/assets/images/shop-illustrations/inventory/empty-cart.png")}
            title="No sales recorded yet"
            description="Completed sales will appear here, with their payment and credit status."
            action={
              <PrimaryButton
                label="Start a sale"
                onPress={() => router.push("/sales/new")}
              />
            }
          />
        ) : null}
      </ScrollView>
    </Page>
  );
}

const styles = StyleSheet.create({
  searchBox: {
    minHeight: 54,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderColor: colors.border,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 12,
  },
  categoryRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  empty: { alignItems: "center", gap: 10, padding: 18 },
  productGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  productCard: {
    width: "48%",
    flexGrow: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 6,
    minHeight: 172,
  },
  productArt: {
    width: 42,
    height: 42,
    backgroundColor: colors.lavenderTint,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  productBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: "auto",
  },
  addCircle: {
    width: 30,
    height: 30,
    borderRadius: 11,
    backgroundColor: colors.purple,
    alignItems: "center",
    justifyContent: "center",
  },
  cartPreview: { gap: 13, borderColor: colors.purple },
  cartHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  cartActions: { flexDirection: "row", alignItems: "center", gap: 15 },
  orderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  qtyControl: { flexDirection: "row", alignItems: "center", gap: 9 },
  qtyButton: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: colors.lavenderTint,
    alignItems: "center",
    justifyContent: "center",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 5,
  },
  customerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.lavenderTint,
    padding: 10,
    borderRadius: 14,
  },
  customerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: colors.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  methodRow: {
    minHeight: 64,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 12,
  },
  methodSelected: { borderColor: colors.purple, backgroundColor: "#F8F6FF" },
  methodIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#A6A6B5",
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: { borderColor: colors.purple },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.purple,
  },
  balanceBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFF5DC",
    borderRadius: 13,
    padding: 12,
  },
  errorBox: { padding: 12, borderRadius: 12, backgroundColor: "#FCEBED" },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
  },
  receiptIcon: {
    width: 38,
    height: 38,
    backgroundColor: colors.lavenderTint,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
});
