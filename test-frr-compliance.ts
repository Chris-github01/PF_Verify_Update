/**
 * Test script to validate FRR compliance logic fixes
 * Run with: npx tsx test-frr-compliance.ts
 */

import { runFRRComplianceTests, validateFRRCompliance } from './src/lib/mapping/systemMatcher';

console.log('Running FRR Compliance Tests...\n');

// Run all tests
validateFRRCompliance();

// Get detailed results
const { passed, failed, results } = runFRRComplianceTests();

console.log('\nDetailed Test Results:');
console.log('======================\n');
results.forEach(result => console.log(result));

console.log('\n======================');
console.log(`Summary: ${passed} passed, ${failed} failed`);
console.log('======================\n');

if (failed > 0) {
  process.exit(1);
}

console.log('All FRR compliance tests passed successfully!');
process.exit(0);
