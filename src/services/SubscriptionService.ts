import { supabase } from '../lib/supabase';
import {
    type DeliveryCustomizationsState,
    deliveryCustomizationsToJson,
} from '../utils/deliveryCustomizations';
import { getCurrentWeekDateRange } from '../utils/marketWeekUtils';

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
    subscription_plan_id?: string | null;
    deliveries_used: number;
    status: 'active' | 'paused' | 'completed' | 'cancelled';
    started_at: string;
    next_delivery_date: string;
    shipping_address: string;
    payment_method_id?: string | null;
    // Join fields
    bucket_type?: BucketType;
    payment_method?: PaymentMethod | null;
    subscription_plan?: { id: string; code: string; name: string; entitled_deliveries: number } | null;
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
    status: 'open' | 'locked' | 'delivered' | 'skipped' | 'cancelled' | 'paused';
    weekly_budget: number;
    locked_at?: string;
    delivered_at?: string;
    customizations?: unknown;
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
    async createSubscription(
        userId: string,
        bucketTypeId: string,
        planType: 'monthly' | 'weekly' | 'one_time' = 'monthly'
    ): Promise<Subscription> {
        // 1. Get bucket details
        const { data: bucketType, error: btError } = await supabase
            .from('bucket_types')
            .select('*')
            .eq('id', bucketTypeId)
            .single();

        if (btError) throw btError;

        // 1b. Get plan details (entitlement)
        const { data: planRow, error: planErr } = await supabase
            .from('subscription_plans')
            .select('id, code, entitled_deliveries')
            .eq('code', planType)
            .eq('is_active', true)
            .maybeSingle();
        if (planErr) throw planErr;
        if (!planRow) throw new Error(`Subscription plan not found: ${planType}`);

        // 2. Pre-cleanup: Mark any existing active subscriptions as cancelled
        const { data: priorActive } = await supabase
            .from('subscriptions')
            .select('id, bucket_type_id, subscription_plan_id, status')
            .eq('user_id', userId)
            .eq('status', 'active');

        await supabase
            .from('subscriptions')
            .update({ status: 'cancelled' })
            .eq('user_id', userId)
            .eq('status', 'active');

        for (const old of priorActive || []) {
            await this.logSubscriptionEvent(old.id, 'cancelled', {
                previous_data: {
                    status: 'active',
                    bucket_type_id: old.bucket_type_id,
                    subscription_plan_id: old.subscription_plan_id,
                },
                new_data: { status: 'cancelled' },
            }, 'Replaced by a new subscription');
        }

        // 3. Create New Subscription
        const entitlement = typeof planRow.entitled_deliveries === 'number' && planRow.entitled_deliveries > 0
            ? planRow.entitled_deliveries
            : 1;
        const { data: sub, error: subError } = await supabase
            .from('subscriptions')
            .insert({
                user_id: userId,
                bucket_type_id: bucketTypeId,
                subscription_plan_id: planRow.id,
                status: 'active',
                started_at: new Date().toISOString()
            })
            .select()
            .single();

        if (subError) throw subError;

        await this.logSubscriptionEvent(sub.id, 'created', {
            previous_data: null,
            new_data: {
                status: 'active',
                bucket_type_id: bucketTypeId,
                bucket_type_name: bucketType.name,
                subscription_plan_id: planRow.id,
                plan_code: planRow.code,
            },
        });

        // Weekly model: create only this week's Sunday delivery (not a 4-week batch).
        // Later weeks are ensured when Admin creates/loads that market week (or customer ensure RPC).
        const { week_start_date, week_end_date } = getCurrentWeekDateRange();
        const weeklyBudget = (bucketType.monthly_price - bucketType.handling_fee) / entitlement;

        const { error: delError } = await supabase.from('deliveries').insert({
            subscription_id: sub.id,
            delivery_index: 1, // first entitlement slot; advances only when marked delivered
            scheduled_date: week_end_date,
            status: 'open',
            weekly_budget: weeklyBudget,
            customizations: {},
        });

        if (delError) {
            console.error('Error creating first delivery:', delError);
            // Fallback: customer-side ensure RPC (same Sunday)
            const { error: ensureErr } = await supabase.rpc('ensure_my_open_delivery_for_week', {
                p_week_start: week_start_date,
                p_week_end: week_end_date,
            });
            if (ensureErr) console.error('ensure_my_open_delivery_for_week', ensureErr.message);
        } else {
            await supabase
                .from('subscriptions')
                .update({ next_delivery_date: week_end_date })
                .eq('id', sub.id);
        }

        return sub;
    }

    /**
     * Cancel still-open deliveries scheduled before this calendar week's Monday.
     * Admin should mark delivered on time; if not, once the next week begins those rows are stale.
     * Cancelling them makes the next open delivery current (with its own empty customizations).
     * Idempotent. Uses SECURITY DEFINER RPC (subscribers have no broad UPDATE on deliveries).
     */
    async cancelStaleOpenDeliveries(): Promise<number> {
        const { week_start_date } = getCurrentWeekDateRange();
        const { data, error } = await supabase.rpc('cancel_my_stale_open_deliveries', {
            p_week_start: week_start_date,
        });
        if (error) {
            console.error('[cancelStaleOpenDeliveries]', error.message, { week_start_date });
            return 0;
        }
        const n = typeof data === 'number' ? data : Number(data) || 0;
        if (n > 0) {
            console.info('[cancelStaleOpenDeliveries] cancelled', n, 'delivery(ies) before', week_start_date);
        }
        return n;
    }

    /**
     * This calendar week's delivery row (open, paused, or skipped) — for UI hold state.
     * Does not create rows.
     */
    async getThisWeekDelivery(subscriptionId: string): Promise<Delivery | null> {
        await this.cancelStaleOpenDeliveries();
        const { week_start_date, week_end_date } = getCurrentWeekDateRange();
        const { data, error } = await supabase
            .from('deliveries')
            .select('*')
            .eq('subscription_id', subscriptionId)
            .in('status', ['open', 'paused', 'skipped'])
            .gte('scheduled_date', week_start_date)
            .lte('scheduled_date', week_end_date)
            .order('scheduled_date', { ascending: true })
            .order('delivery_index', { ascending: true })
            .limit(1)
            .maybeSingle();
        if (error) {
            console.error('[getThisWeekDelivery]', error.message);
            return null;
        }
        return (data as Delivery) ?? null;
    }

    /**
     * Open delivery to use for reading/writing this week's customizations.
     * Prefers scheduled_date in the current Mon–Sun week; else the next upcoming open
     * (scheduled on/after this Monday). If none exist (e.g. after cancelling stale opens),
     * creates an open delivery for this week's Sunday via RPC.
     */
    async resolveCustomizationDelivery(subscriptionId: string): Promise<Delivery | null> {
        await this.cancelStaleOpenDeliveries();
        const { week_start_date, week_end_date } = getCurrentWeekDateRange();

        // If this week was skipped, do not create another open delivery
        const weekDel = await this.getThisWeekDelivery(subscriptionId);
        if (weekDel?.status === 'skipped' || weekDel?.status === 'paused') {
            return null;
        }
        if (weekDel?.status === 'open') {
            return weekDel;
        }

        const { data: openRows, error } = await supabase
            .from('deliveries')
            .select('*')
            .eq('subscription_id', subscriptionId)
            .eq('status', 'open')
            .order('scheduled_date', { ascending: true })
            .order('delivery_index', { ascending: true });

        if (error) {
            console.error('[resolveCustomizationDelivery]', error.message);
        } else {
            const rows = (openRows || []) as Delivery[];
            const inWeek = rows.find((d) => {
                const d0 = String(d.scheduled_date).slice(0, 10);
                return d0 >= week_start_date && d0 <= week_end_date;
            });
            if (inWeek) return inWeek;

            const upcoming = rows.find((d) => String(d.scheduled_date).slice(0, 10) >= week_start_date);
            if (upcoming) return upcoming;
        }

        // No usable open delivery — create one for this week's Sunday (or paused if sub paused)
        const { data: ensured, error: ensureErr } = await supabase.rpc('ensure_my_open_delivery_for_week', {
            p_week_start: week_start_date,
            p_week_end: week_end_date,
        });
        if (ensureErr) {
            console.error(
                '[resolveCustomizationDelivery] ensure failed — run migration 20260731 / 20260807 on Supabase:',
                ensureErr.message,
                { week_start_date, week_end_date }
            );
            return null;
        }
        const row = ensured as Delivery | null;
        // Customization attaches only to open deliveries; paused = hold (no edit target)
        if (!row || row.status !== 'open') return null;
        return row;
    }

    /**
     * Get subscription for user (active or paused) with next open delivery if any
     * Paused subscriptions still return the plan so the app can show "resume when ready"
     */
    async getActiveSubscription(userId: string): Promise<{ subscription: Subscription, currentDelivery: Delivery | null } | null> {
        await this.cancelStaleOpenDeliveries();

        // Same shape as AuthContext (no payment_method embed — a bad/missing FK embed fails the whole query and leaves activeSubscription null).
        const { data: sub, error } = await supabase
            .from('subscriptions')
            .select('*, bucket_type:bucket_types(*), subscription_plan:subscription_plans(id, code, name, entitled_deliveries)')
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

        const inWeek = await this.resolveCustomizationDelivery(sub.id);

        return {
            subscription: sub,
            currentDelivery: inWeek
        };
    }

    /**
     * Record a customization action (best-effort audit; must not block save).
     */
    async logCustomization(deliveryId: string, action: Omit<CustomisationAction, 'id' | 'created_at' | 'delivery_id'>): Promise<void> {
        const { error } = await supabase
            .from('customisation_actions')
            .insert({
                delivery_id: deliveryId,
                ...action
            });

        if (error) {
            console.warn('[logCustomization] skipped:', error.message);
        }
    }

    /**
     * Persist bucket customizations on the open delivery row (`deliveries.customizations`).
     * Uses SECURITY DEFINER RPC so subscribers cannot mutate other columns via broad RLS.
     */
    async saveDeliveryCustomizations(
        deliveryId: string,
        customizations: DeliveryCustomizationsState
    ): Promise<void> {
        const { error } = await supabase.rpc('save_my_delivery_customizations', {
            p_delivery_id: deliveryId,
            p_customizations: deliveryCustomizationsToJson(customizations),
        });
        if (error) throw error;
    }

    /**
     * Skip this week's open delivery (status → skipped).
     * Uses SECURITY DEFINER RPC — subscribers cannot UPDATE deliveries directly.
     */
    async skipDeliveryThisWeek(): Promise<void> {
        const { week_start_date, week_end_date } = getCurrentWeekDateRange();
        const { data, error } = await supabase.rpc('skip_my_delivery_this_week', {
            p_week_start: week_start_date,
            p_week_end: week_end_date,
        });
        if (error) {
            console.error('[skipDeliveryThisWeek]', error.message);
            throw new Error(
                error.message.includes('Could not find the function') || error.message.includes('schema cache')
                    ? 'Skip is not available yet. Run SQL migration 20260807f_skip_my_delivery_this_week.sql on Supabase.'
                    : error.message
            );
        }
        console.info('[skipDeliveryThisWeek] ok', data);
    }

    /**
     * Undo skip for this week (skipped → open).
     */
    async unskipDeliveryThisWeek(): Promise<void> {
        const { week_start_date, week_end_date } = getCurrentWeekDateRange();
        const { data, error } = await supabase.rpc('unskip_my_delivery_this_week', {
            p_week_start: week_start_date,
            p_week_end: week_end_date,
        });
        if (error) {
            console.error('[unskipDeliveryThisWeek]', error.message);
            throw new Error(
                error.message.includes('Could not find the function') || error.message.includes('schema cache')
                    ? 'Resume skip is not available yet. Run SQL migration 20260807g_unskip_my_delivery_this_week.sql on Supabase.'
                    : error.message
            );
        }
        console.info('[unskipDeliveryThisWeek] ok', data);
    }

    /**
     * @deprecated Prefer skipDeliveryThisWeek(). Kept for any legacy callers.
     */
    async skipDelivery(deliveryId: string): Promise<void> {
        void deliveryId;
        await this.skipDeliveryThisWeek();
    }

    /**
     * Update subscription plan (Bucket Type)
     */
    async updateSubscriptionPlan(subscriptionId: string, bucketTypeId: string): Promise<void> {
        const { data: prevSub } = await supabase
            .from('subscriptions')
            .select('id, bucket_type_id, bucket_type:bucket_types(id, name)')
            .eq('id', subscriptionId)
            .maybeSingle();

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

        const prevBt = prevSub as {
            bucket_type_id?: string;
            bucket_type?: { id: string; name: string } | { id: string; name: string }[] | null;
        } | null;
        const prevJoined = Array.isArray(prevBt?.bucket_type) ? prevBt?.bucket_type[0] : prevBt?.bucket_type;

        await this.logSubscriptionEvent(subscriptionId, 'plan_changed', {
            previous_data: {
                bucket_type_id: prevBt?.bucket_type_id ?? null,
                plan: prevJoined?.name ?? null,
            },
            new_data: {
                bucket_type_id: bucketTypeId,
                plan: bucketType.name,
            },
        });
    }

    /**
     * Pause or resume subscription and sync current + next week deliveries (open ↔ paused).
     * Requires set_my_subscription_paused on Supabase (20260807c_pause_resume_ensure_deliveries.sql).
     */
    async updateSubscriptionStatus(subscriptionId: string, status: Subscription['status']): Promise<void> {
        if (status === 'paused' || status === 'active') {
            const { week_start_date } = getCurrentWeekDateRange();
            const { data, error: rpcError } = await supabase.rpc('set_my_subscription_paused', {
                p_paused: status === 'paused',
                p_current_week_start: week_start_date,
            });
            if (rpcError) {
                console.error('[updateSubscriptionStatus] set_my_subscription_paused', rpcError.message);
                throw new Error(
                    `Could not sync subscription + deliveries. Run SQL migration 20260807e_fix_pause_resume_status_enum_cast.sql on Supabase. (${rpcError.message})`
                );
            }
            console.info('[updateSubscriptionStatus] pause/resume ok', data);
            return;
        }

        const { error } = await supabase
            .from('subscriptions')
            .update({ status })
            .eq('id', subscriptionId);

        if (error) throw error;

        if (status === 'cancelled') {
            await this.logSubscriptionEvent(subscriptionId, 'cancelled', {
                previous_data: { status: 'active' },
                new_data: { status: 'cancelled' },
            });
        }
    }

    /**
     * Append-only subscription action ledger (best-effort; never blocks the main action).
     */
    async logSubscriptionEvent(
        subscriptionId: string,
        eventType:
            | 'created'
            | 'plan_changed'
            | 'paused'
            | 'resumed'
            | 'skipped'
            | 'unskipped'
            | 'cancelled'
            | 'payment_method_changed'
            | 'admin_override',
        eventData?: { previous_data?: unknown; new_data?: unknown } | null,
        reason?: string | null,
        deliveryId?: string | null
    ): Promise<void> {
        const { error } = await supabase.rpc('log_my_subscription_event', {
            p_subscription_id: subscriptionId,
            p_event_type: eventType,
            p_event_data: eventData ?? null,
            p_reason: reason ?? null,
            p_delivery_id: deliveryId ?? null,
        });
        if (error) {
            console.warn('[logSubscriptionEvent]', eventType, error.message);
        }
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
        const { data: prev } = await supabase
            .from('subscriptions')
            .select('payment_method_id')
            .eq('id', subscriptionId)
            .eq('user_id', userId)
            .maybeSingle();

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

        await this.logSubscriptionEvent(subscriptionId, 'payment_method_changed', {
            previous_data: { payment_method_id: prev?.payment_method_id ?? null },
            new_data: { payment_method_id: data.payment_method_id },
        });

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
