// Revshare resource for SaaS platforms. Surfaces the adapted
// endpoints under /api/v1/merchant/revshare/*. Configuration changes go
// through a proposal workflow; reporting endpoints expose earnings,
// rewards, payouts, and reconciliation findings.

import type { HttpTransport } from '../../transport/httpTransport.js';
import type { RequestOptions } from '../../types/common.js';
import type {
  ConfigProposal,
  EnterpriseMerchantConfig,
  GetEarningsOptions,
  ListConfigHistoryOptions,
  ListPayoutsOptions,
  ListProposalsOptions,
  ListRewardsOptions,
  PaginatedPlatform,
  PreviewConfigInput,
  PreviewConfigResponse,
  ProposeConfigChangeInput,
  ReconciliationFinding,
  RevshareEarnings,
  RevsharePayout,
  RevshareReward,
  RevshareWebhookTestResult
} from './types.js';

const BASE = '/api/v1/merchant/revshare';

export class RevshareResource {
  constructor(private readonly http: HttpTransport) {}

  /**
   * Returns the active revshare configuration for the calling SaaS platform.
   *
   * @param opts - Per-request transport overrides.
   * @returns The current EnterpriseMerchantConfig with split percentages, payout schedule, and version.
   */
  async getConfig(opts: RequestOptions = {}): Promise<EnterpriseMerchantConfig> {
    return this.http.request<EnterpriseMerchantConfig>(
      { method: 'GET', path: `${BASE}/config` },
      opts
    );
  }

  /**
   * Lists historical revshare configurations.
   *
   * @param opts - Pagination: `limit` and `cursor`.
   * @param requestOpts - Per-request transport overrides.
   * @returns A page of past configurations ordered newest-first.
   */
  async getConfigHistory(
    opts: ListConfigHistoryOptions = {},
    requestOpts: RequestOptions = {}
  ): Promise<PaginatedPlatform<EnterpriseMerchantConfig>> {
    const raw = await this.http.request<unknown>(
      {
        method: 'GET',
        path: `${BASE}/config/history`,
        query: { limit: opts.limit, cursor: opts.cursor }
      },
      requestOpts
    );
    return normalizePlatformPage<EnterpriseMerchantConfig>(raw, opts.limit, 'versions');
  }

  /**
   * Previews the financial impact of a proposed config change without applying it.
   *
   * Useful before submitting a proposal to surface revenue deltas to the
   * platform owner.
   *
   * @param input - Hypothetical config + the window to simulate.
   * @param opts - Per-request transport overrides.
   * @returns Projected earnings deltas vs. the current config.
   */
  async previewConfig(
    input: PreviewConfigInput,
    opts: RequestOptions = {}
  ): Promise<PreviewConfigResponse> {
    return this.http.request<PreviewConfigResponse>(
      { method: 'POST', path: `${BASE}/config/preview`, body: input },
      opts
    );
  }

  /**
   * Submits a config-change proposal.
   *
   * Small changes may be auto-applied; material changes go through an
   * admin-approval workflow. Inspect `autoApplied` on the result.
   *
   * @param input - Proposed config delta + justification text.
   * @param opts - Per-request transport overrides.
   * @returns Proposal id and initial status.
   */
  async createProposal(
    input: ProposeConfigChangeInput,
    opts: RequestOptions = {}
  ): Promise<{ proposalId: string; status: string; autoApplied: boolean }> {
    return this.http.request<{
      proposalId: string;
      status: string;
      autoApplied: boolean;
    }>(
      { method: 'POST', path: `${BASE}/config/proposals`, body: input },
      opts
    );
  }

  /**
   * Lists revshare config proposals.
   *
   * @param opts - Filters: `status`, pagination `limit` and `cursor`.
   * @param requestOpts - Per-request transport overrides.
   * @returns A page of proposals ordered newest-first.
   */
  async listProposals(
    opts: ListProposalsOptions = {},
    requestOpts: RequestOptions = {}
  ): Promise<PaginatedPlatform<ConfigProposal>> {
    const raw = await this.http.request<unknown>(
      {
        method: 'GET',
        path: `${BASE}/config/proposals`,
        query: {
          status: opts.status,
          limit: opts.limit,
          cursor: opts.cursor
        }
      },
      requestOpts
    );
    return normalizePlatformPage<ConfigProposal>(raw, opts.limit, 'proposals');
  }

  /**
   * Fetches a single proposal by id.
   *
   * @param proposalId - Proposal identifier.
   * @param opts - Per-request transport overrides.
   * @returns The proposal record with status, payload, reviewer history.
   * @throws NotFoundError when the proposal id is unknown.
   */
  async getProposal(proposalId: string, opts: RequestOptions = {}): Promise<ConfigProposal> {
    return this.http.request<ConfigProposal>(
      {
        method: 'GET',
        path: `${BASE}/config/proposals/${encodeURIComponent(proposalId)}`
      },
      opts
    );
  }

  /**
   * Withdraws a proposal before it is approved or rejected.
   *
   * Idempotent: withdrawing a previously withdrawn proposal returns the
   * same response.
   *
   * @param proposalId - Proposal identifier.
   * @param opts - Per-request transport overrides.
   * @returns `{ status: 'withdrawn' }`.
   */
  async withdrawProposal(
    proposalId: string,
    opts: RequestOptions = {}
  ): Promise<{ status: 'withdrawn' }> {
    return this.http.request<{ status: 'withdrawn' }>(
      {
        method: 'POST',
        path: `${BASE}/config/proposals/${encodeURIComponent(proposalId)}/withdraw`
      },
      opts
    );
  }

  /**
   * Returns aggregated revshare earnings for a date range.
   *
   * @param opts - Filters: `from`, `to` (ISO timestamps), `currency`.
   * @param requestOpts - Per-request transport overrides.
   * @returns Earnings totals and per-bucket breakdown.
   */
  async getEarnings(
    opts: GetEarningsOptions = {},
    requestOpts: RequestOptions = {}
  ): Promise<RevshareEarnings> {
    return this.http.request<RevshareEarnings>(
      {
        method: 'GET',
        path: `${BASE}/earnings`,
        query: { from: opts.from, to: opts.to, currency: opts.currency }
      },
      requestOpts
    );
  }

  /**
   * Lists per-trade revshare rewards.
   *
   * @param opts - Filters: `status`, `from`, `to`, pagination `limit` and `cursor`.
   * @param requestOpts - Per-request transport overrides.
   * @returns A page of reward records ordered newest-first.
   */
  async listRewards(
    opts: ListRewardsOptions = {},
    requestOpts: RequestOptions = {}
  ): Promise<PaginatedPlatform<RevshareReward>> {
    // Per-trade rewards live under the /earnings sub-tree on the
    // merchant-service; the route is mounted at
    // /api/v1/merchant/revshare/earnings/rewards. Keeping the path here
    // aligned with the server mount so SaaS integrators do not have to
    // discover the extra /earnings segment by trial and error.
    const raw = await this.http.request<unknown>(
      {
        method: 'GET',
        path: `${BASE}/earnings/rewards`,
        query: {
          status: opts.status,
          from: opts.from,
          to: opts.to,
          limit: opts.limit,
          cursor: opts.cursor
        }
      },
      requestOpts
    );
    return normalizePlatformPage<RevshareReward>(raw, opts.limit, 'rewards');
  }

  /**
   * Lists revshare payout batches.
   *
   * @param opts - Filters: `status`, `from`, `to`, pagination `limit` and `cursor`.
   * @param requestOpts - Per-request transport overrides.
   * @returns A page of payout records ordered newest-first.
   */
  async listPayouts(
    opts: ListPayoutsOptions = {},
    requestOpts: RequestOptions = {}
  ): Promise<PaginatedPlatform<RevsharePayout>> {
    const raw = await this.http.request<unknown>(
      {
        method: 'GET',
        path: `${BASE}/payouts`,
        query: {
          status: opts.status,
          from: opts.from,
          to: opts.to,
          limit: opts.limit,
          cursor: opts.cursor
        }
      },
      requestOpts
    );
    return normalizePlatformPage<RevsharePayout>(raw, opts.limit, 'payouts');
  }

  /**
   * Fetches a single payout batch by id.
   *
   * @param payoutId - Payout batch identifier.
   * @param opts - Per-request transport overrides.
   * @returns The payout record with line items and settlement state.
   * @throws NotFoundError when the payout id is unknown.
   */
  async getPayout(payoutId: string, opts: RequestOptions = {}): Promise<RevsharePayout> {
    return this.http.request<RevsharePayout>(
      {
        method: 'GET',
        path: `${BASE}/payouts/${encodeURIComponent(payoutId)}`
      },
      opts
    );
  }

  /**
   * Returns open reconciliation findings against revshare books.
   *
   * Each finding is a discrepancy between ledger sub-totals and the
   * commission engine's expected splits. Investigate any non-empty result.
   *
   * @param opts - Per-request transport overrides.
   * @returns Array of reconciliation findings (empty when books balance).
   */
  async getReconciliation(opts: RequestOptions = {}): Promise<ReconciliationFinding[]> {
    return this.http.request<ReconciliationFinding[]>(
      { method: 'GET', path: `${BASE}/reconciliation` },
      opts
    );
  }

  /**
   * Sends a synthetic revshare webhook to the configured URL.
   *
   * Useful to validate signature verification on the consumer side.
   *
   * @param opts - Per-request transport overrides.
   * @returns Delivery result with status code and response body.
   */
  async testWebhook(opts: RequestOptions = {}): Promise<RevshareWebhookTestResult> {
    return this.http.request<RevshareWebhookTestResult>(
      { method: 'POST', path: `${BASE}/webhooks/test` },
      opts
    );
  }
}

// The merchant API answers each list under the name of what it holds,
// for example { rewards, hasMore, nextCursor }.
type PlatformPageKey = 'versions' | 'proposals' | 'rewards' | 'payouts';

// The body is read as unknown because the service shape is not the SDK page,
// so every field is checked before it is used.
function normalizePlatformPage<T>(
  raw: unknown,
  requestedLimit: number | undefined,
  key: PlatformPageKey
): PaginatedPlatform<T> {
  if (Array.isArray(raw)) {
    const items = raw as T[];
    const hasMore = requestedLimit !== undefined ? items.length >= requestedLimit : false;
    return { items, hasMore };
  }
  const body: Record<string, unknown> =
    raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const named = body[key];
  const items = Array.isArray(named)
    ? (named as T[])
    : Array.isArray(body.items)
      ? (body.items as T[])
      : [];
  return {
    items,
    hasMore: body.hasMore === true,
    // The service sends null on the last page, so only a string is a cursor
    // and a walk stops on undefined.
    nextCursor: typeof body.nextCursor === 'string' ? body.nextCursor : undefined
  };
}
