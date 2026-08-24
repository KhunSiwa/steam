/**
 * Streamer Support - Shared Chat & Pipeline Manager
 */

export class ChatSystem {
  constructor(stateManager, moderationSystem, aiSystem, ttsSystem, avatarEngine) {
    this.state = stateManager;
    this.moderation = moderationSystem;
    this.ai = aiSystem;
    this.tts = ttsSystem;
    this.avatar = avatarEngine;
    
    this.chatLogElement = null;
    this.ws = null;
    this.simInterval = null;
    
    // Message queue for priority processing
    this.messageQueue = [];
    
    this.simUsers = [
      { user: "SpeedyGamer", text: "Aura, what is the creator stream schedule tomorrow?", role: "sub" },
      { user: "ModSlayer", text: "Focus up chat, game is getting intense!", role: "mod" },
      { user: "KeyboardWarrior", text: "Hey Aura, what mechanical switches are on the keyboard?", role: "general" },
      { user: "CoffeeLover", text: "Nice stream, drinking some dark roast right now.", role: "sub" },
      { user: "BitcoinBroker", text: "AURA, should I invest in Crypto now? Is Bitcoin safe?", role: "general" }, // forbidden
      { user: "ToxicHater", text: "This speedrun is toxic trash spam spam spam", role: "general" }, // toxic
      { user: "ThaiRetro", text: "สวัสดีครับออร่า อยากรู้ประวัติของสตรีมเมอร์ครับ", role: "general" },
      { user: "CasualObserver", text: "What game is this?", role: "general" }
    ];
  }

  mount(chatLogId) {
    this.chatLogElement = document.getElementById(chatLogId);
    this.appendSystemMessage("Chat console ready.");
  }

  connectChat(url = 'ws://localhost:8080/ws/chat') {
    this.disconnectChat();

    if (this.state.backendConnected) {
      try {
        this.ws = new WebSocket(url);
        
        this.ws.onopen = () => {
          this.appendSystemMessage("Connected to FastAPI WebSocket chat server.");
        };
        
        this.ws.onmessage = (event) => {
          const data = JSON.parse(event.data);
          this.receiveMessage(data.username, data.message, data.role || 'general');
        };
        
        this.ws.onclose = () => {
          this.appendSystemMessage("WebSocket closed. Re-routing to local chat simulator.");
          this.startLocalSimulation();
        };

        this.ws.onerror = (err) => {
          console.warn("WebSocket error: ", err);
          this.startLocalSimulation();
        };
        return;
      } catch (err) {
        console.warn("WebSocket connection failed. Falling back to simulator: ", err);
      }
    }

    this.startLocalSimulation();
  }

  disconnectChat() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.simInterval) {
      clearInterval(this.simInterval);
      this.simInterval = null;
    }
  }

  startLocalSimulation() {
    this.appendSystemMessage("Simulating live stream chat...");
    this.simInterval = setInterval(() => {
      if (this.state.currentMode === 'STOPPED') return;
      
      const randMsg = this.simUsers[Math.floor(Math.random() * this.simUsers.length)];
      this.receiveMessage(randMsg.user, randMsg.text, randMsg.role);
    }, 4500);
  }

  receiveMessage(username, text, role = 'general') {
    if (!this.chatLogElement) return;

    // RENDER USER MESSAGE
    const msgNode = document.createElement('div');
    msgNode.className = `chat-message`;
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    let badges = '';
    if (role === 'mod') badges += `<span class="chat-badge mod">Mod</span> `;
    if (role === 'sub') badges += `<span class="chat-badge sub">Sub</span> `;

    msgNode.innerHTML = `
      <div class="chat-meta">
        ${badges}
        <span class="chat-user">${username}</span>
        <span class="chat-time">${timestamp}</span>
      </div>
      <p class="chat-body">${this.escapeHTML(text)}</p>
    `;
    this.chatLogElement.appendChild(msgNode);
    this.scrollToBottom();

    // Trigger pipeline if in AWAY mode and auto replies are enabled
    if (this.state.currentMode === 'AWAY' && this.state.settings.autoReplies) {
      this.processResponsePipeline(text, username, role, msgNode);
    }
  }

  async processResponsePipeline(messageText, username, role, msgNode) {
    const pipelinePanel = document.getElementById('ai-processing-panel');
    const targetMsg = document.getElementById('ai-target-message');
    const stepMod = document.getElementById('step-mod');
    const stepRel = document.getElementById('step-rel');
    const stepGen = document.getElementById('step-gen');
    const stepVal = document.getElementById('step-val');
    const stepTts = document.getElementById('step-tts');
    
    if (pipelinePanel) {
      pipelinePanel.style.display = 'flex';
      targetMsg.style.display = 'block';
      targetMsg.querySelector('.context-body').textContent = `"${messageText}"`;
      
      // Reset checklist states
      const steps = [stepMod, stepRel, stepGen, stepVal, stepTts];
      steps.forEach(s => s.className = 'pending');
    }

    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

    // --- STEP 1: Moderation ---
    this.avatar.setAvatarState('THINKING');
    this.avatar.svg?.classList.add('ai-active');
    
    if (stepMod) stepMod.className = 'active';
    await delay(600);
    const modResult = this.moderation.moderateMessage(messageText);
    
    if (!modResult.isSafe) {
      if (stepMod) stepMod.className = 'error';
      msgNode.classList.add('flagged');
      msgNode.setAttribute('title', `Blocked: ${modResult.reason}`);
      await delay(1200);
      if (pipelinePanel) pipelinePanel.style.display = 'none';
      this.avatar.svg?.classList.remove('ai-active');
      this.avatar.setAvatarState('IDLE');
      return;
    }
    if (stepMod) stepMod.className = 'done';

    // --- STEP 2: Relevance ---
    if (stepRel) stepRel.className = 'active';
    await delay(500);
    const shouldRespond = this.moderation.checkRelevance(messageText, username);
    
    if (!shouldRespond) {
      if (stepRel) stepRel.className = 'error';
      await delay(1000);
      if (pipelinePanel) pipelinePanel.style.display = 'none';
      this.avatar.svg?.classList.remove('ai-active');
      this.avatar.setAvatarState('IDLE');
      return;
    }
    if (stepRel) stepRel.className = 'done';

    // --- STEP 3: Generation ---
    if (stepGen) stepGen.className = 'active';
    const responseText = await this.ai.generateAIResponse(messageText, username, role);
    if (stepGen) stepGen.className = 'done';

    // --- STEP 4: Validation ---
    if (stepVal) stepVal.className = 'active';
    await delay(500);
    const isValid = this.ai.validateAIResponse(responseText);
    
    if (!isValid) {
      if (stepVal) stepVal.className = 'error';
      this.appendSystemMessage("AI Response blocked by safety rules.");
      await delay(1500);
      if (pipelinePanel) pipelinePanel.style.display = 'none';
      this.avatar.svg?.classList.remove('ai-active');
      this.avatar.setAvatarState('IDLE');
      return;
    }
    if (stepVal) stepVal.className = 'done';

    // --- STEP 5: TTS Speech & LipSync ---
    if (stepTts) stepTts.className = 'active';
    msgNode.classList.add('answered');
    
    await this.tts.generateSpeech(responseText);
    if (stepTts) stepTts.className = 'done';

    // Display AI response
    this.appendAIResponse(responseText);
    
    // Clean up
    await delay(500);
    if (pipelinePanel) pipelinePanel.style.display = 'none';
    this.avatar.svg?.classList.remove('ai-active');
  }

  appendAIResponse(text) {
    if (!this.chatLogElement) return;
    
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const msgNode = document.createElement('div');
    msgNode.className = `chat-message`;
    
    msgNode.innerHTML = `
      <div class="chat-meta">
        <span class="chat-badge ai-response">AI Companion</span>
        <span class="chat-user" style="color: #10b981;">${this.state.settings.aiName}</span>
        <span class="chat-time">${timestamp}</span>
      </div>
      <p class="chat-body">${this.escapeHTML(text)}</p>
    `;
    this.chatLogElement.appendChild(msgNode);
    this.scrollToBottom();
  }

  appendSystemMessage(text) {
    if (!this.chatLogElement) return;
    const node = document.createElement('div');
    node.className = 'chat-system-message';
    node.textContent = text;
    this.chatLogElement.appendChild(node);
    this.scrollToBottom();
  }

  scrollToBottom() {
    if (this.chatLogElement) {
      this.chatLogElement.scrollTop = this.chatLogElement.scrollHeight;
    }
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
