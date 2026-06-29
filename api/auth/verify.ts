/**
 * POST /api/auth/verify
 *
 * Verifies a Stellar wallet signature against a previously-issued nonce,
 * then issues a JWT bound to that Stellar public key.
 *
 * Expected request body:
 *   { address: string, nonce: string, signature: string }
 *
 * Where `signature` is the base64-encoded Ed25519 signature produced by the
 * wallet over the exact challenge message built by buildAuthChallengeMessage().
 *
 * On success:
 *  - Sets an HTTP-only, Secure, SameSite=Strict cookie "auth_token"
 *  - Returns { token, address, expiresAt } in the response body
 *    (token is also available for clients that prefer header-based auth)
 *
 * Security properties:
 *  - Nonce is consumed on first use (replay prevention)
 *  - Signature verified with stellar-sdk Keypair.verify()
 *  - Challenge message is reconstructed server-side (never trusted from client)
 *  - Rate-limited per IP and per wallet address
 */

import { Keypair } from "@stellar/stellar-sdk";
import { Buffer } from "buffer";
import { withObservability } from "../../src/lib/observability/wrapper";
import { checkRateLimit } from "../../src/lib/observability/rateLimiter";
import { apiError, ErrorCode } from "../../src/lib/api/errorCodes";
import { buildAuthChallengeMessage } from "../../src/lib/auth/stellarAuth";
import {
  consumeNonce,
  isValidStellarAddress,
  NONCE_TTL_MS,
} from "../../src/lib/auth/nonceStore";
import { issueJwt, JWT_TTL_SECONDS } from "../../src/lib/auth/jwt";

/** Cookie name used for the HTTP-only session token. */
export const AUTH_COOKIE_NAME = "auth_token";

// ─── Signature verification ───────────────────────────────────────────────────

function verifyStellarSignature(
  address: string,
  message: string,
  signatureBase64: string,
): boolean {
  try {
    const keypair = Keypair.fromPublicKey(address);
    return keypair.verify(
      Buffer.from(message, "utf8"),
      Buffer.from(signatureBase64, "base64"),
    );
  } catch {
    return false;
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json(apiError(ErrorCode.METHOD_NOT_ALLOWED, "Method not allowed."));
    return;
  }

  const clientIp = (req.headers["x-forwarded-for"] || req.socket?.remoteAddress) as string;
  const { address, nonce, signature } = req.body ?? {};

  // Input validation
  if (!address || !nonce || !signature) {
    res
      .status(400)
      .json(apiError(ErrorCode.MISSING_FIELDS, "address, nonce, and signature are required."));
    return;
  }

  if (!isValidStellarAddress(String(address))) {
    res
      .status(400)
      .json(apiError(ErrorCode.MISSING_FIELDS, "address must be a valid Stellar public key."));
    return;
  }

  // Rate limit by IP (unauthenticated, strictest bucket)
  const ipLimit = await checkRateLimit("challenge", clientIp, false);
  if (!ipLimit.success) {
    res.setHeader("X-RateLimit-Limit", ipLimit.limit);
    res.setHeader("X-RateLimit-Remaining", 0);
    res.setHeader("X-RateLimit-Reset", ipLimit.reset);
    res
      .status(429)
      .json(
        apiError(ErrorCode.RATE_LIMIT_IP, "Too many requests. Please try again later.", {
          reset: ipLimit.reset,
        }),
      );
    return;
  }

  // Rate limit by wallet address
  const walletLimit = await checkRateLimit("challenge", String(address), false);
  if (!walletLimit.success) {
    res.setHeader("X-RateLimit-Limit", walletLimit.limit);
    res.setHeader("X-RateLimit-Remaining", 0);
    res.setHeader("X-RateLimit-Reset", walletLimit.reset);
    res
      .status(429)
      .json(
        apiError(
          ErrorCode.RATE_LIMIT_WALLET,
          "Too many verification attempts from this wallet.",
          { reset: walletLimit.reset },
        ),
      );
    return;
  }

  // Consume the nonce — atomic: returns null if expired, not found, or already used
  const storedNonce = await consumeNonce(String(nonce));
  if (!storedNonce) {
    req.logger?.warn(
      { address: String(address).slice(0, 8) + "..." },
      "Auth verify: nonce invalid or expired",
    );
    res
      .status(401)
      .json(
        apiError(
          ErrorCode.CHALLENGE_EXPIRED,
          "The authentication nonce has expired or is invalid. Please request a new one.",
        ),
      );
    return;
  }

  // Confirm the nonce was issued for this address (prevents cross-address replay)
  if (storedNonce.address !== String(address)) {
    req.logger?.warn(
      { address: String(address).slice(0, 8) + "..." },
      "Auth verify: nonce/address mismatch",
    );
    res
      .status(401)
      .json(apiError(ErrorCode.CHALLENGE_INVALID, "Nonce was not issued for this address."));
    return;
  }

  // Reconstruct the challenge message server-side (never trust client)
  const message = buildAuthChallengeMessage({
    address: storedNonce.address,
    nonce: String(nonce),
    domain: storedNonce.domain,
    issuedAt: storedNonce.issuedAt,
  });

  // Cryptographic signature verification
  const valid = verifyStellarSignature(String(address), message, String(signature));
  if (!valid) {
    req.logger?.warn(
      { address: String(address).slice(0, 8) + "..." },
      "Auth verify: signature verification failed",
    );
    res
      .status(401)
      .json(apiError(ErrorCode.INVALID_SIGNATURE, "Wallet signature verification failed."));
    return;
  }

  // Issue JWT
  const token = issueJwt(String(address));
  const expiresAt = Date.now() + JWT_TTL_SECONDS * 1000;

  // Set HTTP-only cookie (the primary session mechanism)
  const isProduction = process.env.NODE_ENV === "production";
  res.setHeader(
    "Set-Cookie",
    [
      `${AUTH_COOKIE_NAME}=${token}`,
      "HttpOnly",
      isProduction ? "Secure" : "",
      "SameSite=Strict",
      `Path=/`,
      `Max-Age=${JWT_TTL_SECONDS}`,
    ]
      .filter(Boolean)
      .join("; "),
  );

  req.logger?.info(
    { address: String(address).slice(0, 8) + "..." },
    "Auth verify: JWT issued",
  );

  // Also return token in body for clients that prefer Bearer auth
  res.status(200).json({
    token,
    address: String(address),
    expiresAt,
  });
}

export default withObservability(handler, "auth/verify");
