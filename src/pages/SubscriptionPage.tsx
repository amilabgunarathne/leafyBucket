import React, { useState } from 'react';
import { ArrowLeft, Package, Settings, Pause, Play, Check, Calendar, Clock, Truck, Leaf, X, CreditCard } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useWeekly } from '../contexts/WeeklyContext';
import type { PaymentMethod, Subscription } from '../services/SubscriptionService';
import ConfirmationModal from '../components/ConfirmationModal';
import CustomizationWindowStatusBanner from '../components/CustomizationWindowStatusBanner';
import SubscriptionService from '../services/SubscriptionService';
import VegetableService from '../services/vegetableService';
import { getWeeklyAllocationsByVegetableId } from '../utils/weeklyPlanAllocation';
import {
  effectiveVegCustomizations,
  normalizeSubscriptionCustomizations,
  hasSavedVegCustomizationForCurrentWeek,
} from '../utils/subscriptionCustomizations';
import { isAfterCustomizationClosedForCurrentWeek } from '../utils/customizationSchedule';
import {
  formatPaymentMethodLabel,
  normalizePaymentMethodJoin,
} from '../utils/paymentMethodDisplay';
import { getCurrentWeekDateRange } from '../utils/marketWeekUtils';
import { supabase } from '../lib/supabase';

const SubscriptionPage = () => {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<'pause' | 'resume' | 'change_plan' | null>(null);
  const [isChangingPlan, setIsChangingPlan] = useState(false);
  const [pendingNewPlan, setPendingNewPlan] = useState<string | null>(null);

  const [activeSubscription, setActiveSubscription] = useState<any>(null);
  const [currentDelivery, setCurrentDelivery] = useState<any>(null);
  /** This calendar week’s delivery row (any status) — used to tick “Delivery” when status is delivered */
  const [thisWeekDeliveryStatus, setThisWeekDeliveryStatus] = useState<string | null>(null);
  const [hasAcceptedReview, setHasAcceptedReview] = useState(false);
  const [showPaymentSetup, setShowPaymentSetup] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<string | null>(null);
  const [loadingPaymentMethods, setLoadingPaymentMethods] = useState(false);
  const SETUP_COMPLETE_KEY = 'leafy_bucket_setup_complete';
  const [setupComplete, setSetupComplete] = useState(false);
  const bucketTypesRef = React.useRef<any[]>([]);

  // First-time payment completion flag (local); also synced from DB when payment_method_id is set
  React.useEffect(() => {
    if (!user?.id) return;
    try {
      const stored = localStorage.getItem(`${SETUP_COMPLETE_KEY}_${user.id}`);
      if (stored === '1') setSetupComplete(true);
    } catch {
      // ignore
    }
  }, [user?.id]);

  React.useEffect(() => {
    const pmId = activeSubscription?.payment_method_id ?? user?.subscription?.payment_method_id;
    if (!user?.id || !pmId) return;
    try {
      localStorage.setItem(`${SETUP_COMPLETE_KEY}_${user.id}`, '1');
    } catch {
      // ignore
    }
    setSetupComplete(true);
  }, [user?.id, activeSubscription?.payment_method_id, user?.subscription?.payment_method_id]);

  // Load payment methods for sidebar label (Cash on delivery / Card recurring) even when modal is closed
  React.useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    SubscriptionService.getInstance()
      .getPaymentMethods()
      .then((list) => {
        if (!cancelled) setPaymentMethods(list);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Fetch payment methods when payment setup / change modal opens; pre-select current subscription method when changing
  React.useEffect(() => {
    if (!showPaymentSetup) return;
    let cancelled = false;
    setLoadingPaymentMethods(true);
    const preferredId =
      activeSubscription?.payment_method_id ?? user?.subscription?.payment_method_id ?? null;
    SubscriptionService.getInstance()
      .getPaymentMethods()
      .then((list) => {
        if (!cancelled) {
          setPaymentMethods(list);
          const pick =
            preferredId && list.some((p) => p.id === preferredId)
              ? preferredId
              : list.length > 0
                ? list[0].id
                : null;
          setSelectedPaymentMethodId(pick);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingPaymentMethods(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showPaymentSetup, activeSubscription?.payment_method_id, user?.subscription?.payment_method_id]);

  // Fetch real subscription details (align query with AuthContext; no payment embed)
  React.useEffect(() => {
    if (!user?.id) return;
    const fetchSub = async () => {
      const data = await SubscriptionService.getInstance().getActiveSubscription(user.id);
      if (data) {
        setActiveSubscription(data.subscription);
        setCurrentDelivery(data.currentDelivery);
        const range = getCurrentWeekDateRange();
        const { data: weekRow, error: weekErr } = await supabase
          .from('deliveries')
          .select('status')
          .eq('subscription_id', data.subscription.id)
          .gte('scheduled_date', range.week_start_date)
          .lte('scheduled_date', range.week_end_date)
          .maybeSingle();
        if (weekErr) {
          console.warn('[this week delivery]', weekErr.message);
          setThisWeekDeliveryStatus(null);
        } else {
          setThisWeekDeliveryStatus((weekRow as { status?: string } | null)?.status ?? null);
        }
      } else {
        setActiveSubscription(null);
        setCurrentDelivery(null);
        setThisWeekDeliveryStatus(null);
      }
    };
    fetchSub();
  }, [user?.id, user?.subscription?.id]);

  const resolvedPaymentMethodId = React.useMemo(
    () =>
      (activeSubscription as Subscription | null)?.payment_method_id ??
      user?.subscription?.payment_method_id ??
      null,
    [activeSubscription, user?.subscription?.payment_method_id]
  );

  // Using activeSubscription to suppress lint (will be used for detailed view later)
  React.useEffect(() => {
    if (activeSubscription) {
      console.log("Loaded active subscription:", activeSubscription.id);
    }
  }, [activeSubscription]);

  // Redirect if not logged in
  React.useEffect(() => {
    if (!user) {
      navigate('/auth', { state: { from: { pathname: '/my-bucket' } } });
    }
  }, [user, navigate]);

  /** Same source everywhere on My Bucket: subscription row + payment_methods catalog (not hardcoded copy). */
  const paymentMethodSidebarLabel = React.useMemo(() => {
    const sub = activeSubscription as Subscription | null;
    const fromJoin = formatPaymentMethodLabel(normalizePaymentMethodJoin(sub?.payment_method));
    if (fromJoin) return fromJoin;
    const id = resolvedPaymentMethodId;
    if (!id) return 'Not set';
    if (paymentMethods.length === 0) return 'Loading…';
    const found = paymentMethods.find((p) => p.id === id);
    const fromCatalog = formatPaymentMethodLabel(found ?? undefined);
    if (fromCatalog) return fromCatalog;
    return 'Unknown method';
  }, [activeSubscription, paymentMethods, resolvedPaymentMethodId]);

  const paymentMethodDescription = React.useMemo(() => {
    const sub = activeSubscription as Subscription | null;
    const pm = normalizePaymentMethodJoin(sub?.payment_method);
    const d = pm?.description?.trim();
    if (d) return d;
    const id = resolvedPaymentMethodId;
    if (!id || paymentMethods.length === 0) return null;
    return paymentMethods.find((p) => p.id === id)?.description?.trim() || null;
  }, [activeSubscription, paymentMethods, resolvedPaymentMethodId]);

  if (!user) {
    return null;
  }

  const handleStartSubscriptionRequest = (planId: string) => {
    setPendingNewPlan(planId);
    setPendingAction('change_plan'); // Re-use for initial selection too
    setIsConfirmModalOpen(true);
  };

  const handleConfirmStatusChange = async () => {
    if (!user || (!user.subscription && pendingAction !== 'change_plan')) return;

    try {
      const subService = SubscriptionService.getInstance();

      if (pendingAction === 'change_plan' && pendingNewPlan) {
        // Find the bucket type for this plan
        const bucketType = bucketTypesRef.current.find(bt => {
          const mappedId = bt.name.toLowerCase() === 'mini' ? 'small' : bt.name.toLowerCase() === 'family' ? 'medium' : 'large';
          return mappedId === pendingNewPlan;
        });

        if (!bucketType) throw new Error("Bucket type not found");

        if (!user.subscription) {
          // INITIAL SUBSCRIPTION
          await subService.createSubscription(user.id, bucketType.id);

          // Force refresh everything to ensure AuthContext picks up the new record
          window.location.reload();
        } else {
          // PLAN CHANGE
          await subService.updateSubscriptionPlan(user.subscription.id, bucketType.id);

          // Force refresh
          window.location.reload();
        }
        setPendingNewPlan(null);
      } else if (user.subscription && (pendingAction === 'pause' || pendingAction === 'resume')) {
        // STATUS UPDATE
        const newStatus = pendingAction === 'pause' ? 'paused' : 'active';
        await subService.updateSubscriptionStatus(user.subscription.id, newStatus);

        // Force refresh
        window.location.reload();
      }
    } catch (error) {
      console.error("Error updating subscription:", error);
      alert("Failed to update subscription. Please try again.");
    } finally {
      setIsConfirmModalOpen(false);
      setPendingAction(null);
    }
  };

  const toggleSubscriptionStatus = () => {
    if (user.subscription) {
      const isPaused = user.subscription.status === 'paused';
      setPendingAction(isPaused ? 'resume' : 'pause');
      setIsConfirmModalOpen(true);
    }
  };

  const handlePlanChangeInitiate = (planId: string) => {
    if (planId === user.subscription?.plan) {
      setIsChangingPlan(false);
      return;
    }
    setIsChangingPlan(false);
    setPendingNewPlan(planId);
    setPendingAction('change_plan');
    setIsConfirmModalOpen(true);
  };

  /* 
   * Dynamic Plans Fetching 
   */
  const [plans, setPlans] = useState<any[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);

  React.useEffect(() => {
    const fetchPlans = async () => {
      try {
        console.log("Fetching plans...");
        const bucketTypes = await SubscriptionService.getInstance().getBucketTypes();
        console.log("Fetched bucket types:", bucketTypes);

        if (bucketTypes.length === 0) {
          console.warn("No bucket types found in DB. Using fallback.");
          setPlans([
            { id: 'small', name: 'Mini Family', price: 11600, description: 'Perfect for 1-2 people', vegetables: 4, weight: "1.5 - 2 kg" },
            { id: 'medium', name: 'Family', price: 19600, description: 'Great for 3-4 people', vegetables: 7, weight: "3 - 3.5 kg" },
            { id: 'large', name: 'Plus Family', price: 27600, description: 'Ideal for 5+ people', vegetables: 10, weight: "4.5 - 5 kg" }
          ]);
          return;
        }

        const validBucketTypes = bucketTypes.filter(bt => ['mini', 'family', 'plus'].includes(bt.name.toLowerCase()));
        bucketTypesRef.current = bucketTypes;

        const mappedPlans = await Promise.all(validBucketTypes.map(async (bt) => {
          const id = bt.name.toLowerCase() === 'mini' ? 'small' : bt.name.toLowerCase() === 'family' ? 'medium' : 'large';

          let weight = "1.5 - 2 kg";
          if (id === 'medium') weight = "3 - 3.5 kg";
          if (id === 'large') weight = "4.5 - 5 kg";

          return {
            id,
            name: bt.name + (bt.name === 'Mini' ? ' Family' : bt.name === 'Family' ? '' : ' Family'),
            price: bt.monthly_price,
            description: bt.description,
            vegetables: parseInt(bt.display_item_range.replace(/\D/g, '')) || 7,
            weight
          };
        }));

        mappedPlans.sort((a, b) => a.price - b.price);
        setPlans(mappedPlans);
      } catch (error) {
        console.error("Error loading plans:", error);
        setPlans([
          { id: 'small', name: 'Mini Family', price: 11600, description: 'Perfect for 1-2 people', vegetables: 4, weight: "1.5 - 2 kg" },
          { id: 'medium', name: 'Family', price: 19600, description: 'Great for 3-4 people', vegetables: 7, weight: "3 - 3.5 kg" },
          { id: 'large', name: 'Plus Family', price: 27600, description: 'Ideal for 5+ people', vegetables: 10, weight: "4.5 - 5 kg" }
        ]);
      } finally {
        setLoadingPlans(false);
      }
    };

    fetchPlans();
  }, []);

  const currentPlan = plans.find(p => p.id === user.subscription?.plan);

  const [vegetables, setVegetables] = useState<{ id: string; name: string; weight: string }[]>([]);
  const vegetableService = VegetableService.getInstance();
  const { allSelections, refreshWeeklySelection, activeMarketWeekId, timeRemaining } = useWeekly();
  const planKeyForWeek = (user?.subscription?.plan || 'medium') as 'small' | 'medium' | 'large';

  // Same data path as Customize (WeeklyContext → market_week_bucket_vegetables); reload week veg when landing on My Bucket
  React.useEffect(() => {
    if (!user?.subscription || user.subscription.status === 'cancelled') return;
    void refreshWeeklySelection(planKeyForWeek);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshWeeklySelection identity changes each render; plan is enough
  }, [user?.subscription?.status, user?.subscription?.plan, planKeyForWeek]);

  /** Admin week list + customizations; weights from same allocation as Customize (budget + bulk prices from DB). */
  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!user?.subscription || user.subscription.status === 'cancelled') {
        setVegetables([]);
        return;
      }
      await vegetableService.initialize();
      const sel = allSelections[planKeyForWeek];
      let ids = sel?.vegetables ?? [];
      const rawCust = normalizeSubscriptionCustomizations(user.subscription?.customizations);
      const eff = effectiveVegCustomizations(rawCust, activeMarketWeekId);
      const removed = eff.removedVegetables;
      const added = eff.addedVegetables;
      ids = ids.filter((id) => !removed.includes(id));
      for (const a of added) {
        if (!ids.includes(a)) ids.push(a);
      }
      const catalog = vegetableService.getAllVegetables();
      const byId = new Map(catalog.map((v) => [v.id, v]));
      let allocById: Map<string, { allocatedWeight: number; allocatedBudget: number }>;
      try {
        allocById = await getWeeklyAllocationsByVegetableId(planKeyForWeek, ids, catalog);
      } catch {
        allocById = new Map();
      }
      const rows = ids.map((id) => {
        const v = byId.get(id);
        const alloc = allocById.get(id);
        const weight =
          alloc != null
            ? `~${alloc.allocatedWeight}g`
            : v?.typicalWeight ?? '—';
        return { id, name: v?.name ?? id, weight };
      });
      if (!cancelled) setVegetables(rows);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [
    user?.subscription?.status,
    planKeyForWeek,
    allSelections,
    user?.subscription?.customizations?.removedVegetables,
    user?.subscription?.customizations?.addedVegetables,
    activeMarketWeekId,
  ]);

  return (
    <>
      <div className="pt-24 min-h-screen bg-gray-50">
      {/* Header: title row + customization status inline (no extra vertical block) */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="flex min-w-0 items-center space-x-4">
              <Link
                to="/"
                className="flex shrink-0 items-center space-x-2 text-green-600 hover:text-green-700 transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
                <span>Back to Home</span>
              </Link>
              <div className="h-6 w-px shrink-0 bg-gray-300" />
              <h1 className="text-2xl font-bold text-gray-900">My Bucket</h1>
            </div>
            {user.subscription && user.subscription.status !== 'cancelled' && (
              <CustomizationWindowStatusBanner variant="header" />
            )}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Progress: “Automated payment” ticks only after *this calendar week’s* customization close (not Mon–Tue before open; not just !isCustomizationAllowed). */}
        {user.subscription && user.subscription.status !== 'cancelled' && (() => {
          const rawCust = normalizeSubscriptionCustomizations(user.subscription?.customizations);
          const hasCustomizeDone = hasSavedVegCustomizationForCurrentWeek(rawCust, activeMarketWeekId);

          const paymentSaved = Boolean(activeSubscription?.payment_method_id) || setupComplete;
          const isEstablishedSubscriber = paymentSaved;
          const closedForThisWeek = isAfterCustomizationClosedForCurrentWeek();
          const subPm = normalizePaymentMethodJoin(
            (activeSubscription as Subscription | null)?.payment_method
          );
          /** DB seed: `recurring` = card; `cash_on_delivery` = COD — only card gets “Automated payment” step. */
          const showAutomatedPaymentStep = subPm?.code === 'recurring';
          const automatedPaymentDone = showAutomatedPaymentStep && paymentSaved && closedForThisWeek;
          const deliveryDone = thisWeekDeliveryStatus === 'delivered';

          const steps = isEstablishedSubscriber
            ? showAutomatedPaymentStep
              ? [
                  { key: 'select', label: 'Select bucket', done: true, optional: false },
                  { key: 'customize', label: 'Customization', optional: true, done: hasCustomizeDone },
                  { key: 'automated_payment', label: 'Automated payment', optional: false, done: automatedPaymentDone },
                  { key: 'delivery', label: 'Delivery', optional: false, done: deliveryDone },
                ]
              : [
                  { key: 'select', label: 'Select bucket', done: true, optional: false },
                  { key: 'customize', label: 'Customization', optional: true, done: hasCustomizeDone },
                  { key: 'delivery', label: 'Delivery', optional: false, done: deliveryDone },
                ]
            : [
                { key: 'select', label: 'Select bucket', done: true, optional: false },
                { key: 'customize', label: 'Customization', optional: true, done: hasCustomizeDone },
                { key: 'review', label: 'Review and accept', optional: false, done: hasAcceptedReview },
                { key: 'payment', label: 'Set up payment', optional: false, done: false },
                { key: 'delivery', label: 'Delivery', optional: false, done: deliveryDone },
              ];

          const currentIndex = isEstablishedSubscriber
            ? showAutomatedPaymentStep
              ? !hasCustomizeDone
                ? 1
                : !automatedPaymentDone
                  ? 2
                  : !deliveryDone
                    ? 3
                    : 3
              : !hasCustomizeDone
                ? 1
                : !deliveryDone
                  ? 2
                  : 2
            : !hasCustomizeDone
              ? 1
              : hasAcceptedReview
                ? 3
                : 2;

          return (
            <div
              className="mb-8 bg-white rounded-2xl shadow border border-gray-200 p-4 sm:p-6"
              data-schedule-tick={`${timeRemaining.days}-${timeRemaining.hours}-${timeRemaining.minutes}-${timeRemaining.isExpired ? '1' : '0'}`}
            >
              <div className="flex items-center w-full">
                {steps.map((step, i) => (
                  <React.Fragment key={step.key}>
                    <div className="flex flex-col items-center shrink-0">
                      <div
                        className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-semibold ${
                          step.done
                            ? 'border-green-600 bg-green-600 text-white'
                            : i === currentIndex
                              ? 'border-green-600 bg-green-50 text-green-700'
                              : 'border-gray-300 bg-white text-gray-400'
                        }`}
                      >
                        {step.done ? (
                          <Check className="h-5 w-5" aria-hidden />
                        ) : step.key === 'automated_payment' ? (
                          <CreditCard className="h-4 w-4" aria-hidden />
                        ) : step.key === 'delivery' ? (
                          <Truck className="h-4 w-4" aria-hidden />
                        ) : (
                          i + 1
                        )}
                      </div>
                      <span className={`mt-1.5 text-[10px] sm:text-xs font-medium text-center leading-tight max-w-[4.5rem] sm:max-w-[5.5rem] ${step.done || i === currentIndex ? 'text-gray-900' : 'text-gray-500'}`}>
                        {step.label}
                        {step.optional && <span className="text-gray-400"> (optional)</span>}
                      </span>
                    </div>
                    {i < steps.length - 1 && (
                      <div
                        className={`flex-1 h-0.5 mx-1 sm:mx-2 rounded min-w-[8px] ${
                          step.done ? 'bg-green-600' : 'bg-gray-200'
                        }`}
                      />
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          );
        })()}

        <div className="space-y-8">
                {(!user.subscription || user.subscription.status === 'cancelled') ? (
                  /* No Subscription - Plan Selection */
                  <div className="bg-white rounded-3xl shadow-lg p-8">
                    <div className="text-center mb-8">
                      <h2 className="text-3xl font-bold text-gray-900 mb-4">Choose Your Leafy Bucket Plan</h2>
                      <p className="text-gray-600">Start your journey to healthier eating with fresh vegetables delivered weekly</p>
                    </div>

                    {loadingPlans ? (
                      <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
                        <p className="text-gray-500">Loading plans...</p>
                      </div>
                    ) : (
                      <div className="grid md:grid-cols-3 gap-6">
                        {plans.map((plan) => (
                          <div key={plan.id} className={`border-2 rounded-2xl p-6 transition-all hover:shadow-lg ${plan.id === 'medium' ? 'border-green-600 bg-green-50' : 'border-gray-200'
                            }`}>
                            {plan.id === 'medium' && (
                              <div className="text-center mb-4">
                                <span className="bg-green-600 text-white px-3 py-1 rounded-full text-sm font-semibold">
                                  Most Popular
                                </span>
                              </div>
                            )}

                            <div className="text-center mb-6">
                              <h3 className="text-xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                              <p className="text-gray-600 mb-4">{plan.description}</p>
                              <div className="text-3xl font-bold text-green-600 mb-2">
                                LKR {plan.price.toLocaleString()}
                              </div>
                              <div className="text-sm text-gray-600">per month</div>
                            </div>

                            <div className="space-y-3 mb-6">
                              <div className="flex items-center space-x-2">
                                <Check className="h-4 w-4 text-green-600" />
                                <span className="text-sm">{plan.vegetables} varieties of vegetables</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Check className="h-4 w-4 text-green-600" />
                                <span className="text-sm">{plan.weight} of fresh produce</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Check className="h-4 w-4 text-green-600" />
                                <span className="text-sm">Weekly delivery</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Check className="h-4 w-4 text-green-600" />
                                <span className="text-sm">Free delivery</span>
                              </div>
                            </div>

                            <button
                              onClick={() => handleStartSubscriptionRequest(plan.id)}
                              className={`w-full py-3 px-6 rounded-xl font-semibold transition-colors ${plan.id === 'medium'
                                ? 'bg-green-600 text-white hover:bg-green-700'
                                : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                                }`}
                            >
                              Select Bucket Size
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  /* Active Subscription Overview */
                  <>
                    {/* E‑commerce style: main content (left) + subscription summary sidebar (right) */}
                    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">
                      {/* Your vegetables for this week - main content (left) */}
                      <div className="bg-white rounded-3xl shadow-lg p-8">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-xl font-bold text-gray-900">Your vegetables for this week</h3>
                          <Link
                            to="/customize"
                            className="text-green-600 hover:text-green-700 font-medium text-sm flex items-center space-x-1 shrink-0"
                          >
                            <span>Customize</span>
                            <Settings className="h-4 w-4" />
                          </Link>
                        </div>
                        <p className="text-sm text-gray-600 mb-6">
                          Here’s what’s in your bucket for the current week. Use Customize to swap or add items before we lock your selection.
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {vegetables.length === 0 ? (
                            <p className="text-sm text-gray-600 col-span-full">
                              No vegetables listed for this week yet. Your admin sets them under Bucket types → Vegetables for week, or open Customize once your selection is ready.
                            </p>
                          ) : (
                            vegetables.map((veg) => (
                              <div key={veg.id} className="flex items-center justify-between p-4 bg-green-50 rounded-xl">
                                <div>
                                  <div className="font-medium text-gray-900">{veg.name}</div>
                                  <div className="text-sm text-gray-600">{veg.weight}</div>
                                </div>
                                <Leaf className="h-5 w-5 text-green-600" />
                              </div>
                            ))
                          )}
                        </div>

                        {(!activeSubscription?.payment_method_id && !setupComplete) && (
                          <button
                            type="button"
                            onClick={() => {
                              setHasAcceptedReview(true);
                              setShowPaymentSetup(true);
                            }}
                            className="mt-6 w-full flex items-center justify-center space-x-2 py-3 px-6 rounded-xl font-semibold bg-green-600 text-white hover:bg-green-700 transition-colors"
                          >
                            <Check className="h-5 w-5" />
                            <span>Accept and proceed to payment</span>
                          </button>
                        )}
                      </div>

                      {/* Your Subscription - right sidebar (cart-style) */}
                      <div className="lg:sticky lg:top-28 self-start bg-white rounded-3xl shadow-lg border border-gray-200 p-6">
                        <div className="flex items-center justify-between mb-4">
                          <h2 className="text-lg font-bold text-gray-900">Your Subscription</h2>
                          <div className={`px-4 py-2 rounded-full text-sm font-semibold ${user.subscription.status === 'active'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-yellow-100 text-yellow-800'
                            }`}>
                            {user.subscription.status === 'active' ? 'Active' : 'Paused'}
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className="text-sm font-semibold text-gray-900">{currentPlan?.name}</div>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-gray-600">Monthly:</span>
                              <span className="font-semibold">LKR {currentPlan?.price.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Vegetables:</span>
                              <span className="font-medium">{currentPlan?.vegetables} varieties</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Weight:</span>
                              <span className="font-medium">{currentPlan?.weight}</span>
                            </div>
                            <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                              <span className="text-gray-600">Next delivery:</span>
                              <span className="font-semibold text-green-600">
                                {new Date(user.subscription.nextDelivery).toLocaleDateString()}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100">
                              <p className="min-w-0 flex-1 text-sm leading-snug">
                                <span className="text-gray-600">Payment method: </span>
                                <span className="font-medium text-gray-900">{paymentMethodSidebarLabel}</span>
                              </p>
                              <button
                                type="button"
                                onClick={() => setShowPaymentSetup(true)}
                                className="shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-md border border-green-200 text-green-700 bg-green-50/80 hover:bg-green-100 hover:border-green-300 transition-colors"
                              >
                                {activeSubscription?.payment_method_id || setupComplete ? 'Change' : 'Set up'}
                              </button>
                            </div>
                          </div>
                          <button
                            onClick={() => setIsChangingPlan(!isChangingPlan)}
                            className="w-full text-xs font-medium py-2 rounded-lg border border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100"
                          >
                            {isChangingPlan ? 'Cancel' : 'Change Plan'}
                          </button>
                          <button
                            onClick={toggleSubscriptionStatus}
                            className={`w-full flex items-center justify-center space-x-2 py-2.5 px-4 rounded-xl text-sm font-semibold transition-colors ${user.subscription.status === 'active'
                              ? 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
                              : 'bg-green-100 text-green-800 hover:bg-green-200'
                              }`}
                          >
                            {user.subscription.status === 'active' ? (
                              <>
                                <Pause className="h-4 w-4" />
                                <span>Pause bucket</span>
                              </>
                            ) : (
                              <>
                                <Play className="h-4 w-4" />
                                <span>Resume bucket</span>
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 rounded-xl text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 border border-gray-300 transition-colors"
                          >
                            <span>Cancel bucket</span>
                          </button>
                          <p className="text-[11px] text-gray-500 leading-tight">
                            {user.subscription.status === 'active'
                              ? 'Pausing holds deliveries only. Plan and preferences are saved—resume anytime.'
                              : 'Resume when ready; your next delivery will be scheduled.'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Change Plan Modal */}
                    {isChangingPlan && (
                      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setIsChangingPlan(false)}>
                        <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-between p-4 border-b border-gray-200">
                            <h3 className="text-lg font-bold text-gray-900">Select Plan Size</h3>
                            <button
                              type="button"
                              onClick={() => setIsChangingPlan(false)}
                              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                              aria-label="Close"
                            >
                              <X className="h-5 w-5" />
                            </button>
                          </div>
                          <div className="p-4">
                            <div className="grid grid-cols-1 gap-3">
                              {plans.map((plan) => (
                                <button
                                  key={plan.id}
                                  onClick={() => handlePlanChangeInitiate(plan.id)}
                                  className={`p-4 rounded-xl border-2 text-left transition-all ${plan.id === user.subscription?.plan
                                    ? 'border-green-600 bg-green-50'
                                    : 'border-gray-100 hover:border-green-200 hover:bg-green-50/50'
                                    }`}
                                >
                                  <div className="font-bold text-gray-900">{plan.name}</div>
                                  <div className="text-sm text-green-600 font-semibold mb-1">LKR {plan.price.toLocaleString()}</div>
                                  <div className="text-xs text-gray-600">{plan.vegetables} varieties • {plan.weight}</div>
                                  {plan.id === user.subscription?.plan && (
                                    <div className="mt-2 text-[10px] uppercase tracking-wider font-bold text-green-700">Current Plan</div>
                                  )}
                                </button>
                              ))}
                            </div>
                            <button
                              type="button"
                              onClick={() => setIsChangingPlan(false)}
                              className="mt-4 w-full py-2 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Payment setup popup (after Accept) */}
                    {showPaymentSetup && (
                      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowPaymentSetup(false)}>
                        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-between p-4 border-b border-gray-200">
                            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                              <CreditCard className="h-5 w-5 text-green-600" />
                              {activeSubscription?.payment_method_id || setupComplete ? 'Change payment method' : 'Set up payment'}
                            </h3>
                            <button
                              type="button"
                              onClick={() => setShowPaymentSetup(false)}
                              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                              aria-label="Close"
                            >
                              <X className="h-5 w-5" />
                            </button>
                          </div>
                          <div className="p-6">
                            <p className="text-sm text-gray-600 mb-4">
                              {activeSubscription?.payment_method_id || setupComplete
                                ? 'Choose how you’d like to pay. Your selection applies to future deliveries.'
                                : 'Choose how you’d like to pay for your bucket. You can update this later.'}
                            </p>
                            {loadingPaymentMethods ? (
                              <div className="py-6 text-center text-gray-500 text-sm">Loading payment methods…</div>
                            ) : paymentMethods.length === 0 ? (
                              <div className="py-6 text-center text-gray-500 text-sm">No payment methods available. Please try again later.</div>
                            ) : (
                              <div className="space-y-3">
                                {paymentMethods.map((pm) => (
                                  <button
                                    key={pm.id}
                                    type="button"
                                    onClick={() => setSelectedPaymentMethodId(pm.id)}
                                    className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-colors ${
                                      selectedPaymentMethodId === pm.id
                                        ? 'border-green-600 bg-green-50'
                                        : 'border-gray-200 bg-white hover:border-green-300 hover:bg-gray-50'
                                    }`}
                                  >
                                    <CreditCard className="h-6 w-6 text-green-600 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                      <div className="font-semibold text-gray-900">{pm.name}</div>
                                      {pm.description && (
                                        <div className="text-sm text-gray-600 mt-0.5">{pm.description}</div>
                                      )}
                                    </div>
                                    {selectedPaymentMethodId === pm.id && (
                                      <Check className="h-5 w-5 text-green-600 shrink-0" />
                                    )}
                                  </button>
                                ))}
                              </div>
                            )}
                            <button
                              type="button"
                              disabled={loadingPaymentMethods || paymentMethods.length === 0 || !selectedPaymentMethodId}
                              onClick={async () => {
                                if (!user?.id || !selectedPaymentMethodId) return;
                                const subId =
                                  (activeSubscription as Subscription | null)?.id ??
                                  user.subscription?.id;
                                if (!subId) {
                                  alert('No subscription found. Please refresh the page.');
                                  return;
                                }
                                try {
                                  const row =
                                    await SubscriptionService.getInstance().updateSubscriptionPaymentMethod(
                                      subId,
                                      selectedPaymentMethodId,
                                      user.id
                                    );
                                  const refreshed =
                                    await SubscriptionService.getInstance().getActiveSubscription(user.id);
                                  if (refreshed?.subscription) setActiveSubscription(refreshed.subscription);
                                  if (user.subscription) {
                                    await updateUser({
                                      subscription: {
                                        ...user.subscription,
                                        payment_method_id:
                                          row.payment_method_id ?? selectedPaymentMethodId,
                                      },
                                    });
                                  }
                                } catch (e) {
                                  console.error('Failed to save payment method:', e);
                                  alert('Failed to save payment method. Please try again.');
                                  return;
                                }
                                setShowPaymentSetup(false);
                                if (user?.id) {
                                  try {
                                    localStorage.setItem(`${SETUP_COMPLETE_KEY}_${user.id}`, '1');
                                  } catch {
                                    // ignore
                                  }
                                  setSetupComplete(true);
                                }
                              }}
                              className="mt-6 w-full py-3 rounded-xl font-semibold bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {activeSubscription?.payment_method_id || setupComplete ? 'Save payment method' : 'Done'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Next Delivery from Real DB or Context Fallback */}
                    <div className="bg-gradient-to-r from-green-50 to-orange-50 rounded-3xl p-8">
                      <h3 className="text-xl font-bold text-gray-900 mb-6">Next Delivery</h3>
                      <div className="grid md:grid-cols-3 gap-6">
                        <div className="text-center">
                          <Calendar className="h-8 w-8 text-green-600 mx-auto mb-2" />
                          <div className="font-semibold text-gray-900">
                            {new Date(currentDelivery?.scheduled_date || user.subscription.nextDelivery).toLocaleDateString('en-US', {
                              weekday: 'long',
                              month: 'long',
                              day: 'numeric'
                            })}
                          </div>
                          <div className="text-sm text-gray-600">
                            {currentDelivery ? `Delivery #${currentDelivery.delivery_index} of 4` : 'Delivery Date'}
                          </div>
                        </div>
                        <div className="text-center">
                          <Clock className="h-8 w-8 text-orange-600 mx-auto mb-2" />
                          <div className="font-semibold text-gray-900">8 AM - 12 PM</div>
                          <div className="text-sm text-gray-600">Time Window</div>
                        </div>
                        <div className="text-center">
                          <Truck className="h-8 w-8 text-blue-600 mx-auto mb-2" />
                          <div className="font-semibold text-gray-900">Free Delivery</div>
                          <div className="text-sm text-gray-600">To Your Door</div>
                        </div>
                      </div>
                    </div>

                    {/* Billing Summary */}
                    <div className="bg-white rounded-3xl shadow-lg p-8">
                      <h3 className="text-xl font-bold text-gray-900 mb-6">Billing Summary</h3>

                      <div className="grid md:grid-cols-2 gap-8">
                        <div>
                          <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-6">
                            <h4 className="font-semibold text-green-900 mb-4">Current Plan</h4>
                            <div className="flex justify-between items-center">
                              <div>
                                <div className="font-medium text-gray-900">{currentPlan?.name}</div>
                                <div className="text-sm text-gray-600">Monthly subscription</div>
                              </div>
                              <div className="text-2xl font-bold text-green-600">
                                LKR {currentPlan?.price.toLocaleString()}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between gap-2 mb-4">
                            <h4 className="font-semibold text-gray-900">Payment Method</h4>
                            <button
                              type="button"
                              onClick={() => setShowPaymentSetup(true)}
                              className="shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-md border border-green-200 text-green-700 bg-green-50/80 hover:bg-green-100 hover:border-green-300 transition-colors"
                            >
                              Change
                            </button>
                          </div>
                          <div className="bg-gray-50 rounded-xl p-4 mb-4">
                            <div className="flex items-center space-x-3">
                              <Package className="h-5 w-5 text-gray-600 shrink-0" />
                              <div className="min-w-0">
                                <div className="font-medium text-gray-900">
                                  {paymentMethodSidebarLabel === 'Loading…' ? 'Loading…' : paymentMethodSidebarLabel}
                                </div>
                                {paymentMethodDescription ? (
                                  <div className="text-sm text-gray-600 mt-0.5">{paymentMethodDescription}</div>
                                ) : paymentMethodSidebarLabel === 'Not set' ? (
                                  <div className="text-sm text-gray-600 mt-0.5">Choose how you’d like to pay — use Change above.</div>
                                ) : null}
                              </div>
                            </div>
                          </div>

                          <div className="text-center">
                            <div className="text-sm text-gray-600 mb-2">Delivery Address:</div>
                            <div className="font-medium text-gray-900">
                              {user.address || 'Please update your profile with delivery address'}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
        </div>
      </div>

      <ConfirmationModal
        isOpen={isConfirmModalOpen}
        onClose={() => {
          setIsConfirmModalOpen(false);
          setPendingAction(null);
        }}
        onConfirm={handleConfirmStatusChange}
        title={
          pendingAction === 'pause' ? 'Pause deliveries for a while?' :
            pendingAction === 'resume' ? 'Resume deliveries?' :
              'Confirm plan'
        }
        message={
          pendingAction === 'pause'
            ? 'Deliveries will be put on hold. Your plan and preferences stay the same—resume anytime when you\'re ready and your next box will be scheduled.'
            : pendingAction === 'resume'
              ? 'Your vegetable deliveries will start again from the next scheduled date. Your plan is unchanged.'
              : `You're choosing the ${plans.find(p => p.id === pendingNewPlan)?.name ?? 'selected'} plan. Your billing and vegetable allocation will be based on this plan.`
        }
        confirmText={
          pendingAction === 'pause' ? 'Yes, pause for now' :
            pendingAction === 'resume' ? 'Yes, resume' :
              'Confirm'
        }
        cancelText="Cancel"
        isDangerous={false}
      />
    </div>
    </>
  );
};

export default SubscriptionPage;