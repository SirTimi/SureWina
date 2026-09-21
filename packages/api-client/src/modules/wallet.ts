import type { ApiClient } from '../client.js';

export type WalletOwnerType = 'CUSTOMER' | 'AGENT';
export type WalletStatus = 'ACTIVE' | 'FROZEN' | 'CLOSED';
export type WalletFundingGateway = 'MONNIFY' | 'FLUTTERWAVE';
export type WalletFundingStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'CREDITED'
  | 'FAILED'
  | 'REVIEW_REQUIRED';

export interface WalletView {
  walletId: string;
  ownerType: WalletOwnerType;
  ownerId: string | null;
  currency: string;
  status: WalletStatus;
  availableNgn: number;
  heldNgn: number;
  totalNgn: number;
  availableAccountId: string;
  heldAccountId: string;
  createdAt: string;
  updatedAt: string;
}

export interface WalletLedgerEntry {
  entryId: string;
  side: 'DEBIT' | 'CREDIT';
  amountNgn: number;
  memo: string | null;
  account: {
    accountId: string;
    code: string;
    name: string;
    purpose: string;
  };
  belongsToWallet: boolean;
}

export interface WalletLedgerTransaction {
  ledgerTxnId: string;
  kind: string;
  referenceType: string;
  referenceId: string;
  description: string | null;
  totalAmountNgn: number;
  occurredAt: string;
  createdAt: string;
  entries: WalletLedgerEntry[];
}

export interface WalletHistoryResponse {
  page: number;
  pageSize: number;
  total: number;
  transactions: WalletLedgerTransaction[];
}

export interface WalletFundingView {
  fundingId: string;
  walletId: string;
  reference: string;
  gateway: WalletFundingGateway;
  amountNgn: number;
  currency: string;
  status: WalletFundingStatus;
  providerTransactionId: string | null;
  ledgerTxnId: string | null;
  failureReason: string | null;
  initiatedAt: string;
  lastVerifiedAt: string | null;
  creditedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WalletFundingHistoryResponse {
  page: number;
  pageSize: number;
  total: number;
  fundings: WalletFundingView[];
}

export interface InitiateWalletFundingRequest {
  gateway: WalletFundingGateway;
  amountNgn: number;
  email?: string;
}

export interface InitiateWalletFundingResponse {
  fundingId: string;
  walletId: string;
  reference: string;
  gateway: WalletFundingGateway;
  amountNgn: number;
  authorizationUrl: string;
  status: 'PENDING';
}

export class WalletModule {
  constructor(private readonly client: ApiClient) {}

  async getMine(): Promise<WalletView> {
    return this.client.get<WalletView>('/wallet');
  }

  async history(page = 1, pageSize = 20): Promise<WalletHistoryResponse> {
    return this.client.get<WalletHistoryResponse>('/wallet/history', {
      query: { page, pageSize },
    });
  }

  async initiateFunding(
    input: InitiateWalletFundingRequest,
  ): Promise<InitiateWalletFundingResponse> {
    return this.client.post<InitiateWalletFundingResponse>(
      '/wallet/funding/initiate',
      input,
    );
  }

  async fundingStatus(
    reference: string,
    transactionId?: string,
  ): Promise<WalletFundingView> {
    return this.client.get<WalletFundingView>('/wallet/funding/status', {
      query: {
        reference,
        transactionId,
      },
    });
  }

  async fundingHistory(
    page = 1,
    pageSize = 20,
  ): Promise<WalletFundingHistoryResponse> {
    return this.client.get<WalletFundingHistoryResponse>(
      '/wallet/funding/history',
      {
        query: { page, pageSize },
      },
    );
  }
}
