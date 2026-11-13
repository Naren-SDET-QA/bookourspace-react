import React from 'react';
import {
  X,
  Bell,
  Zap,
  Check,
  Clock,
  MapPin,
  Phone,
  AlertTriangle,
  CheckCircle2,
  Plus
} from 'lucide-react';
import { RealtimeNotification, LanguageCode } from '../types';
import { translations } from '../utils/translations';
import { playAlertChime } from '../utils/audio';

interface NotificationsCenterProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: RealtimeNotification[];
  currentLang: LanguageCode;
  onAcceptRequest: (id: string) => void;
  onDeclineRequest: (id: string) => void;
  onSimulateUrgentRequest: () => void;
}

export const NotificationsCenter: React.FC<NotificationsCenterProps> = ({
  isOpen,
  onClose,
  notifications,
  currentLang,
  onAcceptRequest,
  onDeclineRequest,
  onSimulateUrgentRequest,
}) => {
  const t = translations[currentLang];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-md h-full bg-white dark:bg-slate-900 shadow-2xl flex flex-col justify-between border-l border-slate-200 dark:border-slate-800 animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-purple-50 dark:bg-purple-950/40">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#4A148C] text-white flex items-center justify-center shadow-xs">
              <Bell className="w-4 h-4 text-amber-300" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white">
                {t.realtimeAlerts}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Live service requests & alerts
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Quick Simulation Action Bar */}
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-2xl p-3 flex items-center justify-between gap-2">
            <div>
              <div className="text-xs font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                <span>Test Live Alerts</span>
              </div>
              <div className="text-[10px] text-amber-700 dark:text-amber-400">
                Trigger incoming worker request with chime sound
              </div>
            </div>

            <button
              onClick={() => {
                playAlertChime('urgent');
                onSimulateUrgentRequest();
              }}
              className="px-2.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold shrink-0 shadow-xs flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Simulate</span>
            </button>
          </div>

          {/* List of alerts */}
          {notifications.length === 0 ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <Bell className="w-8 h-8 mx-auto stroke-1" />
              <p className="text-xs">No notifications right now.</p>
            </div>
          ) : (
            notifications.map((notif) => {
              const isUrgent = notif.type === 'urgent_request';
              return (
                <div
                  key={notif.id}
                  className={`rounded-2xl p-3.5 sm:p-4 border transition-all ${
                    isUrgent
                      ? 'bg-red-50/60 dark:bg-red-950/30 border-red-200 dark:border-red-900'
                      : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      {isUrgent ? (
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-purple-500" />
                      )}
                      <h4 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                        {notif.title}
                      </h4>
                    </div>
                    <span className="text-[10px] text-slate-400 whitespace-nowrap">
                      {notif.time}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed">
                    {notif.message}
                  </p>

                  {/* If actionable urgent request */}
                  {notif.actionRequired && notif.requestData && (
                    <div className="mt-2.5 p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-red-100 dark:border-red-900/50 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between text-slate-700 dark:text-slate-300 font-semibold">
                        <span>Customer: {notif.requestData.clientName}</span>
                        <span className="text-red-600 font-bold">{notif.requestData.rate}</span>
                      </div>
                      <div className="flex items-center gap-1 text-slate-500 text-[11px]">
                        <MapPin className="w-3 h-3 text-red-500 shrink-0" />
                        <span className="truncate">{notif.requestData.location} ({notif.requestData.distance})</span>
                      </div>

                      <div className="pt-2 flex items-center gap-2">
                        <button
                          onClick={() => {
                            playAlertChime('confirm');
                            onAcceptRequest(notif.id);
                          }}
                          className="flex-1 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>{t.accept}</span>
                        </button>
                        <button
                          onClick={() => onDeclineRequest(notif.id)}
                          className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-semibold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          {t.decline}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 text-center">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 font-bold text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Close Notifications
          </button>
        </div>
      </div>
    </div>
  );
};
