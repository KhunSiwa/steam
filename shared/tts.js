/**
 * Streamer Support - Shared TTS System
 */

export class TTSSystem {
  constructor(stateManager, avatarEngine) {
    this.state = stateManager;
    this.avatar = avatarEngine;
    this.voices = [];
    this.isSpeaking = false;
    this.currentUtterance = null;
    this.mockSpeakTimeout = null;
    this.audioElement = null; // For playing backend audio streams

    // Load local browser voices
    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = () => {
        this.voices = window.speechSynthesis.getVoices();
      };
      this.voices = window.speechSynthesis.getVoices();
    }
  }

  generateSpeech(text) {
    return new Promise(async (resolve) => {
      this.stopSpeech();
      this.isSpeaking = true;
      
      const settings = this.state.settings;
      const langCode = settings.language;

      // Attempt to call the FastAPI backend for TTS if connected
      if (this.state.backendConnected) {
        try {
          const response = await fetch('http://localhost:8080/api/tts/speak', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: text,
              language: langCode
            })
          });
          
          if (response.ok) {
            const data = await response.json();
            if (data.audio_url) {
              // Play audio URL from backend
              this.audioElement = new Audio(data.audio_url);
              
              this.audioElement.onplay = () => {
                this.avatar.setAvatarState('TALKING');
              };
              
              this.audioElement.onended = () => {
                this.isSpeaking = false;
                this.avatar.setAvatarState('IDLE');
                resolve();
              };
              
              this.audioElement.onerror = (err) => {
                console.warn("Audio element play error: ", err);
                // Fall back to SpeechSynthesis
                this.runSpeechSynthesisFallback(text, langCode, resolve);
              };
              
              this.audioElement.play();
              return;
            }
          }
        } catch (err) {
          console.warn("FastAPI backend TTS request failed. Falling back to local SpeechSynthesis: ", err);
        }
      }

      // Local SpeechSynthesis Fallback
      this.runSpeechSynthesisFallback(text, langCode, resolve);
    });
  }

  runSpeechSynthesisFallback(text, langCode, resolve) {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      this.currentUtterance = utterance;
      
      // Select voice
      let matchedVoice = null;
      if (langCode.startsWith('th')) {
        matchedVoice = this.voices.find(v => v.lang.includes('TH') || v.lang.includes('th'));
        utterance.pitch = 1.1;
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
        this.avatar.setAvatarState('TALKING');
      };

      utterance.onend = () => {
        this.isSpeaking = false;
        this.avatar.setAvatarState('IDLE');
        resolve();
      };

      utterance.onerror = (e) => {
        console.warn("SpeechSynthesis error: ", e);
        this.isSpeaking = false;
        this.avatar.setAvatarState('IDLE');
        resolve();
      };

      window.speechSynthesis.speak(utterance);
    } else {
      console.warn("SpeechSynthesis not supported on this browser. Running fallback animation.");
      this.runFallbackAudioMock(text, resolve);
    }
  }

  runFallbackAudioMock(text, callback) {
    this.avatar.setAvatarState('TALKING');
    const wordCount = text.split(/\s+/).length;
    const duration = Math.min(Math.max(wordCount * 220 + 800, 1500), 7000);
    
    this.mockSpeakTimeout = setTimeout(() => {
      this.isSpeaking = false;
      this.avatar.setAvatarState('IDLE');
      callback();
    }, duration);
  }

  stopSpeech() {
    this.isSpeaking = false;
    
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement = null;
    }
    
    if (this.mockSpeakTimeout) {
      clearTimeout(this.mockSpeakTimeout);
      this.mockSpeakTimeout = null;
    }
    
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    
    this.avatar.setAvatarState('IDLE');
  }
}
