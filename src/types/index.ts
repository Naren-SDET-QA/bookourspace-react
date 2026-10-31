export type ServiceType = 
  // Home Services (Core Local Services)
  | 'electrician'
  | 'painter'
  | 'tiler'
  | 'docker'
  | 'plumber'
  | 'carpenter'
  | 'cleaner'
  | 'gardener'
  | 'ac_repair'
  | 'appliance_repair'
  | 'pest_control'
  | 'waterproofing'
  // School Services
  | 'school_driver'
  | 'tutor'
  | 'tailor'
  | 'lab_assistant'
  | 'stationery'
  | 'child_aide'
  // Hospital Services
  | 'home_nurse'
  | 'caretaker'
  | 'ambulance'
  | 'physiotherapist'
  | 'lab_sample'
  | 'medicine_delivery';

export type MainCategory = 'all' | 'home' | 'school' | 'hospital';

export type LanguageCode = 'te' | 'en' | 'hi' | 'ta' | 'kn' | 'ml' | 'mr' | 'bn' | 'gu' | 'pa' | 'or' | 'ur';

export interface ServiceItem {
  id: ServiceType;
  titleKey: string;
  category: 'home' | 'school' | 'hospital';
  icon: string;
  iconBg: string;
  iconColor: string;
  descriptionKey: string;
  popularTradeBadge?: string;
  defaultRate: string;
}

export interface ServiceProvider {
  id: string;
  name: string;
  trade: ServiceType;
  category: 'home' | 'school' | 'hospital';
  rating: number;
  reviewCount: number;
  distanceKm: number;
  locationName: string;
  hourlyRate: number;
  phone: string;
  avatar: string;
  isVerified: boolean;
  voiceNoteUrl?: string;
  voiceDurationSec?: number;
  voiceTranscription?: string;
  experienceYears: number;
  completedJobs: number;
  bio: string;
  availableToday: boolean;
  languages: string[];
}

export interface BookingRequest {
  id: string;
  providerId: string;
  providerName: string;
  serviceType: ServiceType;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  scheduledTime: string;
  voiceInstructionUrl?: string;
  voiceInstructionText?: string;
  status: 'pending' | 'accepted' | 'completed' | 'cancelled';
  createdAt: string;
  estimatedCost: number;
}

export interface RealtimeNotification {
  id: string;
  title: string;
  message: string;
  time: string;
  type: 'urgent_request' | 'booking_confirmed' | 'payment_received' | 'review';
  read: boolean;
  actionRequired?: boolean;
  requestData?: {
    clientName: string;
    trade: ServiceType;
    distance: string;
    location: string;
    urgency: 'high' | 'medium';
    rate: string;
  };
}

export interface UserProfile {
  id: string;
  name: string;
  phone: string;
  email: string;
  avatar: string;
  title: string;
  tagline: string;
  isProvider: boolean;
  providerDetails?: {
    businessName: string;
    trade: ServiceType;
    category: 'home' | 'school' | 'hospital';
    experience: number;
    hourlyRate: number;
    address: string;
    voiceBioUrl?: string;
    voiceBioText?: string;
    logoUrl?: string;
  };
  quotesCount: number;
  language: LanguageCode;
  serviceRadiusKm: number;
  operatingHours: string;
}

export type PlatformView = 'android' | 'ios' | 'dashboard';
export type ActiveTab = 'home' | 'edit_design' | 'profile' | 'settings' | 'alerts';
