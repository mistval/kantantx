export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    public details?: string
  ) {
    super(`APIError ${status} ${code}: ${details}`);
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
