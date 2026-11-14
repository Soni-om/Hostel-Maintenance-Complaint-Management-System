/**
 * HostelCare — Frontend Utility Library
 * Centralized formatting, badge rendering, XSS sanitization, and toast notifications
 */

const Utils = {
  /**
   * Sanitizes user-generated text strings against Cross-Site Scripting (XSS)
   * @param {string} str
   * @returns {string} HTML-escaped string
   */
  escapeHtml(str) {
    if (!str && str !== 0) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  /**
   * Formats ISO timestamp into readable localized date and time string
   * @param {string} dateString
   * @returns {string} Formatted date
   */
  formatDate(dateString) {
    if (!dateString) return '—';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return String(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return String(dateString);
    }
  },

  /**
   * Formats raw bytes into human-readable unit (B, KB, MB)
   * @param {number} bytes
   * @returns {string} Formatted size
   */
  formatFileSize(bytes) {
    const num = Number(bytes);
    if (isNaN(num) || num <= 0) return '0 B';
    if (num < 1024) return `${num} B`;
    if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
    return `${(num / (1024 * 1024)).toFixed(2)} MB`;
  },

  /**
   * Renders standardized status badge using design system tokens
   * @param {string} status Complaint lifecycle status
   * @returns {string} HTML span badge
   */
  renderStatusBadge(status) {
    const raw = (status || 'pending').toLowerCase();
    const normalized = raw.replace(/[\s_]+/g, '');
    const label = raw.replace(/_/g, ' ');
    return `<span class="badge badge-${this.escapeHtml(normalized)}">${this.escapeHtml(label)}</span>`;
  },

  /**
   * Renders standardized priority badge using design system tokens
   * @param {string} priority Complaint priority
   * @returns {string} HTML span badge
   */
  renderPriorityBadge(priority) {
    const raw = (priority || 'normal').toLowerCase().trim();
    return `<span class="badge badge-priority badge-priority-${this.escapeHtml(raw)}">${this.escapeHtml(raw)}</span>`;
  },

  /**
   * Displays non-blocking toast notifications in viewport
   * @param {string} message Toast message
   * @param {string} type 'success' | 'danger' | 'warning' | 'info'
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
        max-width: 380px;
      `;
      document.body.appendChild(toastContainer);
    }

    const toast = document.createElement('div');
    toast.className = `alert alert-${type}`;
    toast.style.cssText = `
      margin-bottom: 0;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.15);
      animation: fadeIn 0.2s ease-in;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    `;
    toast.innerHTML = `
      <span>${this.escapeHtml(message)}</span>
      <button style="background: none; border: none; font-size: 1.1rem; cursor: pointer; color: inherit; opacity: 0.7;" onclick="this.parentElement.remove()">×</button>
    `;

    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4500);
  }
};

if (typeof window !== 'undefined') {
  window.Utils = Utils;
}

export default Utils;
