document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('open');
  if (!btn) return;
  btn.addEventListener('click', () => {
    try {
      chrome.runtime.openOptionsPage(() => { window.close(); });
    } catch (e) {
      // Fallback if callback form isn't supported for some reason
      location.href = 'options.html';
    }
  });
});