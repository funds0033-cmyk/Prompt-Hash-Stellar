import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  BarChart3,
  Coins,
  PackageCheck,
  ShoppingBag,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { Skeleton } from "@/components/Skeleton";
import { Badge } from "@/components/ui/badge";
import { getAllPrompts, type PromptRecord } from "@/lib/stellar/promptHashClient";
import { browserStellarConfig } from "@/lib/stellar/browserConfig";
import { stroopsToXlmString, formatPriceLabel } from "@/lib/stellar/format";

const PLATFORM_FEE_RATE = 0.05;

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  accent?: "emerald" | "cyan" | "amber" | "purple";
  description?: string;
  isLoading?: boolean;
}

function MetricCard({ title, value, icon, accent = "emerald", description, isLoading }: MetricCardProps) {
  const accentClasses: Record<string, string> = {
    emerald: "bg-emerald-500/10 text-emerald-300",
    cyan: "bg-cyan-500/10 text-cyan-300",
    amber: "bg-amber-500/10 text-amber-300",
    purple: "bg-purple-500/10 text-purple-300",
  };

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${accentClasses[accent]}`}>
            {icon}
          </div>
          <Skeleton className="h-3.5 w-24" />
        </div>
        <Skeleton className="h-8 w-16 mb-1.5" />
        {description && <Skeleton className="h-3 w-28" />}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 hover:bg-white/[0.06] transition-colors">
      <div className="flex items-center gap-3 mb-3">
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${accentClasses[accent]}`}>
          {icon}
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          {title}
        </p>
      </div>
      <p className="text-3xl font-bold tabular-nums text-white">{value}</p>
      {description && (
        <p className="mt-1 text-xs text-slate-500">{description}</p>
      )}
    </div>
  );
}

interface TopPromptRowProps {
  rank: number;
  prompt: PromptRecord;
}

function TopPromptRow({ rank, prompt }: TopPromptRowProps) {
  const xlm = Number(stroopsToXlmString(prompt.priceStroops));
  const revenue = (xlm * prompt.salesCount * (1 - PLATFORM_FEE_RATE)).toFixed(2);

  return (
    <div className="flex items-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <span className="w-5 shrink-0 text-center text-sm font-bold text-slate-600">
        {rank}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{prompt.title}</p>
        <p className="text-xs text-slate-500">{prompt.category}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold text-white">{prompt.salesCount} sales</p>
        <p className="text-xs text-slate-500">{revenue} XLM net</p>
      </div>
      <Badge
        className={
          prompt.active
            ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
            : "border-slate-400/20 bg-slate-400/10 text-slate-400"
        }
      >
        {prompt.active ? "Active" : "Paused"}
      </Badge>
    </div>
  );
}

interface CreatorDashboardProps {
  walletAddress: string;
}

export function CreatorDashboard({ walletAddress }: CreatorDashboardProps) {
  const { data: allPrompts = [], isLoading, isError } = useQuery({
    queryKey: ["creator-dashboard", walletAddress],
    queryFn: () => getAllPrompts(browserStellarConfig),
    staleTime: 30_000,
    enabled: Boolean(walletAddress),
  });

  const prompts = useMemo(
    () => allPrompts.filter((p) => p.creator === walletAddress),
    [allPrompts, walletAddress],
  );

  const metrics = useMemo(() => {
    const active = prompts.filter((p) => p.active).length;
    const totalSales = prompts.reduce((sum, p) => sum + p.salesCount, 0);
    const grossRevenue = prompts.reduce(
      (sum, p) => sum + Number(stroopsToXlmString(p.priceStroops)) * p.salesCount,
      0,
    );
    const platformFees = grossRevenue * PLATFORM_FEE_RATE;
    const netRevenue = grossRevenue - platformFees;
    const topPrompts = [...prompts]
      .sort((a, b) => b.salesCount - a.salesCount)
      .slice(0, 5);

    return { active, totalSales, grossRevenue, platformFees, netRevenue, topPrompts };
  }, [prompts]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <MetricCard
              key={i}
              title="Loading"
              value="—"
              icon={<BarChart3 className="h-4 w-4" />}
              isLoading
            />
          ))}
        </div>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl border border-white/5 bg-white/[0.02]" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-rose-400/20 bg-rose-400/[0.05] p-6 text-center">
        <p className="text-sm font-medium text-rose-300">Failed to load creator metrics</p>
        <p className="mt-1 text-xs text-slate-400">Could not read listing data from the contract.</p>
      </div>
    );
  }

  if (prompts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400/10 text-amber-200">
          <BarChart3 className="h-6 w-6" />
        </div>
        <h3 className="mt-4 text-base font-semibold text-white">No listings yet</h3>
        <p className="mt-1.5 text-sm text-slate-400">
          Create your first encrypted prompt to start tracking performance, revenue, and sales.
        </p>
        <Link
          to="/sell"
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-amber-400/10 px-4 py-2 text-sm font-semibold text-amber-200 hover:bg-amber-400/20 transition-colors"
        >
          <ShoppingBag className="h-4 w-4" />
          Create a listing
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetricCard
          title="Active listings"
          value={metrics.active}
          icon={<Activity className="h-4 w-4" />}
          accent="emerald"
          description={`of ${prompts.length} total`}
        />
        <MetricCard
          title="Total sales"
          value={metrics.totalSales}
          icon={<PackageCheck className="h-4 w-4" />}
          accent="cyan"
          description="completed purchases"
        />
        <MetricCard
          title="Net revenue"
          value={`${metrics.netRevenue.toFixed(2)} XLM`}
          icon={<Coins className="h-4 w-4" />}
          accent="amber"
          description={`${(PLATFORM_FEE_RATE * 100).toFixed(0)} % platform fee deducted`}
        />
        <MetricCard
          title="Platform fees"
          value={`${metrics.platformFees.toFixed(2)} XLM`}
          icon={<TrendingUp className="h-4 w-4" />}
          accent="purple"
          description={`gross ${metrics.grossRevenue.toFixed(2)} XLM`}
        />
      </div>

      {/* Top-performing prompts */}
      {metrics.topPrompts.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-400" />
            <h3 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
              Top Performers
            </h3>
          </div>
          <div className="space-y-2">
            {metrics.topPrompts.map((prompt, i) => (
              <TopPromptRow key={prompt.id.toString()} rank={i + 1} prompt={prompt} />
            ))}
          </div>
        </div>
      )}

      {/* Pricing summary for all active listings */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
          All listings
        </h3>
        <div className="divide-y divide-white/[0.04] rounded-xl border border-white/[0.06] bg-white/[0.02]">
          {prompts.map((prompt) => (
            <div key={prompt.id.toString()} className="flex items-center gap-4 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{prompt.title}</p>
                <p className="text-xs text-slate-500">{prompt.category}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold text-white">{formatPriceLabel(prompt.priceStroops)}</p>
                <p className="text-xs text-slate-500">{prompt.salesCount} sold</p>
              </div>
              <Badge
                className={
                  prompt.active
                    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                    : "border-slate-400/20 bg-slate-400/10 text-slate-400"
                }
              >
                {prompt.active ? "Active" : "Paused"}
              </Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
