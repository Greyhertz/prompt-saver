import { saveDraft, getDraft } from '@/utils/storage';

// Listen for messages from the content script
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SAVE_DRAFT') {
    saveDraft('current_draft', message.payload);
    console.log('Draft saved to IndexedDB');
  }
  
  if (message.type === 'GET_DRAFT') {
    getDraft('current_draft').then(sendResponse);
    return true; // Indicates async response
  }
});