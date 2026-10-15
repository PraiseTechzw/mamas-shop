export type PaymentMethod = 'CASH' | 'ECOCASH' | 'CARD' | 'OTHER';

export type Product = {
  id: string;
  name: string;
  sku: string | null;
  category: string;
  unit: string;
  price_cents: number;
  stock_quantity: number;
  reorder_level: number;
};

export type Customer = {
  id: string;
  name: string;
  phone: string | null;
  created_at: string;
  balance_cents: number;
};

export type SaleSummary = {
  id: string;
  receipt_number: string;
  customer_id: string | null;
  customer_name: string | null;
  total_cents: number;
  paid_cents: number;
  balance_cents: number;
  status: 'PAID' | 'PARTIAL' | 'CREDIT';
  created_at: string;
  sync_state: string;
};

export type AccountEntry = {
  id: string;
  entry_type: 'SALE_CHARGE' | 'PAYMENT';
  amount_cents: number;
  note: string | null;
  created_at: string;
  receipt_number: string | null;
};
