/**
 * HostelCare — Frontend Utility Library
 */

const Utils = {
  /**
   * Format ISO date string to human-friendly local format
   */
  formatDate(dateString) {
    if (!dateString) return '—';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  },

  /**
   * Render HTML Status Badge
   */
  renderStatusBadge(status) {
    const normalized = (status || 'pending').toLowerCase().replace(/\s+/g, '');
    return `<span class="badge badge-${normalized}">${status}</span>`;
  },

  /**
   * Toast notification system
   */
  showToast(message, type = 'info') {
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'toast-container';
      toastContainer.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-width: 360px;
      `;
      document.body.appendChild(toastContainer);
    }

    const toast = document.createElement('div');
    toast.className = `alert alert-${type}`;
    toast.style.cssText = `
      margin-bottom: 0;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      animation: fadeIn 0.2s ease-in;
    `;
    toast.textContent = message;

    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }
};

