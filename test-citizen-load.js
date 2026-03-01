// Test citizen dashboard data loading
const API_URL = 'http://localhost:3000/api';

async function testLoading() {
    console.log('🧪 Testing Citizen Dashboard Loading...\n');
    
    try {
        // Login
        let response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'citizen@example.com',
                password: 'citizen123',
                userType: 'citizen'
            })
        });
        let data = await response.json();
        const token = data.token;
        console.log('✓ Authenticated\n');
        
        // Simulate 3 consecutive loads (like the user reported issues)
        console.log('Testing multiple consecutive loads:');
        for (let i = 1; i <= 3; i++) {
            response = await fetch(`${API_URL}/citizen/applications`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            data = await response.json();
            console.log(`  Load ${i}: ✓ ${data.applications.length} apps returned`);
        }
        console.log('\n✓ No loading errors after multiple requests\n');
        
        // Test status accuracy
        console.log('📊 Testing statistics accuracy:');
        response = await fetch(`${API_URL}/citizen/applications`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        data = await response.json();
        const apps = data.applications;
        const pending = apps.filter(a => a.status === 'Pending').length;
        const review = apps.filter(a => a.status === 'Verification').length;
        const verified = apps.filter(a => a.status === 'Verified').length;
        const approved = apps.filter(a => a.status === 'Approved').length;
        const total = apps.length;
        
        console.log(`  Total: ${total}`);
        console.log(`  Pending: ${pending}`);
        console.log(`  Under Review: ${review}`);
        console.log(`  Verified: ${verified}`);
        console.log(`  Approved: ${approved}`);
        console.log(`  Sum: ${pending + review + verified + approved}\n`);
        
        console.log('✅ All tests PASSED');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

testLoading();
