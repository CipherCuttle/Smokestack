import assert from 'node:assert/strict';
import test from 'node:test';
import { foundationStatus } from '../src/core/version.js';

test('PR-00 foundation is fail-closed', () => {
  const status = foundationStatus();
  assert.equal(status.state, 'PR00_CONSTITUTION_ONLY');
  assert.equal(status.mode, 'OBSERVATION_ONLY');
  assert.equal(status.liveProvidersAuthorized, false);
  assert.equal(status.detectorAuthorized, false);
  assert.equal(status.publicAlertsAuthorized, false);
  assert.equal(status.tradingAuthorized, false);
});
