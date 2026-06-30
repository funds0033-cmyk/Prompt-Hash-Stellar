import {
  ChangeEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, Eye, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import {
  ListingQualityChecklist,
  buildChecklistItems,
} from "@/components/sell/ListingQualityChecklist";
import { CreatorOnboarding } from "@/components/sell/CreatorOnboarding";
import { PricingGuidance } from "@/components/sell/PricingGuidance";
import { TagInput } from "@/components/sell/TagInput";
import { featuredPromptTemplates } from "@/data/featuredPrompts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWallet } from "@/hooks/useWallet";
import { unlockPublicKey } from "@/lib/env";
import {
  encryptPromptPlaintext,
  wrapPromptKey,
} from "@/lib/crypto/promptCrypto";
import { isIpfsUploadConfigured, uploadCiphertextToIpfs } from "@/lib/ipfs";
import { browserStellarConfig } from "@/lib/stellar/browserConfig";
import { xlmToStroops } from "@/lib/stellar/format";
import { createPrompt } from "@/lib/stellar/promptHashClient";
import {
  LISTING_LIMITS,
  RevenueSplitFormInput,
  validateListingForm,
  validateEncryptedPayload,
} from "@/lib/validation/listing";
import { MarkdownContent } from "@/components/MarkdownContent";

const limits = {
  ...LISTING_LIMITS,
  encrypted: 4096,
  wrappedKey: 256,
};

const categories = Array.from(
  new Set(featuredPromptTemplates.map((prompt) => prompt.category)),
);

interface FormData {
  imageUrl: string;
  title: string;
  category: string;
  previewText: string;
  description: string;
  fullPrompt: string;
  priceXlm: string;
  tags: string[];
  coCreators: RevenueSplitFormInput[];
}

interface CreatePromptFormProps {
  onCreated?: () => void;
}

const DRAFT_STORAGE_PREFIX = "prompt-hash:create-draft:";

const createEmptyFormData = (): FormData => ({
  imageUrl: "",
  title: "",
  category: "",
  previewText: "",
  description: "",
  fullPrompt: "",
  priceXlm: "2",
  tags: [],
  coCreators: [],
});

const createEmptyCoCreator = (): RevenueSplitFormInput => ({
  address: "",
  sharePercent: "",
});

export function CreatePromptForm({ onCreated }: CreatePromptFormProps) {
  const navigate = useNavigate();
  const { address, signTransaction } = useWallet();
  const draftStorageKey = address ? `${DRAFT_STORAGE_PREFIX}${address}` : null;
  const draftLoadRef = useRef<string | null>(null);
  const skipNextAutosaveRef = useRef(false);
  const [formData, setFormData] = useState<FormData>(createEmptyFormData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showChecklist, setShowChecklist] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [showOnboarding] = useState(true);
  const [isFirstListing] = useState(true);
  const [descriptionTab, setDescriptionTab] = useState<"write" | "preview">("write");

  const checklistItems = buildChecklistItems(formData);
  const checklistHasFailures = checklistItems.some((item) => item.status === "fail");

  // Load draft when address changes (intentionally only depends on address)
  const initialLoadDone = useRef(false);
  useEffect(() => {
    if (initialLoadDone.current && !address) return;
    initialLoadDone.current = true;
    if (draftStorageKey) {
      try {
        const saved = sessionStorage.getItem(draftStorageKey);
        if (saved) {
          const parsed = JSON.parse(saved) as FormData;
          setFormData(parsed);
          setDraftRestored(true);
        }
      } catch {
        // ignore corrupted draft
      }
    }
    draftLoadRef.current = address ?? null;
  }, [address, draftStorageKey]);

  // Auto-save draft
  useEffect(() => {
    if (draftStorageKey && !skipNextAutosaveRef.current && draftLoadRef.current) {
      try {
        sessionStorage.setItem(draftStorageKey, JSON.stringify(formData));
        setLastSavedAt(new Date().toLocaleTimeString());
      } catch {
        // sessionStorage full — silently ignore
      }
    }
    skipNextAutosaveRef.current = false;
  }, [formData, draftStorageKey]);

  const updateField = (field: keyof FormData) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = async () => {
    const validationErrors = validateListingForm(formData);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      setShowChecklist(true);
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setSuccessMessage(null);

    try {
      const promptText = formData.fullPrompt;
      const encryptionIv = crypto.getRandomValues(new Uint8Array(12));
      const { ciphertext, key } = await encryptPromptPlaintext(promptText, encryptionIv);
      const wrappedKey = await wrapPromptKey(key, unlockPublicKey);

      const encryptionIvBase64 = btoa(String.fromCharCode(...encryptionIv));

      const useOffChain = isIpfsUploadConfigured() && ciphertext.length > limits.encrypted;
      const encryptedPayload = useOffChain
        ? await uploadCiphertextToIpfs(ciphertext)
        : ciphertext;

      const payloadValidation = validateEncryptedPayload({
        encryptedPrompt: encryptedPayload,
        wrappedKey,
        encryptionIv: encryptionIvBase64,
      });

      if (Object.keys(payloadValidation).length > 0) {
        setSubmitError("Encrypted payload validation failed. Please try again.");
        setIsSubmitting(false);
        return;
      }

      const priceInStroops = xlmToStroops(formData.priceXlm);

      await createPrompt(
        browserStellarConfig,
        {
          imageUrl: formData.imageUrl,
          title: formData.title,
          previewText: formData.previewText,
          category: formData.category,
          encryptedPrompt: encryptedPayload,
          encryptionIv: encryptionIvBase64,
          wrappedKey,
          price: priceInStroops,
        },
        address,
        signTransaction,
      );

      // Clear draft on success
      if (draftStorageKey) {
        sessionStorage.removeItem(draftStorageKey);
      }

      setSuccessMessage("Prompt created successfully! Redirecting...");
      setTimeout(() => {
        if (onCreated) onCreated();
        navigate("/profile");
      }, 1500);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create prompt listing.";
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {showOnboarding && (
        <CreatorOnboarding
          walletAddress={address}
          isFirstListing={isFirstListing}
        />
      )}

      {/* Image URL */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Image URL</label>
        <Input
          value={formData.imageUrl}
          onChange={updateField("imageUrl")}
          placeholder="https://example.com/cover.png"
          maxLength={limits.imageUrl}
        />
        {errors.imageUrl && (
          <p className="text-xs text-red-400">{errors.imageUrl}</p>
        )}
      </div>

      {/* Title */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Title</label>
        <Input
          value={formData.title}
          onChange={updateField("title")}
          placeholder="e.g. Advanced React Component Generator"
          maxLength={limits.title}
        />
        {errors.title && (
          <p className="text-xs text-red-400">{errors.title}</p>
        )}
      </div>

      {/* Category */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Category</label>
        <Select
          value={formData.category}
          onValueChange={(value) =>
            setFormData((prev) => ({ ...prev, category: value }))
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a category" />
          </SelectTrigger>
          <SelectContent>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.category && (
          <p className="text-xs text-red-400">{errors.category}</p>
        )}
      </div>

      {/* Preview Text */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Preview Text</label>
        <Textarea
          value={formData.previewText}
          onChange={updateField("previewText")}
          placeholder="A short public description shown on browse cards…"
          maxLength={limits.preview}
          rows={3}
        />
        {errors.previewText && (
          <p className="text-xs text-red-400">{errors.previewText}</p>
        )}
      </div>

      {/* Full Description */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Full Description</label>
          <button
            type="button"
            onClick={() =>
              setDescriptionTab((t) => (t === "write" ? "preview" : "write"))
            }
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200"
          >
            {descriptionTab === "write" ? (
              <>
                <Eye className="h-3 w-3" /> Preview
              </>
            ) : (
              <>
                <Pencil className="h-3 w-3" /> Edit
              </>
            )}
          </button>
        </div>
        {descriptionTab === "write" ? (
          <Textarea
            value={formData.description}
            onChange={updateField("description")}
            placeholder="Detailed description of what this prompt does…"
            rows={5}
          />
        ) : (
          <div className="min-h-[100px] rounded-lg border border-white/10 bg-white/5 p-3">
            <MarkdownContent content={formData.description || "*No description provided.*"} />
          </div>
        )}
      </div>

      {/* Full Prompt */}
      <div className="space-y-2">
        <label className="text-sm font-medium">
          Full Prompt{" "}
          <span className="text-xs text-slate-400">
            (encrypted before submission)
          </span>
        </label>
        <Textarea
          value={formData.fullPrompt}
          onChange={updateField("fullPrompt")}
          placeholder="Paste the full prompt content here…"
          maxLength={limits.fullPrompt}
          rows={8}
        />
        {errors.fullPrompt && (
          <p className="text-xs text-red-400">{errors.fullPrompt}</p>
        )}
      </div>

      {/* Price */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Price (XLM)</label>
        <Input
          value={formData.priceXlm}
          onChange={updateField("priceXlm")}
          placeholder="0.00"
          type="number"
          step="0.0000001"
          min="0"
        />
        {errors.priceXlm && (
          <p className="text-xs text-red-400">{errors.priceXlm}</p>
        )}
      </div>

      {/* Pricing Guidance */}
      <PricingGuidance priceXlm={formData.priceXlm} />

      {/* Co-creators */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Co-creators (optional)</label>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setFormData((prev) => ({
                ...prev,
                coCreators: [...prev.coCreators, createEmptyCoCreator()],
              }))
            }
            className="text-xs"
          >
            <Plus className="mr-1 h-3 w-3" /> Add co-creator
          </Button>
        </div>
        {formData.coCreators.map((coCreator, index) => (
          <div key={index} className="flex items-start gap-2">
            <div className="flex-1 space-y-1">
              <Input
                placeholder="Stellar address"
                value={coCreator.address}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    coCreators: prev.coCreators.map((c, i) =>
                      i === index ? { ...c, address: e.target.value } : c,
                    ),
                  }))
                }
              />
            </div>
            <div className="w-24 space-y-1">
              <Input
                placeholder="%"
                type="number"
                min="0"
                max="100"
                value={coCreator.sharePercent}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    coCreators: prev.coCreators.map((c, i) =>
                      i === index ? { ...c, sharePercent: e.target.value } : c,
                    ),
                  }))
                }
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() =>
                setFormData((prev) => ({
                  ...prev,
                  coCreators: prev.coCreators.filter((_, i) => i !== index),
                }))
              }
              className="mt-0.5 h-9 w-9 shrink-0"
            >
              <Trash2 className="h-4 w-4 text-red-400" />
            </Button>
          </div>
        ))}
        {errors.coCreators && (
          <p className="text-xs text-red-400">{errors.coCreators}</p>
        )}
      </div>

      {/* Tags */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Tags</label>
        <TagInput
          value={formData.tags}
          onChange={(tags) =>
            setFormData((prev) => ({ ...prev, tags }))
          }
        />
      </div>

      {/* Quality Checklist Toggle */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowChecklist((prev) => !prev)}
          className="text-xs text-slate-400"
        >
          {showChecklist ? "Hide" : "Show"} quality checklist
        </Button>
        {lastSavedAt && (
          <span className="text-xs text-slate-500">
            Draft saved at {lastSavedAt}
          </span>
        )}
      </div>

      {showChecklist && (
        <ListingQualityChecklist items={checklistItems} />
      )}

      {draftRestored && (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Previous draft restored from session storage.
        </div>
      )}

      {submitError && (
        <div className="flex items-start gap-2 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{submitError}</span>
        </div>
      )}

      {successMessage && (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {successMessage}
        </div>
      )}

      <Button
        className="w-full bg-emerald-400 text-slate-950 hover:bg-emerald-300"
        disabled={isSubmitting || (showChecklist && checklistHasFailures)}
        onClick={handleSubmit}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Encrypting and submitting...
          </>
        ) : (
          "Create prompt listing"
        )}
      </Button>
    </div>
  );
}
