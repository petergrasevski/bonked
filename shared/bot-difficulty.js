// Room choices and resolved per-driver levels are deliberately separate: Mixed is
// rolled once on assignment, so bots keep their skill through tournament rounds.
export const BOT_DIFFICULTIES = Object.freeze(['easy', 'medium', 'hard']);
export const BOT_DIFFICULTY_MODES = Object.freeze([...BOT_DIFFICULTIES, 'mixed']);
export const normalizeBotDifficulty = (value) =>
  BOT_DIFFICULTIES.includes(value) ? value : 'medium';
export function assignBotDifficulty(mode, random = Math.random) {
  return mode === 'mixed'
    ? BOT_DIFFICULTIES[Math.min(2, Math.max(0, Math.floor(random() * 3)))]
    : normalizeBotDifficulty(mode);
}
