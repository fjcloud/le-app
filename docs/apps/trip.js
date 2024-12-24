// trip.js
class TripManager {
    constructor(supabase) {
        this.supabase = supabase;
        this.currentUser = null;
        this.currentTrip = null;
        this.subscribers = new Map();
        
        // Bind methods
        Object.getOwnPropertyNames(TripManager.prototype)
            .filter(prop => typeof this[prop] === 'function')
            .forEach(method => {
                this[method] = this[method].bind(this);
            });
    }

    async initialize() {
        try {
            const { data: { user }, error } = await this.supabase.auth.getUser();
            if (error) throw error;
            this.currentUser = user;

            // Set up real-time subscriptions
            this.setupRealtimeSubscriptions();
            return true;
        } catch (error) {
            console.error('Initialization failed:', error);
            return false;
        }
    }

    setupRealtimeSubscriptions() {
        // Subscribe to trip changes
        this.supabase
            .channel('trips_channel')
            .on('postgres_changes', 
                { event: '*', schema: 'public', table: 'trips' },
                this.handleTripChange)
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'trip_members' },
                this.handleMemberChange)
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'trip_expenses' },
                this.handleExpenseChange)
            .subscribe();
    }

    // Trip CRUD Operations
    async createTrip({ title, description, location, startDate, endDate, budgetAmount, budgetCurrency = 'USD' }) {
        try {
            this.validateTripData({ title, startDate, endDate });

            const { data: trip, error } = await this.supabase
                .from('trips')
                .insert({
                    user_id: this.currentUser.id,
                    title,
                    description,
                    location,
                    start_date: startDate,
                    end_date: endDate,
                    budget_amount: budgetAmount,
                    budget_currency: budgetCurrency,
                    status: 'planning'
                })
                .select()
                .single();

            if (error) throw error;

            // Create initial member record for creator
            await this.addTripMember(trip.id, this.currentUser.id, 'owner');

            return trip;
        } catch (error) {
            throw this.handleError('Failed to create trip', error);
        }
    }

    async getTripsByUser(userId = this.currentUser?.id) {
        try {
            const { data: memberTrips, error: memberError } = await this.supabase
                .from('trip_members')
                .select(`
                    trip_id,
                    role,
                    trips (*)
                `)
                .eq('user_id', userId);

            if (memberError) throw memberError;

            return memberTrips.map(mt => ({
                ...mt.trips,
                userRole: mt.role
            }));
        } catch (error) {
            throw this.handleError('Failed to fetch trips', error);
        }
    }

    async getTripDetails(tripId) {
        try {
            // Fetch trip details with members and expenses
            const { data: trip, error: tripError } = await this.supabase
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
                    ),
                    trip_expenses (
                        *
                    )
                `)
                .eq('id', tripId)
                .single();

            if (tripError) throw tripError;

            // Calculate total expenses
            const totalExpenses = trip.trip_expenses.reduce((sum, expense) => {
                // Note: In a production app, you'd want to handle currency conversion
                return sum + Number(expense.amount);
            }, 0);

            return {
                ...trip,
                totalExpenses,
                remainingBudget: trip.budget_amount ? trip.budget_amount - totalExpenses : null
            };
        } catch (error) {
            throw this.handleError('Failed to fetch trip details', error);
        }
    }

    async updateTrip(tripId, updates) {
        try {
            const { data: trip, error } = await this.supabase
                .from('trips')
                .update(updates)
                .eq('id', tripId)
                .select()
                .single();

            if (error) throw error;
            return trip;
        } catch (error) {
            throw this.handleError('Failed to update trip', error);
        }
    }

    async deleteTrip(tripId) {
        try {
            // Check user's role
            const { data: member } = await this.supabase
                .from('trip_members')
                .select('role')
                .eq('trip_id', tripId)
                .eq('user_id', this.currentUser.id)
                .single();

            if (member?.role !== 'owner') {
                throw new Error('Only trip owners can delete trips');
            }

            const { error } = await this.supabase
                .from('trips')
                .delete()
                .eq('id', tripId);

            if (error) throw error;
            return true;
        } catch (error) {
            throw this.handleError('Failed to delete trip', error);
        }
    }

    // Member Management
    async addTripMember(tripId, userId, role = 'viewer') {
        try {
            const { data, error } = await this.supabase
                .from('trip_members')
                .insert({
                    trip_id: tripId,
                    user_id: userId,
                    role
                })
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            throw this.handleError('Failed to add trip member', error);
        }
    }

    async updateMemberRole(tripId, userId, newRole) {
        try {
            const { data, error } = await this.supabase
                .from('trip_members')
                .update({ role: newRole })
                .eq('trip_id', tripId)
                .eq('user_id', userId)
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            throw this.handleError('Failed to update member role', error);
        }
    }

    async removeTripMember(tripId, userId) {
        try {
            const { error } = await this.supabase
                .from('trip_members')
                .delete()
                .eq('trip_id', tripId)
                .eq('user_id', userId);

            if (error) throw error;
            return true;
        } catch (error) {
            throw this.handleError('Failed to remove trip member', error);
        }
    }

    // Expense Management
    async addExpense(tripId, { amount, currency = 'USD', category, description, date, receiptFile }) {
        try {
            let receiptUrl = null;

            // Upload receipt if provided
            if (receiptFile) {
                const { data: uploadData, error: uploadError } = await this.supabase.storage
                    .from('trip-documents')
                    .upload(
                        `receipts/${tripId}/${Date.now()}_${receiptFile.name}`,
                        receiptFile
                    );

                if (uploadError) throw uploadError;
                receiptUrl = uploadData.path;
            }

            const { data: expense, error } = await this.supabase
                .from('trip_expenses')
                .insert({
                    trip_id: tripId,
                    user_id: this.currentUser.id,
                    amount,
                    currency,
                    category,
                    description,
                    date,
                    receipt_url: receiptUrl
                })
                .select()
                .single();

            if (error) throw error;
            return expense;
        } catch (error) {
            throw this.handleError('Failed to add expense', error);
        }
    }

    // File Management
    async uploadTripFile(tripId, file) {
        try {
            const filePath = `trips/${tripId}/${Date.now()}_${file.name}`;
            
            const { data: uploadData, error: uploadError } = await this.supabase.storage
                .from('trip-documents')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            // Get the public URL
            const { data: { publicUrl } } = this.supabase.storage
                .from('trip-documents')
                .getPublicUrl(filePath);

            // Update trip's files array
            const { data: trip } = await this.supabase
                .from('trips')
                .select('files')
                .eq('id', tripId)
                .single();

            const updatedFiles = [
                ...trip.files,
                {
                    name: file.name,
                    path: filePath,
                    url: publicUrl,
                    uploaded_at: new Date().toISOString(),
                    uploaded_by: this.currentUser.id
                }
            ];

            const { error: updateError } = await this.supabase
                .from('trips')
                .update({ files: updatedFiles })
                .eq('id', tripId);

            if (updateError) throw updateError;

            return {
                name: file.name,
                path: filePath,
                url: publicUrl
            };
        } catch (error) {
            throw this.handleError('Failed to upload file', error);
        }
    }

    async deleteTripFile(tripId, filePath) {
        try {
            // Delete from storage
            const { error: deleteError } = await this.supabase.storage
                .from('trip-documents')
                .remove([filePath]);

            if (deleteError) throw deleteError;

            // Update trip's files array
            const { data: trip } = await this.supabase
                .from('trips')
                .select('files')
                .eq('id', tripId)
                .single();

            const updatedFiles = trip.files.filter(f => f.path !== filePath);

            const { error: updateError } = await this.supabase
                .from('trips')
                .update({ files: updatedFiles })
                .eq('id', tripId);

            if (updateError) throw updateError;

            return true;
        } catch (error) {
            throw this.handleError('Failed to delete file', error);
        }
    }

    // Utility Methods
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

        // if (start < new Date()) {
        //     throw new Error('Start date cannot be in the past');
        // }
    }

    handleError(message, error) {
        console.error(message, error);
        const errorMessage = error?.message || 'An unexpected error occurred';
        return new Error(`${message}: ${errorMessage}`);
    }

    // Event Handlers
    handleTripChange = (payload) => {
        this.notifySubscribers('trip', payload);
    }

    handleMemberChange = (payload) => {
        this.notifySubscribers('member', payload);
    }

    handleExpenseChange = (payload) => {
        this.notifySubscribers('expense', payload);
    }

    // Subscription Management
    subscribe(event, callback) {
        if (!this.subscribers.has(event)) {
            this.subscribers.set(event, new Set());
        }
        this.subscribers.get(event).add(callback);
        return () => this.subscribers.get(event).delete(callback);
    }

    notifySubscribers(event, payload) {
        if (this.subscribers.has(event)) {
            this.subscribers.get(event).forEach(callback => callback(payload));
        }
    }
}

export default TripManager;
