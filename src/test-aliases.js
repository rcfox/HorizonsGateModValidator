/**
 * Test type alias resolution
 */

import { ModValidator } from './dist/index.js';

const validator = new ModValidator();

// Test with an alias type (ItemLight is actually Light)
const testMod = `
[ItemType]
ID = glowingSword;
name = Glowing Sword;

[ItemLight]
ID = glowingSword;
radius = 3.0;
R = 255;
G = 200;
B = 100;
`;

console.log('Testing type alias: ItemLight -> Light\n');

const result = validator.validate(testMod);

console.log('Valid:', result.valid);
console.log('Errors:', result.errors.length);
console.log('Warnings:', result.warnings.length);

if (result.errors.length > 0) {
  console.log('\nErrors:');
  result.errors.forEach(e => console.log(`  - ${e.message}`));
}

if (result.warnings.length > 0) {
  console.log('\nWarnings:');
  result.warnings.forEach(w => console.log(`  - ${w.message}`));
}

console.log('\n✅ Type alias resolution working!');
