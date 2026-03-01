// API Base URL - Use relative URL for API calls (works in both dev and production)
const API_URL = window.location.origin + '/api';
let authToken = localStorage.getItem('authToken');
let userData = JSON.parse(localStorage.getItem('userData') || '{}');
let allApplications = [];
let allSchemes = [];
let allAnnouncements = [];

// Check authentication on page load
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    initializeDashboard();
});

// Initialize dashboard
async function initializeDashboard() {
    try {
        await loadDashboardData();
    } catch (error) {
        console.error('Error loading dashboard:', error);
    }
    
    try {
        await loadServices();
    } catch (error) {
        console.error('Error loading services:', error);
    }
    
    try {
        await loadAnnouncements();
    } catch (error) {
        console.error('Error loading announcements:', error);
    }
    
    try {
        await loadSchemes();
    } catch (error) {
        console.error('Error loading schemes:', error);
    }
    
    try {
        await loadNotifications();
    } catch (error) {
        console.error('Error loading notifications:', error);
    }
    
    // Display home section by default
    showSection('home', document.querySelector('.sidebar-menu a'));
    
    // Auto-refresh every 30 seconds
    setInterval(() => {
        loadDashboardData().catch(err => console.error('Auto-refresh failed:', err));
    }, 30000);
}

// Check if user is authenticated
function checkAuth() {
    try {
        if (!authToken) {
            window.location.href = '/login';
            return;
        }

        // Ensure userData is an object
        userData = (typeof userData === 'string') ? JSON.parse(userData || '{}') : (userData || {});

        // Set user info (guard all DOM access)
        if (userData && userData.name) {
            try {
                const userNameEl = document.getElementById('userName');
                if (userNameEl) userNameEl.textContent = userData.name;

                const welcomeNameEl = document.getElementById('welcomeName');
                if (welcomeNameEl) welcomeNameEl.textContent = userData.name;

                const userAvatarEl = document.getElementById('userAvatar');
                if (userAvatarEl) {
                    const initials = (userData.name || '').split(' ').map(n => n[0] || '').join('').toUpperCase();
                    userAvatarEl.textContent = initials || userAvatarEl.textContent || '';
                }
            } catch (domErr) {
                console.warn('DOM update skipped in checkAuth:', domErr);
            }
        }
    } catch (err) {
        console.error('checkAuth error:', err);
    }
}

// Robust fetch with retry for Render cold starts (can take 30-60s)
async function fetchWithRetry(url, options, maxRetries = 5) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(url, options);
            if (response.ok) return response;
            console.warn(`Attempt ${i + 1} failed (${response.status}), retrying...`);
        } catch (e) {
            console.warn(`Attempt ${i + 1} network error, retrying...`);
        }
        await new Promise(r => setTimeout(r, (i + 1) * 5000));
    }
    return null;
}

// Load dashboard data
async function loadDashboardData() {
    try {
        if (!authToken) {
            console.warn('No auth token available');
            return;
        }

        const response = await fetchWithRetry(`${API_URL}/citizen/applications`, {
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Accept': 'application/json'
            }
        }, 3);

        if (!response) {
            console.warn('No response from server');
            displayRecentActivities([]);
            updateStatistics([]);
            return;
        }

        const data = await response.json();
        
        if (data.success && Array.isArray(data.applications)) {
            // Sort applications by created_at in descending order (most recent first)
            allApplications = data.applications.sort((a, b) => {
                return new Date(b.created_at) - new Date(a.created_at);
            });
            displayRecentActivities(allApplications);
            updateStatistics(allApplications);
        } else {
            console.warn('Invalid response format:', data);
            displayRecentActivities([]);
            updateStatistics([]);
        }
    } catch (error) {
        console.error('Error loading dashboard:', error);
        displayRecentActivities([]);
        updateStatistics([]);
    }
}

// Update statistics display
function updateStatistics(applications) {
    const total = applications.length || 0;
    const pending = applications.filter(a => a.status === 'Pending').length;
    const review = applications.filter(a => a.status === 'Verification').length;
    const approved = applications.filter(a => a.status === 'Approved').length;

    const totalEl = document.getElementById('totalAppsCount');
    const pendingEl = document.getElementById('pendingCount');
    const reviewEl = document.getElementById('reviewCount');
    const approvedEl = document.getElementById('approvedCount');
    
    if (totalEl) totalEl.textContent = total;
    if (pendingEl) pendingEl.textContent = pending;
    if (reviewEl) reviewEl.textContent = review;
    if (approvedEl) approvedEl.textContent = approved;
}

// Display recent activities
function displayRecentActivities(applications) {
    const container = document.getElementById('recentActivitiesContainer');
    
    if (!applications || applications.length === 0) {
        container.innerHTML = `
            <div style="padding: 30px; text-align: center; color: #6b7280;">
                <i class="fas fa-inbox" style="font-size: 24px; margin-bottom: 10px; display: block;"></i>
                <p>No applications yet. Apply for a service to get started.</p>
            </div>
        `;
        return;
    }

    // Sort by created_at descending (most recent first) and show 5 most recent
    const sorted = applications.sort((a, b) => {
        return new Date(b.created_at) - new Date(a.created_at);
    });
    const recent = sorted.slice(0, 5);
    
    container.innerHTML = recent.map(app => {
        const date = new Date(app.created_at).toLocaleDateString('en-IN');
        const statusClass = app.status.toLowerCase().replace(' ', '-');
        
        return `
            <div class="activity-item">
                <div class="activity-info">
                    <div class="activity-service">${app.service_name || 'Service'}</div>
                    <div class="activity-status">${app.application_id}</div>
                </div>
                <div style="text-align: right;">
                    <span class="status-badge status-${statusClass}">${app.status}</span>
                    <div class="activity-date">${date}</div>
                </div>
            </div>
        `;
    }).join('');
}

// Load all applications for Applications section
async function loadAllApplications() {
    try {
        const response = await fetchWithRetry(`${API_URL}/citizen/applications`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        }, 3);

        if (response) {
            const data = await response.json();
            if (data.success && data.applications) {
                displayAllApplications(data.applications);
            } else {
                displayAllApplications([]);
            }
        } else {
            displayAllApplications([]);
        }
    } catch (error) {
        console.error('Error loading applications:', error);
        displayAllApplications([]);
    }
}

// Display applications in table (OLD SECTION - Deleted from sidebar)
function displayApplications(applications) {
    const tbody = document.getElementById('applicationsTableBody');
    if (!tbody) return;
    
    if (!applications || applications.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; padding: 30px; color: var(--gray-500);">
                    <i class="fas fa-inbox" style="font-size: 48px; margin-bottom: 10px; display: block;"></i>
                    No applications yet. Click on "Apply for Certificate" to get started.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = applications.slice(0, 5).map(app => {
        const statusClass = app.status.toLowerCase().replace(' ', '-');
        const date = new Date(app.created_at).toLocaleDateString('en-IN');
        
        return `
            <tr>
                <td>${app.application_id}</td>
                <td>${app.service_name || 'N/A'}</td>
                <td>${date}</td>
                <td><span class="status-badge status-${statusClass}">${app.status}</span></td>
            </tr>
        `;
    }).join('');
}

// Load available services
async function loadServices() {
    try {
        // Try protected endpoint first, fallback to public
        let response = await fetch(`${API_URL}/common/services`);
        
        if (!response.ok && authToken) {
            response = await fetch(`${API_URL}/citizen/services`, {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });
        }

        if (response && response.ok) {
            const data = await response.json();

            if (data.success && Array.isArray(data.services)) {
                const select = document.getElementById('serviceSelect');
                if (select) {
                    select.innerHTML = '<option value="">-- Select Service --</option>' +
                        data.services.map(service => 
                            `<option value="${service.service_id}">${service.service_name} - ₹${service.fee || 0}</option>`
                        ).join('');
                }
            }
        }
    } catch (error) {
        console.error('Error loading services:', error);
    }
}

// Load announcements
async function loadAnnouncements() {
    try {
        const response = await fetch(`${API_URL}/common/announcements`);
        
        if (response && response.ok) {
            const data = await response.json();

            if (data.success && Array.isArray(data.announcements)) {
                allAnnouncements = data.announcements;
                displayAnnouncementsHome(data.announcements);
            }
        }
    } catch (error) {
        console.error('Error loading announcements:', error);
    }
}

// Display announcements on home
function displayAnnouncementsHome(announcements) {
    const container = document.getElementById('announcementsListHome');
    
    // Display in sidebar if available
    displayAnnouncementsSidebar(announcements);
}

// Display announcements in sidebar
function displayAnnouncementsSidebar(announcements) {
    const container = document.getElementById('announcementsListSidebar');
    if (!container) return;

    if (!announcements || announcements.length === 0) {
        container.innerHTML = `
            <div style="padding: 10px; text-align: center; color: #6b7280; font-size: 12px;">
                No announcements
            </div>
        `;
        return;
    }

    container.innerHTML = announcements.slice(0, 5).map(ann => `
        <div class="sidebar-item">
            <a href="javascript:void(0);" onclick="showAnnouncementDetail(${ann.announcement_id}); return false;" style="text-decoration: none; color: inherit;">
                <p class="sidebar-item-title">${ann.title}</p>
            </a>
        </div>
    `).join('');
}

// Show announcement detail modal
function showAnnouncementDetail(announcementId) {
    const announcement = allAnnouncements.find(a => a.announcement_id === announcementId);
    if (!announcement) return;

    const modalContent = `
        <div style="padding: 20px;">
            <h3 style="margin-top: 0; color: #111827;">${announcement.title}</h3>
            <p style="color: #6b7280; font-size: 13px;">
                Published: ${new Date(announcement.published_on).toLocaleDateString('en-IN')}
            </p>
            <div style="border-top: 1px solid #e5e7eb; padding-top: 15px; margin-top: 15px;">
                ${formatAnnouncementContent(announcement.content)}
            </div>
            <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #e5e7eb;">
                ${announcement.link ? `
                    <a href="${announcement.link}" target="_blank" class="btn btn-primary" style="display: inline-block; background: #2563eb; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; margin-right: 10px;">Visit Official Website</a>
                ` : ''}
                <button onclick="closeModal('detailsModal')" class="btn btn-secondary" style="background: #6b7280; color: white; padding: 10px 20px; border-radius: 6px; border: none; cursor: pointer;">Close</button>
            </div>
        </div>
    `;

    document.getElementById('detailsContent').innerHTML = modalContent;
    openModal('detailsModal');
}

// Format announcement content as bullet points if possible
function formatAnnouncementContent(content) {
    if (!content) return '<p style="color: #374151; line-height: 1.6;">No description available</p>';
    const points = content.split(/\n|\r|•|\d+\./).map(p => p.trim()).filter(p => p.length > 0);
    if (points.length > 1) {
        return `<ul style="color: #374151; line-height: 1.8; padding-left: 20px; text-align:left;">${points.map(pt => `<li>${pt}</li>`).join('')}</ul>`;
    } else {
        return `<p style="color: #374151; line-height: 1.6;">${content}</p>`;
    }
}

// Show announcement detail modal
function showAnnouncementDetail(announcementId) {
    const announcement = allAnnouncements.find(a => a.announcement_id === announcementId);
    if (!announcement) return;

    const modalContent = `
        <div style="padding: 20px;">
            <h3 style="margin-top: 0; color: #111827;">${announcement.title}</h3>
            <p style="color: #6b7280; font-size: 13px;">
                Published: ${new Date(announcement.published_on).toLocaleDateString('en-IN')}
            </p>
            <div style="border-top: 1px solid #e5e7eb; padding-top: 15px; margin-top: 15px;">
                <p style="color: #374151; line-height: 1.6;">${announcement.content || 'No description available'}</p>
            </div>
            <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #e5e7eb;">
                <button onclick="closeModal('detailsModal')" class="btn btn-primary" style="width: 100%;">Close</button>
            </div>
        </div>
    `;

    document.getElementById('detailsContent').innerHTML = modalContent;
    openModal('detailsModal');
}

// Load schemes
async function loadSchemes() {
    try {
        const response = await fetch(`${API_URL}/common/schemes`);
        
        if (response && response.ok) {
            const data = await response.json();

            if (data.success && Array.isArray(data.schemes)) {
                // Remove duplicate schemes based on scheme_name
                const uniqueSchemes = Array.from(
                    new Map(data.schemes.map(s => [s.scheme_name, s])).values()
                );
                allSchemes = uniqueSchemes;
                displaySchemesHome(uniqueSchemes);
            }
        }
    } catch (error) {
        console.error('Error loading schemes:', error);
    }
}

// Display schemes on home
function displaySchemesHome(schemes) {
    // Display in sidebar
    displaySchemesSidebar(schemes);
}

// Display schemes in sidebar
function displaySchemesSidebar(schemes) {
    const container = document.getElementById('schemesListSidebar');
    if (!container) return;

    if (!schemes || schemes.length === 0) {
        container.innerHTML = `
            <div style="padding: 10px; text-align: center; color: #6b7280; font-size: 12px;">
                No schemes available
            </div>
        `;
        return;
    }

    container.innerHTML = schemes.slice(0, 6).map(scheme => `
        <div class="sidebar-item">
            <a href="${scheme.link || 'javascript:void(0);'}" target="_blank" style="text-decoration: none; color: inherit;">
                <p class="sidebar-item-title">${scheme.scheme_name}</p>
            </a>
        </div>
    `).join('');
}


// Show scheme detail modal
function showSchemeDetail(schemeId) {
    const scheme = allSchemes.find(s => s.scheme_id === schemeId);
    if (!scheme) return;

    const modalContent = `
        <div style="padding: 20px;">
            <h3 style="margin-top: 0; color: #111827;">${scheme.scheme_name}</h3>
            <p style="color: #6b7280; font-size: 13px;"><strong>Type:</strong> ${scheme.scheme_type || 'N/A'}</p>
            
            <div style="border-top: 1px solid #e5e7eb; padding-top: 15px; margin-top: 15px;">
                <h4>Description</h4>
                <p style="color: #374151; line-height: 1.6;">${scheme.description || 'No description available'}</p>
                
                ${scheme.eligibility_criteria ? `
                    <h4 style="margin-top: 15px;">Eligibility Criteria</h4>
                    <p style="color: #374151; line-height: 1.6;">${scheme.eligibility_criteria}</p>
                ` : ''}
                
                ${scheme.benefits ? `
                    <h4 style="margin-top: 15px;">Benefits</h4>
                    <p style="color: #374151; line-height: 1.6;">${scheme.benefits}</p>
                ` : ''}
                
                ${scheme.application_process ? `
                    <h4 style="margin-top: 15px;">How to Apply</h4>
                    <p style="color: #374151; line-height: 1.6;">${scheme.application_process}</p>
                ` : ''}
            </div>

            <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #e5e7eb;">
                ${scheme.link ? `
                    <a href="${scheme.link}" target="_blank" class="btn btn-primary" style="display: inline-block; text-decoration: none; margin-right: 10px;">
                        <i class="fas fa-external-link-alt"></i> Visit Official Website
                    </a>
                ` : ''}
                <button onclick="closeModal('detailsModal')" class="btn btn-primary" style="display: inline-block;">Close</button>
            </div>
        </div>
    `;

    document.getElementById('detailsContent').innerHTML = modalContent;
    openModal('detailsModal');
}

// Application form submission
document.getElementById('applicationForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const serviceId = document.getElementById('serviceSelect').value;
    const purpose = document.getElementById('purpose').value;
    const additionalInfo = document.getElementById('additionalInfo').value;

    const applicationData = {
        purpose,
        additionalInfo,
        appliedDate: new Date().toISOString()
    };

    try {
        const response = await fetch(`${API_URL}/citizen/apply`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                service_id: serviceId,
                application_data: applicationData
            })
        });

        const data = await response.json();

        if (data.success) {
            closeModal('applyModal');
            loadDashboardData();
            document.getElementById('applicationForm').reset();
        } else {
            console.error('Error:', data.message);
        }
    } catch (error) {
        console.error('Error:', error);
    }
});

// Profile form event listener
document.getElementById('profileForm')?.addEventListener('submit', saveProfile);

// Upload form submission
document.getElementById('uploadForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const applicationId = document.getElementById('applicationSelect').value;
    const documentType = document.getElementById('documentType').value;
    const fileInput = document.getElementById('documentFile');
    const file = fileInput.files[0];

    if (!file) {
        return;
    }

    // Check file size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
        return;
    }

    const formData = new FormData();
    formData.append('documents', file);
    formData.append('application_id', applicationId);
    formData.append('document_types', JSON.stringify([documentType]));

    try {
        const response = await fetch(`${API_URL}/citizen/upload-documents`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            closeModal('uploadModal');
            document.getElementById('uploadForm').reset();
            loadDashboardData();
        } else {
            console.error('Error:', data.message);
        }
    } catch (error) {
        console.error('Error:', error);
    }
});

// Load certificates (approved applications)
async function loadCertificates() {
    try {
        if (!authToken) {
            console.warn('No auth token available');
            displayCertificates([]);
            return;
        }

        const response = await fetchWithRetry(`${API_URL}/citizen/applications`, {
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Accept': 'application/json'
            }
        }, 3);

        if (response) {
            const data = await response.json();
            if (data.success && Array.isArray(data.applications)) {
                // Filter only approved applications
                const approvedApps = data.applications.filter(app => app.status === 'Approved');
                
                // Sort by created_at descending (most recent first)
                const sorted = approvedApps.sort((a, b) => {
                    return new Date(b.created_at) - new Date(a.created_at);
                });
                
                // Remove duplicate certificates based on service_name
                const uniqueCerts = Array.from(
                    new Map(sorted.map(c => [c.service_name, c])).values()
                );
                
                displayCertificates(uniqueCerts);
            } else {
                console.warn('Invalid response format');
                displayCertificates([]);
            }
        } else {
            console.warn('No response from server');
            displayCertificates([]);
        }
    } catch (error) {
        console.error('Error loading certificates:', error);
        displayCertificates([]);
    }
}

// Display certificates in grid
function displayCertificates(certificates) {
    const container = document.getElementById('certificatesGrid');
    if (!container) return;
    
    if (!certificates || certificates.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1 / -1; padding: 40px 20px; text-align: center; color: #6b7280;">
                <i class="fas fa-certificate" style="font-size: 48px; margin-bottom: 15px; display: block;"></i>
                <p style="font-size: 16px; margin: 10px 0;">No approved certificates yet</p>
                <p style="font-size: 13px; color: #9ca3af;">Approved applications will appear here as certificates</p>
            </div>
        `;
        return;
    }

    container.innerHTML = certificates.map(cert => {
        const date = new Date(cert.created_at).toLocaleDateString('en-IN');
        return `
            <div class="certificate-card" style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; background: white; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                <div style="text-align: center; margin-bottom: 15px;">
                    <i class="fas fa-certificate" style="font-size: 32px; color: #d97706;"></i>
                </div>
                <h4 style="margin: 10px 0; text-align: center;">${cert.service_name || 'Certificate'}</h4>
                <p style="font-size: 13px; color: #6b7280; text-align: center; margin: 8px 0;">
                    <strong>ID:</strong> ${cert.application_id}
                </p>
                <p style="font-size: 13px; color: #6b7280; text-align: center; margin: 8px 0;">
                    <strong>Date:</strong> ${date}
                </p>
                <div style="margin-top: 15px; border-top: 1px solid #e5e7eb; padding-top: 15px;">
                    <button onclick="viewApplicationDetails('${cert.application_id}')" class="btn btn-primary" style="width: 100%; margin-bottom: 8px; padding: 8px; font-size: 13px; border: none; background-color: #3b82f6; color: white; border-radius: 6px; cursor: pointer;">
                        <i class="fas fa-eye"></i> View Details
                    </button>
                    <button onclick="downloadCertificatePDF('${cert.application_id}')" class="btn btn-success" style="width: 100%; padding: 8px; font-size: 13px; border: none; background-color: #10b981; color: white; border-radius: 6px; cursor: pointer;">
                        <i class="fas fa-download"></i> Download PDF
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// Download certificate as PDF
async function downloadCertificatePDF(applicationId) {
    try {
        const response = await fetch(`${API_URL}/citizen/certificates/download/${applicationId}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            // Get the blob from response
            const blob = await response.blob();
            // Create a temporary URL for the blob
            const url = window.URL.createObjectURL(blob);
            // Create a temporary link and click it to download
            const link = document.createElement('a');
            link.href = url;
            link.download = `certificate-${applicationId}.pdf`;
            document.body.appendChild(link);
            link.click();
            // Clean up
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } else if (response.status === 404) {
        } else {
        }
    } catch (error) {
        console.error('Error downloading certificate:', error);
    }
}

// Load pending applications for upload modal
async function loadPendingApplications() {
    try {
        const response = await fetch(`${API_URL}/citizen/applications`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        const data = await response.json();

        if (data.success) {
            const select = document.getElementById('applicationSelect');
            const pendingApps = data.applications.filter(app => 
                app.status === 'Pending' || app.status === 'Under Review'
            );
            
            select.innerHTML = '<option value="">-- Select Application --</option>' +
                pendingApps.map(app => 
                    `<option value="${app.application_id}">${app.service_name} - ${app.application_id}</option>`
                ).join('');
        }
    } catch (error) {
        console.error('Error loading applications:', error);
    }
}

// Track application
async function trackApplication() {
    const applicationId = document.getElementById('trackApplicationId').value.trim();
    const resultDiv = document.getElementById('trackResult');

    if (!applicationId) {
        return;
    }

    resultDiv.innerHTML = '<p style="text-align: center;"><i class="fas fa-spinner fa-spin"></i> Tracking...</p>';

    try {
        const response = await fetch(`${API_URL}/common/track/${applicationId}`);
        const data = await response.json();

        if (data.success) {
            const app = data.application;
            const history = data.history;

            resultDiv.innerHTML = `
                <div class="card">
                    <h4>${app.service_name}</h4>
                    <p><strong>Application ID:</strong> ${app.application_id}</p>
                    <p><strong>Current Status:</strong> <span class="status-badge status-${app.status.toLowerCase()}">${app.status}</span></p>
                    <p><strong>Submitted On:</strong> ${new Date(app.created_at).toLocaleString('en-IN')}</p>
                    <p><strong>Last Updated:</strong> ${new Date(app.updated_at).toLocaleString('en-IN')}</p>
                    
                    <h5 style="margin-top: 20px; margin-bottom: 10px;">Status History:</h5>
                    <div style="border-left: 3px solid var(--primary-blue); padding-left: 15px;">
                        ${history.map(h => `
                            <div style="margin-bottom: 15px;">
                                <p><strong>${h.new_status}</strong></p>
                                <p style="font-size: 12px; color: var(--gray-500);">${new Date(h.changed_at).toLocaleString('en-IN')}</p>
                                ${h.remarks ? `<p style="font-size: 13px; color: var(--gray-600);">${h.remarks}</p>` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        } else {
            resultDiv.innerHTML = `<p style="color: var(--red); text-align: center;">Application not found</p>`;
        }
    } catch (error) {
        console.error('Error:', error);
        resultDiv.innerHTML = `<p style="color: var(--red); text-align: center;">Error tracking application</p>`;
    }
}

// View application details
async function viewApplicationDetails(applicationId) {
    try {
        const response = await fetch(`${API_URL}/citizen/application/${applicationId}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        const data = await response.json();

        if (data.success) {
            const app = data.application;
            // Security check: Ensure user can only view their own applications
            if (app.user_id && userData.user_id && app.user_id !== userData.user_id) {
                return;
            }
            const docs = data.documents || [];

            const content = `
                <div style="padding: 20px;">
                    <div style="border-bottom: 2px solid #e5e7eb; padding-bottom: 15px;">
                        <h3 style="margin: 0; color: var(--dark-blue);">${app.service_name}</h3>
                        <p style="margin: 5px 0; color: var(--gray-600); font-size: 13px;">Application ID: <strong>${app.application_id}</strong></p>
                    </div>
                    
                    <div style="margin-top: 20px;">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                            <div>
                                <p style="font-size: 12px; color: var(--gray-500); margin-bottom: 5px;">Applied Date</p>
                                <p style="font-weight: 600; margin: 0;">${app.created_at ? new Date(app.created_at).toLocaleDateString('en-IN') : 'N/A'}</p>
                            </div>
                            <div>
                                <p style="font-size: 12px; color: var(--gray-500); margin-bottom: 5px;">Current Status</p>
                                <p style="margin: 0;"><span class="status-badge status-${(app.status || '').toLowerCase().replace(' ', '-')}">${app.status || 'Pending'}</span></p>
                            </div>
                        </div>
                    </div>

                    <div style="margin-top: 20px; border-top: 1px solid #e5e7eb; padding-top: 15px;">
                        <h4 style="margin-top: 0;">Uploaded Documents</h4>
                        ${docs.length > 0 ? `
                            <ul style="margin: 10px 0; padding-left: 20px;">
                                ${docs.map(doc => `
                                    <li style="margin: 8px 0; font-size: 14px;">
                                        ${doc.document_type}
                                        <span style="float: right; font-size: 12px; color: ${doc.is_verified ? '#10b981' : '#f59e0b'};">
                                            ${doc.is_verified ? '✓ Verified' : 'Pending Verification'}
                                        </span>
                                    </li>
                                `).join('')}
                            </ul>
                        ` : '<p style="color: var(--gray-500); font-size: 14px;">No documents uploaded yet</p>'}
                    </div>
                    
                    ${app.remarks ? `
                    <div style="margin-top: 15px; background: #f3f4f6; padding: 12px; border-radius: 6px; border-left: 4px solid #f59e0b;">
                        <p style="margin: 0; font-size: 13px; color: var(--gray-700);"><strong>Remarks:</strong> ${app.remarks}</p>
                    </div>
                    ` : ''}
                    
                    <button onclick="closeModal('detailsModal')" class="btn btn-primary" style="width: 100%; margin-top: 20px;">Close</button>
                </div>
            `;

            document.getElementById('detailsContent').innerHTML = content;
            openModal('detailsModal');
        } else {
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

// Show schemes modal with loaded data
async function showSchemesModalContent() {
    try {
        const response = await fetch(`${API_URL}/common/schemes`);
        const data = await response.json();

        const content = document.getElementById('schemesContent');

        if (data.success && data.schemes.length > 0) {
            content.innerHTML = data.schemes.map(scheme => `
                <div class="card">
                    <h4>${scheme.scheme_name}</h4>
                    <p><strong>Type:</strong> ${scheme.scheme_type || 'N/A'}</p>
                    <p>${scheme.description}</p>
                    <p><strong>Eligibility:</strong> ${scheme.eligibility_criteria || 'Not specified'}</p>
                    <p><strong>Benefits:</strong> ${scheme.benefits || 'Not specified'}</p>
                    ${scheme.link ? `<a href="${scheme.link}" target="_blank" class="btn btn-primary">Learn More</a>` : ''}
                </div>
            `).join('');
        } else {
            content.innerHTML = '<p style="text-align: center; color: var(--gray-500);">No schemes available</p>';
        }
    } catch (error) {
        console.error('Error:', error);
        document.getElementById('schemesContent').innerHTML = '<p style="text-align: center; color: var(--red);">Error loading schemes</p>';
    }
}

// Modal functions with smooth transitions and centering
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('active', 'show');
        // Ensure focus for accessibility
        modal.focus();
        // Prevent scrolling on body when modal is open
        document.body.style.overflow = 'hidden';
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => {
            modal.style.display = 'none';
            modal.classList.remove('active');
            // Restore scrolling
            document.body.style.overflow = '';
        }, 300);
    }
}

function showApplyModal() {
    openModal('applyModal');
}

function showUploadModal() {
    loadPendingApplications();
    openModal('uploadModal');
}

// Tab Switching Function
function switchTab(tabName, event) {
    if (event) {
        event.preventDefault();
    }
    
    // Hide all tabs
    document.querySelectorAll('[id$="Tab"], [id$="Section"]').forEach(tab => {
        tab.style.display = 'none';
        tab.classList.remove('active');
    });
    
    // Show selected tab
    const tabElement = document.getElementById(tabName + 'Tab');
    if (tabElement) {
        tabElement.style.display = 'block';
        tabElement.classList.add('active');
    }
    
    // Update active tab styling
    document.querySelectorAll('.tab-button, .nav-tab').forEach(btn => {
        btn.classList.remove('active');
    });
    if (event && event.target) {
        event.target.classList.add('active');
    }
    
    // Load data based on tab
    if (tabName === 'applications') {
        loadAllApplications();
    } else if (tabName === 'certificates') {
        loadCertificates();
    }
}

// Show Section
function showSection(section, element) {
    // Hide all sections
    document.querySelectorAll('[id$="Section"]').forEach(s => s.style.display = 'none');
    
    // Show selected section
    const sectionElement = document.getElementById(section + 'Section');
    if (sectionElement) {
        sectionElement.style.display = 'block';
    }
    
    // Update active state in sidebar
    document.querySelectorAll('.sidebar-menu a').forEach(a => a.classList.remove('active'));
    if (element) {
        element.classList.add('active');
    }
    
    // Show/hide right sidebar based on section
    const rightSidebar = document.querySelector('.right-sidebar');
    if (section === 'applications' || section === 'certificates') {
        if (rightSidebar) rightSidebar.style.display = 'none';
    } else {
        if (rightSidebar) rightSidebar.style.display = 'block';
    }
    
    // Load data for applications section
    if (section === 'applications') {
        loadAllApplications();
    } else if (section === 'certificates') {
        loadCertificates();
    }
}

// Load all applications
async function loadAllApplications() {
    try {
        if (!authToken) {
            console.warn('No auth token available');
            displayAllApplications([]);
            return;
        }

        const response = await fetchWithRetry(`${API_URL}/citizen/applications`, {
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Accept': 'application/json'
            }
        }, 3);

        if (response) {
            const data = await response.json();
            if (data.success && Array.isArray(data.applications)) {
                // Sort applications by created_at in descending order (most recent first)
                const sorted = data.applications.sort((a, b) => {
                    return new Date(b.created_at) - new Date(a.created_at);
                });
                displayAllApplications(sorted);
            } else {
                console.warn('Invalid response format');
                displayAllApplications([]);
            }
        } else {
            console.warn('No response from server');
            displayAllApplications([]);
        }
    } catch (error) {
        console.error('Error loading applications:', error);
        displayAllApplications([]);
    }
}

// Display All Applications
function displayAllApplications(applications) {
    const tbody = document.getElementById('allApplicationsTableBody');
    if (!tbody) return;
    
    if (!applications || applications.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; padding: 30px; color: var(--gray-500);">
                    <i class="fas fa-inbox" style="font-size: 48px; margin-bottom: 10px; display: block;"></i>
                    No applications found.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = applications.map(app => {
        const statusClass = app.status.toLowerCase().replace(' ', '-');
        const date = new Date(app.created_at || Date.now()).toLocaleDateString('en-IN');
        
        return `
            <tr>
                <td>${app.application_id || 'N/A'}</td>
                <td>${app.service_name || 'N/A'}</td>
                <td>${date}</td>
                <td><span class="status-badge status-${statusClass}">${app.status}</span></td>
                <td><button type="button" onclick="viewApplicationDetails('${app.application_id}')" class="btn btn-primary" style="padding: 5px 10px; font-size: 12px;">View</button></td>
            </tr>
        `;
    }).join('');
}

// Filter Applications
function filterApplications() {
    const status = document.getElementById('statusFilterAll').value;
    const tbody = document.getElementById('allApplicationsTableBody');
    if (!tbody) return;
    
    const rows = tbody.querySelectorAll('tr');
    rows.forEach(row => {
        if (status === '') {
            row.style.display = '';
        } else {
            row.style.display = row.textContent.includes(status) ? '' : 'none';
        }
    });
}

// Load and display certificates
async function loadCertificates() {
    try {
        if (!authToken) {
            console.warn('No auth token available');
            displayCertificates([]);
            return;
        }

        const response = await fetchWithRetry(`${API_URL}/citizen/applications`, {
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Accept': 'application/json'
            }
        }, 3);

        if (response) {
            const data = await response.json();
            if (data.success && Array.isArray(data.applications)) {
                // Filter only approved applications
                const approved = data.applications.filter(app => app.status === 'Approved');
                displayCertificates(approved);
            } else {
                displayCertificates([]);
            }
        } else {
            displayCertificates([]);
        }
    } catch (error) {
        console.error('Error loading certificates:', error);
        displayCertificates([]);
    }
}

// Display certificates grid
function displayCertificates(certificates) {
    const grid = document.getElementById('certificatesGrid');
    if (!grid) return;

    if (!certificates || certificates.length === 0) {
        grid.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #6b7280; grid-column: 1 / -1;">
                <i class="fas fa-file-pdf" style="font-size: 48px; margin-bottom: 15px; display: block; color: #d1d5db;"></i>
                <p>No certificates available</p>
                <p style="font-size: 13px;">Only approved applications will have downloadable certificates</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = certificates.map(cert => `
        <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
                <h3 style="margin: 0; font-size: 16px; font-weight: 600; color: #111827;">${cert.service_name || 'Certificate'}</h3>
                <span style="background: #dcfce7; color: #166534; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">Approved</span>
            </div>
            <div style="color: #6b7280; font-size: 13px; margin-bottom: 15px;">
                <p style="margin: 4px 0;"><strong>Application ID:</strong> ${cert.application_id}</p>
                <p style="margin: 4px 0;"><strong>Submitted:</strong> ${new Date(cert.created_at).toLocaleDateString('en-IN')}</p>
                <p style="margin: 4px 0;"><strong>Approved:</strong> ${new Date(cert.updated_at).toLocaleDateString('en-IN')}</p>
            </div>
            <button onclick="downloadCertificate('${cert.application_id}')" class="btn btn-primary" style="width: 100%; padding: 10px; background: #2563eb; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 14px; transition: all 0.2s;">
                <i class="fas fa-download"></i> Download Certificate
            </button>
        </div>
    `).join('');
}

// Download certificate PDF
function downloadCertificate(applicationId) {
    if (!authToken) {
        return;
    }

    // Create download link
    const link = document.createElement('a');
    link.href = `${API_URL}/citizen/certificates/download/${applicationId}`;
    link.headers = { 'Authorization': `Bearer ${authToken}` };
    
    // Fetch with authorization header
    fetch(`${API_URL}/citizen/certificates/download/${applicationId}`, {
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
    })
    .then(response => {
        if (response.ok) {
            return response.blob();
        } else {
            throw new Error('Download failed');
        }
    })
    .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Certificate_${applicationId}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    })
    .catch(error => console.error('Error downloading certificate:', error));
}

// Notification Panel Functions
let allNotifications = [];

async function loadNotifications() {
    try {
        if (!authToken) return; // Skip if not authenticated
        
        const response = await fetchWithRetry(`${API_URL}/citizen/notifications`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        if (response) {
            const data = await response.json();
            if (data.success) {
                allNotifications = data.notifications || [];
                updateNotificationCount(allNotifications.filter(n => !n.is_read).length);
            }
        }
    } catch (error) {
        console.error('Error loading notifications:', error);
    }
}

function toggleNotificationPanel() {
    const panel = document.getElementById('notificationPanel');
    const isActive = panel.classList.contains('active');
    
    if (isActive) {
        panel.classList.remove('active');
        panel.style.display = 'none';
    } else {
        panel.style.display = 'block';
        setTimeout(() => panel.classList.add('active'), 10);
        displayNotifications();
    }
}

function displayNotifications() {
    const content = document.getElementById('notificationPanelContent');
    
    if (allNotifications.length === 0) {
        content.innerHTML = `
            <div class=\"notification-empty\">
                <i class=\"fas fa-bell-slash\"></i>
                <p>No notifications yet</p>
            </div>
        `;
        return;
    }
    
    content.innerHTML = allNotifications.map(notif => `
        <div class=\"notification-item ${notif.is_read ? '' : 'unread'}\" onclick=\"markNotificationAsRead(${notif.notification_id})\">
            <h4>${notif.title}</h4>
            <p>${notif.message}</p>
            <div class=\"notification-time\">${new Date(notif.sent_at).toLocaleString('en-IN')}</div>
        </div>
    `).join('');
}

async function markNotificationAsRead(notificationId) {
    try {
        const response = await fetch(`${API_URL}/citizen/notifications/${notificationId}/read`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        if (response.ok) {
            // Update local notification state
            const notif = allNotifications.find(n => n.notification_id === notificationId);
            if (notif) {
                notif.is_read = true;
            }
            
            // Update count and close panel
            updateNotificationCount(allNotifications.filter(n => !n.is_read).length);
            toggleNotificationPanel();
        }
    } catch (error) {
        console.error('Error marking notification as read:', error);
    }
}


// Update notification count
function updateNotificationCount(count) {
    const badge = document.getElementById('notificationCount');
    if (count > 0) {
        badge.textContent = count;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

// Open profile editor
window.openProfileEditor = function openProfileEditor() {
    openModal('profileModal');
    loadProfileData();
}

// Load profile data
async function loadProfileData() {
    try {
        if (!userData || !userData.email) {
            return;
        }

        // Populate form with current data
        document.getElementById('profileName').value = userData.name || '';
        document.getElementById('profileEmail').value = userData.email || '';
        document.getElementById('profileAddress').value = userData.address || '';
        document.getElementById('profilePhone').value = userData.phone || '';
    } catch (error) {
        console.error('Error loading profile:', error);
    }
}

// Save profile changes
async function saveProfile(e) {
    e.preventDefault();
    
    try {
        if (!authToken) {
            return;
        }

        const name = document.getElementById('profileName').value.trim();
        const address = document.getElementById('profileAddress').value.trim();
        const phone = document.getElementById('profilePhone').value.trim();

        if (!name) {
            return;
        }

        const response = await fetch(`${API_URL}/citizen/profile`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                name,
                address,
                phone
            })
        });

        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                // Update localStorage
                userData.name = name;
                userData.address = address;
                userData.phone = phone;
                localStorage.setItem('userData', JSON.stringify(userData));

                // Update display
                if (document.getElementById('userName')) {
                    document.getElementById('userName').textContent = name;
                }
                if (document.getElementById('welcomeName')) {
                    document.getElementById('welcomeName').textContent = name;
                }

                closeModal('profileModal');
            } else {
                console.error('Error:', data.message);
            }
        } else {
            console.error('Error updating profile');
        }
    } catch (error) {
        console.error('Error saving profile:', error);
    }
}

// Close modals when clicking outside
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        const modalId = event.target.id;
        closeModal(modalId);
    }
};

// Logout function

function showLogoutModal() {
    document.getElementById('logoutModal').style.display = 'block';
}

function hideLogoutModal() {
    document.getElementById('logoutModal').style.display = 'none';
}

function confirmLogout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userData');
    window.location.href = '/login';
}

