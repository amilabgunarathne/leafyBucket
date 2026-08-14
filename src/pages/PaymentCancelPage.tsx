import { Link } from 'react-router-dom';
import { XCircle, ArrowRight, Package } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

/**
 * PayHere `cancel_url` — customer lands here if they cancel on PayHere.
 * Give PayHere: https://YOUR_DOMAIN/payment/cancel
 */
const PaymentCancelPage = () => {
  const { user } = useAuth();

  return (
    <div className="pt-24 min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 sm:px-6 py-16">
        <div className="bg-white rounded-3xl shadow-lg border border-amber-100 p-8 sm:p-10 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 text-amber-700 mb-6">
            <XCircle className="h-9 w-9" aria-hidden />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">Payment cancelled</h1>
          <p className="text-gray-600 leading-relaxed mb-8">
            No charge was completed. You can return to My Bucket and try again whenever you’re ready.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to={user ? '/my-bucket' : '/auth'}
              className="inline-flex items-center justify-center gap-2 bg-green-600 text-white px-6 py-3 rounded-full font-semibold hover:bg-green-700 transition-colors"
            >
              <Package className="h-5 w-5" />
              <span>{user ? 'Back to My Bucket' : 'Sign in'}</span>
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

export default PaymentCancelPage;
