/**
 * Audio Transcription Chrome Extension - Content Script
 * 
 * This script is injected into web pages to display real-time transcriptions
 * and handle user interactions with the transcription overlay.
 */

// State variables
let transcriptionContainer = null;
let transcriptionSegments = [];
let textSegments = [];

/**
 * Initialize the popup element for displaying wait times or errors
 */
function initPopupElement() {
  if (document.getElementById('popupElement')) {
    return;
  }

  const popupContainer = document.createElement('div');
  popupContainer.id = 'popupElement';
  
  const popupText = document.createElement('span');
  popupText.textContent = 'Default Text';
  popupText.className = 'popupText';
  popupContainer.appendChild(popupText);

  const buttonContainer = document.createElement('div');
  buttonContainer.style.marginTop = '16px';
  
  const closePopupButton = document.createElement('button');
  closePopupButton.textContent = 'Close';
  closePopupButton.addEventListener('click', async () => {
    popupContainer.style.display = 'none';
    await chrome.runtime.sendMessage({ action: 'toggleCaptureButtons', data: false });
  });
  
  buttonContainer.appendChild(closePopupButton);
  popupContainer.appendChild(buttonContainer);

  document.body.appendChild(popupContainer);
}

/**
 * Show the popup with custom text
 * @param {string} customText - The text to display in the popup
 */
function showPopup(customText) {
  const popup = document.getElementById('popupElement');
  if (!popup) {
    initPopupElement();
    showPopup(customText);
    return;
  }
  
  const popupText = popup.querySelector('.popupText');
  if (popup && popupText) {
    popupText.textContent = customText || 'Default Text';
    popup.style.display = 'block';
  }
}

/**
 * Initialize the transcription container element
 */
function initTranscriptionElement() {
  if (document.getElementById('transcription')) {
    return;
  }

  // Create the main container
  transcriptionContainer = document.createElement('div');
  transcriptionContainer.id = "transcription";
  
  // Create a header with controls
  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.style.marginBottom = '8px';
  header.style.opacity = '0.7';
  
  const title = document.createElement('span');
  title.textContent = 'Transcription';
  title.style.fontSize = '14px';
  title.style.fontWeight = 'bold';
  
  const controls = document.createElement('div');
  
  const closeButton = document.createElement('button');
  closeButton.textContent = '×';
  closeButton.style.background = 'none';
  closeButton.style.border = 'none';
  closeButton.style.color = 'white';
  closeButton.style.fontSize = '18px';
  closeButton.style.cursor = 'pointer';
  closeButton.style.marginLeft = '8px';
  closeButton.title = 'Close transcription';
  closeButton.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ action: 'toggleCaptureButtons', data: false });
  });
  
  controls.appendChild(closeButton);
  header.appendChild(title);
  header.appendChild(controls);
  transcriptionContainer.appendChild(header);
  
  // Create content container for transcription text
  const content = document.createElement('div');
  content.id = 'transcription-content';
  
  // Create text elements for displaying transcription
  for (let i = 0; i < 3; i++) {
    const textElement = document.createElement('span');
    textElement.id = `t${i}`;
    content.appendChild(textElement);
  }
  
  // Hidden element for calculations
  const hiddenElement = document.createElement('span');
  hiddenElement.id = 't3';
  hiddenElement.style.position = 'absolute';
  hiddenElement.style.top = '-1000px';
  hiddenElement.style.visibility = 'hidden';
  content.appendChild(hiddenElement);
  
  transcriptionContainer.appendChild(content);
  document.body.appendChild(transcriptionContainer);

  // Make the transcription container draggable
  makeDraggable(transcriptionContainer);
}

/**
 * Make an element draggable
 * @param {HTMLElement} element - The element to make draggable
 */
function makeDraggable(element) {
  let x = 0;
  let y = 0;

  element.addEventListener('mousedown', handleMouseDown);

  function handleMouseDown(e) {
    // Only handle primary mouse button
    if (e.button !== 0) return;
    
    // Don't drag if clicking on a button
    if (e.target.tagName === 'BUTTON') return;
    
    // Get the current mouse position
    x = e.clientX;
    y = e.clientY;

    // Attach the listeners to document
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    // Prevent text selection during drag
    e.preventDefault();
  }

  function handleMouseMove(e) {
    // Calculate how far the mouse has been moved
    const dx = e.clientX - x;
    const dy = e.clientY - y;

    // Update the position of element
    element.style.top = `${element.offsetTop + dy}px`;
    element.style.left = `${element.offsetLeft + dx}px`;

    // Update the mouse position
    x = e.clientX;
    y = e.clientY;
  }

  function handleMouseUp() {
    // Remove the handlers when mouse is released
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }
}

/**
 * Get computed style property of an element
 * @param {string} elementId - The ID of the element
 * @param {string} styleProp - The style property to get
 * @returns {string} The computed style value
 */
function getStyle(elementId, styleProp) {
  const element = document.getElementById(elementId);
  if (!element) return '';
  
  return window.getComputedStyle(element).getPropertyValue(styleProp);
}

/**
 * Split text into lines based on element dimensions
 * @param {HTMLElement} element - The element to measure text in
 * @param {number} lineHeight - The line height in pixels
 * @returns {string[]} Array of text segments split by line
 */
function getLines(element, lineHeight) {
  if (!element) return [];
  
  const divHeight = element.offsetHeight;
  const originalText = element.innerHTML;
  const words = originalText.split(' ');
  const segments = [];
  let currentLines = 1;
  let segment = '';
  let segmentLen = 0;
  
  for (let i = 0; i < words.length; i++) {
    segment += words[i] + ' ';
    element.innerHTML = segment;
    
    if ((element.offsetHeight / lineHeight) > currentLines) {
      const lineSegment = segment.substring(segmentLen, segment.length - 1 - words[i].length - 1);
      segments.push(lineSegment);
      segmentLen += lineSegment.length + 1;
      currentLines++;
    }
  }
  
  const lastSegment = segment.substring(segmentLen, segment.length - 1);
  segments.push(lastSegment);
  
  // Restore original text
  element.innerHTML = originalText;
  
  return segments;
}

/**
 * Remove the transcription element from the page
 */
function removeTranscriptionElement() {
  const transcription = document.getElementById('transcription');
  if (transcription) {
    transcription.remove();
  }
  transcriptionContainer = null;
}

/**
 * Update the transcription display with new text
 * @param {string} text - The transcription text to display
 */
function updateTranscription(text) {
  if (!transcriptionContainer) {
    initTranscriptionElement();
  }
  
  // Clean the text
  text = text.replace(/(\r\n|\n|\r)/gm, " ");
  
  // Calculate line breaks
  const hiddenElement = document.getElementById('t3');
  hiddenElement.innerHTML = text;
  
  const lineHeightStyle = getStyle('t3', 'line-height');
  const lineHeight = parseInt(lineHeightStyle) || 24; // Default to 24px if parsing fails
  
  textSegments = getLines(hiddenElement, lineHeight);
  hiddenElement.innerHTML = '';
  
  // Update visible text elements
  const textElements = [
    document.getElementById('t0'),
    document.getElementById('t1'),
    document.getElementById('t2')
  ];
  
  // Clear all text elements
  textElements.forEach(el => {
    if (el) el.innerHTML = '';
  });
  
  // Display the last 3 segments (or fewer if there are less than 3)
  const segmentsToShow = textSegments.slice(Math.max(0, textSegments.length - 3));
  
  segmentsToShow.forEach((segment, index) => {
    if (textElements[index]) {
      textElements[index].innerHTML = segment;
    }
  });
  
  // Position the text elements
  for (let i = 1; i < 3; i++) {
    const prevElement = textElements[i-1];
    const currentElement = textElements[i];
    
    if (prevElement && currentElement && prevElement.innerHTML) {
      currentElement.style.top = prevElement.offsetHeight + prevElement.offsetTop + 'px';
    }
  }
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const { type, data } = request;
  
  try {
    if (type === "STOP") {
      removeTranscriptionElement();
      sendResponse({data: "STOPPED"});
      return true;
    } 
    
    if (type === "showWaitPopup") {
      initPopupElement();
      showPopup(`Estimated wait time ~ ${Math.round(data)} minutes`);
      sendResponse({data: "popup"});
      return true;
    }
    
    if (type === "transcript") {
      const message = JSON.parse(data);
      if (message.segments) {
        const segments = message.segments;
        if (segments && segments.length > 0) {
          // Combine all segments into a single text
          let text = '';
          for (const segment of segments) {
            if (segment.text) {
              text += segment.text + ' ';
            }
          }
          
          if (text.trim()) {
            updateTranscription(text);
          }
        }
      }
      
      sendResponse({});
      return true;
    }
  } catch (error) {
    console.error('Error processing message:', error);
    showPopup(`Error: ${error.message}`);
    sendResponse({error: error.message});
    return true;
  }
});
