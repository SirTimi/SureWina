import type {
  BookCollectionRequest,
  BookCollectionResponse,
  ChooseClaimPathRequest,
  ChooseClaimPathResponse,
  GetClaimKycStatusResponse,
  GetClaimPathResponse,
  GetClaimStatusResponse,
  GetLiveDrawResponse,
  GetWinnerNotificationResponse,
  ListCollectionPointsRequest,
  ListCollectionPointsResponse,
  SubmitKycBankRequest,
  SubmitKycBankResponse,
  SubmitKycBvnRequest,
  SubmitKycBvnResponse,
  SubmitKycDocumentRequest,
  SubmitKycDocumentResponse,
} from '@surewina/types';
import type { ApiClient } from '../client.js';
import {
  getMockClaim,
  getMockClaimStatus,
  getMockKyc,
  getMockLiveDrawState,
  MOCK_COLLECTION_POINTS,
  MOCK_WINNER_BY_CLAIM,
  setMockClaimSelection,
  setMockKyc,
} from './mock-data.js';

export class ClaimsModule {
  constructor(private readonly client: ApiClient) {}

  async getWinnerNotification(claimId: string): Promise<GetWinnerNotificationResponse> {
    const notification = MOCK_WINNER_BY_CLAIM[claimId];
    if (!notification) throw new Error(`Winner notification not found: ${claimId}`);
    return Promise.resolve({ notification });
  }

  async getLiveDraw(drawCode: string): Promise<GetLiveDrawResponse> {
    return Promise.resolve({ state: getMockLiveDrawState(drawCode) });
  }

  async getClaimPath(claimId: string): Promise<GetClaimPathResponse> {
    const claim = getMockClaim(claimId);
    if (!claim) throw new Error(`Claim not found: ${claimId}`);
    return Promise.resolve({ claim: { ...claim } });
  }

  async chooseClaimPath(req: ChooseClaimPathRequest): Promise<ChooseClaimPathResponse> {
    const updated = setMockClaimSelection(req.claimId, req.path);
    if (!updated) throw new Error(`Claim not found: ${req.claimId}`);
    return Promise.resolve({ claim: { ...updated } });
  }

  async listCollectionPoints(
    req?: ListCollectionPointsRequest,
  ): Promise<ListCollectionPointsResponse> {
    const all = MOCK_COLLECTION_POINTS;
    const filtered = req?.stateCode
      ? all.filter((p) => p.stateCode === req.stateCode)
      : all;
    return Promise.resolve({ points: filtered });
  }

  async bookCollection(req: BookCollectionRequest): Promise<BookCollectionResponse> {
    const point = MOCK_COLLECTION_POINTS.find((p) => p.id === req.collectionPointId);
    if (!point) throw new Error(`Collection point not found`);
    return Promise.resolve({
      bookingId: `bk_${Math.random().toString(36).slice(2, 11)}`,
      collectionPoint: point,
      scheduledAt: new Date(req.preferredDate).toISOString(),
    });
  }

  async getClaimKycStatus(claimId: string): Promise<GetClaimKycStatusResponse> {
    return Promise.resolve({ kyc: getMockKyc(claimId) });
  }

  async submitKycDocument(req: SubmitKycDocumentRequest): Promise<SubmitKycDocumentResponse> {
    const kyc = setMockKyc(req.claimId, {
      documentUploaded: true,
      selfieUploaded: true,
      status: 'DOCS_UPLOADED',
    });
    return Promise.resolve({ kyc });
  }

  async submitKycBvn(req: SubmitKycBvnRequest): Promise<SubmitKycBvnResponse> {
    if (!/^\d{11}$/.test(req.bvn)) {
      throw new Error('BVN must be exactly 11 digits.');
    }
    const kyc = setMockKyc(req.claimId, {
      status: 'BVN_VERIFIED',
      bvnLast4: req.bvn.slice(-4),
    });
    return Promise.resolve({ kyc });
  }

  async submitKycBank(req: SubmitKycBankRequest): Promise<SubmitKycBankResponse> {
    if (!/^\d{10}$/.test(req.accountNumber)) {
      throw new Error('Account number must be exactly 10 digits.');
    }
    const kyc = setMockKyc(req.claimId, {
      status: 'COMPLETE',
      bankAccount: {
        bankName: 'Guaranty Trust Bank',
        accountNumber: req.accountNumber.slice(-4),
        accountName: 'CHIDI OKAFOR',
      },
    });
    return Promise.resolve({ kyc });
  }

  async getClaimStatus(claimId: string): Promise<GetClaimStatusResponse> {
    return Promise.resolve(getMockClaimStatus(claimId));
  }
}