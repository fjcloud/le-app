// trip.js
class TripOrganizer {
    constructor(supabase) {
        this.supabase = supabase;
        this.currentUser = null;
        this.currentTrip = null;
        this.subscribers = new Map();
        
        // Initialize DOM element references
        this.domElements = {
            tripList: null,
            tripDetails: null,
            newTripBtn: null,
            newTripForm: null,
            newTripModal: null,
            cancelNewTrip: null,
            loadingIndicator: null
        };

        // Bind methods
        Object.getOwnPropertyNames(TripOrganizer.prototype)
            .filter(prop => typeof this[prop] === 'function')
            .forEach(method => {
                this[method] = this[method].bind(this);
            });
    }

    async init() {
        console.log('Initializing TripOrganizer');
        try {
            // Get current user
            const { data: { user }, error } = await this.supabase.auth.getUser();
            if (error) throw error;
            this.currentUser = user;

            // Initialize DOM elements
            this.initializeDOMElements();
            
            // Set up event listeners
            this.initializeEventListeners();
            
            // Load initial trips
            await this.loadTrips();
            
            // Set up realtime subscriptions
            this.setupRealtimeSubscriptions();

            console.log('TripOrganizer initialized successfully');
        } catch (error) {
            console.error('Failed to initialize TripOrganizer:', error);
            this.showError('Failed to initialize TripOrganizer');
        }
    }

    initializeDOMElements() {
        this.domElements = {
            tripList: document.getElementById('tripList'),
            tripDetails: document.getElementById('tripDetails'),
            newTripBtn: document.getElementById('newTripBtn'),
            newTripForm: document.getElementById('newTripForm'),
            newTripModal: document.getElementById('newTripModal'),
            cancelNewTrip: document.getElementById('cancelNewTrip'),
            loadingIndicator: document.getElementById('loadingIndicator')
        };

        if (!this.validateDOMElements()) {
            throw new Error('Required DOM elements not found');
        }
    }

    validateDOMElements() {
        const requiredElements = ['tripList', 'tripDetails', 'newTripBtn', 'newTripForm', 'newTripModal', 'cancelNewTrip'];
        return requiredElements.every(elementId => {
            if (!this.domElements[elementId]) {
                console.error(`Required DOM element not found: ${elementId}`);
                return false;
            }
            return true;
        });
    }

    initializeEventListeners() {
        console.log('Setting up event listeners');
        
        // Remove any existing event listeners
        this.removeEventListeners();
        
        // New Trip button
        this.domElements.newTripBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.showNewTripModal();
        });

        // New Trip form
        this.domElements.newTripForm.addEventListener('submit', (e) => this.handleNewTrip(e));

        // Cancel button
        this.domElements.cancelNewTrip.addEventListener('click', () => this.hideNewTripModal());
    }

    removeEventListeners() {
        // Clean up any existing event listeners if needed
        this.domElements.newTripBtn?.removeEventListener('click', this.showNewTripModal);
        this.domElements.newTripForm?.removeEventListener('submit', this.handleNewTrip);
        this.domElements.cancelNewTrip?.removeEventListener('click', this.hideNewTripModal);
    }

    setupRealtimeSubscriptions() {
        this.supabase
            .channel('trips_channel')
            .on('postgres_changes', 
                { event: '*', schema: 'public', table: 'trips' },
                (payload) => this.handleTripChange(payload))
            .subscribe();
    }

    async loadTrips() {
        console.log('Loading trips');
        try {
            const { data: trips, error } = await this.supabase
                .from('trips')
                .select(`
                    *,
                    trip_members!inner (
                        user_id,
                        role
                    )
                `)
                .eq('trip_members.user_id', this.currentUser.id)
                .order('start_date', { ascending: true });

            if (error) throw error;
            
            console.log('Trips loaded:', trips?.length || 0);
            this.renderTripList(trips || []);
        } catch (error) {
            console.error('Error loading trips:', error);
            this.showError('Failed to load trips');
        }
    }

    async loadTripDetails(tripId) {
        console.log('Loading details for trip:', tripId);
        try {
            const { data: trip, error } = await this.supabase
                .from('trips')
                .select(`
                    *,
                    trip_members (
                        user_id,
                        role,
                        profiles:user_id (
                            full_name,
                            avatar_url
                        )
                    )
                `)
                .eq('id', tripId)
                .single();

            if (error) throw error;

            this.currentTrip = trip;
            this.renderTripDetails(trip);
        } catch (error) {
            console.error('Error in loadTripDetails:', error);
            this.showError('Failed to load trip details');
        }
    }

    async createTrip(tripData) {
        console.log('Creating new trip:', tripData);
        try {
            // Validate trip data
            this.validateTripData(tripData);

            // Insert trip record
            const { data: trip, error: tripError } = await this.supabase
                .from('trips')
                .insert({
                    user_id: this.currentUser.id,
                    title: tripData.title,
                    description: tripData.description,
                    location: tripData.location,
                    start_date: tripData.startDate,
                    end_date: tripData.endDate,
                })
                .select()
                .single();

            if (tripError) throw tripError;

            // Create trip member record for creator
            const { error: memberError } = await this.supabase
                .from('trip_members')
                .insert({
                    trip_id: trip.id,
                    user_id: this.currentUser.id,
                    role: 'owner'
                });

            if (memberError) throw memberError;

            await this.loadTrips();
            return trip;
        } catch (error) {
            console.error('Error in createTrip:', error);
            this.showError('Failed to create trip');
            return null;
        }
    }

    async deleteTrip(tripId) {
        if (!confirm('Are you sure you want to delete this trip? This action cannot be undone.')) {
            return;
        }

        try {
            // Verify user has permission to delete
            const { data: member } = await this.supabase
                .from('trip_members')
                .select('role')
                .eq('trip_id', tripId)
                .eq('user_id', this.currentUser.id)
                .single();

            if (!member || member.role !== 'owner') {
                throw new Error('Only trip owners can delete trips');
            }

            const { error } = await this.supabase
                .from('trips')
                .delete()
                .eq('id', tripId);

            if (error) throw error;

            this.currentTrip = null;
            this.domElements.tripDetails.innerHTML = '<p>Select a trip to view details</p>';
            await this.loadTrips();
        } catch (error) {
            console.error('Error in deleteTrip:', error);
            this.showError('Failed to delete trip');
        }
    }

    async handleNewTrip(e) {
        e.preventDefault();
        console.log('Handling new trip submission');

        const tripData = {
            title: document.getElementById('tripTitle').value,
            location: document.getElementById('tripLocation').value,
            startDate: document.getElementById('tripStartDate').value,
            endDate: document.getElementById('tripEndDate').value,
            description: document.getElementById('tripDescription').value
        };

        const newTrip = await this.createTrip(tripData);
        
        if (newTrip) {
            this.hideNewTripModal();
            document.getElementById('newTripForm').reset();
        }
    }

    validateTripData({ title, startDate, endDate }) {
        if (!title?.trim()) {
            throw new Error('Title is required');
        }

        const start = new Date(startDate);
        const end = new Date(endDate);

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            throw new Error('Invalid date format');
        }

        if (start > end) {
            throw new Error('End date must be after start date');
        }
    }

    renderTripList(trips) {
        console.log('Rendering trip list');
        if (!this.domElements.tripList) {
            console.error('Trip list container not found');
            return;
        }

        if (trips.length === 0) {
            this.domElements.tripList.innerHTML = '<p>No trips yet. Create your first trip!</p>';
            return;
        }

        this.domElements.tripList.innerHTML = trips.map(trip => `
            <div class="trip-card" data-trip-id="${trip.id}">
                <h3>${trip.title}</h3>
                <p>${trip.location || 'No location set'}</p>
                <p>${new Date(trip.start_date).toLocaleDateString()} - 
                   ${new Date(trip.end_date).toLocaleDateString()}</p>
            </div>
        `).join('');

        // Add click events for trip cards
        document.querySelectorAll('.trip-card').forEach(card => {
            card.addEventListener('click', () => {
                const tripId = card.dataset.tripId;
                this.loadTripDetails(tripId);
            });
        });
    }

    renderTripDetails(trip) {
        console.log('Rendering trip details:', trip);
        if (!this.domElements.tripDetails) {
            console.error('Trip details container not found');
            return;
        }

        if (!trip) {
            this.domElements.tripDetails.innerHTML = '<p>Select a trip to view details</p>';
            return;
        }

        const userRole = trip.trip_members.find(m => m.user_id === this.currentUser.id)?.role;
        const canEdit = userRole === 'owner' || userRole === 'editor';

        this.domElements.tripDetails.innerHTML = `
            <div class="trip-details">
                <h2>${trip.title}</h2>
                <p class="location">📍 ${trip.location || 'No location set'}</p>
                <div class="dates">
                    <p>🗓️ ${new Date(trip.start_date).toLocaleDateString()} - 
                       ${new Date(trip.end_date).toLocaleDateString()}</p>
                </div>
                <div class="description">
                    <h3>Description</h3>
                    <p>${trip.description || 'No description available'}</p>
                </div>
                ${canEdit ? `
                    <div class="trip-actions">
                        <button class="btn btn-secondary" id="editTrip">Edit Trip</button>
                        ${userRole === 'owner' ? `
                            <button class="btn btn-error" id="deleteTrip">Delete Trip</button>
                        ` : ''}
                    </div>
                ` : ''}
            </div>
        `;

        // Add event listeners for the action buttons
        if (canEdit) {
            const editBtn = document.getElementById('editTrip');
            if (editBtn) {
                editBtn.addEventListener('click', () => this.editTrip(trip.id));
            }

            if (userRole === 'owner') {
                const deleteBtn = document.getElementById('deleteTrip');
                if (deleteBtn) {
                    deleteBtn.addEventListener('click', () => this.deleteTrip(trip.id));
                }
            }
        }
    }

    showNewTripModal() {
        console.log('Showing modal');
        this.domElements.newTripModal.style.display = 'flex';
    }

    hideNewTripModal() {
        this.domElements.newTripModal.style.display = 'none';
    }

    handleTripChange(payload) {
        console.log('Trip changes detected:', payload);
        this.loadTrips();
    }

    showError(message) {
        console.error(message);
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        document.body.appendChild(errorDiv);
        setTimeout(() => errorDiv.remove(), 5000);
    }
}

export default TripOrganizer;
