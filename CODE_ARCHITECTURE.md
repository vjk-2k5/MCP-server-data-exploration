# MCP Data Analyst - Code-Level Architecture & Implementation

## Table of Contents
1. [Project Architecture Overview](#project-architecture-overview)
2. [Frontend Layer (Browser)](#frontend-layer-browser)
3. [Backend API Layer (Node.js/Express)](#backend-api-layer-nodejs-express)
4. [MCP Client Integration (Node.js)](#mcp-client-integration-nodejs)
5. [MCP Server Backend (Python)](#mcp-server-backend-python)
6. [Complete Data Flow Walkthrough](#complete-data-flow-walkthrough)
7. [Key Technical Patterns](#key-technical-patterns)

---

## Project Architecture Overview

```
┌─────────────────────┐
│   Frontend (HTML)    │  index.html, styles.css, script.js
│   Browser/UI Layer  │  - File upload drag-drop
└──────────┬──────────┘  - Chat interface
           │             - Chart rendering
           │
           ├─ HTTP POST /api/upload (multipart/form-data)
           │
    ┌──────▼──────────────────────────┐
    │  Backend API (Node.js/Express)   │  server.js
    │  Port 3001 (configurable)        │  - Express middleware
    │  ├─ Multer (file upload)         │  - Route handlers
    │  ├─ Gemini AI integration        │  - Error handling
    │  └─ MCP Client wrapper           │
    └──────┬──────────────────────────┘
           │
           ├─ Uses MCPServerClient (mcpClient.js)
           │  ├─ Dataset summary analysis (CSV parsing)
           │  ├─ Intent classification (Gemini-powered)
           │  ├─ Chart generation logic
           │  └─ Data correlation analysis
           │
           ├─ CSV read/parse
           └─ Fallback analysis if MCP unavailable
                   │
              ┌────▼────────────────────────┐
              │ MCP Server (Python)          │  server.py
              │ stdio transport              │  - Data science tools
              │ ├─ load_csv: load DataFrame │  - Script runner
              │ ├─ run_script: execute code │  - Resource/Prompt APIs
              │ └─ Pandas/NumPy/SciPy       │
              └─────────────────────────────┘
```

### Key Technologies
- **Frontend**: Vanilla HTML5, CSS3, JavaScript (Chart.js, Plotly.js)
- **Backend**: Node.js, Express.js, Multer
- **AI Integration**: Google Gemini API (gemini-2.5-flash)
- **Analytics Server**: Python with MCP protocol, pandas, numpy, scipy, sklearn
- **File Storage**: Disk-based uploads with timestamped filenames

---

## Frontend Layer (Browser)

### `index.html` - Structure & Elements
```html
<!-- Main container structure -->
<div class="container">
  <header>Data Analysis Chatbot</header>
  <div class="main-content">
    <!-- File Upload Section (initial view) -->
    <div class="upload-section" id="uploadSection">
      <div class="upload-area" id="uploadArea">
        <!-- Drag-drop zone, file input, upload button -->
      </div>
      <div class="file-info" id="fileInfo">
        <!-- Selected file display + progress bar -->
      </div>
    </div>

    <!-- Chat Section (shown after upload) -->
    <div class="chat-section" id="chatSection" style="display: none;">
      <div class="chat-header">Dataset name + Change button</div>
      <div class="chat-messages" id="chatMessages">
        <!-- Initial bot message with suggestion buttons -->
        <!-- Chat history appended here -->
      </div>
      <div class="chat-input-section">
        <input type="text" id="chatInput" placeholder="Ask...">
        <button id="sendBtn">Send</button>
      </div>
      <div class="typing-indicator" id="typingIndicator">
        <!-- Animated loading state -->
      </div>
    </div>
  </div>
</div>
```

### `styles.css` - Key Styling Patterns
- **Flexbox layout**: Main container, chat section uses `display: flex` for responsive chat
- **Grid for messages**: Chat messages use CSS grid for avatar + content alignment
- **Progressive enhancement**: Drag-drop fallback to file picker
- **Chart container styling**: `.chart-container` with badge, title, canvas, description
- **Responsive design**: Mobile-first approach with viewport meta tag

### `script.js` - Frontend JavaScript Logic

#### Global State
```javascript
let currentFile = null;              // Currently selected file object
let currentDatasetPath = null;       // Path where file was stored
const API_BASE_URL = 'http://localhost:3001/api';
```

#### Key Functions

**1. File Upload Handling**
```
handleFile(file) → Validate type/size → showFileInfo() → uploadFile()
↓
uploadFile(file) → XHR POST /api/upload → track progress
↓
On success: store currentDatasetPath → showChatInterface()
```

**2. Chat Message Flow**
```
sendMessage() → Extract message from input
↓
addMessage(message, 'user') → Add to UI
↓
fetch POST /api/chat {message, datasetPath}
↓
showTypingIndicator()
↓
Response received {response, chartData, textAnalysis}
↓
addMessage(response, 'bot', chartData)
↓
if chartData: createChartContainer() → renderChart()
```

**3. Chart Rendering (Hybrid Approach)**
```javascript
function renderChart(chartData, canvasElement) {
    if (chartData.type === 'heatmap') {
        // Use Plotly.js for correlation heatmaps
        Plotly.newPlot(plotlyDiv, chartData.plotlyConfig.data, 
                       chartData.plotlyConfig.layout, {responsive: true});
    } else {
        // Use Chart.js for bar, scatter, histogram, line
        new Chart(canvasElement, chartData.config);
    }
}
```

**4. UI State Management**
```javascript
showChatInterface(filename) {
    datasetName.textContent = filename;
    uploadSection.style.display = 'none';  // Hide upload
    chatSection.style.display = 'flex';    // Show chat
    chatInput.focus();
}

changeDataset() → removeFile() → Reset currentDatasetPath → Show upload
```

**5. Drag & Drop Implementation**
```javascript
uploadArea.addEventListener('dragover', handleDragOver);  // Add visual feedback
uploadArea.addEventListener('drop', handleDrop);          // Extract files
uploadArea.addEventListener('dragleave', handleDragLeave); // Remove feedback

handleDrop(e) {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length > 0) handleFile(files[0]);
}
```

---

## Backend API Layer (Node.js/Express)

### `server.js` - Core Implementation

#### Initialization & Middleware
```javascript
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware stack
app.use(cors());                                    // Enable cross-origin
app.use(express.json());                           // JSON parsing
app.use(express.static(path.join(__dirname, '../')))); // Serve frontend

// Create uploads directory
const uploadsDir = path.join(__dirname, 'uploads');
fs.ensureDirSync(uploadsDir);

// Initialize AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const mcpClient = new MCPServerClient();
const activeDatasetsMap = new Map(); // In-memory tracking
```

#### Multer Configuration (File Upload)
```javascript
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);  // Save to ./uploads
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const originalName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        cb(null, `${timestamp}_${originalName}`);  // e.g., 1234567890_data.csv
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 },  // 50MB max
    fileFilter: (req, file, cb) => {
        if (file.originalname.toLowerCase().endsWith('.csv')) {
            cb(null, true);
        } else {
            cb(new Error('Only CSV files allowed'));
        }
    }
});
```

#### Route: GET / (Serve Frontend)
```javascript
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../index.html'));
});
```

#### Route: POST /api/upload (File Upload)
```javascript
app.post('/api/upload', upload.single('dataset'), async (req, res) => {
    try {
        const filePath = req.file.path;           // /uploads/1234567890_data.csv
        const fileId = req.file.filename;         // Unique identifier
        
        // Store mapping for later retrieval
        activeDatasetsMap.set(fileId, {
            originalName: req.file.originalname,
            path: filePath,
            uploadedAt: new Date(),
            size: req.file.size
        });
        
        // Return to frontend
        res.json({
            message: 'File uploaded successfully',
            fileId: fileId,
            filePath: filePath,
            originalName: req.file.originalname,
            size: req.file.size
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to upload file' });
    }
});
```

#### Route: POST /api/chat (Main Analysis Endpoint)
```javascript
app.post('/api/chat', async (req, res) => {
    try {
        const { message, datasetPath } = req.body;
        
        // Step 1: Validate request
        if (!message || !datasetPath) {
            return res.status(400).json({ error: 'Message and dataset path required' });
        }
        
        // Step 2: Verify file exists
        if (!fs.existsSync(datasetPath)) {
            return res.status(404).json({ error: 'Dataset file not found' });
        }
        
        // Step 3: Communicate with MCP server for analysis
        const mcpData = await communicateWithMCPServer(datasetPath, message);
        
        // Step 4: Use Gemini to generate conversational response
        const aiResponse = await generateAIResponse(message, datasetPath, mcpData);
        
        // Step 5: Return complete response with optional chart
        res.json({
            response: aiResponse,
            chartData: mcpData.analysisResult?.analysis?.chartData || null,
            textAnalysis: mcpData.analysisResult?.analysis?.textAnalysis || null,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({ 
            error: 'Failed to process your message',
            details: error.message 
        });
    }
});
```

#### Function: `communicateWithMCPServer(datasetPath, userMessage)`
```javascript
async function communicateWithMCPServer(datasetPath, userMessage) {
    try {
        // Get basic dataset info (headers, row count)
        const datasetSummary = await mcpClient.getDatasetSummary(datasetPath);
        
        // Get Gemini model instance
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        
        // Perform detailed analysis (chart + text)
        const analysisResult = await mcpClient.analyzeDataset(datasetPath, userMessage, model);
        
        return {
            datasetSummary,
            analysisResult,
            mcpServerAvailable: true
        };
        
    } catch (error) {
        // Graceful fallback if MCP unavailable
        try {
            const fallbackSummary = await mcpClient.getDatasetSummary(datasetPath);
            return {
                datasetSummary: fallbackSummary,
                analysisResult: {
                    success: false,
                    error: 'MCP server unavailable, providing basic analysis'
                },
                mcpServerAvailable: false
            };
        } catch (fallbackError) {
            throw new Error('Failed to analyze dataset');
        }
    }
}
```

#### Function: `generateAIResponse(userMessage, datasetPath, mcpData)`
```javascript
async function generateAIResponse(userMessage, datasetPath, mcpData) {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    
    // Build context for Gemini
    const prompt = `
You are a helpful data analysis assistant with access to MCP server.

Dataset Information:
- File: ${mcpData.datasetSummary.fileName}
- Columns: ${mcpData.datasetSummary.headers.join(', ')}
- Rows: ${mcpData.datasetSummary.estimatedRows}
- MCP Status: ${mcpData.mcpServerAvailable ? 'Available' : 'Unavailable'}

${mcpData.mcpServerAvailable ? `
MCP Analysis: ${JSON.stringify(mcpData.analysisResult, null, 2)}

Capabilities:
- Statistical analysis (pandas, numpy, scipy)
- Interactive visualizations (Bar, Scatter, Histogram, Heatmap)
- Correlation analysis
- Data distribution analysis

${mcpData.analysisResult.chartData ? '✅ Chart generated: ' + mcpData.analysisResult.chartData.title : ''}
${mcpData.analysisResult.textAnalysis ? '📝 Text analysis: ' + mcpData.analysisResult.textAnalysis : ''}
` : 'MCP server unavailable, providing basic analysis'}

User Question: ${userMessage}

INSTRUCTIONS:
1. DO NOT include raw chart JSON in your response
2. Focus on insights, not technical details
3. Keep response conversational and helpful
4. Mention if chart was generated
`;
    
    const result = await model.generateContent(prompt);
    return result.response.text();
}
```

---

## MCP Client Integration (Node.js)

### `mcpClient.js` - Bridge Between Backend & MCP Server

#### Class Structure
```javascript
class MCPServerClient {
    constructor() {
        this.mcpServerPath = path.join(__dirname, '../../src/mcp_server_ds/server.py');
        this.pythonExecutable = process.platform === 'win32' ? 'python' : 'python3';
    }
    
    // Main method orchestrating analysis
    async analyzeDataset(csvPath, analysisQuestion, geminiModel) { ... }
    
    // CSV parsing (local, no MCP call)
    async readCSVFile(csvPath) { ... }
    
    // Intent classification (Gemini-powered)
    async extractColumnsFromQuestion(question, datasetSummary, geminiModel) { ... }
    
    // Chart generation per type
    generateBarChart(csvData, datasetSummary, chartRequest) { ... }
    generateScatterChart(csvData, datasetSummary, chartRequest) { ... }
    generateHistogram(csvData, datasetSummary, chartRequest) { ... }
    generateHeatmap(csvData, datasetSummary, chartRequest) { ... }
    
    // Text analysis generation
    async generateTextAnalysis(csvPath, question, datasetSummary, geminiModel) { ... }
}
```

#### Method: `analyzeDataset(csvPath, analysisQuestion, geminiModel)`
```javascript
async analyzeDataset(csvPath, analysisQuestion, geminiModel = null) {
    try {
        // Step 1: Get basic dataset summary
        const datasetSummary = await this.getDatasetSummary(csvPath);
        const correlationAnalysis = await this.performCorrelationAnalysis(csvPath);
        
        // Step 2: Use Gemini to classify intent (chart or text?)
        const analysisResult = await this.extractColumnsFromQuestion(
            analysisQuestion, 
            datasetSummary, 
            geminiModel
        );
        
        let chartData = null;
        let textAnalysis = null;
        
        // Step 3: Route to chart or text based on intent
        if (analysisResult.needsChart && analysisResult.chartType !== 'none') {
            const chartRequest = await this.parseChartRequest(
                analysisQuestion, 
                datasetSummary, 
                geminiModel
            );
            if (chartRequest) {
                chartData = await this.generateChartData(
                    csvPath, 
                    chartRequest, 
                    datasetSummary
                );
            }
        } else {
            // Text-only analysis
            textAnalysis = await this.generateTextAnalysis(
                csvPath, 
                analysisQuestion, 
                datasetSummary, 
                geminiModel
            );
        }
        
        // Step 4: Return structured analysis
        return {
            success: true,
            datasetInfo: { fileName: path.basename(csvPath), ...datasetSummary },
            analysis: {
                question: analysisQuestion,
                correlationInsights: correlationAnalysis,
                chartData: chartData,
                textAnalysis: textAnalysis,
                capabilities: [...]
            }
        };
    } catch (error) {
        throw new Error('Failed to analyze dataset');
    }
}
```

#### Method: `extractColumnsFromQuestion(question, datasetSummary, geminiModel)`
This is the **intent classification** logic:

```javascript
async extractColumnsFromQuestion(question, datasetSummary, geminiModel) {
    // Step 1: Create prompt asking Gemini to classify request
    const analysisPrompt = `
You are a data analysis expert. Analyze this user query to determine if they want:
1. CHART (visual): contains "show", "chart", "plot", "visualize", etc.
2. TEXT (information): contains "what is", "how many", "tell me", "explain", etc.

USER QUERY: "${question}"
AVAILABLE COLUMNS: ${datasetSummary.headers.join(', ')}
NUMERIC COLUMNS: ${datasetSummary.numericColumns.join(', ')}

Respond ONLY with JSON:
{
    "needsChart": true|false,
    "chartType": "bar|scatter|pie|histogram|heatmap|line|none",
    "requestedColumns": ["col1", "col2"],
    "aggregationType": "count|average|sum|distribution|correlation|summary",
    "reasoning": "explanation"
}
`;
    
    // Step 2: Call Gemini
    const result = await geminiModel.generateContent(analysisPrompt);
    const aiAnalysis = result.response.text().trim();
    
    // Step 3: Parse JSON response
    const jsonMatch = aiAnalysis.match(/\{[\s\S]*\}/);
    const analysis = JSON.parse(jsonMatch[0]);
    
    // Step 4: Validate columns exist in dataset
    const validColumns = [];
    for (const col of analysis.requestedColumns) {
        const exactMatch = datasetSummary.headers.find(h => h === col);
        if (exactMatch) {
            validColumns.push(exactMatch);
        } else {
            // Try fuzzy matching
            const fuzzyMatch = this.mapToStandardColumn(col, datasetSummary.headers);
            if (fuzzyMatch) validColumns.push(fuzzyMatch);
        }
    }
    
    return {
        columns: validColumns,
        needsChart: analysis.needsChart,
        chartType: analysis.chartType,
        aggregationType: analysis.aggregationType,
        reasoning: analysis.reasoning
    };
}
```

#### Method: `generateBarChart(csvData, datasetSummary, chartRequest)`
This shows the **intelligent chart generation** pattern:

```javascript
generateBarChart(csvData, datasetSummary, chartRequest = {}) {
    const { headers, rows } = csvData;
    
    // Step 1: Understand aggregation type from Gemini's analysis
    const aggregationType = chartRequest.aggregationType || 'count';
    let isCountChart = (aggregationType === 'count' || aggregationType === 'distribution');
    let isAverageChart = (aggregationType === 'average');
    let isSumChart = (aggregationType === 'sum');
    
    // Step 2: Try to map requested columns to actual headers
    let categoricalCol = null;
    let numericCol = null;
    
    if (chartRequest.requestedColumns && chartRequest.requestedColumns.length > 0) {
        for (const requestedCol of chartRequest.requestedColumns) {
            const mappedCol = this.mapToStandardColumn(requestedCol, headers);
            if (mappedCol) {
                if (datasetSummary.categoricalColumns.includes(mappedCol)) {
                    categoricalCol = mappedCol;
                } else if (datasetSummary.numericColumns.includes(mappedCol) && !isCountChart) {
                    numericCol = mappedCol;
                }
            }
        }
    }
    
    // Step 3: Smart fallback column selection
    if (!categoricalCol) {
        categoricalCol = datasetSummary.categoricalColumns.find(col => 
            !['id', 'email', 'name'].some(str => col.toLowerCase().includes(str))
        ) || datasetSummary.categoricalColumns[0];
    }
    
    if (!numericCol && !isCountChart) {
        numericCol = datasetSummary.numericColumns.find(col => 
            !col.toLowerCase().includes('id')
        ) || datasetSummary.numericColumns[0];
    }
    
    // Step 4: Aggregate data
    const aggregated = {};
    rows.forEach(row => {
        const category = row[categoricalCol];
        if (!category) return;
        
        if (!aggregated[category]) {
            aggregated[category] = { count: 0, sum: 0, values: [] };
        }
        aggregated[category].count++;
        
        if (!isCountChart && numericCol !== 'Count') {
            const value = parseFloat(row[numericCol]);
            if (!isNaN(value)) {
                aggregated[category].sum += value;
                aggregated[category].values.push(value);
            }
        }
    });
    
    // Step 5: Transform aggregated data based on aggregation type
    const labels = Object.keys(aggregated);
    const data = labels.map(label => {
        if (isCountChart) {
            return aggregated[label].count;
        } else if (isAverageChart) {
            return aggregated[label].values.length > 0 ? 
                aggregated[label].sum / aggregated[label].values.length : 0;
        } else if (isSumChart) {
            return aggregated[label].sum;
        }
    });
    
    // Step 6: Return Chart.js compatible config
    return {
        type: 'bar',
        title: isCountChart ? `Count by ${categoricalCol}` : `Average ${numericCol} by ${categoricalCol}`,
        config: {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: isCountChart ? 'Count' : `Average ${numericCol}`,
                    data: data,
                    backgroundColor: 'rgba(102, 126, 234, 0.8)',
                    borderColor: 'rgba(102, 126, 234, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: { beginAtZero: true },
                    x: { title: { display: true, text: categoricalCol } }
                }
            }
        }
    };
}
```

#### Method: `generateTextAnalysis(csvPath, question, datasetSummary, geminiModel)`
```javascript
async generateTextAnalysis(csvPath, question, datasetSummary, geminiModel) {
    // Step 1: Read CSV and analyze column types
    const csvData = await this.readCSVFile(csvPath);
    const { headers, rows } = csvData;
    
    const dataSummary = {
        totalRows: rows.length,
        columnTypes: {}
    };
    
    // Step 2: Classify each column as numeric or categorical
    headers.forEach(col => {
        const values = rows.map(row => row[col]).filter(val => val && val.trim() !== '');
        const numericValues = values.map(val => parseFloat(val)).filter(val => !isNaN(val));
        
        if (numericValues.length > 0) {
            dataSummary.columnTypes[col] = {
                type: 'numeric',
                count: numericValues.length,
                min: Math.min(...numericValues),
                max: Math.max(...numericValues),
                average: numericValues.reduce((a, b) => a + b, 0) / numericValues.length
            };
        } else {
            dataSummary.columnTypes[col] = {
                type: 'categorical',
                uniqueValues: new Set(values).size,
                mostCommon: this.getMostCommon(values)
            };
        }
    });
    
    // Step 3: Use Gemini to generate narrative analysis
    const analysisPrompt = `
You are a data analyst. Based on the user's question and dataset, provide insightful analysis.

USER QUESTION: "${question}"
DATASET INFO:
- Total records: ${dataSummary.totalRows}
- Columns: ${headers.join(', ')}

COLUMN DETAILS:
${Object.entries(dataSummary.columnTypes).map(([col, info]) => {
    if (info.type === 'numeric') {
        return \`\${col}: numeric, range \${info.min.toFixed(2)}-\${info.max.toFixed(2)}, avg \${info.average.toFixed(2)}\`;
    } else {
        return \`\${col}: categorical, \${info.uniqueValues} unique values, most common: \${info.mostCommon}\`;
    }
}).join('\n')}

Provide comprehensive answer including:
1. Direct answer to their question
2. Relevant statistics
3. Key findings
4. Interesting patterns
`;
    
    const result = await geminiModel.generateContent(analysisPrompt);
    return result.response.text().trim();
}
```

---

## MCP Server Backend (Python)

### `server.py` - Data Science Tools & MCP Protocol

#### Imports & Initialization
```python
from enum import Enum
import logging
from typing import Optional, List

# MCP framework
from mcp.server.models import InitializationOptions
from mcp.types import TextContent, Tool, Resource, Prompt, PromptArgument, ...
from mcp.server import Server
import mcp.server.stdio

# Data science libraries
import pandas as pd
import numpy as np
import scipy
import sklearn
import statsmodels.api as sm

logger = logging.getLogger(__name__)
```

#### Data Structures
```python
class DataExplorationPrompts(str, Enum):
    EXPLORE_DATA = "explore-data"  # Prompt name exposed via MCP

class PromptArgs(str, Enum):
    CSV_PATH = "csv_path"
    TOPIC = "topic"

class DataExplorationTools(str, Enum):
    LOAD_CSV = "load_csv"
    RUN_SCRIPT = "run_script"
```

#### ScriptRunner Class (In-Memory DataFrame Management)
```python
class ScriptRunner:
    def __init__(self):
        self.data = {}              # {df_name: DataFrame}
        self.df_count = 0           # Counter for auto-naming
        self.notes: list[str] = []  # Audit trail
    
    def load_csv(self, csv_path: str, df_name: str = None):
        """Load CSV as DataFrame, auto-name if not provided"""
        self.df_count += 1
        if not df_name:
            df_name = f"df_{self.df_count}"
        try:
            self.data[df_name] = pd.read_csv(csv_path)
            self.notes.append(f"Successfully loaded CSV into '{df_name}'")
            return [TextContent(type="text", text=f"Loaded into '{df_name}'")]
        except Exception as e:
            raise McpError(INTERNAL_ERROR, f"Error loading CSV: {str(e)}")
    
    def safe_eval(self, script: str, save_to_memory: Optional[List[str]] = None):
        """Execute Python script with restricted context"""
        # Build execution environment
        local_dict = {
            **{df_name: df for df_name, df in self.data.items()}
        }
        
        try:
            # Capture stdout
            stdout_capture = StringIO()
            old_stdout = sys.stdout
            sys.stdout = stdout_capture
            
            # Execute with restricted imports
            exec(script, 
                 {'pd': pd, 'np': np, 'scipy': scipy, 'sklearn': sklearn, 'statsmodels': sm},
                 local_dict)
            
            std_out_script = stdout_capture.getvalue()
        except Exception as e:
            raise McpError(INTERNAL_ERROR, f"Error running script: {str(e)}")
        finally:
            sys.stdout = old_stdout
        
        # Save any requested DataFrames back to memory
        if save_to_memory:
            for df_name in save_to_memory:
                self.data[df_name] = local_dict.get(df_name)
        
        return [TextContent(type="text", text=f"Output: {std_out_script}")]
```

#### MCP Server Setup & Tool Definitions
```python
async def main():
    script_runner = ScriptRunner()
    server = Server("local-mini-ds")
    
    # List available resources
    @server.list_resources()
    async def handle_list_resources() -> list[Resource]:
        return [
            Resource(
                uri="data-exploration://notes",
                name="Data Exploration Notes",
                description="Notes from analysis",
                mimeType="text/plain"
            )
        ]
    
    # Read a resource (audit trail)
    @server.read_resource()
    async def handle_read_resource(uri: AnyUrl) -> str:
        if uri == "data-exploration://notes":
            return "\n".join(script_runner.notes)
        raise ValueError(f"Unknown resource: {uri}")
    
    # List available prompts
    @server.list_prompts()
    async def handle_list_prompts() -> list[Prompt]:
        return [
            Prompt(
                name=DataExplorationPrompts.EXPLORE_DATA,
                description="Explore a CSV dataset as a data scientist",
                arguments=[
                    PromptArgument(name=PromptArgs.CSV_PATH, required=True),
                    PromptArgument(name=PromptArgs.TOPIC, required=False)
                ]
            )
        ]
    
    # Get a prompt template (multi-step analysis template)
    @server.get_prompt()
    async def handle_get_prompt(name: str, arguments: dict[str, str]) -> GetPromptResult:
        if name != DataExplorationPrompts.EXPLORE_DATA:
            raise ValueError(f"Unknown prompt: {name}")
        
        csv_path = arguments[PromptArgs.CSV_PATH]
        topic = arguments.get(PromptArgs.TOPIC, "general exploration")
        
        prompt = PROMPT_TEMPLATE.format(csv_path=csv_path, topic=topic)
        
        return GetPromptResult(
            description=f"Data exploration for {topic}",
            messages=[
                PromptMessage(role="user", content=TextContent(type="text", text=prompt))
            ]
        )
    
    # List available tools
    @server.list_tools()
    async def handle_list_tools() -> list[Tool]:
        return [
            Tool(
                name=DataExplorationTools.LOAD_CSV,
                description=LOAD_CSV_TOOL_DESCRIPTION,
                inputSchema=LoadCsv.model_json_schema()
            ),
            Tool(
                name=DataExplorationTools.RUN_SCRIPT,
                description=RUN_SCRIPT_TOOL_DESCRIPTION,
                inputSchema=RunScript.model_json_schema()
            )
        ]
    
    # Execute a tool call
    @server.call_tool()
    async def handle_call_tool(name: str, arguments: dict) -> list[TextContent]:
        if name == DataExplorationTools.LOAD_CSV:
            csv_path = arguments.get("csv_path")
            df_name = arguments.get("df_name")
            return script_runner.load_csv(csv_path, df_name)
        elif name == DataExplorationTools.RUN_SCRIPT:
            script = arguments.get("script")
            save_to_memory = arguments.get("save_to_memory")
            return script_runner.safe_eval(script, save_to_memory)
        else:
            raise McpError(INTERNAL_ERROR, f"Unknown tool: {name}")
    
    # Start server with stdio transport
    async with mcp.server.stdio.stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, InitializationOptions(...))
```

#### PROMPT_TEMPLATE (Multi-Step EDA Guide)
The server exposes a detailed template that guides LLMs through structured analysis:
```python
PROMPT_TEMPLATE = """
You are a professional Data Scientist performing exploratory data analysis.

CSV Path: {csv_path}
Topic: {topic}

Tools available:
1. load_csv: Load CSV file
2. run_script: Execute Python analysis

Steps:
1. Load CSV using load_csv tool
2. Explore structure (rows, columns, dtypes)
3. Check for missing values and outliers
4. Generate 10 potential analysis questions
5. Select top 5 questions meeting criteria
6. For each question:
   - Outline approach in <analysis_planning> tags
   - Write Python script
   - Execute with run_script tool
   - Generate Plotly chart
7. Summarize findings

Remember:
- Prioritize stability and manageable output
- Limit result sizes
- Wrap analysis in structured tags
"""
```

---

## Complete Data Flow Walkthrough

### Scenario: User Uploads CSV and Asks "Show me average salary by department"

#### Phase 1: File Upload
```
User selects file in browser
↓
handleFile() validates type/size
↓
uploadFile() sends XHR POST /api/upload with multipart/form-data
↓
Express multer middleware intercepts
↓
File saved to: uploads/1710929400000_salaries.csv
↓
activeDatasetsMap['1710929400000_salaries.csv'] = {
    originalName: 'salaries.csv',
    path: '/uploads/1710929400000_salaries.csv',
    uploadedAt: timestamp,
    size: 15000
}
↓
Response sent with filePath
↓
Frontend shows chat interface
```

#### Phase 2: User Sends Question
```
User types: "Show me average salary by department"
↓
sendMessage() POST /api/chat {
    message: "Show me average salary by department",
    datasetPath: "/uploads/1710929400000_salaries.csv"
}
↓
Backend receives in /api/chat route
↓
fs.existsSync(datasetPath) → true
↓
communicateWithMCPServer(datasetPath, message)
  ├─ await mcpClient.getDatasetSummary(datasetPath)
  │  ├─ readCSVFile() parses CSV locally
  │  ├─ returns headers: ["Name", "Department", "Salary", "Experience"]
  │  ├─ identifies numericColumns: ["Salary", "Experience"]
  │  └─ identifies categoricalColumns: ["Department"]
  │
  └─ await mcpClient.analyzeDataset(datasetPath, message, geminiModel)
     ├─ Call extractColumnsFromQuestion(message, summary, geminiModel)
     │  └─ Gemini analyzes: "Show" keyword → needsChart: true
     │     "avg salary by department" → chartType: 'bar'
     │     requestedColumns: ["salary", "department"]
     │     aggregationType: "average"
     │
     ├─ needsChart is true → parseChartRequest()
     │  └─ Returns { type: 'bar', requestedColumns: [...], aggregationType: 'average' }
     │
     └─ Call generateChartData(csvPath, chartRequest, summary)
        ├─ readCSVData() returns rows: [
        │  {Name: "John", Department: "Sales", Salary: "50000", Experience: "3"},
        │  {Name: "Jane", Department: "Engineering", Salary: "80000", Experience: "5"},
        │  ...
        │ ]
        │
        ├─ mapToStandardColumn("salary", headers) → "Salary" ✓
        ├─ mapToStandardColumn("department", headers) → "Department" ✓
        │
        ├─ generateBarChart(csvData, summary, chartRequest)
        │  ├─ Create aggregation logic
        │  ├─ For each row:
        │  │  aggregated["Sales"].sum += 50000, count++
        │  │  aggregated["Engineering"].sum += 80000, count++
        │  │
        │  ├─ Calculate averages:
        │  │  - Sales: total/count = 55000 (avg)
        │  │  - Engineering: total/count = 75000 (avg)
        │  │
        │  └─ Return Chart.js config:
        │     {
        │       type: 'bar',
        │       title: 'Average Salary by Department',
        │       config: {
        │         type: 'bar',
        │         data: {
        │           labels: ['Sales', 'Engineering'],
        │           datasets: [{
        │             label: 'Average Salary',
        │             data: [55000, 75000],
        │             backgroundColor: 'rgba(102, 126, 234, 0.8)'
        │           }]
        │         },
        │         options: { responsive: true, ... }
        │       }
        │     }
```

#### Phase 3: Generate AI Response
```
generateAIResponse(message, datasetPath, mcpData)
↓
Build Gemini prompt with:
- Dataset info: 100 rows, 4 columns
- Chart generated: Average Salary by Department
- Available capabilities
↓
model.generateContent(prompt)
↓
Gemini generates narrative:
"Based on your data, I've created a bar chart showing the average salary 
 by department. Engineering has the highest average salary at $75,000, 
 followed by Sales at $55,000..."
↓
Return response object:
{
    response: "Based on your data, I've created...",
    chartData: {
        type: 'bar',
        title: 'Average Salary by Department',
        config: { ... Chart.js config ... }
    },
    timestamp: ISO string
}
```

#### Phase 4: Frontend Rendering
```
Response received in sendMessage()
↓
addMessage(response, 'bot', chartData)
  ├─ Create message div with avatar
  ├─ Render text content
  ├─ charData exists → createChartContainer()
  │  ├─ Create div with class 'chart-container'
  │  ├─ Add badge: "BAR"
  │  ├─ Add title: "Average Salary by Department"
  │  ├─ Create canvas element
  │  └─ Add description (optional)
  │
  └─ Append to chatMessages div
↓
setTimeout(() => renderChart(chartData, canvas))
  ├─ chartData.type === 'bar' → Chart.js
  ├─ new Chart(canvas, chartData.config)
  ├─ Chart.js renders bar chart in canvas
  └─ User sees visual representation
↓
User sees in chat:
┌─────────────────────────────────────┐
│ 🤖 AI Response                      │
│                                     │
│ Based on your data, I've created... │
│                                     │
│ ┌─ BAR CHART ───────────────────┐   │
│ │ Average Salary by Department   │   │
│ │                                │   │
│ │  Analytics   [Bar visual]      │   │
│ │                                │   │
│ └────────────────────────────────┘   │
└─────────────────────────────────────┘
```

---

## Key Technical Patterns

### 1. Intent Classification via LLM
The system uses Gemini to classify user intent before generating responses:
```javascript
// Rather than hardcoded rules, ask LLM to classify
const analysisPrompt = `Determine if this query needs chart (true) or text (false)...`;
const response = await geminiModel.generateContent(analysisPrompt);
const intent = JSON.parse(response.text()); // { needsChart: true, chartType: 'bar' }
```

**Advantage**: Handles ambiguous language better than keyword matching.

### 2. Fallback Column Mapping
System tries exact match → fuzzy match → synonym mapping:
```javascript
mapToStandardColumn(userCol, availableHeaders) {
    // 1. Exact match (case-insensitive)
    // 2. Partial match ("dept" → "Department")
    // 3. Synonym mapping ("salary" → "Compensation", "wage", "income")
    // 4. Return null if no match
}
```

**Advantage**: Graceful degradation when user says "dept" but column is "Department".

### 3. Smart Fallback Analysis
When MCP server is unavailable, backend still provides basic analysis:
```javascript
try {
    const advanced = await mcpClient.analyzeDataset(...);
} catch (error) {
    // Fallback to CSV parsing + basic Gemini analysis
    const fallback = await mcpClient.getDatasetSummary(datasetPath);
    return { success: false, mcpServerAvailable: false, ...fallback };
}
```

**Advantage**: Graceful degradation; users get something even if MCP unavailable.

### 4. Hybrid Chart Rendering
- **Heatmaps** → Plotly.js (better for correlation matrices)
- **Bar/Scatter/Histogram** → Chart.js (lighter, faster)

```javascript
if (chartData.type === 'heatmap') {
    Plotly.newPlot(div, plotlyConfig.data, plotlyConfig.layout);
} else {
    new Chart(canvas, chartData.config);
}
```

### 5. Deterministic Analysis + Generative Explanation
- **Deterministic**: Server computes actual statistics, aggregations, correlations
- **Generative**: Gemini provides conversational narrative around the data

**Advantage**: Outputs are correct (grounded in real data) AND engaging.

### 6. Resource Tracking (MCP Patterns)
```python
# MCP exposes a "resource" for audit trail
@server.list_resources()
async def handle_list_resources():
    return [Resource(uri="data-exploration://notes", ...)]

@server.read_resource()
async def handle_read_resource(uri):
    if uri == "data-exploration://notes":
        return script_runner.notes  # All actions logged here
```

**Advantage**: Traceable, auditable data science operations.

---

## Summary: Code Architecture

| Layer | Technology | Purpose | Key Components |
|-------|-----------|---------|-----------------|
| **Frontend** | HTML/CSS/JS | User interface | Drag-drop upload, chat UI, chart rendering |
| **Backend API** | Express.js | Route handling + orchestration | `/api/upload`, `/api/chat`, Gemini integration |
| **MCP Client** | Node.js | Analysis bridge | Chart generation, intent classification, CSV parsing |
| **MCP Server** | Python | Data science execution | Tools (load_csv, run_script), prompts, resources |

**Data flows through**: Frontend (user input) → Backend API (validation) → MCP Client (analysis) → CSV parsing & Chart generation → Gemini (narrative) → Response back to Frontend.

**Each layer is independent**: Frontend doesn't know about data science; Backend doesn't care about UI; MCP server is completely isolated Python process communicating via stdio.

This modular design enables:
- Easy testing of each component independently
- Clear responsibility boundaries
- Ability to replace components (e.g., swap Gemini for Claude)
- Scalability (distribute MCP server to separate machine)
