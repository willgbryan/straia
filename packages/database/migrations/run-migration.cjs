#!/usr/bin/env node
/**
 * Script to run specific Prisma migrations manually
 * 
 * Usage: node run-migration.js <migration-name>
 * Example: node run-migration.js add_agent_models
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Get the migration name from command line args
const migrationName = process.argv[2];

if (!migrationName) {
  console.error('Error: No migration name provided');
  console.log('Usage: node run-migration.js <migration-name>');
  console.log('Example: node run-migration.js add_agent_models');
  process.exit(1);
}

// Path to migrations directory
const migrationsDir = path.join(__dirname, '..', 'prisma', 'migrations');

// Check if migration exists
const migrationDirs = fs.readdirSync(migrationsDir).filter(dir => 
  dir.includes(migrationName)
);

if (migrationDirs.length === 0) {
  console.error(`Error: No migration found with name containing "${migrationName}"`);
  
  // List available migrations
  console.log('\nAvailable migrations:');
  fs.readdirSync(migrationsDir).forEach(dir => {
    console.log(`- ${dir}`);
  });
  
  process.exit(1);
}

if (migrationDirs.length > 1) {
  console.warn(`Warning: Multiple migrations found with name containing "${migrationName}". Using the first one.`);
  console.log('\nMatching migrations:');
  migrationDirs.forEach(dir => {
    console.log(`- ${dir}`);
  });
}

const selectedMigration = migrationDirs[0];
console.log(`Running migration: ${selectedMigration}`);

// Check if the migration has SQL file
const sqlFile = path.join(migrationsDir, selectedMigration, 'migration.sql');
if (!fs.existsSync(sqlFile)) {
  console.error(`Error: Migration SQL file not found at ${sqlFile}`);
  process.exit(1);
}

// Get SQL content to execute
const sqlContent = fs.readFileSync(sqlFile, 'utf8');

// Execute SQL using prisma db execute
console.log('Executing SQL migration...');

const prismaBin = path.join(__dirname, '..', 'node_modules', '.bin', 'prisma');
const child = spawn(prismaBin, ['db', 'execute', '--file', sqlFile], {
  stdio: 'inherit',
  shell: true,
});

child.on('close', (code) => {
  if (code === 0) {
    console.log('\nMigration executed successfully!');
    
    // Update migration_history table
    console.log('\nUpdating migration history...');
    const updateChild = spawn(prismaBin, ['migrate', 'resolve', '--applied', selectedMigration], {
      stdio: 'inherit',
      shell: true,
    });
    
    updateChild.on('close', (updateCode) => {
      if (updateCode === 0) {
        console.log('\nMigration history updated successfully!');
        console.log('\nThe agent feature is now available.');
      } else {
        console.error('\nFailed to update migration history.');
      }
    });
  } else {
    console.error('\nMigration failed.');
  }
}); 