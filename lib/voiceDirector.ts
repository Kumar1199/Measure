class VoiceDirector {
  enabled = true;
  private last = "";
  private lastTime = 0;
  speak(text: string, force = false) {
    if (
      !this.enabled ||
      typeof window === "undefined" ||
      !("speechSynthesis" in window)
    )
      return;
    const now = Date.now();
    if (
      !force &&
      (now - this.lastTime < 4500 ||
        (text === this.last && now - this.lastTime < 12000))
    )
      return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.lang = "en-US";
    window.speechSynthesis.speak(utterance);
    this.last = text;
    this.lastTime = now;
  }
  stop() {
    if (typeof window !== "undefined" && "speechSynthesis" in window)
      window.speechSynthesis.cancel();
  }
}
export const voiceDirector = new VoiceDirector();
