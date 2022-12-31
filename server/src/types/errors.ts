export class ApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly httpStatus: number,
    public readonly details?: string,
  ) {
    super(`APIError ${httpStatus} ${code}: ${details}`);
  }
}

export class ConflictError extends ApiError {
  constructor(code: string, details?: string) {
    super(code, 409, details);
  }
}

export class NotFoundError extends ApiError {
  constructor(code: string, details?: string) {
    super(code, 404, details);
  }
}

export class UnauthorizedError extends ApiError {
  constructor(code: string, details?: string) {
    super(code, 401, details);
  }
}

export class ForbiddenError extends ApiError {
  constructor(code: string, details?: string) {
    super(code, 403, details);
  }
}

export class BadRequestError extends ApiError {
  constructor(code: string, details?: string) {
    super(code, 400, details);
  }
}
