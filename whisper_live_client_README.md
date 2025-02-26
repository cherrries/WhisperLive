# WhisperLive Client

This is a simple client script for connecting to a WhisperLive server and transcribing audio in real-time.

## Prerequisites

- Python 3.10 or higher
- WhisperLive package installed
- PyAudio (for microphone recording)
- A running WhisperLive server

## Installation

1. Make sure you have the WhisperLive package installed:
   ```
   pip install -e .
   ```

2. Make sure the WhisperLive server is running:
   ```
   # Using Docker
   docker run -it -p 9091:9090 whisperlive-turbo-cpu:latest
   
   # Or running locally
   python run_server.py
   ```

## Usage

The script supports transcribing audio from either a microphone or an audio file.

### Basic Usage

```bash
# Transcribe from microphone
python whisper_live_client.py --host localhost --port 9091

# Transcribe from an audio file
python whisper_live_client.py --file path/to/audio.mp3 --host localhost --port 9091
```

### Command Line Arguments

- `--file`: Path to an audio file to transcribe (if not provided, will use microphone)
- `--host`: Server hostname or IP address (default: localhost)
- `--port`: Server port (default: 9091)
- `--model`: Whisper model to use (default: turbo)
- `--language`: Language code (e.g., 'en', 'fr', 'de')
- `--translate`: Translate to English
- `--no-vad`: Disable Voice Activity Detection
- `--output-srt`: Output SRT file path (default: output.srt)
- `--save-recording`: Save the recording to a WAV file
- `--output-wav`: Output WAV file path (default: output_recording.wav)

### Examples

```bash
# Transcribe from microphone using the turbo model
python whisper_live_client.py --host localhost --port 9091 --model turbo

# Transcribe an audio file in French
python whisper_live_client.py --file audio.mp3 --language fr

# Translate an audio file to English
python whisper_live_client.py --file audio.mp3 --translate

# Save the transcription and recording
python whisper_live_client.py --save-recording --output-srt my_transcript.srt --output-wav my_recording.wav
```

## Output

The script will output the transcription in real-time to the console and save it to an SRT file (default: output.srt).

If the `--save-recording` flag is used, the audio will also be saved to a WAV file (default: output_recording.wav).

## Stopping the Transcription

Press `Ctrl+C` to stop the transcription process. 