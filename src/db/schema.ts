export type PaymentMethod = 'CASH' | 'ECOCASH' | 'CARD' | 'OTHER';
export type Product = { id: string; name: string; sku: string | null; category: string; unit: string; price_cents: number; cost_cents?: number; image_uri?: string | null; stock_quantity: number; reorder_level: number };
export type Customer = { id: string; name: string; phone: string | null; created_at: string; balance_cents: number };
export type SaleSummary = { id: string; receipt_number: string; customer_id: string | null; customer_name: string | null; total_cents: number; paid_cents: number; balance_cents: number; status: 'PAID' | 'PARTIAL' | 'CREDIT'; created_at: string; sync_state: string };
export type AccountEntry = { id: string; entry_type: 'SALE_CHARGE' | 'PAYMENT'; amount_cents: number; note: string | null; created_at: string; receipt_number: string | null };
export type StockMovement = { id: string; product_id: string; product_name: string; movement_type: 'OPENING' | 'RECEIVE' | 'ADJUST' | 'TRANSFER' | 'SALE'; quantity: number; from_location: string | null; to_location: string | null; unit_cost_cents: number; note: string | null; created_at: string };
export type InventoryLocation = { id: string; name: string; is_primary: number };
export type Expense = { id: string; title: string; category: string; amount_cents: number; payment_method: PaymentMethod; note: string | null; spent_at: string; created_at: string };
