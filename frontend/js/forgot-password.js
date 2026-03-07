// forgot-password.js — Request password reset link
document.addEventListener("DOMContentLoaded", () => {
  const API_BASE = 'http://localhost:5000';
  const API_BASE_URL = 'http://localhost:5000';

  const form = document.getElementById("forgotForm");
  const btn = document.getElementById("forgotBtn");
  const statusMsg = document.getElementById("statusMsg");

  function showStatus(msg, type) {
    statusMsg.textContent = msg;
    statusMsg.className = `status-msg ${type}`;
  }

  function setLoading(loading) {
    btn.disabled = loading;
    btn.classList.toggle("loading", loading);
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("forgotEmail").value.trim();
    if (!email) {
      showStatus("Please enter your email address.", "error");
      return;
    }

    setLoading(true);
    showStatus("", "");

    try {
      const res = await fetch(`${API_BASE}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        showStatus(data.error || "Something went wrong. Please try again.", "error");
        setLoading(false);
        return;
      }

      showStatus(data.message || "If an account exists, a reset link has been sent to your email.", "success");
      setLoading(false);
    } catch (err) {
      showStatus("Network error. Please check your connection and try again.", "error");
      setLoading(false);
    }
  });
});
