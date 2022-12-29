export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    public details?: string
  ) {
    super(`APIError ${status} ${code}: ${details}`);
  }
}

export class UsernameExistsError extends ApiError {
  constructor() {
    super("USERNAME_EXISTS", 409, "Username already exists");
  }
}
