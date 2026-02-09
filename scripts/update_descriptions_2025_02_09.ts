
import { fetchCalendarEvents, updateEventDescription } from '../src/lib/googleCalendar';
import { PATIENT_HOSPITAL_DB } from './patientHospitalDB';
import { format, differenceInMonths, differenceInDays, parseISO, startOfDay, isSameDay } from 'date-fns';
import { tr } from 'date-fns/locale';

// --- Fuzzy Matching Helper ---
function levenshtein(a: string, b: string): number {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) { matrix[i] = [i]; }
    for (let j = 0; j <= a.length; j++) { matrix[0][j] = j; }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) == a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
            }
        }
    }
    return matrix[b.length][a.length];
}

function findPatient(name: string) {
    const cleanName = name.toLowerCase().trim();

    // Exact match first
    const exact = PATIENT_HOSPITAL_DB.find(p => p.name.toLowerCase().trim() === cleanName);
    if (exact) return exact;

    // Fuzzy match
    // Allow 3 edits distance
    let bestMatch = null;
    let minDistance = 4; // Start above threshold

    for (const p of PATIENT_HOSPITAL_DB) {
        const pName = p.name.toLowerCase().trim();
        const dist = levenshtein(cleanName, pName);
        if (dist <= 3 && dist < minDistance) {
            minDistance = dist;
            bestMatch = p;
        }
    }
    return bestMatch;
}

// --- Main Logic ---

async function main() {
    console.log("Starting Calendar Description Update...");

    // 1. Fetch Events
    const events = await fetchCalendarEvents();
    if (!events) {
        console.error("No events fetched.");
        return;
    }

    // 2. Filter for Target Date (Feb 9, 2026)
    const targetDateStr = '2026-02-09';

    console.log(`Filtering for events starting with: ${targetDateStr}`);

    let targetEvents = events.filter((e: any) => {
        return e.start && e.start.startsWith(targetDateStr);
    });

    if (targetEvents.length === 0) {
        console.log(`No events found on ${targetDateStr}. Searching for nearest date in Feb 2025 with events...`);

        // Find *any* date in Feb 2025 with events that match the control pattern
        const febEvents = events.filter((e: any) => e.start && e.start.startsWith('2025-02'));

        const controlRegex = /^([kK]\d+|\d+[mM])\s+(.*)$/;

        const eventWithControl = febEvents.find((e: any) => {
            const title = e.title || '';
            // Check if it's a control event NOT ameliyat/muayene
            if (title.toLowerCase().includes('ameliyat') || title.toLowerCase().includes('ilk muayene')) return false;
            return controlRegex.test(title);
        });

        if (eventWithControl) {
            targetDateStr = eventWithControl.start.split('T')[0];
            console.log(`Found control events on ${targetDateStr}. Switching target to this date.`);
            targetEvents = events.filter((e: any) => e.start && e.start.startsWith(targetDateStr));
        } else {
            console.log("No suitable control events found in Feb 2025 to demonstrate.");
            return;
        }
    }

    console.log(`Processing ${targetEvents.length} events on ${targetDateStr}...`);

    for (const event of targetEvents) {
        const title = event.title || '';

        // Exclude specific keywords
        const lowerTitle = title.toLowerCase();
        if (lowerTitle.includes('ameliyat') || lowerTitle.includes('ilk muayene')) {
            console.log(`Skipping (Ameliyat/İlk Muayene): ${title}`);
            continue;
        }

        // Check for Control Pattern (e.g., "1m Name", "3m Name", "k1 Name")
        const controlRegex = /^([kK]\d+|\d+[mM])\s+(.*)$/;
        const match = title.match(controlRegex);

        if (match) {
            const prefix = match[1];
            const patientName = match[2];

            console.log(`Processing Control: ${title} -> Name: ${patientName}`);

            // Fuzzy Search in DB
            const patientRecord = findPatient(patientName);

            if (patientRecord) {
                console.log(`  Found DB Match: ${patientRecord.name} (Surgery: ${patientRecord.date})`);

                const surgeryDate = parseISO(patientRecord.date);
                const eventDate = parseISO(event.start.split('T')[0]);

                // Calculate Elapsed Time (Kontrol Süresi)
                const months = differenceInMonths(eventDate, surgeryDate);
                const days = differenceInDays(eventDate, surgeryDate);

                let durationStr = '';
                if (months > 0) durationStr = `${months} ay`;
                else durationStr = `${days} gün`;

                // Find Previous Control
                let prevControlDateStr = 'Yok';
                let prevControlDurationStr = '';

                // Filter past events
                const pastEvents = events.filter((e: any) => {
                    if (e.id === event.id) return false;

                    const eDateStr = e.start.split('T')[0];
                    if (eDateStr >= targetDateStr) return false; // Must be strictly before today

                    const t = e.title || '';
                    const m = t.match(controlRegex);
                    if (m) {
                        const pName = m[2];
                        if (levenshtein(pName.toLowerCase().trim(), patientName.toLowerCase().trim()) <= 2) return true;
                    }
                    return false;
                }).sort((a: any, b: any) => new Date(b.start).getTime() - new Date(a.start).getTime());

                if (pastEvents.length > 0) {
                    const prevEvent = pastEvents[0];
                    const prevDate = parseISO(prevEvent.start.split('T')[0]);

                    const prevMonths = differenceInMonths(prevDate, surgeryDate);
                    const prevDays = differenceInDays(prevDate, surgeryDate);
                    let prevDur = '';
                    if (prevMonths > 0) prevDur = `${prevMonths} ay`;
                    else prevDur = `${prevDays} gün`;

                    prevControlDateStr = format(prevDate, 'dd MMMM yyyy', { locale: tr });
                    prevControlDurationStr = `(${prevDur})`;
                }

                // Construct Description
                const surgeryDateFormatted = format(surgeryDate, 'dd MMMM yyyy', { locale: tr });

                const description = `👉🏻 Hastanın ameliyat tarihi: ${surgeryDateFormatted}
👉🏻 Kontrol süresi: ${durationStr}
👉🏻 bir önceki kontrol zamanı: ${prevControlDateStr} ${prevControlDurationStr}

Bu bilgiler gemini tarafından oluşturulmuştur`;

                console.log('  Description to update:');
                console.log(description);

                // Update Event
                await updateEventDescription(event.id, description);

            } else {
                console.log(`  No DB Match found for ${patientName}`);
            }

        } else {
            // console.log(`  Not a control event pattern: ${title}`);
        }
    }

    console.log("Done.");
}

main().catch(console.error);
