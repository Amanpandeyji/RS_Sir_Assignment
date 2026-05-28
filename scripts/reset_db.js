const fs = require('fs');
const path = require('path');
const DB_PATH = path.resolve(__dirname, '..', 'database.db');
if (fs.existsSync(DB_PATH)) {
  try {
    fs.unlinkSync(DB_PATH);
    console.log('Deleted database.db');
  } catch (e) {
    console.error('Failed to delete database.db', e.message);
    process.exit(1);
  }
} else {
  console.log('No database.db file found');
}
require('../db/database');
console.log('Reinitialized database (schema ensured).');
