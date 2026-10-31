// Test whether uiohook-napi can capture mouse events under elevated privilege.
// Run this with: node test-uiohook-elevated.cjs
// (or from an admin PowerShell: Start-Process node -ArgumentList test-uiohook-elevated.cjs -Verb RunAs)
const { uIOhook } = require('uiohook-napi')

console.log('Testing uiohook mouse capture (will run for 15 seconds)...')
console.log('Try double-clicking while the exam client is in fullscreen.')

let count = 0
uIOhook.on('mousedown', (e) => {
  count++
  console.log(`[${count}] mousedown button=${e.button} time=${e.time}`)
})

uIOhook.start()

setTimeout(() => {
  console.log(`\nCaptured ${count} mousedown events in 15 seconds.`)
  console.log('If count is 0 while you clicked, the hook is blocked.')
  uIOhook.stop()
  process.exit(0)
}, 15000)
