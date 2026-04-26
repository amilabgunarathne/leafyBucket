import React from 'react';
import { X, AlertTriangle } from 'lucide-react';

export interface UnsavedLeaveModalProps {
  isOpen: boolean;
  onStay: () => void;
  onLeaveWithoutSaving: () => void;
  onSaveAndLeave: () => void | Promise<void>;
  canSave: boolean;
  saveBusy: boolean;
}

const UnsavedLeaveModal: React.FC<UnsavedLeaveModalProps> = ({
  isOpen,
  onStay,
  onLeaveWithoutSaving,
  onSaveAndLeave,
  canSave,
  saveBusy,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center px-4 py-8 text-center sm:block sm:p-0">
        <div
          className="fixed inset-0 bg-gray-500/75 backdrop-blur-sm transition-opacity"
          onClick={onStay}
          aria-hidden
        />

        <div
          className="relative inline-block w-full max-w-md overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="unsaved-leave-title"
          aria-describedby="unsaved-leave-desc"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
                <AlertTriangle className="h-6 w-6 text-amber-600" aria-hidden />
              </div>
              <div>
                <h3 id="unsaved-leave-title" className="text-lg font-bold leading-6 text-gray-900">
                  Unsaved changes
                </h3>
                <p id="unsaved-leave-desc" className="mt-2 text-sm text-gray-600">
                  You have changes that are not saved yet. If you leave now, those updates will be lost.
                  {!canSave && (
                    <span className="mt-2 block text-amber-800">
                      Customization is closed for this week—you can’t save, only stay or leave without saving.
                    </span>
                  )}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onStay}
              className="shrink-0 rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
            <button
              type="button"
              onClick={onStay}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
            >
              Stay on this page
            </button>
            <button
              type="button"
              onClick={onLeaveWithoutSaving}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
            >
              Leave without saving
            </button>
            {canSave ? (
              <button
                type="button"
                disabled={saveBusy}
                onClick={() => void onSaveAndLeave()}
                className="rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saveBusy ? 'Saving…' : 'Save preferences'}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UnsavedLeaveModal;
