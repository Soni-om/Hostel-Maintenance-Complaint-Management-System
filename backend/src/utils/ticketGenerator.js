/**
 * HostelCare — Unique Ticket Number Generator
 * Suffix calculation, timezone standardization, and daily capacity safeguards
 * Format: HC-YYYYMMDD-XXXX (e.g. HC-20261113-0001)
 */

/**
 * Generates an 8-digit date string formatted in Asia/Kolkata (IST, UTC+5:30)
 * @param {Date} [date]
 * @returns {string} YYYYMMDD string
 */
export function getKolkataDateString(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(date).replace(/-/g, '');
}

/**
 * Calculates the next unique ticket number for the current Asia/Kolkata date
 * Inspects all existing tickets for the date, finds highest numeric suffix,
 * and enforces the 9,999 daily cap.
 * 
 * @param {object} connection Active mysql2 connection (inside a transaction)
 * @param {Date} [targetDate]
 * @returns {Promise<string>} Next ticket number e.g. "HC-20261113-0001"
 */
export async function generateNextTicketNumber(connection, targetDate = new Date()) {
  const dateStr = getKolkataDateString(targetDate);
  const pattern = `HC-${dateStr}-%`;

  // Query existing tickets for the current date with row/index locking
  const [rows] = await connection.query(
    'SELECT ticket_number FROM complaints WHERE ticket_number LIKE ? FOR UPDATE',
    [pattern]
  );

  let maxSuffix = 0;
  for (const row of rows) {
    if (typeof row.ticket_number === 'string') {
      const match = row.ticket_number.match(/^HC-\d{8}-(\d{4})$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxSuffix) {
          maxSuffix = num;
        }
      }
    }
  }

  const nextSeq = maxSuffix + 1;

  // Safeguard: Never produce a sequence exceeding 9999 (4 digits)
  if (nextSeq > 9999) {
    const error = new Error(`Daily ticket capacity reached for date ${dateStr}. Maximum 9,999 tickets exceeded.`);
    error.code = 'DAILY_TICKET_LIMIT_EXCEEDED';
    error.statusCode = 503;
    throw error;
  }

  return `HC-${dateStr}-${String(nextSeq).padStart(4, '0')}`;
}

export default {
  getKolkataDateString,
  generateNextTicketNumber
};
