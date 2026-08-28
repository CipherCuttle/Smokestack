export class WitnessProtocolError extends Error {
  public readonly code: string;
  public readonly status: number;

  public constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'WitnessProtocolError';
    this.code = code;
    this.status = status;
  }
}

export function protocolError(code: string, message: string, status = 400): never {
  throw new WitnessProtocolError(code, message, status);
}
