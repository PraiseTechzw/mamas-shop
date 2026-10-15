import { create } from 'zustand';
import type { PaymentMethod, Product } from '@/db/schema';

type CartLine = { productId: string; name: string; unit: string; priceCents: number; quantity: number; stockQuantity: number };
type CartState = {
  lines: CartLine[];
  creditMode: boolean;
  customerId: string | null;
  addProduct: (product: Product) => void;
  changeQuantity: (productId: string, delta: number) => void;
  removeProduct: (productId: string) => void;
  setCreditCustomer: (customerId: string | null) => void;
  setCreditMode: (enabled: boolean, customerId?: string | null) => void;
  clear: () => void;
};

export const useCart = create<CartState>((set) => ({
  lines: [], creditMode: false, customerId: null,
  addProduct: (product) => set((state) => {
    const current = state.lines.find((line) => line.productId === product.id);
    if (current) return { lines: state.lines.map((line) => line.productId === product.id ? { ...line, quantity: Math.min(line.quantity + 1, line.stockQuantity) } : line) };
    return { lines: [...state.lines, { productId: product.id, name: product.name, unit: product.unit, priceCents: product.price_cents, quantity: 1, stockQuantity: product.stock_quantity }] };
  }),
  changeQuantity: (productId, delta) => set((state) => ({ lines: state.lines.map((line) => line.productId === productId ? { ...line, quantity: Math.min(line.stockQuantity, Math.max(0, line.quantity + delta)) } : line).filter((line) => line.quantity > 0) })),
  removeProduct: (productId) => set((state) => ({ lines: state.lines.filter((line) => line.productId !== productId) })),
  setCreditCustomer: (customerId) => set({ customerId }),
  setCreditMode: (enabled, customerId = null) => set({ creditMode: enabled, customerId: enabled ? customerId : null }),
  clear: () => set({ lines: [], creditMode: false, customerId: null }),
}));

export type { CartLine };
