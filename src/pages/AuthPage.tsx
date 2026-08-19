import React, { useState, useEffect } from 'react';
import { Mail, Lock, User, Phone, MapPin, Eye, EyeOff, Loader2, Shield, X } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth, PASSWORD_RECOVERY_KEY } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { validatePhone, validatePassword, validatePasswordConfirm, restrictToDigits, PHONE_DIGITS } from '../utils/validation';

type DeliveryCity = { name: string; available: boolean };

function readIsPasswordResetFlow(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get('reset') === 'true') return true;
  try {
    return sessionStorage.getItem(PASSWORD_RECOVERY_KEY) === '1';
  } catch {
    return false;
  }
}

const AuthPage = () => {
  const initialReset = readIsPasswordResetFlow();
  const [isLogin, setIsLogin] = useState(!initialReset);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    name: '',
    phone: '',
    address: '',
    newPassword: '',
    confirmNewPassword: ''
  });

  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [isResetStep, setIsResetStep] = useState(initialReset);
  const [rememberMe, setRememberMe] = useState(true);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [showEmailChangeRequestedMessage, setShowEmailChangeRequestedMessage] = useState(false);
  const [isSignupSubmitting, setIsSignupSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [deliveryCities, setDeliveryCities] = useState<DeliveryCity[]>([]);
  const [cityModalOpen, setCityModalOpen] = useState(false);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [cityStep, setCityStep] = useState<'pick' | 'notify'>('pick');
  const [unavailableCity, setUnavailableCity] = useState<string | null>(null);
  const [notifyEmail, setNotifyEmail] = useState('');
  const [notifySubmitting, setNotifySubmitting] = useState(false);
  const [notifySuccess, setNotifySuccess] = useState(false);
  const [notifyError, setNotifyError] = useState('');
  const [citySearch, setCitySearch] = useState('');
  const [cityDropdownOpen, setCityDropdownOpen] = useState(false);

  const { user, login, signup, resetPassword, isLoading } = useAuth();

  const filteredCities = citySearch.trim()
    ? deliveryCities.filter((c) => c.name.toLowerCase().includes(citySearch.trim().toLowerCase()))
    : deliveryCities;
  const navigate = useNavigate();
  const location = useLocation();

  React.useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('reset') === 'true' || readIsPasswordResetFlow()) {
      setIsResetStep(true);
      setIsLogin(false);
      setIsForgotPassword(false);
      setCityModalOpen(false);
    }
    if (params.get('email_changed') === '1') {
      setIsLogin(true);
      setIsForgotPassword(false);
      setIsResetStep(false);
    }
    if (params.get('email_confirmed') === '1') {
      setIsLogin(true);
      setIsForgotPassword(false);
      setIsResetStep(false);
      setSuccessMessage('Email confirmed! Please sign in with your email and password.');
      setError('');
    }
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('leafy_email_change_requested') === '1') {
      sessionStorage.removeItem('leafy_email_change_requested');
      setShowEmailChangeRequestedMessage(true);
      setIsLogin(true);
      setIsForgotPassword(false);
      setIsResetStep(false);
    }
  }, [location.search]);

  // If AuthContext sets recovery flag after mount (PASSWORD_RECOVERY event), flip to set-password UI.
  React.useEffect(() => {
    const enterReset = () => {
      setIsResetStep(true);
      setIsLogin(false);
      setIsForgotPassword(false);
      setCityModalOpen(false);
    };
    if (readIsPasswordResetFlow()) enterReset();
    window.addEventListener('leafy-password-recovery', enterReset);
    return () => window.removeEventListener('leafy-password-recovery', enterReset);
  }, []);

  const isEmailChanged = React.useMemo(
    () =>
      new URLSearchParams(location.search).get('email_changed') === '1' || showEmailChangeRequestedMessage,
    [location.search, showEmailChangeRequestedMessage]
  );

  // Get the intended destination or default to subscription page
  const from = location.state?.from?.pathname || '/my-bucket';
  const adminRequired = location.state?.adminRequired || false;

  // If already signed in on /auth (e.g. opened auth while logged in), leave the Sign In form.
  // Signup confirm no longer leaves a session — see AuthContext.
  React.useEffect(() => {
    if (!user) return;
    if (isEmailChanged) return;
    if (isResetStep) return;
    navigate(from, { replace: true });
  }, [user, isEmailChanged, isResetStep, navigate, from]);


  // Load delivery cities when city modal might be shown
  useEffect(() => {
    if (!isLogin && deliveryCities.length === 0) {
      supabase.from('delivery_cities').select('name, available').order('name').then(({ data, error }) => {
        if (!error && data) setDeliveryCities(data as DeliveryCity[]);
      });
    }
  }, [isLogin, deliveryCities.length]);

  // When switching to signup, show city modal if no city selected; when switching to login, clear city
  useEffect(() => {
    if (isResetStep || isForgotPassword) {
      setCityModalOpen(false);
      return;
    }
    if (isLogin) {
      setSelectedCity(null);
      setCityStep('pick');
      setUnavailableCity(null);
      setNotifySuccess(false);
      setCitySearch('');
      setCityDropdownOpen(false);
    } else {
      setCityModalOpen(selectedCity === null);
    }
  }, [isLogin, isResetStep, isForgotPassword]);

  const showCityModal =
    !isLogin &&
    !isForgotPassword &&
    !isResetStep &&
    (cityStep === 'notify' || selectedCity === null || cityModalOpen);

  const closeCityModal = () => {
    setCityModalOpen(false);
    setCityStep('pick');
    setUnavailableCity(null);
    setNotifyEmail('');
    setNotifyError('');
    setNotifySuccess(false);
    setCitySearch('');
    setCityDropdownOpen(false);
    // Accidental Sign Up with no city yet → back to Sign In
    if (!selectedCity) {
      setIsLogin(true);
    }
  };

  const handleCitySelect = (city: DeliveryCity) => {
    setCitySearch('');
    setCityDropdownOpen(false);
    if (city.available) {
      setSelectedCity(city.name);
      setCityModalOpen(false);
      setCityStep('pick');
      setUnavailableCity(null);
    } else {
      setUnavailableCity(city.name);
      setCityStep('notify');
    }
  };

  const handleNotifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unavailableCity || !notifyEmail.trim()) return;
    setNotifySubmitting(true);
    const { error } = await supabase.from('delivery_notify_requests').insert({
      email: notifyEmail.trim().toLowerCase(),
      city_name: unavailableCity
    });
    setNotifySubmitting(false);
    if (error) {
      setNotifyError(error.message);
      return;
    }
    setNotifyError('');
    setNotifySuccess(true);
    setTimeout(() => {
      setCityModalOpen(false);
      setCityStep('pick');
      setUnavailableCity(null);
      setNotifyEmail('');
      setNotifySuccess(false);
      setIsLogin(true);
    }, 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    setFieldErrors({});

    if (isForgotPassword) {
      if (!formData.email) {
        setFieldErrors({ email: 'Email is required' });
        return;
      }
      const { success, error } = await resetPassword(formData.email);
      if (success) {
        setSuccessMessage('Password reset link sent! Please check your email.');
      } else {
        setFieldErrors({ email: error || 'Failed to send reset link' });
      }
      return;
    }

    if (isResetStep) {
      const errs: Record<string, string> = {};
      const pwdErr = validatePassword(formData.newPassword);
      if (pwdErr) errs.newPassword = pwdErr;
      const confirmErr = validatePasswordConfirm(formData.newPassword, formData.confirmNewPassword);
      if (confirmErr) errs.confirmNewPassword = confirmErr;
      if (Object.keys(errs).length) {
        setFieldErrors(errs);
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: formData.newPassword });
      if (error) {
        setFieldErrors({ newPassword: error.message });
      } else {
        // End recovery session — require a normal sign-in with the new password.
        try {
          await supabase.auth.signOut({ scope: 'global' });
        } catch {
          await supabase.auth.signOut({ scope: 'local' });
        }
        try {
          sessionStorage.removeItem(PASSWORD_RECOVERY_KEY);
        } catch {
          // ignore
        }
        setSuccessMessage('Password updated successfully! Please sign in with your new password.');
        setIsResetStep(false);
        setIsLogin(true);
        setFormData((prev) => ({
          ...prev,
          newPassword: '',
          confirmNewPassword: '',
          password: '',
          confirmPassword: ''
        }));
      }
      return;
    }

    if (isLogin) {
      const pwdErr = validatePassword(formData.password);
      if (pwdErr) {
        setFieldErrors({ password: pwdErr });
        return;
      }
      const { success, error } = await login(formData.email, formData.password, rememberMe);
      if (success) {
        navigate(from, { replace: true });
      } else {
        setFieldErrors({ password: error || 'Invalid credentials' });
      }
    } else {
      const errs: Record<string, string> = {};
      if (!formData.name.trim()) errs.name = 'Name is required';
      const phoneErr = validatePhone(formData.phone);
      if (phoneErr) errs.phone = phoneErr;
      const pwdErr = validatePassword(formData.password);
      if (pwdErr) errs.password = pwdErr;
      const confirmErr = validatePasswordConfirm(formData.password, formData.confirmPassword);
      if (confirmErr) errs.confirmPassword = confirmErr;
      if (Object.keys(errs).length) {
        setFieldErrors(errs);
        return;
      }

      setIsSignupSubmitting(true);
      try {
        const { success, error, data } = await signup(formData.email, formData.password, formData.name, formData.phone.trim(), rememberMe, selectedCity ?? undefined);
        if (success) {
          if (data?.session) {
            navigate('/my-bucket', { replace: true });
          } else {
            // No session means email confirmation is required
            setSuccessMessage('Account created! Please check your email to confirm your account.');
            setFormData({
              email: '',
              password: '',
              confirmPassword: '',
              name: '',
              phone: '',
              address: '',
              newPassword: '',
              confirmNewPassword: ''
            });
          }
        } else {
          const msg = error || 'Sign up failed';
          if (/already exists|already registered|sign in/i.test(msg)) {
            setFieldErrors({ email: msg });
            setError('');
          } else {
            setError(msg);
          }
        }
      } finally {
        setIsSignupSubmitting(false);
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFieldErrors(prev => ({ ...prev, [name]: '' }));
    if (name === 'phone') {
      setFormData(prev => ({ ...prev, phone: restrictToDigits(value, PHONE_DIGITS) }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };



  return (
    <div className="pt-20 min-h-screen bg-gradient-to-br from-green-50 via-white to-orange-50">
      {/* City selection modal */}
      {showCityModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className={`bg-white rounded-3xl shadow-xl max-w-lg w-full flex flex-col relative ${cityStep === 'pick' ? 'overflow-visible' : 'max-h-[90vh] overflow-hidden'}`}>
            <button
              type="button"
              onClick={closeCityModal}
              className="absolute top-4 right-4 z-10 p-2 rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-800"
              aria-label={selectedCity ? 'Close' : 'Close and go to Sign In'}
            >
              <X className="h-5 w-5" />
            </button>
            {cityStep === 'pick' ? (
              <>
                <div className="p-6 border-b border-gray-200 shrink-0 pr-14">
                  <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-green-600" />
                    Check delivery availability
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">Type your city name to see if we deliver to your area.</p>
                </div>
                <div className="p-4 relative shrink-0">
                  <div className="relative">
                    <input
                      type="text"
                      value={citySearch}
                      onChange={(e) => {
                        setCitySearch(e.target.value);
                        setCityDropdownOpen(true);
                      }}
                      onFocus={() => setCityDropdownOpen(true)}
                      onBlur={() => setTimeout(() => setCityDropdownOpen(false), 150)}
                      placeholder="Type to search city..."
                      className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500"
                      autoComplete="off"
                    />
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
                  </div>
                  {cityDropdownOpen && (
                    <ul
                      className="absolute z-[100] left-0 right-0 top-full mt-1 max-h-60 overflow-y-auto bg-white border-2 border-gray-200 rounded-xl shadow-xl py-1 list-none"
                      onMouseDown={(e) => e.preventDefault()}
                    >
                      {filteredCities.length === 0 ? (
                        <li className="px-4 py-3 text-sm text-gray-500">No matching city</li>
                      ) : (
                        filteredCities.map((city) => (
                          <li key={city.name}>
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => handleCitySelect(city)}
                              className={`w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center justify-between ${city.available ? 'text-gray-900' : 'text-amber-800'}`}
                            >
                              <span className="font-medium">{city.name}</span>
                              {!city.available && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">Coming soon</span>}
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </div>
                <div className="px-6 pb-5">
                  <button
                    type="button"
                    onClick={closeCityModal}
                    className="w-full py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-200 rounded-xl hover:bg-gray-50"
                  >
                    {selectedCity ? 'Cancel' : 'Close — back to Sign In'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="p-6 border-b border-gray-200 pr-14">
                  <h3 className="text-lg font-bold text-gray-900">Delivery not available yet</h3>
                  <p className="text-sm text-gray-600 mt-1">We don’t deliver to <strong>{unavailableCity}</strong> yet. Leave your email and we’ll notify you when we start.</p>
                </div>
                <form onSubmit={handleNotifySubmit} className="p-6 space-y-4">
                  <div>
                    <label htmlFor="notifyEmail" className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
                    <input
                      id="notifyEmail"
                      type="email"
                      value={notifyEmail}
                      onChange={(e) => { setNotifyEmail(e.target.value); setNotifyError(''); }}
                      className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent ${notifyError ? 'border-red-500' : 'border-gray-300'}`}
                      placeholder="you@example.com"
                      required
                    />
                    {notifyError && <p className="mt-1 text-sm text-red-600">{notifyError}</p>}
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => { setCityStep('pick'); setUnavailableCity(null); setNotifyEmail(''); setNotifyError(''); }}
                      className="px-4 py-2.5 border border-gray-300 rounded-xl font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={notifySubmitting}
                      className="flex-1 bg-green-600 text-white py-2.5 px-4 rounded-xl font-semibold hover:bg-green-700 disabled:opacity-70 flex items-center justify-center gap-2"
                    >
                      {notifySubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                      {notifySubmitting ? 'Submitting...' : notifySuccess ? 'We’ll notify you!' : 'Notify me'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      <div className="max-w-md lg:max-w-lg xl:max-w-xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="bg-white rounded-3xl shadow-xl p-6 relative">
          {/* Signup in progress: overlay with spinner until confirmation email is sent */}
          {isSignupSubmitting && !isLogin && !isForgotPassword && !isResetStep && (
            <div className="absolute inset-0 rounded-3xl bg-white/90 flex flex-col items-center justify-center z-10 space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-green-600" />
              <p className="text-gray-700 font-medium">Creating your account...</p>
              <p className="text-sm text-gray-500">Sending confirmation email</p>
            </div>
          )}

          {/* Header */}
          <div className="text-center mb-4">
            <h2 className="text-xl font-semibold text-gray-900 mb-1">
              {adminRequired ? 'Admin Access Required' : (
                isResetStep ? 'Set New Password' : (
                  isForgotPassword ? 'Reset Password' : (isLogin ? 'Welcome Back!' : 'Join Leafy Bucket')
                )
              )}
            </h2>
            <p className="text-sm text-gray-600">
              {adminRequired
                ? 'Please sign in with admin credentials to access the admin panel'
                : (isResetStep
                  ? 'Enter your new password below'
                  : (isForgotPassword
                    ? 'Enter your email to receive a password reset link'
                    : (isLogin
                      ? 'Sign in to manage your fresh vegetable subscription'
                      : 'Start your journey to healthier eating today'
                    )
                  )
                )
              }
            </p>
          </div>

          {/* Admin Required Banner */}
          {adminRequired && (
            <div className="mb-3 p-3 bg-orange-50 border-2 border-orange-200 rounded-xl">
              <div className="flex items-center space-x-3">
                <Shield className="h-5 w-5 text-orange-600" />
                <div>
                  <div className="font-semibold text-orange-900">Admin Access Required</div>
                  <div className="text-sm text-orange-700">
                    You need administrator privileges to access this area.
                  </div>
                </div>
              </div>
            </div>
          )}



          {/* General error (API / server messages) */}
          {error && (
            <div className="mb-3 p-3 bg-red-50 border-2 border-red-200 rounded-xl">
              <p className="text-sm text-red-800 text-center">{error}</p>
            </div>
          )}

          {/* Success Message */}
          {successMessage && (
            <div className="mb-3 p-3 bg-green-50 border-2 border-green-200 rounded-xl">
              <p className="text-sm text-green-800 text-center font-medium">{successMessage}</p>
            </div>
          )}

          {/* Email updated – sign in with new email */}
          {isEmailChanged && (
            <div className="mb-3 p-3 bg-green-50 border-2 border-green-200 rounded-xl">
              <p className="text-sm text-green-800 text-center font-medium">
                Your email has been updated. Please sign in with your new email address.
              </p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3">
            {isResetStep ? (
              <>
                <div>
                  <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1">
                    New Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      id="newPassword"
                      name="newPassword"
                      value={formData.newPassword}
                      onChange={(e) => {
                        setFieldErrors((prev) => ({ ...prev, newPassword: '', confirmNewPassword: '' }));
                        setFormData((prev) => ({ ...prev, newPassword: e.target.value }));
                      }}
                      className={`w-full pl-10 pr-12 py-2.5 border rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent ${fieldErrors.newPassword ? 'border-red-500' : 'border-gray-300'}`}
                      placeholder="Min. 6 characters"
                      required
                      minLength={6}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                  {fieldErrors.newPassword && <p className="mt-1 text-sm text-red-600">{fieldErrors.newPassword}</p>}
                  {!fieldErrors.newPassword && <p className="mt-1 text-xs text-gray-500">Min. 6 characters.</p>}
                </div>
                <div>
                  <label htmlFor="confirmNewPassword" className="block text-sm font-medium text-gray-700 mb-1">
                    Confirm New Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      id="confirmNewPassword"
                      name="confirmNewPassword"
                      value={formData.confirmNewPassword}
                      onChange={(e) => {
                        setFieldErrors((prev) => ({ ...prev, confirmNewPassword: '' }));
                        setFormData((prev) => ({ ...prev, confirmNewPassword: e.target.value }));
                      }}
                      className={`w-full pl-10 pr-12 py-2.5 border rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent ${fieldErrors.confirmNewPassword ? 'border-red-500' : 'border-gray-300'}`}
                      placeholder="Re-enter your new password"
                      required
                      minLength={6}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                  {fieldErrors.confirmNewPassword && (
                    <p className="mt-1 text-sm text-red-600">{fieldErrors.confirmNewPassword}</p>
                  )}
                </div>
              </>
            ) : (
              <>
                {!isForgotPassword && !isLogin && (
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                      Full Name <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <input
                        type="text"
                        id="name"
                        name="name"
                        value={formData.name}
                        onChange={handleInputChange}
                        className={`w-full pl-10 pr-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent ${fieldErrors.name ? 'border-red-500' : 'border-gray-300'}`}
                        placeholder="Enter your full name"
                        required={!isLogin && !isForgotPassword && !isResetStep}
                      />
                    </div>
                    {fieldErrors.name && <p className="mt-1 text-sm text-red-600">{fieldErrors.name}</p>}
                  </div>
                )}

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                    Email Address {!isLogin && !isForgotPassword && <span className="text-red-500">*</span>}
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      type="email"
                      id="email"
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      className={`w-full pl-10 pr-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent ${fieldErrors.email ? 'border-red-500' : 'border-gray-300'}`}
                      placeholder="Enter your email"
                      required
                    />
                  </div>
                  {fieldErrors.email && <p className="mt-1 text-sm text-red-600">{fieldErrors.email}</p>}
                </div>

                {!isForgotPassword && (
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                        Password {!isLogin && !isForgotPassword && <span className="text-red-500">*</span>}
                      </label>
                      {isLogin && (
                        <button
                          type="button"
                          onClick={() => setIsForgotPassword(true)}
                          className="text-sm text-green-600 hover:text-green-700 font-medium"
                        >
                          Forgot Password?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        id="password"
                        name="password"
                        value={formData.password}
                        onChange={handleInputChange}
                        className={`w-full pl-10 pr-12 py-2.5 border rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent ${fieldErrors.password ? 'border-red-500' : 'border-gray-300'}`}
                        placeholder="Enter your password"
                        required={!isForgotPassword && !isResetStep}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                    {fieldErrors.password && <p className="mt-1 text-sm text-red-600">{fieldErrors.password}</p>}
                    {!fieldErrors.password && !isResetStep && <p className="mt-1 text-xs text-gray-500">Min. 6 characters.</p>}
                  </div>
                )}

                {!isForgotPassword && !isLogin && (
                  <div>
                    <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                      Confirm Password <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        id="confirmPassword"
                        name="confirmPassword"
                        value={formData.confirmPassword}
                        onChange={handleInputChange}
                        className={`w-full pl-10 pr-12 py-2.5 border rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent ${fieldErrors.confirmPassword ? 'border-red-500' : 'border-gray-300'}`}
                        placeholder="Re-enter your password"
                        required
                        minLength={6}
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                    {fieldErrors.confirmPassword && (
                      <p className="mt-1 text-sm text-red-600">{fieldErrors.confirmPassword}</p>
                    )}
                  </div>
                )}

                {isLogin && !isForgotPassword && !isResetStep && (
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="rememberMe"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                    />
                    <label htmlFor="rememberMe" className="ml-2 block text-sm text-gray-700">
                      Remember me (stay signed in)
                    </label>
                  </div>
                )}

                {!isLogin && !isForgotPassword && (
                  <div>
                    <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                      Phone Number <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <input
                        type="tel"
                        id="phone"
                        name="phone"
                        value={formData.phone}
                        onChange={handleInputChange}
                        className={`w-full pl-10 pr-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent ${fieldErrors.phone ? 'border-red-500' : 'border-gray-300'}`}
                        placeholder="e.g. 0771234567"
                        required
                        maxLength={PHONE_DIGITS}
                        inputMode="numeric"
                        autoComplete="tel"
                      />
                    </div>
                    {fieldErrors.phone && <p className="mt-1 text-sm text-red-600">{fieldErrors.phone}</p>}
                    {!fieldErrors.phone && <p className="mt-1 text-xs text-gray-500">Exactly 10 digits (numbers only).</p>}
                  </div>
                )}
              </>
            )}

            <button
              type="submit"
              disabled={
                isSignupSubmitting ||
                (isLoading && !isResetStep) ||
                (!isLogin && !isForgotPassword && !isResetStep && !selectedCity)
              }
              className="w-full bg-green-600 text-white py-3 px-6 rounded-xl font-semibold hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              {(isLoading || isSignupSubmitting) ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>{isResetStep ? 'Updating...' : (isForgotPassword ? 'Sending...' : (isLogin ? 'Signing In...' : 'Creating account...'))}</span>
                </>
              ) : (
                <span>{isResetStep ? 'Update Password' : (isForgotPassword ? 'Send Reset Link' : (isLogin ? 'Sign In' : 'Create Account'))}</span>
              )}
            </button>
          </form>

          {/* Toggle Form */}
          {!adminRequired && (
            <div className="mt-4 text-center text-sm">
              {isResetStep ? (
                <button
                  onClick={() => {
                    setIsResetStep(false);
                    setIsLogin(true);
                    setError('');
                  }}
                  className="text-green-600 hover:text-green-700 font-semibold"
                >
                  Back to Sign In
                </button>
              ) : isForgotPassword ? (
                <button
                  onClick={() => {
                    setIsForgotPassword(false);
                    setError('');
                  }}
                  className="text-green-600 hover:text-green-700 font-semibold"
                >
                  Back to Sign In
                </button>
              ) : (
                <p className="text-gray-600">
                  {isLogin ? "Don't have an account?" : "Already have an account?"}
                  <button
                    onClick={() => {
                      setIsLogin(!isLogin);
                      setError('');
                      setFieldErrors({});
                      setFormData({
                        email: '',
                        password: '',
                        confirmPassword: '',
                        name: '',
                        phone: '',
                        address: '',
                        newPassword: '',
                        confirmNewPassword: ''
                      });
                    }}
                    className="ml-2 text-green-600 hover:text-green-700 font-semibold"
                  >
                    {isLogin ? 'Sign Up' : 'Sign In'}
                  </button>
                </p>
              )}
            </div>
          )}

          {/* Features */}
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-green-600">100%</div>
                <div className="text-xs text-gray-600">Fresh</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-orange-600">Free</div>
                <div className="text-xs text-gray-600">Delivery</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;