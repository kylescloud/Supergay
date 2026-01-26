const fs = require('fs');

console.log('='.repeat(80));
console.log('Pool Discovery Monitor');
console.log('='.repeat(80));
console.log('');

// Check if discovery is still running
try {
  const output = fs.readFileSync('data/pool-discovery-output.log', 'utf8');
  const lines = output.split('\n');
  
  console.log('Last 10 lines of output:');
  console.log(lines.slice(-10).join('\n'));
  console.log('');
  
  // Count pools found
  const poolsFound = (output.match(/Added.*pool/g) || []).length;
  console.log(`Pools Found: ${poolsFound}`);
  
  // Count errors
  const errors = (output.match(/\[ERROR\]/g) || []).length;
  console.log(`Errors: ${errors}`);
  
  // Check if process is still running
  const { execSync } = require('child_process');
  try {
    const ps = execSync('ps aux | grep "ts-node.*run-full-pool-discovery" | grep -v grep', { encoding: 'utf8' });
    if (ps.trim()) {
      console.log('Status: RUNNING');
    } else {
      console.log('Status: COMPLETED OR STOPPED');
    }
  } catch (e) {
    console.log('Status: COMPLETED OR STOPPED');
  }
  
} catch (e) {
  console.log('No discovery output found');
  console.log('Discovery may not have started yet');
}

console.log('');
console.log('='.repeat(80));