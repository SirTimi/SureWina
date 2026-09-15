import {
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type MonnifyResponse<T> = {
  requestSuccessful?: boolean;
  responseMessage?: string;
  responseCode?: string;
  responseBody?: T;
};

export type MonnifyHttpResult<T> = {
  httpStatus: number;
  payload: MonnifyResponse<T> | null;
};

type MonnifyAuthBody = {
  accessToken?: string;
  expiresIn?: number;
};

@Injectable()
export class MonnifyClientService {
  private accessToken: string | null = null;
  private accessTokenExpiresAt = 0;

  constructor(
    private readonly config: ConfigService,
  ) {}

  private get baseUrl(): string {
    return (
      this.config.get<string>('MONNIFY_BASE_URL') ??
      'https://sandbox.monnify.com'
    ).replace(/\/$/, '');
  }

  private async getAccessToken(): Promise<string> {
    /*
     * Reuse the token while it is still safely inside its lifetime.
     *
     * Monnify access tokens are valid for about one hour.
     * We refresh early rather than waiting for exact expiry.
     */
    if (
      this.accessToken &&
      Date.now() < this.accessTokenExpiresAt
    ) {
      return this.accessToken;
    }

    const apiKey =
      this.config.get<string>('MONNIFY_API_KEY');

    const secretKey =
      this.config.get<string>('MONNIFY_SECRET_KEY');

    if (!apiKey || !secretKey) {
      throw new InternalServerErrorException(
        'Monnify is not configured',
      );
    }

    const credentials = Buffer.from(
      `${apiKey}:${secretKey}`,
    ).toString('base64');

    let response: Response;

    try {
      response = await fetch(
        `${this.baseUrl}/api/v1/auth/login`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${credentials}`,
          },
        },
      );
    } catch {
      throw new ServiceUnavailableException(
        'Monnify authentication service is unreachable',
      );
    }

    const payload =
      (await response.json().catch(() => null)) as
        | MonnifyResponse<MonnifyAuthBody>
        | null;

    const token =
      payload?.responseBody?.accessToken;

    if (
      !response.ok ||
      !payload?.requestSuccessful ||
      !token
    ) {
      throw new ServiceUnavailableException(
        payload?.responseMessage ??
          'Could not authenticate with Monnify',
      );
    }

    const expiresIn =
      payload.responseBody?.expiresIn;

    /*
     * If Monnify returns expiresIn, refresh one minute early.
     * Otherwise use a conservative 55-minute cache.
     */
    const ttlSeconds =
      typeof expiresIn === 'number' &&
      expiresIn > 120
        ? expiresIn - 60
        : 55 * 60;

    this.accessToken = token;

    this.accessTokenExpiresAt =
      Date.now() + ttlSeconds * 1000;

    return token;
  }

  private clearToken() {
    this.accessToken = null;
    this.accessTokenExpiresAt = 0;
  }

  async request<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<MonnifyHttpResult<T>> {
    let token = await this.getAccessToken();

    let result = await this.requestOnce<T>(
      token,
      path,
      init,
    );

    /*
     * Access tokens expire.
     *
     * If Monnify rejects the cached token, authenticate once
     * more and replay the request exactly once.
     */
    if (result.httpStatus === 401) {
      this.clearToken();

      token = await this.getAccessToken();

      result = await this.requestOnce<T>(
        token,
        path,
        init,
      );
    }

    return result;
  }

  private async requestOnce<T>(
    token: string,
    path: string,
    init: RequestInit,
  ): Promise<MonnifyHttpResult<T>> {
    let response: Response;

    try {
      response = await fetch(
        `${this.baseUrl}${path}`,
        {
          ...init,

          headers: {
            ...(init.headers as
              | Record<string, string>
              | undefined),

            Authorization: `Bearer ${token}`,
          },
        },
      );
    } catch {
      throw new ServiceUnavailableException(
        'Monnify service is unreachable',
      );
    }

    const payload =
      (await response.json().catch(() => null)) as
        | MonnifyResponse<T>
        | null;

    return {
      httpStatus: response.status,
      payload,
    };
  }
}