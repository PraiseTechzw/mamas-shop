import { IllustratedEmptyState } from "@/components/feedback/illustrated-empty-state";
import {
  AppText,
  Field,
  Page,
  PrimaryButton,
  SectionTitle,
  StatusBadge,
} from "@/components/ui/primitives";
import { colors } from "@/constants/theme";
import { getCustomer } from "@/db/repositories/customers";
import {
  getSaleDetail,
  listProductsForSale,
  listSalesBetween,
  recordSale,
  type SaleDetail,
} from "@/db/repositories/sales";
import type {
  Customer,
  PaymentMethod,
  Product,
  SaleSummary,
} from "@/db/schema";
import { useAuth } from "@/features/auth/auth-context";
import { formatMoney, toCents } from "@/lib/format";
import { imageSource } from "@/lib/product-images";
import { useCart } from "@/stores/cart";
import { router } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import {
  Apple,
  Boxes,
  Banknote,
  CalendarDays,
  Check,
  CupSoda,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Minus,
  Plus,
  ReceiptText,
  Search,
  ShoppingCart,
  Smartphone,
  Package,
  MapPin,
  Users,
} from "lucide-react-native";
import { ensurePrimaryLocation, listLocations } from "@/db/repositories/inventory";
import { ensureOwnerSeller, ensureUserSeller, listSellers } from "@/db/repositories/sellers";
import { useSyncStatus } from "@/features/sync/sync-context";
import { useEffect, useMemo, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function saleCategory(product: Product) {
  const value = `${product.name} ${product.category}`.toLocaleLowerCase();
  if (/drink|beverage|water|maheu|mahewu|mahero|juice|soda/.test(value)) return "Drinks";
  if (/household|clean|soap|detergent|toilet|tissue|personal care|shampoo/.test(value)) return "Household";
  return "Groceries";
}

type HistoryDateFilter = "TODAY" | "7_DAYS" | "30_DAYS" | "CUSTOM";
type DateRange = { start: Date; end: Date };

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addLocalDays(date: Date, days: number) {
  const result = startOfLocalDay(date);
  result.setDate(result.getDate() + days);
  return result;
}

function getHistoryDateBounds(filter: HistoryDateFilter, customRange: DateRange | null) {
  const today = startOfLocalDay(new Date());
  if (filter === "CUSTOM" && customRange) {
    return {
      start: startOfLocalDay(customRange.start),
      endExclusive: addLocalDays(startOfLocalDay(customRange.end), 1),
    };
  }
  const days = filter === "TODAY" ? 1 : filter === "7_DAYS" ? 7 : 30;
  return { start: addLocalDays(today, 1 - days), endExclusive: addLocalDays(today, 1) };
}

function getCalendarDays(month: Date) {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = firstDay.getDay();
  const dayCount = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cellCount = Math.ceil((offset + dayCount) / 7) * 7;
  return Array.from({ length: cellCount }, (_, index) =>
    new Date(month.getFullYear(), month.getMonth(), index - offset + 1),
  );
}

function sameLocalDay(left: Date | null, right: Date) {
  return Boolean(left && left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate());
}

function shortCalendarDate(date: Date) {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatSaleTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-ZW", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatPaymentMethod(method: string | null | undefined, status: SaleSummary["status"]) {
  if (!method) return status === "CREDIT" ? "Credit" : "Cash";
  if (method === "ECOCASH") return "EcoCash";
  if (method === "CARD") return "Card";
  if (method === "OTHER") return "Other";
  if (method === "MIXED") return "Split";
  return "Cash";
}

const salesCategoryIcons: Record<string, typeof Boxes> = {
  All: Boxes,
  Groceries: Apple,
  Drinks: CupSoda,
  Household: Package,
};

// ─────────────────────────────────────────────────────────────────────────────
// SalesScreen
// ─────────────────────────────────────────────────────────────────────────────

export function SalesScreen() {
  const db = useSQLiteContext();
  const { session, businessId } = useAuth();
  const { revision } = useSyncStatus();
  const ownerId = businessId ?? session?.user.id ?? "";
  const [rows, setRows] = useState<Product[]>([]);
  const [productLoadError, setProductLoadError] = useState("");
  const [productRetry, setProductRetry] = useState(0);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");

  const lines = useCart((s) => s.lines);
  const creditMode = useCart((s) => s.creditMode);
  const locationId = useCart((s) => s.locationId);
  const sellerId = useCart((s) => s.sellerId);
  const setLocationId = useCart((s) => s.setLocationId);
  const setSellerId = useCart((s) => s.setSellerId);
  const addProduct = useCart((s) => s.addProduct);

  const total = lines.reduce((sum, l) => sum + Math.round(l.priceCents * l.quantity), 0);
  const itemCount = lines.reduce((n, l) => n + l.quantity, 0);

  useEffect(() => {
    let active = true;
    const ownerName = String(session?.user.user_metadata?.full_name ?? session?.user.email?.split("@")[0] ?? "Shop owner");
    void (async () => {
      const isOwner = Boolean(session && businessId === session.user.id);
      const primary = isOwner ? await ensurePrimaryLocation(db, ownerId) : null;
      const currentSeller = isOwner
        ? await ensureOwnerSeller(db, ownerId, ownerName)
        : session ? await ensureUserSeller(db, ownerId, session.user.id, ownerName) : null;
      const [locationRows, sellerRows] = await Promise.all([listLocations(db, ownerId), listSellers(db, ownerId)]);
      if (!active) return;
      if (!locationRows.some((l) => l.id === locationId)) setLocationId(primary?.id ?? locationRows[0]?.id ?? null);
      if (!sellerRows.some((s) => s.id === sellerId)) setSellerId(currentSeller?.id ?? null);
    })().catch(() => {});
    return () => { active = false; };
  }, [db, ownerId, businessId, session, session?.user.id, session?.user.email, session?.user.user_metadata?.full_name, locationId, sellerId, setLocationId, setSellerId, revision]);

  useEffect(() => {
    let active = true;
    void listProductsForSale(db, ownerId, search, locationId).then((data) => {
      if (active) { setProductLoadError(""); setRows(data); }
    }).catch((e: unknown) => {
      if (active) setProductLoadError(e instanceof Error ? e.message : "Products could not be loaded.");
    });
    return () => { active = false; };
  }, [db, ownerId, search, locationId, revision, productRetry]);

  const categories = useMemo(() => ["All", "Groceries", "Drinks", "Household"], []);
  const visibleRows = useMemo(
    () => rows.filter((p) => category === "All" || saleCategory(p) === category),
    [category, rows],
  );

  return (
    <Page scroll={false} contentStyle={st.salesPage}>
      <ScrollView
        style={st.salesScroller}
        contentContainerStyle={st.salesScrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Search + history button */}
        <View className="flex-row items-center gap-2">
          <View className="min-w-0 flex-1">
            <Field
              label=""
              accessibilityLabel="Search products"
              icon={<Search size={18} color={colors.secondary} />}
              placeholder="Search products…"
              returnKeyType="search"
              value={search}
              onChangeText={setSearch}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sales history"
            onPress={() => router.push("/sales/history")}
            className="h-[54px] w-[54px] items-center justify-center rounded-2xl border border-line bg-brand-tint active:opacity-75"
          >
            <ReceiptText size={19} color={colors.deepPurple} />
          </Pressable>
        </View>

        {/* Category pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={st.categoryRow}
        >
          {categories.map((item) => {
            const Icon = salesCategoryIcons[item] ?? Package;
            const active = category === item;
            return (
              <Pressable
                key={item}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setCategory(item)}
                className={`flex-row items-center gap-1.5 rounded-full border px-3.5 py-2 active:opacity-80 ${active ? "border-brand bg-brand" : "border-line bg-surface"}`}
              >
                <Icon size={13} color={active ? colors.surface : colors.secondary} />
                <AppText variant="small" color={active ? colors.surface : colors.secondary} style={{ fontSize: 12 }}>
                  {item}
                </AppText>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Error state */}
        {productLoadError ? (
          <View className="gap-2 rounded-2xl bg-danger/10 p-3">
            <AppText variant="small" color={colors.danger}>{productLoadError}</AppText>
            <Pressable accessibilityRole="button" onPress={() => setProductRetry((v) => v + 1)}>
              <AppText variant="label" color={colors.deepPurple}>Retry loading products</AppText>
            </Pressable>
          </View>
        ) : null}

        {/* Empty state */}
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
                onPress={rows.length ? () => setCategory("All") : search ? () => setSearch("") : () => router.push("/(tabs)/inventory")}
              />
            }
          />
        ) : (
          /* Product list */
          <View className="overflow-hidden rounded-2xl border border-line bg-surface">
            {visibleRows.map((product, idx) => {
              const inCart = lines.find((l) => l.productId === product.id);
              const isLast = idx === visibleRows.length - 1;
              return (
                <Pressable
                  key={product.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${product.name}, ${formatMoney(product.price_cents)}, ${product.stock_quantity} ${product.unit} in stock`}
                  onPress={() => addProduct(product)}
                  className={`flex-row items-center gap-3 px-3 py-2.5 active:bg-brand-tint/50 ${isLast ? "" : "border-b border-line"}`}
                >
                  {/* Product image */}
                  <View className="h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-canvas">
                    {imageSource(product) ? (
                      <Image
                        source={imageSource(product)!}
                        resizeMode="contain"
                        className="h-11 w-11"
                        accessibilityLabel={`${product.name} photo`}
                      />
                    ) : (
                      <Package size={22} color={colors.deepPurple} />
                    )}
                  </View>

                  {/* Name + price */}
                  <View className="min-w-0 flex-1 gap-0.5">
                    <AppText variant="label" numberOfLines={1} style={{ fontSize: 13 }}>
                      {product.name}
                    </AppText>
                    <AppText variant="small" color={colors.purple} style={{ fontSize: 12 }}>
                      {formatMoney(product.price_cents)}
                    </AppText>
                  </View>

                  {/* Stock */}
                  <AppText variant="small" color={colors.secondary} style={{ fontSize: 10 }} numberOfLines={1}>
                    {product.stock_quantity} {product.unit}
                  </AppText>

                  {/* Add / qty badge */}
                  <View className={`h-9 w-9 items-center justify-center rounded-full ${inCart ? "bg-brand-deep" : "bg-brand"}`}>
                    {inCart
                      ? <AppText variant="label" color={colors.surface} style={{ fontSize: 12 }}>{inCart.quantity}</AppText>
                      : <Plus size={17} color={colors.surface} />}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Floating cart bar */}
      {lines.length ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Review sale, ${itemCount} ${itemCount === 1 ? "item" : "items"}, ${formatMoney(total)}`}
          onPress={() => router.push("/sales/checkout")}
          className="flex-row items-center gap-3 rounded-2xl bg-brand px-3 py-2.5 active:opacity-85"
          style={{ shadowColor: colors.deepPurple, shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8 }}
        >
          <View className="h-10 w-10 items-center justify-center rounded-xl bg-brand-deep">
            <ShoppingCart size={20} color={colors.surface} />
          </View>
          <View className="min-w-0 flex-1 gap-0.5">
            <AppText variant="small" color={colors.surface} style={{ fontSize: 11 }}>
              {itemCount} {itemCount === 1 ? "item" : "items"}{creditMode ? " · Credit sale" : ""}
            </AppText>
            <AppText variant="label" color={colors.surface}>{formatMoney(total)}</AppText>
          </View>
          <View className="flex-row items-center gap-1">
            <AppText variant="small" color={colors.surface} style={{ fontSize: 11 }}>Review</AppText>
            <ChevronRight size={17} color={colors.surface} />
          </View>
        </Pressable>
      ) : null}
    </Page>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CheckoutScreen
// ─────────────────────────────────────────────────────────────────────────────

const paymentMethods: { key: PaymentMethod; label: string; detail: string; icon: React.ReactNode }[] = [
  { key: "CASH",    label: "Cash",      detail: "Paid in person",  icon: <Banknote  size={18} color={colors.success} /> },
  { key: "ECOCASH", label: "EcoCash",   detail: "Mobile money",    icon: <Smartphone size={18} color={colors.info} /> },
  { key: "CARD",    label: "Card",      detail: "Other payment",   icon: <CreditCard size={18} color={colors.purple} /> },
];

export function CheckoutScreen() {
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();
  const { session, businessId } = useAuth();
  const ownerId = businessId ?? session?.user.id ?? "";

  const lines      = useCart((s) => s.lines);
  const customerId = useCart((s) => s.customerId);
  const creditMode = useCart((s) => s.creditMode);
  const sellerId   = useCart((s) => s.sellerId);
  const locationId = useCart((s) => s.locationId);
  const clear      = useCart((s) => s.clear);

  const [customer, setCustomer]         = useState<Customer | null>(null);
  const [sellerName, setSellerName]     = useState("");
  const [locationName, setLocationName] = useState("");
  const [method, setMethod]             = useState<PaymentMethod>("CASH");
  const [changeDisp, setChangeDisp]     = useState<"GIVEN" | "OWED">("GIVEN");
  const [paidAmount, setPaidAmount]     = useState<string | null>(null);
  const [busy, setBusy]                 = useState(false);
  const [error, setError]               = useState("");
  const [lookupError, setLookupError]   = useState("");
  const [lookupRetry, setLookupRetry]   = useState(0);

  const total = useMemo(() => lines.reduce((s, l) => s + Math.round(l.priceCents * l.quantity), 0), [lines]);
  const suggested = (total / 100).toFixed(2);
  const tendered  = Math.max(0, toCents(paidAmount ?? suggested));
  const paid      = Math.min(tendered, total);
  const balance   = Math.max(0, total - paid);
  const change    = method === "CASH" ? Math.max(0, tendered - total) : 0;

  useEffect(() => {
    let active = true;
    void (customerId ? getCustomer(db, ownerId, customerId) : Promise.resolve(null)).then((v) => {
      if (active) { setLookupError(""); setCustomer(v); if (customerId && !v) setLookupError("Customer not found on this device."); }
    }).catch((e: unknown) => { if (active) setLookupError(e instanceof Error ? e.message : "Customer could not be loaded."); });
    return () => { active = false; };
  }, [db, ownerId, customerId, lookupRetry]);

  useEffect(() => {
    let active = true;
    void Promise.all([listSellers(db, ownerId), listLocations(db, ownerId)]).then(([sellers, locations]) => {
      if (!active) return;
      setLookupError("");
      setSellerName(sellers.find((s) => s.id === sellerId)?.name ?? "Choose seller");
      setLocationName(locations.find((l) => l.id === locationId)?.name ?? "Choose location");
    }).catch((e: unknown) => { if (active) setLookupError(e instanceof Error ? e.message : "Seller/location could not be loaded."); });
    return () => { active = false; };
  }, [db, ownerId, sellerId, locationId, lookupRetry]);

  const completeSale = async () => {
    setError("");
    if (!lines.length)                                                    { setError("Add a product before completing the sale."); return; }
    if (creditMode && !customerId)                                        { setError("Choose a customer for this credit sale."); return; }
    if (!customerId && balance > 0)                                       { setError("Choose a customer before leaving an amount unpaid."); return; }
    if (changeDisp === "OWED" && change > 0 && !customerId)              { setError("Choose the customer who will collect their change later."); return; }
    setBusy(true);
    try {
      const result = await recordSale(db, {
        items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
        customerId,
        amountPaidCents: paid,
        amountTenderedCents: tendered,
        changeDueCents: changeDisp === "OWED" ? change : 0,
        method,
        createdBy: session?.user.id ?? null,
        sellerId,
        locationId,
        ownerId,
      });
      clear();
      Alert.alert(
        "Sale saved",
        result.balanceCents > 0
          ? `Balance of ${formatMoney(result.balanceCents)} added to ${customer?.name ?? "the customer account"}.`
          : `Receipt ${result.receiptNumber} is ready.${change > 0 ? changeDisp === "OWED" ? ` ${formatMoney(change)} change recorded for ${customer?.name ?? "the customer"} to collect later.` : ` Give ${formatMoney(change)} change now.` : ""}`,
      );
      router.replace("/sales/history");
    } catch (e) {
      setError(e instanceof Error ? e.message : "We could not save the sale.");
    } finally {
      setBusy(false);
    }
  };

  const canComplete = lines.length > 0 && !(balance > 0 && !customerId) && !(changeDisp === "OWED" && change > 0 && !customerId);

  return (
    <Page title="Complete sale" subtitle="Check the basket, then record payment." back scroll={false} contentStyle={st.checkoutPage}>
      <ScrollView
        style={st.checkoutScroller}
        contentContainerStyle={st.checkoutContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Context: location + seller */}
        <View className="gap-0 overflow-hidden rounded-2xl border border-line bg-surface">
          <View className="flex-row items-center gap-2.5 px-4 py-3">
            <MapPin size={16} color={colors.deepPurple} />
            <AppText variant="small" color={colors.secondary} style={{ fontSize: 12 }}>Selling from</AppText>
            <AppText variant="label" numberOfLines={1} style={{ flex: 1, textAlign: "right", fontSize: 13 }}>{locationName}</AppText>
          </View>
          <View className="mx-4 h-px bg-line" />
          <View className="flex-row items-center gap-2.5 px-4 py-3">
            <Users size={16} color={colors.deepPurple} />
            <AppText variant="small" color={colors.secondary} style={{ fontSize: 12 }}>Seller</AppText>
            <AppText variant="label" numberOfLines={1} style={{ flex: 1, textAlign: "right", fontSize: 13 }}>{sellerName}</AppText>
          </View>
        </View>

        {/* Order items */}
        <View className="gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
          <SectionTitle>Order items</SectionTitle>
          {lines.map((line, idx) => {
            const isLast = idx === lines.length - 1;
            return (
              <View key={line.productId} className={`flex-row items-center gap-2.5 py-2 ${isLast ? "" : "border-b border-line"}`}>
                {/* Thumb */}
                <View className="h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-canvas">
                  {imageSource({ name: line.name, image_uri: null }) ? (
                    <Image source={imageSource({ name: line.name, image_uri: null })!} resizeMode="contain" className="h-11 w-11" accessibilityLabel={`${line.name} image`} />
                  ) : <Package size={18} color={colors.deepPurple} />}
                </View>
                {/* Info */}
                <View className="min-w-0 flex-1 gap-0.5">
                  <AppText variant="label" numberOfLines={1} style={{ fontSize: 13 }}>{line.name}</AppText>
                  <AppText variant="small" color={colors.secondary} style={{ fontSize: 11 }}>{formatMoney(line.priceCents)} each</AppText>
                </View>
                {/* Qty stepper */}
                <View className="flex-row items-center gap-1.5">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove one ${line.name}`}
                    onPress={() => useCart.getState().changeQuantity(line.productId, -1)}
                    className="h-7 w-7 items-center justify-center rounded-lg bg-brand-tint active:opacity-75"
                  >
                    <Minus size={13} color={colors.deepPurple} />
                  </Pressable>
                  <AppText variant="label" style={{ minWidth: 20, textAlign: "center", fontSize: 14 }}>{line.quantity}</AppText>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Add one ${line.name}`}
                    onPress={() => useCart.getState().changeQuantity(line.productId, 1)}
                    className="h-7 w-7 items-center justify-center rounded-lg bg-brand-tint active:opacity-75"
                  >
                    <Plus size={13} color={colors.deepPurple} />
                  </Pressable>
                </View>
                {/* Line total */}
                <AppText variant="label" style={{ minWidth: 48, textAlign: "right", fontSize: 13 }}>
                  {formatMoney(line.priceCents * line.quantity)}
                </AppText>
              </View>
            );
          })}
          {!lines.length ? <AppText color={colors.secondary}>Your basket is empty.</AppText> : null}
        </View>

        {/* Customer card (credit mode or customer with balance) */}
        {creditMode || (customerId && (balance > 0 || changeDisp === "OWED")) ? (
          <View className="gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
            <AppText variant="heading" style={{ fontSize: 15 }}>Customer account</AppText>
            {customer ? (
              <View className="flex-row items-center gap-3 rounded-xl bg-brand-tint px-3 py-2.5">
                <View className="h-10 w-10 items-center justify-center rounded-full bg-gold">
                  <AppText variant="label" color={colors.deepPurple}>{customer.name[0]?.toUpperCase()}</AppText>
                </View>
                <View className="min-w-0 flex-1">
                  <AppText variant="label" style={{ fontSize: 13 }}>{customer.name}</AppText>
                  <AppText variant="small" color={colors.secondary} style={{ fontSize: 11 }}>{customer.phone || "No phone number"}</AppText>
                </View>
                <StatusBadge label="Credit sale" tone="amber" />
              </View>
            ) : (
              <AppText color={colors.danger} style={{ fontSize: 13 }}>No customer selected. Choose a customer from the credit tab.</AppText>
            )}
          </View>
        ) : null}

        {/* Payment method */}
        <View className="gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
          <AppText variant="heading" style={{ fontSize: 15 }}>Payment method</AppText>
          <View className="flex-row gap-2">
            {paymentMethods.map((m) => {
              const selected = method === m.key;
              return (
                <Pressable
                  key={m.key}
                  accessibilityRole="radio"
                  accessibilityLabel={`${m.label}: ${m.detail}`}
                  accessibilityState={{ checked: selected }}
                  onPress={() => setMethod(m.key)}
                  className={`min-h-[52px] flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border px-2 active:opacity-80 ${selected ? "border-brand bg-brand-tint" : "border-line bg-surface"}`}
                >
                  {m.icon}
                  <AppText variant="small" color={selected ? colors.deepPurple : colors.secondary} style={{ fontSize: 12 }}>{m.label}</AppText>
                </Pressable>
              );
            })}
          </View>

          {/* Amount received */}
          {creditMode || method === "CASH" ? (
            <Field
              label={method === "CASH" ? "Cash received" : "Amount received now"}
              keyboardType="decimal-pad"
              value={paidAmount ?? suggested}
              onChangeText={setPaidAmount}
              placeholder={suggested}
            />
          ) : null}

          {/* Total row */}
          <View className="flex-row items-center justify-between border-t border-line pt-3">
            <AppText variant="label" style={{ fontSize: 14 }}>Total</AppText>
            <AppText variant="amount" style={{ fontSize: 22 }}>{formatMoney(total)}</AppText>
          </View>

          {/* Balance due */}
          {balance > 0 ? (
            <View className="flex-row items-center gap-3 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2.5">
              <View className="min-w-0 flex-1">
                <AppText variant="label" color={colors.warning} style={{ fontSize: 13 }}>Remaining balance</AppText>
                {!customerId ? (
                  <AppText variant="small" color={colors.secondary} style={{ fontSize: 11, marginTop: 2 }}>Link a customer to record this as pay later.</AppText>
                ) : null}
              </View>
              <AppText variant="amount" color={colors.warning} style={{ fontSize: 18 }}>{formatMoney(balance)}</AppText>
            </View>
          ) : null}

          {/* Change due */}
          {change > 0 ? (
            <View className="gap-2.5 rounded-xl border border-success/20 bg-success/10 px-3 py-2.5">
              <View className="flex-row items-center justify-between">
                <AppText variant="label" color={colors.success} style={{ fontSize: 13 }}>Change due</AppText>
                <AppText variant="amount" color={colors.success} style={{ fontSize: 18 }}>{formatMoney(change)}</AppText>
              </View>
              <View className="flex-row gap-2">
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: changeDisp === "GIVEN" }}
                  onPress={() => setChangeDisp("GIVEN")}
                  className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-lg border py-2 active:opacity-75 ${changeDisp === "GIVEN" ? "border-success bg-surface" : "border-line bg-surface"}`}
                >
                  <Check size={14} color={changeDisp === "GIVEN" ? colors.success : colors.secondary} />
                  <AppText variant="small" color={changeDisp === "GIVEN" ? colors.success : colors.secondary} style={{ fontSize: 12 }}>Give now</AppText>
                </Pressable>
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: changeDisp === "OWED" }}
                  onPress={() => setChangeDisp("OWED")}
                  className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-lg border py-2 active:opacity-75 ${changeDisp === "OWED" ? "border-warning bg-warning/10" : "border-line bg-surface"}`}
                >
                  <AppText variant="small" color={changeDisp === "OWED" ? colors.warning : colors.secondary} style={{ fontSize: 12 }}>Collect later</AppText>
                </Pressable>
              </View>
              {changeDisp === "OWED" ? (
                customerId ? (
                  <View className="gap-1 rounded-lg bg-surface px-3 py-2">
                    <AppText variant="small" color={colors.secondary} style={{ fontSize: 11 }}>Customer collecting change</AppText>
                    <AppText variant="label" style={{ fontSize: 13 }}>{customer?.name ?? "Loading…"}</AppText>
                  </View>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    className="flex-row items-center justify-between rounded-lg border border-brand/30 bg-brand-tint px-3 py-2.5 active:opacity-80"
                    onPress={() => router.push({ pathname: "/credit/new-credit-sale", params: { preserveCart: "true", purpose: "change" } })}
                  >
                    <AppText variant="label" color={colors.deepPurple} style={{ fontSize: 13 }}>Choose who will collect it</AppText>
                    <ChevronRight size={17} color={colors.deepPurple} />
                  </Pressable>
                )
              ) : null}
            </View>
          ) : null}

          {/* Link customer for balance */}
          {!customerId && balance > 0 ? (
            <Pressable
              accessibilityRole="button"
              className="flex-row items-center justify-between rounded-xl border border-brand/30 bg-brand-tint px-4 py-3 active:opacity-80"
              onPress={() => router.push({ pathname: "/credit/new-credit-sale", params: { preserveCart: "true" } })}
            >
              <AppText variant="label" color={colors.deepPurple} style={{ fontSize: 13 }}>Choose customer · record balance later</AppText>
              <ChevronRight size={17} color={colors.deepPurple} />
            </Pressable>
          ) : null}
        </View>

        {/* Lookup error */}
        {lookupError ? (
          <View className="gap-2 rounded-2xl bg-danger/10 p-3">
            <AppText variant="small" color={colors.danger}>{lookupError}</AppText>
            <Pressable accessibilityRole="button" onPress={() => setLookupRetry((v) => v + 1)}>
              <AppText variant="label" color={colors.deepPurple}>Retry</AppText>
            </Pressable>
          </View>
        ) : null}

        {/* General error */}
        {error ? (
          <View className="rounded-2xl bg-danger/10 p-3">
            <AppText variant="small" color={colors.danger}>{error}</AppText>
          </View>
        ) : null}
      </ScrollView>

      {/* Sticky footer */}
      <View
        className="border-t border-line bg-canvas px-0 pt-2"
        style={{ paddingBottom: Math.max(insets.bottom, 10) }}
      >
        {!canComplete ? (
          <AppText variant="small" color={colors.secondary} style={{ textAlign: "center", marginBottom: 8, fontSize: 12 }}>
            {!lines.length
              ? "Add an item to complete this sale."
              : changeDisp === "OWED" && change > 0 && !customerId
                ? "Choose the customer who will collect the change."
                : "Choose a customer to record the remaining balance."}
          </AppText>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={change > 0 ? changeDisp === "OWED" ? `Record sale and ${formatMoney(change)} change owed` : `Complete sale and give ${formatMoney(change)} change` : "Complete sale"}
          disabled={busy || !canComplete}
          onPress={completeSale}
          className={`min-h-[54px] flex-row items-center justify-center gap-2.5 rounded-2xl ${canComplete ? "bg-brand active:opacity-85" : "bg-brand/50"}`}
        >
          {busy ? <ActivityIndicator size="small" color="#fff" /> : <Check size={19} color="#fff" />}
          <AppText variant="label" color="#fff" numberOfLines={1} style={{ fontSize: 15 }}>
            {busy ? "Saving sale…" : change > 0 ? changeDisp === "OWED" ? `Record change owed · ${formatMoney(change)}` : `Complete sale · give ${formatMoney(change)}` : "Complete sale"}
          </AppText>
        </Pressable>
      </View>
    </Page>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SalesHistoryScreen
// ─────────────────────────────────────────────────────────────────────────────

export function SalesHistoryScreen() {
  const db = useSQLiteContext();
  const { session, businessId } = useAuth();
  const { revision } = useSyncStatus();
  const ownerId = businessId ?? session?.user.id ?? "";

  const [sales, setSales]             = useState<SaleSummary[]>([]);
  const [refreshing, setRefreshing]   = useState(false);
  const [loading, setLoading]         = useState(true);
  const [loadError, setLoadError]     = useState("");
  const [search, setSearch]           = useState("");
  const [dateFilter, setDateFilter]   = useState<HistoryDateFilter>("30_DAYS");
  const [customRange, setCustomRange] = useState<DateRange | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [draftStart, setDraftStart]   = useState<Date | null>(null);
  const [draftEnd, setDraftEnd]       = useState<Date | null>(null);
  const [expandedId, setExpandedId]   = useState<string | null>(null);

  const dateBounds = useMemo(() => getHistoryDateBounds(dateFilter, customRange), [dateFilter, customRange]);
  const calendarDays = useMemo(() => getCalendarDays(calendarMonth), [calendarMonth]);
  const datePresets = [
    { key: "TODAY", label: "Today" },
    { key: "7_DAYS", label: "7 days" },
    { key: "30_DAYS", label: "30 days" },
  ] as const;

  const visible = useMemo(() => sales.filter((s) => {
    const matchSearch = `${s.receipt_number} ${s.customer_name ?? ""}`.toLowerCase().includes(search.trim().toLowerCase());
    return matchSearch;
  }), [sales, search]);
  const totals = useMemo(() => sales.reduce((sum, sale) => ({
    salesCents: sum.salesCents + sale.total_cents,
    receivedCents: sum.receivedCents + sale.paid_cents,
    creditCents: sum.creditCents + sale.balance_cents,
  }), { salesCents: 0, receivedCents: 0, creditCents: 0 }), [sales]);

  const selectDatePreset = (nextFilter: Exclude<HistoryDateFilter, "CUSTOM">) => {
    if (dateFilter === nextFilter && customRange === null) {
      setCalendarOpen(false);
      return;
    }
    setLoading(true);
    setLoadError("");
    setCustomRange(null);
    setDateFilter(nextFilter);
    setCalendarOpen(false);
  };
  const openCalendar = () => {
    const reference = customRange?.start ?? new Date();
    setCalendarMonth(new Date(reference.getFullYear(), reference.getMonth(), 1));
    setDraftStart(customRange?.start ?? null);
    setDraftEnd(customRange?.end ?? null);
    setCalendarOpen((open) => !open);
  };
  const selectCalendarDay = (day: Date) => {
    const selected = startOfLocalDay(day);
    if (!draftStart || draftEnd) {
      setDraftStart(selected);
      setDraftEnd(null);
    } else if (selected.getTime() < draftStart.getTime()) {
      setDraftStart(selected);
      setDraftEnd(null);
    } else {
      setDraftEnd(selected);
    }
  };
  const applyCalendarRange = () => {
    if (!draftStart || !draftEnd) return;
    setLoading(true);
    setLoadError("");
    setCustomRange({ start: draftStart, end: draftEnd });
    setDateFilter("CUSTOM");
    setCalendarOpen(false);
  };

  const refresh = async () => {
    setRefreshing(true);
    setLoadError("");
    try { setSales(await listSalesBetween(db, ownerId, dateBounds.start.toISOString(), dateBounds.endExclusive.toISOString())); }
    catch (e) { setLoadError(e instanceof Error ? e.message : "Sales history could not be loaded."); }
    finally { setRefreshing(false); }
  };

  useEffect(() => {
    let active = true;
    void listSalesBetween(db, ownerId, dateBounds.start.toISOString(), dateBounds.endExclusive.toISOString()).then((data) => {
      if (active) setSales(data);
    }).catch((e: unknown) => {
      if (active) setLoadError(e instanceof Error ? e.message : "Sales history could not be loaded.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [db, ownerId, revision, dateBounds.start, dateBounds.endExclusive]);

  return (
    <Page
      title="Sales history"
      subtitle="Receipts and payments"
      back
      scroll={false}
      contentStyle={st.historyPage}
      right={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Start a new sale"
          onPress={() => router.push("/(tabs)/sales")}
          className="h-10 w-10 items-center justify-center rounded-xl bg-brand-tint active:opacity-75"
        >
          <Plus size={19} color={colors.deepPurple} />
        </Pressable>
      }
    >
      <ScrollView
        style={st.historyScroller}
        contentContainerStyle={st.historyContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.purple} />}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Search */}
        <Field
          label=""
          accessibilityLabel="Search sales history"
          icon={<Search size={18} color={colors.secondary} />}
          placeholder="Search customer or receipt…"
          value={search}
          onChangeText={setSearch}
        />

        {/* Date range */}
        <View className="gap-2">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.filterRow}>
            {datePresets.map((preset) => {
              const active = dateFilter === preset.key;
              return (
                <Pressable
                  key={preset.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => selectDatePreset(preset.key)}
                  className={`min-h-9 items-center justify-center rounded-full border px-3 active:opacity-80 ${active ? "border-brand bg-brand" : "border-line bg-surface"}`}
                >
                  <AppText variant="small" color={active ? colors.surface : colors.secondary} style={{ fontSize: 12 }}>{preset.label}</AppText>
                </Pressable>
              );
            })}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={customRange ? `Calendar range ${shortCalendarDate(customRange.start)} to ${shortCalendarDate(customRange.end)}` : "Choose dates from calendar"}
              accessibilityState={{ selected: dateFilter === "CUSTOM" }}
              onPress={openCalendar}
              className={`min-h-9 flex-row items-center justify-center gap-1.5 rounded-full border px-3 active:opacity-80 ${dateFilter === "CUSTOM" ? "border-brand bg-brand" : "border-line bg-surface"}`}
            >
              <CalendarDays size={15} color={dateFilter === "CUSTOM" ? colors.surface : colors.deepPurple} />
              <AppText variant="small" color={dateFilter === "CUSTOM" ? colors.surface : colors.deepPurple} style={{ fontSize: 12 }}>
                {customRange ? `${shortCalendarDate(customRange.start)} – ${shortCalendarDate(customRange.end)}` : "Calendar"}
              </AppText>
            </Pressable>
          </ScrollView>

          {calendarOpen ? (
            <View className="gap-3 rounded-2xl border border-line bg-surface p-3">
              <View className="flex-row items-center justify-between">
                <View className="gap-0.5">
                  <AppText variant="label" color={colors.deepPurple}>Choose date range</AppText>
                  <AppText variant="small" color={colors.secondary}>
                    {draftStart && draftEnd
                      ? `${shortCalendarDate(draftStart)} – ${shortCalendarDate(draftEnd)}`
                      : draftStart ? "Now choose the end date" : "Select a start date, then an end date"}
                  </AppText>
                </View>
                <View className="flex-row items-center gap-1">
                  <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => setCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="h-9 w-9 items-center justify-center rounded-full bg-brand-tint active:opacity-80">
                    <ChevronLeft size={18} color={colors.deepPurple} />
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel="Next month" onPress={() => setCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="h-9 w-9 items-center justify-center rounded-full bg-brand-tint active:opacity-80">
                    <ChevronRight size={18} color={colors.deepPurple} />
                  </Pressable>
                </View>
              </View>
              <AppText variant="label" color={colors.text} style={{ textAlign: "center" }}>
                {calendarMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
              </AppText>
              <View className="flex-row">
                {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
                  <View key={`${day}-${index}`} className="w-[14.28%] items-center py-1">
                    <AppText variant="small" color={colors.secondary}>{day}</AppText>
                  </View>
                ))}
              </View>
              <View className="flex-row flex-wrap">
                {calendarDays.map((day) => {
                  const outsideMonth = day.getMonth() !== calendarMonth.getMonth();
                  const isStart = sameLocalDay(draftStart, day);
                  const isEnd = sameLocalDay(draftEnd, day);
                  const inRange = Boolean(draftStart && draftEnd && day.getTime() > draftStart.getTime() && day.getTime() < draftEnd.getTime());
                  const isToday = sameLocalDay(new Date(), day);
                  const selected = isStart || isEnd;
                  return (
                    <Pressable
                      key={day.toISOString()}
                      accessibilityRole="button"
                      accessibilityLabel={shortCalendarDate(day)}
                      accessibilityState={{ selected }}
                      disabled={outsideMonth}
                      onPress={() => selectCalendarDay(day)}
                      className={`h-10 w-[14.28%] items-center justify-center rounded-full ${selected ? "bg-brand" : inRange ? "bg-brand-tint" : "bg-surface"} ${isToday && !selected ? "border border-brand" : ""} ${outsideMonth ? "opacity-0" : ""}`}
                    >
                      <AppText variant="small" color={selected ? colors.surface : colors.text}>{day.getDate()}</AppText>
                    </Pressable>
                  );
                })}
              </View>
              <View className="flex-row justify-end gap-2 border-t border-line pt-3">
                <Pressable accessibilityRole="button" onPress={() => setCalendarOpen(false)} className="min-h-10 items-center justify-center rounded-xl px-4 active:opacity-80">
                  <AppText variant="label" color={colors.secondary}>Cancel</AppText>
                </Pressable>
                <Pressable accessibilityRole="button" disabled={!draftStart || !draftEnd} onPress={applyCalendarRange} className={`min-h-10 items-center justify-center rounded-xl px-4 ${draftStart && draftEnd ? "bg-brand" : "bg-line"}`}>
                  <AppText variant="label" color={draftStart && draftEnd ? colors.surface : colors.secondary}>Apply</AppText>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>

        {/* Totals for the selected date range */}
        <View className="flex-row gap-2">
          {[
            { label: "Total Sales", amount: totals.salesCents, icon: ShoppingCart, tone: colors.deepPurple },
            { label: "Cash Received", amount: totals.receivedCents, icon: Banknote, tone: colors.success },
            { label: "Credit", amount: totals.creditCents, icon: CreditCard, tone: colors.danger },
          ].map((metric) => {
            const Icon = metric.icon;
            return (
              <View key={metric.label} className="min-w-0 flex-1 gap-2 rounded-xl border border-line bg-surface p-2.5">
                <View className="flex-row items-center justify-between gap-1">
                  <AppText variant="small" color={colors.secondary} numberOfLines={1} style={{ fontSize: 10 }}>{metric.label}</AppText>
                  <Icon size={15} color={metric.tone} />
                </View>
                <AppText variant="label" color={metric.tone} numberOfLines={1} style={{ fontSize: 13 }}>
                  {formatMoney(metric.amount)}
                </AppText>
              </View>
            );
          })}
        </View>

        {/* Header row */}
        <View className="flex-row items-center justify-between">
          <AppText variant="heading" style={{ fontSize: 15 }}>Sales</AppText>
          <AppText variant="small" color={colors.secondary} style={{ fontSize: 12 }}>
            {visible.length} {visible.length === 1 ? "sale" : "sales"}
          </AppText>
        </View>

        {/* Compact sale list headings */}
        <View className="flex-row items-center border-b border-line px-2 pb-2">
          <AppText variant="small" color={colors.secondary} style={{ width: "31%", fontSize: 10 }}>Time</AppText>
          <AppText variant="small" color={colors.secondary} style={{ width: "37%", fontSize: 10 }}>Items</AppText>
          <AppText variant="small" color={colors.secondary} style={{ flex: 1, textAlign: "right", fontSize: 10 }}>Total</AppText>
          <View className="w-5" />
        </View>

        {/* Loading */}
        {loading ? (
          <View className="min-h-[120px] flex-row items-center justify-center gap-3">
            <ActivityIndicator color={colors.purple} />
            <AppText variant="small" color={colors.secondary}>Loading sales…</AppText>
          </View>
        ) : null}

        {/* Error */}
        {loadError ? (
          <View className="rounded-2xl bg-danger/10 p-3">
            <AppText variant="small" color={colors.danger}>{loadError}</AppText>
          </View>
        ) : null}

        {/* Sale rows */}
        {!loading && !loadError && visible.map((sale) => {
          const expanded = expandedId === sale.id;
          const paymentLabel = formatPaymentMethod(sale.payment_method, sale.status);
          const paymentColor = sale.balance_cents > 0 ? colors.danger : colors.success;
          return (
            <View key={sale.id} className="overflow-hidden border-b border-line">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${formatSaleTime(sale.created_at)}, ${sale.item_count ?? 0} items, ${formatMoney(sale.total_cents)}, ${paymentLabel}`}
                accessibilityState={{ expanded }}
                onPress={() => setExpandedId(expanded ? null : sale.id)}
                className="min-h-14 flex-row items-center px-2 active:bg-brand-tint"
              >
                <AppText variant="small" color={colors.secondary} style={{ width: "31%", fontSize: 10 }}>{formatSaleTime(sale.created_at)}</AppText>
                <AppText variant="small" color={colors.text} style={{ width: "37%", fontSize: 11 }}>
                  {sale.item_count ?? 0} {(sale.item_count ?? 0) === 1 ? "item" : "items"}
                </AppText>
                <View className="min-w-0 flex-1 items-end gap-0.5">
                  <AppText variant="label" color={colors.deepPurple} numberOfLines={1} style={{ fontSize: 12 }}>{formatMoney(sale.total_cents)}</AppText>
                  <AppText variant="small" color={paymentColor} style={{ fontSize: 9 }}>{paymentLabel}</AppText>
                </View>
                <ChevronRight size={16} color={colors.secondary} />
              </Pressable>

              {/* Expanded receipt details */}
              {expanded ? (
                <View className="border-t border-line bg-surface px-3 py-3">
                  <SaleDetailPanel db={db} ownerId={ownerId} sale={sale} />
                </View>
              ) : null}
            </View>
          );
        })}

        {/* Empty state */}
        {!loading && !loadError && !visible.length ? (
          <IllustratedEmptyState
            image={require("@/assets/images/shop-illustrations/sales/sales-recorded.png")}
            title={sales.length ? "No matching sales" : dateFilter !== "30_DAYS" ? "No sales in this date range" : "No sales recorded yet"}
            description={sales.length ? "Try another customer name or receipt number." : dateFilter !== "30_DAYS" ? "Try a different date range or start a sale." : "Completed sales will appear here."}
            action={
              <PrimaryButton
                label={sales.length || dateFilter !== "30_DAYS" ? "Clear filters" : "Start a sale"}
                onPress={sales.length || dateFilter !== "30_DAYS" ? () => { setSearch(""); selectDatePreset("30_DAYS"); } : () => router.push("/(tabs)/sales")}
              />
            }
          />
        ) : null}
      </ScrollView>
    </Page>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SaleDetailPanel
// ─────────────────────────────────────────────────────────────────────────────

function SaleDetailPanel({ db, ownerId, sale }: { db: ReturnType<typeof useSQLiteContext>; ownerId: string; sale: SaleSummary }) {
  const [detail, setDetail] = useState<SaleDetail | null>(null);
  const [error, setError]   = useState("");

  useEffect(() => {
    let active = true;
    void getSaleDetail(db, ownerId, sale.id).then((v) => {
      if (!active) return;
      if (v) setDetail(v);
      else setError("This receipt could not be loaded.");
    }).catch((e: unknown) => {
      if (active) setError(e instanceof Error ? e.message : "Receipt could not be loaded.");
    });
    return () => { active = false; };
  }, [db, ownerId, sale.id]);

  const methodLabel = (m: string) =>
    m === "ECOCASH" ? "EcoCash" : m === "CARD" ? "Card" : m === "OTHER" ? "Other" : "Cash";

  return (
    <View className="gap-2.5">
      {/* Meta */}
      <View className="flex-row items-center justify-between">
        <AppText variant="small" color={colors.secondary} style={{ fontSize: 11 }}>Receipt</AppText>
        <AppText variant="small" style={{ fontSize: 11 }}>{sale.receipt_number}</AppText>
      </View>
      <View className="flex-row items-center justify-between">
        <AppText variant="small" color={colors.secondary} style={{ fontSize: 11 }}>Location · Seller</AppText>
        <AppText variant="small" style={{ fontSize: 11 }} numberOfLines={1}>{sale.location_name ?? "—"} · {sale.seller_name ?? "—"}</AppText>
      </View>

      {error ? <AppText variant="small" color={colors.danger}>{error}</AppText> : null}

      {detail ? (
        <>
          {/* Items */}
          <AppText variant="label" style={{ fontSize: 12, marginTop: 4 }}>Items</AppText>
          {detail.items.map((item) => (
            <View key={item.id} className="flex-row items-center justify-between">
              <AppText variant="small" style={{ flex: 1, fontSize: 12 }} numberOfLines={1}>{item.product_name} × {item.quantity}</AppText>
              <AppText variant="small" style={{ fontSize: 12 }}>{formatMoney(item.line_total_cents)}</AppText>
            </View>
          ))}
          {!detail.items.length ? <AppText variant="small" color={colors.secondary}>No item lines saved.</AppText> : null}

          {/* Total */}
          <View className="flex-row items-center justify-between border-t border-line pt-2">
            <AppText variant="small" color={colors.secondary} style={{ fontSize: 12 }}>Total</AppText>
            <AppText variant="label" style={{ fontSize: 13 }}>{formatMoney(detail.sale.total_cents)}</AppText>
          </View>

          {/* Tendered */}
          {detail.sale.amount_tendered_cents != null && detail.sale.amount_tendered_cents > detail.sale.total_cents ? (
            <View className="flex-row items-center justify-between">
              <AppText variant="small" color={colors.secondary} style={{ fontSize: 11 }}>Cash tendered</AppText>
              <AppText variant="small" style={{ fontSize: 11 }}>{formatMoney(detail.sale.amount_tendered_cents)}</AppText>
            </View>
          ) : null}

          {/* Payments */}
          {detail.payments.map((p) => (
            <View key={p.id} className="flex-row items-center justify-between">
              <AppText variant="small" color={colors.secondary} style={{ fontSize: 11 }}>{p.kind === "REPAYMENT" ? "Repayment" : "Payment"} · {methodLabel(p.method)}</AppText>
              <AppText variant="small" style={{ fontSize: 11 }}>{formatMoney(p.amount_cents)}</AppText>
            </View>
          ))}
          {!detail.payments.length ? <AppText variant="small" color={colors.secondary} style={{ fontSize: 11 }}>No payment recorded yet.</AppText> : null}

          {/* Balance */}
          {detail.sale.balance_cents > 0 ? (
            <View className="flex-row items-center justify-between rounded-lg bg-warning/10 px-3 py-1.5">
              <AppText variant="small" color={colors.warning} style={{ fontSize: 11 }}>Still owed</AppText>
              <AppText variant="label" color={colors.warning} style={{ fontSize: 12 }}>{formatMoney(detail.sale.balance_cents)}</AppText>
            </View>
          ) : null}

          {/* Change */}
          {detail.sale.change_due_cents > 0 ? (
            detail.changeOwed?.status === "OPEN" ? (
              <View className="flex-row items-center justify-between rounded-lg bg-warning/10 px-3 py-1.5">
                <AppText variant="small" color={colors.warning} style={{ fontSize: 11 }}>Change owed · collect later</AppText>
                <AppText variant="label" color={colors.warning} style={{ fontSize: 12 }}>{formatMoney(detail.changeOwed.amount_cents)}</AppText>
              </View>
            ) : detail.changeOwed?.status === "SETTLED" ? (
              <View className="flex-row items-center justify-between rounded-lg bg-success/10 px-3 py-1.5">
                <AppText variant="small" color={colors.success} style={{ fontSize: 11 }}>Change returned</AppText>
                <AppText variant="small" color={colors.success} style={{ fontSize: 11 }}>{formatMoney(detail.changeOwed.amount_cents)}</AppText>
              </View>
            ) : null
          ) : detail.sale.amount_tendered_cents != null && detail.sale.amount_tendered_cents > detail.sale.total_cents ? (
            <View className="flex-row items-center justify-between rounded-lg bg-success/10 px-3 py-1.5">
              <AppText variant="small" color={colors.success} style={{ fontSize: 11 }}>Change given</AppText>
              <AppText variant="small" color={colors.success} style={{ fontSize: 11 }}>{formatMoney(detail.sale.amount_tendered_cents - detail.sale.total_cents)}</AppText>
            </View>
          ) : null}
        </>
      ) : !error ? (
        <View className="flex-row items-center gap-2 py-2">
          <ActivityIndicator size="small" color={colors.purple} />
          <AppText variant="small" color={colors.secondary} style={{ fontSize: 11 }}>Loading receipt…</AppText>
        </View>
      ) : null}

      {/* Sync status */}
      <View className="flex-row items-center gap-2 pt-1">
        <View className={`h-2 w-2 rounded-full ${sale.sync_state === "SYNCED" ? "bg-success" : "bg-info"}`} />
        <AppText variant="small" color={colors.secondary} style={{ fontSize: 10 }}>
          {sale.sync_state === "SYNCED" ? "Uploaded to the cloud" : "Saved on device · will sync when available"}
        </AppText>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Minimal StyleSheet — only for layout values that NativeWind can't express
// (flex page containers, absolute positioning, ScrollView contentContainerStyle)
// ─────────────────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  // SalesScreen
  salesPage:          { flex: 1 },
  salesScroller:      { flex: 1 },
  salesScrollContent: { gap: 10, paddingBottom: 14 },
  categoryRow:        { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 2 },

  // CheckoutScreen
  checkoutPage:    { flex: 1 },
  checkoutScroller: { flex: 1 },
  checkoutContent: { gap: 12, paddingBottom: 130 },

  // SalesHistoryScreen
  historyPage:    { flex: 1 },
  historyScroller: { flex: 1, minHeight: 0 },
  historyContent: { gap: 12, paddingBottom: 24 },
  filterRow:      { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 2 },
});
