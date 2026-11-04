export type ToastTone = "info" | "success" | "warning" | "error";

export interface ToastItem {
    id: string;
    message: string;
    tone: ToastTone;
    timeout: number;
}

export interface ToastPushOptions {
    tone?: ToastTone;
    timeout?: number;
}

const toastsKey = "ruxt-toasts";
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export function useToast() {
    const toasts = useState<ToastItem[]>(toastsKey, () => []);

    const dismiss = (id: string) => {
        const timer = timers.get(id);
        if (timer) {
            clearTimeout(timer);
            timers.delete(id);
        }
        toasts.value = toasts.value.filter(toast => toast.id !== id);
    };

    const push = (message: string, opts: ToastPushOptions = {}): string => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const timeout = opts.timeout ?? 4000;
        toasts.value = [...toasts.value, { id, message, tone: opts.tone ?? "info", timeout }];
        if (typeof window !== "undefined" && timeout > 0) {
            timers.set(id, setTimeout(() => dismiss(id), timeout));
        }
        return id;
    };

    return { toasts, push, dismiss };
}
