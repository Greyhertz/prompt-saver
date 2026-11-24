import { useState, useEffect } from "react";
import logo from "@/assets/logo.png";
import "./app.css";
import { getExtensionEnabled, setExtensionEnabled } from "@/storage/drafts";

function App() {
  const [activeTab, setActiveTab] = useState<"guide" | "status">("guide");
  const [isEnabled, setIsEnabled] = useState<boolean>(true);

  // Load state on mount
  useEffect(() => {
    getExtensionEnabled().then((status) => {
      setIsEnabled(status);
    });
  }, []);

  // Handle toggle change
  const handleToggle = async () => {
    const newState = !isEnabled;
    setIsEnabled(newState);
    await setExtensionEnabled(newState);
  };

  return (
    <main className="popup-container">
      <header className="popup-header">
        <div className="logo-group">
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
          Status & Settings
        </button>
      </nav>

      {activeTab === "guide" ? (
        <section className="guide">
          <div className="guide-item">
            <span className="step-number">1</span>
            <p>
              <strong>Auto-Save</strong>
              <span>Your prompts save as you type</span>
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
        <section style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '4px' }}>
          <div className="status-panel" style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '10px', borderRadius: '7px' }}>
            <span className="status-indicator" style={{ backgroundColor: isEnabled ? '#22a06b' : '#ef4444' }} />
            <div>
              <strong style={{ fontSize: '11px' }}>{isEnabled ? 'Extension Active' : 'Extension Paused'}</strong>
              <p style={{ fontSize: '10px', margin: '2px 0 0 0' }}>
                {isEnabled ? 'Actively protecting your drafts.' : 'Auto-save is turned off.'}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'light-dark(#fafafa, #252525)', border: '1px solid light-dark(#e5e5e5, #333)', borderRadius: '7px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600 }}>Enable Auto-Save</span>
            <button
              type="button"
              role="switch"
              aria-checked={isEnabled}
              onClick={handleToggle}
              className={`prompt-switch ${isEnabled ? 'checked' : ''}`}
            >
              <span className="prompt-switch-thumb" />
            </button>
          </div>
        </section>
      )}

      <footer className="popup-footer">
        AI Prompt Saver <span>•</span> WXT + React
      </footer>
    </main>
  );
}

export default App; // (Keep your export default App line as it was)