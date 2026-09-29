// reset-password.js — Set new password using token from email link
document.addEventListener("DOMContentLoaded", () => {
  const API_BASE = 'https://meraki-backend-jdl2.onrender.com';
  const API_BASE_URL = 'https://meraki-backend-jdl2.onrender.com';

  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  const email = params.get("email");

  const form = document.getElementById("resetForm");
  const btn = document.getElementById("resetBtn");
  const statusMsg = document.getElementById("statusMsg");
  const formBox = document.getElementById("resetFormBox");
  const invalidBox = document.getElementById("invalidLinkBox");

  function showStatus(msg, type) {
    if (!statusMsg) return;
    statusMsg.textContent = msg;
    statusMsg.className = `status-msg ${type}`;
  }

  function setLoading(loading) {
    if (btn) {
      btn.disabled = loading;
      btn.classList.toggle("loading", loading);
    }
  }

  // Missing or invalid link
  if (!token || !email) {
    if (formBox) formBox.style.display = "none";
    if (invalidBox) invalidBox.style.display = "block";
    return;
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const password = document.getElementById("newPassword").value;
      const confirmPassword = document.getElementById("confirmPassword").value;

      if (!password || !confirmPassword) {
        showStatus("Please fill in both password fields.", "error");
        return;
      }
      if (password.length < 6) {
        showStatus("Password must be at least 6 characters.", "error");
        return;
      }
      if (password !== confirmPassword) {
        showStatus("Passwords do not match.", "error");
        return;
      }

      setLoading(true);
      showStatus("", "");

      try {
        const res = await fetch(`${API_BASE}/api/auth/reset-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, token, password }),
        });

        const data = await res.json();

        if (!res.ok) {
          showStatus(data.error || "Failed to reset password. The link may have expired.", "error");
          setLoading(false);
          return;
        }

        showStatus(data.message || "Password reset! Redirecting to login…", "success");
        setLoading(false);

        setTimeout(() => {
          window.location.href = "login.html";
        }, 2000);
      } catch (err) {
        showStatus("Network error. Please try again.", "error");
        setLoading(false);
      }
    });
  }
});
