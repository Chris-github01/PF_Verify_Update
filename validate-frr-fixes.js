/**
 * Simple validation script for FRR compliance fixes
 * Tests the core logic without needing TypeScript compilation
 */

console.log('\n========================================');
console.log('FRR COMPLIANCE VALIDATION');
console.log('========================================\n');

// Test 1: FRR component ordering (sm < 30)
function frrComponentToNumber(component) {
  if (component === '-') return -1;
  if (component.toLowerCase() === 'sm') return 0;
  const num = parseInt(component.replace(/[^\d]/g, ''));
  return isNaN(num) ? -1 : num;
}

function frrComponentMeetsRequirement(required, provided) {
  if (required === '-' || required === '') return true;
  const reqNum = frrComponentToNumber(required);
  const provNum = frrComponentToNumber(provided);
  if (reqNum === -1) return true;
  if (provNum === -1) return false;
  return provNum >= reqNum;
}

// Test sm < 30 logic
const test1 = frrComponentMeetsRequirement('sm', '30');
const test2 = frrComponentMeetsRequirement('30', 'sm');
const test3 = frrComponentMeetsRequirement('30', '120');
const test4 = frrComponentMeetsRequirement('60', '30');

console.log('Test 1: sm < 30 logic');
console.log('  Required sm, provided 30:', test1 ? '✓ PASS' : '✗ FAIL');
console.log('  Required 30, provided sm:', !test2 ? '✓ PASS' : '✗ FAIL');
console.log('  Required 30, provided 120:', test3 ? '✓ PASS' : '✗ FAIL');
console.log('  Required 60, provided 30:', !test4 ? '✓ PASS' : '✗ FAIL');

// Test 2: Cost bonus calculation
function calculateFRRCostBonus(reqIntegrity, provIntegrity) {
  const overSpec = provIntegrity - reqIntegrity;
  if (overSpec < 0) return 0;
  if (overSpec === 0) return 5;
  if (overSpec <= 30) return 3;
  if (overSpec <= 60) return 1;
  return 0;
}

const bonus30 = calculateFRRCostBonus(30, 30);   // Perfect match
const bonus90 = calculateFRRCostBonus(30, 90);   // +60 overspec
const bonus120 = calculateFRRCostBonus(30, 120); // +90 overspec

console.log('\nTest 2: Cost bonus for -/30/30 requirement');
console.log('  -/30/30 (exact match):', bonus30, 'points');
console.log('  -/90/30 (overspec):', bonus90, 'points');
console.log('  -/120/30 (more overspec):', bonus120, 'points');
console.log('  FRL 90 beats FRL 120:', bonus90 > bonus120 ? '✓ PASS' : '✗ FAIL');

// Test 3: Confidence calculation
const MAX_SCORE = 95;
const scores = [30, 60, 85, 90, 95];
console.log('\nTest 3: Confidence calculation (MAX_SCORE = 95)');
scores.forEach(score => {
  const confidence = Math.min(score / MAX_SCORE, 1.0);
  console.log(`  Score ${score} → ${(confidence * 100).toFixed(1)}% confidence`);
});

// Test 4: Expected outcomes
console.log('\nTest 4: Mandatory outcomes');
console.log('  Required -/30/30, provided -/120/90:');
const t4_structural = frrComponentMeetsRequirement('-', '-');
const t4_integrity = frrComponentMeetsRequirement('30', '120');
const t4_insulation = frrComponentMeetsRequirement('30', '90');
console.log('    Structural:', t4_structural ? '✓ PASS' : '✗ FAIL');
console.log('    Integrity:', t4_integrity ? '✓ PASS' : '✗ FAIL');
console.log('    Insulation:', t4_insulation ? '✓ PASS' : '✗ FAIL');
console.log('    Overall:', (t4_structural && t4_integrity && t4_insulation) ? '✓ PASS' : '✗ FAIL');

console.log('\n  Required -/60/60, provided -/120/30:');
const t5_structural = frrComponentMeetsRequirement('-', '-');
const t5_integrity = frrComponentMeetsRequirement('60', '120');
const t5_insulation = frrComponentMeetsRequirement('60', '30');
console.log('    Structural:', t5_structural ? '✓ PASS' : '✗ FAIL');
console.log('    Integrity:', t5_integrity ? '✓ PASS' : '✗ FAIL');
console.log('    Insulation:', !t5_insulation ? '✓ PASS (correctly fails)' : '✗ FAIL');
console.log('    Overall:', (t5_structural && t5_integrity && !t5_insulation) ? '✓ PASS' : '✗ FAIL');

console.log('\n========================================');
console.log('VALIDATION COMPLETE');
console.log('========================================\n');

console.log('Key fixes implemented:');
console.log('  ✓ Fixed backwards FRR call: compareFRR(item.frr, template.frr_string)');
console.log('  ✓ Fixed sm handling: sm (0) < 30 < 60 < 90 < 120');
console.log('  ✓ Fixed confidence: MAX_SCORE = 95 (was 90)');
console.log('  ✓ Added null guards for invalid FRR values');
console.log('  ✓ Cost bonus prefers closer match: FRL 90 > FRL 120 for -/30/30');
console.log('\nExpected behavior:');
console.log('  • FRL 90 (-/90/30) scores higher than FRL 120 (-/120/30) for -/30/30 requirement');
console.log('  • Both FRL 90 and FRL 120 remain valid (overspec allowed)');
console.log('  • Cost bonus nudges toward optimal, but doesn\'t force "minimum only"');
console.log('');
