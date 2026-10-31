import { CategoryDef } from '../types/marketplace';

export const all44Categories: CategoryDef[] = [
  {
    id: 'cat-1',
    name: 'Home cleaning',
    entityType: 'service',
    icon: 'Sparkles',
    description: 'Professional residential and deep sanitization services',
    listingCount: 24,
    subcategories: [
      'House cleaning', 'Deep cleaning', 'Bathroom cleaning', 'Kitchen cleaning',
      'Sofa cleaning', 'Carpet cleaning', 'Mattress cleaning', 'Water tank cleaning'
    ],
    customFields: [
      { id: 'f-1', key: 'serviceScope', label: 'Cleaning Scope', type: 'select', options: ['Full Home', 'Kitchen Only', 'Bathrooms Only', 'Furniture Only'], required: true },
      { id: 'f-2', key: 'bhkSize', label: 'Apartment Size', type: 'select', options: ['1 BHK', '2 BHK', '3 BHK', '4+ BHK / Villa'] },
      { id: 'f-3', key: 'chemicalsUsed', label: 'Eco-Friendly Chemicals', type: 'boolean' }
    ]
  },
  {
    id: 'cat-2',
    name: 'Electrical services',
    entityType: 'service',
    icon: 'Zap',
    description: 'Certified electrical wiring, repair, and installations',
    listingCount: 31,
    subcategories: [
      'Electrician', 'Wiring', 'Switch repair', 'Fan installation',
      'Lighting installation', 'Inverter repair', 'Generator service'
    ],
    customFields: [
      { id: 'f-4', key: 'licenseNo', label: 'Wireman License / ID', type: 'text', placeholder: 'e.g. EL-48209' },
      { id: 'f-5', key: 'responseTime', label: 'Average Arrival Time', type: 'select', options: ['15-30 Mins', '1-2 Hours', 'Same Day', 'Scheduled'] },
      { id: 'f-6', key: 'emergency24x7', label: '24/7 Emergency Service', type: 'boolean' }
    ]
  },
  {
    id: 'cat-3',
    name: 'Plumbing',
    entityType: 'service',
    icon: 'Wrench',
    description: 'Leakage fixing, pipes, motors, and bathroom fittings',
    listingCount: 19,
    subcategories: [
      'Tap repair', 'Pipe leakage', 'Bathroom fittings', 'Drain cleaning',
      'Water motor repair', 'Pump installation'
    ],
    customFields: [
      { id: 'f-7', key: 'inspectionFee', label: 'Base Inspection Fee', type: 'number', unit: '₹' },
      { id: 'f-8', key: 'toolsProvided', label: 'Specialized Machine Cleaning', type: 'boolean' }
    ]
  },
  {
    id: 'cat-4',
    name: 'Appliance repair',
    entityType: 'service',
    icon: 'Tv',
    description: 'Repair for AC, refrigerator, washing machine, microwave & geyser',
    listingCount: 28,
    subcategories: [
      'AC', 'Refrigerator', 'Washing machine', 'Television',
      'Microwave', 'Chimney', 'Geyser', 'Water purifier repair'
    ],
    customFields: [
      { id: 'f-9', key: 'brandExpertise', label: 'Supported Brands', type: 'text', placeholder: 'e.g. LG, Samsung, Daikin, Voltas' },
      { id: 'f-10', key: 'serviceWarranty', label: 'Service Warranty (Days)', type: 'select', options: ['30 Days', '60 Days', '90 Days', 'No Warranty'] }
    ]
  },
  {
    id: 'cat-5',
    name: 'Carpentry & furniture',
    entityType: 'service',
    icon: 'Hammer',
    description: 'Woodwork, cupboard making, door repair, and custom furniture',
    listingCount: 16,
    subcategories: [
      'Carpenter', 'Furniture repair', 'Custom furniture', 'Cupboard installation',
      'Door repair', 'Furniture assembly'
    ],
    customFields: [
      { id: 'f-11', key: 'woodTypes', label: 'Wood Material Specialization', type: 'text', placeholder: 'e.g. Teak, Plywood, MDF, Pine' },
      { id: 'f-12', key: 'customDesign', label: 'Custom 3D CAD Design Available', type: 'boolean' }
    ]
  },
  {
    id: 'cat-6',
    name: 'Painting & interiors',
    entityType: 'service',
    icon: 'Palette',
    description: 'Wall painting, waterproofing, texture, wallpapers & false ceiling',
    listingCount: 22,
    subcategories: [
      'House painting', 'Waterproofing', 'Wallpaper', 'False ceiling',
      'Interior design', 'Modular kitchen'
    ],
    customFields: [
      { id: 'f-13', key: 'paintBrands', label: 'Preferred Paint Brands', type: 'select', options: ['Asian Paints', 'Berger', 'Dulux', 'Nerolac', 'Client Choice'] },
      { id: 'f-14', key: 'freeColorConsult', label: 'Free Color Consultation Included', type: 'boolean' }
    ]
  },
  {
    id: 'cat-7',
    name: 'Construction & renovation',
    entityType: 'service',
    icon: 'Layers',
    description: 'Building contractors, masons, tiles, welding, roofing & remodeling',
    listingCount: 18,
    subcategories: [
      'Building contractor', 'Mason', 'Tiles', 'Flooring',
      'Roofing', 'Welding', 'Fabrication', 'Demolition', 'House renovation'
    ],
    customFields: [
      { id: 'f-15', key: 'projectScale', label: 'Contractor Capacity', type: 'select', options: ['Minor Repair (< 500 sq.ft)', 'Full Home Remodel', 'New Building Construction'] },
      { id: 'f-16', key: 'yearsExperience', label: 'Years in Construction', type: 'number', unit: 'years' }
    ]
  },
  {
    id: 'cat-8',
    name: 'Home maintenance & safety',
    entityType: 'service',
    icon: 'ShieldCheck',
    description: 'Pest control, CCTV installation, smart locks, mosquito nets & solar',
    listingCount: 15,
    subcategories: [
      'Pest control', 'CCTV installation', 'Smart locks', 'Mosquito nets',
      'Solar installation', 'Fire safety equipment'
    ],
    customFields: [
      { id: 'f-17', key: 'amcOption', label: 'Annual Maintenance Contract (AMC)', type: 'boolean' },
      { id: 'f-18', key: 'warrantyPeriod', label: 'Equipment Guarantee', type: 'select', options: ['1 Year', '2 Years', '5 Years', 'Lifetime'] }
    ]
  },
  {
    id: 'cat-9',
    name: 'Domestic help',
    entityType: 'service',
    icon: 'Users',
    description: 'Verified maids, cooks, babysitters, nannies & patient attendants',
    listingCount: 20,
    subcategories: [
      'Maid', 'Cook', 'Babysitter', 'Nanny',
      'Elderly companion', 'Patient attendant', 'Live-in household help'
    ],
    customFields: [
      { id: 'f-19', key: 'workTiming', label: 'Shift Type', type: 'select', options: ['Part-Time (Morning/Evening)', 'Full Day (8-10 Hours)', '24-Hour Live-in'] },
      { id: 'f-20', key: 'backgroundVerified', label: 'Police Background Verification Done', type: 'boolean' }
    ]
  },
  {
    id: 'cat-10',
    name: 'Laundry & clothing care',
    entityType: 'service',
    icon: 'Shirt',
    description: 'Washing, steam ironing, dry cleaning, shoe cleaning with doorstep pickup',
    listingCount: 12,
    subcategories: [
      'Washing', 'Ironing', 'Dry cleaning', 'Shoe cleaning',
      'Bag cleaning', 'Pickup and delivery'
    ],
    customFields: [
      { id: 'f-21', key: 'turnaroundTime', label: 'Delivery Time', type: 'select', options: ['24 Hours Express', '48 Hours Standard', '3-4 Days'] },
      { id: 'f-22', key: 'freePickup', label: 'Free Home Pickup & Drop', type: 'boolean' }
    ]
  },
  {
    id: 'cat-11',
    name: 'Salon, beauty & grooming',
    entityType: 'service',
    icon: 'Scissors',
    description: 'Doorstep haircut, facial, waxing, bridal makeup, nails & mehndi',
    listingCount: 27,
    subcategories: [
      'Women’s salon', 'Men’s salon', 'Haircut', 'Shaving',
      'Facial', 'Waxing', 'Threading', 'Makeup', 'Bridal makeup', 'Nail services', 'Mehndi'
    ],
    customFields: [
      { id: 'f-23', key: 'serviceLocation', label: 'Service Venue', type: 'select', options: ['At Client Home', 'At Professional Salon', 'Both'] },
      { id: 'f-24', key: 'bridalPackage', label: 'Bridal Packages Available', type: 'boolean' }
    ]
  },
  {
    id: 'cat-12',
    name: 'Wellness & fitness',
    entityType: 'service',
    icon: 'Activity',
    description: 'Personal gym trainers, yoga instructors, meditation & therapeutic spa',
    listingCount: 14,
    subcategories: [
      'Yoga instructor', 'Personal trainer', 'Fitness classes',
      'Meditation', 'Spa', 'Massage'
    ],
    customFields: [
      { id: 'f-25', key: 'sessionType', label: 'Session Format', type: 'select', options: ['1-on-1 Personal', 'Group Session', 'Online Live Video'] },
      { id: 'f-26', key: 'certifiedCoach', label: 'Internationally Certified', type: 'boolean' }
    ]
  },
  {
    id: 'cat-13',
    name: 'Healthcare',
    entityType: 'service',
    icon: 'Stethoscope',
    description: 'Home nursing, physiotherapy, doctor appointments, lab tests & ambulance',
    listingCount: 30,
    subcategories: [
      'Doctor appointments', 'Dentist', 'Physiotherapy', 'Home nursing',
      'Diagnostic tests', 'Sample collection', 'Medical equipment rental', 'Ambulance'
    ],
    customFields: [
      { id: 'f-27', key: 'medicalLicense', label: 'Clinical Registration / Council No', type: 'text', placeholder: 'e.g. MCI / KMC-9821' },
      { id: 'f-28', key: 'homeVisit', label: 'Home Visit Available', type: 'boolean' }
    ]
  },
  {
    id: 'cat-14',
    name: 'Child & family care',
    entityType: 'service',
    icon: 'HeartHandshake',
    description: 'Daycare, preschool, maternity care, and child development support',
    listingCount: 11,
    subcategories: [
      'Daycare', 'Preschool', 'After-school care', 'Maternity support', 'Child development services'
    ],
    customFields: [
      { id: 'f-29', key: 'ageBracket', label: 'Target Age Group', type: 'select', options: ['0-2 Years (Infant)', '3-5 Years (Toddler)', '6-12 Years (School Age)'] },
      { id: 'f-30', key: 'cctvAccess', label: 'Live CCTV Parental Feed', type: 'boolean' }
    ]
  },
  {
    id: 'cat-15',
    name: 'Schools & admissions',
    entityType: 'school',
    icon: 'GraduationCap',
    description: 'School discovery, admissions, boarding schools & special education',
    listingCount: 19,
    subcategories: [
      'School discovery', 'School admissions', 'School visits',
      'Boarding schools', 'Special education schools', 'School transport'
    ],
    customFields: [
      { id: 'f-31', key: 'curriculumBoard', label: 'Curriculum Board', type: 'select', options: ['CBSE', 'ICSE', 'IB World', 'State Board', 'Cambridge IGCSE'], required: true },
      { id: 'f-32', key: 'gradesOffered', label: 'Grades Offered', type: 'text', placeholder: 'e.g. Nursery to Grade 12' },
      { id: 'f-33', key: 'annualFeeRange', label: 'Annual Fee Range (₹)', type: 'select', options: ['Under ₹50,000', '₹50k - ₹1 Lakh', '₹1 Lakh - ₹2.5 Lakhs', '₹2.5 Lakhs+'] }
    ]
  },
  {
    id: 'cat-16',
    name: 'Tuition & education',
    entityType: 'service',
    icon: 'BookOpen',
    description: 'Home tutors, coaching centres, entrance exams & computer training',
    listingCount: 35,
    subcategories: [
      'Home tuition', 'Online tuition', 'Coaching centres',
      'Entrance exam coaching', 'Language classes', 'Computer training'
    ],
    customFields: [
      { id: 'f-34', key: 'subjectsTaught', label: 'Subjects / Competitive Exam', type: 'text', placeholder: 'e.g. Maths, Physics, NEET, JEE, Coding', required: true },
      { id: 'f-35', key: 'freeDemoClass', label: 'Free Demo Class Available', type: 'boolean' }
    ]
  },
  {
    id: 'cat-17',
    name: 'Skills & hobby classes',
    entityType: 'service',
    icon: 'Music',
    description: 'Music, dance, drawing, cooking, tailoring, swimming & driving lessons',
    listingCount: 17,
    subcategories: [
      'Music', 'Dance', 'Drawing', 'Cooking', 'Tailoring',
      'Photography', 'Swimming', 'Driving lessons', 'Vocational training'
    ],
    customFields: [
      { id: 'f-36', key: 'batchTimings', label: 'Batch Options', type: 'select', options: ['Weekend Batches', 'Weekday Evenings', 'Flexible Hours'] },
      { id: 'f-37', key: 'certification', label: 'Certificate on Completion', type: 'boolean' }
    ]
  },
  {
    id: 'cat-18',
    name: 'Jobs & recruitment',
    entityType: 'job',
    icon: 'Briefcase',
    description: 'Full-time, part-time, daily wage, domestic & technician hiring',
    listingCount: 42,
    subcategories: [
      'Full-time jobs', 'Part-time jobs', 'Daily wage work', 'Domestic worker hiring',
      'Driver hiring', 'Teacher hiring', 'Technician hiring', 'Recruitment agencies'
    ],
    customFields: [
      { id: 'f-38', key: 'jobRole', label: 'Job Designation', type: 'text', placeholder: 'e.g. Senior Electrician, Delivery Associate, Nurse', required: true },
      { id: 'f-39', key: 'employmentType', label: 'Employment Mode', type: 'select', options: ['Full-Time', 'Part-Time', 'Contract / Project', 'Daily Wage'], required: true },
      { id: 'f-40', key: 'monthlySalary', label: 'Salary Offered (₹/month)', type: 'text', placeholder: 'e.g. ₹25,000 - ₹35,000' },
      { id: 'f-41', key: 'minExperience', label: 'Minimum Experience', type: 'select', options: ['Fresher Welcome', '1-2 Years', '3-5 Years', '5+ Years'] }
    ]
  },
  {
    id: 'cat-19',
    name: 'Car services',
    entityType: 'service',
    icon: 'Car',
    description: 'Car repairs, regular servicing, detailing, denting, towing & battery',
    listingCount: 21,
    subcategories: [
      'Car repair', 'Regular servicing', 'Washing', 'Detailing',
      'Denting', 'Painting', 'Tyre service', 'Battery replacement', 'Roadside assistance', 'Towing'
    ],
    customFields: [
      { id: 'f-42', key: 'workshopType', label: 'Facility Type', type: 'select', options: ['Doorstep Mobile Mechanic', 'Authorised Service Centre', 'Multi-Brand Garage'] },
      { id: 'f-43', key: 'freePickDropCar', label: 'Complimentary Vehicle Pickup & Drop', type: 'boolean' }
    ]
  },
  {
    id: 'cat-20',
    name: 'Bike & other vehicle services',
    entityType: 'service',
    icon: 'Bike',
    description: 'Two-wheeler repairs, EV scooter maintenance, auto-rickshaw & puncture',
    listingCount: 16,
    subcategories: [
      'Bike repair', 'Scooter service', 'EV service',
      'Auto-rickshaw repair', 'Bicycle repair', 'Puncture repair'
    ],
    customFields: [
      { id: 'f-44', key: 'evCertified', label: 'EV Electric Scooter Certified', type: 'boolean' },
      { id: 'f-45', key: 'doorstepService', label: 'Roadside Puncture / Battery Support', type: 'boolean' }
    ]
  },
  {
    id: 'cat-21',
    name: 'Bus, truck & commercial vehicle services',
    entityType: 'service',
    icon: 'Truck',
    description: 'Fleet maintenance, heavy vehicle towing, body building & bus repair',
    listingCount: 9,
    subcategories: [
      'Bus repair', 'Truck repair', 'Fleet maintenance',
      'Commercial vehicle washing', 'Heavy vehicle towing', 'Body building'
    ],
    customFields: [
      { id: 'f-46', key: 'fleetCapacity', label: 'Tonnage Handling', type: 'select', options: ['Light Commercial (LCV)', 'Medium Truck (MCV)', 'Heavy Multi-Axle (HCV)'] },
      { id: 'f-47', key: 'hydraulicCrane', label: 'Hydraulic Recovery Crane Available', type: 'boolean' }
    ]
  },
  {
    id: 'cat-22',
    name: 'Vehicle rentals',
    entityType: 'rental',
    icon: 'KeyRound',
    description: 'Self-drive cars, bikes, chauffeur vehicles, buses & tempo travellers',
    listingCount: 23,
    subcategories: [
      'Car rental', 'Bike rental', 'Self-drive vehicles',
      'Chauffeur-driven cars', 'Auto hire', 'Bus rental', 'Minibus rental', 'Tempo traveller rental'
    ],
    customFields: [
      { id: 'f-48', key: 'fuelIncluded', label: 'Fuel Option', type: 'select', options: ['With Fuel Included', 'Without Fuel (Client fills)'] },
      { id: 'f-49', key: 'seatingCapacity', label: 'Seating Capacity', type: 'select', options: ['2-Wheeler', '4-5 Seater Sedan/Hatch', '7-8 Seater SUV', '12-16 Seater Tempo', '32+ Seater Bus'] },
      { id: 'f-50', key: 'securityDeposit', label: 'Refundable Security Deposit (₹)', type: 'number' }
    ]
  },
  {
    id: 'cat-23',
    name: 'Travel & passenger transport',
    entityType: 'service',
    icon: 'Plane',
    description: 'Taxis, airport transfers, outstation packages, tour operators',
    listingCount: 15,
    subcategories: [
      'Taxi', 'Airport transfer', 'Outstation trips',
      'School transport', 'Employee transport', 'Tour operators', 'Travel agents'
    ],
    customFields: [
      { id: 'f-51', key: 'permitType', label: 'Vehicle Permit', type: 'select', options: ['All India Tourist Permit', 'State Commercial Permit', 'City Taxi Permit'] },
      { id: 'f-52', key: 'driverAllowance', label: 'Driver Bata Included in Fare', type: 'boolean' }
    ]
  },
  {
    id: 'cat-24',
    name: 'Goods transport & moving',
    entityType: 'service',
    icon: 'Package',
    description: 'Packers & movers, house shifting, mini-trucks, loaders & warehouse',
    listingCount: 29,
    subcategories: [
      'Packers and movers', 'House shifting', 'Office shifting',
      'Mini-truck booking', 'Goods transport', 'Loading workers', 'Warehouse storage'
    ],
    customFields: [
      { id: 'f-53', key: 'transitInsurance', label: 'Transit Insurance Available', type: 'boolean' },
      { id: 'f-54', key: 'crewCount', label: 'Loading Crew Size', type: 'select', options: ['Vehicle Only', '2 Helpers', '4-Man Experienced Crew'] }
    ]
  },
  {
    id: 'cat-25',
    name: 'Delivery & errands',
    entityType: 'service',
    icon: 'Navigation',
    description: 'Parcel pickup, local couriers, grocery, medicine & document runners',
    listingCount: 13,
    subcategories: [
      'Parcel pickup', 'Courier', 'Grocery delivery',
      'Medicine delivery', 'Document delivery', 'Local shopping assistance'
    ],
    customFields: [
      { id: 'f-55', key: 'deliverySpeed', label: 'Delivery Timeframe', type: 'select', options: ['Instant (Under 60 mins)', 'Same Day (Within 4 hrs)', 'Next Day'] },
      { id: 'f-56', key: 'maxWeightKg', label: 'Maximum Weight Allowed (kg)', type: 'number' }
    ]
  },
  {
    id: 'cat-26',
    name: 'Property sales & rentals',
    entityType: 'property',
    icon: 'Home',
    description: 'Houses, flats, PG, hostels, commercial offices, shops & plots for sale/rent',
    listingCount: 48,
    subcategories: [
      'Houses', 'Flats', 'Rooms', 'PG accommodation',
      'Hostels', 'Offices', 'Shops', 'Commercial spaces', 'Warehouses', 'Land'
    ],
    customFields: [
      { id: 'f-57', key: 'transactionType', label: 'Rent or Sale', type: 'select', options: ['For Rent', 'For Sale', 'PG / Co-Living'], required: true },
      { id: 'f-58', key: 'bhkConfig', label: 'Bedrooms (BHK)', type: 'select', options: ['1 RK / Studio', '1 BHK', '2 BHK', '3 BHK', '4+ BHK / Penthouse', 'Commercial Space'] },
      { id: 'f-59', key: 'superBuiltUpArea', label: 'Built-up Area (sq.ft)', type: 'number', unit: 'sq.ft', required: true },
      { id: 'f-60', key: 'furnishingStatus', label: 'Furnishing State', type: 'select', options: ['Unfurnished', 'Semi-Furnished', 'Fully Furnished'] }
    ]
  },
  {
    id: 'cat-27',
    name: 'Property management',
    entityType: 'service',
    icon: 'Building2',
    description: 'Tenant finding, rental management, property inspection & maintenance',
    listingCount: 10,
    subcategories: [
      'Tenant finding', 'Rental management', 'Property inspection',
      'Property maintenance', 'Real estate agents'
    ],
    customFields: [
      { id: 'f-61', key: 'nriSupport', label: 'NRI Property Remote Management', type: 'boolean' },
      { id: 'f-62', key: 'legalAgreement', label: 'Rental Agreement & Police Verification Included', type: 'boolean' }
    ]
  },
  {
    id: 'cat-28',
    name: 'Equipment & item rentals',
    entityType: 'rental',
    icon: 'Box',
    description: 'Rent furniture, tools, construction machines, cameras, projectors & generators',
    listingCount: 18,
    subcategories: [
      'Furniture', 'Appliances', 'Tools', 'Construction equipment',
      'Cameras', 'Computers', 'Projectors', 'Generators', 'Party supplies', 'Medical equipment'
    ],
    customFields: [
      { id: 'f-63', key: 'rentalTenure', label: 'Minimum Rental Period', type: 'select', options: ['1 Day', '1 Week', '1 Month', '3 Months+'] },
      { id: 'f-64', key: 'idProofNeeded', label: 'ID Proof & Security Check', type: 'boolean' }
    ]
  },
  {
    id: 'cat-29',
    name: 'Events & celebrations',
    entityType: 'event',
    icon: 'PartyPopper',
    description: 'Event planners, wedding decor, catering, DJ, lights, anchors & entertainers',
    listingCount: 25,
    subcategories: [
      'Event planner', 'Wedding planner', 'Decoration', 'Catering',
      'Photography', 'Videography', 'DJ', 'Sound systems', 'Lighting', 'Anchors', 'Entertainers'
    ],
    customFields: [
      { id: 'f-65', key: 'eventCategory', label: 'Event Specialization', type: 'select', options: ['Weddings', 'Birthday Parties', 'Corporate Gala', 'Cultural Festivals'] },
      { id: 'f-66', key: 'maxGuestCapacity', label: 'Max Guest Capacity Handled', type: 'select', options: ['Up to 100', '100 - 500', '500 - 2,000', '2,000+ Guests'] }
    ]
  },
  {
    id: 'cat-30',
    name: 'Venues & spaces',
    entityType: 'property',
    icon: 'MapPin',
    description: 'Function halls, banquet lawns, meeting rooms, coworking spaces & studios',
    listingCount: 14,
    subcategories: [
      'Function halls', 'Wedding venues', 'Meeting rooms',
      'Coworking spaces', 'Studios', 'Sports grounds', 'Party spaces'
    ],
    customFields: [
      { id: 'f-67', key: 'parkingSpaces', label: 'Valet & Car Parking Capacity', type: 'number', unit: 'cars' },
      { id: 'f-68', key: 'acHall', label: 'Central Air Conditioning', type: 'boolean' }
    ]
  },
  {
    id: 'cat-31',
    name: 'Food & cooking',
    entityType: 'service',
    icon: 'Utensils',
    description: 'Home cooks, daily tiffin subscriptions, custom cakes & bulk catering',
    listingCount: 20,
    subcategories: [
      'Home cooks', 'Home chefs', 'Tiffin subscriptions',
      'Meal preparation', 'Catering', 'Bakers', 'Custom cakes', 'Bulk food orders'
    ],
    customFields: [
      { id: 'f-69', key: 'cuisineType', label: 'Cuisine Specialty', type: 'select', options: ['South Indian', 'North Indian', 'Pure Veg Jain', 'Multi-Cuisine', 'Bakery & Desserts'] },
      { id: 'f-70', key: 'fssaiCertified', label: 'FSSAI Food License / Hygiene Certified', type: 'boolean' }
    ]
  },
  {
    id: 'cat-32',
    name: 'Tailoring & fashion',
    entityType: 'service',
    icon: 'Gem',
    description: 'Custom tailoring, designer blouse stitching, embroidery & boutique styling',
    listingCount: 16,
    subcategories: [
      'Tailoring', 'Alterations', 'Blouse stitching',
      'Embroidery', 'Boutique services', 'Costume rental', 'Fashion styling'
    ],
    customFields: [
      { id: 'f-71', key: 'stitchingTurnaround', label: 'Stitching Delivery Speed', type: 'select', options: ['24-Hour Urgent', '3-5 Days Standard', '7 Days Designer'] },
      { id: 'f-72', key: 'doorstepMeasurement', label: 'Doorstep Measurement Visit', type: 'boolean' }
    ]
  },
  {
    id: 'cat-33',
    name: 'Business & professional services',
    entityType: 'b2b',
    icon: 'FileText',
    description: 'Accounting, tax filing (GST/ITR), business registration, legal & printing',
    listingCount: 22,
    subcategories: [
      'Accounting', 'Bookkeeping', 'Tax filing',
      'Business registration assistance', 'Legal consultation', 'Document translation', 'Printing'
    ],
    customFields: [
      { id: 'f-73', key: 'qualification', label: 'Chartered Accountant / Legal Bar Council Reg', type: 'text', placeholder: 'e.g. FCA-49102' },
      { id: 'f-74', key: 'onlineConsultation', label: 'Virtual Video Consultation Available', type: 'boolean' }
    ]
  },
  {
    id: 'cat-34',
    name: 'Digital & technology services',
    entityType: 'b2b',
    icon: 'Code',
    description: 'Web development, mobile apps, graphic design, video editing & digital marketing',
    listingCount: 33,
    subcategories: [
      'Website development', 'App development', 'Graphic design',
      'Video editing', 'Digital marketing', 'Social media management', 'IT support'
    ],
    customFields: [
      { id: 'f-75', key: 'techStack', label: 'Technology / Platforms', type: 'text', placeholder: 'e.g. React, Next.js, Flutter, Shopify, WordPress' },
      { id: 'f-76', key: 'portfolioUrl', label: 'Portfolio / GitHub Link', type: 'text', placeholder: 'https://...' }
    ]
  },
  {
    id: 'cat-35',
    name: 'Computer & mobile repair',
    entityType: 'service',
    icon: 'Laptop',
    description: 'Doorstep screen replacement, laptop chip-level repair, printer & network setup',
    listingCount: 24,
    subcategories: [
      'Mobile repair', 'Laptop repair', 'Desktop repair',
      'Printer repair', 'Network setup', 'Data recovery'
    ],
    customFields: [
      { id: 'f-77', key: 'screenWarranty', label: 'Screen / Spare Part Warranty', type: 'select', options: ['3 Months', '6 Months', '1 Year', 'Manufacturer Warranty'] },
      { id: 'f-78', key: 'onsiteFix', label: 'Repairs Done in Front of Customer', type: 'boolean' }
    ]
  },
  {
    id: 'cat-36',
    name: 'Financial & insurance services',
    entityType: 'b2b',
    icon: 'BadgePercent',
    description: 'Loan assistance, life/health insurance, claims support & financial planning',
    listingCount: 15,
    subcategories: [
      'Insurance assistance', 'Loan assistance', 'Financial planning',
      'Claims assistance through appropriately authorised providers'
    ],
    customFields: [
      { id: 'f-79', key: 'irdaReg', label: 'IRDAI / AMFI Agent Registration Code', type: 'text', placeholder: 'e.g. ARN-89211' },
      { id: 'f-80', key: 'freeComparison', label: 'Free Loan Comparison Report', type: 'boolean' }
    ]
  },
  {
    id: 'cat-37',
    name: 'Government & document assistance',
    entityType: 'service',
    icon: 'Landmark',
    description: 'Passport, certificates, Aadhaar/PAN assistance, forms & notary service',
    listingCount: 18,
    subcategories: [
      'Form filling', 'Appointment assistance', 'Certificate application help',
      'Passport application assistance', 'Photocopying', 'Scanning'
    ],
    customFields: [
      { id: 'f-81', key: 'serviceTypeGov', label: 'Document Category', type: 'select', options: ['Passport / Visa', 'Property Registry / Encumbrance', 'PAN / Aadhaar Update', 'Gazette / Legal Notary'] },
      { id: 'f-82', key: 'doorstepDocCollection', label: 'Doorstep Document Pickup', type: 'boolean' }
    ]
  },
  {
    id: 'cat-38',
    name: 'Pet care',
    entityType: 'service',
    icon: 'Dog',
    description: 'Pet grooming, boarding, dog walking, training & veterinary visits',
    listingCount: 14,
    subcategories: [
      'Pet grooming', 'Pet boarding', 'Pet walking',
      'Training', 'Veterinary appointments', 'Pet transport'
    ],
    customFields: [
      { id: 'f-83', key: 'petTypes', label: 'Accepted Pets', type: 'select', options: ['Dogs Only', 'Cats Only', 'Dogs & Cats', 'Birds & Small Pets'] },
      { id: 'f-84', key: 'cageFreeBoarding', label: 'Cage-Free Homestay Boarding', type: 'boolean' }
    ]
  },
  {
    id: 'cat-39',
    name: 'Agriculture & gardening',
    entityType: 'service',
    icon: 'Trees',
    description: 'Gardeners, landscaping, farm labor, tractor rentals & drip irrigation repairs',
    listingCount: 11,
    subcategories: [
      'Gardener', 'Landscaping', 'Tree trimming', 'Farm workers',
      'Tractor rental', 'Irrigation repair', 'Agricultural equipment repair'
    ],
    customFields: [
      { id: 'f-85', key: 'equipmentProvided', label: 'Includes Grass Cutting & Trimming Tools', type: 'boolean' },
      { id: 'f-86', key: 'organicFertilizers', label: 'Organic Manure Supply Available', type: 'boolean' }
    ]
  },
  {
    id: 'cat-40',
    name: 'Security services',
    entityType: 'b2b',
    icon: 'Shield',
    description: 'Trained security guards, bouncers, event security & gated society surveillance',
    listingCount: 13,
    subcategories: [
      'Security guards', 'Event security', 'Residential security', 'Commercial security'
    ],
    customFields: [
      { id: 'f-87', key: 'psaraCompliant', label: 'PSARA Licensed Security Agency', type: 'boolean' },
      { id: 'f-88', key: 'guardTraining', label: 'Guards Trained in Fire & First Aid', type: 'boolean' }
    ]
  },
  {
    id: 'cat-41',
    name: 'Industrial & workshop services',
    entityType: 'b2b',
    icon: 'Factory',
    description: 'Lathe machining, industrial electrical, equipment overhaul & workshop labor',
    listingCount: 8,
    subcategories: [
      'Machine repair', 'Fabrication', 'Machining',
      'Industrial electrical work', 'Equipment maintenance', 'Workshop labour'
    ],
    customFields: [
      { id: 'f-89', key: 'isoCertified', label: 'ISO 9001 Quality Standard Compliant', type: 'boolean' },
      { id: 'f-90', key: 'cncCapability', label: 'CNC & Precision Tolerances (Microns)', type: 'boolean' }
    ]
  },
  {
    id: 'cat-42',
    name: 'Waste & recycling',
    entityType: 'service',
    icon: 'Trash2',
    description: 'Scrap collection, e-waste pickup, construction debris & septic tank cleaning',
    listingCount: 12,
    subcategories: [
      'Scrap collection', 'E-waste collection', 'Recycling pickup',
      'Construction debris removal', 'Septic tank cleaning'
    ],
    customFields: [
      { id: 'f-91', key: 'weighingScale', label: 'Digital Accurate Weighing on Spot', type: 'boolean' },
      { id: 'f-92', key: 'greenCertificate', label: 'Authorized Green Disposal Certificate Issued', type: 'boolean' }
    ]
  },
  {
    id: 'cat-43',
    name: 'Sports & recreation',
    entityType: 'service',
    icon: 'Trophy',
    description: 'Sports coaching, turf & court booking, swimming & outdoor expeditions',
    listingCount: 15,
    subcategories: [
      'Sports coaching', 'Court booking', 'Turf booking',
      'Swimming classes', 'Outdoor activity guides'
    ],
    customFields: [
      { id: 'f-93', key: 'sportType', label: 'Sport Discipline', type: 'select', options: ['Cricket Turf', 'Badminton Court', 'Football Pitch', 'Swimming Pool', 'Tennis'] },
      { id: 'f-94', key: 'floodlights', label: 'Night Floodlights Available', type: 'boolean' }
    ]
  },
  {
    id: 'cat-44',
    name: 'Community & personal assistance',
    entityType: 'service',
    icon: 'Heart',
    description: 'Disability support, senior companions, shopping assistance & funeral care',
    listingCount: 10,
    subcategories: [
      'Disability support', 'Senior assistance', 'Shopping companion',
      'Relocation assistance', 'Funeral arrangements'
    ],
    customFields: [
      { id: 'f-95', key: 'wheelchairAccessible', label: 'Wheelchair / Accessibility Support', type: 'boolean' },
      { id: 'f-96', key: 'empathyCertified', label: 'Compassionate Care Verified Caretaker', type: 'boolean' }
    ]
  }
];
