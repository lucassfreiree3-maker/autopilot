export type RegisterErrorBody = Record<string, unknown> | string;

export class RegisterProxyError extends Error {
  public readonly statusCode: number;

  public readonly responseBody: RegisterErrorBody;

  constructor(
    statusCode: number,
    responseBody: RegisterErrorBody,
    message = "Register request to Controller failed",
  ) {
    super(message);
    this.name = "RegisterProxyError";
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
}
