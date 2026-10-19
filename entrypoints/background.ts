import { saveDraft, getDraft } from "@/utils/storage";

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "SAVE_DRAFT") {
      saveDraft("current_draft", message.payload);
    }
    if (message.type === "GET_DRAFT") {
      getDraft("current_draft").then(sendResponse);
      return true;
    }
  });
});