/**
 * Password Hash Generator
 * 
 * This script helps generate bcrypt password hashes for admin and staff accounts.
 * 
 * Usage:
 * 1. Update the passwords array below with desired passwords
 * 2. Run: node generate-passwords.js
 * 3. Copy the hash and update database
 */

const bcrypt = require('bcrypt');

// Add your passwords here
const passwords = [
    'admin123',
    'staff123',
    'test123'
];

console.log('===========================================');
console.log('Password Hash Generator');
console.log('Digital Gram Panchayat Services Portal');
console.log('===========================================\n');

// Generate hashes
async function generateHashes() {
    for (let password of passwords) {
        try {
            const hash = await bcrypt.hash(password, 10);
            console.log(`Password: ${password}`);
            console.log(`Hash: ${hash}`);
            console.log('-------------------------------------------');
        } catch (error) {
            console.error(`Error generating hash for ${password}:`, error);
        }
    }
    
    console.log('\n===========================================');
    console.log('How to use these hashes:');
    console.log('===========================================');
    console.log('Copy the hash and update in database:\n');
    console.log('For Admin:');
    console.log('UPDATE admin SET password_hash = \'PASTE_HASH_HERE\' WHERE email = \'admin@grampanchayat.gov.in\';\n');
    console.log('For Staff:');
    console.log('UPDATE staff SET password_hash = \'PASTE_HASH_HERE\' WHERE email = \'your_staff_email\';\n');
}

generateHashes();
