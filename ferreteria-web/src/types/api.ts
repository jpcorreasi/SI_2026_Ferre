// Tipos de la API NestJS (contrato DRF preservado).

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export type Role = 'ADMIN' | 'EMPLEADO';
export type DocumentType = 'CC' | 'NIT' | 'CE';

export interface LoginResponse {
  access: string;
  refresh: string;
  user: { id: number; username: string; role: Role; full_name: string };
}

// --- products ---
export interface Product {
  id: number;
  code: string;
  name: string;
  description: string;
  category: number;
  category_name: string | null;
  sale_price: string;
  cost_price?: string; // solo ADMIN
  stock: number;
  min_stock: number;
  supplier: number | null;
  supplier_name: string | null;
  is_active: boolean;
  is_low_stock: boolean;
  created_by?: number;
  created_at?: string;
  updated_at?: string;
}

export interface Category {
  id: number;
  name: string;
  description: string;
}

// --- sales ---
export interface SaleItem {
  id: number;
  product: number;
  product_name: string | null;
  quantity: number;
  unit_price: string;
  subtotal: string;
}

export interface Sale {
  id: number;
  customer: number | null;
  customer_name: string;
  customer_email: string;
  payment_method: number;
  payment_method_name: string | null;
  employee: number;
  total: string;
  status: 'COMPLETED' | 'CANCELLED';
  is_anonymous: boolean;
  sale_date: string;
  items: SaleItem[];
  invoice_id: number | null;
  sent_by_email: boolean;
  email_sent_to: string;
  created_at: string;
  updated_at: string;
}

export interface PaymentMethod {
  id: number;
  name: string;
}

// --- customers ---
export interface Customer {
  id: number;
  full_name: string;
  document_type: DocumentType;
  document_number: string;
  email: string;
  phone: string;
  address: string;
  is_active: boolean;
  created_by?: number;
  created_at?: string;
  updated_at?: string;
}

// --- reports ---
export interface SalesSummary {
  total_revenue: number;
  sale_count: number;
  average_ticket: number;
  filters: { start: string | null; end: string | null };
}

export interface TopProduct {
  product__id: number;
  product__code: string | null;
  product__name: string | null;
  total_quantity: number;
  total_revenue: number;
}

export interface LowStockRow {
  id: number;
  code: string;
  name: string;
  stock: number;
  min_stock: number;
  category: string | null;
  supplier: string | null;
}

export interface FinancialBalance {
  income: number;
  expense: number;
  balance: number;
  filters: { month: string | null; year: string | null };
}
