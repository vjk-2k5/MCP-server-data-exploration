const { spawn } = require('child_process');
const path = require('path');

class MCPServerClient {
    constructor() {
        this.mcpServerPath = path.join(__dirname, '../../src/mcp_server_ds/server.py');
        // Try common Python executable names on Windows
        this.pythonExecutable = process.platform === 'win32' ? 'python' : 'python3';
    }

    async analyzeDataset(csvPath, analysisQuestion, geminiModel = null) {
        try {
            console.log(`Starting analysis for: ${csvPath}`);
            
            const datasetSummary = await this.getDatasetSummary(csvPath);
            const correlationAnalysis = await this.performCorrelationAnalysis(csvPath);
            
            // Check if the question is asking for a specific visualization
            let chartRequest = null;
            let chartData = null;
            let textAnalysis = null;
            
            if (geminiModel) {
                const analysisResult = await this.extractColumnsFromQuestion(analysisQuestion, datasetSummary, geminiModel);
                
                if (analysisResult.needsChart && analysisResult.chartType !== 'none') {
                    // User wants a chart
                    chartRequest = await this.parseChartRequest(analysisQuestion, datasetSummary, geminiModel);
                    if (chartRequest) {
                        chartData = await this.generateChartData(csvPath, chartRequest, datasetSummary);
                    }
                } else {
                    // User wants text analysis only
                    textAnalysis = await this.generateTextAnalysis(csvPath, analysisQuestion, datasetSummary, geminiModel);
                }
            }
            
            return {
                success: true,
                datasetInfo: {
                    fileName: path.basename(csvPath),
                    filePath: csvPath,
                    ...datasetSummary
                },
                analysis: {
                    question: analysisQuestion,
                    correlationInsights: correlationAnalysis,
                    chartData: chartData,
                    textAnalysis: textAnalysis,
                    capabilities: [
                        "Statistical analysis with pandas, numpy, scipy",
                        "Interactive visualizations (Bar, Line, Scatter, Pie, Histogram)",
                        "Correlation heatmaps and pattern detection",
                        "Data distribution analysis",
                        "Advanced chart generation on demand",
                        "Text-based data insights and statistics"
                    ]
                },
                recommendations: [
                    "Explore statistical relationships between variables",
                    "Create visualizations: 'Show me a bar chart of [column]'",
                    "Generate scatter plots: 'Plot [column1] vs [column2]'",
                    "View distributions: 'Create a histogram of [column]'",
                    "Analyze correlations: 'Generate a correlation heatmap'"
                ]
            };
            
        } catch (error) {
            console.error('Error in analyzeDataset:', error);
            throw new Error('Failed to analyze dataset');
        }
    }

    async generateTextAnalysis(csvPath, question, datasetSummary, geminiModel) {
        try {
            console.log(`=== GENERATING TEXT ANALYSIS ===`);
            console.log(`Question: "${question}"`);
            
            // Read the data to perform calculations
            const csvData = await this.readCSVFile(csvPath);
            const { headers, rows } = csvData;
            
            // Create a data summary for analysis
            const dataSummary = {
                totalRows: rows.length,
                columns: headers.length,
                columnTypes: {}
            };
            
            // Analyze each column
            headers.forEach(col => {
                const values = rows.map(row => row[col]).filter(val => val && val.trim() !== '');
                const numericValues = values.map(val => parseFloat(val)).filter(val => !isNaN(val));
                
                if (numericValues.length > 0) {
                    dataSummary.columnTypes[col] = {
                        type: 'numeric',
                        count: numericValues.length,
                        min: Math.min(...numericValues),
                        max: Math.max(...numericValues),
                        average: numericValues.reduce((a, b) => a + b, 0) / numericValues.length,
                        uniqueValues: new Set(values).size
                    };
                } else {
                    dataSummary.columnTypes[col] = {
                        type: 'categorical',
                        count: values.length,
                        uniqueValues: new Set(values).size,
                        mostCommon: this.getMostCommon(values)
                    };
                }
            });
            
            // Use Gemini to generate intelligent text analysis
            const analysisPrompt = `
You are a data analyst. Based on the user's question and dataset information, provide a clear, insightful text analysis.

USER QUESTION: "${question}"

DATASET INFO:
- Total records: ${dataSummary.totalRows}
- Columns: ${headers.join(', ')}

COLUMN DETAILS:
${Object.entries(dataSummary.columnTypes).map(([col, info]) => {
    if (info.type === 'numeric') {
        return `${col}: ${info.count} values, range ${info.min.toFixed(2)} to ${info.max.toFixed(2)}, average ${info.average.toFixed(2)}`;
    } else {
        return `${col}: ${info.count} values, ${info.uniqueValues} unique categories, most common: ${info.mostCommon}`;
    }
}).join('\n')}

Provide a comprehensive answer to the user's question using this data. Include:
1. Direct answer to their question
2. Relevant statistics and insights
3. Key findings from the data
4. Any patterns or interesting observations

Be conversational, insightful, and focus on what the user actually asked about.
`;

            const result = await geminiModel.generateContent(analysisPrompt);
            const response = await result.response;
            return response.text().trim();
            
        } catch (error) {
            console.error('Error generating text analysis:', error);
            return null;
        }
    }
    
    getMostCommon(values) {
        const counts = {};
        values.forEach(val => counts[val] = (counts[val] || 0) + 1);
        return Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b, '');
    }

    async parseChartRequest(question, datasetSummary, geminiModel) {
        console.log(`=== GEMINI-POWERED CHART REQUEST PARSING ===`);
        console.log(`Question: "${question}"`);
        
        try {
            // Use Gemini to understand the chart request
            const analysisResult = await this.extractColumnsFromQuestion(question, datasetSummary, geminiModel);
            
            console.log(`Gemini analysis result:`, analysisResult);
            
            // Only create chart request if AI determines a chart is needed
            if (analysisResult.needsChart && analysisResult.chartType && analysisResult.chartType !== 'none') {
                return {
                    type: analysisResult.chartType,
                    originalQuestion: question,
                    requestedColumns: analysisResult.columns,
                    aggregationType: analysisResult.aggregationType,
                    reasoning: analysisResult.reasoning
                };
            }
            
            // Return null if no chart is needed (text-only response)
            return null;
            
        } catch (error) {
            console.error('Error in Gemini-powered chart request parsing:', error);
            return null;
        }
    }

    async extractColumnsFromQuestion(question, datasetSummary, geminiModel) {
        console.log(`=== GEMINI-POWERED QUERY ANALYSIS ===`);
        console.log(`User question: "${question}"`);
        console.log(`Available columns: ${datasetSummary.headers.join(', ')}`);
        
        try {
            const analysisPrompt = `
You are a data analysis expert. Analyze this user query to determine if they want a visual chart or just a text answer.

USER QUERY: "${question}"

AVAILABLE DATASET COLUMNS: ${datasetSummary.headers.join(', ')}
NUMERIC COLUMNS: ${datasetSummary.numericColumns.join(', ')}

Determine if the user wants:
1. CHART: Visual representation (words like "show", "chart", "plot", "graph", "visualize", "distribution", "correlation", "trends")
2. TEXT: Just information/statistics (words like "what is", "how many", "tell me", "explain", "describe", "summary")

Respond ONLY with a JSON object in this exact format:
{
    "needsChart": true|false,
    "chartType": "bar|scatter|pie|histogram|heatmap|line|none",
    "requestedColumns": ["column1", "column2"],
    "aggregationType": "count|average|sum|distribution|correlation|summary",
    "reasoning": "Brief explanation of your interpretation"
}

Rules:
- Set needsChart to false for questions asking for simple statistics, counts, explanations, or descriptions
- Set needsChart to true for requests explicitly asking for visualizations
- Column names must EXACTLY match the available columns (case-sensitive)
- For text-only responses, set chartType to "none"

Examples:
- "How many students are there?" → needsChart: false, chartType: "none"
- "What's the average score?" → needsChart: false, chartType: "none"  
- "Show me a bar chart of grades" → needsChart: true, chartType: "bar"
- "Tell me about the dataset" → needsChart: false, chartType: "none"
- "Visualize performance by department" → needsChart: true, chartType: "bar"
`;

            const result = await geminiModel.generateContent(analysisPrompt);
            const response = await result.response;
            const aiAnalysis = response.text().trim();
            
            console.log(`Gemini analysis: ${aiAnalysis}`);
            
            // Parse the JSON response
            let analysis;
            try {
                // Extract JSON from response (in case there's extra text)
                const jsonMatch = aiAnalysis.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    analysis = JSON.parse(jsonMatch[0]);
                } else {
                    analysis = JSON.parse(aiAnalysis);
                }
            } catch (parseError) {
                console.error('Failed to parse Gemini response as JSON:', parseError);
                console.log('Raw response:', aiAnalysis);
                // Fallback to simple keyword extraction
                return this.fallbackColumnExtraction(question, datasetSummary);
            }
            
            console.log(`Parsed analysis:`, analysis);
            
            // Validate that requested columns exist in the dataset
            const validColumns = [];
            if (analysis.requestedColumns) {
                for (const col of analysis.requestedColumns) {
                    const exactMatch = datasetSummary.headers.find(h => h === col);
                    if (exactMatch) {
                        validColumns.push(exactMatch);
                    } else {
                        // Try fuzzy matching if exact match fails
                        const fuzzyMatch = this.mapToStandardColumn(col, datasetSummary.headers);
                        if (fuzzyMatch) {
                            validColumns.push(fuzzyMatch);
                        }
                    }
                }
            }
            
            console.log(`Final extracted columns: ${validColumns.join(', ')}`);
            
            return {
                columns: validColumns,
                needsChart: analysis.needsChart,
                chartType: analysis.chartType,
                aggregationType: analysis.aggregationType,
                reasoning: analysis.reasoning
            };
            
        } catch (error) {
            console.error('Error in Gemini-powered query analysis:', error);
            // Fallback to simple extraction
            return this.fallbackColumnExtraction(question, datasetSummary);
        }
    }

    fallbackColumnExtraction(question, datasetSummary) {
        console.log('Using fallback column extraction');
        const lowercaseQ = question.toLowerCase();
        
        // Simple keyword matching as fallback
        const extractedColumns = datasetSummary.headers.filter(header => 
            lowercaseQ.includes(header.toLowerCase())
        );
        
        // Simple heuristic for chart vs text
        const chartKeywords = ['show', 'chart', 'plot', 'graph', 'visualize', 'display'];
        const needsChart = chartKeywords.some(keyword => lowercaseQ.includes(keyword));
        
        return {
            columns: extractedColumns.slice(0, 2), // Limit to 2 columns
            needsChart: needsChart,
            chartType: needsChart ? 'bar' : 'none', // Default chart type or none
            aggregationType: 'count', // Default aggregation
            reasoning: 'Fallback analysis using keyword matching'
        };
    }

    mapToStandardColumn(columnName, availableColumns) {
        const lowercaseName = columnName.toLowerCase();
        console.log(`Mapping column name: "${columnName}" against available columns:`, availableColumns);
        
        // First try exact match (case insensitive)
        const exactMatch = availableColumns.find(col => 
            col.toLowerCase() === lowercaseName
        );
        if (exactMatch) {
            console.log(`Exact match found: ${exactMatch}`);
            return exactMatch;
        }
        
        // Try partial match (column contains the word)
        const partialMatch = availableColumns.find(col => 
            col.toLowerCase().includes(lowercaseName) || lowercaseName.includes(col.toLowerCase())
        );
        if (partialMatch) {
            console.log(`Partial match found: ${partialMatch}`);
            return partialMatch;
        }
        
        // Try fuzzy matching for common synonyms
        const synonyms = {
            'dept': ['department'],
            'perf': ['performance'],
            'exp': ['experience'],
            'avg': ['average'],
            'count': ['number', 'total'],
            'score': ['grade', 'rating', 'mark'],
            'student': ['pupil', 'learner'],
            'salary': ['income', 'wage', 'pay', 'compensation'],
            'age': ['years', 'old']
        };
        
        for (const [key, variations] of Object.entries(synonyms)) {
            if (lowercaseName.includes(key)) {
                for (const variation of variations) {
                    const synonymMatch = availableColumns.find(col => 
                        col.toLowerCase().includes(variation)
                    );
                    if (synonymMatch) {
                        console.log(`Synonym match found: ${synonymMatch} (${key} -> ${variation})`);
                        return synonymMatch;
                    }
                }
            }
        }
        
        console.log(`No match found for: ${lowercaseName}`);
        return null;
    }

    async generateChartData(csvPath, chartRequest, datasetSummary) {
        try {
            const csvData = await this.readCSVData(csvPath);
            const chartType = chartRequest.type;
            
            // Additional safety check
            if (!csvData || !csvData.headers || !csvData.rows) {
                console.error('Invalid CSV data structure');
                return null;
            }
            
            console.log(`Generating ${chartType} chart with ${csvData.rows.length} rows and columns:`, csvData.headers);
            console.log('Numeric columns available:', datasetSummary.numericColumns || []);
            console.log('Requested columns:', chartRequest.requestedColumns || 'None specified');
            
            switch (chartType) {
                case 'bar':
                    return this.generateBarChart(csvData, datasetSummary, chartRequest);
                case 'scatter':
                    return this.generateScatterChart(csvData, datasetSummary, chartRequest);
                case 'pie':
                    return this.generatePieChart(csvData, datasetSummary, chartRequest);
                case 'histogram':
                    return this.generateHistogram(csvData, datasetSummary, chartRequest);
                case 'heatmap':
                    return this.generateHeatmap(csvData, datasetSummary, chartRequest);
                case 'line':
                    return this.generateLineChart(csvData, datasetSummary, chartRequest);
                default:
                    return null;
            }
        } catch (error) {
            console.error('Error generating chart data:', error);
            return null;
        }
    }

    async readCSVData(csvPath) {
        const fs = require('fs');
        const readline = require('readline');
        
        const fileStream = fs.createReadStream(csvPath);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        let headers = [];
        let rows = [];

        for await (const line of rl) {
            if (headers.length === 0) {
                headers = line.split(',').map(h => h.trim().replace(/"/g, ''));
            } else {
                const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
                if (values.length === headers.length) {
                    const row = {};
                    headers.forEach((header, index) => {
                        row[header] = values[index];
                    });
                    rows.push(row);
                }
            }
        }

        return { headers, rows };
    }

    generateBarChart(csvData, datasetSummary, chartRequest = {}) {
        const { headers, rows } = csvData;
        
        // Safety check for empty data
        if (!headers || headers.length === 0 || !rows || rows.length === 0) {
            throw new Error('No data available for chart generation');
        }
        
        console.log('=== DYNAMIC BAR CHART GENERATION ===');
        console.log('Available headers:', headers);
        console.log('Chart request:', chartRequest);
        
        let categoricalCol = null;
        let numericCol = null;
        let chartTitle = 'Bar Chart';
        
        // Step 1: Analyze the user's request using Gemini's understanding
        const aggregationType = chartRequest.aggregationType || 'count';
        const question = chartRequest.originalQuestion?.toLowerCase() || '';
        
        // Use Gemini's understanding to determine chart mode
        let isCountChart = (aggregationType === 'count' || aggregationType === 'distribution');
        let isAverageChart = (aggregationType === 'average');
        let isSumChart = (aggregationType === 'sum');
        
        console.log(`Gemini determined aggregation type: ${aggregationType}`);
        console.log(`Chart modes - Count: ${isCountChart}, Average: ${isAverageChart}, Sum: ${isSumChart}`);
        
        // Step 2: Try to map requested columns to actual dataset columns
        if (chartRequest.requestedColumns && chartRequest.requestedColumns.length > 0) {
            console.log('Processing requested columns:', chartRequest.requestedColumns);
            
            for (const requestedCol of chartRequest.requestedColumns) {
                const mappedCol = this.mapToStandardColumn(requestedCol, headers);
                if (mappedCol) {
                    // Decide if this should be categorical or numeric based on data type
                    if (datasetSummary.categoricalColumns.includes(mappedCol)) {
                        categoricalCol = mappedCol;
                        console.log(`Mapped categorical column: ${requestedCol} -> ${mappedCol}`);
                    } else if (datasetSummary.numericColumns.includes(mappedCol) && !isCountChart) {
                        numericCol = mappedCol;
                        console.log(`Mapped numeric column: ${requestedCol} -> ${mappedCol}`);
                    }
                }
            }
        }
        
        // Step 3: Smart fallbacks if no columns were mapped
        if (!categoricalCol) {
            // Find the best categorical column (avoid ID-like columns)
            categoricalCol = datasetSummary.categoricalColumns.find(col => 
                !col.toLowerCase().includes('id') && 
                !col.toLowerCase().includes('email') &&
                !col.toLowerCase().includes('name') &&
                col.toLowerCase() !== 'student_id'
            ) || datasetSummary.categoricalColumns[0];
            console.log(`Fallback categorical column: ${categoricalCol}`);
        }
        
        if (!numericCol && !isCountChart) {
            // Find the best numeric column for averaging
            numericCol = datasetSummary.numericColumns.find(col => 
                !col.toLowerCase().includes('id')
            ) || datasetSummary.numericColumns[0];
            console.log(`Fallback numeric column: ${numericCol}`);
        }
        
        // Step 4: Set count mode if requested or if no suitable numeric column
        if (isCountChart || !numericCol) {
            numericCol = 'Count';
            isCountChart = true;
            console.log('Using COUNT mode');
        }
        
        // Step 5: Generate appropriate chart title based on Gemini's understanding
        if (isCountChart) {
            chartTitle = `Count by ${categoricalCol}`;
        } else if (isAverageChart) {
            chartTitle = `Average ${numericCol} by ${categoricalCol}`;
        } else if (isSumChart) {
            chartTitle = `Total ${numericCol} by ${categoricalCol}`;
        } else {
            chartTitle = `${numericCol} by ${categoricalCol}`;
        }
        
        console.log(`Final selection - Categorical: ${categoricalCol}, Numeric: ${numericCol}, Title: ${chartTitle}`);
        console.log(`Gemini reasoning: ${chartRequest.reasoning || 'No reasoning provided'}`);
        
        // Step 6: Aggregate the data based on aggregation type
        const aggregated = {};
        rows.forEach(row => {
            const category = row[categoricalCol];
            if (!category) return; // Skip rows with empty category
            
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
        
        const labels = Object.keys(aggregated);
        const data = labels.map(label => {
            if (isCountChart) {
                return aggregated[label].count;
            } else if (isAverageChart) {
                return aggregated[label].values.length > 0 ? 
                    aggregated[label].sum / aggregated[label].values.length : 0;
            } else if (isSumChart) {
                return aggregated[label].sum;
            } else {
                // Default to average
                return aggregated[label].values.length > 0 ? 
                    aggregated[label].sum / aggregated[label].values.length : 0;
            }
        });
        
        console.log('Chart data generated:', { labels, data });
        
        return {
            type: 'bar',
            title: chartTitle,
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
                    plugins: {
                        title: {
                            display: true,
                            text: chartTitle
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: isCountChart ? 'Count' : `Average ${numericCol}`
                            }
                        },
                        x: {
                            title: {
                                display: true,
                                text: categoricalCol
                            }
                        }
                    }
                }
            }
        };
    }

    generateScatterChart(csvData, datasetSummary, chartRequest = {}) {
        const { rows } = csvData;
        
        console.log('=== DYNAMIC SCATTER CHART GENERATION ===');
        console.log('Available columns:', datasetSummary.headers);
        console.log('Chart request:', chartRequest);
        
        let xColumn = null;
        let yColumn = null;
        
        // Step 1: Try to map requested columns to actual dataset columns
        if (chartRequest.requestedColumns && chartRequest.requestedColumns.length >= 2) {
            console.log('Processing requested columns for scatter plot:', chartRequest.requestedColumns);
            
            const mappedCols = chartRequest.requestedColumns.map(col => 
                this.mapToStandardColumn(col, datasetSummary.headers)
            ).filter(col => col && datasetSummary.numericColumns.includes(col));
            
            if (mappedCols.length >= 2) {
                xColumn = mappedCols[0];
                yColumn = mappedCols[1];
                console.log(`Successfully mapped scatter columns: ${xColumn} vs ${yColumn}`);
            }
        } else if (chartRequest.requestedColumns && chartRequest.requestedColumns.length === 1) {
            // If only one column specified, try to pair it with a related column
            const mappedCol = this.mapToStandardColumn(chartRequest.requestedColumns[0], datasetSummary.headers);
            if (mappedCol && datasetSummary.numericColumns.includes(mappedCol)) {
                xColumn = mappedCol;
                // Find a good pairing column
                yColumn = datasetSummary.numericColumns.find(col => col !== xColumn);
                console.log(`Paired single column ${xColumn} with ${yColumn}`);
            }
        }
        
        // Step 2: Smart fallbacks if no columns were mapped
        if (!xColumn || !yColumn) {
            console.log('Using fallback columns for scatter plot');
            const availableNumeric = datasetSummary.numericColumns.filter(col => 
                !col.toLowerCase().includes('id')
            );
            
            if (availableNumeric.length >= 2) {
                xColumn = availableNumeric[0];
                yColumn = availableNumeric[1];
                console.log(`Fallback scatter columns: ${xColumn} vs ${yColumn}`);
            } else {
                console.log('Not enough numeric columns for scatter plot');
                return null;
            }
        }
        
        console.log(`Final scatter plot: ${xColumn} vs ${yColumn}`);
        
        // Step 3: Generate the data points
        const data = rows.map(row => ({
            x: parseFloat(row[xColumn]) || 0,
            y: parseFloat(row[yColumn]) || 0
        })).filter(point => !isNaN(point.x) && !isNaN(point.y));
        
        console.log(`Generated ${data.length} data points for scatter plot`);
        
        return {
            type: 'scatter',
            title: `${xColumn} vs ${yColumn}`,
            config: {
                type: 'scatter',
                data: {
                    datasets: [{
                        label: `${xColumn} vs ${yColumn}`,
                        data: data,
                        backgroundColor: 'rgba(102, 126, 234, 0.6)',
                        borderColor: 'rgba(102, 126, 234, 1)',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        title: {
                            display: true,
                            text: `${xColumn} vs ${yColumn}`
                        }
                    },
                    scales: {
                        x: {
                            title: {
                                display: true,
                                text: xColumn
                            }
                        },
                        y: {
                            title: {
                                display: true,
                                text: yColumn
                            }
                        }
                    }
                }
            }
        };
    }

    generateHistogram(csvData, datasetSummary, chartRequest = {}) {
        const { rows } = csvData;
        
        console.log('=== DYNAMIC HISTOGRAM GENERATION ===');
        console.log('Available columns:', datasetSummary.headers);
        console.log('Chart request:', chartRequest);
        
        let targetColumn = null;
        
        // Step 1: Extract column from user query if available
        if (chartRequest.requestedColumns && chartRequest.requestedColumns.length > 0) {
            console.log('Processing requested column for histogram:', chartRequest.requestedColumns[0]);
            targetColumn = this.mapToStandardColumn(chartRequest.requestedColumns[0], datasetSummary.headers);
            
            // Verify it's numeric
            if (targetColumn && !datasetSummary.numericColumns.includes(targetColumn)) {
                console.log(`Column ${targetColumn} is not numeric, searching for numeric alternative`);
                targetColumn = null;
            }
        }
        
        // Step 2: Smart fallback if no column was mapped
        if (!targetColumn) {
            console.log('Using fallback column for histogram');
            // Find the most suitable numeric column (exclude IDs)
            const suitableColumns = datasetSummary.numericColumns.filter(col => 
                !col.toLowerCase().includes('id') &&
                !col.toLowerCase().includes('index')
            );
            
            if (suitableColumns.length > 0) {
                targetColumn = suitableColumns[0];
                console.log(`Selected fallback histogram column: ${targetColumn}`);
            } else if (datasetSummary.numericColumns.length > 0) {
                targetColumn = datasetSummary.numericColumns[0];
                console.log(`Using first available numeric column: ${targetColumn}`);
            } else {
                console.log('No numeric columns available for histogram');
                return null;
            }
        }
        
        console.log(`Final histogram column: ${targetColumn}`);
        
        // Step 3: Extract and process values
        const values = rows.map(row => parseFloat(row[targetColumn]))
                          .filter(val => !isNaN(val));
        
        if (values.length === 0) {
            console.log('No valid numeric values found for histogram');
            return null;
        }
        
        // Step 4: Create bins dynamically
        const min = Math.min(...values);
        const max = Math.max(...values);
        const binCount = Math.min(20, Math.ceil(Math.sqrt(values.length))); // Dynamic bin count
        const binSize = (max - min) / binCount;
        
        const bins = Array(binCount).fill(0);
        const binLabels = [];
        
        for (let i = 0; i < binCount; i++) {
            const binStart = min + (i * binSize);
            const binEnd = min + ((i + 1) * binSize);
            binLabels.push(`${binStart.toFixed(1)}-${binEnd.toFixed(1)}`);
        }
        
        // Step 5: Count values in each bin
        values.forEach(val => {
            let binIndex = Math.floor((val - min) / binSize);
            if (binIndex >= binCount) binIndex = binCount - 1; // Handle edge case
            if (binIndex >= 0) bins[binIndex]++;
        });
        
        console.log(`Generated histogram with ${binCount} bins for ${values.length} values`);
        
        return {
            type: 'histogram',
            title: `Distribution of ${targetColumn}`,
            config: {
                type: 'bar',
                data: {
                    labels: binLabels,
                    datasets: [{
                        label: `Frequency of ${targetColumn}`,
                        data: bins,
                        backgroundColor: 'rgba(255, 159, 64, 0.6)',
                        borderColor: 'rgba(255, 159, 64, 1)',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        title: {
                            display: true,
                            text: `Distribution of ${targetColumn}`
                        }
                    },
                    scales: {
                        x: {
                            title: {
                                display: true,
                                text: `${targetColumn} Ranges`
                            }
                        },
                        y: {
                            title: {
                                display: true,
                                text: 'Frequency'
                            },
                            beginAtZero: true
                        }
                    }
                }
            }
        };
    }

    generateHeatmap(csvData, datasetSummary, chartRequest = {}) {
        const { rows } = csvData;
        
        console.log('=== DYNAMIC HEATMAP GENERATION ===');
        console.log('Available columns:', datasetSummary.headers);
        console.log('Chart request:', chartRequest);
        
        // Step 1: Filter numeric columns (exclude IDs and indices)
        const suitableColumns = datasetSummary.numericColumns.filter(col => 
            !col.toLowerCase().includes('id') &&
            !col.toLowerCase().includes('index') &&
            !col.toLowerCase().includes('row')
        );
        
        // Use requested columns if available and valid
        let targetColumns = [];
        if (chartRequest.requestedColumns && chartRequest.requestedColumns.length > 0) {
            console.log('Processing requested columns for heatmap:', chartRequest.requestedColumns);
            
            const mappedCols = chartRequest.requestedColumns.map(col => 
                this.mapToStandardColumn(col, datasetSummary.headers)
            ).filter(col => col && suitableColumns.includes(col));
            
            if (mappedCols.length >= 2) {
                targetColumns = mappedCols.slice(0, 6); // Limit for readability
                console.log(`Using requested columns for heatmap: ${targetColumns.join(', ')}`);
            }
        }
        
        // Step 2: Fallback to suitable columns
        if (targetColumns.length < 2) {
            targetColumns = suitableColumns.slice(0, 6); // Limit for readability
            console.log(`Using fallback columns for heatmap: ${targetColumns.join(', ')}`);
        }
        
        if (targetColumns.length < 2) {
            console.log('Not enough numeric columns for correlation heatmap');
            return null;
        }
        
        console.log(`Final heatmap columns: ${targetColumns.join(', ')}`);
        
        // Step 3: Calculate correlation matrix
        const correlationMatrix = [];
        const correlationValues = [];
        
        for (let i = 0; i < targetColumns.length; i++) {
            correlationMatrix[i] = [];
            for (let j = 0; j < targetColumns.length; j++) {
                const correlation = this.calculateCorrelation(rows, targetColumns[i], targetColumns[j]);
                correlationMatrix[i][j] = correlation;
                correlationValues.push(correlation);
            }
        }
        
        console.log(`Generated ${targetColumns.length}x${targetColumns.length} correlation matrix`);
        
        return {
            type: 'heatmap',
            title: `Correlation Heatmap: ${targetColumns.join(', ')}`,
            plotlyConfig: {
                data: [{
                    z: correlationMatrix,
                    x: targetColumns,
                    y: targetColumns,
                    type: 'heatmap',
                    colorscale: 'RdBu',
                    zmid: 0,
                    text: correlationMatrix.map(row => 
                        row.map(val => val.toFixed(2))
                    ),
                    texttemplate: "%{text}",
                    textfont: { color: "white" },
                    hoverongaps: false
                }],
                layout: {
                    title: `Correlation Heatmap: ${targetColumns.join(', ')}`,
                    xaxis: { title: 'Variables' },
                    yaxis: { title: 'Variables' },
                    width: 500,
                    height: 400
                }
            }
        };
    }

    generatePieChart(csvData, datasetSummary, chartRequest = {}) {
        const { headers, rows } = csvData;
        
        console.log('=== DYNAMIC PIE CHART GENERATION ===');
        console.log('Available columns:', datasetSummary.headers);
        console.log('Chart request:', chartRequest);
        
        let targetColumn = null;
        
        // Step 1: Extract column from user query if available
        if (chartRequest.requestedColumns && chartRequest.requestedColumns.length > 0) {
            console.log('Processing requested column for pie chart:', chartRequest.requestedColumns[0]);
            targetColumn = this.mapToStandardColumn(chartRequest.requestedColumns[0], datasetSummary.headers);
            
            // Verify it exists in headers
            if (targetColumn && !headers.includes(targetColumn)) {
                console.log(`Column ${targetColumn} not found in headers`);
                targetColumn = null;
            }
        }
        
        // Step 2: Smart fallback - find best categorical column
        if (!targetColumn) {
            console.log('Using fallback column for pie chart');
            
            // Prefer columns with categorical keywords
            const categoricalKeywords = ['department', 'category', 'type', 'name', 'group', 'status', 'class', 'region', 'team', 'role', 'level', 'grade'];
            
            targetColumn = headers.find(h => 
                categoricalKeywords.some(keyword => 
                    h.toLowerCase().includes(keyword)
                )
            );
            
            // If no categorical column found, use first non-numeric column
            if (!targetColumn) {
                const nonNumericCols = headers.filter(h => !datasetSummary.numericColumns.includes(h));
                targetColumn = nonNumericCols[0] || headers[0];
            }
            
            console.log(`Selected fallback pie chart column: ${targetColumn}`);
        }
        
        console.log(`Final pie chart column: ${targetColumn}`);
        
        // Step 3: Count unique values
        const counts = {};
        const totalRows = rows.length;
        
        rows.forEach(row => {
            const category = row[targetColumn] || 'Unknown';
            counts[category] = (counts[category] || 0) + 1;
        });
        
        // Step 4: Handle too many categories
        const sortedCategories = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        const maxCategories = 10;
        
        let finalCategories = sortedCategories;
        if (sortedCategories.length > maxCategories) {
            const topCategories = sortedCategories.slice(0, maxCategories - 1);
            const othersCount = sortedCategories.slice(maxCategories - 1).reduce((sum, [, count]) => sum + count, 0);
            
            if (othersCount > 0) {
                finalCategories = [...topCategories, ['Others', othersCount]];
            }
            
            console.log(`Grouped ${sortedCategories.length - maxCategories + 1} categories into "Others"`);
        }
        
        const labels = finalCategories.map(([label]) => label);
        const data = finalCategories.map(([, count]) => count);
        
        // Step 5: Generate distinct colors
        const colors = labels.map((_, index) => 
            `hsl(${(index * 360 / labels.length)}, 70%, 60%)`
        );
        
        console.log(`Generated pie chart with ${labels.length} categories from ${totalRows} records`);
        
        return {
            type: 'pie',
            title: `Distribution of ${targetColumn}`,
            config: {
                type: 'pie',
                data: {
                    labels: labels,
                    datasets: [{
                        data: data,
                        backgroundColor: colors,
                        borderWidth: 2,
                        borderColor: '#fff'
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        title: {
                            display: true,
                            text: `Distribution of ${targetColumn}`
                        },
                        legend: {
                            position: 'bottom'
                        }
                    }
                }
            }
        };
    }

    generateLineChart(csvData, datasetSummary, chartRequest = {}) {
        const { rows } = csvData;
        const numericCols = datasetSummary.numericColumns;
        
        if (numericCols.length === 0) return null;
        
        // Sort by first column or index
        const sortedRows = rows.slice().sort((a, b) => {
            const aVal = parseFloat(a[numericCols[0]]) || 0;
            const bVal = parseFloat(b[numericCols[0]]) || 0;
            return aVal - bVal;
        });
        
        const labels = sortedRows.map((_, index) => `Point ${index + 1}`);
        const data = sortedRows.map(row => parseFloat(row[numericCols[0]]) || 0);
        
        return {
            type: 'line',
            title: `Trend of ${numericCols[0]}`,
            config: {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: numericCols[0],
                        data: data,
                        borderColor: 'rgba(102, 126, 234, 1)',
                        backgroundColor: 'rgba(102, 126, 234, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        title: {
                            display: true,
                            text: `Trend of ${numericCols[0]}`
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: false,
                            title: {
                                display: true,
                                text: numericCols[0]
                            }
                        }
                    }
                }
            }
        };
    }

    async performCorrelationAnalysis(csvPath) {
        try {
            const fs = require('fs');
            const readline = require('readline');
            
            // Read the CSV and analyze numeric columns
            const fileStream = fs.createReadStream(csvPath);
            const rl = readline.createInterface({
                input: fileStream,
                crlfDelay: Infinity
            });

            let headers = [];
            let numericColumns = [];
            let rowCount = 0;
            let sampleValues = {};

            for await (const line of rl) {
                if (rowCount === 0) {
                    headers = line.split(',').map(h => h.trim().replace(/"/g, ''));
                    headers.forEach(header => {
                        sampleValues[header] = [];
                    });
                } else if (rowCount < 10) { // Sample first 10 rows
                    const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
                    headers.forEach((header, index) => {
                        if (values[index]) {
                            sampleValues[header].push(values[index]);
                        }
                    });
                }
                rowCount++;
                if (rowCount > 10) break;
            }

            // Identify numeric columns
            headers.forEach(header => {
                const samples = sampleValues[header];
                const numericSamples = samples.filter(val => !isNaN(parseFloat(val)) && isFinite(val));
                if (numericSamples.length > samples.length * 0.7) { // >70% numeric
                    numericColumns.push(header);
                }
            });

            return {
                totalColumns: headers.length,
                numericColumns: numericColumns,
                potentialCorrelations: this.suggestCorrelations(numericColumns),
                analysis: `Found ${numericColumns.length} numeric columns out of ${headers.length} total columns. Key columns for correlation analysis: ${numericColumns.join(', ')}`
            };

        } catch (error) {
            console.error('Error in correlation analysis:', error);
            return {
                error: 'Could not perform correlation analysis',
                analysis: 'Basic file structure analysis available'
            };
        }
    }

    suggestCorrelations(numericColumns) {
        const suggestions = [];
        
        // Common correlation patterns
        const patterns = [
            { keywords: ['salary', 'experience', 'years'], relationship: 'Salary typically increases with experience' },
            { keywords: ['age', 'experience'], relationship: 'Age often correlates with years of experience' },
            { keywords: ['score', 'performance', 'rating'], relationship: 'Performance metrics may correlate with other factors' },
            { keywords: ['price', 'cost', 'value'], relationship: 'Price-related variables often show strong correlations' },
            { keywords: ['size', 'area', 'volume'], relationship: 'Physical measurements typically correlate' }
        ];

        patterns.forEach(pattern => {
            const matchingColumns = numericColumns.filter(col => 
                pattern.keywords.some(keyword => 
                    col.toLowerCase().includes(keyword.toLowerCase())
                )
            );
            
            if (matchingColumns.length >= 2) {
                suggestions.push({
                    columns: matchingColumns,
                    insight: pattern.relationship,
                    suggested_analysis: `Analyze correlation between ${matchingColumns.join(' and ')}`
                });
            }
        });

        return suggestions;
    }

    createMCPRequest(csvPath, analysisQuestion) {
        // Create a proper MCP request format
        return {
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: {
                name: "load_csv",
                arguments: {
                    csv_path: csvPath,
                    df_name: "main_df"
                }
            }
        };
    }

    parseMCPResponse(responseData, csvPath, analysisQuestion) {
        try {
            // For now, create a structured response based on the CSV analysis
            const fs = require('fs');
            const csvStats = fs.statSync(csvPath);
            
            return {
                success: true,
                datasetInfo: {
                    fileName: path.basename(csvPath),
                    filePath: csvPath,
                    fileSize: csvStats.size,
                    lastModified: csvStats.mtime
                },
                analysis: {
                    question: analysisQuestion,
                    mcpServerResponse: responseData.trim() || "MCP server processed the request",
                    capabilities: [
                        "Load CSV data",
                        "Perform statistical analysis",
                        "Generate data summaries",
                        "Create visualizations",
                        "Detect patterns and correlations"
                    ]
                },
                recommendations: [
                    "Explore basic statistics (mean, median, mode)",
                    "Check for missing values and data quality",
                    "Analyze correlations between variables",
                    "Create visualizations for key insights",
                    "Identify outliers and anomalies"
                ]
            };
        } catch (error) {
            console.error('Error parsing MCP response:', error);
            return {
                success: false,
                error: error.message,
                datasetInfo: {
                    fileName: path.basename(csvPath),
                    filePath: csvPath
                }
            };
        }
    }

    async getDatasetSummary(csvPath) {
        try {
            const fs = require('fs');
            const readline = require('readline');
            
            // Read first few lines to get column information
            const fileStream = fs.createReadStream(csvPath);
            const rl = readline.createInterface({
                input: fileStream,
                crlfDelay: Infinity
            });

            let lineCount = 0;
            let headers = [];
            let sampleRows = [];

            for await (const line of rl) {
                if (lineCount === 0) {
                    headers = line.split(',').map(h => h.trim().replace(/"/g, ''));
                } else if (lineCount < 10) {
                    sampleRows.push(line.split(',').map(cell => cell.trim().replace(/"/g, '')));
                }
                lineCount++;
                if (lineCount > 10) break;
            }

            // Analyze column types
            const numericColumns = [];
            const categoricalColumns = [];

            headers.forEach((header, index) => {
                let isNumeric = true;
                // Check if most values in this column are numeric
                for (let row of sampleRows.slice(0, 5)) {
                    if (row[index] && isNaN(parseFloat(row[index]))) {
                        isNumeric = false;
                        break;
                    }
                }
                
                if (isNumeric) {
                    numericColumns.push(header);
                } else {
                    categoricalColumns.push(header);
                }
            });

            const stats = fs.statSync(csvPath);

            return {
                fileName: path.basename(csvPath),
                headers: headers,
                columnCount: headers.length,
                estimatedRows: lineCount - 1,
                fileSize: stats.size,
                sampleData: sampleRows,
                lastModified: stats.mtime,
                numericColumns: numericColumns,
                categoricalColumns: categoricalColumns
            };

        } catch (error) {
            console.error('Error getting dataset summary:', error);
            throw new Error('Failed to analyze dataset structure');
        }
    }

    calculateCorrelation(rows, col1, col2) {
        const values1 = rows.map(row => parseFloat(row[col1])).filter(val => !isNaN(val));
        const values2 = rows.map(row => parseFloat(row[col2])).filter(val => !isNaN(val));
        
        if (values1.length !== values2.length || values1.length === 0) return 0;
        
        const mean1 = values1.reduce((a, b) => a + b) / values1.length;
        const mean2 = values2.reduce((a, b) => a + b) / values2.length;
        
        let numerator = 0;
        let sum1 = 0;
        let sum2 = 0;
        
        for (let i = 0; i < values1.length; i++) {
            const diff1 = values1[i] - mean1;
            const diff2 = values2[i] - mean2;
            numerator += diff1 * diff2;
            sum1 += diff1 * diff1;
            sum2 += diff2 * diff2;
        }
        
        const denominator = Math.sqrt(sum1 * sum2);
        return denominator === 0 ? 0 : numerator / denominator;
    }
}

module.exports = MCPServerClient;