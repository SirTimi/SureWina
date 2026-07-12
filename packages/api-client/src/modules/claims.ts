import type {
  BookCollectionRequest, BookCollectionResponse, ChooseClaimPathRequest,
  ChooseClaimPathResponse, GetClaimKycStatusResponse, GetClaimPathResponse,
  GetClaimStatusResponse, GetLiveDrawResponse, GetWinnerNotificationResponse,
  ListCollectionPointsRequest, ListCollectionPointsResponse,
  SubmitKycBankRequest, SubmitKycBankResponse, SubmitKycBvnRequest,
  SubmitKycBvnResponse, SubmitKycDocumentRequest, SubmitKycDocumentResponse,
  ClaimKycStatus, ClaimPath,
} from '@surewina/types';
import type { ApiClient } from '../client.js';
import { getMockLiveDrawState } from './mock-data.js';

// Backend claim view (Phase 8) + C2b kyc extensions.
type BackendClaim = {
  claimId: string; winnerTicketRef: string; drawCode: string;
  prizeDescription: string; status: string; claimType: 'PRODUCT' | 'CASH' | null;
  grossPrizeValueNgn: number; whtAmountNgn: number; netPrizeValueNgn: number;
  selectionDeadlineAt: string; claimDeadlineAt: string; createdAt: string;
  claimTypeSelectedAt?: string | null;
  kycBvnVerified?: boolean; kycHasDocs?: boolean;
  kycBank?: { bankCode: string | null; accountLast4: string | null; accountName: string } | null;
};

function toClaimPath(c: BackendClaim): ClaimPath {
  return {
    claimId: c.claimId,
    ticketRef: c.winnerTicketRef,
    drawCode: c.drawCode,
    prizeDescription: c.prizeDescription,
    grossPrizeValueNgn: c.grossPrizeValueNgn,
    estimatedWhtNgn: c.whtAmountNgn,
    netCashIfChosenNgn: c.netPrizeValueNgn,
    selectionMade: c.claimType !== null && c.status !== 'NOTIFIED',
    selectedPath: c.claimType,
    selectionDeadlineAt: c.selectionDeadlineAt,
    // Flip window: open while still SELECTION_MADE; closes when KYC starts.
    changeWindowEndsAt: c.status === 'SELECTION_MADE' ? c.selectionDeadlineAt : null,
    isJackpot: c.drawCode.includes('JACKPOT'),
  } as ClaimPath;
}

function toKycStatus(c: BackendClaim): ClaimKycStatus {
  const status: ClaimKycStatus['status'] =
    c.status === 'KYC_CLEARED' || c.status === 'CASH_PAID' || c.status === 'DELIVERED' || c.status === 'PRODUCT_BOOKED'
      ? 'COMPLETE'
      : c.kycBank
        ? 'BANK_VERIFIED'
        : c.kycHasDocs
          ? 'DOCS_UPLOADED'
          : c.kycBvnVerified
            ? 'BVN_VERIFIED'
            : 'NOT_STARTED';
  return {
    claimId: c.claimId,
    status,
    rejectionReason: null,
    bvnLast4: null, // never round-trips; backend stores only a hash
    bankAccount: c.kycBank
      ? { bankName: c.kycBank.bankCode ?? '', accountNumber: c.kycBank.accountLast4 ?? '', accountName: c.kycBank.accountName }
      : null,
  } as ClaimKycStatus;
}

export class ClaimsModule {
  constructor(private readonly client: ApiClient) {}

  private getClaim(claimId: string): Promise<BackendClaim> {
    return this.client.get<BackendClaim>(`/claims/${encodeURIComponent(claimId)}`);
  }

  async getWinnerNotification(claimId: string): Promise<GetWinnerNotificationResponse> {
    const c = await this.getClaim(claimId);
    const detail = await this.client
      .get<{ result: { rngSeedHash: string; executedAt: string } }>(
        `/results/${encodeURIComponent(c.drawCode)}`, { skipAuth: true })
      .catch(() => null);
    return {
      notification: {
        claimId: c.claimId,
        ticketRef: c.winnerTicketRef,
        drawCode: c.drawCode,
        drawType: c.drawCode.includes('JACKPOT') ? 'SATURDAY_JACKPOT' : 'DAILY_STANDARD',
        prizeDescription: c.prizeDescription,
        prizeImageUrl: null,
        grossPrizeValueNgn: c.grossPrizeValueNgn,
        drawnAt: detail?.result.executedAt ?? c.createdAt,
        seedHash: detail?.result.rngSeedHash ?? '',
        seedReveal: null,
        selectionDeadlineAt: c.selectionDeadlineAt,
        buyerPhoneLast4: '',
      } as GetWinnerNotificationResponse['notification'],
    };
  }

  // Draw-night animation is client theatrics, not server data — it stays
  // locally generated. Not a mock of a backend that should exist.
  async getLiveDraw(drawCode: string): Promise<GetLiveDrawResponse> {
    return Promise.resolve({ state: getMockLiveDrawState(drawCode) });
  }

  async getClaimPath(claimId: string): Promise<GetClaimPathResponse> {
    return { claim: toClaimPath(await this.getClaim(claimId)) };
  }

  async chooseClaimPath(req: ChooseClaimPathRequest): Promise<ChooseClaimPathResponse> {
    const c = await this.client.post<BackendClaim>(
      `/claims/${encodeURIComponent(req.claimId)}/choose`, { path: req.path });
    return { claim: toClaimPath(c) };
  }

  async listCollectionPoints(req?: ListCollectionPointsRequest): Promise<ListCollectionPointsResponse> {
    const res = await this.client.get<{ points: { pointId: string; name: string; stateCode: string; address: string }[] }>(
      '/claims/collection-points/list', { query: { stateCode: req?.stateCode } });
    return {
      points: res.points.map((p) => ({ id: p.pointId, name: p.name, stateCode: p.stateCode, address: p.address })),
    } as ListCollectionPointsResponse;
  }

  async bookCollection(req: BookCollectionRequest): Promise<BookCollectionResponse> {
    await this.client.post(`/claims/${encodeURIComponent(req.claimId)}/book-collection`, {
      collectionPointId: req.collectionPointId,
      preferredDate: req.preferredDate,
    });
    const { points } = await this.listCollectionPoints();
    const point = points.find((p) => p.id === req.collectionPointId);
    if (!point) throw new Error('Collection point not found');
    return { bookingId: req.claimId, collectionPoint: point, scheduledAt: new Date(req.preferredDate).toISOString() };
  }

  async getClaimKycStatus(claimId: string): Promise<GetClaimKycStatusResponse> {
    return { kyc: toKycStatus(await this.getClaim(claimId)) };
  }

  async submitKycDocument(req: SubmitKycDocumentRequest): Promise<SubmitKycDocumentResponse> {
    const form = new FormData();
    const r = req as unknown as { idDoc?: Blob | File; selfie?: Blob | File };
    if (r.idDoc) form.append('idDoc', r.idDoc);
    if (r.selfie) form.append('selfie', r.selfie);
    await this.client.post(`/claims/${encodeURIComponent(req.claimId)}/kyc/documents`, form);
    return { kyc: toKycStatus(await this.getClaim(req.claimId)) };
  }

  async submitKycBvn(req: SubmitKycBvnRequest): Promise<SubmitKycBvnResponse> {
    await this.client.post(`/claims/${encodeURIComponent(req.claimId)}/kyc/bvn`, { bvn: req.bvn });
    return { kyc: toKycStatus(await this.getClaim(req.claimId)) };
  }

  async submitKycBank(req: SubmitKycBankRequest): Promise<SubmitKycBankResponse> {
    await this.client.post(`/claims/${encodeURIComponent(req.claimId)}/kyc/bank`, {
      accountNumber: req.accountNumber, bankCode: req.bankCode });
    return { kyc: toKycStatus(await this.getClaim(req.claimId)) };
  }

  async getClaimStatus(claimId: string): Promise<GetClaimStatusResponse> {
    const c = await this.getClaim(claimId);
    const step = (id: string, label: string, done: boolean, current: boolean, iconKey: string) => ({
      id, timestamp: c.createdAt, label, description: null,
      iconKey, state: done ? 'done' : current ? 'current' : 'future',
    });
    const s = c.status;
    const events = [
      step('won', 'You won', true, false, 'trophy'),
      step('selected', 'Prize option chosen', s !== 'NOTIFIED', s === 'NOTIFIED', 'check'),
      step('kyc', 'Identity verified', ['KYC_CLEARED', 'PRODUCT_BOOKED', 'DELIVERED', 'CASH_PAID'].includes(s), s === 'KYC_PENDING' || s === 'SELECTION_MADE', 'shield'),
      c.claimType === 'PRODUCT'
        ? step('fulfil', 'Product collected', s === 'DELIVERED', s === 'PRODUCT_BOOKED' || s === 'KYC_CLEARED', 'package')
        : step('fulfil', 'Cash paid out', s === 'CASH_PAID', s === 'KYC_CLEARED', 'banknote'),
    ];
    return {
      claimId: c.claimId,
      prizeDescription: c.prizeDescription,
      selectedPath: c.claimType,
      currentStatus: s,
      events: events as GetClaimStatusResponse['events'],
      estimatedCompletionAt: null,
    };
  }
}