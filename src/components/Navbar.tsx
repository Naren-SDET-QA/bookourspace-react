import React, { useState } from 'react';
import { 
  Search, 
  PlusCircle, 
  Bell, 
  Moon, 
  Sun, 
  ShieldCheck, 
  User, 
  Briefcase, 
  SlidersHorizontal,
  ChevronDown,
  Layers,
  X,
  Check,
  CheckCircle2,
  Trash2
} from 'lucide-react';
import { useMarketplace } from '../context/MarketplaceContext';
import { UserRole } from '../types/marketplace';

interface NavbarProps {
  onOpenPostWizard: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  activeView: 'marketplace' | 'provider_portal' | 'admin_console';
  setActiveView: (view: 'marketplace' | 'provider_portal' | 'admin_console') => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenPostWizard,
  darkMode,
  onToggleDarkMode,
  activeView,
  setActiveView,
}) => {
  const { 
    userRole, 
    setUserRole, 
    notifications, 
    markNotificationRead, 
    clearAllNotifications,
    searchQuery, 
    setSearchQuery 
  } = useMarketplace();

  const [showNotificationsDropdown, setShowNotificationsDropdown] = useState(false);
  const unreadCount = notifications.filter(n => !n.read).length;

  const handleRoleChange = (role: UserRole) => {
    setUserRole(role);
    if (role === 'admin') {
      setActiveView('admin_console');
    } else if (role === 'provider') {
      setActiveView('provider_portal');
    } else {
      setActiveView('marketplace');
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors">
      {/* Top Banner: Role Persona Switcher & Platform Notice */}
      <div className="bg-slate-950 text-white px-3 sm:px-6 py-1.5 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className="text-slate-400 font-medium hidden sm:inline">Active Mode:</span>
          <div className="inline-flex rounded-lg bg-slate-800 p-0.5 border border-slate-700">
            <button
              onClick={() => handleRoleChange('customer')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all flex items-center gap-1 ${
                userRole === 'customer'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <User className="w-3 h-3 text-purple-300" />
              <span>Customer</span>
            </button>

            <button
              onClick={() => handleRoleChange('provider')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all flex items-center gap-1 ${
                userRole === 'provider'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Briefcase className="w-3 h-3 text-emerald-300" />
              <span>Provider / Seller</span>
            </button>

            <button
              onClick={() => handleRoleChange('admin')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all flex items-center gap-1 ${
                userRole === 'admin'
                  ? 'bg-amber-500 text-slate-950 shadow-xs'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <ShieldCheck className="w-3 h-3 text-amber-950" />
              <span>Super Admin</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[11px] text-slate-400 hidden md:inline">
            44 Main Categories · Configurable Plans & Fees · Direct Booking
          </span>
          <button
            onClick={onToggleDarkMode}
            className="p-1 rounded-md hover:bg-slate-800 text-slate-300 transition-colors"
            title="Toggle theme"
          >
            {darkMode ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-slate-300" />}
          </button>
        </div>
      </div>

      {/* Main Navigation Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-3">
        {/* Logo */}
        <div 
          onClick={() => setActiveView('marketplace')}
          className="flex items-center gap-2.5 cursor-pointer shrink-0"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#4A148C] to-purple-600 flex items-center justify-center shadow-md">
            <Layers className="w-5 h-5 text-amber-300" />
          </div>
          <div>
            <div className="font-black text-lg sm:text-xl tracking-tight text-slate-900 dark:text-white flex items-center gap-1">
              <span>OmniMarket</span>
              <span className="text-[10px] bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded-full font-bold">PRO</span>
            </div>
            <div className="text-[10px] text-slate-500 font-medium">Services, Jobs, Rentals & Properties</div>
          </div>
        </div>

        {/* Universal Search Bar */}
        <div className="flex-1 max-w-xl mx-2 hidden sm:block">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search services, jobs, rentals, properties, vehicles, schools..."
              className="w-full bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 rounded-full pl-10 pr-4 py-2 text-xs sm:text-sm outline-hidden border border-slate-200 dark:border-slate-700 focus:border-purple-600 focus:ring-2 focus:ring-purple-500/20 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Actions Cluster */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Post Listing CTA Button */}
          <button
            onClick={onOpenPostWizard}
            className="bg-[#4A148C] hover:bg-purple-900 active:scale-95 text-white font-extrabold text-xs sm:text-sm px-3.5 sm:px-4 py-2 rounded-xl shadow-md flex items-center gap-1.5 transition-all"
            title="Create new listing (Service, Job, Property, Rental, School)"
          >
            <PlusCircle className="w-4 h-4 text-amber-300" />
            <span className="whitespace-nowrap">Post Listing</span>
          </button>

          {/* Quick View Switches */}
          {userRole === 'provider' && (
            <button
              onClick={() => setActiveView(activeView === 'provider_portal' ? 'marketplace' : 'provider_portal')}
              className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${
                activeView === 'provider_portal'
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-500 text-emerald-700 dark:text-emerald-300'
                  : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
              }`}
            >
              {activeView === 'provider_portal' ? 'Browse Market' : 'My Posts & Leads'}
            </button>
          )}

          {userRole === 'admin' && (
            <button
              onClick={() => setActiveView(activeView === 'admin_console' ? 'marketplace' : 'admin_console')}
              className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${
                activeView === 'admin_console'
                  ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-500 text-amber-900 dark:text-amber-200'
                  : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
              }`}
            >
              {activeView === 'admin_console' ? 'Browse Market' : 'Admin Console'}
            </button>
          )}

          {/* Notifications Bell */}
          <div className="relative">
            <button
              onClick={() => setShowNotificationsDropdown(!showNotificationsDropdown)}
              className="relative p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors"
              title="Notifications"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 text-white text-[9px] font-extrabold rounded-full flex items-center justify-center animate-pulse">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Notifications Dropdown */}
            {showNotificationsDropdown && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3 z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                  <div className="font-extrabold text-xs sm:text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Bell className="w-4 h-4 text-purple-600" />
                    <span>Notifications & Alerts</span>
                  </div>
                  {notifications.length > 0 && (
                    <button
                      onClick={clearAllNotifications}
                      className="text-[11px] text-slate-400 hover:text-red-500 flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Clear</span>
                    </button>
                  )}
                </div>

                <div className="max-h-64 overflow-y-auto space-y-2 no-scrollbar">
                  {notifications.length === 0 ? (
                    <div className="text-center py-6 text-xs text-slate-400">
                      No new notifications
                    </div>
                  ) : (
                    notifications.map(n => (
                      <div
                        key={n.id}
                        onClick={() => markNotificationRead(n.id)}
                        className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                          n.read
                            ? 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-500'
                            : 'bg-purple-50/60 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800 text-slate-800 dark:text-slate-200 font-medium'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[11px] text-purple-900 dark:text-purple-300">
                            {n.title}
                          </span>
                          <span className="text-[10px] text-slate-400">{n.time}</span>
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
                          {n.message}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
