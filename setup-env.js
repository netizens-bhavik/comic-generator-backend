#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envContent = `# ============================================
# Comic Generator Backend - Environment Variables
# ============================================

# ============================================
# Server Configuration
# ============================================
PORT=3001
NODE_ENV=development

# ============================================
# Database Configuration
# ============================================
DB_HOST=localhost
DB_PORT=3306
DB_USER=valet
DB_PASSWORD=Admin@0056
DB_NAME=comic_generator

# ============================================
# JWT Authentication Configuration
# ============================================
# IMPORTANT: Change this to a strong random string in production!
# Generate a secure secret with:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=your_super_secret_jwt_key_change_this_in_production_use_a_long_random_string
JWT_EXPIRES_IN=7d

# ============================================
# Google Gemini API Configuration
# ============================================
# Get your API key from: https://makersuite.google.com/app/apikey
# or https://aistudio.google.com/app/apikey
API_KEY=your_gemini_api_key_here

# ============================================
# CORS Configuration
# ============================================
# Frontend URL for CORS (allowed origin)
# Update this to match your frontend URL
FRONTEND_URL=http://localhost:3000
`;

const envPath = path.join(__dirname, '.env');

if (fs.existsSync(envPath)) {
  console.log('⚠️  .env file already exists. Skipping creation.');
  console.log('   If you want to recreate it, delete the existing .env file first.');
} else {
  fs.writeFileSync(envPath, envContent);
  console.log('✅ Created .env file successfully!');
  console.log('📝 Please update the following values:');
  console.log('   - JWT_SECRET: Generate a strong random string');
  console.log('   - API_KEY: Add your Google Gemini API key');
  console.log('   - Database credentials if different from defaults');
}

