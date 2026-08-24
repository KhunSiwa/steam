/**
 * Streamer Support - Shared AI System
 */

export class AISystem {
  constructor(stateManager) {
    this.state = stateManager;
    this.status = 'Idle'; // 'Idle', 'Thinking', 'Generating', 'Stopped'
  }

  getAIStatus() {
    return this.status;
  }

  setAIPersona(personaSettings) {
    this.state.updateSettings(personaSettings);
  }

  async generateAIResponse(messageText, username, role = 'general') {
    this.status = 'Thinking';
    const settings = this.state.settings;
    const isThai = settings.language.startsWith('th');
    
    // Formulate local context
    const context = {
      aiName: settings.aiName,
      personality: settings.personality,
      tone: settings.tone,
      language: settings.language,
      responseLength: settings.responseLength,
      allowedTopics: settings.allowedTopics,
      forbiddenTopics: settings.forbiddenTopics,
      customInstructions: settings.customInstructions,
      knCreator: settings.knCreator,
      knSchedule: settings.knSchedule,
      knFaq: settings.knFaq
    };

    // Attempt to call the FastAPI backend if connected
    if (this.state.backendConnected) {
      try {
        this.status = 'Generating';
        const response = await fetch('http://localhost:8080/api/ai/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: messageText,
            username: username,
            role: role,
            context: context
          })
        });
        
        if (response.ok) {
          const data = await response.json();
          this.status = 'Idle';
          return data.response;
        }
      } catch (err) {
        console.warn("FastAPI backend AI request failed. Falling back to local generation: ", err);
      }
    }

    // --- LOCAL FALLBACK GENERATOR ---
    this.status = 'Generating';
    
    // Add artificial delay matching settings
    const delayDuration = Math.max(settings.delay * 1000, 500);
    await new Promise(resolve => setTimeout(resolve, delayDuration));

    const text = messageText.toLowerCase();
    let matchedAnswer = null;

    if (text.includes("schedule") || text.includes("ตาราง") || text.includes("สตรีมเมื่อไหร่") || text.includes("stream tomorrow")) {
      matchedAnswer = isThai 
        ? `ตารางสตรีมของสตรีมเมอร์คือ: ${settings.knSchedule} ครับผม!`
        : `Creator's stream schedule: ${settings.knSchedule}! Hope to see you there!`;
    } else if (text.includes("keyboard") || text.includes("คีย์บอร์ด") || text.includes("สวิตช์") || text.includes("switch")) {
      matchedAnswer = isThai
        ? `สตรีมเมอร์ใช้คีย์บอร์ดกลไกที่มี ${settings.knFaq} ครับ กดสนุกพิมพ์งานฟินมาก!`
        : `Antigravity uses a mechanical keyboard with ${settings.knFaq}!`;
    } else if (text.includes("game") || text.includes("เกมโปรด") || text.includes("favorite game") || text.includes("เล่นเกมอะไร")) {
      matchedAnswer = isThai
        ? `เกมโปรดของสตรีมเมอร์คือ Hades และ Chrono Trigger ครับ! กำลังลุยสปีดรันอยู่นะ`
        : `The creator's favorite games are Hades and Chrono Trigger! Speedruns are intense!`;
    } else if (text.includes("who is") || text.includes("คือใคร") || text.includes("about") || text.includes("เกี่ยวกับ")) {
      matchedAnswer = isThai
        ? `เกี่ยวกับสตรีมเมอร์: ${settings.knCreator}`
        : `About the creator: ${settings.knCreator}`;
    } else if (text.includes("are you the real") || text.includes("ใช่ตัวจริง") || text.includes("impersonate") || text.includes("ตัวจริงไหม")) {
      matchedAnswer = isThai
        ? `ไม่ใช่ครับผม! ผมคือ ${settings.aiName} ผู้ช่วย AI อัจฉริยะ ตัวจริงไม่อยู่ชั่วคราวครับ!`
        : `No, I'm ${settings.aiName}, the AI stream companion! The real creator is temporarily away.`;
    }

    // Default conversational responses
    if (!matchedAnswer) {
      if (isThai) {
        if (text.includes("หวัดดี") || text.includes("สวัสดี") || text.includes("hello") || text.includes("hi")) {
          matchedAnswer = `สวัสดีครับคุณ @${username}! ยินดีต้อนรับสู่สตรีมครับ! มีเรื่องคุยกันได้นะ`;
        } else {
          matchedAnswer = `น่าสนใจมากครับคุณ @${username}! สตรีมเมอร์ตัวจริงไม่อยู่ แต่ผมยังอยู่เฝ้าสตรีมให้ครับ!`;
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

    if (settings.tone === 'energetic') {
      finalResponse = isThai 
        ? `🔥 ${finalResponse.toUpperCase()} ยินดีต้อนรับทุกคนครับ สู้ๆ! ✨`
        : `🔥 ${finalResponse} Let's GO! Hype! 🎮✨`;
    } else if (settings.tone === 'professional') {
      finalResponse = isThai
        ? `สวัสดีคุณ @${username} ขอเรียนให้ทราบว่า ${finalResponse}`
        : `Greetings @${username}. Please note that ${finalResponse}`;
    } else if (settings.tone === 'friendly') {
      finalResponse = isThai
        ? `ยินดีต้อนรับคุณ @${username} เสมอครับ 😊 ${finalResponse}`
        : `Welcome @${username}! 😊 ${finalResponse}`;
    }

    // Length constraint
    const words = finalResponse.split(/\s+/);
    if (settings.responseLength === 'short' && words.length > 15) {
      finalResponse = words.slice(0, 15).join(" ") + "...";
    } else if (settings.responseLength === 'medium' && words.length > 30) {
      finalResponse = words.slice(0, 30).join(" ") + "...";
    }

    this.status = 'Idle';
    return finalResponse;
  }

  validateAIResponse(responseText) {
    const text = responseText.toLowerCase();
    
    // Safety Rule 1: Never claim to be the real streamer
    const claimsStreamer = text.includes("i am antigravity") || text.includes("ผมคือ antigravity") || text.includes("i am the real streamer");
    
    // Safety Rule 2: Medical, financial, legal advice block
    const claimsFinancial = text.includes("financial advice") || text.includes("buy bitcoin") || text.includes("invest in") || text.includes("crypto");
    const claimsMedical = text.includes("diagnose") || text.includes("take this pill") || text.includes("medical condition") || text.includes("sore throat");

    if (claimsStreamer || claimsFinancial || claimsMedical) {
      return false; // Fails validation
    }
    
    return true; // Validated
  }
}
