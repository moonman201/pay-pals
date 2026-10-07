/**
 * The parts of the PayPal JS SDK v6 this app touches. The SDK ships no types.
 * Script: https://www.sandbox.paypal.com/web-sdk/v6/core
 */
export {};

declare global {
  interface PayPalEligibleMethods {
    isEligible(method: "paypal" | "venmo"): boolean;
  }

  interface PayPalSessionOptions {
    onApprove: (data: { orderId: string; payerId?: string }) => void | Promise<void>;
    onCancel?: (data: unknown) => void;
    onError?: (error: { code?: string; message?: string }) => void;
  }

  interface PayPalPaymentSession {
    start(options: { presentationMode: "auto" | "popup" | "modal" | "redirect" }, order: Promise<{ orderId: string }>): Promise<void>;
  }

  interface PayPalSdkInstance {
    findEligibleMethods(query: { currencyCode: string; amount?: string }): Promise<PayPalEligibleMethods>;
    createPayPalOneTimePaymentSession(options: PayPalSessionOptions): PayPalPaymentSession;
    createVenmoOneTimePaymentSession(options: PayPalSessionOptions): PayPalPaymentSession;
  }

  interface Window {
    paypal?: {
      createInstance(options: { clientId?: string; clientToken?: string; components: string[]; pageType?: string; locale?: string }): Promise<PayPalSdkInstance>;
    };
  }

  namespace React {
    namespace JSX {
      interface IntrinsicElements {
        "paypal-button": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { type?: string };
        "venmo-button": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { type?: string };
      }
    }
  }
}
