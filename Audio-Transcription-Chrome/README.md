# Audio Transcription Pro

Audio Transcription Pro is a Chrome extension that captures audio from any tab and provides real-time transcription using OpenAI Whisper. The extension offers a modern, user-friendly interface with support for multiple languages, voice activity detection, and translation capabilities.

![Audio Transcription Pro Screenshot](https://github.com/collabora/whisper-live/raw/main/docs/images/extension-screenshot.png)

## Features

- **Real-time Transcription**: Transcribe audio in real-time using OpenAI Whisper models
- **Multiple Languages**: Support for 90+ languages with automatic language detection
- **Voice Activity Detection**: Option to only send audio to the server when speech is detected
- **Translation**: Translate speech directly to English from any supported language
- **Customizable Models**: Choose from various Whisper model sizes based on your needs
- **Modern UI**: Clean, responsive interface with dark mode support
- **Draggable Overlay**: Position the transcription overlay anywhere on the page
- **Keyboard Shortcuts**: Control the extension with convenient keyboard shortcuts

## Installation

### From Chrome Web Store (Recommended)
1. Visit the [Chrome Web Store](https://chrome.google.com/webstore/category/extensions) (coming soon)
2. Search for "Audio Transcription Pro"
3. Click "Add to Chrome"

### Manual Installation (Developer Mode)
1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions`
3. Enable "Developer mode" using the toggle in the top-right corner
4. Click "Load unpacked" and select the `Audio-Transcription-Chrome` folder
5. The extension should now be installed and visible in your extensions list

## Usage

1. Click on the Audio Transcription Pro icon in your browser toolbar
2. Configure your preferences:
   - Choose whether to use the Collabora Whisper-Live server
   - Enable/disable Voice Activity Detection
   - Select a language or use automatic detection
   - Choose between transcription or translation
   - Select the Whisper model size
3. Click "Start Capture" to begin transcribing audio from the current tab
4. A transcription overlay will appear on the page showing the transcribed text
5. Drag the overlay to reposition it as needed
6. Click "Stop Capture" to end the transcription session

### Keyboard Shortcuts
- Start transcription: `Ctrl+Shift+T` (Windows/Linux) or `Command+Shift+T` (Mac)
- Stop transcription: `Ctrl+Shift+X` (Windows/Linux) or `Command+Shift+X` (Mac)

## Server Configuration

The extension requires a running Whisper transcription server. You can either:

1. **Use the Collabora Demo Server**: Enable the "Use Collabora Whisper-Live Server" option
2. **Run Your Own Server**: Follow the [Whisper Live server setup instructions](https://github.com/collabora/whisper-live)

When running your own server, the default configuration is:
- Host: `localhost`
- Port: `9090`

## Technical Details

### Architecture
The extension uses a multi-component architecture:
- **Popup UI**: User interface for configuration and control
- **Background Script**: Manages tab capture and communication with the server
- **Content Script**: Displays the transcription overlay on the web page
- **Options Page**: Handles the WebSocket connection to the transcription server

### Performance Optimizations
- Voice Activity Detection to reduce server load
- Audio resampling to 16kHz before sending to the server
- Efficient text rendering for smooth display of transcriptions

## Privacy and Security

- Audio is processed in real-time and is not stored permanently
- When using Voice Activity Detection, audio is only sent to the server when speech is detected
- All communication with the server is done via WebSockets
- The extension only requires permissions for the specific functionality it provides

## Limitations

- Requires an internet connection for server communication
- Transcription accuracy depends on audio quality and the selected model
- The extension may consume additional system resources while running
- Some websites with strict Content Security Policies may block the transcription overlay

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [OpenAI Whisper](https://github.com/openai/whisper) for the speech recognition models
- [Faster Whisper](https://github.com/guillaumekln/faster-whisper) for the optimized implementation
- [Whisper Live](https://github.com/collabora/whisper-live) for the real-time transcription server
- All contributors who have helped improve this extension

