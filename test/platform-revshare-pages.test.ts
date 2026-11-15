// The revshare list calls must return the page their signature declares for every body the merchant API sends:
// the collection under its own key, the SDK's items page, and a bare array.

import { describe, it, expect, vi, afterEach } from 'vitest';
import axios from 'axios';
import { MerchantClient } from '../src/index.js';

afterEach(() => {
  vi.restoreAllMocks();
});

// The transport reads every body as text, so each test answers with the JSON text the service would send.
function clientAnswering(body: unknown) {
  const urls: string[] = [];
  const fakeInstance = {
    request: vi.fn(async (cfg: any) => {
      urls.push(cfg.url);
      return { status: 200, headers: {}, data: JSON.stringify(body) };
    }),
    get: vi.fn(async () => ({
      data: { serverTime: Date.now(), iso: new Date().toISOString() }
    }))
  } as any;
  vi.spyOn(axios, 'create').mockReturnValue(fakeInstance);
  const client = new MerchantClient({
    apiKey: 'pk_test_abc',
    hmacSecret: 'whsec_test_secret',
    baseUrl: 'https://api.example.test',
    skipInitialClockSample: true
  });
  return { client, urls };
}

const reward = {
  rewardId: 'rw_1',
  tradeId: 'tr_1',
  escrowId: 'es_1',
  commissionAmount: '0.01',
  currency: 'USDT',
  status: 'pending',
  referrerId: 'ref_1',
  createdAt: '2026-11-15T03:18:00.000Z',
  completedAt: null,
  clawedBackAt: null
};

describe('client.platform.revshare.listRewards pages', () => {
  it('reads an empty rewards collection as an empty page', async () => {
    const { client, urls } = clientAnswering({ rewards: [], hasMore: false, nextCursor: null });
    const page = await client.platform.revshare.listRewards({ limit: 5 });
    expect(urls).toEqual(['/api/v1/merchant/revshare/earnings/rewards?limit=5']);
    expect(Array.isArray(page.items)).toBe(true);
    expect(page.items).toEqual([]);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeUndefined();
  });

  it('reads one reward row with its paging fields', async () => {
    const { client } = clientAnswering({ rewards: [reward], hasMore: true, nextCursor: 'cur_2' });
    const page = await client.platform.revshare.listRewards({ limit: 1 });
    expect(page.items).toEqual([reward]);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBe('cur_2');
  });

  it('reads an items page', async () => {
    const { client } = clientAnswering({ items: [reward], hasMore: false });
    const page = await client.platform.revshare.listRewards();
    expect(page.items).toEqual([reward]);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeUndefined();
  });

  it('reads an empty items page', async () => {
    const { client } = clientAnswering({ items: [] });
    const page = await client.platform.revshare.listRewards();
    expect(page.items).toEqual([]);
    expect(page.hasMore).toBe(false);
  });

  it('wraps a bare array and infers hasMore from the requested limit', async () => {
    const full = clientAnswering([reward]);
    expect(await full.client.platform.revshare.listRewards({ limit: 1 })).toEqual({ items: [reward], hasMore: true });
    vi.restoreAllMocks();
    const short = clientAnswering([reward]);
    expect(await short.client.platform.revshare.listRewards({ limit: 5 })).toEqual({ items: [reward], hasMore: false });
    vi.restoreAllMocks();
    const unbounded = clientAnswering([]);
    expect(await unbounded.client.platform.revshare.listRewards()).toEqual({ items: [], hasMore: false });
  });

  it('answers an empty page for an object with neither the collection nor items', async () => {
    const { client } = clientAnswering({ ok: true });
    const page = await client.platform.revshare.listRewards();
    expect(page.items).toEqual([]);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeUndefined();
  });

  it('prefers the named collection over items and takes only a literal true as hasMore', async () => {
    const { client } = clientAnswering({ rewards: [reward], items: [{ rewardId: 'other' }], hasMore: 'true', nextCursor: 7 });
    const page = await client.platform.revshare.listRewards();
    expect(page.items).toEqual([reward]);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeUndefined();
  });
});

describe('client.platform.revshare list calls read their own collection', () => {
  it('listPayouts reads payouts', async () => {
    const payout = { payoutId: 'po_1', amount: '1.00', currency: 'USDT', status: 'completed' };
    const { client, urls } = clientAnswering({ payouts: [payout], hasMore: true, nextCursor: 'cur_p' });
    const page = await client.platform.revshare.listPayouts({ limit: 1 });
    expect(urls).toEqual(['/api/v1/merchant/revshare/payouts?limit=1']);
    expect(page).toEqual({ items: [payout], hasMore: true, nextCursor: 'cur_p' });
  });

  it('listProposals reads proposals', async () => {
    const proposal = { proposalId: 'pr_1', status: 'pending' };
    const { client, urls } = clientAnswering({ proposals: [proposal], hasMore: false, nextCursor: null });
    const page = await client.platform.revshare.listProposals({ status: 'pending' });
    expect(urls).toEqual(['/api/v1/merchant/revshare/config/proposals?status=pending']);
    expect(page.items).toEqual([proposal]);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeUndefined();
  });

  it('getConfigHistory reads versions', async () => {
    const version = { version: 2, effectiveFrom: '2026-11-01T00:00:00.000Z' };
    const { client, urls } = clientAnswering({ versions: [version], hasMore: true, nextCursor: 'cur_v' });
    const page = await client.platform.revshare.getConfigHistory({ limit: 1 });
    expect(urls).toEqual(['/api/v1/merchant/revshare/config/history?limit=1']);
    expect(page).toEqual({ items: [version], hasMore: true, nextCursor: 'cur_v' });
  });

  it('a list call does not take another call\'s collection', async () => {
    const { client } = clientAnswering({ rewards: [reward], hasMore: false, nextCursor: null });
    const page = await client.platform.revshare.listPayouts();
    expect(page.items).toEqual([]);
  });
});
