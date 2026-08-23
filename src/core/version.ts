export const SMOKESTACK_VERSION = '0.0.0-pr00' as const;
export const FOUNDATION_STATE = 'PR00_CONSTITUTION_ONLY' as const;
export const PRODUCT_MODE = 'OBSERVATION_ONLY' as const;

export interface FoundationStatus {
  readonly version: typeof SMOKESTACK_VERSION;
  readonly state: typeof FOUNDATION_STATE;
  readonly mode: typeof PRODUCT_MODE;
  readonly liveProvidersAuthorized: false;
  readonly detectorAuthorized: false;
  readonly publicAlertsAuthorized: false;
  readonly tradingAuthorized: false;
}

export function foundationStatus(): FoundationStatus {
  return {
    version: SMOKESTACK_VERSION,
    state: FOUNDATION_STATE,
    mode: PRODUCT_MODE,
    liveProvidersAuthorized: false,
    detectorAuthorized: false,
    publicAlertsAuthorized: false,
    tradingAuthorized: false,
  };
}
