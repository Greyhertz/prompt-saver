const SaveStatus = ({ status }: { status: "saving" | "saved" | "idle" }) => {
  return (
    <button
      style={{
        backgroundColor: "black",
        position: "absolute",
        width: "80px",
        right: "10px",
        top: "10px",
        fontSize: "12px",
        border: "none",
        borderRadius: "4px",
        padding: "4px 8px",
        color: status === "saved" ? "green" : "gray",
        pointerEvents: "none",
      }}
    >
      {status === "saved" ? "✓ Saved" : status === "saving" ? "Saving..." : ""}
    </button>
  );
};

export default SaveStatus;
