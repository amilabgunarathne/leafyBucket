import React from 'react';
import { X, CheckCircle2, AlertCircle } from 'lucide-react';

export interface MessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  variant?: 'success' | 'error';
  buttonText?: string;
}

const MessageModal: React.FC<MessageModalProps> = ({
  isOpen,
  onClose,
  title,
  message,
  variant = 'success',
  buttonText = 'OK',
}) => {
  if (!isOpen) return null;

  const isError = variant === 'error';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center px-4 py-8 text-center sm:block sm:p-0">
        <div
          className="fixed inset-0 bg-gray-500/75 backdrop-blur-sm transition-opacity"
          onClick={onClose}
          aria-hidden
        />

        <div
          className="relative inline-block w-full max-w-md overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="message-modal-title"
          aria-describedby="message-modal-desc"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              {isError ? (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
                  <AlertCircle className="h-6 w-6 text-red-600" aria-hidden />
                </div>
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100">
                  <CheckCircle2 className="h-6 w-6 text-green-600" aria-hidden />
                </div>
              )}
              <div>
                <h3
                  id="message-modal-title"
                  className="text-lg font-bold leading-6 text-gray-900"
                >
                  {title}
                </h3>
                <p id="message-modal-desc" className="mt-2 text-sm text-gray-600">
                  {message}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className={`rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                isError
                  ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
                  : 'bg-green-600 hover:bg-green-700 focus:ring-green-500'
              }`}
            >
              {buttonText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MessageModal;
