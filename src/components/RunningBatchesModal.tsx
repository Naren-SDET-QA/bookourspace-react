import React, { useState, useEffect } from 'react';
import SafeImage from './SafeImage';
import {
  X,
  ExternalLink,
  Calendar,
  Clock,
  Search,
  Link2,
  Check,
  Edit3,
  BookOpen,
  PlayCircle,
  Image as ImageIcon,
  Globe,
  Table2,
  Sparkles
} from 'lucide-react';
import { MarketplaceListing } from '../types/marketplace';

export interface BatchRowItem {
  course: string;
  faculty: string;
  date: string;
  time: string;
  contentUrl?: string;
  registerUrl?: string;
  isOnlineLabel?: boolean;
}

const durgasoftBatches: BatchRowItem[] = [
  {
    course: '"DEEP WORK" Master Your Focus. Achieve More.',
    faculty: 'Mr. DURGA Sir',
    date: '7th Oct',
    time: '7:00 AM',
  },
  {
    course: 'Agentic System Design & Forward Deployment Engineering Course',
    faculty: 'Mrs. Sasmitha',
    date: '28th Oct',
    time: '6:00 AM',
  },
  {
    course: 'LINUX Administration + AWS + CCNA',
    faculty: 'Mr. Shakeel',
    date: '28th Sept',
    time: '8:00 AM',
  },
  {
    course: 'LINUX Administration',
    faculty: 'Mr. Shakeel',
    date: '28th Sept',
    time: '8:00 AM',
  },
  {
    course: 'AZURE DATA ENGINEERING with MICROSOFT FABRIC ANALYTICS (ADF + ADB with PYSPARK + SYNAPSE ANALYTICS)',
    faculty: 'Mr. N. Vijay Sunder Sagar',
    date: '28th Oct',
    time: '11:00 AM',
  },
  {
    course: 'DATA ANALYTICS with AI/ML (PYTHON + SQL + POWER BI + EXCEL + STATISTICS + AI + ML)',
    faculty: 'Mr. Venkat',
    date: '28th Sept',
    time: '7:00 PM',
  },
  {
    course: 'Cyber Security with Certified Ethical Hacking V13 with AI',
    faculty: 'Mr. Shoaib Ahmed',
    date: '28th Oct',
    time: '7:00 PM',
  },
  {
    course: 'BUSINESS ANALYTICS with AI/ML (PYTHON + SQL + POWER BI + EXCEL + STATISTICS + AI + ML)',
    faculty: 'Mr. Venkat',
    date: '28th Sept',
    time: '7:00 PM',
  },
  {
    course: 'SALESFORCE.COM with AGENT FORCE (AI)',
    faculty: 'Mr. Sai',
    date: '28th Oct',
    time: '8:00 PM',
  },
  {
    course: 'CCNA + AWS + LINUX Administration',
    faculty: 'Mr. Shakeel',
    date: '28th Sept',
    time: '8:00 PM',
  },
  {
    course: 'CCNA',
    faculty: 'Mr. Shakeel',
    date: '28th Sept',
    time: '8:00 PM',
  },
  {
    course: 'JAVA FULL STACK (CORE JAVA, ADV. JAVA, SPRING, SPRING BOOT, MICROSERVICES, HIBERNATE, UI Technologies, ORACLE 19c)',
    faculty: 'Mr. Nageswar Rao & Mr. Prakash Babu',
    date: '28th Oct',
    time: '9:00 PM',
  },
  {
    course: 'CORE JAVA with JAVA-8 Features & AI Integration',
    faculty: 'Mr. Nageswar Rao',
    date: '28th Oct',
    time: '9:00 PM',
  },
  {
    course: 'Full Stack Generative AI with AI Agents, Agentic AI with Hands-On Project Development & Deployment',
    faculty: 'Khan Corporate Trainer',
    date: '29th Oct',
    time: '5:30 AM',
  },
  {
    course: 'ADVANCED FULL STACK DATA SCIENCE with Projects Development & Deployment',
    faculty: 'Khan Corporate Trainer',
    date: '29th Oct',
    time: '7:00 AM',
  },
  {
    course: 'Full Stack Agentic AI Engineering & GEN AI Build & Deploy Production Level with Hands On Projects',
    faculty: 'Mr. Maha',
    date: '29th Oct',
    time: '7:00 AM',
    isOnlineLabel: true,
  },
  {
    course: 'FULL STACK PYTHON (Python (Core + Adv) / Django / Flask / REST API / FastAPI / Basics of UI / Basics of MySQL)',
    faculty: 'Mr. Mohan Reddy',
    date: '29th Oct',
    time: '7:00 AM',
  },
  {
    course: 'PYTHON with AI (CORE & ADVANCED)',
    faculty: 'Mr. Mohan Reddy',
    date: '29th Oct',
    time: '7:00 AM',
  },
  {
    course: 'SQL SERVER DBA',
    faculty: 'Mr. Praveen Madupu',
    date: '29th Oct',
    time: '8:00 PM',
  },
  {
    course: 'ORACLE 19c (SQL & PL/SQL)',
    faculty: 'Mr. Murali',
    date: '30th Oct',
    time: '9:00 PM',
  },
  {
    course: 'FULL STACK Generative AI & Agentic AI Build & Deploy Production Level AI Agents with Hands On Projects',
    faculty: 'Mr. N. Vijay Sunder Sagar',
    date: '30th Oct',
    time: '10:00 PM',
  },
  {
    course: 'ADVANCED FULL STACK DATA SCIENCE with Projects Development & Deployment (12 Weekends Batch)',
    faculty: 'Khan Corporate Trainer',
    date: '31st Oct & 1st Nov',
    time: '6:30 AM',
  },
  {
    course: 'Full Stack Generative AI with AI Agents, Agentic AI with Hands-On Project Development & Deployment (12 Weekends Batch)',
    faculty: 'Khan Corporate Trainer',
    date: '31st Oct & 1st Nov',
    time: '8:00 AM',
  },
  {
    course: 'Advanced Full Stack Python Programming with Data Structures & Algorithms (DSA), Project Development & Deployment (12 Weekends Batch)',
    faculty: 'Khan Corporate Trainer',
    date: '31st Oct & 1st Nov',
    time: '7:00 PM',
  },
  {
    course: 'FULL STACK DATA SCIENCE with Artificial Intelligence (Generative AI & Agentic AI)',
    faculty: 'Mr. N. Vijay Sunder Sagar',
    date: '2nd Nov',
    time: '6:00 AM',
  },
  {
    course: 'JENKINS, DOCKER & KUBERNETES',
    faculty: 'Mr. Chaitanya',
    date: '2nd Nov',
    time: '6:00 AM',
  },
  {
    course: 'Generative AI + Agentic AI with Real Time Project',
    faculty: 'Mr. SaiRam',
    date: '2nd Nov',
    time: '7:00 AM',
  },
  {
    course: 'SPRING BOOT & MICRO SERVICES (with AI Integration)',
    faculty: 'Mr. Anji Reddy',
    date: '2nd Nov',
    time: '7:00 AM',
  },
  {
    course: 'AZURE AI/ML & MLOPS',
    faculty: 'Mr. Sekhar Reddy',
    date: '2nd Nov',
    time: '8:45 AM',
  },
  {
    course: 'JENKINS, DOCKER & KUBERNETES',
    faculty: 'Mr. Chaitanya',
    date: '4th Nov',
    time: '7:00 AM',
  },
  {
    course: 'DEVOPS with AWS (AWS | CI/CD | GitHub Actions | Terraform | Ansible | Docker | Kubernetes | Helm | Argo CD | Observability | DevSecOps | AI Tools)',
    faculty: 'Mr. Maha',
    date: '9th Nov',
    time: '8:00 AM',
    isOnlineLabel: true,
  },
  {
    course: 'AGENTIC AI Engineering with GEN AI Foundations',
    faculty: 'Mr. Vasanth',
    date: '16th Nov',
    time: '7:30 AM',
  },
  {
    course: 'SPRING BOOT - MICROSERVICES & AI with FREE Real Time Project',
    faculty: 'Mr. Anand',
    date: '16th Nov',
    time: '10:00 PM',
  },
];

const nareshItBatches: BatchRowItem[] = [
  {
    course: 'Full Stack Data Science & AI with Generative AI & Agentic AI',
    faculty: 'Mr. Prakash Senapathi',
    date: '28th Oct',
    time: '9:00 AM',
  },
  {
    course: 'Full Stack Java Developer (Core Java, Adv Java, Spring Boot, Microservices, React)',
    faculty: 'Mr. Hari Krishna & Team',
    date: '29th Oct',
    time: '7:30 AM',
  },
  {
    course: 'Full Stack Python with Django, REST API & React JS',
    faculty: 'Mr. K.V. Rao',
    date: '29th Oct',
    time: '11:00 AM',
  },
  {
    course: 'Multi-Cloud DevOps with AWS, Azure, Docker, Kubernetes & Terraform',
    faculty: 'Mr. Veerababu',
    date: '30th Oct',
    time: '7:00 AM',
  },
  {
    course: 'Full Stack .NET Core & Angular / React Placement Assurance Batch',
    faculty: 'Mr. Bangar Raju',
    date: '30th Oct',
    time: '6:00 PM',
  },
  {
    course: 'UI Full Stack Web Development with React JS, Next.js & TypeScript',
    faculty: 'Mr. Sudhakar Sharma',
    date: '1st Nov',
    time: '5:00 PM',
  },
  {
    course: 'Software Testing (Selenium with Java, Playwright, API Testing & Tosca)',
    faculty: 'Mr. Suresh',
    date: '2nd Nov',
    time: '9:30 AM',
  },
  {
    course: 'Power BI, SQL Server & Azure Data Factory (ADF) Analytics',
    faculty: 'Mr. Vijay',
    date: '3rd Nov',
    time: '8:00 PM',
  },
  {
    course: 'C, C++ & Data Structures and Algorithms (DSA) Foundation',
    faculty: 'Mr. Kishore',
    date: '4th Nov',
    time: '4:00 PM',
  },
];

interface RunningBatchesModalProps {
  listing: MarketplaceListing | null;
  onClose: () => void;
  onUpdateBatchUrl?: (listingId: string, newUrl: string, batchImages?: string[]) => void;
  onBookBatch?: (listing: MarketplaceListing, batchCourseName?: string) => void;
}

export const RunningBatchesModal: React.FC<RunningBatchesModalProps> = ({
  listing,
  onClose,
  onUpdateBatchUrl,
  onBookBatch,
}) => {
  const initialUrl =
    listing?.runningBatchUrl ||
    String(listing?.customFieldValues?.runningBatchUrl || '') ||
    '';

  const [batchUrl, setBatchUrl] = useState(initialUrl);
  const [isEditingUrl, setIsEditingUrl] = useState(!initialUrl);
  const [urlSavedToast, setUrlSavedToast] = useState(false);
  const [searchBatch, setSearchBatch] = useState('');
  const [activeTab, setActiveTab] = useState<'table' | 'poster' | 'live_embed'>('table');
  const [uploadedBatchImages, setUploadedBatchImages] = useState<string[]>(
    listing?.batchScheduleImages || []
  );

  useEffect(() => {
    const nextUrl =
      listing?.runningBatchUrl ||
      String(listing?.customFieldValues?.runningBatchUrl || '') ||
      '';
    setBatchUrl(nextUrl);
    setIsEditingUrl(!nextUrl);
    setUploadedBatchImages(listing?.batchScheduleImages || []);
  }, [listing]);

  if (!listing) return null;

  const isNareshIt =
    /naresh/i.test(listing.title) ||
    /naresh/i.test(listing.providerName) ||
    /nareshit/i.test(batchUrl);

  const isDurgaSoft =
    /durga/i.test(listing.title) ||
    /durga/i.test(listing.providerName) ||
    /durgasoft/i.test(batchUrl) ||
    !isNareshIt;

  const activeBatchList = isNareshIt ? nareshItBatches : durgasoftBatches;

  const filteredBatches = activeBatchList.filter(
    (b) =>
      b.course.toLowerCase().includes(searchBatch.toLowerCase()) ||
      b.faculty.toLowerCase().includes(searchBatch.toLowerCase()) ||
      b.time.toLowerCase().includes(searchBatch.toLowerCase()) ||
      b.date.toLowerCase().includes(searchBatch.toLowerCase())
  );

  const handleSaveConfigUrl = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = batchUrl.trim();
    if (onUpdateBatchUrl) {
      onUpdateBatchUrl(listing.id, cleaned, uploadedBatchImages);
    }
    setIsEditingUrl(false);
    setUrlSavedToast(true);
    setTimeout(() => setUrlSavedToast(false), 2500);
  };

  const handleUploadBatchScheduleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = String(ev.target?.result || '');
        if (!dataUrl) return;
        setUploadedBatchImages((prev) => {
          const next = [dataUrl, ...prev];
          onUpdateBatchUrl?.(listing.id, batchUrl.trim(), next);
          return next;
        });
        setActiveTab('poster');
      };
      reader.readAsDataURL(file);
    });
  };

  const effectiveExternalUrl =
    batchUrl.trim() ||
    (isNareshIt
      ? 'https://nareshit.in/course-schedule/'
      : 'https://www.durgasoftonline.com/s/pages/new-batches');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-xs overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-6xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-3 max-h-[94vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Modal Header */}
        <div className="bg-[#0F172A] text-white px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#FF3300] text-white font-black flex items-center justify-center text-sm shadow-sm shrink-0">
              LIVE
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-black text-sm sm:text-lg text-white truncate">
                  {listing.providerName} — Current Running Batches
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  Hyderabad Live Schedule
                </span>
              </div>
              <p className="text-xs text-slate-300 truncate">{listing.title}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={effectiveExternalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2 rounded-xl bg-[#4338CA] hover:bg-indigo-600 text-white font-black text-xs flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Open Official Schedule Link</span>
            </a>

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Configurable Running Batch Link Bar */}
        <div className="bg-[#F8FAFC] dark:bg-slate-800/80 border-b border-[#E2E8F0] dark:border-slate-800 px-4 sm:px-6 py-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Link2 className="w-4 h-4 text-[#4338CA] shrink-0" />
              <span className="text-xs font-black text-[#0F172A] dark:text-white shrink-0">
                Configurable Batch Link:
              </span>

              {isEditingUrl ? (
                <form onSubmit={handleSaveConfigUrl} className="flex items-center gap-2 flex-1">
                  <input
                    type="url"
                    value={batchUrl}
                    onChange={(e) => setBatchUrl(e.target.value)}
                    placeholder="Paste institute running batches URL (e.g. https://www.durgasoftonline.com/s/pages/new-batches)"
                    className="flex-1 bg-white dark:bg-slate-900 border border-[#4338CA] rounded-lg px-3 py-1.5 text-xs font-semibold text-[#0F172A] dark:text-white outline-hidden"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded-lg bg-[#4338CA] hover:bg-indigo-700 text-white font-black text-xs flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Save Link</span>
                  </button>
                  {initialUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setBatchUrl(initialUrl);
                        setIsEditingUrl(false);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs cursor-pointer"
                    >
                      Cancel
                    </button>
                  )}
                </form>
              ) : (
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <a
                    href={effectiveExternalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-bold text-[#4338CA] dark:text-indigo-400 hover:underline truncate"
                  >
                    {effectiveExternalUrl}
                  </a>
                  <button
                    type="button"
                    onClick={() => setIsEditingUrl(true)}
                    className="px-2.5 py-1 rounded-lg bg-[#EEF2FF] hover:bg-indigo-100 text-[#4338CA] text-[11px] font-black flex items-center gap-1 shrink-0 cursor-pointer border border-[#4338CA]/20"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span>Change / Paste Link</span>
                  </button>
                  {urlSavedToast && (
                    <span className="text-[11px] font-black text-[#15803D] bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      ✓ Link Updated
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Quick Preset Links + Upload Schedule Image (All Formats) */}
            <div className="flex items-center gap-1.5 shrink-0 text-[11px] flex-wrap">
              <label className="px-2.5 py-1 rounded-md bg-orange-600 hover:bg-orange-700 text-white font-black flex items-center gap-1 cursor-pointer shadow-2xs">
                <ImageIcon className="w-3.5 h-3.5" />
                <span>+ Upload Image (All Formats)</span>
                <input
                  type="file"
                  multiple
                  accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.svg,.bmp,.avif,.heic,.tiff,.ico"
                  onChange={(e) => {
                    handleUploadBatchScheduleFiles(e.target.files);
                    e.target.value = '';
                  }}
                  className="hidden"
                />
              </label>
              <span className="text-[#64748B] font-bold">Presets:</span>
              <button
                type="button"
                onClick={() => {
                  const url = 'https://www.durgasoftonline.com/s/pages/new-batches';
                  setBatchUrl(url);
                  onUpdateBatchUrl?.(listing.id, url, uploadedBatchImages);
                }}
                className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 text-[#0F172A] dark:text-slate-200 hover:border-[#4338CA] font-bold cursor-pointer"
              >
                DurgaSoft Link
              </button>
              <button
                type="button"
                onClick={() => {
                  const url = 'https://nareshit.in/course-schedule/';
                  setBatchUrl(url);
                  onUpdateBatchUrl?.(listing.id, url, uploadedBatchImages);
                }}
                className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 text-[#0F172A] dark:text-slate-200 hover:border-[#4338CA] font-bold cursor-pointer"
              >
                Naresh IT Link
              </button>
            </div>
          </div>
        </div>

        {/* View Mode Tabs + Search Filter */}
        <div className="px-4 sm:px-6 py-2.5 bg-white dark:bg-slate-900 border-b border-[#E2E8F0] dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 bg-[#F8FAFC] dark:bg-slate-800 p-1 rounded-xl border border-[#E2E8F0] dark:border-slate-700">
            <button
              type="button"
              onClick={() => setActiveTab('table')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'table'
                  ? 'bg-[#4338CA] text-white shadow-2xs'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              <Table2 className="w-3.5 h-3.5" />
              <span>All Batches Schedule ({filteredBatches.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('poster')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'poster'
                  ? 'bg-[#4338CA] text-white shadow-2xs'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>
                Schedule Images & Sheet ({uploadedBatchImages.length + (isDurgaSoft ? 1 : 0)})
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('live_embed')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'live_embed'
                  ? 'bg-[#4338CA] text-white shadow-2xs'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Live Web Page Preview</span>
            </button>
          </div>

          {activeTab === 'table' && (
            <div className="flex items-center bg-[#F8FAFC] dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 rounded-xl px-3 py-1.5 w-full sm:w-72">
              <Search className="w-3.5 h-3.5 text-[#64748B] mr-2 shrink-0" />
              <input
                type="text"
                value={searchBatch}
                onChange={(e) => setSearchBatch(e.target.value)}
                placeholder="Search course, faculty, or timing..."
                className="w-full bg-transparent text-xs font-semibold text-[#0F172A] dark:text-white outline-hidden"
              />
              {searchBatch && (
                <button
                  type="button"
                  onClick={() => setSearchBatch('')}
                  className="text-slate-400 hover:text-slate-600 ml-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-white dark:bg-slate-900">
          {activeTab === 'table' && (
            <div className="space-y-4">
              {/* "All Batches" Heading matching DurgaSoft style */}
              <div className="text-center pb-2">
                <h3 className="text-2xl sm:text-3xl font-black text-[#E60000] tracking-tight">
                  All Batches
                </h3>
                <p className="text-xs text-[#64748B] mt-0.5">
                  Live Running & Upcoming Classroom / Online Batches • Click &ldquo;Register Now&rdquo; to book your demo or seat
                </p>
              </div>

              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg shadow-xs">
                <table className="w-full text-left border-collapse min-w-[760px]">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-bold uppercase text-slate-500 tracking-wider">
                      <th className="py-3 px-4 w-[38%]">COURSE</th>
                      <th className="py-3 px-4 w-[20%]">FACULTY</th>
                      <th className="py-3 px-3 w-[12%]">DATE</th>
                      <th className="py-3 px-3 w-[10%]">TIME</th>
                      <th className="py-3 px-3 w-[10%]">COURSE CONTENT</th>
                      <th className="py-3 px-4 w-[10%]">DEMO LINK</th>
                    </tr>
                  </thead>
                  <tbody className="text-xs">
                    {filteredBatches.map((batch, idx) => {
                      const isRedRow = idx % 2 === 0;
                      return (
                        <tr
                          key={idx}
                          className={
                            isRedRow
                              ? 'bg-[#FF3300] text-white font-bold'
                              : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-semibold border-b border-slate-100 dark:border-slate-800'
                          }
                        >
                          <td className="py-3.5 px-4 leading-snug">
                            {batch.course}
                          </td>
                          <td className="py-3.5 px-4">
                            {batch.faculty}
                          </td>
                          <td className="py-3.5 px-3 whitespace-nowrap">
                            {batch.date}
                          </td>
                          <td className="py-3.5 px-3 whitespace-nowrap">
                            {batch.time}
                          </td>
                          <td className="py-3.5 px-3 whitespace-nowrap">
                            <a
                              href={effectiveExternalUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`underline font-bold ${
                                isRedRow ? 'text-sky-200 hover:text-white' : 'text-[#0066CC] hover:text-blue-800'
                              }`}
                            >
                              Course Content
                            </a>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <a
                                href={effectiveExternalUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`underline font-bold ${
                                  isRedRow ? 'text-sky-200 hover:text-white' : 'text-[#0066CC] hover:text-blue-800'
                                }`}
                              >
                                Register Now
                                {batch.isOnlineLabel ? ' (Online)' : ''}
                              </a>
                              {onBookBatch && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onClose();
                                    onBookBatch(listing, batch.course);
                                  }}
                                  className={`px-2 py-0.5 rounded text-[10px] font-black cursor-pointer transition-transform active:scale-95 ${
                                    isRedRow
                                      ? 'bg-white text-[#FF3300] hover:bg-amber-100'
                                      : 'bg-[#4338CA] text-white hover:bg-indigo-700'
                                  }`}
                                >
                                  Book Seat
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'poster' && (
            <div className="flex flex-col items-center space-y-4">
              <div className="flex items-center justify-between w-full max-w-4xl flex-wrap gap-2">
                <div className="text-xs font-bold text-[#64748B]">
                  Uploaded Batch Schedule Images (All Formats: PNG, JPG, JPEG, WEBP, GIF, SVG, AVIF, BMP, HEIC, TIFF)
                </div>
                <label className="px-3 py-1.5 rounded-xl bg-[#4338CA] hover:bg-indigo-700 text-white font-black text-xs flex items-center gap-1.5 cursor-pointer shadow-xs">
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>+ Add Batch Schedule Image (Any Format)</span>
                  <input
                    type="file"
                    multiple
                    accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.svg,.bmp,.avif,.heic,.tiff,.ico"
                    onChange={(e) => {
                      handleUploadBatchScheduleFiles(e.target.files);
                      e.target.value = '';
                    }}
                    className="hidden"
                  />
                </label>
              </div>

              {uploadedBatchImages.map((imgSrc, i) => (
                <div
                  key={i}
                  className="relative w-full max-w-4xl border-2 border-indigo-300 dark:border-slate-700 rounded-xl overflow-hidden shadow-md bg-white"
                >
                  <SafeImage category="classes"
                    src={imgSrc}
                    alt={`Uploaded Batch Schedule ${i + 1}`}
                    className="w-full h-auto object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const next = uploadedBatchImages.filter((_, idx) => idx !== i);
                      setUploadedBatchImages(next);
                      onUpdateBatchUrl?.(listing.id, batchUrl.trim(), next);
                    }}
                    className="absolute top-2 right-2 px-2.5 py-1 rounded-lg bg-red-600 text-white text-xs font-black shadow-sm cursor-pointer"
                  >
                    Remove Image
                  </button>
                </div>
              ))}

              {isDurgaSoft && (
                <div className="w-full max-w-4xl border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-md bg-white">
                  <SafeImage category="classes"
                    src="/assets/optimized/classes-batches.webp"
                    alt="DurgaSoft All Batches Schedule"
                    className="w-full h-auto object-contain"
                  />
                </div>
              )}
            </div>
          )}

          {activeTab === 'live_embed' && (
            <div className="space-y-3 h-[65vh] flex flex-col">
              <div className="flex items-center justify-between bg-[#EEF2FF] dark:bg-slate-800 px-3.5 py-2 rounded-xl border border-[#4338CA]/20 text-xs">
                <div className="flex items-center gap-2 truncate">
                  <Globe className="w-4 h-4 text-[#4338CA] shrink-0" />
                  <span className="font-bold text-[#0F172A] dark:text-white truncate">
                    Loading live schedule from: {effectiveExternalUrl}
                  </span>
                </div>
                <a
                  href={effectiveExternalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1 rounded-lg bg-[#4338CA] text-white font-black text-[11px] flex items-center gap-1 shrink-0"
                >
                  <span>Open in New Tab</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <div className="flex-1 w-full rounded-xl overflow-hidden border border-[#E2E8F0] dark:border-slate-700 bg-slate-50">
                <iframe
                  src={effectiveExternalUrl}
                  title={`${listing.providerName} Running Batches`}
                  className="w-full h-full border-0"
                  sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
