/**
 * Utility to load and manage Razorpay Checkout SDK (checkout.js)
 */

declare global {
  interface Window {
    Razorpay?: any;
  }
}

export function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      return resolve(false);
    }

    if (window.Razorpay) {
      return resolve(true);
    }

    let resolved = false;
    const finish = (result: boolean) => {
      if (!resolved) {
        resolved = true;
        resolve(result);
      }
    };

    // Max 1500ms timeout so the UI never hangs even if Razorpay CDN is blocked
    const timer = setTimeout(() => {
      finish(Boolean(window.Razorpay));
    }, 1500);

    // Fast interval check for script readiness
    const interval = setInterval(() => {
      if (typeof window !== 'undefined' && window.Razorpay) {
        clearInterval(interval);
        clearTimeout(timer);
        finish(true);
      }
    }, 80);

    const existingScript = document.querySelector('script[src*="checkout.razorpay.com"]');
    if (!existingScript) {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => {
        clearInterval(interval);
        clearTimeout(timer);
        finish(Boolean(window.Razorpay));
      };
      script.onerror = () => {
        clearInterval(interval);
        clearTimeout(timer);
        finish(false);
      };
      document.body.appendChild(script);
    }
  });
}
