#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const file = path.resolve(process.argv[2] || '');
if (!process.argv[2]) {
  console.error('Usage: node scripts/validate-training-program.js <training-program.json>');
  process.exit(1);
}
if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
  console.error('BLOCKED: Training program file not found: ' + file);
  process.exit(1);
}

const validator = require('./validate-training-model');
let data;
try {
  data = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch (error) {
  console.error('BLOCKED: Invalid JSON - ' + error.message);
  process.exit(1);
}

const result = validator.validateTrainingModel(data, { allowEmptyWeeks: false });
console.log('Father Empowering — Training model validation');
console.log('File:', file);
result.infos.forEach((message) => console.log('INFO: ' + message));
result.warnings.forEach((message) => console.log('WARNING: ' + message));
if (result.errors.length) {
  result.errors.forEach((message) => console.error('ERROR: ' + message));
  console.error('BLOCKED: ' + result.errors.length + ' Training model error(s).');
  process.exit(1);
}
console.log('TRAINING MODEL READY');
