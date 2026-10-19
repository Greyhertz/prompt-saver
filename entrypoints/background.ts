import { saveDraft, getDraft, deleteDraft } from "@/utils/storage";

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "SAVE_DRAFT") {
      saveDraft("current_draft", message.payload);
    }
    if (message.type === "GET_DRAFT") {
      getDraft("current_draft").then(sendResponse);
      return true;
    }
    if (message.type === "DELETE_DRAFT") {
      deleteDraft("current_draft");
    }
  });
});
