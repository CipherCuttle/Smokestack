import { request as httpRequest } from 'node:http';
import type { IncomingHttpHeaders } from 'node:http';
import type { AppendResult, ClaimResult, ExactWindowObject, EpisodeBinding, JsonObject, ListResult, NamespaceRootResult, ReadResult, TerminalContractBinding, VerifyConsistencyResult, VerifyInclusionResult, WitnessCheckpoint, WitnessRecord } from './types.js';

export class WitnessClientError extends Error {
  public readonly status: number;
  public readonly code: string;

  public constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'WitnessClientError';
    this.status = status;
    this.code = code;
  }
}

export interface RawResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: unknown;
}

export class WitnessClient {
  private readonly baseUrl: URL;
  private readonly runtimeToken: string;

  public constructor(baseUrl: string, runtimeToken: string) {
    this.baseUrl = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
    this.runtimeToken = runtimeToken;
  }

  public async health(): Promise<RawResponse> {
    return this.raw('/healthz', 'GET');
  }

  public async readiness(): Promise<RawResponse> {
    return this.raw('/readyz', 'GET');
  }

  public async namespaceRoot(namespace: string, frozenGenesisPayload: JsonObject): Promise<NamespaceRootResult> {
    return this.json('/v1/namespaces/root', 'POST', { namespace, frozen_genesis_payload: frozenGenesisPayload }) as Promise<NamespaceRootResult>;
  }

  public async claimOnce(window: ExactWindowObject, windowClaimKey: string, episodeBinding: EpisodeBinding, terminalContractBinding: TerminalContractBinding): Promise<ClaimResult> {
    return this.json('/v1/claims/once', 'POST', { exact_window_object: window, window_claim_key: windowClaimKey, episode_binding: episodeBinding, TERMINAL_CONTRACT_BINDING: terminalContractBinding }) as Promise<ClaimResult>;
  }

  public async appendEvent(namespace: string, episodeBinding: EpisodeBinding, eventType: string, payload: JsonObject, writerSignature: string): Promise<AppendResult> {
    return this.json('/v1/events/append', 'POST', { namespace, episode_binding: episodeBinding, event_type: eventType, payload, writer_signature: writerSignature }) as Promise<AppendResult>;
  }

  /**
   * Returns the historical record plus the actual current namespace checkpoint.
   * The returned receipt proves historical inclusion only; use listNamespace
   * and verifyCurrentLineage for current completeness.
   */
  public async readEvent(namespace: string, namespaceGenesisId: string, sequence: number): Promise<ReadResult> {
    return this.json('/v1/events/read', 'POST', { namespace, namespace_genesis_id: namespaceGenesisId, sequence }) as Promise<ReadResult>;
  }

  public async listNamespace(namespace: string, namespaceGenesisId: string): Promise<ListResult> {
    return this.json('/v1/namespaces/list', 'POST', { namespace, namespace_genesis_id: namespaceGenesisId }) as Promise<ListResult>;
  }

  public async currentCheckpoint(namespace: string, namespaceGenesisId: string): Promise<WitnessCheckpoint> {
    return this.json('/v1/checkpoints/current', 'POST', { namespace, namespace_genesis_id: namespaceGenesisId }) as Promise<WitnessCheckpoint>;
  }

  public async verifyInclusion(checkpoint: WitnessCheckpoint, records: WitnessRecord[], targetSequence: number): Promise<VerifyInclusionResult> {
    return this.json('/v1/verify/inclusion', 'POST', { checkpoint, records, target_sequence: targetSequence }) as Promise<VerifyInclusionResult>;
  }

  public async verifyConsistency(oldCheckpoint: WitnessCheckpoint, newCheckpoint: WitnessCheckpoint, records: WitnessRecord[]): Promise<VerifyConsistencyResult> {
    return this.json('/v1/verify/consistency', 'POST', { old_checkpoint: oldCheckpoint, new_checkpoint: newCheckpoint, records }) as Promise<VerifyConsistencyResult>;
  }

  public async publicKey(): Promise<{ algorithm: string; public_key: string; key_id: string }> {
    return this.json('/v1/public-key', 'GET') as Promise<{ algorithm: string; public_key: string; key_id: string }>;
  }

  public async raw(path: string, method: 'GET' | 'POST' | 'DELETE' = 'POST', body?: unknown): Promise<RawResponse> {
    const url = new URL(path, this.baseUrl);
    const requestBody = body === undefined ? undefined : JSON.stringify(body);
    return new Promise<RawResponse>((resolve, reject) => {
      const request = httpRequest(url, {
        method,
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${this.runtimeToken}`,
          ...(requestBody === undefined ? {} : { 'content-type': 'application/json', 'content-length': Buffer.byteLength(requestBody) }),
        },
      }, (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let parsed: unknown = text;
          try {
            parsed = text.length === 0 ? null : JSON.parse(text) as unknown;
          } catch {
            parsed = text;
          }
          resolve({ status: response.statusCode ?? 0, headers: response.headers, body: parsed });
        });
      });
      request.on('error', reject);
      if (requestBody !== undefined) {
        request.write(requestBody);
      }
      request.end();
    });
  }

  private async json(path: string, method: 'GET' | 'POST', body?: unknown): Promise<unknown> {
    const response = await this.raw(path, method, body);
    if (response.status < 200 || response.status >= 300) {
      const errorBody = response.body as { error?: { code?: string; message?: string } };
      throw new WitnessClientError(response.status, errorBody.error?.code ?? 'HTTP_ERROR', errorBody.error?.message ?? 'witness request failed');
    }
    return response.body;
  }
}
