// Global variables
let currentFile = null;
let currentDatasetPath = null;
const API_BASE_URL = 'http://localhost:3001/api';

// DOM elements
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const uploadSection = document.getElementById('uploadSection');
const chatSection = document.getElementById('chatSection');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const fileSize = document.getElementById('fileSize');
const uploadProgress = document.getElementById('uploadProgress');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const typingIndicator = document.getElementById('typingIndicator');
const datasetName = document.getElementById('datasetName');

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
    // File input change
    fileInput.addEventListener('change', handleFileSelect);
    
    // Drag and drop
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('dragleave', handleDragLeave);
    uploadArea.addEventListener('drop', handleDrop);
    
    // Chat input
    chatInput.addEventListener('keypress', handleKeyPress);
    
    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });
}

// Utility functions
function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function handleDragOver(e) {
    uploadArea.classList.add('dragover');
}

function handleDragLeave(e) {
    uploadArea.classList.remove('dragover');
}

function handleDrop(e) {
    uploadArea.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFile(files[0]);
    }
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        handleFile(file);
    }
}

// File handling
function handleFile(file) {
    // Validate file type
    if (!file.name.toLowerCase().endsWith('.csv')) {
        showError('Please select a CSV file.');
        return;
    }
    
    // Validate file size (max 50MB)
    if (file.size > 50 * 1024 * 1024) {
        showError('File size must be less than 50MB.');
        return;
    }
    
    currentFile = file;
    showFileInfo(file);
    uploadFile(file);
}

function showFileInfo(file) {
    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);
    fileInfo.style.display = 'block';
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function removeFile() {
    currentFile = null;
    currentDatasetPath = null;
    fileInfo.style.display = 'none';
    fileInput.value = '';
    chatSection.style.display = 'none';
    uploadSection.style.display = 'block';
}

function changeDataset() {
    removeFile();
}

// File upload
async function uploadFile(file) {
    const formData = new FormData();
    formData.append('dataset', file);
    
    uploadProgress.style.display = 'block';
    
    try {
        const xhr = new XMLHttpRequest();
        
        // Track upload progress
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percentComplete = (e.loaded / e.total) * 100;
                updateProgress(percentComplete);
            }
        });
        
        xhr.onload = function() {
            if (xhr.status === 200) {
                const response = JSON.parse(xhr.responseText);
                currentDatasetPath = response.filePath;
                showChatInterface(file.name);
            } else {
                showError('Failed to upload file. Please try again.');
            }
            uploadProgress.style.display = 'none';
        };
        
        xhr.onerror = function() {
            showError('Upload failed. Please check your connection and try again.');
            uploadProgress.style.display = 'none';
        };
        
        xhr.open('POST', `${API_BASE_URL}/upload`);
        xhr.send(formData);
        
    } catch (error) {
        console.error('Upload error:', error);
        showError('Upload failed. Please try again.');
        uploadProgress.style.display = 'none';
    }
}

function updateProgress(percent) {
    progressFill.style.width = percent + '%';
    progressText.textContent = Math.round(percent) + '%';
}

// Chat interface
function showChatInterface(filename) {
    datasetName.textContent = filename;
    uploadSection.style.display = 'none';
    chatSection.style.display = 'flex';
    chatInput.focus();
}

function handleKeyPress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

async function sendMessage() {
    const message = chatInput.value.trim();
    if (!message) return;
    
    // Add user message to chat
    addMessage(message, 'user');
    chatInput.value = '';
    
    // Disable input and show typing indicator
    setInputEnabled(false);
    showTypingIndicator(true);
    
    try {
        const response = await fetch(`${API_BASE_URL}/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: message,
                datasetPath: currentDatasetPath
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to get response from AI');
        }
        
        const data = await response.json();
        
        // Debug: Log the received data
        console.log('Received response data:', data);
        console.log('Chart data:', data.chartData);
        
        // Add bot response to chat
        addMessage(data.response, 'bot', data.chartData);
        
    } catch (error) {
        console.error('Chat error:', error);
        addMessage('Sorry, I encountered an error while processing your request. Please try again.', 'bot');
    } finally {
        setInputEnabled(true);
        showTypingIndicator(false);
        chatInput.focus();
    }
}

function sendSuggestion(suggestion) {
    chatInput.value = suggestion;
    sendMessage();
}

function addMessage(content, sender, chartData = null) {
    console.log('addMessage called with:', { sender, hasChartData: !!chartData, chartData });
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;
    
    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'message-avatar';
    avatarDiv.innerHTML = sender === 'bot' ? '<i class="fas fa-robot"></i>' : '<i class="fas fa-user"></i>';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    // Format the text content
    const formattedContent = formatMessageContent(content);
    contentDiv.innerHTML = formattedContent;
    
    // Add chart if provided
    if (chartData && sender === 'bot') {
        console.log('Creating chart container for:', chartData);
        const chartContainer = createChartContainer(chartData);
        contentDiv.appendChild(chartContainer);
    }
    
    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(contentDiv);
    
    chatMessages.appendChild(messageDiv);
    
    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Render chart after DOM is updated
    if (chartData && sender === 'bot') {
        setTimeout(() => {
            const canvasElement = contentDiv.querySelector('.chart-canvas');
            console.log('Attempting to render chart, canvas found:', !!canvasElement);
            if (canvasElement) {
                renderChart(chartData, canvasElement);
            }
        }, 100);
    }
}

function createChartContainer(chartData) {
    const container = document.createElement('div');
    container.className = 'chart-container';
    
    // Chart type badge
    const badge = document.createElement('div');
    badge.className = 'chart-type-badge';
    badge.textContent = chartData.type.toUpperCase();
    container.appendChild(badge);
    
    // Chart title
    const title = document.createElement('div');
    title.className = 'chart-title';
    title.textContent = chartData.title;
    container.appendChild(title);
    
    // Chart canvas/div
    if (chartData.type === 'heatmap') {
        const chartDiv = document.createElement('div');
        chartDiv.className = 'plotly-chart';
        chartDiv.id = 'chart-' + Date.now();
        container.appendChild(chartDiv);
    } else {
        const canvas = document.createElement('canvas');
        canvas.className = 'chart-canvas';
        container.appendChild(canvas);
    }
    
    // Chart description
    if (chartData.description) {
        const desc = document.createElement('div');
        desc.className = 'chart-description';
        desc.textContent = chartData.description;
        container.appendChild(desc);
    }
    
    return container;
}

function renderChart(chartData, canvasElement) {
    console.log('renderChart called with:', { chartData, hasCanvas: !!canvasElement });
    
    try {
        if (chartData.type === 'heatmap' && chartData.plotlyConfig) {
            // Render Plotly heatmap
            const plotlyDiv = canvasElement.parentElement.querySelector('.plotly-chart');
            console.log('Rendering Plotly heatmap, div found:', !!plotlyDiv);
            if (plotlyDiv) {
                Plotly.newPlot(plotlyDiv, chartData.plotlyConfig.data, chartData.plotlyConfig.layout, {
                    responsive: true,
                    displayModeBar: false
                });
            }
        } else if (chartData.config && canvasElement) {
            // Render Chart.js chart
            console.log('Rendering Chart.js chart with config:', chartData.config);
            new Chart(canvasElement, chartData.config);
        } else {
            console.error('Missing chart config or canvas element:', { 
                hasConfig: !!chartData.config, 
                hasCanvas: !!canvasElement,
                chartType: chartData.type 
            });
        }
    } catch (error) {
        console.error('Error rendering chart:', error);
        // Show error message in chart container
        const container = canvasElement.parentElement;
        container.innerHTML = '<div class="chart-error">❌ Error rendering chart: ' + error.message + '</div>';
    }
}

function formatMessageContent(content) {
    // Convert basic markdown to HTML
    let formatted = content
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');
    
    // Convert lists
    formatted = formatted.replace(/^- (.*$)/gim, '<li>$1</li>');
    if (formatted.includes('<li>')) {
        formatted = formatted.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
    }
    
    return formatted;
}

function renderCharts(container) {
    // Legacy function for any existing chart rendering
    const scripts = container.querySelectorAll('script');
    scripts.forEach(script => {
        try {
            eval(script.textContent);
        } catch (error) {
            console.error('Error executing chart script:', error);
        }
    });
}

function setInputEnabled(enabled) {
    chatInput.disabled = !enabled;
    sendBtn.disabled = !enabled;
}

function showTypingIndicator(show) {
    typingIndicator.style.display = show ? 'flex' : 'none';
}

// Error handling
function showError(message) {
    // Create a temporary error message
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #dc3545;
        color: white;
        padding: 15px 20px;
        border-radius: 10px;
        box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        z-index: 1000;
        animation: slideIn 0.3s ease;
    `;
    errorDiv.textContent = message;
    
    document.body.appendChild(errorDiv);
    
    // Remove after 5 seconds
    setTimeout(() => {
        errorDiv.style.animation = 'slideOut 0.3s ease forwards';
        setTimeout(() => {
            document.body.removeChild(errorDiv);
        }, 300);
    }, 5000);
}

// Add CSS animations for error messages
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);