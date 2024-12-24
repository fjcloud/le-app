// Import trip organizer
import TripOrganizer from './apps/trip.js';

class App {
    constructor() {
        // Initialize Supabase client
        this.supabase = supabase.createClient(
            'https://hgafndgnyzxwbhnvddqw.supabase.co',
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhnYWZuZGdueXp4d2JobnZkZHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzQ5ODE1NDUsImV4cCI6MjA1MDU1NzU0NX0.CcrISJn2jub8ewozx6_XlvW7LDZeywq-Zuj8D8rTZZU'
        );

        // Initialize state
        this.currentUser = null;
        this.currentApp = null;
        this.apps = {
            trip: new TripOrganizer(this.supabase)
        };

        // Initialize views
        this.views = {
            auth: document.getElementById('authView'),
            dashboard: document.getElementById('dashboardView'),
            appContainer: document.getElementById('appContainer')
        };

        this.initializeApp();
    }

    async initializeApp() {
        console.log('Initializing app...');
        // Check current session
        try {
            const { data: { session }, error } = await this.supabase.auth.getSession();
            
            if (error) {
                console.error('Session error:', error);
                this.showError('Session error: ' + error.message);
                return;
            }

            console.log('Session status:', session ? 'Active' : 'No active session');

            if (session) {
                this.currentUser = session.user;
                this.showDashboard();
            } else {
                this.showAuth();
            }

            // Listen for auth state changes
            this.supabase.auth.onAuthStateChange((event, session) => {
                console.log('Auth state changed:', event);
                if (event === 'SIGNED_IN') {
                    this.currentUser = session.user;
                    this.showDashboard();
                } else if (event === 'SIGNED_OUT') {
                    this.currentUser = null;
                    this.showAuth();
                }
            });

            this.initializeEventListeners();
        } catch (error) {
            console.error('Initialization error:', error);
            this.showError('Failed to initialize app');
        }
    }

    initializeEventListeners() {
        console.log('Initializing event listeners');
        
        // Auth form listener
        const authForm = document.getElementById('authForm');
        if (authForm) {
            authForm.addEventListener('submit', (e) => this.handleAuth(e));
        }

        // App selection listeners
        this.setupAppCardListeners();

        // Back to dashboard button
        const backButton = document.getElementById('backToDashboard');
        if (backButton) {
            backButton.addEventListener('click', () => this.showDashboard());
        }
    }

    setupAppCardListeners() {
        console.log('Setting up app card listeners');
        const appCards = document.querySelectorAll('.app-card');
        appCards.forEach(card => {
            console.log('Found app card:', card.dataset.appId);
            card.addEventListener('click', () => {
                console.log('App card clicked:', card.dataset.appId);
                this.loadApp(card.dataset.appId);
            });
        });
    }

    async handleAuth(e) {
        e.preventDefault();
        const email = document.getElementById('email').value;

        try {
            // Get the current URL dynamically
            const currentHost = window.location.hostname; // e.g., "192.168.64.2"
            const currentPort = window.location.port; // e.g., "3000"
            const currentProtocol = window.location.protocol; // e.g., "http:"
            const redirectUrl = `${currentProtocol}//${currentHost}:${currentPort}`;
            
            console.log('Redirect URL:', redirectUrl);

            const { error } = await this.supabase.auth.signInWithOtp({
                email: email,
                options: {
                    emailRedirectTo: redirectUrl
                }
            });

            if (error) throw error;

            // Show magic link message with more details
            this.showMessage(`Magic link sent! Check your email (${email}). 
                            The link will redirect to: ${redirectUrl}`);
            
        } catch (error) {
            console.error('Authentication error:', error);
            this.showError('Authentication error: ' + error.message);
        }
    }

    loadApp(appId) {
        console.log('Loading app:', appId);
        
        // Hide dashboard
        this.views.dashboard.style.display = 'none';
        
        // Show app container
        this.views.appContainer.style.display = 'block';
        
        // Clear previous app content
        this.views.appContainer.innerHTML = '';
        
        // Load selected app
        switch(appId) {
            case 'trip':
                console.log('Setting up trip organizer');
                this.currentApp = this.apps.trip;
                // Load trip organizer UI
                this.views.appContainer.innerHTML = `
                    <div id="tripApp">
                        <div class="trip-container">
                            <div class="trip-list-header">
                                <h2>Your Trips</h2>
                                <button id="newTripBtn" class="btn btn-primary">New Trip</button>
                            </div>
                            <div id="tripList"></div>
                            <div id="tripDetails"></div>
                        </div>

                        <!-- New Trip Modal -->
                        <div id="newTripModal" class="modal">
                            <div class="modal-content">
                                <h3>Create New Trip</h3>
                                <form id="newTripForm">
                                    <div class="form-group">
                                        <label for="tripTitle">Trip Title</label>
                                        <input 
                                            type="text" 
                                            id="tripTitle" 
                                            required
                                            placeholder="Enter trip title"
                                        >
                                    </div>
                                    <div class="form-group">
                                        <label for="tripLocation">Location</label>
                                        <input 
                                            type="text" 
                                            id="tripLocation" 
                                            required
                                            placeholder="Enter location"
                                        >
                                    </div>
                                    <div class="form-group">
                                        <label for="tripStartDate">Start Date</label>
                                        <input 
                                            type="date" 
                                            id="tripStartDate" 
                                            required
                                        >
                                    </div>
                                    <div class="form-group">
                                        <label for="tripEndDate">End Date</label>
                                        <input 
                                            type="date" 
                                            id="tripEndDate" 
                                            required
                                        >
                                    </div>
                                    <div class="form-group">
                                        <label for="tripDescription">Description</label>
                                        <textarea 
                                            id="tripDescription" 
                                            rows="4"
                                            placeholder="Enter trip description"
                                        ></textarea>
                                    </div>
                                    <div class="modal-actions">
                                        <button type="button" class="btn btn-secondary" id="cancelNewTrip">
                                            Cancel
                                        </button>
                                        <button type="submit" class="btn btn-primary">
                                            Create Trip
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                `;
                
                // Initialize trip app after DOM is loaded
                setTimeout(() => {
                    console.log('Initializing trip app');
                    this.currentApp.init();
                }, 0);
                
                break;
                
            default:
                console.error('App not found:', appId);
                this.showError('App not found');
                this.showDashboard();
        }
    }

    showAuth() {
        Object.values(this.views).forEach(view => view.style.display = 'none');
        this.views.auth.style.display = 'block';
    }

    showDashboard() {
        console.log('Showing dashboard');
        Object.values(this.views).forEach(view => view.style.display = 'none');
        this.views.dashboard.style.display = 'block';
        
        // Render available apps
        const appsList = document.getElementById('appsList');
        if (appsList) {
            appsList.innerHTML = `
                <div class="app-card" data-app-id="trip">
                    <h3>Trip Organizer</h3>
                    <p>Plan and manage your trips</p>
                </div>
                <!-- More apps can be added here -->
            `;
            
            // Re-setup listeners after updating innerHTML
            this.setupAppCardListeners();
        } else {
            console.error('appsList element not found');
        }
    }

    // Utility method to show error messages
    showError(message, details = '') {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = `${message} ${details}`;
        document.body.appendChild(errorDiv);
        
        // Remove error message after 5 seconds
        setTimeout(() => errorDiv.remove(), 5000);
    }

    // Utility method to show success/info messages
    showMessage(message) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'info-message';
        messageDiv.textContent = message;
        document.body.appendChild(messageDiv);
        
        // Remove message after 5 seconds
        setTimeout(() => messageDiv.remove(), 5000);
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const app = new App();
});

// Export for potential module usage
export default App;
