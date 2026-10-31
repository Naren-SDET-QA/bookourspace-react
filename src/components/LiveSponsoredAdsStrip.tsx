import React, { useState, useEffect } from 'react';
import { Sparkles, ExternalLink, Megaphone, ShieldCheck } from 'lucide-react';
import {
  AdminAdCampaign,
  AdminContentSettings,
  loadAdminAds,
  loadAdminContentSettings,
  recordAdClick,
} from '../utils/adminEnterpriseStore';

interface LiveSponsoredAdsStripProps {
  activeMarketSection: string;
  onSelectQuery?: (query: string) => void;
  onSelectSection?: (sec: any) => void;
}

export const LiveSponsoredAdsStrip: React.FC<LiveSponsoredAdsStripProps> = ({
  activeMarketSection,
  onSelectQuery,
  onSelectSection,
}) => {
  const [ads, setAds] = useState<AdminAdCampaign[]>(() => loadAdminAds());
  const [content, setContent] = useState<AdminContentSettings>(() =>
    loadAdminContentSettings()
  );

  useEffect(() => {
    const handleSync = () => {
      setAds(loadAdminAds());
      setContent(loadAdminContentSettings());
    };
    window.addEventListener('bos-admin-enterprise-updated', handleSync);
    return () =>
      window.removeEventListener('bos-admin-enterprise-updated', handleSync);
  }, []);

  if (!content.homepageSections?.showSponsoredAds) {
    return null;
  }

  const publishedAds = ads.filter(
    (ad) =>
      ad.status === 'published' &&
      (ad.targetSection === 'all' || ad.targetSection === activeMarketSection)
  );

  const activeBanners = (content.banners || []).filter(
    (b) => b.active && b.publishState === 'published'
  );

  if (publishedAds.length === 0 && activeBanners.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {/* Published Content Management Hero Banners */}
      {activeBanners.map((bnr) => (
        <div
          key={bnr.id}
          className="relative rounded-2xl overflow-hidden border border-indigo-200 dark:border-indigo-900/60 bg-gradient-to-r from-indigo-950 via-purple-950 to-slate-900 text-white p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm"
        >
          <div className="space-y-1 max-w-2xl">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black uppercase">
              <Sparkles className="w-3 h-3" />
              <span>BookOurSpace Spotlight Banner</span>
            </span>
            <h3 className="text-sm sm:text-base font-black">{bnr.title}</h3>
            <p className="text-xs text-indigo-200">{bnr.subtitle}</p>
          </div>
          {onSelectSection && (
            <button
              type="button"
              onClick={() => onSelectSection(bnr.targetSection)}
              className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs shrink-0 cursor-pointer transition"
            >
              {bnr.ctaLabel}
            </button>
          )}
        </div>
      ))}

      {/* Published Ad Management Campaigns */}
      {publishedAds.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {publishedAds.slice(0, 2).map((ad) => (
            <div
              key={ad.id}
              onClick={() => {
                recordAdClick(ad.id);
                if (ad.targetSection !== 'all' && onSelectSection) {
                  onSelectSection(ad.targetSection);
                }
                if (ad.ctaUrlOrQuery && onSelectQuery) {
                  onSelectQuery(ad.ctaUrlOrQuery);
                }
              }}
              className="group bg-white dark:bg-slate-900 border border-indigo-200/80 dark:border-slate-800 hover:border-indigo-500 rounded-2xl p-3 sm:p-3.5 shadow-xs hover:shadow-md transition-all cursor-pointer flex items-center gap-3.5"
            >
              <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden shrink-0 bg-slate-100 dark:bg-slate-800">
                <img
                  src={ad.imageUrl}
                  alt={ad.headline}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-slate-950/80 text-amber-300 text-[8px] font-black uppercase">
                  Ad
                </span>
              </div>

              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 text-[9px] font-black uppercase">
                    <Megaphone className="w-2.5 h-2.5" />
                    <span>{ad.badgeText || 'SPONSORED'}</span>
                  </span>
                  <span className="text-[10px] font-bold text-slate-400 truncate">
                    📍 {ad.targetCity}
                  </span>
                </div>

                <h4 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white line-clamp-1 group-hover:text-indigo-600 transition-colors">
                  {ad.headline}
                </h4>

                <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">
                  {ad.subheadline}
                </p>

                <div className="pt-1 flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1 truncate">
                    <ShieldCheck className="w-3 h-3 text-emerald-500 shrink-0" />
                    <span className="truncate">{ad.advertiserName}</span>
                  </span>

                  <span className="inline-flex items-center gap-1 text-[11px] font-black text-indigo-600 dark:text-indigo-400 group-hover:translate-x-0.5 transition-transform shrink-0">
                    <span>{ad.ctaText}</span>
                    <ExternalLink className="w-3 h-3" />
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
