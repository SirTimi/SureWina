import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { RequestContextService } from '../request-context/request-context.service';

type ErrorResponseBody = {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  method: string;
  timestamp: string;
  requestId: string | null;
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(private readonly requestContextService: RequestContextService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<FastifyRequest>();
    const reply = context.getResponse<FastifyReply>();

    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;

    const responseBody: ErrorResponseBody = {
      statusCode,
      error: this.getErrorName(exception, statusCode),
      message: this.getErrorMessage(exceptionResponse, exception),
      path: request.url,
      method: request.method,
      timestamp: new Date().toISOString(),
      requestId: this.requestContextService.getRequestId() ?? null,
    };

    if (statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.url} failed`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    reply.status(statusCode).send(responseBody);
  }

  private getErrorName(exception: unknown, statusCode: number) {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();

      if (
        typeof response === 'object' &&
        response !== null &&
        'error' in response &&
        typeof response.error === 'string'
      ) {
        return response.error;
      }

      return exception.name;
    }

    return statusCode === HttpStatus.INTERNAL_SERVER_ERROR
      ? 'Internal Server Error'
      : 'Error';
  }

  private getErrorMessage(
    exceptionResponse: string | object | null,
    exception: unknown,
  ) {
    if (typeof exceptionResponse === 'string') {
      return exceptionResponse;
    }

    if (
      exceptionResponse &&
      typeof exceptionResponse === 'object' &&
      'message' in exceptionResponse
    ) {
      const message = exceptionResponse.message;

      if (typeof message === 'string' || Array.isArray(message)) {
        return message;
      }
    }

    if (exception instanceof Error && process.env.NODE_ENV !== 'production') {
      return exception.message;
    }

    return 'Unexpected server error';
  }
}