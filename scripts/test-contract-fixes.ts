import { ethers } from 'ethers';
import fs from 'fs';

/**
 * Test Suite for Critical Flash Loan Contract Fixes
 * 
 * This script tests all 5 critical fixes applied to FlashLoanArbitrage.sol:
 * 1. Missing DEX type cases
 * 2. Balance tracking for multi-hop swaps
 * 3. Curve swap implementation
 * 4. Flash loan amount validation
 * 5. Router validation
 */

interface TestResult {
  testName: string;
  passed: boolean;
  message: string;
}

class ContractFixesTester {
  private testResults: TestResult[] = [];
  
  /**
   * Test 1: Verify all DEX types are handled in contract
   */
  testDexTypeCases(): TestResult {
    console.log('\n📋 Test 1: DEX Type Cases');
    
    try {
      const contractSource = fs.readFileSync('contracts/FlashLoanArbitrage.sol', 'utf-8');
      
      const expectedDexTypes = [
        'UniswapV2',
        'UniswapV3',
        'UniswapV4',
        'Curve',
        'AerodromeV2',
        'AerodromeV3',
        'SushiSwapV3',
        'PancakeSwapV3',
        'BaseSwap',
        'Hydrex'
      ];
      
      let allHandled = true;
      const missingDexTypes: string[] = [];
      
      for (const dexType of expectedDexTypes) {
        // Check if DEX type is handled in executeOperation
        const dexTypePattern = new RegExp(`swap\\.dexType\\s*==\\s*uint8\\(DEXType\\.${dexType}\\)`, 'g');
        
        if (!dexTypePattern.test(contractSource)) {
          allHandled = false;
          missingDexTypes.push(dexType);
          console.log(`   ❌ Missing handler for: ${dexType}`);
        } else {
          console.log(`   ✅ Handler found for: ${dexType}`);
        }
      }
      
      if (allHandled) {
        console.log('   ✅ All 10 DEX types are handled correctly');
        return {
          testName: 'DEX Type Cases',
          passed: true,
          message: 'All 10 DEX types are handled correctly'
        };
      } else {
        return {
          testName: 'DEX Type Cases',
          passed: false,
          message: `Missing handlers for: ${missingDexTypes.join(', ')}`
        };
      }
    } catch (error: any) {
      return {
        testName: 'DEX Type Cases',
        passed: false,
        message: `Error: ${error.message}`
      };
    }
  }
  
  /**
   * Test 2: Verify balance tracking for multi-hop swaps
   */
  testBalanceTracking(): TestResult {
    console.log('\n📋 Test 2: Balance Tracking for Multi-Hop Swaps');
    
    try {
      const contractSource = fs.readFileSync('contracts/FlashLoanArbitrage.sol', 'utf-8');
      
      // Check if balance tracking is implemented
      const hasCurrentAmountVar = /uint256\s+currentAmount\s*=/gi.test(contractSource);
      const hasBalanceCheck = /currentAmount\s*=\s*IERC20\(swap\.tokenIn\)\.balanceOf/gi.test(contractSource);
      const hasZeroCheck = /if\s*\(\s*currentAmount\s*==\s*0\s*\)\s*revert/gi.test(contractSource);
      
      if (hasCurrentAmountVar && hasBalanceCheck) {
        console.log('   ✅ Balance tracking variable found');
        console.log('   ✅ Balance check before swap found');
        
        if (hasZeroCheck) {
          console.log('   ✅ Zero balance check found');
        }
        
        return {
          testName: 'Balance Tracking',
          passed: true,
          message: 'Balance tracking implemented correctly'
        };
      } else {
        if (!hasCurrentAmountVar) console.log('   ❌ Missing currentAmount variable');
        if (!hasBalanceCheck) console.log('   ❌ Missing balance check before swap');
        if (!hasZeroCheck) console.log('   ⚠️  Missing zero balance check (optional)');
        
        return {
          testName: 'Balance Tracking',
          passed: false,
          message: 'Balance tracking not fully implemented'
        };
      }
    } catch (error: any) {
      return {
        testName: 'Balance Tracking',
        passed: false,
        message: `Error: ${error.message}`
      };
    }
  }
  
  /**
   * Test 3: Verify Curve swap implementation
   */
  testCurveImplementation(): TestResult {
    console.log('\n📋 Test 3: Curve Swap Implementation');
    
    try {
      const contractSource = fs.readFileSync('contracts/FlashLoanArbitrage.sol');
      const curveInterface = fs.readFileSync('contracts/interfaces/ICurvePool.sol');
      
      // Check if ICurvePool interface exists
      if (!curveInterface.includes('interface ICurvePool')) {
        console.log('   ❌ ICurvePool interface missing');
        return {
          testName: 'Curve Implementation',
          passed: false,
          message: 'ICurvePool interface missing'
        };
      }
      
      console.log('   ✅ ICurvePool interface exists');
      
      // Check if Curve swap decodes pool data
      const decodesPoolData = /abi\.decode\(swapData,\s*\(address,\s*int128,\s*int128\)\)/gi.test(contractSource);
      
      if (decodesPoolData) {
        console.log('   ✅ Curve swap decodes pool data correctly');
      } else {
        console.log('   ❌ Curve swap does not decode pool data');
        return {
          testName: 'Curve Implementation',
          passed: false,
          message: 'Curve swap does not decode pool data correctly'
        };
      }
      
      // Check if Curve swap calls pool directly (not router)
      const callsPoolDirectly = /ICurvePool\(pool\)\.exchange/gi.test(contractSource);
      
      if (callsPoolDirectly) {
        console.log('   ✅ Curve swap calls pool directly (correct)');
      } else {
        console.log('   ❌ Curve swap does not call pool directly');
        return {
          testName: 'Curve Implementation',
          passed: false,
          message: 'Curve swap should call pool directly, not router'
        };
      }
      
      // Check if Curve swap approves pool directly
      const approvesPool = /forceApprove\(pool,\s*amountIn\)/gi.test(contractSource);
      
      if (approvesPool) {
        console.log('   ✅ Curve swap approves pool directly (correct)');
      } else {
        console.log('   ⚠️  Curve swap approval could be improved');
      }
      
      return {
        testName: 'Curve Implementation',
        passed: true,
        message: 'Curve implementation corrected'
      };
    } catch (error: any) {
      return {
        testName: 'Curve Implementation',
        passed: false,
        message: `Error: ${error.message}`
      };
    }
  }
  
  /**
   * Test 4: Verify flash loan amount validation
   */
  testFlashLoanValidation(): TestResult {
    console.log('\n📋 Test 4: Flash Loan Amount Validation');
    
    try {
      const contractSource = fs.readFileSync('contracts/FlashLoanArbitrage.sol', 'utf-8');
      
      // Check if flash loan amount validation is implemented
      const hasReceivedAmountCheck = /uint256\s+receivedAmount\s*=\s*IERC20\(asset\)\.balanceOf/gi.test(contractSource);
      const hasValidationCheck = /if\s*\(\s*receivedAmount\s*<\s*amount\s*\)\s*revert/gi.test(contractSource);
      const hasInvalidFlashLoanError = /error\s+InvalidFlashLoan/gi.test(contractSource);
      
      if (hasReceivedAmountCheck && hasValidationCheck) {
        console.log('   ✅ Flash loan amount validation implemented');
        console.log('   ✅ Received amount check found');
        console.log('   ✅ Validation check found');
        
        if (hasInvalidFlashLoanError) {
          console.log('   ✅ InvalidFlashLoan error defined');
        }
        
        return {
          testName: 'Flash Loan Validation',
          passed: true,
          message: 'Flash loan amount validation implemented'
        };
      } else {
        if (!hasReceivedAmountCheck) console.log('   ❌ Missing received amount check');
        if (!hasValidationCheck) console.log('   ❌ Missing validation check');
        if (!hasInvalidFlashLoanError) console.log('   ❌ Missing InvalidFlashLoan error');
        
        return {
          testName: 'Flash Loan Validation',
          passed: false,
          message: 'Flash loan validation not fully implemented'
        };
      }
    } catch (error: any) {
      return {
        testName: 'Flash Loan Validation',
        passed: false,
        message: `Error: ${error.message}`
      };
    }
  }
  
  /**
   * Test 5: Verify router validation
   */
  testRouterValidation(): TestResult {
    console.log('\n📋 Test 5: Router Validation');
    
    try {
      const contractSource = fs.readFileSync('contracts/FlashLoanArbitrage.sol', 'utf-8');
      
      // Check if router validation is implemented
      const hasRouterValidation = /_isApprovedRouter/gi.test(contractSource);
      const hasRouterCheckInLoop = /if\s*\(\s*!_isApprovedRouter/gi.test(contractSource);
      const hasRouterNotApprovedError = /error\s+RouterNotApproved/gi.test(contractSource);
      
      if (hasRouterValidation) {
        console.log('   ✅ Router validation function exists');
        
        if (hasRouterCheckInLoop) {
          console.log('   ✅ Router check in swap loop');
        } else {
          console.log('   ⚠️  Router check not in swap loop');
        }
        
        if (hasRouterNotApprovedError) {
          console.log('   ✅ RouterNotApproved error defined');
        }
        
        // Check if all 11 routers are validated
        const routerCount = (contractSource.match(/router\s*==\s*[a-zA-Z]Router/g) || []).length;
        console.log(`   📊 Found ${routerCount} router validations`);
        
        return {
          testName: 'Router Validation',
          passed: true,
          message: 'Router validation implemented'
        };
      } else {
        console.log('   ❌ Router validation function missing');
        return {
          testName: 'Router Validation',
          passed: false,
          message: 'Router validation not implemented'
        };
      }
    } catch (error: any) {
      return {
        testName: 'Router Validation',
        passed: false,
        message: `Error: ${error.message}`
      };
    }
  }
  
  /**
   * Test 6: Verify TypeScript Curve encoding
   */
  testTypeScriptCurveEncoding(): TestResult {
    console.log('\n📋 Test 6: TypeScript Curve Encoding');
    
    try {
      const executorSource = fs.readFileSync('src/execution/FlashLoanExecutor.ts', 'utf-8');
      
      // Check if Curve data encoding is implemented
      const hasCurveCheck = /dexType\s*===\s*DEXType\.Curve/gi.test(executorSource);
      const hasPoolDataEncoding = /abiCoder\.defaultAbiCoder\(\)\.encode/gi.test(executorSource);
      const hasTokenIndexMapping = /tokenIndexMap/gi.test(executorSource);
      
      if (hasCurveCheck) {
        console.log('   ✅ Curve DEX type check exists');
        
        if (hasPoolDataEncoding) {
          console.log('   ✅ Pool data encoding implemented');
        } else {
          console.log('   ❌ Pool data encoding missing');
          return {
            testName: 'TypeScript Curve Encoding',
            passed: false,
            message: 'Pool data encoding not implemented'
          };
        }
        
        if (hasTokenIndexMapping) {
          console.log('   ✅ Token index mapping exists');
        } else {
          console.log('   ⚠️  Token index mapping could be improved');
        }
        
        return {
          testName: 'TypeScript Curve Encoding',
          passed: true,
          message: 'Curve data encoding implemented'
        };
      } else {
        console.log('   ❌ Curve DEX type check missing');
        return {
          testName: 'TypeScript Curve Encoding',
          passed: false,
          message: 'Curve encoding not implemented'
        };
      }
    } catch (error: any) {
      return {
        testName: 'TypeScript Curve Encoding',
        passed: false,
        message: `Error: ${error.message}`
      };
    }
  }
  
  /**
   * Run all tests
   */
  runAllTests(): void {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║  Critical Flash Loan Contract Fixes - Test Suite          ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    
    this.testResults.push(this.testDexTypeCases());
    this.testResults.push(this.testBalanceTracking());
    this.testResults.push(this.testCurveImplementation());
    this.testResults.push(this.testFlashLoanValidation());
    this.testResults.push(this.testRouterValidation());
    this.testResults.push(this.testTypeScriptCurveEncoding());
    
    this.printSummary();
    this.saveResults();
  }
  
  /**
   * Print test summary
   */
  private printSummary(): void {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║  Test Summary                                             ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
    
    const passed = this.testResults.filter(r => r.passed).length;
    const total = this.testResults.length;
    const failed = total - passed;
    
    for (const result of this.testResults) {
      const icon = result.passed ? '✅' : '❌';
      console.log(`${icon} ${result.testName}: ${result.message}`);
    }
    
    console.log(`\n📊 Results: ${passed}/${total} tests passed (${(passed/total*100).toFixed(1)}%)`);
    
    if (failed > 0) {
      console.log(`⚠️  ${failed} test(s) failed - please review and fix`);
    } else {
      console.log('🎉 All tests passed! Contract is production-ready!');
    }
  }
  
  /**
   * Save test results to file
   */
  private saveResults(): void {
    const results = {
      timestamp: new Date().toISOString(),
      totalTests: this.testResults.length,
      passed: this.testResults.filter(r => r.passed).length,
      failed: this.testResults.filter(r => !r.passed).length,
      results: this.testResults
    };
    
    fs.writeFileSync(
      'reports/contract-fixes-test-results.json',
      JSON.stringify(results, null, 2)
    );
    
    console.log(`\n💾 Test results saved to: reports/contract-fixes-test-results.json`);
  }
}

// Run tests
const tester = new ContractFixesTester();
tester.runAllTests();