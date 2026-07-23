import type {
  BookCollectionRequest, BookCollectionResponse, ChooseClaimPathRequest,
  ChooseClaimPathResponse, GetClaimKycStatusResponse, GetClaimPathResponse,
  GetClaimStatusResponse, GetLiveDrawResponse, GetWinnerNotificationResponse,
  ListCollectionPointsRequest, ListCollectionPointsResponse,
  SubmitKycBankRequest, SubmitKycBankResponse, SubmitKycBvnRequest,
  SubmitKycBvnResponse, SubmitKycDocumentRequest, SubmitKycDocumentResponse,
  ClaimKycStatus, ClaimPath,
  ListCustomerDisputesResponse, RaiseDisputeRequest, RaiseDisputeResponse,
} from '@surewina/types';
import type { ApiClient } from '../client.js';

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
    documentUploaded: !!c.kycHasDocs,
    selfieUploaded: !!c.kycHasDocs, // stored together; one flag serves both
    kycDeadlineAt: c.claimDeadlineAt,
    bvnLast4: c.kycBvnVerified ? '••••' : null,
    bankAccount: c.kycBank
      ? { bankName: c.kycBank.bankCode ?? '', accountLast4: c.kycBank.accountLast4 ?? '', accountName: c.kycBank.accountName }
      : null,
  } as ClaimKycStatus;
}

// Accepts raw base64 or a full data URL; returns a Blob with the right type.
function base64ToBlob(input: string): Blob {
  let mime = 'image/png';
  let data = input;
  const match = /^data:([^;]+);base64,(.*)$/.exec(input);
  if (match) {
    mime = match[1];
    data = match[2];
  }
  const bytes = atob(data);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
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
  // Real live-draw state, derived from the engine's published artefacts:
  // the draw record (commit hash, schedule, status) and, once COMPLETED,
  // the result (winner + revealed seed). No animation state is served by
  // the backend — the page dramatizes these facts however it likes.
  async getLiveDraw(drawCode: string): Promise<GetLiveDrawResponse> {
    const d = await this.client.get<{
      draw: {
        drawCode: string;
        drawType: 'DAILY_STANDARD' | 'SATURDAY_JACKPOT';
        prizeDescription: string;
        prizeValueNgn: number;
        scheduledAt: string;
        status: string;
      };
      ticketsSold: number;
      seedCommittedHash: string | null;
    }>(`/draws/${encodeURIComponent(drawCode)}`, { skipAuth: true });

    let phase: 'PRE_DRAW' | 'DRAWING' | 'COMPLETE' = 'PRE_DRAW';
    let winningTicketRef: string | null = null;
    let seedReveal: string | null = null;

    if (d.draw.status === 'COMPLETED') {
      phase = 'COMPLETE';
      const res = await this.client
        .get<{ result: { winnerTicketRef: string; rngSeed: string } }>(
          `/results/${encodeURIComponent(drawCode)}`,
          { skipAuth: true },
        )
        .catch(() => null);
      winningTicketRef = res?.result.winnerTicketRef ?? null;
      seedReveal = res?.result.rngSeed ?? null;
    } else if (
      d.draw.status === 'EXECUTING' ||
      (d.draw.status === 'SALES_CLOSED' &&
        new Date(d.draw.scheduledAt).getTime() <= Date.now())
    ) {
      phase = 'DRAWING';
    }

    return {
      state: {
        drawCode: d.draw.drawCode,
        drawType: d.draw.drawType,
        prizeDescription: d.draw.prizeDescription,
        prizeValueNgn: d.draw.prizeValueNgn,
        scheduledAt: d.draw.scheduledAt,
        ticketsSold: d.ticketsSold,
        seedHash: d.seedCommittedHash ?? '',
        phase,
        winningTicketRef,
        seedReveal,
      },
    };
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
    form.append('idDoc', base64ToBlob(req.documentImageBase64), 'id-document.png');
    form.append('selfie', base64ToBlob(req.selfieImageBase64), 'selfie.png');
    await this.client.post(
      `/claims/${encodeURIComponent(req.claimId)}/kyc/documents`,
      form,
    );
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

  // ── Disputes (E17) ────────────────────────────────────────
  // Phone-scoped server-side by the customer JWT: a customer only ever sees
  // and raises their own.

  async listDisputes(): Promise<ListCustomerDisputesResponse> {
    return this.client.get<ListCustomerDisputesResponse>('/disputes');
  }

  async raiseDispute(req: RaiseDisputeRequest): Promise<RaiseDisputeResponse> {
    return this.client.post<RaiseDisputeResponse>('/disputes', req);
  }
}