export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, code = "VALIDATION_ERROR") => new AppError(400, code, message);
export const unauthorized = () => new AppError(401, "UNAUTHENTICATED", "Please log in to continue.");
export const forbidden = (message = "You do not have permission to perform this action.") =>
  new AppError(403, "FORBIDDEN", message);
export const notFound = (message = "Not found.") => new AppError(404, "NOT_FOUND", message);
export const conflict = (message: string, code = "CONFLICT") => new AppError(409, code, message);
export const unprocessable = (message: string, code: string) => new AppError(422, code, message);
