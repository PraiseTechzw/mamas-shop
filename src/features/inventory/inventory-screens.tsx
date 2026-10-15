import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Apple, ArrowDownToLine, Beef, Boxes, ChevronRight, Cookie, Droplets, Ellipsis, ImagePlus, Pencil, Plus, Search, Smartphone, CupSoda, Zap, Bell, Package, Tag } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { File, Paths } from 'expo-file-system';
import { useAuth } from '@/features/auth/auth-context';
import { addProduct, adjustStock, getLocationBalance, getProduct, listInventory, listLocations, listMovements, listProductBalances, receiveStock, transferStock, updateProduct } from '@/db/repositories/inventory';
import type { InventoryLocation, Product, StockMovement } from '@/db/schema';
import { colors, radius } from '@/constants/theme';
import { imageSource, productImage } from '@/lib/product-images';
import { formatDateTime, formatMoney, toCents } from '@/lib/format';
import { AppText, Card, Field, Page, PrimaryButton, SecondaryButton, SectionTitle } from '@/components/ui/primitives';
import { IllustratedEmptyState } from '@/components/feedback/illustrated-empty-state';

const productCategories = [
 {label:'Maheu',value:'Traditional Drinks & Mahero',icon:CupSoda},
 {label:'Soft drinks',value:'Soft Drinks & Flavoured Beverages',icon:CupSoda},
 {label:'Water',value:'Bottled Water',icon:Droplets},
 {label:'Energy drinks',value:'Energy Drinks',icon:Zap},
 {label:'Biscuits',value:'Biscuits & Snacks',icon:Cookie},
 {label:'Snacks',value:'Biscuits & Snacks',icon:Cookie},
 {label:'Fresh produce',value:'Fresh Produce & Other Items',icon:Apple},
 {label:'Meat & deli',value:'Meat & Deli Products',icon:Beef},
 {label:'Airtime',value:'Airtime',icon:Smartphone},
 {label:'Other',value:'Other',icon:Ellipsis},
];

const categoryFilterIcons: Record<string, typeof Boxes> = {
 All: Boxes,
 Maheu: CupSoda,
 'Soft Drinks': CupSoda,
 Water: Droplets,
 'Energy Drinks': Zap,
 Biscuits: Cookie,
 Snacks: Cookie,
 'Fresh Produce': Apple,
 'Meat & Deli': Beef,
 Airtime: Smartphone,
 Other: Ellipsis,
};


async function keepProductImage(uri: string) {
 if (uri.startsWith(Paths.document.uri)) return uri;
 const source = new File(uri);
 const extension = source.name.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'jpg';
 const destination = new File(Paths.document, `product-${Date.now()}-${Math.round(Math.random() * 1_000_000)}.${extension}`);
 await source.copy(destination);
 return destination.uri;
}

function inventoryCategory(product: Product) {
 const name=product.name.toLowerCase();
 const category=product.category.toLowerCase();
 const value=`${name} ${category}`;
 if(/mahe|maheu|mahero|pfuko|shumba|youfresh|fuko|traditional drinks/.test(value))return 'Maheu';
 if(/biscuit|cookie/.test(value))return 'Biscuits';
 if(/mega[\s-]*sna(?:ck|x)|snack|snax|king kurls|king cos|crisps/.test(value))return 'Snacks';
 if(/bottled water|aqua clear|vivo|water/.test(value))return 'Water';
 if(/energy drink|wildcat|sting|dragon|switch/.test(value))return 'Energy Drinks';
 if(/soft drink|flavoured beverage|beverage|coca-cola|coke|pepsi|mirinda|fruiticana|daily fruit|revive/.test(value))return 'Soft Drinks';
 if(/fresh produce|egg|fruit|vegetable/.test(value))return 'Fresh Produce';
 if(/meat|deli|polony/.test(value))return 'Meat & Deli';
 if(/airtime|econet|netone/.test(value))return 'Airtime';
 if(category==='other'||!category)return 'Other';
 return product.category.includes('&')?product.category.split('&')[0].trim():product.category;
}

function productDetails(product: Product) {
 const size=product.name.match(/\b\d+(?:\.\d+)?\s?(?:ml|l|g|kg|mg|cl|pcs?)\b/i)?.[0]??product.unit;
 const flavour=product.name.match(/\(([^)]+)\)/)?.[1]?.trim()??'—';
 const brand=product.name.split(/\s+(?=\d)|\s*\(/)[0]?.trim()||'—';
 return {size,brand,flavour};
}

export function InventoryScreen() {
 const db=useSQLiteContext(); const {session}=useAuth(); const owner=session?.user.id??''; const [items,setItems]=useState<Product[]>([]); const [search,setSearch]=useState(''); const [category,setCategory]=useState('All'); const [loading,setLoading]=useState(true);
 const load=useCallback(async()=>{setLoading(true);try{setItems(await listInventory(db,owner));}catch{Alert.alert('Inventory unavailable','Could not load your products. Please try again.');}finally{setLoading(false);}},[db,owner]);
 useFocusEffect(useCallback(()=>{void load();},[load]));
 const categoryOrder=['Maheu','Soft Drinks','Water','Energy Drinks','Biscuits','Snacks','Fresh Produce','Meat & Deli','Airtime','Other'];
 const customCategories=Array.from(new Set(items.map(inventoryCategory))).filter((item)=>!categoryOrder.includes(item)).sort((a,b)=>a.localeCompare(b));
 const categories=['All',...categoryOrder,...customCategories];
 const query=search.trim().toLowerCase();
 const visible=items.filter((item)=>{
  return (category==='All'||inventoryCategory(item)===category)&&(!query||`${item.name} ${item.sku??''} ${item.category}`.toLowerCase().includes(query));
 });
 return <Page title="Inventory" right={<Pressable accessibilityRole="button" accessibilityLabel="Add product" onPress={()=>router.push('/inventory/add')} style={styles.add}><Plus stroke={colors.surface} size={20}/></Pressable>}>
  <Field label="" accessibilityLabel="Search inventory" icon={<Search stroke={colors.secondary} size={18}/>} value={search} onChangeText={setSearch} placeholder="Search products…" returnKeyType="search" />
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryFilters}>{categories.map((item)=>{const Icon=categoryFilterIcons[item]??Ellipsis;const selected=category===item;return <Pressable key={item} accessibilityRole="button" accessibilityState={{selected}} onPress={()=>setCategory(item)} style={[styles.categoryFilter,selected&&styles.categoryFilterActive]}><Icon size={14} stroke={selected?colors.surface:colors.secondary}/><AppText variant="small" color={selected?'#fff':colors.secondary}>{item}</AppText></Pressable>;})}</ScrollView>
  {visible.length>0?visible.map((item,index)=>{
   const stockState=item.stock_quantity<=0?'out':item.stock_quantity<=item.reorder_level?'low':'in';
   const stockLabel=stockState==='out'?'Out of Stock':stockState==='low'?'Low Stock':'In Stock';
   const stockColor=stockState==='out'?colors.danger:stockState==='low'?colors.warning:colors.success;
   return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${item.name}, ${inventoryCategory(item)}, ${formatMoney(item.price_cents)}, ${item.stock_quantity} ${item.unit}, ${stockLabel}`} onPress={()=>router.push({pathname:'/inventory/[id]',params:{id:item.id}})} style={[styles.productCard,index<visible.length-1&&styles.productCardSpacing]}>
    <View style={styles.productImage}>{imageSource(item)?<Image source={imageSource(item)} resizeMode="contain" style={styles.productImageContent} accessibilityLabel={item.name}/>:<Boxes stroke={colors.deepPurple} size={24}/>}</View>
    <View style={styles.productInfo}>
     <AppText variant="label" numberOfLines={1}>{item.name}</AppText>
     <AppText variant="small" color={colors.secondary} numberOfLines={1}>{inventoryCategory(item)}</AppText>
     <View style={styles.productCardFooter}><AppText variant="small" color={colors.deepPurple}>{formatMoney(item.price_cents)}</AppText><AppText variant="small" color={colors.secondary}>{item.stock_quantity} {item.unit}</AppText></View>
    </View>
    <View style={styles.productCardAside}><View style={[styles.stockBadge,{backgroundColor:stockState==='in'?'#E7F5EF':stockState==='low'?'#FFF3DD':'#FDEBEC'}]}>
     <AppText variant="small" color={stockColor}>{stockLabel}</AppText>
    </View><ChevronRight size={17} stroke={colors.secondary}/></View>
   </Pressable>;
  }):null}
  {!loading&&!items.length?<IllustratedEmptyState image={require('@/assets/images/shop-illustrations/inventory/empty-cart.png')} title="Your inventory is ready" description="Add products from your shelves to start tracking prices and stock." action={<PrimaryButton label="Add your first product" onPress={()=>router.push('/inventory/add')}/>} />:null}
  {!loading&&items.length>0&&!visible.length?<IllustratedEmptyState image={require('@/assets/images/shop-illustrations/inventory/stock-unavailable.png')} title="No matching products" description="Try another search or choose a different category." action={<SecondaryButton label="Clear filters" onPress={()=>{setSearch('');setCategory('All');}}/>} />:null}
  {loading&&!items.length?<Card style={styles.loading}><AppText color={colors.secondary}>Loading your products…</AppText></Card>:null}
 </Page>;
}

export function ProductFormScreen({edit=false}:{edit?:boolean}) {
 const db=useSQLiteContext();const {session}=useAuth();const owner=session?.user.id??'';const params=useLocalSearchParams<{id?:string;step?:string}>();const id=Array.isArray(params.id)?params.id[0]:params.id;
 const [name,setName]=useState('');const [sku,setSku]=useState('');const [category,setCategory]=useState('Other');const [customCategory,setCustomCategory]=useState('');const [customImageUri,setCustomImageUri]=useState<string|null>(null);const [unit,setUnit]=useState('each');const [price,setPrice]=useState('');const [purchaseTotal,setPurchaseTotal]=useState('');const [purchaseQuantity,setPurchaseQuantity]=useState('');const [opening,setOpening]=useState('');const [reorder,setReorder]=useState('0');const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [step,setStep]=useState(params.step==='stock'?2:0);const [countdown,setCountdown]=useState<number|null>(null);const [countdownTarget,setCountdownTarget]=useState<'prices'|'stock'|'save'|null>(null);
 const purchasedQuantity=Number(purchaseQuantity);
 const unitCostCents=purchasedQuantity>0?Math.round(toCents(purchaseTotal)/purchasedQuantity):0;
 useEffect(()=>{let active=true;void ImagePicker.getPendingResultAsync().then((result)=>{if(active&&result&&!('code'in result)&&!result.canceled&&result.assets[0])setCustomImageUri(result.assets[0].uri);}).catch(()=>undefined);return()=>{active=false;};},[]);
 useEffect(()=>{if(edit&&id)void getProduct(db,owner,id).then((p)=>{if(p){setName(p.name);setSku(p.sku??'');setCustomImageUri(p.image_uri??null);const knownCategory=inventoryCategory(p);if(productCategories.some((item)=>item.label===knownCategory))setCategory(knownCategory);else{setCategory('Other');setCustomCategory(p.category);}setUnit(p.unit);setPrice((p.price_cents/100).toFixed(2));setPurchaseTotal(((p.cost_cents??0)/100).toFixed(2));setPurchaseQuantity('1');setReorder(String(p.reorder_level));}});},[db,owner,id,edit]);
 const selectProductPhoto=async(source:'library'|'camera')=>{cancelCountdown();try{if(source==='camera'){const permission=await ImagePicker.requestCameraPermissionsAsync();if(!permission.granted){Alert.alert('Camera permission needed','Allow camera access to take a product photo.');return;}}const result=source==='camera'?await ImagePicker.launchCameraAsync({mediaTypes:['images'],allowsEditing:true,aspect:[1,1],quality:0.8}):await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsEditing:true,aspect:[1,1],quality:0.8});if(!result.canceled&&result.assets[0])setCustomImageUri(result.assets[0].uri);}catch{Alert.alert('Photo unavailable','Could not open the camera or photo library.');}};
 const openPhotoOptions=()=>{cancelCountdown();const hasCatalogueImage=Boolean(productImage(name));Alert.alert('Product photo',hasCatalogueImage?'Use the matching catalogue image or add your own photo.':'No catalogue image matches this product yet. Choose one or take a photo.',[{text:'Choose from phone',onPress:()=>void selectProductPhoto('library')},{text:'Take a photo',onPress:()=>void selectProductPhoto('camera')},...(customImageUri&&hasCatalogueImage?[{text:'Use catalogue image',onPress:()=>setCustomImageUri(null)}]:[]),{text:'Cancel',style:'cancel'}]);};
 // eslint-disable-next-line react-hooks/preserve-manual-memoization -- the countdown effect needs a stable save callback while it performs an async file copy.
 const save=useCallback(async()=>{if(busy)return;setError('');setBusy(true);try{const selectedCategory=productCategories.find((item)=>item.label===category);const imageUri=customImageUri?await keepProductImage(customImageUri):null;const data={name,sku,category:category==='Other'?(customCategory.trim()||'Other'):(selectedCategory?.value??category),unit,priceCents:toCents(price),costCents:unitCostCents,imageUri,reorder:Number(reorder)||0};if(edit&&id)await updateProduct(db,owner,id,data);else await addProduct(db,owner,{...data,opening:Number(opening)||0});Alert.alert(edit?'Product updated':'Product added',edit?'Your product details are saved.':'The product and opening stock are ready.');router.back();}catch(e){setError(e instanceof Error?e.message:'Could not save product details.');}finally{setBusy(false);}},[busy,category,customCategory,customImageUri,db,edit,id,name,opening,owner,price,reorder,sku,unit,unitCostCents]);
 const cancelCountdown=()=>{setCountdownTarget(null);setCountdown(null);};
 const beginCountdown=(target:'prices'|'stock'|'save')=>{setCountdownTarget(target);setCountdown(3);};
 useEffect(()=>{if(countdown===null)return;const timer=setTimeout(()=>{if(countdown<=1){setCountdown(null);setCountdownTarget(null);if(countdownTarget==='prices')setStep(1);else if(countdownTarget==='stock')setStep(2);else if(countdownTarget==='save')void save();}else setCountdown(countdown-1);},1000);return()=>clearTimeout(timer);},[countdown,countdownTarget,save]);
 const advanceToPrices=()=>{setError('');if(!name.trim()){setError('Enter a product name first.');return;}if(category==='Other'&&!customCategory.trim()){setError('Enter a custom category to continue.');return;}beginCountdown('prices');};
 const advanceToStock=()=>{setError('');if(!price.trim()){setError('Enter the selling price to continue.');return;}if(!purchaseTotal.trim()){setError('Enter the total amount paid for this purchase.');return;}if(!purchaseQuantity.trim()){setError('Enter how many items you purchased.');return;}if(!Number.isFinite(purchasedQuantity)||purchasedQuantity<=0){setError('Enter a quantity greater than zero.');return;}beginCountdown('stock');};
 const stepTitles=['Product details','Prices','Stock'];
 return <Page title={edit?'Edit product':'Add product'} subtitle="Add a product in three simple steps." back>
  <View style={styles.stepProgress} accessibilityLabel={`Step ${step+1} of 3: ${stepTitles[step]}`}>
   {[0,1,2].map((item)=><Pressable key={item} accessibilityRole="button" accessibilityState={{disabled:item>=step}} onPress={()=>{if(item<step){cancelCountdown();setStep(item);}}} style={styles.stepSegmentWrap}><View style={[styles.stepSegment,item<=step&&styles.stepSegmentActive]}/><AppText variant="small" color={item===step?colors.deepPurple:colors.secondary}>{stepTitles[item]}</AppText></Pressable>)}
  </View>
  <Card style={styles.stepCard}>
   <View style={styles.stepHeading}><AppText variant="heading">{stepTitles[step]}</AppText><AppText variant="small" color={colors.secondary}>Step {step+1} of 3</AppText></View>
   {countdown!==null?<View style={styles.countdownNotice}><AppText variant="small" color={colors.deepPurple}>{countdownTarget==='save'?`Saving product in ${countdown}…`:`Moving to ${countdownTarget==='prices'?'Prices':'Stock'} in ${countdown}…`}</AppText><Pressable accessibilityRole="button" onPress={cancelCountdown}><AppText variant="label" color={colors.deepPurple}>Stay here</AppText></Pressable></View>:null}
   {step===0?<><AppText color={colors.secondary}>Enter the name, then choose a category to continue.</AppText><Field label="Product name" value={name} onChangeText={(value)=>{cancelCountdown();setName(value);}} placeholder="e.g. Shumba Maheu" autoCapitalize="words"/><Field label="Product code (optional)" value={sku} onChangeText={(value)=>{cancelCountdown();setSku(value);}} placeholder="SKU or barcode"/><View style={styles.photoSection}><AppText variant="label">Product photo</AppText><View style={styles.photoRow}><View style={styles.photoPreview}>{imageSource({name,image_uri:customImageUri})?<Image source={imageSource({name,image_uri:customImageUri})} resizeMode="contain" style={styles.photoPreviewImage} accessibilityLabel={`${name||'Product'} photo`}/>:<Boxes stroke={colors.secondary} size={30}/>}</View><View style={styles.photoDetails}><AppText variant="small" color={colors.secondary}>{customImageUri?'Your product photo':productImage(name)?'Matching catalogue image':'No matching catalogue image'}</AppText><Pressable accessibilityRole="button" onPress={openPhotoOptions} style={styles.photoAction}><ImagePlus size={16} stroke={colors.deepPurple}/><AppText variant="small" color={colors.deepPurple}>{customImageUri||productImage(name)?'Change photo':'Choose or take photo'}</AppText></Pressable>{!customImageUri&&!productImage(name)?<AppText variant="small" color={colors.secondary}>Pick an image from your phone or take a photo.</AppText>:null}</View></View></View><AppText variant="label">Choose a category</AppText><View style={styles.categoryGrid}>{productCategories.map(({label,icon:Icon})=><Pressable key={label} accessibilityRole="button" accessibilityState={{selected:category===label}} onPress={()=>{cancelCountdown();setCategory(label);if(label!=='Other'||customCategory.trim()){if(!name.trim())setError('Enter a product name first.');else{setError('');beginCountdown('prices');}}}} style={[styles.categoryTile,category===label&&styles.categoryTileActive]}><Icon size={17} stroke={category===label?colors.purple:colors.secondary}/><AppText variant="small" color={category===label?colors.deepPurple:colors.text}>{label}</AppText></Pressable>)}</View>{category==='Other'?<Field label="Custom category" value={customCategory} onChangeText={(value)=>{cancelCountdown();setCustomCategory(value);}} placeholder="Enter a category" returnKeyType="done" onEndEditing={advanceToPrices}/>:null}</>:null}
   {step===1?<><AppText color={colors.secondary}>Enter your selling price, then the total you paid and how many items you received. The app works out the cost of each {unit||'item'}.</AppText><Field label={`Selling price per ${unit||'item'}`} value={price} onChangeText={(value)=>{cancelCountdown();setPrice(value);}} placeholder="0.00" keyboardType="decimal-pad" returnKeyType="done" onEndEditing={advanceToStock}/><Field label="Total amount paid" value={purchaseTotal} onChangeText={(value)=>{cancelCountdown();setPurchaseTotal(value);}} placeholder="e.g. 10.00" keyboardType="decimal-pad"/><Field label="Quantity purchased" value={purchaseQuantity} onChangeText={(value)=>{cancelCountdown();setPurchaseQuantity(value);}} placeholder="e.g. 11 cards" keyboardType="decimal-pad" returnKeyType="done" onEndEditing={advanceToStock}/><View style={styles.unitCostSummary}><AppText variant="small" color={colors.secondary}>BUYING COST PER {unit.toUpperCase()}</AppText><AppText variant="label" color={colors.deepPurple}>{formatMoney(unitCostCents)}</AppText><AppText variant="small" color={colors.secondary}>Total paid ÷ quantity purchased. Example: $10 ÷ 11 cards = $0.91 per card.</AppText></View></>:null}
   {step===2?<><AppText color={colors.secondary}>{edit?'Set the unit and low-stock reminder, then finish.':'Enter the unit you sell in and what is on your shelves now. Finish the reminder field to save.'}</AppText><View style={styles.stockField}><Field label="Unit" value={unit} onChangeText={(value)=>{cancelCountdown();setUnit(value);}} placeholder="each, card, bottle, kg" autoCapitalize="none"/><AppText variant="small" color={colors.secondary}>How you count and sell this product. Stock and sales will use this unit.</AppText></View>{!edit?<View style={styles.stockField}><Field label="Opening stock (optional)" value={opening} onChangeText={(value)=>{cancelCountdown();setOpening(value);}} placeholder="0" keyboardType="decimal-pad"/><AppText variant="small" color={colors.secondary}>How many are available on the shelf right now. Use the quantity purchased if none have been sold yet.</AppText></View>:null}<View style={styles.stockField}><Field label="Low stock reminder at" value={reorder} onChangeText={(value)=>{cancelCountdown();setReorder(value);}} placeholder="0" keyboardType="decimal-pad" returnKeyType="done" onEndEditing={()=>beginCountdown('save')}/><AppText variant="small" color={colors.secondary}>Show a low-stock warning when available quantity reaches this number. Use 0 to warn only when it is out of stock.</AppText></View><View style={styles.productSummary}><AppText variant="small" color={colors.secondary}>PRODUCT</AppText><AppText variant="label">{name||'New product'}</AppText><AppText variant="small" color={colors.secondary}>{category==='Other'?(customCategory||'Other'):category} · {formatMoney(toCents(price))} selling price · {formatMoney(unitCostCents)} buying cost per {unit}</AppText></View></>:null}
   {error?<AppText variant="small" color={colors.danger}>{error}</AppText>:null}
   <View style={styles.stepBack}>{step===0?<SecondaryButton label="Back to inventory" onPress={()=>{cancelCountdown();router.back();}} style={{flex:1}}/>:<SecondaryButton label="Back" onPress={()=>{cancelCountdown();setStep((current)=>current-1);}} style={{flex:1}}/>}</View>
  </Card>
 </Page>;
}

export function ProductDetailScreen(){
 const db=useSQLiteContext();const {session}=useAuth();const params=useLocalSearchParams<{id:string}>();const id=Array.isArray(params.id)?params.id[0]:params.id;
 const [product,setProduct]=useState<Product|null>(null);const [movements,setMovements]=useState<StockMovement[]>([]);const [locations,setLocations]=useState<(InventoryLocation&{quantity:number})[]>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState(false);
 useFocusEffect(useCallback(()=>{let active=true;setLoading(true);setError(false);void Promise.all([getProduct(db,session?.user.id??'',id),listMovements(db,session?.user.id??'',id),listProductBalances(db,session?.user.id??'',id)]).then(([p,m,b])=>{if(active){setProduct(p);setMovements(m);setLocations(b);}}).catch(()=>{if(active)setError(true);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[db,session?.user.id,id]));
 if(loading)return <Page title="Product details" back><Card style={styles.loading}><AppText color={colors.secondary}>Loading product…</AppText></Card></Page>;
 if(error||!product)return <Page title="Product details" back><IllustratedEmptyState image={require('@/assets/images/shop-illustrations/inventory/stock-unavailable.png')} title={error?'Product unavailable':'Product not found'} description={error?'We could not load this product. Go back to Inventory and try again.':'This product may have been removed from your inventory.'} action={<SecondaryButton label="Back to inventory" onPress={()=>router.replace('/(tabs)/inventory')}/>} /></Page>;
 const detail=productDetails(product);const profit=(product.price_cents??0)-(product.cost_cents??0);const stockState=product.stock_quantity<=0?'out':product.stock_quantity<=product.reorder_level?'low':'in';const stockLabel=stockState==='out'?'Out of Stock':stockState==='low'?'Low Stock':'In Stock';const stockColor=stockState==='out'?colors.danger:stockState==='low'?colors.warning:colors.success;
 const editProduct=(step?:string)=>router.push({pathname:'/inventory/add',params:{id,edit:'1',...(step?{step}:{})}});
 return <Page title="Product Details" back>
  <View style={styles.detailHero}>
   <View style={styles.detailPhotoFrame}>{imageSource(product)?<Image source={imageSource(product)} resizeMode="contain" style={styles.detailPhotoImage} accessibilityLabel={`${product.name} photo`}/>:<Package stroke={colors.deepPurple} size={54}/>}</View>
   <AppText variant="heading" style={styles.detailProductName}>{product.name}</AppText>
   <View style={styles.detailMetaRow}><View style={styles.detailCategory}><AppText variant="small" color={colors.deepPurple}>{inventoryCategory(product)}</AppText></View><View style={[styles.stockBadge,{backgroundColor:stockState==='in'?'#E7F5EF':stockState==='low'?'#FFF3DD':'#FDEBEC'}]}><AppText variant="small" color={stockColor}>{stockLabel}</AppText></View></View>
  </View>
  <View style={styles.detailFacts}>
   {[[ 'SIZE',detail.size ],[ 'BRAND',detail.brand ],[ 'FLAVOUR',detail.flavour ]].map(([label,value])=><Card key={label} style={styles.detailFact}><AppText variant="small" color={colors.secondary}>{label}</AppText><AppText variant="label" numberOfLines={1}>{value}</AppText></Card>)}
  </View>
  <View style={styles.detailPrices}>
   <Card style={styles.detailPrice}><View style={styles.detailPriceIcon}><Package size={15} stroke={colors.deepPurple}/></View><AppText variant="small" color={colors.secondary}>BUYING PRICE</AppText><AppText variant="label">{formatMoney(product.cost_cents??0)}</AppText></Card>
   <Card style={styles.detailPrice}><View style={styles.detailPriceIcon}><Tag size={15} stroke={colors.deepPurple}/></View><AppText variant="small" color={colors.secondary}>SELLING PRICE</AppText><AppText variant="label">{formatMoney(product.price_cents)}</AppText></Card>
   <Card style={styles.detailPrice}><View style={styles.detailPriceIcon}><ArrowDownToLine size={15} stroke={profit>=0?colors.success:colors.danger}/></View><AppText variant="small" color={colors.secondary}>PROFIT</AppText><AppText variant="label" color={profit>=0?colors.success:colors.danger}>{formatMoney(profit)}</AppText></Card>
  </View>
  <Card style={styles.detailStockCard}>
   <View style={styles.detailSectionHeader}><View style={styles.detailSectionTitle}><Package size={17} stroke={colors.deepPurple}/><AppText variant="label">Stock quantity</AppText></View><AppText variant="label" color={colors.deepPurple}>{product.stock_quantity} {product.unit}</AppText></View>
   {locations.map((location)=><View key={location.id} style={styles.locationBalance}><AppText variant="small" color={colors.secondary}>{location.name}</AppText><AppText variant="label">{location.quantity} {product.unit}</AppText></View>)}
   <View style={styles.detailStockActions}>
    <Pressable accessibilityRole="button" onPress={()=>router.push({pathname:'/inventory/receive-stock',params:{productId:id}})} style={styles.detailStockAction}>
     <ArrowDownToLine size={16} stroke={colors.deepPurple}/><AppText variant="small" color={colors.deepPurple} numberOfLines={1}>Receive stock</AppText>
    </Pressable>
    <Pressable accessibilityRole="button" onPress={()=>router.push({pathname:'/inventory/adjust-stock',params:{productId:id}})} style={styles.detailStockAction}>
     <Pencil size={15} stroke={colors.deepPurple}/><AppText variant="small" color={colors.deepPurple} numberOfLines={1}>Adjust count</AppText>
    </Pressable>
   </View>
  </Card>
  <Pressable accessibilityRole="button" onPress={()=>editProduct()} style={({pressed})=>[styles.editProductButton,pressed&&styles.editProductButtonPressed]}>
   <Pencil size={17} stroke="#FFFFFF"/><AppText variant="label" color="#FFFFFF">Edit Product</AppText>
  </Pressable>
  <Pressable accessibilityRole="button" onPress={()=>editProduct('stock')} style={styles.alertButton}><Bell size={17} stroke={colors.danger}/><AppText variant="label" color={colors.danger}>Set Low Stock Alert</AppText></Pressable>
  <View style={styles.alertHint}><AppText variant="small" color={colors.secondary}>Alert when stock reaches {product.reorder_level} {product.unit}.</AppText></View>
  <SectionTitle action="See all" onAction={()=>router.push({pathname:'/inventory/history',params:{productId:id}})}>Recent stock activity</SectionTitle>{movements.slice(0,8).map((m)=><MovementCard key={m.id} item={m}/>)}</Page>;
}

export function StockActionScreen({mode}:{mode:'receive'|'adjust'|'transfer'}){
 const db=useSQLiteContext();const {session}=useAuth();const owner=session?.user.id??'';const params=useLocalSearchParams<{productId?:string}>();const productParam=Array.isArray(params.productId)?params.productId[0]:params.productId;
 const [products,setProducts]=useState<Product[]>([]);const [locations,setLocations]=useState<InventoryLocation[]>([]);const [productId,setProductId]=useState<string>(productParam??'');const [quantity,setQuantity]=useState('');const [cost,setCost]=useState('');const [note,setNote]=useState('');const [fromId,setFromId]=useState('');const [toId,setToId]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const [loadingData,setLoadingData]=useState(true);const [loadError,setLoadError]=useState(false);
 useEffect(()=>{let active=true;void Promise.all([listInventory(db,owner),listLocations(db,owner)]).then(([p,l])=>{if(!active)return;setProducts(p);setLocations(l);setProductId((current)=>current||p[0]?.id||'');if(l[0])setFromId(l[0].id);if(mode==='transfer')setToId(l[1]?.id??'');else setToId(l[0]?.id??'');}).catch(()=>{if(active)setLoadError(true);}).finally(()=>{if(active)setLoadingData(false);});return()=>{active=false;};},[db,owner,mode]);
 const save=async()=>{
  setError('');
  if(mode==='receive'&&!cost.trim()){setError('Enter the total amount paid for this delivery.');return;}
  if(mode==='adjust'&&!note.trim()){setError('Enter a reason for this stock adjustment.');return;}
  setBusy(true);
  try{
   let adjustmentResult:string|undefined;
   if(mode==='receive'){
    const receivedQuantity=Number(quantity);const unitCostCents=receivedQuantity>0?Math.round(toCents(cost)/receivedQuantity):0;
    await receiveStock(db,owner,productId,receivedQuantity,unitCostCents,note,toId||undefined);
   }else if(mode==='adjust'){
    const product=products.find((item)=>item.id===productId);const location=locations.find((item)=>item.id===toId);const previous=await getLocationBalance(db,owner,productId,toId);const counted=Number(quantity);const difference=counted-previous;
    await adjustStock(db,owner,productId,counted,note,toId||undefined);
    adjustmentResult=difference===0?`${product?.name??'Product'} at ${location?.name??'this location'} remains at ${counted} ${product?.unit??'units'}.`:`${product?.name??'Product'} at ${location?.name??'this location'} changed from ${previous} to ${counted} ${product?.unit??'units'}. Shop stock ${difference>0?'increased':'decreased'} by ${Math.abs(difference)}.`;
   }else await transferStock(db,owner,productId,Number(quantity),fromId,toId,note);
   Alert.alert(mode==='receive'?'Stock received':mode==='adjust'?'Stock count updated':'Stock moved',adjustmentResult??'Inventory and movement history have been updated.');router.back();
  }catch(e){setError(e instanceof Error?e.message:'Could not update stock.');}finally{setBusy(false);}
 };
 const title=mode==='receive'?'Receive stock':mode==='adjust'?'Adjust stock count':'Transfer stock';
 if(loadingData)return <Page title={title} subtitle="Loading your inventory…" back><Card style={styles.loading}><AppText color={colors.secondary}>Loading products and locations…</AppText></Card></Page>;
 if(loadError)return <Page title={title} subtitle="We couldn’t load the information for this stock action." back><IllustratedEmptyState image={require('@/assets/images/shop-illustrations/inventory/stock-unavailable.png')} title="Inventory unavailable" description="Go back to Inventory and try again." action={<SecondaryButton label="Back to inventory" onPress={()=>router.replace('/(tabs)/inventory')}/>} /></Page>;
 if(!products.length)return <Page title={title} subtitle="Add a product before recording stock activity." back><IllustratedEmptyState image={require('@/assets/images/shop-illustrations/inventory/empty-cart.png')} title="No products yet" description="Your inventory needs a product before you can receive, adjust, or transfer stock." action={<PrimaryButton label="Add a product" onPress={()=>router.push('/inventory/add')}/>} /></Page>;
 return <Page title={title} subtitle={mode==='receive'?'Record a delivery and the cost you paid.':mode==='adjust'?'Enter the quantity you physically counted.':'Move stock between shop locations.'} back><Card style={{gap:13}}><AppText variant="label">Product</AppText><View style={styles.selectWrap}>{products.map((p)=><Pressable key={p.id} accessibilityRole="button" accessibilityState={{selected:productId===p.id}} onPress={()=>setProductId(p.id)} style={[styles.selectOption,productId===p.id&&styles.selected]}><AppText variant="label" color={productId===p.id?colors.deepPurple:colors.text}>{p.name} · {p.stock_quantity} {p.unit}</AppText></Pressable>)}</View>{mode==='transfer'?<><AppText variant="label">From location</AppText><View style={styles.selectWrap}>{locations.map((l)=><Pressable key={l.id} accessibilityRole="button" accessibilityState={{selected:fromId===l.id}} onPress={()=>setFromId(l.id)} style={[styles.selectOption,fromId===l.id&&styles.selected]}><AppText variant="label">{l.name}</AppText></Pressable>)}</View><AppText variant="label">To location</AppText><View style={styles.selectWrap}>{locations.map((l)=><Pressable key={l.id} accessibilityRole="button" accessibilityState={{selected:toId===l.id}} onPress={()=>setToId(l.id)} style={[styles.selectOption,toId===l.id&&styles.selected]}><AppText variant="label">{l.name}</AppText></Pressable>)}</View></>:<><AppText variant="label">Location</AppText><View style={styles.selectWrap}>{locations.map((l)=><Pressable key={l.id} accessibilityRole="button" accessibilityState={{selected:toId===l.id}} onPress={()=>setToId(l.id)} style={[styles.selectOption,toId===l.id&&styles.selected]}><AppText variant="label">{l.name}</AppText></Pressable>)}</View></>}<Field label={mode==='adjust'?'Counted quantity':mode==='transfer'?'Quantity to move':'Quantity received'} value={quantity} onChangeText={setQuantity} placeholder="0" keyboardType="decimal-pad"/>{mode==='receive'?<><Field label="Total paid for this delivery" value={cost} onChangeText={setCost} placeholder="e.g. 10.00" keyboardType="decimal-pad"/>{Number(quantity)>0&&cost.trim()?<View style={styles.unitCostSummary}><AppText variant="small" color={colors.secondary}>BUYING COST PER {products.find((item)=>item.id===productId)?.unit.toUpperCase()??'ITEM'}</AppText><AppText variant="label" color={colors.deepPurple}>{formatMoney(Math.round(toCents(cost)/Number(quantity)))}</AppText><AppText variant="small" color={colors.secondary}>Total paid ÷ quantity received.</AppText></View>:null}</>:null}<Field label={mode==='adjust'?'Reason for adjustment':'Note (optional)'} value={note} onChangeText={setNote} placeholder={mode==='adjust'?'e.g. Damaged during storage':'Add a note'} />{error?<AppText variant="small" color={colors.danger}>{error}</AppText>:null}</Card><Pressable accessibilityRole="button" accessibilityState={{disabled:busy}} disabled={busy} onPress={()=>void save()} style={styles.stockSubmit}><View style={[styles.stockSubmitSurface,busy&&styles.stockSubmitBusy]}><AppText variant="label" color="#FFFFFF">{busy?'Saving…':mode==='adjust'?'Save stock count':mode==='receive'?'Record delivery':'Complete transfer'}</AppText></View></Pressable>{mode==='transfer'&&locations.length<2?<Card style={{gap:9}}><AppText variant="heading">Add another location</AppText><AppText color={colors.secondary}>A transfer needs at least two locations. Add one in Settings → Locations.</AppText><SecondaryButton label="Manage locations" onPress={()=>router.push('/settings/locations')}/></Card>:null}</Page>;
}
export function StockHistoryScreen(){const db=useSQLiteContext();const {session}=useAuth();const params=useLocalSearchParams<{productId?:string}>();const productId=Array.isArray(params.productId)?params.productId[0]:params.productId;const [items,setItems]=useState<StockMovement[]>([]);const [loading,setLoading]=useState(true);useFocusEffect(useCallback(()=>{setLoading(true);void listMovements(db,session?.user.id??'',productId).then(setItems).finally(()=>setLoading(false));},[db,session?.user.id,productId]));return <Page title="Stock history" subtitle="Receipts, counts, transfers, and sales." back>{items.map((item)=><MovementCard key={item.id} item={item}/>)}{!loading&&!items.length?<IllustratedEmptyState image={require('@/assets/images/shop-illustrations/inventory/stock-unavailable.png')} title="No stock activity yet" description="Receipts, stock counts, transfers, and sales will appear here as you use your inventory."/>:null}{loading&&!items.length?<Card style={styles.loading}><AppText color={colors.secondary}>Loading stock history…</AppText></Card>:null}</Page>}
function MovementCard({item}:{item:StockMovement}){const positive=item.movement_type==='RECEIVE'||item.movement_type==='OPENING';const color=positive?colors.success:item.movement_type==='ADJUST'?colors.warning:colors.info;return <Card style={styles.movement}><View style={styles.movementIcon}><ArrowDownToLine stroke={color} size={17}/></View><View style={{flex:1,gap:3}}><AppText variant="label">{item.product_name} · {item.movement_type.toLowerCase()}</AppText><AppText variant="small" color={colors.secondary}>{item.note||[item.from_location,item.to_location].filter(Boolean).join(' → ')||formatDateTime(item.created_at)}</AppText></View><AppText variant="label" color={color}>{item.movement_type==='SALE'||(item.movement_type==='ADJUST'&&item.quantity<0)?'−':item.movement_type==='RECEIVE'||item.movement_type==='OPENING'||(item.movement_type==='ADJUST'&&item.quantity>0)?'+':''}{Math.abs(item.quantity)}</AppText></Card>}
const styles=StyleSheet.create({add:{width:42,height:42,borderRadius:radius.button,backgroundColor:colors.purple,alignItems:'center',justifyContent:'center'},metrics:{flexDirection:'row',gap:10},metric:{flex:1,gap:6},actions:{flexDirection:'row',gap:8},stepProgress:{flexDirection:'row',gap:8},stepSegmentWrap:{flex:1,gap:7},stepSegment:{height:5,borderRadius:4,backgroundColor:colors.border},stepSegmentActive:{backgroundColor:colors.purple},stepCard:{gap:14},stepHeading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},countdownNotice:{minHeight:42,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10,paddingHorizontal:12,borderRadius:radius.input,backgroundColor:colors.lavenderTint},stepBack:{marginTop:2},productSummary:{gap:5,padding:13,borderRadius:radius.card,backgroundColor:colors.lavenderTint},unitCostSummary:{gap:5,padding:13,borderRadius:radius.card,backgroundColor:colors.lavenderTint},stockField:{gap:5},photoSection:{gap:8},photoRow:{flexDirection:'row',alignItems:'center',gap:12},photoPreview:{width:78,height:78,alignItems:'center',justifyContent:'center',overflow:'hidden',borderRadius:radius.input,borderWidth:1,borderColor:colors.border,backgroundColor:'#F7F7FB'},photoPreviewImage:{width:'100%',height:'100%'},photoDetails:{flex:1,gap:8},photoAction:{minHeight:36,alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:7,paddingHorizontal:10,borderRadius:radius.button,backgroundColor:colors.lavenderTint},detailHero:{alignItems:'center',gap:10,paddingTop:5,paddingBottom:4},detailPhotoFrame:{width:'100%',height:172,alignItems:'center',justifyContent:'center',borderRadius:radius.card,borderWidth:1,borderColor:colors.border,backgroundColor:colors.surface},detailPhotoImage:{width:'100%',height:'100%'},detailProductName:{textAlign:'center'},detailMetaRow:{width:'100%',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},detailCategory:{paddingHorizontal:10,paddingVertical:5,borderRadius:12,backgroundColor:colors.lavenderTint},detailFacts:{flexDirection:'row',gap:8},detailFact:{flex:1,minWidth:0,minHeight:66,alignItems:'center',justifyContent:'center',gap:6,paddingHorizontal:7,paddingVertical:11,backgroundColor:colors.surface},detailPrices:{flexDirection:'row',gap:7},detailPrice:{flex:1,minWidth:0,minHeight:106,alignItems:'flex-start',justifyContent:'space-between',gap:5,padding:11,backgroundColor:colors.surface},detailPriceIcon:{width:27,height:27,alignItems:'center',justifyContent:'center',borderRadius:9,backgroundColor:colors.lavenderTint},detailStockCard:{gap:11,padding:16,backgroundColor:colors.surface},detailSectionHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},detailSectionTitle:{flexDirection:'row',alignItems:'center',gap:7},locationBalance:{minHeight:34,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:8,borderTopWidth:StyleSheet.hairlineWidth,borderColor:colors.border},detailStockActions:{flexDirection:'row',gap:9,marginTop:5},detailStockAction:{flex:1,minWidth:0,minHeight:44,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,paddingHorizontal:7,borderWidth:1,borderColor:'#DCD5F5',borderRadius:radius.button,backgroundColor:colors.lavenderTint},editProductButton:{width:'100%',minHeight:54,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:9,paddingHorizontal:18,borderRadius:radius.button,backgroundColor:'#5B43D6',shadowColor:colors.deepPurple,shadowOffset:{width:0,height:3},shadowOpacity:0.18,shadowRadius:7,elevation:3},editProductButtonPressed:{opacity:0.86},alertButton:{minHeight:48,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:9,paddingHorizontal:14,borderWidth:1,borderColor:'#F1C7CC',borderRadius:radius.button,backgroundColor:'#FFF6F6'},alertHint:{alignItems:'center',marginTop:-8},categoryFilters:{gap:7,paddingVertical:1},categoryFilter:{minHeight:36,flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:12,justifyContent:'center',borderRadius:18,backgroundColor:'#F1F2F8'},categoryFilterActive:{backgroundColor:colors.purple},categoryGrid:{flexDirection:'row',flexWrap:'wrap',gap:8},categoryTile:{width:'48%',minHeight:46,flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:10,borderWidth:1,borderColor:colors.border,borderRadius:radius.input,backgroundColor:colors.surface},categoryTileActive:{backgroundColor:colors.lavenderTint,borderColor:colors.purple},productCard:{minHeight:88,flexDirection:'row',alignItems:'center',gap:11,padding:11,borderWidth:1,borderColor:colors.border,borderRadius:radius.card,backgroundColor:colors.surface},productCardSpacing:{marginBottom:9},productImage:{width:48,height:60,alignItems:'center',justifyContent:'center',overflow:'hidden',borderRadius:12,backgroundColor:'#F7F7FC'},productImageContent:{width:42,height:54},productInfo:{flex:1,gap:3,minWidth:0},productCardFooter:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,marginTop:2},productCardAside:{alignItems:'flex-end',justifyContent:'space-between',alignSelf:'stretch',paddingVertical:2},stockBadge:{flexShrink:0,paddingHorizontal:8,paddingVertical:5,borderRadius:10},loading:{alignItems:'center',padding:20},empty:{alignItems:'center',gap:10,padding:20},stockHero:{backgroundColor:colors.deepPurple,borderColor:colors.deepPurple,gap:7},movement:{flexDirection:'row',alignItems:'center',gap:10,padding:12},movementIcon:{width:36,height:36,borderRadius:12,backgroundColor:colors.lavenderTint,alignItems:'center',justifyContent:'center'},selectWrap:{gap:7},stockSubmit:{width:'100%',minHeight:58,overflow:'hidden',borderRadius:radius.button},stockSubmitSurface:{width:'100%',minHeight:58,alignItems:'center',justifyContent:'center',paddingHorizontal:18,borderRadius:radius.button,backgroundColor:'#38239B',shadowColor:colors.deepPurple,shadowOffset:{width:0,height:3},shadowOpacity:0.2,shadowRadius:7,elevation:4},stockSubmitPressed:{opacity:0.86},stockSubmitBusy:{opacity:0.7},selectOption:{minHeight:42,justifyContent:'center',paddingHorizontal:11,borderWidth:1,borderColor:colors.border,borderRadius:12,backgroundColor:'#fff'},selected:{borderColor:colors.purple,backgroundColor:colors.lavenderTint}});
