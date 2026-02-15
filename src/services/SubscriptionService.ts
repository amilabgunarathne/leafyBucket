import { supabase } from '../lib/supabase';

// Helper types matching the new schema
export interface Subscription {
    id: string;
    user_id: string;
    bucket_type_id: string;
    plan_type: 'monthly' | 'weekly';
    total_entitled_deliveries: number;
    deliveries_used: number;
    status: 'active' | 'paused' | 'completed' | 'cancelled';
    started_at: string;
    next_delivery_date: string;
    shipping_address: string;
    // Join fields
    bucket_type?: BucketType;
}

export interface BucketType {
    id: string;
    name: string;
    description: string;
    display_item_range: string;
    monthly_price: number;
    handling_fee: number;
    is_active?: boolean;
    root_count?: number;
    bushy_count?: number;
    leafy_count?: number;
    /** Budget share % per category (0–100). Should sum to 100. Source of truth for allocation. */
    root_budget_pct?: number;
    leafy_budget_pct?: number;
    bushy_budget_pct?: number;
}

export interface Delivery {
    id: string;
    subscription_id: string;
    delivery_index: number;
    scheduled_date: string;
    status: 'open' | 'locked' | 'delivered' | 'skipped';
    weekly_budget: number;
    locked_at?: string;
    delivered_at?: string;
}

export interface DeliveryItem {
    id: string;
    delivery_id: string;
    vegetable_id: string;
    category_id: string;
    allocated_budget: number;
    planned_quantity: number;
    actual_quantity?: number;
    is_substituted: boolean;
    // Join fields
    vegetable?: any;
}

export interface CustomisationAction {
    id: string;
    delivery_id: string;
    action_type: 'remove' | 'replace' | 'add';
    removed_vegetable_id?: string;
    added_vegetable_id?: string;
    created_at: string;
}

class SubscriptionService {
    private static instance: SubscriptionService;

    static getInstance(): SubscriptionService {
        if (!SubscriptionService.instance) {
            SubscriptionService.instance = new SubscriptionService();
        }
        return SubscriptionService.instance;
    }

    /**
     * Get all active bucket types
     */
    async getBucketTypes(): Promise<BucketType[]> {
        const { data, error } = await supabase
            .from('bucket_types')
            .select('*')
            .eq('is_active', true)
            .order('monthly_price', { ascending: true });

        if (error) {
            console.error("Error fetching bucket types:", error);
            return [];
        }

        return data || [];
    }

    /**
     * Create a new subscription for a user
     */
    async createSubscription(userId: string, bucketTypeId: string, planType: 'monthly' | 'weekly' = 'monthly'): Promise<Subscription> {
        // 1. Get bucket details
        const { data: bucketType, error: btError } = await supabase
            .from('bucket_types')
            .select('*')
            .eq('id', bucketTypeId)
            .single();

        if (btError) throw btError;

        // 2. Pre-cleanup: Mark any existing active subscriptions as cancelled
        await supabase
            .from('subscriptions')
            .update({ status: 'cancelled' })
            .eq('user_id', userId)
            .eq('status', 'active');

        // 3. Create New Subscription
        const entitlement = planType === 'monthly' ? 4 : 1;
        const { data: sub, error: subError } = await supabase
            .from('subscriptions')
            .insert({
                user_id: userId,
                bucket_type_id: bucketTypeId,
                plan_type: planType,
                total_entitled_deliveries: entitlement,
                status: 'active',
                started_at: new Date().toISOString()
            })
            .select()
            .single();

        if (subError) throw subError;

        // 3. Create initial deliveries (Scheduled for next 4 Sundays)
        const deliveries = [];
        const today = new Date();
        // Start from next Sunday
        const nextSunday = new Date(today);
        nextSunday.setDate(today.getDate() + (7 - today.getDay()) % 7);
        if (nextSunday <= today) nextSunday.setDate(nextSunday.getDate() + 7);

        for (let i = 1; i <= entitlement; i++) {
            const scheduledDate = new Date(nextSunday);
            scheduledDate.setDate(nextSunday.getDate() + (i - 1) * 7);

            deliveries.push({
                subscription_id: sub.id,
                delivery_index: i,
                scheduled_date: scheduledDate.toISOString().split('T')[0],
                status: 'open',
                weekly_budget: (bucketType.monthly_price - bucketType.handling_fee) / entitlement
            });
        }

        const { error: delError } = await supabase
            .from('deliveries')
            .insert(deliveries);

        if (delError) {
            console.error("Error creating deliveries:", delError);
            // Note: In a real app, we'd want a transaction here or cleanup
        }

        return sub;
    }

    /**
     * Get active subscription for user with current delivery
     */
    async getActiveSubscription(userId: string): Promise<{ subscription: Subscription, currentDelivery: Delivery | null } | null> {
        const { data: sub, error } = await supabase
            .from('subscriptions')
            .select('*, bucket_type:bucket_types(*)')
            .eq('user_id', userId)
            .eq('status', 'active')
            .maybeSingle();

        if (error || !sub) return null;

        // Get next open delivery
        const { data: delivery } = await supabase
            .from('deliveries')
            .select('*')
            .eq('subscription_id', sub.id)
            .eq('status', 'open')
            .order('scheduled_date', { ascending: true })
            .limit(1)
            .maybeSingle();

        return {
            subscription: sub,
            currentDelivery: delivery
        };
    }

    /**
     * Record a customization action
     */
    async logCustomization(deliveryId: string, action: Omit<CustomisationAction, 'id' | 'created_at' | 'delivery_id'>): Promise<void> {
        const { error } = await supabase
            .from('customisation_actions')
            .insert({
                delivery_id: deliveryId,
                ...action
            });

        if (error) throw error;
    }

    /**
     * Skip/Pause a delivery (Carry-forward logic)
     */
    async skipDelivery(deliveryId: string): Promise<void> {
        // 1. Mark current as skipped
        const { data: skippedDelivery, error: updateError } = await supabase
            .from('deliveries')
            .update({ status: 'skipped' })
            .eq('id', deliveryId)
            .select()
            .single();

        if (updateError) throw updateError;

        // 2. Create a new delivery at the end of the chain
        const { data: lastDelivery } = await supabase
            .from('deliveries')
            .select('delivery_index, scheduled_date')
            .eq('subscription_id', skippedDelivery.subscription_id)
            .order('delivery_index', { ascending: false })
            .limit(1)
            .single();

        if (lastDelivery) {
            const lastDate = new Date(lastDelivery.scheduled_date);
            const newDate = new Date(lastDate);
            newDate.setDate(lastDate.getDate() + 7);

            await supabase
                .from('deliveries')
                .insert({
                    subscription_id: skippedDelivery.subscription_id,
                    delivery_index: lastDelivery.delivery_index + 1,
                    scheduled_date: newDate.toISOString().split('T')[0],
                    status: 'open',
                    weekly_budget: skippedDelivery.weekly_budget
                });
        }
    }

    /**
     * Update subscription plan (Bucket Type)
     */
    async updateSubscriptionPlan(subscriptionId: string, bucketTypeId: string): Promise<void> {
        // 1. Get bucket details for new budget
        const { data: bucketType, error: btError } = await supabase
            .from('bucket_types')
            .select('*')
            .eq('id', bucketTypeId)
            .single();

        if (btError) throw btError;

        // 2. Update Subscription
        const { error: subError } = await supabase
            .from('subscriptions')
            .update({ bucket_type_id: bucketTypeId })
            .eq('id', subscriptionId);

        if (subError) throw subError;

        // 3. Update future open deliveries budget
        const weeklyBudget = (bucketType.monthly_price - bucketType.handling_fee) / 4;
        const { error: delError } = await supabase
            .from('deliveries')
            .update({ weekly_budget: weeklyBudget })
            .eq('subscription_id', subscriptionId)
            .eq('status', 'open');

        if (delError) {
            console.error("Error updating future delivery budgets:", delError);
        }
    }

    /**
     * Update subscription status (Active/Paused/Cancelled)
     */
    async updateSubscriptionStatus(subscriptionId: string, status: Subscription['status']): Promise<void> {
        const { error } = await supabase
            .from('subscriptions')
            .update({ status })
            .eq('id', subscriptionId);

        if (error) throw error;
    }

    /**
     * Helper to get bucket type by ID
     */
    async getBucketType(bucketTypeId: string): Promise<BucketType> {
        const { data, error } = await supabase
            .from('bucket_types')
            .select('*')
            .eq('id', bucketTypeId)
            .single();

        if (error) throw error;
        return data;
    }
}

export default SubscriptionService;
