export type UserRole = 'customer' | 'provider' | 'admin';

export type CustomerAction =
  | 'all'
  | 'book_service'       // Plumber, cleaning, car repair
  | 'book_appointment'   // Salon, doctor, property visit
  | 'find_institution'   // School, daycare, coaching centre
  | 'apply'              // School admission, job
  | 'rent_something'     // House, car, tools, furniture
  | 'book_space'         // Function hall, meeting room, sports ground
  | 'request_quotation'  // Construction, wedding catering, interior design
  | 'subscribe'          // Tiffin, cleaning, vehicle maintenance
  | 'request_urgent_help';// Towing, emergency plumbing

export type EntityType =
  | 'service'
  | 'job'
  | 'property'
  | 'rental'
  | 'vehicle'
  | 'school'
  | 'item'
  | 'event'
  | 'b2b';

export type FieldType = 'text' | 'number' | 'select' | 'boolean' | 'date';

export interface CustomFieldDef {
  id: string;
  key: string;
  label: string;
  type: FieldType;
  options?: string[]; // For select types
  required?: boolean;
  placeholder?: string;
  unit?: string; // e.g. "sq.ft", "BHK", "LPA"
}

export interface CategoryDef {
  id: string;
  name: string;
  entityType: EntityType;
  icon: string;
  subcategories: string[];
  customFields: CustomFieldDef[];
  description: string;
  listingCount: number;
}

export type ListingStatus = 'active' | 'pending_approval' | 'expired' | 'rejected';

export interface PriceBreakdownItem {
  label: string;
  labelTe?: string;
  labelHi?: string;
  amount: number;
  isIncluded?: boolean;
}

export interface PriceBreakdown {
  baseRent: number;
  baseLabel?: string;
  baseLabelTe?: string;
  baseLabelHi?: string;
  maintenance: number;
  maintenanceLabel?: string;
  maintenanceLabelTe?: string;
  maintenanceLabelHi?: string;
  serviceFee: number;
  serviceFeeLabel?: string;
  serviceFeeLabelTe?: string;
  serviceFeeLabelHi?: string;
  taxes?: number;
  taxLabel?: string;
  taxLabelTe?: string;
  taxLabelHi?: string;
  securityDeposit?: number;
  discountAmount?: number;
  notes?: string;
  items?: PriceBreakdownItem[];
}

export interface MarketplaceListing {
  id: string;
  title: string;
  titleTe?: string;
  titleHi?: string;
  description: string;
  descriptionTe?: string;
  descriptionHi?: string;
  categoryId: string;
  subcategory: string;
  subcategoryTe?: string;
  entityType: EntityType;
  price: number;
  priceUnit: string; // e.g., "/hr", "/month", "/day", "/project", "Fixed", "Negotiable"
  priceUnitTe?: string;
  currency: string;
  priceBreakdown?: PriceBreakdown;
  location: {
    city: string;
    area: string;
    state?: string;
    pincode?: string;
    distanceKm?: number;
    lat?: number;
    lng?: number;
  };
  distanceKm?: number;
  images: string[];
  providerId: string;
  providerName: string;
  providerNameTe?: string;
  providerNameHi?: string;
  providerPhone: string;
  providerEmail: string;
  providerAvatar: string;
  providerRating: number;
  reviewCount: number;
  isVerified: boolean;
  isFeatured: boolean;
  featured?: boolean;
  upiId?: string;
  status: ListingStatus;
  runningBatchUrl?: string;
  batchScheduleImages?: string[];
  providerRegistrationNote?: string;
  submittedAt?: string;
  approvedAt?: string;
  customFieldValues: Record<string, string | number | boolean>;
  postingPlanId: string;
  viewsCount: number;
  enquiriesCount: number;
  createdAt: string;
  expiresAt: string;
  reported: boolean;
  reportReason?: string;
}

export type Listing = MarketplaceListing;

export interface PostingPlan {
  id: string;
  name: string;
  price: number;
  billingPeriod: 'one_time' | 'monthly' | 'yearly';
  listingLimit: number;
  validityDays: number;
  isFeaturedIncluded: boolean;
  priorityRank: number;
  perks: string[];
  isPopular?: boolean;
  isActive: boolean;
}

export interface Enquiry {
  id: string;
  listingId: string;
  listingTitle: string;
  providerId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  message: string;
  status: 'new' | 'contacted' | 'resolved';
  timestamp: string;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  senderRole: 'customer' | 'provider';
  senderName: string;
  text: string;
  timestamp: string;
}

export interface Booking {
  id: string;
  listingId: string;
  listingTitle: string;
  providerId: string;
  customerName: string;
  customerPhone: string;
  customerAddress?: string;
  customerGstin?: string;
  scheduledDate: string;
  checkInDate?: string;
  checkOutDate?: string;
  checkInDateTime?: string;
  checkOutDateTime?: string;
  durationDays?: number;
  timeSlot: string;
  totalAmount: number;
  invoiceNumber?: string;
  status: 'confirmed' | 'pending' | 'completed' | 'cancelled';
  notes?: string;
  createdAt: string;
}

export interface Review {
  id: string;
  listingId: string;
  customerName: string;
  customerAvatar: string;
  rating: number;
  comment: string;
  date: string;
  verifiedCustomer: boolean;
  tags?: string[];
  providerId?: string;
  helpfulCount?: number;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  time: string;
  type: 'enquiry' | 'booking' | 'payment' | 'approval' | 'report';
  read: boolean;
  linkId?: string;
}

export interface PaymentTransaction {
  id: string;
  type: 'plan_subscription' | 'pay_per_post' | 'featured_boost';
  amount: number;
  description: string;
  planName: string;
  status: 'success' | 'failed';
  date: string;
  invoiceNumber: string;
  paymentMethod: string;
}
