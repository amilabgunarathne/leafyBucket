import { supabase } from '../lib/supabase';
import {
    type DeliveryCustomizationsState,
    deliveryCustomizationsToJson,
} from '../utils/deliveryCustomizations';
import { getCurrentWeekDateRange } from '../utils/marketWeekUtils';
import {
    type BillingPlanCode,
    type ChargeBreakdown,
    type SubscriptionPlanRow,
    DEFAULT_PACK_WEEKS,
    computeSubscriptionCharge,
    getPlanBillingListPrice,
    getWeeklyVegetableBudget,
} from '../utils/paymentMethodDisplay';

// Helper types matching the new schema
export interface PaymentMethod {
    id: string;
    code: string;
    name: string;
    description: string | null;
    sort_order: number;
    is_enabled: boolean;
    discount_pct?: number;
    discount_fixed?: number;
}

export type SubscriptionPlan = SubscriptionPlanRow;

export interface Subscription {
    id: string;
    user_id: string;
    bucket_type_id: string;
    subscription_plan_id?: string | null;
    deliveries_used: number;
    status: 'active' | 'paused' | 'completed' | 'cancelled';
    started_at: string;
    next_delivery_date: string;
    shipping_address?: string | null;
    payment_method_id?: string | null;
    previous_subscription_id?: string | null;
    completed_at?: string | null;
    list_price?: number | null;
    discount_total?: number | null;
    charge_amount?: number | null;
    discount_breakdown?: ChargeBreakdown | null;
    bucket_type?: BucketType;
    payment_method?: PaymentMethod | null;
    subscription_plan?: SubscriptionPlan | null;
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
    /** Definitive when delivered; provisional for current week only; null for future weeks. */
    delivery_index: number | null;
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
    weight: string;
    is_substituted: boolean;
    vegetable?: { id: string; name: string };
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

    /** Weeks covered by `bucket_types.monthly_price` — from monthly plan entitlement. */
    async getPackWeeks(): Promise<number> {
        const { data, error } = await supabase
            .from('subscription_plans')
            .select('entitled_deliveries')
            .eq('code', 'monthly')
            .eq('is_active', true)
            .maybeSingle();
        if (error) {
            console.warn('[getPackWeeks]', error.message);
        }
        return Math.max(Number(data?.entitled_deliveries) || DEFAULT_PACK_WEEKS, 1);
    }

    /**
     * Create a new subscription: bucket + billing plan + payment method.
     */
    async createSubscription(
        userId: string,
        bucketTypeId: string,
        planType: BillingPlanCode = 'monthly',
        paymentMethodId?: string | null
    ): Promise<Subscription> {
        const { data: bucketType, error: btError } = await supabase
            .from('bucket_types')
            .select('*')
            .eq('id', bucketTypeId)
            .single();

        if (btError) throw btError;

        const { data: planRow, error: planErr } = await supabase
            .from('subscription_plans')
            .select('id, code, entitled_deliveries, prepaid_discount_pct, prepaid_discount_fixed')
            .eq('code', planType)
            .eq('is_active', true)
            .maybeSingle();
        if (planErr) throw planErr;
        if (!planRow) throw new Error(`Subscription plan not found: ${planType}`);

        let paymentRow: PaymentMethod | null = null;
        if (paymentMethodId) {
            const allowed = await this.getPaymentMethodsForPlan(planRow.id);
            paymentRow = allowed.find((p) => p.id === paymentMethodId) ?? null;
            if (!paymentRow) {
                throw new Error('Selected payment method is not available for this plan');
            }
        }

        const packWeeks = await this.getPackWeeks();
        const listPrice = getPlanBillingListPrice({
            packPrice: bucketType.monthly_price,
            planCode: planRow.code,
            packWeeks,
        });
        const charge = computeSubscriptionCharge({
            listPrice,
            handlingFee: bucketType.handling_fee,
            plan: planRow,
            payment: paymentRow,
        });

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

        const { data: sub, error: subError } = await supabase
            .from('subscriptions')
            .insert({
                user_id: userId,
                bucket_type_id: bucketTypeId,
                subscription_plan_id: planRow.id,
                payment_method_id: paymentRow?.id ?? null,
                status: 'active',
                started_at: new Date().toISOString(),
                list_price: charge.list_price,
                discount_total: charge.discount_total,
                charge_amount: charge.charge_amount,
                discount_breakdown: charge,
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
                payment_method_id: paymentRow?.id ?? null,
                charge,
            },
        });

        const { week_start_date, week_end_date } = getCurrentWeekDateRange();
        const weeklyBudget = getWeeklyVegetableBudget(
            bucketType.monthly_price,
            bucketType.handling_fee,
            packWeeks
        );

        const { error: delError } = await supabase.from('deliveries').insert({
            subscription_id: sub.id,
            delivery_index: null,
            scheduled_date: week_end_date,
            status: 'open',
            weekly_budget: weeklyBudget,
            customizations: {},
        });

        if (delError) {
            console.error('Error creating first delivery:', delError);
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

    async getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
        const { data, error } = await supabase
            .from('subscription_plans')
            .select(
                'id, code, name, description, entitled_deliveries, prepaid_discount_pct, prepaid_discount_fixed, sort_order, is_active'
            )
            .eq('is_active', true)
            .order('sort_order', { ascending: true });

        if (error) {
            console.error('Error fetching subscription plans:', error);
            return [];
        }
        return (data || []) as SubscriptionPlan[];
    }

    async getPaymentMethodsForPlan(subscriptionPlanId: string): Promise<PaymentMethod[]> {
        const { data, error } = await supabase.rpc('get_payment_methods_for_plan', {
            p_subscription_plan_id: subscriptionPlanId,
        });
        if (!error && Array.isArray(data) && data.length > 0) {
            return data as PaymentMethod[];
        }

        // Fallback if RPC missing: global enabled methods
        if (error) {
            console.warn('[getPaymentMethodsForPlan]', error.message);
        }
        return this.getPaymentMethods();
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
            .select('*, bucket_type:bucket_types(*), subscription_plan:subscription_plans(id, code, name, entitled_deliveries, prepaid_discount_pct, prepaid_discount_fixed)')
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
            .select(
                'id, bucket_type_id, subscription_plan_id, payment_method_id, bucket_type:bucket_types(id, name), subscription_plan:subscription_plans(id, code, entitled_deliveries, prepaid_discount_pct, prepaid_discount_fixed)'
            )
            .eq('id', subscriptionId)
            .maybeSingle();

        const { data: bucketType, error: btError } = await supabase
            .from('bucket_types')
            .select('*')
            .eq('id', bucketTypeId)
            .single();

        if (btError) throw btError;

        const planJoin = (prevSub as { subscription_plan?: SubscriptionPlan | SubscriptionPlan[] | null } | null)
            ?.subscription_plan;
        const plan = Array.isArray(planJoin) ? planJoin[0] : planJoin;

        let payment: PaymentMethod | null = null;
        const pmId = (prevSub as { payment_method_id?: string | null } | null)?.payment_method_id;
        if (pmId) {
            const { data: pm } = await supabase
                .from('payment_methods')
                .select('id, code, name, description, sort_order, is_enabled, discount_pct, discount_fixed')
                .eq('id', pmId)
                .maybeSingle();
            payment = pm as PaymentMethod | null;
        }

        const packWeeks = await this.getPackWeeks();
        const listPrice = getPlanBillingListPrice({
            packPrice: bucketType.monthly_price,
            planCode: plan?.code,
            packWeeks,
        });
        const charge = computeSubscriptionCharge({
            listPrice,
            handlingFee: bucketType.handling_fee,
            plan: plan ?? null,
            payment,
        });

        const { error: subError } = await supabase
            .from('subscriptions')
            .update({
                bucket_type_id: bucketTypeId,
                list_price: charge.list_price,
                discount_total: charge.discount_total,
                charge_amount: charge.charge_amount,
                discount_breakdown: charge,
            })
            .eq('id', subscriptionId);

        if (subError) throw subError;

        const weeklyBudget = getWeeklyVegetableBudget(
            bucketType.monthly_price,
            bucketType.handling_fee,
            packWeeks
        );
        const { error: delError } = await supabase
            .from('deliveries')
            .update({ weekly_budget: weeklyBudget })
            .eq('subscription_id', subscriptionId)
            .eq('status', 'open');

        if (delError) {
            console.error('Error updating future delivery budgets:', delError);
        }

        // Rematerialize only this subscription's open deliveries for the current week
        // (do not wipe other customers via a full-week rematerialize).
        try {
            const { week_start_date, week_end_date } = getCurrentWeekDateRange();
            const { data: openDels } = await supabase
                .from('deliveries')
                .select('id')
                .eq('subscription_id', subscriptionId)
                .eq('status', 'open')
                .gte('scheduled_date', week_start_date)
                .lte('scheduled_date', week_end_date);
            for (const d of openDels || []) {
                const { error: matErr } = await supabase.rpc('materialize_delivery_items_for_delivery', {
                    p_delivery_id: (d as { id: string }).id,
                });
                if (matErr) console.warn('[updateSubscriptionPlan] rematerialize', matErr.message);
            }
        } catch (matEx) {
            console.warn('[updateSubscriptionPlan] rematerialize skipped', matEx);
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
                charge,
            },
        });
    }

    /**
     * Change billing plan (weekly / monthly / one_time). Recomputes charge; clears payment if no longer allowed.
     */
    async updateSubscriptionBillingPlan(
        subscriptionId: string,
        userId: string,
        planCode: BillingPlanCode,
        paymentMethodId?: string | null
    ): Promise<void> {
        const { data: planRow, error: planErr } = await supabase
            .from('subscription_plans')
            .select('id, code, name, entitled_deliveries, prepaid_discount_pct, prepaid_discount_fixed')
            .eq('code', planCode)
            .eq('is_active', true)
            .maybeSingle();
        if (planErr) throw planErr;
        if (!planRow) throw new Error(`Plan not found: ${planCode}`);

        const { data: prev } = await supabase
            .from('subscriptions')
            .select(
                'id, subscription_plan_id, payment_method_id, bucket_type_id, bucket_type:bucket_types(monthly_price, handling_fee)'
            )
            .eq('id', subscriptionId)
            .eq('user_id', userId)
            .maybeSingle();
        if (!prev) throw new Error('Subscription not found');

        const allowed = await this.getPaymentMethodsForPlan(planRow.id);
        let nextPaymentId = paymentMethodId ?? prev.payment_method_id ?? null;
        if (nextPaymentId && !allowed.some((p) => p.id === nextPaymentId)) {
            nextPaymentId = allowed[0]?.id ?? null;
        }
        if (!nextPaymentId) {
            throw new Error('Choose a payment method allowed for this plan');
        }

        const payment = allowed.find((p) => p.id === nextPaymentId) ?? null;
        const btJoin = (prev as { bucket_type?: { monthly_price: number; handling_fee: number } | { monthly_price: number; handling_fee: number }[] | null }).bucket_type;
        const bt = Array.isArray(btJoin) ? btJoin[0] : btJoin;

        const packWeeks = await this.getPackWeeks();
        const listPrice = getPlanBillingListPrice({
            packPrice: bt?.monthly_price ?? 0,
            planCode: planRow.code,
            packWeeks,
        });
        const charge = computeSubscriptionCharge({
            listPrice,
            handlingFee: bt?.handling_fee ?? 0,
            plan: planRow,
            payment,
        });

        const { error } = await supabase
            .from('subscriptions')
            .update({
                subscription_plan_id: planRow.id,
                payment_method_id: nextPaymentId,
                list_price: charge.list_price,
                discount_total: charge.discount_total,
                charge_amount: charge.charge_amount,
                discount_breakdown: charge,
            })
            .eq('id', subscriptionId)
            .eq('user_id', userId);
        if (error) throw error;

        if (bt) {
            const weeklyBudget = getWeeklyVegetableBudget(
                bt.monthly_price,
                bt.handling_fee,
                packWeeks
            );
            await supabase
                .from('deliveries')
                .update({ weekly_budget: weeklyBudget })
                .eq('subscription_id', subscriptionId)
                .in('status', ['open', 'paused']);
        }

        await this.logSubscriptionEvent(subscriptionId, 'plan_changed', {
            previous_data: {
                subscription_plan_id: prev.subscription_plan_id,
                payment_method_id: prev.payment_method_id,
            },
            new_data: {
                subscription_plan_id: planRow.id,
                plan_code: planRow.code,
                payment_method_id: nextPaymentId,
                charge,
            },
        }, 'Billing plan changed');
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
            | 'admin_override'
            | 'cycle_completed',
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
            .select('id, code, name, description, sort_order, is_enabled, discount_pct, discount_fixed')
            .eq('is_enabled', true)
            .order('sort_order', { ascending: true });

        if (error) {
            console.error('Error fetching payment methods:', error);
            return [];
        }
        return data || [];
    }

    /**
     * Set payment method for a subscription (must be allowed for the sub's plan).
     * Recomputes charge snapshot.
     */
    async updateSubscriptionPaymentMethod(
        subscriptionId: string,
        paymentMethodId: string,
        userId: string
    ): Promise<{ id: string; payment_method_id: string | null }> {
        const { data: prev } = await supabase
            .from('subscriptions')
            .select(
                'payment_method_id, bucket_type_id, subscription_plan_id, bucket_type:bucket_types(monthly_price, handling_fee), subscription_plan:subscription_plans(id, code, prepaid_discount_pct, prepaid_discount_fixed, entitled_deliveries)'
            )
            .eq('id', subscriptionId)
            .eq('user_id', userId)
            .maybeSingle();

        if (!prev) {
            throw new Error('Could not save payment method. Check your subscription or try signing in again.');
        }

        const planId = (prev as { subscription_plan_id?: string | null }).subscription_plan_id;
        if (planId) {
            const allowed = await this.getPaymentMethodsForPlan(planId);
            if (!allowed.some((p) => p.id === paymentMethodId)) {
                throw new Error('This payment method is not available for your plan');
            }
        }

        const { data: pm } = await supabase
            .from('payment_methods')
            .select('id, code, name, description, sort_order, is_enabled, discount_pct, discount_fixed')
            .eq('id', paymentMethodId)
            .maybeSingle();

        const btJoin = (prev as { bucket_type?: { monthly_price: number; handling_fee: number } | { monthly_price: number; handling_fee: number }[] | null }).bucket_type;
        const bt = Array.isArray(btJoin) ? btJoin[0] : btJoin;
        const planJoin = (prev as { subscription_plan?: SubscriptionPlan | SubscriptionPlan[] | null }).subscription_plan;
        const plan = Array.isArray(planJoin) ? planJoin[0] : planJoin;

        const packWeeks = await this.getPackWeeks();
        const listPrice = getPlanBillingListPrice({
            packPrice: bt?.monthly_price ?? 0,
            planCode: plan?.code,
            packWeeks,
        });
        const charge = computeSubscriptionCharge({
            listPrice,
            handlingFee: bt?.handling_fee ?? 0,
            plan: plan ?? null,
            payment: pm as PaymentMethod | null,
        });

        const { data, error } = await supabase
            .from('subscriptions')
            .update({
                payment_method_id: paymentMethodId,
                list_price: charge.list_price,
                discount_total: charge.discount_total,
                charge_amount: charge.charge_amount,
                discount_breakdown: charge,
            })
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
            new_data: { payment_method_id: data.payment_method_id, charge },
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
