import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle, ArrowRight, Package } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

/**
 * PayHere `return_url` — customer lands here after completing checkout on PayHere.
 * No payment status is sent on this redirect; authoritative status comes via `notify_url`.
 * Give PayHere: https://YOUR_DOMAIN/payment/return
 */
const PaymentReturnPage = () => {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const orderId = params.get('order_id') || params.get('orderId') || null;

  return (
    <div className="pt-24 min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 sm:px-6 py-16">
        <div className="bg-white rounded-3xl shadow-lg border border-green-100 p-8 sm:p-10 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 text-green-700 mb-6">
            <CheckCircle className="h-9 w-9" aria-hidden />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">
            Thanks — you’re back from payment
          </h1>
          <p className="text-gray-600 leading-relaxed mb-2">
            If your payment succeeded, we’ll confirm it shortly and update your subscription.
            You can continue to My Bucket while that finishes.
          </p>
          {orderId && (
            <p className="text-sm text-gray-500 mb-6">
              Reference: <span className="font-mono text-gray-800">{orderId}</span>
            </p>
          )}
          {!orderId && <div className="mb-6" />}

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to={user ? '/my-bucket' : '/auth'}
              className="inline-flex items-center justify-center gap-2 bg-green-600 text-white px-6 py-3 rounded-full font-semibold hover:bg-green-700 transition-colors"
            >
              <Package className="h-5 w-5" />
              <span>{user ? 'Go to My Bucket' : 'Sign in'}</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/"
              className="inline-flex items-center justify-center gap-2 border-2 border-gray-200 text-gray-700 px-6 py-3 rounded-full font-semibold hover:bg-gray-50 transition-colors"
            >
              Back to home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentReturnPage;
