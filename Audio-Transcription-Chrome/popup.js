// Wait for the DOM content to be fully loaded
document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const elements = {
    startButton: document.getElementById("startCapture"),
    stopButton: document.getElementById("stopCapture"),
    useServerCheckbox: document.getElementById("useServerCheckbox"),
    useVadCheckbox: document.getElementById("useVadCheckbox"),
    languageDropdown: document.getElementById('languageDropdown'),
    taskDropdown: document.getElementById('taskDropdown'),
    modelSizeDropdown: document.getElementById('modelSizeDropdown')
  };

  // State
  const state = {
    selectedLanguage: null,
    selectedTask: elements.taskDropdown.value,
    selectedModelSize: elements.modelSizeDropdown.value,
    isCapturing: false
  };

  // Initialize the UI
  initializeUI();

  /**
   * Initialize the UI by setting up event listeners and loading saved state
   */
  function initializeUI() {
    // Add click event listeners to the buttons
    elements.startButton.addEventListener("click", startCapture);
    elements.stopButton.addEventListener("click", stopCapture);
    
    // Add change event listeners to form elements
    elements.useServerCheckbox.addEventListener("change", saveCheckboxState);
    elements.useVadCheckbox.addEventListener("change", saveCheckboxState);
    elements.languageDropdown.addEventListener('change', handleLanguageChange);
    elements.taskDropdown.addEventListener('change', handleTaskChange);
    elements.modelSizeDropdown.addEventListener('change', handleModelSizeChange);
    
    // Load saved state from storage
    loadSavedState();
    
    // Set up message listeners
    setupMessageListeners();
  }

  /**
   * Load saved state from Chrome storage
   */
  async function loadSavedState() {
    try {
      const { 
        capturingState, 
        useServerState, 
        useVadState,
        selectedLanguage,
        selectedTask,
        selectedModelSize
      } = await chrome.storage.local.get([
        "capturingState", 
        "useServerState", 
        "useVadState",
        "selectedLanguage",
        "selectedTask",
        "selectedModelSize"
      ]);
      
      // Update UI based on saved state
      if (capturingState && capturingState.isCapturing) {
        toggleCaptureButtons(true);
        state.isCapturing = true;
      } else {
        toggleCaptureButtons(false);
        state.isCapturing = false;
      }
      
      if (useServerState !== undefined) {
        elements.useServerCheckbox.checked = useServerState;
      }
      
      if (useVadState !== undefined) {
        elements.useVadCheckbox.checked = useVadState;
      }
      
      if (selectedLanguage !== undefined) {
        elements.languageDropdown.value = selectedLanguage;
        state.selectedLanguage = selectedLanguage;
      }
      
      if (selectedTask !== undefined) {
        elements.taskDropdown.value = selectedTask;
        state.selectedTask = selectedTask;
      }
      
      if (selectedModelSize !== undefined) {
        elements.modelSizeDropdown.value = selectedModelSize;
        state.selectedModelSize = selectedModelSize;
      }
    } catch (error) {
      console.error("Error loading saved state:", error);
      // Continue with default values if there's an error
    }
  }

  /**
   * Set up message listeners for communication with background script
   */
  function setupMessageListeners() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "updateSelectedLanguage") {
        const detectedLanguage = request.detectedLanguage;
        
        if (detectedLanguage) {
          elements.languageDropdown.value = detectedLanguage;
          chrome.storage.local.set({ selectedLanguage: detectedLanguage });
          state.selectedLanguage = detectedLanguage;
        }
      } else if (request.action === "toggleCaptureButtons") {
        toggleCaptureButtons(false);
        chrome.storage.local.set({ capturingState: { isCapturing: false } });
        state.isCapturing = false;
      }
    });
  }

  /**
   * Handle the start capture button click event
   */
  async function startCapture() {
    // Ignore click if the button is disabled
    if (elements.startButton.disabled) {
      return;
    }

    try {
      // Get the current active tab
      const currentTab = await getCurrentTab();
      
      if (!currentTab) {
        showError("Could not find active tab");
        return;
      }

      // Configure server settings
      let host = "localhost";
      let port = "9090";
      const useCollaboraServer = elements.useServerCheckbox.checked;
      
      if (useCollaboraServer) {
        host = "transcription.kurg.org";
        port = "7090";
      }

      // Send a message to the background script to start capturing
      chrome.runtime.sendMessage(
        { 
          action: "startCapture", 
          tabId: currentTab.id,
          host,
          port,
          language: state.selectedLanguage,
          task: state.selectedTask,
          modelSize: state.selectedModelSize,
          useVad: elements.useVadCheckbox.checked,
        }, 
        () => {
          if (chrome.runtime.lastError) {
            showError(`Error starting capture: ${chrome.runtime.lastError.message}`);
            return;
          }
          
          // Update capturing state in storage and toggle the buttons
          chrome.storage.local.set({ capturingState: { isCapturing: true } }, () => {
            toggleCaptureButtons(true);
            state.isCapturing = true;
          });
        }
      );
    } catch (error) {
      showError(`Error starting capture: ${error.message}`);
    }
  }

  /**
   * Handle the stop capture button click event
   */
  function stopCapture() {
    // Ignore click if the button is disabled
    if (elements.stopButton.disabled) {
      return;
    }

    // Send a message to the background script to stop capturing
    chrome.runtime.sendMessage({ action: "stopCapture" }, () => {
      if (chrome.runtime.lastError) {
        showError(`Error stopping capture: ${chrome.runtime.lastError.message}`);
        return;
      }
      
      // Update capturing state in storage and toggle the buttons
      chrome.storage.local.set({ capturingState: { isCapturing: false } }, () => {
        toggleCaptureButtons(false);
        state.isCapturing = false;
      });
    });
  }

  /**
   * Get the current active tab
   * @returns {Promise<chrome.tabs.Tab>} A promise that resolves with the current active tab
   */
  async function getCurrentTab() {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError) {
          console.error("Error getting current tab:", chrome.runtime.lastError);
          resolve(null);
          return;
        }
        
        resolve(tabs[0]);
      });
    });
  }

  /**
   * Toggle the capture buttons based on the capturing state
   * @param {boolean} isCapturing - Whether audio is currently being captured
   */
  function toggleCaptureButtons(isCapturing) {
    elements.startButton.disabled = isCapturing;
    elements.stopButton.disabled = !isCapturing;
    elements.useServerCheckbox.disabled = isCapturing;
    elements.useVadCheckbox.disabled = isCapturing;
    elements.modelSizeDropdown.disabled = isCapturing;
    elements.languageDropdown.disabled = isCapturing;
    elements.taskDropdown.disabled = isCapturing; 
    
    elements.startButton.classList.toggle("disabled", isCapturing);
    elements.stopButton.classList.toggle("disabled", !isCapturing);
  }

  /**
   * Save checkbox state when it's toggled
   * @param {Event} event - The change event
   */
  function saveCheckboxState(event) {
    const { id, checked } = event.target;
    
    if (id === "useServerCheckbox") {
      chrome.storage.local.set({ useServerState: checked });
    } else if (id === "useVadCheckbox") {
      chrome.storage.local.set({ useVadState: checked });
    }
  }

  /**
   * Handle language dropdown change
   */
  function handleLanguageChange() {
    if (elements.languageDropdown.value === "") {
      state.selectedLanguage = null;
    } else {
      state.selectedLanguage = elements.languageDropdown.value;
    }
    chrome.storage.local.set({ selectedLanguage: state.selectedLanguage });
  }

  /**
   * Handle task dropdown change
   */
  function handleTaskChange() {
    state.selectedTask = elements.taskDropdown.value;
    chrome.storage.local.set({ selectedTask: state.selectedTask });
  }

  /**
   * Handle model size dropdown change
   */
  function handleModelSizeChange() {
    state.selectedModelSize = elements.modelSizeDropdown.value;
    chrome.storage.local.set({ selectedModelSize: state.selectedModelSize });
  }

  /**
   * Show an error message to the user
   * @param {string} message - The error message to display
   */
  function showError(message) {
    console.error(message);
    // You could implement a toast notification or other UI feedback here
  }
});
