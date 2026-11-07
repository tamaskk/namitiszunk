/**
 * Errors a service throws on purpose. The API wrapper (apps/api/lib/handler.ts) maps them to
 * `{ error: { code, messageKey, fields } }` with `status`; anything else is a 500.
 * A missing permission is T-023's `Forbidden` (@namitiszunk/core/auth), an AppError with status 403.
 */
export class AppError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 429,
    readonly code: string,
    readonly fields?: Record<string, string>,
  ) {
    super(code);
    this.name = "AppError";
  }

  /** Key in the `apiErrors` namespace of @namitiszunk/i18n; clients translate it. */
  get messageKey(): string {
    return `apiErrors.${this.code}`;
  }
}

export class NotFoundError extends AppError {
  constructor() {
    super(404, "not_found");
  }
}

export class ConflictError extends AppError {
  constructor(code = "conflict") {
    super(409, code);
  }
}
