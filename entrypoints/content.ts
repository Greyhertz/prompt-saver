export default defineContentScript({
  matches: ['*://aistudio.google.com/*'],
  main() {
    const INPUT_SELECTOR = 'div[contenteditable="true"]'; // Your selector

    const syncToStorage = () => {
      const input = document.querySelector(INPUT_SELECTOR);
      // Logic to grab text AND detect file chips
      const fileChips = document.querySelectorAll('.your-file-chip-class'); 
      
      const payload = {
        text: input?.textContent,
        files: Array.from(fileChips).map(chip => chip.textContent),
        timestamp: Date.now(),
      };

      browser.runtime.sendMessage({ type: 'SAVE_DRAFT', payload });
    };

    // Use a MutationObserver to watch for changes
    const observer = new MutationObserver(syncToStorage);
    
    // Start observing when the input exists
    const checkExist = setInterval(() => {
      const target = document.querySelector(INPUT_SELECTOR);
      if (target) {
        observer.observe(target, { childList: true, subtree: true, characterData: true });
        clearInterval(checkExist);
      }
    }, 1000);
  },
});