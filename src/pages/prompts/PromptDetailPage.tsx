import { useContext, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  Flag,
  Hash,
  History,
  Loader2,
  LockKeyhole,
  MessageSquare,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Tag,
  TrendingUp,
  User,
} from "lucide-react";
import { Navigation } from "@/components/navigation";
import { Footer } from "@/components/footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { browserStellarConfig } from "@/lib/stellar/browserConfig";
import { getPrompt, hasAccess } from "@/lib/stellar/promptHashClient";
import { stroopsToXlmString, formatPriceLabel } from "@/lib/stellar/format";
import { copyToClipboard } from "@/lib/clipboard/secureClipboard";
import { usePageMeta } from "@/lib/seo/usePageMeta";
import { MarkdownContent } from "@/components/MarkdownContent";
import { ReviewClient } from "@/lib/reviews/reviewClient";
import { ReviewList } from "@/components/prompts/ReviewList";
import { ReviewForm } from "@/components/prompts/ReviewForm";
import { StarRating } from "@/components/prompts/StarRating";
import { ReportDialog } from "@/components/prompts/ReportDialog";
import { WalletContext } from "@/providers/WalletProvider";
import { PromptModal } from "@/pages/browse/PromptModal";

const FALLBACK_IMAGE = "/images/codeguru.png";

function summarise(text: string, max = 160): string {
  const clean = text.trim().replace(/\s+/g, " ");
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

// ─── License Option Card ───────────────────────────────────────────────────────

interface LicenseOptionProps {
  title: string;
  description: string;
  included: string[];
  highlighted?: boolean;
  badge?: string;
  price: string;
  priceNote?: string;
  onSelect: () => void;
  disabled?: boolean;
  actionLabel: string;
}

function LicenseOptionCard({
  title,
  description,
  included,
  highlighted = false,
  badge,
  price,
  priceNote,
  onSelect,
  disabled = false,
  actionLabel,
}: LicenseOptionProps) {
  return (
    <div
      className={`relative flex flex-col rounded-2xl border p-5 transition-all ${
        highlighted
          ? "border-emerald-500/40 bg-emerald-500/[0.06] ring-1 ring-emerald-500/20"
          : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
      }`}
    >
      {badge && (
        <span className="absolute -top-3 left-4 rounded-full border border-emerald-500/40 bg-emerald-500/20 px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
          {badge}
        </span>
      )}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-white">{title}</p>
          <p className="mt-0.5 text-xs text-slate-400">{description}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className={`text-lg font-black ${highlighted ? "text-emerald-400" : "text-white"} font-mono`}>
            {price}
          </p>
          {priceNote && <p className="text-[10px] text-slate-500">{priceNote}</p>}
        </div>
      </div>
      <ul className="mb-4 space-y-1.5">
        {included.map((item) => (
          <li key={item} className="flex items-center gap-2 text-xs text-slate-300">
            <Check className="h-3 w-3 shrink-0 text-emerald-400" />
            {item}
          </li>
        ))}
      </ul>
      <Button
        onClick={onSelect}
        disabled={disabled}
        className={`mt-auto h-9 w-full text-sm font-bold ${
          highlighted
            ? "bg-emerald-500 text-slate-950 hover:bg-emerald-400"
            : "border border-white/10 bg-white/5 text-white hover:bg-white/10"
        }`}
        variant="ghost"
      >
        {actionLabel}
      </Button>
    </div>
  );
}

// ─── Rating Distribution Bar ──────────────────────────────────────────────────

function RatingBar({ star, count, total }: { star: number; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-4 shrink-0 text-right text-xs text-slate-400">{star}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-amber-400 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-5 shrink-0 text-xs text-slate-500">{count}</span>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function PromptDetailPage() {
  const { id = "" } = useParams();
  const isValidId = /^\d+$/.test(id);
  const wallet = useContext(WalletContext);
  const queryClient = useQueryClient();

  const [copied, setCopied] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [showReportDialog, setShowReportDialog] = useState(false);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const {
    data: prompt,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["prompt-detail", id],
    queryFn: () => getPrompt(browserStellarConfig, BigInt(id)),
    enabled: isValidId,
  });

  const { data: reviewData, isLoading: reviewsLoading } = useQuery({
    queryKey: ["reviews", id],
    queryFn: () => ReviewClient.getReviews(id),
    enabled: isValidId,
  });

  const { data: accessData } = useQuery({
    queryKey: ["prompt-access", wallet?.address, id],
    queryFn: () => hasAccess(browserStellarConfig, wallet!.address!, BigInt(id)),
    enabled: isValidId && !!wallet?.address,
  });

  const alreadyOwned = accessData === true;

  // ── SEO ────────────────────────────────────────────────────────────────────

  const summary = prompt
    ? summarise(prompt.description ?? prompt.previewText)
    : "Discover wallet-verified AI prompts secured on the Stellar blockchain.";

  usePageMeta({
    title: prompt ? prompt.title : "Prompt Details",
    description: summary,
    ogImage: prompt?.imageUrl ?? undefined,
    type: "article",
  });

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleCopyLink = async () => {
    const link = typeof window !== "undefined" ? window.location.href : `/prompts/${id}`;
    const result = await copyToClipboard(link);
    if (result.success) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  };

  const notFound = !isValidId || isError || (!isLoading && !prompt);
  const priceXlm = prompt ? `${stroopsToXlmString(prompt.priceStroops)} XLM` : "—";
  const stats = reviewData?.stats;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#020617] text-white selection:bg-cyan-500/30">
      <Navigation />

      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Back link */}
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="mb-8 -ml-2 text-slate-400 hover:text-white"
        >
          <Link to="/browse">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to marketplace
          </Link>
        </Button>

        {/* Loading */}
        {isLoading && isValidId && (
          <div className="flex min-h-64 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.02]">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        )}

        {/* Not found */}
        {!isLoading && notFound && (
          <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center">
            <div className="max-w-sm">
              <h1 className="text-xl font-semibold text-white">Prompt not found</h1>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                This prompt may have been removed or the link is incorrect.
              </p>
              <Button
                asChild
                className="mt-5 h-9 bg-cyan-200 px-5 text-slate-950 hover:bg-cyan-100"
              >
                <Link to="/browse">
                  <ShoppingBag className="h-4 w-4" />
                  Browse marketplace
                </Link>
              </Button>
            </div>
          </div>
        )}

        {/* Main content */}
        {!isLoading && !notFound && prompt && (
          <div className="grid gap-8 lg:grid-cols-[1fr_360px]">

            {/* ── Left column ─────────────────────────────────────────────── */}
            <div className="space-y-6 min-w-0">

              {/* Hero image */}
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900">
                <div className="aspect-[1200/630] w-full overflow-hidden">
                  <img
                    src={prompt.imageUrl || FALLBACK_IMAGE}
                    alt={prompt.title}
                    className="h-full w-full object-cover"
                    onError={(e) => { e.currentTarget.src = FALLBACK_IMAGE; }}
                  />
                </div>
              </div>

              {/* Badges row */}
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border-cyan-200/30 bg-cyan-200/10 text-cyan-100">
                  <Sparkles className="mr-1 h-3 w-3" />
                  {prompt.category}
                </Badge>
                {prompt.salesCount >= 10 && (
                  <Badge className="border-none bg-emerald-500 text-slate-950 font-bold">
                    <TrendingUp className="mr-1 h-3 w-3" />
                    Best Seller
                  </Badge>
                )}
                {prompt.active ? (
                  <Badge className="border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
                    <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                    Active
                  </Badge>
                ) : (
                  <Badge className="border-white/10 bg-white/[0.04] text-slate-400">
                    Unavailable
                  </Badge>
                )}
{prompt.contentHash && (
                  <Badge className="border-amber-500/20 bg-amber-500/10 text-amber-400">
                    <ShieldCheck className="mr-1 h-3 w-3" />
                    Verified
                  </Badge>
                )}
                {alreadyOwned && (
                  <Badge className="border-blue-500/20 bg-blue-500/10 text-blue-400">
                    <Check className="mr-1 h-3 w-3" />
                    Owned
                  </Badge>
                )}
              </div>

              {/* Title + preview */}
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  {prompt.title}
                </h1>
                <p className="mt-3 text-sm leading-7 text-slate-400">
                  {prompt.previewText}
                </p>
                {prompt.description && (
                  <div className="mt-4">
                    <MarkdownContent>{prompt.description}</MarkdownContent>
                  </div>
                )}
              </div>

              {/* Quick stats */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" />
                  <Link
                    to={`/sellers/${encodeURIComponent(prompt.creator)}`}
                    className="font-mono text-slate-300 hover:text-emerald-300 transition-colors"
                  >
                    {prompt.creator.length > 12
                      ? `${prompt.creator.slice(0, 6)}…${prompt.creator.slice(-4)}`
                      : prompt.creator}
                  </Link>
                <span className="font-semibold text-white">
                  {formatPriceLabel(prompt.priceStroops)}
                </span>
                {"revision" in prompt && prompt.revision !== undefined && (
                  <span className="inline-flex items-center gap-1.5">
                    <History className="h-3.5 w-3.5" />
                    v{prompt.revision}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <ShoppingBag className="h-3.5 w-3.5" />
                  {prompt.salesCount} sold
                </span>
                {stats && stats.total > 0 && (
                  <span className="inline-flex items-center gap-1.5">
                    <StarRating rating={stats.averageRating} readonly size="sm" showCount reviewCount={stats.total} />
                  </span>
                )}
              </div>

              {/* Tags */}
              {prompt.tags && prompt.tags.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <Tag className="h-3.5 w-3.5 text-slate-500" />
                  {prompt.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-slate-300"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Tabs: Description / Reviews */}
              <Tabs defaultValue="description" className="mt-2">
                <TabsList className="w-full border border-white/10 bg-white/[0.03] p-1">
                  <TabsTrigger
                    value="description"
                    className="flex-1 data-[state=active]:bg-white/10 data-[state=active]:text-white text-slate-400"
                  >
                    Description
                  </TabsTrigger>
                  <TabsTrigger
                    value="reviews"
                    className="flex-1 data-[state=active]:bg-white/10 data-[state=active]:text-white text-slate-400"
                  >
                    Reviews {stats && stats.total > 0 ? `(${stats.total})` : ""}
                  </TabsTrigger>
                </TabsList>

                {/* Description tab */}
                <TabsContent value="description" className="mt-4 space-y-6">
                  {/* Full description or fallback */}
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
                    <p className="text-sm leading-7 text-slate-300 whitespace-pre-wrap">
                      {prompt.description ?? prompt.previewText}
                    </p>
                  </div>

                  {/* Metadata grid */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <User className="h-3 w-3 text-slate-500" />
                        <p className="text-[10px] uppercase tracking-wider text-slate-500">Creator</p>
                      </div>
                      <p className="truncate text-xs font-mono text-white" title={prompt.creator}>
                        {prompt.creator.slice(0, 8)}…{prompt.creator.slice(-4)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <ShoppingBag className="h-3 w-3 text-slate-500" />
                        <p className="text-[10px] uppercase tracking-wider text-slate-500">Sales</p>
                      </div>
                      <p className="text-sm font-bold text-white">{prompt.salesCount}</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Sparkles className="h-3 w-3 text-slate-500" />
                        <p className="text-[10px] uppercase tracking-wider text-slate-500">Category</p>
                      </div>
                      <p className="text-sm font-bold text-white">{prompt.category}</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Hash className="h-3 w-3 text-slate-500" />
                        <p className="text-[10px] uppercase tracking-wider text-slate-500">Hash</p>
                      </div>
                      <p className="truncate text-xs font-mono text-white" title={prompt.contentHash}>
                        {prompt.contentHash.slice(0, 10)}…
                      </p>
                    </div>
                  </div>

                  {/* On-chain verification note */}
                  <div className="flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-4">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    <p className="text-xs leading-relaxed text-slate-300">
                      This prompt's content hash is stored on the{" "}
                      <a
                        href="https://stellar.org"
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-400 hover:underline inline-flex items-center gap-0.5"
                      >
                        Stellar blockchain <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                      . Every purchase is a wallet-signed transaction — you own your license on-chain.
                    </p>
                  </div>
                </TabsContent>

                {/* Reviews tab */}
                <TabsContent value="reviews" className="mt-4 space-y-6">
                  {/* Rating summary */}
                  {stats && stats.total > 0 && (
                    <div className="flex flex-col gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-5 sm:flex-row sm:items-center sm:gap-8">
                      <div className="flex flex-col items-center justify-center sm:shrink-0">
                        <p className="text-5xl font-black text-white">{stats.averageRating.toFixed(1)}</p>
                        <StarRating rating={stats.averageRating} readonly size="md" />
                        <p className="mt-1 text-xs text-slate-500">{stats.total} reviews</p>
                      </div>
                      <div className="flex-1 space-y-1.5">
                        {([5, 4, 3, 2, 1] as const).map((star) => (
                          <RatingBar
                            key={star}
                            star={star}
                            count={stats.distribution[star]}
                            total={stats.total}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Write a review (purchased users) */}
                  {alreadyOwned && wallet?.address && (
                    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
                      {!showReviewForm ? (
                        <button
                          onClick={() => setShowReviewForm(true)}
                          className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
                        >
                          <MessageSquare className="h-4 w-4" />
                          Write a review
                        </button>
                      ) : (
                        <div className="space-y-3">
                          <h3 className="text-sm font-bold text-white">Share your experience</h3>
                          <ReviewForm
                            promptId={id}
                            onSubmit={async (review) => {
                              await ReviewClient.submitReview(
                                id,
                                wallet.address!,
                                review.rating,
                                review.text,
                              );
                              queryClient.invalidateQueries({ queryKey: ["reviews", id] });
                              queryClient.invalidateQueries({ queryKey: ["review-stats", id] });
                              setShowReviewForm(false);
                            }}
                            onCancel={() => setShowReviewForm(false)}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  <ReviewList reviews={reviewData?.reviews ?? []} isLoading={reviewsLoading} />
                </TabsContent>
              </Tabs>
            </div>

            {/* ── Right column (sticky purchase sidebar) ───────────────── */}
            <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">

              {/* Price card */}
              <div className="rounded-2xl border border-white/10 bg-[#0f1419] p-5">
                <p className="mb-1 text-3xl font-black text-emerald-400 font-mono">{priceXlm}</p>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">per license</p>

                <div className="mt-4 space-y-3">
                  {alreadyOwned ? (
                    <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3">
                      <Check className="h-4 w-4 shrink-0 text-emerald-400" />
                      <p className="text-sm font-semibold text-emerald-300">You own this license</p>
                    </div>
                  ) : (
                    <Button
                      onClick={() => setModalOpen(true)}
                      disabled={!prompt.active}
                      className="h-11 w-full bg-emerald-500 text-sm font-black text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
                    >
                      <LockKeyhole className="mr-2 h-4 w-4" />
                      {prompt.active ? "Purchase License" : "Unavailable"}
                    </Button>
                  )}

                  <Button
                    variant="ghost"
                    onClick={handleCopyLink}
                    className="h-9 w-full border border-white/10 text-sm text-slate-300 hover:bg-white/10 hover:text-white"
                  >
                    {copied ? (
                      <>
                        <Check className="mr-2 h-4 w-4 text-emerald-400" />
                        Link copied
                      </>
                    ) : (
                      <>
                        <Copy className="mr-2 h-4 w-4" />
                        Copy share link
                      </>
                    )}
                  </Button>
                </div>

                {/* What's included */}
                <div className="mt-5 space-y-2 border-t border-white/10 pt-4">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">What's included</p>
                  {[
                    "Full prompt content after purchase",
                    "Personal & commercial use license",
                    "On-chain ownership proof",
                    "Wallet-verified access",
                  ].map((item) => (
                    <div key={item} className="flex items-center gap-2 text-xs text-slate-300">
                      <Check className="h-3 w-3 shrink-0 text-emerald-400" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              {/* Licensing options */}
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 px-1">
                  Licensing Options
                </p>
                <LicenseOptionCard
                  title="Personal License"
                  description="For individual use and personal projects."
                  price={priceXlm}
                  priceNote="one-time"
                  highlighted
                  badge="Most popular"
                  included={[
                    "Single-user access",
                    "Personal & hobby projects",
                    "Unlimited personal usage",
                  ]}
                  onSelect={() => setModalOpen(true)}
                  disabled={!prompt.active || alreadyOwned}
                  actionLabel={alreadyOwned ? "Already owned" : "Get personal license"}
                />
                <LicenseOptionCard
                  title="Team License"
                  description="Share access across your organization."
                  price="Contact creator"
                  included={[
                    "Up to 25 team members",
                    "Commercial projects",
                    "Priority support",
                  ]}
                  onSelect={() => {
                    const origin = typeof window !== "undefined" ? window.location.origin : "";
                    window.open(`${origin}/sellers/${encodeURIComponent(prompt.creator)}`, "_blank");
                  }}
                  actionLabel="Contact creator"
                />
              </div>

              {/* Report */}
              <button
                onClick={() => setShowReportDialog(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/10 bg-red-500/[0.03] px-3 py-2 text-xs font-medium text-red-400/70 transition-colors hover:border-red-500/30 hover:bg-red-500/[0.07] hover:text-red-400"
              >
                <Flag className="h-3 w-3" />
                Report this prompt
              </button>
            </div>
          </div>
        )}
      </main>

      <Footer />

      {/* Purchase modal */}
      {prompt && (
        <PromptModal
          itemId={id}
          isOpen={modalOpen}
          onClose={() => {
            setModalOpen(false);
            queryClient.invalidateQueries({ queryKey: ["prompt-access", wallet?.address, id] });
          }}
          onRefresh={() => {
            queryClient.invalidateQueries({ queryKey: ["prompt-detail", id] });
            queryClient.invalidateQueries({ queryKey: ["prompt-access", wallet?.address, id] });
          }}
        />
      )}

      {/* Report dialog */}
      <ReportDialog
        promptId={id}
        isOpen={showReportDialog}
        onClose={() => setShowReportDialog(false)}
        userAddress={wallet?.address}
      />
    </div>
  );
}
