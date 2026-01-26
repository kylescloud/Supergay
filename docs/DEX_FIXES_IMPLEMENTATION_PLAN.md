# DEX Configuration Fixes - Production Implementation Plan

**Date:** 2026-01-25  
**Status:** Ready for Implementation  
**Complexity:** High - Affects core pool discovery system

---

## Architecture Analysis Complete

### Current State

**Fetchers Implemented (6):**
1. Uniswap V2 - V2-style AMM
2. Uniswap V3 - V3 CL AMM with Factory
3. Curve - Registry-based stable pools
4. SushiSwap V3 - V3 CL AMM
5. PancakeSwap V3 - V3 CL AMM
6. Aerodrome - Hybrid V2/V3 (generic)

**Fetchers Missing (4):**
1. Uniswap V4 - NEW: Pool Manager architecture (no Factory!)
2. Aerodrome SlipStream - V3 CL AMM
3. Aerodrome SlipStream 2 - V3 CL AMM
4. BaseSwap - V2-style AMM

### DEX Naming Convention

**Standard Used:** kebab-case (e.g., `uniswap-v3`, `aerodrome-slipstream`)

**Components:**
- DEXManager: kebab-case ✅
- Pool Registry: kebab-case ✅
- PoolDiscovery: title case ❌ (inconsistent!)
- Fetchers: title case ❌ (inconsistent!)

### Factory Addresses (from DEX_CONFIG constants)

| DEX | Factory | Router | Version |
|-----|---------|--------|---------|
| Uniswap V4 | PoolManager: `0x4985...` | UniversalRouter: `0x6ff5...` | v4 |
| Uniswap V3 | Factory: `0x3312...` | SwapRouter: `0xE592...` | v3 |
| Uniswap V2 | Factory: `0x8909...` | Router: `0x4752...` | v2 |
| Curve | Factory: `0xF017...` | Router: `0x99a5...` | curve |
| SushiSwap V3 | Factory: `0xc35D...` | Router: `0x1b02...` | v3 |
| PancakeSwap V3 | Factory: `0x0BFb...` | Router: `0x1b81...` | v3 |
| Aerodrome | Factory: `0x420D...` | Router: `0xcF77...` | v2 |
| Aerodrome SlipStream | Factory: `0x420D...` | Router: `0xbe6d...` | v3 |
| Aerodrome SlipStream 2 | Factory: `0x420D...` | Router: `0x51ca...` | v3 |
| BaseSwap | Factory: `0x8909...` | Router: `0x4752...` | v2 |

---

## Implementation Strategy

### Phase 1: File Versioning & Backup

**Files to Backup/Rename:**
1. `src/pools/discovery.ts` → `src/pools/discovery.ts.v1.bak`
2. `src/pools/types.ts` → `src/pools/types.ts.v1.bak`

**Reason:** These are critical files that will have breaking changes.

### Phase 2: Unified Configuration

**Create:** `src/config/dexDiscoveryConfig.ts`
- Import DEX_CONFIG from constants
- Map to PoolDiscovery DEXConfig format
- Standardize DEX names to kebab-case
- Add all 10 DEXs with correct addresses

**Benefits:**
- Single source of truth
- Type-safe configuration
- Easy to maintain
- Consistent across all components

### Phase 3: Extend DEXConfig Type

**Update:** `src/pools/types.ts`
- Add optional fields for different architectures:
  - `poolManager?` (for Uniswap V4)
  - `router?` (for all DEXs)
  - `quoter?` (for V3 DEXs)
- Add `dexId` for standardized kebab-case naming
- Add `factory` (if applicable) or `poolManager` (for V4)

### Phase 4: Implement Missing Fetchers

#### 4.1 Uniswap V4 Fetcher

**Architecture Differences:**
- NO Factory contract
- Uses Pool Manager (`0x4985...b2b`)
- Uses StateView contract for pool state
- Pools are created via Pool Manager, not Factory

**Implementation:**
```typescript
// src/pools/fetchers/uniswapV4.ts
- Fetch pools from Pool Manager events
- Use StateView contract for pool state
- Handle V4-specific data structures
```

#### 4.2 Aerodrome SlipStream Fetcher

**Architecture:**
- Uses Factory (same as Aerodrome)
- V3 CL AMM
- Different router address

**Implementation:**
```typescript
// src/pools/fetchers/aerodromeSlipStream.ts
- Extend or copy Aerodrome fetcher
- Use specific router for quoter
- Set dex to 'aerodrome-slipstream'
- Set version to 'v3'
```

#### 4.3 Aerodrome SlipStream 2 Fetcher

**Architecture:**
- Uses Factory (same as Aerodrome)
- V3 CL AMM
- Different router address

**Implementation:**
```typescript
// src/pools/fetchers/aerodromeSlipStream2.ts
- Extend or copy Aerodrome fetcher
- Use specific router for quoter
- Set dex to 'aerodrome-slipstream-2'
- Set version to 'v3'
```

#### 4.4 BaseSwap Fetcher

**Architecture:**
- V2-style AMM (same as Uniswap V2)
- Uses Factory and allPairs
- Different factory address

**Implementation:**
```typescript
// src/pools/fetchers/baseSwap.ts
- Copy Uniswap V2 fetcher
- Use BaseSwap factory address
- Set dex to 'baseswap'
- Set version to 'v2'
```

### Phase 5: Update PoolDiscovery

**Changes:**
1. Import unified DEX config
2. Replace local DEX_CONFIGS array
3. Add cases for 4 missing DEXs in fetcher switch
4. Standardize DEX names to kebab-case
5. Update logging to show all 10 DEXs

### Phase 6: Testing & Verification

**Test Plan:**
1. Run pool discovery with all 10 DEXs
2. Verify each DEX produces pools
3. Check DEX names are standardized
4. Validate factory addresses
5. Test registry merge logic
6. Run full arbitrage scan

---

## Risk Assessment

### High Risk Changes
1. **Uniswap V4 Fetcher** - New architecture, untested
2. **PoolDiscovery rewrite** - Core system, breaking changes

### Medium Risk Changes
1. **DEXConfig type extension** - Affects all fetchers
2. **Aerodrome SlipStream fetchers** - New but similar to existing

### Low Risk Changes
1. **BaseSwap fetcher** - Copy of Uniswap V2
2. **Unified configuration** - Refactoring only

### Mitigation Strategies
1. Extensive testing after each phase
2. Rollback plans for each change
3. Incremental implementation
4. Comprehensive error handling

---

## Dependency Chain

```
DEX_CONFIG (constants.ts)
    ↓
Unified DEX Config (dexDiscoveryConfig.ts)
    ↓
PoolDiscovery (discovery.ts)
    ↓
Fetchers (individual files)
    ↓
Pool Registry (registry.ts)
    ↓
OpportunityFinder (opportunityFinder.ts)
    ↓
Arbitrage Strategies (strategies/)
```

**Critical Path:** Any change to DEX_CONFIG affects all downstream components.

---

## Breaking Changes

1. **DEXConfig Type Extension**
   - Adds optional fields
   - Backward compatible (fetchers can ignore new fields)

2. **PoolDiscovery DEX Names**
   - Changes from title case to kebab-case
   - Affects pool registry dex field
   - Requires registry update or migration

3. **New Fetchers**
   - Adds 4 new fetcher files
   - No breaking changes to existing code

---

## Success Criteria

### Functional Requirements
- ✅ All 10 DEXs configured
- ✅ All 10 DEXs discover pools
- ✅ DEX names standardized (kebab-case)
- ✅ Factory addresses match constants
- ✅ No breaking changes to existing functionality

### Performance Requirements
- ✅ Discovery completes within 5 minutes
- ✅ Memory usage < 1GB
- ✅ RPC calls optimized (multicall)
- ✅ Registry merge logic works

### Quality Requirements
- ✅ All code is production-grade
- ✅ Comprehensive error handling
- ✅ Detailed logging
- ✅ Type-safe throughout

---

## Implementation Order

1. **Phase 1:** File versioning & backup
2. **Phase 2:** Unified configuration creation
3. **Phase 3:** Type extensions
4. **Phase 4:** Implement BaseSwap fetcher (easiest)
5. **Phase 4:** Implement Aerodrome SlipStream fetchers (medium)
6. **Phase 4:** Implement Uniswap V4 fetcher (hardest)
7. **Phase 5:** Update PoolDiscovery
8. **Phase 6:** Testing & verification

**Estimated Time:** 2-3 hours for all phases

---

## Rollback Plan

If any phase fails:
1. Restore from versioned backup
2. Document failure
3. Analyze root cause
4. Implement fix
5. Retry

---

**Plan Approved:** Ready for Implementation  
**Next Step:** Phase 1 - File Versioning & Backup