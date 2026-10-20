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
  getSaleDetail,
  listProductsForSale,
  listRecentSales,
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
import { formatDateTime, formatMoney, toCents } from "@/lib/format";
import { imageSource } from "@/lib/product-images";
import { useCart } from "@/stores/cart";
import { router } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import {
  Apple,
  Boxes,
  Banknote,
  Check,
  CupSoda,
  ChevronDown,
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

function saleCategory(product: Product) {
  const value = `${product.name} ${product.category}`.toLocaleLowerCase();
  if (/drink|beverage|water|maheu|mahewu|mahero|juice|soda/.test(value)) return "Drinks";
  if (/household|clean|soap|detergent|toilet|tissue|personal care|shampoo/.test(value)) return "Household";
  return "Groceries";
}

const salesCategoryIcons: Record<string, typeof Boxes> = {
  All: Boxes,
  Groceries: Apple,
  Drinks: CupSoda,
  Household: Package,
};

export function SalesScreen() {
  const db = useSQLiteContext();
  const { session, businessId } = useAuth();
  const { revision } = useSyncStatus();
  const ownerId = businessId ?? session?.user.id ?? "";
  const [rows, setRows] = useState<Product[]>([]);
  const [productLoadError, setProductLoadError] = useState('');
  const [productRetry, setProductRetry] = useState(0);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const lines = useCart((state) => state.lines);
  const creditMode = useCart((state) => state.creditMode);
  const locationId = useCart((state) => state.locationId);
  const sellerId = useCart((state) => state.sellerId);
  const setLocationId = useCart((state) => state.setLocationId);
  const setSellerId = useCart((state) => state.setSellerId);
  const addProduct = useCart((state) => state.addProduct);
  const total = lines.reduce(
    (sum, item) => sum + Math.round(item.priceCents * item.quantity),
    0,
  );
  const itemCount = lines.reduce((count, item) => count + item.quantity, 0);
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
      if (!locationRows.some((location) => location.id === locationId)) setLocationId(primary?.id ?? locationRows[0]?.id ?? null);
      if (!sellerRows.some((seller) => seller.id === sellerId)) setSellerId(currentSeller?.id ?? null);
    })().catch(() => {});
    return () => { active = false; };
  }, [db, ownerId, businessId, session, session?.user.id, session?.user.email, session?.user.user_metadata?.full_name, locationId, sellerId, setLocationId, setSellerId, revision]);
  useEffect(() => {
    let active = true;
    void listProductsForSale(db, ownerId, search, locationId).then((data) => {
      if (active) { setProductLoadError(''); setRows(data); }
    }).catch((value: unknown) => {
      if (active) setProductLoadError(value instanceof Error ? value.message : 'Products could not be loaded. Check your connection and retry.');
    });
    return () => {
      active = false;
    };
  }, [db, ownerId, search, locationId, revision, productRetry]);
  const categories = useMemo(
    () => ["All", "Groceries", "Drinks", "Household"],
    [],
  );
  const visibleRows = useMemo(
    () => rows.filter((product) => category === "All" || saleCategory(product) === category),
    [category, rows],
  );
  return (
    <Page
      scroll={false}
      contentStyle={styles.salesPage}
    >
      <ScrollView
        style={styles.salesScroller}
        contentContainerStyle={styles.salesScrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
      {productLoadError ? <View style={styles.errorBox}><AppText variant="small" color={colors.danger}>{productLoadError}</AppText><Pressable accessibilityRole="button" onPress={()=>setProductRetry((value)=>value+1)}><AppText variant="label" color={colors.deepPurple}>Retry loading products</AppText></Pressable></View> : null}
      <View className="w-full flex-row items-center gap-2">
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
          className="h-11 w-11 items-center justify-center rounded-2xl border border-line bg-brand-tint active:opacity-80"
        >
          <ReceiptText size={18} color={colors.deepPurple} />
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryFilters}>
        {categories.map((item) => {
          const Icon = salesCategoryIcons[item] ?? Package;
          const selected = category === item;
          return (
            <Pressable
              key={item}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setCategory(item)}
              className={`min-h-9 flex-row items-center justify-center gap-1.5 rounded-full border px-3 ${selected ? 'border-brand bg-brand' : 'border-line bg-surface'}`}
            >
              <Icon size={14} color={selected ? colors.surface : colors.secondary} />
              <AppText variant="small" color={selected ? colors.surface : colors.secondary} style={{ fontSize: 11 }}>{item}</AppText>
            </Pressable>
          );
        })}
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
        <View className="w-full overflow-hidden rounded-2xl border border-line bg-surface">
          {visibleRows.map((product) => {
            const inCart = lines.find((line) => line.productId === product.id);
            return (
              <Pressable
                key={product.id}
                accessibilityRole="button"
                accessibilityLabel={`Add ${product.name} to sale, ${formatMoney(product.price_cents)}, ${product.stock_quantity} ${product.unit} in stock`}
                onPress={() => addProduct(product)}
                className="min-h-[68px] w-full flex-row items-center gap-3 border-b border-line px-3 py-2 active:bg-brand-tint/40"
              >
                <View className="h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-canvas">
                  {imageSource(product) ? (
                    <Image
                      source={imageSource(product)!}
                      resizeMode="contain"
                      className="h-11 w-11"
                      accessibilityLabel={`${product.name} product photo`}
                    />
                  ) : (
                    <Package size={21} color={colors.deepPurple} />
                  )}
                </View>
                <View className="min-w-0 flex-1 gap-0.5">
                  <AppText variant="label" numberOfLines={1} style={{ fontSize: 12 }}>
                    {product.name}
                  </AppText>
                  <AppText variant="small" color={colors.purple} numberOfLines={1}>
                    {formatMoney(product.price_cents)}
                  </AppText>
                </View>
                <View className="h-8 w-8 items-center justify-center rounded-full bg-brand">
                  {inCart ? <AppText variant="label" color={colors.surface} style={{ fontSize: 11 }}>{inCart.quantity}</AppText> : <Plus size={17} color={colors.surface} />}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
      </ScrollView>
      {lines.length ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Review sale with ${itemCount} ${itemCount === 1 ? 'item' : 'items'}, total ${formatMoney(total)}`}
          onPress={() => router.push("/sales/checkout")}
          className="min-h-[58px] flex-row items-center gap-3 rounded-2xl bg-brand px-3 py-2 active:opacity-85"
        >
          <View className="h-9 w-9 items-center justify-center rounded-xl bg-brand-deep">
            <ShoppingCart size={20} color={colors.surface} />
          </View>
          <View className="min-w-0 flex-1">
            <AppText variant="small" color={colors.surface}>{itemCount} {itemCount === 1 ? 'item' : 'items'}{creditMode ? ' · Credit sale' : ''}</AppText>
            <AppText variant="label" color={colors.surface}>{formatMoney(total)}</AppText>
          </View>
          <ChevronRight size={19} color={colors.surface} />
        </Pressable>
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
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();
  const { session, businessId } = useAuth();
  const ownerId = businessId ?? session?.user.id ?? "";
  const lines = useCart((state) => state.lines);
  const customerId = useCart((state) => state.customerId);
  const creditMode = useCart((state) => state.creditMode);
  const sellerId = useCart((state) => state.sellerId);
  const locationId = useCart((state) => state.locationId);
  const clear = useCart((state) => state.clear);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [sellerName, setSellerName] = useState('');
  const [locationName, setLocationName] = useState('');
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [changeDisposition, setChangeDisposition] = useState<"GIVEN" | "OWED">("GIVEN");
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
  const [lookupError, setLookupError] = useState('');
  const [lookupRetry, setLookupRetry] = useState(0);
  useEffect(() => {
    let active = true;
    void (customerId ? getCustomer(db, ownerId, customerId) : Promise.resolve(null)).then((value) => {
      if (active) { setLookupError(''); setCustomer(value); if (customerId && !value) setLookupError('This customer could not be found on this device. Choose the customer again.'); }
    }).catch((value: unknown) => {
      if (active) setLookupError(value instanceof Error ? value.message : 'Customer details could not be loaded.');
    });
    return () => {
      active = false;
    };
  }, [db, ownerId, customerId, lookupRetry]);
  useEffect(() => {
    let active = true;
    void Promise.all([listSellers(db, ownerId), listLocations(db, ownerId)]).then(([sellers, locations]) => {
      if (!active) return;
      setLookupError('');
      setSellerName(sellers.find((seller) => seller.id === sellerId)?.name ?? 'Choose seller');
      setLocationName(locations.find((location) => location.id === locationId)?.name ?? 'Choose location');
    }).catch((value: unknown) => {
      if (active) setLookupError(value instanceof Error ? value.message : 'Seller and location details could not be loaded.');
    });
    return () => { active = false; };
  }, [db, ownerId, sellerId, locationId, lookupRetry]);
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
    if (!customerId && balance > 0) {
      setError("Choose a customer before leaving an amount unpaid.");
      return;
    }
    if (changeDisposition === "OWED" && changeCents > 0 && !customerId) {
      setError("Choose the customer who will collect their change later.");
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
        amountTenderedCents: tenderedCents,
        changeDueCents: changeDisposition === "OWED" ? changeCents : 0,
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
          ? "Balance of " +
              formatMoney(result.balanceCents) +
              " added to " +
              (customer?.name ?? "the customer account") +
              "."
          : "Receipt " + result.receiptNumber + " is ready." +
              (changeCents > 0
                ? changeDisposition === "OWED"
                  ? " " + formatMoney(changeCents) + " change is recorded for " + (customer?.name ?? "the customer") + " to collect later."
                  : " Give " + formatMoney(changeCents) + " change now."
                : ""),
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
      <View style={styles.saleContextCard}><View style={styles.saleContextRow}><MapPin size={17} stroke={colors.deepPurple}/><AppText variant="small" color={colors.secondary}>Selling from</AppText><AppText variant="label" numberOfLines={1} style={styles.saleContextValue}>{locationName}</AppText></View><View style={styles.saleContextDivider}/><View style={styles.saleContextRow}><Users size={17} stroke={colors.deepPurple}/><AppText variant="small" color={colors.secondary}>Seller</AppText><AppText variant="label" numberOfLines={1} style={styles.saleContextValue}>{sellerName}</AppText></View></View>
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
      {creditMode || (customerId && (balance > 0 || changeDisposition === "OWED")) ? (
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
          <View style={styles.changeSection}>
            <View style={styles.changeAmountRow}>
              <AppText variant="label" color={colors.success}>Change due</AppText>
              <AppText variant="amount" color={colors.success}>{formatMoney(changeCents)}</AppText>
            </View>
            <View style={styles.changeOptions}>
              <Pressable accessibilityRole="radio" accessibilityState={{ checked: changeDisposition === "GIVEN" }} onPress={() => setChangeDisposition("GIVEN")} style={[styles.changeOption, changeDisposition === "GIVEN" && styles.changeOptionSelected]}>
                <Check size={15} stroke={changeDisposition === "GIVEN" ? colors.success : colors.secondary} />
                <AppText variant="small" color={changeDisposition === "GIVEN" ? colors.success : colors.secondary}>Give now</AppText>
              </Pressable>
              <Pressable accessibilityRole="radio" accessibilityState={{ checked: changeDisposition === "OWED" }} onPress={() => setChangeDisposition("OWED")} style={[styles.changeOption, changeDisposition === "OWED" && styles.changeOptionOwed]}>
                <AppText variant="small" color={changeDisposition === "OWED" ? colors.warning : colors.secondary}>Collect later</AppText>
              </Pressable>
            </View>
            {changeDisposition === "OWED" ? (
              customerId ? (
                <View style={styles.changeCustomer}>
                  <AppText variant="small" color={colors.secondary}>Customer collecting change</AppText>
                  <AppText variant="label">{customer?.name ?? "Loading customer…"}</AppText>
                </View>
              ) : (
                <Pressable accessibilityRole="button" style={styles.linkCustomerButton} onPress={() => router.push({ pathname: "/credit/new-credit-sale", params: { preserveCart: "true", purpose: "change" } })}>
                  <AppText variant="label" color={colors.deepPurple}>Choose who will collect it</AppText>
                  <ChevronRight size={18} stroke={colors.deepPurple} />
                </Pressable>
              )
            ) : null}
          </View>
        ) : null}
        {!customerId && balance > 0 ? (
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
      {lookupError ? <View style={styles.errorBox}><AppText variant="small" color={colors.danger}>{lookupError}</AppText><Pressable accessibilityRole="button" onPress={()=>setLookupRetry((value)=>value+1)}><AppText variant="label" color={colors.deepPurple}>Retry lookup</AppText></Pressable></View> : null}
      {error ? (
        <View style={styles.errorBox}>
          <AppText variant="small" color={colors.danger}>
            {error}
          </AppText>
        </View>
      ) : null}
      </ScrollView>
      <View style={[styles.checkoutFooter, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        {(!lines.length || (balance > 0 && !customerId) || (changeDisposition === "OWED" && changeCents > 0 && !customerId)) ? (
          <AppText variant="small" color={colors.secondary} style={styles.checkoutFooterHint}>
            {!lines.length ? "Add an item to complete this sale." : changeDisposition === "OWED" && changeCents > 0 && !customerId ? "Choose the customer who will collect the change." : "Choose a customer to record the remaining balance."}
          </AppText>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={changeCents > 0 ? changeDisposition === "OWED" ? `Record sale and ${formatMoney(changeCents)} change owed` : `Complete sale and give ${formatMoney(changeCents)} change` : "Complete sale"}
          disabled={busy || !lines.length || (balance > 0 && !customerId) || (changeDisposition === "OWED" && changeCents > 0 && !customerId)}
          onPress={completeSale}
          style={styles.checkoutButton}
        >
          <View style={[styles.checkoutButtonSurface, ((!lines.length || (balance > 0 && !customerId) || (changeDisposition === "OWED" && changeCents > 0 && !customerId)) && styles.checkoutButtonDisabled)]}>
            {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Check size={19} stroke="#FFFFFF" />}
            <AppText variant="label" color="#FFFFFF" numberOfLines={1}>
              {busy ? "Saving sale…" : changeCents > 0 ? changeDisposition === "OWED" ? `Record change owed · ${formatMoney(changeCents)}` : `Complete sale · give ${formatMoney(changeCents)}` : "Complete sale"}
            </AppText>
          </View>
        </Pressable>
      </View>
    </Page>
  );
}

export function SalesHistoryScreen() {
  const db = useSQLiteContext();
  const { session, businessId } = useAuth();
  const { revision } = useSyncStatus();
  const ownerId = businessId ?? session?.user.id ?? "";
  const [sales, setSales] = useState<SaleSummary[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"ALL" | "PAID" | "PARTIAL" | "CREDIT">("ALL");
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);
  const filters = [
    { key: "ALL", label: "All sales" },
    { key: "PAID", label: "Paid" },
    { key: "PARTIAL", label: "Part paid" },
    { key: "CREDIT", label: "On credit" },
  ] as const;
  const visibleSales = useMemo(() => sales.filter((sale) => {
    const matchesFilter = filter === "ALL" || sale.status === filter;
    const matchesSearch = `${sale.receipt_number} ${sale.customer_name ?? "Walk-in customer"}`.toLowerCase().includes(search.trim().toLowerCase());
    return matchesFilter && matchesSearch;
  }), [filter, sales, search]);
  const refresh = async () => {
    setRefreshing(true);
    setLoadError("");
    try {
      setSales(await listRecentSales(db, ownerId));
    } catch (value) {
      setLoadError(value instanceof Error ? value.message : "Sales history could not be loaded.");
    } finally {
      setRefreshing(false);
    }
  };
  useEffect(() => {
    let active = true;
    void listRecentSales(db, ownerId).then((data) => {
      if (active) setSales(data);
    }).catch((value: unknown) => {
      if (active) setLoadError(value instanceof Error ? value.message : "Sales history could not be loaded.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [db, ownerId, revision]);
  return (
    <Page
      title="Sales history"
      subtitle="Receipts and payments"
      back
      scroll={false}
      contentStyle={styles.historyPage}
      right={
        <Pressable accessibilityRole="button" accessibilityLabel="Start a new sale" onPress={() => router.push("/(tabs)/sales")} style={styles.historyAddButton}>
          <Plus size={20} stroke={colors.deepPurple} />
        </Pressable>
      }
    >
      <ScrollView
        style={styles.historyScroller}
        contentContainerStyle={styles.historyContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.purple} />}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Field
          label=""
          accessibilityLabel="Search sales history"
          icon={<Search size={18} stroke={colors.secondary} />}
          placeholder="Search customer or receipt"
          value={search}
          onChangeText={setSearch}
        />
        <ScrollView horizontal style={styles.historyFilterScroller} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.historyFilters}>
          {filters.map((item) => (
            <Pressable key={item.key} accessibilityRole="button" accessibilityState={{ selected: filter === item.key }} onPress={() => setFilter(item.key)} style={[styles.historyFilter, filter === item.key && styles.historyFilterActive]}>
              <AppText variant="small" color={filter === item.key ? "#FFFFFF" : colors.secondary}>{item.label}</AppText>
            </Pressable>
          ))}
        </ScrollView>
        <View style={styles.historyListHeader}>
          <AppText variant="heading">Recent sales</AppText>
          <AppText variant="small" color={colors.secondary}>{visibleSales.length} {visibleSales.length === 1 ? "sale" : "sales"}</AppText>
        </View>
        {loading ? (
          <View style={styles.historyLoading}><ActivityIndicator color={colors.purple} /><AppText variant="small" color={colors.secondary}>Loading sales…</AppText></View>
        ) : null}
        {loadError ? <View style={styles.errorBox}><AppText variant="small" color={colors.danger}>{loadError}</AppText></View> : null}
        {!loading && !loadError && visibleSales.map((sale) => {
          const expanded = expandedSaleId === sale.id;
          const statusLabel = sale.status === "PAID" ? "Paid" : sale.status === "PARTIAL" ? "Part paid" : "On credit";
          const syncLabel = sale.sync_state === "SYNCED" ? "Synced" : "Saved on device";
          return (
            <Pressable key={sale.id} accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpandedSaleId(expanded ? null : sale.id)}>
              <Card style={styles.historyCard}>
                <View style={styles.historyRow}>
                  <View style={styles.receiptIcon}><ReceiptText stroke={colors.deepPurple} size={19} /></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <AppText variant="label" numberOfLines={1}>{sale.customer_name || "Walk-in customer"}</AppText>
                    <AppText variant="small" color={colors.secondary} style={{ marginTop: 3 }} numberOfLines={1}>{formatDateTime(sale.created_at)}</AppText>
                    <AppText variant="small" color={colors.secondary} numberOfLines={1}>{sale.location_name ?? 'No location'} · {sale.seller_name ?? 'Unassigned seller'}</AppText>
                  </View>
                  <View style={styles.historyAmount}>
                    <AppText variant="label">{formatMoney(sale.total_cents)}</AppText>
                    <StatusBadge label={statusLabel} tone={sale.status === "PAID" ? "green" : "amber"} />
                  </View>
                  <ChevronDown size={16} stroke={colors.secondary} style={{ transform: [{ rotate: expanded ? "180deg" : "0deg" }] }} />
                </View>
                {expanded ? (
                  <SaleDetailPanel db={db} ownerId={ownerId} sale={sale} />
                ) : (
                  <View style={styles.historyMeta}><AppText variant="small" color={colors.secondary}>{sale.receipt_number}</AppText><StatusBadge label={syncLabel} tone={sale.sync_state === "SYNCED" ? "green" : "blue"} /></View>
                )}
              </Card>
            </Pressable>
          );
        })}
        {!loading && !loadError && !visibleSales.length ? (
          <IllustratedEmptyState
            image={require("@/assets/images/shop-illustrations/sales/sales-recorded.png")}
            title={sales.length ? "No matching sales" : "No sales recorded yet"}
            description={sales.length ? "Try another customer name, receipt number, or payment filter." : "Completed sales will appear here with their payment and sync status."}
            action={
              <PrimaryButton
                label={sales.length ? "Clear filters" : "Start a sale"}
                onPress={sales.length ? () => { setSearch(""); setFilter("ALL"); } : () => router.push("/(tabs)/sales")}
              />
            }
          />
        ) : null}
      </ScrollView>
    </Page>
  );
}

function SaleDetailPanel({ db, ownerId, sale }: { db: ReturnType<typeof useSQLiteContext>; ownerId: string; sale: SaleSummary }) {
  const [detail, setDetail] = useState<SaleDetail | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void getSaleDetail(db, ownerId, sale.id).then((value) => {
      if (!active) return;
      if (value) setDetail(value);
      else setError("This receipt could not be loaded from this device.");
    }).catch((value: unknown) => {
      if (active) setError(value instanceof Error ? value.message : "This receipt could not be loaded.");
    });
    return () => { active = false; };
  }, [db, ownerId, sale.id]);
  const methodLabel = (method: string) => method === "ECOCASH" ? "EcoCash" : method === "CARD" ? "Card" : method === "OTHER" ? "Other" : "Cash";
  return (
    <View style={styles.historyDetails}>
      <AppText variant="small" color={colors.secondary}>Receipt · {sale.receipt_number}</AppText>
      <View style={styles.historyPaymentRow}><AppText variant="small" color={colors.secondary}>Location · seller</AppText><AppText variant="small" numberOfLines={1}>{sale.location_name ?? 'No location'} · {sale.seller_name ?? 'Unassigned'}</AppText></View>
      {error ? <AppText variant="small" color={colors.danger}>{error}</AppText> : null}
      {detail ? <>
        <AppText variant="label">Items</AppText>
        {detail.items.map((item) => (
          <View key={item.id} style={styles.historyPaymentRow}>
            <AppText variant="small" numberOfLines={1} style={{ flex: 1 }}>{item.product_name} × {item.quantity}</AppText>
            <AppText variant="small">{formatMoney(item.line_total_cents)}</AppText>
          </View>
        ))}
        {!detail.items.length ? <AppText variant="small" color={colors.secondary}>No item lines were saved with this receipt.</AppText> : null}
        <View style={styles.historyPaymentRow}><AppText variant="small" color={colors.secondary}>Total</AppText><AppText variant="label">{formatMoney(detail.sale.total_cents)}</AppText></View>
        {detail.sale.amount_tendered_cents != null && detail.sale.amount_tendered_cents > detail.sale.total_cents ? (
          <View style={styles.historyPaymentRow}><AppText variant="small" color={colors.secondary}>Cash tendered</AppText><AppText variant="small">{formatMoney(detail.sale.amount_tendered_cents)}</AppText></View>
        ) : null}
        {detail.payments.map((payment) => (
          <View key={payment.id} style={styles.historyPaymentRow}>
            <AppText variant="small" color={colors.secondary}>{payment.kind === 'REPAYMENT' ? 'Repayment' : 'Payment'} · {methodLabel(payment.method)}</AppText>
            <AppText variant="small">{formatMoney(payment.amount_cents)}</AppText>
          </View>
        ))}
        {!detail.payments.length ? <AppText variant="small" color={colors.secondary}>No payment recorded yet.</AppText> : null}
        {detail.sale.balance_cents > 0 ? <View style={styles.historyPaymentRow}><AppText variant="small" color={colors.warning}>Still owed by customer</AppText><AppText variant="label" color={colors.warning}>{formatMoney(detail.sale.balance_cents)}</AppText></View> : null}
        {detail.sale.change_due_cents > 0 ? (
          detail.changeOwed?.status === 'OPEN'
            ? <View style={styles.historyPaymentRow}><AppText variant="small" color={colors.warning}>Change owed · collect later</AppText><AppText variant="label" color={colors.warning}>{formatMoney(detail.changeOwed.amount_cents)}</AppText></View>
            : detail.changeOwed?.status === 'SETTLED'
              ? <View style={styles.historyPaymentRow}><AppText variant="small" color={colors.success}>Change returned {detail.changeOwed.settled_at ? formatDateTime(detail.changeOwed.settled_at) : ''}</AppText><AppText variant="small" color={colors.success}>{formatMoney(detail.changeOwed.amount_cents)}</AppText></View>
              : null
        ) : detail.sale.amount_tendered_cents != null && detail.sale.amount_tendered_cents > detail.sale.total_cents ? (
          <View style={styles.historyPaymentRow}><AppText variant="small" color={colors.success}>Change given at checkout</AppText><AppText variant="small" color={colors.success}>{formatMoney(detail.sale.amount_tendered_cents - detail.sale.total_cents)}</AppText></View>
        ) : null}
      </> : !error ? (
        <View style={styles.historyLoadingCompact}><ActivityIndicator size="small" color={colors.purple} /><AppText variant="small" color={colors.secondary}>Loading receipt…</AppText></View>
      ) : null}
      <View style={styles.historySync}><View style={[styles.syncDot, sale.sync_state === "SYNCED" && styles.syncDotComplete]} /><AppText variant="small" color={colors.secondary}>{sale.sync_state === "SYNCED" ? "Uploaded to the cloud" : "Saved on this device · will sync when available"}</AppText></View>
    </View>
  );
}

const styles = StyleSheet.create({
  saleContextCard: { gap: 9, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 15, backgroundColor: '#FFFFFF' },
  saleContextRow: { minHeight: 24, flexDirection: 'row', alignItems: 'center', gap: 8 },
  saleContextValue: { flex: 1, textAlign: 'right' },
  saleContextDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  checkoutPage: { flex: 1 },
  checkoutScroller: { flex: 1 },
  checkoutContent: { gap: 14, paddingBottom: 126 },
  checkoutFooter: { position: "absolute", left: 0, right: 0, bottom: 0, paddingTop: 10, backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.border, zIndex: 2, elevation: 8 },
  checkoutFooterHint: { textAlign: "center", marginBottom: 8 },
  checkoutButton: { width: "100%", minHeight: 54, borderRadius: 16, overflow: "hidden" },
  checkoutButtonSurface: { width: "100%", minHeight: 54, borderRadius: 16, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, backgroundColor: colors.purple },
  checkoutButtonDisabled: { backgroundColor: "#9992C4" },
  checkoutCard: { gap: 11, padding: 14, borderRadius: 18, borderColor: "#D4D7E3", backgroundColor: "#FFFFFF", shadowColor: "#25305A", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2 },
  checkoutProductArt: { width: 68, height: 50, borderRadius: 9, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  checkoutProductImage: { width: 66, height: 48 },
  salesPage: { flex: 1 },
  salesScroller: { flex: 1 },
  salesScrollContent: { gap: 8, paddingBottom: 12 },
  categoryFilters: { flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 2 },
  empty: { alignItems: "center", gap: 10, padding: 18 },
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
  changeSection: { gap: 9, backgroundColor: "#E7F5EF", borderColor: "#CDE9DC", borderWidth: 1, borderRadius: 14, padding: 11 },
  changeAmountRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  changeOptions: { flexDirection: "row", gap: 8 },
  changeOption: { minHeight: 38, flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderWidth: 1, borderColor: "#CDE9DC", borderRadius: 11, backgroundColor: "#FFFFFF", paddingHorizontal: 8 },
  changeOptionSelected: { backgroundColor: "#FFFFFF", borderColor: colors.success },
  changeOptionOwed: { backgroundColor: "#FFF9E9", borderColor: colors.warning },
  changeCustomer: { gap: 3, padding: 10, borderRadius: 11, backgroundColor: "#FFFFFF" },
  linkCustomerButton: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 13, borderRadius: 13, borderWidth: 1, borderColor: "#CFC5F2", backgroundColor: "#F7F5FF" },
  errorBox: { padding: 12, borderRadius: 12, backgroundColor: "#FCEBED" },
  historyPage: { flex: 1 },
  historyScroller: { flex: 1, minHeight: 0 },
  historyContent: { gap: 12, paddingBottom: 24 },
  historyAddButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.lavenderTint, alignItems: "center", justifyContent: "center" },
  historyFilterScroller: { height: 38, flexGrow: 0, flexShrink: 0 },
  historyFilters: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 2 },
  historyFilter: { minHeight: 34, justifyContent: "center", paddingHorizontal: 13, borderRadius: 18, backgroundColor: "#F0F1F7" },
  historyFilterActive: { backgroundColor: colors.purple },
  historyListHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 1 },
  historyLoading: { minHeight: 120, alignItems: "center", justifyContent: "center", gap: 9 },
  historyCard: { gap: 10, padding: 12, borderColor: "#DDE0EA", backgroundColor: "#FFFFFF" },
  historyRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  historyAmount: { alignItems: "flex-end", gap: 6 },
  historyMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 9, borderTopWidth: 1, borderColor: colors.border },
  historyDetails: { gap: 8, paddingTop: 10, borderTopWidth: 1, borderColor: colors.border },
  historyLoadingCompact: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  historyPaymentRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  historySync: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 2 },
  syncDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.info },
  syncDotComplete: { backgroundColor: colors.success },
  receiptIcon: {
    width: 38,
    height: 38,
    backgroundColor: colors.lavenderTint,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
});
