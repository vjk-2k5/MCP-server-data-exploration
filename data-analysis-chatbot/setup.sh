#!/bin/bash

# Data Analysis Chatbot Setup Script

echo "🚀 Setting up Data Analysis Chatbot..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js (v16 or higher) first."
    echo "   Download from: https://nodejs.org/"
    exit 1
fi

# Check if Python is installed
if ! command -v python &> /dev/null; then
    echo "❌ Python is not installed. Please install Python (v3.10 or higher) first."
    echo "   Download from: https://python.org/"
    exit 1
fi

echo "✅ Node.js and Python are installed"

# Navigate to backend directory
cd backend

# Install Node.js dependencies
echo "📦 Installing Node.js dependencies..."
npm install

if [ $? -eq 0 ]; then
    echo "✅ Node.js dependencies installed successfully"
else
    echo "❌ Failed to install Node.js dependencies"
    exit 1
fi

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cp .env.example .env
    echo "⚠️  Please edit the .env file and add your GEMINI_API_KEY"
    echo "   Get your API key from: https://makersuite.google.com/app/apikey"
else
    echo "✅ .env file already exists"
fi

# Create uploads directory
mkdir -p uploads
echo "✅ Created uploads directory"

echo ""
echo "🎉 Setup completed successfully!"
echo ""
echo "Next steps:"
echo "1. Edit backend/.env and add your GEMINI_API_KEY"
echo "2. Run: cd backend && npm start"
echo "3. Open: http://localhost:3001"
echo ""
echo "For development mode: cd backend && npm run dev"