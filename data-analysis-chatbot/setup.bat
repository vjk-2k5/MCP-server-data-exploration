@echo off
REM Data Analysis Chatbot Setup Script for Windows

echo 🚀 Setting up Data Analysis Chatbot...

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed. Please install Node.js (v16 or higher) first.
    echo    Download from: https://nodejs.org/
    pause
    exit /b 1
)

REM Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Python is not installed. Please install Python (v3.10 or higher) first.
    echo    Download from: https://python.org/
    pause
    exit /b 1
)

echo ✅ Node.js and Python are installed

REM Navigate to backend directory
cd backend

REM Install Node.js dependencies
echo 📦 Installing Node.js dependencies...
call npm install

if %errorlevel% equ 0 (
    echo ✅ Node.js dependencies installed successfully
) else (
    echo ❌ Failed to install Node.js dependencies
    pause
    exit /b 1
)

REM Create .env file if it doesn't exist
if not exist .env (
    echo 📝 Creating .env file...
    copy .env.example .env
    echo ⚠️  Please edit the .env file and add your GEMINI_API_KEY
    echo    Get your API key from: https://makersuite.google.com/app/apikey
) else (
    echo ✅ .env file already exists
)

REM Create uploads directory
if not exist uploads mkdir uploads
echo ✅ Created uploads directory

echo.
echo 🎉 Setup completed successfully!
echo.
echo Next steps:
echo 1. Edit backend\.env and add your GEMINI_API_KEY
echo 2. Run: cd backend ^&^& npm start
echo 3. Open: http://localhost:3001
echo.
echo For development mode: cd backend ^&^& npm run dev
echo.
pause