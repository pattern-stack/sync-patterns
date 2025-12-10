/**
 * Demo script to showcase all 19 UIType renderers
 */

import { renderField } from './dist/tui/index.js';

console.log('\n' + '='.repeat(60));
console.log('TUI Field Renderers Demo - All 19 UITypes');
console.log('='.repeat(60) + '\n');

// Text types
console.log('TEXT TYPES:');
console.log('  text:', renderField('Hello, World!', 'text'));
console.log('  password:', renderField('secret123', 'password'));
console.log('  email:', renderField('user@example.com', 'email'));
console.log('  url:', renderField('https://www.example.com/very/long/path/to/page', 'url'));
console.log('  phone:', renderField('+1 (555) 123-4567', 'phone'));
console.log();

// Numeric types
console.log('NUMERIC TYPES:');
console.log('  number:', renderField(1234567.89, 'number', { decimals: 2 }));
console.log('  money:', renderField(1234.56, 'money', { currency: 'USD' }));
console.log('  percent:', renderField(45.5, 'percent'));
console.log();

// Temporal types
console.log('TEMPORAL TYPES:');
console.log('  date:', renderField(new Date('2024-01-15'), 'date'));
console.log('  datetime:', renderField(new Date('2024-01-15T14:30:00'), 'datetime'));
console.log();

// Visual types
console.log('VISUAL TYPES:');
console.log('  boolean (true):', renderField(true, 'boolean'));
console.log('  boolean (false):', renderField(false, 'boolean'));
console.log('  badge:', renderField('Premium', 'badge'));
console.log('  status (active):', renderField('active', 'status'));
console.log('  status (pending):', renderField('pending', 'status'));
console.log('  status (error):', renderField('error', 'status'));
console.log('  rating:', renderField(4, 'rating', { max: 5 }));
console.log('  color:', renderField('#3b82f6', 'color'));
console.log();

// Reference types
console.log('REFERENCE TYPES:');
console.log('  entity:', renderField('Acme Corporation', 'entity', { type: 'company' }));
console.log('  user:', renderField('John Doe', 'user'));
console.log();

// Data types
console.log('DATA TYPES:');
console.log('  json:', renderField({ name: 'Alice', age: 30, active: true }, 'json', { maxLength: 60 }));
console.log('  file:', renderField('/path/to/document.pdf', 'file', { filename: 'document.pdf', size: 1024000 }));
console.log('  image:', renderField('https://example.com/photo.jpg', 'image'));
console.log();

// Edge cases
console.log('EDGE CASES:');
console.log('  null value:', renderField(null, 'text'));
console.log('  undefined value:', renderField(undefined, 'number'));
console.log('  unknown type:', renderField('test', 'unknown-type'));
console.log();

console.log('='.repeat(60));
console.log('Demo complete! All 19 UITypes rendered successfully.');
console.log('='.repeat(60) + '\n');
