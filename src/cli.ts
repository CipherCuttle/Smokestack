#!/usr/bin/env node
import { foundationStatus, SMOKESTACK_VERSION } from './core/version.js';

const args = process.argv.slice(2);

if (args.includes('--version')) {
  process.stdout.write(`${SMOKESTACK_VERSION}\n`);
  process.exit(0);
}

if (args.length === 0 || args[0] === 'status') {
  process.stdout.write(`${JSON.stringify(foundationStatus(), null, 2)}\n`);
  process.exit(0);
}

process.stderr.write('Usage: smokestack [status|--version]\n');
process.exit(2);
