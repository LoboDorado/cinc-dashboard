/** Error thrown for any non-2xx response from a registered Collector. */
export class CollectorError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    message?: string,
  ) {
    super(message ?? `collector returned ${status}`);
    this.name = "CollectorError";
  }

  get notFound() {
    return this.status === 404;
  }

  get unauthorized() {
    return this.status === 401;
  }
}

export function isCollectorError(e: unknown): e is CollectorError {
  return e instanceof CollectorError;
}
