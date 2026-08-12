import React, { useState } from 'react';
import { ArrowLeft, User, Edit3, MapPin, Phone, Mail, Loader2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { validatePhone, restrictToDigits, PHONE_DIGITS } from '../utils/validation';
import {
  formatAddressDisplay,
  formatAddressLines,
  parseAddressToStructured,
  type StructuredAddress,
} from '../utils/addressForm';
import { supabase } from '../lib/supabase';

type DeliveryCity = { name: string; available: boolean };

const ProfilePage = () => {
  const { user, updateUser, updateEmail, logout } = useAuth();
  const navigate = useNavigate();
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileData, setProfileData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    phone: user?.phone || '',
  });
  const [addressForm, setAddressForm] = useState<StructuredAddress>(() =>
    parseAddressToStructured(user?.address, user?.city)
  );
  const [deliveryCities, setDeliveryCities] = useState<DeliveryCity[]>([]);
  const [profileEmailError, setProfileEmailError] = useState<string | null>(null);
  const [profileEmailSuccess, setProfileEmailSuccess] = useState<string | null>(null);
  const [profilePhoneError, setProfilePhoneError] = useState<string | null>(null);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  React.useEffect(() => {
    if (!user) {
      navigate('/auth', { state: { from: { pathname: '/profile' } } });
    }
  }, [user, navigate]);

  React.useEffect(() => {
    let cancelled = false;
    supabase
      .from('delivery_cities')
      .select('name, available')
      .order('name')
      .then(({ data }) => {
        if (!cancelled && data) setDeliveryCities(data as DeliveryCity[]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const resetFormsFromUser = React.useCallback(() => {
    if (!user) return;
    setProfileData({
      name: user.name || '',
      email: user.email || '',
      phone: user.phone || '',
    });
    setAddressForm(parseAddressToStructured(user.address, user.city));
  }, [user]);

  React.useEffect(() => {
    if (user) resetFormsFromUser();
  }, [
    user?.id,
    user?.name,
    user?.email,
    user?.phone,
    user?.address,
    user?.city,
    isEditingProfile,
    resetFormsFromUser,
  ]);

  const availableCities = deliveryCities.filter((c) => c.available);
  const cityOptions = React.useMemo(() => {
    const names = availableCities.map((c) => c.name);
    const current = addressForm.city.trim();
    if (current && !names.some((n) => n.toLowerCase() === current.toLowerCase())) {
      return [current, ...names];
    }
    return names;
  }, [availableCities, addressForm.city]);

  const handleProfileUpdate = async () => {
    if (!user) return;
    setProfileEmailError(null);
    setProfileEmailSuccess(null);
    setProfilePhoneError(null);
    setAddressError(null);
    setIsSavingProfile(true);
    const phoneError = validatePhone(profileData.phone);
    if (phoneError) {
      setProfilePhoneError(phoneError);
      setIsSavingProfile(false);
      return;
    }
    if (!addressForm.line1.trim()) {
      setAddressError('Street address is required.');
      setIsSavingProfile(false);
      return;
    }
    if (!addressForm.city.trim()) {
      setAddressError('City is required.');
      setIsSavingProfile(false);
      return;
    }

    const addressText = formatAddressLines(addressForm);
    const city = addressForm.city.trim();
    const emailChanged =
      profileData.email.trim().toLowerCase() !== (user.email || '').trim().toLowerCase();

    try {
      if (emailChanged) {
        const { success, error } = await updateEmail(profileData.email.trim());
        if (!success) {
          setProfileEmailError(error || 'Failed to send confirmation to new email.');
          return;
        }
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem('leafy_email_change_requested', '1');
        }
        updateUser({
          name: profileData.name,
          phone: profileData.phone.trim(),
          address: addressText,
          city,
        });
        logout();
        return;
      }

      updateUser({
        name: profileData.name,
        phone: profileData.phone.trim(),
        address: addressText,
        city,
      });
      setIsEditingProfile(false);
    } finally {
      setIsSavingProfile(false);
    }
  };

  if (!user) {
    return null;
  }

  const displayAddress =
    formatAddressDisplay(parseAddressToStructured(user.address, user.city)) ||
    'Not provided';

  return (
    <>
      {isSavingProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl p-8 flex flex-col items-center gap-4 shadow-xl">
            <Loader2 className="h-12 w-12 animate-spin text-green-600" />
            <p className="text-gray-700 font-medium">Saving...</p>
          </div>
        </div>
      )}

      <div className="pt-24 min-h-screen bg-gray-50">
        <div className="max-w-3xl xl:max-w-5xl 2xl:max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Link
            to="/my-bucket"
            className="inline-flex items-center space-x-2 text-green-600 hover:text-green-700 transition-colors mb-6"
          >
            <ArrowLeft className="h-5 w-5" />
            <span>Back to My Bucket</span>
          </Link>

          <div className="bg-white rounded-3xl shadow-lg p-8">
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-bold text-gray-900">Profile Information</h1>
              <button
                type="button"
                onClick={() => setIsEditingProfile(!isEditingProfile)}
                className="flex items-center space-x-2 text-green-600 hover:text-green-700 transition-colors"
              >
                <Edit3 className="h-4 w-4" />
                <span>{isEditingProfile ? 'Cancel' : 'Edit'}</span>
              </button>
            </div>

            {isEditingProfile ? (
              <div className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
                      <input
                        type="text"
                        value={profileData.name}
                        onChange={(e) => setProfileData((prev) => ({ ...prev, name: e.target.value }))}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Email Address
                      </label>
                      <input
                        type="email"
                        value={profileData.email}
                        onChange={(e) => {
                          setProfileData((prev) => ({ ...prev, email: e.target.value }));
                          setProfileEmailError(null);
                          setProfileEmailSuccess(null);
                        }}
                        className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent ${
                          profileEmailError ? 'border-red-500' : 'border-gray-300'
                        }`}
                        placeholder="you@example.com"
                      />
                      {profileEmailError && (
                        <p className="mt-1 text-sm text-red-600">{profileEmailError}</p>
                      )}
                      {profileEmailSuccess && (
                        <p className="mt-1 text-sm text-green-600">{profileEmailSuccess}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Phone Number <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="tel"
                        value={profileData.phone}
                        onChange={(e) => {
                          setProfileData((prev) => ({
                            ...prev,
                            phone: restrictToDigits(e.target.value, PHONE_DIGITS),
                          }));
                          setProfilePhoneError(null);
                        }}
                        className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent ${
                          profilePhoneError ? 'border-red-500' : 'border-gray-300'
                        }`}
                        placeholder="e.g. 0771234567"
                        required
                        maxLength={PHONE_DIGITS}
                        inputMode="numeric"
                      />
                      {profilePhoneError && (
                        <p className="mt-1 text-sm text-red-600">{profilePhoneError}</p>
                      )}
                      {!profilePhoneError && (
                        <p className="mt-1 text-xs text-gray-500">Exactly 10 digits (numbers only).</p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Delivery address
                      </label>
                      <p className="text-xs text-gray-500 mb-3">
                        City is linked from signup — change it only if you need delivery in another
                        available city.
                      </p>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Street address <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            autoComplete="address-line1"
                            value={addressForm.line1}
                            onChange={(e) => {
                              setAddressForm((prev) => ({ ...prev, line1: e.target.value }));
                              setAddressError(null);
                            }}
                            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
                            placeholder="House no., street, landmark"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Apartment / suite (optional)
                          </label>
                          <input
                            type="text"
                            autoComplete="address-line2"
                            value={addressForm.line2}
                            onChange={(e) =>
                              setAddressForm((prev) => ({ ...prev, line2: e.target.value }))
                            }
                            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
                            placeholder="Flat, building, floor"
                          />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              City <span className="text-red-500">*</span>
                            </label>
                            <select
                              value={addressForm.city}
                              onChange={(e) => {
                                setAddressForm((prev) => ({ ...prev, city: e.target.value }));
                                setAddressError(null);
                              }}
                              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
                            >
                              <option value="">Select city</option>
                              {cityOptions.map((name) => (
                                <option key={name} value={name}>
                                  {name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              Postal code (optional)
                            </label>
                            <input
                              type="text"
                              autoComplete="postal-code"
                              value={addressForm.postalCode}
                              onChange={(e) =>
                                setAddressForm((prev) => ({
                                  ...prev,
                                  postalCode: e.target.value.replace(/[^\d]/g, '').slice(0, 6),
                                }))
                              }
                              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
                              placeholder="e.g. 90100"
                              inputMode="numeric"
                            />
                          </div>
                        </div>
                      </div>
                      {addressError && (
                        <p className="mt-2 text-sm text-red-600">{addressError}</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex space-x-4">
                  <button
                    type="button"
                    onClick={handleProfileUpdate}
                    disabled={isSavingProfile}
                    className="bg-green-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-green-700 transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isSavingProfile && <Loader2 className="h-4 w-4 animate-spin" />}
                    {isSavingProfile ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingProfile(false);
                      setProfileEmailError(null);
                      setProfileEmailSuccess(null);
                      setProfilePhoneError(null);
                      setAddressError(null);
                      resetFormsFromUser();
                    }}
                    disabled={isSavingProfile}
                    className="border border-gray-300 text-gray-700 px-6 py-3 rounded-xl font-semibold hover:bg-gray-50 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="flex items-center space-x-3">
                      <User className="h-5 w-5 text-gray-600" />
                      <div>
                        <div className="text-sm text-gray-600">Full Name</div>
                        <div className="font-medium text-gray-900">{user.name}</div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <Mail className="h-5 w-5 text-gray-600" />
                      <div>
                        <div className="text-sm text-gray-600">Email Address</div>
                        <div className="font-medium text-gray-900">{user.email}</div>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center space-x-3">
                      <Phone className="h-5 w-5 text-gray-600" />
                      <div>
                        <div className="text-sm text-gray-600">Phone Number</div>
                        <div className="font-medium text-gray-900">
                          {user.phone || 'Not provided'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <MapPin className="h-5 w-5 text-gray-600 mt-0.5" />
                      <div>
                        <div className="text-sm text-gray-600">Delivery Address</div>
                        <div className="font-medium text-gray-900 whitespace-pre-line">
                          {displayAddress}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {(!user.phone || !user.address) && (
                  <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-4">
                    <p className="text-sm text-orange-800">
                      <strong>Complete your profile:</strong>{' '}
                      {!user.phone && !user.address
                        ? 'Please add your phone number and delivery address to ensure smooth delivery of your vegetables.'
                        : !user.phone
                          ? 'Please add your phone number (10 digits) to ensure we can contact you for delivery.'
                          : 'Please add your delivery address to ensure smooth delivery of your vegetables.'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default ProfilePage;
