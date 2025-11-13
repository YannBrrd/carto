const { app } = require('electron');
console.log('app:', typeof app);
if (app) {
  console.log('App disableHardwareAcceleration:', typeof app.disableHardwareAcceleration);
}
