export class ObjectTooLargeError extends Error {
  public constructor(public readonly maxBytes: number) {
    super(`Stored object exceeds the ${maxBytes} byte read limit.`);
    this.name = 'ObjectTooLargeError';
  }
}
