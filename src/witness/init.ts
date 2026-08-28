import { createPublicKey } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { keyIdForPublicKey, loadEd25519PrivateKey } from './crypto.js';
import { initializeWitnessDatabase, type WitnessStoreIdentity } from './store.js';

export function initializeWitnessFromEnvironment(environment: NodeJS.ProcessEnv = process.env): WitnessStoreIdentity & { database_path: string } {
  const databasePath = requiredEnvironmentFrom(environment, 'WITNESS_DATABASE_PATH');
  const deploymentId = requiredEnvironmentFrom(environment, 'WITNESS_DEPLOYMENT_ID');
  const databaseInstanceId = requiredEnvironmentFrom(environment, 'WITNESS_DATABASE_INSTANCE_ID');
  const signingKeyPath = requiredEnvironmentFrom(environment, 'WITNESS_SIGNING_KEY_PATH');
  const privateKey = loadEd25519PrivateKey(readFileSync(signingKeyPath, 'utf8'));
  const signingKeyId = keyIdForPublicKey(createPublicKey(privateKey));
  const identity: WitnessStoreIdentity = {
    deployment_id: deploymentId,
    database_instance_id: databaseInstanceId,
    signing_key_id: signingKeyId,
  };
  initializeWitnessDatabase(databasePath, identity);
  return { database_path: databasePath, ...identity };
}

function requiredEnvironmentFrom(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.stdout.write(`${JSON.stringify(initializeWitnessFromEnvironment(), null, 2)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'witness initialization failed';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
