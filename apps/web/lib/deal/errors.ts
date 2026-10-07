/** Errors a flow raises on purpose, with the HTTP status the API should send. */
export class FlowError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 403 | 404 | 409 = 400,
  ) {
    super(message);
    this.name = "FlowError";
  }
}

export function notFound(what: string): FlowError {
  return new FlowError(`${what} not found.`, 404);
}
