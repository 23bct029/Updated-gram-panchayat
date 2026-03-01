#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database', 'gram_panchayat.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
        process.exit(1);
    }
    console.log('Connected to SQLite database');
});

// Sample Government Schemes
const schemes = [
    {
        name: 'PM-KISAN (Pradhan Mantri Kisan Samman Nidhi)',
        type: 'Agriculture',
        description: 'A government scheme providing income support to small and marginal farmers.',
        eligibility: 'Small and marginal farmers with land holdings up to 2 hectares',
        benefits: '₹6000 per annum in three equal installments',
        process: '1. Register on pmkisan.gov.in\n2. Provide Aadhar and land details\n3. Submit through Panchayat Office',
        documents: 'Aadhar Card, Land ownership certificate, Bank account details',
        link: 'https://pmkisan.gov.in'
    },
    {
        name: 'MNREGA (Mahatma Gandhi National Rural Employment Guarantee Act)',
        type: 'Employment',
        description: 'Provides guaranteed 100 days of wage employment in a financial year to every rural household.',
        eligibility: 'Rural households in India',
        benefits: '100 days of employment per financial year at minimum wage',
        process: '1. Apply to Gram Panchayat\n2. Registration in Job Card\n3. Submit work demand',
        documents: 'Aadhar Card, Address Proof, Employment Card (if renewing)',
        link: 'https://nrega.nic.in'
    },
    {
        name: 'Pradhan Mantri Awas Yojana',
        type: 'Housing',
        description: 'Housing scheme to provide affordable homes to rural and urban poor.',
        eligibility: 'Economically weaker sections and low-income groups',
        benefits: 'Subsidy of ₹1.30 lakh to ₹2.30 lakh for home construction',
        process: '1. Check eligibility\n2. Register online\n3. Submit documents to district office',
        documents: 'Aadhar Card, Income Certificate, Land ownership papers',
        link: 'https://pmayg.nic.in'
    },
    {
        name: 'Sukanya Samriddhi Yojana',
        type: 'Education',
        description: 'Small deposit scheme for girl child education and marriage.',
        eligibility: 'For girl children below 10 years of age',
        benefits: 'Tax exemption and high interest rates (current 8.0% p.a.)',
        process: '1. Open account at Post Office or Bank\n2. Deposit minimum ₹250 annually\n3. Account maturity at age 21',
        documents: 'Birth Certificate, Guardian ID proof, Address proof',
        link: 'https://www.indiapost.gov.in'
    },
    {
        name: 'National Social Assistance Programme',
        type: 'Welfare',
        description: 'Provides assistance to elderly, widows, and disabled persons.',
        eligibility: 'Senior citizens (60+), widows, and disabled persons with income below poverty line',
        benefits: '₹500 to ₹1000 per month depending on category',
        process: '1. Apply at Gram Panchayat\n2. Verification of documents\n3. Approval and benefit disbursement',
        documents: 'Age/Birth Certificate, Income Certificate, Aadhar Card',
        link: 'https://nsap.nic.in'
    },
    {
        name: 'Rajasthan Health Assurance Scheme',
        type: 'Health',
        description: 'Health insurance scheme for treatment of serious illness.',
        eligibility: 'BPL families and identified APL families in Rajasthan',
        benefits: 'Cashless treatment in empaneled hospitals up to ₹3 lakh',
        process: '1. Register through Gram Panchayat\n2. Get health card issued\n3. Seek treatment at empaneled hospitals',
        documents: 'BPL/APL certificate, Aadhar Card, Family members list',
        link: 'https://health.rajasthan.gov.in'
    }
];

// Sample Announcements
const announcements = [
    {
        title: 'New Birth Certificate Online Application Launched',
        content: 'Digital Gram Panchayat now accepts online applications for birth certificates. Faster processing and home delivery available. Visit our portal to apply.',
        type: 'Service Update',
        published: new Date(2026, 1, 25)
    },
    {
        title: 'Income Certificate Verification Camp - Feb 28',
        content: 'Special verification camp for income certificates scheduled at Gram Panchayat office on February 28, 2026. Bring all relevant documents for faster processing.',
        type: 'Notice',
        published: new Date(2026, 1, 28)
    },
    {
        title: 'PM-KISAN Enrollment Extended Till March 31',
        content: 'Great news! Last date for new PM-KISAN enrollment has been extended to March 31, 2026. Visit your nearest Gram Panchayat for registration and enrollment.',
        type: 'Scheme Update',
        published: new Date(2026, 1, 20)
    },
    {
        title: 'MNREGA Job Cards - Updated Registration Procedure',
        content: 'Simplified MNREGA registration process now live. Applicants can register online at NREGA website or visit our Panchayat office for assistance.',
        type: 'Process Update',
        published: new Date(2026, 1, 15)
    },
    {
        title: 'Death Certificate Applications Processing Faster',
        content: 'Latest update on death certificate applications - processing time reduced from 10 days to 5 days. Submit your application online for immediate processing.',
        type: 'Service Update',
        published: new Date(2026, 1, 10)
    }
];

// Add schemes to database
function addSchemes() {
    return new Promise((resolve, reject) => {
        // Delete existing schemes
        db.run('DELETE FROM schemes WHERE 1=1', (err) => {
            if (err) {
                console.error('Error clearing schemes:', err.message);
                return reject(err);
            }

            let count = 0;
            const insertNext = () => {
                if (count >= schemes.length) {
                    console.log(`✓ Added ${schemes.length} government schemes`);
                    return resolve();
                }

                const scheme = schemes[count];
                const query = `
                    INSERT INTO schemes (scheme_name, scheme_type, description, eligibility_criteria, benefits, application_process, required_documents, link, is_active, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, DATETIME('now'))
                `;

                db.run(
                    query,
                    [
                        scheme.name,
                        scheme.type,
                        scheme.description,
                        scheme.eligibility,
                        scheme.benefits,
                        scheme.process,
                        scheme.documents,
                        scheme.link
                    ],
                    (err) => {
                        if (err) {
                            console.error(`Error adding scheme: ${err.message}`);
                        } else {
                            process.stdout.write(`\r✓ Added scheme ${count + 1}/${schemes.length}`);
                        }
                        count++;
                        insertNext();
                    }
                );
            };

            insertNext();
        });
    });
}

// Add announcements to database
function addAnnouncements() {
    return new Promise((resolve, reject) => {
        // Delete existing announcements
        db.run('DELETE FROM announcements WHERE 1=1', (err) => {
            if (err) {
                console.error('Error clearing announcements:', err.message);
                return reject(err);
            }

            let count = 0;
            const insertNext = () => {
                if (count >= announcements.length) {
                    console.log(`\n✓ Added ${announcements.length} announcements`);
                    return resolve();
                }

                const announcement = announcements[count];
                const query = `
                    INSERT INTO announcements (title, content, announcement_type, is_active, published_on)
                    VALUES (?, ?, ?, 1, ?)
                `;

                db.run(
                    query,
                    [
                        announcement.title,
                        announcement.content,
                        announcement.type,
                        announcement.published.toISOString().split('T')[0]
                    ],
                    (err) => {
                        if (err) {
                            console.error(`Error adding announcement: ${err.message}`);
                        } else {
                            process.stdout.write(`\r✓ Added announcement ${count + 1}/${announcements.length}`);
                        }
                        count++;
                        insertNext();
                    }
                );
            };

            insertNext();
        });
    });
}

// Main execution
async function main() {
    try {
        console.log('Adding government schemes and announcements...\n');
        await addSchemes();
        await addAnnouncements();
        
        console.log('\n\n✨ Schemes and Announcements added successfully!');
        
        // Display summary
        db.all('SELECT scheme_type, COUNT(*) as count FROM schemes GROUP BY scheme_type', (err, results) => {
            if (results) {
                console.log('\n📋 Schemes by Type:');
                results.forEach(row => {
                    console.log(`  ${row.scheme_type}: ${row.count} scheme(s)`);
                });
            }
            
            db.all('SELECT announcement_type, COUNT(*) as count FROM announcements GROUP BY announcement_type', (err, results) => {
                if (results) {
                    console.log('\n📢 Announcements by Type:');
                    results.forEach(row => {
                        console.log(`  ${row.announcement_type}: ${row.count} announcement(s)`);
                    });
                }
                
                db.close();
                process.exit(0);
            });
        });
    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    }
}

main();
