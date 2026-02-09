
import { fetchCalendarEvents } from '../src/lib/googleCalendar';
import { format } from 'date-fns';

async function main() {
    console.log("Checking for automated descriptions...");
    try {
        const events = await fetchCalendarEvents();
        if (!events) {
            console.log("No events found.");
            return;
        }

        // Target Date: Today (Turkey Time) - 2026-02-10
        const targetDateStr = '2026-02-10';
        console.log(`Targeting date: ${targetDateStr}`);

        const targetEvents = events.filter((e: any) => e.start && e.start.startsWith(targetDateStr));
        console.log(`Found ${targetEvents.length} events for today.`);

        let foundAutomation = false;

        for (const event of targetEvents) {
            const title = event.title || '';
            // Check if it's a control event roughly
            // Matches: k1, K2, K, 1m, 1,5m, 1.5m
            const controlRegex = /^([kK]\d*|\d+([,.]\d+)?[mM])\s+(.*)$/i;
            const match = title.match(controlRegex);
            if (match) {
                const patientName = match[3];
                console.log(`\nEvent: ${title} (Matched Patient: ${patientName})`);
                const desc = event.description || '';

                if (desc.includes('Bu bilgiler Gemini tarafından otomasyon şeklinde oluşturulmuştur')) {
                    console.log("✅ Automation Signature FOUND!");
                    console.log("--- Description ---");
                    console.log(desc);
                    console.log("-------------------");
                    foundAutomation = true;
                } else if (desc.includes('gemini tarafından oluşturulmuştur')) {
                    console.log("✅ Old Automation Signature FOUND!");
                    foundAutomation = true;
                } else {
                    console.log("❌ No automation signature.");
                    console.log("Current Description:", desc.length > 50 ? desc.substring(0, 50) + "..." : desc);
                }
            }
        }

        if (!foundAutomation && targetEvents.length > 0) {
            console.log("\n⚠️ scanned events but found no matching automation signatures.");
        }

    } catch (error) {
        console.error("Error:", error);
    }
}

main();
