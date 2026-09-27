export type SupplierStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
export type ProductStatus = 'ACTIVE' | 'INACTIVE' | 'OUT_OF_STOCK';
export type CustomerStatus = 'PROSPECT' | 'CUSTOMER' | 'INACTIVE';
export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'RETURNED';
export type PaymentMethod = 'CASH_ON_DELIVERY' | 'ORANGE_MONEY_MANUAL' | 'ORANGE_MONEY_AUTOMATIC';
export type PaymentStatus = 'PENDING' | 'VERIFIED' | 'REJECTED' | 'REFUNDED';
export type DriverStatus = 'AVAILABLE' | 'ASSIGNED' | 'PICKED_UP' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED' | 'RETURNED';
export type Channel = 'WHATSAPP' | 'SITE' | 'INSTAGRAM' | 'FACEBOOK' | 'SIMULATOR';
export type StockMovementType = 'INITIAL' | 'ADD' | 'SALE' | 'RESERVATION' | 'RELEASE' | 'CORRECTION';

export interface Category {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  created_at: string;
}

export interface Supplier {
  id: string;
  code: string;
  name: string;
  business_name: string | null;
  phone: string | null;
  zone: string | null;
  contact_info: string | null;
  status: SupplierStatus;
  quality_rating: number | null;
  created_at: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
}

export interface Product {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category_id: string | null;
  supplier_id: string | null;
  supplier_price: number;
  sale_price: number;
  stock: number;
  stock_last_checked: string | null;
  image_url: string | null;
  status: ProductStatus;
  created_at: string;
  updated_at: string;
  brand?: string | null;
  low_stock_threshold?: number;
  initial_supplier_price?: number;
  purchase_price?: number;
  deleted_at?: string | null;
  deleted_by?: string | null;
}

export interface HeroSlide {
  id: string;
  image_url: string;
  title: string;
  description: string | null;
  button_text: string | null;
  button_link: string | null;
  position: number;
  duration_seconds: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductImage {
  id: string;
  product_id: string;
  image_url: string;
  position: number;
  is_primary: boolean;
  color: string | null;
  created_at: string;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  color: string | null;
  size: string | null;
  stock: number;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface PublicVariant {
  id: string;
  color: string | null;
  size: string | null;
  image_url: string | null;
  in_stock: boolean;
  max_orderable: number;
}

export interface ProductSupplier {
  id: string;
  product_id: string;
  supplier_id: string;
  is_primary: boolean;
  initial_supplier_price: number;
  purchase_price: number;
  created_at: string;
  updated_at: string;
}

export interface StockMovement {
  id: string;
  product_id: string;
  type: StockMovementType;
  quantity: number;
  previous_stock: number;
  new_stock: number;
  note: string | null;
  created_at: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  neighborhood: string | null;
  address: string | null;
  channel: Channel;
  status: CustomerStatus;
  last_interaction: string | null;
  created_at: string;
  user_id?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
}

export interface Order {
  id: string;
  code: string;
  customer_id: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  channel: Channel;
  status: OrderStatus;
  subtotal: number;
  delivery_fee: number;
  service_fee: number;
  total: number;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  delivery_address: string | null;
  delivery_neighborhood: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  product_code: string | null;
  quantity: number;
  unit_price: number;
  supplier_id: string | null;
  supplier_price: number;
  supplier_group_id?: string | null;
}

export interface Payment {
  id: string;
  order_id: string;
  method: PaymentMethod;
  amount: number;
  reference: string | null;
  status: PaymentStatus;
  verified_at: string | null;
  created_at: string;
}

export interface Driver {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  zone: string | null;
  status: DriverStatus;
  created_at: string;
  user_id?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
}

export interface Delivery {
  id: string;
  order_id: string;
  driver_id: string | null;
  status: string;
  assigned_at: string;
  picked_up_at: string | null;
  delivered_at: string | null;
  note: string | null;
}

export interface DeliveryProof {
  id: string;
  delivery_id: string;
  method: 'CONFIRMATION' | 'OTP' | 'SIGNATURE' | 'PHOTO';
  data: string | null;
  recorded_by: string | null;
  recorded_at: string;
}

export interface DeliveryFailure {
  id: string;
  delivery_id: string;
  reason: string;
  comment: string | null;
  reported_by: string | null;
  reported_at: string;
  decision: 'RETRY' | 'RETURN' | 'CANCEL_ORDER' | null;
  decided_by: string | null;
  decided_at: string | null;
}

export interface Conversation {
  id: string;
  customer_id: string;
  channel: Channel;
  status: string;
  created_at: string;
  updated_at: string;
  assigned_to?: string | null;
  human_requested_at?: string | null;
  archived?: boolean;
  deleted_at?: string | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender: 'CUSTOMER' | 'BOT' | 'SYSTEM' | 'EMPLOYEE';
  sender_id?: string | null;
  content: string;
  product_id: string | null;
  order_id: string | null;
  intent: string | null;
  created_at: string;
}

export interface CustomerNotification {
  id: string;
  customer_id: string;
  type: string;
  title: string;
  message: string | null;
  channel: 'SITE' | 'SMS' | 'WHATSAPP' | 'EMAIL';
  target_type: string | null;
  target_id: string | null;
  read: boolean;
  created_at: string;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string | null;
  target_type: string | null;
  target_id: string | null;
  read: boolean;
  created_at: string;
}

export interface EventLog {
  id: string;
  event_type: string;
  entity_type: string | null;
  entity_id: string | null;
  description: string | null;
  old_value?: unknown;
  new_value?: unknown;
  created_at: string;
  actor_id?: string | null;
  actor_name?: string | null;
  actor_email?: string | null;
}

export type AccountType = 'ADMIN' | 'EMPLOYEE' | 'DRIVER' | 'CUSTOMER';
export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  account_type: AccountType;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Role {
  id: string;
  code: string;
  name: string;
  description: string | null;
}

export interface Permission {
  code: string;
  name: string;
  description: string | null;
}

export interface PermissionOverride {
  user_id: string;
  permission_code: string;
  granted: boolean;
}

export interface EmployeeInvitation {
  email: string;
  role_code: string;
  status: InvitationStatus;
  invited_at: string;
  accepted_at: string | null;
}

export interface EmployeeWithRole extends Profile {
  role_code: string | null;
  role_name: string | null;
  overrides: PermissionOverride[];
}

export interface OrderSupplierGroup {
  id: string;
  order_id: string;
  supplier_id: string | null;
  status: 'PENDING' | 'PREPARING' | 'READY' | 'HANDED_TO_DELIVERY' | 'DELIVERED' | 'CANCELLED';
  subtotal: number;
  purchase_subtotal: number;
  item_count: number;
  created_at: string;
  updated_at: string;
}

export interface AccountingPeriod {
  id: string;
  label: string;
  status: 'OPEN' | 'CLOSED';
  started_at: string;
  closed_at: string | null;
  closed_by: string | null;
}

export interface PeriodFinancials {
  period_id: string;
  period_label: string;
  period_status: 'OPEN' | 'CLOSED';
  sales_amount: number;
  purchase_amount: number;
  supplier_savings: number;
  gross_margin: number;
  delivery_fees: number;
  supplier_commission: number;
  ratel_earnings: number;
  orders_count: number;
  cancelled_count: number;
}

export interface Backup {
  id: string;
  reason: string;
  tables_included: string[];
  row_counts: Record<string, number>;
  created_by: string | null;
  created_at: string;
}

export interface Return {
  id: string;
  order_id: string;
  order_item_id: string;
  product_id: string | null;
  supplier_id: string | null;
  driver_id: string | null;
  reason: string;
  reason_category: 'DEFECTIVE' | 'WRONG_ITEM' | 'CHANGED_MIND' | 'DELIVERY_REFUSED' | 'OTHER';
  route_to_supplier: boolean;
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'COMPLETED';
  comment: string | null;
  resolution: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Complaint {
  id: string;
  customer_id: string | null;
  order_id: string | null;
  channel: Channel;
  subject: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  assigned_to: string | null;
  resolution: string | null;
  created_at: string;
  updated_at: string;
}

export interface ComplaintMessage {
  id: string;
  complaint_id: string;
  sender: 'CUSTOMER' | 'EMPLOYEE';
  sender_id: string | null;
  content: string;
  created_at: string;
}
