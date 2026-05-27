import { AuditLog, AuditAction, AuditResult } from "../models/AuditLog";

export interface AuditEventParams {
  action: AuditAction;
  result: AuditResult;
  promptId?: string | null;
  walletAddress?: string | null;
  requestId?: string | null;
  clientIp?: string | null;
  reason?: string | null;
}

/**
 * Persist a structured audit event. Sensitive values (plaintext, keys,
 * signatures, challenge secrets) must NEVER be passed here.
 *
 * Fire-and-forget: errors are logged to stderr but never propagate to callers
 * so a DB hiccup cannot block a legitimate unlock.
 */
export async function recordAuditEvent(params: AuditEventParams): Promise<void> {
  try {
    await AuditLog.create({
      action: params.action,
      result: params.result,
      promptId: params.promptId ?? null,
      walletAddress: params.walletAddress ? params.walletAddress.toLowerCase() : null,
      requestId: params.requestId ?? null,
      clientIp: params.clientIp ?? null,
      reason: params.reason ?? null,
    });
  } catch (err) {
    // Do not let audit failures surface to callers.
    console.error("[audit] Failed to write audit event", { action: params.action, err });
  }
}

/**
 * Query audit events for incident review. Returns the most recent `limit`
 * events matching the filter, oldest-first within the result set.
 */
export async function queryAuditEvents(filter: {
  walletAddress?: string;
  promptId?: string;
  action?: AuditAction;
  result?: AuditResult;
  since?: Date;
  until?: Date;
  limit?: number;
}) {
  const query: Record<string, unknown> = {};

  if (filter.walletAddress) query.walletAddress = filter.walletAddress.toLowerCase();
  if (filter.promptId) query.promptId = filter.promptId;
  if (filter.action) query.action = filter.action;
  if (filter.result) query.result = filter.result;
  if (filter.since || filter.until) {
    query.createdAt = {} as Record<string, Date>;
    if (filter.since) (query.createdAt as Record<string, Date>)["$gte"] = filter.since;
    if (filter.until) (query.createdAt as Record<string, Date>)["$lte"] = filter.until;
  }

  return AuditLog.find(query)
    .sort({ createdAt: -1 })
    .limit(filter.limit ?? 100)
    .lean();
}
