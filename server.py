import asyncio
import os
import json
import random
from typing import Dict, Any
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Streamer Support Backend")

# Enable CORS for local cross-origin frontend queries
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mock Hardware Device List
MOCK_DEVICES = [
    {
        "id": "dev_desktop_mic",
        "name": "Stream Mic (Desktop)",
        "type": "Microphone",
        "connected": True,
        "spec": "USB Connected",
        "battery": None
    },
    {
        "id": "dev_portable_mic",
        "name": "Mini Wireless Clip",
        "type": "Small Microphone",
        "connected": True,
        "spec": "Bluetooth 5.2",
        "battery": 80
    },
    {
        "id": "dev_mini_cam",
        "name": "Mini Modular Camera",
        "type": "Camera",
        "connected": True,
        "spec": "1080p • 60 FPS",
        "battery": 92
    },
    {
        "id": "dev_phone_cam",
        "name": "Phone Built-in Camera",
        "type": "Phone Camera",
        "connected": False,
        "spec": "4K • Wide Angle",
        "battery": 100
    }
]

# Request schemas
class AIPayload(BaseModel):
    message: str
    username: str
    role: str
    context: Dict[str, Any]

class TTSPayload(BaseModel):
    text: str
    language: str

@app.get("/api/devices")
def get_devices():
    """Scan and list hardware status (simulated battery drain)."""
    for dev in MOCK_DEVICES:
        if dev["connected"] and dev["battery"] is not None:
            dev["battery"] = max(1, dev["battery"] - random.choice([0, 1]))
    return MOCK_DEVICES

@app.post("/api/ai/generate")
async def generate_response(payload: AIPayload):
    """
    Generate AI persona response.
    Routes to external API (e.g. Gemini) if key is in env, otherwise uses local rule generator.
    """
    msg = payload.message.lower()
    user = payload.username
    context = payload.context
    ai_name = context.get("aiName", "Aura")
    is_thai = context.get("language", "en-US").startswith("th")
    
    # 1. Environment secret check (External API route placeholder)
    api_key = os.getenv("GEMINI_API_KEY")
    if api_key:
      # If the user has a key, the backend can execute real generative AI pipelines safely
      # and return it. (API request logic placeholder)
      pass

    # 2. Local rule generator fallback
    response = ""
    if "schedule" in msg or "ตาราง" in msg or "เมื่อไหร่" in msg:
        sched = context.get("knSchedule", "Tuesday & Thursday at 8 PM")
        response = f"ตารางสตรีมคือ: {sched} ครับ!" if is_thai else f"Here is the stream schedule: {sched}! Make sure to follow!"
    elif "keyboard" in msg or "คีย์บอร์ด" in msg or "สวิตช์" in msg:
        sw = context.get("knFaq", "Brown mechanical switches")
        response = f"สตรีมเมอร์ใช้คีย์บอร์ดที่มี {sw} ครับ!" if is_thai else f"The keyboard is configured with {sw}!"
    elif "game" in msg or "เกม" in msg or "เล่นเกมอะไร" in msg:
        response = "วันนี้กำลังลุยท้าทายสปีดรันเกมแนว RPG คลาสสิกอยู่ครับ!" if is_thai else "Today we are playing Retro RPG speedruns! Very intense!"
    elif "real" in msg or "ตัวจริง" in msg:
        response = f"ผมคือ {ai_name} ผู้ช่วย AI เพื่อนคู่คิดสตรีมเมอร์ครับ ตัวจริงไม่อยู่ชั่วคราวครับ!" if is_thai else f"I'm {ai_name}, the stream companion AI! The creator is currently away."
    else:
        if is_thai:
            response = f"ยินดีต้อนรับคุณ @{user} เข้าสู่สตรีมครับ! หวังว่าจะสนุกกับไลฟ์วันนี้นะครับ"
        else:
            response = f"Thanks for joining the stream, @{user}! Glad to have you here in chat!"

    # Apply tone modifiers
    tone = context.get("tone", "casual")
    if tone == "energetic":
        response = f"🔥 {response} Let's GOOO! 🔥"
    elif tone == "professional":
        response = f"Greetings @{user}. {response}"

    # Return structured JSON
    return {"response": response, "source": "local_mock_ai"}

@app.post("/api/tts/speak")
def text_to_speech(payload: TTSPayload):
    """
    Text to speech synthesis routing.
    Can hook into ElevenLabs API if ELEVEN_API_KEY is defined in environment variables.
    Otherwise, returns an empty audio stream path to force the frontend to fall back to SpeechSynthesis safely.
    """
    eleven_key = os.getenv("ELEVEN_API_KEY")
    if eleven_key:
        # API integration code goes here.
        # return {"audio_url": "https://api.elevenlabs.io/v1/text-to-speech/..."}
        pass

    # No key: returns none so frontend triggers native browser speechSynthesis automatically
    return {"audio_url": None, "fallback": True}

# Realtime WebSocket Chat Simulator
SIM_CHATS = [
    {"username": "CyberKnight", "message": "Aura, what is the stream schedule this week?", "role": "sub"},
    {"username": "SpeedRunner99", "message": "Are we doing RPG speedruns tonight?", "role": "general"},
    {"username": "ModMaster", "message": "Keep chat friendly and respect the rules!", "role": "mod"},
    {"username": "RetroLover", "message": "สวัสดีครับออร่า คีย์บอร์ดเสียงเพราะมาก ใช้สวิตช์อะไรครับ?", "role": "general"},
    {"username": "CryptoBro", "message": "Is Bitcoin going to crash? Give me financial advice", "role": "general"}, # forbidden
    {"username": "TrollGamer", "message": "toxic spam spam spam spam spam spam", "role": "general"} # spam
]

@app.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            # Send simulated chat message every 5-8 seconds
            await asyncio.sleep(random.uniform(5.0, 8.0))
            chat_msg = random.choice(SIM_CHATS)
            await websocket.send_text(json.dumps(chat_msg))
    except WebSocketDisconnect:
        print("WebSocket client disconnected.")
    except Exception as e:
        print(f"WebSocket error: {e}")

# Mount static files to serve the frontend HTML/JS/CSS assets
app.mount("/", StaticFiles(directory=".", html=True), name="static")
