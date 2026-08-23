import React from 'react';
import { Star, Package, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  computeSubscriptionCharge,
  getPlanBillingListPrice,
  DEFAULT_PACK_WEEKS,
  type BillingPlanCode,
  type SubscriptionPlanRow,
} from '../utils/paymentMethodDisplay';

type BucketCard = {
  planId: string;
  bucketTypeId: string;
  name: string;
  description: string;
  listPackPrice: number;
  vegetableRange: string;
  vegLabel: string;
  popular: boolean;
};

function formatVegLabel(range: string | null | undefined): string {
  const r = String(range || '').trim();
  if (!r) return 'Vegetables';
  if (/veg/i.test(r)) return r;
  return `${r} vegetables`;
}

function billedCaption(code: string): string {
  switch (code) {
    case 'monthly':
      return 'billed monthly';
    case 'weekly':
      return 'billed weekly';
    case 'one_time':
      return 'one delivery';
    default:
      return `billed ${code.replace(/_/g, ' ')}`;
  }
}

function buildFeatures(
  subPlan: SubscriptionPlanRow,
  vegLabel: string
): string[] {
  const n = Math.max(Number(subPlan.entitled_deliveries) || 1, 1);
  const lines: string[] = [];

  if (subPlan.code === 'one_time' || n === 1) {
    lines.push('1 delivery');
    lines.push(vegLabel);
  } else {
    lines.push(`${n} deliveries per cycle (~${n} weeks)`);
    lines.push(`${vegLabel} weekly`);
  }

  if (subPlan.description?.trim()) {
    lines.push(subPlan.description.trim());
  }

  lines.push(n === 1 ? 'Free delivery' : 'Free weekly delivery');
  return lines;
}

const Pricing = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [buckets, setBuckets] = React.useState<BucketCard[]>([]);
  const [billingPlans, setBillingPlans] = React.useState<SubscriptionPlanRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [submittingPlanId, setSubmittingPlanId] = React.useState<string | null>(null);
  const [actionMessage, setActionMessage] = React.useState<{ type: 'success' | 'error'; text: string } | null>(null);
  /** Selected subscription_plans.code per bucket size id */
  const [billingByBucket, setBillingByBucket] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    const fetchPlans = async () => {
      try {
        const { default: SubscriptionService } = await import('../services/SubscriptionService');
        const svc = SubscriptionService.getInstance();
        const [bucketTypes, subPlans] = await Promise.all([
          svc.getBucketTypes(),
          svc.getSubscriptionPlans(),
        ]);

        setBillingPlans(subPlans);

        const cards: BucketCard[] = bucketTypes.map((bt) => {
          const planId =
            bt.name.toLowerCase() === 'mini'
              ? 'small'
              : bt.name.toLowerCase() === 'family'
                ? 'medium'
                : 'large';
          const range = bt.display_item_range || '';
          return {
            planId,
            bucketTypeId: bt.id,
            name:
              bt.name +
              (bt.name === 'Mini' ? ' Family' : bt.name === 'Family' ? '' : ' Family'),
            description: bt.description || '',
            listPackPrice: Number(bt.monthly_price) || 0,
            vegetableRange: range,
            vegLabel: formatVegLabel(range),
            popular: bt.name === 'Family',
          };
        });

        setBuckets(cards);

        const defaultCode =
          subPlans.find((p) => p.code === 'monthly')?.code ?? subPlans[0]?.code ?? 'monthly';
        const initial: Record<string, string> = {};
        cards.forEach((c) => {
          initial[c.planId] = defaultCode;
        });
        setBillingByBucket(initial);
      } catch (error) {
        console.error('Error loading plans:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPlans();
  }, []);

  const handleStartSubscription = async (bucket: BucketCard, billingCode: string) => {
    const billingPlan = billingCode as BillingPlanCode;
    if (!['weekly', 'monthly', 'one_time'].includes(billingPlan)) {
      setActionMessage({ type: 'error', text: 'Please select a valid billing plan.' });
      return;
    }

    try {
      sessionStorage.setItem(
        'leafy_signup_pref',
        JSON.stringify({ bucketSizeId: bucket.planId, billingPlan, bucketTypeId: bucket.bucketTypeId })
      );
    } catch {
      // ignore
    }

    if (!user) {
      navigate('/auth', {
        state: {
          from: { pathname: '/my-bucket' },
          bucketSizeId: bucket.planId,
          billingPlan,
        },
      });
      return;
    }

    setSubmittingPlanId(bucket.planId);
    setActionMessage(null);
    try {
      const { default: SubscriptionService } = await import('../services/SubscriptionService');
      const svc = SubscriptionService.getInstance();
      const active = await svc.getActiveSubscription(user.id);

      if (active?.subscription?.id) {
        // Existing subscriber: persist bucket + billing change only.
        await svc.updateSubscriptionPlan(active.subscription.id, bucket.bucketTypeId);
        await svc.updateSubscriptionBillingPlan(
          active.subscription.id,
          user.id,
          billingPlan,
          active.subscription.payment_method_id ?? null
        );
        try {
          sessionStorage.removeItem('leafy_signup_pref');
        } catch {
          // ignore
        }
        setActionMessage({
          type: 'success',
          text: 'Plan updated. Opening My Bucket…',
        });
        navigate('/my-bucket', { replace: true });
        window.location.reload();
        return;
      }

      // New customers: keep plan choice in session only. Subscription row is created
      // on My Bucket after delivery address + payment method are confirmed.
      setActionMessage({
        type: 'success',
        text: 'Plan selected. Opening My Bucket to finish setup…',
      });
      navigate('/my-bucket', {
        replace: true,
        state: {
          bucketSizeId: bucket.planId,
          billingPlan,
          bucketTypeId: bucket.bucketTypeId,
        },
      });
    } catch (e: unknown) {
      console.error('[Pricing] apply plan', e);
      const msg =
        e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string'
          ? (e as { message: string }).message
          : 'Could not save plan. Please try again.';
      setActionMessage({ type: 'error', text: msg });
    } finally {
      setSubmittingPlanId(null);
    }
  };

  if (loading) {
    return <div className="py-20 text-center">Loading plans...</div>;
  }

  const monthlyPlan = billingPlans.find((p) => p.code === 'monthly') ?? null;
  const packWeeks = Math.max(Number(monthlyPlan?.entitled_deliveries) || DEFAULT_PACK_WEEKS, 1);

  const introBits = billingPlans
    .map((p) => {
      const n = p.entitled_deliveries;
      if (p.code === 'monthly') return `${p.name} (${n} deliveries)`;
      if (p.code === 'weekly') return `${p.name} (${n}-week cycle)`;
      if (p.code === 'one_time') return `${p.name} (1 delivery)`;
      return `${p.name} (${n})`;
    })
    .join(', ');

  return (
    <section id="pricing" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center space-y-4 mb-16">
          <h2 className="text-4xl font-bold text-gray-900">Simple Fixed Pricing</h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Each bucket has a weekly rate from our catalog. Choose{' '}
            {introBits || 'a billing plan'} — plans and discounts come from the latest catalog.
          </p>
          {actionMessage && (
            <p
              className={`text-sm font-medium ${
                actionMessage.type === 'success' ? 'text-green-700' : 'text-red-600'
              }`}
            >
              {actionMessage.text}
            </p>
          )}
        </div>

        <div className="grid md:grid-cols-3 gap-8 mb-12">
          {buckets.map((bucket) => {
            const selectedCode = billingByBucket[bucket.planId] ?? billingPlans[0]?.code ?? 'monthly';
            const selectedPlan =
              billingPlans.find((p) => p.code === selectedCode) ?? billingPlans[0] ?? null;

            const weeklyUnit = bucket.listPackPrice / packWeeks;
            const listPrice = selectedPlan
              ? getPlanBillingListPrice({
                  packPrice: bucket.listPackPrice,
                  planCode: selectedPlan.code,
                  packWeeks,
                })
              : weeklyUnit;
            const charge = selectedPlan
              ? computeSubscriptionCharge({
                  listPrice,
                  plan: selectedPlan,
                  payment: null,
                })
              : null;

            const entitled = Math.max(Number(selectedPlan?.entitled_deliveries) || 1, 1);
            // Monthly prepaid: show effective per-week after plan discount on the pack
            const heroAmount =
              selectedPlan?.code === 'monthly' && charge
                ? charge.charge_amount / entitled
                : charge?.charge_amount ?? weeklyUnit;
            const heroSuffix =
              selectedPlan?.code === 'one_time' || entitled === 1 ? '/delivery' : '/week';

            const features = selectedPlan
              ? buildFeatures(selectedPlan, bucket.vegLabel)
              : [bucket.vegLabel, 'Free delivery'];

            return (
              <div
                key={bucket.planId}
                className={`rounded-3xl p-8 relative ${
                  bucket.popular
                    ? 'bg-white border-2 border-green-600 shadow-xl ring-4 ring-green-100 scale-105'
                    : 'bg-gray-50 border border-gray-100'
                }`}
              >
                {bucket.popular && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <div className="bg-orange-500 text-white px-4 py-2 rounded-full text-sm font-semibold flex items-center space-x-1 shadow-md">
                      <Star className="h-4 w-4 fill-current" />
                      <span>Most Popular</span>
                    </div>
                  </div>
                )}

                <div className="text-center mb-6">
                  <h3 className="text-2xl font-bold mb-2 text-gray-900">{bucket.name}</h3>
                  {bucket.description && (
                    <p className="text-gray-600 mb-4">{bucket.description}</p>
                  )}

                  <div className="space-y-2 mb-4">
                    <div className="inline-flex items-center space-x-2 px-4 py-2 rounded-full bg-green-100 text-green-700">
                      <Package className="h-5 w-5" />
                      <span className="font-semibold">{bucket.vegLabel}</span>
                    </div>
                  </div>

                  <div
                    className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 mb-5 py-3 px-3 rounded-2xl bg-white border border-gray-200 shadow-sm"
                    role="radiogroup"
                    aria-label={`${bucket.name} billing plan`}
                  >
                    {billingPlans.map((opt) => {
                      const pct = Number(opt.prepaid_discount_pct) || 0;
                      const fixed = Number(opt.prepaid_discount_fixed) || 0;
                      const showSave = pct > 0 || fixed > 0;
                      return (
                        <label
                          key={opt.id}
                          className="flex items-center gap-2 cursor-pointer select-none text-sm font-medium text-gray-800"
                        >
                          <input
                            type="radio"
                            name={`billing-${bucket.planId}`}
                            value={opt.code}
                            checked={selectedCode === opt.code}
                            onChange={() =>
                              setBillingByBucket((prev) => ({
                                ...prev,
                                [bucket.planId]: opt.code,
                              }))
                            }
                            className="h-4 w-4 accent-green-600"
                          />
                          <span>{opt.name}</span>
                          {showSave && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-800">
                              Save
                              {pct > 0 ? ` ${pct}%` : ''}
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>

                  <div className="flex items-baseline justify-center">
                    <span className="text-lg mr-1 text-gray-600">LKR</span>
                    <span className="text-5xl font-bold text-gray-900">
                      {Math.round(heroAmount).toLocaleString()}
                    </span>
                    <span className="text-lg ml-2 text-gray-600">{heroSuffix}</span>
                  </div>

                  <p className="text-sm mt-2 text-gray-500">
                    {selectedPlan ? billedCaption(selectedPlan.code) : ''}
                  </p>
                </div>

                <ul className="space-y-4 mb-8">
                  {features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-start space-x-3">
                      <Check className="h-5 w-5 mt-0.5 text-green-600 flex-shrink-0" />
                      <span className="text-gray-700">{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  disabled={submittingPlanId != null}
                  onClick={() => void handleStartSubscription(bucket, selectedCode)}
                  className="w-full py-4 px-6 rounded-full font-semibold transition-all duration-200 bg-green-600 text-white hover:bg-green-700 shadow-md disabled:opacity-60 disabled:cursor-wait"
                >
                  {submittingPlanId === bucket.planId
                    ? 'Saving…'
                    : user?.subscription && user.subscription.status !== 'cancelled'
                      ? `Switch to ${selectedPlan?.name ?? 'this plan'}`
                      : `Select ${selectedPlan?.name ?? 'Bucket'}`}
                </button>
              </div>
            );
          })}
        </div>

        <div className="text-center space-y-4 mt-8">
          <p className="text-gray-600">
            Prices and plan options update from the catalog — no redeploy needed when Admin
            changes plans or discounts.
          </p>
          <p className="text-sm text-gray-500">
            Cycles do not auto-renew · Pause anytime
          </p>
        </div>
      </div>
    </section>
  );
};

export default Pricing;
