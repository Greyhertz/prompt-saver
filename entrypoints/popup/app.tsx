import { useState } from "react";
import logo from "@/assets/logo.png";
import "./app.css";

function App() {
  const [activeTab, setActiveTab] = useState<"guide" | "status">("guide");

  return (
    <main className="popup-container">
      <header className="popup-header">
        <div className="logo-group">
          {/* <a href="https://wxt.dev" target="_blank" rel="noreferrer">
            <img src={wxtLogo} className="logo" alt="WXT logo" />
          </a> */}
          <a href="https://react.dev" target="_blank" rel="noreferrer">
            <img src={logo} className="logo" alt="Prompt Saver logo" />
          </a>
        </div>

        <h1>AI Prompt Saver</h1>
        <p>Never lose a prompt or attachment.</p>
      </header>

      <nav className="tabs" aria-label="Navigation">
        <button
          type="button"
          className={activeTab === "guide" ? "tab active" : "tab"}
          onClick={() => setActiveTab("guide")}
        >
          How to Use
        </button>
        <button
          type="button"
          className={activeTab === "status" ? "tab active" : "tab"}
          onClick={() => setActiveTab("status")}
        >
          Status
        </button>
      </nav>

      {activeTab === "guide" ? (
        <section className="guide">
          <div className="guide-item">
            <span className="step-number">1</span>
            <p>
              <strong>Auto-Save</strong>
              <span>Your prompts save as you type in AI Studio.</span>
            </p>
          </div>

          <div className="guide-item">
            <span className="step-number">2</span>
            <p>
              <strong>Save Indicator</strong>
              <span>Look for the ✓ Saved badge on your screen.</span>
            </p>
          </div>

          <div className="guide-item">
            <span className="step-number">3</span>
            <p>
              <strong>Crash Protection</strong>
              <span>Restore drafts after an accidental refresh.</span>
            </p>
          </div>

          <div className="guide-item">
            <span className="step-number">4</span>
            <p>
              <strong>Auto-Clear</strong>
              <span>Sent prompts clear according to your save logic.</span>
            </p>
          </div>
        </section>
      ) : (
        <section className="status-panel">
          <span className="status-indicator" />
          <div>
            <strong>Extension Active</strong>
            <p>Ready to work with AI Studio.</p>
          </div>
        </section>
      )}

      <footer className="popup-footer">
        AI Prompt Saver <span>•</span> WXT + React
      </footer>
    </main>
  );
}

export default App;
