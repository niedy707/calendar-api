/**
 * Categorizes calendar events into surgery, checkup, appointment, or blocked
 * @param title - Event title
 * @param color - Event color (hex)
 * @param start - Event start time (optional)
 * @param end - Event end time (optional)
 * @returns Event category
 */
export function categorizeEvent(
    title: string,
    color?: string,
    start?: Date | string,
    end?: Date | string
): 'surgery' | 'checkup' | 'appointment' | 'blocked' | 'ignore' {
    const lowerTitle = title.toLowerCase();
    const turkishLowerTitle = title.toLocaleLowerCase('tr-TR');

    // BLOCKED: Occupies the calendar but is not a patient event (Busy)
    // Priority 1: Check blocked keywords regardless of color
    // Criteria: starts with xxx, izin, kongre, toplantı, off, yokum, cumartesi, pazar
    const blockedKeywords = ['xxx', 'izin', 'kongre', 'toplantı', 'off', 'yokum', 'cumartesi', 'pazar'];

    if (blockedKeywords.some(keyword => turkishLowerTitle.includes(keyword))) {
        return 'blocked';
    }

    // IGNORE: Red events, or explicit ignore keywords
    // Priority 2: Check Ignore criteria
    // Criteria: red color, or starts with prefixes, OR contains specific ignored phrases
    if (color === '#dc2127' || color === '#DC2127' || color === '11') {
        return 'ignore';
    }

    const ignorePrefixes = ['ipt', 'ert', 'iptal', 'ertelendi', 'bilgi', 'ℹ️', 'ℹ'];
    if (ignorePrefixes.some(prefix => turkishLowerTitle.startsWith(prefix))) {
        return 'ignore';
    }

    // Moved from blocked to ignore list per user request
    const ignoreKeywords = ['hasta görebiliriz', 'hasta görme', 'hasta görelim', 'çıkış', 'yok', 'gitmem', 'vizite'];
    if (ignoreKeywords.some(keyword => turkishLowerTitle.includes(keyword))) {
        return 'ignore';
    }

    // SURGERY: starts with 🔪 OR HH:MM/HH.MM time format
    // BUT exclude if it's a time-based appointment note (e.g., "07:15 muayene")
    if (title.includes('🔪') || turkishLowerTitle.includes('ameliyat') || turkishLowerTitle.includes('surgery')) {
        return 'surgery';
    }

    if (/^\d{1,2}[:.]\d{2}/.test(title)) {
        // If starts with time but contains "muayene", it's an appointment note, not surgery
        if (turkishLowerTitle.includes('muayene')) {
            return 'appointment'; // Treated as appointment/exam
        }
        return 'surgery';
    }

    // SURGERY: Duration-based check - if event is 60+ minutes, it's likely a surgery
    if (start && end) {
        const startDate = typeof start === 'string' ? new Date(start) : start;
        const endDate = typeof end === 'string' ? new Date(end) : end;
        const durationMinutes = (endDate.getTime() - startDate.getTime()) / (1000 * 60);

        if (durationMinutes >= 60) {
            if (!turkishLowerTitle.includes('kontrol') && !turkishLowerTitle.includes('muayene')) {
                return 'surgery';
            }
        }
    }

    // CHECKUP: k, k1, k2, or patterns like "1m ", "3m ", "1.5m " (with space after)
    if (/^[kK]\d?/.test(title) || /^\d+\.?\d*m\s/.test(lowerTitle) || turkishLowerTitle.includes('kontrol')) {
        return 'checkup';
    }

    // APPOINTMENT: m or op prefix, or contains 'online'
    if (/^[mM]\s/.test(title) || /^op\s/i.test(title) || lowerTitle.includes('online') || turkishLowerTitle.includes('muayene') || turkishLowerTitle.includes('exam')) {
        return 'appointment';
    }

    // Default to appointment
    return 'appointment';
}
