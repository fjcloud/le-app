// Trip Organizer Module
class TripOrganizer {
    constructor(supabase) {
        console.log('TripOrganizer initialized');
        this.supabase = supabase;
        this.currentTrip = null;
        
        // Initialize event handler properties
        this.handleNewTripClick = null;
        this.handleFormSubmit = null;
        this.handleCancel = null;

        // Bind methods to ensure correct 'this' context
        this.loadTripDetails = this.loadTripDetails.bind(this);
        this.renderTripDetails = this.renderTripDetails.bind(this);
        this.handleNewTrip = this.handleNewTrip.bind(this);
        this.showNewTripModal = this.showNewTripModal.bind(this);
        this.hideNewTripModal = this.hideNewTripModal.bind(this);
    }

    init() {
        console.log('Running TripOrganizer init');
        this.tripListContainer = document.getElementById('tripList');
        this.tripDetailsContainer = document.getElementById('tripDetails');
        this.initializeEventListeners();
        this.loadTrips();
    }

    initializeEventListeners() {
        console.log('Setting up event listeners');
        
        // Remove any existing event listeners first
        this.removeEventListeners();
        
        const newTripBtn = document.getElementById('newTripBtn');
        if (newTripBtn) {
            console.log('New Trip button found');
            this.handleNewTripClick = (e) => {
                console.log('New Trip button clicked');
                e.preventDefault();
                this.showNewTripModal();
            };
            newTripBtn.addEventListener('click', this.handleNewTripClick);
        }

        const newTripForm = document.getElementById('newTripForm');
        if (newTripForm) {
            console.log('New Trip form found');
            this.handleFormSubmit = (e) => this.handleNewTrip(e);
            newTripForm.addEventListener('submit', this.handleFormSubmit);
        }

        const cancelBtn = document.getElementById('cancelNewTrip');
        if (cancelBtn) {
            this.handleCancel = () => this.hideNewTripModal();
            cancelBtn.addEventListener('click', this.handleCancel);
        }
    }

    removeEventListeners() {
        const newTripBtn = document.getElementById('newTripBtn');
        if (newTripBtn && this.handleNewTripClick) {
            newTripBtn.removeEventListener('click', this.handleNewTripClick);
        }

        const newTripForm = document.getElementById('newTripForm');
        if (newTripForm && this.handleFormSubmit) {
            newTripForm.removeEventListener('submit', this.handleFormSubmit);
        }

        const cancelBtn = document.getElementById('cancelNewTrip');
        if (cancelBtn && this.handleCancel) {
            cancelBtn.removeEventListener('click', this.handleCancel);
        }
    }

    async loadTrips() {
        console.log('Loading trips');
        try {
            const { data: trips, error } = await this.supabase
                .from('trips')
                .select('*')
                .order('start_date', { ascending: true });

            if (error) {
                console.error('Error fetching trips:', error);
                return;
            }

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
                .select('*')
                .eq('id', tripId)
                .single();

            if (error) {
                console.error('Error loading trip details:', error);
                this.showError('Failed to load trip details');
                return;
            }

            console.log('Trip details loaded:', trip);
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
            const { data: { user }, error: userError } = await this.supabase.auth.getUser();
            
            if (userError) {
                console.error('Error getting user:', userError);
                return null;
            }

            if (!user) {
                console.error('No user found');
                return null;
            }

            const { data, error } = await this.supabase
                .from('trips')
                .insert({
                    user_id: user.id,
                    title: tripData.title,
                    description: tripData.description,
                    start_date: tripData.startDate,
                    end_date: tripData.endDate,
                    location: tripData.location,
                    created_at: new Date()
                })
                .select()
                .single();

            if (error) {
                console.error('Error inserting trip:', error);
                return null;
            }

            console.log('Trip created successfully:', data);
            await this.loadTrips();
            return data;
        } catch (error) {
            console.error('Error in createTrip:', error);
            this.showError('Failed to create trip');
            return null;
        }
    }

    showNewTripModal() {
        console.log('Showing modal');
        const modal = document.getElementById('newTripModal');
        if (modal) {
            modal.style.display = 'flex';
        }
    }

    hideNewTripModal() {
        const modal = document.getElementById('newTripModal');
        if (modal) {
            modal.style.display = 'none';
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

        console.log('Trip data:', tripData);
        const newTrip = await this.createTrip(tripData);
        
        if (newTrip) {
            this.hideNewTripModal();
            document.getElementById('newTripForm').reset();
        }
    }

    renderTripList(trips) {
        console.log('Rendering trip list');
        if (!this.tripListContainer) {
            console.error('Trip list container not found');
            return;
        }

        if (trips.length === 0) {
            this.tripListContainer.innerHTML = '<p>No trips yet. Create your first trip!</p>';
            return;
        }

        this.tripListContainer.innerHTML = trips.map(trip => `
            <div class="trip-card" data-trip-id="${trip.id}">
                <h3>${trip.title}</h3>
                <p>${trip.location || 'No location set'}</p>
                <p>${new Date(trip.start_date).toLocaleDateString()} - 
                   ${new Date(trip.end_date).toLocaleDateString()}</p>
            </div>
        `).join('');

        // Add click events with proper binding
        document.querySelectorAll('.trip-card').forEach(card => {
            card.addEventListener('click', () => {
                const tripId = card.dataset.tripId;
                console.log('Trip card clicked:', tripId);
                this.loadTripDetails(tripId);
            });
        });
    }

    renderTripDetails(trip) {
        console.log('Rendering trip details:', trip);
        if (!this.tripDetailsContainer) {
            console.error('Trip details container not found');
            return;
        }

        if (!trip) {
            this.tripDetailsContainer.innerHTML = '<p>Select a trip to view details</p>';
            return;
        }

        this.tripDetailsContainer.innerHTML = `
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
                <div class="trip-actions">
                    <button class="btn btn-secondary" id="editTrip">Edit Trip</button>
                    <button class="btn btn-error" id="deleteTrip">Delete Trip</button>
                </div>
            </div>
        `;

        // Add event listeners for the action buttons
        const editBtn = document.getElementById('editTrip');
        const deleteBtn = document.getElementById('deleteTrip');

        if (editBtn) {
            editBtn.addEventListener('click', () => this.editTrip(trip.id));
        }

        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => this.deleteTrip(trip.id));
        }
    }

    async editTrip(tripId) {
        console.log('Edit trip:', tripId);
        // TODO: Implement edit functionality
    }

    async deleteTrip(tripId) {
        console.log('Deleting trip:', tripId);
        if (confirm('Are you sure you want to delete this trip?')) {
            try {
                const { error } = await this.supabase
                    .from('trips')
                    .delete()
                    .eq('id', tripId);

                if (error) {
                    console.error('Error deleting trip:', error);
                    this.showError('Failed to delete trip');
                    return;
                }

                // Clear current trip and reload list
                this.currentTrip = null;
                this.tripDetailsContainer.innerHTML = '<p>Select a trip to view details</p>';
                await this.loadTrips();
            } catch (error) {
                console.error('Error in deleteTrip:', error);
                this.showError('Failed to delete trip');
            }
        }
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
