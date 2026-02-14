
async function checkDb() {
    try {
        console.log('Fetching local patient-db...');
        const res = await fetch('http://localhost:3012/api/patient-db');
        if (res.ok) {
            const data = await res.json();
            console.log('Patient DB Count:', data.length);
            console.log('Sample:', data.slice(0, 3));
        } else {
            console.log('Failed:', res.status, await res.text());
        }
    } catch (e) {
        console.error(e);
    }
}
checkDb();
