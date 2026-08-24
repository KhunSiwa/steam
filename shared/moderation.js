/**
 * Streamer Support - Shared Moderation System
 */

export class ModerationSystem {
  constructor(stateManager) {
    this.state = stateManager;
  }

  moderateMessage(messageText) {
    const text = messageText.toLowerCase();
    const settings = this.state.settings;
    
    // Parse allowed & forbidden lists
    const forbiddenTopics = settings.forbiddenTopics
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);
      
    const allowedTopics = settings.allowedTopics
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);

    // 1. Toxicity / insult block
    const toxicKeywords = ["spam", "buy viewers", "hack tool", "toxic_insult", "abuse", "shitty", "fuck"];
    const isToxic = toxicKeywords.some(kw => text.includes(kw));

    // 2. Forbidden topics match
    const isForbidden = forbiddenTopics.some(topic => text.includes(topic));

    // 3. Repeated letters spam check
    const isRepeatedSpam = /(.)\1{6,}/.test(text); // e.g. aaaaaaa or helloooooo

    if (isToxic || isForbidden || isRepeatedSpam) {
      return {
        isSafe: false,
        reason: isToxic ? 'Toxicity' : isForbidden ? 'Forbidden Topic' : 'Spam pattern'
      };
    }

    return {
      isSafe: true,
      reason: ''
    };
  }

  checkRelevance(messageText, username) {
    const text = messageText.toLowerCase();
    const settings = this.state.settings;
    const aiNameLower = settings.aiName.toLowerCase();
    
    const allowedTopics = settings.allowedTopics
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);

    // AI responds to:
    // 1. Direct questions containing AI's name or keywords like "streamer", "you", "companion"
    const isDirect = text.includes(aiNameLower) || text.includes("streamer") || text.includes("companion");
    
    // 2. Questions containing question marks or specific question words
    const isQuestion = text.includes("?") || text.includes("เมื่อไหร่") || text.includes("อะไร") || text.includes("ใคร") || text.includes("ทำไม");

    // 3. Allowed topic match
    const matchesAllowedTopic = allowedTopics.length === 0 || allowedTopics.some(topic => text.includes(topic));

    if (isDirect && matchesAllowedTopic) return true;
    if (isQuestion && matchesAllowedTopic) return true;

    // Otherwise, check probability frequency
    const roll = Math.random() * 100;
    return roll < settings.frequency;
  }
}
