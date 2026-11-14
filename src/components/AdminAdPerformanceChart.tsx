import { BarChart3 } from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import type { AdminAdCampaign } from '../utils/adminEnterpriseStore';

export function AdminAdPerformanceChart({ ads }: { ads: AdminAdCampaign[] }) {
  const data = ads.map((campaign) => ({
    name: campaign.campaignName.length > 18
      ? `${campaign.campaignName.slice(0, 18)}…`
      : campaign.campaignName,
    impressions: campaign.impressions,
    clicks: campaign.clicks,
    conversionRate: campaign.impressions > 0
      ? Number(((campaign.clicks / campaign.impressions) * 100).toFixed(2))
      : 0,
  }));

  return (
    <section className="space-y-3 rounded-2xl border border-teal-200 bg-gradient-to-br from-indigo-50/50 via-white to-purple-50/40 p-4 dark:border-teal-900/60 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/30 sm:p-5" aria-labelledby="admin-ad-performance-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-black uppercase text-teal-700 dark:bg-indigo-950 dark:text-teal-300">
            <BarChart3 className="h-3 w-3" aria-hidden="true" /> Recharts Visual Analytics
          </span>
          <h4 id="admin-ad-performance-title" className="mt-0.5 text-sm font-black text-slate-900 dark:text-white">
            Active Ad Campaign Performance — Impressions, Clicks &amp; Conversion Rate (%)
          </h4>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold" aria-label="Chart legend">
          <span className="inline-flex items-center gap-1 text-teal-700"><span className="inline-block h-2.5 w-2.5 rounded-xs bg-teal-600" /> Impressions</span>
          <span className="inline-flex items-center gap-1 text-emerald-600"><span className="inline-block h-2.5 w-2.5 rounded-xs bg-emerald-500" /> Clicks</span>
          <span className="inline-flex items-center gap-1 text-amber-600"><span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" /> Conversion Rate (%)</span>
        </div>
      </div>

      <div className="h-64 w-full" role="img" aria-label="Ad campaign impressions, clicks, and conversion rate chart">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 700 }} />
            <YAxis yAxisId="left" tick={{ fontSize: 10, fontWeight: 700 }} />
            <YAxis yAxisId="right" orientation="right" unit="%" tick={{ fontSize: 10, fontWeight: 700 }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 700 }} />
            <Bar yAxisId="left" dataKey="impressions" name="Impressions" fill="#4f46e5" radius={[6, 6, 0, 0]} />
            <Bar yAxisId="left" dataKey="clicks" name="Clicks" fill="#10b981" radius={[6, 6, 0, 0]} />
            <Line yAxisId="right" type="monotone" dataKey="conversionRate" name="Conversion Rate (%)" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4, fill: '#f59e0b' }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
