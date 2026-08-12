import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ArrowLeft, RefreshCw, Upload, Download, Settings, AlertCircle, CheckCircle, ExternalLink, Copy, Eye, EyeOff, Shield, User, Plus, Edit, Trash2, ToggleLeft, ToggleRight, Package, DollarSign, Users, LayoutGrid, Calendar, Percent, Truck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import VegetableService, { Vegetable } from '../services/vegetableService';
import { supabase } from '../lib/supabase';
import type { BucketType } from '../services/SubscriptionService';
import { getCurrentWeekDateRange, getNextWeekDateRange, getVegCountFromBucketType } from '../utils/marketWeekUtils';
import { formatPaymentMethodLabel } from '../utils/paymentMethodDisplay';
import {
  formatScheduleDisplayWithWeekDates,
  formatCustomizationInstant,
  getCustomizationWindowInMarketWeek,
  getScheduleEditState,
  getScheduleWindowPartsForLocalWeek,
  validateScheduleWithinMarketWeek,
  scheduleFromMarketWeek,
} from '../utils/customizationSchedule';
import { ScheduleWindowPairCards } from '../components/ScheduleWindowPairCards';

export interface MarketWeek {
  id: string;
  week_start_date: string;
  week_end_date: string;
  is_locked: boolean;
  created_at?: string;
  open_dow?: number | null;
  open_time?: string | null;
  close_dow?: number | null;
  close_time?: string | null;
}

const toWeekStart = (d: string | null | undefined): string => (d ? String(d).slice(0, 10) : '');

/** Supabase/PostgREST errors are often plain objects; String(e) becomes "[object Object]". */
function formatUnknownError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e != null && typeof e === 'object') {
    const o = e as Record<string, unknown>;
    const msg = o.message != null ? String(o.message) : '';
    const details = o.details != null ? String(o.details) : '';
    const hint = o.hint != null ? String(o.hint) : '';
    const code = o.code != null ? String(o.code) : '';
    const parts = [msg, details, hint, code ? `(${code})` : ''].filter((s) => s.length > 0);
    if (parts.length) return parts.join(' — ');
  }
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

/** Delivery statuses admins can set (must match DB / RLS). Unknown legacy values still show in the list. */
const WEEKLY_DELIVERY_STATUSES = ['open', 'paused', 'locked', 'delivered', 'skipped', 'cancelled'] as const;

function statusOptionsForRow(current: string): string[] {
  const allowed = WEEKLY_DELIVERY_STATUSES as readonly string[];
  if (allowed.includes(current)) return [...WEEKLY_DELIVERY_STATUSES];
  return [current, ...WEEKLY_DELIVERY_STATUSES];
}

const AdminPage = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('vegetables');
  const [vegetables, setVegetables] = useState<Vegetable[]>([]);
  const [bucketTypes, setBucketTypes] = useState<BucketType[]>([]);
  const [profiles, setProfiles] = useState<{ id: string; email: string; full_name: string | null; role: string }[]>([]);
  const [marketWeeks, setMarketWeeks] = useState<MarketWeek[]>([]);
  const [adminPlans, setAdminPlans] = useState<
    {
      id: string;
      code: string;
      name: string;
      entitled_deliveries: number;
      prepaid_discount_pct: number;
      prepaid_discount_fixed: number;
    }[]
  >([]);
  const [adminPaymentMethods, setAdminPaymentMethods] = useState<
    { id: string; code: string; name: string; discount_pct: number; discount_fixed: number; is_enabled: boolean }[]
  >([]);
  const [planPaymentRows, setPlanPaymentRows] = useState<
    { subscription_plan_id: string; payment_method_id: string; is_enabled: boolean }[]
  >([]);
  const [plansPayLoading, setPlansPayLoading] = useState(false);
  const [marketPricesByWeek, setMarketPricesByWeek] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [selectedVegetable, setSelectedVegetable] = useState<Vegetable | null>(null);
  const [showVegetableModal, setShowVegetableModal] = useState(false);
  /** Inline price draft per vegetable id (string so field can be empty while editing). Cleared on blur after save. */
  const [inlinePriceDraft, setInlinePriceDraft] = useState<Record<string, string>>({});
  const [vegCategories, setVegCategories] = useState<{ id: string; name: string; budget_share_percent: number }[]>([]);
  /** Per-bucket-type category ratios (root/leafy/bushy %). Key = bucket_type_id. */
  const [bucketTypeRatios, setBucketTypeRatios] = useState<Record<string, { root: number; leafy: number; bushy: number }>>({});
  /** veg_categories id by name (root, leafy, bushy) for saving ratios. */
  const [vegCategoryIdsByName, setVegCategoryIdsByName] = useState<Record<string, string>>({});
  /** Vegetables per (market_week_id, bucket_type_id). Key: `${market_week_id}_${bucket_type_id}`. */
  const [weekVeggiesByBucket, setWeekVeggiesByBucket] = useState<Record<string, string[]>>({});
  /** Current and next week IDs for "vegetables for week" under bucket types. */
  const [currentWeekId, setCurrentWeekId] = useState<string | null>(null);
  const [nextWeekId, setNextWeekId] = useState<string | null>(null);
  /** Vegetables tab: filter by category (root, leafy, bushy) */
  const [vegetableCategoryFilter, setVegetableCategoryFilter] = useState<'all' | 'root' | 'leafy' | 'bushy'>('all');
  /** Bucket types tab: current week customization window (open/close) editing */
  const [currentWeekScheduleEditOpen, setCurrentWeekScheduleEditOpen] = useState(false);
  const [currentWeekScheduleForm, setCurrentWeekScheduleForm] = useState({ open_dow: 3, open_time: '12:00', close_dow: 5, close_time: '23:59' });

  /** This week’s ship list (Mon–Sun local, same range as Market weeks) */
  const [weeklyOrders, setWeeklyOrders] = useState<
    {
      deliveryId: string;
      scheduledDate: string;
      status: string;
      deliveryIndex: number | null;
      weeklyBudget: number;
      subscriptionId: string;
      subscriptionStatus: string;
      customerName: string;
      email: string;
      addressLine: string;
      city: string;
      bucketName: string;
      paymentLabel: string;
    }[]
  >([]);
  const [weeklyOrdersLoading, setWeeklyOrdersLoading] = useState(false);
  const [weeklyOrdersRange, setWeeklyOrdersRange] = useState<{ start: string; end: string } | null>(null);
  const [weeklyOrderSavingId, setWeeklyOrderSavingId] = useState<string | null>(null);

  /** Only bulk-available veggies: used for bucket type "week vegetables" list so admin can't assign retail-only items to buckets */
  const vegetablesForBucket = useMemo(
    () => vegetables.filter((v) => v.isAvailableBulk),
    [vegetables]
  );

  useEffect(() => {
    loadData();
  }, []);

  // Sync current week schedule form from DB when current week row is available (Bucket types tab)
  useEffect(() => {
    if (currentWeekScheduleEditOpen || !currentWeekId) return;
    const row = marketWeeks.find((w) => w.id === currentWeekId);
    if (!row) return;
    const toHHMM = (t: string) => {
      const s = (t || '12:00').trim();
      const parts = s.split(':');
      const h = Math.min(23, Math.max(0, parseInt(parts[0], 10) || 0));
      const m = Math.min(59, Math.max(0, parseInt(parts[1], 10) || 0));
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    };
    setCurrentWeekScheduleForm({
      open_dow: row.open_dow ?? 3,
      open_time: toHHMM(row.open_time ?? '12:00'),
      close_dow: row.close_dow ?? 5,
      close_time: toHHMM(row.close_time ?? '23:59')
    });
  }, [currentWeekId, marketWeeks, currentWeekScheduleEditOpen]);

  // Prices tab always uses current week (no selection required)
  const pricesWeekId = currentWeekId;
  useEffect(() => {
    if (!pricesWeekId) return;
    const loadPricesForWeek = async () => {
      const { data } = await supabase
        .from('market_prices')
        .select('vegetable_id, price_per_unit')
        .eq('market_week_id', pricesWeekId);
      const map: Record<string, number> = {};
      (data || []).forEach((r: any) => { map[r.vegetable_id] = r.price_per_unit; });
      setMarketPricesByWeek(map);
    };
    loadPricesForWeek();
  }, [pricesWeekId]);

  const loadData = async () => {
    setLoading(true);
    try {
      await VegetableService.getInstance().initialize();
      const vegList = VegetableService.getInstance().getAllVegetables();

      // Load all bucket types (active and inactive) so admin can see and re-enable inactive ones
      const { data: btData } = await supabase.from('bucket_types').select('*').order('monthly_price', { ascending: true });
      const btList: BucketType[] = (btData || []) as BucketType[];

      const { data: profData } = await supabase.from('profiles').select('id, email, full_name, role');
      const { data: weeksData } = await supabase.from('market_weeks').select('id, week_start_date, week_end_date, is_locked, created_at, open_dow, open_time, close_dow, close_time').order('week_start_date', { ascending: false });
      const { data: catData } = await supabase.from('veg_categories').select('id, name, budget_share_percent').order('name');
      // Dedupe by name so we show one row per category (DB may have had duplicate seeds)
      const byName = new Map<string, { id: string; name: string; budget_share_percent: number }>();
      (catData || []).forEach((r: { id: string; name: string; budget_share_percent?: number | null }) => {
        const key = (r.name || '').toLowerCase();
        if (!byName.has(key)) {
          const pct = r.budget_share_percent != null ? Number(r.budget_share_percent) : NaN;
          byName.set(key, {
            id: r.id,
            name: r.name,
            budget_share_percent: !Number.isNaN(pct) && pct >= 0 ? Math.round(Math.min(100, pct)) : 34
          });
        }
      });
      setVegCategories(Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name)));
      const nameToId: Record<string, string> = {};
      byName.forEach((v, k) => { nameToId[k] = v.id; });
      setVegCategoryIdsByName(nameToId);
      // Category budget %: prefer columns on bucket_types (single source of truth)
      const ratiosByBucket: Record<string, { root: number; leafy: number; bushy: number }> = {};
      (btList || []).forEach((bt: { id: string; root_budget_pct?: number | null; leafy_budget_pct?: number | null; bushy_budget_pct?: number | null }) => {
        ratiosByBucket[bt.id] = {
          root: bt.root_budget_pct != null ? Math.max(0, Math.min(100, bt.root_budget_pct)) : 34,
          leafy: bt.leafy_budget_pct != null ? Math.max(0, Math.min(100, bt.leafy_budget_pct)) : 33,
          bushy: bt.bushy_budget_pct != null ? Math.max(0, Math.min(100, bt.bushy_budget_pct)) : 33
        };
      });
      setBucketTypeRatios(ratiosByBucket);
      let weeks = (weeksData || []) as MarketWeek[];
      const curRange = getCurrentWeekDateRange();
      const nxtRange = getNextWeekDateRange();
      let weeksList = weeks.map((w) => ({ id: w.id, week_start_date: w.week_start_date }));
      let curWeek = weeksList.find((w) => toWeekStart(w.week_start_date) === curRange.week_start_date);
      let nxtWeek = weeksList.find((w) => toWeekStart(w.week_start_date) === nxtRange.week_start_date);

      // Use first matching row per week (avoid duplicates: one row per week)
      curWeek = curWeek ?? weeksList.find((w) => toWeekStart(w.week_start_date) === curRange.week_start_date);
      nxtWeek = nxtWeek ?? weeksList.find((w) => toWeekStart(w.week_start_date) === nxtRange.week_start_date);
      // Only insert if no row exists for this week (don't create duplicates)
      if (!curWeek) {
        const { data: existing } = await supabase.from('market_weeks').select('id, week_start_date, week_end_date, is_locked, created_at, open_dow, open_time, close_dow, close_time').eq('week_start_date', curRange.week_start_date).limit(1).maybeSingle();
        if (existing) {
          const row = existing as MarketWeek;
          weeks = [row, ...weeks];
          weeksList = [{ id: row.id, week_start_date: row.week_start_date }, ...weeksList];
          curWeek = { id: row.id, week_start_date: row.week_start_date };
        } else {
          const { data: inserted, error: curUpsertErr } = await supabase
            .from('market_weeks')
            .upsert(
              {
                week_start_date: curRange.week_start_date,
                week_end_date: curRange.week_end_date,
              },
              { onConflict: 'week_start_date' }
            )
            .select('id, week_start_date, week_end_date, is_locked, created_at, open_dow, open_time, close_dow, close_time')
            .single();
          if (curUpsertErr) {
            console.error('[loadData] market_weeks upsert current week', curUpsertErr.message);
          } else if (inserted) {
            const row = inserted as MarketWeek;
            const idx = weeks.findIndex((w) => w.id === row.id);
            if (idx >= 0) weeks[idx] = row;
            else weeks = [row, ...weeks];
            weeksList = weeks.map((w) => ({ id: w.id, week_start_date: w.week_start_date }));
            curWeek = { id: row.id, week_start_date: row.week_start_date };
          }
        }
      }
      if (!nxtWeek) {
        const { data: existing } = await supabase.from('market_weeks').select('id, week_start_date, week_end_date, is_locked, created_at, open_dow, open_time, close_dow, close_time').eq('week_start_date', nxtRange.week_start_date).limit(1).maybeSingle();
        if (existing) {
          const row = existing as MarketWeek;
          weeks = [row, ...weeks];
          weeksList = weeks.map((w) => ({ id: w.id, week_start_date: w.week_start_date }));
          nxtWeek = { id: row.id, week_start_date: row.week_start_date };
        } else {
          const { data: inserted, error: nxtUpsertErr } = await supabase
            .from('market_weeks')
            .upsert(
              {
                week_start_date: nxtRange.week_start_date,
                week_end_date: nxtRange.week_end_date,
              },
              { onConflict: 'week_start_date' }
            )
            .select('id, week_start_date, week_end_date, is_locked, created_at, open_dow, open_time, close_dow, close_time')
            .single();
          if (nxtUpsertErr) {
            console.error('[loadData] market_weeks upsert next week', nxtUpsertErr.message);
          } else if (inserted) {
            const row = inserted as MarketWeek;
            const idx = weeks.findIndex((w) => w.id === row.id);
            if (idx >= 0) weeks[idx] = row;
            else weeks = [row, ...weeks];
            weeksList = weeks.map((w) => ({ id: w.id, week_start_date: w.week_start_date }));
            nxtWeek = { id: row.id, week_start_date: row.week_start_date };
          }
        }
      }

      setMarketWeeks(weeks);
      const cwId = curWeek?.id ?? weeksList[0]?.id ?? null;
      const nwId = nxtWeek?.id ?? weeksList[1]?.id ?? null;
      setCurrentWeekId(cwId);
      setNextWeekId(nwId);

      // Active sub + market week ⇒ ensure open delivery on that week's Sunday
      try {
        const { error: ensureCurErr } = await supabase.rpc('ensure_open_deliveries_for_market_week', {
          p_week_start: curRange.week_start_date,
          p_week_end: curRange.week_end_date,
        });
        if (ensureCurErr) console.error('[loadData] ensure deliveries current week', ensureCurErr.message);
        const { error: ensureNxtErr } = await supabase.rpc('ensure_open_deliveries_for_market_week', {
          p_week_start: nxtRange.week_start_date,
          p_week_end: nxtRange.week_end_date,
        });
        if (ensureNxtErr) console.error('[loadData] ensure deliveries next week', ensureNxtErr.message);
      } catch (ensureErr) {
        console.error('[loadData] ensure_open_deliveries_for_market_week', ensureErr);
      }

      const weekIds = [cwId, nwId].filter(Boolean) as string[];
      let weekVeggies: Record<string, string[]> = {};
      try {
        if (weekIds.length > 0 && btList.length > 0) {
          const { data: mwbvRows } = await supabase
            .from('market_week_bucket_vegetables')
            .select('market_week_id, bucket_type_id, vegetable_id, sort_order')
            .in('market_week_id', weekIds)
            .order('sort_order', { ascending: true });
          (mwbvRows || []).forEach((r: { market_week_id: string; bucket_type_id: string; vegetable_id: string }) => {
            const key = `${r.market_week_id}_${r.bucket_type_id}`;
            if (!weekVeggies[key]) weekVeggies[key] = [];
            weekVeggies[key].push(r.vegetable_id);
          });
        }
      } catch (_) {
        // table may not exist yet
      }
      setWeekVeggiesByBucket(weekVeggies);

      setVegetables(vegList);
      setBucketTypes(btList);
      setProfiles(profData || []);
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to load data' });
    } finally {
      setLoading(false);
    }
  };

  const loadWeeklyOrders = useCallback(async () => {
    const range = getCurrentWeekDateRange();
    setWeeklyOrdersRange({ start: range.week_start_date, end: range.week_end_date });
    setWeeklyOrdersLoading(true);
    try {
      const { data: pmRows, error: pmErr } = await supabase.from('payment_methods').select('id, code, name');
      if (pmErr) throw pmErr;
      const pmById = new Map((pmRows || []).map((r) => [r.id as string, r as { id: string; code: string; name: string }]));

      const { data, error } = await supabase
        .from('deliveries')
        .select(
          `
          id,
          scheduled_date,
          status,
          delivery_index,
          weekly_budget,
          subscriptions (
            id,
            status,
            user_id,
            payment_method_id,
            bucket_type:bucket_types (name)
          )
        `
        )
        .gte('scheduled_date', range.week_start_date)
        .lte('scheduled_date', range.week_end_date)
        .order('scheduled_date', { ascending: true });

      if (error) throw error;

      const rawList = (data || []) as unknown[];
      const userIds = new Set<string>();
      for (const item of rawList) {
        const d = item as Record<string, unknown>;
        const subRaw = d.subscriptions;
        const sub = Array.isArray(subRaw) ? subRaw[0] : subRaw;
        if (sub && typeof sub === 'object' && 'user_id' in sub) {
          const uid = (sub as { user_id?: string }).user_id;
          if (uid) userIds.add(uid);
        }
      }
      let profileById = new Map<
        string,
        { id: string; email?: string; full_name?: string | null; address?: string | null; city?: string | null }
      >();
      if (userIds.size > 0) {
        const { data: profRows, error: profErr } = await supabase
          .from('profiles')
          .select('id, email, full_name, address, city')
          .in('id', Array.from(userIds));
        if (profErr) throw profErr;
        profileById = new Map((profRows || []).map((p) => [p.id as string, p as { id: string; email?: string; full_name?: string | null; address?: string | null; city?: string | null }]));
      }

      const rows: {
        deliveryId: string;
        scheduledDate: string;
        status: string;
        deliveryIndex: number | null;
        weeklyBudget: number;
        subscriptionId: string;
        subscriptionStatus: string;
        customerName: string;
        email: string;
        addressLine: string;
        city: string;
        bucketName: string;
        paymentLabel: string;
      }[] = [];
      for (const item of rawList) {
        const d = item as Record<string, unknown>;
        const subRaw = d.subscriptions;
        const sub = Array.isArray(subRaw) ? subRaw[0] : subRaw;
        if (!sub || typeof sub !== 'object') continue;
        const s = sub as {
          id: string;
          status: string;
          user_id: string;
          payment_method_id: string | null;
          bucket_type?: unknown;
        };
        const p = profileById.get(s.user_id) ?? {
          email: undefined,
          full_name: undefined,
          address: undefined,
          city: undefined,
        };
        const btRaw = s.bucket_type;
        const bt = Array.isArray(btRaw) ? btRaw[0] : btRaw;
        const b = (bt && typeof bt === 'object' ? bt : {}) as { name?: string };
        const pm = s.payment_method_id ? pmById.get(s.payment_method_id) : null;
        const paymentLabel = pm ? formatPaymentMethodLabel(pm) : 'Not set';
        rows.push({
          deliveryId: String(d.id),
          scheduledDate: String(d.scheduled_date),
          status: String(d.status),
          deliveryIndex:
            d.delivery_index == null || d.delivery_index === ''
              ? null
              : Number(d.delivery_index),
          weeklyBudget: Number(d.weekly_budget),
          subscriptionId: s.id,
          subscriptionStatus: s.status,
          customerName: (p.full_name || '').trim() || '—',
          email: p.email || '—',
          addressLine: (p.address || '').trim() || '—',
          city: (p.city || '').trim() || '—',
          bucketName: b.name || '—',
          paymentLabel,
        });
      }

      rows.sort((a, b) => {
        const da = a.scheduledDate.localeCompare(b.scheduledDate);
        if (da !== 0) return da;
        return a.customerName.localeCompare(b.customerName);
      });
      setWeeklyOrders(rows);
    } catch (e: unknown) {
      console.error('loadWeeklyOrders', e);
      setMessage({ type: 'error', text: `Could not load weekly orders: ${formatUnknownError(e)}` });
      setWeeklyOrders([]);
    } finally {
      setWeeklyOrdersLoading(false);
    }
  }, []);

  const updateWeeklyDeliveryStatus = useCallback(async (deliveryId: string, newStatus: string) => {
    setWeeklyOrderSavingId(deliveryId);
    try {
      const payload: Record<string, unknown> = { status: newStatus };
      // delivered_at + subscription counters are handled by DB trigger (deliveries.status transition)
      const { error } = await supabase.from('deliveries').update(payload).eq('id', deliveryId);
      if (error) throw error;
      setWeeklyOrders((prev) =>
        prev.map((r) => (r.deliveryId === deliveryId ? { ...r, status: newStatus } : r))
      );
      setMessage({ type: 'success', text: 'Delivery status updated' });
    } catch (e: unknown) {
      console.error('updateWeeklyDeliveryStatus', e);
      setMessage({ type: 'error', text: `Could not update status: ${formatUnknownError(e)}` });
    } finally {
      setWeeklyOrderSavingId(null);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'weekly-orders') {
      void loadWeeklyOrders();
    }
  }, [activeTab, loadWeeklyOrders]);

  const loadPlansPay = useCallback(async () => {
    setPlansPayLoading(true);
    try {
      const [plansRes, pmRes, sppRes] = await Promise.all([
        supabase
          .from('subscription_plans')
          .select('id, code, name, entitled_deliveries, prepaid_discount_pct, prepaid_discount_fixed')
          .order('sort_order', { ascending: true }),
        supabase
          .from('payment_methods')
          .select('id, code, name, discount_pct, discount_fixed, is_enabled')
          .in('code', ['cash', 'card'])
          .order('sort_order', { ascending: true }),
        supabase
          .from('subscription_plan_payment_methods')
          .select('subscription_plan_id, payment_method_id, is_enabled'),
      ]);
      if (plansRes.error) throw plansRes.error;
      if (pmRes.error) throw pmRes.error;
      if (sppRes.error) throw sppRes.error;
      setAdminPlans((plansRes.data || []) as typeof adminPlans);
      setAdminPaymentMethods((pmRes.data || []) as typeof adminPaymentMethods);
      setPlanPaymentRows((sppRes.data || []) as typeof planPaymentRows);
    } catch (e) {
      setMessage({ type: 'error', text: `Could not load plans: ${formatUnknownError(e)}` });
    } finally {
      setPlansPayLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'plans') {
      void loadPlansPay();
    }
  }, [activeTab, loadPlansPay]);

  const handleExportData = () => {
    const dataStr = JSON.stringify({ vegetables }, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = `admin-data-${new Date().toISOString().split('T')[0]}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const handleImportData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target?.result as string);
          if (data.vegetables) setVegetables(data.vegetables);
          setMessage({ type: 'success', text: 'Data imported successfully' });
        } catch (error) {
          setMessage({ type: 'error', text: 'Failed to import data' });
        }
      };
      reader.readAsText(file);
    }
  };

  const handleVegetableAction = (action: 'add' | 'edit' | 'delete', vegetable?: Vegetable) => {
    if (action === 'add') {
      setSelectedVegetable(null);
      setShowVegetableModal(true);
    } else if (action === 'edit' && vegetable) {
      setSelectedVegetable(vegetable);
      setShowVegetableModal(true);
    } else if (action === 'delete' && vegetable) {
      if (confirm(`Are you sure you want to delete ${vegetable.name}?`)) {
        VegetableService.getInstance().deleteVegetable(vegetable.id);
        setVegetables(prev => prev.filter(v => v.id !== vegetable.id));
        setMessage({ type: 'success', text: 'Vegetable deleted successfully' });
      }
    }
  };

  const handleVegetableSave = async (vegetableData: any) => {
    try {
      if (selectedVegetable) {
        // Update existing
        const updated = await VegetableService.updateVegetable(selectedVegetable.id, vegetableData);
        setVegetables(prev => prev.map(v => v.id === selectedVegetable.id ? updated : v));
        setMessage({ type: 'success', text: 'Vegetable updated successfully' });
      } else {
        // Add new
        const newVegetable = await VegetableService.createVegetable(vegetableData);
        setVegetables(prev => [...prev, newVegetable]);
        setMessage({ type: 'success', text: 'Vegetable added successfully' });
      }
      setShowVegetableModal(false);
      setSelectedVegetable(null);
    } catch (error: unknown) {
      const err = error as { message?: string };
      const errMsg = err?.message ?? (error instanceof Error ? error.message : String(error));
      setMessage({ type: 'error', text: `Failed to save vegetable: ${errMsg}` });
    }
  };

  const handleRetailPriceUpdate = async (vegetableId: string, newPrice: number) => {
    try {
      await VegetableService.updateVegetable(vegetableId, { marketPricePer250g: newPrice });
      setVegetables(prev => prev.map(v =>
        v.id === vegetableId ? { ...v, marketPricePer250g: newPrice } : v
      ));
      setMessage({ type: 'success', text: 'Retail price updated' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to update retail price' });
    }
  };

  const handleBulkPriceUpdate = async (vegetableId: string, newPrice: number) => {
    try {
      await VegetableService.updateVegetable(vegetableId, { bulkPricePer250g: newPrice });
      setVegetables(prev => prev.map(v =>
        v.id === vegetableId ? { ...v, bulkPricePer250g: newPrice } : v
      ));
      setMessage({ type: 'success', text: 'Bulk price updated' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to update bulk price' });
    }
  };

  const handleToggleRetailAvailability = async (vegetableId: string) => {
    try {
      const vegetableService = VegetableService.getInstance();
      const success = await vegetableService.toggleVegetableRetailStatus(vegetableId);
      if (!success) {
        setMessage({ type: 'error', text: 'Failed to update retail availability' });
        return;
      }
      setVegetables(prev => prev.map(v =>
        v.id === vegetableId ? { ...v, isAvailableRetail: !v.isAvailableRetail } : v
      ));
      setMessage({ type: 'success', text: 'Retail availability updated' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to update retail availability' });
    }
  };

  const handleToggleBulkAvailability = async (vegetableId: string) => {
    try {
      const vegetableService = VegetableService.getInstance();
      const success = await vegetableService.toggleVegetableBulkStatus(vegetableId);
      if (!success) {
        setMessage({ type: 'error', text: 'Failed to update bulk availability' });
        return;
      }
      setVegetables(prev => prev.map(v =>
        v.id === vegetableId ? { ...v, isAvailableBulk: !v.isAvailableBulk } : v
      ));
      setMessage({ type: 'success', text: 'Bulk availability updated' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to update bulk availability' });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <Link to="/" className="flex items-center text-gray-600 hover:text-gray-900 transition-colors">
                <ArrowLeft className="w-5 h-5 mr-2" />
                Back to site
              </Link>
              <div className="h-6 w-px bg-gray-300" />
              <div className="flex items-center space-x-2">
                <Shield className="w-6 h-6 text-green-600" />
                <h1 className="text-xl font-semibold text-gray-900">Admin Dashboard</h1>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <User className="w-4 h-4" />
                <span>{user?.email}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Message Banner */}
      {message && (
        <div className={`${message.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'} border-l-4 p-4`}>
          <div className="flex items-center">
            {message.type === 'success' ? (
              <CheckCircle className="w-5 h-5 mr-2" />
            ) : (
              <AlertCircle className="w-5 h-5 mr-2" />
            )}
            <span>{message.text}</span>
            <button 
              onClick={() => setMessage(null)}
              className="ml-auto text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tab Navigation */}
        <div className="bg-white rounded-lg shadow-sm mb-8">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8 px-6">
              {[
                { id: 'vegetables', label: 'Vegetables', icon: Package },
                { id: 'buckets', label: 'Bucket types', icon: LayoutGrid },
                { id: 'prices', label: 'Market prices', icon: DollarSign },
                { id: 'weeks', label: 'Market weeks', icon: Calendar },
                { id: 'weekly-orders', label: "This week's orders", icon: Truck },
                { id: 'plans', label: 'Plans & pay', icon: Percent },
                { id: 'users', label: 'Users', icon: Users },
                { id: 'system', label: 'System', icon: Settings }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`${
                    activeTab === tab.id
                      ? 'border-green-500 text-green-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 transition-colors`}
                >
                  <tab.icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              ))}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'vegetables' && (
              <div className="space-y-6">
                {/* Vegetables Controls */}
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Vegetable Catalog & Pricing</h2>
                    <p className="text-sm text-gray-600">Manage available vegetables, their details, and pricing</p>
                  </div>
                  <button
                    onClick={() => handleVegetableAction('add')}
                    className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Vegetable</span>
                  </button>
                </div>

                {/* Category filter: Root, Leafy, Bushy */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-gray-700">Category:</span>
                  {(['all', 'root', 'leafy', 'bushy'] as const).map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setVegetableCategoryFilter(cat)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        vegetableCategoryFilter === cat
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </button>
                  ))}
                </div>

                {/* Vegetables grouped by category */}
                {(() => {
                  const filtered =
                    vegetableCategoryFilter === 'all'
                      ? vegetables
                      : vegetables.filter((v) => v.category === vegetableCategoryFilter);
                  const groups: { category: string; label: string; vegs: typeof vegetables }[] = [
                    { category: 'root', label: 'Root vegetables', vegs: filtered.filter((v) => v.category === 'root') },
                    { category: 'leafy', label: 'Leafy vegetables', vegs: filtered.filter((v) => v.category === 'leafy') },
                    { category: 'bushy', label: 'Bushy vegetables', vegs: filtered.filter((v) => v.category === 'bushy') }
                  ].filter((g) => g.vegs.length > 0);
                  return (
                    <div className="space-y-8">
                      {groups.map(({ category, label, vegs }) => (
                        <div key={category}>
                          <h3 className="text-sm font-semibold text-gray-800 mb-3 pb-2 border-b border-gray-200">
                            {label}
                            <span className="ml-2 text-gray-500 font-normal">({vegs.length})</span>
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {vegs.map((vegetable) => (
                    <div key={vegetable.id} className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">{vegetable.name}</h3>
                          <p className="text-sm text-gray-600 capitalize">{vegetable.category}</p>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleVegetableAction('edit', vegetable)}
                            className="p-2 text-gray-400 hover:text-blue-600 transition-colors"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleVegetableAction('delete', vegetable)}
                            className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Price per 250g: availability toggle in front of each price */}
                      <div className="mb-4 p-3 bg-green-50 rounded-lg space-y-3">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleToggleRetailAvailability(vegetable.id);
                            }}
                            className="flex-shrink-0 flex items-center"
                            type="button"
                            title={vegetable.isAvailableRetail ? 'Available for Shop (click to disable)' : 'Unavailable for Shop (click to enable)'}
                          >
                            {vegetable.isAvailableRetail ? (
                              <ToggleRight className="w-6 h-6 text-green-600 hover:text-green-700 transition-colors" />
                            ) : (
                              <ToggleLeft className="w-6 h-6 text-gray-400 hover:text-gray-600 transition-colors" />
                            )}
                          </button>
                          <div className="flex-1 min-w-0">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Retail (Shop) – LKR/250g</label>
                            <input
                              type="number"
                              value={inlinePriceDraft[`${vegetable.id}_retail`] ?? vegetable.marketPricePer250g}
                              onChange={(e) => setInlinePriceDraft((prev) => ({ ...prev, [`${vegetable.id}_retail`]: e.target.value }))}
                              onBlur={async () => {
                                const raw = inlinePriceDraft[`${vegetable.id}_retail`];
                                setInlinePriceDraft((prev) => {
                                  const next = { ...prev };
                                  delete next[`${vegetable.id}_retail`];
                                  return next;
                                });
                                if (raw === undefined || raw === '') return;
                                const num = parseFloat(raw);
                                if (!Number.isNaN(num) && num >= 0) await handleRetailPriceUpdate(vegetable.id, num);
                              }}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                              min="0"
                              step="0.01"
                              placeholder="0"
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleToggleBulkAvailability(vegetable.id);
                            }}
                            className="flex-shrink-0 flex items-center"
                            type="button"
                            title={vegetable.isAvailableBulk ? 'Available for Bucket (click to disable)' : 'Unavailable for Bucket (click to enable)'}
                          >
                            {vegetable.isAvailableBulk ? (
                              <ToggleRight className="w-6 h-6 text-green-600 hover:text-green-700 transition-colors" />
                            ) : (
                              <ToggleLeft className="w-6 h-6 text-gray-400 hover:text-gray-600 transition-colors" />
                            )}
                          </button>
                          <div className="flex-1 min-w-0">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Bulk (Bucket) – LKR/250g</label>
                            <input
                              type="number"
                              value={inlinePriceDraft[`${vegetable.id}_bulk`] ?? vegetable.bulkPricePer250g}
                              onChange={(e) => setInlinePriceDraft((prev) => ({ ...prev, [`${vegetable.id}_bulk`]: e.target.value }))}
                              onBlur={async () => {
                                const raw = inlinePriceDraft[`${vegetable.id}_bulk`];
                                setInlinePriceDraft((prev) => {
                                  const next = { ...prev };
                                  delete next[`${vegetable.id}_bulk`];
                                  return next;
                                });
                                if (raw === undefined || raw === '') return;
                                const num = parseFloat(raw);
                                if (!Number.isNaN(num) && num >= 0) await handleBulkPriceUpdate(vegetable.id, num);
                              }}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                              min="0"
                              step="0.01"
                              placeholder="0"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Season:</span>
                          <span className="font-medium">{vegetable.season}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Nutrition Score:</span>
                          <span className="font-medium">{vegetable.nutritionScore}/10</span>
                        </div>
                      </div>
                    </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}

            {activeTab === 'buckets' && (
              <div className="space-y-6">
                <h2 className="text-lg font-semibold text-gray-900">Bucket types</h2>
                <p className="text-sm text-gray-600">Edit plan sizes and pricing. Vegetables per week use the current week and next week automatically. Set when customization opens and closes in the box below.</p>

                {/* Current week customization window (open/close) - always visible so you can find it */}
                {(() => {
                  const now = new Date();
                  const currentWeekRow = currentWeekId ? marketWeeks.find((w) => w.id === currentWeekId) : null;
                  const scheduleRow = scheduleFromMarketWeek(currentWeekRow ?? null);
                  const scheduleLabels = formatScheduleDisplayWithWeekDates(now, scheduleRow);
                  const windowParts = getScheduleWindowPartsForLocalWeek(now, scheduleRow);
                  const scheduleEditState = getScheduleEditState(now, scheduleRow);
                  const toHHMM = (t: string) => {
                    const s = (t || '12:00').trim();
                    const parts = s.split(':');
                    const h = Math.min(23, Math.max(0, parseInt(parts[0], 10) || 0));
                    const m = Math.min(59, Math.max(0, parseInt(parts[1], 10) || 0));
                    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
                  };
                  const curRangePreview = getCurrentWeekDateRange();
                  const previewRow = currentWeekId
                    ? marketWeeks.find((w) => w.id === currentWeekId)
                    : marketWeeks.find((w) => toWeekStart(w.week_start_date) === curRangePreview.week_start_date);
                  const previewWeekStart = previewRow?.week_start_date ?? curRangePreview.week_start_date;
                  const previewWeekEnd = previewRow?.week_end_date ?? curRangePreview.week_end_date;
                  const previewScheduleRow: import('../utils/customizationSchedule').CustomizationScheduleRow = {
                    id: '',
                    open_dow: currentWeekScheduleForm.open_dow,
                    open_time: toHHMM(currentWeekScheduleForm.open_time) || '12:00',
                    close_dow: currentWeekScheduleForm.close_dow,
                    close_time: toHHMM(currentWeekScheduleForm.close_time) || '23:59',
                  };
                  const adminWindowPreview = getCustomizationWindowInMarketWeek(
                    previewWeekStart,
                    previewWeekEnd,
                    previewScheduleRow
                  );

                  const handleSaveCurrentWeekSchedule = async () => {
                    const openTime = toHHMM(currentWeekScheduleForm.open_time) || '12:00';
                    const closeTime = toHHMM(currentWeekScheduleForm.close_time) || '23:59';
                    const payload = {
                      open_dow: currentWeekScheduleForm.open_dow,
                      open_time: openTime,
                      close_dow: currentWeekScheduleForm.close_dow,
                      close_time: closeTime
                    };
                    const curRange = getCurrentWeekDateRange();
                    const existingRow = currentWeekId
                      ? marketWeeks.find((w) => w.id === currentWeekId)
                      : marketWeeks.find((w) => toWeekStart(w.week_start_date) === curRange.week_start_date);
                    const weekStart = existingRow?.week_start_date ?? curRange.week_start_date;
                    const weekEnd = existingRow?.week_end_date ?? curRange.week_end_date;
                    const scheduleCheck: import('../utils/customizationSchedule').CustomizationScheduleRow = {
                      id: '',
                      open_dow: payload.open_dow,
                      open_time: payload.open_time,
                      close_dow: payload.close_dow,
                      close_time: payload.close_time,
                    };
                    const validation = validateScheduleWithinMarketWeek(weekStart, weekEnd, scheduleCheck);
                    if (!validation.ok) {
                      setMessage({ type: 'error', text: validation.message });
                      return;
                    }
                    const rowId = existingRow?.id;
                    if (rowId) {
                      const { error } = await supabase.from('market_weeks').update(payload).eq('id', rowId);
                      if (error) {
                        setMessage({ type: 'error', text: error.message });
                        return;
                      }
                    } else {
                      const { error: insertErr } = await supabase
                        .from('market_weeks')
                        .upsert(
                          {
                            week_start_date: curRange.week_start_date,
                            week_end_date: curRange.week_end_date,
                            ...payload,
                          },
                          { onConflict: 'week_start_date' }
                        )
                        .select('id')
                        .single();
                      if (insertErr) {
                        setMessage({ type: 'error', text: insertErr.message });
                        return;
                      }
                    }
                    setMessage({ type: 'success', text: 'Customization times saved for this market week' });
                    setCurrentWeekScheduleEditOpen(false);
                    loadData();
                  };
                  return (
                    <div className="p-4 rounded-lg bg-gray-50 border border-gray-200 max-w-xl">
                      <h3 className="text-sm font-semibold text-gray-900 mb-2">When can customers customize? (current week)</h3>
                      {!currentWeekId ? (
                        <p className="text-sm text-gray-600 mb-3">No current week in the system yet. Click &quot;Edit open/close times&quot; below, set the days and times, then click &quot;Save times&quot; to create the current week and set the customization window.</p>
                      ) : null}
                      {currentWeekScheduleEditOpen ? (
                        <div className="space-y-3">
                          {scheduleEditState.message ? (
                            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">{scheduleEditState.message}</p>
                          ) : null}
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Open (day & time)</label>
                            <div className="flex gap-2 items-center">
                              <select value={currentWeekScheduleForm.open_dow} onChange={(e) => setCurrentWeekScheduleForm((f) => ({ ...f, open_dow: parseInt(e.target.value, 10) }))} className="px-2 py-1 border rounded text-sm">
                                {[0, 1, 2, 3, 4, 5, 6].map((d) => <option key={d} value={d}>{DOW_LABELS[d]}</option>)}
                              </select>
                              <input type="time" value={currentWeekScheduleForm.open_time} onChange={(e) => setCurrentWeekScheduleForm((f) => ({ ...f, open_time: e.target.value }))} className="px-2 py-1 border rounded text-sm" />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Close (day & time)</label>
                            <div className="flex gap-2 items-center">
                              <select value={currentWeekScheduleForm.close_dow} onChange={(e) => setCurrentWeekScheduleForm((f) => ({ ...f, close_dow: parseInt(e.target.value, 10) }))} className="px-2 py-1 border rounded text-sm">
                                {[0, 1, 2, 3, 4, 5, 6].map((d) => <option key={d} value={d}>{DOW_LABELS[d]}</option>)}
                              </select>
                              <input type="time" value={currentWeekScheduleForm.close_time} onChange={(e) => setCurrentWeekScheduleForm((f) => ({ ...f, close_time: e.target.value }))} className="px-2 py-1 border rounded text-sm" />
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                              Close must be on or before the end of this market week (Sunday 11:59 PM of the same Mon–Sun week).
                            </p>
                          </div>
                          <div className="rounded-lg border border-green-200 bg-green-50/90 px-3 py-2.5 text-xs text-green-950">
                            <div className="font-semibold text-green-900 mb-1.5">Preview for this market week ({previewWeekStart} → {previewWeekEnd})</div>
                            <div className="space-y-1 text-green-900/95">
                              <div>
                                <span className="text-green-800 font-medium">Opens:</span>{' '}
                                {formatCustomizationInstant(adminWindowPreview.windowStart)}
                              </div>
                              <div>
                                <span className="text-green-800 font-medium">Closes:</span>{' '}
                                {formatCustomizationInstant(adminWindowPreview.windowEnd)}
                              </div>
                              {adminWindowPreview.exceedsWeekEnd ? (
                                <p className="text-amber-800 font-medium mt-2 pt-1 border-t border-amber-200/80">
                                  Close extends past this week&apos;s end—Save will be blocked until you move close on or before {previewWeekEnd} 11:59 PM.
                                </p>
                              ) : null}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button type="button" onClick={handleSaveCurrentWeekSchedule} className="px-2 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700">Save times</button>
                            <button type="button" onClick={() => setCurrentWeekScheduleEditOpen(false)} className="px-2 py-1.5 bg-gray-200 rounded text-sm">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {scheduleLabels ? (
                            <ScheduleWindowPairCards parts={windowParts} tone="muted" />
                          ) : (
                            <p className="text-sm text-gray-700">Set when customization opens and closes.</p>
                          )}
                          <button type="button" onClick={() => setCurrentWeekScheduleEditOpen(true)} className="mt-2 text-sm text-green-600 hover:text-green-800 font-medium">Edit open/close times</button>
                        </>
                      )}
                    </div>
                  );
                })()}

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {bucketTypes.map((bt) => (
                    <BucketTypeCard
                      key={bt.id}
                      bucketType={bt}
                      categoryRatios={bucketTypeRatios[bt.id] ?? { root: 34, leafy: 33, bushy: 33 }}
                      vegCategoryIdsByName={vegCategoryIdsByName}
                      currentWeekId={currentWeekId}
                      nextWeekId={nextWeekId}
                      weekVeggiesByBucket={weekVeggiesByBucket}
                      allVegetables={vegetablesForBucket}
                      onSaveWeekVeggies={async (marketWeekId, vegetableIds) => {
                        await supabase.from('market_week_bucket_vegetables').delete().eq('market_week_id', marketWeekId).eq('bucket_type_id', bt.id);
                        if (vegetableIds.length > 0) {
                          await supabase.from('market_week_bucket_vegetables').insert(
                            vegetableIds.map((vegId, i) => ({ market_week_id: marketWeekId, bucket_type_id: bt.id, vegetable_id: vegId, sort_order: i }))
                          );
                        }
                        setWeekVeggiesByBucket((prev) => ({ ...prev, [`${marketWeekId}_${bt.id}`]: vegetableIds }));
                        setMessage({ type: 'success', text: 'Week vegetables saved' });
                      }}
                      onSave={async (updates) => {
                        const payload: Record<string, unknown> = {
                          name: updates.name,
                          description: updates.description,
                          display_item_range: updates.display_item_range,
                          monthly_price: updates.monthly_price,
                          handling_fee: updates.handling_fee,
                          is_active: updates.is_active
                        };
                        if (updates.root_count !== undefined) payload.root_count = updates.root_count;
                        if (updates.bushy_count !== undefined) payload.bushy_count = updates.bushy_count;
                        if (updates.leafy_count !== undefined) payload.leafy_count = updates.leafy_count;
                        if (updates.categoryRatios) {
                          payload.root_budget_pct = Math.max(0, Math.min(100, updates.categoryRatios.root ?? 34));
                          payload.leafy_budget_pct = Math.max(0, Math.min(100, updates.categoryRatios.leafy ?? 33));
                          payload.bushy_budget_pct = Math.max(0, Math.min(100, updates.categoryRatios.bushy ?? 33));
                        }
                        const { error } = await supabase.from('bucket_types').update(payload).eq('id', bt.id);
                        if (error) throw error;
                        setMessage({ type: 'success', text: 'Bucket type updated' });
                        loadData();
                      }}
                    />
                  ))}
                </div>
                {bucketTypes.length === 0 && !loading && (
                  <p className="text-gray-500">No bucket types. Add them in Supabase or run migrations.</p>
                )}
              </div>
            )}

            {activeTab === 'prices' && (
              <div className="space-y-6">
                <h2 className="text-lg font-semibold text-gray-900">Market prices (per 250g, per week)</h2>
                <p className="text-sm text-gray-600">Prices are for the <strong>current week</strong> only. Set prices per vegetable for allocation when that week is active. Add the current week in the Market weeks tab if the table below is missing.</p>
                {pricesWeekId ? (
                  <>
                    <p className="text-sm font-medium text-gray-700">Current week</p>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead>
                        <tr>
                          <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Vegetable</th>
                          <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Price (LKR)</th>
                          <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {vegetables.map((v) => (
                          <tr key={v.id}>
                            <td className="px-4 py-2 text-sm text-gray-900">{v.name}</td>
                            <td className="px-4 py-2">
                              <input
                                type="number"
                                min="0"
                                step="1"
                                className="w-24 px-2 py-1 border rounded"
                                value={marketPricesByWeek[v.id] ?? v.marketPricePer250g ?? ''}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value, 10);
                                  if (!Number.isNaN(val)) setMarketPricesByWeek((prev) => ({ ...prev, [v.id]: val }));
                                }}
                              />
                            </td>
                            <td className="px-4 py-2">
                              <button
                                type="button"
                                className="text-sm text-green-600 hover:text-green-800"
                                onClick={async () => {
                                  const price = marketPricesByWeek[v.id] ?? v.marketPricePer250g;
                                  if (price == null) return;
                                  const { error } = await supabase.rpc('upsert_market_price', {
                                    p_market_week_id: pricesWeekId,
                                    p_vegetable_id: v.id,
                                    p_price_per_unit: Number(price)
                                  });
                                  if (error) {
                                    setMessage({ type: 'error', text: error.message });
                                    return;
                                  }
                                  setMessage({ type: 'success', text: `Price for ${v.name} saved` });
                                  setMarketPricesByWeek((prev) => ({ ...prev, [v.id]: price }));
                                }}
                              >
                                Save
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  </>
                ) : (
                  <p className="text-sm text-gray-500">Add the current week in the <strong>Market weeks</strong> tab to set prices.</p>
                )}
              </div>
            )}

            {activeTab === 'weeks' && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Market weeks</h2>
                <p className="text-sm text-gray-600">Current week and next week (Mon–Sun). Open/close times are shown inside each week; lock a week to close customization for that week.</p>
                <MarketWeeksSection marketWeeks={marketWeeks} onRefresh={loadData} setMessage={setMessage} />
              </div>
            )}

            {activeTab === 'weekly-orders' && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">This week&apos;s orders</h2>
                    <p className="text-sm text-gray-600">
                      Deliveries with a <strong>scheduled date</strong> in the current market week (
                      {weeklyOrdersRange ? (
                        <>
                          Mon <span className="font-mono">{weeklyOrdersRange.start}</span> – Sun{' '}
                          <span className="font-mono">{weeklyOrdersRange.end}</span>, local calendar
                        </>
                      ) : (
                        'same range as Market weeks'
                      )}
                      ). Use this as your pack-and-ship checklist.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadWeeklyOrders()}
                    disabled={weeklyOrdersLoading}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${weeklyOrdersLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </div>

                {weeklyOrdersLoading ? (
                  <p className="text-sm text-gray-500">Loading deliveries…</p>
                ) : weeklyOrders.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    No delivery rows scheduled for this week. Subscriptions must have a delivery with{' '}
                    <code className="text-xs bg-gray-100 px-1 rounded">scheduled_date</code> between the week range above.
                  </p>
                ) : (
                  <div className="overflow-x-auto border border-gray-200 rounded-lg">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-700">Delivery date</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-700">Customer</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-700">Email</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-700">Address</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-700">City</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-700">Bucket</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-700">Payment</th>
                          <th className="px-3 py-2 text-right font-medium text-gray-700">Week budget</th>
                          <th className="px-3 py-2 text-center font-medium text-gray-700">#</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-700">Sub</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-700">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {weeklyOrders.map((row) => (
                          <tr key={row.deliveryId} className="hover:bg-gray-50/80">
                            <td className="px-3 py-2 whitespace-nowrap font-mono text-gray-900">{row.scheduledDate}</td>
                            <td className="px-3 py-2 text-gray-900">{row.customerName}</td>
                            <td className="px-3 py-2 text-gray-600 max-w-[12rem] truncate" title={row.email}>
                              {row.email}
                            </td>
                            <td className="px-3 py-2 text-gray-600 max-w-[14rem] truncate" title={row.addressLine}>
                              {row.addressLine}
                            </td>
                            <td className="px-3 py-2 text-gray-600">{row.city}</td>
                            <td className="px-3 py-2 text-gray-900">{row.bucketName}</td>
                            <td className="px-3 py-2 text-gray-800">{row.paymentLabel}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-gray-900">
                              {Number.isFinite(row.weeklyBudget) ? row.weeklyBudget.toFixed(2) : '—'}
                            </td>
                            <td className="px-3 py-2 text-center text-gray-600">
                              {row.deliveryIndex != null && Number.isFinite(row.deliveryIndex)
                                ? row.deliveryIndex
                                : '—'}
                            </td>
                            <td className="px-3 py-2">
                              <span
                                className={`inline-block px-2 py-0.5 rounded text-xs ${
                                  row.subscriptionStatus === 'active'
                                    ? 'bg-green-100 text-green-800'
                                    : row.subscriptionStatus === 'paused'
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-gray-100 text-gray-700'
                                }`}
                              >
                                {row.subscriptionStatus}
                              </span>
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <select
                                value={row.status}
                                disabled={weeklyOrderSavingId === row.deliveryId}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (v !== row.status) void updateWeeklyDeliveryStatus(row.deliveryId, v);
                                }}
                                className={`text-sm border border-gray-300 rounded-lg px-2 py-1.5 max-w-[11rem] bg-white text-gray-900 capitalize focus:ring-2 focus:ring-green-500 focus:border-green-500 ${
                                  weeklyOrderSavingId === row.deliveryId ? 'opacity-60 cursor-wait' : ''
                                }`}
                                aria-label={`Delivery status for ${row.customerName}`}
                              >
                                {statusOptionsForRow(row.status).map((s) => (
                                  <option key={s} value={s}>
                                    {s.replace(/_/g, ' ')}
                                  </option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="text-xs text-gray-500 px-3 py-2 border-t border-gray-100 bg-gray-50">
                      {weeklyOrders.length} row{weeklyOrders.length === 1 ? '' : 's'} · Change <strong>Status</strong> to update the delivery row.{' '}
                      <strong>Delivered</strong> sets <code className="text-xs">delivered_at</code>; other statuses clear it. Payment method comes from the subscription. Line items:{' '}
                      <code className="text-xs">delivery_items</code> when populated.
                    </p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'plans' && (
              <div className="space-y-8">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Plans, payments & discounts</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Plan owns delivery count. Enable/disable Cash or Card per plan. Discounts stack: plan first, then payment.
                  </p>
                </div>
                {plansPayLoading ? (
                  <p className="text-sm text-gray-500">Loading…</p>
                ) : (
                  <>
                    <div className="space-y-4">
                      {adminPlans.map((plan) => (
                        <div key={plan.id} className="border border-gray-200 rounded-xl p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                            <div>
                              <div className="font-semibold text-gray-900">
                                {plan.name}{' '}
                                <span className="text-xs font-normal text-gray-500">({plan.code})</span>
                              </div>
                              <div className="text-sm text-gray-600">
                                {plan.entitled_deliveries} deliveries / cycle
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-3 text-sm">
                              <label className="flex items-center gap-1">
                                Plan % off
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  step={0.01}
                                  className="w-20 border rounded px-2 py-1"
                                  defaultValue={Number(plan.prepaid_discount_pct) || 0}
                                  onBlur={async (e) => {
                                    const v = Number(e.target.value) || 0;
                                    const { error } = await supabase
                                      .from('subscription_plans')
                                      .update({ prepaid_discount_pct: v })
                                      .eq('id', plan.id);
                                    if (error) setMessage({ type: 'error', text: error.message });
                                    else {
                                      setMessage({ type: 'success', text: `Updated ${plan.name} discount %` });
                                      void loadPlansPay();
                                    }
                                  }}
                                />
                              </label>
                              <label className="flex items-center gap-1">
                                Plan fixed off
                                <input
                                  type="number"
                                  min={0}
                                  step={1}
                                  className="w-24 border rounded px-2 py-1"
                                  defaultValue={Number(plan.prepaid_discount_fixed) || 0}
                                  onBlur={async (e) => {
                                    const v = Number(e.target.value) || 0;
                                    const { error } = await supabase
                                      .from('subscription_plans')
                                      .update({ prepaid_discount_fixed: v })
                                      .eq('id', plan.id);
                                    if (error) setMessage({ type: 'error', text: error.message });
                                    else {
                                      setMessage({ type: 'success', text: `Updated ${plan.name} fixed discount` });
                                      void loadPlansPay();
                                    }
                                  }}
                                />
                              </label>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-4">
                            {adminPaymentMethods.map((pm) => {
                              const row = planPaymentRows.find(
                                (r) =>
                                  r.subscription_plan_id === plan.id && r.payment_method_id === pm.id
                              );
                              const enabled = row?.is_enabled ?? false;
                              return (
                                <label key={pm.id} className="flex items-center gap-2 text-sm text-gray-800">
                                  <input
                                    type="checkbox"
                                    checked={enabled}
                                    onChange={async (e) => {
                                      const next = e.target.checked;
                                      const { error } = await supabase
                                        .from('subscription_plan_payment_methods')
                                        .upsert({
                                          subscription_plan_id: plan.id,
                                          payment_method_id: pm.id,
                                          is_enabled: next,
                                          sort_order: pm.code === 'cash' ? 1 : 2,
                                        });
                                      if (error) setMessage({ type: 'error', text: error.message });
                                      else void loadPlansPay();
                                    }}
                                  />
                                  {formatPaymentMethodLabel(pm)} allowed
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div>
                      <h3 className="font-semibold text-gray-900 mb-2">Payment method discounts</h3>
                      <div className="space-y-3">
                        {adminPaymentMethods.map((pm) => (
                          <div
                            key={pm.id}
                            className="flex flex-wrap items-center gap-3 border border-gray-200 rounded-lg p-3 text-sm"
                          >
                            <span className="font-medium w-20">{formatPaymentMethodLabel(pm)}</span>
                            <label className="flex items-center gap-1">
                              % off
                              <input
                                type="number"
                                min={0}
                                max={100}
                                className="w-20 border rounded px-2 py-1"
                                defaultValue={Number(pm.discount_pct) || 0}
                                onBlur={async (e) => {
                                  const v = Number(e.target.value) || 0;
                                  const { error } = await supabase
                                    .from('payment_methods')
                                    .update({ discount_pct: v })
                                    .eq('id', pm.id);
                                  if (error) setMessage({ type: 'error', text: error.message });
                                  else void loadPlansPay();
                                }}
                              />
                            </label>
                            <label className="flex items-center gap-1">
                              Fixed off
                              <input
                                type="number"
                                min={0}
                                className="w-24 border rounded px-2 py-1"
                                defaultValue={Number(pm.discount_fixed) || 0}
                                onBlur={async (e) => {
                                  const v = Number(e.target.value) || 0;
                                  const { error } = await supabase
                                    .from('payment_methods')
                                    .update({ discount_fixed: v })
                                    .eq('id', pm.id);
                                  if (error) setMessage({ type: 'error', text: error.message });
                                  else void loadPlansPay();
                                }}
                              />
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {activeTab === 'users' && (
              <div className="space-y-6">
                <h2 className="text-lg font-semibold text-gray-900">Users & roles</h2>
                <p className="text-sm text-gray-600">Change role to admin to grant access to this panel.</p>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Email</th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Name</th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Role</th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {profiles.map((p) => (
                        <tr key={p.id}>
                          <td className="px-4 py-2 text-sm text-gray-900">{p.email}</td>
                          <td className="px-4 py-2 text-sm text-gray-600">{p.full_name || '—'}</td>
                          <td className="px-4 py-2 text-sm">
                            <span className={`px-2 py-0.5 rounded text-xs ${p.role === 'admin' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-700'}`}>
                              {p.role || 'user'}
                            </span>
                          </td>
                          <td className="px-4 py-2">
                            <button
                              type="button"
                              className="text-sm text-green-600 hover:text-green-800"
                              onClick={async () => {
                                const newRole = p.role === 'admin' ? 'user' : 'admin';
                                const { error } = await supabase.from('profiles').update({ role: newRole, updated_at: new Date().toISOString() }).eq('id', p.id);
                                if (error) {
                                  setMessage({ type: 'error', text: error.message });
                                  return;
                                }
                                setMessage({ type: 'success', text: `Role set to ${newRole}` });
                                loadData();
                              }}
                            >
                              {p.role === 'admin' ? 'Set as user' : 'Set as admin'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {profiles.length === 0 && !loading && <p className="text-gray-500">No profiles found.</p>}
              </div>
            )}

            {activeTab === 'system' && (
              <div className="space-y-6">
                {/* System Settings */}
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">System Settings</h2>
                  <p className="text-sm text-gray-600">Configure system-wide settings and integrations</p>
                </div>

                {/* API Configuration */}
                <div className="bg-gray-50 rounded-lg p-6">
                  <h3 className="text-md font-semibold text-gray-900 mb-4">API Configuration</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        External Pricing API Key
                      </label>
                      <div className="flex items-center space-x-3">
                        <div className="relative flex-1">
                          <input
                            type={showApiKey ? 'text' : 'password'}
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder="Enter API key..."
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                          />
                        </div>
                        <button
                          onClick={() => setShowApiKey(!showApiKey)}
                          className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          {showApiKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(apiKey);
                            setMessage({ type: 'success', text: 'API key copied to clipboard' });
                          }}
                          className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          <Copy className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Data Management */}
                <div className="bg-gray-50 rounded-lg p-6">
                  <h3 className="text-md font-semibold text-gray-900 mb-4">Data Management</h3>
                  <div className="flex items-center space-x-4">
                    <button
                      onClick={handleExportData}
                      className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      <span>Export Data</span>
                    </button>
                    <div className="relative">
                      <input
                        type="file"
                        accept=".json"
                        onChange={handleImportData}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <button className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                        <Upload className="w-4 h-4" />
                        <span>Import Data</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* External Links */}
                <div className="bg-gray-50 rounded-lg p-6">
                  <h3 className="text-md font-semibold text-gray-900 mb-4">External Resources</h3>
                  <div className="space-y-3">
                    <a
                      href="https://api.example.com/docs"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center space-x-2 text-blue-600 hover:text-blue-800 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>Pricing API Documentation</span>
                    </a>
                    <a
                      href="https://dashboard.example.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center space-x-2 text-blue-600 hover:text-blue-800 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>External Dashboard</span>
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Vegetable Modal */}
      {showVegetableModal && (
        <VegetableModal
          vegetable={selectedVegetable}
          onSave={handleVegetableSave}
          onClose={() => {
            setShowVegetableModal(false);
            setSelectedVegetable(null);
          }}
        />
      )}
    </div>
  );
};

// Bucket type card: name, description, display_item_range, monthly_price, handling_fee, is_active, root_count, leafy_count, bushy_count, category ratios, vegetables for week
const BucketTypeCard: React.FC<{
  bucketType: BucketType;
  categoryRatios: { root: number; leafy: number; bushy: number };
  vegCategoryIdsByName: Record<string, string>;
  currentWeekId: string | null;
  nextWeekId: string | null;
  weekVeggiesByBucket: Record<string, string[]>;
  allVegetables: Vegetable[];
  onSaveWeekVeggies: (marketWeekId: string, vegetableIds: string[]) => Promise<void>;
  onSave: (updates: Partial<BucketType> & { is_active?: boolean; categoryRatios?: { root: number; leafy: number; bushy: number } }) => Promise<void>;
}> = ({ bucketType, categoryRatios, vegCategoryIdsByName, currentWeekId, nextWeekId, weekVeggiesByBucket, allVegetables, onSaveWeekVeggies, onSave }) => {
  const [editing, setEditing] = useState(false);
  const [editingWeekVeggies, setEditingWeekVeggies] = useState<'current' | 'next' | null>(null);
  const [weekVeggiesDraft, setWeekVeggiesDraft] = useState<string[]>([]);
  const [form, setForm] = useState({
    name: bucketType.name,
    description: bucketType.description || '',
    display_item_range: bucketType.display_item_range || '',
    monthly_price: bucketType.monthly_price,
    handling_fee: bucketType.handling_fee,
    is_active: (bucketType as any).is_active !== false,
    root_count: bucketType.root_count ?? 1,
    leafy_count: bucketType.leafy_count ?? 1,
    bushy_count: bucketType.bushy_count ?? 2,
    root_pct: categoryRatios.root,
    leafy_pct: categoryRatios.leafy,
    bushy_pct: categoryRatios.bushy
  });
  useEffect(() => {
    setForm((f) => ({ ...f, root_pct: categoryRatios.root, leafy_pct: categoryRatios.leafy, bushy_pct: categoryRatios.bushy }));
  }, [categoryRatios.root, categoryRatios.leafy, categoryRatios.bushy]);

  const handleSave = async () => {
    await onSave({
      ...form,
      categoryRatios: { root: form.root_pct, leafy: form.leafy_pct, bushy: form.bushy_pct }
    });
    setEditing(false);
  };

  return (
    <div className="border rounded-lg p-4 bg-white shadow-sm">
      {!editing ? (
        <div className={`flex justify-between items-start ${(bucketType as any).is_active === false ? 'opacity-90' : ''}`}>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-gray-900">{bucketType.name}</h3>
              {(bucketType as any).is_active === false && (
                <span className="text-xs font-medium px-2 py-0.5 rounded bg-amber-100 text-amber-800">Inactive</span>
              )}
            </div>
            <p className="text-sm text-gray-600">LKR {bucketType.monthly_price} / mo</p>
            <p className="text-xs text-gray-500">Handling: LKR {bucketType.handling_fee} · Items: {bucketType.display_item_range}</p>
            <p className="text-xs text-gray-500 mt-1">Root: {bucketType.root_count ?? 1} · Leafy: {bucketType.leafy_count ?? 1} · Bushy: {bucketType.bushy_count ?? 2}</p>
          </div>
          <button type="button" onClick={() => setEditing(true)} className="text-green-600 hover:text-green-800 text-sm">Edit</button>
        </div>
      ) : (
        <div className="space-y-2">
          <input className="w-full px-2 py-1 border rounded text-sm" placeholder="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <input className="w-full px-2 py-1 border rounded text-sm" placeholder="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          <input className="w-full px-2 py-1 border rounded text-sm" placeholder="Display range e.g. 4-6" value={form.display_item_range} onChange={(e) => setForm((f) => ({ ...f, display_item_range: e.target.value }))} />
          <div className="grid grid-cols-2 gap-2">
            <input type="number" className="w-full px-2 py-1 border rounded text-sm" placeholder="Monthly price" value={form.monthly_price} onChange={(e) => setForm((f) => ({ ...f, monthly_price: Number(e.target.value) || 0 }))} />
            <input type="number" className="w-full px-2 py-1 border rounded text-sm" placeholder="Handling fee" value={form.handling_fee} onChange={(e) => setForm((f) => ({ ...f, handling_fee: Number(e.target.value) || 0 }))} />
          </div>
          <p className="text-xs text-gray-600 mt-2">Vegetables per bucket (counts):</p>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs text-gray-500">Root</label>
              <input type="number" min={0} className="w-full px-2 py-1 border rounded text-sm" value={form.root_count} onChange={(e) => setForm((f) => ({ ...f, root_count: Math.max(0, parseInt(e.target.value, 10) || 0) }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500">Leafy</label>
              <input type="number" min={0} className="w-full px-2 py-1 border rounded text-sm" value={form.leafy_count} onChange={(e) => setForm((f) => ({ ...f, leafy_count: Math.max(0, parseInt(e.target.value, 10) || 0) }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500">Bushy</label>
              <input type="number" min={0} className="w-full px-2 py-1 border rounded text-sm" value={form.bushy_count} onChange={(e) => setForm((f) => ({ ...f, bushy_count: Math.max(0, parseInt(e.target.value, 10) || 0) }))} />
            </div>
          </div>
          <p className="text-xs text-gray-600 mt-2">Category budget share % (this bucket only; should sum to 100):</p>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs text-gray-500">Root %</label>
              <input type="number" min={0} max={100} className="w-full px-2 py-1 border rounded text-sm" value={form.root_pct} onChange={(e) => setForm((f) => ({ ...f, root_pct: Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)) }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500">Leafy %</label>
              <input type="number" min={0} max={100} className="w-full px-2 py-1 border rounded text-sm" value={form.leafy_pct} onChange={(e) => setForm((f) => ({ ...f, leafy_pct: Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)) }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500">Bushy %</label>
              <input type="number" min={0} max={100} className="w-full px-2 py-1 border rounded text-sm" value={form.bushy_pct} onChange={(e) => setForm((f) => ({ ...f, bushy_pct: Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)) }))} />
            </div>
          </div>
          <p className="text-xs text-gray-500">Total: {form.root_pct + form.leafy_pct + form.bushy_pct}%</p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
            Active
          </label>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={handleSave} className="px-3 py-1.5 bg-green-600 text-white rounded text-sm">Save</button>
            <button type="button" onClick={() => setEditing(false)} className="px-3 py-1.5 bg-gray-200 rounded text-sm">Cancel</button>
          </div>
        </div>
      )}

      {/* Vegetables for week (manual list before customization); grouped by category, capped by bucket type total and per-category counts */}
      {(() => {
        const maxVeg = getVegCountFromBucketType(bucketType.display_item_range, bucketType.root_count, bucketType.leafy_count, bucketType.bushy_count);
        const maxRoot = bucketType.root_count ?? 0;
        const maxLeafy = bucketType.leafy_count ?? 0;
        const maxBushy = bucketType.bushy_count ?? 0;
        const categoryLimits: Record<'root' | 'leafy' | 'bushy', number> = { root: maxRoot, leafy: maxLeafy, bushy: maxBushy };
        const countSelectedInCategory = (cat: 'root' | 'leafy' | 'bushy') =>
          weekVeggiesDraft.filter((id) => (allVegetables.find((v) => v.id === id)?.category || 'leafy') === cat).length;
        const categories: ('root' | 'leafy' | 'bushy')[] = ['root', 'leafy', 'bushy'];
        const veggiesByCategory = categories.map((cat) => ({
          category: cat,
          veggies: allVegetables.filter((v) => (v.category || 'leafy') === cat)
        }));
        const renderWeekVeggieEditor = (weekId: string, weekLabel: 'current' | 'next') => {
          return editingWeekVeggies === weekLabel ? (
            <div className="mt-1 space-y-1">
              <p className="text-xs text-gray-600">Max {maxVeg} total (root: {maxRoot}, leafy: {maxLeafy}, bushy: {maxBushy}). Selected: {weekVeggiesDraft.length}</p>
              <div className="max-h-48 overflow-y-auto border rounded p-2 bg-gray-50 text-sm space-y-3">
                {allVegetables.length === 0 ? (
                  <p className="text-gray-500">No vegetables in catalog. Add vegetables in the <strong>Vegetables</strong> tab first.</p>
                ) : (
                  veggiesByCategory.map(({ category, veggies }) => {
                    if (veggies.length === 0) return null;
                    const limitForCategory = categoryLimits[category];
                    const selectedInCategory = countSelectedInCategory(category);
                    return (
                      <div key={category}>
                        <p className="text-xs font-medium text-gray-600 capitalize mb-1">{category} (max {limitForCategory})</p>
                        <div className="space-y-0.5">
                          {veggies.map((v) => {
                            const checked = weekVeggiesDraft.includes(v.id);
                            const atTotalLimit = !checked && weekVeggiesDraft.length >= maxVeg;
                            const atCategoryLimit = !checked && selectedInCategory >= limitForCategory;
                            const atLimit = atTotalLimit || atCategoryLimit;
                            return (
                              <label key={v.id} className={`flex items-center gap-2 ${atLimit ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={atLimit}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      const inCat = countSelectedInCategory(category);
                                      if (weekVeggiesDraft.length < maxVeg && inCat < limitForCategory)
                                        setWeekVeggiesDraft((prev) => [...prev, v.id]);
                                    } else {
                                      setWeekVeggiesDraft((prev) => prev.filter((id) => id !== v.id));
                                    }
                                  }}
                                />
                                <span>{v.name}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    const byCategory: Record<'root' | 'leafy' | 'bushy', string[]> = { root: [], leafy: [], bushy: [] };
                    weekVeggiesDraft.forEach((id) => {
                      const cat = (allVegetables.find((v) => v.id === id)?.category || 'leafy') as 'root' | 'leafy' | 'bushy';
                      if (byCategory[cat].length < categoryLimits[cat]) byCategory[cat].push(id);
                    });
                    const toSave = [...byCategory.root, ...byCategory.leafy, ...byCategory.bushy].slice(0, maxVeg);
                    await onSaveWeekVeggies(weekId, toSave);
                    setEditingWeekVeggies(null);
                  }}
                  className="px-2 py-1 bg-green-600 text-white rounded text-xs"
                >
                  Save
                </button>
                <button type="button" onClick={() => setEditingWeekVeggies(null)} className="px-2 py-1 border rounded text-xs">Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <button type="button" onClick={() => { setWeekVeggiesDraft(weekVeggiesByBucket[`${weekId}_${bucketType.id}`] || []); setEditingWeekVeggies(weekLabel); }} className="ml-2 text-xs text-green-600 hover:underline">
                {weekVeggiesByBucket[`${weekId}_${bucketType.id}`]?.length ? `${weekVeggiesByBucket[`${weekId}_${bucketType.id}`].length} veggies · Edit` : 'Set vegetables'}
              </button>
              {!editingWeekVeggies && weekVeggiesByBucket[`${weekId}_${bucketType.id}`]?.length > 0 && (
                <span className="ml-2 text-xs text-gray-500">
                  {weekVeggiesByBucket[`${weekId}_${bucketType.id}`].map((id) => allVegetables.find((v) => v.id === id)?.name ?? id).join(', ')}
                </span>
              )}
            </>
          );
        };
        return (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <p className="text-sm font-semibold text-gray-800 mb-2">Vegetables for week</p>
            <p className="text-xs text-gray-500 mb-2">Set which vegetables go in this bucket for each week (used as default before customization opens). Total and per-category limits come from this bucket type.</p>
            {currentWeekId && (
              <div className="mb-2">
                <span className="text-xs text-gray-500">Current week:</span>
                {renderWeekVeggieEditor(currentWeekId, 'current')}
              </div>
            )}
            {nextWeekId && (
              <div>
                <span className="text-xs text-gray-500">Next week:</span>
                {renderWeekVeggieEditor(nextWeekId, 'next')}
              </div>
            )}
            {!currentWeekId && !nextWeekId && <p className="text-xs text-gray-400">Save market weeks (Current / Next) in Market weeks section first.</p>}
          </div>
        );
      })()}
    </div>
  );
};

const DOW_LABELS: Record<number, string> = { 0: 'Sunday', 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday' };

function formatDateRangeForWeek(start: string, end: string): string {
  const s = new Date(start + 'T12:00:00');
  const e = new Date(end + 'T12:00:00');
  return `${s.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} – ${e.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}`;
}

type WeekForm = {
  id: string | null;
  week_start_date: string;
  week_end_date: string;
  is_locked: boolean;
};

// Market weeks tab: date range and lock only (open/close times are edited in Bucket types tab).
const WeekCard: React.FC<{
  title: string;
  form: WeekForm;
  setForm: React.Dispatch<React.SetStateAction<WeekForm>>;
  onSave: () => void;
}> = ({ title, form, setForm, onSave }) => (
  <div className="p-4 border rounded-lg bg-gray-50 space-y-4 max-w-xl">
    <div>
      <h3 className="font-semibold text-gray-900">{title} <span className="text-xs font-normal text-gray-500">(Mon–Sun)</span></h3>
      <p className="text-sm text-gray-600">{formatDateRangeForWeek(form.week_start_date, form.week_end_date)}</p>
    </div>
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      {form.is_locked ? <ToggleRight className="h-5 w-5 text-orange-600" aria-hidden /> : <ToggleLeft className="h-5 w-5 text-green-600" aria-hidden />}
      <input type="checkbox" checked={form.is_locked} onChange={(e) => setForm((f) => ({ ...f, is_locked: e.target.checked }))} className="sr-only" />
      <span>Turn off availability (emergency)</span>
    </label>
    <button type="button" onClick={onSave} className="px-3 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700">Save</button>
  </div>
);

// Market weeks: current and next week (Mon–Sun). Each week uses its own row's dates and open/close from DB.
const MarketWeeksSection: React.FC<{
  marketWeeks: MarketWeek[];
  onRefresh: () => void;
  setMessage: (m: { type: 'success' | 'error'; text: string } | null) => void;
}> = ({ marketWeeks, onRefresh, setMessage }) => {
  const currentRange = getCurrentWeekDateRange();
  const nextRange = getNextWeekDateRange();
  const findWeek = (start: string) => marketWeeks.find(w => toWeekStart(w.week_start_date) === start);
  const currentDb = findWeek(currentRange.week_start_date) ?? marketWeeks[0] ?? null;
  const nextDb = findWeek(nextRange.week_start_date) ?? marketWeeks[1] ?? null;

  const [currentForm, setCurrentForm] = useState<WeekForm>({
    id: currentDb?.id ?? null,
    week_start_date: (currentDb && toWeekStart(currentDb.week_start_date)) || currentRange.week_start_date,
    week_end_date: (currentDb && toWeekStart(currentDb.week_end_date)) || currentRange.week_end_date,
    is_locked: currentDb?.is_locked ?? false
  });
  const [nextForm, setNextForm] = useState<WeekForm>({
    id: nextDb?.id ?? null,
    week_start_date: (nextDb && toWeekStart(nextDb.week_start_date)) || nextRange.week_start_date,
    week_end_date: (nextDb && toWeekStart(nextDb.week_end_date)) || nextRange.week_end_date,
    is_locked: nextDb?.is_locked ?? false
  });

  useEffect(() => {
    setCurrentForm({
      id: currentDb?.id ?? null,
      week_start_date: (currentDb && toWeekStart(currentDb.week_start_date)) || currentRange.week_start_date,
      week_end_date: (currentDb && toWeekStart(currentDb.week_end_date)) || currentRange.week_end_date,
      is_locked: currentDb?.is_locked ?? false
    });
    setNextForm({
      id: nextDb?.id ?? null,
      week_start_date: (nextDb && toWeekStart(nextDb.week_start_date)) || nextRange.week_start_date,
      week_end_date: (nextDb && toWeekStart(nextDb.week_end_date)) || nextRange.week_end_date,
      is_locked: nextDb?.is_locked ?? false
    });
  }, [currentDb?.id, currentDb?.week_start_date, currentDb?.week_end_date, currentDb?.is_locked, nextDb?.id, nextDb?.week_start_date, nextDb?.week_end_date, nextDb?.is_locked, currentRange.week_start_date, currentRange.week_end_date, nextRange.week_start_date, nextRange.week_end_date]);

  const upsertWeek = async (form: WeekForm): Promise<boolean> => {
    const payload = {
      week_start_date: form.week_start_date,
      week_end_date: form.week_end_date,
      is_locked: form.is_locked
    };
    if (form.id && !String(form.id).startsWith('synthetic-')) {
      const { error } = await supabase.from('market_weeks').update(payload).eq('id', form.id);
      if (error) {
        setMessage({ type: 'error', text: error.message });
        return false;
      }
      return true;
    }
    const { error } = await supabase.from('market_weeks').upsert(payload, { onConflict: 'week_start_date' });
    if (error) {
      setMessage({ type: 'error', text: error.message });
      return false;
    }
    return true;
  };

  const handleSaveCurrent = async () => {
    if (await upsertWeek(currentForm)) {
      setMessage({ type: 'success', text: 'Current week saved' });
      onRefresh();
    }
  };
  const handleSaveNext = async () => {
    if (await upsertWeek(nextForm)) {
      setMessage({ type: 'success', text: 'Next week saved' });
      onRefresh();
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600">Weeks run <strong>Monday to Sunday</strong>. Edit open/close times in the <strong>Bucket types</strong> tab. Use the switch here to turn off availability in an emergency.</p>

      <div className="space-y-4">
        <WeekCard title="Current week" form={currentForm} setForm={setCurrentForm} onSave={handleSaveCurrent} />
        <WeekCard title="Next week" form={nextForm} setForm={setNextForm} onSave={handleSaveNext} />
      </div>
    </div>
  );
};

// Vegetable Add/Edit Modal Component
const VegetableModal: React.FC<{
  vegetable?: Vegetable | null;
  onSave: (data: any) => void;
  onClose: () => void;
}> = ({ vegetable, onSave, onClose }) => {
  const [formData, setFormData] = useState<{
    name: string;
    category: '' | 'root' | 'leafy' | 'bushy';
    season: string;
    nutritionScore: number;
    description: string;
    marketPricePer250g: number;
    bulkPricePer250g: number;
    typicalWeight: string;
    benefits: string;
    image: string;
    isAvailableRetail: boolean;
    isAvailableBulk: boolean;
  }>({
    name: vegetable?.name || '',
    category: (vegetable?.category as 'root' | 'leafy' | 'bushy' | undefined) || 'leafy',
    season: vegetable?.season || 'Year-round',
    nutritionScore: vegetable?.nutritionScore ?? 5,
    description: vegetable?.description || '',
    marketPricePer250g: vegetable?.marketPricePer250g ?? 100,
    bulkPricePer250g: vegetable?.bulkPricePer250g ?? vegetable?.marketPricePer250g ?? 100,
    typicalWeight: vegetable?.typicalWeight || '250g',
    benefits: vegetable?.benefits?.join(', ') || '',
    image: vegetable?.image || 'https://images.pexels.com/photos/1132047/pexels-photo-1132047.jpeg?auto=compress&cs=tinysrgb&w=400',
    isAvailableRetail: vegetable?.isAvailableRetail ?? true,
    isAvailableBulk: vegetable?.isAvailableBulk ?? true
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const submitData = {
      ...formData,
      benefits: formData.benefits.split(',').map(b => b.trim()).filter(b => b.length > 0)
    };
    
    onSave(submitData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {vegetable ? 'Edit Vegetable' : 'Add New Vegetable'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value as 'root' | 'leafy' | 'bushy' | '' }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                required
              >
                <option value="">Select category</option>
                <option value="leafy">Leafy Greens</option>
                <option value="root">Root Vegetables</option>
                <option value="bushy">Bushy Vegetables</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Retail price per 250g (LKR) – Shop</label>
              <input
                type="number"
                value={formData.marketPricePer250g}
                onChange={(e) => setFormData(prev => ({ ...prev, marketPricePer250g: parseFloat(e.target.value) || 0 }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                min="0"
                step="0.01"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bulk price per 250g (LKR) – Bucket</label>
              <input
                type="number"
                value={formData.bulkPricePer250g}
                onChange={(e) => setFormData(prev => ({ ...prev, bulkPricePer250g: parseFloat(e.target.value) || 0 }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                min="0"
                step="0.01"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Season</label>
            <select
              value={formData.season}
              onChange={(e) => setFormData(prev => ({ ...prev, season: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              required
            >
              <option value="">Select season</option>
              <option value="spring">Spring</option>
              <option value="summer">Summer</option>
              <option value="monsoon">Monsoon</option>
              <option value="winter">Winter</option>
              <option value="year-round">Year Round</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Typical Weight</label>
            <input
              type="text"
              value={formData.typicalWeight}
              onChange={(e) => setFormData(prev => ({ ...prev, typicalWeight: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="e.g., 250g"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nutrition Score ({formData.nutritionScore}/10)
            </label>
            <input
              type="range"
              min="1"
              max="10"
              value={formData.nutritionScore}
              onChange={(e) => setFormData(prev => ({ ...prev, nutritionScore: parseInt(e.target.value) }))}
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Benefits (comma-separated)</label>
            <input
              type="text"
              value={formData.benefits}
              onChange={(e) => setFormData(prev => ({ ...prev, benefits: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="e.g., High in vitamin C, Good for digestion"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
            <input
              type="url"
              value={formData.image}
              onChange={(e) => setFormData(prev => ({ ...prev, image: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="https://..."
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="isAvailableRetail"
                checked={formData.isAvailableRetail}
                onChange={(e) => setFormData(prev => ({ ...prev, isAvailableRetail: e.target.checked }))}
                className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
              />
              <label htmlFor="isAvailableRetail" className="ml-2 block text-sm text-gray-900">
                Available for retail (Shop)
              </label>
            </div>
            <div className="flex items-center">
              <input
                type="checkbox"
                id="isAvailableBulk"
                checked={formData.isAvailableBulk}
                onChange={(e) => setFormData(prev => ({ ...prev, isAvailableBulk: e.target.checked }))}
                className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
              />
              <label htmlFor="isAvailableBulk" className="ml-2 block text-sm text-gray-900">
                Available for bulk (Bucket / customization)
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              {vegetable ? 'Update' : 'Add'} Vegetable
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AdminPage;