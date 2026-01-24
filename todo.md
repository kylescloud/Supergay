# Production Pool Discovery & Scan Test Plan

## Phase 1: Use Existing Pool Registry ✅
- [x] Found existing pool-registry.json with 477 pools
- [x] Verified registry structure and metadata
- [x] Confirmed pools from multiple DEXs included

## Phase 2: Use Existing Scan Script ✅
- [x] Found full-scan-detailed-logging.ts (288 lines)
- [x] Verified script structure and logging capabilities
- [x] Confirmed it loads from pool registry

## Phase 3: Run Production Scan
- [x] Create update-registry-and-scan.ts script
- [ ] Update pool registry state from blockchain
- [ ] Run full-scan-detailed-logging.ts
- [ ] Capture detailed output
- [ ] Analyze profit calculations

## Phase 4: Output Analysis & Documentation
- [x] Document existing infrastructure
- [x] Create production scan guide
- [x] Generate final summary
- [x] Create execution guide with expected output
- [x] Create comprehensive final report
- [x] Create GitHub branch setup instructions
- [x] Create GitHub token upload guide
- [x] Create automated upload script with token support
- [ ] User to run upload: bash git-push-with-token.sh OR manual commands
- [ ] User to run production scan: npx ts-node scripts/full-scan-detailed-logging.ts
- [ ] Review scan results JSON
- [ ] Verify profit calculations are correct
- [ ] Document findings from actual scan