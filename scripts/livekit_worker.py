"""
VoiceTrace — Phase 1: LiveKit Headless Audio Processing Worker

This script replaces the raw WebRTC + Twilio mesh with an enterprise LiveKit SFU.
Instead of the React client sending audio directly to the Python backend via WebSocket,
both the React client and the SIP Gateway connect to a LiveKit Room.

This Python headless worker joins the same LiveKit room, subscribes to all audio tracks
in real-time, chunks the PCM data, and feeds it into the AASIST-L edge model.
"""

import asyncio
import os
import signal
from livekit import api, rtc

# In production, these come from environment variables.
LIVEKIT_URL = os.getenv("LIVEKIT_URL", "ws://localhost:7880")
LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY", "devkey")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET", "secret")
ROOM_NAME = "voicetrace-secure-room"

async def main():
    print(f"Connecting to LiveKit SFU at {LIVEKIT_URL}...")
    
    # 1. Initialize the LiveKit Room connection
    room = rtc.Room()
    
    # Generate an access token for the headless worker
    token = api.AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET) \
        .with_identity("voicetrace-detector-worker") \
        .with_name("VoiceTrace Sentinel") \
        .with_grants(api.VideoGrants(
            room_join=True,
            room=ROOM_NAME,
            can_subscribe=True,
            hidden=True, # The worker shouldn't show up in the UI as a participant
        )) \
        .to_jwt()

    @room.on("track_subscribed")
    def on_track_subscribed(track: rtc.Track, publication: rtc.RemoteTrackPublication, participant: rtc.RemoteParticipant):
        print(f"Subscribed to {participant.identity}'s audio track.")
        if track.kind == rtc.TrackKind.KIND_AUDIO:
            # 2. Attach an AudioStream to the incoming WebRTC track
            audio_stream = rtc.AudioStream(track)
            asyncio.create_task(process_audio_stream(audio_stream, participant.identity))

    # Connect to the room
    await room.connect(LIVEKIT_URL, token)
    print(f"Connected to room {room.name}. Waiting for tracks...")

    # Wait until interrupted
    stop_event = asyncio.Event()
    loop = asyncio.get_event_loop()
    loop.add_signal_handler(signal.SIGINT, stop_event.set)
    loop.add_signal_handler(signal.SIGTERM, stop_event.set)
    
    await stop_event.wait()
    print("Disconnecting from LiveKit...")
    await room.disconnect()

async def process_audio_stream(audio_stream: rtc.AudioStream, participant_identity: str):
    """
    Consumes raw PCM audio chunks from LiveKit, runs them through AASIST-L,
    and dispatches risk scores via DataChannels.
    """
    print(f"Started analyzing audio stream for {participant_identity}")
    
    # Create a local audio buffer
    audio_buffer = bytearray()
    
    async for frame_event in audio_stream:
        # frame_event contains raw PCM16 frames from the SFU
        audio_buffer.extend(frame_event.frame.data)
        
        # When we have ~4 seconds of audio (64600 samples at 16kHz)
        if len(audio_buffer) >= 64600 * 2: # 16-bit PCM = 2 bytes per sample
            chunk = audio_buffer[:64600 * 2]
            audio_buffer = audio_buffer[64600 * 2:]
            
            # --- AASIST-L Inference Placeholder ---
            # risk_score = model.infer(chunk)
            # print(f"[{participant_identity}] Risk Score: {risk_score}")
            pass

if __name__ == "__main__":
    asyncio.run(main())
