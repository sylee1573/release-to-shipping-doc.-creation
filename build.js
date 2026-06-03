const { execSync } = require('child_process')
const path = require('path')

const frontendDir = path.join(__dirname, 'frontend')
console.log('[build] frontend dir:', frontendDir)

try {
  execSync('npm install', { cwd: frontendDir, stdio: 'inherit' })
  execSync('npm run build', { cwd: frontendDir, stdio: 'inherit' })
} catch (e) {
  console.error('[build] failed:', e.message)
  process.exit(1)
}
