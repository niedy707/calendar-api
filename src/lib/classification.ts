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

    // Calculate duration in minutes if start/end exist
    let durationMinutes = 0;
    if (start && end) {
        const startDate = typeof start === 'string' ? new Date(start) : start;
        const endDate = typeof end === 'string' ? new Date(end) : end;
        durationMinutes = (endDate.getTime() - startDate.getTime()) / (1000 * 60);
    }

    // SURGERY LOGIC
    // Constraint: MUST be >= 45 minutes to be a surgery.
    const isSurgeryCandidate =
        title.includes('🔪') ||
        turkishLowerTitle.includes('ameliyat') ||
        turkishLowerTitle.includes('surgery') ||
        (/^\d{1,2}[:.]\d{2}/.test(title) && !turkishLowerTitle.includes('muayene')); // Time pattern check

    if (isSurgeryCandidate) {
        if (durationMinutes >= 45) {
            return 'surgery';
        } else {
            // Even if it says "Ameliyat", if it's 30 mins, treat as appointment per user rule
            return 'appointment';
        }
    }

    // Implicit Surgery by Duration (>= 60 mins)
    // Only if it doesn't look like a control/exam
    if (durationMinutes >= 60) {
        if (!turkishLowerTitle.includes('kontrol') && !turkishLowerTitle.includes('muayene')) {
            return 'surgery';
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
