# Quick Start Guide

## 🚀 Get Started in 3 Steps

### Step 1: Setup
```bash
# Navigate to the backend directory
cd data-analysis-chatbot/backend

# Install dependencies (already done if you ran setup)
npm install

# Copy environment file (already done if you ran setup)
copy .env.example .env
```

### Step 2: Configure API Key
1. Get your Gemini API key from: https://makersuite.google.com/app/apikey
2. Edit `backend/.env` file:
   ```
   GEMINI_API_KEY=your_actual_api_key_here
   ```

### Step 3: Run the Application
```bash
# Start the server
npm start

# Or for development (auto-restart on changes)
npm run dev
```

Open your browser and go to: http://localhost:3001

## 🎯 Test with Sample Data

We've included a `sample_data.csv` file with employee data. Upload it to test the chatbot!

**Sample questions to try:**
- "What's the average salary by department?"
- "Who has the highest performance score?"
- "Is there a correlation between experience and salary?"
- "Show me statistics for each department"

## 🔧 Troubleshooting

**Port already in use?**
- Change the PORT in `.env` file to a different number (e.g., 3002)

**Gemini API errors?**
- Make sure your API key is correct
- Check that you have API quota remaining

**File upload not working?**
- Ensure the file is a valid CSV format
- Check file size is under 50MB

## 📁 Project Structure

```
data-analysis-chatbot/
├── index.html          # Frontend
├── styles.css          # Styling  
├── script.js           # Frontend logic
├── sample_data.csv     # Test data
├── backend/
│   ├── server.js       # Main server
│   ├── mcpClient.js    # MCP integration
│   ├── package.json    # Dependencies
│   └── .env           # Configuration
```

Happy analyzing! 🎉


Developed by
VIjay Krishna S ,
Udhay Kumar ,
Roheit SK