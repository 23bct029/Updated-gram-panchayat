const http = require('http');

// Test login and get applications
function testLogin() {
    return new Promise((resolve) => {
        const loginData = JSON.stringify({
            email: 'citizen@example.com',
            password: 'password123'
        });

        const options = {
            hostname: 'localhost',
            port: 3000,
            path: '/api/auth/login',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': loginData.length
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    resolve(result.token);
                } catch (e) {
                    console.error('Login error:', e);
                    resolve(null);
                }
            });
        });

        req.on('error', (e) => {
            console.error('Request error:', e.message);
            resolve(null);
        });

        req.write(loginData);
        req.end();
    });
}

async function runTests() {
    console.log('🧪 Final Validation Tests\n');
    
    const token = await testLogin();
    if (!token) {
        console.log('❌ Login failed');
        return;
    }
    
    console.log('✓ Authentication successful\n');
    
    // Test applications endpoint
    console.log('Testing /api/citizen/applications...');
    const appOptions = {
        hostname: 'localhost',
        port: 3000,
        path: '/api/citizen/applications',
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    };

    http.request(appOptions, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            try {
                const result = JSON.parse(data);
                const apps = result.applications || [];
                console.log(`✓ Applications loaded: ${apps.length} found`);
                
                // Group by status
                const stats = {
                    'Pending': apps.filter(a => a.status === 'Pending').length,
                    'Verification': apps.filter(a => a.status === 'Verification').length,
                    'Approved': apps.filter(a => a.status === 'Approved').length
                };
                
                console.log('  Status breakdown:');
                Object.entries(stats).forEach(([status, count]) => {
                    console.log(`    - ${status}: ${count}`);
                });
                
                if (apps.length > 0) {
                    console.log('\n✓ Recent applications (sorted by date):');
                    apps.slice(0, 3).forEach(app => {
                        const date = new Date(app.created_at).toLocaleDateString();
                        console.log(`    - APP-${app.application_id}: ${app.service_name} (${app.status}) - ${date}`);
                    });
                }
            } catch (e) {
                console.error('✗ Error parsing response:', e.message);
            }
        });
    }).end();
}

runTests();
