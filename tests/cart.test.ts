import { useCart } from '@/stores/cart';
import type { Product } from '@/db/schema';

const product: Product = {
  id: 'product-1',
  name: 'Mauya Ginger',
  sku: null,
  category: 'Drinks',
  unit: 'each',
  price_cents: 50,
  image_uri: 'file:///shop/product-photo.jpg',
  stock_quantity: 2,
  reorder_level: 1,
};

beforeEach(() => {
  useCart.getState().clear();
});

test('cart keeps the product photo for the order item preview', () => {
  useCart.getState().addProduct(product);

  expect(useCart.getState().lines[0]?.imageUri).toBe(product.image_uri);
});
