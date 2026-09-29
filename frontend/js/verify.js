document.addEventListener("DOMContentLoaded", async () => {
  const API_BASE = 'https://meraki-backend-jdl2.onrender.com';
  const API_BASE_URL = 'https://meraki-backend-jdl2.onrender.com';
  const msg = document.getElementById("verifyMessage");
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");

  if (!token) {
    msg.textContent = "❌ Invalid or missing verification token.";
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/auth/verifyEmail?token=${token}`);
    if (res.ok) {
      msg.textContent = "✅ Email verified! Redirecting...";
      // Backend will redirect automatically, or you can force redirect:
      setTimeout(() => (window.location.href = "kyc.html"), 2000);
    } else {
      const data = await res.text();
      msg.textContent = `❌ Verification failed: ${data}`;
    }
  } catch (err) {
    msg.textContent = "⚠️ Network or server error.";
  }
});
