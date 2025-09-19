const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const MCPServerClient = require('./mcpClient');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../')));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
fs.ensureDirSync(uploadsDir);

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const originalName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        cb(null, `${timestamp}_${originalName}`);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv' || file.originalname.toLowerCase().endsWith('.csv')) {
            cb(null, true);
        } else {
            cb(new Error('Only CSV files are allowed'));
        }
    }
});

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Initialize MCP Server Client
const mcpClient = new MCPServerClient();

// Store active datasets and their paths
const activeDatasetsMap = new Map();

// MCP Server communication functions
async function communicateWithMCPServer(datasetPath, userMessage) {
    try {
        console.log(`Communicating with MCP server for: ${path.basename(datasetPath)}`);
        
        // Get dataset summary first
        const datasetSummary = await mcpClient.getDatasetSummary(datasetPath);
        
        // Get Gemini model for intelligent query analysis
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        
        // Perform analysis using MCP server with Gemini integration
        const analysisResult = await mcpClient.analyzeDataset(datasetPath, userMessage, model);
        
        return {
            datasetSummary,
            analysisResult,
            mcpServerAvailable: true
        };
        
    } catch (error) {
        console.error('Error communicating with MCP server:', error);
        
        // Fallback to basic file analysis if MCP server is not available
        try {
            const fallbackSummary = await mcpClient.getDatasetSummary(datasetPath);
            return {
                datasetSummary: fallbackSummary,
                analysisResult: {
                    success: false,
                    error: 'MCP server unavailable, providing basic analysis',
                    fallbackMessage: 'Using basic file analysis. For advanced data science operations, ensure the MCP server is running.'
                },
                mcpServerAvailable: false
            };
        } catch (fallbackError) {
            console.error('Fallback analysis also failed:', fallbackError);
            throw new Error('Failed to analyze dataset');
        }
    }
}

// Generate AI response using Gemini
async function generateAIResponse(userMessage, datasetPath, mcpData) {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        
        const datasetInfo = mcpData.datasetSummary;
        const analysisInfo = mcpData.analysisResult;
        const mcpAvailable = mcpData.mcpServerAvailable;
        
        const prompt = `
You are a helpful data analysis assistant with access to a powerful MCP (Model Context Protocol) server for data science operations.

Dataset Information:
- File: ${datasetInfo.fileName}
- Columns: ${datasetInfo.headers ? datasetInfo.headers.join(', ') : 'Unknown'}
- Estimated Rows: ${datasetInfo.estimatedRows || 'Unknown'}
- File Size: ${Math.round((datasetInfo.fileSize || 0) / 1024)} KB
- MCP Server Status: ${mcpAvailable ? 'Available' : 'Unavailable'}

${mcpAvailable ? `
MCP Server Analysis: ${JSON.stringify(analysisInfo, null, 2)}

You have access to advanced data science capabilities through the MCP server including:
- Statistical analysis with pandas, numpy, scipy
- Machine learning with scikit-learn
- Interactive data visualizations (Bar Charts, Scatter Plots, Histograms, Pie Charts, Heatmaps)
- Advanced data exploration and pattern detection

When users ask for visualizations or when appropriate, I can generate charts automatically. Available chart types:
🔹 Bar Charts: "Show me a bar chart of [column] by [category]"
🔹 Scatter Plots: "Create a scatter plot of [column1] vs [column2]"
🔹 Histograms: "Show the distribution of [column]"
🔹 Correlation Heatmaps: "Generate a correlation heatmap"
🔹 Line Charts: "Show trends over time"
${analysisInfo.chartData ? '\n✅ Chart generated and will be displayed as an interactive visualization.' : ''}
${analysisInfo.textAnalysis ? '\n📝 Detailed text analysis has been generated based on your specific question.' : ''}
` : `
Note: MCP server is currently unavailable. Providing basic analysis capabilities.
${analysisInfo.fallbackMessage || ''}
`}

User Question: ${userMessage}

IMPORTANT INSTRUCTIONS:
1. **DO NOT include raw chart JSON data or configuration in your response**
2. **DO NOT show chart code or technical chart configurations**
3. If a chart was generated, simply mention it and describe the insights
4. Focus on interpreting the data and providing insights, not technical details

Please provide a helpful, informative response about the data. Consider:

1. **Direct Answer**: Address the user's specific question
2. **Data Context**: Refer to the actual dataset structure and content
3. **Actionable Insights**: Suggest specific analyses or next steps
4. **Visualizations**: ${analysisInfo.chartData ? 'I have generated an interactive chart that will be displayed automatically. Describe what the chart shows and key insights.' : 'Suggest appropriate charts when relevant (bar, scatter, histogram, heatmap, etc.)'}
5. **Text Analysis**: ${analysisInfo.textAnalysis ? 'Use the detailed text analysis provided below to give comprehensive insights.' : 'Provide statistical insights when appropriate'}
6. **MCP Capabilities**: ${mcpAvailable ? 'Mention how the MCP server can help with advanced analysis' : 'Explain limitations due to MCP server unavailability'}

Keep your response conversational, insightful, and focused on helping the user understand their data better.

${analysisInfo.chartData ? 
`📊 **Interactive Chart Available**: ${analysisInfo.chartData.title} - This visualization is being rendered automatically and will appear as an interactive chart above.` : 
''}

${analysisInfo.textAnalysis ? 
`📝 **Detailed Analysis**: ${analysisInfo.textAnalysis}` : 
''}

If appropriate, suggest specific follow-up questions like:
- "Create a bar chart showing [specific analysis]"
- "Show me a scatter plot of [column A] vs [column B]"
- "Generate a histogram of [column] distribution"
- "Create a correlation heatmap to see relationships"
`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
        
    } catch (error) {
        console.error('Error generating AI response:', error);
        
        // Provide a fallback response if Gemini fails
        const datasetInfo = mcpData.datasetSummary;
        return `I understand you're asking about your dataset "${datasetInfo.fileName}". 
        
While I'm having trouble accessing the AI service right now, I can tell you that your dataset has ${datasetInfo.columnCount || 'several'} columns${datasetInfo.headers ? ` (${datasetInfo.headers.slice(0, 5).join(', ')}${datasetInfo.headers.length > 5 ? '...' : ''})` : ''} and appears to contain ${datasetInfo.estimatedRows || 'multiple'} rows of data.

Please try asking your question again, or consider these common data analysis approaches:
- Explore basic statistics and distributions
- Look for correlations between variables  
- Check for missing values or outliers
- Create visualizations to identify patterns

I'll do my best to help once the AI service is restored.`;
    }
}

// Routes

// Serve the main HTML page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../index.html'));
});

// File upload endpoint
app.post('/api/upload', upload.single('dataset'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const filePath = req.file.path;
        const fileId = req.file.filename;
        
        // Store the dataset mapping
        activeDatasetsMap.set(fileId, {
            originalName: req.file.originalname,
            path: filePath,
            uploadedAt: new Date(),
            size: req.file.size
        });

        console.log(`File uploaded: ${req.file.originalname} -> ${filePath}`);

        res.json({
            message: 'File uploaded successfully',
            fileId: fileId,
            filePath: filePath,
            originalName: req.file.originalname,
            size: req.file.size
        });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Failed to upload file' });
    }
});

// Chat endpoint
app.post('/api/chat', async (req, res) => {
    try {
        const { message, datasetPath } = req.body;

        if (!message || !datasetPath) {
            return res.status(400).json({ error: 'Message and dataset path are required' });
        }

        // Check if file exists
        if (!fs.existsSync(datasetPath)) {
            return res.status(404).json({ error: 'Dataset file not found' });
        }

        console.log(`Processing chat message: "${message}" for dataset: ${path.basename(datasetPath)}`);

        // Communicate with MCP server to analyze data
        const mcpData = await communicateWithMCPServer(datasetPath, message);
        
        // Debug: Log MCP data structure
        console.log('MCP Data structure:', JSON.stringify(mcpData, null, 2));
        console.log('Chart data from MCP:', mcpData.analysisResult?.chartData);
        
        // Generate AI response using Gemini
        const aiResponse = await generateAIResponse(message, datasetPath, mcpData);

        const responseData = {
            response: aiResponse,
            chartData: mcpData.analysisResult?.analysis?.chartData || null,
            textAnalysis: mcpData.analysisResult?.analysis?.textAnalysis || null,
            timestamp: new Date().toISOString()
        };
        
        console.log('Sending response with chartData:', !!responseData.chartData);
        console.log('Sending response with textAnalysis:', !!responseData.textAnalysis);
        console.log('Chart data details:', responseData.chartData ? responseData.chartData.type : 'No chart data');
        
        res.json(responseData);

    } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({ 
            error: 'Failed to process your message. Please try again.',
            details: error.message 
        });
    }
});

// Get dataset info endpoint
app.get('/api/dataset/:fileId', (req, res) => {
    try {
        const { fileId } = req.params;
        const dataset = activeDatasetsMap.get(fileId);

        if (!dataset) {
            return res.status(404).json({ error: 'Dataset not found' });
        }

        res.json(dataset);

    } catch (error) {
        console.error('Dataset info error:', error);
        res.status(500).json({ error: 'Failed to get dataset information' });
    }
});

// Delete dataset endpoint
app.delete('/api/dataset/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        const dataset = activeDatasetsMap.get(fileId);

        if (!dataset) {
            return res.status(404).json({ error: 'Dataset not found' });
        }

        // Delete the file
        await fs.remove(dataset.path);
        
        // Remove from active datasets
        activeDatasetsMap.delete(fileId);

        res.json({ message: 'Dataset deleted successfully' });

    } catch (error) {
        console.error('Delete dataset error:', error);
        res.status(500).json({ error: 'Failed to delete dataset' });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        activeDatasets: activeDatasetsMap.size
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Server error:', error);
    
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File too large. Maximum size is 50MB.' });
        }
    }
    
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Data Analysis Chatbot Backend running on port ${PORT}`);
    console.log(`📊 Frontend available at: http://localhost:${PORT}`);
    console.log(`🔧 API endpoints available at: http://localhost:${PORT}/api`);
    
    // Check for required environment variables
    if (!process.env.GEMINI_API_KEY) {
        console.warn('⚠️  GEMINI_API_KEY not found in environment variables');
        console.warn('   Please add it to your .env file to enable AI responses');
    }
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Received SIGTERM, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🛑 Received SIGINT, shutting down gracefully');
    process.exit(0);
});