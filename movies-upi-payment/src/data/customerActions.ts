import { CustomerAction } from '../types/marketplace';

export interface CustomerActionMeta {
  id: CustomerAction;
  label: string;
  examples: string;
  iconName: string;
  badgeColor: string;
  buttonText: string;
  accentBg: string;
  matchedCategoryIds: string[];
}

export const customerActionList: CustomerActionMeta[] = [
  {
    id: 'book_service',
    label: 'Book a service',
    examples: 'Plumber, cleaning, car repair',
    iconName: 'Wrench',
    badgeColor: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border-purple-200 dark:border-purple-800',
    buttonText: 'Book Service',
    accentBg: 'from-purple-600 to-indigo-700',
    matchedCategoryIds: ['cat-1', 'cat-2', 'cat-3', 'cat-4', 'cat-5', 'cat-6', 'cat-8', 'cat-10', 'cat-19', 'cat-20', 'cat-24', 'cat-25', 'cat-35', 'cat-38', 'cat-39', 'cat-42']
  },
  {
    id: 'book_appointment',
    label: 'Book an appointment',
    examples: 'Salon, doctor, property visit',
    iconName: 'Calendar',
    badgeColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    buttonText: 'Book Appointment',
    accentBg: 'from-emerald-600 to-teal-700',
    matchedCategoryIds: ['cat-11', 'cat-12', 'cat-13', 'cat-27', 'cat-33', 'cat-36', 'cat-37']
  },
  {
    id: 'find_institution',
    label: 'Find an institution',
    examples: 'School, daycare, coaching centre',
    iconName: 'Building',
    badgeColor: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    buttonText: 'Explore Institution',
    accentBg: 'from-blue-600 to-indigo-800',
    matchedCategoryIds: ['cat-14', 'cat-15', 'cat-16', 'cat-17']
  },
  {
    id: 'apply',
    label: 'Apply',
    examples: 'School admission, job',
    iconName: 'FileText',
    badgeColor: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
    buttonText: 'Apply Now',
    accentBg: 'from-indigo-600 to-purple-800',
    matchedCategoryIds: ['cat-15', 'cat-18']
  },
  {
    id: 'rent_something',
    label: 'Rent something',
    examples: 'House, car, tools, furniture',
    iconName: 'KeyRound',
    badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    buttonText: 'Rent Now',
    accentBg: 'from-amber-600 to-orange-700',
    matchedCategoryIds: ['cat-22', 'cat-26', 'cat-28']
  },
  {
    id: 'book_space',
    label: 'Book a space',
    examples: 'Function hall, meeting room, sports ground',
    iconName: 'MapPin',
    badgeColor: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800',
    buttonText: 'Book Space',
    accentBg: 'from-cyan-600 to-blue-700',
    matchedCategoryIds: ['cat-29', 'cat-30', 'cat-43']
  },
  {
    id: 'request_quotation',
    label: 'Request a quotation',
    examples: 'Construction, wedding catering, interior design',
    iconName: 'FileSpreadsheet',
    badgeColor: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border-rose-200 dark:border-rose-800',
    buttonText: 'Request Quotation',
    accentBg: 'from-rose-600 to-pink-700',
    matchedCategoryIds: ['cat-6', 'cat-7', 'cat-29', 'cat-31', 'cat-34', 'cat-40', 'cat-41']
  },
  {
    id: 'subscribe',
    label: 'Subscribe',
    examples: 'Tiffin, cleaning, vehicle maintenance',
    iconName: 'Repeat',
    badgeColor: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300 border-violet-200 dark:border-violet-800',
    buttonText: 'Subscribe Now',
    accentBg: 'from-violet-600 to-purple-800',
    matchedCategoryIds: ['cat-1', 'cat-9', 'cat-19', 'cat-21', 'cat-31']
  },
  {
    id: 'request_urgent_help',
    label: 'Request urgent help',
    examples: 'Towing, emergency plumbing, breakdown',
    iconName: 'AlertTriangle',
    badgeColor: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 border-red-200 dark:border-red-800',
    buttonText: 'Request Urgent Help 🚨',
    accentBg: 'from-red-600 to-rose-800',
    matchedCategoryIds: ['cat-2', 'cat-3', 'cat-13', 'cat-19', 'cat-20', 'cat-21']
  }
];

export function getActionForListing(categoryId: string, entityType: string): CustomerActionMeta {
  if (entityType === 'job') {
    return customerActionList.find(a => a.id === 'apply')!;
  }
  if (categoryId === 'cat-15') { // Schools
    return customerActionList.find(a => a.id === 'apply')!;
  }
  if (entityType === 'rental' || categoryId === 'cat-26' || categoryId === 'cat-22' || categoryId === 'cat-28') {
    return customerActionList.find(a => a.id === 'rent_something')!;
  }
  if (categoryId === 'cat-30' || categoryId === 'cat-43') {
    return customerActionList.find(a => a.id === 'book_space')!;
  }
  if (categoryId === 'cat-7' || categoryId === 'cat-6' || categoryId === 'cat-29') {
    return customerActionList.find(a => a.id === 'request_quotation')!;
  }
  if (categoryId === 'cat-31') {
    return customerActionList.find(a => a.id === 'subscribe')!;
  }
  if (categoryId === 'cat-11' || categoryId === 'cat-13' || categoryId === 'cat-12') {
    return customerActionList.find(a => a.id === 'book_appointment')!;
  }
  if (categoryId === 'cat-2' || categoryId === 'cat-3') {
    // Has urgent option or book service
    return customerActionList.find(a => a.id === 'book_service')!;
  }

  // Fallback to book_service
  return customerActionList[0];
}
