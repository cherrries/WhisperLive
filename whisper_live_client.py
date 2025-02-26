#!/usr/bin/env python3
"""
WhisperLive Client Script

This script demonstrates how to use the WhisperLive client to connect to a WhisperLive server
and transcribe audio either from a microphone or from an audio file.

Usage:
    python whisper_live_client.py [--file AUDIO_FILE] [--host HOST] [--port PORT] [--model MODEL]
                                  [--language LANGUAGE] [--translate] [--no-vad]

Example:
    # Transcribe from microphone
    python whisper_live_client.py --host localhost --port 9091 --model turbo
    
    # Transcribe from an audio file
    python whisper_live_client.py --file sample.mp3 --host localhost --port 9091 --model turbo
"""

import argparse
import os
import time
import threading
import logging
import json
import websocket
from whisper_live.client import TranscriptionClient, Client

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('whisper_live_client')

# Disable websocket debug logging - we only want to log what we receive
websocket.enableTrace(False)

class EnhancedClient(Client):
    """Enhanced client that prints transcription results in real-time."""
    
    def __init__(self, *args, **kwargs):
        self.debug = kwargs.pop('debug', False)
        super().__init__(*args, **kwargs)
        self.connected = False
        self.last_text = ""
        self.packet_count = 0
        self.last_packet_time = time.time()
        
    def on_message(self, ws, message):
        """Override to print transcription results in real-time."""
        if self.debug:
            try:
                # Try to parse as JSON for pretty printing
                parsed = json.loads(message)
                if "segments" in parsed:
                    # Don't log the full segments as they can be large
                    segment_count = len(parsed["segments"])
                    parsed["segments"] = f"[{segment_count} segments]"
                logger.info(f"RECEIVED FROM SERVER: {json.dumps(parsed, indent=2)}")
            except:
                # If not JSON, it's probably binary data
                logger.info(f"RECEIVED FROM SERVER: Binary data, length: {len(message)}")
        
        try:
            message_obj = json.loads(message)
            
            if self.uid != message_obj.get("uid"):
                print("[ERROR]: invalid client uid")
                return

            if "status" in message_obj.keys():
                self.handle_status_messages(message_obj)
                return

            if "message" in message_obj.keys() and message_obj["message"] == "DISCONNECT":
                print("[INFO]: Server disconnected due to overtime.")
                self.recording = False

            if "message" in message_obj.keys() and message_obj["message"] == "SERVER_READY":
                self.last_response_received = time.time()
                self.recording = True
                self.connected = True
                self.server_backend = message_obj["backend"]
                print(f"[SUCCESS]: Connected to server! Running with backend {self.server_backend}")
                return

            if "language" in message_obj.keys():
                self.language = message_obj.get("language")
                lang_prob = message_obj.get("language_prob")
                print(
                    f"[INFO]: Server detected language {self.language} with probability {lang_prob}"
                )
                return

            if "segments" in message_obj.keys():
                segments = message_obj["segments"]
                if segments:
                    # Print only the new text from the latest segment
                    latest_segment = segments[-1]
                    if latest_segment.get("text") and latest_segment.get("text") != self.last_text:
                        self.last_text = latest_segment.get("text")
                        print(f"\n[TRANSCRIPTION]: {self.last_text}")
                self.process_segments(segments)
        except Exception as e:
            logger.error(f"Error processing message: {e}")
    
    def on_error(self, ws, error):
        logger.error(f"WebSocket Error: {error}")
        print(f"[ERROR] WebSocket Error: {error}")
        self.server_error = True
        self.error_message = error

    def on_close(self, ws, close_status_code, close_msg):
        logger.info(f"WebSocket connection closed: {close_status_code}: {close_msg}")
        print(f"[INFO]: WebSocket connection closed: {close_status_code}: {close_msg}")
        self.recording = False
        self.waiting = False
        
    def on_open(self, ws):
        """Callback function called when the WebSocket connection is successfully opened."""
        logger.info("WebSocket connection opened")
        print("[INFO]: WebSocket connection opened")
        
        # Send initial configuration
        config = {
            "uid": self.uid,
            "language": self.language,
            "task": self.task,
            "model": self.model,
            "use_vad": self.use_vad,
            "max_clients": self.max_clients,
            "max_connection_time": self.max_connection_time,
        }
        if self.debug:
            logger.info(f"Sending initial config to server")
        ws.send(json.dumps(config))
        
    def send_packet_to_server(self, message):
        """Send an audio packet to the server using WebSocket."""
        try:
            self.packet_count += 1
            now = time.time()
            
            # Log packet stats every 100 packets or every 10 seconds, but only if debug is enabled
            if self.debug and (self.packet_count % 100 == 0 or now - self.last_packet_time > 10):
                packet_size = len(message) if isinstance(message, bytes) else len(message.encode('utf-8'))
                logger.info(f"Sent audio packet #{self.packet_count}, size: {packet_size} bytes")
                self.last_packet_time = now
                
            self.client_socket.send(message, websocket.ABNF.OPCODE_BINARY)
        except Exception as e:
            logger.error(f"Error sending packet: {e}")
            print(f"[ERROR]: Failed to send audio packet: {e}")

class EnhancedTranscriptionClient(TranscriptionClient):
    """Enhanced transcription client that uses the EnhancedClient."""
    
    def __init__(self, *args, **kwargs):
        # Save the original arguments
        self.host = kwargs.get('host')
        self.port = kwargs.get('port')
        self.lang = kwargs.get('lang')
        self.translate = kwargs.get('translate', False)
        self.model = kwargs.get('model', "small")
        self.use_vad = kwargs.get('use_vad', True)
        self.output_transcription_path = kwargs.get('output_transcription_path', "./output.srt")
        self.log_transcription = kwargs.get('log_transcription', True)
        self.max_clients = kwargs.get('max_clients', 4)
        self.max_connection_time = kwargs.get('max_connection_time', 600)
        self.debug = kwargs.pop('debug', False)  # Pop debug before passing to parent
        
        # Call the parent constructor
        super().__init__(*args, **kwargs)
        
        # Replace the client with our enhanced version
        self.clients[0].close_websocket()  # Close the original client's websocket
        
        # Create our enhanced client
        self.enhanced_client = EnhancedClient(
            self.host, self.port, self.lang, self.translate, self.model, 
            srt_file_path=self.output_transcription_path,
            use_vad=self.use_vad, 
            log_transcription=self.log_transcription, 
            max_clients=self.max_clients,
            max_connection_time=self.max_connection_time,
            debug=self.debug
        )
        
        # Replace the client in the clients list
        self.clients = [self.enhanced_client]
        
    def __call__(self, *args, **kwargs):
        # Start a thread to monitor connection status
        self._start_connection_monitor()
        return super().__call__(*args, **kwargs)
        
    def _start_connection_monitor(self):
        """Start a thread to monitor connection status."""
        def monitor():
            start_time = time.time()
            try:
                while not self.enhanced_client.connected and time.time() - start_time < 30:
                    time.sleep(1)
                    if time.time() - start_time > 10 and not self.enhanced_client.connected:
                        print("\n[WARNING]: Still waiting for server connection... Is the server running?")
                        print(f"[INFO]: Make sure the server is running on ws://{self.host}:{self.port}")
                        break
            except Exception as e:
                logger.error(f"Error in connection monitor: {e}")
                print(f"[ERROR] in connection monitor: {e}")
        
        thread = threading.Thread(target=monitor)
        thread.daemon = True
        thread.start()

def main():
    parser = argparse.ArgumentParser(description="WhisperLive Client")
    parser.add_argument("--file", type=str, help="Path to audio file to transcribe (if not provided, will use microphone)")
    parser.add_argument("--host", type=str, default="localhost", help="Server hostname or IP address")
    parser.add_argument("--port", type=int, default=9091, help="Server port")
    parser.add_argument("--model", type=str, default="turbo", help="Whisper model to use")
    parser.add_argument("--language", type=str, help="Language code (e.g., 'en', 'fr', 'de')")
    parser.add_argument("--translate", action="store_true", help="Translate to English")
    parser.add_argument("--no-vad", action="store_true", help="Disable Voice Activity Detection")
    parser.add_argument("--output-srt", type=str, default="output.srt", help="Output SRT file path")
    parser.add_argument("--save-recording", action="store_true", help="Save the recording to a WAV file")
    parser.add_argument("--output-wav", type=str, default="output_recording.wav", help="Output WAV file path")
    parser.add_argument("--debug", action="store_true", help="Enable detailed server response logging")
    
    args = parser.parse_args()
    
    if args.debug:
        logger.setLevel(logging.DEBUG)
    
    print(f"[INFO]: Connecting to WhisperLive server at {args.host}:{args.port}...")
    print(f"[INFO]: Using model: {args.model}")
    if args.language:
        print(f"[INFO]: Language: {args.language}")
    if args.translate:
        print(f"[INFO]: Mode: Translation to English")
    else:
        print(f"[INFO]: Mode: Transcription")
    
    # Create the enhanced transcription client
    client = EnhancedTranscriptionClient(
        host=args.host,
        port=args.port,
        lang=args.language,
        translate=args.translate,
        model=args.model,
        use_vad=not args.no_vad,
        save_output_recording=args.save_recording,
        output_recording_filename=args.output_wav,
        output_transcription_path=args.output_srt,
        log_transcription=True,
        debug=args.debug
    )
    
    try:
        # Start transcription
        if args.file:
            if not os.path.exists(args.file):
                print(f"[ERROR]: Audio file '{args.file}' not found.")
                return
            print(f"[INFO]: Transcribing audio file: {args.file}")
            client(audio=args.file)
        else:
            print("[INFO]: Recording from microphone. Press Ctrl+C to stop.")
            print("[INFO]: Speak clearly into your microphone...")
            print("[INFO]: Waiting for transcription to appear below...")
            client()
    except KeyboardInterrupt:
        print("\n[INFO]: Transcription stopped by user.")
    except Exception as e:
        logger.exception("Error in main function")
        print(f"[ERROR]: {e}")

if __name__ == "__main__":
    main() 