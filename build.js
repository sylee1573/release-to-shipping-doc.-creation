const { execSync } = require('child_process')
const path = require('path')

execSync('npm install && npm run build', {
  cwd: path.join(__dirname, 'frontend'),
  stdio: 'inherit'
})
