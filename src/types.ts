export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  storeId?: string; // the slug of their store
  role: 'owner' | 'admin';
  status: 'active' | 'blocked';
  plan: 'free' | 'pro';
  createdAt: string;
}

export interface StoreConfig {
  id: string; // matches storeId slug or owner's uid/slug
  ownerId: string;
  slug: string;
  name: string;
  description: string;
  address: string;
  workingHours: string;
  whatsapp: string;
  instagram: string;
  logoUrl: string;
  coverUrl: string;
  createdAt: string;
}

export interface Product {
  id: string;
  storeId: string;
  ownerId: string;
  name: string;
  category: string;
  description: string;
  price: number;
  productionTime: number; // in minutes
  imageUrl: string;
  active: boolean;
  recipe?: RecipeItem[]; // Recipe list linking to inventory ingredients
  createdAt: string;
}

export interface RecipeItem {
  ingredientId: string; // references InventoryItem.id
  name: string; // ingredient name for caching/quick access
  quantity: number; // exact amount required
  unit: string; // e.g. g, kg, un, l, ml
}

export interface OrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  notes?: string;
}

export interface Order {
  id: string;
  storeId: string;
  ownerId: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  deliveryType: 'pickup' | 'delivery';
  deliveryDateTime: string;
  notes: string;
  items: OrderItem[];
  total: number;
  status: 'pending' | 'received' | 'confirmed' | 'preparing' | 'decorating' | 'ready' | 'dispatched' | 'delivered' | 'cancelled';
  createdAt: string;
  updatedAt: string;
}

export interface InventoryItem {
  id: string;
  storeId: string;
  ownerId: string;
  name: string;
  category?: string; // category of ingredient (e.g., Laticínios, Secos, Embalagens)
  quantity: number;
  unit: string; // e.g., kg, g, un, l, ml
  minStock: number;
  notes?: string; // observations / info
  createdAt: string;
}

export interface InventoryLog {
  id: string;
  storeId: string;
  ownerId: string;
  ingredientId: string;
  ingredientName: string;
  quantityChange: number; // positive or negative
  type: 'deduction' | 'addition' | 'adjustment';
  referenceId?: string; // e.g., order ID
  referenceName?: string; // e.g., product name or adjustment description
  userEmail?: string; // user who made the change
  createdAt: string;
}

export interface ShoppingListItem {
  id: string;
  storeId: string;
  ownerId: string;
  ingredientId?: string;
  name: string;
  quantity: number;
  unit: string;
  checked: boolean;
  createdAt: string;
}

export interface Customer {
  id: string;
  storeId: string;
  ownerId: string;
  name: string;
  phone: string;
  address?: string;
  ordersCount: number;
  totalSpent: number;
  lastPurchaseDate?: string;
  favoriteProducts?: string[];
  createdAt: string;
}
