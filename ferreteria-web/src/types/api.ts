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

// --- services ---
export interface ServiceType {
  id: number;
  name: string;
  description: string;
  default_price: string | null;
  created_at: string;
}

export interface Service {
  id: number;
  service_type: number;
  service_type_name: string | null;
  description: string;
  price: string;
  customer: number | null;
  customer_name: string | null;
  performed_by: number;
  performed_by_name: string | null;
  service_date: string;
  notes: string;
  registered_by: number;
  registered_by_name: string | null;
  created_at: string;
  updated_at: string;
}

// --- suppliers ---
export interface Supplier {
  id: number;
  business_name: string;
  nit: string;
  contact_name: string;
  phone: string;
  email: string;
  address: string;
  is_active: boolean;
  created_by?: number;
  created_at?: string;
  updated_at?: string;
}

// --- employees ---
export interface Employee {
  id: number;
  user: number;
  username_display?: string | null;
  full_name: string;
  document_type?: DocumentType;
  document_number?: string;
  position?: string;
  hire_date?: string;
  base_salary?: string;
  phone?: string;
  is_active?: boolean;
}

export interface PayrollItem {
  id: number;
  employee: number;
  base_salary: string;
  health_deduction: string;
  pension_deduction: string;
  overtime: string;
  net_salary: string;
}

export interface Payroll {
  id: number;
  period_start: string;
  period_end: string;
  status: 'DRAFT' | 'APPROVED' | 'PAID';
  total_amount: string;
  generated_by: number;
  items: PayrollItem[];
  created_at: string;
}

// --- reports ---
export interface SalesByPaymentRow {
  payment_method_id: number | null;
  payment_method_name: string;
  sale_count: number;
  total: number;
  percentage: number;
}

export interface SalesByPayment {
  period: { start: string; end: string };
  grand_total: number;
  total_sales: number;
  rows: SalesByPaymentRow[];
}

// --- finances ---
export type TransactionType = 'INCOME' | 'EXPENSE';
export type ReferenceType =
  | 'SALE' | 'SUPPLIER_INVOICE' | 'PAYROLL' | 'CREDIT_NOTE'
  | 'WITHDRAWAL' | 'EXPENSE' | 'SERVICE' | 'OTHER';
export type ExpensePaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'OTHER';

export interface Transaction {
  id: number;
  type: TransactionType;
  amount: string;
  concept: string;
  reference_type: ReferenceType;
  reference_id: number;
  transaction_date: string;
  registered_by: number;
  created_at: string;
}

export interface ExpenseCategory {
  id: number;
  name: string;
  description: string;
  created_at: string;
}

export interface Expense {
  id: number;
  description: string;
  category: number;
  category_name: string | null;
  amount: string;
  expense_date: string;
  payment_method: ExpensePaymentMethod;
  receipt_reference: string;
  notes: string;
  registered_by: number;
  created_at: string;
  updated_at: string;
}

export interface CashRegister {
  id: number;
  opened_by: number;
  closed_by: number | null;
  opening_amount: string;
  closing_amount: string | null;
  expected_amount: string | null;
  difference: string | null;
  opened_at: string;
  closed_at: string | null;
  status: 'OPEN' | 'CLOSED';
}

export interface CashBalance {
  register_id: number;
  opening_amount: string;
  income: string;
  expense: string;
  balance: string;
  status: 'OPEN' | 'CLOSED';
}

// --- invoicing ---
export interface CustomerInvoice {
  id: number;
  invoice_number: string;
  sale: number;
  customer: number | null;
  generated_by: number;
  total: string;
  tax: string;
  discount: string;
  notes: string;
  issued_at: string;
  sent_by_email: boolean;
  email_sent_to: string;
  status: 'ISSUED' | 'CANCELLED';
}
