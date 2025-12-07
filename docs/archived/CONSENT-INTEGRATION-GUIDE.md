# Student Registration - Consent Integration Guide

## Quick Integration Steps

Follow these 4 steps to integrate Data Privacy Consent and Terms & Conditions into the student registration:

---

## Step 1: Add State Variables

**Location:** After line 39 (after `const [showPrivacy, setShowPrivacy] = useState(false);`)

**Add these two lines:**
```tsx
const [termsAccepted, setTermsAccepted] = useState(false);
const [privacyAccepted, setPrivacyAccepted] = useState(false);
```

---

## Step 2: Update Consent UI (Replace existing checkbox)

**Location:** Lines 914-919 (the existing consent checkbox section)

**Replace this:**
```tsx
<div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg border border-gray-100">
    <input type="checkbox" required id="consent" className="mt-1 h-4 w-4 text-brand-600 focus:ring-brand-500 border-gray-300 rounded" />
    <label htmlFor="consent" className="text-xs text-gray-600">
        I agree to the <button type="button" onClick={() => setShowTerms(true)} className="text-blue-600 underline hover:text-blue-800">Terms and Conditions</button> and <button type="button" onClick={() => setShowPrivacy(true)} className="text-blue-600 underline hover:text-blue-800">Data Privacy Policy</button> of the university.
    </label>
</div>
```

**With this:**
```tsx
{/* Consent Checkboxes */}
<div className="space-y-3">
    {/* Data Privacy Consent */}
    <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
        <input 
            type="checkbox" 
            id="privacy-consent"
            checked={privacyAccepted}
            onChange={(e) => {
                if (e.target.checked) {
                    setShowPrivacy(true);
                } else {
                    setPrivacyAccepted(false);
                }
            }}
            className="mt-1 h-4 w-4 text-brand-600 focus:ring-brand-500 border-gray-300 rounded"
        />
        <label htmlFor="privacy-consent" className="text-sm text-gray-700 flex-1">
            I have read and accept the{' '}
            <button 
                type="button"
                onClick={() => setShowPrivacy(true)}
                className="text-brand-600 underline hover:text-brand-700 font-medium"
            >
                Data Privacy Notice
            </button>
            {' '}(Republic Act 10173)
            {privacyAccepted && <CheckCircle size={16} className="inline ml-2 text-green-600" />}
        </label>
    </div>

    {/* Terms & Conditions */}
    <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
        <input 
            type="checkbox" 
            id="terms-consent"
            checked={termsAccepted}
            onChange={(e) => {
                if (e.target.checked) {
                    setShowTerms(true);
                } else {
                    setTermsAccepted(false);
                }
            }}
            className="mt-1 h-4 w-4 text-brand-600 focus:ring-brand-500 border-gray-300 rounded"
        />
        <label htmlFor="terms-consent" className="text-sm text-gray-700 flex-1">
            I agree to the{' '}
            <button 
                type="button"
                onClick={() => setShowTerms(true)}
                className="text-brand-600 underline hover:text-brand-700 font-medium"
            >
                Terms and Conditions
            </button>
            {termsAccepted && <CheckCircle size={16} className="inline ml-2 text-green-600" />}
        </label>
    </div>

    {(!privacyAccepted || !termsAccepted) && (
        <p className="text-sm text-amber-600 flex items-center gap-2">
            <AlertCircle size={16} />
            You must accept both the Data Privacy Notice and Terms & Conditions to proceed.
        </p>
    )}
</div>
```

---

## Step 3: Add Validation to handleSubmit

**Location:** Line 299 (at the very beginning of handleSubmit function, after `e.preventDefault();`)

**Add this validation:**
```tsx
// Check consent acceptance
if (!privacyAccepted || !termsAccepted) {
    setError("You must accept the Data Privacy Notice and Terms & Conditions to proceed.");
    return;
}
```

---

## Step 4: Add Modal Components

**Location:** After line 950 (after the developer credits footer, before the final closing divs)

**Add these modals:**
```tsx
{/* Consent Modals */}
<DataPrivacyConsent 
    isOpen={showPrivacy}
    onClose={() => setShowPrivacy(false)}
    onAccept={() => {
        setPrivacyAccepted(true);
        setShowPrivacy(false);
    }}
/>

<TermsAndConditions
    isOpen={showTerms}
    onClose={() => setShowTerms(false)}
    onAccept={() => {
        setTermsAccepted(true);
        setShowTerms(false);
    }}
/>
```

---

## Testing Checklist

After making these changes, test:

- [ ] Checkboxes appear in Step 4
- [ ] Clicking checkbox opens modal
- [ ] Accept button in modal checks the checkbox
- [ ] Cancel button closes modal without checking
- [ ] Submit button shows error if not both accepted
- [ ] Green checkmark appears when accepted
- [ ] Warning message shows when not accepted
- [ ] Registration completes successfully when both accepted

---

## Visual Reference

**Before:** Simple checkbox with links
**After:** Two separate checkboxes with:
- Slate background cards
- Inline modal trigger buttons
- Green checkmarks when accepted
- Warning message when incomplete
