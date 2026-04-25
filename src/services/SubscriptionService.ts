import { supabase } from '../lib/supabase';
import type { SubscriptionCustomizationsState } from '../utils/subscriptionCustomizations';

// Helper types matching the new schema
export interface PaymentMethod {
    id: string;
    code: string;
    name: string;
    description: string | null;
    sort_order: number;
    is_enabled: boolean;
}

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
    payment_method_id?: string | null;
    // Join fields
    bucket_type?: BucketType;
    payment_method?: PaymentMethod | null;
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
    status: 'open' | 'locked' | 'delivered' | 'skipped' | 'cancelled';
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

/** Local calendar YYYY-MM-DD (browser timezone). After a Sunday, that date is before today from Monday onward. */
function formatLocalDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
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
     * Mark any still-open deliveries whose scheduled date is before today (local) as delivered,
     * bump subscriptions.deliveries_used, and point next delivery at the next open slot.
     * Idempotent: safe to call on every load.
     */
    async advancePastOpenDeliveries(userId: string): Promise<void> {
        const todayStr = formatLocalDate(new Date());
        const { data: sub, error: subErr } = await supabase
            .from('subscriptions')
            .select('id, deliveries_used')
            .eq('user_id', userId)
            .in('status', ['active', 'paused'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (subErr) {
            console.error('[advancePastOpenDeliveries] load subscription', subErr.message);
            return;
        }
        if (!sub) return;

        const nowIso = new Date().toISOString();
        const { data: closed, error: upErr } = await supabase
            .from('deliveries')
            .update({ status: 'delivered', delivered_at: nowIso })
            .eq('subscription_id', sub.id)
            .eq('status', 'open')
            .lt('scheduled_date', todayStr)
            .select('id');

        if (upErr) {
            console.error('[advancePastOpenDeliveries] update deliveries', upErr.message);
            return;
        }

        const n = closed?.length ?? 0;
        if (n === 0) return;

        const prevUsed = typeof sub.deliveries_used === 'number' ? sub.deliveries_used : 0;
        const { data: nextOpen } = await supabase
            .from('deliveries')
            .select('scheduled_date')
            .eq('subscription_id', sub.id)
            .eq('status', 'open')
            .order('scheduled_date', { ascending: true })
            .limit(1)
            .maybeSingle();

        const nextDate = nextOpen?.scheduled_date ?? null;
        const payload: Record<string, unknown> = {
            deliveries_used: prevUsed + n,
        };
        if (nextDate) {
            payload.next_delivery_date = nextDate;
            payload.next_delivery = nextDate;
        }

        const { error: subUpErr } = await supabase.from('subscriptions').update(payload).eq('id', sub.id);
        if (subUpErr) {
            console.error('[advancePastOpenDeliveries] update subscription', subUpErr.message);
        }
    }

    /**
     * Get subscription for user (active or paused) with next open delivery if any
     * Paused subscriptions still return the plan so the app can show "resume when ready"
     */
    async getActiveSubscription(userId: string): Promise<{ subscription: Subscription, currentDelivery: Delivery | null } | null> {
        await this.advancePastOpenDeliveries(userId);

        // Same shape as AuthContext (no payment_method embed — a bad/missing FK embed fails the whole query and leaves activeSubscription null).
        const { data: sub, error } = await supabase
            .from('subscriptions')
            .select('*, bucket_type:bucket_types(*)')
            .eq('user_id', userId)
            .in('status', ['active', 'paused'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) {
            console.error('[getActiveSubscription]', error.message, error);
            return null;
        }
        if (!sub) return null;

        const subAny = sub as Subscription & { payment_method?: PaymentMethod | PaymentMethod[] | null };
        const pid = subAny.payment_method_id ?? null;
        // Prefer RPC: reads payment_methods under SECURITY DEFINER but only for auth.uid()'s subscription (avoids RLS/embed gaps).
        if (pid) {
            const { data: rpcPm, error: rpcErr } = await supabase.rpc('get_payment_method_for_my_subscription');
            if (!rpcErr && rpcPm && typeof rpcPm === 'object' && 'code' in rpcPm) {
                subAny.payment_method = rpcPm as unknown as PaymentMethod;
            } else {
                const rawPm = subAny.payment_method;
                const pmJoined = Array.isArray(rawPm) ? rawPm[0] : rawPm;
                if (!pmJoined || !pmJoined.code) {
                    const { data: pmFallback } = await supabase
                        .from('payment_methods')
                        .select('id, code, name, description, sort_order, is_enabled')
                        .eq('id', pid)
                        .maybeSingle();
                    if (pmFallback) {
                        subAny.payment_method = pmFallback as PaymentMethod;
                    }
                }
            }
        }

        // When paused there may be no open delivery; when active, get next open delivery
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
     * Persist bucket customizations on the subscription so they survive reload (source of truth for UI).
     */
    async updateSubscriptionCustomizations(
        subscriptionId: string,
        customizations: SubscriptionCustomizationsState
    ): Promise<void> {
        const { error } = await supabase
            .from('subscriptions')
            .update({ customizations })
            .eq('id', subscriptionId);

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
     * Get enabled payment methods (for payment setup popup)
     */
    async getPaymentMethods(): Promise<PaymentMethod[]> {
        const { data, error } = await supabase
            .from('payment_methods')
            .select('id, code, name, description, sort_order, is_enabled')
            .eq('is_enabled', true)
            .order('sort_order', { ascending: true });

        if (error) {
            console.error('Error fetching payment methods:', error);
            return [];
        }
        return data || [];
    }

    /**
     * Set payment method for a subscription (scoped by user_id so RLS mismatches return an error, not a silent no-op).
     */
    async updateSubscriptionPaymentMethod(
        subscriptionId: string,
        paymentMethodId: string,
        userId: string
    ): Promise<{ id: string; payment_method_id: string | null }> {
        const { data, error } = await supabase
            .from('subscriptions')
            .update({ payment_method_id: paymentMethodId })
            .eq('id', subscriptionId)
            .eq('user_id', userId)
            .select('id, payment_method_id')
            .maybeSingle();

        if (error) throw error;
        if (!data) {
            throw new Error('Could not save payment method. Check your subscription or try signing in again.');
        }
        return data;
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
