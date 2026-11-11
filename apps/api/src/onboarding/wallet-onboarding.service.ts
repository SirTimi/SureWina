import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';

import { WalletService } from '../wallet/wallet.service';
import {
  IdentityVerificationService,
  VerifyBvnInput,
} from '../identity/identity-verification.service';
import {
  WitmangoWalletLinkService,
  WitmangoWalletState,
} from '../integrations/witmango/witmango-wallet-link.service';

export type OnboardWalletInput = VerifyBvnInput & {
  acceptTerms: boolean;
};

// What the customer is told about their wallet. Deliberately fewer states
// than exist internally — a customer cannot act on the difference between
// "in progress" and "under review", only on whether they can use it yet.
export type WalletSetupStatus =
  | 'NOT_STARTED'
  | 'READY'
  | 'BEING_SET_UP'
  | 'NOT_AVAILABLE';

export type WalletOnboardingView = {
  identity:
    | { verified: false }
    | { verified: true; firstName: string; lastName: string };
  wallet: { status: WalletSetupStatus };
};

const SETUP_STATUS: Record<WitmangoWalletState, WalletSetupStatus> = {
  NONE: 'NOT_STARTED',
  IN_PROGRESS: 'BEING_SET_UP',
  UNDER_REVIEW: 'BEING_SET_UP',
  READY: 'READY',
};

// Takes a customer from "phone number only" to "wallet ready to fund".
//
// Every step can be repeated safely, so a customer who is interrupted — or
// whose attempt fails partway — simply submits again:
//   1. Identity: an already-verified BVN is recognised and not re-charged.
//   2. Wallet accounts: opened once; a second request finds them in place.
//
// The BVN arrives with the request and is gone when it returns. It is never
// stored, which is why it is asked for again on a retry.
@Injectable()
export class WalletOnboardingService {
  private readonly logger = new Logger(WalletOnboardingService.name);

  constructor(
    private readonly identity: IdentityVerificationService,
    private readonly wallets: WalletService,
    private readonly links: WitmangoWalletLinkService,
  ) {}

  async getStatus(userId: string): Promise<WalletOnboardingView> {
    const identity = await this.identity.getStatus(userId);

    if (!identity.verified) {
      return {
        identity: { verified: false },
        wallet: { status: 'NOT_STARTED' },
      };
    }

    const wallet = await this.wallets.getCustomerWallet(userId);
    const state = await this.links.getState(wallet.walletId);

    return {
      identity: {
        verified: true,
        firstName: identity.firstName,
        lastName: identity.lastName,
      },
      wallet: { status: SETUP_STATUS[state] },
    };
  }

  async onboard(
    userId: string,
    input: OnboardWalletInput,
  ): Promise<WalletOnboardingView> {
    if (input.acceptTerms !== true) {
      throw new BadRequestException(
        'You must accept the wallet terms to continue',
      );
    }

    // Step 1. Throws on any identity problem — nothing below runs for a
    // customer who has not proven who they are.
    const identity = await this.identity.verifyBvn(userId, input);

    const wallet = await this.wallets.getCustomerWallet(userId);

    let state = await this.links.getState(wallet.walletId);
    let unavailable = false;

    // Step 2. Only ever attempted from a clean slate. If accounts are in
    // progress or under review, a previous attempt may have created them on
    // the CBA — repeating it could open a second pair.
    if (state === 'NONE') {
      try {
        await this.links.provisionForVerifiedCustomer(
          wallet.walletId,
          userId,
        );
      } catch (error) {
        // The customer's identity is verified regardless, and that must not
        // be undone or hidden by a failure here. Report where things stand
        // instead of failing the whole request.
        this.logger.warn(
          `Wallet setup did not complete for ${userId}: ${
            error instanceof Error ? error.message : 'unknown'
          }`,
        );
      }

      state = await this.links.getState(wallet.walletId);

      // Still nothing on record after trying: setup never began — the
      // integration is switched off, or this wallet needs migrating first.
      unavailable = state === 'NONE';
    }

    return {
      identity: {
        verified: true,
        firstName: identity.firstName,
        lastName: identity.lastName,
      },
      wallet: {
        status: unavailable ? 'NOT_AVAILABLE' : SETUP_STATUS[state],
      },
    };
  }
}