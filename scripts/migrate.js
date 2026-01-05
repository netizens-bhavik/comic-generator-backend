#!/usr/bin/env node

import { execSync } from 'child_process';
import { readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env') });

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT || '3306';
const DB_USER = process.env.DB_USER || 'valet';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'comic_generator';

const migrationsDir = join(__dirname, '..', 'database', 'migrations');

console.log('🚀 Starting database migrations...\n');

// Create database if it doesn't exist
try {
  console.log('📦 Creating database if not exists...');
  execSync(
    `mysql -u ${DB_USER} -p${DB_PASSWORD} -h ${DB_HOST} -P ${DB_PORT} -e "CREATE DATABASE IF NOT EXISTS ${DB_NAME};"`,
    { stdio: 'inherit' }
  );
  console.log('✅ Database ready\n');
} catch (error) {
  console.error('❌ Failed to create database:', error.message);
  process.exit(1);
}

// Get all migration files sorted
const migrationFiles = readdirSync(migrationsDir)
  .filter(file => file.endsWith('.sql'))
  .sort();

if (migrationFiles.length === 0) {
  console.log('⚠️  No migration files found');
  process.exit(0);
}

console.log(`📋 Found ${migrationFiles.length} migration file(s)\n`);

// Run each migration
for (const file of migrationFiles) {
  const filePath = join(migrationsDir, file);
  console.log(`🔄 Running migration: ${file}`);
  
  try {
    execSync(
      `mysql -u ${DB_USER} -p${DB_PASSWORD} -h ${DB_HOST} -P ${DB_PORT} ${DB_NAME} < "${filePath}"`,
      { stdio: 'inherit' }
    );
    console.log(`✅ Completed: ${file}\n`);
  } catch (error) {
    console.error(`❌ Failed to run migration ${file}:`, error.message);
    process.exit(1);
  }
}

// Verify tables
console.log('🔍 Verifying tables...');
try {
  const result = execSync(
    `mysql -u ${DB_USER} -p${DB_PASSWORD} -h ${DB_HOST} -P ${DB_PORT} ${DB_NAME} -e "SHOW TABLES;"`,
    { encoding: 'utf-8' }
  );
  console.log(result);
  console.log('✅ Migrations completed successfully!');
} catch (error) {
  console.error('❌ Failed to verify tables:', error.message);
  process.exit(1);
}

