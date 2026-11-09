
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

export type WitmangoSavingsAccount = {
  id: number;
  accountNo: string;
  status: {
    id?: number;
    code?: string;
    value?: string;
  };
  currency: { code: string };
  summary: {
    accountBalance: number;
    availableBalance: number;
    totalDeposits?: number;
    totalWithdrawals?: number;
  };
};

export type CreateWitmangoCustomerWalletInput = {
  officeId: number;
  legalFormId: number;
  savingsProductId: number;
  externalId: string;
  firstName: string;
  lastName: string;
  email: string;
  dateOfBirth: string;
};

export type WitmangoCreatedWallet = {
  clientId: number;
  savingsAccountId: number;
};

export type OpenWitmangoSavingsAccountInput = {
  clientId: number;
  savingsProductId: number;
  // Account-level external ID. The approve step finds the application by
  // this, because the submit response does not reliably return the numeric
  // account ID.
  externalId: string;
};

// A deposit or withdrawal against one savings (wallet) account.
//
// `reference` is SureWina's own identifier for the movement. The CBA offers
// no duplicate protection of its own, so this is what makes a retry safe:
// it is sent as the receipt number, and findTransactionByReference() looks
// for it before anything is posted a second time.
export type WitmangoMoneyMovementInput = {
  accountId: number;
  amountNgn: number;
  // Business date as YYYY-MM-DD. Chosen by the caller, not derived here,
  // because the CBA rejects future dates in the tenant's own time zone.
  transactionDate: string;
  reference: string;
};

export type WitmangoPostedTransaction = {
  transactionId: number;
  savingsAccountId: number;
};

export type WitmangoTransferEndpoint = {
  officeId: number;
  clientId: number;
  accountId: number;
};

export type WitmangoTransferInput = {
  from: WitmangoTransferEndpoint;
  to: WitmangoTransferEndpoint;
  amountNgn: number;
  transactionDate: string;
  reference: string;
};

export type WitmangoTransferResult = {
  transferId: number;
  fromSavingsAccountId: number;
};

export type WitmangoReferencedTransaction = {
  transactionId: number;
  kind: 'DEPOSIT' | 'WITHDRAWAL' | 'OTHER';
  amountNgn: number;
  reversed: boolean;
};

// Thrown when the request may or may not have reached the CBA — a dropped
// connection or a timeout. Callers must treat this differently from a
// refusal: the movement might have happened, so the only safe next step is
// to look for it by reference before posting again.
//
// Extends ServiceUnavailableException so existing callers that catch the
// broader type keep working unchanged.
export class WitmangoUncertainOutcomeError extends ServiceUnavailableException {
  constructor() {
    super('Witmango API request outcome is uncertain');
  }
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

@Injectable()
export class WitmangoClientService {
  constructor(
    private readonly config: ConfigService,
  ) {}

  isEnabled(): boolean {
    return this.config.get<boolean>(
      'WITMANGO_ENABLED',
    ) === true;
  }

  private requireId(value: number): number {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new BadRequestException(
        'A positive numeric Fineract ID is required',
      );
    }

    return value;
  }

  private fineractDate(isoDate: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
      throw new BadRequestException(
        'Date must use YYYY-MM-DD',
      );
    }

    const date = new Date(`${isoDate}T00:00:00.000Z`);

    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== isoDate
    ) {
      throw new BadRequestException('Invalid date');
    }

    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }

  // Writes are gated separately from reads. WITMANGO_ENABLED alone lets the
  // platform look at the CBA; moving money needs this second, deliberate
  // switch, which defaults to off.
  private requireMonetaryEnabled(): void {
    if (
      this.config.get<boolean>(
        'WITMANGO_MONETARY_ENABLED',
      ) !== true
    ) {
      throw new ServiceUnavailableException(
        'Witmango monetary operations are disabled',
      );
    }
  }

  // Whole naira only. Every amount in SureWina is an integer number of
  // naira, and a fractional value reaching the CBA would mean a rounding
  // error somewhere upstream that should fail loudly here instead.
  private requireAmount(amountNgn: number): number {
    if (!Number.isSafeInteger(amountNgn) || amountNgn <= 0) {
      throw new BadRequestException(
        'Amount must be a positive whole number of naira',
      );
    }

    return amountNgn;
  }

  // Matches the 50-character reference columns on SureWina's own records,
  // so whatever is stored locally can always be sent and searched for.
  private requireReference(reference: string): string {
    if (!/^[A-Za-z0-9_-]{8,50}$/.test(reference)) {
      throw new BadRequestException(
        'Reference must be 8-50 letters, digits, hyphens or underscores',
      );
    }

    return reference;
  }

  // The CBA requires a payment type on every savings transaction, and which
  // IDs exist differs per tenant. Configured, never assumed — the guide is
  // explicit that 1 is not necessarily correct.
  private paymentTypeId(): number {
    const value = this.config.get<number>(
      'WITMANGO_PAYMENT_TYPE_ID',
    );

    if (
      value === undefined ||
      !Number.isSafeInteger(value) ||
      value <= 0
    ) {
      throw new ServiceUnavailableException(
        'Witmango payment type is not configured',
      );
    }

    return value;
  }

  async listGlAccounts(): Promise<unknown> {
    return this.request('GET', '/v1/glaccounts');
  }

  async listSavingsProducts(): Promise<unknown> {
    return this.request('GET', '/v1/savingsproducts');
  }

  async getSavingsAccount(
    accountId: number,
  ): Promise<WitmangoSavingsAccount> {
    const id = this.requireId(accountId);

    const result = await this.request(
      'GET',
      `/v1/savingsaccounts/${id}`,
    );

    if (
      !isRecord(result) ||
      result.id !== id ||
      typeof result.accountNo !== 'string' ||
      !isRecord(result.status) ||
      !isRecord(result.currency) ||
      result.currency.code !== 'NGN' ||
      !isRecord(result.summary) ||
      typeof result.summary.accountBalance !== 'number' ||
      !Number.isFinite(result.summary.accountBalance) ||
      typeof result.summary.availableBalance !== 'number' ||
      !Number.isFinite(result.summary.availableBalance)
    ) {
      throw new BadGatewayException(
        'Witmango returned an invalid NGN savings account',
      );
    }

    return result as unknown as WitmangoSavingsAccount;
  }

  async getSavingsAccountWithTransactions(
    accountId: number,
  ): Promise<unknown> {
    const id = this.requireId(accountId);

    return this.request(
      'GET',
      `/v1/savingsaccounts/${id}?associations=transactions`,
    );
  }

  async createClientWithWallet(
    input: CreateWitmangoCustomerWalletInput,
  ): Promise<WitmangoCreatedWallet> {
    if (
      !this.config.get<boolean>(
        'WITMANGO_PROVISIONING_ENABLED',
      )
    ) {
      throw new ServiceUnavailableException(
        'Witmango wallet provisioning is disabled',
      );
    }

    this.requireId(input.officeId);
    this.requireId(input.legalFormId);
    this.requireId(input.savingsProductId);

    if (
      !/^[a-zA-Z0-9_-]{8,100}$/.test(input.externalId) ||
      !input.firstName.trim() ||
      !input.lastName.trim() ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)
    ) {
      throw new BadRequestException(
        'Valid customer onboarding information is required',
      );
    }

    const today = new Date()
      .toISOString()
      .slice(0, 10);

    const result = await this.request(
      'POST',
      '/v1/clients',
      {
        officeId: input.officeId,
        legalFormId: input.legalFormId,
        active: true,

        externalId: input.externalId,

        firstname: input.firstName.trim(),
        lastname: input.lastName.trim(),

        emailAddress: input.email
          .trim()
          .toLowerCase(),

        dateOfBirth: this.fineractDate(
          input.dateOfBirth,
        ),

        submittedOnDate: this.fineractDate(today),
        activationDate: this.fineractDate(today),

        savingsProductId: input.savingsProductId,

        dateFormat: 'dd MMMM yyyy',
        locale: 'en',
      },
    );

    if (
      !isRecord(result) ||
      !Number.isSafeInteger(result.clientId) ||
      Number(result.clientId) <= 0 ||
      !Number.isSafeInteger(result.savingsId) ||
      Number(result.savingsId) <= 0 ||
      result.resourceExternalId !== input.externalId
    ) {
      throw new BadGatewayException(
        'Witmango wallet creation returned incomplete identifiers',
      );
    }

    return {
      clientId: Number(result.clientId),
      savingsAccountId: Number(result.savingsId),
    };
  }

  // Adds a further wallet to a client who already exists — the second
  // account each person holds (Winnings, or Earnings for agents).
  //
  // Three POSTs: submit the application, approve it by external ID, then
  // activate it by the numeric ID the approval returns. Any of them can end
  // in an uncertain outcome, and none is retried here. A failure part-way
  // leaves an application on the CBA that the provisioning coordinator must
  // reconcile by its external ID — never by submitting again.
  async openSavingsAccount(
    input: OpenWitmangoSavingsAccountInput,
  ): Promise<{ savingsAccountId: number }> {
    if (
      !this.config.get<boolean>(
        'WITMANGO_PROVISIONING_ENABLED',
      )
    ) {
      throw new ServiceUnavailableException(
        'Witmango wallet provisioning is disabled',
      );
    }

    const clientId = this.requireId(input.clientId);
    const productId = this.requireId(input.savingsProductId);

    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(input.externalId)) {
      throw new BadRequestException(
        'A valid account external ID is required',
      );
    }

    const today = this.fineractDate(
      new Date().toISOString().slice(0, 10),
    );

    const submitted = await this.request(
      'POST',
      '/v1/savingsaccounts',
      {
        clientId,
        productId,
        externalId: input.externalId,
        submittedOnDate: today,
        dateFormat: 'dd MMMM yyyy',
        locale: 'en',
      },
    );

    if (!isRecord(submitted) || submitted.clientId !== clientId) {
      throw new BadGatewayException(
        'Witmango savings application returned an unexpected response',
      );
    }

    const approved = await this.request(
      'POST',
      `/v1/savingsaccounts/external-id/${encodeURIComponent(input.externalId)}?command=approve`,
      {
        approvedOnDate: today,
        dateFormat: 'dd MMMM yyyy',
        locale: 'en',
      },
    );

    if (
      !isRecord(approved) ||
      approved.clientId !== clientId ||
      !Number.isSafeInteger(approved.resourceId) ||
      Number(approved.resourceId) <= 0
    ) {
      throw new BadGatewayException(
        'Witmango savings approval returned an unexpected response',
      );
    }

    const accountId = Number(approved.resourceId);

    const activated = await this.request(
      'POST',
      `/v1/savingsaccounts/${accountId}?command=activate`,
      {
        activatedOnDate: today,
        dateFormat: 'dd MMMM yyyy',
        locale: 'en',
      },
    );

    if (!isRecord(activated) || activated.resourceId !== accountId) {
      throw new BadGatewayException(
        'Witmango savings activation returned an unexpected response',
      );
    }

    return { savingsAccountId: accountId };
  }

  // Credits a wallet. Used when real money has already arrived at Monnify
  // and the book needs to catch up with the vault.
  async deposit(
    input: WitmangoMoneyMovementInput,
  ): Promise<WitmangoPostedTransaction> {
    return this.postSavingsTransaction('deposit', input);
  }

  // Debits a wallet. On the CBA this fails if the available balance is
  // insufficient, because the wallet product disallows overdraft.
  async withdraw(
    input: WitmangoMoneyMovementInput,
  ): Promise<WitmangoPostedTransaction> {
    return this.postSavingsTransaction('withdrawal', input);
  }

  // Moves money between two wallets in a single CBA operation — both sides
  // post together or neither does. This is how a ticket purchase moves
  // naira from a player's wallet to Surewina's revenue account, and how a
  // withdrawal locks funds into Pending Withdrawals before Monnify is asked
  // to pay out.
  //
  // UNVERIFIED: the collection gives transfers no receipt number, so the
  // reference travels only in the description. Whether a transfer can be
  // found by that reference after an uncertain outcome is not yet proven
  // against a sandbox. Until it is, callers must treat an uncertain
  // transfer as needing review rather than retrying it.
  async transfer(
    input: WitmangoTransferInput,
  ): Promise<WitmangoTransferResult> {
    this.requireMonetaryEnabled();

    const fromOffice = this.requireId(input.from.officeId);
    const fromClient = this.requireId(input.from.clientId);
    const fromAccount = this.requireId(input.from.accountId);

    const toOffice = this.requireId(input.to.officeId);
    const toClient = this.requireId(input.to.clientId);
    const toAccount = this.requireId(input.to.accountId);

    if (fromAccount === toAccount) {
      throw new BadRequestException(
        'A transfer must move money between two different accounts',
      );
    }

    const amount = this.requireAmount(input.amountNgn);
    const reference = this.requireReference(input.reference);
    const date = this.fineractDate(input.transactionDate);

    const result = await this.request(
      'POST',
      '/v1/accounttransfers',
      {
        fromOfficeId: fromOffice,
        fromClientId: fromClient,
        fromAccountType: 2,
        fromAccountId: fromAccount,

        toOfficeId: toOffice,
        toClientId: toClient,
        toAccountType: 2,
        toAccountId: toAccount,

        transferAmount: amount,
        transferDate: date,
        transferDescription: reference,

        dateFormat: 'dd MMMM yyyy',
        locale: 'en',
      },
    );

    if (
      !isRecord(result) ||
      !Number.isSafeInteger(result.resourceId) ||
      Number(result.resourceId) <= 0 ||
      result.savingsId !== fromAccount
    ) {
      throw new BadGatewayException(
        'Witmango transfer returned an unexpected response',
      );
    }

    return {
      transferId: Number(result.resourceId),
      fromSavingsAccountId: fromAccount,
    };
  }

  // The retry guard. Before posting anything a second time, look for the
  // first attempt by its reference. Returns null when it never landed, and
  // fails loudly if the reference appears more than once — that means a
  // duplicate already exists and a person needs to look at it.
  //
  // UNVERIFIED: field names follow standard Fineract (paymentDetailData,
  // transactionType, reversed). Confirm against a sandbox response before
  // any caller relies on this for real money.
  async findTransactionByReference(
    accountId: number,
    reference: string,
  ): Promise<WitmangoReferencedTransaction | null> {
    const id = this.requireId(accountId);
    const ref = this.requireReference(reference);

    const result = await this.request(
      'GET',
      `/v1/savingsaccounts/${id}?associations=transactions`,
    );

    if (!isRecord(result) || result.id !== id) {
      throw new BadGatewayException(
        'Witmango returned an invalid savings account',
      );
    }

    const transactions = Array.isArray(result.transactions)
      ? result.transactions
      : [];

    const matches = transactions.filter(
      (tx): tx is Record<string, unknown> =>
        isRecord(tx) &&
        isRecord(tx.paymentDetailData) &&
        tx.paymentDetailData.receiptNumber === ref,
    );

    if (matches.length === 0) {
      return null;
    }

    if (matches.length > 1) {
      throw new BadGatewayException(
        'Reference appears on more than one CBA transaction',
      );
    }

    const tx = matches[0];

    if (
      !Number.isSafeInteger(tx.id) ||
      Number(tx.id) <= 0 ||
      typeof tx.amount !== 'number' ||
      !Number.isFinite(tx.amount)
    ) {
      throw new BadGatewayException(
        'Witmango returned an invalid transaction',
      );
    }

    const type = isRecord(tx.transactionType)
      ? tx.transactionType
      : {};

    return {
      transactionId: Number(tx.id),
      kind:
        type.deposit === true
          ? 'DEPOSIT'
          : type.withdrawal === true
            ? 'WITHDRAWAL'
            : 'OTHER',
      amountNgn: tx.amount,
      reversed: tx.reversed === true,
    };
  }

  private async postSavingsTransaction(
    command: 'deposit' | 'withdrawal',
    input: WitmangoMoneyMovementInput,
  ): Promise<WitmangoPostedTransaction> {
    this.requireMonetaryEnabled();

    const id = this.requireId(input.accountId);
    const amount = this.requireAmount(input.amountNgn);
    const reference = this.requireReference(input.reference);
    const date = this.fineractDate(input.transactionDate);
    const paymentTypeId = this.paymentTypeId();

    const result = await this.request(
      'POST',
      `/v1/savingsaccounts/${id}/transactions?command=${command}`,
      {
        transactionDate: date,
        transactionAmount: amount,
        paymentTypeId,

        // Carried on the CBA transaction so it can be found again. The
        // note duplicates it for anyone reading the account in Witmango's
        // own screens.
        receiptNumber: reference,
        note: reference,

        dateFormat: 'dd MMMM yyyy',
        locale: 'en',
      },
    );

    if (
      !isRecord(result) ||
      !Number.isSafeInteger(result.resourceId) ||
      Number(result.resourceId) <= 0 ||
      result.savingsId !== id
    ) {
      throw new BadGatewayException(
        `Witmango ${command} returned an unexpected response`,
      );
    }

    return {
      transactionId: Number(result.resourceId),
      savingsAccountId: id,
    };
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, unknown>,
  ): Promise<unknown> {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException(
        'Witmango integration is disabled',
      );
    }

    const base = this.config
      .get<string>('WITMANGO_BASE_URL')
      ?.trim();

    const tenant = this.config
      .get<string>('WITMANGO_TENANT_ID')
      ?.trim();

    const username = this.config
      .get<string>('WITMANGO_USERNAME');

    const password = this.config
      .get<string>('WITMANGO_PASSWORD');

    if (!base || !tenant || !username || !password) {
      throw new ServiceUnavailableException(
        'Witmango integration is not configured',
      );
    }

    let parsed: URL;

    try {
      parsed = new URL(base);
    } catch {
      throw new ServiceUnavailableException(
        'Witmango base URL is invalid',
      );
    }

    const isLocal = [
      'localhost',
      '127.0.0.1',
      '[::1]',
    ].includes(parsed.hostname);

    const nonProduction =
      this.config.get<string>('NODE_ENV') !==
      'production';

    if (
      !['https:', 'http:'].includes(parsed.protocol) ||
      (
        parsed.protocol !== 'https:' &&
        !(isLocal && nonProduction)
      ) ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      parsed.pathname.replace(/\/+$/, '') !==
        '/fineract-provider/api'
    ) {
      throw new ServiceUnavailableException(
        'Witmango requires a secure Fineract API base URL',
      );
    }

    const timeout =
      this.config.get<number>(
        'WITMANGO_TIMEOUT_MS',
      ) ?? 10000;

    const authorization = Buffer.from(
      `${username}:${password}`,
      'utf8',
    ).toString('base64');

    let response: Response;

    try {
      response = await fetch(
        `${base.replace(/\/+$/, '')}${path}`,
        {
          method,
          headers: {
            Authorization: `Basic ${authorization}`,
            'Fineract-Platform-TenantId': tenant,
            Accept: 'application/json',
            'Cache-Control': 'no-store',
            ...(body
              ? { 'Content-Type': 'application/json' }
              : {}),
          },
          ...(body
            ? { body: JSON.stringify(body) }
            : {}),
          redirect: 'error',
          signal: AbortSignal.timeout(timeout),
        },
      );
    } catch {
      // An uncertain POST might have succeeded upstream. Callers must look
      // for it by reference before posting again — never retry blindly.
      throw new WitmangoUncertainOutcomeError();
    }

    if (!response.ok) {
      // Do not expose upstream error bodies or credentials.
      throw new BadGatewayException(
        `Witmango request failed with HTTP ${response.status}`,
      );
    }

    try {
      return await response.json() as unknown;
    } catch {
      throw new BadGatewayException(
        'Witmango returned invalid JSON',
      );
    }
  }
}