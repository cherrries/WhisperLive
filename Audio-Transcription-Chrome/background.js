/**
 * Audio Transcription Pro - Background Script
 * 
 * This script handles the background processes for the extension, including
 * tab capture, communication between components, and keyboard shortcuts.
 */

/**
 * State management for the extension
 */
const state = {
  currentTabId: null,
  optionTabId: null,
  isCapturing: false
};

/**
 * Removes a tab with the specified tab ID in Google Chrome.
 * @param {number} tabId - The ID of the tab to be removed.
 * @returns {Promise<void>} A promise that resolves when the tab is successfully removed or fails to remove.
 */
async function removeChromeTab(tabId) {
  if (!tabId) return;
  
  try {
    await chrome.tabs.remove(tabId);
  } catch (error) {
    console.error(`Error removing tab ${tabId}:`, error);
  }
}

/**
 * Executes a script file in a specific tab in Google Chrome.
 * @param {number} tabId - The ID of the tab where the script should be executed.
 * @param {string} file - The file path or URL of the script to be executed.
 * @returns {Promise<void>} A promise that resolves when the script is successfully executed.
 */
async function executeScriptInTab(tabId, file) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [file]
    });
  } catch (error) {
    console.error(`Error executing script ${file} in tab ${tabId}:`, error);
    throw error;
  }
}

/**
 * Opens the options page of the Chrome extension in a new pinned tab.
 * @returns {Promise<chrome.tabs.Tab>} A promise that resolves with the created tab object.
 */
async function openExtensionOptions() {
  try {
    return await chrome.tabs.create({
      pinned: true,
      active: false,
      url: `chrome-extension://${chrome.runtime.id}/options.html`
    });
  } catch (error) {
    console.error('Error opening options page:', error);
    throw error;
  }
}

/**
 * Retrieves the value associated with the specified key from the local storage in Google Chrome.
 * @param {string} key - The key of the value to retrieve from the local storage.
 * @returns {Promise<any>} A promise that resolves with the retrieved value from the local storage.
 */
function getLocalStorageValue(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => {
      resolve(result[key]);
    });
  });
}

/**
 * Sends a message to a specific tab in Google Chrome.
 * @param {number} tabId - The ID of the tab to send the message to.
 * @param {any} data - The data to be sent as the message.
 * @returns {Promise<any>} A promise that resolves with the response from the tab.
 */
async function sendMessageToTab(tabId, data) {
  if (!tabId) {
    throw new Error('Invalid tab ID');
  }
  
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, data, (response) => {
      if (chrome.runtime.lastError) {
        console.error(`Error sending message to tab ${tabId}:`, chrome.runtime.lastError);
        resolve(null);
        return;
      }
      resolve(response);
    });
  });
}

/**
 * Delays the execution for a specified duration.
 * @param {number} ms - The duration to sleep in milliseconds (default: 0).
 * @returns {Promise<void>} A promise that resolves after the specified duration.
 */
function delay(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retrieves the tab object with the specified tabId.
 * @param {number} tabId - The ID of the tab to retrieve.
 * @returns {Promise<chrome.tabs.Tab>} - A Promise that resolves to the tab object.
 */
async function getTab(tabId) {
  try {
    return await chrome.tabs.get(tabId);
  } catch (error) {
    console.error(`Error getting tab ${tabId}:`, error);
    throw error;
  }
}

/**
 * Starts the capture process for the specified tab.
 * @param {Object} options - The options for starting capture.
 * @returns {Promise<void>} - A Promise that resolves when the capture process is started successfully.
 */
async function startCapture(options) {
  try {
    const { tabId } = options;
    
    // Close any existing options tab
    if (state.optionTabId) {
      await removeChromeTab(state.optionTabId);
      state.optionTabId = null;
    }

    // Get the current tab and check if it has audio
    const currentTab = await getTab(tabId);
    
    if (!currentTab.audible) {
      console.warn("No audio detected in the current tab");
      chrome.runtime.sendMessage({ 
        action: "showNotification", 
        message: "No audio detected in the current tab. Make sure audio is playing."
      });
      return;
    }
    
    // Save the current tab ID
    state.currentTabId = currentTab.id;
    
    // Inject the content script
    await executeScriptInTab(currentTab.id, "content.js");
    await delay(500);

    // Open the options page for handling the WebSocket connection
    const optionTab = await openExtensionOptions();
    state.optionTabId = optionTab.id;
    await delay(500);

    // Send the start capture message to the options page
    await sendMessageToTab(optionTab.id, {
      type: "start_capture",
      data: { 
        currentTabId: currentTab.id, 
        host: options.host, 
        port: options.port, 
        language: options.language,
        task: options.task,
        modelSize: options.modelSize,
        useVad: options.useVad,
      },
    });
    
    // Update state
    state.isCapturing = true;
    
  } catch (error) {
    console.error("Error starting capture:", error);
    chrome.runtime.sendMessage({ 
      action: "showNotification", 
      message: `Error starting capture: ${error.message}`
    });
    
    // Reset state on error
    state.isCapturing = false;
  }
}

/**
 * Stops the capture process and performs cleanup.
 * @returns {Promise<void>} - A Promise that resolves when the capture process is stopped successfully.
 */
async function stopCapture() {
  try {
    if (state.optionTabId) {
      // Send stop message to content script
      if (state.currentTabId) {
        await sendMessageToTab(state.currentTabId, {
          type: "STOP",
          data: { currentTabId: state.currentTabId },
        });
      }
      
      // Close the options tab
      await removeChromeTab(state.optionTabId);
      state.optionTabId = null;
    }
    
    // Reset state
    state.isCapturing = false;
    
  } catch (error) {
    console.error("Error stopping capture:", error);
  }
}

/**
 * Gets the active tab in the current window
 * @returns {Promise<chrome.tabs.Tab>} The active tab
 */
async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

/**
 * Handle keyboard shortcuts
 * @param {string} command - The command that was triggered
 */
async function handleCommand(command) {
  try {
    if (command === "start-transcription" && !state.isCapturing) {
      // Get settings from storage
      const settings = await chrome.storage.local.get([
        "useServerState", 
        "useVadState",
        "selectedLanguage",
        "selectedTask",
        "selectedModelSize"
      ]);
      
      // Get the active tab
      const activeTab = await getActiveTab();
      
      if (!activeTab) {
        console.error("No active tab found");
        return;
      }
      
      // Configure server settings
      let host = "localhost";
      let port = "9090";
      const useCollaboraServer = settings.useServerState;
      
      if (useCollaboraServer) {
        host = "transcription.kurg.org";
        port = "7090";
      }
      
      // Start capture with the saved settings
      await startCapture({
        tabId: activeTab.id,
        host,
        port,
        language: settings.selectedLanguage,
        task: settings.selectedTask || "transcribe",
        modelSize: settings.selectedModelSize || "small",
        useVad: settings.useVadState
      });
      
      // Update UI state
      chrome.storage.local.set({ capturingState: { isCapturing: true } });
      
    } else if (command === "stop-transcription" && state.isCapturing) {
      await stopCapture();
      
      // Update UI state
      chrome.storage.local.set({ capturingState: { isCapturing: false } });
    }
  } catch (error) {
    console.error(`Error handling command ${command}:`, error);
  }
}

// Listen for commands (keyboard shortcuts)
chrome.commands.onCommand.addListener(handleCommand);

// Listen for messages from the popup and content scripts
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  // Send an immediate response to avoid "The message port closed before a response was received" error
  sendResponse({});
  
  try {
    if (message.action === "startCapture") {
      await startCapture(message);
    } else if (message.action === "stopCapture") {
      await stopCapture();
    } else if (message.action === "updateSelectedLanguage") {
      const detectedLanguage = message.detectedLanguage;
      chrome.runtime.sendMessage({ action: "updateSelectedLanguage", detectedLanguage });
      chrome.storage.local.set({ selectedLanguage: detectedLanguage });
    } else if (message.action === "toggleCaptureButtons") {
      chrome.runtime.sendMessage({ action: "toggleCaptureButtons", data: false });
      chrome.storage.local.set({ capturingState: { isCapturing: false } });
      await stopCapture();
    }
  } catch (error) {
    console.error(`Error handling message ${message.action}:`, error);
  }
  
  return true;
});


