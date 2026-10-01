/** SDK configuration — Issue #110 */

export interface ClientConfig {
  /** PromptHash backend API base URL */
  apiUrl: string;
  /** Stellar network: "testnet" | "mainnet" */
  network?: "testnet" | "mainnet";
}

export interface PromptInfo {
  id: string;
  title: string;
  image: string;
  rating: number;
  upvotes: number;
  owner: string;
  priceUSDC?: number;
}

export interface PurchaseResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

export interface VoteResult {
  success: boolean;
  upvotes: number;
}

// ─── Stellar wallet auth types (used by /api/auth/* endpoints) ───────────────

/**
 * Wallet signing result returned by @creit.tech/stellar-wallets-kit
 * signMessage / signBlob APIs.
 */
export interface WalletSignatureResult {
  /** Base64-encoded Ed25519 signature over the signed bytes. */
  signedMessage: string;
}

/**
 * Stellar account balance line shapes as returned by Horizon.
 * Mirrors the @stellar/stellar-sdk Horizon.HorizonApi.BalanceLine union.
 */
export interface NativeBalanceLine {
  asset_type: "native";
  balance: string;
}

export interface AlphaNumBalanceLine {
  asset_type: "credit_alphanum4" | "credit_alphanum12";
  asset_code: string;
  asset_issuer: string;
  balance: string;
  limit: string;
  is_authorized: boolean;
}

export type BalanceLine = NativeBalanceLine | AlphaNumBalanceLine;

/**
 * Horizon account data (minimal subset used by auth checks).
 */
export interface HorizonAccountData {
  id: string;
  sequence: string;
  balances: BalanceLine[];
}

/**
 * Asset requirement for token-gated routes.
 * Mirrors src/lib/auth/stellarAuth.ts AssetRequirement for SDK consumers.
 */
export interface SdkAssetRequirement {
  assetType: "native" | "credit_alphanum4" | "credit_alphanum12";
  issuer?: string;
  code?: string;
  minimumBalance?: number;
}

/**
 * Result of an on-chain asset balance check.
 */
export interface SdkAssetAccessResult {
  hasAccess: boolean;
  balance: string | null;
  reason?: string;
}
