import React, { useState } from 'react';
import { ArrowLeft, Package, Settings, Pause, Play, Check, Calendar, Clock, Truck, Leaf, X, CreditCard, SkipForward, Lock } from 'lucide-react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useWeekly } from '../contexts/WeeklyContext';
import type { PaymentMethod, Subscription } from '../services/SubscriptionService';
import ConfirmationModal from '../components/ConfirmationModal';
import CustomizationWindowStatusBanner from '../components/CustomizationWindowStatusBanner';
import SubscriptionService from '../services/SubscriptionService';
import VegetableService from '../services/vegetableService';
import { getWeeklyAllocationsByVegetableId } from '../utils/weeklyPlanAllocation';
import {
  normalizeDeliveryCustomizations,
  hasConfirmedThisWeekPicks,
} from '../utils/deliveryCustomizations';
import {
  isAfterCustomizationClosedForCurrentWeek,
  getScheduleContext,
  getCustomizationWindowBoundsForLocalWeek,
  getCustomizationWindowInMarketWeek,
  getScheduleWindowPartsFromInstants,
  type ScheduleWindowParts,
} from '../utils/customizationSchedule';
import {
  formatPaymentMethodLabel,
  normalizePaymentMethodJoin,
  getEffectiveEntitledDeliveries,
  computeSubscriptionCharge,
  formatLkr,
  getPlanBillingListPrice,
  getWeeklyUnitPrice,
  billingPeriodLabel,
  DEFAULT_PACK_WEEKS,
  type BillingPlanCode,
  type SubscriptionPlanRow,
} from '../utils/paymentMethodDisplay';
import { getCurrentWeekDateRange } from '../utils/marketWeekUtils';
import { supabase } from '../lib/supabase';

const SubscriptionPage = () => {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<'pause' | 'resume' | 'change_plan' | 'skip_week' | 'unskip_week' | null>(null);
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

  // Signup wizard: bucket → billing plan → payment
  const [showSignupWizard, setShowSignupWizard] = useState(false);
  const [signupStep, setSignupStep] = useState<1 | 2 | 3>(1);
  const [signupBucketSizeId, setSignupBucketSizeId] = useState<string | null>(null);
  const [billingPlans, setBillingPlans] = useState<SubscriptionPlanRow[]>([]);
  const [selectedBillingPlanId, setSelectedBillingPlanId] = useState<string | null>(null);
  const [signupPaymentMethods, setSignupPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedSignupPaymentId, setSelectedSignupPaymentId] = useState<string | null>(null);
  const [loadingSignupPayments, setLoadingSignupPayments] = useState(false);
  const [signupSubmitting, setSignupSubmitting] = useState(false);
  const [plans, setPlans] = useState<any[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);

  // Change billing plan (existing subscribers)
  const [showBillingPlanChange, setShowBillingPlanChange] = useState(false);
  const [changeBillingPlanId, setChangeBillingPlanId] = useState<string | null>(null);
  const [changeBillingPayments, setChangeBillingPayments] = useState<PaymentMethod[]>([]);
  const [changeBillingPaymentId, setChangeBillingPaymentId] = useState<string | null>(null);
  const [changeBillingSubmitting, setChangeBillingSubmitting] = useState(false);
  const [acceptingAdminPicks, setAcceptingAdminPicks] = useState(false);

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

  // Fetch payment methods when payment setup / change modal opens (filtered by plan allow-list)
  React.useEffect(() => {
    if (!showPaymentSetup) return;
    let cancelled = false;
    setLoadingPaymentMethods(true);
    const preferredId =
      activeSubscription?.payment_method_id ?? user?.subscription?.payment_method_id ?? null;
    const planId = activeSubscription?.subscription_plan_id ?? null;
    const svc = SubscriptionService.getInstance();
    const load = planId
      ? svc.getPaymentMethodsForPlan(planId)
      : svc.getPaymentMethods();
    load
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
  }, [
    showPaymentSetup,
    activeSubscription?.payment_method_id,
    activeSubscription?.subscription_plan_id,
    user?.subscription?.payment_method_id,
  ]);

  // Load billing plans for price display (and signup / change-billing modals)
  React.useEffect(() => {
    let cancelled = false;
    SubscriptionService.getInstance()
      .getSubscriptionPlans()
      .then((list) => {
        if (cancelled) return;
        setBillingPlans(list);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Signup wizard: payment methods for selected plan (only after user picks a plan)
  React.useEffect(() => {
    if (!showSignupWizard || !selectedBillingPlanId) {
      setSignupPaymentMethods([]);
      setSelectedSignupPaymentId(null);
      return;
    }
    let cancelled = false;
    setLoadingSignupPayments(true);
    SubscriptionService.getInstance()
      .getPaymentMethodsForPlan(selectedBillingPlanId)
      .then((list) => {
        if (cancelled) return;
        setSignupPaymentMethods(list);
        setSelectedSignupPaymentId(null); // require explicit payment choice
      })
      .finally(() => {
        if (!cancelled) setLoadingSignupPayments(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showSignupWizard, selectedBillingPlanId]);

  // Change-billing modal: load payments for chosen plan
  React.useEffect(() => {
    if (!showBillingPlanChange || !changeBillingPlanId) {
      setChangeBillingPayments([]);
      setChangeBillingPaymentId(null);
      return;
    }
    let cancelled = false;
    SubscriptionService.getInstance()
      .getPaymentMethodsForPlan(changeBillingPlanId)
      .then((list) => {
        if (cancelled) return;
        setChangeBillingPayments(list);
        const currentPm = activeSubscription?.payment_method_id;
        setChangeBillingPaymentId(
          currentPm && list.some((p) => p.id === currentPm) ? currentPm : null
        );
      });
    return () => {
      cancelled = true;
    };
  }, [showBillingPlanChange, changeBillingPlanId, activeSubscription?.payment_method_id]);

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
  }, [user?.id, user?.subscription?.id, user?.subscription?.customizations]);

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

  const editsLocked =
    !!user.subscription &&
    (user.subscription.status === 'paused' ||
      user.subscription.currentDeliveryStatus === 'skipped');

  const openSignupWizard = (
    bucketSizeId?: string | null,
    billingPlanCode?: BillingPlanCode | null
  ) => {
    setSignupBucketSizeId(bucketSizeId ?? null);
    setSelectedBillingPlanId(null);
    setSelectedSignupPaymentId(null);
    setSignupPaymentMethods([]);
    setSignupStep(bucketSizeId ? 2 : 1);
    setShowSignupWizard(true);
    // Prefer plan code until billingPlans load; effect below maps id
    if (billingPlanCode) {
      try {
        sessionStorage.setItem('leafy_signup_billing_code', billingPlanCode);
      } catch {
        // ignore
      }
    }
  };

  // Apply Pricing → My Bucket prefs (bucket + monthly/weekly)
  React.useEffect(() => {
    if (!user?.id) return;
    if (user.subscription && user.subscription.status !== 'cancelled') return;

    const state = location.state as {
      bucketSizeId?: string;
      billingPlan?: BillingPlanCode;
    } | null;

    let bucketSizeId = state?.bucketSizeId ?? null;
    let billingPlan = state?.billingPlan ?? null;
    if (!bucketSizeId || !billingPlan) {
      try {
        const raw = sessionStorage.getItem('leafy_signup_pref');
        if (raw) {
          const pref = JSON.parse(raw) as { bucketSizeId?: string; billingPlan?: BillingPlanCode };
          bucketSizeId = bucketSizeId ?? pref.bucketSizeId ?? null;
          billingPlan = billingPlan ?? pref.billingPlan ?? null;
        }
      } catch {
        // ignore
      }
    }
    if (!bucketSizeId && !billingPlan) return;

    openSignupWizard(bucketSizeId, billingPlan);
    try {
      sessionStorage.removeItem('leafy_signup_pref');
    } catch {
      // ignore
    }
    navigate(location.pathname, { replace: true, state: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when arriving from Pricing
  }, [user?.id]);

  // When wizard opens with a preferred billing code, select that plan once plans load
  React.useEffect(() => {
    if (!showSignupWizard || billingPlans.length === 0) return;
    let code: string | null = null;
    try {
      code = sessionStorage.getItem('leafy_signup_billing_code');
    } catch {
      code = null;
    }
    if (!code) return;
    const match = billingPlans.find((p) => p.code === code);
    if (match) {
      setSelectedBillingPlanId(match.id);
      if (signupStep < 2) setSignupStep(2);
      try {
        sessionStorage.removeItem('leafy_signup_billing_code');
      } catch {
        // ignore
      }
    }
  }, [showSignupWizard, billingPlans, signupStep]);

  const handleAcceptAdminPicks = async () => {
    const deliveryId =
      currentDelivery?.id ?? user?.subscription?.currentDeliveryId ?? null;
    if (!deliveryId || !user?.subscription) return;
    setAcceptingAdminPicks(true);
    try {
      const base = normalizeDeliveryCustomizations(
        currentDelivery?.customizations ?? user.subscription.customizations
      );
      const next = { ...base, acceptedAdminPicks: true };
      await SubscriptionService.getInstance().saveDeliveryCustomizations(deliveryId, next);
      setCurrentDelivery((prev: any) =>
        prev ? { ...prev, customizations: next } : prev
      );
      updateUser({
        subscription: {
          ...user.subscription,
          customizations: {
            excludedVegetables: next.excludedVegetables,
            removedVegetables: next.removedVegetables,
            addedVegetables: next.addedVegetables,
            deliveryDay: next.deliveryDay,
            acceptedAdminPicks: true,
          },
        },
      });
    } catch (e) {
      console.error('Error accepting admin picks:', e);
      alert('Could not save. Please try again.');
    } finally {
      setAcceptingAdminPicks(false);
    }
  };

  const handleStartSubscriptionRequest = (planId: string) => {
    if (!user.subscription || user.subscription.status === 'cancelled') {
      openSignupWizard(planId);
      return;
    }
    setPendingNewPlan(planId);
    setPendingAction('change_plan');
    setIsConfirmModalOpen(true);
  };

  const signupBucketType = React.useMemo(() => {
    if (!signupBucketSizeId) return null;
    const fromPlans = plans.find((p) => p.id === signupBucketSizeId);
    if (fromPlans?.bucketTypeId) {
      return {
        id: fromPlans.bucketTypeId as string,
        name: String(fromPlans.name),
        monthly_price: Number(fromPlans.price) || 0,
        handling_fee: Number(fromPlans.handlingFee) || 0,
      };
    }
    return (
      bucketTypesRef.current.find((bt) => {
        const mappedId =
          bt.name.toLowerCase() === 'mini'
            ? 'small'
            : bt.name.toLowerCase() === 'family'
              ? 'medium'
              : 'large';
        return mappedId === signupBucketSizeId;
      }) ?? null
    );
  }, [signupBucketSizeId, showSignupWizard, plans]);

  const selectedBillingPlan = React.useMemo(
    () => billingPlans.find((p) => p.id === selectedBillingPlanId) ?? null,
    [billingPlans, selectedBillingPlanId]
  );

  const selectedSignupPayment = React.useMemo(
    () => signupPaymentMethods.find((p) => p.id === selectedSignupPaymentId) ?? null,
    [signupPaymentMethods, selectedSignupPaymentId]
  );

  const packWeeks = React.useMemo(() => {
    const monthly = billingPlans.find((p) => p.code === 'monthly');
    return Math.max(Number(monthly?.entitled_deliveries) || DEFAULT_PACK_WEEKS, 1);
  }, [billingPlans]);

  /** Catalog-correct period charge (fixes stale weekly snapshots that stored the full pack). */
  const displayPeriodCharge = React.useMemo(() => {
    const sub = activeSubscription as Subscription | null;
    const bt = sub?.bucket_type;
    const plan = sub?.subscription_plan;
    if (!bt || !plan) {
      const snap = Number(sub?.charge_amount);
      return Number.isFinite(snap) && snap > 0 ? snap : null;
    }
    const payment =
      normalizePaymentMethodJoin(sub.payment_method) ??
      paymentMethods.find((p) => p.id === sub.payment_method_id) ??
      null;
    return computeSubscriptionCharge({
      listPrice: getPlanBillingListPrice({
        packPrice: Number(bt.monthly_price) || 0,
        planCode: plan.code,
        packWeeks,
      }),
      handlingFee: Number(bt.handling_fee) || 0,
      plan,
      payment,
    }).charge_amount;
  }, [activeSubscription, paymentMethods, packWeeks]);

  const signupCharge = React.useMemo(() => {
    if (!signupBucketType || !selectedBillingPlan) return null;
    const listPrice = getPlanBillingListPrice({
      packPrice: Number(signupBucketType.monthly_price) || 0,
      planCode: selectedBillingPlan.code,
      packWeeks,
    });
    return computeSubscriptionCharge({
      listPrice,
      handlingFee: Number(signupBucketType.handling_fee) || 0,
      plan: selectedBillingPlan,
      payment: selectedSignupPayment,
    });
  }, [signupBucketType, selectedBillingPlan, selectedSignupPayment, packWeeks]);

  const changeBillingPlan = React.useMemo(
    () => billingPlans.find((p) => p.id === changeBillingPlanId) ?? null,
    [billingPlans, changeBillingPlanId]
  );

  const changeBillingPayment = React.useMemo(
    () => changeBillingPayments.find((p) => p.id === changeBillingPaymentId) ?? null,
    [changeBillingPayments, changeBillingPaymentId]
  );

  const changeBillingCharge = React.useMemo(() => {
    const bt = (activeSubscription as Subscription | null)?.bucket_type;
    if (!bt || !changeBillingPlan) return null;
    const listPrice = getPlanBillingListPrice({
      packPrice: Number(bt.monthly_price) || 0,
      planCode: changeBillingPlan.code,
      packWeeks,
    });
    return computeSubscriptionCharge({
      listPrice,
      handlingFee: Number(bt.handling_fee) || 0,
      plan: changeBillingPlan,
      payment: changeBillingPayment,
    });
  }, [activeSubscription, changeBillingPlan, changeBillingPayment, packWeeks]);

  const handleSignupConfirm = async () => {
    if (!user?.id || !signupBucketType || !selectedBillingPlan || !selectedSignupPaymentId) return;
    setSignupSubmitting(true);
    try {
      const planCode = selectedBillingPlan.code as BillingPlanCode;
      if (!['weekly', 'monthly', 'one_time'].includes(planCode)) {
        throw new Error('Please select a valid billing plan');
      }
      await SubscriptionService.getInstance().createSubscription(
        user.id,
        signupBucketType.id,
        planCode,
        selectedSignupPaymentId
      );
      window.location.reload();
    } catch (error) {
      console.error('Error creating subscription:', error);
      const detail =
        error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string'
          ? (error as { message: string }).message
          : '';
      alert(detail ? `Failed to start subscription: ${detail}` : 'Failed to start subscription. Please try again.');
    } finally {
      setSignupSubmitting(false);
    }
  };

  const handleBillingPlanChangeConfirm = async () => {
    if (!user?.id || !user.subscription?.id || !changeBillingPlan || !changeBillingPaymentId) return;
    setChangeBillingSubmitting(true);
    try {
      const planCode = changeBillingPlan.code as BillingPlanCode;
      await SubscriptionService.getInstance().updateSubscriptionBillingPlan(
        user.subscription.id,
        user.id,
        planCode,
        changeBillingPaymentId
      );
      window.location.reload();
    } catch (error) {
      console.error('Error changing billing plan:', error);
      const detail =
        error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string'
          ? (error as { message: string }).message
          : '';
      alert(detail || 'Failed to change billing plan');
    } finally {
      setChangeBillingSubmitting(false);
    }
  };

  const handleConfirmStatusChange = async () => {
    if (!user || (!user.subscription && pendingAction !== 'change_plan')) return;

    try {
      const subService = SubscriptionService.getInstance();

      if (pendingAction === 'change_plan' && pendingNewPlan) {
        const bucketType = bucketTypesRef.current.find(bt => {
          const mappedId = bt.name.toLowerCase() === 'mini' ? 'small' : bt.name.toLowerCase() === 'family' ? 'medium' : 'large';
          return mappedId === pendingNewPlan;
        });

        if (!bucketType) throw new Error("Bucket type not found");

        if (!user.subscription) {
          openSignupWizard(pendingNewPlan);
          setIsConfirmModalOpen(false);
          setPendingAction(null);
          setPendingNewPlan(null);
          return;
        }
        await subService.updateSubscriptionPlan(user.subscription.id, bucketType.id);
        window.location.reload();
        setPendingNewPlan(null);
      } else if (user.subscription && pendingAction === 'skip_week') {
        await subService.skipDeliveryThisWeek();
        window.location.reload();
      } else if (user.subscription && pendingAction === 'unskip_week') {
        await subService.unskipDeliveryThisWeek();
        window.location.reload();
      } else if (user.subscription && (pendingAction === 'pause' || pendingAction === 'resume')) {
        const newStatus = pendingAction === 'pause' ? 'paused' : 'active';
        await subService.updateSubscriptionStatus(user.subscription.id, newStatus);
        window.location.reload();
      }
    } catch (error) {
      console.error("Error updating subscription:", error);
      const detail =
        error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string'
          ? (error as { message: string }).message
          : '';
      alert(
        detail
          ? `Failed to update subscription: ${detail}`
          : 'Failed to update subscription. Please try again.'
      );
    } finally {
      setIsConfirmModalOpen(false);
      setPendingAction(null);
    }
  };

  const toggleSubscriptionStatus = () => {
    if (!user.subscription) return;
    if (user.subscription.currentDeliveryStatus === 'skipped') return;
    const isPaused = user.subscription.status === 'paused';
    setPendingAction(isPaused ? 'resume' : 'pause');
    setIsConfirmModalOpen(true);
  };

  const initiateSkipThisWeek = () => {
    if (user.subscription?.status === 'active' && user.subscription.currentDeliveryStatus !== 'skipped') {
      setPendingAction('skip_week');
      setIsConfirmModalOpen(true);
    }
  };

  const initiateUnskipThisWeek = () => {
    if (user.subscription?.status === 'active' && user.subscription.currentDeliveryStatus === 'skipped') {
      setPendingAction('unskip_week');
      setIsConfirmModalOpen(true);
    }
  };

  const handlePlanChangeInitiate = (planId: string) => {
    if (
      user?.subscription?.status === 'paused' ||
      user?.subscription?.currentDeliveryStatus === 'skipped'
    ) {
      return;
    }
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
            bucketTypeId: bt.id,
            name: bt.name + (bt.name === 'Mini' ? ' Family' : bt.name === 'Family' ? '' : ' Family'),
            price: bt.monthly_price,
            handlingFee: bt.handling_fee,
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
  const { allSelections, refreshWeeklySelection, timeRemaining, isCustomizationAllowed, scheduleDisplay } = useWeekly();
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
      const cust = normalizeDeliveryCustomizations(
        currentDelivery?.customizations ?? user.subscription?.customizations
      );
      const removed = cust.removedVegetables;
      const added = cust.addedVegetables;
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
    currentDelivery?.id,
    currentDelivery?.customizations,
    user?.subscription?.customizations,
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
            {user.subscription &&
              user.subscription.status !== 'cancelled' &&
              user.subscription.status !== 'paused' &&
              user.subscription.currentDeliveryStatus !== 'skipped' && (
              <CustomizationWindowStatusBanner variant="header" />
            )}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Progress timeline: normal week steps, or paused/skipped hold state */}
        {user.subscription && user.subscription.status !== 'cancelled' && (() => {
          const isPaused = user.subscription.status === 'paused';
          const isWeekSkipped = user.subscription.currentDeliveryStatus === 'skipped';
          const isOnHold = isPaused || isWeekSkipped;

          const cust = normalizeDeliveryCustomizations(
            currentDelivery?.customizations ?? user.subscription?.customizations
          );
          const hasCustomizeDone = hasConfirmedThisWeekPicks(cust);

          const paymentSaved = Boolean(activeSubscription?.payment_method_id) || setupComplete;
          const isEstablishedSubscriber = paymentSaved;
          const closedForThisWeek = isAfterCustomizationClosedForCurrentWeek();
          const subPm = normalizePaymentMethodJoin(
            (activeSubscription as Subscription | null)?.payment_method
          );
          /** Card payers get “Automated payment” step (code `card`; legacy `recurring`). */
          const showAutomatedPaymentStep = subPm?.code === 'card' || subPm?.code === 'recurring';
          const automatedPaymentDone = showAutomatedPaymentStep && paymentSaved && closedForThisWeek;
          const deliveryDone = thisWeekDeliveryStatus === 'delivered';
          const systemLockDone = closedForThisWeek;

          /** Always resolve this market week's window (even after close — status banner clears windowParts). */
          const timelineParts: ScheduleWindowParts | null = (() => {
            if (scheduleDisplay?.windowParts) return scheduleDisplay.windowParts;
            const ctx = getScheduleContext();
            const schedule = ctx?.schedule ?? null;
            try {
              if (ctx?.marketWeekStart && ctx?.marketWeekEnd) {
                const mw = getCustomizationWindowInMarketWeek(
                  ctx.marketWeekStart,
                  ctx.marketWeekEnd,
                  schedule
                );
                return getScheduleWindowPartsFromInstants(mw.windowStart, mw.windowEnd);
              }
              const { windowStart, windowEnd } = getCustomizationWindowBoundsForLocalWeek(
                new Date(),
                schedule
              );
              return getScheduleWindowPartsFromInstants(windowStart, windowEnd);
            } catch {
              return null;
            }
          })();

          const shortDate = (dateStr: string) => dateStr.replace(/,\s*\d{4}$/, '');

          const customizeCaption = timelineParts
            ? `${timelineParts.open.weekday.slice(0, 3)} ${shortDate(timelineParts.open.dateStr)} ${timelineParts.open.timeStr} – ${timelineParts.close.weekday.slice(0, 3)} ${shortDate(timelineParts.close.dateStr)} ${timelineParts.close.timeStr}`
            : scheduleDisplay?.openLabel && scheduleDisplay?.closeLabel
              ? `${scheduleDisplay.openLabel} – ${scheduleDisplay.closeLabel}`
              : 'Customize window';

          const autoSaveCaption = timelineParts
            ? `${timelineParts.close.weekday.slice(0, 3)}, ${shortDate(timelineParts.close.dateStr)} · ${timelineParts.close.timeStr}`
            : scheduleDisplay?.closeLabel || 'When window ends';

          const deliveryDateRaw =
            currentDelivery?.scheduled_date || user.subscription.nextDelivery || null;
          const deliveryCaption = deliveryDateRaw
            ? new Date(deliveryDateRaw).toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })
            : 'Sunday';

          type Step = {
            key: string;
            label: string;
            done: boolean;
            optional?: boolean;
            caption?: string;
            sublabel?: string;
            tone?: 'green' | 'amber';
          };

          let steps: Step[];
          if (isOnHold) {
            // Replace customise / auto save / delivery with a single hold step
            steps = [
              { key: 'select', label: 'Select bucket', done: true },
              isPaused
                ? {
                    key: 'paused',
                    label: 'Paused',
                    done: false,
                    caption: 'On hold',
                    sublabel: 'Resume anytime',
                    tone: 'amber',
                  }
                : {
                    key: 'skipped',
                    label: 'Skipped',
                    done: false,
                    caption: 'This week',
                    sublabel: 'No delivery',
                    tone: 'amber',
                  },
            ];
          } else if (isEstablishedSubscriber) {
            steps = showAutomatedPaymentStep
              ? [
                  { key: 'select', label: 'Select bucket', done: true },
                  {
                    key: 'customize',
                    label: 'Customisation (optional)',
                    done: hasCustomizeDone,
                    caption: customizeCaption,
                  },
                  {
                    key: 'system_lock',
                    label: 'Auto save',
                    done: systemLockDone,
                    caption: autoSaveCaption,
                    sublabel: 'we handle the rest',
                  },
                  {
                    key: 'automated_payment',
                    label: 'Automated payment',
                    done: automatedPaymentDone,
                    caption: closedForThisWeek ? 'Processed' : 'After save',
                  },
                  {
                    key: 'delivery',
                    label: 'Delivery',
                    done: deliveryDone,
                    caption: deliveryCaption,
                  },
                ]
              : [
                  { key: 'select', label: 'Select bucket', done: true },
                  {
                    key: 'customize',
                    label: 'Customisation (optional)',
                    done: hasCustomizeDone,
                    caption: customizeCaption,
                  },
                  {
                    key: 'system_lock',
                    label: 'Auto save',
                    done: systemLockDone,
                    caption: autoSaveCaption,
                    sublabel: 'we handle the rest',
                  },
                  {
                    key: 'delivery',
                    label: 'Delivery',
                    done: deliveryDone,
                    caption: deliveryCaption,
                  },
                ];
          } else {
            steps = [
              { key: 'select', label: 'Select bucket', done: true },
              {
                key: 'customize',
                label: 'Customisation (optional)',
                done: hasCustomizeDone,
                caption: customizeCaption,
              },
              {
                key: 'review',
                label: 'Review and accept',
                done: hasAcceptedReview,
              },
              {
                key: 'payment',
                label: 'Set up payment',
                done: false,
              },
              {
                key: 'delivery',
                label: 'Delivery',
                done: deliveryDone,
                caption: deliveryCaption,
              },
            ];
          }

          const currentIndex = (() => {
            if (isOnHold) return steps.findIndex((s) => s.key === 'paused' || s.key === 'skipped');
            for (let i = 0; i < steps.length; i++) {
              const s = steps[i];
              if (s.done) continue;
              if (s.key === 'customize' && systemLockDone) continue;
              return i;
            }
            return steps.length - 1;
          })();

          const stepPassed = (s: (typeof steps)[number]) =>
            s.done || (s.key === 'customize' && systemLockDone);

          return (
            <div
              className="mb-8 bg-white rounded-2xl shadow border border-gray-200 p-4 sm:p-6"
              data-schedule-tick={`${timeRemaining.days}-${timeRemaining.hours}-${timeRemaining.minutes}-${timeRemaining.isExpired ? '1' : '0'}`}
            >
              <div className="flex items-start w-full">
                {steps.map((step, i) => {
                  const isCurrent = i === currentIndex;
                  const isAmber = step.tone === 'amber';
                  return (
                  <React.Fragment key={step.key}>
                    <div className="flex flex-col items-center shrink-0 min-w-0 max-w-[5.5rem] sm:max-w-[6.5rem]">
                      <div
                        className={`min-h-[2.25rem] sm:min-h-[2.5rem] px-0.5 flex items-end justify-center text-center text-[9px] sm:text-[10px] leading-tight font-medium tabular-nums ${
                          isAmber
                            ? 'text-amber-800'
                            : step.done || isCurrent
                              ? 'text-green-800'
                              : 'text-gray-400'
                        }`}
                        title={step.caption}
                      >
                        {step.caption ? (
                          <span className="line-clamp-3">{step.caption}</span>
                        ) : (
                          <span className="invisible" aria-hidden>
                            —
                          </span>
                        )}
                      </div>
                      <div
                        className={`mt-1.5 flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-semibold ${
                          step.done
                            ? 'border-green-600 bg-green-600 text-white'
                            : isAmber && isCurrent
                              ? 'border-amber-500 bg-amber-50 text-amber-700'
                              : isCurrent
                                ? 'border-green-600 bg-green-50 text-green-700'
                                : 'border-gray-300 bg-white text-gray-400'
                        }`}
                      >
                        {step.done ? (
                          <Check className="h-5 w-5" aria-hidden />
                        ) : step.key === 'paused' ? (
                          <Pause className="h-4 w-4" aria-hidden />
                        ) : step.key === 'skipped' ? (
                          <SkipForward className="h-4 w-4" aria-hidden />
                        ) : step.key === 'system_lock' ? (
                          <Lock className="h-4 w-4" aria-hidden />
                        ) : step.key === 'automated_payment' ? (
                          <CreditCard className="h-4 w-4" aria-hidden />
                        ) : step.key === 'delivery' ? (
                          <Truck className="h-4 w-4" aria-hidden />
                        ) : (
                          i + 1
                        )}
                      </div>
                      <span
                        className={`mt-1.5 text-[10px] sm:text-xs font-medium text-center leading-tight ${
                          isAmber
                            ? 'text-amber-900'
                            : step.done || isCurrent
                              ? 'text-gray-900'
                              : 'text-gray-500'
                        }`}
                      >
                        {step.label}
                      </span>
                      {step.sublabel && (
                        <span
                          className={`mt-0.5 text-[9px] sm:text-[10px] text-center leading-tight max-w-[6rem] ${
                            isAmber
                              ? 'text-amber-700'
                              : step.done || isCurrent
                                ? 'text-sky-700'
                                : 'text-gray-400'
                          }`}
                        >
                          {step.sublabel}
                        </span>
                      )}
                    </div>
                    {i < steps.length - 1 && (
                      <div
                        className={`flex-1 h-0.5 mx-1 sm:mx-2 rounded min-w-[6px] mt-[2.65rem] sm:mt-[2.85rem] ${
                          stepPassed(step) ? 'bg-green-600' : isOnHold ? 'bg-amber-300' : 'bg-gray-200'
                        }`}
                      />
                    )}
                  </React.Fragment>
                  );
                })}
              </div>
              {isOnHold ? (
                <p className="mt-4 text-center text-xs text-amber-800/90 max-w-xl mx-auto leading-relaxed">
                  {isPaused
                    ? 'Your bucket is paused — customisation, auto save, and delivery are on hold until you resume.'
                    : 'This week is skipped — customisation, auto save, and delivery won’t run until you resume this week.'}
                </p>
              ) : (
                !closedForThisWeek &&
                isEstablishedSubscriber && (
                  <p className="mt-4 text-center text-xs text-gray-500 max-w-xl mx-auto leading-relaxed">
                    If you’re happy with this week’s picks, you don’t need to do anything. At the auto
                    save time we <span className="font-medium text-gray-700">save your list</span> and
                    handle the rest
                    {showAutomatedPaymentStep ? ' (card payment runs after save)' : ''}.
                  </p>
                )
              )}
            </div>
          );
        })()}

        <div className="space-y-8">
                {(!user.subscription || user.subscription.status === 'cancelled') ? (
                  /* No Subscription — start multi-step wizard */
                  <div className="bg-gradient-to-br from-green-50 via-white to-emerald-50 rounded-3xl shadow-lg border border-green-100 overflow-hidden">
                    <div className="p-8 md:p-12 text-center">
                      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-green-600 text-white mb-6 shadow-lg shadow-green-600/25">
                        <Leaf className="h-8 w-8" />
                      </div>
                      <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3 tracking-tight">
                        Start your Leafy Bucket
                      </h2>
                      <p className="text-gray-600 max-w-xl mx-auto mb-8">
                        Pick a bucket size, choose Monthly (4) or Weekly (12), then how you’ll pay.
                        When a cycle ends your subscription completes — renew anytime at current prices.
                      </p>
                      <button
                        type="button"
                        onClick={() => openSignupWizard(null)}
                        className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl font-semibold bg-green-600 text-white hover:bg-green-700 shadow-md shadow-green-600/20 transition-colors"
                      >
                        <Package className="h-5 w-5" />
                        Choose bucket & plan
                      </button>
                    </div>

                    {loadingPlans ? (
                      <div className="text-center py-8 border-t border-green-100 bg-white/60">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600 mx-auto mb-3" />
                        <p className="text-gray-500 text-sm">Loading buckets…</p>
                      </div>
                    ) : (
                      <div className="grid md:grid-cols-3 gap-4 p-6 md:p-8 pt-0 bg-white/40">
                        {plans.map((plan) => (
                          <button
                            key={plan.id}
                            type="button"
                            onClick={() => openSignupWizard(plan.id)}
                            className={`text-left border-2 rounded-2xl p-5 transition-all hover:shadow-md hover:-translate-y-0.5 ${
                              plan.id === 'medium'
                                ? 'border-green-500 bg-white'
                                : 'border-gray-200 bg-white hover:border-green-300'
                            }`}
                          >
                            {plan.id === 'medium' && (
                              <span className="inline-block mb-2 text-[10px] font-bold uppercase tracking-wide bg-green-600 text-white px-2 py-0.5 rounded-full">
                                Popular
                              </span>
                            )}
                            <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
                            <p className="text-sm text-gray-600 mt-1 line-clamp-2">{plan.description}</p>
                            <div className="mt-3 text-xl font-bold text-green-700">
                              LKR {Math.round(getWeeklyUnitPrice(plan.price, packWeeks)).toLocaleString()}
                              <span className="text-xs font-normal text-gray-500"> /week</span>
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5">
                              Pack list {formatLkr(plan.price)} · pick billing next
                            </div>
                            <div className="mt-3 text-sm font-medium text-green-700">Continue →</div>
                          </button>
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
                      {(() => {
                        const isPaused = user.subscription.status === 'paused';
                        const isWeekSkipped = user.subscription.currentDeliveryStatus === 'skipped';
                        if (isPaused || isWeekSkipped) {
                          return (
                            <div className="bg-white rounded-3xl shadow-lg p-8 flex flex-col items-center justify-center text-center min-h-[280px]">
                              <Package className="h-12 w-12 text-gray-400 mb-4" />
                              <h3 className="text-xl font-bold text-gray-900 mb-2">
                                {isPaused ? 'Bucket paused' : 'Skipped this week'}
                              </h3>
                              <p className="text-sm text-gray-600 max-w-md">
                                {isPaused
                                  ? 'Customization is hidden while your bucket is paused. Resume your bucket to view and edit this week’s vegetables.'
                                  : 'Customization is hidden while this week is skipped. Resume this week to view and edit your vegetables.'}
                              </p>
                            </div>
                          );
                        }
                        return (
                      <div className="bg-white rounded-3xl shadow-lg p-8">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-xl font-bold text-gray-900">Your vegetables for this week</h3>
                          {isCustomizationAllowed && (
                            <Link
                              to="/customize"
                              className="text-green-600 hover:text-green-700 font-medium text-sm flex items-center space-x-1 shrink-0"
                            >
                              <span>Customize</span>
                              <Settings className="h-4 w-4" />
                            </Link>
                          )}
                        </div>
                        {(() => {
                          const weekCust = normalizeDeliveryCustomizations(
                            currentDelivery?.customizations ?? user.subscription?.customizations
                          );
                          const confirmed = hasConfirmedThisWeekPicks(weekCust);

                          return (
                            <>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                                {vegetables.length === 0 ? (
                                  <p className="text-sm text-gray-600 col-span-full">
                                    No vegetables listed for this week yet. Check back once this week’s list is
                                    published.
                                  </p>
                                ) : (
                                  vegetables.map((veg) => (
                                    <div
                                      key={veg.id}
                                      className="flex items-center justify-between p-4 bg-green-50 rounded-xl"
                                    >
                                      <div>
                                        <div className="font-medium text-gray-900">{veg.name}</div>
                                        <div className="text-sm text-gray-600">{veg.weight}</div>
                                      </div>
                                      <Leaf className="h-5 w-5 text-green-600" />
                                    </div>
                                  ))
                                )}
                              </div>

                              {!confirmed &&
                                isCustomizationAllowed &&
                                vegetables.length > 0 &&
                                (activeSubscription?.payment_method_id || setupComplete) && (
                                  <div className="mt-6 flex flex-col sm:flex-row gap-3">
                                    <button
                                      type="button"
                                      disabled={acceptingAdminPicks}
                                      onClick={handleAcceptAdminPicks}
                                      className="flex-1 flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                                    >
                                      <Check className="h-5 w-5" />
                                      <span>
                                        {acceptingAdminPicks
                                          ? 'Saving…'
                                          : 'Looks good — keep these'}
                                      </span>
                                    </button>
                                    <Link
                                      to="/customize"
                                      className="flex-1 flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-semibold border-2 border-green-600 text-green-700 hover:bg-green-50 transition-colors"
                                    >
                                      <Settings className="h-5 w-5" />
                                      <span>Customize instead</span>
                                    </Link>
                                  </div>
                                )}

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
                            </>
                          );
                        })()}
                      </div>
                        );
                      })()}

                      {/* Your Subscription - right sidebar (cart-style) */}
                      <div className="lg:sticky lg:top-28 self-start bg-white rounded-3xl shadow-lg border border-gray-200 p-6">
                        {(() => {
                          const isPaused = user.subscription.status === 'paused';
                          const isWeekSkipped = user.subscription.currentDeliveryStatus === 'skipped';
                          return (
                        <>
                        <div className="flex items-center justify-between mb-4">
                          <h2 className="text-lg font-bold text-gray-900">Your Subscription</h2>
                          <div className={`px-4 py-2 rounded-full text-sm font-semibold ${
                            isPaused
                              ? 'bg-yellow-100 text-yellow-800'
                              : isWeekSkipped
                                ? 'bg-slate-100 text-slate-800'
                                : 'bg-green-100 text-green-800'
                            }`}>
                            {isPaused ? 'Paused' : isWeekSkipped ? 'Skipped this week' : 'Active'}
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 text-sm font-semibold text-gray-900 truncate">
                              {currentPlan?.name}
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                if (editsLocked) return;
                                setIsChangingPlan(!isChangingPlan);
                              }}
                              disabled={editsLocked}
                              className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-md border transition-colors ${
                                editsLocked
                                  ? 'border-gray-200 text-gray-400 bg-gray-50 cursor-not-allowed'
                                  : 'border-green-200 text-green-700 bg-green-50/80 hover:bg-green-100 hover:border-green-300'
                              }`}
                            >
                              {isChangingPlan ? 'Cancel' : 'Change'}
                            </button>
                          </div>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-gray-600">
                                {billingPeriodLabel(
                                  (activeSubscription as Subscription | null)?.subscription_plan?.code
                                )}
                                :
                              </span>
                              <span className="font-semibold">
                                {displayPeriodCharge != null
                                  ? formatLkr(displayPeriodCharge)
                                  : formatLkr(
                                      getPlanBillingListPrice({
                                        packPrice: Number(currentPlan?.price) || 0,
                                        planCode: (activeSubscription as Subscription | null)
                                          ?.subscription_plan?.code,
                                        packWeeks,
                                      })
                                    )}
                              </span>
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
                          {isWeekSkipped ? (
                            <button
                              type="button"
                              onClick={initiateUnskipThisWeek}
                              className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 rounded-xl text-sm font-semibold transition-colors bg-green-100 text-green-800 hover:bg-green-200"
                            >
                              <Play className="h-4 w-4" />
                              <span>Resume this week</span>
                            </button>
                          ) : !isPaused ? (
                            <button
                              type="button"
                              onClick={initiateSkipThisWeek}
                              className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 rounded-xl text-sm font-semibold transition-colors bg-slate-50 text-slate-800 hover:bg-slate-100 border border-slate-200"
                            >
                              <SkipForward className="h-4 w-4" />
                              <span>Skip for this week</span>
                            </button>
                          ) : null}
                          {!isWeekSkipped && (
                            <button
                              onClick={toggleSubscriptionStatus}
                              className={`w-full flex items-center justify-center space-x-2 py-2.5 px-4 rounded-xl text-sm font-semibold transition-colors ${
                                !isPaused
                                  ? 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
                                  : 'bg-green-100 text-green-800 hover:bg-green-200'
                              }`}
                            >
                              {!isPaused ? (
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
                          )}
                          <button
                            type="button"
                            className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 rounded-xl text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 border border-gray-300 transition-colors"
                          >
                            <span>Cancel bucket</span>
                          </button>
                          <p className="text-[11px] text-gray-500 leading-tight">
                            {isWeekSkipped
                              ? 'This week is skipped. Resume to customize or change plan. Pause is unavailable until you resume.'
                              : isPaused
                                ? 'Paused: plan changes and customization are locked until you resume.'
                                : 'Skip this week only, or pause to hold deliveries. Plan and preferences are saved.'}
                          </p>
                        </div>
                        </>
                          );
                        })()}
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
                                      <div className="font-semibold text-gray-900">{formatPaymentMethodLabel(pm)}</div>
                                      {pm.description && (
                                        <div className="text-sm text-gray-600 mt-0.5">{pm.description}</div>
                                      )}
                                      {(Number(pm.discount_pct) > 0 || Number(pm.discount_fixed) > 0) && (
                                        <div className="text-xs text-green-700 mt-1">
                                          {Number(pm.discount_pct) > 0 ? `${pm.discount_pct}% off` : ''}
                                          {Number(pm.discount_pct) > 0 && Number(pm.discount_fixed) > 0 ? ' + ' : ''}
                                          {Number(pm.discount_fixed) > 0 ? formatLkr(Number(pm.discount_fixed)) : ''}
                                        </div>
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
                            {currentDelivery
                              ? (() => {
                                  const sub = activeSubscription as Subscription | null;
                                  const entitled = getEffectiveEntitledDeliveries({
                                    payment_method: normalizePaymentMethodJoin(sub?.payment_method),
                                    subscription_plan: sub?.subscription_plan ?? null,
                                  });
                                  const used = Number(sub?.deliveries_used) || 0;
                                  const rawIdx =
                                    currentDelivery.delivery_index != null
                                      ? Number(currentDelivery.delivery_index)
                                      : used + 1;
                                  const idx = Math.min(Math.max(rawIdx || 1, 1), entitled);
                                  return `Delivery #${idx} of ${entitled}`;
                                })()
                              : 'Delivery Date'}
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
                                <div className="text-sm text-gray-600">
                                  {billingPeriodLabel(
                                    (activeSubscription as Subscription | null)?.subscription_plan?.code
                                  )}{' '}
                                  billing
                                </div>
                              </div>
                              <div className="text-2xl font-bold text-green-600">
                                {displayPeriodCharge != null
                                  ? formatLkr(displayPeriodCharge)
                                  : formatLkr(
                                      getPlanBillingListPrice({
                                        packPrice: Number(currentPlan?.price) || 0,
                                        planCode: (activeSubscription as Subscription | null)
                                          ?.subscription_plan?.code,
                                        packWeeks,
                                      })
                                    )}
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

                          {(activeSubscription as Subscription | null)?.subscription_plan && (
                            <div className="bg-gray-50 rounded-xl p-4 mb-4 text-sm">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <div className="font-medium text-gray-900">
                                  {(activeSubscription as Subscription).subscription_plan?.name} plan
                                </div>
                                <button
                                  type="button"
                                  disabled={editsLocked}
                                  onClick={() => {
                                    if (editsLocked) return;
                                    const currentId =
                                      (activeSubscription as Subscription).subscription_plan_id ??
                                      (activeSubscription as Subscription).subscription_plan?.id ??
                                      null;
                                    setChangeBillingPlanId(currentId);
                                    setShowBillingPlanChange(true);
                                  }}
                                  className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-md border transition-colors ${
                                    editsLocked
                                      ? 'border-gray-200 text-gray-400 bg-gray-50 cursor-not-allowed'
                                      : 'border-green-200 text-green-700 bg-green-50/80 hover:bg-green-100'
                                  }`}
                                >
                                  Change
                                </button>
                              </div>
                              <div className="text-gray-600">
                                {(activeSubscription as Subscription).subscription_plan?.entitled_deliveries} deliveries / cycle
                              </div>
                              {(displayPeriodCharge != null ||
                                (activeSubscription as Subscription).charge_amount != null) && (
                                <div className="mt-2 text-gray-900 font-semibold">
                                  {billingPeriodLabel(
                                    (activeSubscription as Subscription).subscription_plan?.code
                                  )}{' '}
                                  charge:{' '}
                                  {formatLkr(
                                    displayPeriodCharge ??
                                      Number((activeSubscription as Subscription).charge_amount)
                                  )}
                                  {Number((activeSubscription as Subscription).discount_total) > 0 && (
                                    <span className="block text-xs font-normal text-green-700 mt-0.5">
                                      Includes{' '}
                                      {formatLkr(
                                        Number((activeSubscription as Subscription).discount_total)
                                      )}{' '}
                                      discount
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

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

      {/* Multi-step signup: Bucket → Plan → Payment (nothing auto-assigned) */}
      {showSignupWizard && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => !signupSubmitting && setShowSignupWizard(false)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl max-w-xl w-full max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 rounded-t-3xl z-10">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900">Build your subscription</h3>
                <button
                  type="button"
                  disabled={signupSubmitting}
                  onClick={() => setShowSignupWizard(false)}
                  className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                {[
                  { n: 1 as const, label: 'Bucket' },
                  { n: 2 as const, label: 'Plan' },
                  { n: 3 as const, label: 'Pay' },
                ].map((s, i) => (
                  <React.Fragment key={s.n}>
                    {i > 0 && (
                      <div
                        className={`flex-1 h-0.5 rounded ${signupStep > s.n - 1 ? 'bg-green-500' : 'bg-gray-200'}`}
                      />
                    )}
                    <div className="flex flex-col items-center gap-1 min-w-[3.5rem]">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                          signupStep === s.n
                            ? 'bg-green-600 text-white'
                            : signupStep > s.n
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-400'
                        }`}
                      >
                        {signupStep > s.n ? <Check className="h-4 w-4" /> : s.n}
                      </div>
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                        {s.label}
                      </span>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </div>

            <div className="p-5 space-y-4">
              {signupStep === 1 && (
                <>
                  <p className="text-sm text-gray-600">Choose your bucket size. You’ll pick Weekly / Monthly / One-time next.</p>
                  <div className="space-y-2">
                    {plans.map((plan) => (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => {
                          setSignupBucketSizeId(plan.id);
                          setSelectedBillingPlanId(null);
                          setSelectedSignupPaymentId(null);
                          setSignupStep(2);
                        }}
                        className={`w-full text-left p-4 rounded-2xl border-2 transition-colors ${
                          signupBucketSizeId === plan.id
                            ? 'border-green-600 bg-green-50'
                            : 'border-gray-200 hover:border-green-300'
                        }`}
                      >
                        <div className="flex justify-between items-start gap-2">
                          <div>
                            <div className="font-bold text-gray-900">{plan.name}</div>
                            <div className="text-sm text-gray-600 mt-0.5">{plan.description}</div>
                          </div>
                          <div className="font-semibold text-green-700 shrink-0 text-right">
                            <div>
                              LKR {Math.round(getWeeklyUnitPrice(plan.price, packWeeks)).toLocaleString()}
                              <span className="text-xs font-normal text-gray-500"> /week</span>
                            </div>
                            <div className="text-[11px] font-normal text-gray-500">
                              pack {formatLkr(plan.price)}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {signupStep === 2 && (
                <>
                  <div className="rounded-xl bg-green-50 border border-green-100 px-3 py-2 text-sm text-green-900">
                    Bucket: <strong>{signupBucketType?.name ?? plans.find((p) => p.id === signupBucketSizeId)?.name}</strong>
                    <button
                      type="button"
                      className="ml-2 text-green-700 underline text-xs"
                      onClick={() => setSignupStep(1)}
                    >
                      Change
                    </button>
                  </div>
                  <p className="text-sm text-gray-600">
                    Select a billing plan. <strong>Nothing is selected by default</strong> — tap one to continue.
                  </p>
                  <div className="space-y-2">
                    {billingPlans.map((bp) => {
                      const packPrice = Number(signupBucketType?.monthly_price) || 0;
                      const listPrice = getPlanBillingListPrice({
                        packPrice,
                        planCode: bp.code,
                        packWeeks,
                      });
                      const preview = computeSubscriptionCharge({
                        listPrice,
                        handlingFee: Number(signupBucketType?.handling_fee) || 0,
                        plan: bp,
                        payment: null,
                      });
                      return (
                      <button
                        key={bp.id}
                        type="button"
                        onClick={() => {
                          setSelectedBillingPlanId(bp.id);
                          setSelectedSignupPaymentId(null);
                          setSignupStep(3);
                        }}
                        className={`w-full text-left p-4 rounded-2xl border-2 transition-colors ${
                          selectedBillingPlanId === bp.id
                            ? 'border-green-600 bg-green-50'
                            : 'border-gray-200 hover:border-green-300'
                        }`}
                      >
                        <div className="flex justify-between items-start gap-2">
                          <div>
                            <div className="font-bold text-gray-900">{bp.name}</div>
                            <div className="text-sm text-gray-600 mt-0.5">
                              {bp.entitled_deliveries} deliveries / cycle
                              {bp.description ? ` — ${bp.description}` : ''}
                            </div>
                            {(Number(bp.prepaid_discount_pct) > 0 || Number(bp.prepaid_discount_fixed) > 0) && (
                              <div className="text-xs text-green-700 mt-1 font-medium">
                                Prepaid discount:{' '}
                                {Number(bp.prepaid_discount_pct) > 0 ? `${bp.prepaid_discount_pct}%` : ''}
                                {Number(bp.prepaid_discount_pct) > 0 && Number(bp.prepaid_discount_fixed) > 0
                                  ? ' + '
                                  : ''}
                                {Number(bp.prepaid_discount_fixed) > 0
                                  ? formatLkr(Number(bp.prepaid_discount_fixed))
                                  : ''}
                              </div>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-semibold text-green-700">
                              {formatLkr(preview.charge_amount)}
                            </div>
                            <div className="text-[11px] text-gray-500">
                              {bp.code === 'monthly'
                                ? '/pack'
                                : bp.code === 'one_time'
                                  ? '/delivery'
                                  : '/week'}
                            </div>
                          </div>
                        </div>
                      </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSignupStep(1)}
                    className="text-sm text-gray-600 hover:text-gray-900"
                  >
                    ← Back to bucket
                  </button>
                </>
              )}

              {signupStep === 3 && (
                <>
                  <div className="rounded-xl bg-green-50 border border-green-100 px-3 py-2 text-sm text-green-900 space-y-1">
                    <div>
                      Bucket: <strong>{signupBucketType?.name}</strong>{' '}
                      <button type="button" className="underline text-xs" onClick={() => setSignupStep(1)}>
                        Change
                      </button>
                    </div>
                    <div>
                      Plan: <strong>{selectedBillingPlan?.name}</strong>{' '}
                      <button
                        type="button"
                        className="underline text-xs"
                        onClick={() => {
                          setSelectedSignupPaymentId(null);
                          setSignupStep(2);
                        }}
                      >
                        Change
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600">Choose Cash or Card for this plan (tap one — not pre-selected).</p>
                  {loadingSignupPayments ? (
                    <div className="text-sm text-gray-500 py-4">Loading payment options…</div>
                  ) : signupPaymentMethods.length === 0 ? (
                    <div className="text-sm text-amber-700 py-2">
                      No payment methods enabled for this plan. Ask admin to enable Cash or Card.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {signupPaymentMethods.map((pm) => (
                        <button
                          key={pm.id}
                          type="button"
                          onClick={() => setSelectedSignupPaymentId(pm.id)}
                          className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 text-left ${
                            selectedSignupPaymentId === pm.id
                              ? 'border-green-600 bg-green-50'
                              : 'border-gray-200 hover:border-green-300'
                          }`}
                        >
                          <CreditCard className="h-5 w-5 text-green-600 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-gray-900">{formatPaymentMethodLabel(pm)}</div>
                            {pm.description && (
                              <div className="text-sm text-gray-600">{pm.description}</div>
                            )}
                          </div>
                          {selectedSignupPaymentId === pm.id && (
                            <Check className="h-5 w-5 text-green-600" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {signupCharge && selectedSignupPaymentId && (
                    <div className="rounded-xl bg-gray-50 p-4 text-sm space-y-1">
                      <div className="flex justify-between text-gray-600">
                        <span>List price</span>
                        <span>{formatLkr(signupCharge.list_price)}</span>
                      </div>
                      {signupCharge.discount_total > 0 && (
                        <div className="flex justify-between text-green-700">
                          <span>Discounts</span>
                          <span>−{formatLkr(signupCharge.discount_total)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-semibold text-gray-900 pt-2 border-t border-gray-200">
                        <span>
                          Pay{' '}
                          {selectedBillingPlan?.code === 'weekly'
                            ? 'this week'
                            : selectedBillingPlan?.code === 'one_time'
                              ? 'this delivery'
                              : 'this pack'}
                        </span>
                        <span>{formatLkr(signupCharge.charge_amount)}</span>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setSignupStep(2)}
                      className="flex-1 py-3 rounded-xl font-medium border border-gray-300 text-gray-700 hover:bg-gray-50"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      disabled={
                        signupSubmitting ||
                        !selectedBillingPlanId ||
                        !selectedSignupPaymentId ||
                        !signupBucketType
                      }
                      onClick={handleSignupConfirm}
                      className="flex-[2] py-3 rounded-xl font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      {signupSubmitting ? 'Starting…' : 'Confirm & start'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Change billing plan (existing subscriber) */}
      {showBillingPlanChange && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => !changeBillingSubmitting && setShowBillingPlanChange(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-bold text-gray-900">Change billing plan</h3>
              <button
                type="button"
                onClick={() => setShowBillingPlanChange(false)}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-600">
                Switch between Weekly, Monthly, or One-time. Payment options update for the plan you pick.
              </p>
              <div className="space-y-2">
                {billingPlans.map((bp) => {
                  const bt = (activeSubscription as Subscription | null)?.bucket_type;
                  const packPrice = Number(bt?.monthly_price) || 0;
                  const listPrice = getPlanBillingListPrice({
                    packPrice,
                    planCode: bp.code,
                    packWeeks,
                  });
                  const preview = computeSubscriptionCharge({
                    listPrice,
                    handlingFee: Number(bt?.handling_fee) || 0,
                    plan: bp,
                    payment: changeBillingPaymentId
                      ? changeBillingPayments.find((p) => p.id === changeBillingPaymentId) ?? null
                      : null,
                  });
                  return (
                  <button
                    key={bp.id}
                    type="button"
                    onClick={() => setChangeBillingPlanId(bp.id)}
                    className={`w-full text-left p-3 rounded-xl border-2 ${
                      changeBillingPlanId === bp.id
                        ? 'border-green-600 bg-green-50'
                        : 'border-gray-200 hover:border-green-300'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <div className="font-semibold text-gray-900">{bp.name}</div>
                        <div className="text-xs text-gray-600">{bp.entitled_deliveries} deliveries / cycle</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-semibold text-green-700">
                          {formatLkr(preview.charge_amount)}
                        </div>
                        <div className="text-[11px] text-gray-500">
                          {bp.code === 'monthly'
                            ? '/pack'
                            : bp.code === 'one_time'
                              ? '/delivery'
                              : '/week'}
                        </div>
                      </div>
                    </div>
                  </button>
                  );
                })}
              </div>
              {changeBillingPlanId && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-gray-900">Payment for this plan</h4>
                  {changeBillingPayments.length === 0 ? (
                    <p className="text-sm text-amber-700">No payment methods enabled for this plan.</p>
                  ) : (
                    changeBillingPayments.map((pm) => (
                      <button
                        key={pm.id}
                        type="button"
                        onClick={() => setChangeBillingPaymentId(pm.id)}
                        className={`w-full text-left p-3 rounded-xl border-2 ${
                          changeBillingPaymentId === pm.id
                            ? 'border-green-600 bg-green-50'
                            : 'border-gray-200'
                        }`}
                      >
                        {formatPaymentMethodLabel(pm)}
                      </button>
                    ))
                  )}
                </div>
              )}
              {changeBillingCharge && changeBillingPaymentId && (
                <div className="text-sm flex justify-between font-semibold">
                  <span>New cycle charge</span>
                  <span>{formatLkr(changeBillingCharge.charge_amount)}</span>
                </div>
              )}
              <button
                type="button"
                disabled={changeBillingSubmitting || !changeBillingPlanId || !changeBillingPaymentId}
                onClick={handleBillingPlanChangeConfirm}
                className="w-full py-3 rounded-xl font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
              >
                {changeBillingSubmitting ? 'Saving…' : 'Save billing plan'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={isConfirmModalOpen}
        onClose={() => {
          setIsConfirmModalOpen(false);
          setPendingAction(null);
        }}
        onConfirm={handleConfirmStatusChange}
        title={
          pendingAction === 'unskip_week' ? 'Resume delivery this week?' :
          pendingAction === 'skip_week' ? 'Skip delivery this week?' :
          pendingAction === 'pause' ? 'Pause deliveries for a while?' :
            pendingAction === 'resume' ? 'Resume deliveries?' :
              'Confirm plan'
        }
        message={
          pendingAction === 'unskip_week'
            ? 'This week’s delivery will be set back to open. You can customize and receive your box as usual.'
            : pendingAction === 'skip_week'
            ? 'This week’s delivery will be marked as skipped. Pause, plan changes, and customization stay locked until you resume this week.'
            : pendingAction === 'pause'
            ? 'Deliveries will be put on hold. Plan changes and customization stay locked until you resume.'
            : pendingAction === 'resume'
              ? 'Your vegetable deliveries will start again from the next scheduled date. Your plan is unchanged.'
              : `You're choosing the ${plans.find(p => p.id === pendingNewPlan)?.name ?? 'selected'} plan. Your billing and vegetable allocation will be based on this plan.`
        }
        confirmText={
          pendingAction === 'unskip_week' ? 'Yes, resume this week' :
          pendingAction === 'skip_week' ? 'Yes, skip this week' :
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