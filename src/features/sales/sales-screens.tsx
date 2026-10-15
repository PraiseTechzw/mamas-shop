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
import { imageSource } from "@/lib/product-images";
import { useCart } from "@/stores/cart";
import { router } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import {
  Banknote,
  Check,
  ChevronRight,
  CreditCard,
  Minus,
  Plus,
  ReceiptText,
  Search,
  Smartphone,
  Package,
} from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

function saleCategory(product: Product) {
  const value = `${product.name} ${product.category}`.toLowerCase();
  if (/biscuit|cookie/.test(value)) return "Biscuits";
  if (/snack|snax|crisps|king cos|king kurls/.test(value)) return "Snacks";
  if (/maheu|mahewu|mahero|drink|beverage|water|mirinda|pepsi|coke|fruiticana/.test(value)) return "Drinks";
  if (/meat|deli|polony/.test(value)) return "Meat & Deli";
  if (/airtime|econet|netone/.test(value)) return "Airtime";
  return "Other";
}

export function SalesScreen() {
  const db = useSQLiteContext();
  const { session } = useAuth();
  const ownerId = session?.user.id ?? "";
  const [rows, setRows] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
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
  const categories = useMemo(
    () => ["All", ...Array.from(new Set(rows.map(saleCategory)))],
    [rows],
  );
  const visibleRows = useMemo(
    () => rows.filter((product) => category === "All" || saleCategory(product) === category),
    [category, rows],
  );
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
      scroll={false}
      contentStyle={styles.salesPage}
    >
      <ScrollView
        style={styles.salesScroller}
        contentContainerStyle={styles.salesScrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
      <Field
        label=""
        accessibilityLabel="Search products"
        icon={<Search size={18} stroke={colors.secondary} />}
        placeholder="Search products or categories"
        value={search}
        onChangeText={setSearch}
      />
      <View style={styles.categoryHeader}>
        <AppText variant="label">Categories</AppText>
        <StatusBadge label={`${rows.length} in stock`} tone="green" />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryFilters}>
        {categories.map((item) => (
          <Pressable
            key={item}
            accessibilityRole="button"
            accessibilityState={{ selected: category === item }}
            onPress={() => setCategory(item)}
            style={[styles.categoryFilter, category === item && styles.categoryFilterActive]}
          >
            <AppText variant="small" color={category === item ? "#FFFFFF" : colors.secondary}>{item}</AppText>
          </Pressable>
        ))}
      </ScrollView>
      {!visibleRows.length ? (
        <IllustratedEmptyState
          image={require("@/assets/images/shop-illustrations/inventory/empty-cart.png")}
          title={rows.length ? "No products in this category" : search ? "No matching products" : "No products ready to sell"}
          description={
            rows.length
              ? "Choose another category to see available products."
              : search
              ? "Try another name or category."
              : "Add products and receive stock before recording your first sale."
          }
          action={
            <PrimaryButton
              label={rows.length ? "Show all products" : search ? "Clear search" : "Open inventory"}
              onPress={
                rows.length
                  ? () => setCategory("All")
                  : search
                  ? () => setSearch("")
                  : () => router.push("/(tabs)/inventory")
              }
            />
          }
        />
      ) : (
        <View style={styles.productGrid}>
          {visibleRows.map((product) => {
            const inCart = lines.find((line) => line.productId === product.id);
            return (
              <Pressable
                key={product.id}
                accessibilityRole="button"
                accessibilityLabel={`Add ${product.name} to sale, ${formatMoney(product.price_cents)}, ${product.stock_quantity} ${product.unit} in stock`}
                onPress={() => addProduct(product)}
                style={({ pressed }) => [
                  styles.productCard,
                  pressed && { opacity: 0.86 },
                ]}
              >
                <View style={styles.productArt}>
                  {imageSource(product) ? (
                    <Image
                      source={imageSource(product)!}
                      resizeMode="contain"
                      style={styles.productImage}
                      accessibilityLabel={`${product.name} product photo`}
                    />
                  ) : (
                    <Package size={23} stroke={colors.deepPurple} />
                  )}
                </View>
                <View style={styles.productDetails}>
                  <AppText variant="label" numberOfLines={1}>
                    {product.name}
                  </AppText>
                  <AppText variant="small" color={colors.secondary} numberOfLines={1}>
                    {saleCategory(product)} · {product.stock_quantity} {product.unit}
                  </AppText>
                  <View style={styles.productBottom}>
                    <AppText variant="amount" style={{ fontSize: 16 }}>
                      {formatMoney(product.price_cents)}
                    </AppText>
                    <View style={styles.addCircle}>
                      {inCart ? <AppText variant="small" color="#fff">{inCart.quantity}</AppText> : <Plus size={16} stroke="#fff" />}
                    </View>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
      </ScrollView>
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
            <Pressable accessibilityRole="button" style={styles.clearCartButton}
              onPress={() => {
                useCart.getState().clear();
              }}
            >
              <AppText variant="small" color={colors.danger}>
                Clear sale
              </AppText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/sales/checkout")}
              style={styles.reviewSaleButton}
            >
              <View style={styles.reviewSaleSurface}>
                <AppText variant="label" color="#FFFFFF">Review sale</AppText>
                <ChevronRight size={18} stroke="#FFFFFF" />
              </View>
            </Pressable>
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
  const [paidAmount, setPaidAmount] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void (customerId ? getCustomer(db, ownerId, customerId) : Promise.resolve(null)).then((value) => {
      if (active) setCustomer(value);
    });
    return () => {
      active = false;
    };
  }, [db, ownerId, customerId]);
  const suggestedPaidAmount = (total / 100).toFixed(2);
  const tenderedCents = Math.max(0, toCents(paidAmount ?? suggestedPaidAmount));
  const paidCents = Math.min(tenderedCents, total);
  const balance = Math.max(0, total - paidCents);
  const changeCents = method === "CASH" ? Math.max(0, tenderedCents - total) : 0;
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
          : "Receipt " + result.receiptNumber + " is ready." +
              (changeCents > 0 ? " Give " + formatMoney(changeCents) + " change." : ""),
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
      scroll={false}
      contentStyle={styles.checkoutPage}
    >
      <ScrollView
        style={styles.checkoutScroller}
        contentContainerStyle={styles.checkoutContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
      <Card style={styles.checkoutCard}>
        <SectionTitle>Order items</SectionTitle>
        {lines.map((line) => (
          <View key={line.productId} style={styles.orderRow}>
            <View style={styles.checkoutProductArt}>
              {imageSource({ name: line.name, image_uri: null }) ? (
                <Image source={imageSource({ name: line.name, image_uri: null })!} resizeMode="contain" style={styles.checkoutProductImage} accessibilityLabel={`${line.name} product image`} />
              ) : <Package size={18} stroke={colors.deepPurple} />}
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="small" style={{ fontFamily: "Inter-SemiBold" }} numberOfLines={1}>{line.name}</AppText>
              <AppText variant="small" color={colors.secondary}>{formatMoney(line.priceCents)} each</AppText>
            </View>
            <View style={styles.qtyControl}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove one ${line.name}`}
                onPress={() =>
                  useCart.getState().changeQuantity(line.productId, -1)
                }
                style={styles.qtyButton}
              >
                <Minus size={14} stroke={colors.deepPurple} />
              </Pressable>
              <AppText variant="small">{line.quantity}</AppText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Add one ${line.name}`}
                onPress={() =>
                  useCart.getState().changeQuantity(line.productId, 1)
                }
                style={styles.qtyButton}
              >
                <Plus size={14} stroke={colors.deepPurple} />
              </Pressable>
            </View>
            <AppText variant="small" style={{ fontFamily: "Inter-SemiBold", minWidth: 43, textAlign: "right" }}>
              {formatMoney(line.priceCents * line.quantity)}
            </AppText>
          </View>
        ))}
        {!lines.length ? (
          <AppText color={colors.secondary}>Your basket is empty.</AppText>
        ) : null}
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
      <Card style={styles.checkoutCard}>
        <AppText variant="heading">Payment method</AppText>
        <View style={styles.methodOptions}>
          {methods.map((item) => (
            <Pressable
              key={item.key}
              accessibilityRole="radio"
              accessibilityLabel={`${item.title}: ${item.detail}`}
              accessibilityState={{ checked: method === item.key }}
              onPress={() => setMethod(item.key)}
              style={[styles.methodOption, method === item.key && styles.methodOptionSelected]}
            >
              {item.icon}
              <AppText variant="small" color={method === item.key ? colors.deepPurple : colors.secondary}>{item.key === "CARD" ? "Other" : item.title}</AppText>
            </Pressable>
          ))}
        </View>
        {creditMode || method === "CASH" ? (
          <Field
            label={method === "CASH" ? "Cash received" : "Amount received now"}
            keyboardType="decimal-pad"
            value={paidAmount ?? suggestedPaidAmount}
            onChangeText={setPaidAmount}
            placeholder={suggestedPaidAmount}
          />
        ) : (
          null
        )}
        <View style={styles.totalRow}>
          <AppText variant="label">Total</AppText>
          <AppText variant="amount">{formatMoney(total)}</AppText>
        </View>
        {balance > 0 ? (
          <View style={styles.balanceBox}>
            <View style={{ flex: 1 }}>
              <AppText variant="label" color={colors.warning}>Remaining balance</AppText>
              {!customerId ? <AppText variant="small" color={colors.secondary} style={{ marginTop: 3 }}>Link a customer to record this as pay later.</AppText> : null}
            </View>
            <AppText variant="amount" color={colors.warning}>
              {formatMoney(balance)}
            </AppText>
          </View>
        ) : null}
        {changeCents > 0 ? (
          <View style={styles.changeBox}>
            <AppText variant="label" color={colors.success}>Change to give</AppText>
            <AppText variant="amount" color={colors.success}>{formatMoney(changeCents)}</AppText>
          </View>
        ) : null}
        {!creditMode && balance > 0 ? (
          <Pressable
            accessibilityRole="button"
            style={styles.linkCustomerButton}
            onPress={() => router.push({ pathname: "/credit/new-credit-sale", params: { preserveCart: "true" } })}
          >
            <AppText variant="label" color={colors.deepPurple}>Choose customer · record balance later</AppText>
            <ChevronRight size={18} stroke={colors.deepPurple} />
          </Pressable>
        ) : null}
      </Card>
      {error ? (
        <View style={styles.errorBox}>
          <AppText variant="small" color={colors.danger}>
            {error}
          </AppText>
        </View>
      ) : null}
      </ScrollView>
      <PrimaryButton
        label="Save sale"
        loading={busy}
        onPress={completeSale}
        disabled={!lines.length || (balance > 0 && (!creditMode || !customerId))}
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
  const refresh = async () => {
    setRefreshing(true);
    try {
      setSales(await listRecentSales(db, ownerId));
    } finally {
      setRefreshing(false);
    }
  };
  useEffect(() => {
    let active = true;
    void listRecentSales(db, ownerId).then((data) => {
      if (active) setSales(data);
    });
    return () => {
      active = false;
    };
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
            onRefresh={refresh}
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
  checkoutPage: { flex: 1 },
  checkoutScroller: { flex: 1 },
  checkoutContent: { gap: 14, paddingBottom: 12 },
  checkoutCard: { gap: 11, padding: 14, borderRadius: 18, borderColor: "#D4D7E3", backgroundColor: "#FFFFFF", shadowColor: "#25305A", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2 },
  checkoutProductArt: { width: 38, height: 42, borderRadius: 9, backgroundColor: "#F1EFFB", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  checkoutProductImage: { width: 34, height: 38 },
  salesPage: { flex: 1 },
  salesScroller: { flex: 1 },
  salesScrollContent: { gap: 14, paddingBottom: 16 },
  categoryHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  categoryFilters: { flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 2 },
  categoryFilter: { minHeight: 34, justifyContent: "center", paddingHorizontal: 13, borderRadius: 18, backgroundColor: "#F0F1F7" },
  categoryFilterActive: { backgroundColor: colors.purple },
  empty: { alignItems: "center", gap: 10, padding: 18 },
  productGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  productCard: {
    width: "48%",
    minHeight: 154,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1.25,
    borderColor: "#D2D6E3",
    padding: 9,
    gap: 7,
    shadowColor: "#25305A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  productArt: {
    width: "100%",
    height: 62,
    backgroundColor: "#F1EFFB",
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  productImage: { width: 58, height: 58 },
  productDetails: { flex: 1, minWidth: 0, gap: 4 },
  productBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6, marginTop: "auto", paddingTop: 4 },
  addCircle: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: colors.purple,
    alignItems: "center",
    justifyContent: "center",
  },
  cartPreview: { gap: 12, padding: 14, borderWidth: 1.5, borderColor: "#B9ADEE", backgroundColor: "#FFFFFF", shadowColor: colors.deepPurple, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 2 },
  cartHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  cartActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  clearCartButton: { minHeight: 46, justifyContent: "center", paddingHorizontal: 13, borderRadius: 13, backgroundColor: "#FFF1F2", borderWidth: 1, borderColor: "#F3D5D9" },
  reviewSaleButton: { flex: 1, minHeight: 50, overflow: "hidden", borderRadius: 14 },
  reviewSaleSurface: { width: "100%", minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingHorizontal: 14, borderRadius: 14, backgroundColor: "#38239B" },
  orderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  qtyControl: { flexDirection: "row", alignItems: "center", gap: 5 },
  qtyButton: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: colors.lavenderTint,
    alignItems: "center",
    justifyContent: "center",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: colors.border,
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
  methodOptions: { flexDirection: "row", gap: 8 },
  methodOption: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 4,
  },
  methodOptionSelected: { borderColor: colors.purple, backgroundColor: "#F4F0FF" },
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
    borderWidth: 1,
    borderColor: "#F1E0B0",
    borderRadius: 13,
    padding: 12,
    gap: 12,
  },
  changeBox: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#E7F5EF", borderColor: "#CDE9DC", borderWidth: 1, borderRadius: 13, padding: 12 },
  linkCustomerButton: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 13, borderRadius: 13, borderWidth: 1, borderColor: "#CFC5F2", backgroundColor: "#F7F5FF" },
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
