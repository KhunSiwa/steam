/**
 * Streamer Support - Shared Emergency Stop Safety System
 */

import { AppStates } from './state.js';

export class EmergencySystem {
  constructor(stateManager, ttsSystem, chatSystem, avatarEngine, mediaSystem = null) {
    this.state = stateManager;
    this.tts = ttsSystem;
    this.chat = chatSystem;
    this.avatar = avatarEngine;
    this.media = mediaSystem;
  }

  emergencyStop() {
    console.warn("⚠️ EMERGENCY STOP ACTIVATED ⚠️");

    // 1. Stop Speech Synthesis immediately
    this.tts.stopSpeech();

    // 2. Stop active chat simulation / WebSocket updates
    this.chat.disconnectChat();

    // 3. Clear AI activity and pipelines
    const pipelinePanel = document.getElementById('ai-processing-panel');
    if (pipelinePanel) {
      pipelinePanel.style.display = 'none';
    }

    // 4. Force system state to STOPPED
    this.state.setMode(AppStates.STOPPED);

    // 5. De-activate automatic chat response flags
    this.state.updateSettings({ autoReplies: false });

    // 6. Reset Avatar to stopped/sad state
    this.avatar.setAvatarState('STOPPED');

    // 7. System notification to chat log
    this.chat.appendSystemMessage("⚠️ EMERGENCY STOP INITIATED. ALL AI GENERATIONS SHUT DOWN. AUTOMATIC CHAT REPLIES DISABLED.");
  }
}
