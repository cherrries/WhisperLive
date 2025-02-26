/**
 * Audio Transcription Pro - Options Page Script
 * 
 * This script handles the WebSocket connection to the transcription server
 * and processes the audio stream from the captured tab.
 */

// DOM Elements
let connectionStatus;
let serverMessages;
let audioStatus;

// Initialize when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
  // Get DOM elements
  connectionStatus = document.getElementById('connection-status');
  serverMessages = document.getElementById('server-messages');
  audioStatus = document.getElementById('audio-status');
  
  // Set initial status
  updateStatus('connection', 'Waiting for capture to start...');
});

/**
 * Update the status display for a specific component
 * @param {string} type - The type of status to update ('connection', 'server', or 'audio')
 * @param {string} message - The status message to display
 * @param {boolean} isError - Whether this is an error message
 */
function updateStatus(type, message, isError = false) {
  const element = type === 'connection' ? connectionStatus : 
                  type === 'server' ? serverMessages : 
                  type === 'audio' ? audioStatus : null;
  
  if (!element) return;
  
  if (isError) {
    element.style.color = 'var(--error-color)';
    console.error(message);
  } else {
    element.style.color = '';
  }
  
  if (type === 'server') {
    // For server messages, append rather than replace
    const timestamp = new Date().toLocaleTimeString();
    element.innerHTML += `[${timestamp}] ${message}\n`;
    element.scrollTop = element.scrollHeight;
  } else {
    element.textContent = message;
  }
}

/**
 * Captures audio from the active tab in Google Chrome.
 * @returns {Promise<MediaStream>} A promise that resolves with the captured audio stream.
 */
async function captureTabAudio() {
  try {
    updateStatus('connection', 'Requesting tab audio capture...');
    
    const stream = await chrome.tabCapture.capture({
      audio: true,
      video: false
    });
    
    if (!stream) {
      throw new Error('Failed to capture tab audio. Make sure the tab has audio playing.');
    }
    
    updateStatus('connection', 'Tab audio capture successful');
    updateStatus('audio', 'Audio stream active');
    
    return stream;
  } catch (error) {
    updateStatus('connection', `Tab capture error: ${error.message}`, true);
    updateStatus('audio', 'Audio capture failed', true);
    throw error;
  }
}

/**
 * Sends a message to a specific tab in Google Chrome.
 * @param {number} tabId - The ID of the tab to send the message to.
 * @param {any} data - The data to be sent as the message.
 * @returns {Promise<any>} A promise that resolves with the response from the tab.
 */
async function sendMessageToTab(tabId, data) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, data, (response) => {
      if (chrome.runtime.lastError) {
        console.error(`Error sending message to tab: ${chrome.runtime.lastError.message}`);
        resolve(null);
        return;
      }
      resolve(response);
    });
  });
}

/**
 * Resamples the audio data to a target sample rate of 16kHz.
 * @param {Array|ArrayBuffer|TypedArray} audioData - The input audio data.
 * @param {number} origSampleRate - The original sample rate of the audio data.
 * @returns {Float32Array} The resampled audio data at 16kHz.
 */
function resampleTo16kHZ(audioData, origSampleRate = 44100) {
  // Convert the audio data to a Float32Array
  const data = new Float32Array(audioData);

  // Calculate the desired length of the resampled data
  const targetSampleRate = 16000;
  const targetLength = Math.round(data.length * (targetSampleRate / origSampleRate));

  // Create a new Float32Array for the resampled data
  const resampledData = new Float32Array(targetLength);

  // Calculate the spring factor and initialize the first and last values
  const springFactor = (data.length - 1) / (targetLength - 1);
  resampledData[0] = data[0];
  resampledData[targetLength - 1] = data[data.length - 1];

  // Resample the audio data
  for (let i = 1; i < targetLength - 1; i++) {
    const index = i * springFactor;
    const leftIndex = Math.floor(index);
    const rightIndex = Math.ceil(index);
    const fraction = index - leftIndex;
    resampledData[i] = data[leftIndex] + (data[rightIndex] - data[leftIndex]) * fraction;
  }

  return resampledData;
}

/**
 * Generates a UUID for client identification
 * @returns {string} A UUID string
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Starts recording audio from the captured tab.
 * @param {Object} options - The options object containing configuration parameters.
 */
async function startRecord(options) {
  try {
    // Capture the tab audio
    const stream = await captureTabAudio();
    
    if (!stream) {
      updateStatus('connection', 'Failed to capture tab audio', true);
      chrome.runtime.sendMessage({ action: "toggleCaptureButtons", data: false });
      return;
    }
    
    // Set up stream inactive handler
    stream.oninactive = () => {
      updateStatus('connection', 'Audio stream ended', true);
      updateStatus('audio', 'Audio stream inactive', true);
      window.close();
    };
    
    // Generate a unique client ID
    const uuid = generateUUID();
    
    // Connect to the WebSocket server
    updateStatus('connection', `Connecting to server: ws://${options.host}:${options.port}/...`);
    
    const socket = new WebSocket(`ws://${options.host}:${options.port}/`);
    let isServerReady = false;
    let language = options.language;
    
    // WebSocket event handlers
    socket.onopen = function(e) {
      updateStatus('connection', 'WebSocket connection established');
      updateStatus('server', 'Connected to server');
      
      // Send initial configuration to the server
      const config = {
        uid: uuid,
        language: options.language,
        task: options.task,
        model: options.modelSize,
        use_vad: options.useVad
      };
      
      socket.send(JSON.stringify(config));
      updateStatus('server', `Sent configuration: ${JSON.stringify(config)}`);
    };
    
    socket.onclose = function(e) {
      updateStatus('connection', `WebSocket connection closed: ${e.code} ${e.reason}`, true);
      updateStatus('server', `Disconnected: ${e.reason || 'Connection closed'}`, true);
      chrome.runtime.sendMessage({ action: "toggleCaptureButtons", data: false });
    };
    
    socket.onerror = function(error) {
      updateStatus('connection', 'WebSocket error', true);
      updateStatus('server', 'Connection error', true);
      chrome.runtime.sendMessage({ action: "toggleCaptureButtons", data: false });
    };

    socket.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Check if the message is for this client
        if (data.uid !== uuid) {
          updateStatus('server', 'Received message for different client, ignoring', true);
          return;
        }
        
        // Handle wait status
        if (data.status === "WAIT") {
          updateStatus('server', `Server busy: ${data.message}`);
          await sendMessageToTab(options.currentTabId, {
            type: "showWaitPopup",
            data: data.message,
          });
          chrome.runtime.sendMessage({ action: "toggleCaptureButtons", data: false });
          chrome.runtime.sendMessage({ action: "stopCapture" });
          return;
        }
        
        // Handle server ready message
        if (!isServerReady && data.message === "SERVER_READY") {
          isServerReady = true;
          updateStatus('connection', 'Server ready for transcription');
          updateStatus('server', `Server ready with backend: ${data.backend}`);
          return;
        }
        
        // Handle language detection
        if (language === null && data.language) {
          language = data.language;
          updateStatus('server', `Detected language: ${language} (probability: ${data.language_prob})`);
          
          // Update the UI with detected language
          chrome.runtime.sendMessage({
            action: "updateSelectedLanguage",
            detectedLanguage: language,
          });
          return;
        }
        
        // Handle disconnect message
        if (data.message === "DISCONNECT") {
          updateStatus('server', 'Server disconnected due to overtime');
          chrome.runtime.sendMessage({ action: "toggleCaptureButtons", data: false });
          return;
        }
        
        // Handle transcription segments
        if (data.segments) {
          const segmentCount = data.segments.length;
          if (segmentCount > 0) {
            const latestText = data.segments[segmentCount - 1].text;
            updateStatus('server', `Transcription: ${latestText}`);
          }
          
          // Send transcription to content script
          await sendMessageToTab(options.currentTabId, {
            type: "transcript",
            data: event.data,
          });
        }
      } catch (error) {
        updateStatus('server', `Error processing message: ${error.message}`, true);
      }
    };
    
    // Set up audio processing
    const audioContext = new AudioContext();
    const mediaStreamSource = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    
    // Audio processing callback
    processor.onaudioprocess = async (event) => {
      if (!audioContext || !isServerReady) return;
      
      try {
        const inputData = event.inputBuffer.getChannelData(0);
        
        // Check if there's actual audio data (not just silence)
        const hasAudio = inputData.some(sample => Math.abs(sample) > 0.01);
        
        if (hasAudio) {
          updateStatus('audio', 'Processing audio...');
          
          // Resample audio to 16kHz for the server
          const audioData16kHz = resampleTo16kHZ(inputData, audioContext.sampleRate);
          
          // Send the audio data to the server
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(audioData16kHz);
          }
        } else {
          updateStatus('audio', 'Silence detected, waiting for audio...');
        }
      } catch (error) {
        updateStatus('audio', `Error processing audio: ${error.message}`, true);
      }
    };
    
    // Connect the audio nodes
    mediaStreamSource.connect(processor);
    processor.connect(audioContext.destination);
    mediaStreamSource.connect(audioContext.destination);
    
    updateStatus('connection', 'Audio processing started');
    updateStatus('audio', 'Listening for audio...');
    
  } catch (error) {
    updateStatus('connection', `Error: ${error.message}`, true);
    chrome.runtime.sendMessage({ action: "toggleCaptureButtons", data: false });
  }
}

// Listen for messages from the extension's background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const { type, data } = request;

  if (type === "start_capture") {
    startRecord(data);
  }

  sendResponse({});
  return true;
});
