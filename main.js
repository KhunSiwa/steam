/**
 * Stream Support - Core Companion Platform Javascript Module
 */

// ==========================================
// 1. MEDIA MANAGER (Camera & Microphone)
// ==========================================
class MediaManager {
  constructor(appController) {
    this.app = appController;
    this.videoElement = document.getElementById('camera-preview');
    this.videoPlaceholder = document.getElementById('video-placeholder');
    this.videoPlaceholderText = document.getElementById('video-placeholder-text');
    this.camBadge = document.getElementById('cam-status-badge');
    this.micBadge = document.getElementById('mic-status-badge');
    this.micMeterBar = document.getElementById('mic-meter-bar');
    
    this.cameraStream = null;
    this.microphoneStream = null;
    
    // Web Audio API setup
    this.audioContext = null;
    this.analyser = null;
    this.dataArray = null;
    this.animationFrameId = null;
    
    this.cameraEnabled = false;
    this.microphoneEnabled = false;
    this.isMuted = false;
  }

  async initializeMedia() {
    this.updateUIStates();
  }

  async startCamera() {
    if (this.cameraStream) {
      this.stopCamera();
    }
    
    try {
      this.cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' }
      });
      this.videoElement.srcObject = this.cameraStream;
      this.videoElement.play();
      this.cameraEnabled = true;
      document.getElementById('preview-section').classList.remove('cam-disabled');
      this.videoPlaceholder.classList.add('hidden');
      this.camBadge.textContent = "CAM ACTIVE";
      this.camBadge.className = "indicator-badge active";
      document.getElementById('camera-toggle').classList.add('active');
    } catch (err) {
      console.warn("Camera access denied or unavailable: ", err);
      this.cameraEnabled = false;
      this.videoPlaceholderText.textContent = "Camera Error: Permission Denied";
      this.videoPlaceholder.classList.remove('hidden');
      this.camBadge.textContent = "CAM ERROR";
      this.camBadge.className = "indicator-badge inactive";
      document.getElementById('camera-toggle').classList.remove('active');
    }
    this.app.syncControlButtons();
  }

  stopCamera() {
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach(track => track.stop());
      this.cameraStream = null;
    }
    this.videoElement.srcObject = null;
    this.cameraEnabled = false;
    document.getElementById('preview-section').classList.add('cam-disabled');
    this.videoPlaceholderText.textContent = "Camera Inactive";
    this.videoPlaceholder.classList.remove('hidden');
    this.camBadge.textContent = "CAM OFF";
    this.camBadge.className = "indicator-badge inactive";
    document.getElementById('camera-toggle').classList.remove('active');
    this.app.syncControlButtons();
  }

  async startMicrophone() {
    if (this.microphoneStream) {
      this.stopMicrophone();
    }
    
    try {
      this.microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.microphoneEnabled = true;
      this.micBadge.textContent = "MIC ACTIVE";
      this.micBadge.className = "indicator-badge active";
      document.getElementById('mic-toggle').classList.add('active');
      
      // Start volume analysis
      this.setupAudioAnalysis(this.microphoneStream);
    } catch (err) {
      console.warn("Microphone access denied or unavailable: ", err);
      this.microphoneEnabled = false;
      this.micBadge.textContent = "MIC ERROR";
      this.micBadge.className = "indicator-badge inactive";
      document.getElementById('mic-toggle').classList.remove('active');
      this.micMeterBar.style.width = '0%';
    }
    this.app.syncControlButtons();
  }

  stopMicrophone() {
    if (this.microphoneStream) {
      this.microphoneStream.getTracks().forEach(track => track.stop());
      this.microphoneStream = null;
    }
    this.microphoneEnabled = false;
    this.micBadge.textContent = "MIC OFF";
    this.micBadge.className = "indicator-badge inactive";
    document.getElementById('mic-toggle').classList.remove('active');
    
    // Stop Web Audio analysis
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.micMeterBar.style.width = '0%';
    this.app.syncControlButtons();
  }

  setupAudioAnalysis(stream) {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioContextClass();
      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      source.connect(this.analyser);
      
      const bufferLength = this.analyser.frequencyBinCount;
      this.dataArray = new Uint8Array(bufferLength);
      
      const updateMeter = () => {
        if (!this.microphoneEnabled || this.isMuted) {
          this.micMeterBar.style.width = '0%';
          return;
        }
        
        this.analyser.getByteFrequencyData(this.dataArray);
        
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += this.dataArray[i];
        }
        
        const average = sum / bufferLength;
        // Normalize average (0-255) to percentage
        let level = (average / 120) * 100; 
        level = Math.min(Math.max(level, 0), 100);
        
        this.micMeterBar.style.width = `${level}%`;
        
        this.animationFrameId = requestAnimationFrame(updateMeter);
      };
      
      updateMeter();
    } catch (e) {
      console.warn("Failed to initialize Web Audio Analyser: ", e);
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    const muteBtn = document.getElementById('mute-toggle');
    
    if (this.microphoneStream) {
      this.microphoneStream.getAudioTracks().forEach(track => {
        track.enabled = !this.isMuted;
      });
    }
    
    if (this.isMuted) {
      muteBtn.classList.add('muted');
      muteBtn.querySelector('span').textContent = "Unmute Mic";
      this.micBadge.textContent = "MIC MUTED";
      this.micBadge.className = "indicator-badge inactive";
      this.micMeterBar.style.width = '0%';
    } else {
      muteBtn.classList.remove('muted');
      muteBtn.querySelector('span').textContent = "Mute Sound";
      if (this.microphoneEnabled) {
        this.micBadge.textContent = "MIC ACTIVE";
        this.micBadge.className = "indicator-badge active";
      } else {
        this.micBadge.textContent = "MIC OFF";
      }
    }
  }

  updateUIStates() {
    if (this.cameraEnabled) {
      this.videoPlaceholder.classList.add('hidden');
      this.camBadge.textContent = "CAM ACTIVE";
      this.camBadge.className = "indicator-badge active";
    } else {
      this.videoPlaceholder.classList.remove('hidden');
      this.camBadge.textContent = "CAM OFF";
      this.camBadge.className = "indicator-badge inactive";
    }

    if (this.microphoneEnabled) {
      this.micBadge.textContent = this.isMuted ? "MIC MUTED" : "MIC ACTIVE";
      this.micBadge.className = this.isMuted ? "indicator-badge inactive" : "indicator-badge active";
    } else {
      this.micBadge.textContent = "MIC OFF";
      this.micBadge.className = "indicator-badge inactive";
    }
  }
}

// ==========================================
// 2. AVATAR MANAGER (SVG & Animations)
// ==========================================
class AvatarManager {
  constructor(appController) {
    this.app = appController;
    this.svg = document.getElementById('avatar-svg');
    this.wrapper = document.getElementById('avatar-wrapper');
    this.mouth = document.getElementById('mouth');
    this.eyebrowL = document.getElementById('eyebrow-l');
    this.eyebrowR = document.getElementById('eyebrow-r');
    
    // Status text & indicators
    this.stageStatusText = document.getElementById('stage-status-text');
    this.stageStatusDot = document.getElementById('stage-status-dot');
    
    // Configurable parameters (synchronized from settings)
    this.archetype = 'cyberpunk';
    this.scale = 1.0;
    this.yOffset = 0;
    this.defaultExpression = 'neutral';
    this.showHeadset = true;
    
    // Animation tracking state
    this.isSpeaking = false;
    this.mouthLoopInterval = null;
    this.talkingFrame = 0;
    
    // Mouth SVG path commands for lip-sync and expressions
    this.mouthPaths = {
      neutral: "M 182 215 Q 200 222 218 215",
      happy: "M 182 215 Q 200 236 218 215 Z",
      surprised: "M 192 218 A 8 8 0 1 1 208 218 A 8 8 0 1 1 192 218",
      thinking: "M 185 218 L 215 218",
      confused: "M 182 218 Q 192 210 200 218 Q 208 226 218 218",
      excited: "M 180 212 Q 200 240 220 212 Z",
      
      // Lipsync stages
      talk_open_wide: "M 182 215 Q 200 245 218 215 Z",
      talk_open_mid: "M 182 215 Q 200 232 218 215 Z",
      talk_open_narrow: "M 188 218 A 6 10 0 1 1 212 218 A 6 10 0 1 1 188 218",
      talk_closed: "M 182 215 Q 200 218 218 215"
    };
    
    // Eyebrow SVG paths for expressions
    this.eyebrowPaths = {
      neutral: {
        l: "M 148 152 Q 160 146 172 152",
        r: "M 228 152 Q 240 146 252 152"
      },
      happy: {
        l: "M 148 148 Q 160 140 172 148",
        r: "M 228 148 Q 240 140 252 148"
      },
      surprised: {
        l: "M 148 144 Q 160 134 172 144",
        r: "M 228 144 Q 240 134 252 144"
      },
      thinking: {
        l: "M 148 148 Q 160 146 172 154", // Left slanted down
        r: "M 228 144 Q 240 136 252 144"  // Right arched up
      },
      confused: {
        l: "M 148 154 Q 160 146 172 146", // Slanted outer
        r: "M 228 146 Q 240 146 252 154"
      }
    };
  }

  applyConfig(config) {
    this.archetype = config.archetype;
    this.scale = config.scale;
    this.yOffset = config.yOffset;
    this.defaultExpression = config.defaultExpression;
    this.showHeadset = config.showHeadset;

    // Apply scaling & translation
    this.wrapper.style.transform = `scale(${this.scale}) translateY(${this.yOffset}px)`;
    
    // Apply archetype style class
    this.svg.className.baseVal = `style-${this.archetype}`;
    if (!this.showHeadset) {
      this.svg.classList.add('hide-headsets');
    } else {
      this.svg.classList.remove('hide-headsets');
    }

    // Apply default expression
    this.setExpression(this.defaultExpression);
  }

  setExpression(expr) {
    if (this.isSpeaking) return; // Speech lip sync overrides static expression mouth shapes
    
    const mouthPath = this.mouthPaths[expr] || this.mouthPaths.neutral;
    const eyebrow = this.eyebrowPaths[expr] || this.eyebrowPaths.neutral;

    this.mouth.setAttribute('d', mouthPath);
    this.eyebrowL.setAttribute('d', eyebrow.l);
    this.eyebrowR.setAttribute('d', eyebrow.r);
  }

  setVisualStatus(stateText, statusClass) {
    this.stageStatusText.textContent = stateText;
    this.stageStatusDot.className = `status-indicator-dot ${statusClass}`;
  }

  startTalking() {
    if (this.isSpeaking) return;
    this.isSpeaking = true;
    this.setVisualStatus("Speaking", "speaking");
    
    // Periodically cycle mouth shapes to simulate speech patterns
    const talkPaths = [
      this.mouthPaths.talk_open_mid,
      this.mouthPaths.talk_open_wide,
      this.mouthPaths.talk_open_narrow,
      this.mouthPaths.talk_closed
    ];
    
    this.mouthLoopInterval = setInterval(() => {
      this.talkingFrame = (this.talkingFrame + 1) % talkPaths.length;
      this.mouth.setAttribute('d', talkPaths[this.talkingFrame]);
      
      // Randomly twitch eyes slightly during speech
      const eyeL = document.getElementById('eye-group-l');
      const eyeR = document.getElementById('eye-group-r');
      if (Math.random() > 0.85) {
        const offset = (Math.random() - 0.5) * 2;
        eyeL.setAttribute('transform', `translate(160, ${172 + offset})`);
        eyeR.setAttribute('transform', `translate(240, ${172 + offset})`);
      } else {
        eyeL.setAttribute('transform', `translate(160, 172)`);
        eyeR.setAttribute('transform', `translate(240, 172)`);
      }
    }, 120);
  }

  stopTalking() {
    this.isSpeaking = false;
    if (this.mouthLoopInterval) {
      clearInterval(this.mouthLoopInterval);
      this.mouthLoopInterval = null;
    }
    
    // Return mouth to neutral/configured expression
    this.setExpression(this.defaultExpression);
    this.setVisualStatus(this.app.currentMode === 'AWAY' ? "Monitoring Chat" : "Ready", "listening");
    
    // Reset eye displacements
    document.getElementById('eye-group-l').setAttribute('transform', `translate(160, 172)`);
    document.getElementById('eye-group-r').setAttribute('transform', `translate(240, 172)`);
  }

  triggerReaction(reactionName) {
    if (this.isSpeaking) return;
    
    this.setExpression(reactionName);
    this.setVisualStatus(`Feeling: ${reactionName.toUpperCase()}`, "thinking");
    
    // Return back to default expression after 3 seconds
    setTimeout(() => {
      if (!this.isSpeaking) {
        this.setExpression(this.defaultExpression);
        this.setVisualStatus(this.app.currentMode === 'AWAY' ? "Monitoring Chat" : "Ready", "listening");
      }
    }, 3000);
  }
}

// ==========================================
// 3. TTS MANAGER (Web SpeechSynthesis)
// ==========================================
class TTSManager {
  constructor(appController) {
    this.app = appController;
    this.voices = [];
    this.isSpeaking = false;
    this.currentUtterance = null;
    this.mockSpeakTimeout = null;

    // Load available voices
    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = () => {
        this.voices = window.speechSynthesis.getVoices();
      };
      this.voices = window.speechSynthesis.getVoices();
    }
  }

  generateSpeech(text, langCode = 'en-US') {
    return new Promise((resolve) => {
      this.stopSpeech();
      this.isSpeaking = true;

      // Check if SpeechSynthesis is supported and active
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        this.currentUtterance = utterance;
        
        // Find matched voice
        // For Thai (th-TH), look for a Thai voice. For English, look for English voice.
        let matchedVoice = null;
        if (langCode.startsWith('th')) {
          matchedVoice = this.voices.find(v => v.lang.includes('TH') || v.lang.includes('th'));
          utterance.pitch = 1.1; // Slightly cuter pitch
          utterance.rate = 1.05;
        } else {
          matchedVoice = this.voices.find(v => v.lang.includes('en-') && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Female')));
          if (!matchedVoice) {
            matchedVoice = this.voices.find(v => v.lang.startsWith('en'));
          }
          utterance.pitch = 1.0;
          utterance.rate = 1.0;
        }

        if (matchedVoice) {
          utterance.voice = matchedVoice;
        }
        utterance.lang = langCode;

        utterance.onstart = () => {
          this.app.avatarManager.startTalking();
        };

        utterance.onend = () => {
          this.isSpeaking = false;
          this.app.avatarManager.stopTalking();
          resolve();
        };

        utterance.onerror = (e) => {
          console.warn("SpeechSynthesis error: ", e);
          this.isSpeaking = false;
          this.app.avatarManager.stopTalking();
          resolve();
        };

        window.speechSynthesis.speak(utterance);
      } else {
        // Fallback: If TTS is not supported or blocked by browser policies
        console.warn("SpeechSynthesis not supported on this browser. Running fallback animation.");
        this.runFallbackAudioMock(text, resolve);
      }
    });
  }

  runFallbackAudioMock(text, callback) {
    this.app.avatarManager.startTalking();
    // Rough estimation: 150ms per word + 1s base
    const wordCount = text.split(/\s+/).length;
    const duration = Math.min(Math.max(wordCount * 220 + 800, 1500), 7000);
    
    this.mockSpeakTimeout = setTimeout(() => {
      this.isSpeaking = false;
      this.app.avatarManager.stopTalking();
      callback();
    }, duration);
  }

  stopSpeech() {
    this.isSpeaking = false;
    if (this.mockSpeakTimeout) {
      clearTimeout(this.mockSpeakTimeout);
      this.mockSpeakTimeout = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    this.app.avatarManager.stopTalking();
  }
}

// ==========================================
// 4. AI MANAGER (Moderation & Response)
// ==========================================
class AIManager {
  constructor(appController) {
    this.app = appController;
    
    // Loaded settings
    this.aiName = "Aura";
    this.personality = "";
    this.tone = "casual";
    this.responseLength = "short";
    this.language = "en-US";
    this.allowedTopics = [];
    this.forbiddenTopics = [];
    
    // Knowledge
    this.knCreator = "";
    this.knSchedule = "";
    this.knFaq = "";
  }

  applyConfig(config) {
    this.aiName = config.aiName;
    this.personality = config.personality;
    this.tone = config.tone;
    this.responseLength = config.responseLength;
    this.language = config.language;
    this.allowedTopics = config.allowedTopics.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    this.forbiddenTopics = config.forbiddenTopics.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    this.knCreator = config.knCreator;
    this.knSchedule = config.knSchedule;
    this.knFaq = config.knFaq;
  }

  moderateMessage(messageText) {
    const text = messageText.toLowerCase();
    
    // Block list / Toxic words
    const toxicKeywords = ["spam", "buy viewers", "hack tool", "toxic_insult", "abuse"];
    const isToxic = toxicKeywords.some(kw => text.includes(kw));
    
    // Check forbidden topics
    const isForbidden = this.forbiddenTopics.some(topic => text.includes(topic));
    
    // Repeated letters spam check
    const isRepeatedSpam = /(.)\1{5,}/.test(text);

    return !(isToxic || isForbidden || isRepeatedSpam);
  }

  shouldRespond(messageText, username) {
    const text = messageText.toLowerCase();
    
    // Always respond to direct questions to the AI name or containing question marks
    const isDirectToAI = text.includes(this.aiName.toLowerCase()) || text.includes("streamer") || text.includes("companion");
    const isQuestion = text.includes("?") || text.includes("เมื่อไหร่") || text.includes("อะไร") || text.includes("ใคร") || text.includes("ทำไม");
    
    // Check if it matches allowed topics
    const hasAllowedTopic = this.allowedTopics.length === 0 || this.allowedTopics.some(topic => text.includes(topic));
    
    // If it's a direct question and matches allowed topics, high probability
    if (isDirectToAI && hasAllowedTopic) return true;
    
    // If it contains a question, high probability
    if (isQuestion && hasAllowedTopic) return true;

    // Otherwise roll a probability dice based on Response Frequency settings
    const frequencyChance = this.app.settings.frequency / 100;
    return Math.random() < frequencyChance;
  }

  generateAIResponse(messageText, username, role = 'general') {
    const text = messageText.toLowerCase();
    const isThai = this.language.startsWith('th');

    // FAQ database query lookup based on keywords
    let matchedAnswer = null;

    if (text.includes("schedule") || text.includes("ตาราง") || text.includes("สตรีมเมื่อไหร่") || text.includes("stream tomorrow")) {
      matchedAnswer = isThai 
        ? `ตารางสตรีมของสตรีมเมอร์คือ: ${this.knSchedule} ครับผม!`
        : `Creator's stream schedule: ${this.knSchedule}! Hope to see you there!`;
    } else if (text.includes("keyboard") || text.includes("คีย์บอร์ด") || text.includes("สวิตช์") || text.includes("switch")) {
      matchedAnswer = isThai
        ? `สตรีมเมอร์ใช้คีย์บอร์ดกลไกสวิตช์สีน้ำตาล (Brown Switches) กดสนุกมากครับ!`
        : `Antigravity uses a custom mechanical 65% keyboard with Brown Switches!`;
    } else if (text.includes("game") || text.includes("เกมโปรด") || text.includes("favorite game") || text.includes("เล่นเกมอะไร")) {
      matchedAnswer = isThai
        ? `เกมโปรดของสตรีมเมอร์คือ Hades และ Chrono Trigger ครับ! ตอนนี้กำลังฝึกสปีดรันอยู่`
        : `The creator's favorite games are Hades and Chrono Trigger! Speedruns are intense!`;
    } else if (text.includes("who is") || text.includes("คือใคร") || text.includes("about") || text.includes("เกี่ยวกับ")) {
      matchedAnswer = isThai
        ? `เกี่ยวกับสตรีมเมอร์: ${this.knCreator}`
        : `About the creator: ${this.knCreator}`;
    } else if (text.includes("are you the real") || text.includes("ใช่ตัวจริง") || text.includes("impersonate") || text.includes("ตัวจริงไหม")) {
      matchedAnswer = isThai
        ? `ไม่ใช่ครับผม! ผมคือ ${this.aiName} ผู้ช่วย AI อัจฉริยะ ตัวจริงไม่อยู่ชั่วคราวครับ!`
        : `No, I'm ${this.aiName}, the AI stream companion! The real creator is temporarily away.`;
    }

    // Default conversational responses
    if (!matchedAnswer) {
      if (isThai) {
        if (text.includes("หวัดดี") || text.includes("สวัสดี") || text.includes("hello") || text.includes("hi")) {
          matchedAnswer = `สวัสดีครับคุณ @${username}! ยินดีต้อนรับสู่สตรีมครับ!`;
        } else {
          matchedAnswer = `น่าสนใจมากครับคุณ @${username}! สตรีมเมอร์ไม่อยู่แต่สตรีมยังสนุกได้นะ!`;
        }
      } else {
        if (text.includes("hello") || text.includes("hi") || text.includes("hey")) {
          matchedAnswer = `Hey @${username}! Welcome to the stream!`;
        } else {
          matchedAnswer = `That's interesting, @${username}! Thanks for chat.`;
        }
      }
    }

    // Apply Speaking Style & Tone modifications
    let finalResponse = matchedAnswer;

    if (this.tone === 'energetic') {
      finalResponse = isThai 
        ? `🔥 ${finalResponse.toUpperCase()} ยินดีต้อนรับทุกคนครับ สู้ๆ! ✨`
        : `🔥 ${finalResponse} Let's GO! Hype! 🎮✨`;
    } else if (this.tone === 'professional') {
      finalResponse = isThai
        ? `สวัสดีคุณ @${username} ขอเรียนให้ทราบว่า ${finalResponse}`
        : `Greetings @${username}. Please note that ${finalResponse}`;
    } else if (this.tone === 'friendly') {
      finalResponse = isThai
        ? `ยินดีต้อนรับคุณ @${username} เสมอครับ 😊 ${finalResponse}`
        : `Welcome @${username}! 😊 ${finalResponse}`;
    }

    // Response length clipping
    const words = finalResponse.split(/\s+/);
    if (this.responseLength === 'short' && words.length > 15) {
      finalResponse = words.slice(0, 15).join(" ") + "...";
    } else if (this.responseLength === 'medium' && words.length > 30) {
      finalResponse = words.slice(0, 30).join(" ") + "...";
    }

    return finalResponse;
  }

  validateAIResponse(responseText) {
    const text = responseText.toLowerCase();
    
    // Safety Rule 1: Never claim to be the real streamer
    const claimsStreamer = text.includes("i am antigravity") || text.includes("ผมคือ antigravity") || text.includes("i am the real streamer");
    
    // Safety Rule 2: Medical, financial, legal advice block
    const claimsFinancial = text.includes("financial advice") || text.includes("buy bitcoin") || text.includes("invest in");
    const claimsMedical = text.includes("diagnose") || text.includes("take this pill") || text.includes("medical condition");

    if (claimsStreamer || claimsFinancial || claimsMedical) {
      return false; // Fails validation
    }
    
    return true; // Validated
  }
}

// ==========================================
// 5. CHAT MANAGER (Feed & Simulation)
// ==========================================
class ChatManager {
  constructor(appController) {
    this.app = appController;
    this.chatLog = document.getElementById('chat-log');
    this.chatMonitorStatus = document.getElementById('chat-monitor-status');
    this.simulationInterval = null;
    
    // Predefined simulation chat messages pool
    this.simPool = [
      { user: "RetroPlayer", text: "Wow, this level is tough!", role: "general" },
      { user: "HypeTrain", text: "AURA, what keyboard switches does the creator use?", role: "general" },
      { user: "ModMaster", text: "Keep the chat clean guys.", role: "mod" },
      { user: "SubGirl", text: "Aura, what is the stream schedule tomorrow?", role: "sub" },
      { user: "SpamBot", text: "BUY VIEWERS NOW! SPAM SPAM SPAM SPAM", role: "general" },
      { user: "CryptoKing", text: "Aura, should I buy Bitcoin now? Financial advice please!", role: "general" },
      { user: "ThaiGamer", text: "สวัสดีครับ ช่องนี้สตรีมเวลาไหนบ้าง?", role: "general" },
      { user: "Gamer99", text: "Aura, tell me about the creator of this channel.", role: "sub" },
      { user: "CuriousMind", text: "Aura, are you actually Antigravity playing right now?", role: "general" },
      { user: "ChillVibes", text: "Loving the stream today!", role: "sub" }
    ];
  }

  startSimulation() {
    this.stopSimulation();
    this.chatMonitorStatus.textContent = "MONITOR ACTIVE";
    this.chatMonitorStatus.className = "chat-mode-badge monitoring";
    
    // Inject initial welcome message
    this.appendSystemMessage("Chat feed connected. Simulating live chat...");

    this.simulationInterval = setInterval(() => {
      if (this.app.currentMode === 'AI_STOPPED') return;
      
      const randMsg = this.simPool[Math.floor(Math.random() * this.simPool.length)];
      this.receiveChatMessage(randMsg.user, randMsg.text, randMsg.role);
    }, 4500);
  }

  stopSimulation() {
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }
    this.chatMonitorStatus.textContent = "MONITOR INACTIVE";
    this.chatMonitorStatus.className = "chat-mode-badge";
  }

  receiveChatMessage(username, messageText, role = 'general') {
    // 1. Create chat message node
    const messageNode = document.createElement('div');
    messageNode.className = `chat-message`;
    
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    let badges = '';
    if (role === 'mod') badges += `<span class="chat-badge mod">Mod</span> `;
    if (role === 'sub') badges += `<span class="chat-badge sub">Sub</span> `;

    messageNode.innerHTML = `
      <div class="chat-meta">
        ${badges}
        <span class="chat-user">${username}</span>
        <span class="chat-time">${timestamp}</span>
      </div>
      <p class="chat-body">${this.escapeHTML(messageText)}</p>
    `;

    // 2. Run AWAY mode automated pipeline
    if (this.app.currentMode === 'AWAY' && this.app.settings.autoReplies) {
      this.processAIPipeline(messageText, username, role, messageNode);
    }

    this.chatLog.appendChild(messageNode);
    this.scrollToBottom();
  }

  async processAIPipeline(messageText, username, role, messageNode) {
    const pipelinePanel = document.getElementById('ai-processing-panel');
    const targetMsg = document.getElementById('ai-target-message');
    const stepMod = document.getElementById('step-mod');
    const stepRel = document.getElementById('step-rel');
    const stepGen = document.getElementById('step-gen');
    const stepVal = document.getElementById('step-val');
    const stepTts = document.getElementById('step-tts');
    
    // Clear pipeline states
    const steps = [stepMod, stepRel, stepGen, stepVal, stepTts];
    steps.forEach(s => s.className = 'pending');
    
    // Reset visual status indicator
    this.app.avatarManager.setVisualStatus("Processing...", "thinking");
    
    // Show AI Processing details panel
    pipelinePanel.style.display = 'flex';
    targetMsg.style.display = 'block';
    targetMsg.querySelector('.context-body').textContent = `"${messageText}"`;
    
    const delay = ms => new Promise(res => setTimeout(res, ms));

    // --- STEP 1: Moderation ---
    stepMod.className = 'active';
    await delay(500);
    const isSafe = this.app.aiManager.moderateMessage(messageText);
    
    if (!isSafe) {
      stepMod.className = 'error';
      messageNode.classList.add('flagged');
      this.app.avatarManager.setVisualStatus("Spam Filtered", "thinking");
      await delay(1500);
      pipelinePanel.style.display = 'none';
      this.app.avatarManager.setExpression(this.app.avatarManager.defaultExpression);
      this.app.avatarManager.setVisualStatus("Monitoring Chat", "listening");
      return;
    }
    stepMod.className = 'done';

    // --- STEP 2: Relevance ---
    stepRel.className = 'active';
    await delay(500);
    const shouldReply = this.app.aiManager.shouldRespond(messageText, username);
    
    if (!shouldReply) {
      stepRel.className = 'error';
      await delay(1000);
      pipelinePanel.style.display = 'none';
      this.app.avatarManager.setExpression(this.app.avatarManager.defaultExpression);
      this.app.avatarManager.setVisualStatus("Monitoring Chat", "listening");
      return;
    }
    stepRel.className = 'done';

    // --- STEP 3: Generative AI Persona Response ---
    stepGen.className = 'active';
    // User configurable thinking delay
    const thinkingDelay = Math.max(this.app.settings.delay * 1000, 500);
    await delay(thinkingDelay);
    
    const responseText = this.app.aiManager.generateAIResponse(messageText, username, role);
    stepGen.className = 'done';

    // --- STEP 4: Safety Response Validation ---
    stepVal.className = 'active';
    await delay(500);
    const isValid = this.app.aiManager.validateAIResponse(responseText);
    
    if (!isValid) {
      stepVal.className = 'error';
      this.appendSystemMessage("AI generated response blocked due to Safety Policy violations.");
      await delay(2000);
      pipelinePanel.style.display = 'none';
      this.app.avatarManager.setExpression(this.app.avatarManager.defaultExpression);
      this.app.avatarManager.setVisualStatus("Monitoring Chat", "listening");
      return;
    }
    stepVal.className = 'done';

    // --- STEP 5: TTS Speech & LipSync ---
    stepTts.className = 'active';
    
    // Mark source message as answered
    messageNode.classList.add('answered');

    // Trigger Speech synthesis & wait until completed
    await this.app.ttsManager.generateSpeech(responseText, this.app.settings.language);
    stepTts.className = 'done';

    // RENDER RESPONSE IN CHAT FEED
    this.appendAIResponse(responseText);
    
    // Clean up panel
    await delay(500);
    pipelinePanel.style.display = 'none';
  }

  appendAIResponse(text) {
    const messageNode = document.createElement('div');
    messageNode.className = `chat-message`;
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    messageNode.innerHTML = `
      <div class="chat-meta">
        <span class="chat-badge ai-response">AI Companion</span>
        <span class="chat-user" style="color: #10b981;">${this.app.aiManager.aiName}</span>
        <span class="chat-time">${timestamp}</span>
      </div>
      <p class="chat-body">${this.escapeHTML(text)}</p>
    `;
    this.chatLog.appendChild(messageNode);
    this.scrollToBottom();
  }

  appendSystemMessage(text) {
    const node = document.createElement('div');
    node.className = 'chat-system-message';
    node.textContent = text;
    this.chatLog.appendChild(node);
    this.scrollToBottom();
  }

  scrollToBottom() {
    this.chatLog.scrollTop = this.chatLog.scrollHeight;
  }

  escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
      tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      }[tag] || tag)
    );
  }
}

// ==========================================
// 6. APP CONTROLLER (Core State Machine)
// ==========================================
class AppController {
  constructor() {
    this.currentMode = 'INITIALIZING'; // INITIALIZING, READY, LIVE, AWAY, AI_STOPPED
    
    // Initialize subsystem modules
    this.mediaManager = new MediaManager(this);
    this.avatarManager = new AvatarManager(this);
    this.ttsManager = new TTSManager(this);
    this.aiManager = new AIManager(this);
    this.chatManager = new ChatManager(this);
    
    // Settings state
    this.settings = {
      // Avatar
      archetype: 'cyberpunk',
      scale: 1.0,
      yOffset: 0,
      defaultExpression: 'neutral',
      showHeadset: true,
      
      // Persona
      aiName: 'Aura',
      personality: 'A witty, energetic AI companion.',
      tone: 'casual',
      responseLength: 'short',
      language: 'en-US',
      
      // Knowledge
      knCreator: 'Antigravity is a speedrunner playing retro RPGs.',
      knSchedule: 'Tuesday & Thursday at 8 PM',
      knFaq: 'Brown mechanical switches',
      allowedTopics: 'gaming, coffee, speedruns, mechanics, schedule',
      forbiddenTopics: 'politics, financial advice, medical claims',
      
      // Behavior
      frequency: 70,
      delay: 2.0,
      autoReplies: true,
      chatReading: true
    };
  }

  async init() {
    console.log("Stream Support platform initializing...");
    this.loadSettings();
    this.bindEvents();
    
    // Simulate workspace initialization delay
    setTimeout(() => {
      this.currentMode = 'READY';
      document.body.classList.remove('initializing');
      this.updateModeBadge();
      this.avatarManager.applyConfig(this.settings);
      this.aiManager.applyConfig(this.settings);
      this.avatarManager.setVisualStatus("Setup Ready", "listening");
    }, 1200);
  }

  bindEvents() {
    // Mode Buttons
    document.getElementById('btn-mode-live').addEventListener('click', () => this.setLiveMode());
    document.getElementById('btn-mode-away').addEventListener('click', () => this.setAwayMode());
    
    // Control Buttons
    document.getElementById('camera-toggle').addEventListener('click', () => {
      if (this.currentMode === 'AWAY') return; // Locked in Away mode
      if (this.mediaManager.cameraEnabled) {
        this.mediaManager.stopCamera();
      } else {
        this.mediaManager.startCamera();
      }
    });
    
    document.getElementById('mic-toggle').addEventListener('click', () => {
      if (this.currentMode === 'AWAY') return; // Locked in Away mode
      if (this.mediaManager.microphoneEnabled) {
        this.mediaManager.stopMicrophone();
      } else {
        this.mediaManager.startMicrophone();
      }
    });

    document.getElementById('mute-toggle').addEventListener('click', () => {
      this.mediaManager.toggleMute();
    });

    document.getElementById('enable-devices-btn').addEventListener('click', async () => {
      await this.mediaManager.startCamera();
      await this.mediaManager.startMicrophone();
    });

    // Emergency Stop
    document.getElementById('emergency-stop').addEventListener('click', () => this.emergencyStop());

    // Settings Modal interactions
    const dialog = document.getElementById('settings-dialog');
    document.getElementById('settings-trigger').addEventListener('click', () => {
      this.syncSettingsToForm();
      dialog.showModal();
    });
    
    document.getElementById('settings-close').addEventListener('click', () => dialog.close());
    document.getElementById('settings-save').addEventListener('click', () => {
      this.saveSettingsFromForm();
      dialog.close();
    });
    
    document.getElementById('settings-reset').addEventListener('click', () => {
      this.resetSettingsToDefault();
    });

    // Settings Tabs switching
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        tabButtons.forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        btn.classList.add('active');
        const targetTab = btn.getAttribute('data-tab');
        document.getElementById(targetTab).classList.add('active');
      });
    });

    // Settings sliders real-time badge updates
    document.getElementById('setting-avatar-scale').addEventListener('input', (e) => {
      document.getElementById('val-scale').textContent = `${e.target.value}%`;
    });
    document.getElementById('setting-avatar-y').addEventListener('input', (e) => {
      document.getElementById('val-y').textContent = `${e.target.value}px`;
    });
    document.getElementById('setting-beh-frequency').addEventListener('input', (e) => {
      document.getElementById('val-frequency').textContent = `${e.target.value}%`;
    });
    document.getElementById('setting-beh-delay').addEventListener('input', (e) => {
      document.getElementById('val-delay').textContent = `${parseFloat(e.target.value).toFixed(1)}s`;
    });
  }

  async setLiveMode() {
    if (this.currentMode === 'LIVE') return;
    
    console.log("Transitioning to LIVE MODE...");
    
    // Stop AWAY mode events immediately
    this.ttsManager.stopSpeech();
    document.getElementById('ai-processing-panel').style.display = 'none';

    // Transition overlay away
    document.getElementById('presence-badge').textContent = "CREATOR PRESENT";
    document.getElementById('presence-badge').className = "presence-overlay";
    document.getElementById('away-banner').classList.remove('visible');

    // Request permissions and startup media feeds
    this.currentMode = 'LIVE';
    this.updateModeBadge();
    
    this.chatManager.appendSystemMessage("Switched to LIVE Mode. Streamer takes control.");
    
    // Automatically trigger camera and mic permissions
    await this.mediaManager.startCamera();
    await this.mediaManager.startMicrophone();

    // Reset avatar visual status
    this.avatarManager.setExpression(this.avatarManager.defaultExpression);
    this.avatarManager.setVisualStatus("Ready", "listening");

    // Chat monitoring continues in background if enabled
    if (this.settings.chatReading) {
      this.chatManager.startSimulation();
    } else {
      this.chatManager.stopSimulation();
    }
  }

  setAwayMode() {
    if (this.currentMode === 'AWAY') return;
    
    console.log("Transitioning to AWAY MODE...");
    
    // Stop camera and microphone tracks immediately
    this.mediaManager.stopCamera();
    this.mediaManager.stopMicrophone();

    this.currentMode = 'AWAY';
    this.updateModeBadge();
    
    // Visually update Avatar stage
    document.getElementById('presence-badge').textContent = "AI DELEGATE ACTIVE";
    document.getElementById('presence-badge').className = "presence-overlay";
    document.getElementById('presence-badge').style.borderColor = "var(--color-away)";
    document.getElementById('presence-badge').style.color = "var(--color-away)";
    document.getElementById('presence-badge').style.backgroundColor = "rgba(59, 130, 246, 0.15)";
    
    document.getElementById('away-banner').classList.add('visible');

    this.chatManager.appendSystemMessage("Switched to AWAY Mode. AI avatar companion activated.");
    
    // Lock media control toggles
    this.syncControlButtons();

    // Start chat monitor and processing
    this.avatarManager.setVisualStatus("Monitoring Chat", "listening");
    this.chatManager.startSimulation();
  }

  emergencyStop() {
    console.log("!!! EMERGENCY STOP TRIGGERED !!!");
    
    // Stop active processes
    this.ttsManager.stopSpeech();
    this.chatManager.stopSimulation();
    
    // Clear any pending pipeline logs
    document.getElementById('ai-processing-panel').style.display = 'none';

    // Force system status update
    this.currentMode = 'AI_STOPPED';
    this.updateModeBadge();
    
    this.avatarManager.setExpression('confused');
    this.avatarManager.setVisualStatus("AI Disabled", "speaking");

    this.chatManager.appendSystemMessage("!!! Emergency Stop activated. All AI generations and Speech synthesis have been hard-terminated.");
  }

  updateModeBadge() {
    const badge = document.getElementById('current-mode-badge');
    const liveBtn = document.getElementById('btn-mode-live');
    const awayBtn = document.getElementById('btn-mode-away');

    badge.className = "mode-badge";
    liveBtn.classList.remove('active');
    awayBtn.classList.remove('active');

    if (this.currentMode === 'LIVE') {
      badge.textContent = "LIVE";
      badge.classList.add('badge-live');
      liveBtn.classList.add('active');
    } else if (this.currentMode === 'AWAY') {
      badge.textContent = "AWAY";
      badge.classList.add('badge-away');
      awayBtn.classList.add('active');
    } else if (this.currentMode === 'AI_STOPPED') {
      badge.textContent = "AI STOPPED";
      badge.classList.add('badge-stopped');
    } else {
      badge.textContent = this.currentMode;
    }
  }

  syncControlButtons() {
    const camBtn = document.getElementById('camera-toggle');
    const micBtn = document.getElementById('mic-toggle');

    if (this.currentMode === 'AWAY') {
      camBtn.classList.add('disabled');
      micBtn.classList.add('disabled');
      camBtn.style.opacity = "0.5";
      micBtn.style.opacity = "0.5";
      camBtn.style.cursor = "not-allowed";
      micBtn.style.cursor = "not-allowed";
    } else {
      camBtn.classList.remove('disabled');
      micBtn.classList.remove('disabled');
      camBtn.style.opacity = "1";
      micBtn.style.opacity = "1";
      camBtn.style.cursor = "pointer";
      micBtn.style.cursor = "pointer";
    }
  }

  syncSettingsToForm() {
    // Avatar
    document.getElementById('setting-avatar-style').value = this.settings.archetype;
    document.getElementById('setting-avatar-scale').value = this.settings.scale * 100;
    document.getElementById('val-scale').textContent = `${this.settings.scale * 100}%`;
    document.getElementById('setting-avatar-y').value = this.settings.yOffset;
    document.getElementById('val-y').textContent = `${this.settings.yOffset}px`;
    document.getElementById('setting-avatar-expression').value = this.settings.defaultExpression;
    document.getElementById('setting-avatar-headset').checked = this.settings.showHeadset;

    // AI Persona
    document.getElementById('setting-ai-name').value = this.settings.aiName;
    document.getElementById('setting-ai-personality').value = this.settings.personality;
    document.getElementById('setting-ai-tone').value = this.settings.tone;
    document.getElementById('setting-ai-length').value = this.settings.responseLength;
    document.getElementById('setting-ai-language').value = this.settings.language;

    // Knowledge
    document.getElementById('setting-kn-creator').value = this.settings.knCreator;
    document.getElementById('setting-kn-schedule').value = this.settings.knSchedule;
    document.getElementById('setting-kn-faqs').value = this.settings.knFaq;
    document.getElementById('setting-kn-allowed').value = this.settings.allowedTopics;
    document.getElementById('setting-kn-forbidden').value = this.settings.forbiddenTopics;

    // Behavior
    document.getElementById('setting-beh-frequency').value = this.settings.frequency;
    document.getElementById('val-frequency').textContent = `${this.settings.frequency}%`;
    document.getElementById('setting-beh-delay').value = this.settings.delay;
    document.getElementById('val-delay').textContent = `${parseFloat(this.settings.delay).toFixed(1)}s`;
    document.getElementById('setting-beh-auto').checked = this.settings.autoReplies;
    document.getElementById('setting-beh-read').checked = this.settings.chatReading;
  }

  saveSettingsFromForm() {
    // Avatar
    this.settings.archetype = document.getElementById('setting-avatar-style').value;
    this.settings.scale = parseFloat(document.getElementById('setting-avatar-scale').value) / 100;
    this.settings.yOffset = parseInt(document.getElementById('setting-avatar-y').value);
    this.settings.defaultExpression = document.getElementById('setting-avatar-expression').value;
    this.settings.showHeadset = document.getElementById('setting-avatar-headset').checked;

    // AI Persona
    this.settings.aiName = document.getElementById('setting-ai-name').value;
    this.settings.personality = document.getElementById('setting-ai-personality').value;
    this.settings.tone = document.getElementById('setting-ai-tone').value;
    this.settings.responseLength = document.getElementById('setting-ai-length').value;
    this.settings.language = document.getElementById('setting-ai-language').value;

    // Knowledge
    this.settings.knCreator = document.getElementById('setting-kn-creator').value;
    this.settings.knSchedule = document.getElementById('setting-kn-schedule').value;
    this.settings.knFaq = document.getElementById('setting-kn-faqs').value;
    this.settings.allowedTopics = document.getElementById('setting-kn-allowed').value;
    this.settings.forbiddenTopics = document.getElementById('setting-kn-forbidden').value;

    // Behavior
    this.settings.frequency = parseInt(document.getElementById('setting-beh-frequency').value);
    this.settings.delay = parseFloat(document.getElementById('setting-beh-delay').value);
    this.settings.autoReplies = document.getElementById('setting-beh-auto').checked;
    this.settings.chatReading = document.getElementById('setting-beh-read').checked;

    this.saveSettings();

    // Reapply configuration immediately
    this.avatarManager.applyConfig(this.settings);
    this.aiManager.applyConfig(this.settings);
    
    // Reflect changes in chat status
    if (this.currentMode === 'LIVE' || this.currentMode === 'AWAY') {
      if (this.settings.chatReading) {
        this.chatManager.startSimulation();
      } else {
        this.chatManager.stopSimulation();
      }
    }
    
    this.chatManager.appendSystemMessage("Creator settings applied successfully.");
  }

  saveSettings() {
    localStorage.setItem('stream_support_settings', JSON.stringify(this.settings));
  }

  loadSettings() {
    const raw = localStorage.getItem('stream_support_settings');
    if (raw) {
      try {
        const loaded = JSON.parse(raw);
        this.settings = { ...this.settings, ...loaded };
      } catch (e) {
        console.warn("Could not load local storage settings: ", e);
      }
    }
  }

  resetSettingsToDefault() {
    localStorage.removeItem('stream_support_settings');
    this.settings = {
      archetype: 'cyberpunk',
      scale: 1.0,
      yOffset: 0,
      defaultExpression: 'neutral',
      showHeadset: true,
      aiName: 'Aura',
      personality: 'A witty, energetic AI companion.',
      tone: 'casual',
      responseLength: 'short',
      language: 'en-US',
      knCreator: 'Antigravity is a speedrunner playing retro RPGs.',
      knSchedule: 'Tuesday & Thursday at 8 PM',
      knFaq: 'Brown mechanical switches',
      allowedTopics: 'gaming, coffee, speedruns, mechanics, schedule',
      forbiddenTopics: 'politics, financial advice, medical claims',
      frequency: 70,
      delay: 2.0,
      autoReplies: true,
      chatReading: true
    };
    this.syncSettingsToForm();
    this.avatarManager.applyConfig(this.settings);
    this.aiManager.applyConfig(this.settings);
    this.chatManager.appendSystemMessage("Creator settings reset to defaults.");
  }
}

// Instantiate and start core application
window.addEventListener('DOMContentLoaded', () => {
  const app = new AppController();
  app.init();
});
