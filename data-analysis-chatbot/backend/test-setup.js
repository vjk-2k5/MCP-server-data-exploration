#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🧪 Testing Data Analysis Chatbot Setup...\n');

// Test 1: Check if backend files exist
const backendFiles = [
    'server.js',
    'mcpClient.js', 
    'package.json',
    '.env'
];

console.log('📁 Checking backend files...');
backendFiles.forEach(file => {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
        console.log(`  ✅ ${file}`);
    } else {
        console.log(`  ❌ ${file} - MISSING`);
    }
});

// Test 2: Check if frontend files exist
const frontendFiles = [
    '../index.html',
    '../styles.css',
    '../script.js'
];

console.log('\n🎨 Checking frontend files...');
frontendFiles.forEach(file => {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
        console.log(`  ✅ ${path.basename(file)}`);
    } else {
        console.log(`  ❌ ${path.basename(file)} - MISSING`);
    }
});

// Test 3: Check environment variables
console.log('\n🔧 Checking environment configuration...');
require('dotenv').config();

if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here') {
    console.log('  ✅ GEMINI_API_KEY configured');
} else {
    console.log('  ⚠️  GEMINI_API_KEY not configured - Add your API key to .env');
}

if (process.env.PORT) {
    console.log(`  ✅ PORT configured (${process.env.PORT})`);
} else {
    console.log('  ⚠️  PORT not configured - using default 3001');
}

// Test 4: Check uploads directory
const uploadsDir = path.join(__dirname, 'uploads');
if (fs.existsSync(uploadsDir)) {
    console.log('  ✅ Uploads directory exists');
} else {
    console.log('  ❌ Uploads directory missing');
}

// Test 5: Check sample data
const sampleDataPath = path.join(__dirname, '../sample_data.csv');
if (fs.existsSync(sampleDataPath)) {
    console.log('  ✅ Sample data file available');
} else {
    console.log('  ⚠️  Sample data file missing');
}

console.log('\n🎉 Setup check complete!');
console.log('\nNext steps:');
console.log('1. Make sure the server is running: npm start');
console.log('2. Open http://localhost:3001 in your browser');
console.log('3. Upload the sample_data.csv file');
console.log('4. Try asking: "What correlations do you see in this dataset?"');